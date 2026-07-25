# 03 - App shell, sidebar & library panel

> Manual QA for the three-pane app shell: the left library sidebar and its document tree, the storage meter, panel collapse/expand and narrow-viewport drawers, the drag-to-resize splitter, the notes-panel chrome, and every empty/error state around them.

| | |
|---|---|
| **ID prefix** | SHELL |
| **Scope** | `#sidebar` (brand, "Open PDF or bundle", "Share as HTML", Home/Recents/Starred/Trash, the document tree and its per-row actions, the Storage meter + settings gear), panel collapse/expand and the `#scrim` drawers, the `#rightResizer` column splitter, the `#notes` panel chrome (header buttons, search bar, count/sort footer, composer chrome) including the buttons injected at runtime, and all shell-level empty / fallback / read-only states. |
| **Primary code** | `app.html:16-41`, `app.html:44-71`, `app.html:88-116`, `src/app.js:325-408`, `src/app.js:1132-1161`, `src/app.js:2602-2641`, `src/app.js:3058-3086`, `src/app.js:3180-3246`, `src/app.js:3294-3353`, `src/styles.css:26-86`, `src/styles.css:457-463`, `src/styles.css:538-618` |
| **Checks** | 115 |

## Contents
- [1. Shell boot & three-pane layout](#1-shell-boot--three-pane-layout) - 9 checks
- [2. Sidebar header & primary actions](#2-sidebar-header--primary-actions) - 11 checks
- [3. Library views & navigation](#3-library-views--navigation) - 10 checks
- [4. Document tree rows & row actions](#4-document-tree-rows--row-actions) - 18 checks
- [5. Storage meter & settings gear](#5-storage-meter--settings-gear) - 9 checks
- [6. Panel collapse, drawers & scrim](#6-panel-collapse-drawers--scrim) - 14 checks
- [7. Column splitter (drag to resize)](#7-column-splitter-drag-to-resize) - 10 checks
- [8. Notes panel chrome & injected buttons](#8-notes-panel-chrome--injected-buttons) - 16 checks
- [9. Empty, error & read-only states](#9-empty-error--read-only-states) - 9 checks
- [10. Persistence, stress & cross-cutting edges](#10-persistence-stress--cross-cutting-edges) - 9 checks

---

## 1. Shell boot & three-pane layout

### SHELL-001 - Three panes render at desktop width
**P0** * Visual * `app.html:13-116`, `src/styles.css:27-29`

- **Pre:** Desktop browser window ≥ 1200px wide. Clean profile (no `srw_state_v1` in localStorage).
- **Steps:**
  1. Open `/app.html`.
  2. Observe the layout left to right.
- **Expect:** Exactly three columns: `#sidebar` at 250px, the reader filling the middle, `#notes` at 384px. The page never scrolls horizontally or vertically at the body level (`html,body{overflow:clip}`); each pane scrolls internally.
- **Watch:** A new top-level element added outside `#app` (a banner, a debug bar) breaks `height:100vh` and produces a body scrollbar plus a clipped notes composer.

### SHELL-002 - Sidebar internal layout: pinned top, scrolling middle, pinned storage
**P0** * Visual * `src/styles.css:457-459`, `app.html:24-40`

- **Pre:** Library holding ≥ 20 documents (open a folder of PDFs, or add rows until the tree overflows).
- **Steps:**
  1. Scroll inside the document tree.
- **Expect:** The brand row, "Open PDF or bundle", and "Share as HTML" stay pinned at the top; only `.sb-scroll` (nav + section label + tree) scrolls; the Storage block stays pinned at the bottom (`margin-top:auto`). No horizontal scrollbar appears in the sidebar (`overflow-x:hidden`).
- **Watch:** Adding a new sidebar block outside `.sb-scroll` squeezes the tree instead of scrolling it; long doc names forcing horizontal overflow.

### SHELL-003 - Reader top bar keeps its panel toggles when crowded
**P1** * Visual * `src/styles.css:92`, `app.html:46-70`

- **Pre:** Desktop, both panels open, window narrowed to ~900px.
- **Steps:**
  1. Watch the reader top bar as the window narrows.
- **Expect:** `#btnToggleLeft` / `#btnToggleRight` are never compressed (`.rd-top>.icon-btn{flex:0 0 auto}`); the middle group (`.rd-mid`) absorbs the squeeze.
- **Watch:** A new toolbar control added outside `.rd-mid` steals width from the toggles.

### SHELL-004 - Collapsed-panel state restores from localStorage
**P0** * State * `src/app.js:3316-3317 boot()`

- **Pre:** Desktop.
- **Steps:**
  1. Collapse the left panel with «, collapse the right panel with ».
  2. Reload the page.
- **Expect:** Both panels come back collapsed; `#btnToggleLeft` ("Show library") and `#btnToggleRight` ("Show notes") are visible in the reader top bar.
- **Watch:** `boot()` applying classes before `state` is migrated, or a new default in `defaultState()` clobbering the saved `collapseLeft`/`collapseRight`.

### SHELL-005 - Zoom readout is restored before first paint
**P1** * State * `src/app.js:3318 boot()`

- **Pre:** Desktop.
- **Steps:**
  1. Zoom to 145%, reload.
- **Expect:** `#zoomVal` reads "145%" immediately at boot — never the hard-coded "115%" from `app.html:57` flashing first.
- **Watch:** Moving the zoom restore after `initPdf()` reintroduces the flash of "115%".

### SHELL-006 - Narrow first run collapses both panels once and only once
**P0** * State * `src/app.js:3309-3314 boot()`, `src/app.js:1144 isNarrowViewport()`

- **Pre:** Clean profile. Browser window (or device) ≤ 820px wide.
- **Steps:**
  1. Load the app — both drawers should be closed on the page.
  2. Open the library drawer, reload.
- **Expect:** First load shows the PDF with no drawer over it. After the manual open + reload, the library drawer stays open — the one-time default (`state.ui._mobileDefaulted`) never re-collapses a panel the reader deliberately opened.
- **Watch:** Removing the `_mobileDefaulted` flag makes every narrow reload slam both drawers shut, wiping the reader's choice.

### SHELL-007 - A zero-width viewport is not treated as a phone
**P1** * Edge * `src/app.js:1144 isNarrowViewport()`

- **Pre:** Desktop, clean profile.
- **Steps:**
  1. Open the app in a background/hidden tab (Cmd/Ctrl-click a link to `/app.html`), wait 5 s, then switch to it.
- **Expect:** The app opens with the desktop three-pane layout and both panels expanded — an unmeasured viewport reporting width 0 must not be read as "narrow".
- **Watch:** Changing the guard to `w <= 820` without the `w > 0` test permanently persists mobile defaults on desktop.

### SHELL-008 - Panels animate on desktop, snap on mobile
**P2** * Visual * `src/styles.css:29`, `src/styles.css:545`

- **Pre:** Desktop, then a ≤ 820px window.
- **Steps:**
  1. Desktop: collapse and expand the notes panel.
  2. Narrow: open and close the notes drawer.
- **Expect:** Desktop columns ease over ~0.18 s (`transition:grid-template-columns .18s ease`). At ≤ 820px the grid transition is off and the drawer slides via `transform .22s ease` instead.
- **Watch:** Leaving the grid transition on at drawer widths makes the reader column jitter behind the sliding drawer.

### SHELL-009 - Shell survives a missing/blocked PDF engine
**P1** * Edge * `src/app.js:3335-3346 boot()`

- **Pre:** DevTools → Network → block `vendor/pdf.min.js` (or throttle it so the 7 s race times out).
- **Steps:**
  1. Reload the app.
- **Expect:** Both side panels, the tree, the storage meter and the notes panel are all present and interactive; the reader shows the fallback card headed "Open this file directly to read the PDF" (see SHELL-100). Nothing in the shell is blank.
- **Watch:** A throw inside `initPdf()` escaping the `try` would abort `boot()` before `render()`, leaving the notes panel and tree unwired.

---

## 2. Sidebar header & primary actions

### SHELL-010 - Brand tile
**P2** * Visual * `app.html:18`, `src/styles.css:38-39`

- **Pre:** App open, sidebar expanded.
- **Steps:**
  1. Look at the top-left of the sidebar.
- **Expect:** A 34×34 near-black rounded square reading exactly "Px" in white bold. It is not a link and does not respond to clicks.
- **Watch:** A wrapper `<a>` added around it would navigate away and lose unsaved composer text.

### SHELL-011 - "Open PDF or bundle" button copy and tooltip
**P0** * Copy * `app.html:21`

- **Pre:** App open, sidebar expanded.
- **Steps:**
  1. Read the button label; hover it for ~1 s.
- **Expect:** Label reads exactly "Open PDF or bundle" with a folder icon to its left. The native tooltip reads exactly "Open a PDF, notes (.json), or a shared paper (.html)". The button text is blue (`--blue`) with a 1px border and a subtle shadow; hover fills it with `--surface-2`.
- **Watch:** Copy drift back to the old "New" label — several toasts and the empty-reader card still name this button, so a rename here must be mirrored (see SHELL-101).

### SHELL-012 - "Open PDF or bundle" opens the file picker
**P0** * Functional * `src/app.js:3066 wire()`, `app.html:22`

- **Pre:** App open.
- **Steps:**
  1. Click "Open PDF or bundle".
- **Expect:** The OS file dialog opens. Its filter accepts PDFs, `.json` and `.html` (from `accept="application/pdf,.json,application/json,.html,text/html"`) and allows multi-select.
- **Watch:** `#fileInput` losing `multiple` silently breaks the "PDF + its .notes.json in one gesture" flow.

### SHELL-013 - Cancelling the file dialog changes nothing
**P1** * Edge * `src/app.js:3068 wire()`

- **Pre:** Library with ≥ 1 document.
- **Steps:**
  1. Click "Open PDF or bundle", then press Escape / Cancel in the dialog.
- **Expect:** No toast, no new tree row, the current document stays open, and the reader does not reload.
- **Watch:** Wiring `openFiles()` to `click` instead of `change` fires an empty open on cancel.

### SHELL-014 - Opening the same PDF twice does not duplicate the row
**P0** * Functional * `src/app.js:219-249 openPdfFile()`

- **Pre:** A PDF already in the library.
- **Steps:**
  1. Open the identical file again (rename the file on disk first to prove content addressing).
- **Expect:** No second row. The existing row is selected and a toast reads "Reopened <existing name> — same paper, your notes are here." — with the *original* library name, not the renamed file's name. Its notes are intact.
- **Watch:** `crypto.subtle` unavailable (plain `http://` origin) makes `sha256Hex()` return null, dedupe silently stops working, and every re-open adds a duplicate row.

### SHELL-015 - Opening a brand-new PDF adds one row and toasts
**P0** * Functional * `src/app.js:241-249 openPdfFile()`

- **Pre:** Any library state.
- **Steps:**
  1. Open a PDF not yet in the library.
- **Expect:** One new row appears at the **bottom** of "My Library" (Home is insertion-ordered), it becomes the active/blue row, the reader loads it, and a toast reads "Opened <file name> — highlight text or capture a figure to start."
- **Watch:** The row appearing but staying grey (active state not applied) when `switchDoc()` errors before `renderTree()`.

### SHELL-016 - Unsupported file types are ignored silently
**P1** * Edge * `src/app.js:255-263 openFiles()`

- **Pre:** A `.png` and a `.txt` on disk.
- **Steps:**
  1. Click "Open PDF or bundle", force-select the `.png` (use "All files" in the dialog if needed).
- **Expect:** Nothing is added to the tree, the active document is unchanged, no phantom row, no crash.
- **Watch:** The silent no-op reads as a hang to users; if the type filters are refactored, an unsupported file must never reach `openPdfFile()` and create a row with unreadable bytes.

### SHELL-017 - A corrupt / non-PDF ".pdf" leaves a recoverable state
**P1** * Edge * `src/app.js:215 switchDoc()`

- **Pre:** Rename a text file to `broken.pdf`.
- **Steps:**
  1. Open `broken.pdf`.
- **Expect:** A row named "broken.pdf" is added and selected; the reader shows the fallback card with the engine note ending "Could not open “broken.pdf” — it may not be a valid PDF." The sidebar, tree and notes panel remain usable, and clicking another row recovers the reader.
- **Watch:** The failed document staying active after a reload — boot re-tries it, so a user can get stuck on the fallback card until they trash the row.

### SHELL-018 - "Share as HTML" button copy and tooltip
**P1** * Copy * `app.html:23`

- **Pre:** App open, sidebar expanded.
- **Steps:**
  1. Read the second sidebar button; hover it.
- **Expect:** Label reads exactly "Share as HTML" with an "HTML" file badge icon. Tooltip reads exactly "Save this paper + notes as one self-contained .html you can share". Muted grey text, smaller (13px) and shorter (34px) than the button above, sitting flush under it.
- **Watch:** `.side-btn:hover{color:var(--text)}` references an undefined variable — hover must still be legible (it falls back to inherited colour), not turn transparent.

### SHELL-019 - "Share as HTML" starts an export from the sidebar
**P1** * Functional * `src/app.js:3067 wire()`, `src/app.js:2553 exportSelfContainedHTML()`

- **Pre:** The BERT sample open with its seeded notes.
- **Steps:**
  1. Click "Share as HTML".
- **Expect:** Immediately a toast "Building shareable file…", then (Chromium) a native Save As dialog pre-filled with `BERT — Devlin et al. 2019 (NAACL).annotated.html`; on save a toast "Saved <name> — <N.N> MB, opens anywhere." Firefox/Safari get a plain download and "Exported <name> — <N.N> MB, opens anywhere."
- **Watch:** Double-clicking the button starting two concurrent builds — each re-fetches and re-inlines the whole app, which is visibly slow on a large PDF.

### SHELL-020 - Sidebar collapse chevron «
**P0** * Functional * `app.html:19`, `src/app.js:3062 wire()`

- **Pre:** Desktop, sidebar expanded.
- **Steps:**
  1. Hover `#btnCollapseLeft`, read the tooltip, then click it.
- **Expect:** Tooltip reads exactly "Collapse"; the glyph is «. Hover paints an `--surface-2` rounded square. Clicking collapses the sidebar to 0 width and reveals `#btnToggleLeft` in the reader top bar.
- **Watch:** The tooltip stays "Collapse" in both states because the button is unreachable once collapsed — if it is ever left visible, the label must flip.

---

## 3. Library views & navigation

### SHELL-021 - Four nav rows with the right labels and icons
**P0** * Copy * `app.html:26-29`

- **Pre:** Sidebar expanded.
- **Steps:**
  1. Read the four nav rows top to bottom.
- **Expect:** Exactly "Home" (house), "Recents" (clock), "Starred" (star outline), "Trash" (bin) — in that order, each with an 18px line icon in `--faint`.
- **Watch:** An icon losing `stroke-linecap`/`stroke-linejoin` renders visibly heavier than its neighbours.

### SHELL-022 - Active nav row styling
**P0** * Visual * `src/app.js:369 renderTree()`, `src/styles.css:57-59`

- **Pre:** Sidebar expanded.
- **Steps:**
  1. Click each of the four nav rows in turn.
- **Expect:** Exactly one row carries `.active` at a time: light-blue background, `--blue-2` text, weight 600, and its icon turns `--blue`. Non-active rows show only a grey hover fill.
- **Watch:** Two rows highlighted at once after a `renderTree()` that runs before `state.ui.libView` is written.

### SHELL-023 - Section label follows the selected view
**P0** * Copy * `src/app.js:370 renderTree()`, `app.html:31`

- **Pre:** Sidebar expanded.
- **Steps:**
  1. Click Home, Recents, Starred, Trash in turn and read the small heading above the tree each time.
- **Expect:** It reads exactly "My Library", then "Recents", then "Starred", then "Trash" — in a folder-icon row, uppercase-free, 12px muted.
- **Watch:** Adding a fifth view without extending the label map leaves the heading `undefined`.

### SHELL-024 - Home lists every non-trashed document in insertion order
**P1** * Functional * `src/app.js:357-365 docsForView()`

- **Pre:** Sample plus two user PDFs opened in a known order.
- **Steps:**
  1. Select Home.
- **Expect:** The sample sits first, then the user PDFs in the order they were added. Trashed documents are absent.
- **Watch:** Home is deliberately unsorted — a stray `.sort()` here would make row positions jump every time `lastOpened` changes.

### SHELL-025 - Recents is ordered by last opened, newest first
**P1** * Functional * `src/app.js:363 docsForView()`

- **Pre:** Three documents in the library.
- **Steps:**
  1. Open document A, then C, then B.
  2. Select Recents.
- **Expect:** Order is B, C, A. Re-selecting a row (SHELL-032) moves it to the top only after an actual switch.
- **Watch:** A document that was never opened falls back to `addedAt`; a doc missing both fields sorts to the very bottom (date 0) rather than crashing.

### SHELL-026 - Starred shows only starred documents
**P1** * Functional * `src/app.js:362 docsForView()`

- **Pre:** Star exactly one document.
- **Steps:**
  1. Select Starred.
- **Expect:** Only that document is listed, with a filled amber star. Un-starring it from this view empties the list immediately and shows "No starred documents yet."
- **Watch:** A trashed-but-starred doc must not appear here (`d.trashed` is filtered out first).

### SHELL-027 - Trash lists trashed documents, newest first
**P1** * Functional * `src/app.js:360 docsForView()`

- **Pre:** Trash two documents a few seconds apart.
- **Steps:**
  1. Select Trash.
- **Expect:** The most recently trashed row is at the top. No non-trashed document appears. No row is highlighted blue even if it was the active document (`active` is forced false in Trash).
- **Watch:** A doc trashed by an older build with no `trashedAt` sorts to the bottom — acceptable, but it must not throw.

### SHELL-028 - Empty state per view
**P0** * Copy * `src/app.js:374-377 renderTree()`

- **Pre:** Fresh profile.
- **Steps:**
  1. Select Trash (nothing trashed), then Starred (nothing starred), then trash everything including the sample and select Home.
- **Expect:** Verbatim, in a 12.5px `--faint` block indented ~16px: "Trash is empty." / "No starred documents yet." / "No documents yet — use “Open PDF or bundle” to add one." (note the curly quotes and em dash).
- **Watch:** The Home string names the sidebar button — renaming the button without updating this string is the single most likely copy regression here.

### SHELL-029 - Opening a file forces the view back to Home
**P1** * State * `src/app.js:244 openPdfFile()`, `src/app.js:302 importSharedHTML()`

- **Pre:** Select the Trash (or Starred) view.
- **Steps:**
  1. Open a new PDF via "Open PDF or bundle".
- **Expect:** The nav jumps to Home, the section label reads "My Library", and the new document is visible and active — the user is never left staring at a Trash list after opening a file.
- **Watch:** Only `openPdfFile()`/`importSharedHTML()` reset the view; attaching a bare `.notes.json` does not — verify you are still on the view you started in for that case.

### SHELL-030 - Nav rows are not keyboard reachable
**P2** * Functional * `app.html:26-29`, `src/app.js:3085 wire()`

- **Pre:** Sidebar expanded, focus in the page.
- **Steps:**
  1. Press Tab repeatedly from the top of the sidebar.
- **Expect:** Focus moves through the real `<button>`s (collapse, "Open PDF or bundle", "Share as HTML", settings gear). The four nav rows and the document rows are `<div>`s and are skipped — a known accessibility gap; confirm the mouse path still fully works and no focus ring is stranded on an invisible element.
- **Watch:** If someone adds `tabindex` without a `role`/Enter handler, the rows become focusable but still un-activatable by keyboard.

---

## 4. Document tree rows & row actions

### SHELL-031 - Row anatomy
**P0** * Visual * `src/app.js:384-387 renderTree()`, `src/styles.css:63-77`

- **Pre:** Home view, ≥ 2 documents.
- **Steps:**
  1. Inspect a non-active row, then hover it.
- **Expect:** Left-indented 20px, 16px file icon in `--faint`, then the name at 13.5px. At rest the two action buttons are invisible (`opacity:0`); on hover they fade in over 0.12 s and the row background turns `--surface-2`.
- **Watch:** Action buttons rendered but *not* transparent at rest makes every row look busy; opacity transitions dropped makes them pop harshly.

### SHELL-032 - Active row styling and the red file icon
**P0** * Visual * `src/app.js:379-385 renderTree()`

- **Pre:** Two documents.
- **Steps:**
  1. Click the inactive row.
- **Expect:** The clicked row becomes light-blue with `--blue-2` bold text; its file icon is explicitly red (`#DC2626`), which is the marker of the currently open document. The previously active row reverts to grey text and a `--faint` icon.
- **Watch:** The inline `style="color:#DC2626"` beats the `.tree-row.active .fic{color:var(--blue)}` rule — if the inline colour is removed the active icon silently turns blue.

### SHELL-033 - Long document names ellipsize and expose the full name on hover
**P1** * Visual * `src/app.js:384 renderTree()`, `src/styles.css:72`

- **Pre:** Open a PDF whose filename is ≥ 80 characters.
- **Steps:**
  1. Look at the row, then hover it for ~1 s.
- **Expect:** One line, truncated with an ellipsis, never wrapping and never pushing the star/trash buttons out of the row. The native tooltip shows the complete, un-truncated name.
- **Watch:** A name containing `"` or `<` must appear literally in the tooltip (it goes through `esc()`), not break the row markup.

### SHELL-034 - Clicking a row switches the document
**P0** * Functional * `src/app.js:388 renderTree()`, `src/app.js:203-218 switchDoc()`

- **Pre:** Two documents, notes on both.
- **Steps:**
  1. Click the inactive row.
- **Expect:** The reader loads that PDF at page 1, `#pageTotal` updates to "/ <its page count>", the notes list re-renders with only that document's notes, the note count in the footer matches, and any connector line disappears (active note is cleared).
- **Watch:** Notes from the previous document lingering for a frame; the page input still showing the old page number.

### SHELL-035 - Clicking the already-active row is a no-op re-render
**P1** * Edge * `src/app.js:204 switchDoc()`

- **Pre:** A document open, scrolled to page 6, with a note selected.
- **Steps:**
  1. Click the active (blue) row.
- **Expect:** No reload, no scroll jump, page stays 6, the selected note stays selected. Only the tree re-renders.
- **Watch:** Removing the early return makes every click on the current row reset to page 1 and drop the selection.

### SHELL-036 - Row action clicks never switch documents
**P0** * Functional * `src/app.js:388-394 renderTree()`

- **Pre:** Two documents; document A active.
- **Steps:**
  1. Hover document B's row and click its star, then its trash icon.
- **Expect:** Document A stays open throughout — the row's click handler bails on `.doc-actions`, and every action button calls `stopPropagation()`. The reader never reloads B.
- **Watch:** A newly added row action that forgets `stopPropagation()` will both act *and* switch documents.

### SHELL-037 - Star toggle: tooltip flips with state
**P1** * Copy * `src/app.js:382 renderTree()`, `src/app.js:325 toggleStar()`

- **Pre:** An unstarred document.
- **Steps:**
  1. Hover the star button, read the tooltip, click, hover again.
- **Expect:** Tooltip reads exactly "Star" before, "Unstar" after. The icon fills solid and turns amber (`#F59E0B`), and it stays visible when the row is *not* hovered (`.doc-act.star.on{opacity:1}`).
- **Watch:** The starred state must survive a reload and must be reflected instantly in the Starred view.

### SHELL-038 - Trash button tooltip and toast
**P0** * Copy * `src/app.js:383 renderTree()`, `src/app.js:333-339 trashDoc()`

- **Pre:** A non-active document in Home.
- **Steps:**
  1. Hover its trash icon (tooltip), then click it.
- **Expect:** Tooltip reads exactly "Move to trash"; the icon turns red on hover. On click the row disappears from Home with no confirmation dialog, and a toast reads exactly "Moved “<doc name>” to Trash." (curly quotes).
- **Watch:** Soft-delete must not prompt — the undo path is the Trash view; adding a confirm here would be a regression against the design.

### SHELL-039 - Trashing the active document opens the next one
**P0** * Functional * `src/app.js:328-332 openFallbackDoc()`, `src/app.js:337 trashDoc()`

- **Pre:** Three documents, the middle one active.
- **Steps:**
  1. Trash the active document.
- **Expect:** The reader immediately switches to the first remaining non-trashed document (its row turns blue, the PDF renders, notes swap). No blank reader, no error toast.
- **Watch:** With only one document left, this path must fall through to the empty reader (SHELL-102) instead of leaving the last PDF rendered under an empty tree.

### SHELL-040 - Trashing the bundled sample makes the removal stick
**P1** * State * `src/app.js:336 trashDoc()`, `src/app.js:82 migrateState()`

- **Pre:** Fresh profile with the BERT sample present.
- **Steps:**
  1. Trash "BERT — Devlin et al. 2019 (NAACL).pdf".
  2. Reload the app.
- **Expect:** The sample does **not** reappear in Home (`state.sampleDismissed`). It is still listed in Trash.
- **Watch:** This is the classic regression: any change to the auto-add in `migrateState()` resurrects the sample on every reload and the user can never get rid of it.

### SHELL-041 - Trash-view row actions: Restore
**P1** * Functional * `src/app.js:381 renderTree()`, `src/app.js:340-345 restoreDoc()`

- **Pre:** One document in Trash.
- **Steps:**
  1. Open Trash, hover the row, read the two buttons' tooltips, click the ↩ one.
- **Expect:** Tooltips read exactly "Restore" and "Delete forever". After Restore the row leaves Trash, reappears in Home, and a toast reads exactly "Restored “<doc name>”."
- **Watch:** Restoring the *sample* must also clear `sampleDismissed`, or the row vanishes again on the next reload.

### SHELL-042 - Restoring into an empty library re-opens the document
**P1** * Functional * `src/app.js:343 restoreDoc()`

- **Pre:** Trash every document so the reader shows "Your library is empty".
- **Steps:**
  1. Open Trash and restore one document.
- **Expect:** It is not only restored but opened — the reader renders it, `#pageTotal` leaves "/ 0", and its row is blue back in Home.
- **Watch:** If `state.ui.activeDoc` was left pointing at the trashed id rather than null, restore silently skips the re-open and the reader stays on the empty card.

### SHELL-043 - Trash rows do not open the document
**P2** * Edge * `src/app.js:388 renderTree()`

- **Pre:** A document in Trash.
- **Steps:**
  1. Click the row body (not the buttons).
- **Expect:** Nothing happens — trashed documents are not openable.
- **Watch:** The row still shows a pointer cursor (`.tree-row{cursor:pointer}`), which promises an action it does not deliver; confirm no accidental switch occurs.

### SHELL-044 - Permanent delete confirmation copy
**P0** * Copy * `src/app.js:346-349 purgeDoc()`

- **Pre:** A trashed document that has exactly 3 notes, and another with 0 notes.
- **Steps:**
  1. Click "Delete forever" on each.
- **Expect:** For the first: "Permanently delete “<name>” and its 3 notes? This cannot be undone." For the second: "Permanently delete “<name>”? This cannot be undone." Buttons read "Cancel" and "Delete", with Delete rendered in red (`.btn.danger`).
- **Watch:** The singular form — a document with exactly 1 note must say "and its 1 note", not "1 notes".

### SHELL-045 - Cancelling permanent delete keeps everything
**P0** * Functional * `src/app.js:349 purgeDoc()`, `src/app.js:2176 confirmDialog()`

- **Pre:** A trashed document with notes.
- **Steps:**
  1. Click "Delete forever", then press Escape. Repeat, clicking the dark backdrop. Repeat, clicking "Cancel".
- **Expect:** All three dismissals cancel — the row stays in Trash, its notes stay in state, nothing is deleted, no toast.
- **Watch:** `confirmDialog` resolves `true` on Enter — verify Enter is not fired by a stray keyboard focus immediately after the dialog opens (the OK button is auto-focused after 30 ms).

### SHELL-046 - Confirming permanent delete removes row, notes and bytes
**P0** * Functional * `src/app.js:350-355 purgeDoc()`

- **Pre:** A trashed user PDF with notes.
- **Steps:**
  1. Click "Delete forever" → "Delete".
  2. Reload the app.
- **Expect:** The row is gone from every view, its notes are gone, and after the reload it does not come back (its `pdf:<id>` IndexedDB entry was deleted). The storage meter re-measures.
- **Watch:** `idbDel()` is fire-and-forget — the meter may still count the deleted PDF's bytes until the next `updateStorage()`; a *reload* must show the reduced figure.

### SHELL-047 - Deleting the active document forever falls back correctly
**P1** * Edge * `src/app.js:354 purgeDoc()`

- **Pre:** Trash the active document (reader auto-switches), then purge it from Trash.
- **Steps:**
  1. Complete the purge.
- **Expect:** No reader flicker or double load; whichever document is open stays open; the tree, highlights and pins re-render once.
- **Watch:** `render()` and `drawHighlights()` running against a torn-down `#pageWrap` after `openFallbackDoc()` — a console error here is a real defect even if the UI looks fine.

### SHELL-048 - Many documents: tree scrolls and stays legible
**P2** * Perf * `src/styles.css:459`, `src/app.js:378-390 renderTree()`

- **Pre:** 50+ documents in the library (script the localStorage `docs` array if needed).
- **Steps:**
  1. Switch between Home / Recents / Starred rapidly 10 times.
- **Expect:** Each switch re-renders in well under a second, the scroll position resets to the top of the list, no row duplication, and hover states still work on the last row.
- **Watch:** `renderTree()` rebuilds the entire list and re-binds every handler on each call — watch for detached-node leaks and for the tree scroll jumping while the user is mid-scroll.

---

## 5. Storage meter & settings gear

### SHELL-049 - Storage block layout and label
**P1** * Visual * `app.html:36-40`, `src/styles.css:83-85`

- **Pre:** Sidebar expanded.
- **Steps:**
  1. Look at the bottom of the sidebar.
- **Expect:** A hairline top border, the word "Storage" on the left at 12px muted, the gear icon button on the right, a 6px rounded track with a blue fill below, and the usage text under that.
- **Watch:** The block must stay pinned even with an empty tree; on a phone it gets extra bottom padding for the home indicator (`env(safe-area-inset-bottom)`).

### SHELL-050 - Initial "Calculating…" is replaced
**P1** * Copy * `app.html:39`, `src/app.js:396-408 updateStorage()`

- **Pre:** Reload the app.
- **Steps:**
  1. Watch the storage text through boot.
- **Expect:** It may briefly read "Calculating…" (with the ellipsis character, not three dots) and is then replaced by a real figure. It must never remain "Calculating…" after boot completes.
- **Watch:** `updateStorage()` is only called at boot and after open/import/purge — if `navigator.storage.estimate()` rejects, the text falls through to the document-count form; if it hangs, "Calculating…" sticks forever.

### SHELL-051 - Usage/quota formatting
**P1** * Copy * `src/app.js:397-403 updateStorage()`

- **Pre:** Chromium or Firefox on `https://` (or `localhost`).
- **Steps:**
  1. Read the storage text; open a 30 MB PDF; read it again.
- **Expect:** Format is "<usage> of <quota>", e.g. "31 MB of 46.6 GB". MB values have no decimals; GB values have exactly one; sub-megabyte values show as KB. The bar width tracks usage/quota.
- **Watch:** A brand-new profile shows "1 KB of …", never "0 KB" (the formatter floors at 1 KB) — and the bar is never thinner than 2%.

### SHELL-052 - Quota-less environment says "used"
**P2** * Copy * `src/app.js:402 updateStorage()`

- **Pre:** A browser/profile where `estimate()` returns `quota: 0` (some privacy modes).
- **Steps:**
  1. Read the storage text.
- **Expect:** It reads "<usage> used", e.g. "12 MB used", and the bar falls back to 4%.
- **Watch:** Concatenating an empty quota would produce "12 MB of " with a trailing "of".

### SHELL-053 - Fallback to a document count
**P2** * Copy * `src/app.js:407 updateStorage()`

- **Pre:** A browser without `navigator.storage.estimate` (older Safari), or block the API in DevTools.
- **Steps:**
  1. Reload with 1 document, then with 3.
- **Expect:** The text reads "1 documents" and "3 documents" respectively — counting only non-trashed documents.
- **Watch:** "1 documents" is grammatically wrong; it is the current behaviour, so log it as a copy defect rather than a functional one. Also: the progress bar keeps its hard-coded 4% in this path.

### SHELL-054 - Meter refreshes after opening and after purging
**P1** * State * `src/app.js:236`, `src/app.js:246`, `src/app.js:355`

- **Pre:** Chromium, a document library.
- **Steps:**
  1. Note the figure, open a large (20 MB+) PDF, note it again.
  2. Trash that document, note the figure. Then purge it and note it again.
- **Expect:** The figure grows after the open and shrinks after the *purge*.
- **Watch:** `updateStorage()` is deliberately **not** called by `trashDoc()`/`restoreDoc()` — in the document-count fallback (SHELL-053) the count therefore goes stale after a trash until the next reload. Confirm and log.

### SHELL-055 - Settings gear tooltip and modal
**P0** * Functional * `app.html:37`, `src/app.js:3065 wire()`, `src/app.js:2760 openSettings()`

- **Pre:** Sidebar expanded.
- **Steps:**
  1. Hover the gear, then click it.
- **Expect:** Tooltip reads exactly "Settings". A modal opens over a dark backdrop, headed "Settings" with an ✕ at its right, three tabs — "AI & Tools", "Templates", "Storage" — and a footer with "Close" and "Save".
- **Watch:** The gear is 17px inside a 30px `.icon-btn`; on hover it must get the `--surface-2` square like every other icon button.

### SHELL-056 - Settings modal dismissal paths
**P1** * Functional * `src/app.js:2809-2811 openSettings()`

- **Pre:** Settings open.
- **Steps:**
  1. Click ✕. Re-open, click "Close". Re-open, click the dark backdrop outside the panel.
- **Expect:** All three close the modal without saving; the sidebar and reader are untouched behind it. Clicking *inside* the modal body never closes it.
- **Watch:** Escape is **not** wired for this modal (unlike `confirmDialog`) — confirm that pressing Escape leaves it open rather than half-closing it.

### SHELL-057 - Storage block hidden in a shared read-only file
**P2** * Functional * `src/app.js:3299 applyReadOnly()`

- **Pre:** A `.annotated.html` exported by "Share as HTML", opened directly from disk.
- **Steps:**
  1. Look at the bottom of the sidebar.
- **Expect:** The whole Storage block — meter and gear — is hidden; the tree runs to the bottom of the sidebar with no orphaned border line.
- **Watch:** `.sb-storage` is hidden via inline `display:none` on the element, so the sidebar's flex layout must not leave a gap where it was.

---

## 6. Panel collapse, drawers & scrim

### SHELL-058 - Collapse and re-open the left panel (desktop)
**P0** * Functional * `src/app.js:3060-3062 wire()`, `src/app.js:1150 setPanel()`

- **Pre:** Desktop ≥ 1200px, sidebar expanded.
- **Steps:**
  1. Click « in the sidebar.
  2. Click the newly visible left toggle in the reader top bar.
- **Expect:** The sidebar animates to 0 width and the reader widens; `#btnToggleLeft` appears with tooltip "Show library". Clicking it brings the sidebar back at 250px and hides the toggle again.
- **Watch:** Both the collapse chevron and the top-bar toggle call the same handler — if they diverge, one of them will get stuck in the wrong direction.

### SHELL-059 - Collapse and re-open the right panel (desktop)
**P0** * Functional * `src/app.js:3061-3063 wire()`

- **Pre:** Desktop, notes panel open.
- **Steps:**
  1. Click » in the notes header (tooltip "Collapse").
  2. Click `#btnToggleRight` (tooltip "Show notes").
- **Expect:** Notes collapse to 0 width, the reader widens, the toggle appears in the top bar; clicking it restores the panel at its current width (default 384px, or the user's saved width — see SHELL-076).
- **Watch:** Restoring must use the saved `--right-w`, not snap back to 384px.

### SHELL-060 - The connector line disappears while notes are collapsed
**P1** * Visual * `src/app.js:1164 drawConnector()`

- **Pre:** A note selected with a visible dashed connector from its pin to its card.
- **Steps:**
  1. Collapse the notes panel.
  2. Re-open it.
- **Expect:** The dashed line vanishes the moment the panel collapses (no line dangling off the right edge) and is redrawn to the correct card on re-open.
- **Watch:** `setPanel()` redraws on the next animation frame, before the 0.18 s transition finishes — a line drawn to a stale card position that then "snaps" is the visible symptom.

### SHELL-061 - Creating a note auto-opens the collapsed notes panel
**P0** * Functional * `src/app.js:1132-1137 openRightPanel()`

- **Pre:** Notes panel collapsed; a PDF with selectable text open.
- **Steps:**
  1. Select a sentence and choose "Note" in the selection popover.
- **Expect:** The notes panel slides open by itself, and ~0.2 s later the new card is scrolled into view with the connector drawn to its pin.
- **Watch:** The 210 ms settle timer is tuned to the 0.18 s CSS transition — lengthening the transition without updating the timer leaves the card un-scrolled and the connector mis-aimed.

### SHELL-062 - Highlighting alone does NOT open the notes panel
**P1** * Functional * `src/app.js:895`

- **Pre:** Notes panel collapsed.
- **Steps:**
  1. Select text and click "Highlight" in the selection popover.
- **Expect:** The panel stays collapsed — highlighting is deliberately silent. Only Note / Ask AI / comment / screenshot reveal the panel.
- **Watch:** A refactor that routes all creation through `openRightPanel()` makes quiet highlighting pop the panel on every pass.

### SHELL-063 - Both panels collapsed leaves a usable reader
**P1** * Visual * `src/styles.css:30-31`, `src/styles.css:461-463`

- **Pre:** Desktop.
- **Steps:**
  1. Collapse both panels.
- **Expect:** The reader spans the full window; both top-bar toggles are visible at the far left and far right of the toolbar; the page re-centres. No 1px sliver of either aside remains visible.
- **Watch:** `#sidebar`/`#notes` keep `overflow:clip` — content bleeding out of a 0-width column is the failure mode.

### SHELL-064 - Library is unreachable between 821px and 1100px
**P1** * Regression * `src/styles.css:538`, `src/styles.css:461-463`

- **Pre:** Desktop browser; sidebar expanded at full width.
- **Steps:**
  1. Resize the window to ~1000px wide.
  2. Try to reach the library: look for the sidebar, then for a left toggle in the reader top bar.
- **Expect (intended):** At any width the library is either visible or re-openable via `#btnToggleLeft`.
- **Watch:** As shipped this fails. `@media (max-width:1100px)` sets `--left-w:0px` on `:root`, so `#app` inherits a zero-width first column, while `#btnToggleLeft` only renders when `#app` carries `.collapse-left`. Between 821px and 1100px the sidebar is 0 wide *and* the toggle is hidden — and if the panel was collapsed, clicking the toggle removes the class, hides the toggle and still leaves the column at 0. Verify on every layout change; the fix belongs in the media query, not in JS.

### SHELL-065 - Drawer mode below 820px
**P0** * Visual * `src/styles.css:544-557`

- **Pre:** Window ≤ 820px (or a phone).
- **Steps:**
  1. Open the library drawer via the left toggle.
- **Expect:** The grid becomes a single column; the sidebar slides in from the left over the page at `min(80vw,290px)` with a large shadow, and a dark scrim covers the reader behind it. The reader does not resize or reflow.
- **Watch:** The reader must not shrink — a drawer that still takes a grid column at 390px leaves ~50px of page.

### SHELL-066 - Only one drawer at a time
**P0** * Functional * `src/app.js:1152-1156 setPanel()`

- **Pre:** Window ≤ 820px, library drawer open.
- **Steps:**
  1. Tap the right toggle to open notes.
- **Expect:** The notes drawer opens and the library drawer closes in the same gesture; the scrim stays up. Reversing the order behaves symmetrically.
- **Watch:** Both drawers open simultaneously (overlapping shadows, scrim stuck) when `drawerMQ.matches` is evaluated stale after a rotate.

### SHELL-067 - Scrim closes both drawers
**P0** * Functional * `src/app.js:3064 wire()`, `src/styles.css:555-557`

- **Pre:** ≤ 820px, either drawer open.
- **Steps:**
  1. Tap the dimmed area over the reader.
- **Expect:** The open drawer slides out, the scrim fades to transparent and stops intercepting taps (`pointer-events:none`), and the reader is immediately interactive again.
- **Watch:** The scrim staying click-blocking after close makes the whole page feel frozen — the single worst failure mode in this section.

### SHELL-068 - Scrim never appears on desktop
**P1** * Visual * `src/styles.css:32`

- **Pre:** Desktop ≥ 1200px.
- **Steps:**
  1. Collapse and expand both panels several times.
- **Expect:** No dimming layer ever appears; `#scrim` stays `display:none` outside the ≤ 820px media query.
- **Watch:** A `#scrim` moved out of the media query would silently block every desktop click.

### SHELL-069 - Connector lines are suppressed at drawer widths
**P2** * Visual * `src/styles.css:560`

- **Pre:** ≤ 820px, a note selected, notes drawer open.
- **Steps:**
  1. Look for the dashed connector between the pin and the card.
- **Expect:** No connector is drawn — the drawer covers the passage it would point at.
- **Watch:** Re-enabling `#connectors` here paints a line across the drawer's shadow.

### SHELL-070 - Rotating / resizing across the 820px boundary mid-use
**P1** * Edge * `src/app.js:1139 drawerMQ`, `src/styles.css:544`

- **Pre:** Start on a desktop-width window with both panels open and a note selected.
- **Steps:**
  1. Drag the window down to ~600px, then back up to 1400px.
  2. Repeat while a drawer is open.
- **Expect:** Panels convert to drawers and back without either disappearing permanently; the note stays selected; the connector reappears only above 820px. No duplicate scrim.
- **Watch:** State keys are shared between the two modes (`.collapse-*` means "closed" in both) — the classic bug is arriving on desktop with a panel invisibly collapsed and no obvious way back (see SHELL-064).

### SHELL-071 - Drawer bottom clears the on-screen keyboard
**P2** * Visual * `src/styles.css:548`, `src/app.js` `initKeyboardInset()`

- **Pre:** iOS or Android phone, notes drawer open.
- **Steps:**
  1. Tap the composer at the bottom of the notes drawer so the keyboard opens.
- **Expect:** The drawer's bottom rides above the keyboard (`bottom:var(--kb)`), so the composer and its send button stay visible and tappable.
- **Watch:** iOS keeps the layout viewport at full height — without `--kb` the composer hides under the keyboard, which is exactly what this rule exists to prevent.

---

## 7. Column splitter (drag to resize)

### SHELL-072 - The splitter exists and advertises itself
**P1** * Visual * `src/app.js:3221-3224 initPanelResize()`, `src/styles.css:614-616`

- **Pre:** Desktop, notes panel open.
- **Steps:**
  1. Move the cursor onto the left edge of the notes panel and hover for ~1 s.
- **Expect:** The cursor becomes a col-resize arrow over an 8px hot zone, a 2px blue line appears on the edge, and the native tooltip reads exactly "Drag to resize · double-click to reset".
- **Watch:** The grip is `position:absolute; left:0` inside `#notes`, so it sits on top of the leftmost 8px of every note card — verify a click there does not swallow card clicks (SHELL-080).

### SHELL-073 - Dragging resizes the notes panel live
**P0** * Functional * `src/app.js:3226-3242 initPanelResize()`, `src/app.js:3218 setRightW()`

- **Pre:** Desktop ≥ 1400px.
- **Steps:**
  1. Drag the splitter left ~150px, release.
- **Expect:** The notes panel widens as you drag (the reader narrows in step), with no animation lag — `body.col-resizing` disables the grid transition. Text selection is suppressed while dragging and the cursor stays col-resize over the whole page.
- **Watch:** Missing `user-select:none` makes the drag select note text; a leftover `col-resizing` class after release leaves the whole page stuck with a resize cursor.

### SHELL-074 - Width clamps at both ends
**P1** * Edge * `src/app.js:3214-3217 clampRightW()`

- **Pre:** Desktop at exactly 1440px wide.
- **Steps:**
  1. Drag the splitter as far right as it will go, then as far left as it will go.
- **Expect:** The panel never goes below 300px, and never exceeds `min(760, max(340, 1440-460))` = 760px. The reader column always keeps a usable width — the page never gets pushed to zero.
- **Watch:** Off-by-one in the clamp lets the reader collapse; verify at 1024px too, where the max becomes 564px.

### SHELL-075 - Double-click resets to the default width
**P1** * Functional * `src/app.js:3245 initPanelResize()`

- **Pre:** Notes panel resized to something clearly non-default.
- **Steps:**
  1. Double-click the splitter.
  2. Reload the page.
- **Expect:** The panel snaps back to 384px immediately, and stays 384px after the reload (the reset is persisted).
- **Watch:** The reset writes a literal `384` — if `--right-w`'s default changes in CSS, this constant must change with it or reset stops matching a fresh install.

### SHELL-076 - Width persists across reloads
**P1** * State * `src/app.js:3231`, `src/app.js:3220 applyPanelWidths()`

- **Pre:** Desktop.
- **Steps:**
  1. Drag the panel to ~600px, release, reload.
- **Expect:** The panel comes back at ~600px, applied before the first paint (no visible jump from 384px to 600px).
- **Watch:** `applyPanelWidths()` runs after `wire()` in `boot()` — a wider gap before it produces a visible resize flash.

### SHELL-077 - No resize while the panel is collapsed
**P1** * Edge * `src/app.js:3237 initPanelResize()`

- **Pre:** Notes panel collapsed (`»` clicked).
- **Steps:**
  1. Press and drag at the far-right edge of the reader, where the splitter used to be.
- **Expect:** Nothing resizes, no `col-resizing` cursor, no stray blue line. Re-opening the panel restores the previous width.
- **Watch:** A drag started while collapsed would write a nonsense width into `state.settings.rightW` and persist it.

### SHELL-078 - Splitter is hidden at drawer widths
**P1** * Visual * `src/styles.css:561`

- **Pre:** Window ≤ 820px, notes drawer open.
- **Steps:**
  1. Try to hover/drag the drawer's left edge.
- **Expect:** No resize cursor, no drag — the drawer's width is fixed at `min(92vw,380px)`.
- **Watch:** A visible splitter here fights the drawer's `transform` animation and can strand the drawer half-open.

### SHELL-079 - Touch drag works on a tablet
**P2** * Functional * `src/app.js:3241-3244 initPanelResize()`

- **Pre:** A touch device wider than 820px (iPad landscape).
- **Steps:**
  1. Press and drag the splitter with a finger.
- **Expect:** The panel resizes and the page does not scroll or rubber-band while dragging (`touch-action:none` plus `preventDefault`), and the width is saved on lift.
- **Watch:** `touchmove` is registered non-passive on purpose — making it passive re-enables page scrolling mid-drag.

### SHELL-080 - Resizing keeps the connector attached
**P1** * Visual * `src/app.js:3234 initPanelResize()`

- **Pre:** Desktop, a note selected with a visible connector.
- **Steps:**
  1. Drag the splitter left and right several times, then release.
- **Expect:** On release the dashed connector is redrawn to the card's new position (it may lag during the drag). It never points off-screen or to the old position.
- **Watch:** The redraw only happens on `mouseup` — if the drag ends outside the window (release over the browser chrome), verify the connector still corrects itself.

### SHELL-081 - Stored width outlives a window shrink
**P1** * Edge * `src/app.js:3218 setRightW()`, `src/app.js:3176 wire()`

- **Pre:** Desktop at 1800px; drag the notes panel to ~750px.
- **Steps:**
  1. Without touching the splitter, resize the browser window down to ~1000px.
- **Expect (intended):** The reader keeps a readable column.
- **Watch:** `--right-w` is written as an inline style on `:root` and is **not** re-clamped on window resize, and an inline value also overrides the `@media (max-width:1100px){--right-w:340px}` rule — so a 750px notes panel persists in a 1000px window and squeezes the page. Combined with SHELL-064 this can leave the reader with a very narrow column.

---

## 8. Notes panel chrome & injected buttons

### SHELL-082 - Notes header title and button row
**P0** * Visual * `app.html:89-96`, `src/app.js:2618-2633 injectNotesButtons()`

- **Pre:** App loaded (any document).
- **Steps:**
  1. Read the notes panel header left to right.
- **Expect:** The word "Notes" at 20px bold, then a row of icon buttons in this order: save (floppy), import (arrow-into-file), PDF badge, funnel, search, trash, and finally » .
- **Watch:** `injectNotesButtons()` inserts each button *before* `#btnFilter` — inserting in the wrong order, or running the function twice, reorders or duplicates the row.

### SHELL-083 - The legacy "⋯" and "⋮" menus are gone
**P1** * Regression * `src/app.js:2621 injectNotesButtons()`

- **Pre:** App loaded.
- **Steps:**
  1. Look at the reader toolbar's right end and at the notes header.
- **Expect:** No "⋯" button in the reader toolbar and no vertical-dots "⋮" button in the notes header — both are removed at boot in favour of labelled buttons.
- **Watch:** If `injectNotesButtons()` bails early (e.g. `#btnFilter` missing), both legacy buttons reappear — an instant tell that the injection did not run.

### SHELL-084 - Injected button tooltips
**P0** * Copy * `src/app.js:2628-2632 injectNotesButtons()`

- **Pre:** App loaded.
- **Steps:**
  1. Hover each injected button in turn.
- **Expect:** Verbatim: "Save notes (JSON; auto-saves to your folder when one is set)", "Import notes from a JSON file", "Export annotations to PDF", "Delete all notes for this document".
- **Watch:** These are the only labels these icon-only buttons have — a dropped `title` makes the row unusable for anyone who does not already know the icons.

### SHELL-085 - Save notes → native Save As
**P0** * Functional * Chromium only * `src/app.js:2607-2617 saveNotesNow()`, `src/app.js:2503 saveAsFile()`

- **Pre:** Chrome/Edge, a document with ≥ 1 note, no sync folder configured.
- **Steps:**
  1. Click the save button.
- **Expect:** A native Save As dialog pre-filled with `<document name>.notes.json`. On save, a toast "Saved <file name>." On Cancel, **nothing** is written and no toast appears.
- **Watch:** Cancel must not fall through to a silent download — that was the whole point of the Save As work.

### SHELL-086 - Save notes → one-time tip in Firefox/Safari
**P1** * Functional * Firefox/Safari only * `src/app.js:2460-2496 maybeShowSaveAsTip()`

- **Pre:** Firefox (or Safari). Clear `localStorage['srw_saveas_tip']` first.
- **Steps:**
  1. Click the save button.
- **Expect:** A modal headed "Choose where your files save" with the sentence "In Firefox, turn on one setting to pick where each download goes — and overwrite instead of piling up “(1)” copies." (Safari says "In Safari"), a numbered stepper, a highlighted setting box reading "Always ask you where to save files" (Firefox) / "Ask for each download" (Safari), and a single "Got it" button. The notes file also downloads.
  2. Click "Got it", then click save again — the modal must **not** reappear.
- **Watch:** The tip must never appear in Chrome/Edge (gated on `'showSaveFilePicker' in window`); Escape and Enter both dismiss it.

### SHELL-087 - Save button "saved" flash
**P2** * Visual * `src/app.js:2602 flashSaved()`, `src/styles.css:119`

- **Pre:** Any browser, a document with notes.
- **Steps:**
  1. Complete a save and watch the save button for ~1.5 s.
- **Expect (intended):** The button briefly turns green with a pale green background, then reverts.
- **Watch:** As shipped this does not render: `flashSaved()` adds only the `saved` class, but the rule is `.icon-btn.save-btn.saved` and nothing ever adds `save-btn`. Log it as a cosmetic defect; it is also the check that proves any fix works.

### SHELL-088 - Import notes button opens a JSON picker
**P1** * Functional * `src/app.js:2533-2537 importNotesJSON()`

- **Pre:** A document open.
- **Steps:**
  1. Click the import button, pick a valid `.notes.json` exported from the same document.
  2. Repeat with a `.json` file that is not a notes file.
- **Expect:** First: a toast "<n> notes imported." and the cards appear. Second: a toast "That file has no notes to import." (or "Could not read that JSON: …" for malformed JSON), styled as an error (dark red) and lasting ~6 s.
- **Watch:** Import **replaces** this document's notes (no merge) — verify the existing notes are gone afterwards, which is the documented behaviour and easy to regress into a merge.

### SHELL-089 - Export-to-PDF button opens the export view
**P1** * Functional * `src/app.js:2630 injectNotesButtons()`, `src/app.js:2846 openExport()`

- **Pre:** A document with notes.
- **Steps:**
  1. Click the PDF-badge button.
- **Expect:** A full-screen export view opens with "← Back to document" at the top-left, "Preview" and "⭳ Export PDF" at the top-right, and an "Export annotations" options column. "← Back to document" returns to the shell with the sidebar, tree and notes panel exactly as they were.
- **Watch:** The export view is `position:fixed; z-index:100` — the shell underneath must not scroll while it is open.

### SHELL-090 - Delete-all-notes with zero notes
**P1** * Edge * `src/app.js:2634-2636 clearActiveNotes()`

- **Pre:** A document with no notes (open a fresh PDF).
- **Steps:**
  1. Click the trash button in the notes header.
- **Expect:** No confirmation dialog. A plain toast reads exactly "No notes to delete for this document."
- **Watch:** Showing a confirm dialog for an empty document is the regression; so is deleting another document's notes.

### SHELL-091 - Delete-all-notes confirmation and result
**P0** * Copy * `src/app.js:2637-2640 clearActiveNotes()`

- **Pre:** The BERT sample with its seeded notes.
- **Steps:**
  1. Click the notes trash button, read the dialog, click "Cancel".
  2. Repeat and click "Delete all".
- **Expect:** The dialog reads "Delete all <n> notes for “BERT — Devlin et al. 2019 (NAACL).pdf”? This cannot be undone." with buttons "Cancel" and a red "Delete all". Cancel changes nothing. Confirming empties the list, shows the notes empty state, removes every highlight and pin from the page, and toasts "Deleted all notes for this document."
- **Watch:** Singular form for exactly one note ("Delete all 1 note for …"); notes belonging to other documents must survive.

### SHELL-092 - Notes search bar toggle
**P1** * Functional * `src/app.js:3154-3159 wire()`, `app.html:98-101`

- **Pre:** Notes panel open with several notes.
- **Steps:**
  1. Click the search icon (tooltip "Search notes").
  2. Type a word that matches one note, then click the search icon again.
- **Expect:** A bordered search row appears under the header with placeholder exactly "Search notes, answers, tags…" and receives focus immediately; the border turns blue with a soft ring on focus. Typing filters the list live. Clicking the icon again hides the bar, clears the query, and restores the full list.
- **Watch:** Hiding the bar must clear `state.ui.query` — leaving it set filters an invisible search and looks like data loss.

### SHELL-093 - Notes list empty states
**P0** * Copy * `src/app.js:2095-2099 render()`

- **Pre:** A document with notes.
- **Steps:**
  1. Search for a string that matches nothing.
  2. Clear the search, set a filter (funnel → "Screenshots") that matches nothing.
  3. Delete all notes.
- **Expect:** Verbatim, centred in `--faint` 13px: "No notes match “<your query>”." / "No notes match this filter." / "No notes yet." on the first line with "Select text or capture a figure in the document to create a source-linked note." on the second.
- **Watch:** The query is echoed through `esc()` — searching for `<b>` must display the literal text, not render bold.

### SHELL-094 - Note count footer copy
**P1** * Copy * `src/app.js:2107-2109 render()`, `app.html:104`

- **Pre:** A document with exactly 1 note, then one with several.
- **Steps:**
  1. Read the bottom-left of the notes panel in each case.
  2. Apply the funnel filter "AI replies".
- **Expect:** "1 note" then "<n> notes". With a non-"all" filter the text becomes "<n> notes · AI replies".
- **Watch:** The number is the count of **all** notes on the active document, not the filtered count — so "12 notes · Screenshots" can sit under a list of 2 cards. Confirm that is what you see, and that switching documents updates it.

### SHELL-095 - Sort button toggles label and order
**P1** * Functional * `src/app.js:3173 wire()`

- **Pre:** Notes with different pages and creation times.
- **Steps:**
  1. Read the button (bottom-right of the notes panel), click it, read it again.
- **Expect:** "Sorted by time ▾" → "Sorted by page ▾", and the cards reorder accordingly (page order also groups by anchor number). Day separators appear only in time order.
- **Watch:** The button is a real `<button>` in muted grey — it must not look like static text.

### SHELL-096 - Sort label is stale after a reload
**P1** * Regression * `src/app.js:3173 wire()`, `app.html:104`

- **Pre:** Notes panel open.
- **Steps:**
  1. Click the sort button so it reads "Sorted by page ▾".
  2. Reload the page and read the button, then compare the card order with the page numbers.
- **Expect (intended):** The button reads "Sorted by page ▾" and the cards are in page order.
- **Watch:** As shipped the sort *order* is restored from state but the label is not — `app.html` hard-codes "Sorted by time ▾" and nothing re-syncs it at boot, so the button lies until it is clicked (and the first click then silently flips to time order). Same for choosing "By page order" from the funnel popover and reloading.

### SHELL-097 - Composer placeholder is overridden at boot
**P1** * Copy * `src/app.js:3165 wire()`, `app.html:109`

- **Pre:** App loaded.
- **Steps:**
  1. Look at the empty composer at the bottom of the notes panel.
- **Expect:** The placeholder reads exactly "Ask about this document…" — the document-level ask box. The send button is a solid blue rounded square with a paper-plane glyph; the box gets a blue border and ring when focused.
- **Watch:** Seeing the markup default "Select text or a figure to start a note…" means `wire()` aborted before line 3165 — treat it as a boot failure, not a copy nit.

---

## 9. Empty, error & read-only states

### SHELL-098 - Filter popover anatomy and dismissal
**P2** * Visual * `src/app.js:2248-2257 openFilterPopover()`, `src/app.js:2231-2245 openPopover()`

- **Pre:** Notes panel open.
- **Steps:**
  1. Click the funnel (tooltip "Filter & options").
  2. Click a filter row, then click somewhere outside the popover.
- **Expect:** A white rounded card appears just under the funnel, right-aligned and kept ≥ 8px from the window edge, containing the label "Show" over rows "All notes", "Unresolved", "Screenshots", "AI replies", "Questions"; a divider; the label "Sort" over "By time" and "By page order"; a divider; and "Auto-scroll to active note" with a switch on the right. The current selections are blue and bold; clicking a row keeps the popover open. Clicking outside closes it.
- **Watch:** Near the right edge of a narrow window the popover must not overflow the viewport; only one popover can be open at a time.

### SHELL-099 - Popover survives a window resize
**P2** * Edge * `src/app.js:2242-2244 openPopover()`

- **Pre:** Filter popover open.
- **Steps:**
  1. Resize the window while it is open.
- **Expect:** The popover either stays anchored under the funnel or closes — it must never float detached in the middle of the page over the reader.
- **Watch:** It is `position:fixed` with coordinates computed once at open time; there is no reposition listener.

### SHELL-100 - Sandboxed/blocked-engine fallback card
**P1** * Copy * `src/app.js:3180-3195 showReaderFallback()`

- **Pre:** Block `vendor/pdf.min.js` (or open the app inside a sandboxed preview iframe).
- **Steps:**
  1. Reload and read the card in the reader.
- **Expect:** A white card with a 📄 glyph, the heading "Open this file directly to read the PDF", a paragraph beginning "The PDF engine and live AI calls can't run inside this embedded, sandboxed preview." and, in a smaller grey line, "Engine note: PDF engine did not start — likely a sandboxed preview. Open the downloaded file directly."
- **Watch:** The second paragraph still says "You can also use **New** to open your own PDF once running locally" — the sidebar button is now "Open PDF or bundle", so this is a live copy inconsistency to log.

### SHELL-101 - Fallback preserves the overlay nodes
**P1** * Regression * `src/app.js:3181-3185 showReaderFallback()`

- **Pre:** Trigger the fallback (SHELL-100), then recover by clicking a working document row.
- **Steps:**
  1. After the fallback shows, open the browser console.
  2. Click another document row and confirm the PDF renders with its highlights and pins.
- **Expect:** No console errors while the fallback is up; `#pageWrap` is only hidden, never removed, so highlights and pins redraw correctly once a document loads.
- **Watch:** This is a fixed bug with a documented history — destroying `#pageWrap` here nulls `#overlay`/`#pins` and crashes `drawHighlights()`/`drawPins()`.

### SHELL-102 - Empty-library reader card
**P0** * Copy * `src/app.js:3197-3210 showEmptyReader()`

- **Pre:** Trash every document, including the sample.
- **Steps:**
  1. Read the reader area and the page counter.
- **Expect:** A card with 📄, the heading "Your library is empty", and the line "Use **Open PDF or bundle** (top-left) to open a paper, its notes, or a shared **.html**." The page total reads "/ 0". The tree shows "No documents yet — use “Open PDF or bundle” to add one."
- **Watch:** Continuous mode must be torn down here — leftover `#contPages` placeholders behind the card is the failure mode.

### SHELL-103 - Empty library persists across reload
**P1** * State * `src/app.js:3326-3336 boot()`

- **Pre:** Empty library (SHELL-102).
- **Steps:**
  1. Reload the app.
- **Expect:** The empty state is still shown; no document is auto-resurrected, including the sample. Opening a PDF from here works normally and clears the card.
- **Watch:** `boot()` only re-seeds the sample when `state.sampleDismissed` is false — a state migration that drops that flag makes the sample come back and looks like the user's deletion was undone.

### SHELL-104 - Read-only shared file hides every editing affordance
**P1** * Functional * `src/app.js:3294-3302 applyReadOnly()`

- **Pre:** A `.annotated.html` produced by "Share as HTML", opened from disk (file://).
- **Steps:**
  1. Inspect the sidebar and the notes header.
- **Expect:** "Open PDF or bundle", "Share as HTML", the settings gear, the Storage block, the composer, and the notes save/import/trash buttons are all hidden. The library shows one row with the shared paper's name. A dark bar is pinned to the bottom reading "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX" with "pairedx.com" as a link.
- **Watch:** The export-to-PDF button and the notes search/funnel are deliberately *not* hidden — confirm they still work and do not attempt to write state.

### SHELL-105 - Read-only file: trashing the only document
**P2** * Edge * `src/app.js:333 trashDoc()`, `src/app.js:152 save()`

- **Pre:** The read-only shared file open.
- **Steps:**
  1. Hover the single library row and click its trash icon.
- **Expect:** The row moves to Trash and the reader shows "Your library is empty" — but reloading the file restores everything, because `save()` is a no-op in read-only mode.
- **Watch:** The row actions are still live in a read-only file; the acceptable outcome is "recoverable by reload", not a permanently broken share.

### SHELL-106 - Toasts stack and clear
**P2** * Visual * `src/app.js:29-34 toast()`, `src/styles.css:356-360`

- **Pre:** App open.
- **Steps:**
  1. Trigger three toasts quickly (star/trash/restore a document).
  2. Trigger an error toast (import an invalid JSON).
- **Expect:** Toasts stack bottom-centre with 8px gaps, capped at 520px wide; normal toasts fade after ~3.2 s and are removed at 3.7 s; error toasts are dark red and last ~6 s. At ≤ 820px they sit above the floating tools bar.
- **Watch:** Toast nodes that are faded but never removed accumulate in `#toasts` and eventually block clicks at the bottom of the screen.

---

## 10. Persistence, stress & cross-cutting edges

### SHELL-107 - Full shell state round-trips through a reload
**P0** * State * `src/app.js:151-168 save()`, `src/app.js:3303 boot()`

- **Pre:** Desktop.
- **Steps:**
  1. Set: library view = Recents, star one document, collapse the left panel, resize the notes panel to ~500px, open a non-default document.
  2. Reload.
- **Expect:** All five survive — Recents is the active nav row with the label "Recents", the star is still amber, the sidebar is collapsed with "Show library" available, the notes panel is ~500px, and the same document is open.
- **Watch:** `save()` is debounced 250 ms — reloading immediately after the last click can lose the final change; repeat with a 1 s pause to distinguish a debounce race from a real persistence bug.

### SHELL-108 - Rapid double-click on panel toggles
**P1** * Edge * `src/app.js:1150 setPanel()`

- **Pre:** Desktop.
- **Steps:**
  1. Double-click « quickly. Then double-click `#btnToggleLeft` quickly. Repeat for the right panel.
- **Expect:** The panel ends in a consistent state matching its class (open shows the panel and hides the top-bar toggle; closed does the inverse). No state where both the sidebar and its "Show library" toggle are visible, and none where neither is.
- **Watch:** The toggle handler reads `state.ui.collapseLeft` at click time, so a click landing mid-transition is still correct — but a `classList.toggle()` without the explicit boolean would desynchronise class from state.

### SHELL-109 - Rapid document switching
**P1** * Edge * `src/app.js:203-218 switchDoc()`

- **Pre:** Three documents with different page counts.
- **Steps:**
  1. Click A, B, C, A, B as fast as you can.
- **Expect:** The reader settles on the last clicked document, `#pageTotal` matches *that* document, the blue row is that document's, and the notes list contains only its notes. No mixed-document highlights on the page.
- **Watch:** `loadDocBytes()` + `initPdf()` are async with no cancellation — a slow earlier load resolving last can render document A's pages under document B's row highlight. Verify with a large PDF as A.

### SHELL-110 - Switching documents mid-AI-answer
**P1** * Edge * `src/app.js:203-211 switchDoc()`

- **Pre:** Ask a question so an AI answer is streaming into a note.
- **Steps:**
  1. While it is still streaming, click another document row.
- **Expect:** The reader and notes swap to the new document; no half-written answer appears in the new document's list; returning to the first document shows the answer either complete or cleanly stopped, never duplicated.
- **Watch:** `state.ui.activeId` is cleared on switch but a streaming writer that keeps appending will write into a note the user can no longer see.

### SHELL-111 - Offline behaviour of the shell
**P1** * Edge * `src/app.js:396 updateStorage()`, `src/app.js:2553 exportSelfContainedHTML()`

- **Pre:** Load the app fully, then go offline (DevTools → Network → Offline).
- **Steps:**
  1. Switch documents, star/trash/restore, collapse panels, resize the notes panel.
  2. Click "Share as HTML".
- **Expect:** Everything in steps 1 works — the shell, the tree, storage and PDF rendering are all local. "Share as HTML" refetches `/app.html`, `/src/*` and `/vendor/*`; offline it must fail with an error toast beginning "Could not build the file: " and never leave a half-written file or a stuck "Building shareable file…" state.
- **Watch:** A rejected `fetch` inside `Promise.all` must be caught — an unhandled rejection here leaves no user-visible feedback at all.

### SHELL-112 - Very large PDF does not freeze the shell
**P2** * Perf * `src/app.js:219-249 openPdfFile()`

- **Pre:** A 100 MB+ / 500-page PDF.
- **Steps:**
  1. Open it and immediately try to collapse a panel and click a nav view.
- **Expect:** The panel toggle and nav clicks stay responsive while the file hashes and loads; the tree row appears once the load completes; the storage meter grows afterwards.
- **Watch:** `sha256Hex()` runs over the whole buffer on the main thread — a multi-second freeze on open is the expected symptom to measure and report.

### SHELL-113 - Storage quota exceeded surfaces a warning
**P2** * Edge * `src/app.js:163-166 save()`

- **Pre:** Fill localStorage close to its limit (add many long notes, or pre-load a large dummy key).
- **Steps:**
  1. Add another note so a save is attempted.
- **Expect:** An error toast reads exactly "Storage limit reached — export your notes to keep them." The UI keeps working; nothing else is thrown.
- **Watch:** Non-quota storage errors (an opaque-origin sandbox raising SecurityError) must stay silent — a toast on every keystroke there would be a regression.

### SHELL-114 - Corrupt saved state degrades gracefully
**P1** * Edge * `src/app.js:74 loadState()`, `src/app.js:76-118 migrateState()`

- **Pre:** In DevTools, set `localStorage['srw_state_v1']` to `{"docs":"nope","ui":null}` and reload. Then set it to `not json at all` and reload.
- **Expect:** Both times the app boots into a usable shell: a document list (the sample is re-added when `docs` is not an array), the Home view, the storage meter populated, and no blank page.
- **Watch:** `migrateState()` assumes `s.docs` becomes an array — verify `renderTree()` does not throw on the first render, which would leave the sidebar permanently empty.

### SHELL-115 - Second tab of the same app
**P2** * Edge * `src/app.js:151 save()`

- **Pre:** The app open in tab 1 with a document library.
- **Steps:**
  1. Open `/app.html` in a second tab, trash a document there, then return to tab 1 and trash a different one.
  2. Reload tab 1.
- **Expect:** No crash and no data-destroying surprise beyond last-write-wins on `srw_state_v1` — document the observed outcome. Both tabs must still render a valid tree.
- **Watch:** There is no `storage` event listener, so the two tabs never reconcile; the second tab's write silently discards the first tab's changes on the next save.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `#app` grid + `.collapse-left`/`.collapse-right` `src/styles.css:27-31` | SHELL-001, SHELL-008, SHELL-058, SHELL-059, SHELL-063, SHELL-064 |
| `#sidebar` layout + `.sb-scroll` `src/styles.css:35-36,457-459` | SHELL-002, SHELL-048 |
| `.brand` "Px" `app.html:18` | SHELL-010 |
| `#btnCollapseLeft` title "Collapse" `app.html:19` | SHELL-020, SHELL-058, SHELL-108 |
| `#newBtn` "Open PDF or bundle" + title `app.html:21` | SHELL-011, SHELL-012, SHELL-013, SHELL-028, SHELL-102, SHELL-104 |
| `#fileInput` accept/multiple `app.html:22` | SHELL-012, SHELL-016 |
| `#btnShareHtml` "Share as HTML" + title `app.html:23` | SHELL-018, SHELL-019, SHELL-104, SHELL-111 |
| `openFiles()` src/app.js:255 | SHELL-016 |
| `openPdfFile()` src/app.js:219 | SHELL-014, SHELL-015, SHELL-029, SHELL-054, SHELL-112 |
| `importSharedHTML()` src/app.js:279 | SHELL-029, SHELL-104 |
| `.nav-item[data-view]` Home/Recents/Starred/Trash `app.html:26-29` | SHELL-021, SHELL-022, SHELL-030, SHELL-107 |
| `#libSecLabel` label map `src/app.js:370` | SHELL-023 |
| `docsForView()` src/app.js:357 | SHELL-024, SHELL-025, SHELL-026, SHELL-027 |
| `renderTree()` src/app.js:368 | SHELL-022, SHELL-028, SHELL-031, SHELL-032, SHELL-033, SHELL-034, SHELL-036, SHELL-048, SHELL-114 |
| `.lib-empty` copy `src/app.js:375` | SHELL-028, SHELL-102 |
| `.tree-row.doc-row` / `.doc-name` / `.fic` `src/styles.css:63-77` | SHELL-031, SHELL-032, SHELL-033, SHELL-043 |
| `switchDoc()` src/app.js:203 | SHELL-017, SHELL-034, SHELL-035, SHELL-109, SHELL-110 |
| `toggleStar()` src/app.js:325 | SHELL-026, SHELL-037, SHELL-107 |
| `trashDoc()` src/app.js:333 | SHELL-038, SHELL-039, SHELL-040, SHELL-054, SHELL-105 |
| `openFallbackDoc()` src/app.js:328 | SHELL-039, SHELL-047, SHELL-102 |
| `restoreDoc()` src/app.js:340 | SHELL-041, SHELL-042 |
| `purgeDoc()` src/app.js:346 | SHELL-044, SHELL-045, SHELL-046, SHELL-047, SHELL-054 |
| `confirmDialog()` src/app.js:2176 | SHELL-045, SHELL-091 |
| `.sb-storage` / `#storageBar` / `#storageText` `app.html:36-40` | SHELL-049, SHELL-050, SHELL-057 |
| `updateStorage()` src/app.js:396 | SHELL-050, SHELL-051, SHELL-052, SHELL-053, SHELL-054, SHELL-111 |
| `#btnSettings` title "Settings" `app.html:37` | SHELL-055, SHELL-056, SHELL-104 |
| `openSettings()` src/app.js:2760 | SHELL-055, SHELL-056 |
| `setPanel()` src/app.js:1150 | SHELL-058, SHELL-059, SHELL-066, SHELL-067, SHELL-108 |
| `openRightPanel()` src/app.js:1132 | SHELL-061, SHELL-062 |
| `drawConnector()` src/app.js:1162 | SHELL-060, SHELL-069, SHELL-080 |
| `isNarrowViewport()` src/app.js:1144 | SHELL-006, SHELL-007 |
| `boot()` panel/zoom restore src/app.js:3303-3322 | SHELL-004, SHELL-005, SHELL-006, SHELL-009, SHELL-103, SHELL-107 |
| `#btnToggleLeft` "Show library" / `#btnToggleRight` "Show notes" `app.html:46,70` | SHELL-003, SHELL-004, SHELL-058, SHELL-059, SHELL-063, SHELL-064 |
| `#scrim` `app.html:115`, `src/styles.css:32,555-557` | SHELL-065, SHELL-067, SHELL-068 |
| drawer media query `src/styles.css:544-608` | SHELL-065, SHELL-066, SHELL-070, SHELL-071, SHELL-078 |
| `@media (max-width:1100px)` `src/styles.css:538` | SHELL-064, SHELL-081 |
| `initPanelResize()` / `#rightResizer` src/app.js:3221 | SHELL-072, SHELL-073, SHELL-075, SHELL-077, SHELL-079, SHELL-080 |
| `clampRightW()` src/app.js:3214 | SHELL-074, SHELL-081 |
| `setRightW()` / `curRightW()` src/app.js:3218-3219 | SHELL-073, SHELL-076, SHELL-081 |
| `applyPanelWidths()` src/app.js:3220 | SHELL-076, SHELL-107 |
| `.col-resizer` styles `src/styles.css:614-618` | SHELL-072, SHELL-073, SHELL-078 |
| `#notes` header + `<h2>Notes</h2>` `app.html:89-96` | SHELL-082 |
| `injectNotesButtons()` src/app.js:2618 | SHELL-082, SHELL-083, SHELL-084 |
| `#btnSaveNotes` + `saveNotesNow()` src/app.js:2607 | SHELL-085, SHELL-086, SHELL-087, SHELL-104 |
| `saveAsFile()` src/app.js:2503 | SHELL-085, SHELL-086 |
| `maybeShowSaveAsTip()` src/app.js:2460 | SHELL-086 |
| `flashSaved()` src/app.js:2602 + `.save-btn.saved` `src/styles.css:119` | SHELL-087 |
| `#btnImportNotes` + `importNotesJSON()` src/app.js:2533 | SHELL-088, SHELL-104 |
| `#btnExportPdf` + `openExport()` src/app.js:2846 | SHELL-089, SHELL-104 |
| `#btnClearNotes` + `clearActiveNotes()` src/app.js:2634 | SHELL-090, SHELL-091 |
| `#btnNotesSearch` / `#ntSearchbar` / `#notesSearchInput` `app.html:93,98-101` | SHELL-092 |
| `render()` empty states + `#notesCount` src/app.js:2095-2109 | SHELL-093, SHELL-094 |
| `#sortSel` label `app.html:104`, `src/app.js:3173` | SHELL-095, SHELL-096 |
| `#btnFilter` + `openFilterPopover()` src/app.js:2248 | SHELL-098, SHELL-099 |
| `openPopover()` src/app.js:2231 | SHELL-098, SHELL-099 |
| `#composerInput` placeholder override `src/app.js:3165` | SHELL-097 |
| `showReaderFallback()` src/app.js:3180 | SHELL-009, SHELL-017, SHELL-100, SHELL-101 |
| `showEmptyReader()` src/app.js:3197 | SHELL-039, SHELL-102, SHELL-103 |
| `applyReadOnly()` + `#roBanner` src/app.js:3294 | SHELL-057, SHELL-104, SHELL-105 |
| `toast()` + `#toasts` src/app.js:29 | SHELL-106 |
| `save()` / quota error copy src/app.js:151-166 | SHELL-107, SHELL-113, SHELL-115 |
| `loadState()` / `migrateState()` src/app.js:74-118 | SHELL-040, SHELL-103, SHELL-114 |
| `wire()` sidebar + nav wiring src/app.js:3058-3086 | SHELL-012, SHELL-013, SHELL-020, SHELL-030, SHELL-055, SHELL-067 |

## Deliberately not covered here

- Drag-and-drop of a PDF / `.notes.json` / `.annotated.html` onto the reader, and the `#reader.drop-hint` overlay copy "Drop a PDF (+ its .notes.json), or a shared .html, to open it" - covered in the document open, import & notes-attach checklist.
- The `.notes.json` auto-attach flow: `attachNotesFile()`, `maybeOfferFolderNotes()`, the "Open notes file…" top banner, and the folder-sync (`showDirectoryPicker`) settings - covered in the notes storage & sync checklist.
- Full contents of the Settings modal (AI & Tools fields, Templates editors, Storage tab) beyond opening and dismissing it - covered in the settings & providers checklist.
- Note card anatomy, threads, filters semantics, tags, editing and deletion of individual notes - covered in the notes panel & cards checklist.
- Reader toolbar controls (page box, zoom, tool buttons, continuous scroll, find bar, screenshot capture) - covered in the reader & navigation checklist.
- The export-to-PDF view internals (include checkboxes, layouts, print output) and the full "Share as HTML" round trip - covered in the export & sharing checklist.
- OCR detection banner and its progress/cancel states - covered in the scanned-PDF / OCR checklist.
- `index.html` and `features.html` marketing pages - covered in the landing-page checklist.
