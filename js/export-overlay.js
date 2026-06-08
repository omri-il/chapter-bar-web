/* export-overlay.js — render the bar to a TRANSPARENT WebM.
 *
 * WebCodecs does NOT support alpha encoding in Chromium, but MediaRecorder does
 * (VP9/VP8 in WebM preserve the canvas alpha channel). So we animate the bar on a
 * transparent canvas in real time and record it. Output is a transparent .webm to
 * drop on V2 in Premiere / Final Cut / Resolve / OBS.
 */
import { computeLayout, renderFrame, visualProgressFromTime, formatClock } from './bar-engine.js?v=13';

export function isOverlaySupported() {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && !!HTMLCanvasElement.prototype.captureStream;
}

function pickMime() {
  // VP9 gives better quality; both preserve alpha. Fall back gracefully.
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const m of candidates) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

export async function exportOverlay(state, { onProgress, onDone, onError } = {}) {
  if (!isOverlaySupported()) {
    const e = new Error('הדפדפן לא תומך בייצוא שכבה שקופה. נסו Chrome או Edge.');
    onError && onError(e); throw e;
  }

  const { style, width, height, fps, videoLength, chapters, subtitles } = state;
  const totalSeconds = videoLength;
  const layout = computeLayout(width, height, style);

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });

  const stream = canvas.captureStream(fps);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: Math.round(width * height * fps * 0.12),
  });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });

  rec.start();
  const startT = performance.now();

  // Draw the first frame immediately so the recorder has content from t=0.
  renderFrame(ctx, { progress: 0, elapsedSec: 0, chapters, width, height, layout, style, subtitles });

  await new Promise((resolve) => {
    function frame() {
      const elapsed = (performance.now() - startT) / 1000;
      const timeFrac = Math.min(1, elapsed / totalSeconds);
      const progress = visualProgressFromTime(elapsed, chapters);
      renderFrame(ctx, { progress, elapsedSec: elapsed, chapters, width, height, layout, style, subtitles });
      const remaining = Math.max(0, totalSeconds - elapsed);
      onProgress && onProgress(timeFrac, `מייצר פס ההתקדמות… ${Math.round(timeFrac * 100)}% · נותרו כ-${formatClock(remaining)}`);
      if (elapsed >= totalSeconds) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());

  const blob = new Blob(chunks, { type: 'video/webm' });
  downloadBlob(blob, 'chapter-bar-overlay.webm');
  onDone && onDone('השכבה השקופה מוכנה! (WebM עם שקיפות — גוררים מעל הסרטון בעורך)');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
