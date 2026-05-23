/* ═══════════════════════════════════════════════════════════════
   VIDEO CLIP EXTRACTOR — app.js
   YouTube Script Tool for Movie Explainers
═══════════════════════════════════════════════════════════════ */

'use strict';

const API = 'http://localhost:5000/api';

// ── Clip colour palette (cycling) ───────────────────────────────
const CLIP_COLORS = [
  '#00e5ff','#00e676','#ff6d00','#d500f9',
  '#ffea00','#00bfa5','#ff4081','#40c4ff',
];

// ── State ────────────────────────────────────────────────────────
const state = {
  videoPath:    null,
  fps:          25,
  duration:     0,
  clips:        [],          // [{start, end, color}, ...]
  pendingStart: null,        // null or a timestamp (seconds)
  draggingTimeline: false,
};

// ── DOM refs ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const video          = $('video-player');
const dropZone       = $('drop-zone');
const videoWrapper   = $('video-wrapper');
const videoSection   = $('video-section');
const timelineSection= $('timeline-section');
const controlsBar    = $('controls-bar');
const canvas         = $('timeline-canvas');
const timelineCursor = $('timeline-cursor');
const ctx            = canvas.getContext('2d');

const btnLoad        = $('btn-load-video');
const fileInput      = $('file-input');
const pathBar        = $('path-bar');
const videoPathInput = $('video-path-input');
const btnPathBrowse  = $('btn-path-browse');
const btnPlay        = $('btn-play-pause');
const iconPlay       = $('icon-play');
const iconPause      = $('icon-pause');
const btnFrameBack   = $('btn-frame-back');
const btnFrameFwd    = $('btn-frame-fwd');
const btnSkipBack    = $('btn-skip-back');
const btnSkipFwd     = $('btn-skip-fwd');
const btnMute        = $('btn-mute');
const iconVol        = $('icon-vol');
const iconMute       = $('icon-mute');
const volumeSlider   = $('volume-slider');
const btnMarkStart   = $('btn-mark-start');
const btnMarkEnd     = $('btn-mark-end');
const btnExport      = $('btn-export');
const pendingInfo    = $('pending-start-info');
const pendingTime    = $('pending-start-time');
const pendingElapsed = $('pending-elapsed-time');
const timeCurrent    = $('time-current');
const timeTotal      = $('time-total');
const frameNumber    = $('frame-number');
const overlayBigPlay = $('overlay-big-play');
const clipsEmpty     = $('clips-empty');
const clipsList      = $('clips-list');
const clipsCount     = $('clips-count');
const clipsCountFooter = $('clips-count-footer');
const totalDuration  = $('total-clip-duration');
const btnClearAll    = $('btn-clear-all');
const exportModal    = $('export-modal');
const outputNameInput= $('output-name');
const exportSummary  = $('export-summary');
const exportProgress = $('export-progress');
const progressFill   = $('progress-bar-fill');
const progressMsg    = $('progress-message');
const exportResult   = $('export-result');
const resultPath     = $('result-path');
const exportError    = $('export-error');
const errorMessage   = $('error-message');
const modalFooter    = $('modal-footer');
const btnModalCancel = $('btn-modal-cancel');
const btnModalExport = $('btn-modal-export');
const btnOpenFolder  = $('btn-open-folder');

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return '00:00:00.000';
  const h  = Math.floor(sec / 3600);
  const m  = Math.floor((sec % 3600) / 60);
  const s  = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}

function formatShortDuration(sec) {
  if (isNaN(sec) || sec < 0) return '00:00.000';
  const m  = Math.floor(sec / 60);
  const s  = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}

function showToast(msg, type = 'info', duration = 3000) {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ═══════════════════════════════════════════════════════════════
//  VIDEO LOADING
// ═══════════════════════════════════════════════════════════════

btnLoad.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadVideo(file);
  fileInput.value = ''; // reset so same file can be re-selected
});

// Drag-and-drop on drop zone
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) loadVideo(file);
  else showToast('Please drop a video file', 'error');
});

// Browse button on path bar re-opens the file picker (for FFmpeg path only)
btnPathBrowse.addEventListener('click', () => fileInput.click());

