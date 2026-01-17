# API性能对比测试 V3（顺序执行，最稳定）

$ErrorActionPreference = "Continue"

# API配置
$US_ENDPOINT = "http://104.238.221.113:5002"
$SG_ENDPOINT = "http://xjb.aizhzo.com"
$API_KEY = "sk-QjZzF2FaEZpwjPl0Od1C1FHl4OHVDrFCJV8EqtU7sHjZX7wx"
$MODEL = "gemini-3-pro-image-preview"

# 请求体
$REQUEST_BODY = @{
    contents = @(
        @{
            role = "user"
            parts = @(
                @{
                    text = "生成一张时尚照片，高质量的摄影作品"
                }
            )
        }
    )
    generationConfig = @{
        responseModalities = @("IMAGE")
        candidateCount = 1
        imageConfig = @{
            aspectRatio = "1:1"
            imageSize = "4K"
        }
    }
} | ConvertTo-Json -Depth 10

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "API性能对比测试 V3（顺序执行）" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "注意：顺序执行每个请求，确保稳定性和准确性" -ForegroundColor Yellow
Write-Host ""

function Test-SingleRequest {
    param(
        [string]$BaseEndpoint,
        [string]$Name,
        [int]$RequestId
    )
    
    $encodedApiKey = [System.Uri]::EscapeDataString($API_KEY)
    $url = "$BaseEndpoint/v1/models/$MODEL`:generateContent?key=$encodedApiKey"
    
    Write-Host "[$Name] 请求 #$RequestId 开始..." -ForegroundColor Yellow
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    
    try {
        $response = Invoke-WebRequest -Uri $url `
            -Method POST `
            -ContentType "application/json" `
            -Body $REQUEST_BODY `
            -TimeoutSec 600 `
            -ErrorAction Stop
        
        $stopwatch.Stop()
        
        $statusCode = $response.StatusCode
        $responseBody = $response.Content
        $sizeMB = [math]::Round($responseBody.Length / 1MB, 2)
        $elapsedSec = [math]::Round($stopwatch.ElapsedMilliseconds / 1000, 2)
        
        Write-Host "  ✅ 状态码: $statusCode" -ForegroundColor Green
        Write-Host "  ⏱️  耗时: $elapsedSec 秒" -ForegroundColor White
        Write-Host "  📦 数据大小: $sizeMB MB" -ForegroundColor White
        
        # 检查是否包含图片
        try {
            $json = $responseBody | ConvertFrom-Json
            $hasImage = $false
            
            if ($json.candidates -and $json.candidates[0].content.parts) {
                foreach ($part in $json.candidates[0].content.parts) {
                    if ($part.inlineData -or $part.fileData -or $part.inline_data) {
                        $hasImage = $true
                        Write-Host "  🖼️  包含图片: 是" -ForegroundColor Green
                        break
                    }
                }
            }
            
            if (-not $hasImage) {
                Write-Host "  ⚠️  包含图片: 否" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "  ⚠️  JSON解析失败" -ForegroundColor Yellow
        }
        
        Write-Host ""
        
        return @{
            Success = $true
            RequestId = $RequestId
            StatusCode = $statusCode
            SizeMB = $sizeMB
            ElapsedSec = $elapsedSec
            HasImage = $hasImage
            Error = $null
        }
    } catch {
        $stopwatch.Stop()
        $elapsedSec = [math]::Round($stopwatch.ElapsedMilliseconds / 1000, 2)
        
        Write-Host "  ❌ 请求失败" -ForegroundColor Red
        Write-Host "  ⏱️  耗时: $elapsedSec 秒" -ForegroundColor White
        Write-Host "  ❌ 错误: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        
        return @{
            Success = $false
            RequestId = $RequestId
            StatusCode = 0
            SizeMB = 0
            ElapsedSec = $elapsedSec
            HasImage = $false
            Error = $_.Exception.Message
        }
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试美国IP端点 (104.238.221.113:5002)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$usResults = @()
$usTotalTime = 0

for ($i = 1; $i -le 3; $i++) {
    $result = Test-SingleRequest -BaseEndpoint $US_ENDPOINT -Name "美国IP" -RequestId $i
    $usResults += $result
    $usTotalTime += $result.ElapsedSec
    
    if ($i -lt 3) {
        Write-Host "等待 3 秒..." -ForegroundColor Gray
        Start-Sleep -Seconds 3
    }
}

Write-Host "等待 5 秒后测试新加坡..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试新加坡域名端点 (xjb.aizhzo.com)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$sgResults = @()
$sgTotalTime = 0

for ($i = 1; $i -le 3; $i++) {
    $result = Test-SingleRequest -BaseEndpoint $SG_ENDPOINT -Name "新加坡" -RequestId $i
    $sgResults += $result
    $sgTotalTime += $result.ElapsedSec
    
    if ($i -lt 3) {
        Write-Host "等待 3 秒..." -ForegroundColor Gray
        Start-Sleep -Seconds 3
    }
}

# 统计美国结果
$usSuccessful = $usResults | Where-Object { $_.Success -eq $true -and $_.HasImage -eq $true }
$usSuccessRate = [math]::Round(($usSuccessful.Count / 3) * 100, 1)
$usAvgTime = if ($usSuccessful.Count -gt 0) { [math]::Round(($usSuccessful | Measure-Object -Property ElapsedSec -Average).Average, 2) } else { 0 }
$usMinTime = if ($usSuccessful.Count -gt 0) { ($usSuccessful | Measure-Object -Property ElapsedSec -Minimum).Minimum } else { 0 }
$usMaxTime = if ($usSuccessful.Count -gt 0) { ($usSuccessful | Measure-Object -Property ElapsedSec -Maximum).Maximum } else { 0 }
$usTotalSizeMB = [math]::Round(($usSuccessful | Measure-Object -Property SizeMB -Sum).Sum, 2)

# 统计新加坡结果
$sgSuccessful = $sgResults | Where-Object { $_.Success -eq $true -and $_.HasImage -eq $true }
$sgSuccessRate = [math]::Round(($sgSuccessful.Count / 3) * 100, 1)
$sgAvgTime = if ($sgSuccessful.Count -gt 0) { [math]::Round(($sgSuccessful | Measure-Object -Property ElapsedSec -Average).Average, 2) } else { 0 }
$sgMinTime = if ($sgSuccessful.Count -gt 0) { ($sgSuccessful | Measure-Object -Property ElapsedSec -Minimum).Minimum } else { 0 }
$sgMaxTime = if ($sgSuccessful.Count -gt 0) { ($sgSuccessful | Measure-Object -Property ElapsedSec -Maximum).Maximum } else { 0 }
$sgTotalSizeMB = [math]::Round(($sgSuccessful | Measure-Object -Property SizeMB -Sum).Sum, 2)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "性能对比总结" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "                成功率    平均耗时    最快    最慢    总数据量    总耗时" -ForegroundColor Yellow
Write-Host "  美国 IP:        $usSuccessRate%      $usAvgTime秒      $usMinTime秒    $usMaxTime秒    $usTotalSizeMB MB    $([math]::Round($usTotalTime, 2))秒" -ForegroundColor White
Write-Host "  新加坡:        $sgSuccessRate%      $sgAvgTime秒      $sgMinTime秒    $sgMaxTime秒    $sgTotalSizeMB MB    $([math]::Round($sgTotalTime, 2))秒" -ForegroundColor White
Write-Host ""

# 计算性能提升
if ($usAvgTime -gt 0 -and $sgAvgTime -gt 0) {
    $improvement = [math]::Round((($usAvgTime - $sgAvgTime) / $usAvgTime) * 100, 1)
    if ($improvement -gt 0) {
        Write-Host "✅ 新加坡比美国快 $improvement% (平均)" -ForegroundColor Green
    } elseif ($improvement -lt 0) {
        Write-Host "❌ 美国比新加坡快 $([math]::Abs($improvement))% (平均)" -ForegroundColor Red
    } else {
        Write-Host "⚖️  性能相当" -ForegroundColor Yellow
    }
}

if ($usTotalTime -gt 0 -and $sgTotalTime -gt 0) {
    $totalImprovement = [math]::Round((($usTotalTime - $sgTotalTime) / $usTotalTime) * 100, 1)
    if ($totalImprovement -gt 0) {
        Write-Host "✅ 新加坡比美国快 $totalImprovement% (总耗时)" -ForegroundColor Green
    } elseif ($totalImprovement -lt 0) {
        Write-Host "❌ 美国比新加坡快 $([math]::Abs($totalImprovement))% (总耗时)" -ForegroundColor Red
    } else {
        Write-Host "⚖️  总耗时相当" -ForegroundColor Yellow
    }
}

if ($usSuccessRate -gt 0 -and $sgSuccessRate -gt 0) {
    $rateDiff = [math]::Round($sgSuccessRate - $usSuccessRate, 1)
    if ($rateDiff -gt 0) {
        Write-Host "✅ 新加坡成功率高出 $rateDiff%" -ForegroundColor Green
    } elseif ($rateDiff -lt 0) {
        Write-Host "❌ 美国成功率高出 $([math]::Abs($rateDiff))%" -ForegroundColor Red
    } else {
        Write-Host "⚖️  成功率相当" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "💰 预计费用：" -ForegroundColor Yellow
Write-Host "   美国端点: $($usSuccessful.Count) 张4K图片" -ForegroundColor White
Write-Host "   新加坡端点: $($sgSuccessful.Count) 张4K图片" -ForegroundColor Gray
Write-Host "   总计: $($usSuccessful.Count + $sgSuccessful.Count) 张4K图片" -ForegroundColor Cyan
