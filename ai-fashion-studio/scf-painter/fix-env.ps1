# 修复 .env.local 中的 PAINTER_API_URL 配置
# 将完整的 URL 改为基础 URL + 模型名称分离

$envFile = ".env.local"

if (!(Test-Path $envFile)) {
    Write-Host "❌ 找不到 .env.local 文件" -ForegroundColor Red
    exit 1
}

Write-Host "📝 读取当前配置..." -ForegroundColor Yellow

$content = Get-Content $envFile -Raw

# 备份
Copy-Item $envFile "$envFile.backup" -Force
Write-Host "✅ 已备份到 .env.local.backup" -ForegroundColor Green

# 修改 PAINTER_API_URL
$content = $content -replace 'PAINTER_API_URL=https://api\.vectorengine\.ai/v1/models/.*', 'PAINTER_API_URL=https://api.vectorengine.ai/v1'

# 如果没有 PAINTER_MODEL，添加它
if ($content -notmatch 'PAINTER_MODEL=') {
    $content += "`nPAINTER_MODEL=gemini-3-pro-image-preview"
    Write-Host "➕ 添加 PAINTER_MODEL 配置" -ForegroundColor Cyan
}
else {
    $content = $content -replace 'PAINTER_MODEL=.*', 'PAINTER_MODEL=gemini-3-pro-image-preview'
    Write-Host "🔄 更新 PAINTER_MODEL 配置" -ForegroundColor Cyan
}

# 保存
Set-Content $envFile $content -NoNewline

Write-Host "`n✅ 配置已更新！" -ForegroundColor Green
Write-Host "`n新配置：" -ForegroundColor Yellow
Write-Host "PAINTER_API_URL=https://api.vectorengine.ai/v1"
Write-Host "PAINTER_MODEL=gemini-3-pro-image-preview"

Write-Host "`n🚀 现在可以运行测试了：" -ForegroundColor Cyan
Write-Host "node quick-test.js" -ForegroundColor White
