# AI Fashion Studio - 本地构建和部署脚本
# 这个脚本会在本地构建 Docker 镜像，然后上传到服务器部署

param(
    [switch]$BackendOnly,
    [switch]$ClientOnly,
    [switch]$CleanupLocalTar
)

$ErrorActionPreference = "Stop"

if ($BackendOnly -and $ClientOnly) {
    throw "参数冲突：-BackendOnly 与 -ClientOnly 不能同时使用"
}

# 配置变量
$SERVER_IP = "43.139.187.166"
$SERVER_USER = "ubuntu"
$SERVER_PATH = "/opt/ai-fashion-studio"
$SERVER_STAGING = "/home/ubuntu/ai-fashion-studio-upload"
$PROJECT_ROOT = $PSScriptRoot
$NODE_IMAGE = "docker.m.daocloud.io/library/node:24-bookworm-slim"
$NEXT_PUBLIC_API_URL = "https://api.aizhao.icu"

function Assert-LastExitCode([string]$What) {
    if ($LASTEXITCODE -ne 0) {
        throw $What
    }
}

function Upload-StagingFileWithResume(
    [Parameter(Mandatory = $true)][string]$LocalPath,
    [Parameter(Mandatory = $true)][string]$RemoteUserHost,
    [Parameter(Mandatory = $true)][string]$RemoteDir
) {
    if (-not (Test-Path -LiteralPath $LocalPath)) {
        throw "本地文件不存在: $LocalPath"
    }

    $fileName = [System.IO.Path]::GetFileName($LocalPath)
    $remotePath = "${RemoteDir}/${fileName}"

    $localSize = (Get-Item -LiteralPath $LocalPath).Length

    $remoteSizeRaw = ssh $RemoteUserHost "stat -c %s '$remotePath' 2>/dev/null || echo 0"
    Assert-LastExitCode "✗ 获取远端文件大小失败（$remotePath）"
    $remoteSize = 0
    [void][long]::TryParse(($remoteSizeRaw | Select-Object -First 1), [ref]$remoteSize)

    if ($remoteSize -eq $localSize -and $localSize -gt 0) {
        Write-Host "✓ 远端已存在完整文件（跳过上传）: $remotePath" -ForegroundColor Green
        return
    }

    if ($remoteSize -gt $localSize) {
        Write-Host "⚠️ 远端文件比本地更大，疑似脏数据，先删除后重传: $remotePath" -ForegroundColor Yellow
        ssh $RemoteUserHost "rm -f '$remotePath'"
        Assert-LastExitCode "✗ 删除远端脏文件失败（$remotePath）"
        $remoteSize = 0
    }

    $needResume = ($remoteSize -gt 0 -and $remoteSize -lt $localSize)
    $mode = if ($needResume) { "reput" } else { "put" }

    if ($needResume) {
        $mb = [math]::Round(($remoteSize / 1MB), 2)
        $mbTotal = [math]::Round(($localSize / 1MB), 2)
        Write-Host "检测到断点文件，使用 sftp reput 续传：$mb MB / $mbTotal MB" -ForegroundColor Yellow
    } else {
        $mbTotal = [math]::Round(($localSize / 1MB), 2)
        Write-Host "使用 sftp put 上传：$mbTotal MB" -ForegroundColor Gray
    }

    $batchFile = Join-Path $env:TEMP "ai-fashion-sftp-batch.txt"
    $batch = @(
        "cd $RemoteDir"
        "$mode `"$LocalPath`" `"$fileName`""
    ) -join "`n"
    Set-Content -LiteralPath $batchFile -Value $batch -Encoding ASCII

    try {
        sftp -b $batchFile $RemoteUserHost
        Assert-LastExitCode "✗ sftp 上传失败（$fileName）"
    } finally {
        Remove-Item -LiteralPath $batchFile -Force -ErrorAction SilentlyContinue
    }

    $remoteSizeAfterRaw = ssh $RemoteUserHost "stat -c %s '$remotePath' 2>/dev/null || echo 0"
    Assert-LastExitCode "✗ 校验远端文件大小失败（$remotePath）"
    $remoteSizeAfter = 0
    [void][long]::TryParse(($remoteSizeAfterRaw | Select-Object -First 1), [ref]$remoteSizeAfter)

    if ($remoteSizeAfter -ne $localSize) {
        throw "✗ 镜像上传不完整：local=$localSize remote=$remoteSizeAfter（$remotePath）"
    }

    Write-Host "✓ 镜像上传成功（已校验大小一致）" -ForegroundColor Green
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AI Fashion Studio - 本地构建和部署" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "参数: BackendOnly=$BackendOnly, ClientOnly=$ClientOnly, CleanupLocalTar=$CleanupLocalTar" -ForegroundColor Gray
Write-Host ""

# 步骤 1: 检查 Docker 是否运行
Write-Host "[1/7] 检查 Docker..." -ForegroundColor Yellow
try {
    docker version > $null
    Write-Host "✓ Docker 正在运行" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker 未运行，请先启动 Docker Desktop" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 步骤 2: 构建后端镜像
if (-not $ClientOnly) {
    Write-Host "[2/7] 构建后端镜像..." -ForegroundColor Yellow
    Set-Location (Join-Path $PROJECT_ROOT "server")
    Write-Host "正在构建 ai-fashion-server:latest..." -ForegroundColor Gray
    docker build -t "ai-fashion-server:latest" -f "Dockerfile" --build-arg "NODE_IMAGE=$NODE_IMAGE" "."
    Assert-LastExitCode "✗ 后端镜像构建失败"
    Write-Host "✓ 后端镜像构建成功" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[2/7] 跳过后端镜像（ClientOnly=true）" -ForegroundColor Gray
    Write-Host ""
}

# 步骤 3: 构建后端迁移镜像
if (-not $ClientOnly) {
    Write-Host "[3/7] 构建后端迁移镜像..." -ForegroundColor Yellow
    Set-Location (Join-Path $PROJECT_ROOT "server")
    Write-Host "正在构建 ai-fashion-server-migrator:latest..." -ForegroundColor Gray
    docker build -t "ai-fashion-server-migrator:latest" --target "migrator" -f "Dockerfile" --build-arg "NODE_IMAGE=$NODE_IMAGE" "."
    Assert-LastExitCode "✗ 后端迁移镜像构建失败"
    Write-Host "✓ 后端迁移镜像构建成功" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[3/7] 跳过后端迁移镜像（ClientOnly=true）" -ForegroundColor Gray
    Write-Host ""
}

# 步骤 4: 构建前端镜像（可选）
if (-not $BackendOnly) {
    Write-Host "[4/7] 构建前端镜像..." -ForegroundColor Yellow
    Set-Location (Join-Path $PROJECT_ROOT "client")
    Write-Host "正在构建 ai-fashion-client:latest..." -ForegroundColor Gray
    docker build -t "ai-fashion-client:latest" -f "Dockerfile" --build-arg "NODE_IMAGE=$NODE_IMAGE" --build-arg "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" "."
    Assert-LastExitCode "✗ 前端镜像构建失败"
    Write-Host "✓ 前端镜像构建成功" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[4/7] 跳过前端镜像（BackendOnly=true）" -ForegroundColor Gray
    Write-Host ""
}

# 步骤 5: 保存镜像为文件
Write-Host "[5/7] 打包镜像..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
Write-Host "正在保存镜像为 ai-fashion-images.tar..." -ForegroundColor Gray
$imagesToSave = @(
    "ai-fashion-server:latest",
    "ai-fashion-server-migrator:latest"
)
if ($ClientOnly) {
    $imagesToSave = @("ai-fashion-client:latest")
} elseif (-not $BackendOnly) {
    $imagesToSave += "ai-fashion-client:latest"
}
docker save -o "ai-fashion-images.tar" @imagesToSave
Assert-LastExitCode "✗ 镜像打包失败"
Write-Host "✓ 镜像打包成功" -ForegroundColor Green

# 显示文件大小
$fileSize = (Get-Item ai-fashion-images.tar).Length / 1MB
Write-Host "  文件大小: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Gray
Write-Host ""

# 步骤 6: 上传配置文件和镜像到服务器
Write-Host "[6/7] 上传配置文件和镜像到服务器..." -ForegroundColor Yellow

# 先创建 staging 目录（ubuntu 可写），再用 sudo 复制到 /opt
Write-Host "创建服务器 staging 目录..." -ForegroundColor Gray
ssh "${SERVER_USER}@${SERVER_IP}" "mkdir -p '${SERVER_STAGING}/deploy'"
Assert-LastExitCode "✗ 创建服务器 staging 目录失败"

# 上传部署配置文件
Write-Host "上传 deploy 目录配置文件..." -ForegroundColor Gray
scp (Join-Path $PROJECT_ROOT "deploy/docker-compose.prod.yml") "${SERVER_USER}@${SERVER_IP}:${SERVER_STAGING}/deploy/"
Assert-LastExitCode "✗ 上传 docker-compose.prod.yml 失败"
scp (Join-Path $PROJECT_ROOT "deploy/Caddyfile") "${SERVER_USER}@${SERVER_IP}:${SERVER_STAGING}/deploy/"
Assert-LastExitCode "✗ 上传 Caddyfile 失败"
scp (Join-Path $PROJECT_ROOT "deploy/.env.production.example") "${SERVER_USER}@${SERVER_IP}:${SERVER_STAGING}/deploy/"
Assert-LastExitCode "✗ 上传 .env.production.example 失败"
Write-Host "✓ 配置文件上传成功" -ForegroundColor Green

# 上传镜像
Write-Host "上传镜像到 ${SERVER_IP}:${SERVER_PATH} ..." -ForegroundColor Gray
Upload-StagingFileWithResume -LocalPath "ai-fashion-images.tar" -RemoteUserHost "${SERVER_USER}@${SERVER_IP}" -RemoteDir $SERVER_STAGING
Write-Host ""

# 步骤 7: 在服务器上加载镜像并部署
Write-Host "[7/7] 服务器部署..." -ForegroundColor Yellow

$restartTargets = if ($BackendOnly) { "server" } elseif ($ClientOnly) { "client caddy" } else { "server client caddy" }

$doMigrate = if ($ClientOnly) { "0" } else { "1" }


# 用“上传 deploy.sh 再执行”的方式，避免 Windows CRLF/复杂 quoting 导致远端 bash 解析失败
$deployScriptTemplate = @'
#!/usr/bin/env bash
set -euo pipefail

SERVER_PATH='__SERVER_PATH__'
SERVER_STAGING='__SERVER_STAGING__'
RESTART_TARGETS='__RESTART_TARGETS__'
DO_MIGRATE='__DO_MIGRATE__'

sudo mkdir -p "${SERVER_PATH}/deploy"
sudo cp -f "${SERVER_STAGING}/deploy/docker-compose.prod.yml" "${SERVER_PATH}/deploy/docker-compose.prod.yml"
sudo cp -f "${SERVER_STAGING}/deploy/Caddyfile" "${SERVER_PATH}/deploy/Caddyfile"
sudo cp -f "${SERVER_STAGING}/deploy/.env.production.example" "${SERVER_PATH}/deploy/.env.production.example"
sudo cp -f "${SERVER_STAGING}/ai-fashion-images.tar" "${SERVER_PATH}/ai-fashion-images.tar"
rm -rf "${SERVER_STAGING}"

if [ ! -f "${SERVER_PATH}/deploy/.env.production" ]; then
  echo "✗ 缺少 deploy/.env.production，请先在服务器创建该文件（参考 deploy/.env.production.example）"
  exit 1
fi

cd "${SERVER_PATH}"

if sudo docker compose version >/dev/null 2>&1; then
  dc(){ sudo docker compose "$@"; }
else
  dc(){ sudo docker-compose "$@"; }
fi

echo "加载新镜像..."
ROLLBACK_TAG="$(date +%Y%m%d%H%M%S)"
sudo mkdir -p "${SERVER_PATH}/rollback"
ROLLBACK_FILE="${SERVER_PATH}/rollback/rollback-${ROLLBACK_TAG}.txt"
ROLLBACK_TMP="$(mktemp)"

echo "备份当前镜像标签（用于回滚）..."
for img in ai-fashion-server ai-fashion-server-migrator ai-fashion-client; do
  if sudo docker image inspect "${img}:latest" >/dev/null 2>&1; then
    sudo docker tag "${img}:latest" "${img}:rollback-${ROLLBACK_TAG}"
    id="$(sudo docker image inspect "${img}:rollback-${ROLLBACK_TAG}" --format '{{.Id}}' 2>/dev/null || true)"
    echo "${img}:rollback-${ROLLBACK_TAG} ${id}" >> "${ROLLBACK_TMP}"
  else
    echo "${img}:latest (not found)" >> "${ROLLBACK_TMP}"
  fi
done

cat >> "${ROLLBACK_TMP}" <<EOF

Rollback commands:
  cd ${SERVER_PATH}
  sudo docker tag ai-fashion-server:rollback-${ROLLBACK_TAG} ai-fashion-server:latest
  sudo docker tag ai-fashion-server-migrator:rollback-${ROLLBACK_TAG} ai-fashion-server-migrator:latest
  sudo docker tag ai-fashion-client:rollback-${ROLLBACK_TAG} ai-fashion-client:latest
  sudo docker compose -f deploy/docker-compose.prod.yml up -d --force-recreate ${RESTART_TARGETS}
EOF

sudo cp -f "${ROLLBACK_TMP}" "${ROLLBACK_FILE}"
rm -f "${ROLLBACK_TMP}"

echo "✓ 回滚备案: ${ROLLBACK_FILE}"
sudo docker load -i "${SERVER_PATH}/ai-fashion-images.tar"

if [ "${DO_MIGRATE}" = "1" ]; then
  echo "启动 Postgres..."
  dc -f deploy/docker-compose.prod.yml up -d postgres

  echo "执行数据库迁移..."
  dc -f deploy/docker-compose.prod.yml run --rm migrate
fi

echo "启动/滚动更新服务..."
dc -f deploy/docker-compose.prod.yml up -d --force-recreate ${RESTART_TARGETS}

sudo rm -f "${SERVER_PATH}/ai-fashion-images.tar"

echo ""
echo "部署完成！"
echo "访问地址:"
echo "  前端: https://aizhao.icu"
echo "  后端: https://api.aizhao.icu"
'@

$deployScript = $deployScriptTemplate
$deployScript = $deployScript.Replace('__SERVER_PATH__', $SERVER_PATH)
$deployScript = $deployScript.Replace('__SERVER_STAGING__', $SERVER_STAGING)
$deployScript = $deployScript.Replace('__RESTART_TARGETS__', $restartTargets)
$deployScript = $deployScript.Replace('__DO_MIGRATE__', $doMigrate)

$tmpDeploy = Join-Path $env:TEMP "ai-fashion-deploy.sh"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tmpDeploy, ($deployScript -replace "`r`n", "`n"), $utf8NoBom)

Write-Host "上传并执行部署脚本 deploy.sh..." -ForegroundColor Gray
scp "$tmpDeploy" "${SERVER_USER}@${SERVER_IP}:${SERVER_STAGING}/deploy.sh"
Assert-LastExitCode "✗ 上传 deploy.sh 失败"
ssh "${SERVER_USER}@${SERVER_IP}" "bash '${SERVER_STAGING}/deploy.sh'"
Remove-Item $tmpDeploy -Force
Assert-LastExitCode "✗ 服务器部署失败"

# 清理本地临时文件
if ($CleanupLocalTar) {
    Remove-Item "ai-fashion-images.tar" -Force
    Write-Host "✓ 已清理本地镜像包 ai-fashion-images.tar" -ForegroundColor Green
} else {
    Write-Host "提示：本地镜像包保留为 ai-fashion-images.tar（如需自动清理，运行脚本时加 -CleanupLocalTar）" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "部署完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "访问地址:" -ForegroundColor Cyan
Write-Host "  前端: https://aizhao.icu" -ForegroundColor White
Write-Host "  后端: https://api.aizhao.icu" -ForegroundColor White
Write-Host ""
Write-Host "查看日志:" -ForegroundColor Cyan
Write-Host "  ssh ubuntu@43.139.187.166 'cd /opt/ai-fashion-studio && sudo docker compose -f deploy/docker-compose.prod.yml logs -f'" -ForegroundColor White
