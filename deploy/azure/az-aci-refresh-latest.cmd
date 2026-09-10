@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0az-aci-refresh-latest.ps1" %*
exit /b %ERRORLEVEL%

