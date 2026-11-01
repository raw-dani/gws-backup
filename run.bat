@echo off
setlocal
echo ========================================================
echo   Starting Google Workspace Backup Application
echo ========================================================

set SCRIPT_DIR=%~dp0
set BACKEND_EXE=%SCRIPT_DIR%dist\gws-backend\gws-backend.exe
set FRONTEND_DIR=%SCRIPT_DIR%desktop

if not exist "%BACKEND_EXE%" (
    echo [ERROR] Backend executable not found at: %BACKEND_EXE%
    pause
    exit /b 1
)

echo [1/2] Launching Background Python Engine (Port 8000)...
start "GWS-Backend" /min "%BACKEND_EXE%" --port 8000

echo [2/2] Launching Desktop Frontend UI...
cd /d "%FRONTEND_DIR%"
start "GWS-Frontend" npm run dev

echo Application is ready! Open http://localhost:5173 in your browser.
