@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Backup - Plataforma de Afiliados

echo.
echo  Gerando backup (banco + JSON) em storage\backups ...
echo.
node scripts/backup.js
echo.
pause
