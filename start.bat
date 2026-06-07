@echo off
REM ═══════════════════════════════════════════════════════════════
REM  Video Clip Extractor — Windows Launcher
REM ═══════════════════════════════════════════════════════════════

setlocal
cd /d "%~dp0"

echo.
echo   ╔══════════════════════════════════════════════════╗
echo   ║   Video Clip Extractor ^& Merger                  ║
echo   ║   YouTube Script Tool — Movie Explainer           ║
echo   ╚══════════════════════════════════════════════════╝
echo.

REM ── Check venv exists ───────────────────────────────────────
if not exist "venv\Scripts\activate.bat" (
    echo   [ERROR] Virtual environment not found.
    echo           Run install.bat first!
    pause
    exit /b 1
)

REM ── Check FFmpeg ────────────────────────────────────────────
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo   [ERROR] FFmpeg not found in PATH. Run install.bat or install FFmpeg.
    pause
    exit /b 1
)

REM ── Activate and run ────────────────────────────────────────
call venv\Scripts\activate.bat

echo   Starting server at http://localhost:5000
echo   Press Ctrl+C to stop
echo.

python server.py
