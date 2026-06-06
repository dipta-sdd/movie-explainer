import os
import json
import uuid
import subprocess
import threading
import tempfile
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 * 1024  # 5 GB limit for video uploads
CORS(app)

# ── Paths ────────────────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(BASE_DIR, 'input-video')

VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.mpg', '.mpeg'}

# In-memory job tracking
jobs = {}


def run_ffprobe(video_path):
    """Get video metadata using ffprobe."""
    cmd = [
        'ffprobe', '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams', '-show_format',
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe error: {result.stderr}")
    return json.loads(result.stdout)


# ── Static routes ────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/video/<path:filename>')
def serve_video(filename):
    """Serve video file from input-video folder for browser playback."""
    return send_from_directory(INPUT_DIR, filename)


# ── API ──────────────────────────────────────────────────────────

@app.route('/api/scan', methods=['GET'])
def scan_videos():
    """Scan the input-video folder and return video files with metadata."""
    os.makedirs(INPUT_DIR, exist_ok=True)
    videos = []
    try:
        for fname in sorted(os.listdir(INPUT_DIR)):
            ext = os.path.splitext(fname)[1].lower()
            if ext in VIDEO_EXTENSIONS:
                full_path = os.path.join(INPUT_DIR, fname)
                size = os.path.getsize(full_path)
                videos.append({
                    'name': fname,
                    'path': full_path,
                    'size_mb': round(size / 1024 / 1024, 1),
                    'url': f'/video/{fname}'
                })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    return jsonify({'videos': videos, 'input_dir': INPUT_DIR})


@app.route('/api/upload', methods=['POST'])
def upload_video():
    """Upload a video, clear existing videos, and save the new one."""
    if 'video' not in request.files:
        return jsonify({'error': 'No video file part in request'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        os.makedirs(INPUT_DIR, exist_ok=True)
        
        # Clear existing files in input-video directory
        for fname in os.listdir(INPUT_DIR):
            fpath = os.path.join(INPUT_DIR, fname)
            if os.path.isfile(fpath):
                os.remove(fpath)
                
        # Save new file
        orig_name = file.filename
        base, ext = os.path.splitext(orig_name)
        safe_base = secure_filename(base)
        if not safe_base:
            safe_base = "video_" + str(uuid.uuid4())[:8]
        filename = f"{safe_base}{ext}"
        
        save_path = os.path.join(INPUT_DIR, filename)
        file.save(save_path)
        
        size = os.path.getsize(save_path)
        return jsonify({
            'name': filename,
            'path': save_path,
            'size_mb': round(size / 1024 / 1024, 1),
            'url': f'/video/{filename}'
        })


@app.route('/api/probe', methods=['POST'])
def probe_video():
    """Probe a video file and return metadata (fps, duration, resolution)."""
    data = request.get_json()
    video_path = data.get('path', '').strip()

    if not video_path or not os.path.isfile(video_path):
        return jsonify({'error': f'File not found: {video_path}'}), 404

    try:
        probe = run_ffprobe(video_path)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # Find video stream
    video_stream = next(
        (s for s in probe.get('streams', []) if s.get('codec_type') == 'video'),
        None
    )
    if not video_stream:
        return jsonify({'error': 'No video stream found'}), 400

    # Parse FPS fraction e.g. "24000/1001"
    fps_str = video_stream.get('r_frame_rate', '25/1')
    try:
        num, den = fps_str.split('/')
        fps = float(num) / float(den)
    except Exception:
        fps = 25.0

    duration = float(probe.get('format', {}).get('duration', 0))

    return jsonify({
        'fps':      round(fps, 4),
        'duration': duration,
        'width':    int(video_stream.get('width', 0)),
        'height':   int(video_stream.get('height', 0)),
        'codec':    video_stream.get('codec_name', 'unknown'),
        'path':     video_path
    })


def _do_export(job_id, video_path, clips, output_path, audio_path=None):
    """Background worker: cut clips (no audio) and merge with FFmpeg."""
    try:
        jobs[job_id]['status']  = 'running'
        jobs[job_id]['progress'] = 0
        jobs[job_id]['message'] = 'Starting export...'

        n = len(clips)
        clip_files = []
        temp_dir = tempfile.mkdtemp(prefix='vidclip_')

        # Step 1: Extract each clip (video only, no audio)
        for i, clip in enumerate(clips):
            start     = clip['start']
            end       = clip['end']
            clip_path = os.path.join(temp_dir, f'clip_{i:04d}.mp4')
            clip_files.append(clip_path)

            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start),
                '-to', str(end),
                '-i', video_path,
                '-c:v', 'libx264',
                '-an',                       # no audio
                '-avoid_negative_ts', 'make_zero',
                clip_path
            ]

            jobs[job_id]['message'] = f'Extracting clip {i + 1} of {n}...'
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                jobs[job_id]['status'] = 'error'
                jobs[job_id]['error']  = f'FFmpeg clip {i+1} error: {result.stderr[-600:]}'
                return

            jobs[job_id]['progress'] = int((i + 1) / n * 80)

        # Step 2: Build concat list
        concat_list = os.path.join(temp_dir, 'concat.txt')
        with open(concat_list, 'w') as f:
            for cp in clip_files:
                f.write(f"file '{cp}'\n")

        # Step 3: Merge
        jobs[job_id]['message'] = 'Merging clips...'
        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0',
            '-i', concat_list
        ]
        
        if audio_path:
            total_dur = sum(c['end'] - c['start'] for c in clips)
            cmd.extend([
                '-i', audio_path,
                '-map', '0:v',
                '-map', '1:a',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-t', str(total_dur)
            ])
        else:
            cmd.extend(['-c', 'copy'])
            
        cmd.append(output_path)
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            jobs[job_id]['status'] = 'error'
            jobs[job_id]['error']  = f'FFmpeg merge error: {result.stderr[-600:]}'
            if audio_path and os.path.exists(audio_path):
                os.remove(audio_path)
            return

        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)

        jobs[job_id]['progress']    = 100
        jobs[job_id]['status']      = 'done'
        jobs[job_id]['message']     = 'Export complete!'
        jobs[job_id]['output_path'] = output_path

    except Exception as e:
        jobs[job_id]['status'] = 'error'
        jobs[job_id]['error']  = str(e)


