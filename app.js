/* ═══════════════════════════════════════════════════════════════
   VIDEO CLIP EXTRACTOR — app.js  (v2 — folder-based loading)
═══════════════════════════════════════════════════════════════ */
'use strict';

const API = 'http://localhost:5000/api';

const CLIP_COLORS = [
  '#00e5ff','#00e676','#ff6d00','#d500f9',
  '#ffea00','#00bfa5','#ff4081','#40c4ff',
];

// ── State ────────────────────────────────────────────────────────
const state = {
  videoPath:    null,    // full filesystem path for FFmpeg
  videoName:    null,    // filename for display
  fps:          25,
  duration:     0,
  clips:        [],
  pendingStart: null,
  draggingTimeline: false,
};

// ── DOM ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const video            = $('video-player');
const scanZone         = $('scan-zone');
const scanContentIdle  = $('scan-content-idle');
const scanContentLoad  = $('scan-content-loading');
const scanContentList  = $('scan-content-list');
const videoPickList    = $('video-pick-list');
const scanPathDisplay  = $('scan-path-display');
const videoWrapper     = $('video-wrapper');
const timelineSection  = $('timeline-section');
const controlsBar      = $('controls-bar');
const canvas           = $('timeline-canvas');
const timelineCursor   = $('timeline-cursor');
const ctx              = canvas.getContext('2d');

