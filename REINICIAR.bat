@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Reiniciar - Plataforma de Afiliados

echo  Parando o painel...
call "%~dp0PARAR.bat" >nul 2>&1
ping -n 3 127.0.0.1 >nul

echo  Subindo de novo (use isto sempre que editar o .env)...
start "Plataforma de Afiliados" cmd /c "%~dp0INICIAR.bat"
ping -n 5 127.0.0.1 >nul
