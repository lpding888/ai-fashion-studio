@echo off
chcp 65001 >nul
title AI Fashion Studio - 启动中...

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║          AI Fashion Studio - 一键启动脚本                ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: ============ 端口占用检查和处理 ============
echo [0/3] 检查端口占用情况...
echo.

:: 检查并关闭 3000 端口
set PORT_3000_FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING" 2^>nul') do (
    set PORT_3000_FOUND=1
    echo ! 端口 3000 已被占用 (PID: %%a^)
    echo   正在关闭占用进程...
    taskkill /F /PID %%a >nul 2>&1
    if errorlevel 1 (
        echo   × 无法关闭，继续尝试启动...
    ) else (
        echo   ✓ 已关闭端口 3000 的占用进程
    )
)
if %PORT_3000_FOUND%==0 echo ✓ 端口 3000 空闲

:: 检查并关闭 5000 端口
set PORT_5000_FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING" 2^>nul') do (
    set PORT_5000_FOUND=1
    echo ! 端口 5000 已被占用 (PID: %%a^)
    echo   正在关闭占用进程...
    taskkill /F /PID %%a >nul 2>&1
    if errorlevel 1 (
        echo   × 无法关闭，继续尝试启动...
    ) else (
        echo   ✓ 已关闭端口 5000 的占用进程
    )
)
if %PORT_5000_FOUND%==0 echo ✓ 端口 5000 空闲

echo.
echo ✓ 端口检查完成
echo.
timeout /t 1 /nobreak >nul

:: ============ 启动服务 ============
echo [1/3] 启动后端服务器 (NestJS - Port 5000)...
start "AI Fashion Studio - Backend (5000)" cmd /k "cd server && npm run start:dev"

echo [2/3] 启动前端服务器 (Next.js - Port 3000)...
timeout /t 3 /nobreak >nul
start "AI Fashion Studio - Frontend (3000)" cmd /k "cd client && npm run dev"

echo [3/3] 等待服务启动...
timeout /t 5 /nobreak >nul

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║  ✓ 服务已启动！                                          ║
echo ║                                                          ║
echo ║  前端: http://localhost:3000                             ║
echo ║  后端: http://localhost:5000                             ║
echo ║                                                          ║
echo ║  登录页面: http://localhost:3000/login                   ║
echo ║  管理后台: http://localhost:3000/admin                   ║
echo ║                                                          ║
echo ║  关闭此窗口不会停止服务                                  ║
echo ║  要停止服务请运行 stop.bat 或关闭对应的命令行窗口       ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

:: 自动打开浏览器
start http://localhost:3000

echo 启动完成！按任意键退出启动器...
pause >nul
