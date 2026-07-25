# 17 - Performance, scale & limits

> How PairedX behaves under load: large and long PDFs, many documents, many notes, long AI answers, OCR runtime, continuous-scroll memory, storage ceilings, export size, and every hard-coded cap, debounce and timeout in the source.

| | |
|---|---|
| **ID prefix** | PERF |
| **Scope** | Time, memory, byte size and item counts across every surface. Every numeric constant in the code — debounces (250 ms / 1.5 s / 160 ms / 120 ms / 350 ms), timeouts (7 s boot race, 60 s server abort), caps (zoom 0.5–3, outputScale 2, agent 7 iterations, 50 000-char tool results, 2 MB text fields, 50 000 annotations), and the storage ceilings behind them. Also first paint, 100+ page PDFs, 500+ note libraries, self-contained export size/build time, and memory growth after a long continuous scroll. |
| **Primary code** | `src/app.js:151-168`, `src/app.js:396-408`, `src/app.js:445-583`, `src/app.js:707-794`, `src/app.js:1428-1510`, `src/app.js:2288-2331`, `src/app.js:2450-2455`, `src/app.js:2553-2617`, `src/app.js:3303-3353`, `api/ai.js:39-76`, `src/styles.css` |
| **Checks** | 100 |

**Test corpus** (prepare once — most checks reference these by name):

- **BIG-PDF** — a text PDF of 250–500 pages, 20–60 MB (e.g. a thesis or a standards document).
- **HUGE-PDF** — a single PDF over 150 MB, any page count (a scanned book works).
- **SCAN-PDF** — an image-only scanned PDF of 40+ pages (no selectable text).
- **SAMPLE** — the bundled `BERT — Devlin et al. 2019 (NAACL).pdf`: 16 pages, ~768 KB, seeded with 12 notes / 20 messages / ~976 KB of embedded images.
- **NOTES-500** — a `.notes.json` you build by exporting a document after driving it to 500+ notes (or by hand-duplicating annotation objects with fresh `id` values).
- Chrome DevTools **Performance**, **Memory → Heap snapshot**, **Application → Storage / IndexedDB / Local storage**, and **Network → throttling** are the measuring tools throughout.

All timing targets below are **guidance for a 2020-or-newer laptop on a warm cache**, not hard gates — record the number, compare it to the previous run, and flag regressions of more than ~30%. Only checks that say "**fail**" describe a release blocker.

