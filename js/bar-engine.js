/*
 * bar-engine.js — Canvas2D port of render_chapter_bar_flat.py
 * (compute_layout + render_frame). Pure drawing, no DOM/Resolve dependency.
 *
 * The browser Canvas handles Hebrew/RTL bidi natively in fillText, so the
 * python-bidi shaping from the original script is not needed here.
 */

// === DEFAULT STYLE (mirrors the constants block in render_chapter_bar_flat.py) ===
// All "frac" values are fractions of frame height/width, so the bar scales with resolution.
export const DEFAULT_STYLE = {
  layout: 'bar',          // 'bar' (horizontal) | 'circle' (Pomodoro-style indicator)
  direction: 'ltr',       // 'ltr' | 'rtl' — bar chapter order + playhead direction
  // --- circle layout ---
  circleSizeFrac: 0.22,   // diameter as fraction of frame height
  circlePos: 'br',        // 'tl' | 'tr' | 'bl' | 'br' | 'center'
  circleThicknessFrac: 0.16, // ring thickness as fraction of radius
  // --- bar layout ---
  barYCenterFrac: 0.08,   // distance from BOTTOM to bar center (fraction of height)
  barHFrac: 0.09,         // bar height (fraction of height)
  barLeftFrac: 0.0,
  barWFrac: 1.0,
  cornerRadiusFrac: 0.0,  // outer corner radius (fraction of bar height); 0 = straight
  cropTopFrac: 0.0,       // clip this fraction of the bar height off the TOP
  cropBottomFrac: 0.0,    // clip this fraction of the bar height off the BOTTOM
  labelSizeFrac: 0.42,    // label font size as fraction of bar height
  fontFamily: 'Arial',    // label font family (primary name; sans-serif appended as fallback)
  playheadStyle: 'bar',   // 'bar' | 'line' | 'triangle' | 'circle' | 'none'
  playheadWidthFrac: 0.08, // marker thickness as fraction of bar height
  dim: 0.35,              // brightness factor for the unfilled part of a chapter
  bgRGBA: [22, 22, 28, 190],
  dividerRGBA: [255, 255, 255, 140],
  playheadRGBA: [255, 255, 255, 220],
  labelRGBA: [255, 255, 255, 235],
  labelShadowRGBA: [0, 0, 0, 200],
  // --- subtitles (only drawn when cues are supplied) ---
  subSizeFrac: 0.045,         // subtitle font size as fraction of frame height
  subPosFrac: 0.18,           // distance from bottom to the BOTTOM of the subtitle block
  subRGBA: [255, 255, 255, 255],
  subBgRGBA: [0, 0, 0, 140],  // readability box behind the text
  // Palette as 0..1 RGB triplets (teal, blue, purple, coral, gold) — same as the script.
  palette: [
    [0.06, 0.43, 0.34],
    [0.22, 0.54, 0.87],
    [0.45, 0.30, 0.72],
    [0.75, 0.30, 0.15],
    [0.75, 0.60, 0.15],
  ],
};

function rgba(arr) {
  const [r, g, b, a = 255] = arr;
  return `rgba(${r | 0},${g | 0},${b | 0},${(a / 255).toFixed(4)})`;
}

// scale_color(r,g,b,factor) from the script — clamps each channel to [0,1] then *255.
function scaleColor(rgb, factor = 1.0) {
  return [
    Math.round(255 * Math.min(1, rgb[0] * factor)),
    Math.round(255 * Math.min(1, rgb[1] * factor)),
    Math.round(255 * Math.min(1, rgb[2] * factor)),
  ];
}

// Port of compute_layout(width, height)
export function computeLayout(width, height, style = DEFAULT_STYLE) {
  const barHpx = Math.round(style.barHFrac * height);
  const barCenterYpx = height - Math.round(style.barYCenterFrac * height); // PIL/Fusion Y flip
  const barTop = barCenterYpx - Math.floor(barHpx / 2);
  const barBottom = barTop + barHpx;
  const barLeft = Math.round(style.barLeftFrac * width);
  const barRight = barLeft + Math.round(style.barWFrac * width);
  const corner = Math.max(2, Math.round(style.cornerRadiusFrac * barHpx));
  return {
    barLeft, barRight, barTop, barBottom,
    barH: barHpx,
    corner,
    barCenterY: Math.floor((barTop + barBottom) / 2),
    fontSize: Math.max(14, Math.round(barHpx * style.labelSizeFrac)),
  };
}

