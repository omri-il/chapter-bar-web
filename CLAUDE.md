# chapter-bar-web

Browser-based generator for an animated **chapter progress bar** (and a circle/Pomodoro
indicator) for videos — no DaVinci Resolve, no editing software, no server. Everything runs in
the visitor's own browser. Hebrew RTL UI.

- **Live:** https://omri-il.github.io/chapter-bar-web/ (GitHub Pages, `master` root)
- **Origin:** port of `davinci-automation/scripts/chapters/render_chapter_bar_flat.py`
  (same palette, layout fractions, dim/fill math) to Canvas2D.
- **Audience:** non-technical / CapCut creators (burn-in MP4) + pro editors (transparent overlay).

## Architecture
Static site — vanilla JS + Canvas2D, **no build step**. Libraries load from jsDelivr as ES modules.
Nothing is uploaded to any server; the user's video for burn-in stays local.

```
index.html            # Hebrew RTL UI (cards in .controls + sticky .preview-pane)
css/style.css
js/bar-engine.js      # pure drawing core — no DOM/Resolve deps
js/app.js             # form state, preview, upload/metadata, exports wiring
js/export-overlay.js  # transparent WebM via MediaRecorder
js/export-burnin.js   # MP4 burn-in via mp4box.js + WebCodecs + mp4-muxer
tests/                # Playwright scripts (see "Testing")
```

### Engine (`bar-engine.js`)
- `DEFAULT_STYLE` — all visual constants (mirrors the Python script). `*Frac` values are fractions
  of frame height/width so everything scales with resolution.
- `buildChapters(rows, mode, videoLengthSec, style)` — **start-time model**: each chapter has a
  `startSec` (read off the playhead); end = next chapter's start; last ends at video length. Rows
  sorted by start. `mode`: `'equal'` (default — equal segment widths) or `'length'` (proportional
  to duration). Returns `{name, sp, ep, durSec, startSec, endSec, rgb}`.
- `visualProgressFromTime(elapsedSec, chapters)` — maps real elapsed seconds to a 0..1 position on
  the bar, so the playhead stays time-accurate even in `equal` mode.
- `renderFrame(ctx, {progress, elapsedSec, chapters, width, height, layout, style, subtitles})` —
  clears, then `renderBar` (horizontal) or `renderCircle` (Pomodoro ring with current chapter name +
  countdown), then `renderSubtitles`. **RTL bar** mirrors geometry via a canvas transform; labels are
  drawn un-mirrored so text isn't reversed.
- `formatClock(sec)` — short Hebrew ETA string.

## Features (current)
- **Inputs:** total video length first; chapters = name + **start timestamp** (ms precision OK);
  width mode **equal (default)** / by-length; FPS; resolution (incl. vertical presets).
- **Two display styles:** horizontal **bar** (default) / **circle (Pomodoro)** countdown.
- **Direction:** **LTR (default)** / RTL toggle — flips chapter order + playhead; the scrubber's
  direction follows it.
- **Playhead marker:** shape (bar/line/triangle/circle/none) + width + color.
- **Fonts:** system Arial + Google Hebrew fonts (Heebo, Open Sans, Noto Sans, Assistant, Rubik,
  Alef, Miriam Libre + display faces); loaded before render. Text color picker.
- **Subtitles:** upload `.srt` → RTL subtitles rendered in preview, overlay, and burn-in
  (size/position/color/bg controls; card appears when an SRT is loaded).
- **Optional video upload:** auto-detects duration / resolution / FPS (`HTMLVideoElement` metadata +
  `requestVideoFrameCallback` fps sample — no full-file read), shows the real footage **behind the
  bar** in the preview. **Scrub keeps playing** (seek doesn't pause), and **capture buttons**
  (➕ under the scrubber, ◎ per row) drop a chapter at the live playhead time.
- **Layout UX:** cards are **collapsible** (Design + Export collapsed by default) and
  **drag-to-reorder** via the ⠿ grip (order persisted in `localStorage` `chapterbar.cardOrder.v1`).
  Preview is **sticky**.
- **Validation:** video length must exceed the last chapter's start; otherwise a warning shows and
  both export buttons are disabled.

## Exports
- **Overlay (`.webm`, transparent):** `MediaRecorder` VP9/VP8 with alpha (WebCodecs can't encode
  alpha in Chromium). Records in real time. For Premiere/FCP/Resolve/OBS.
- **Burn-in (`.mp4`):** `mp4box.js` demux → `VideoDecoder` → composite bar/subtitles →
  `VideoEncoder` (H.264) → `mp4-muxer`; audio decoded to PCM and re-encoded to AAC. Requires
  **WebCodecs (desktop Chrome/Edge)** — UI feature-detects and guides otherwise.
- Both show live **percentage + ETA** ("מייצר פס ההתקדמות… NN% · נותרו כ-X").

## Conventions
- **Cache-busting (important):** when you change any JS or CSS, bump the `?v=N` on the entry
  `<script src="js/app.js?v=N">`, the `css/style.css?v=N` link, AND every `./*.js?v=N` import in
  app.js / export-overlay.js / export-burnin.js to the same N. Quick:
  `sed -i 's/?v=[0-9]\+/?v=N/g' index.html js/app.js js/export-overlay.js js/export-burnin.js`.
  Without this, GitHub Pages + browser caching serves a mismatched old/new set and the UI breaks.
  Tell the user to hard-refresh (Ctrl+Shift+R) after each deploy.
- If the visual constants in `render_chapter_bar_flat.py` change, update `DEFAULT_STYLE` to match.

## Run locally
```bash
python -m http.server 8123   # then open http://localhost:8123
```

## Testing (Playwright, headless chromium)
`npm install -D playwright && npx playwright install chromium`, start the server on 8123, then e.g.:
```bash
node tests/test_preview.mjs      # loads page, preview renders, no JS errors
node tests/test_overlay.mjs      # transparent WebM export
node tests/test_burnin.mjs       # MP4 burn-in (generate C:/tmp/sample.mp4 first)
```
Notes: tests that click export buttons first expand collapsed cards
(`document.querySelectorAll('.card.collapsed').forEach(c=>c.classList.remove('collapsed'))`).
Native HTML5 drag-and-drop can't be triggered by Playwright's synthetic mouse — verify reorder by
dispatching `DragEvent`s (see `tests/test_dnd_events.mjs`).

## Known limitations / deferred
- **Google Drive links not supported** (CORS blocks cross-origin fetch; the URL-load field was
  removed). Reliable path: download the file from Drive and upload it.
- **Split video into per-chapter clips** — planned follow-up (per-segment encode + audio + zip).
- Burn-in and drag-to-reorder need a desktop browser; mobile support is limited.

## Deploy
Push to `master`; GitHub Pages serves the repo root. Allow ~1–2 min, then hard-refresh.
