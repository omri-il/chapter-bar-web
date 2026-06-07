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
  barYCenterFrac: 0.08,   // distance from BOTTOM to bar center (fraction of height)
  barHFrac: 0.09,         // bar height (fraction of height)
  barLeftFrac: 0.0,
  barWFrac: 1.0,
  cornerRadiusFrac: 0.0,  // outer corner radius (fraction of bar height); 0 = straight
  labelSizeFrac: 0.42,    // label font size as fraction of bar height
  dim: 0.35,              // brightness factor for the unfilled part of a chapter
  bgRGBA: [22, 22, 28, 190],
  dividerRGBA: [255, 255, 255, 140],
  playheadRGBA: [255, 255, 255, 220],
  labelRGBA: [255, 255, 255, 235],
  labelShadowRGBA: [0, 0, 0, 200],
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

// Build chapters [{name, sp, ep, rgb}] from form rows [{name, seconds}] + total seconds.
// sp/ep are normalized [0..1] over the bar span. Matches the Resolve convention:
// the bar spans 0 -> end of the last chapter; any trailing time (outro) has no segment.
export function buildChapters(rows, totalSeconds, style = DEFAULT_STYLE) {
  const sumChapters = rows.reduce((s, r) => s + Math.max(0, r.seconds), 0);
  const span = Math.max(sumChapters, 0.0001);
  let cursor = 0;
  return rows.map((row, i) => {
    const sp = cursor / span;
    cursor += Math.max(0, row.seconds);
    const ep = cursor / span;
    return {
      name: row.name || `פרק ${i + 1}`,
      sp, ep,
      rgb: row.rgb || style.palette[i % style.palette.length],
    };
  });
}

// Port of render_frame() — draws one frame onto a 2D context.
// progress is 0..1 across the WHOLE video (totalFrames), independent of the bar span.
export function renderFrame(ctx, { progress, chapters, width, height, layout, style = DEFAULT_STYLE }) {
  ctx.clearRect(0, 0, width, height);

  const { barLeft: bl, barRight: br, barTop: bt, barBottom: bb, corner } = layout;
  const barW = br - bl;
  progress = Math.max(0, Math.min(1, progress));

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

  // 5) Playhead
  const px = bl + Math.round(progress * barW);
  const phW = Math.max(2, Math.round(layout.barH * 0.08));
  ctx.fillStyle = rgba(style.playheadRGBA);
  roundRect(ctx, px - Math.floor(phW / 2), bt - 3, px + Math.floor(phW / 2), bb + 3, Math.max(1, Math.floor(phW / 2)));
  ctx.fill();

  // 6) Labels centered inside each segment, auto-shrink to fit
  const cy = layout.barCenterY;
  const baseSize = layout.fontSize;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl'; // browser bidi handles Hebrew/Arabic/mixed
  for (const ch of chapters) {
    const segLeft = bl + Math.round(ch.sp * barW);
    const segRight = bl + Math.round(ch.ep * barW);
    const cx = (segLeft + segRight) / 2;
    const avail = (segRight - segLeft) - 8;
    const text = ch.name;

    let size = baseSize, tw = Infinity;
    while (size >= 10) {
      ctx.font = `bold ${size}px Arial, "Segoe UI", sans-serif`;
      tw = ctx.measureText(text).width;
      if (tw <= avail) break;
      size -= 2;
    }
    if (tw > avail) continue; // too narrow even at min size

    ctx.fillStyle = rgba(style.labelShadowRGBA);
    ctx.fillText(text, cx + 1, cy + 1);
    ctx.fillStyle = rgba(style.labelRGBA);
    ctx.fillText(text, cx, cy);
  }
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
