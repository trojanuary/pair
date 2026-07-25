# 15 — Accessibility & keyboard operation

> Whether every surface of PairedX can be driven from the keyboard alone, exposes itself correctly to assistive technology, survives 200% zoom and forced colours, and never signals state with colour alone.

| | |
|---|---|
| **ID prefix** | A11Y |
| **Scope** | Keyboard operability, focus management, focus visibility, semantics and accessible names, live regions, colour and contrast, motion, zoom and text scaling — across `index.html`, `features.html` and the whole app. |
| **Primary code** | `app.html` (full file), `src/styles.css`, `src/app.js:2084 render()`, `src/app.js:2176 confirmDialog()`, `src/app.js:2231 openPopover()`, `src/app.js:2460 maybeShowSaveAsTip()`, `src/app.js:2760 openSettings()`, `src/app.js:2846 openExport()`, `src/app.js:2937 openFind()`, `src/app.js:3058 wire()`, `index.html:204-209`, `index.html:381-402` |
| **Checks** | 107 |

**How to run this document.** You need three modes of operation, and most checks require more than one:

1. **Keyboard only** — unplug or ignore the mouse. On macOS you must first enable *System Settings → Keyboard → Keyboard navigation* or `Tab` will skip buttons and links in Safari and Chrome. Verify this before reporting a "Tab does nothing" bug.
2. **A screen reader** — VoiceOver (macOS/iOS, `Cmd+F5`), NVDA (Windows), or TalkBack (Android). Any one is enough for a run; use two for a full regression.
3. **Zoom / forced colours** — browser zoom to 200% and 400%, plus Windows High Contrast (forced-colors) or macOS *Increase contrast*.

> **Terminology.** "Reachable" means `Tab`/`Shift+Tab` can land on it. "Operable" means `Enter` or `Space` then activates it. A control can be reachable but not operable, and both must be checked.

> **Known architectural facts** (do not re-discover them every run — verify they have not got *worse*): several controls are clickable `<div>`/`<span>` elements rather than `<button>` (`.nav-item`, `.tree-row`, `.sw`, `.ex-chk`, `.popover .row`, `#mClose`, `#capCancel`, `.addtag`, `.tag .rm`, `#exBack`, `.pin`, `.hl-rect`), most icon-only buttons carry only a `title` attribute as their accessible name, and `src/styles.css` contains **no `:focus-visible` rule and no `prefers-reduced-motion` block** (`index.html` does — `index.html:204`).

