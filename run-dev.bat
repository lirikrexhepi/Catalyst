@echo off
title Composer Dev
set PATH=C:\Go\bin;C:\Users\PC\go\bin;%PATH%
cd /d "%~dp0"
echo Starting Composer Development Server...
wails dev
if errorlevel 1 (
    echo.
    echo Wails exited with an error.
    pause
)
