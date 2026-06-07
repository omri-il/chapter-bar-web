# Chapter Progress Bar — Web Generator

A free, browser-based tool to create an animated **chapter progress bar** for videos —
no DaVinci Resolve, no editing software, no server. Everything runs in the visitor's own
browser, so it costs nothing to host and scales to any number of users.

It's the shareable, web version of the DaVinci Resolve renderer
[`render_chapter_bar_flat.py`](../davinci-automation/scripts/chapters/render_chapter_bar_flat.py)
— the exact same bar look (palette, layout, dim/fill math), ported from Pillow to Canvas2D.

## What it does
The user enters chapters (name + duration), total length, FPS, resolution, and bar style,
sees a **live animated preview**, then exports one of two ways:

1. **Transparent overlay (`.webm`)** — a transparent clip to drop on top of their own video
   in Premiere / Final Cut / Resolve / OBS. Recorded via `MediaRecorder` (VP9/VP8 alpha) in
   real time. Best for short/medium clips and pro editors.
2. **Burned-in video (`.mp4`)** — the user picks their own video file, the bar is composited
   onto it, and they download a finished MP4 ready for YouTube/CapCut/Instagram. **The video
   never leaves their computer.** Uses WebCodecs (`VideoDecoder` → composite → `VideoEncoder`
   H.264) with the original audio re-encoded to AAC and muxed back in.

## Browser support
- **Overlay:** any modern browser with `MediaRecorder` + canvas `captureStream` (Chrome, Edge, Firefox).
- **Burn-in:** requires **WebCodecs** — desktop **Chrome or Edge**. The UI feature-detects and,
  where burn-in isn't available, tells the user to use the overlay option / open Chrome on a computer.

## Why browser-only (and why not the VPS)
The bar render is per-pixel work that scales with users. Doing it on each visitor's machine
means zero server load and no big-file uploads/downloads — important because the project VPS
has throttled under CPU load before. For burn-in, the user's video stays local.

## Tech
- `js/bar-engine.js` — the reusable draw core (port of `compute_layout` + `render_frame`).
  Hebrew/RTL is handled natively by the Canvas `fillText` bidi (no `python-bidi` needed).
- `js/app.js` — form state, live preview, scrubber, export wiring.
- `js/export-overlay.js` — transparent WebM via MediaRecorder.
- `js/export-burnin.js` — MP4 burn-in via mp4box.js (demux) + WebCodecs + mp4-muxer, audio re-encoded.
- No build step. Libraries load from jsDelivr as ES modules.

## Run locally
```bash
python -m http.server 8123
# open http://localhost:8123
```

## Tests
Playwright scripts in `tests/` verify load/preview, overlay export, burn-in export, and codec
capabilities. With the local server running on port 8123:
```bash
npm install -D playwright && npx playwright install chromium
node tests/test_preview.mjs   # loads page, checks preview renders, no JS errors
node tests/test_overlay.mjs   # exports a transparent .webm
node tests/test_burnin.mjs    # burns the bar onto tests' sample mp4 (generate one first, see script)
```

## Deploy
Static site — hosted on GitHub Pages from the repo root.

---
Built by [Omri Iram](https://omri-iram.co.il).
