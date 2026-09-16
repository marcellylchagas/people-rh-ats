@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ nao encontrado. Instale o Node.js e tente novamente.
  pause
  exit /b 1
)
echo Iniciando People RH ATS com IA interna em http://localhost:3000 ...
start "People RH ATS" http://localhost:3000
node server.js
pause
