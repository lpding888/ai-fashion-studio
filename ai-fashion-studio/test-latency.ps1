# API延迟和吞吐量测试（免费）
# 测试网络层面的延迟，不调用API生成图片

param(
    [int]$PingCount = 10
)

$ErrorActionPreference = "Continue"

# 目标主机
$US_HOST = "104.238.221.113"
$SG_HOST = "xjb.aizhzo.com"
$US_PORT = 5002
$SG_PORT = 80

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "网络延迟测试（免费）" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  注意：此脚本只测试网络延迟，不调用API" -ForegroundColor Yellow
Write-Host "⚠️  不会生成图片，不会产生费用" -ForegroundColor Yellow
Write-Host ""

function Test-Latency {
    param(
        [string]$Host,
        [int]$Port,
        [string]$Name
    )

    Write-Host "[$Name] 测试中..." -ForegroundColor Yellow

    $latencies = [System.Collections.Generic.List[int]]::new()
    $successful = 0

    for ($i = 1; $i -le $PingCount; $i++) {
        try {
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

            # TCP连接测试
            $tcpClient = New-Object System.Net.Sockets.TcpClient
            $connectResult = $tcpClient.BeginConnect($Host, $Port, $null, $null)
            $wait = $connectResult.AsyncWaitHandle.WaitOne(5000, $false)

            $stopwatch.Stop()

            if ($wait) {
                $tcpClient.EndConnect($connectResult)
                $tcpClient.Close()

                $latency = $stopwatch.ElapsedMilliseconds
                $latencies.Add($latency)
                $successful++

                Write-Host "  [$i/$PingCount] $latency ms" -ForegroundColor Gray
            } else {
                $tcpClient.Close()
                Write-Host "  [$i/$PingCount] 超时" -ForegroundColor Red
            }
        } catch {
            $stopwatch.Stop()
            Write-Host "  [$i/$PingCount] 失败: $($_.Exception.Message)" -ForegroundColor Red
        }

        Start-Sleep -Milliseconds 100
    }

    Write-Host ""

    if ($latencies.Count -gt 0) {
        $avgLatency = [math]::Round(($latencies | Measure-Object -Average).Average, 2)
        $minLatency = ($latencies | Measure-Object -Minimum).Minimum
        $maxLatency = ($latencies | Measure-Object -Maximum).Maximum
        $stdDev = if ($latencies.Count -gt 1) {
            $mean = ($latencies | Measure-Object -Average).Average
            [math]::Sqrt((($latencies | ForEach-Object { [math]::Pow($_ - $mean, 2) } | Measure-Object -Average).Average)
        } else { 0 }
        $stdDev = [math]::Round($stdDev, 2)
        $packetLoss = [math]::Round((($PingCount - $successful) / $PingCount) * 100, 1)

        Write-Host "[$Name] 统计结果:" -ForegroundColor Green
        Write-Host "  平均延迟: $avgLatency ms" -ForegroundColor White
        Write-Host "  最小延迟: $minLatency ms" -ForegroundColor White
        Write-Host "  最大延迟: $maxLatency ms" -ForegroundColor White
        Write-Host "  标准差: $stdDev ms" -ForegroundColor White
        Write-Host "  丢包率: $packetLoss%" -ForegroundColor White
        Write-Host ""

        return @{
            Name = $Name
            Host = $Host
            Port = $Port
            AvgLatency = $avgLatency
            MinLatency = $minLatency
            MaxLatency = $maxLatency
            StdDev = $stdDev
            PacketLoss = $packetLoss
            SuccessfulCount = $successful
            TotalCount = $PingCount
            Latencies = $latencies
        }
    } else {
        Write-Host "[$Name] 所有请求均失败" -ForegroundColor Red
        Write-Host ""

        return @{
            Name = $Name
            Host = $Host
            Port = $Port
            AvgLatency = 0
            MinLatency = 0
            MaxLatency = 0
            StdDev = 0
            PacketLoss = 100
            SuccessfulCount = 0
            TotalCount = $PingCount
            Latencies = @()
        }
    }
}

# 测试美国IP
$usResult = Test-Latency -Host $US_HOST -Port $US_PORT -Name "美国IP"

Write-Host ""

# 测试新加坡
$sgResult = Test-Latency -Host $SG_HOST -Port $SG_PORT -Name "新加坡"

# 对比结果
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "延迟对比" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "                平均延迟    最小    最大    丢包率    稳定性(标准差)" -ForegroundColor Yellow
Write-Host "  美国 IP:        $($usResult.AvgLatency)ms      $($usResult.MinLatency)ms    $($usResult.MaxLatency)ms    $($usResult.PacketLoss)%        $($usResult.StdDev)ms" -ForegroundColor White
Write-Host "  新加坡:        $($sgResult.AvgLatency)ms      $($sgResult.MinLatency)ms    $($sgResult.MaxLatency)ms    $($sgResult.PacketLoss)%        $($sgResult.StdDev)ms" -ForegroundColor White
Write-Host ""

if ($usResult.AvgLatency -gt 0 -and $sgResult.AvgLatency -gt 0) {
    $diff = $usResult.AvgLatency - $sgResult.AvgLatency
    if ($diff -gt 0) {
        $improvement = [math]::Round(($diff / $usResult.AvgLatency) * 100, 1)
        Write-Host "✅ 新加坡比美国快 $diff ms ($improvement%)" -ForegroundColor Green
    } elseif ($diff -lt 0) {
        $improvement = [math]::Round(([math]::Abs($diff) / $sgResult.AvgLatency) * 100, 1)
        Write-Host "❌ 美国比新加坡快 $([math]::Abs($diff)) ms ($improvement%)" -ForegroundColor Red
    } else {
        Write-Host "⚖️  延迟相当" -ForegroundColor Yellow
    }
}

if ($usResult.PacketLoss -ne $sgResult.PacketLoss) {
    if ($sgResult.PacketLoss -lt $usResult.PacketLoss) {
        Write-Host "✅ 新加坡更稳定（丢包率低 $($usResult.PacketLoss - $sgResult.PacketLoss)%）" -ForegroundColor Green
    } else {
        Write-Host "❌ 美国更稳定（丢包率低 $($sgResult.PacketLoss - $usResult.PacketLoss)%）" -ForegroundColor Red
    }
}

if ($usResult.StdDev -ne $sgResult.StdDev) {
    if ($sgResult.StdDev -lt $usResult.StdDev) {
        Write-Host "✅ 新加坡更稳定（波动小）" -ForegroundColor Green
    } else {
        Write-Host "❌ 美国更稳定（波动小）" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试完成（免费）" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
