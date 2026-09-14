@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Hook Keys Desktop - Teste local
cd /d "%~dp0"

where node >nul 2>&1 || goto node_ausente
where npm >nul 2>&1 || goto node_ausente
where cargo >nul 2>&1 || goto rust_ausente

if not exist "node_modules\.package-lock.json" (
  echo Instalando dependencias do Hook Keys...
  call npm install
  if errorlevel 1 goto erro
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\prepare-desktop-dev.ps1"
if errorlevel 1 goto erro

echo.
echo Iniciando o Hook Keys Desktop local...
echo Limpando qualquer instancia antiga deste teste.
echo Alteracoes de layout serao atualizadas automaticamente.
echo Alteracoes no motor nativo serao compiladas ao reiniciar este arquivo.
echo Nenhum arquivo sera enviado para o GitHub.
echo.

call npm run desktop:dev -- --no-watch
if errorlevel 1 goto erro
exit /b 0

:node_ausente
echo ERRO: Node.js e npm precisam estar instalados e no PATH.
goto erro

:rust_ausente
echo ERRO: Rust/Cargo precisa estar instalado e no PATH.
goto erro

:erro
echo.
echo O teste local do Hook Keys Desktop foi encerrado com erro.
pause
exit /b 1
