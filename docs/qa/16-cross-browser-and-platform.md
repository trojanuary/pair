# 16 - Cross-browser & platform matrix

> Every web-platform capability PairedX depends on, the exact expected behaviour and fallback per engine, and proof that no Chromium-only affordance ever reaches a non-Chromium user.

| | |
|---|---|
| **ID prefix** | XB |
| **Scope** | Browser/OS support matrix; File System Access (Save As + folder sync); IndexedDB / localStorage / storage.estimate; crypto.subtle & secure context; canvas + devicePixelRatio; IntersectionObserver; Clipboard + fallback; Blob downloads; the PDF.js worker chain; CDN-loaded Tesseract & MathJax; dvh / safe-area / visualViewport / touch & pinch; print; the one-time non-Chromium "Save As" tip. |
| **Primary code** | `src/app.js:123-187`, `src/app.js:396-423`, `src/app.js:456-536`, `src/app.js:680-699`, `src/app.js:950-1045`, `src/app.js:1778-1786`, `src/app.js:2051-2082`, `src/app.js:2264-2532`, `src/app.js:3303-3353`, `src/styles.css:538-612`, `app.html` |
| **Checks** | 104 |

## Contents
- [1. Capability matrix and per-engine boot](#1-capability-matrix-and-per-engine-boot) - 9 checks
- [2. File System Access - native Save As](#2-file-system-access---native-save-as) - 10 checks
- [3. File System Access - folder sync](#3-file-system-access---folder-sync) - 11 checks
- [4. The one-time "Save As" tip](#4-the-one-time-save-as-tip) - 10 checks
- [5. Download fallback path](#5-download-fallback-path) - 7 checks
- [6. Storage engines: IndexedDB, localStorage, estimate](#6-storage-engines-indexeddb-localstorage-estimate) - 9 checks
- [7. Secure context and crypto.subtle](#7-secure-context-and-cryptosubtle) - 4 checks
- [8. Canvas, devicePixelRatio and IntersectionObserver](#8-canvas-devicepixelratio-and-intersectionobserver) - 8 checks
- [9. Clipboard and its fallback](#9-clipboard-and-its-fallback) - 5 checks
- [10. Remotely-loaded code and offline behaviour](#10-remotely-loaded-code-and-offline-behaviour) - 9 checks
- [11. Touch, keyboard inset and mobile layout](#11-touch-keyboard-inset-and-mobile-layout) - 15 checks
- [12. Print and PDF export](#12-print-and-pdf-export) - 4 checks
- [13. Chromium-only affordance audit](#13-chromium-only-affordance-audit) - 3 checks

---

## 1. Capability matrix and per-engine boot

This is the reference table the rest of the document verifies. Run every check in section 1 on **all six targets** before starting any other section — a boot failure invalidates everything downstream.

**Targets:** C = Chrome desktop · E = Edge desktop · F = Firefox desktop · S = Safari macOS · I = Safari iOS · A = Chrome Android.

| Capability | Code | C | E | F | S | I | A | Fallback when absent |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `showSaveFilePicker` | `app.js:2503 saveAsFile()` | yes | yes | no | no | no | no | one-time tip, then `<a download>` |
| `showDirectoryPicker` | `app.js:2332 chooseNotesFolder()` | yes | yes | no | no | no | no | error toast, Export/Import only |
| Handle persistence in IDB | `app.js:2336 idbPut('dir:notes')` | yes | yes | n/a | n/a | n/a | n/a | n/a |
| `indexedDB` | `app.js:123 idbOpen()` | yes | yes | yes\* | yes | yes | yes | `_idb = null`, all asset/PDF ops no-op |
| `localStorage` | `app.js:74 loadState()` / `151 save()` | yes | yes | yes\* | yes\* | yes\* | yes | in-memory session only |
| `crypto.subtle.digest` | `app.js:181 sha256Hex()` | https only | https only | https only | https only | https only | https only | returns `null`, no content dedupe |
| `navigator.storage.estimate` | `app.js:396 updateStorage()` | yes | yes | yes | yes (17+) | yes (17+) | yes | "N documents" text |
| `IntersectionObserver` | `app.js:530 buildContinuous()` | yes | yes | yes | yes | yes | yes | none - continuous mode would not render |
| `navigator.clipboard.writeText` | `app.js:1784 copyTextToClipboard()` | yes | yes | yes | yes | yes | yes | `document.execCommand('copy')` |
| Canvas + `devicePixelRatio` | `app.js:172`, `456 renderPage()` | yes | yes | yes | yes | area-capped | yes | none |
| `Blob` + `URL.createObjectURL` + `download` | `app.js:2524 downloadNotesJSON()` | yes | yes | yes | yes | yes | yes | none |
| Inline PDF.js worker (blob:) | `app.js:410 setupWorker()` | yes | yes | yes | yes | yes | yes | CDN `pdf.worker.min.js` |
| Tesseract from jsDelivr | `app.js:680 ensureTesseract()` | net | net | net | net | net | net | error toast, no OCR |
| MathJax from cdnjs | `app.js:2051 ensureMathJax()` | net | net | net | net | net | net | raw LaTeX shown as text |
| `dvh` units | `styles.css:29` | yes | yes | yes | yes | yes | yes | `100vh` declaration before it |
| Touch + custom pinch | `app.js:990 initPinch()` | touchscreen only | touchscreen only | touchscreen only | no | yes | yes | browser zoom (whole UI) |
| `visualViewport` | `app.js:963 initKeyboardInset()` | yes | yes | yes | yes | yes | yes | `--kb` stays `0px` |
| CSS `:has()` | `styles.css:592` | yes | yes | 121+ | yes | yes | yes | tools bar does not dim behind #selPop |
| `env(safe-area-inset-*)` | `styles.css:579-595` | 0 | 0 | 0 | 0 | real | 0 | resolves to 0px |
| `window.print()` | `app.js:2876` | yes | yes | yes | yes | yes | yes | none |

\* = private/incognito or blocked-storage caveats, covered in section 6.

### XB-001 - Record the capability probe for each target
**P0** * Functional * `src/app.js:2264 fsSupported()`, `src/app.js:2503 saveAsFile()`

- **Pre:** https://pairedx.com/app open (never `file://` for this check). Devtools console available (on iOS use Safari → Develop → device; on Android use `chrome://inspect`).
- **Steps:**
  1. In the console, read each value one at a time and write it into the matrix above: `'showSaveFilePicker' in window`, `'showDirectoryPicker' in window`, `!!window.indexedDB`, `!!(window.crypto && crypto.subtle)`, `!!(navigator.storage && navigator.storage.estimate)`, `!!window.IntersectionObserver`, `!!(navigator.clipboard && navigator.clipboard.writeText)`, `window.devicePixelRatio`, `!!window.visualViewport`, `CSS.supports('height','100dvh')`, `CSS.supports('selector(:has(*))')`, `navigator.userAgent`.
  2. Repeat on all six targets.
- **Expect:** The observed values match the matrix row-for-row. Chrome/Edge desktop are the only two where both File System Access probes are `true`.
- **Watch:** Chrome **Android** reports `chrome` in the UA but `false` for both pickers — a tester who assumes "Chromium = Save As" will file false bugs for the whole of section 2.

### XB-002 - Chrome desktop cold boot
**P0** * Functional * `src/app.js:3303 boot()`

- **Pre:** Fresh profile (no `srw_state_v1` in localStorage, no `srw_assets` IndexedDB database).
- **Steps:**
  1. Open the app URL.
  2. Wait until the reader stops rendering.
- **Expect:** The BERT sample opens ("BERT — Devlin et al. 2019 (NAACL).pdf" in the library), page 1 renders, `#pageTotal` shows the real page count, the notes panel shows the seeded sample notes, and `#storageText` has replaced its initial "Calculating…" with a real usage string.
- **Watch:** A 7-second stall then the "Open this file directly to read the PDF" fallback card — that is `boot()`'s `Promise.race` timeout at `src/app.js:3343` firing because the worker never started.

### XB-003 - Edge desktop cold boot
**P0** * Functional * `src/app.js:3303 boot()`

- **Pre:** Fresh Edge profile.
- **Steps:**
  1. Repeat XB-002 in Edge.
  2. Open Settings → Storage and confirm the pane renders.
- **Expect:** Byte-identical behaviour to Chrome, including a working "Choose folder…" button (Edge is Chromium, so `fsSupported()` is true).
- **Watch:** Edge's sidebar/Copilot pane narrows the viewport below 1100px, which silently collapses the left column via `styles.css:538`; that is expected layout, not a bug.

### XB-004 - Firefox desktop cold boot
**P0** * Functional * `src/app.js:3303 boot()`

- **Pre:** Fresh Firefox profile.
- **Steps:**
  1. Repeat XB-002 in Firefox.
  2. Select a sentence in the PDF and confirm the "Highlight" / "Note" / "✦ Ask AI" popover appears.
- **Expect:** Full render parity with Chrome. No feature-detection error toast at boot; the Save As tip must **not** appear at boot (it is only reachable from a save action - XB-031).
- **Watch:** Firefox rendering the PDF but with an unselectable text layer — that means `renderTextLayer` failed and every highlight/AI check downstream will fail.

### XB-005 - Safari macOS cold boot
**P0** * Functional * `src/app.js:3303 boot()`

- **Pre:** Fresh Safari profile; Preferences → Privacy → "Prevent cross-site tracking" left at its default (on).
- **Steps:**
  1. Repeat XB-002 in Safari.
  2. Check `#storageText`.
- **Expect:** The sample renders. `#storageText` shows either a "N MB of N GB"-style string (Safari 17+, where `navigator.storage.estimate` exists) or a plain document count such as "1 documents" — never a permanent "Calculating…".
- **Watch:** A stuck "Calculating…" means `updateStorage()` threw before either branch ran (`src/app.js:396-408`) and the whole storage widget is dead.

### XB-006 - Safari iOS cold boot
**P0** * Functional * `src/app.js:3309 boot()`, `src/app.js:437 fitZoomToWidth()` * iOS only

- **Pre:** iPhone (notched model preferred), Safari, no prior visit to the app.
- **Steps:**
  1. Open the app URL in portrait.
  2. Do not touch anything until rendering settles.
- **Expect:** Both drawers start closed (first narrow run sets `collapseLeft`/`collapseRight` at `src/app.js:3309-3314`), a **whole page** fits the screen width (not a half-cut page), the four tools float at the bottom centre, and the zoom readout is hidden (`styles.css:611` at ≤560px).
- **Watch:** A page that opens at 115% and is cut off at the right edge — `fitZoomToWidth()` ran before layout settled and `isNarrowViewport()` measured 0.

### XB-007 - Chrome Android cold boot
**P0** * Functional * `src/app.js:3303 boot()` * Android only

- **Pre:** Android phone, Chrome, no prior visit.
- **Steps:**
  1. Repeat XB-006 on Android.
- **Expect:** Same as iOS: closed drawers, fitted page, bottom tools bar. `env(safe-area-inset-bottom)` resolves to 0 so the tools bar sits 14px off the bottom.
- **Watch:** The tools bar hidden under Chrome's own bottom UI, or the page rendering at a fraction of the screen width.

### XB-008 - The console is clean on boot in every engine
**P1** * Regression * `src/app.js:3303 boot()`

- **Pre:** Devtools console open, filter set to Errors + Warnings, before loading the page.
- **Steps:**
  1. Hard-reload the app on each of the six targets.
  2. Read every logged error/warning.
- **Expect:** No uncaught exceptions. The only acceptable entries are a blocked `/_vercel/insights/script.js` request (ad blocker) and PDF.js's own informational messages. Specifically there must be no "workerSrc" warning, no IndexedDB error, and no CSP violation.
- **Watch:** A `SecurityError` from `localStorage` on a browser with cookies blocked - it is caught in `save()` (`src/app.js:163`) but a *read* at `loadState()` is what silently resets state.

### XB-009 - Private / Incognito boot on every engine
**P1** * Edge * `src/app.js:123 idbOpen()`, `src/app.js:74 loadState()`

- **Pre:** A private window in each of: Chrome Incognito, Edge InPrivate, Firefox Private, Safari Private, Safari iOS Private, Chrome Android Incognito.
- **Steps:**
  1. Open the app.
  2. Highlight a sentence, then reload the private window.
- **Expect:** The app boots and the sample renders in every private mode. Notes created in the session survive an in-session reload wherever localStorage works; they are gone when the private window is closed. Nothing crashes, and no error toast fires just because storage is ephemeral.
- **Watch:** Firefox Private historically fails `indexedDB.open` — `idbOpen()` resolves `null` and the app must keep working with the sample (which is inline), only losing user-PDF persistence (see XB-048).

---

## 2. File System Access - native Save As

### XB-010 - Save notes opens the OS Save dialog
**P0** * Functional * `src/app.js:2607 saveNotesNow()`, `src/app.js:2503 saveAsFile()` * Chromium only

- **Pre:** Chrome desktop, sample document open, Settings → Storage set to browser mode (no folder), at least one note exists.
- **Steps:**
  1. Click the save icon in the notes header (title "Save notes (JSON; auto-saves to your folder when one is set)").
  2. Observe the dialog.
- **Expect:** A native OS save sheet opens with the suggested name "BERT — Devlin et al. 2019 (NAACL).notes.json" (spaces preserved, non-word characters replaced by `_`), a file-type entry labelled "Notes JSON", and a starting location of Documents. After confirming, a toast reads "Saved <name>." and the save button flashes green for ~1.4s.
- **Watch:** A silent browser download instead of a dialog — that means `saveAsFile()` took its `fallback` branch and the user lost the ability to choose the location.

### XB-011 - Cancelling the Save dialog writes nothing
**P0** * Edge * `src/app.js:2511 saveAsFile()` * Chromium only

- **Pre:** As XB-010.
- **Steps:**
  1. Click Save notes.
  2. Press Escape / click Cancel in the OS dialog.
  3. Check the Downloads folder and the downloads shelf.
- **Expect:** Nothing is written anywhere, **no** `.notes.json` appears in Downloads, no toast fires, and the save button does not flash. `saveAsFile()` returns `{status:'cancelled'}` and `saveNotesNow()` returns early at `src/app.js:2615`.
- **Watch:** A "consolation download" landing in Downloads — the classic regression when `AbortError` stops being distinguished from a real failure.

### XB-012 - Overwriting an existing file leaves no "(1)" copy
**P0** * Functional * `src/app.js:2514 saveAsFile()` * Chromium only

- **Pre:** Chrome; a `.notes.json` for this document already saved to a known folder.
- **Steps:**
  1. Add another note.
  2. Save notes again and pick the **same** existing file in the dialog; confirm the OS "Replace?" prompt.
  3. Inspect the folder.
- **Expect:** Exactly one file, updated in place, containing the new note. The toast reads "Saved <name>." with the name the OS reports (which may differ from the suggestion if the user renamed it).
- **Watch:** A second file named `… (1).notes.json` — that means the download path ran, not the picker.

### XB-013 - A failed write falls back to a download with an explicit toast
**P1** * Edge * `src/app.js:2519 saveAsFile()` * Chromium only

- **Pre:** Chrome; a read-only folder (macOS: a folder with permissions set to read-only; Windows: a folder denied write for the current user).
- **Steps:**
  1. Click Save notes and choose that read-only folder.
- **Expect:** An error toast (red) reading exactly "Couldn't write there: <message> — downloading a copy instead." — note the curly apostrophe — followed by the file appearing in the normal Downloads folder.
- **Watch:** A silent failure where neither a file nor a toast appears; the user believes their notes were saved.

### XB-014 - Edge behaves identically to Chrome
**P0** * Functional * `src/app.js:2503 saveAsFile()` * Chromium only

- **Pre:** Edge desktop, one note present.
- **Steps:**
  1. Repeat XB-010, XB-011 and XB-012 in Edge.
- **Expect:** Identical dialog behaviour, identical toasts, identical overwrite semantics.
- **Watch:** Edge's "Ask me what to do with each download" setting interfering — it must be irrelevant here, because the picker path never creates a download.

### XB-015 - Share as HTML uses the same dialog and reports the size
**P0** * Functional * `src/app.js:2592 exportSelfContainedHTML()` * Chromium only

- **Pre:** Chrome; sample document open with at least one note carrying a screenshot.
- **Steps:**
  1. Click "Share as HTML" in the left sidebar.
  2. Watch the toasts, then confirm the save dialog.
- **Expect:** A "Building shareable file…" toast, then a native dialog suggesting "BERT — Devlin et al. 2019 (NAACL).annotated.html" with type "Annotated paper (HTML)". After saving, a toast reads "Saved <name> — N.N MB, opens anywhere."
- **Watch:** Cancelling must produce **no** file and **no** toast; a "Exported … MB, opens anywhere." toast after a cancel means the fallback download fired.

### XB-016 - Firefox and Safari never see a Save dialog
**P0** * Functional * `src/app.js:2504 saveAsFile()` * Firefox/Safari only

- **Pre:** Firefox desktop and Safari macOS, one note present, the `srw_saveas_tip` localStorage key **already set to `1`** (so the tip does not confuse the observation - clear it again afterwards).
- **Steps:**
  1. Click Save notes.
  2. Click "Share as HTML".
- **Expect:** No OS dialog at any point. The notes file downloads immediately with a toast "Downloaded BERT — Devlin et al. 2019 (NAACL).notes.json"; the HTML downloads with "Exported BERT — Devlin et al. 2019 (NAACL).annotated.html — N.N MB, opens anywhere."
- **Watch:** A dialog appearing in Safari because a future Safari version ships `showSaveFilePicker` — then the *tip* must stop appearing too (XB-036 covers the gate).

### XB-017 - Chrome Android takes the non-Chromium path
**P0** * Edge * `src/app.js:2504 saveAsFile()` * Android only

- **Pre:** Chrome on Android; one note present.
- **Steps:**
  1. Tap Save notes in the notes drawer header.
- **Expect:** No picker (Android has no File System Access pickers). The one-time tip modal appears with the **generic** wording (see XB-033) and the file downloads to the device's Downloads with the usual toast.
- **Watch:** The app assuming "Chromium ⇒ picker" and hanging with no dialog and no download.

### XB-018 - Incognito saves work but remember nothing
**P1** * State * `src/app.js:2497-2502 saveAsFile()` * Chromium only

- **Pre:** Chrome Incognito, one note present.
- **Steps:**
  1. Save notes to a folder.
  2. Save notes a second time.
- **Expect:** The dialog opens **both** times (the code deliberately keeps no handle), and the second dialog may re-open in the last-used directory but never writes without confirmation. No "allow on every visit" permission prompt ever appears.
- **Watch:** A silent second save with no dialog — that would mean a handle is being cached, which the comment at `src/app.js:2499` explicitly forbids.

### XB-019 - Rapid double-click on Save
**P1** * Edge * `src/app.js:2607 saveNotesNow()`

- **Pre:** Any engine, one note present.
- **Steps:**
  1. Double-click the Save notes button as fast as possible.
  2. Repeat on Firefox/Safari.
- **Expect:** Chromium: at most one save dialog is usable; a second dialog request while one is open is rejected by the browser and must surface as a cancelled/fallback path, not an uncaught exception. Firefox/Safari: at most two identical downloads, no error.
- **Watch:** An uncaught `NotAllowedError` in the console ("File picker already active") that leaves the UI with no toast and no file.

---

## 3. File System Access - folder sync

### XB-020 - Choosing a notes folder grants and immediately writes
**P0** * Functional * `src/app.js:2332 chooseNotesFolder()` * Chromium only

- **Pre:** Chrome desktop, sample document with ≥1 note, Settings → Storage currently in browser mode.
- **Steps:**
  1. Settings → Storage → click "Choose folder…".
  2. Pick an empty folder and grant "Edit files".
- **Expect:** The settings modal closes, a toast reads "Notes will auto-save to "<folder>"." and the folder immediately contains `<doc>.notes.json`. Re-opening Settings → Storage now shows "Notes sync to 📁 <folder>" with "Change folder" and "Turn off" links.
- **Watch:** The toast firing but no file appearing — `writeNotesToFolder()` swallowed a failure because it was called non-interactively at `src/app.js:2338`.

### XB-021 - Non-Chromium shows the exact unsupported message
**P0** * Copy * `src/app.js:2333 chooseNotesFolder()` * Firefox/Safari only

- **Pre:** Firefox desktop, Safari macOS, Safari iOS and Chrome Android, in turn.
- **Steps:**
  1. Open Settings → Storage.
  2. Click "Choose folder…".
- **Expect:** A red toast reading exactly "Folder sync needs Chrome or Edge. Use Export / Import notes instead." No picker, no state change: Settings still shows the "Choose folder…" button, not a connected folder.
- **Watch:** The button silently doing nothing (no toast) — the user cannot tell whether the click registered.

### XB-022 - Cancelling the directory picker changes nothing
**P1** * Edge * `src/app.js:2341 chooseNotesFolder()` * Chromium only

- **Pre:** Chrome, browser storage mode.
- **Steps:**
  1. Settings → Storage → "Choose folder…".
  2. Press Escape / Cancel in the OS folder picker.
- **Expect:** No toast at all (`AbortError` is filtered), the settings modal stays open, and `state.settings.storage.mode` remains `browser` (re-open Settings → Storage: still the "Choose folder…" button).
- **Watch:** A red "Could not open that folder: The user aborted a request." toast — that means the `AbortError` filter regressed.

### XB-023 - Permission must be re-granted after a browser restart
**P0** * State * `src/app.js:2343 notesDirHandle()` * Chromium only

- **Pre:** Chrome with a notes folder connected (XB-020) and a note saved to it. Fully quit and reopen Chrome.
- **Steps:**
  1. Open the app; add a new note; wait 3 seconds (past the 1.5s `scheduleFolderSync` debounce).
  2. Inspect the folder's `.notes.json`.
  3. Now click the Save notes button.
- **Expect:** After step 2 the file is **unchanged** (background sync is non-interactive and cannot prompt). After step 3 Chrome shows its "Let site edit files?" prompt; granting it writes the file and toasts "Saved to "<folder>"." with the green flash.
- **Watch:** No prompt at all on the interactive save, followed by a fall-through to the Save As dialog — that means `notesDirHandle(true)` lost its `requestPermission` call.

### XB-024 - Denying re-permission falls through to the Save As dialog
**P1** * Edge * `src/app.js:2608 saveNotesNow()` * Chromium only

- **Pre:** As XB-023, at the permission prompt.
- **Steps:**
  1. Click Save notes and **deny** the "Let site edit files?" prompt.
- **Expect:** `writeNotesToFolder()` returns false and the native Save As dialog opens instead (suggested name `<doc>.notes.json`). Saving there toasts "Saved <name>." — the user is never left with nothing.
- **Watch:** An error toast "Save failed: …" plus no dialog, stranding the user with unsaved notes.

### XB-025 - Background autosave stays silent when it cannot write
**P1** * State * `src/app.js:2451 scheduleFolderSync()`, `src/app.js:2352 writeNotesToFolder()` * Chromium only

- **Pre:** Chrome with folder mode set but permission not currently granted (post-restart, before any interactive save).
- **Steps:**
  1. Type several notes over a minute.
  2. Watch the toast area continuously.
- **Expect:** Zero toasts and zero permission prompts from the background sync. The failure is intentionally silent because `interactive` is false at `src/app.js:2454`.
- **Watch:** A repeated "Save failed: …" toast every 1.5s while typing — an interactive flag leaking into the debounce.

### XB-026 - The folder handle survives a same-session reload
**P0** * State * `src/app.js:2336 idbPut('dir:notes')` * Chromium only

- **Pre:** Chrome with a folder connected and permission granted this session.
- **Steps:**
  1. Reload the tab (F5).
  2. Open Settings → Storage.
  3. Add a note and wait 3s.
- **Expect:** Settings still shows "Notes sync to 📁 <folder>", and the new note appears in the folder file without any prompt (Chrome keeps the grant for the origin within the session).
- **Watch:** Settings falling back to the "Choose folder…" button after a reload — the handle failed to round-trip through IndexedDB (structured clone of `FileSystemDirectoryHandle`).

### XB-027 - The folder disappears mid-session
**P1** * Edge * `src/app.js:2352 writeNotesToFolder()` * Chromium only

- **Pre:** Chrome with a notes folder on an external drive or a network share.
- **Steps:**
  1. Eject the drive / disconnect the share.
  2. Add a note, wait 3s (background sync), then click Save notes (interactive).
- **Expect:** The background attempt is silent. The interactive attempt shows a red toast "Save failed: <message>" **or** falls through to the Save As dialog — either is acceptable, but the app must not freeze and the note must remain in the panel.
- **Watch:** An unhandled promise rejection in the console and a UI that stops responding to further saves.

### XB-028 - Opening a PDF re-grants the folder inside the same click gesture
**P0** * Functional * `src/app.js:224 openPdfFile()`, `src/app.js:2396 maybeOfferFolderNotes()` * Chromium only

- **Pre:** Chrome, folder mode set, browser freshly restarted (grant expired). The folder already contains a `.notes.json` for a PDF you have on disk, and that PDF is **not** currently in the library.
- **Steps:**
  1. Click "Open PDF or bundle" and pick that PDF.
  2. Answer the permission prompt with Allow.
- **Expect:** The PDF opens and a confirm dialog appears: "Found notes for this PDF in "<folder>": <file>. Open them?" with buttons "Open notes" and "Not now". Choosing "Open notes" merges them and toasts "N notes loaded from "<folder>"."
- **Watch:** No permission prompt and no offer — the grant must be requested *during* the file-open gesture (`src/app.js:224`); if that moves out of the gesture, Chrome blocks the prompt and the offer never appears.

### XB-029 - Turning folder sync off
**P1** * State * `src/app.js:2822 openSettings()` * Chromium only

- **Pre:** Chrome with a folder connected.
- **Steps:**
  1. Settings → Storage → "Turn off".
  2. Add a note and wait 3s; check the folder file's timestamp.
- **Expect:** The modal closes with a toast "Folder sync off — notes stay in this browser.", Settings now shows "Choose folder…" again, and the folder file is no longer being updated.
- **Watch:** The file still being rewritten because `scheduleFolderSync()` did not re-read `storageCfg().mode`.

### XB-030 - Storage pane copy is identical on every engine
**P1** * Copy * `src/app.js:2789-2802 openSettings()`

- **Pre:** All six targets.
- **Steps:**
  1. Open Settings → Storage on each.
  2. Read the hint paragraph and the buttons.
- **Expect:** Every engine shows the same text: "Notes are always saved in this browser. Optionally sync a portable **.notes.json** to a folder (Chrome/Edge) — great for backups, other devices, and Google Drive. Export / Import works in any browser.", plus the buttons "Choose folder…", "Export notes (JSON)" and "Import notes (JSON)".
- **Watch:** The "(Chrome/Edge)" qualifier being dropped in an edit — it is the only in-app disclosure that folder sync is Chromium-only.

---

## 4. The one-time "Save As" tip

### XB-031 - Firefox desktop gets the Firefox instructions
**P0** * Copy * `src/app.js:2460 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Firefox desktop; delete the `srw_saveas_tip` key from localStorage (Storage Inspector) so the tip is armed; ≥1 note present.
- **Steps:**
  1. Click Save notes.
  2. Read the modal top to bottom.
- **Expect:** A modal titled "Choose where your files save", with the line "In **Firefox**, turn on one setting to pick where each download goes — and overwrite instead of piling up "(1)" copies.", numbered steps 1 "Open **Settings → General**" and 2 "Scroll to **Files and Applications**", then step 3 "Turn on:" above a boxed setting "Always ask you where to save files" rendered with a filled indigo **toggle**, and a single "Got it" button.
- **Watch:** The setting box showing a ✓ instead of a toggle (that is the Safari variant) or the browser name reading "your browser" (the UA sniff at `src/app.js:2464` failed).

### XB-032 - Safari macOS gets the Safari instructions
**P0** * Copy * `src/app.js:2470 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Safari macOS with `srw_saveas_tip` cleared; ≥1 note.
- **Steps:**
  1. Click Save notes.
- **Expect:** Same modal, but "In **Safari**, …", steps "Open **Settings → General**" and "Find **File download location**", the setting "Ask for each download", and the control mock rendered as an indigo **✓** (not a toggle).
- **Watch:** Safari being misdetected as "your browser" — the sniff at `src/app.js:2465` excludes `chrome|chromium|crios|edg|edgios|android|opr/`, so a Safari build advertising any of those words falls to the generic copy.

### XB-033 - Chrome Android gets the generic instructions
**P1** * Copy * `src/app.js:2471 maybeShowSaveAsTip()` * Android only

- **Pre:** Chrome Android with `srw_saveas_tip` cleared; ≥1 note.
- **Steps:**
  1. Tap Save notes.
- **Expect:** The modal reads "In **your browser**, turn on one setting …" with a single step "Open your browser's **download settings**" and the setting "Always ask where to save files" with a toggle mock.
- **Watch:** It claiming "In **Firefox**" or "In **Safari**" — Android Chrome's UA contains neither `firefox` nor a bare `safari` token, so a regression in the exclusion list is the only way that happens.

### XB-034 - Safari iOS shows desktop-Safari instructions (known mismatch)
**P2** * Copy * `src/app.js:2470 maybeShowSaveAsTip()` * iOS only

- **Pre:** Safari on iPhone/iPad with `srw_saveas_tip` cleared; ≥1 note.
- **Steps:**
  1. Tap Save notes.
  2. Read the steps, then try to follow them in iOS Settings.
- **Expect:** Today the modal says "In **Safari**", "Open **Settings → General**", "Find **File download location**", "Ask for each download" — instructions that describe **macOS** Safari. iOS Safari has no such setting; downloads go to Files.
- **Watch:** Record this as a known copy defect. It must not regress *worse* (e.g. into a broken layout on a 390px screen — the modal is `max-width:470px` and must fit with the mask's 20px padding).

### XB-035 - Firefox iOS shows desktop-Firefox instructions (known mismatch)
**P2** * Copy * `src/app.js:2464 maybeShowSaveAsTip()` * iOS only

- **Pre:** Firefox for iOS (UA contains `FxiOS`), `srw_saveas_tip` cleared, ≥1 note.
- **Steps:**
  1. Tap Save notes.
- **Expect:** The modal says "In **Firefox**" with the desktop "Files and Applications" steps, because the regex at `src/app.js:2464` matches `fxios`. Verify the modal is still fully readable and dismissible on a phone.
- **Watch:** Same class of defect as XB-034 — flag if the wording changes without adding an iOS branch.

### XB-036 - The tip never appears in Chrome or Edge desktop
**P0** * Functional * `src/app.js:2461 maybeShowSaveAsTip()` * Chromium only

- **Pre:** Chrome and Edge desktop; explicitly delete `srw_saveas_tip` from localStorage first.
- **Steps:**
  1. Click Save notes and complete the native dialog.
  2. Click Save notes again and cancel.
  3. Click "Share as HTML" and cancel.
  4. Re-check localStorage for `srw_saveas_tip`.
- **Expect:** The modal never appears in any of those flows, and the `srw_saveas_tip` key is **never created** (the function returns at its first line because `'showSaveFilePicker' in window` is true).
- **Watch:** The key being written anyway — harmless today, but it means the gate moved after the write and a future non-Chromium visit on the same device would be silently suppressed.

### XB-037 - The tip shows at most once per device
**P0** * State * `src/app.js:2462 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Firefox (or Safari) with `srw_saveas_tip` cleared.
- **Steps:**
  1. Save notes → dismiss the tip with "Got it".
  2. Save notes again.
  3. Click "Share as HTML".
  4. Reload the page and save once more.
  5. Inspect localStorage.
- **Expect:** The modal appears exactly once, in step 1. Steps 2-4 download the file with no modal. localStorage contains `srw_saveas_tip` = `"1"`, written at `src/app.js:2495` even if the user dismissed with Escape.
- **Watch:** The modal re-appearing after a reload — the key is written *after* the modal is built, so an exception in the modal HTML would skip it.

### XB-038 - Blocked storage suppresses the tip but not the download
**P1** * Edge * `src/app.js:2462 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Safari macOS with Settings → Privacy → "Block all cookies" enabled (localStorage reads throw).
- **Steps:**
  1. Open the app, create a note, click Save notes.
- **Expect:** No tip modal at all (the `try/catch` returns early at `src/app.js:2462`), but the `.notes.json` still downloads with the toast "Downloaded <name>". The app itself keeps working for the session.
- **Watch:** An uncaught `SecurityError` that aborts `saveAsFile()` before the download — the user gets neither a tip nor a file.

### XB-039 - Every dismissal path closes the tip
**P1** * Functional * `src/app.js:2490-2494 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Firefox; clear `srw_saveas_tip` before **each** repetition.
- **Steps:**
  1. Trigger the tip and press Escape.
  2. Re-arm, trigger, press Enter.
  3. Re-arm, trigger, click the dimmed backdrop outside the card.
  4. Re-arm, trigger, click "Got it".
- **Expect:** All four close the modal, remove the keydown listener, and leave the downloaded file intact. No modal remnant stays in `#modalRoot` (inspect the DOM after each).
- **Watch:** A stacked, un-dismissable second mask after re-arming — a leaked `keydown` capture listener from a previous instance.

### XB-040 - The tip never appears inside a shared read-only file
**P1** * Functional * `src/app.js:2461 maybeShowSaveAsTip()`, `src/app.js:3294 applyReadOnly()`

- **Pre:** An exported `<paper>.annotated.html` opened by double-clicking it (so it runs from `file://`) in Firefox and in Safari.
- **Steps:**
  1. Look for any Save/Share button.
  2. Confirm no modal appears at boot or on any interaction.
- **Expect:** `READONLY` is true, so the save/import/share/settings buttons are hidden entirely and the tip's first guard (`READONLY ||`) prevents it. The bottom banner reads "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX".
- **Watch:** The tip firing in a shared file — it would also try to write `srw_saveas_tip` into the recipient's `file://` origin.

---

## 5. Download fallback path

### XB-041 - Firefox download naming and toast
**P0** * Functional * `src/app.js:2524 downloadNotesJSON()` * Firefox/Safari only

- **Pre:** Firefox desktop, tip already dismissed, ≥1 note.
- **Steps:**
  1. Click Save notes.
  2. Open the downloads panel and the Downloads folder.
- **Expect:** A file named exactly `BERT — Devlin et al. 2019 (NAACL).notes.json` (the em-dash and spaces preserved; `(` and `)` survive the `[^\w.\- ]` filter as `_`) and a toast "Downloaded <that name>". Opening the file shows valid JSON with `"app": "Source-Linked AI Reading Workspace"` and `"schema": 1`.
- **Watch:** A file named `download` or `.json` with no basename — the `a.download` attribute was dropped.

### XB-042 - Safari macOS piles up "(1)" copies (the behaviour the tip is about)
**P1** * Edge * `src/app.js:2524 downloadNotesJSON()` * Firefox/Safari only

- **Pre:** Safari macOS with the default "File download location: Downloads" (not "Ask for each download").
- **Steps:**
  1. Save notes three times in a row.
  2. Inspect ~/Downloads.
- **Expect:** Three files: `<name>.notes.json`, `<name>-2.notes.json`/`<name> (1).notes.json` etc., depending on OS version. This is the exact pain the tip explains, so it is expected behaviour, not a bug — the check exists so the tip's claim stays truthful.
- **Watch:** If a future change makes Safari overwrite in place, the tip's copy ("overwrite instead of piling up "(1)" copies") becomes wrong and must be updated.

### XB-043 - Safari iOS download flow
**P1** * Functional * `src/app.js:2524 downloadNotesJSON()` * iOS only

- **Pre:** iPhone Safari, ≥1 note, tip dismissed.
- **Steps:**
  1. Open the notes drawer and tap Save notes.
  2. Follow the iOS download prompt; then open Files → Downloads.
- **Expect:** iOS shows its "Download <name>?" sheet; confirming puts the `.notes.json` in Files. The toast "Downloaded <name>" still fires in the app.
- **Watch:** The tap producing nothing because the synthetic `a.click()` at `src/app.js:2528` was not treated as user-initiated — iOS blocks downloads that are too far from a gesture.

### XB-044 - Chrome Android download
**P1** * Functional * `src/app.js:2524 downloadNotesJSON()` * Android only

- **Pre:** Chrome Android, ≥1 note.
- **Steps:**
  1. Tap Save notes; accept any storage prompt.
- **Expect:** A download notification with the correct filename, plus the in-app toast. The file opens as valid JSON from the Files app.
- **Watch:** The file saved as `.json.txt` or with the em-dash mangled to `_`.

### XB-045 - A very large shared HTML downloads intact
**P1** * Perf * `src/app.js:2595 exportSelfContainedHTML()`

- **Pre:** A PDF of ≥15 MB opened as a library document, with several screenshot notes. Run on Firefox, Safari macOS and Chrome Android.
- **Steps:**
  1. Click "Share as HTML"; wait for the size toast.
  2. Open the downloaded file by double-clicking it.
- **Expect:** The toast reports a plausible size (roughly 1.4× the PDF size, because the PDF is base64'd) and the downloaded file opens as a working read-only viewer with the PDF rendering. No tab crash during the build.
- **Watch:** A tab OOM in Safari while `bytesToB64()` (`src/app.js:178`) builds the string, or a truncated file that opens to a blank page.

### XB-046 - Navigating away mid-export
**P1** * Edge * `src/app.js:2553 exportSelfContainedHTML()`

- **Pre:** A large document; any engine.
- **Steps:**
  1. Click "Share as HTML".
  2. Immediately after the "Building shareable file…" toast, reload the page.
- **Expect:** The reload succeeds cleanly; on the next load the library and notes are intact and no partial file is written. No "beforeunload" prompt and no zombie download.
- **Watch:** A partially written file left behind on the Chromium path (the picker created the file before the write completed).

### XB-047 - Prompt-template export always uses the plain download path
**P1** * Functional * `src/app.js:2734 exportPrompts()`

- **Pre:** All six targets, Settings → Templates open.
- **Steps:**
  1. Click "Export (JSON)".
- **Expect:** On **every** engine including Chrome/Edge, a plain download of `reading-workspace-prompts.json` with the toast "Exported prompt templates." — this path deliberately does not use `saveAsFile()`, so no OS dialog appears anywhere.
- **Watch:** Inconsistency being reported as a bug; note it in the matrix instead — only Save notes and Share as HTML use the picker.

---

## 6. Storage engines: IndexedDB, localStorage, estimate

### XB-048 - IndexedDB unavailable: library rows exist but the reader is empty
**P0** * Edge * `src/app.js:123 idbOpen()`, `src/app.js:3325 boot()`

- **Pre:** A browser where `indexedDB.open` fails or is cleared — easiest reproduction: open a user PDF normally, then delete the `srw_assets` database in devtools (Application → IndexedDB) **without** clearing localStorage, and reload. Repeat in Firefox Private.
- **Steps:**
  1. Reload the app.
  2. Look at the left library list and at the reader.
- **Expect:** The library still lists the user PDF (its metadata lives in localStorage), but its bytes are gone. Acceptable behaviour is the reader showing "Your library is empty" with "Use **Open PDF or bundle** (top-left) to open a paper, its notes, or a shared **.html**." — the app must not throw.
- **Watch:** The contradiction itself: a document row in the sidebar next to an "empty library" reader is confusing. Confirm clicking the row produces the more specific message "Could not load "<name>". Re-open it with New." (`src/app.js:213`).

### XB-049 - IndexedDB unavailable: screenshot thumbnails vanish after a reload
**P1** * Edge * `src/app.js:144 rehydrateAssets()`, `src/app.js:156 save()`

- **Pre:** Firefox Private (or any session where `idbOpen()` resolved null — confirm via `indexedDB` failing in the console).
- **Steps:**
  1. Capture a region with the screenshot tool; confirm the thumbnail shows in the note.
  2. Reload the page in the same private window.
  3. Open the note.
- **Expect:** The note survives (localStorage) but its image is gone — the card shows the note without a thumbnail. There must be **no** broken-image icon and no empty `<img src="">` box, because `safeImgSrc(null)` returns `''` and the template skips the block.
- **Watch:** A grey broken-image placeholder, or an exception in `render()` when `a.screenshot` is null.

### XB-050 - localStorage blocked: the session works, nothing persists
**P1** * Edge * `src/app.js:74 loadState()`, `src/app.js:151 save()`

- **Pre:** Safari macOS with "Block all cookies" on (and repeat in Chrome with Site settings → Cookies → "Block" for the origin).
- **Steps:**
  1. Open the app; highlight a sentence; ask the AI something.
  2. Reload.
- **Expect:** Everything works within the session (state lives in memory). After the reload the app boots fresh with the seeded sample — no error dialog, no infinite spinner, no toast storm.
- **Watch:** A red toast on every keystroke because `save()`'s catch matched `/quota|exceeded/i` against a SecurityError message.

### XB-051 - localStorage quota exceeded shows the exact toast
**P1** * Edge * `src/app.js:165 save()`

- **Pre:** Any engine. Fill localStorage for the origin to near its ~5 MB cap (devtools console: write a large dummy key), leaving a few hundred KB.
- **Steps:**
  1. Create notes / paste a long answer until the write fails.
- **Expect:** Exactly one red toast per failed write: "Storage limit reached — export your notes to keep them." The UI stays usable and existing notes remain on screen.
- **Watch:** Silent data loss — the note appears in the panel but is gone after a reload with no warning ever shown.

### XB-052 - Storage estimate renders a usage string where supported
**P1** * Functional * `src/app.js:396 updateStorage()`

- **Pre:** Chrome, Edge, Firefox, Chrome Android, Safari 17+.
- **Steps:**
  1. Boot the app and read `#storageText` and the width of `#storageBar`.
  2. Open a 10 MB PDF, then re-read both.
- **Expect:** Text in the form "12 MB of 2.0 GB" (KB below 1 MB, GB above 1 GB), and the bar width tracking `usage/quota` with a 2% floor. After opening the PDF the usage figure grows.
- **Watch:** "NaN MB" or a bar wider than 100% when `quota` is 0 — the code guards with `quota ? … : 4%`, so a NaN means `estimate()` returned unexpected shapes.

### XB-053 - Storage estimate absent falls back to a document count
**P1** * Functional * `src/app.js:407 updateStorage()`

- **Pre:** An engine/build without `navigator.storage.estimate` (older Safari), or simulate by evaluating `delete navigator.storage.estimate` in the console **before** triggering a refresh, then open a PDF to force `updateStorage()`.
- **Steps:**
  1. Force `updateStorage()` by opening or purging a document.
  2. Read `#storageText`.
- **Expect:** The text becomes a plain count such as "2 documents" (the sample plus one), the bar stays at its 4% default, and nothing throws.
- **Watch:** The text staying at "Calculating…" forever — the `try` swallowed the error but the fallback line never ran.

### XB-054 - Safari's 7-day script-storage cap
**P2** * Edge * `src/app.js:74 loadState()` * Firefox/Safari only

- **Pre:** Safari macOS/iOS with default ITP settings.
- **Steps:**
  1. Create notes and confirm they persist across a reload.
  2. Confirm via Web Inspector → Storage that the data is only in localStorage (`srw_state_v1`) and IndexedDB (`srw_assets`) — no cookie, no server copy.
  3. Do not visit the site for 7+ days on that device, then return.
- **Expect:** Notes may be evicted by Safari's cap on script-writable storage. This is a platform behaviour the app cannot prevent — the check exists to confirm the mitigation is present and reachable: Save notes / Share as HTML must be one click away on Safari, and Settings → Storage must still say "Export / Import works in any browser."
- **Watch:** Any change that removes the export button from the Safari path — it is the only durable backup on that platform.

### XB-055 - Two tabs on the same origin
**P1** * State * `src/app.js:151 save()`

- **Pre:** Any engine, two tabs of the app open on the same profile.
- **Steps:**
  1. Create note A in tab 1.
  2. Create note B in tab 2.
  3. Reload tab 1.
- **Expect:** No crash and no corrupted state — last writer wins, so one tab's note may be lost. The app must recover to a valid state (notes list renders, PDF renders) after the reload in every engine.
- **Watch:** A JSON parse failure at boot that wipes everything to defaults, or an IndexedDB `VersionError` toast.

### XB-056 - Incognito's smaller quota reaches the limit sooner
**P2** * Edge * `src/app.js:133 idbPut()`, `src/app.js:165 save()` * Chromium only

- **Pre:** Chrome Incognito.
- **Steps:**
  1. Open two or three large PDFs (≥30 MB each) in the same incognito session.
  2. Watch `#storageText` and the toast area.
- **Expect:** The storage readout reflects the smaller incognito quota, and when it is exhausted the app surfaces "Storage limit reached — export your notes to keep them." rather than failing silently. Already-open documents keep rendering from the in-memory `_docBytes` cache.
- **Watch:** A hard failure where the *current* document also disappears — `loadDocBytes()` hands back a `.slice()` copy from the runtime cache, so the open document should survive an IDB write failure.

---

## 7. Secure context and crypto.subtle

### XB-057 - Content dedupe works over https on every engine
**P0** * Functional * `src/app.js:181 sha256Hex()`, `src/app.js:231 openPdfFile()`

- **Pre:** https://pairedx.com/app on all six targets; a PDF on disk and a renamed copy of the same PDF.
- **Steps:**
  1. Open the PDF; add one note.
  2. Open the renamed copy.
- **Expect:** No duplicate library row. A toast reads "Reopened <original name> — same paper, your notes are here." and the existing note is present. Behaviour is identical on all six engines.
- **Watch:** Two library rows on one engine only — that engine returned `null` from `crypto.subtle.digest` (check the console for a `SecurityError`).

### XB-058 - An insecure origin degrades to no dedupe, gracefully
**P1** * Edge * `src/app.js:186 sha256Hex()`

- **Pre:** Serve the app over plain `http://` on a LAN IP (not `localhost`, which browsers treat as secure), or open `app.html` from `file://`. Test in Chrome, Firefox and Safari.
- **Steps:**
  1. Open the same PDF twice under different filenames.
  2. Click Save notes and open the JSON.
- **Expect:** No exception anywhere. Two separate library rows appear (dedupe is impossible without a hash) and `"sha256": null` appears in the exported JSON's `document` block. `navigator.clipboard` will also be missing here — copy must still work via the `execCommand` fallback (XB-070).
- **Watch:** An uncaught `TypeError: crypto.subtle is undefined` in `openPdfFile()` that leaves the reader blank instead of just skipping dedupe.

### XB-059 - Notes files carry a null hash from insecure contexts
**P1** * Edge * `src/app.js:2271 docNotesJSON()`, `src/app.js:314 attachNotesFile()`

- **Pre:** A `.notes.json` exported from an insecure context (XB-058) and the matching PDF.
- **Steps:**
  1. On the https site, drag the PDF and that notes file in together.
- **Expect:** The notes still attach, because `attachNotesFile()` falls back to "opened alongside" (`preferIds`) and then to the filename. The toast reads "N notes attached to "<doc name>"."
- **Watch:** The red toast "Notes "<file>" don't match an open document — open its PDF too." when the PDF *is* open — the fallback chain regressed.

### XB-060 - A shared file opened from disk still renders in every engine
**P0** * Functional * `src/app.js:3283 initBundleState()`, `src/app.js:410 setupWorker()`

- **Pre:** An exported `.annotated.html`. Open it by double-clicking (so `file://`) in Chrome, Edge, Firefox and Safari macOS; also open it from Files on iOS and Android.
- **Steps:**
  1. Read a page; click a note; check the connector line at desktop widths.
- **Expect:** The PDF renders from the embedded base64 with no network access, notes appear read-only, and the "Read-only annotated paper · …" banner is pinned to the bottom. `crypto.subtle` being absent on `file://` must not matter — the bundle carries its own `sha`.
- **Watch:** A blank reader in Firefox from `file://` because the blob-worker at `src/app.js:419` was blocked; verify the console for a worker security error.

---

## 8. Canvas, devicePixelRatio and IntersectionObserver

### XB-061 - Page crispness at 1×, 2× and 3× device pixel ratios
**P1** * Visual * `src/app.js:172`, `src/app.js:466 renderPage()`

- **Pre:** A 1× external monitor, a 2× Retina Mac, and a 3× phone (iPhone).
- **Steps:**
  1. Open the sample at 115% zoom on each.
  2. Zoom the OS/browser to inspect the glyph edges of body text.
- **Expect:** Text is crisp on all three. `outputScale` is `min(devicePixelRatio, 2)`, so a 3× phone renders at 2× — acceptable, but must never look softer than the browser's own PDF viewer at the same zoom.
- **Watch:** Visibly blurry text on the 2× machine — the canvas backing store lost the `transform:[outputScale,0,0,outputScale,0,0]` at `src/app.js:474`.

### XB-062 - outputScale is captured once and goes stale
**P2** * Edge * `src/app.js:172`

- **Pre:** A laptop with a Retina display plus a 1× external monitor, Chrome or Safari.
- **Steps:**
  1. Load the app on the Retina display.
  2. Drag the window to the 1× monitor without reloading; look at the page.
  3. Separately: on one display, set browser zoom to 200% (Cmd/Ctrl +) and re-render a page by changing the PDF zoom.
  4. Reload in each case.
- **Expect:** Known limitation — `outputScale` is computed at script load, so after a display change or a browser-zoom change the canvas is scaled for the old ratio (softer, or needlessly heavy) until a reload. A reload must restore crispness.
- **Watch:** The page not merely soft but visibly mis-sized (text layer offset from the glyphs), which would break highlight anchoring, not just sharpness.

### XB-063 - iOS canvas area ceiling at maximum zoom
**P0** * Edge * `src/app.js:466 renderPage()` * iOS only

- **Pre:** iPhone Safari; open a large-format PDF (A3/poster or a paper with a big figure page).
- **Steps:**
  1. Pinch in / press "+" until the zoom readout reaches 300% (on ≤560px the readout is hidden, so tap "+" until it stops changing).
  2. Scroll across the page.
- **Expect:** Pages continue to render. If iOS refuses the canvas allocation the app must not show a black or blank page area — at minimum the previous canvas stays and the page remains readable.
- **Watch:** An entirely blank white page rectangle with a working text layer (selection still works) — the tell-tale of an iOS canvas allocation failure at ~16.7 Mpx.

### XB-064 - Continuous mode memory on a long PDF (mobile)
**P1** * Perf * `src/app.js:519 buildContinuous()`, `src/app.js:500 renderInto()` * iOS only

- **Pre:** iPhone Safari with a 200+ page PDF opened; continuous mode on.
- **Steps:**
  1. Scroll steadily from page 1 to the end without pausing.
  2. Then scroll back to page 1.
- **Expect:** Scrolling stays responsive and the tab does not reload. Pages already rendered stay rendered (`_rendered`), un-rendered ones keep their placeholder height.
- **Watch:** A Safari "This webpage was reloaded because it was using significant memory" banner — every visited page keeps a full canvas, and nothing evicts them; note the page count at which it happens.

### XB-065 - IntersectionObserver lazily renders pages on every engine
**P0** * Functional * `src/app.js:530 buildContinuous()`

- **Pre:** All six targets, continuous mode on, a ≥20-page document.
- **Steps:**
  1. Load the document and immediately scroll to roughly page 10.
  2. Watch the pages come in.
- **Expect:** Pages render as they approach the viewport (1000px root margin), so a page is essentially always drawn before it is fully on screen. Placeholder heights keep the scrollbar stable — the scroll position must not jump when a page finishes rendering.
- **Watch:** A stack of blank white rectangles that never fill on one engine only — the observer's `root: #rdScroll` is not intersecting because that ancestor's `overflow:clip` was changed.

### XB-066 - Fast scrolling does not strand blank pages
**P1** * Perf * `src/app.js:500 renderInto()`

- **Pre:** Firefox and Safari (slowest text-layer builders), continuous mode, 50+ page document.
- **Steps:**
  1. Drag the scrollbar from top to bottom in one motion, release, wait 3 seconds.
- **Expect:** Within ~3s of stopping, the visible pages are fully rendered with a working text layer. No page is permanently blank.
- **Watch:** A page stuck blank forever — `renderInto()` bailed on its `_rendering` guard and nothing re-triggers it because the observer only fires on transitions.

### XB-067 - Text-layer selection parity
**P0** * Functional * `src/app.js:480 renderPage()`, `src/app.js:813 onTextSelect()`

- **Pre:** All six targets, sample document, page with two-column body text.
- **Steps:**
  1. Drag-select a sentence that wraps across two lines.
  2. Note where the "Highlight / Note / ✦ Ask AI" popover appears.
  3. Click Highlight and compare the yellow box to the glyphs beneath.
- **Expect:** The selection covers the same words on all engines, the popover appears (below the selection on desktop; pinned to the bottom centre on ≤820px), and the highlight rectangles sit on the text, not offset.
- **Watch:** Firefox's selection extending into adjacent columns, or a highlight drawn one line above/below the glyphs (a `--scale-factor` mismatch at `src/app.js:478`).

### XB-068 - A page wider than the viewport stays reachable
**P1** * Visual * `src/styles.css:115` `#contPages`

- **Pre:** A landscape/A3 PDF in continuous mode; test on Chrome, Firefox and Safari, and at a narrow window width.
- **Steps:**
  1. Zoom to 300% so the page is wider than the scroller.
  2. Scroll left as far as possible.
- **Expect:** The page's **left edge** is reachable. The rule uses `align-items:center` followed by `align-items:safe center`, so engines that support the `safe` keyword fall back to start-alignment when the page overflows.
- **Watch:** On an engine that drops the `safe` declaration, the left edge is stranded outside the scroll range and the first column of text can never be read or highlighted — check Safari specifically.

---

## 9. Clipboard and its fallback

### XB-069 - Copy a whole note on every engine
**P1** * Functional * `src/app.js:1782 copyTextToClipboard()`, `src/app.js:1787 copyNote()`

- **Pre:** https origin; a note with a question and an AI answer; all six targets.
- **Steps:**
  1. Hover (desktop) or tap (mobile) the note head, click the copy icon (title "Copy whole thread").
  2. Paste into a plain-text editor.
- **Expect:** A toast "Note to clipboard." and pasted text beginning with the source line ("Linked text — Page N · …"), then the quote in straight quotes, then each message prefixed with its author.
- **Watch:** A toast claiming success while the clipboard is unchanged — Safari resolves `writeText` even when the write is dropped outside a gesture.

### XB-070 - The execCommand fallback runs when the Clipboard API is unavailable
**P1** * Edge * `src/app.js:1778 fallbackCopy()`

- **Pre:** An insecure origin (`http://<LAN-IP>` or `file://`) where `navigator.clipboard` is undefined; test in Chrome and Firefox desktop.
- **Steps:**
  1. Click the copy icon on an AI answer (title "Copy this response").
  2. Paste elsewhere.
- **Expect:** The text is on the clipboard and the toast reads "Response to clipboard." The temporary textarea must not flash visibly (it is `position:fixed; opacity:0`) and must be removed from the DOM afterwards (inspect: no stray `<textarea>` at the end of `<body>`).
- **Watch:** The page scrolling to the top when the hidden textarea is focused, or a lingering textarea that steals subsequent keystrokes.

### XB-071 - A failed copy tells the user what to do
**P1** * Copy * `src/app.js:1780 fallbackCopy()`

- **Pre:** A context where both paths fail — e.g. Safari with the copy invoked from a non-gesture task (trigger `copyNote(...)` from the console).
- **Steps:**
  1. Invoke a copy outside a user gesture.
- **Expect:** A red toast "Copy failed — select the text and copy manually." and no exception in the console.
- **Watch:** A silent no-op, which reads as "the copy button is broken".

### XB-072 - Copy inside a gesture on iOS Safari
**P1** * Functional * `src/app.js:1784 copyTextToClipboard()` * iOS only

- **Pre:** iPhone Safari on https, a note with an AI answer.
- **Steps:**
  1. Open the notes drawer; tap the copy icon on the answer.
  2. Long-press in Notes.app and paste.
- **Expect:** Paste yields the answer text with the leading "AI: " author prefix stripped (`copyMsg` strips it at `src/app.js:1788`), plus a "Response to clipboard." toast.
- **Watch:** iOS silently rejecting the write because `writeText` was called after an `await` — verify the call is still synchronous inside the click handler.

### XB-073 - Copying a very large thread
**P2** * Perf * `src/app.js:1771 noteToText()`

- **Pre:** A note with an agent answer that has 5+ tool calls and a long trace; all desktop engines.
- **Steps:**
  1. Click "Copy whole thread".
  2. Paste into an editor and check the length.
- **Expect:** The full thread copies (tens of KB) without freezing the UI, and the toast fires once.
- **Watch:** Safari truncating a multi-hundred-KB clipboard write, or the tab hanging for seconds while `noteToText()` runs.

---

## 10. Remotely-loaded code and offline behaviour

### XB-074 - The PDF.js worker resolves from the inlined base64, not the CDN
**P0** * Functional * `src/app.js:410 setupWorker()`

- **Pre:** All six targets; devtools Network tab open, filter "worker" and "cdnjs".
- **Steps:**
  1. Hard-reload the app and let the sample render.
  2. Inspect network requests and evaluate `pdfjsLib.GlobalWorkerOptions.workerSrc` in the console.
- **Expect:** `workerSrc` is a `blob:` URL built from `window.PDFJS_WORKER_B64` (`src/app.js:417-419`). **No** request to `cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js` is made on any engine.
- **Watch:** A CDN worker request appearing — the app would then break entirely offline and inside corporate networks that block cdnjs.

### XB-075 - Full offline boot
**P0** * Functional * `src/app.js:3303 boot()`

- **Pre:** Load the app once (so it is cached), then switch the OS/devtools to Offline. Test Chrome, Firefox, Safari macOS.
- **Steps:**
  1. Reload the app offline.
  2. Render pages, highlight text, capture a screenshot, run find-in-document, export notes.
  3. Then ask the AI something.
- **Expect:** Everything except AI works. The AI request fails with the toast "Could not reach the AI endpoint (/api/ai). This works on the deployed site; when opening the file locally without the server, add a key in Settings or run it via the deployment." The Inter web font falls back to the system stack without breaking the layout.
- **Watch:** A blank reader offline (worker regression, XB-074) or an unstyled page because the stylesheet was not cached.

### XB-076 - Tesseract CDN blocked reports a clear failure
**P1** * Edge * `src/app.js:680 ensureTesseract()`, `src/app.js:779 runOcr()`

- **Pre:** A scanned (image-only) PDF; block `cdn.jsdelivr.net` (devtools request blocking or hosts file). Test in Chrome and Firefox.
- **Steps:**
  1. Open the scanned PDF and wait for the banner "This looks like a **scanned PDF** — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?".
  2. Click "Run OCR".
- **Expect:** The banner message changes to "Loading the OCR engine…", then a red toast "OCR could not run: tesseract load failed" and the banner is removed. The document remains readable.
- **Watch:** The banner stuck on "Loading the OCR engine…" forever with no toast — the rejection path did not reach the `finally` at `src/app.js:780`.

### XB-077 - OCR parity across engines
**P1** * Functional * `src/app.js:693 createTesseractWorker()`, `src/app.js:707 ocrOnePage()`

- **Pre:** The same 3-page scanned PDF on Chrome desktop, Firefox desktop, Safari macOS, Safari iOS and Chrome Android; network unblocked.
- **Steps:**
  1. Run OCR to completion on each.
  2. Then select a line of the OCR'd text and use find-in-document for a word.
- **Expect:** Progress messages "Reading text… **page N of M**", a completion toast "OCR complete — N pages now searchable & highlightable.", and selectable text whose selection rectangles sit on the printed words on every engine.
- **Watch:** iOS/Android running out of memory partway (the OCR canvas is ~2000px wide per page) — record the page count at which it fails; the "Stop" control must still end the run cleanly.

### XB-078 - MathJax CDN blocked leaves readable raw LaTeX
**P1** * Edge * `src/app.js:2051 ensureMathJax()`

- **Pre:** Block `cdnjs.cloudflare.com`; a note whose AI answer contains `\( … \)` and `\[ … \]` (use an existing seeded note or paste one into an answer via edit).
- **Steps:**
  1. Open the note.
  2. Wait 5 seconds.
- **Expect:** The math shows as literal `\( … \)` source text. No exception, no toast, no infinite retry loop (the `onerror` handler resets `__mjLoading` so a later render may retry once).
- **Watch:** The notes panel throwing on `window.MathJax.typesetPromise` being undefined, which would blank the whole list.

### XB-079 - MathJax typesets identically on every engine
**P1** * Visual * `src/app.js:2072 typesetMath()`, `src/styles.css:620-628`

- **Pre:** A note with inline and display math; all six targets.
- **Steps:**
  1. Open the note; compare inline math to the surrounding sentence baseline.
  2. Compare a display equation's centring.
  3. Widen a display equation beyond the panel width (a long equation) and check for a horizontal scrollbar inside the message.
- **Expect:** Inline math stays *inline* (the `mjx-container svg{display:inline-block}` override at `src/styles.css:627` beats the global `svg{display:block}` reset), display math is centred on its own line, and an over-wide equation scrolls inside `.msg` without making the page scroll sideways.
- **Watch:** Every inline equation dropping onto its own line — the sign that the `svg{display:block}` override was lost in one engine's cascade.

### XB-080 - Web font blocked: layout survives the fallback stack
**P2** * Visual * `app.html:10`

- **Pre:** Block `fonts.googleapis.com` and `fonts.gstatic.com`; test Chrome, Firefox, Safari macOS and iOS.
- **Steps:**
  1. Reload and inspect the toolbar, the notes cards, and the sidebar document names.
- **Expect:** Text renders in the fallback stack (`-apple-system` / `Segoe UI` / Roboto). No control wraps to a second line in the 60px toolbar, no document name overflows its row (it is ellipsised), and the notes panel footer stays on one line.
- **Watch:** The toolbar's page box / zoom group wrapping and pushing the tools row out of the 60px strip, which then collides with `#captureMask` (offset `top:60px`).

### XB-081 - The AI proxy is unreachable
**P1** * Copy * `src/app.js:1594 errHint()`

- **Pre:** Any engine; block `/api/ai` (devtools request blocking) with the rest of the app online.
- **Steps:**
  1. Ask a question in the document composer.
- **Expect:** The pending "Thinking…" indicator resolves into an error and a red toast with the exact text quoted in XB-075. The note itself remains, with the failed answer marked by a "⚠" message, and the app stays usable.
- **Watch:** A note stuck in "Thinking…" forever with no toast on one engine — the `catch` at `src/app.js:1506` never ran because the fetch neither resolved nor rejected.

### XB-082 - An ad blocker blocking analytics has no user-visible effect
**P2** * Regression * `app.html:135-136`

- **Pre:** Firefox with strict tracking protection, or Chrome with uBlock Origin.
- **Steps:**
  1. Load the app and use it normally for a minute.
  2. Read the console.
- **Expect:** `/_vercel/insights/script.js` may fail to load; nothing else changes. No exception from `window.va` being a no-op shim, and no visible UI difference.
- **Watch:** An uncaught error from analytics code breaking `boot()` — the shim at `app.html:135` must be defined before the deferred script.

---

## 11. Touch, keyboard inset and mobile layout

### XB-083 - Pinch zoom on iOS re-renders the PDF, not the UI
**P0** * Functional * `src/app.js:990 initPinch()` * iOS only

- **Pre:** iPhone Safari, sample document, single-page mode and then continuous mode.
- **Steps:**
  1. Pinch out (fingers apart) on the page.
  2. Pinch in (fingers together) past the fit width.
  3. Watch the toolbar and drawers during the gesture.
- **Expect:** Only the page scales — the toolbar, the tools bar and the drawers never magnify. After the fingers lift, the page re-renders crisply at the new zoom, the pinched-on spot stays under the fingers, and a pinch-in snaps to the fit-width zoom (`fitZoom`) rather than shrinking past it.
- **Watch:** The whole UI zooming (the browser claimed the gesture because `touch-action` on `.rd-scroll` at `src/styles.css:110` changed) or blurry text that never re-renders (the `commit()` path did not run).

### XB-084 - Pinch zoom on Chrome Android
**P0** * Functional * `src/app.js:1012 initPinch()` * Android only

- **Pre:** Chrome Android, sample document.
- **Steps:**
  1. Repeat XB-083.
  2. Then pinch while the page is mid-scroll (fling, then pinch).
- **Expect:** Identical behaviour to iOS. A small accidental pinch during a scroll (scale within ±6%) is ignored and the scroll continues.
- **Watch:** `preventDefault` failing because the `touchmove` listener lost `{passive:false}` — the symptom is the browser's own zoom kicking in halfway through.

### XB-085 - Desktop trackpad pinch is the browser's zoom
**P2** * Edge * `src/app.js:990 initPinch()`

- **Pre:** MacBook trackpad in Safari/Chrome; a Windows precision touchpad in Edge/Firefox.
- **Steps:**
  1. Pinch on the trackpad over the PDF.
- **Expect:** Known and acceptable: trackpad pinch produces ctrl+wheel, not touch events, so the **browser** zooms the whole page. The app's zoom buttons remain the way to scale the PDF. The layout must still be usable at 150% browser zoom (drawers appear, toolbar scrolls horizontally).
- **Watch:** At 200% browser zoom the viewport width drops under 820px and the asides become drawers mid-session — confirm the reader still renders and the tools bar moves to the bottom without overlapping content.

### XB-086 - The on-screen keyboard does not cover the note composer (iOS)
**P0** * Functional * `src/app.js:950 initKeyboardInset()`, `src/styles.css:548` * iOS only

- **Pre:** iPhone Safari; a note selected in the notes drawer.
- **Steps:**
  1. Tap the inline "Reply or ask a follow-up…" field.
  2. Type two lines.
  3. Dismiss the keyboard.
- **Expect:** The drawer's bottom lifts by the keyboard height (`--kb`), the field you are typing in stays visible above the keyboard and Safari's accessory bar, and the document-level composer plus the count/sort row hide while replying (`#notes.replying` at `src/styles.css:606`). Dismissing restores them.
- **Watch:** The composer sitting *behind* the keyboard — `visualViewport` overlap was measured as 0 because `drawerMQ.matches` was false at that width.

### XB-087 - The on-screen keyboard inset on Chrome Android
**P1** * Functional * `src/app.js:971 initKeyboardInset()` * Android only

- **Pre:** Android phone, Chrome, a note selected.
- **Steps:**
  1. Repeat XB-086.
  2. Also switch to a different keyboard height (emoji panel / voice input).
- **Expect:** The same lift behaviour; changing keyboard height re-measures via the `visualViewport` resize listener and the field stays visible.
- **Watch:** A double inset (the drawer lifting twice the keyboard height) if Android resizes the layout viewport *and* the visual viewport.

### XB-088 - dvh height with the iOS URL bar collapsing
**P1** * Visual * `src/styles.css:29`, `src/styles.css:579` * iOS only

- **Pre:** iPhone Safari, sample document, tools bar visible.
- **Steps:**
  1. Scroll down until Safari's toolbars shrink.
  2. Scroll back up until they expand.
  3. Watch the floating tools bar the whole time.
- **Expect:** The tools bar stays fully visible and tappable in both states — it is positioned `absolute` against `#reader` (whose bottom is the `100dvh` edge), deliberately not `fixed`.
- **Watch:** The tools bar sliding under Safari's bottom toolbar when the bars expand, making the highlight/screenshot tools unreachable.

### XB-089 - Safe-area insets on a notched iPhone
**P1** * Visual * `src/styles.css:579-595` * iOS only

- **Pre:** iPhone with a home indicator, Safari, portrait then landscape.
- **Steps:**
  1. Check the gap between the tools bar and the bottom edge.
  2. Open the notes drawer and check the composer's bottom padding.
  3. Rotate to landscape and check the left/right edges.
- **Expect:** Nothing is under the home indicator: the tools bar, the toasts (`bottom:calc(84px + env(safe-area-inset-bottom))`), the composer and the sidebar storage block all clear it. Note that `app.html:5` has no `viewport-fit=cover`, so the insets resolve to 0 and iOS itself insets the layout viewport — the observable requirement is simply that nothing is obscured.
- **Watch:** Content sitting under the home indicator after someone adds `viewport-fit=cover` without re-testing these five `env()` call sites.

### XB-090 - iOS does not auto-zoom when a field is focused
**P0** * Visual * `src/styles.css:600` * iOS only

- **Pre:** iPhone Safari at ≤820px width.
- **Steps:**
  1. Tap the page-number input in the toolbar.
  2. Tap the find-in-document input.
  3. Tap a note's reply field, then the edit textarea on an existing message.
- **Expect:** The page never zooms in when any of these gains focus — every one of them is forced to 16px by the `input,textarea,select,.pagein,.tc-input,.edit-input,#findInput` rule.
- **Watch:** A newly added input class missing from that list: the whole layout scales up and pans, and half the toolbar slides off-screen.

### XB-091 - Long-press selection surfaces the actions on iOS
**P0** * Functional * `src/app.js:3133-3146 wire()`, `src/app.js:845 positionSelPop()` * iOS only

- **Pre:** iPhone Safari, sample document, cursor tool active.
- **Steps:**
  1. Long-press a word, then drag the selection handles to extend it.
  2. Release and wait ~0.5s.
  3. Tap "✦ Ask AI".
- **Expect:** iOS shows its own Copy / Look Up menu *and* the app's popover appears **pinned to the bottom centre** of the reader; while it is up the floating tools bar dims away (`body:has(#selPop:not(.hidden)) .tools`). Tapping "✦ Ask AI" opens the notes drawer with a new note and the keyboard up.
- **Watch:** The popover never appearing (iOS does not fire `mouseup` for a long-press selection, so this depends entirely on the `selectionchange` path) or it firing mid-drag while the handles are still moving.

### XB-092 - Long-press selection on Chrome Android
**P0** * Functional * `src/app.js:3146 wire()` * Android only

- **Pre:** Android Chrome, sample document.
- **Steps:**
  1. Repeat XB-091.
- **Expect:** Same behaviour: bottom-pinned popover, tools bar dimmed, "Highlight" creates a highlight silently and "Note" opens the drawer.
- **Watch:** A double-fire creating two notes from one tap — the `touchend` handler skips targets inside `#selPop` at `src/app.js:3141` so the button's click can land first.

### XB-093 - The `:has()` rule that hides the tools bar
**P1** * Visual * `src/styles.css:592`

- **Pre:** Each mobile-width target: iOS Safari, Android Chrome, plus desktop Chrome/Firefox/Safari narrowed to ≤820px.
- **Steps:**
  1. Make a text selection so `#selPop` is visible.
  2. Look at the floating tools bar behind it.
- **Expect:** Where `:has()` is supported the tools bar fades to `opacity:0` and stops taking taps, so the popover's buttons are unobstructed.
- **Watch:** On an engine without `:has()` support (older Firefox), the tools bar stays visible directly under the popover — verify the popover's buttons are still hittable and do not overlap the tools.

### XB-094 - Hover-only affordances on a touch device
**P1** * A11y * `src/styles.css:285-286`, `src/styles.css:74-77`

- **Pre:** iPhone/Android with a note open, and a library with two documents.
- **Steps:**
  1. Look at a note's header: are copy / edit / delete visible?
  2. Tap where the copy icon would be and see if it fires.
  3. Look at a library row: are the star and trash icons visible?
- **Expect:** Document the current state: `.macts` and `.doc-act` are `opacity:0` until `:hover`, so on touch they are invisible though still tappable. The always-visible controls (collapse chevron, "show on card" checkbox at `opacity:.5`) must remain visible on touch.
- **Watch:** A regression that also makes the hidden controls `pointer-events:none`, which would leave touch users with no way to delete a note or trash a document at all.

### XB-095 - Region capture works with mouse, touch and pen
**P0** * Functional * `src/app.js:917 initCaptureMask()`, `src/styles.css:158`

- **Pre:** Desktop mouse (Chrome/Firefox/Safari), an iPad with Apple Pencil if available, an Android phone.
- **Steps:**
  1. Select the screenshot tool; confirm the "Select area to capture" bar appears.
  2. Drag a box over a figure with each input device.
  3. Also try a tiny drag (<12px) and a drag that starts on the page and ends outside it.
- **Expect:** All three input types draw the dashed box with four handles and produce a screenshot note ("Region captured — ask the AI about it below."). A sub-12px drag is ignored silently. A drag mostly off-page either clamps to the page or toasts "Draw the box over a page to capture it."
- **Watch:** Touch drag scrolling the page instead of drawing a box — `touch-action:none` on `#captureMask` regressed; the mask uses pointer events precisely so touch is not mouse-only.

### XB-096 - The panel resizer is absent at drawer widths and usable on tablets
**P1** * Functional * `src/app.js:3221 initPanelResize()`, `src/styles.css:561`

- **Pre:** Desktop ≥821px, then narrowed to ≤820px; plus an iPad in landscape (>820px) and portrait (≤820px).
- **Steps:**
  1. At desktop width, drag the notes panel's left edge; double-click it.
  2. Narrow the window below 820px and try to find the grip.
  3. On the iPad in landscape, drag the grip with a finger.
- **Expect:** Desktop: the panel resizes between 300px and its clamped max; double-click resets to 384px; the width persists across a reload. Below 820px `.col-resizer` is `display:none` (drawers are full-height overlays). iPad landscape: the finger drag resizes without scrolling the page (`touch-action:none`, `{passive:false}`).
- **Watch:** A ghost grip still capturing touches in drawer mode, which would block taps on the notes list's left edge.

### XB-097 - Rotate / resize mid-operation
**P1** * Edge * `src/app.js:1150 setPanel()`, `src/app.js:3176 wire()`

- **Pre:** iPhone/iPad and a resizable desktop window.
- **Steps:**
  1. Start an AI answer, then rotate the device while it streams.
  2. Open the screenshot tool, start dragging a box, and rotate mid-drag (or resize the desktop window mid-drag).
  3. With a note selected on desktop, drag the window narrower through the 820px boundary and back.
- **Expect:** The answer keeps streaming into the right note. The in-progress capture is abandoned cleanly (no orphan `.selbox` left in the DOM) rather than producing a mis-cropped screenshot. Crossing 820px turns the asides into drawers, hides the connector (`#connectors{display:none}`), and crossing back re-draws it against the correct pin.
- **Watch:** A connector line left drawn across the page after the layout switches to drawers, or a stuck `.selbox` that swallows every subsequent click on the reader.

---

## 12. Print and PDF export

### XB-098 - Export PDF opens the engine's print dialog
**P0** * Functional * `src/app.js:2876 openExport()`, `src/styles.css:431-451`

- **Pre:** A document with 5+ notes including a screenshot and an AI answer; Chrome, Edge, Firefox, Safari macOS.
- **Steps:**
  1. Click the PDF icon in the notes header (title "Export annotations to PDF").
  2. Click "⭳ Export PDF".
  3. Inspect every page of the print preview.
- **Expect:** The app chrome (`#app`, the export top bar, the options rail, connectors, toasts) is hidden; only the sheet prints, starting with the document title and "Exported on <date>", and it flows across **multiple pages** with no item split mid-card (`break-inside:avoid`).
- **Watch:** Safari printing only one page — the tell of `position:fixed` surviving into print; the block sets `#exportView{position:static}` for exactly this reason.

### XB-099 - Print colour fidelity
**P1** * Visual * `src/styles.css:435`

- **Pre:** As XB-098, with at least one yellow highlight note and one AI answer with chips.
- **Steps:**
  1. In the print preview, check whether the yellow quote background, the blue linked-text quote and the provenance chips keep their fills.
  2. Repeat with "Background graphics" off in the print options.
- **Expect:** With default options the coloured backgrounds print (both `-webkit-print-color-adjust` and `print-color-adjust` are set to `exact`). With backgrounds explicitly disabled by the user, text must still be legible — no white-on-white.
- **Watch:** Firefox dropping the fills, which would make the highlight/linked-text distinction invisible in the exported PDF.

### XB-100 - iOS print flow
**P2** * Functional * `src/app.js:2876 openExport()` * iOS only

- **Pre:** iPhone/iPad Safari with notes.
- **Steps:**
  1. Open the export view (the notes drawer header's PDF button) and tap "⭳ Export PDF".
- **Expect:** iOS opens its print sheet; pinching out on the preview lets the user save to Files as PDF. The export options rail must be reachable on a phone-width screen first (`.ex-body` is a 300px + 1fr grid with no narrow-width override — confirm the options are scrollable, not clipped).
- **Watch:** The options rail eating the whole 390px viewport so the preview and the "⭳ Export PDF" button cannot be reached.

### XB-101 - Printing while math is still typesetting
**P2** * Edge * `src/app.js:2905 buildSheet()`, `src/app.js:2078 scheduleTypeset()`

- **Pre:** Notes containing LaTeX; a cold load so MathJax has not been fetched yet.
- **Steps:**
  1. Open the export view and click "⭳ Export PDF" within ~1s.
- **Expect:** Either typeset math or literal `\( … \)` source in the printout — never a half-rendered `mjx-container` with clipped glyphs, and never a blank equation area.
- **Watch:** The print dialog opening before `scheduleTypeset()`'s 120ms debounce plus the CDN fetch complete, producing raw LaTeX in a PDF the user thought was final.

---

## 13. Chromium-only affordance audit

### XB-102 - No Chromium-only affordance is offered without a fallback
**P0** * Functional * `src/app.js:2264 fsSupported()`, `src/app.js:2798 openSettings()` * Firefox/Safari only

- **Pre:** Firefox desktop, Safari macOS, Safari iOS, Chrome Android.
- **Steps:**
  1. Walk the whole UI: left sidebar (Open PDF or bundle, Share as HTML), reader toolbar, notes header (Save / Import / Export PDF / Clear), notes filter popover, Settings → all three tabs, the export view.
  2. Click every control that could involve the filesystem.
- **Expect:** Exactly **one** control is Chromium-only and it is still shown to everyone: Settings → Storage → "Choose folder…". Clicking it must produce the toast "Folder sync needs Chrome or Edge. Use Export / Import notes instead." — an explicit, actionable message with a named alternative. Every other control works or degrades to a download on all engines.
- **Watch:** Any *new* control that calls `showSaveFilePicker`/`showDirectoryPicker` without going through `saveAsFile()`/`fsSupported()` — that is the regression this check exists to catch. Also flag if "Choose folder…" ever becomes silent, disabled with no explanation, or hidden without the hint text that explains why folder sync is unavailable.

### XB-103 - Marketing copy still states the platform limits
**P1** * Copy * `features.html:260`, `features.html:349`

- **Pre:** features.html open in any browser.
- **Steps:**
  1. Find the "Portable & private" row and the "Storage & privacy" list.
- **Expect:** The lead still reads "Everything stays in your browser. Optionally sync a portable **.notes.json** to a folder (Chrome/Edge) so notes travel with your PDFs — great for Drive and other devices.", and the feature list still contains "Optional folder sync (File System Access)".
- **Watch:** The "(Chrome/Edge)" qualifier being dropped in a copy pass — the app would then promise folder sync to Safari and Firefox users.

### XB-104 - The read-only shared file behaves the same on every engine
**P1** * Functional * `src/app.js:3294 applyReadOnly()`

- **Pre:** One exported `.annotated.html`, opened on all six targets (AirDrop/copy it to the phones and open from Files).
- **Steps:**
  1. Confirm the hidden controls: no "Open PDF or bundle", no highlight/comment/screenshot tools, no composer, no Save/Import/Clear/Share, no Settings, no storage widget.
  2. Read a page, expand a note, expand "Show the agent's work", check any math and any embedded screenshot.
  3. Reload the file and confirm nothing was written to that origin's localStorage.
- **Expect:** Identical read-only experience everywhere, the bottom banner "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX" present, images and math rendering, and `srw_state_v1` absent from the file's origin after a reload (`save()` returns immediately when `READONLY`).
- **Watch:** One engine showing an editing control that the others hide, or the file writing state into the recipient's browser.

---

## Coverage map
| Code or element | Checks |
|---|---|
| `idbOpen()` src/app.js:123 | XB-001, XB-009, XB-048, XB-049 |
| `idbPut()/idbGet()` src/app.js:133-143 | XB-026, XB-056 |
| `save()` src/app.js:151 | XB-008, XB-050, XB-051, XB-055, XB-104 |
| `sha256Hex()` src/app.js:181 | XB-001, XB-057, XB-058, XB-059 |
| `openPdfFile()` src/app.js:219 | XB-028, XB-057 |
| `attachNotesFile()` src/app.js:310 | XB-059 |
| `updateStorage()` src/app.js:396 | XB-001, XB-005, XB-052, XB-053 |
| `setupWorker()` src/app.js:410 | XB-060, XB-074, XB-075 |
| `fitZoomToWidth()` src/app.js:437 | XB-006, XB-007 |
| `renderPage()` src/app.js:456 + `outputScale` src/app.js:172 | XB-061, XB-062, XB-063, XB-067 |
| `renderInto()` src/app.js:500 | XB-064, XB-066 |
| `buildContinuous()` src/app.js:519 | XB-064, XB-065 |
| `ensureTesseract()` src/app.js:680 | XB-001, XB-076 |
| `createTesseractWorker()` src/app.js:693 / `ocrOnePage()` src/app.js:707 | XB-077 |
| `runOcr()` src/app.js:753 | XB-076, XB-077 |
| `onTextSelect()` src/app.js:813 / `positionSelPop()` src/app.js:845 | XB-067, XB-091, XB-092 |
| `initCaptureMask()` src/app.js:917 | XB-095 |
| `initKeyboardInset()` src/app.js:950 | XB-086, XB-087 |
| `initPinch()` src/app.js:990 | XB-083, XB-084, XB-085 |
| `setPanel()` src/app.js:1150 | XB-097 |
| `errHint()` src/app.js:1594 | XB-075, XB-081 |
| `fallbackCopy()` src/app.js:1778 / `copyTextToClipboard()` src/app.js:1782 | XB-069, XB-070, XB-071, XB-072, XB-073 |
| `ensureMathJax()` src/app.js:2051 / `typesetMath()` src/app.js:2072 | XB-078, XB-079, XB-101 |
| `fsSupported()` src/app.js:2264 | XB-001, XB-021, XB-102 |
| `chooseNotesFolder()` src/app.js:2332 | XB-020, XB-021, XB-022 |
| `notesDirHandle()` src/app.js:2343 | XB-023, XB-024 |
| `writeNotesToFolder()` src/app.js:2352 | XB-025, XB-027 |
| `maybeOfferFolderNotes()` src/app.js:2396 | XB-028 |
| `scheduleFolderSync()` src/app.js:2451 | XB-025, XB-029 |
| `maybeShowSaveAsTip()` src/app.js:2460 | XB-031, XB-032, XB-033, XB-034, XB-035, XB-036, XB-037, XB-038, XB-039, XB-040 |
| `saveAsFile()` src/app.js:2503 | XB-001, XB-010, XB-011, XB-012, XB-013, XB-014, XB-016, XB-017, XB-018 |
| `downloadNotesJSON()` src/app.js:2524 | XB-041, XB-042, XB-043, XB-044 |
| `exportSelfContainedHTML()` src/app.js:2553 | XB-015, XB-045, XB-046 |
| `saveNotesNow()` src/app.js:2607 | XB-010, XB-019, XB-023, XB-024 |
| `openSettings()` storage pane src/app.js:2789-2822 | XB-029, XB-030, XB-102 |
| `exportPrompts()` src/app.js:2734 | XB-047 |
| `openExport()` / `window.print()` src/app.js:2846, 2876 | XB-098, XB-099, XB-100 |
| `buildSheet()` src/app.js:2881 | XB-101 |
| `initPanelResize()` src/app.js:3221 | XB-096 |
| `initBundleState()` src/app.js:3283 / `applyReadOnly()` src/app.js:3294 | XB-040, XB-060, XB-104 |
| `boot()` src/app.js:3303 | XB-002 - XB-009, XB-048, XB-075 |
| `wire()` selection listeners src/app.js:3127-3150 | XB-091, XB-092 |
| `src/styles.css:29` (`dvh`) | XB-088 |
| `src/styles.css:110` (`touch-action`) / `:158` (`#captureMask`) | XB-083, XB-095 |
| `src/styles.css:115` (`align-items:safe center`) | XB-068 |
| `src/styles.css:285`, `:74` (hover-only actions) | XB-094 |
| `src/styles.css:431-451` (print block) | XB-098, XB-099 |
| `src/styles.css:544-608` (≤820px drawers, safe-area, 16px inputs) | XB-006, XB-086, XB-089, XB-090, XB-093, XB-096 |
| `src/styles.css:592` (`:has()`) | XB-093 |
| `src/styles.css:609-612` (≤560px) | XB-006 |
| `src/styles.css:620-628` (MathJax SVG) | XB-079 |
| `app.html:5` (viewport meta) | XB-089 |
| `app.html:10` (Google Fonts) | XB-080 |
| `app.html:135-136` (analytics) | XB-082 |
| `features.html:260`, `:349` | XB-103 |

## Deliberately not covered here
- Landing-page rendering, hero video/GIF playback and responsive behaviour - covered in **01 landing page** (this document only touches `features.html` copy where it states a platform limit).
- The features page's own layout, anchors and imagery - covered in **02 features page**.
- Library CRUD (star, trash, restore, purge), the sidebar tree and empty states as *features* - covered in **03 app shell and library**; only their storage-engine failure modes appear here.
- Opening / dedupe / notes-attachment logic as a feature, drag-and-drop matching rules - covered in **04 document lifecycle**; only the `crypto.subtle` dependency appears here.
- Zoom, page navigation, continuous mode and find-in-document as features - covered in **05 reader and navigation**; only their engine-specific rendering and observer behaviour appear here.
- Highlight/comment/screenshot tool semantics, anchoring accuracy and renumbering - covered in **06 annotation tools**; only input-method and canvas-platform aspects appear here.
- Note cards, filters, sorting, editing, tags and the composer as features - covered in **07 notes panel**.
- AI routing, the ReAct agent, prompts, visuals and provider settings - covered in **08 AI and agent**; only the transport failure copy appears here.
- OCR detection thresholds, accuracy and the banner's own flow - covered in **09 OCR**; only CDN availability and per-engine feasibility appear here.
- State migration, seeding, persistence semantics and quota accounting as features - covered in **10 storage and persistence**; only engine-level storage availability appears here.
- Share/export content correctness (what lands in the JSON, the bundle and the printed sheet) - covered in **11 share and export**; only *where the bytes go* per engine appears here.
- Keyboard-only navigation, focus order, contrast and screen-reader semantics - covered in the accessibility document; XB-094 is included only because the affordance is hidden by a pointer-capability difference.
