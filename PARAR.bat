@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Parar - Plataforma de Afiliados

set PORTA=3010
for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
  if /i "%%a"=="APP_PORT" set PORTA=%%b
)

echo.
echo  Procurando o painel na porta %PORTA%...
set ACHOU=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORTA%" ^| findstr "LISTENING"') do (
  echo  Encerrando processo %%p...
  taskkill /PID %%p /F >nul 2>&1
  set ACHOU=1
)

if "%ACHOU%"=="0" echo  Nada rodando na porta %PORTA%.
if "%ACHOU%"=="1" echo  [OK] Painel encerrado.

echo.
echo  Os containers (n8n e WAHA) continuam no ar de proposito:
echo  outros projetos usam o mesmo n8n. Para parar so a WAHA deste
echo  projeto:  docker compose -f docker-compose.waha.yml down
echo.
ping -n 7 127.0.0.1 >nul
