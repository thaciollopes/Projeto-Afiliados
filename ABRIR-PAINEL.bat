@echo off
chcp 65001 >nul
cd /d "%~dp0"

set PORTA=3010
for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
  if /i "%%a"=="APP_PORT" set PORTA=%%b
)
start http://localhost:%PORTA%