// Build chapters [{name, sp, ep, durSec, startSec, endSec, rgb}] from form rows
// [{name, startSec}] + the total video length. Each chapter STARTS at its startSec
// (read off the playhead) and ENDS where the next one starts (last one ends at videoLengthSec).
// Rows are sorted by start time so the bar stays sane even if entered out of order.
// `mode` controls segment WIDTHS on the bar:
//   'length' — width proportional to the chapter's real duration (default)
//   'equal'  — every segment the same width (1/N), regardless of duration
export function buildChapters(rows, mode = 'length', videoLengthSec = 0, style = DEFAULT_STYLE) {
  const span = Math.max(videoLengthSec, 0.0001);
  const sorted = rows
    .map((r, i) => ({ name: r.name, startSec: Math.max(0, Math.min(r.startSec || 0, span)), rgb: r.rgb, _i: i }))
    .sort((a, b) => a.startSec - b.startSec);
  const n = Math.max(1, sorted.length);
  return sorted.map((row, i) => {
    const startSec = row.startSec;
    const endSec = (i < n - 1) ? sorted[i + 1].startSec : span;
    const durSec = Math.max(0, endSec - startSec);
    let sp, ep;
    if (mode === 'equal') {
      sp = i / n;
      ep = (i + 1) / n;
    } else {
      sp = startSec / span;
      ep = endSec / span;
    }
    return {
      name: row.name || `פרק ${i + 1}`,
      sp, ep, durSec, startSec, endSec,
      rgb: row.rgb || style.palette[i % style.palette.length],
    };
  });
}

// Map real elapsed seconds to a visual progress [0..1] along the bar.
// Uses each chapter's real duration to find the playhead's chapter, then places it
// inside that chapter's (mode-dependent) sp..ep slot. So time stays accurate while
// widths follow the chosen mode. Trailing time past the last chapter -> 1 (bar full).
export function visualProgressFromTime(elapsedSec, chapters) {
  if (!chapters.length) return 0;
  const span = chapters.reduce((s, c) => s + c.durSec, 0);
  if (elapsedSec <= 0) return 0;
  if (elapsedSec >= span) return 1;
  let acc = 0;
  for (const ch of chapters) {
    if (elapsedSec < acc + ch.durSec && ch.durSec > 0) {
      const fracIn = (elapsedSec - acc) / ch.durSec;
      return ch.sp + fracIn * (ch.ep - ch.sp);
    }
    acc += ch.durSec;
  }
  return 1;
}

// Entry point — clears the canvas and draws the chosen layout.
// opts: { progress (0..1 visual), elapsedSec (real seconds), chapters, width, height, layout, style }
export function renderFrame(ctx, opts) {
  const style = opts.style || DEFAULT_STYLE;
  ctx.clearRect(0, 0, opts.width, opts.height);
  if ((style.layout || 'bar') === 'circle') {
    renderCircle(ctx, opts);
  } else {
    renderBar(ctx, opts);
  }
  renderSubtitles(ctx, {
    elapsedSec: opts.elapsedSec || 0,
    subtitles: opts.subtitles,
    width: opts.width, height: opts.height, style,
  });
}

