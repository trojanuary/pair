# 11 - Share as HTML, read-only bundle & export to PDF

> Everything about the self-contained `.annotated.html` share file: how it is built and what it must (and must not) contain, the native Save As dialog and its download fallback, the read-only viewer the file boots into, re-importing a shared bundle back into an editable document, and the print/PDF annotation packet with its include-toggles and layouts.

| | |
|---|---|
| **ID prefix** | SHARE |
| **Scope** | `#btnShareHtml` → `exportSelfContainedHTML()`; `notesJSONForExport()` re-inlining `"@idb"` assets; the five inlined resources (`app.html`, `styles.css`, `pdf.min.js`, `pdf.worker.b64.js`, `app.js`), the stripped sample scripts and Vercel analytics, `<` bundle escaping and `<\/script` rewriting; `saveAsFile()` (Chromium `showSaveFilePicker`) + download fallback + `maybeShowSaveAsTip()`; the exported file opened offline on every engine; `window.__PAIR_BUNDLE__` → `PAIR_BUNDLE` / `READONLY` → `initBundleState()` + `applyReadOnly()` + `#roBanner`; `importSharedHTML()` via `#fileInput`, `#newBtn` and drag-and-drop; the export → open → re-import → keep-editing round trip; `#btnExportPdf` → `openExport()` / `buildSheet()` / `exState` and the `@media print` packet. |
| **Primary code** | `src/app.js:42-43`, `src/app.js:196-202`, `src/app.js:255-308`, `src/app.js:2503-2523`, `src/app.js:2540-2601`, `src/app.js:2845-2906`, `src/app.js:3067`, `src/app.js:3283-3353`, `app.html:21-23`, `app.html:128-136`, `src/styles.css:395-451`, `src/styles.css:676-680` |
| **Checks** | 130 |

