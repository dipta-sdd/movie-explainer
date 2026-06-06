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
  pendingStart:     null,
  editingClipIndex: null,  // index of clip being edited, or null
  insertIndex:      null,  // where to insert the next clip, null = end
  draggingTimeline: false,
  stopAtTime:       null,  // time to auto-pause playback
  autoMarkEndTime:  null,  // time to auto-save clip in playback mode
  previewMode:      false,
  currentPreviewIndex: null,
};

// ── DOM ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const video              = $('video-player');
const uploadZone         = $('upload-zone');
const uploadContentIdle  = $('upload-content-idle');
const uploadContentProg  = $('upload-content-progress');
const videoFileInput     = $('video-file-input');
const btnBrowseBig       = $('btn-browse-big');
const uploadProgressFill = $('upload-progress-fill');
const uploadProgressText = $('upload-progress-text');
const uploadStatusText   = $('upload-status-text');
const videoWrapper     = $('video-wrapper');
const timelineSection  = $('timeline-section');
const controlsBar      = $('controls-bar');
const canvas           = $('timeline-canvas');
const timelineCursor   = $('timeline-cursor');
const ctx              = canvas.getContext('2d');

const btnChangeVideo   = $('btn-change-video');
const btnUploadHeader  = $('btn-upload-header');
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
const btnExportJson    = $('btn-export-json');
const btnImportJson    = $('btn-import-json');
const importJsonUpload = $('import-json-upload');
const btnPreviewAll    = $('btn-preview-all');
const audioUpload      = $('preview-audio-upload');
const audioName        = $('preview-audio-name');
const btnClearAudio    = $('btn-clear-audio');
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
const editModeBanner   = $('edit-mode-banner');
const editModeLabel    = $('edit-mode-label');
const btnEditDone      = $('btn-edit-done');
const lastVideoContainer = $('last-video-container');
const btnLoadLast        = $('btn-load-last');
const lastVideoName      = $('last-video-name');
const btnSettings        = $('btn-settings');
const settingsModal      = $('settings-modal');
const btnSettingsCancel  = $('btn-settings-cancel');
const btnSettingsSave    = $('btn-settings-save');
const settingDuration    = $('setting-duration');

const STORAGE_KEY = 'youtube_script_clips';
const SETTINGS_KEY = 'youtube_script_settings';

const userSettings = {
  autoClipDuration: 4.0,
  autoMarkMode: 'immediate' // 'immediate' or 'playback'
};

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s) {
      if (s.autoClipDuration !== undefined) userSettings.autoClipDuration = s.autoClipDuration;
      if (s.autoMarkMode) userSettings.autoMarkMode = s.autoMarkMode;
    }
  } catch (e) {}
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(userSettings));
}

loadSettings();

// ── Settings UI Logic ──
btnSettings.addEventListener('click', () => {
  settingDuration.value = userSettings.autoClipDuration;
  document.querySelectorAll('input[name="auto-mark-mode"]').forEach(r => {
    r.checked = (r.value === userSettings.autoMarkMode);
  });
  settingsModal.showModal();
});

btnSettingsCancel.addEventListener('click', () => {
  settingsModal.close();
});

btnSettingsSave.addEventListener('click', () => {
  const dur = parseFloat(settingDuration.value);
  if (!isNaN(dur) && dur > 0) {
    userSettings.autoClipDuration = dur;
  }
  const selectedMode = document.querySelector('input[name="auto-mark-mode"]:checked');
  if (selectedMode) {
    userSettings.autoMarkMode = selectedMode.value;
  }
  saveSettings();
  settingsModal.close();
  showToast('Settings saved', 'success', 2000);
});

function saveState() {
  if (!state.videoName) return;
  const data = {
    videoInfo: {
      name: state.videoName,
      path: state.videoPath,
      url: video.src
    },
    clips: state.clips
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadStateFromStorage() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && data.videoInfo) {
      lastVideoName.textContent = data.videoInfo.name;
      lastVideoContainer.style.display = 'block';
      
      btnLoadLast.onclick = () => {
        state.clips = data.clips || [];
        const videoInfo = data.videoInfo;
        videoInfo.keepClips = true;
        loadVideo(videoInfo);
      };
    } else {
      lastVideoContainer.style.display = 'none';
    }
  } catch (e) {
    lastVideoContainer.style.display = 'none';
  }
}

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
//  UPLOAD VIDEO
// ═══════════════════════════════════════════════════════════════

