@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Conectar Mercado Livre
color 0A

node scripts/autorizar-mercadolivre.js

echo.
pause
