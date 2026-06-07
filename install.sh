#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Video Clip Extractor — Cross-Platform Installer
#  Supports: Linux (Debian/Ubuntu, Fedora/RHEL, Arch), macOS
# ═══════════════════════════════════════════════════════════════

set -e

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

print_banner() {
  echo ""
  echo -e "${CYAN}  ╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}  ║${BOLD}   🎬  Video Clip Extractor — Installer            ${NC}${CYAN}║${NC}"
  echo -e "${CYAN}  ║${NC}   YouTube Script Tool for Movie Explainers        ${CYAN}║${NC}"
  echo -e "${CYAN}  ╚══════════════════════════════════════════════════╝${NC}"
  echo ""
}

info()    { echo -e "  ${CYAN}ℹ${NC}  $1"; }
success() { echo -e "  ${GREEN}✅${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "  ${RED}❌${NC} $1"; }

# ── Detect OS ─────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Linux*)   OS="linux";;
    Darwin*)  OS="mac";;
    CYGWIN*|MINGW*|MSYS*) OS="windows";;
    *)        OS="unknown";;
  esac

  # Detect Linux distro family
  if [ "$OS" = "linux" ]; then
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      case "$ID" in
        ubuntu|debian|linuxmint|pop|elementary|zorin)
          DISTRO_FAMILY="debian";;
        fedora|rhel|centos|rocky|alma|nobara)
          DISTRO_FAMILY="fedora";;
        arch|manjaro|endeavouros|garuda)
          DISTRO_FAMILY="arch";;
        opensuse*|sles)
          DISTRO_FAMILY="suse";;
        *)
          DISTRO_FAMILY="unknown";;
      esac
    else
      DISTRO_FAMILY="unknown"
    fi
  fi
}

# ── Check if a command exists ─────────────────────────────────
has_cmd() { command -v "$1" &>/dev/null; }

# ── Install Python 3 ─────────────────────────────────────────
install_python() {
  if has_cmd python3; then
    success "Python 3 found: $(python3 --version)"
    return
  fi

  warn "Python 3 not found. Installing..."
  case "$OS" in
    mac)
      if has_cmd brew; then
        brew install python3
      else
        error "Homebrew is required to install Python on macOS."
        echo "       Install Homebrew: https://brew.sh"
        exit 1
      fi
      ;;
    linux)
      case "$DISTRO_FAMILY" in
        debian)  sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip;;
        fedora)  sudo dnf install -y python3 python3-pip;;
        arch)    sudo pacman -Sy --noconfirm python python-pip;;
        suse)    sudo zypper install -y python3 python3-pip;;
        *)
          error "Unsupported Linux distribution. Please install Python 3 manually."
          exit 1;;
      esac
      ;;
    windows)
      error "Please install Python 3 from https://www.python.org/downloads/"
      error "Make sure to check 'Add Python to PATH' during installation."
      exit 1
      ;;
  esac
  success "Python 3 installed: $(python3 --version)"
}

# ── Install FFmpeg ────────────────────────────────────────────
install_ffmpeg() {
  if has_cmd ffmpeg && has_cmd ffprobe; then
    success "FFmpeg found:   $(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f1-3)"
    return
  fi

  warn "FFmpeg not found. Installing..."
  case "$OS" in
    mac)
      if has_cmd brew; then
        brew install ffmpeg
      else
        error "Homebrew is required to install FFmpeg on macOS."
        echo "       Install Homebrew: https://brew.sh"
        exit 1
      fi
      ;;
    linux)
      case "$DISTRO_FAMILY" in
        debian)  sudo apt-get update && sudo apt-get install -y ffmpeg;;
        fedora)  sudo dnf install -y ffmpeg;;
        arch)    sudo pacman -Sy --noconfirm ffmpeg;;
        suse)    sudo zypper install -y ffmpeg;;
        *)
          error "Unsupported Linux distribution. Please install FFmpeg manually."
          exit 1;;
      esac
      ;;
    windows)
      error "Please install FFmpeg from https://ffmpeg.org/download.html"
      error "Make sure ffmpeg.exe and ffprobe.exe are in your PATH."
      exit 1
      ;;
  esac
  success "FFmpeg installed: $(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f1-3)"
}

# ── Ensure python3-venv is available (Debian/Ubuntu) ──────────
ensure_venv_module() {
  if python3 -c "import venv" &>/dev/null; then
    return
  fi

  warn "python3-venv module not found. Installing..."
  if [ "$OS" = "linux" ] && [ "$DISTRO_FAMILY" = "debian" ]; then
    sudo apt-get install -y python3-venv
  else
    error "Cannot create virtual environment. Please install the venv module for your Python."
    exit 1
  fi
}

# ── Create virtual environment ────────────────────────────────
setup_venv() {
  if [ -d "venv" ]; then
    info "Virtual environment already exists. Skipping creation."
  else
    info "Creating virtual environment..."
    python3 -m venv venv
    success "Virtual environment created."
  fi
}

# ── Install Python dependencies ───────────────────────────────
install_deps() {
  info "Installing Python dependencies..."

  # Activate venv
  if [ "$OS" = "windows" ]; then
    source venv/Scripts/activate
  else
    source venv/bin/activate
  fi

  pip install --upgrade pip -q
  pip install -r requirements.txt -q
  success "Python dependencies installed (flask, flask-cors)."
}

# ── Create input-video directory ──────────────────────────────
setup_dirs() {
  mkdir -p input-video
  success "input-video directory ready."
}

# ── Summary ───────────────────────────────────────────────────
print_summary() {
  echo ""
  echo -e "  ${GREEN}════════════════════════════════════════════════════${NC}"
  echo -e "  ${GREEN}${BOLD}  Installation Complete! 🎉${NC}"
  echo -e "  ${GREEN}════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  To start the application, run:"
  echo ""
  if [ "$OS" = "windows" ]; then
    echo -e "    ${CYAN}start.bat${NC}"
  else
    echo -e "    ${CYAN}bash start.sh${NC}"
  fi
  echo ""
  echo -e "  The app will be available at: ${BOLD}http://localhost:5000${NC}"
  echo ""
}

# ═══════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_banner
detect_os

info "Detected OS: ${BOLD}$OS${NC}"
if [ "$OS" = "linux" ]; then
  info "Distro family: ${BOLD}${DISTRO_FAMILY}${NC}"
fi
echo ""

install_python
install_ffmpeg
ensure_venv_module
setup_venv
install_deps
setup_dirs
print_summary
