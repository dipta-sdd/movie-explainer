@echo off
REM ═══════════════════════════════════════════════════════════════
REM  Video Clip Extractor — Windows Installer
REM ═══════════════════════════════════════════════════════════════

setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo   ╔══════════════════════════════════════════════════╗
echo   ║   Video Clip Extractor — Installer               ║
echo   ║   YouTube Script Tool for Movie Explainers        ║
echo   ╚══════════════════════════════════════════════════╝
echo.

REM ── Check Python 3 ─────────────────────────────────────────
where python >nul 2>nul
if %errorlevel% neq 0 (
    where python3 >nul 2>nul
    if %errorlevel% neq 0 (
        echo   [ERROR] Python 3 is not installed.
        echo           Download from: https://www.python.org/downloads/
        echo           IMPORTANT: Check "Add Python to PATH" during install!
        echo.
        echo   After installing Python, run this script again.
        pause
        exit /b 1
    )
    set PYTHON_CMD=python3
) else (
    set PYTHON_CMD=python
)

REM Verify it's Python 3
for /f "tokens=2 delims= " %%v in ('%PYTHON_CMD% --version 2^>^&1') do set PYVER=%%v
echo   [OK] Python found: %PYVER%

REM ── Check FFmpeg ────────────────────────────────────────────
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo   [ERROR] FFmpeg is not installed.
    echo.
    echo   Option 1: Install via winget (Windows 10+):
    echo              winget install Gyan.FFmpeg
    echo.
    echo   Option 2: Install via chocolatey:
    echo              choco install ffmpeg
    echo.
    echo   Option 3: Download manually from https://ffmpeg.org/download.html
    echo              and add ffmpeg.exe to your PATH.
    echo.
    pause
    exit /b 1
)

where ffprobe >nul 2>nul
if %errorlevel% neq 0 (
    echo   [ERROR] ffprobe not found. It should come with FFmpeg.
    echo           Reinstall FFmpeg to fix this.
    pause
    exit /b 1
)

for /f "tokens=1-3" %%a in ('ffmpeg -version 2^>^&1') do (
    echo   [OK] FFmpeg found: %%a %%b %%c
    goto :ffmpeg_done
)
:ffmpeg_done

REM ── Create virtual environment ──────────────────────────────
if not exist "venv" (
    echo.
    echo   Creating virtual environment...
    %PYTHON_CMD% -m venv venv
    if %errorlevel% neq 0 (
        echo   [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo   [OK] Virtual environment created.
) else (
    echo   [OK] Virtual environment already exists.
)

REM ── Install dependencies ────────────────────────────────────
echo.
echo   Installing Python dependencies...
call venv\Scripts\activate.bat

pip install --upgrade pip -q 2>nul
pip install -r requirements.txt -q 2>nul

echo   [OK] Python dependencies installed (flask, flask-cors).

REM ── Create input-video directory ────────────────────────────
if not exist "input-video" mkdir input-video
echo   [OK] input-video directory ready.

REM ── Summary ─────────────────────────────────────────────────
echo.
echo   ════════════════════════════════════════════════════
echo     Installation Complete!
echo   ════════════════════════════════════════════════════
echo.
echo   To start the application, run:
echo.
echo       start.bat
echo.
echo   The app will be available at: http://localhost:5000
echo.
pause