const btnScan          = $('btn-scan');
const btnScanBig       = $('btn-scan-big');
const btnChangeVideo   = $('btn-change-video');
const videoNameBadge   = $('video-name-badge');
const btnPlay          = $('btn-play-pause');
const iconPlay         = $('icon-play');
const iconPause        = $('icon-pause');
const btnFrameBack     = $('btn-frame-back');
const btnFrameFwd      = $('btn-frame-fwd');
const btnSkipBack      = $('btn-skip-back');
const btnSkipFwd       = $('btn-skip-fwd');
const btnMute          = $('btn-mute');
const iconVol          = $('icon-vol');
const iconMute         = $('icon-mute');
const volumeSlider     = $('volume-slider');
const btnMarkStart     = $('btn-mark-start');
const btnMarkEnd       = $('btn-mark-end');
const btnExport        = $('btn-export');
const pendingInfo      = $('pending-start-info');
const pendingTime      = $('pending-start-time');
const pendingElapsed   = $('pending-elapsed-time');
const timeCurrent      = $('time-current');
const timeTotal        = $('time-total');
const frameNumber      = $('frame-number');
const overlayBigPlay   = $('overlay-big-play');
const clipsEmpty       = $('clips-empty');
const clipsList        = $('clips-list');
const clipsCount       = $('clips-count');
const clipsCountFooter = $('clips-count-footer');
const totalDuration    = $('total-clip-duration');
const btnClearAll      = $('btn-clear-all');
const exportModal      = $('export-modal');
const outputNameInput  = $('output-name');
const exportSummary    = $('export-summary');
const exportProgress   = $('export-progress');
const progressFill     = $('progress-bar-fill');
const progressMsg      = $('progress-message');
const exportResult     = $('export-result');
const resultPath       = $('result-path');
const exportError      = $('export-error');
const errorMessage     = $('error-message');
const modalFooter      = $('modal-footer');
const btnModalCancel   = $('btn-modal-cancel');
const btnModalExport   = $('btn-modal-export');
const btnOpenFolder    = $('btn-open-folder');

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return '00:00:00.000';
  const h  = Math.floor(sec / 3600);
  const m  = Math.floor((sec % 3600) / 60);
  const s  = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${String(ms).padStart(3,'0')}`;
}

function formatShortDuration(sec) {
  if (isNaN(sec) || sec < 0) return '00:00.000';
  const m  = Math.floor(sec / 60);
  const s  = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${pad(m)}:${pad(s)}.${String(ms).padStart(3,'0')}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function showToast(msg, type = 'info', duration = 3000) {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('fade-out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, duration);
}

// ═══════════════════════════════════════════════════════════════
//  SCAN FOLDER
// ═══════════════════════════════════════════════════════════════

async function scanFolder() {
  // Show spinner
  scanContentIdle.style.display = 'none';
  scanContentList.style.display = 'none';
  scanContentLoad.style.display = 'flex';

  try {
    const res  = await fetch(`${API}/scan`);
    const data = await res.json();

    // Show the folder path in the idle screen
    if (scanPathDisplay && data.input_dir) {
      scanPathDisplay.textContent = data.input_dir;
    }

    if (data.error) throw new Error(data.error);

    const videos = data.videos || [];

    if (videos.length === 0) {
      // No video found — go back to idle with helpful message
      scanContentLoad.style.display = 'none';
      scanContentIdle.style.display = 'flex';
      showToast('No video found in input-video folder. Add a video and scan again.', 'error', 5000);
      return;
    }

    if (videos.length === 1) {
      // One video — auto-load it
      await loadVideo(videos[0]);
      return;
    }

    // Multiple — show pick list
    scanContentLoad.style.display = 'none';
    scanContentList.style.display = 'flex';
    renderPickList(videos);

  } catch (err) {
    scanContentLoad.style.display = 'none';
    scanContentIdle.style.display = 'flex';
    showToast(`Scan error: ${err.message}`, 'error', 5000);
  }
}

function renderPickList(videos) {
  videoPickList.innerHTML = '';
  videos.forEach(v => {
    const card = document.createElement('button');
    card.className = 'video-pick-card';
    card.innerHTML = `
      <span class="pick-icon">🎞️</span>
      <span class="pick-name">${v.name}</span>
      <span class="pick-size">${v.size_mb} MB</span>
    `;
    card.addEventListener('click', () => loadVideo(v));
    videoPickList.appendChild(card);
  });
}

btnScan.addEventListener('click', scanFolder);
btnScanBig.addEventListener('click', scanFolder);

// "Change" button — go back to scan zone
btnChangeVideo.addEventListener('click', () => {
  video.pause();
  video.src = '';
  state.videoPath    = null;
  state.videoName    = null;
  state.pendingStart = null;
  state.clips        = [];
  btnMarkEnd.disabled = true;
  pendingInfo.style.display = 'none';
  btnMarkStart.classList.remove('pulsing');

  videoWrapper.style.display    = 'none';
  timelineSection.style.display = 'none';
  controlsBar.style.display     = 'none';
  videoNameBadge.style.display  = 'none';
  scanZone.style.display        = 'flex';
  scanContentIdle.style.display = 'flex';
  scanContentList.style.display = 'none';
  scanContentLoad.style.display = 'none';

  renderClipsList();
});

// ═══════════════════════════════════════════════════════════════
//  LOAD VIDEO
// ═══════════════════════════════════════════════════════════════

async function loadVideo(videoInfo) {
  // videoInfo = { name, path, url, size_mb }
  scanContentLoad.style.display = 'flex';
  scanContentList.style.display = 'none';
  scanContentIdle.style.display = 'none';

  state.videoPath    = videoInfo.path;
  state.videoName    = videoInfo.name;
  state.pendingStart = null;
  state.clips        = [];
  btnMarkEnd.disabled = true;
  pendingInfo.style.display = 'none';
  btnMarkStart.classList.remove('pulsing');
  renderClipsList();

  // Set video source to the server-served URL
  video.src = videoInfo.url;

  // Probe for FPS / duration
  try {
    const res  = await fetch(`${API}/probe`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ path: videoInfo.path })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    state.fps      = data.fps || 25;
    state.duration = data.duration;
  } catch (err) {
    console.warn('Probe failed, defaulting to 25fps:', err);
    state.fps = 25;
    showToast('FPS detection failed — using 25fps estimate', 'error', 4000);
  }

  // Show player UI
  scanZone.style.display        = 'none';
  videoWrapper.style.display    = 'flex';
  timelineSection.style.display = 'block';
  controlsBar.style.display     = 'flex';

  // Show name badge in header
  videoNameBadge.textContent   = videoInfo.name;
  videoNameBadge.style.display = 'flex';

  showToast(`Loaded: ${videoInfo.name}  |  FPS: ${state.fps.toFixed(2)}`, 'success');
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

btnSkipBack.addEventListener('click', () => seekBy(-5));
btnSkipFwd.addEventListener('click',  () => seekBy(5));

function seekBy(delta) {
  if (!video.src) return;
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
}

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

btnMute.addEventListener('click', () => {
  video.muted = !video.muted;
  iconVol.style.display  = video.muted ? 'none'  : 'block';
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
  if (video.paused) { updateTimeDisplay(); drawTimeline(); }
});

function updateTimeDisplay() {
  const t = video.currentTime;
  timeCurrent.textContent = formatTime(t);
  frameNumber.textContent = Math.round(t * state.fps);

  if (state.pendingStart !== null && pendingElapsed) {
    pendingElapsed.textContent = formatShortDuration(Math.max(0, t - state.pendingStart));
  }

  const pct = state.duration > 0 ? t / state.duration : 0;
  timelineCursor.style.left = `${pct * 100}%`;
}

// ── Keyboard shortcuts ───────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  switch (e.code) {
    case 'Space':       e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft':   e.preventDefault(); e.shiftKey ? seekBy(-5) : stepFrame(-1); break;
    case 'ArrowRight':  e.preventDefault(); e.shiftKey ? seekBy(5)  : stepFrame(1);  break;
    case 'KeyS':        if (!e.ctrlKey && !e.metaKey) markStart(); break;
    case 'KeyE':        if (!e.ctrlKey && !e.metaKey) markEnd();   break;
  }
});

// ═══════════════════════════════════════════════════════════════
//  TIMELINE CANVAS
// ═══════════════════════════════════════════════════════════════

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width  = rect.width  * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  canvas.style.width  = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.scale(devicePixelRatio, devicePixelRatio);
}

window.addEventListener('resize', () => { resizeCanvas(); drawTimeline(); });

function drawTimeline() {
  const w   = canvas.width  / devicePixelRatio;
  const h   = canvas.height / devicePixelRatio;
  const dur = state.duration || video.duration || 1;

  ctx.clearRect(0, 0, w, h);

  // Track
  const trackH = 20, trackY = (h - trackH) / 2;
  ctx.fillStyle = '#0d1117';
  roundRect(ctx, 0, trackY, w, trackH, 4); ctx.fill();

  // Tick marks
  ctx.strokeStyle = '#1e2a3a'; ctx.lineWidth = 1;
  const interval = dur > 600 ? 60 : dur > 120 ? 30 : dur > 60 ? 10 : dur > 30 ? 5 : 1;
  for (let t = interval; t < dur; t += interval) {
    const x = (t / dur) * w;
    ctx.beginPath(); ctx.moveTo(x, trackY); ctx.lineTo(x, trackY + trackH); ctx.stroke();
  }

  // Clip regions
  state.clips.forEach(clip => {
    const x1 = (clip.start / dur) * w;
    const x2 = (clip.end   / dur) * w;
    ctx.fillStyle = hexToRgba(clip.color, 0.35);
    roundRect(ctx, x1, trackY, x2 - x1, trackH, 3); ctx.fill();
    ctx.fillStyle = clip.color;
    ctx.fillRect(x1, trackY, 2, trackH);
    ctx.fillRect(x2 - 2, trackY, 2, trackH);
  });

  // Pending start marker
  if (state.pendingStart !== null) {
    const x = (state.pendingStart / dur) * w;
    ctx.fillStyle = '#00e676';
    ctx.fillRect(x - 1, trackY - 3, 2, trackH + 6);
    ctx.font = 'bold 9px Inter,sans-serif';
    ctx.fillText('S', Math.max(2, x - 4), trackY - 6);
  }

  // Playhead
  const px = (video.currentTime / dur) * w;
  const g  = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#00e5ff'); g.addColorStop(1, '#00b4cc');
  ctx.fillStyle = g;
  ctx.fillRect(px - 1, 0, 2, h);
}

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

// Click/drag on timeline to seek
canvas.addEventListener('mousedown', e => { state.draggingTimeline = true; seekToX(e); });
document.addEventListener('mousemove', e => { if (state.draggingTimeline) seekToX(e); });
document.addEventListener('mouseup',   () => { state.draggingTimeline = false; });

function seekToX(e) {
  const rect = canvas.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
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
  btnMarkEnd.disabled = false;
  showToast(`Start: ${formatTime(state.pendingStart)}`, 'info', 2000);
  drawTimeline();
}

function markEnd() {
  if (!video.src || state.pendingStart === null) return;
  video.pause();
  const end = video.currentTime;
  if (end <= state.pendingStart) { showToast('End must be after Start!', 'error'); return; }
  const color = CLIP_COLORS[state.clips.length % CLIP_COLORS.length];
  const dur   = end - state.pendingStart;
  state.clips.push({ start: state.pendingStart, end, color });
  state.pendingStart = null;
  pendingInfo.style.display = 'none';
  btnMarkStart.classList.remove('pulsing');
  btnMarkEnd.disabled = true;
  renderClipsList();
  drawTimeline();
  showToast(`Clip #${state.clips.length} saved — ${formatShortDuration(dur)}`, 'success');
}

