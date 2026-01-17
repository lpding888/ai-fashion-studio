param(
  [switch]$SkipInstall,
  [switch]$SkipPrisma,
  [switch]$SkipDb,
  [switch]$KillPorts,
  [switch]$NoLaunch,
  [string]$ApiUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"

function Assert-CommandExists {
  param([Parameter(Mandatory = $true)][string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "未找到命令：$Name。请先安装并确保在 PATH 中可用。"
  }
}

function Assert-DockerEngineReady {
  try {
    docker info | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "docker info exited with code $LASTEXITCODE"
    }
  } catch {
    throw @"
Docker CLI 已安装，但当前无法连接 Docker Engine（常见原因：Docker Desktop 未启动/未安装，或 WSL2 引擎未就绪）。

请先确认：
1) 启动 Docker Desktop（右下角托盘显示 Running）
2) 在 PowerShell 里运行：docker version（应能看到 Client/Server）

如果你不想用 Docker 启动本地 Postgres：请改用 dev-start.ps1 -SkipDb，并确保 server/.env(.local) 的 DATABASE_URL 指向可用的 Postgres。
"@
  }
}

function Stop-ProcessByPort {
  param([Parameter(Mandatory = $true)][int]$Port)

  $pids = @()

  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    try {
      $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue |
        Sort-Object -Unique
    } catch {
      $pids = @()
    }
  }

  if (-not $pids -or $pids.Count -eq 0) {
    $lines = netstat -ano | Select-String -Pattern (":$Port\\s") | ForEach-Object { $_.Line }
    foreach ($line in $lines) {
      if ($line -match "\\sLISTENING\\s+(\\d+)$") {
        $pids += [int]$Matches[1]
      }
    }
    $pids = $pids | Sort-Object -Unique
  }

  foreach ($processId in $pids) {
    try {
      Write-Host "⚠️ 端口 $Port 被占用，尝试结束进程 PID=$processId ..."
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "✓ 已释放端口 $Port（PID=$processId）"
    } catch {
      Write-Host "× 无法结束 PID=$processId（端口 $Port）。请手动处理后重试。"
      throw
    }
  }
}

function Assert-PortFree {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [int]$TimeoutSeconds = 10
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $hasListener = $false
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
      $hasListener = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -gt 0
    } else {
      $hasListener = (netstat -ano | Select-String -Pattern (":$Port\\s") | Select-String -Pattern "LISTENING").Length -gt 0
    }
    if (-not $hasListener) { return }
    Start-Sleep -Milliseconds 200
  }

  throw "端口 $Port 仍被占用，无法启动（请关闭占用进程后重试）"
}

function Ensure-Postgres {
  param(
    [Parameter(Mandatory = $true)][string]$ContainerName,
    [Parameter(Mandatory = $true)][string]$VolumeName,
    [Parameter(Mandatory = $true)][string]$Image,
    [int]$Port = 5432,
    [int]$TimeoutSeconds = 60
  )

  $all = docker ps -a --format "{{.Names}}" | Out-String
  $exists = $all -split "`r?`n" | Where-Object { $_ -eq $ContainerName } | Select-Object -First 1

  if ($exists) {
    $running = (docker ps --format "{{.Names}}" | Out-String) -split "`r?`n" | Where-Object { $_ -eq $ContainerName } | Select-Object -First 1
    if (-not $running) {
      Write-Host "启动数据库容器：$ContainerName ..."
      docker start $ContainerName | Out-Null
    } else {
      Write-Host "✓ 数据库容器已在运行：$ContainerName"
    }
  } else {
    # 选一个可用的镜像（优先镜像源，其次本地/官方）
    $imageToUse = $Image
    try {
      docker image inspect $Image | Out-Null
    } catch {
      try {
        Write-Host "拉取 Postgres 镜像：$Image ..."
        docker pull $Image | Out-Null
      } catch {
        $fallback = "postgres:15-alpine"
        Write-Host "⚠️ 无法使用镜像 $Image，改用 $fallback（如需拉取请确保 Docker Hub 可访问）"
        $imageToUse = $fallback
      }
    }

    $volumes = docker volume ls --format "{{.Name}}" | Out-String
    $hasVolume = $volumes -split "`r?`n" | Where-Object { $_ -eq $VolumeName } | Select-Object -First 1
    if (-not $hasVolume) {
      Write-Host "创建数据库卷：$VolumeName ..."
      docker volume create $VolumeName | Out-Null
    }

    Write-Host "创建数据库容器：$ContainerName ..."
    docker run --name $ContainerName -d `
      -e "POSTGRES_USER=admin" `
      -e "POSTGRES_PASSWORD=password" `
      -e "POSTGRES_DB=fashion_studio" `
      -p "$Port`:5432" `
      -v "$VolumeName`:/var/lib/postgresql/data" `
      $imageToUse | Out-Null
  }

  Write-Host "等待 Postgres 就绪（最多 $TimeoutSeconds 秒）..."
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      docker exec $ContainerName pg_isready -U "admin" -d "fashion_studio" | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Postgres 已就绪"
        return
      }
    } catch {
      # ignore
    }
    Start-Sleep -Seconds 1
  }

  throw "Postgres 未在 $TimeoutSeconds 秒内就绪，请检查 docker logs $ContainerName"
}

