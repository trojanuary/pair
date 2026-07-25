# 09 - On-device OCR for scanned PDFs

> Manual QA for the whole scanned-PDF path: how PairedX decides a document is image-only, the banner it offers, the Tesseract.js engine it pulls on demand, per-page recognition, the transparent text layer it rebuilds from word boxes, progress/cancellation, the IndexedDB cache keyed by document SHA, and how all of that feeds find, highlighting, anchoring and the AI.

| | |
|---|---|
| **ID prefix** | OCR |
| **Scope** | `pageImageCoverage` / `pageNeedsOcr` detection, `detectAndOfferOcr` sampling, `#ocrBanner` copy + controls + `restackBanners` stacking, `ensureTesseract` CDN load, `createTesseractWorker`, `ocrOnePage` canvas rendering, `ocrCollectWords` normalisation, `buildOcrTextLayer` / `applyOcrLayer` / `applyOcrToRendered`, `runOcr` progress + Stop + toasts, `loadOcrStore` + `idbPut('ocr:<sha>')` caching, cancellation on `switchDoc`, and the downstream effect on `ensurePageText`, the find bar, highlight anchoring and the AI agent tools |
| **Primary code** | `src/app.js:597-794` (the whole OCR block), `src/app.js:586-595` (`ensurePageText`), `src/app.js:203-218` (`switchDoc`), `src/app.js:482`, `src/app.js:514` (render paths), `src/app.js:3333`, `src/app.js:3352` (`boot`), `src/app.js:123-143` (IndexedDB helpers), `src/styles.css:657-670` (`.top-banner`), `src/styles.css:121-128` (`.textLayer`) |
| **Checks** | 124 |

