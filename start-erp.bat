@echo off
echo Starting FlexoPrint ERP...
echo.

echo Starting Backend (port 3000)...
start "FlexoPrint Backend" cmd /k "cd /d "%~dp0apps\backend" && npm run dev"

echo Starting Frontend (port 5173)...
start "FlexoPrint Frontend" cmd /k "cd /d "%~dp0apps\frontend" && npm run dev"

echo.
echo Both servers starting...
echo Backend: http://localhost:3000
echo Frontend: http://localhost:5173
echo.
echo Press any key to exit this window (servers will keep running)
pause >nul
