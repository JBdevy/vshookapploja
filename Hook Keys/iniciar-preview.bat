@echo off
setlocal
cd /d "%~dp0"
node scripts\dev-preview.mjs
set "hook_keys_exit_code=%errorlevel%"
if not "%hook_keys_exit_code%"=="0" pause
exit /b %hook_keys_exit_code%
