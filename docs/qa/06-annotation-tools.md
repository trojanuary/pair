# 06 - Annotation tools: select, highlight, comment, screenshot & anchoring

> Manual QA for the four reader tools, the text-selection popover, every annotation type they create, and the on-page anchoring layer (highlight rectangles, numbered pins, connector line, renumbering).

| | |
|---|---|
| **ID prefix** | ANN |
| **Scope** | Toolbar tools (Cursor/Select, Highlight, Comment, Screenshot region); the `#selPop` popover (Highlight / Note / ✦ Ask AI); creation of `text`, `free_comment`, `screenshot` and `doc` annotations; the capture mask + capture bar + cancel path; normalised `rects` anchoring with `prefix`/`suffix`/`section` context; `.hl-rect` overlays; numbered `.pin` markers; the SVG connector to the notes panel; note renumbering by reading order. |
| **Primary code** | `src/app.js:804-1229`, `src/app.js:3097-3122` (tool wiring + `placeComment`), `src/app.js:3127-3150` (selection listeners), `app.html:60-65,78-83,119-125`, `src/styles.css:101-158,579-592` |
| **Checks** | 128 |

**Standing pre-conditions** (assume for every check unless overridden): a desktop Chromium browser at a window width > 820 px, the app served from the site root (`/app.html`), the bundled sample document **"BERT — Devlin et al. 2019 (NAACL).pdf"** open with its 12 seeded notes, both side panels expanded, single-page mode unless the check says continuous. "Fresh profile" means `localStorage` key `srw_state_v1` cleared and the page reloaded.