btnBrowseBig.addEventListener('click', () => videoFileInput.click());

videoFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  uploadVideo(file);
});

function uploadVideo(file) {
  uploadContentIdle.style.display = 'none';
  uploadContentProg.style.display = 'flex';
  uploadProgressFill.style.width = '0%';
  uploadProgressText.textContent = '0%';
  uploadStatusText.textContent = 'Uploading Video...';

  const formData = new FormData();
  formData.append('video', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API}/upload`, true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percentComplete = Math.round((e.loaded / e.total) * 100);
      uploadProgressFill.style.width = `${percentComplete}%`;
      uploadProgressText.textContent = `${percentComplete}%`;
    }
  };

  xhr.onload = async () => {
    if (xhr.status === 200) {
      uploadStatusText.textContent = 'Upload Complete. Loading...';
      const data = JSON.parse(xhr.responseText);
      await loadVideo(data);
    } else {
      uploadContentProg.style.display = 'none';
      uploadContentIdle.style.display = 'flex';
      let err = 'Upload failed';
      try { err = JSON.parse(xhr.responseText).error || err; } catch(e){}
      showToast(err, 'error', 5000);
    }
    // clear input so same file can be selected again
    videoFileInput.value = '';
  };

  xhr.onerror = () => {
    uploadContentProg.style.display = 'none';
    uploadContentIdle.style.display = 'flex';
    showToast('Network error during upload', 'error', 5000);
    videoFileInput.value = '';
  };

  xhr.send(formData);
}

function resetToUpload() {
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
  uploadZone.style.display        = 'flex';
  uploadContentIdle.style.display = 'flex';
  uploadContentProg.style.display = 'none';

  renderClipsList();
  
  // Trigger file picker
  videoFileInput.click();
}

btnChangeVideo.addEventListener('click', resetToUpload);
if (btnUploadHeader) {
  btnUploadHeader.addEventListener('click', resetToUpload);
}

// ═══════════════════════════════════════════════════════════════
//  LOAD VIDEO
// ═══════════════════════════════════════════════════════════════

async function loadVideo(videoInfo) {
  // videoInfo = { name, path, url, size_mb }
  uploadZone.style.display = 'none';

  state.videoPath    = videoInfo.path;
  state.videoName    = videoInfo.name;
  state.pendingStart = null;
  if (!videoInfo.keepClips) {
    state.clips = [];
  }
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

let previewAudio = null;
let videoWasMutedBeforePreview = false;

function cancelPreview() {
  if (state.previewMode) {
    state.previewMode = false;
    state.currentPreviewIndex = null;
    if (previewAudio) {
      previewAudio.pause();
      video.muted = videoWasMutedBeforePreview;
      iconVol.style.display  = video.muted ? 'none'  : 'block';
      iconMute.style.display = video.muted ? 'block' : 'none';
    }
  }
}

function togglePlay() {
  if (!video.src) return;
  if (!video.paused) cancelPreview();
  video.paused ? video.play() : video.pause();
}

btnSkipBack.addEventListener('click', () => seekBy(-5));
btnSkipFwd.addEventListener('click',  () => seekBy(5));

function seekBy(delta) {
  if (!video.src) return;
  cancelPreview();
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
}

btnFrameBack.addEventListener('click', () => stepFrame(-1));
btnFrameFwd.addEventListener('click',  () => stepFrame(1));

function stepFrame(dir) {
  if (!video.src) return;
  cancelPreview();
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
  
  if (!video.paused) {
    const t = video.currentTime;
    
    // Auto-pause when reached the end of a clip being replayed
    if (state.stopAtTime !== null && t >= state.stopAtTime) {
      video.pause();
      video.currentTime = state.stopAtTime;
      state.stopAtTime = null;
      
      if (state.previewMode) {
        state.currentPreviewIndex++;
        if (state.currentPreviewIndex < state.clips.length) {
          const nextClip = state.clips[state.currentPreviewIndex];
          video.currentTime = nextClip.start;
          state.stopAtTime = nextClip.end;
          video.play();
        } else {
          state.previewMode = false;
          state.currentPreviewIndex = null;
          showToast('Preview Finished', 'success');
        }
      }
    }
    
    // Auto-mark when reached the duration in playback mode
    if (state.autoMarkEndTime !== null && t >= state.autoMarkEndTime) {
      video.pause();
      video.currentTime = state.autoMarkEndTime;
      markEnd(); // This will save the clip and clear autoMarkEndTime
    }
    
    if (!video.ended) requestAnimationFrame(updateLoop);
  }
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
    case 'ArrowLeft':   e.preventDefault(); (e.shiftKey || !video.paused) ? seekBy(-5) : stepFrame(-1); break;
    case 'ArrowRight':  e.preventDefault(); (e.shiftKey || !video.paused) ? seekBy(5)  : stepFrame(1);  break;
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
  cancelPreview();
  video.currentTime = pct * (state.duration || video.duration || 0);
}

// ═══════════════════════════════════════════════════════════════
//  CLIP MARKING
// ═══════════════════════════════════════════════════════════════

btnMarkStart.addEventListener('click', markStart);
btnMarkEnd.addEventListener('click',   markEnd);

function markStart() {
  if (!video.src) return;

  // ── EDIT MODE: update existing clip's start ──
  if (state.editingClipIndex !== null) {
    const idx = state.editingClipIndex;
    const newStart = video.currentTime;
    if (newStart >= state.clips[idx].end) {
      showToast('Start must be before End!', 'error'); return;
    }
    state.clips[idx].start = newStart;
    renderClipsList(); drawTimeline();
    saveState();
    showToast(`Clip #${idx+1} start → ${formatTime(newStart)}`, 'success', 2000);
    return;
  }

  // ── NORMAL MODE ──
  const start = video.currentTime;
  const durLimit = state.duration || video.duration || start + userSettings.autoClipDuration;
  
  if (userSettings.autoMarkMode === 'immediate') {
    cancelPreview();
    video.pause();
    const end = Math.min(start + userSettings.autoClipDuration, durLimit);
    if (start >= end) { showToast('Cannot create clip here.', 'error'); return; }

    const color = CLIP_COLORS[state.clips.length % CLIP_COLORS.length];
    const newClip = { start, end, color };
    
    const idx = state.insertIndex !== null ? state.insertIndex : state.clips.length;
    state.clips.splice(idx, 0, newClip);
    
    state.insertIndex = idx + 1;
    if (state.insertIndex > state.clips.length) state.insertIndex = null;

    renderClipsList();
    drawTimeline();
    saveState();
    showToast(`Clip auto-saved at position #${idx+1}`, 'success');
  } else {
    // Playback mode
    state.pendingStart = start;
    state.autoMarkEndTime = start + userSettings.autoClipDuration;
    pendingTime.textContent = formatTime(state.pendingStart);
    if (pendingElapsed) pendingElapsed.textContent = '00:00.000';
    pendingInfo.style.display = 'flex';
    btnMarkStart.classList.add('pulsing');
    btnMarkEnd.disabled = false;
    showToast(`Start: ${formatTime(start)} (Playing to auto-end...)`, 'info', 2000);
    drawTimeline();
    video.play();
  }
}

