@echo off
setlocal

REM AI Fashion Studio - Local Dev Launcher (Windows)
REM - Starts Postgres (docker) + Prisma migrate
REM - Starts NestJS (3001) and Next.js (3000)
REM - Forces client API URL to http://localhost:3001

chcp 65001 >nul
cd /d "%~dp0"

echo [AI Fashion Studio] Starting local dev...
echo - Root: %cd%
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-start.ps1" -KillPorts %*

echo.
echo [AI Fashion Studio] Launcher finished (services run in separate windows).
pause >nul
