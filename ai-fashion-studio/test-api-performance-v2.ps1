# API性能对比测试脚本 V2（简化版）

param(
    [int]$ConcurrentRequests = 3
)

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
Write-Host "API性能对比测试 V2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "配置: 并发请求数 = $ConcurrentRequests" -ForegroundColor Yellow
Write-Host ""

function Test-Endpoint {
    param(
        [string]$BaseEndpoint,
        [string]$Name,
        [int]$Concurrent
    )

    Write-Host "[$Name] 开始测试..." -ForegroundColor Yellow
    
    # 构建完整URL
    $encodedApiKey = [System.Uri]::EscapeDataString($API_KEY)
    $url = "$BaseEndpoint/v1/models/$MODEL`:generateContent?key=$encodedApiKey"
    
    Write-Host "  URL: $url" -ForegroundColor Gray
    Write-Host ""

    $startTime = Get-Date
    $results = [System.Collections.Generic.List[PSCustomObject]]::new()
    
    # 并发请求
    $tasks = @()
    for ($i = 1; $i -le $Concurrent; $i++) {
        $taskId = $i
        $task = [PowerShell]::Create().AddScript({
            param($id, $reqUrl, $reqBody)
            
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            
            try {
                $client = New-Object System.Net.Http.WebClient
                $client.Headers.Add("Content-Type", "application/json")
                $data = [System.Text.Encoding]::UTF8.GetBytes($reqBody)
                
                $response = $client.UploadData($reqUrl, "POST", $data)
                
                $stopwatch.Stop()
                
                $sizeMB = [math]::Round($response.Length / 1MB, 2)
                
                # 尝试解析JSON
                try {
                    $jsonString = [System.Text.Encoding]::UTF8.GetString($response)
                    $json = $jsonString | ConvertFrom-Json
                    
                    $hasImage = $false
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
                        SizeMB = $sizeMB
                        ElapsedSec = [math]::Round($stopwatch.ElapsedMilliseconds / 1000, 2)
                        HasImage = $hasImage
                        Error = $null
                        Response = $jsonString.Substring(0, [Math]::Min(200, $jsonString.Length))
                    }
                } catch {
                    return @{
                        Success = $true
                        RequestId = $id
                        SizeMB = $sizeMB
                        ElapsedSec = [math]::Round($stopwatch.ElapsedMilliseconds / 1000, 2)
                        HasImage = $false
                        Error = "JSON解析失败: $($_.Exception.Message)"
                        Response = ""
                    }
                }
            } catch {
                $stopwatch.Stop()
                return @{
                    Success = $false
                    RequestId = $id
                    SizeMB = 0
                    ElapsedSec = [math]::Round($stopwatch.ElapsedMilliseconds / 1000, 2)
                    HasImage = $false
                    Error = $_.Exception.Message
                    Response = ""
                }
            }
        }).AddParameters($taskId, $url, $REQUEST_BODY)
        
        $tasks += $task
    }
    
    # 等待所有任务完成
    $completedCount = 0
    foreach ($task in $tasks) {
        $result = $task.Invoke()
        $results.Add([PSCustomObject]$result)
        $task.Dispose()
        
        $completedCount++
        $status = if ($result.Success -and $result.HasImage) { "✅" } else { "❌" }
        Write-Host "  [$completedCount/$Concurrent] 请求 #${taskId} - $status - $($result.ElapsedSec)秒 - $($result.SizeMB)MB" -ForegroundColor Gray
        
        if (-not $result.Success) {
            Write-Host "    错误: $($result.Error)" -ForegroundColor Red
        }
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
    
    Write-Host ""
    Write-Host "[$Name] 测试结果:" -ForegroundColor Green
    Write-Host "  总耗时: $([math]::Round($totalDuration, 2)) 秒" -ForegroundColor White
    Write-Host "  成功率: $successRate% ($($successful.Count)/$($results.Count))" -ForegroundColor White
    Write-Host "  总数据量: $totalSizeMB MB" -ForegroundColor White
    Write-Host "  平均耗时: $avgTime 秒" -ForegroundColor White
    Write-Host "  最快耗时: $minTime 秒" -ForegroundColor White
    Write-Host "  最慢耗时: $maxTime 秒" -ForegroundColor White
    Write-Host ""
    
    return @{
        Name = $Name
        TotalDuration = $totalDuration
        SuccessCount = $successful.Count
        TotalCount = $results.Count
        SuccessRate = $successRate
        TotalSizeMB = $totalSizeMB
        AvgTime = $avgTime
        MinTime = $minTime
        MaxTime = $maxTime
    }
}

# 测试美国IP
$usResult = Test-Endpoint -BaseEndpoint $US_ENDPOINT -Name "美国IP (104.238.221.113:5002)" -Concurrent $ConcurrentRequests

Write-Host "等待 5 秒..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 测试新加坡域名
$sgResult = Test-Endpoint -BaseEndpoint $SG_ENDPOINT -Name "新加坡域名 (xjb.aizhzo.com)" -Concurrent $ConcurrentRequests

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
