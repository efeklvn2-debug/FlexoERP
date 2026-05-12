@echo off
echo Stopping FlexoPrint ERP...
echo.

echo Killing all node processes...
taskkill /F /IM node.exe 2>nul

echo.
echo All servers stopped.
echo.
pause
