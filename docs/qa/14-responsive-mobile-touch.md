# 14 - Responsive layout, mobile & touch

> Every breakpoint boundary, the three-pane-to-drawer transition, the scrim and panel toggles, the resizable splitter, and every finger-driven interaction — selection, pinch, capture, the on-screen keyboard and rotation — across phone, tablet and desktop.

| | |
|---|---|
| **ID prefix** | RESP |
| **Scope** | Breakpoints at 1100 / 820 / 560px and the `@media print` block; drawer transforms + `#scrim`; `.col-resizer`; touch selection, pinch-to-zoom, touch capture; `--kb` keyboard inset; iOS-specific quirks; landscape / rotation |
| **Primary code** | `src/styles.css:538-618`, `src/styles.css:431-451`, `src/app.js:813-1183`, `src/app.js:3214-3246`, `src/app.js:3303-3353` |
| **Checks** | 105 |

## Contents
- [1. Breakpoint boundaries](#1-breakpoint-boundaries) - 11 checks
- [2. Drawers, scrim and panel toggles at drawer widths](#2-drawers-scrim-and-panel-toggles-at-drawer-widths) - 14 checks
- [3. Reader chrome and the floating tools bar](#3-reader-chrome-and-the-floating-tools-bar) - 12 checks
- [4. The 560px band](#4-the-560px-band) - 4 checks
- [5. Resizable splitter and persisted panel width](#5-resizable-splitter-and-persisted-panel-width) - 9 checks
- [6. Touch text selection and the selection popover](#6-touch-text-selection-and-the-selection-popover) - 11 checks
- [7. Pinch-to-zoom](#7-pinch-to-zoom) - 10 checks
- [8. Touch capture, comments and pins](#8-touch-capture-comments-and-pins) - 6 checks
- [9. On-screen keyboard and iOS focus quirks](#9-on-screen-keyboard-and-ios-focus-quirks) - 12 checks
- [10. Orientation, rotation and resize mid-operation](#10-orientation-rotation-and-resize-mid-operation) - 8 checks
- [11. Overlays, banners, modals and print at narrow widths](#11-overlays-banners-modals-and-print-at-narrow-widths) - 8 checks

---

**Before you start.** Reset state per `00-test-plan.md` §6 — `_mobileDefaulted`, `collapseLeft`, `collapseRight` and `settings.rightW` all persist in `srw_state_v1` and will silently change what you see. Resize the window with DevTools' responsive mode set to an **exact pixel width** (not a device preset) whenever a check names a number: `820` and `821` must be tested as literal widths, and DevTools device presets do not give you them.

Where a check says "phone", use a real device if you can. The `@media (max-width:820px)` block exists almost entirely because of iOS Safari behaviours (keyboard, edit menu, bottom toolbar, focus zoom) that **no desktop emulator reproduces**.

---

## 1. Breakpoint boundaries

### RESP-001 - Three panes at 1101px
**P0** * Visual * `src/styles.css:27-31`, `src/styles.css:538`

- **Pre:** Reset state. Open `/app.html`. Sample doc loaded.
- **Steps:**
  1. Set the viewport to exactly **1101 x 800**.
  2. Reload.
- **Expect:** All three panes are visible and non-zero: the left library (250px, showing "Open PDF or bundle" and "Share as HTML"), the reader, and the right notes panel headed "Notes" at 384px. `#scrim` is `display:none`. The `#rightResizer` grip is present on the notes panel's left edge (`title="Drag to resize · double-click to reset"`).
- **Watch:** `--left-w`/`--right-w` are declared on `:root`, so a stale inline `--right-w` written by `setRightW()` in an earlier session overrides the stylesheet at every width. Check `document.documentElement.style` is clean after the reset.

### RESP-002 - Left sidebar collapses to zero width at 1099px
**P0** * Visual * `src/styles.css:538`

- **Pre:** RESP-001 passing.
- **Steps:**
  1. Set the viewport to exactly **1099 x 800**.
- **Expect:** The left library column becomes 0px wide and disappears entirely. The notes panel narrows from 384px to 340px. The reader keeps the reclaimed space. No horizontal scrollbar on `<body>`.
- **Watch:** The transition is on `grid-template-columns` (`.18s ease`); a mid-transition screenshot can show a sliver of sidebar. Wait for it to settle before judging.

### RESP-003 - The library is reachable in the 821-1100px band
**P1** * Functional * `src/styles.css:461-463`, `src/styles.css:538`, `src/app.js:3060 wire()`

- **Pre:** Reset state (so `collapseLeft` is `false`, the default at `src/app.js:69`). Viewport 1400px.
- **Steps:**
  1. Confirm the library sidebar is visible at 1400px.
  2. Without touching any toggle, narrow the viewport to **900 x 800**.
  3. Try to reach the library: click any visible control that should reveal it.
- **Expect:** The library must remain reachable — either the sidebar still renders at its own width, or the "Show library" toggle (`#btnToggleLeft`) appears in the reader toolbar.
- **Watch:** `:root{--left-w:0px}` at `≤1100px` zeroes the column whether or not the pane is "collapsed", while `#btnToggleLeft` is gated on `#app.collapse-left` and stays `display:none`. In that state the library is a 0px-wide `overflow:clip` box with no reopen affordance until you widen past 1101px. Reproduce it deliberately: this band is a laptop-class width, not an exotic one.

### RESP-004 - A saved panel width overrides the 1100px narrowing
**P1** * State * `src/app.js:3218 setRightW()`, `src/app.js:3220 applyPanelWidths()`

- **Pre:** Viewport 1600px. Drag `#rightResizer` until the notes panel is roughly 700px. Reload so `state.settings.rightW` is applied on boot.
- **Steps:**
  1. Narrow the viewport to **1050 x 800**.
  2. Read the computed `--right-w` (DevTools → Elements → `<html>` → Styles).
- **Expect:** A documented, deliberate result — the inline `--right-w` written by `setRightW()` on `<html>` wins over the `@media (max-width:1100px)` `:root` rule, so the notes panel keeps its saved width instead of snapping to 340px. The reader column must still be wide enough to show a page.
- **Watch:** No re-clamp happens on window resize (see RESP-050). At 1050px with a 700px saved width the reader gets ~350px and the toolbar starts scrolling.

### RESP-005 - 821px is still grid mode, not drawer mode
**P0** * Visual * `src/styles.css:544`

- **Pre:** Any document open.
- **Steps:**
  1. Set the viewport to exactly **821 x 900**.
- **Expect:** Grid mode: the notes panel occupies its own column (it does **not** overlay the reader), `#scrim` is `display:none`, `#connectors` is visible, `.col-resizer` is present and draggable, and the 4 tools (`Select` / `Highlight` / `Comment` / `Screenshot region`) sit inline in the top bar — not floating at the bottom.
- **Watch:** `max-width:820px` is inclusive of 820 and exclusive of 821. An off-by-one in the media query flips the whole layout mode; this is the check that catches it.

### RESP-006 - 820px engages drawer mode
**P0** * Visual * `src/styles.css:544-608`

- **Pre:** RESP-005 passing.
- **Steps:**
  1. Set the viewport to exactly **820 x 900** (an iPad Air portrait width).
- **Expect:** Drawer mode: `#app` becomes a single column; `#sidebar` and `#notes` become `position:fixed` overlays translated off-screen; `#scrim` becomes `display:block`; `#connectors` and `.col-resizer` become `display:none`; the tools bar moves to a floating pill at bottom-centre.
- **Watch:** A drawer left open when the mode flips is immediately visible as an overlay over the page (`#app:not(.collapse-right) #notes{transform:none}`) — that is correct, but it looks like a bug if you weren't expecting it.

### RESP-007 - The 561-819px band
**P1** * Visual * `src/styles.css:544`, `src/styles.css:609`

- **Pre:** —
- **Steps:**
  1. Set the viewport to **700 x 900**.
- **Expect:** Drawer mode is on **and** the 560px rules are off: `#zoomVal` (e.g. "115%") is visible between the − and + buttons, and the "Continuous scroll" button `#btnContinuous` is visible in the toolbar.
- **Watch:** `#zoomVal`/`#btnContinuous` disappearing here means the 560 media query is mis-scoped or the two blocks were merged.

### RESP-008 - 561px vs 560px
**P1** * Visual * `src/styles.css:609-612`

- **Pre:** —
- **Steps:**
  1. Set the viewport to exactly **561 x 900**. Note the toolbar contents.
  2. Set it to exactly **560 x 900**.
- **Expect:** At 561 the zoom readout and the "Continuous scroll" button are both present. At 560 both vanish; the − and + zoom buttons remain and still work.
- **Watch:** Only `#zoomVal` and `#btnContinuous` may hide. If `#btnSearch` or the page box disappear too, someone widened the selector.

### RESP-009 - Small phone at 360px
**P1** * Visual * `src/styles.css:544-612`

- **Pre:** Reset state. Viewport **360 x 640**.
- **Steps:**
  1. Reload and let the sample render.
  2. Scroll the toolbar strip horizontally end to end.
- **Expect:** The toolbar's fixed ends (`#btnToggleLeft` when collapsed, `#btnToggleRight` when collapsed) stay pinned at 34x34px; everything between them scrolls inside `.rd-mid`. The whole page (`< 1`, page box, zoom, search, save/import/PDF buttons) is reachable by scrolling. No content is clipped with no way to reach it.
- **Watch:** `.rd-mid` has `overflow-y:hidden` — a control taller than the 60px bar gets its top or bottom clipped rather than scrolled to.

### RESP-010 - The body never scrolls horizontally at any width
**P2** * Visual * `src/styles.css:18`, `src/styles.css:115`

- **Pre:** Sample doc, continuous mode on.
- **Steps:**
  1. At 1440, 1101, 1099, 900, 821, 820, 700, 561, 560 and 360px in turn, zoom the reader to 300% and try to drag the page body sideways.
- **Expect:** `html, body { overflow: clip }` holds at every width: only `.rd-scroll` scrolls horizontally. No document-level horizontal scrollbar ever appears, and the toolbar never slides out of view.
- **Watch:** A wide element inside a drawer (a long chip, an untruncated document name, a wide `.md-table`) can push the fixed drawer wider than the viewport. Drawers are `width:min(80vw,290px)` / `min(92vw,380px)`, so overflow inside them must scroll, not expand.

### RESP-011 - Drag through all three boundaries with a document open
**P1** * Regression * `src/app.js:3176 wire()`, `src/app.js:1162 drawConnector()`

- **Pre:** Sample doc. Select a note so a connector line is drawn. Viewport 1440px.
- **Steps:**
  1. Slowly drag the browser window (or the DevTools handle) from 1440px down to 340px, then back up to 1440px, in one continuous motion.
- **Expect:** No JS errors in the console. The connector line redraws on each `resize` (`requestAnimationFrame(drawConnector)`), disappears below 821px, and comes back above it. Panels never end up half-transformed. The reader canvas stays put — it is not re-rendered per pixel.
- **Watch:** `drawConnector()` reads `getBoundingClientRect()` on a pin and a card; if either is missing it returns early. A thrown error here silently kills every later `requestAnimationFrame` caller in the same frame.

---

## 2. Drawers, scrim and panel toggles at drawer widths

### RESP-012 - First narrow run closes both drawers and fits the page
**P0** * Functional * `src/app.js:3309 boot()`, `src/app.js:1144 isNarrowViewport()`, `src/app.js:437 fitZoomToWidth()`

- **Pre:** Full state reset (§6). Viewport **390 x 844** *before* the first load.
- **Steps:**
  1. Load `/app.html`.
- **Expect:** The reader fills the screen with **both** drawers closed and no scrim. The sample page is sized to the screen width — the whole page fits horizontally, not a half-cut one. `state.ui.zoom` is no longer the 1.15 default (roughly 0.62 on a 390px screen for a 612pt page); `#zoomVal` reflects it.
- **Watch:** `pendingMobileFit` is consumed inside `initPdf()` **before** the first render (`src/app.js:450`). If the fit lands after the first render you will see a flash of a 115% page, then a jump.

### RESP-013 - The narrow default is one-way
**P0** * State * `src/app.js:3309-3314 boot()`

- **Pre:** RESP-012 done (so `_mobileDefaulted` is `true`).
- **Steps:**
  1. Open the notes drawer with "Show notes".
  2. Reload the page.
- **Expect:** The notes drawer is **still open** after reload. Boot must not re-collapse a panel the reader deliberately opened, and must not re-run `fitZoomToWidth()` (a zoom you set by pinching survives the reload).
- **Watch:** `_mobileDefaulted` lives in `state.ui`; a migration that rebuilds `state.ui` wholesale would reset it and re-collapse the drawers on every load.

### RESP-014 - First run in landscape then rotate to portrait
**P1** * Edge * `src/app.js:1144 isNarrowViewport()`, `src/styles.css:552-553`

- **Pre:** Full state reset. Phone (or emulator) in **landscape** at a width above 820 — e.g. 852 x 393 (iPhone 14 Pro Max landscape).
- **Steps:**
  1. Load `/app.html` for the first time in landscape.
  2. Rotate to portrait (393 x 852).
- **Expect:** A documented, understood outcome. `isNarrowViewport()` was false at boot, so `_mobileDefaulted` stayed unset and `collapseLeft`/`collapseRight` remain `false` — on rotating into portrait, `#app:not(.collapse-left) #sidebar` and `#app:not(.collapse-right) #notes` mean **both drawers slide open over the page with the scrim up**. The reader must still be reachable by tapping the scrim once.
- **Watch:** Both drawers open at once is only possible via this path (`setPanel()` enforces one-at-a-time, but the persisted state was never routed through it). Confirm tapping the scrim closes both in one tap, not one per tap.

### RESP-015 - Open the library drawer
**P0** * Functional * `src/app.js:3060-3062 wire()`, `src/styles.css:550-552`

- **Pre:** 390px, both drawers closed.
- **Steps:**
  1. Tap the leftmost toolbar button (`title="Show library"`).
- **Expect:** The sidebar slides in from the left over the page, `width:min(80vw,290px)` = 290px at 390px wide, over a `.22s ease` transform. The scrim fades in behind it. "Open PDF or bundle", "Share as HTML", "Home"/"Recents"/"Starred"/"Trash", "My Library", the document list, and the "Storage" block are all reachable — the middle list scrolls, the top and bottom stay pinned.
- **Watch:** `#sidebar` is `overflow:clip` with a `.sb-scroll` middle. If the storage block loses `flex:0 0 auto` the document list eats it and the "Settings" gear becomes unreachable on a phone.

### RESP-016 - Open the notes drawer
**P0** * Functional * `src/app.js:3061 wire()`, `src/styles.css:551`

- **Pre:** 390px, both drawers closed, at least 3 notes on the active document.
- **Steps:**
  1. Tap the rightmost toolbar button (`title="Show notes"`).
- **Expect:** The notes drawer slides in from the right at `min(92vw,380px)` = ~359px at 390px. The "Notes" heading, the filter/search buttons, the card list, the count row (e.g. "12 notes" / "Sorted by time ▾") and the composer placeholder "Ask about this document…" are all visible without horizontal scrolling.
- **Watch:** The composer must be fully on-screen at the bottom. With `--kb` at 0 it sits on the `100dvh` edge plus `env(safe-area-inset-bottom)`; on a notched phone a missing safe-area inset puts it under the home indicator.

### RESP-017 - Only one drawer open at a time
**P0** * Functional * `src/app.js:1150-1156 setPanel()`

- **Pre:** 390px.
- **Steps:**
  1. Open the library drawer.
  2. Without closing it, tap "Show notes".
- **Expect:** The library drawer slides out as the notes drawer slides in. Exactly one drawer is on screen; the scrim stays up throughout.
- **Watch:** `setPanel()` only forces the other side closed when `drawerMQ.matches`. Above 820px both panes are legitimately open at once — do not port this expectation to desktop.

### RESP-018 - The scrim closes both drawers in one tap
**P0** * Functional * `src/app.js:3064 wire()`, `src/styles.css:555-557`

- **Pre:** 390px with one drawer open.
- **Steps:**
  1. Tap the dimmed area of the page next to the drawer.
- **Expect:** The drawer slides out and the scrim fades to `opacity:0; pointer-events:none`. A single tap suffices even when both drawers are open (RESP-014). Immediately after, a tap on the page selects text / places a comment normally — the scrim must not swallow it.
- **Watch:** `#scrim` keeps `display:block` at these widths and only drops `pointer-events`. If the opacity transition is interrupted, a fully transparent but still-clickable scrim will eat every subsequent tap on the reader.

### RESP-019 - No scrim above 820px
**P1** * Visual * `src/styles.css:32`, `src/styles.css:555`

- **Pre:** Viewport 821px, notes panel open.
- **Steps:**
  1. Inspect `#scrim`.
- **Expect:** `display:none`. The reader is not dimmed, and clicking the reader does not close the notes panel.
- **Watch:** `#scrim` is a sibling inside `#app`; if it ever became `display:block` outside the media query it would sit at `z-index:55` over the whole desktop UI.

### RESP-020 - Drawer transition vs grid transition
**P1** * Visual * `src/styles.css:29`, `src/styles.css:545`, `src/styles.css:549`

- **Pre:** —
- **Steps:**
  1. At 1200px, toggle the notes panel and watch the animation.
  2. At 390px, toggle it again.
- **Expect:** At 1200px the grid column animates (`transition:grid-template-columns .18s ease`) and the reader re-flows. At 390px `#app` has `transition:none` and the drawer slides in on `transform .22s ease` — the reader does **not** reflow or re-render its canvas.
- **Watch:** If `#app` keeps its grid transition at drawer widths, every drawer open triggers a page re-layout mid-slide and the animation stutters on a phone.

### RESP-021 - Drawer widths at the viewport extremes
**P1** * Visual * `src/styles.css:550-551`

- **Pre:** —
- **Steps:**
  1. At 320px wide, open the library drawer, then the notes drawer; measure each.
  2. At 820px wide, repeat.
- **Expect:** At 320px: sidebar = 80vw = 256px, notes = 92vw = ~294px — a strip of scrim is always visible on the other side so the drawer can be dismissed. At 820px: sidebar caps at 290px and notes at 380px.
- **Watch:** If either drawer ever reaches 100vw the scrim is fully covered and the only way out is the drawer's own "Collapse" button — verify that button (see RESP-022) before accepting any width change.

### RESP-022 - The drawers' own collapse buttons
**P1** * Functional * `src/app.js:3062-3063 wire()`

- **Pre:** 390px.
- **Steps:**
  1. Open the library drawer and tap the "«" button (`#btnCollapseLeft`, `title="Collapse"`) at its top-right.
  2. Open the notes drawer and tap the "»" button (`#btnCollapseRight`, `title="Collapse"`).
- **Expect:** Each closes its own drawer and the scrim fades out. The corresponding toolbar toggle ("Show library" / "Show notes") reappears.
- **Watch:** `#btnClearNotes` is injected immediately before `#btnCollapseRight` by `injectNotesButtons()` (`src/app.js:2632`). At 390px the notes header now holds filter, search, save, import, PDF, trash and collapse — verify the collapse button is not pushed off the drawer's right edge.

### RESP-023 - A note created mid-flight closes the library drawer
**P1** * Edge * `src/app.js:1132 openRightPanel()`, `src/app.js:1150 setPanel()`, `src/app.js:1079 captureRegion()`

- **Pre:** 390px. Both drawers closed. A figure visible on screen.
- **Steps:**
  1. Tap "Screenshot region" and drag a box around the figure.
  2. **Immediately** on lifting your finger — while `captureRegion()` is still awaiting the render and `toDataURL()` — tap "Show library".
  3. Wait for the capture to finish.
- **Expect:** When the capture completes, `openRightPanel()` runs `setPanel('right', true)`, which at drawer widths sets `collapseLeft` and adds `collapse-left`. The library drawer slides out as the notes drawer slides in; exactly one drawer is on screen; the scrim stays up throughout; the new screenshot card is selected and scrolled into view ~210ms later.
- **Watch:** The 210ms `setTimeout` in `openRightPanel()` was tuned for the desktop `.18s` grid transition, not the drawers' `.22s` transform — a card that lands mis-scrolled on a phone points here. Also watch for **both** drawers ending up open, which means the one-at-a-time branch in `setPanel()` was skipped.

### RESP-024 - Connectors are suppressed at drawer widths
**P1** * Visual * `src/styles.css:560`, `src/app.js:1162 drawConnector()`

- **Pre:** 900px with a note selected and a visible dashed connector line.
- **Steps:**
  1. Narrow to 800px.
  2. Open the notes drawer and select a card.
- **Expect:** `#connectors` is `display:none` below 821px — no dashed line is drawn over the drawer or the scrim, at any scroll position of either the reader or the notes list.
- **Watch:** `#connectors` is `position:fixed; width:100vw; height:100vh; z-index:40`. If the `display:none` is lost, the SVG overlays the whole viewport; it is `pointer-events:none` so it will not block taps, but a line will visibly cross the scrim.

### RESP-025 - Drawer state survives a reload and a browser restart
**P2** * State * `src/app.js:1159 setPanel()`

- **Pre:** 390px, `_mobileDefaulted` already true.
- **Steps:**
  1. Open the notes drawer. Force-quit and relaunch the browser. Reopen `/app.html`.
- **Expect:** The notes drawer is open again (`setPanel()` calls `save()`), and the library drawer is closed.
- **Watch:** A drawer restored open on a phone hides the whole page behind the scrim on launch. That is the designed behaviour — but confirm the scrim is tappable immediately, before the PDF has finished rendering.

---

## 3. Reader chrome and the floating tools bar

### RESP-026 - The tools bar floats at bottom-centre on a phone
**P0** * Regression * `src/styles.css:579-582` * iOS only for the historic failure

- **Pre:** 390 x 844, iOS Safari on a real device if possible.
- **Steps:**
  1. Load `/app.html` and let the page render.
  2. Look at the bottom of the screen.
- **Expect:** A rounded pill floating at bottom-centre containing exactly 4 buttons — "Select", "Highlight", "Comment", "Screenshot region" — each 46 x 42px, sitting `14px + env(safe-area-inset-bottom)` above the reader's bottom edge. The active tool is filled (blue, or amber for Highlight).
- **Watch:** This bar was completely invisible in iOS Safari until commit `6ba9064`. The cause was `-webkit-overflow-scrolling:touch` on `.rd-mid`, which makes a scroller the containing block for positioned descendants and stranded the bar inside the 60px `overflow-y:hidden` toolbar. If that property is ever reintroduced — or `.rd-top` regains `position:relative` at this width — the bar vanishes on iOS only and looks perfect in every desktop emulator.

### RESP-027 - The tools bar is absolute against #reader, not fixed
**P0** * Regression * `src/styles.css:576-580` * iOS only

- **Pre:** iOS Safari at 390 x 844, URL bar in its expanded state.
- **Steps:**
  1. Scroll the reader down so Safari collapses its bottom toolbar, then scroll up so it expands again.
- **Expect:** The tools pill tracks the reader's own bottom edge (`#reader` is the `100dvh` grid row) and is never covered by Safari's bottom toolbar in either state.
- **Watch:** `position:fixed` resolves against the layout viewport, which on iOS extends *under* Safari's chrome — the bar then sits half-hidden behind it. The rule must read `position:absolute`.

### RESP-028 - .rd-top keeps its 60px height and goes static
**P1** * Visual * `src/styles.css:566`, `src/styles.css:158`, `src/styles.css:129`, `src/styles.css:152`

- **Pre:** 390px.
- **Steps:**
  1. Measure the toolbar's height.
  2. Activate the "Screenshot region" tool and note where `#captureMask` starts.
  3. Open the find bar (`title="Search in document"`).
- **Expect:** `.rd-top` is exactly 60px tall and `position:static`. `#captureMask` starts at `top:60px` — flush under the toolbar, covering no part of it. The `.capbar` ("Select area to capture" / "Cancel") sits at `top:74px`, and `#findBar` at `top:68px; right:16px`, both fully visible.
- **Watch:** Three separate overlays are hard-offset against the 60px number. Changing `.rd-top`'s height at this breakpoint silently misplaces all of them; the capture mask in particular would either cover the toolbar or leave a dead strip at the top of the page.

### RESP-029 - The toolbar middle scrolls horizontally with no scrollbar
**P1** * Visual * `src/styles.css:570-572`

- **Pre:** 390px, a document with 100+ pages so `#pageTotal` is wide.
- **Steps:**
  1. Swipe the toolbar strip left and right with a finger.
- **Expect:** `.rd-mid` scrolls horizontally through the page box, zoom, "Continuous scroll", "Search in document" and the injected save/import/PDF buttons. No scrollbar is drawn (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`). Every child keeps its natural width (`flex:0 0 auto`) — nothing is squashed.
- **Watch:** The 4 tools are DOM children of `.rd-mid` but are positioned out of it; they must leave **no gap** in the scrolling strip. A stray inline-flow `.tools` box would create a 200px hole you can scroll into.

### RESP-030 - The panel toggles are never squeezed
**P0** * Regression * `src/styles.css:92`, `src/styles.css:573`

- **Pre:** 360px, both drawers closed (so both toggles are shown), a 100+ page document.
- **Steps:**
  1. Measure `#btnToggleLeft` and `#btnToggleRight`.
  2. Scroll `.rd-mid` fully left, then fully right.
- **Expect:** Both toggles are exactly 34 x 34px (`.icon-btn` is upsized from 30px at this breakpoint) and stay pinned at the two ends of the toolbar. They never move with the scrolling strip and never shrink.
- **Watch:** `.rd-top > .icon-btn { flex:0 0 auto }` is the only thing preventing flex-shrink from crushing them to 30px and then smaller. The rule targets **direct children only** — a toggle moved inside `.rd-mid` loses it.

### RESP-031 - The page column clears the floating tools bar
**P1** * Visual * `src/styles.css:583`

- **Pre:** 390px, single-page mode, scrolled to the bottom of the last page.
- **Steps:**
  1. Scroll `.rd-scroll` fully to the bottom.
- **Expect:** `padding-bottom: calc(88px + env(safe-area-inset-bottom))` leaves the bottom of the page visible above the tools pill — the last line of text is readable, not underneath the buttons.
- **Watch:** In read-only shared files this padding is overridden to 44px (`body.readonly #rdScroll`, `src/styles.css:680`) which is less than the 88px the tools bar needs. See RESP-105.

### RESP-032 - Toasts sit above the tools bar
**P1** * Visual * `src/styles.css:584`

- **Pre:** 390px.
- **Steps:**
  1. Select text and tap "Highlight" to fire the toast "Highlighted — drag more text, or pick another tool."
- **Expect:** The toast appears at `bottom: calc(84px + env(safe-area-inset-bottom))`, fully above the tools pill, centred, and readable (`max-width:520px` capped by the 390px screen).
- **Watch:** `#toasts` does **not** account for `--kb`. A toast fired while the keyboard is up (e.g. an AI error while typing a reply) is hidden behind the keyboard. Log it as P2 if you see it — it is a known gap, not a new one.

### RESP-033 - An open drawer covers the tools bar
**P1** * Visual * `src/styles.css:555`, `src/styles.css:579`

- **Pre:** 390px.
- **Steps:**
  1. Open the notes drawer.
  2. Look at the bottom-centre of the screen where the tools pill was.
- **Expect:** The scrim (`z-index:55`) covers the tools pill (`z-index:45`), which is dimmed and not tappable. Tapping where a tool was closes the drawer instead of switching tools.
- **Watch:** Raising the tools bar's `z-index` above 55 makes it float on top of the scrim — you can then activate the highlight tool while the notes drawer is open, with the page invisible behind it.

### RESP-034 - Tool hit targets are thumb-sized
**P1** * Visual * `src/styles.css:582`, `src/styles.css:103`

- **Pre:** 390px on a real phone.
- **Steps:**
  1. Tap each of the 4 tools near the edge of its button.
- **Expect:** Each tool is 46 x 42px at drawer widths (up from 38 x 34px on desktop) and activates reliably from an edge tap. The active tool is visibly filled.
- **Watch:** The pill's own `padding:6px` plus `gap:4px` puts the outer two buttons close to the pill edge; a finger landing on the pill background between buttons must do nothing (not close the pill, not fall through to the page).

### RESP-035 - Safe-area insets on a notched device, portrait and landscape
**P1** * Visual * `src/styles.css:579`, `src/styles.css:583-584`, `src/styles.css:594-595`

- **Pre:** A device with a home indicator / notch (iPhone 12 or newer), iOS Safari.
- **Steps:**
  1. Portrait: check the tools pill, the toasts position, the notes composer and the sidebar "Storage" block.
  2. Rotate to landscape and re-check all four.
- **Expect:** Nothing sits under the home indicator in portrait. `env(safe-area-inset-bottom)` is applied to `.tools`, `.rd-scroll`, `#toasts`, `.composer` and `.sb-storage`.
- **Watch:** In landscape the notch moves to the **side**, and only `-bottom` insets are used anywhere in this stylesheet — verify the left drawer and the reader's left edge are not partially under the notch on an iPhone in landscape with the notch on the left.

### RESP-036 - Stranded page overflow in continuous mode
**P0** * Regression * `src/styles.css:115`

- **Pre:** 390px, continuous mode ON (the default, `src/app.js:69`). Zoom in to ~200% so the page is wider than the reader.
- **Steps:**
  1. Try to scroll `.rd-scroll` all the way left, to the page's left margin.
  2. Repeat on desktop at 1440px with the zoom at 300%.
- **Expect:** The left edge of every page is reachable. `#contPages` uses `align-items:center; align-items:safe center` — the `safe` keyword falls back to start-alignment when the page overflows, keeping the whole width inside the scroll range.
- **Watch:** With plain `center`, the overflow is pushed outside the scroll range: at 390px / 115% the measured `scrollWidth` was 547 of a 704px page, permanently stranding the leftmost 157px. Test **both** modes: `.page-wrap` (single page) uses `margin:0 auto` and was always correct, so a single-page test will pass while continuous is broken.

### RESP-037 - A second, wider PDF opened on a phone keeps the fitted zoom
**P1** * Edge * `src/app.js:450 initPdf()`, `src/app.js:437 fitZoomToWidth()`

- **Pre:** 390px, `_mobileDefaulted` already true (so `pendingMobileFit` will not be set again). Have a PDF with a page wider than the sample (A3 or landscape) in your fixtures.
- **Steps:**
  1. Open the wide PDF via "Open PDF or bundle".
- **Expect:** It renders at the **existing** zoom, not a freshly fitted one — so it overflows horizontally. That is the designed behaviour (the fit is once, on the narrow first load). What must hold: the page stays fully pannable in both directions, and pinching out (RESP-064) snaps it to fit.
- **Watch:** If `fitZoomToWidth()` ever ran per-document it would silently overwrite a zoom the reader had deliberately pinched to.

---

## 4. The 560px band

### RESP-038 - Zoom readout and continuous toggle hide below 561px
**P1** * Visual * `src/styles.css:609-612`

- **Pre:** 360 x 640.
- **Steps:**
  1. Confirm `#zoomVal` and `#btnContinuous` are absent from the toolbar.
  2. Tap the "−" and "+" zoom buttons three times each.
- **Expect:** Both controls are `display:none`. The zoom buttons still work — the page visibly shrinks and grows, and `state.ui.zoom` changes (clamped 0.5-3 by `src/app.js:3095-3096`) — you simply have no numeric readout.
- **Watch:** `updateZoom()` writes to `$('#zoomVal')` unconditionally (`src/app.js:3179`); the element still exists, just hidden. If it were removed from the DOM instead, `updateZoom()` would throw and zooming would stop working entirely at this width.

### RESP-039 - Continuous mode cannot be toggled at 360px
**P1** * Edge * `src/styles.css:610`, `src/app.js:3093 wire()`

- **Pre:** At 900px, turn continuous scroll **off** (single-page mode). Confirm `state.ui.continuous` is `false`.
- **Steps:**
  1. Narrow to 360px and reload.
- **Expect:** The app stays in single-page mode — the persisted state is honoured, page ‹ / › navigation works, and there is no way to switch back until you widen past 561px. Highlights, pins and capture all work in single-page mode at this width.
- **Watch:** Most phone testing happens in the default continuous mode. Single-page mode at 360px uses `#pageWrap`/`#overlay`/`#pins` instead of the `.pg` wrappers — a different code path in `pageWrappers()` (`src/app.js:1094`) that is easy to leave untested on mobile.

### RESP-040 - Three-digit page numbers in the 16px page input
**P2** * Visual * `src/styles.css:96-98`, `src/styles.css:600`

- **Pre:** 360px. A PDF with 100+ pages.
- **Steps:**
  1. Navigate to page 128.
  2. Read `#pageInput` and `#pageTotal`.
- **Expect:** "128" is fully legible inside the 38px-wide input at the 16px font size this breakpoint forces, and `#pageTotal` renders "/ 128" on **one line** (`white-space:nowrap; flex:0 0 auto`).
- **Watch:** `.pagein` is `width:38px` with `padding:5px 4px`, leaving 30px of content box; at 16px a 4-digit page number will clip. `.pagetotal` wrapping onto two lines was a real bug fixed in `7517be9` — it breaks the 60px toolbar height.

### RESP-041 - Notes drawer content wraps rather than overflows at 360px
**P2** * Visual * `src/styles.css:175`, `src/styles.css:249`, `src/styles.css:225`

- **Pre:** 360px. A note with several long tags, several provenance chips, and an AI answer containing a wide markdown table.
- **Steps:**
  1. Open the notes drawer and expand that note.
- **Expect:** `.pills`, `.chips` and `.tagrow` wrap (`flex-wrap:wrap`); individual `.chip`s ellipsize (`max-width:100%; text-overflow:ellipsis`); the markdown table scrolls inside its own `.md-tablewrap` (`overflow-x:auto`) rather than widening the drawer. The drawer's own width never exceeds 92vw.
- **Watch:** Code blocks (`pre.code-block`, `white-space:pre`) and MathJax display containers are the usual culprits — both have their own `overflow-x:auto`, but a very long single-token equation can still stretch the card.

---

## 5. Resizable splitter and persisted panel width

### RESP-042 - Drag the notes panel divider
**P0** * Functional * `src/app.js:3221 initPanelResize()`, `src/app.js:3218 setRightW()`

- **Pre:** 1440px, notes panel open.
- **Steps:**
  1. Hover the notes panel's left edge — a 2px blue line appears and the cursor becomes `col-resize`.
  2. Press and drag left by ~150px, then release.
- **Expect:** The panel widens live as you drag; `body` carries `col-resizing` during the drag (grid transition suspended, text selection disabled); on release the width is written to `state.settings.rightW` and the connector redraws.
- **Watch:** `onMove` computes `startW - (px(e) - startX)` — dragging **left** must widen the panel. A sign flip makes the panel shrink as you pull it open.

### RESP-043 - Minimum width clamp
**P1** * Edge * `src/app.js:3214 clampRightW()`

- **Pre:** 1440px, notes panel open.
- **Steps:**
  1. Drag the divider as far right as it will go — past the right edge of the screen if you can.
- **Expect:** The panel stops at 300px. The "Notes" heading, filter/search/save/import/PDF/trash/collapse buttons, the composer and the count row all remain usable at 300px.
- **Watch:** The header row holds 7 icon buttons after `injectNotesButtons()`. At 300px they must not wrap onto a second line or push "Notes" out of the panel.

### RESP-044 - Maximum width clamp is viewport-dependent
**P1** * Edge * `src/app.js:3215 clampRightW()`

- **Pre:** —
- **Steps:**
  1. At **1600px**, drag the divider as far left as it goes. Measure.
  2. At **1000px**, reload and repeat.
  3. At **900px**, reload and repeat.
- **Expect:** Max = `min(760, max(340, innerWidth - 460))`. At 1600 → 760px. At 1000 → 540px. At 900 → 440px. The reader always keeps at least ~460px minus the (zeroed) left column.
- **Watch:** `clampRightW()` reads `window.innerWidth` at call time only. It is applied on every `setRightW()` during a drag, so the clamp is live *while dragging* but never re-applied afterwards (RESP-050).

### RESP-045 - Double-click resets the divider
**P1** * Functional * `src/app.js:3245 initPanelResize()`

- **Pre:** 1440px, notes panel dragged to a non-default width.
- **Steps:**
  1. Double-click the divider.
  2. Reload.
- **Expect:** The panel snaps back to exactly 384px, `state.settings.rightW` is written as 384, the connector redraws, and the width survives the reload. The tooltip "Drag to resize · double-click to reset" documents this (note the U+00B7 middle dot).
- **Watch:** A double-click also fires two `mousedown`/`mouseup` pairs, so `onDown`/`onUp` run twice first. If `onUp` saves a jittered width **after** the dblclick handler saves 384, the reset is lost on reload — check the persisted value, not just the screen.

### RESP-046 - Saved width is applied on boot
**P1** * State * `src/app.js:3220 applyPanelWidths()`, `src/app.js:3322 boot()`

- **Pre:** Set the notes panel to ~600px at 1600px wide. Confirm `state.settings.rightW` is ~600.
- **Steps:**
  1. Reload at 1600px.
- **Expect:** The panel is ~600px from the first paint — no flash of 384px then a jump. `applyPanelWidths()` runs before `initPanelResize()` and before the first render.
- **Watch:** `applyPanelWidths()` runs *after* `wire()` but *before* the PDF loads. A saved width larger than the current window's clamp is silently reduced at boot (`setRightW` clamps) — reopening at a narrower window permanently shrinks the saved value.

### RESP-047 - No drag while the panel is collapsed
**P1** * Edge * `src/app.js:3237 initPanelResize()`

- **Pre:** 1440px. Collapse the notes panel with "»".
- **Steps:**
  1. Move the mouse to where the divider was (the reader's right edge) and try to drag.
- **Expect:** Nothing happens — `onDown` returns early when `#app` has `collapse-right`. No `col-resizing` class on `body`, no cursor change, no width written.
- **Watch:** The grip element is still in the DOM inside a zero-width `#notes`. A missing guard would let you drag a collapsed panel open to an arbitrary width with the toggle still reading "collapsed".

### RESP-048 - body.col-resizing suppresses transition and selection
**P1** * Visual * `src/styles.css:616-618`

- **Pre:** 1440px, a page of selectable text visible in the reader.
- **Steps:**
  1. Start dragging the divider and, mid-drag, sweep the pointer across the PDF text.
- **Expect:** No text gets selected anywhere on the page (`body.col-resizing{user-select:none}`), the cursor stays `col-resize` over the whole document, the divider line stays blue, and the panel tracks the pointer with **no** easing lag (`body.col-resizing #app{transition:none}`).
- **Watch:** Without `transition:none`, the `.18s` grid easing makes the panel trail the pointer and the drag feels broken. Without `user-select:none`, a fast drag selects the whole reader and can fire `onTextSelect()`, popping the selection popover mid-resize.

### RESP-049 - The divider is gone at drawer widths
**P1** * Visual * `src/styles.css:561`, `src/styles.css:614`

- **Pre:** 390px, notes drawer open.
- **Steps:**
  1. Try to drag the drawer's left edge with a finger.
  2. Try to swipe left/right across the drawer's edge.
- **Expect:** `.col-resizer` is `display:none`. The drag does nothing; the drawer keeps `min(92vw,380px)`. The touch instead scrolls or does nothing — it must never start a resize, and must never leave `body.col-resizing` stuck on.
- **Watch:** `onDown` is bound via `touchstart` with `{passive:false}` and calls `preventDefault()`. A `display:none` element receives no events, so this is safe — but re-showing the grip at drawer widths would immediately break drawer scrolling.

### RESP-050 - Window resize does not re-clamp a saved width
**P1** * Edge * `src/app.js:3214 clampRightW()`, `src/app.js:3176 wire()`

- **Pre:** At 1600px, drag the notes panel to its 760px maximum. Do **not** reload.
- **Steps:**
  1. Narrow the browser window to 900px.
  2. Read the computed `--right-w` and measure the reader column.
- **Expect:** A documented result — `clampRightW()` runs only on `setRightW()` (drag / dblclick / boot), and the only `resize` listener redraws the connector. So the inline 760px persists and the reader is squeezed to ~140px. Confirm the toolbar still scrolls and no content is unreachable; then reload and confirm boot re-clamps to 440px.
- **Watch:** Below 821px the drawer CSS takes over and hides the problem entirely — this is only visible in the 821-1100px band. It is exactly the band a laptop user hits by snapping the window to half the screen.

---

## 6. Touch text selection and the selection popover

### RESP-051 - Long-press selection surfaces the popover on iOS
**P0** * Regression * `src/app.js:3137-3146 wire()`, `src/app.js:813 onTextSelect()` * iOS only

- **Pre:** iOS Safari, 390 x 844, sample doc, "Select" tool active.
- **Steps:**
  1. Long-press a word in the PDF text, then drag the selection handles across a sentence.
  2. Lift your finger and wait ~0.5s.
- **Expect:** `#selPop` appears with exactly three buttons: "Highlight", "Note", "✦ Ask AI".
- **Watch:** This was completely broken until `cb7cbe9`. iOS dispatches `mouseup` only for taps — a long-press that creates a selection is consumed by the selection UI and no `mouseup` ever arrives, so the `mouseup`-only path never fired. The popover now also keys off `selectionchange` (350ms debounce) and `touchend` (80ms). Regressing to `mouseup` alone looks fine on every desktop browser and is dead on every iPhone.

### RESP-052 - The popover is pinned to the bottom on a phone
**P0** * Regression * `src/styles.css:590-591`, `src/app.js:845 positionSelPop()` * iOS only for the conflict

- **Pre:** iOS Safari at 390px.
- **Steps:**
  1. Select text in the **middle** of the page. Note where the popover lands.
  2. Select text near the **top** of the page, and again near the **bottom**.
- **Expect:** In all three cases `#selPop` sits at bottom-centre (`left:50%; transform:translateX(-50%); bottom:calc(14px + env(safe-area-inset-bottom) + var(--kb,0px))`), never beside the selection. iOS's own "Copy / Look Up / Translate" menu floats over the selection; the two must not overlap.
- **Watch:** `positionSelPop()` must **clear** any inline `left`/`top` when `drawerMQ.matches` (`src/app.js:850`) — those coordinates are written on wider layouts and would otherwise beat the CSS after a resize. Test by selecting text at 1200px, then narrowing to 390px and re-selecting.

### RESP-053 - The tools bar stands down while the popover is up
**P0** * Visual * `src/styles.css:592`

- **Pre:** 390px.
- **Steps:**
  1. Select text so the popover appears.
  2. Look at the bottom-centre of the screen.
  3. Dismiss the selection (tap elsewhere).
- **Expect:** While `#selPop` is visible the tools pill is `opacity:0; pointer-events:none` — they occupy the same slot, so exactly one is visible at a time. Taps in that area hit the popover buttons only. When the selection is cleared the tools pill fades back in and is tappable again.
- **Watch:** This uses `body:has(#selPop:not(.hidden))`. `:has()` needs Safari 15.4+, Chrome 105+, Firefox 121+. On an older engine both bars render on top of each other; check the actual browser version before filing.

### RESP-054 - Crossing the 820px boundary with a live selection
**P1** * Edge * `src/app.js:845-857 positionSelPop()`

- **Pre:** Desktop browser at 1200px.
- **Steps:**
  1. Select a sentence so the popover appears anchored to it.
  2. Without clearing the selection, narrow the window to 700px.
  3. Nudge the selection (or scroll one line) so `positionSelPop()` runs again.
- **Expect:** The popover moves to the bottom-centre pinned position. No stale inline `top`/`left` leaves it stranded mid-page or off-screen.
- **Watch:** `positionSelPop()` is only called from `onTextSelect()` and the capture-phase `scroll` handler (`src/app.js:3150`) — **not** from a `resize` listener. Until something re-triggers it, the popover keeps its old inline coordinates. Confirm the first interaction after the resize fixes it rather than leaving it broken.

### RESP-055 - Desktop popover flips above a low selection
**P1** * Functional * `src/app.js:856-857 positionSelPop()`

- **Pre:** Desktop at 1200px, reader scrolled so text sits within 60px of the window bottom.
- **Steps:**
  1. Select a phrase on the very last visible line.
- **Expect:** The popover renders **above** the selection instead of below it, fully on-screen, and horizontally clamped to `[8, innerWidth - popWidth - 8]`.
- **Watch:** Also test a selection at the far right edge — the clamp must keep the "✦ Ask AI" button inside the window.

### RESP-056 - No mid-drag commit with the highlight tool (mouse)
**P1** * Regression * `src/app.js:3133-3136 wire()`

- **Pre:** Desktop at 1200px. Activate the "Highlight" tool.
- **Steps:**
  1. Press the mouse on the first word of a paragraph and drag slowly across three lines, **pausing for a full second** halfway.
  2. Release.
- **Expect:** Exactly **one** highlight is created, covering the whole three-line selection, when you release. The toast "Highlighted — drag more text, or pick another tool." fires once.
- **Watch:** `selectionchange` fires on every character of a drag. The `held` flag (set on capture-phase `mousedown`, cleared on capture-phase `mouseup`) is the only thing preventing `onTextSelect()` → `highlightSelection()` from committing a partial highlight and clearing your selection mid-drag. This was a real desktop regression introduced by the touch fix and repaired in `1aec32f`.

### RESP-057 - No mid-drag commit while adjusting selection handles (touch)
**P1** * Regression * `src/app.js:3134-3145 wire()` * iOS only

- **Pre:** iOS Safari at 390px, "Highlight" tool active.
- **Steps:**
  1. Long-press to select a word, then drag the trailing selection handle slowly across two lines, pausing repeatedly.
  2. Lift.
- **Expect:** One highlight, matching the final selection. Nothing commits while your finger is down.
- **Watch:** `touching` is read from `e.touches.length` on every `touchstart`/`touchend`/`touchcancel` — never incremented/decremented — precisely so a dropped `touchend` (common when iOS's menu appears) cannot wedge it at a non-zero value and permanently disable the popover. If the popover stops appearing after a few selections, this is the first thing to check.

### RESP-058 - Tapping the popover's own buttons is not cancelled
**P1** * Regression * `src/app.js:3141 wire()`, `src/app.js:3127 wire()`

- **Pre:** 390px on a real touch device.
- **Steps:**
  1. Select text, then tap "Note" on the popover.
  2. Repeat and tap "✦ Ask AI".
  3. Repeat and tap "Highlight".
- **Expect:** Each button fires exactly once. "Note" and "✦ Ask AI" open the notes drawer, expand the new card and focus its reply box. "Highlight" creates the highlight silently and leaves the drawer closed.
- **Watch:** `liftTouch` bails out when the touch target is inside `#selPop`, and the `mouseup` handler does the same. Without both guards, the `touchend` on the button schedules `onTextSelect()`, which hides the popover before its `click` lands — the button appears dead.

### RESP-059 - selectionchange debounce
**P1** * Perf * `src/app.js:3146 wire()`

- **Pre:** 390px, "Select" tool.
- **Steps:**
  1. Long-press to select, then wiggle a selection handle rapidly back and forth for ~3 seconds.
- **Expect:** The popover does not flicker on every nudge; it settles once, ~350ms after you stop. No visible jank in the reader.
- **Watch:** `scheduleSel()` clears the previous timer each call, so only the last event wins. A `setTimeout` without the `clearTimeout` would queue dozens of `onTextSelect()` calls, each recomputing `getClientRects()`.

### RESP-060 - Scrolling with a live selection
**P1** * Functional * `src/app.js:3150 wire()`

- **Pre:** 390px, text selected and the popover showing.
- **Steps:**
  1. Scroll the reader (one-finger drag) without lifting the selection.
  2. Then tap elsewhere to clear the selection and scroll again.
- **Expect:** While a non-empty selection survives the scroll, `positionSelPop()` runs — at drawer widths that means the popover simply stays bottom-pinned. Once the selection is empty, `#selPop` gets `hidden`.
- **Watch:** The listener is registered with `capture: true` so it catches `.rd-scroll`'s scroll (which does not bubble). On desktop this is what keeps the popover glued to the moving text; verify there too at 1200px.

### RESP-061 - One-character selection produces no popover
**P2** * Edge * `src/app.js:818 onTextSelect()`

- **Pre:** 390px.
- **Steps:**
  1. Double-tap a single-letter token (e.g. a lone "a" or an equation variable).
  2. Long-press and select a single space.
- **Expect:** No popover — `onTextSelect()` requires `text.length >= 2` after trimming. Any already-visible popover is hidden.
- **Watch:** Also verify a selection that lands **outside** any `.textLayer` (e.g. across the notes drawer text) hides the popover rather than anchoring it to the drawer.

---

## 7. Pinch-to-zoom

### RESP-062 - Pinch in zooms and re-renders crisply
**P0** * Functional * `src/app.js:990 initPinch()`, `src/app.js:1019 commit()`

- **Pre:** Real touch device at 390px, sample doc, continuous mode.
- **Steps:**
  1. Place two fingers on the page and spread them apart.
  2. Hold for a moment, then lift.
- **Expect:** During the gesture the page scales smoothly under your fingers (a CSS `transform: scale(k)` preview — text may look soft). On lift, the transform is cleared and the PDF **re-renders** at the new zoom: text is sharp, highlights and pins are redrawn in the right places, and `#zoomVal` (above 561px) shows the new percentage.
- **Watch:** If text stays soft after you lift, `commit()` did not run — check that `touchend` fires with `e.touches.length < 2` and that `updateZoom()` completed. Highlights drawn at the *old* scale mean `drawHighlights()`/`drawPins()` were skipped at `src/app.js:1041`.

### RESP-063 - The browser's own page zoom never engages inside the reader
**P0** * Regression * `src/styles.css:110`

- **Pre:** Real touch device at 390px.
- **Steps:**
  1. Pinch on the page area.
  2. Pinch on the toolbar.
  3. Pinch inside the open notes drawer.
- **Expect:** Over `.rd-scroll` only the app's own zoom runs — the toolbar, tools pill and drawers stay exactly the same size, and the layout does not pan. Over the toolbar/drawer the browser's native page zoom may engage (nothing suppresses it there); a double-tap on the page area must **not** trigger browser double-tap zoom.
- **Watch:** `.rd-scroll{touch-action:pan-x pan-y}` reserves the pinch. If it reverts to `auto` or `manipulation`, the browser magnifies the entire UI — including the drawers and the tools pill — and blurs the canvas instead of re-rendering it. Verify by checking that the toolbar's on-screen size is unchanged after a hard pinch.

### RESP-064 - Pinch out snaps to fit-width
**P0** * Functional * `src/app.js:1024-1030 commit()`, `src/app.js:427 fitZoom()`

- **Pre:** 390px. Zoom in (by pinching) until the page is roughly twice the screen width.
- **Steps:**
  1. Pinch out hard, well past "the whole page fits".
  2. Lift.
- **Expect:** The zoom lands exactly on fit-width — the page's width matches the reader minus an 8px gutter, and the toolbar and tools pill are all visible. It does **not** keep shrinking below the screen.
- **Watch:** The snap has two guards: `fit <= p.z0` (only when you were zoomed in past fit) and `z <= fit * 1.06` (a near miss is pulled onto fit). A pinch-out that overshoots to 0.5 means `fitZoom()` returned null — it needs `#rdScroll` to have non-zero `clientWidth` and `pdfDoc` to be loaded.

### RESP-065 - Pinch out when already at or below fit does not zoom in
**P1** * Edge * `src/app.js:1029 commit()`

- **Pre:** 390px, freshly loaded (so the zoom is already fit-width from `fitZoomToWidth()`).
- **Steps:**
  1. Pinch out (fingers together).
- **Expect:** The page gets **smaller**, down to the 0.5 floor. It must never jump *up* to fit-width — that would be the opposite of the gesture.
- **Watch:** The `fit <= p.z0` guard is what prevents this. Removing it makes every pinch-out at fit-width snap back to fit-width, so the reader can never zoom out below fit.

### RESP-066 - The pinched-on point stays under the fingers
**P1** * Functional * `src/app.js:1035-1040 commit()`

- **Pre:** 390px, continuous mode, scrolled to the middle of page 5.
- **Steps:**
  1. Put two fingers on a specific, identifiable word (a figure caption works well) near the bottom-right of the screen.
  2. Pinch in to roughly double the zoom, then lift.
- **Expect:** After the re-render, that same word is still under (or within a few pixels of) where your fingers were — not at the top-left of the page, and not on a different page.
- **Watch:** The focal point is stored in page units (`fx = (cx - ab.left) / zoom`) against the `.pg` under the fingers, and re-applied via `rd.scrollLeft`/`scrollTop` after `updateZoom()`. In continuous mode `updateZoom()` calls `buildContinuous()`, which rebuilds every `.pg` — if the target `.pg` is not rendered yet, the rect is a placeholder and the restore is wrong.

### RESP-067 - A small nudge during a two-finger scroll is ignored
**P1** * Edge * `src/app.js:1022 commit()`

- **Pre:** 390px.
- **Steps:**
  1. Scroll the page with **two** fingers, keeping them roughly the same distance apart, then lift.
- **Expect:** No zoom change at all — `Math.abs(k - 1) < 0.06` treats it as a scroll, and the transform preview is cleared cleanly (no leftover `transform`, `transformOrigin` or `willChange` on `#contPages`/`#pageWrap`).
- **Watch:** Inspect the layer element after the gesture. A stuck `will-change:transform` keeps a compositing layer alive for the whole page stack and degrades scrolling on a phone.

### RESP-068 - Zoom clamps at 0.5x and 3x
**P1** * Edge * `src/app.js:1015 initPinch()`, `src/app.js:1023 commit()`

- **Pre:** 390px.
- **Steps:**
  1. Pinch out repeatedly until nothing changes. Note the zoom.
  2. Pinch in repeatedly until nothing changes. Note the zoom.
- **Expect:** The zoom bottoms out at 0.5 (50%) and tops out at 3 (300%) — the same floor/ceiling as the − / + buttons. The gesture preview is also clamped to `k` in `[0.2, 5]` so the transform never explodes mid-gesture.
- **Watch:** At 300% on a 390px screen the page is ~1800px wide; combined with RESP-036, confirm you can still scroll to both left and right edges.

### RESP-069 - Pinch anchors to the page under the fingers in continuous mode
**P1** * Functional * `src/app.js:998-1006 initPinch()`

- **Pre:** 390px, continuous mode, scrolled so the boundary between page 3 and page 4 is on screen.
- **Steps:**
  1. Pinch centred clearly on page 4.
  2. Check `#pageInput` and the notes panel's page context after the gesture.
- **Expect:** `state.ui.page` becomes 4 (taken from `anchor.dataset.page` via `document.elementFromPoint` at the gesture centre), and the reader stays on page 4 after the re-render.
- **Watch:** If the gesture centre lands in the 16px gap between pages, `elementFromPoint` returns `#contPages` and `closest('.pg')` is null, so it falls back to `$('#pageWrap')` — which is `display:none` in continuous mode. Verify a gap-centred pinch does something sane and does not throw.

### RESP-070 - A third finger, or an interrupted gesture, commits cleanly
**P1** * Edge * `src/app.js:1043-1044 initPinch()`

- **Pre:** 390px.
- **Steps:**
  1. Start a pinch, then add a third finger without lifting the first two.
  2. Start another pinch and, mid-gesture, trigger a system interruption (swipe up from the bottom edge and back, or receive a notification) so `touchcancel` fires.
- **Expect:** In both cases the preview transform is cleared and the zoom either commits or returns to where it was — never a page stuck at a half-applied `scale()`.
- **Watch:** `touchmove` bails when `e.touches.length !== 2`, so with three fingers `k` freezes at its last value; `touchend` then fires `commit()` once the count drops below 2. `touchcancel` commits unconditionally. A leftover `transform` on `#contPages` is the visible symptom — the whole page stack renders at the wrong size and taps land in the wrong place.

### RESP-071 - Pinch with no PDF loaded
**P2** * Edge * `src/app.js:994 initPinch()`

- **Pre:** Empty the library so the reader shows "Your library is empty" (`showEmptyReader()`), at 390px.
- **Steps:**
  1. Pinch on the empty reader area.
- **Expect:** Nothing happens and no console error — `initPinch` returns early when `!pdfDoc`. The fallback card stays put.
- **Watch:** Repeat with the sandboxed-preview fallback showing ("Open this file directly to read the PDF"), where `pdfDoc` is also null but `#pageWrap` still exists.

---

## 8. Touch capture, comments and pins

### RESP-072 - Screenshot box-select by finger
**P0** * Regression * `src/app.js:917 initCaptureMask()`, `src/styles.css:158`

- **Pre:** Real touch device at 390px, sample doc, a figure visible on screen.
- **Steps:**
  1. Tap the "Screenshot region" tool. The `.capbar` reading "Select area to capture" and "Cancel" appears.
  2. Drag a box around the figure with one finger.
  3. Lift.
- **Expect:** A dashed selection box with 4 corner handles follows your finger; the reader does **not** scroll during the drag (`#captureMask{touch-action:none}`). On lift, a screenshot note is created, the notes drawer opens, and the toast "Region captured — ask the AI about it below." fires. The tool resets to "Select".
- **Watch:** This was mouse-only until `cb7cbe9` — `mousedown`/`mousemove`/`mouseup` never fire for a finger drag. The handlers must be **pointer** events. If the page scrolls instead of drawing a box, `touch-action:none` was lost.

### RESP-073 - A too-small capture box is discarded
**P1** * Edge * `src/app.js:939 initCaptureMask()`

- **Pre:** 390px, "Screenshot region" active.
- **Steps:**
  1. Tap once on the page without dragging.
  2. Drag a box of roughly 10 x 10px and lift.
- **Expect:** No note is created in either case (`r.w < 12 || r.h < 12`), no toast, and the capture tool stays active so you can try again. The `.capbar` remains visible.
- **Watch:** The box element must be removed from the DOM in both cases. An orphaned `.selbox` sits at `z-index:15` over the page and is `pointer-events:none`, so it looks like a permanent dashed rectangle you cannot dismiss.

### RESP-074 - Cancelling capture on a phone
**P1** * Functional * `src/app.js:3101 wire()`, `src/styles.css:152-155`

- **Pre:** 390px, "Screenshot region" active.
- **Steps:**
  1. Tap "Cancel" in the `.capbar`.
- **Expect:** The tool returns to "Select" (the cursor tool is filled in the pill), `#captureMask` becomes `display:none`, the `.capbar` hides, and the text layer becomes selectable again (`pointerEvents:auto`).
- **Watch:** The `.capbar` is `position:absolute; top:74px; left:50%` inside `#reader` (moved there by `wire()` at `src/app.js:3102`). At 360px it must not overflow the screen — its content is "Select area to capture" plus a separated "Cancel".

### RESP-075 - Comment tool by tap
**P1** * Functional * `src/app.js:3113-3122 wire()`

- **Pre:** 390px, notes drawer closed.
- **Steps:**
  1. Tap the "Comment" tool.
  2. Tap a spot in the middle of the page.
- **Expect:** A numbered pin appears exactly where you tapped, the notes drawer opens with the new card selected and its reply box focused (keyboard up), the tool resets to "Select", and the toast "Comment placed — type your note below." fires.
- **Watch:** The handler ignores the tap when `window.getSelection()` is non-empty. On iOS a tap after a previous selection may leave a stale range — verify a comment can still be placed immediately after dismissing a selection.

### RESP-076 - Tapping a pin opens the drawer without moving the reader
**P1** * Functional * `src/app.js:1124 drawPins()`, `src/app.js:1132 openRightPanel()`

- **Pre:** 390px, notes drawer **closed**, several pins visible on screen. Note the exact scroll position.
- **Steps:**
  1. Tap a pin (the small numbered circle).
- **Expect:** The notes drawer opens, its card scrolls into view ~210ms later, and the **reader does not scroll at all** — the pin you tapped is still exactly where it was. The on-screen keyboard does **not** appear (see RESP-083).
- **Watch:** The pin handler calls `selectAnnotation(a.id, true, false)` — the third argument `false` suppresses `scrollToAnnotation()`. Passing `true` (or omitting it) makes the reader jump, which is disorienting on a phone where the pin was already visible.

### RESP-077 - The capture mask does not eat toolbar or drawer taps
**P2** * Edge * `src/styles.css:158`, `src/app.js:3102 wire()`

- **Pre:** 390px, "Screenshot region" active.
- **Steps:**
  1. With the mask up, tap "Show notes", then reopen the reader and tap the page ‹ / › buttons.
- **Expect:** `#captureMask` spans `top:60px` to the bottom of `#reader` only. The toolbar above it and both drawers (`z-index:60` vs the mask's 30) stay fully interactive.
- **Watch:** With a drawer open the scrim (55) covers the mask (30) — verify a drag on the scrim closes the drawer and does not draw a capture box underneath it.

---

## 9. On-screen keyboard and iOS focus quirks

### RESP-078 - The drawer lifts above the keyboard
**P0** * Regression * `src/app.js:950 initKeyboardInset()`, `src/styles.css:546-549` * iOS only

- **Pre:** iOS Safari, real device, 390 x 844. Notes drawer open with several notes.
- **Steps:**
  1. Tap the document composer ("Ask about this document…") to raise the keyboard.
  2. Inspect the drawer's bottom edge and the composer box.
- **Expect:** The composer sits directly above the keyboard and is fully visible. `--kb` on `<html>` is set to the measured overlap (~300px on an iPhone with the accessory bar), and the drawer's `bottom:var(--kb,0px)` lifts it by exactly that much.
- **Watch:** iOS keeps the **layout** viewport (and therefore `100dvh`) at full height when the keyboard opens; only `visualViewport` shrinks. Without `--kb` the composer is behind the keyboard and Safari's accessory bar — you type blind. Verify `--kb` returns to `0px` when the keyboard dismisses.

### RESP-079 - No iOS auto-zoom when a control takes focus
**P0** * Regression * `src/styles.css:600` * iOS only

- **Pre:** iOS Safari at 390 x 844.
- **Steps:**
  1. Tap `#pageInput` in the toolbar.
  2. Tap the notes search box ("Search notes, answers, tags…").
  3. Tap a note's inline reply box.
  4. Open the find bar and tap "Find in document…".
  5. Double-tap an AI answer to open the inline edit box.
- **Expect:** In all five cases the page does **not** zoom or pan. The toolbar stays fully in view; the drawer does not slide off-screen; taps keep landing where they look.
- **Watch:** Safari auto-zooms whenever a focused control's computed font-size is under 16px. The rule `input,textarea,select,.pagein,.tc-input,.edit-input,#findInput{font-size:16px}` covers every one of them — the classes are listed explicitly because the base rules (`.tc-input` 13px, `.edit-input` 13.5px, `#findInput` 13.5px) would otherwise win on specificity. Adding a new input class without adding it here reintroduces the bug for that one field only.

### RESP-080 - Replying to a note folds away the drawer chrome
**P0** * Regression * `src/app.js:959-962 initKeyboardInset()`, `src/styles.css:606-607`

- **Pre:** 390px, notes drawer open, at least one note expanded so its inline `.tc-input` is present.
- **Steps:**
  1. Tap the note's own reply box inside the card.
- **Expect:** `#notes` gains the class `replying`; the count/sort row ("12 notes" / "Sorted by time ▾") and the document-level composer ("Ask about this document…") both become `display:none`, freeing ~112px. The reply box you are typing in is fully visible above the keyboard.
- **Watch:** Driven by a class, not `:has(:focus)` — `:focus` does not match while the *document* is unfocused, which happens routinely on iOS. Check the class on `#notes` in the inspector, not just the visual result. Also confirm it does **not** apply above 820px: the rule lives inside the drawer media query, so a desktop reply must keep both rows.

### RESP-081 - .replying clears on blur
**P1** * State * `src/app.js:969 initKeyboardInset()`

- **Pre:** RESP-080 state (currently replying).
- **Steps:**
  1. Dismiss the keyboard (tap the page area / the "Done" key).
  2. Tap the document composer instead.
- **Expect:** After blur, `replying` is removed and the count row and document composer come straight back. Focusing the *document* composer must **not** set `replying` — `isNoteField()` requires `.tc-input`/`.edit-input` inside `#notes`, and `#composerInput` is neither.
- **Watch:** `focusout` re-syncs on the **next tick** (`setTimeout(syncReplying, 0)`) because `document.activeElement` is `<body>` during the event itself. Removing that delay makes the chrome flash back in while you tab between two reply boxes.

### RESP-082 - The focused field is scrolled into view inside the list
**P1** * Functional * `src/app.js:953-957, 967, 974 initKeyboardInset()`

- **Pre:** 390px, notes drawer open, a long list of notes. Scroll so a card near the **bottom** of the list is partly visible.
- **Steps:**
  1. Expand that card and tap its reply box.
  2. Wait for the keyboard animation to finish.
- **Expect:** ~320ms after focus, the reply box is pulled fully into the visible band of `#notesList` (`scrollIntoView({block:'nearest'})`) and is not clipped by the list's bottom edge.
- **Watch:** The field lives in `#notesList`'s own scroller, so shrinking the drawer via `--kb` does not move it — this reveal is the only thing that does. `scrollIntoView` also scrolls ancestors; verify it does not push the reader's toolbar off-screen (the drawer is `position:fixed`, which should prevent that).

### RESP-083 - Selecting a note does not raise the keyboard on touch
**P0** * Regression * `src/app.js:1218 selectAnnotation()` * iOS only for the symptom

- **Pre:** 390px on a touch device, notes drawer open, keyboard down.
- **Steps:**
  1. Tap a note **card** in the list (not its reply box).
  2. Tap a numbered pin in the reader.
- **Expect:** The card expands and is selected; `document.activeElement` stays `<body>`; the keyboard stays down. Reading a note is not a request to type.
- **Watch:** `focusThreadCompose()` is gated on `!drawerMQ.matches`. Removing that guard throws the keyboard over half the screen every time you tap a note — the bug fixed in `f5eaaec`. Verify the desktop behaviour is unchanged at 1200px: selecting a note **does** focus its reply box there.

### RESP-084 - Note / Ask AI does raise the keyboard
**P1** * Functional * `src/app.js:899 createFromSelection()`, `src/app.js:1616 focusThreadCompose()`

- **Pre:** 390px on a touch device, keyboard down.
- **Steps:**
  1. Select text and tap "Note".
  2. Repeat and tap "✦ Ask AI".
  3. Repeat and tap "Highlight".
- **Expect:** "Note" and "✦ Ask AI" open the notes drawer, expand the new card and put the caret in its reply box with the keyboard up. "Highlight" does none of that — no drawer, no keyboard, just the toast.
- **Watch:** `focusThreadCompose()` uses `focus({preventScroll:true})` with a plain `focus()` fallback. On a browser without `preventScroll` support the fallback scrolls the ancestor chain, which can shift the whole drawer.

### RESP-085 - A placed comment and a captured region raise the keyboard
**P1** * Functional * `src/app.js:3109 wire()`, `src/app.js:1080 captureRegion()`

- **Pre:** 390px on a touch device, keyboard down.
- **Steps:**
  1. Place a point comment with the "Comment" tool.
  2. Capture a region with the "Screenshot region" tool.
- **Expect:** Both open the notes drawer, select the new card and focus its reply box (keyboard up) — these are explicit "now type" intents and call `focusComposer()` directly rather than relying on `selectAnnotation()`.
- **Watch:** `focusComposer` is an alias of `focusThreadCompose` (`src/app.js:1620`) and targets `.card.sel .tc-input`. If the card is not yet rendered as `.sel` when it runs, focus silently goes nowhere and the keyboard stays down.

### RESP-086 - The selection popover rides above the keyboard
**P1** * Visual * `src/styles.css:591`

- **Pre:** iOS Safari at 390px, notes drawer open, keyboard up from a reply box.
- **Steps:**
  1. Without dismissing the keyboard, dismiss the drawer and select text in the reader.
- **Expect:** `#selPop` sits at `bottom: calc(14px + env(safe-area-inset-bottom) + var(--kb,0px))` — above the keyboard, fully visible, all three buttons tappable.
- **Watch:** `#selPop` is the **only** bottom-anchored element that includes `--kb`. `.tools` and `#toasts` do not (see RESP-088/089).

### RESP-087 - --kb resets when crossing above 820px
**P1** * State * `src/app.js:971-977 initKeyboardInset()`

- **Pre:** A device or emulator that can be resized while a keyboard-like inset is active. Simulate by narrowing to 700px, focusing a field, then widening.
- **Steps:**
  1. At 700px, focus the notes composer so `--kb` is non-zero.
  2. Widen the window to 1000px without blurring.
- **Expect:** `--kb` returns to `0px` — `apply()` computes the overlap only when `drawerMQ.matches`, and it is re-run by the `drawerMQ` `change` listener. Above 820 the drawers are grid columns and must not be lifted.
- **Watch:** A stale non-zero `--kb` above 820px is invisible (nothing consumes it there except `#selPop`, which is repositioned inline) — check the computed value on `<html>` directly.

### RESP-088 - The tools bar does not lift with the keyboard
**P2** * Edge * `src/styles.css:579`

- **Pre:** 390px, keyboard up (focus the notes composer, then close the drawer without blurring, if the device allows).
- **Steps:**
  1. Look for the tools pill.
- **Expect:** A documented, accepted gap: `.tools` uses `bottom:calc(14px + env(safe-area-inset-bottom))` with no `--kb` term, so it stays behind the keyboard. Confirm it becomes visible and tappable again once the keyboard dismisses, and that it is not left in a half-transparent state (the `:has(#selPop)` stand-down must have been cleared).
- **Watch:** File as P2 if the bar is unreachable in a realistic flow (keyboard up **and** you need to switch tools). Not a regression as written.

### RESP-089 - Typing in the reader's page input on a phone
**P1** * Functional * `src/app.js:3089-3092 wire()`, `src/styles.css:600`

- **Pre:** 390px on a real device, a 100+ page PDF.
- **Steps:**
  1. Tap `#pageInput` — it should select its contents.
  2. Type `57` and press the keyboard's Go/Return key.
- **Expect:** No page zoom on focus. The field selects on focus (`e.target.select()`), Enter commits and blurs, and the reader navigates to page 57. Non-digits are stripped (`replace(/[^\d]/g,'')`); an empty or zero entry restores the current page.
- **Watch:** With the keyboard up, `--kb` is non-zero but nothing in the reader consumes it — the toolbar is at the top so this is fine. Confirm the toolbar has not scrolled horizontally on its own while focused.

---

## 10. Orientation, rotation and resize mid-operation

### RESP-090 - Rotating a large phone crosses the 820px boundary
**P0** * Edge * `src/app.js:1139`, `src/styles.css:544`

- **Pre:** iPhone 14 Pro Max class device (393 x 852 portrait, 852 x 393 landscape). Notes drawer open in portrait.
- **Steps:**
  1. Rotate to landscape.
  2. Rotate back to portrait.
- **Expect:** In landscape (852px wide) the app leaves drawer mode entirely: the notes panel becomes a **grid column**, the scrim disappears, `#connectors` and `.col-resizer` come back, the 4 tools return to the **top** toolbar, `#selPop` re-anchors to the selection, and `--kb` becomes 0. Rotating back restores drawer mode. No JS errors either way.
- **Watch:** Landscape also enters the 821-1100px band, so the left library column is 0px wide (RESP-003) — in landscape the library is unreachable unless it was already collapsed. This is the single highest-value rotation check.

### RESP-091 - A small phone stays in drawer mode when rotated
**P1** * Edge * `src/styles.css:544`

- **Pre:** iPhone SE class device (375 x 667 portrait, 667 x 375 landscape).
- **Steps:**
  1. Rotate to landscape.
- **Expect:** 667px is still ≤820, so drawer mode persists. The tools pill stays at the bottom, the scrim still works, and the reader keeps a usable height (375px minus the 60px toolbar minus the ~88px bottom reservation ≈ 227px of page).
- **Watch:** At 375px of height the `.rd-scroll` bottom padding of 88px eats a quarter of the viewport. Verify the page is still scrollable to its own bottom and the tools pill does not overlap the page content it is meant to sit below.

### RESP-092 - Rotate with a drawer open
**P1** * Edge * `src/styles.css:550-553`

- **Pre:** Phone in portrait with the notes drawer open.
- **Steps:**
  1. Rotate to landscape and back, twice.
- **Expect:** The drawer's open/closed state (`collapseRight`) is preserved across both transitions. Above 820 it renders as an open column; below 820 as an open overlay with the scrim. It never ends up half-transformed or off-screen.
- **Watch:** `#app` has `transition:none` below 821 but `transition:grid-template-columns .18s` above it. Rotating *into* the wide layout starts that transition from a `1fr` single column — watch for a visible sweep of the reader as the columns are established.

### RESP-093 - Rotate while the keyboard is up
**P1** * Edge * `src/app.js:971-978 initKeyboardInset()` * iOS only

- **Pre:** iOS Safari, portrait, notes drawer open, typing a reply (keyboard up, `.replying` active).
- **Steps:**
  1. Rotate to landscape without dismissing the keyboard.
  2. Rotate back.
- **Expect:** The keyboard resizes, `visualViewport` fires `resize`, and `--kb` is recomputed. In landscape above 820px `--kb` goes to 0 and `.replying` stops applying (the rule is inside the media query) — the composer and count row reappear, and the reply field is still focused and visible above the landscape keyboard.
- **Watch:** iOS fires `visualViewport` resize several times during a rotation. Each `apply()` schedules a `revealFocused()` on the next frame when the overlap is positive — verify the notes list does not visibly jitter or scroll away from the field.

### RESP-094 - Rotate mid-pinch
**P1** * Edge * `src/app.js:1043-1044 initPinch()`

- **Pre:** Phone with auto-rotate on.
- **Steps:**
  1. Start a pinch on the page and, while both fingers are still down, rotate the device.
- **Expect:** The gesture is cancelled or committed cleanly. The preview `transform`, `transformOrigin` and `willChange` are all cleared from `#contPages`/`#pageWrap`, and the page renders correctly in the new orientation.
- **Watch:** Rotation typically fires `touchcancel`, which calls `commit()`. But `commit()` computes `fitZoom()` from `#rdScroll.clientWidth` — mid-rotation that width may be the *old* one, producing a wrong snap target. Check the resulting zoom is sane (page fits or is deliberately larger), not something like 43%.

### RESP-095 - Rotate or resize mid-capture-drag
**P1** * Edge * `src/app.js:917 initCaptureMask()`

- **Pre:** 390px, "Screenshot region" active.
- **Steps:**
  1. Start dragging a capture box, and mid-drag rotate the device (or, on desktop, resize the window).
- **Expect:** No orphaned `.selbox` is left on the page. Either the capture completes with a box matching what was on screen, or it is abandoned with `pointercancel` and the tool remains active for a retry. `captureRegion()` never captures a region from outside the canvas — it clamps to the canvas rect and toasts "Draw the box over a page to capture it." if the overlap is under 12px.
- **Watch:** `#captureMask` is `position:absolute` inside `#reader`; its `getBoundingClientRect()` is read at pointerdown *and* pointerup. A rotation between the two shifts the mask, so the committed rect can be offset — verify the captured thumbnail actually shows what you framed.

### RESP-096 - Resize while an AI answer is streaming
**P1** * Edge * `src/app.js:1201 followNoteBottom()`, `src/app.js:3176 wire()`

- **Pre:** Desktop at 1200px, notes panel open. Ask a question that produces a long answer.
- **Steps:**
  1. While the answer is still growing, narrow the window through 1100 → 900 → 800 → 700px.
- **Expect:** The answer keeps streaming into the card; the panel becomes a drawer at 820px with the streaming card still visible; no console errors; the connector disappears at 820 and does not reappear until you widen again.
- **Watch:** `followNoteBottom()` reads `getBoundingClientRect()` on the list and the card every tick. A card that has just been re-parented into a `position:fixed` drawer measures differently — watch for the list scrolling to a nonsense position.

### RESP-097 - iPad portrait: 820 vs 834
**P2** * Edge * `src/styles.css:538`, `src/styles.css:544`

- **Pre:** An iPad (or an emulator at these exact widths).
- **Steps:**
  1. Test at **820 x 1180** (iPad Air portrait).
  2. Test at **834 x 1194** (iPad Pro 11" portrait).
  3. Test at **1180 x 820** (iPad Air landscape).
- **Expect:** 820 → drawer mode. 834 → grid mode with the library column at 0px (RESP-003) and the notes column at 340px. 1180 → grid mode with the library column still 0px (still ≤1100) and notes at 340px. All three must be usable; note which of them leaves the library unreachable.
- **Watch:** iPad landscape at 1180px is the widest configuration that still zeroes the library. A tester on an iPad will report "the sidebar is gone" and it will look like a rendering bug rather than a breakpoint choice.

---

## 11. Overlays, banners, modals and print at narrow widths

### RESP-098 - Stacked top banners on a phone
**P1** * Visual * `src/app.js:737 restackBanners()`, `src/styles.css:657-670`

- **Pre:** 390px. A scanned PDF (so `showOcrBanner()` fires) that is also freshly opened with no notes (so `showNotesBanner()` fires). Reset `notesAsked`/`ocrDismissed` first.
- **Steps:**
  1. Open the scanned PDF and wait ~1.2s for the OCR detection pass.
- **Expect:** Both banners are visible and **stacked**, not overlapping: the first at `top:64px`, the second at `64 + firstHeight + 8`. Each is capped at `min(720px, calc(100vw - 32px))` = 358px at 390px. The OCR banner's message wraps to multiple lines (`.top-banner.ocr .tb-msg{white-space:normal}`) and reads "This looks like a **scanned PDF** — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?" with the buttons "Run OCR" and "✕". The notes banner's message ellipsizes on one line ("Have notes for **name**? Open its **.notes.json** to load them." / "Open notes file…").
- **Watch:** `restackBanners()` reads `offsetHeight`, so it must run **after** the banner is in the DOM and laid out — it is called inside a `requestAnimationFrame`. At 358px wide the OCR message is 3-4 lines tall, so the second banner sits well down the page; verify it does not cover the tools pill or the page's first paragraph in a way that traps the reader.

### RESP-099 - A banner floats above an open drawer
**P1** * Visual * `src/styles.css:657`, `src/styles.css:548`

- **Pre:** 390px with a banner showing.
- **Steps:**
  1. Open the notes drawer.
- **Expect:** The banner (`z-index:65`) renders above the drawer (`z-index:60`) and the scrim (55). Its "✕" is tappable. Confirm dismissing it while a drawer is open works and re-stacks any remaining banner.
- **Watch:** The banner is `left:50%; transform:translateX(-50%)` on the **viewport**, not the reader — with a 359px drawer open at 390px, it sits centred over the drawer, which reads as part of the drawer's UI. Judge whether it is legible there.

### RESP-100 - The filter popover stays inside the viewport at 390px
**P1** * Visual * `src/app.js:2231 openPopover()`, `src/styles.css:486-487`

- **Pre:** 390px, notes drawer open.
- **Steps:**
  1. Tap the funnel button (`title="Filter & options"`).
- **Expect:** The popover (`min-width:214px`) is clamped to `max(8, min(anchorRight - popWidth, innerWidth - popWidth - 8))`, so it is fully on screen, and renders at `z-index:80` above the drawer. Every row is reachable: "Show" / "All notes" / "Unresolved" / "Screenshots" / "AI replies" / "Questions", "Sort" / "By time" / "By page order", and "Auto-scroll to active note" with its switch.
- **Watch:** `openPopover()` only clamps **horizontally**. Its `top` is `anchor.bottom + 6` with no bottom clamp; on a short landscape phone (375px tall) a popover this long runs off the bottom with no way to scroll it. Test in landscape.

### RESP-101 - The Settings modal at 390px
**P1** * Visual * `src/styles.css:367-383`, `src/styles.css:600`

- **Pre:** 390px. Open the library drawer → tap the gear (`title="Settings"`).
- **Steps:**
  1. Scroll the modal top to bottom.
  2. Tap into each text field and each `<select>`.
- **Expect:** `.modal` is `width:560px; max-width:100%` inside a `.modal-mask` with `padding:20px`, so it renders at 350px wide and `max-height:90vh` with its own scroll. The settings tabs wrap or scroll rather than overflowing. Every input is 16px (no iOS zoom on focus, per RESP-079).
- **Watch:** The modal mask is `z-index:120`, above the drawers. Confirm the drawer behind it is not scrollable while the modal is open, and that tapping the mask edge (outside `.modal`) behaves per the modal's own dismiss rules.

### RESP-102 - Confirm dialogs and the Save As tip at 360px
**P1** * Visual * `src/styles.css:387-392`, `src/app.js:2460 maybeShowSaveAsTip()` * Firefox/Safari only for the tip

- **Pre:** 360px. Clear `localStorage['srw_saveas_tip']`. Use Firefox or Safari (the tip never shows where `showSaveFilePicker` exists).
- **Steps:**
  1. Tap the save-notes button in the notes header to trigger the tip.
  2. Then trigger a confirm dialog (e.g. the trash button → "Delete all N notes for "…"? This cannot be undone.").
- **Expect:** The tip's `.confirm-box` is `max-width:470px; width:100%` inside a 20px-padded mask → 320px at 360px wide. Its heading "Choose where your files save", the numbered stepper badges, the connector line and the mock control (a toggle for Firefox, a "✓" for Safari) all fit without horizontal overflow. The confirm dialog's "Delete" / "Cancel" buttons stay on one row (`.confirm-acts` is `justify-content:flex-end` with a 10px gap).
- **Watch:** The stepper is built from inline styles with a fixed 27px badge and a 14px gap; long step text ("Open **Settings → General**") must wrap, not push the box wider. If the buttons wrap onto two rows, the box has overflowed.

### RESP-103 - The export view at phone widths
**P1** * Visual * `src/styles.css:399-400`, `src/styles.css:414-416`

- **Pre:** 390px, several notes on the active document.
- **Steps:**
  1. Tap the PDF button (`title="Export annotations to PDF"`) in the notes header.
  2. Try to read the preview sheet and toggle an option in the left rail.
- **Expect:** A documented result — `.ex-body` is `grid-template-columns:300px 1fr` with **no** media query, so at 390px the options rail takes 300px and the preview gets ~90px. What must hold: both columns scroll independently (`overflow:auto`), every option checkbox and layout radio is reachable, the "back" control works, and the page body itself never scrolls horizontally.
- **Watch:** `.ex-item` is a `1fr 1fr` grid inside a ~90px preview column; text will be one or two characters per line. Judge whether the export view is usable enough to ship on a phone or should be filed as a gap — either way, record what you observed.

### RESP-104 - Printing from a phone browser
**P1** * Visual * `src/styles.css:431-451`

- **Pre:** 390px, export view open with several notes.
- **Steps:**
  1. Trigger the browser's print / "Share → Print" and inspect the preview.
- **Expect:** `#app`, `.ex-top`, `.ex-opts`, `#connectors` and `#toasts` are all `display:none`. `html, body` become `overflow:visible !important; height:auto !important`, overriding the app's `overflow:clip`, so the full sheet paginates instead of printing one clipped screen. `.ex-sheet` drops its shadow, border and max-width and prints at 9.5px. Highlight, quote and chip backgrounds are preserved (`print-color-adjust:exact`).
- **Watch:** The `!important` on `overflow`/`height` is load-bearing — `html,body{height:100%;overflow:clip}` at `src/styles.css:18` would otherwise clip every page after the first to a single screen. `.ex-item{break-inside:avoid}` must keep a note and its quote on one page.

### RESP-105 - A shared read-only file on a phone
**P1** * Edge * `src/styles.css:677-680`, `src/app.js:3294 applyReadOnly()`

- **Pre:** Export a `.annotated.html` via "Share as HTML", then open it on a phone at 390px. (The shared file inlines the same `styles.css` and `app.js`, so all of §1-§10 applies inside it too.)
- **Steps:**
  1. Scroll the reader to the bottom of the last page.
  2. Look at the bottom of the screen.
- **Expect:** The read-only strip "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX" is pinned to the bottom (`z-index:80`). The tools pill still renders because only "Highlight", "Comment" and "Screenshot region" are hidden by `applyReadOnly()` — "Select" remains. Verify the page's last line is still readable and the read-only banner's link is tappable.
- **Watch:** `body.readonly #rdScroll{padding-bottom:44px}` has higher specificity than the media query's `calc(88px + env(safe-area-inset-bottom))`, so the reader reserves only 44px at the bottom while the tools pill needs ~88px, and the `z-index:80` banner sits over the `z-index:45` pill. Expect the pill and the last line of the page to collide with the banner — measure it and file it with a screenshot.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `@media (max-width:1100px)` src/styles.css:538 | RESP-001, RESP-002, RESP-003, RESP-004, RESP-090, RESP-097 |
| `@media (max-width:820px)` src/styles.css:544-608 | RESP-005, RESP-006, RESP-007, RESP-026, RESP-028, RESP-029, RESP-030, RESP-091, RESP-092 |
| `@media (max-width:560px)` src/styles.css:609-612 | RESP-008, RESP-009, RESP-038, RESP-039, RESP-040, RESP-041 |
| `@media print` src/styles.css:431-451 | RESP-104 |
| `#scrim` src/styles.css:32, 555-557 | RESP-006, RESP-018, RESP-019, RESP-033, RESP-077 |
| drawer transforms src/styles.css:548-553 | RESP-006, RESP-014, RESP-015, RESP-016, RESP-020, RESP-021, RESP-025, RESP-092 |
| `.tools` bottom bar src/styles.css:579-582 | RESP-026, RESP-027, RESP-031, RESP-032, RESP-033, RESP-034, RESP-088 |
| `.rd-mid` / `.rd-top` src/styles.css:566-573 | RESP-009, RESP-026, RESP-028, RESP-029, RESP-030 |
| `#contPages` safe center src/styles.css:115 | RESP-010, RESP-036, RESP-068 |
| `#selPop` pinned rules src/styles.css:590-592 | RESP-052, RESP-053, RESP-086 |
| 16px control rule src/styles.css:600 | RESP-079, RESP-089, RESP-101 |
| `#notes.replying` src/styles.css:606-607 | RESP-080, RESP-081, RESP-093 |
| `.col-resizer` / `body.col-resizing` src/styles.css:614-618 | RESP-001, RESP-042, RESP-048, RESP-049 |
| `body.readonly` src/styles.css:677-680 | RESP-031, RESP-105 |
| `isNarrowViewport()` src/app.js:1144 | RESP-012, RESP-014, RESP-037 |
| `drawerMQ` src/app.js:1139 | RESP-052, RESP-083, RESP-087, RESP-090 |
| `setPanel()` src/app.js:1150 | RESP-014, RESP-017, RESP-018, RESP-023, RESP-025 |
| `openRightPanel()` src/app.js:1132 | RESP-023, RESP-076 |
| `drawConnector()` src/app.js:1162 | RESP-011, RESP-024, RESP-042 |
| `initPanelResize()` src/app.js:3221 | RESP-042, RESP-045, RESP-047, RESP-048, RESP-049 |
| `clampRightW()` src/app.js:3214 | RESP-043, RESP-044, RESP-050 |
| `setRightW()` / `curRightW()` src/app.js:3218-3219 | RESP-004, RESP-042, RESP-050 |
| `applyPanelWidths()` src/app.js:3220 | RESP-004, RESP-046 |
| `initKeyboardInset()` src/app.js:950 | RESP-078, RESP-080, RESP-081, RESP-082, RESP-087, RESP-093 |
| `isNoteField()` src/app.js:948 | RESP-080, RESP-081 |
| `initPinch()` src/app.js:990 | RESP-062, RESP-063, RESP-067, RESP-069, RESP-070, RESP-071, RESP-094 |
| `commit()` src/app.js:1019 | RESP-062, RESP-064, RESP-065, RESP-066, RESP-067, RESP-068, RESP-070, RESP-094 |
| `fitZoom()` src/app.js:427 | RESP-064, RESP-065, RESP-094 |
| `fitZoomToWidth()` src/app.js:437 | RESP-012, RESP-013, RESP-037, RESP-065 |
| `positionSelPop()` src/app.js:845 | RESP-052, RESP-054, RESP-055, RESP-060 |
| `onTextSelect()` src/app.js:813 | RESP-051, RESP-056, RESP-057, RESP-059, RESP-061 |
| selection wiring src/app.js:3127-3150 | RESP-051, RESP-056, RESP-057, RESP-058, RESP-059, RESP-060 |
| `initCaptureMask()` src/app.js:917 | RESP-072, RESP-073, RESP-077, RESP-095 |
| `captureRegion()` src/app.js:1047 | RESP-085, RESP-095 |
| `selectAnnotation()` src/app.js:1208 | RESP-076, RESP-083 |
| `createFromSelection()` src/app.js:884 | RESP-058, RESP-084 |
| `focusThreadCompose()` src/app.js:1616 | RESP-083, RESP-084, RESP-085 |
| `drawPins()` src/app.js:1116 | RESP-076 |
| `restackBanners()` src/app.js:737 | RESP-098, RESP-099 |
| `openPopover()` src/app.js:2231 | RESP-100 |
| `maybeShowSaveAsTip()` src/app.js:2460 | RESP-102 |
| `boot()` narrow-first-run src/app.js:3309 | RESP-012, RESP-013, RESP-014 |
| `wire()` toggles + scrim src/app.js:3060-3064 | RESP-003, RESP-015, RESP-016, RESP-018, RESP-022 |
| `wire()` resize listener src/app.js:3176 | RESP-011, RESP-050, RESP-096 |
| `applyReadOnly()` src/app.js:3294 | RESP-105 |

---

## Deliberately not covered here

- **Landing page and features page responsive rules** (`index.html:188-208`, `features.html:37,92,93,111`) - the `900px` / `640px` / `560px` breakpoints on the marketing pages, the icon-only GitHub button that replaces the hidden ghost button, and `prefers-reduced-motion` are covered in `01-landing-page.md` and `02-features-page.md`.
- **What the panel toggles, library, tools and notes panel actually *do*** - drawer mechanics only are tested here. Library navigation is `03-app-shell-and-library.md`; tool behaviour is `06-annotation-tools.md`; note cards, filters, sort and the composer are `07-notes-panel.md`.
- **Zoom, page navigation and continuous vs single-page correctness** - covered in `05-reader-and-navigation.md`. Only their layout and touch-input behaviour appears here.
- **Highlight anchoring accuracy, quote resolution and screenshot fidelity** - `06-annotation-tools.md`. This document only proves the *gestures* reach those code paths.
- **Keyboard navigation, focus order, focus visibility, ARIA and screen readers** - `15-accessibility.md`. Note that RESP-079 and RESP-083 are about *iOS auto-zoom and the on-screen keyboard*, not about focus management as an a11y concern.
- **Engine-level differences between Chrome, Firefox and Safari** (including `:has()` support, `showSaveFilePicker` availability and `dvh` support) - `16-cross-browser-and-platform.md`. Platform-tagged checks here assume the engine works and test the layout.
- **Render performance, memory, and very large PDFs** - `17-performance-and-limits.md`. RESP-059 and RESP-067 touch on jank only as a symptom of a specific handler bug.
- **Export content, PDF fidelity and the share round-trip** - `11-share-and-export.md`. RESP-103, RESP-104 and RESP-105 test only the *layout* of those surfaces at narrow widths.
- **OCR detection and the OCR run itself** - `09-ocr.md`. RESP-098 uses the OCR banner only as a second stacked banner.
