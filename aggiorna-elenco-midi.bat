@echo off
setlocal
cd /d "%~dp0"

echo Aggiornamento libreria MIDI di Wave...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-midi-library.ps1"
if errorlevel 1 goto :errore

echo.
echo Operazione completata. Ora puoi aprire o aggiornare index.html.
pause
exit /b 0

:errore
echo.
echo ERRORE: non e' stato possibile aggiornare la libreria MIDI.
echo Controlla che i file .mid/.midi siano nella cartella "midi" accanto a index.html.
pause
exit /b 1
