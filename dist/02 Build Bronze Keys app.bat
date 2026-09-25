@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Build Bronze Keys - Android e iOS

cd /d "%~dp0"

echo ==========================================
echo   BUILD BRONZE KEYS - APK, AAB E IPA
echo ==========================================
echo.

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo ERRO: esta pasta nao e um repositorio Git.
  goto erro
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -Raw -LiteralPath 'Hook Keys\package.json' | ConvertFrom-Json).version"`) do set "PACKAGE_VERSION=%%V"
if not defined PACKAGE_VERSION (
  echo ERRO: nao consegui ler a versao do Bronze Keys.
  goto erro
)

set "VERSION_NAME="
set /p "VERSION_NAME=Versao do Bronze Keys [%PACKAGE_VERSION%]: "
if not defined VERSION_NAME set "VERSION_NAME=%PACKAGE_VERSION%"

echo(%VERSION_NAME%| findstr /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul
if errorlevel 1 (
  echo ERRO: use uma versao como 1.0.0.
  goto erro
)

set "BUILD_NUMBER="
echo Consultando tags locais e do GitHub para calcular o proximo build...
for /f "usebackq delims=" %%B in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0proximo-build.ps1" -TagPrefix hook-keys`) do set "BUILD_NUMBER=%%B"
if not defined BUILD_NUMBER (
  echo ERRO: nao foi possivel calcular o proximo build automaticamente.
  goto erro
)

echo(%BUILD_NUMBER%| findstr /r /x "[1-9][0-9]*" >nul
if errorlevel 1 (
  echo ERRO: o build precisa ser um inteiro maior que zero.
  goto erro
)

set "TAG_NAME=hook-keys-v%VERSION_NAME%-build%BUILD_NUMBER%"
set "COMMIT_MSG=Bronze Keys %VERSION_NAME% build %BUILD_NUMBER%"
set "CUSTOM_MSG="
set /p "CUSTOM_MSG=Mensagem do commit [%COMMIT_MSG%]: "
if defined CUSTOM_MSG set "COMMIT_MSG=%CUSTOM_MSG%"

echo.
echo Projeto:       Bronze Keys
echo Versao:        %VERSION_NAME%
echo Proximo build: %BUILD_NUMBER% (automatico)
echo Tag exclusiva: %TAG_NAME%
echo.
choice /c SN /n /m "Confirma o commit, push e build do Bronze Keys no GitHub? [S/N]: "
if errorlevel 2 goto cancelado

echo.
echo ==========================================
echo   PREPARANDO SOMENTE O BRONZE KEYS
echo ==========================================
git add -- ".github/workflows/hook-keys-release.yml" "Hook Keys" "02 Build Bronze Keys app.bat" "proximo-build.ps1"
if errorlevel 1 goto erro

rem Sempre cria um commit proprio para este disparo. Sem --allow-empty, quando
rem o build desktop ja tinha commitado a pasta "Hook Keys", nada ficava staged,
rem o commit era pulado e a tag apontava para o commit anterior. Por isso o
rem Actions mostrava a mensagem do build desktop no lugar da digitada aqui.
git commit --allow-empty -m "%COMMIT_MSG%"
if errorlevel 1 goto erro
for /f "usebackq delims=" %%B in (`git branch --show-current`) do set "BRANCH=%%B"
if not defined BRANCH set "BRANCH=main"

git show-ref --tags --verify --quiet "refs/tags/%TAG_NAME%"
if not errorlevel 1 (
  echo ERRO: a tag %TAG_NAME% ja existe localmente. Use outro numero de build.
  goto erro
)

git ls-remote --exit-code --tags origin "refs/tags/%TAG_NAME%" >nul 2>nul
set "REMOTE_TAG_CHECK=%ERRORLEVEL%"
if "%REMOTE_TAG_CHECK%"=="0" (
  echo ERRO: a tag %TAG_NAME% ja existe no GitHub. Use outro numero de build.
  goto erro
)
if not "%REMOTE_TAG_CHECK%"=="2" (
  echo ERRO: nao foi possivel consultar as tags no GitHub.
  goto erro
)

echo.
echo ==========================================
echo   ENVIANDO BRANCH %BRANCH%
echo ==========================================
git push origin "%BRANCH%"
if errorlevel 1 goto erro

echo.
echo ==========================================
echo   DISPARANDO APENAS O BRONZE KEYS
echo ==========================================
git tag -a "%TAG_NAME%" -m "%COMMIT_MSG%"
if errorlevel 1 goto erro
git push origin "%TAG_NAME%"
if errorlevel 1 goto erro

echo.
echo ==========================================
echo   BRONZE KEYS DISPARADO
echo ==========================================
echo Nenhuma compilacao foi feita neste computador.
echo O GitHub Actions vai publicar somente:
echo   Bronze Keys.apk
echo   Bronze Keys.aab
echo   Bronze Keys.ipa
echo.
echo Acompanhe em:
echo https://github.com/JBdevy/vshookapploja/actions
echo.
pause
exit /b 0

:cancelado
echo.
echo Operacao cancelada. Nada foi enviado.
pause
exit /b 0

:erro
echo.
echo ERRO: o build do Bronze Keys nao foi disparado.
pause
exit /b 1
