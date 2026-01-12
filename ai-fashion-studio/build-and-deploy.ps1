# AI Fashion Studio - 本地构建和部署脚本
# 这个脚本会在本地构建 Docker 镜像，然后上传到服务器部署

$ErrorActionPreference = "Stop"

# 配置变量
$SERVER_IP = "43.139.187.166"
$SERVER_USER = "root"
$SERVER_PATH = "/opt/ai-fashion-studio"
$PROJECT_ROOT = $PSScriptRoot
$NODE_IMAGE = "docker.m.daocloud.io/library/node:24-bookworm-slim"
$NEXT_PUBLIC_API_URL = "https://api.aizhao.icu"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AI Fashion Studio - 本地构建和部署" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
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
Write-Host "[2/7] 构建后端镜像..." -ForegroundColor Yellow
Set-Location "$PROJECT_ROOT\server"
Write-Host "正在构建 ai-fashion-server:latest..." -ForegroundColor Gray
docker build -t ai-fashion-server:latest -f Dockerfile --build-arg NODE_IMAGE=$NODE_IMAGE .
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 后端镜像构建失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 后端镜像构建成功" -ForegroundColor Green
Write-Host ""

# 步骤 3: 构建后端迁移镜像
Write-Host "[3/7] 构建后端迁移镜像..." -ForegroundColor Yellow
Set-Location "$PROJECT_ROOT\server"
Write-Host "正在构建 ai-fashion-server-migrator:latest..." -ForegroundColor Gray
docker build -t ai-fashion-server-migrator:latest --target migrator -f Dockerfile --build-arg NODE_IMAGE=$NODE_IMAGE .
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 后端迁移镜像构建失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 后端迁移镜像构建成功" -ForegroundColor Green
Write-Host ""

# 步骤 4: 构建前端镜像
Write-Host "[4/7] 构建前端镜像..." -ForegroundColor Yellow
Set-Location "$PROJECT_ROOT\client"
Write-Host "正在构建 ai-fashion-client:latest..." -ForegroundColor Gray
docker build -t ai-fashion-client:latest -f Dockerfile --build-arg NODE_IMAGE=$NODE_IMAGE --build-arg NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL .
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 前端镜像构建失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 前端镜像构建成功" -ForegroundColor Green
Write-Host ""

# 步骤 5: 保存镜像为文件
Write-Host "[5/7] 打包镜像..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
Write-Host "正在保存镜像为 ai-fashion-images.tar..." -ForegroundColor Gray
docker save -o ai-fashion-images.tar ai-fashion-server:latest ai-fashion-server-migrator:latest ai-fashion-client:latest
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 镜像打包失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 镜像打包成功" -ForegroundColor Green

# 显示文件大小
$fileSize = (Get-Item ai-fashion-images.tar).Length / 1MB
Write-Host "  文件大小: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Gray
Write-Host ""

# 步骤 6: 上传镜像到服务器
Write-Host "[6/7] 上传镜像到服务器..." -ForegroundColor Yellow
Write-Host "正在上传到 $SERVER_IP:$SERVER_PATH ..." -ForegroundColor Gray
scp ai-fashion-images.tar ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 上传失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 上传成功" -ForegroundColor Green
Write-Host ""

# 步骤 7: 在服务器上加载镜像并部署
Write-Host "[7/7] 服务器部署..." -ForegroundColor Yellow
ssh ${SERVER_USER}@${SERVER_IP} @"
cd ${SERVER_PATH}

# 检查生产环境配置文件
if [ ! -f deploy/.env.production ]; then
  echo "✗ 缺少 deploy/.env.production，请先在服务器创建该文件（可参考 deploy/.env.production.example）"
  exit 1
fi

# 兼容 docker compose / docker-compose
COMPOSE="docker-compose"
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
fi

# 停止并删除旧容器
echo "停止旧容器..."
`$COMPOSE -f deploy/docker-compose.prod.yml down

# 加载新镜像
echo "加载新镜像..."
docker load -i ai-fashion-images.tar

# 启动数据库
echo "启动 Postgres..."
`$COMPOSE -f deploy/docker-compose.prod.yml up -d postgres

# 执行迁移（幂等：没变更会直接成功）
echo "执行数据库迁移..."
`$COMPOSE -f deploy/docker-compose.prod.yml run --rm migrate

# 启动全部服务（server/client/caddy）
echo "启动服务..."
`$COMPOSE -f deploy/docker-compose.prod.yml up -d

# 清理镜像文件
rm -f ai-fashion-images.tar

echo ""
echo "部署完成！"
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

# 清理本地临时文件
Remove-Item ai-fashion-images.tar -Force

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
Write-Host "  ssh root@43.139.187.166 'cd /opt/ai-fashion-studio && docker-compose -f deploy/docker-compose.prod.yml logs -f'" -ForegroundColor White
