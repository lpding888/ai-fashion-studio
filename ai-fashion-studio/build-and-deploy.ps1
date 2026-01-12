# AI Fashion Studio - 本地构建和部署脚本
# 这个脚本会在本地构建 Docker 镜像，然后上传到服务器部署

$ErrorActionPreference = "Stop"

# 配置变量
$SERVER_IP = "43.139.187.166"
$SERVER_USER = "root"
$SERVER_PATH = "/opt/ai-fashion-studio"
$PROJECT_ROOT = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AI Fashion Studio - 本地构建和部署" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 步骤 1: 检查 Docker 是否运行
Write-Host "[1/6] 检查 Docker..." -ForegroundColor Yellow
try {
    docker version > $null
    Write-Host "✓ Docker 正在运行" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker 未运行，请先启动 Docker Desktop" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 步骤 2: 构建后端镜像
Write-Host "[2/6] 构建后端镜像..." -ForegroundColor Yellow
Set-Location "$PROJECT_ROOT\server"
Write-Host "正在构建 ai-fashion-server:latest..." -ForegroundColor Gray
docker build -t ai-fashion-server:latest -f Dockerfile .
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 后端镜像构建失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 后端镜像构建成功" -ForegroundColor Green
Write-Host ""

# 步骤 3: 构建前端镜像
Write-Host "[3/6] 构建前端镜像..." -ForegroundColor Yellow
Set-Location "$PROJECT_ROOT\client"
Write-Host "正在构建 ai-fashion-client:latest..." -ForegroundColor Gray
docker build -t ai-fashion-client:latest -f Dockerfile .
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 前端镜像构建失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 前端镜像构建成功" -ForegroundColor Green
Write-Host ""

# 步骤 4: 保存镜像为文件
Write-Host "[4/6] 打包镜像..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
Write-Host "正在保存镜像为 ai-fashion-images.tar.gz..." -ForegroundColor Gray
docker save ai-fashion-server:latest ai-fashion-client:latest | gzip > ai-fashion-images.tar.gz
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 镜像打包失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 镜像打包成功" -ForegroundColor Green

# 显示文件大小
$fileSize = (Get-Item ai-fashion-images.tar.gz).Length / 1MB
Write-Host "  文件大小: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Gray
Write-Host ""

# 步骤 5: 上传镜像到服务器
Write-Host "[5/6] 上传镜像到服务器..." -ForegroundColor Yellow
Write-Host "正在上传到 $SERVER_IP:$SERVER_PATH ..." -ForegroundColor Gray
scp ai-fashion-images.tar.gz ${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 上传失败" -ForegroundColor Red
    exit 1
}
Write-Host "✓ 上传成功" -ForegroundColor Green
Write-Host ""

# 步骤 6: 在服务器上加载镜像并部署
Write-Host "[6/6] 服务器部署..." -ForegroundColor Yellow
ssh ${SERVER_USER}@${SERVER_IP} @"
cd ${SERVER_PATH}

# 停止并删除旧容器
echo "停止旧容器..."
docker-compose -f deploy/docker-compose.prod.yml down

# 加载新镜像
echo "加载新镜像..."
docker load < ai-fashion-images.tar.gz

# 启动新容器
echo "启动新容器..."
docker-compose -f deploy/docker-compose.prod.yml up -d

# 清理镜像文件
rm -f ai-fashion-images.tar.gz

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
Remove-Item ai-fashion-images.tar.gz -Force

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