## Contents
- [1. Cold boot and first paint](#1-cold-boot-and-first-paint) - 7 checks
- [2. Large and long PDFs](#2-large-and-long-pdfs) - 10 checks
- [3. Continuous scroll: lazy rendering and memory](#3-continuous-scroll-lazy-rendering-and-memory) - 10 checks
- [4. Zoom, HiDPI and canvas ceilings](#4-zoom-hidpi-and-canvas-ceilings) - 7 checks
- [5. Notes at scale](#5-notes-at-scale) - 11 checks
- [6. Storage ceilings and write debounces](#6-storage-ceilings-and-write-debounces) - 11 checks
- [7. AI and agent caps](#7-ai-and-agent-caps) - 12 checks
- [8. OCR runtime and caps](#8-ocr-runtime-and-caps) - 8 checks
- [9. Find and search at scale](#9-find-and-search-at-scale) - 5 checks
- [10. Export, share and print](#10-export-share-and-print) - 8 checks
- [11. Import and bundle DoS caps](#11-import-and-bundle-dos-caps) - 6 checks
- [12. Network, offline and external dependencies](#12-network-offline-and-external-dependencies) - 5 checks

---

## 1. Cold boot and first paint

### PERF-001 - Measure the blocking payload of /app
**P0** * Perf * `app.html:130-134`

- **Pre:** DevTools → Network, "Disable cache" ticked, no throttling.
- **Steps:**
  1. Load `/app`.
  2. Sort the Network panel by size and record the transferred and uncompressed sizes of `pdf.min.js`, `pdf.worker.b64.js`, `sample-pdf.js`, `sample-notes.js`, `app.js`, `styles.css`.
- **Expect:** Five render-blocking classic `<script>` tags with no `defer`/`async`, totalling **~4.2 MB uncompressed** (pdf.worker.b64.js ~1.45 MB, sample-notes.js ~1.13 MB, sample-pdf.js ~1.05 MB, pdf.min.js ~320 KB, app.js ~234 KB) and **~1.2–1.6 MB transferred** once Vercel's brotli applies. Every one of them must arrive `content-encoding: br` or `gzip`.
- **Watch:** A new bundled asset added to `app.html` without compression, or `sample-notes.js` growing again after a re-seed — it is already the single largest same-origin file and it is parsed on every load even for users who never open the sample.

### PERF-002 - First contentful paint and time-to-interactive on the app shell
**P0** * Perf * `src/app.js:3303 boot()`

- **Pre:** Fresh profile (no `srw_state_v1` in localStorage), cache disabled.
- **Steps:**
  1. Record a DevTools Performance trace across a load of `/app`.
  2. Note FCP, the moment page 1 of the sample renders, and the moment the notes list shows its 12 seeded cards.
- **Expect:** FCP under **~1.2 s**; the sample's page 1 canvas painted within **~3 s**; the notes list populated within **~4 s**. Nothing after `DOMContentLoaded` blocks the main thread for a single task longer than ~500 ms.
- **Watch:** `boot()` is fully sequential — `idbOpen()` → `rehydrateAssets()` → `loadDocBytes` → `initPdf` → `seed()` → `render()`. Any new `await` inserted into that chain pushes first paint of the PDF back by its full duration.

### PERF-003 - Warm boot is materially faster than cold boot
**P1** * Perf * `app.html:130-134`

- **Pre:** Load `/app` once with cache enabled, then reload.
- **Steps:**
  1. Reload and read the Network panel.
- **Expect:** `pdf.min.js`, `pdf.worker.b64.js`, `sample-pdf.js`, `sample-notes.js`, `app.js` and `styles.css` all serve from **(disk cache)** or return **304**; total transferred drops to a few KB and time-to-PDF roughly halves.
- **Watch:** A deploy that changes the cache key of the 1.45 MB worker on every release makes every returning user re-download it. Confirm the response carries a long `cache-control` max-age with an immutable hashed URL or an ETag that actually revalidates.

### PERF-004 - rehydrateAssets is sequential — measure boot cost per stored image
**P1** * Perf * `src/app.js:144 rehydrateAssets()`

- **Pre:** A library whose notes hold many offloaded images. Reach it by importing NOTES-500 with screenshots, or by capturing 40+ screenshot notes and reloading twice (the first save moves them to IndexedDB under the `@idb` sentinel).
- **Steps:**
  1. Reload `/app` and record a Performance trace.
  2. In the trace, find the run of `idbGet` calls before `wire()`.
- **Expect:** One `await idbGet(...)` per `@idb` screenshot and per `@idb` message image, executed **one at a time**, before the reader draws anything. Record the total. With 40 images it should stay under **~250 ms**; with 500 it will be seconds — note the number.
- **Watch:** This is an un-parallelised `for` loop inside `boot()`, so image count scales boot time linearly. A user with a few hundred generated visuals sees a blank reader for the whole duration with no spinner.

### PERF-005 - The 7-second initPdf race fires on a slow-to-parse PDF
**P0** * Edge * `src/app.js:3341-3345 boot()`

- **Pre:** BIG-PDF already in the library and set as the active document (open it, then reload).
- **Steps:**
  1. Throttle CPU to 6× slowdown in DevTools → Performance.
  2. Reload `/app`.
- **Expect:** If `initPdf()` (parse + first page render + `buildContinuous()` placeholder build for every page) takes longer than **7000 ms**, the race rejects and the reader is replaced by the fallback card headed "Open this file directly to read the PDF" with the engine note "PDF engine did not start — likely a sandboxed preview. Open the downloaded file directly."
- **Watch:** That copy blames a sandboxed preview, which is wrong for a merely slow document — a 500-page PDF on a slow machine gets a misleading "download this file" message and the user cannot read a PDF that would have opened fine two seconds later. Also confirm the PDF still opens correctly when re-selected from the library (`switchDoc()` has no such timeout).

### PERF-006 - Background page-text pre-cache after boot
**P1** * Perf * `src/app.js:3352 boot()`

- **Pre:** BIG-PDF is the active document.
- **Steps:**
  1. Reload `/app` and start a Performance recording immediately.
  2. Watch the main thread from **1200 ms** after boot onward.
- **Expect:** A burst of `ensurePageText()` calls, one per page, all fired in the same tick with no concurrency limit — `for (let n = 1; n <= numPages; n++) ensurePageText(n)`. The UI must stay responsive: scrolling and clicking a note during the burst should never freeze for more than ~200 ms at a time.
- **Watch:** On a 500-page document this schedules 500 concurrent `getTextContent()` calls at once and fills `pageTextCache` with every page's full `items` array. Take a heap snapshot before and after and record the growth (expect tens to hundreds of MB); this is the single biggest driver of idle memory on long documents.

### PERF-007 - Boot with an empty library does no PDF work
**P2** * Perf * `src/app.js:3335-3336 boot()`, `src/app.js:3197 showEmptyReader()`

- **Pre:** Trash and permanently delete every document including the sample, then reload.
- **Steps:**
  1. Reload `/app` with a Performance recording running.
- **Expect:** The empty reader card "Your library is empty" appears; no `initPdf`, no page render and no `ensurePageText` burst runs; `#pageTotal` reads "/ 0". Boot completes in well under **1 s**.
- **Watch:** `sample-pdf.js` and `sample-notes.js` are still downloaded and parsed even though nothing uses them — 2.2 MB of dead payload for a user who removed the sample. Record it; it is a legitimate optimisation target.

---

## 2. Large and long PDFs

### PERF-008 - Open a 250+ page PDF and record end-to-end time
**P0** * Perf * `src/app.js:219 openPdfFile()`, `src/app.js:445 initPdf()`

- **Pre:** Empty-ish library, browser console open.
- **Steps:**
  1. Click "Open PDF or bundle" and pick BIG-PDF.
  2. Time from the file dialog closing to the toast "Opened &lt;name&gt; — highlight text or capture a figure to start." and to the first page being legible.
- **Expect:** The toast and a rendered page 1 within **~8 s** for a 300-page / 40 MB document. `#pageTotal` shows the correct "/ N". No console errors.
- **Watch:** `openPdfFile()` does `await f.arrayBuffer()` (whole file in memory), `sha256Hex()` over the same buffer, `idbPut()` of the buffer, and `_docBytes[id] = buf` — at least three simultaneous copies of the file. Take a heap snapshot before and after and confirm the retained size settles back to roughly one copy.

### PERF-009 - Open a 150 MB+ PDF
**P1** * Edge * `src/app.js:225 openPdfFile()`, `src/app.js:181 sha256Hex()`

- **Pre:** HUGE-PDF on disk.
- **Steps:**
  1. Open HUGE-PDF via "Open PDF or bundle".
  2. Watch memory in the browser task manager throughout.
- **Expect:** Either the document opens (slowly) or a clear error toast. There is **no file-size guard anywhere in the code**, so document the actual outcome and the peak tab memory.
- **Watch:** A tab crash ("Aw, Snap" / "A problem repeatedly occurred") on a file the user chose is a **fail** — the app should not die silently. Also check the IndexedDB write: `idbPut('pdf:' + id, buf)` is fire-and-forget with an empty `catch`, so a quota rejection on a 150 MB blob is swallowed and the document silently fails to reopen after a reload.

### PERF-010 - Page-count-linear placeholder build in continuous mode
**P0** * Perf * `src/app.js:519 buildContinuous()`

- **Pre:** Continuous scroll on (the default), BIG-PDF open.
- **Steps:**
  1. In DevTools → Elements, expand `#contPages`.
  2. Count its children.
- **Expect:** Exactly `numPages` `.pg` wrappers, each containing a `<canvas>`, a `.textLayer`, and two `.overlay` divs — created up front in one synchronous loop, each with `min-height` set to page 1's viewport height.
- **Watch:** For a 500-page document that is 2 500 DOM nodes created inside `initPdf()`, i.e. inside the 7-second boot race (PERF-005). Measure the loop's duration in a Performance trace; over ~1 s here is a regression.

### PERF-011 - Estimated page height causes scrollbar drift on mixed-size documents
**P1** * Perf * `src/app.js:524 buildContinuous()`, `src/app.js:508 renderInto()`

- **Pre:** A PDF whose pages are not all the same size (e.g. a paper with landscape figure pages or a scanned book with varying crops), continuous mode on.
- **Steps:**
  1. Drag the reader scrollbar from top to bottom in one motion.
- **Expect:** As placeholders are replaced by real canvases, the scroll height changes and the thumb re-seats. Pages must still land in the right place — page N must never end up showing page N±2 in `#pageInput`.
- **Watch:** Every placeholder uses page 1's height (`const est = viewport ? viewport.height : 900`). A document with a tall page 1 and short later pages over-estimates the total height by hundreds of pixels per page; "jump to page 300" then lands far from the actual page and the reader has to hunt for it.

### PERF-012 - Switching between two large documents releases the previous one's text cache
**P1** * Perf * `src/app.js:210 switchDoc()`

- **Pre:** BIG-PDF and SAMPLE both in the library. Open BIG-PDF and let the background text cache finish (wait ~60 s).
- **Steps:**
  1. Take a heap snapshot.
  2. Switch to SAMPLE in the sidebar.
  3. Force GC (DevTools → Memory → trash icon), take a second snapshot.
- **Expect:** `pageTextCache` is emptied key by key on switch, so BIG-PDF's per-page `items` arrays are released. The second snapshot should be **substantially smaller** than the first.
- **Watch:** `_docBytes` is **never** evicted — the raw bytes of every PDF opened this session stay in the JS heap for the life of the tab. Open five 30 MB PDFs in one session and confirm the retained `_docBytes` total is ~150 MB; that is the current design and worth recording each release.

### PERF-013 - loadDocBytes copies the whole file on every call
**P2** * Perf * `src/app.js:201 loadDocBytes()`

- **Pre:** BIG-PDF open.
- **Steps:**
  1. Switch away to another document and back, five times, watching the memory graph in the browser task manager.
- **Expect:** `loadDocBytes` returns `_docBytes[id].slice()` — a fresh full copy handed to PDF.js each time. Memory should spike by one file size per switch and come back down after GC.
- **Watch:** A sawtooth that never returns to baseline means PDF.js is retaining detached buffers; five switches on a 60 MB file should not leave 300 MB resident.

### PERF-014 - A library with 50+ documents renders its tree without lag
**P1** * Perf * `src/app.js:368 renderTree()`

- **Pre:** Add 50+ documents (repeatedly open distinct PDFs; content-addressing by SHA-256 means duplicates will not create new entries, so use genuinely different files).
- **Steps:**
  1. Click Home → Recents → Starred → Trash in quick succession.
  2. Star and unstar a document ten times rapidly.
- **Expect:** Each view switch repaints the list in well under **100 ms**; the section label switches between "My Library", "Recents", "Starred" and "Trash"; no visible flash of an empty list.
- **Watch:** `renderTree()` sets `list.innerHTML = ''` and rebuilds every row plus its inline SVG icons, then re-wires four `$$([data-…])` handler passes. It is called from `toggleStar`, `trashDoc`, `restoreDoc`, `switchDoc` and every nav click — at 200 documents this becomes noticeable.

### PERF-015 - Empty-state copy for each library view
**P2** * Copy * `src/app.js:374-377 renderTree()`

- **Pre:** A library where Starred and Trash are empty.
- **Steps:**
  1. Open Starred, then Trash, then remove every document and open Home.
- **Expect:** Exactly "No starred documents yet.", "Trash is empty.", and "No documents yet — use “Open PDF or bundle” to add one." (curly quotes around the button name).
- **Watch:** These are the only three strings; a fourth view or a reworded button label silently desyncs the Home message from the actual button text "Open PDF or bundle".

### PERF-016 - Rapid page-next spamming on a long document
**P1** * Edge * `src/app.js:579 gotoPage()`, `src/app.js:462 renderPage()`

- **Pre:** BIG-PDF open in **single-page** mode (toggle continuous off).
- **Steps:**
  1. Click `›` (`#pageNext`) 30 times as fast as possible.
- **Expect:** `renderPage()` guards with `rendering` and a single-slot `renderQueued`, so intermediate pages are dropped and the reader settles on the final page number. `#pageInput` and the rendered canvas must agree when the dust settles.
- **Watch:** The single-slot queue means the *last requested* page wins, but `state.ui.page` is assigned at the top of `renderPage` before the guard returns — a mismatch between the number in the box and the pixels on screen after spamming is a real regression.

### PERF-017 - Page input rejects out-of-range and junk values without work
**P2** * Edge * `src/app.js:3089 wire()`, `src/app.js:580 gotoPage()`

- **Pre:** BIG-PDF open.
- **Steps:**
  1. Type `999999` into `#pageInput` and press Enter.
  2. Type `0`, then `-5`, then `abc`, then an empty string, pressing Enter each time.
- **Expect:** `999999` clamps to the last page and renders it once. `0`, `-5`, `abc` and empty all restore the current page number with **no render at all** (`if (!v || v < 1)` returns early).
- **Watch:** A regression here turns a typo into a full re-render of a 500-page continuous view.

---

## 3. Continuous scroll: lazy rendering and memory

### PERF-018 - The IntersectionObserver rootMargin renders one screen ahead
**P0** * Perf * `src/app.js:530-531 buildContinuous()`

- **Pre:** BIG-PDF open, continuous mode on, DevTools → Elements on `#contPages`.
- **Steps:**
  1. Scroll to page 10 and stop.
  2. Inspect the `.pg` elements around it and check which ones contain a canvas with non-zero `width`.
- **Expect:** The observer uses `root: #rdScroll` with `rootMargin: '1000px 0px'`, so pages whose boxes come within **1000 px above or below** the scroll viewport are rendered. Roughly 2–4 pages ahead and behind at default zoom are painted; pages further away still show their `min-height` placeholder with a 0×0 canvas.
- **Watch:** A rootMargin regression to `0px` makes every scroll show a white gap before the page appears; a regression to a much larger value renders the whole document and blows memory (see PERF-020).

### PERF-019 - Rendered pages are never released — measure monotonic memory growth
**P0** * Perf * `src/app.js:519 buildContinuous()`, `src/app.js:500 renderInto()`

- **Pre:** BIG-PDF (250+ pages) open, continuous mode, zoom at the default 115%.
- **Steps:**
  1. Take a heap snapshot and note the browser task-manager memory for the tab.
  2. Scroll steadily from page 1 to the last page.
  3. Scroll back to page 1.
  4. Force GC and take a second snapshot; re-read the task manager.
- **Expect:** Memory grows monotonically as pages render and **does not fall back** after scrolling away — nothing un-observes a page, clears its canvas, or empties its text layer. Record the delta. At default zoom on a DPR-2 display a Letter page canvas is ~1408 × 1822 px ≈ **10 MB** of backing store, so 250 pages is **~2.5 GB** of canvas if all of them get rendered.
- **Watch:** A tab crash while scrolling a long document is a **fail**. Expect Chrome to survive by discarding canvas backing stores (pages may briefly blank and repaint); Safari on iOS is far less forgiving. This is the single most important number in this document — record it every release.

### PERF-020 - Text-layer DOM node count after a full scroll
**P1** * Perf * `src/app.js:510-512 renderInto()`

- **Pre:** BIG-PDF, continuous mode, freshly loaded.
- **Steps:**
  1. In the console run `document.querySelectorAll('#contPages .textLayer span').length` and note it.
  2. Scroll through 100 pages.
  3. Run the same command again.
- **Expect:** The count grows by roughly 500–2 000 spans per rendered page and never shrinks. After 100 dense pages expect **50 000–200 000** absolutely-positioned spans in the document.
- **Watch:** Every one of those spans is a hit-test target for the global `mouseup` / `selectionchange` handlers and for `document.elementFromPoint` during pinch. Watch for selection latency and pinch-start jank degrading as the count climbs.

### PERF-021 - Highlights and pins are redrawn for every rendered page on every note action
**P0** * Perf * `src/app.js:1094 pageWrappers()`, `src/app.js:1101 drawHighlights()`, `src/app.js:1116 drawPins()`

- **Pre:** A document with 200+ notes spread across many pages, continuous mode, 30+ pages already rendered by scrolling.
- **Steps:**
  1. Record a Performance trace.
  2. Click five different note cards in the notes panel.
- **Expect:** Each click runs `drawHighlights()` and `drawPins()`, and each of those iterates **every rendered page wrapper × every annotation in the active document**, clearing and rebuilding `innerHTML` on both overlay layers. Each click should still complete in under **~120 ms**.
- **Watch:** This is O(rendered pages × notes). With 60 rendered pages and 500 notes that is 30 000 filter passes per click, twice, plus DOM rebuilds — the classic symptom is the notes panel feeling fine on the sample and unusable on a real annotated thesis.

### PERF-022 - Scroll handler cost: page tracking plus connector redraw
**P1** * Perf * `src/app.js:3174 wire()`, `src/app.js:566 currentContinuousPage()`

- **Pre:** BIG-PDF, continuous mode, 50+ pages rendered.
- **Steps:**
  1. Record a Performance trace while flick-scrolling the reader for 5 seconds.
- **Expect:** On every scroll event `currentContinuousPage()` calls `getBoundingClientRect()` on **every** `.pg` in the document, then a `requestAnimationFrame(drawConnector)` is queued. Frame rate should stay at or near 60 fps; layout-thrash warnings ("Forced reflow") should not dominate the trace.
- **Watch:** With 500 `.pg` elements this is 500 forced layouts per scroll event. If the trace shows scroll frames over 16 ms with most time in "Recalculate Style"/"Layout", that is the regression.

### PERF-023 - Zoom in continuous mode discards every rendered page
**P0** * Perf * `src/app.js:3179 updateZoom()`, `src/app.js:523 buildContinuous()`

- **Pre:** BIG-PDF, continuous mode, scrolled to page 40 with pages 35–45 rendered.
- **Steps:**
  1. Click `+` (`#zoomIn`) once.
  2. Observe the reader and note where you end up.
- **Expect:** `updateZoom()` calls `buildContinuous()`, which does `host.innerHTML = ''`, disconnects and rebuilds the observer, renders only the current page, and calls `scrollToPage`. Zoom percent updates to "130%". You should remain on/near page 40, not be thrown to page 1.
- **Watch:** Every previously rendered page is thrown away and must re-render on scroll, so a zoom step on a long document is a full reset of the rendering work. Time it: a single zoom click on a 300-page document should not block the main thread for more than ~500 ms.

### PERF-024 - Rapid double-click on zoom races two buildContinuous runs
**P1** * Edge * `src/app.js:3095-3096 wire()`, `src/app.js:519 buildContinuous()`

- **Pre:** BIG-PDF, continuous mode.
- **Steps:**
  1. Double-click `#zoomIn` fast, then immediately triple-click `#zoomOut`.
- **Expect:** The zoom label settles on a single correct value between 50% and 300%, exactly one `#contPages` host exists, and the visible pages match the final zoom.
- **Watch:** `updateZoom()` is fired-and-forgotten from the click handler with no re-entrancy guard, so overlapping `buildContinuous()` calls can leave pages rendered at the *previous* scale (mismatched canvas vs `.pg` box, highlights offset from the text). Duplicated or orphaned `.pg` nodes, or highlights sitting a few pixels off their words, are the tell.

### PERF-025 - Toggling continuous mode off frees the page stack
**P1** * Perf * `src/app.js:537 teardownContinuous()`, `src/app.js:572 setContinuous()`

- **Pre:** BIG-PDF, continuous mode, 60+ pages rendered by scrolling, heap snapshot taken.
- **Steps:**
  1. Click `#btnContinuous` to turn continuous off.
  2. Force GC and take a second heap snapshot.
- **Expect:** `#contPages` is removed from the DOM and the observer disconnected; all 60 canvases become garbage. Retained heap should drop by roughly the amount PERF-019 measured.
- **Watch:** If memory does not drop, something (a closure in `drawHighlights`, a stale `pg._vp`, a pinch layer reference) is retaining the removed subtree — that turns the mode toggle into a leak instead of a relief valve.

### PERF-026 - Pinch-zoom on a long document promotes a huge compositor layer
**P1** * Perf * `src/app.js:1009 initPinch()` * iOS only

- **Pre:** BIG-PDF on a phone or in device emulation with touch, continuous mode, several pages rendered.
- **Steps:**
  1. Pinch in and out slowly and watch for dropped frames or a white flash.
- **Expect:** During the gesture `#contPages` gets `willChange: 'transform'` and a live `transform: scale(k)` (k clamped 0.2–5); on release both are cleared and the page re-renders crisply at the committed zoom (clamped 0.5–3).
- **Watch:** Promoting a layer that is thousands of pixels tall with dozens of rendered canvases can exhaust GPU memory — the symptom is the whole page going white or checkerboarded mid-pinch and only recovering on release. Also confirm `willChange` is actually removed afterwards; a stuck `will-change` keeps the layer promoted forever.

### PERF-027 - Resizing the window mid-scroll does not re-render the whole stack
**P2** * Edge * `src/app.js:3176 wire()`

- **Pre:** BIG-PDF, continuous mode, 30+ pages rendered.
- **Steps:**
  1. Drag the browser window from full width down to ~700 px and back, slowly.
- **Expect:** Only `requestAnimationFrame(drawConnector)` runs on resize — no re-render of any page. Pages keep their current canvas size (the layout re-centres them). No jank beyond normal browser reflow.
- **Watch:** Crossing the 820 px breakpoint mid-drag switches the asides to overlay drawers; confirm that transition does not trigger a `buildContinuous()` and that the reader keeps its scroll position rather than jumping to page 1.

---

## 4. Zoom, HiDPI and canvas ceilings

### PERF-028 - Zoom is clamped to 0.5–3 from every entry point
**P0** * Functional * `src/app.js:3095-3096 wire()`, `src/app.js:1023 initPinch()`, `src/app.js:433 fitZoom()`

- **Pre:** Any document open.
- **Steps:**
  1. Click `−` fifteen times, reading `#zoomVal` after each.
  2. Click `+` twenty-five times, reading `#zoomVal` after each.
  3. On a touch device, pinch far out and far in past the limits.
- **Expect:** The label bottoms out at **"50%"** and tops out at **"300%"**; steps are 15 percentage points. Pinch commits also clamp to the same 0.5–3 range, and `fitZoom()` clamps its computed fit into that range too.
- **Watch:** Clicking past a limit must not keep mutating `state.ui.zoom` beyond the clamp and must not trigger a re-render each time — a re-render per click at the floor is wasted work on a long document.

### PERF-029 - outputScale is capped at 2 on high-DPI displays
**P0** * Perf * `src/app.js:172`

- **Pre:** A display with `devicePixelRatio` ≥ 3 (a phone, or Chrome device emulation set to a 3× device), any document open.
- **Steps:**
  1. In the console, read `window.devicePixelRatio`.
  2. Read `document.getElementById('pageCanvas').width` and `.style.width`.
- **Expect:** The ratio of backing-store width to CSS width is **exactly 2**, never 3 or 4 — `outputScale = Math.min(window.devicePixelRatio || 1, 2)`.
- **Watch:** Removing the cap quadruples canvas memory on a 4× device. Also note `outputScale` is computed **once at module load** and never recomputed, so dragging the window between a Retina and a non-Retina monitor leaves the canvas at the boot-time ratio — text looks soft or over-sharp until reload.

### PERF-030 - Canvas backing-store size at maximum zoom
**P0** * Edge * `src/app.js:467-470 renderPage()`

- **Pre:** A US-Letter or A4 PDF, DPR-2 display, single-page mode.
- **Steps:**
  1. Zoom to 300%.
  2. In the console read `pageCanvas.width * pageCanvas.height`.
- **Expect:** Roughly **3672 × 4752 ≈ 17.4 million pixels ≈ 70 MB** for a Letter page. The page must still paint.
- **Watch:** iOS Safari caps total canvas area near **16.7 million pixels** — at 300% on a DPR-2 iPhone this page is over the limit and renders **blank or black**. Test this explicitly on a real iPhone: a white page at 300% with a working text layer (you can still select invisible text) is the signature failure.

### PERF-031 - Maximum zoom in continuous mode across many pages
**P1** * Edge * `src/app.js:506 renderInto()`

- **Pre:** BIG-PDF, continuous mode.
- **Steps:**
  1. Set zoom to 300%.
  2. Scroll through 15 pages.
  3. Read tab memory.
- **Expect:** With the 1000 px rootMargin, several ~70 MB canvases are live at once. Expect a large but survivable footprint; scrolling should remain usable.
- **Watch:** 15 rendered pages at 300%/DPR-2 is ~1 GB of canvas. If pages start rendering blank part-way through the scroll, the browser has hit its canvas memory ceiling — record which page number it starts at.

### PERF-032 - fitZoom on first narrow load costs one extra getPage
**P2** * Perf * `src/app.js:427 fitZoom()`, `src/app.js:437 fitZoomToWidth()`, `src/app.js:450 initPdf()`

- **Pre:** Fresh profile (no saved state), viewport ≤ 820 px wide.
- **Steps:**
  1. Load `/app` at phone width and read `#zoomVal` when the page appears.
- **Expect:** A one-time `fitZoom(1)` runs **before** the first render (`pendingMobileFit`), so the whole width of page 1 fits with a small gutter and the zoom label shows the fitted percentage, not "115%". It happens once — reload and confirm no second fit.
- **Watch:** `fitZoom` awaits `pdfDoc.getPage()` inside the 7-second boot race; on a slow phone plus BIG-PDF this extra page fetch can be what pushes boot over the limit.

### PERF-033 - Zoom in single-page mode re-renders exactly one page
**P1** * Perf * `src/app.js:3179 updateZoom()`

- **Pre:** BIG-PDF in single-page mode.
- **Steps:**
  1. Record a Performance trace and click `+` once.
- **Expect:** One `renderPage()` — one `getPage`, one canvas render, one `getTextContent`, one `renderTextLayer`. Under **~400 ms** for a normal page.
- **Watch:** A page with heavy vector art (a big plot, a map) can take seconds per render at 300%; note whether the UI blocks or stays responsive during it.

### PERF-034 - Reader stays usable while a very heavy page renders
**P1** * Perf * `src/app.js:473 renderPage()`

- **Pre:** A PDF containing at least one extremely complex vector page (a dense scatter plot or CAD drawing).
- **Steps:**
  1. Navigate to that page at 300%.
  2. While it renders, try to scroll, click a note, and open the find bar.
- **Expect:** PDF.js renders on the worker where possible, so the UI should not lock completely. Any freeze should be under **~1 s**.
- **Watch:** `setupWorker()` sets `workerSrc = ''` when the inlined `window.pdfjsWorker` is present, which makes PDF.js run the worker **on the main thread**. That is deliberate (CSP/offline), but it means a pathological page blocks everything. Record the worst freeze you can produce.

---

## 5. Notes at scale

### PERF-035 - Full notes-list rebuild time at 100 / 500 / 2000 notes
**P0** * Perf * `src/app.js:2084 render()`

- **Pre:** Import NOTES-500 (or build up notes) so one document holds ~500 notes.
- **Steps:**
  1. In the console, time a render: `const t=performance.now(); document.querySelector('.card').click(); requestAnimationFrame(()=>console.log(performance.now()-t));` — or simply record a Performance trace and click a note card.
  2. Repeat with ~100 notes and, if you can build it, ~2000.
- **Expect:** `render()` wipes `#notesList.innerHTML`, re-runs `renumber()` (a sort over all active-doc notes), rebuilds every card, then re-wires **fifteen** `$$([data-…])` handler passes over the list. Guidance: under **~50 ms** at 100 notes, under **~250 ms** at 500. Record the 2000 number.
- **Watch:** There is no virtualisation. Every interaction that touches state — selecting a note, toggling a tag, deleting a reply, an AI status tick — calls `render()` and pays the full cost.

### PERF-036 - Notes search re-renders on every keystroke with no debounce
**P0** * Perf * `src/app.js:3159 wire()`, `src/app.js:1689 passesFilter()`

- **Pre:** ~500 notes on the active document.
- **Steps:**
  1. Click `#btnNotesSearch` and type "transformer attention mechanism" at normal typing speed into the field placeheld "Search notes, answers, tags…".
- **Expect:** Results narrow as you type and the field never drops characters. Typing must stay under ~100 ms of lag per keystroke.
- **Watch:** The `input` handler calls `render()` directly — no debounce anywhere — and `passesFilter()` rebuilds a `hay` string by joining every message's text for every annotation on every keystroke. On 500 notes with long AI answers this is megabytes of string concatenation per character. Dropped/reordered characters or a visibly laggy caret is the **fail**.

### PERF-037 - Filter and sort switches at scale
**P1** * Perf * `src/app.js:2248 openFilterPopover()`, `src/app.js:2094 render()`

- **Pre:** ~500 notes with a mix of screenshots, AI replies and questions.
- **Steps:**
  1. Open `#btnFilter` and click through "All notes", "Unresolved", "Screenshots", "AI replies", "Questions" in quick succession.
  2. Toggle "By time" / "By page order".
- **Expect:** Each click re-renders the list and re-opens the popover with the new selection ticked; the footer count updates to e.g. "500 notes · Screenshots". Each switch under **~250 ms**.
- **Watch:** Each popover row re-calls `openFilterPopover()` after `render()`, so every click does a full list rebuild *plus* a popover teardown/rebuild. Watch for the popover flickering or drifting from its anchor button at large note counts.

### PERF-038 - Note count copy is correct at 0, 1 and many
**P1** * Copy * `src/app.js:2109 render()`

- **Pre:** A document with zero notes; then one; then many.
- **Steps:**
  1. Read `#notesCount` at each count, with the filter on "All notes" and then on "Questions".
- **Expect:** Exactly "0 notes", "1 note", "500 notes"; with a non-`all` filter the label appends " · " and the filter name, e.g. "500 notes · Questions". Note the count is of **all** notes on the document, not the filtered subset.
- **Watch:** A change that makes the number reflect the filtered list would silently contradict the appended filter label.

### PERF-039 - Empty-list copy for no notes, no filter matches and no search matches
**P2** * Copy * `src/app.js:2096-2098 render()`

- **Pre:** A document with no notes, and a document with notes but a non-matching search.
- **Steps:**
  1. On a note-free document read the empty state.
  2. On a populated document apply a filter that matches nothing.
  3. Search for `zzzqqq`.
- **Expect:** In order: "No notes yet." followed by "Select text or capture a figure in the document to create a source-linked note." on a second line; "No notes match this filter."; and "No notes match “zzzqqq”." with curly quotes around the query.
- **Watch:** The search message interpolates the query — paste 5 000 characters into the search box and confirm the empty-state box does not blow the panel layout out horizontally.

### PERF-040 - A single note with a very long AI answer
**P1** * Perf * `src/app.js:2039 mdRich()`, `src/app.js:1969 mdLite()`

- **Pre:** Provoke a long answer — ask "Read the full paper and give a detailed section-by-section summary with a table of every result" on BIG-PDF.
- **Steps:**
  1. Let the answer complete, then expand and collapse the note five times.
- **Expect:** `mdRich()` segments on fenced code, protects math, then runs `mdLite()` line-by-line. A 10 000-character answer with tables and lists should render in under **~100 ms** per expand.
- **Watch:** `mdLite` builds an array of HTML strings per line with no length guard. Combine a long answer with MathJax (PERF-042) and the expand can visibly hitch. Also confirm long code blocks and wide markdown tables scroll **inside** the card (`.msg .md-tablewrap{overflow-x:auto}`, `pre.code-block{overflow-x:auto}`) instead of widening the panel.

### PERF-041 - Deep thread: 50+ messages in one note
**P1** * Perf * `src/app.js:1901 annCard()`

- **Pre:** One note; send 50 follow-up replies to it (a mix of comments and AI answers).
- **Steps:**
  1. Expand the note and scroll its thread top to bottom.
  2. Type into the inline composer at the bottom while the card is huge.
- **Expect:** All 50 replies render inside one `.card`; the composer keeps focus and the caret position across the re-render that follows each send (`render()` preserves `draft.v`, `draft.focused` and `draft.caret`).
- **Watch:** Every reply re-runs `msgCard()` for all 50 messages plus `traceHTML()` for each AI answer. Watch for the draft-restore path losing the caret at the end of a long thread, and for `followNoteBottom()` yanking you away while you are reading mid-thread.

### PERF-042 - MathJax loads on demand and typesets on a 120 ms debounce
**P1** * Perf * `src/app.js:2051 ensureMathJax()`, `src/app.js:2078 scheduleTypeset()`

- **Pre:** Fresh reload. DevTools → Network filtered to `mathjax`.
- **Steps:**
  1. Load a document whose notes contain **no** math and interact for a minute.
  2. Then open a note containing an answer with `\(` or `\[` math.
- **Expect:** `tex-svg.min.js` (cdnjs, MathJax 3.2.2) is requested **only** at step 2 — `mathRoots()` gates on the literal presence of `\\(` or `\\[` in `#notesList.innerHTML`. After it loads, typesetting is debounced 120 ms and re-runs on later renders.
- **Watch:** With 500 notes, `mathRoots()` runs a regex over the **entire** notes-list `innerHTML` after every `render()` — including every keystroke of notes search (PERF-036). Measure that regex on a megabyte of HTML; it is a hidden per-keystroke cost. Also confirm `typesetClear` runs so repeated renders don't accumulate MathJax containers.

### PERF-043 - Agent trace bodies are scroll-capped, not page-length
**P2** * Visual * `src/styles.css:273`, `src/app.js:1939 traceHTML()`

- **Pre:** A note whose AI answer used several tools (ask a question that forces `read_full_document`).
- **Steps:**
  1. Expand "Show the agent's work · N tool calls".
  2. Scroll inside the longest tool Result block.
- **Expect:** Each `.tr-body` is capped at **max-height 220px** with its own scrollbar; the card does not become thousands of pixels tall. The header line reads "Tools called: " with each tool name in `<code>`, or "No tools were needed — answered directly from the context." when none ran.
- **Watch:** Tool results are stored at up to **6000 characters each** (`result.slice(0, 6000)`), so a 7-step run holds ~42 KB of transcript inside one message — see PERF-050 for the storage consequence.

### PERF-044 - Compact card previews stay clamped with very long content
**P2** * Visual * `src/app.js:1865 compactCard()`, `src/styles.css:510`

- **Pre:** A note whose first comment is a 5 000-character paste, and another note with "Show on card" ticked on a long AI answer.
- **Steps:**
  1. Collapse both notes and look at the list.
- **Expect:** The default preview uses `.msg.clamp` → **2-line** `-webkit-line-clamp`. A message explicitly ticked "Show on card" renders **in full** (`.cc-full{white-space:normal;overflow:visible}`) — that is intentional; a checked 5 000-character answer legitimately makes a very tall card.
- **Watch:** Tick "Show on card" on ten long answers in one document and confirm the list still scrolls smoothly — ten un-clamped full renders in a 384 px column is the worst realistic case.

### PERF-045 - Connector redraw during notes-panel scrolling
**P2** * Perf * `src/app.js:3175 wire()`, `src/app.js:1162 drawConnector()`

- **Pre:** ~500 notes, one selected with its pin visible in the reader.
- **Steps:**
  1. Flick-scroll the notes list up and down for 5 seconds while watching the FPS meter.
- **Expect:** A `requestAnimationFrame(drawConnector)` per scroll event; `drawConnector` does two `getBoundingClientRect()` calls plus one path rebuild and clips the anchor into the list's visible band. 60 fps throughout; the dashed line tracks the card and disappears when the card scrolls out of the list.
- **Watch:** `drawConnector` also runs on the reader's scroll listener and on window resize. If both panels scroll at once (a trackpad flick over the boundary), confirm frames do not double up.

---

## 6. Storage ceilings and write debounces

### PERF-046 - The 250 ms save debounce coalesces bursts
**P0** * Perf * `src/app.js:151-168 save()`

- **Pre:** Any document open. DevTools → Application → Local storage, watching `srw_state_v1`.
- **Steps:**
  1. Click ten different note cards as fast as you can.
  2. Watch how many times the stored value's size/timestamp changes.
- **Expect:** `clearTimeout(saveT)` + a fresh 250 ms timer means the burst results in **one** write, 250 ms after the last click.
- **Watch:** Instrument it: `const _s=localStorage.setItem.bind(localStorage); localStorage.setItem=(k,v)=>{console.log('LS write',v.length);return _s(k,v)}` before the burst. More than one write for a burst inside 250 ms is a regression.

### PERF-047 - Every save deep-clones the whole state including image data URLs
**P0** * Perf * `src/app.js:156 save()`

- **Pre:** The seeded sample document (12 notes carrying ~976 KB of base64 images in `screenshot` / `message.image`).
- **Steps:**
  1. Record a Performance trace.
  2. Click ten different note cards, pausing ~400 ms between each so each triggers its own save.
  3. Find the ten `save` timer callbacks in the trace.
- **Expect:** Each one runs `JSON.parse(JSON.stringify(state))` over the full state — including the ~1 MB of data URLs — then `idbPut`s each image **again**, then serialises the stripped copy to localStorage. Each save should be under **~30 ms** with the sample.
- **Watch:** The live `state` keeps the data URLs forever (only the throwaway `light` clone gets `'@idb'`), so **every single save re-writes every image to IndexedDB**. With 100 screenshot notes (~50 MB of base64) this makes clicking a note card a 50 MB IndexedDB write. Measure Application → IndexedDB → `srw_assets` write volume across ten clicks; a growing per-click write cost is the defect to report.

### PERF-048 - Persisted JSON stays small because images offload to IndexedDB
**P0** * State * `src/app.js:158-159 save()`, `src/app.js:144 rehydrateAssets()`

- **Pre:** Fresh profile; load `/app` and let the sample seed.
- **Steps:**
  1. Trigger a save (click a note), then in the console run `localStorage.getItem('srw_state_v1').length`.
  2. In Application → IndexedDB → `srw_assets` → `assets`, look at the keys.
- **Expect:** The localStorage value is roughly **120–140 KB**, not ~1.1 MB — every `data:` screenshot and message image has been replaced by the literal string `"@idb"` and stored under `shot:<annId>` / `img:<msgId>`. Reload and confirm the images come back (rehydrated) rather than showing as blank boxes.
- **Watch:** If images ever start persisting inline, one document with a handful of generated visuals blows the ~5 MB localStorage budget immediately. The `@idb` sentinel appearing **in the UI** as literal text is the other failure mode.

### PERF-049 - Reaching the localStorage ceiling shows the quota toast
**P0** * Edge * `src/app.js:163-166 save()`

- **Pre:** A document with many notes. To force the ceiling quickly, in the console run `localStorage.setItem('pad','x'.repeat(4_500_000))` to eat most of the origin quota, then make any change in the app (select a note).
- **Steps:**
  1. Make a change so `save()` runs.
  2. Watch for a toast.
- **Expect:** The red error toast reads exactly **"Storage limit reached — export your notes to keep them."** (em dash). It stays ~6 s. The app keeps working in memory; nothing crashes.
- **Watch:** The catch also swallows `SecurityError` (opaque-origin sandbox) with no message, by design. Confirm the quota branch actually matches — the test is `/quota|exceeded/i` against `e.name + e.message`, so a browser reporting only `NS_ERROR_DOM_QUOTA_REACHED` (Firefox) must still match on "QUOTA". Verify on Firefox specifically.

### PERF-050 - Estimate how many agent answers fit in localStorage
**P1** * Perf * `src/app.js:1471-1502 askAIAgent()`, `src/app.js:1486`

- **Pre:** A document, AI configured and working.
- **Steps:**
  1. Note `localStorage.getItem('srw_state_v1').length`.
  2. Ask five agent questions that each trigger 2–4 tool calls.
  3. Read the length again and divide the delta by five.
- **Expect:** Each AI answer persists its full trace: the context step (system + user, several KB) plus one entry per tool call with `result.slice(0, 6000)`. Guidance: **15–25 KB per agent answer**. That puts the practical ceiling around **200–300 AI answers per browser profile** before PERF-049 fires.
- **Watch:** A prompt-template change that lengthens the system prompt multiplies straight into per-answer storage, since the whole prompt is stored in `trace[0].text`. Record the per-answer number each release.

### PERF-051 - The 1.5 s folder-sync debounce
**P0** * Perf * `src/app.js:2450-2455 scheduleFolderSync()` * Chromium only

- **Pre:** Chrome or Edge. Settings → Storage → "Choose folder…" and grant a folder. Have that folder open in the OS file manager with the modified-time column visible.
- **Steps:**
  1. Type five separate replies into a note within ~4 seconds.
  2. Watch the `<doc>.notes.json` file's modified time.
- **Expect:** `save()` calls `scheduleFolderSync()`, which clears and restarts a **1500 ms** timer, so the file is written **once**, 1.5 s after the last change. The write is silent (no toast).
- **Watch:** Each write serialises the whole document's notes with `JSON.stringify(..., null, 2)` — pretty-printed, so roughly 1.3× the compact size. With 500 notes that is a multi-MB file rewritten every 1.5 s of activity; watch for the OS file manager or a Drive sync client thrashing.

### PERF-052 - Folder sync writes the full notes file, not a delta
**P1** * Perf * `src/app.js:2352 writeNotesToFolder()`, `src/app.js:2271 docNotesJSON()` * Chromium only

- **Pre:** Folder sync on, a document with 500 notes.
- **Steps:**
  1. Add one short comment.
  2. After 1.5 s, check the file size on disk.
- **Expect:** The whole file is rewritten via `createWritable()` → `write` → `close`. Record the size and the time from the change to the file settling; a multi-MB write should still complete in well under **1 s**.
- **Watch:** `docNotesJSON()` deep-clones every annotation (`JSON.parse(JSON.stringify(a))`) before serialising, so each sync is two full passes over the note corpus. Note also that images are **not** rehydrated here — offloaded screenshots persist to the folder as the literal `"@idb"` string, meaning the folder copy of a screenshot note has no image.

### PERF-053 - Storage meter reads navigator.storage.estimate, with a fallback
**P1** * Functional * `src/app.js:396 updateStorage()`

- **Pre:** Any state.
- **Steps:**
  1. Read `#storageText` and the width of `#storageBar` at the bottom of the sidebar on Chrome, Firefox and Safari.
  2. In the console run `await navigator.storage.estimate()` and compare.
- **Expect:** The text is `<usage> of <quota>` using the app's own formatter — GB with one decimal at ≥ 1 073 741 824 bytes, MB with no decimals at ≥ 1 048 576, otherwise KB rounded up to a minimum of 1 (e.g. "142 MB of 296 GB"). The bar is `usage/quota × 100` clamped to a 2% minimum. Where `navigator.storage.estimate` is missing the text falls back to `<n> documents`.
- **Watch:** The initial HTML says "Calculating…" — if `updateStorage()` throws, that string is left on screen forever. Also note Safari and Firefox report a **coarse, padded** quota; the number will not match Chrome's.

### PERF-054 - The storage meter is stale after adding notes
**P1** * State * `src/app.js:396 updateStorage()`

- **Pre:** Sidebar visible, storage figure noted.
- **Steps:**
  1. Add 20 screenshot notes (which each write ~100 KB to IndexedDB).
  2. Re-read `#storageText` without reloading.
  3. Reload and re-read.
- **Expect:** `updateStorage()` is called only from `boot()`, `openPdfFile()`, `importSharedHTML()` and `purgeDoc()` — **not** from `save()`. So the figure will not move until you open a document or reload; after reload it jumps.
- **Watch:** A user filling storage with screenshots sees a meter frozen near zero right up until the quota toast fires. Record whether this is still true.

### PERF-055 - IndexedDB write failures are silent
**P1** * Edge * `src/app.js:133 idbPut()`

- **Pre:** Chrome. In DevTools → Application → Storage, note the quota; fill most of it (store a large blob from the console) so further writes fail.
- **Steps:**
  1. Capture a screenshot note.
  2. Reload the page.
- **Expect:** Document what actually happens. `idbPut` has no `onerror` handling and no `await`, so a rejected write is dropped entirely; on reload `rehydrateAssets` gets `null` for `shot:<id>` and `safeImgSrc(null)` returns `''`.
- **Watch:** The note survives with an **empty `<img src="">`** — a broken-image box where the screenshot was, with no error message anywhere. Any silent data loss here should be filed even though the app "works".

### PERF-056 - Storage is never marked persistent
**P2** * Edge * `src/app.js:123 idbOpen()`

- **Pre:** Chrome, DevTools console.
- **Steps:**
  1. Run `await navigator.storage.persisted()`.
- **Expect:** `false` — the code never calls `navigator.storage.persist()`. All PDFs, notes and OCR results live in best-effort storage that the browser may evict under disk pressure, and that Safari's ITP clears after 7 days without interaction.
- **Watch:** Record this as a known limit. If a release starts claiming durability in the UI without calling `persist()`, that is a copy/behaviour mismatch worth escalating.

---

## 7. AI and agent caps

### PERF-057 - The agent loop stops at 7 iterations
**P0** * Edge * `src/app.js:1474 askAIAgent()`

- **Pre:** AI working (OpenRouter default), BIG-PDF open, a text selection made.
- **Steps:**
  1. Ask something that forces repeated tool use, e.g. "Read pages 1 through 20 one at a time and list the first sentence of each."
  2. Watch the status line in the note as it works.
- **Expect:** The status cycles "Thinking…" → "Gathering context…" and the per-tool labels ("Reading a page…", "Searching the document…", "Scanning the outline…", "Reading the full paper…", "Creating a visual…", "Searching the web…"), for **at most 7** model round-trips, then produces an answer.
- **Watch:** Count the tool-call entries in "Show the agent's work". More than 7 model steps means the cap was removed; fewer with no answer means it bailed early.

### PERF-058 - Exhausting all 7 iterations hits the broken final-synthesis call
**P0** * Edge * `src/app.js:1495-1499 askAIAgent()`, `src/app.js:1440 aiAgentStep()`

- **Pre:** As PERF-057, with a prompt that reliably keeps the model calling tools for all 7 turns (asking it to read many pages individually works well).
- **Steps:**
  1. Run the question and let the loop run out without producing text.
  2. Read the note.
- **Expect (intended):** A "Writing the answer…" status followed by a final answer, or at worst the fallback text "The document doesn’t seem to cover that — try selecting the relevant passage, or ask a more specific question."
- **Watch:** The rescue call is `aiAgentStep(model, messages.concat([...]), [])` but the signature is `aiAgentStep(provider, model, messages, tools)` — the model id is sent as `provider`, so `api/ai.js:86` rejects it with **400 "Unsupported provider."**. The note ends showing the red "⚠ Unsupported provider." and an error toast instead of an answer. Confirm whether this is still the behaviour; it is a real defect that only surfaces on long agent runs.

### PERF-059 - Tool results are truncated to 50 000 characters before going back to the model
**P0** * Edge * `src/app.js:1485 askAIAgent()`, `src/app.js:1434 runAgentTool()`

- **Pre:** BIG-PDF open, AI working.
- **Steps:**
  1. Ask "Summarise the entire document" so the agent calls `read_full_document`.
  2. Open "Show the agent's work" and inspect the `read_full_document` Result block.
- **Expect:** `read_full_document` accumulates page text and breaks once `out.length > 48000`, appending the literal marker **"[…truncated…]"**, then returns `out.slice(0, 50000)`. The message pushed back to the model is separately capped at `result.slice(0, 50000)`; the copy stored in the trace is capped at 6 000.
- **Watch:** On BIG-PDF the model sees roughly the **first 20 pages only**. If the answer confidently summarises the whole document, the provenance chip "Read full paper" is misleading — check that the answer does not claim coverage it never had.

### PERF-060 - read_page is capped at 4500 characters
**P1** * Edge * `src/app.js:1431 runAgentTool()`

- **Pre:** A document with at least one very dense page (a full page of small body text ≈ 5 000–7 000 characters).
- **Steps:**
  1. Ask "Read page N and quote its final sentence", where N is that dense page.
  2. Inspect the `read_page` Result in the trace.
- **Expect:** The result is `Page N:\n` plus at most **4500 characters** of page text, cut mid-sentence with no marker.
- **Watch:** With no truncation marker the model cannot tell it got a partial page, so it may answer confidently about content that was cut. The "quote the final sentence" phrasing exposes this cleanly.

### PERF-061 - search_document and document_outline caps
**P1** * Edge * `src/app.js:1388 agentSearch()`, `src/app.js:1399 agentOutline()`

- **Pre:** BIG-PDF open, AI working.
- **Steps:**
  1. Ask "Search the document for every mention of 'method'."
  2. Ask "Give me the outline of this paper."
  3. Inspect both Result blocks in the trace.
- **Expect:** `search_document` uses at most **6** distinct terms of 3+ characters, returns at most **8** page hits (one per page, ±90/+160 characters of context), and stops scanning as soon as it has 8. `document_outline` takes at most **3** headings per page and returns at most **40** lines total, or "No clear section headings detected."
- **Watch:** On a 300-page document the outline is capped at 40 lines, i.e. the first ~13 pages' headings — the model gets a truncated map of the paper with no indication it is partial. Watch also for `agentSearch` blocking the UI: it calls `ensureText()` page by page with no yield.

### PERF-062 - Direct (non-agent) answer context budget
**P1** * Perf * `src/app.js:1299 buildContext()`, `src/app.js:1327 retrievePassages()`

- **Pre:** A screenshot note (screenshots take the non-agent path), AI working.
- **Steps:**
  1. Ask a question on a screenshot note.
  2. Expand "Show the agent's work" → "Context sent to the model".
- **Expect:** Surrounding text is **450 characters before + 450 after** the selection, or the page's first **900** characters if the selection cannot be located. `retrievePassages` adds at most **3** cross-page snippets. The whole user message should be on the order of 2–4 KB.
- **Watch:** `retrievePassages` iterates `pageTextCache` — which after the boot pre-cache is **every page** — building lowercase copies of each page's text per question. On BIG-PDF that is a multi-MB string pass per question; time it.

### PERF-063 - Visual planner and diagram token budgets
**P1** * Perf * `src/app.js:1561 generateVisual()`, `src/app.js:1581`, `api/ai.js:13 capTokens()`

- **Pre:** AI working, "Enable generated visuals" on.
- **Steps:**
  1. Ask a note "draw a diagram of the architecture" and let it complete.
  2. Watch the status line.
- **Expect:** Statuses "Planning the visual…" then either "Generating image…" or "Drawing the diagram…". The planner call requests `maxTokens: 2600`, the diagram fallback `2200`; on a gpt-5/o-series model the server adds a **+4000** reasoning buffer and sends `max_completion_tokens` instead of `max_tokens`.
- **Watch:** The planner prompt demands the heavy field first "so it survives if the response is cut off", and `stripJson()` has a salvage path that regex-extracts `ascii` / `image_prompt` / `title` / `caption` / `takeaways` from a truncated response. Ask for a deliberately huge diagram ("a 40-row ASCII table of every result") and confirm you get either a valid diagram or the error "Could not render the diagram — please try again." — never raw JSON in the card.

### PERF-064 - Intent-router call is small and fast
**P1** * Perf * `src/app.js:1264 aiClassify()`, `src/app.js:1282 routeMessage()`

- **Pre:** AI working. DevTools → Network filtered to `/api/ai`.
- **Steps:**
  1. Type a bare comment such as "interesting" into a note and send.
  2. Inspect the request body.
- **Expect:** One `/api/ai` POST with `mode: 'text'`, `maxTokens: 220`, the router model (default `openai/gpt-5.4-mini`), the excerpt truncated to **300** characters and the prior thread to **500**. Round-trip should be **under ~2 s**; a plain comment then produces no answer at all.
- **Watch:** Every message pays this round-trip before anything happens, including personal notes. On a slow connection the note appears to hang. Confirm the fallback: block `/api/ai` in DevTools and send again — the keyword heuristic must take over immediately with no visible error.

### PERF-065 - The 60 s server abort and the platform timeout
**P0** * Edge * `api/ai.js:39-49 postJSON()`, `api/ai-image.js:19 post()`

- **Pre:** Deployed site (not a local file). AI configured with a slow model and a large context — ask a whole-document question on BIG-PDF.
- **Steps:**
  1. Send the request and time it in DevTools → Network.
  2. If it fails, read the error in the note and the toast.
- **Expect:** The proxy aborts an upstream call at **60 000 ms**. In practice Vercel's own function timeout usually fires first — `vercel.json` sets no `functions.maxDuration`, so the platform default applies and you get a **504** whose body is not JSON.
- **Watch:** The client does `try { j = await r.json(); } catch {}` then throws `AI request failed (504)` / `Agent step failed (504)`. `errHint()` has no branch for this, so the user sees a bare status-code string. Note the exact copy shown; an unexplained "(504)" in a red ⚠ box is poor but currently expected — flag if it regresses to a blank error.

### PERF-066 - Pending AI messages survive a reload and never resolve
**P0** * Edge * `src/app.js:1356-1357 askAI()`, `src/app.js:1805 msgCard()`

- **Pre:** AI working, a note ready to ask.
- **Steps:**
  1. Ask a question and, while the typing indicator shows, reload the page.
  2. Open the note.
- **Expect:** The message was persisted with `pending: true` (the `save()` at line 1357 runs before the answer arrives), so after reload the card shows the animated "Thinking" indicator forever with no way to retry.
- **Watch:** Same for `generated_visual` messages stuck at "Planning the visual…". Also check `state.ui.streamingId` — it is persisted too, so a reload mid-answer leaves the notes list in "follow the bottom" mode for a note that is not streaming. Deleting the reply is the only escape; confirm that still works.

### PERF-067 - Switching documents mid-answer does not cancel the request
**P1** * Edge * `src/app.js:203 switchDoc()`, `src/app.js:1458 askAIAgent()`

- **Pre:** Two documents in the library, AI working.
- **Steps:**
  1. Ask an agent question on document A.
  2. While it is "Gathering context…", switch to document B in the sidebar.
  3. Wait, then switch back to A.
- **Expect:** No client-side `AbortController` exists, so the loop keeps running against the **new** `pdfDoc` and `numPages` — tool calls like `read_page` and `read_full_document` will read document **B's** text. The answer eventually lands on A's note.
- **Watch:** An answer on document A that quotes document B is the failure to look for. Check the trace's tool Results for content from the wrong paper.

### PERF-068 - Rapid double-send is deduplicated for 5 seconds
**P1** * Edge * `src/app.js:1626 submitToNote()`

- **Pre:** A note open with its inline composer focused.
- **Steps:**
  1. Type "explain this" and press Enter twice in quick succession (or hammer the send arrow).
  2. Repeat the exact same text after waiting 6 seconds.
- **Expect:** The first burst produces exactly **one** comment — the guard rejects an identical `you`/`comment` message whose `created_at` is within **5000 ms**. After 6 seconds the same text is accepted as a genuine second message.
- **Watch:** The guard keys on exact text equality, so double-sending two *different* messages still fires two AI round-trips. Verify no duplicate AI answers appear from the fast double-Enter.

---

## 8. OCR runtime and caps

### PERF-069 - Scanned-PDF detection samples at most 8 pages
**P1** * Perf * `src/app.js:725 detectAndOfferOcr()`, `src/app.js:637 pageNeedsOcr()`

- **Pre:** SCAN-PDF (40+ image-only pages).
- **Steps:**
  1. Open SCAN-PDF and record a Performance trace covering the first ~5 seconds after it appears.
  2. Look for `getOperatorList` calls.
- **Expect:** Detection runs **1200 ms** after boot (or 500 ms after a `switchDoc`), samples at most **8** pages spaced `floor(N/8)` apart, and offers OCR when at least **half** the sampled pages both have ≤ 200 non-whitespace characters of text and ≥ **0.5** image coverage.
- **Watch:** `pageImageCoverage()` replays the whole content-stream transform stack per sampled page. On pages with huge operator lists (a scanned page with thousands of tiny images) this can block for seconds. Time the eight calls together; over ~2 s of blocked main thread is a regression.

### PERF-070 - OCR banner copy
**P1** * Copy * `src/app.js:741 showOcrBanner()`

- **Pre:** SCAN-PDF freshly opened.
- **Steps:**
  1. Read the banner across the top of the reader.
- **Expect:** Exactly "This looks like a **scanned PDF** — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?" with a "Run OCR" button and a "✕" dismiss button.
- **Watch:** `.top-banner .tb-msg` is `white-space:nowrap` with ellipsis and the banner is capped at `min(720px, 100vw - 32px)` — at phone width the sentence truncates. Confirm the "Run OCR" button is still reachable and not pushed off-screen.

### PERF-071 - The pre-OCR page scan runs over every page before OCR starts
**P0** * Perf * `src/app.js:771 runOcr()`

- **Pre:** SCAN-PDF with at least 40 pages.
- **Steps:**
  1. Click "Run OCR".
  2. Time how long the banner sits at "Loading the OCR engine…" before it changes.
- **Expect:** Before any page is OCR'd, the code loops `for (let n = 1; n <= total; n++)` calling `pageNeedsOcr(n)` — one `getTextContent` plus one full `getOperatorList` replay per page. On 40 pages expect **several seconds**; on a 300-page scan expect **a minute or more** with no progress feedback at all.
- **Watch:** The status only becomes "Reading text… **page 1 of N**" after this scan finishes. A user on a long scan sees a frozen "Loading the OCR engine…" and will assume it is broken. Record the wall-clock delay by page count.

### PERF-072 - OCR render resolution targets ~2000 px wide
**P1** * Perf * `src/app.js:710 ocrOnePage()`

- **Pre:** SCAN-PDF, OCR running.
- **Steps:**
  1. Pause on a page in the debugger inside `ocrOnePage` (or log `canvas.width`).
- **Expect:** `scale = Math.max(1.5, Math.min(4, 2000 / base.width))` — so a 612 pt-wide page renders at scale ~3.27 → ~2000 px wide; an already-huge page floors at 1.5×; a tiny page caps at 4×. Canvas is white-filled before rendering.
- **Watch:** A very wide page (a landscape A3 scan, ~1190 pt) gets `2000/1190 = 1.68` → about 2000 px, fine; but the 1.5 floor means a 3000 pt page renders at 4500 px, a 20 MP canvas. Confirm such a page does not blow the iOS canvas limit (see PERF-030).

### PERF-073 - Per-page OCR wall-clock and the progress counter
**P1** * Perf * `src/app.js:772-777 runOcr()`

- **Pre:** SCAN-PDF, first-ever OCR run on this profile (so the engine downloads).
- **Steps:**
  1. Run OCR and time the first page, then pages 2–10.
  2. Read the banner text as it works.
- **Expect:** The banner shows "Reading text… **page X of Y**" where Y is the count of pages that actually need OCR, not the page count. Guidance: **2–5 s per page** at ~2000 px on a modern laptop after the engine is warm; the first page additionally waits on the Tesseract download.
- **Watch:** The whole main thread is shared with rendering; scrolling during OCR should still work. Also confirm the counter counts *completed* pages correctly when some pages fail (the per-page `catch` still increments `done`).

### PERF-074 - First OCR run downloads the engine from CDN
**P1** * Perf * `src/app.js:680 ensureTesseract()`, `src/app.js:693 createTesseractWorker()`

- **Pre:** Fresh profile, DevTools → Network with no filter.
- **Steps:**
  1. Run OCR on SCAN-PDF and watch the network.
- **Expect:** Requests to `cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js`, `.../worker.min.js`, `cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1`, and the language data from `tessdata.projectnaptha.com/4.0.0`. Total is **tens of MB** (wasm core plus `eng.traineddata`).
- **Watch:** Throttle to Slow 3G and run OCR: the banner must not claim progress it is not making, and cancelling with "Stop" must still work while the engine downloads. Confirm the failure path shows the toast "OCR could not run: " followed by the error when the CDN is blocked.

### PERF-075 - OCR results are saved incrementally — and re-written in full each page
**P0** * Perf * `src/app.js:775 runOcr()`

- **Pre:** SCAN-PDF with 40+ pages, DevTools → Application → IndexedDB → `srw_assets`.
- **Steps:**
  1. Run OCR and let 10 pages complete.
  2. Reload the page mid-run and re-open the document.
- **Expect:** `idbPut('ocr:' + doc.sha, store)` runs after **every** page, so the 10 completed pages survive the reload — their text is selectable and searchable, and re-running OCR skips them (`if (store.pages[n]) continue`).
- **Watch:** The value written each time is the **entire accumulated store**, so page N re-serialises pages 1..N. That is O(N²) bytes written: a 200-page scan with ~40 KB per page record writes roughly **800 MB** cumulatively to finish an 8 MB store. Measure the IndexedDB write volume across a 40-page run and record it; this is a genuine scaling defect.

### PERF-076 - Cancelling OCR and switching documents mid-run
**P1** * Edge * `src/app.js:761 runOcr()`, `src/app.js:206 switchDoc()`

- **Pre:** SCAN-PDF OCR running past page 3, a second document in the library.
- **Steps:**
  1. Click "Stop" (the ✕ becomes "Stop") and read the banner.
  2. Start OCR again, then switch to the other document mid-run.
- **Expect:** Step 1 shows "Finishing current page…" and then the toast "OCR stopped — N pages done." (correct singular/plural). Step 2 sets `ocrCancel = true` via `switchDoc`, and the `active()` guard (`ocrStore === store`) prevents the leaving document's results from being written into the new document's store.
- **Watch:** Switch documents at the exact moment a page completes and confirm the new document does not gain a phantom OCR text layer. On completion the toast should read "OCR complete — N pages now searchable & highlightable."

---

## 9. Find and search at scale

### PERF-077 - Find scans every page and is debounced at 160 ms
**P0** * Perf * `src/app.js:2927 findBarEl()`, `src/app.js:2956 findRun()`

- **Pre:** BIG-PDF open, boot text pre-cache complete.
- **Steps:**
  1. Press Cmd/Ctrl+F and type "the" at normal speed.
  2. Watch `#findCount`.
- **Expect:** The `input` handler debounces **160 ms**; each run shows "Searching…" then either `N / M` or "No results". `findRun` loops all `numPages` calling `ensurePageText(i)` — instant from cache, slow on a cold cache.
- **Watch:** Type fast and confirm the stale-run guard (`if (findS.q !== q) return`) keeps an earlier, slower scan from overwriting the newer result. A count that flickers back to an old value is the regression.

### PERF-078 - Find on a cold text cache
**P1** * Perf * `src/app.js:2966 findRun()`

- **Pre:** BIG-PDF, reload and immediately press Cmd/Ctrl+F **before** the 1200 ms background pre-cache has finished.
- **Steps:**
  1. Search for a word that appears late in the document.
  2. Time from the last keystroke to the count appearing.
- **Expect:** Every uncached page triggers a `getTextContent()`; the search completes but may take **many seconds** on a 300-page document. The bar shows "Searching…" throughout.
- **Watch:** No cancellation exists — closing the find bar with Escape does not stop the in-flight scan. Confirm the app stays responsive and that no result lands after the bar has closed.

### PERF-079 - Highest match count: searching a single common letter
**P1** * Edge * `src/app.js:2964-2975 findRun()`, `src/app.js:2992 findMarkPage()`

- **Pre:** BIG-PDF.
- **Steps:**
  1. Search for `e`.
  2. Read the count and press Enter a few times.
- **Expect:** Tens of thousands of matches counted; the count reads `1 / 84213`-style. `findMarkPage` rewrites `innerHTML` for every text-layer span containing the query on the **current page only**, so marking stays bounded to one page.
- **Watch:** The `while` loops are `indexOf`-based and safe for an empty-ish query (the bar returns early on empty), but a one-character query on a dense page rewrites hundreds of spans. Time the mark pass; over ~300 ms per page navigation is a regression. Also confirm navigating away restores the spans (`clearFindMarks` resets `textContent`) so text selection still works afterwards.

### PERF-080 - Find navigation across pages waits a fixed 50 ms
**P2** * Perf * `src/app.js:2984 findGoto()`

- **Pre:** BIG-PDF, a query with matches spread across many pages.
- **Steps:**
  1. Hold Enter to walk through 30 matches quickly.
- **Expect:** Each hop renders/scrolls to the page, waits a hard-coded **50 ms**, then marks and scrolls the current match into view with `scrollIntoView({block:'center'})`.
- **Watch:** On a slow machine 50 ms is not enough for `renderInto` to finish, so `findMarkPage` finds no spans and the match is not highlighted — you land on the right page with nothing marked. Reproduce with CPU throttling at 6×.

### PERF-081 - Notes search versus document find are independent
**P2** * Regression * `src/app.js:3154 wire()`, `src/app.js:2937 openFind()`

- **Pre:** ~500 notes, BIG-PDF open.
- **Steps:**
  1. Open the notes search (`#btnNotesSearch`) and type a term.
  2. Without closing it, press Cmd/Ctrl+F and type a different term.
  3. Close each in turn.
- **Expect:** Both operate at once; Cmd/Ctrl+F only opens the document find bar when `numPages > 0`. Closing the notes search clears `state.ui.query` and re-renders the full list; Escape closes the find bar and clears its marks.
- **Watch:** With the notes search active, every document-find keystroke should **not** trigger a notes-list re-render. If the list rebuilds while you type in the find bar, the two search paths have been crossed.

---

## 10. Export, share and print

### PERF-082 - Self-contained HTML size formula and the sample baseline
**P0** * Perf * `src/app.js:2553 exportSelfContainedHTML()`, `src/app.js:2590`

- **Pre:** The sample document active, no extra notes added.
- **Steps:**
  1. Click "Share as HTML" in the left sidebar and complete the save.
  2. Read the toast and check the file size on disk.
- **Expect:** The toast reads "Saved &lt;name&gt;.annotated.html — 4.0 MB, opens anywhere." (one decimal, computed as `html.length / 1048576`). The fixed shell overhead alone is **~2.0 MB** (`pdf.worker.b64.js` ~1.45 MB + `pdf.min.js` ~320 KB + `app.js` ~234 KB + `styles.css` ~47 KB + `app.html` ~11 KB); the PDF adds its bytes × ~1.37 as base64, and the notes add their JSON with images re-inlined.
- **Watch:** The toast reports the **character** length, not the byte length — for pure-ASCII output they match, so a divergence between the toast figure and the on-disk size means non-ASCII crept into the bundle. Also confirm the filename is `<doc name minus .pdf, sanitised>.annotated.html`.

### PERF-083 - Export size and build time for a large PDF
**P0** * Perf * `src/app.js:2560-2571 exportSelfContainedHTML()`

- **Pre:** BIG-PDF (say 40 MB) active with a handful of notes.
- **Steps:**
  1. Click "Share as HTML" and time from the toast "Building shareable file…" to the save dialog appearing.
  2. Watch tab memory in the browser task manager during the build.
- **Expect:** Size ≈ 2.0 MB + (40 MB × 1.37) + notes ≈ **~57 MB**. Build should complete; guidance is under **~20 s** for 40 MB.
- **Watch:** The build holds several full copies of a ~57 MB string simultaneously — the base64 from `bytesToB64`, `JSON.stringify(bundle)`, the `.replace(/</g,'\\u003c')` output, and five successive `html.replace()` passes. Expect a memory spike of several hundred MB. A tab crash here is a **fail**; if it survives, record the peak so the practical PDF-size ceiling for sharing is known.

### PERF-084 - Rapid double-click on Share as HTML
**P1** * Edge * `src/app.js:2553 exportSelfContainedHTML()`, `src/app.js:2503 saveAsFile()` * Chromium only

- **Pre:** Chrome/Edge, sample document active.
- **Steps:**
  1. Double-click "Share as HTML" fast.
  2. Deal with whatever dialogs appear.
- **Expect:** There is no re-entrancy guard — two builds start and two "Building shareable file…" toasts appear. The first `showSaveFilePicker` opens; the second is rejected by the browser (only one file picker at a time). Because that rejection is **not** an `AbortError`, `saveAsFile` returns `'fallback'` and the second export **silently downloads** a duplicate copy to the Downloads folder.
- **Watch:** The user ends up with the file they chose *plus* an unexpected download. Confirm that is still what happens; a thrown, unhandled error instead would be worse.

### PERF-085 - Cancelling the Save As dialog exports nothing
**P0** * Edge * `src/app.js:2512 saveAsFile()`, `src/app.js:2594` * Chromium only

- **Pre:** Chrome/Edge.
- **Steps:**
  1. Click "Share as HTML", wait for the OS dialog, press Escape.
  2. Repeat with the notes Save button (`#btnSaveNotes`).
- **Expect:** `AbortError` → `status: 'cancelled'` → the function returns immediately. **No** file is written, **no** fallback download happens, and no toast appears.
- **Watch:** A cancelled dialog that still drops a file in Downloads is the regression. Note the whole ~57 MB string was already built before the dialog opened — cancelling wastes the build but must not leak it.

### PERF-086 - Non-Chromium browsers fall back to a download plus a one-time tip
**P1** * Functional * `src/app.js:2460 maybeShowSaveAsTip()`, `src/app.js:2504` * Firefox/Safari only

- **Pre:** Firefox or Safari, `localStorage.removeItem('srw_saveas_tip')` run first.
- **Steps:**
  1. Click "Share as HTML".
  2. Dismiss the modal, then click "Share as HTML" again.
- **Expect:** Because `showSaveFilePicker` is absent, a modal headed "Choose where your files save" appears once, naming the browser ("In **Firefox**…" / "In **Safari**…") with numbered steps and the setting box ("Always ask you where to save files" for Firefox, "Ask for each download" for Safari). The file then downloads and a toast reads "Exported &lt;name&gt; — X.X MB, opens anywhere." The second click shows **no** modal.
- **Watch:** The tip is gated on `localStorage`, so in a private window it can reappear each visit. Also confirm a 57 MB blob download actually completes in Safari — large `Blob` + `URL.createObjectURL` downloads are the weak spot; the URL is revoked after 4 s.

### PERF-087 - Export-to-PDF sheet with hundreds of notes
**P1** * Perf * `src/app.js:2881 buildSheet()`, `src/app.js:2876 openExport()`

- **Pre:** ~500 notes on the active document.
- **Steps:**
  1. Click the PDF button in the notes header ("Export annotations to PDF").
  2. Time the preview sheet appearing; toggle "Screenshots" off and on.
  3. Click "⭳ Export PDF" to trigger `window.print()`.
- **Expect:** The preview builds one `.ex-item` per included note in a single `innerHTML` assignment, then calls `scheduleTypeset()`. Guidance: under **~2 s** for 500 notes. The print dialog opens with the print stylesheet applied (`@media print` at `src/styles.css:431`).
- **Watch:** Every include-toggle rebuilds the entire sheet **and** re-typesets all math. With 500 notes containing math, toggling a checkbox can hang for seconds. Also confirm the browser can actually paginate a several-hundred-page print job without running out of memory.

### PERF-088 - Notes JSON export size and time
**P1** * Perf * `src/app.js:2607 saveNotesNow()`, `src/app.js:2271 docNotesJSON()`

- **Pre:** ~500 notes including 20 screenshots.
- **Steps:**
  1. Click the Save button (`#btnSaveNotes`) and save the file.
  2. Check its size on disk.
- **Expect:** Pretty-printed JSON (`null, 2`), so roughly 1.3× compact. Screenshots stored as `"@idb"` are **not** re-inlined by this path (only `notesJSONForExport` does that, for the HTML share), so the JSON stays text-sized — expect **1–4 MB** for 500 richly-traced notes, not tens of MB.
- **Watch:** That means a `.notes.json` saved from a profile where images were offloaded carries the literal `"@idb"` and re-importing it elsewhere produces notes with missing screenshots. Verify the round-trip: save, clear all notes, re-import, and check whether screenshot thumbnails survive.

### PERF-089 - Self-contained export re-inlines images
**P1** * Functional * `src/app.js:2540 notesJSONForExport()`

- **Pre:** The sample document (its notes hold ~976 KB of offloaded images) — reload first so the images are in the `@idb` state.
- **Steps:**
  1. Share as HTML, then open the resulting file directly from disk.
  2. Find the screenshot note and the generated-visual note.
- **Expect:** Both images display. `notesJSONForExport` awaits `idbGet('shot:'+a.id)` and `idbGet('img:'+m.id)` for every `@idb` value before bundling, so the exported file is genuinely standalone.
- **Watch:** This is a sequential `await` per image — 100 image notes means 100 serial IndexedDB reads inside the build. Time it and compare against PERF-083's total. Any image that reads back `null` is silently bundled as `null` and renders as an empty box in the shared file.

---

## 11. Import and bundle DoS caps

### PERF-090 - Annotation count is capped at 50 000 on import
**P1** * Edge * `src/app.js:2314 sanitizeImportedNotes()`

- **Pre:** Build a `.notes.json` containing 60 000 minimal annotation objects with unique `id` values (a small script over an exported file works).
- **Steps:**
  1. Import it with the Import button (`#btnImportNotes`).
  2. Read the toast and the footer count.
- **Expect:** Exactly **50 000** annotations are kept (`.slice(0, 50000)`); the toast reads "50000 notes imported." Everything past 50 000 is dropped with no warning.
- **Watch:** The app then has to `renumber()` (sort 50 000) and `render()` (build 50 000 cards) with no virtualisation. Record what actually happens — a multi-minute freeze or an unresponsive-page dialog. Confirm the tab recovers; a crash is a **fail**.

### PERF-091 - Per-annotation and per-message array caps
**P1** * Edge * `src/app.js:2298-2311`

- **Pre:** Craft a notes JSON where one annotation has 6 000 `rects`, 4 000 `messages`, and one message has 600 `trace` steps, 300 `takeaways` and 100 `chips`.
- **Steps:**
  1. Import it and inspect the resulting state in the console.
- **Expect:** Truncation to exactly **5000** rects, **3000** messages, **500** trace steps, **200** takeaways, **60** chips. Nothing else about the objects is rebuilt or dropped (`edited` flags, errors, captions, long text all survive).
- **Watch:** 5 000 rects on one annotation still means 5 000 `.hl-rect` divs drawn per rendered page in `drawHighlights()`. Confirm the reader survives selecting that note.

### PERF-092 - Text fields are capped at 2 MB each
**P1** * Edge * `src/app.js:2291 IMP_TEXT_CAP`, `src/app.js:2290 impCap()`

- **Pre:** A notes JSON with a message whose `text` is 3 000 000 characters and another whose `text` is exactly 2 000 000.
- **Steps:**
  1. Import it, then expand the note.
- **Expect:** The 3 MB field is truncated to exactly **2 000 000** characters; the 2 MB field passes through untouched. The same cap applies to `ascii`, `title`, `approximation_note`, `selected_text`, `section`, `prefix`, `suffix`, `caption`, and to each trace step's `text` and `result`.
- **Watch:** A 2 MB message is legal and gets pushed through `mdRich()` → `protectMath()` → `mdLite()` line-by-line on every `render()`. Time the expand; expect a multi-second freeze. Record it — the cap prevents unbounded growth but not a hostile-sized single field.

### PERF-093 - Importing a very large shared HTML bundle
**P1** * Edge * `src/app.js:279 importSharedHTML()`

- **Pre:** The ~57 MB `.annotated.html` produced in PERF-083.
- **Steps:**
  1. Drag it onto the reader (or open it via "Open PDF or bundle").
  2. Time to the toast and watch memory.
- **Expect:** `await f.text()` loads the whole 57 MB into a string, `indexOf` locates the marker, `JSON.parse` builds the bundle object, `b64ToBytes` allocates the PDF again — several copies live at once. It should still open and toast "Opened &lt;name&gt; — N notes loaded. Keep annotating."
- **Watch:** Peak memory during this import; a tab crash on a file the app itself produced is a **fail**. Also confirm content-addressed dedupe fires when the same paper is already in the library (no duplicate row in the sidebar).

### PERF-094 - Opening many files in one gesture
**P1** * Perf * `src/app.js:255 openFiles()`

- **Pre:** 15 distinct PDFs plus 5 `.notes.json` sidecars in one folder.
- **Steps:**
  1. Select all 20 in the file picker and open them at once.
- **Expect:** HTML bundles first, then PDFs, then notes — each processed **sequentially** with `await`. Each PDF triggers its own `switchDoc` (which resets `pageTextCache`, renders, and schedules a 500 ms full-document text pre-cache), so the reader visibly flips through all 15 documents and lands on the last. One toast per file.
- **Watch:** 15 stacked toasts and 15 overlapping background pre-cache loops. Time the whole thing and confirm the app is still responsive at the end; also confirm the sidebar shows exactly 15 new rows with no duplicates.

### PERF-095 - Import ids are constrained and regenerated
**P2** * Security * `src/app.js:2288-2289`

- **Pre:** A notes JSON where one annotation `id` is 200 characters long and another contains `"` and `<`.
- **Steps:**
  1. Import and inspect the resulting ids in the console.
- **Expect:** `IMP_ID = /^[A-Za-z0-9_-]{1,80}$/` — anything longer than 80 characters or containing other characters is replaced by a fresh `uid('ann')` / `uid('m')` / `uid('thr')`. Notes still render and are selectable.
- **Watch:** Merge-by-id (`applyNotesJSON` with `{merge:true}`) keys on the id, so regenerated ids turn an update into a duplicate. Import the same tampered file twice and confirm you get duplicates rather than a silent overwrite — and that the duplication is bounded, not exponential.

---

## 12. Network, offline and external dependencies

### PERF-096 - The app works fully offline except AI and OCR
**P0** * Edge * `src/app.js:410 setupWorker()`, `src/app.js:1594 errHint()`

- **Pre:** Load `/app` once so everything is cached, then set DevTools → Network to "Offline".
- **Steps:**
  1. Reload and read the sample; scroll, zoom, highlight, capture a screenshot, save notes.
  2. Ask the AI a question.
- **Expect:** PDF.js uses the inlined `window.pdfjsWorker` (`workerSrc = ''`) so rendering works with **zero** network. Notes, highlights, screenshots, export and import all work. The AI call fails and the toast reads the `errHint` text: "Could not reach the AI endpoint (/api/ai). This works on the deployed site; when opening the file locally without the server, add a key in Settings or run it via the deployment."
- **Watch:** Confirm no request is made to `cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174` — that CDN fallback should never fire when the worker is inlined.

### PERF-097 - The Google Fonts stylesheet is render-blocking
**P1** * Perf * `app.html:9-10`

- **Pre:** DevTools → Network throttled to "Slow 3G", cache disabled.
- **Steps:**
  1. Load `/app` and watch when text becomes visible.
  2. Repeat with `fonts.googleapis.com` blocked (Network → block request domain).
- **Expect:** The Inter stylesheet is an external `<link rel="stylesheet">` — a render-blocking request to a third-party origin on every load. When blocked, the app must still render in the fallback stack (`-apple-system`, "Segoe UI", Roboto…) with no layout collapse.
- **Watch:** Measure how much later FCP is with the font link versus without it. Also check the app is fully usable on a corporate network that blocks Google Fonts — that is the realistic failure.

### PERF-098 - Slow network during an AI answer
**P1** * Edge * `src/app.js:1476 askAIAgent()`, `src/app.js:2143-2149 render()`

- **Pre:** AI working. Throttle to "Slow 3G".
- **Steps:**
  1. Ask an agent question and watch the note as each step resolves.
  2. Scroll up in the notes list while it works.
- **Expect:** The status line updates between steps; because `state.ui.streamingId` is set, the list follows the newest content **only if you were already within 40 px of the bottom** — scrolling up must stop the auto-follow so you can read.
- **Watch:** Every status change calls `save()` **and** `render()`. On a 500-note document a 7-step agent run means ~15 full list rebuilds plus 15 debounced state saves. Time one of those renders under load; the UI freezing between steps is the regression.

### PERF-099 - MathJax CDN failure degrades gracefully
**P2** * Edge * `src/app.js:2060-2064 ensureMathJax()`

- **Pre:** Block `cdnjs.cloudflare.com` in DevTools, then open a note containing LaTeX math.
- **Steps:**
  1. Expand the note and read the answer.
- **Expect:** The script's `onerror` resets `__mjLoading` and nothing else happens — the math shows as raw `\( … \)` / `\[ … \]` text inside the answer. No console exception, no broken layout, no repeated retry storm.
- **Watch:** `scheduleTypeset()` runs after every render and calls `ensureMathJax()` again — confirm it does not queue a new `<script>` on every keystroke of notes search when the CDN is unreachable.

### PERF-100 - Analytics is deferred and absent from shared files
**P2** * Perf * `app.html:135-136`, `src/app.js:2586-2587 exportSelfContainedHTML()`

- **Pre:** DevTools → Network.
- **Steps:**
  1. Load `/app` and look for `_vercel/insights/script.js`.
  2. Export a self-contained HTML, open it from disk, and check the network panel.
- **Expect:** On `/app` the insights script is `defer`red so it never blocks first paint. In the exported file **both** the `window.va` shim and the insights `<script defer>` tag have been stripped — a shared annotated paper must make **zero** outbound requests.
- **Watch:** Open the exported file with the network panel open and confirm literally no request leaves the page (no fonts, no analytics, no CDN). Any request at all is a privacy regression in a file users email to colleagues.

---

## Coverage map
| Code or element | Checks |
|---|---|
| `save()` src/app.js:151-168 | PERF-046, PERF-047, PERF-048, PERF-049, PERF-050 |
| `rehydrateAssets()` src/app.js:144 | PERF-004, PERF-048 |
| `idbPut()` / `idbGet()` src/app.js:133-142 | PERF-047, PERF-055, PERF-075, PERF-089 |
| `updateStorage()` src/app.js:396 | PERF-053, PERF-054 |
| `idbOpen()` src/app.js:123 | PERF-056 |
| `loadDocBytes()` src/app.js:196-202 | PERF-012, PERF-013 |
| `switchDoc()` src/app.js:203-218 | PERF-012, PERF-067, PERF-069, PERF-076 |
| `openPdfFile()` src/app.js:219-250 | PERF-008, PERF-009 |
| `openFiles()` src/app.js:255-275 | PERF-094 |
| `importSharedHTML()` src/app.js:279-308 | PERF-093 |
| `renderTree()` src/app.js:368-395 | PERF-014, PERF-015 |
| `setupWorker()` src/app.js:410-423 | PERF-034, PERF-096 |
| `fitZoom()` / `fitZoomToWidth()` src/app.js:427-444 | PERF-028, PERF-032 |
| `initPdf()` src/app.js:445-454 | PERF-005, PERF-008, PERF-010 |
| `renderPage()` src/app.js:456-491 | PERF-016, PERF-030, PERF-033, PERF-034 |
| `outputScale` src/app.js:172 | PERF-029, PERF-030, PERF-031 |
| `renderInto()` src/app.js:500-518 | PERF-011, PERF-019, PERF-020 |
| `buildContinuous()` src/app.js:519-536 | PERF-010, PERF-011, PERF-018, PERF-019, PERF-023, PERF-024 |
| `teardownContinuous()` src/app.js:537-540 | PERF-025 |
| `currentContinuousPage()` src/app.js:566-571 | PERF-022 |
| `gotoPage()` src/app.js:579-583 | PERF-016, PERF-017 |
| `ensurePageText()` src/app.js:586-595 | PERF-006, PERF-077, PERF-078 |
| `pageImageCoverage()` / `pageNeedsOcr()` src/app.js:615-641 | PERF-069, PERF-071 |
| `ocrOnePage()` src/app.js:707-723 | PERF-072, PERF-073 |
| `detectAndOfferOcr()` src/app.js:725-734 | PERF-069 |
| `showOcrBanner()` src/app.js:741-752 | PERF-070 |
| `runOcr()` src/app.js:753-794 | PERF-071, PERF-073, PERF-075, PERF-076 |
| `ensureTesseract()` src/app.js:680-699 | PERF-074 |
| `initPinch()` src/app.js:990-1045 | PERF-026, PERF-028 |
| `pageWrappers()` / `drawHighlights()` / `drawPins()` src/app.js:1094-1129 | PERF-021, PERF-091 |
| `drawConnector()` src/app.js:1162-1183 | PERF-022, PERF-045 |
| `buildContext()` src/app.js:1299-1326 | PERF-062 |
| `retrievePassages()` src/app.js:1327-1339 | PERF-062 |
| `askAI()` src/app.js:1351-1385 | PERF-062, PERF-066 |
| `agentSearch()` / `agentOutline()` src/app.js:1388-1406 | PERF-061 |
| `runAgentTool()` src/app.js:1428-1439 | PERF-059, PERF-060, PERF-061 |
| `aiAgentStep()` src/app.js:1440-1446 | PERF-058, PERF-065 |
| `askAIAgent()` src/app.js:1458-1510 | PERF-057, PERF-058, PERF-059, PERF-067, PERF-098 |
| `generateVisual()` src/app.js:1535-1593 | PERF-063, PERF-066 |
| `aiClassify()` / `routeMessage()` src/app.js:1264-1294 | PERF-064 |
| `submitToNote()` src/app.js:1622-1634 | PERF-068 |
| `mdRich()` / `mdLite()` src/app.js:1969-2039 | PERF-040, PERF-092 |
| `ensureMathJax()` / `scheduleTypeset()` src/app.js:2051-2082 | PERF-042, PERF-087, PERF-099 |
| `render()` src/app.js:2084-2157 | PERF-035, PERF-036, PERF-038, PERF-039, PERF-041, PERF-098 |
| `passesFilter()` src/app.js:1689-1707 | PERF-036, PERF-037 |
| `compactCard()` / `annCard()` src/app.js:1865-1937 | PERF-041, PERF-044 |
| `traceHTML()` src/app.js:1939-1957 | PERF-043 |
| `openFilterPopover()` src/app.js:2248-2258 | PERF-037 |
| `sanitizeImportedMessage/Annotation/Notes` src/app.js:2288-2314 | PERF-090, PERF-091, PERF-092, PERF-095 |
| `applyNotesJSON()` src/app.js:2316-2331 | PERF-090, PERF-095 |
| `writeNotesToFolder()` src/app.js:2352-2360 | PERF-052 |
| `scheduleFolderSync()` src/app.js:2450-2455 | PERF-051 |
| `maybeShowSaveAsTip()` src/app.js:2460-2496 | PERF-086 |
| `saveAsFile()` src/app.js:2503-2523 | PERF-084, PERF-085, PERF-086 |
| `notesJSONForExport()` src/app.js:2540-2547 | PERF-089 |
| `exportSelfContainedHTML()` src/app.js:2553-2601 | PERF-082, PERF-083, PERF-084, PERF-100 |
| `saveNotesNow()` / `docNotesJSON()` src/app.js:2271, 2607 | PERF-088 |
| `openExport()` / `buildSheet()` src/app.js:2846-2906 | PERF-087 |
| `findRun()` / `findGoto()` / `findMarkPage()` src/app.js:2956-3006 | PERF-077, PERF-078, PERF-079, PERF-080, PERF-081 |
| `wire()` scroll + search listeners src/app.js:3154-3176 | PERF-022, PERF-036, PERF-045, PERF-081 |
| `updateZoom()` src/app.js:3179 | PERF-023, PERF-024, PERF-033 |
| `boot()` src/app.js:3303-3353 | PERF-002, PERF-004, PERF-005, PERF-006, PERF-007 |
| `app.html:130-136` bundled script tags | PERF-001, PERF-003, PERF-007, PERF-097, PERF-100 |
| `src/styles.css:273, 431, 510, 658` | PERF-043, PERF-044, PERF-070, PERF-087 |
| `postJSON()` / `capTokens()` api/ai.js:13, 39-49 | PERF-063, PERF-065 |
| `post()` api/ai-image.js:19-27 | PERF-065 |
| `handler()` provider guard api/ai.js:86 | PERF-058 |

## Deliberately not covered here
- Landing-page asset weight, hero animations and above-the-fold rendering of `index.html` (338 KB) - covered in **01 landing page**.
- Features-page layout and content - covered in **02 features page**.
- Library CRUD behaviour, star/trash/restore semantics and sidebar layout correctness - covered in **03 app shell and library**; only their cost at 50+ documents is tested here.
- Whether a document opens, dedupes by SHA-256, or attaches its notes correctly - covered in **04 document lifecycle**; only timing, memory and file-size limits are tested here.
- Page navigation correctness, continuous-vs-single mode semantics and pinch gesture behaviour - covered in **05 reader and navigation**; only render cost, canvas ceilings and memory growth are tested here.
- Highlight anchoring accuracy, screenshot capture geometry and comment placement - covered in **06 annotation tools**; only their per-frame redraw cost at scale is tested here.
- Note card layout, threading, tags, filters and "Show on card" behaviour - covered in **07 notes panel**; only list-rebuild cost and clamping under load are tested here.
- AI answer quality, routing decisions, provenance chip correctness, prompt templates and provider/key handling - covered in **08 AI and agent**; only iteration caps, truncation limits, token budgets and timeouts are tested here.
- OCR accuracy, text-layer anchoring and the selectability of OCR'd words - covered in **09 OCR**; only detection sampling, runtime, resolution and write volume are tested here.
- Whether state survives a reload, migration of older saved state and folder-sync correctness - covered in **10 storage and persistence**; only quotas, ceilings and debounce timing are tested here.
- Correctness and fidelity of the shared HTML, notes JSON round-trip and PDF export content - covered in **11 share and export**; only build time, byte size, memory spikes and cancellation are tested here.
- Keyboard access, focus order, screen-reader semantics and contrast - covered in the accessibility document.
- Server-side SSRF hardening, the `COMPAT_HOSTS` allowlist, key handling and the quota-message policy in `api/ai.js` - covered in the security document; only the 60 s abort and platform timeout are tested here.
