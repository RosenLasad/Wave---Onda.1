@echo off
setlocal
cd /d "%~dp0"

echo WAVE - controllo e aggiornamento automatico della libreria MIDI...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-midi-library.ps1"
if errorlevel 1 goto :errore

echo.
echo Apertura di Wave...
start "" "%~dp0index.html"
exit /b 0

:errore
echo.
echo ERRORE: libreria MIDI non aggiornata.
pause
exit /b 1