function markEnd() {
  if (!video.src) return;

  // ── EDIT MODE: update existing clip's end ──
  if (state.editingClipIndex !== null) {
    const idx = state.editingClipIndex;
    const newEnd = video.currentTime;
    if (newEnd <= state.clips[idx].start) {
      showToast('End must be after Start!', 'error'); return;
    }
    state.clips[idx].end = newEnd;
    renderClipsList(); drawTimeline();
    saveState();
    showToast(`Clip #${idx+1} end → ${formatTime(newEnd)}`, 'success', 2000);
    return;
  }

  // ── NORMAL MODE ──
  if (state.pendingStart === null) return;
  video.pause();
  const end = video.currentTime;
  if (end <= state.pendingStart) { showToast('End must be after Start!', 'error'); return; }
  const color = CLIP_COLORS[state.clips.length % CLIP_COLORS.length];
  const dur   = end - state.pendingStart;
  
  const newClip = { start: state.pendingStart, end, color };
  const idx = state.insertIndex !== null ? state.insertIndex : state.clips.length;
  state.clips.splice(idx, 0, newClip);
  
  // Advance the insertion pointer so the next clip goes after this one
  state.insertIndex = idx + 1;
  if (state.insertIndex > state.clips.length) state.insertIndex = null;

  state.pendingStart = null;
  state.autoMarkEndTime = null;
  pendingInfo.style.display = 'none';
  btnMarkStart.classList.remove('pulsing');
  btnMarkEnd.disabled = true;
  renderClipsList();
  drawTimeline();
  saveState();
  showToast(`Clip saved at position #${idx+1} — ${formatShortDuration(dur)}`, 'success');
}

