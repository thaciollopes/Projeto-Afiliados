@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Instalar extensao de captura de ofertas
color 0B

echo.
echo  ============================================================
echo    EXTENSAO "CAPTURAR OFERTAS"
echo  ============================================================
echo.
echo  E assim que as plataformas de afiliado capturam produto sem
echo  cair em bloqueio: quem navega e VOCE, a extensao so le o que
echo  ja esta na sua tela.
echo.
echo  COMO INSTALAR (leva 1 minuto, so na primeira vez):
echo.
echo   1. Vou abrir o Chrome na pagina de extensoes.
echo   2. Ligue o "Modo do desenvolvedor" (canto superior direito).
echo   3. Clique em "Carregar sem compactacao".
echo   4. Escolha a pasta que vou abrir: %~dp0extensao
echo   5. Fixe a extensao na barra (icone do quebra-cabeca).
echo.
echo  COMO USAR NO DIA A DIA:
echo   - Abra o Mercado Livre, Shopee, Amazon ou Magalu
echo   - Pesquise o que voce quer divulgar
echo   - Clique na extensao e em "Capturar ofertas desta pagina"
echo   - Os produtos aparecem no painel, em PRODUTOS
echo.
echo  O painel precisa estar aberto (INICIAR.bat).
echo.
pause

start "" explorer "%~dp0extensao"
start "" chrome "chrome://extensions/"

echo.
echo  Abri a pasta da extensao e a pagina de extensoes do Chrome.
echo.
pause
