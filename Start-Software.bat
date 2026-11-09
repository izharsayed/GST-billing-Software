@echo off
title GST Billing Software
echo ============================================================
echo   Starting GST Billing Software & Heat Load Engine...
echo ============================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not detected on this computer.
    echo Please download and install the free Node.js LTS from:
    echo https://nodejs.org/
    echo.
    echo Press any key to open the Node.js download page...
    pause >nul
    start https://nodejs.org/
    exit /b 1
)

echo Starting background service at http://localhost:47371 ...
start "" http://localhost:47371
node server.js
