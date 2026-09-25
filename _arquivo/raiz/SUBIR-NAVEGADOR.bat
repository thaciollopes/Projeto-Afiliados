@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Navegador headless - coleta por navegacao
color 0E

echo.
echo  ============================================================
echo    NAVEGADOR HEADLESS (coleta por navegacao / scraping)
echo  ============================================================
echo.
echo  Usado quando a loja nao tem API, ou enquanto a credencial
echo  nao sai. E uma fonte NAO oficial: pode parar de funcionar
echo  quando a loja mudar o site ou bloquear o acesso.
echo.
echo  O container do Ranch Life (ranch-browserless) nao e tocado:
echo  este projeto sobe o proprio, na porta 3004.
echo.

docker info >nul 2>&1
if errorlevel 1 (
  echo  [ERRO] Docker parado. Abra o Docker Desktop e tente de novo.
  pause
  exit /b 1
)

docker compose -f docker-compose.browserless.yml up -d
echo.
echo  Agora, no arquivo .env, deixe:   SCRAPER_ENABLED=true
echo  Depois rode REINICIAR.bat.
echo.
echo  As lojas aparecem na busca como "(navegacao)".
echo.
pause
