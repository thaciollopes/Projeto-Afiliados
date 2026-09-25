@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Logs - Plataforma de Afiliados

echo.
echo  Ultimas linhas do log de hoje (Ctrl+C para sair):
echo.
powershell -NoProfile -Command "$f = Get-ChildItem storage\logs\app-*.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1; if ($f) { Get-Content $f.FullName -Tail 40 -Wait } else { Write-Host 'Nenhum log ainda. Inicie o sistema primeiro.' }"
pause