## Contents
- [1. Toolbar & tool switching](#1-toolbar--tool-switching) - 14 checks
- [2. Text-selection popover](#2-text-selection-popover) - 16 checks
- [3. Creating highlights](#3-creating-highlights) - 11 checks
- [4. Note & Ask AI from the popover](#4-note--ask-ai-from-the-popover) - 11 checks
- [5. Comment tool](#5-comment-tool) - 11 checks
- [6. Screenshot: the capture mask, the drag & the cancel path](#6-screenshot-the-capture-mask-the-drag--the-cancel-path) - 15 checks
- [7. Screenshot: the captured note & its metadata](#7-screenshot-the-captured-note--its-metadata) - 13 checks
- [8. Anchors: how they are stored and re-located](#8-anchors-how-they-are-stored-and-re-located) - 9 checks
- [9. On-page highlight rectangles & numbered pins](#9-on-page-highlight-rectangles--numbered-pins) - 10 checks
- [10. The connector line & note scrolling](#10-the-connector-line--note-scrolling) - 10 checks
- [11. Numbering, renumbering & source labels](#11-numbering-renumbering--source-labels) - 8 checks

---

## 1. Toolbar & tool switching

### ANN-001 - Cursor/Select is the default tool on a fresh profile
**P0** * State * `src/app.js:906 setTool()`, `src/app.js:68 defaultState()`

- **Pre:** Fresh profile.
- **Steps:**
  1. Load `/app.html` and wait for page 1 to render.
  2. Inspect the four buttons in the centre `.tools` group.
- **Expect:** The first button (`#toolCursor`, arrow glyph) is the only one with the active treatment - solid blue fill, white glyph. The other three are plain (muted glyph, transparent background). No capture mask, no capture bar. Text on the page can be selected with a drag.
- **Watch:** `defaultState()` ships `tool: 'cursor'`; if a stale saved state carries the removed `'text'` tool, `migrateState()` (`src/app.js:85`) must rewrite it to `'cursor'` - otherwise **no** button lights up and the toolbar reads as broken.

### ANN-002 - Highlight tool takes the amber active state
**P1** * Visual * `src/app.js:910 setTool()`, `src/styles.css:106`

- **Pre:** Cursor tool active.
- **Steps:**
  1. Click the second tool button (`#toolHi`, marker glyph).
- **Expect:** `#toolHi` becomes **amber** (`.tool.active.hl`) with a dark-brown glyph - visibly different from the blue active state used by the other three tools. `#toolCursor` returns to plain.
- **Watch:** `setTool()` adds `.active` and `.hl`; if a redesign drops the `.hl` class the highlight tool looks identical to Select and testers cannot tell which mode they are in.

### ANN-003 - Comment tool takes the blue active state
**P1** * Visual * `src/app.js:910 setTool()`, `app.html:63`

- **Pre:** Any tool active.
- **Steps:**
  1. Click the third tool button (`#toolComment`, speech-bubble glyph).
- **Expect:** `#toolComment` is solid blue with a white glyph; every other tool button is plain. The page cursor stays the normal arrow/text cursor (no crosshair) and no capture bar appears.
- **Watch:** Comment mode has no other visible affordance than this button state - if it doesn't light up, a user clicking the page has no idea why pins appear.

### ANN-004 - Screenshot tool arms the mask and the capture bar
**P0** * Functional * `src/app.js:911-913 setTool()`, `app.html:78-83`

- **Pre:** Cursor tool active, page 1 visible.
- **Steps:**
  1. Click the fourth tool button (`#toolShot`, camera glyph).
  2. Move the pointer over the page.
- **Expect:** `#toolShot` is solid blue. A floating bar appears near the top-centre of the reader reading exactly **"Select area to capture"** followed by a separated **"Cancel"**. The pointer over the page is a **crosshair**. Dragging across body text selects **nothing** (`#textLayer` gets `pointer-events:none`).
- **Watch:** All three effects come from one branch in `setTool()`; a partial regression (bar without mask, or mask without bar) leaves the user in an unlabelled capture mode.

### ANN-005 - Only one tool is ever active
**P1** * State * `src/app.js:908 setTool()`

- **Pre:** Any state.
- **Steps:**
  1. Click each of the four tool buttons in turn, then click `#toolShot`, then `#toolHi`.
- **Expect:** After every click exactly one button carries the active treatment. Leaving Screenshot for Highlight removes the mask, hides the capture bar, restores the crosshair to a normal cursor, and re-enables text selection in the same frame.
- **Watch:** `setTool()` clears `active`, `hl` and `shot` from **all** `.tool` buttons first; if the reset loop is narrowed, the amber highlight state sticks on top of the new blue one.

### ANN-006 - Selected tool persists across reload
**P1** * State * `src/app.js:907 setTool()`, `src/app.js:3320 boot()`

- **Pre:** Cursor tool active.
- **Steps:**
  1. Click Comment.
  2. Reload the page.
- **Expect:** After the reload, `#toolComment` is still the active tool and clicking the page still drops a comment pin.
- **Watch:** `setTool()` writes `state.ui.tool` and `save()` is debounced 250 ms - reloading instantly after the click can lose the write. Reload after a pause; if it is still lost with a pause, the persistence broke.

### ANN-007 - Screenshot tool re-arms itself after reload
**P1** * Regression * `src/app.js:3320 boot()` -> `setTool(state.ui.tool)`

- **Pre:** None.
- **Steps:**
  1. Click Screenshot, do **not** draw a box.
  2. Reload the page and wait for the PDF to render.
- **Expect:** The app comes back with the capture mask armed: `#toolShot` blue, **"Select area to capture"** bar visible, crosshair cursor, no text selection. Clicking **"Cancel"** returns to Select.
- **Watch:** This is a genuine (if surprising) behaviour of `boot()` re-applying the persisted tool. The failure mode is the opposite: the bar shows but the mask does not (or vice-versa), so drags do nothing and the bar can't be dismissed.

### ANN-008 - Tool tooltip copy
**P2** * Copy * `app.html:61-64`

- **Pre:** Pointer device.
- **Steps:**
  1. Hover each tool button for ~1 s and read the native tooltip.
- **Expect:** Left to right, exactly: **"Select"**, **"Highlight"**, **"Comment"**, **"Screenshot region"**.
- **Watch:** These are the only labels the tools have - the buttons are icon-only. A dropped `title` leaves an unlabelled icon with no accessible name.

### ANN-009 - Tool hover state
**P2** * Visual * `src/styles.css:104`

- **Pre:** Cursor tool active.
- **Steps:**
  1. Hover `#toolHi`, `#toolComment`, `#toolShot` one at a time, then hover the already-active `#toolCursor`.
- **Expect:** Inactive buttons take a soft grey rounded background on hover. The active button keeps its blue/amber fill (the hover background must not wash it out).
- **Watch:** `.tool:hover` is declared before `.tool.active` - reordering the rules makes the active tool look inactive while hovered.

### ANN-010 - Tools group sits centred in the reader top bar
**P2** * Visual * `src/styles.css:101-103`, `app.html:60-65`

- **Pre:** Window wider than 820 px.
- **Steps:**
  1. Look at the reader top bar.
  2. Narrow the window to ~900 px and look again.
- **Expect:** The four tools sit in one bordered, shadowed pill with `margin:0 auto`, horizontally centred between the page-number box/zoom group on the left and the continuous/search/⋯ buttons on the right. At ~900 px the row scrolls horizontally inside `.rd-mid` rather than wrapping or clipping.
- **Watch:** `.rd-mid` hides its scrollbar; if the tools pill is pushed out of the scrollable area it becomes unreachable at intermediate widths.

### ANN-011 - Tools float at the bottom below 820 px
**P1** * Visual * `src/styles.css:579-583`

- **Pre:** None.
- **Steps:**
  1. Resize the window to 780 px wide (or use a phone emulation profile).
- **Expect:** The tools pill leaves the top bar and floats centred near the **bottom** of the reader, above the safe-area inset. Each button grows to 46x42 px. The reader's scroll area gains bottom padding so the last line of the page is not hidden behind the pill.
- **Watch:** The pill is `position:absolute` against `#reader`. If `.rd-top` is ever given `position:relative` again at this width the pill re-anchors into the 60 px top strip and half of it is clipped (see the comment at `src/styles.css:563-566`).

### ANN-012 - Tools bar stands down while the selection popover is up
**P1** * Visual * `src/styles.css:592`, * Firefox/Safari note

- **Pre:** Window ≤ 820 px, a document open.
- **Steps:**
  1. Select a sentence of body text so `#selPop` appears at the bottom.
- **Expect:** The floating tools pill fades to invisible and stops taking taps while the popover is shown; it returns as soon as the popover hides.
- **Watch:** Driven by `body:has(#selPop:not(.hidden))`. `:has()` is unsupported in Firefox < 121 - there the tools pill and the popover overlap at the bottom of the screen and the wrong control gets the tap. Flag rather than fail on old Firefox.

### ANN-013 - Read-only shared file exposes only the Select tool
**P1** * Functional * `src/app.js:3294 applyReadOnly()`

- **Pre:** A `.html` bundle produced by **"Share as HTML"**, opened directly from disk.
- **Steps:**
  1. Look at the tools group.
  2. Select a paragraph of text on the page.
- **Expect:** Only `#toolCursor` is present - Highlight, Comment and Screenshot are hidden (`display:none`). Selecting text **never** shows the popover. The bottom banner reads **"Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX"**.
- **Watch:** `onTextSelect()` bails on `READONLY` at `src/app.js:814`; if that guard is lost the popover appears and creates notes that `save()` silently discards - work that vanishes on reload.

### ANN-014 - Tools with no document open
**P2** * Edge * `src/app.js:3197 showEmptyReader()`, `src/app.js:3119`

- **Pre:** Every document removed from the library, so the reader shows **"Your library is empty"**.
- **Steps:**
  1. Click Comment, then click in the middle of the empty reader area.
  2. Click Screenshot and drag a box across the empty area.
- **Expect:** No pin, no note, no crash. Comment does nothing (`viewport` is null). The screenshot drag ends with the error toast **"Nothing to capture here."** on a dark-red background.
- **Watch:** `showEmptyReader()` nulls `viewport` but keeps `#pageWrap` in the DOM - a regression that destroys `#pageWrap` also nulls `#overlay`/`#pins` and throws inside `drawHighlights()`.

---

## 2. Text-selection popover

### ANN-015 - Popover appears on a mouse selection inside the page
**P0** * Functional * `src/app.js:813 onTextSelect()`, `src/app.js:3127`

- **Pre:** Cursor tool active, page 1 of the sample rendered.
- **Steps:**
  1. Drag across the phrase "deep bidirectional representations" in the abstract.
  2. Release the mouse.
- **Expect:** Within one frame of the mouse-up, a dark rounded popover appears just below the selection. The selection stays highlighted (translucent blue, `.textLayer ::selection`).
- **Watch:** The handler is `mouseup` + `setTimeout(...,0)`; a stray `preventDefault` on the text layer or a mouse-up landing on a `.hl-rect` (which sits above the text layer with `pointer-events:auto`) can swallow it.

### ANN-016 - Popover button copy
**P0** * Copy * `app.html:120-122`

- **Pre:** A selection popover is showing.
- **Steps:**
  1. Read the three buttons left to right.
- **Expect:** Exactly **"Highlight"**, **"Note"**, **"✦ Ask AI"** - including the ✦ glyph and the space after it.
- **Watch:** These labels are hard-coded in `app.html`, not generated - a rename in `wire()` would not update them, so copy and behaviour can drift apart.

### ANN-017 - Popover styling
**P2** * Visual * `app.html:119-123`

- **Pre:** A selection popover is showing.
- **Steps:**
  1. Inspect the popover.
- **Expect:** Near-black pill (`#0B0F19`), 10 px radius, drop shadow, 5 px padding, 2 px gaps. "Highlight" and "Note" are white and semi-bold; **"✦ Ask AI"** is light violet (`#C4B5FD`) and bolder than the other two.
- **Watch:** The violet on "Ask AI" is the only signal that it is the AI action; losing it makes three identical buttons.

### ANN-018 - Popover is centred under the selection
**P1** * Visual * `src/app.js:845 positionSelPop()`

- **Pre:** Window > 820 px.
- **Steps:**
  1. Select a short phrase in the middle of the page.
- **Expect:** The popover is horizontally centred on the **last** rectangle of the selection and sits 8 px below it.
- **Watch:** It uses `rects[rects.length-1]`, so on a multi-line selection it anchors to the **end** of the selection, not the start - expected, not a bug.

### ANN-019 - Popover flips above the selection near the bottom edge
**P1** * Edge * `src/app.js:856-857 positionSelPop()`

- **Pre:** Window > 820 px.
- **Steps:**
  1. Scroll so the last line of a page sits ~20 px above the bottom of the window.
  2. Select text on that last line.
- **Expect:** The popover renders **above** the selection instead of below, fully on screen, never clipped by the window edge (minimum 8 px from the top).
- **Watch:** Without the flip the popover is drawn off-screen and users report "Ask AI does nothing" - see the comment at `src/app.js:854`.

### ANN-020 - Popover is clamped to the window's left and right edges
**P1** * Edge * `src/app.js:853 positionSelPop()`

- **Pre:** Window > 820 px, zoom set high enough that the page overflows horizontally.
- **Steps:**
  1. Select a word at the far-left edge of the visible page area.
  2. Repeat at the far-right edge.
- **Expect:** In both cases the whole popover stays on screen, 8 px clear of the window edge; it never hangs off either side.

### ANN-021 - Selections shorter than 2 characters produce no popover
**P1** * Edge * `src/app.js:818 onTextSelect()`

- **Pre:** Cursor tool active.
- **Steps:**
  1. Double-click a single-letter token, or drag across exactly one character.
- **Expect:** No popover. Any popover already showing is hidden.
- **Watch:** `text.length < 2` after `trim()`.

### ANN-022 - Whitespace-only selection produces no popover
**P1** * Edge * `src/app.js:816-818 onTextSelect()`

- **Pre:** Cursor tool active.
- **Steps:**
  1. Drag across the blank gap between two columns / two paragraphs so only whitespace is selected.
- **Expect:** No popover, no annotation, no console error.

### ANN-023 - Selecting outside the text layer produces no popover
**P1** * Edge * `src/app.js:822-823 onTextSelect()`

- **Pre:** A note card is expanded in the notes panel.
- **Steps:**
  1. Select a sentence inside an AI answer in the notes panel.
  2. Select the document title in the left sidebar.
- **Expect:** No popover in either case (the selection has no `.textLayer` ancestor). The text stays normally selectable and copyable.
- **Watch:** If the `closest('.textLayer')` guard is dropped, selecting an answer offers to "highlight" it and creates a note anchored to garbage rects.

### ANN-024 - Selection spanning two pages in continuous mode is rejected
**P1** * Edge * `src/app.js:821-825 onTextSelect()`

- **Pre:** Continuous mode on (`#btnContinuous` active), two consecutive pages rendered and both visible.
- **Steps:**
  1. Drag from the last line of page 2 into the first line of page 3.
- **Expect:** No popover appears (the common ancestor is `#contPages`, not a `.textLayer`). Nothing is created. The browser selection itself may remain visible - that is fine.
- **Watch:** The failure mode is a note whose `rects` are computed against the wrong page box and whose highlight lands somewhere random on page 2.

### ANN-025 - Popover follows / disappears on scroll
**P1** * Functional * `src/app.js:3150`

- **Pre:** A selection popover is showing, window > 820 px.
- **Steps:**
  1. Scroll the reader a little with the wheel while the selection is intact.
  2. Now click elsewhere to clear the selection, re-select, and scroll the **notes panel**.
- **Expect:** While a selection exists the popover re-positions and stays glued to the selection. Once the selection is gone the popover hides immediately on the next scroll of any scroller (the listener is registered in capture phase, so it fires for the reader, the notes list and the sidebar).

### ANN-026 - No popover while the Screenshot tool is armed
**P1** * Functional * `src/app.js:814 onTextSelect()`

- **Pre:** Screenshot tool active.
- **Steps:**
  1. Try to drag-select body text.
- **Expect:** No text gets selected at all (the text layer is inert), and no popover appears even if a selection is forced via keyboard (Ctrl/Cmd+A).
- **Watch:** Both guards matter: `pointer-events:none` on `#textLayer` *and* the `state.ui.tool === 'shot'` early return.

### ANN-027 - Popover never appears in a read-only bundle
**P1** * Functional * `src/app.js:814 onTextSelect()`

- **Pre:** A shared read-only `.html` bundle open.
- **Steps:**
  1. Select several sentences on different pages.
- **Expect:** Never a popover; text remains selectable/copyable for reading.

### ANN-028 - Touch: popover appears after the finger lifts
**P0** * Functional * `src/app.js:3137-3145` * Firefox/Safari + touch

- **Pre:** iOS Safari or an Android browser, sample document open.
- **Steps:**
  1. Long-press a word to start the native selection, drag a handle to extend it, then lift.
- **Expect:** ~80 ms after the lift the popover appears **pinned to the bottom-centre of the reader**, above the safe area. iOS's own Copy/Look Up menu may sit over the selection - the app's popover must not compete for that space.
- **Watch:** iOS does not dispatch `mouseup` for a long-press selection, so this path depends entirely on `touchend` + `selectionchange`. Regressions here are invisible on desktop.

### ANN-029 - Mobile popover clears any inline coordinates
**P1** * Regression * `src/app.js:850 positionSelPop()`, `src/styles.css:590-591`

- **Pre:** Desktop-width window, then narrowed.
- **Steps:**
  1. At > 820 px, select text so the popover positions itself with inline `left`/`top`.
  2. Without clearing the selection, narrow the window to < 820 px.
  3. Nudge the selection (or re-select) so `positionSelPop()` runs again.
- **Expect:** The popover snaps to the bottom-centre layout - no leftover inline coordinates leaving it stranded mid-page or off-screen.

### ANN-030 - Popover does not commit mid-drag
**P0** * Regression * `src/app.js:3133-3146`

- **Pre:** Highlight tool active (the most destructive case).
- **Steps:**
  1. Press the mouse down on the first word of a long sentence and drag slowly across it, pausing for ~1 s mid-drag, **without releasing**.
  2. Release at the end of the sentence.
- **Expect:** **No** highlight is created while the button is still down. Exactly one highlight is created on release, covering the whole sentence.
- **Watch:** `selectionchange` fires per character. The `held` / `touching` flags gate it. If they regress, the highlight tool commits a partial selection mid-drag and produces a pile of one-word notes.

---

## 3. Creating highlights

### ANN-031 - "Highlight" in the popover creates a yellow highlight + toast
**P0** * Functional * `src/app.js:871 highlightSelection()`, `src/app.js:3147`

- **Pre:** Cursor tool active, a selection popover showing over a sentence on page 2.
- **Steps:**
  1. Click **"Highlight"**.
- **Expect:** The popover closes, the browser selection is cleared, a translucent **yellow** band covers the selected text, a numbered blue pin appears at its right edge, and a toast reads exactly **"Highlighted — drag more text, or pick another tool."** (em dash). The notes count in the panel footer increments by one.
- **Watch:** The toast is the only feedback for a highlight - `highlightSelection()` deliberately does **not** open or scroll the notes panel.

### ANN-032 - Highlight tool commits on release without a popover
**P0** * Functional * `src/app.js:841 onTextSelect()`

- **Pre:** Click `#toolHi` so the amber tool is active.
- **Steps:**
  1. Drag across a sentence and release.
- **Expect:** No popover ever appears. The yellow highlight and the toast appear immediately on release. The Highlight tool **stays** active so the next drag highlights again.
- **Watch:** `onTextSelect()` short-circuits to `highlightSelection()` and returns before `pop.classList.remove('hidden')`. A flicker of the popover before it commits is a regression.

### ANN-033 - A highlight does not steal the notes panel or the selection
**P1** * State * `src/app.js:871-882 highlightSelection()`

- **Pre:** Notes panel **collapsed** (click `#btnCollapseRight`).
- **Steps:**
  1. Highlight a sentence with the Highlight tool.
- **Expect:** The notes panel stays collapsed. No connector line is drawn. The newly created note is **not** the active note - no card gets the blue selected ring when you re-open the panel; whichever note was active before stays active.
- **Watch:** `highlightSelection()` intentionally skips `openRightPanel()`/`selectAnnotation()` (unlike Note/Ask AI). If someone "helpfully" adds them, quiet bulk-highlighting becomes impossible.

### ANN-034 - Highlight rectangle geometry and colour
**P1** * Visual * `src/app.js:1107-1109 drawHighlights()`, `src/styles.css:142`

- **Pre:** A yellow highlight exists.
- **Steps:**
  1. Compare the yellow band against the glyphs it covers.
- **Expect:** The band hugs the selected text - same left edge as the first selected character, same right edge as the last, roughly one line-height tall, 2 px corner radius, translucent yellow so the text stays fully readable.
- **Watch:** Rect height comes from `getClientRects()` at selection time; a text-layer scale-factor regression makes bands drift a half line up or down at non-100 % zoom.

### ANN-035 - Clicking a highlight rectangle selects its note
**P0** * Functional * `src/app.js:1110 drawHighlights()`

- **Pre:** Notes panel open, some other note active.
- **Steps:**
  1. Click directly on a yellow highlight band on the page.
- **Expect:** That note's card becomes the selected (expanded) card and is scrolled to the **centre** of the notes list; the connector line redraws to it. The reader does **not** scroll.
- **Watch:** With the notes panel **collapsed**, clicking a rectangle selects the note but does **not** open the panel (only pin clicks do) - verify that difference explicitly, it is by design.

### ANN-036 - Highlight tool stays armed for repeated highlighting
**P1** * Functional * `src/app.js:871-882`

- **Pre:** Highlight tool active.
- **Steps:**
  1. Highlight three separate sentences on the same page in a row.
- **Expect:** Three yellow bands, three pins numbered in reading order, three toasts (they stack in the toast area and expire after ~3.2 s each). The tool button stays amber throughout.

### ANN-037 - Multi-line selection stores one rect per line
**P1** * Functional * `src/app.js:827-830 onTextSelect()`

- **Pre:** Cursor tool active.
- **Steps:**
  1. Select a passage that wraps across 4-5 lines (e.g. a whole sentence spanning a paragraph break in the abstract) and click **"Highlight"**.
- **Expect:** A separate yellow band per visual line, each ending at the real end of that line (ragged right where the text is ragged) - not one giant rectangle covering the whole paragraph block.
- **Watch:** Client rects narrower/shorter than 1 px are filtered out; empty-line artefacts must not produce stray 1 px slivers.

### ANN-038 - Very long selection clamps in the note card
**P2** * Edge * `src/app.js:1731 quoteBlock()`

- **Pre:** Cursor tool active.
- **Steps:**
  1. Select the entire abstract (well over 150 characters) and click **"Note"**.
- **Expect:** The card's quote block is clipped to 3 lines with a **"Show more"** button beneath it; clicking it expands the quote and the button becomes **"Show less"**.
- **Watch:** The on-page highlight is still drawn in full - the clamp is card-only.

### ANN-039 - Highlighting the same text twice creates two notes
**P2** * Edge * `src/app.js:861 newAnnotation()`

- **Pre:** One highlight already exists on a sentence.
- **Steps:**
  1. Re-select exactly the same sentence and highlight it again.
- **Expect:** A second, independent note is created (there is no de-duplication). Two pins now sit on top of each other at the same right edge, the notes count increments, and the yellow band reads darker where the two translucent rects overlap.
- **Watch:** This is current behaviour, not a bug - but the two stacked pins must both be clickable (the topmost wins) and renumbering must not crash on identical `rects[0].y`.

### ANN-040 - Highlight survives a reload
**P0** * State * `src/app.js:151 save()`, `src/app.js:1101 drawHighlights()`

- **Pre:** A fresh yellow highlight on page 2.
- **Steps:**
  1. Wait ~1 s, reload the page, navigate to page 2.
- **Expect:** The yellow band and its numbered pin are back in exactly the same place, and the note is in the list.

### ANN-041 - Highlight created in continuous mode lands on the right page
**P1** * Functional * `src/app.js:824-825 onTextSelect()`

- **Pre:** Continuous mode on; scroll so pages 3 and 4 are both partly visible.
- **Steps:**
  1. Highlight a sentence on page 4.
- **Expect:** The pin and band render on page 4 only; the note card's location line reads **"Page 4"** - not the page number shown in the top bar's page box at the moment of the drag.
- **Watch:** `selPage` comes from the `.pg[data-page]` wrapper, **not** `state.ui.page`. If that lookup regresses, continuous-mode highlights all get filed under whichever page the scroll position happened to report.

---

## 4. Note & Ask AI from the popover

### ANN-042 - "Note" creates a blue linked-text note and reveals the panel
**P0** * Functional * `src/app.js:884 createFromSelection()`, `src/app.js:3148`

- **Pre:** Notes panel **collapsed**, cursor tool active.
- **Steps:**
  1. Select a sentence and click **"Note"**.
- **Expect:** The popover closes, the selection clears, a translucent **blue** band (not yellow) covers the text with a numbered pin, the notes panel slides open (~0.18 s), and the new card is expanded, ringed blue, and scrolled to the centre of the list. **No** toast is shown for this path.
- **Watch:** `hlColor: 'text'` for Note/Ask AI vs `'yellow'` for Highlight - the two must be visually distinguishable on the page.

### ANN-043 - "Note" focuses the inline thread composer
**P0** * Functional * `src/app.js:899 createFromSelection()`, `src/app.js:1616 focusThreadCompose()`

- **Pre:** Desktop (pointer) width, notes panel open.
- **Steps:**
  1. Select text, click **"Note"**, then type without touching the mouse.
- **Expect:** The caret is already in the new card's inline composer, whose placeholder reads **"Reply or ask a follow-up…"**; typed characters land there. The page does **not** scroll as a side effect of the focus (`focus({preventScroll:true})`).
- **Watch:** `focusThreadCompose()` retries on the next frame and again at 60 ms because the card is re-rendered; a single-shot focus loses the caret on slower machines.

### ANN-044 - On touch, only Note/Ask AI raise the keyboard
**P1** * Functional * `src/app.js:1218 selectAnnotation()` * mobile

- **Pre:** Phone or ≤ 820 px emulation with a soft keyboard.
- **Steps:**
  1. Select text and tap **"Note"** - observe the keyboard.
  2. Dismiss the keyboard, then tap a **pin** on the page.
- **Expect:** Step 1 opens the soft keyboard with the caret in the card composer. Step 2 selects and scrolls the card but does **not** open the keyboard.
- **Watch:** `selectAnnotation()` deliberately skips focusing on drawer widths; `createFromSelection()` focuses explicitly. Reversing this throws the keyboard over half the screen every time a user taps a pin just to read a note.

### ANN-045 - "✦ Ask AI" routes the next message to the model
**P0** * Functional * `src/app.js:894 createFromSelection()`, `src/app.js:1631 submitToNote()`

- **Pre:** Notes panel open, network available (or see ANN-046 for the offline variant).
- **Steps:**
  1. Select a sentence, click **"✦ Ask AI"**.
  2. Type `this bit` (a plain statement - no question mark, no `@ai`) and press Enter.
- **Expect:** Your message is posted to the card **and** an AI reply bubble appears beneath it - first a pending state showing the animated **"Thinking"** dots, then the answer (or a red **"⚠ …"** error line if the request fails).
- **Watch:** `askNextId` is consumed on the first submit only; a second plain statement in the same note must **not** engage the AI.

### ANN-046 - "Note" with the same text stays a personal note
**P0** * Functional * `src/app.js:1637 routeAndAct()`

- **Pre:** Same as ANN-045. Reproducible offline (throttle to "Offline" in DevTools) because the router falls back to keyword heuristics.
- **Steps:**
  1. Select a sentence, click **"Note"**.
  2. Type `this bit` and press Enter.
- **Expect:** The comment is saved to the card and **nothing else happens** - no "Thinking" bubble, no AI reply, no error.
- **Watch:** Run ANN-045 and ANN-046 back to back: the *only* difference is which popover button was used. If both behave identically, `askNextId` is broken in one direction or the other.

### ANN-047 - Card header/location line for a linked-text note
**P1** * Copy * `src/app.js:1799 msgCard()`, `src/app.js:1728 srcLabel()`

- **Pre:** A note created from a selection on page 1 of the sample.
- **Steps:**
  1. Read the grey line directly under the card header.
- **Expect:** A small blue circle with the note's number, then **"Linked text · Page 1 · 4171 BERT"** (the section string comes from `sectionForIndex()`; for other pages it is that page's nearest preceding numbered heading, or omitted entirely when none is found).
- **Watch:** The separator is a middle dot with spaces (` · `), not a hyphen.

### ANN-048 - Quoted text matches the selection exactly
**P1** * Functional * `src/app.js:1801 msgCard()`

- **Pre:** A fresh note from a selection that includes a hyphenated word broken across lines.
- **Steps:**
  1. Compare the card's quote block against the text on the page.
- **Expect:** The quote is the raw selected string, including any line-break artefacts PDF.js produces. It is displayed with a left rule and a tinted background, never rendered as HTML/markdown.
- **Watch:** Quotes are escaped at the render site; a selection containing `<b>` must appear literally, not as bold text.

### ANN-049 - Prefix/suffix text context is captured
**P1** * State * `src/app.js:837-838 onTextSelect()`

- **Pre:** A note created from a mid-paragraph selection.
- **Steps:**
  1. Open DevTools → Application → Local Storage → key `srw_state_v1`.
  2. Find the newest entry in `annotations` and read `prefix`, `suffix`, `section`.
- **Expect:** `prefix` holds up to 32 characters of the page text immediately **before** the selection, `suffix` up to 32 characters immediately **after**, both whitespace-collapsed. `section` is a string like `"3.1 Pre-training BERT"` (or `""`).
- **Watch:** When the selection cannot be located in the cached page text (`idx < 0`), `prefix` must be `""` and `suffix` must **not** be a slice from position 0 of the page - check by selecting text on an OCR'd page.

### ANN-050 - Rapid double-click on "Note" creates one note only
**P1** * Edge * `src/app.js:885,901 createFromSelection()`

- **Pre:** A selection popover showing.
- **Steps:**
  1. Double-click **"Note"** as fast as possible.
- **Expect:** Exactly one note is created; the notes count rises by one; one pin appears.
- **Watch:** Guarded by `pendingSel` being nulled at the end of the function. Repeat the same test on **"Highlight"** and **"✦ Ask AI"**.

### ANN-051 - The browser selection is cleared after creating
**P2** * Functional * `src/app.js:878, 891`

- **Pre:** Any popover action.
- **Steps:**
  1. Use Highlight, then Note, then Ask AI on three different sentences.
- **Expect:** After each, the blue browser selection is gone (only the app's own highlight band remains) and the popover is hidden. Pressing Ctrl/Cmd+C afterwards copies nothing from the page.

### ANN-052 - Ask AI settles the card after the panel animation
**P1** * Functional * `src/app.js:1132 openRightPanel()`

- **Pre:** Notes panel **collapsed**, and enough notes that the list scrolls.
- **Steps:**
  1. Select text near the bottom of the page and click **"✦ Ask AI"**.
  2. Watch the notes panel as it slides in.
- **Expect:** The panel opens, and ~210 ms later (after the 0.18 s slide) the new card is re-centred in the list and the connector line is drawn. No visible "card jumps twice" flicker beyond that single settle.
- **Watch:** At ≤ 820 px `setPanel()` also force-closes the **left** drawer - confirm the library drawer closes rather than stacking.

---

## 5. Comment tool

### ANN-053 - Comment tool drops a point comment where you click
**P0** * Functional * `src/app.js:3104 placeComment()`, `src/app.js:3113`

- **Pre:** Notes panel open, single-page mode, page 2 rendered.
- **Steps:**
  1. Click `#toolComment`.
  2. Click on a blank area of the page margin.
- **Expect:** A numbered blue pin appears at the click point, a card is created and expanded in the notes panel, the inline composer is focused, and a toast reads exactly **"Comment placed — type your note below."**
- **Watch:** The pin is offset by the CSS `translate(6px,-4px)` on `.pin`, so it sits just up-and-right of the exact click point - expected.

### ANN-054 - Comment tool reverts to Select after one placement
**P0** * State * `src/app.js:3109 placeComment()`

- **Pre:** Comment tool active.
- **Steps:**
  1. Place one comment.
  2. Click elsewhere on the page.
- **Expect:** After the first placement `#toolCursor` is the active tool again (blue), and the second click selects text / does nothing rather than dropping a second comment.
- **Watch:** One-shot by design. If it stays armed, users carpet the page with accidental pins while trying to click into their own note.

### ANN-055 - A comment draws a pin but no highlight rectangle
**P1** * Visual * `src/app.js:1105 drawHighlights()`

- **Pre:** A comment placed on page 2.
- **Steps:**
  1. Look closely at the pin location.
- **Expect:** Only the 22 px numbered circle - **no** yellow/blue band and no box outline (a `free_comment` is skipped by `drawHighlights()`), even though it does carry a tiny 0.02x0.02 rect for positioning.
- **Watch:** Dropping that `free_comment` guard paints a 2 %-of-page blue square at every comment.

### ANN-056 - Comment card label and colour
**P1** * Copy * `src/app.js:1728 srcLabel()`, `src/app.js:1837 cardKind()`, `src/styles.css:189`

- **Pre:** A comment note exists and is expanded.
- **Steps:**
  1. Read the location line; collapse the card and look at the card background.
- **Expect:** The location line reads **"Comment · Page 2"** (plus ` · <section>` only when the page text yields one). The card body has the green-tinted `k-comment` background, distinct from the cream `k-hl` (highlight) and blue-grey `k-shot` (screenshot) cards.

### ANN-057 - A click that ends a text selection is not treated as a comment
**P1** * Edge * `src/app.js:3115`

- **Pre:** Comment tool active.
- **Steps:**
  1. Drag across a sentence (creating a selection) and release **on the page**.
- **Expect:** No comment pin is created. (The selection popover may appear - that is a separate path.)
- **Watch:** The guard is `String(window.getSelection())` being non-empty at click time; without it every attempt to select text in comment mode also drops a pin.

### ANN-058 - Comment in continuous mode targets the clicked page
**P1** * Functional * `src/app.js:3116-3118`

- **Pre:** Continuous mode on, pages 4 and 5 both partly visible.
- **Steps:**
  1. Arm Comment and click low on page 5.
- **Expect:** The pin lands on page 5 and the card reads **"Comment · Page 5"**, regardless of what the page box in the top bar showed.

### ANN-059 - Clicking the gap between pages does nothing
**P1** * Edge * `src/app.js:3117-3118`

- **Pre:** Continuous mode on, Comment tool armed.
- **Steps:**
  1. Click in the 16 px grey gutter between two page canvases, and in the grey area to the left of a narrow page.
- **Expect:** No pin, no note, no toast, no console error. The tool stays armed (it only disarms on a successful placement).

### ANN-060 - Comment near the page edge is clamped
**P2** * Edge * `src/app.js:3106 placeComment()`

- **Pre:** Comment tool armed.
- **Steps:**
  1. Click within a few pixels of the bottom-right corner of the page canvas.
- **Expect:** The pin is placed at most 97 % across and 97 % down the page and stays fully visible on the page - it is never drawn beyond the page edge or clipped away.

### ANN-061 - Comment on a page whose text has not been extracted
**P2** * Edge * `src/app.js:3107-3108 placeComment()`

- **Pre:** Open a large PDF and immediately (within ~0.5 s, before the background text prefetch finishes) arm Comment and click.
- **Expect:** The comment is still created with the correct page number and pin position; only `section` is empty, so the location line reads just **"Comment · Page N"**. No error.

### ANN-062 - "Page comment" provenance chip
**P2** * Copy * `src/app.js:1345 chipsFor()`

- **Pre:** A comment note; AI reachable.
- **Steps:**
  1. In the comment's card, ask a question so an AI answer is produced.
  2. Expand the answer's **"AI-generated … · sources"** disclosure.
- **Expect:** Under **"What this answer used"** the chips include **"Page N"** and **"Page comment"** - and **not** "Used highlighted text" (there is no highlighted text on a `free_comment`).

### ANN-063 - Comment pin holds position through zoom
**P1** * Functional * `src/app.js:1122-1123 drawPins()`

- **Pre:** A comment placed next to a specific figure at 115 % zoom.
- **Steps:**
  1. Zoom to 50 %, then to 300 %, then back to 115 %.
- **Expect:** The pin stays beside the same feature of the page at every zoom level; it never drifts toward a corner or off the page.

---

## 6. Screenshot: the capture mask, the drag & the cancel path

### ANN-064 - Capture bar copy and appearance
**P1** * Copy * `app.html:80-83`, `src/styles.css:152-155`

- **Pre:** None.
- **Steps:**
  1. Click `#toolShot` and read the floating bar.
- **Expect:** A white rounded card near the top-centre of the reader with a "crop corners" icon, blue bold text **"Select area to capture"**, then a vertical divider and grey **"Cancel"**.
- **Watch:** The bar is re-parented to `#reader` in `wire()` (`src/app.js:3102`) so it survives page re-renders - confirm it does not disappear after changing pages while armed.

### ANN-065 - Cancel returns to the Select tool
**P0** * Functional * `src/app.js:3101`

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Click **"Cancel"** in the capture bar.
- **Expect:** The bar hides, the mask is removed, the crosshair reverts to the normal cursor, text is selectable again, and `#toolCursor` is the active (blue) tool. No note is created and no toast is shown.

### ANN-066 - Switching to another tool also disarms capture
**P1** * Functional * `src/app.js:912-913 setTool()`

- **Pre:** Screenshot tool armed, mid-drag box **not** started.
- **Steps:**
  1. Click `#toolHi`.
- **Expect:** The mask and bar disappear in the same click; the Highlight tool is amber-active and text selection works again.

### ANN-067 - Drag draws a dashed box with four corner handles
**P1** * Visual * `src/app.js:927 initCaptureMask()`, `src/styles.css:156-157`

- **Pre:** Screenshot tool armed over a rendered page.
- **Steps:**
  1. Press and drag slowly across a figure.
- **Expect:** A live box follows the pointer: 1.5 px dashed blue border, faint blue fill, and four small white squares with blue borders at the corners. The page underneath stays visible through the fill.

### ANN-068 - Box tracks all four drag directions
**P1** * Functional * `src/app.js:920-921, 930-934 initCaptureMask()`

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Drag down-right, release outside a page to discard; repeat dragging up-left, up-right and down-left from a point in the middle of the page.
- **Expect:** In every direction the box grows from the anchor point with correct left/top/width/height (never a zero-size or negatively-offset box, never a box that jumps to the opposite corner).

### ANN-069 - A tiny drag is discarded silently
**P1** * Edge * `src/app.js:939 initCaptureMask()`

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Click once on the page without moving (or drag ~5 px and release).
- **Expect:** The box vanishes, **no toast** at all, no note, and the tool stays armed so the next drag works.
- **Watch:** Threshold is 12 px in **both** width and height. A stray "Nothing to capture here." on a plain click is a regression.

### ANN-070 - Secondary mouse button does not start a box
**P2** * Edge * `src/app.js:923 initCaptureMask()`

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Right-click and drag on the page; press the middle button and drag.
- **Expect:** No selection box is drawn. (The browser's context menu may open over the mask - acceptable.) The tool stays armed.

### ANN-071 - The text layer is inert while armed
**P1** * Functional * `src/app.js:912 setTool()`, `src/app.js:486 renderPage()`

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Try to select body text with a drag; then change page with `#pageNext` and try again.
- **Expect:** No text can be selected in either case - the pointer-events state is re-applied after every page render, so navigating while armed does not silently re-enable the text layer under the mask.

### ANN-072 - Touch and pen drags work
**P0** * Functional * `src/app.js:922-942 initCaptureMask()`, `src/styles.css:158` * touch devices

- **Pre:** A touch device (or a Chromium touch-emulation profile) with the Screenshot tool armed.
- **Steps:**
  1. Drag a box across a figure with one finger.
- **Expect:** The box is drawn and the region is captured. The page does **not** scroll during the drag (`touch-action:none` on `#captureMask`).
- **Watch:** These are `pointer*` events, not `mouse*` - box-select was mouse-only before. Regressing to mouse events makes capture impossible on phones and tablets, with no error to show for it.

### ANN-073 - An interrupted drag cleans up
**P1** * Edge * `src/app.js:942 initCaptureMask()`

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Start a drag, then interrupt it - e.g. on touch, add a second finger; on desktop, press Alt+Tab / switch windows mid-drag; or trigger the browser's back-gesture.
- **Expect:** The dashed box is removed, nothing is captured, no toast, and a fresh drag afterwards works normally (no leftover box stuck on screen).

### ANN-074 - Drag released outside the reader
**P2** * Edge * `src/app.js:925, 935 initCaptureMask()`

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Start a drag on the page and release the button over the notes panel / outside the browser window.
- **Expect:** Because the mask captures the pointer, the pointer-up is still received: the box is removed and either a capture happens (if the box still overlapped the canvas by ≥ 12x12) or an error toast explains it did not. No orphaned box remains.

### ANN-075 - The mask cannot reach the reader's top bar
**P2** * Edge * `src/styles.css:158`

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Move the pointer over the page-number box and zoom buttons in the reader top bar.
- **Expect:** The cursor is a normal pointer there (not a crosshair) and the toolbar buttons remain clickable while armed - the mask starts 60 px down, exactly the height of `.rd-top`.
- **Watch:** If `.rd-top` height changes without updating `#captureMask{top:60px}`, either a strip of page becomes un-capturable or the mask covers toolbar buttons.

### ANN-076 - Capture bar sits above the page but below drawers
**P2** * Visual * `src/styles.css:152` (z-index 31) vs `#captureMask` (30)

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Scroll the page under the bar; at ≤ 820 px open the notes drawer while armed.
- **Expect:** The bar stays fixed near the top of the reader while the page scrolls beneath it, and the **"Cancel"** text is clickable (the mask must not sit over it). An open drawer covers the bar rather than the reverse.

### ANN-077 - Drag over the gutter in continuous mode errors clearly
**P1** * Edge * `src/app.js:1053-1055 captureRegion()`

- **Pre:** Continuous mode on, Screenshot tool armed.
- **Steps:**
  1. Drag a box (larger than 12x12) entirely inside the grey gutter between two pages, or in the grey margin beside a page.
- **Expect:** No note is created and a dark-red error toast reads exactly **"Draw the box over a page to capture it."** It stays visible ~6 s (error toasts last longer than normal ones).
- **Watch:** The hit test uses the box **centre**; a box straddling two pages captures from whichever page contains its centre - verify the resulting image is not blank.

### ANN-078 - Box mostly off the page clips or errors
**P1** * Edge * `src/app.js:1062-1065 captureRegion()`

- **Pre:** Single-page mode, Screenshot tool armed.
- **Steps:**
  1. Drag a box that starts in the grey area left of the page and ends ~100 px inside the page.
  2. Repeat with a box that only clips the page by a few pixels.
- **Expect:** Case 1 captures only the part that overlaps the canvas (the resulting thumbnail has no grey border). Case 2, where the overlap is under 12 px in either dimension, produces the error toast **"Draw the box over a page to capture it."** and no note.

---

## 7. Screenshot: the captured note & its metadata

### ANN-079 - A capture produces a green pin, a dashed box and a thumbnail
**P0** * Functional * `src/app.js:1072-1080 captureRegion()`, `src/app.js:1107,1121`

- **Pre:** Sample document, page 3 (the BERT figure), Screenshot tool armed.
- **Steps:**
  1. Drag a box tightly around Figure 1 and release.
- **Expect:** On the page: a **dashed** blue outline (`.figbox`) around the captured region and a numbered **green** pin at its top-right. In the notes panel: a new expanded card whose body shows the captured image as a bordered thumbnail at full card width.
- **Watch:** Screenshot pins are green (`.pin.shot`) while every other pin is blue - it is the only at-a-glance marker of a figure note.

### ANN-080 - Capture toast copy
**P0** * Copy * `src/app.js:1081 captureRegion()`

- **Pre:** As ANN-079.
- **Steps:**
  1. Read the toast that appears after the capture.
- **Expect:** Exactly **"Region captured — ask the AI about it below."** (em dash), on the dark neutral toast background - **not** the red error style.

### ANN-081 - Capture reverts to the Select tool
**P0** * State * `src/app.js:1078 captureRegion()`

- **Pre:** As ANN-079.
- **Steps:**
  1. After the capture completes, move the pointer over the page.
- **Expect:** The mask and capture bar are gone, the cursor is normal, `#toolCursor` is active, and text can be selected again. Capturing a second region requires re-arming the tool.

### ANN-082 - Capture opens the panel, selects the card and focuses the composer
**P0** * Functional * `src/app.js:1079-1080 captureRegion()`

- **Pre:** Notes panel **collapsed**, Screenshot tool armed.
- **Steps:**
  1. Capture a region, then type immediately without touching the mouse.
- **Expect:** The panel slides open, the new screenshot card is expanded, ringed and centred in the list, and the typed characters land in that card's inline composer.

### ANN-083 - "Figure N" caption is auto-detected from the page
**P1** * Functional * `src/app.js:1071 captureRegion()`

- **Pre:** Sample document, page 3.
- **Steps:**
  1. Capture any region on page 3 (even a region far from the figure, e.g. a block of body text).
  2. Ask a question in that card so an AI answer is generated, then expand its **"… · sources"** disclosure.
- **Expect:** The chips include **"Used screenshot"** and **"Used nearby caption"**. The stored caption (visible in `srw_state_v1` → the annotation's `caption`) is **"Figure 1: Overall pre-training and fine-tuning procedures for BERT"** - identical to the bundled sample's screenshot note.
- **Watch:** The regex scans the **whole page's** text, not the neighbourhood of the box, so any capture on a page containing "Figure 1:" inherits that caption. Known behaviour - verify the chip **"Used nearby caption"** is absent on a page with no `Figure N:` text at all.

### ANN-084 - Section on a screenshot note comes from the top of the page
**P2** * Functional * `src/app.js:804 sectionForIndex()`, `src/app.js:1074 captureRegion()`

- **Pre:** Sample document, page 3.
- **Steps:**
  1. Capture a region and read the card's location line.
- **Expect:** **"Screenshot · Page 3 · 4173 BERT BERT E"** - byte-identical to the bundled sample's screenshot note, because `sectionForIndex(text, 0)` can only match a heading starting at character 0 of the page text.
- **Watch:** On pages whose text does not start with a `<number> <Capitalised words>` pattern the section is empty and the line is just **"Screenshot · Page N"**. Both outcomes are correct; a section string from the middle of the page is not.

### ANN-085 - Capture resolution follows the rendered canvas
**P1** * Functional * `src/app.js:1066-1069 captureRegion()`

- **Pre:** Sample document, page 3.
- **Steps:**
  1. At 50 % zoom, capture Figure 1; note the thumbnail's sharpness.
  2. Undo by deleting that note, zoom to 300 %, and capture the same figure again.
- **Expect:** The 300 % capture is visibly sharper. Both thumbnails show the **same crop** of the figure regardless of zoom - the box is mapped through `canvas.width / rect.width`, so device-pixel scaling and OS display scaling are accounted for.
- **Watch:** On a HiDPI screen a missing `sc` factor produces an image cropped to the top-left quarter of the drawn box.

### ANN-086 - Capture on a not-yet-rendered continuous page
**P1** * Edge * `src/app.js:1056 captureRegion()`

- **Pre:** Continuous mode, a long document. Scroll fast so a page is still a blank placeholder, then arm Screenshot.
- **Steps:**
  1. Drag a box over the blank placeholder page and release.
- **Expect:** The app renders that page first (short pause) and then captures the real content - the thumbnail must show page content, never a plain white or grey rectangle.

### ANN-087 - Screenshot image survives a reload (IndexedDB offload)
**P0** * State * `src/app.js:157-159 save()`, `src/app.js:144 rehydrateAssets()`

- **Pre:** One freshly captured screenshot note.
- **Steps:**
  1. Wait ~1 s, reload the page, and open the screenshot note.
- **Expect:** The thumbnail renders exactly as before. In `localStorage` the annotation's `screenshot` field is the literal string `"@idb"` (the image lives in the `srw_assets` IndexedDB store), and `localStorage` has **not** ballooned by the size of the PNG.
- **Watch:** If the image is written into `localStorage` instead, a handful of captures trips the quota and the toast **"Storage limit reached — export your notes to keep them."** appears - at which point later notes stop persisting.

### ANN-088 - First comment on a screenshot note is tagged "Screenshot", never "Question"
**P1** * Functional * `src/app.js:1222 autoTag()`

- **Pre:** A screenshot note, expanded.
- **Steps:**
  1. Type `what is this?` (ends with a question mark) and send.
  2. Look at the tag pills row on the card.
- **Expect:** A **"Screenshot"** pill is added - **not** "Question". The `srcType === 'screenshot'` branch is evaluated before the question heuristic.
- **Watch:** Do the same on a linked-text note: there `what is this?` must add a **"Question"** pill. If both produce the same tag, the branch order regressed.

### ANN-089 - Screenshot chips in an AI answer
**P2** * Copy * `src/app.js:1344 chipsFor()`

- **Pre:** A screenshot note with an AI answer.
- **Steps:**
  1. Expand the answer's provenance disclosure.
- **Expect:** Chips read **"Page N"**, optionally the section, **"Used screenshot"**, optionally **"Used nearby caption"**, and one of **"Used web search"** / **"No external sources"**. **"Used highlighted text"** must **not** appear.

### ANN-090 - Whole-page capture
**P2** * Perf * `src/app.js:1067-1069 captureRegion()`

- **Pre:** Screenshot tool armed at 300 % zoom on a dense page.
- **Steps:**
  1. Drag a box covering the entire visible page area and release.
- **Expect:** The capture completes within a couple of seconds without freezing the UI, the note is created, and the card thumbnail scales to the card width. Reload afterwards and confirm the image is still there (ANN-087 path).
- **Watch:** `toDataURL('image/png')` on a very large canvas region is the slowest operation in this flow; a multi-second freeze with no feedback is the failure to report.

### ANN-091 - Capture before the page text cache is warm
**P2** * Edge * `src/app.js:1070 captureRegion()`

- **Pre:** Open a large PDF and capture a region within the first ~0.5 s, before the background text prefetch runs.
- **Expect:** The image is captured correctly; only `caption` and `section` are empty, so the location line is **"Screenshot · Page N"**. No error, no blank note.

---

## 8. Anchors: how they are stored and re-located

### ANN-092 - Rects are stored as 0-1 fractions
**P0** * State * `src/app.js:827-830 onTextSelect()`, `src/app.js:1076 captureRegion()`

- **Pre:** One highlight and one screenshot note.
- **Steps:**
  1. Inspect `srw_state_v1` in Local Storage and read the `rects` arrays of both annotations.
- **Expect:** Every rect is `{x, y, w, h}` with all four values between 0 and 1 (page-relative fractions) - never pixel values, and never values tied to the zoom level at creation time.
- **Watch:** This is the whole anchoring contract. A regression to pixels looks fine until the zoom changes, then every highlight in every existing note is wrong.

### ANN-093 - Highlights track the text at every zoom level
**P0** * Functional * `src/app.js:1109 drawHighlights()`

- **Pre:** A yellow highlight on a known sentence.
- **Steps:**
  1. Step the zoom from 50 % to 300 % using `#zoomIn`/`#zoomOut` and back down.
- **Expect:** The band covers the same words at every step - no drift, no size lag, no duplicated bands. Pins stay at the right-hand end of their first rect.

### ANN-094 - Anchors survive switching single ↔ continuous
**P0** * Functional * `src/app.js:572 setContinuous()`, `src/app.js:1094 pageWrappers()`

- **Pre:** Highlights on pages 1, 3 and 5, plus the sample's screenshot note on page 3.
- **Steps:**
  1. Toggle `#btnContinuous` on, scroll through pages 1-5.
  2. Toggle it back off and revisit each page.
- **Expect:** Every band, box and pin is present on the right page in both modes, with correct numbering. Nothing renders twice, and pins do not accumulate after repeated toggling.
- **Watch:** In continuous mode only rendered `.pg` wrappers (with a `_vp`) draw overlays; scrolling a page out and back must re-draw it, not leave it bare.

### ANN-095 - Anchors survive a window resize
**P1** * Functional * `src/app.js:3176`, `src/app.js:1101`

- **Pre:** A selected note with a visible connector.
- **Steps:**
  1. Resize the window horizontally, then vertically, in slow drags.
- **Expect:** Bands and pins stay locked to their text (they scale with the page). The connector line re-draws continuously and keeps touching the pin and the card.

### ANN-096 - Anchors survive pinch-zoom
**P1** * Functional * `src/app.js:1041 initPinch()` * touch devices

- **Pre:** Touch device, a highlight visible.
- **Steps:**
  1. Pinch in to magnify, release; pinch out until the whole page fits, release.
- **Expect:** During the gesture the overlays scale with the page as one unit (they are transformed together). After release the page re-renders crisply and highlights/pins/connector are redrawn in exactly the right places.
- **Watch:** `commit()` re-draws all three layers; skipping `drawHighlights()` there leaves stale overlays sized for the previous scale.

### ANN-097 - Anchors survive an export → import round trip
**P1** * Regression * `src/app.js:2314 applyNotesJSON()`

- **Pre:** Several highlights, one comment, one screenshot on the sample.
- **Steps:**
  1. Export the notes JSON for the document.
  2. Delete a couple of notes, then import the file back.
- **Expect:** All bands, boxes and pins return in their original positions with numbering recomputed 1..N. Screenshot thumbnails render (their data URLs pass the raster-only `safeImgSrc` filter).
- **Watch:** Import replaces this document's notes by default; anchoring must come purely from the stored fractional rects, with no re-derivation from the PDF text.

### ANN-098 - Anchors on an OCR'd (scanned) page
**P1** * Functional * `src/app.js:788, 482 applyOcrLayer()`

- **Pre:** A scanned PDF that has been OCR'd via the OCR banner.
- **Steps:**
  1. Select a line of OCR'd text and highlight it.
  2. Change page and come back.
- **Expect:** The selection works against the rebuilt transparent text layer and the highlight band lands over the scanned glyphs, returning to the same spot after navigating away and back.
- **Watch:** `pageTextCache[n].items` is `[]` for OCR'd pages, so `prefix`/`suffix` may be shorter - the visible anchoring must still be correct.

### ANN-099 - A document-level question has no anchor
**P1** * Functional * `src/app.js:1672 askAboutDocument()`, `src/app.js:1119 drawPins()`

- **Pre:** Sample document (its seeded note 12 is a `doc` note), notes panel open.
- **Steps:**
  1. Type a question in the bottom composer - its placeholder must read **"Ask about this document…"** - and send.
  2. Look at the page and at the new card.
- **Expect:** No pin and no highlight appear anywhere (the annotation has `rects: []`). The card's location line reads **"Question about document · Page N …"**. Selecting the note draws no connector line.
- **Watch:** With no document open the same action must show the error toast **"Open a document first."** and create nothing.

### ANN-100 - Free comment rect is positional only
**P2** * State * `src/app.js:3108 placeComment()`

- **Pre:** A comment note.
- **Steps:**
  1. Inspect its `rects` in Local Storage.
- **Expect:** Exactly one rect with `w: 0.02, h: 0.02` and `x`/`y` ≤ 0.97. That tiny rect drives the pin position and the reading-order sort, and is deliberately never painted.

---

## 9. On-page highlight rectangles & numbered pins

### ANN-101 - Overlays are cleared and resized on every redraw
**P0** * Regression * `src/app.js:1103, 1118`

- **Pre:** Several highlights on page 1.
- **Steps:**
  1. Change zoom twice, page forward and back twice, and toggle continuous mode twice.
- **Expect:** No duplicated or ghost bands, no leftover pins from a previous zoom, no pins floating outside the page area. The number of pins on a page always equals the number of anchored notes on it.

### ANN-102 - Only the active document's notes are drawn
**P1** * Functional * `src/app.js:1104, 1119` (`inActiveDoc`)

- **Pre:** Two documents in the library, each with notes on page 1.
- **Steps:**
  1. Open document A, note the pins on page 1.
  2. Switch to document B and look at page 1.
- **Expect:** Document B shows only its own pins/bands (numbered from 1), with none of document A's. Switching back restores A's set exactly.

### ANN-103 - Pin position and shape
**P2** * Visual * `src/app.js:1122-1123 drawPins()`, `src/styles.css:145-148`

- **Pre:** Any anchored note.
- **Steps:**
  1. Inspect a pin against its highlight band.
- **Expect:** A 22 px filled circle with a bold white number, centred vertically on the **top** of the first rect and horizontally at its **right** edge, nudged 6 px right and 4 px up, with a soft blue glow shadow.

### ANN-104 - Pin colours and the selected outline
**P1** * Visual * `src/app.js:1121 drawPins()`, `src/styles.css:148`

- **Pre:** One text note, one screenshot note, both on the same page.
- **Steps:**
  1. Click the text note's pin, then the screenshot note's pin.
- **Expect:** Text/comment pins are blue; screenshot pins are green. Whichever note is active shows a soft translucent blue ring around its pin; only one pin has the ring at a time.

### ANN-105 - Pin click reveals the note without moving the reader
**P0** * Functional * `src/app.js:1124 drawPins()`

- **Pre:** Notes panel **collapsed**; a pin visible near the bottom of the page.
- **Steps:**
  1. Click the pin.
- **Expect:** The notes panel opens, the matching card expands and is centred in the list, the connector is drawn - and the **page does not scroll at all** (the pin you just clicked is still exactly where it was under the pointer).
- **Watch:** `scrollPage` is explicitly `false` here. If it flips to true the page jumps under the user's cursor on every pin click.

### ANN-106 - Clicking a card scrolls the reader to its source
**P1** * Functional * `src/app.js:1898 compactCard()`, `src/app.js:548 scrollToAnnotation()`

- **Pre:** Reader on page 1; a collapsed card for a note anchored on page 5.
- **Steps:**
  1. Click that compact card in the notes list.
- **Expect:** The reader navigates to page 5 and scrolls so the anchored region sits roughly 30 % down the viewport (not at the very top of the page), the card expands, and the connector is drawn.
- **Watch:** This is the inverse of ANN-105 - card→page moves the reader, pin→card does not.

### ANN-107 - Pins render on every rendered page in continuous mode
**P1** * Functional * `src/app.js:1094 pageWrappers()`

- **Pre:** Continuous mode, sample document with notes on pages 1, 3, 4, 5, 8.
- **Steps:**
  1. Scroll slowly from page 1 to page 8.
- **Expect:** Each page's own pins and bands appear as it renders, numbered consistently (1..12 top to bottom over the whole document, matching the cards).

### ANN-108 - Deleting a note clears its overlay immediately
**P0** * Functional * `src/app.js:2203 deleteNote()`

- **Pre:** A visible highlight with its pin.
- **Steps:**
  1. Open the card, click the trash icon in the message head, confirm **"Delete this note and its thread?"** with **"Delete"**.
- **Expect:** The band and pin disappear from the page in the same frame the card leaves the list; remaining pins renumber to close the gap. Choosing **"Cancel"** (or pressing Escape) leaves everything untouched.

### ANN-109 - Resolving a note redraws the overlays
**P2** * Functional * `src/app.js:2223 annMenu()`

- **Pre:** A note with a highlight.
- **Steps:**
  1. Mark it **"Resolve"** from the card's menu, then **"Mark unresolved"**.
- **Expect:** The card gains/loses the resolved treatment and its location line gains/loses **"✓ Resolved"**; the on-page band and pin remain present and correctly positioned through both toggles (they are re-drawn each time).

### ANN-110 - Many pins clustered on one page
**P2** * Edge * `src/app.js:1116 drawPins()`

- **Pre:** Create 10+ highlights within a few lines of each other on one page.
- **Steps:**
  1. Inspect the cluster; click the topmost and the bottommost pin.
- **Expect:** All pins render (overlapping is acceptable), each shows its own number, and clicks reach a pin rather than falling through to the page or the text layer.

---

## 10. The connector line & note scrolling

### ANN-111 - Connector links the active pin to its card
**P0** * Visual * `src/app.js:1162 drawConnector()`

- **Pre:** Window > 820 px, notes panel open.
- **Steps:**
  1. Click a pin whose card is visible in the list.
- **Expect:** A single curved line runs from the **right edge, vertical middle** of the pin to the **left edge** of the card, ~22 px below the card's top. Exactly one line exists at a time.

### ANN-112 - Connector styling
**P2** * Visual * `src/styles.css:149-150`

- **Pre:** A connector is showing.
- **Steps:**
  1. Inspect the line.
- **Expect:** Blue, 2 px, **dashed** (2 on / 4 off), round caps, slightly translucent, drawn as a smooth S-curve (cubic Bezier with control points at the horizontal midpoint) over the page and panel but never intercepting clicks (`pointer-events:none`).

### ANN-113 - Collapsing the notes panel drops the line
**P1** * Functional * `src/app.js:1164 drawConnector()`

- **Pre:** A connector is showing.
- **Steps:**
  1. Click `#btnCollapseRight` to collapse the notes panel.
  2. Re-open it with `#btnToggleRight`.
- **Expect:** The line disappears the moment the panel starts closing and comes back (to the same card) once the panel is open again.

### ANN-114 - Connector is clipped to the notes list's visible band
**P1** * Functional * `src/app.js:1173-1177 drawConnector()`

- **Pre:** A connector is showing and the notes list has enough content to scroll.
- **Steps:**
  1. Scroll the notes list slowly until the active card leaves the top of the list, then the bottom.
- **Expect:** As the card approaches the list's edges the line's endpoint stays clamped ~6 px inside the visible band (it never runs up behind the "Notes" header or down behind the count/composer footer). Once the card is fully out of view the line disappears entirely, and it returns when the card scrolls back in.

### ANN-115 - Connector tracks reader scrolling
**P1** * Functional * `src/app.js:3174`

- **Pre:** A connector is showing.
- **Steps:**
  1. Scroll the reader with the wheel so the pin moves up and eventually off-screen.
- **Expect:** The line follows the pin smoothly (redrawn each animation frame). With the pin scrolled out of the reader viewport the line may extend past the reader edge - it must not freeze in place or detach from the card.

### ANN-116 - Connector re-draws when the notes panel is resized
**P2** * Functional * `src/app.js:3234, 3245 initPanelResize()`

- **Pre:** A connector is showing, window > 820 px.
- **Steps:**
  1. Drag the notes panel's left-edge grip (tooltip **"Drag to resize · double-click to reset"**) to widen and narrow the panel.
  2. Double-click the grip to reset to the default width.
- **Expect:** The line re-attaches to the card's new left edge after each drag and after the reset - no stale line pointing into empty space.

### ANN-117 - No connector at drawer widths
**P1** * Visual * `src/styles.css:560`

- **Pre:** Window ≤ 820 px.
- **Steps:**
  1. Open the notes drawer and select a note.
- **Expect:** No connector line is drawn at all (the drawer covers the passage it would point at). No stray SVG artefact over the drawer or the scrim.

### ANN-118 - Connector and toasts are suppressed when printing
**P2** * Visual * `src/styles.css:436`

- **Pre:** A connector visible and, ideally, a toast on screen.
- **Steps:**
  1. Open the browser's print preview (Ctrl/Cmd+P) from the export view.
- **Expect:** Neither the connector SVG nor the toast stack appears in the print preview.

### ANN-119 - Selecting a note never scrolls the window
**P0** * Regression * `src/app.js:1186 scrollNoteIntoView()`

- **Pre:** Notes panel open with many notes.
- **Steps:**
  1. Click several pins and cards in a row, including notes far down the list.
- **Expect:** Only the notes list scrolls. The reader top bar, the left sidebar and the page header stay fixed - the whole window never scrolls, and the top bars never get pushed off-screen.
- **Watch:** The code deliberately avoids `element.scrollIntoView()`; re-introducing it scrolls ancestors and the window (see the comment at `src/app.js:1187`).

### ANN-120 - A card taller than the panel is not yanked
**P1** * Regression * `src/app.js:1193-1198 scrollNoteIntoView()`

- **Pre:** A note whose expanded card (long AI answer) is taller than the notes list viewport, currently selected and scrolled to its middle.
- **Steps:**
  1. Scroll to read the middle of that card, then trigger a re-render - e.g. add a tag, or toggle "Show on card" on a message.
- **Expect:** The reading position is preserved; the list does **not** jump back to the top of the card. Only when the card is entirely out of view does the list move it back in.

---

## 11. Numbering, renumbering & source labels

### ANN-121 - Numbers follow reading order, not creation order
**P0** * Functional * `src/app.js:1087 renumber()`

- **Pre:** Sample document.
- **Steps:**
  1. Create a highlight near the **bottom** of page 6.
  2. Create a second highlight near the **top** of page 6.
- **Expect:** The top highlight carries the lower number of the two, and every pin on the page reads top-to-bottom in ascending order. The card badges in the notes list carry the same numbers.
- **Watch:** Sort key is `page`, then `rects[0].y`. A stable-sort regression shows up as two same-page notes swapping numbers on every render.

### ANN-122 - Adding a note on an earlier page renumbers everything after it
**P0** * Functional * `src/app.js:1087 renumber()`, `src/app.js:2086 render()`

- **Pre:** Sample document with its 12 seeded notes; note their numbers.
- **Steps:**
  1. Create a highlight on **page 1**.
  2. Compare pin numbers and card badges across pages 1-8.
- **Expect:** The new note takes its place in page-1 reading order and **every** later note shifts up by one, consistently on the page (pins) and in the list (badges and the `q-src` number). No gaps and no duplicate numbers.

### ANN-123 - Numbering is per document
**P1** * Functional * `src/app.js:1088` (`inActiveDoc`)

- **Pre:** Two documents, each with notes.
- **Steps:**
  1. Open document A and note its highest pin number; switch to B and check its numbering.
- **Expect:** Each document numbers from 1 independently; the highest number equals that document's note count. Switching back and forth does not renumber or merge the two sets.

### ANN-124 - Card badge always matches the pin
**P1** * Functional * `src/app.js:1121 drawPins()`, `src/app.js:1799, 1891`

- **Pre:** A document with 10+ notes.
- **Steps:**
  1. Pick three pins at random and find their cards (collapsed and expanded).
- **Expect:** The number in the pin, the number in the collapsed card's coloured badge, and the number in the expanded card's location line are identical in all three places.
- **Watch:** The collapsed badge is green for screenshot notes and blue otherwise - matching the pin colour.

### ANN-125 - Deleting a middle note closes the numbering gap
**P0** * Functional * `src/app.js:2203 deleteNote()` → `render()` → `renumber()`

- **Pre:** Notes numbered 1..N.
- **Steps:**
  1. Delete note 3 and confirm.
- **Expect:** Remaining notes are renumbered 1..N-1 with no gap, both on the page and in the list, in the same frame.

### ANN-126 - Notes count footer, singular and plural
**P2** * Copy * `src/app.js:2109 render()`

- **Pre:** Sample document with 12 notes.
- **Steps:**
  1. Read the count at the bottom-left of the notes panel.
  2. Delete notes until one remains, then delete the last one.
- **Expect:** **"12 notes"** → … → **"1 note"** (singular) → **"0 notes"**. With a filter other than "All" active it also appends ` · <filter label>`. The count reflects **all** notes in the active document, not the filtered subset.

### ANN-127 - Empty state copy after removing every note
**P1** * Copy * `src/app.js:2098 render()`

- **Pre:** A document with all notes deleted.
- **Steps:**
  1. Read the notes list.
- **Expect:** Centred, faint text on two lines: **"No notes yet."** then **"Select text or capture a figure in the document to create a source-linked note."** (With a filter active instead: **"No notes match this filter."**; with a search term: **"No notes match “<term>”."** using curly quotes.)

### ANN-128 - Highlight colour drives the exported label
**P2** * Regression * `src/app.js:2893 buildSheet()`

- **Pre:** One note created via **"Highlight"** (yellow) and one via **"Note"** (blue) on the same page.
- **Steps:**
  1. Open the export view via the **⋯** button (**"Export annotations"**) and read the left column of both items.
- **Expect:** The yellow one is labelled **"Highlight"** with a yellow-tinted quote block; the blue one is labelled **"Linked text"** with a plain quote block. A screenshot note is labelled **"Screenshot"** and shows its image.
- **Watch:** This is the only place the `hlColor` distinction is surfaced outside the reader - if Note and Highlight ever write the same `hlColor`, the export silently mislabels one of them.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `setTool()` src/app.js:906 | ANN-001, ANN-002, ANN-003, ANN-004, ANN-005, ANN-006, ANN-007, ANN-054, ANN-065, ANN-066, ANN-071, ANN-081 |
| `onTextSelect()` src/app.js:813 | ANN-015, ANN-021, ANN-022, ANN-023, ANN-024, ANN-026, ANN-027, ANN-028, ANN-030, ANN-032, ANN-037, ANN-041, ANN-049, ANN-092 |
| `positionSelPop()` src/app.js:845 | ANN-018, ANN-019, ANN-020, ANN-025, ANN-029 |
| `newAnnotation()` src/app.js:861 | ANN-039, ANN-042, ANN-053, ANN-079, ANN-099 |
| `highlightSelection()` src/app.js:871 | ANN-031, ANN-032, ANN-033, ANN-036, ANN-050 |
| `createFromSelection()` src/app.js:884 | ANN-042, ANN-043, ANN-044, ANN-045, ANN-046, ANN-050, ANN-051, ANN-052 |
| `initCaptureMask()` src/app.js:917 | ANN-067, ANN-068, ANN-069, ANN-070, ANN-072, ANN-073, ANN-074 |
| `captureRegion()` src/app.js:1047 | ANN-014, ANN-077, ANN-078, ANN-079, ANN-080, ANN-081, ANN-082, ANN-083, ANN-084, ANN-085, ANN-086, ANN-090, ANN-091 |
| `renumber()` src/app.js:1087 | ANN-121, ANN-122, ANN-123, ANN-124, ANN-125 |
| `pageWrappers()` src/app.js:1094 | ANN-094, ANN-101, ANN-107 |
| `drawHighlights()` src/app.js:1101 | ANN-034, ANN-035, ANN-055, ANN-079, ANN-093, ANN-094, ANN-095, ANN-096, ANN-101, ANN-102, ANN-108, ANN-109 |
| `drawPins()` src/app.js:1116 | ANN-063, ANN-099, ANN-101, ANN-103, ANN-104, ANN-105, ANN-107, ANN-110, ANN-124 |
| `openRightPanel()` src/app.js:1132 | ANN-042, ANN-052, ANN-082, ANN-105 |
| `setPanel()` src/app.js:1150 | ANN-052, ANN-113 |
| `drawConnector()` src/app.js:1162 | ANN-033, ANN-111, ANN-112, ANN-113, ANN-114, ANN-115, ANN-116, ANN-117, ANN-118 |
| `scrollNoteIntoView()` src/app.js:1186 | ANN-035, ANN-052, ANN-119, ANN-120 |
| `followNoteBottom()` src/app.js:1201 | ANN-120 (re-render position stability) |
| `selectAnnotation()` src/app.js:1208 | ANN-035, ANN-042, ANN-044, ANN-105, ANN-106 |
| `autoTag()` src/app.js:1222 | ANN-088 |
| `sectionForIndex()` src/app.js:804 | ANN-047, ANN-049, ANN-084, ANN-091 |
| `placeComment()` src/app.js:3104 + `#rdScroll` click src/app.js:3113 | ANN-053, ANN-054, ANN-055, ANN-056, ANN-057, ANN-058, ANN-059, ANN-060, ANN-061, ANN-063, ANN-100 |
| Selection listeners src/app.js:3127-3150 | ANN-015, ANN-025, ANN-028, ANN-030 |
| `#toolCursor` / `#toolHi` / `#toolComment` / `#toolShot` app.html:61-64 | ANN-001 - ANN-011, ANN-013 |
| Tool tooltips "Select" / "Highlight" / "Comment" / "Screenshot region" | ANN-008 |
| `#captureMask` app.html:78, src/styles.css:158 | ANN-004, ANN-071, ANN-072, ANN-075 |
| `#capBar` + `#capCancel` app.html:80-83 | ANN-004, ANN-007, ANN-064, ANN-065, ANN-076 |
| "Select area to capture" / "Cancel" | ANN-004, ANN-064, ANN-065 |
| `#selPop`, `#spHi`, `#spNote`, `#spAsk` app.html:119-123 | ANN-015 - ANN-030, ANN-031, ANN-042, ANN-045 |
| "Highlight" / "Note" / "✦ Ask AI" | ANN-016, ANN-017 |
| `.hl-rect` `.text` `.yellow` `.box` `.figbox` src/styles.css:140-144 | ANN-034, ANN-035, ANN-042, ANN-079 |
| `.pin` `.pin.shot` `.pin.sel` src/styles.css:145-148 | ANN-103, ANN-104, ANN-105 |
| `#connectors` + path src/styles.css:149-150, 436, 560 | ANN-111, ANN-112, ANN-117, ANN-118 |
| `.selbox` / `.selhandle` src/styles.css:156-157 | ANN-067, ANN-068 |
| `.tools` mobile layout src/styles.css:579-583 | ANN-011 |
| `#selPop` mobile pin + `:has()` tools fade src/styles.css:590-592 | ANN-012, ANN-028, ANN-029 |
| Toast "Highlighted — drag more text, or pick another tool." | ANN-031, ANN-032, ANN-036 |
| Toast "Comment placed — type your note below." | ANN-053 |
| Toast "Region captured — ask the AI about it below." | ANN-080 |
| Toast "Draw the box over a page to capture it." | ANN-077, ANN-078 |
| Toast "Nothing to capture here." | ANN-014 |
| Toast "Open a document first." | ANN-099 |
| `srcLabel()` src/app.js:1728 | ANN-047, ANN-056, ANN-084, ANN-099 |
| `chipsFor()` src/app.js:1340 | ANN-062, ANN-083, ANN-089 |
| `quoteBlock()` src/app.js:1731 + "Show more"/"Show less" | ANN-038, ANN-048 |
| `msgCard()` q-src line src/app.js:1799 | ANN-047, ANN-056, ANN-084, ANN-124 |
| `compactCard()` badge + loc-line src/app.js:1865-1897 | ANN-106, ANN-124, ANN-126 |
| `render()` empty state + count src/app.js:2095-2109 | ANN-126, ANN-127 |
| `deleteNote()` + "Delete this note and its thread?" src/app.js:2203 | ANN-108, ANN-125 |
| `annMenu()` Resolve / Mark unresolved src/app.js:2223 | ANN-109 |
| `applyReadOnly()` src/app.js:3294 | ANN-013, ANN-027 |
| `save()` / `rehydrateAssets()` IndexedDB offload src/app.js:151, 144 | ANN-040, ANN-087 |
| `applyNotesJSON()` src/app.js:2314 | ANN-097 |
| `scrollToAnnotation()` src/app.js:548 | ANN-106 |
| `setContinuous()` / `renderInto()` src/app.js:572, 500 | ANN-094, ANN-086, ANN-107 |
| `initPinch()` commit redraw src/app.js:1041 | ANN-096 |
| `initPanelResize()` src/app.js:3221 | ANN-116 |
| `submitToNote()` / `routeAndAct()` askNextId src/app.js:1622, 1637 | ANN-045, ANN-046 |
| `askAboutDocument()` + "Ask about this document…" src/app.js:1669, 3165 | ANN-099 |
| `buildSheet()` "Highlight" / "Linked text" / "Screenshot" src/app.js:2893 | ANN-128 |
| `showEmptyReader()` src/app.js:3197 | ANN-014 |
| `applyOcrLayer()` interaction with anchors src/app.js:482 | ANN-098 |
| `itemRect()` src/app.js:3023, `rectsForQuote()` src/app.js:3029, `locateQuote()` src/app.js:795 | none - see below |
| `initKeyboardInset()` src/app.js:950 | ANN-044 (partial) - see below |

## Deliberately not covered here

- **`rectsForQuote()` (src/app.js:3029), `itemRect()` (src/app.js:3023) and `locateQuote()` (src/app.js:795) have no caller anywhere in the repo** (verified by a whole-repo grep). Anchoring is done purely from the stored fractional `rects` (ANN-092, ANN-097). If a future change starts re-deriving rects from quote text at load time, these need their own checks - and ANN-097 would start passing for the wrong reason.
- **The `'yellow'` branch of `createFromSelection()` (src/app.js:889)** is unreachable from the UI - `#spHi` calls `highlightSelection()` instead. Nothing to test until something wires it up.
- **`#composerCtx` (`app.html:107`)** renders no content in the current build; there is no code path that fills or unhides it.
- **The full soft-keyboard inset behaviour of `initKeyboardInset()` (src/app.js:950)** - `--kb`, `.replying`, and the drawer lift - belongs to the mobile/notes-panel document; only its effect on focusing a new note's composer is touched here (ANN-044).
- **AI answering, routing, streaming, agent traces and generated visuals** - only the create-side handoff (`askNextId`) is checked here (ANN-045, ANN-046).
- **Notes list filtering, sorting, search, tag editing, "Show on card", copy and edit flows** - separate notes-panel document; touched only where a tool creates the state they display.
- **OCR detection, the OCR banner and its progress/cancel copy** - separate document; only its effect on selection anchoring is checked (ANN-098).
- **Export view options, PDF print layout and "Share as HTML" bundling** - separate export document; only the `hlColor` label mapping is spot-checked (ANN-128).
- **Library, document switching, drag-and-drop opening, folder sync and the File System Access paths (`showSaveFilePicker` / `showDirectoryPicker`)** - separate storage document. No Chromium-only API is used by any tool in this document; the browser-specific risks here are pointer/selection behaviour on iOS Safari (ANN-028, ANN-072) and `:has()` support in older Firefox (ANN-012).
- **Find-in-document highlighting (`.search-hit`, `mark.sh`)** - a different overlay mechanism that shares the text layer; covered in the search document.
