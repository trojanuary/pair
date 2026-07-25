# 05 - PDF reader: rendering, zoom, navigation & find

> Manual QA for everything that puts pixels of the PDF on screen: the PDF.js worker load path, canvas + text-layer rendering, single-page vs continuous scroll, page navigation, zoom (buttons, fit-to-width, pinch), and the in-document find bar.

| | |
|---|---|
| **ID prefix** | READ |
| **Scope** | PDF.js worker bootstrap and its fallbacks, `renderPage` / `renderInto` canvas + text layer, HiDPI `outputScale`, continuous mode with `IntersectionObserver` lazy rendering, page prev/next/input/total, zoom buttons + `fitZoom` + pinch-to-zoom, the whole `#findBar` (open/close, search, step, marks, counts), reader fallback and empty-reader states |
| **Primary code** | `src/app.js:410-595` (worker, fit, render, continuous, navigation), `src/app.js:990-1045` (`initPinch`), `src/app.js:2908-3006` (find bar), `src/app.js:3087-3124`, `src/app.js:3174` (toolbar wiring), `src/app.js:3179-3210` (`updateZoom`, fallbacks), `src/app.js:3303-3353` (`boot`), `app.html:44-85`, `src/styles.css:87-160`, `src/styles.css:545-612` |
| **Checks** | 126 |

