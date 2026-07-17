@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Subir VS Hook App Android e iOS

cd /d "%~dp0"

echo ==========================================
echo   SUBIR VS HOOK APP - ANDROID E IOS
echo ==========================================
echo.

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo ERRO: esta pasta nao e um repositorio Git.
  goto erro
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -Raw -LiteralPath 'package.json' | ConvertFrom-Json).version"`) do set "PACKAGE_VERSION=%%V"
if not defined PACKAGE_VERSION (
  echo ERRO: nao consegui ler a versao do package.json.
  goto erro
)

set "VERSION_NAME="
set /p "VERSION_NAME=Versao dos apps [%PACKAGE_VERSION%]: "
if not defined VERSION_NAME set "VERSION_NAME=%PACKAGE_VERSION%"

echo(%VERSION_NAME%| findstr /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul
if errorlevel 1 (
  echo ERRO: use uma versao como 3.0.2.
  goto erro
)

set "BUILD_NUMBER="
set /p "BUILD_NUMBER=Numero do build para Play Store e App Store: "
if not defined BUILD_NUMBER (
  echo ERRO: o numero do build e obrigatorio.
  goto erro
)

echo(%BUILD_NUMBER%| findstr /r /x "[1-9][0-9]*" >nul
if errorlevel 1 (
  echo ERRO: o build precisa ser um numero inteiro maior que zero.
  goto erro
)

set "TAG_NAME=mobile-v%VERSION_NAME%-build%BUILD_NUMBER%"
set "COMMIT_MSG=App mobile %VERSION_NAME% build %BUILD_NUMBER%"
set "CUSTOM_MSG="
set /p "CUSTOM_MSG=Mensagem do commit [%COMMIT_MSG%]: "
if defined CUSTOM_MSG set "COMMIT_MSG=%CUSTOM_MSG%"

echo.
echo Versao Android/iOS: %VERSION_NAME%
echo Version code/build:  %BUILD_NUMBER%
echo Tag de disparo:      %TAG_NAME%
echo.
choice /c SN /n /m "Confirma o build, commit, push e disparo dos dois apps? [S/N]: "
if errorlevel 2 goto cancelado

git show-ref --tags --verify --quiet "refs/tags/%TAG_NAME%"
if not errorlevel 1 goto tag_existente

git ls-remote --exit-code --tags origin "refs/tags/%TAG_NAME%" >nul 2>nul
if not errorlevel 1 goto tag_existente

echo.
echo ==========================================
echo   GERANDO DIST
echo ==========================================
call npm run build
if errorlevel 1 goto erro

echo.
echo ==========================================
echo   PREPARANDO COMMIT
echo ==========================================
git add -A
if errorlevel 1 goto erro

git diff --cached --quiet
if not errorlevel 1 goto sem_alteracoes

git commit -m "%COMMIT_MSG%"
if errorlevel 1 goto erro

:sem_alteracoes
for /f "usebackq delims=" %%B in (`git branch --show-current`) do set "BRANCH=%%B"
if not defined BRANCH set "BRANCH=main"

echo.
echo ==========================================
echo   ENVIANDO BRANCH %BRANCH%
echo ==========================================
git push origin "%BRANCH%"
if errorlevel 1 goto erro

echo.
echo ==========================================
echo   CRIANDO TAG E DISPARANDO ACTIONS
echo ==========================================
git tag -a "%TAG_NAME%" -m "%COMMIT_MSG%"
if errorlevel 1 goto erro

git push origin "%TAG_NAME%"
if errorlevel 1 goto erro

echo.
echo ==========================================
echo   PRONTO
echo ==========================================
echo Android e iOS foram disparados pela tag:
echo %TAG_NAME%
echo.
echo Acompanhe em:
echo https://github.com/JBdevy/vshookapploja/actions
echo.
pause
exit /b 0

:tag_existente
echo.
echo ERRO: a tag %TAG_NAME% ja existe.
echo Use um numero de build maior.
goto erro

:cancelado
echo.
echo Operacao cancelada. Nenhum push ou disparo foi feito.
pause
exit /b 0

:erro
echo.
echo A operacao nao foi concluida.
pause
exit /b 1
