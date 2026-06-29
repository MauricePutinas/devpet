@echo off
title DevPet
cd /d "%~dp0"

rem --- First run: install dependencies once ---
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo  First run - installing dependencies ^(one time, may take 1-2 min^)...
  echo.
  where npm >nul 2>nul || (
    echo  Node.js / npm not found. Please install Node.js first: https://nodejs.org
    echo.
    pause
    exit /b 1
  )
  call npm install
  if errorlevel 1 (
    echo.
    echo  Install failed. Keep this window open and check the error above.
    echo.
    pause
    exit /b 1
  )
)

rem --- Launch the pet (detached; this window closes right away) ---
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit
