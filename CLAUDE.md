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
- **Chapters auto-sort** by start time (`sortChapterRows()`); a blank new row stays last until filled.
- **Import markers** (`#importToggle` panel in the Chapters card): paste a list (name + timecode per
  line) or upload a **DaVinci EDL** (Timeline → Export → Timeline Markers to EDL). `parseMarkers`
  routes to `parseEDL` (pairs `|M:name` with the event's record-in TC) or `parseLineList` (finds the
  timecode token per line, rest = name). `tcToSec` handles `HH:MM:SS:FF` frames (uses the FPS select),
  `HH:MM:SS(.mmm)`, `MM:SS`. **`#importOffset`** (default on) subtracts the earliest marker so the
  first chapter = `0:00` (Resolve timelines start at `01:00:00:00`). `applyImport` replaces the rows
  (reuses `addChapterRow`/`sortChapterRows`) and warns if the last chapter exceeds the total length.
- **Two indicator layers, independently toggleable (can show both at once):** horizontal **bar**
  (`showBar`, default on) + **circle timer** (`showCircle`, default off). `renderFrame` composes them
  (`if (showBar) renderBar; if (showCircle) renderCircle`). The circle has a **`circleShowName`** flag:
  on = full Pomodoro (chapter name + countdown); off = a small **side timer** (countdown only, centered
  in the ring) for the bar+timer combo — names already live in the bottom bar. Enabling the circle the
  first time auto-defaults it to small/corner/no-name (`circleSizeFrac 0.16`, `circlePos br`).
  **`circlePos` is a 3×3 grid** — row (`t`/`m`/`b`) + col (`l`/`c`/`r`), e.g. `tl`,`tc`,`tr`,`ml`,`mc`,
  `mr`,`bl`,`bc`,`br` (9 positions); old `center` maps to `mc`. Legacy
  `style.layout` ('bar'|'circle') is still honored as a fallback when the flags are absent.
- **Timer styling (dedicated circle controls):** ring color (`circleUseChapterColor` on = follow the
  active chapter; off = custom `circleRingRGB`), ring thickness (`circleThicknessFrac`), text size
  (`circleTextScale`, multiplier on name+timer), text color (`circleTextRGBA`), background color +
  opacity (`circleBgRGBA`), and its own font (`circleFontFamily`, `''` = follow the main `fontFamily`).
- **Direction:** **LTR (default)** / RTL toggle — flips chapter order + playhead; the scrubber's
  direction follows it.
- **Bar geometry:** height, vertical position (up to the very top, `barYCenterFrac` max 1.0),
  crop from **top/bottom** (`cropTopFrac`/`cropBottomFrac` clip the bar), corner radius.
- **Uniform label size:** all chapter names render at one size — `renderBar` finds the largest size
  (≤ the slider) that fits every label, no per-chapter shrinking.
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
- **Progressive disclosure (basic vs advanced):** to avoid overwhelming new users, each busy section
  keeps a few common controls visible and tucks the rest in a native `<details class="adv">`
  ("הגדרות מתקדמות"), closed by default — pure CSS, no JS. Basic = video length, resolution,
  chapters+import, bar/timer toggles, font + text color, bar height + position, timer size + position
  + show-name. Advanced = FPS, **width-mode** (moved out of the Chapters card), direction, crop, label
  size, corner radius, bar bg opacity, playhead, and all timer color/thickness/text-size/font controls.
  **Tests must open these** (`document.querySelectorAll('details').forEach(d=>d.open=true)`) the same
  way they expand `.card.collapsed`, since controls inside a closed `<details>` aren't clickable.
- **Validation:** video length must exceed the last chapter's start; otherwise a warning shows and
  both export buttons are disabled.
- **Reset buttons:** "↺ איפוס העיצוב" restores all design controls to defaults; "↺ איפוס הפרקים"
  restores the default chapter rows (both confirm() first).

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
