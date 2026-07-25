# 04 - Document lifecycle: open, identify, organise, delete

> Every way a document enters, is identified, is switched between, is organised and finally leaves the PairedX library — including the SHA-256 content addressing that makes notes re-attach, and every fallback shown when a document cannot load.

| | |
|---|---|
| **ID prefix** | DOC |
| **Scope** | Opening PDFs / `.notes.json` / shared `.annotated.html` / multi-file / drag-and-drop; SHA-256 content addressing and de-duplication; switching documents; star / trash / restore / purge; the Home, Recents, Starred and Trash views; the bundled sample paper and its seeding; the reader fallback when a document cannot load. |
| **Primary code** | `src/app.js:54-118`, `src/app.js:177-408`, `src/app.js:2266-2449`, `src/app.js:3009-3022`, `src/app.js:3058-3085`, `src/app.js:3180-3210`, `src/app.js:3283-3353`, `app.html:16-41`, `src/styles.css:54-81`, `src/styles.css:453-454`, `src/styles.css:657-674` |
| **Checks** | 122 |

## Contents
- [1. Boot and the bundled sample](#1-boot-and-the-bundled-sample) - 12 checks
- [2. Opening a PDF via the file picker](#2-opening-a-pdf-via-the-file-picker) - 14 checks
- [3. SHA-256 content addressing and de-duplication](#3-sha-256-content-addressing-and-de-duplication) - 12 checks
- [4. Drag-and-drop onto the reader](#4-drag-and-drop-onto-the-reader) - 10 checks
- [5. Notes sidecars: matching and attaching](#5-notes-sidecars-matching-and-attaching) - 15 checks
- [6. Shared .annotated.html import](#6-shared-annotatedhtml-import) - 10 checks
- [7. Switching documents](#7-switching-documents) - 11 checks
- [8. Library views: Home, Recents, Starred, Trash](#8-library-views-home-recents-starred-trash) - 13 checks
- [9. Star, trash, restore, purge](#9-star-trash-restore-purge) - 15 checks
- [10. Fallback and failure states](#10-fallback-and-failure-states) - 10 checks

**Standing test fixtures.** Prepare these once; most checks reuse them.

| Fixture | How to make it |
|---|---|
| `bert.pdf` | The bundled sample's own bytes. In DevTools console on `/app.html`: `copy(window.SAMPLE_PDF_B64)`, decode to a file, or download any copy of the BERT paper. SHA-256 must be `987545ffb087f1ece898142c403a516baeabeb70ce19089397fac6f7db12c3d4` (786,279 bytes). |
| `paper-a.pdf` | Any real multi-page PDF, ~2-10 MB. |
| `paper-a-renamed.pdf` | A byte-identical copy of `paper-a.pdf` under a different filename. |
| `paper-a-tweaked.pdf` | `paper-a.pdf` with one byte changed (e.g. append a space to the trailing `%%EOF` line). |
| `paper-a.notes.json` | Produced by the Save-notes button while `paper-a.pdf` is active. |
| `huge.pdf` | A PDF over 50 MB / 400+ pages. |
| `fake.pdf` | A text file renamed to `.pdf`. |
| `notes.txt` | Any plain-text file. |
| `paper-a.annotated.html` | Produced by "Share as HTML" while `paper-a.pdf` is active. |

**Reset procedure** (referred to as "a clean profile"): DevTools → Application → Storage → *Clear site data* (Local Storage `srw_state_v1` **and** IndexedDB `srw_assets`), then reload `/app.html`.

---

## 1. Boot and the bundled sample

### DOC-001 - Clean profile boots straight into the bundled sample
**P0** * Functional * `src/app.js:3303 boot()`, `src/app.js:54 defaultState()`

- **Pre:** Clean profile (localStorage + IndexedDB cleared).
- **Steps:**
  1. Load `/app.html`.
  2. Wait for the reader to finish its first render.
- **Expect:** The left sidebar section header reads "My Library" and holds exactly one row labelled "BERT — Devlin et al. 2019 (NAACL).pdf". The row is styled active (blue tint, red file icon). Page 1 of the BERT paper renders in the reader. `#pageTotal` shows the paper's real page count, not "/ 1".
- **Watch:** The sample name is a single string constant (`SAMPLE_DOC_NAME`, `src/app.js:38`) — a rename that misses `migrateState` (`src/app.js:115`) leaves existing installs on the old label while fresh ones show the new one.

### DOC-002 - Sample seeds exactly 12 notes on the expected pages
**P0** * Functional * `src/app.js:3009 seed()`, `assets/sample-notes.js`

- **Pre:** Clean profile, freshly booted.
- **Steps:**
  1. Read the notes-panel footer counter.
  2. Set the sort control to "Sorted by page ▾" and scroll the list.
- **Expect:** Footer reads "12 notes". Notes exist on pages 1, 2, 3, 4, 5 and 8 and nowhere else. Pins on the page are numbered 1..12 with no gaps and no repeats, ascending top-to-bottom within each page.
- **Watch:** `renumber()` (`src/app.js:1087`) only numbers the **active** document — a seeding change that leaves `a.doc` unset produces pins numbered from a mixed pool.

### DOC-003 - Reload does not re-seed or duplicate the sample notes
**P0** * State * `src/app.js:3347 boot()`, `src/app.js:39 SEED_VERSION`

- **Pre:** DOC-002 passed (12 notes present).
- **Steps:**
  1. Reload the page three times.
  2. Re-read the footer counter after each reload.
- **Expect:** Still "12 notes" every time — never 24 or 36. Only one "BERT — Devlin et al. 2019 (NAACL).pdf" row in the library.
- **Watch:** Seeding is gated on `state.seedVersion !== SEED_VERSION`; if a build writes `seedVersion` before `seed()` runs, or forgets to write it at all, every reload re-seeds and silently discards user edits.

### DOC-004 - Edits to seeded notes survive a reload
**P1** * State * `src/app.js:3009 seed()`, `src/app.js:3347 boot()`

- **Pre:** Sample loaded with its 12 notes.
- **Steps:**
  1. Delete one sample note (card menu → "Delete note" → "Delete").
  2. Edit the text of a second sample note.
  3. Reload.
- **Expect:** Footer reads "11 notes"; the edited text is still edited. Nothing is restored.
- **Watch:** `seed()` replaces *every* sample-doc annotation wholesale (`src/app.js:3015`) — any accidental re-entry into that branch is a silent data-loss bug that only shows up on reload.

### DOC-005 - A bumped SEED_VERSION re-seeds the sample and leaves other docs alone
**P1** * Regression * `src/app.js:3009 seed()`, `src/app.js:3347 boot()`

- **Pre:** Sample notes edited (DOC-004) **and** `paper-a.pdf` open with at least 2 notes of your own.
- **Steps:**
  1. DevTools → Application → Local Storage → `srw_state_v1`: change `"seedVersion":3` to `"seedVersion":2`. Save.
  2. Reload.
- **Expect:** The sample document is back to exactly 12 notes (your edits/deletions on the sample are gone — this is intended). `paper-a.pdf` still has your 2 notes, untouched.
- **Watch:** `seed()` preserves `others` (`src/app.js:3012`) by `docIdOf(a) !== 'sample'`. A regression here wipes every user document's notes on a version bump — the worst possible failure in this file.

### DOC-006 - The sample document record carries no SHA
**P1** * State * `src/app.js:67 defaultState()`, `src/app.js:2271 docNotesJSON()`

- **Pre:** Clean profile, sample active.
- **Steps:**
  1. Save the sample's notes (notes-panel Save button) and open the resulting JSON in a text editor.
- **Expect:** `document.sha256` is `null` and `document.name` is "BERT — Devlin et al. 2019 (NAACL).pdf".
- **Watch:** Because the sample has no `sha`, it can never win the content-addressed dedupe branch in `openPdfFile()` (`src/app.js:231`) or the sha branch in `attachNotesFile()` (`src/app.js:314`). Checks DOC-034 and DOC-051 depend on this; if a build starts stamping the sample's real hash, both change behaviour.

### DOC-007 - Sample bytes come from the inlined blob, never IndexedDB
**P2** * State * `src/app.js:196 loadDocBytes()`

- **Pre:** Clean profile, sample loaded and rendering.
- **Steps:**
  1. DevTools → Application → IndexedDB → `srw_assets` → `assets`. List the keys.
- **Expect:** No key named `pdf:sample`. (Keys like `shot:*` / `img:*` may exist from seeded screenshots.)
- **Watch:** If the sample ever gets persisted as bytes it costs ~1 MB of quota per profile for no benefit, and purging it would leave an orphan key.

### DOC-008 - The sample opens fully offline
**P1** * Edge * `src/app.js:199 loadDocBytes()`, `src/app.js:410 setupWorker()`

- **Pre:** Page loaded once (so the assets are cached), then DevTools → Network → *Offline*.
- **Steps:**
  1. Reload `/app.html` while offline.
- **Expect:** The sample renders and its 12 notes appear. No reader fallback card.
- **Watch:** `setupWorker()` falls back to a cdnjs URL (`src/app.js:421`) if neither the inlined worker nor the base64 worker is present — offline that fallback hangs until the 7 s boot race fires and you get the "Open this file directly to read the PDF" card instead of the paper.

### DOC-009 - Storage footer resolves from its placeholder
**P1** * Functional * `src/app.js:396 updateStorage()`, `app.html:36-40`

- **Pre:** Clean profile.
- **Steps:**
  1. Load `/app.html` and watch the bottom-left storage strip.
- **Expect:** It starts at "Calculating…" and within a second becomes a real estimate, e.g. "3 MB of 1.1 GB" (Chromium/Firefox). The blue bar is at least 2 % wide. In a browser without `navigator.storage.estimate`, it instead reads "1 documents".
- **Watch:** The fallback text is unpluralised by design (`src/app.js:407`) — "1 documents" is expected, not a typo to "fix" without changing the source.

### DOC-010 - Default library view is Home
**P2** * State * `src/app.js:69 defaultState()`, `src/app.js:368 renderTree()`

- **Pre:** Clean profile.
- **Steps:**
  1. Load `/app.html`.
- **Expect:** The "Home" nav item is highlighted (blue tint, `.nav-item.active`) and `#libSecLabel` reads "My Library". "Recents", "Starred" and "Trash" are unhighlighted.
- **Watch:** `state.ui.libView` persists; a stale `libView: "trash"` in an old profile must still resolve (the `|| 'home'` guards at `src/app.js:369-372`).

### DOC-011 - Continuous scroll is on by default for every profile
**P1** * State * `src/app.js:69 defaultState()`, `src/app.js:86 migrateState()`

- **Pre:** Clean profile, and separately a profile saved by an older build (edit `srw_state_v1` and delete the `_contDefaulted` key).
- **Steps:**
  1. Load `/app.html` in each case and look at the "Continuous scroll" toolbar button.
- **Expect:** Both boot with the button in its active state and pages stacked vertically.
- **Watch:** `_contDefaulted` is a one-shot flag — if it is written but `continuous` is not, an upgraded profile silently boots in single-page mode.

### DOC-012 - Sample paper is labelled and attributed correctly
**P2** * Copy * `src/app.js:38 SAMPLE_DOC_NAME`, `NOTICE`

- **Pre:** Sample loaded.
- **Steps:**
  1. Hover the sample row in the library.
  2. Open `NOTICE` in the repo.
- **Expect:** The row tooltip is the full string "BERT — Devlin et al. 2019 (NAACL).pdf" (em dash, not hyphen). `NOTICE` credits the paper under CC BY 4.0.
- **Watch:** A hyphen-for-em-dash swap breaks nothing functionally but breaks the filename-fallback match in DOC-051, because `notesFileName()` maps the em dash to `_`.

---

## 2. Opening a PDF via the file picker

### DOC-013 - "Open PDF or bundle" button copy, tooltip and action
**P0** * Copy * `app.html:21-22`, `src/app.js:3066 wire()`

- **Pre:** Any state.
- **Steps:**
  1. Read the label on the primary sidebar button.
  2. Hover it for a second.
  3. Click it.
- **Expect:** The label is exactly "Open PDF or bundle" with a folder icon. The tooltip is exactly "Open a PDF, notes (.json), or a shared paper (.html)". Clicking opens the OS file picker.
- **Watch:** Older copy called this "New" — the fallback card at `src/app.js:213` and `src/app.js:3192` still says "New", so a rename here creates an instruction that points at a button that no longer exists.

### DOC-014 - The file input accepts every supported type and multi-select
**P0** * Functional * `app.html:22`

- **Pre:** File picker open (DOC-013).
- **Steps:**
  1. In the picker, check the file-type filter and try to select two files at once.
- **Expect:** PDFs, `.json` and `.html`/`.htm` files are selectable (`accept="application/pdf,.json,application/json,.html,text/html"`); multi-select is allowed.
- **Watch:** Dropping `multiple` silently kills the "PDF + its notes in one gesture" flow (DOC-050) with no error anywhere.

### DOC-015 - Opening a fresh PDF: toast copy
**P0** * Copy * `src/app.js:219 openPdfFile()`

- **Pre:** Clean profile; `paper-a.pdf` never opened.
- **Steps:**
  1. Open `paper-a.pdf` through the picker.
- **Expect:** A toast reads exactly "Opened paper-a.pdf — highlight text or capture a figure to start." (filename verbatim, em dash).
- **Watch:** This is the *new document* toast. If it appears for a document already in the library, content addressing broke — see DOC-027.

### DOC-016 - A newly opened PDF becomes the active document and forces Home
**P0** * Functional * `src/app.js:241-249 openPdfFile()`

- **Pre:** Library view switched to "Starred" (which is empty).
- **Steps:**
  1. Open `paper-a.pdf`.
- **Expect:** The view flips to Home ("My Library" label, Home nav highlighted), a new row "paper-a.pdf" appears and is styled active, and the reader shows page 1 of that paper.
- **Watch:** `state.ui.libView = 'home'` is set *before* `switchDoc` (`src/app.js:244`); if the order flips, the new document opens but stays invisible behind the Starred filter.

### DOC-017 - Opening a PDF resets page and swaps the notes panel
**P1** * State * `src/app.js:208 switchDoc()`, `src/app.js:2084 render()`

- **Pre:** Sample active, scrolled to page 5, one note selected.
- **Steps:**
  1. Open `paper-a.pdf`.
- **Expect:** The page box reads "1", `#pageTotal` shows paper-a's page count, and the notes panel shows the empty state "No notes yet." followed by "Select text or capture a figure in the document to create a source-linked note." The footer counter reads "0 notes". No note card is selected and no connector line is drawn.
- **Watch:** `state.ui.activeId = null` on switch — a leftover activeId points at an annotation of the *previous* document and `drawConnector()` chases a card that no longer exists.

### DOC-018 - Re-picking the identical file twice in a row still fires
**P1** * Edge * `src/app.js:3068 wire()`

- **Pre:** `paper-a.pdf` already open.
- **Steps:**
  1. Click "Open PDF or bundle", choose `paper-a.pdf`, confirm.
  2. Immediately click "Open PDF or bundle" again and choose the very same file.
- **Expect:** Both attempts produce the "Reopened paper-a.pdf — same paper, your notes are here." toast. The second attempt is *not* silently ignored.
- **Watch:** `e.target.value = ''` (`src/app.js:3068`) is what makes a repeat selection re-fire `change`. Remove it and the second pick does nothing — a classic silent regression.

### DOC-019 - Cancelling the file picker is a no-op
**P1** * Edge * `src/app.js:3068 wire()`, `src/app.js:255 openFiles()`

- **Pre:** Sample active.
- **Steps:**
  1. Click "Open PDF or bundle", then dismiss the OS dialog with Escape / Cancel.
- **Expect:** No toast, no new library row, no reader flicker, active document unchanged.
- **Watch:** `openFiles()` returns early on an empty list (`src/app.js:257`); a refactor that toasts before that guard produces a spurious error on every cancel.

### DOC-020 - Opening several PDFs in one gesture
**P1** * Functional * `src/app.js:267 openFiles()`

- **Pre:** Clean profile.
- **Steps:**
  1. Open `paper-a.pdf`, `paper-a-tweaked.pdf` and `huge.pdf` together in one picker selection.
- **Expect:** One "Opened … — highlight text or capture a figure to start." toast per file, three new rows in the library, and the **last** PDF processed ends up active and rendered.
- **Watch:** The loop `await`s each open, so a slow/corrupt file in the middle stalls the rest — see DOC-026 for the failure branch.

### DOC-021 - A corrupt / mistyped PDF shows the reader fallback
**P1** * Error * `src/app.js:215 switchDoc()`, `src/app.js:3180 showReaderFallback()`

- **Pre:** Sample active.
- **Steps:**
  1. Open `fake.pdf` (a text file renamed `.pdf`).
- **Expect:** The toast "Opened fake.pdf — highlight text or capture a figure to start." fires, then the reader area replaces the page with a card headed "Open this file directly to read the PDF" and, at the bottom in small grey text, "Engine note: Could not open “fake.pdf” — it may not be a valid PDF."
- **Watch:** The headline is wrong for this case — `showReaderFallback()` always renders the sandboxed-preview headline and demotes the real reason to the "Engine note:" line. A tester who only reads the headline will file the wrong bug; a copy rework here must keep the specific reason readable.

### DOC-022 - A document that failed to parse still stays in the library
**P1** * Edge * `src/app.js:243 openPdfFile()`, `src/app.js:215 switchDoc()`

- **Pre:** DOC-021 just run.
- **Steps:**
  1. Look at the library list. Reload the page.
- **Expect:** A "fake.pdf" row is present both before and after the reload, still active, still showing the fallback card. It has to be removed by hand via "Move to trash".
- **Watch:** `state.docs.push()` happens before the parse attempt, so a bad file permanently occupies a row — verify Trash can actually remove it (DOC-101).

### DOC-023 - A very large PDF opens without freezing the UI
**P1** * Perf * `src/app.js:225 openPdfFile()`, `src/app.js:445 initPdf()`

- **Pre:** Clean profile.
- **Steps:**
  1. Open `huge.pdf` (50 MB+, 400+ pages).
  2. During the open, try to click a nav item and scroll the notes panel.
- **Expect:** Page 1 renders within a few seconds; the sidebar stays interactive; `#pageTotal` shows the real count. Background page-text pre-caching (kicked off 500 ms later at `src/app.js:217`) does not lock the main thread for more than a beat at a time.
- **Watch:** `await f.arrayBuffer()` plus `sha256Hex()` plus `idbPut` all run on the open path — a large file can blow the IndexedDB write and leave a row with no bytes (which then hits DOC-113 on the next reload).

### DOC-024 - A very long filename ellipsizes but is fully readable on hover
**P2** * Visual * `src/app.js:384-387 renderTree()`, `src/styles.css:72`

- **Pre:** A PDF renamed to ~150 characters.
- **Steps:**
  1. Open it and hover its library row.
- **Expect:** The row is one line with a trailing ellipsis; the star and trash buttons remain visible and clickable at the right edge; the native tooltip shows the complete filename.
- **Watch:** `.doc-name` relies on `min-width:0` inside the flex row — losing it pushes the action buttons out of the sidebar entirely.

### DOC-025 - A PDF with no file extension is detected by MIME type
**P1** * Edge * `src/app.js:259 openFiles()`

- **Pre:** Copy `paper-a.pdf` to a file named `paper-a` (no extension).
- **Steps:**
  1. Open it via the picker (you may need to switch the picker filter to "All files").
- **Expect:** It opens as a PDF. The library row is labelled exactly "paper-a" (no `.pdf` appended).
- **Watch:** `isPdf` accepts either the extension or `f.type === 'application/pdf'`; browsers that report an empty `type` for extensionless files will drop the file silently with no toast at all.

### DOC-026 - One bad file in a batch does not abort the batch
**P1** * Edge * `src/app.js:267 openFiles()`

- **Pre:** Clean profile.
- **Steps:**
  1. Select `paper-a.pdf`, a zero-byte file renamed `broken.pdf`, and `paper-a-tweaked.pdf` in one picker gesture.
- **Expect:** An error toast "Could not open broken.pdf: …" (the engine message follows the colon) **and** both good PDFs still open with their own success toasts.
- **Watch:** The `try/catch` is inside the loop — moving it outside means the first failure silently drops every remaining file.

---

## 3. SHA-256 content addressing and de-duplication

### DOC-027 - Same bytes, different filename: reopens instead of duplicating
**P0** * Functional * `src/app.js:227-240 openPdfFile()`, `src/app.js:181 sha256Hex()`

- **Pre:** `paper-a.pdf` already in the library with at least 3 notes on it. Sample is the active document.
- **Steps:**
  1. Open `paper-a-renamed.pdf` (byte-identical copy).
- **Expect:** Toast reads exactly "Reopened paper-a.pdf — same paper, your notes are here." The library still has exactly one row for that paper, still labelled "paper-a.pdf" (the original name), now active, with all 3 notes present in the panel and their highlights on the page.
- **Watch:** This is the headline promise of the feature. If it produces the "Opened …" toast plus a second row, content addressing is broken and every renamed/re-downloaded copy silently orphans its notes.

### DOC-028 - Reopened document's notes are the real ones, not a fresh empty set
**P0** * State * `src/app.js:232-239 openPdfFile()`

- **Pre:** DOC-027 just run.
- **Steps:**
  1. Read the notes footer counter and expand one note.
  2. Reload the page.
- **Expect:** Counter shows the original count (3). Note bodies, threads and screenshots are intact both before and after reload.
- **Watch:** The dup branch never touches `state.annotations` — a regression that re-imports or clears them shows up only in the counter.

### DOC-029 - Re-opening under a new name does not rename the library row
**P1** * State * `src/app.js:232-240 openPdfFile()`

- **Pre:** DOC-027 just run.
- **Steps:**
  1. Read the library row label and hover it.
- **Expect:** Still "paper-a.pdf" — the row is *not* renamed to "paper-a-renamed.pdf".
- **Watch:** Filename is deliberately not authoritative. If a build starts overwriting `d.name` on reopen, `notesFileName()` changes too and previously-saved sidecars stop matching by filename (DOC-051).

### DOC-030 - Re-opening restores bytes that were evicted from IndexedDB
**P1** * Edge * `src/app.js:233 openPdfFile()`, `src/app.js:196 loadDocBytes()`

- **Pre:** `paper-a.pdf` in the library with notes.
- **Steps:**
  1. DevTools → Application → IndexedDB → `srw_assets` → `assets`: delete the `pdf:doc_…` key for that document.
  2. Reload. Confirm the reader shows the fallback card for that document.
  3. Open `paper-a.pdf` from disk again.
- **Expect:** The paper renders again, the toast is "Reopened paper-a.pdf — same paper, your notes are here.", and the `pdf:doc_…` key is back in IndexedDB. No second row.
- **Watch:** The `if (!_docBytes[dup.id])` guard controls this re-write; if it is dropped, every reopen rewrites megabytes to IndexedDB for nothing.

### DOC-031 - One changed byte makes a different document
**P1** * Functional * `src/app.js:227-231 openPdfFile()`

- **Pre:** `paper-a.pdf` in the library.
- **Steps:**
  1. Open `paper-a-tweaked.pdf`.
- **Expect:** Toast "Opened paper-a-tweaked.pdf — highlight text or capture a figure to start." and a **second** row. The two documents have independent note sets.
- **Watch:** Over-eager matching (e.g. by name or size instead of hash) would merge two genuinely different revisions of a paper and mix their notes.

### DOC-032 - Re-opening a trashed PDF creates a second entry rather than restoring
**P1** * Edge * `src/app.js:231 openPdfFile()`, `src/app.js:333 trashDoc()`

- **Pre:** `paper-a.pdf` in the library with 3 notes.
- **Steps:**
  1. Move it to Trash.
  2. Open `paper-a.pdf` from disk again.
- **Expect:** Documented current behaviour — the dup lookup excludes trashed docs (`!d.trashed`), so you get "Opened paper-a.pdf — highlight text or capture a figure to start.", a **new empty** row in Home, and the old row (with the 3 notes) still sitting in Trash.
- **Watch:** This surprises users: their notes look lost. If product intent changes to auto-restore, this check must flip. Until then, a build that *does* restore is the regression.

### DOC-033 - No secure context: hashing degrades and every open duplicates
**P1** * Edge * `src/app.js:181 sha256Hex()`

- **Pre:** Serve the repo over plain `http://` on a LAN IP (not `localhost`), e.g. `python3 -m http.server` reached at `http://192.168.x.x:8000/app.html`.
- **Steps:**
  1. Open `paper-a.pdf`.
  2. Open the same `paper-a.pdf` again.
- **Expect:** No crash and no error toast. Both opens report "Opened paper-a.pdf — …" and two identical rows appear, because `crypto.subtle` is unavailable and `sha256Hex()` returns `null`.
- **Watch:** The degrade must stay *silent and non-fatal*; a thrown exception here would break document opening entirely on any non-HTTPS deployment.

### DOC-034 - The bundled sample does not de-duplicate against the real BERT PDF
**P1** * Edge * `src/app.js:67 defaultState()`, `src/app.js:231 openPdfFile()`

- **Pre:** Clean profile (sample present with its 12 notes).
- **Steps:**
  1. Open `bert.pdf` (SHA `987545ff…`, the sample's own bytes) from disk.
- **Expect:** Documented current behaviour — a **second** row appears alongside the sample, with its own empty note set and the "Opened bert.pdf — …" toast, because the sample record carries no `sha` (DOC-006).
- **Watch:** If someone adds `sha` to the sample record without also handling `kind: 'sample'` in `loadDocBytes()`, the dedupe will fire and the user's real BERT copy will silently be served the bundled bytes instead.

### DOC-035 - The document record persists its hash
**P2** * State * `src/app.js:243 openPdfFile()`

- **Pre:** `paper-a.pdf` opened over HTTPS or localhost.
- **Steps:**
  1. DevTools → Application → Local Storage → `srw_state_v1` → find the entry in `docs`.
- **Expect:** It has `id` (prefixed `doc_`), `name`, a 64-hex-character `sha`, `kind: "user"`, `addedAt` and `lastOpened` ISO timestamps.
- **Watch:** A missing `sha` on a user document means neither dedupe nor sidecar sha-matching will ever fire for it again.

### DOC-036 - Re-opening the already-active document does not reload the reader
**P1** * Functional * `src/app.js:204 switchDoc()`, `src/app.js:235 openPdfFile()`

- **Pre:** `paper-a.pdf` is the active document, scrolled to page 6.
- **Steps:**
  1. Open `paper-a-renamed.pdf` from disk.
- **Expect:** The "Reopened …" toast appears, the library re-renders, but the reader does **not** blank and re-render — `switchDoc` early-returns when the id is already active.
- **Watch:** Scroll position: because `switchDoc` returns before touching `state.ui.page`, the reader stays where it was. A refactor that removes the early return jumps the reader back to page 1 on every reopen.

### DOC-037 - De-duplication survives a full reload (hash comes from persisted state)
**P1** * State * `src/app.js:231 openPdfFile()`, `src/app.js:76 migrateState()`

- **Pre:** `paper-a.pdf` in the library.
- **Steps:**
  1. Reload the page (clearing the in-memory `_docBytes` cache).
  2. Open `paper-a-renamed.pdf`.
- **Expect:** "Reopened paper-a.pdf — same paper, your notes are here." — one row.
- **Watch:** Dedupe reads `d.sha` from persisted state, not from the byte cache; if a migration ever strips unknown doc fields, every reload resets dedupe.

### DOC-038 - A round-tripped copy (cloud download) still de-duplicates
**P1** * Edge * `src/app.js:227 openPdfFile()`

- **Pre:** `paper-a.pdf` in the library with notes.
- **Steps:**
  1. Upload `paper-a.pdf` to Google Drive / Dropbox, download it again (it will often come back as `paper-a (1).pdf`).
  2. Open the downloaded copy.
- **Expect:** "Reopened paper-a.pdf — same paper, your notes are here." — the "(1)" copy does not create a second row.
- **Watch:** Some cloud services re-encode PDFs on download; if the bytes change the hash changes and you correctly get a new document. Verify the bytes are actually identical (`shasum -a 256`) before filing this as a bug.

---

## 4. Drag-and-drop onto the reader

### DOC-039 - Drag hint appears over the reader with the exact prompt
**P0** * Visual * `src/app.js:3076 wire()`, `src/styles.css:673-674`

- **Pre:** Any document open.
- **Steps:**
  1. Drag `paper-a.pdf` from the desktop and hold it over the centre reader area.
- **Expect:** The reader gains a dashed violet outline inset from its edges, a tinted background, and a dark pill near the top reading exactly "Drop a PDF (+ its .notes.json), or a shared .html, to open it".
- **Watch:** The pill is a CSS `::after` on `#reader.drop-hint` — it needs `#reader` to be positioned; a layout change that makes `#reader` static drops the pill to the page origin.

### DOC-040 - Drag hint clears on leave and on drop
**P1** * Visual * `src/app.js:3077-3079 wire()`

- **Pre:** Drag in progress over the reader.
- **Steps:**
  1. Drag out of the reader without dropping.
  2. Drag in again and drop the file.
- **Expect:** The outline and pill disappear in both cases and never linger after the drop completes.
- **Watch:** `dragleave` fires when crossing onto child elements too; a stuck hint after dropping over the page canvas is the usual symptom.

### DOC-041 - Dropping a single PDF opens it
**P0** * Functional * `src/app.js:3078 wire()`, `src/app.js:255 openFiles()`

- **Pre:** Sample active.
- **Steps:**
  1. Drop `paper-a.pdf` onto the reader.
- **Expect:** Identical outcome to the picker path: "Opened paper-a.pdf — highlight text or capture a figure to start.", new active row, page 1 rendered.
- **Watch:** The browser must not navigate to the file — both `dragover` and `drop` call `preventDefault()`. A missing one replaces the whole app with the raw PDF.

### DOC-042 - Dropping a PDF together with its .notes.json attaches the notes
**P0** * Functional * `src/app.js:255 openFiles()`, `src/app.js:310 attachNotesFile()`

- **Pre:** Clean profile. Have `paper-a.pdf` and `paper-a.notes.json` (5 notes) side by side in a folder.
- **Steps:**
  1. Select both files and drop them onto the reader in one gesture.
- **Expect:** "Opened paper-a.pdf — highlight text or capture a figure to start." then "5 notes attached to “paper-a.pdf”." The notes panel shows 5 cards and the page shows their highlights. No "Have notes for …" banner appears.
- **Watch:** Ordering matters — PDFs are opened before notes are processed (`src/app.js:267` then `268`); a reordering means the notes have no document to match and you get the "don’t match an open document" error instead.

### DOC-043 - Dropping outside the reader is not handled
**P1** * Edge * `src/app.js:3072-3084 wire()`

- **Pre:** Sample active.
- **Steps:**
  1. Drag `paper-a.pdf` over the left sidebar and release.
  2. Repeat over the right notes panel.
- **Expect:** No drop hint appears in either place, and the browser does its default thing (usually navigating away to the file). Nothing is added to the library.
- **Watch:** Only `#reader` is wired. If this browser-navigation behaviour is judged unacceptable, the fix belongs in a separate change — this check exists so the current boundary is explicit and any accidental widening is noticed.

### DOC-044 - Dropping a folder is a no-op
**P1** * Edge * `src/app.js:3080 wire()`

- **Pre:** Sample active.
- **Steps:**
  1. Drop a folder containing PDFs onto the reader.
- **Expect:** The hint clears; no toast; nothing is added. (`dataTransfer.files` is empty or contains a directory entry that fails every type predicate.)
- **Watch:** On some platforms a dropped folder surfaces as a zero-byte file — that path must produce a "Could not open …" error toast rather than a half-created library row.

### DOC-045 - Dropping an unsupported file type is silently ignored
**P1** * Edge * `src/app.js:258-263 openFiles()`

- **Pre:** Sample active.
- **Steps:**
  1. Drop `notes.txt` onto the reader.
- **Expect:** The hint clears and absolutely nothing else happens — no toast, no row, active document unchanged.
- **Watch:** Silence is intended here but is easy to mistake for a broken drop target. If a future build adds an "Unsupported file" toast, this check must be updated rather than left failing.

### DOC-046 - Dropping many files at once
**P1** * Edge * `src/app.js:255 openFiles()`

- **Pre:** Clean profile.
- **Steps:**
  1. Drop five different PDFs in one gesture.
- **Expect:** Five toasts, five rows, the last one active and rendered. No dropped file is skipped.
- **Watch:** Each open awaits an IndexedDB write; on a slow disk the toasts stack — confirm the toast container does not overflow the viewport (`#toasts`).

### DOC-047 - Drop hint clears even when the open fails
**P2** * Edge * `src/app.js:3079-3081 wire()`

- **Pre:** Sample active.
- **Steps:**
  1. Drop a zero-byte file renamed `broken.pdf`.
- **Expect:** Hint clears immediately, then an error toast "Could not open broken.pdf: …" (or the reader fallback). The reader is never left with a permanent dashed outline.
- **Watch:** `rd.classList.remove('drop-hint')` runs before the await — moving it after the await leaves the outline stuck for the duration of a slow failure.

### DOC-048 - A shared read-only file has no drop target
**P1** * Functional * Firefox/Safari and Chromium * `src/app.js:3071 wire()`, `src/app.js:3294 applyReadOnly()`

- **Pre:** Open `paper-a.annotated.html` directly from disk (double-click).
- **Steps:**
  1. Drag any PDF over its reader area.
- **Expect:** No drop hint, no import. The sidebar shows no "Open PDF or bundle" button and no "Share as HTML" button; a strip at the bottom reads "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX".
- **Watch:** The `if (!READONLY)` guard wraps the whole drop wiring — losing it lets a read-only viewer mutate state it can never persist (`save()` returns early at `src/app.js:152`), producing changes that vanish on reload.

---

## 5. Notes sidecars: matching and attaching

### DOC-049 - Notes match by SHA-256 even when the PDF was renamed
**P0** * Functional * `src/app.js:314 attachNotesFile()`

- **Pre:** `paper-a.pdf` open with 5 notes; save them to `paper-a.notes.json`; then delete the document from the library entirely (Trash → Delete forever) and clear its notes.
- **Steps:**
  1. Open `paper-a-renamed.pdf` (different filename, same bytes).
  2. Then open `paper-a.notes.json` on its own via the picker.
- **Expect:** "5 notes attached to “paper-a-renamed.pdf”." — matched purely on `document.sha256` versus the doc's `sha`, despite the filename mismatch.
- **Watch:** The sha branch must run **first**; if the filename branch is consulted first, a renamed PDF quietly gets the wrong (or no) notes.

### DOC-050 - Notes match by "opened alongside" when the hash does not match
**P1** * Functional * `src/app.js:315 attachNotesFile()`

- **Pre:** A `.notes.json` whose `document.sha256` you have hand-edited to a bogus 64-hex string.
- **Steps:**
  1. Drop `paper-a.pdf` and that edited JSON together in one gesture.
- **Expect:** "5 notes attached to “paper-a.pdf”." — the PDF opened in the same batch wins via `preferIds`.
- **Watch:** `preferIds` only contains PDFs opened in *this* call. Notes dropped in a separate gesture fall through to the filename branch (DOC-051) and can miss.

### DOC-051 - Notes match by filename as the last resort
**P1** * Edge * `src/app.js:316-318 attachNotesFile()`, `src/app.js:2266 notesFileName()`

- **Pre:** Clean profile (sample present, `sha` absent — see DOC-006). Save the sample's notes; the file will be named exactly `BERT _ Devlin et al. 2019 _NAACL_.notes.json`.
- **Steps:**
  1. Delete 3 sample notes so the counter shows 9.
  2. Open that saved `.notes.json` on its own via the picker.
- **Expect:** Toast "12 notes attached to “BERT — Devlin et al. 2019 (NAACL).pdf”." and the counter is back to 12 — matched only by the sanitised filename, since the sample has no sha.
- **Watch:** `notesFileName()` maps every character outside `[\w.\- ]` to `_`, so the em dash and parentheses become underscores. Renaming `SAMPLE_DOC_NAME` (DOC-012) or changing that regex silently breaks this match for every previously exported sidecar.

### DOC-052 - Unmatched notes produce a clear error
**P1** * Copy * `src/app.js:320 attachNotesFile()`

- **Pre:** Clean profile with only the sample in the library.
- **Steps:**
  1. Open `paper-a.notes.json` on its own (its PDF is not in the library).
- **Expect:** A red/error toast reading exactly "Notes “paper-a.notes.json” don’t match an open document — open its PDF too." Nothing is imported; the sample's 12 notes are untouched.
- **Watch:** Attaching to the wrong document is far worse than refusing — verify the fallback chain never lands on the *active* document just because nothing else matched.

### DOC-053 - Malformed JSON is rejected by filename
**P1** * Error * `src/app.js:269 openFiles()`

- **Pre:** A file `bad.notes.json` containing `{not json`.
- **Steps:**
  1. Drop it onto the reader.
- **Expect:** Error toast "Could not read bad.notes.json — not valid JSON." Nothing else happens; if other files were in the same drop they still process.
- **Watch:** The `continue` in the loop is what keeps the rest of the batch alive.

### DOC-054 - JSON with no annotations array is rejected
**P1** * Error * `src/app.js:311 attachNotesFile()`

- **Pre:** A file `empty.json` containing `{"app":"x"}`.
- **Steps:**
  1. Drop it onto the reader.
- **Expect:** Error toast "“empty.json” has no notes to import." (note the curly quotes around the filename).
- **Watch:** Distinguish this from `applyNotesJSON`'s own guard, "That file has no notes to import." (`src/app.js:2317`) — two different strings for two different entry points; both must survive copy edits.

### DOC-055 - Attaching merges by id, newest wins
**P1** * State * `src/app.js:2316 applyNotesJSON()`, `src/app.js:322 attachNotesFile()`

- **Pre:** `paper-a.pdf` open with 5 notes. Save `paper-a.notes.json`.
- **Steps:**
  1. In the app, edit the text of note #1 and add a brand-new note #6.
  2. Re-open the *saved* `paper-a.notes.json` (which has the old text and no note #6).
- **Expect:** Toast "5 notes attached to “paper-a.pdf”." The counter reads **6**, not 5 and not 11. Note #6 survives (it is not in the file). Note #1 keeps your newer edit, because merge is newest-wins on `updated_at`.
- **Watch:** The reported count is `incoming.length` (5), not the resulting total — that mismatch is intentional; do not "fix" it into the merged count without checking every caller's copy.

### DOC-056 - Attaching notes for a background document switches to it
**P1** * Functional * `src/app.js:321 attachNotesFile()`

- **Pre:** `paper-a.pdf` and the sample both in the library; **sample** is active.
- **Steps:**
  1. Open `paper-a.notes.json` via the picker.
- **Expect:** The reader switches to `paper-a.pdf` (its row becomes active, page 1 renders) and only then does the "5 notes attached to “paper-a.pdf”." toast fire, with the notes visible.
- **Watch:** Without the `await switchDoc()`, `applyNotesJSON` calls `drawHighlights()` against the *previous* document's page geometry and highlights land in the wrong places.

### DOC-057 - Singular/plural in the attach toast
**P1** * Copy * `src/app.js:323 attachNotesFile()`

- **Pre:** A notes file containing exactly one annotation for `paper-a.pdf`.
- **Steps:**
  1. Attach it.
- **Expect:** "1 note attached to “paper-a.pdf”." — singular, no "s".
- **Watch:** Same ternary appears in `importSharedHTML` (`src/app.js:307`), `openNotesFileFor` (`src/app.js:2445`), `loadNotesFromFolder` (`src/app.js:2366`) and `maybeOfferFolderNotes` (`src/app.js:2408`) — check all five if the pluralisation helper is refactored.

### DOC-058 - A notes file with zero annotations attaches silently
**P1** * Edge * `src/app.js:322-323 attachNotesFile()`

- **Pre:** A valid notes file whose `annotations` array is `[]`.
- **Steps:**
  1. Drop it alongside `paper-a.pdf`.
- **Expect:** The PDF opens normally; **no** attach toast at all (`if (n)` is false). Existing notes on that document are unchanged — an empty file does not wipe them, because merge mode is used.
- **Watch:** If the merge flag is ever dropped from this call site, an empty sidecar becomes a note-eraser.

### DOC-059 - Fallback banner when a lone PDF opens with no notes
**P1** * Copy * `src/app.js:274 openFiles()`, `src/app.js:2413 maybeOfferNotesFallback()`, `src/app.js:2422 showNotesBanner()`

- **Pre:** Storage mode is "browser" (Settings → Storage shows a "Choose folder…" button, not a folder name). Clean-ish profile.
- **Steps:**
  1. Open `paper-a.pdf` alone.
- **Expect:** A dark strip slides down from the top of the window reading "Have notes for **paper-a.pdf**? Open its **.notes.json** to load them." with a blue button "Open notes file…" and a "✕" dismiss button (aria-label "Dismiss"). The page underneath stays fully usable — no backdrop.
- **Watch:** The banner is positioned by `restackBanners()` (`src/app.js:737`); with an OCR banner also on screen the two must stack, not overlap.

### DOC-060 - The fallback banner is offered only once per document
**P1** * State * `src/app.js:2415-2417 maybeOfferNotesFallback()`

- **Pre:** DOC-059 just run.
- **Steps:**
  1. Dismiss the banner with "✕".
  2. Switch to another document and back.
  3. Reload the page and open `paper-a.pdf` again from disk.
- **Expect:** The banner never reappears for that document (`doc.notesAsked` persists).
- **Watch:** The flag is set *before* the user acts, so cancelling the picker also burns the offer — intended anti-nag behaviour, not a bug.

### DOC-061 - Banner → "Open notes file…" with a mismatched sidecar warns first
**P1** * Functional * `src/app.js:2435 openNotesFileFor()`

- **Pre:** Banner showing for `paper-a.pdf`; have `paper-b.notes.json` saved for a different PDF (different `document.sha256`).
- **Steps:**
  1. Click "Open notes file…".
  2. Choose `paper-b.notes.json`.
- **Expect:** A modal reading "“paper-b.notes.json” was saved for a different PDF. Attach it to “paper-a.pdf” anyway?" with buttons "Cancel" and "Attach". Choosing "Cancel" imports nothing. Choosing "Attach" imports and toasts "N notes loaded."
- **Watch:** The warning only fires when *both* hashes exist. A sidecar saved for the sample (`sha256: null`) attaches with no warning at all.

### DOC-062 - Folder mode offers matching notes on open
**P1** * Functional * Chromium only * `src/app.js:2396 maybeOfferFolderNotes()`, `src/app.js:2373 findFolderNotes()`

- **Pre:** Chrome/Edge. Settings → Storage → "Choose folder…" → pick a folder that already contains `paper-a.notes.json`. Remove `paper-a.pdf` from the library first (Trash → Delete forever).
- **Steps:**
  1. Open `paper-a.pdf` from disk.
- **Expect:** After the "Opened …" toast, a modal reads "Found notes for this PDF in “<folder>”: paper-a.notes.json. Open them?" with buttons "Not now" and "Open notes". Confirming toasts "N notes loaded from “<folder>”."
- **Watch:** The permission re-grant is captured during the picker click (`src/app.js:224`) because `requestPermission()` needs a user gesture; on a fresh session with no gesture the offer silently never appears.

### DOC-063 - Folder mode suppresses the manual fallback banner
**P1** * Functional * Chromium only * `src/app.js:274 openFiles()`

- **Pre:** Folder mode configured (DOC-062), folder contains no notes for `paper-b.pdf`.
- **Steps:**
  1. Open `paper-b.pdf` alone.
- **Expect:** No "Have notes for …" banner (the `storageCfg().mode !== 'folder'` guard blocks it) and no folder modal either, since nothing was found.
- **Watch:** In Firefox/Safari `fsSupported()` is false, so mode can never be `folder` and the banner is the only path — verify both browsers.

---

## 6. Shared .annotated.html import

### DOC-064 - Importing a shared paper opens it as an editable document
**P0** * Functional * `src/app.js:279 importSharedHTML()`

- **Pre:** Clean profile. Have `paper-a.annotated.html` exported from a session with 5 notes.
- **Steps:**
  1. Open it through "Open PDF or bundle" (or drop it on the reader).
- **Expect:** Toast "Opened paper-a.pdf — 5 notes loaded. Keep annotating." A new library row appears and is active; the paper renders; the 5 notes and their highlights are present.
- **Watch:** The name comes from `bundle.name` — the original PDF name, not the `.annotated.html` filename.

### DOC-065 - The imported copy is fully editable (not read-only)
**P0** * Functional * `src/app.js:296-303 importSharedHTML()`, `src/app.js:43 READONLY`

- **Pre:** DOC-064 just run.
- **Steps:**
  1. Select text on the page and click "Highlight" in the selection popover.
  2. Reload the page.
- **Expect:** The new highlight is created and survives the reload. The "Open PDF or bundle", "Share as HTML" and Settings buttons are all present.
- **Watch:** `READONLY` only applies when the app is *booted from* a bundle (`window.__PAIR_BUNDLE__` on the page). Importing a bundle into the normal app must never set it — a leak here makes the whole library read-only.

### DOC-066 - A non-PairedX HTML file is rejected by name
**P1** * Copy * `src/app.js:283 importSharedHTML()`

- **Pre:** Any saved web page, e.g. `random.html`.
- **Steps:**
  1. Drop it onto the reader.
- **Expect:** Error toast "“random.html” isn’t a PairedX shared paper." (curly quotes, typographic apostrophe in "isn’t"). No library row is created.
- **Watch:** The detection is a plain `indexOf('window.__PAIR_BUNDLE__=')` — a build that changes the bundle marker breaks import for every previously shared file.

### DOC-067 - A truncated bundle is rejected
**P1** * Error * `src/app.js:290 importSharedHTML()`

- **Pre:** Copy `paper-a.annotated.html` and delete the last 200 KB with a text editor so the bundle JSON is cut mid-way.
- **Steps:**
  1. Drop the truncated file onto the reader.
- **Expect:** Error toast "Could not read the shared paper in “paper-a.annotated.html”." No row, no partial import.
- **Watch:** A ~40 MB `JSON.parse` failure must not hang the tab — the error toast should appear within a couple of seconds.

### DOC-068 - A bundle with no embedded PDF is rejected
**P1** * Error * `src/app.js:291 importSharedHTML()`

- **Pre:** Hand-edit a copy so the bundle reads `window.__PAIR_BUNDLE__={"readOnly":true,"name":"x"};`.
- **Steps:**
  1. Drop it onto the reader.
- **Expect:** Error toast "“x.annotated.html” has no embedded PDF." (filename verbatim). No row created.
- **Watch:** This must fire *before* `b64ToBytes()` — an `atob(undefined)` throw would escape as the generic "Could not open …" toast from `openFiles()` instead.

### DOC-069 - Re-importing the same shared paper de-duplicates and merges
**P1** * Functional * `src/app.js:296-305 importSharedHTML()`

- **Pre:** DOC-064 done. Add one new note of your own (total 6).
- **Steps:**
  1. Import the same `paper-a.annotated.html` again.
- **Expect:** Still **one** row for that paper. Toast "Opened paper-a.pdf — 5 notes loaded. Keep annotating." The counter reads 6 — your extra note survives the merge.
- **Watch:** `applyNotesJSON(..., { merge: true })` is what protects the extra note; without the merge flag the re-import would discard everything not in the file.

### DOC-070 - Bundle name falls back to the filename
**P1** * Edge * `src/app.js:294 importSharedHTML()`

- **Pre:** Hand-edit a copy of the bundle to delete the `"name"` key, and rename the file to `myshare.annotated.html`.
- **Steps:**
  1. Import it.
- **Expect:** The library row is labelled "myshare.pdf" — the `.annotated.html` suffix stripped and `.pdf` appended.
- **Watch:** A file simply named `myshare.html` (no `.annotated`) must also work, producing "myshare.pdf".

### DOC-071 - A shared paper with zero notes gets the short toast
**P1** * Copy * `src/app.js:307 importSharedHTML()`

- **Pre:** Export a share from a document with no notes.
- **Steps:**
  1. Import it.
- **Expect:** Toast reads exactly "Opened paper-b.pdf." — a full stop, with no "— 0 notes loaded" clause.
- **Watch:** The ternary hangs off `n` being truthy; a change to `n >= 0` produces the ugly "0 notes loaded" string.

### DOC-072 - HTML shares are processed before PDFs and notes in a mixed drop
**P1** * Edge * `src/app.js:261-271 openFiles()`

- **Pre:** Clean profile.
- **Steps:**
  1. Drop `paper-a.annotated.html`, `paper-b.pdf` and `paper-b.notes.json` together in one gesture.
- **Expect:** In order: the share imports (its own toast), then `paper-b.pdf` opens, then its notes attach ("N notes attached to “paper-b.pdf”."). `paper-b.pdf` ends up active. Three consistent library rows (two if the share deduped).
- **Watch:** `openedIds` only collects PDFs, so a share's document id can never be a `preferIds` target — notes intended for a shared paper must match by sha.

### DOC-073 - A very large share file imports without blocking the tab
**P2** * Perf * `src/app.js:280-292 importSharedHTML()`

- **Pre:** Export a share of `huge.pdf` (the resulting file will be 60 MB+).
- **Steps:**
  1. Import it and watch the tab.
- **Expect:** It completes; the page may pause briefly during `f.text()` / `JSON.parse` / `b64ToBytes` but recovers, and the paper renders.
- **Watch:** All three of those steps are synchronous main-thread work on the whole file. A browser "page unresponsive" prompt here is a real defect worth filing even though the import eventually succeeds.

---

## 7. Switching documents

### DOC-074 - Clicking a library row switches to it
**P0** * Functional * `src/app.js:388 renderTree()`, `src/app.js:203 switchDoc()`

- **Pre:** At least two documents in the library; sample active.
- **Steps:**
  1. Click the `paper-a.pdf` row.
- **Expect:** That row gains the active styling (blue tint, bold, red file icon at `#DC2626`); the sample row loses it. The reader renders paper-a page 1.
- **Watch:** The active file icon colour is inline (`src/app.js:385`) rather than CSS — a theme change can leave it red in dark mode.

### DOC-075 - Switching swaps the entire notes panel
**P0** * State * `src/app.js:211 switchDoc()`, `src/app.js:1690 passesFilter()`

- **Pre:** Sample (12 notes) and `paper-a.pdf` (3 notes) both in the library.
- **Steps:**
  1. Switch from the sample to paper-a and back, reading the footer counter each time.
- **Expect:** Counter reads "3 notes" then "12 notes". No card from the other document ever appears in the list, and no stale pin is drawn on the page.
- **Watch:** `passesFilter()` short-circuits on `inActiveDoc()`; if a filter is active (e.g. "Screenshots") the counter still shows the *document* total with a " · <filter>" suffix — that is by design (`src/app.js:2109`).

### DOC-076 - Switching resets the page position
**P1** * State * `src/app.js:208 switchDoc()`

- **Pre:** Sample active, scrolled to page 7.
- **Steps:**
  1. Switch to `paper-a.pdf`.
  2. Switch back to the sample.
- **Expect:** Both switches land on page 1 — the page box reads "1" and `#pageTotal` shows the new document's count. Returning to the sample does **not** restore page 7.
- **Watch:** In continuous mode the scroll container must actually be scrolled to the top; a stale scroll offset with a fresh `state.ui.page = 1` makes the page box disagree with what is on screen.

### DOC-077 - Switching clears the selected note and its connector
**P1** * Visual * `src/app.js:208 switchDoc()`, `src/app.js:1162 drawConnector()`

- **Pre:** Sample active with a note card selected (connector line visible between pin and card).
- **Steps:**
  1. Switch to `paper-a.pdf`.
- **Expect:** No card is selected, no connector line is drawn anywhere over the page.
- **Watch:** The connector is an SVG overlay (`#connectors`) — a leftover line pointing into empty space is the classic symptom of `activeId` not being cleared.

### DOC-078 - Clicking the already-active row is a cheap no-op
**P1** * Functional * `src/app.js:204 switchDoc()`

- **Pre:** `paper-a.pdf` active, scrolled to page 4, a note selected.
- **Steps:**
  1. Click the `paper-a.pdf` row again.
  2. Double-click it rapidly.
- **Expect:** No re-render of the reader, no flicker, scroll position and selection preserved, no toast.
- **Watch:** Without the early return each click re-parses the PDF — very visible on `huge.pdf` as a multi-second blank.

### DOC-079 - Switching clears stale banners
**P1** * Functional * `src/app.js:205-206 switchDoc()`

- **Pre:** Open `paper-a.pdf` alone so the "Have notes for **paper-a.pdf**?" banner is showing (DOC-059).
- **Steps:**
  1. Without dismissing the banner, click the sample row.
- **Expect:** The banner disappears immediately. It does not reappear on the sample and does not leave a gap at the top of the reader.
- **Watch:** Both `#notesBanner` and `#ocrBanner` are removed here. `restackBanners()` is **not** called afterwards, so if a second banner was stacked below it may keep its offset — check with two banners on screen.

### DOC-080 - Switching cancels an in-flight OCR run
**P1** * State * `src/app.js:206 switchDoc()`, `src/app.js:753 runOcr()`

- **Pre:** A scanned PDF that triggers the OCR offer; accept it and let OCR start.
- **Steps:**
  1. While the OCR progress banner is counting up, click another document row.
- **Expect:** The OCR banner disappears, OCR stops within one page (`ocrCancel`), and the new document renders normally. No stray "OCR complete — N pages now searchable & highlightable." toast for a document you have left.
- **Watch:** `runOcr` writes into the *captured* store, and `active()` (`src/app.js:766`) guards the write-back — a regression here injects one document's OCR text into another's text layer.

### DOC-081 - Switching stamps lastOpened and reorders Recents
**P1** * State * `src/app.js:209 switchDoc()`, `src/app.js:363 docsForView()`

- **Pre:** Three documents; open them in a known order (A, then B, then C).
- **Steps:**
  1. Click "Recents" in the nav.
  2. Switch to A, then click "Recents" again.
- **Expect:** First time the order is C, B, A. After switching to A the order is A, C, B.
- **Watch:** Boot does **not** go through `switchDoc`, so the document restored at boot keeps its previous `lastOpened` — Recents does not promote it until you click it.

### DOC-082 - Switching clears the page-text cache
**P1** * State * `src/app.js:210 switchDoc()`, `src/app.js:586 ensurePageText()`

- **Pre:** Sample active; use in-document search (Cmd/Ctrl-F) for a word that only exists in the sample, confirm hits.
- **Steps:**
  1. Switch to `paper-a.pdf`.
  2. Search for that same sample-only word.
- **Expect:** Zero matches on paper-a. Then search for a word only in paper-a and get real matches.
- **Watch:** `pageTextCache` is a module-level object keyed by page number only — if it is not cleared, AI context retrieval (`retrievePassages`) quotes the *previous* paper, which is a source-integrity bug, not just a search bug.

### DOC-083 - Rapid switching between two documents does not mix renders
**P1** * Edge * `src/app.js:203 switchDoc()`, `src/app.js:445 initPdf()`

- **Pre:** Two documents with visibly different first pages, one of them large.
- **Steps:**
  1. Click A, and within half a second click B, then A again, then B.
- **Expect:** The reader settles on B showing B's pages. No page from A remains rendered in the continuous stack, and pins/highlights belong to B only.
- **Watch:** `switchDoc` is `async` with no cancellation token — a slow `initPdf` for A can resolve *after* B and repaint A's pages over B's state. Watch specifically for pins from one document over pages of the other.

### DOC-084 - The active document survives a reload
**P1** * State * `src/app.js:3325 boot()`, `src/app.js:83 migrateState()`

- **Pre:** `paper-a.pdf` active (not the sample).
- **Steps:**
  1. Reload.
- **Expect:** paper-a is active and rendered; its row is highlighted; its notes are in the panel.
- **Watch:** `save()` is debounced 250 ms — reloading instantly after a switch can lose the change. Wait a beat before reloading, and see DOC-118 for the aggressive version of this.

---

## 8. Library views: Home, Recents, Starred, Trash

### DOC-085 - Four nav items with correct icons and active styling
**P0** * Visual * `app.html:26-29`, `src/app.js:369 renderTree()`, `src/styles.css:54-59`

- **Pre:** Any state.
- **Steps:**
  1. Click each of "Home", "Recents", "Starred", "Trash" in turn.
- **Expect:** Labels are exactly "Home", "Recents", "Starred", "Trash". Exactly one is highlighted at a time (blue tint background, blue text, weight 600, blue icon). Hover on a non-active item gives a light grey background.
- **Watch:** `.nav-item.active .ic` recolours the icon — an icon markup change that drops the `.ic` wrapper leaves the icon grey when selected.

### DOC-086 - Section label follows the selected view
**P0** * Copy * `src/app.js:370 renderTree()`, `app.html:31`

- **Pre:** Any state.
- **Steps:**
  1. Click through all four nav items, reading the label above the document list each time.
- **Expect:** Exactly "My Library", "Recents", "Starred", "Trash" respectively — note only Home has a different label from its nav item.
- **Watch:** The map is keyed by view id; an unknown `libView` in old state leaves the label `undefined` (blank strip) rather than falling back.

### DOC-087 - Home lists documents in insertion order with the sample first
**P1** * Functional * `src/app.js:357 docsForView()`, `src/app.js:82 migrateState()`

- **Pre:** Clean profile; open `paper-a.pdf` then `paper-b.pdf`.
- **Steps:**
  1. Go to Home and read the row order.
- **Expect:** BERT sample, paper-a, paper-b — the sample is `unshift`ed to the front and new documents are `push`ed to the end. Home applies no sorting.
- **Watch:** Home order does **not** react to `lastOpened`; if it starts doing so, DOC-088 no longer distinguishes Home from Recents.

### DOC-088 - Recents sorts by last opened, then added
**P1** * Functional * `src/app.js:363 docsForView()`

- **Pre:** Three documents; the sample has never been switched to since its creation.
- **Steps:**
  1. Switch to paper-b, then paper-a.
  2. Click "Recents".
- **Expect:** Order is paper-a, paper-b, then the sample (which falls back to `addedAt` because it has no `lastOpened`).
- **Watch:** A document opened only at boot keeps its old timestamp (DOC-081) — do not treat that as a sort bug.

### DOC-089 - Starred shows only starred documents
**P1** * Functional * `src/app.js:362 docsForView()`

- **Pre:** Three documents, none starred.
- **Steps:**
  1. Click "Starred" and read the list.
  2. Go to Home, star paper-a, return to "Starred".
- **Expect:** First "No starred documents yet.", then exactly one row: paper-a.
- **Watch:** Starred is filtered from the non-trashed set — a starred document that is later trashed must vanish from Starred (DOC-093).

### DOC-090 - Trash lists only trashed documents, newest first
**P1** * Functional * `src/app.js:360 docsForView()`

- **Pre:** Three documents.
- **Steps:**
  1. Trash paper-a, wait 2 seconds, trash paper-b.
  2. Click "Trash".
- **Expect:** Order is paper-b then paper-a (descending `trashedAt`). Neither appears in Home.
- **Watch:** `trashedAt` is only stamped on trash, never cleared on restore — re-trashing an item must re-stamp it or the order goes stale.

### DOC-091 - Three distinct empty-state strings
**P1** * Copy * `src/app.js:374-376 renderTree()`, `src/styles.css:81`

- **Pre:** Clean profile.
- **Steps:**
  1. Click "Trash" with nothing trashed.
  2. Click "Starred" with nothing starred.
  3. Trash the sample so Home is empty, then click "Home".
- **Expect:** Grey small text reading exactly, in order: "Trash is empty." / "No starred documents yet." / "No documents yet — use “Open PDF or bundle” to add one."
- **Watch:** The third string names the button by its exact label — if the button is ever renamed (DOC-013), this copy and the empty-reader copy (DOC-103) must change together.

### DOC-092 - Trash rows are not clickable and never look active
**P1** * Functional * `src/app.js:379 renderTree()`, `src/app.js:388 renderTree()`

- **Pre:** The **active** document has just been trashed (so another document is now active).
- **Steps:**
  1. Go to Trash and click the middle of a trashed row (not on a button).
- **Expect:** Nothing happens — no switch, no render. No trashed row ever shows the blue active styling, even if it was active moments earlier.
- **Watch:** `active` is computed as `d.id === state.ui.activeDoc && !inTrash` and the click handler is only attached `if (!inTrash)`. A refactor to a single delegated handler on `#docList` would silently make trashed rows openable.

### DOC-093 - Trashed documents disappear from the other three views
**P1** * Functional * `src/app.js:361 docsForView()`

- **Pre:** paper-a starred and recently opened.
- **Steps:**
  1. Trash paper-a.
  2. Check Home, Recents and Starred in turn.
- **Expect:** paper-a appears in none of them; it appears only in Trash (still starred, so restoring puts it straight back into Starred).
- **Watch:** The `!d.trashed` filter runs *after* the trash early-return — a reordering leaks trashed rows into Home.

### DOC-094 - The selected view persists across a reload
**P1** * State * `src/app.js:3085 wire()`, `src/app.js:369 renderTree()`

- **Pre:** Something trashed.
- **Steps:**
  1. Click "Trash", reload the page.
- **Expect:** The app comes back on the Trash view, label "Trash", with the trashed rows listed. The reader still shows whatever document is active.
- **Watch:** Booting into Trash means the active document has no visible row — verify that switching to Home restores the active highlight rather than losing it.

### DOC-095 - Row action buttons reveal on hover; an active star stays lit
**P2** * Visual * `src/styles.css:74-80`, `src/app.js:382 renderTree()`

- **Pre:** Two documents, one starred.
- **Steps:**
  1. Move the mouse away from the sidebar, then hover each row.
- **Expect:** Un-hovered rows show no action buttons except the **starred** star, which stays visible in amber (`#F59E0B`). On hover the star and trash buttons fade in; hovering the trash button turns it red (`#DC2626`).
- **Watch:** In Trash the same slots hold "↩" and a red trash — verify the restore glyph is not clipped at 22 × 22 px.

### DOC-096 - Row tooltips carry the full document name
**P2** * Copy * `src/app.js:384 renderTree()`

- **Pre:** A document with a long name and one with `&`/`<` in the name.
- **Steps:**
  1. Hover each row and read the native tooltip.
- **Expect:** The tooltip is the complete, un-truncated name, with special characters rendered literally (not as `&amp;`).
- **Watch:** `esc()` is applied to the `title` attribute; double-escaping shows up as visible `&amp;` in the tooltip.

### DOC-097 - Storage footer count excludes trashed documents
**P1** * Functional * `src/app.js:407 updateStorage()`

- **Pre:** A browser without `navigator.storage.estimate` (or block it in DevTools). Four documents, one trashed.
- **Steps:**
  1. Read the storage strip.
- **Expect:** "3 documents".
- **Watch:** `updateStorage()` is only called from `openPdfFile`, `importSharedHTML`, `purgeDoc` and boot — trashing a document does **not** refresh the strip until one of those runs. Expect a stale count after a trash; that is current behaviour.

---

## 9. Star, trash, restore, purge

### DOC-098 - Star toggles icon fill and tooltip
**P0** * Functional * `src/app.js:325 toggleStar()`, `src/app.js:382 renderTree()`

- **Pre:** Home view, paper-a unstarred.
- **Steps:**
  1. Hover paper-a and read the star button's tooltip; click it.
  2. Hover and read the tooltip again; click again.
- **Expect:** Tooltip "Star" → after the click the star is filled amber and the tooltip is "Unstar" → after the second click it is hollow and back to "Star".
- **Watch:** The tooltip is baked into the HTML at render time — if `renderTree()` is skipped after the toggle the icon updates but the tooltip lies.

### DOC-099 - Starring persists across a reload
**P1** * State * `src/app.js:325 toggleStar()`

- **Pre:** paper-a starred.
- **Steps:**
  1. Wait a second (for the debounced save), reload, open "Starred".
- **Expect:** paper-a is still starred and listed.
- **Watch:** `toggleStar` calls `save()` then `renderTree()` — no `render()`, which is correct (notes are unaffected).

### DOC-100 - Clicking star or trash does not switch documents
**P1** * Functional * `src/app.js:388 renderTree()`, `src/app.js:391-394 renderTree()`

- **Pre:** Sample active; paper-a in the library, not active.
- **Steps:**
  1. Click the **star** button on the paper-a row.
- **Expect:** paper-a gets starred and the sample stays active and rendered — the row click handler bails out via `e.target.closest('.doc-actions')` and each button calls `stopPropagation()`.
- **Watch:** Clicking on the SVG *inside* the button must behave identically — test by clicking the very centre of the star glyph.

### DOC-101 - Move to trash: toast copy and row movement
**P0** * Copy * `src/app.js:333 trashDoc()`

- **Pre:** Home view, paper-a present and **not** active.
- **Steps:**
  1. Hover paper-a, read the trash button tooltip, click it.
- **Expect:** Tooltip is exactly "Move to trash". A toast reads exactly "Moved “paper-a.pdf” to Trash." (curly quotes). The row leaves Home and appears in Trash. No confirmation dialog.
- **Watch:** Trashing is deliberately un-confirmed because it is reversible — if a confirm dialog appears here it belongs to purge (DOC-108), which means the wrong handler is wired.

### DOC-102 - Trashing the active document opens the next one
**P0** * Functional * `src/app.js:337 trashDoc()`, `src/app.js:328 openFallbackDoc()`

- **Pre:** Sample and paper-a both present; **paper-a active**.
- **Steps:**
  1. Trash paper-a.
- **Expect:** The sample becomes active and renders (page 1, its 12 notes in the panel), plus the "Moved “paper-a.pdf” to Trash." toast. The reader never shows a blank or a fallback card.
- **Watch:** `openFallbackDoc()` picks `state.docs.find(d => !d.trashed)` — the *first* non-trashed document in insertion order, not the most recent. That is by design.

### DOC-103 - Trashing the last document shows the empty reader
**P1** * Functional * `src/app.js:331 openFallbackDoc()`, `src/app.js:3197 showEmptyReader()`

- **Pre:** Exactly one document in the library (trash or purge everything else), and it is active.
- **Steps:**
  1. Trash it.
- **Expect:** The page area is replaced by a card with a 📄 glyph, the heading "Your library is empty" and the line "Use **Open PDF or bundle** (top-left) to open a paper, its notes, or a shared **.html**." `#pageTotal` reads "/ 0". The document list shows "No documents yet — use “Open PDF or bundle” to add one."
- **Watch:** `showEmptyReader()` nulls `pdfDoc` and tears down continuous mode; the page/zoom/tool buttons remain clickable and must not throw — click "next page" and "+" and check the console.

### DOC-104 - Trashing preserves notes; restoring brings them back
**P1** * State * `src/app.js:333 trashDoc()`, `src/app.js:340 restoreDoc()`

- **Pre:** paper-a with 4 notes.
- **Steps:**
  1. Trash paper-a. Reload the page.
  2. Go to Trash and restore it. Switch to it.
- **Expect:** All 4 notes are back with their highlights, text and threads intact. Trash is a soft delete — `state.annotations` is never touched.
- **Watch:** Contrast with `purgeDoc` (`src/app.js:352`), which does filter annotations. A copy/paste between the two is a silent data-loss bug that only shows after a restore.

### DOC-105 - Trashing the sample makes its removal stick across reloads
**P1** * State * `src/app.js:336 trashDoc()`, `src/app.js:82 migrateState()`

- **Pre:** Clean profile with the sample present.
- **Steps:**
  1. Trash the sample.
  2. Reload the page twice.
- **Expect:** The sample does not reappear in Home. It stays in Trash across both reloads. Its 12 notes are still stored (restoring brings them back).
- **Watch:** `state.sampleDismissed = true` is what stops `migrateState()` re-adding it on every load. Without it the sample resurrects on reload — the single most-reported bug class for this feature.

### DOC-106 - Restore: toast copy and return to Home
**P0** * Copy * `src/app.js:340 restoreDoc()`

- **Pre:** paper-a in Trash; at least one other document in Home.
- **Steps:**
  1. In Trash, hover the "↩" button (read its tooltip) and click it.
- **Expect:** Tooltip is exactly "Restore". Toast reads exactly "Restored “paper-a.pdf”." The row leaves Trash and reappears in Home. The active document does **not** change.
- **Watch:** The view stays on Trash after the restore, so the row simply vanishes — verify the empty state appears if it was the only trashed item.

### DOC-107 - Restoring into an empty library auto-opens the document
**P1** * Functional * `src/app.js:343 restoreDoc()`

- **Pre:** Every document trashed (reader shows "Your library is empty").
- **Steps:**
  1. Go to Trash and restore one document.
- **Expect:** It is restored **and** immediately opened — the reader renders it, `#pageTotal` updates from "/ 0", and the empty-reader card is gone.
- **Watch:** The `if (!state.ui.activeDoc)` branch only fires when the library was truly empty; restoring while another document is open must not steal focus (DOC-106).

### DOC-108 - Purge: confirm dialog copy and buttons
**P0** * Copy * `src/app.js:346 purgeDoc()`, `src/app.js:2176 confirmDialog()`

- **Pre:** paper-a in Trash with exactly 4 notes.
- **Steps:**
  1. In Trash, hover the red trash button (read its tooltip) and click it.
- **Expect:** Tooltip is exactly "Delete forever". A modal appears reading exactly "Permanently delete “paper-a.pdf” and its 4 notes? This cannot be undone." with a ghost "Cancel" button and a red "Delete" button. The "Delete" button has keyboard focus.
- **Watch:** The dialog is the only guard against permanent loss — check the message names the right document when several rows are in Trash.

### DOC-109 - Purge can be cancelled three ways
**P1** * Functional * `src/app.js:349 purgeDoc()`, `src/app.js:2184-2188 confirmDialog()`

- **Pre:** paper-a in Trash with notes.
- **Steps:**
  1. Open the purge dialog and press Escape.
  2. Open it again and click the dark backdrop outside the box.
  3. Open it again and click "Cancel".
- **Expect:** All three dismiss the dialog and delete nothing — the row is still in Trash and restoring it still yields its notes and its PDF.
- **Watch:** Pressing **Enter** confirms (`src/app.js:2185`) — a destructive default. Confirm this is still intended, and that Enter does not fire while the user is typing elsewhere.

### DOC-110 - Purge removes the row, the notes and the stored bytes — with no toast
**P0** * Functional * `src/app.js:346-356 purgeDoc()`

- **Pre:** paper-a in Trash with 4 notes; note its `doc_…` id from `srw_state_v1`.
- **Steps:**
  1. Purge it, confirming with "Delete".
  2. Inspect Application → IndexedDB → `srw_assets` → `assets` and Local Storage → `srw_state_v1`.
  3. Reload.
- **Expect:** The row is gone from Trash and from every view. The `pdf:doc_…` key is gone from IndexedDB. No annotation with that `doc` id remains in state. **No success toast is shown** — the only feedback is the row disappearing. Nothing returns after the reload.
- **Watch:** The missing toast is current behaviour, not a bug to "fix" silently; if one is added, this check and the coverage map must be updated. Also check the storage strip refreshes (`updateStorage()` is called here).

### DOC-111 - Purge message adapts to 0 and 1 notes
**P1** * Copy * `src/app.js:348-349 purgeDoc()`

- **Pre:** Two documents in Trash: one with zero notes, one with exactly one note.
- **Steps:**
  1. Open the purge dialog on each in turn (cancel both).
- **Expect:** For zero notes: "Permanently delete “paper-b.pdf”? This cannot be undone." — no notes clause at all. For one note: "Permanently delete “paper-c.pdf” and its 1 note? This cannot be undone." — singular.
- **Watch:** The note count uses `docIdOf(a) === id`, which maps legacy `Turbulence_review.pdf` values onto `sample` — purging the sample counts those legacy notes too.

### DOC-112 - Purging the sample removes it permanently
**P0** * State * `src/app.js:350 purgeDoc()`, `src/app.js:3347 boot()`

- **Pre:** Clean profile with the sample and its 12 notes; another document also present and active.
- **Steps:**
  1. Trash the sample, then purge it from Trash ("Permanently delete “BERT — Devlin et al. 2019 (NAACL).pdf” and its 12 notes? This cannot be undone.").
  2. Reload the page twice.
- **Expect:** The sample never returns — not in Home, not in Trash — and its 12 notes are gone. Seeding does not re-run (`state.sampleDismissed` blocks the boot gate). The other document still renders normally.
- **Watch:** This is the one path that must survive *both* guards: `sampleDismissed` in `migrateState()` (re-adding the row) and `sampleDismissed` in `boot()` (re-seeding the notes). A regression in either brings back a document the user explicitly destroyed.

---

## 10. Fallback and failure states

### DOC-113 - Missing bytes show the fallback with the reason demoted to "Engine note"
**P0** * Error * `src/app.js:213 switchDoc()`, `src/app.js:3180 showReaderFallback()`

- **Pre:** Two documents; paper-a not active. Delete paper-a's `pdf:doc_…` key from IndexedDB **and** reload (to clear the runtime `_docBytes` cache).
- **Steps:**
  1. Click the paper-a row.
- **Expect:** A card appears with a 📄 glyph, the heading "Open this file directly to read the PDF", two grey paragraphs, and at the bottom in small faint text "Engine note: Could not load “paper-a.pdf”. Re-open it with New." The paper-a row is still highlighted as active.
- **Watch:** Two copy problems live here and must be re-checked after any copy pass: the headline describes a sandboxed-preview scenario that does not apply, and the engine note tells the user to press "New" — a button that is now labelled "Open PDF or bundle".

### DOC-114 - The fallback does not destroy the page scaffolding
**P1** * Regression * `src/app.js:3181-3185 showReaderFallback()`

- **Pre:** The fallback from DOC-113 on screen.
- **Steps:**
  1. Open DevTools Elements and confirm `#pageWrap`, `#overlay` and `#pins` still exist (with `#pageWrap` set to `display:none`).
  2. Open the notes panel, click a note card from another document's list, and switch documents back and forth.
- **Expect:** No console errors. `drawHighlights()` / `drawPins()` never throw on a null overlay.
- **Watch:** This is a fixed regression with a comment in the source — removing `#pageWrap` instead of hiding it reintroduces a hard crash that blanks the whole app.

### DOC-115 - Recovering from the fallback clears it
**P1** * Functional * `src/app.js:460 renderPage()`

- **Pre:** The fallback from DOC-113 on screen for paper-a.
- **Steps:**
  1. Open `paper-a.pdf` from disk again ("Reopened …" toast).
- **Expect:** The fallback card is removed, `#pageWrap` is visible again and the paper renders. Nothing of the card remains at the top of the scroll area.
- **Watch:** `#readerFallback` is removed inside `renderPage()`; in continuous mode `renderPage()` still runs first (`src/app.js:452`), but verify with continuous both on and off.

### DOC-116 - Wiped IndexedDB can leave rows listed but the reader claiming the library is empty
**P1** * Edge * `src/app.js:3325-3336 boot()`, `src/app.js:3197 showEmptyReader()`

- **Pre:** Purge the sample (DOC-112) so the first non-trashed document is a user PDF. Have one or two user PDFs in the library.
- **Steps:**
  1. Delete the whole `srw_assets` IndexedDB database, leaving `srw_state_v1` intact.
  2. Reload.
- **Expect:** Documented current behaviour — the sidebar still lists the document rows, but the reader shows the "Your library is empty" card and `#pageTotal` reads "/ 0", because the boot fallback retries the same byte-less document and gives up.
- **Watch:** The two halves of the UI contradict each other. If the sample is still present it masks this entirely (the sample's inline bytes always load), so purge it first or you will not reproduce.

### DOC-117 - Guard: switching to an unknown document id
**P2** * Regression * `src/app.js:207 switchDoc()`

- **Pre:** N/A — there is no UI route that reaches this branch today (every click handler closes over a live document object).
- **Steps:**
  1. Inspect `src/app.js:207` and confirm the guard is `const doc = state.docs.find(d => d.id === id); if (!doc) { toast('Document not found.', 'err'); return; }`.
  2. Confirm the toast string is exactly "Document not found." and that the function returns *before* mutating `state.ui.activeDoc`.
- **Expect:** The guard is present and returns early.
- **Watch:** Any new feature that passes a document id from outside the rendered list — deep links (`?doc=…`), multi-tab state sync, an undo stack, a command palette — makes this branch user-reachable. When one lands, promote this to a P1 functional check.

### DOC-118 - Reloading mid-open can orphan bytes without a library row
**P2** * Edge * `src/app.js:241-244 openPdfFile()`, `src/app.js:151 save()`

- **Pre:** Clean profile.
- **Steps:**
  1. Open `paper-a.pdf` and press reload within ~200 ms of the toast appearing (before the 250 ms debounced save fires).
  2. After reload, check the library list and IndexedDB `srw_assets` keys.
- **Expect:** Documented current behaviour — the document may be missing from the library while a `pdf:doc_…` key remains in IndexedDB, consuming quota with no way to reach it from the UI.
- **Watch:** Repeat this a few times and confirm the orphan keys accumulate rather than being cleaned up. Opening the same PDF again creates a *new* id and a second copy of the bytes.

### DOC-119 - Storage quota exhaustion surfaces a warning
**P1** * Error * `src/app.js:165 save()`

- **Pre:** Fill localStorage close to its limit (DevTools console: write a large dummy key into `localStorage` until near 5 MB), with a document open.
- **Steps:**
  1. Create a new note so a save is triggered.
- **Expect:** An error toast reading exactly "Storage limit reached — export your notes to keep them." (6-second duration, red styling). The app stays usable.
- **Watch:** Images are offloaded to IndexedDB before the localStorage write (`src/app.js:157-159`), so this should be hard to hit legitimately. If it fires during normal use, something is persisting data URLs into `srw_state_v1`.

### DOC-120 - Resizing or rotating mid-open does not corrupt the render
**P1** * Edge * `src/app.js:437 fitZoomToWidth()`, `src/app.js:445 initPdf()`

- **Pre:** Narrow viewport (phone emulation or a window under ~900 px).
- **Steps:**
  1. Start opening `huge.pdf`.
  2. While it is loading, rotate the device / drag the window from narrow to wide.
- **Expect:** The document finishes opening; the page is rendered at a sane zoom (the zoom readout matches what is on screen); no half-drawn canvas and no duplicate page stack.
- **Watch:** `pendingMobileFit` is consumed inside `initPdf()` — a resize to a wide layout mid-flight makes `fitZoomToWidth()` bail (`isNarrowViewport()` is false) and the zoom stays at the previous value, which is acceptable but should not leave the readout disagreeing with the canvas.

### DOC-121 - Opening a local PDF works with no network
**P1** * Edge * `src/app.js:219 openPdfFile()`, `src/app.js:410 setupWorker()`

- **Pre:** Load the app once, then DevTools → Network → *Offline*.
- **Steps:**
  1. Open `paper-a.pdf` from disk.
- **Expect:** It opens and renders normally; only AI features are unavailable. No request to `cdnjs.cloudflare.com` in the Network panel.
- **Watch:** If a cdnjs worker request appears, the inlined worker failed to register and every PDF open now depends on the network.

### DOC-122 - A shared read-only file is a self-contained, non-persisting library of one
**P1** * Functional * `src/app.js:3283 initBundleState()`, `src/app.js:3294 applyReadOnly()`

- **Pre:** `paper-a.annotated.html` on disk. Open it by double-clicking (file:// origin), in a browser profile that already has a populated PairedX library on pairedx.com.
- **Steps:**
  1. Read the library list, try every visible control, then reload the file.
- **Expect:** Exactly one row, labelled with the bundle's document name — **none** of your real library appears. The "Open PDF or bundle" button, file input, highlight/comment/screenshot tools, composer, save/import/clear-notes and Settings buttons are all hidden, as is the storage strip. A bottom banner reads "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX". After the reload the state is identical — nothing was persisted.
- **Watch:** `save()` returns immediately when `READONLY` (`src/app.js:152`); a leak would let a shared file write over the recipient's real `srw_state_v1` on the same origin.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `defaultState()` src/app.js:54 | DOC-001, DOC-006, DOC-010, DOC-011 |
| `migrateState()` src/app.js:76 | DOC-001, DOC-011, DOC-037, DOC-084, DOC-087, DOC-105 |
| `SAMPLE_DOC_NAME` src/app.js:38 | DOC-001, DOC-012, DOC-051, DOC-112 |
| `SEED_VERSION` src/app.js:39 | DOC-003, DOC-005 |
| `save()` src/app.js:151 | DOC-084, DOC-118, DOC-119, DOC-122 |
| `b64ToBytes()` src/app.js:177 | DOC-007, DOC-008, DOC-068, DOC-073 |
| `bytesToB64()` src/app.js:178 | DOC-064 (via export fixture), DOC-073 |
| `sha256Hex()` src/app.js:181 | DOC-027, DOC-031, DOC-033, DOC-035 |
| `docIdOf()` src/app.js:193 | DOC-005, DOC-111 |
| `inActiveDoc()` / `passesFilter()` src/app.js:194, 1689 | DOC-075 |
| `loadDocBytes()` src/app.js:196 | DOC-007, DOC-008, DOC-030, DOC-113, DOC-116 |
| `switchDoc()` src/app.js:203 | DOC-017, DOC-036, DOC-074 - DOC-084, DOC-113, DOC-117 |
| `openPdfFile()` src/app.js:219 | DOC-015 - DOC-018, DOC-020, DOC-022 - DOC-038, DOC-118 |
| `openFiles()` src/app.js:255 | DOC-014, DOC-019, DOC-020, DOC-025, DOC-026, DOC-041 - DOC-046, DOC-053, DOC-059, DOC-063, DOC-072 |
| `importSharedHTML()` src/app.js:279 | DOC-064 - DOC-073 |
| `attachNotesFile()` src/app.js:310 | DOC-042, DOC-049 - DOC-052, DOC-054 - DOC-058 |
| `toggleStar()` src/app.js:325 | DOC-098, DOC-099, DOC-100 |
| `openFallbackDoc()` src/app.js:328 | DOC-102, DOC-103 |
| `trashDoc()` src/app.js:333 | DOC-032, DOC-101 - DOC-105 |
| `restoreDoc()` src/app.js:340 | DOC-104, DOC-106, DOC-107 |
| `purgeDoc()` src/app.js:346 | DOC-108 - DOC-112 |
| `docsForView()` src/app.js:357 | DOC-087 - DOC-090, DOC-093 |
| `renderTree()` src/app.js:368 | DOC-024, DOC-074, DOC-085, DOC-086, DOC-091, DOC-092, DOC-095, DOC-096, DOC-098, DOC-100 |
| `updateStorage()` src/app.js:396 | DOC-009, DOC-097, DOC-110 |
| `notesFileName()` src/app.js:2266 | DOC-051 |
| `docNotesJSON()` src/app.js:2271 | DOC-006 |
| `applyNotesJSON()` src/app.js:2316 | DOC-055, DOC-058, DOC-069 |
| `notesDirHandle()` src/app.js:2343 | DOC-062 |
| `findFolderNotes()` src/app.js:2373 | DOC-062 |
| `maybeOfferFolderNotes()` src/app.js:2396 | DOC-062, DOC-063 |
| `maybeOfferNotesFallback()` src/app.js:2413 | DOC-059, DOC-060, DOC-063 |
| `showNotesBanner()` src/app.js:2422 | DOC-059, DOC-079 |
| `openNotesFileFor()` src/app.js:2435 | DOC-061 |
| `confirmDialog()` src/app.js:2176 | DOC-061, DOC-062, DOC-108, DOC-109, DOC-111 |
| `seed()` src/app.js:3009 | DOC-002 - DOC-005, DOC-112 |
| file input wiring src/app.js:3066-3068 | DOC-013, DOC-014, DOC-018, DOC-019 |
| drag-and-drop wiring src/app.js:3071-3084 | DOC-039 - DOC-048 |
| nav-item wiring src/app.js:3085 | DOC-085, DOC-094 |
| `showReaderFallback()` src/app.js:3180 | DOC-021, DOC-113, DOC-114, DOC-115 |
| `showEmptyReader()` src/app.js:3197 | DOC-103, DOC-116 |
| `initBundleState()` src/app.js:3283 | DOC-122 |
| `applyReadOnly()` src/app.js:3294 | DOC-048, DOC-122 |
| `boot()` src/app.js:3303 | DOC-001, DOC-003, DOC-008, DOC-081, DOC-084, DOC-112, DOC-116 |
| `#newBtn` "Open PDF or bundle" + title app.html:21 | DOC-013, DOC-091, DOC-103 |
| `#fileInput` accept/multiple app.html:22 | DOC-014 |
| `#btnShareHtml` app.html:23 | DOC-048, DOC-065, DOC-122 |
| nav items Home/Recents/Starred/Trash app.html:26-29 | DOC-085, DOC-086 |
| `#libSecLabel` app.html:31 | DOC-001, DOC-086 |
| `#docList` app.html:33 | DOC-074, DOC-091, DOC-092 |
| `#storageText` / `#storageBar` app.html:38-39 | DOC-009, DOC-097 |
| `.doc-act` hover/star/danger styling src/styles.css:74-80 | DOC-095 |
| `.lib-empty` src/styles.css:81 | DOC-091 |
| `#readerFallback` / `.fb-card` src/styles.css:453-454 | DOC-021, DOC-103, DOC-113 |
| `.top-banner` + `.tb-act` / `.tb-x` src/styles.css:657-670 | DOC-059, DOC-079 |
| `#reader.drop-hint` + `::after` prompt src/styles.css:673-674 | DOC-039, DOC-040, DOC-047 |
| "Opened <name> — highlight text or capture a figure to start." | DOC-015, DOC-020, DOC-021, DOC-031 - DOC-034, DOC-041, DOC-042 |
| "Reopened <name> — same paper, your notes are here." | DOC-018, DOC-027 - DOC-030, DOC-036 - DOC-038, DOC-115 |
| "Document not found." | DOC-117 |
| "Moved “<name>” to Trash." | DOC-101, DOC-102 |
| "Restored “<name>”." | DOC-106 |
| "Permanently delete “<name>” and its N notes? This cannot be undone." | DOC-108, DOC-111, DOC-112 |
| "N notes attached to “<doc>”." | DOC-042, DOC-049 - DOC-051, DOC-056, DOC-057, DOC-072 |
| "Notes “<file>” don’t match an open document — open its PDF too." | DOC-052 |
| "Could not read <file> — not valid JSON." | DOC-053 |
| "“<file>” has no notes to import." | DOC-054 |
| "“<file>” isn’t a PairedX shared paper." | DOC-066 |
| "Could not read the shared paper in “<file>”." | DOC-067 |
| "“<file>” has no embedded PDF." | DOC-068 |
| "Opened <name> — N notes loaded. Keep annotating." / "Opened <name>." | DOC-064, DOC-069, DOC-071 |
| "Could not open <file>: …" / "Could not open dropped files: …" | DOC-026, DOC-047 |
| "Have notes for <name>? Open its .notes.json to load them." + "Open notes file…" | DOC-059, DOC-061 |
| "Found notes for this PDF in “<folder>”: <file>. Open them?" | DOC-062 |
| "“<file>” was saved for a different PDF. Attach it to “<doc>” anyway?" | DOC-061 |
| "Trash is empty." / "No starred documents yet." / "No documents yet — use “Open PDF or bundle” to add one." | DOC-091 |
| "Your library is empty" + "Use Open PDF or bundle (top-left)…" | DOC-103, DOC-116 |
| "Open this file directly to read the PDF" + "Engine note:" | DOC-021, DOC-113 |
| "Could not load “<name>”. Re-open it with New." | DOC-113 |
| "Could not open “<name>” — it may not be a valid PDF." | DOC-021 |
| "Drop a PDF (+ its .notes.json), or a shared .html, to open it" | DOC-039 |
| "Storage limit reached — export your notes to keep them." | DOC-119 |
| "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX" | DOC-048, DOC-122 |
| "Calculating…" / "N documents" | DOC-009, DOC-097 |
| doc-row tooltips "Star" / "Unstar" / "Move to trash" / "Restore" / "Delete forever" | DOC-095, DOC-098, DOC-101, DOC-106, DOC-108 |

## Deliberately not covered here

- **`locateQuote()` (`src/app.js:795`) and `rectsForQuote()` (`src/app.js:3029`)** - both are defined but have **zero call sites** at this revision (verified by grep across `src/app.js`, `app.html`, `index.html`, `features.html`), so no manual step can exercise them. If a future build re-enables quote re-anchoring on document open, add checks for the `FALLBACK` rect `{x:0.14, y:0.2, w:0.72, h:0.03}`, the 60/40/24/14-character prefix ladder, the 4-line cap, and the null return when no page contains the quote.
- **Notes storage folder setup UI** (Settings → Storage, "Choose folder…", "Change folder", "Turn off", `chooseNotesFolder()`, `writeNotesToFolder()`, `loadNotesFromFolder()`, `scheduleFolderSync()`) - covered in *Settings and notes storage*. This document only exercises folder mode where it changes document-open behaviour (DOC-062, DOC-063).
- **Saving and exporting notes** (`saveNotesNow()`, `saveAsFile()`, `downloadNotesJSON()`, `importNotesJSON()`, `maybeShowSaveAsTip()`, `clearActiveNotes()`) - covered in *Notes export, import and sharing*. Here they appear only as fixture generators.
- **Building a share file** (`exportSelfContainedHTML()`) - covered in *Notes export, import and sharing*; this document covers only the **import** direction.
- **Import sanitisation internals** (`sanitizeImportedNotes()`, `sanitizeImportedAnnotation()`, `sanitizeImportedMessage()`, `safeImgSrc()`, the id/size caps) - covered in *Security and untrusted input*.
- **OCR detection, banner and run** (`detectAndOfferOcr()`, `showOcrBanner()`, `runOcr()`, `loadOcrStore()`) - covered in *OCR and scanned documents*; only the switch-cancels-OCR interaction is checked here (DOC-080).
- **Reader rendering, zoom, continuous mode, pinch and in-document search** - covered in *Reader and navigation*.
- **Note creation, threads, tags, filters and AI** - covered in *Notes and annotations* and *AI and providers*.
- **Panel collapse, drawers, resizing and mobile layout** - covered in *Layout and responsive shell*.
