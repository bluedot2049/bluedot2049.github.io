@echo off
cd /d "%~dp0"
echo Grade mode (?debug): light / color panels on the right, curves on the left.
echo   1 = gallery   2 = haishi
choice /c 12 /n /m "Pick: "
if errorlevel 2 (set Q=?debug^&z=haishi) else (set Q=?debug)
echo http://localhost:8000/%Q%
echo Close this window to stop.
rem Open the browser after the server has had time to start
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://localhost:8000/%Q%'"
python -m http.server 8000
