/* app.js — form state, live preview, and export wiring. */
import { DEFAULT_STYLE, computeLayout, buildChapters, renderFrame, visualProgressFromTime } from './bar-engine.js?v=11';
import { exportOverlay } from './export-overlay.js?v=11';
import { burnIn, isBurnInSupported } from './export-burnin.js?v=11';

// ---------- color helpers (rows store rgb as 0..1 triplets) ----------
const PALETTE_HEX = ['#0f6e57', '#388add', '#734db8', '#bf4d26', '#bf9926'];
function hexToRgb01(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
function rgb01ToHex(rgb) {
  return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
}

// ---------- duration helpers ----------
function parseDuration(str) {
  if (typeof str !== 'string') return Number(str) || 0;
  str = str.trim();
  if (str.includes(':')) {
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  return parseFloat(str) || 0;
}
function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
// Sub-second precision for captured chapter starts → "m:ss.mmm"
function formatDurationPrecise(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const chaptersEl = $('chapters');
const canvas = $('preview');
const ctx = canvas.getContext('2d');

let widthMode = 'length'; // 'length' | 'equal'
let layoutMode = 'bar';   // 'bar' | 'circle'
let barDirection = 'ltr'; // 'ltr' | 'rtl' — chapter order + playhead direction

const previewVideo = $('previewVideo');
let videoReady = false;   // a video is loaded into the preview
let srtCues = [];         // parsed subtitle cues
let scrubbing = false;    // user is dragging the scrubber right now

// ---------- chapter rows ----------
function defaultRows() {
  return [
    { name: 'פתיחה', start: '0:00', hex: PALETTE_HEX[0] },
    { name: 'נושא ראשון', start: '1:24', hex: PALETTE_HEX[1] },
    { name: 'נושא שני', start: '3:17', hex: PALETTE_HEX[2] },
    { name: 'סיכום', start: '8:20', hex: PALETTE_HEX[3] },
  ];
}

function addChapterRow(data) {
  const idx = chaptersEl.children.length;
  const d = data || { name: '', start: '', hex: PALETTE_HEX[idx % PALETTE_HEX.length] };
  const row = document.createElement('div');
  row.className = 'chapter-row';
  row.innerHTML = `
    <input type="text" class="ch-name" placeholder="שם הפרק" value="${escapeHtml(d.name)}" />
    <input type="text" class="ch-start" placeholder="0:00" value="${escapeHtml(d.start || '')}" />
    <div class="color-cell"><input type="color" class="ch-color" value="${d.hex}" /></div>
    <button type="button" class="ch-capture btn-capture" title="קבע לזמן הנוכחי בתצוגה">◎</button>
    <button type="button" class="btn-remove" title="הסרה">×</button>
  `;
  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    onFormChange();
  });
  row.querySelector('.ch-capture').addEventListener('click', () => {
    const { videoLength } = getState();
    row.querySelector('.ch-start').value = formatDurationPrecise(progress * videoLength);
    onFormChange();
  });
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', onFormChange));
  chaptersEl.appendChild(row);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function readRows() {
  return [...chaptersEl.querySelectorAll('.chapter-row')].map(row => ({
    name: row.querySelector('.ch-name').value,
    startSec: parseDuration(row.querySelector('.ch-start').value),
    rgb: hexToRgb01(row.querySelector('.ch-color').value),
  }));
}

// ---------- state assembly ----------
function readStyle() {
  const tc = hexToRgb01($('textColor').value);
  const pc = hexToRgb01($('playheadColor').value);
  const sc = hexToRgb01($('subColor').value);
  return {
    ...DEFAULT_STYLE,
    barHFrac: parseFloat($('barHFrac').value),
    barYCenterFrac: parseFloat($('barYCenterFrac').value),
    cornerRadiusFrac: parseFloat($('cornerRadiusFrac').value),
    labelSizeFrac: parseFloat($('labelSizeFrac').value),
    fontFamily: $('fontFamily').value,
    layout: layoutMode,
    direction: barDirection,
    circleSizeFrac: parseFloat($('circleSizeFrac').value),
    circlePos: $('circlePos').value,
    circleThicknessFrac: parseFloat($('circleThicknessFrac').value),
    playheadStyle: $('playheadStyle').value,
    playheadWidthFrac: parseFloat($('playheadWidthFrac').value),
    bgRGBA: [DEFAULT_STYLE.bgRGBA[0], DEFAULT_STYLE.bgRGBA[1], DEFAULT_STYLE.bgRGBA[2], parseInt($('bgOpacity').value, 10)],
    labelRGBA: [Math.round(tc[0] * 255), Math.round(tc[1] * 255), Math.round(tc[2] * 255), 235],
    playheadRGBA: [Math.round(pc[0] * 255), Math.round(pc[1] * 255), Math.round(pc[2] * 255), 230],
    subSizeFrac: parseFloat($('subSizeFrac').value),
    subPosFrac: parseFloat($('subPosFrac').value),
    subRGBA: [Math.round(sc[0] * 255), Math.round(sc[1] * 255), Math.round(sc[2] * 255), 255],
    subBgRGBA: [0, 0, 0, parseInt($('subBgOpacity').value, 10)],
  };
}

function readResolution() {
  const [w, h] = $('resolution').value.split('x').map(Number);
  return { width: w, height: h };
}

function getState() {
  const rows = readRows();
  const style = readStyle();
  const { width, height } = readResolution();
  const fps = parseInt($('fps').value, 10);
  const videoLength = Math.max(0.1, parseDuration($('videoLength').value));
  const chapters = buildChapters(rows, widthMode, videoLength, style);
  return { rows, style, width, height, fps, videoLength, widthMode, chapters, subtitles: srtCues };
}

// Make sure a (Google) font is actually downloaded before we render with it on canvas.
async function ensureFontLoaded(family) {
  if (!document.fonts || family === 'Arial') return;
  try {
    await Promise.all([
      document.fonts.load(`bold 48px "${family}"`),
      document.fonts.load(`400 48px "${family}"`),
    ]);
  } catch (_) { /* fall back to whatever is available */ }
}

// ---------- preview ----------
let progress = 0;       // 0..1
let playing = false;
let lastTs = 0;

function drawPreview() {
  const { style, width, height, chapters, videoLength, subtitles } = getState();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const layout = computeLayout(width, height, style);
  const elapsedSec = progress * videoLength;
  const visual = visualProgressFromTime(elapsedSec, chapters);
  renderFrame(ctx, { progress: visual, elapsedSec, chapters, width, height, layout, style, subtitles });
  updateTimeLabel();
  validateLengths();
}

function updateTimeLabel() {
  const { videoLength } = getState();
  $('timeLabel').textContent = formatDuration(progress * videoLength);
  if (!scrubbing) $('scrub').value = Math.round(progress * 1000); // don't fight the user's drag
}

function loop(ts) {
  if (!playing) return;
  const { videoLength } = getState();
  if (videoReady) {
    // Drive progress from the actual video playback (keeps bar synced to the frame).
    progress = Math.min(1, previewVideo.currentTime / videoLength);
    if (previewVideo.ended) { playing = false; $('playBtn').textContent = '▶'; }
  } else {
    if (!lastTs) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    progress += dt / videoLength;
    if (progress >= 1) { progress = 0; }
  }
  drawPreview();
  if (playing) requestAnimationFrame(loop);
}

function onFormChange() {
  drawPreview();
}

// ---------- export wiring ----------
const statusBox = $('exportStatus');
const progressFill = $('exportProgress');
const statusText = $('exportStatusText');

function onProgress(frac, msg) {
  statusBox.hidden = false;
  progressFill.style.width = `${Math.round(frac * 100)}%`;
  if (msg) statusText.textContent = msg;
}
function onDone(msg) {
  progressFill.style.width = '100%';
  statusText.textContent = msg || 'הסתיים!';
}
function onError(err) {
  statusBox.hidden = false;
  statusText.textContent = '⚠ שגיאה: ' + (err && err.message ? err.message : err);
  console.error(err);
}

$('exportOverlay').addEventListener('click', async () => {
  const state = getState();
  const wasPlaying = playing;
  playing = false;
  try {
    setExporting(true);
    await ensureFontLoaded(state.style.fontFamily);
    await exportOverlay(state, { onProgress, onDone, onError });
  } catch (e) { onError(e); }
  finally { setExporting(false); if (wasPlaying) togglePlay(true); }
});

let pickedFile = null;
let exporting = false;
let formValid = true;

$('videoFile').addEventListener('change', async (e) => {
  pickedFile = e.target.files[0] || null;
  updateExportButtons();
  if (!pickedFile) {
    videoReady = false;
    previewVideo.hidden = true;
    document.querySelector('.checkerboard').style.display = '';
    $('videoMeta').hidden = true;
    drawPreview();
    return;
  }
  try { await probeAndLoadVideo(pickedFile); }
  catch (err) { console.error(err); }
  drawPreview();
});

// Load a video from a pasted URL (works only for direct, CORS-enabled links).
function toDirectVideoUrl(u) {
  const m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/) || u.match(/[?&]id=([^&]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  return u;
}
$('loadUrl').addEventListener('click', async () => {
  const raw = $('videoUrl').value.trim();
  if (!raw) return;
  const meta = $('urlMeta');
  meta.hidden = false; meta.className = 'support-note'; meta.textContent = 'טוען מהקישור…';
  try {
    const resp = await fetch(toDirectVideoUrl(raw), { mode: 'cors' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    if (!/^video\//.test(blob.type) && blob.type !== '' && blob.type !== 'application/octet-stream') {
      throw new Error('not-video'); // e.g. Drive returned an HTML warning page
    }
    pickedFile = new File([blob], 'video-from-link.mp4', { type: blob.type || 'video/mp4' });
    updateExportButtons();
    await probeAndLoadVideo(pickedFile);
    meta.className = 'support-note ok'; meta.textContent = 'נטען בהצלחה!';
    drawPreview();
  } catch (err) {
    meta.className = 'support-note warn';
    if (/drive\.google\.com/.test(raw)) {
      meta.textContent = 'לא ניתן לטעון קישור של Google Drive ישירות בדפדפן (מגבלת אבטחה של גוגל). הורידו את הקובץ מהדרייב ואז העלו אותו כקובץ למעלה.';
    } else {
      meta.textContent = 'לא ניתן לטעון את הקישור (כנראה בגלל הגבלת CORS של האתר המארח). צריך קישור ישיר לקובץ וידאו, או פשוט להוריד ולהעלות את הקובץ.';
    }
    console.error(err);
  }
});

// Load the picked video into the preview and auto-detect duration / resolution / fps.
async function probeAndLoadVideo(file) {
  const url = URL.createObjectURL(file);
  previewVideo.src = url;
  previewVideo.hidden = false;
  await new Promise((res) => {
    previewVideo.onloadedmetadata = res;
    previewVideo.onerror = res;
  });
  const dur = previewVideo.duration || 0;
  const vw = previewVideo.videoWidth, vh = previewVideo.videoHeight;
  if (dur > 0) $('videoLength').value = formatDuration(dur);
  if (vw && vh) setResolutionOption(vw, vh);
  const fps = await measureFps(previewVideo);
  const snapped = fps ? setFpsClosest(fps) : null;

  videoReady = true;
  document.querySelector('.checkerboard').style.display = 'none';
  $('videoMeta').hidden = false;
  $('videoMeta').textContent = `זוהה: ${formatDuration(dur)} · ${vw}×${vh}${snapped ? ` · ${snapped} FPS` : ''}`;
  progress = 0;
  previewVideo.currentTime = 0;
}

function setResolutionOption(w, h) {
  const sel = $('resolution');
  let opt = sel.querySelector('option[data-detected]');
  if (!opt) { opt = document.createElement('option'); opt.dataset.detected = '1'; sel.insertBefore(opt, sel.firstChild); }
  opt.value = `${w}x${h}`;
  opt.textContent = `${w}×${h} — הסרטון שלכם`;
  sel.value = `${w}x${h}`;
}

function setFpsClosest(fps) {
  const presets = [24, 25, 30, 50, 60];
  const nearest = presets.reduce((a, b) => Math.abs(b - fps) < Math.abs(a - fps) ? b : a);
  $('fps').value = String(nearest);
  return nearest;
}

// Estimate fps by sampling presented frames over ~0.4s of muted playback.
function measureFps(video) {
  return new Promise((resolve) => {
    if (!video.requestVideoFrameCallback) return resolve(null);
    let first = null, done = false;
    const finish = (val) => { if (done) return; done = true; try { video.pause(); video.currentTime = 0; } catch (_) {} resolve(val); };
    const wasMuted = video.muted; video.muted = true;
    const onFrame = (now, meta) => {
      if (first === null) { first = meta; }
      const df = meta.presentedFrames - first.presentedFrames;
      const dt = meta.mediaTime - first.mediaTime;
      if (dt >= 0.4 && df > 2) { video.muted = wasMuted; finish(df / dt); return; }
      if (!done) video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
    video.play().catch(() => finish(null));
    setTimeout(() => { video.muted = wasMuted; finish(null); }, 2500);
  });
}

// ---------- subtitles (SRT) ----------
$('srtFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) { srtCues = []; $('subtitleCard').hidden = true; $('srtMeta').hidden = true; drawPreview(); return; }
  const text = await f.text();
  srtCues = parseSRT(text);
  $('subtitleCard').hidden = srtCues.length === 0;
  $('srtMeta').hidden = false;
  $('srtMeta').textContent = srtCues.length ? `נטענו ${srtCues.length} כתוביות.` : 'לא נמצאו כתוביות בקובץ.';
  drawPreview();
});

function parseSRT(text) {
  const cues = [];
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const m = lines[ti].match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/);
    if (!m) continue;
    const txt = lines.slice(ti + 1).join('\n');
    if (txt) cues.push({ startSec: srtTime(m[1]), endSec: srtTime(m[2]), text: txt });
  }
  return cues;
}
function srtTime(s) {
  const [hms, ms] = s.replace('.', ',').split(',');
  const [h, m, sec] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + sec + (Number(ms) || 0) / 1000;
}

$('exportBurnin').addEventListener('click', async () => {
  if (!pickedFile) return;
  const state = getState();
  playing = false;
  try {
    setExporting(true);
    await ensureFontLoaded(state.style.fontFamily);
    await burnIn(pickedFile, state, { onProgress, onDone, onError });
  } catch (e) { onError(e); }
  finally { setExporting(false); }
});

function updateExportButtons() {
  $('exportOverlay').disabled = exporting || !formValid;
  $('exportBurnin').disabled = exporting || !formValid || !(pickedFile && isBurnInSupported());
}

function setExporting(on) {
  exporting = on;
  updateExportButtons();
  if (on) { statusBox.hidden = false; progressFill.style.width = '0%'; }
}

// The video length must be longer than the last chapter's start time, otherwise
// the final chapter(s) would have zero/negative length. Warn + block export.
function validateLengths() {
  const rows = readRows();
  const maxStart = rows.length ? Math.max(...rows.map(r => r.startSec || 0)) : 0;
  const vlen = parseDuration($('videoLength').value);
  formValid = vlen > maxStart + 0.001;
  const warn = $('lengthWarn');
  if (formValid) {
    warn.hidden = true;
  } else {
    warn.hidden = false;
    warn.textContent = `⚠ אורך הסרטון חייב להיות גדול מזמן ההתחלה של הפרק האחרון (${formatDuration(maxStart)}).`;
  }
  updateExportButtons();
}

// ---------- play controls ----------
function togglePlay(force) {
  playing = force !== undefined ? force : !playing;
  $('playBtn').textContent = playing ? '⏸' : '▶';
  if (videoReady) {
    if (playing) { previewVideo.muted = false; previewVideo.play().catch(() => {}); }
    else { previewVideo.pause(); }
  }
  if (playing) { lastTs = 0; requestAnimationFrame(loop); }
}
$('playBtn').addEventListener('click', () => togglePlay());
// Seek WITHOUT stopping playback — drag the playhead and keep listening.
$('scrub').addEventListener('pointerdown', () => { scrubbing = true; });
['pointerup', 'pointercancel', 'change'].forEach(ev => $('scrub').addEventListener(ev, () => { scrubbing = false; }));
$('scrub').addEventListener('input', (e) => {
  progress = e.target.value / 1000;
  if (videoReady) { const { videoLength } = getState(); previewVideo.currentTime = progress * videoLength; }
  if (!playing) drawPreview(); // while playing, the loop already redraws every frame
});

// ---------- bind global controls ----------
['barHFrac', 'barYCenterFrac', 'cornerRadiusFrac', 'labelSizeFrac', 'bgOpacity', 'fps', 'resolution', 'videoLength', 'textColor', 'playheadColor', 'playheadWidthFrac', 'playheadStyle', 'circleSizeFrac', 'circlePos', 'circleThicknessFrac', 'subSizeFrac', 'subPosFrac', 'subColor', 'subBgOpacity']
  .forEach(id => { const el = $(id); if (el) el.addEventListener('input', drawPreview); });

// "new chapter from current position" capture button (under the scrubber)
$('captureChapter').addEventListener('click', () => {
  const { videoLength } = getState();
  addChapterRow({ name: '', start: formatDurationPrecise(progress * videoLength), hex: PALETTE_HEX[chaptersEl.children.length % PALETTE_HEX.length] });
  onFormChange();
  const rows = chaptersEl.querySelectorAll('.chapter-row');
  rows[rows.length - 1].querySelector('.ch-name').focus();
});

// direction (LTR / RTL) segmented toggle
$('barDirection').querySelectorAll('.seg').forEach(btn => {
  btn.addEventListener('click', () => {
    barDirection = btn.dataset.dir;
    $('barDirection').querySelectorAll('.seg').forEach(b => b.classList.toggle('active', b === btn));
    $('scrub').dir = barDirection;  // keep the scrubber thumb moving the same way as the bar
    drawPreview();
  });
});
$('scrub').dir = barDirection; // initial

// layout (bar vs circle) segmented toggle
$('layout').querySelectorAll('.seg').forEach(btn => {
  btn.addEventListener('click', () => {
    layoutMode = btn.dataset.layout;
    $('layout').querySelectorAll('.seg').forEach(b => b.classList.toggle('active', b === btn));
    $('barControls').hidden = layoutMode !== 'bar';
    $('circleControls').hidden = layoutMode !== 'circle';
    $('layoutHint').textContent = layoutMode === 'circle'
      ? 'מחוון עגול שמראה את הפרק הנוכחי וספירה לאחור — ממוקם בפינת הסרטון.'
      : 'פס התקדמות אופקי לרוחב הסרטון.';
    drawPreview();
  });
});
$('fontFamily').addEventListener('change', async () => {
  await ensureFontLoaded($('fontFamily').value);
  drawPreview();
});

// Redraw once the Google fonts have finished loading so the preview uses them.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(drawPreview);
}
$('addChapter').addEventListener('click', () => { addChapterRow(); onFormChange(); });

// width-mode segmented toggle
$('widthMode').querySelectorAll('.seg').forEach(btn => {
  btn.addEventListener('click', () => {
    widthMode = btn.dataset.mode;
    $('widthMode').querySelectorAll('.seg').forEach(b => b.classList.toggle('active', b === btn));
    drawPreview();
  });
});

// ---------- burn-in support note ----------
(function () {
  const note = $('burninSupport');
  if (isBurnInSupported()) {
    note.textContent = '✓ הדפדפן שלכם תומך בצריבה.';
    note.className = 'support-note ok';
  } else {
    note.textContent = '⚠ הצריבה דורשת דפדפן Chrome או Edge במחשב. במכשירים אחרים השתמשו באפשרות השכבה השקופה.';
    note.className = 'support-note warn';
  }
})();

// ---------- collapsible cards ----------
function makeCollapsible(card, open) {
  if (!card) return;
  const h2 = card.querySelector(':scope > h2');
  if (!h2) return;
  const header = document.createElement('div');
  header.className = 'card-toggle';
  const left = document.createElement('span');
  left.className = 'th-left';
  const grip = document.createElement('span');
  grip.className = 'grip'; grip.title = 'גרור לשינוי סדר'; grip.textContent = '⠿';
  const title = document.createElement('span');
  title.className = 'card-title'; title.textContent = h2.textContent;
  left.append(grip, title);
  const chev = document.createElement('span');
  chev.className = 'chev'; chev.textContent = '▾';
  header.append(left, chev);

  const body = document.createElement('div');
  body.className = 'card-body';
  while (h2.nextSibling) body.appendChild(h2.nextSibling);
  card.replaceChild(header, h2);
  card.appendChild(body);
  card.classList.toggle('collapsed', !open);
  header.addEventListener('click', (e) => {
    if (e.target.closest('.grip')) return; // grip is for dragging, not collapsing
    card.classList.toggle('collapsed');
  });
}

// ---------- drag-to-reorder cards (persisted) ----------
const ORDER_KEY = 'chapterbar.cardOrder.v1';
function makeSortable(container) {
  let dragged = null;
  container.querySelectorAll(':scope > .card').forEach(card => {
    const grip = card.querySelector('.grip');
    if (!grip) return;
    const arm = () => { card.draggable = true; };
    grip.addEventListener('mousedown', arm);
    grip.addEventListener('touchstart', arm, { passive: true });
    card.addEventListener('dragstart', (e) => {
      dragged = card; card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', card.dataset.card || ''); } catch (_) {}
    });
    card.addEventListener('dragend', () => {
      card.draggable = false; card.classList.remove('dragging'); dragged = null;
      saveOrder(container);
    });
  });
  container.addEventListener('dragover', (e) => {
    if (!dragged) return;
    e.preventDefault();
    const after = dragAfter(container, e.clientY);
    if (after == null) container.appendChild(dragged);
    else container.insertBefore(dragged, after);
  });
}
function dragAfter(container, y) {
  const els = [...container.querySelectorAll(':scope > .card:not(.dragging)')];
  let best = { offset: -Infinity, el: null };
  for (const child of els) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > best.offset) best = { offset, el: child };
  }
  return best.el;
}
function saveOrder(container) {
  const order = [...container.querySelectorAll(':scope > .card')].map(c => c.dataset.card).filter(Boolean);
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch (_) {}
}
function restoreOrder(container) {
  let order;
  try { order = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); } catch (_) { return; }
  if (!Array.isArray(order)) return;
  order.forEach(key => {
    const c = container.querySelector(`:scope > .card[data-card="${key}"]`);
    if (c) container.appendChild(c); // re-append in saved order
  });
}

// ---------- init ----------
defaultRows().forEach(addChapterRow);
onFormChange();
drawPreview();

// Make the control cards foldable to reduce clutter (open state keyed by data-card).
const openByKey = { upload: true, settings: true, chapters: true, style: true, design: false, subtitle: true };
const controlsEl = document.querySelector('.controls');
controlsEl.querySelectorAll(':scope > .card').forEach(c => makeCollapsible(c, openByKey[c.dataset.card] ?? true));
makeCollapsible(document.querySelector('.export-card'), false);
// Restore the user's saved card order, then enable drag-to-reorder.
restoreOrder(controlsEl);
makeSortable(controlsEl);
