#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Video Clip Extractor — Launcher Script
#  YouTube Script Tool for Movie Explainers
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   🎬  Video Clip Extractor & Merger       ║"
echo "  ║   YouTube Script Tool — Movie Explainer   ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Check Python 3
if ! command -v python3 &>/dev/null; then
  echo "  ❌  Python 3 is not installed. Please install Python 3.8+"
  exit 1
fi

# Check FFmpeg
if ! command -v ffmpeg &>/dev/null; then
  echo "  ❌  FFmpeg is not installed."
  echo "      Install with:  sudo apt install ffmpeg"
  exit 1
fi

if ! command -v ffprobe &>/dev/null; then
  echo "  ❌  ffprobe is not found (should come with ffmpeg)."
  exit 1
fi

echo "  ✅  Python 3: $(python3 --version)"
echo "  ✅  FFmpeg:   $(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f1-3)"
echo ""

# Create virtual environment if not exists
if [ ! -d "venv" ]; then
  echo "  📦  Creating virtual environment..."
  python3 -m venv venv
fi

# Activate and install dependencies
source venv/bin/activate

echo "  📦  Installing Python dependencies..."
pip install -q -r requirements.txt

echo ""
echo "  🚀  Starting server at http://localhost:5000"
echo "  🌐  Browser will open automatically..."
echo "  🛑  Press Ctrl+C to stop"
echo ""

python3 server.py