// ═══════════════════════════════════════════════════════════════
//  CLIPS PANEL
// ═══════════════════════════════════════════════════════════════

function renderClipsList() {
  clipsList.querySelectorAll('.clip-item').forEach(el => el.remove());

  if (state.clips.length === 0) {
    clipsEmpty.style.display   = 'flex';
    clipsCount.textContent     = '0';
    if (clipsCountFooter) clipsCountFooter.textContent = '0';
    totalDuration.textContent  = '00:00.000';
    btnExport.disabled         = true;
    return;
  }

  clipsEmpty.style.display = 'none';
  clipsCount.textContent   = String(state.clips.length);
  if (clipsCountFooter) clipsCountFooter.textContent = String(state.clips.length);
  btnExport.disabled       = false;

  let total = 0;
  state.clips.forEach((clip, i) => {
    const dur  = clip.end - clip.start;
    total     += dur;
    const item = document.createElement('div');
    item.className       = 'clip-item';
    item.dataset.index   = i;
    item.style.borderLeftColor = clip.color;
    item.innerHTML = `
      <style>.clip-item[data-index="${i}"]::before{background:${clip.color}}</style>
      <div class="clip-item-header">
        <span class="clip-number" style="color:${clip.color}">Clip #${i+1}</span>
        <div class="clip-actions">
          <button class="btn btn-delete btn-goto" data-index="${i}" title="Jump to clip start">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button class="btn btn-delete" data-action="delete" data-index="${i}" title="Delete clip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      </div>
      <div class="clip-times">
        <div class="clip-time-row"><span class="clip-time-label start">START</span><span class="clip-time-val mono">${formatTime(clip.start)}</span></div>
        <div class="clip-time-row"><span class="clip-time-label end">END</span><span class="clip-time-val mono">${formatTime(clip.end)}</span></div>
      </div>
      <div class="clip-duration">Duration: ${formatShortDuration(dur)}</div>
    `;
    clipsList.appendChild(item);
  });

  totalDuration.textContent = formatShortDuration(total);

  clipsList.querySelectorAll('.btn-goto').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      video.currentTime = state.clips[+btn.dataset.index].start;
      video.pause();
    });
  });

  clipsList.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = +btn.dataset.index;
      state.clips.splice(idx, 1);
      renderClipsList(); drawTimeline();
      showToast(`Clip #${idx+1} removed`, 'info', 2000);
    });
  });

  clipsList.querySelectorAll('.clip-item').forEach(item => {
    item.addEventListener('click', () => {
      video.currentTime = state.clips[+item.dataset.index].start;
      video.pause();
    });
  });
}

