@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Subir tudo - Afiliados (n8n + WAHA + painel)
color 0E

echo.
echo  ============================================================
echo    SUBINDO TUDO: Docker (n8n + WAHA) e o painel
echo  ============================================================
echo.

REM ---------- 1) Docker ----------
docker info >nul 2>&1
if not errorlevel 1 goto docker_ok

echo  Docker parado. Abrindo o Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo  Aguardando o Docker ficar pronto (ate ~3 min)...
set /a tentativas=0

:esperar
docker info >nul 2>&1
if not errorlevel 1 goto docker_ok
set /a tentativas+=1
if %tentativas% geq 36 goto docker_falhou
ping -n 6 127.0.0.1 >nul
goto esperar

:docker_falhou
echo  [AVISO] O Docker nao subiu a tempo. Vou seguir sem ele:
echo          o painel funciona, mas sem n8n/WAHA.
goto painel

:docker_ok
echo  [OK] Docker pronto.

REM ---------- 2) n8n (reaproveita o do projeto Projeton8n) ----------
docker ps --format "{{.Names}}" | findstr /i "ranch-n8n" >nul
if not errorlevel 1 goto n8n_ok
if not exist "C:\Projeto\Projeton8n\docker-compose.n8n.yml" goto n8n_sem_compose
echo  Subindo o n8n do projeto Projeton8n...
pushd "C:\Projeto\Projeton8n"
docker compose -f docker-compose.n8n.yml up -d
popd
goto waha

:n8n_sem_compose
echo  [AVISO] Nao achei o compose do n8n em C:\Projeto\Projeton8n.
goto waha

:n8n_ok
echo  [OK] n8n ja esta no ar (http://localhost:5678)

REM ---------- 3) WAHA proprio deste projeto (porta 3003) ----------
:waha
docker ps --format "{{.Names}}" | findstr /i "afiliados-waha" >nul
if not errorlevel 1 goto waha_ok
echo  Subindo a WAHA deste projeto (porta 3003)...
docker compose -f docker-compose.waha.yml up -d
goto painel

:waha_ok
echo  [OK] WAHA deste projeto ja esta no ar (http://localhost:3003)

REM ---------- 4) Painel ----------
:painel
echo.
echo  Subindo o painel...
start "Plataforma de Afiliados" cmd /c "%~dp0INICIAR.bat"

echo.
echo  ============================================================
echo    NO AR:
echo      Painel de afiliados : http://localhost:3010
echo      n8n                 : http://localhost:5678
echo      WAHA (WhatsApp)     : http://localhost:3003
echo  ============================================================
echo.
echo  Esta janela pode ser fechada. O painel abriu em outra janela.
echo.
ping -n 9 127.0.0.1 >nul
