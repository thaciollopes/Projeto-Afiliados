@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Recriar dados de exemplo

echo.
echo  Recria categorias, templates, produtos, cupons, promocoes,
echo  grupos e campanhas de DEMONSTRACAO.
echo  Nada existente e apagado: o que ja existe e mantido.
echo.
node scripts/seed.js
echo.
pause
