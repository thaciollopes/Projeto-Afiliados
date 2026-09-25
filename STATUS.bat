@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Status - Plataforma de Afiliados
color 0B

set PORTA=3010
for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
  if /i "%%a"=="APP_PORT" set PORTA=%%b
)

echo.
echo  ============================================================
echo    STATUS DOS SERVICOS
echo  ============================================================
echo.
node scripts/health.js
echo.
echo  ------------------------------------------------------------
echo    Containers Docker:
docker ps --format "   {{.Names}}  ->  {{.Status}}" 2>nul
echo  ------------------------------------------------------------
echo.
pause
