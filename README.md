# 🎬 Video Clip Extractor & Merger

A fast, lightweight, browser-based tool designed specifically for movie explainers, content creators, and editors to quickly extract, arrange, and merge video clips. Built with Python, Flask, and FFmpeg.

![App Preview](screenshot.png) *(Add a screenshot of the app here)*

## ✨ Features
* **Lightning Fast Extraction:** Uses FFmpeg's stream copy (`-c copy`) for lossless, high-speed clip extraction and merging.
* **Keyboard Shortcuts:** Rapidly mark clip start (`S` / `I`) and end (`E` / `O`) points without lifting your hands from the keyboard.
* **Auto-Marking Mode:** Set a default clip length (e.g., 4 seconds) so you only need to press "Start" – the clip automatically ends!
* **Add Background Audio:** Upload a music track or voiceover. The tool will automatically mute the original video sound, lay your audio over the clips, and perfectly trim it to the final video length.
* **Save/Load Projects:** Export your marked clips to a lightweight `.json` file and import them back anytime, or seamlessly continue your previous session using the browser's auto-save functionality.
* **Real-time Preview:** Watch all your selected clips play sequentially (with your background audio!) directly in the browser before exporting.

---

## 🛠️ Prerequisites

Before installing, ensure you have:
1. **Python 3.8+** installed
2. **FFmpeg** installed and added to your system PATH

---

## 🚀 Installation

### 🍎 macOS & 🐧 Linux

1. Open your terminal and navigate to the project directory:
   ```bash
   cd /path/to/youtube-script-app
   ```
2. Make the scripts executable:
   ```bash
   chmod +x install.sh start.sh
   ```
3. Run the installation script (this will try to automatically install Python/FFmpeg if missing, setup a virtual environment, and install dependencies):
   ```bash
   ./install.sh
   ```

### 🪟 Windows

1. Open the project folder in File Explorer.
2. Double-click **`install.bat`**.
   *(If FFmpeg or Python is missing, the script will provide instructions on how to install them).*

---

## 🏃‍♂️ Running the App

1. **Start the backend server:**
   * **macOS/Linux:** Run `./start.sh` in the terminal.
   * **Windows:** Double-click `start.bat`.
2. The app will automatically open in your default browser at **`http://localhost:5000`**.

---

## 📖 How to Use

1. **Upload a Video:** Click the "Upload Video" button or drop an `.mp4`, `.mkv`, etc. into the app. (Videos are loaded locally in your browser for speed; nothing is uploaded to the cloud).
2. **Mark Clips:**
   * Play the video.
   * Press **`S`** to mark a clip's **Start**.
   * Press **`E`** to mark the **End** and save it.
3. **Configure Settings:** Click the ⚙️ icon in the top right to enable **Auto-Clip**. For example, set it to `4` seconds, and you only need to press `S` — the app handles the rest.
4. **Preview:** Click **Preview All** in the right sidebar to watch your merged video in real-time.
5. **Add Audio:** Click **Add BG Audio** in the bottom right to select a custom soundtrack.
6. **Export:** Click **Export & Merge**. The Python backend will instantly cut and stitch your clips together using FFmpeg!

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Space` / `K` | Play / Pause |
| `S` / `I` | Mark Clip Start |
| `E` / `O` | Mark Clip End & Save |
| `J` | Skip Backward 5s |
| `L` | Skip Forward 5s |
| `Left Arrow` | Step backward 1 frame (~33ms) |
| `Right Arrow` | Step forward 1 frame (~33ms) |
| `Up Arrow` | Volume Up |
| `Down Arrow` | Volume Down |
| `M` | Mute / Unmute |

---

## 📁 Directory Structure

* `/input-video/` - Recommended folder to store raw video files.
* `/app.js` - Frontend logic and video player controls.
* `/server.py` - Flask backend that handles FFmpeg execution.
* `/index.html` & `/style.css` - UI and layout.

---

**Happy Editing! 🎥**
