@echo off
rem Modlum Launcher'ı derlenmiş haliyle başlatır.
cd /d "%~dp0"
if not exist "src-tauri\target\release\modlum-launcher.exe" (
  echo Derlenmis uygulama yok. Once: pnpm dist
  pause
  exit /b 1
)
start "" "src-tauri\target\release\modlum-launcher.exe"