// When user edits path manually, probe it to validate
videoPathInput.addEventListener('change', async () => {
  const p = videoPathInput.value.trim();
  if (!p) return;
  await probeVideo(p);
});

async function loadVideo(file) {
  // Create object URL for the <video> element (browser playback)
  const objectURL = URL.createObjectURL(file);
  video.src = objectURL;

  // Show UI
  dropZone.style.display = 'none';
  videoWrapper.style.display = 'flex';
  pathBar.style.display = 'flex';
  timelineSection.style.display = 'block';
  controlsBar.style.display = 'flex';

  // Pre-fill the path input with the filename so user sees it
  // and knows to complete the full path if needed
  videoPathInput.value = file.name;
  videoPathInput.classList.remove('path-ok', 'path-err');

  state.pendingStart = null;
  state.clips = [];
  btnMarkEnd.disabled = true;
  pendingInfo.style.display = 'none';
  renderClipsList();

  showToast(`Loaded: ${file.name} — paste full path in the path bar below video`, 'info', 5000);

  // Probe via backend to get accurate FPS (only if we have a real absolute path)
  if (file.name.startsWith('/')) {
    await probeVideo(file.name);
  }
}

async function probeVideo(path) {
  try {
    const res = await fetch(`${API}/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state.videoPath = data.path;   // server-normalised path
    state.fps       = data.fps || 25;
    state.duration  = data.duration;
    videoPathInput.value = data.path;
    videoPathInput.classList.add('path-ok');
    videoPathInput.classList.remove('path-err');
    showToast(`✔ Path OK — FPS: ${state.fps.toFixed(2)} | ${formatTime(state.duration)}`, 'success');
  } catch (err) {
    videoPathInput.classList.add('path-err');
    videoPathInput.classList.remove('path-ok');
    state.videoPath = videoPathInput.value.trim();
    console.warn('Probe failed:', err);
    showToast(`Path error: ${err.message}`, 'error', 6000);
  }
}

video.addEventListener('loadedmetadata', () => {
  if (!state.duration) state.duration = video.duration;
  timeTotal.textContent = formatTime(video.duration);
  resizeCanvas();
  drawTimeline();
});

// ═══════════════════════════════════════════════════════════════
//  PLAYBACK CONTROLS
// ═══════════════════════════════════════════════════════════════

btnPlay.addEventListener('click', togglePlay);

video.addEventListener('play', () => {
  iconPlay.style.display  = 'none';
  iconPause.style.display = 'block';
  overlayBigPlay.classList.remove('visible');
  requestAnimationFrame(updateLoop);
});

video.addEventListener('pause', () => {
  iconPlay.style.display  = 'block';
  iconPause.style.display = 'none';
  overlayBigPlay.classList.add('visible');
});

video.addEventListener('ended', () => {
  iconPlay.style.display  = 'block';
  iconPause.style.display = 'none';
});

function togglePlay() {
  if (!video.src) return;
  video.paused ? video.play() : video.pause();
}

// Skip buttons
btnSkipBack.addEventListener('click', () => seekBy(-5));
btnSkipFwd.addEventListener('click',  () => seekBy(5));

function seekBy(delta) {
  if (!video.src) return;
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
}

// Frame buttons
btnFrameBack.addEventListener('click', () => stepFrame(-1));
btnFrameFwd.addEventListener('click',  () => stepFrame(1));

function stepFrame(dir) {
  if (!video.src) return;
  video.pause();
  video.currentTime = Math.max(0, Math.min(
    video.duration,
    video.currentTime + dir * (1 / state.fps)
  ));
}

// Mute
btnMute.addEventListener('click', () => {
  video.muted = !video.muted;
  iconVol.style.display  = video.muted ? 'none' : 'block';
  iconMute.style.display = video.muted ? 'block' : 'none';
});

volumeSlider.addEventListener('input', () => {
  video.volume = volumeSlider.value;
  if (video.muted && video.volume > 0) {
    video.muted = false;
    iconVol.style.display  = 'block';
    iconMute.style.display = 'none';
  }
});

// ── Update loop ──────────────────────────────────────────────────
function updateLoop() {
  updateTimeDisplay();
  drawTimeline();
  if (!video.paused && !video.ended) requestAnimationFrame(updateLoop);
}

video.addEventListener('timeupdate', () => {
  if (video.paused) {
    updateTimeDisplay();
    drawTimeline();
  }
});

function updateTimeDisplay() {
  const t = video.currentTime;
  timeCurrent.textContent = formatTime(t);
  frameNumber.textContent = Math.round(t * state.fps);

  // Show elapsed time from pending start → current frame
  if (state.pendingStart !== null && pendingElapsed) {
    const elapsed = Math.max(0, t - state.pendingStart);
    pendingElapsed.textContent = formatShortDuration(elapsed);
  }

  // Move cursor
  const pct = state.duration > 0 ? t / state.duration : 0;
  timelineCursor.style.left = `${pct * 100}%`;
}

// ── Keyboard shortcuts ───────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Don't fire when typing in an input
  if (e.target.tagName === 'INPUT') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (e.shiftKey) seekBy(-5);
      else stepFrame(-1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (e.shiftKey) seekBy(5);
      else stepFrame(1);
      break;
    case 'KeyS':
      if (!e.ctrlKey && !e.metaKey) markStart();
      break;
    case 'KeyE':
      if (!e.ctrlKey && !e.metaKey) markEnd();
      break;
  }
});

// ═══════════════════════════════════════════════════════════════
//  TIMELINE CANVAS
// ═══════════════════════════════════════════════════════════════

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width  = rect.width  * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  canvas.style.width  = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

window.addEventListener('resize', () => { resizeCanvas(); drawTimeline(); });

function drawTimeline() {
  const w = canvas.width  / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;
  const dur = state.duration || video.duration || 1;

  ctx.clearRect(0, 0, w, h);

  // Track background
  const trackH = 18;
  const trackY = (h - trackH) / 2;
  ctx.fillStyle = '#0d1117';
  roundRect(ctx, 0, trackY, w, trackH, 4);
  ctx.fill();

  // Tick marks
  ctx.strokeStyle = '#1e2a3a';
  ctx.lineWidth = 1;
  const tickInterval = dur > 600 ? 60 : dur > 120 ? 30 : dur > 60 ? 10 : dur > 30 ? 5 : 1;
  for (let t = tickInterval; t < dur; t += tickInterval) {
    const x = (t / dur) * w;
    ctx.beginPath();
    ctx.moveTo(x, trackY);
    ctx.lineTo(x, trackY + trackH);
    ctx.stroke();
  }

  // Clip regions
  state.clips.forEach((clip, i) => {
    const x1 = (clip.start / dur) * w;
    const x2 = (clip.end   / dur) * w;
    const color = clip.color;

    ctx.fillStyle = hexToRgba(color, 0.35);
    roundRect(ctx, x1, trackY, x2 - x1, trackH, 3);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.fillRect(x1, trackY, 2, trackH);
    ctx.fillRect(x2 - 2, trackY, 2, trackH);
  });

  // Pending start marker
  if (state.pendingStart !== null) {
    const x = (state.pendingStart / dur) * w;
    ctx.fillStyle = '#00e676';
    ctx.fillRect(x - 1, trackY - 2, 2, trackH + 4);
    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillStyle = '#00e676';
    ctx.fillText('S', Math.max(2, x - 4), trackY - 5);
  }

  // Playhead
  const px = (video.currentTime / dur) * w;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#00e5ff');
  grad.addColorStop(1, '#00b4cc');
  ctx.fillStyle = grad;
  ctx.fillRect(px - 1, 0, 2, h);
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Click on timeline to seek
canvas.addEventListener('mousedown', e => {
  state.draggingTimeline = true;
  seekToMouseX(e);
});

document.addEventListener('mousemove', e => {
  if (state.draggingTimeline) seekToMouseX(e, canvas);
});

document.addEventListener('mouseup', () => {
  state.draggingTimeline = false;
});

function seekToMouseX(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, x / rect.width));
  video.currentTime = pct * (state.duration || video.duration || 0);
}

// ═══════════════════════════════════════════════════════════════
//  CLIP MARKING
// ═══════════════════════════════════════════════════════════════

btnMarkStart.addEventListener('click', markStart);
btnMarkEnd.addEventListener('click',   markEnd);

function markStart() {
  if (!video.src) return;
  video.pause();
  state.pendingStart = video.currentTime;
  pendingTime.textContent = formatTime(state.pendingStart);
  if (pendingElapsed) pendingElapsed.textContent = '00:00.000';
  pendingInfo.style.display = 'flex';
  btnMarkStart.classList.add('pulsing');
  btnMarkEnd.disabled = false;           // ← enable End now that Start is set
  showToast(`Start marked at ${formatTime(state.pendingStart)}`, 'info', 2000);
  drawTimeline();
}

function markEnd() {
  if (!video.src) return;
  if (state.pendingStart === null) {
    showToast('Please mark a START point first!', 'error');
    return;
  }
  video.pause();
  const end = video.currentTime;
  if (end <= state.pendingStart) {
    showToast('End must be after Start!', 'error');
    return;
  }
  const color = CLIP_COLORS[state.clips.length % CLIP_COLORS.length];
  state.clips.push({ start: state.pendingStart, end, color });
  state.pendingStart = null;
  pendingInfo.style.display = 'none';
  btnMarkStart.classList.remove('pulsing');
  btnMarkEnd.disabled = true;            // ← disable End until next Start
  renderClipsList();
  drawTimeline();
  showToast(`Clip #${state.clips.length} added (${formatShortDuration(end - state.clips[state.clips.length-1].start)})`, 'success');
}

// ═══════════════════════════════════════════════════════════════
//  CLIPS PANEL
// ═══════════════════════════════════════════════════════════════

function renderClipsList() {
  // Remove old clip items (not the empty state)
  const items = clipsList.querySelectorAll('.clip-item');
  items.forEach(el => el.remove());

  if (state.clips.length === 0) {
    clipsEmpty.style.display = 'flex';
    clipsCount.textContent = '0';
    if (clipsCountFooter) clipsCountFooter.textContent = '0';
    totalDuration.textContent = '00:00.000';
    btnExport.disabled = true;
    return;
  }

  clipsEmpty.style.display = 'none';
  clipsCount.textContent = String(state.clips.length);
  if (clipsCountFooter) clipsCountFooter.textContent = String(state.clips.length);
  btnExport.disabled = false;

  let totalSec = 0;
  state.clips.forEach((clip, i) => {
    const dur = clip.end - clip.start;
    totalSec += dur;
    const item = document.createElement('div');
    item.className = 'clip-item';
    item.dataset.index = i;
    item.style.setProperty('--clip-accent', clip.color);
    item.style.borderLeftColor = clip.color;
    item.innerHTML = `
      <style>.clip-item[data-index="${i}"]::before { background: ${clip.color}; }</style>
      <div class="clip-item-header">
        <span class="clip-number" style="color:${clip.color}">Clip #${i+1}</span>
        <div class="clip-actions">
          <button class="btn btn-delete btn-goto" title="Jump to this clip" data-index="${i}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
          <button class="btn btn-delete" title="Delete clip" data-index="${i}" data-action="delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="clip-times">
        <div class="clip-time-row">
          <span class="clip-time-label start">START</span>
          <span class="clip-time-val mono">${formatTime(clip.start)}</span>
        </div>
        <div class="clip-time-row">
          <span class="clip-time-label end">END</span>
          <span class="clip-time-val mono">${formatTime(clip.end)}</span>
        </div>
      </div>
      <div class="clip-duration">Duration: ${formatShortDuration(dur)}</div>
    `;
    clipsList.appendChild(item);
  });

  totalDuration.textContent = formatShortDuration(totalSec);

  // Bind events
  clipsList.querySelectorAll('.btn-goto').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      video.currentTime = state.clips[idx].start;
      video.pause();
    });
  });

  clipsList.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      state.clips.splice(idx, 1);
      renderClipsList();
      drawTimeline();
      showToast(`Clip #${idx+1} removed`, 'info', 2000);
    });
  });

  clipsList.querySelectorAll('.clip-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      video.currentTime = state.clips[idx].start;
      video.pause();
    });
  });
}

