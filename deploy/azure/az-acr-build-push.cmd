@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0az-acr-build-push.ps1" %*
exit /b %ERRORLEVEL%
