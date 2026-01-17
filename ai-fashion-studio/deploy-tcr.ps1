# 腾讯云 TCR 部署脚本

$ErrorActionPreference = "Stop"

# ====== 配置区域 ======
# TCR 实例配置
$TCR_DOMAIN = "ccr.ccs.tencentyun.com"  # TCR 域名（广州）
$TCR_NAMESPACE = "ai-fashion-studio"  # TCR 命名空间

# 服务器配置
$SERVER_IP = "43.139.187.166"
$SERVER_USER = "root"
$SERVER_PATH = "/opt/ai-fashion-studio"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AI Fashion Studio - 腾讯云 TCR 部署" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 步骤 1: 登录 TCR
Write-Host "[1/6] 登录腾讯云 TCR..." -ForegroundColor Yellow
Write-Host "TCR 地址: $TCR_DOMAIN" -ForegroundColor Gray
Write-Host "请输入您的腾讯云 TCR 访问凭证" -ForegroundColor Gray
Write-Host "提示: 在 TCR 控制台的"访问凭证"中获取" -ForegroundColor Cyan
Write-Host ""

$username = Read-Host "TCR 用户名"
$password = Read-Host "TCR 密码" -AsSecureString
$passwordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

docker login $TCR_DOMAIN -u $username --password-stdin << $passwordPlain
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ TCR 登录失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 登录成功" -ForegroundColor Green
Write-Host ""

# 步骤 2: 给镜像打标签
Write-Host "[2/6] 给镜像打标签..." -ForegroundColor Yellow

$clientTag = "$TCR_DOMAIN/$TCR_NAMESPACE/ai-fashion-client:latest"
$serverTag = "$TCR_DOMAIN/$TCR_NAMESPACE/ai-fashion-server:latest"
$migratorTag = "$TCR_DOMAIN/$TCR_NAMESPACE/ai-fashion-server-migrator:latest"

Write-Host "ai-fashion-client:latest -> $clientTag" -ForegroundColor Gray
docker tag ai-fashion-client:latest $clientTag

Write-Host "ai-fashion-server:latest -> $serverTag" -ForegroundColor Gray
docker tag ai-fashion-server:latest $serverTag

Write-Host "ai-fashion-server-migrator:latest -> $migratorTag" -ForegroundColor Gray
docker tag ai-fashion-server-migrator:latest $migratorTag

Write-Host "✓ 打标签完成" -ForegroundColor Green
Write-Host ""

# 步骤 3: 推送镜像到 TCR
Write-Host "[3/6] 推送镜像到 TCR..." -ForegroundColor Yellow
Write-Host "这可能需要 10-30 分钟，取决于网络速度..." -ForegroundColor Gray

Write-Host "推送 client 镜像..." -ForegroundColor Gray
docker push $clientTag

Write-Host "推送 server 镜像..." -ForegroundColor Gray
docker push $serverTag

Write-Host "推送 migrator 镜像..." -ForegroundColor Gray
docker push $migratorTag

Write-Host "✓ 所有镜像推送完成" -ForegroundColor Green
Write-Host ""

# 步骤 4: 更新 docker-compose.prod.yml
Write-Host "[4/6] 更新 docker-compose.prod.yml..." -ForegroundColor Yellow

$composeFile = Join-Path $PSScriptRoot "deploy/docker-compose.prod.yml"
$composeContent = Get-Content $composeFile -Raw

$composeContent = $composeContent -replace 'image: ai-fashion-server:latest', "image: $serverTag"
$composeContent = $composeContent -replace 'image: ai-fashion-server-migrator:latest', "image: $migratorTag"
$composeContent = $composeContent -replace 'image: ai-fashion-client:latest', "image: $clientTag"

$composeContent | Set-Content $composeFile -Encoding UTF8
Write-Host "✓ 更新 docker-compose.prod.yml 镜像名称" -ForegroundColor Green
Write-Host ""

# 步骤 5: 上传配置文件到服务器
Write-Host "[5/6] 上传配置文件到服务器..." -ForegroundColor Yellow

# 创建服务器目录
ssh ${SERVER_USER}@${SERVER_IP} "mkdir -p ${SERVER_PATH}/deploy"

# 上传配置文件
scp $composeFile ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/deploy/
scp "$PSScriptRoot/deploy/.env.production" ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/deploy/
scp "$PSScriptRoot/deploy/Caddyfile" ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/deploy/

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 配置文件上传失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 配置文件上传完成" -ForegroundColor Green
Write-Host ""

# 步骤 6: 服务器登录 TCR 并部署
Write-Host "[6/6] 服务器登录 TCR 并部署..." -ForegroundColor Yellow

# 在服务器上登录 TCR
Write-Host "在服务器上登录 TCR..." -ForegroundColor Gray
ssh ${SERVER_USER}@${SERVER_IP} "echo '$passwordPlain' | docker login $TCR_DOMAIN -u $username --password-stdin"

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 服务器 TCR 登录失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 服务器登录成功" -ForegroundColor Green

# 在服务器上部署
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
Write-Host "TCR 镜像仓库:" -ForegroundColor Cyan
Write-Host "  $clientTag" -ForegroundColor White
Write-Host "  $serverTag" -ForegroundColor White
Write-Host "  $migratorTag" -ForegroundColor White
