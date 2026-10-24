@echo off
cd /d "%~dp0"
echo Gallery: http://localhost:8000
echo Close this window to stop.
rem Open the browser after the server has had time to start
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process http://localhost:8000"
python -m http.server 8000
