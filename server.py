import os
import json
import uuid
import subprocess
import threading
import tempfile
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# In-memory job tracking
jobs = {}


def run_ffprobe(video_path):
    """Get video metadata using ffprobe."""
    cmd = [
        'ffprobe',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe error: {result.stderr}")
    return json.loads(result.stdout)


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/api/probe', methods=['POST'])
def probe_video():
    """Probe a video file and return metadata (fps, duration, resolution)."""
    data = request.get_json()
    video_path = data.get('path', '').strip()

    if not video_path:
        return jsonify({'error': 'No path provided'}), 400

    # Expand ~ and env vars
    video_path = os.path.expanduser(os.path.expandvars(video_path))

    if not os.path.isfile(video_path):
        return jsonify({'error': f'File not found: {video_path}'}), 404

    try:
        probe = run_ffprobe(video_path)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # Find video stream
    video_stream = None
    for stream in probe.get('streams', []):
        if stream.get('codec_type') == 'video':
            video_stream = stream
            break

    if not video_stream:
        return jsonify({'error': 'No video stream found'}), 400

    # Parse FPS (can be expressed as "24000/1001" or "30/1")
    fps_str = video_stream.get('r_frame_rate', '25/1')
    try:
        num, den = fps_str.split('/')
        fps = float(num) / float(den)
    except Exception:
        fps = 25.0

    duration = float(probe.get('format', {}).get('duration', 0))
    width = int(video_stream.get('width', 0))
    height = int(video_stream.get('height', 0))
    codec = video_stream.get('codec_name', 'unknown')

    return jsonify({
        'fps': round(fps, 4),
        'duration': duration,
        'width': width,
        'height': height,
        'codec': codec,
        'path': video_path
    })


def _do_export(job_id, video_path, clips, output_path):
    """Background worker: cut clips and merge them using FFmpeg."""
    try:
        jobs[job_id]['status'] = 'running'
        jobs[job_id]['progress'] = 0
        jobs[job_id]['message'] = 'Starting export...'

        n = len(clips)
        clip_files = []
        temp_dir = tempfile.mkdtemp(prefix='vidclip_')

        # Step 1: Extract each clip
        for i, clip in enumerate(clips):
            start = clip['start']
            end = clip['end']
            clip_path = os.path.join(temp_dir, f'clip_{i:04d}.mp4')
            clip_files.append(clip_path)

            cmd = [
                'ffmpeg',
                '-y',
                '-ss', str(start),
                '-to', str(end),
                '-i', video_path,
                '-c:v', 'libx264',
                '-an',                      # no audio
                '-avoid_negative_ts', 'make_zero',
                clip_path
            ]

            jobs[job_id]['message'] = f'Extracting clip {i + 1} of {n}...'
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                jobs[job_id]['status'] = 'error'
                jobs[job_id]['error'] = f'FFmpeg error on clip {i + 1}: {result.stderr[-500:]}'
                return

            jobs[job_id]['progress'] = int((i + 1) / n * 80)

        # Step 2: Build concat list
        concat_list_path = os.path.join(temp_dir, 'concat.txt')
        with open(concat_list_path, 'w') as f:
            for clip_path in clip_files:
                f.write(f"file '{clip_path}'\n")

        # Step 3: Concatenate all clips
        jobs[job_id]['message'] = 'Merging clips...'
        cmd = [
            'ffmpeg',
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_list_path,
            '-c', 'copy',
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            jobs[job_id]['status'] = 'error'
            jobs[job_id]['error'] = f'FFmpeg merge error: {result.stderr[-500:]}'
            return

        jobs[job_id]['progress'] = 100
        jobs[job_id]['status'] = 'done'
        jobs[job_id]['message'] = 'Export complete!'
        jobs[job_id]['output_path'] = output_path

    except Exception as e:
        jobs[job_id]['status'] = 'error'
        jobs[job_id]['error'] = str(e)


@app.route('/api/export', methods=['POST'])
def export_clips():
    """Start an async export job."""
    data = request.get_json()
    video_path = data.get('path', '').strip()
    clips = data.get('clips', [])
    output_name = data.get('output_name', 'merged_output.mp4')

    if not video_path or not clips:
        return jsonify({'error': 'Missing path or clips'}), 400

    video_path = os.path.expanduser(os.path.expandvars(video_path))

    if not os.path.isfile(video_path):
        return jsonify({'error': f'File not found: {video_path}'}), 404

    # Output file next to source video
    video_dir = os.path.dirname(video_path)
    output_path = os.path.join(video_dir, output_name)

    # Make output unique if already exists
    base, ext = os.path.splitext(output_path)
    counter = 1
    while os.path.exists(output_path):
        output_path = f"{base}_{counter}{ext}"
        counter += 1

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        'status': 'queued',
        'progress': 0,
        'message': 'Queued',
        'output_path': None,
        'error': None
    }

    thread = threading.Thread(
        target=_do_export,
        args=(job_id, video_path, clips, output_path),
        daemon=True
    )
    thread.start()

    return jsonify({'job_id': job_id})


@app.route('/api/status/<job_id>', methods=['GET'])
def job_status(job_id):
    """Poll the status of an export job."""
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job)


@app.route('/api/open-folder', methods=['POST'])
def open_folder():
    """Open the folder containing the output file."""
    data = request.get_json()
    path = data.get('path', '')
    if path and os.path.exists(os.path.dirname(path)):
        folder = os.path.dirname(path)
        # Try xdg-open on Linux, open on macOS, explorer on Windows
        for cmd in [['xdg-open', folder], ['open', folder], ['explorer', folder]]:
            try:
                subprocess.Popen(cmd)
                return jsonify({'ok': True})
            except FileNotFoundError:
                continue
    return jsonify({'ok': False})


if __name__ == '__main__':
    import webbrowser
    print("=" * 60)
    print("  🎬  Video Clip Extractor & Merger")
    print("=" * 60)
    print("  Server starting at: http://localhost:5000")
    print("  Opening browser...")
    print("  Press Ctrl+C to stop")
    print("=" * 60)
    # Open browser after a short delay
    threading.Timer(1.2, lambda: webbrowser.open('http://localhost:5000')).start()
    app.run(host='0.0.0.0', port=5000, debug=False)
