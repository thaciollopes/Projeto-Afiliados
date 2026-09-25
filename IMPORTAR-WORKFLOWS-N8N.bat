@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Importar workflows no n8n
color 0E

echo.
echo  ============================================================
echo    IMPORTAR OS WORKFLOWS NO N8N
echo  ============================================================
echo.
node scripts/importar-workflows.js
echo.
pause
