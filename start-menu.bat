@echo off
setlocal
cd /d "%~dp0"
call "%~dp0start-client.bat"
exit /b %ERRORLEVEL%
