@echo off
title WhatsApp Automation Setup - No Chrome Download

echo.
echo Cleaning old incomplete install from this project...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f /q package-lock.json

echo.
echo Cleaning broken Puppeteer Chrome cache...
if exist "%USERPROFILE%\.cache\puppeteer" rmdir /s /q "%USERPROFILE%\.cache\puppeteer"

echo.
echo Telling Puppeteer NOT to download Chrome...
set PUPPETEER_SKIP_DOWNLOAD=true
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
set PUPPETEER_PRODUCT=chrome

echo.
echo Installing packages without install scripts, so Puppeteer download is skipped...
call npm.cmd install --ignore-scripts
if %errorlevel% neq 0 (
  echo.
  echo Install failed. Move this folder to C:\whatsapp-automation-free-demo-final and run setup-windows.cmd again.
  pause
  exit /b %errorlevel%
)

echo.
echo Setup complete.
echo Starting project now...
call npm.cmd start
pause