// Draw the active subtitle cue (if any) — RTL-aware, multi-line, with a readability box.
function renderSubtitles(ctx, { elapsedSec, subtitles, width, height, style = DEFAULT_STYLE }) {
  if (!subtitles || !subtitles.length) return;
  let cue = null;
  for (const c of subtitles) {
    if (elapsedSec >= c.startSec && elapsedSec < c.endSec) { cue = c; break; }
  }
  if (!cue || !cue.text) return;

  const fontSize = Math.max(12, Math.round((style.subSizeFrac ?? 0.045) * height));
  const family = `"${style.fontFamily || 'Arial'}", "Segoe UI", sans-serif`;
  ctx.font = `bold ${fontSize}px ${family}`;
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.textBaseline = 'top';

  const maxWidth = width * 0.9;
  const lines = [];
  for (const raw of cue.text.split('\n')) lines.push(...wrapLine(ctx, raw, maxWidth));

  const lineH = Math.round(fontSize * 1.25);
  const blockH = lines.length * lineH;
  const cx = width / 2;
  const bottomY = height - Math.round((style.subPosFrac ?? 0.18) * height);
  const topY = bottomY - blockH;

  let maxLineW = 0;
  for (const ln of lines) maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
  const padX = fontSize * 0.5, padY = fontSize * 0.3;

  if (style.subBgRGBA && style.subBgRGBA[3] > 0) {
    const boxW = Math.min(width, maxLineW + padX * 2);
    ctx.fillStyle = rgba(style.subBgRGBA);
    roundRect(ctx, cx - boxW / 2, topY - padY, cx + boxW / 2, bottomY + padY, Math.round(fontSize * 0.25));
    ctx.fill();
  }

  for (let i = 0; i < lines.length; i++) {
    const y = topY + i * lineH;
    ctx.fillStyle = rgba(style.labelShadowRGBA);
    ctx.fillText(lines[i], cx + 1, y + 1);
    ctx.fillStyle = rgba(style.subRGBA || [255, 255, 255, 255]);
    ctx.fillText(lines[i], cx, y);
  }
}