## Contents
- [1. Landing page keyboard and semantics](#1-landing-page-keyboard-and-semantics) - 8 checks
- [2. Features page keyboard and semantics](#2-features-page-keyboard-and-semantics) - 6 checks
- [3. App shell landmarks, headings and tab order](#3-app-shell-landmarks-headings-and-tab-order) - 8 checks
- [4. Library sidebar keyboard operation](#4-library-sidebar-keyboard-operation) - 7 checks
- [5. Reader toolbar and page keyboard operation](#5-reader-toolbar-and-page-keyboard-operation) - 9 checks
- [6. Find bar keyboard operation](#6-find-bar-keyboard-operation) - 7 checks
- [7. Notes panel and composer keyboard operation](#7-notes-panel-and-composer-keyboard-operation) - 11 checks
- [8. Modals, dialogs, popovers and overlays](#8-modals-dialogs-popovers-and-overlays) - 11 checks
- [9. Focus visibility and focus preservation](#9-focus-visibility-and-focus-preservation) - 8 checks
- [10. Accessible names and assistive technology semantics](#10-accessible-names-and-assistive-technology-semantics) - 10 checks
- [11. Live regions and status announcements](#11-live-regions-and-status-announcements) - 5 checks
- [12. Colour, contrast and non colour signals](#12-colour-contrast-and-non-colour-signals) - 9 checks
- [13. Motion, zoom and target size](#13-motion-zoom-and-target-size) - 8 checks

---

## 1. Landing page keyboard and semantics

### A11Y-001 - Tab through the entire landing page without a mouse
**P0** * A11y * `index.html:215-379`

- **Pre:** `https://pairedx.com/` (or `index.html` locally) at 1440×900. macOS: full keyboard navigation enabled.
- **Steps:**
  1. Click once on the page background, then press `Tab` repeatedly to the end of the document.
  2. Write down every stop in order.
- **Expect:** the order is: brand link "PairedX" → "Features" → "Docs" → "GitHub" → "Privacy" → "Clone from GitHub" → "Enter" → the "See it in action" scroll hint → "Try it live →" → "Open Settings" → "Open Templates" → the comparison table's scroll container (if focusable) → "Enter" → "Clone from GitHub" → footer brand → "AGPL-3.0" → footer "Features"/"Docs"/"GitHub"/"Privacy" → the GitHub and X social links. Every stop is visible on screen when focused, and DOM order matches visual order.
- **Watch:** the `[data-reveal]` opacity animation (`index.html:185`) — if the safety-net `setTimeout(revealAll, 2200)` at `index.html:399` regresses, `Tab` can land on a link that is still `opacity:0` and invisible.

### A11Y-002 - Every landing-page button shows a focus ring
**P1** * Visual * `index.html:48`

- **Pre:** landing page, keyboard only.
- **Steps:**
  1. `Tab` onto "Enter", then "Clone from GitHub", then "Open Settings", then "Open the app"-style `.btn.lg` links.
  2. Then `Tab` onto the plain text links: "Features", "Docs", "Privacy", the footer links and the two social icon links.
- **Expect:** `.btn` elements draw the explicit ring from `index.html:48` — `outline:2px solid var(--blue); outline-offset:2px`. The plain links draw the browser default ring. In all cases a ring is clearly visible against the `#F7F3EA` paper background.
- **Watch:** a restyle that adds `outline:none` to `a` or `.btn` without a replacement. Also check the sticky header (`index.html:39`) does not clip the ring of a focused nav link.

### A11Y-003 - Landing page heading order is h1 then h2 with no skips
**P1** * A11y * `index.html:237, 264, 298, 312, 323, 336, 350`

- **Pre:** landing page. Use a screen reader's heading list (VoiceOver `Ctrl+Opt+U` → Headings, NVDA `H`).
- **Steps:**
  1. List all headings on the page.
- **Expect:** exactly one `h1` — "Active Learning with AI" — followed by `h2`s: "Source-linked. Private. Yours.", "Open Settings. Control everything.", "Tune every prompt.", "Even scans become real text.", "The combination is the point.", "Active learning in the age of AI."; then the six card `h3`s ("Pinned to the source", "Nothing leaves your machine", "Bring your own model", "See the agent's work", "Notes are a file you own", "Open-source & self-hostable"). No level is skipped and no `.eyebrow` div ("Your Paired Reading Partner", "What makes it different", "Deep control", "Editable prompts", "New · Scanned PDFs", "Why not just use…?") is announced as a heading.
- **Watch:** `.eyebrow` is a `<div>` by design; if someone "fixes" it into an `<h3>` the outline breaks. Also the `<span class="mark">` + inline `<svg class="uline">` inside headings must not leak the SVG into the announced heading text.

### A11Y-004 - Every meaningful landing image has alt text and every decorative SVG is hidden
**P0** * A11y * `index.html:245, 303, 309, 326`

- **Pre:** landing page + screen reader.
- **Steps:**
  1. Navigate the page by images (VoiceOver rotor → Images) and read each announcement.
  2. Then walk the whole page linearly and listen for stray "image" / path-data announcements.
- **Expect:** four images, each with a real description: the hero — "A reader sketching notes beside an open book, with a path leading to a glowing “AI” page"; the settings shot — "PairedX settings — model picker, editable prompts, and toggles for web search, diagrams, and illustration"; "Settings → Templates: every system prompt and the agent's tool descriptions are editable, with Export / Import / Reset"; "PairedX detecting a scanned PDF and offering one-tap on-device OCR". Every inline decorative `<svg>` (logo, hero row icons, chip icons, underline squiggles, the doodle, the sparkle) carries `aria-hidden="true"` and is silent.
- **Watch:** the hero and settings images are enormous inline base64 `data:` URIs — an editor replacing the asset commonly loses the trailing `alt=` because it sits ~50 000 characters into the line.

### A11Y-005 - The product reel video is keyboard operable and labelled
**P1** * A11y * `index.html:256`

- **Pre:** landing page, keyboard only.
- **Steps:**
  1. `Tab` to the `<video class="reelvid">` element.
  2. Press `Space`, then `k`, then arrow keys.
  3. With a screen reader on, listen to how the element is announced.
- **Expect:** the video is reachable, `Space` plays/pauses, and it is announced with its label "PairedX product walkthrough". It does **not** autoplay and it is not `muted`+`autoplay` looping motion in the background.
- **Watch:** `loop` is set on the element; if `autoplay` is ever added, the page gains unstoppable motion and needs a pause control (WCAG 2.2.2). Also note there is **no `<track>`** — if the reel ever gains narration it needs captions; file that as P1 rather than silently passing.

### A11Y-006 - "See it in action" — the accessible name contains the visible label
**P2** * Copy * `index.html:253`

- **Pre:** landing page + screen reader, and (ideally) voice control (macOS *Voice Control* or Windows *Speech Recognition*).
- **Steps:**
  1. Focus the scroll hint and read its accessible name.
  2. With voice control, say "click See it in action".
- **Expect:** the link's visible text is "See it in action" while its `aria-label` is "Scroll to see the live demo". The visible string **must** be contained in the accessible name (WCAG 2.5.3 Label in Name) — as written it is not, so voice activation by the visible label fails. Report this as a P2 defect unless the `aria-label` has been changed to include the visible text.
- **Watch:** the same pattern is used for the icon-only GitHub link (`aria-label="GitHub"`, `index.html:226`) — that one is fine because it has no visible text.

### A11Y-007 - The comparison table is navigable and its row labels are real headers
**P1** * A11y * `index.html:339-342`

- **Pre:** landing page + screen reader, scrolled to "The combination is the point."
- **Steps:**
  1. Enter the table with the screen reader's table navigation and move cell by cell across a data row.
  2. Listen to what is announced for the `✓`, `—` and `~` cells.
- **Expect:** the column header ("PairedX", "NotebookLM", "ChatPDF", "Beaver", "Readwise") is announced for each cell. The row label ("Notes pin to an exact spot in the PDF", …) should also be announced — it is currently a `<td class="rowlab">`, **not** `<th scope="row">`, so it will not be. Record that as a defect. The status glyphs must convey meaning to AT: they carry `title="Yes"` / `title="No"` on a `<span>`, which most screen readers ignore — verify whether "Yes"/"No" is actually spoken, and file it if only "✓" or "—" is read.
- **Watch:** `.cmp-scroll` is `overflow-x:auto` with `min-width:720px` on the table — at 200% zoom or on a phone the container must be reachable and scrollable by keyboard (`Tab` into it, then arrow keys), otherwise the right-hand columns are unreachable without a mouse.

### A11Y-008 - Mobile header still exposes the nav destinations
**P1** * A11y * `index.html:195, 200-201`

- **Pre:** landing page at 390×844 (or browser width < 560px).
- **Steps:**
  1. `Tab` from the top of the page and list the header stops.
  2. Look for a way to reach "Features", "Docs" and "Privacy" from the header.
- **Expect:** at ≤900px `.nlinks` is `display:none` and at ≤560px `.nav-cta .ghost` is hidden too, leaving only the icon GitHub link (accessible name "GitHub") and "Enter". There is no hamburger menu — so "Features"/"Docs"/"Privacy" must still be reachable from the footer nav further down the page, and the footer must not also be hidden at this width.
- **Watch:** a hidden-by-`display:none` link is correctly removed from the tab order; the failure mode to look for is a future menu that hides links with `opacity:0` or `visibility` tricks, leaving invisible tab stops.

---

## 2. Features page keyboard and semantics

### A11Y-009 - Tab through the features page including the section jump bar
**P1** * A11y * `features.html:116-131`

- **Pre:** `/features.html` at 1440×900, keyboard only.
- **Steps:**
  1. `Tab` from the top: brand → "Home" → "GitHub" → "Open app" → each of the nine `.tocbar` pills.
  2. Press `Enter` on "Agent".
- **Expect:** every pill is reachable in written order — "Annotate", "Source-linked", "Ask AI", "Agent", "Notes", "Library", "Share & export", "Your model", "Everything else" — and `Enter` scrolls to `#agent` ("Watch every step it took."). After the jump, the next `Tab` continues from the target section, not from the top of the document.
- **Watch:** `header{position:sticky;top:0;height:68px}` (`features.html:28-30`) has no `scroll-margin-top` on the targets, so the jumped-to heading can land **underneath** the sticky header — the content is technically focused but visually hidden.

### A11Y-010 - Features page heading order
**P1** * A11y * `features.html:127, 155-264, 269`

- **Pre:** features page + screen reader heading list.
- **Steps:**
  1. List all headings.
- **Expect:** one `h1` — "The whole feature set, at a glance." — then `h2`s for each row/band ("Highlight text or box a figure.", "Scanned? It reads the page for you — on your device.", "Every note ties back to its exact spot.", "Answers pinned to the source.", "Watch every step it took.", "Capture a figure — or generate one.", "Show what matters on the card.", "A real multi-document library.", "Send a whole annotated paper.", "Your model, your key.", "Tune every prompt.", "Notes you own, on your machine.", "And everything else", "Try it — no signup, no install.") and the twelve category `h3`s ("Reading", "Annotating", "AI & agent", "Notes", "Notes panel", "Library", "Open & attach", "Share & export", "Model & prompts", "Storage & privacy", "Your identity", "Open & free"). No skipped levels; `.eyebrow` divs are not headings.
- **Watch:** the `.cat` blocks live inside a CSS `columns:3` container (`features.html:91`) — the heading list must still read in source order, not visual column order.

### A11Y-011 - Every features-page screenshot has descriptive alt text
**P0** * A11y * `features.html:134, 159-263`

- **Pre:** features page + screen reader (or DevTools: `$$('img').filter(i=>!i.alt)`).
- **Steps:**
  1. Enumerate every `<img>` and read its `alt`.
- **Expect:** thirteen images, none with an empty or missing `alt`. Spot-check the exact strings: "The PairedX workspace", "The reader toolbar: select, highlight, comment, screenshot tools", "A connector line joining a note to its highlighted passage on the page", "An AI answer with rendered content and a provenance panel", "The agent trace showing each tool call the AI made", "A note built from a captured figure, with an AI answer about it", "A collapsed card showing the full AI answer, tagged AI", "The library sidebar with documents and star/trash actions", "The Export annotations screen with include options and a live preview", "Settings — AI & Tools: providers, models, and keys", "Settings — Templates: editable system prompts and tool descriptions", "Settings — Storage: browser-only notes with optional folder sync".
- **Watch:** the hero `alt="The PairedX workspace"` is thin for an image carrying five numbered callouts — verify the `.legend` text below it (`features.html:141-147`) is real text in the DOM, since it is what actually explains dots 1–5.

### A11Y-012 - The numbered callout dots do not create nonsense screen-reader output
**P2** * A11y * `features.html:135-147`

- **Pre:** features page + screen reader, on the hero image.
- **Steps:**
  1. Read linearly through the `.annot` block and into the `.legend` block.
- **Expect:** the five `.dot` divs read as "1 2 3 4 5" (or are hidden), immediately followed by the legend entries "1 Library — your documents", "2 Tools — highlight, comment, screenshot", "3 The paper, with highlights & numbered pins", "4 Source-linked notes & AI answers", "5 Ask about the whole document". A bare run of digits with no following explanation is a fail.
- **Watch:** the dots are positioned with percentage `left`/`top` inline styles over the image; at 200% zoom or narrow widths they can drift off the image entirely — they should still read in the same order.

### A11Y-013 - Features page respects reduced motion
**P2** * A11y * `features.html:20, 28`

- **Pre:** OS reduced-motion enabled (macOS *Reduce motion*, Windows *Show animations* off, or DevTools → Rendering → *Emulate prefers-reduced-motion*).
- **Steps:**
  1. Reload `/features.html`.
  2. Click a `.tocbar` pill, e.g. "Share & export".
  3. Scroll the page from the top past 4px.
- **Expect:** with reduced motion on, the anchor jump should be instant, not a smooth scroll. `features.html:20` sets `html{scroll-behavior:smooth}` and — unlike `index.html:204-209` — the page has **no** `@media (prefers-reduced-motion:reduce)` block, so the smooth scroll will still animate. Record it as a P2 defect. The only other transition, the header border fade (`transition:border-color .3s`), is acceptable.
- **Watch:** do not confuse this with `index.html`, which does handle it correctly in both CSS (`index.html:205`) and JS (`index.html:387-389`).

### A11Y-014 - Features page has a main landmark and skip affordance
**P2** * A11y * `features.html:114-376`

- **Pre:** features page + screen reader landmark list (VoiceOver rotor → Landmarks).
- **Steps:**
  1. List landmarks.
  2. From the very top of the page, press `Tab` once.
- **Expect:** the page should expose `banner` (header), `main`, `contentinfo` (footer) and `navigation`. It currently has **no `<main>`** (`index.html` does, at `index.html:232`) and no "skip to content" link, so a screen-reader or keyboard user must traverse the header on every visit. Both are P2 defects; record them and confirm they have not regressed further (e.g. `<header>`/`<footer>` being replaced by `<div>`).
- **Watch:** `features.html:373` uses a bare `<footer>` with a nested `<nav>` — if the footer becomes a `<div>` the contentinfo landmark disappears silently.

---

## 3. App shell landmarks, headings and tab order

### A11Y-015 - The app has no skip link and no main landmark
**P1** * A11y * `app.html:13-116`

- **Pre:** `/app.html` with the bundled sample loaded, 1440×900, screen reader on.
- **Steps:**
  1. Load the app and press `Tab` once from the address bar.
  2. List landmarks with the screen reader.
- **Expect:** landmarks present are `complementary` (`<aside id="sidebar">`), `navigation` (`<nav class="nav">`), a generic `<section id="reader">` with no accessible name (so **not** exposed as a region), and a second unnamed `complementary` (`<aside id="notes">`). There is **no `<main>`** and no skip link, so the first `Tab` lands on the sidebar's "Collapse" button and reaching the reader requires ~15 tab stops. Record as a defect; the pass condition for this run is only that it has not become worse.
- **Watch:** two unnamed `complementary` landmarks are indistinguishable in a landmark list. If `aria-label`s are added, verify they say something useful ("Library", "Notes") and match the visible headings.

### A11Y-016 - Heading structure inside the app
**P1** * A11y * `app.html:90`, `src/app.js:2763, 2853, 3190`

- **Pre:** app loaded with the sample.
- **Steps:**
  1. List headings on the default view.
  2. Open Settings (gear) and list again.
  3. Close Settings, open the annotations export (the PDF icon in the notes header) and list again.
- **Expect:** the default view exposes exactly one heading — `h2` "Notes" — with no `h1` anywhere. Settings adds `h3` "Settings". The export view adds `h1` "Export annotations". Record the missing top-level `h1` on the main app view as a defect, and confirm the export view's `h1` does not appear while the export overlay is hidden.
- **Watch:** AI answers render markdown headings as `h4`/`h5`/`h6` (`src/app.js:1989`), so an answer beginning with `# Something` injects an `h4` under the `h2` — acceptable, but a regression that emits `h1`/`h2` there would wreck the document outline.

### A11Y-017 - Full tab order of the three-pane layout
**P0** * A11y * `app.html:13-116`

- **Pre:** app at 1440×900, both panels open, sample document loaded with its seeded notes, no modal open.
- **Steps:**
  1. Click the page background, then `Tab` through the whole app and record every stop.
  2. `Shift+Tab` all the way back.
- **Expect:** order is sidebar ("Collapse", "Open PDF or bundle", "Share as HTML", then the per-document star and trash buttons for each library row, then "Settings"), then the reader toolbar (page ‹, the page-number input, page ›, zoom −, zoom +, the four tools, "Continuous scroll", "Search in document"), then the notes header ("Filter & options", the injected Save/Import/Export-PDF buttons, "Search notes", "Delete all notes for this document", "Collapse"), then note-card buttons, then the sort button, then the composer textarea and its send button. `Shift+Tab` reverses exactly. Focus never leaves the viewport.
- **Watch:** the four `.nav-item` divs (Home / Recents / Starred / Trash) and every `.tree-row` document row are **not** in this list — they are `<div>`s with click handlers (`app.html:26-29`, `src/app.js:384`). Confirm they are still absent rather than newly present-but-inert, and see A11Y-023.

### A11Y-018 - Controls inside a collapsed panel are removed from the tab order
**P1** * A11y * `src/styles.css:30-31, 461-463`

- **Pre:** app at 1440×900, both panels open.
- **Steps:**
  1. Press the sidebar "Collapse" button (`«`).
  2. `Tab` from the top of the page and record the first ten stops.
  3. Repeat with the notes panel collapsed (`»`).
- **Expect:** with `#app.collapse-left` applied, `--left-w:0px` and `#sidebar{overflow:clip}` — the sidebar's buttons are clipped to zero width but **still focusable**. Verify whether `Tab` lands on invisible controls ("Open PDF or bundle", "Share as HTML", "Settings"). If it does, that is a defect: focus disappears off-screen with no visible ring. The reopen affordance `#btnToggleLeft` (`title="Show library"`) must appear and be reachable.
- **Watch:** at ≤820px the same panels become `position:fixed` drawers translated off-screen (`src/styles.css:548-553`) — the identical problem, tested separately in A11Y-019.

### A11Y-019 - Closed drawers do not swallow focus at phone width
**P0** * A11y * `src/styles.css:544-557`

- **Pre:** viewport 390×844 (or DevTools device emulation), fresh state so `boot()` collapses both drawers (`src/app.js:3309-3313`).
- **Steps:**
  1. Confirm both drawers are closed (only the reader is visible, tools bar floating at the bottom).
  2. `Tab` from the top of the page ten times, watching the screen after each press.
- **Expect:** every focus stop is a control that is visible on screen. Because closed drawers are only `transform:translateX(-100%)` — not `display:none` and not `inert` — `Tab` is very likely to move focus into the off-screen sidebar ("Open PDF or bundle", …) and then the off-screen notes panel, with nothing visible. That is a P0 keyboard trap-equivalent: the user is typing into a panel they cannot see.
- **Watch:** the same applies with a drawer *open* — the reader behind it is not inert, so `Tab` can leave the open drawer and land under the `#scrim` (`src/styles.css:555`), which is itself a click-only `<div>` with no keyboard equivalent.

### A11Y-020 - The scrim can be dismissed without a mouse
**P1** * A11y * `app.html:115`, `src/app.js:3064`

- **Pre:** viewport 390×844, the notes drawer open over the reader.
- **Steps:**
  1. Press `Escape`.
  2. `Tab` around looking for a control that closes the drawer.
- **Expect:** `Escape` currently does nothing (there is no global escape handler), so the only keyboard route out is the drawer's own "Collapse" (`»`) button — verify it is reachable and closes the drawer. `#scrim` has an `onclick` but no `tabindex` and no key handler, so it is mouse/touch only. Record the missing `Escape` as a defect.
- **Watch:** `setPanel()` (`src/app.js:1150`) does not move focus when it closes a drawer — after collapsing, check where focus goes; if the collapsed drawer keeps focus, the next `Tab` restarts from an invisible element.

### A11Y-021 - Read-only shared file: hidden controls leave the tab order
**P1** * A11y * `src/app.js:3294 applyReadOnly()`

- **Pre:** export a shared file with "Share as HTML", then open the resulting `<name>.annotated.html` directly from disk.
- **Steps:**
  1. `Tab` through the whole read-only viewer and record every stop.
  2. Read the bottom banner with a screen reader.
- **Expect:** none of `newBtn`, `fileInput`, `toolHi`, `toolComment`, `toolShot`, `composer`, `btnSaveNotes`, `btnImportNotes`, `btnClearNotes`, `btnShareHtml`, `btnSettings` is focusable — `applyReadOnly()` sets `style.display='none'`, which removes them from the tab order. The banner "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX" is present and its "pairedx.com" link is reachable and announced as a link.
- **Watch:** a future control hidden with `visibility:hidden` or `opacity:0` instead of `display:none` would stay focusable — a reader tabbing into a dead "Delete all notes" button in a read-only file.

### A11Y-022 - Page zoom does not create a horizontal scroll trap in the shell
**P1** * A11y * `src/styles.css:18, 27-29`

- **Pre:** app at 1280×800 with the sample loaded.
- **Steps:**
  1. Set browser zoom to 200% (`Cmd/Ctrl` `+`), then 400%.
  2. `Tab` through the toolbar and the notes header at each level.
- **Expect:** at 200% (effective 640px) the layout switches to drawer mode; the toolbar scrolls horizontally inside `.rd-mid` (`src/styles.css:570`) and every toolbar control can still be reached by `Tab` — the browser must scroll the strip to bring a focused control into view. `html,body{overflow:clip}` must not cause a focused control to sit permanently off-screen with no way to scroll to it.
- **Watch:** `overflow:clip` (unlike `hidden`) does not create a scroll container, so a focused element outside the box **cannot** be scrolled into view. If a control is unreachable at 400% that is a P1 fail.

---

## 4. Library sidebar keyboard operation

### A11Y-023 - Library views (Home / Recents / Starred / Trash) are not keyboard operable
**P0** * A11y * `app.html:26-29`, `src/app.js:3085`

- **Pre:** app loaded, sidebar open.
- **Steps:**
  1. `Tab` through the sidebar and try to reach "Home", "Recents", "Starred" and "Trash".
  2. If you can reach one, press `Enter` then `Space`.
- **Expect:** these are `<div class="nav-item" data-view="…">` elements with a click handler and no `tabindex`, `role` or key handler — so a keyboard-only user **cannot switch library views at all**, and therefore cannot reach Trash to restore a document. This is the single most severe keyboard gap in the app. Confirm it and file it as P0 unless it has been fixed to `<button>`.
- **Watch:** if someone adds `tabindex="0"` alone, `Enter`/`Space` still will not fire the click on a `div` — verify actual activation, not just reachability.

### A11Y-024 - Documents cannot be opened from the keyboard
**P0** * A11y * `src/app.js:384-390 renderTree()`

- **Pre:** library containing at least two documents (open a second PDF alongside the sample).
- **Steps:**
  1. `Tab` into the library list.
  2. Try to switch to the second document without a mouse.
- **Expect:** `.tree-row.doc-row` is a `<div>` whose click handler calls `switchDoc()`. Tab stops exist only for the nested `<button class="doc-act">` star/trash actions, so a keyboard user can star and trash a document but **cannot open one**. Confirm and file as P0.
- **Watch:** the row's `title` attribute holds the full document name (`title="${esc(d.name)}"`) — it is the only place a truncated name is exposed, and a `div` title is not read on focus, only on hover.

### A11Y-025 - Star / trash buttons are focusable but invisible until hover
**P1** * Visual * `src/styles.css:74-79`

- **Pre:** library with the sample document, mouse pointer parked far away from the sidebar.
- **Steps:**
  1. `Tab` until focus enters the document row's action buttons.
  2. Look at the row without moving the mouse.
- **Expect:** `.doc-act{opacity:0}` and only `.doc-row:hover .doc-act{opacity:1}` — so a keyboard-focused star or trash button is **fully transparent**. The focus ring may still paint (rings are not affected by opacity in all engines, so verify per browser), but the icon itself is invisible. A user cannot tell which control they are on. File as P1.
- **Watch:** a starred document's star is `opacity:1` (`.doc-act.star.on`), so this bug hides only the *unstarred* star and the trash — making "delete" the invisible one.

### A11Y-026 - Activating star and trash from the keyboard
**P1** * Functional * `src/app.js:391-394`

- **Pre:** library with the sample document, notes present.
- **Steps:**
  1. `Tab` to the star button of a document row and press `Enter`, then `Space`.
  2. `Tab` to the trash button and press `Enter`.
  3. In the confirm that appears for a permanent delete (Trash view), press `Escape`.
- **Expect:** `Enter` and `Space` both fire (these are real `<button>`s). Starring flips the `title` between "Star" and "Unstar" and re-renders. Trashing shows the toast "Moved “<name>” to Trash." Because `renderTree()` rebuilds the whole list, note where focus lands afterwards — it will be `<body>`, which is a defect to record (see A11Y-072).
- **Watch:** `e.stopPropagation()` on these handlers means the row's own click never fires; if that is lost, keyboard activation would also switch documents as a side effect.

### A11Y-027 - Opening a PDF entirely from the keyboard
**P0** * Functional * `app.html:21-22`, `src/app.js:3066-3068`

- **Pre:** app loaded; a small text PDF available on disk.
- **Steps:**
  1. `Tab` to "Open PDF or bundle" and press `Enter`.
  2. In the OS file dialog, select the PDF with the keyboard and confirm.
  3. Press `Escape` in the file dialog on a second attempt.
- **Expect:** `Enter` triggers `#fileInput.click()` and the native picker opens (the hidden `<input type="file" class="hidden">` is itself `display:none` and never a tab stop). The PDF opens and the toast "Opened <name> — highlight text or capture a figure to start." appears. A cancelled dialog changes nothing and does not leave focus stranded.
- **Watch:** on Safari and Firefox, a programmatic `.click()` on a hidden file input triggered from a keyboard-activated button must still count as a user gesture. If the picker silently does not open, that is a P0.

### A11Y-028 - The storage meter is announced meaningfully
**P2** * A11y * `app.html:36-40`, `src/app.js:396 updateStorage()`

- **Pre:** app loaded, sidebar open, screen reader on.
- **Steps:**
  1. Navigate to the bottom of the sidebar and read the storage block.
- **Expect:** the label "Storage", then the usage text — "Calculating…" initially, then something like "12 MB of 2.1 GB" (or "3 documents" where `navigator.storage.estimate` is unavailable). The `.bar > i` progress fill is a decorative `<i>` with a percentage width and no `role="progressbar"` / `aria-valuenow` — confirm the numeric text alone carries the information, so the missing progressbar semantics is only P2.
- **Watch:** the "Settings" gear sits inside this block (`app.html:37`) — make sure it is still reachable after the storage text wraps at 200% zoom.

### A11Y-029 - The panel resize grip has no keyboard equivalent
**P2** * A11y * `src/app.js:3221 initPanelResize()`, `src/styles.css:614-618`

- **Pre:** app at 1440×900, notes panel open.
- **Steps:**
  1. `Tab` around the left edge of the notes panel looking for the resizer.
  2. If focusable, try arrow keys.
- **Expect:** `#rightResizer` is a `<div class="col-resizer">` with `mousedown`/`touchstart` handlers and `title="Drag to resize · double-click to reset"`. It is not focusable and has no keyboard path — the panel width can only be changed with a pointer. Record as a P2 (the default width is usable, and the feature is an enhancement). Confirm it is `display:none` at ≤820px so it never becomes a phantom tab stop.
- **Watch:** if a `tabindex` is added, it also needs arrow-key resizing and a reset key, plus `role="separator"` with `aria-valuenow` — a bare tabindex would make things worse.

---

## 5. Reader toolbar and page keyboard operation

### A11Y-030 - Page navigation buttons are reachable but poorly named
**P1** * A11y * `app.html:50, 53`, `src/app.js:3087-3088`

- **Pre:** sample document open on page 1, screen reader on.
- **Steps:**
  1. `Tab` to the previous-page and next-page buttons and listen to the announcement.
  2. Press `Enter` on next, then `Shift+Tab` back and `Enter` on previous.
- **Expect:** both buttons activate and the page changes (the page input updates and the canvas re-renders). Their accessible names come only from their text content — "‹" and "›" — with **no `title` and no `aria-label`**, so a screen reader announces punctuation or nothing. File as P1.
- **Watch:** contrast with the tool buttons, which do have `title`s. Any "cleanup" that strips those `title`s makes the whole toolbar anonymous — this is exactly what `20-new-feature-gate.md` §3 warns about.

### A11Y-031 - The page-number input is unlabelled but keyboard-committable
**P1** * A11y * `app.html:51`, `src/app.js:3089-3092`

- **Pre:** a document with at least 10 pages open, screen reader on.
- **Steps:**
  1. `Tab` to the page input and listen to how it is announced.
  2. Type `7` and press `Enter`.
  3. `Tab` back into it, type `999`, press `Enter`.
  4. `Tab` back in, clear it, press `Enter`.
  5. `Tab` back in, type `abc`, press `Enter`.
- **Expect:** `Enter` commits and blurs the field (`commitPage` + `e.target.blur()`); page 7 renders; `999` clamps to the last page; empty and `abc` restore the current page number. The field's accessible name is missing entirely — it has no `<label>`, `aria-label`, `title` or even `type` — so it announces as an unlabelled edit field with the value only. File as P1. The adjacent "/ 16" (`#pageTotal`) is separate text and is not associated with it.
- **Watch:** focusing the field auto-selects its contents (`onfocus → select()`), so a screen-reader user tabbing through hears the value as selected text — confirm typing replaces rather than appends. Also confirm `Enter` does not trigger anything else (there is no form).

### A11Y-032 - Zoom buttons are reachable and their readout updates
**P1** * A11y * `app.html:56-58`, `src/app.js:3095-3096`

- **Pre:** document open at the default 115%.
- **Steps:**
  1. `Tab` to zoom out (`−`) and press `Enter` twice.
  2. `Tab` to zoom in (`+`) and press `Enter` four times.
  3. With a screen reader, read the value between the buttons.
- **Expect:** zoom steps by 0.15 and clamps between 50% and 300%; `#zoomVal` shows "85%", "100%", … Buttons have no `title`/`aria-label`, so their names are "−" and "+" — record as a defect. The readout is plain text and is **not** announced automatically when it changes; the user must navigate to it.
- **Watch:** at ≤560px `#zoomVal` is `display:none` (`src/styles.css:609-612`) — the zoom buttons then have no readout at all, keyboard or otherwise. Verify the buttons still work and that nothing announces a stale value.

### A11Y-033 - The four tools are reachable, operable and expose their state
**P1** * A11y * `app.html:61-64`, `src/app.js:906 setTool()`

- **Pre:** document open, "Select" is the active tool.
- **Steps:**
  1. `Tab` to each of the four tool buttons and listen: "Select", "Highlight", "Comment", "Screenshot region".
  2. Press `Enter` on "Highlight", then `Tab` back over all four listening for a pressed/selected state.
  3. Press `Enter` on "Screenshot region" and observe the reader.
- **Expect:** all four activate from the keyboard. `setTool()` only toggles the CSS classes `active` / `hl` / `shot`; there is **no `aria-pressed`**, so a screen reader cannot tell which tool is armed — the state is conveyed purely by background colour (`src/styles.css:105-107`). File as P1 (this is also the colour-only signal case in A11Y-093). Choosing "Screenshot region" shows the bar "Select area to capture" and the crosshair mask.
- **Watch:** at ≤820px the tools move to a floating bar at the bottom (`src/styles.css:579-582`) but keep their DOM position inside `.rd-mid` — so the tab order no longer matches the visual order. Note it.

### A11Y-034 - Screenshot capture cannot be started or cancelled by keyboard
**P1** * A11y * `app.html:78-83`, `src/app.js:917 initCaptureMask()`, `src/app.js:3101`

- **Pre:** document open, "Screenshot region" tool selected via keyboard.
- **Steps:**
  1. Press `Escape`.
  2. `Tab` and try to reach "Cancel" in the "Select area to capture" bar.
  3. Try to draw a capture box using only the keyboard.
- **Expect:** `Escape` does nothing (no handler). "Cancel" is a `<span class="x" id="capCancel">Cancel</span>` — not focusable, mouse only. The capture drag is `pointerdown`/`pointermove`/`pointerup` on `#captureMask`, so there is **no keyboard path to capture a region at all**, and the only escape is to `Tab` back to another tool button and press `Enter`. Confirm that escape route works; file the rest as P1.
- **Watch:** while `#captureMask` is displayed it covers the reader with `z-index:30` — verify it does not block `Tab` from leaving the reader area.

### A11Y-035 - Highlights and pins on the page are not keyboard reachable
**P1** * A11y * `src/app.js:1101 drawHighlights()`, `src/app.js:1116 drawPins()`

- **Pre:** sample document with its seeded notes; pins 1..N visible on the page.
- **Steps:**
  1. `Tab` through the reader area and try to land on a numbered pin or a highlight rectangle.
  2. If you cannot, try to reach the corresponding note some other way with the keyboard.
- **Expect:** `.pin` and `.hl-rect` are `<div>`s with `onclick` handlers and no `tabindex`/`role`, so the entire page→note navigation ("click pin 3 to open note 3") is mouse only. The note cards in the panel are also `<div>`s — the only keyboard route into a note is `Tab`ping to one of its buttons. Record the gap.
- **Watch:** `.pin.sel{outline:3px solid rgba(37,99,235,.25)}` looks like a focus ring but is a selection state — do not mistake it for keyboard focus during this check.

### A11Y-036 - Creating a highlight or note from the keyboard
**P0** * A11y * `src/app.js:813 onTextSelect()`, `src/app.js:3146`

- **Pre:** sample document, "Select" tool, caret browsing enabled if your browser offers it (Firefox `F7`).
- **Steps:**
  1. Without caret browsing: `Tab` into the reader and try to select text on the page using `Shift`+arrow keys.
  2. With caret browsing on: place the caret in the page text layer, select a phrase with `Shift`+`→`, and wait ~400 ms.
  3. If the "Highlight · Note · ✦ Ask AI" popover appears, `Tab` to it and press `Enter` on "Note".
- **Expect:** `onTextSelect()` is driven by `selectionchange` (debounced 350 ms at `src/app.js:3146`) as well as `mouseup`, so a *keyboard-made* selection should surface `#selPop`. Verify that it does, that its three buttons — "Highlight", "Note", "✦ Ask AI" — are reachable (they are real `<button>`s at `app.html:120-122`), and that `Enter` on "Note" creates the note and moves focus into the note's reply box. Without caret browsing there is no way to select page text at all — record that as the underlying P0 limitation.
- **Watch:** `#selPop` lives at the very end of the DOM (`app.html:119`), so `Tab` from the reader will traverse the entire notes panel before reaching it. Also `document.addEventListener('scroll', …, true)` (`src/app.js:3150`) hides the popover on any scroll — a keyboard selection that scrolls the reader will dismiss it before you can tab to it.

### A11Y-037 - Continuous-scroll and search toggles announce their state
**P1** * A11y * `app.html:66-67`, `src/app.js:3093, 3123`

- **Pre:** document open, continuous mode on (the default).
- **Steps:**
  1. `Tab` to "Continuous scroll" and press `Enter`; press `Enter` again.
  2. `Tab` to "Search in document" and press `Enter`; press it again.
  3. Listen to each announcement with a screen reader.
- **Expect:** both toggle correctly. Both use `classList.toggle('active')` on `.icon-btn` (`src/styles.css:118`) with **no `aria-pressed`**, so the on/off state is announced identically in both positions — the only cue is a blue background. Record as P1. The search toggle at least has a visible consequence (the find bar appears).
- **Watch:** at ≤560px `#btnContinuous` is `display:none` — it leaves the tab order there, which is correct; verify the mode itself is unchanged.

### A11Y-038 - The PDF page text is exposed to assistive technology
**P1** * A11y * `src/app.js:456 renderPage()`, `src/styles.css:121-125`

- **Pre:** sample document open, screen reader on.
- **Steps:**
  1. Use the screen reader to read continuously through the reader area.
  2. Repeat in continuous mode with several pages rendered.
  3. Repeat on a scanned PDF **after** running OCR (`src/app.js:644 buildOcrTextLayer()`).
- **Expect:** the transparent `.textLayer` spans are real text and must be readable — the paper's abstract should be spoken. `#pageCanvas` is a bare `<canvas>` with no `role`/`aria-label`; confirm it is announced as nothing meaningful rather than as an unlabelled image. After OCR, the rebuilt word spans must read as spaced words, not a single run-on token.
- **Watch:** each OCR word span is `transform: scaleX(...)`-ed to its box (`src/app.js:659`); a regression that drops the appended trailing space makes the whole page read as one unbroken word.

---

## 6. Find bar keyboard operation

### A11Y-039 - Cmd/Ctrl+F opens the find bar and focuses it
**P0** * Functional * `src/app.js:3124`, `src/app.js:2937 openFind()`

- **Pre:** sample document loaded (`numPages > 0`), focus on the reader.
- **Steps:**
  1. Press `Cmd+F` (macOS) / `Ctrl+F` (Windows/Linux).
  2. Type `attention`.
  3. Press `Cmd/Ctrl+F` again while the bar is open.
- **Expect:** the browser's own find is suppressed (`e.preventDefault()`), the bar appears at the top-right of the reader, focus is in the input (placeholder "Find in document…"), and its contents are selected. Typing runs a debounced search after 160 ms and the count shows e.g. "1 / 12" (or "Searching…" then "No results"). A second `Cmd/Ctrl+F` re-opens/re-focuses and re-selects rather than closing.
- **Watch:** the shortcut is gated on `numPages > 0` — with an empty library (`showEmptyReader()`), `Cmd/Ctrl+F` must fall through to the **browser's** find, not silently do nothing.

### A11Y-040 - Cmd/Ctrl+F while typing steals focus out of a composer
**P1** * Edge * `src/app.js:3124`

- **Pre:** a note is open; the caret is in its "Reply or ask a follow-up…" box with unsent text typed.
- **Steps:**
  1. Press `Cmd/Ctrl+F`.
  2. Press `Escape`.
  3. Look at the reply box.
- **Expect:** the find bar opens and takes focus (the handler is a bare `document` keydown with no check for the active element). After `Escape` closes the find bar, focus is **not** returned to the reply box — verify the typed draft is still there (it should be; `render()` preserves it at `src/app.js:2154`) and record the lost focus as a defect.
- **Watch:** the same shortcut fires while the Settings modal or a confirm dialog is open, opening the find bar underneath the mask. Try it — a find bar rendered under a modal, with focus in it, is a P1.

### A11Y-041 - Enter and Shift+Enter step through matches
**P0** * Functional * `src/app.js:2928-2930`

- **Pre:** find bar open with a term that has ≥5 matches across ≥3 pages (e.g. "the" in the sample).
- **Steps:**
  1. Press `Enter` four times, watching the count and the page.
  2. Press `Shift+Enter` six times (past the first match).
- **Expect:** `Enter` advances (2/N, 3/N, …), `Shift+Enter` goes back and **wraps** from 1/N to N/N (`findGoto` uses `(idx + m.length) % m.length`). The current match is painted with `mark.sh.cur` and scrolled to the vertical centre. The reader navigates across pages as needed.
- **Watch:** `findGoto` calls `cur.scrollIntoView({block:'center'})` with no `behavior` — it must be instant, not smooth, or reduced-motion users get an animated jump per keystroke.

### A11Y-042 - Escape closes the find bar from the input, but not from the buttons
**P1** * A11y * `src/app.js:2930, 2944 closeFind()`

- **Pre:** find bar open with an active search.
- **Steps:**
  1. With focus in the input, press `Escape`.
  2. Re-open, then `Tab` to the "Next (Enter)" button and press `Escape`.
  3. Re-open, `Tab` to "Close (Esc)" and press `Enter`.
- **Expect:** step 1 closes the bar, clears the marks and un-highlights the "Search in document" toolbar button. Step 2 does **nothing** — the `keydown` handler is bound to `#findInput` only, so `Escape` on the nav buttons is dead despite the button being titled "Close (Esc)". File as P1. Step 3 works.
- **Watch:** `closeFind()` does not restore focus to `#btnSearch`; after `Escape` focus falls to `<body>` and the next `Tab` restarts at the top of the document. Record it.

### A11Y-043 - The focused find input has no visible focus indicator
**P1** * Visual * `src/styles.css:129-133`

- **Pre:** find bar open.
- **Steps:**
  1. `Tab` between the input and the three nav buttons and watch the bar.
- **Expect:** `#findInput{border:0;outline:none;…}` and `.find-bar` has **no `:focus-within` rule** (unlike `.nt-searchbar`, `src/styles.css:475`, and `.cbox`, `src/styles.css:349`). So the focused input shows only a text caret — no ring, no border change. A user who tabs away and back cannot tell whether they are in the field. File as P1. The three `.find-nav` buttons should still show the browser default ring.
- **Watch:** compare against the notes search bar, which does it correctly — the fix is a one-line `.find-bar:focus-within` rule.

### A11Y-044 - Find bar navigation buttons have usable names
**P2** * Copy * `src/app.js:2920-2922`

- **Pre:** find bar open, screen reader on.
- **Steps:**
  1. `Tab` across the three buttons and read each announcement.
- **Expect:** "Previous (Shift+Enter)", "Next (Enter)", "Close (Esc)" — the `title` attributes are the accessible names and, unusually for this app, they document the keyboard shortcut. Verify the strings match character for character.
- **Watch:** the buttons contain inline `<svg>` with no `aria-hidden` — confirm nothing extra (path data, `viewBox`) is announced alongside the title.

### A11Y-045 - Find results count is not announced as it changes
**P2** * A11y * `src/app.js:2987`

- **Pre:** find bar open, screen reader on.
- **Steps:**
  1. Type a term slowly and listen without moving focus.
  2. Press `Enter` several times and listen.
- **Expect:** `#findCount` is a plain `<span class="find-count">` with no `aria-live`, so "Searching…", "No results" and "3 / 12" are **never spoken** unless the user navigates to them — a screen-reader user gets no feedback that the search found anything. Record as P2 (the visual feedback is correct). Confirm the visual text itself is right.
- **Watch:** because the input keeps focus during search, an `aria-live="polite"` region here would be the correct fix; verify it has not been added as `assertive`, which would interrupt typing.

---

## 7. Notes panel and composer keyboard operation

### A11Y-046 - The document composer sends with Enter and newlines with Shift+Enter
**P0** * Functional * `app.html:106-112`, `src/app.js:3169`

- **Pre:** sample document open, notes panel open.
- **Steps:**
  1. `Tab` to the bottom composer textarea (placeholder "Ask about this document…").
  2. Type `line one`, press `Shift+Enter`, type `line two`.
  3. Press `Enter`.
  4. Focus it again, press `Enter` on an empty box.
  5. Focus it again, type only spaces, press `Enter`.
- **Expect:** `Shift+Enter` inserts a newline and grows the box (capped at 120px, `src/app.js:3170`); `Enter` submits and clears it, creating a document-level note. Empty and whitespace-only input do nothing (`if (!t) return`).
- **Watch:** `app.html:109` ships the placeholder "Select text or a figure to start a note…" but `wire()` overwrites it with "Ask about this document…" at `src/app.js:3165` — if the app fails to boot, the stale placeholder is a visible symptom, not a copy bug.

### A11Y-047 - The document composer's send button has no accessible name
**P1** * A11y * `app.html:110`

- **Pre:** notes panel open, screen reader on.
- **Steps:**
  1. `Tab` from the composer textarea onto the blue send button and listen.
  2. Compare with the in-card reply send button (`src/app.js:1925`).
- **Expect:** `#composerSend` is `<button class="send" id="composerSend">` containing only an inline `<svg>` — **no `title`, no `aria-label`, no text**. It announces as "button" with no name. The in-card `.tc-send` correctly carries `title="Send"`. File the missing name as P1.
- **Watch:** the button is reachable and `Enter` does send, so this fails only for screen reader and voice-control users — easy to miss in a purely keyboard run.

### A11Y-048 - The composer's mention overlay does not break selection or high contrast
**P1** * Visual * `src/styles.css:304-310`, `src/app.js:1601 attachMentions()`

- **Pre:** notes panel open.
- **Steps:**
  1. Type `explain @ai this` into the document composer.
  2. Select all of it with `Cmd/Ctrl+A` and look at the selection.
  3. Turn on forced colours (Windows High Contrast) or macOS *Increase contrast* and repeat.
- **Expect:** the visible text comes from the mirror `<div class="men-hl" aria-hidden="true">` while the real `<textarea>` is `color:transparent` with `-webkit-text-fill-color:transparent` and a visible caret. Selecting text must still show a readable selection, `@ai` must render blue and bold, and the caret must track the mirrored text exactly.
- **Watch:** in forced-colors mode the OS overrides `color` but **not** `-webkit-text-fill-color`, and it recolours the mirror div — the composer can end up with invisible or doubled text. This is the highest-risk forced-colors defect in the app.

### A11Y-049 - In-card reply composer: Enter sends, Shift+Enter newlines
**P0** * Functional * `src/app.js:2134`

- **Pre:** a note is expanded (click a card, or create one) so `.card.sel .thread-compose` exists.
- **Steps:**
  1. `Tab` into the "Reply or ask a follow-up…" textarea.
  2. Type `a`, `Shift+Enter`, `b`, then `Enter`.
  3. Type a new reply and press the "Send" button with `Enter` instead.
- **Expect:** identical behaviour to the document composer: newline vs submit, box auto-grows to 120px max, empty submits are ignored, and the reply appears in the thread. `submitToNote()` then re-focuses the reply box (`src/app.js:1630 → focusThreadCompose()`).
- **Watch:** the duplicate guard at `src/app.js:1626` swallows an identical comment posted within 5 s — a rapid double `Enter` must not create two replies, and must not leave the box holding stale text.

### A11Y-050 - Cmd/Ctrl+Enter saves an inline edit and Escape cancels it
**P0** * Functional * `src/app.js:2127`

- **Pre:** a note with at least one comment and one AI answer, expanded.
- **Steps:**
  1. `Tab` to the pencil "Edit" button on the comment and press `Enter`.
  2. Confirm focus is inside the edit textarea with the caret at the end of the text.
  3. Change the text, press `Cmd+Enter` (macOS) / `Ctrl+Enter`.
  4. Re-enter edit mode, change the text again, press `Escape`.
  5. Re-enter edit mode and press plain `Enter`.
- **Expect:** step 2 — `src/app.js:2115` focuses the textarea with `preventScroll` and calls `setSelectionRange(len, len)`. Step 3 saves and re-renders. Step 4 discards the change and restores the original text. Step 5 inserts a **newline** (plain `Enter` is not intercepted in the edit box) — confirm it does not save.
- **Watch:** the `Escape` branch does not call `preventDefault()`; in a browser where `Escape` also stops page loading or exits full-screen this could double-fire. Also check `Escape` here does not additionally close the notes panel or the find bar.

### A11Y-051 - Save / Save & re-ask / Cancel buttons are keyboard operable
**P1** * Functional * `src/app.js:1789 editBox()`, `src/app.js:2118-2119`

- **Pre:** editing a *user comment* inside a note (so all three buttons render).
- **Steps:**
  1. From the edit textarea, `Tab` forward and record the stops.
  2. Press `Enter` on "Save & re-ask AI".
  3. Repeat, and press `Enter` on "Cancel".
- **Expect:** stops are "Save", "Save & re-ask AI", "Cancel" — all real `<button>`s. "Save & re-ask AI" replaces the question, deletes the stale AI answers below it and starts a new one. "Cancel" clears `state.ui.editing` and re-renders. On an *AI answer* the "Save & re-ask AI" button is correctly absent.
- **Watch:** all three trigger `render()`, which wipes the list — verify where focus lands afterwards (see A11Y-072). Also confirm the `&amp;` in the source renders as "Save & re-ask AI", not "Save &amp; re-ask AI".

### A11Y-052 - Note card hover actions are focusable but invisible
**P1** * Visual * `src/styles.css:285-290`

- **Pre:** a note expanded, mouse pointer parked outside the notes panel.
- **Steps:**
  1. `Tab` through the note's header controls and watch the screen after each press.
- **Expect:** the collapse chevron and the "Show on card" checkbox sit outside `.macts` and stay visible (`opacity:.6` / `.5`), but the copy, edit and delete buttons live inside `<span class="macts">` at `opacity:0`, revealed only by `.card-h:hover`. A keyboard user therefore tabs onto three **invisible** buttons — including "Delete note". File as P1; this is the same class of defect as A11Y-025.
- **Watch:** verify by pressing `Enter` on the third invisible stop with a throwaway note — it should open the "Delete this note and its thread?" confirm. If it deletes silently, escalate to P0.

### A11Y-053 - Filter, search and sort in the notes header
**P1** * Functional * `src/app.js:3152-3159, 3173`

- **Pre:** sample document with its seeded notes, notes panel open.
- **Steps:**
  1. `Tab` to "Search notes" and press `Enter`; type `bert`.
  2. Press `Escape`; then `Enter` on "Search notes" again to close it.
  3. `Tab` to the sort button and press `Enter` twice.
- **Expect:** the search bar reveals and `#notesSearchInput` receives focus automatically (`src/app.js:3156`); typing filters the list live; the count line updates. `Escape` does **nothing** here (no handler) — record it; the only way to close is re-activating the toggle, which also clears the query and re-renders. The sort button toggles its own label between "Sorted by time ▾" and "Sorted by page ▾" — a proper visible, announced state change.
- **Watch:** `#notesSearchInput` has no label, only the placeholder "Search notes, answers, tags…". Its container does show a focus ring via `.nt-searchbar:focus-within` — confirm that still fires.

### A11Y-054 - Filter popover rows cannot be reached by keyboard
**P0** * A11y * `src/app.js:2231 openPopover()`, `src/app.js:2248 openFilterPopover()`

- **Pre:** notes panel open.
- **Steps:**
  1. `Tab` to "Filter & options" and press `Enter`.
  2. `Tab` once and note where focus goes.
  3. Press `Escape`.
- **Expect:** the popover opens showing "Show" / "All notes" / "Unresolved" / "Screenshots" / "AI replies" / "Questions", "Sort" / "By time" / "By page order", and "Auto-scroll to active note". Every row is a `<div class="row">` with a click handler — **none is focusable**, so filters, sort and auto-scroll are entirely unreachable by keyboard. `Escape` does not close it either (it only closes on an outside `mousedown`, `src/app.js:2245`). Focus stays behind on the trigger button. File as P0.
- **Watch:** the same `openPopover()` builds the per-note menu (`src/app.js:2220 annMenu()`) with "Resolve"/"Mark unresolved" and "Delete note", so resolving a note is also keyboard-impossible.

### A11Y-055 - Tag add and remove are not keyboard reachable
**P1** * A11y * `src/app.js:1725 tagPills()`, `src/app.js:2215 addTagFlow()`

- **Pre:** an expanded note carrying at least one tag (e.g. "Question").
- **Steps:**
  1. `Tab` through the expanded card and try to reach "+ tag".
  2. Try to reach the "×" on an existing tag.
- **Expect:** `<span class="addtag">` and `<span class="rm">×</span>` are both non-focusable spans, so tags can be neither added nor removed with a keyboard. When "+ tag" *is* clicked, it opens a native `prompt()` — which is itself accessible — so the only gap is the trigger. File as P1.
- **Watch:** the `×` is 10.5px inside a tag pill; it also fails the 24×24 target-size check (A11Y-107).

### A11Y-056 - Disclosures for sources and the agent trace work with the keyboard
**P1** * Functional * `src/app.js:1811, 1956 traceHTML()`, `src/styles.css:256-269`

- **Pre:** a note containing an AI answer produced by the agent (ask a question that triggers tool calls).
- **Steps:**
  1. `Tab` to the "AI-generated · <model> · sources" summary and press `Enter`, then `Space`.
  2. `Tab` to "Show the agent's work · N tool calls" and press `Enter`.
  3. Collapse both, then re-render the list (e.g. by clicking another note) and check they stay in the state you left them.
- **Expect:** native `<details>`/`<summary>` — both `Enter` and `Space` toggle, and the state is announced as expanded/collapsed. `src/app.js:2117` persists open state into `state.ui.openDisc`, so a re-render must not silently collapse them.
- **Watch:** `summary{list-style:none}` plus `::-webkit-details-marker{display:none}` removes the native triangle. `.trace` substitutes a "▸/▾" via CSS `content`, but `.prov` has **no** expand indicator at all — verify a sighted keyboard user can still tell it is expandable.

---

## 8. Modals, dialogs, popovers and overlays

### A11Y-057 - confirmDialog: Escape cancels, Enter confirms
**P0** * Functional * `src/app.js:2176-2191`

- **Pre:** a throwaway note exists; notes panel open.
- **Steps:**
  1. Trigger "Delete note" and, when "Delete this note and its thread?" appears, press `Escape`.
  2. Trigger it again and press `Enter`.
  3. Trigger it again and click the backdrop (outside the box).
- **Expect:** `Escape` resolves `false` (nothing is deleted, no toast), `Enter` resolves `true` and the note is removed, and a backdrop click cancels. The two buttons read "Cancel" and "Delete" (the danger variant is red).
- **Watch:** the key handler is registered on `document` with `capture: true` (`src/app.js:2189`), so it fires ahead of every other handler in the app — verify the composer's `Enter`-to-send does not also run while a confirm is open.

### A11Y-058 - confirmDialog: initial focus lands on the confirm button
**P0** * A11y * `src/app.js:2190`

- **Pre:** as above.
- **Steps:**
  1. Trigger a delete confirm and, **without touching anything**, look for the focus ring.
  2. Press `Space` immediately.
  3. Repeat, but press `Enter` within the first 30 ms (mash it as the dialog opens).
- **Expect:** after ~30 ms focus moves to the primary button ("Delete" / "OK") and it shows a visible ring; `Space` activates it. In step 3, note whether the key press is consumed by whatever had focus before the dialog opened (the composer, for example) — a race here means a keystroke intended for the page confirms a destructive dialog.
- **Watch:** on a *danger* dialog, defaulting focus to the destructive button is itself questionable — record the observation even though it is the current design.

### A11Y-059 - confirmDialog has no focus trap and no dialog semantics
**P1** * A11y * `src/app.js:2179-2183`

- **Pre:** a delete confirm open, screen reader on.
- **Steps:**
  1. Listen to how the dialog is announced when it appears.
  2. Press `Shift+Tab` three times and watch where focus goes.
  3. Press `Tab` repeatedly.
- **Expect:** the message text is spoken (or is at least reachable). The mask is `<div class="modal-mask confirm-mask">` with **no `role="dialog"`, no `aria-modal`, no `aria-labelledby`**, and the background is not `inert` — so focus escapes into the reader and the sidebar behind the overlay. Confirm the escape, file as P1, and confirm the dialog can still be completed afterwards (`Escape` still works from anywhere because the listener is on `document`).
- **Watch:** `confirmDialog` does not restore focus to the trigger on resolve — after cancelling a delete, focus is on `<body>`.

### A11Y-060 - Two stacked confirms behave predictably
**P2** * Edge * `src/app.js:2176`, `src/app.js:2396 maybeOfferFolderNotes()` * Chromium only

- **Pre:** Chromium with a notes folder configured (Settings → Storage → "Choose folder…"), and a `.notes.json` in it that matches a PDF you are about to open.
- **Steps:**
  1. Start a delete confirm and, while it is open, trigger the "Found notes for this PDF in “<folder>”: <file>. Open them?" prompt by opening the matching PDF.
  2. Press `Escape` once.
- **Expect:** each `confirmDialog()` adds its own capture-phase `document` keydown listener, so a single `Escape` may resolve **both** dialogs at once. Verify what actually happens and record it — silently cancelling a dialog the user never saw is a P2 at minimum, higher if it cancels a *save*.
- **Watch:** the `.confirm-mask{z-index:200}` sits above `.modal-mask{z-index:120}`, so a confirm raised over Settings is visually correct — check the key handling of that combination too.

### A11Y-061 - Settings modal: Escape does not close it
**P1** * A11y * `src/app.js:2760 openSettings()`

- **Pre:** app loaded.
- **Steps:**
  1. Open Settings with the gear button.
  2. Press `Escape`.
  3. Press `Escape` again with focus inside the OpenRouter API-key field.
  4. Close it with the "Close" button.
- **Expect:** `openSettings()` registers **no keydown handler at all**, so `Escape` does nothing in either position. The only exits are the "Close" button, "Save", the `✕`, or a backdrop click. File the missing `Escape` as P1 — every other modal in the app handles it, so this is an inconsistency users will hit.
- **Watch:** confirm `Escape` does not instead bubble somewhere harmful, e.g. cancelling an inline note edit behind the modal.

### A11Y-062 - Settings modal: focus is not moved in, trapped, or restored
**P0** * A11y * `src/app.js:2760, 2808-2811`

- **Pre:** app loaded, keyboard only.
- **Steps:**
  1. `Tab` to the gear and press `Enter`.
  2. Press `Tab` once and record where focus goes.
  3. Keep tabbing and count how many stops before you reach a control inside the modal.
  4. Close the modal and note where focus lands.
- **Expect:** the modal is appended to `#modalRoot`, which is the **last** element in `app.html` — so focus stays on the gear and tabbing walks through the entire app behind the mask before entering the dialog. Nothing is `inert` and focus is never restored to the gear on close. Verify and file as P0 for keyboard users; a screen-reader user has no way to know a dialog opened.
- **Watch:** the same structural issue applies to the Save-As tip (`src/app.js:2489`) and to every `confirmDialog`, since they all mount into `#modalRoot`.

### A11Y-063 - Settings tool toggles cannot be operated by keyboard
**P0** * A11y * `src/app.js:2783-2784, 2813`

- **Pre:** Settings open on the "AI & Tools" tab.
- **Steps:**
  1. `Tab` through the tab and try to reach the two switches next to "Enable generated visuals" and "Allow external web search (changes provenance to “Used web search”)".
  2. If reachable, press `Space`.
- **Expect:** `#tgVis` and `#tgWeb` are `<div class="sw">` elements with a click handler — not focusable, no `role="switch"`, no `aria-checked`. A keyboard-only user therefore **cannot turn generated visuals or web search on or off**, and a screen-reader user cannot tell their current state (it is a background-colour change only, `src/styles.css:168-172`). File as P0.
- **Watch:** the same `.sw` markup is reused for the "Auto-scroll to active note" row in the filter popover (`src/app.js:2237`), which is unreachable for the same reason.

### A11Y-064 - Settings form fields have no programmatic labels
**P1** * A11y * `src/app.js:2769-2784`

- **Pre:** Settings open, screen reader on.
- **Steps:**
  1. `Tab` through every field on the "AI & Tools" tab and read what is announced.
- **Expect:** the `<label>` elements ("OpenRouter · recommended", "OpenAI-compatible API", "Your identity (actor)", "Tools") have **no `for` attribute** and do not wrap their inputs, so each field announces only by its placeholder — "API key — sk-or-… (optional; server key used by default)", "Base URL — e.g. https://api.openai.com/v1", "API key", "Your name", "IN". The inline model inputs (`#mOpenrouter`, `#mOpenrouterImg`, `#mOpenrouterRouter`, `#mCompat`, `#mCompatImg`, `#mCompatRouter`) have **no label or placeholder at all** — they announce as bare edit fields. File as P1.
- **Watch:** the key fields are `type="password"`, so screen readers announce them as secure and may suppress character echo — verify a pasted key can still be confirmed by the user (there is no reveal toggle).

### A11Y-065 - Settings tabs, default-provider radios and Save are keyboard operable
**P1** * Functional * `src/app.js:2765, 2812, 2814, 2823`

- **Pre:** Settings open.
- **Steps:**
  1. `Tab` across "AI & Tools", "Templates", "Storage" and press `Enter` on each.
  2. `Tab` to the "Default" pill next to "OpenAI-compatible API" and press `Space`.
  3. Press `Enter` in the "Your name" text field.
  4. `Tab` to "Save" and press `Enter`.
- **Expect:** all three tabs are real `<button type="button">`s and switch panes; the `.def-radio` pills are buttons and move the "on" state exclusively. `Enter` in a text field does **nothing** (no `<form>`, so no implicit submission) — confirm it does not save or close. "Save" persists and shows the toast "Settings saved.".
- **Watch:** the tabs have no `role="tab"`/`aria-selected` and the radios no `role="radio"`/`aria-checked`; selection is signalled by colour plus a 2px underline. Note it here rather than filing twice — A11Y-092 covers the colour-only aspect.

### A11Y-066 - Save-As tip modal: Escape and Enter both dismiss it
**P1** * Functional * `src/app.js:2460 maybeShowSaveAsTip()` * Firefox/Safari only

- **Pre:** Firefox or Safari; run `localStorage.removeItem('srw_saveas_tip')` and reload (`00-test-plan.md` §6.3).
- **Steps:**
  1. Trigger a save (the notes "Save" button) so the tip appears.
  2. Read the heading "Choose where your files save" and the body.
  3. Press `Escape`.
  4. Reset the flag, re-show it, and press `Enter`.
  5. Reset again, re-show it, and `Tab` to "Got it" then press `Space`.
- **Expect:** all three dismiss the modal and remove the `document` keydown listener. In Firefox the steps read "Open **Settings → General**", "Scroll to **Files and Applications**", then the setting "Always ask you where to save files"; in Safari "Open **Settings → General**", "Find **File download location**", setting "Ask for each download".
- **Watch:** nothing is focused when the modal opens (there is no initial `.focus()` call, unlike `confirmDialog`), so a screen-reader user is left in the page behind it. Also confirm the tip never appears in Chrome/Edge (`'showSaveFilePicker' in window` gate).

### A11Y-067 - Export view is a keyboard dead end
**P0** * A11y * `src/app.js:2846 openExport()`, `src/app.js:2874-2878`

- **Pre:** sample document with notes; notes panel open.
- **Steps:**
  1. `Tab` to the "Export annotations to PDF" button and press `Enter`.
  2. Try to toggle "Comments", "Linked text", "AI responses", "Screenshots", "Visuals" with the keyboard.
  3. Try to switch layout between "Detailed" and "Compact".
  4. Press `Escape`, then try to reach "← Back to document".
  5. `Tab` repeatedly and watch where focus goes.
- **Expect:** the overlay `#exportView` covers the screen at `z-index:100`. The five `.ex-chk` include toggles and the two `.lay .opt` layout choices are `<div>`s — **not operable**. "← Back to document" is also a `<div id="exBack">` — so the only keyboard-reachable controls are "Preview", "⭳ Export PDF" and the two unlabelled `<select>`s ("A4"/"Letter", "Clean"/"Minimal", which are inert anyway). `Escape` does nothing, and tabbing moves focus to the app **behind** the overlay. A keyboard user who opens this screen cannot leave it except by pressing "⭳ Export PDF" or reloading. File as P0.
- **Watch:** the two `<select>`s have only a preceding `.lbl` div ("Page size", "Style") and no label association — they announce as unlabelled combo boxes.

---

## 9. Focus visibility and focus preservation

### A11Y-068 - Every focusable control in the app shows a visible focus indicator
**P0** * Visual * `src/styles.css` (no `:focus-visible` rule anywhere)

- **Pre:** app loaded with the sample; test in Chrome, Firefox and Safari.
- **Steps:**
  1. `Tab` through every reachable control listed in A11Y-017 and photograph any stop with no visible ring.
- **Expect:** because `src/styles.css` defines no `:focus-visible` styles, every button relies on the browser default ring — which must be clearly visible against `--surface` (#FFFFFF) and against the blue-filled active states (`.tool.active`, `.send`, `.btn.primary`, `.pill.active`). Known failures to confirm: `#findInput` (A11Y-043), controls inside `.macts` and `.doc-act` (opacity 0, A11Y-025/A11Y-052).
- **Watch:** Safari draws a much fainter default ring than Chrome; a control that "passes" in Chrome can fail in Safari. Test all three engines before passing this check.

### A11Y-069 - Custom focus styles on text inputs still fire
**P1** * Visual * `src/styles.css:303, 349, 377, 475, 642`

- **Pre:** app loaded.
- **Steps:**
  1. Focus the document composer (ring should come from `.cbox:focus-within`).
  2. Focus the notes search input (`.nt-searchbar:focus-within`).
  3. Focus an in-card reply box (`.tc-input:focus`).
  4. Open Settings and focus an API-key field (`.field input:focus`) and a Templates textarea (`.pt-item textarea:focus`).
- **Expect:** each shows a blue border plus a 3px `--blue-weak` glow. These five rules zero the native outline and must always supply the replacement — if the glow is missing anywhere, the control has *no* indicator.
- **Watch:** `.edit-input` (`src/styles.css:293`) sets `outline:none` and relies on its permanent `1px solid var(--blue)` border — meaning a focused *and* an unfocused edit box look identical. Record that as a P1.

### A11Y-070 - Focus survives an AI answer arriving
**P0** * A11y * `src/app.js:2084 render()`, `src/app.js:2090-2091, 2154`

- **Pre:** a working AI key configured; a note open with the reply box focused.
- **Steps:**
  1. Type a question into the in-card reply box and press `Enter`.
  2. **Do not touch anything.** Watch the caret while the status cycles "Thinking…", "Gathering context…", "Searching the document…", "Writing the answer…".
  3. Type a follow-up while the answer is still streaming.
- **Expect:** `render()` explicitly captures the reply box's value, focus and caret before wiping the list and restores all three afterwards — so the caret must stay in the reply box through every status update, and typing during generation must land in the box with no lost characters.
- **Watch:** the restore only covers `.card.sel .tc-input`. If you had focus on **anything else** — a trace `summary`, an edit button, the "Show on card" checkbox — every status tick destroys it and focus falls to `<body>`. Test that variant explicitly; a multi-tool agent answer re-renders 10+ times.

### A11Y-071 - Focus is not stolen back into the composer after you tab away
**P1** * Edge * `src/app.js:1616 focusThreadCompose()`

- **Pre:** desktop width (>820px); notes panel open.
- **Steps:**
  1. Click a note card to select it (this calls `selectAnnotation` → `focusThreadCompose` at `src/app.js:1218`).
  2. Immediately press `Tab` twice, fast.
  3. Repeat, waiting 100 ms before tabbing.
- **Expect:** `focusThreadCompose()` calls `focus()` three times — immediately, on the next animation frame, and again after 60 ms. In step 2 the third attempt can **yank focus back** into the reply box after you have tabbed away. Confirm whether it does; a focus that moves without user action is a P1 (WCAG 3.2.1).
- **Watch:** on touch/narrow widths `selectAnnotation` deliberately skips focusing (`if (!drawerMQ.matches)`) so the keyboard does not spring up — verify that exception still holds at ≤820px.

### A11Y-072 - Focus after every destructive or state-changing note action
**P1** * A11y * `src/app.js:2111-2126`

- **Pre:** a note with two replies and one tag, expanded.
- **Steps:**
  1. Using the keyboard only, activate in turn: "Show this on the collapsed card", "Copy this response", "Delete reply", "Collapse thread", and (via the pencil) "Cancel".
  2. After each, press `Tab` once and record where focus went.
- **Expect:** each of these handlers ends in `render()`, which does `list.innerHTML = ''` — every button is destroyed and recreated, so focus falls to `<body>` and the next `Tab` restarts from the top of the document. Confirm the pattern and file once as P1 with the list of affected actions; do not file five separate bugs.
- **Watch:** "Delete reply" (`data-delmsg`) has **no confirm** — a keyboard user who lands on the invisible `.macts` delete (A11Y-052) and presses `Enter` loses a reply with no warning and no undo.

### A11Y-073 - Focus after switching documents or library views
**P1** * A11y * `src/app.js:203 switchDoc()`, `src/app.js:368 renderTree()`

- **Pre:** two documents in the library.
- **Steps:**
  1. With the keyboard, star a document (the only keyboard-reachable row action).
  2. Press `Tab` and record where focus goes.
  3. With the mouse, switch documents, then press `Tab` and record.
- **Expect:** `renderTree()` rebuilds `#docList` wholesale, so focus is lost to `<body>` after starring. After a document switch the entire reader, notes list and tree re-render — verify focus is not left inside a removed node (which would make `Tab` restart from the document top).
- **Watch:** `switchDoc()` also removes any live `#notesBanner` / `#ocrBanner` — if focus was on that banner's "Open notes file…" or "Run OCR" button it is destroyed mid-interaction.

### A11Y-074 - Focus and the on-screen keyboard on a phone
**P1** * A11y * `src/app.js:950 initKeyboardInset()` * iOS only

- **Pre:** a real iPhone (not the simulator), Safari, notes drawer open, a note expanded.
- **Steps:**
  1. Tap into the in-card reply box so the keyboard opens.
  2. Watch whether the box is scrolled into view above the keyboard.
  3. Dismiss the keyboard and check the layout settles back.
- **Expect:** `focusin` adds `.replying` to `#notes` (folding away the document composer and the count row, `src/styles.css:606-607`), `--kb` is set from `visualViewport`, and after ~320 ms `revealFocused()` scrolls the focused field into view with `scrollIntoView({block:'nearest'})`. The field being edited must never sit behind the keyboard or Safari's accessory bar.
- **Watch:** `scrollIntoView` on an element inside `#notesList` can also scroll ancestors — the app deliberately avoids that elsewhere (`src/app.js:1187`). If the top bars slide off-screen when the keyboard opens, that is the bug.

### A11Y-075 - Focus indicators survive a mid-operation resize
**P1** * Edge * `src/styles.css:538, 544, 609`

- **Pre:** app at 1440×900 with focus on the "Search in document" toolbar button.
- **Steps:**
  1. Without touching the keyboard, drag the window narrower past 1100px, then past 820px, then past 560px.
  2. After each crossing, press `Enter`.
- **Expect:** the focused element stays focused and stays visible, or (if its container becomes `display:none`, e.g. `#btnContinuous` below 560px) focus moves somewhere sensible rather than being lost inside a hidden element. `Enter` still activates whatever is focused.
- **Watch:** crossing 820px moves the tools bar from the toolbar to a fixed bottom bar without changing the DOM — if focus was on a tool, the ring should follow it to the bottom of the screen. If the ring stays painted at the old position, that is a rendering defect.

---

## 10. Accessible names and assistive technology semantics

### A11Y-076 - Every icon-only toolbar button announces a real name
**P0** * A11y * `app.html:19, 37, 46, 66-70, 92-95`

- **Pre:** app loaded, screen reader on.
- **Steps:**
  1. Navigate button by button (VoiceOver rotor → Buttons; NVDA `B`) and transcribe every announced name.
- **Expect:** "Collapse" (×2 — sidebar and notes, indistinguishable from each other), "Settings", "Show library", "Show notes", "Continuous scroll", "Search in document", "Filter & options", "Search notes". These come from `title` attributes, which most screen readers use as the fallback accessible name — confirm each one actually speaks.
- **Watch:** two buttons both named "Collapse" is a real defect for a button list. Also note `title` tooltips only appear on **hover**, never on keyboard focus — a sighted keyboard user gets no label at all for any of these.

### A11Y-077 - The injected notes-header buttons announce correctly
**P1** * A11y * `src/app.js:2618 injectNotesButtons()`

- **Pre:** app loaded, notes panel open, screen reader on.
- **Steps:**
  1. Read the accessible names of the four buttons inserted before "Filter & options" and before "Collapse".
- **Expect:** "Save notes (JSON; auto-saves to your folder when one is set)", "Import notes from a JSON file", "Export annotations to PDF", "Delete all notes for this document". Verify strings character for character.
- **Watch:** the Export-PDF icon embeds `<text …>PDF</text>` inside its SVG (`src/app.js:2625`). Because element *content* outranks `title` in name computation, this button may announce as **"PDF"** instead of "Export annotations to PDF". Check what is actually spoken; if so, file as P1.

### A11Y-078 - "Share as HTML" is not announced twice
**P2** * A11y * `app.html:23`

- **Pre:** sidebar open, screen reader on.
- **Steps:**
  1. Read the accessible name of the "Share as HTML" button.
- **Expect:** the button has visible text "Share as HTML", a `title` of "Save this paper + notes as one self-contained .html you can share", **and** an inline SVG containing `<text …>HTML</text>`. Name computation concatenates content, so it may announce as "HTML Share as HTML". Confirm what is spoken and file the duplication as P2.
- **Watch:** the same construction is used for the injected PDF button (A11Y-077) — fix one, fix both.

### A11Y-079 - Selection popover buttons announce their actions
**P1** * A11y * `app.html:119-123`

- **Pre:** text selected in the reader so `#selPop` is visible, screen reader on.
- **Steps:**
  1. Read the three buttons.
- **Expect:** "Highlight", "Note", "✦ Ask AI" — real text content, so the names are correct. Verify the "✦" (U+2726) does not produce a nonsense announcement such as "black four pointed star Ask AI"; if it does, it needs `aria-hidden` on the glyph.
- **Watch:** the container `<div id="selPop">` has no `role`, so the buttons appear at the end of the document with no context. A screen-reader user tabbing there will not know these apply to their selection.

### A11Y-080 - Note cards expose their kind, page and state as text
**P1** * A11y * `src/app.js:1865 compactCard()`, `src/app.js:1799`

- **Pre:** sample document with its seeded notes (a highlight note, a screenshot note, and an AI note), notes panel open, screen reader on.
- **Steps:**
  1. Read three different cards linearly.
- **Expect:** each card reads its number badge, the preview text (with the "AI"/"You" tag when a message is checked "Show on card"), the timestamp, and the location line "Page 7 · 3.1 Model Architecture". Expanded cards additionally read "Linked text · Page 7 · …" or "Screenshot · Page 4 · …" or "Question about document · Page 1", plus "✓ Resolved" when resolved.
- **Watch:** `srcLabel()` (`src/app.js:1728`) is the only textual signal of note kind — the coloured card tints (`.card.k-hl`, `.k-comment`, `.k-ai`, `.k-shot`, `src/styles.css:188-191`) carry no text at all. Confirm the label is present on **both** compact and expanded cards.

### A11Y-081 - The unread dot has no accessible equivalent
**P1** * A11y * `src/app.js:1888`, `src/styles.css:535`

- **Pre:** at least one unresolved and one resolved note.
- **Steps:**
  1. Read both cards with a screen reader.
  2. Compare with what a sighted user sees.
- **Expect:** an unresolved note shows an 8px blue dot at the bottom-right of the card and nothing else; a resolved one shows "✓ Resolved" and `opacity:.72`. So "resolved" is announced but "unresolved" is conveyed **only** by a coloured dot with no text, no `title` and no `aria-label`. File as P1 — this is both a missing name and a colour-only signal.
- **Watch:** `.card.isres{opacity:.72}` also lowers the contrast of every resolved card's text — check it against A11Y-097.

### A11Y-082 - Screenshot thumbnails and generated images have no alt text
**P1** * A11y * `src/app.js:1800, 1822, 1894`

- **Pre:** a note containing a captured figure, and a note containing an AI-generated image.
- **Steps:**
  1. Read both notes with a screen reader.
  2. Repeat inside the export preview (`src/app.js:2892, 2898`).
- **Expect:** `<img src="${safeImgSrc(...)}">` is emitted with **no `alt` attribute anywhere** — screen readers will fall back to announcing the (data-URI) filename or "image", which for a base64 PNG is catastrophic noise. File as P1. Note that a generated image *does* carry nearby text (the `<h4>` title, the `.vis-take` takeaways, and the "AI-generated illustration · not extracted data" disclosure); a captured screenshot has only `a.caption` if a "Figure N:" match was found.
- **Watch:** the export sheet and the shared `.annotated.html` inherit the same markup, so a shared paper is equally opaque.

### A11Y-083 - Provider avatars and glyphs are labelled
**P2** * A11y * `src/app.js:1713 actorAvatar()`

- **Pre:** a note with an AI answer, screen reader on.
- **Steps:**
  1. Read the message header.
- **Expect:** the avatar `<div class="avatar ai brand …" title="OpenRouter">` sits next to the visible name — `<span class="who">OpenRouter</span>` (or "OpenAI-compatible"). The name is therefore available as text; the avatar's `title` is redundant but harmless. Human avatars show initials (default "YO") next to the name "You" or the configured `actorName`.
- **Watch:** for an unknown provider `providerGlyph()` returns the literal "✦" — verify it does not read as a symbol name in front of the author.

### A11Y-084 - Empty states are announced as text
**P2** * A11y * `src/app.js:2096-2099`, `src/app.js:375`, `src/app.js:3197 showEmptyReader()`

- **Pre:** ability to reach each empty state.
- **Steps:**
  1. Filter the notes list to something with no matches and read the panel.
  2. Search notes for `zzzz` and read the panel.
  3. Delete all notes for the document and read the panel.
  4. Switch to Starred with nothing starred; then Trash with nothing trashed.
  5. Remove every document from the library.
- **Expect:** "No notes match this filter."; "No notes match “zzzz”."; "No notes yet. Select text or capture a figure in the document to create a source-linked note."; "No starred documents yet."; "Trash is empty."; and the reader shows the heading "Your library is empty" with "Use **Open PDF or bundle** (top-left) to open a paper, its notes, or a shared **.html**."
- **Watch:** the "No notes yet." message contains a literal `<br>`; confirm the two sentences are announced as separate phrases and not run together.

### A11Y-085 - The read-only shared file announces its nature
**P1** * A11y * `src/app.js:3300`

- **Pre:** an exported `.annotated.html` opened directly from disk, screen reader on.
- **Steps:**
  1. Read the page from the top and listen for any indication that this is read-only.
- **Expect:** the only signal is a fixed banner at the **bottom** of the viewport: "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX", with "pairedx.com" as a link. A screen-reader user reading top-down reaches it last. Confirm it is present, is real text (not a background image), and that its link is reachable and announced.
- **Watch:** `body.readonly #roBanner` uses `position:fixed;bottom:0` at `z-index:80` over `#rdScroll` which gains `padding-bottom:44px` — at 200% zoom verify the banner does not cover the last line of the page.

---

## 11. Live regions and status announcements

### A11Y-086 - Toasts are never announced
**P1** * A11y * `app.html:126`, `src/app.js:29 toast()`

- **Pre:** app loaded, screen reader on.
- **Steps:**
  1. Trigger a success toast (star a document → "Moved “<name>” to Trash." after trashing, or save notes → "Saved <name>.").
  2. Trigger an error toast (open a corrupt `.pdf` → "Could not open <name>: …", or ask the AI while offline → the `/api/ai` message).
  3. Do not move focus. Listen.
- **Expect:** `<div id="toasts">` has **no `aria-live`, no `role="status"`, no `role="alert"`** — so nothing is spoken for either case. Error toasts stay 6 s and success toasts 3.2 s before removal, so a screen-reader user has no way to know an action failed. File as P1 (arguably P0 for the error path — a save that silently failed).
- **Watch:** the fix must be `aria-live="polite"` on the *container*, present before any toast is inserted. Verify it is not applied to each toast individually (regions injected with content are unreliably announced).

### A11Y-087 - Banners use role="status" but may not be announced
**P1** * A11y * `src/app.js:743 showOcrBanner()`, `src/app.js:2424 showNotesBanner()`

- **Pre:** a scanned PDF (for the OCR banner) and a freshly opened PDF with no notes (for the notes banner), screen reader on.
- **Steps:**
  1. Open the scanned PDF and wait for detection (~2 s after load).
  2. Listen without moving focus.
  3. Repeat for the "Have notes for <name>? Open its .notes.json to load them." banner.
- **Expect:** both are created as `<div class="top-banner" role="status">` **with their content already inside** and appended to `<body>`. A live region inserted together with its content is frequently *not* announced. Record what actually happens per screen reader. The exact OCR copy is "This looks like a **scanned PDF** — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?" with buttons "Run OCR" and a `✕` labelled "Dismiss".
- **Watch:** during a run the message is rewritten in place — "Loading the OCR engine…", "Reading text… **page 3 of 11**", "Finishing current page…" — which *should* announce as a region update. Check whether it announces on **every page**, which would be unbearably chatty; that is also a defect.

### A11Y-088 - AI progress and answers are not announced
**P1** * A11y * `src/app.js:1805`, `src/app.js:1475-1496`

- **Pre:** a working AI key; a note open; screen reader on.
- **Steps:**
  1. Ask a question that triggers tool calls.
  2. Keep focus in the reply box and listen through the whole cycle.
- **Expect:** the visible status cycles through "Thinking…", "Gathering context…", "Re-reading the selection…", "Reading a page…", "Searching the document…", "Scanning the outline…", "Reading the full paper…", "Creating a visual…", "Searching the web…", "Working…", "Writing the answer…" and finally the answer text — all rendered as plain DOM with no live region. A screen-reader user hears **nothing** from submitting the question until they manually navigate to the answer, with no cue that it has arrived. File as P1.
- **Watch:** the `.typing` dots (`src/styles.css:361-364`) are purely decorative animation; the status word next to them is the only textual signal. If the status text is ever removed in favour of the dots alone, escalate to P0.

### A11Y-089 - Errors inside a note card are reachable and readable
**P1** * A11y * `src/app.js:1806, 1819`

- **Pre:** force an AI failure (go offline, or set a bogus key in Settings) and ask a question.
- **Steps:**
  1. Read the failed message in the card.
  2. Check the toast that accompanies it.
- **Expect:** the card shows `⚠ <message>` in red (`#B91C1C`), e.g. "⚠ Could not reach the AI endpoint (/api/ai). This works on the deployed site; …" from `errHint()` (`src/app.js:1594`). The message must be real text (announced), and the red must not be the only signal — the "⚠" glyph provides a non-colour cue. Verify contrast of `#B91C1C` on the card tint `#F2EFF8` is ≥4.5:1.
- **Watch:** a generated-visual failure reuses the same markup with the title changed to "Visual unavailable" or "Visual generation failed" — check both variants.

### A11Y-090 - Storage-quota and save failures reach the user
**P1** * A11y * `src/app.js:163-166`, `src/app.js:2607 saveNotesNow()`

- **Pre:** a browser profile near its storage quota (or throttle it in DevTools), screen reader on.
- **Steps:**
  1. Create notes until the quota trips, and listen for "Storage limit reached — export your notes to keep them."
  2. In Chromium, press the Save button, then **cancel** the OS Save dialog with `Escape`.
  3. Save again and complete the dialog.
- **Expect:** the quota message appears as an error toast (and, per A11Y-086, is probably not announced — record it). A cancelled Save dialog produces **no** toast and **no** flash (`status: 'cancelled'` returns early). A completed save shows "Saved <name>." and the button flashes green (`.icon-btn.save-btn.saved`, `src/styles.css:119`) for 1.4 s — a colour-only success signal with no announcement.
- **Watch:** after the native picker closes, focus should return to the Save button. Verify it does; if focus lands on `<body>`, a keyboard user must tab from the top to save again.

---

## 12. Colour, contrast and non colour signals

### A11Y-091 - Muted and faint text meets contrast minimums
**P0** * Visual * `src/styles.css:5`

- **Pre:** app loaded with the sample and its notes. Use a contrast checker (DevTools colour picker, or the Accessibility pane's contrast readout).
- **Steps:**
  1. Measure `--faint` (#9CA3AF) against `--surface` (#FFFFFF) where it is used: the `.when` timestamp on a card, `.cc-when`, `.daysep` ("TODAY"), `.disc`, `.expand-hint`, `.lib-empty`, `.empty`, `.nt-foot` ("0 notes"), `.prov > summary`, `.doc-act` and `.mact` icons, `.nav-item .ic`, `.tree-row .fic`.
  2. Measure `--muted` (#6B7280) on `--surface` and on `--surface-2` (#F9FAFB).
  3. Measure `--muted` on the card tints `#F8F3EA`, `#EDF2E9`, `#F2EFF8`, `#E9EFF4`.
- **Expect:** `--faint` on white is ≈**2.5:1** and fails WCAG AA (4.5:1 for text under 18.66px) — every usage above is a fail; file one P0 covering the token, listing the sites. `--muted` on white is ≈4.8:1 and passes; verify it still passes on each card tint.
- **Watch:** all of these are 11–12.5px text, so the large-text 3:1 exception does **not** apply. Do not accept "it's only a timestamp" — day separators and note counts are primary information.

### A11Y-092 - Non-text UI state meets 3:1 against its surroundings
**P1** * Visual * `src/styles.css:105-107, 118, 168-172, 501-506, 631-633`

- **Pre:** app loaded.
- **Steps:**
  1. Measure the active tool's blue fill `--blue` (#2563EB) against the toolbar surface (#FFFFFF) and the inactive tools next to it.
  2. Measure `.icon-btn.active` (`--blue-weak` #DBEAFE on #FFFFFF).
  3. Measure the Settings switch on/off states (`--line` #E5E7EB vs `--blue`) and the `.def-radio.on` pill.
  4. Measure the `.settab.on` 2px underline.
- **Expect:** every state indicator that is the **only** way to tell on from off must reach 3:1 against adjacent colours (WCAG 1.4.11). `.icon-btn.active` at #DBEAFE on white is ≈**1.3:1** and fails outright — so a "Continuous scroll" or "Search in document" button that is *on* looks essentially the same as one that is off to a low-vision user. File as P1.
- **Watch:** the same #DBEAFE is used for `.nav-item.active` and `.tree-row.active`, but those add `font-weight:600` as a second cue, which is acceptable.

### A11Y-093 - No control conveys its state by colour alone
**P0** * A11y * `src/styles.css:103-107, 118, 168-172, 179-180, 379-380, 406, 410`

- **Pre:** app loaded. Simulate greyscale (DevTools → Rendering → *Emulate vision deficiencies* → Achromatopsia) or take a screenshot and desaturate it.
- **Steps:**
  1. In greyscale, identify: which of the four tools is active; whether "Continuous scroll" is on; whether "Search in document" is on; which filter pill is selected; whether each Settings switch is on; which provider is "Default"; which export include-toggles are on; which export layout is selected.
- **Expect:** each must be distinguishable **without** colour. Findings to confirm: the active tool is a filled square (shape change, arguably passes), `.icon-btn.active` is colour only (**fails**), `.sw.on` moves its knob from left to right (passes on shape), `.def-radio.on` fills the dot (passes), `.ex-chk.on` fills the box and shows "✓" (passes), `.lay .opt.on` fills the radio and adds a border (passes), `.pill.active` is colour-only fill (**fails**).
- **Watch:** do this check in one greyscale pass rather than reasoning from the CSS — several of these read fine in theory and fail in practice because the shape change is 2px.

### A11Y-094 - Links inside AI answers are distinguishable without colour
**P1** * Visual * `src/styles.css:236-237`

- **Pre:** an AI answer containing a markdown citation link (ask a question with web search enabled, or edit a comment to contain `[example](https://example.com)`).
- **Steps:**
  1. View the answer in greyscale.
  2. `Tab` to the link and hover it.
- **Expect:** `.msg a{color:var(--blue);text-decoration:none}` with underline **only** on `:hover` — so in greyscale the link is indistinguishable from surrounding body text. That fails WCAG 1.4.1. File as P1. Confirm the link opens in a new tab with `rel="noopener noreferrer"` (`src/app.js:1962`) and is announced as a link.
- **Watch:** the same rule covers `a.cite`; and `.msg .men` (`@ai` mentions) are blue+bold, which is acceptable because bold is a second cue.

### A11Y-095 - Tag pills and provenance chips read without colour
**P2** * Visual * `src/styles.css:275-281, 250-253`

- **Pre:** notes carrying several tags ("Question", "Screenshot", "Generated visual", "Confusion", …) and an AI answer with chips.
- **Steps:**
  1. View in greyscale and confirm each pill's meaning is still available.
  2. Measure the contrast of the two lowest-contrast pairs: `.tag.claim` (#334155 on #F1F5F9) and `.tag.q` (#1D4ED8 on #EFF6FF).
  3. Measure `.chip.dim` (`--muted` on `--surface`) at 10.5px.
- **Expect:** every tag and chip carries its own **text** ("Question", "Page 7", "Used highlighted text", "Used web search", "No external sources"), so colour is decorative — this should pass 1.4.1. All pairs must still reach 4.5:1 because the text is 10.5px.
- **Watch:** an unknown/imported tag falls back to `TAG_CLASS[t] || 'claim'` (`src/app.js:1725`), so a custom tag added via "+ tag" always gets the slate style — confirm it is still legible.

### A11Y-096 - Highlight colours over page text remain legible
**P1** * Visual * `src/styles.css:140-144, 126-128`

- **Pre:** the sample document with yellow highlights, blue "linked text" highlights, a screenshot figure box, and an active find search.
- **Steps:**
  1. Compare the PDF's black body text under `.hl-rect.yellow` (rgba(250,204,21,.45)) and under `.hl-rect.text` (rgba(37,99,235,.20)).
  2. Compare a find hit `mark.sh` (rgba(245,158,11,.34)) and the current hit `mark.sh.cur` (rgba(245,158,11,.9)).
- **Expect:** the underlying page text stays readable under every overlay — these are translucent fills painted **over** the canvas, so the effective contrast drops. The current find hit at 0.9 alpha is the riskiest; it also carries a `1.5px` ring (`box-shadow: 0 0 0 1.5px rgba(180,110,0,.55)`) so "current" is not colour-alone.
- **Watch:** on a scanned page after OCR the text is part of the raster image and cannot reflow — verify highlights over an OCR'd page do not obliterate the words underneath.

### A11Y-097 - Resolved notes stay readable at reduced opacity
**P2** * Visual * `src/styles.css:339`

- **Pre:** at least one note marked resolved (via the card kebab → "Resolve").
- **Steps:**
  1. Measure the contrast of the resolved card's body text and its "✓ Resolved" flag.
- **Expect:** `.card.isres{opacity:.72}` multiplies **everything** in the card, so `--ink` (#111827) body text on a `#F8F3EA` tint drops from ≈15:1 to roughly 8:1 (still fine), but `--faint` metadata drops from ≈2.5:1 to ≈1.9:1 (already failing, now worse). Confirm the numbers; the "✓ Resolved" green (`--green` #059669) must still reach 4.5:1.
- **Watch:** the same `opacity` also dims any screenshot thumbnail in the card — confirm the figure is still identifiable.

### A11Y-098 - Forced colours mode keeps the app usable
**P1** * Visual * `src/styles.css` (no `forced-colors` block)

- **Pre:** Windows High Contrast (Settings → Accessibility → Contrast themes) with Edge or Chrome, or DevTools → Rendering → *Emulate forced-colors: active*.
- **Steps:**
  1. Load the app and inspect: the active tool, the Settings switches, the unread dot, the tag pills, the highlight rectangles, the pins, the note-card tints, the modal backdrop, and the composer.
- **Expect:** forced colours replaces backgrounds and text with the system palette. Confirm which affordances vanish: the four card tints collapse to one colour, `.tool.active` loses its blue fill, `.sw` loses its track colour, `.unread-dot` disappears, `.hl-rect` overlays become invisible or opaque. The app must remain *operable* even if plainer — the failure bar is "a control became invisible or unusable".
- **Watch:** the composer's `-webkit-text-fill-color:transparent` (A11Y-048) is the most likely hard failure — typed text invisible with no way to recover.

### A11Y-099 - The connector line is a decorative reinforcement, not the only link
**P2** * A11y * `src/app.js:1162 drawConnector()`, `src/styles.css:149-150`

- **Pre:** a note selected with its pin visible on the page.
- **Steps:**
  1. Confirm the dashed blue SVG curve joins pin to card.
  2. Hide it (collapse the notes panel, or resize below 820px where `#connectors{display:none}`) and check the association is still expressible.
- **Expect:** the connector is purely visual (`pointer-events:none`, no text) — the same relationship must also be readable as text: the pin shows the note's number and the card shows the matching `.cc-badge` / `.qn` number plus "Page N". Confirm those numbers agree; the numbering comes from `renumber()` (`src/app.js:1087`).
- **Watch:** if `renumber()` and `drawPins()` ever disagree, the *only* non-visual link between page and note breaks — and the connector line will still look correct, hiding the bug from a sighted tester.

---

## 13. Motion, zoom and target size

### A11Y-100 - The app ignores prefers-reduced-motion entirely
**P1** * A11y * `src/styles.css:29, 75, 168, 285, 549, 556, 647, 661`

- **Pre:** OS reduced motion on (or DevTools → Rendering → *Emulate prefers-reduced-motion: reduce*). App at 1440×900 and again at 390×844.
- **Steps:**
  1. Collapse and expand the sidebar (grid-column transition, `.18s`).
  2. At phone width, open and close a drawer (`transform .22s`) and watch the scrim fade (`opacity .22s`).
  3. Trigger a top banner (open a PDF with no notes) and watch it slide in (`transform + opacity .22s`).
  4. Hover a document row (`.doc-act` opacity `.12s`) and a note header (`.macts` opacity `.12s`).
  5. Toggle a Settings switch (`.15s`) and expand a Templates row (`transform .12s`).
- **Expect:** `src/styles.css` contains **no `@media (prefers-reduced-motion:reduce)` block**, so every one of these still animates. File one P1 covering the whole stylesheet, listing the transitions above. (Contrast with `index.html:204-209`, which does handle it.)
- **Watch:** these are all short and small-amplitude, which is why this is P1 not P0 — but the drawer slide at phone width is a full-screen movement and is the one most likely to trigger vestibular symptoms.

### A11Y-101 - The typing indicator animates indefinitely
**P1** * A11y * `src/styles.css:361-364`

- **Pre:** reduced motion on; a working AI key.
- **Steps:**
  1. Ask a question that takes >5 s (an agent question with tool calls).
  2. Watch the three dots next to the status text.
- **Expect:** `@keyframes bl` runs `1s infinite` on three staggered dots for the whole duration of the request, unaffected by reduced motion. WCAG 2.2.2 requires that motion lasting more than 5 s be pausable, stoppable, or hideable — this is neither. Confirm and file as P1. The accompanying status text ("Thinking…", "Searching the document…") is the non-animated equivalent and must remain.
- **Watch:** during a long agent run this is on screen for 30 s+. Check whether it also appears in the shared read-only `.annotated.html` (it should not — those answers are already complete).

### A11Y-102 - Smooth scroll and auto-scroll do not fight the user
**P1** * A11y * `src/app.js:2139-2151`, `src/app.js:2989`

- **Pre:** a long note thread being generated by the AI; reduced motion on.
- **Steps:**
  1. While the answer streams, scroll the notes list **up** to read an earlier reply.
  2. Watch whether the list is yanked back to the bottom.
  3. Separately, run a find with many matches and press `Enter` repeatedly.
- **Expect:** `render()` only calls `followNoteBottom()` when the user was already near the bottom (`wasAtBottom`, `src/app.js:2088`) — scrolling up must stop the auto-follow. Find navigation uses `scrollIntoView({block:'center'})` with no `behavior`, so it jumps instantly rather than animating.
- **Watch:** the `img.onload` re-anchor at `src/app.js:2148` fires when a late-decoding generated image reports its height — verify it does not yank the list after the user has deliberately scrolled away.

### A11Y-103 - The app at 200% browser zoom
**P0** * A11y * `src/styles.css:18, 538, 544, 609`

- **Pre:** app at 1280×800 with the sample and its notes.
- **Steps:**
  1. Zoom to 200%.
  2. Verify you can still: read a page, open the notes drawer, expand a note, type a reply, open Settings, and open the find bar.
  3. Confirm nothing requires horizontal scrolling of the **page body**.
- **Expect:** the layout reflows into drawer mode; `.rd-mid` scrolls horizontally *inside itself* (that is by design and allowed); the Settings modal is `max-height:90vh; overflow:auto` and scrolls internally; the notes list scrolls. `html,body{overflow:clip}` must not strand content.
- **Watch:** `.modal{width:560px}` — at 200% on a 1280px screen that is 560 CSS px inside a 640 CSS px viewport, leaving 40px of margin. Verify the Templates tab's long textareas are still reachable and that the footer "Close"/"Save" buttons are not pushed off-screen.

### A11Y-104 - The app at 400% zoom / 320px equivalent width
**P1** * A11y * `src/styles.css:609-612`

- **Pre:** app at 1280×800.
- **Steps:**
  1. Zoom to 400% (effective 320 CSS px).
  2. Attempt the same six tasks as A11Y-103.
- **Expect:** WCAG 1.4.10 requires content to reflow to 320px without loss of function. Below 560px the zoom readout and continuous toggle are hidden by design; the tools float at the bottom. Confirm the page-number input, both page arrows and the search button are still reachable by scrolling `.rd-mid`, that the notes drawer is usable, and that the Settings modal fits.
- **Watch:** `.popover{min-width:214px}` positioned at `top: anchor.bottom + 6` with no flip logic (`src/app.js:2243-2244`) — at 400% the filter popover will very likely run off the bottom of the viewport with no way to scroll to it, because the body cannot scroll.

### A11Y-105 - Text-only enlargement does not clip labels
**P1** * Visual * `src/styles.css:19-20`

- **Pre:** Firefox with *Settings → Fonts → Advanced → Minimum font size* set to 20px (or Chrome's minimum font size setting).
- **Steps:**
  1. Load the app and inspect: the sidebar buttons "Open PDF or bundle" and "Share as HTML", the notes footer ("12 notes" and "Sorted by time ▾"), the tag pills, the provenance chips, the day separators, and the toolbar's "/ 16".
- **Expect:** every label grows and its container grows with it — no text is clipped, truncated with an ellipsis it did not have before, or overlapped. Fixed-height containers are the risk: `.new-btn{height:40px}`, `.side-btn{height:34px}`, `.rd-top{height:60px}`, `.tool{height:34px}`, `.icon-btn{height:30px}`.
- **Watch:** `.doc-row .doc-name` uses `text-overflow:ellipsis` deliberately; that is expected. Anything *else* that starts truncating is the bug.

### A11Y-106 - iOS does not zoom the page when a control is focused
**P1** * A11y * `src/styles.css:600` * iOS only

- **Pre:** a real iPhone in Safari, app open.
- **Steps:**
  1. Tap the page-number input in the toolbar.
  2. Tap the document composer.
  3. Tap an in-card reply box and an inline edit box.
  4. Open the find bar and tap its input.
- **Expect:** none of these causes Safari to zoom the whole page. `src/styles.css:600` forces `font-size:16px` at ≤820px for `input,textarea,select,.pagein,.tc-input,.edit-input,#findInput` precisely to prevent this.
- **Watch:** any new input class added later must be added to that list; the symptom is the toolbar and half the drawer sliding off-screen after a tap, which testers often misreport as a layout bug.

### A11Y-107 - Interactive targets meet the 24×24 minimum
**P2** * Visual * `src/styles.css:40, 74, 287, 314, 573, 582`

- **Pre:** app loaded with notes and at least one tagged note. Measure with DevTools' box model.
- **Steps:**
  1. Measure: `.icon-btn` (30×30 desktop, 34×34 at ≤820px), `.tool` (38×34, 46×42 at ≤820px), `.doc-act` (22×22), `.mact` (26×26), `.tag .rm` (the `×` inside a pill), `.quote-more` ("Show more"), `.tb-x` (the banner ✕), `.kebab`.
  2. Repeat at phone width.
- **Expect:** WCAG 2.5.8 requires 24×24 CSS px unless spacing compensates. `.doc-act` at **22×22** fails, and the `.tag .rm` `×` (a 10.5px glyph with 5px left margin, no padding) fails badly. `.mact` at 26×26 passes. The tools grow correctly on phones.
- **Watch:** `.doc-act` buttons are also `gap:1px` apart, so the spacing exception does not rescue them — and one of the two is "Move to trash".

---

## Coverage map

| Code or element | Checks |
|---|---|
| `index.html:215-379` (landing markup) | A11Y-001, A11Y-003, A11Y-004, A11Y-008 |
| `index.html:48` (`.btn:focus-visible`) | A11Y-002 |
| `index.html:253` (scroll hint) | A11Y-006 |
| `index.html:256` (`<video class="reelvid">`) | A11Y-005 |
| `index.html:339-342` (comparison table) | A11Y-007 |
| `index.html:204-209` (reduced-motion block) | A11Y-013, A11Y-100 |
| `features.html:116-131` (header + tocbar) | A11Y-009 |
| `features.html:127-269` (headings) | A11Y-010 |
| `features.html:134-263` (screenshots) | A11Y-011 |
| `features.html:135-147` (callout dots + legend) | A11Y-012 |
| `features.html:20, 28` | A11Y-013 |
| `features.html:114-376` (landmarks) | A11Y-014 |
| `app.html:13-116` (shell structure) | A11Y-015, A11Y-016, A11Y-017 |
| `app.html:19, 37, 46, 66-70, 92-95` (icon-only buttons) | A11Y-076 |
| `app.html:21-22` (`#newBtn` / `#fileInput`) | A11Y-027 |
| `app.html:23` (`#btnShareHtml`) | A11Y-078 |
| `app.html:26-29` (`.nav-item` divs) | A11Y-023 |
| `app.html:36-40` (storage block) | A11Y-028 |
| `app.html:50-53` (page nav + input) | A11Y-030, A11Y-031 |
| `app.html:56-58` (zoom) | A11Y-032 |
| `app.html:61-64` (`.tool` buttons) | A11Y-033 |
| `app.html:78-83` (`#captureMask` / `#capBar`) | A11Y-034 |
| `app.html:106-112` (`#composer`) | A11Y-046, A11Y-047 |
| `app.html:115` (`#scrim`) | A11Y-020 |
| `app.html:119-123` (`#selPop`) | A11Y-036, A11Y-079 |
| `app.html:126` (`#toasts`) | A11Y-086 |
| `src/styles.css:5` (`--muted` / `--faint`) | A11Y-091 |
| `src/styles.css:29, 549, 556, 661` (transitions) | A11Y-100 |
| `src/styles.css:30-31, 461-463` (collapse) | A11Y-018 |
| `src/styles.css:74-79` (`.doc-act` opacity) | A11Y-025, A11Y-107 |
| `src/styles.css:103-107, 118` (tool/toggle active) | A11Y-033, A11Y-092, A11Y-093 |
| `src/styles.css:121-128` (text layer, find marks) | A11Y-038, A11Y-096 |
| `src/styles.css:129-133` (`.find-bar`, `#findInput`) | A11Y-043 |
| `src/styles.css:140-150` (`.hl-rect`, `.pin`, connectors) | A11Y-096, A11Y-099 |
| `src/styles.css:168-172` (`.sw`) | A11Y-063, A11Y-092, A11Y-093 |
| `src/styles.css:236-237` (`.msg a`) | A11Y-094 |
| `src/styles.css:250-253, 275-281` (chips, tags) | A11Y-095 |
| `src/styles.css:285-290` (`.macts` opacity) | A11Y-052 |
| `src/styles.css:293, 303, 349, 377, 475, 642` (focus styles) | A11Y-068, A11Y-069 |
| `src/styles.css:339` (`.card.isres`) | A11Y-097 |
| `src/styles.css:361-364` (`@keyframes bl`) | A11Y-101 |
| `src/styles.css:535` (`.unread-dot`) | A11Y-081 |
| `src/styles.css:538, 544-608, 609-612` (breakpoints) | A11Y-019, A11Y-022, A11Y-075, A11Y-103, A11Y-104 |
| `src/styles.css:600` (16px inputs) | A11Y-106 |
| `src/styles.css:604-607` (`.replying`) | A11Y-074 |
| `src/styles.css:614-618` (`.col-resizer`) | A11Y-029 |
| `src/app.js:29 toast()` | A11Y-086, A11Y-090 |
| `src/app.js:163-166 save()` | A11Y-090 |
| `src/app.js:203 switchDoc()` / `src/app.js:368 renderTree()` | A11Y-024, A11Y-026, A11Y-073 |
| `src/app.js:396 updateStorage()` | A11Y-028 |
| `src/app.js:456 renderPage()` / `src/app.js:644 buildOcrTextLayer()` | A11Y-038 |
| `src/app.js:743 showOcrBanner()` / `src/app.js:2424 showNotesBanner()` | A11Y-087 |
| `src/app.js:813 onTextSelect()` | A11Y-036 |
| `src/app.js:906 setTool()` / `src/app.js:917 initCaptureMask()` | A11Y-033, A11Y-034 |
| `src/app.js:950 initKeyboardInset()` | A11Y-074 |
| `src/app.js:1087 renumber()` / `1101 drawHighlights()` / `1116 drawPins()` | A11Y-035, A11Y-099 |
| `src/app.js:1162 drawConnector()` | A11Y-099 |
| `src/app.js:1208 selectAnnotation()` / `1616 focusThreadCompose()` | A11Y-071 |
| `src/app.js:1475-1496 askAIAgent()` / `1805 msgCard()` | A11Y-088, A11Y-089 |
| `src/app.js:1594 errHint()` | A11Y-089 |
| `src/app.js:1601 attachMentions()` | A11Y-048, A11Y-098 |
| `src/app.js:1713 actorAvatar()` / `1728 srcLabel()` | A11Y-080, A11Y-083 |
| `src/app.js:1725 tagPills()` / `2215 addTagFlow()` | A11Y-055, A11Y-095 |
| `src/app.js:1789 editBox()` | A11Y-051 |
| `src/app.js:1800, 1822, 1894` (`<img>` without alt) | A11Y-082 |
| `src/app.js:1865 compactCard()` | A11Y-080, A11Y-081 |
| `src/app.js:1956 traceHTML()` | A11Y-056 |
| `src/app.js:2084 render()` | A11Y-070, A11Y-072, A11Y-084, A11Y-102 |
| `src/app.js:2111-2126` (dynamic wiring) | A11Y-072 |
| `src/app.js:2127` (`.edit-input` keydown) | A11Y-050 |
| `src/app.js:2134` (`.tc-input` keydown) | A11Y-049 |
| `src/app.js:2176 confirmDialog()` | A11Y-057, A11Y-058, A11Y-059, A11Y-060 |
| `src/app.js:2231 openPopover()` / `2248 openFilterPopover()` | A11Y-054, A11Y-104 |
| `src/app.js:2396 maybeOfferFolderNotes()` | A11Y-060 |
| `src/app.js:2460 maybeShowSaveAsTip()` | A11Y-066 |
| `src/app.js:2607 saveNotesNow()` | A11Y-090 |
| `src/app.js:2618 injectNotesButtons()` | A11Y-077 |
| `src/app.js:2760 openSettings()` | A11Y-061, A11Y-062, A11Y-063, A11Y-064, A11Y-065 |
| `src/app.js:2846 openExport()` | A11Y-067 |
| `src/app.js:2928-2930` (find input keydown) | A11Y-041, A11Y-042 |
| `src/app.js:2937 openFind()` / `2944 closeFind()` | A11Y-039, A11Y-042, A11Y-045 |
| `src/app.js:3058 wire()` | A11Y-017, A11Y-030, A11Y-032, A11Y-046, A11Y-053 |
| `src/app.js:3124` (Cmd/Ctrl+F) | A11Y-039, A11Y-040 |
| `src/app.js:3197 showEmptyReader()` | A11Y-084 |
| `src/app.js:3221 initPanelResize()` | A11Y-029 |
| `src/app.js:3294 applyReadOnly()` | A11Y-021, A11Y-085 |

## Deliberately not covered here

- **Does the feature work at all** (highlighting, OCR, AI answers, export contents, storage round-trips) — covered functionally in `05-reader-and-navigation.md`, `06-annotation-tools.md`, `07-notes-panel.md`, `08-ai-and-agent.md`, `09-ocr.md`, `10-storage-and-persistence.md`, `11-share-and-export.md`. This document only asks whether those flows can be driven and perceived without a mouse or without sight.
- **Layout, breakpoint and touch behaviour** for its own sake (drawer geometry, pinch zoom, safe-area insets, the on-screen keyboard's effect on layout) — `14-responsive-mobile-and-touch.md`. Only the *focus* and *zoom-reflow* consequences are checked here (A11Y-019, A11Y-074, A11Y-103, A11Y-104, A11Y-106).
- **Landing and features page content, links and copy accuracy** — `01-landing-page.md` and `02-features-page.md`. Here they are checked only for keyboard order, focus rings, alt text, heading order and motion.
- **Settings functionality** (which provider is used, whether keys persist, whether prompts save) — `12-settings-and-templates.md`. Here only the labelling, keyboard operability and focus behaviour of that modal.
- **Chromium-only API fallbacks** as a feature-parity question — `16-cross-browser-and-platform.md`. A11Y-066 and A11Y-090 touch `showSaveFilePicker` only where it changes focus or dialog behaviour.
- **Error message wording and recovery paths** — `18-error-states-and-recovery.md`. Here only whether errors are *perceivable* (A11Y-086, A11Y-089, A11Y-090).
- **Automated audits.** Running axe/Lighthouse is useful triage but is not a substitute for any check in this document; roughly two-thirds of the findings above (clickable `div`s, missing focus restore, colour-only state, focus inside `opacity:0` containers) are invisible to automated tooling.