$root = $PSScriptRoot

Write-Host ""
Write-Host "AI Fashion Studio - 本地一键启动（调试）"
Write-Host "Root: $root"
Write-Host ""

Assert-CommandExists "docker"
Assert-CommandExists "pnpm"

function Show-EnvFileInfo {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if (Test-Path $Path) {
    $item = Get-Item $Path
    Write-Host "✓ ${Label}: $($item.FullName)  (LastWriteTime=$($item.LastWriteTime))"
  } else {
    Write-Host "× ${Label}: not found ($Path)"
  }
}

$serverDir = Join-Path $root "server"
$clientDir = Join-Path $root "client"

Show-EnvFileInfo -Path (Join-Path $serverDir ".env") -Label "Server env"
Show-EnvFileInfo -Path (Join-Path $serverDir ".env.local") -Label "Server env.local"
Show-EnvFileInfo -Path (Join-Path $clientDir ".env.local") -Label "Client env.local (will be overridden for dev)"
Write-Host ""

if ($KillPorts) {
  Stop-ProcessByPort -Port 3000
  Stop-ProcessByPort -Port 3001
  Assert-PortFree -Port 3000 -TimeoutSeconds 10
  Assert-PortFree -Port 3001 -TimeoutSeconds 10
}

if (-not $SkipDb) {
  Assert-DockerEngineReady
  # 使用固定卷名，避免“数据看似丢了”其实是切换了卷/容器
  Ensure-Postgres `
    -ContainerName "ai_fashion_db" `
    -VolumeName "ai-fashion-studio_postgres_data" `
    -Image "docker.m.daocloud.io/library/postgres:15-alpine" `
    -Port 5432 `
    -TimeoutSeconds 60
}

if (-not (Test-Path $serverDir)) { throw "未找到后端目录：$serverDir" }
if (-not (Test-Path $clientDir)) { throw "未找到前端目录：$clientDir" }

if (-not $SkipInstall) {
  Write-Host "安装后端依赖（pnpm）..."
  pnpm -C $serverDir install

  Write-Host "安装前端依赖（pnpm）..."
  pnpm -C $clientDir install
}

if (-not $SkipPrisma) {
  Write-Host "Prisma generate..."
  pnpm -C $serverDir prisma:generate

  Write-Host "Prisma migrate deploy..."
  pnpm -C $serverDir prisma:migrate:deploy
}

Write-Host ""
Write-Host "启动后端（3001）..."
if ($NoLaunch) {
  Write-Host "✓ NoLaunch=true：跳过启动前后端进程（仅做依赖/数据库/Prisma 检查）"
  return
}

Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-NoExit",
  "-Command",
  "cd `"$serverDir`"; pnpm start:dev"
)

Write-Host "启动前端（3000），并指向后端：$ApiUrl ..."
Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-NoExit",
  "-Command",
  "`$env:NEXT_PUBLIC_API_URL=`"$ApiUrl`"; cd `"$clientDir`"; pnpm dev"
)

Write-Host ""
Write-Host "✓ 已启动："
Write-Host "  - 前端: http://localhost:3000"
Write-Host "  - 后端: http://localhost:3001/api/health"
Write-Host ""