## Contents
- [1. The Share as HTML entry point](#1-the-share-as-html-entry-point) - 9 checks
- [2. What the exported file actually contains](#2-what-the-exported-file-actually-contains) - 17 checks
- [3. Save As, the download fallback and the browser tip](#3-save-as-the-download-fallback-and-the-browser-tip) - 16 checks
- [4. Opening the exported file: size, offline, every browser](#4-opening-the-exported-file-size-offline-every-browser) - 12 checks
- [5. The read-only viewer](#5-the-read-only-viewer) - 17 checks
- [6. Read-only edge cases and affordance leaks](#6-read-only-edge-cases-and-affordance-leaks) - 10 checks
- [7. Re-importing a shared bundle](#7-re-importing-a-shared-bundle) - 16 checks
- [8. The full round trip](#8-the-full-round-trip) - 6 checks
- [9. Export to PDF: the export view](#9-export-to-pdf-the-export-view) - 18 checks
- [10. The printed packet](#10-the-printed-packet) - 9 checks
- [Coverage map](#coverage-map)
- [Deliberately not covered here](#deliberately-not-covered-here)

---

**Standing fixtures for this document.** Prepare once, reuse throughout.

| Fixture | How to make it |
|---|---|
| `paper-a.pdf` | A real text PDF, 5-15 pages, 2-8 MB. |
| `paper-big.pdf` | A 100+ page PDF, > 25 MB. Used for the slow-build / activation-expiry checks. |
| `paper-scan.pdf` | An image-only (scanned) PDF, so OCR detection fires. |
| **Rich notes set** | On `paper-a.pdf`: ≥ 8 notes covering *all* of — a yellow highlight, a blue linked-text note, a free point comment with no text, a screenshot note, an AI text answer, an AI answer containing LaTeX (`\( … \)`), a generated image visual with an `Approximate` badge, and one note whose text is literally `</script><img src=x onerror=alert(1)>`. |
| `paper-a.annotated.html` | Produced by **Share as HTML** with the rich notes set active. |
| `not-pairedx.html` | Any ordinary web page saved as `.html`. |
| `truncated.annotated.html` | `paper-a.annotated.html` cut off halfway through the `window.__PAIR_BUNDLE__=` line. |
| `nopdf.annotated.html` | `paper-a.annotated.html` with `"pdfB64":"…"` hand-edited to `"pdfB64":""`. |
| `renamed.annotated.html` | A copy of `paper-a.pdf` renamed to `renamed.annotated.html`. |

**Reset recipes** (referred to by name below):

- **Clean profile** — DevTools → Application → Storage → *Clear site data*, then reload `/app.html`.
- **Reset the save tip** — console: `localStorage.removeItem('srw_saveas_tip')`, then reload.
- **Inspect an export** — open the `.annotated.html` in a text editor, or `grep -c` / `grep -o` from a terminal. Several checks below depend on this; do not skip it.
- **Read the bundle** — in the *opened* shared file's console: `JSON.parse(JSON.stringify(window.__PAIR_BUNDLE__))`.

> **Serving note.** `exportSelfContainedHTML()` fetches `/app.html`, `/src/styles.css`, `/vendor/pdf.min.js`, `/vendor/pdf.worker.b64.js`, `/src/app.js` with **absolute** paths (`src/app.js:2560-2566`). Sharing therefore only works when the app is served from a site root — `http://localhost:8765/app.html` or `https://pairedx.com/app`. It cannot work from a `file://` page or a sub-path deploy.

---

## 1. The Share as HTML entry point

### SHARE-001 - The Share button exists, is labelled, and sits under New
**P0** * Visual * `app.html:23 #btnShareHtml`, `src/styles.css:47-50 .side-btn`

- **Pre:** Clean profile, `/app.html` loaded with the bundled sample.
- **Steps:**
  1. Look at the left sidebar, directly below the blue **"Open PDF or bundle"** button.
- **Expect:** A single full-width outlined button reading exactly **"Share as HTML"**, preceded by a document icon whose body carries the white letters "HTML". It is the muted/secondary `.side-btn` treatment (transparent background, 1px `--line` border, 34px tall, `--muted` text), visually subordinate to the primary New button above it.
- **Watch:** A sidebar restyle that turns `.side-btn` into a primary button makes Share compete with New; a sidebar reflow that pushes it inside `.sb-scroll` makes it scroll away on short viewports.

### SHARE-002 - The Share button tooltip is verbatim
**P1** * Copy * `app.html:23 #btnShareHtml[title]`

- **Pre:** As above.
- **Steps:**
  1. Hover the pointer over **"Share as HTML"** and wait for the native tooltip.
- **Expect:** The tooltip reads exactly `"Save this paper + notes as one self-contained .html you can share"`.
- **Watch:** Copy drift after a rename ("Export as HTML", "Share paper") — the tooltip is the only place that explains what the file is.

### SHARE-003 - The Share button has a hover state
**P2** * Visual * `src/styles.css:49 .side-btn:hover`

- **Pre:** As above.
- **Steps:**
  1. Move the pointer on and off the button.
- **Expect:** On hover the background fills to `--surface-2` and the label darkens from `--muted` to `--text`. Off hover it returns. No layout shift, no border colour change.
- **Watch:** A missing hover state makes the button read as a static label; a hover that changes padding shifts the sidebar list below it.

### SHARE-004 - Clicking Share announces the build immediately
**P0** * Functional * `src/app.js:2556 exportSelfContainedHTML()`, `src/app.js:3067 wire()`

- **Pre:** `paper-a.pdf` open and active with the rich notes set.
- **Steps:**
  1. Click **"Share as HTML"**.
  2. Watch the toast area in the bottom-right *before* any save dialog appears.
- **Expect:** A neutral (non-error) toast reading exactly `"Building shareable file…"` (note the single-character ellipsis) appears within ~100 ms, before the Save As dialog or the download.
- **Watch:** If the toast is missing, a multi-second build on a large paper looks like a dead click and the user clicks again (see SHARE-008).

### SHARE-005 - Share exports the ACTIVE document, not the last-shared one
**P0** * State * `src/app.js:2553-2555 exportSelfContainedHTML()`, `src/app.js:3067`

- **Pre:** Library holds the sample plus `paper-a.pdf`, each with distinct notes.
- **Steps:**
  1. With the sample active, click **"Share as HTML"** and save it.
  2. Click `paper-a.pdf` in the sidebar to switch documents.
  3. Click **"Share as HTML"** again and save it.
- **Expect:** The second file's suggested name derives from `paper-a.pdf`, and opening it shows `paper-a.pdf`'s pages and only `paper-a.pdf`'s notes. The two exports share no notes.
- **Watch:** A cached `docId` (or a stale closure over `state.ui.activeDoc`) silently re-exports the previous paper — the recipient gets the wrong document with a plausible filename.

### SHARE-006 - Sharing with an empty library fails cleanly
**P1** * Edge * `src/app.js:2558-2559 exportSelfContainedHTML()`, `src/app.js:196 loadDocBytes()`

- **Pre:** Trash and then permanently delete every document, including the sample, so the reader shows the empty state.
- **Steps:**
  1. Click **"Share as HTML"**.
- **Expect:** After `"Building shareable file…"`, an error (red) toast reads exactly `"Could not read the PDF for this document."`. No save dialog, no download, no console exception, and the app remains usable.
- **Watch:** `activeDoc()` returns `undefined` here — a refactor that reads `doc.name` before the bytes check throws a `TypeError` and white-screens the handler.

### SHARE-007 - Sharing a document whose bytes were evicted fails cleanly
**P1** * Edge * `src/app.js:196-202 loadDocBytes()`, `src/app.js:2558-2559`

- **Pre:** `paper-a.pdf` open. In DevTools → Application → IndexedDB → `srw_assets` → `assets`, delete the `pdf:<docId>` record for it, then reload the page (do **not** clear localStorage).
- **Steps:**
  1. Wait for the reader fallback / failed load, then click **"Share as HTML"**.
- **Expect:** Error toast `"Could not read the PDF for this document."`. Nothing is written and nothing downloads.
- **Watch:** Exporting a doc with null bytes must not produce a 2 MB "shell only" file — a shared file with no PDF is worse than no file.

### SHARE-008 - Rapid double-click on Share does not corrupt the export
**P1** * Edge * `src/app.js:2553 exportSelfContainedHTML()`, `src/app.js:2503 saveAsFile()`

- **Pre:** `paper-a.pdf` active. Chromium.
- **Steps:**
  1. Double-click **"Share as HTML"** as fast as possible.
  2. Handle whichever dialogs appear; note every file that lands on disk.
- **Expect:** Two independent exports run. `"Building shareable file…"` appears twice. The second `showSaveFilePicker` call is rejected by the browser ("File picker already active") and, because that rejection is **not** an `AbortError`, that export takes the download fallback — so you may legitimately end up with one *saved* file plus one *downloaded* copy of the same content. Both files must be complete and openable; neither may be truncated or empty.
- **Watch:** The failure signature is a 0-byte or half-written file — or the *first* dialog silently closing. Also verify the second toast is `"Exported …"` (download path) and not an unhandled promise rejection in the console.

### SHARE-009 - Share is the only entry point; the reader "⋯" button is gone
**P1** * Regression * `src/app.js:2621 injectNotesButtons()`, `app.html:68 #btnExportTop`, `src/app.js:3125`

- **Pre:** `/app.html` loaded.
- **Steps:**
  1. Inspect the reader toolbar for a `⋯` button.
  2. Inspect the notes-panel header for a `⋮` (kebab) button.
  3. Try every keyboard shortcut you know; confirm none triggers the HTML export.
- **Expect:** Neither `#btnExportTop` (`⋯`) nor `#btnNotesMenu` (`⋮`) is present in the DOM — `injectNotesButtons()` removes both on wire. The HTML export has **no** keyboard shortcut; the sidebar button is its single entry point.
- **Watch:** A markup change that re-adds `#btnExportTop` resurrects a dead `⋯` that either does nothing or opens the *PDF* export view, confusing it with HTML sharing.

---

## 2. What the exported file actually contains

> Every check in this section is run against `paper-a.annotated.html` **in a text editor / from a terminal**, not in the browser. These are the checks that catch a silently broken share.

### SHARE-010 - The stylesheet is inlined, not linked
**P0** * Functional * `src/app.js:2580 exportSelfContainedHTML()`, `app.html:8`

- **Pre:** `paper-a.annotated.html` exported.
- **Steps:**
  1. Search the file for `href="/src/styles.css"`.
  2. Search for `<style>`.
- **Expect:** Zero hits for `href="/src/styles.css"`. Exactly one `<style>` block containing the full contents of `src/styles.css` (search inside it for `.ex-sheet` and `body.readonly #roBanner` to prove it is the real file, not a stub).
- **Watch:** The replacement regex is `/<link\b[^>]*href="\/src\/styles\.css"[^>]*>/` — reordering the attributes in `app.html` (e.g. putting `rel` after `href`) still matches, but changing the path or adding a second stylesheet link does not. A missed link makes the shared file render as unstyled HTML.

### SHARE-011 - PDF.js is inlined
**P0** * Functional * `src/app.js:2581`, `app.html:130`

- **Pre:** As above.
- **Steps:**
  1. Search for `src="/vendor/pdf.min.js"`.
  2. Search for `pdfjsLib`.
- **Expect:** Zero hits for the `src=` reference; the PDF.js source is present inline (`pdfjsLib` appears many times).
- **Watch:** If `app.html` ever changes the tag's whitespace or adds attributes (e.g. `defer`), the exact-string regex `/<script src="\/vendor\/pdf\.min\.js"><\/script>/` stops matching — the shared file then requests `/vendor/pdf.min.js` from whatever server it happens to be on and shows a blank reader.

### SHARE-012 - The PDF.js worker is inlined
**P0** * Functional * `src/app.js:2582`, `app.html:131`

- **Pre:** As above.
- **Steps:**
  1. Search for `src="/vendor/pdf.worker.b64.js"`.
  2. Confirm the file is at least ~1.4 MB larger than the shell alone.
- **Expect:** Zero hits for the `src=` reference; the base64 worker payload is present inline.
- **Watch:** The worker is inlined **without** the `inlineJs()` `</script` rewrite (only `pdfjs` and `appjs` get it). That is safe only because base64 contains no `<`. If the worker file format ever changes to raw JS, this line must gain `inlineJs(...)` or the export will break the moment the source contains a close-tag.

### SHARE-013 - app.js is inlined and preceded by the bundle
**P0** * Functional * `src/app.js:2585`, `app.html:134`

- **Pre:** As above.
- **Steps:**
  1. Search for `src="/src/app.js"`.
  2. Search for `window.__PAIR_BUNDLE__=`.
- **Expect:** Zero hits for the `src=` reference. Exactly one occurrence of `window.__PAIR_BUNDLE__=`, in its own `<script>` block, immediately **before** the inlined `app.js` block — the app reads `window.__PAIR_BUNDLE__` at parse time (`src/app.js:42`), so the order is load-bearing.
- **Watch:** Reversing the order (app.js first) makes `PAIR_BUNDLE` null: the file boots as a normal empty app with the recipient's own library instead of the shared paper.

### SHARE-014 - The bundled sample scripts are stripped
**P0** * Functional * `src/app.js:2583-2584`, `app.html:132-133`

- **Pre:** As above.
- **Steps:**
  1. Search for `sample-pdf.js`, `sample-notes.js`, `SAMPLE_PDF_B64` and `SAMPLE_NOTES_JSON` as *script sources*.
- **Expect:** No `<script src="/assets/sample-pdf.js">` and no `<script src="/assets/sample-notes.js">` tags. (The identifiers `SAMPLE_PDF_B64` / `SAMPLE_NOTES_JSON` still appear inside the inlined `app.js` source — that is expected; what must be absent is the ~2.1 MB of sample payload and any request for it.)
- **Watch:** Leaving them in adds ~2.1 MB of a *different* paper to every share and makes the shared file request two URLs that will 404 on the recipient's disk.

### SHARE-015 - Vercel analytics is stripped: a shared file never phones home
**P0** * Security * `src/app.js:2586-2587`, `app.html:135-136`

- **Pre:** As above.
- **Steps:**
  1. Search for `window.va=`.
  2. Search for `_vercel/insights`.
- **Expect:** Zero hits for both. The analytics shim and the deferred insights script are removed from every exported file.
- **Watch:** Per `00-test-plan.md` §8, a shared `.annotated.html` making any outbound call when opened offline is **always S1**. The strip regex `/<script>window\.va=[\s\S]*?<\/script>\s*/` is a literal match on the current markup — reformatting that line in `app.html` (adding a newline or attributes) silently disables the strip.

### SHARE-016 - The bundle object has exactly the expected shape
**P0** * State * `src/app.js:2568 exportSelfContainedHTML()`

- **Pre:** `paper-a.annotated.html` opened in a browser.
- **Steps:**
  1. In its console run `Object.keys(window.__PAIR_BUNDLE__)`.
  2. Run `window.__PAIR_BUNDLE__.readOnly`, `.name`, `.sha`, and `Object.keys(window.__PAIR_BUNDLE__.notes)`.
- **Expect:** Keys are exactly `["readOnly","name","sha","pdfB64","notes"]`. `readOnly === true`. `name` is the source document's full name including its extension (e.g. `"paper-a.pdf"`). `sha` is the 64-char hex SHA-256 of the PDF, or `null` for the bundled sample (the sample doc carries no `sha`). `notes` has keys `app`, `schema`, `exportedAt`, `document`, `noteCount`, `annotations`.
- **Watch:** Any *extra* key is a leak vector. In particular there must be no `settings`, no `keys`, no `provider`.

### SHARE-017 - Every "<" in the bundle is escaped as <
**P0** * Security * `src/app.js:2571 exportSelfContainedHTML()`

- **Pre:** Rich notes set includes the note whose text is `</script><img src=x onerror=alert(1)>`.
- **Steps:**
  1. In the exported file, locate the `window.__PAIR_BUNDLE__=` line.
  2. Count literal `<` characters between `window.__PAIR_BUNDLE__=` and the terminating `;</script>`.
- **Expect:** Zero. Every `<` from note text (and from any base64 or metadata) appears as the six characters `<`. The only `<` on that line is the one that starts the closing `</script>` tag itself.
- **Watch:** This is the single defence that keeps hostile note text from ending the inline script block early. If it regresses, a note containing `</script>` turns the rest of the bundle into live HTML — S1.

### SHARE-018 - Close-tags inside the inlined JS are neutralised
**P0** * Security * `src/app.js:2575 inlineJs()`, `src/app.js:2581`, `src/app.js:2585`

- **Pre:** As above.
- **Steps:**
  1. Search the inlined `app.js` and `pdf.min.js` blocks for the exact sequence `</script`.
- **Expect:** No occurrence inside either block; any that existed in the source appears as `<\/script` (byte-identical JavaScript, invisible to the HTML parser). The only `</script>` sequences in the file are the real block terminators.
- **Watch:** Add a regex or string literal containing `</script` to `app.js` and re-export — if `inlineJs()` were dropped, the file would truncate at that point and boot to a blank page.

### SHARE-019 - A note containing script markup survives the round trip and renders inert
**P0** * Security * `src/app.js:2571`, `src/app.js:279 importSharedHTML()`, `src/app.js:2292 sanitizeImportedMessage()`

- **Pre:** The hostile-text note (`</script><img src=x onerror=alert(1)>`) is in the rich notes set.
- **Steps:**
  1. Export, then open `paper-a.annotated.html` in a browser with the console open.
  2. Read that note in the notes panel.
  3. Back in the app, re-import the same file via **"Open PDF or bundle"** and read the note again.
- **Expect:** No alert, no console error, no injected `<img>` element. In both the read-only viewer and after re-import, the note text renders **visibly and literally** as `</script><img src=x onerror=alert(1)>`, HTML-escaped. Nothing is dropped or truncated.
- **Watch:** Two failure directions: script executes (S1), or the sanitiser silently deletes legitimate note text (also serious — the app deliberately preserves fields rather than whitelisting, `src/app.js:2280-2287`).

### SHARE-020 - Offloaded screenshots are re-inlined: no "@idb" in the file
**P0** * Functional * `src/app.js:2540 notesJSONForExport()`, `src/app.js:151 save()`

- **Pre:** `paper-a.pdf` with at least one screenshot note. **Reload the page** first, so the screenshot has been through the localStorage `"@idb"` offload and the `rehydrateAssets()` restore.
- **Steps:**
  1. Export.
  2. Search the file for the exact string `@idb`.
  3. Open the exported file and confirm the screenshot thumbnail renders.
- **Expect:** Zero occurrences of `@idb`. Every `"screenshot"` value is a full `data:image/…;base64,…` URL. The thumbnail renders in the read-only viewer with no network access.
- **Watch:** `00-test-plan.md` calls `@idb` in an exported file a **bug** outright. It regresses whenever an `await` is dropped from the `idbGet` loop, or when a new image-bearing message type is added without extending `notesJSONForExport()`.

### SHARE-021 - Offloaded generated visuals are re-inlined too
**P0** * Functional * `src/app.js:2544 notesJSONForExport()`

- **Pre:** A note with an AI-generated **image** visual (not an ASCII diagram), after a page reload so it has been offloaded to IndexedDB under `img:<msgId>`.
- **Steps:**
  1. Export and open the file.
  2. Locate the generated-visual message in the notes panel.
- **Expect:** The image renders inline. In the file, the message's `"image"` field is a `data:` URL, never `"@idb"` and never `null`.
- **Watch:** Screenshots and message images are re-inlined by two *separate* loops — a fix applied to only one of them leaves generated visuals as broken image boxes for the recipient.

### SHARE-022 - No API key, settings or prompt overrides leak into the file
**P0** * Security * `src/app.js:2568`, `src/app.js:2271 docNotesJSON()`

- **Pre:** In Settings → AI & Tools, save a recognisable dummy OpenRouter key such as `sk-or-QA-CANARY-12345`. In Settings → Templates, edit the "Text answers" prompt to contain the word `CANARYPROMPT`. Save. Then export.
- **Steps:**
  1. Search the exported file for `CANARY`, `sk-or-`, `srw_state_v1`, `compatBaseUrl`.
- **Expect:** Zero hits for `CANARY` and for the key. (`srw_state_v1` and `compatBaseUrl` appear only as identifiers inside the inlined `app.js` source — that is the app's own code, not your data. Confirm they are not inside the `window.__PAIR_BUNDLE__=` line.)
- **Watch:** Per `00-test-plan.md` §8, a key in a shared bundle is **always S1**. The exposure would appear the moment anyone widens the bundle to `{...state}` for convenience.

### SHARE-023 - The filename is derived and sanitised exactly
**P1** * Copy * `src/app.js:2588-2589 exportSelfContainedHTML()`

- **Pre:** The bundled sample (`BERT — Devlin et al. 2019 (NAACL).pdf`) is active.
- **Steps:**
  1. Click **"Share as HTML"** and read the name pre-filled in the Save As dialog (Chromium) or the downloaded filename (Firefox/Safari).
- **Expect:** Exactly `BERT _ Devlin et al. 2019 _NAACL_.annotated.html` — the `.pdf` suffix is stripped, every run of characters outside `[\w.\- ]` collapses to a single `_` (so the em dash and each parenthesis each become `_`), spaces, dots and hyphens survive, and `.annotated.html` is appended.
- **Watch:** Widening the character class to allow `/` or `:` produces filenames the OS rejects; tightening it to strip spaces silently renames every share.

### SHARE-024 - A document whose name sanitises to nothing falls back to "paper"
**P2** * Edge * `src/app.js:2588`

- **Pre:** Open a PDF whose filename is only punctuation, e.g. `!!!.pdf` (rename any PDF).
- **Steps:**
  1. Share it and read the suggested filename.
- **Expect:** `_.annotated.html` for `!!!.pdf` (the punctuation run collapses to one `_`). For a file literally named `.pdf` the base is empty and the fallback applies: `paper.annotated.html`.
- **Watch:** Without the `|| 'paper'` fallback the name becomes `.annotated.html`, a hidden file on macOS/Linux that the user will never find.

### SHARE-025 - Only the active document's notes travel
**P0** * State * `src/app.js:2271 docNotesJSON()`, `src/app.js:2567`

- **Pre:** Sample plus `paper-a.pdf`, each with distinct notes. `paper-a.pdf` active.
- **Steps:**
  1. Export.
  2. In the file, read `noteCount` on the bundle's `notes` object and compare it with the notes-panel counter for `paper-a.pdf`.
  3. Search the bundle for a phrase that appears only in a *sample* note.
- **Expect:** `noteCount` equals the count shown in the notes panel footer for the active document. No sample note text appears anywhere in the file.
- **Watch:** A change to `docIdOf()` / `inActiveDoc()` filtering leaks another paper's private notes to the recipient — a privacy bug that looks like a counting bug.

### SHARE-026 - Pending and errored AI messages travel as-is
**P2** * Edge * `src/app.js:2271 docNotesJSON()`

- **Pre:** Force an AI answer to fail (Settings → a bogus base URL, then ask a question) so the thread holds a message with `error` set. Optionally start a long answer and export while it is still `pending`.
- **Steps:**
  1. Export and open the file.
  2. Inspect that note in the read-only viewer.
- **Expect:** `docNotesJSON()` deep-copies whole annotations, so the failed/pending message **is** in the bundle and renders in the read-only viewer exactly as it did in the app (error text or a stuck pending state). It must not crash the viewer.
- **Watch:** A pending message that renders as a live spinner in a read-only file looks like the file is loading forever. Note that the *PDF export* sheet deliberately skips these (`src/app.js:2897-2898`) — the HTML share deliberately does not.

---

## 3. Save As, the download fallback and the browser tip

### SHARE-027 - Chromium: a native Save As dialog opens with the right name and type
**P0** * Functional * Chromium only * `src/app.js:2503 saveAsFile()`, `src/app.js:2592`

- **Pre:** Chrome or Edge, `paper-a.pdf` active.
- **Steps:**
  1. Click **"Share as HTML"**.
  2. Read the dialog's filename field and its file-type dropdown.
- **Expect:** The OS Save dialog appears. The filename field is pre-filled with `paper-a.annotated.html`. The file-type entry reads **"Annotated paper (HTML)"** and filters to `.html`.
- **Watch:** If the dialog does not appear at all on Chromium, jump to SHARE-034 — the most likely cause is user-activation expiry, not a missing API.

### SHARE-028 - The dialog reopens in the last-used folder, with no persistent grant
**P1** * State * Chromium only * `src/app.js:2507-2510 saveAsFile()`

- **Pre:** Chrome. Complete one export into a folder such as `~/Desktop/qa`.
- **Steps:**
  1. Export again and note where the dialog starts.
  2. Reload `/app.html` and export a third time.
  3. Check the site's permissions (icon left of the URL → Site settings) for any persistent "File editing" grant.
- **Expect:** The dialog re-opens in `~/Desktop/qa` (the `id: 'srw-save'` convenience), but **every** export shows a fresh dialog — no file is ever written without one, and no "allow on every visit" permission prompt appears. The same `id` is shared with **Save notes**, so saving notes into a folder also moves the share dialog's starting point.
- **Watch:** Caching the `FileSystemFileHandle` would silently overwrite the previous share on the next click and trigger a cross-visit permission prompt. The code comment at `src/app.js:2498-2502` says this is deliberate.

### SHARE-029 - A successful save reports the real name and the size
**P0** * Copy * `src/app.js:2593 exportSelfContainedHTML()`

- **Pre:** Chromium.
- **Steps:**
  1. Export, and in the dialog **rename** the file to `shared-for-review.html` before saving.
  2. Read the toast.
- **Expect:** A neutral toast of the form `"Saved shared-for-review.html — 4.1 MB, opens anywhere."` — the name is the one the OS returned (`handle.name`), not the suggested name, and the size is one decimal place followed by ` MB`.
- **Watch:** Reporting `fname` instead of `r.name` here is a subtle copy bug that only shows when the user renames in the dialog.

### SHARE-030 - Cancelling the dialog exports nothing
**P0** * Functional * Chromium only * `src/app.js:2512`, `src/app.js:2594`

- **Pre:** Chromium.
- **Steps:**
  1. Click **"Share as HTML"**, then press **Escape** / click **Cancel** in the OS dialog.
  2. Watch the toasts and the Downloads shelf.
- **Expect:** Nothing is written and **nothing is downloaded**. No `"Saved …"` toast, no `"Exported …"` toast, no error toast. The only toast in the sequence is the earlier `"Building shareable file…"`.
- **Watch:** The classic regression is a cancelled dialog falling through to the download branch, so "Cancel" still drops a 4 MB file in Downloads. `AbortError` must map to `'cancelled'`, not `'fallback'`.

### SHARE-031 - Saving over an existing file overwrites in place
**P1** * Functional * Chromium only * `src/app.js:2514-2518 saveAsFile()`

- **Pre:** Chromium. `paper-a.annotated.html` already exists in your target folder.
- **Steps:**
  1. Add one new note to `paper-a.pdf`.
  2. Export and, in the dialog, select the existing `paper-a.annotated.html` and confirm the OS replace prompt.
  3. Inspect the folder.
- **Expect:** Exactly one file, updated in place, containing the new note. No `paper-a.annotated (1).html`.
- **Watch:** This is the whole reason Save As exists (see the comment at `src/app.js:2497-2502`). If duplicates start piling up, the download fallback is being taken silently.

### SHARE-032 - A write failure downloads a copy instead
**P1** * Edge * Chromium only * `src/app.js:2519-2522 saveAsFile()`

- **Pre:** Chromium. A location you cannot write to (e.g. a read-only volume, or a folder whose permissions you revoke between choosing and writing).
- **Steps:**
  1. Export and choose that location.
- **Expect:** An error (red) toast reading `"Couldn’t write there: <message> — downloading a copy instead."` (curly apostrophe in "Couldn’t"), immediately followed by the download-fallback path and the `"Exported paper-a.annotated.html — N.N MB, opens anywhere."` toast. The user ends up with the file either way.
- **Watch:** Swallowing this error loses the export entirely after the user already picked a location.

### SHARE-033 - Two exports in a row both prompt
**P2** * State * Chromium only * `src/app.js:2505-2513`

- **Pre:** Chromium.
- **Steps:**
  1. Export and save.
  2. Without reloading, export again.
- **Expect:** A second, fresh dialog. The app never silently re-saves to the first location.
- **Watch:** Any future "remember my choice" optimisation breaks the stated no-handle-retained contract and should be caught here.

### SHARE-034 - A slow build on a large paper falls back to a download
**P1** * Edge * Chromium only * `src/app.js:2503-2513 saveAsFile()`, `src/app.js:2558-2590`

- **Pre:** Chrome. `paper-big.pdf` (> 25 MB, 100+ pages) open, ideally on a throttled connection so the five resource fetches are slow.
- **Steps:**
  1. Click **"Share as HTML"**.
  2. Time how long the build takes before anything else happens.
- **Expect:** The export **always completes** — either the Save As dialog appears, or (when the build outran the browser's transient user-activation window, ~5 s) `showSaveFilePicker` rejects with a non-`AbortError` and the file is delivered through the download fallback with the toast `"Exported <name>.annotated.html — N.N MB, opens anywhere."`. It must never be a silent no-op.
- **Watch:** This is the highest-value edge case in this section: the build does `loadDocBytes` → 5 fetches → `notesJSONForExport` → `bytesToB64` → a `JSON.stringify` plus several regex passes over a multi-megabyte string, all before the picker is called. On big papers Chromium users lose the dialog and get a plain download with **no explanation** (`maybeShowSaveAsTip()` only fires when `showSaveFilePicker` is absent). Confirm at minimum that the file still arrives.

### SHARE-035 - Firefox: no dialog, a one-time tip, then a download
**P0** * Functional * Firefox/Safari only * `src/app.js:2504 saveAsFile()`, `src/app.js:2460 maybeShowSaveAsTip()`

- **Pre:** Firefox, clean profile (`srw_saveas_tip` unset). `paper-a.pdf` active.
- **Steps:**
  1. Click **"Share as HTML"**.
- **Expect:** No OS save dialog (Firefox has no `showSaveFilePicker`). A modal appears titled **"Choose where your files save"** with the sub-line `"In Firefox, turn on one setting to pick where each download goes — and overwrite instead of piling up “(1)” copies."` (curly quotes around `(1)`). Behind/alongside it the file downloads normally and the toast reads `"Exported paper-a.annotated.html — N.N MB, opens anywhere."`.
- **Watch:** The modal is non-blocking — `maybeShowSaveAsTip()` returns synchronously and the download proceeds underneath. If a future change makes the tip `await`-ed, the download will be blocked behind a modal the user did not ask for.

### SHARE-036 - Safari gets Safari-specific tip wording
**P1** * Copy * Firefox/Safari only * `src/app.js:2463-2471 maybeShowSaveAsTip()`

- **Pre:** Safari on macOS, `srw_saveas_tip` unset.
- **Steps:**
  1. Export and read the modal.
- **Expect:** Sub-line names **Safari**. The steps read `"Open Settings → General"` then `"Find File download location"`, and the highlighted setting box reads **"Ask for each download"** with a violet **✓** to its right (not a toggle). Firefox instead shows `"Open Settings → General"`, `"Scroll to Files and Applications"`, the setting **"Always ask you where to save files"**, and a toggle mock. Any other non-Chromium engine shows `"Open your browser’s download settings"` and **"Always ask where to save files"**.
- **Watch:** The UA sniff at `src/app.js:2465` excludes `chrome|chromium|crios|edg|edgios|android|opr\/`. Chrome on iOS (`crios`) has no `showSaveFilePicker` either — verify it lands on the generic "your browser" copy, not on the Safari copy.

### SHARE-037 - The tip's numbered stepper renders correctly
**P2** * Visual * `src/app.js:2472-2488 maybeShowSaveAsTip()`

- **Pre:** Firefox, tip not yet shown.
- **Steps:**
  1. Trigger the tip and inspect it.
- **Expect:** Indigo circular badges numbered 1, 2, 3 down the left, joined by a thin vertical connector line between them. The last step's label is `"Turn on:"` above an indigo-tinted box containing the setting name and the control mock. A single right-aligned button reads **"Got it"**. Maximum width 470px, left-aligned text.
- **Watch:** The connector line is drawn on every step including the last one (`step(i+1, s, true)` for all `cfg.steps`), so a dangling stub below step 2 is expected only if the final "Turn on:" block fails to render — check the two are visually joined.

### SHARE-038 - The tip dismisses four ways
**P2** * Functional * `src/app.js:2490-2494 maybeShowSaveAsTip()`

- **Pre:** Firefox. Reset the save tip before each sub-step.
- **Steps:**
  1. Trigger the tip, click **"Got it"**.
  2. Reset, trigger, press **Escape**.
  3. Reset, trigger, press **Enter**.
  4. Reset, trigger, click the dark backdrop *outside* the box.
- **Expect:** All four close it and remove the mask from the DOM. Clicking *inside* the box (but not on the button) does **not** close it. After close, the page is fully interactive.
- **Watch:** The keydown listener is registered in capture phase on `document` and removed on close — if it leaks, Enter anywhere in the app afterwards would be swallowed.

### SHARE-039 - The tip is shown once per device
**P1** * State * `src/app.js:2462`, `src/app.js:2495 maybeShowSaveAsTip()`

- **Pre:** Firefox, tip not yet shown.
- **Steps:**
  1. Export once (tip appears), dismiss it.
  2. Export again.
  3. Check `localStorage.getItem('srw_saveas_tip')`.
  4. Reload the page and export a third time.
- **Expect:** The tip appears exactly once, ever. `srw_saveas_tip` is `"1"`. Steps 2 and 4 download silently with only the `"Exported …"` toast. The same flag is shared with the **Save notes** button — whichever fires first consumes the one showing.
- **Watch:** Private-browsing Safari throws on `localStorage.getItem`; the `catch (e) { return; }` means the tip is then **never** shown. Confirm the export still works in a private window.

### SHARE-040 - The tip never appears inside a shared read-only file
**P1** * State * `src/app.js:2461 maybeShowSaveAsTip()`, `src/app.js:43 READONLY`

- **Pre:** `paper-a.annotated.html` opened in Firefox on a device where the tip has not been shown.
- **Steps:**
  1. Exercise the read-only viewer thoroughly.
- **Expect:** The tip modal never appears — `READONLY` short-circuits it, and every save affordance is hidden anyway.
- **Watch:** A recipient seeing a modal about *download settings* in a file they just opened is confusing and looks like the file is trying to do something.

### SHARE-041 - The download fallback names the file and reports the size
**P0** * Functional * Firefox/Safari only * `src/app.js:2595-2599 exportSelfContainedHTML()`

- **Pre:** Firefox or Safari, tip already dismissed.
- **Steps:**
  1. Export.
  2. Inspect the file that lands in Downloads.
- **Expect:** The downloaded file is named `paper-a.annotated.html`, has MIME type `text/html`, is complete (opens and renders), and the toast reads `"Exported paper-a.annotated.html — N.N MB, opens anywhere."`. The object URL is revoked ~4 s later, so re-clicking a stale link does nothing.
- **Watch:** A blob URL revoked too early yields a 0-byte download on slow disks; too late leaks memory on repeated exports.

### SHARE-042 - Exporting while offline fails with a clear message
**P1** * Edge * `src/app.js:2560-2566`, `src/app.js:2600`

- **Pre:** `/app.html` fully loaded, then DevTools → Network → **Offline**.
- **Steps:**
  1. Click **"Share as HTML"**.
- **Expect:** `"Building shareable file…"` appears, then an error toast beginning `"Could not build the file: "` followed by the fetch error (e.g. `Failed to fetch`). No partial file is written or downloaded. The app stays usable and a retry once back online succeeds.
- **Watch:** The export re-fetches its five source files every time — there is no cache and no service worker, so *building* a share always needs the network even though *opening* one never does. Users on a flaky connection will hit this.

---

## 4. Opening the exported file: size, offline, every browser

### SHARE-043 - File size is in the expected band
**P1** * Perf * `src/app.js:2590`

- **Pre:** Exports of the bundled sample and of `paper-a.pdf`.
- **Steps:**
  1. Check each file's size on disk.
- **Expect:** No export is smaller than **≈ 2.0 MB** — the inlined engine alone is ~1.97 MB (`pdf.worker.b64.js` 1.45 MB + `pdf.min.js` 320 KB + `app.js` 234 KB + `styles.css` 48 KB + shell 11 KB). The PDF adds ~1.37× its own size (base64) and the notes add their JSON. The bundled sample lands around **3.5-4.5 MB**. A 25 MB PDF produces a ~36 MB share.
- **Watch:** A file *under* 2 MB means an inline replacement silently failed (§2) and the shared file will boot blank. A file that jumps by megabytes after a release means a new asset started being inlined.

### SHARE-044 - The reported MB is a character count, not the byte count
**P2** * Copy * `src/app.js:2590 exportSelfContainedHTML()`

- **Pre:** A document with heavily non-ASCII notes (CJK, emoji, accented text).
- **Steps:**
  1. Export and note the MB figure in the toast.
  2. Compare with the actual size on disk.
- **Expect:** The two are close but the on-disk file may be slightly **larger** — `html.length` counts UTF-16 code units while the file is written as UTF-8. A few percent of drift on non-ASCII content is expected and acceptable.
- **Watch:** Only file it if the gap is large enough to mislead (e.g. toast says 4 MB, disk says 12 MB).

### SHARE-045 - Chrome and Edge open the file straight from disk
**P0** * Functional * `src/app.js:3303 boot()`, `src/app.js:3283 initBundleState()`

- **Pre:** `paper-a.annotated.html` saved to the Desktop. No local server running.
- **Steps:**
  1. Double-click the file (opens as `file:///…`).
  2. Wait for it to boot.
- **Expect:** The full three-pane workspace renders, page 1 of `paper-a.pdf` draws in the reader, the notes panel lists every shared note, highlights and pins are drawn on the page, and the dark read-only banner sits at the bottom. Repeat in Edge — identical result.
- **Watch:** Chrome blocks IndexedDB on `file://`. `idbOpen()` resolves `null` on error and `save()` is a no-op under `READONLY`, so this must degrade silently — a `SecurityError` that reaches the console is acceptable only if nothing else breaks. A white page here is S1.

### SHARE-046 - Firefox opens the file from disk
**P0** * Functional * Firefox/Safari only * `src/app.js:3303 boot()`

- **Pre:** Same file, Firefox.
- **Steps:**
  1. Open it via File → Open File (or double-click with Firefox as the default handler).
- **Expect:** Identical result to SHARE-045 — pages render, notes render, banner shows.
- **Watch:** Firefox treats each `file://` document as its own opaque origin for storage; confirm no storage exception halts boot.

### SHARE-047 - Safari opens the file from disk
**P0** * Functional * Firefox/Safari only * `src/app.js:3303 boot()`

- **Pre:** Same file, Safari on macOS.
- **Steps:**
  1. Double-click the file.
  2. Scroll, zoom, open a note.
- **Expect:** Pages render, notes render, banner shows, scrolling and zoom work.
- **Watch:** Safari is the strictest about `file://` — if the PDF worker cannot start, boot falls through to `showReaderFallback()` after 7 s (see SHARE-054). That is a *fallback*, not a pass: the pages must actually render.

### SHARE-048 - The file works with no network at all
**P0** * Functional * `src/app.js:2560-2587`

- **Pre:** `paper-a.annotated.html` on disk.
- **Steps:**
  1. Turn on airplane mode / fully disconnect the machine from the network.
  2. Open the file.
  3. Page through the document, open notes, open a screenshot, zoom in and out, run **Find in document**.
- **Expect:** Everything renders and every reading interaction works. Text is selectable. Fonts fall back to the system stack (the Google Fonts link cannot resolve) — layout must still be correct, just not Inter.
- **Watch:** This is the product promise ("opens anywhere"). Any dependency on a remote asset for *reading* is a P0 regression.

### SHARE-049 - Opened online, the file makes no app/analytics requests
**P0** * Security * `src/app.js:2586-2587`

- **Pre:** Online. `paper-a.annotated.html` open with DevTools → Network recording from before load.
- **Steps:**
  1. Load the file and let it settle.
  2. Sort the request list by domain.
- **Expect:** **No** request to `/_vercel/insights/script.js`, none to `/api/ai` or `/api/ai-image`, none to `pairedx.com`, none to `/assets/sample-*.js`, and none to any relative app path (`/src/app.js`, `/vendor/*`).
- **Watch:** Per `00-test-plan.md` §8 this class of failure is **always S1**. Re-run it after any change to `app.html`'s script tags.

### SHARE-050 - Opened online, the only third-party request is the web font
**P1** * Security * `app.html:7-10`, `src/app.js:2580`

- **Pre:** As above.
- **Steps:**
  1. Read the full request list.
- **Expect:** The only external hosts contacted are `fonts.googleapis.com` (and `fonts.gstatic.com` for the font files) — the export replaces the local stylesheet link but **does not** strip the Google Fonts `<link>` or the `cdnjs`/`fonts` `preconnect` hints. Nothing else. This is a documented, benign dependency; record it so a future strip (or a new third-party host) is caught here.
- **Watch:** If a new CDN link is added to `app.html` without a matching `put()` rule, every shared file starts contacting a new host on the recipient's machine — treat a new host as S1 until reviewed.

### SHARE-051 - Math in shared AI answers needs the network
**P1** * Edge * `src/app.js:2048-2064 ensureMathJax()`

- **Pre:** A shared file whose notes include an AI answer containing `\( … \)` / `\[ … \]`.
- **Steps:**
  1. Open the file **online**, read the answer.
  2. Open the same file **offline**, read the answer.
- **Expect:** Online, MathJax loads from `cdnjs.cloudflare.com` on demand and the formula renders as typeset SVG. Offline, the load fails silently (`s.onerror` resets the flag, no toast, no console error cascade) and the answer shows the **raw LaTeX source**, still readable and correctly escaped.
- **Watch:** This is a real limitation of the "opens anywhere" claim. The failure to catch would be a thrown error that breaks the rest of the notes panel, or an infinite retry loop hammering the CDN.

### SHARE-052 - The file opens on a phone
**P1** * Functional * `src/app.js:3309-3314 boot()`

- **Pre:** `paper-a.annotated.html` transferred to an iPhone (AirDrop / Files app) and to an Android device.
- **Steps:**
  1. Open it in iOS Safari via the Files app.
  2. Open it in Chrome on Android.
  3. Rotate, pinch-zoom, open the drawers.
- **Expect:** It boots into the narrow-viewport layout with **both** side drawers closed (first-run mobile default), the page fills the screen, and the read-only banner is pinned to the bottom without covering the page's last line. Tapping the panel toggles opens the library and notes drawers over the page.
- **Watch:** On iOS the banner is `position:fixed;bottom:0` and `#rdScroll` gets `padding-bottom:44px` — verify the last line of the PDF is reachable with the banner present.

### SHARE-053 - Opened inside a sandboxed preview, the fallback card explains itself
**P1** * Edge * `src/app.js:3180 showReaderFallback()`, `src/app.js:3341-3345 boot()`

- **Pre:** Upload `paper-a.annotated.html` to a service that renders HTML in a sandboxed iframe (Google Drive preview, an email preview pane, a chat attachment preview).
- **Steps:**
  1. Open the preview.
- **Expect:** Rather than a blank frame, the reader area shows a card headed **"Open this file directly to read the PDF"** with the body text beginning `"The PDF engine and live AI calls can't run inside this embedded, sandboxed preview. Download the HTML file and open it in your browser"`, plus an `Engine note: …` line. The notes panel to the right still lists every shared note.
- **Watch:** This is the first thing many recipients see. If the card is gone (or `#pageWrap` is destroyed instead of hidden, which historically nulled `#overlay`/`#pins` and crashed `drawHighlights()`), the share looks broken.

### SHARE-054 - A hung PDF worker times out after 7 seconds
**P1** * Edge * `src/app.js:3341-3345 boot()`

- **Pre:** A sandboxed/preview context where the worker hangs rather than errors (see SHARE-053), or simulate by blocking worker creation.
- **Steps:**
  1. Open the file and start a stopwatch.
- **Expect:** After at most ~7 s the race rejects and the fallback card appears with `Engine note: PDF engine did not start — likely a sandboxed preview. Open the downloaded file directly.` The UI never stays frozen on a blank reader.
- **Watch:** Removing the timeout means a hung worker blocks the rest of boot — notes never render either.

---

## 5. The read-only viewer

### SHARE-055 - The made-with banner copy is verbatim
**P0** * Copy * `src/app.js:3300 applyReadOnly()`

- **Pre:** `paper-a.annotated.html` open.
- **Steps:**
  1. Read the strip pinned to the bottom of the window.
- **Expect:** Exactly `Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX`, with middle-dot separators (`·`) and the words `pairedx.com` rendered as the only link.
- **Watch:** `00-test-plan.md` §2 treats this attribution as **AGPL-3.0 compliance**: broken or removed attribution is a **P0**, not a cosmetic issue.

### SHARE-056 - The banner link is correct and safe
**P1** * Functional * `src/app.js:3300 applyReadOnly()`

- **Pre:** As above, online.
- **Steps:**
  1. Inspect the anchor, then click it.
- **Expect:** `href="https://pairedx.com/app"` (the link *text* is `pairedx.com`, the target is `/app`), `target="_blank"` and `rel="noopener"`. Clicking opens the app in a new tab; the shared file stays open and unchanged in its own tab.
- **Watch:** A missing `rel="noopener"` hands `window.opener` to the new tab; an `href` pointing at the apex instead of `/app` drops the recipient on the marketing page instead of the workspace.

### SHARE-057 - The banner is styled as a fixed dark strip
**P2** * Visual * `src/styles.css:677-679`

- **Pre:** As above.
- **Steps:**
  1. Scroll the reader and the notes panel.
  2. Resize the window narrow and wide.
- **Expect:** The banner stays pinned across the full width at the bottom (`position:fixed;left:0;right:0;bottom:0`), dark `#0B0F19` background, 12.5px light-slate centred text, `z-index:80`. The link is violet `#C4B5FD` and bold, and underlines on hover. It never scrolls away and never overlaps the toasts stack.
- **Watch:** A `z-index` change can push it under the notes drawer on mobile, or over an open modal.

### SHARE-058 - The reader reserves room for the banner
**P2** * Visual * `src/styles.css:680`

- **Pre:** As above.
- **Steps:**
  1. Scroll to the very bottom of the last page.
- **Expect:** `#rdScroll` carries `padding-bottom:44px` under `body.readonly`, so the final line of the PDF (and the last note pin) clears the banner. Nothing is permanently hidden behind it.
- **Watch:** Changing the banner's height without updating the 44px reserve re-introduces the clipped-last-line bug.

### SHARE-059 - body.readonly is applied
**P1** * State * `src/app.js:3295 applyReadOnly()`, `src/app.js:43 READONLY`

- **Pre:** As above.
- **Steps:**
  1. In the console: `document.body.classList.contains('readonly')` and `!!window.__PAIR_BUNDLE__`.
- **Expect:** Both `true`. In the *normal* app (`/app.html`), both are `false`/`null`.
- **Watch:** Every `body.readonly` CSS rule and the whole hide-list hang off this one class.

### SHARE-060 - The New button and file input are gone
**P0** * Functional * `src/app.js:3296 applyReadOnly()`, `app.html:21-22`

- **Pre:** As above.
- **Steps:**
  1. Look at the top of the left sidebar.
  2. Try dragging a PDF onto the reader.
- **Expect:** No **"Open PDF or bundle"** button and no reachable file input. Dragging a file onto the reader shows **no** drop-hint outline and opens nothing — the drop wiring is skipped entirely under `READONLY` (`src/app.js:3071`); the browser may simply navigate to the dropped file, which is acceptable.
- **Watch:** If drag-and-drop were still wired, a recipient could load their own PDFs into an ephemeral, storage-free state and lose the work on reload.

### SHARE-061 - The annotation tools are hidden but the cursor tool remains
**P0** * Visual * `src/app.js:3296 applyReadOnly()`, `app.html:60-65`

- **Pre:** As above.
- **Steps:**
  1. Inspect the reader toolbar's tool cluster.
- **Expect:** Highlight (`#toolHi`), Comment (`#toolComment`) and Screenshot (`#toolShot`) are hidden. **Select** (`#toolCursor`) remains and stays active, so text can still be selected and copied. The page/zoom controls, continuous-scroll toggle and search button all remain.
- **Watch:** The hide-list also contains `'toolText'`, an id that no longer exists in `app.html` — harmless, but it means the list is not auto-derived. Any *new* editing button must be added to it by hand or it will leak into read-only.

### SHARE-062 - The document composer is hidden
**P0** * Functional * `src/app.js:3296 applyReadOnly()`, `app.html:106-112`

- **Pre:** As above.
- **Steps:**
  1. Look at the bottom of the notes panel.
- **Expect:** No `"Ask about this document…"` textarea and no send button. The notes list runs to the bottom of the panel.
- **Watch:** `wire()` does `classList.remove('hidden')` on `#composer` and `applyReadOnly()` then sets `style.display='none'` — the *order* in `boot()` (`wire()` at line 3320, `applyReadOnly()` at 3321) is what makes this work. Reordering them re-exposes the composer.

### SHARE-063 - Save, Import and Delete-all are hidden
**P0** * Functional * `src/app.js:3296-3298 applyReadOnly()`, `src/app.js:2628-2632 injectNotesButtons()`

- **Pre:** As above.
- **Steps:**
  1. Inspect the notes-panel header row, left to right.
- **Expect:** `#btnSaveNotes` (save icon), `#btnImportNotes` (import icon) and `#btnClearNotes` (trash icon) are all hidden. What remains visible in that row is the **PDF export** button, the filter funnel, the notes-search icon, and the collapse chevron.
- **Watch:** A recipient must never be able to trigger a Save As dialog or a "Delete all notes" confirm from a file someone sent them.

### SHARE-064 - The Share button is hidden inside a shared file
**P1** * Functional * `src/app.js:3297 applyReadOnly()`

- **Pre:** As above.
- **Steps:**
  1. Look under where the New button used to be.
- **Expect:** No **"Share as HTML"** button. (Re-sharing from inside a bundle would fail anyway — the export fetches absolute paths that do not exist beside a `file://` document.)
- **Watch:** If it leaks back in, clicking it produces `"Could not build the file: Failed to fetch"` — a confusing dead end.

### SHARE-065 - Settings and the storage meter are hidden
**P0** * Security * `src/app.js:3297-3299 applyReadOnly()`, `app.html:36-40`

- **Pre:** As above.
- **Steps:**
  1. Look at the bottom of the sidebar.
  2. Try to reach Settings by any means.
- **Expect:** The whole `.sb-storage` block (the word "Storage", the usage bar and `#storageText`) is hidden, and the gear `#btnSettings` inside it is hidden. There is no route to the Settings modal, so no route to a key field.
- **Watch:** Exposing Settings inside a shared file would invite a recipient to paste their own API key into a page they were sent — a phishing shape. Treat any leak as S1.

### SHARE-066 - The selection popover never appears
**P0** * Functional * `src/app.js:814 onTextSelect()`

- **Pre:** As above.
- **Steps:**
  1. Select a sentence of the PDF with the mouse.
  2. On a touch device, long-press to select.
- **Expect:** Text highlights natively and can be copied, but the black **Highlight / Note / ✦ Ask AI** popover **never** appears — `onTextSelect()` returns immediately under `READONLY`.
- **Watch:** The popover is wired on `mouseup`, `touchend` *and* `selectionchange`; the guard is inside `onTextSelect()` so it covers all three. A refactor that moves the guard into only one listener re-exposes it on touch.

### SHARE-067 - The read-only file writes nothing to storage
**P0** * Security * `src/app.js:152 save()`, `src/app.js:3283 initBundleState()`

- **Pre:** Serve the shared file over `http://localhost:8765/` (so storage is available) **from the same origin you use for the app**, with existing PairedX state present.
- **Steps:**
  1. Note `localStorage.getItem('srw_state_v1')` before opening.
  2. Open the shared file, click notes, switch library views, toggle filters, change zoom.
  3. Re-read `srw_state_v1` and inspect IndexedDB `srw_assets`.
- **Expect:** `srw_state_v1` is byte-identical to before. No new `pdf:` / `shot:` / `img:` records. `save()` returns immediately whenever `READONLY` is set.
- **Watch:** This is the check that proves a shared file cannot overwrite the recipient's own library. Any single missing `READONLY` guard on a write path is S1.

### SHARE-068 - The library holds exactly one document, named from the bundle
**P1** * State * `src/app.js:3285-3286 initBundleState()`, `src/app.js:368 renderTree()`

- **Pre:** Shared file open.
- **Steps:**
  1. Read the sidebar list under **"My Library"**.
- **Expect:** Exactly one row, active/selected, labelled with the original document name from the bundle (e.g. `BERT — Devlin et al. 2019 (NAACL).pdf` — the *unsanitised* name, including the em dash and parentheses, unlike the filename in SHARE-023). Its `kind` is `bundle`; `loadDocBytes()` serves it from `PAIR_BUNDLE.pdfB64`.
- **Watch:** If the recipient's own documents appear here, `initBundleState()` failed to replace `state` and their library is being rendered inside someone else's shared file.

### SHARE-069 - Shared notes render with their anchors intact
**P0** * Functional * `src/app.js:3287-3290 initBundleState()`, `src/app.js:3349 boot()`

- **Pre:** Shared file of `paper-a.pdf` with the rich notes set.
- **Steps:**
  1. Compare the notes list against the source app side by side.
  2. Click a linked-text note.
- **Expect:** Every note is present, in the same order and with the same numbering. Yellow highlights and blue linked-text rectangles are drawn on the correct words of the correct pages, pins sit where they were placed, and selecting a note draws the connector line from the card to the passage.
- **Watch:** Anchors are stored as normalised rects, so a zoom or DPR difference on the recipient's machine must not shift them. Check at 100% and at 200% zoom.

### SHARE-070 - Screenshots and generated visuals render in the shared file
**P0** * Functional * `src/app.js:2540 notesJSONForExport()`, `src/app.js:20 safeImgSrc()`

- **Pre:** Shared file including a screenshot note and a generated-image note.
- **Steps:**
  1. Open both notes, click the screenshot thumbnail to enlarge it.
- **Expect:** Both images render from their embedded `data:` URLs, at full fidelity, with no network access. The `Approximate` badge shows on the generated visual if it had an `approximation_note`.
- **Watch:** Broken image icons here mean §2's re-inlining regressed. `safeImgSrc()` accepts only `data:image/(png|jpe?g|webp|gif)` and `https:` — a future WebP-2/AVIF capture format would be silently dropped by the sanitiser.

### SHARE-071 - Reading controls still work in the shared file
**P1** * Functional * `src/app.js:3320 boot()`

- **Pre:** Shared file open.
- **Steps:**
  1. Page with `‹` / `›`, type a page number into the page input and press Enter.
  2. Zoom in and out; check the percentage readout.
  3. Toggle continuous scroll.
  4. Press **⌘F / Ctrl+F**, search a word, use Enter / Shift+Enter and Escape.
  5. Use the notes filter funnel, the notes search, and the `Sorted by time ▾` / `Sorted by page ▾` toggle.
  6. Collapse and re-open both side panels.
- **Expect:** All of it behaves exactly as in the full app. None of these is an editing affordance, so none is hidden. Note that preference changes here are *not* persisted (`save()` is a no-op) — reloading the file resets zoom, sort and panel state.
- **Watch:** The find bar is created lazily inside `#reader`; verify it appears above the banner and not underneath it.

---

## 6. Read-only edge cases and affordance leaks

> The hide-list in `applyReadOnly()` is manual and covers only sidebar/toolbar/composer chrome. The checks below probe what it does **not** cover. Record the current behaviour; a change in either direction is a regression worth discussing.

### SHARE-072 - Per-message action icons are still present on hover
**P1** * Regression * `src/app.js:1743-1761 msgActions()`, `src/app.js:3294 applyReadOnly()`

- **Pre:** Shared file open, a note selected.
- **Steps:**
  1. Hover the note's header row and each reply row.
  2. Click the copy icon.
  3. Click the trash icon on a reply.
- **Expect (current behaviour):** The `.mact` icons — collapse, show-on-card, **copy**, **edit**, **delete note / delete reply** — are still rendered and clickable, because `render()` has no `READONLY` branch. Copy works (a useful read-only action). **Delete removes the note from the view**; because `save()` is a no-op the deletion vanishes on reload, but the recipient sees content disappear from a file labelled "Read-only".
- **Watch:** File this as a defect if the product intent is a genuinely read-only viewer. At minimum, deleting must never persist and must never corrupt the remaining notes.

### SHARE-073 - Double-clicking a message enters an editor
**P1** * Regression * `src/app.js:3255 wireNoteEditDblclick()`, `src/app.js:3322 boot()`

- **Pre:** Shared file open.
- **Steps:**
  1. Double-click the body of a comment inside a note card.
  2. Type into the textarea, press ⌘/Ctrl+Enter to commit, then reload the file.
- **Expect (current behaviour):** `wireNoteEditDblclick()` is called unconditionally in `boot()`, so an inline `.edit-input` textarea opens and accepts typing. The edit appears to apply, but `save()` is a no-op so **reloading restores the original text**.
- **Watch:** The dangerous version of this bug is the reverse: an edit that *does* persist somewhere, or one that breaks the note when the file is re-imported. Verify a reload always restores the shared content exactly.

### SHARE-074 - The inline reply composer is reachable and its AI call fails
**P1** * Edge * `src/app.js:1922-1924 render()`, `src/app.js:2128-2140`

- **Pre:** Shared file open from `file://`.
- **Steps:**
  1. Click a note to select it.
  2. Look inside the expanded card for a `"Reply or ask a follow-up…"` textarea.
  3. Type a question and send it.
- **Expect (current behaviour):** The thread composer is rendered on the selected card. Sending appends a pending AI message that then fails — the shared file has no `/api/ai` to call — and shows an error state in the thread. It must fail **gracefully**: an error message in the card, no unhandled rejection, no white screen, and nothing persisted.
- **Watch:** The worst outcome is a hang with a permanent spinner, which makes the recipient think the file is broken. If `'composer'` is meant to cover this, note that the hide-list hides only the *document-level* `#composer`, not the per-card `.thread-compose`.

### SHARE-075 - Library row actions still work; trashing the only document empties the reader
**P2** * Edge * `src/app.js:378-394 renderTree()`, `src/app.js:328 openFallbackDoc()`

- **Pre:** Shared file open.
- **Steps:**
  1. Hover the single library row and click the star icon, then the trash icon.
- **Expect (current behaviour):** Star toggles (visually only — not persisted). Trash moves the one document to Trash, the reader falls through `openFallbackDoc()` to the empty-library state, and the library shows `"No documents yet — use “Open PDF or bundle” to add one."` — a message pointing at a button that is hidden in this mode. Reloading the file restores everything.
- **Watch:** The recipient can accidentally blank the shared paper with one mis-click. The empty-state copy referencing a hidden button is the visible symptom.

### SHARE-076 - Library nav views work inside the shared file
**P2** * Functional * `src/app.js:357 docsForView()`, `src/app.js:368 renderTree()`

- **Pre:** Shared file open.
- **Steps:**
  1. Click **Home**, **Recents**, **Starred**, **Trash** in turn.
- **Expect:** Home and Recents show the single bundle document; the section label above the list changes to `My Library` / `Recents` / `Starred` / `Trash`. Starred shows `"No starred documents yet."` and Trash shows `"Trash is empty."` (until SHARE-075 is run).
- **Watch:** Any of these views throwing means `state.docs` was not properly rebuilt by `initBundleState()`.

### SHARE-077 - The PDF export packet is still available in read-only
**P1** * Functional * `src/app.js:2630 injectNotesButtons()`, `src/app.js:3296-3298 applyReadOnly()`

- **Pre:** Shared file open.
- **Steps:**
  1. Hover the notes header icons and find the one titled `"Export annotations to PDF"`.
  2. Click it.
- **Expect:** `#btnExportPdf` is **not** in the hide-list, so the full-screen export view opens over the shared file with the shared notes rendered in the sheet. This is intentional and useful — a recipient can print the annotation packet.
- **Watch:** Confirm the sheet header shows the *bundle's* document name and that the `← Back to document` button returns cleanly to the read-only viewer with the banner still present.

### SHARE-078 - A shared scanned PDF still offers OCR
**P2** * Edge * `src/app.js:725 detectAndOfferOcr()`, `src/app.js:3352 boot()`

- **Pre:** Export a share of `paper-scan.pdf`, then open it.
- **Steps:**
  1. Wait ~2 s after load.
  2. If the banner appears, click **"Run OCR"** while offline, then online.
- **Expect:** The top banner appears reading `"This looks like a scanned PDF — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?"` with **"Run OCR"** and a `✕`. Dismissing it works. Running OCR needs the Tesseract CDN, so it fails cleanly offline; online it runs but the result is not persisted (`save()` is a no-op).
- **Watch:** OCR inside a read-only file is a surprising amount of machinery to expose — at minimum it must not crash and must not appear to save.

### SHARE-079 - The bundled sample never seeds over a shared document
**P0** * State * `src/app.js:3291 initBundleState()`, `src/app.js:3347 boot()`

- **Pre:** Shared file open.
- **Steps:**
  1. Read the library list and the notes list.
  2. Search the notes for any BERT-sample text.
- **Expect:** Only the shared document and its notes. `initBundleState()` sets `state.seeded = true` and `state.seedVersion = SEED_VERSION`, so `seed()` never runs — which matters because the sample scripts are stripped from the file and `window.SAMPLE_NOTES_JSON` is `undefined`.
- **Watch:** Bumping `SEED_VERSION` without keeping this line in sync would make every shared file try to seed, fail, and log a `seed failed` warning.

### SHARE-080 - Opening a shared file does not disturb the recipient's own app
**P0** * State * `src/app.js:73`, `src/app.js:3283-3292 initBundleState()`

- **Pre:** Same origin as SHARE-067. A populated PairedX library in one tab.
- **Steps:**
  1. In a second tab, open the shared file from the same origin.
  2. Interact with it.
  3. Return to the first tab and reload `/app.html`.
- **Expect:** The original library, notes, settings and storage meter are exactly as they were. The shared file's ephemeral state existed only in memory.
- **Watch:** Module-level `let state = migrateState(loadState()) || defaultState()` runs *before* `boot()` replaces it — so the recipient's state is briefly loaded into the shared file's memory. It must never be written back.

### SHARE-081 - A tampered bundle with readOnly:false is not a read-only viewer
**P2** * Edge * `src/app.js:43 READONLY`, `src/app.js:3304 boot()`

- **Pre:** Copy `paper-a.annotated.html`, hand-edit `"readOnly":true` to `"readOnly":false`, save as `tampered.annotated.html`.
- **Steps:**
  1. Open it and inspect the UI.
- **Expect (document the behaviour):** `PAIR_BUNDLE` is still truthy so `initBundleState()` runs and the shared paper loads, but `READONLY` is false: `applyReadOnly()` never runs, the banner is absent, every editing affordance is visible, and `save()` **will** write to `localStorage` for that origin. From `file://` this is inert; served from the app's own origin it would overwrite the recipient's library.
- **Watch:** Anyone who can hand a recipient an HTML file can already run arbitrary code, so this is not a new attack surface — but it is worth knowing that the read-only-ness is a property of the file, not an enforcement. Cross-reference `13-security-and-privacy.md`.

---

## 7. Re-importing a shared bundle

### SHARE-082 - The file picker accepts .html and the New button says so
**P0** * Functional * `app.html:21-22`, `src/app.js:255-265 openFiles()`

- **Pre:** `/app.html` open.
- **Steps:**
  1. Hover **"Open PDF or bundle"** and read the tooltip.
  2. Click it and inspect the OS picker's file filter.
  3. Choose `paper-a.annotated.html`.
- **Expect:** The tooltip reads exactly `"Open a PDF, notes (.json), or a shared paper (.html)"`. The picker allows `.pdf`, `.json` and `.html` (input `accept="application/pdf,.json,application/json,.html,text/html"`, `multiple`). Selecting the shared file routes it to `importSharedHTML()`.
- **Watch:** The `.html` filter is easy to lose in an `accept` edit — the symptom is the shared file appearing greyed out in the OS picker.

### SHARE-083 - Drag-and-drop imports a shared file, with the right hint
**P0** * Functional * `src/app.js:3071-3083 wire()`, `src/styles.css:673-674`

- **Pre:** `/app.html` open, `paper-a.annotated.html` on the desktop.
- **Steps:**
  1. Drag the file over the reader and hold.
  2. Drop it.
- **Expect:** While dragging, the reader shows a dashed violet outline and a dark pill reading exactly `"Drop a PDF (+ its .notes.json), or a shared .html, to open it"`. On drop the hint clears and the document opens.
- **Watch:** Dragging over and then *out* must clear the hint (`dragleave`/`dragend`); a stuck outline after an aborted drag is a common regression.

### SHARE-084 - A successful import reports the name and note count
**P0** * Copy * `src/app.js:307 importSharedHTML()`

- **Pre:** `paper-a.annotated.html` with, say, 8 notes.
- **Steps:**
  1. Import it and read the toast.
- **Expect:** Exactly `"Opened paper-a.pdf — 8 notes loaded. Keep annotating."`, using the **bundle's** document name (with its original punctuation), and singular `"1 note loaded"` when there is exactly one.
- **Watch:** Off-by-one in the count, or the sanitised filename appearing instead of the bundle name.

### SHARE-085 - Importing a share with zero notes says so quietly
**P2** * Copy * `src/app.js:307 importSharedHTML()`

- **Pre:** Export a document that has **no** notes at all, then import that file.
- **Steps:**
  1. Read the toast.
- **Expect:** Exactly `"Opened paper-a.pdf."` — a bare full stop, no `— 0 notes loaded` clause.
- **Watch:** A `0` leaking into the sentence reads like a failure when nothing was wrong.

### SHARE-086 - The imported document is a normal, editable library entry
**P0** * Functional * `src/app.js:296-303 importSharedHTML()`

- **Pre:** Import `paper-a.annotated.html` into a library that does not already contain `paper-a.pdf`.
- **Steps:**
  1. Read the sidebar and the reader.
  2. Highlight a sentence and add a note.
  3. Reload `/app.html`.
- **Expect:** A new row appears under **My Library** named from the bundle, becomes the active document, and the PDF renders. It is `kind: 'user'` with its bytes stored under `pdf:<id>` in IndexedDB. New notes can be created, and everything survives the reload.
- **Watch:** If the bytes are not persisted to IndexedDB, the document renders once and then fails to load after a reload — the classic "worked until I refreshed" report.

### SHARE-087 - Re-importing a paper already in the library merges instead of duplicating
**P0** * State * `src/app.js:296-297 importSharedHTML()`

- **Pre:** `paper-a.pdf` already open in the library (opened as a PDF, so it has a `sha`), with 3 of your own notes. A colleague's share of the same PDF carrying 5 different notes.
- **Steps:**
  1. Import the colleague's `.annotated.html`.
  2. Count the library rows and the notes.
- **Expect:** **One** library row for `paper-a.pdf` (content-addressed by SHA-256, so the filename is irrelevant), now active, with **8** notes — yours plus theirs, unioned by annotation id.
- **Watch:** A second row for the same paper splits a reader's notes across two entries, which is very hard to undo. Verify with a *renamed* copy of the same PDF too.

### SHARE-088 - Re-importing a share of the bundled sample creates a second entry
**P2** * Edge * `src/app.js:293-301 importSharedHTML()`, `src/app.js:67 defaultState()`

- **Pre:** Clean profile with the bundled sample present. Export the sample, then import that file back.
- **Steps:**
  1. Read the library list.
- **Expect (current behaviour):** **Two** rows — the original `sample` document and a new `kind: 'user'` row with the same name. The sample doc carries no `sha` (it is never hashed), so `bundle.sha` is `null`, the import computes a SHA from the bytes, finds no match, and adds a new document. The sample's seeded notes are *not* merged into the new entry.
- **Watch:** This is confusing but self-inflicted only when sharing the demo paper. If it is judged a defect, the fix is to hash the sample on seed. Re-run this after any change to how the sample is registered.

### SHARE-089 - Merged notes are unioned by id, newest wins
**P1** * State * `src/app.js:305 importSharedHTML()`, `src/app.js:2320-2324 applyNotesJSON()`

- **Pre:** `paper-a.pdf` in the library with note `N` reading "original". A share of the same paper whose note `N` (same annotation id) reads "colleague's version" and has a **later** `updated_at`.
- **Steps:**
  1. Import the share and read note `N`.
  2. Now edit note `N` locally so its `updated_at` is newest, and import the same share again.
- **Expect:** After step 1 note `N` reads "colleague's version" (incoming is newer). After step 2 it keeps **your** newer text — incoming only wins when its stamp is greater than *or equal to* the current one. Note count does not double either time.
- **Watch:** Equal timestamps favour the incoming copy (`>=`), so two edits made in the same second can flip to the imported version. Worth knowing when a tester reports "my edit disappeared".

### SHARE-090 - Imported screenshots and visuals survive and re-offload
**P1** * Functional * `src/app.js:305`, `src/app.js:151-160 save()`

- **Pre:** Import a share containing a screenshot note and a generated-image note.
- **Steps:**
  1. Confirm both images render immediately after import.
  2. Reload `/app.html`.
  3. Confirm both still render, and check IndexedDB for new `shot:` / `img:` records.
- **Expect:** Images render before and after the reload. On save they are offloaded to IndexedDB and replaced by `"@idb"` in `localStorage`; `rehydrateAssets()` restores them on the next boot. `localStorage` does not balloon.
- **Watch:** A quota toast (`"Storage limit reached — export your notes to keep them."`) right after importing a big share means the offload path was skipped.

### SHARE-091 - An ordinary HTML file is rejected by name
**P1** * Edge * `src/app.js:281-283 importSharedHTML()`

- **Pre:** `not-pairedx.html` (any saved web page).
- **Steps:**
  1. Import it via the file picker.
- **Expect:** An error toast reading exactly `"“not-pairedx.html” isn’t a PairedX shared paper."` — with curly double quotes around the filename and a curly apostrophe in "isn’t". Nothing is added to the library; the current document is untouched.
- **Watch:** Confirm nothing from the foreign page executes: the file is only string-searched, never inserted into the DOM.

### SHARE-092 - A truncated bundle is rejected
**P1** * Edge * `src/app.js:286-290 importSharedHTML()`

- **Pre:** `truncated.annotated.html`.
- **Steps:**
  1. Import it.
- **Expect:** Error toast `"Could not read the shared paper in “truncated.annotated.html”."` — either the `;</script>` terminator was not found (`unterminated bundle`) or `JSON.parse` threw; both land on this one message. No document is added.
- **Watch:** A partially applied import (document added, notes missing) is much worse than a clean rejection — verify the library is unchanged.

### SHARE-093 - A bundle with no PDF is rejected
**P1** * Edge * `src/app.js:291 importSharedHTML()`

- **Pre:** `nopdf.annotated.html`.
- **Steps:**
  1. Import it.
- **Expect:** Error toast `"“nopdf.annotated.html” has no embedded PDF."`. No document, no notes, no reader change.
- **Watch:** An empty `pdfB64` must be caught here — letting it through produces a zero-byte PDF and a reader-fallback card on a document that can never be opened.

### SHARE-094 - A non-HTML file renamed .html is rejected cleanly
**P2** * Edge * `src/app.js:280-283 importSharedHTML()`, `src/app.js:265 openFiles()`

- **Pre:** `renamed.annotated.html` (actually a PDF).
- **Steps:**
  1. Import it.
- **Expect:** It is routed to `importSharedHTML()` by extension, `f.text()` yields binary garbage, the marker is not found, and the toast reads `"“renamed.annotated.html” isn’t a PairedX shared paper."`. No crash, no hang, even on a 25 MB file.
- **Watch:** `f.text()` on a large binary file is a full read into memory — verify the UI stays responsive and no unhandled rejection reaches the console.

### SHARE-095 - Several shared files in one gesture all import
**P2** * Edge * `src/app.js:261-265 openFiles()`

- **Pre:** Three different `.annotated.html` shares.
- **Steps:**
  1. Select all three in one file-picker gesture (or drag all three at once).
- **Expect:** Each is imported in turn, each producing its own `"Opened … — N notes loaded. Keep annotating."` toast. The **last** one ends up active. If one of them is corrupt, the others still import and the failure produces `"Could not open <name>: <message>"` without aborting the loop.
- **Watch:** The loop `await`s each import serially — three large files take a while; confirm the UI is not frozen and toasts do not overwrite each other illegibly.

### SHARE-096 - A mixed gesture handles HTML, PDF and notes together
**P2** * Edge * `src/app.js:255-274 openFiles()`

- **Pre:** `paper-a.annotated.html`, a different `paper-b.pdf`, and `paper-b.notes.json`.
- **Steps:**
  1. Drop all three onto the reader at once.
- **Expect:** The `.html` is imported first (shared paper), then `paper-b.pdf` opens, then the notes JSON attaches to `paper-b.pdf` by SHA-256 with `"N notes attached to “paper-b.pdf”."`. Because notes were supplied, the "pick a notes file" fallback offer does **not** appear.
- **Watch:** The `isJson` / `isPdf` / `isHtml` classification is extension-and-MIME based; a `.notes.json` also matching `isHtml` (it does not) or a `.html` counted as notes would misroute the whole gesture.

### SHARE-097 - Imported notes are sanitised before they render
**P0** * Security * `src/app.js:305`, `src/app.js:2288-2314 sanitizeImportedNotes()`

- **Pre:** A shared file whose bundle you have hand-edited to contain an annotation `id` of `"a b\"><img src=x onerror=alert(1)>"`, a message `image` of `"javascript:alert(1)"`, another `image` of `"data:image/svg+xml,<svg onload=alert(1)>"`, and a legitimate 3 MB note text.
- **Steps:**
  1. Import it and inspect the resulting notes.
- **Expect:** No alert. The unsafe id is replaced by a generated `ann_…` / `m_…` id; both unsafe images are dropped to no-image; the long text is preserved (capped at 2 MB) and renders escaped. Legitimate fields — tags, chips, traces, captions, edited flags — all survive.
- **Watch:** Full detail lives in `13-security-and-privacy.md`; this check exists so the *bundle* path is not forgotten when only the `.notes.json` path is tested.

---

## 8. The full round trip

### SHARE-098 - Export → open → re-import → keep editing → re-export
**P0** * Functional * `src/app.js:2553`, `src/app.js:279`, `src/app.js:3283`

- **Pre:** Clean profile. `paper-a.pdf` with the rich notes set (8 notes).
- **Steps:**
  1. **Share as HTML**, save the file.
  2. Open the file in a second browser (or a second profile) — read it end to end.
  3. Back in the app on a **clean profile**, import that file via **"Open PDF or bundle"**.
  4. Add two new notes and edit one imported note.
  5. **Share as HTML** again from the newly imported document.
  6. Open the second file.
- **Expect:** The second shared file carries **10** notes including the edit, renders identically, and its bundle `name` and `sha` match the first. Every step's toast copy matches the strings quoted elsewhere in this document. No note is lost or duplicated anywhere in the chain.
- **Watch:** This is the single most valuable check in the document — run it in full on every UI rework. The usual break is a note type added after the round trip was last tested (a new message kind that exports but does not re-import).

### SHARE-099 - Importing the same share twice adds nothing the second time
**P1** * State * `src/app.js:296-305 importSharedHTML()`, `src/app.js:2320-2324 applyNotesJSON()`

- **Pre:** A library where `paper-a.pdf` was created **by importing** `paper-a.annotated.html` (so it has the bundle's `sha`).
- **Steps:**
  1. Import the identical file again.
  2. Compare the library row count and the note count with before.
- **Expect:** Still one library row and the same note count — the SHA matches so the document is reused, and the id-keyed merge replaces each note with an identical copy. The toast still reports the full count (`"Opened paper-a.pdf — 8 notes loaded. Keep annotating."`) because it reports what was *in the file*, not what was new.
- **Watch:** Duplicated notes here means the merge is falling back to concatenation.

### SHARE-100 - Your later edits survive an older shared file
**P1** * State * `src/app.js:2322-2323 applyNotesJSON()`

- **Pre:** Import `paper-a.annotated.html` (8 notes). Then edit three of the notes and delete one.
- **Steps:**
  1. Import the **same, unchanged** file again.
  2. Inspect the three edited notes and the deleted one.
- **Expect:** The three edited notes keep **your** text (their `updated_at` is newer than the bundle's). The deleted note **comes back** — a merge cannot know you deleted it. Nothing else changes.
- **Watch:** The resurrection of deleted notes is expected behaviour, not a bug, but testers report it as one. Record it.

### SHARE-101 - A recipient can re-share and the chain preserves identity
**P1** * Functional * `src/app.js:2568`, `src/app.js:293 importSharedHTML()`

- **Pre:** Person A exports `paper-a.annotated.html`. Person B imports it, adds notes, and exports their own share.
- **Steps:**
  1. Compare `window.__PAIR_BUNDLE__.sha` and `.name` in both files.
  2. Person A imports Person B's file.
- **Expect:** Both bundles carry the same `sha` and the same `name`. When A imports B's file, the SHA matches A's existing document, so B's notes merge into A's copy — one library row, both people's notes.
- **Watch:** If B's re-export loses the `sha` (null), A gets a duplicate library row. This is the collaboration story; it must survive.

### SHARE-102 - Anchors, numbering and ordering survive the round trip
**P1** * Regression * `src/app.js:2328 applyNotesJSON()`, `src/app.js:3287-3290 initBundleState()`

- **Pre:** The 8-note set spanning at least 4 pages, including two notes on the same page.
- **Steps:**
  1. Screenshot the source app's notes panel and the highlighted page.
  2. Complete the round trip (export → import).
  3. Screenshot the same views again and compare.
- **Expect:** Highlight rectangles cover the same words, pins sit at the same coordinates, note numbers (`renumber()`) are identical, and the list order under both `Sorted by time ▾` and `Sorted by page ▾` matches.
- **Watch:** Re-numbering on import can shift every number by one if the imported set is concatenated rather than merged; a page-offset bug shows as every highlight landing one page early.

### SHARE-103 - Navigating away mid-export loses nothing
**P2** * Edge * `src/app.js:2553-2601`

- **Pre:** `paper-big.pdf` active.
- **Steps:**
  1. Click **"Share as HTML"** and, while `"Building shareable file…"` is showing, immediately switch to another document in the sidebar.
  2. Then repeat, but reload the page mid-build.
  3. Then repeat, but resize the window / rotate the device mid-build.
- **Expect:** Switching documents does not corrupt the in-flight export — `docId` was captured at call time, so the file that lands is still the *original* document. Reloading simply abandons the export with no file and no error. Resizing has no effect on the output.
- **Watch:** If the export reads `state.ui.activeDoc` again later (rather than the captured `docId`), the user gets a file whose PDF and notes come from different papers.

---

## 9. Export to PDF: the export view

### SHARE-104 - The export button opens the packet view
**P0** * Functional * `src/app.js:2630 injectNotesButtons()`, `src/app.js:2846 openExport()`

- **Pre:** `paper-a.pdf` active with the rich notes set.
- **Steps:**
  1. Hover the PDF icon in the notes-panel header and read the tooltip.
  2. Click it.
- **Expect:** Tooltip reads exactly `"Export annotations to PDF"`. A full-screen view opens over the whole app (`#exportView`, `position:fixed;inset:0;z-index:100`), with an options column on the left and a live preview sheet on the right.
- **Watch:** `#exportRoot` starts with class `hidden` (`display:none !important`); `openExport()` removes it and clears `innerHTML` first, so re-opening never stacks two views.

### SHARE-105 - The export header shows the right three controls
**P1** * Copy * `src/app.js:2849-2850 openExport()`

- **Pre:** Export view open.
- **Steps:**
  1. Read the 64px header bar.
- **Expect:** Left: `"← Back to document"`. Right: a ghost button **"Preview"** and a primary button **"⭳ Export PDF"** (with the down-arrow-to-tray glyph, not the word "Download"). No other controls.
- **Watch:** The primary button's glyph is a literal character in the source — a font substitution that renders it as a box is a visible copy failure.

### SHARE-106 - Back closes the view and clears it
**P1** * Functional * `src/app.js:2874 openExport()`

- **Pre:** Export view open, with toggles changed from their defaults.
- **Steps:**
  1. Click `"← Back to document"`.
  2. Inspect `#exportRoot` in the elements panel.
- **Expect:** The view closes, the app is exactly as it was (same page, same selected note, same scroll), and `#exportRoot` is both `hidden` **and** empty (`innerHTML` cleared). Pressing **Escape** does **not** close the view — there is no key handler; the Back button (or Export → cancel print) is the only exit.
- **Watch:** Leaving the sheet in the DOM keeps a full copy of every screenshot in memory and makes `mathRoots()` keep considering `#exportRoot`.

### SHARE-107 - Default include state is everything on, layout Detailed
**P0** * State * `src/app.js:2845 exState`, `src/app.js:2855-2867 openExport()`

- **Pre:** Fresh page load, export view opened for the first time.
- **Steps:**
  1. Read the five **Include** rows and the two **Layout** cards.
- **Expect:** Under the uppercase label **"Include"**, five rows in this exact order with these exact labels: **Comments**, **Linked text**, **AI responses**, **Screenshots**, **Visuals** — each with a filled blue check box and a line icon. Under **"Layout"**, **Detailed** is selected (blue border, blue focus ring, filled radio) and **Compact** is not.
- **Watch:** `exState` is a module-level constant, not persisted — so a reload always returns to all-on/Detailed, but *within a session* the choices stick (see SHARE-121).

### SHARE-108 - Unticking Comments removes only comments
**P0** * Functional * `src/app.js:2877 openExport()`, `src/app.js:2896 buildSheet()`

- **Pre:** Export view open, sheet showing at least one comment and one AI answer.
- **Steps:**
  1. Click the **Comments** row.
- **Expect:** The check box empties immediately and the sheet rebuilds without a visible reload flash. Every `.ex-comment` block (avatar, actor name, date · time, text) disappears; AI responses, quotes, screenshots and visuals remain. Any note that had *only* comments now shows a `—` placeholder in its right column — or vanishes entirely if it also had nothing on the left.
- **Watch:** Whole-row clicks must toggle, not just the box. And an item whose left and right are both empty must be removed *and* not consume a number (`n--`, `src/app.js:2900`).

### SHARE-109 - Unticking Linked text removes quotes but keeps the note
**P1** * Functional * `src/app.js:2893 buildSheet()`

- **Pre:** Export view open, sheet showing a blue linked-text quote and a yellow highlight quote.
- **Steps:**
  1. Click **Linked text**.
- **Expect:** Both the blue `Linked text` block and the yellow `Highlight` block disappear from the left column; the location line (`1  Page 3 · 3.1 …`) and the right column stay. Screenshot notes are unaffected.
- **Watch:** Highlights and linked text share one toggle — that is intentional (`hasShot` is the only branch), so a request to separate them is a feature, not a bug.

### SHARE-110 - Unticking AI responses removes them and their chips
**P1** * Functional * `src/app.js:2897 buildSheet()`

- **Pre:** Sheet showing an AI answer with provenance chips.
- **Steps:**
  1. Click **AI responses**.
- **Expect:** Every `AI response · OpenRouter` block (heading, markdown body, and the chip row underneath) disappears. Comments and generated visuals stay.
- **Watch:** With the toggle **on**, only non-pending, non-errored answers appear — an answer still streaming, or one that errored, is silently excluded from the packet by design.

### SHARE-111 - Unticking Screenshots removes the whole screenshot note
**P0** * Functional * `src/app.js:2888-2889 buildSheet()`

- **Pre:** Sheet showing a screenshot note that also has a comment on it.
- **Steps:**
  1. Note the item numbers.
  2. Click **Screenshots**.
- **Expect:** The entire item disappears — image, location line, **and its comment** — because a `source_type === 'screenshot'` annotation returns early before anything else is considered. All later items renumber to close the gap.
- **Watch:** This is asymmetric with the other toggles (which remove only their own block) and surprises testers. Confirm the renumbering is contiguous with no skipped number.

### SHARE-112 - Unticking Visuals removes generated images
**P1** * Functional * `src/app.js:2898 buildSheet()`

- **Pre:** Sheet showing a generated visual with the `Approximate` badge.
- **Steps:**
  1. Click **Visuals**.
- **Expect:** Every `Generated visual` block — the heading, the framed image, and the amber **"Approximate"** badge — disappears. Screenshots (a different type) are unaffected.
- **Watch:** Verify that a generated **ASCII diagram** (which has no `image`) is already excluded regardless of this toggle: `buildSheet()` requires `m.image`.

### SHARE-113 - Turning everything off shows the empty-state copy
**P1** * Copy * `src/app.js:2903 buildSheet()`, `src/styles.css:353 .empty`

- **Pre:** Export view open with notes present.
- **Steps:**
  1. Untick all five Include rows.
- **Expect:** The sheet keeps its header (document name and `Exported on …`) and shows exactly `"Nothing selected to export. Toggle include options or add notes."`, centred, muted, 13px, with generous padding.
- **Watch:** The date header must remain — a completely blank sheet reads as a crash.

### SHARE-114 - A document with no notes shows the same empty state
**P1** * Edge * `src/app.js:2885-2903 buildSheet()`

- **Pre:** A freshly opened PDF with zero notes.
- **Steps:**
  1. Open the export view.
- **Expect:** Header renders (document name + `Exported on <today>`), and below it `"Nothing selected to export. Toggle include options or add notes."` with all five toggles still ticked.
- **Watch:** A free point comment with no text and no replies also produces nothing (`!left.length && !right.length`) — verify it does not leave an empty numbered row.

### SHARE-115 - Compact layout collapses to a single column
**P1** * Visual * `src/app.js:2866`, `src/app.js:2901`, `src/styles.css:419-420`

- **Pre:** Export view open, Detailed selected.
- **Steps:**
  1. Click the **Compact** card.
- **Expect:** The radio moves to Compact (blue ring on the Compact card, plain border on Detailed), and every `.ex-item` switches from a two-column `1fr 1fr` grid with 24px gap to a single column with 8px gap — the excerpt/screenshot stacks **above** the comments and replies instead of beside them. Content itself is unchanged; nothing is dropped.
- **Watch:** The card's `small` text promises `"Condensed view with minimal content."` but Compact only changes the grid — no content is actually removed. Flag the copy mismatch if a tester reports it.

### SHARE-116 - Toggle and radio states are visually unambiguous
**P2** * Visual * `src/styles.css:404-413`

- **Pre:** Export view open.
- **Steps:**
  1. Toggle each Include row on and off.
  2. Switch between Detailed and Compact.
- **Expect:** A ticked row shows a filled blue 22px rounded box with a white `✓`; unticked shows an empty box with a `--line` border (the `✓` glyph is present but invisible against the background). The selected layout card has a blue border plus a 3px `--blue-weak` ring, and its radio dot fills as a blue ring with a white centre. All four states are distinguishable in greyscale.
- **Watch:** Relying on colour alone here fails `15-accessibility.md`; the box fill plus the ring gives a non-colour cue.

### SHARE-117 - The sheet header shows the document and today's date
**P1** * Copy * `src/app.js:2884 buildSheet()`

- **Pre:** Export view open on `paper-a.pdf`.
- **Steps:**
  1. Read the top of the preview sheet.
- **Expect:** An `<h2>` with the document's full name exactly as it appears in the library (HTML-escaped — a name containing `<` or `&` must render literally), and beneath it `Exported on <Month D, YYYY>` in the browser's locale long-date form (e.g. `Exported on July 24, 2026`), separated from the body by a hairline rule.
- **Watch:** The date is computed at `buildSheet()` time, so it re-renders on every toggle — check it does not shift across a midnight boundary mid-session in a way that confuses a tester.

### SHARE-118 - Items are numbered and located
**P1** * Functional * `src/app.js:2885`, `src/app.js:2901 buildSheet()`

- **Pre:** Notes spread across pages 1, 3 and 7, two of them on page 3.
- **Steps:**
  1. Read every item's location line.
- **Expect:** Items are sorted by page, then by anchor position within the page. Each carries a violet circular number badge starting at **1** and incrementing with no gaps, followed by `Page N` and, when a section was detected, ` · <section title>` (e.g. `Page 3 · 3.1 Pre-training BERT`). Notes with no detected section show just `Page N`.
- **Watch:** The counter increments *before* the empty-item check and is decremented on skip — a refactor that forgets the `n--` leaves gaps in the numbering.

### SHARE-119 - Highlights and linked text are labelled and coloured differently
**P1** * Visual * `src/app.js:2893 buildSheet()`, `src/styles.css:425-426`

- **Pre:** One yellow highlight note and one blue linked-text note.
- **Steps:**
  1. Compare the two left columns.
- **Expect:** The yellow-highlight note's sub-label reads **"Highlight"** and its quote block has a pale yellow background (`#FEF9C3`) with an amber left rule. The other reads **"Linked text"** with a pale blue background (`#EFF6FF`) and a blue left rule. Both use the serif quote face. A screenshot note reads **"Screenshot"** above a bordered image.
- **Watch:** The label is chosen purely by `a.hlColor === 'yellow'` — adding a third highlight colour without touching `buildSheet()` silently labels it "Linked text".

### SHARE-120 - Preview is informational; Page size and Style are inert
**P2** * Functional * `src/app.js:2868-2869`, `src/app.js:2875 openExport()`

- **Pre:** Export view open.
- **Steps:**
  1. Click **"Preview"**.
  2. Change **Page size** from `A4` to `Letter`.
  3. Change **Style** from `Clean` to `Minimal`.
  4. Watch the sheet after each.
- **Expect:** "Preview" only shows the toast `"Live preview shown on the right."` — the preview is already live. The two `<select>` elements render with the options `A4` / `Letter` and `Clean` / `Minimal`, are keyboard operable, and currently have **no wired effect**: the sheet does not change, and the printed output uses the fixed `@page{margin:12mm}` either way.
- **Watch:** Record this as the known state. If a tester files "Letter does nothing", it is accurate — the controls are placeholders. Any change that wires them must update this check and SHARE-125.

### SHARE-121 - Toggle choices persist while the app stays loaded
**P2** * State * `src/app.js:2845 exState`

- **Pre:** Export view open.
- **Steps:**
  1. Untick **Screenshots**, choose **Compact**, click `"← Back to document"`.
  2. Re-open the export view.
  3. Reload `/app.html` and open it again.
- **Expect:** After step 2 the view re-opens with Screenshots still unticked and Compact still selected (`exState` lives in module scope). After the reload in step 3 it resets to all-on / Detailed — the choices are deliberately **not** persisted to `localStorage`.
- **Watch:** If someone adds `exState` to the saved state, a stale "everything off" from a previous session would greet the user with the empty-state copy and look like a bug.

---

## 10. The printed packet

### SHARE-122 - Export PDF opens the browser print dialog
**P0** * Functional * `src/app.js:2876 openExport()`

- **Pre:** Export view open with content in the sheet.
- **Steps:**
  1. Click **"⭳ Export PDF"**.
- **Expect:** The browser's native print dialog opens (`window.print()`). Choosing **Save as PDF** (Chromium/Safari) or **Print to File** (Firefox) produces a PDF of the sheet. Cancelling returns to the export view unchanged, with the toggles as they were.
- **Watch:** There is no in-app PDF generator — this *is* the export. On iOS Safari the print sheet is the share sheet; confirm the flow still ends in a saveable PDF.

### SHARE-123 - Printing hides the app and the options column
**P0** * Visual * `src/styles.css:436-438`

- **Pre:** Export view open. Use the print **preview** to inspect without printing.
- **Steps:**
  1. Open the print preview.
- **Expect:** The preview shows **only** the sheet: the three-pane app (`#app`), the export header (`.ex-top`), the options column (`.ex-opts`), the SVG connector layer (`#connectors`) and the toast stack (`#toasts`) are all `display:none`. The sheet loses its card chrome (no shadow, no border, no radius, no max-width) and fills the page.
- **Watch:** Any new fixed-position UI added to the app must be added to this hide-list or it will print on top of the packet. Note `#modalRoot` is **not** hidden — printing with a modal open would print the modal.

### SHARE-124 - Background colours print faithfully
**P1** * Visual * `src/styles.css:434-435`

- **Pre:** A sheet containing a yellow highlight quote, a blue linked-text quote, provenance chips, and violet number badges.
- **Steps:**
  1. Open the print preview in Chrome with "Background graphics" left at its default.
- **Expect:** The yellow and blue quote backgrounds, the chip pills and the violet number badges all render in colour — `#exportView, #exportView *` set `-webkit-print-color-adjust:exact; print-color-adjust:exact`, which overrides Chrome's default of dropping backgrounds.
- **Watch:** Without this the packet prints as unreadable white-on-white quote blocks. Verify in Chrome specifically; Firefox and Safari behave differently by default.

### SHARE-125 - Page margins are fixed at 12 mm regardless of the Page size control
**P2** * Visual * `src/styles.css:432`

- **Pre:** Export view open.
- **Steps:**
  1. Print-preview with **A4** selected in the sidebar, then with **Letter**.
  2. Also switch the *browser's* own paper size between A4 and Letter.
- **Expect:** The CSS `@page{margin:12mm}` applies in both cases; the sidebar control changes nothing (see SHARE-120). Changing the **browser's** paper size does reflow the packet correctly with the same 12 mm margin.
- **Watch:** A margin change interacts with `break-inside:avoid` — re-run SHARE-126 after any margin edit.

### SHARE-126 - Items never split across a page break
**P1** * Visual * `src/styles.css:440`

- **Pre:** A document with 15+ notes so the packet runs to 3+ printed pages, including one item with a tall screenshot.
- **Steps:**
  1. Page through the print preview.
- **Expect:** No `.ex-item` is cut in half by a page break — each starts on a page that can hold it (`break-inside:avoid`). An item taller than a full page is the one legitimate exception; it must still be readable, not clipped.
- **Watch:** A very tall screenshot plus a long AI answer in Detailed (two-column) layout is the case most likely to overflow. Compare against Compact.

### SHARE-127 - Print type scale is smaller than on screen
**P2** * Visual * `src/styles.css:439-450`

- **Pre:** Print preview open.
- **Steps:**
  1. Compare the preview against the on-screen sheet.
- **Expect:** The whole packet shrinks for print: base 9.5px/1.4, document title 15px, date line 9px, location line 10.5px, number badge 16px, sub-labels 8.5px, quotes 9px, chips/tags 8px. Everything remains legible; nothing overlaps or is clipped.
- **Watch:** Adding a new element to the sheet without a print rule leaves it at screen size, which visually shouts on the page.

### SHARE-128 - Images fit the printed page width
**P1** * Visual * `src/styles.css:427`

- **Pre:** A packet containing a very wide screenshot (a full-page capture) and a tall generated image.
- **Steps:**
  1. Print-preview in both Detailed and Compact.
- **Expect:** `.ex-shot img{width:100%}` keeps every image inside its column — nothing bleeds past the page margin, and in Detailed the images fit the half-width column.
- **Watch:** An image wider than the page is the most common cause of a blank second page in the printed PDF.

### SHARE-129 - Math in the packet typesets before printing
**P1** * Edge * `src/app.js:2066-2081 mathRoots()`, `src/app.js:2905 buildSheet()`

- **Pre:** Online. A note with an AI answer containing `\[ … \]`.
- **Steps:**
  1. Open the export view and wait ~1 s for the formula to typeset in the sheet.
  2. Print-preview.
  3. Repeat while **offline**.
- **Expect:** Online, the formula renders as SVG on screen and in the preview. `mathRoots()` includes `#exportRoot` only when it is not `hidden` and its HTML contains `\(` or `\[`. Offline, the raw LaTeX prints — readable, not broken.
- **Watch:** Printing within ~120 ms of opening the view (the `scheduleTypeset` debounce) can capture un-typeset LaTeX; if that happens, note it as a race, not a rendering failure.

### SHARE-130 - Printing from the read-only viewer includes the share banner
**P2** * Regression * `src/styles.css:436`, `src/app.js:3300 applyReadOnly()`

- **Pre:** `paper-a.annotated.html` open, export view opened via the still-visible PDF export button (SHARE-077).
- **Steps:**
  1. Open the print preview.
- **Expect (document the behaviour):** `#roBanner` is **not** in the print hide-list and is `position:fixed;bottom:0;z-index:80`, so the dark `"Read-only annotated paper · … · made with PairedX"` strip renders over the printed packet (typically on the first page). Decide whether that is desirable attribution or an artefact.
- **Watch:** If it is judged an artefact, the fix is one selector in the `@media print` block. Either way the packet's content underneath the strip must still be readable.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `#btnShareHtml` `app.html:23` + title | SHARE-001, SHARE-002, SHARE-003, SHARE-064 |
| `exportSelfContainedHTML()` `src/app.js:2553` | SHARE-004, SHARE-005, SHARE-006, SHARE-007, SHARE-008, SHARE-042, SHARE-098, SHARE-103 |
| `wire()` share wiring `src/app.js:3067` | SHARE-004, SHARE-005 |
| `injectNotesButtons()` `src/app.js:2618` | SHARE-009, SHARE-063, SHARE-077, SHARE-104 |
| `#btnExportTop` / `#btnNotesMenu` removal `src/app.js:2621` | SHARE-009 |
| Inlined `styles.css` `src/app.js:2580` | SHARE-010, SHARE-050 |
| Inlined `pdf.min.js` `src/app.js:2581` | SHARE-011, SHARE-018 |
| Inlined `pdf.worker.b64.js` `src/app.js:2582` | SHARE-012, SHARE-043 |
| Inlined `app.js` + bundle order `src/app.js:2585` | SHARE-013, SHARE-018 |
| Sample-script strip `src/app.js:2583-2584` | SHARE-014, SHARE-049, SHARE-079 |
| Analytics strip `src/app.js:2586-2587` | SHARE-015, SHARE-049 |
| Bundle object `src/app.js:2568` | SHARE-016, SHARE-022, SHARE-101 |
| `<` escaping `src/app.js:2571` | SHARE-017, SHARE-019 |
| `inlineJs()` `src/app.js:2575` | SHARE-018 |
| `notesJSONForExport()` `src/app.js:2540` | SHARE-020, SHARE-021, SHARE-070 |
| `docNotesJSON()` `src/app.js:2271` | SHARE-022, SHARE-025, SHARE-026 |
| Filename derivation `src/app.js:2588-2589` | SHARE-023, SHARE-024, SHARE-027, SHARE-041 |
| `saveAsFile()` `src/app.js:2503` | SHARE-027, SHARE-028, SHARE-030, SHARE-031, SHARE-032, SHARE-033, SHARE-034, SHARE-035 |
| `"Saved … — N MB, opens anywhere."` `src/app.js:2593` | SHARE-029 |
| `"Exported … — N MB, opens anywhere."` `src/app.js:2599` | SHARE-034, SHARE-035, SHARE-041 |
| `"Couldn’t write there: …"` `src/app.js:2520` | SHARE-032 |
| `maybeShowSaveAsTip()` `src/app.js:2460` | SHARE-035, SHARE-036, SHARE-037, SHARE-038, SHARE-039, SHARE-040 |
| `localStorage['srw_saveas_tip']` `src/app.js:2495` | SHARE-039 |
| Download fallback blob `src/app.js:2595-2598` | SHARE-032, SHARE-034, SHARE-041 |
| `"Could not build the file: …"` `src/app.js:2600` | SHARE-042 |
| `sizeMB` `src/app.js:2590` | SHARE-029, SHARE-043, SHARE-044 |
| `boot()` `src/app.js:3303` | SHARE-045, SHARE-046, SHARE-047, SHARE-048, SHARE-052, SHARE-054, SHARE-079 |
| Google Fonts / preconnect `app.html:7-10` | SHARE-048, SHARE-050 |
| `ensureMathJax()` / `mathRoots()` `src/app.js:2051-2081` | SHARE-051, SHARE-129 |
| `showReaderFallback()` `src/app.js:3180` | SHARE-053, SHARE-054 |
| 7 s PDF-engine race `src/app.js:3341-3345` | SHARE-054 |
| `applyReadOnly()` `src/app.js:3294` | SHARE-055 - SHARE-066, SHARE-072, SHARE-077, SHARE-130 |
| `#roBanner` copy + link `src/app.js:3300` | SHARE-055, SHARE-056, SHARE-130 |
| `body.readonly` CSS `src/styles.css:677-680` | SHARE-057, SHARE-058, SHARE-059 |
| `READONLY` guard in `save()` `src/app.js:152` | SHARE-067, SHARE-072, SHARE-073, SHARE-080 |
| `READONLY` guard in `onTextSelect()` `src/app.js:814` | SHARE-066 |
| `READONLY` guard on drop wiring `src/app.js:3071` | SHARE-060 |
| `initBundleState()` `src/app.js:3283` | SHARE-068, SHARE-069, SHARE-079, SHARE-080, SHARE-102 |
| `loadDocBytes()` bundle branch `src/app.js:198` | SHARE-007, SHARE-045, SHARE-068 |
| `safeImgSrc()` `src/app.js:20` | SHARE-070, SHARE-097 |
| `msgActions()` `src/app.js:1743` | SHARE-072 |
| `wireNoteEditDblclick()` `src/app.js:3255` | SHARE-073 |
| `.thread-compose` `src/app.js:1922-1924` | SHARE-074 |
| `renderTree()` / `docsForView()` `src/app.js:357-395` | SHARE-068, SHARE-075, SHARE-076 |
| `openFallbackDoc()` `src/app.js:328` | SHARE-075 |
| `detectAndOfferOcr()` / OCR banner `src/app.js:725-750` | SHARE-078 |
| `#newBtn` + `#fileInput` `app.html:21-22` | SHARE-060, SHARE-082 |
| Drag-and-drop + `#reader.drop-hint` `src/app.js:3071-3083`, `src/styles.css:673-674` | SHARE-083 |
| `openFiles()` `src/app.js:255` | SHARE-082, SHARE-094, SHARE-095, SHARE-096 |
| `importSharedHTML()` `src/app.js:279` | SHARE-084 - SHARE-094, SHARE-097 - SHARE-101 |
| `applyNotesJSON()` merge `src/app.js:2316` | SHARE-089, SHARE-099, SHARE-100, SHARE-102 |
| `sanitizeImportedNotes()` `src/app.js:2288-2314` | SHARE-019, SHARE-097 |
| `exState` `src/app.js:2845` | SHARE-107, SHARE-121 |
| `openExport()` `src/app.js:2846` | SHARE-104, SHARE-105, SHARE-106, SHARE-107, SHARE-120, SHARE-122 |
| `buildSheet()` `src/app.js:2881` | SHARE-108 - SHARE-119, SHARE-129 |
| `#exportRoot` / `#exportView` `app.html:128`, `src/styles.css:395-429` | SHARE-104, SHARE-106, SHARE-115, SHARE-116 |
| `@media print` block `src/styles.css:431-451` | SHARE-123 - SHARE-128, SHARE-130 |
| `"Nothing selected to export. Toggle include options or add notes."` | SHARE-113, SHARE-114 |
| `"Export annotations"` / `"Create a clean PDF of comments, linked excerpts, AI replies, and screenshots."` | SHARE-104, SHARE-105 |
| `"Detailed"` / `"Show excerpts, replies, and visuals."` / `"Compact"` / `"Condensed view with minimal content."` | SHARE-107, SHARE-115 |
| `"Live preview shown on the right."` | SHARE-120 |
| `"Opened … — N notes loaded. Keep annotating."` | SHARE-084, SHARE-085, SHARE-099 |
| `"“…” isn’t a PairedX shared paper."` | SHARE-091, SHARE-094 |
| `"Could not read the shared paper in “…”."` | SHARE-092 |
| `"“…” has no embedded PDF."` | SHARE-093 |
| `"Could not read the PDF for this document."` | SHARE-006, SHARE-007 |
| `"Building shareable file…"` | SHARE-004, SHARE-042, SHARE-103 |
| `"Choose where your files save"` / `"Got it"` | SHARE-035, SHARE-036, SHARE-037, SHARE-038 |

## Deliberately not covered here

- **The Save-notes button, `.notes.json` export/import, folder sync and the storage meter** - covered in `10-storage-and-persistence.md` (`saveNotesNow()`, `downloadNotesJSON()`, `importNotesJSON()`, `chooseNotesFolder()`, `writeNotesToFolder()`). This document exercises `saveAsFile()` and `maybeShowSaveAsTip()` only through the **Share as HTML** path; the notes path has its own checks there.
- **Full import-sanitisation matrix** (malicious ids, `javascript:` and SVG image URLs, oversized fields, DoS caps, key-exfiltration attempts) - covered in `13-security-and-privacy.md`. SHARE-097 only proves the bundle path reaches the same sanitiser.
- **SHA-256 content addressing, duplicate detection and the notes-discovery banners in general** - covered in `04-document-lifecycle.md` and `10-storage-and-persistence.md`. SHARE-087/088/101 cover only the bundle-specific consequences.
- **Note card rendering, threads, filters, sort and the notes search** - covered in `07-notes-panel.md`. SHARE-071 only confirms they still work inside the read-only viewer.
- **AI answers, the intent router, generated visuals and MathJax rendering in general** - covered in `08-ai-and-agent.md`. This document covers only how those artefacts survive export, import and printing.
- **OCR detection and running** - covered in `09-ocr.md`. SHARE-078 covers only its surprising presence inside a read-only shared file.
- **Per-engine File System Access support, `file://` storage quirks and the full browser matrix** - covered in `16-cross-browser-and-platform.md`. Sections 3 and 4 here test the share-specific behaviour on each engine.
- **Very large PDF performance, base64 encode cost and memory ceilings** - covered in `17-performance-and-limits.md`. SHARE-034 and SHARE-043 cover only the user-visible share consequences.
- **Landing- and features-page copy about sharing** (`features.html:231`, `features.html:331`) - covered in `02-features-page.md`.
- **Responsive layout of the export view and the read-only viewer at each breakpoint** - covered in `14-responsive-mobile-touch.md`; SHARE-052 covers only that a shared file opens and reads on a phone.
