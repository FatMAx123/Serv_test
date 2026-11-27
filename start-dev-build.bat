@echo off
chcp 65001 >nul
rem Запуск локальной дев-сборки (сервер + 3D-редактор + библиотеки моделей).
rem Собрать сборки: node scripts\build-local.js   (только локально, в продакшен не уходят)
if not exist "%~dp0builds\start-dev.bat" (
  echo Дев-сборки ещё нет. Соберите: node scripts\build-local.js --dev
  pause
  exit /b 1
)
call "%~dp0builds\start-dev.bat" %*
