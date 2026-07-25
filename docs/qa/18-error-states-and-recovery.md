# 18 - Error states, failure modes & recovery

> Every way PairedX can fail — a corrupt file, a denied permission, an exhausted quota, a blocked CDN, a dead network, a full disk — and proof that each one produces an accurate, actionable, non-blaming message and leaves the app usable without a reload.

| | |
|---|---|
| **ID prefix** | ERR |
| **Scope** | The `toast(msg,'err')` surface and every one of its ~35 call sites, `errHint()`, `showReaderFallback()`, `showEmptyReader()`, `confirmDialog()` dismissal, every `try/catch` in the file-open / import / export / storage / AI / OCR paths, the three-tier PDF.js worker fallback and the 7s boot race, File System Access permission denial and revocation, on-demand CDN loads (Tesseract, MathJax), and the error bodies returned by `api/ai.js` + `api/ai-image.js`. |
| **Primary code** | `src/app.js:29 toast()`, `src/app.js:1594 errHint()`, `src/app.js:3180 showReaderFallback()`, `src/app.js:3197 showEmptyReader()`, `src/app.js:2176 confirmDialog()`, `src/app.js:151 save()`, `src/app.js:410 setupWorker()`, `src/app.js:3303 boot()`, `api/ai.js`, `api/ai-image.js`, `src/styles.css:355-360,453-455,657-670` |
| **Checks** | 110 |