btnClearAll.addEventListener('click', () => {
  if (state.clips.length === 0) return;
  if (!confirm('Clear all marked clips?')) return;
  state.clips = [];
  state.pendingStart = null;
  pendingInfo.style.display = 'none';
  btnMarkStart.classList.remove('pulsing');
  btnMarkEnd.disabled = true;   // ← reset End button
  renderClipsList();
  drawTimeline();
  showToast('All clips cleared', 'info', 2000);
});

// ═══════════════════════════════════════════════════════════════
//  EXPORT MODAL
// ═══════════════════════════════════════════════════════════════

btnExport.addEventListener('click', openExportModal);
btnModalCancel.addEventListener('click', closeExportModal);

function openExportModal() {
  if (state.clips.length === 0) {
    showToast('No clips marked yet!', 'error');
    return;
  }
  // Reset modal state
  exportProgress.style.display = 'none';
  exportResult.style.display   = 'none';
  exportError.style.display    = 'none';
  modalFooter.style.display    = 'flex';
  btnModalExport.disabled = false;
  progressFill.style.width = '0%';
  progressMsg.textContent  = '';

  // Summary
  const total = state.clips.reduce((s,c) => s + (c.end - c.start), 0);
  exportSummary.innerHTML = `
    <strong>${state.clips.length}</strong> clip${state.clips.length > 1 ? 's' : ''} &nbsp;|&nbsp;
    Total duration: <strong>${formatShortDuration(total)}</strong>
  `;

  exportModal.showModal();
}

