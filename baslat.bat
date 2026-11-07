@echo off
rem Modlum Launcher'ı derlenmiş haliyle başlatır.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron ikilisi yok. Once: node node_modules\electron\install.js
  pause
  exit /b 1
)
if not exist "out\main\index.js" (
  echo Derlenmis dosyalar yok. Once: npm run build
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
