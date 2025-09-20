@echo off
cd /d %~dp0
echo ===========================
echo   Startar Kanban-server...
echo ===========================

:: Starta servern i bakgrunden och spara dess PID
start "" /b cmd /c "node server.js"
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq node.exe" /fo list ^| findstr "PID"') do set SERVERPID=%%a

echo Server startad med PID %SERVERPID%

:: Starta webbläsaren (ändra chrome.exe till msedge.exe om du föredrar Edge)
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window http://localhost:3000

:: Vänta tills webbläsaren stängs
echo Väntar på att webbläsaren ska stängas...
:WAITBROWSER
tasklist /fi "imagename eq chrome.exe" | find /i "chrome.exe" >nul
if not errorlevel 1 (
    timeout /t 2 >nul
    goto WAITBROWSER
)

:: Stäng servern när webbläsaren stängs
echo Webbläsaren stängd. Stoppar servern...
taskkill /PID %SERVERPID% /F >nul 2>&1

echo ===========================
echo   Servern är stoppad.
echo ===========================
pause
