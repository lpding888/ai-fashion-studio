# API连通性测试脚本（免费）
# 只测试端点连通性，不生成图片，不会扣费

$ErrorActionPreference = "Continue"

# API配置
$US_ENDPOINT = "http://104.238.221.113:5002/v1/models/gemini-3-pro-image-preview:generateContent"
$SG_ENDPOINT = "http://xjb.aizhzo.com/v1/models/gemini-3-pro-image-preview:generateContent"
$API_KEY = "sk-QjZzF2FaEZpwjPl0Od1C1FHl4OHVDrFCJV8EqtU7sHjZX7wx"

# 测试请求体（只发送文本，不生成图片）
$TEST_BODY = @{
    contents = @(
        @{
            role = "user"
            parts = @(
                @{
                    text = "hello"  # 最小化请求，不生成图片
                }
            )
        }
    )
    generationConfig = @{
        responseModalities = @("TEXT")  # 只要文本，不要图片
        candidateCount = 1
        maxOutputTokens = 10  # 限制输出长度
    }
} | ConvertTo-Json -Depth 10

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "API连通性测试（免费）" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  注意：此脚本只测试连通性，不生成图片" -ForegroundColor Yellow
Write-Host "⚠️  不会生成图片，不会产生费用" -ForegroundColor Yellow
Write-Host ""

function Test-EndpointConnectivity {
    param(
        [string]$Endpoint,
        [string]$Name
    )

    Write-Host "[$Name] 测试中..." -ForegroundColor Yellow
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        $response = Invoke-WebRequest -Uri "$Endpoint?key=$API_KEY" `
            -Method POST `
            -ContentType "application/json" `
            -Body $TEST_BODY `
            -TimeoutSec 30 `
            -ErrorAction Stop

        $stopwatch.Stop()

        $statusCode = $response.StatusCode
        $elapsedMs = $stopwatch.ElapsedMilliseconds

        Write-Host "  ✅ 连接成功" -ForegroundColor Green
        Write-Host "  HTTP状态码: $statusCode" -ForegroundColor White
        Write-Host "  响应时间: $([math]::Round($elapsedMs, 0))ms" -ForegroundColor White
        Write-Host ""

        return @{
            Success = $true
            StatusCode = $statusCode
            ElapsedMs = $elapsedMs
            Error = $null
        }
    } catch {
        $stopwatch.Stop()
        $elapsedMs = $stopwatch.ElapsedMilliseconds

        Write-Host "  ❌ 连接失败" -ForegroundColor Red
        Write-Host "  错误: $($_.Exception.Message)" -ForegroundColor White
        Write-Host "  响应时间: $([math]::Round($elapsedMs, 0))ms" -ForegroundColor White
        Write-Host ""

        return @{
            Success = $false
            StatusCode = 0
            ElapsedMs = $elapsedMs
            Error = $_.Exception.Message
        }
    }
}

# 测试美国IP
$usResult = Test-EndpointConnectivity -Endpoint $US_ENDPOINT -Name "美国IP"

Start-Sleep -Seconds 2

# 测试新加坡
$sgResult = Test-EndpointConnectivity -Endpoint $SG_ENDPOINT -Name "新加坡域名"

# 对比结果
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "连通性对比" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "                状态    响应时间" -ForegroundColor Yellow
Write-Host "  美国 IP:        $([if($usResult.Success){"✅"}else{"❌"})       $($usResult.ElapsedMs)ms" -ForegroundColor White
Write-Host "  新加坡:        $([if($sgResult.Success){"✅"}else{"❌"})       $($sgResult.ElapsedMs)ms" -ForegroundColor White
Write-Host ""

if ($usResult.Success -and $sgResult.Success) {
    $diff = $usResult.ElapsedMs - $sgResult.ElapsedMs
    if ($diff -gt 0) {
        Write-Host "✅ 新加坡比美国快 $diff ms ($([math]::Round(($diff/$usResult.ElapsedMs)*100, 1))%)" -ForegroundColor Green
    } elseif ($diff -lt 0) {
        Write-Host "❌ 美国比新加坡快 $([math]::Abs($diff)) ms ($([math]::Round(([math]::Abs($diff)/$sgResult.ElapsedMs)*100, 1))%)" -ForegroundColor Red
    } else {
        Write-Host "⚖️  响应时间相当" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试完成（免费）" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
