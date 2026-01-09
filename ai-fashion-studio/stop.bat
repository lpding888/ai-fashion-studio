@echo off
chcp 65001 >nul
title AI Fashion Studio - 停止服务

echo.
echo 正在停止所有 Node.js 服务...
echo.

taskkill /f /im node.exe >nul 2>&1

echo ✓ 所有服务已停止
echo.
pause
