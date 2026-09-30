@echo off
setlocal
cd /d "%~dp0"
title Project Steam: Origins - Client Launcher

echo.
echo  ================================================================
echo    PROJECT STEAM: ORIGINS  --  LOCAL CLIENT LAUNCHER
echo    Local 3D Assets (Disk) + Cloud MMO Server (93.77.168.135)
echo  ================================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Node.js not found in PATH!
  echo  Please install Node.js LTS from https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo  [1/2] Checking local static server (port 3000)...
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  echo  Starting local static server on port 3000...
  start "Project Steam Client Server" /min cmd /c "node server\static-http.js"
  ping -n 3 127.0.0.1 >nul
) else (
  echo  Local static server is already running on port 3000.
)

echo.
echo  [2/2] Opening game client in browser:
echo    http://localhost:3000/menu.html?server=93.77.168.135
echo.
start http://localhost:3000/menu.html?server=93.77.168.135

exit /b 0
