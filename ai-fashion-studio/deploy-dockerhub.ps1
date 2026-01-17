# Docker Hub 部署脚本

$ErrorActionPreference = "Stop"

# ====== 配置区域 ======
$DOCKER_HUB_USERNAME = "your-dockerhub-username"  # 替换为您的 Docker Hub 用户名
$DOCKER_HUB_REPO_PREFIX = "your-dockerhub-username"  # 仓库名前缀，通常与用户名相同

$SERVER_IP = "43.139.187.166"
$SERVER_USER = "root"
$SERVER_PATH = "/opt/ai-fashion-studio"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AI Fashion Studio - Docker Hub 部署" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 步骤 1: 登录 Docker Hub
Write-Host "[1/5] 登录 Docker Hub..." -ForegroundColor Yellow
Write-Host "请输入 Docker Hub 用户名和密码（或 Access Token）" -ForegroundColor Gray
$username = Read-Host "Docker Hub 用户名"
$password = Read-Host "Docker Hub 密码" -AsSecureString
$passwordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

docker login -u $username --password-stdin << $passwordPlain
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Docker Hub 登录失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 登录成功" -ForegroundColor Green
Write-Host ""

# 更新仓库名前缀
$DOCKER_HUB_REPO_PREFIX = $username

# 步骤 2: 给镜像打标签
Write-Host "[2/5] 给镜像打标签..." -ForegroundColor Yellow

$clientTag = "$DOCKER_HUB_REPO_PREFIX/ai-fashion-client:latest"
$serverTag = "$DOCKER_HUB_REPO_PREFIX/ai-fashion-server:latest"
$migratorTag = "$DOCKER_HUB_REPO_PREFIX/ai-fashion-server-migrator:latest"

Write-Host "给 ai-fashion-client:latest 打标签 -> $clientTag" -ForegroundColor Gray
docker tag ai-fashion-client:latest $clientTag

Write-Host "给 ai-fashion-server:latest 打标签 -> $serverTag" -ForegroundColor Gray
docker tag ai-fashion-server:latest $serverTag

Write-Host "给 ai-fashion-server-migrator:latest 打标签 -> $migratorTag" -ForegroundColor Gray
docker tag ai-fashion-server-migrator:latest $migratorTag

Write-Host "✓ 打标签完成" -ForegroundColor Green
Write-Host ""

# 步骤 3: 推送镜像到 Docker Hub
Write-Host "[3/5] 推送镜像到 Docker Hub..." -ForegroundColor Yellow
Write-Host "这可能需要 10-30 分钟，取决于网络速度..." -ForegroundColor Gray

Write-Host "推送 client 镜像 ($clientTag)..." -ForegroundColor Gray
docker push $clientTag

Write-Host "推送 server 镜像 ($serverTag)..." -ForegroundColor Gray
docker push $serverTag

Write-Host "推送 migrator 镜像 ($migratorTag)..." -ForegroundColor Gray
docker push $migratorTag

Write-Host "✓ 所有镜像推送完成" -ForegroundColor Green
Write-Host ""

# 步骤 4: 更新服务器配置
Write-Host "[4/5] 更新服务器配置..." -ForegroundColor Yellow

# 更新 docker-compose.prod.yml 中的镜像名称
$composeFile = Join-Path $PSScriptRoot "deploy/docker-compose.prod.yml"
$composeContent = Get-Content $composeFile -Raw

$composeContent = $composeContent -replace 'image: ai-fashion-server:latest', "image: $serverTag"
$composeContent = $composeContent -replace 'image: ai-fashion-server-migrator:latest', "image: $migratorTag"
$composeContent = $composeContent -replace 'image: ai-fashion-client:latest', "image: $clientTag"

$composeContent | Set-Content $composeFile -Encoding UTF8
Write-Host "✓ 更新 docker-compose.prod.yml 镜像名称" -ForegroundColor Green

# 上传更新后的配置文件
scp $composeFile ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/deploy/
scp "$PSScriptRoot/deploy/.env.production" ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/deploy/
scp "$PSScriptRoot/deploy/Caddyfile" ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/deploy/

Write-Host "✓ 配置文件上传完成" -ForegroundColor Green
Write-Host ""

# 步骤 5: 服务器部署
Write-Host "[5/5] 服务器部署..." -ForegroundColor Yellow

ssh ${SERVER_USER}@${SERVER_IP} @"
cd ${SERVER_PATH}

# 兼容 docker compose / docker-compose
COMPOSE="docker-compose"
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
fi

# 拉取最新镜像
echo "拉取最新镜像..."
docker pull $clientTag
docker pull $serverTag
docker pull $migratorTag

# 停止并删除旧容器
echo "停止旧容器..."
`$COMPOSE -f deploy/docker-compose.prod.yml down

# 启动数据库
echo "启动 Postgres..."
`$COMPOSE -f deploy/docker-compose.prod.yml up -d postgres

# 执行迁移
echo "执行数据库迁移..."
`$COMPOSE -f deploy/docker-compose.prod.yml run --rm migrate

# 启动全部服务
echo "启动服务..."
`$COMPOSE -f deploy/docker-compose.prod.yml up -d

echo ""
echo "✅ 部署完成！"
echo ""
echo "访问地址:"
echo "  前端: https://aizhao.icu"
echo "  后端: https://api.aizhao.icu"
echo ""
echo "查看日志:"
echo "  docker-compose -f deploy/docker-compose.prod.yml logs -f"
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 服务器部署失败" -ForegroundColor Red
    exit 1
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
Write-Host "Docker Hub 镜像仓库:" -ForegroundColor Cyan
Write-Host "  $clientTag" -ForegroundColor White
Write-Host "  $serverTag" -ForegroundColor White
Write-Host "  $migratorTag" -ForegroundColor White
