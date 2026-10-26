@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Publicar CatLive - Android e iOS
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publish-catlive-app.ps1" %*
set "CATLIVE_RESULT=%ERRORLEVEL%"
if not "%CATLIVE_RESULT%"=="0" echo ERRO: publicacao nao concluida. Confira a mensagem acima.
if not "%CATLIVE_NO_PAUSE%"=="1" pause
exit /b %CATLIVE_RESULT%