## Contents
- [1. PDF.js worker load path & engine boot](#1-pdfjs-worker-load-path--engine-boot) - 9 checks
- [2. Page rendering, canvas & text layer](#2-page-rendering-canvas--text-layer) - 15 checks
- [3. Page navigation](#3-page-navigation) - 16 checks
- [4. Continuous scroll vs single page](#4-continuous-scroll-vs-single-page) - 17 checks
- [5. Zoom controls](#5-zoom-controls) - 15 checks
- [6. Fit-to-width & pinch-to-zoom](#6-fit-to-width--pinch-to-zoom) - 12 checks
- [7. Find in document](#7-find-in-document) - 34 checks
- [8. Cross-cutting edges & regressions](#8-cross-cutting-edges--regressions) - 8 checks

Throughout, "the sample" means the bundled document **"BERT — Devlin et al. 2019 (NAACL).pdf"** (`src/app.js:38`), which is what a fresh profile opens with.

---

## 1. PDF.js worker load path & engine boot

### READ-001 - Production takes the base64-blob worker path
**P0** * Functional * `src/app.js:410 setupWorker()`

- **Pre:** Fresh browser profile, app served normally (`/app`). DevTools open.
- **Steps:**
  1. Load the app and wait for the first page to paint.
  2. In the console evaluate `!!window.PDFJS_WORKER_B64` and `typeof window.pdfjsWorker`.
  3. Open the Network panel and filter on `pdf.worker`.
- **Expect:** `window.PDFJS_WORKER_B64` is `true` and `window.pdfjsWorker` is `"undefined"`, so branch 2 of `setupWorker()` runs: the worker is created from a `blob:` URL built from the inlined base64 (`src/app.js:417-420`). **No request to `cdnjs.cloudflare.com` for `pdf.worker.min.js`** appears in Network.
- **Watch:** Someone drops `vendor/pdf.worker.b64.js` from `app.html:131` to shrink the bundle — the app silently falls through to the CDN branch and stops working offline.

### READ-002 - Reader still renders with the network fully offline
**P0** * Edge * `src/app.js:410 setupWorker()`

- **Pre:** App loaded once (so it is in cache), then DevTools → Network → **Offline**.
- **Steps:**
  1. Hard-reload the app while offline.
  2. Wait for the reader.
- **Expect:** The sample PDF renders page 1 exactly as when online; `#pageTotal` shows the real page count, not `"/ 1"`. No `readerFallback` card.
- **Watch:** A CSP or CDN regression turns the worker into a network fetch — offline shows a stuck blank reader with `"/ 1"` in the page counter.

### READ-003 - CDN branch is the last resort, not the first
**P1** * Regression * `src/app.js:171 CDN`, `src/app.js:421`

- **Pre:** DevTools console.
- **Steps:**
  1. In the console: `window.PDFJS_WORKER_B64 = ''` then reload is not possible (globals reset) — instead use DevTools → Network → Block request URL and block `*pdf.worker.b64.js*`, then hard-reload.
  2. Watch Network.
- **Expect:** With the inlined worker unavailable, PDF.js requests `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js` and the PDF still renders. The CDN version string must match the vendored `pdf.min.js` major/minor (3.11.174).
- **Watch:** `vendor/pdf.min.js` gets upgraded without bumping the `CDN` constant — the fallback loads a mismatched worker and every page render throws.

### READ-004 - Sandboxed / storage-denied preview shows the reader fallback card
**P1** * Functional * `src/app.js:3180 showReaderFallback()`, `src/app.js:3341-3345`

- **Pre:** Serve `app.html` inside a sandboxed iframe preview (or otherwise block the worker so `initPdf` rejects).
- **Steps:**
  1. Load the app in that preview.
  2. Wait up to 8 seconds.
- **Expect:** `#pageWrap` is hidden and a card appears with the heading **"Open this file directly to read the PDF"**, body **"The PDF engine and live AI calls can't run inside this embedded, sandboxed preview. Download the HTML file and open it in your browser (double-click it) to get the full reader, highlighting, screenshots, and live “Ask AI”."** and the second paragraph starting **"Everything else is live right now — explore the source-linked notes, provenance chips, filters, and the export packet on the right."**
- **Watch:** The card is rendered by *replacing* `#pageWrap` — a regression that removes the node nulls `#overlay`/`#pins` and crashes `drawHighlights()`; the comment at `src/app.js:3181-3183` exists because that already happened once.

### READ-005 - 7-second engine timeout message
**P1** * Edge * `src/app.js:3341-3345 boot()`

- **Pre:** A build where the worker hangs rather than errors (throttle Network to "Offline" *before* first load, with the app not cached, so the worker never resolves).
- **Steps:**
  1. Load the app, start a stopwatch.
- **Expect:** After ~7s the fallback card appears and its last line reads **"Engine note: PDF engine did not start — likely a sandboxed preview. Open the downloaded file directly."**
- **Watch:** The timeout is racing `initPdf` — if it is removed, the whole UI (seeding, notes) stays blocked behind a promise that never settles.

### READ-006 - Fallback card is cleared once a PDF really renders
**P1** * State * `src/app.js:460-461 renderPage()`

- **Pre:** App showing the reader fallback card (READ-004) or the empty-library card (READ-007).
- **Steps:**
  1. Use "Open PDF or bundle" and open a valid PDF.
- **Expect:** `#readerFallback` is removed and `#pageWrap` gets `display:''` again — the card must not linger behind or above the canvas.
- **Watch:** Only `buildContinuous()` removes the card in continuous mode (`src/app.js:522`); if that line is dropped, continuous mode paints pages *below* a stale fallback card.

### READ-007 - Empty library reader state
**P1** * Copy * `src/app.js:3197 showEmptyReader()`

- **Pre:** Delete every document including the sample (trash + delete forever), then reload.
- **Steps:**
  1. Look at the reader area and the page counter.
- **Expect:** `#pageTotal` reads **"/ 0"**, and a card shows **"Your library is empty"** with **"Use Open PDF or bundle (top-left) to open a paper, its notes, or a shared .html."** ("Open PDF or bundle" and ".html" are bolded.) Page prev/next, zoom and search do nothing and throw nothing.
- **Watch:** `numPages` is 0 here, so `Cmd/Ctrl+F` is deliberately *not* intercepted (`src/app.js:3124`) — verify the browser's own find opens instead.

### READ-008 - Corrupt or non-PDF bytes fail with a named error, not a blank reader
**P0** * Edge * `src/app.js:215 switchDoc()`, `src/app.js:3068`

- **Pre:** A file renamed to `.pdf` that is not a PDF (e.g. copy a PNG to `broken.pdf`).
- **Steps:**
  1. Click "Open PDF or bundle" and choose `broken.pdf`.
- **Expect:** Either a toast **"Could not open file: …"** or the fallback card reading **"Could not open “broken.pdf” — it may not be a valid PDF."** The previously open document's canvas is not left half-rendered, and the app stays interactive.
- **Watch:** `initPdf` throws *after* `teardownContinuous()` (`src/app.js:451`), so a failure mid-way can leave you with no `#contPages` and a hidden `#pageWrap` — confirm you still see a card rather than empty grey.

### READ-009 - Shared read-only .html carries its own worker
**P1** * Functional * `src/app.js:2560-2585 exportSelfContainedHTML()`, `src/app.js:410`

- **Pre:** Chromium (to produce the file) and any browser to open it.
- **Steps:**
  1. Click "Share as HTML", save the file, then open the saved `.html` from disk (`file://`) with the network **offline**.
  2. Read a couple of pages, zoom, toggle continuous, use the find bar.
- **Expect:** The PDF renders from the inlined `pdf.worker.b64.js` (it is inlined at `src/app.js:2582`). Page nav, zoom, continuous and find all work; only the editing tools are hidden (`src/app.js:3296-3298` hides `toolHi`, `toolComment`, `toolShot`).
- **Watch:** `file://` origins cannot create workers in some hardened configs — if the reader falls back, the card copy from READ-004 must appear rather than a silent blank page.

---

## 2. Page rendering, canvas & text layer

### READ-010 - First paint shows page 1 of the sample at the saved zoom
**P0** * Functional * `src/app.js:445 initPdf()`, `src/app.js:3348 boot()`

- **Pre:** Fresh profile.
- **Steps:**
  1. Load `/app`.
- **Expect:** The BERT title page renders sharp and centred, `#pageInput` shows `1`, `#pageTotal` shows the real total (e.g. `"/ 16"`), `#zoomVal` shows **"115%"** (the default `state.ui.zoom = 1.15`, `src/app.js:68`), and the app opens in **continuous** mode with `#btnContinuous` carrying the `active` class (blue-weak background, `src/styles.css:118`).
- **Watch:** `state.ui.continuous` is force-defaulted to `true` once per profile via `_contDefaulted` (`src/app.js:86`) — a regression there makes fresh installs open in single-page mode.

### READ-011 - Canvas backing store is HiDPI-scaled
**P0** * Visual * `src/app.js:172 outputScale`, `src/app.js:467-474 renderPage()`

- **Pre:** A retina / 2x display (macOS default).
- **Steps:**
  1. In the console: `const c = document.getElementById('pageCanvas'); [c.width, c.height, c.style.width, c.style.height]`.
  2. Zoom the page canvas visually to 300% via the `+` button and inspect the glyph edges.
- **Expect:** `c.width` ≈ `2 ×` the numeric part of `c.style.width` (because `outputScale = Math.min(devicePixelRatio, 2)`), and the text is crisp, not resampled, at every zoom level.
- **Watch:** `outputScale` is computed **once at script load**. Dragging the window from a retina to a non-retina monitor (or changing OS display scaling) does not recompute it, so the canvas becomes soft or over-sampled until reload. Confirm the blur is a re-render away (any zoom press) and not permanent corruption.

### READ-012 - Canvas CSS size, wrapper size and viewport agree
**P0** * Visual * `src/app.js:465-472 renderPage()`

- **Steps:**
  1. Switch to single-page mode.
  2. Console: compare `getComputedStyle(pageWrap).width` with `pageCanvas.style.width` and with `document.getElementById('textLayer').style.width`.
- **Expect:** All three are identical (the viewport width at the current zoom). `#pageWrap` uses `width:max-content;margin:0 auto` (`src/styles.css:111`) so the page stays horizontally centred while it fits.
- **Watch:** If `#pageWrap` keeps a stale width after a zoom change, highlights (`drawHighlights` sizes overlays from `viewport`, `src/app.js:1103`) drift off the text.

### READ-013 - Text layer is selectable and invisibly aligned
**P0** * Functional * `src/app.js:477-480 renderPage()`, `src/styles.css:121-125`

- **Steps:**
  1. Drag-select a sentence in the abstract with the Select tool active.
- **Expect:** A blue selection band (`rgba(37,99,235,.28)`, `src/styles.css:125`) sits exactly over the rendered glyphs — not offset, not doubled, no visible black text. Copying yields the real sentence.
- **Watch:** `--scale-factor` is set on the text layer from `state.ui.zoom` (`src/app.js:478`). If it is not updated on a zoom change, selection rectangles scale wrong and land beside the words.

### READ-014 - Text layer `--scale-factor` tracks zoom
**P1** * State * `src/app.js:478`, `src/app.js:510`

- **Steps:**
  1. Press `+` twice, then `−` three times.
  2. Console: `getComputedStyle(document.getElementById('textLayer')).getPropertyValue('--scale-factor')`.
  3. Repeat in continuous mode against `document.querySelector('#contPages .pg .textLayer')`.
- **Expect:** The value always equals the numeric zoom shown in `#zoomVal` / 100 (e.g. `1.15`, `1.45`).
- **Watch:** Continuous pages set it in `renderInto` (`src/app.js:510`); a page rendered lazily *after* a zoom change but from a stale closure would keep the old factor.

### READ-015 - Screenshot tool disables text-layer pointer events
**P1** * State * `src/app.js:486`, `src/app.js:912-913 setTool()`

- **Steps:**
  1. Single-page mode. Click the "Screenshot region" tool.
  2. Try to drag-select text on the page.
  3. Switch back to "Select".
- **Expect:** With the shot tool active, `#textLayer` has `pointer-events:none` and dragging draws a capture rectangle instead of selecting text. Back on "Select", text selection works again.
- **Watch:** `setTool()` and `renderPage()` only touch the **single-page** `#textLayer`. In continuous mode the per-page `.textLayer` nodes keep pointer events; the capture mask (`#captureMask`, `top:60px`, `z-index:30`, `src/styles.css:158`) is what saves it — verify capture still works in continuous mode.

### READ-016 - Rapid page changes queue instead of interleaving
**P0** * Edge * `src/app.js:462-489 renderPage()`, `renderQueued`

- **Pre:** Single-page mode on a document with heavy pages (the BERT sample is fine; a 100-page report is better).
- **Steps:**
  1. Click `›` ten times as fast as you can.
- **Expect:** The reader ends on the page whose number `#pageInput` shows; the canvas and text layer belong to the *same* page (select a line and confirm it matches what is drawn). No half-drawn page, no page A's text over page B's canvas.
- **Watch:** `renderPage` returns early while `rendering` is true and only stores the last requested page. Any caller that `await`s it gets a resolved promise **before** the render actually happens — the classic symptom is find marks or highlights applied to the previous page's text layer.

### READ-017 - Text of every page is cached after render
**P1** * State * `src/app.js:481`, `src/app.js:586 ensurePageText()`

- **Steps:**
  1. Load the app, wait ~2 seconds without touching anything.
  2. Console: `Object.keys(window.__x||{})` is not available (IIFE) — instead open the find bar and search a word you know is only on the *last* page.
- **Expect:** The match is found immediately even though you never scrolled there, because `boot()` pre-caches all page text 1.2s after load (`src/app.js:3352`).
- **Watch:** On a 500-page PDF that background loop is expensive; confirm the UI stays responsive while it runs (scroll and type during the first 10 seconds).

### READ-018 - Page render survives a mid-render document switch
**P1** * Edge * `src/app.js:203 switchDoc()`, `src/app.js:451`

- **Pre:** Two documents in the library, at least one large.
- **Steps:**
  1. Click the second document in the sidebar and, within the same second, click back to the first.
- **Expect:** The reader settles on the document highlighted in the sidebar, page 1, with a matching page total. `pageTextCache` was cleared per switch (`src/app.js:210`), so find results never quote the other paper.
- **Watch:** Mixed state — a canvas from doc A with `#pageTotal` from doc B — means the in-flight `initPdf` won the race.

### READ-019 - Highlights and pins redraw after every render
**P0** * Regression * `src/app.js:485`, `src/app.js:1101 drawHighlights()`, `src/app.js:1116 drawPins()`

- **Pre:** The seeded sample notes (numbered pins on several pages).
- **Steps:**
  1. Navigate to a page that has notes, zoom in one step, zoom out one step.
- **Expect:** Highlight rectangles and numbered pins stay pinned to the same words at every zoom, and the numbers in the pins are unchanged.
- **Watch:** Overlays are sized from `w.vp` — a render that forgets to call `drawHighlights()/drawPins()` leaves the previous zoom's boxes floating.

### READ-020 - Connector line is redrawn after render and on scroll
**P2** * Visual * `src/app.js:490`, `src/app.js:3174`

- **Pre:** Desktop width (>820px — the connector is hidden below that, `src/styles.css:560`). Select a note card that has a pin.
- **Steps:**
  1. Scroll the reader a little; scroll the notes list a little; resize the window.
- **Expect:** The dashed blue line keeps both ends attached (pin ↔ card) throughout, and disappears when the card scrolls out of the notes list band.
- **Watch:** The redraw is `requestAnimationFrame`-throttled on three separate listeners; a dropped one leaves the line frozen in mid-air.

### READ-021 - Page background and shadow
**P2** * Visual * `src/styles.css:116`, `src/styles.css:120`

- **Steps:**
  1. Compare single-page and continuous mode.
- **Expect:** Single page: `#pageCanvas` has a white background, `border-radius:2px` and a soft drop shadow. Continuous: each `.pg` has the white background + shadow (the canvas inside is `display:block`, no separate radius). Pages must never show the app background bleeding through a transparent canvas.
- **Watch:** A PDF with a transparent page box renders onto a transparent canvas — the white `background:#fff` on `.pg` / `#pageCanvas` is what keeps it readable in dark surroundings.

### READ-022 - Very large PDF renders without freezing the tab
**P1** * Perf * `src/app.js:456 renderPage()`, `src/app.js:519 buildContinuous()`

- **Pre:** A 300+ page PDF (or a 40MB scanned book).
- **Steps:**
  1. Open it. Time to first painted page. Then scroll fast through 50 pages in continuous mode.
- **Expect:** First page paints in a few seconds; scrolling shows placeholder boxes that fill in, and the tab never becomes unresponsive to clicks on the toolbar.
- **Watch:** `buildContinuous()` creates a DOM node per page up front — thousands of pages means a very long single loop. Note the actual first-paint time so regressions are measurable.

### READ-023 - Wrong-type file dropped on the reader
**P1** * Edge * `src/app.js:3078-3082 wire()`

- **Steps:**
  1. Drag a `.txt` (or `.docx`) file over the reader, note the drop hint, and drop it.
- **Expect:** While dragging, `#reader` shows the dashed violet outline and the pill **"Drop a PDF (+ its .notes.json), or a shared .html, to open it"** (`src/styles.css:673-674`). On drop of an unsupported type, the currently open PDF stays rendered and you get an error toast beginning **"Could not open dropped files: "** — or the file is ignored — but the reader never goes blank.
- **Watch:** The `drop-hint` class must be removed on `dragleave`, `dragend` **and** `drop`; a stuck dashed outline is the common regression.

### READ-024 - Reader survives a window resize mid-render
**P1** * Edge * `src/app.js:456`, `src/app.js:3176`

- **Steps:**
  1. Start a jump to a far page (or a zoom change on a heavy page) and immediately drag the window narrower, crossing the 820px drawer breakpoint.
- **Expect:** The render completes, the page stays centred in the new width, and the toolbar reflows into its scrollable `.rd-mid` strip (`src/styles.css:570-572`) without the page canvas overlapping the toolbar.
- **Watch:** Nothing re-fits zoom on resize by design — the page can end up wider than the viewport and require horizontal panning. That is expected; a *clipped* page with no horizontal scrollbar is not.

---

## 3. Page navigation

### READ-025 - Next page button advances one page
**P0** * Functional * `src/app.js:3088 wire()`, `src/app.js:579 gotoPage()`

- **Pre:** Sample open at page 1, single-page mode.
- **Steps:**
  1. Click `›` (`#pageNext`) three times.
- **Expect:** The rendered page advances 2 → 3 → 4 and `#pageInput` shows the same number after each click.
- **Watch:** `#pageNext`/`#pagePrev` have **no `title` attribute** (`app.html:50,53`) — their labels are the literal characters `‹` and `›`. If a tooltip is added, update this doc; if the glyphs change to icons, verify hit area stays ≥ 34px on mobile (`src/styles.css:573`).

### READ-026 - Previous page button steps back one page
**P0** * Functional * `src/app.js:3087`

- **Pre:** On page 5.
- **Steps:**
  1. Click `‹` twice.
- **Expect:** Pages 4 then 3 render; `#pageInput` follows.

### READ-027 - Prev at page 1 is a no-op
**P1** * Edge * `src/app.js:580 gotoPage()` (`clamp`)

- **Steps:**
  1. Go to page 1. Click `‹` five times rapidly.
- **Expect:** Stays on page 1, `#pageInput` reads `1`, no console error, no flicker/re-render storm.
- **Watch:** `gotoPage` still re-renders on a clamped no-op in single mode — a visible white flash on every click is a regression worth filing.

### READ-028 - Next at the last page is a no-op
**P1** * Edge * `src/app.js:580`

- **Steps:**
  1. Type the last page number into `#pageInput`, press Enter. Click `›` five times.
- **Expect:** Stays on the last page; `#pageInput` matches the number in `#pageTotal`.

### READ-029 - Page input commits on Enter and blurs
**P0** * Functional * `src/app.js:3092`, `src/app.js:3089 commitPage()`

- **Steps:**
  1. Click `#pageInput`, type `7`, press Enter.
- **Expect:** Page 7 renders and the input loses focus (its border is no longer focused). Enter must not submit anything else or reload the page.

### READ-030 - Page input commits on blur/change
**P1** * Functional * `src/app.js:3091`

- **Steps:**
  1. Click `#pageInput`, type `4`, then click on the page canvas (no Enter).
- **Expect:** The `change` event fires and page 4 renders.

### READ-031 - Focusing the page input selects its contents
**P2** * Functional * `src/app.js:3090`

- **Steps:**
  1. On page 12, click into `#pageInput`.
- **Expect:** `12` is fully selected, so typing a new number replaces rather than appends (typing `3` gives `3`, not `123`).
- **Watch:** The `try/catch` around `select()` exists for browsers that throw on non-text inputs; if the input ever becomes `type="number"`, selection silently stops working in Safari.

### READ-032 - Non-numeric characters are stripped
**P1** * Edge * `src/app.js:3089 commitPage()`

- **Steps:**
  1. Type `abc` into `#pageInput`, press Enter.
  2. Type `1.5`, press Enter.
  3. Type `-3`, press Enter.
- **Expect:** (1) Digits strip to empty → the input snaps back to the current page number, no navigation. (2) `1.5` → digits `15` → navigates to page 15 (or the last page if shorter). (3) `-3` → `3` → page 3.
- **Watch:** The regex strips everything non-digit *before* `parseInt`, so `1.5` deliberately means 15, not 1. Copy that into the release notes rather than "fixing" it silently.

### READ-033 - Zero and empty input snap back
**P1** * Edge * `src/app.js:3089`

- **Steps:**
  1. Clear `#pageInput` completely, press Enter.
  2. Type `0`, press Enter.
- **Expect:** Both restore the current page number in the field and do not navigate.

### READ-034 - Out-of-range page numbers clamp to the last page
**P1** * Edge * `src/app.js:580 gotoPage()`

- **Steps:**
  1. On a 16-page document type `9999`, press Enter.
- **Expect:** The last page renders and `#pageInput` is rewritten to that page number (e.g. `16`) — not left showing `9999`.

### READ-035 - Very long numeric input
**P2** * Edge * `src/app.js:3089`

- **Steps:**
  1. Paste 60 digits into `#pageInput` and press Enter.
- **Expect:** Clamps to the last page; the field shows that number. No layout break — `.pagein` is a fixed `38px` wide field (`src/styles.css:96`), so long values scroll inside it rather than pushing the toolbar.

### READ-036 - Page total renders from the real document
**P0** * Copy * `src/app.js:449 initPdf()`, `app.html:52`

- **Steps:**
  1. Open three documents of different lengths in turn.
- **Expect:** `#pageTotal` reads `"/ N"` with a leading slash and a space, matching each document (`"/ 16"`), and never keeps the placeholder `"/ 1"` from `app.html:52`.
- **Watch:** If `initPdf` throws before line 449, the counter keeps the previous document's total — a strong smell that the fallback path was skipped.

### READ-037 - Page input reflects continuous scrolling
**P0** * State * `src/app.js:3174`, `src/app.js:566 currentContinuousPage()`

- **Pre:** Continuous mode.
- **Steps:**
  1. Scroll slowly from page 1 to page 5 with the mouse wheel, watching `#pageInput`.
- **Expect:** The number increments as each page crosses roughly the upper third of the viewport (the 35% band in `currentContinuousPage`), and never jitters back and forth on a single page boundary.
- **Watch:** The scroll handler runs on every scroll event with a `getBoundingClientRect()` per page — on a 500-page document watch for jank while scrolling fast.

### READ-038 - Scroll-derived page is not persisted on its own
**P2** * Edge * `src/app.js:3174` (no `save()`)

- **Steps:**
  1. Continuous mode. Scroll to page 30. Immediately reload (do not click anything else).
- **Expect:** The reader reopens at the last *saved* page (typically 1), not 30 — the scroll listener updates `state.ui.page` in memory only.
- **Watch:** This is current behaviour, not necessarily desired. If a fix adds `save()` there, it must be debounced or every scroll writes localStorage.

### READ-039 - Jump to a page in continuous mode renders it before scrolling
**P0** * Functional * `src/app.js:581 gotoPage()`

- **Pre:** Continuous mode, long document, page 1 in view.
- **Steps:**
  1. Type a far page number (e.g. 40) and press Enter.
- **Expect:** That page is rendered on demand (`renderInto`) and the scroller lands with its top ~12px below the viewport top (`scrollToPage`, `src/app.js:543`) — you should see real content, not an empty placeholder box.
- **Watch:** `scrollToPage(n, true)` takes a `smooth` argument that is **ignored** — the jump is always instant. Do not report the lack of smooth scrolling as a new bug; report it if someone claims to have implemented it.

### READ-040 - Clicking a note jumps to its source (both modes)
**P1** * Functional * `src/app.js:548 scrollToAnnotation()`

- **Pre:** Sample notes seeded; pick a note whose source is in the lower half of a page.
- **Steps:**
  1. In single-page mode click the note card; then switch to continuous and click it again.
- **Expect:** In both modes the highlighted source lands about 30% down the reader viewport (not at the very top, not below the fold), `#pageInput` updates to the note's page, and the pin + connector are visible.
- **Watch:** In continuous mode the target page is force-rendered first (`src/app.js:553`); if that await is removed, the scroll math uses a zero-height placeholder and lands hundreds of pixels off.

---

## 4. Continuous scroll vs single page

### READ-041 - Continuous toggle button state
**P0** * Visual * `src/app.js:3093-3094`, `src/app.js:574 setContinuous()`

- **Steps:**
  1. Hover `#btnContinuous` (the two stacked rectangles icon) and read its tooltip.
  2. Click it, then click again.
- **Expect:** Tooltip is **"Continuous scroll"**. When continuous is on the button carries `.active` → blue-weak background with blue icon (`src/styles.css:118`); off → plain. The state matches what the reader actually shows.
- **Watch:** The class is applied in two places (`wire()` at boot and `setContinuous()`); a change to only one leaves the button lying after a reload.

### READ-042 - Turning continuous ON builds all page slots
**P0** * Functional * `src/app.js:519 buildContinuous()`

- **Pre:** Single-page mode on page 6.
- **Steps:**
  1. Click `#btnContinuous`.
  2. Console: `document.querySelectorAll('#contPages .pg').length`.
- **Expect:** The count equals `numPages`; `#pageWrap` gets `display:none`; the view is scrolled so page 6 is at the top (`buildContinuous` ends with `scrollToPage(first,false)`); `#pageInput` still reads 6.
- **Watch:** `#contPages` is inserted **before** `#pageWrap` inside `#rdScroll` (`src/app.js:497`) — if that ordering breaks, the hidden wrapper adds phantom space at the top.

### READ-043 - Turning continuous OFF returns to the page you were reading
**P0** * Functional * `src/app.js:576 setContinuous()`

- **Pre:** Continuous mode; scroll until `#pageInput` shows 9.
- **Steps:**
  1. Click `#btnContinuous`.
- **Expect:** `#contPages` is removed from the DOM, `#pageWrap` reappears, and page **9** renders (not page 1) — because the scroll listener kept `state.ui.page` current.
- **Watch:** If `currentContinuousPage()` regresses, this lands on the page you *entered* continuous mode from — a subtle and much-complained-about bug.

### READ-044 - Lazy rendering pre-renders ~1000px ahead
**P1** * Perf * `src/app.js:530-532 buildContinuous()` (`rootMargin: '1000px 0px'`)

- **Pre:** Continuous mode, long document, top of document.
- **Steps:**
  1. Console: count rendered pages with `[...document.querySelectorAll('#contPages .pg')].filter(p => p._rendered).length`.
  2. Scroll down two screens, re-run.
- **Expect:** Only the pages within roughly one viewport plus 1000px above/below are rendered; the count grows as you scroll instead of jumping to `numPages`.
- **Watch:** A rootMargin regression to a huge value (or `0px`) shows up as either a memory blowup on long PDFs or visible blank pages while scrolling at speed.

### READ-045 - Un-rendered pages hold their space with a placeholder height
**P1** * Visual * `src/app.js:524-527`

- **Steps:**
  1. Enter continuous mode and immediately drag the scrollbar to the middle.
- **Expect:** Every not-yet-rendered slot is a `min-height` box (estimated from the current viewport height, 900px if unknown), so the scrollbar length is stable and does not jump wildly as pages fill in.
- **Watch:** The estimate is taken from the *single-page* `viewport` at the moment of build. After a big zoom change the estimate can be far off, causing a noticeable scroll-position jump as pages render. Reproduce: zoom to 300%, toggle continuous, scroll fast.

### READ-046 - A page renders exactly once
**P1** * Edge * `src/app.js:500-501 renderInto()` (`_rendering` / `_rendered` guards)

- **Steps:**
  1. Continuous mode. Scroll a page in and out of view five times quickly.
- **Expect:** No flicker of already-drawn pages and no duplicated text layer (select a line: characters must not be doubled).
- **Watch:** The `_rendering` guard is the only protection against `IntersectionObserver` firing again mid-render; removing it produces doubled `.textLayer` spans and doubled find matches.

### READ-047 - Pages are centred, and stay reachable when wider than the viewport
**P1** * Visual * `src/styles.css:115` (`align-items:safe center`)

- **Steps:**
  1. Continuous mode. Zoom to 300% so the page is wider than the reader.
  2. Scroll left/right.
- **Expect:** With `safe center` the page's **left edge remains reachable** — you can scroll to see the left margin. At fitting zooms pages are centred with a 16px gap between them.
- **Watch:** Plain `center` strands the left edge outside the scroll range; that regression is invisible until you zoom past fit.

### READ-048 - Teardown removes the observer
**P1** * State * `src/app.js:537 teardownContinuous()`

- **Steps:**
  1. Toggle continuous on/off ten times, then open a different document, then toggle again.
- **Expect:** No console errors; performance does not degrade; `document.querySelectorAll('#contPages').length` is 0 while in single mode.
- **Watch:** A leaked `IntersectionObserver` keeps rendering into detached nodes — symptom is rising memory and CPU with each toggle.

### READ-049 - Switching documents rebuilds continuous mode
**P0** * Functional * `src/app.js:451-453 initPdf()`

- **Pre:** Continuous mode, doc A open and scrolled to page 20.
- **Steps:**
  1. Click doc B in the sidebar.
- **Expect:** Doc B opens at page 1 in continuous mode with **its** page count; no leftover `.pg` slots from doc A (the old host is discarded by `teardownContinuous()` then rebuilt).
- **Watch:** `switchDoc` resets `state.ui.page = 1` (`src/app.js:208`) — if a page from doc A survives and exceeds doc B's length, `buildContinuous`'s `clamp` must save it.

### READ-050 - Highlights and pins appear on lazily rendered pages
**P0** * Regression * `src/app.js:516 renderInto()`, `src/app.js:1094 pageWrappers()`

- **Pre:** Continuous mode with the seeded sample notes.
- **Steps:**
  1. From page 1, scroll to a page that carries a note and watch it render.
- **Expect:** As soon as the page paints, its highlight rectangles and numbered pin appear with it (each `.pg` carries its own `.overlay` and `.overlay.pins`, `src/app.js:526`).
- **Watch:** `pageWrappers()` only includes pages with `_vp` set — a page that failed to render silently drops its annotations. Compare the pin count with the notes list.

### READ-051 - Comment tool works in both modes
**P1** * Functional * `src/app.js:3113-3122 wire()`

- **Steps:**
  1. Continuous mode: pick the Comment tool, click on page 4's margin.
  2. Repeat in single-page mode.
- **Expect:** A pin drops where you clicked (within 0..0.97 of the page box), the toast **"Comment placed — type your note below."** appears, and the tool reverts to Select. In continuous mode the pin lands on the page you actually clicked, not on `state.ui.page`.
- **Watch:** Continuous placement needs `pgEl._vp`, which only exists after that page rendered — clicking a placeholder must be a no-op, not a pin at (0,0).

### READ-052 - Continuous toggle is hidden on very narrow screens
**P2** * Visual * `src/styles.css:609-612`

- **Steps:**
  1. Resize the window to 520px wide (or use a phone).
- **Expect:** `#btnContinuous` **and** `#zoomVal` are hidden below 560px; page prev/next, the page input, `+`/`−`, search and the panel toggles remain reachable in the horizontally scrollable `.rd-mid` strip.
- **Watch:** Hiding the toggle means whatever mode was last chosen is locked in at phone width — verify the app is still usable in *both* stored states at 520px.

### READ-053 - Rapid double-click on the continuous toggle
**P1** * Edge * `src/app.js:572 setContinuous()`

- **Steps:**
  1. Double-click `#btnContinuous` fast; then triple-click it.
- **Expect:** The reader ends in the state the button's `.active` class shows; exactly one of `#contPages` / visible `#pageWrap` exists afterwards.
- **Watch:** `setContinuous` is async and unguarded — a second click during `buildContinuous()` can leave a half-built host. Look for duplicate page stacks or a blank reader.

### READ-054 - Scrolling to the very end of a document
**P1** * Edge * `src/app.js:566 currentContinuousPage()`, `src/styles.css:110`

- **Steps:**
  1. Continuous mode, scroll to the absolute bottom.
- **Expect:** The last page is fully visible above the 60px bottom padding (`.rd-scroll{padding:26px 0 60px}`), and `#pageInput` shows the last page number.
- **Watch:** On mobile the bottom padding grows to `88px + safe-area` (`src/styles.css:583`) to clear the floating tools bar — verify the last page is not hidden behind it on an iPhone.

### READ-055 - Single-page mode does not create continuous nodes
**P2** * State * `src/app.js:495 contHost()`

- **Steps:**
  1. In single-page mode, navigate a few pages, zoom, and use find.
  2. Console: `!!document.getElementById('contPages')`.
- **Expect:** `false` at all times — `contHost(create)` must only build the host when explicitly asked.

### READ-056 - Continuous mode after a failed render leaves a placeholder, not a crash
**P1** * Edge * `src/app.js:517 renderInto()` (`catch` → "leave placeholder")

- **Pre:** A PDF with one damaged page (or simulate by throttling to Offline mid-scroll with a CDN-fetched font).
- **Steps:**
  1. Scroll through the bad page.
- **Expect:** That slot stays an empty box at its placeholder height; neighbouring pages still render; no error dialog and the app remains usable.
- **Watch:** The swallowing `catch` means broken pages are silent — check the console for the underlying PDF.js error when a page mysteriously stays blank.

### READ-057 - Notes drawer open/close does not disturb the reading position
**P2** * Visual * `src/app.js:1150 setPanel()`

- **Steps:**
  1. Continuous mode, scroll to page 12, collapse then expand the right notes panel with `»` / the "Show notes" toggle.
- **Expect:** The reader keeps showing page 12 (the column narrows/widens, the page re-centres, but the scroll position stays on the same page) and `#pageInput` still reads 12.
- **Watch:** Panel width changes do **not** trigger a re-render, so a page wider than the new column simply overflows and becomes pannable — expected. A page that scrolls to a completely different location is a regression.

---

## 5. Zoom controls

### READ-058 - Zoom in steps by 15 percentage points
**P0** * Functional * `src/app.js:3095 wire()`, `src/app.js:3179 updateZoom()`

- **Pre:** Fresh state, `#zoomVal` shows **"115%"**.
- **Steps:**
  1. Click `+` (`#zoomIn`) three times, reading `#zoomVal` after each click.
- **Expect:** `130%` → `145%` → `160%`, and the page grows visibly and re-renders **sharp** at each step (not a scaled-up bitmap).
- **Watch:** `+` and `−` are the literal glyphs `+` and `−` (U+2212 minus, `app.html:56`) with **no tooltips**. A copy regression to a hyphen `-` is easy to miss.

### READ-059 - Zoom out steps down by 15
**P0** * Functional * `src/app.js:3096`

- **Pre:** `#zoomVal` at `115%`.
- **Steps:**
  1. Click `−` twice.
- **Expect:** `100%` → `85%`, page shrinks and re-renders crisply.

### READ-060 - Zoom clamps at 300%
**P1** * Edge * `src/app.js:3095` (`clamp(...,0.5,3)`)

- **Steps:**
  1. Click `+` twenty times.
- **Expect:** `#zoomVal` stops at **"300%"** and further clicks do nothing visible. The button is **not** disabled (there is no disabled state in the code) — it simply no-ops.
- **Watch:** Each click still calls `updateZoom()` → a full re-render even at the ceiling. On a heavy page, repeated clicks at max zoom cause visible re-render churn; that is the current behaviour to note, not to invent a fix for.

### READ-061 - Zoom clamps at 50%
**P1** * Edge * `src/app.js:3096`

- **Steps:**
  1. Click `−` twenty times.
- **Expect:** `#zoomVal` stops at **"50%"**; page stays legible-ish and centred; no negative or `NaN%` reading.

### READ-062 - Zoom readout rounds cleanly
**P2** * Copy * `src/app.js:3179 updateZoom()`

- **Steps:**
  1. From `115%`, alternate `+` and `−` ten times, watching the readout.
- **Expect:** The value always returns to `115%`; the readout is always an integer followed by `%` with no decimal (floating-point drift like `1.2999999` must be hidden by `Math.round`). Never `115.00000000001%` or `NaN%`.

### READ-063 - Zoom persists across reload
**P1** * State * `src/app.js:3179` (`save()`), `src/app.js:3318 boot()`

- **Steps:**
  1. Set zoom to `160%`, reload the page.
- **Expect:** `#zoomVal` shows `160%` immediately at boot (set before the first render) and the page renders at that scale.
- **Watch:** `boot()` writes the readout at line 3318 *before* the PDF loads — a mismatch between the readout and the actual page size means `state.ui.zoom` was not used by `renderPage`.

### READ-064 - Zoom in continuous mode rebuilds every page
**P0** * Functional * `src/app.js:3179` → `buildContinuous()`

- **Pre:** Continuous mode, scrolled to page 8.
- **Steps:**
  1. Click `+` once.
- **Expect:** All page slots are rebuilt at the new scale and the view lands back on page 8 (`buildContinuous` ends with `scrollToPage(first,false)`), not at page 1.
- **Watch:** The exact scroll offset within the page is lost (you jump to the page top). Also, on a long document this rebuild is the most expensive operation in the app — time it: 500-page PDFs should still return control in a second or two.

### READ-065 - Zoom in single mode keeps the current page
**P0** * Functional * `src/app.js:3179` → `renderPage(state.ui.page)`

- **Pre:** Single mode, page 11.
- **Steps:**
  1. Zoom in twice, out twice.
- **Expect:** Still page 11 after each step; `#pageInput` reads 11 the whole time.

### READ-066 - Overlays, pins and the connector follow the new zoom
**P0** * Regression * `src/app.js:485`, `src/app.js:516`

- **Pre:** A page with a highlight and a pin, notes panel open, that note selected.
- **Steps:**
  1. Zoom in one step, then out one step, in both modes.
- **Expect:** Highlight rectangles stay exactly over the same words; pins stay at the right end of their first rect; the connector re-attaches.
- **Watch:** In continuous mode `renderInto()` calls `drawHighlights()/drawPins()` per page — during a rebuild you may briefly see annotations only on rendered pages. They must all be present once scrolling settles.

### READ-067 - Text selection still lines up after zooming
**P0** * Functional * `src/app.js:478`, `src/app.js:510`

- **Steps:**
  1. Zoom to 250%, select a sentence, create a highlight; zoom back to 100% and check it.
- **Expect:** The selection band tracks the glyphs at 250%, and the resulting highlight sits on the same words at 100% (rects are stored normalised 0..1).
- **Watch:** A stale `--scale-factor` shows up here first: selection bands offset increasingly toward the bottom-right of the page.

### READ-068 - Zoom while a render is in flight
**P1** * Edge * `src/app.js:462`, `src/app.js:3179`

- **Steps:**
  1. Single mode on a heavy page: click `+` five times as fast as possible.
- **Expect:** The readout ends at `+75%` from where you started (or the 300% ceiling) and the final rendered page matches that readout in physical size.
- **Watch:** `renderPage` queues by *page number*, not by zoom — a queued re-render can repaint at the newest zoom while `#pageWrap` still holds the old dimensions, clipping the canvas. Measure `#pageWrap` vs `#pageCanvas` widths afterwards.

### READ-069 - Zoom readout is hidden below 560px, buttons are not
**P2** * Visual * `src/styles.css:609-612`

- **Steps:**
  1. Narrow the window to 520px.
- **Expect:** `#zoomVal` is hidden; `+` and `−` still work and still change the page size. Above 560px the readout reappears with the correct current value.
- **Watch:** `updateZoom()` writes `$('#zoomVal').textContent` unconditionally — if the element is ever removed rather than `display:none`d, this throws and kills zoom entirely.

### READ-070 - There is no fit-to-width button in the toolbar
**P2** * Regression * `app.html:55-59`

- **Steps:**
  1. Inspect the `.zoom` group.
- **Expect:** Exactly three children: `#zoomOut` (`−`), `#zoomVal`, `#zoomIn` (`+`). Fit-to-width exists only as an automatic behaviour (READ-073) and the pinch-out snap (READ-078).
- **Watch:** If a fit button is added, it must call `fitZoom()` + `updateZoom()` and this document needs new checks — a button that only sets `state.ui.zoom` without re-rendering is the likely first implementation.

### READ-071 - Zoom does not magnify the toolbar or drawers
**P1** * Visual * `src/styles.css:110` (`touch-action:pan-x pan-y`)

- **Steps:**
  1. Desktop: use `Cmd/Ctrl` + mouse wheel over the page.
- **Expect:** That is the **browser's** page zoom (everything scales, expected). The app's `+`/`−` must scale only the PDF page — toolbar, sidebar and notes panel keep their size.
- **Watch:** After a browser-level zoom, `devicePixelRatio` changes but `outputScale` does not (READ-011) — the canvas goes soft until the next reload.

### READ-072 - Zoom state survives a document switch
**P2** * State * `src/app.js:203 switchDoc()` (zoom is not reset)

- **Steps:**
  1. Set 200% on doc A, switch to doc B.
- **Expect:** Doc B opens at 200% too — zoom is global, not per document. `#zoomVal` and the rendered size agree.
- **Watch:** A large-format PDF at an inherited 200% may open wider than the viewport with no automatic fit; confirm it is pannable rather than clipped.

---

## 6. Fit-to-width & pinch-to-zoom

### READ-073 - First open on a narrow viewport fits the page to the screen
**P0** * Functional * `src/app.js:437 fitZoomToWidth()`, `src/app.js:3309-3313 boot()`

- **Pre:** Clear site data. Open the app at ≤820px width (phone or a 400px desktop window).
- **Steps:**
  1. Load `/app`.
- **Expect:** Both drawers start collapsed, and the first rendered page fits the reader's width with a small gutter — you can see the whole page width without panning. `#zoomVal` shows the fitted percentage (not `115%`).
- **Watch:** This runs **once** per profile (`_mobileDefaulted`) and only when `pendingMobileFit` is still true at `initPdf` (`src/app.js:450`). Reloading will *not* re-fit — that is intended.

### READ-074 - Fit is skipped when the layout is wide
**P1** * Edge * `src/app.js:438`, `src/app.js:1144 isNarrowViewport()`

- **Pre:** Clear site data, desktop window ≥ 1200px.
- **Steps:**
  1. Load the app.
- **Expect:** Zoom stays at the default `115%`; no automatic fit happens.
- **Watch:** `isNarrowViewport()` treats a width of `0` as "unknown" on purpose (`src/app.js:1141-1146`) — a regression that drops that guard makes desktop first-loads mis-fit when the document has not been laid out yet.

### READ-075 - Fit zoom respects the 0.5-3 clamp
**P1** * Edge * `src/app.js:433 fitZoom()`

- **Pre:** A very wide document (A0 poster or a landscape slide deck) on a phone-width window, fresh profile.
- **Steps:**
  1. Open it and read `#zoomVal`.
- **Expect:** The value never goes below `50%`; a page too wide to fit at 50% stays pannable rather than shrinking below the zoom floor (this is the documented intent at `src/app.js:424-426`).

### READ-076 - Pinch preview scales live
**P1** * Functional * `src/app.js:1012-1017 initPinch()` * Touch devices only

- **Pre:** Phone/tablet or Chrome DevTools device mode with touch emulation.
- **Steps:**
  1. Place two fingers on the page and spread them slowly without lifting.
- **Expect:** The page (and its text layer/overlays) scales smoothly under the fingers via a CSS `transform` — the toolbar and drawers do **not** scale. The browser's own page zoom must never kick in (`touch-action:pan-x pan-y`).
- **Watch:** The preview clamps to 0.2-5×, so a wild pinch cannot invert or explode the layer; verify at extreme spreads.

### READ-077 - Pinch commits with a crisp re-render
**P0** * Functional * `src/app.js:1019-1042 commit()` * Touch devices only

- **Steps:**
  1. Pinch in to roughly double the size and lift both fingers.
- **Expect:** The transform is cleared, `#zoomVal` updates to the new percentage, and the page re-renders sharp at the new scale (text is not a blurry upscale). The spot that was between your fingers stays under that point after the re-render.
- **Watch:** The scroll correction runs after `await updateZoom()` — in continuous mode that means after a full rebuild, so a slow rebuild can visibly jump before settling.

### READ-078 - Pinching out snaps to the whole-page fit
**P1** * Functional * `src/app.js:1024-1030` * Touch devices only

- **Pre:** Zoomed in past fit (e.g. 250% on a phone).
- **Steps:**
  1. Pinch out until roughly the whole page is visible, then lift.
- **Expect:** The zoom lands exactly on the fit-to-width value (a near miss within 6% is pulled onto it), so the page and every control are visible with no sliver cut off.
- **Watch:** The snap only applies when the starting zoom was *above* fit — pinching out while already at/below fit must not zoom **in** (the guard `fit <= p.z0`).

### READ-079 - A small pinch during a scroll is ignored
**P1** * Edge * `src/app.js:1022` (`Math.abs(p.k - 1) < 0.06`) * Touch devices only

- **Steps:**
  1. Two-finger scroll the page, letting your fingers drift slightly apart.
- **Expect:** Zoom does not change; `#zoomVal` is unchanged; no re-render flash.

### READ-080 - Third finger / lifted finger mid-pinch
**P1** * Edge * `src/app.js:1013`, `src/app.js:1043-1044` * Touch devices only

- **Steps:**
  1. Start a pinch, add a third finger, then lift to one finger, then lift all.
  2. Separately: start a pinch and get interrupted by an incoming-call style `touchcancel` (or swipe from the screen edge).
- **Expect:** Zoom commits (or cleanly aborts) exactly once; the transform is always cleared — the page never stays visually scaled without the readout matching.
- **Watch:** `touchmove` bails when `e.touches.length !== 2`, so the third finger freezes the preview at its last value and the eventual `touchend` commits that. Verify the committed zoom equals what you saw.

### READ-081 - Pinch is inert when no document is loaded
**P2** * Edge * `src/app.js:994` (`!pdfDoc`) * Touch devices only

- **Pre:** Empty library state (READ-007) or the fallback card.
- **Steps:**
  1. Pinch over the reader area.
- **Expect:** Nothing scales, no console error, no zoom change.

### READ-082 - Pinch anchors on the page under the fingers in continuous mode
**P1** * Functional * `src/app.js:998-1006` * Touch devices only

- **Pre:** Continuous mode, two pages partly visible.
- **Steps:**
  1. Pinch centred on the **lower** page.
- **Expect:** After commit, `state.ui.page` is that lower page (check `#pageInput`) and the reader stays anchored there — not scrolled back to the upper page.

### READ-083 - Pinch during an in-flight render
**P1** * Edge * `src/app.js:1033`, `src/app.js:462` * Touch devices only

- **Steps:**
  1. Jump to a far page, then pinch immediately while it is still rendering.
- **Expect:** The final zoom matches the readout and the final page matches `#pageInput`; no permanently mis-sized `#pageWrap`.

### READ-084 - Desktop trackpad pinch does not corrupt the reader
**P2** * Edge * `src/styles.css:110`

- **Pre:** macOS trackpad, Chrome and Safari.
- **Steps:**
  1. Pinch on the trackpad over the reader.
- **Expect:** This is browser page zoom (whole UI scales) — acceptable. Afterwards, `+`/`−` and page navigation still work and the canvas re-renders at the next zoom press.
- **Watch:** Safari's `gesturestart` can also fire; verify no double-handling that leaves the page layer with a residual `transform`.

---

## 7. Find in document

### READ-085 - Search button opens the find bar
**P0** * Functional * `src/app.js:3123 wire()`, `src/app.js:2937 openFind()`

- **Steps:**
  1. Hover `#btnSearch` (magnifier icon) and read the tooltip; click it.
- **Expect:** Tooltip **"Search in document"**. The find bar appears at the top-right of the reader (`top:68px;right:16px`, `src/styles.css:129`), the input is focused, and `#btnSearch` gains the `.active` blue-weak treatment.

### READ-086 - Search button toggles the bar closed
**P1** * Functional * `src/app.js:3123`

- **Steps:**
  1. With the bar open, click `#btnSearch` again.
- **Expect:** The bar hides, `#btnSearch` loses `.active`, all orange marks disappear from the page.

### READ-087 - Cmd/Ctrl+F opens the find bar instead of the browser's
**P0** * Functional * `src/app.js:3124`

- **Pre:** A document loaded (`numPages > 0`). Focus anywhere — the page, the notes list, the composer.
- **Steps:**
  1. Press `Cmd+F` (macOS) / `Ctrl+F` (Windows/Linux) from each of those focus points.
- **Expect:** The app's find bar opens and focuses every time; the browser's native find bar does **not** appear.
- **Watch:** This is a document-level listener with `preventDefault()` — it also swallows `Cmd+F` while you are typing a note. That is intentional but worth re-confirming after any keyboard-handling change.

### READ-088 - Cmd/Ctrl+F falls through when no document is open
**P1** * Edge * `src/app.js:3124` (`numPages > 0`)

- **Pre:** Empty library (READ-007).
- **Steps:**
  1. Press `Cmd/Ctrl+F`.
- **Expect:** The **browser's** find bar opens; the app's find bar does not.

### READ-089 - Find bar chrome and copy
**P0** * Copy * `src/app.js:2915-2923 findBarEl()`

- **Steps:**
  1. Open the bar and hover each control.
- **Expect, verbatim:** placeholder **"Find in document…"** (single-character ellipsis), a magnifier icon on the left, an empty count area, a thin separator, then three buttons with tooltips **"Previous (Shift+Enter)"**, **"Next (Enter)"**, **"Close (Esc)"**. The input has `autocomplete="off"` and `spellcheck="false"` (no red squiggles, no autofill dropdown).

### READ-090 - Typing searches after a short debounce
**P0** * Functional * `src/app.js:2927`, `src/app.js:2956 findRun()`

- **Steps:**
  1. Type `transformer` at a normal speed and watch the count area.
- **Expect:** Roughly 160ms after you stop typing, the count area briefly shows **"Searching…"** and then a count like **"1 / 24"** (space-slash-space, tabular figures, right-aligned). The reader jumps to the first match at or after the current page.

### READ-091 - No-match copy
**P0** * Copy * `src/app.js:2972`

- **Steps:**
  1. Type `zzqqxx`.
- **Expect:** The count area reads exactly **"No results"**; nothing is marked on the page; the reader does not move.

### READ-092 - Clearing the query resets everything
**P1** * State * `src/app.js:2961`

- **Steps:**
  1. Search a common word, then select all in the input and delete.
- **Expect:** The count area goes empty (not `"0 / 0"`, not `"No results"`), and every orange mark is removed from the page.

### READ-093 - Whitespace-only query is treated as empty
**P1** * Edge * `src/app.js:2957` (`.trim()`)

- **Steps:**
  1. Type three spaces.
- **Expect:** Count area empty, no marks, no "Searching…" flash.

### READ-094 - Search is case-insensitive
**P1** * Functional * `src/app.js:2964`, `src/app.js:2993 findMarkPage()`

- **Steps:**
  1. Search `BERT`, note the count. Clear, search `bert`.
- **Expect:** Identical counts and identical marks (both sides lower-case before comparing).

### READ-095 - Regex-special characters are literal
**P1** * Edge * `src/app.js:2968` (`indexOf`, not RegExp)

- **Steps:**
  1. Search `(` then `.*` then `[MASK]`.
- **Expect:** They are matched literally — `[MASK]` finds the token in the BERT paper; `.*` almost certainly gives **"No results"**. No console error, no runaway search.

### READ-096 - Next steps forward and wraps
**P0** * Functional * `src/app.js:2991 findGo()`, `src/app.js:2979` (modulo wrap)

- **Steps:**
  1. Search a term with several matches. Press `Enter` repeatedly past the last one.
- **Expect:** The count increments `2 / 24`, `3 / 24`, … and after `24 / 24` wraps to `1 / 24`, jumping back to the first match's page.

### READ-097 - Shift+Enter steps backward and wraps
**P0** * Functional * `src/app.js:2929`

- **Steps:**
  1. From `1 / 24`, press `Shift+Enter`.
- **Expect:** Count becomes `24 / 24` and the reader jumps to the last match.

### READ-098 - Prev/Next buttons match the keyboard
**P1** * Functional * `src/app.js:2932-2933`

- **Steps:**
  1. Click the `›`-style Next chevron and the `‹`-style Prev chevron a few times each.
- **Expect:** Identical behaviour to Enter / Shift+Enter, including wrap-around. Hovering shows the `.find-nav:hover` surface-2 background (`src/styles.css:137`).

### READ-099 - Current match is visually distinct from the others
**P0** * Visual * `src/app.js:3000 findMarkPage()`, `src/styles.css:127-128`

- **Steps:**
  1. Search a word that occurs several times on one page and step through them.
- **Expect:** All matches on the page get a translucent amber `mark.sh`; the current one gets `mark.sh.cur` — near-opaque amber with a 1.5px darker ring. Exactly one `.cur` exists at a time.
- **Watch:** `findMarkPage` counts occurrences in DOM order of `.textLayer span`s. If PDF.js emits spans out of reading order, the `.cur` ring can land on the wrong instance while the count says otherwise.

### READ-100 - Current match is scrolled into the middle of the viewport
**P1** * Functional * `src/app.js:2988-2989 findGoto()`

- **Steps:**
  1. Step to a match near the bottom of a page.
- **Expect:** The reader scrolls so the marked word is vertically centred (`block:'center'`), never left under the toolbar or below the fold.

### READ-101 - Search starts from the page you are on
**P1** * Functional * `src/app.js:2973-2975`, `src/app.js:2954 findCurrentPage()`

- **Steps:**
  1. Navigate to page 8, then search a word that occurs on pages 2, 5, 9 and 12.
- **Expect:** The first hit shown is the one on page **9** (`m.findIndex(x => x.page >= cur)`), with the count reading its global index (e.g. `3 / 4`) — not `1 / 4`.
- **Watch:** In continuous mode "the page you are on" is derived from `currentContinuousPage()`; if the 35% band regresses, searching can jump backwards unexpectedly.

### READ-102 - Find works in continuous mode
**P0** * Functional * `src/app.js:2982`, `src/app.js:2955 findPageEl()`

- **Pre:** Continuous mode.
- **Steps:**
  1. Search a term with matches spread across the document and step through 5 of them.
- **Expect:** Each step scrolls to the right page (rendering it on demand if it was a placeholder) and marks it. `#pageInput` tracks along.
- **Watch:** `findGoto` waits a fixed **50ms** after navigation before marking (`src/app.js:2984`). On a slow machine or a heavy page the text layer may not exist yet → the count updates but nothing is highlighted. Repeat this check on a throttled CPU (DevTools → Performance → 6x slowdown).

### READ-103 - Find works in single-page mode across pages
**P0** * Functional * `src/app.js:2983`

- **Pre:** Single-page mode.
- **Steps:**
  1. Search a term and press Enter through matches on different pages.
- **Expect:** Each step renders the target page and marks the match; the page number in `#pageInput` matches the page you are looking at.
- **Watch:** Same 50ms race as READ-102, made worse by `renderPage`'s early-return queueing — the most likely symptom is "second and third Enter show the count but no orange".

### READ-104 - Marks are cleared before each step
**P1** * State * `src/app.js:2981 findGoto()`, `src/app.js:2951 clearFindMarks()`

- **Steps:**
  1. Step through 10 matches spanning several pages, then scroll back through the pages you visited.
- **Expect:** Only the current page carries marks; earlier pages are back to clean text (`clearFindMarks` resets `span.textContent` and drops `._shl`).
- **Watch:** `clearFindMarks` operates on **every** `.textLayer` in the document, including all continuous pages — confirm it is not O(n) slow on a 500-page doc mid-search.

### READ-105 - Closing the find bar removes all marks and resets state
**P0** * Functional * `src/app.js:2944 closeFind()`

- **Steps:**
  1. Search, step to match 5, click the `✕` (Close) button.
- **Expect:** Bar hides, every mark disappears, the count area is emptied, `#btnSearch` loses `.active`. The **input keeps its text**.

### READ-106 - Escape closes the bar only while the input has focus
**P1** * Edge * `src/app.js:2930`

- **Steps:**
  1. Open find, type a query, press `Escape` → bar closes.
  2. Open find again, click on the PDF page (input loses focus), press `Escape`.
- **Expect:** (1) closes. (2) does **not** close — the handler is bound to `#findInput`, not the document.
- **Watch:** Users report "Escape doesn't close search". Confirm whether it is this documented limitation before filing.

### READ-107 - Reopening re-runs the previous query
**P1** * Functional * `src/app.js:2942 openFind()`

- **Steps:**
  1. Search `attention`, close the bar, click `#btnSearch` again.
- **Expect:** The input still shows `attention`, its text is **selected** (so typing replaces it), and the search re-runs immediately — the count reappears and the reader jumps to the first match at/after the current page (which may differ from before if you navigated).

### READ-108 - Rapid typing supersedes stale results
**P1** * Edge * `src/app.js:2970` (`findS.q !== q`)

- **Pre:** A long document so a full scan takes a moment.
- **Steps:**
  1. Type `the`, then within a second extend it to `theoretical`, then to `theoreticalxyz`.
- **Expect:** The final count corresponds to the **last** query only. You must never see the count for `the` land after you finished typing `theoreticalxyz`.

### READ-109 - Very long query
**P2** * Edge * `src/app.js:2956`

- **Steps:**
  1. Paste a 300-character paragraph into the find input.
- **Expect:** Either `No results` or a real match, within a second or two; the bar does not grow past its layout (`#findInput` is a fixed `210px`, `src/styles.css:132`) and does not push the nav buttons off-screen.

### READ-110 - Phrase spanning two text-layer spans: count vs marks
**P1** * Edge * `src/app.js:2966-2968` vs `src/app.js:2994-2996`

- **Steps:**
  1. Find a phrase in the PDF that crosses a line break (e.g. the last two words of one line plus the first word of the next) and search it as a single string with a space.
- **Expect (current behaviour):** The count may report a match found in the joined page text while **no orange mark appears**, because marking works per-span. Record what you see.
- **Watch:** This is a real, reproducible mismatch: the count comes from `text = items.map(i => i.str).join(' ')` while highlighting scans individual spans. If a fix is made, both the count and the mark must agree.

### READ-111 - Find with no PDF loaded
**P1** * Edge * `src/app.js:2962`

- **Pre:** Empty library or the fallback card, but with the find bar forced open (open it while a doc is loaded, then delete the doc, or open the bar in the read-only bundle before its PDF loads).
- **Steps:**
  1. Type any query.
- **Expect:** Count reads **"No results"**; no console error from `ensurePageText` against a null `pdfDoc`.

### READ-112 - Zooming while find results are showing
**P1** * Edge * `src/app.js:3179`, `src/app.js:2951`

- **Steps:**
  1. Search, land on match `3 / 12`, then click `+`.
- **Expect (current behaviour):** The page re-renders, so all marks vanish, while the count still reads `3 / 12`. Pressing Enter re-marks correctly from the stale index.
- **Watch:** Nothing calls `clearFindMarks()`/`findRun()` on a re-render. A user-visible "my highlights disappeared but it still says 3 of 12" report maps to this; verify Enter recovers it before escalating.

### READ-113 - Toggling continuous mode while find results are showing
**P1** * Edge * `src/app.js:572`, `src/app.js:2954`

- **Steps:**
  1. Search in single mode, land on a match, click `#btnContinuous`.
  2. Press Enter.
- **Expect:** Marks are wiped by the rebuild; the count is preserved; Enter steps to the next match and marks the correct continuous page (`findPageEl` switches its selector by mode).

### READ-114 - Find over an OCR'd scanned page
**P1** * Functional * `src/app.js:591 ensurePageText()`, `src/app.js:662 applyOcrLayer()`

- **Pre:** A scanned PDF that has been OCR'd via the banner ("Run OCR").
- **Steps:**
  1. Search a word you can see in the scan.
- **Expect:** It is found (`ensurePageText` prefers the OCR record) and the mark lands over the right word in the image, because the OCR text layer is built from word boxes.
- **Watch:** OCR pages have `items: []` — anything that assumes `items` is populated (rect resolution, section detection) can behave differently here.

### READ-115 - Find bar vs top banners on a narrow window
**P2** * Visual * `src/styles.css:129`, `src/styles.css:657`, `src/app.js:737 restackBanners()`

- **Steps:**
  1. Trigger the OCR banner (or the "open notes?" banner), then open the find bar, at ~700px width.
- **Expect:** The banner (`position:fixed;top:64px`, centred, `z-index:65`) sits above the find bar (`z-index:40`). Both remain fully clickable — the banner must not cover the find input or its buttons.
- **Watch:** The find bar is offset against the 60px `.rd-top`; the mobile rules keep `.rd-top` at exactly 60px for this reason (`src/styles.css:563-566`). A toolbar height change silently misplaces the find bar and the capture bar.

### READ-116 - Find input font size on iOS
**P2** * Visual * `src/styles.css:600` * Firefox/Safari only (iOS)

- **Pre:** iPhone Safari.
- **Steps:**
  1. Open the find bar and tap the input.
- **Expect:** No page zoom on focus — `#findInput` is forced to 16px below 820px. The toolbar stays put.
- **Watch:** Removing `#findInput` from that selector list re-introduces the iOS auto-zoom, which drags the whole layout sideways.

### READ-117 - Find bar is created once and reused
**P2** * State * `src/app.js:2911-2913 findBarEl()`

- **Steps:**
  1. Open and close the find bar ten times.
  2. Console: `document.querySelectorAll('#findBar').length`.
- **Expect:** Always `1`; the input's event listeners are attached exactly once (typing once triggers one search — check with a slow query that the "Searching…" flash appears once).

### READ-118 - Find in the read-only shared HTML
**P1** * Functional * `src/app.js:3294 applyReadOnly()`, `src/app.js:2937`

- **Pre:** A `.html` produced by "Share as HTML", opened from disk.
- **Steps:**
  1. Open the find bar (button and `Cmd/Ctrl+F`), search, step through matches.
- **Expect:** Search behaves identically to the full app — `#btnSearch` is not among the hidden controls in `applyReadOnly()` — and the red banner **"Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX"** does not overlap the find bar.

---

## 8. Cross-cutting edges & regressions

### READ-119 - Reader recovers after a rapid open-open-open of the same PDF
**P1** * Edge * `src/app.js:231-239 openPdfFile()`

- **Steps:**
  1. Open the same PDF file three times in a row via "Open PDF or bundle".
- **Expect:** No duplicate library entries (content-addressed by SHA-256); the toast **"Reopened <name> — same paper, your notes are here."** appears from the second time on; the reader shows page 1 rendered each time.

### READ-120 - Navigating the browser away mid-render
**P1** * Edge * `src/app.js:456`, `src/app.js:519`

- **Steps:**
  1. Start opening a large PDF and immediately hit browser Back, then Forward.
- **Expect:** Returning re-boots cleanly to a rendered reader; no "Aborted" error card; the library still lists the document.

### READ-121 - Reader is usable at 320px width
**P2** * Visual * `src/styles.css:566-583`, `src/styles.css:609-612`

- **Steps:**
  1. Set the window to 320px wide.
- **Expect:** `.rd-mid` scrolls horizontally (no visible scrollbar), the four annotation tools float at the bottom centre, page prev/next + input + `+`/`−` + search are reachable, and the page canvas is not covered by the floating tools bar (bottom padding `88px + safe-area`).

### READ-122 - Two tabs of the app do not corrupt each other's reader state
**P2** * Edge * `src/app.js:151 save()`

- **Steps:**
  1. Open the app in two tabs. In tab A set zoom 200% and page 10; in tab B set zoom 80% and page 3. Reload both.
- **Expect:** Both reload into the last-written state (last writer wins) and render consistently — the readout, the page input and the actual rendered page always agree within a tab. No mixed state such as `200%` in the readout with a page drawn at 80%.

### READ-123 - Storage-denied environments still render
**P1** * Edge * `src/app.js:163-166 save()`

- **Pre:** Browser set to block all site data / a sandboxed opaque origin.
- **Steps:**
  1. Load the app, navigate pages, zoom, use find.
- **Expect:** Everything renders; failures to persist are silent (except a quota toast **"Storage limit reached — export your notes to keep them."**). Reloading resets zoom/page to defaults, which is acceptable.

### READ-124 - Reader after the notes panel is resized
**P2** * Visual * `src/app.js:3221 initPanelResize()`

- **Steps:**
  1. Drag the notes panel's left grip (tooltip **"Drag to resize · double-click to reset"**) from 384px to ~700px and back; double-click to reset.
- **Expect:** The reader column narrows/widens live; the page re-centres; no re-render is triggered (page stays the same size, which is expected), and highlights/pins/connector stay attached.

### READ-125 - Sample document identity
**P2** * Copy * `src/app.js:38 SAMPLE_DOC_NAME`

- **Steps:**
  1. Fresh profile: read the sidebar entry and the reader's first page.
- **Expect:** The library row reads **"BERT — Devlin et al. 2019 (NAACL).pdf"** and the rendered first page is that paper's title page. `#pageTotal` matches its real page count.
- **Watch:** `SEED_VERSION` (`src/app.js:39`) must be bumped whenever the bundled sample changes, or existing installs render a new PDF with the old sample's notes anchored to the wrong pages.

### READ-126 - No console errors during a full reader pass
**P0** * Regression * whole document

- **Steps:**
  1. With the console open and "Preserve log" on, run: boot → page next/prev ×5 → jump to a far page → zoom in ×3 / out ×3 → toggle continuous on/off twice → scroll 20 pages → open find, search, step 5 matches, close → switch documents → reload.
- **Expect:** Zero uncaught exceptions and zero "Cannot read properties of null" entries. PDF.js informational warnings (font substitutions, etc.) are acceptable — record them so new ones are visible.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `setupWorker()` src/app.js:410 | READ-001, READ-002, READ-003, READ-009 |
| `CDN` const src/app.js:171 | READ-003 |
| `window.PDFJS_WORKER_B64` app.html:131 | READ-001, READ-002, READ-009 |
| `fitZoom()` src/app.js:427 | READ-073, READ-075, READ-078 |
| `fitZoomToWidth()` src/app.js:437 | READ-073, READ-074 |
| `isNarrowViewport()` src/app.js:1144 | READ-073, READ-074 |
| `initPdf()` src/app.js:445 | READ-008, READ-010, READ-036, READ-049 |
| `renderPage()` src/app.js:456 | READ-006, READ-011, READ-012, READ-013, READ-016, READ-019, READ-022, READ-065, READ-068, READ-103 |
| `outputScale` src/app.js:172 | READ-011, READ-071 |
| `rendering` / `renderQueued` src/app.js:175 | READ-016, READ-068, READ-103 |
| `contHost()` src/app.js:495 | READ-042, READ-055 |
| `renderInto()` src/app.js:500 | READ-014, READ-044, READ-046, READ-050, READ-056, READ-066 |
| `buildContinuous()` src/app.js:519 | READ-006, READ-022, READ-042, READ-045, READ-047, READ-064 |
| `teardownContinuous()` src/app.js:537 | READ-043, READ-048, READ-049 |
| `scrollToPage()` src/app.js:541 | READ-039, READ-042, READ-064 |
| `scrollToAnnotation()` src/app.js:548 | READ-040 |
| `currentContinuousPage()` src/app.js:566 | READ-037, READ-043, READ-054, READ-101 |
| `setContinuous()` src/app.js:572 | READ-041, READ-042, READ-043, READ-053, READ-113 |
| `gotoPage()` src/app.js:579 | READ-025, READ-026, READ-027, READ-028, READ-034, READ-039 |
| `ensurePageText()` src/app.js:586 | READ-017, READ-090, READ-111, READ-114 |
| `applyOcrLayer()` src/app.js:662 | READ-114 |
| `initPinch()` src/app.js:990 | READ-076, READ-077, READ-078, READ-079, READ-080, READ-081, READ-082, READ-083, READ-084 |
| `pageWrappers()` src/app.js:1094 | READ-050 |
| `drawHighlights()` src/app.js:1101 | READ-019, READ-050, READ-066 |
| `drawPins()` src/app.js:1116 | READ-019, READ-050, READ-066 |
| `drawConnector()` src/app.js:1162 | READ-020, READ-124 |
| `setPanel()` src/app.js:1150 | READ-057 |
| `setTool()` src/app.js:906 | READ-015, READ-051 |
| `switchDoc()` src/app.js:203 | READ-008, READ-018, READ-049, READ-072 |
| `openPdfFile()` src/app.js:219 | READ-119 |
| `save()` src/app.js:151 | READ-063, READ-122, READ-123 |
| `findBarEl()` src/app.js:2911 | READ-085, READ-089, READ-117 |
| `openFind()` src/app.js:2937 | READ-085, READ-087, READ-107, READ-118 |
| `closeFind()` src/app.js:2944 | READ-086, READ-105, READ-106 |
| `clearFindMarks()` src/app.js:2951 | READ-092, READ-104, READ-105, READ-112 |
| `findCurrentPage()` src/app.js:2954 | READ-101, READ-113 |
| `findPageEl()` src/app.js:2955 | READ-102, READ-113 |
| `findRun()` src/app.js:2956 | READ-090, READ-091, READ-092, READ-093, READ-094, READ-095, READ-108, READ-109, READ-110, READ-111 |
| `findGoto()` src/app.js:2977 | READ-096, READ-097, READ-100, READ-102, READ-103, READ-104 |
| `findGo()` src/app.js:2991 | READ-096, READ-097, READ-098 |
| `findMarkPage()` src/app.js:2992 | READ-094, READ-099, READ-110 |
| `updateZoom()` src/app.js:3179 | READ-058, READ-059, READ-062, READ-063, READ-064, READ-065, READ-069, READ-112 |
| `showReaderFallback()` src/app.js:3180 | READ-004, READ-006, READ-008 |
| `showEmptyReader()` src/app.js:3197 | READ-007, READ-088 |
| `applyReadOnly()` src/app.js:3294 | READ-009, READ-118 |
| `boot()` src/app.js:3303 (fit, timeout, precache) | READ-005, READ-010, READ-017, READ-063, READ-073 |
| `initPanelResize()` src/app.js:3221 | READ-124 |
| `wire()` pagePrev/pageNext src/app.js:3087-3088 | READ-025, READ-026, READ-027, READ-028 |
| `commitPage()` src/app.js:3089 | READ-029, READ-030, READ-032, READ-033, READ-034, READ-035 |
| `#pageInput` focus/select src/app.js:3090 | READ-031 |
| `#pageInput` Enter src/app.js:3092 | READ-029 |
| `#btnContinuous` wiring src/app.js:3093-3094 | READ-041, READ-052, READ-053 |
| `#zoomIn` / `#zoomOut` src/app.js:3095-3096 | READ-058, READ-059, READ-060, READ-061, READ-070 |
| `#btnSearch` toggle src/app.js:3123 | READ-085, READ-086 |
| Cmd/Ctrl+F handler src/app.js:3124 | READ-087, READ-088 |
| `#rdScroll` scroll listener src/app.js:3174 | READ-020, READ-037, READ-038 |
| Comment placement in both modes src/app.js:3104-3122 | READ-051 |
| Reader drag-and-drop src/app.js:3071-3084 | READ-023 |
| `#pageTotal` `"/ 1"` / `"/ 0"` app.html:52, src/app.js:449,3200 | READ-007, READ-010, READ-036 |
| `#zoomVal` `"115%"` app.html:57 | READ-010, READ-058, READ-062, READ-069 |
| `#btnContinuous` title "Continuous scroll" app.html:66 | READ-041 |
| `#btnSearch` title "Search in document" app.html:67 | READ-085 |
| `‹` / `›` / `+` / `−` glyph labels app.html:50,53,56,58 | READ-025, READ-058 |
| "Find in document…" placeholder src/app.js:2917 | READ-089 |
| "Previous (Shift+Enter)" / "Next (Enter)" / "Close (Esc)" src/app.js:2920-2922 | READ-089, READ-098 |
| "Searching…" src/app.js:2963 | READ-090, READ-117 |
| "No results" src/app.js:2962, 2972 | READ-091, READ-095, READ-111 |
| `"n / m"` count src/app.js:2987 | READ-090, READ-096, READ-097, READ-101 |
| "Open this file directly to read the PDF" + body src/app.js:3190-3192 | READ-004, READ-009 |
| "Engine note: …" + timeout copy src/app.js:3193, 3343 | READ-005 |
| "Your library is empty" + body src/app.js:3207-3208 | READ-007 |
| "Could not open “…” — it may not be a valid PDF." src/app.js:215 | READ-008 |
| "Could not load “…”. Re-open it with New." src/app.js:213 | READ-008 |
| "Could not open file: " / "Could not open dropped files: " src/app.js:3068, 3081 | READ-008, READ-023 |
| "Drop a PDF (+ its .notes.json), or a shared .html, to open it" src/styles.css:674 | READ-023 |
| "Comment placed — type your note below." src/app.js:3110 | READ-051 |
| "Reopened … — same paper, your notes are here." src/app.js:237 | READ-119 |
| "Storage limit reached — export your notes to keep them." src/app.js:165 | READ-123 |
| "Drag to resize · double-click to reset" src/app.js:3223 | READ-124 |
| `SAMPLE_DOC_NAME` src/app.js:38 | READ-010, READ-125 |
| `.rd-scroll` touch-action src/styles.css:110 | READ-076, READ-084 |
| `#contPages` safe-center src/styles.css:115 | READ-047 |
| `.pg` / `#pageCanvas` background+shadow src/styles.css:116,120 | READ-021 |
| `.textLayer` + `mark.sh` / `mark.sh.cur` src/styles.css:121-128 | READ-013, READ-099 |
| `.find-bar` layout src/styles.css:129-138 | READ-085, READ-109, READ-115 |
| `.icon-btn.active` src/styles.css:118 | READ-041, READ-085, READ-086 |
| `@media (max-width:820px)` reader rules src/styles.css:545-608 | READ-054, READ-116, READ-121 |
| `@media (max-width:560px)` src/styles.css:609-612 | READ-052, READ-069 |
| Whole-reader smoke pass | READ-024, READ-120, READ-122, READ-126 |

## Deliberately not covered here

- **Text selection → Highlight / Note / ✦ Ask AI popover, the highlight tool and highlight colours** - covered in the annotations & highlighting document (only the text layer's *selectability* is checked here, in READ-013 / READ-067).
- **Screenshot region capture, `#captureMask` drag, the "Select area to capture" / "Cancel" bar** - covered in the screenshot & figure-capture document; READ-015 only checks the pointer-events flip on the text layer.
- **OCR detection, the "This looks like a scanned PDF …" banner, "Run OCR", Tesseract progress and cancellation** - covered in the OCR document; READ-114 only checks that find consumes an existing OCR text layer.
- **Library sidebar, document open/trash/restore/star, `.notes.json` pairing, folder sync and the File System Access dialogs** - covered in the library & storage document.
- **Notes panel, composer, filters, notes search (`#ntSearchbar`, "Search notes, answers, tags…"), sorting and the export sheet** - covered in the notes & export documents.
- **AI calls (Ask AI, document questions, generated images) and Settings** - covered in the AI documents.
- **Connector-line geometry in detail** - only its survival across render/zoom/scroll is checked here (READ-020); its drawing rules belong to the notes document.
- **Read-only share-bundle generation** (`exportSelfContainedHTML` internals, escaping, analytics stripping) - covered in the sharing/export document; READ-009 and READ-118 only exercise the reader inside the produced file.