## Contents
- [1. Fixtures and failure injection](#1-fixtures-and-failure-injection) - 4 checks
- [2. The toast surface itself](#2-the-toast-surface-itself) - 6 checks
- [3. Boot, the PDF.js worker and the engine fallback](#3-boot-the-pdfjs-worker-and-the-engine-fallback) - 9 checks
- [4. Opening documents and files](#4-opening-documents-and-files) - 12 checks
- [5. Browser storage failures](#5-browser-storage-failures) - 7 checks
- [6. File System Access: folder sync and permissions](#6-file-system-access-folder-sync-and-permissions) - 9 checks
- [7. Save As, download and self-contained export](#7-save-as-download-and-self-contained-export) - 9 checks
- [8. Notes and prompt import failures](#8-notes-and-prompt-import-failures) - 6 checks
- [9. AI failures in the browser](#9-ai-failures-in-the-browser) - 15 checks
- [10. AI proxy error responses](#10-ai-proxy-error-responses) - 13 checks
- [11. OCR and CDN-dependent features](#11-ocr-and-cdn-dependent-features) - 8 checks
- [12. Small guarded paths and degraded tools](#12-small-guarded-paths-and-degraded-tools) - 6 checks
- [13. Empty states that must not read as errors](#13-empty-states-that-must-not-read-as-errors) - 3 checks
- [14. Recovery sweep](#14-recovery-sweep) - 3 checks

---

## 1. Fixtures and failure injection

These four are setup. Everything after them assumes you have them ready. Do not skip them — most of this document is unreproducible without them.

### ERR-001 - Build the malformed-file fixture set
**P0** * Functional * `src/app.js:255 openFiles()`

- **Pre:** A terminal and a text editor. Keep the results in `qa-fixtures/` outside the repo.
- **Steps:**
  1. `printf '' > empty.pdf` — a 0-byte file with a `.pdf` extension.
  2. `printf 'this is not a pdf at all\n' > notapdf.pdf` — plain text renamed `.pdf`.
  3. Copy any real PDF to `truncated.pdf`, then chop it: `head -c 4096 real.pdf > truncated.pdf`.
  4. Take a valid `.notes.json` export and delete the last 200 bytes → `truncated.notes.json`.
  5. `printf '{"app":"x","annotations":"not-an-array"}' > wrongshape.notes.json`.
  6. `printf '<html><body>hello</body></html>' > plain.html`.
  7. Export a real `.annotated.html` (sidebar → **Share as HTML**), copy it to `halfbundle.html`, and delete everything after the `window.__PAIR_BUNDLE__={` opening so the `;</script>` terminator is gone.
  8. Take that same export, copy to `nopdf.html`, and in an editor replace `"pdfB64":"` … `"` with `"pdfB64":""`.
  9. Grab any `.docx` / `.png` / `.zip` for the "unsupported type" checks.
- **Expect:** Nine fixture files exist. Each one is a distinct failure path in `openFiles()` / `importSharedHTML()` / `attachNotesFile()`.
- **Watch:** Testers "helpfully" fix the fixtures (re-adding a valid JSON tail, re-zipping the PDF). A fixture that parses is not a fixture. Verify with `python3 -c "import json;json.load(open('truncated.notes.json'))"` — it must raise.

### ERR-002 - Build the opaque-origin sandbox harness
**P1** * Edge * `src/app.js:74 loadState()` / `src/app.js:123 idbOpen()`

- **Pre:** The repo served locally (`python3 -m http.server 8765` from the repo root).
- **Steps:**
  1. In the repo root create `qa-sandbox.html` containing exactly:
     `<iframe sandbox="allow-scripts" src="/app.html" style="border:0;width:100%;height:100vh"></iframe>`
  2. Open `http://localhost:8765/qa-sandbox.html`.
- **Expect:** The app boots inside an **opaque origin**: `localStorage` and `indexedDB` both throw, and blob-URL workers are refused. This is the exact condition `showReaderFallback()` was written for (`src/app.js:3191` — "embedded, sandboxed preview"). The page must still render the shell, the notes panel and the export view; only the PDF canvas is replaced by the fallback card.
- **Watch:** People add `allow-same-origin` to "make it work" — that defeats the whole fixture. The sandbox attribute must be `allow-scripts` and nothing else. Also delete `qa-sandbox.html` before committing; it is a test harness, not a product file.

### ERR-003 - Learn the four failure-injection controls
**P0** * Functional * `src/app.js:680 ensureTesseract()` / `src/app.js:2051 ensureMathJax()`

- **Pre:** Chrome DevTools open on `/app.html`.
- **Steps:**
  1. **Block a CDN:** DevTools → **Network** → ⋮ → **More tools** → **Network request blocking** → enable → add patterns `*cdn.jsdelivr.net*`, `*cdnjs.cloudflare.com*`, `*tessdata.projectnaptha.com*`, `*fonts.googleapis.com*`. Toggle each independently — they gate different features.
  2. **Go offline:** Network → throttling dropdown → **Offline**. Also learn **Slow 3G** for the timeout checks.
  3. **Reset a File System Access grant:** click the icon left of the URL → **Site settings** → reset **File editing** → reload.
  4. **Fill localStorage:** in the console run
     `try{const s='x'.repeat(1048576);for(let i=0;i<10;i++)localStorage.setItem('qa_fill_'+i,s)}catch(e){console.log('filled at',e.name)}`
     and remember the cleanup: `Object.keys(localStorage).filter(k=>k.startsWith('qa_fill_')).forEach(k=>localStorage.removeItem(k))`.
- **Expect:** All four controls work and are reversible. Every "reproduce by" instruction later in this document refers to one of them by name.
- **Watch:** Network request blocking persists across reloads and across tabs of the same profile, and DevTools does **not** show a banner for it. Testers then spend an hour reporting "MathJax is broken" on a later run. Clear the block list explicitly when you finish a section.

### ERR-004 - Baseline: a clean run shows no error UI at all
**P0** * Regression * `src/app.js:29 toast()`

- **Pre:** Full state reset (00 §6.1). Online. No CDN blocks. Chrome desktop, 1440×900.
- **Steps:**
  1. Load `/app.html` and wait 15 seconds without touching anything.
  2. Watch the toast area (bottom-centre) and the reader for the whole 15 seconds.
- **Expect:** The sample PDF renders. **Zero** toasts of any kind. No `#readerFallback` card. No `.top-banner`. The console has no uncaught errors. Storage reads something like `"12 MB of 60 GB"` (or `"1 documents"` where `navigator.storage.estimate` is unavailable), never `"Calculating…"` left permanently.
- **Watch:** A stale `srw_state_v1` from a previous run pointing at a doc whose IndexedDB bytes were cleared → `"Could not load “…”. Re-open it with New."` on a supposedly clean run. If you see that, you did not reset. Also: an error toast that appears at ~7s is the boot race (ERR-011), not a fluke.

---

## 2. The toast surface itself

### ERR-005 - Error toast: colour, width, and its 6-second lifetime
**P0** * Visual * `src/app.js:29 toast()` / `src/styles.css:355-360`

- **Pre:** App open, DevTools console available.
- **Steps:**
  1. In the console, force one: `document.querySelector('#toasts')` must exist first. Then trigger a real one — drag `wrongshape.notes.json` (ERR-001) onto the reader.
  2. Start a stopwatch the moment the toast appears.
- **Expect:** A dark-red toast (`.toast.err` → `background:#7F1D1D`, white text, 10px radius, `max-width:520px`) at the bottom centre, ~18px from the bottom. It begins fading (`opacity:0`, `transition:opacity .4s`) at **6.0s** and is removed from the DOM at **6.5s** (`src/app.js:32-33`). Success toasts use the darker `#0B0F19` and fade at 3.2s / removed at 3.7s.
- **Watch:** Someone "unifies" the timings and error toasts start vanishing in 3.2s — a 90-character provider error is unreadable in that window. The 6s/3.2s split is deliberate. Also watch for the toast never being removed (only faded) — `#toasts` is a real element and an invisible pile of them will swallow clicks at the bottom of the screen.

### ERR-006 - Success and error toasts are visually distinguishable at a glance
**P1** * Visual * `src/app.js:29 toast()` / `src/styles.css:358-360`

- **Pre:** A document with at least one note.
- **Steps:**
  1. Press the **Save notes** button in the notes header and complete the save → a success toast.
  2. Immediately drag `wrongshape.notes.json` onto the reader → an error toast.
- **Expect:** Success is near-black `#0B0F19`; error is dark red `#7F1D1D`. Both white text, same radius, same position. A tester must be able to tell them apart without reading the words.
- **Watch:** `toast(msg)` called with no second argument for something that *is* a failure — e.g. `src/app.js:2755` passes `'err'` only when `n` is 0, and `src/app.js:2636` (`"No notes to delete for this document."`) is deliberately **not** an error. Confirm those two read correctly: "no prompts matched" is red, "no notes to delete" is not.

### ERR-007 - Toast text is escaped, so a hostile filename cannot break the toast
**P1** * Security * `src/app.js:30` (`esc(msg)`)

- **Pre:** A file named exactly `a<b>c"d.notes.json` containing `{"annotations":"nope"}`. (Create with `printf '{"annotations":"nope"}' > 'a<b>c"d.notes.json'`.)
- **Steps:**
  1. Drag it onto the reader.
- **Expect:** The toast reads `“a<b>c"d.notes.json” has no notes to import.` with the angle brackets and the quote shown **literally as text**. No bold, no missing characters, no broken markup, nothing in the console.
- **Watch:** A refactor that swaps `el(\`<div class="toast">${esc(msg)}</div>\`)` for `innerHTML = msg`. The tell is that `<b>` disappears from the visible string instead of rendering as four characters.

### ERR-008 - Many simultaneous errors stack instead of overwriting
**P1** * Edge * `src/app.js:255 openFiles()` / `src/styles.css:356-357`

- **Pre:** `empty.pdf`, `notapdf.pdf`, `truncated.pdf`, `plain.html`, `wrongshape.notes.json` from ERR-001.
- **Steps:**
  1. Select all five in one file-picker gesture (**Open PDF or bundle**) and open them together.
- **Expect:** `#toasts` is a flex column with `gap:8px`, so the messages stack upward from the bottom, newest at the bottom, each independently timed. Nothing is silently dropped — every failing file produces its own named message. The stack must not scroll the page or push the layout.
- **Watch:** Five 3-line toasts at 390px width will reach the top of the screen and cover the reader toolbar. That is a P2 finding, but it must be *filed*, not shrugged at. Also watch that a later toast does not replace an earlier one — regressions here silently hide which of five files actually failed.

### ERR-009 - A very long provider error still dismisses and does not trap clicks
**P2** * Edge * `src/app.js:29 toast()`

- **Pre:** Settings → AI & Tools → OpenAI-compatible: base URL `https://api.openai.com/v1`, a key of `sk-` + 3000 `x` characters. Set it Default. Save.
- **Steps:**
  1. Select text in the PDF → **✦ Ask AI** → type `why?` → send.
  2. When the toast appears, immediately try to click whatever it overlaps (the notes composer on desktop).
- **Expect:** The toast wraps at `max-width:520px` and grows vertically. It still disappears at 6.5s. After it disappears the element underneath is clickable again.
- **Watch:** `#toasts` has no `pointer-events:none`, so a tall toast genuinely blocks clicks on the notes composer for 6.5 seconds. Verify that it *does* clear; a toast that never leaves the DOM permanently disables the composer.

### ERR-010 - On a phone the toast clears the floating tools bar
**P1** * Visual * `src/styles.css:584` (`#toasts{bottom:calc(84px + env(safe-area-inset-bottom))}`)

- **Pre:** Viewport 390×844 (or a real iPhone). At this width `.tools` floats at the bottom of the reader (`src/styles.css:576-582`).
- **Steps:**
  1. Trigger any error toast (drag `wrongshape.notes.json` in, or tap **Save notes** with the picker cancelled).
  2. While the toast is visible, tap each of the four tool buttons.
- **Expect:** The toast sits **above** the tools bar — its bottom edge is 84px + the safe-area inset. All four tools remain tappable while the toast is up.
- **Watch:** Testing this in a desktop responsive emulator understates it: `env(safe-area-inset-bottom)` is 0 there and 34px on a notched iPhone. Check on real hardware. The failure looks like "the highlight tool doesn't respond after an error".

---

## 3. Boot, the PDF.js worker and the engine fallback

### ERR-011 - The 7-second boot race produces the reader fallback card
**P0** * Functional * `src/app.js:3341-3345 boot()` / `src/app.js:3180 showReaderFallback()`

- **Pre:** The sandbox harness from ERR-002.
- **Steps:**
  1. Open `http://localhost:8765/qa-sandbox.html`.
  2. Wait past 7 seconds.
- **Expect:** The page canvas is replaced by a centred white card (`#readerFallback .fb-card`) reading, verbatim:
  - Heading: `"Open this file directly to read the PDF"`
  - Body 1: `"The PDF engine and live AI calls can't run inside this embedded, sandboxed preview. Download the HTML file and open it in your browser (double-click it) to get the full reader, highlighting, screenshots, and live “Ask AI”."` (with **Download the HTML file and open it in your browser** and **New** bolded)
  - Body 2: `"Everything else is live right now — explore the source-linked notes, provenance chips, filters, and the export packet on the right. You can also use New to open your own PDF once running locally."`
  The notes panel, filters, search and **Export annotations to PDF** must all still work.
- **Watch:** Regressions replace `#pageWrap` instead of hiding it. The comment at `src/app.js:3181-3183` exists because destroying `#pageWrap` nulls `#overlay`/`#pins` and crashes `drawHighlights()`/`drawPins()` on the next render. Verify `document.getElementById('pageWrap')` still exists and has `style.display === 'none'`.

### ERR-012 - The engine note line names the actual cause
**P1** * Copy * `src/app.js:3193` / `src/app.js:3343`

- **Pre:** As ERR-011.
- **Steps:**
  1. Read the small grey line at the bottom of the fallback card.
- **Expect:** `Engine note: PDF engine did not start — likely a sandboxed preview. Open the downloaded file directly.` — the prefix `"Engine note: "` followed by the timeout's own message verbatim.
- **Watch:** The `msg` argument is optional (`${msg ? … : ''}`). A boot path that calls `showReaderFallback()` with no argument leaves the user with a generic card and no clue which of the two causes (timeout vs. invalid PDF) applied. Compare with ERR-024, where the message must instead be `"Could not open “…” — it may not be a valid PDF."`.

### ERR-013 - A late-arriving PDF clears the fallback without a reload
**P1** * State * `src/app.js:460` / `src/app.js:522`

- **Pre:** A large PDF (100+ pages, >20 MB) in the library and set active. DevTools → **Slow 3G** *and* CPU throttling ×6 so `initPdf` takes longer than 7s.
- **Steps:**
  1. Reload `/app.html` and watch for the full 60 seconds.
- **Expect:** At ~7s the fallback card appears (the race rejected). When `initPdf` eventually resolves, the first `renderPage()` removes `#readerFallback` (`src/app.js:460`) and un-hides `#pageWrap` (`src/app.js:461`); in continuous mode `buildContinuous()` does the same at `src/app.js:522`. The reader becomes fully functional with **no reload**.
- **Watch:** The window where the card says "open this file directly" but the PDF is actually about to render is confusing but correct. The bug to catch is the opposite: the card stays forever while the page underneath is rendered and interactive, or highlights are drawn on an invisible canvas.

### ERR-014 - An empty library shows the empty reader, not an error
**P0** * Functional * `src/app.js:3197 showEmptyReader()` / `src/app.js:328 openFallbackDoc()`

- **Pre:** Clean state. The sample document is the only entry.
- **Steps:**
  1. Hover the sample row in the sidebar → click the trash icon → toast `Moved “BERT — Devlin et al. 2019 (NAACL).pdf” to Trash.`
  2. Go to **Trash** → click the red trash icon → confirm `Delete` in the dialog.
  3. Reload the page.
- **Expect:** A card reading `"Your library is empty"` with the line `"Use Open PDF or bundle (top-left) to open a paper, its notes, or a shared .html."` (with **Open PDF or bundle** and **.html** bolded). `#pageTotal` reads `"/ 0"`. This is **not** styled as an error — no red, no toast. On reload the sample must not silently reappear (`state.sampleDismissed`).
- **Watch:** `showEmptyReader()` nulls `pdfDoc`, `numPages` and `viewport` (`src/app.js:3198`). Any control that assumes a document (zoom, page next, find, the bottom composer) must degrade, not throw. Click every reader toolbar button in this state and watch the console.

### ERR-015 - The worker uses the inlined base64 tier, never the CDN
**P1** * Functional * `src/app.js:410 setupWorker()`

- **Pre:** App open, DevTools → Network, filter `pdf.worker`.
- **Steps:**
  1. Reload with the network log recording.
  2. In the console evaluate `!!window.pdfjsWorker`, `!!window.PDFJS_WORKER_B64`, and `pdfjsLib.GlobalWorkerOptions.workerSrc`.
- **Expect:** `window.pdfjsWorker` is **`false`** in this repo (`vendor/pdf.worker.b64.js` only defines `PDFJS_WORKER_B64`), so tier 1 is skipped and tier 2 runs: `workerSrc` is a `blob:http://…` URL. **No** request to `cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js` is made — tier 3 (`src/app.js:421`) must never fire on a healthy load.
- **Watch:** A vendor bump that ships a worker file without setting `window.PDFJS_WORKER_B64` silently falls through to the CDN. The app still works online and dies offline. This check is the only thing that catches it before a user does.

### ERR-016 - Blocking the CDN does not break the reader
**P0** * Functional * `src/app.js:410 setupWorker()` / `app.html:130-131`

- **Pre:** Network request blocking (ERR-003) with `*cdnjs.cloudflare.com*` and `*fonts.googleapis.com*` enabled.
- **Steps:**
  1. Reload `/app.html`.
  2. Render pages, select text, highlight, capture a figure.
- **Expect:** The reader is fully functional. `vendor/pdf.min.js` and the base64 worker are same-origin, so PDF.js is unaffected. The Inter webfont is gone, so type falls back to the system sans — layout must not break or overflow at any breakpoint. **No** error toast, **no** fallback card.
- **Watch:** People assume "cdnjs blocked" means "the PDF is broken" and stop testing. It should mean only "MathJax cannot load" (ERR-097). If the reader *does* break here, tier 2 has regressed — that is a P0.

### ERR-017 - `switchDoc` has no timeout: a hanging engine hangs silently
**P1** * Edge * `src/app.js:215 switchDoc()` vs `src/app.js:3341 boot()`

- **Pre:** Two documents in the library. The sandbox harness (ERR-002).
- **Steps:**
  1. In the sandbox, wait for the boot fallback card.
  2. Click the *other* document in the sidebar.
- **Expect:** `switchDoc()` calls `initPdf()` inside a bare `try/catch` with **no `Promise.race`** — unlike `boot()`. If the worker hangs rather than throwing, the reader shows nothing and no message ever appears. Record what actually happens.
- **Watch:** This is a genuine asymmetry in the code, not a hypothetical. If the switch hangs with a blank reader and no toast, file it: the boot path's 7s race must be reused by `switchDoc`. If it instead throws promptly, confirm the message is `Could not open “<name>” — it may not be a valid PDF.` and that the message is *wrong* for this cause — the PDF is fine, the engine is not.

### ERR-018 - A document whose bytes were evicted reports it and stays recoverable
**P0** * Functional * `src/app.js:213 switchDoc()` / `src/app.js:196 loadDocBytes()`

- **Pre:** Open your own PDF (not the sample) so it lands in IndexedDB as `pdf:<id>`.
- **Steps:**
  1. DevTools → Application → IndexedDB → `srw_assets` → `assets` → delete the `pdf:<id>` row for that document (leave the entry in `srw_state_v1`).
  2. Switch to another document, then back to the affected one.
- **Expect:** Reader fallback with `Engine note: Could not load “<your file>.pdf”. Re-open it with New.` The document row stays in the sidebar, its notes stay in the notes panel and remain readable/exportable. Re-opening the same PDF via **Open PDF or bundle** re-attaches by SHA-256 and restores the bytes (`src/app.js:233`) — the notes must still be attached.
- **Watch:** Two things. (a) The message names the file — a generic "could not load" is a fail. (b) The notes must **not** be deleted as a side effect; losing notes here is S1.

### ERR-019 - A seed failure is silent and does not block boot
**P2** * Edge * `src/app.js:3347 boot()` / `src/app.js:3009 seed()`

- **Pre:** Clean state.
- **Steps:**
  1. Serve the app with `assets/sample-notes.js` renamed away (so `window.SAMPLE_NOTES_JSON` is undefined), then load `/app.html`.
- **Expect:** `seed()` takes the `else` branch (`src/app.js:3017`) and simply produces no sample notes. The reader still renders the sample PDF. The notes panel shows `"No notes yet."`. If `seed()` throws instead, `boot()` catches it and logs `seed failed` via `console.warn` — the user sees **nothing**, and boot continues to `render()`.
- **Watch:** A `throw` that escapes this `try` aborts the rest of `boot()` — no `render()`, no `drawHighlights()`, no background text pre-cache. The symptom is an app that renders a page but has a permanently empty notes panel and a dead find bar. Check the console for `seed failed` whenever the notes panel looks unexpectedly empty.

---

## 4. Opening documents and files

### ERR-020 - A truncated PDF shows the "not a valid PDF" fallback
**P0** * Functional * `src/app.js:215 switchDoc()` / `src/app.js:219 openPdfFile()`

- **Pre:** `truncated.pdf` from ERR-001.
- **Steps:**
  1. **Open PDF or bundle** → select `truncated.pdf`.
- **Expect:** Reader fallback card with `Engine note: Could not open “truncated.pdf” — it may not be a valid PDF.` The notes panel and sidebar remain usable; switching to the sample restores a working reader with **no reload**.
- **Watch:** The em dash and curly quotes must match exactly. Also confirm the app does not white-screen: `switchDoc` returns immediately after `showReaderFallback` (`src/app.js:215`) so `render()`, `drawHighlights()` and `drawPins()` on the following line are skipped — a refactor that removes that `return` will call `drawHighlights()` against a null viewport.

### ERR-021 - A corrupt PDF still shows a success toast and stays in the library
**P1** * Functional * `src/app.js:243-249 openPdfFile()`

- **Pre:** As ERR-020, immediately after.
- **Steps:**
  1. Read the toast that appears **after** the fallback card.
  2. Look at the sidebar document list.
  3. Reload the page.
- **Expect (as coded):** `openPdfFile()` pushes the doc, `await switchDoc(id)` fails into the fallback, and then line 247 fires `Opened truncated.pdf — highlight text or capture a figure to start.` So the user sees an error card *and* a success toast, and the unreadable document is now a permanent library entry that reloads into the same fallback.
- **Watch:** This is a real contradiction, not a mis-run. Confirm it, file it as S3, and confirm the recovery path works: the row can be trashed (hover → trash icon) and permanently deleted (Trash → red trash → `Permanently delete “truncated.pdf”? This cannot be undone.`), which also removes `pdf:<id>` from IndexedDB (`src/app.js:353`).

### ERR-022 - A 0-byte PDF fails cleanly
**P1** * Edge * `src/app.js:225 openPdfFile()` / `src/app.js:447 initPdf()`

- **Pre:** `empty.pdf` from ERR-001.
- **Steps:**
  1. Drag `empty.pdf` onto the reader.
- **Expect:** `f.arrayBuffer()` succeeds with 0 bytes, `sha256Hex` returns a valid hash of the empty buffer, and `pdfjsLib.getDocument` rejects. Result: the same `Could not open “empty.pdf” — it may not be a valid PDF.` fallback. No uncaught promise rejection in the console.
- **Watch:** Open `empty.pdf` twice. The second time, content-addressing (`src/app.js:231`) matches the first empty file by SHA and reports `Reopened empty.pdf — same paper, your notes are here.` — a very odd message for a broken file. Note it if the copy reads absurdly.

### ERR-023 - Plain text renamed `.pdf`
**P1** * Edge * `src/app.js:259 openFiles()`

- **Pre:** `notapdf.pdf` from ERR-001.
- **Steps:**
  1. Open it via the file picker.
- **Expect:** `isPdf()` matches on the extension, so it takes the PDF path and fails at `initPdf` → `Could not open “notapdf.pdf” — it may not be a valid PDF.` The wording is accurate here: the file genuinely is not a valid PDF.
- **Watch:** Confirm the failure is the *fallback card*, not an uncaught `InvalidPDFException` in the console with a blank reader. Both look similar at a glance; only the card is a pass.

### ERR-024 - A password-protected PDF
**P1** * Edge * `src/app.js:447 initPdf()`

- **Pre:** Any encrypted PDF (create one with `qpdf --encrypt user owner 256 -- in.pdf locked.pdf`).
- **Steps:**
  1. Open `locked.pdf`.
- **Expect:** PDF.js raises `PasswordException`; the app has no password UI, so it lands in the same catch → `Could not open “locked.pdf” — it may not be a valid PDF.` Record the exact behaviour.
- **Watch:** The message is **inaccurate** for this case — the PDF is perfectly valid, it just needs a password. If a user-facing password prompt is ever added this check must be rewritten. Until then, file the copy as a P2 accuracy issue rather than passing it silently.

### ERR-025 - A malformed `.notes.json` names the file and the reason
**P0** * Functional * `src/app.js:269 openFiles()`

- **Pre:** `truncated.notes.json` from ERR-001.
- **Steps:**
  1. Drag it onto the reader on its own.
- **Expect:** `Could not read truncated.notes.json — not valid JSON.` (error toast, filename unquoted here, em dash). The loop `continue`s — a second, valid notes file dropped in the same gesture must still import.
- **Watch:** Drop `truncated.notes.json` **and** a good `.notes.json` together and confirm both outcomes appear: one error toast and one `N notes attached to “…”.` success. A regression that `return`s instead of `continue`s silently drops the good file.

### ERR-026 - A JSON file that is not notes
**P1** * Functional * `src/app.js:311 attachNotesFile()`

- **Pre:** `wrongshape.notes.json` from ERR-001, and a real `reading-workspace-prompts.json` (Settings → Templates → **Export (JSON)**).
- **Steps:**
  1. Drag `wrongshape.notes.json` onto the reader.
  2. Drag `reading-workspace-prompts.json` onto the reader.
- **Expect:** Both produce `“<filename>” has no notes to import.` (curly quotes around the filename). Nothing is imported; the existing notes are untouched.
- **Watch:** Case 2 is the realistic one — users genuinely drop a prompt-template export onto the reader. The message must not claim the file is corrupt (it is valid JSON), only that it has no notes. Verify the note count in the panel footer is unchanged.

### ERR-027 - Notes for a PDF that is not open
**P0** * Functional * `src/app.js:320 attachNotesFile()`

- **Pre:** A valid `.notes.json` exported from a document that is **not** currently in the library (trash and permanently delete that document first).
- **Steps:**
  1. Drag the `.notes.json` in on its own.
- **Expect:** `Notes “<name>.notes.json” don’t match an open document — open its PDF too.` The message is actionable and names the fix.
- **Watch:** The matching cascade is SHA-256 → "opened alongside" → filename (`src/app.js:312-319`). If the filename fallback accidentally matches a *different* document, notes are silently grafted onto the wrong paper — that is S1. Verify by exporting notes for `A.pdf`, renaming the file to `B.notes.json`, and dropping it while only `B.pdf` is open: it *will* attach by filename. Confirm the toast then reads `N notes attached to “B.pdf”.` and decide whether that is acceptable for your release.

### ERR-028 - An HTML file that is not a PairedX bundle
**P0** * Functional * `src/app.js:283 importSharedHTML()`

- **Pre:** `plain.html` from ERR-001.
- **Steps:**
  1. Drag `plain.html` onto the reader.
- **Expect:** `“plain.html” isn’t a PairedX shared paper.` (curly quotes, curly apostrophe in `isn’t`). Nothing is added to the library.
- **Watch:** The detection is a plain `indexOf('window.__PAIR_BUNDLE__=')`. A large unrelated HTML file (say a 20 MB saved web page) is read fully into memory via `f.text()` before that check. Try a 50 MB HTML file and confirm the tab survives; if it hangs, file it against `17 - Performance and limits`.

### ERR-029 - A truncated bundle
**P1** * Edge * `src/app.js:288-290 importSharedHTML()`

- **Pre:** `halfbundle.html` from ERR-001.
- **Steps:**
  1. Drag it onto the reader.
- **Expect:** The marker is found but `html.indexOf(';</script>', start)` returns `-1`, so `throw new Error('unterminated bundle')` is caught and the toast reads `Could not read the shared paper in “halfbundle.html”.` — the internal `unterminated bundle` string must **not** leak into the toast.
- **Watch:** A refactor that appends `+ (e.message || e)` to that toast would surface developer text to a user. The message here is deliberately opaque; check it stays that way.

### ERR-030 - A bundle with no embedded PDF
**P1** * Edge * `src/app.js:291 importSharedHTML()`

- **Pre:** `nopdf.html` from ERR-001.
- **Steps:**
  1. Drag it onto the reader.
- **Expect:** `“nopdf.html” has no embedded PDF.` Nothing is added to the library; the current document keeps rendering.
- **Watch:** The guard is `!bundle.pdfB64`, so an *empty-string* `pdfB64` is caught but a `pdfB64` of `"garbage"` is not — that path proceeds to `b64ToBytes` (`atob` throws `InvalidCharacterError`), which escapes `importSharedHTML` entirely and is caught one level up at `src/app.js:265` as `Could not open nopdf.html: The string to be decoded contains invalid characters.` Verify which of the two you get, and that either way the library is unchanged.

### ERR-031 - An unsupported file type is silently ignored
**P1** * Edge * `src/app.js:255-275 openFiles()`

- **Pre:** A `.docx`, a `.png` and a `.zip`.
- **Steps:**
  1. Drag the `.docx` onto the reader.
  2. Repeat with the `.png` and the `.zip`.
  3. Now drag a folder (not a file) onto the reader.
- **Expect (as coded):** None of them match `isPdf`/`isJson`/`isHtml`, so `htmls`, `pdfs` and `notes` are all empty and `openFiles()` completes having done — and said — **nothing**. The drop-hint outline and its label `"Drop a PDF (+ its .notes.json), or a shared .html, to open it"` (`src/styles.css:674`) disappear and that is the only feedback.
- **Watch:** This is the single most common real-world failure with no message at all. Confirm it, and file it as S3: a user who drops a `.docx` has no way to know whether the app is broken or the file is wrong. The check passes only if you have *recorded* the behaviour; it is not a pass just because nothing crashed.

---

## 5. Browser storage failures

### ERR-032 - localStorage quota exhaustion produces the export nudge
**P0** * Functional * `src/app.js:163-166 save()`

- **Pre:** A document open. Fill localStorage with ERR-003 step 4 (leave ~0 headroom; add more 1 MB keys until `setItem` throws).
- **Steps:**
  1. Highlight some text to create a note (forces `save()`).
  2. Wait for the 250 ms debounce.
- **Expect:** Error toast `Storage limit reached — export your notes to keep them.` — the message tells the user the one action that saves their data.
- **Watch:** The branch is gated on `/quota|exceeded/i` against `e.name + e.message`. Chrome throws `QuotaExceededError` (matches), Firefox throws `NS_ERROR_DOM_QUOTA_REACHED` (matches via "QUOTA"), Safari throws `QuotaExceededError` (matches). Verify in all three — a browser whose error name does not match gets **complete silence** while notes stop persisting, which is S1.

### ERR-033 - After a quota error the session stays usable and the data is still exportable
**P0** * State * `src/app.js:151 save()`

- **Pre:** Immediately after ERR-032, storage still full.
- **Steps:**
  1. Create two more notes and ask the AI a question on one.
  2. Press **Save notes** in the notes header and complete the Save As dialog.
  3. Open the written `.json` in a text editor.
- **Expect:** Everything works in-memory: the notes render, the AI answers, the connector draws. The exported JSON contains **all** notes including the ones created after the quota error — `docNotesJSON()` reads `state`, not localStorage. Only persistence across reload is lost.
- **Watch:** Reload now and confirm the post-quota notes are gone. That is expected and is exactly why the toast says "export your notes to keep them". What must **not** happen is a partially-written `srw_state_v1` that fails `JSON.parse` on the next boot — `loadState()` (`src/app.js:74`) swallows that and returns `null`, silently resetting the user to a default state. Check `localStorage.getItem('srw_state_v1')` still parses.

### ERR-034 - An opaque origin denies storage silently and by design
**P1** * Edge * `src/app.js:74 loadState()` / `src/app.js:163-165 save()`

- **Pre:** The sandbox harness (ERR-002).
- **Steps:**
  1. Open the sandbox, create a highlight, and watch for a toast.
- **Expect:** `localStorage.setItem` throws `SecurityError`, which does **not** match `/quota|exceeded/i`, so nothing is shown — deliberately, per the comment at `src/app.js:164` ("it's only a preview"). The note appears in the panel and works for the session.
- **Watch:** Confirm the silence is limited to the sandbox. If a normal Safari private window or a "block all cookies" profile also produces `SecurityError`, the user gets total silence in a real browsing mode and loses everything on reload. Test Safari private explicitly and file it if silent.

### ERR-035 - IndexedDB unavailable: screenshots vanish after reload
**P0** * Functional * `src/app.js:123 idbOpen()` / `src/app.js:144 rehydrateAssets()`

- **Pre:** A profile where IndexedDB fails, or the sandbox harness. Alternatively: in DevTools → Application → IndexedDB, delete the `srw_assets` database *after* creating the screenshot.
- **Steps:**
  1. In a normal window, use the screenshot tool to capture a figure. Confirm the thumbnail shows in the note card.
  2. Delete the `srw_assets` database in DevTools.
  3. Reload.
- **Expect:** `save()` rewrote the localStorage copy with `a.screenshot = '@idb'` (`src/app.js:158`) and `idbPut` wrote the real data to IndexedDB. With the database gone, `rehydrateAssets()` resolves `idbGet` to `null`, so `a.screenshot` becomes `null` and the card renders **no thumbnail** — with no message of any kind.
- **Watch:** This is silent data loss. Confirm the note itself survives (text, page, quote, tags) and only the image is gone. Then check the export: a `.notes.json` exported after this must not contain the literal string `"@idb"` — `notesJSONForExport()` (`src/app.js:2540`) re-inlines from IndexedDB, and with the store gone it will write `null`. A `"@idb"` string in an export is an S1 per 00 §2.

### ERR-036 - IndexedDB unavailable: user PDFs cannot reopen
**P0** * Functional * `src/app.js:196 loadDocBytes()` / `src/app.js:242 openPdfFile()`

- **Pre:** A normal window. Open your own PDF (kind `user`).
- **Steps:**
  1. Confirm it renders.
  2. DevTools → Application → IndexedDB → delete `srw_assets`.
  3. Reload.
- **Expect:** `boot()` calls `loadDocBytes(activeDoc)` → no `pdf:<id>` row → `null`. Since `startBytes` is null and other docs exist, boot falls through to the next library doc, or to the sample (`src/app.js:3327-3329`). Selecting the broken document afterwards gives `Could not load “<name>”. Re-open it with New.` — accurate and actionable.
- **Watch:** The bundled sample is base64 inline (`window.SAMPLE_PDF_B64`) and must **always** survive this. If the sample also fails, the fallback chain in `boot()` has regressed and a first-time user in a storage-restricted browser sees an empty app.

### ERR-037 - No secure context: SHA-256 degrades without a message
**P1** * Edge * `src/app.js:181 sha256Hex()`

- **Pre:** Serve the repo over plain `http://` on a **non-localhost** hostname (e.g. `http://192.168.1.x:8765/app.html` from another machine), so `crypto.subtle` is undefined.
- **Steps:**
  1. Open the same PDF twice via **Open PDF or bundle**.
  2. Export its notes, then open the PDF again in a fresh session and drop the notes file alongside.
- **Expect:** `sha256Hex` catches and returns `null` (`src/app.js:186`). Consequences, all silent: the document **duplicates** in the library instead of reporting `Reopened … — same paper, your notes are here.`; `attachNotesFile` cannot match by content and falls back to filename; `findFolderNotes` cannot match a renamed PDF.
- **Watch:** No error is shown for any of this. The user-visible symptom is "my notes disappeared" or "the same paper is listed twice". Confirm the degradation is graceful (no exception) and file the missing feedback as a P2 — a one-line hint when `sha` is null would prevent the confusion.

### ERR-038 - The storage meter falls back rather than showing an error
**P1** * Functional * `src/app.js:396 updateStorage()`

- **Pre:** A browser or context without `navigator.storage.estimate` (Safari on older iOS, or stub it in the console before boot: `delete navigator.storage`).
- **Steps:**
  1. Load the app and read the sidebar storage block.
- **Expect:** The `try` fails or the guard is false, so the text becomes `"<N> documents"` (e.g. `"3 documents"`) and the bar keeps its default 4% width. Never `"Calculating…"` left in place, never `NaN`, never an error toast.
- **Watch:** `"Calculating…"` is the static HTML placeholder in `app.html:39`. If it survives past boot, `updateStorage()` threw before both branches — check the console.

---

## 6. File System Access: folder sync and permissions

### ERR-039 - Folder sync is refused with a named alternative on Firefox/Safari
**P0** * Copy * `src/app.js:2333 chooseNotesFolder()` * Firefox/Safari only

- **Pre:** Firefox or Safari desktop.
- **Steps:**
  1. Settings → **Storage** tab → **Choose folder…**.
- **Expect:** Error toast `Folder sync needs Chrome or Edge. Use Export / Import notes instead.` The Settings modal stays open. **Export notes (JSON)** and **Import notes (JSON)** immediately below must both work.
- **Watch:** The message names the working alternative — a bare "not supported" is a fail. Also confirm the check is feature detection (`'showDirectoryPicker' in window`, `src/app.js:2264`) and not user-agent sniffing: a future Firefox that ships the API must get the picker without a code change.

### ERR-040 - Cancelling the directory picker changes nothing and says nothing
**P0** * Functional * `src/app.js:2341 chooseNotesFolder()` * Chromium only

- **Pre:** Chrome or Edge. Storage mode currently `browser`.
- **Steps:**
  1. Settings → Storage → **Choose folder…** → press **Cancel** / Esc in the OS dialog.
  2. Re-open Settings → Storage.
- **Expect:** `e.name === 'AbortError'` so **no toast at all**. `state.settings.storage.mode` is still `browser`, and the Storage tab still shows the **Choose folder…** button, not a folder name.
- **Watch:** An `AbortError` leaking through as `Could not open that folder: The user aborted a request.` is a classic regression — cancelling is not an error. Verify with `JSON.parse(localStorage.getItem('srw_state_v1')).settings.storage` after cancelling.

### ERR-041 - A picker failure that is not a cancel is reported
**P1** * Edge * `src/app.js:2341 chooseNotesFolder()` * Chromium only

- **Pre:** Chrome. Site settings → **File editing** → **Block** (ERR-003 step 3), then reload.
- **Steps:**
  1. Settings → Storage → **Choose folder…**.
- **Expect:** The picker is refused with a `SecurityError`/`NotAllowedError` rather than an `AbortError`, so the toast reads `Could not open that folder: <browser message>` and storage mode stays `browser`.
- **Watch:** Depending on the Chrome version the block may surface as an `AbortError` instead, in which case you get silence and no explanation for why the picker never opened. Record which one you see — silence here is a P2 copy gap, not a pass.

### ERR-042 - A revoked folder grant stops background sync silently
**P0** * Edge * `src/app.js:2343 notesDirHandle()` / `src/app.js:2451 scheduleFolderSync()` * Chromium only

- **Pre:** Chrome. Folder sync set up and confirmed working (edit a note, see the `.notes.json` update on disk).
- **Steps:**
  1. Click the icon left of the URL → **Site settings** → reset **File editing**. Do **not** reload.
  2. Return to the app and edit a note.
  3. Wait 5 seconds, then check the file's modification time on disk.
- **Expect (as coded):** `scheduleFolderSync()` calls `writeNotesToFolder(docId, false)` → `notesDirHandle(false)` → `queryPermission` returns `'prompt'` → returns `null` → `writeNotesToFolder` returns `false` **without any toast** (the `interactive` guard at `src/app.js:2359` suppresses it). The file on disk is now stale. Settings → Storage still displays `Notes sync to 📁 <folder>`.
- **Watch:** This is the most dangerous silent failure in the product: the UI actively claims notes are syncing while they are not. Confirm it, file it as S2, and verify the notes are at least still safe in `localStorage`.

### ERR-043 - The Save button re-prompts, then degrades to Save As
**P0** * Functional * `src/app.js:2607 saveNotesNow()` / `src/app.js:2348 notesDirHandle()` * Chromium only

- **Pre:** Continuing from ERR-042, permission still revoked.
- **Steps:**
  1. Click the **Save notes** button in the notes header (this click is a user gesture, so `requestPermission` may run).
  2. If a permission prompt appears, press **Block**.
- **Expect:** `writeNotesToFolder(docId, true)` → `requestPermission` → denied → `null` → returns `false` → `saveNotesNow` falls through to `saveAsFile()` and the OS **Save As** dialog opens instead. Completing it toasts `Saved <name>.notes.json.` and flashes the button. **No** error toast is shown for the denial itself.
- **Watch:** The silent switch from "syncs to my folder" to "asks me where to save" is the only signal the user gets that their grant is gone. Verify the fallback actually fires — a regression where `saveNotesNow` returns after the failed folder write would make **Save** do nothing at all, which is S2.

### ERR-044 - A deleted sync folder reports the write failure
**P1** * Edge * `src/app.js:2359 writeNotesToFolder()` * Chromium only

- **Pre:** Chrome. Folder sync working. Grant still valid.
- **Steps:**
  1. In Finder/Explorer, **delete** the synced folder (or move it to the Trash).
  2. Back in the app, click **Save notes**.
- **Expect:** `dir.getFileHandle(..., {create:true})` throws `NotFoundError`; because this call is interactive, the toast reads `Save failed: <browser message>` (e.g. `Save failed: A requested file or directory could not be found at the time an operation was processed.`).
- **Watch:** Two follow-ups. (a) Does the app then fall through to Save As? Reading `saveNotesNow` at `src/app.js:2608`, `writeNotesToFolder` returned `false`, so **yes** — expect the Save As dialog immediately after the error toast. (b) Background sync keeps retrying every 1.5s after each edit and keeps failing silently (non-interactive), so the folder-mode setting is now permanently broken with no prompt to re-pick. File that.

### ERR-045 - Loading from a folder with no folder set
**P1** * Copy * `src/app.js:2362 loadNotesFromFolder()` * Chromium only

- **Pre:** Storage mode `browser` (no folder picked). This path is reachable when a previously-set folder handle is gone from IndexedDB.
- **Steps:**
  1. With folder mode on, delete the `dir:notes` row from IndexedDB (DevTools → Application → IndexedDB → `srw_assets` → `assets`).
  2. Trigger an interactive folder load (Settings → Storage → **Change folder** then cancel; or re-open a PDF that would auto-offer folder notes).
- **Expect:** Where the interactive path runs, `Pick a notes folder first (Settings → Notes storage).` — the message names the exact place to fix it.
- **Watch:** The copy says "Settings → Notes storage" but the Settings modal's tab is labelled **Storage** and the field label is **Notes storage** (`src/app.js:2790`). Confirm a tester can follow the instruction without hunting. If the tab is ever renamed, this string must change with it.

### ERR-046 - No notes file in the folder for this document
**P1** * Copy * `src/app.js:2368 loadNotesFromFolder()` * Chromium only

- **Pre:** Chrome. A notes folder set to an empty directory. A document open.
- **Steps:**
  1. Trigger an interactive load from that folder.
- **Expect:** `No saved notes for this document in that folder yet.` — non-blaming, and the word "yet" makes clear this is normal for a new document.
- **Watch:** The same `catch` also fires when the file exists but is corrupt, producing a message that says the file is missing when it is actually unreadable. Test that: put a truncated `.notes.json` (correctly named for the document) in the folder and confirm you still get "No saved notes…". File the inaccuracy as P2.

### ERR-047 - A corrupt notes file found in the folder
**P1** * Edge * `src/app.js:2409 maybeOfferFolderNotes()` * Chromium only

- **Pre:** Chrome. Folder sync on. Place a **valid** `<doc>.notes.json` in the folder, containing at least one annotation id not already in the app.
- **Steps:**
  1. Open the matching PDF via **Open PDF or bundle** so the offer runs.
  2. In the confirm dialog `Found notes for this PDF in “<folder>”: <file>. Open them?` press **Open notes**.
  3. Now repeat the whole flow with the file replaced by `truncated.notes.json` renamed to the exact expected name.
- **Expect:** Step 2 → `N notes loaded from “<folder>”.` Step 3 → `findFolderNotes` swallows the parse error and returns `null`, so **no offer appears at all** and the `Could not read the notes file: …` toast at `src/app.js:2409` is unreachable through this route.
- **Watch:** Confirm the unreachable branch, and confirm the silent skip is at least harmless (the PDF opens normally). A user whose synced notes file got corrupted gets no warning that their notes were not loaded — file as P2.

---

## 7. Save As, download and self-contained export

### ERR-048 - Cancelling Save As writes nothing and says nothing
**P0** * Functional * `src/app.js:2512 saveAsFile()` / `src/app.js:2615 saveNotesNow()` * Chromium only

- **Pre:** Chrome. Storage mode `browser`. A document with notes.
- **Steps:**
  1. Click **Save notes** → the OS Save dialog opens → press **Cancel**.
  2. Check the Downloads folder and the default save location.
  3. Repeat with **Share as HTML** → Cancel.
- **Expect:** `e.name === 'AbortError'` → `{status:'cancelled'}` → both callers `return` immediately (`src/app.js:2615`, `src/app.js:2594`). **No** file is written, **no** download starts, **no** toast appears, and the **Save notes** button does **not** flash its saved state.
- **Watch:** The historic bug is a cancelled dialog silently falling through to `downloadNotesJSON()`, dumping an unwanted file into Downloads. Check the Downloads folder, not just the toast. A `Downloaded <name>.notes.json` toast after a cancel is an immediate fail.

### ERR-049 - A failed write falls back to a download and says so
**P1** * Functional * `src/app.js:2519-2521 saveAsFile()` * Chromium only

- **Pre:** Chrome on macOS/Linux. A directory you can open in the picker but cannot write to (e.g. `sudo mkdir /tmp/ro && sudo chmod 500 /tmp/ro`).
- **Steps:**
  1. Click **Save notes** → navigate into `/tmp/ro` → confirm the save.
- **Expect:** `createWritable()` throws; the toast reads `Couldn’t write there: <browser message> — downloading a copy instead.` (curly apostrophe in `Couldn’t`, em dash before "downloading") and then `downloadNotesJSON()` runs, producing a second toast `Downloaded <name>.notes.json` and a real file in Downloads.
- **Watch:** The promise made in the message must be kept — verify the file actually lands in Downloads. A message that says "downloading a copy instead" with no download is worse than no message.

### ERR-050 - Firefox/Safari get the one-time save tip and a plain download
**P0** * Copy * `src/app.js:2460 maybeShowSaveAsTip()` / `src/app.js:2504 saveAsFile()` * Firefox/Safari only

- **Pre:** Firefox (or Safari). Clear `srw_saveas_tip` first: `localStorage.removeItem('srw_saveas_tip')`, then reload.
- **Steps:**
  1. Click **Save notes**.
- **Expect:** A modal titled `Choose where your files save` with the line `In Firefox, turn on one setting to pick where each download goes — and overwrite instead of piling up “(1)” copies.` (browser name bolded and correct). Numbered steps: Firefox → `Open Settings → General`, `Scroll to Files and Applications`, then `Turn on:` with a toggle-style box reading `Always ask you where to save files`. Safari → `Open Settings → General`, `Find File download location`, box reading `Ask for each download` with a `✓`. Dismiss with **Got it** → the file downloads normally and toasts `Downloaded <name>.notes.json`.
- **Watch:** The browser detection at `src/app.js:2464-2466` excludes `crios`, `edgios`, `android` and `opr/` from the Safari branch. Test Chrome-on-iOS: it must fall into the generic `your browser` branch with `Open your browser’s download settings`, not claim to be Safari.

### ERR-051 - The save tip appears exactly once per device
**P1** * State * `src/app.js:2462,2495 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Immediately after ERR-050.
- **Steps:**
  1. Click **Save notes** again.
  2. Reload and click **Save notes** a third time.
  3. Run `localStorage.removeItem('srw_saveas_tip')`, reload, click **Save notes**.
- **Expect:** Steps 1 and 2 → no modal, straight to the download. Step 3 → the modal returns. The key is written at `src/app.js:2495` *after* the modal is built, so a user who force-closes the tab mid-modal still gets it marked as shown.
- **Watch:** If `localStorage` itself is unavailable, `src/app.js:2462` `return`s early and the tip is **never** shown — verify that in a private window rather than getting the modal on every single save, which would be maddening.

### ERR-052 - A download that fails reports it
**P2** * Edge * `src/app.js:2531 downloadNotesJSON()`

- **Pre:** Any browser. Force the failure in the console before clicking: `URL.createObjectURL = () => { throw new Error('blocked by QA'); }`.
- **Steps:**
  1. Settings → Storage → **Export notes (JSON)**.
- **Expect:** `Could not export: blocked by QA` as an error toast. The app stays usable; restore with a reload.
- **Watch:** Confirm no partially-created `<a>` element is left in the DOM (`document.querySelectorAll('a[download]').length` must be 0 afterwards).

### ERR-053 - Exporting a shared HTML for a document whose bytes are gone
**P0** * Functional * `src/app.js:2559 exportSelfContainedHTML()`

- **Pre:** Set up ERR-018 (a user document whose `pdf:<id>` row was deleted), and make it the active document.
- **Steps:**
  1. Click **Share as HTML** in the left sidebar.
- **Expect:** First the informational toast `Building shareable file…`, then the error toast `Could not read the PDF for this document.` No file is written, no Save As dialog opens.
- **Watch:** The order matters — the "Building…" toast must not be the last thing the user sees. Verify both appear and that the second is red.

### ERR-054 - Exporting while offline
**P0** * Functional * `src/app.js:2560-2566,2600 exportSelfContainedHTML()`

- **Pre:** App loaded and rendering. Then DevTools → Network → **Offline**.
- **Steps:**
  1. Click **Share as HTML**.
- **Expect:** `Building shareable file…` then, because `fetch('/app.html')` and its four siblings reject, `Could not build the file: Failed to fetch` (Chrome) / `… NetworkError when attempting to fetch resource.` (Firefox) / `… Load failed` (Safari). No Save As dialog, no partial file.
- **Watch:** All five fetches run in `Promise.all`, so one failure aborts the export cleanly — good. What to watch for is a *partial* write: confirm nothing lands in Downloads and no zero-byte file appears at the chosen path.

### ERR-055 - Exporting where an asset 404s produces a broken file with no error
**P1** * Edge * `src/app.js:2560-2585 exportSelfContainedHTML()`

- **Pre:** Serve the repo with `vendor/pdf.min.js` renamed away. Load `/app.html` (the reader will fail — that is fine) and pick any document.
- **Steps:**
  1. Click **Share as HTML** and save the result.
  2. Open the saved `.annotated.html` in a browser.
- **Expect (as coded):** `fetch()` does **not** reject on a 404, so `r.text()` returns the server's 404 page body, which gets inlined in place of PDF.js. The export "succeeds" with `Saved <name>.annotated.html — N.N MB, opens anywhere.` and the recipient opens a file that cannot render the PDF.
- **Watch:** This is the worst class of failure — a confident success message for a broken artefact. Confirm it and file it as S2: the five fetches need an `r.ok` guard. The tell in the saved file is a `<script>` block containing HTML (`grep -c '404 Not Found' <file>.annotated.html`).

### ERR-056 - Cancelling the export dialog leaves no trace
**P0** * Functional * `src/app.js:2594 exportSelfContainedHTML()` * Chromium only

- **Pre:** Chrome. A document with several notes and at least one screenshot.
- **Steps:**
  1. Click **Share as HTML**, wait for the dialog, press **Cancel**.
  2. Check Downloads and the last-used save directory.
- **Expect:** `{status:'cancelled'}` → `return` before the blob fallback. No file anywhere, and **no** `Exported …` toast. The only toast that fired was `Building shareable file…`.
- **Watch:** The blob fallback at `src/app.js:2595-2599` sits immediately after the cancelled check. A refactor that reorders those two lines dumps a 5-30 MB file into Downloads on every cancel. Check the file system, not the toast.

---

## 8. Notes and prompt import failures

### ERR-057 - Import notes: malformed JSON
**P0** * Functional * `src/app.js:2535 importNotesJSON()`

- **Pre:** `truncated.notes.json` from ERR-001. A document open with existing notes.
- **Steps:**
  1. Notes header → the import icon (title `Import notes from a JSON file`) → pick `truncated.notes.json`.
  2. Count the notes in the panel footer before and after.
- **Expect:** `Could not read that JSON: <parser message>` (e.g. `Could not read that JSON: Unexpected end of JSON input`). The existing note count is **unchanged** — this path calls `applyNotesJSON` without `merge`, which would otherwise **replace** all notes for the document.
- **Watch:** The replace semantics make this the highest-stakes error path in the app. Verify the count is byte-identical before and after. If a partially-parsed object ever reaches `applyNotesJSON` here, the user loses every note for that document — S1.

### ERR-058 - Import notes: valid JSON with no annotations array
**P0** * Functional * `src/app.js:2317 applyNotesJSON()`

- **Pre:** `wrongshape.notes.json`. A document with at least 3 notes.
- **Steps:**
  1. Notes header → import icon → pick `wrongshape.notes.json`.
- **Expect:** `That file has no notes to import.` (error toast), `return 0`, and — critically — the guard runs **before** `state.annotations` is reassigned, so the existing 3 notes survive.
- **Watch:** Repeat with a file whose `annotations` is `[]` (an empty array). That passes the guard, so `applyNotesJSON` **replaces** the document's notes with nothing and toasts `0 notes imported.` Confirm that behaviour and decide whether a zero-count replace deserves a confirm dialog. File as P1 if a user can wipe their notes with an accidental empty export.

### ERR-059 - Attaching notes saved for a different PDF asks first
**P0** * Functional * `src/app.js:2443 openNotesFileFor()`

- **Pre:** Two different PDFs, `A.pdf` and `B.pdf`, both opened once so both have a `sha`. Export notes for `A.pdf`.
- **Steps:**
  1. Open `B.pdf` fresh so the notes banner appears: `Have notes for B.pdf? Open its .notes.json to load them.`
  2. Click **Open notes file…** and pick `A.notes.json`.
  3. In the confirm dialog, press **Cancel**.
  4. Repeat and press **Attach**.
- **Expect:** Step 3 → the dialog reads `“A.notes.json” was saved for a different PDF. Attach it to “B.pdf” anyway?` with buttons **Cancel** and **Attach**. Cancel → nothing imported, no toast. Step 4 → `N notes loaded.` and the notes attach to `B.pdf`.
- **Watch:** The mismatch check requires **both** shas (`sha && doc && doc.sha`). On an insecure context (ERR-037) both are null, the dialog is skipped, and the notes attach to the wrong document silently. Test that combination.

### ERR-060 - The notes-banner picker with a malformed file
**P1** * Functional * `src/app.js:2446 openNotesFileFor()`

- **Pre:** As ERR-059 step 1, banner visible.
- **Steps:**
  1. **Open notes file…** → pick `truncated.notes.json`.
- **Expect:** `Could not read that JSON: <parser message>`. The banner is already removed (it is dismissed on click at `src/app.js:2430`), so the user cannot retry from the banner — they must use the notes-header import button.
- **Watch:** Verify the recovery route exists and works: notes header → import icon → pick a good file → `N notes imported.` If the banner is the only affordance a user knows about, a single mis-pick costs them the flow. Note it as a P2 UX gap.

### ERR-061 - Importing a JSON that has no matching prompts
**P1** * Copy * `src/app.js:2755 importPrompts()`

- **Pre:** Settings → **Templates** tab. Any `.notes.json` on hand.
- **Steps:**
  1. Click **Import (JSON)** and pick a `.notes.json` (valid JSON, wrong shape).
- **Expect:** `No matching prompts in that file.` as an **error** toast (`toast(..., n ? '' : 'err')`). Every template textarea keeps its current value — nothing is half-applied.
- **Watch:** A partial import is the real risk: `importPrompts` writes into the textareas one key at a time with no transaction. Try a file with `{"prompts":{"text":"NEW","router":12345}}` — `text` applies, `router` is skipped (not a string), and the toast says `1 prompt imported — review and press Save.` Confirm the count is honest and that pressing **Close** instead of **Save** discards it.

### ERR-062 - Prompt export failure
**P2** * Edge * `src/app.js:2744 exportPrompts()`

- **Pre:** Settings → Templates. In the console: `URL.createObjectURL = () => { throw new Error('blocked by QA'); }`.
- **Steps:**
  1. Click **Export (JSON)**.
- **Expect:** `Could not export prompts: blocked by QA`. The Settings modal stays open and every textarea keeps its content.
- **Watch:** Confirm the modal is not closed as a side effect — losing unsaved template edits to a failed export would be a P1.

---

## 9. AI failures in the browser

Section 10 covers what the server *sends*. This section covers what the user *sees*.

### ERR-063 - No `/api` under a plain static server
**P0** * Functional * `src/app.js:1250 aiText()` / `src/app.js:1594 errHint()`

- **Pre:** `python3 -m http.server 8765` in the repo root. Open `http://localhost:8765/app.html`. No `vercel dev`.
- **Steps:**
  1. Select text → **✦ Ask AI** → type `what is this?` → send.
- **Expect (as coded):** `fetch('/api/ai', {method:'POST'})` reaches the static server, which answers **501 Unsupported method ('POST')**. `r.ok` is false, `r.json()` fails so `j = {}`, and the thrown message is `AI request failed (501)`. `errHint()` matches neither of its two patterns, so the toast and the `⚠` line in the note both read exactly `AI request failed (501)`.
- **Watch:** This is the setup a developer hits most often, and the message tells them nothing about the cause. The friendly hint at `src/app.js:1595` only fires on a true network error, which a static server does not produce. Confirm the raw status message and file the copy gap as P2 — a status-based branch (`/^AI request failed \(\d+\)/` → mention `vercel dev`) would fix it.

### ERR-064 - A shared `.annotated.html` opened from `file://` gets the network hint
**P0** * Copy * `src/app.js:1595 errHint()`

- **Pre:** Export a real `.annotated.html` (Share as HTML) and open it by **double-clicking the file** (a `file://` URL), not through a server.
- **Steps:**
  1. Click any existing note in the panel to expand it.
  2. Type `explain this` into the note's inline **Reply or ask a follow-up…** composer and send.
- **Expect:** The message reads, verbatim: `Could not reach the AI endpoint (/api/ai). This works on the deployed site; when opening the file locally without the server, add a key in Settings or run it via the deployment.` The three browsers each produce a different underlying error that `errHint`'s regex must catch: Chrome `Failed to fetch`, Firefox `NetworkError when attempting to fetch resource.`, Safari `Load failed`. Verify all three.
- **Watch:** Two things. (a) The regex at `src/app.js:1595` is `/failed to fetch|networkerror|load failed/i`. A fourth browser wording would fall through to the raw message — test any engine you support. (b) The hint says "add a key in Settings", but `applyReadOnly()` (`src/app.js:3297`) **hides `btnSettings`** in a read-only bundle, so the advice is impossible to follow there. File that contradiction as P2.

### ERR-065 - Going offline mid-answer
**P0** * Functional * `src/app.js:1506-1509 askAIAgent()`

- **Pre:** `vercel dev` with a working key, or the deployed site. A document open.
- **Steps:**
  1. Select text → **✦ Ask AI** → send `summarise the whole paper`.
  2. The moment the reply shows `Thinking…` / `Reading the full paper…`, switch DevTools to **Offline**.
- **Expect:** The pending reply's `pending`/`status` clear, `msg.text` becomes empty, `msg.error` is set, and the reply body renders `⚠ <message>` in dark red (`#B91C1C`, `src/app.js:1806`). The toast shows `errHint(message)` — for an offline fetch that is the full `Could not reach the AI endpoint (/api/ai). …` copy. The typing dots must **stop**.
- **Watch:** `state.ui.streamingId` is cleared in the `finally` (`src/app.js:1509`). If it is not, the notes list keeps auto-scrolling to the bottom of that note on every subsequent render, and the user cannot scroll away. Verify you can scroll the notes list freely after the failure.

### ERR-066 - A pending answer is persisted and sticks after reload
**P0** * State * `src/app.js:1357 askAI()` / `src/app.js:1805 msgCard()`

- **Pre:** As ERR-065.
- **Steps:**
  1. Ask a question and, while the reply still shows `Thinking…`, **reload the page** (do not wait for the answer).
  2. Look at the note after reload.
  3. Hover the stuck reply → click its trash icon (`Delete reply`).
- **Expect (as coded):** `msg.pending = true` was written to `state` and persisted by the debounced `save()` at `src/app.js:1357`, so after reload the reply renders a permanent animated `Thinking` indicator that will never resolve. There is no retry affordance. The only recovery is **Delete reply**, which must work and must leave the rest of the thread intact.
- **Watch:** Confirm the stuck state survives a second reload (it is real state, not a render artefact). File as S3 with a concrete fix: `boot()` should clear `pending` on every message at load. Also verify the stuck message does **not** poison the export — check the exported `.notes.json` and the PDF export sheet, which filters `!m.pending` at `src/app.js:2897`.

### ERR-067 - No key anywhere gets the Settings pointer appended
**P0** * Copy * `src/app.js:1596 errHint()` / `api/ai.js:94`

- **Pre:** A self-hosted deployment (or `vercel dev`) with **no** `OPENROUTER_API_KEY` set and **no** key in Settings.
- **Steps:**
  1. Ask any question.
- **Expect:** The server returns 400 with `No openrouter key available. Add your own key in Settings, or ask the site owner to set OPENROUTER_API_KEY.` The client's `errHint` matches `/no .*key available/i` and appends ` (Settings → paste a key to use your own.)`, so the toast reads the whole thing including the suffix.
- **Watch:** The suffix is redundant with the server's own "Add your own key in Settings" — two instructions in one sentence. Check it reads sanely rather than as a doubled-up mess; file as P2 if not.

### ERR-068 - Shared-key quota exhaustion shows the demo-quota message, not the owner's billing
**P0** * Copy * `api/ai.js:31-32,108` / `src/app.js:1383 askAI()`

- **Pre:** The **production** site `https://pairedx.com/app` with **no** key in Settings (so the server's shared key is used) at a time when its quota is exhausted. If it is not exhausted, force it: `vercel dev` with `OPENROUTER_API_KEY` set to a real key on an account with zero credit.
- **Steps:**
  1. Ask any question.
- **Expect:** The `⚠` line and the toast both read, verbatim: `The site’s shared demo quota is used up right now — add your own key in Settings → AI & Tools to keep going (it stays in your browser and is never saved on our server).` Note the curly apostrophe in `site’s`, the em dash, and the arrow in `Settings → AI & Tools`.
- **Watch:** The provider's own message (which contains `https://openrouter.ai/settings/credits` and reads as *your* account being out of credit) must **never** reach the user here. Grep the page for `openrouter.ai/settings` after the failure — a hit is a fail. `isQuotaErr` also matches on `402`, `429`, and the words `insufficient|quota|rate.?limit|credit|payment required|billing`.

### ERR-069 - A BYO key that is out of credit must NOT show the demo-quota message
**P0** * Copy * `api/ai.js:92,108`

- **Pre:** A real OpenRouter key belonging to an account with zero credit. Paste it into Settings → AI & Tools → OpenRouter → Save.
- **Steps:**
  1. Ask any question.
- **Expect:** `usedServerKey` is `false`, so `isQuotaErr` is not consulted and the **provider's own message** is passed through verbatim (typically a 402 mentioning credits and a link to *the user's own* dashboard). The user must **not** be told to "add your own key in Settings" — they already did.
- **Watch:** This is the exact inverse of ERR-068 and the two are easy to break together. If you see `The site’s shared demo quota is used up right now…` while a BYO key is configured, that is a P1 copy bug: the advice is impossible to act on.

### ERR-070 - An invalid BYO key surfaces the provider's 401 verbatim
**P1** * Functional * `api/ai.js:65,109` / `src/app.js:1250 aiText()`

- **Pre:** Settings → OpenRouter key = `sk-or-v1-definitely-not-a-real-key`. Save.
- **Steps:**
  1. Ask any question.
- **Expect:** OpenRouter returns 401; the proxy mirrors the status (`res.status(e.status || 500)`) and the body `{error: "<provider message>"}` — typically `No auth credentials found`. The toast shows that string unchanged; `errHint` does not rewrite it.
- **Watch:** Confirm the key itself is **not** echoed back into the message (grep the toast text for `sk-or`). Also confirm the failed key is not cleared from Settings — the user must be able to correct a typo rather than retype the whole key.

### ERR-071 - An unknown model name
**P1** * Functional * `src/app.js:2828 openSettings()` / `api/ai.js:65`

- **Pre:** Settings → OpenRouter → Text model = `openai/this-model-does-not-exist`. Save.
- **Steps:**
  1. Ask any question.
- **Expect:** A 400 from the provider whose message names the model, e.g. `openai/this-model-does-not-exist is not a valid model ID`. Shown verbatim, so the user can see which field to fix.
- **Watch:** Clearing the model field entirely instead falls back to `DEFAULT_MODELS.openrouter` (`src/app.js:2828`), so an **empty** model is not an error path. Verify both: garbage → provider error; empty → silently restored to `openai/gpt-5.4`.

### ERR-072 - A misconfigured compatible endpoint surfaces the proxy guard
**P0** * Functional * `api/ai.js:96-99` / `src/app.js:1250 aiText()`

- **Pre:** Settings → OpenAI-compatible: key `sk-test`, Default selected.
- **Steps:**
  1. Base URL = `http://api.openai.com/v1` → Save → ask a question.
  2. Base URL = `https://evil.example.com/v1` → Save → ask a question.
- **Expect:** Step 1 → `Custom endpoints must use HTTPS.` Step 2 → `That endpoint isn’t a recognized OpenAI-compatible provider. Use a known provider, or self-host PairedX to point at any endpoint (including a local model).` Both appear as the toast **and** as the `⚠` line in the note, so the user can re-read the reason after the toast fades.
- **Watch:** These messages are the user's only feedback about a settings mistake, and they appear in the *notes panel*, not in Settings. Confirm that re-opening Settings shows the offending base URL still in the field so it can be corrected. Also confirm `http://localhost:1234/v1` gives the HTTPS message, not a hang.

### ERR-073 - The agent's final-synthesis call passes the wrong arguments
**P0** * Functional * `src/app.js:1497 askAIAgent()` vs `src/app.js:1440 aiAgentStep()`

- **Pre:** `vercel dev` or production with a working key. A long document (the bundled BERT sample is fine). Settings → Tools → **both** toggles on so the agent has the most tools to chew through.
- **Steps:**
  1. Select text → **✦ Ask AI** → ask something that forces heavy tool use, e.g. `list every dataset used, with the page number for each, and compare their sizes`.
  2. Watch the status line cycle through `Thinking…`, `Searching the document…`, `Reading a page…` etc. and let the loop run its full 7 iterations without producing text.
- **Expect (as coded):** `aiAgentStep` is declared `(provider, model, messages, tools)` but line 1497 calls it as `aiAgentStep(model, messages.concat([...]), [])`. The model **id** is sent as `provider`, so `api/ai.js:86` rejects it and the note ends with `⚠ Unsupported provider.` plus a toast of the same text.
- **Watch:** This is a genuine argument-order bug on the guaranteed-answer path — the one branch whose entire purpose is "the user always gets an answer". It only fires when the loop exhausts, which is why it survives casual testing. If you cannot force 7 iterations, verify by hand in the console: `fetch('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:'openai/gpt-5.4',mode:'agent',messages:[]})}).then(r=>r.json()).then(console.log)` must print `{error:"Unsupported provider."}`. File as S2.

### ERR-074 - An empty model answer produces guidance, not a blank card
**P1** * Copy * `src/app.js:1501 askAIAgent()`

- **Pre:** As ERR-073, but the final synthesis succeeds and returns empty content.
- **Steps:**
  1. Ask a question the document cannot answer at all, e.g. `what is the author's home address?`
- **Expect:** If `answer` ends up empty, `msg.text` becomes `The document doesn’t seem to cover that — try selecting the relevant passage, or ask a more specific question.` It renders as a normal AI answer (not as a red `⚠` error) with its provenance disclosure intact, because it is guidance, not a failure.
- **Watch:** The distinction matters: an empty answer is not the model's fault or the user's, and styling it red would be blaming. Confirm the text is in a normal `.msg`, not the `#B91C1C` error branch.

### ERR-075 - A failed intent router degrades to keyword heuristics silently
**P1** * Functional * `src/app.js:1637-1644 routeAndAct()` / `src/app.js:1270 aiClassify()`

- **Pre:** A working AI setup. Then Settings → OpenRouter → **Router** model = `openai/not-a-router`. Save. (This breaks only the router call, leaving the main answer call healthy.)
- **Steps:**
  1. On a note, send `interesting` → observe.
  2. Send `why does this work?` → observe.
  3. Send `draw the architecture` → observe.
- **Expect:** `routeMessage` throws, the `catch` at `src/app.js:1641` takes over, and **no toast appears at all**. The keyword fallback then applies: `interesting` stays a personal note (no AI reply); `why does this work?` ends in `?` so it routes to `answer`; `draw the architecture` matches `isVisualRequest()` so it routes to `visual`.
- **Watch:** The silence is correct — the router is an optimisation, not a feature. What to catch is the opposite: an error toast for a failed router (noise for something the user never asked for), or a router failure that swallows the message entirely so nothing at all happens.

### ERR-076 - Image generation failure degrades to the text diagram, silently
**P1** * Functional * `src/app.js:1574 generateVisual()`

- **Pre:** Settings → OpenRouter → **Image** model = `openai/not-an-image-model`. Text and Router models valid. Save. Tools → **Enable generated visuals** on.
- **Steps:**
  1. On a note over a figure-heavy passage, send `illustrate this as a picture`.
- **Expect:** The planner returns a plan containing **both** `image_prompt` and `ascii`. `aiImage()` throws, and because `plan.ascii` is present the code sets `msg.kind='ascii'` and shows the diagram instead. The badge reads `Diagram`, the footer reads `Text diagram from the document`, and **no error is shown**. The user gets a useful answer of the wrong type.
- **Watch:** Verify the badge and the footer line match the content actually rendered. A card badged `Generated image` showing a monospace diagram is a P2 mismatch. Also confirm no toast fires — this path is deliberately quiet.

### ERR-077 - Image generation failure with no diagram fallback reports it
**P1** * Copy * `src/app.js:1574,1584,1590 generateVisual()`

- **Pre:** As ERR-076, plus Settings → Templates → **Images & diagrams** edited so the planner is told to return only an `image_prompt` and never an `ascii` field. Save.
- **Steps:**
  1. Send `illustrate this as a picture` on a note.
  2. Separately, break the **Text** model too and repeat, so the planner call itself throws.
- **Expect:** Step 1 → the visual card shows `⚠ Image generation failed: <provider message>` in `#B91C1C`; `msg.title` is set to `Visual unavailable` (though the title is not rendered in the error branch). Step 2 → the outer catch fires: `⚠ <message>` with `msg.title = 'Visual generation failed'`, plus a toast of `errHint(message)`. A third variant — planner returns unusable JSON *and* the plain-text diagram retry fails — gives `⚠ Could not render the diagram — please try again.`
- **Watch:** All three must render inside the note card, never as a blank `Visual` card with nothing in it. Also confirm the note thread stays usable: the inline composer below the failed visual must still send a follow-up.

---

## 10. AI proxy error responses

Run these with `curl` against `vercel dev` (`http://localhost:3000`) or production. Always send `-H 'content-type: application/json'`.

### ERR-078 - Non-POST to `/api/ai` is 405 with a body
**P0** * Functional * `api/ai.js:79`

- **Pre:** A running deployment.
- **Steps:**
  1. `curl -i https://pairedx.com/api/ai`
  2. `curl -i -X PUT https://pairedx.com/api/ai`
- **Expect:** Both return `HTTP/… 405` with body exactly `{"error":"POST only"}`. Never an HTML error page, never a stack trace, never a 200.
- **Watch:** A 405 with an empty body would make the client throw `AI request failed (405)` instead of `POST only` — the body is what carries the meaning through `aiText`'s `j.error` path.

### ERR-079 - Non-POST to `/api/ai-image` is 405 with a body
**P0** * Functional * `api/ai-image.js:38`

- **Pre:** As above.
- **Steps:**
  1. `curl -i https://pairedx.com/api/ai-image`
- **Expect:** `405` with `{"error":"POST only"}`.
- **Watch:** Both functions must agree. A divergence here usually means one file was edited and the other forgotten.

### ERR-080 - An unknown provider is rejected before any guard is skipped
**P0** * Security * `api/ai.js:86`

- **Pre:** As above.
- **Steps:**
  1. `curl -i -X POST https://pairedx.com/api/ai -H 'content-type: application/json' -d '{"provider":"acme","user":"hi","baseUrl":"https://evil.example.com/v1"}'`
- **Expect:** `400` with `{"error":"Unsupported provider."}`. Crucially, no outbound request is made to `evil.example.com` — the provider check runs **before** `baseOf(baseUrl)`.
- **Watch:** The comment at `api/ai.js:84-85` explains why: an unknown provider name would skip every `provider === 'compat'` guard below it. If this check ever moves after the URL construction, it becomes an SSRF hole (see `13 - Security and privacy`).

### ERR-081 - An unknown provider on the image endpoint names the alternatives
**P1** * Copy * `api/ai-image.js:42`

- **Pre:** As above.
- **Steps:**
  1. `curl -i -X POST https://pairedx.com/api/ai-image -H 'content-type: application/json' -d '{"provider":"acme","prompt":"a cat"}'`
- **Expect:** `400` with `{"error":"acme can't generate images — use OpenRouter or an OpenAI-compatible endpoint."}` — the provider name is interpolated, and the message names both valid options.
- **Watch:** The provider string is echoed back into the message. Send `{"provider":"<img src=x onerror=alert(1)>"}` and confirm the client renders it escaped in the toast (ERR-007 covers the escaping; this confirms the value gets that far).

### ERR-082 - The compatible provider without a key is refused on `/api/ai`
**P0** * Copy * `api/ai.js:91`

- **Pre:** As above.
- **Steps:**
  1. `curl -i -X POST https://pairedx.com/api/ai -H 'content-type: application/json' -d '{"provider":"compat","user":"hi"}'`
- **Expect:** `400` with `{"error":"The OpenAI-compatible provider needs your own API key (add it in Settings → AI & Tools). The site’s shared demo key only works with OpenRouter."}` — note the arrow, the curly apostrophe in `site’s`, and that it explains *why*.
- **Watch:** This is the guard that stops the server's key being forwarded to a caller-chosen host. Confirm the response contains no key material and that the status is 400, not 500.

### ERR-083 - The compatible provider without a key is refused on `/api/ai-image`
**P1** * Copy * `api/ai-image.js:45`

- **Pre:** As above.
- **Steps:**
  1. `curl -i -X POST https://pairedx.com/api/ai-image -H 'content-type: application/json' -d '{"provider":"compat","prompt":"a cat"}'`
- **Expect:** `400` with `{"error":"The OpenAI-compatible provider needs your own API key (add it in Settings → AI & Tools)."}` — the shorter variant, without the OpenRouter sentence.
- **Watch:** The two endpoints intentionally differ. Do not "fix" the difference; do check both strings are exactly as written, since a copy sweep across the two files could easily desync them.

### ERR-084 - HTTP base URLs are refused on both endpoints
**P0** * Security * `api/ai.js:97` / `api/ai-image.js:52`

- **Pre:** As above.
- **Steps:**
  1. `curl -i -X POST .../api/ai -H 'content-type: application/json' -d '{"provider":"compat","userKey":"sk-test","baseUrl":"http://api.openai.com/v1","user":"hi"}'`
  2. Same against `/api/ai-image` with `"prompt":"a cat"`.
  3. Repeat both with `"baseUrl":"http://127.0.0.1:11434/v1"`.
- **Expect:** All four return `400` with `{"error":"Custom endpoints must use HTTPS."}`.
- **Watch:** The guard is skipped entirely when `ALLOW_PRIVATE_ENDPOINTS=1` is set in the environment (`api/ai.js:96`). Confirm production does **not** have it set: step 3 must be refused on `pairedx.com`.

### ERR-085 - A non-allowlisted HTTPS host is refused, with the right tail on each endpoint
**P0** * Security * `api/ai.js:98` / `api/ai-image.js:53`

- **Pre:** As above.
- **Steps:**
  1. `/api/ai` with `"baseUrl":"https://evil.example.com/v1"`.
  2. `/api/ai-image` with the same.
  3. `/api/ai` with `"baseUrl":"https://api.groq.com/openai/v1"` (an allowlisted host).
- **Expect:** 1 → `That endpoint isn’t a recognized OpenAI-compatible provider. Use a known provider, or self-host PairedX to point at any endpoint (including a local model).` 2 → the same sentence but ending `…to point at any endpoint.` (no parenthetical). 3 → passes the guard and fails later on the fake key instead, proving the allowlist is not simply rejecting everything.
- **Watch:** The allowlist (`COMPAT_HOSTS`, 12 hosts) is duplicated in both files. Diff them: `diff <(sed -n '22,26p' api/ai.js) <(sed -n '12,16p' api/ai-image.js)` must show no host differences.

### ERR-086 - A missing server key names the environment variable
**P1** * Copy * `api/ai.js:94` / `api/ai-image.js:48`

- **Pre:** `vercel dev` with **no** `OPENROUTER_API_KEY` in the environment.
- **Steps:**
  1. `curl -i -X POST http://localhost:3000/api/ai -H 'content-type: application/json' -d '{"user":"hi"}'`
  2. `curl -i -X POST http://localhost:3000/api/ai-image -H 'content-type: application/json' -d '{"prompt":"a cat"}'`
- **Expect:** 1 → `400` `{"error":"No openrouter key available. Add your own key in Settings, or ask the site owner to set OPENROUTER_API_KEY."}` 2 → `400` `{"error":"No openrouter image key available. Add your own in Settings, or set OPENROUTER_API_KEY."}` Both name the exact env var a self-hoster must set.
- **Watch:** The env var name comes from `ENV[provider]`; for an unreachable `provider` value the fallback `'the API key'` applies. Confirm the real name appears, not the fallback.

### ERR-087 - The upstream status is mirrored, not flattened to 500
**P1** * Functional * `api/ai.js:109` / `api/ai-image.js:80`

- **Pre:** A real but invalid OpenRouter key.
- **Steps:**
  1. `curl -i -X POST .../api/ai -H 'content-type: application/json' -d '{"provider":"openrouter","userKey":"sk-or-v1-bogus","user":"hi"}'` and read the status line.
- **Expect:** The status is the provider's own (typically `401`), not `500`. The body is `{"error":"<provider message>"}`.
- **Watch:** The client only ever shows `j.error`, so the status matters mainly for debugging — but a flattened 500 makes every failure look like a server bug and hides quota (402/429) from `isQuotaErr`'s status check.

### ERR-088 - A platform timeout produces a status-only client message
**P1** * Edge * `api/ai.js:42-49 postJSON()` / `src/app.js:1250 aiText()`

- **Pre:** Production or `vercel dev`. Choose the slowest available model and ask for a very long answer (e.g. Settings → Text model set to a large reasoning model, then `read the full paper and write a 3000-word summary`).
- **Steps:**
  1. Send the request and watch the Network panel for `/api/ai`.
- **Expect:** The function's own abort is 60s (`api/ai.js:43`), but the Vercel platform timeout is shorter on most plans and fires first, returning a platform error page. `r.json()` then fails, `j` stays `{}`, and the client shows `AI request failed (504)` (or whatever status the platform used).
- **Watch:** A `504` with an HTML body is the realistic worst case and produces the least helpful message in the whole app. Record the exact status you get and file a P2 for a status-aware hint ("the model took too long — try a shorter question or a faster model").

### ERR-089 - A malformed request body is silently treated as an empty OpenRouter call
**P2** * Edge * `api/ai.js:34-38 readBody()`

- **Pre:** As above.
- **Steps:**
  1. `curl -i -X POST .../api/ai -H 'content-type: application/json' -d 'this is not json'`
- **Expect (as coded):** `readBody` swallows the parse error and returns `{}`, so `provider` defaults to `openrouter`, `system`/`user` default to empty strings, and the request goes upstream with an empty prompt using the **server's key**. The response is a 200 with whatever the model says to nothing.
- **Watch:** A malformed body burning shared quota is a minor abuse vector. Confirm the behaviour and file it as P2 — a `400 Bad request body` would be cheaper and clearer.

### ERR-090 - An image model that returns no image reports what it got back
**P1** * Copy * `api/ai-image.js:67,74`

- **Pre:** A working OpenRouter key. Settings → OpenRouter → **Image** model set to a **text-only** model, e.g. `openai/gpt-5.4`. Save. Tools → Enable generated visuals on.
- **Steps:**
  1. On a note, send `make a picture of the encoder stack`.
- **Expect:** The chat call succeeds but carries no image, so the proxy throws `OpenRouter returned no image. Model may not generate images. Response: <first 140 chars of what came back>`. In the note this becomes `⚠ Image generation failed: OpenRouter returned no image. Model may not generate images. Response: …` — or, if the planner also produced an `ascii`, it silently degrades to the diagram instead (ERR-076).
- **Watch:** The 140-character excerpt is genuinely useful for diagnosis — confirm it is present and is truncated, not the whole response. For the compat path the equivalent is the terser `No image returned` (`api/ai-image.js:74`), which tells the user nothing; note the asymmetry.

---

## 11. OCR and CDN-dependent features

### ERR-091 - The Tesseract CDN blocked reports a named failure
**P0** * Functional * `src/app.js:688 ensureTesseract()` / `src/app.js:779 runOcr()`

- **Pre:** A scanned/image-only PDF open, so the OCR banner appears: `This looks like a scanned PDF — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?` Network request blocking on for `*cdn.jsdelivr.net*`.
- **Steps:**
  1. Click **Run OCR**.
- **Expect:** The banner text changes to `Loading the OCR engine…`, the **Run OCR** button is replaced and the ✕ becomes a **Stop** button. When the script tag errors, the toast reads `OCR could not run: tesseract load failed` and the banner is removed by the `finally`.
- **Watch:** `ocrRunning` must be reset to `false` in the `finally` (`src/app.js:782`) or OCR is dead for the rest of the session with no way to know. Verify by unblocking the CDN and re-triggering (see ERR-092).

### ERR-092 - Retrying OCR after a load failure requires leaving and returning
**P1** * Edge * `src/app.js:725 detectAndOfferOcr()` / `src/app.js:783 runOcr()`

- **Pre:** Immediately after ERR-091. Unblock `*cdn.jsdelivr.net*`.
- **Steps:**
  1. Look for any way to re-run OCR from the current view.
  2. Switch to another document, then switch back.
- **Expect (as coded):** The banner was removed and `detectAndOfferOcr` only runs from `switchDoc` (`src/app.js:217`) and `boot` (`src/app.js:3352`), so there is **no** in-place retry. Switching away and back re-detects and re-offers the banner; `window.__tessLoad` was reset to `null` on error (`src/app.js:688`) so the retry genuinely re-fetches.
- **Watch:** Confirm `doc.ocrDismissed` was **not** set by the failure — only the ✕ button sets it (`src/app.js:750`). If a failed run marks the document as dismissed, the banner never returns and OCR is permanently unavailable for that PDF, which is P1.

### ERR-093 - The language data host blocked fails at worker creation
**P1** * Edge * `src/app.js:693 createTesseractWorker()`

- **Pre:** A scanned PDF. Network request blocking on for `*tessdata.projectnaptha.com*` **only** (leave jsdelivr open).
- **Steps:**
  1. Click **Run OCR** and wait.
- **Expect:** `ensureTesseract()` succeeds, then `Tesseract.createWorker('eng', …)` fails to fetch the traineddata and rejects. The toast reads `OCR could not run: <tesseract's message>` and the banner is removed.
- **Watch:** Tesseract may hang rather than reject on a blocked language fetch. There is **no timeout** around `createTesseractWorker`. If the banner sits on `Loading the OCR engine…` indefinitely, confirm the **Stop** button still works (it sets `ocrCancel`, but that is only checked inside the page loop, so it may not help) and file the missing timeout as P2.

### ERR-094 - Per-page OCR failures produce a false success message
**P0** * Functional * `src/app.js:775,791-793 runOcr()`

- **Pre:** A scanned PDF. Let OCR start successfully, then enable network blocking for `*cdn.jsdelivr.net*` mid-run so subsequent worker operations fail.
- **Steps:**
  1. Start OCR, block the CDN once the first page is in progress, and let the run finish.
  2. When it completes, try to select text on a page that was processed after the block.
  3. Use the find bar (Cmd/Ctrl+F) to search for a word visible on such a page.
- **Expect (as coded):** The per-page `catch` at `src/app.js:775` is **empty**, and `done++` runs regardless, so the final toast claims `OCR complete — N pages now searchable & highlightable.` while several of those pages have no text layer at all. Find returns `No results` for words that are plainly on the page.
- **Watch:** Confirm this and file as S3: the success count must exclude failed pages, or the toast must report both counts. A user who trusts "N pages now searchable" and then relies on the AI reading those pages gets confidently wrong answers.

### ERR-095 - Stopping OCR reports the honest partial count
**P1** * Copy * `src/app.js:761,791-793 runOcr()`

- **Pre:** A scanned PDF with 10+ pages. No CDN blocks.
- **Steps:**
  1. Click **Run OCR**, let 2-3 pages complete, then click **Stop**.
- **Expect:** The banner immediately shows `Finishing current page…`; when the current page finishes, the banner disappears and the toast reads `OCR stopped — 3 pages done.` (singular `page` when the count is 1). The pages that *were* processed must be selectable and searchable.
- **Watch:** The completed pages are cached to IndexedDB per page (`idbPut('ocr:' + doc.sha, store)` at `src/app.js:775`), so re-running later must resume, not restart — confirm the second run's page count starts from the remainder.

### ERR-096 - Switching documents mid-OCR cannot corrupt the other document
**P0** * State * `src/app.js:206,766,786 runOcr()`

- **Pre:** Two documents: a scanned PDF and a normal text PDF.
- **Steps:**
  1. Start OCR on the scanned PDF.
  2. After the first page completes, click the other document in the sidebar.
  3. Wait 30s, then switch back.
- **Expect:** `switchDoc` removes `#ocrBanner` and sets `ocrCancel = true` (`src/app.js:206`). The `active()` guard (`src/app.js:766`) stops results being applied to the wrong document. The text PDF is completely unaffected — no phantom OCR text layer, no altered `pageTextCache`. Returning to the scanned PDF shows the pages that did complete as selectable.
- **Watch:** A completion toast (`OCR stopped — N pages done.`) can fire *after* you have switched, so it appears while looking at the other document. That is confusing but not corrupting — note it as P2. The S1 case is OCR words appearing over the wrong PDF's pages.

### ERR-097 - MathJax blocked leaves raw LaTeX and never retries
**P0** * Functional * `src/app.js:2051-2064 ensureMathJax()` / `src/app.js:2072 typesetMath()`

- **Pre:** Network request blocking on for `*cdnjs.cloudflare.com*`. A note whose AI answer contains math (or import a `.notes.json` containing `\( E = mc^2 \)` in an answer).
- **Steps:**
  1. Load the app and expand the note.
  2. Unblock the CDN **without reloading**, then click another note and back, forcing several re-renders.
- **Expect:** Step 1 → the math renders as literal text `\( E = mc^2 \)` inside the answer. No error toast — this is a deliberate silent degradation. Step 2 → **still** literal text: `ensureMathJax` returns immediately because `window.MathJax` was set to the config object at `src/app.js:2054` *before* the script tag, and remains truthy after `onerror`. Only a reload recovers.
- **Watch:** Confirm the answer text itself is fully readable in its raw form (nothing is hidden or clipped), and that a reload with the CDN unblocked renders the math properly. The permanent-until-reload behaviour is worth a P2 filing: clearing `window.MathJax` in `onerror` would make it self-heal.

### ERR-098 - Google Fonts blocked degrades type without breaking layout
**P2** * Visual * `app.html:10`

- **Pre:** Network request blocking on for `*fonts.googleapis.com*`.
- **Steps:**
  1. Reload `/app.html` and check every breakpoint: 1440, 1101, 1099, 820, 560, 390.
  2. Open Settings, the export view, and a note with a long AI answer.
- **Expect:** Inter is unavailable and the system sans is used. Nothing overflows, no button label wraps to two lines, no toolbar item is clipped, and the notes cards keep their heights.
- **Watch:** System fonts are wider than Inter at the same size. The reader toolbar at 1099-820px and the tool buttons are the first things to overflow. Compare against a font-enabled screenshot at the same width rather than judging by eye.

---

## 12. Small guarded paths and degraded tools

### ERR-099 - A capture box drawn off the page is refused with instructions
**P1** * Copy * `src/app.js:1055,1065 captureRegion()`

- **Pre:** A document open, continuous mode **on**, zoomed out so grey margin is visible beside the page.
- **Steps:**
  1. Pick the screenshot tool (the fourth tool).
  2. Drag a box entirely in the grey margin beside the page.
  3. Drag a box that starts on the page but extends past its right edge so the clipped width is under 12px.
- **Expect:** Both produce `Draw the box over a page to capture it.` — an instruction, not an accusation. The screenshot tool stays active so the user can immediately try again; the capture mask and the `Cancel` bar remain visible.
- **Watch:** Step 3 exercises the second call site (`src/app.js:1065`), which computes the clipped size after intersecting with the canvas. Both must produce the same message. Also confirm a box under 12×12px is dropped by `initCaptureMask` (`src/app.js:939`) **without** any toast — a stray click while the tool is active must be silent, not an error.

### ERR-100 - Capturing with nothing rendered
**P1** * Edge * `src/app.js:1061 captureRegion()`

- **Pre:** Trigger the reader fallback (ERR-011 or ERR-020) so `viewport` is null but the shell is alive.
- **Steps:**
  1. Pick the screenshot tool and drag a box across the fallback card.
- **Expect:** `Nothing to capture here.` No exception in the console, no half-created annotation in the notes list.
- **Watch:** Check the note count before and after. `newAnnotation()` runs *after* both guards (`src/app.js:1072`), so nothing should be created — but a regression that reorders the guard would leave an empty screenshot note with a null image, which then renders `<img src="">` and breaks the card.

### ERR-101 - A denied clipboard falls back, and a failed fallback says so
**P1** * Functional * `src/app.js:1778 fallbackCopy()` / `src/app.js:1782 copyTextToClipboard()`

- **Pre:** A note with an AI answer. In the console, break the modern path: `navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));`
- **Steps:**
  1. Hover the AI reply → click the copy icon (`Copy this response`).
  2. Paste into a text editor.
  3. Now also break the fallback: `document.execCommand = () => { throw new Error('nope'); };` and repeat.
- **Expect:** Step 1-2 → `fallbackCopy` runs the hidden-textarea `execCommand('copy')` route and the toast still reads `Response copied to clipboard.` — the paste works. Step 3 → `Copy failed — select the text and copy manually.` as an error toast, with an actionable instruction.
- **Watch:** Verify the hidden textarea is removed from the DOM in both cases (`document.querySelectorAll('textarea[style*="opacity: 0"]').length` must be 0). A leaked focused textarea steals every subsequent keystroke. Also test Safari, where `navigator.clipboard.writeText` outside a user gesture rejects naturally.

### ERR-102 - Asking about a document when none is open
**P1** * Copy * `src/app.js:1670 askAboutDocument()`

- **Pre:** The empty-library state from ERR-014 (`pdfDoc` is null).
- **Steps:**
  1. Type `summarise this paper` into the bottom composer (`Ask about this document…`) and press Enter.
- **Expect:** Error toast `Open a document first.` No annotation is created, the composer keeps its text or clears cleanly (record which), and nothing is sent to `/api`.
- **Watch:** Confirm no network request fires — a request with no document would burn quota for nothing. Check the Network panel filtered on `api/ai`.

### ERR-103 - An invalid page number reverts instead of erroring
**P1** * Functional * `src/app.js:3089 wire()` (`commitPage`)

- **Pre:** A 16-page document open, currently on page 5.
- **Steps:**
  1. Click the page field, type `abc`, press Enter.
  2. Type `0`, press Enter.
  3. Type `-3`, press Enter.
  4. Type `9999`, press Enter.
  5. Clear the field entirely and press Enter.
- **Expect:** Cases 1, 2, 3 and 5 → the digits are stripped, `v` is falsy or `<1`, so the field silently resets to `5` and the reader does not move. **No toast** — this is input correction, not an error. Case 4 → `gotoPage(9999)` clamps to `16` and navigates there.
- **Watch:** Case 3 (`-3`) strips to `3` after the non-digit removal, so it navigates to page 3 rather than reverting. Confirm which happens and that it is at least harmless. A blur without Enter must behave identically (the `onchange` handler shares `commitPage`).

### ERR-104 - A failed web-search tool does not fail the answer
**P1** * Functional * `src/app.js:1407-1414 agentWeb()` / `src/app.js:1437 runAgentTool()`

- **Pre:** A working AI setup. Settings → Tools → **Allow external web search** on. Save.
- **Steps:**
  1. Ask a question that forces the tool, e.g. `has this paper been superseded? check the web`.
  2. When the status shows `Searching the web…`, switch DevTools to **Offline** briefly, then back online.
  3. When the answer arrives, expand `Show the agent's work`.
- **Expect:** `agentWeb` catches its own failure and **returns** the string `Web search error: <message>` as the tool result rather than throwing. The agent continues, produces a text answer from the document, and the trace shows a `🔧 Tool call · web_search` step whose **Result** block contains that string. The provenance chips read `No external sources` (because `used.has('web_search')` is true, they will actually read `Used web search` — record which).
- **Watch:** The chip is derived from whether the tool was *called*, not whether it *succeeded* (`src/app.js:1455`). A failed web search that still stamps `Used web search` on the answer is a provenance lie — file it as P1 if you see it. Also confirm `runAgentTool`'s outer catch produces `Tool error: <message>` for a genuinely thrown tool, and `Unknown tool: <name>` for an unrecognised name.

---

## 13. Empty states that must not read as errors

### ERR-105 - The notes list has three distinct empty messages
**P1** * Copy * `src/app.js:2095-2099 render()`

- **Pre:** A document with several notes.
- **Steps:**
  1. Delete all notes for the document (notes header → trash icon → confirm `Delete all N notes for “<name>”? This cannot be undone.` → **Delete all**).
  2. Restore them (import a notes file), then set the funnel filter to **Screenshots** on a document with no screenshots.
  3. Clear the filter and type `zzzqqq` into the notes search.
- **Expect, verbatim:**
  - No notes at all → `No notes yet.` then a line break then `Select text or capture a figure in the document to create a source-linked note.`
  - A filter with no matches → `No notes match this filter.`
  - A search with no matches → `No notes match “zzzqqq”.` (curly quotes around the query)
  All three use the muted `.empty` style (`src/styles.css:353`), never red, never a toast.
- **Watch:** The search message interpolates the query through `esc()`. Search for `<b>x</b>` and confirm it appears literally inside the curly quotes. Also confirm step 1's toast is `Deleted all notes for this document.` and the earlier `No notes to delete for this document.` (when there were none) is **not** styled as an error.

### ERR-106 - The library views have three distinct empty messages
**P1** * Copy * `src/app.js:375 renderTree()`

- **Pre:** A library with at least one document, nothing starred, nothing trashed.
- **Steps:**
  1. Click **Trash** in the sidebar.
  2. Click **Starred**.
  3. Trash and permanently delete everything, then return to **Home**.
- **Expect, verbatim:** `Trash is empty.` / `No starred documents yet.` / `No documents yet — use “Open PDF or bundle” to add one.` All rendered in `.lib-empty` (muted, 12.5px).
- **Watch:** The Home message quotes the button label `Open PDF or bundle` with curly quotes — it must match the actual button text in `app.html:21`. If the button is ever relabelled, this string has to change with it, and nothing enforces that.

### ERR-107 - The export sheet and the find bar report emptiness, not failure
**P1** * Copy * `src/app.js:2903 buildSheet()` / `src/app.js:2962,2972 findRun()`

- **Pre:** A document with only screenshot notes.
- **Steps:**
  1. Notes header → the PDF icon (`Export annotations to PDF`) → untick **Screenshots** in the Include list.
  2. Back to the document. Open the find bar (Cmd/Ctrl+F) and search for `zzzqqq`.
  3. Trigger the empty reader (ERR-014), then open the find bar and search for anything.
- **Expect:** 1 → the preview sheet shows `Nothing selected to export. Toggle include options or add notes.` — it names both fixes. 2 → the find bar count reads `No results`. 3 → also `No results` (the `!pdfDoc` guard at `src/app.js:2962`), never a hang on `Searching…`.
- **Watch:** Step 3's message is technically wrong — there is no document, not zero results — but it is harmless. What must not happen is `Searching…` left permanently in the count, which means `findRun` threw. Also confirm `⭳ Export PDF` on an empty sheet opens the print dialog with a blank page rather than throwing.

---

## 14. Recovery sweep

### ERR-108 - No failure path leaves a modal, mask or banner stuck
**P0** * State * `src/app.js:2176 confirmDialog()` / `src/app.js:2489 maybeShowSaveAsTip()` / `src/app.js:737 restackBanners()`

- **Pre:** A full pass through sections 4, 6, 7 and 9 already run in this browser session, without reloading.
- **Steps:**
  1. Run `document.querySelectorAll('.modal-mask, .confirm-mask, .popover, .top-banner').length` in the console.
  2. Click anywhere in the reader, select text, and open Settings.
- **Expect:** `0`. No invisible `.modal-mask` (which is `position:fixed;inset:0` at z-index 120/200 and would swallow every click), no orphaned `.popover`, no stacked banners left behind after their documents were closed.
- **Watch:** `confirmDialog` removes its mask in `done()` for all four dismissal routes; `maybeShowSaveAsTip` removes its own in `done()`. The classic leak is a `keydown` listener registered with `{capture:true}` and never removed — check `getEventListeners(document).keydown.length` in Chrome after several dialogs and confirm it does not grow monotonically.

### ERR-109 - Every confirmDialog dismissal route resolves and does nothing destructive
**P0** * Functional * `src/app.js:2176-2192 confirmDialog()`

- **Pre:** A document with at least 5 notes, plus a second document in the library.
- **Steps:**
  1. Notes header → trash icon → `Delete all 5 notes for “<name>”? This cannot be undone.` → press **Escape**.
  2. Repeat → click the dimmed backdrop outside the box.
  3. Repeat → click **Cancel**.
  4. Repeat → press **Enter** without clicking anything.
  5. Sidebar → Trash → a document's red trash icon → `Permanently delete “<name>”…? This cannot be undone.` → press **Escape**.
- **Expect:** Routes 1, 2 and 3 all resolve `false`: the 5 notes are intact, no toast. Route 4 resolves `true` (Enter is bound to OK, and OK is auto-focused after 30ms) and deletes — so **Enter is destructive by default** on a danger dialog. Route 5 leaves the document in Trash.
- **Watch:** Route 4 is the one to scrutinise. On a `danger:true` dialog, defaulting Enter and the initial focus to the destructive button is a data-loss hazard — a user dismissing an unrelated dialog with a habitual Enter deletes their notes. File as P1 with the fix: focus **Cancel** when `opts.danger`.

### ERR-110 - After every failure in this document, the app is still usable without a reload
**P0** * Regression * whole document

- **Pre:** A single browser session in which you have run, in order: ERR-020 (corrupt PDF), ERR-025 (bad notes JSON), ERR-028 (bad HTML), ERR-032 (quota), ERR-048 (cancelled Save As), ERR-065 (offline AI), ERR-091 (OCR CDN blocked), ERR-097 (MathJax blocked). Do **not** reload at any point. Restore the network and clear all CDN blocks before starting this check.
- **Steps:**
  1. Switch to the bundled sample document.
  2. Render page 1, zoom in, zoom out, jump to the last page.
  3. Select text → **Highlight**; select other text → **✦ Ask AI** → send a question and let it answer.
  4. Capture a figure with the screenshot tool.
  5. Open the find bar and search for a word you can see.
  6. Notes header → **Save notes** → complete the dialog.
  7. Open Settings, switch all three tabs, press **Save**.
  8. Toggle continuous mode off and on.
- **Expect:** Every one of the eight steps works exactly as it would in a fresh session. No lingering error toast. `#readerFallback` is gone. The console has no uncaught errors accumulated from the earlier failures.
- **Watch:** The specific carry-over risks are: `rendering`/`renderQueued` left `true` after a failed render (page navigation then does nothing); `ocrRunning` left `true` (OCR permanently unavailable); `state.ui.streamingId` left set (the notes list auto-scrolls forever); `_contIO` observing detached nodes after a failed `buildContinuous`. Check each in the console: `rendering` is not exposed, so infer it from behaviour — if page next/prev stops working after step 2, that is the flag.

---

## Coverage map
| Code or element | Checks |
|---|---|
| `toast()` src/app.js:29 | ERR-004, ERR-005, ERR-006, ERR-007, ERR-008, ERR-009, ERR-010 |
| `loadState()` src/app.js:74 | ERR-033, ERR-034 |
| `save()` quota branch src/app.js:151-167 | ERR-032, ERR-033, ERR-034 |
| `idbOpen()` src/app.js:123 / `rehydrateAssets()` src/app.js:144 | ERR-002, ERR-035, ERR-036 |
| `sha256Hex()` src/app.js:181 | ERR-037 |
| `loadDocBytes()` src/app.js:196 | ERR-018, ERR-036, ERR-053 |
| `switchDoc()` src/app.js:203-218 | ERR-017, ERR-018, ERR-020, ERR-092, ERR-096 |
| `openPdfFile()` src/app.js:219 | ERR-020, ERR-021, ERR-022, ERR-023, ERR-024 |
| `openFiles()` src/app.js:255 | ERR-001, ERR-008, ERR-023, ERR-025, ERR-031 |
| `importSharedHTML()` src/app.js:279 | ERR-028, ERR-029, ERR-030 |
| `attachNotesFile()` src/app.js:310 | ERR-026, ERR-027 |
| `renderTree()` empty branch src/app.js:375 | ERR-106 |
| `updateStorage()` src/app.js:396 | ERR-004, ERR-038 |
| `setupWorker()` src/app.js:410 | ERR-015, ERR-016 |
| `initPdf()` src/app.js:445 | ERR-011, ERR-013, ERR-020, ERR-022 |
| `renderPage()` fallback clearing src/app.js:460-461 | ERR-011, ERR-013 |
| `buildContinuous()` src/app.js:519-522 | ERR-013, ERR-110 |
| `ensureTesseract()` src/app.js:680 | ERR-091, ERR-092 |
| `createTesseractWorker()` src/app.js:693 | ERR-093 |
| `detectAndOfferOcr()` src/app.js:725 / `showOcrBanner()` src/app.js:741 | ERR-091, ERR-092 |
| `runOcr()` src/app.js:753 | ERR-091, ERR-094, ERR-095, ERR-096 |
| `captureRegion()` src/app.js:1047 | ERR-099, ERR-100 |
| `aiText()` src/app.js:1244 | ERR-063, ERR-064, ERR-072, ERR-088 |
| `aiImage()` src/app.js:1253 | ERR-076, ERR-090 |
| `aiClassify()` src/app.js:1264 / `routeAndAct()` src/app.js:1637 | ERR-075 |
| `askAI()` src/app.js:1351 | ERR-063, ERR-066, ERR-067 |
| `agentWeb()` src/app.js:1407 / `runAgentTool()` src/app.js:1428 | ERR-104 |
| `aiAgentStep()` src/app.js:1440 | ERR-073 |
| `askAIAgent()` src/app.js:1458 | ERR-065, ERR-073, ERR-074 |
| `stripJson()` src/app.js:1511 | ERR-077 |
| `generateVisual()` src/app.js:1535 | ERR-076, ERR-077, ERR-090 |
| `errHint()` src/app.js:1594 | ERR-063, ERR-064, ERR-065, ERR-067 |
| `askAboutDocument()` src/app.js:1669 | ERR-102 |
| `fallbackCopy()` src/app.js:1778 / `copyTextToClipboard()` src/app.js:1782 | ERR-101 |
| `msgCard()` error branch src/app.js:1805-1806, 1818-1819 | ERR-065, ERR-066, ERR-077 |
| `ensureMathJax()` src/app.js:2051 / `typesetMath()` src/app.js:2072 | ERR-097 |
| `render()` empty branch src/app.js:2095-2099 | ERR-105 |
| `confirmDialog()` src/app.js:2176 | ERR-059, ERR-108, ERR-109 |
| `applyNotesJSON()` src/app.js:2316 | ERR-057, ERR-058 |
| `chooseNotesFolder()` src/app.js:2332 | ERR-039, ERR-040, ERR-041 |
| `notesDirHandle()` src/app.js:2343 | ERR-042, ERR-043, ERR-045 |
| `writeNotesToFolder()` src/app.js:2352 | ERR-042, ERR-043, ERR-044 |
| `loadNotesFromFolder()` src/app.js:2361 | ERR-045, ERR-046 |
| `findFolderNotes()` src/app.js:2373 / `maybeOfferFolderNotes()` src/app.js:2396 | ERR-047 |
| `openNotesFileFor()` src/app.js:2435 | ERR-059, ERR-060 |
| `scheduleFolderSync()` src/app.js:2451 | ERR-042 |
| `maybeShowSaveAsTip()` src/app.js:2460 | ERR-050, ERR-051, ERR-108 |
| `saveAsFile()` src/app.js:2503 | ERR-048, ERR-049, ERR-050, ERR-056 |
| `downloadNotesJSON()` src/app.js:2524 | ERR-049, ERR-052 |
| `importNotesJSON()` src/app.js:2533 | ERR-057, ERR-058 |
| `exportSelfContainedHTML()` src/app.js:2553 | ERR-053, ERR-054, ERR-055, ERR-056 |
| `saveNotesNow()` src/app.js:2607 | ERR-043, ERR-048 |
| `clearActiveNotes()` src/app.js:2634 | ERR-006, ERR-105, ERR-109 |
| `exportPrompts()` src/app.js:2734 / `importPrompts()` src/app.js:2746 | ERR-061, ERR-062 |
| `openSettings()` src/app.js:2760 | ERR-071, ERR-072 |
| `buildSheet()` empty branch src/app.js:2903 | ERR-107 |
| `findRun()` src/app.js:2956-2972 | ERR-094, ERR-107 |
| `wire()` `commitPage` src/app.js:3089 | ERR-103 |
| `wire()` file input + drop catches src/app.js:3068, 3081 | ERR-008, ERR-031 |
| `showReaderFallback()` src/app.js:3180 | ERR-011, ERR-012, ERR-013, ERR-018, ERR-020, ERR-100 |
| `showEmptyReader()` src/app.js:3197 | ERR-014, ERR-102, ERR-107 |
| `applyReadOnly()` src/app.js:3294 | ERR-064 |
| `boot()` 7s race src/app.js:3303, 3341-3347 | ERR-011, ERR-012, ERR-013, ERR-019, ERR-036 |
| `api/ai.js` method guard (79) | ERR-078 |
| `api/ai.js` provider guard (86) | ERR-080, ERR-073 |
| `api/ai.js` compat-needs-own-key (91) | ERR-082 |
| `api/ai.js` missing key (93-94) | ERR-067, ERR-086 |
| `api/ai.js` HTTPS + COMPAT_HOSTS (22-26, 96-99) | ERR-072, ERR-084, ERR-085 |
| `api/ai.js` isQuotaErr + QUOTA_MSG (31-32, 108) | ERR-068, ERR-069 |
| `api/ai.js` status mirroring + postJSON abort (42-49, 109) | ERR-070, ERR-087, ERR-088 |
| `api/ai.js` readBody (34-38) | ERR-089 |
| `api/ai-image.js` method + provider guards (38, 42) | ERR-079, ERR-081 |
| `api/ai-image.js` key + host guards (45, 48, 50-53) | ERR-083, ERR-084, ERR-085, ERR-086 |
| `api/ai-image.js` no-image errors (67, 74) | ERR-090 |
| `src/styles.css:355-360` (`#toasts`, `.toast.err`) | ERR-005, ERR-006, ERR-009 |
| `src/styles.css:453-455` (`#readerFallback`) | ERR-011, ERR-014 |
| `src/styles.css:584` (mobile toast offset) | ERR-010 |
| `src/styles.css:657-670` (`.top-banner`) | ERR-091, ERR-095, ERR-108 |
| `app.html:10` (Google Fonts link) | ERR-016, ERR-098 |
| `app.html:130-131` (vendored PDF.js + worker) | ERR-015, ERR-016 |

## Deliberately not covered here
- Whether opening a PDF, importing notes, syncing to a folder or exporting a shared file **works** on the happy path — the pickers, the success toasts, the merge semantics, the round trip - covered in **04 - Document lifecycle**, **10 - Storage and persistence** and **11 - Share and export**. Only the failing branches appear here.
- Whether a hostile `.notes.json` or `.annotated.html` can execute script, leak a key, or turn the proxy into an SSRF vector - covered in **13 - Security and privacy**. This document only checks that the *guards produce a usable message*; that document checks that the guards *hold*.
- AI answer quality, the ReAct tool-selection strategy, provenance chip contents, the trace viewer's layout, and the intent router's accuracy on well-formed input - covered in **08 - AI and agent**. Only failed calls and degraded routing appear here.
- OCR accuracy, the scanned-page detection heuristic, the text-layer geometry, and the OCR cache's hit rate - covered in **09 - OCR**. Only engine-load and per-page failures appear here.
- Memory ceilings, render throughput, very large PDFs and very large notes files as *performance* concerns - covered in **17 - Performance and limits**. Where a size limit produces a *message*, that message is checked here.
- Which browsers support `showSaveFilePicker` / `showDirectoryPicker` and the general feature matrix - covered in **16 - Cross-browser and platform**. Only the fallbacks' error copy appears here.
- Keyboard reachability of the confirm dialog, focus trapping in modals, `aria-live` on the toast region, and screen-reader announcement of error text - covered in **15 - Accessibility**.
- Toast, banner and fallback-card *layout* at each breakpoint as a general responsive concern - covered in **14 - Responsive, mobile and touch**. Only ERR-010's tools-bar collision is checked here, because it makes an error state block recovery.
- Settings validation and the Templates editor as features (field behaviour, the "customized" badge, reset-to-default) - covered in **12 - Settings and templates**.