@app.route('/api/export', methods=['POST'])
def export_clips():
    """Start an async export job."""
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        video_path  = request.form.get('path', '').strip()
        clips       = json.loads(request.form.get('clips', '[]'))
        output_name = request.form.get('output_name', 'merged_output.mp4')
        audio_file  = request.files.get('audio')
        if audio_file:
            audio_path = os.path.join(tempfile.gettempdir(), f'audio_{uuid.uuid4().hex}.mp3')
            audio_file.save(audio_path)
        else:
            audio_path = None
    else:
        data        = request.get_json()
        video_path  = data.get('path', '').strip()
        clips       = data.get('clips', [])
        output_name = data.get('output_name', 'merged_output.mp4')
        audio_path  = None

    if not video_path or not clips:
        return jsonify({'error': 'Missing path or clips'}), 400

    if not os.path.isfile(video_path):
        return jsonify({'error': f'File not found: {video_path}'}), 404

    # Save next to source video; make unique if already exists
    video_dir   = os.path.dirname(video_path)
    output_path = os.path.join(video_dir, output_name)
    base, ext   = os.path.splitext(output_path)
    counter = 1
    while os.path.exists(output_path):
        output_path = f"{base}_{counter}{ext}"
        counter += 1

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        'status': 'queued', 'progress': 0,
        'message': 'Queued', 'output_path': None, 'error': None
    }
    threading.Thread(
        target=_do_export,
        args=(job_id, video_path, clips, output_path, audio_path),
        daemon=True
    ).start()

    return jsonify({'job_id': job_id})


@app.route('/api/status/<job_id>', methods=['GET'])
def job_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job)


@app.route('/api/open-folder', methods=['POST'])
def open_folder():
    data = request.get_json()
    path = data.get('path', '')
    folder = os.path.dirname(path) if path else INPUT_DIR
    if os.path.isdir(folder):
        for cmd in [['xdg-open', folder], ['open', folder]]:
            try:
                subprocess.Popen(cmd)
                return jsonify({'ok': True})
            except FileNotFoundError:
                continue
    return jsonify({'ok': False})


if __name__ == '__main__':
    import webbrowser
    os.makedirs(INPUT_DIR, exist_ok=True)
    print("=" * 62)
    print("  🎬  Video Clip Extractor & Merger")
    print("=" * 62)
    print(f"  📁  Put your video in:  {INPUT_DIR}")
    print("  🌐  Open:  http://localhost:5000")
    print("  🛑  Stop:  Ctrl+C")
    print("=" * 62)
    threading.Timer(1.2, lambda: webbrowser.open('http://localhost:5000')).start()
    app.run(host='0.0.0.0', port=5000, debug=False)
