@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Plataforma de Afiliados - servidor
color 0A

if not exist "node_modules" (
  echo  Dependencias nao instaladas. Rode INSTALAR.bat primeiro.
  pause
  exit /b 1
)
if not exist ".env" copy /y ".env.example" ".env" >nul

REM Descobre a porta do .env (padrao 3010)
set PORTA=3010
for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
  if /i "%%a"=="APP_PORT" set PORTA=%%b
)

echo.
echo  ============================================================
echo    PLATAFORMA DE AFILIADOS
echo  ============================================================
echo    Painel: http://localhost:%PORTA%
echo.
echo    Deixe ESTA JANELA ABERTA enquanto usar o sistema.
echo    Para parar: feche a janela ou pressione Ctrl+C.
echo  ============================================================
echo.

REM Abre o navegador alguns segundos depois, ja com o servidor de pe
start "" cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:%PORTA%"

node src/server.js

echo.
echo  O servidor foi encerrado.
pause
