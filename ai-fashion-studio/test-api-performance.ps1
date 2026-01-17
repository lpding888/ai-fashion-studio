# API性能对比测试脚本
# 对比美国IP和新加坡域名的请求耗时和成功率

param(
    [int]$ConcurrentRequests = 3,
    [string]$TargetSizeMB = "20"
)

$ErrorActionPreference = "Continue"

# API配置
$US_ENDPOINT = "http://104.238.221.113:5002/v1/models/gemini-3-pro-image-preview:generateContent"
$SG_ENDPOINT = "http://xjb.aizhzo.com/v1/models/gemini-3-pro-image-preview:generateContent"
$API_KEY = "sk-QjZzF2FaEZpwjPl0Od1C1FHl4OHVDrFCJV8EqtU7sHjZX7wx"

# 请求体（生成图片）
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
Write-Host "API性能对比测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "配置:" -ForegroundColor Yellow
Write-Host "  并发请求数: $ConcurrentRequests" -ForegroundColor White
Write-Host "  目标数据量: $TargetSizeMB MB" -ForegroundColor White
Write-Host ""

function Test-Endpoint {
    param(
        [string]$Endpoint,
        [string]$Name,
        [int]$Concurrent
    )

    Write-Host "[$Name] 开始测试..." -ForegroundColor Yellow
    Write-Host "  端点: $Endpoint" -ForegroundColor Gray
    Write-Host ""

    $jobs = @()
    $startTime = Get-Date
    $results = [System.Collections.Generic.List[PSCustomObject]]::new()

    # 启动并发请求
    for ($i = 1; $i -le $Concurrent; $i++) {
        $jobId = $i
        $job = Start-Job -ScriptBlock {
            param($id, $endpoint, $apiKey, $body)

            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

            try {
                # 编码API Key以避免特殊字符问题
                $encodedApiKey = [System.Uri]::EscapeDataString($apiKey)
                $fullUrl = "$endpoint?key=$encodedApiKey"
                
                $response = Invoke-WebRequest -Uri $fullUrl `
                    -Method POST `
                    -ContentType "application/json" `
                    -Body $body `
                    -TimeoutSec 600 `
                    -ErrorAction Stop

                $stopwatch.Stop()

                # 检查响应大小
                $responseBody = $response.Content
                $sizeMB = [math]::Round($responseBody.Length / 1MB, 2)

                # 尝试解析JSON
                try {
                    $json = $responseBody | ConvertFrom-Json
                    $hasImage = $false

                    # 检查是否有图片数据（inlineData或fileData）
                    if ($json.candidates -and $json.candidates[0].content.parts) {
                        foreach ($part in $json.candidates[0].content.parts) {
                            if ($part.inlineData -or $part.fileData -or $part.inline_data) {
                                $hasImage = $true
                                break
                            }
                        }
                    }

                    return @{
                        Success = $true
                        RequestId = $id
                        StatusCode = $response.StatusCode
                        SizeMB = $sizeMB
                        ElapsedMS = $stopwatch.ElapsedMilliseconds
                        ElapsedSec = [math]::Round($stopwatch.ElapsedMilliseconds / 1000, 2)
                        HasImage = $hasImage
                        Error = $null
                    }
                } catch {
                    return @{
                        Success = $true
                        RequestId = $id
                        StatusCode = $response.StatusCode
                        SizeMB = $sizeMB
                        ElapsedMS = $stopwatch.ElapsedMilliseconds
                        ElapsedSec = [math]::Round($stopwatch.ElapsedMilliseconds / 1000, 2)
                        HasImage = $false
                        Error = "JSON解析失败: $($_.Exception.Message)"
                    }
                }
            } catch {
                $stopwatch.Stop()
                return @{
                    Success = $false
                    RequestId = $id
                    StatusCode = 0
                    SizeMB = 0
                    ElapsedMS = $stopwatch.ElapsedMilliseconds
                    ElapsedSec = [math]::Round($stopwatch.ElapsedMilliseconds / 1000, 2)
                    HasImage = $false
                    Error = $_.Exception.Message
                }
            }
        } -ArgumentList $jobId, $Endpoint, $API_KEY, $REQUEST_BODY

        $jobs += $job
    }

    # 等待所有任务完成
    $completedJobs = 0
    foreach ($job in $jobs) {
        $result = Receive-Job -Job $job -Wait
        $results.Add([PSCustomObject]$result)
        Remove-Job -Job $job
        $completedJobs++
        Write-Host "  [$completedJobs/$Concurrent] 请求 #$($result.RequestId) - $($result.StatusCode) - $($result.ElapsedSec)秒 - $($result.SizeMB)MB" -ForegroundColor Gray
    }

    $endTime = Get-Date
    $totalDuration = ($endTime - $startTime).TotalSeconds

    # 统计结果
    $successful = $results | Where-Object { $_.Success -eq $true -and $_.HasImage -eq $true }
    $failed = $results | Where-Object { $_.Success -eq $false -or $_.HasImage -eq $false }

    $successRate = if ($results.Count -gt 0) { [math]::Round(($successful.Count / $results.Count) * 100, 1) } else { 0 }
    $avgTime = if ($successful.Count -gt 0) { [math]::Round(($successful | Measure-Object -Property ElapsedSec -Average).Average, 2) } else { 0 }
    $minTime = if ($successful.Count -gt 0) { ($successful | Measure-Object -Property ElapsedSec -Minimum).Minimum } else { 0 }
    $maxTime = if ($successful.Count -gt 0) { ($successful | Measure-Object -Property ElapsedSec -Maximum).Maximum } else { 0 }
    $totalSizeMB = [math]::Round(($successful | Measure-Object -Property SizeMB -Sum).Sum, 2)
    $avgSizeMB = if ($successful.Count -gt 0) { [math]::Round(($successful | Measure-Object -Property SizeMB -Average).Average, 2) } else { 0 }

    Write-Host ""
    Write-Host "[$Name] 测试结果:" -ForegroundColor Green
    Write-Host "  总耗时: $([math]::Round($totalDuration, 2)) 秒" -ForegroundColor White
    Write-Host "  成功率: $successRate% ($($successful.Count)/$($results.Count))" -ForegroundColor White
    Write-Host "  总数据量: $totalSizeMB MB" -ForegroundColor White
    Write-Host "  平均大小: $avgSizeMB MB" -ForegroundColor White
    Write-Host "  平均耗时: $avgTime 秒" -ForegroundColor White
    Write-Host "  最快耗时: $minTime 秒" -ForegroundColor White
    Write-Host "  最慢耗时: $maxTime 秒" -ForegroundColor White
    Write-Host ""

    # 显示失败的请求
    if ($failed.Count -gt 0) {
        Write-Host "[$Name] 失败的请求:" -ForegroundColor Red
        foreach ($f in $failed) {
            Write-Host "  请求#$($f.RequestId): $($f.Error)" -ForegroundColor Red
        }
        Write-Host ""
    }

    return @{
        Name = $Name
        Endpoint = $Endpoint
        TotalDuration = $totalDuration
        SuccessCount = $successful.Count
        TotalCount = $results.Count
        SuccessRate = $successRate
        TotalSizeMB = $totalSizeMB
        AvgSizeMB = $avgSizeMB
        AvgTime = $avgTime
        MinTime = $minTime
        MaxTime = $maxTime
        Failed = $failed
        Results = $results
    }
}

# 测试美国IP
$usResult = Test-Endpoint -Endpoint $US_ENDPOINT -Name "美国IP (104.238.221.113:5002)" -Concurrent $ConcurrentRequests

# 等待一段时间再测试新加坡
Write-Host "等待 5 秒..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 测试新加坡域名
$sgResult = Test-Endpoint -Endpoint $SG_ENDPOINT -Name "新加坡域名 (xjb.aizhzo.com)" -Concurrent $ConcurrentRequests

# 对比结果
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "性能对比总结" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "                成功率    平均耗时    最快    最慢    总数据量" -ForegroundColor Yellow
Write-Host "  美国 IP:        $($usResult.SuccessRate)%      $($usResult.AvgTime)秒      $($usResult.MinTime)秒    $($usResult.MaxTime)秒    $($usResult.TotalSizeMB)MB" -ForegroundColor White
Write-Host "  新加坡:        $($sgResult.SuccessRate)%      $($sgResult.AvgTime)秒      $($sgResult.MinTime)秒    $($sgResult.MaxTime)秒    $($sgResult.TotalSizeMB)MB" -ForegroundColor White
Write-Host ""

# 计算性能提升
if ($usResult.AvgTime -gt 0 -and $sgResult.AvgTime -gt 0) {
    $improvement = [math]::Round((($usResult.AvgTime - $sgResult.AvgTime) / $usResult.AvgTime) * 100, 1)
    if ($improvement -gt 0) {
        Write-Host "✅ 新加坡比美国快 $improvement%" -ForegroundColor Green
    } elseif ($improvement -lt 0) {
        Write-Host "❌ 美国比新加坡快 $([math]::Abs($improvement))%" -ForegroundColor Red
    } else {
        Write-Host "⚖️  性能相当" -ForegroundColor Yellow
    }
}

if ($usResult.SuccessRate -gt 0 -and $sgResult.SuccessRate -gt 0) {
    $rateDiff = [math]::Round($sgResult.SuccessRate - $usResult.SuccessRate, 1)
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
