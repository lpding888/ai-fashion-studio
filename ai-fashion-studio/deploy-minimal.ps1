# 最小化部署脚本 - 只包含源代码和配置文件

$projectRoot = "C:\Users\qq100\Desktop\生图项目\ai-fashion-studio"
$deployRoot = "C:\Users\qq100\Desktop\生图项目\ai-fashion-studio\deploy-minimal"

Write-Host "📦 创建最小化部署包..."

# 清理
if (Test-Path $deployRoot) {
    Remove-Item -Path $deployRoot -Recurse -Force
}

# 需要的文件和目录
$requiredDirs = @(
    "server/src",
    "server/package.json",
    "server/pnpm-lock.yaml",
    "server/nest-cli.json",
    "server/tsconfig.json",
    "server/tsconfig.build.json",
    "server/Dockerfile",
    "server/.env",
    "client/src",
    "client/package.json",
    "client/pnpm-lock.yaml",
    "client/next.config.ts",
    "client/tsconfig.json",
    "client/postcss.config.mjs",
    "client/eslint.config.mjs",
    "client/components.json",
    "client/Dockerfile",
    "deploy/docker-compose.prod.yml",
    "deploy/Caddyfile",
    "deploy/.env.production.example"
)

New-Item -ItemType Directory -Path $deployRoot -Force | Out-Null

# 复制文件
foreach ($item in $requiredDirs) {
    $src = Join-Path $projectRoot $item
    $dst = Join-Path $deployRoot $item
    
    if (Test-Path $src) {
        Write-Host "✓ $item" -ForegroundColor Green
        Copy-Item -Path $src -Destination $dst -Recurse -Force
    } else {
        Write-Host "✗ $item (不存在)" -ForegroundColor Red
    }
}

# 创建空的数据目录
New-Item -ItemType Directory -Path "$deployRoot\server\data" -Force | Out-Null
New-Item -ItemType Directory -Path "$deployRoot\server\uploads" -Force | Out-Null

Write-Host "`n✅ 最小化部署包创建完成！"
$size = [math]::Round((Get-ChildItem -Path $deployRoot -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 2)
Write-Host "📊 大小: $size MB"
Write-Host "📁 位置: $deployRoot"
