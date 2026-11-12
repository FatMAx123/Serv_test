@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Project Steam - Manual World Deploy (dist/client + Render)

echo ============================================================
echo   PROJECT STEAM: РУЧНОЙ ДЕПЛОЙ ИЗМЕНЕНИЙ МИРА
echo   1. Синхронизация shared/editor-overrides.json -^> client/data/
echo   2. Сборка чистого клиента в локальную папку dist/client/
echo   3. Публикация на сервер клиента Render.com (render-client)
echo ============================================================
echo.
set /p MSG="Комментарий деплоя (Enter для стандартного): "
if "%MSG%"=="" set MSG=World update from local GM editor

node scripts\deploy-world-client.js "%MSG%"
if errorlevel 1 (
  echo.
  echo [ERROR] Деплой завершился с ошибкой!
  pause
  exit /b 1
)
echo.
echo [DONE] Готово! Папка dist\client обновлена и задеплоена на Render.
pause

