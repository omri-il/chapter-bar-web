/* app.js — form state, live preview, and export wiring. */
import { DEFAULT_STYLE, computeLayout, buildChapters, renderFrame, visualProgressFromTime } from './bar-engine.js';
import { exportOverlay } from './export-overlay.js';
import { burnIn, isBurnInSupported } from './export-burnin.js';

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

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const chaptersEl = $('chapters');
const canvas = $('preview');
const ctx = canvas.getContext('2d');

let widthMode = 'length'; // 'length' | 'equal'
let layoutMode = 'bar';   // 'bar' | 'circle'

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
    <button type="button" class="btn-remove" title="הסרה">×</button>
  `;
  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
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
  return {
    ...DEFAULT_STYLE,
    barHFrac: parseFloat($('barHFrac').value),
    barYCenterFrac: parseFloat($('barYCenterFrac').value),
    cornerRadiusFrac: parseFloat($('cornerRadiusFrac').value),
    labelSizeFrac: parseFloat($('labelSizeFrac').value),
    fontFamily: $('fontFamily').value,
    layout: layoutMode,
    circleSizeFrac: parseFloat($('circleSizeFrac').value),
    circlePos: $('circlePos').value,
    circleThicknessFrac: parseFloat($('circleThicknessFrac').value),
    playheadStyle: $('playheadStyle').value,
    playheadWidthFrac: parseFloat($('playheadWidthFrac').value),
    bgRGBA: [DEFAULT_STYLE.bgRGBA[0], DEFAULT_STYLE.bgRGBA[1], DEFAULT_STYLE.bgRGBA[2], parseInt($('bgOpacity').value, 10)],
    labelRGBA: [Math.round(tc[0] * 255), Math.round(tc[1] * 255), Math.round(tc[2] * 255), 235],
    playheadRGBA: [Math.round(pc[0] * 255), Math.round(pc[1] * 255), Math.round(pc[2] * 255), 230],
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
  return { rows, style, width, height, fps, videoLength, widthMode, chapters };
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
  const { style, width, height, chapters } = getState();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const layout = computeLayout(width, height, style);
  const { videoLength } = getState();
  const elapsedSec = progress * videoLength;
  const visual = visualProgressFromTime(elapsedSec, chapters);
  renderFrame(ctx, { progress: visual, elapsedSec, chapters, width, height, layout, style });
  updateTimeLabel();
}

function updateTimeLabel() {
  const { videoLength } = getState();
  $('timeLabel').textContent = formatDuration(progress * videoLength);
  $('scrub').value = Math.round(progress * 1000);
}

function loop(ts) {
  if (!playing) return;
  if (!lastTs) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  const { videoLength } = getState();
  progress += dt / videoLength;
  if (progress >= 1) { progress = 0; }
  drawPreview();
  requestAnimationFrame(loop);
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
$('videoFile').addEventListener('change', (e) => {
  pickedFile = e.target.files[0] || null;
  $('exportBurnin').disabled = !(pickedFile && isBurnInSupported());
});

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

function setExporting(on) {
  $('exportOverlay').disabled = on;
  $('exportBurnin').disabled = on || !(pickedFile && isBurnInSupported());
  if (on) { statusBox.hidden = false; progressFill.style.width = '0%'; }
}

// ---------- play controls ----------
function togglePlay(force) {
  playing = force !== undefined ? force : !playing;
  $('playBtn').textContent = playing ? '⏸' : '▶';
  if (playing) { lastTs = 0; requestAnimationFrame(loop); }
}
$('playBtn').addEventListener('click', () => togglePlay());
$('scrub').addEventListener('input', (e) => {
  playing = false; $('playBtn').textContent = '▶';
  progress = e.target.value / 1000;
  drawPreview();
});

// ---------- bind global controls ----------
['barHFrac', 'barYCenterFrac', 'cornerRadiusFrac', 'labelSizeFrac', 'bgOpacity', 'fps', 'resolution', 'videoLength', 'textColor', 'playheadColor', 'playheadWidthFrac', 'playheadStyle', 'circleSizeFrac', 'circlePos', 'circleThicknessFrac']
  .forEach(id => $(id).addEventListener('input', drawPreview));

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

// ---------- init ----------
defaultRows().forEach(addChapterRow);
onFormChange();
drawPreview();