## Contents
- [1. Detection of image-only PDFs](#1-detection-of-image-only-pdfs) - 14 checks
- [2. The OCR offer banner](#2-the-ocr-offer-banner) - 15 checks
- [3. Tesseract engine load](#3-tesseract-engine-load) - 10 checks
- [4. Running OCR: progress and per-page recognition](#4-running-ocr-progress-and-per-page-recognition) - 14 checks
- [5. The rebuilt text layer](#5-the-rebuilt-text-layer) - 13 checks
- [6. Stopping, switching documents and interruption](#6-stopping-switching-documents-and-interruption) - 12 checks
- [7. Caching by document SHA](#7-caching-by-document-sha) - 12 checks
- [8. Find, highlighting and anchoring on OCR pages](#8-find-highlighting-and-anchoring-on-ocr-pages) - 14 checks
- [9. The AI on OCR pages](#9-the-ai-on-ocr-pages) - 7 checks
- [10. Privacy, offline and failure modes](#10-privacy-offline-and-failure-modes) - 8 checks
- [11. Edge cases, performance and regressions](#11-edge-cases-performance-and-regressions) - 5 checks

### Fixtures used throughout

Keep these in `qa-fixtures/` (see `00-test-plan.md` §5). Every check below names the one it needs.

| Name | What it is |
|---|---|
| **SCAN-A** | A genuinely image-only English scan, 8–15 pages. Every page is one full-page raster; PDF.js returns no text. |
| **SCAN-STAMP** | A scan whose pages additionally carry a *real text* watermark / stamp / page number (well under 200 characters of real text per page). |
| **SCAN-MIX** | 10 pages: pages 1–3 are ordinary text, pages 4–10 are scans. |
| **SCAN-BIG** | 100+ page scan, >20 MB. |
| **SCAN-NONEN** | A scan in a non-Latin or non-English language (Chinese, Arabic, or heavily accented French). |
| **SCAN-BLANK** | A scan that includes at least one effectively blank page (a scanned separator sheet). |
| **VECTOR** | A text-free PDF built only from vector drawings (charts / CAD lines), no raster images at all. |
| **TEXT-A** | An ordinary 5–15 page text PDF. |

The bundled sample **"BERT — Devlin et al. 2019 (NAACL).pdf"** (`src/app.js:38`) is a normal text PDF and must never trigger OCR.

**Where to look in DevTools:** IndexedDB database `srw_assets` → object store `assets` → keys beginning `ocr:` (`src/app.js:126`, `src/app.js:775`). App state lives in `localStorage["srw_state_v1"]` (`src/app.js:37`).

---

## 1. Detection of image-only PDFs

### OCR-001 - A scanned PDF is detected and offered OCR on open
**P0** * Functional * `src/app.js:725 detectAndOfferOcr()`, `src/app.js:217 switchDoc()`

- **Pre:** Fresh QA profile. App open on the sample.
- **Steps:**
  1. Open **SCAN-A** via **"New"** (or drag it onto the reader).
  2. Wait until the first page paints, then wait a further ~2 seconds.
- **Expect:** A dark banner slides down from the top of the window carrying the exact message **"This looks like a scanned PDF — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?"** with **"scanned PDF"** in bold, a blue **"Run OCR"** button and a **"✕"** dismiss button.
- **Watch:** Detection is fired from a `setTimeout(..., 500)` after `switchDoc` (`src/app.js:217`). If someone moves it before `initPdf` resolves, `pdfDoc` is still the previous document and the banner never appears (or appears for the wrong file).

### OCR-002 - A normal text PDF is never offered OCR
**P0** * Functional * `src/app.js:637 pageNeedsOcr()`

- **Pre:** Fresh QA profile.
- **Steps:**
  1. Load the app on the bundled sample; wait 5 seconds.
  2. Open **TEXT-A**; wait 5 seconds.
- **Expect:** No `#ocrBanner` ever appears for either document. Confirm in the Elements panel that `document.getElementById('ocrBanner')` is `null`.
- **Watch:** The `>200` non-whitespace character threshold at `src/app.js:639` is the only guard against nagging every reader of a normal paper. If it is lowered, sparse pages (a title page, a references page, a full-page figure) start tripping detection on ordinary papers.

### OCR-003 - Detection samples at most 8 pages
**P1** * Functional * `src/app.js:729-732 detectAndOfferOcr()`

- **Pre:** **SCAN-BIG** (100+ pages). DevTools Performance panel or a console timer.
- **Steps:**
  1. Open SCAN-BIG.
  2. Time from first paint to the banner appearing.
- **Expect:** The banner appears within a few seconds, not after a full-document scan. Detection samples `step = Math.max(1, Math.floor(N/8))` pages starting at page 1 and stops at 8 samples — for a 100-page file that is pages 1, 13, 25, 37, 49, 61, 73, 85.
- **Watch:** If the sampling loop is changed to iterate all pages, opening any large scan freezes the reader for minutes before the banner shows.

### OCR-004 - Detection needs a majority of sampled pages to look scanned
**P1** * Functional * `src/app.js:733 detectAndOfferOcr()`

- **Pre:** **SCAN-MIX** (3 text pages, 7 scan pages).
- **Steps:**
  1. Open SCAN-MIX and wait 5 seconds.
- **Expect:** The banner appears — sampling 8 of 10 pages gives at least 5 image-dominated pages, so `scanned / checked >= 0.5` holds.
- **Watch:** A stricter ratio (e.g. `> 0.8`) silently drops the common "scanned appendix bolted onto a typed report" case, which is exactly the file a reader needs OCR for.

### OCR-005 - A scan carrying a stamp or watermark is still detected
**P1** * Edge * `src/app.js:637 pageNeedsOcr()`, `src/app.js:615 pageImageCoverage()`

- **Pre:** **SCAN-STAMP**.
- **Steps:**
  1. Open SCAN-STAMP.
  2. Before accepting OCR, try to select the stamp text on page 1 with the cursor tool.
- **Expect:** The stamp *is* selectable (it is real text), and the OCR banner still appears — because the page's real text is under 200 non-whitespace characters and the largest painted image still covers ≥ 50 % of the page.
- **Watch:** A regression that treats "has any selectable text" as "not a scan" makes every stamped/Bates-numbered legal or medical scan undetectable — this is the exact case the comment at `src/app.js:635-636` was written for.

### OCR-006 - A vector-only PDF is not offered OCR
**P2** * Edge * `src/app.js:615 pageImageCoverage()`

- **Pre:** **VECTOR** (no raster images, no text).
- **Steps:**
  1. Open VECTOR and wait 5 seconds.
- **Expect:** No banner. `pageImageCoverage` finds no `paintImageXObject` operator, returns `0`, and `pageNeedsOcr` is false for every sampled page.
- **Watch:** This is intended behaviour, not a bug — but if `pageImageCoverage`'s `catch` at `src/app.js:633` is changed to return a non-zero default, every vector deck starts offering pointless OCR.

### OCR-007 - Image coverage is measured through the transform stack
**P1** * Functional * `src/app.js:615-634 pageImageCoverage()`

- **Pre:** A scan where the page image is drawn inside a nested `q … cm … Q` block (most scanner output is). **SCAN-A** normally qualifies.
- **Steps:**
  1. Open SCAN-A. In the console, with the document open, evaluate the coverage of page 1 by hand is not possible from the console (the IIFE is closed) — instead rely on the banner appearing (OCR-001).
  2. Repeat with a scan produced by a *different* scanner/exporter (a second SCAN-A variant, e.g. one exported from macOS Preview and one from a Xerox/Canon MFP).
- **Expect:** Both variants trigger the banner. The save/restore/transform replay at `src/app.js:624-626` must give ~1.0 coverage for a full-page image regardless of how the producer nested its graphics state.
- **Watch:** Dropping the `save`/`restore` stack handling makes coverage collapse to a tiny number for producers that wrap the image in a nested state — detection silently stops working for one brand of scanner only, which is very easy to miss.

### OCR-008 - A page with genuine text is skipped even inside a scanned document
**P1** * Functional * `src/app.js:639 pageNeedsOcr()`, `src/app.js:771 runOcr()`

- **Pre:** **SCAN-MIX**, OCR accepted and run to completion.
- **Steps:**
  1. Open SCAN-MIX, click **"Run OCR"**, wait for it to finish.
  2. Read the completion toast.
  3. Go to page 2 (an original text page) and select a sentence.
- **Expect:** The toast reads **"OCR complete — 7 pages now searchable & highlightable."** (only the 7 scan pages were processed). Selection on page 2 still uses the native PDF.js text layer — the selection highlight hugs the real glyphs exactly.
- **Watch:** If `pageNeedsOcr` is dropped from the `todo` build at `src/app.js:771`, every page is re-recognised — a 10-minute run on a mixed document and worse text on the pages that were already perfect.

### OCR-009 - Detection does not run twice for an already-OCR'd document
**P1** * State * `src/app.js:727 detectAndOfferOcr()`

- **Pre:** **SCAN-A** fully OCR'd in a previous session (cache present under `ocr:<sha>`).
- **Steps:**
  1. Reload the app with SCAN-A active.
  2. Wait 5 seconds.
- **Expect:** No banner. Text on page 1 is already selectable.
- **Watch:** `loadOcrStore` runs *before* `initPdf` in both `boot` (`src/app.js:3333`) and `switchDoc` (`src/app.js:214`). If that order is reversed, the first render lays down an empty text layer and the banner re-offers OCR on a document that is already done.

### OCR-010 - Detection is suppressed once the user has dismissed it
**P1** * State * `src/app.js:728 detectAndOfferOcr()`, `src/app.js:750 showOcrBanner()`

- **Pre:** **SCAN-A**, never OCR'd.
- **Steps:**
  1. Open SCAN-A, click **"✕"** on the banner.
  2. Switch to another document and back.
  3. Reload the whole app.
  4. Inspect `localStorage["srw_state_v1"]` → `docs[]` → the SCAN-A entry.
- **Expect:** The banner never reappears in steps 2 or 3. The doc entry has `"ocrDismissed": true`.
- **Watch:** `doc.ocrDismissed = true; save()` is debounced 250 ms (`src/app.js:154`). Reloading the tab within a quarter-second of the dismiss can lose the flag — dismissing then immediately reloading must still stick.

### OCR-011 - Detection is skipped while a run is already in progress
**P2** * State * `src/app.js:726 detectAndOfferOcr()`

- **Pre:** **SCAN-A**, OCR running.
- **Steps:**
  1. Start OCR on SCAN-A.
  2. While it is running, switch to **SCAN-MIX**, then immediately back to SCAN-A.
- **Expect:** No second `#ocrBanner` is created for SCAN-A while `ocrRunning` is still true (the guard at `src/app.js:726`). At most one element with `id="ocrBanner"` exists in the DOM at any moment.
- **Watch:** Two banners with the same id would both write to `store.pages` and double the work; `showOcrBanner` also removes any existing `#ocrBanner` first (`src/app.js:742`), so an id change breaks that de-dupe.

### OCR-012 - Detection tolerates a page that throws
**P2** * Edge * `src/app.js:732 detectAndOfferOcr()`

- **Pre:** A scan with one damaged page (truncate one page's content stream in a copy of SCAN-A, or use a PDF that renders with console warnings).
- **Steps:**
  1. Open the damaged file and wait 5 seconds.
- **Expect:** The app does not throw an unhandled rejection in the console; the remaining sampled pages still decide the outcome (`checked` counts the attempt, the `try/catch` swallows the failure).
- **Watch:** Removing the `try/catch` around the sample loop turns one bad page into a silently aborted detection for the whole file.

### OCR-013 - A 1-page scan is detected
**P2** * Edge * `src/app.js:729-730 detectAndOfferOcr()`

- **Pre:** A single-page scanned PDF.
- **Steps:**
  1. Open it and wait 5 seconds.
- **Expect:** The banner appears. With `N = 1`, `step = Math.max(1, 0) = 1` and the sample is `[1]`; one scanned page out of one checked is a ratio of 1.0.
- **Watch:** `Math.floor(N/8)` is `0` for any document under 8 pages — the `Math.max(1, …)` is what stops an infinite loop. Removing it hangs the tab on every short document.

### OCR-014 - Detection does not block the first render
**P1** * Perf * `src/app.js:217 switchDoc()`, `src/app.js:3352 boot()`

- **Pre:** **SCAN-BIG**.
- **Steps:**
  1. Open SCAN-BIG.
  2. Immediately try to scroll, zoom and page-forward while the banner is still not shown.
- **Expect:** Page 1 paints first; scrolling, zoom and page navigation are responsive during the detection window. The banner arrives afterwards without disturbing the scroll position.
- **Watch:** Detection is deliberately deferred (500 ms after a switch, 1200 ms at boot) and runs *alongside* the whole-document text pre-cache on the same timer. Making it `await`-ed inline stalls the reader on every open.

---

## 2. The OCR offer banner

### OCR-015 - Banner copy is exact
**P0** * Copy * `src/app.js:745 showOcrBanner()`

- **Pre:** OCR banner showing for **SCAN-A**.
- **Steps:**
  1. Read the banner text character by character; compare against source.
- **Expect:** Verbatim: **"This looks like a scanned PDF — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?"** — an em dash (—) not a hyphen, an ampersand in "highlightable & AI-readable", and a question mark at the end. Only the words **"scanned PDF"** are bold.
- **Watch:** The `&` is written as a literal `&` inside an HTML string (`src/app.js:745`); a careless escape turns it into a visible `&amp;`.

### OCR-016 - Banner action button label
**P0** * Copy * `src/app.js:746 showOcrBanner()`

- **Pre:** OCR banner showing.
- **Steps:**
  1. Read the blue button.
- **Expect:** Exactly **"Run OCR"** — capital R, capital OCR, no ellipsis, no "…". It carries `id="ocrRun"` and `class="tb-act"`.
- **Watch:** `runOcr` removes `#ocrRun` by id (`src/app.js:759`); renaming the id leaves a live "Run OCR" button sitting next to a running progress message.

### OCR-017 - Dismiss button label and accessible name
**P1** * Copy * `src/app.js:747 showOcrBanner()`

- **Pre:** OCR banner showing.
- **Steps:**
  1. Inspect the ✕ button.
  2. Read its accessible name with a screen reader or the Accessibility pane.
- **Expect:** Visible glyph **"✕"** (U+2715), `id="ocrClose"`, `class="tb-x"`, `aria-label="Dismiss"`.
- **Watch:** Once **"Run OCR"** is clicked this same node is re-labelled **"Stop"** but its `aria-label="Dismiss"` is never updated (`src/app.js:761`), so screen-reader users hear "Dismiss" for a Stop button. Confirm the visual label and file the mismatch if it is still present.

### OCR-018 - Banner icon renders
**P2** * Visual * `src/app.js:724 OCR_ICON`, `src/styles.css:663`

- **Pre:** OCR banner showing.
- **Steps:**
  1. Look at the left edge of the banner.
- **Expect:** A 16×16 light-blue (`#93c5fd`) stroked corner-brackets-with-a-bar glyph inside `<span class="tb-ic">`. It is not squashed and does not shrink when the message wraps (`flex:0 0 auto`).
- **Watch:** `currentColor` on the SVG plus `color:#93c5fd` on `.tb-ic` — if the SVG is given a hard-coded `stroke` the icon turns dark and disappears against the `#0B0F19` banner.

### OCR-019 - Banner is announced as a status region
**P1** * Functional * `src/app.js:743 showOcrBanner()`

- **Pre:** VoiceOver / NVDA running, **SCAN-A** not yet OCR'd.
- **Steps:**
  1. Open SCAN-A and listen when the banner appears.
- **Expect:** The banner carries `role="status"` and its text is announced without stealing focus. Keyboard focus stays wherever it was.
- **Watch:** Changing to `role="alert"` or adding an autofocus makes the banner interrupt a reader mid-page; changing to no role makes it silent for screen-reader users, who then have no idea OCR was offered.

### OCR-020 - Banner slide-in transition
**P2** * Visual * `src/app.js:751 showOcrBanner()`, `src/styles.css:657-662`

- **Pre:** **SCAN-A** not yet OCR'd, `prefers-reduced-motion` off.
- **Steps:**
  1. Open SCAN-A and watch the banner arrive (record the screen if needed).
- **Expect:** It fades in from `opacity:0` and slides down 12px over ~0.22s (`.top-banner` → `.top-banner.show`, applied in a `requestAnimationFrame`). Before `.show` is added the element is `pointer-events:none`, so a click landing in that 1-frame window does not hit it.
- **Watch:** Adding `.show` in the same tick as `appendChild` skips the transition entirely — the banner pops in with no animation.

### OCR-021 - Banner does not block the page underneath
**P1** * Functional * `src/styles.css:657-662`

- **Pre:** OCR banner showing on **SCAN-A**.
- **Steps:**
  1. Without dismissing the banner, scroll the reader, change the page number, zoom in and out, open the left and right panels.
- **Expect:** Everything works. The banner is `position:fixed`, has no backdrop, and only its own box takes pointer events.
- **Watch:** A regression that gives the banner a full-viewport wrapper turns it into an invisible modal that eats clicks on the toolbar.

### OCR-022 - Banner positioning and stacking with the notes banner
**P1** * Visual * `src/app.js:737 restackBanners()`

- **Pre:** Storage mode set to a folder (`12-settings-and-templates.md`), so opening a PDF also offers **"Open notes file…"**. Use **SCAN-A** with a matching `.notes.json` in the folder.
- **Steps:**
  1. Open SCAN-A so both banners can appear.
  2. Observe both.
  3. Dismiss the top one and watch the second.
- **Expect:** The first banner sits at `top: 64px`; the second sits 8px below the first's measured height. They never overlap. When one is dismissed the other animates/jumps up to `top: 64px`.
- **Watch:** `restackBanners` measures `offsetHeight`, so the OCR banner's *wrapped* two-line height must be measured after it is in the DOM. If it is measured before layout, the second banner overlaps the first by ~20px on narrow windows.

### OCR-023 - OCR banner message wraps instead of truncating
**P1** * Visual * `src/styles.css:664-665`

- **Pre:** OCR banner showing; browser window at 900px, then 700px, then 380px wide.
- **Steps:**
  1. Resize through all three widths with the banner up.
- **Expect:** At every width the full sentence is readable across multiple lines — `.top-banner.ocr .tb-msg` sets `white-space:normal; line-height:1.35`, overriding the generic `.tb-msg` `nowrap` + `text-overflow:ellipsis`. No "…" truncation of the OCR sentence at any width. The banner never exceeds `min(720px, 100vw - 32px)`.
- **Watch:** Removing the `.ocr` override reverts to the notes-banner styling and the sentence is clipped to "This looks like a scanned PDF — no selectable te…" on anything under ~700px, hiding the point of the banner.

### OCR-024 - Banner stays usable on a phone-width viewport
**P1** * Visual * `src/styles.css:657-670`

- **Pre:** Device toolbar at 375×667 (iPhone SE) with **SCAN-A**.
- **Steps:**
  1. Open SCAN-A and let the banner appear.
  2. Tap **"Run OCR"**; then reload and tap **"✕"**.
- **Expect:** The banner is horizontally centred with a 16px gutter each side, wraps to 3–4 lines, and both buttons remain fully visible and tappable (they are `flex:0 0 auto`). Neither button is pushed off-screen by the wrapped text.
- **Watch:** On a narrow screen the wrapped `.tb-msg` plus two `flex:0 0 auto` buttons can exceed the banner width; if the buttons wrap under the text, verify they are still fully inside the rounded box and not clipped.

### OCR-025 - Run OCR is a single-fire control
**P1** * Edge * `src/app.js:749`, `src/app.js:754 runOcr()`

- **Pre:** OCR banner showing for **SCAN-A**.
- **Steps:**
  1. Double-click **"Run OCR"** as fast as possible.
  2. Watch the banner and the Network panel.
- **Expect:** Exactly one run starts. The button is removed on the first click (`run.remove()`), and `runOcr` also returns immediately if `ocrRunning` is already true. Only one `tesseract.min.js` request appears in Network.
- **Watch:** A second concurrent run would create a second worker and interleave writes to the same `store.pages`, doubling memory and producing partly-overwritten pages.

### OCR-026 - Dismissing does not start anything
**P1** * Functional * `src/app.js:750 showOcrBanner()`

- **Pre:** OCR banner showing; Network panel open and filtered to `tesseract`.
- **Steps:**
  1. Click **"✕"**.
  2. Watch Network for 10 seconds.
- **Expect:** The banner is removed immediately (no fade-out), no `cdn.jsdelivr.net` request is made, and no IndexedDB `ocr:` key appears.
- **Watch:** Pre-loading Tesseract "so it's ready" on banner *show* rather than on Run would ship a ~4 MB download to every reader who declines — check Network at banner-show time too and confirm it is silent.

### OCR-027 - Dismiss re-stacks any remaining banner
**P2** * Visual * `src/app.js:750 showOcrBanner()`

- **Pre:** Both the OCR banner and the notes banner showing (see OCR-022), with the OCR banner on top.
- **Steps:**
  1. Click **"✕"** on the OCR banner.
- **Expect:** The remaining notes banner moves up to `top: 64px` immediately — `restackBanners()` is called in the dismiss handler.
- **Watch:** Forgetting `restackBanners()` in one of the two dismiss handlers leaves a lone banner floating at 120px with an obvious empty gap above it.

### OCR-028 - Banner survives a page change and a zoom change
**P2** * State * `src/app.js:741 showOcrBanner()`

- **Pre:** OCR banner showing for **SCAN-A**.
- **Steps:**
  1. Page forward twice, zoom in twice, toggle continuous scroll.
- **Expect:** The banner stays up and unchanged throughout; nothing in the render path removes it. It is only removed by ✕, by `switchDoc`, or by the `finally` of `runOcr`.
- **Watch:** A `render()` that clears `document.body` extras would nuke the banner mid-offer; the banner is a direct child of `<body>`, not of `#reader`.

### OCR-029 - Banner is removed on document switch
**P0** * State * `src/app.js:206 switchDoc()`

- **Pre:** OCR banner showing for **SCAN-A** (not yet accepted). **TEXT-A** also in the library.
- **Steps:**
  1. With the banner up, click **TEXT-A** in the left library.
- **Expect:** The banner disappears at once and does not come back for TEXT-A.
- **Watch:** If the banner is left on screen after a switch, clicking its **"Run OCR"** runs OCR against whichever document is now open but caches it under the *old* document's SHA — the exact corruption the capture at `src/app.js:765-766` exists to prevent.

---

## 3. Tesseract engine load

### OCR-030 - Engine is fetched only when OCR is accepted
**P0** * Functional * `src/app.js:680 ensureTesseract()`

- **Pre:** Fresh profile, Network panel open, no cache. **SCAN-A**.
- **Steps:**
  1. Load the app and open SCAN-A; wait for the banner. Note the requests so far.
  2. Click **"Run OCR"**.
- **Expect:** Before the click there is no request to `cdn.jsdelivr.net`. After the click, exactly one request to `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js` (`<script async>` appended to `<head>`).
- **Watch:** Bundling Tesseract into `app.html` would add megabytes to the cold load for the 99 % of readers who never open a scan — verify the app's own initial payload does not contain "tesseract".

### OCR-031 - Version is pinned to 5.1.1 across all four URLs
**P1** * Regression * `src/app.js:605 TESS_VER`, `src/app.js:685`, `src/app.js:695-697`

- **Pre:** OCR run in progress on **SCAN-A**, Network panel open.
- **Steps:**
  1. List every third-party URL requested during the run.
- **Expect:** Exactly these four hosts/paths:
  - `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js`
  - `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js`
  - `https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/…` (the wasm core)
  - `https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz`
- **Watch:** `workerPath` and `corePath` build their URLs from the same `TESS_VER` constant, but `langPath` is hard-coded to `4.0.0`. Bumping `TESS_VER` without checking traineddata compatibility gives a worker that loads but recognises nothing — pages come back with zero words and no error.

### OCR-032 - Engine load failure produces the exact error toast
**P0** * Error * `src/app.js:688 ensureTesseract()`, `src/app.js:779 runOcr()`

- **Pre:** **SCAN-A**, banner showing. DevTools → Network → **Block request URL** → `*cdn.jsdelivr.net*`.
- **Steps:**
  1. Click **"Run OCR"**.
  2. Read the toast.
- **Expect:** A red error toast reading exactly **"OCR could not run: tesseract load failed"**. It stays ~6 seconds (error toasts use the 6000/6500 ms timers at `src/app.js:32-33`). The banner is removed. The reader is otherwise untouched.
- **Watch:** `window.__tessLoad` is reset to `null` in `onerror` — without that reset, a second attempt returns the same rejected promise forever and the user can never retry after the network comes back.

### OCR-033 - Retry after a failed engine load succeeds
**P1** * Error * `src/app.js:682-688 ensureTesseract()`

- **Pre:** Immediately after OCR-032 (block still active), same tab, **no reload**.
- **Steps:**
  1. Un-block `*cdn.jsdelivr.net*` in DevTools.
  2. Switch to another document and back to SCAN-A so the banner is re-offered (or reload if the banner does not return).
  3. Click **"Run OCR"** again.
- **Expect:** The engine loads this time and recognition starts — the `window.__tessLoad = null` reset lets a second call build a fresh `<script>`.
- **Watch:** If the memoised promise is not cleared, this second attempt fails instantly with the same message even though the network is healthy, and no reload short of a hard refresh fixes it.

### OCR-034 - Offline: OCR is refused cleanly, reading is unaffected
**P0** * Edge * `src/app.js:680 ensureTesseract()`

- **Pre:** **SCAN-A** open, never OCR'd. DevTools → Network → **Offline**.
- **Steps:**
  1. Reload the app while offline (it is cached) and wait for the banner.
  2. Click **"Run OCR"**.
  3. After the toast, page through the document, zoom, capture a screenshot region, and add a comment pin.
- **Expect:** The toast **"OCR could not run: tesseract load failed"** appears; the PDF still renders and every non-OCR feature keeps working. No stuck "Loading the OCR engine…" message is left on screen (the banner is removed in `finally`).
- **Watch:** The failure path must not leave `ocrRunning === true` — if it does, no future OCR offer will ever fire again in that tab (`src/app.js:726`, `src/app.js:754`).

### OCR-035 - Corporate proxy / CDN blocked by an extension
**P1** * Edge * `src/app.js:685`, `src/app.js:695-697`

- **Pre:** **SCAN-A**. Install or simulate a blocker that allows `jsdelivr.net` but blocks `tessdata.projectnaptha.com` (block that host only in DevTools).
- **Steps:**
  1. Click **"Run OCR"** and wait.
- **Expect:** The failure is reported through the same toast prefix **"OCR could not run: "** followed by whatever the worker throws (message text will vary by browser). The banner is removed, `ocrRunning` clears, and the app remains responsive.
- **Watch:** The language-data host is a *different* domain from the code CDN; blocklists commonly allow one and not the other. Failure must not hang forever with the banner stuck on "Loading the OCR engine…".

### OCR-036 - Second run in the same session reuses the loaded engine
**P1** * Perf * `src/app.js:681 ensureTesseract()`

- **Pre:** **SCAN-A** OCR'd in this session; **SCAN-MIX** also in the library.
- **Steps:**
  1. Switch to SCAN-MIX and accept OCR.
  2. Watch Network.
- **Expect:** No second request for `tesseract.min.js` — `window.Tesseract` already exists, so `ensureTesseract` resolves immediately and the banner goes from "Loading the OCR engine…" to page progress almost instantly. The wasm core and traineddata may be re-fetched from HTTP cache (`from disk cache` / `304`).
- **Watch:** Re-injecting the `<script>` tag each run redefines `window.Tesseract` and can leave the previous worker's callbacks dangling.

### OCR-037 - Worker is terminated when the run ends
**P1** * Perf * `src/app.js:781 runOcr()`

- **Pre:** **SCAN-A**. DevTools → Sources → Threads (Chromium) or `about:debugging` (Firefox).
- **Steps:**
  1. Run OCR to completion.
  2. Look at the live worker list and at the tab's memory in the browser task manager before, during and 10 seconds after.
- **Expect:** The Tesseract worker thread exists during the run and is gone afterwards; tab memory drops back near its pre-run level.
- **Watch:** `worker.terminate()` is inside `finally` and wrapped in its own `try` — running OCR on three documents in a row must not accumulate three live workers (each holds the wasm core plus the language model, hundreds of MB).

### OCR-038 - Worker is terminated when the run is stopped or errors
**P1** * Perf * `src/app.js:780-784 runOcr()`

- **Pre:** **SCAN-BIG**.
- **Steps:**
  1. Start OCR, let 2 pages complete, click **"Stop"**.
  2. Check the worker list again.
  3. Separately: trigger the load failure of OCR-032 and check that no worker was created.
- **Expect:** In both cases no Tesseract worker survives and memory returns to baseline.
- **Watch:** `worker` is only assigned after `createTesseractWorker()` resolves; an error thrown between `ensureTesseract` and that assignment must not throw again inside `finally` (`if (worker)` guards it).

### OCR-039 - Engine load message is shown while waiting
**P1** * Copy * `src/app.js:758 runOcr()`

- **Pre:** **SCAN-A**, banner showing, Network throttled to "Slow 4G" so the load is visible.
- **Steps:**
  1. Click **"Run OCR"** and read the banner immediately.
- **Expect:** The banner message changes to exactly **"Loading the OCR engine…"** (single-character ellipsis "…", not three dots), the **"Run OCR"** button disappears, and the ✕ becomes a blue **"Stop"** button.
- **Watch:** This message also covers the `todo` scan that follows the engine load (`src/app.js:770-771`), so on a large document it can stay up for a long time — see OCR-121.

---

## 4. Running OCR: progress and per-page recognition

### OCR-040 - Per-page progress copy is exact
**P0** * Copy * `src/app.js:774 runOcr()`

- **Pre:** **SCAN-A** (say 10 scan pages), OCR started.
- **Steps:**
  1. Watch the banner through several pages.
- **Expect:** The message reads **"Reading text… page 1 of 10"**, then **"page 2 of 10"**, etc., with the **"page N of M"** part in bold white (`.tb-msg b` → `color:#fff; font-weight:700`). The counter starts at 1, not 0, and M is the number of pages that actually need OCR — not the document's page count.
- **Watch:** `done + 1` is used for display while `done` is incremented after the await; an off-by-one regression shows "page 0 of 10" on the first page or ends at "page 9 of 10".

### OCR-041 - The denominator counts only pages that need OCR
**P1** * Functional * `src/app.js:770-774 runOcr()`

- **Pre:** **SCAN-MIX** (10 pages, 7 scanned).
- **Steps:**
  1. Run OCR and read the progress text.
- **Expect:** **"Reading text… page 1 of 7"** — not "of 10".
- **Watch:** Using `total` instead of `todo.length` in the message makes progress appear to stall (it jumps 1→2→3 then finishes at "3 of 10"), which reads as a hang.

### OCR-042 - Pages become selectable one at a time, live
**P0** * Functional * `src/app.js:775`, `src/app.js:669 applyOcrToRendered()`

- **Pre:** **SCAN-A**, single-page mode, sitting on page 1.
- **Steps:**
  1. Start OCR.
  2. As soon as the counter moves past page 1, try to drag-select a line of text on page 1 — do not wait for the run to finish.
- **Expect:** Page 1's words are selectable while the run continues on later pages. The blue selection (`rgba(37,99,235,.28)`, `src/styles.css:125`) tracks the printed words on the scan.
- **Watch:** `applyOcrToRendered` is called per page inside the loop specifically so the reader gets value immediately; if it is moved to the end of the run, a 100-page scan gives no feedback for many minutes.

### OCR-043 - Live refresh works in continuous scroll mode
**P0** * Functional * `src/app.js:671-673 applyOcrToRendered()`

- **Pre:** **SCAN-A**, continuous scroll ON (the default), pages 1–3 rendered on screen.
- **Steps:**
  1. Start OCR and watch pages 1–3 without scrolling.
  2. Try selecting text on page 2 once its number has passed in the counter.
- **Expect:** Each visible, already-rendered `.pg` gets its text layer replaced as its page completes; selection works on each one as it lands.
- **Watch:** The continuous branch requires `pg._rendered`; a page that is in the DOM but not yet rendered has no `_vp`, and calling `buildOcrTextLayer` with an undefined viewport would throw and abort the loop's `try` silently, leaving that page permanently without text.

### OCR-044 - A page OCR'd while off-screen gets its layer on first render
**P0** * Functional * `src/app.js:482`, `src/app.js:514`, `src/app.js:662 applyOcrLayer()`

- **Pre:** **SCAN-A**, OCR run to completion while staying on page 1.
- **Steps:**
  1. After the completion toast, navigate to page 6 (never rendered during the run).
  2. Select text there.
- **Expect:** Page 6 has a working selectable layer — `renderPage`/`renderInto` call `applyOcrLayer` after PDF.js builds its (empty) native layer, wiping it and laying the OCR spans in.
- **Watch:** `applyOcrLayer` does `tl.innerHTML = ''` first; if the call is moved *before* `renderTextLayer`, PDF.js's empty layer overwrites the OCR spans and every unvisited page looks un-OCR'd.

### OCR-045 - Recognition canvas is rendered on white
**P1** * Functional * `src/app.js:715 ocrOnePage()`

- **Pre:** A scan with transparency or a non-white page background (a photographed page, or a PDF whose page has no painted background).
- **Steps:**
  1. Run OCR and check the resulting text quality on that page (select and copy a paragraph).
- **Expect:** Recognised text is readable, not garbage. The canvas is filled `#fff` before `page.render`, so pages that would otherwise composite onto transparent black do not come out inverted.
- **Watch:** Removing the `fillRect` gives black-on-transparent pages to Tesseract; the symptom is a page that "OCRs fine" in one browser and returns empty in another.

### OCR-046 - Recognition resolution is ~2000px wide and clamped
**P1** * Functional * `src/app.js:710 ocrOnePage()`

- **Pre:** Three scans: a normal A4 (~595pt wide), a tiny page (e.g. a 200pt receipt scan), and an oversized page (an A0 poster or a 2000pt+ engineering drawing).
- **Steps:**
  1. OCR each; for each, judge whether words on the page came back correctly.
- **Expect:** All three complete. The scale is `Math.max(1.5, Math.min(4, 2000 / baseWidth))` — the A4 gets ~3.36×, the tiny page is capped at 4× (never more), the oversized page floors at 1.5× (so its canvas is *larger* than 2000px, deliberately).
- **Watch:** The floor of 1.5 means a very wide page produces a very large canvas (a 2400pt-wide page → 3600px). On a low-memory machine this is where `ocrOnePage` starts throwing — that throw is swallowed by the per-page `try/catch` at `src/app.js:775` and the page silently stays un-OCR'd. Check for a page that is skipped without any message.

### OCR-047 - A page that fails is skipped without killing the run
**P1** * Edge * `src/app.js:775 runOcr()`

- **Pre:** A scan with one page that fails to render (use the damaged fixture from OCR-012).
- **Steps:**
  1. Run OCR to completion.
  2. Check whether the remaining pages are selectable.
  3. Read the completion toast count.
- **Expect:** The run continues past the bad page and finishes. All healthy pages are selectable. **Note:** `done++` runs even for a failed page, so the toast count includes the failure — verify whether the number matches the number of actually-selectable pages and report any mismatch.
- **Watch:** Moving the `try/catch` outside the loop turns one bad page into a completely aborted run that still leaves earlier pages cached (so the banner never re-offers — see OCR-070).

### OCR-048 - Progress does not stall on a blank scanned page
**P2** * Edge * `src/app.js:719-722 ocrOnePage()`

- **Pre:** **SCAN-BLANK**.
- **Steps:**
  1. Run OCR and watch the counter over the blank page.
  2. After completion, navigate to the blank page and try to select.
- **Expect:** The counter advances normally. The blank page ends up with an empty text layer (`words: []`, `text: ""`) and nothing selectable — but it is recorded in the store, so it is not re-attempted on a later run.
- **Watch:** A blank page still costs a full render + recognise. If the run appears to hang for 5+ seconds on a page with nothing on it, that is the wasm core, not a bug — but confirm it does eventually advance.

### OCR-049 - Word boxes are filtered before storage
**P1** * Functional * `src/app.js:720 ocrOnePage()`

- **Pre:** **SCAN-A**, OCR complete. DevTools → Application → IndexedDB → `srw_assets` → `assets` → key `ocr:<sha>`.
- **Steps:**
  1. Expand `pages` → any page → `words`.
  2. Look for entries with empty/whitespace `t` or with no box.
- **Expect:** Every stored word has a non-empty trimmed `t` and four numeric coordinates `x0, y0, x1, y1`, all between 0 and 1 inclusive.
- **Watch:** Un-filtered empty words become zero-width spans in the text layer; they break word spacing in a copied selection and add hundreds of useless DOM nodes per page.

### OCR-050 - Recognised page text is normalised
**P2** * Functional * `src/app.js:722 ocrOnePage()`

- **Pre:** **SCAN-A**, OCR complete, IndexedDB open on `ocr:<sha>`.
- **Steps:**
  1. Read `pages["1"].text`.
- **Expect:** Line breaks are preserved but no line ends with trailing spaces or tabs (`/[ \t]+\n/g → '\n'`), and the whole string is trimmed.
- **Watch:** This normalisation is what stops the find bar's raw `indexOf` from missing words at line ends — see OCR-094.

### OCR-051 - Tesseract v5 block hierarchy is unpacked
**P1** * Regression * `src/app.js:701 ocrCollectWords()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Confirm a page has a non-trivial number of stored `words` (dozens to hundreds for a text page).
- **Expect:** Words are present. With `tesseract.js@5.1.1` the words live under `data.blocks[].paragraphs[].lines[].words[]`, which `ocrCollectWords` walks; older builds expose a flat `data.words`, which it prefers when present.
- **Watch:** This is the single most fragile point across a Tesseract upgrade. The symptom of a broken unpack is *not* an error: `text` is still correct (so the AI and the raw find count work) but `words` is empty, so **nothing is selectable or highlightable**. Always check selection, not just search results, after bumping `TESS_VER`.

### OCR-052 - Completion toast copy, singular and plural
**P0** * Copy * `src/app.js:791-793 runOcr()`

- **Pre:** Two fixtures: a 1-page scan and **SCAN-A** (multi-page).
- **Steps:**
  1. OCR the 1-page scan; read the toast.
  2. OCR SCAN-A; read the toast.
- **Expect:** Exactly **"OCR complete — 1 page now searchable & highlightable."** and **"OCR complete — 10 pages now searchable & highlightable."** (substituting the real count). Em dash, ampersand, trailing full stop. Default (non-error) toast styling, ~3.2s visible.
- **Watch:** The pluralisation is `(done !== 1 ? 's' : '')`; a copy edit that hard-codes "pages" gives "1 pages".

### OCR-053 - No toast when nothing needed OCR
**P2** * Edge * `src/app.js:791 runOcr()`

- **Pre:** A document where detection fired (majority of the *sample* looked scanned) but the full `todo` scan finds nothing — e.g. a document whose sampled pages are scans but whose remaining pages all carry >200 characters, or a document already fully cached.
- **Steps:**
  1. Accept OCR and wait.
- **Expect:** The banner disappears and **no toast at all** is shown (`if (done)` guards both toasts). Nothing is written to IndexedDB.
- **Watch:** A regression that always toasts would say "OCR complete — 0 pages now searchable & highlightable.", which reads as a failure.

---

## 5. The rebuilt text layer

### OCR-054 - Selection geometry matches the printed words
**P0** * Visual * `src/app.js:644 buildOcrTextLayer()`

- **Pre:** **SCAN-A**, OCR complete, page 1 on screen at 100 % zoom.
- **Steps:**
  1. Drag-select a full printed line.
  2. Compare the blue selection band with the ink.
- **Expect:** The selection band covers the line's words with no visible horizontal drift — each span is absolutely positioned at `x0 * vp.width`, sized to the box height, and `scaleX`-transformed so its rendered width equals the OCR box width.
- **Watch:** The `scaleX` factor is computed from a batched `offsetWidth` read taken *before* the trailing space is appended (`src/app.js:656-659`). Appending the space first inflates `nat[i]`, every word is scaled down, and selection drifts progressively leftward across the line — most visible at the right margin.

### OCR-055 - Selected text carries word spaces
**P0** * Functional * `src/app.js:659 buildOcrTextLayer()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Select a sentence spanning several words on one line.
  2. Copy it (⌘/Ctrl-C) and paste into a plain-text editor.
- **Expect:** Words are separated by single spaces — e.g. `the quick brown fox`, not `thequickbrownfox`.
- **Watch:** The trailing `' '` appended per span is the only thing producing spaces. Dropping it makes every copied selection, every note's `selected_text`, and every AI quote one run-on word.

### OCR-056 - Selection across lines works
**P1** * Functional * `src/app.js:644 buildOcrTextLayer()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Drag-select from the middle of one line to the middle of the line below.
  2. Copy and paste into a text editor.
- **Expect:** Both partial lines are captured, separated by a space (the spans are absolutely positioned so the browser joins them in DOM order). The selection popover appears (see OCR-057).
- **Watch:** Spans are appended in Tesseract's word order (block → paragraph → line → word). A multi-column scan whose columns interleave in that order will select in reading order that looks wrong — note it, it is a known consequence of `ocrCollectWords`'s flat traversal.

### OCR-057 - The selection popover opens on an OCR page
**P0** * Functional * `src/app.js:813 onTextSelect()`

- **Pre:** **SCAN-A**, OCR complete, cursor tool active, right panel visible.
- **Steps:**
  1. Select ~10 words on page 3.
- **Expect:** `#selPop` appears near the selection with its normal actions. `range.commonAncestorContainer.closest('.textLayer')` resolves to the OCR layer, so `pendingSel.page` is the correct page number (in continuous mode it is read from the `.pg[data-page]` wrapper).
- **Watch:** If `buildOcrTextLayer` ever appends spans to a wrapper *inside* `.textLayer` rather than to the layer itself, `closest('.textLayer')` still works — but a change that moves them into a sibling node makes every selection on a scan silently do nothing.

### OCR-058 - Word boxes with zero or sub-pixel height are dropped
**P2** * Edge * `src/app.js:649 buildOcrTextLayer()`

- **Pre:** **SCAN-A**, OCR complete, Elements panel on the text layer.
- **Steps:**
  1. Inspect `#textLayer` and look for spans with `height:0px` or `height:1px`.
- **Expect:** None. Words whose box computes to `w <= 0` or `h <= 1` px are skipped entirely.
- **Watch:** A zero-height span is unselectable but still counted by the find bar's span walk, producing a match count the user can never reach.

### OCR-059 - Text layer spans are invisible
**P0** * Visual * `src/styles.css:123`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Look at the page with nothing selected, at 100 % and at 250 % zoom.
- **Expect:** No doubled or ghosted text over the scan. `.textLayer > span { color: transparent }` keeps the OCR words invisible; only the canvas image is seen.
- **Watch:** A theme change that sets an explicit `color` on `.textLayer span` paints the OCR words *on top of* the scan, offset by a pixel or two — instantly obvious and very ugly.

### OCR-060 - Geometry holds across zoom levels
**P0** * Functional * `src/app.js:662 applyOcrLayer()`, `src/app.js:482`

- **Pre:** **SCAN-A**, OCR complete, page 1 at 100 %.
- **Steps:**
  1. Select a line and note where the band sits.
  2. Zoom to 50 %, then 200 %, then back to 100 %, re-selecting the same line each time.
- **Expect:** The selection band tracks the words at every zoom. Word boxes are stored normalised 0–1 and multiplied by the *current* `vp.width`/`vp.height` on every render, so the layer is rebuilt correctly at each scale.
- **Watch:** Storing absolute pixel boxes (instead of 0–1) would make selection correct only at the zoom level in force when OCR ran — check both a zoom-out and a zoom-in, since a bug in one direction can look plausible in the other.

### OCR-061 - Geometry holds after a window resize
**P1** * Functional * `src/app.js:669 applyOcrToRendered()`

- **Pre:** **SCAN-A**, OCR complete, fit-to-width zoom.
- **Steps:**
  1. Select a line at 1400px window width.
  2. Resize the window to 900px, let the page re-render, and select the same line.
- **Expect:** Selection still hugs the words.
- **Watch:** A resize that re-renders the canvas but not the text layer leaves stale span positions — the selection band lands where the words *used* to be.

### OCR-062 - Rotated pages line up
**P1** * Edge * `src/app.js:709-711 ocrOnePage()`

- **Pre:** A scan with at least one page carrying a `/Rotate 90` entry (many fax/MFP scans do).
- **Steps:**
  1. OCR the document.
  2. On the rotated page, select a line.
- **Expect:** The page renders in its rotated orientation and the selection matches the visible words — both the OCR canvas viewport and the display viewport come from `page.getViewport`, which applies the same rotation.
- **Watch:** Normalisation by `canvas.width`/`canvas.height` (not by the unrotated media box) is what makes this work. If someone "optimises" by normalising against `page.view`, every rotated page's boxes end up transposed.

### OCR-063 - Native text layer is fully replaced, not merged
**P1** * Functional * `src/app.js:664 applyOcrLayer()`

- **Pre:** **SCAN-STAMP**, OCR complete.
- **Steps:**
  1. Select across the area where the real-text stamp sits.
  2. Copy and paste.
- **Expect:** The stamp text appears once, not twice. `tl.innerHTML = ''` clears the sparse native layer before the OCR spans are laid in, so the stamp is represented only by its OCR'd copy.
- **Watch:** Appending instead of replacing gives every stamped scan a duplicated, overlapping stamp — two selection bands stacked on the same words, and doubled text in every copy and every AI prompt.

### OCR-064 - Text layer respects the screenshot tool
**P1** * Functional * `src/app.js:486`, `src/app.js:912-913 setTool()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Pick the screenshot tool (`#toolShot`) and drag a region over OCR'd text.
  2. Switch back to the cursor tool and select text.
- **Expect:** With the screenshot tool active the OCR layer has `pointer-events: none`, so the drag creates a capture box instead of selecting text. Back on the cursor tool, selection works again.
- **Watch:** `applyOcrLayer` runs *after* the `pointerEvents` assignment in `renderPage` but rebuilds only the children, not the layer's style — confirm the pointer-events state survives a page change made while the screenshot tool is active.

### OCR-065 - Find marks do not corrupt the OCR layer
**P1** * Regression * `src/app.js:2992 findMarkPage()`, `src/app.js:2951 clearFindMarks()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Open find (⌘/Ctrl-F), search a single word that appears on the page, step through matches, then close find with Esc.
  2. Select the previously-marked words and copy them.
- **Expect:** After closing find, the words are back to plain text (`s.textContent = s.textContent` restores them) and the copied selection still contains the correct words with spaces — the `scaleX` transform and inline styles are untouched because only `innerHTML` is rewritten.
- **Watch:** `clearFindMarks` resets `textContent`, which **also drops the trailing space** appended by `buildOcrTextLayer`? Verify explicitly: after using find on an OCR page, copy a multi-word selection and confirm the spaces are still there. If they are gone, this is a real regression to file.

### OCR-066 - Very dense page does not stall rendering
**P2** * Perf * `src/app.js:656 buildOcrTextLayer()`

- **Pre:** A dense scanned page (small type, two columns, 800+ words).
- **Steps:**
  1. OCR it, then page back and forth onto it five times and watch for jank.
- **Expect:** Each render of that page is smooth. The `spans.map(s => s.offsetWidth)` read is deliberately batched into one reflow before the transforms are written.
- **Watch:** Reading `offsetWidth` inside the same loop that writes `style.transform` forces layout thrashing — one reflow per word. On an 800-word page that is a visible multi-hundred-millisecond freeze on every page turn.

---

## 6. Stopping, switching documents and interruption

### OCR-067 - Stop button appears once the run starts
**P0** * Functional * `src/app.js:759-761 runOcr()`

- **Pre:** **SCAN-A**, banner showing.
- **Steps:**
  1. Click **"Run OCR"**.
  2. Inspect the two buttons.
- **Expect:** `#ocrRun` is gone. The former ✕ now reads exactly **"Stop"** and is styled as a blue action button (`class` changed from `tb-x` to `tb-act`), i.e. it looks identical to the old "Run OCR" button.
- **Watch:** `stop.className = 'tb-act'` *replaces* the class list, so `tb-x` is dropped. If a future style relies on `tb-x` for layout, the Stop button jumps position at the moment the run begins.

### OCR-068 - Stop finishes the current page then halts
**P0** * Functional * `src/app.js:761`, `src/app.js:773 runOcr()`

- **Pre:** **SCAN-BIG**, OCR running, counter around page 3.
- **Steps:**
  1. Click **"Stop"**.
  2. Read the banner message immediately.
  3. Wait for the toast.
- **Expect:** The message changes to exactly **"Finishing current page…"**; after the in-flight page completes, the banner disappears and a toast reads **"OCR stopped — 3 pages done."** (singular form: **"OCR stopped — 1 page done."**).
- **Watch:** The cancel flag is only tested at the *top* of the loop, so Stop cannot abort a page mid-recognition. On a large, slow page the "Finishing current page…" state can last 10+ seconds — verify the button does not appear frozen (it stays clickable but does nothing further).

### OCR-069 - Pages completed before Stop stay usable and cached
**P0** * State * `src/app.js:775`, `src/app.js:786-790 runOcr()`

- **Pre:** **SCAN-BIG**.
- **Steps:**
  1. Start OCR, let 3 pages complete, click **"Stop"**.
  2. Select text on pages 1–3.
  3. Reload the app.
  4. Select text on pages 1–3 again.
- **Expect:** Pages 1–3 are selectable both before and after the reload — each page is written to IndexedDB immediately after it completes (`idbPut` inside the loop), and the post-run refresh loop re-applies every page in the store.
- **Watch:** Moving `idbPut` outside the loop (a tempting "optimisation") means a stopped or crashed run loses everything it did.

### OCR-070 - A stopped run is not re-offered on reopen
**P1** * State * `src/app.js:727 detectAndOfferOcr()`

- **Pre:** Immediately after OCR-069 (3 of ~100 pages done).
- **Steps:**
  1. Reload the app with the document active, wait 5 seconds.
  2. Switch away to another document and back.
- **Expect:** **No banner.** `detectAndOfferOcr` returns early because `ocrStore.pages` is non-empty. This is the current, intended behaviour: a partially-OCR'd document offers no way to resume from the UI.
- **Watch:** This is a genuine product gap, not a code bug — record it. If the guard is ever loosened, verify the resumed run skips pages already in `store.pages` (`src/app.js:771`) rather than redoing them.

### OCR-071 - Switching documents mid-run stops the run
**P0** * State * `src/app.js:206 switchDoc()`, `src/app.js:773 runOcr()`

- **Pre:** **SCAN-BIG** OCR running at ~page 3; **TEXT-A** in the library.
- **Steps:**
  1. Click TEXT-A in the left library.
  2. Watch the banner and the console.
- **Expect:** The OCR banner disappears immediately, the run halts at the next loop iteration (`ocrCancel` set, and `active()` false once `ocrStore` is reassigned), and no toast fires for the abandoned run in the new document's context. TEXT-A renders normally.
- **Watch:** `switchDoc` clears `pageTextCache` and reassigns `ocrStore`; the run's `active()` check compares object identity, so any refactor that mutates `ocrStore` in place instead of reassigning breaks the guard and lets a dead run keep writing.

### OCR-072 - Switching mid-run does not corrupt the other document's store
**P0** * State * `src/app.js:765-766`, `src/app.js:786 runOcr()`

- **Pre:** **SCAN-A** and **SCAN-MIX** both in the library, neither OCR'd.
- **Steps:**
  1. Start OCR on SCAN-A, let 2 pages finish, then switch to SCAN-MIX.
  2. In IndexedDB, list every key starting with `ocr:`.
  3. Reload; open SCAN-A and check pages 1–2; open SCAN-MIX and check page 4.
- **Expect:** Exactly one `ocr:` key exists, matching SCAN-A's SHA, containing exactly the pages that finished before the switch — and the text on SCAN-A pages 1–2 is SCAN-A's own content. SCAN-MIX has no `ocr:` key and offers the OCR banner as if never touched.
- **Watch:** The `store`/`total`/`active()` capture at `src/app.js:765-766` exists precisely for this. `ocrOnePage` still reads the module-level `pdfDoc`, so a page whose recognition was already in flight at the moment of the switch is the risk window — read the stored text of the last-completed page and confirm it belongs to SCAN-A, not to SCAN-MIX.

### OCR-073 - Post-run refresh is skipped for an abandoned document
**P1** * State * `src/app.js:786 runOcr()`

- **Pre:** As OCR-072, after switching to SCAN-MIX.
- **Steps:**
  1. Immediately after the switch, select text on SCAN-MIX page 1.
  2. Check `pageTextCache` behaviour indirectly: open find and search for a word that exists only on SCAN-A.
- **Expect:** SCAN-MIX shows no SCAN-A text. The final `for (const k of Object.keys(store.pages))` refresh loop is gated on `active()` and does not run, so SCAN-A's OCR text is never injected into SCAN-MIX's caches or layers.
- **Watch:** Without that gate, the abandoned run's refresh writes SCAN-A page text into `pageTextCache[n]` for the *new* document — search then returns hits that do not exist on the page, and the AI is fed the wrong paper.

### OCR-074 - Closing the tab mid-run loses nothing already done
**P1** * Edge * `src/app.js:775 runOcr()`

- **Pre:** **SCAN-BIG**, OCR running past page 4.
- **Steps:**
  1. Close the tab (or hard-reload) without stopping.
  2. Reopen the app on the same document.
- **Expect:** Pages 1–4 are selectable straight away; the banner does not reappear (see OCR-070).
- **Watch:** IndexedDB writes are fire-and-forget (`idbPut` has no await and swallows errors, `src/app.js:133`). A kill within a few milliseconds of a page finishing can lose that one page — acceptable; losing *all* pages is not.

### OCR-075 - Backgrounding the tab does not break the run
**P1** * Edge * `src/app.js:772-777 runOcr()`

- **Pre:** **SCAN-A**, OCR running.
- **Steps:**
  1. Switch to another browser tab for 60 seconds.
  2. Come back.
- **Expect:** The run has progressed (workers are not throttled to a stop) and either completed with its toast or is still counting up. No stuck counter.
- **Watch:** If the run relies on `requestAnimationFrame` anywhere it will freeze while backgrounded; it should not — `runOcr` is a plain async loop.

### OCR-076 - Stop during the pre-scan phase
**P2** * Edge * `src/app.js:770-771 runOcr()`

- **Pre:** **SCAN-BIG**, banner showing.
- **Steps:**
  1. Click **"Run OCR"**.
  2. While the banner still reads **"Loading the OCR engine…"** (the `todo` scan runs under that same message), click **"Stop"**.
- **Expect:** The message changes to **"Finishing current page…"** and the run ends without recognising any page — but only *after* the whole `todo` scan completes, because `ocrCancel` is not checked inside that loop.
- **Watch:** On a 200-page document the scan calls `getTextContent` + `getOperatorList` for every page; a Stop pressed here appears to do nothing for tens of seconds. Confirm it eventually ends and no toast fires (`done === 0`).

### OCR-077 - Removing the document mid-run
**P1** * Edge * `src/app.js:206 switchDoc()`

- **Pre:** **SCAN-A** OCR running; another document in the library.
- **Steps:**
  1. Move SCAN-A to trash / remove it from the library while OCR is running (see `04-document-lifecycle.md`).
- **Expect:** The app switches to another document, the banner is removed, the run stops, and no unhandled rejection appears in the console.
- **Watch:** Removal that deletes `pdf:<id>` bytes while `ocrOnePage` still holds a PDF.js page object should be harmless (the page object is already resolved), but a console exception here means the removal path is racing the OCR loop.

### OCR-078 - Rapid document switching does not mis-target the banner
**P1** * Edge * `src/app.js:217 switchDoc()`, `src/app.js:725 detectAndOfferOcr()`

- **Pre:** **SCAN-A**, **TEXT-A** and the sample all in the library.
- **Steps:**
  1. Click SCAN-A, then within half a second click TEXT-A, then within half a second click the sample.
  2. Wait 5 seconds and observe.
  3. If a banner appears, note which document is on screen, click **"Run OCR"**, and check which SHA gets an `ocr:` key.
- **Expect:** At most one banner, and if it appears the OCR it runs must target the document currently on screen and cache under *that* document's SHA.
- **Watch:** Detection is scheduled on a 500 ms timer that closes over the `doc` object from the switch that scheduled it, while `pdfDoc`/`numPages` belong to whatever is open when it fires. A banner offered for document A while document C is on screen, accepted, writes C's pages under A's SHA — the highest-value bug in this document.

---

## 7. Caching by document SHA

### OCR-079 - Results are stored under `ocr:<sha>`
**P0** * State * `src/app.js:775 runOcr()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Read the document's SHA from `localStorage["srw_state_v1"]` → `docs[]` → the SCAN-A entry → `sha`.
  2. Open IndexedDB `srw_assets` → `assets` and find the key `ocr:<that sha>`.
  3. Expand the value.
- **Expect:** The key exists and its value is `{ pages: { "1": { text, words }, "2": {…}, … } }` with one entry per OCR'd page.
- **Watch:** The key must be built from the **content SHA**, not the document id — that is what makes OCR survive a rename and re-attach to the same paper opened from a different folder.

### OCR-080 - Cache is written incrementally, not at the end
**P0** * State * `src/app.js:775 runOcr()`

- **Pre:** **SCAN-BIG**, OCR running.
- **Steps:**
  1. With the counter at page 2, open IndexedDB and read `ocr:<sha>`.
  2. Refresh the IndexedDB view when the counter reaches page 5.
- **Expect:** At the first read the store already contains 2 pages; at the second, 5. Each page is persisted immediately after it is recognised.
- **Watch:** IndexedDB viewers cache aggressively — use the refresh button in the Application panel, not a re-expand, or you will wrongly conclude nothing was written.

### OCR-081 - OCR survives a full reload
**P0** * State * `src/app.js:607 loadOcrStore()`, `src/app.js:3333 boot()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Hard-reload the app (⌘/Ctrl-Shift-R).
  2. As soon as page 1 paints, select a line.
- **Expect:** Text is selectable on the very first render — `loadOcrStore(bootDoc.sha)` is awaited *before* `initPdf`, so `applyOcrLayer` has the record ready when the first text layer is built.
- **Watch:** If OCR text only appears after a page turn, the store is being loaded after the first render — the ordering comment at `src/app.js:3333` exists for exactly that regression.

### OCR-082 - OCR follows the document across a rename
**P0** * State * `src/app.js:227 openPdfFile()`, `src/app.js:607 loadOcrStore()`

- **Pre:** **SCAN-A** OCR'd. A byte-identical copy of SCAN-A saved under a different filename.
- **Steps:**
  1. Open the renamed copy via **"New"**.
  2. Read the toast, then select text on page 1.
- **Expect:** The re-attach toast **"Reopened <name> — same paper, your notes are here."** appears (the SHA matches an existing library entry) and text is immediately selectable with no OCR banner — the same `ocr:<sha>` cache is reused.
- **Watch:** If SHA matching is skipped, the renamed file becomes a second library entry with no cache and the reader is asked to OCR the same document twice.

### OCR-083 - OCR does not leak between different documents
**P0** * State * `src/app.js:607 loadOcrStore()`

- **Pre:** **SCAN-A** OCR'd; **SCAN-MIX** never OCR'd.
- **Steps:**
  1. Switch to SCAN-MIX and try to select text on page 5 (a scan page).
  2. Open find and search a distinctive word that only exists in SCAN-A.
- **Expect:** Nothing is selectable on SCAN-MIX page 5 and the find bar shows **"No results"** for the SCAN-A-only word.
- **Watch:** `loadOcrStore` sets `ocrStore = null` first and only assigns when a matching record is found; removing that reset leaves the previous document's OCR live on the new one.

### OCR-084 - A document with no SHA does not persist its OCR
**P1** * Edge * `src/app.js:181 sha256Hex()`, `src/app.js:609 loadOcrStore()`, `src/app.js:775 runOcr()`

- **Pre:** Serve the app over plain `http://` on a LAN IP (not `localhost`) so `crypto.subtle` is unavailable and `sha256Hex` returns `null`; open **SCAN-A** there. (Alternatively use the bundled sample, whose library entry has no `sha` at all.)
- **Steps:**
  1. Run OCR to completion; confirm text is selectable.
  2. Look at the IndexedDB keys.
  3. Reload and try to select the same text.
- **Expect:** During the session OCR works. The stored key is literally **`ocr:undefined`** (or `ocr:null`). After the reload the text is **not** selectable, because `loadOcrStore` returns early on a falsy sha.
- **Watch:** Two different sha-less documents share the single `ocr:undefined` key — OCR one, then OCR another, and the second overwrites the first. If the app is ever served insecurely this becomes a real cross-document text leak; the correct fix is to skip caching entirely when `sha` is falsy.

### OCR-085 - Malformed cache entry is ignored, not fatal
**P1** * Edge * `src/app.js:610 loadOcrStore()`

- **Pre:** **SCAN-A** OCR'd.
- **Steps:**
  1. In the IndexedDB Application panel, edit the `ocr:<sha>` value to `{"nonsense": 1}` (or delete the `pages` key).
  2. Reload the app.
- **Expect:** No crash, no console exception. Text is not selectable and the OCR banner is offered again (the store is `null`, so `detectAndOfferOcr` proceeds).
- **Watch:** The `if (v && v.pages)` guard is the only validation; a record whose `pages` exists but whose `words` arrays are corrupt will still be applied — `buildOcrTextLayer` guards on `rec.words` being present but not on its element shape.

### OCR-086 - IndexedDB unavailable degrades gracefully
**P1** * Edge * `src/app.js:123-143`, `src/app.js:775`

- **Pre:** A browser context where IndexedDB is blocked (Firefox with cookies/site-data blocked for the origin, or a sandboxed iframe preview).
- **Steps:**
  1. Open **SCAN-A** and run OCR to completion.
  2. Reload.
- **Expect:** OCR works for the session (the store lives in memory) and nothing throws — `idbOpen` resolves `null`, `idbPut` no-ops behind its `try`, `idbGet` resolves `null`. After the reload OCR is offered again.
- **Watch:** Any un-guarded `_idb.transaction(...)` added to the OCR path throws on every page and kills the whole run in these contexts.

### OCR-087 - Clearing site data removes the OCR cache
**P1** * State * `src/app.js:126`

- **Pre:** **SCAN-A** OCR'd.
- **Steps:**
  1. DevTools → Application → Storage → **Clear site data**.
  2. Reload and reopen SCAN-A.
- **Expect:** The `ocr:` keys are gone; the OCR banner is offered again; running it rebuilds the cache.
- **Watch:** OCR results are the most expensive thing the app stores. Confirm the app never *silently* re-runs OCR without asking after a storage clear.

### OCR-088 - Cache size is proportional to word count
**P2** * Perf * `src/app.js:721 ocrOnePage()`

- **Pre:** **SCAN-BIG** OCR'd (or as many pages as patience allows).
- **Steps:**
  1. In Application → Storage, note the IndexedDB usage before and after.
- **Expect:** Growth of roughly a few tens of KB per dense page (four floats plus a short string per word). No page image or canvas data is stored.
- **Watch:** Storing the rendered canvas or a data-URL "for later" would multiply this by ~1000× and blow the origin quota — check that no `data:image` string appears anywhere under an `ocr:` key.

### OCR-089 - Quota exhaustion does not corrupt the run
**P2** * Edge * `src/app.js:133 idbPut()`

- **Pre:** An origin close to its storage quota (fill it with screenshots/visuals first, see `17-performance-and-limits.md`).
- **Steps:**
  1. Run OCR on **SCAN-BIG**.
- **Expect:** Recognition continues even if writes start failing — `idbPut` swallows errors, so the in-memory store stays complete and the session works. After a reload some or all pages may be missing.
- **Watch:** The failure is completely silent; there is no "could not cache OCR" message. Note whether the reader gets any signal at all.

### OCR-090 - Shared `.annotated.html` does not carry OCR
**P1** * Edge * `src/app.js:2568 exportSelfContainedHTML()`, `src/app.js:3285 initBundleState()`

- **Pre:** **SCAN-A** OCR'd, with a couple of highlights made on OCR'd text. Export it via **"Share"** to a single `.html`.
- **Steps:**
  1. Open the exported `.html` in a second browser profile.
  2. Check whether text is selectable; wait 5 seconds for a banner.
  3. If offered, run OCR inside the read-only viewer.
  4. Dismiss the banner with ✕, then reload the file.
- **Expect:** The bundle carries the PDF bytes + notes only, so text is **not** selectable initially and the OCR banner is offered (the bundle doc carries `sha`, so a run caches under it). The existing highlight rectangles still draw correctly over the scan even without OCR. After ✕ and a reload the banner is offered **again** — `save()` is a no-op in read-only mode, so `ocrDismissed` never persists.
- **Watch:** In read-only mode the highlight tool is hidden but `idbPut` is *not* gated, so a shared file still writes `ocr:<sha>` to the viewer's IndexedDB. Confirm that is acceptable, and that the file still opens with no server and no network beyond the OCR CDN.

---

## 8. Find, highlighting and anchoring on OCR pages

### OCR-091 - Find finds a word that exists only in the scan
**P0** * Functional * `src/app.js:2956 findRun()`, `src/app.js:586 ensurePageText()`

- **Pre:** **SCAN-A**, OCR complete. Pick a distinctive single word visible on page 4.
- **Steps:**
  1. Press ⌘/Ctrl-F.
  2. Type the word.
- **Expect:** `#findCount` shows a real count (e.g. **"1 / 3"**), the reader jumps to page 4, and the word is marked with the orange current-match highlight (`mark.sh.cur`, `src/styles.css:128`) scrolled to the centre of the viewport.
- **Watch:** `ensurePageText` short-circuits to the OCR record *before* calling `getTextContent` (`src/app.js:590-591`). If that short-circuit is removed, find silently searches the empty native layer and every scan reports **"No results"**.

### OCR-092 - Find reports no results before OCR is run
**P0** * Functional * `src/app.js:2962-2972 findRun()`

- **Pre:** **SCAN-A**, banner dismissed, never OCR'd.
- **Steps:**
  1. ⌘/Ctrl-F and search a word clearly visible on the page.
- **Expect:** `#findCount` reads exactly **"No results"**.
- **Watch:** This is the "before" half of the OCR value proposition — capture it as the baseline for OCR-091 in the same test session.

### OCR-093 - Multi-word find: count vs. visible mark
**P1** * Functional * `src/app.js:2968`, `src/app.js:2992 findMarkPage()`

- **Pre:** **SCAN-A**, OCR complete. Pick a two-word phrase printed on one line of page 2.
- **Steps:**
  1. ⌘/Ctrl-F and type the full phrase.
  2. Read `#findCount` and look at the page.
- **Expect:** Report exactly what happens. `findRun` counts matches against the flat page text, so a count appears; `findMarkPage` walks `.textLayer span` nodes and requires a *single span* to contain the query. OCR spans hold **one word each**, so a two-word phrase produces a count with **no visible orange mark** on the page.
- **Watch:** This is the most likely user-visible OCR/find defect: the counter says "1 / 2" but the reader sees nothing highlighted and cannot tell where the match is. Native text pages are unaffected because PDF.js spans hold whole runs.

### OCR-094 - Find across an OCR line break
**P2** * Edge * `src/app.js:2967 findRun()`, `src/app.js:722 ocrOnePage()`

- **Pre:** **SCAN-A**, OCR complete. Find a phrase in the scan that is split across two printed lines.
- **Steps:**
  1. Search the phrase with a single space where the line break falls.
- **Expect:** Report the result. `findRun` does not normalise whitespace, and the OCR record's `text` keeps a real `\n` at the line break, so the phrase is **not** found (**"No results"**) even though it is plainly on the page. Native pages join items with `' '` and are unaffected.
- **Watch:** The AI's `ensureText` (`src/app.js:1387`) *does* normalise whitespace, so the same phrase is findable by the AI's `search_document` tool but not by the user's find bar — an inconsistency worth flagging.

### OCR-095 - Find works in continuous mode on OCR pages
**P1** * Functional * `src/app.js:2977 findGoto()`, `src/app.js:2955 findPageEl()`

- **Pre:** **SCAN-A**, OCR complete, continuous scroll ON.
- **Steps:**
  1. Search a single word that appears on pages 2, 5 and 8.
  2. Press Enter repeatedly to step through all matches, then Shift+Enter back.
- **Expect:** Each step scrolls the correct `.pg` into view and marks the right occurrence; the counter cycles **"1 / 3" → "2 / 3" → "3 / 3" → "1 / 3"**.
- **Watch:** `findGoto` waits a fixed 50 ms after the page change for the layer to exist. A page that has to be lazily rendered *and* have its OCR layer applied may need longer — if the mark is intermittently missing on the first Enter but present on the second, this timing is why.

### OCR-096 - Find during an active OCR run
**P2** * Edge * `src/app.js:2966 findRun()`, `src/app.js:775 runOcr()`

- **Pre:** **SCAN-BIG**, OCR running around page 4.
- **Steps:**
  1. Open find and search a word from page 2 (already OCR'd).
  2. Search a word from page 40 (not yet OCR'd).
  3. Wait for page 40 to be OCR'd, then repeat the second search.
- **Expect:** The page-2 word is found; the page-40 word initially gives **"No results"**; after the run reaches page 40 the same search finds it. No crash, and the running OCR is not disturbed.
- **Watch:** `findRun` iterates every page calling `ensurePageText`, which for non-OCR'd pages does a `getTextContent` — running that concurrently with recognition on a large document can noticeably slow both. Note any UI freeze.

### OCR-097 - Highlight a phrase on an OCR page
**P0** * Functional * `src/app.js:871 highlightSelection()`, `src/app.js:1101 drawHighlights()`

- **Pre:** **SCAN-A**, OCR complete, highlight tool active.
- **Steps:**
  1. Drag over a phrase on page 3.
- **Expect:** A yellow highlight box lands exactly over the printed words, a note appears in the right panel with the recognised text as its `selected_text`, and the toast **"Highlighted — drag more text, or pick another tool."** fires.
- **Watch:** Highlight rects come from `range.getClientRects()` against the text-layer box, so they are only as accurate as `buildOcrTextLayer`'s box scaling — a `scaleX` regression (OCR-054) shows up here as highlights drifting left of the words.

### OCR-098 - Highlights on OCR pages survive a reload
**P0** * State * `src/app.js:1101 drawHighlights()`, `src/app.js:607 loadOcrStore()`

- **Pre:** Three highlights made on OCR'd pages of **SCAN-A**.
- **Steps:**
  1. Hard-reload.
  2. Look at the highlighted pages; click each highlight box.
- **Expect:** All three boxes are in exactly the same place and clicking one selects its note. Rects are stored normalised, so they are independent of the OCR cache.
- **Watch:** Deliberately delete the `ocr:<sha>` key and reload — the highlight boxes must **still** draw in the right place (they do not depend on the text layer), even though nothing is selectable any more. Confirm this, since it is the recovery path if OCR ever regresses.

### OCR-099 - Note pins anchor correctly on OCR pages
**P1** * Functional * `src/app.js:1116 drawPins()`

- **Pre:** **SCAN-A** with a highlight-backed note on page 3.
- **Steps:**
  1. Look at the numbered pin next to the highlight.
  2. Collapse and expand the right panel; watch the connector line.
- **Expect:** The pin sits at the right edge of the first rect, at the rect's top; the connector line runs from the pin to the note card without dangling.
- **Watch:** Pins use `a.rects[0]`, which is OCR-independent — a pin in the wrong place means the *selection* geometry was wrong when the note was made, not the drawing.

### OCR-100 - Prefix / suffix context is captured on OCR pages
**P1** * Functional * `src/app.js:832-840 onTextSelect()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Highlight a phrase mid-paragraph on page 2.
  2. Export the notes as `.notes.json` (see `11-share-and-export.md`) and inspect that annotation's `prefix` and `suffix`.
- **Expect:** Both carry up to 32 characters of real surrounding text from the page (not empty), matched against the whitespace-normalised OCR page text.
- **Watch:** If the selection's text does not appear in `pt.text` — which happens when `buildOcrTextLayer`'s span order differs from Tesseract's `data.text` order (multi-column scans) — `idx` is `-1`, `prefix` is `""` and `suffix` is `""`. Check a two-column scan explicitly.

### OCR-101 - Section chip on an OCR page
**P2** * Edge * `src/app.js:804 sectionForIndex()`, `src/app.js:839 onTextSelect()`

- **Pre:** A scanned page containing a numbered heading (e.g. "3.2 Methods").
- **Steps:**
  1. Highlight a sentence *below* that heading.
  2. Read the note card's location line and the export sheet's "Page N · Section" label.
- **Expect:** The section reads the correct heading, or is blank — it must not name a heading that appears *later* on the page.
- **Watch:** `idx` is computed against the whitespace-**normalised** page text but is then passed into `sectionForIndex(pt.text, idx)`, which scans the **raw** text. OCR text contains newlines, so the two offsets diverge and the heuristic can pick the wrong heading. Blank is acceptable; wrong is a bug.

### OCR-102 - Highlighting on a mixed document uses the right layer per page
**P1** * Functional * `src/app.js:662 applyOcrLayer()`

- **Pre:** **SCAN-MIX**, OCR complete.
- **Steps:**
  1. Highlight a phrase on page 2 (native text).
  2. Highlight a phrase on page 6 (OCR'd).
  3. Compare the tightness of the two highlight boxes.
- **Expect:** Both land on their words. The native page's box is glyph-tight; the OCR page's box follows Tesseract's word boxes and may be a pixel or two looser — acceptable, but it must not be offset.
- **Watch:** `applyOcrLayer` returns immediately when there is no record for the page (`src/app.js:663`), so native pages inside a partly-OCR'd document keep the PDF.js layer untouched.

### OCR-103 - Screenshot capture is unaffected by OCR
**P2** * Regression * `src/app.js:1074`, `src/app.js:912 setTool()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Capture a figure region with the screenshot tool.
  2. Check the resulting note's thumbnail and its section label.
- **Expect:** The capture is a clean image of the scan (no selection artefacts, no text-layer overlay baked in — the capture reads the canvas). Its `section` comes from `sectionForIndex(pt.text, 0)`, which on an OCR page is the OCR text.
- **Watch:** If the text layer is ever drawn with a visible colour (OCR-059), the capture will contain doubled text.

### OCR-104 - Export packet renders OCR-derived quotes
**P2** * Functional * `src/app.js:2901`

- **Pre:** **SCAN-A** with two highlight notes on OCR'd pages.
- **Steps:**
  1. Open the export sheet.
- **Expect:** Both notes appear with their recognised quote text and `Page N` labels. OCR errors (a mis-recognised character) show through verbatim — that is expected; the packet must not be empty.
- **Watch:** An empty quote in the packet points back at OCR-055 (missing word spaces) or a `selected_text` that never got captured.

---

## 9. The AI on OCR pages

Requires the AI harness from `08-ai-and-agent.md` (a working provider key). Where a key is unavailable, verify only the request payload in the Network panel.

### OCR-105 - The AI can answer about a scanned page
**P0** * Functional * `src/app.js:586 ensurePageText()`, `src/app.js:1299 buildContext()`

- **Pre:** **SCAN-A**, OCR complete, a working provider configured.
- **Steps:**
  1. Highlight a sentence on page 3, choose **Ask AI**, and ask "What does this paragraph claim?".
  2. In the Network panel, open the `/api/ai` request body.
- **Expect:** A substantive answer. The payload's context contains the OCR text of the page (the `[SELECTION]` marker with ~450 characters each side), not an empty string.
- **Watch:** `buildContext` reads `pageTextCache[a.page].text`, which `applyOcrLayer` / `applyOcrToRendered` / the post-run refresh all set to the OCR text. If any of those three paths is dropped, the AI receives an empty page and answers from the quoted sentence alone — which looks plausible but is wrong.

### OCR-106 - Before OCR, the AI is told the page is empty
**P1** * Functional * `src/app.js:1299 buildContext()`

- **Pre:** **SCAN-A**, never OCR'd.
- **Steps:**
  1. Create a document-level note (or a comment pin) on page 3 and ask a question about the page content.
  2. Inspect the `/api/ai` payload.
- **Expect:** `surrounding` is empty or near-empty. The answer should not fabricate page content — record what the model actually does.
- **Watch:** This is the "why OCR matters" comparison; run it back-to-back with OCR-105 on the same page.

### OCR-107 - `read_page` returns OCR text
**P1** * Functional * `src/app.js:1431 runAgentTool()`, `src/app.js:1387 ensureText()`

- **Pre:** **SCAN-A**, OCR complete, agent tools enabled.
- **Steps:**
  1. Ask a question that forces a page read ("summarise page 7").
  2. Watch the tool chips and the network payloads.
- **Expect:** The chip **"Reading a page…"** appears and the tool result contains OCR text from page 7, whitespace-normalised and capped at 4500 characters.
- **Watch:** `ensureText` normalises whitespace, so OCR newlines are flattened here — this is why the agent can find cross-line phrases the find bar cannot (OCR-094).

### OCR-108 - `search_document` searches OCR text
**P1** * Functional * `src/app.js:1388 agentSearch()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Ask a question whose answer is only on a page you have never visited.
- **Expect:** The chip **"Searching the document…"** appears; the answer cites content from that page. `agentSearch` walks every page through `ensureText`, which hits the OCR store.
- **Watch:** `agentSearch` stops at 8 hits; on a long scan with OCR noise the hits may cluster on early pages. Not a bug, but note if answers are consistently shallow.

### OCR-109 - `read_full_document` includes OCR pages
**P2** * Functional * `src/app.js:1434 runAgentTool()`

- **Pre:** **SCAN-A**, OCR complete.
- **Steps:**
  1. Ask for a summary of the whole paper; watch for the chip **"Reading the full paper…"**.
- **Expect:** The tool result concatenates `[Page N]` blocks containing OCR text, truncating past ~48 000 characters with `[…truncated…]`.
- **Watch:** OCR text is noisier and often longer than native text (stray characters from page furniture), so a scan hits the truncation cap earlier than a native PDF of the same length.

### OCR-110 - Only pages that finished OCR are visible to the AI
**P1** * State * `src/app.js:786-790 runOcr()`

- **Pre:** **SCAN-BIG**, OCR stopped after 3 pages.
- **Steps:**
  1. Ask a question about page 2 (done) and then about page 50 (not done).
- **Expect:** The page-2 question is answered from real content; the page-50 question gets nothing useful (the payload's page text is empty). The post-run refresh loop populates `pageTextCache` for exactly the pages in `store.pages`.
- **Watch:** The refresh loop sets `vp: null` for pages that were never rendered (`src/app.js:787`). Nothing in the AI path uses `vp`, but a future feature that does will get a null viewport for those pages.

### OCR-111 - Nothing from the scan is uploaded during recognition
**P0** * Functional * `src/app.js:707 ocrOnePage()`

- **Pre:** **SCAN-A**, never OCR'd. Network panel open, **no filter**, "Preserve log" ON.
- **Steps:**
  1. Click **"Run OCR"** and let the whole run complete.
  2. Review every request made during the run, including their sizes and methods.
- **Expect:** Only the four third-party GETs from OCR-031 (code, worker, wasm core, language data). **No POST anywhere**, no request to `/api/ai`, no upload of canvas data, no request whose body carries image bytes. Recognition happens in a web worker on the local canvas.
- **Watch:** This is the load-bearing claim on the marketing page ("runs **entirely in your browser** — your file is never uploaded", `features.html:165`) and in `README.md:31`. Any regression here is a privacy incident, not a bug — re-run this check after every change to `ocrOnePage` or `createTesseractWorker`.

---

## 10. Privacy, offline and failure modes

### OCR-112 - No OCR request is made for readers who never open a scan
**P0** * Functional * `src/app.js:680 ensureTesseract()`

- **Pre:** Fresh profile, Network panel, "Preserve log" ON.
- **Steps:**
  1. Use the app normally for several minutes on the bundled sample: page, zoom, highlight, comment, open settings.
- **Expect:** Zero requests to `cdn.jsdelivr.net` or `tessdata.projectnaptha.com`.
- **Watch:** A speculative preload added "for performance" would send every visitor's browser to two extra third-party hosts, which contradicts the privacy story in `13-security-and-privacy.md`.

### OCR-113 - Error toast prefix is exact
**P0** * Copy * `src/app.js:779 runOcr()`

- **Pre:** Any induced OCR failure (OCR-032 or OCR-035).
- **Steps:**
  1. Read the toast carefully.
- **Expect:** It begins with exactly **"OCR could not run: "** (space after the colon) followed by the error message. It uses the red `err` toast style and the longer 6-second timing.
- **Watch:** `toast` escapes its message (`src/app.js:30`), so an error containing `<` renders as text — confirm no raw HTML ever lands in the toast.

### OCR-114 - A failure leaves the app fully usable
**P0** * Error * `src/app.js:778-784 runOcr()`

- **Pre:** After the failure in OCR-032, same tab.
- **Steps:**
  1. Page forward and back, zoom, toggle continuous scroll, open the notes panel, capture a screenshot region, open and close find.
- **Expect:** Everything works. The banner is gone, no ghost progress message remains, and `ocrRunning` has cleared (verified indirectly: switch documents and back and confirm the OCR banner can be offered again).
- **Watch:** `ocrRunning = false` lives in `finally`; if an early `return` is ever added above it, the flag sticks true for the tab's lifetime and OCR becomes permanently unavailable with no error message.

### OCR-115 - Slow network shows progress, not a hang
**P1** * Edge * `src/app.js:758 runOcr()`

- **Pre:** **SCAN-A**, DevTools → Network → "Slow 4G".
- **Steps:**
  1. Click **"Run OCR"** and watch the banner and the Network panel.
- **Expect:** The banner sits on **"Loading the OCR engine…"** while the ~4 MB of engine + language data downloads (potentially a minute), then switches to page progress. The **"Stop"** button is available throughout.
- **Watch:** There is no download percentage — a reader on a slow link sees a static message for a long time. Note whether Stop actually ends the wait (it does not: `ensureTesseract` is awaited before the cancel flag is ever tested).

### OCR-116 - Network drops mid-run
**P1** * Edge * `src/app.js:772-777 runOcr()`

- **Pre:** **SCAN-BIG**, OCR running past page 3.
- **Steps:**
  1. Set Network to **Offline**.
  2. Watch for 60 seconds.
- **Expect:** Recognition continues — the engine, wasm core and language data are already in the worker, so no further network is needed. Pages keep completing and keep being cached.
- **Watch:** If the run stalls when the network drops, something in the recognition loop is still fetching per page, which would also mean per-page data is leaving the machine.

### OCR-117 - Firefox: the full OCR path works
**P0** * Functional * `src/app.js:753 runOcr()` * Firefox/Safari only

- **Pre:** Firefox (latest), **SCAN-A**.
- **Steps:**
  1. Open SCAN-A, accept OCR, let it complete, then select, highlight and find.
- **Expect:** Identical behaviour to Chromium — detection, banner, progress, completion toast, selection geometry, find, caching, and survival across reload. OCR uses no File System Access API, so there is **no Chromium-only fallback here**.
- **Watch:** Firefox's IndexedDB in a private window is ephemeral, so the cache will not survive a reload there — test in a normal window.

### OCR-118 - Safari: the full OCR path works
**P1** * Functional * `src/app.js:753 runOcr()` * Firefox/Safari only

- **Pre:** Safari (macOS, latest), **SCAN-A**.
- **Steps:**
  1. Open SCAN-A, accept OCR, let it complete, then select, highlight and find.
  2. Confirm the `ocr:` key in Web Inspector → Storage → Indexed Databases.
- **Expect:** Same results as Chromium. Selection geometry in particular must match — Safari's `getClientRects` on transformed inline elements has historically differed.
- **Watch:** Safari evicts IndexedDB for origins unused for 7 days. A returning reader may find a document they OCR'd last week offering OCR again — expected, but worth confirming the offer still works rather than showing a half-loaded layer.

### OCR-119 - Mobile Safari / Chrome on a phone
**P2** * Perf * `src/app.js:707 ocrOnePage()` * Firefox/Safari only

- **Pre:** A real phone (or the device toolbar plus 4× CPU throttling), **SCAN-A**.
- **Steps:**
  1. Open SCAN-A, accept OCR, and watch memory and responsiveness for 3–4 pages.
- **Expect:** The run completes, the banner remains readable and its buttons tappable (OCR-024), and the tab is not killed by the OS.
- **Watch:** A ~2000px canvas plus the wasm core is heavy for a phone. If the tab reloads mid-run, verify the pages already cached are still there afterwards (OCR-074) — that incremental save is what makes OCR survivable on mobile.

---

## 11. Edge cases, performance and regressions

### OCR-120 - Non-English scan completes without crashing
**P2** * Edge * `src/app.js:694 createTesseractWorker()`

- **Pre:** **SCAN-NONEN**.
- **Steps:**
  1. Open it (it should be detected as scanned), run OCR to completion.
  2. Select a line and copy it.
- **Expect:** The run completes with a normal completion toast. Recognised text is largely wrong — the worker is created with the `'eng'` language only. Selection geometry is still usable because word boxes are still found.
- **Watch:** Record this as a known limitation, not a defect. Watch for the failure mode where zero words are returned on every page: the toast then claims N pages are "searchable & highlightable" while nothing is selectable.

### OCR-121 - The pre-scan on a large document is slow but bounded
**P1** * Perf * `src/app.js:770-771 runOcr()`

- **Pre:** **SCAN-BIG** (100+ pages).
- **Steps:**
  1. Click **"Run OCR"** and time how long the banner stays on **"Loading the OCR engine…"** after the network requests have finished.
- **Expect:** The gap is the `todo` scan, which calls `ensureText` + `getOperatorList` for all 100+ pages. It should complete in tens of seconds, not minutes, and the reader must remain scrollable throughout.
- **Watch:** There is no progress message for this phase — a reader cannot distinguish "scanning pages" from "stuck". If the gap exceeds ~30 s on a 100-page file, file it as a UX defect.

### OCR-122 - Memory during a long run
**P1** * Perf * `src/app.js:712-717 ocrOnePage()`

- **Pre:** **SCAN-BIG**, browser task manager open.
- **Steps:**
  1. Run OCR for 20+ pages and watch the tab's memory.
- **Expect:** Memory rises to a plateau and stays roughly flat — one canvas is created per page and dropped when the function returns; only the compact `{text, words}` records accumulate.
- **Watch:** A monotonic climb of tens of MB per page means canvases are being retained (e.g. cached "for re-use"). On a 300-page scan that ends in a tab crash mid-run.

### OCR-123 - Two tabs OCR-ing the same document
**P2** * Edge * `src/app.js:775 runOcr()`, `src/app.js:607 loadOcrStore()`

- **Pre:** **SCAN-A** open in two tabs of the same profile.
- **Steps:**
  1. Start OCR in tab A; while it runs, dismiss and re-offer in tab B and start OCR there too.
  2. Let both finish, then reload a third tab on the same document.
- **Expect:** No crash and no corrupt record — both tabs write whole `{pages:{…}}` objects under the same key, so the last writer wins. The reloaded tab shows a complete, self-consistent set of pages.
- **Watch:** Because each tab writes its **entire in-memory store**, the loser's pages can be erased. Confirm the surviving record covers all pages that the user saw complete; if it does not, the "last write wins" model needs a merge.

### OCR-124 - Duplicate-open of a scanned PDF reuses its OCR
**P1** * Regression * `src/app.js:231-239 openPdfFile()`

- **Pre:** **SCAN-A** already in the library and OCR'd.
- **Steps:**
  1. Open the same file again through **"New"**.
- **Expect:** The re-attach toast **"Reopened <name> — same paper, your notes are here."**, no duplicate library entry, no OCR banner, and text selectable immediately.
- **Watch:** A duplicate library entry would carry the same `sha`, so both entries would share the same `ocr:<sha>` cache — the visible symptom is the *library*, not OCR, but this check catches it early.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `ocrStore` / `ocrRunning` / `ocrCancel` `src/app.js:603-604` | OCR-009, OCR-011, OCR-071, OCR-072, OCR-073, OCR-083, OCR-114 |
| `TESS_VER` `src/app.js:605` | OCR-030, OCR-031 |
| `ocrRec()` `src/app.js:606` | OCR-044, OCR-091, OCR-102 |
| `loadOcrStore()` `src/app.js:607` | OCR-009, OCR-081, OCR-082, OCR-083, OCR-084, OCR-085, OCR-123 |
| `pageImageCoverage()` `src/app.js:615` | OCR-005, OCR-006, OCR-007 |
| `pageNeedsOcr()` `src/app.js:637` | OCR-002, OCR-004, OCR-005, OCR-008, OCR-013, OCR-041 |
| `buildOcrTextLayer()` `src/app.js:644` | OCR-054, OCR-055, OCR-056, OCR-058, OCR-059, OCR-060, OCR-066, OCR-097, OCR-100 |
| `applyOcrLayer()` `src/app.js:662` | OCR-044, OCR-060, OCR-063, OCR-064, OCR-081, OCR-102, OCR-105 |
| `applyOcrToRendered()` `src/app.js:669` | OCR-042, OCR-043, OCR-061, OCR-105 |
| `ensureTesseract()` `src/app.js:680` | OCR-030, OCR-032, OCR-033, OCR-034, OCR-035, OCR-036, OCR-039, OCR-112, OCR-115 |
| `createTesseractWorker()` `src/app.js:693` | OCR-031, OCR-037, OCR-038, OCR-120 |
| `ocrCollectWords()` `src/app.js:701` | OCR-049, OCR-051, OCR-056 |
| `ocrOnePage()` `src/app.js:707` | OCR-045, OCR-046, OCR-047, OCR-048, OCR-049, OCR-050, OCR-062, OCR-111, OCR-119, OCR-122 |
| `OCR_ICON` `src/app.js:724` | OCR-018 |
| `detectAndOfferOcr()` `src/app.js:725` | OCR-001, OCR-002, OCR-003, OCR-004, OCR-009, OCR-010, OCR-011, OCR-012, OCR-013, OCR-014, OCR-070, OCR-078 |
| `restackBanners()` `src/app.js:737` | OCR-022, OCR-027 |
| `showOcrBanner()` `src/app.js:741` | OCR-015, OCR-016, OCR-017, OCR-018, OCR-019, OCR-020, OCR-021, OCR-026, OCR-027, OCR-028 |
| `runOcr()` `src/app.js:753` | OCR-025, OCR-032, OCR-040, OCR-041, OCR-042, OCR-047, OCR-052, OCR-053, OCR-067, OCR-068, OCR-069, OCR-072, OCR-073, OCR-074, OCR-075, OCR-076, OCR-080, OCR-110, OCR-113, OCR-114, OCR-116, OCR-117, OCR-118, OCR-121, OCR-123 |
| `ensurePageText()` `src/app.js:586-595` | OCR-044, OCR-091, OCR-092, OCR-096, OCR-105 |
| `ensureText()` `src/app.js:1387` | OCR-094, OCR-107, OCR-108 |
| `switchDoc()` OCR hooks `src/app.js:206`, `:214`, `:217` | OCR-001, OCR-029, OCR-071, OCR-072, OCR-077, OCR-078 |
| `boot()` OCR hooks `src/app.js:3333`, `:3352` | OCR-014, OCR-081 |
| `renderPage()` → `applyOcrLayer` `src/app.js:482` | OCR-044, OCR-060, OCR-064 |
| `renderInto()` → `applyOcrLayer` `src/app.js:514` | OCR-043, OCR-044, OCR-095 |
| `onTextSelect()` `src/app.js:813` | OCR-057, OCR-100, OCR-101 |
| `sectionForIndex()` `src/app.js:804` | OCR-101, OCR-103 |
| `highlightSelection()` `src/app.js:871` | OCR-097 |
| `drawHighlights()` / `drawPins()` `src/app.js:1101`, `:1116` | OCR-097, OCR-098, OCR-099 |
| `buildContext()` `src/app.js:1299` | OCR-105, OCR-106 |
| `runAgentTool()` / `agentSearch()` `src/app.js:1388`, `:1428` | OCR-107, OCR-108, OCR-109 |
| `findRun()` / `findGoto()` / `findMarkPage()` / `clearFindMarks()` `src/app.js:2951-3006` | OCR-065, OCR-091, OCR-092, OCR-093, OCR-094, OCR-095, OCR-096 |
| `idbOpen()` / `idbPut()` / `idbGet()` `src/app.js:123-143` | OCR-079, OCR-080, OCR-086, OCR-087, OCR-088, OCR-089 |
| `openPdfFile()` SHA re-attach `src/app.js:227-239` | OCR-082, OCR-124 |
| `exportSelfContainedHTML()` / `initBundleState()` `src/app.js:2553`, `:3283` | OCR-090 |
| Export sheet rows `src/app.js:2901` | OCR-104 |
| `.top-banner` / `.tb-ic` / `.tb-msg` / `.tb-act` / `.tb-x` `src/styles.css:657-670` | OCR-018, OCR-020, OCR-021, OCR-022, OCR-024, OCR-067 |
| `.top-banner.ocr .tb-msg` `src/styles.css:665` | OCR-023, OCR-024 |
| `.textLayer > span` `src/styles.css:123` | OCR-059 |
| `.textLayer mark.sh` / `mark.sh.cur` `src/styles.css:127-128` | OCR-091, OCR-093 |
| **"This looks like a scanned PDF — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?"** | OCR-001, OCR-015 |
| **"Run OCR"** | OCR-016, OCR-025, OCR-026 |
| **"Dismiss"** (aria-label) / **"✕"** | OCR-017, OCR-026 |
| **"Loading the OCR engine…"** | OCR-039, OCR-076, OCR-115, OCR-121 |
| **"Reading text… page N of M"** | OCR-040, OCR-041 |
| **"Finishing current page…"** | OCR-068, OCR-076 |
| **"Stop"** | OCR-017, OCR-067, OCR-068 |
| **"OCR could not run: "** | OCR-032, OCR-034, OCR-035, OCR-113 |
| **"OCR stopped — N page(s) done."** | OCR-068 |
| **"OCR complete — N page(s) now searchable & highlightable."** | OCR-008, OCR-052, OCR-053, OCR-120 |
| **"No results"** (find) | OCR-083, OCR-092, OCR-094 |
| IndexedDB key `ocr:<sha>` | OCR-072, OCR-079, OCR-080, OCR-084, OCR-085, OCR-087, OCR-088, OCR-090, OCR-123 |
| `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/…` | OCR-030, OCR-031, OCR-032, OCR-111, OCR-112 |
| `https://tessdata.projectnaptha.com/4.0.0` | OCR-031, OCR-035, OCR-111, OCR-112 |

## Deliberately not covered here

- The **"Have notes for X? Open its .notes.json to load them."** banner, `showNotesBanner` and `openNotesFileFor` — covered in `10-storage-and-persistence.md`; only its co-existence with the OCR banner (`restackBanners`) is checked here (OCR-022, OCR-027).
- PDF.js worker bootstrap, canvas rendering, `outputScale`, zoom controls, continuous-mode `IntersectionObserver` lazy rendering and the find bar's own UI (open/close/step/counter chrome) — covered in `05-reader-and-navigation.md`. This document only checks what OCR changes about them.
- Selection popover buttons, note creation, pins, connectors and the notes panel — covered in `06-annotation-tools.md` and `07-notes-panel.md`.
- Provider configuration, prompts, models, streaming, tool chips and AI error copy — covered in `08-ai-and-agent.md`. Section 9 here only checks that OCR text reaches the AI.
- SHA-256 computation, library de-duplication, trash/restore and document removal — covered in `04-document-lifecycle.md`.
- `.notes.json` import/export and the exported `.annotated.html` round trip in general — covered in `11-share-and-export.md`; only the OCR-specific consequence is checked here (OCR-090).
- Landing-page and features-page OCR marketing copy (`features.html:162-168`, `index.html:322-326`) — covered in `01-landing-page.md` and `02-features-page.md`.
- Storage-quota behaviour and large-document performance budgets in general — covered in `17-performance-and-limits.md`.
- Screen-reader and keyboard-navigation conformance of the banner beyond `role="status"` and the Stop/`aria-label` mismatch — covered in `15-accessibility.md`.
