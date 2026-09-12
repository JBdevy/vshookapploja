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
  echo ERRO: use uma versao como 1.0.0.
  goto erro
)

set "BUILD_NUMBER="
echo Consultando tags locais e do GitHub para calcular o proximo build...
for /f "usebackq delims=" %%B in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0proximo-build.ps1" -TagPrefix mobile`) do set "BUILD_NUMBER=%%B"
if not defined BUILD_NUMBER (
  echo ERRO: nao foi possivel calcular o proximo build automaticamente.
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
echo Proximo build automatico: %BUILD_NUMBER%
echo Tag de disparo:      %TAG_NAME%
echo.
choice /c SN /n /m "Confirma o build, commit, push e disparo dos dois apps? [S/N]: "
if errorlevel 2 goto cancelado

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

rem Sempre cria um commit proprio para este disparo. Sem --allow-empty, quando
rem outro script ja tinha commitado as mesmas pastas, nada ficava staged, o
rem commit era pulado e a tag apontava para o commit anterior. Por isso o
rem Actions mostrava a mensagem do build anterior no lugar da digitada aqui.
git commit --allow-empty -m "%COMMIT_MSG%"
if errorlevel 1 goto erro
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

git show-ref --tags --verify --quiet "refs/tags/%TAG_NAME%"
if not errorlevel 1 (
  echo ERRO: a tag %TAG_NAME% ja existe localmente. Execute o arquivo novamente.
  goto erro
)

:verificar_tag_remota
git ls-remote --exit-code --tags origin "refs/tags/%TAG_NAME%" >nul 2>nul
set "REMOTE_TAG_CHECK=%ERRORLEVEL%"
if "%REMOTE_TAG_CHECK%"=="0" goto tag_em_uso
if "%REMOTE_TAG_CHECK%"=="2" goto criar_tag
goto erro_consulta_tag

:tag_em_uso
echo ERRO: a tag %TAG_NAME% acabou de ser usada no GitHub.
echo Execute o arquivo novamente para ele calcular o proximo numero.
goto erro

:criar_tag
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
echo APK, AAB e IPA serao publicados juntos no mesmo GitHub Release.
echo.
echo Acompanhe os builds em:
echo https://github.com/JBdevy/vshookapploja/actions
echo.
echo Release final:
echo https://github.com/JBdevy/vshookapploja/releases
echo.
pause
exit /b 0

:erro_consulta_tag
echo.
echo ERRO: nao foi possivel consultar a tag %TAG_NAME% no GitHub.
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
