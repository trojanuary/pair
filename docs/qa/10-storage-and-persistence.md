# 10 - Storage, persistence, save & import/export of notes

> Everything that makes PairedX remember: the single `localStorage` state blob and its debounced write, IndexedDB asset offloading and rehydration, state migration on upgrade, the storage meter, quota exhaustion, the Save button and its native Save As dialog, the one-time Firefox/Safari save tip, File System Access folder sync, notes-file discovery banners, and JSON export/import.

| | |
|---|---|
| **ID prefix** | STOR |
| **Scope** | `localStorage['srw_state_v1']` + the 250 ms debounced `save()`; `localStorage['srw_saveas_tip']`; IndexedDB `srw_assets` (`shot:`, `img:`, `dir:notes`) and the `"@idb"` sentinel; `migrateState()` upgrade paths; the sidebar Storage meter (`#storageBar` / `#storageText`); the quota toast; `#btnSaveNotes` → `saveNotesNow()` → folder sync → `showSaveFilePicker` → download; `maybeShowSaveAsTip()`; Settings → Storage (`stFolder` / `stChange` / `stDisconnect` / `stExport` / `stImport`); `chooseNotesFolder()` / `writeNotesToFolder()` / `notesDirHandle()` / `scheduleFolderSync()`; `findFolderNotes()` / `maybeOfferFolderNotes()` / `maybeOfferNotesFallback()` / `#notesBanner` / `openNotesFileFor()`; `#btnImportNotes` → `importNotesJSON()` → `applyNotesJSON()`; `#btnClearNotes` → `clearActiveNotes()`; read-only bundles never writing storage. |
| **Primary code** | `src/app.js:37-39`, `src/app.js:54-168`, `src/app.js:196-202`, `src/app.js:346-356`, `src/app.js:396-408`, `src/app.js:2259-2547`, `src/app.js:2602-2641`, `src/app.js:2789-2822`, `src/app.js:3283-3353`, `app.html:36-40`, `src/styles.css:83-85`, `src/styles.css:119`, `src/styles.css:657-670` |
| **Checks** | 130 |