// ═══════════════════════════════════════════════════════════════
//  CLIPS PANEL
// ═══════════════════════════════════════════════════════════════

btnPreviewAll.addEventListener('click', () => {
  if (state.clips.length === 0) return;
  state.previewMode = true;
  state.currentPreviewIndex = 0;
  
  if (previewAudio) {
    videoWasMutedBeforePreview = video.muted;
    video.muted = true;
    iconVol.style.display  = 'none';
    iconMute.style.display = 'block';
    previewAudio.currentTime = 0;
    previewAudio.play().catch(e => console.error("Audio play failed", e));
  }
  
  const firstClip = state.clips[0];
  video.currentTime = firstClip.start;
  state.stopAtTime = firstClip.end;
  video.play();
  
  showToast('Playing Preview...', 'info');
});

audioUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (previewAudio) previewAudio.pause();
  
  const url = URL.createObjectURL(file);
  previewAudio = new Audio(url);
  audioName.textContent = file.name;
  btnClearAudio.style.display = 'block';
});

btnClearAudio.addEventListener('click', () => {
  if (previewAudio) previewAudio.pause();
  previewAudio = null;
  audioUpload.value = '';
  audioName.textContent = 'Add BG Audio';
  btnClearAudio.style.display = 'none';
});

function renderClipsList() {
  clipsList.querySelectorAll('.clip-item, .insert-zone').forEach(el => el.remove());

  if (state.clips.length === 0) {
    state.insertIndex = null;
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
  
  // Helper to render an insertion zone
  const renderInsertZone = (idx) => {
    const isEnd = idx === state.clips.length;
    const isActive = (state.insertIndex === idx) || (state.insertIndex === null && isEnd);
    const zone = document.createElement('div');
    zone.className = 'insert-zone' + (isActive ? ' active' : '');
    zone.dataset.idx = idx;
    zone.title = "Insert new clip here";
    zone.innerHTML = `<div class="insert-line"></div>`;
    zone.addEventListener('click', () => {
      state.insertIndex = isEnd ? null : idx;
      renderClipsList();
    });
    clipsList.appendChild(zone);
  };

  state.clips.forEach((clip, i) => {
    // Render insert zone before clip
    renderInsertZone(i);

    const dur  = clip.end - clip.start;
    total     += dur;
    const item = document.createElement('div');
    item.className = 'clip-item' + (state.editingClipIndex === i ? ' editing' : '');
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
          <button class="btn btn-edit-clip" data-index="${i}" title="Edit this clip's in/out points">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
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
      const clip = state.clips[+btn.dataset.index];
      video.currentTime = clip.start;
      state.stopAtTime = clip.end;
      video.play();
    });
  });

  clipsList.querySelectorAll('.btn-edit-clip').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = +btn.dataset.index;
      if (state.editingClipIndex === idx) { exitEditMode(); return; }
      enterEditMode(idx);
    });
  });

  clipsList.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = +btn.dataset.index;
      if (state.editingClipIndex === idx) exitEditMode();
      state.clips.splice(idx, 1);
      // If editing a later clip, adjust index
      if (state.editingClipIndex !== null && state.editingClipIndex > idx) {
        state.editingClipIndex--;
      }
      renderClipsList(); drawTimeline();
      saveState();
      showToast(`Clip #${idx+1} removed`, 'info', 2000);
    });
  });

  clipsList.querySelectorAll('.clip-item').forEach(item => {
    item.addEventListener('click', () => {
      cancelPreview();
      const idx = +item.dataset.index;
      video.currentTime = state.clips[idx].start;
      state.stopAtTime = state.clips[idx].end;
      video.play();
    });
  });

  // Render the final insert zone at the very end
  renderInsertZone(state.clips.length);
}

