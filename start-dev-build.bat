@echo off
rem Local dev build launcher (server + scene editor + model libraries).
rem Build first: node scripts\build-local.js --dev   (local only, never deployed)
rem ASCII only: cmd.exe misreads UTF-8 text in .bat files.
if not exist "%~dp0builds\start-dev.bat" (
  echo No dev build yet. Build it: node scripts\build-local.js --dev
  pause
  exit /b 1
)
call "%~dp0builds\start-dev.bat" %*