function closeExportModal() {
  exportModal.close();
}

exportModal.addEventListener('click', e => {
  if (e.target === exportModal) closeExportModal();
});

btnModalExport.addEventListener('click', startExport);

async function startExport() {
  const outputName = outputNameInput.value.trim() || 'merged_output.mp4';

  // Also use the path from the input bar as fallback if not yet probed
  if (!state.videoPath) {
    state.videoPath = videoPathInput ? videoPathInput.value.trim() : null;
  }

  btnModalExport.disabled = true;
  exportProgress.style.display = 'flex';
  progressFill.style.width = '5%';
  progressMsg.textContent  = 'Sending to server...';

  const pathToUse = state.videoPath || (videoPathInput ? videoPathInput.value.trim() : '');

  try {
    const res = await fetch(`${API}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path:        pathToUse,
        clips:       state.clips.map(c => ({ start: c.start, end: c.end })),
        output_name: outputName
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    pollJob(data.job_id);
  } catch (err) {
    showExportError(err.message);
  }
}

async function pollJob(jobId) {
  try {
    const res  = await fetch(`${API}/status/${jobId}`);
    const data = await res.json();

    if (data.status === 'running' || data.status === 'queued') {
      progressFill.style.width = `${data.progress || 5}%`;
      progressMsg.textContent  = data.message || 'Processing...';
      setTimeout(() => pollJob(jobId), 800);
    } else if (data.status === 'done') {
      progressFill.style.width = '100%';
      progressMsg.textContent  = 'Complete!';
      setTimeout(() => {
        exportProgress.style.display = 'none';
        exportResult.style.display   = 'block';
        resultPath.textContent = data.output_path;
        modalFooter.style.display = 'none';
      }, 400);
    } else if (data.status === 'error') {
      showExportError(data.error || 'Unknown error');
    }
  } catch (err) {
    showExportError('Lost connection to server: ' + err.message);
  }
}

function showExportError(msg) {
  exportProgress.style.display = 'none';
  exportError.style.display    = 'block';
  errorMessage.textContent     = msg;
  btnModalExport.disabled = false;
}

btnOpenFolder.addEventListener('click', async () => {
  await fetch(`${API}/open-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: resultPath.textContent })
  });
});

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════

btnExport.disabled = true;

// Draw empty timeline on start (just the track)
window.addEventListener('load', () => {
  resizeCanvas();
});