function wrapLine(ctx, text, maxWidth) {
  if (!text) return [''];
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width <= maxWidth) cur = test;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Horizontal bar (original render_chapter_bar_flat.py look).
// progress is 0..1 across the WHOLE video, independent of the bar span.
function renderBar(ctx, { progress, chapters, width, height, layout, style = DEFAULT_STYLE }) {

  const { barLeft: bl, barRight: br, barTop: bt, barBottom: bb, corner } = layout;
  const barW = br - bl;
  progress = Math.max(0, Math.min(1, progress));

  // Optional crop: clip the bar's vertical extent (top/bottom) when requested.
  const cropT = (style.cropTopFrac || 0) * layout.barH;
  const cropB = (style.cropBottomFrac || 0) * layout.barH;
  const cropped = cropT > 0 || cropB > 0;
  if (cropped) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bt + cropT, width, Math.max(0, (bb - cropB) - (bt + cropT)));
    ctx.clip();
  }

  // RTL: draw all GEOMETRY mirrored horizontally (first chapter on the right, playhead
  // moves right→left). Labels are drawn afterwards un-mirrored so the text isn't reversed.
  const rtl = style.direction === 'rtl';
  ctx.save();
  if (rtl) { ctx.translate(bl + br, 0); ctx.scale(-1, 1); }

  // 1) Bar background
  ctx.fillStyle = rgba(style.bgRGBA);
  roundRect(ctx, bl, bt, br, bb, corner);
  ctx.fill();

  // 2/3) Per-chapter dim base + bright progress fill
  const n = chapters.length;
  for (let i = 0; i < n; i++) {
    const ch = chapters[i];
    const segLeft = bl + Math.round(ch.sp * barW);
    const segRight = bl + Math.round(ch.ep * barW);
    if (segRight <= segLeft) continue;
    const isFirst = i === 0;
    const isLast = i === n - 1;

    const dim = scaleColor(ch.rgb, style.dim);
    ctx.fillStyle = rgba([...dim, 230]);
    if (isFirst || isLast) {
      // corners order [tl, tr, br, bl]
      roundRect(ctx, segLeft, bt, segRight, bb, [
        isFirst ? corner : 0,
        isLast ? corner : 0,
        isLast ? corner : 0,
        isFirst ? corner : 0,
      ]);
      ctx.fill();
    } else {
      ctx.fillRect(segLeft, bt, segRight - segLeft, bb - bt);
    }

    // Bright fill for progress inside this chapter
    const span = ch.ep - ch.sp;
    if (span > 0) {
      const fillFrac = Math.max(0, Math.min(1, (progress - ch.sp) / span));
      if (fillFrac > 0) {
        const fillEnd = segLeft + Math.round(fillFrac * (segRight - segLeft));
        if (fillEnd > segLeft + 1) {
          const bright = scaleColor(ch.rgb, 1.0);
          ctx.fillStyle = rgba([...bright, 250]);
          ctx.fillRect(segLeft + 1, bt + 1, fillEnd - (segLeft + 1), (bb - 1) - (bt + 1));
        }
      }
    }
  }

  // 4) Dividers between chapters
  ctx.strokeStyle = rgba(style.dividerRGBA);
  ctx.lineWidth = 2;
  for (let i = 1; i < n; i++) {
    const x = bl + Math.round(chapters[i].sp * barW);
    ctx.beginPath();
    ctx.moveTo(x, bt + 1);
    ctx.lineTo(x, bb - 1);
    ctx.stroke();
  }

  // 5) Playhead / progress marker
  const ph = style.playheadStyle || 'bar';
  if (ph !== 'none') {
    const px = bl + Math.round(progress * barW);
    const phW = Math.max(2, Math.round(layout.barH * (style.playheadWidthFrac ?? 0.08)));
    const midY = (bt + bb) / 2;
    ctx.fillStyle = rgba(style.playheadRGBA);
    if (ph === 'line') {
      ctx.fillRect(px - Math.floor(phW / 2), bt, phW, bb - bt);
    } else if (ph === 'circle') {
      const r = Math.max(4, phW);
      ctx.beginPath();
      ctx.arc(px, midY, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (ph === 'triangle') {
      const s = Math.max(6, phW * 1.6);
      ctx.beginPath();           // downward pointer sitting just above the bar
      ctx.moveTo(px - s, bt - s);
      ctx.lineTo(px + s, bt - s);
      ctx.lineTo(px, bt + 2);
      ctx.closePath();
      ctx.fill();
    } else { // 'bar' (rounded, slight overhang top/bottom)
      roundRect(ctx, px - Math.floor(phW / 2), bt - 3, px + Math.floor(phW / 2), bb + 3, Math.max(1, Math.floor(phW / 2)));
      ctx.fill();
    }
  }

  ctx.restore(); // end mirrored geometry

  // 6) Labels — ONE uniform size for all chapters (drawn un-mirrored).
  const cy = layout.barCenterY;
  const baseSize = layout.fontSize; // upper bound from the labelSizeFrac slider
  const FLOOR = 10;
  const family = `"${style.fontFamily || 'Arial'}", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl'; // browser bidi handles Hebrew/Arabic/mixed

  // Pass 1 — find the largest size (<= baseSize) that fits EVERY label in its segment.
  const segs = chapters.map(ch => {
    const segLeft = bl + Math.round(ch.sp * barW);
    const segRight = bl + Math.round(ch.ep * barW);
    return { ch, segLeft, segRight, avail: (segRight - segLeft) - 8 };
  }).filter(s => s.segRight > s.segLeft && s.ch.name);
  let uniformSize = baseSize;
  for (const s of segs) {
    let size = baseSize;
    while (size > FLOOR) {
      ctx.font = `bold ${size}px ${family}`;
      if (ctx.measureText(s.ch.name).width <= s.avail) break;
      size -= 1;
    }
    if (size < uniformSize) uniformSize = size;
  }

  // Pass 2 — draw all labels at the uniform size.
  ctx.font = `bold ${uniformSize}px ${family}`;
  for (const s of segs) {
    if (ctx.measureText(s.ch.name).width > s.avail) continue; // still doesn't fit → skip just this one
    const cx = rtl ? (bl + br) - (s.segLeft + s.segRight) / 2 : (s.segLeft + s.segRight) / 2;
    ctx.fillStyle = rgba(style.labelShadowRGBA);
    ctx.fillText(s.ch.name, cx + 1, cy + 1);
    ctx.fillStyle = rgba(style.labelRGBA);
    ctx.fillText(s.ch.name, cx, cy);
  }

  if (cropped) ctx.restore(); // end crop clip
}

// Circle / Pomodoro-style indicator: shows the CURRENT chapter's name + a countdown,
// with a ring that depletes as the chapter progresses. Uses real elapsedSec.
function renderCircle(ctx, { elapsedSec = 0, chapters, width, height, style = DEFAULT_STYLE }) {
  if (!chapters.length) return;

  // Find the active chapter by real time.
  let active = chapters[0];
  for (const ch of chapters) {
    if (elapsedSec >= ch.startSec && elapsedSec < ch.endSec) { active = ch; break; }
    if (elapsedSec >= ch.endSec) active = ch; // past the end -> last seen chapter
  }
  const remaining = Math.max(0, active.endSec - elapsedSec);
  const fracRemaining = active.durSec > 0 ? Math.max(0, Math.min(1, remaining / active.durSec)) : 0;

  // Geometry
  const diameter = Math.round(style.circleSizeFrac * height);
  const R = diameter / 2;
  const thickness = Math.max(3, Math.round(R * style.circleThicknessFrac));
  const margin = Math.round(R * 0.35);
  let cx, cy;
  switch (style.circlePos) {
    case 'tl': cx = margin + R; cy = margin + R; break;
    case 'tr': cx = width - margin - R; cy = margin + R; break;
    case 'bl': cx = margin + R; cy = height - margin - R; break;
    case 'center': cx = width / 2; cy = height / 2; break;
    case 'br':
    default: cx = width - margin - R; cy = height - margin - R; break;
  }

  const ringR = R - thickness / 2;
  const bright = scaleColor(active.rgb, 1.0);
  const dim = scaleColor(active.rgb, style.dim);

  // 1) Background disc
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = rgba(style.bgRGBA);
  ctx.fill();

  // 2) Ring track (full, dim)
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = rgba([...dim, 230]);
  ctx.lineWidth = thickness;
  ctx.stroke();

  // 3) Depleting arc (bright) — starts full at the top, shrinks clockwise as time passes
  if (fracRemaining > 0) {
    const start = -Math.PI / 2;
    const end = start + fracRemaining * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, start, end);
    ctx.strokeStyle = rgba([...bright, 250]);
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // 4) Text inside — countdown (big) + chapter name (above)
  const inner = (ringR - thickness / 2) * 2; // usable inner width
  const family = `"${style.fontFamily || 'Arial'}", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';

  const r = Math.ceil(remaining);
  const timer = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;

  // chapter name (auto-shrink to fit inner width)
  let nameSize = Math.max(10, Math.round(R * 0.26));
  const nameText = active.name || '';
  while (nameSize >= 8) {
    ctx.font = `bold ${nameSize}px ${family}`;
    if (ctx.measureText(nameText).width <= inner * 0.92) break;
    nameSize -= 1;
  }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = rgba(style.labelShadowRGBA);
  ctx.fillText(nameText, cx + 1, cy - R * 0.12 + 1);
  ctx.fillStyle = rgba(style.labelRGBA);
  ctx.fillText(nameText, cx, cy - R * 0.12);

  // countdown timer (big)
  const timerSize = Math.max(12, Math.round(R * 0.5));
  ctx.font = `bold ${timerSize}px ${family}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(style.labelShadowRGBA);
  ctx.fillText(timer, cx + 1, cy + R * 0.22 + 1);
  ctx.fillStyle = rgba(style.labelRGBA);
  ctx.fillText(timer, cx, cy + R * 0.22);
}

// Format seconds as a short Hebrew-friendly clock for ETA display.
export function formatClock(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} שנ׳`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')} דק׳`;
}

// Rounded rect path from (x0,y0)-(x1,y1). radii: number or [tl,tr,br,bl].
function roundRect(ctx, x0, y0, x1, y1, radii) {
  ctx.beginPath();
  const w = x1 - x0, h = y1 - y0;
  if (ctx.roundRect) {
    ctx.roundRect(x0, y0, w, h, radii);
  } else {
    // Fallback for very old browsers
    const r = Array.isArray(radii) ? Math.max(...radii) : radii;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x0 + rr, y0);
    ctx.arcTo(x1, y0, x1, y1, rr);
    ctx.arcTo(x1, y1, x0, y1, rr);
    ctx.arcTo(x0, y1, x0, y0, rr);
    ctx.arcTo(x0, y0, x1, y0, rr);
    ctx.closePath();
  }
}
