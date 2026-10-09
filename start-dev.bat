@echo off
rem Local test run on Windows (dev mode, no Postgres needed)
cd /d "%~dp0"
set ALLOW_INSECURE_DEV=1
set PORT=8080
echo Open in browser: http://localhost:8080
node server\server.js
pause