btnClearAll.addEventListener('click', () => {
  if (!state.clips.length || !confirm('Clear all marked clips?')) return;
  state.clips        = [];
  state.pendingStart = null;
  pendingInfo.style.display = 'none';
  btnMarkStart.classList.remove('pulsing');
  btnMarkEnd.disabled = true;
  renderClipsList(); drawTimeline();
  showToast('All clips cleared', 'info', 2000);
});

// ═══════════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════════

btnExport.addEventListener('click', openExportModal);
btnModalCancel.addEventListener('click', () => exportModal.close());
exportModal.addEventListener('click', e => { if (e.target === exportModal) exportModal.close(); });

function openExportModal() {
  if (!state.clips.length) { showToast('No clips marked yet!', 'error'); return; }
  exportProgress.style.display = 'none';
  exportResult.style.display   = 'none';
  exportError.style.display    = 'none';
  modalFooter.style.display    = 'flex';
  btnModalExport.disabled      = false;
  progressFill.style.width     = '0%';

  const total = state.clips.reduce((s,c) => s + c.end - c.start, 0);
  exportSummary.innerHTML = `<strong>${state.clips.length}</strong> clip${state.clips.length > 1 ? 's' : ''} &nbsp;·&nbsp; Total: <strong>${formatShortDuration(total)}</strong>`;

  // Default output name based on source video
  if (state.videoName) {
    const base = state.videoName.replace(/\.[^.]+$/, '');
    outputNameInput.value = `${base}_clips.mp4`;
  }

  exportModal.showModal();
}

btnModalExport.addEventListener('click', startExport);

async function startExport() {
  const outputName = outputNameInput.value.trim() || 'merged_output.mp4';
  btnModalExport.disabled      = true;
  exportProgress.style.display = 'flex';
  progressFill.style.width     = '5%';
  progressMsg.textContent      = 'Sending to server…';

  try {
    const res  = await fetch(`${API}/export`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        path:        state.videoPath,
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
      progressMsg.textContent  = data.message || 'Processing…';
      setTimeout(() => pollJob(jobId), 800);
    } else if (data.status === 'done') {
      progressFill.style.width = '100%';
      setTimeout(() => {
        exportProgress.style.display = 'none';
        exportResult.style.display   = 'block';
        resultPath.textContent       = data.output_path;
        modalFooter.style.display    = 'none';
      }, 400);
    } else {
      showExportError(data.error || 'Unknown error');
    }
  } catch (err) {
    showExportError('Connection lost: ' + err.message);
  }
}

function showExportError(msg) {
  exportProgress.style.display = 'none';
  exportError.style.display    = 'block';
  errorMessage.textContent     = msg;
  btnModalExport.disabled      = false;
}

btnOpenFolder.addEventListener('click', async () => {
  await fetch(`${API}/open-folder`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: resultPath.textContent })
  });
});

// ═══════════════════════════════════════════════════════════════
//  INIT — auto-scan on load
// ═══════════════════════════════════════════════════════════════

window.addEventListener('load', () => {
  resizeCanvas();
  scanFolder();   // auto-scan the input-video folder on startup
});