## Contents
- [1. The localStorage state key and the debounced save](#1-the-localstorage-state-key-and-the-debounced-save) - 13 checks
- [2. State migration on upgrade](#2-state-migration-on-upgrade) - 13 checks
- [3. IndexedDB asset offloading and rehydration](#3-indexeddb-asset-offloading-and-rehydration) - 13 checks
- [4. Quota exhaustion and denied storage](#4-quota-exhaustion-and-denied-storage) - 8 checks
- [5. The storage meter](#5-the-storage-meter) - 8 checks
- [6. The Save button, native Save As, and the download fallback](#6-the-save-button-native-save-as-and-the-download-fallback) - 16 checks
- [7. The one-time Firefox/Safari save tip](#7-the-one-time-firefoxsafari-save-tip) - 11 checks
- [8. Folder sync via the File System Access API](#8-folder-sync-via-the-file-system-access-api) - 16 checks
- [9. Notes discovery and the offer banners](#9-notes-discovery-and-the-offer-banners) - 13 checks
- [10. Export and import of notes JSON](#10-export-and-import-of-notes-json) - 13 checks
- [11. Deleting notes, and read-only bundles](#11-deleting-notes-and-read-only-bundles) - 6 checks

---

**Standing fixtures for this document.** Prepare once, reuse throughout.

| Fixture | How to make it |
|---|---|
| `paper-a.pdf` | Any real multi-page text PDF, 2-10 MB. |
| `paper-a-renamed.pdf` | Byte-identical copy of `paper-a.pdf` under a different filename. |
| `paper-b.pdf` | A *different* PDF. |
| `paper-a.notes.json` | Produced by `#btnSaveNotes` while `paper-a.pdf` is active, with at least 5 notes including one screenshot and one generated image. |
| `broken.notes.json` | `paper-a.notes.json` truncated mid-object (invalid JSON). |
| `empty.notes.json` | `{"app":"Source-Linked AI Reading Workspace","schema":1,"annotations":[]}` |
| `noarray.notes.json` | `{"app":"Source-Linked AI Reading Workspace","schema":1,"annotations":"nope"}` |
| `huge.notes.json` | `paper-a.notes.json` with the annotation array duplicated to ~3000 entries. |
| `~/qa-notes/` | An empty local folder used as the sync folder. |
| `~/qa-notes-drive/` | A second folder, ideally inside a Google Drive / Dropbox synced tree. |

**Reset recipes** (referred to by name below):

- **Clean profile** — DevTools → Application → Storage → *Clear site data*, then reload `/app.html`.
- **Reset the save tip** — console: `localStorage.removeItem('srw_saveas_tip')`, then reload.
- **Revoke folder access** — Chrome: padlock/tune icon left of the URL → *Site settings* → reset **File editing**. Then reload.
- **Inspect state** — console: `JSON.parse(localStorage.getItem('srw_state_v1'))`.
- **Inspect assets** — DevTools → Application → IndexedDB → `srw_assets` → `assets`.

---

## 1. The localStorage state key and the debounced save

### STOR-001 - The one and only state key is `srw_state_v1`
**P0** * State * `src/app.js:37 LS`, `src/app.js:151 save()`

- **Pre:** Clean profile.
- **Steps:**
  1. Load `/app.html`, wait for the sample to render.
  2. Highlight any sentence to create a note.
  3. DevTools → Application → Local Storage → the app origin. List every key.
- **Expect:** Exactly one key holds app state: `srw_state_v1`. Its value parses as JSON with top-level `settings`, `annotations`, `docs`, `ui`, `seeded`. No second state key, no per-document keys, no key holding a base64 image.
- **Watch:** A new feature that adds its own `localStorage` key bypasses export, import and the shared-bundle read-only guard — the data then silently fails to travel with the notes file.

### STOR-002 - A change is written after ~250 ms, not immediately
**P1** * State * `src/app.js:150-167 save()`

- **Pre:** Sample loaded. Console open.
- **Steps:**
  1. Run `const before = localStorage.getItem('srw_state_v1').length`.
  2. Create a note, and within ~100 ms read `localStorage.getItem('srw_state_v1').length` again.
  3. Wait 1 s and read once more.
- **Expect:** At step 2 the stored blob is usually still the old one (the write is on a `setTimeout(…, 250)`); by step 3 it has grown and contains the new annotation.
- **Watch:** Removing the debounce turns every keystroke in a note editor into a full `JSON.stringify` of the whole state — the typing lag is immediately visible on a 200-note document.

### STOR-003 - Rapid successive changes collapse into a single write
**P1** * Perf * `src/app.js:153 clearTimeout(saveT)`

- **Pre:** Sample loaded. In DevTools, add a `localStorage.setItem` breakpoint or wrap it: `const _s = Storage.prototype.setItem; let n = 0; Storage.prototype.setItem = function(){ n++; return _s.apply(this, arguments); };`
- **Steps:**
  1. Reset `n = 0`.
  2. Type 30 characters quickly into an inline note edit box (or click the page-next button 10 times rapidly).
  3. Wait 1 s, then read `n`.
- **Expect:** `n` is small (1-3), not one per keystroke/click. Every intermediate change is still present in the final blob.
- **Watch:** `clearTimeout(saveT)` uses one module-level timer, so a *different* caller's pending save is also cancelled and replaced — correct, but it means a save can be postponed indefinitely under continuous activity. Confirm the write does land once activity stops.

### STOR-004 - Everything survives a reload
**P0** * State * `src/app.js:74 loadState()`, `src/app.js:3303 boot()`

- **Pre:** Clean profile.
- **Steps:**
  1. Open `paper-a.pdf`, create a highlight note, a comment pin, and one screenshot note.
  2. Change zoom, switch to "Sorted by page ▾", collapse the right panel, set the filter to something other than "All".
  3. Wait 2 s, then hard-reload.
- **Expect:** All three notes return with their text, page numbers and anchors; zoom, sort label, collapsed panel and filter are all restored; the active document is still `paper-a.pdf`, not the sample.
- **Watch:** Reloading *within* the 250 ms debounce window loses the last change. Always wait ~1 s before reloading in any persistence check, or you will file a phantom bug.

### STOR-005 - Corrupt JSON in the state key falls back to defaults instead of white-screening
**P0** * Edge * `src/app.js:74 loadState()`

- **Pre:** Any state.
- **Steps:**
  1. Console: `localStorage.setItem('srw_state_v1','not json at all')`.
  2. Reload.
- **Expect:** The app boots into a usable shell: the bundled sample "BERT — Devlin et al. 2019 (NAACL).pdf" is in the library and renders, the storage meter populates, no blank page and no uncaught exception in the console.
- **Watch:** `loadState()` swallows the parse error and returns `null`, so `defaultState()` is used — but the corrupt blob is silently *overwritten* on the next save. The user's data is gone with no warning; log this as expected-but-lossy behaviour.

### STOR-006 - A state blob missing `settings` must still boot
**P0** * Edge * `src/app.js:76 migrateState()`, `src/app.js:3306 boot()`

- **Pre:** Any state.
- **Steps:**
  1. Console: `localStorage.setItem('srw_state_v1','{}')` and reload.
  2. Repeat with `localStorage.setItem('srw_state_v1','{"docs":"nope","ui":null}')`.
- **Expect:** Both times a usable shell appears — library with the sample, Home view, storage meter populated, reader rendering.
- **Watch:** `migrateState()` guards every settings migration with `if (s.settings && …)` but **never creates `s.settings` when it is missing** (`src/app.js:91-114`). `boot()` then reads `state.settings.actorName` at `src/app.js:3306` and `storageCfg()` writes `state.settings.storage` at `src/app.js:2265`. A settings-less blob therefore throws `TypeError: Cannot read properties of undefined` and white-screens. This is the highest-value check in section 1 — run it on every release.

### STOR-007 - A state blob with `annotations` missing or not an array
**P1** * Edge * `src/app.js:76 migrateState()`, `src/app.js:2634 clearActiveNotes()`

- **Pre:** A working state with notes.
- **Steps:**
  1. Console: read the state, `delete st.annotations`, write it back, reload.
  2. Repeat with `st.annotations = "x"`.
- **Expect:** The app boots and the notes panel shows its empty state; the footer counter reads "0 notes". Creating a new note works afterwards.
- **Watch:** `migrateState()` normalises `docs` (`src/app.js:79`) but not `annotations` — it only iterates `(s.annotations || [])` at line 116. `render()`, `renumber()` and `save()`'s `for (const a of light.annotations)` (`src/app.js:157`) all assume an array. A string value passes `||` and breaks the first iteration.

### STOR-008 - The saved blob never contains an API key in plain sight by accident
**P1** * State * `src/app.js:56-65 defaultState()`, `src/app.js:2825-2826`

- **Pre:** Settings → AI & Tools → paste a dummy key `sk-or-qa-TESTKEY` into the OpenRouter field → Save.
- **Steps:**
  1. Console: `localStorage.getItem('srw_state_v1').includes('sk-or-qa-TESTKEY')`.
  2. Now use `#btnSaveNotes` to save `paper-a.notes.json` and open it in a text editor; search for `TESTKEY`.
- **Expect:** Step 1 is `true` — keys are deliberately stored in this browser under `settings.keys`. Step 2 must find **nothing**: `docNotesJSON()` (`src/app.js:2271`) serialises only `document` + `annotations`, never `settings`.
- **Watch:** Any change that widens the export to "the whole state" leaks the key into every shared notes file. Treat a hit in step 2 as S1.

### STOR-009 - `save()` is a no-op in a read-only shared bundle
**P0** * State * `src/app.js:152 save()`, `src/app.js:43 READONLY`

- **Pre:** A `paper-a.annotated.html` produced by "Share as HTML". Note the current `srw_state_v1` length on the app origin.
- **Steps:**
  1. Open the `.annotated.html` file **from the same origin** (serve it from the same static server so it shares storage).
  2. Click around: switch pages, zoom, use the filter popover, sort by page.
  3. Read `localStorage.getItem('srw_state_v1')`.
- **Expect:** The blob is byte-identical to before. The read-only viewer never mutates the host app's saved state.
- **Watch:** `save()` returns at its first line when `READONLY`, but callers still mutate the in-memory `state`. If a future change moves the READONLY guard deeper (e.g. inside the timeout), the bundle will overwrite the real library. That is S1 data loss.

### STOR-010 - Two tabs open on the same origin: last write wins, silently
**P1** * Edge * `src/app.js:151 save()`

- **Pre:** Clean profile, sample loaded.
- **Steps:**
  1. Open `/app.html` in tab A and tab B.
  2. In tab A create a note named "FROM A". Wait 1 s.
  3. In tab B (which never saw A's note) create a note named "FROM B". Wait 1 s.
  4. Reload both tabs.
- **Expect:** Both tabs show the same state — whichever tab saved last. "FROM A" is gone.
- **Watch:** There is no `storage` event listener and no merge, so this loss is by design today. The check exists so that if multi-tab reconciliation is ever added, the expectation flips and the regression is caught. Never ship a change that makes this *worse* (e.g. saving on an interval from a background tab).

### STOR-011 - Notes for a trashed document survive in the blob
**P2** * State * `src/app.js:333 trashDoc()`, `src/app.js:151 save()`

- **Pre:** `paper-a.pdf` open with 3 notes.
- **Steps:**
  1. Trash `paper-a.pdf` from the library row's trash button.
  2. Console: count `JSON.parse(localStorage.getItem('srw_state_v1')).annotations.length`.
  3. Restore it from Trash.
- **Expect:** The count is unchanged after trashing (soft delete keeps annotations); after restore all 3 notes are back in the panel with their original text and anchors.
- **Watch:** Trashing is soft; only `purgeDoc()` (`src/app.js:346`) drops annotations. A change that prunes on trash makes Restore a lie.

### STOR-012 - Purging a document removes its notes and its PDF bytes
**P1** * State * `src/app.js:346 purgeDoc()`, `src/app.js:134 idbDel()`

- **Pre:** `paper-a.pdf` in Trash with 3 notes. Note its `pdf:<id>` entry in IndexedDB → `srw_assets` → `assets`.
- **Steps:**
  1. In the Trash view, click the "Delete forever" action on the row and confirm the dialog.
  2. Re-inspect `srw_state_v1` and the `assets` store.
- **Expect:** The doc is gone from `docs`, its annotations are gone from `annotations`, and the `pdf:<id>` record is gone from IndexedDB.
- **Watch:** `idbDel()` is fire-and-forget with no `await` and no error handling; if the IndexedDB connection failed to open (`_idb === null`), the PDF bytes are orphaned forever and keep counting against the quota. Compare the storage meter before and after a reload.

### STOR-013 - Purging does not delete the annotations' offloaded images
**P2** * Edge * `src/app.js:346 purgeDoc()`, `src/app.js:158-159 save()`

- **Pre:** A document with 2 screenshot notes and 1 generated image, saved and reloaded once (so `shot:` / `img:` records exist in IndexedDB).
- **Steps:**
  1. Record the `shot:*` and `img:*` keys in `srw_assets` → `assets`.
  2. Purge the document permanently.
  3. Re-inspect the store.
- **Expect:** Document today's behaviour precisely. `idbDel()` is only ever called for `pdf:<id>` (`src/app.js:353`) — the `shot:` and `img:` records survive as orphans.
- **Watch:** This is a genuine leak: every deleted screenshot keeps its base64 payload in IndexedDB forever, and the storage meter keeps counting it. On a heavy user this grows without bound. File it as P2 unless the meter shows > 100 MB of orphans.

---

## 2. State migration on upgrade

> All checks in this section: paste the doctored state into the console, reload, then verify. Use
> `const st = JSON.parse(localStorage.getItem('srw_state_v1')); /* edit st */ localStorage.setItem('srw_state_v1', JSON.stringify(st)); location.reload();`

### STOR-014 - A state with no `docs` array gets the sample back
**P1** * Regression * `src/app.js:79-82 migrateState()`

- **Pre:** Working state.
- **Steps:**
  1. Set `st.docs = undefined` (or `"nope"`), leave `st.sampleDismissed` unset, reload.
- **Expect:** The library shows exactly one row, "BERT — Devlin et al. 2019 (NAACL).pdf", and it is active and rendering.
- **Watch:** The re-add is `unshift`, so the sample must land at the *top* of the list, not the bottom.

### STOR-015 - A removed sample stays removed across reloads
**P0** * Regression * `src/app.js:82 migrateState()`, `src/app.js:336 trashDoc()`

- **Pre:** Clean profile.
- **Steps:**
  1. Trash the bundled sample.
  2. Reload three times.
- **Expect:** The sample never reappears in My Library. `st.sampleDismissed` is `true` in the stored blob.
- **Watch:** The sample is auto-added on *every* load unless `sampleDismissed` is set. Losing that flag (e.g. by a migration that rebuilds `docs`) resurrects the sample on every reload — a loud, obvious regression that has bitten before.

### STOR-016 - A stale `ui.activeDoc` pointing at a missing or trashed document is repaired
**P0** * Regression * `src/app.js:83 migrateState()`

- **Pre:** `paper-a.pdf` + the sample in the library.
- **Steps:**
  1. Set `st.ui.activeDoc = 'doc_doesnotexist'`, reload.
  2. Set `st.ui.activeDoc` to a document whose `trashed` is `true`, reload.
- **Expect:** Both times the app opens the first non-trashed document and renders it; no "Document not found." toast on boot, no empty reader.
- **Watch:** The repair picks `s.docs.find(d => !d.trashed)` — with an entirely trashed library it becomes `null` and `boot()` must reach `showEmptyReader()` (`src/app.js:3197`) rather than throwing.

### STOR-017 - The retired `text` tool migrates to `cursor`
**P2** * Regression * `src/app.js:85 migrateState()`

- **Pre:** Working state.
- **Steps:**
  1. Set `st.ui.tool = 'text'`, reload.
- **Expect:** The Select tool (`#toolCursor`, tooltip "Select") is the active tool; no phantom fifth tool button, no tool appears active-but-unusable.

### STOR-018 - Continuous scroll is turned on once, then respects the user
**P1** * Regression * `src/app.js:86 migrateState()`

- **Pre:** Working state.
- **Steps:**
  1. Set `st.ui.continuous = false` and `delete st.ui._contDefaulted`, reload → observe.
  2. Now turn continuous scroll **off** with `#btnContinuous`, reload → observe.
- **Expect:** Step 1 forces continuous **on** (the one-time default) and sets `_contDefaulted`. Step 2's manual "off" survives the reload.
- **Watch:** If `_contDefaulted` is ever dropped or renamed, every reload re-forces continuous mode on and the toggle appears broken.

### STOR-019 - Tools are enabled once, then respect the user
**P1** * Regression * `src/app.js:88 migrateState()`

- **Pre:** Working state.
- **Steps:**
  1. Set `st.settings.enableVisuals = false`, `st.settings.enableWeb = false`, `delete st.settings._toolsDefaulted`, reload → open Settings → AI & Tools.
  2. Turn both toggles off, Save, reload → reopen Settings.
- **Expect:** Step 1 shows both "Enable generated visuals" and "Allow external web search (changes provenance to “Used web search”)" switched **on**. Step 2's off state survives.

### STOR-020 - Missing `settings.storage` is created as browser mode
**P1** * Regression * `src/app.js:91 migrateState()`, `src/app.js:2265 storageCfg()`

- **Pre:** Working state.
- **Steps:**
  1. `delete st.settings.storage`, reload.
  2. Open Settings → Storage.
- **Expect:** The pane shows the "Choose folder…" button (browser mode), not the "Notes sync to 📁 …" row. The stored blob now has `settings.storage = {mode:'browser', folderName:''}`.

### STOR-021 - Missing `settings.prompts` is created as `{}`
**P2** * Regression * `src/app.js:92 migrateState()`, `src/app.js:110-113`

- **Pre:** Working state.
- **Steps:**
  1. `delete st.settings.prompts`, reload, open Settings → Templates.
- **Expect:** All prompt rows render with their default text and **no** "customized" badge on any row.

### STOR-022 - Legacy prompt keys fold into the current two
**P2** * Regression * `src/app.js:110-113 migrateState()`

- **Pre:** Working state.
- **Steps:**
  1. Set `st.settings.prompts = { answer_direct: 'LEGACY-TEXT', visual_planner: 'LEGACY-IMAGE', diagram: 'LEGACY-DIAG' }`, reload.
  2. Open Settings → Templates and expand the text and image prompt rows.
- **Expect:** The text prompt contains `LEGACY-TEXT`, the image prompt contains `LEGACY-IMAGE`, both rows show the "customized" badge, and the keys `answer_direct`, `answer_agent`, `visual_planner`, `diagram` are all gone from the stored `settings.prompts`.
- **Watch:** `diagram` is deleted unconditionally at line 113 even though `diagram` is a live prompt key today — an override stored under that name is discarded on the next load. Verify against `PROMPT_KEYS` and log a discrepancy.

### STOR-023 - Superseded default models are bumped, custom models are not
**P1** * Regression * `src/app.js:96-107 migrateState()`

- **Pre:** Working state.
- **Steps:**
  1. Set `st.settings.models.openrouter = 'openai/gpt-5.4-mini'` and `st.settings.models.compat = 'gpt-5.4-mini'`, reload → Settings → AI & Tools.
  2. Set `st.settings.models.openrouter = 'anthropic/my-custom-model'`, reload → Settings.
  3. Set `st.settings.models.openrouterImage = 'x-ai/grok-imagine-image-quality'`, reload → Settings.
- **Expect:** Step 1 shows `openai/gpt-5.4` and `gpt-5.4`. Step 2 still shows `anthropic/my-custom-model` untouched. Step 3 shows `google/gemini-3.1-flash-lite-image`.
- **Watch:** The bump list is a hard-coded set of exact strings. Bumping `DEFAULT_MODELS` without adding the old value to the migration leaves every existing install on the retired model — invisible until the provider 404s.

### STOR-024 - An unknown provider is forced back to OpenRouter
**P1** * Regression * `src/app.js:108-109 migrateState()`

- **Pre:** Working state.
- **Steps:**
  1. Set `st.settings.provider = 'anthropic'`, reload → Settings → AI & Tools.
  2. Select "OpenAI-compatible API" as Default, Save, reload → Settings.
- **Expect:** Step 1 shows the "Default" radio on the OpenRouter row. Step 2's compat choice survives the reload (the `_orDefaulted` flag means the one-time force runs only once).

### STOR-025 - The old sample filenames are renamed in place
**P2** * Regression * `src/app.js:115 migrateState()`

- **Pre:** Working state with the sample present.
- **Steps:**
  1. Set the `sample` doc's `name` to `Turbulence_review.pdf`, reload.
  2. Repeat with `NIPS-2017-attention-is-all-you-need-Paper.pdf`.
- **Expect:** Both times the library row reads "BERT — Devlin et al. 2019 (NAACL).pdf" (the em dash and spacing exactly as in `SAMPLE_DOC_NAME`, `src/app.js:38`).

### STOR-026 - Legacy annotations with no `doc` land on the sample
**P1** * Regression * `src/app.js:116 migrateState()`, `src/app.js:193 docIdOf()`

- **Pre:** Working state with sample notes.
- **Steps:**
  1. Set every annotation's `doc` to `undefined`, reload.
  2. Repeat with `doc: 'Turbulence_review.pdf'`.
- **Expect:** Both times all notes appear in the notes panel while the sample is active, with the footer counter matching the array length, and they disappear when you switch to another document.

---

## 3. IndexedDB asset offloading and rehydration

### STOR-027 - The `srw_assets` database and `assets` store exist after boot
**P0** * State * `src/app.js:123 idbOpen()`, `src/app.js:3319 boot()`

- **Pre:** Clean profile.
- **Steps:**
  1. Load `/app.html` and wait for the first render.
  2. DevTools → Application → IndexedDB.
- **Expect:** A database `srw_assets` at version 1 containing one object store named `assets`.
- **Watch:** `idbOpen()` resolves `null` on error and every later `idbPut`/`idbGet` silently no-ops. The app *looks* fine until the next reload, when images vanish — see STOR-033.

### STOR-028 - A screenshot is offloaded to IndexedDB and replaced by `"@idb"`
**P0** * State * `src/app.js:156-160 save()`, `src/app.js:133 idbPut()`

- **Pre:** Sample loaded.
- **Steps:**
  1. Use the "Screenshot region" tool to capture a figure; a screenshot note appears with a thumbnail.
  2. Wait 2 s.
  3. Console: `JSON.parse(localStorage.getItem('srw_state_v1')).annotations.find(a=>a.screenshot).screenshot`.
  4. IndexedDB → `srw_assets` → `assets`: find the key `shot:<that annotation id>`.
- **Expect:** Step 3 returns exactly the string `"@idb"` — never a `data:` URL. Step 4 shows a record whose value starts with `data:image/png;base64,`.
- **Watch:** If the sentinel is written but the `idbPut` never lands, the image is unrecoverable. Always verify **both** halves.

### STOR-029 - A generated image on a message is offloaded under `img:<msgId>`
**P0** * State * `src/app.js:159 save()`

- **Pre:** A note whose AI reply produced a rendered image (Settings → "Enable generated visuals" on).
- **Steps:**
  1. Wait 2 s after the image appears.
  2. Console: inspect that message object in `srw_state_v1`.
  3. IndexedDB: look for `img:<message id>`.
- **Expect:** `m.image === "@idb"` in localStorage; the base64 payload lives under `img:<message id>` in `assets`.

### STOR-030 - The in-memory state keeps the real image while localStorage holds the sentinel
**P1** * State * `src/app.js:156 save()`

- **Pre:** A screenshot note just created (do **not** reload).
- **Steps:**
  1. Wait 2 s so the save lands.
  2. Look at the note card in the notes panel and at the highlight overlay.
- **Expect:** The thumbnail is still visible and sharp — `save()` clones the state (`JSON.parse(JSON.stringify(state))`) and only mutates the clone, so the live objects still hold the data URL.
- **Watch:** A "optimisation" that drops the clone and mutates `state` directly makes every image blank the moment the debounce fires, without a reload. Very easy to miss in a quick smoke test.

### STOR-031 - Images rehydrate on reload
**P0** * Functional * `src/app.js:144 rehydrateAssets()`, `src/app.js:3319 boot()`

- **Pre:** A document with 1 screenshot note and 1 generated-image message. Wait 2 s.
- **Steps:**
  1. Hard-reload.
  2. Inspect the notes panel and expand the message.
- **Expect:** Both images render exactly as before — no broken-image icon, no empty box, no literal text "@idb" anywhere on screen.
- **Watch:** `rehydrateAssets()` is awaited *before* `wire()` but after `idbOpen()`. Moving either call, or making rehydration non-blocking, produces a first paint with missing images that then pop in — or never do.

### STOR-032 - Rehydration scales: many images do not stall the boot
**P1** * Perf * `src/app.js:144 rehydrateAssets()`

- **Pre:** A document with 25+ screenshot notes (capture repeatedly, or duplicate annotations in the state blob and put matching `shot:` records in IndexedDB).
- **Steps:**
  1. Hard-reload with the Performance panel recording.
- **Expect:** The reader is interactive within a few seconds; images appear with the first notes render.
- **Watch:** `rehydrateAssets()` awaits **one `idbGet` at a time** in a serial `for` loop. With 200 images the boot blocks visibly. Measure and log the time from navigation to first paint of page 1.

### STOR-033 - IndexedDB unavailable: images are destroyed, not just hidden
**P0** * Edge * `src/app.js:123 idbOpen()`, `src/app.js:158 save()`, `src/app.js:144 rehydrateAssets()`

- **Pre:** Clean profile. Break IndexedDB before the app loads — e.g. Firefox private window with `dom.indexedDB.enabled=false`, or in Chrome DevTools set a breakpoint and force `_idb = null` right after `idbOpen()`.
- **Steps:**
  1. Load the app with IndexedDB broken.
  2. Create a screenshot note. Confirm the thumbnail renders.
  3. Wait 2 s and inspect `srw_state_v1`.
  4. Reload.
- **Expect:** Document today's behaviour exactly. At step 3 `screenshot` is `"@idb"`; at step 4 the note renders with **no image** and cannot recover it.
- **Watch:** `idbPut()` swallows its failure and `save()` sets the sentinel unconditionally — the sentinel is written even when the payload was never stored. This is silent, unrecoverable data loss whenever IndexedDB is unavailable (private modes, storage-blocked contexts, quota-evicted origins). Treat a reproduction as S1 and file it; the fix is to only set `"@idb"` after a confirmed write.

### STOR-034 - Rehydration of a missing record leaves `null`, not the literal `"@idb"`
**P1** * Edge * `src/app.js:146-147 rehydrateAssets()`, `src/app.js:135 idbGet()`

- **Pre:** A note with an offloaded screenshot. In IndexedDB, delete its `shot:<id>` record by hand.
- **Steps:**
  1. Reload.
  2. Inspect the note card, then run `#btnSaveNotes` and open the resulting JSON.
- **Expect:** The card shows no image and no broken-image glyph. The exported JSON has `"screenshot": null` — **never** the string `"@idb"`.
- **Watch:** `idbGet()` resolves `null` on a miss, and `rehydrateAssets()` assigns it straight through. If instead you see `"@idb"` in a saved file, rehydration did not run at all (a boot-order regression) — that is S2 because the shared file is broken for the recipient.

### STOR-035 - A user PDF's bytes live in IndexedDB under `pdf:<id>`
**P0** * State * `src/app.js:242 openPdfFile()`, `src/app.js:196 loadDocBytes()`

- **Pre:** Clean profile.
- **Steps:**
  1. Open `paper-a.pdf` via "Open PDF or bundle".
  2. IndexedDB → `srw_assets` → `assets`: find `pdf:<docId>` matching the new entry in `state.docs`.
  3. Reload and confirm the paper still renders.
- **Expect:** A `pdf:` record exists whose byte length matches the file; after reload the document renders from IndexedDB with no re-pick.
- **Watch:** The PDF bytes must **never** appear in `srw_state_v1` — a 10 MB paper base64-ed into localStorage blows the ~5 MB quota instantly.

### STOR-036 - Deleting the `pdf:` record produces the fallback card, not a crash
**P1** * Edge * `src/app.js:196 loadDocBytes()`, `src/app.js:213 switchDoc()`

- **Pre:** `paper-a.pdf` in the library, `paper-b.pdf` also open (so switching is possible).
- **Steps:**
  1. Delete `pdf:<paper-a id>` from IndexedDB by hand.
  2. Switch to `paper-a.pdf` from the library tree.
- **Expect:** A reader fallback card appears reading `Could not load “paper-a.pdf”. Re-open it with New.` (with the document's real name). The library row, the notes panel and the rest of the shell stay interactive; `paper-a.pdf`'s notes are still listed.
- **Watch:** The copy says "Re-open it with New." while the button is now labelled "Open PDF or bundle" — a copy mismatch worth filing as P2.

### STOR-037 - Reopening the same PDF after eviction refreshes the bytes without duplicating
**P1** * Functional * `src/app.js:231-239 openPdfFile()`

- **Pre:** `paper-a.pdf` in the library with 3 notes. Delete its `pdf:` record from IndexedDB.
- **Steps:**
  1. Click "Open PDF or bundle" and pick `paper-a.pdf` again.
- **Expect:** A toast reads `Reopened paper-a.pdf — same paper, your notes are here.` (with the stored name). The library still has **one** row for it, the 3 notes are intact, and a `pdf:<same id>` record is back in IndexedDB.
- **Watch:** The de-dupe is by SHA-256 of the bytes, so `paper-a-renamed.pdf` must also hit this path and must not create a second row.

### STOR-038 - The folder handle is stored under `dir:notes`
**P1** * State * `src/app.js:2336 chooseNotesFolder()`, `src/app.js:2344 notesDirHandle()` * Chromium only

- **Pre:** Chrome/Edge, clean profile.
- **Steps:**
  1. Settings → Storage → "Choose folder…" → pick `~/qa-notes/`.
  2. IndexedDB → `srw_assets` → `assets` → inspect `dir:notes`.
- **Expect:** A record of type `FileSystemDirectoryHandle` (DevTools shows it as an object, not a string) with `name: "qa-notes"`.
- **Watch:** Handles are structured-cloneable but **not** serialisable to JSON — if a refactor ever routes this through `localStorage`, folder sync silently stops working after every reload.

### STOR-039 - Clearing site data resets everything to a first-run install
**P1** * State * `src/app.js:3303 boot()`

- **Pre:** A profile with several documents, notes, images, a chosen folder, and the save tip dismissed.
- **Steps:**
  1. DevTools → Application → Storage → *Clear site data*.
  2. Reload.
- **Expect:** The sample is back and seeded with its notes, the storage meter re-measures small, Settings → Storage shows "Choose folder…", and (on Firefox/Safari) the save tip is eligible to fire again.
- **Watch:** Anything that survives a *Clear site data* — a cookie, a Cache Storage entry, a service worker — is out of the documented storage model and must be filed.

---

## 4. Quota exhaustion and denied storage

### STOR-040 - localStorage quota exceeded shows the exact toast
**P0** * Copy * `src/app.js:163-166 save()`

- **Pre:** Sample loaded. Fill the origin's localStorage close to its limit, e.g. `try{let s='x'.repeat(1024*512); for(let i=0;i<12;i++) localStorage.setItem('qa_pad_'+i,s);}catch(e){}`
- **Steps:**
  1. Create a note (or type a long paragraph into one) so `save()` fires.
  2. Watch the toast area.
- **Expect:** An error-styled toast reads exactly:
  `Storage limit reached — export your notes to keep them.`
  (em dash, no period issues). It uses the `err` styling and stays ~6 s. The UI keeps working; no uncaught exception.
- **Watch:** The message is matched by `/quota|exceeded/i` against `e.name + e.message`. Safari throws `QuotaExceededError`, Firefox `NS_ERROR_DOM_QUOTA_REACHED` — **Firefox's name does not contain "quota" in the same case but does contain "QUOTA"**, so the `i` flag is load-bearing. Verify the toast actually appears in Firefox, not just Chrome.

### STOR-041 - Quota toast is not spammed once per keystroke
**P1** * Edge * `src/app.js:153 clearTimeout(saveT)`, `src/app.js:165`

- **Pre:** As STOR-040, localStorage full.
- **Steps:**
  1. Type continuously for 10 s in a note edit box.
- **Expect:** One toast per debounce window at most (roughly one every 250 ms of *idle*, not one per character). The toast stack never grows past a handful.
- **Watch:** If the debounce is removed, the screen fills with red toasts and the app becomes unusable — a fast, obvious regression.

### STOR-042 - A non-quota storage error stays silent
**P1** * Edge * `src/app.js:163-166 save()`

- **Pre:** An opaque-origin context that denies storage: open `/app.html` inside a sandboxed iframe (`<iframe sandbox="allow-scripts" src="/app.html">`), or a browser configured to block all site data.
- **Steps:**
  1. Interact so `save()` runs several times.
- **Expect:** **No** toast at all. `localStorage.setItem` throws `SecurityError`, which does not match `/quota|exceeded/i`, and the app carries on as an ephemeral preview.
- **Watch:** Broadening the regex to `catch-all` turns every sandboxed preview and every embed into a wall of red toasts.

### STOR-043 - Folder sync is skipped entirely when the localStorage write throws
**P1** * Edge * `src/app.js:161-162 save()` * Chromium only

- **Pre:** Chrome, folder sync enabled on `~/qa-notes/`, then fill localStorage as in STOR-040.
- **Steps:**
  1. Create a note. Wait 3 s.
  2. Inspect `~/qa-notes/paper-a.notes.json` — check the file's modified time and note count.
- **Expect:** Document today's behaviour precisely: `scheduleFolderSync()` sits **inside** the `try` block after `localStorage.setItem`, so a quota throw skips it and the folder copy is never updated.
- **Watch:** This is the worst combination — localStorage is full *and* the folder backup silently stops. The toast tells the user to "export your notes", which still works via the Save button, so verify that path manually as the escape hatch.

### STOR-044 - The Save button still works when storage is full
**P0** * Functional * `src/app.js:2607 saveNotesNow()`

- **Pre:** localStorage full (STOR-040) and the quota toast has fired.
- **Steps:**
  1. Click the Save button (`#btnSaveNotes`).
  2. Complete the Save As dialog (Chromium) or accept the download (Firefox/Safari).
- **Expect:** A complete `.notes.json` is written containing every current note. Saving does not depend on localStorage.
- **Watch:** The escape hatch the quota toast advertises must actually work; if this fails the user's only recovery path is gone.

### STOR-045 - IndexedDB quota exceeded while offloading an image
**P1** * Edge * `src/app.js:133 idbPut()`

- **Pre:** Chrome DevTools → Application → Storage → set a small custom quota (or fill IndexedDB with a large dummy database).
- **Steps:**
  1. Capture several large screenshots until the quota is hit.
  2. Reload.
- **Expect:** The app does not crash; the notes still exist as text/anchors. Images that failed to store are missing after the reload (see STOR-033).
- **Watch:** `idbPut()` is a bare `try/catch` around a non-awaited transaction — a `QuotaExceededError` raised on the transaction's `onerror` never reaches that catch at all. There is no toast for this path. Log the exact behaviour observed.

### STOR-046 - Browser-evicted origin storage recovers to a working app
**P1** * Edge * `src/app.js:3303 boot()`, `src/app.js:3325-3336`

- **Pre:** A library with `paper-a.pdf` active and notes.
- **Steps:**
  1. Simulate eviction: delete the whole `srw_assets` database but leave `srw_state_v1` intact.
  2. Reload.
- **Expect:** The library still lists `paper-a.pdf` and its notes; the reader shows the fallback for the missing bytes and then, per `boot()`'s chain, falls back to another document or the sample if one is available. No white screen.
- **Watch:** `boot()` tries `state.ui.activeDoc` → any non-trashed doc → the sample → `showEmptyReader()`. Verify each rung by trashing documents one at a time.

### STOR-047 - Private/Incognito window degrades cleanly
**P1** * Edge * `src/app.js:74 loadState()`, `src/app.js:123 idbOpen()`

- **Pre:** A private/incognito window in Chrome, Firefox and Safari.
- **Steps:**
  1. Open `/app.html`, create a highlight note and a screenshot note.
  2. Reload within the same private session.
  3. Close the private window entirely, reopen it, load the app.
- **Expect:** Step 2 restores the notes (private sessions have their own storage). Step 3 starts fresh with the sample. No error toasts beyond what STOR-033/STOR-042 document.
- **Watch:** Safari's private mode historically threw on `localStorage.setItem`; verify STOR-042's silence there rather than a toast storm.

---

## 5. The storage meter

### STOR-048 - The meter's initial copy is "Calculating…"
**P2** * Copy * `app.html:39`, `src/app.js:396 updateStorage()`

- **Pre:** Throttle the network to Slow 3G, or set a breakpoint inside `updateStorage()`.
- **Steps:**
  1. Reload and watch the sidebar Storage block before the estimate resolves.
- **Expect:** The text under the bar reads exactly "Calculating…" (with a horizontal-ellipsis character, not three periods), and the bar renders at its 4% inline default.
- **Watch:** If `navigator.storage.estimate()` never settles, "Calculating…" is permanent — there is no timeout.

### STOR-049 - The meter shows "<usage> of <quota>" once resolved
**P1** * Copy * `src/app.js:400-403 updateStorage()`

- **Pre:** Chrome with the sample loaded.
- **Steps:**
  1. Read the storage text after boot.
- **Expect:** Two sizes joined by " of ", e.g. "3 MB of 12 GB". Units follow `fmt()`: `GB` with one decimal above 1 GiB, whole `MB` above 1 MiB, otherwise whole `KB` with a floor of 1.
- **Watch:** `fmt` uses `toFixed(0)` for MB, so 1.9 MB displays as "2 MB". A change to decimals here is a copy regression.

### STOR-050 - The bar width tracks the usage ratio and never collapses to zero
**P2** * Visual * `src/app.js:403 updateStorage()`, `src/styles.css:84-85`

- **Pre:** Any state.
- **Steps:**
  1. Inspect `#storageBar` in the Elements panel and read its inline `width`.
- **Expect:** A percentage of at least `2%` (the floor), capped at `100%`, rendered as a blue fill inside a 6 px rounded grey track.
- **Watch:** With a huge quota the true ratio rounds to 0 — the `Math.max(2, …)` floor is what keeps a visible sliver. Losing it makes the meter look broken on every fresh install.

### STOR-051 - Opening a large PDF visibly grows the meter
**P1** * Functional * `src/app.js:246 openPdfFile()`, `src/app.js:396 updateStorage()`

- **Pre:** Note the current storage text.
- **Steps:**
  1. Open a PDF of 20 MB or more.
  2. Read the storage text after the toast appears.
- **Expect:** The usage figure has grown by roughly the file size; `updateStorage()` is called explicitly after the open (`src/app.js:246`).
- **Watch:** `navigator.storage.estimate()` is cached/quantised by the browser and can lag; re-read after a reload before filing.

### STOR-052 - The meter falls back to a document count where `storage.estimate` is missing
**P2** * Copy * `src/app.js:407 updateStorage()`

- **Pre:** A browser without `navigator.storage.estimate` (older Safari), or stub it: `Object.defineProperty(navigator,'storage',{value:undefined})` before boot.
- **Steps:**
  1. Reload with 3 non-trashed documents in the library.
- **Expect:** The text reads exactly "3 documents" — no bar update (the bar keeps its previous width), no "of", no units.
- **Watch:** There is no singular form: one document renders "1 documents". File as P2 copy.

### STOR-053 - The meter does not update after creating notes
**P2** * Edge * `src/app.js:396 updateStorage()` call sites

- **Pre:** Any state; note the storage text.
- **Steps:**
  1. Create 10 screenshot notes. Wait 5 s.
  2. Read the storage text without reloading.
  3. Reload and read it again.
- **Expect:** Document today's behaviour: the text is unchanged at step 2 and only re-measures at step 3. `updateStorage()` is called from exactly five places — `openPdfFile()` ×2 (`src/app.js:236, 246`), `importSharedHTML()` (`306`), `purgeDoc()` (`355`) and `boot()` (`3331`).
- **Watch:** This is why the quota toast can appear while the meter still reads "2 MB of 12 GB". Confusing, but current behaviour — do not "fix" it by calling `updateStorage()` inside `save()` (an async estimate on every keystroke).

### STOR-054 - Trashing or restoring a document does not re-measure
**P2** * Edge * `src/app.js:333 trashDoc()`, `src/app.js:340 restoreDoc()`

- **Pre:** The document-count fallback active (STOR-052), 3 documents.
- **Steps:**
  1. Trash one document and read the storage text.
  2. Reload and read it again.
- **Expect:** Step 1 still says "3 documents"; step 2 says "2 documents".
- **Watch:** Neither `trashDoc()` nor `restoreDoc()` calls `updateStorage()`. Only in the fallback form is the staleness visible.

### STOR-055 - The Storage block is hidden in a read-only shared file
**P1** * Visual * `src/app.js:3299 applyReadOnly()`, `src/styles.css:83`

- **Pre:** A `paper-a.annotated.html` opened directly.
- **Steps:**
  1. Look at the bottom of the left sidebar.
- **Expect:** The whole `.sb-storage` block — the word "Storage", the gear, the bar and the text — is hidden. No orphaned hairline border, no empty gap at the sidebar's foot.
- **Watch:** It is hidden with an inline `display:none` on the element while `.sb-storage` carries `margin-top:auto`; the tree above it must expand to fill.

---

## 6. The Save button, native Save As, and the download fallback

### STOR-056 - The Save button exists, is placed left of the filter, and has the exact tooltip
**P0** * Copy * `src/app.js:2622-2632 injectNotesButtons()`

- **Pre:** App loaded normally (not read-only).
- **Steps:**
  1. Look at the notes-panel header row.
  2. Hover each injected icon button in turn.
- **Expect:** Left-to-right before `#btnFilter`: a floppy/save glyph (`#btnSaveNotes`) with tooltip exactly "Save notes (JSON; auto-saves to your folder when one is set)", an import glyph (`#btnImportNotes`) with "Import notes from a JSON file", a PDF glyph (`#btnExportPdf`) with "Export annotations to PDF". Next to the collapse chevron, a trash glyph (`#btnClearNotes`) with "Delete all notes for this document".
- **Watch:** `injectNotesButtons()` also *removes* `#btnExportTop` and `#btnNotesMenu` from `app.html` (`src/app.js:2621`). If either "⋯" or "⋮" is still visible, injection did not run.

### STOR-057 - Save writes a valid `.notes.json` with the expected top-level shape
**P0** * Functional * `src/app.js:2607 saveNotesNow()`, `src/app.js:2271 docNotesJSON()`

- **Pre:** `paper-a.pdf` active with 5 notes. Browser storage mode (no folder set).
- **Steps:**
  1. Click `#btnSaveNotes`.
  2. Complete the dialog / download.
  3. Open the file in a text editor.
- **Expect:** Pretty-printed JSON (2-space indent) with `"app": "Source-Linked AI Reading Workspace"`, `"schema": 1`, an ISO `exportedAt`, `"document": { "id": …, "sha256": …, "name": "paper-a.pdf" }`, `"noteCount": 5`, and an `annotations` array of length 5.
- **Watch:** `noteCount` and `annotations.length` are computed from the same array — a mismatch means a mutation slipped in between and is worth investigating.

### STOR-058 - The suggested filename is derived and sanitised from the document name
**P1** * Functional * `src/app.js:2266 notesFileName()`

- **Pre:** A document each named `paper-a.pdf`, `My Paper (v2).pdf`, `研究ノート.pdf`, and one whose name is `.pdf` alone.
- **Steps:**
  1. For each, click Save and read the filename the dialog/download proposes.
- **Expect:** `paper-a.notes.json`; `My Paper _v2_.notes.json` (parentheses become underscores, spaces survive); the CJK name collapses to underscores plus `.notes.json`; the bare `.pdf` yields `document.notes.json`.
- **Watch:** The regex is `[^\w.\- ]+` → `_`, and `\w` is ASCII-only, so every non-Latin title reduces to underscores. Two differently-named CJK papers can therefore collide on the same filename in a sync folder — a real overwrite risk. Verify and file.

### STOR-059 - Chromium: Save pops a native Save As dialog
**P0** * Functional * `src/app.js:2503 saveAsFile()` * Chromium only

- **Pre:** Chrome or Edge, browser storage mode, no folder set.
- **Steps:**
  1. Click `#btnSaveNotes`.
- **Expect:** The **OS** file-save dialog appears (not a browser download bar), pre-filled with `paper-a.notes.json`, filtered to a type described as "Notes JSON" / `.json`, and opened in the Documents location on first use.
- **Watch:** `showSaveFilePicker` requires a user gesture and a secure context. On `http://` (non-localhost) it does not exist at all and the code silently takes the fallback — test on `localhost` or HTTPS.

### STOR-060 - Chromium: choosing an existing file overwrites it in place
**P0** * Functional * `src/app.js:2514-2518 saveAsFile()` * Chromium only

- **Pre:** `~/qa-notes/paper-a.notes.json` already exists (an older save with 2 notes). Now have 5 notes in the app.
- **Steps:**
  1. Click Save, navigate to `~/qa-notes/`, select the existing `paper-a.notes.json`, confirm the OS "replace?" prompt.
  2. Inspect the folder.
- **Expect:** Exactly **one** file, now containing 5 notes. No `paper-a.notes (1).json`. A toast reads `Saved paper-a.notes.json.` — the name comes from `handle.name`, so if the user renamed it in the dialog the toast shows the new name.
- **Watch:** The whole point of the Save As path is avoiding the browser's "(1)" duplication. If duplicates appear, the code fell through to `downloadNotesJSON()` — check whether `showSaveFilePicker` actually existed.

### STOR-061 - Chromium: cancelling the dialog saves nothing at all
**P0** * Edge * `src/app.js:2511-2513 saveAsFile()`, `src/app.js:2615 saveNotesNow()` * Chromium only

- **Pre:** Chrome. Nothing in the Downloads folder from this app.
- **Steps:**
  1. Click Save.
  2. Press Escape / click Cancel in the OS dialog.
  3. Check the Downloads folder and the toast area.
- **Expect:** **No file written anywhere**, **no download**, **no toast**, and the Save button does not flash. `saveAsFile()` returns `{status:'cancelled'}` on `AbortError` and `saveNotesNow()` returns immediately.
- **Watch:** The classic regression is treating cancel as "fallback" — the user then gets a surprise download into Downloads after explicitly cancelling. Test this on every release; it is cheap and it has broken before.

### STOR-062 - Chromium: no handle is remembered, so a second Save re-prompts
**P0** * Functional * `src/app.js:2497-2502 saveAsFile()` * Chromium only

- **Pre:** Chrome, browser storage mode. Complete one Save into `~/qa-notes/`.
- **Steps:**
  1. Create one more note.
  2. Click Save again.
- **Expect:** A **fresh** Save As dialog appears every time — pre-positioned in `~/qa-notes/` (the `id:'srw-save'` convenience) but still requiring an explicit confirm. There is never a silent write, and never a "Allow this site to edit files on every visit?" permission prompt on a later visit.
- **Watch:** Adding handle persistence would introduce exactly that recurring permission banner, which the code comment explicitly rejects. If you see a permission prompt from the Save button (not from the folder picker), a handle is being retained — file it.

### STOR-063 - Chromium: an unwritable destination downloads a copy instead
**P1** * Edge * `src/app.js:2519-2522 saveAsFile()` * Chromium only

- **Pre:** Chrome. A read-only directory, or eject/disconnect the destination volume between the picker closing and the write (easiest: pick a file on a removable drive, then unplug it before confirming).
- **Steps:**
  1. Force the `createWritable`/`write` to fail.
- **Expect:** An error toast beginning exactly `Couldn’t write there: ` (curly apostrophe) followed by the browser's message and ` — downloading a copy instead.`, and then a plain browser download of the same `.notes.json` lands in Downloads.
- **Watch:** Both halves must happen — a toast with no download loses the notes; a download with no toast leaves the user thinking it went where they picked.

### STOR-064 - Firefox/Safari: Save falls back to a plain download
**P0** * Functional * `src/app.js:2504 saveAsFile()`, `src/app.js:2524 downloadNotesJSON()` * Firefox/Safari only

- **Pre:** Firefox or Safari. `localStorage['srw_saveas_tip']` already `"1"` (so the tip does not interfere).
- **Steps:**
  1. Click `#btnSaveNotes`.
- **Expect:** No OS dialog. A file `paper-a.notes.json` downloads (to the configured download folder, or via the browser's own ask-where prompt if the user enabled it). A toast reads exactly `Downloaded paper-a.notes.json`.
- **Watch:** The toast text differs between the two paths on purpose — Chromium says `Saved <name>.`, the fallback says `Downloaded <name>`. Do not let a refactor collapse them; the wording is how a tester tells which path ran.

### STOR-065 - Repeated fallback saves pile up "(1)" copies
**P2** * Edge * `src/app.js:2524 downloadNotesJSON()` * Firefox/Safari only

- **Pre:** Firefox with the default "save files to Downloads" setting.
- **Steps:**
  1. Save three times in a row.
  2. Inspect the Downloads folder.
- **Expect:** `paper-a.notes.json`, `paper-a.notes(1).json`, `paper-a.notes(2).json` (browser-dependent naming). This is exactly the problem the one-time tip (section 7) tells the user how to avoid.
- **Watch:** Confirm the tip's copy still matches the real setting names in the current Firefox/Safari release — see STOR-072 and STOR-073.

### STOR-066 - Export failure surfaces a toast
**P1** * Copy * `src/app.js:2531 downloadNotesJSON()`

- **Pre:** Force `Blob` or `URL.createObjectURL` to throw (console: `URL.createObjectURL = () => { throw new Error('nope') }`), then take the fallback path.
- **Steps:**
  1. Click Save (Firefox/Safari, or after cancelling into fallback).
- **Expect:** An error toast beginning exactly `Could not export: ` followed by the error message. No silent failure.

### STOR-067 - The Save button's green "saved" flash
**P2** * Visual * `src/app.js:2602 flashSaved()`, `src/styles.css:119`

- **Pre:** Any successful save (folder, Save As, or download).
- **Steps:**
  1. Complete a save and watch `#btnSaveNotes` for ~1.5 s.
  2. In the Elements panel, confirm the class list during that window.
- **Expect:** The element gains the class `saved` for 1400 ms.
- **Watch:** The only rule for this is `.icon-btn.save-btn.saved` (`src/styles.css:119`), but `injectNotesButtons()` creates the button with `class="icon-btn"` only — there is **no** `save-btn` class anywhere in the codebase. The green confirmation therefore never renders today. Verify and file as P2 (missing feedback, not data loss); the fix is one class name.

### STOR-068 - Rapid double-click on Save does not double-write or stack dialogs
**P1** * Edge * `src/app.js:2607 saveNotesNow()`

- **Pre:** Chrome, browser storage mode.
- **Steps:**
  1. Double-click `#btnSaveNotes` as fast as possible.
- **Expect:** One dialog. If the browser rejects the second `showSaveFilePicker` (it requires a fresh gesture and refuses while one is open), the rejection is **not** an `AbortError`, so it returns `{status:'fallback'}` — meaning a surprise download may follow the picker. Document exactly what happens.
- **Watch:** `saveNotesNow()` has no in-flight guard. Any second call while a dialog is open is the most likely source of a phantom download in Downloads.

### STOR-069 - Saving with zero notes produces a valid empty file
**P1** * Edge * `src/app.js:2271 docNotesJSON()`, `src/app.js:2607 saveNotesNow()`

- **Pre:** A document with no notes (open `paper-b.pdf` fresh, or clear its notes).
- **Steps:**
  1. Click Save and complete it.
  2. Open the file.
- **Expect:** Valid JSON with `"noteCount": 0` and `"annotations": []`. No error, no "nothing to save" block — the Save button is never disabled.
- **Watch:** Importing this file later with the toolbar Import button **replaces** the target document's notes with nothing (see STOR-107). That combination is the single most dangerous data-loss path in the app.

### STOR-070 - Saving a very large notes set
**P1** * Perf * `src/app.js:2271 docNotesJSON()`, `src/app.js:2611`

- **Pre:** A document with 300+ notes including 20 screenshots (use `huge.notes.json` imported first).
- **Steps:**
  1. Click Save and time from click to the dialog appearing, and from confirm to the toast.
- **Expect:** The dialog appears promptly; the write completes without freezing the tab for more than ~2 s. The resulting file is tens of MB (images are inlined as data URLs).
- **Watch:** `docNotesJSON()` deep-clones every annotation with `JSON.parse(JSON.stringify(a))` per annotation *and* the whole thing is stringified with `null, 2` pretty-printing — both are synchronous and block the main thread.

### STOR-071 - There is no keyboard shortcut for Save
**P2** * Regression * `src/app.js:3124`

- **Pre:** App loaded, focus in the reader.
- **Steps:**
  1. Press Cmd/Ctrl+S.
- **Expect:** The **browser's** "Save page as" dialog appears — the app does not intercept it. Only Cmd/Ctrl+F is bound (to `openFind()`).
- **Watch:** If a Cmd/Ctrl+S binding is ever added, this check flips: it must call `saveNotesNow()` **and** `preventDefault()`, and must not fire while a text input has focus.

---

## 7. The one-time Firefox/Safari save tip

> Every check here needs **Reset the save tip** first: `localStorage.removeItem('srw_saveas_tip')` then reload.

### STOR-072 - The tip appears on the first fallback save in Firefox
**P0** * Copy * `src/app.js:2460 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Firefox. Save tip reset. Browser storage mode.
- **Steps:**
  1. Click `#btnSaveNotes`.
- **Expect:** A modal over a dark backdrop, max ~470 px wide, left-aligned, headed exactly:
  "Choose where your files save"
  Sub-copy exactly: `In **Firefox**, turn on one setting to pick where each download goes — and overwrite instead of piling up “(1)” copies.` (the browser name in bold, curly quotes around `(1)`, em dash).
  Then a numbered stepper: **1** "Open **Settings → General**", **2** "Scroll to **Files and Applications**", **3** "Turn on:" followed by an indigo setting card reading "Always ask you where to save files" with a filled indigo **toggle** mock on its right.
  A single primary button labelled "Got it".
- **Watch:** The three steps are joined by a vertical connector line drawn as an absolutely-positioned 2 px div; at the last step the line must be absent. The download itself still happens behind the modal — verify the file actually landed.

### STOR-073 - The Safari variant names the Safari setting
**P0** * Copy * `src/app.js:2465-2471 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Safari (macOS or iOS). Save tip reset.
- **Steps:**
  1. Click `#btnSaveNotes`.
- **Expect:** Same modal, but the sub-copy names **Safari**, the steps read **1** "Open **Settings → General**", **2** "Find **File download location**", **3** "Turn on:" with a setting card reading "Ask for each download" and — instead of a toggle — a bold indigo **✓** on the right.
- **Watch:** The UA sniff at `src/app.js:2465` requires `/safari/i` and excludes `chrome|chromium|crios|edg|edgios|android|opr\//`. Chrome on iOS (`crios`) and Edge on iOS (`edgios`) are excluded, so they get the generic variant — verify with STOR-074.

### STOR-074 - Any other non-Chromium browser gets the generic variant
**P1** * Copy * `src/app.js:2466, 2471 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** A browser that is neither Firefox nor Safari by the sniff *and* lacks `showSaveFilePicker`. Easiest: Chrome DevTools → Network conditions → custom UA `Mozilla/5.0 (X11; Linux x86_64) QAOtherBrowser/1.0`, and stub `delete window.showSaveFilePicker` before the click.
- **Steps:**
  1. Reset the tip, reload with the override, click Save.
- **Expect:** Sub-copy names "your browser"; a single step **1** "Open your browser’s **download settings**" (curly apostrophe), then **2** "Turn on:" with a card reading "Always ask where to save files" and a toggle mock.
- **Watch:** Note the wording differs between the three variants by more than the browser name — "Always ask **you** where to save files" (Firefox) vs "Always ask where to save files" (generic). Both are correct as written; a copy edit that unifies them is a regression against the real Firefox label.

### STOR-075 - The tip never appears in Chrome or Edge
**P0** * Functional * `src/app.js:2461 maybeShowSaveAsTip()` * Chromium only

- **Pre:** Chrome/Edge. Reset the tip. Confirm `'showSaveFilePicker' in window` is `true`.
- **Steps:**
  1. Click Save, then cancel the dialog.
  2. Click Save again and complete it.
  3. Check `localStorage.getItem('srw_saveas_tip')`.
- **Expect:** No tip modal at any point; `srw_saveas_tip` stays `null` — the key is only set inside `maybeShowSaveAsTip()`, which returns at its first line.
- **Watch:** Feature-detection, not UA sniffing, gates this. If a Chromium user ever sees the tip, `showSaveFilePicker` was missing — usually because the page is on plain `http://`.

### STOR-076 - The tip shows exactly once per device
**P0** * State * `src/app.js:2462, 2495 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Firefox. Reset the tip.
- **Steps:**
  1. Click Save → tip appears → dismiss with "Got it".
  2. Click Save again.
  3. Reload the page and click Save a third time.
  4. Inspect `localStorage['srw_saveas_tip']`.
- **Expect:** Only step 1 shows the tip. Steps 2 and 3 go straight to the download. The key holds the string `"1"`.
- **Watch:** The key is written at the **end** of `maybeShowSaveAsTip()`, synchronously, before the user dismisses — so even a hard-kill of the tab mid-modal marks it shown. Intentional; confirm it did not regress into "written on dismiss" (which would re-show after a crash).

### STOR-077 - The tip dismisses on "Got it", Escape, Enter and backdrop click
**P1** * Functional * `src/app.js:2490-2494 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Firefox. Reset the tip before each sub-case.
- **Steps:**
  1. Show the tip → click "Got it".
  2. Reset, show it → press Escape.
  3. Reset, show it → press Enter.
  4. Reset, show it → click the dark area outside the box.
  5. Reset, show it → click **inside** the box on a step badge.
- **Expect:** 1-4 all close the modal and remove the keydown listener. 5 does **not** close it (the mask handler checks `e.target === m`).
- **Watch:** The keydown listener is registered in the capture phase on `document`. If `done()` fails to remove it, subsequent Escape presses inside the app will be swallowed — test Escape on a note edit box afterwards.

### STOR-078 - The tip does not block the download that triggered it
**P0** * Functional * `src/app.js:2504 saveAsFile()` * Firefox/Safari only

- **Pre:** Firefox. Reset the tip. Empty the Downloads folder.
- **Steps:**
  1. Click Save. The tip appears.
  2. **Before** dismissing it, check the Downloads folder.
- **Expect:** `paper-a.notes.json` is already there — `maybeShowSaveAsTip()` is fire-and-forget and `saveAsFile()` returns `{status:'fallback'}` immediately, so `saveNotesNow()` proceeds to `downloadNotesJSON()`. The "Downloaded paper-a.notes.json" toast is visible behind/above the modal.
- **Watch:** If the tip ever becomes `await`-ed, the first save on Firefox will appear to do nothing until the user dismisses — a confusing regression.

### STOR-079 - The tip is suppressed in a read-only shared file
**P1** * Functional * `src/app.js:2461 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Firefox. Reset the tip. A `paper-a.annotated.html`.
- **Steps:**
  1. Open the shared file and interact with it.
- **Expect:** No tip. (`READONLY` short-circuits, and the Save button is hidden anyway by `applyReadOnly()`.) `srw_saveas_tip` is untouched.

### STOR-080 - A storage-denied context suppresses the tip entirely
**P1** * Edge * `src/app.js:2462 maybeShowSaveAsTip()`

- **Pre:** A context where `localStorage.getItem` throws (sandboxed iframe with `sandbox="allow-scripts"`), on a non-Chromium engine or with `showSaveFilePicker` stubbed away.
- **Steps:**
  1. Trigger a fallback save.
- **Expect:** No tip modal at all — the `try/catch` around the read `return`s on error rather than showing it.
- **Watch:** Deliberate: without storage the tip could never be marked as seen and would appear on every single save.

### STOR-081 - The tip is also the entry point from the Share-as-HTML export
**P1** * Functional * `src/app.js:2592 exportSelfContainedHTML()` * Firefox/Safari only

- **Pre:** Firefox. Reset the tip.
- **Steps:**
  1. Click "Share as HTML" in the left sidebar instead of Save.
- **Expect:** The same "Choose where your files save" modal appears once, the `.annotated.html` still downloads, and a later Save-notes click does **not** show the tip again (one key, shared).
- **Watch:** Both callers funnel through `saveAsFile()`, so the tip is genuinely once-per-device across features. Verify the order does not matter.

### STOR-082 - The tip renders correctly in dark/high-contrast and on a phone
**P2** * Visual * `src/app.js:2474-2488 maybeShowSaveAsTip()`

- **Pre:** Firefox/Safari at 390×844, and again with the OS in dark mode.
- **Steps:**
  1. Trigger the tip and inspect.
- **Expect:** The box fits within the viewport with the 20 px `.modal-mask` padding, the stepper is not clipped, the indigo setting card (`#EEF2FF` fill, `#C7D2FE` border, `#312E81` text) is legible, and "Got it" is reachable without scrolling the page behind it.
- **Watch:** The step markup uses hard-coded hex colours with `var(--text, #111827)` fallbacks. In a dark theme the card stays light-indigo by design — confirm the text inside it is still `#312E81` on `#EEF2FF` and therefore readable.

---

## 8. Folder sync via the File System Access API

### STOR-083 - Settings → Storage explains the model in browser mode
**P1** * Copy * `src/app.js:2789-2803 openSettings()`

- **Pre:** Chrome, browser storage mode.
- **Steps:**
  1. Settings → "Storage" tab.
- **Expect:** Label "Notes storage" and hint exactly: `Notes are always saved in this browser. Optionally sync a portable **.notes.json** to a folder (Chrome/Edge) — great for backups, other devices, and Google Drive. Export / Import works in any browser.` Below it a ghost button "Choose folder…", then a row with "Export notes (JSON)" and "Import notes (JSON)".
- **Watch:** The hint is the only place the Chrome/Edge limitation is stated in the app. Do not let a copy edit drop it.

### STOR-084 - Choosing a folder switches the pane to the connected state
**P0** * Functional * `src/app.js:2332 chooseNotesFolder()`, `src/app.js:2792-2797` * Chromium only

- **Pre:** Chrome, browser mode.
- **Steps:**
  1. Settings → Storage → "Choose folder…" → pick `~/qa-notes/` → allow "Edit files".
  2. Observe. Then reopen Settings → Storage.
- **Expect:** The Settings modal **closes** immediately (the picker handler calls `close()` on success). A toast reads exactly `Notes will auto-save to “qa-notes”.` (curly quotes). Reopening shows `Notes sync to 📁 **qa-notes**` with two link-style buttons "Change folder" and "Turn off" — and **no** "Choose folder…" button.
- **Watch:** The picker opens with `startIn:'documents'` and `id:'srw-notes'`, so it remembers the last folder per-id across visits. That is separate from the save picker's `srw-save` id.

### STOR-085 - The first write lands immediately on connect
**P0** * Functional * `src/app.js:2338 chooseNotesFolder()` * Chromium only

- **Pre:** `paper-a.pdf` active with 5 notes; `~/qa-notes/` empty.
- **Steps:**
  1. Connect `~/qa-notes/` as above.
  2. Inspect the folder.
- **Expect:** `paper-a.notes.json` exists with all 5 notes and the exact structure from STOR-057.
- **Watch:** `chooseNotesFolder()` `await`s the write but shows its success toast **regardless of the write's result** (`writeNotesToFolder` returns `false` silently when `interactive` is `false`). If the folder is read-only, the toast lies. Test with a read-only folder and file it.

### STOR-086 - The folder is remembered across reloads without re-picking
**P0** * State * `src/app.js:2336 idbPut('dir:notes')`, `src/app.js:2343 notesDirHandle()` * Chromium only

- **Pre:** Folder connected to `~/qa-notes/`.
- **Steps:**
  1. Reload the app.
  2. Settings → Storage.
- **Expect:** Still shows `Notes sync to 📁 qa-notes`. No picker on boot, no permission prompt on boot.
- **Watch:** Chrome may drop the `readwrite` grant between sessions. `notesDirHandle(false)` then returns `null` and background syncs silently stop while the UI still claims the folder is connected — see STOR-088.

### STOR-087 - Auto-sync fires ~1.75 s after the last change
**P0** * Functional * `src/app.js:2451 scheduleFolderSync()`, `src/app.js:162 save()` * Chromium only

- **Pre:** Folder connected, permission granted in this session (open a PDF first so the gesture-backed re-grant at `src/app.js:224` has run).
- **Steps:**
  1. Create a note.
  2. Watch `~/qa-notes/paper-a.notes.json`'s modified time and content over the next 3 s.
- **Expect:** The file updates once, roughly 1.75 s after the change (250 ms state debounce + 1500 ms folder debounce), containing the new note.
- **Watch:** The two debounces are chained — `scheduleFolderSync()` is called from *inside* `save()`'s timeout. Continuous typing therefore postpones the folder write indefinitely; confirm it lands within ~2 s of going idle.

### STOR-088 - Sync stops silently when the permission lapses
**P1** * Edge * `src/app.js:2343-2351 notesDirHandle()`, `src/app.js:2353` * Chromium only

- **Pre:** Folder connected. Now **revoke folder access** (site settings → reset File editing) and reload.
- **Steps:**
  1. Create a note. Wait 5 s.
  2. Inspect `~/qa-notes/paper-a.notes.json` and Settings → Storage.
- **Expect:** The file is **not** updated. No toast, no error, and Settings still shows `Notes sync to 📁 qa-notes`.
- **Watch:** `scheduleFolderSync()` calls `writeNotesToFolder(docId, false)` — non-interactive, so `notesDirHandle(false)` never prompts and the failure is invisible. The user believes their notes are backed up when they are not. This is the highest-risk behaviour in section 8; verify STOR-089 is the recovery path.

### STOR-089 - Clicking Save re-prompts for permission and recovers sync
**P0** * Functional * `src/app.js:2608 saveNotesNow()`, `src/app.js:2348` * Chromium only

- **Pre:** As STOR-088 — folder connected but permission lapsed.
- **Steps:**
  1. Click `#btnSaveNotes`.
  2. Grant the permission prompt.
  3. Inspect the folder.
- **Expect:** Chrome shows a permission prompt for the folder (because `saveNotesNow()` calls `writeNotesToFolder(…, true)` → `requestPermission`). On grant, the file is written and a toast reads exactly `Saved to “qa-notes”.` The Save As dialog does **not** appear.
- **Watch:** If the user **denies** the prompt, `writeNotesToFolder` returns `false` and `saveNotesNow()` falls through to the Save As dialog — verify that fallback (STOR-090) rather than a dead button.

### STOR-090 - Denying the folder permission falls back to Save As
**P0** * Edge * `src/app.js:2608-2613 saveNotesNow()` * Chromium only

- **Pre:** Folder connected, permission lapsed.
- **Steps:**
  1. Click Save.
  2. **Deny** the permission prompt.
- **Expect:** The native Save As dialog opens, pre-filled `paper-a.notes.json`. Completing it saves normally; cancelling it saves nothing (STOR-061 semantics still apply).
- **Watch:** The `&&` short-circuit in `saveNotesNow()` is what makes this work. A refactor to `if (mode==='folder') { … return; }` would strand the user with a folder they can no longer write to.

### STOR-091 - Opening a PDF re-grabs folder permission while the gesture is live
**P1** * Functional * `src/app.js:221-224 openPdfFile()` * Chromium only

- **Pre:** Folder connected, permission lapsed, fresh page load.
- **Steps:**
  1. Click "Open PDF or bundle" and pick `paper-b.pdf`.
- **Expect:** A folder permission prompt appears as part of that gesture (before or alongside the file open), and after granting, `paper-b.notes.json` auto-syncs on the next edit.
- **Watch:** The comment at `src/app.js:221` is explicit: re-granting needs a user gesture, so it is done at file-open time. If the prompt appears *after* the PDF renders it will be blocked by Chrome as gesture-less and silently fail.

### STOR-092 - "Change folder" moves sync to a new folder
**P1** * Functional * `src/app.js:2817-2819 openSettings()` * Chromium only

- **Pre:** Folder connected to `~/qa-notes/` with `paper-a.notes.json` present.
- **Steps:**
  1. Settings → Storage → "Change folder" → pick `~/qa-notes-drive/`.
  2. Create a note. Wait 3 s.
  3. Inspect both folders.
- **Expect:** The modal closes, a toast reads `Notes will auto-save to “qa-notes-drive”.`, a fresh `paper-a.notes.json` appears in the new folder, and the **old** folder's file is left untouched (not deleted, not updated).
- **Watch:** `dir:notes` is overwritten, so the old handle is unrecoverable. Users who expect a "move" will be surprised the old copy is stale — behaviour is correct, copy could be clearer; file as P2 if it confuses.

### STOR-093 - "Turn off" disconnects and stops writing
**P1** * Functional * `src/app.js:2822 openSettings()` * Chromium only

- **Pre:** Folder connected.
- **Steps:**
  1. Settings → Storage → "Turn off".
  2. Create a note, wait 3 s, inspect the folder.
  3. Reopen Settings → Storage.
- **Expect:** The modal closes and a toast reads exactly `Folder sync off — notes stay in this browser.` The folder file is **not** updated. The pane now shows "Choose folder…".
- **Watch:** `dir:notes` is deliberately **not** deleted from IndexedDB — only `settings.storage.mode` flips to `'browser'`. Re-connecting later may therefore not re-prompt. Verify that re-picking still works and that nothing writes to the folder while mode is `browser` (`scheduleFolderSync()` returns at its first line).

### STOR-094 - Cancelling the folder picker changes nothing
**P0** * Edge * `src/app.js:2341 chooseNotesFolder()` * Chromium only

- **Pre:** Browser mode.
- **Steps:**
  1. Settings → Storage → "Choose folder…" → press Escape / Cancel in the OS picker.
- **Expect:** No toast, no error, the Settings modal **stays open** on the Storage tab still showing "Choose folder…", and `settings.storage.mode` is still `'browser'`.
- **Watch:** `AbortError` is explicitly excluded from the error toast. Any other failure shows `Could not open that folder: ` + the message — verify that path by picking a folder the OS forbids.

### STOR-095 - Non-Chromium browsers are told folder sync is unavailable
**P0** * Copy * `src/app.js:2333 chooseNotesFolder()`, `src/app.js:2264 fsSupported()` * Firefox/Safari only

- **Pre:** Firefox or Safari.
- **Steps:**
  1. Settings → Storage → "Choose folder…".
- **Expect:** No picker. An error toast reads exactly:
  `Folder sync needs Chrome or Edge. Use Export / Import notes instead.`
  The pane still shows "Choose folder…" and mode stays `browser`.
- **Watch:** The button is **not** disabled or hidden on unsupported browsers — the toast is the whole affordance. Confirm the toast is the `err` style so it is noticeable.

### STOR-096 - The synced file name follows the document, not the tab
**P1** * Functional * `src/app.js:2454 scheduleFolderSync()`, `src/app.js:2266 notesFileName()` * Chromium only

- **Pre:** Folder connected; both `paper-a.pdf` and `paper-b.pdf` in the library.
- **Steps:**
  1. With `paper-a.pdf` active, add a note. Wait 3 s.
  2. Switch to `paper-b.pdf`, add a note. Wait 3 s.
  3. Inspect the folder.
- **Expect:** Two files: `paper-a.notes.json` and `paper-b.notes.json`, each holding only its own document's notes.
- **Watch:** `scheduleFolderSync()` always writes `state.ui.activeDoc`, and the timer is shared. Edit doc A, then switch to doc B within the 1.5 s window: the pending sync fires for **B**, so A's edit never reaches disk until A is edited again. Reproduce this deliberately and file it.

### STOR-097 - Two documents with the same sanitised name collide
**P2** * Edge * `src/app.js:2266 notesFileName()` * Chromium only

- **Pre:** Folder connected. Two different PDFs named `My Paper (v1).pdf` and `My Paper [v1].pdf` in the library.
- **Steps:**
  1. Add a note to each, waiting 3 s between.
  2. Inspect the folder.
- **Expect:** Both sanitise to `My Paper _v1_.notes.json` — a single file that each document overwrites in turn.
- **Watch:** Real data loss for the second document, silently. The SHA is in the file (`document.sha256`), so recovery via `findFolderNotes` is partial at best. File as P1 if you can reproduce it with realistic filenames.

### STOR-098 - A folder inside a cloud-synced tree round-trips
**P1** * Functional * `src/app.js:2352 writeNotesToFolder()` * Chromium only

- **Pre:** `~/qa-notes-drive/` inside a Google Drive / Dropbox synced folder, connected as the notes folder.
- **Steps:**
  1. Add notes on machine A, wait for the cloud client to upload.
  2. On machine B (same browser profile not required), open the same PDF with the same folder connected.
- **Expect:** Machine B's `maybeOfferFolderNotes()` finds the file and offers to open it (section 9). The merge is by annotation id, newest-wins.
- **Watch:** Cloud clients can create conflict copies (`paper-a.notes (conflicted copy).json`). Those are still `.json` and still carry the right `document.sha256`, so `findFolderNotes()`'s SHA scan may pick a stale one. Verify which file wins.

---

## 9. Notes discovery and the offer banners

### STOR-099 - Folder mode: opening a PDF with matching notes offers them
**P0** * Functional * `src/app.js:2396 maybeOfferFolderNotes()`, `src/app.js:2373 findFolderNotes()` * Chromium only

- **Pre:** Folder connected to `~/qa-notes/` containing `paper-a.notes.json` with 5 notes. `paper-a.pdf` **not** in the library (clean profile, then reconnect the folder).
- **Steps:**
  1. Open `paper-a.pdf`.
- **Expect:** A confirm dialog reads exactly:
  `Found notes for this PDF in “qa-notes”: paper-a.notes.json. Open them?`
  with buttons "Open notes" (primary) and "Not now". Choosing "Open notes" merges them and shows a toast `5 notes loaded from “qa-notes”.`
- **Watch:** The count is pluralised (`1 note`, `2 notes`). Verify the singular case with a one-note file. If the file parses in `findFolderNotes()` but fails during the merge, the catch at `src/app.js:2409` shows an error toast beginning exactly `Could not read the notes file: ` — force it by making the file unreadable between the scan and the confirm (or by stubbing `applyNotesJSON` to throw) and confirm no notes are half-applied.

### STOR-100 - "Not now" leaves the document untouched
**P1** * Edge * `src/app.js:2407 maybeOfferFolderNotes()` * Chromium only

- **Pre:** As STOR-099.
- **Steps:**
  1. Open `paper-a.pdf`, click "Not now".
  2. Check the notes panel and `srw_state_v1`.
- **Expect:** Zero notes for that document; nothing written; the notes panel shows its empty state.
- **Watch:** Escape and the backdrop click both resolve `false` in `confirmDialog()` (`src/app.js:2185-2187`) — verify both are treated as "Not now" and neither imports.

### STOR-101 - The offer does not nag when the notes are already loaded
**P0** * Functional * `src/app.js:2403-2406 maybeOfferFolderNotes()` * Chromium only

- **Pre:** `paper-a.pdf` open with all 5 notes already loaded and synced to the folder.
- **Steps:**
  1. Open `paper-a.pdf` again from the file picker (a duplicate open, hitting the SHA de-dupe path).
- **Expect:** The "Reopened paper-a.pdf — same paper, your notes are here." toast appears, but **no** confirm dialog — every id in the file is already present, so `fresh === 0`.
- **Watch:** Add one note in the folder file by hand (a new id) and repeat: the dialog must now appear. That proves the freshness check, not just silence.

### STOR-102 - A renamed PDF is still matched by SHA inside the folder
**P1** * Functional * `src/app.js:2380-2391 findFolderNotes()` * Chromium only

- **Pre:** Folder contains `paper-a.notes.json` whose `document.sha256` matches `paper-a.pdf`. The doc is not in the library.
- **Steps:**
  1. Open `paper-a-renamed.pdf` (byte-identical, different filename).
- **Expect:** The filename lookup misses, the folder scan finds the file by `document.sha256`, and the dialog names the **file it found**: `Found notes for this PDF in “qa-notes”: paper-a.notes.json. Open them?`
- **Watch:** The scan iterates `dir.values()` and JSON-parses **every** `.json` in the folder. In a folder with hundreds of large JSONs this is slow and runs on the open path — measure with 200 files and log the delay before the dialog appears.

### STOR-103 - A non-JSON or malformed file in the folder does not break the scan
**P1** * Edge * `src/app.js:2383-2389 findFolderNotes()` * Chromium only

- **Pre:** `~/qa-notes/` containing `paper-a.notes.json`, `broken.notes.json`, a `.txt`, a subfolder, and a 0-byte `.json`.
- **Steps:**
  1. Open `paper-a-renamed.pdf` so the SHA scan runs.
- **Expect:** The scan skips non-files and non-`.json` entries, swallows parse errors per file, and still finds the good match. No toast about the broken file.

### STOR-104 - Browser mode: a fresh PDF with no notes shows the banner once
**P0** * Copy * `src/app.js:2413 maybeOfferNotesFallback()`, `src/app.js:2422 showNotesBanner()`

- **Pre:** Browser storage mode (no folder). `paper-a.pdf` not in the library.
- **Steps:**
  1. Open `paper-a.pdf` alone (no `.json` in the same selection).
- **Expect:** A slim dark banner slides down from the top of the reader containing a document icon, the text `Have notes for **paper-a.pdf**? Open its **.notes.json** to load them.` (the document name and `.notes.json` in bold), a blue button "Open notes file…", and a "✕" close button with `aria-label="Dismiss"`.
- **Watch:** The banner is `position:fixed` at `top:64px` and only becomes interactive once `.show` is added on the next animation frame (`src/styles.css:657-662`). A missing `.show` leaves it invisible but click-blocking at `pointer-events:auto`.

### STOR-105 - The banner never appears twice for the same document
**P1** * State * `src/app.js:2415-2417 maybeOfferNotesFallback()`

- **Pre:** As STOR-104, banner shown and dismissed with ✕.
- **Steps:**
  1. Switch to another document and back.
  2. Reload the page.
  3. Re-open `paper-a.pdf` from the file picker.
- **Expect:** No banner in any case — `doc.notesAsked` is set to `true` and saved the moment the banner is created, whether or not the user acts on it.
- **Watch:** `notesAsked` lives on the document object in `srw_state_v1`; delete it by hand to re-test.

### STOR-106 - The banner does not appear when the PDF already has notes, or when a `.json` came with it
**P1** * Functional * `src/app.js:2416 maybeOfferNotesFallback()`, `src/app.js:274 openFiles()`

- **Pre:** Browser storage mode.
- **Steps:**
  1. Select `paper-a.pdf` **and** `paper-a.notes.json` together in one file-picker gesture.
  2. Separately, open a PDF that already has notes in state.
  3. Separately, select two PDFs at once.
- **Expect:** No banner in any of the three cases — the guard requires exactly one opened PDF, no notes files in the same gesture, no folder mode, and no existing notes for that document.

### STOR-107 - "Open notes file…" merges the picked file into that document
**P0** * Functional * `src/app.js:2435 openNotesFileFor()`

- **Pre:** Banner showing for `paper-a.pdf` (0 notes).
- **Steps:**
  1. Click "Open notes file…".
  2. Pick `paper-a.notes.json`.
- **Expect:** The banner disappears first (and remaining banners restack), the OS file picker opens, and after picking, 5 notes appear with a toast `5 notes loaded.` The merge is by id — re-picking the same file a second time still shows `5 notes loaded.` and does **not** duplicate anything.
- **Watch:** The click handler removes the banner *before* opening the picker, deliberately, so the gesture still counts. If a refactor awaits anything first, Safari and Firefox will block the picker.

### STOR-108 - Attaching a notes file saved for a different PDF asks first
**P0** * Copy * `src/app.js:2442-2443 openNotesFileFor()`

- **Pre:** Banner showing for `paper-b.pdf`. `paper-a.notes.json` on disk (different SHA).
- **Steps:**
  1. Click "Open notes file…" and pick `paper-a.notes.json`.
- **Expect:** A confirm dialog reads exactly:
  `“paper-a.notes.json” was saved for a different PDF. Attach it to “paper-b.pdf” anyway?`
  with buttons "Attach" and "Cancel". "Cancel" imports nothing. "Attach" merges and toasts the count.
- **Watch:** The prompt only fires when **both** SHAs exist. A notes file with `document.sha256: null` (or a document opened before `crypto.subtle` was available) attaches silently — verify by nulling the field in the file.

### STOR-109 - Picking a non-JSON or malformed file from the banner
**P1** * Copy * `src/app.js:2446 openNotesFileFor()`

- **Pre:** Banner showing.
- **Steps:**
  1. Click "Open notes file…" and pick `broken.notes.json`.
  2. Repeat with a `.txt` renamed to `.json`.
  3. Repeat and cancel the picker instead.
- **Expect:** 1 and 2 show an error toast beginning exactly `Could not read that JSON: ` followed by the parser's message. 3 does nothing at all — no toast, no state change.
- **Watch:** The `accept` is `application/json,.json`, which on macOS still permits "All Files" — the parse guard is the real defence.

### STOR-110 - Banners stack without overlapping
**P2** * Visual * `src/app.js:737 restackBanners()`

- **Pre:** A scanned PDF with no notes, opened in browser storage mode, so both the OCR banner and the notes banner can appear.
- **Steps:**
  1. Open the file and wait for both banners.
  2. Dismiss the top one.
- **Expect:** The banners sit at `top:64px` and below, spaced 8 px apart, centred horizontally. Dismissing one re-stacks the remainder up to `64px` with no gap.
- **Watch:** `restackBanners()` is called on show and on each dismiss; a banner removed by a path that forgets the call leaves a hole.

### STOR-111 - Switching documents clears a stale notes banner
**P1** * Regression * `src/app.js:205 switchDoc()`

- **Pre:** Notes banner showing for `paper-a.pdf`.
- **Steps:**
  1. Click `paper-b.pdf` in the library tree.
- **Expect:** The banner is removed immediately. It does not reappear for `paper-b.pdf` unless `maybeOfferNotesFallback()` legitimately fires for it.
- **Watch:** `switchDoc()` removes `#notesBanner` by id. Clicking "Open notes file…" on a banner that survived a switch would attach notes to the *previous* document id — the handler closes over `docId`. Verify no such orphan is reachable.

---

## 10. Export and import of notes JSON

### STOR-112 - Settings → "Export notes (JSON)" downloads the active document's notes
**P1** * Functional * `src/app.js:2820 openSettings()`, `src/app.js:2524 downloadNotesJSON()`

- **Pre:** `paper-a.pdf` active with 5 notes.
- **Steps:**
  1. Settings → Storage → "Export notes (JSON)".
- **Expect:** An immediate browser **download** (never a Save As dialog, on any browser) of `paper-a.notes.json`, and a toast reading exactly `Downloaded paper-a.notes.json`. The Settings modal stays open.
- **Watch:** This path deliberately bypasses `saveAsFile()`. If it starts popping the OS dialog, someone routed it through `saveNotesNow()` — behaviour change, file it.

### STOR-113 - Exported notes contain no `"@idb"` sentinels
**P0** * Functional * `src/app.js:2271 docNotesJSON()`, `src/app.js:144 rehydrateAssets()`

- **Pre:** A document with a screenshot note and a generated image, saved and **reloaded once** so rehydration has run.
- **Steps:**
  1. Export the notes and search the file for `@idb`.
- **Expect:** Zero occurrences. Screenshots and images appear as full `data:image/...;base64,` strings.
- **Watch:** `docNotesJSON()` serialises the **in-memory** annotations, which are only correct if `rehydrateAssets()` succeeded. Any boot where IndexedDB failed produces an export full of `"@idb"` — a broken file for the recipient. This is the single most important export check.

### STOR-114 - Import replaces the active document's notes without asking
**P0** * Edge * `src/app.js:2533 importNotesJSON()`, `src/app.js:2325-2327 applyNotesJSON()`

- **Pre:** `paper-a.pdf` active with 5 notes that are **not** in `paper-a.notes.json` (create 5 new ones after saving).
- **Steps:**
  1. Click `#btnImportNotes` (or Settings → "Import notes (JSON)").
  2. Pick `paper-a.notes.json`.
  3. Count the notes.
- **Expect:** Exactly the file's notes remain — the 5 unsaved ones are **gone**, with no confirmation dialog. A toast reads `5 notes imported.`
- **Watch:** `importNotesJSON()` calls `applyNotesJSON()` with **no** `{merge:true}` — this is a destructive replace. Contrast with the banner path (STOR-107) and folder discovery (STOR-099), which both merge. Importing `empty.notes.json` therefore silently deletes every note on the document. Treat unannounced data loss here as S1 and file it; at minimum the flow needs a confirm.

### STOR-115 - Import re-labels every incoming note onto the active document
**P1** * Edge * `src/app.js:2318 applyNotesJSON()`

- **Pre:** `paper-b.pdf` active. `paper-a.notes.json` on disk.
- **Steps:**
  1. Click `#btnImportNotes` and pick `paper-a.notes.json`.
  2. Look at the notes panel and the page anchors.
- **Expect:** The notes attach to `paper-b.pdf` with **no** SHA warning (unlike STOR-108), and their page numbers/rects point at whatever page index they carried — usually landing on the wrong content.
- **Watch:** `openNotesFileFor()` checks the SHA; `importNotesJSON()` does not. Same file, two entry points, different safety. Worth filing as a P1 consistency bug.

### STOR-116 - Importing a file with no `annotations` array is refused
**P1** * Copy * `src/app.js:2317 applyNotesJSON()`

- **Pre:** Any document with notes.
- **Steps:**
  1. Import `noarray.notes.json`.
  2. Import a valid JSON object with no `annotations` key at all (`{}`).
- **Expect:** Both times an error toast reads exactly `That file has no notes to import.` and the existing notes are **untouched** — the guard returns before the destructive replace.
- **Watch:** This is the only thing standing between an unrelated `.json` and total note loss. Test it explicitly on every release.

### STOR-117 - Importing malformed JSON
**P1** * Copy * `src/app.js:2535 importNotesJSON()`

- **Pre:** Any document with notes.
- **Steps:**
  1. Import `broken.notes.json`.
- **Expect:** An error toast beginning exactly `Could not read that JSON: ` plus the parser message. Existing notes untouched.

### STOR-118 - Cancelling the import picker changes nothing
**P0** * Edge * `src/app.js:2535 importNotesJSON()`

- **Pre:** A document with 5 notes.
- **Steps:**
  1. Click `#btnImportNotes`, then cancel the picker.
- **Expect:** No toast, no change to the notes, no state write.
- **Watch:** `inp.onchange` never fires on cancel in any browser today; a change to a `cancel` event handler must preserve this.

### STOR-119 - Merge is by annotation id, newest wins
**P0** * Functional * `src/app.js:2320-2324 applyNotesJSON()`

- **Pre:** `paper-a.pdf` with note `N` whose text is "OLD". A `paper-a.notes.json` containing the same annotation **id** with text "NEW" and a later `updated_at`. Use the banner path or folder discovery (both merge).
- **Steps:**
  1. Merge the file in.
  2. Read note `N`.
- **Expect:** One note with id `N`, text "NEW". No duplicate card, and the total count did not grow.
- **Watch:** The comparison is `stamp(c) >= stamp(cur)` — a tie (identical timestamps, or **both missing** `updated_at`/`created_at`, which both stamp as `0`) lets the **incoming** version win. Test with two notes that both lack timestamps and confirm the incoming one replaces the local edit.

### STOR-120 - Merge does not touch other documents' notes
**P0** * State * `src/app.js:2319 applyNotesJSON()`

- **Pre:** `paper-a.pdf` (5 notes) and `paper-b.pdf` (3 notes) both in the library, `paper-a.pdf` active.
- **Steps:**
  1. Merge `paper-a.notes.json` in.
  2. Switch to `paper-b.pdf`.
- **Expect:** `paper-b.pdf` still has exactly its 3 original notes, unmodified.

### STOR-121 - Import re-numbers anchors and clears the active selection
**P2** * Functional * `src/app.js:2328 applyNotesJSON()`, `src/app.js:1087 renumber()`

- **Pre:** A note selected (its card highlighted, connector drawn).
- **Steps:**
  1. Import a notes file.
  2. Observe the pins on the page and the anchor numbers on the cards.
- **Expect:** No card is selected afterwards, the connector line is gone, and pin numbers run 1..N in page-then-vertical order for the **active** document.
- **Watch:** `renumber()` only renumbers `inActiveDoc(a)`. Merging into a **non-active** document (possible via `attachNotesFile()`, `src/app.js:322`) leaves that document's anchors stale until it is next re-numbered. Switch to it and confirm.

### STOR-122 - A huge notes file imports without hanging the tab
**P1** * Perf * `src/app.js:2314 sanitizeImportedNotes()`, `src/app.js:2316 applyNotesJSON()`

- **Pre:** `huge.notes.json` (~3000 annotations).
- **Steps:**
  1. Import it and time from picker-confirm to the toast.
- **Expect:** It completes; the count in the toast matches. The list virtualises or at least renders without a permanent freeze.
- **Watch:** Sanitisation deep-clones every annotation and every message synchronously, then `render()` rebuilds the whole notes list. The hard caps are 50 000 annotations, 3000 messages each, 5000 rects each, 2 MB per text field (`src/app.js:2288-2314`) — a file above those caps must be truncated, not rejected.

### STOR-123 - Round trip: save, clear, import, compare
**P0** * Functional * `src/app.js:2271 docNotesJSON()`, `src/app.js:2316 applyNotesJSON()`

- **Pre:** `paper-a.pdf` with 8 notes covering every type: highlight, comment pin, screenshot, an AI answer with a trace, a generated image, a note with tags, a resolved note, and one with a very long body.
- **Steps:**
  1. Save the notes to `paper-a.notes.json`.
  2. Click `#btnClearNotes` and confirm.
  3. Import `paper-a.notes.json`.
  4. Compare every card against a screenshot taken before step 2.
- **Expect:** All 8 return with identical text, page, anchor number, colour, tags, resolved state, screenshot thumbnail, generated image, and agent trace. Highlights land on the same words; pins land at the same coordinates.
- **Watch:** This is the acceptance test for the whole document. The fields most often lost by a sanitisation change are `edited`, `error`, `caption`, `showOnCard` and the `trace` array — the sanitiser deliberately preserves unknown fields rather than whitelisting (`src/app.js:2280-2287`).

### STOR-124 - The dead `loadNotesFromFolder` path
**P2** * Regression * `src/app.js:2361 loadNotesFromFolder()`

- **Pre:** Chrome, folder connected.
- **Steps:**
  1. Search the entire UI for any control that loads notes *from* the folder on demand: Settings → Storage, the notes header buttons, the filter popover, the library row actions.
- **Expect:** There is none. `loadNotesFromFolder()` is defined but never called, so its two strings — `Pick a notes folder first (Settings → Notes storage).` and `No saved notes for this document in that folder yet.` — are unreachable today.
- **Watch:** If a "Load from folder" control is ever added, note that this function uses the **replace** mode of `applyNotesJSON()`, not merge — wiring it to a button without changing that would silently discard local notes. Also note its error copy says "Settings → Notes storage" while the real tab is labelled "Storage".

---

## 11. Deleting notes, and read-only bundles

### STOR-125 - "Delete all notes" confirms with an exact count and name
**P0** * Copy * `src/app.js:2634 clearActiveNotes()`

- **Pre:** `paper-a.pdf` active with 5 notes.
- **Steps:**
  1. Click `#btnClearNotes`.
- **Expect:** A confirm dialog reads exactly:
  `Delete all 5 notes for “paper-a.pdf”? This cannot be undone.`
  with a **red/danger** primary button labelled "Delete all" and a "Cancel" button.
- **Watch:** Pluralisation: with one note it must read `Delete all 1 note for “…”?`. Verify the singular.

### STOR-126 - Cancelling the delete keeps every note
**P0** * Edge * `src/app.js:2637 clearActiveNotes()`

- **Pre:** 5 notes.
- **Steps:**
  1. Click `#btnClearNotes`, then Cancel. Repeat with Escape, and with a backdrop click.
- **Expect:** All 5 notes remain in all three cases; no state write; no toast.

### STOR-127 - Confirming deletes only the active document's notes
**P0** * Functional * `src/app.js:2638-2640 clearActiveNotes()`

- **Pre:** `paper-a.pdf` (5 notes) and `paper-b.pdf` (3 notes); `paper-a.pdf` active.
- **Steps:**
  1. Delete all notes for `paper-a.pdf`.
  2. Check the toast, the notes panel, the page overlay, and then switch to `paper-b.pdf`.
- **Expect:** A toast reads exactly `Deleted all notes for this document.` The panel is empty, all highlights and pins are gone from the page, the footer reads "0 notes", and `paper-b.pdf` still has its 3 notes.
- **Watch:** With folder sync on, the delete propagates to `~/qa-notes/paper-a.notes.json` about 1.75 s later, leaving an empty-array file on disk. That is correct but irreversible — confirm the file is rewritten, and note there is no undo.

### STOR-128 - Deleting when there is nothing to delete
**P1** * Copy * `src/app.js:2636 clearActiveNotes()`

- **Pre:** A document with 0 notes.
- **Steps:**
  1. Click `#btnClearNotes`.
- **Expect:** No confirm dialog. A plain (non-error) toast reads exactly `No notes to delete for this document.`

### STOR-129 - Deleted notes' images stay in IndexedDB
**P2** * Edge * `src/app.js:2638 clearActiveNotes()`, `src/app.js:134 idbDel()`

- **Pre:** A document with 3 screenshot notes, reloaded once so `shot:` records exist.
- **Steps:**
  1. Record the `shot:*` keys.
  2. Delete all notes for the document and reload.
  3. Re-inspect the store.
- **Expect:** Document today's behaviour: the `shot:` records remain. `clearActiveNotes()` never calls `idbDel()`.
- **Watch:** Same leak as STOR-013 from a different entry point. If IndexedDB usage keeps climbing across a long QA session with no corresponding notes, this is why.

### STOR-130 - A read-only bundle writes nothing to any store
**P0** * Security * `src/app.js:152 save()`, `src/app.js:3283 initBundleState()`, `src/app.js:3294 applyReadOnly()`

- **Pre:** `paper-a.annotated.html` served from the **same origin** as the app. Record `srw_state_v1`'s exact value and the full list of `srw_assets` keys.
- **Steps:**
  1. Open the bundle and use it for two minutes: page through, zoom, search notes, sort, filter, collapse panels.
  2. Re-read `srw_state_v1` and the `assets` store.
  3. Confirm which controls are visible.
- **Expect:** The state blob is byte-identical; no new IndexedDB keys. `#btnSaveNotes`, `#btnImportNotes`, `#btnClearNotes`, `#btnShareHtml`, `#btnSettings`, `#newBtn`, the tool buttons and the composer are all hidden, and the Storage block is gone. A dark bar at the bottom reads "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX".
- **Watch:** Any write from a shared file is S1 — it means a paper someone emailed you can overwrite your library. Also confirm `srw_saveas_tip` is untouched (STOR-079).

---

## Coverage map

| Code or element | Checks |
|---|---|
| `LS = 'srw_state_v1'` src/app.js:37 | STOR-001, STOR-004, STOR-005, STOR-006, STOR-039 |
| `defaultState()` src/app.js:54 | STOR-005, STOR-008, STOR-039 |
| `loadState()` src/app.js:74 | STOR-004, STOR-005, STOR-047 |
| `migrateState()` src/app.js:76 | STOR-006, STOR-007, STOR-014 … STOR-026 |
| ` └ docs normalisation` src/app.js:79-83 | STOR-014, STOR-016 |
| ` └ sampleDismissed` src/app.js:82 | STOR-015 |
| ` └ libView / tool / continuous` src/app.js:84-86 | STOR-017, STOR-018 |
| ` └ `_toolsDefaulted`` src/app.js:88 | STOR-019 |
| ` └ storage + prompts defaults` src/app.js:91-92 | STOR-020, STOR-021 |
| ` └ model bumps` src/app.js:96-107 | STOR-023 |
| ` └ `_orDefaulted`` src/app.js:108-109 | STOR-024 |
| ` └ legacy prompt fold` src/app.js:110-113 | STOR-022 |
| ` └ sample rename` src/app.js:115 | STOR-025 |
| ` └ annotation doc remap` src/app.js:116 | STOR-026 |
| `idbOpen()` src/app.js:123 | STOR-027, STOR-033, STOR-047 |
| `idbPut()` src/app.js:133 | STOR-028, STOR-029, STOR-033, STOR-035, STOR-038, STOR-045 |
| `idbDel()` src/app.js:134 | STOR-012, STOR-013, STOR-129 |
| `idbGet()` src/app.js:135 | STOR-031, STOR-034, STOR-038 |
| `rehydrateAssets()` src/app.js:144 | STOR-031, STOR-032, STOR-033, STOR-034, STOR-113 |
| `save()` + 250 ms debounce src/app.js:151-167 | STOR-001 … STOR-004, STOR-009, STOR-010, STOR-028 … STOR-030, STOR-040 … STOR-043 |
| `"@idb"` sentinel src/app.js:158-159 | STOR-028, STOR-029, STOR-033, STOR-034, STOR-113 |
| quota toast "Storage limit reached — export your notes to keep them." src/app.js:165 | STOR-040, STOR-041, STOR-044 |
| silent SecurityError path src/app.js:163-166 | STOR-042 |
| `loadDocBytes()` src/app.js:196 | STOR-035, STOR-036, STOR-046 |
| `openPdfFile()` folder pre-grab src/app.js:221-224 | STOR-091 |
| `openPdfFile()` dedupe + "Reopened … your notes are here." src/app.js:231-239 | STOR-037, STOR-101 |
| `openFiles()` fallback gating src/app.js:274 | STOR-106 |
| `trashDoc()` / `restoreDoc()` src/app.js:333-345 | STOR-011, STOR-054 |
| `purgeDoc()` src/app.js:346 | STOR-012, STOR-013 |
| `updateStorage()` src/app.js:396 | STOR-048 … STOR-054 |
| ` └ `fmt()` units` src/app.js:397 | STOR-049 |
| ` └ bar width floor` src/app.js:403 | STOR-050 |
| ` └ "N documents" fallback` src/app.js:407 | STOR-052, STOR-054 |
| `#storageBar` / `#storageText` / "Calculating…" app.html:38-39 | STOR-048, STOR-049, STOR-050, STOR-055 |
| `.sb-storage`, `.bar`, `.bar>i` src/styles.css:83-85 | STOR-050, STOR-055 |
| `restackBanners()` src/app.js:737 | STOR-110, STOR-107 |
| `renumber()` src/app.js:1087 | STOR-121 |
| `confirmDialog()` src/app.js:2176 | STOR-100, STOR-108, STOR-125, STOR-126 |
| `fsSupported()` src/app.js:2264 | STOR-095 |
| `storageCfg()` src/app.js:2265 | STOR-006, STOR-020, STOR-093 |
| `notesFileName()` src/app.js:2266 | STOR-058, STOR-096, STOR-097 |
| `docNotesJSON()` src/app.js:2271 | STOR-008, STOR-057, STOR-069, STOR-070, STOR-113, STOR-123 |
| `sanitizeImportedNotes()` src/app.js:2314 | STOR-122, STOR-123 |
| `applyNotesJSON()` replace mode src/app.js:2325-2327 | STOR-114, STOR-115, STOR-116 |
| `applyNotesJSON()` merge mode src/app.js:2320-2324 | STOR-099, STOR-107, STOR-119, STOR-120 |
| `chooseNotesFolder()` src/app.js:2332 | STOR-038, STOR-084, STOR-085, STOR-094, STOR-095 |
| "Notes will auto-save to “…”." src/app.js:2339 | STOR-084, STOR-092 |
| "Folder sync needs Chrome or Edge. Use Export / Import notes instead." src/app.js:2333 | STOR-095 |
| "Could not open that folder: …" src/app.js:2341 | STOR-094 |
| `notesDirHandle()` src/app.js:2343 | STOR-086, STOR-088, STOR-089, STOR-090, STOR-091 |
| `writeNotesToFolder()` + "Save failed: …" src/app.js:2352-2359 | STOR-085, STOR-087, STOR-088, STOR-089, STOR-098 |
| `loadNotesFromFolder()` (unreachable) src/app.js:2361 | STOR-124 |
| `findFolderNotes()` src/app.js:2373 | STOR-099, STOR-102, STOR-103 |
| `maybeOfferFolderNotes()` + "Found notes for this PDF in “…”: …. Open them?" src/app.js:2396-2409 | STOR-099, STOR-100, STOR-101, STOR-102, STOR-098 |
| `maybeOfferNotesFallback()` / `notesAsked` src/app.js:2413 | STOR-104, STOR-105, STOR-106 |
| `showNotesBanner()` + "Have notes for …? Open its .notes.json to load them." / "Open notes file…" / "Dismiss" src/app.js:2422 | STOR-104, STOR-107, STOR-110, STOR-111 |
| `.top-banner` / `.tb-msg` / `.tb-act` / `.tb-x` src/styles.css:657-670 | STOR-104, STOR-110 |
| `openNotesFileFor()` + SHA-mismatch confirm src/app.js:2435-2448 | STOR-107, STOR-108, STOR-109 |
| `scheduleFolderSync()` 1.5 s debounce src/app.js:2451 | STOR-043, STOR-087, STOR-093, STOR-096 |
| `maybeShowSaveAsTip()` src/app.js:2460 | STOR-072 … STOR-082 |
| ` └ `srw_saveas_tip` key` src/app.js:2462, 2495 | STOR-075, STOR-076, STOR-080, STOR-081, STOR-130 |
| ` └ Firefox / Safari / generic copy` src/app.js:2467-2471 | STOR-072, STOR-073, STOR-074 |
| ` └ "Choose where your files save" / "Turn on:" / "Got it"` src/app.js:2484-2487 | STOR-072, STOR-077, STOR-082 |
| `saveAsFile()` src/app.js:2503 | STOR-059 … STOR-064, STOR-068, STOR-078, STOR-081 |
| ` └ cancelled → save nothing` src/app.js:2512 | STOR-061 |
| ` └ "Couldn’t write there: … — downloading a copy instead."` src/app.js:2520 | STOR-063 |
| `downloadNotesJSON()` + "Downloaded …" / "Could not export: …" src/app.js:2524 | STOR-064, STOR-065, STOR-066, STOR-112 |
| `importNotesJSON()` + "N notes imported." / "Could not read that JSON: …" src/app.js:2533 | STOR-114 … STOR-118 |
| "That file has no notes to import." src/app.js:2317 | STOR-116 |
| `flashSaved()` + `.icon-btn.save-btn.saved` src/app.js:2602 / src/styles.css:119 | STOR-067 |
| `saveNotesNow()` src/app.js:2607 | STOR-044, STOR-056 … STOR-071, STOR-089, STOR-090 |
| "Saved to “…”." / "Saved <name>." src/app.js:2609, 2614 | STOR-060, STOR-089 |
| `injectNotesButtons()` + all four tooltips src/app.js:2618-2632 | STOR-056 |
| `#btnSaveNotes` | STOR-044, STOR-056 … STOR-071 |
| `#btnImportNotes` | STOR-056, STOR-114 … STOR-118 |
| `#btnClearNotes` | STOR-056, STOR-125 … STOR-129 |
| `clearActiveNotes()` src/app.js:2634 | STOR-125 … STOR-129 |
| Settings → Storage pane markup src/app.js:2789-2803 | STOR-020, STOR-083, STOR-084 |
| `#stFolder` / `#stChange` src/app.js:2817-2819 | STOR-084, STOR-092, STOR-094, STOR-095 |
| `#stDisconnect` + "Folder sync off — notes stay in this browser." src/app.js:2822 | STOR-093 |
| `#stExport` src/app.js:2820 | STOR-112, STOR-113 |
| `#stImport` src/app.js:2821 | STOR-114, STOR-116 |
| `initBundleState()` / `READONLY` src/app.js:3283, 43 | STOR-009, STOR-079, STOR-130 |
| `applyReadOnly()` src/app.js:3294 | STOR-055, STOR-130 |
| `boot()` storage sequence src/app.js:3303-3336 | STOR-004, STOR-006, STOR-027, STOR-031, STOR-039, STOR-046 |
| `showEmptyReader()` src/app.js:3197 | STOR-016, STOR-046 |

---

## Deliberately not covered here

- The sidebar Storage meter's pure layout and hover styling, the library tree and document switching as UI - covered in **03 - App shell and library** (SHELL-049 … SHELL-058). Only the persistence semantics of the meter (when it re-measures, what it reads) are here.
- SHA-256 content addressing, drag-and-drop of mixed file sets, `attachNotesFile()`'s three-way matching, and the `.annotated.html` import path as *document* operations - covered in **04 - Document lifecycle**. Only their storage side effects (`pdf:` records, `updateStorage()` calls) appear here.
- Building the self-contained `.annotated.html`, `notesJSONForExport()`, the read-only viewer's rendering, and the export-to-PDF view (`openExport()`) - covered in **11 - Share and export**. This document only covers that "Share as HTML" shares the same `saveAsFile()` and one-time tip (STOR-081).
- The Settings modal's tabs, AI keys, model fields, identity, tool toggles and the Templates pane - covered in **12 - Settings and templates**. Only the Storage tab's four controls and their persistence effects appear here.
- Import *sanitisation* as a security property - id regeneration, `javascript:` and SVG image rejection, `</script>` neutralisation, the 2 MB / 50 000 / 3000 / 5000 caps - covered in **13 - Security and privacy**. Here they appear only as the "legitimate fields survive" round trip (STOR-123) and the DoS-cap perf check (STOR-122).
- OCR store contents, the `ocr:<sha>` record in `srw_assets`, the scanned-PDF heuristic and the OCR banner - covered in **09 - OCR**.
- Note creation, editing, tagging and resolving; the notes-panel filter, sort, search and counter - covered in **06 - Annotation tools** and **07 - Notes panel**.
- Keyboard focus order, focus trapping and screen-reader labelling of the save tip, the confirm dialogs and the notes banner - covered in **15 - Accessibility**.
- Per-engine availability of `showSaveFilePicker` / `showDirectoryPicker` / `navigator.storage.estimate` across the full browser matrix - covered in **16 - Cross-browser and platform**. Individual checks here are marked *Chromium only* / *Firefox/Safari only* and assume the matrix has already established support.
- Large-PDF render performance, memory ceilings and the notes-list virtualisation threshold - covered in **17 - Performance and limits**. Only storage-specific timings (rehydration, huge saves, huge imports) appear here.
- Network failure, `/api` errors and PDF.js worker failures - covered in **18 - Error states and recovery**.