btnClearAll.addEventListener('click', () => {
  if (!state.clips.length || !confirm('Clear all marked clips?')) return;
  exitEditMode();
  state.clips        = [];
  state.pendingStart = null;
  state.insertIndex  = null;
  pendingInfo.style.display = 'none';
  btnMarkStart.classList.remove('pulsing');
  btnMarkEnd.disabled = true;
  renderClipsList(); drawTimeline();
  saveState();
  showToast('All clips cleared', 'info', 2000);
});

btnExportJson.addEventListener('click', () => {
  if (state.clips.length === 0) return showToast('No clips to export', 'error');
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.clips, null, 2));
  const a = document.createElement('a');
  a.setAttribute("href", dataStr);
  a.setAttribute("download", "clips.json");
  document.body.appendChild(a);
  a.click();
  a.remove();
});

btnImportJson.addEventListener('click', () => importJsonUpload.click());

importJsonUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const clips = JSON.parse(e.target.result);
      if (Array.isArray(clips)) {
        state.clips = clips;
        state.insertIndex = null;
        renderClipsList();
        drawTimeline();
        saveState();
        showToast('Clips imported successfully', 'success');
      } else {
        throw new Error("Invalid format");
      }
    } catch (err) {
      showToast('Invalid JSON file', 'error');
    }
  };
  reader.readAsText(file);
  importJsonUpload.value = '';
});

// ═══════════════════════════════════════════════════════════════
//  EDIT MODE
// ═══════════════════════════════════════════════════════════════

const MARK_START_HTML = btnMarkStart.innerHTML;
const MARK_END_HTML   = btnMarkEnd.innerHTML;

function enterEditMode(idx) {
  // Cancel any pending normal mark
  state.pendingStart = null;
  pendingInfo.style.display = 'none';
  btnMarkStart.classList.remove('pulsing');

  state.editingClipIndex = idx;
  video.currentTime = state.clips[idx].start;
  video.pause();

  // Update banner
  editModeBanner.style.display = 'flex';
  editModeLabel.textContent    = `Editing Clip #${idx + 1}`;

  // Change button labels
  btnMarkStart.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/></svg><span>Update Start</span>`;
  btnMarkEnd.innerHTML   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><span>Update End</span>`;
  btnMarkEnd.disabled = false;

  renderClipsList();
  drawTimeline();
  showToast(`Editing Clip #${idx+1} — navigate and click Update Start / End`, 'info', 4000);
}

function exitEditMode() {
  if (state.editingClipIndex === null) return;
  state.editingClipIndex = null;
  editModeBanner.style.display = 'none';

  // Restore button labels
  btnMarkStart.innerHTML = MARK_START_HTML;
  btnMarkEnd.innerHTML   = MARK_END_HTML;
  btnMarkEnd.disabled    = (state.pendingStart === null);

  renderClipsList();
  drawTimeline();
}

btnEditDone.addEventListener('click', exitEditMode);

// Escape key exits edit mode
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (state.editingClipIndex !== null) exitEditMode();
  }
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
    const formData = new FormData();
    formData.append('path', state.videoPath);
    formData.append('clips', JSON.stringify(state.clips.map(c => ({ start: c.start, end: c.end }))));
    formData.append('output_name', outputName);
    
    if (audioUpload.files[0]) {
      formData.append('audio', audioUpload.files[0]);
    }

    const res  = await fetch(`${API}/export`, {
      method:  'POST',
      body:    formData
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
  loadStateFromStorage();
});
