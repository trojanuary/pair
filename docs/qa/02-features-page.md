# 02 - Features page (features.html)

> Every section, anchor link, claim, illustration, chip and grid item on the standalone feature detail page at `/features.html` - including whether each claim is still true of the shipped app.

| | |
|---|---|
| **ID prefix** | FEAT |
| **Scope** | `/features.html` end to end: head/meta, sticky header, hero + annotated screenshot, the in-page anchor bar, all 12 feature sections (`#annotate` `#ocr` `#linked` `#ai` `#agent` `#figures` `#notes` `#library` `#share` `#byo` `#templates` `#storage`), the "And everything else" grid (`#all`), the CTA band and the footer. Each product claim is cross-checked against `src/app.js` so an over-promise is caught as a bug. |
| **Primary code** | `features.html:1-384`, cross-referenced against `src/app.js`, `app.html`, `api/ai.js`, `README.md` |
| **Checks** | 128 |

## Contents
- [1. Page load, head and assets](#1-page-load-head-and-assets) - 8 checks
- [2. Sticky header and top nav](#2-sticky-header-and-top-nav) - 8 checks
- [3. Hero copy](#3-hero-copy) - 4 checks
- [4. In-page anchor nav (tocbar)](#4-in-page-anchor-nav-tocbar) - 8 checks
- [5. Annotated hero screenshot and legend](#5-annotated-hero-screenshot-and-legend) - 7 checks
- [6. Row and band layout mechanics](#6-row-and-band-layout-mechanics) - 7 checks
- [7. Section: Read and annotate (#annotate)](#7-section-read-and-annotate-annotate) - 5 checks
- [8. Section: Scanned PDFs (#ocr)](#8-section-scanned-pdfs-ocr) - 6 checks
- [9. Section: Source-linked (#linked)](#9-section-source-linked-linked) - 4 checks
- [10. Section: Ask AI (#ai)](#10-section-ask-ai-ai) - 6 checks
- [11. Section: Inspectable agent (#agent)](#11-section-inspectable-agent-agent) - 5 checks
- [12. Section: Figures and visuals (#figures)](#12-section-figures-and-visuals-figures) - 4 checks
- [13. Section: Notes your way (#notes)](#13-section-notes-your-way-notes) - 4 checks
- [14. Section: Your library (#library)](#14-section-your-library-library) - 5 checks
- [15. Section: Share and export (#share)](#15-section-share-and-export-share) - 5 checks
- [16. Section: Bring your own model (#byo)](#16-section-bring-your-own-model-byo) - 5 checks
- [17. Section: Editable prompts (#templates)](#17-section-editable-prompts-templates) - 4 checks
- [18. Section: Portable and private (#storage)](#18-section-portable-and-private-storage) - 4 checks
- [19. "And everything else" grid (#all)](#19-and-everything-else-grid-all) - 16 checks
- [20. CTA band and footer](#20-cta-band-and-footer) - 6 checks
- [21. Responsive, accessibility, performance and edges](#21-responsive-accessibility-performance-and-edges) - 7 checks

---

## 1. Page load, head and assets

### FEAT-001 - Page loads at /features.html with the right tab title
**P0** * Functional * `features.html:6`

- **Pre:** Deployed site (or `vercel dev`). Fresh tab.
- **Steps:**
  1. Navigate to `https://<host>/features.html`.
  2. Read the browser tab label.
- **Expect:** Page renders (HTTP 200). Tab title is exactly `"PairedX — Features"` - em dash, not a hyphen. Body background is the warm paper tone `#F7F3EA`, not white.
- **Watch:** A copy-paste of the landing `<title>` leaves the tab reading "PairedX — Source-Linked AI Reading Workspace"; two identical tabs become indistinguishable.

### FEAT-002 - Meta description is present and unique to this page
**P2** * Copy * `features.html:7`

- **Pre:** Page loaded.
- **Steps:**
  1. View source (Ctrl/Cmd-U) or inspect `<head>`.
- **Expect:** `<meta name="description" content="Every feature of PairedX, the source-linked AI reading workspace — at a glance.">` - verbatim, including the em dash.
- **Watch:** The description silently keeps the landing page's text after a copy, so both pages show the same snippet in search results.

### FEAT-003 - Favicon renders as the blue "P" tile
**P2** * Visual * `features.html:8`

- **Pre:** Page loaded in a tab next to at least one other tab.
- **Steps:**
  1. Look at the tab icon.
  2. Hard-reload with cache disabled and look again.
- **Expect:** A rounded blue (`#2555F5`) square with a white serif "P". It is an inline `data:image/svg+xml` URI, so it must appear even with no network after first paint.
- **Watch:** The SVG data URI contains unescaped `#` characters after an edit and the icon falls back to the generic globe/document glyph.

### FEAT-004 - Web fonts load, and the page degrades cleanly without them
**P1** * Visual * `features.html:9-11`

- **Pre:** Page loaded.
- **Steps:**
  1. Confirm headings (`h1`, section `h2`) render in Fraunces (a serif with a soft, high-contrast look) and body text in Inter.
  2. In DevTools, block `fonts.googleapis.com` and `fonts.gstatic.com`, then reload.
- **Expect:** With fonts: serif headings, sans body. Blocked: headings fall back to Georgia/serif and body to the system sans (`-apple-system`, `Segoe UI`, Roboto) - layout must not break, no invisible text, no giant reflow.
- **Watch:** FOIT - headings stay invisible for seconds because `display=swap` was dropped from the Google Fonts URL.

### FEAT-005 - No console errors and no failed requests
**P0** * Functional * `features.html:378-382`

- **Pre:** DevTools open on Console and Network tabs before loading.
- **Steps:**
  1. Load `/features.html`.
  2. Scroll the whole page top to bottom.
- **Expect:** Zero console errors. Zero 4xx/5xx in Network. The only inline script is the header-scroll toggle; it must not throw (it dereferences `document.querySelector('header')` at parse time).
- **Watch:** The inline script is moved above `<header>` in the markup, `_h` becomes `null`, and every scroll event throws "Cannot read properties of null".

### FEAT-006 - All 13 screenshots resolve
**P0** * Visual * `features.html:134,159,167,175,185,195,205,215,225,233,243,253,263`

- **Pre:** Network tab open, filter to Img.
- **Steps:**
  1. Load the page and scroll to the bottom so every image is requested.
  2. Confirm each of these returns 200: `docs/screenshots/01-workspace.jpg`, `03-toolbar.png`, `feat-ocr-banner.jpg`, `04-connector.jpg`, `05-ai-answer.jpg`, `06-agent-trace.jpg`, `07-screenshot-note.jpg`, `feat-show-on-card.jpg`, `feat-library.jpg`, `feat-export-pdf.jpg`, `feat-settings-ai.jpg`, `settings-templates.jpg`, `feat-settings-storage.jpg`.
- **Expect:** 13 images, all 200, none showing a broken-image placeholder or collapsed to zero height.
- **Watch:** Paths here are **relative** (`docs/screenshots/...`) while every link is absolute (`/app`, `/#features`). Serving the page from any sub-path, or renaming to the `.framed.png` variants used by the README, breaks all 13 at once.

### FEAT-007 - The landing page's "Features" links reach this page
**P1** * Functional * `index.html` header `nav.nlinks` / footer `nav.flinks`, `features.html:1`

- **Pre:** Start on `/` (the landing page).
- **Steps:**
  1. Click "Features" in the landing header.
  2. Go back, scroll to the footer, click "Features" there.
- **Expect:** Both go to `/features.html` and land at the top of this page (hero visible, not mid-page).
- **Watch:** A rewrite is added for `/features` in `vercel.json` but the landing still links `/features.html` (or vice versa) - one of the two 404s.

### FEAT-008 - Page is fully readable with JavaScript disabled
**P2** * Edge * `features.html:378-382`

- **Pre:** Disable JavaScript in DevTools settings.
- **Steps:**
  1. Reload `/features.html`.
  2. Scroll and click two TOC pills.
- **Expect:** All content, images and links work. The only loss is the header's hairline border on scroll (`header.scrolled`). Anchor jumps still work (native `href="#id"`).
- **Watch:** A future rework moves section content behind a JS-driven accordion/tab, silently emptying the page for crawlers and no-JS users.

---

## 2. Sticky header and top nav

### FEAT-009 - Brand lockup links home
**P0** * Functional * `features.html:117`

- **Pre:** Page loaded.
- **Steps:**
  1. Confirm the header shows a blue hexagon logo (gradient `#3b6bff` to `#1636c9`) followed by the wordmark "PairedX" in the serif face.
  2. Click it.
- **Expect:** Navigates to `/` (the landing page root, not `/#features`). The inline SVG carries `aria-hidden="true"` so a screen reader announces only "PairedX".
- **Watch:** The logo's `fill="url(#g)"` reference breaks when the `<defs>` gradient id is renamed or duplicated, leaving a flat blue hexagon.

### FEAT-010 - "Home" nav link
**P1** * Functional * `features.html:119`

- **Pre:** Page loaded on a viewport wider than 640px.
- **Steps:**
  1. Click "Home" in the header nav.
- **Expect:** Goes to `/#features` - i.e. the landing page, scrolled to its features section (which exists: `index.html` has `id="features"`).
- **Watch:** The label says "Home" but the target is a mid-page anchor; if `#features` is ever removed from the landing, this silently lands at the top with no error.

### FEAT-011 - "GitHub" nav link
**P1** * Functional * `features.html:120`

- **Pre:** Page loaded, viewport wider than 640px.
- **Steps:**
  1. Click "GitHub" in the header.
- **Expect:** Opens `https://github.com/trojanuary/pair`.
- **Watch:** Unlike the landing page (which uses `target="_blank" rel="noopener noreferrer"` on the same link), this one has no `target`, so it replaces the tab. Flag any inconsistency introduced in either direction.

### FEAT-012 - "Open app" pill is the primary header CTA
**P0** * Functional * `features.html:121,35-36`

- **Pre:** Page loaded.
- **Steps:**
  1. Confirm the rightmost header item is a solid blue pill labelled exactly "Open app".
  2. Hover it.
  3. Click it.
- **Expect:** Background `#2555F5`, white text, 10px radius. On hover it darkens to `#1B44D6` and gains **no** underline (`text-decoration:none` on `.enter:hover`). Click loads the app at `/app`.
- **Watch:** The generic `a:hover{text-decoration:underline}` wins over `.enter:hover` after a CSS reorder, and the pill grows an underline.

### FEAT-013 - "Open app" reaches the real app
**P0** * Functional * `vercel.json`, `app.html:1`

- **Pre:** Deployed environment.
- **Steps:**
  1. Click "Open app".
  2. Wait for the workspace to render.
- **Expect:** `/app` is rewritten to `/app.html` and the three-pane workspace loads (library, reader, notes) with the bundled sample paper.
- **Watch:** On any host without the `vercel.json` rewrite (GitHub Pages, plain static hosting, `file://`), `/app` 404s while `/app.html` works. Test this on the actual target host, not just Vercel.

### FEAT-014 - Header is sticky and translucent over content
**P1** * Visual * `features.html:28-30`

- **Pre:** Page loaded.
- **Steps:**
  1. Scroll to the middle of the page.
  2. Watch the header while a screenshot passes underneath it.
- **Expect:** The header stays pinned at the top (`position:sticky;top:0;z-index:50`), 68px tall, with a blurred/saturated translucent paper background so content is faintly visible through it.
- **Watch:** `backdrop-filter` is unsupported or disabled (older Firefox, some privacy settings) and the header becomes semi-transparent without blur - text underneath shows through and is unreadable.

### FEAT-015 - Header border appears only after scrolling
**P1** * State * `features.html:29,380-381`

- **Pre:** Page loaded at scroll position 0.
- **Steps:**
  1. At the very top, look at the bottom edge of the header - there must be no line.
  2. Scroll down a few pixels (past 4px).
  3. Scroll back to the very top.
- **Expect:** At `scrollY <= 4` the border is transparent. Past 4px the class `scrolled` is added and a 1px `#E7DECD` border fades in over `.3s`. Returning to the top removes it again.
- **Watch:** The `{passive:true}` scroll listener is replaced by something heavier and the border flickers or lags on trackpad scroll.

### FEAT-016 - Header nav collapses at 640px
**P1** * Visual * `features.html:37`

- **Pre:** Page loaded.
- **Steps:**
  1. Resize the viewport to 641px, then to 640px, then to 390px.
- **Expect:** At <=640px both "Home" and "GitHub" (class `hide-sm`) disappear; the brand and the "Open app" pill remain, on one line, with no overflow or wrapping.
- **Watch:** A new nav item is added without `class="hide-sm"` and pushes the "Open app" pill off-screen on a phone.

---

## 3. Hero copy

### FEAT-017 - Hero eyebrow, headline and line break
**P0** * Copy * `features.html:126-127`

- **Pre:** Page loaded, viewport >= 1024px.
- **Steps:**
  1. Read the three hero elements top to bottom.
- **Expect:** Blue uppercase letter-spaced eyebrow `"Everything it does"`; then the serif `h1` reading `"The whole feature set,"` on line one and `"at a glance."` on line two (a hard `<br>`), centered.
- **Watch:** The `<br>` is removed during a copy edit and the headline reflows to an awkward break like "The whole feature / set, at a glance."

### FEAT-018 - Hero sub-paragraph
**P0** * Copy * `features.html:128`

- **Pre:** Page loaded.
- **Steps:**
  1. Read the paragraph under the headline.
- **Expect:** Exactly: `"A source-linked AI reading workspace — every highlight, note, screenshot, and answer stays pinned to the exact spot it came from. Private, portable, yours."` Grey (`#6E655A`), 18px, centered, capped at 640px wide.
- **Watch:** Em dashes get normalised to hyphens by an editor, or the max-width is lost and the line runs the full 1240px wrap width.

### FEAT-019 - Headline scales fluidly
**P2** * Visual * `features.html:42`

- **Pre:** Page loaded.
- **Steps:**
  1. Resize the viewport from 1600px down to 320px, watching the `h1`.
- **Expect:** Font size scales smoothly via `clamp(34px,5vw,54px)` - never smaller than 34px, never larger than 54px, always two lines, never clipped or overlapping the eyebrow.
- **Watch:** At 320px the second line "at a glance." collides with the TOC pills because line-height 1.05 leaves no room after a copy change.

### FEAT-020 - Hero claim is honest about the product
**P1** * Regression * `features.html:128` vs `src/app.js:861 newAnnotation()`, `src/app.js:1162 drawConnector()`

- **Pre:** App open at `/app` with the sample paper.
- **Steps:**
  1. Highlight a passage, add a note, capture a screenshot, and ask the AI something.
  2. Confirm each of the four artifacts (highlight, note, screenshot, answer) is stored with a page number and rects and draws a connector back to its source.
- **Expect:** Every one of the four things the hero names really is pinned to a source location. No artifact type is orphaned in the notes panel with no page/connector.
- **Watch:** A new note type (for example a document-level question, `source_type:'doc'`, which has no rects) makes the blanket claim "every ... stays pinned to the exact spot" partly false.

---

## 4. In-page anchor nav (tocbar)

### FEAT-021 - The nine TOC pills, labels and order
**P0** * Copy * `features.html:130`

- **Pre:** Page loaded.
- **Steps:**
  1. Read the pill row under the hero paragraph, left to right.
- **Expect:** Exactly nine pills in this order: `"Annotate"`, `"Source-linked"`, `"Ask AI"`, `"Agent"`, `"Notes"`, `"Library"`, `"Share & export"`, `"Your model"`, `"Everything else"`. Each is a rounded (99px) card-coloured chip with a 1px border.
- **Watch:** A new feature section is added below without a matching pill, or a pill is added whose `href` targets an id that does not exist.

### FEAT-022 - Every TOC pill jumps to its section
**P0** * Functional * `features.html:130` -> `features.html:152,170,178,188,208,218,228,236,268`

- **Pre:** Page loaded at the top.
- **Steps:**
  1. Click each pill in turn, returning to the top between clicks.
  2. After each, confirm the heading that scrolls into view.
- **Expect:** Annotate -> `"Highlight text or box a figure."`; Source-linked -> `"Every note ties back to its exact spot."`; Ask AI -> `"Answers pinned to the source."`; Agent -> `"Watch every step it took."`; Notes -> `"Show what matters on the card."`; Library -> `"A real multi-document library."`; Share & export -> `"Send a whole annotated paper."`; Your model -> `"Your model, your key."`; Everything else -> `"And everything else"`.
- **Watch:** A section id is renamed (`#byo`, `#linked` are the non-obvious ones) and its pill becomes a no-op that just adds a dead hash to the URL.

### FEAT-023 - Anchor targets are not hidden under the sticky header
**P1** * Visual * `features.html:20,28,64`

- **Pre:** Page loaded at the top, viewport >= 1024px.
- **Steps:**
  1. Click the "Agent" pill.
  2. Look at the top of the viewport once scrolling settles.
- **Expect:** The section's eyebrow ("Inspectable agent") and `h2` are fully visible, not tucked under the 68px sticky header.
- **Watch:** There is **no** `scroll-margin-top` / `scroll-padding-top` anywhere in this file, so with `scroll-behavior:smooth` the target row can settle with its first line clipped by the header. Verify at 1440px, 1024px and 390px - the header is the same height at all three, so the clipping is worst on short screens.

### FEAT-024 - Anchor navigation is smooth, not jumpy
**P2** * Visual * `features.html:20`

- **Pre:** Page loaded at top.
- **Steps:**
  1. Click "Everything else" (the furthest target).
- **Expect:** A smooth animated scroll (`html{scroll-behavior:smooth}`), ending on the `#all` band.
- **Watch:** With a long page and many images still decoding, the smooth scroll overshoots or lands short because image heights change mid-animation.

### FEAT-025 - Cold deep-link to a section
**P1** * Functional * `features.html:152-266`

- **Pre:** No page open.
- **Steps:**
  1. Paste `https://<host>/features.html#templates` into a fresh tab and load.
  2. Repeat with `#ocr` and `#storage`.
- **Expect:** Each loads and lands on the named section without needing a second scroll, with images above it either loaded or reserving space.
- **Watch:** Because no image has `width`/`height` attributes, images above the anchor finish decoding after the jump and push the target down - the reader ends up above (or far below) the intended section.

### FEAT-026 - Sections with no TOC pill are still reachable
**P2** * Regression * `features.html:130` vs `162,198,246,256`

- **Pre:** Page loaded.
- **Steps:**
  1. Note that `#ocr`, `#figures`, `#templates` and `#storage` have **no** pill in the TOC bar.
  2. Scroll the page manually and confirm all four sections exist and render.
- **Expect:** All 12 feature sections render in DOM order: annotate, ocr, linked, ai, agent, figures, notes, library, share, byo, templates, storage. The four un-linked ones are reachable only by scrolling or by direct hash.
- **Watch:** This gap is intentional today (nine pills for twelve sections). If a rework adds pills, verify the order still matches DOM order or the nav starts scrolling backwards.

### FEAT-027 - Unknown / non-section hash does not break the page
**P2** * Edge * `features.html:117`

- **Pre:** No page open.
- **Steps:**
  1. Load `https://<host>/features.html#g`.
  2. Load `https://<host>/features.html#does-not-exist`.
- **Expect:** Both render normally at the top of the page. `#g` is the **SVG gradient id inside the header logo**, not a section - the browser must not scroll to it, hide it, or break the logo fill.
- **Watch:** A browser scrolls the sticky header's inner SVG into view for `#g`, leaving the page in an odd offset state; or a second `id="g"` is introduced elsewhere and the logo gradient renders flat.

### FEAT-028 - TOC pill hover state
**P2** * Visual * `features.html:45-46`

- **Pre:** Pointer device.
- **Steps:**
  1. Hover each pill.
- **Expect:** Border changes to blue `#2555F5` and the label turns blue; **no** underline appears (`text-decoration:none` on `.tocbar a:hover`). Non-hovered pills keep the `#E7DECD` border and ink text.
- **Watch:** The default `a:hover{text-decoration:underline}` leaks through and every pill gets an underline on hover.

---

## 5. Annotated hero screenshot and legend

### FEAT-029 - Hero screenshot renders framed
**P0** * Visual * `features.html:133-134,49-50`

- **Pre:** Page loaded, viewport >= 1280px.
- **Steps:**
  1. Look at the large screenshot below the TOC pills.
- **Expect:** `01-workspace.jpg` at full container width (max 1200px), 1px `#E7DECD` border, 16px radius, soft drop shadow. `alt="The PairedX workspace"`.
- **Watch:** The image loads at natural size before CSS applies and briefly blows past the wrap width on slow connections.

### FEAT-030 - Five numbered callout dots sit on the right UI regions
**P0** * Visual * `features.html:135-139`

- **Pre:** Page loaded, viewport >= 1280px.
- **Steps:**
  1. Locate the dots at left/top: 1 at 8%/34%, 2 at 50%/3.5%, 3 at 34%/52%, 4 at 71.5%/40%, 5 at 88%/95%.
  2. Check each points at the UI region the legend names.
- **Expect:** Dot 1 over the left library sidebar, 2 over the reader toolbar, 3 over the page body with highlights and pins, 4 over the notes panel, 5 over the bottom composer.
- **Watch:** Percentages are hard-coded against one screenshot. Re-capturing the workspace at a different aspect ratio silently detaches every dot from its target - dot 5 (top:95%) is the first to fall outside the frame.

### FEAT-031 - Dot colour ramp matches the legend badges
**P2** * Visual * `features.html:53-57,60`

- **Pre:** Page loaded.
- **Steps:**
  1. Compare each dot's fill with the badge of the same number in the legend row.
- **Expect:** A five-step green ramp, light to dark: 1 `#6BB48C`, 2 `#52A279`, 3 `#3E9266`, 4 `#2F8155`, 5 `#246E47`. Dots are 26px with a 2.5px white ring; legend badges are 20px, no ring.
- **Watch:** The rules use `:nth-of-type` for dots but `:nth-child` for legend spans. Wrapping a dot in a container, or adding any non-`span` child to `.legend`, desynchronises the two ramps.

### FEAT-032 - Legend copy
**P1** * Copy * `features.html:141-147`

- **Pre:** Page loaded.
- **Steps:**
  1. Read all five legend entries.
- **Expect:** Exactly: `"1 Library — your documents"`, `"2 Tools — highlight, comment, screenshot"`, `"3 The paper, with highlights & numbered pins"`, `"4 Source-linked notes & AI answers"`, `"5 Ask about the whole document"`.
- **Watch:** `&amp;` entities get double-escaped after an edit and the page literally prints `&amp;` inside "highlights &amp; numbered pins".

### FEAT-033 - Legend claims are true of the shipped app
**P1** * Regression * `features.html:142-146` vs `app.html:16-41,60-65,88-113,106-112`, `src/app.js:1116 drawPins()`

- **Pre:** App open at `/app`.
- **Steps:**
  1. Confirm the left sidebar is the document library (Home / Recents / Starred / Trash + "My Library").
  2. Confirm the toolbar has highlight, comment and screenshot tools.
  3. Confirm highlights draw on the page and pins are numbered.
  4. Confirm the notes panel shows source-linked notes and AI answers.
  5. Type a question in the bottom composer (placeholder `"Ask about this document…"`) and send.
- **Expect:** All five legend statements hold. The bottom composer really does ask about the whole document (`askAboutDocument()`, `src/app.js:1669`).
- **Watch:** The composer placeholder in `app.html:109` is `"Select text or a figure to start a note…"` but `wire()` overwrites it to `"Ask about this document…"` at runtime (`src/app.js:3165`). If that wiring is dropped, legend item 5 stops being true.

### FEAT-034 - Hero screenshot shows the current bundled sample
**P1** * Regression * `features.html:134` vs `src/app.js:38 SAMPLE_DOC_NAME`

- **Pre:** Open `docs/screenshots/01-workspace.jpg` at full size next to a fresh `/app` in an incognito window.
- **Steps:**
  1. Read the document name in the screenshot's library sidebar and the paper title in its reader.
  2. Compare with the sample the app actually ships.
- **Expect:** They should match. **Today they do not:** the screenshot shows `"NIPS-2017-attentio"` / "Attention Is All You Need", while the app bundles `"BERT — Devlin et al. 2019 (NAACL).pdf"`. Treat as an open defect and re-verify after any screenshot refresh.
- **Watch:** The same stale sample appears in `feat-library.jpg`. Changing `SAMPLE_DOC_NAME` or `SEED_VERSION` without re-capturing leaves the marketing page showing a paper the user will never see.

### FEAT-035 - Legend wraps cleanly on narrow screens
**P2** * Visual * `features.html:58-60`

- **Pre:** Page loaded.
- **Steps:**
  1. Resize from 1200px down to 390px, watching the legend row.
- **Expect:** Entries wrap onto multiple centered lines (`flex-wrap`, `gap:8px 20px`, max-width 900px). Badge and text of one entry never split across lines.
- **Watch:** At ~700px an entry breaks between its badge and label, leaving an orphan number on its own line.

---

## 6. Row and band layout mechanics

### FEAT-036 - Twelve feature sections in the right order with the right ids
**P0** * Functional * `features.html:152,162,170,178,188,198,208,218,228,236,246,256`

- **Pre:** Page loaded.
- **Steps:**
  1. Scroll from the hero to the "And everything else" band, listing section ids in the DOM inspector.
- **Expect:** `annotate`, `ocr`, `linked`, `ai`, `agent`, `figures`, `notes`, `library`, `share`, `byo`, `templates`, `storage` - in that order. Three of them are full-width `.band` sections (ocr, linked, share); the other nine are two-column `.row`s.
- **Watch:** A duplicate id after a copy-paste - the second one becomes unreachable by anchor and the TOC pill jumps to the wrong section.

### FEAT-037 - Alternating (reversed) rows on wide screens
**P1** * Visual * `features.html:65,188,208,246`

- **Pre:** Viewport >= 1024px.
- **Steps:**
  1. Check which side the copy sits on for each `.row`.
- **Expect:** Copy on the **left** for annotate, ai, figures, library, byo, storage. Copy on the **right** for agent, notes, templates (class `row rev`, which sets `.copy{order:2}`). Screenshots take the opposite column.
- **Watch:** A new row is inserted without alternating and two adjacent sections both put copy on the left, breaking the visual rhythm.

### FEAT-038 - Rows stack copy-first below 820px
**P1** * Visual * `features.html:111`

- **Pre:** Page loaded.
- **Steps:**
  1. Resize to 821px, then to 820px, then to 390px.
  2. Inspect the three `rev` rows (agent, notes, templates) at each width.
- **Expect:** At <=820px every row becomes a single column with 22px gap, and the `order:0` reset makes the **copy appear above the screenshot** even on `rev` rows.
- **Watch:** The `order:0` override is dropped in a refactor and the three `rev` rows show a screenshot with no context above it on mobile.

### FEAT-039 - Tall screenshots crop with a bottom fade
**P1** * Visual * `features.html:75-76,185,195,205,215,225,243,253`

- **Pre:** Viewport >= 1024px.
- **Steps:**
  1. Inspect the shots in ai, agent, figures, notes, library (`shot tall sm`) and byo, templates (`shot tall pad`).
- **Expect:** Each is capped at 430px tall with the overflow hidden, and a 62px gradient at the bottom fading the cut edge out so the crop does not look like a hard slice.
- **Watch:** `overflow:hidden` on `.shot` is removed and the images overflow their frames, pushing into the next section.

### FEAT-040 - Fade colour matches the frame background on padded tall shots
**P2** * Visual * `features.html:76-78,243,253`

- **Pre:** Viewport >= 1024px, zoom in on the bottom edge of the "Your model, your key." and "Tune every prompt." screenshots.
- **Steps:**
  1. Compare the fade's end colour with the surrounding frame fill.
- **Expect:** No visible colour seam at the bottom of the crop.
- **Watch:** `.shot.tall::after` fades to `var(--card)` (`#FDFBF6`) but `.shot.pad` sets the frame background to `var(--paper)` (`#F7F3EA`) - the two `shot tall pad` frames can show a faint lighter band where the gradient ends.

### FEAT-041 - Full-width bands are centered and capped
**P1** * Visual * `features.html:80-84,167,175,233`

- **Pre:** Viewport >= 1400px.
- **Steps:**
  1. Inspect the ocr, linked and share bands.
- **Expect:** Centered text, lead capped at 620px, chip row centered and capped at 680px, and the screenshot capped at 1180px and centered - noticeably wider than the two-column row screenshots (470px / 330px).
- **Watch:** A band screenshot inherits `.row .shot{max-width:470px}` after a selector change and the "big screenshot" bands lose their impact.

### FEAT-042 - Section dividers are single hairlines
**P2** * Visual * `features.html:64,80,87`

- **Pre:** Page loaded.
- **Steps:**
  1. Scroll past every section boundary at 100% zoom.
- **Expect:** Exactly one 1px `#E7DECD` line between consecutive sections (`.row` and `.band` each carry `border-top`), and one at the top of the `.all` band. No doubled 2px lines, none above the first row.
- **Watch:** Adding a wrapper div between sections produces two stacked borders that read as a thick grey bar.

---

## 7. Section: Read and annotate (#annotate)

### FEAT-043 - Copy block
**P0** * Copy * `features.html:154-156`

- **Pre:** Navigate to `#annotate`.
- **Steps:**
  1. Read eyebrow, heading and lead.
- **Expect:** Eyebrow `"Read & annotate"`; heading `"Highlight text or box a figure."`; lead `"Select text for a quick Highlight · Note · Ask AI popover, drop a point comment anywhere, or screenshot a figure/equation to ask about it directly."` with "Highlight · Note · Ask AI" bold and a non-breaking space inside "Ask AI".
- **Watch:** The `&nbsp;` in "Ask&nbsp;AI" is lost and "Ask" / "AI" break across two lines mid-phrase.

### FEAT-044 - Chip row
**P1** * Copy * `features.html:157`

- **Pre:** At `#annotate`.
- **Steps:**
  1. Read the five chips left to right.
- **Expect:** `"Highlight"`, `"Comment"`, `"Screenshot a region"`, `"Continuous or single page"`, `"Find in document"` - each a bordered 8px-radius card chip, wrapping onto a second line as needed.
- **Watch:** Chips overflow their column at 900-1000px instead of wrapping, because `flex-wrap` is dropped from `.chips`.

### FEAT-045 - CLAIM: the selection popover really offers Highlight / Note / Ask AI
**P0** * Regression * `features.html:156` vs `app.html:119-123`, `src/app.js:813 onTextSelect()`, `3147-3149`

- **Pre:** `/app` open with the sample paper, cursor tool active.
- **Steps:**
  1. Drag-select a sentence in the PDF.
  2. Read the popover buttons.
  3. Click each in a separate trial.
- **Expect:** A dark popover with exactly three buttons: `"Highlight"`, `"Note"`, `"✦ Ask AI"`. Highlight creates a silent yellow highlight; Note and Ask AI open the notes panel with an expanded card.
- **Watch:** The popover never appears when the highlight tool is already active - `onTextSelect()` short-circuits to `highlightSelection()`. Test with the cursor tool selected.

### FEAT-046 - CLAIM: point comment and figure screenshot both exist
**P0** * Regression * `features.html:156-157` vs `app.html:63-64`, `src/app.js:906 setTool()`, `3104-3122`

- **Pre:** `/app` open with the sample paper.
- **Steps:**
  1. Click the comment tool (title `"Comment"`) and click anywhere on the page.
  2. Click the screenshot tool (title `"Screenshot region"`) and drag a box around a figure.
  3. Toggle `"Continuous scroll"` and confirm both still work.
  4. Press Ctrl/Cmd-F and confirm the find bar opens.
- **Expect:** Comment drops a numbered pin and toasts `"Comment placed — type your note below."`. Screenshot shows the capture bar `"Select area to capture"` with a `"Cancel"` link and creates a note with a thumbnail. Find bar placeholder is `"Find in document…"`.
- **Watch:** The comment click handler ignores clicks when a text selection exists; a stray selection makes the tool look dead.

### FEAT-047 - Illustration matches the shipped toolbar
**P1** * Regression * `features.html:159` vs `app.html:60-65`, `src/app.js:85`

- **Pre:** Open `docs/screenshots/03-toolbar.png` beside the live `/app` toolbar.
- **Steps:**
  1. Count the tool buttons in the screenshot's tool group.
  2. Count them in the app.
- **Expect:** They should match. **Today they do not:** the screenshot shows five tools including an "A" (text) tool, while the app ships four - Select, Highlight, Comment, Screenshot. The text tool was retired (`migrateState` maps `ui.tool === 'text'` to `'cursor'`). Also note the screenshot's `alt` already says only "select, highlight, comment, screenshot tools".
- **Watch:** Any future toolbar change (adding a tool, reordering, changing the active-blue treatment) silently invalidates this crop again.

---

## 8. Section: Scanned PDFs (#ocr)

### FEAT-048 - Copy block
**P0** * Copy * `features.html:163-165`

- **Pre:** Navigate to `#ocr`.
- **Steps:**
  1. Read eyebrow, heading and lead.
- **Expect:** Eyebrow `"Scanned PDFs"`; heading `"Scanned? It reads the page for you — on your device."`; lead `"Open an image-only PDF and PairedX notices there's no selectable text, then offers one-tap OCR that runs entirely in your browser — your file is never uploaded. It rebuilds a real text layer, so search, highlights, and the AI all work like a normal PDF."` with "entirely in your browser" bold.
- **Watch:** Curly apostrophe in "there's" flattened to a straight quote, breaking typographic consistency with neighbouring sections.

### FEAT-049 - Chip row
**P1** * Copy * `features.html:166`

- **Pre:** At `#ocr`.
- **Steps:**
  1. Read the five chips.
- **Expect:** `"Auto-detected"`, `"On-device — nothing uploaded"`, `"Real selectable text"`, `"Highlightable & searchable"`, `"Cached — runs once"`, centered as a band chip row.
- **Watch:** Chips left-align because `.band .chips{justify-content:center}` was lost.

### FEAT-050 - CLAIM: auto-detection and the banner copy match the screenshot
**P0** * Regression * `features.html:166-167` vs `src/app.js:725 detectAndOfferOcr()`, `741 showOcrBanner()`

- **Pre:** A scanned, image-only PDF (for example the EPA "SAMPLE LETTER" shown in the illustration). `/app` open.
- **Steps:**
  1. Open the scanned PDF.
  2. Wait ~1-2s after the first render for detection to sample up to 8 pages.
- **Expect:** A dark top banner appears reading exactly `"This looks like a scanned PDF — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?"` with a blue `"Run OCR"` button and a dismiss `"✕"`. This is word-for-word what `feat-ocr-banner.jpg` shows.
- **Watch:** Detection requires >=50% of the sampled pages to be image-dominated; a scan with a large text watermark on every page can score under the threshold and never prompt. Also, dismissing sets `doc.ocrDismissed` permanently for that document - re-test with a fresh document, not a re-open.

### FEAT-051 - CLAIM: "your file is never uploaded" - but the engine is fetched from a CDN
**P0** * Regression * `features.html:165-166` vs `src/app.js:680 ensureTesseract()`, `693 createTesseractWorker()`, `707 ocrOnePage()`

- **Pre:** DevTools Network tab open, throttling off. A scanned PDF ready.
- **Steps:**
  1. Open the scanned PDF and click "Run OCR".
  2. Watch every outbound request during the whole run.
  3. Repeat the whole flow with the network offline after the page has loaded.
- **Expect:** **No** request carries the PDF bytes or any page image. The only outbound requests are the OCR engine assets: `cdn.jsdelivr.net/npm/tesseract.js@5.1.1/...`, `tesseract.js-core@5.1.1`, and language data from `tessdata.projectnaptha.com/4.0.0`. Offline, OCR fails with the error toast `"OCR could not run: …"` and the document remains readable.
- **Watch:** The claim "runs entirely in your browser - your file is never uploaded" is true of the *file*, but OCR still needs network for the engine. If a tester assumes fully offline OCR, they will file this as broken; conversely, if a future change POSTs page canvases to `/api/`, the claim becomes false and must be caught here.

### FEAT-052 - CLAIM: OCR rebuilds a real, selectable, highlightable text layer
**P1** * Regression * `features.html:165-166` vs `src/app.js:644 buildOcrTextLayer()`, `662 applyOcrLayer()`, `669 applyOcrToRendered()`

- **Pre:** OCR completed on a scanned PDF (toast `"OCR complete — N pages now searchable & highlightable."`).
- **Steps:**
  1. Drag-select a line of the scanned page.
  2. Highlight it, then reload the page and confirm the highlight lands in the same place.
  3. Press Ctrl/Cmd-F and search for a word visible on the page.
  4. Ask the AI a question about that page.
- **Expect:** Text selects with sane geometry, highlights anchor to the right rectangles across reloads, find matches the word, and the AI answer references the page's real content.
- **Watch:** Word boxes are scaled with `transform:scaleX()`; a zoom change mid-OCR can leave selection rectangles offset from the visible glyphs by a few pixels.

### FEAT-053 - CLAIM: "Cached — runs once"
**P1** * Regression * `features.html:166` vs `src/app.js:775`, `607 loadOcrStore()`, `727`

- **Pre:** OCR already completed on a scanned PDF.
- **Steps:**
  1. Reload `/app`.
  2. Switch to another document and back.
  3. Re-open the same PDF file from disk via "Open PDF or bundle".
- **Expect:** The OCR banner never reappears and the text layer is available immediately - results are cached in IndexedDB under `ocr:<sha256>`, so identity survives a rename or a different folder.
- **Watch:** A PDF opened before `crypto.subtle` was available (insecure context) has `sha === null`; `loadOcrStore(null)` returns nothing and the document re-OCRs every session.

### FEAT-054 - Cancelling a running OCR
**P2** * Edge * `src/app.js:753 runOcr()`

- **Pre:** A long scanned PDF (10+ pages).
- **Steps:**
  1. Click "Run OCR".
  2. While the banner reads `"Reading text… page N of M"`, click the button that has become `"Stop"`.
  3. Switch documents mid-run in a second trial.
- **Expect:** Stop shows `"Finishing current page…"`, then a toast `"OCR stopped — N pages done."`; pages already done stay searchable. Switching documents cancels the run without corrupting the other document's cache.
- **Watch:** The page-count in the banner counts only pages that need OCR, so on a mixed PDF "page 3 of 5" will not match the visible page number - do not file that as a bug.

---

## 9. Section: Source-linked (#linked)

### FEAT-055 - Copy and chips
**P0** * Copy * `features.html:171-174`

- **Pre:** Navigate to `#linked`.
- **Steps:**
  1. Read eyebrow, heading, lead and chips.
- **Expect:** Eyebrow `"Source-linked"`; heading `"Every note ties back to its exact spot."`; lead `"A connector line joins each card in the panel to the highlighted passage or captured figure it came from — click a note and the reader jumps right to it."`; chips `"Connector line"`, `"Numbered pins"`, `"Jump to source"`.
- **Watch:** The band's lead exceeds 620px after an edit and no longer reads as a centered two-line statement.

### FEAT-056 - CLAIM: the connector line exists and tracks
**P0** * Regression * `features.html:173` vs `src/app.js:1162 drawConnector()`, `app.html:125`

- **Pre:** `/app` with at least one highlight note; notes panel open.
- **Steps:**
  1. Select a note card.
  2. Scroll the notes panel, then scroll the reader, then resize the window.
- **Expect:** An SVG line joins the selected card to its highlight/figure on the page and redraws on every one of those interactions (`#connectors` overlay).
- **Watch:** The connector is drawn on `requestAnimationFrame` after render; in continuous mode with the source page scrolled out of view, the line can be drawn to an off-screen point and appear to vanish - verify it returns when the source scrolls back.

### FEAT-057 - CLAIM: clicking a note jumps the reader to its source
**P0** * Regression * `features.html:173` vs `src/app.js:1208 selectAnnotation()`, `1898`

- **Pre:** `/app` with notes on at least three different pages.
- **Steps:**
  1. From page 1, click a compact card whose source is on a later page.
  2. Click a pin on the page and confirm the reverse direction.
- **Expect:** Clicking the card expands it and scrolls the reader to that page/passage. Clicking a pin reveals and scrolls the notes panel but deliberately does **not** move the reader (the pin is already visible).
- **Watch:** The asymmetry above is intended (`src/app.js:1128`). Do not file "clicking a pin doesn't scroll the page" as a bug; do file it if clicking a *card* fails to move the reader.

### FEAT-058 - CLAIM: pins are numbered in reading order
**P1** * Regression * `features.html:174` vs `src/app.js:1087 renumber()`

- **Pre:** `/app`, sample paper.
- **Steps:**
  1. Create notes out of order: one on page 3, then one on page 1, then one higher up on page 1.
  2. Read the pin numbers on the pages and the badges on the cards.
- **Expect:** Numbering re-sorts by page, then by vertical position, so pins read 1, 2, 3 top-to-bottom through the document regardless of creation order. Card badges match their pins.
- **Watch:** Document-level questions (`source_type:'doc'`) have no rects and therefore no pin, but still consume an anchor number - check the sequence has no visible gap on the page.

---

## 10. Section: Ask AI (#ai)

### FEAT-059 - Copy block
**P0** * Copy * `features.html:180-182`

- **Pre:** Navigate to `#ai`.
- **Steps:**
  1. Read eyebrow, heading and lead.
- **Expect:** Eyebrow `"Ask AI"`; heading `"Answers pinned to the source."`; lead `"Ask about any selection; the answer is saved as a note linked to that passage, with rendered math & code and a provenance panel showing exactly what it used."` with "math & code" and "provenance" bold.
- **Watch:** The bold `<b>` spans are dropped and the sentence loses its two emphasis anchors.

### FEAT-060 - Chip row
**P1** * Copy * `features.html:183`

- **Pre:** At `#ai`.
- **Steps:**
  1. Read the four chips.
- **Expect:** `"Source-linked answers"`, `"LaTeX & code"`, `"@ai mentions"`, `"Provenance chips"`.
- **Watch:** "@ai" is auto-linked by an editor into a mailto/mention and renders as a link inside a chip.

### FEAT-061 - CLAIM: the answer is saved as a note linked to the passage
**P0** * Regression * `features.html:182` vs `src/app.js:1351 askAI()`, `884 createFromSelection()`

- **Pre:** `/app`, AI reachable (shared key or your own key in Settings).
- **Steps:**
  1. Select a passage, click "✦ Ask AI", type a question, send.
  2. When the answer lands, reload the page.
- **Expect:** The answer is a message inside the note that carries the selection, with the quoted passage above it and a page/section line. It survives the reload.
- **Watch:** With no AI reachable the message shows an error body (red, prefixed by a warning glyph) and a toast; the note still exists. Confirm the *note* persists even when the answer fails - otherwise the claim breaks on a flaky network.

### FEAT-062 - CLAIM: math and code render
**P1** * Regression * `features.html:182-183` vs `src/app.js:2010 mathToken()`, `2051 ensureMathJax()`, `2007 codeBlockHTML()`

- **Pre:** `/app`, AI reachable.
- **Steps:**
  1. Ask a question whose answer includes an equation (for example about a formula in the paper) and one that returns a code block.
- **Expect:** Inline `\( … \)` and display `\[ … \]` LaTeX typeset via MathJax; fenced code renders as a formatted block, not raw backticks. Markdown tables, lists and bold also render.
- **Watch:** MathJax is loaded lazily from a CDN - on a blocked/offline network the answer shows raw LaTeX source. That is a graceful degradation, not a crash, but the page claim assumes it renders.

### FEAT-063 - CLAIM: the provenance panel shows what the answer used
**P0** * Regression * `features.html:182-183` vs `src/app.js:1811`, `1340 chipsFor()`, `1447 agentChips()`

- **Pre:** An AI answer in a note.
- **Steps:**
  1. Expand the collapsed disclosure under the answer.
- **Expect:** Summary reads `"AI-generated · <model> · sources"`; the body header is `"What this answer used"` followed by chips such as `"Page N"`, `"Used highlighted text"` / `"Used screenshot"`, and either `"Used web search"` or `"No external sources"`. Agent answers can add `"Read full paper"`, `"Searched document"`, `"Read related pages"`, `"Generated visual"`.
- **Watch:** The chip `"No external sources"` must flip to `"Used web search"` when web search is enabled in Settings; a stale chip is a provenance lie.

### FEAT-064 - CLAIM: @ai mentions
**P1** * Regression * `features.html:183` vs `src/app.js:1601 attachMentions()`, `1632`

- **Pre:** `/app`, a note with an expanded thread.
- **Steps:**
  1. Type `@ai what does this mean` into the in-thread composer.
  2. Watch the token as you type, then send.
- **Expect:** `@ai` is visibly highlighted while typing (mirrored backdrop), and sending always routes to the model - even for a phrase the intent router would otherwise treat as a personal note.
- **Watch:** Only `@ai` is highlighted. Older provider mentions (`@gpt`, `@claude`, `@gemini`) named in the code comment are **not** implemented; if the page ever advertises them, that is an over-promise.

---

## 11. Section: Inspectable agent (#agent)

### FEAT-065 - Copy block, including the quoted phrase
**P0** * Copy * `features.html:190-192`

- **Pre:** Navigate to `#agent`.
- **Steps:**
  1. Read eyebrow, heading and lead.
- **Expect:** Eyebrow `"Inspectable agent"`; heading `"Watch every step it took."`; lead `"For deeper questions the AI reads other pages, searches the document, scans the outline, or searches the web — and you can open “the agent's work” to see each call."` - with curly double quotes around the bolded phrase.
- **Watch:** The curly quotes are replaced by straight ones, or the phrase drifts from the app's actual summary text (see FEAT-067).

### FEAT-066 - Chip row lists the real tools
**P1** * Copy * `features.html:193`

- **Pre:** At `#agent`.
- **Steps:**
  1. Read the five chips.
- **Expect:** `"Read page"`, `"Search document"`, `"Outline"`, `"Web search"`, `"Create visual"`.
- **Watch:** These map to `read_page`, `search_document`, `document_outline`, `web_search`, `create_visual` in `agentTools()` (`src/app.js:1415`). Two shipped tools are deliberately not chipped here - `read_selection_context` and `read_full_document` - so the list under-promises rather than over-promises. Flag if a tool is *removed* from the code while its chip stays.

### FEAT-067 - CLAIM: the agent trace is openable and shows each call
**P0** * Regression * `features.html:192` vs `src/app.js:1939 traceHTML()`

- **Pre:** `/app` with OpenRouter (or compat) as the default provider and a text selection (not a screenshot - screenshots skip the agent loop).
- **Steps:**
  1. Ask a question that needs other pages, e.g. "summarise the whole paper".
  2. Watch the status line while it works.
  3. Expand the disclosure at the bottom of the answer.
- **Expect:** Live statuses cycle through `"Thinking…"`, `"Gathering context…"` and tool labels such as `"Reading a page…"`, `"Searching the document…"`, `"Scanning the outline…"`, `"Reading the full paper…"`, `"Creating a visual…"`, `"Searching the web…"`. The disclosure summary reads `"Show the agent's work · N tool calls"` (singular `"1 tool call"`), and inside: `"Tools called: …"` or `"No tools were needed — answered directly from the context."`, then numbered steps with `"Input"` / `"Result"` panes.
- **Watch:** The page says "the agent's work"; the app says "Show the agent's work". Keep them consistent. Also: a screenshot-sourced note never uses the agent, so its answer has no tool calls - do not file that as a missing trace.

### FEAT-068 - CLAIM: tool toggles gate what the agent can do
**P1** * Regression * `features.html:193` vs `src/app.js:1423-1424`, `2782-2784`

- **Pre:** `/app`, Settings open on "AI & Tools".
- **Steps:**
  1. Turn off `"Enable generated visuals"` and `"Allow external web search (changes provenance to “Used web search”)"`, save.
  2. Ask a question that would normally trigger a visual and one that would need the web.
- **Expect:** With both off, `create_visual` and `web_search` are not offered to the model at all, and provenance shows `"No external sources"`.
- **Watch:** A cached page keeps the old tool list in an in-flight request; re-ask after saving rather than judging from an answer that started before the toggle.

### FEAT-069 - Illustration matches the shipped trace UI
**P2** * Visual * `features.html:195`

- **Pre:** Open `docs/screenshots/06-agent-trace.jpg` beside a live expanded trace.
- **Steps:**
  1. Compare the step numbering, the tool-name treatment and the Input/Result labels.
- **Expect:** Same structure and labels. The crop is a `shot tall sm` (330px wide, 430px tall with a bottom fade), so only the top of the trace is visible - that is intended.
- **Watch:** A restyle of `.tr-step` / `.tr-h` in `src/styles.css` makes the screenshot visibly older than the product.

---

## 12. Section: Figures and visuals (#figures)

### FEAT-070 - Copy and chips
**P0** * Copy * `features.html:200-203`

- **Pre:** Navigate to `#figures`.
- **Steps:**
  1. Read eyebrow, heading, lead and chips.
- **Expect:** Eyebrow `"Figures & visuals"`; heading `"Capture a figure — or generate one."`; lead `"Screenshot any figure or equation and ask about it. The AI can also generate an image or a text/ASCII diagram to explain a concept, grounded in the paper."` with "generate an image" bold; chips `"Figure capture"`, `"Generated images"`, `"ASCII diagrams"`, `"Takeaways"`.
- **Watch:** "text/ASCII" gets auto-linked or hyphenated by an editor.

### FEAT-071 - CLAIM: screenshot a figure and ask about it
**P0** * Regression * `features.html:202` vs `app.html:64,80-83`, `src/app.js:917 initCaptureMask()`, `1295 imageEvidence()`

- **Pre:** `/app`, sample paper open at a page with a figure.
- **Steps:**
  1. Pick the screenshot tool, drag a box over a figure.
  2. Ask a question in the resulting note.
- **Expect:** The capture bar reads `"Select area to capture"` with `"Cancel"`. The note shows a thumbnail, its source label is `"Screenshot"`, and the AI answer references the captured image (the image is sent as evidence to `/api/ai`).
- **Watch:** Screenshot notes bypass the agent loop entirely (`src/app.js:1359`), so their provenance shows `"Used screenshot"` and no tool calls. That is correct behaviour.

### FEAT-072 - CLAIM: generated image vs ASCII diagram, with the right badge
**P1** * Regression * `features.html:202-203` vs `src/app.js:1535 generateVisual()`, `1815-1827`

- **Pre:** `/app` with visuals enabled and an image-capable provider.
- **Steps:**
  1. Ask "illustrate this concept as a picture" on a selection.
  2. Ask "show the main results as a diagram" on the same selection.
- **Expect:** The first produces a card badged `"Generated image"` with a raster image; the second a card badged `"Diagram"` with a monospace `<pre>` block. Footers read `"AI-generated illustration · not extracted data"` or `"Text diagram from the document"`, followed by the model id.
- **Watch:** The planner deliberately forces results/numbers requests to ASCII even when the user says "image" - so "create an image of the main results" correctly returns a diagram. Do not file that as a routing bug.

### FEAT-073 - CLAIM: takeaways appear under a visual
**P1** * Regression * `features.html:203` vs `src/app.js:1824`, `1567`

- **Pre:** A generated visual in a note.
- **Steps:**
  1. Look below the image/diagram inside the visual card.
- **Expect:** A short bulleted takeaways list (2-4 items) grounded in the document, when the planner returned any.
- **Watch:** A truncated planner response yields no `takeaways` array; the card then shows the visual with no bullets. The chip on the features page claims "Takeaways" unconditionally - if the list is missing on *every* visual, the claim is broken.

---

## 13. Section: Notes your way (#notes)

### FEAT-074 - Copy and chips
**P0** * Copy * `features.html:210-213`

- **Pre:** Navigate to `#notes`.
- **Steps:**
  1. Read eyebrow, heading, lead and chips.
- **Expect:** Eyebrow `"Notes your way"`; heading `"Show what matters on the card."`; lead `"Check any message — say the AI's summary instead of your question — to show it in full on the collapsed card. Plus tags, resolve, filters, search, and sort."` with "in full" bold; chips `"Show on card"`, `"Tags"`, `"Resolve"`, `"Filter & search"`, `"Sort by time / page"`.
- **Watch:** "AI's" apostrophe flipped between curly and straight relative to the rest of the page.

### FEAT-075 - CLAIM: "Show on card" checkbox, with the exact tooltips
**P0** * Regression * `features.html:212` vs `src/app.js:1744 msgActions()`, `2198 toggleShowOnCard()`, `1865 compactCard()`

- **Pre:** `/app`, a note with a question and an AI answer, card expanded.
- **Steps:**
  1. Hover the checkbox on the AI answer's header and read the tooltip.
  2. Click it, hover again, read the tooltip.
  3. Collapse the note.
- **Expect:** Tooltip off: `"Show this on the collapsed card"`; on: `"Showing on the collapsed card — click to hide"`. When on, the collapsed card shows that message **in full** (no 2-line clamp) with an `"AI"` tag pill; unchecked, it falls back to a clamped preview of the first question/answer.
- **Watch:** A user message shows a `"You"` pill instead of `"AI"`. If nothing is checked, the fallback preview must still render - an empty compact card is the failure mode.

### FEAT-076 - CLAIM: tags, resolve, filter, search, sort all exist
**P1** * Regression * `features.html:212-213` vs `src/app.js:1723 tagPills()`, `2220 annMenu()`, `2247 FILTERS`, `3154-3159`, `3173`

- **Pre:** `/app` with several notes.
- **Steps:**
  1. Add a manual tag via `"+ tag"` and remove it with the `×`.
  2. Resolve a note from its menu, confirm `"✓ Resolved"` shows on the card.
  3. Open the funnel popover and switch filters.
  4. Open notes search and type a term.
  5. Click the sort button in the notes footer.
- **Expect:** Tag prompt lists the suggested tags. Filter popover shows `"Show"` then `"All notes"`, `"Unresolved"`, `"Screenshots"`, `"AI replies"`, `"Questions"`, then `"Sort"` with `"By time"` / `"By page order"`, then `"Auto-scroll to active note"`. Search placeholder is `"Search notes, answers, tags…"`. Footer button toggles between `"Sorted by time ▾"` and `"Sorted by page ▾"`.
- **Watch:** The notes-count line reads `"N notes"` plus the active filter label; a filter with zero matches must show `"No notes match this filter."`, not an empty panel.

### FEAT-077 - Illustration matches the shipped compact card
**P2** * Visual * `features.html:215`

- **Pre:** Open `docs/screenshots/feat-show-on-card.jpg` beside a live collapsed card with a checked AI answer.
- **Steps:**
  1. Compare the badge, the "AI" pill, the time position and the page/section line.
- **Expect:** Same layout: number badge, time top-right, full answer body, then `"Page N · Section …"`.
- **Watch:** A restyle of `.cc-tag` / `.cc-badge` colours (blue for text notes, green for screenshots) makes the crop stale.

---

## 14. Section: Your library (#library)

### FEAT-078 - Copy and chips
**P0** * Copy * `features.html:220-223`

- **Pre:** Navigate to `#library`.
- **Steps:**
  1. Read eyebrow, heading, lead and chips.
- **Expect:** Eyebrow `"Your library"`; heading `"A real multi-document library."`; lead `"Home, Recents, Starred, and Trash. Star, trash, restore, or delete — the same PDF opened again is recognized by content (SHA-256) so its notes just re-attach."`; chips `"Home / Recents / Starred / Trash"`, `"Content-addressed"`, `"Notes auto-attach"`.
- **Watch:** "recognized" vs "recognised" drifting from the rest of the site's spelling convention.

### FEAT-079 - CLAIM: the four library views exist and filter correctly
**P0** * Regression * `features.html:222` vs `app.html:25-30`, `src/app.js:357 docsForView()`, `368 renderTree()`

- **Pre:** `/app` with at least three documents, one starred and one trashed.
- **Steps:**
  1. Click Home, Recents, Starred, Trash in turn.
  2. Note the section label above the list each time.
- **Expect:** Label changes to `"My Library"`, `"Recents"`, `"Starred"`, `"Trash"`. Recents sorts by last opened; Starred shows only starred; Trash shows only trashed, most recently trashed first.
- **Watch:** Empty-state copy must be right per view: `"Trash is empty."`, `"No starred documents yet."`, and otherwise `"No documents yet — use “Open PDF or bundle” to add one."`

### FEAT-080 - CLAIM: star, trash, restore, delete
**P0** * Regression * `features.html:222` vs `src/app.js:325 toggleStar()`, `333 trashDoc()`, `340 restoreDoc()`, `346 purgeDoc()`

- **Pre:** `/app` with two or more documents.
- **Steps:**
  1. Hover a row and star it (tooltip `"Star"` / `"Unstar"`).
  2. Trash it (tooltip `"Move to trash"`), confirm the toast.
  3. In Trash, restore it (`"Restore"`), then trash and permanently delete it (`"Delete forever"`).
- **Expect:** Toasts read `"Moved “<name>” to Trash."` and `"Restored “<name>”."`. Permanent delete asks first: `"Permanently delete “<name>” and its N notes? This cannot be undone."` with a red `"Delete"` button.
- **Watch:** Trashing the **active** document must open the next available one rather than leaving a blank reader; with an empty library the reader must show `"Your library is empty"`.

### FEAT-081 - CLAIM: SHA-256 content addressing re-attaches notes
**P0** * Regression * `features.html:222-223` vs `src/app.js:181 sha256Hex()`, `219 openPdfFile()`

- **Pre:** `/app` served over HTTPS or localhost (`crypto.subtle` needs a secure context). A PDF with notes already in the library.
- **Steps:**
  1. Copy that PDF to another folder and rename it.
  2. Open the renamed copy via "Open PDF or bundle".
- **Expect:** No duplicate entry is created. Toast: `"Reopened <name> — same paper, your notes are here."` and all notes are present.
- **Watch:** Over plain `http://` on a LAN address, `crypto.subtle` is unavailable, `sha` is `null`, and the same paper duplicates every time - the claim silently fails only in that context.

### FEAT-082 - Illustration shows the current sample and sidebar chrome
**P2** * Regression * `features.html:225` vs `src/app.js:38`, `app.html:16-41`

- **Pre:** Open `docs/screenshots/feat-library.jpg` beside the live sidebar.
- **Steps:**
  1. Compare the buttons, nav items, storage meter and the document names.
- **Expect:** Buttons `"Open PDF or bundle"` and `"Share as HTML"`, nav Home/Recents/Starred/Trash, `"My Library"` section, `"Storage"` meter with a settings gear.
- **Watch:** Like the hero, this crop still shows the retired `"NIPS-2017-attentio"` sample instead of the BERT paper the app now bundles.

---

## 15. Section: Share and export (#share)

### FEAT-083 - Copy and chips
**P0** * Copy * `features.html:229-232`

- **Pre:** Navigate to `#share`.
- **Steps:**
  1. Read eyebrow, heading, lead and chips.
- **Expect:** Eyebrow `"Share & export"`; heading `"Send a whole annotated paper."`; lead `"Share as HTML bundles the PDF + notes into one self-contained file that opens anywhere (read-only) and re-opens in PairedX to keep editing. Or export a clean annotations PDF."` with "Share as HTML" and "PDF" bold; chips `"Single-file HTML"`, `"Round-trip editing"`, `"Export to PDF"`, `"Save / import notes JSON"`.
- **Watch:** The bolded "Share as HTML" must match the sidebar button label exactly (`app.html:23`).

### FEAT-084 - CLAIM: one self-contained HTML that opens anywhere
**P0** * Regression * `features.html:231` vs `src/app.js:2553 exportSelfContainedHTML()`

- **Pre:** `/app` with a document that has several notes, including a screenshot and a generated visual.
- **Steps:**
  1. Click "Share as HTML" in the left sidebar.
  2. Save the file (Chromium: a native Save As dialog; Firefox/Safari: a download).
  3. Open the saved file by double-clicking it, with the network **disconnected**.
- **Expect:** Toast during build: `"Building shareable file…"`, then `"Saved <name>.annotated.html — N.N MB, opens anywhere."` (or `"Exported …"` on the download path). Opened offline, the paper renders with highlights, pins, connectors, screenshots and answers. Analytics scripts are stripped from the bundle.
- **Watch:** The export fetches `/app.html`, `/src/styles.css`, `/vendor/*` and `/src/app.js` at runtime, so it only works on a served origin - never from `file://`. Also verify the shared file does not phone home (Network tab must stay empty).

### FEAT-085 - CLAIM: the shared file is read-only and carries a made-with banner
**P0** * Regression * `features.html:231` vs `src/app.js:3294 applyReadOnly()`

- **Pre:** A `.annotated.html` produced above, opened directly.
- **Steps:**
  1. Try to highlight, comment, screenshot, open Settings, or use the composer.
  2. Read the banner at the bottom.
- **Expect:** All editing affordances are hidden (open, tools, composer, save/import/clear notes, share, settings, storage meter). The banner reads exactly: `"Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX"` with "pairedx.com" linking to `https://pairedx.com/app`.
- **Watch:** A newly added toolbar button is not in the hide list in `applyReadOnly()` and leaks an editing control into a shared file.

### FEAT-086 - CLAIM: round-trip - re-open the shared file to keep editing
**P0** * Regression * `features.html:231-232` vs `src/app.js:279 importSharedHTML()`

- **Pre:** `/app` open; the `.annotated.html` from FEAT-084 on disk.
- **Steps:**
  1. Click "Open PDF or bundle" and pick the `.annotated.html`.
  2. Alternatively drag it onto the reader.
- **Expect:** It becomes a normal, editable library document. Toast: `"Opened <name> — N notes loaded. Keep annotating."` If the same paper is already present (same SHA), it merges instead of duplicating.
- **Watch:** A non-PairedX `.html` must fail gracefully with `"“<file>” isn’t a PairedX shared paper."` - not a blank reader.

### FEAT-087 - CLAIM: export a clean annotations PDF
**P1** * Regression * `features.html:231-232` vs `src/app.js:2846 openExport()`, `2881 buildSheet()`

- **Pre:** `/app` with several notes of mixed types.
- **Steps:**
  1. Click the PDF button in the notes header (title `"Export annotations to PDF"`).
  2. Toggle the include options and both layouts, watching the preview.
  3. Click `"⭳ Export PDF"`.
- **Expect:** Screen titled `"Export annotations"` with sub `"Create a clean PDF of comments, linked excerpts, AI replies, and screenshots."`; `"Include"` toggles `"Comments"`, `"Linked text"`, `"AI responses"`, `"Screenshots"`, `"Visuals"`; `"Layout"` options `"Detailed"` / `"Compact"`; `"Page size"` A4/Letter; `"Style"` Clean/Minimal; a `"← Back to document"` link. Export opens the browser print dialog. With everything unchecked the preview shows `"Nothing selected to export. Toggle include options or add notes."`
- **Watch:** "Page size" and "Style" selects are inert in the current build - they do not change the preview. If the features page ever claims configurable page size, that becomes an over-promise. Also `"Preview"` only toasts `"Live preview shown on the right."`

---

## 16. Section: Bring your own model (#byo)

### FEAT-088 - Copy and chips
**P0** * Copy * `features.html:238-241`

- **Pre:** Navigate to `#byo`.
- **Steps:**
  1. Read eyebrow, heading, lead and chips.
- **Expect:** Eyebrow `"Bring your own model"`; heading `"Your model, your key."`; lead `"OpenRouter (default) or any OpenAI-compatible endpoint. Your key stays in your browser and is sent per-request — never saved on a server. Toggle visuals and web search."` with "in your browser" bold; chips `"OpenRouter"`, `"OpenAI-compatible"`, `"BYO key"`, `"Tool toggles"`.
- **Watch:** A provider is added or removed in `PROVIDER_LABEL` (`src/app.js:49`) without updating this copy.

### FEAT-089 - CLAIM: OpenRouter is the default and compat is selectable
**P0** * Regression * `features.html:240` vs `src/app.js:57`, `2770-2778`, `2824`

- **Pre:** Fresh browser profile (clear `localStorage` for the origin), `/app` open.
- **Steps:**
  1. Open Settings, "AI & Tools" tab.
  2. Read the two provider blocks and which is marked Default.
  3. Switch the default to "OpenAI-compatible", save, reopen.
- **Expect:** `"OpenRouter"` is labelled `"· recommended"` and is Default on first run. The second block is `"OpenAI-compatible API"` with a Base URL field (placeholder `"Base URL — e.g. https://api.openai.com/v1"`), a key field, and text/image/router model fields. The Default radio persists across reopen.
- **Watch:** `migrateState` force-resets the provider to `openrouter` once per install via `_orDefaulted`; on an upgraded profile a previously chosen provider can appear to reset itself - verify on a *fresh* profile.

### FEAT-090 - CLAIM: the key stays in the browser and is sent per request
**P0** * Regression * `features.html:240` vs `src/app.js:1244 aiText()`, `2786`, `api/ai.js:7`

- **Pre:** `/app`, DevTools Network + Application tabs open.
- **Steps:**
  1. Paste a key into the OpenRouter field, save.
  2. Inspect `localStorage` key `srw_state_v1` and confirm the key is there.
  3. Ask the AI a question and inspect the `/api/ai` request body.
- **Expect:** The key is stored **only** in this browser's `localStorage`, and is sent per request as `userKey` in the POST body to the site's own `/api/ai` proxy, which forwards it upstream and never persists or echoes it back. With no user key, the request omits `userKey` and the server key is used.
- **Watch:** The page says "never saved on a server" - true - but the key does *transit* the proxy. Confirm no response body ever contains the key, and that the key is not appended to a URL query string (which would land in server logs).

### FEAT-091 - CLAIM: shared-key quota message is honest
**P1** * Regression * `features.html:240` vs `api/ai.js:33-34`, `src/app.js:1594 errHint()`

- **Pre:** No user key set (using the shared server key).
- **Steps:**
  1. Ask a question when the shared quota is exhausted (or simulate a 429 from the proxy).
- **Expect:** Error toast reads `"The site’s shared demo quota is used up right now — add your own key in Settings → AI & Tools to keep going (it stays in your browser and is never saved on our server)."` - it must not leak the site owner's billing message.
- **Watch:** With no server at all (opening the file directly), the hint becomes `"Could not reach the AI endpoint (/api/ai). …"` - a different, also-correct message.

### FEAT-092 - Illustration matches the shipped Settings > AI & Tools pane
**P2** * Visual * `features.html:243` vs `src/app.js:2765-2786`

- **Pre:** Open `docs/screenshots/feat-settings-ai.jpg` beside live Settings.
- **Steps:**
  1. Compare tab labels, provider blocks, model fields and the identity/tools sections.
- **Expect:** Tabs `"AI & Tools"`, `"Templates"`, `"Storage"`; provider blocks as in FEAT-089; `"Your identity (actor)"`; `"Tools"` with `"Enable generated visuals"` and `"Allow external web search (changes provenance to “Used web search”)"`.
- **Watch:** The default model strings shown in the crop (`openai/gpt-5.4`, etc.) go stale whenever `DEFAULT_MODELS` changes.

---

## 17. Section: Editable prompts (#templates)

### FEAT-093 - Copy and chips
**P0** * Copy * `features.html:248-251`

- **Pre:** Navigate to `#templates`.
- **Steps:**
  1. Read eyebrow, heading, lead and chips.
- **Expect:** Eyebrow `"Editable prompts"`; heading `"Tune every prompt."`; lead `"Edit the system prompts — even the agent's tool descriptions — under Settings → Templates, then export or import your whole set as JSON."` with "Settings → Templates" bold and non-breaking spaces around the arrow; chips `"System prompts"`, `"Tool descriptions"`, `"Export / import"`, `"Reset to default"`.
- **Watch:** The `&nbsp;` around `→` is lost and "Settings" / "→" / "Templates" break across a line.

### FEAT-094 - CLAIM: every system prompt is editable under Settings > Templates
**P0** * Regression * `features.html:250` vs `src/app.js:2676 PROMPT_KEYS`, `2717 templatesPaneHTML()`, `2839`

- **Pre:** `/app`, Settings open on the "Templates" tab.
- **Steps:**
  1. Count the rows under `"System prompts"`.
  2. Expand `"Text answers"`, change a word, press `"Save"`, then ask the AI something.
  3. Reopen Settings and confirm the row now shows the `"customized"` badge.
- **Expect:** Five prompt rows: `"Text answers"`, `"Images & diagrams"`, `"Diagram (text fallback)"`, `"Web search"`, `"Intent router"`. Edits apply after Save and persist. The intro hint reads `"…Changes apply after you press Save."`
- **Watch:** Edits only take effect on Save - a tester who edits and closes will see no change and may file a false bug.

### FEAT-095 - CLAIM: the agent's tool descriptions are editable too
**P0** * Regression * `features.html:250` vs `src/app.js:2690 TOOL_KEYS`, `2704 toolDesc()`, `2724`

- **Pre:** Settings > Templates.
- **Steps:**
  1. Scroll to the section headed `"Agent tools · ReAct — how the tool-using agent decides when to call each tool"`.
  2. Count the rows and expand one.
- **Expect:** Seven rows named for the tools: `read_selection_context`, `read_page`, `search_document`, `document_outline`, `read_full_document`, `create_visual`, `web_search`. Each has a textarea, a `"Reset to default"` button and the hint `"What the tool-using agent reads to decide when to call this tool. Only used while the tool-using agent runs."`
- **Watch:** A new tool added to `agentTools()` without a matching entry in `TOOL_KEYS` would ship an uneditable tool, quietly falsifying "even the agent's tool descriptions".

### FEAT-096 - CLAIM: export / import / reset the whole set
**P1** * Regression * `features.html:250-251` vs `src/app.js:2734 exportPrompts()`, `2746 importPrompts()`, `2815-2816`

- **Pre:** Settings > Templates, at least one prompt customised.
- **Steps:**
  1. Click `"Export (JSON)"` and open the downloaded file.
  2. Click `"Reset all to default"`, then `"Import (JSON)"` and re-select that file, then Save.
  3. Use a single row's `"Reset to default"` on one prompt.
- **Expect:** Export writes `reading-workspace-prompts.json` containing `prompts` (5 keys) and `tools` (7 keys), and toasts `"Exported prompt templates."` Import toasts `"N prompts imported — review and press Save."`; a file with nothing matching toasts `"No matching prompts in that file."` as an error.
- **Watch:** Import fills the textareas but does **not** persist until Save - closing the modal loses everything. Also verify malformed JSON toasts `"Could not read that JSON: …"` rather than throwing.

---

## 18. Section: Portable and private (#storage)

### FEAT-097 - Copy and chips
**P0** * Copy * `features.html:258-261`

- **Pre:** Navigate to `#storage`.
- **Steps:**
  1. Read eyebrow, heading, lead and chips.
- **Expect:** Eyebrow `"Portable & private"`; heading `"Notes you own, on your machine."`; lead `"Everything stays in your browser. Optionally sync a portable .notes.json to a folder (Chrome/Edge) so notes travel with your PDFs — great for Drive and other devices."` with ".notes.json" bold; chips `"Browser-only by default"`, `"Folder sync"`, `"No cloud upload"`, `"No login"`.
- **Watch:** "(Chrome/Edge)" is dropped, turning a correctly scoped claim into a cross-browser promise the app cannot keep.

### FEAT-098 - CLAIM: folder sync works in Chromium
**P0** * Regression * Chromium only * `features.html:260` vs `src/app.js:2264 fsSupported()`, `2451 scheduleFolderSync()`, `2607 saveNotesNow()`

- **Pre:** Chrome or Edge. `/app` with a document and notes.
- **Steps:**
  1. Settings > Storage > `"Choose folder…"`, pick a folder, grant access.
  2. Reopen Settings and read the status line.
  3. Add a note, wait ~2s, and check the folder on disk.
  4. Click the save button in the notes header.
- **Expect:** Status reads `"Notes sync to 📁 <folder>"` with `"Change folder"` and `"Turn off"`. A `<doc>.notes.json` appears and updates automatically (~1.5s debounce). The save button toasts `"Saved to “<folder>”."` and flashes. `"Turn off"` toasts `"Folder sync off — notes stay in this browser."`
- **Watch:** Folder permission is not persistent across sessions in all configurations; re-granting requires a user gesture. If the first save after a cold start silently no-ops, that is the bug to catch.

### FEAT-099 - CLAIM: Firefox/Safari fall back cleanly
**P0** * Regression * Firefox/Safari only * `features.html:260` vs `src/app.js:2460 maybeShowSaveAsTip()`, `2503 saveAsFile()`, `2524 downloadNotesJSON()`

- **Pre:** Firefox or Safari, fresh profile (`localStorage` key `srw_saveas_tip` unset). `/app` with notes.
- **Steps:**
  1. Open Settings > Storage.
  2. Click the notes-header save button.
  3. Dismiss the tip, then click save again.
- **Expect:** No `"Choose folder…"` capability is offered as working folder sync (`showDirectoryPicker` is absent). The first save shows a one-time modal titled `"Choose where your files save"` with the browser named in the body, a numbered stepper, and a `"Got it"` button - Firefox steps reference `"Always ask you where to save files"`, Safari `"Ask for each download"`. After dismissal the file downloads with a toast `"Downloaded <name>.notes.json"`, and the tip never appears again.
- **Watch:** The tip is gated on `localStorage`; in private browsing where `localStorage` throws, the function returns early and the tip never shows at all. Confirm the download itself still works there.

### FEAT-100 - CLAIM: "No cloud upload" / "No login"
**P0** * Regression * `features.html:261` vs `src/app.js:151 save()`, `1244 aiText()`, `app.html:135-136`

- **Pre:** DevTools Network + Application tabs open on `/app`.
- **Steps:**
  1. Open a PDF and confirm no request carries the PDF bytes.
  2. Ask the AI a question and inspect the `/api/ai` payload.
  3. Check Application > Cookies.
  4. Confirm no account/sign-in UI exists anywhere in the app.
- **Expect:** The PDF itself is never uploaded - it lives in IndexedDB (`pdf:<id>`). The AI request contains only the extracted text context (and, for screenshot notes, the captured image), never the whole file. No login exists. Cookies: none set by the app (Vercel Web Analytics is cookieless per `README.md:166`).
- **Watch:** "No cloud upload" is about the PDF file - selected text and captured figures *are* sent to the AI provider by design. If the page ever generalises this to "nothing you read leaves your machine", that becomes an over-promise.

---

## 19. "And everything else" grid (#all)

### FEAT-101 - Band heading and sub-line
**P0** * Copy * `features.html:269-270`

- **Pre:** Navigate to `#all`.
- **Steps:**
  1. Read the two lines at the top of the band.
- **Expect:** Serif `h2` `"And everything else"` and a centered grey sub `"The full list, grouped — every one of these ships today."` The band background is `--card` (`#FDFBF6`), slightly lighter than the page.
- **Watch:** The sub-line is a hard promise: any item below that does not ship makes this line false. FEAT-105, FEAT-109 and FEAT-116 currently test exceptions.

### FEAT-102 - Twelve category headings, in order
**P0** * Copy * `features.html:273-363`

- **Pre:** At `#all`, viewport >= 1024px.
- **Steps:**
  1. Read the small blue uppercase headings in column order.
- **Expect:** `"Reading"`, `"Annotating"`, `"AI & agent"`, `"Notes"`, `"Notes panel"`, `"Library"`, `"Open & attach"`, `"Share & export"`, `"Model & prompts"`, `"Storage & privacy"`, `"Your identity"`, `"Open & free"` - 12 in total, each blue `#2555F5`, 12px, letter-spaced, uppercase.
- **Watch:** A category is added without checking the 3-column balance and one column becomes much longer than the others.

### FEAT-103 - Column count and no split categories
**P1** * Visual * `features.html:91-94`

- **Pre:** At `#all`.
- **Steps:**
  1. View at 1200px, 900px, 899px, 560px and 559px.
  2. Watch whether any category's heading is separated from its bullets.
- **Expect:** 3 columns above 900px, 2 columns at <=900px, 1 column at <=560px. `break-inside:avoid` keeps every `.cat` block intact - a heading is never orphaned at the bottom of a column.
- **Watch:** `columns` + `break-inside` is historically flaky in Safari; check a long category ("AI & agent" has 7 items) specifically there.

### FEAT-104 - Bullet markers render
**P2** * Visual * `features.html:96-98`

- **Pre:** At `#all`.
- **Steps:**
  1. Zoom to 200% and inspect a few list items.
- **Expect:** Each item has a 5px blue dot rendered via `li::before` at `left:0;top:10px`, with the text indented 16px. Multi-line items keep the dot aligned with the first line, not centered vertically.
- **Watch:** After a font-size change, `top:10px` no longer centers on the first line and every dot sits slightly high or low.

### FEAT-105 - CLAIM: "Reading" items - one over-promise to verify
**P1** * Regression * `features.html:273-279` vs `src/app.js:3093`, `3095-3096`, `3089-3092`, `2937 openFind()`, `725 detectAndOfferOcr()`, `3060-3063`, `3221 initPanelResize()`

- **Pre:** `/app` open with the sample paper.
- **Steps:**
  1. Toggle continuous scroll on and off (`"Continuous scroll"`).
  2. Zoom in/out and type a page number into the page box.
  3. Look for any page-thumbnail UI - a thumbnail rail, a grid, a pages panel.
  4. Press Ctrl/Cmd-F.
  5. Collapse both panels, then drag the notes panel's left edge.
- **Expect:** Single-page and continuous both work; zoom and page jump work; find bar opens with `"Find in document…"`; OCR is covered by FEAT-050. **"page thumbnails" has no implementation anywhere in `src/app.js`** - treat that bullet as an over-promise until either the feature ships or the copy changes. Also note `"Collapse / resize panels"`: both panels collapse, but only the **right** panel is resizable (`initPanelResize()` adds a grip to `#notes` only).
- **Watch:** Someone "fixes" this by pointing at the screenshot thumbnails inside note cards (`.shot-thumb`) - those are captured-figure previews, not page thumbnails.

### FEAT-106 - CLAIM: "Annotating" items
**P0** * Regression * `features.html:281-287` vs `app.html:61-64,119-123`, `src/app.js:871 highlightSelection()`, `1087 renumber()`, `3104`

- **Pre:** `/app` open.
- **Steps:**
  1. Highlight text; drop a point comment; capture a screenshot region.
  2. Trigger the selection popover and read its three buttons.
  3. Create notes out of page order and check pin numbers.
- **Expect:** All five bullets hold: highlight text, point comments, screenshot a region, the `"Highlight · Note · Ask AI"` popover, and numbered pins in reading order.
- **Watch:** The bullet writes the popover as `"Highlight · Note · Ask AI"` while the app renders `"✦ Ask AI"` with a sparkle - acceptable, but flag if the app's labels change further.

### FEAT-107 - CLAIM: "AI & agent" - selection and whole-document questions
**P0** * Regression * `features.html:289-291` vs `src/app.js:1351 askAI()`, `1669 askAboutDocument()`, `1458 askAIAgent()`

- **Pre:** `/app`, AI reachable.
- **Steps:**
  1. Ask about a selection via the popover.
  2. Ask a general question in the bottom composer with nothing selected.
- **Expect:** Both work. The document-level question creates a note whose source label is `"Question about document"`. The tool-using ReAct loop runs for text (non-screenshot) notes on OpenRouter/compat.
- **Watch:** The composer is disabled/hidden in read-only shared files - test in the live app, not in an exported bundle.

### FEAT-108 - CLAIM: "AI & agent" - the tool list matches the code
**P1** * Regression * `features.html:292-293` vs `src/app.js:1415 agentTools()`, `1427 TOOL_LABEL`

- **Pre:** An agent answer with an expanded trace.
- **Steps:**
  1. Read the bullets `"Read page · search · outline · full read"` and `"Web search · create visual"`.
  2. Compare with the tool names in the trace and in `agentTools()`.
- **Expect:** Every named tool exists: `read_page`, `search_document`, `document_outline`, `read_full_document`, `web_search`, `create_visual` (plus the un-advertised `read_selection_context`).
- **Watch:** `web_search` and `create_visual` are only registered when their Settings toggles are on, so a trace with both off will never show them - do not conclude the tools are missing.

### FEAT-109 - CLAIM: "Streaming answers & agent trace"
**P1** * Regression * `features.html:294` vs `src/app.js:1244 aiText()`, `1440 aiAgentStep()`, `api/ai.js`

- **Pre:** `/app`, AI reachable, DevTools Network open.
- **Steps:**
  1. Ask a long question (e.g. "summarise the whole paper in detail").
  2. Watch the answer area from send to completion.
  3. Inspect the `/api/ai` request/response - look for `stream:true` or an SSE/`text/event-stream` response.
- **Expect:** The agent **trace** half of this bullet is true. The **streaming** half is not: there is no `stream` flag anywhere in `src/app.js` or `api/ai.js`; the UI shows an animated status (`"Thinking…"`, `"Gathering context…"`, tool labels) and then the finished answer appears in one paint. Treat "Streaming answers" as an over-promise until token streaming ships.
- **Watch:** The live status updates plus the auto-scroll-to-bottom behaviour (`followNoteBottom`) can *look* like streaming on a fast model - judge from the network response, not the animation.

### FEAT-110 - CLAIM: "AI & agent" - generated visuals and rich rendering
**P1** * Regression * `features.html:295-296` vs `src/app.js:1535 generateVisual()`, `2039 mdRich()`, `2051 ensureMathJax()`

- **Pre:** `/app`, AI reachable, visuals enabled.
- **Steps:**
  1. Generate an image and a diagram (see FEAT-072).
  2. Ask a question whose answer includes LaTeX, a Markdown table, a list and a code block.
- **Expect:** Both visual kinds render; LaTeX, Markdown and code all render formatted.
- **Watch:** Markdown tables need a separator row to be detected; a model that emits a pipe table without one renders as plain text - a model quirk, not a page bug.

### FEAT-111 - CLAIM: "Notes" items
**P0** * Regression * `features.html:299-306` vs `src/app.js:1865 compactCard()`, `1901 annCard()`, `1744 msgActions()`, `2165 saveAndReask()`, `1222 autoTag()`

- **Pre:** `/app` with a note that has a question and an answer.
- **Steps:**
  1. Expand and collapse the card (chevron tooltip `"Collapse thread"`).
  2. Check a message onto the card (FEAT-075).
  3. Reply in the inline composer (placeholder `"Reply or ask a follow-up…"`).
  4. Confirm auto tags appear and add a manual one.
  5. Resolve, copy (tooltips `"Copy whole thread"` / `"Copy this response"`), edit (`"Edit"`), delete (`"Delete note"` / `"Delete reply"`).
  6. Edit your question and press `"Save & re-ask AI"`.
- **Expect:** All six bullets hold. Re-asking drops the stale answers that followed the edited question and produces a fresh one. Copy toasts `"Note to clipboard."` / `"Response to clipboard."`
- **Watch:** Double-clicking a comment or answer body also enters edit mode (`wireNoteEditDblclick`, 400ms window) - verify it does not fire on the clamped preview of a compact card.

### FEAT-112 - CLAIM: "Notes panel" items, with exact filter labels
**P1** * Regression * `features.html:308-313` vs `src/app.js:2247 FILTERS`, `1689 passesFilter()`, `2256`, `3173`

- **Pre:** `/app` with a mix of notes: resolved, unresolved, screenshot, AI, question-tagged.
- **Steps:**
  1. Cycle every filter and confirm the list content and the footer label.
  2. Search a term that appears only in an AI answer.
  3. Toggle sort and `"Auto-scroll to active note"`.
- **Expect:** The page writes filters as `"all · unresolved · screenshots · AI · questions"`; the app labels them `"All notes"`, `"Unresolved"`, `"Screenshots"`, `"AI replies"`, `"Questions"` - same set, different casing. Search matches note text, answers, tags, section and `"page N"`. Empty search result shows `"No notes match “<query>”."`
- **Watch:** Search is AND across whitespace-separated terms, so a two-word query that spans a card boundary returns nothing - expected behaviour.

### FEAT-113 - CLAIM: "Library" items, including removing the bundled sample
**P1** * Regression * `features.html:315-321` vs `src/app.js:333 trashDoc()`, `346 purgeDoc()`, `82`, `396 updateStorage()`

- **Pre:** `/app` on a profile that still has the bundled sample.
- **Steps:**
  1. Trash the sample, then reload the page twice.
  2. Restore it from Trash, reload again.
  3. Watch the storage meter after opening a large PDF.
- **Expect:** A trashed sample does **not** come back on reload (`state.sampleDismissed`); restoring it re-enables auto-add. The storage meter reads like `"60 MB of 10.1 GB"` and its bar width tracks usage; when `navigator.storage.estimate` is unavailable it falls back to `"N documents"`.
- **Watch:** Deleting the sample permanently *and* having no other document must land on `"Your library is empty"` with a working "Open PDF or bundle" - not a blank reader.

### FEAT-114 - CLAIM: "Open & attach" items
**P0** * Regression * `features.html:323-328` vs `app.html:21-22`, `src/app.js:255 openFiles()`, `3078`, `2413 maybeOfferNotesFallback()`, `2422 showNotesBanner()`, `2394-2407`

- **Pre:** `/app`; on disk: a PDF, its `.notes.json`, and an `.annotated.html`.
- **Steps:**
  1. Click "Open PDF or bundle" and read the button tooltip.
  2. Select the PDF and its notes JSON together in one pick.
  3. Drag a PDF onto the reader.
  4. Open a PDF alone with no notes and no sync folder set.
  5. With a sync folder set (Chromium), open a PDF whose notes live in that folder.
- **Expect:** Tooltip: `"Open a PDF, notes (.json), or a shared paper (.html)"`; the file input accepts `application/pdf,.json,application/json,.html,text/html` and is `multiple`. Multi-select attaches the notes to the PDF by SHA. Drag-and-drop highlights the reader and opens the files. Case 4 shows the banner `"Have notes for <name>? Open its .notes.json to load them."` with `"Open notes file…"`. Case 5 shows the confirm `"Found notes for this PDF in “<folder>”: <file>. Open them?"` with `"Open notes"` / `"Not now"`.
- **Watch:** The features page writes the prompt as `"Found notes for this PDF"` - matches. The banner in case 4 fires only once per document (`doc.notesAsked`), so re-testing needs a fresh document.

### FEAT-115 - CLAIM: "Share & export" items
**P1** * Regression * `features.html:330-336` vs FEAT-084 to FEAT-087, `src/app.js:2607 saveNotesNow()`, `2533 importNotesJSON()`

- **Pre:** `/app` with notes.
- **Steps:**
  1. Verify each of the five bullets against the checks above.
  2. Additionally: save notes JSON, then import it back with the import button (tooltip `"Import notes from a JSON file"`).
- **Expect:** All five hold: single-file `.html`, read-only viewer with the made-with banner, round-trip re-open, export annotations to PDF, save/import notes JSON. Import toasts `"N notes imported."`
- **Watch:** Explicit **Import** replaces this document's notes, while auto-attach merges. Importing a file from a different PDF prompts `"“<file>” was saved for a different PDF. Attach it to “<name>” anyway?"` only through the banner path, not the header import button.

### FEAT-116 - CLAIM: "Model & prompts" items
**P1** * Regression * `features.html:338-345` vs FEAT-089, FEAT-090, FEAT-094 to FEAT-096, `src/app.js:2771,2778`

- **Pre:** Settings open.
- **Steps:**
  1. Verify text, image and router model fields exist for both providers.
  2. Verify prompts and tool descriptions are editable and export/import/reset work.
- **Expect:** All six bullets hold. Note the app exposes a third model class (a fast/cheap **router** model) that the page does not advertise - under-promising, which is fine.
- **Watch:** `"Bring your own key (browser-only)"` - the key is browser-stored but is transmitted per request through the proxy (FEAT-090). Keep that nuance out of a stronger claim.

### FEAT-117 - CLAIM: "Storage & privacy", "Your identity" and "Open & free" items
**P1** * Regression * `features.html:347-363` vs `src/app.js:120-168`, `2780-2784`, `LICENSE`, `package.json`, `api/ai.js`, `README.md:102-118`

- **Pre:** `/app`, DevTools open; repo checked out.
- **Steps:**
  1. Confirm notes live in `localStorage` (`srw_state_v1`) and images/PDFs in IndexedDB (`srw_assets`).
  2. Confirm folder sync uses File System Access (Chromium) - see FEAT-098/099.
  3. Confirm no cookies and no login (FEAT-100).
  4. Set your name and initials in Settings and confirm the avatar/attribution updates.
  5. Confirm the licence is AGPL-3.0 and that `api/` holds the two serverless functions.
  6. Follow the README's deploy instructions.
- **Expect:** All items hold except one nuance: `"One-click Vercel deploy"` - `README.md` documents a six-step fork-and-import flow with manual env vars; there is no one-click deploy button or `vercel.com/new/clone` link. Treat as a mild over-promise.
- **Watch:** Identity: saving an empty name falls back to `"You"` and initials to `"YO"`, upper-cased and truncated to 2 characters - confirm a 5-character entry does not break the avatar.

---

## 20. CTA band and footer

### FEAT-118 - CTA heading
**P0** * Copy * `features.html:369`

- **Pre:** Scroll to the bottom band above the footer.
- **Steps:**
  1. Read the heading.
- **Expect:** Serif, 32px, centered: `"Try it — no signup, no install."`
- **Watch:** Em dash flattened to a hyphen, or the heading duplicated from the landing page's CTA with different wording.

### FEAT-119 - CTA buttons
**P0** * Functional * `features.html:370,105-107`

- **Pre:** At the CTA band.
- **Steps:**
  1. Read both button labels.
  2. Hover each.
  3. Click each.
- **Expect:** Primary blue `"Open the app"` -> `/app` (hover darkens to `#1B44D6`, no underline); secondary ghost `"View on GitHub"` -> `https://github.com/trojanuary/pair`, card background with a `#E7DECD` border and an 8px left margin.
- **Watch:** At <=390px the two buttons sit on one line and the ghost button's `margin-left:8px` pushes it past the viewport edge - check for horizontal scroll here specifically.

### FEAT-120 - CLAIM: "no signup, no install" is literally true
**P1** * Regression * `features.html:369` vs `app.html`, `src/app.js:3303 boot()`

- **Pre:** A fresh incognito window with no prior state.
- **Steps:**
  1. Go straight to `/app` from the CTA.
  2. Try to read, highlight and ask a question without creating any account.
- **Expect:** The workspace opens immediately with the bundled sample; no sign-up, no install prompt, no PWA/extension requirement. AI works on the shared key until quota is exhausted.
- **Watch:** Any future gate (an email wall, a required key before first answer) makes this headline false - this is the single most damaging over-promise on the page.

### FEAT-121 - Footer copyright line
**P2** * Copy * `features.html:374`

- **Pre:** At the footer.
- **Steps:**
  1. Read the left-hand text.
- **Expect:** Exactly `"© 2026 PairedX.com · AGPL-3.0"` in 13.5px grey.
- **Watch:** Unlike the landing page, "AGPL-3.0" here is **plain text, not a link** to the LICENSE. Flag if consistency with the landing footer is required.

### FEAT-122 - Footer nav links
**P1** * Functional * `features.html:375`

- **Pre:** At the footer.
- **Steps:**
  1. Click each of the four links in turn.
- **Expect:** `"Home"` -> `/#features`; `"App"` -> `/app`; `"GitHub"` -> `https://github.com/trojanuary/pair`; `"Privacy"` -> `/#privacy` (the anchor exists on the landing page).
- **Watch:** `#privacy` is removed from `index.html` during a landing rework and this link silently lands at the top of the home page.

### FEAT-123 - Footer layout at narrow widths
**P2** * Visual * `features.html:108-110`

- **Pre:** Page loaded.
- **Steps:**
  1. Resize from 1200px to 390px watching the footer.
- **Expect:** The copyright sits left and the nav right (`margin-left:auto`); below ~560px they wrap onto separate lines with a 14px gap and stay inside the 24px padding.
- **Watch:** The nav's four links wrap mid-word or overflow horizontally at 320px.

---

## 21. Responsive, accessibility, performance and edges

### FEAT-124 - No horizontal scrolling at any width
**P0** * Visual * `features.html:24,49,84,91,111`

- **Pre:** Page loaded.
- **Steps:**
  1. At 1920, 1440, 1024, 820, 768, 640, 560, 390 and 320px, scroll top to bottom and try to scroll horizontally.
- **Expect:** No horizontal scrollbar and no content clipped at any width. Images stay inside their frames; chips wrap; the grid reflows at 900/560; rows stack at 820.
- **Watch:** The hero `.annot` (max-width 1200px) and band shots (max-width 1180px) sit inside a 1240px wrap with 24px padding - a widened image or a removed max-width immediately produces sideways scroll.

### FEAT-125 - Browser zoom to 200%
**P2** * Visual * `features.html:21,42,66`

- **Pre:** Page loaded at 1280px.
- **Steps:**
  1. Zoom the browser to 200% and read the whole page.
- **Expect:** Text reflows, nothing overlaps, the sticky header does not consume more than ~1/3 of the viewport, and the hero callout dots stay attached to their screenshot regions (they are percentage-positioned, so they scale with the image).
- **Watch:** At 200% on a short viewport, the 68px sticky header plus a smooth anchor jump leaves section headings clipped (see FEAT-023).

### FEAT-126 - Keyboard navigation and focus visibility
**P1** * Functional * `features.html:116-376`

- **Pre:** Page loaded, keyboard only.
- **Steps:**
  1. Tab from the top through every interactive element: brand, Home, GitHub, Open app, nine TOC pills, CTA buttons, four footer links.
  2. Activate three TOC pills with Enter.
- **Expect:** Focus order follows visual order, every focused element shows a visible focus ring, and Enter navigates. Nothing is focusable that is not a link.
- **Watch:** There are **no custom `:focus` / `:focus-visible` styles** in this file, so focus relies entirely on the UA ring - against the warm `#F7F3EA` background verify it is actually visible on the blue "Open app" pill.

### FEAT-127 - Image alt text is present and meaningful
**P1** * Functional * `features.html:134,159,167,175,185,195,205,215,225,233,243,253,263`

- **Pre:** Page loaded; use a screen reader or disable images.
- **Steps:**
  1. Read every `alt` attribute.
- **Expect:** All 13 images have descriptive alt text, e.g. `"The PairedX workspace"`, `"PairedX detecting a scanned PDF and offering one-tap on-device OCR"`, `"A connector line joining a note to its highlighted passage on the page"`, `"Settings — Templates: editable system prompts and tool descriptions"`. None is empty or a filename. The header logo SVG is correctly `aria-hidden="true"`.
- **Watch:** The five numbered callout dots and the legend badges carry no accessible text at all - a screen-reader user gets the legend labels but no association with the image. Note as an accessibility gap rather than a regression.

### FEAT-128 - Page weight, image loading and slow-network behaviour
**P1** * Perf * `features.html:134-263`

- **Pre:** DevTools Network with "Slow 3G" throttling, cache disabled.
- **Steps:**
  1. Load `/features.html` and watch the waterfall and layout while images arrive.
  2. Record total transferred bytes.
- **Expect:** Roughly 3.3 MB of images plus ~22 KB of HTML. The page must remain readable while images stream in - text first, then screenshots.
- **Watch:** No image has `loading="lazy"` and none declares `width`/`height`, so every screenshot is requested eagerly and each arrival shifts the layout (bad CLS). This is the mechanism behind the anchor-drift in FEAT-025 - fix both together.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `features.html:6` `<title>PairedX — Features</title>` | FEAT-001 |
| `features.html:7` meta description | FEAT-002 |
| `features.html:8` inline SVG favicon | FEAT-003 |
| `features.html:9-11` Google Fonts (Fraunces, Inter) | FEAT-004 |
| `features.html:378-382` header scroll script | FEAT-005, FEAT-008, FEAT-015 |
| `features.html:20` `html{scroll-behavior:smooth}` | FEAT-023, FEAT-024 |
| `features.html:24` `.wrap` max-width 1240 | FEAT-124 |
| `features.html:28-30` sticky header | FEAT-014, FEAT-125 |
| `features.html:35-36` `.enter` pill | FEAT-012 |
| `features.html:37` `.hide-sm` @640px | FEAT-016 |
| `features.html:45-46` `.tocbar a` + hover | FEAT-021, FEAT-028 |
| `features.html:49-60` `.annot`, `.dot`, `.legend` | FEAT-029, FEAT-030, FEAT-031, FEAT-032, FEAT-035, FEAT-127 |
| `features.html:64-84` `.row` / `.rev` / `.shot` / `.band` | FEAT-037, FEAT-039, FEAT-040, FEAT-041, FEAT-042 |
| `features.html:91-98` `.cols`, `.cat`, `li::before` | FEAT-103, FEAT-104 |
| `features.html:105-110` `.btn`, `.btn.ghost`, footer | FEAT-119, FEAT-121, FEAT-123 |
| `features.html:111` @820px stacking | FEAT-038 |
| `features.html:117` brand + `<linearGradient id="g">` | FEAT-009, FEAT-027 |
| `features.html:119-121` header nav | FEAT-010, FEAT-011, FEAT-012, FEAT-013 |
| `features.html:126-128` hero eyebrow/h1/lead | FEAT-017, FEAT-018, FEAT-019, FEAT-020 |
| `features.html:130` tocbar (9 pills) | FEAT-021, FEAT-022, FEAT-025, FEAT-026 |
| `features.html:133-147` hero image, 5 dots, legend | FEAT-029 - FEAT-035 |
| `features.html:152-160` `#annotate` | FEAT-043, FEAT-044, FEAT-045, FEAT-046, FEAT-047 |
| `features.html:162-168` `#ocr` | FEAT-048 - FEAT-054 |
| `features.html:170-176` `#linked` | FEAT-055, FEAT-056, FEAT-057, FEAT-058 |
| `features.html:178-186` `#ai` | FEAT-059 - FEAT-064 |
| `features.html:188-196` `#agent` | FEAT-065 - FEAT-069 |
| `features.html:198-206` `#figures` | FEAT-070 - FEAT-073 |
| `features.html:208-216` `#notes` | FEAT-074 - FEAT-077 |
| `features.html:218-226` `#library` | FEAT-078 - FEAT-082 |
| `features.html:228-234` `#share` | FEAT-083 - FEAT-087 |
| `features.html:236-244` `#byo` | FEAT-088 - FEAT-092 |
| `features.html:246-254` `#templates` | FEAT-093 - FEAT-096 |
| `features.html:256-264` `#storage` | FEAT-097 - FEAT-100 |
| `features.html:268-366` `#all` grid (12 categories) | FEAT-101 - FEAT-117 |
| `features.html:368-371` CTA band | FEAT-118, FEAT-119, FEAT-120 |
| `features.html:373-376` footer | FEAT-121, FEAT-122, FEAT-123 |
| 13 `docs/screenshots/*` referenced by this page | FEAT-006, FEAT-034, FEAT-047, FEAT-069, FEAT-077, FEAT-082, FEAT-092, FEAT-127, FEAT-128 |
| `src/app.js:38 SAMPLE_DOC_NAME` | FEAT-034, FEAT-082 |
| `src/app.js:181 sha256Hex()` / `219 openPdfFile()` | FEAT-081 |
| `src/app.js:255 openFiles()` / `279 importSharedHTML()` | FEAT-086, FEAT-114 |
| `src/app.js:325 toggleStar()` / `333 trashDoc()` / `340 restoreDoc()` / `346 purgeDoc()` | FEAT-080, FEAT-113 |
| `src/app.js:357 docsForView()` / `368 renderTree()` | FEAT-079 |
| `src/app.js:396 updateStorage()` | FEAT-113 |
| `src/app.js:644 buildOcrTextLayer()` / `662 applyOcrLayer()` | FEAT-052 |
| `src/app.js:680 ensureTesseract()` / `693 createTesseractWorker()` | FEAT-051 |
| `src/app.js:725 detectAndOfferOcr()` / `741 showOcrBanner()` / `753 runOcr()` | FEAT-050, FEAT-053, FEAT-054 |
| `src/app.js:813 onTextSelect()` / `871 highlightSelection()` / `884 createFromSelection()` | FEAT-045, FEAT-106 |
| `src/app.js:906 setTool()` / `917 initCaptureMask()` | FEAT-046, FEAT-071 |
| `src/app.js:1087 renumber()` / `1116 drawPins()` / `1162 drawConnector()` | FEAT-033, FEAT-056, FEAT-058, FEAT-106 |
| `src/app.js:1208 selectAnnotation()` | FEAT-057 |
| `src/app.js:1244 aiText()` / `1440 aiAgentStep()` | FEAT-090, FEAT-109 |
| `src/app.js:1340 chipsFor()` / `1447 agentChips()` | FEAT-063 |
| `src/app.js:1351 askAI()` / `1458 askAIAgent()` | FEAT-061, FEAT-067, FEAT-107 |
| `src/app.js:1415 agentTools()` / `1427 TOOL_LABEL` | FEAT-066, FEAT-068, FEAT-108 |
| `src/app.js:1535 generateVisual()` | FEAT-072, FEAT-073, FEAT-110 |
| `src/app.js:1601 attachMentions()` | FEAT-064 |
| `src/app.js:1669 askAboutDocument()` | FEAT-033, FEAT-107 |
| `src/app.js:1744 msgActions()` / `2198 toggleShowOnCard()` / `1865 compactCard()` | FEAT-075, FEAT-111 |
| `src/app.js:1939 traceHTML()` | FEAT-067 |
| `src/app.js:2039 mdRich()` / `2051 ensureMathJax()` / `2007 codeBlockHTML()` | FEAT-062, FEAT-110 |
| `src/app.js:2165 saveAndReask()` | FEAT-111 |
| `src/app.js:2247 FILTERS` / `2248 openFilterPopover()` / `1689 passesFilter()` | FEAT-076, FEAT-112 |
| `src/app.js:2264 fsSupported()` / `2451 scheduleFolderSync()` | FEAT-098 |
| `src/app.js:2413 maybeOfferNotesFallback()` / `2422 showNotesBanner()` | FEAT-114 |
| `src/app.js:2460 maybeShowSaveAsTip()` / `2503 saveAsFile()` | FEAT-099 |
| `src/app.js:2524 downloadNotesJSON()` / `2533 importNotesJSON()` / `2607 saveNotesNow()` | FEAT-099, FEAT-115 |
| `src/app.js:2553 exportSelfContainedHTML()` / `3294 applyReadOnly()` | FEAT-084, FEAT-085 |
| `src/app.js:2676 PROMPT_KEYS` / `2690 TOOL_KEYS` / `2717 templatesPaneHTML()` | FEAT-094, FEAT-095, FEAT-096 |
| `src/app.js:2760 openSettings()` | FEAT-089, FEAT-092, FEAT-098, FEAT-117 |
| `src/app.js:2846 openExport()` / `2881 buildSheet()` | FEAT-087 |
| `src/app.js:2937 openFind()` / `3124` Ctrl/Cmd-F | FEAT-046, FEAT-105 |
| `src/app.js:3221 initPanelResize()` / `3060-3063` panel toggles | FEAT-105 |
| `src/app.js:3303 boot()` | FEAT-120 |
| `app.html:21-23` "Open PDF or bundle" / "Share as HTML" | FEAT-082, FEAT-114 |
| `app.html:119-123` `#selPop` (Highlight / Note / ✦ Ask AI) | FEAT-045, FEAT-106 |
| `api/ai.js` proxy + `QUOTA_MSG` | FEAT-090, FEAT-091, FEAT-109 |
| `vercel.json` `/app` rewrite | FEAT-013 |
| `README.md:102-118` deploy steps | FEAT-117 |
| Claim "page thumbnails" | FEAT-105 |
| Claim "Streaming answers" | FEAT-109 |
| Claim "One-click Vercel deploy" | FEAT-117 |
| Claim "no signup, no install" | FEAT-120 |

## Deliberately not covered here

- The landing page (`index.html`) - its hero, reel video, pricing/privacy sections and its own nav - covered in **01 - Landing page**.
- The app shell and reader itself (PDF rendering, continuous mode, zoom, pinch, capture geometry) - covered in **03 - Reader and PDF rendering**.
- Notes panel internals (card states, threads, tags, filters at depth) - covered in **05 - Notes panel and cards**; this document only checks that the features page's *claims* about them are true.
- Settings modal behaviour in depth (validation, per-field persistence, tab state) - covered in **07 - Settings, providers and templates**.
- OCR accuracy, performance on long documents, and Tesseract worker lifecycle - covered in **04 - OCR for scanned PDFs**; this document checks only the claims and the banner copy.
- Share/export file internals (bundle escaping, size limits, sanitisation of imported notes) - covered in **08 - Share, export and import**.
- The serverless proxy's security posture (SSRF allowlist, redirect handling, timeouts) - covered in **10 - API proxy and security**.
- Cross-page SEO/social metadata strategy (OpenGraph, canonical URLs) - noted here only as a gap; owned by **01 - Landing page**.
