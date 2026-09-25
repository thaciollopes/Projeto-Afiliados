@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Instalar - Plataforma de Afiliados
color 0B

echo.
echo  ============================================================
echo    INSTALACAO DA PLATAFORMA DE AFILIADOS
echo  ============================================================
echo.

REM ---------- 1) Node.js ----------
where node >nul 2>&1
if errorlevel 1 (
  echo  [ERRO] Node.js nao encontrado.
  echo  Baixe a versao LTS em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version') do set NODEVER=%%v
echo  [OK] Node.js %NODEVER%

REM ---------- 2) Dependencias ----------
echo.
echo  Instalando dependencias (pode demorar alguns minutos na primeira vez)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  [ERRO] Falha ao instalar dependencias. Veja a mensagem acima.
  pause
  exit /b 1
)
echo  [OK] Dependencias instaladas

REM ---------- 3) Arquivo .env ----------
echo.
if exist ".env" (
  echo  [OK] Arquivo .env ja existe ^(nao foi alterado^)
) else (
  copy /y ".env.example" ".env" >nul
  echo  [OK] Arquivo .env criado a partir do .env.example
  echo       Abra o .env depois para colocar suas chaves.
)

REM ---------- 4) Banco + dados de exemplo ----------
echo.
echo  Criando banco de dados...
call npm run seed
if errorlevel 1 (
  echo  [ERRO] Falha ao preparar o banco.
  pause
  exit /b 1
)

echo.
echo  ============================================================
echo    TUDO PRONTO
echo  ============================================================
echo.
echo    Proximo passo: de dois cliques em INICIAR.bat
echo.
echo    O sistema comeca em MODO SIMULACAO: nada e enviado no
echo    WhatsApp de verdade ate voce mudar DRY_RUN=false no .env.
echo.
pause
