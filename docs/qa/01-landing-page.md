# 01 - Landing page (index.html)

> Manual QA for the public marketing page served at `/` — every section, link, CTA, headline, comparison-table row, screenshot, the product reel video, the footer, and the scroll/reveal behaviour.

| | |
|---|---|
| **ID prefix** | LAND |
| **Scope** | `index.html` only — the marketing landing page at `/`. Every nav link, CTA, headline, body string, chip, comparison-table cell and footnote, the inline hero art, the two settings screenshots, the OCR banner, the product reel `<video>`, the footer, the sticky-nav scroll class, the IntersectionObserver reveal script, all hover/focus states, the three responsive breakpoints, and every one of the 19 outbound/internal links. |
| **Primary code** | `index.html:1-212` (head + all CSS), `index.html:215-379` (markup), `index.html:381-402` (reveal + nav script), `index.html:403-404` (Vercel Analytics), `vercel.json` (the `/app` rewrite) |
| **Checks** | 130 |

## Contents
- [1. Document head, metadata & first paint](#1-document-head-metadata--first-paint) - 8 checks
- [2. Sticky navigation bar](#2-sticky-navigation-bar) - 14 checks
- [3. Hero](#3-hero) - 12 checks
- [4. Shared-key notice, trust chips & scroll hint](#4-shared-key-notice-trust-chips--scroll-hint) - 9 checks
- [5. Product reel video (#app)](#5-product-reel-video-app) - 13 checks
- [6. Feature cards (#features)](#6-feature-cards-features) - 11 checks
- [7. Settings & Templates splits](#7-settings--templates-splits) - 11 checks
- [8. OCR band (#ocr)](#8-ocr-band-ocr) - 6 checks
- [9. Privacy chips (#privacy)](#9-privacy-chips-privacy) - 4 checks
- [10. Comparison table (#compare)](#10-comparison-table-compare) - 16 checks
- [11. Closing CTA band](#11-closing-cta-band) - 6 checks
- [12. Footer](#12-footer) - 9 checks
- [13. Scroll, reveal & motion](#13-scroll-reveal--motion) - 7 checks
- [14. Responsive layout & cross-browser](#14-responsive-layout--cross-browser) - 4 checks

---

## 1. Document head, metadata & first paint

### LAND-001 - Tab title and language
**P0** * Copy * `index.html:2,6`

- **Pre:** Fresh browser tab, cache disabled (DevTools → Network → "Disable cache").
- **Steps:**
  1. Load `/`.
  2. Read the browser tab label.
  3. In DevTools → Elements, inspect the `<html>` element.
- **Expect:** Tab title is exactly `"PairedX — a source-linked AI reading workspace"` — em dash (—), not a hyphen, and lowercase "a". `<html lang="en">` is present.
- **Watch:** The em dash silently degrading to `-` after a copy edit, and `lang` being dropped, which makes screen readers guess the language.

### LAND-002 - Meta description and Open Graph tags
**P1** * Copy * `index.html:7,9-11`

- **Pre:** Page loaded.
- **Steps:**
  1. View source (Ctrl/Cmd+U) and read the four meta tags in `<head>`.
- **Expect:** Exactly these values:
  - `description` = `"PairedX is a source-linked, in-browser reading workspace for papers. Highlight, ask an AI, make diagrams, and export — every answer stays pinned to the exact spot in the PDF."`
  - `og:title` = `"PairedX — a source-linked AI reading workspace"`
  - `og:description` = `"Read, highlight, and summarize papers with an AI that never loses the source. Open-source, no login, your keys stay in your browser."`
  - `og:type` = `"website"`
- **Watch:** `og:title` drifting out of sync with `<title>` when only one of the two is edited.

### LAND-003 - No og:image / twitter:card (known gap)
**P2** * Regression * `index.html:9-11`

- **Pre:** Page loaded.
- **Steps:**
  1. Search the head for `og:image`, `og:url`, `twitter:card`.
  2. Paste `https://pairedx.com` into a link-preview debugger or a Slack/X compose box.
- **Expect:** None of those three tags exist today, so the preview renders as a text-only card with the og:title/og:description. This is the current, accepted state — the check exists so that if someone *adds* an image it is verified, and so that this gap is never mistaken for a broken deploy.
- **Watch:** Someone adding `og:image` with a relative path — it must be absolute for crawlers to resolve it.

### LAND-004 - Theme colour and favicon
**P2** * Visual * `index.html:8,12`

- **Pre:** Load `/` on Chrome Android or in a Chromium PWA window, plus any desktop browser.
- **Steps:**
  1. Observe the browser chrome tint on mobile.
  2. Observe the tab favicon on desktop.
  3. Zoom the tab icon (or open the `data:` URI from source directly).
- **Expect:** `theme-color` is `#F7F3EA` — the same warm paper colour as the page background, so the chrome blends into the page. The favicon is an inline SVG data URI: a blue (`#2555F5`) hexagon with a white stylised "P" stroke.
- **Watch:** `theme-color` staying at the old value after a palette change, producing a visible seam between browser chrome and page on mobile.

### LAND-005 - Fonts are inlined, no font network requests
**P0** * Perf * `index.html:14-15`

- **Pre:** DevTools → Network, filter "Font", cache disabled.
- **Steps:**
  1. Hard-reload `/`.
  2. Inspect the Font request list.
  3. Disable JavaScript and reload; look at the headings.
- **Expect:** **Zero** font network requests. Fraunces (serif, used by `h1/h2/h3`) and Inter (sans, body) are both base64 `@font-face` blobs inside the single inline `<style>`. Headings render in Fraunces immediately with no flash of Georgia/Times fallback.
- **Watch:** A build step accidentally externalising the fonts — you would see a brief FOUT on first paint and two new requests.

### LAND-006 - Only four external asset requests
**P1** * Perf * `index.html:256,309,326,404`

- **Pre:** DevTools → Network, cache disabled, "All" filter.
- **Steps:**
  1. Hard-reload `/` and let it settle. Do **not** press play on the video.
- **Expect:** Beyond the document itself, only these requests fire:
  - `docs/screenshots/reel-poster.jpg` (video poster)
  - a **range/metadata-only** request for `docs/screenshots/pairedx-reel.mp4` (because `preload="metadata"`, not `auto`)
  - `docs/screenshots/settings-templates.jpg` and `docs/screenshots/feat-ocr-banner.jpg` (both `loading="lazy"`, so they only fire once you scroll near them)
  - `/_vercel/insights/script.js` (deferred)
  All other imagery (hero art, settings screenshot) is an inline `data:image/webp` base64 blob and produces **no** request.
- **Watch:** `preload="metadata"` being changed to `auto`, which would start pulling the 17.8 MB reel on every page view.

### LAND-007 - Analytics script 404s outside Vercel (expected)
**P2** * Edge * `index.html:403-404`

- **Pre:** Serve the repo locally (`python3 -m http.server`) or from GitHub Pages, i.e. **not** on Vercel.
- **Steps:**
  1. Load `/` and open the Console + Network tabs.
- **Expect:** `/_vercel/insights/script.js` returns 404 and logs a failed-resource error. Nothing else breaks — `window.va` is stubbed at `index.html:403` so no `va is not defined` ReferenceError appears, and every section still renders and reveals.
- **Watch:** A page-blocking error being introduced here; the whole point of the stub is that analytics failure must stay non-fatal.

### LAND-008 - Console is clean on production load
**P0** * Functional * `index.html:381-404`

- **Pre:** Production `pairedx.com`, DevTools Console open at "Verbose", fresh load.
- **Steps:**
  1. Load `/`, scroll from top to bottom, then back to top.
- **Expect:** No JavaScript errors and no unhandled promise rejections. The only acceptable console output is browser-origin noise (e.g. a Chromium autoplay-policy note if the reel is touched).
- **Watch:** `document.getElementById('nav')` at `index.html:383` returning null if the header's `id="nav"` is ever removed — that throws on the very first `onScroll()` call at `index.html:385` and kills the entire reveal script, leaving every `[data-reveal]` element invisible.

---

## 2. Sticky navigation bar

### LAND-009 - Nav is sticky and translucent
**P0** * Visual * `index.html:39,215` (`.nav`)

- **Pre:** Desktop viewport ≥1000px wide.
- **Steps:**
  1. Load `/` and scroll down past the hero.
- **Expect:** The header stays pinned to the top (`position:sticky; top:0; z-index:50`), 68px tall, with a frosted background (`rgba(247,243,234,.82)` + `backdrop-filter: saturate(160%) blur(10px)`). Content scrolling underneath is visibly blurred, not hidden.
- **Watch:** A later section getting a `z-index` above 50 and sliding over the nav.

### LAND-010 - Nav bottom border appears only after scrolling
**P1** * State * `index.html:40,383-385 onScroll()`

- **Pre:** Page loaded, scrolled fully to the top.
- **Steps:**
  1. At scroll position 0, look at the bottom edge of the header.
  2. Scroll down by ~10px.
  3. Scroll back to exactly the top.
  4. In DevTools, watch the `class` attribute of `#nav` while doing 1–3.
- **Expect:** At the top the border is `transparent` (no visible hairline). Once `window.scrollY > 4` the class `scrolled` is added and a 1px `var(--line)` (#E7DECD) border fades in over 0.3s. Returning to the top removes the class and the border fades back out.
- **Watch:** The threshold is `> 4`, not `> 0` — a 1–4px scroll (trackpad micro-scroll, or a browser restoring scroll position) must **not** flash the border.

### LAND-011 - Nav brand logo and wordmark
**P1** * Visual * `index.html:217` (`.brand`)

- **Pre:** Page loaded.
- **Steps:**
  1. Inspect the top-left brand block.
  2. Click it from halfway down the page.
- **Expect:** A 30×30 blue hexagon SVG (gradient `#3b6bff` → `#1636c9`) with a white "P" glyph, followed by the wordmark `"PairedX"` in Fraunces 20px/600. The `<svg>` carries `aria-hidden="true"` so screen readers announce only "PairedX". Clicking scrolls smoothly to `#top` (the `<main>` element).
- **Watch:** The wordmark rendering in Inter instead of Fraunces if the `.brand` font-family rule is lost.

### LAND-012 - Duplicate SVG gradient id="g"
**P2** * Edge * `index.html:217,366`

- **Pre:** Page loaded.
- **Steps:**
  1. In the Console run a query for elements with `id="g"` (Elements panel search for `id="g"` works too).
  2. Compare the nav logo and the footer logo side by side.
  3. Navigate to `/#g` directly.
- **Expect:** Two elements share `id="g"` — the `<linearGradient>` inside the nav brand SVG and the one inside the footer brand SVG. Both logos still paint identically because each SVG resolves `url(#g)` to the *first* match, which is the same gradient definition. `/#g` scrolls to the nav brand. This is a known, currently-harmless duplicate.
- **Watch:** If the two gradients ever diverge (different colours), the footer logo will silently inherit the nav's gradient. Fix by renaming one.

### LAND-013 - Nav link "Features"
**P1** * Functional * `index.html:219`

- **Pre:** Desktop viewport >900px (the `.nlinks` row is hidden below that).
- **Steps:**
  1. Hover the first nav link, then click it.
- **Expect:** Label is exactly `"Features"`. Hover transitions its colour from `var(--ink-2)` (#6E655A) to `var(--ink)` (#191510) over 0.2s. Click navigates **in the same tab** to `/features.html` (no `target="_blank"`), and that page loads with a 200.
- **Watch:** The link pointing at `#features` (the on-page section) instead of the separate `/features.html` page — both exist and are easy to confuse.

### LAND-014 - Nav link "Docs" → GitHub readme
**P1** * Functional * `index.html:220`

- **Pre:** Desktop viewport >900px.
- **Steps:**
  1. Click `"Docs"`.
  2. Return and inspect the anchor attributes.
- **Expect:** Opens `https://github.com/trojanuary/pair#readme` in a **new tab**, and lands scrolled to the README section of the repo page. Attributes are `target="_blank" rel="noopener noreferrer"`.
- **Watch:** A missing `rel="noopener noreferrer"` on any new-tab link — all 10 `target="_blank"` links on this page must carry it.

### LAND-015 - Nav link "GitHub"
**P1** * Functional * `index.html:221`

- **Pre:** Desktop viewport >900px.
- **Steps:**
  1. Click `"GitHub"`.
- **Expect:** Label `"GitHub"`; opens `https://github.com/trojanuary/pair` in a new tab, repo root, 200.
- **Watch:** The repo being renamed or made private — the same URL appears **6 times** on this page (`index.html:221,225,226,355,371,375`), so a rename means six edits.

### LAND-016 - Nav link "Privacy" jumps to the chip band
**P1** * Functional * `index.html:222,330`

- **Pre:** Desktop viewport >900px, scrolled to the top.
- **Steps:**
  1. Click `"Privacy"`.
- **Expect:** Smooth-scrolls (`html{scroll-behavior:smooth}`, `index.html:27`) down to `<section class="priv" id="privacy">` — the four-chip band starting with `"Open-source and free"`. The URL becomes `/#privacy`.
- **Watch:** The sticky 68px header covering the top of the target section — there is **no** `scroll-margin-top` anywhere in the CSS, so the first row of chips can land partly under the nav. Confirm the chips are still fully legible after the jump.

### LAND-017 - Nav CTA "Clone from GitHub"
**P1** * Functional * `index.html:225` (`.btn.ghost`)

- **Pre:** Desktop viewport >560px.
- **Steps:**
  1. Hover the ghost button, then click it.
- **Expect:** Label is exactly `"Clone from GitHub"`. It is a `.btn.ghost` — transparent background, 1px `var(--line)` border, ink text. On hover the background becomes `var(--card)` (#FDFBF6) and it lifts 1px (`translateY(-1px)`). Opens `https://github.com/trojanuary/pair` in a new tab.
- **Watch:** The button text wrapping to two lines and blowing up the 68px nav height at ~600–700px width, just before the 560px rule hides it.

### LAND-018 - Nav CTA "Enter"
**P0** * Functional * `index.html:227` (`.btn.primary`)

- **Pre:** Any viewport.
- **Steps:**
  1. Hover the blue button, then click it.
- **Expect:** Label is exactly `"Enter"` (one word, capital E). Solid `var(--blue)` (#2555F5) with a blue glow shadow. On hover it darkens to `var(--blue-2)` (#1B44D6) and lifts 1px. Click navigates **in the same tab** to `/app.html`, which boots the reading workspace.
- **Watch:** This is the primary conversion path — if `/app.html` 404s or the app shell throws on boot, this is a release blocker. Also verify it is never `target="_blank"`.

### LAND-019 - Icon-only GitHub button swaps in below 560px
**P1** * Visual * `index.html:56-57,200-201,226`

- **Pre:** DevTools responsive mode.
- **Steps:**
  1. Set the width to 600px. Note which nav buttons are visible.
  2. Drag down to 500px.
  3. Hover the icon button and read its accessible name (Accessibility pane, or a screen reader).
- **Expect:** At 600px: `"Clone from GitHub"` (ghost) + `"Enter"` are visible, icon button hidden. At 500px: the ghost text button is hidden and a 42px-wide square icon-only button with the GitHub octocat mark appears in its place, still followed by `"Enter"`. The icon button has `aria-label="GitHub"` and its `<svg>` is `aria-hidden="true"`.
- **Watch:** Both the text button and the icon button showing simultaneously at exactly 560px (an off-by-one in the media query), which duplicates the same link twice in the nav.

### LAND-020 - Nav button keyboard focus ring
**P1** * Functional * `index.html:48` (`.btn:focus-visible`)

- **Pre:** Page loaded, mouse untouched.
- **Steps:**
  1. Press Tab repeatedly from the top of the page and watch each nav element.
- **Expect:** Tab order is: brand → `"Features"` → `"Docs"` → `"GitHub"` → `"Privacy"` → `"Clone from GitHub"` → icon GitHub (if visible) → `"Enter"`. The two `.btn` elements show a `2px solid var(--blue)` outline offset 2px. Enter activates the focused link.
- **Watch:** `.nlinks a`, `.brand` and `.scrollhint` have **no** custom focus style — they fall back to the UA default outline. Verify that default is actually visible against the warm `#F7F3EA` background and has not been killed by a global `outline:none`.

### LAND-021 - Nav links vanish with no replacement below 900px
**P1** * Regression * `index.html:195` (`.nlinks{display:none}`)

- **Pre:** DevTools responsive mode, or a real phone.
- **Steps:**
  1. Set the viewport to 375px wide.
  2. Look for any way to reach Features / Docs / GitHub / Privacy from the header.
- **Expect:** The whole `.nlinks` row is hidden at ≤900px and there is **no hamburger menu** — this is the current design. The header shows only: brand, GitHub icon button, `"Enter"`. Features/Docs/Privacy remain reachable from the footer (`index.html:368-373`) and Privacy from nothing else on-screen.
- **Watch:** If a hamburger is ever added, this check must be rewritten. Until then, confirm the footer links still work on mobile — they are the only remaining path to `/features.html`.

### LAND-022 - Rapid double-click on "Enter"
**P2** * Edge * `index.html:227`

- **Pre:** Throttle the network to "Slow 3G" in DevTools.
- **Steps:**
  1. Double-click `"Enter"` fast.
- **Expect:** Exactly one navigation to `/app.html`. The second click is absorbed by the in-flight navigation; no duplicate history entry that would require two Back presses to return to `/`.
- **Watch:** Press Back once after landing on the app — you must return to `/`, not to `/app.html` again.

---

## 3. Hero

### LAND-023 - Hero eyebrow
**P1** * Copy * `index.html:236` (`.eyebrow`)

- **Pre:** Page loaded at the top.
- **Steps:**
  1. Read the small blue text above the headline.
- **Expect:** Exactly `"Your Paired Reading Partner"`, rendered uppercase by CSS (`text-transform:uppercase`, `letter-spacing:.2em`, 12px/700) in `var(--blue)`. The source casing is title case — selecting and copying the text yields the title-case original.
- **Watch:** Someone hard-uppercasing the source string, which then reads oddly when copied or read aloud by a screen reader.

### LAND-024 - Hero H1 and the hand-drawn underline
**P0** * Visual * `index.html:237`

- **Pre:** Desktop viewport ≥1000px.
- **Steps:**
  1. Read the H1.
  2. Look at the second line.
  3. Resize the window from 1400px down to 400px and watch the type size.
- **Expect:** Two lines, forced by `<br>`: `"Active Learning"` then `"with AI"`. `"with AI"` is wrapped in `.mark` (`white-space:nowrap`) with an absolutely-positioned blue `.uline` SVG squiggle underneath, spanning the full phrase width plus a small overhang. Font size is `clamp(40px, 5.9vw, 74px)` — it scales fluidly and never drops below 40px or exceeds 74px.
- **Watch:** The underline drifting away from the text (it is positioned `bottom:-.16em` with `width:calc(100% + .08em)`) after a font-size or line-height change; and `"with AI"` breaking onto its own line despite `nowrap`.

### LAND-025 - Hero lead intro copy
**P0** * Copy * `index.html:239` (`.lead-intro`)

- **Pre:** Page loaded.
- **Steps:**
  1. Read the paragraph directly under the headline.
  2. Narrow the viewport to 375px and check where the first sentence breaks.
- **Expect:** Exactly: `"Not another chat‑with‑your‑PDF."` in bold (600), followed by `" Every note and answer stays pinned to the source, on your machine, and entirely yours."` The hyphens in `chat‑with‑your‑PDF` are **non-breaking hyphens (U+2011)**, so that phrase never splits across lines at any width.
- **Watch:** A copy edit replacing U+2011 with plain `-`; the phrase then wraps mid-word on narrow phones. Confirm by selecting the text and checking the character, or by shrinking to 320px and looking for a break.

### LAND-026 - Three hero benefit rows
**P0** * Copy * `index.html:240-242` (`.hrow`)

- **Pre:** Page loaded.
- **Steps:**
  1. Read the three icon+text rows below the lead paragraph, top to bottom.
- **Expect:** Exactly three rows, each a 22px outline icon in `var(--ink)` plus text with a bold lead-in:
  1. Map-pin icon — `"Pinned to the source"` (bold) `" — answers anchor to the exact spot on the page."`
  2. Struck-through cloud icon — `"Private by default"` (bold) `" — your PDF never leaves your browser."`
  3. Sliders icon — `"Yours to control"` (bold) `" — your model, your prompts, self‑hostable."` (non-breaking hyphen in `self‑hostable`)
  All three use em dashes (—), not hyphens.
- **Watch:** Icon vertical alignment — `.hrow .ic{margin-top:3px}` nudges the icon to sit on the text baseline; a line-height change will visibly de-align all three at once.

### LAND-027 - Hero illustration renders and has real alt text
**P1** * Visual * `index.html:245` (`.heroimg`)

- **Pre:** Page loaded, cache disabled.
- **Steps:**
  1. Look at the right side of the hero.
  2. Inspect the `<img>` and read `alt`, `width`, `height`.
  3. In DevTools → Network, confirm no request was made for it.
- **Expect:** A WebP illustration renders from an inline `data:image/webp;base64` URI — **zero** network requests. `alt` is exactly `"A reader sketching notes beside an open book, with a path leading to a glowing “AI” page"` (note the curly double quotes around AI). Explicit `width="900" height="675"` are set, so the space is reserved before decode and there is **no layout shift**.
- **Watch:** WebP support — every current browser handles it, but if a `<picture>` fallback is ever added, verify Safari 14-era behaviour. Also: this is the only image on the page with intrinsic dimensions; the other three do not have them (see LAND-073, LAND-081).

### LAND-028 - Hero clay glow sits behind, not over, the art
**P2** * Visual * `index.html:71` (`.mindwrap::before`)

- **Pre:** Desktop viewport ≥1000px.
- **Steps:**
  1. Look at the halo behind the hero illustration.
- **Expect:** A soft blurred radial `var(--clay)` (#EADCC8) glow sits **behind** the image (`z-index:0` on the pseudo-element, `z-index:1` on `.heroimg`). The illustration is crisp; only the halo is blurred (`filter:blur(8px)`).
- **Watch:** A stacking-context change putting the blur on top of the artwork, which makes the whole illustration look out of focus.

### LAND-029 - Hero copy staggers in on first paint
**P1** * Functional * `index.html:235,391-395 reveal()`

- **Pre:** Fresh hard reload, `prefers-reduced-motion` **off**, IntersectionObserver supported.
- **Steps:**
  1. Hard-reload `/` and watch the hero from the instant of paint (record the screen if needed).
- **Expect:** `.hero-copy` carries `data-stagger`, so its six `[data-reveal]` children animate in sequence with 80ms increments: eyebrow (0ms) → H1 (80ms) → lead paragraph (160ms) → the three benefit rows (240/320/400ms). Each fades from `opacity:0; translateY(16px)` to full over 0.6s.
- **Watch:** All six appearing simultaneously — that means the stagger container lost `data-stagger` and the children were each observed individually instead.

### LAND-030 - Hero art moves above the copy below 900px
**P1** * Visual * `index.html:189-190`

- **Pre:** DevTools responsive mode.
- **Steps:**
  1. Set the viewport to 1200px and note the order: copy left, art right.
  2. Drag to 880px.
- **Expect:** The two-column grid (`1.05fr .95fr`) collapses to a single column, and `.mindwrap{order:-1}` moves the illustration **above** the copy. The art is capped at `max-width:340px` and centred. Grid gap drops from 44px to 8px.
- **Watch:** The illustration staying below the copy (the `order:-1` rule being lost), which pushes the headline below the fold on phones.

### LAND-031 - Hero art is capped and right-aligned on desktop
**P2** * Visual * `index.html:72`

- **Pre:** Viewport 1600px wide.
- **Steps:**
  1. Look at the right column of the hero.
- **Expect:** `.heroimg` is `max-width:505px` and `margin-left:auto`, so on very wide screens it hugs the right edge of the 1240px `.wrap` rather than stretching. `height:auto` preserves the 900:675 aspect ratio.
- **Watch:** The image stretching to full column width on ultrawide displays if the `max-width` cap is removed.

### LAND-032 - Text selection and copy fidelity in the hero
**P2** * Copy * `index.html:236-242`

- **Pre:** Page loaded.
- **Steps:**
  1. Triple-click the lead paragraph, copy, and paste into a plain-text editor.
  2. Repeat for the third benefit row.
- **Expect:** Pasted text preserves the em dashes and the non-breaking hyphens exactly; no stray icon characters or SVG artefacts land in the clipboard (the icons are `<svg aria-hidden="true">`, which contribute no text).
- **Watch:** An icon being swapped for an emoji or a text glyph, which would then appear in copied text and in screen-reader output.

### LAND-033 - Hero with images disabled
**P2** * Edge * `index.html:245`

- **Pre:** Disable image loading (Chromium: Settings → Site settings → Images → Don't allow).
- **Steps:**
  1. Load `/`.
- **Expect:** The alt text `"A reader sketching notes beside an open book, with a path leading to a glowing “AI” page"` renders in the reserved 900×675 box; the hero copy column is unaffected and fully readable.
- **Watch:** The reserved box collapsing to zero height, which would jerk the rest of the page upward.

### LAND-034 - Hero at 320px (smallest realistic phone)
**P1** * Visual * `index.html:197-199`

- **Pre:** DevTools responsive mode at 320×568.
- **Steps:**
  1. Load `/` and read the hero without scrolling horizontally.
- **Expect:** No horizontal scrollbar on `<body>`. The H1 sits at its 40px `clamp` floor and wraps cleanly; the 24px `.wrap` side padding is intact on both sides; the three benefit rows keep their icons on the same line as their text.
- **Watch:** `"Active Learning"` overflowing the viewport at the 40px floor — the longest unbreakable word is "Learning", so confirm it fits.

---

## 4. Shared-key notice, trust chips & scroll hint

### LAND-035 - Shared-key notice copy
**P0** * Copy * `index.html:249` (`.keytop`)

- **Pre:** Page loaded, scrolled just below the hero.
- **Steps:**
  1. Read the blue-washed panel in full.
- **Expect:** A padlock icon in `var(--blue)` followed by exactly: `"The public app runs on a shared key with a small quota so you can try it instantly. For real use, add your own key in Settings — it stays in your browser and is never saved on our servers."` — with `"shared key with a small quota"` and `"in your browser"` both in bold (600, `var(--ink)`).
- **Watch:** This is the page's central trust claim. Any weakening (e.g. dropping "never saved on our servers") is a copy regression that must be caught. Also verify it stays consistent with the API-proxy behaviour documented in the README.

### LAND-036 - Shared-key notice styling and width
**P2** * Visual * `index.html:87-91`

- **Pre:** Desktop viewport ≥1000px, then 500px.
- **Steps:**
  1. Inspect the panel at both widths.
- **Expect:** Background `var(--blue-wash)` (#E9EEFE), 1px `#dbe4fd` border, 14px radius, `max-width:768px`, centred. Text is 13.5px `var(--ink-2)`, left-aligned inside a centred box. The padlock icon never shrinks (`flex:none`) and never wraps below the text.
- **Watch:** The icon collapsing to a sliver at narrow widths if `flex:none` is lost.

### LAND-037 - Six trust chips, exact labels and order
**P1** * Copy * `index.html:251` (`.chiprow`)

- **Pre:** Page loaded.
- **Steps:**
  1. Read the pill row left to right.
- **Expect:** Exactly six chips in this order: `"Open-source"`, `"Free"`, `"No tracking"`, `"No cloud upload"`, `"No login"`, `"Customizable"`. Each is a pill (`border-radius:999px`) on `var(--card)` with a 1px `var(--line)` border, a small `sh-sm` shadow, and an 18px blue icon.
- **Watch:** `"Customizable"` (US spelling) drifting to "Customisable" — the rest of the page uses US spelling (`summarize`, `Restyle`), so it must stay consistent.

### LAND-038 - Chips wrap without orphaning
**P2** * Visual * `index.html:82`

- **Pre:** DevTools responsive mode.
- **Steps:**
  1. Slowly drag the viewport from 1240px down to 320px, watching the chip row.
- **Expect:** Chips reflow via `flex-wrap:wrap` with a 12px gap and stay `justify-content:center`, so each wrapped row is centred. No chip is ever clipped, and no chip's label wraps internally.
- **Watch:** At ~700px a single chip landing alone on the last row — cosmetically acceptable, but confirm it is centred, not left-aligned.

### LAND-039 - Chips stagger in
**P2** * Functional * `index.html:251,391-395 reveal()`

- **Pre:** Fresh reload with reduced motion off; scroll so the chip row enters the viewport for the first time within 2.2 seconds of load.
- **Steps:**
  1. Watch the chips as they enter.
- **Expect:** The six chips fade/slide in left to right at 80ms intervals (0, 80, 160, 240, 320, 400ms) because `.chiprow .wrap` has `data-stagger`.
- **Watch:** After 2.2s the safety net at `index.html:399` reveals everything at once — see LAND-120. If you scroll too slowly you will not see this animation at all, and that is correct behaviour, not a bug.

### LAND-040 - Scroll hint label and target
**P1** * Functional * `index.html:253` (`.scrollhint`)

- **Pre:** Page loaded near the top.
- **Steps:**
  1. Read the centred link below the chips.
  2. Hover it.
  3. Click it.
- **Expect:** Uppercase label `"See it in action"` (source casing is title case; `text-transform:uppercase` renders it uppercase, 11px/700, `.2em` tracking) above a blue chevron. `aria-label="Scroll to see the live demo"`, and the chevron `<svg>` is `aria-hidden="true"`. Hover darkens the label from `var(--ink-2)` to `var(--ink)`. Click smooth-scrolls to `#app` — the product reel section.
- **Watch:** The `aria-label` overriding the visible text for screen readers: assistive tech announces `"Scroll to see the live demo"`, not "See it in action". Verify both strings are updated together if either changes.

### LAND-041 - Scroll hint chevron bobs
**P2** * Visual * `index.html:97-98` (`@keyframes bob`)

- **Pre:** Reduced motion **off**.
- **Steps:**
  1. Watch the chevron for ~5 seconds.
- **Expect:** It bobs 5px down and back on a 1.7s ease-in-out loop, infinitely.
- **Watch:** The animation continuing while the element is far off-screen (it does — this is a CSS animation with no observer gate). Acceptable, but confirm it does not cause continuous repaints that show up as jank on low-end devices.

### LAND-042 - Scroll hint chevron is still when reduced motion is on
**P1** * Functional * `index.html:204,208`

- **Pre:** OS setting: Reduce Motion **on** (macOS: System Settings → Accessibility → Display; Windows: Settings → Accessibility → Visual effects). Reload the page after toggling.
- **Steps:**
  1. Observe the chevron.
  2. Click the scroll hint.
- **Expect:** The chevron is completely static (`animation:none`), and the jump to `#app` is **instant**, not smooth (`html{scroll-behavior:auto}`).
- **Watch:** The media query being scoped only to `[data-reveal]` and forgetting the chevron and the button/card transitions — all four rules live in the same block at `index.html:204-209`.

### LAND-043 - Scroll hint keyboard activation
**P2** * Functional * `index.html:253`

- **Pre:** Page loaded, keyboard only.
- **Steps:**
  1. Tab until the scroll hint receives focus.
  2. Press Enter.
- **Expect:** A visible focus indicator (UA default — `.scrollhint` has no custom `:focus-visible` rule), and Enter navigates to `#app`. Pressing Tab again moves focus into the `<video>` controls.
- **Watch:** No visible focus ring at all on the warm background — this link sits between the chips and the video and is easy to lose.

---

## 5. Product reel video (#app)

### LAND-044 - Video poster shows before playback
**P0** * Visual * `index.html:256`

- **Pre:** Fresh load, do not click anything.
- **Steps:**
  1. Scroll to the `#app` section.
- **Expect:** A still frame from `docs/screenshots/reel-poster.jpg` fills the player box. The player is `max-width:1040px`, centred, with a 14px radius, 1px `var(--line)` border, the large `var(--sh)` shadow, and a white background.
- **Watch:** A black box instead of the poster — that means `reel-poster.jpg` 404'd. Check the Network tab, and note the path is **relative** (`docs/screenshots/...`), so it breaks if the page is ever served from a subdirectory.

### LAND-045 - Video does not autoplay
**P0** * Functional * `index.html:256`

- **Pre:** Fresh load in Chrome, Firefox, and Safari.
- **Steps:**
  1. Scroll the reel fully into view and wait 10 seconds without interacting.
- **Expect:** Playback does **not** start. The element has `controls preload="metadata" playsinline loop` but **no** `autoplay` and **no** `muted`. Audio never plays unprompted.
- **Watch:** Someone adding `autoplay muted` for "engagement" — that would start streaming a 17.8 MB file on every page view and burn mobile data.

### LAND-046 - Native controls work end to end
**P0** * Functional * `index.html:256`

- **Pre:** Reel in view, network at full speed.
- **Steps:**
  1. Click play.
  2. Scrub the timeline to the middle, then to near the end.
  3. Pause, then resume.
  4. Adjust the volume.
  5. Enter and exit fullscreen.
- **Expect:** Native browser controls (no custom UI). Scrubbing seeks without stalling for more than a couple of seconds. Fullscreen fills the screen and exits back to the same scroll position. Volume control is present and functional.
- **Watch:** Seeking failing if the server does not honour HTTP Range requests — on Vercel it does; on a naive local static server it may not, and the timeline will refuse to scrub.

### LAND-047 - Video loops
**P1** * Functional * `index.html:256`

- **Pre:** Reel playing.
- **Steps:**
  1. Seek to ~2 seconds before the end and let it run past the end.
- **Expect:** Playback restarts from 0 automatically and continues (the `loop` attribute), without showing an "ended" replay overlay.
- **Watch:** `loop` being dropped, which leaves a frozen last frame — usually a partial UI state that looks like a bug.

### LAND-048 - Video accessible name
**P2** * Functional * `index.html:256`

- **Pre:** DevTools → Accessibility pane, or a screen reader.
- **Steps:**
  1. Inspect the `<video>` element's computed accessible name.
- **Expect:** `"PairedX product walkthrough"` from `aria-label`.
- **Watch:** There are **no captions or a `<track>` element** on this video. If it ever gains narration, captions become a requirement — flag it at that point.

### LAND-049 - Video on Slow 3G
**P1** * Perf * `index.html:256`

- **Pre:** DevTools → Network → "Slow 3G".
- **Steps:**
  1. Load `/`, scroll to the reel, click play.
  2. Wait, then scroll away and back.
- **Expect:** The poster shows immediately (153 KB). Only metadata is fetched until play is pressed. After pressing play the browser shows its own buffering spinner; the rest of the page stays fully interactive and scrollable throughout. Nothing on the page is blocked on the video.
- **Watch:** The 17.8 MB reel being requested in full before play — check the Network waterfall for a single huge request at page load rather than a range request.

### LAND-050 - Navigating away mid-playback
**P2** * Edge * `index.html:256`

- **Pre:** Reel playing with audio audible.
- **Steps:**
  1. While it plays, click the nav `"Enter"` button.
  2. Press Back.
- **Expect:** Navigation happens immediately; audio stops as the page unloads. On Back, the page restores (possibly from bfcache) with the video paused or at its prior position — never playing invisibly in the background.
- **Watch:** Firefox/Safari bfcache restoring a *playing* video while the user is scrolled elsewhere, producing invisible audio.

### LAND-051 - Video with the file missing
**P1** * Edge * `index.html:256`

- **Pre:** Locally, temporarily rename `docs/screenshots/pairedx-reel.mp4`.
- **Steps:**
  1. Reload `/`, scroll to `#app`, click play.
- **Expect:** The poster still renders (it is a separate file), and the play attempt produces a native browser error state inside the player box. **Critically:** the page layout is unchanged, the caption below still renders, and no JavaScript error is thrown — the reveal script keeps working for every section below.
- **Watch:** The player box collapsing to zero height and yanking the whole page upward.

### LAND-052 - Reel caption copy
**P0** * Copy * `index.html:257` (`.cap`)

- **Pre:** Page loaded.
- **Steps:**
  1. Read the caption directly below the player.
- **Expect:** Exactly: `"Every note ties back to the exact spot it came from — a connector links each card to its highlighted passage or captured figure."` followed by a link reading `"Try it live →"` (with a real right-arrow character). Centred, 14px, `var(--ink-2)`, `max-width:560px`.
- **Watch:** The `→` becoming `->` after an editor mangles the character.

### LAND-053 - "Try it live →" uses the /app rewrite
**P1** * Functional * `index.html:257`, `vercel.json`

- **Pre:** Production `pairedx.com`.
- **Steps:**
  1. Click `"Try it live →"`.
  2. Note the address bar.
  3. Repeat on a plain static host (local `python3 -m http.server`, or GitHub Pages).
- **Expect:** On Vercel: navigates to `/app` (**not** `/app.html`) and the app loads, because `vercel.json` rewrites `/app` → `/app.html`. The address bar stays on `/app`. On a plain static host without that rewrite it **404s** — a known host-dependent difference.
- **Watch:** This is the **only** link on the page using bare `/app`; the other four CTAs all use `/app.html`. If `vercel.json` is edited or the site moves hosts, this is the first link to break, and it is easy to miss because the four other CTAs keep working.

### LAND-054 - Reel section anchor
**P1** * Functional * `index.html:255`

- **Pre:** Any scroll position.
- **Steps:**
  1. Navigate directly to `/#app` by typing it in the address bar.
- **Expect:** The page loads scrolled to the `.shot` section with the video visible. The URL keeps `#app`.
- **Watch:** With no `scroll-margin-top`, the sticky 68px nav may clip the top edge of the player — confirm the video frame is still fully usable.

### LAND-055 - Player at mobile width
**P1** * Visual * `index.html:211` (`.reelvid`)

- **Pre:** Viewport 375px.
- **Steps:**
  1. Scroll to the reel and play it.
- **Expect:** `width:100%` with the `max-width:1040px` cap inactive at this size, so the player spans the viewport minus padding. Native mobile controls are reachable and the 14px radius/border are preserved. `playsinline` keeps it inline — iOS Safari does **not** force it into the fullscreen player.
- **Watch:** iOS Safari hijacking playback into fullscreen if `playsinline` is removed — test this specifically on a real iPhone, not a simulator.

### LAND-056 - Rapid play/pause hammering
**P2** * Edge * `index.html:256`

- **Pre:** Reel in view.
- **Steps:**
  1. Click play/pause 10 times in quick succession.
- **Expect:** The final state matches the last click. No console errors (in particular, no `AbortError: The play() request was interrupted` — there is no custom JS driving this element, so the browser handles it natively).
- **Watch:** If a custom play handler is ever added, this is where the AbortError will show up.

---

## 6. Feature cards (#features)

### LAND-057 - Section heading and eyebrow
**P0** * Copy * `index.html:263-264`

- **Pre:** Scroll to the features section.
- **Steps:**
  1. Read the centred header block.
- **Expect:** Blue uppercase eyebrow `"What makes it different"` above the H2 `"Source-linked. Private. Yours."` — three sentences, three periods, regular hyphen in "Source-linked". H2 size is `clamp(30px, 4.4vw, 46px)`.
- **Watch:** The trailing period on "Yours." being dropped; the page uses period-terminated H2s consistently (compare LAND-068, LAND-079, LAND-089).

### LAND-058 - Card 1 - "Pinned to the source"
**P0** * Copy * `index.html:268-269`

- **Pre:** Features section in view.
- **Steps:**
  1. Read the first card top-left.
- **Expect:** Map-pin icon in a 44×44 `var(--blue-wash)` rounded tile (left) and the numeral `"1"` in Fraunces 26px `var(--line)` (right). H3 `"Pinned to the source"`; body `"Every highlight, screenshot, and AI answer anchors to the exact page coordinate — trace any claim back with one click."`
- **Watch:** The card numeral being nearly invisible by design (`color:var(--line)` = #E7DECD) — confirm it is faint-but-present, not missing.

### LAND-059 - Card 2 - "Nothing leaves your machine"
**P0** * Copy * `index.html:272-273`

- **Pre:** Features section in view.
- **Steps:**
  1. Read the second card.
- **Expect:** Struck-through cloud icon, numeral `"2"`, H3 `"Nothing leaves your machine"`, body `"Your PDF opens locally in the browser. No upload, no backend database, no account — we can never see it."`
- **Watch:** Consistency with LAND-035 and LAND-087 — all three make the same privacy claim and must not contradict each other.

### LAND-060 - Card 3 - "Bring your own model"
**P0** * Copy * `index.html:276-277`

- **Pre:** Features section in view.
- **Steps:**
  1. Read the third card.
- **Expect:** Sliders icon, numeral `"3"`, H3 `"Bring your own model"`, body `"Point it at OpenRouter or any OpenAI-compatible endpoint. Your key stays in your browser, sent per request."`
- **Watch:** `"OpenRouter"` and `"OpenAI-compatible"` casing. If the app ever changes its default provider, this string must change with it — cross-check against the Settings panel in the app.

### LAND-061 - Card 4 - "See the agent's work" (curly apostrophe)
**P1** * Copy * `index.html:280-281`

- **Pre:** Features section in view.
- **Steps:**
  1. Read the fourth card.
  2. Select the H3, copy it, and inspect the apostrophe in a text editor.
- **Expect:** Eye icon, numeral `"4"`, H3 `"See the agent’s work"` using a **curly** right single quote (U+2019), body `"Every answer is inspectable — expand the trace to read each step, tool call, and source it drew from."`
- **Watch:** This is the **only** curly apostrophe in the whole file. Every other apostrophe (`agent's` at `index.html:313`, `we're` and `isn't` at 343, `doesn't` at 337, `Don't` at 352) is a straight ASCII quote. This inconsistency is pre-existing — the check exists so nobody "fixes" one without deciding on all six.

### LAND-062 - Card 5 - "Notes are a file you own"
**P0** * Copy * `index.html:284-285`

- **Pre:** Features section in view.
- **Steps:**
  1. Read the fifth card.
- **Expect:** Download-arrow icon, numeral `"5"`, H3 `"Notes are a file you own"`, body `"Everything exports to portable JSON (or PDF) that lives right next to your PDF. No lock-in, ever."`
- **Watch:** The claim "(or PDF)" — verify the app's export menu still offers both JSON and PDF. If an export format is removed, this string is stale marketing.

### LAND-063 - Card 6 - "Open-source & self-hostable"
**P1** * Copy * `index.html:288-289`

- **Pre:** Features section in view.
- **Steps:**
  1. Read the sixth card.
  2. Compare its hyphens with the comparison-table row at `index.html:341`.
- **Expect:** Chevrons icon, numeral `"6"`, H3 `"Open-source & self-hostable"` with **regular ASCII hyphens**, body `"AGPL-licensed and dependency-light. Read it, fork it, run it yourself — and edit every prompt."`
- **Watch:** The comparison-table row (LAND-096) spells the same phrase `"Open‑source & self‑hostable"` with **non-breaking hyphens (U+2011)**. Visually identical, byte-different. Do not "unify" one without the other, and do not assume a find-and-replace caught both.

### LAND-064 - Card hover lift
**P1** * Visual * `index.html:114-115` (`.card:hover`)

- **Pre:** Desktop with a mouse, reduced motion off.
- **Steps:**
  1. Hover each of the six cards in turn.
  2. Move the pointer off.
- **Expect:** Each card rises 3px (`translateY(-3px)`) and its shadow deepens from `var(--sh-sm)` to `var(--sh)` over 0.2s, then settles back. Only the hovered card moves. Cards are **not** links — the cursor stays as an arrow, not a pointer.
- **Watch:** A tester expecting the cards to be clickable. They are not, by design — no `<a>` wraps them.

### LAND-065 - Card grid: 3 → 2 → 1 columns
**P1** * Visual * `index.html:113,191,199`

- **Pre:** DevTools responsive mode.
- **Steps:**
  1. Set the width to 1200px, then 880px, then 500px, counting cards per row each time.
- **Expect:** 1200px → `repeat(3,1fr)`, two rows of three. 880px → `1fr 1fr`, three rows of two. 500px → `1fr`, six stacked rows. The 18px gap holds at every size and no card is clipped.
- **Watch:** At 880–900px an orphan card sitting alone on a third row — with six cards this cannot happen at 2 columns, so an orphan means a card was added or removed without updating this check.

### LAND-066 - Six cards stagger in
**P2** * Functional * `index.html:266,391-395 reveal()`

- **Pre:** Fresh load, reduced motion off, then scroll to the features grid within 2.2s.
- **Steps:**
  1. Watch the grid as it enters the viewport.
- **Expect:** Cards fade/rise in reading order at 80ms increments (0 → 400ms) because `.grid` carries `data-stagger`. The header block above (`.head`) reveals separately as its own `[data-reveal]`.
- **Watch:** See LAND-120 — past 2.2s everything is already revealed, so this animation is only observable on a fast scroll immediately after load.

### LAND-067 - #features anchor is reachable and distinct from /features.html
**P1** * Functional * `index.html:219,260`

- **Pre:** Any state.
- **Steps:**
  1. Navigate to `/#features` in the address bar.
  2. Then click the nav link `"Features"`.
- **Expect:** `/#features` scrolls to this six-card section on the **same** page. The nav link `"Features"` navigates to the **separate** page `/features.html`. These are two different destinations and both must work.
- **Watch:** A refactor pointing the nav link at `#features`, which would silently kill all traffic to the standalone features page.

---

## 7. Settings & Templates splits

### LAND-068 - "Open Settings. Control everything." heading
**P0** * Copy * `index.html:297-298`

- **Pre:** Scroll to the first split section.
- **Steps:**
  1. Read the eyebrow and H2.
- **Expect:** Eyebrow `"Deep control"`. H2 across two lines via `<br>`: `"Open Settings."` then `"Control everything."` — the phrase `"Control everything"` is wrapped in `.mark` with the blue underline squiggle, and the final period sits **outside** the mark span.
- **Watch:** The period being pulled inside `.mark`, which puts the underline under the period too and looks off.

### LAND-069 - First split body copy and CTA
**P0** * Copy * `index.html:299-300`

- **Pre:** First split in view.
- **Steps:**
  1. Read the paragraph, then hover and click the button.
- **Expect:** Paragraph is exactly `"Choose the model, tune every prompt, and switch tools on or off — all from the browser, nothing hidden."` (capped at `max-width:400px`). Below it a `.btn.primary.lg` labelled exactly `"Open Settings"` — 13px/22px padding, 15.5px text — navigating in the same tab to `/app.html`.
- **Watch:** The button label promising to open Settings but the app booting to a blank workspace instead. This is a copy-vs-behaviour mismatch worth flagging even though the destination is technically correct.

### LAND-070 - Dashed doodle under the first split
**P2** * Visual * `index.html:301` (`.doodle`)

- **Pre:** First split in view.
- **Steps:**
  1. Look below the `"Open Settings"` button.
- **Expect:** A 130px-wide blue dashed squiggle at 70% opacity (`stroke-dasharray="1 7"`), `aria-hidden="true"` so it is not announced.
- **Watch:** The dash pattern rendering as a solid line — some rasterisers collapse `1 7` at small scales. Zoom to 200% to confirm.

### LAND-071 - First split screenshot is inlined
**P1** * Visual * `index.html:303` (`.setframe`)

- **Pre:** DevTools → Network open, cache disabled.
- **Steps:**
  1. Scroll the first split into view and watch the Network tab.
  2. Inspect the `<img>` alt.
- **Expect:** No network request — the image is a `data:image/webp;base64` blob. Alt is exactly `"PairedX settings — model picker, editable prompts, and toggles for web search, diagrams, and illustration"`. The frame is `max-width:390px`, centred, with a 16px radius, 1px border, and the large shadow; `overflow:hidden` clips the image corners to the radius.
- **Watch:** The `loading="lazy"` attribute on this image is a no-op for a data URI — harmless, but do not use it as evidence the image is lazy-loaded.

### LAND-072 - Second split is reversed
**P1** * Visual * `index.html:147,307`

- **Pre:** Desktop viewport ≥1000px.
- **Steps:**
  1. Compare the two split sections.
- **Expect:** The first split is copy-left / image-right (`1.1fr .9fr`). The second carries `.split.rev` (`.9fr 1.1fr`) and is image-left / copy-right — a deliberate zig-zag. Both use a 48px gap.
- **Watch:** At ≤900px both collapse to a single column and the **source order** wins, so the second split shows its image **above** its copy while the first shows copy above image. Confirm that asymmetry is acceptable on mobile.

### LAND-073 - Templates screenshot loads lazily
**P1** * Functional * `index.html:309`

- **Pre:** Fresh load at the top of the page, Network tab filtered to "Img", cache disabled.
- **Steps:**
  1. Confirm `settings-templates.jpg` has **not** been requested.
  2. Scroll toward the second split.
  3. Inspect the alt text.
- **Expect:** The request for `docs/screenshots/settings-templates.jpg` (183 KB) fires only as the image nears the viewport (`loading="lazy"`). Alt is exactly `"Settings → Templates: every system prompt and the agent's tool descriptions are editable, with Export / Import / Reset"` (straight apostrophe in `agent's`, real `→` arrow).
- **Watch:** This `<img>` has **no** `width`/`height`, so the frame has zero height until the JPEG decodes — look for a visible layout jump as the surrounding copy shifts. Compare with the hero image (LAND-027), which does reserve space.

### LAND-074 - "Tune every prompt." heading
**P0** * Copy * `index.html:311-312`

- **Pre:** Second split in view.
- **Steps:**
  1. Read the eyebrow and H2.
- **Expect:** Eyebrow `"Editable prompts"`. H2 `"Tune every prompt."` on one line, with only the word `"prompt"` wrapped in `.mark` and underlined by the blue squiggle; the period is outside the mark.
- **Watch:** The underline scaling to the whole heading rather than the single word.

### LAND-075 - Second split body copy with non-breaking arrow
**P1** * Copy * `index.html:313`

- **Pre:** Second split in view, then narrow the viewport to 375px.
- **Steps:**
  1. Read the paragraph.
  2. At 375px, check whether `Settings → Templates` ever splits across lines.
- **Expect:** Exactly: `"Every system prompt — even the tool-using agent's tool descriptions — is editable under Settings → Templates. Restyle the assistant's voice, then export or import your whole set as JSON."` with `"Settings → Templates"` in bold, joined by `&nbsp;` entities on both sides of the arrow, so it never breaks across lines at any width.
- **Watch:** The `&nbsp;` entities being stripped by a formatter, after which `→` can end up alone at the start of a line on narrow screens.

### LAND-076 - "Open Templates" CTA
**P0** * Functional * `index.html:314`

- **Pre:** Second split in view.
- **Steps:**
  1. Hover, then click the blue button.
- **Expect:** Label exactly `"Open Templates"`. `.btn.primary.lg`, hover darkens to `var(--blue-2)` and lifts 1px, click navigates same-tab to `/app.html`.
- **Watch:** Both split CTAs point at the identical URL `/app.html` despite different labels ("Open Settings" / "Open Templates"). If deep links to specific panels are ever added, both must be updated.

### LAND-077 - Split sections at 880px
**P1** * Visual * `index.html:192`

- **Pre:** DevTools responsive mode at 880px.
- **Steps:**
  1. Scroll through both split sections.
- **Expect:** Both collapse to `grid-template-columns:1fr` with a 26px gap. Paragraphs still respect `max-width:400px` (so they do not run edge to edge), and the `.setframe` stays capped at 390px and centred by `margin:0 auto`.
- **Watch:** The 400px paragraph cap looking oddly narrow next to a full-width heading — check it reads as intentional, not broken.

### LAND-078 - Both settings screenshots still match the shipped app
**P1** * Regression * `index.html:303,309`

- **Pre:** Open `/app.html` in a second tab and open its Settings panel.
- **Steps:**
  1. Compare the inlined settings screenshot (first split) with the live Settings panel: model picker, prompt fields, and the toggles for web search, diagrams, and illustration.
  2. Compare the Templates screenshot with the live Settings → Templates tab, specifically the presence of Export / Import / Reset controls.
- **Expect:** Both screenshots depict controls that still exist in the shipped app with recognisably the same labels.
- **Watch:** This is the single most common landing-page rot after a UI rework — the marketing screenshots keep showing a panel layout that no longer exists. Both alt strings also name specific controls and must be re-checked when the images are.

---

## 8. OCR band (#ocr)

### LAND-079 - OCR eyebrow and heading
**P0** * Copy * `index.html:322-323`

- **Pre:** Scroll to the OCR section.
- **Steps:**
  1. Read the eyebrow and H2.
- **Expect:** Eyebrow exactly `"New · Scanned PDFs"` — separated by a **middle dot (·, U+00B7)**, not a bullet or a hyphen — rendered uppercase and blue. H2 exactly `"Even scans become real text."` with a trailing period.
- **Watch:** The word `"New"` staying on the page long after the feature stops being new. Decide an expiry when reviewing this check.

### LAND-080 - OCR body copy
**P0** * Copy * `index.html:324`

- **Pre:** OCR section in view.
- **Steps:**
  1. Read the paragraph under the heading.
- **Expect:** Exactly: `"Open an image-only PDF and PairedX offers one-tap OCR that runs right in your browser — your file never leaves your machine. It rebuilds a true text layer, so highlights, search, and the AI all work like any other PDF."` with `"right in your browser"` bold. It is styled by an **inline** `style` attribute (`max-width:660px; margin:14px auto 0; color:var(--ink-2); font-size:17px; line-height:1.5`) — the only body paragraph on the page not styled by a class.
- **Watch:** Because the styling is inline, a stylesheet refactor will not touch it — it can end up as the one paragraph still using the old type scale.

### LAND-081 - OCR banner image
**P1** * Visual * `index.html:326`

- **Pre:** Fresh load at the top, Network filtered to "Img".
- **Steps:**
  1. Confirm `feat-ocr-banner.jpg` has not been requested.
  2. Scroll to the OCR section.
  3. Inspect the alt text and the framing.
- **Expect:** `docs/screenshots/feat-ocr-banner.jpg` (480 KB) requests only on approach (`loading="lazy"`). Alt is exactly `"PairedX detecting a scanned PDF and offering one-tap on-device OCR"`. It sits in a `.frame` (16px radius, 1px border, big shadow, `overflow:hidden`) with an inline `margin-top:34px`, capped at `max-width:1040px` and centred.
- **Watch:** Like LAND-073, this `<img>` has no intrinsic `width`/`height`, so a 480 KB decode on a slow connection produces a visible layout jump. Test on Slow 3G specifically.

### LAND-082 - The `.frame` here has no browser chrome
**P2** * Visual * `index.html:102-107,326`

- **Pre:** OCR section in view.
- **Steps:**
  1. Look at the top of the framed banner.
- **Expect:** A plain bordered card — **no** traffic-light dots and **no** fake URL bar. The CSS for `.frame-bar`, `.dot` and `.frame-url` (`index.html:103-105`) is defined but **unused anywhere in the page**, i.e. dead CSS.
- **Watch:** Someone reviving that chrome for one image only, which would make this banner inconsistent with the two `.setframe` screenshots that have no chrome either.

### LAND-083 - #ocr anchor
**P2** * Functional * `index.html:319`

- **Pre:** Any state.
- **Steps:**
  1. Navigate to `/#ocr`.
- **Expect:** Scrolls to the OCR section with the eyebrow, heading and banner in view. No nav link points here — the anchor exists for direct sharing only.
- **Watch:** The `id` being dropped during a section rewrite, silently breaking any external links that were shared.

### LAND-084 - OCR band at 375px
**P1** * Visual * `index.html:324,326`

- **Pre:** Viewport 375px.
- **Steps:**
  1. Read the OCR section end to end.
- **Expect:** The 17px paragraph stays inside the 24px `.wrap` padding with no horizontal overflow. The banner scales down proportionally (`width:100%`) and its corner radius is preserved. Text in the screenshot will be unreadably small at this size — acceptable, since the alt text carries the meaning.
- **Watch:** Horizontal body scroll caused by the `max-width:660px` inline style fighting the wrap padding.

---

## 9. Privacy chips (#privacy)

### LAND-085 - Four privacy chips, exact labels and order
**P0** * Copy * `index.html:330` (`.pchip`)

- **Pre:** Scroll to the privacy band (or click nav `"Privacy"`).
- **Steps:**
  1. Read the four chips left to right.
- **Expect:** Exactly four, in this order: `"Open-source and free"`, `"Cookieless analytics"`, `"We never see your PDF"`, `"Notes stay in your browser"`. Each has a 22px blue icon (chevrons / shield-check / padlock / speech bubble) on a `var(--card)` background with a 14px radius and a 1px border.
- **Watch:** `"Cookieless analytics"` is a legal-adjacent claim — verify Vercel Analytics is still configured cookieless before signing off. If the analytics provider changes, this chip must change with it.

### LAND-086 - Privacy chips: 4 → 2 → 1 columns
**P1** * Visual * `index.html:156,193,199`

- **Pre:** DevTools responsive mode.
- **Steps:**
  1. Check the layout at 1200px, 880px, and 500px.
- **Expect:** 1200px → `repeat(4,1fr)` in one row. 880px → `1fr 1fr`, two rows of two. 500px → `1fr`, four stacked rows. 16px gap throughout.
- **Watch:** `"Notes stay in your browser"` (the longest label) wrapping to two lines inside its chip at 4 columns on a ~1000px screen, which makes that one chip taller than its three siblings.

### LAND-087 - Privacy claims are internally consistent
**P0** * Copy * `index.html:249,273,330,337`

- **Pre:** Read the whole page top to bottom.
- **Steps:**
  1. Compare four claims: the shared-key notice (`index.html:249`), feature card 2 (`index.html:273`), the privacy chips (`index.html:330`), and the comparison sub-line (`index.html:337`).
- **Expect:** No contradictions. `"We never see your PDF"` and `"Your PDF opens locally in the browser. No upload, no backend database, no account — we can never see it."` must both remain true given the app actually proxies **prompts** (not files) through `api/ai.js`. The shared-key notice is the only place that discloses the server-side proxy.
- **Watch:** A future feature that uploads any part of the document would invalidate three separate strings at once. Treat any change to `api/ai.js` as a trigger to re-run this check.

### LAND-088 - Privacy section has a visible boundary
**P2** * Visual * `index.html:155,330`

- **Pre:** Scroll from the OCR banner to the privacy chips.
- **Steps:**
  1. Observe the spacing between sections.
- **Expect:** `.priv{padding:26px 0 8px}` — a deliberately tight band between the OCR section and the comparison section. Chips read as a horizontal rule of trust badges, not as a full section.
- **Watch:** The tight top padding making the chips look glued to the OCR banner above at narrow widths where the banner is full-bleed.

---

## 10. Comparison table (#compare)

### LAND-089 - Comparison header block
**P0** * Copy * `index.html:335-337`

- **Pre:** Scroll to the comparison section.
- **Steps:**
  1. Read the eyebrow, H2 and sub-line.
- **Expect:** Eyebrow exactly `"Why not just use…?"` — with a real **ellipsis character (…, U+2026)**, not three periods. H2 exactly `"The combination is the point."` Sub-line exactly `"Any one of these features exists somewhere. Having them together — pinned, private, and yours — doesn't."` with `"pinned, private, and yours"` in bold and a straight apostrophe in `doesn't`.
- **Watch:** The ellipsis degrading to `...`, which changes the rendered letter-spacing noticeably at `.2em` tracking.

### LAND-090 - Table column headers
**P0** * Copy * `index.html:340`

- **Pre:** Comparison table in view on a viewport ≥800px.
- **Steps:**
  1. Read the header row left to right.
- **Expect:** Six cells: an **empty** first header (over the row-label column), then `"PairedX"`, `"NotebookLM"`, `"ChatPDF"`, `"Beaver"` followed by a superscript `1`, and `"Readwise"`. The `"PairedX"` cell carries `.pair`, so it has a `var(--blue-wash)` background, `var(--blue-2)` text, and `font-weight:800` — visibly heavier than the other four (600, `var(--ink-2)`).
- **Watch:** The competitor names' exact casing — `NotebookLM` (no space, capital LM), `ChatPDF` (no space), `Readwise` (one word). These are trademarks and typos read as sloppiness.

### LAND-091 - Row 1 - "Notes pin to an exact spot in the PDF"
**P0** * Functional * `index.html:341`

- **Pre:** Table in view.
- **Steps:**
  1. Read row 1 across all five product columns.
  2. Hover each symbol and read the tooltip.
- **Expect:** Label `"Notes pin to an exact spot in the PDF"`. Values: PairedX `✓`, NotebookLM `—`, ChatPDF `—`, Beaver `~`, Readwise `—`. Tooltips (`title` attributes): `"Yes"` on `✓`, `"No"` on `—`, `"Partial"` on `~`.
- **Watch:** A `title` attribute going missing on any single cell — there are 24 symbol cells and it is easy to drop one during an edit.

### LAND-092 - Row 2 - "Opens your local file — no full‑file upload"
**P0** * Functional * `index.html:341`

- **Pre:** Table in view.
- **Steps:**
  1. Read row 2 across all columns.
- **Expect:** Label `"Opens your local file — no full‑file upload"` (em dash after "file", **non-breaking hyphen** in `full‑file`). Values: PairedX `✓`, NotebookLM `—`, ChatPDF `—`, Beaver `✓`, Readwise `—`. Beaver is the only competitor with a `✓` on this row.
- **Watch:** Beaver's `✓` being flipped to `—` in a careless edit — it is the one row where a competitor genuinely matches PairedX, and removing it would be an unfair claim.

### LAND-093 - Row 3 - "Bring your own model / key"
**P0** * Functional * `index.html:341`

- **Pre:** Table in view.
- **Steps:**
  1. Read row 3 across all columns.
- **Expect:** Label `"Bring your own model / key"` (spaces around the slash). Values: PairedX `✓`, NotebookLM `—`, ChatPDF `—`, Beaver `—`, Readwise `~`.
- **Watch:** Readwise's `~` is explained only in the footnote ("Readwise lets you bring your own OpenAI key only") — the two must stay in sync.

### LAND-094 - Row 4 - "Inspectable agent trace"
**P1** * Functional * `index.html:341`

- **Pre:** Table in view.
- **Steps:**
  1. Read row 4 across all columns.
- **Expect:** Label `"Inspectable agent trace"`. Values: PairedX `✓`, and `—` for **all four** competitors. This is the only row where PairedX is the sole `✓`.
- **Watch:** Cross-check against feature card 4 (`"See the agent’s work"`, LAND-061) — if the trace UI is ever removed from the app, both this row and that card become false.

### LAND-095 - Row 5 - "Notes are a portable file you own"
**P1** * Functional * `index.html:341`

- **Pre:** Table in view.
- **Steps:**
  1. Read row 5 across all columns.
- **Expect:** Label `"Notes are a portable file you own"`. Values: PairedX `✓`, NotebookLM `—`, ChatPDF `—`, Beaver `~`, Readwise `~`. Two partials in one row.
- **Watch:** The footnote's closing sentence `"Portable‑notes support varies by export."` justifies both `~` marks — verify it is still present.

### LAND-096 - Row 6 - "Open‑source & self‑hostable"
**P1** * Functional * `index.html:341`

- **Pre:** Table in view.
- **Steps:**
  1. Read row 6 across all columns.
  2. Select the label, copy it, and compare byte-for-byte with feature card 6's H3.
- **Expect:** Label `"Open‑source & self‑hostable"` using **non-breaking hyphens (U+2011)** and a literal `&` (encoded as `&amp;` in source). Values: PairedX `✓`, and `—` for all four competitors.
- **Watch:** Card 6 at `index.html:289` uses plain ASCII hyphens for the same phrase (LAND-063). Visually identical, different bytes — a find-and-replace on `Open-source` will hit one and miss the other.

### LAND-097 - Price row
**P0** * Copy * `index.html:341` (`.priceRow`)

- **Pre:** Table in view.
- **Steps:**
  1. Read the last row.
- **Expect:** Label `"Price"`. Values: PairedX `"Free"`, NotebookLM `"Free"`, ChatPDF `"Freemium"`, Beaver `"Free"`, Readwise `"~$120/yr"`. The whole row is `font-weight:600` and `var(--ink)`; the PairedX cell is additionally `var(--blue-2)` on the blue wash. This row has `border-bottom:none` (it is `tbody tr:last-child`).
- **Watch:** The `~$120/yr` figure going stale — it is the only hard number on the page and the footnote only vouches for "as of July 2026". Also verify `.priceRow` is the **only** row whose cells use `<span class="txt">` — that class has **no CSS definition anywhere**, so it is inert; do not rely on it for styling.

### LAND-098 - Only 7 body rows exist
**P1** * Regression * `index.html:341`

- **Pre:** Table in view.
- **Steps:**
  1. Count the `<tbody>` rows.
- **Expect:** Exactly 7: the six feature rows (LAND-091 to LAND-096) plus the price row. Six of them share a 1px `var(--line)` bottom border; the last has none.
- **Watch:** A row being added without a matching QA check here, or without extending the footnote if it introduces a new `~`.

### LAND-099 - PairedX column highlight runs the full table height
**P1** * Visual * `index.html:134-137`

- **Pre:** Table in view on desktop.
- **Steps:**
  1. Look down the second column from header to price row.
- **Expect:** An unbroken `var(--blue-wash)` (#E9EEFE) vertical band covering the header cell and all 7 body cells — every one of them carries `class="pair"`. No gaps or lighter cells.
- **Watch:** A single missed `class="pair"` on one cell creates a visible notch in the band; scan the column edge-on rather than reading cell by cell.

### LAND-100 - Symbol colours are distinguishable
**P1** * Visual * `index.html:138-140`

- **Pre:** Table in view.
- **Steps:**
  1. Compare a `✓`, a `—` and a `~`.
  2. Enable a greyscale filter (DevTools → Rendering → Emulate vision deficiencies → Achromatopsia).
- **Expect:** `✓` is `var(--blue)` 800-weight 16px; `~` is `var(--blue)` 800-weight; `—` is a muted `#CBC0AD`. In greyscale, `✓` and `—` remain clearly different in both shape and weight.
- **Watch:** `✓` and `~` are the **same colour and weight** — they are distinguished only by glyph shape. Confirm at 100% zoom that a `~` is not mistakable for a `✓` at a glance, and that the `title` tooltips ("Yes" vs "Partial") are the real disambiguator.

### LAND-101 - Table scrolls horizontally below 720px
**P0** * Functional * `index.html:127-128,132`

- **Pre:** DevTools responsive mode at 375px.
- **Steps:**
  1. Scroll to the comparison table.
  2. Swipe/drag the table horizontally.
  3. Check whether the page body itself scrolls sideways.
- **Expect:** `table.cmp` has `min-width:720px` inside `.cmp-scroll{overflow-x:auto}`, so the table scrolls **inside its own bordered container** with momentum scrolling on iOS (`-webkit-overflow-scrolling:touch`). The page `<body>` must **not** scroll horizontally. The row-label column is `min-width:236px`.
- **Watch:** The row-label column is **not sticky**, so once you scroll right you lose sight of which row you are reading. That is current behaviour — confirm it is still tolerable, and that the scroll affordance (a partially visible fifth column) is apparent.

### LAND-102 - Table footnote copy
**P0** * Copy * `index.html:343` (`.cmp-note`)

- **Pre:** Comparison section in view.
- **Steps:**
  1. Read the small centred paragraph under the table in full.
- **Expect:** Exactly: `"Compared with the mainstream tools we're asked about most, to the best of our knowledge as of July 2026 — corrections welcome. ~ = partial. 1 Beaver is a free Zotero plugin (so it needs Zotero, and pins via Zotero's own annotations) but routes AI through its own cloud and isn't self‑hostable. Readwise lets you bring your own OpenAI key only, and isn't self‑hostable. Portable‑notes support varies by export."` — the `~` is bold and blue (`.cmp-note b{color:var(--blue)}`), the `1` is a superscript matching the header marker, and `self‑hostable` / `Portable‑notes` use non-breaking hyphens.
- **Watch:** `"as of July 2026"` is a dated claim and the single most likely thing on this page to go stale. Treat it as a review trigger every release.

### LAND-103 - Footnote marker links back to Beaver
**P2** * Visual * `index.html:340,343`

- **Pre:** Comparison section in view.
- **Steps:**
  1. Click the superscript `1` next to `"Beaver"` in the header.
- **Expect:** Nothing happens — the superscript is **plain text**, not a link, in both the header and the footnote. This is current behaviour, not a bug.
- **Watch:** A tester filing this as broken. If footnote linking is ever added, both markers need matching `id`/`href` pairs.

### LAND-104 - #compare anchor
**P2** * Functional * `index.html:332`

- **Pre:** Any state.
- **Steps:**
  1. Navigate to `/#compare`.
- **Expect:** Scrolls to the comparison header with the eyebrow `"Why not just use…?"` visible. No nav link points here; the anchor exists for direct sharing.
- **Watch:** The sticky nav clipping the eyebrow — check the H2 is fully readable after the jump.

---

## 11. Closing CTA band

### LAND-105 - CTA heading with underline
**P0** * Copy * `index.html:350`

- **Pre:** Scroll to the bottom CTA panel.
- **Steps:**
  1. Read the H2.
- **Expect:** Two lines via `<br>`: `"Active learning"` then `"in the age of AI."` — note the **lowercase** "learning", deliberately different from the hero H1's `"Active Learning"`. Only `"age of AI"` is wrapped in `.mark` with the blue underline; the period sits outside.
- **Watch:** Someone "fixing" the casing to match the hero. The lowercase here is intentional variation — confirm with the copy owner before changing.

### LAND-106 - CTA body copy
**P0** * Copy * `index.html:352`

- **Pre:** CTA panel in view.
- **Steps:**
  1. Read the paragraph in the right column.
- **Expect:** Exactly `"Don't just read — question it, summarize it, and keep what you learn. Every note stays linked to its source."` — straight apostrophe in `Don't`, em dash, US spelling `summarize`, capped at `max-width:380px`.
- **Watch:** `summarize` drifting to `summarise`; the meta description at `index.html:7` also uses `summarize`.

### LAND-107 - CTA buttons
**P0** * Functional * `index.html:354-355`

- **Pre:** CTA panel in view.
- **Steps:**
  1. Hover and click `"Enter"`.
  2. Go back, then hover and click `"Clone from GitHub"`.
- **Expect:** Two `.lg` buttons side by side in a `flex-wrap:wrap` row with a 12px gap. `"Enter"` is `.btn.primary.lg` → same-tab `/app.html`. `"Clone from GitHub"` is `.btn.ghost.lg` → new tab `https://github.com/trojanuary/pair` with `rel="noopener noreferrer"`. Both labels match their nav counterparts exactly.
- **Watch:** Unlike the nav, the ghost button here is **never** hidden at small widths — verify at 375px that the two buttons wrap onto two rows rather than overflowing the panel.

### LAND-108 - CTA panel styling and sparkle
**P2** * Visual * `index.html:162-167,358`

- **Pre:** CTA panel in view on desktop.
- **Steps:**
  1. Inspect the panel and its bottom-right corner.
- **Expect:** A `var(--card)` panel with a 22px radius, 1px border, big shadow, 40px/44px padding, and a two-column `1fr 1fr` grid (heading left, copy+buttons right). A blue 78px sparkle/asterisk SVG sits at `right:26px; bottom:14px` at 50% opacity with `pointer-events:none`, so it never intercepts a button click. `overflow:hidden` on the panel clips any sparkle overhang.
- **Watch:** `pointer-events:none` being lost — the sparkle would then sit over the bottom-right area and could swallow clicks near the `"Clone from GitHub"` button.

### LAND-109 - CTA panel at ≤900px and ≤560px
**P1** * Visual * `index.html:194,202`

- **Pre:** DevTools responsive mode.
- **Steps:**
  1. Check the panel at 880px, then at 500px.
- **Expect:** At ≤900px the grid becomes a single column with a 22px gap — heading above, copy and buttons below. At ≤560px padding tightens from `40px 44px` to `30px 24px`.
- **Watch:** The sparkle overlapping the wrapped buttons in the single-column layout, where the panel is much taller relative to its width.

### LAND-110 - CTA is the last thing before the footer
**P2** * Regression * `index.html:347-362,364`

- **Pre:** Scroll to the very bottom.
- **Steps:**
  1. Note what sits between the CTA panel and the footer.
- **Expect:** Nothing — `</main>` closes immediately after the CTA section and the `<footer class="foot">` follows. In particular there is **no** `.keynote` band, even though CSS for one exists at `index.html:170-172` (dead CSS).
- **Watch:** If a keynote band is ever reintroduced, its copy and its `border-top` interaction with the footer's own `border-top` both need checking — you would otherwise get a double hairline.

---

## 12. Footer

### LAND-111 - Footer brand
**P1** * Visual * `index.html:366`

- **Pre:** Scroll to the footer.
- **Steps:**
  1. Read the leftmost footer item and click it.
- **Expect:** The same 30×30 hexagon logo plus the wordmark `"PairedX"`, at 17px (smaller than the nav's 20px via `.foot .brand{font-size:17px}`). Clicking scrolls smoothly back to `#top`.
- **Watch:** The gradient-id collision described in LAND-012 — if the footer logo ever renders flat blue instead of gradient, that duplicate `id="g"` is the cause.

### LAND-112 - Copyright line and AGPL link
**P0** * Functional * `index.html:367`

- **Pre:** Footer in view.
- **Steps:**
  1. Read the copyright text.
  2. Click the licence link.
- **Expect:** Exactly `"© 2026 PairedX.com · "` (real `©` character, middle dot separator) followed by a link labelled exactly `"AGPL-3.0"` that opens `https://github.com/trojanuary/pair/blob/main/LICENSE` in a new tab and shows the AGPL-3.0 text. `package.json` declares `"license": "AGPL-3.0-only"` — the two must agree.
- **Watch:** The year `2026` being hard-coded — it needs a manual bump each January. Also verify the link points at `main`, not a branch that may be deleted.

### LAND-113 - Footer link "Features"
**P1** * Functional * `index.html:369`

- **Pre:** Footer in view, including at 375px where the nav links are hidden.
- **Steps:**
  1. Click `"Features"`.
- **Expect:** Same-tab navigation to `/features.html`. Hover lifts the colour from `var(--ink-2)` to `var(--ink)`. On mobile this is the **only** remaining path to that page.
- **Watch:** The footer link set must stay identical to the nav link set (`index.html:219-222` vs `368-373`) — same four labels, same four destinations, same order.

### LAND-114 - Footer link "Docs"
**P1** * Functional * `index.html:370`

- **Pre:** Footer in view.
- **Steps:**
  1. Click `"Docs"`.
- **Expect:** New tab to `https://github.com/trojanuary/pair#readme`, `rel="noopener noreferrer"`, landing on the repo README.
- **Watch:** Divergence from the nav's `"Docs"` link — both target the identical URL today.

### LAND-115 - Footer link "GitHub"
**P1** * Functional * `index.html:371`

- **Pre:** Footer in view.
- **Steps:**
  1. Click `"GitHub"`.
- **Expect:** New tab to `https://github.com/trojanuary/pair`, repo root.
- **Watch:** This is one of six occurrences of that URL (LAND-015).

### LAND-116 - Footer link "Privacy"
**P1** * Functional * `index.html:372`

- **Pre:** Footer in view at the bottom of the page.
- **Steps:**
  1. Click `"Privacy"`.
- **Expect:** Smooth-scrolls **upward** to the `#privacy` chip band. The URL becomes `/#privacy`.
- **Watch:** Upward smooth scroll across the full page length can take over a second — confirm it does not feel broken, and that with Reduce Motion on it jumps instantly instead.

### LAND-117 - Footer social icons
**P1** * Functional * `index.html:375-376`

- **Pre:** Footer in view.
- **Steps:**
  1. Hover each of the two icons on the far right.
  2. Inspect their accessible names.
  3. Click each.
- **Expect:** Two 20×20 filled `currentColor` icons with a 12px gap: an octocat with `aria-label="GitHub"` → `https://github.com/trojanuary/pair`, and a stylised X with `aria-label="Share on X"` → `https://twitter.com/intent/tweet?text=PairedX%20%E2%80%94%20a%20source-linked%20AI%20reading%20workspace&url=https://pairedx.com`. Both open in a new tab. Hover darkens each from `var(--ink-2)` to `var(--ink)`.
- **Watch:** The X icon uses the legacy `twitter.com/intent/tweet` host while the label says "X" — confirm the intent URL still redirects to `x.com` and pre-fills the composer. Since the page has no `og:image` (LAND-003), the resulting post shows a text-only card.

### LAND-118 - Share intent text decodes correctly
**P2** * Copy * `index.html:376`

- **Pre:** Logged into X (or observe the composer's prompt if logged out).
- **Steps:**
  1. Click the X icon and read the pre-filled composer.
- **Expect:** The text decodes to `"PairedX — a source-linked AI reading workspace"` (the `%E2%80%94` is the em dash) with the URL `https://pairedx.com` appended by the intent.
- **Watch:** The hard-coded `pairedx.com` URL if the domain ever changes; and double-encoding after an edit, which would surface literal `%20` sequences in the composer.

### LAND-119 - Footer layout wraps on narrow screens
**P1** * Visual * `index.html:173-182`

- **Pre:** DevTools responsive mode.
- **Steps:**
  1. Inspect the footer at 1200px, 700px, and 375px.
- **Expect:** A single `flex-wrap:wrap` row with a 20px gap and a 1px `var(--line)` top border. `.copy` has `margin-right:auto`, so on wide screens it pushes the link nav and social icons to the right. As the viewport narrows, items wrap onto additional lines without overlapping or being clipped; the 26px/24px padding holds.
- **Watch:** At ~700px the four `.flinks` wrapping awkwardly between the copyright and the social icons. Confirm the reading order stays sensible: brand → copyright → links → social.

---

## 13. Scroll, reveal & motion

### LAND-120 - The 2.2s reveal safety net
**P0** * Functional * `index.html:399` (`setTimeout(revealAll, 2200)`)

- **Pre:** Fresh hard reload, reduced motion **off**, IntersectionObserver supported.
- **Steps:**
  1. Load `/` and do **not** scroll for 3 seconds.
  2. Now scroll straight to the footer in one motion.
- **Expect:** Every section below the fold is **already fully visible** — nothing fades in. At 2.2s after load, `revealAll()` at `index.html:388` sets `transitionDelay='0ms'` and adds `in` to all `[data-reveal]` elements at once, so content can never be left invisible.
- **Watch:** This is deliberate insurance, and it means the reveal animations are only observable in the first ~2.2s. Do **not** file "the reveals do not animate when I scroll slowly" as a bug. Conversely, if content stays invisible after 3 seconds, the whole IIFE has thrown — check the console (see LAND-008).

### LAND-121 - Reveal on scroll within the first 2.2s
**P1** * Functional * `index.html:396-398` (IntersectionObserver)

- **Pre:** Fresh hard reload, reduced motion off. Have a screen recorder ready.
- **Steps:**
  1. Immediately after paint, scroll steadily to the feature cards.
- **Expect:** Elements fade from `opacity:0; translateY(16px)` to full over 0.6s as they cross the observer threshold (`threshold:.12`, `rootMargin:'0px 0px -8% 0px'` — so an element must be ~12% visible and ~8% above the viewport bottom before it fires). Each element is unobserved after its first reveal, so scrolling back up and down again does **not** replay the animation.
- **Watch:** An element re-animating on a second pass, which means `io.unobserve()` at `index.html:396` was removed.

### LAND-122 - Reduced motion reveals everything immediately
**P0** * Functional * `index.html:204-209,387,389`

- **Pre:** OS Reduce Motion **on**. Hard reload.
- **Steps:**
  1. Load `/` and scroll top to bottom.
  2. Click a nav anchor such as `"Privacy"`.
- **Expect:** All content is visible from the first paint (`revealAll()` runs synchronously because `matchMedia('(prefers-reduced-motion:reduce)').matches` is true at `index.html:387`). No fades, no translates. The CSS block at `index.html:204-209` additionally makes anchor jumps instant, kills `.btn`/`.card` transitions, and stops the chevron bob.
- **Watch:** Belt-and-braces coverage here — both the JS branch and the CSS media query must work independently. Test by disabling JS with Reduce Motion on: the CSS alone must still leave `[data-reveal]` at `opacity:1`.

### LAND-123 - Page with JavaScript fully disabled
**P0** * Edge * `index.html:185-186,381-402`

- **Pre:** Disable JavaScript entirely (DevTools → Settings → Debugger → Disable JavaScript), then hard reload.
- **Steps:**
  1. Load `/` and scroll the whole page.
  2. Click several links.
- **Expect:** **All content is invisible.** `[data-reveal]{opacity:0}` at `index.html:185` is the CSS default and only JavaScript adds the `in` class. With Reduce Motion **on**, the media query at `index.html:206` forces `opacity:1` and the page is fully readable. This is a known, deliberate trade-off.
- **Watch:** This is a genuine no-JS accessibility hole for users who have JS off but not Reduce Motion on. Record it as known behaviour; if it is ever fixed (e.g. via a `<noscript>` style block), rewrite this check.

### LAND-124 - Smooth scroll on every in-page anchor
**P1** * Functional * `index.html:27`

- **Pre:** Reduced motion off. Page at the top.
- **Steps:**
  1. Click, in order: nav `"Privacy"` → `#privacy`, scroll hint → `#app`, footer brand → `#top`, footer `"Privacy"` → `#privacy`.
- **Expect:** All four scroll smoothly (`html{scroll-behavior:smooth}`), not instantly. Each lands on the intended section and the URL hash updates.
- **Watch:** Smooth-scroll behaviour on Safari — it is supported but the easing curve differs from Chromium. Confirm it completes rather than stopping partway when the user scrolls during the animation.

### LAND-125 - Reveal + resize mid-animation
**P2** * Edge * `index.html:391-398`

- **Pre:** Fresh reload, reduced motion off.
- **Steps:**
  1. Within the first second, drag the browser window to resize it while sections are mid-reveal.
- **Expect:** No element gets stuck at partial opacity. Layout reflows and the observer re-evaluates against the new viewport; any element that never fires is caught by the 2.2s safety net.
- **Watch:** An element frozen at `opacity:0` after the resize — that would mean the safety net is not running.

### LAND-126 - Reveal + browser back/forward restore
**P2** * Edge * `index.html:381-402`

- **Pre:** Scroll to the footer.
- **Steps:**
  1. Click `"Enter"` to go to `/app.html`.
  2. Press Back.
- **Expect:** The page restores at the footer scroll position with all content visible. If restored from bfcache the `in` classes persist and nothing re-animates; if it is a fresh load, the 2.2s safety net covers it and `onScroll()` re-applies the `scrolled` class to the nav because it runs once immediately at `index.html:385`.
- **Watch:** The nav border missing after a bfcache restore at a non-zero scroll position — `onScroll()` runs on script execution, which bfcache skips. Verify the border state is correct after Back.

---

## 14. Responsive layout & cross-browser

### LAND-127 - No horizontal body scroll at any width
**P0** * Visual * `index.html:32,127-128`

- **Pre:** DevTools responsive mode.
- **Steps:**
  1. Sweep the viewport from 1600px down to 320px in ~50px steps.
  2. At each step, try to scroll the page horizontally.
- **Expect:** The `<body>` never scrolls sideways at any width. The only horizontally scrollable region is `.cmp-scroll` around the comparison table (LAND-101). The `.wrap` container holds its `max-width:1240px` and 24px side padding throughout.
- **Watch:** The 720px `min-width` on `table.cmp` escaping its `overflow-x:auto` parent, which is the single most likely cause of page-level horizontal scroll here.

### LAND-128 - Firefox and Safari parity
**P1** * Visual * `index.html:39,211` * Firefox/Safari only

- **Pre:** Latest Firefox and latest Safari, desktop.
- **Steps:**
  1. Load `/` in each and compare against Chromium: sticky nav frost, video player chrome, `clamp()` heading sizes, the `.uline` SVG underline positions, the table's `-webkit-overflow-scrolling`, and the `data:` WebP images.
- **Expect:** Layout is equivalent. Note the expected differences: Firefox renders native video controls with a different visual style; `backdrop-filter` on the nav is supported in all three but Safari's blur reads slightly stronger; `-webkit-overflow-scrolling:touch` at `index.html:127` is a WebKit-only property that Firefox simply ignores (harmless).
- **Watch:** This page uses **no** File System Access APIs, so `showSaveFilePicker`/`showDirectoryPicker` are irrelevant here — those Chromium-only paths live entirely in the app, not the landing page. Do not carry over app-level browser caveats to this document.

### LAND-129 - Real device pass: iOS Safari and Android Chrome
**P0** * Functional * `index.html:5,256`

- **Pre:** A physical iPhone and a physical Android phone.
- **Steps:**
  1. Load `pairedx.com` on each.
  2. Scroll the full page.
  3. Play the reel inline.
  4. Drag the comparison table sideways.
  5. Tap `"Enter"`.
- **Expect:** `viewport width=device-width, initial-scale=1` gives correct scaling with no pinch-zoom needed to read body copy. The reel plays **inline** (`playsinline`) and does not force fullscreen on iOS. The comparison table drags with momentum. `"Enter"` loads `/app.html`. The sticky nav does not jitter against iOS Safari's collapsing URL bar.
- **Watch:** iOS Safari's dynamic viewport changing height mid-scroll, which can cause the sticky nav to briefly detach or the IntersectionObserver `rootMargin` to fire at an unexpected point. Both are cosmetic here, but confirm no section is skipped.

### LAND-130 - Print / reader-mode sanity
**P2** * Edge * `index.html:1-212`

- **Pre:** Desktop browser.
- **Steps:**
  1. Open the print preview (Ctrl/Cmd+P).
  2. Open Firefox Reader View.
- **Expect:** There is **no** `@media print` block anywhere in the CSS, so the print preview reproduces the screen layout — expect a dark sticky nav band on page 1, the video reduced to its poster, and the comparison table clipped at its 720px min-width. This is current, accepted behaviour.
- **Watch:** Do not file the clipped table as a print bug unless print support is explicitly added to scope.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `<title>` `index.html:6` | LAND-001, LAND-002 |
| `meta[name=description]` `index.html:7` | LAND-002, LAND-106 |
| `og:title` / `og:description` / `og:type` `index.html:9-11` | LAND-002, LAND-003 |
| Missing `og:image` / `twitter:card` | LAND-003, LAND-117 |
| `meta[name=theme-color]` `index.html:8` | LAND-004 |
| Inline SVG favicon `index.html:12` | LAND-004 |
| `@font-face` Fraunces / Inter `index.html:14-15` | LAND-005 |
| `html{scroll-behavior:smooth}` `index.html:27` | LAND-016, LAND-042, LAND-124 |
| `.wrap` `index.html:32` | LAND-034, LAND-127 |
| `.mark` / `.uline` `index.html:33-34` | LAND-024, LAND-068, LAND-074, LAND-105 |
| `.eyebrow` `index.html:35` | LAND-023, LAND-057, LAND-068, LAND-074, LAND-079, LAND-089 |
| `.nav` / `#nav` `index.html:39,215` | LAND-009, LAND-128 |
| `.nav.scrolled` `index.html:40` + `onScroll()` `index.html:383-385` | LAND-010, LAND-126 |
| `.brand` `index.html:217,366` | LAND-011, LAND-020, LAND-111 |
| Duplicate `linearGradient id="g"` `index.html:217,366` | LAND-012, LAND-111 |
| `.nlinks a` (Features/Docs/GitHub/Privacy) `index.html:219-222` | LAND-013, LAND-014, LAND-015, LAND-016, LAND-020, LAND-021, LAND-067 |
| `.btn:focus-visible` `index.html:48` | LAND-020, LAND-043 |
| `.btn.primary` / `.btn.ghost` hover `index.html:49-52` | LAND-017, LAND-018, LAND-076, LAND-107 |
| `.btn.iconly` `index.html:56-57,201,226` | LAND-019 |
| `"Enter"` CTA (`index.html:227,354`) | LAND-018, LAND-022, LAND-107, LAND-126, LAND-129 |
| `"Clone from GitHub"` (`index.html:225,355`) | LAND-017, LAND-019, LAND-107 |
| `.hero h1` `index.html:237` | LAND-024, LAND-034, LAND-105 |
| `.lead-intro` `index.html:239` | LAND-025, LAND-032 |
| `.hrow` ×3 `index.html:240-242` | LAND-026, LAND-032, LAND-034 |
| `.heroimg` + alt `index.html:245` | LAND-027, LAND-031, LAND-033 |
| `.mindwrap::before` `index.html:71` | LAND-028 |
| `.hero-copy[data-stagger]` `index.html:235` | LAND-029 |
| Hero responsive `order:-1` `index.html:189-190` | LAND-030, LAND-034 |
| `.keytop` shared-key notice `index.html:87-91,249` | LAND-035, LAND-036, LAND-087 |
| `.chip` ×6 `index.html:251` | LAND-037, LAND-038, LAND-039 |
| `.scrollhint` + `aria-label` `index.html:253` | LAND-040, LAND-043, LAND-124 |
| `@keyframes bob` / `.chev` `index.html:97-98` | LAND-041, LAND-042 |
| `<video class="reelvid">` `index.html:211,256` | LAND-044 – LAND-051, LAND-055, LAND-056, LAND-129 |
| `reel-poster.jpg` | LAND-044, LAND-049, LAND-051 |
| `.cap` + `"Try it live →"` `index.html:257` | LAND-052, LAND-053 |
| `/app` rewrite (`vercel.json`) | LAND-053 |
| `#app` anchor `index.html:255` | LAND-040, LAND-054, LAND-124 |
| `#features` head `index.html:262-265` | LAND-057, LAND-067 |
| `.card` ×6 + `.card-n` `index.html:267-290` | LAND-058 – LAND-063, LAND-064, LAND-065, LAND-066 |
| `.card:hover` `index.html:114-115` | LAND-064 |
| `.grid[data-stagger]` `index.html:266` | LAND-065, LAND-066 |
| `.split` first (Deep control) `index.html:294-305` | LAND-068 – LAND-071, LAND-077, LAND-078 |
| `.doodle` `index.html:150,301` | LAND-070 |
| `.setframe` inline WebP `index.html:303` | LAND-071, LAND-078 |
| `.split.rev` `index.html:147,307` | LAND-072, LAND-077 |
| `settings-templates.jpg` + alt `index.html:309` | LAND-073, LAND-078 |
| `"Tune every prompt."` / `"Open Templates"` `index.html:312-314` | LAND-074, LAND-075, LAND-076 |
| `#ocr` section `index.html:319-328` | LAND-079 – LAND-084 |
| `feat-ocr-banner.jpg` + alt `index.html:326` | LAND-081, LAND-084 |
| `.frame` (chromeless) `index.html:102-107,326` | LAND-082 |
| Dead CSS `.frame-bar` / `.dot` / `.frame-url` / `.keynote` / `.mindart` family | LAND-082, LAND-110 |
| `.pchip` ×4 `index.html:330` | LAND-085, LAND-086, LAND-088 |
| `#privacy` anchor `index.html:330` | LAND-016, LAND-116 |
| Privacy claim consistency `index.html:249,273,330,337` | LAND-087 |
| `#compare` head `index.html:334-337` | LAND-089, LAND-104 |
| `table.cmp thead` `index.html:340` | LAND-090, LAND-099, LAND-103 |
| Table row 1 "Notes pin to an exact spot in the PDF" | LAND-091 |
| Table row 2 "Opens your local file — no full‑file upload" | LAND-092 |
| Table row 3 "Bring your own model / key" | LAND-093 |
| Table row 4 "Inspectable agent trace" | LAND-094 |
| Table row 5 "Notes are a portable file you own" | LAND-095 |
| Table row 6 "Open‑source & self‑hostable" | LAND-096, LAND-063 |
| `.priceRow` + inert `.txt` class `index.html:341` | LAND-097 |
| `table.cmp tbody` row count + last-row border `index.html:133,341` | LAND-098 |
| `.yes` / `.no` / `.part` + `title` attrs `index.html:138-140,341` | LAND-091 – LAND-096, LAND-100 |
| `.pair` column highlight `index.html:134-137` | LAND-090, LAND-099 |
| `.cmp-scroll` overflow `index.html:127-128` | LAND-101, LAND-127 |
| `.cmp-note` footnote `index.html:343` | LAND-093, LAND-095, LAND-102, LAND-103 |
| `.ctapanel` `index.html:162-167,349-359` | LAND-105 – LAND-110 |
| `.sparkle` `index.html:167,358` | LAND-108, LAND-109 |
| `.foot` `index.html:173-182,364-379` | LAND-111 – LAND-119 |
| `"© 2026 PairedX.com · AGPL-3.0"` `index.html:367` | LAND-112 |
| `.flinks` ×4 `index.html:368-373` | LAND-113 – LAND-116 |
| `.social` GitHub + X `index.html:374-377` | LAND-117, LAND-118 |
| `revealAll()` `index.html:388` | LAND-120, LAND-122, LAND-125 |
| `reveal()` + IntersectionObserver `index.html:391-398` | LAND-121, LAND-125 |
| `setTimeout(revealAll, 2200)` `index.html:399` | LAND-120, LAND-125 |
| `[data-reveal]` base state `index.html:185-186` | LAND-123 |
| `@media (prefers-reduced-motion:reduce)` `index.html:204-209` | LAND-042, LAND-122, LAND-123 |
| `@media (max-width:900px)` `index.html:188-196` | LAND-021, LAND-030, LAND-065, LAND-072, LAND-077, LAND-086, LAND-109 |
| `@media (max-width:560px)` `index.html:197-203` | LAND-019, LAND-034, LAND-065, LAND-086, LAND-109 |
| `window.va` stub + `/_vercel/insights/script.js` `index.html:403-404` | LAND-007, LAND-085 |
| All 10 `target="_blank" rel="noopener noreferrer"` links | LAND-014, LAND-015, LAND-017, LAND-107, LAND-112, LAND-114, LAND-115, LAND-117 |
| No `@media print` | LAND-130 |
| Console cleanliness | LAND-008 |

## Deliberately not covered here

- **`/features.html` page content** — only the two links pointing at it are checked (LAND-013, LAND-113); the page itself is covered in `02-features-page.md`.
- **`/app.html` boot, workspace, PDF rendering, Settings and Templates panels** — the landing page only verifies that the five CTAs navigate there (LAND-018, LAND-053, LAND-069, LAND-076, LAND-107). Everything past that navigation belongs to the app documents.
- **File System Access APIs (`showSaveFilePicker`, `showDirectoryPicker`)** — not used anywhere in `index.html`; covered in the notes/export document. See LAND-128.
- **`api/ai.js` and `api/ai-image.js` proxy behaviour** — the landing page only *claims* things about them (LAND-035, LAND-087); the proxies are covered in the API document.
- **OCR execution itself** — the landing page only advertises it (LAND-079, LAND-080); the in-app OCR flow is covered in the OCR document.
- **Actual competitor-product verification** — LAND-091 to LAND-097 check that the table matches what the source file says, not that the claims about NotebookLM / ChatPDF / Beaver / Readwise are factually current. Factual review is an editorial task with a July 2026 stamp (LAND-102).
- **Lighthouse / Core Web Vitals scoring** — individual perf risks are called out (LAND-005, LAND-006, LAND-049, LAND-073, LAND-081), but scoring belongs to a dedicated performance document.
- **Automated link-checking** — every link is checked manually here; a crawler belongs in CI, not in this checklist.
