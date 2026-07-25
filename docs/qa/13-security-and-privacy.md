# 13 - Security & privacy: import sanitisation, key handling, proxy hardening

> Proves that a hostile `.notes.json` or shared `.annotated.html` cannot execute script or steal a key, that the API key never leaves the browser except as a `/api` override, that the serverless proxies cannot be turned into an SSRF vector, and that the privacy promises the product makes in public are still true.

| | |
|---|---|
| **ID prefix** | SEC |
| **Scope** | Import sanitisation (`sanitizeImportedNotes` and friends), the `<img src>` allowlist (`safeImgSrc` / `RASTER_DATA`), HTML escaping at every render site, the read-only share bundle, export hygiene (key + analytics), browser-side key handling, the `api/ai.js` + `api/ai-image.js` provider/host allowlist and SSRF guards, and the public privacy copy. |
| **Primary code** | `src/app.js:14-26`, `src/app.js:1713-2047`, `src/app.js:2271-2331`, `src/app.js:2540-2601`, `src/app.js:3283-3302`, `api/ai.js`, `api/ai-image.js`, `README.md` |
| **Checks** | 110 |

## Contents
- [1. Fixtures and setup](#1-fixtures-and-setup) - 3 checks
- [2. Imported notes: id and structural sanitisation](#2-imported-notes-id-and-structural-sanitisation) - 11 checks
- [3. Image source allowlist](#3-image-source-allowlist) - 11 checks
- [4. Escaping at every render site](#4-escaping-at-every-render-site) - 14 checks
- [5. Markdown, math and code render stack](#5-markdown-math-and-code-render-stack) - 9 checks
- [6. Shared .annotated.html import](#6-shared-annotatedhtml-import) - 11 checks
- [7. Read-only bundle isolation](#7-read-only-bundle-isolation) - 9 checks
- [8. Export hygiene: what must never be in a shared file](#8-export-hygiene-what-must-never-be-in-a-shared-file) - 9 checks
- [9. API key handling in the browser](#9-api-key-handling-in-the-browser) - 9 checks
- [10. Proxy hardening: /api/ai](#10-proxy-hardening-apiai) - 10 checks
- [11. Proxy hardening: /api/ai-image](#11-proxy-hardening-apiai-image) - 5 checks
- [12. Public privacy promises](#12-public-privacy-promises) - 9 checks

---

## 1. Fixtures and setup

### SEC-001 - Build the hostile notes fixture
**P0** * Security * `src/app.js:2314 sanitizeImportedNotes()`

- **Pre:** A text editor. Nothing else. This fixture is reused by most of sections 2-5, so build it once and keep it.
- **Steps:**
  1. Save the following exactly as `evil.notes.json`. Every field here is a separate attack; do not "clean it up".

     ```json
     {
       "app": "Source-Linked AI Reading Workspace",
       "schema": 1,
       "exportedAt": "2026-07-24T00:00:00.000Z",
       "document": { "id": "sample", "sha256": null, "name": "evil" },
       "noteCount": 5,
       "annotations": [
         {
           "id": "ann\" onmouseover=alert('ID') x=\"",
           "thread": "thr</div><script>alert('THREAD')</script>",
           "page": 1,
           "source_type": "highlight",
           "created_at": "2026-07-24T00:00:00.000Z",
           "rects": [{ "x": 0.12, "y": 0.14, "w": 0.4, "h": 0.02 }],
           "selected_text": "</textarea></div><img src=x onerror=alert('QUOTE')>",
           "section": "<img src=x onerror=alert('SECTION')>",
           "caption": "<svg onload=alert('CAPTION')>",
           "manual_tags": ["<img src=x onerror=alert('TAG')>", "constructor"],
           "messages": [
             { "id": "m_cmt", "actor": "you", "type": "comment", "created_at": "2026-07-24T00:00:00.000Z",
               "text": "raw <b>bold</b> plus </script><script>alert('CMT')</script> plus <img src=x onerror=alert('CMT2')>" },
             { "id": "m_ans", "actor": "ai", "provider": "openrouter", "type": "ai_answer",
               "created_at": "2026-07-24T00:00:00.000Z",
               "model": "<img src=x onerror=alert('MODEL')>",
               "text": "# <img src=x onerror=alert('MD_H')>\n\n[click me](javascript:alert('LINK'))\n\n> <img src=x onerror=alert('QUOTEBLK')>\n\n| col | <img src=x onerror=alert('CELL')> |\n|---|---|\n| 1 | 2 |\n\n```html\n<img src=x onerror=alert('FENCE')>\n```\n\n\\( <img src=x onerror=alert('MATH')> \\)",
               "chips": ["<img src=x onerror=alert('CHIP')>"],
               "trace": [
                 { "type": "tool", "name": "<img src=x onerror=alert('TOOLNAME')>",
                   "args": { "q": "<img src=x onerror=alert('ARGS')>" },
                   "result": "</pre><img src=x onerror=alert('RESULT')>" },
                 { "type": "final", "title": "<img src=x onerror=alert('TRTITLE')>", "text": "</pre><img src=x onerror=alert('TRTEXT')>" }
               ] },
             { "id": "m_vis_js", "actor": "ai", "type": "generated_visual", "kind": "image",
               "created_at": "2026-07-24T00:00:00.000Z",
               "title": "<img src=x onerror=alert('VISTITLE')>",
               "image": "javascript:alert('IMG_JS')",
               "takeaways": ["<img src=x onerror=alert('TAKE')>"],
               "ascii": "</pre><img src=x onerror=alert('ASCII')>" },
             { "id": "m_vis_svg", "actor": "ai", "type": "generated_visual", "kind": "image",
               "created_at": "2026-07-24T00:00:00.000Z", "title": "svg payload",
               "image": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIG9ubG9hZD0iYWxlcnQoJ1NWRycpIj48L3N2Zz4=" },
             { "id": "m_vis_break", "actor": "ai", "type": "generated_visual", "kind": "image",
               "created_at": "2026-07-24T00:00:00.000Z", "title": "attr break",
               "image": "data:image/png;base64,iVBORw0KGgo=\" onerror=\"alert('ATTR')" }
           ]
         },
         {
           "id": "ann_page_probe", "page": "1<img src=x onerror=alert('PAGE')>",
           "source_type": "free_comment", "created_at": "2026-07-24T00:00:00.000Z",
           "rects": [{ "x": 0.5, "y": 0.5, "w": 0.02, "h": 0.02 }],
           "messages": [{ "id": "m_page", "actor": "you", "type": "comment",
             "created_at": "2026-07-24T00:00:00.000Z", "text": "page-field probe" }]
         },
         {
           "id": "ann_actor", "page": 2, "source_type": "free_comment",
           "created_at": "2026-07-24T00:00:00.000Z",
           "rects": [{ "x": 0.3, "y": 0.3, "w": 0.02, "h": 0.02 }],
           "messages": [{ "id": "m_proto", "actor": "constructor", "provider": "constructor",
             "type": "comment", "created_at": "2026-07-24T00:00:00.000Z", "text": "prototype-key probe" }]
         },
         {
           "id": "ann_http_shot", "page": 3, "source_type": "screenshot",
           "screenshot": "http://example.com/tracker.png",
           "created_at": "2026-07-24T00:00:00.000Z",
           "rects": [{ "x": 0.2, "y": 0.2, "w": 0.3, "h": 0.2 }], "messages": []
         },
         {
           "id": "ann_keep_me", "page": 4, "source_type": "highlight",
           "created_at": "2026-07-24T00:00:00.000Z",
           "rects": [{ "x": 0.1, "y": 0.6, "w": 0.5, "h": 0.02 }],
           "selected_text": "Ordinary text that must survive import unchanged.",
           "section": "4.1 Results", "resolved": true,
           "manual_tags": ["Claim"],
           "messages": [{ "id": "m_keep", "actor": "you", "type": "comment", "edited": true,
             "created_at": "2026-07-24T00:00:00.000Z",
             "text": "A perfectly normal note with an em dash — and a $5 price and 100% coverage." }]
         }
       ]
     }
     ```
  2. Confirm the file is valid JSON (`python3 -m json.tool evil.notes.json` prints it back).
- **Expect:** A syntactically valid file, ~5 annotations, saved somewhere you can reach from a file picker.
- **Watch:** Editors that "helpfully" re-encode `\"` inside the `id` string. If the `id` value does not literally contain a double quote when read back, SEC-004 tests nothing.

### SEC-002 - Open the app with the console watching
**P0** * Security * `src/app.js:3303 boot()`

- **Pre:** Chrome/Edge (Chromium) on the deployed site or `vercel dev`.
- **Steps:**
  1. Open `/app`, wait for the sample BERT paper to render.
  2. Open DevTools → Console, and DevTools → Network with "Preserve log" on.
  3. Leave both open for every check in sections 2-8.
- **Expect:** Console clean apart from PDF.js informational logs. Network shows only same-origin requests plus `fonts.googleapis.com`, `fonts.gstatic.com`, and `/_vercel/insights/script.js`.
- **Watch:** A test run with the console closed. Every XSS payload in the fixture announces itself with an `alert()`, but a payload that throws instead (e.g. a broken selector) is silent unless the console is visible.

### SEC-003 - Confirm the fixture actually imports (control run)
**P0** * Security * `src/app.js:2533 importNotesJSON()`

- **Pre:** SEC-002 done. Sample document active.
- **Steps:**
  1. Notes toolbar → the **Import notes from a JSON file** button (the arrow-into-page icon next to the filter).
  2. Pick `evil.notes.json`.
- **Expect:** A toast reading exactly "5 notes imported." No `alert()` box appears at any point. Five cards appear in the notes panel.
- **Watch:** A toast of "That file has no notes to import." means the fixture's `annotations` array did not survive editing — fix the fixture before continuing, otherwise sections 2-5 all pass vacuously.

---

## 2. Imported notes: id and structural sanitisation

### SEC-004 - An id containing quotes is replaced, not escaped
**P0** * Security * `src/app.js:2288 IMP_ID` / `src/app.js:2289 impId()`

- **Pre:** SEC-003 imported.
- **Steps:**
  1. In DevTools Console run `JSON.parse(localStorage.srw_state_v1).annotations.map(a => a.id)`.
  2. Inspect the DOM of the first imported card: `document.querySelectorAll('.card[data-ann]')[0].outerHTML.slice(0,200)`.
- **Expect:** No stored id contains `"`, `<`, `>`, a space, or `(`. The card built from the hostile id has a `data-ann` value matching `/^ann_[a-z0-9]{7}$/` (the `uid('ann')` replacement from `src/app.js:15`). No `onmouseover` attribute exists anywhere in the card.
- **Watch:** A regression that *escapes* the id instead of replacing it. `esc()` (`src/app.js:14`) would neutralise the attribute but the id still flows into `querySelector('.card[data-ann="…"]')` at `src/app.js:1168` and `1189`, where an escaped quote is still a quote and throws a `SyntaxError`.

### SEC-005 - A hostile thread id is replaced
**P1** * Security * `src/app.js:2307 sanitizeImportedAnnotation()`

- **Pre:** SEC-003 imported.
- **Steps:**
  1. Console: `JSON.parse(localStorage.srw_state_v1).annotations.map(a => a.thread)`.
- **Expect:** The value that arrived as `thr</div><script>alert('THREAD')</script>` is now a generated id of the shape `thr_xxxxxxx`. No entry contains `<`.
- **Watch:** `thread` being dropped entirely instead of regenerated — that silently un-groups a legitimately threaded import.

### SEC-006 - Message ids are constrained the same way
**P1** * Security * `src/app.js:2295 sanitizeImportedMessage()`

- **Pre:** Edit a copy of `evil.notes.json` so the first message's `"id"` is `"m\" onerror=alert(1) x=\""`. Import it.
- **Steps:**
  1. Console: `JSON.parse(localStorage.srw_state_v1).annotations.flatMap(a => (a.messages||[]).map(m => m.id))`.
  2. Expand the note, hover the message, click the pencil (Edit).
- **Expect:** Every message id matches `/^[A-Za-z0-9_-]{1,80}$/`. The edit textarea opens — `document.querySelector('.edit-input[data-editing="…"]')` at `src/app.js:2161` still resolves, proving the replacement id is selector-safe.
- **Watch:** Edit silently doing nothing. That is the symptom of a message id that broke the selector — the note looks fine until you try to edit it.

### SEC-007 - An 80-character id is kept; an 81-character id is replaced
**P2** * Edge * `src/app.js:2288 IMP_ID`

- **Pre:** Two fixture copies: one with an annotation id of exactly 80 `a` characters, one with 81.
- **Steps:**
  1. Import each into a fresh document.
  2. Console-check the stored ids.
- **Expect:** The 80-char id survives verbatim. The 81-char id is replaced with a fresh `ann_…`.
- **Watch:** An off-by-one after a regex edit. Cheap to check, and the boundary is the only part of `IMP_ID` a refactor tends to get wrong.

### SEC-008 - Legitimate fields are preserved, not whitelisted away
**P0** * Regression * `src/app.js:2303 sanitizeImportedAnnotation()`

- **Pre:** SEC-003 imported.
- **Steps:**
  1. Console: `JSON.parse(localStorage.srw_state_v1).annotations.find(a => a.selected_text && a.selected_text.startsWith('Ordinary'))`.
- **Expect:** The `ann_keep_me` note kept `resolved: true`, `section: "4.1 Results"`, `manual_tags: ["Claim"]`, its `rects`, and its message's `edited: true` flag. The comment text still reads exactly "A perfectly normal note with an em dash — and a $5 price and 100% coverage." The card in the panel shows the "✓ Resolved" flag and a "Claim" tag pill.
- **Watch:** Someone "hardening" the importer by rebuilding annotations from an allowlist of known keys. The code comment at `src/app.js:2285-2287` says this is deliberate: a whitelist silently drops agent traces, edited flags and captions from a re-opened bundle, and the loss is invisible until a user complains.

### SEC-009 - Non-object entries are dropped without breaking the import
**P1** * Edge * `src/app.js:2303` / `src/app.js:2314`

- **Pre:** A fixture whose `annotations` array is `[null, 42, "string", [], {"id":"ok","page":1,"messages":[]}, {"messages":[null, 7, {"id":"m_ok","type":"comment","text":"kept"}]}]`.
- **Steps:**
  1. Import it into a fresh document.
- **Expect:** Toast "2 notes imported." The junk entries vanish; the two real ones render. No console error.
- **Watch:** `sanitizeImportedNotes` returning `null` entries into `state.annotations` — `render()` then throws on `a.messages` and the whole notes panel goes blank.

### SEC-010 - Cyclic / non-JSON values are rejected per-item
**P2** * Edge * `src/app.js:2294`

- **Pre:** Console access.
- **Steps:**
  1. In Console build a cyclic object and try to import it directly: `const a={id:'x',page:1,messages:[]}; a.self=a; window.__t=[a];` — then paste and run the app's own path is not reachable from the console, so instead craft a file whose annotation contains a very deep nesting (e.g. 200 nested `{"a":{...}}` under a custom key) and import that.
  2. Watch the console.
- **Expect:** The note either imports with the deep field intact or is dropped, but the app does not throw and the other notes in the same file still import.
- **Watch:** The `JSON.parse(JSON.stringify(...))` deep clone at `src/app.js:2294`/`2305` throwing outside its `try` after a refactor — one bad annotation would then abort the entire import.

### SEC-011 - Oversized text fields are capped, not rejected
**P1** * Perf * `src/app.js:2290 impCap()` / `src/app.js:2291 IMP_TEXT_CAP`

- **Pre:** A fixture with one comment whose `text` is 3,000,000 `A` characters (generate with `python3 -c "import json;print(json.dumps('A'*3000000))"`).
- **Steps:**
  1. Import into a fresh document. Time it.
  2. Console: `JSON.parse(localStorage.srw_state_v1).annotations[0].messages[0].text.length`.
- **Expect:** Import completes (allow up to a few seconds), the note renders, and the stored length is exactly `2000000`. No "Storage limit reached — export your notes to keep them." toast for a single 2 MB field.
- **Watch:** The truncation happening at render instead of at import — then the full 3 MB is what gets written to `localStorage` by `save()` (`src/app.js:151`) and the next reload blows the quota.

### SEC-012 - Array count caps hold at their documented ceilings
**P1** * Perf * `src/app.js:2298-2300`, `src/app.js:2310-2311`, `src/app.js:2314`

- **Pre:** A fixture with one annotation carrying `rects` of 6,000 entries, `messages` of 3,500 entries, one message with a `trace` of 600 steps, `takeaways` of 300, and `chips` of 100.
- **Steps:**
  1. Import. Console-inspect the stored counts.
- **Expect:** `rects.length === 5000`, `messages.length === 3000`, `trace.length === 500`, `takeaways.length === 200`, `chips.length === 60`. The app stays responsive.
- **Watch:** The whole-file cap too: a fixture with 60,000 annotations must import exactly 50,000 (`src/app.js:2314`) rather than hanging the tab.

### SEC-013 - A non-numeric `page` cannot inject markup
**P0** * Security * `src/app.js:1799`, `src/app.js:1895`, `src/app.js:2901`

- **Pre:** SEC-003 imported (the `ann_page_probe` note).
- **Steps:**
  1. Find the card whose comment reads "page-field probe".
  2. Read its location line, then run `document.querySelectorAll('.loc-line img, .q-src img').length` in the Console.
  3. Click the note to expand it, then open the **Export annotations** view and look at the same note in the preview sheet.
- **Expect:** No `alert('PAGE')` fires and the count is `0`. The location line shows the payload as literal text (e.g. `Page 1<img src=x onerror=alert('PAGE')>`), or the note is not shown at all.
- **Watch:** This is the highest-risk gap in the importer. `a.page` is interpolated **raw** into HTML at `src/app.js:1799`, `1895`, `1913` and `2901`, and raw into a CSS selector at `src/app.js:552`/`554`. `sanitizeImportedAnnotation` does not coerce it to a number. If this check ever renders an actual `<img>` element — or the console shows a `SyntaxError` from `#contPages .pg[data-page="…"]` when you click the note — file it as a release blocker.

### SEC-014 - Prototype-shaped actor and provider keys do not leak object internals
**P2** * Edge * `src/app.js:1713 actorAvatar()` / `src/app.js:1721 actorName()`

- **Pre:** SEC-003 imported (the `ann_actor` note).
- **Steps:**
  1. Find the card whose comment reads "prototype-key probe" and read the author name in its header, plus the avatar's tooltip.
- **Expect:** The author reads a plain human name (your actor name, or "You"), and the avatar tooltip is a provider label or "AI". Nothing renders as "Object", "function Object() { [native code] }", or an empty box.
- **Watch:** `ACTORS[m.actor]?.name` (`src/app.js:1721`) and `PROVIDER_LABEL[m.provider]` (`src/app.js:1716`) are plain object lookups, so `"constructor"` / `"toString"` resolve to inherited functions instead of falling through to the default. Cosmetic today; it becomes real the moment a lookup result reaches an unescaped slot.

---

## 3. Image source allowlist

### SEC-015 - A `javascript:` image URL renders no image at all
**P0** * Security * `src/app.js:20 safeImgSrc()`

- **Pre:** SEC-003 imported (message `m_vis_js`).
- **Steps:**
  1. Expand the hostile note and scroll to the "Generated image" card titled with the payload.
  2. Console: `[...document.querySelectorAll('#notesList img')].map(i => i.getAttribute('src'))`.
- **Expect:** No `src` value begins with `javascript:`. The visual card shows an `<img>` with an empty `src` (a broken-image placeholder) or no image element — never a navigation, never an alert.
- **Watch:** `safeImgSrc` returning the input on an unexpected type. It returns `''` for anything non-string (`src/app.js:21`); a refactor to `String(u)` would let `null`/objects through as the literal text `"null"`, which is harmless, but a refactor that returns `u` unchanged on a miss is a live vector.

### SEC-016 - An SVG data URL is rejected even though it is a `data:image/`
**P0** * Security * `src/app.js:19 RASTER_DATA`

- **Pre:** SEC-003 imported (message `m_vis_svg`, an `onload=alert('SVG')` SVG).
- **Steps:**
  1. Expand the note and look at the "svg payload" visual card.
  2. Console: `JSON.parse(localStorage.srw_state_v1).annotations.flatMap(a=>a.messages||[]).map(m=>m.image)`.
- **Expect:** No `alert('SVG')`. The stored value for that message is `null` — `sanitizeImportedMessage` (`src/app.js:2296`) nulled it at import, so it never even reaches the renderer.
- **Watch:** Anyone adding `svg` to the `RASTER_DATA` alternation "so diagrams import". SVG can carry `onload` and `<script>`; the regex deliberately lists only `png|jpe?g|webp|gif`.

### SEC-017 - A quote inside a data URL cannot break out of the `src` attribute
**P0** * Security * `src/app.js:19` / `src/app.js:1822`

- **Pre:** SEC-003 imported (message `m_vis_break`, image value `data:image/png;base64,iVBORw0KGgo=" onerror="alert('ATTR')`).
- **Steps:**
  1. Expand the note; find the "attr break" visual.
  2. Console: `[...document.querySelectorAll('#notesList img')].some(i => i.hasAttribute('onerror'))`.
- **Expect:** `false`, and no `alert('ATTR')`. The stored `image` is `null`.
- **Watch:** `RASTER_DATA` is anchored with `^…$` and the base64 class excludes `"`. A regex edit that drops the `$` anchor re-opens this instantly, and it will not be visible in normal use.

### SEC-018 - An `http:` (non-TLS) image URL is rejected
**P1** * Security * `src/app.js:24`

- **Pre:** SEC-003 imported (annotation `ann_http_shot`, screenshot `http://example.com/tracker.png`).
- **Steps:**
  1. Clear the Network log, then scroll the notes panel until the screenshot card is visible.
  2. Filter Network by `example.com`.
- **Expect:** Zero requests to `example.com`. The stored `screenshot` is `null`.
- **Watch:** This is the tracking-pixel path — a shared file that phones home when opened. `safeImgSrc` allows only `https:` (`src/app.js:24`); a relaxation to `https?:` would make every shared bundle a read receipt.

### SEC-019 - A legitimate `https:` image URL is preserved
**P1** * Regression * `src/app.js:24`

- **Pre:** A fixture with a message `"image": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png"`.
- **Steps:**
  1. Import into a fresh document and expand the note.
- **Expect:** The image loads and renders. The stored value is the URL unchanged.
- **Watch:** Over-tightening `safeImgSrc` to `data:` only. The allowlist is deliberately two-branch; dropping the https branch breaks legitimately shared bundles with no error message.

### SEC-020 - Whitespace inside a valid raster data URL is stripped, not rejected
**P2** * Edge * `src/app.js:23`

- **Pre:** A fixture with a real PNG data URL into which you have inserted newlines every 76 characters (typical MIME wrapping).
- **Steps:**
  1. Import and expand the note.
  2. Console-read the stored `image` and confirm `/\s/.test(value) === false`.
- **Expect:** The image renders normally and the stored string has all whitespace removed.
- **Watch:** Removing the `.replace(/\s+/g,'')` while leaving `\s` in the character class — the value then passes validation but the `<img>` never decodes, so a shared paper silently loses its figures.

### SEC-021 - A `data:text/html` payload disguised with an image extension is rejected
**P1** * Security * `src/app.js:19`

- **Pre:** A fixture with `"image": "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="` and another with `"image": "data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="` (correct MIME, HTML bytes).
- **Steps:**
  1. Import both and expand.
- **Expect:** The first is nulled (wrong MIME). The second passes the regex — that is expected and safe: an `<img src>` never executes its payload, it just fails to decode. Neither produces an alert.
- **Watch:** Any change that renders `m.image` through anything other than `<img src>` (an `<object>`, an `<iframe>`, `innerHTML`, a CSS `url()`), which would turn the second case into an execution vector.

### SEC-022 - Screenshots go through the same gate as generated images
**P1** * Security * `src/app.js:1800`, `src/app.js:1894`, `src/app.js:2892`

- **Pre:** A fixture where an annotation's `source_type` is `"screenshot"` and `screenshot` is `"javascript:alert('SHOT')"`.
- **Steps:**
  1. Import. Look at the compact card, expand it, then open **Export annotations** and check the preview sheet.
- **Expect:** No alert in any of the three render sites. All three call `safeImgSrc`.
- **Watch:** A new render site added for screenshots (a lightbox, a hover preview) that interpolates `a.screenshot` directly. Grep for `<img src="${` and confirm every hit is wrapped in `safeImgSrc`.

### SEC-023 - An image that slipped into state directly is still neutralised at render
**P0** * Security * `src/app.js:20` (belt-and-suspenders)

- **Pre:** App open with at least one AI visual note.
- **Steps:**
  1. Console: `state` is not exposed (the app is an IIFE), so simulate the bypass by hand-editing `localStorage.srw_state_v1` — set one message's `image` to `"javascript:alert('BYPASS')"` — then reload.
- **Expect:** The reload renders the note with an empty `src`; no alert. This proves the render-site guard is independent of the import guard, exactly as the comment at `src/app.js:16-18` claims.
- **Watch:** A performance "optimisation" that trusts state because "it was sanitised on import". Storage is also reachable via a same-origin bug or a hand-edit; both layers must hold.

### SEC-024 - Rehydrated IndexedDB images are re-validated
**P1** * Security * `src/app.js:144 rehydrateAssets()` / `src/app.js:158-159`

- **Pre:** A note with a large screenshot (so `save()` offloads it to IndexedDB as `@idb`).
- **Steps:**
  1. In DevTools → Application → IndexedDB → `srw_assets` → `assets`, edit the `shot:<annId>` value to `"javascript:alert('IDB')"`.
  2. Reload the app.
- **Expect:** No alert; the screenshot area renders empty. `rehydrateAssets` puts the raw value back on state but every render site funnels through `safeImgSrc`.
- **Watch:** A future direct-to-DOM path for rehydrated assets that bypasses `safeImgSrc` — IndexedDB content is no more trusted than an imported file.

### SEC-025 - No image URL reaches a CSS `background` or `url()`
**P1** * Security * `src/app.js:1719`, `src/app.js:1891`

- **Pre:** App open.
- **Steps:**
  1. Grep the source: `grep -n 'style="background' src/app.js`.
  2. Confirm every hit interpolates only a value from `ACTORS` (`src/app.js:44-48`) or the fixed `var(--green)` / `var(--blue)` literals at `src/app.js:1871`.
- **Expect:** Two hits, both from in-code constants, never from imported data.
- **Watch:** A theming feature that lets a note carry its own colour. `esc()` does not escape `'` or `)`, so an imported colour string in a `style` attribute would be a straight injection point.

---

## 4. Escaping at every render site

### SEC-026 - Comment text renders as literal text, tags and all
**P0** * Security * `src/app.js:2041 commentHTML()`

- **Pre:** SEC-003 imported (message `m_cmt`).
- **Steps:**
  1. Expand the hostile note and read the first comment.
- **Expect:** The card displays the raw source verbatim, including `<b>bold</b>` shown as text (not bolded) and the `<script>` tags visible as characters. No alert. `document.querySelectorAll('#notesList script').length === 0`.
- **Watch:** Someone adding "rich text in comments" by dropping the `esc(s)` at `src/app.js:2044`. The `@ai` mention wrapper and the `\n → <br>` replacement both run *after* the escape, which is the only safe order.

### SEC-027 - The selected-text quote block is escaped in both clamped and full forms
**P0** * Security * `src/app.js:1731 quoteBlock()`

- **Pre:** SEC-003 imported; the hostile note's `selected_text` is `</textarea></div><img src=x onerror=alert('QUOTE')>`.
- **Steps:**
  1. Expand the note and read the linked quote.
  2. Import a second copy where `selected_text` is the same payload padded past 150 characters, so the `quote-wrap` / "Show more" branch is taken. Click **Show more** and **Show less**.
- **Expect:** Both branches show the payload as text. The button label toggles between exactly "Show more" and "Show less". No alert either way.
- **Watch:** Only the short branch being tested. `quoteBlock` has two returns (`src/app.js:1733` and `1734`) and a regression can escape one and not the other.

### SEC-028 - Section labels are escaped everywhere they appear
**P1** * Security * `src/app.js:1799`, `src/app.js:1895`, `src/app.js:1913`, `src/app.js:2901`

- **Pre:** SEC-003 imported (`section` is `<img src=x onerror=alert('SECTION')>`).
- **Steps:**
  1. Look at the compact card, the expanded card's `q-src` line, and the **Export annotations** preview.
- **Expect:** Three literal renderings, zero alerts.
- **Watch:** The four sites are near-identical one-liners; a copy-paste of a new one that omits `esc()` is easy to miss in review.

### SEC-029 - Tag pills escape both the label and the remove-button attribute
**P1** * Security * `src/app.js:1723 tagPills()`

- **Pre:** SEC-003 imported (`manual_tags` includes `<img src=x onerror=alert('TAG')>` and `constructor`).
- **Steps:**
  1. Expand the note and inspect the tag row.
  2. Click the `×` on the hostile tag.
- **Expect:** The pill shows the payload as text; the `data-rmtag` attribute holds the escaped value; clicking `×` removes exactly that tag and no other.
- **Watch:** The class slot `class="tag ${TAG_CLASS[t] || 'claim'}"` at `src/app.js:1725` is **not** escaped. Today the lookup can only yield an in-code class name or an inherited function's source (no quotes), so it is cosmetic — the `constructor` tag may render with a garbled class. If `TAG_CLASS` ever becomes user- or import-populated, this becomes an attribute injection.

### SEC-030 - Provenance chips are escaped
**P1** * Security * `src/app.js:1727 chipRow()`

- **Pre:** SEC-003 imported (`chips` contains an `<img …>` payload).
- **Steps:**
  1. Expand the note, open the "AI-generated · sources" disclosure under the answer.
- **Expect:** The summary line reads "AI-generated" followed by the model, then " · sources"; the chip inside shows the payload as text. No alert.
- **Watch:** The `dim` class is chosen by a regex over the chip text (`src/app.js:1727`) — a hostile chip can force the dim style, which is cosmetic only. Confirm it cannot force anything else.

### SEC-031 - The model name in the provenance line is escaped
**P2** * Security * `src/app.js:1811`, `src/app.js:1827`

- **Pre:** SEC-003 imported (`model` is `<img src=x onerror=alert('MODEL')>`).
- **Steps:**
  1. Open the answer's provenance disclosure and read the model label.
- **Expect:** The payload appears as text after "AI-generated · ". No alert.
- **Watch:** `m.model` also lands in the generated-visual disclaimer at `src/app.js:1827` — check both.

### SEC-032 - The agent trace escapes tool names, arguments and results
**P0** * Security * `src/app.js:1939 traceHTML()`

- **Pre:** SEC-003 imported (the answer carries a hostile `trace`).
- **Steps:**
  1. Expand the note and click the disclosure labelled exactly "Show the agent's work · 1 tool call".
  2. Read the "Tools called:" line, the "Input" block and the "Result" block.
- **Expect:** All three show payloads as literal text inside `<pre>`/`<code>`. No alert, and `</pre>` in the result does not terminate the block early.
- **Watch:** The `<pre class="tr-body">` blocks are the most tempting place to "just show the raw JSON". `esc(JSON.stringify(s.args))` at `src/app.js:1947` must stay in that order — stringify first, escape second.

### SEC-033 - Generated-visual title, ascii and takeaways are escaped
**P1** * Security * `src/app.js:1821-1824`, `src/app.js:1857-1860`

- **Pre:** SEC-003 imported (`m_vis_js` has a hostile `title`, `ascii` and `takeaways`).
- **Steps:**
  1. Expand the note and read the visual card (title, the `<pre class="ascii">` block, the bullet list).
  2. Tick the "Show this on the collapsed card" checkbox on that message, collapse the note, and read the compact card.
- **Expect:** Literal text in both the expanded (`msgCard`) and compact (`fullMsgHTML`) render paths. No alert from either.
- **Watch:** `fullMsgHTML` at `src/app.js:1853` is a second, near-duplicate renderer. It is easy to fix one and forget the other; the compact path only shows when "Show on card" is ticked, so it hides from casual testing.

### SEC-034 - The clamped compact preview escapes before the mention wrapper
**P1** * Security * `src/app.js:1884`

- **Pre:** A fixture comment whose text is `@ai <img src=x onerror=alert('PREVIEW')>` on a note that is *not* the active one.
- **Steps:**
  1. Import, then click a different note so this one renders compact and unchecked.
  2. Read the two-line preview.
- **Expect:** `@ai` is styled as a mention; the rest is literal text. No alert.
- **Watch:** The chain is `esc(plainPreview(...)).replace(/@ai\b/ig, …)`. Reversing those two would inject a `<span>` into unescaped text.

### SEC-035 - The empty-state search message escapes the query
**P2** * Security * `src/app.js:2097`

- **Pre:** App open with notes.
- **Steps:**
  1. Type `<img src=x onerror=alert('QUERY')>` into the notes search box so nothing matches.
- **Expect:** The panel reads `No notes match “<img src=x onerror=alert('QUERY')>”.` with the payload as literal text between curly quotes. No alert.
- **Watch:** The curly quotes are `“` / `”` (U+201C/U+201D), not straight quotes — a copy regression here is visible in this exact string.

### SEC-036 - The document-name banner escapes the file name
**P1** * Security * `src/app.js:2422 showNotesBanner()` / `src/app.js:384 renderTree()`

- **Pre:** A PDF renamed to `<img src=x onerror=alert('NAME')>.pdf` (macOS/Linux allow this; on Windows use `#lt;img…` and skip).
- **Steps:**
  1. Open it with **Open PDF or bundle**.
  2. Read the library row and, if it appears, the top banner reading "Have notes for **…**? Open its **.notes.json** to load them."
- **Expect:** Both show the name as literal text. The library row's `title` tooltip likewise. No alert.
- **Watch:** The `title="${esc(d.name)}"` at `src/app.js:384` and the `<b>` inside the banner at `src/app.js:2426` are separate escapes; both must hold.

### SEC-037 - Find-in-document highlighting escapes the page text
**P1** * Security * `src/app.js:2992 findMarkPage()`

- **Pre:** A PDF containing the literal text `<script>` on a page (or use the OCR path on a scan of such a page).
- **Steps:**
  1. Open the find bar, search for `script`, and step through matches.
- **Expect:** The `<mark class="sh">` wrapper appears around the matched substring and the surrounding characters render as text. No console error, no DOM corruption of the text layer.
- **Watch:** `findMarkPage` rebuilds `span.innerHTML` from `textContent`. All three concatenations at `src/app.js:2999-3003` must be `esc()`-wrapped, including the trailing remainder.

### SEC-038 - Settings fields round-trip hostile values safely
**P1** * Security * `src/app.js:2760 openSettings()`

- **Pre:** App open.
- **Steps:**
  1. Settings → AI & Tools. Set the OpenRouter text model to `"><img src=x onerror=alert('MODELFIELD')>`, the actor name to `<b>me</b>`, and the compat base URL to `"><script>alert(1)</script>`. Save.
  2. Reopen Settings and re-read every field.
- **Expect:** No alert on save or reopen. Each field shows the value verbatim in the input. The actor name renders as literal text in note headers.
- **Watch:** Every value slot in the settings modal is `value="${esc(…)}"`. A new field added without `esc` is self-XSS only, but it is also the exact shape a malicious *prompt-templates* JSON could exploit — see SEC-039.

### SEC-039 - An imported prompt-templates JSON cannot inject into the settings modal
**P1** * Security * `src/app.js:2746 importPrompts()` / `src/app.js:2710 ptItemHTML()`

- **Pre:** A file `evil-prompts.json` = `{"prompts":{"text":"</textarea><img src=x onerror=alert('PROMPT')>"},"tools":{"read_page":"</textarea><script>alert('TOOL')</script>"}}`.
- **Steps:**
  1. Settings → Templates → **Import (JSON)** → pick the file.
  2. Expand the "text" prompt row and the `read_page` tool row.
  3. Press **Save**, close Settings, reopen it, and expand the same rows.
- **Expect:** A toast "2 prompts imported — review and press Save." Both textareas contain the payload as literal text. After the save/reopen round-trip (which re-renders through `ptItemHTML`'s `esc(value)` at `src/app.js:2714`) still no alert.
- **Watch:** `importPrompts` writes straight to `ta.value` (safe), but the *reopen* path re-serialises through a template literal. The bug only appears on the second open, so a tester who closes the modal and stops will miss it.

---

## 5. Markdown, math and code render stack

### SEC-040 - Headings and inline formatting escape first
**P0** * Security * `src/app.js:1969 mdLite()` / `src/app.js:1958 mdInline()`

- **Pre:** SEC-003 imported (the answer starts `# <img src=x onerror=alert('MD_H')>`).
- **Steps:**
  1. Expand the note and read the rendered answer.
- **Expect:** A styled heading whose content is the literal payload text. No alert.
- **Watch:** The contract is stated at `src/app.js:1959` and `1971`: `mdLite` escapes the whole input up front and `mdInline` assumes its input is *already* escaped. Any new caller of `mdInline` that passes raw text breaks the entire stack at once.

### SEC-041 - A `javascript:` markdown link is not linkified
**P0** * Security * `src/app.js:1962`

- **Pre:** SEC-003 imported (the answer contains `[click me](javascript:alert('LINK'))`).
- **Steps:**
  1. Read that line in the rendered answer; click it if it renders as a link.
  2. Console: `[...document.querySelectorAll('#notesList a')].map(a => a.href)`.
- **Expect:** It renders as plain text, not an anchor. No `href` in the notes panel starts with `javascript:`.
- **Watch:** The link regex is restricted to `https?://` at `src/app.js:1962`. Broadening it to "any URL" for relative links would admit `javascript:`, `data:` and `vbscript:` in one edit.

### SEC-042 - Real links open safely
**P1** * Security * `src/app.js:1962`

- **Pre:** A fixture answer containing `[PairedX](https://pairedx.com)`.
- **Steps:**
  1. Import, expand, inspect the anchor element.
- **Expect:** `target="_blank"` **and** `rel="noopener noreferrer"` are both present, plus `class="cite"`.
- **Watch:** Dropping `noopener` gives the opened page a `window.opener` handle back into the app's origin — a real risk for a link that arrived in someone else's shared notes.

### SEC-043 - Table cells are escaped
**P1** * Security * `src/app.js:1984-1985`

- **Pre:** SEC-003 imported (the answer contains a table with an `<img …>` header cell).
- **Steps:**
  1. Read the rendered table.
- **Expect:** A real `<table class="md-table">` renders, and the hostile cell shows as text in the `<th>`. No alert.
- **Watch:** Header and body cells go through two separate `mdInline` calls — check both rows.

### SEC-044 - Blockquotes and lists are escaped
**P2** * Security * `src/app.js:1991-1993`

- **Pre:** SEC-003 imported (the answer contains `> <img …>`).
- **Steps:**
  1. Read the blockquote. Then import a variant with `- <img src=x onerror=alert('LI')>` and `1. <img src=x onerror=alert('OL')>`.
- **Expect:** All three block types render the payload as text.
- **Watch:** Three near-identical while-loops; a fix applied to one is often not applied to the others.

### SEC-045 - Fenced code blocks stay literal, including the language tag
**P0** * Security * `src/app.js:2007 codeBlockHTML()` / `src/app.js:2029 richSegments()`

- **Pre:** SEC-003 imported (the answer has a ```` ```html ```` fence containing `<img src=x onerror=alert('FENCE')>`).
- **Steps:**
  1. Read the code block.
  2. Import a variant whose fence language is `html" onmouseover="alert('LANG')`.
- **Expect:** The fence body shows the tag as text inside `<code>`. The hostile language string lands escaped inside `data-lang` and fires nothing on hover.
- **Watch:** `data-lang="${esc(lang)}"` — the language comes straight from the model's output, so it is attacker-influenced whenever the model is.

### SEC-046 - Math spans cannot inject through MathJax
**P0** * Security * `src/app.js:2010 mathToken()` / `src/app.js:2017 protectMath()`

- **Pre:** SEC-003 imported (the answer ends with `\( <img src=x onerror=alert('MATH')> \)`).
- **Steps:**
  1. Expand the note, let MathJax load (watch Network for `tex-svg.min.js`), and read the math span.
- **Expect:** MathJax typesets it as (broken) TeX or shows a TeX error — never an `<img>`. No alert. `esc()` runs *inside* `mathToken` before the delimiters are re-added (`src/app.js:2011`).
- **Watch:** MathJax's `skipHtmlTags` config (`src/app.js:2057`) excludes `script`, `style`, `pre`, `code` — verify a payload placed inside a fenced code block is not typeset at all.

### SEC-047 - The math sentinel characters cannot be forged from imported text
**P2** * Edge * `src/app.js:2005 RTOK0/RTOK1` / `src/app.js:2027 restoreRich()`

- **Pre:** A fixture answer whose text literally contains `` `0` `` (build it with `python3 -c "import json;print(json.dumps('pre 0 post'))"`).
- **Steps:**
  1. Import and read the rendered answer.
- **Expect:** The sentinels render as nothing or as replacement glyphs — `restoreRich` substitutes `''` when `store[i]` is undefined. No crash, no leaked markup from a neighbouring message.
- **Watch:** A refactor that reuses one `store` array across messages: a forged sentinel could then pull *another* note's math span into this one.

### SEC-048 - The `@ai` mention wrapper never escapes its own span
**P2** * Security * `src/app.js:1967`, `src/app.js:2044`, `src/app.js:1608`

- **Pre:** App open.
- **Steps:**
  1. Type `@ai <b>x</b> @AI @aid` into the note composer and watch the live mention backdrop, then send it and read the saved comment.
- **Expect:** `@ai` and `@AI` are highlighted; `@aid` is not (the `\b` boundary); `<b>x</b>` shows as text in both the backdrop and the saved comment.
- **Watch:** The composer backdrop at `src/app.js:1608` builds `innerHTML` from the live textarea value — it must escape before wrapping mentions, exactly like the render path does.

---

## 6. Shared .annotated.html import

### SEC-049 - Build a hostile shared bundle
**P0** * Security * `src/app.js:279 importSharedHTML()`

- **Pre:** A real exported file to use as a chassis: open the sample paper → sidebar → **Share as HTML** → save `BERT.annotated.html`.
- **Steps:**
  1. Open the saved file in a text editor and find `window.__PAIR_BUNDLE__=`.
  2. Replace the JSON that follows (up to `;</script>`) with a minimal hostile bundle. Keep `pdfB64` from the original file. Build the replacement so that:
     - `notes.annotations` is the array from `evil.notes.json` (SEC-001);
     - `name` is `<img src=x onerror=alert('BUNDLENAME')>`;
     - `readOnly` is `true`.
  3. Escape every `<` in the JSON you paste as `<`, matching what `exportSelfContainedHTML` does at `src/app.js:2571`.
  4. Save as `evil.annotated.html`.
- **Expect:** A file whose bundle JSON contains no literal `<` and which still terminates with `;</script>`.
- **Watch:** If you paste unescaped `<`, step SEC-051 tests the wrong thing — the file will fail to parse for the *right* reason and hide a real regression.

### SEC-050 - Importing the hostile bundle executes nothing
**P0** * Security * `src/app.js:265` / `src/app.js:279`

- **Pre:** App open in the library. `evil.annotated.html` from SEC-049.
- **Steps:**
  1. **Open PDF or bundle** → pick `evil.annotated.html` (or drag it onto the reader).
  2. Watch the console and the toast.
- **Expect:** A toast of the shape "Opened <name> — 5 notes loaded. Keep annotating." with the hostile name rendered as literal text inside the toast (toasts escape via `esc` at `src/app.js:30`). No alert. The document appears in the library with the payload as its literal name.
- **Watch:** `importSharedHTML` runs `applyNotesJSON` at `src/app.js:305`, which runs the same `sanitizeImportedNotes`. If a future "fast path" skips sanitisation for bundles "because we exported them", every check in sections 2-5 is bypassed by the share route.

### SEC-051 - A bundle whose notes contain `;</script>` still parses
**P0** * Edge * `src/app.js:287`

- **Pre:** A variant of `evil.annotated.html` where one comment's text is the literal string `end of bundle ;</script> more text` — with the `<` written as `<` in the JSON, as the exporter does.
- **Steps:**
  1. Import it and read that comment.
- **Expect:** The full comment text survives, including `;</script>`. The bundle is not truncated at the first inner occurrence.
- **Watch:** `importSharedHTML` finds the end with `html.indexOf(';</script>', start)` and relies entirely on the exporter having escaped `<`. Round-trip this: export a note containing `;</script>`, re-import the exported file, and confirm the text is byte-identical.

### SEC-052 - A non-PairedX HTML file is rejected with the exact copy
**P1** * Copy * `src/app.js:283`

- **Pre:** Any ordinary web page saved as `page.html`.
- **Steps:**
  1. Try to open it via **Open PDF or bundle**.
- **Expect:** Error toast reading exactly `"page.html" isn't a PairedX shared paper.` (with curly quotes `“ ”` around the name and a curly apostrophe in "isn’t"). Nothing is added to the library.
- **Watch:** The marker search is a plain `indexOf` of `window.__PAIR_BUNDLE__=` — any page that happens to contain that string reaches `JSON.parse`, which is why the next check matters.

### SEC-053 - A malformed bundle is rejected without corrupting state
**P1** * Edge * `src/app.js:290-291`

- **Pre:** Three files: (a) `window.__PAIR_BUNDLE__={` with no terminator; (b) a valid terminator but invalid JSON; (c) valid JSON with no `pdfB64`.
- **Steps:**
  1. Import each; after each, check the library and the notes panel.
- **Expect:** (a) and (b) → "Could not read the shared paper in “<name>”." (c) → "“<name>” has no embedded PDF." In all three cases the library gains no entry and existing notes are untouched.
- **Watch:** A partially applied import — `switchDoc` runs at `src/app.js:303` only *after* the PDF bytes are validated, so a failure must leave the active document unchanged.

### SEC-054 - A bundle carrying a non-PDF payload fails cleanly
**P1** * Edge * `src/app.js:292` / `src/app.js:215`

- **Pre:** A bundle whose `pdfB64` is the base64 of a small text file.
- **Steps:**
  1. Import it.
- **Expect:** The library entry may be created, then the reader shows the fallback message "Could not open “<name>” — it may not be a valid PDF." No unhandled exception, no blank app.
- **Watch:** `b64ToBytes` (`src/app.js:177`) uses `atob`, which throws on invalid base64. Confirm a bundle with `"pdfB64": "not base64!!"` produces a toast, not a dead page.

### SEC-055 - Bundle-supplied SHA is not trusted for dedupe collisions
**P1** * Security * `src/app.js:293`, `src/app.js:296`

- **Pre:** The sample paper open with several of your own notes. A hostile bundle whose `sha` is copied from your sample document (read it from `JSON.parse(localStorage.srw_state_v1).docs`) but whose `pdfB64` is a *different* PDF.
- **Steps:**
  1. Import the hostile bundle.
  2. Inspect the reader and your original notes.
- **Expect:** The bundle's notes merge into the matched library entry (that is the documented content-addressing behaviour at `src/app.js:296`), and your original notes are still present — the merge at `applyNotesJSON` with `{merge:true}` unions by id rather than replacing.
- **Watch:** Whether the *displayed PDF* silently becomes the attacker's file while keeping your document's name and notes. `importSharedHTML` only refreshes `_docBytes` when the cache is empty (`src/app.js:297`), so on a warm cache your original bytes should win. Confirm which PDF you are actually reading before you trust the notes attached to it.

### SEC-056 - A `.notes.json` claiming a foreign SHA prompts before attaching
**P1** * Security * `src/app.js:2443 openNotesFileFor()`

- **Pre:** A document with a known SHA open, and a notes file whose `document.sha256` is a different 64-hex string. Trigger the "Have notes for …" banner (open a fresh PDF with no notes) and use **Open notes file…**.
- **Steps:**
  1. Pick the mismatched notes file.
  2. Read the confirm dialog, then press **Cancel**.
  3. Repeat and press **Attach**.
- **Expect:** Dialog text `“<file>” was saved for a different PDF. Attach it to “<doc>” anyway?` with buttons labelled exactly "Attach" and "Cancel". Cancel imports nothing; Attach imports and toasts "<n> notes loaded."
- **Watch:** Cancel still importing. `confirmDialog` resolves `false` on Escape and on backdrop click as well — test all three dismissal routes.

### SEC-057 - Mixed drag-and-drop of PDF + hostile notes stays sanitised
**P1** * Security * `src/app.js:255 openFiles()` / `src/app.js:310 attachNotesFile()`

- **Pre:** A PDF and `evil.notes.json` selected together.
- **Steps:**
  1. Drag both onto the reader in one gesture.
- **Expect:** The PDF opens; the notes attach to it; no alert. Same sanitisation as the explicit import path.
- **Watch:** `attachNotesFile` routes to `applyNotesJSON` too, but by a different matching path (SHA → opened-alongside → filename). Confirm each of those three branches still passes through the sanitiser.

### SEC-058 - A `.json` that is not a notes file is refused
**P2** * Edge * `src/app.js:311` / `src/app.js:269`

- **Pre:** `package.json` from the repo, and a file containing `not json at all`.
- **Steps:**
  1. Drop each onto the reader.
- **Expect:** For `package.json`: "“package.json” has no notes to import." For the invalid file: "Could not read <name> — not valid JSON." Nothing is added.
- **Watch:** The two messages come from different call sites (`attachNotesFile` vs `openFiles`) — a refactor that collapses them can change the wording; both strings are user-facing.

### SEC-059 - Rapid double-import does not duplicate or race
**P2** * Edge * `src/app.js:2316 applyNotesJSON()`

- **Pre:** `evil.notes.json`.
- **Steps:**
  1. Import it, then immediately import it again (twice within a second).
  2. Count the notes.
- **Expect:** The explicit Import path *replaces* this document's notes (no `merge` flag at `src/app.js:2326`), so the count stays at 5 — not 10. No alert on either pass.
- **Watch:** A replace that leaves orphaned IndexedDB assets, and — more important here — the second sanitisation pass running over *already-sanitised* state and regenerating ids, which would break any connector or active selection pointing at the old id.

---

## 7. Read-only bundle isolation

### SEC-060 - A shared file boots read-only with the exact banner
**P0** * Security * `src/app.js:3294 applyReadOnly()`

- **Pre:** `BERT.annotated.html` exported in SEC-049. Open it directly from disk (double-click → `file://`).
- **Steps:**
  1. Read the fixed bar at the bottom of the window.
  2. Try to find: New/Open, the highlight, comment and screenshot tools, the composer, Save notes, Import notes, Clear notes, Share as HTML, Settings, and the Storage strip.
- **Expect:** Banner text exactly "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX", with "pairedx.com" linking to `https://pairedx.com/app` with `rel="noopener"`. All eleven controls listed at `src/app.js:3296-3298` are hidden, and `.sb-storage` is hidden.
- **Watch:** A newly added editing control that is not in that id list. The list is hand-maintained — every new toolbar button must be added to it or it stays live in shared files.

### SEC-061 - The read-only viewer writes nothing to localStorage
**P0** * Security * `src/app.js:151-152 save()`

- **Pre:** The shared file open on an origin where you can inspect storage. Use `vercel dev` and serve the exported file from the site root so it shares the app's origin (this is the worst case).
- **Steps:**
  1. Note the exact value of `localStorage.srw_state_v1` before opening the file.
  2. Open the shared file, expand notes, toggle "Show the agent's work", switch continuous/single page, zoom, collapse both panels, and use find-in-document.
  3. Re-read `localStorage.srw_state_v1`.
- **Expect:** Byte-identical. `save()` returns immediately when `READONLY` is true.
- **Watch:** Any write path that does not funnel through `save()`. Specifically check `localStorage.getItem('srw_saveas_tip')` is not created — `maybeShowSaveAsTip` guards on `READONLY` at `src/app.js:2461`.

### SEC-062 - The read-only viewer does not adopt the host's library
**P0** * Security * `src/app.js:73` / `src/app.js:3283 initBundleState()`

- **Pre:** On the same origin as SEC-061, with several documents and notes already in the app.
- **Steps:**
  1. Open the shared file from that origin.
  2. Look at the left library and the notes panel.
- **Expect:** Exactly one document — the bundled paper — and only the bundle's notes. None of your local documents or notes appear.
- **Watch:** `let state = migrateState(loadState())` runs at module scope (`src/app.js:73`) *before* `boot()` calls `initBundleState()`. The local state genuinely is read into memory first; `initBundleState` must fully replace it. A regression that merges instead of replaces would expose your library inside a file you then hand to someone else.

### SEC-063 - The bundle's own notes are sanitised on the read-only path
**P0** * Security * `src/app.js:3290`

- **Pre:** `evil.annotated.html` from SEC-049, opened directly (read-only).
- **Steps:**
  1. Walk every note; open every disclosure; check the console.
- **Expect:** No alert, exactly as in the editable import. `initBundleState` calls `sanitizeImportedNotes` at `src/app.js:3290`.
- **Watch:** The comment at `src/app.js:3288-3289` calls this "free defense-in-depth" because the bundle is same-origin with itself — but a shared file served from *your* domain is same-origin with *your* app. Removing this call as redundant would be a real regression.

### SEC-064 - Drag-and-drop is disabled in the read-only viewer
**P1** * Security * `src/app.js:3071`

- **Pre:** A shared file open read-only.
- **Steps:**
  1. Drag a PDF and a `.notes.json` onto the reader area.
- **Expect:** Nothing happens — no drop-hint outline, no import, no toast. The drop wiring is inside `if (!READONLY)`.
- **Watch:** The browser's own default handling taking over and *navigating* the tab to the dropped file, which loses the shared paper. Confirm the tab still shows the shared document afterwards.

### SEC-065 - Text selection cannot create a note in the read-only viewer
**P1** * Security * `src/app.js:814`

- **Pre:** A shared file open read-only.
- **Steps:**
  1. Select a sentence in the PDF and wait for the selection popover.
  2. Press the highlight, comment and screenshot keyboard shortcuts if any exist.
- **Expect:** No "Highlight · Note · Ask AI" popover appears (the guard at `src/app.js:814` returns early when `READONLY`). No new note is created by any route.
- **Watch:** Selection still being *possible* is correct and desirable — the reader must be able to copy text. Only note creation is blocked.

### SEC-066 - OCR in a read-only bundle: know what it writes
**P1** * Security * `src/app.js:775 runOcr()` / `src/app.js:133 idbPut()`

- **Pre:** Export a shared file from a **scanned, image-only** PDF, then open it read-only.
- **Steps:**
  1. Wait for the banner "This looks like a **scanned PDF** — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?" to appear.
  2. Open DevTools → Application → IndexedDB → `srw_assets` → `assets` and note the keys.
  3. Press **Run OCR**, let one page finish, then re-check the keys.
- **Expect:** Document the actual behaviour. `idbPut` has **no** `READONLY` guard, so an `ocr:<sha>` entry is expected to appear even in a read-only viewer.
- **Watch:** If the product promise is "a read-only bundle never writes to storage", this is the one path that contradicts it — `localStorage` stays clean but IndexedDB does not. Either the guard belongs in `idbPut`/`runOcr`, or the promise needs qualifying. Flag it rather than passing it silently.

### SEC-067 - A read-only bundle cannot be re-shared from inside itself
**P1** * Security * `src/app.js:3297`

- **Pre:** A shared file open read-only.
- **Steps:**
  1. Look for **Share as HTML** in the sidebar; try the keyboard route if one exists.
- **Expect:** The button is hidden. Even if invoked, `exportSelfContainedHTML` fetches `/app.html`, `/src/styles.css` etc. from the origin (`src/app.js:2561-2565`) and on `file://` those fetches fail, producing "Could not build the file: <error>".
- **Watch:** A shared file served from a live origin *could* rebuild itself. Confirm the button stays hidden there too (SEC-060 covers the same-origin case).

### SEC-068 - The read-only viewer makes no request to the AI proxy
**P0** * Security * `src/app.js:1244-1272`

- **Pre:** A shared file open read-only, Network tab recording, filter `api`.
- **Steps:**
  1. Read notes, expand AI answers, open every "Show the agent's work" disclosure, and try the document-level composer.
- **Expect:** Zero requests to `/api/ai` or `/api/ai-image`. The composer is hidden (`src/app.js:3296`), so there is no path to send one.
- **Watch:** A "regenerate this answer" affordance added to the answer card without a `READONLY` guard — it would fire the recipient's browser at the proxy using the *site's* shared key.

---

## 8. Export hygiene: what must never be in a shared file

### SEC-069 - The exported file contains no API key
**P0** * Security * `src/app.js:2568` / `src/app.js:2540 notesJSONForExport()`

- **Pre:** Enter a recognisable dummy key in Settings → AI & Tools → OpenRouter, e.g. `sk-or-QA-CANARY-000111`. Save. Ask the AI at least one question so an answer with provenance exists.
- **Steps:**
  1. Sidebar → **Share as HTML**, save the file.
  2. `grep -c "QA-CANARY" <file>` and `grep -o '"keys"[^}]*}' <file>`.
- **Expect:** Zero matches for the canary. The bundle object is only `{ readOnly, name, sha, pdfB64, notes }` (`src/app.js:2568`) and `notes` comes from `docNotesJSON` (`src/app.js:2271`), which carries no settings.
- **Watch:** Anyone "improving" sharing by embedding `state.settings` so the recipient inherits the model choice. That would ship the key with it.

### SEC-070 - The exported file contains no other settings either
**P1** * Security * `src/app.js:2271 docNotesJSON()`

- **Pre:** A recognisable actor name (`ZZQA-ACTOR`), a custom compat base URL, and a customised prompt template containing `ZZQA-PROMPT`.
- **Steps:**
  1. Export and grep for `ZZQA-ACTOR`, `ZZQA-PROMPT`, `compatBaseUrl`, `srw_state_v1`.
- **Expect:** `ZZQA-ACTOR` may legitimately appear inside note *authorship* if your name is stored on messages — verify any hit is a message field, not a settings blob. `ZZQA-PROMPT`, `compatBaseUrl` and `srw_state_v1` must not appear as data (the string `srw_state_v1` will appear once inside the inlined `src/app.js` source — that is the constant at `src/app.js:37`, not your data).
- **Watch:** Distinguish "appears in the inlined application source" from "appears in the bundle". Search specifically inside the `window.__PAIR_BUNDLE__=` payload.

### SEC-071 - Analytics is stripped from the exported file
**P0** * Security * `src/app.js:2586-2587`

- **Pre:** An exported `.annotated.html`.
- **Steps:**
  1. `grep -c "window.va" <file>` and `grep -c "_vercel/insights" <file>`.
  2. Open the file from `file://` with the Network tab open and browse for 30 seconds.
- **Expect:** Zero matches for both. No request to any `vercel.com` / `/_vercel/` endpoint.
- **Watch:** The strip is two literal regexes matching the exact tags at `app.html:135-136`. Reformatting those two lines in `app.html` (adding an attribute, changing quoting, moving them into `<head>`) silently defeats the strip and the shared file starts phoning home. Re-run this check after **any** edit to `app.html`.

### SEC-072 - Know exactly which external hosts a shared file still contacts
**P1** * Security * `app.html:7-10` / `src/app.js:2061` / `src/app.js:685-697`

- **Pre:** An exported file open from `file://`, Network tab recording, third-party requests visible.
- **Steps:**
  1. Load the file, read a note containing math, and (if the bundled PDF is a scan) start OCR.
  2. List every non-`file://` request.
- **Expect:** The `<link rel="preconnect">` to `cdnjs.cloudflare.com` and the Google Fonts stylesheet from `app.html:7-10` are **not** stripped by the exporter, so `fonts.googleapis.com` / `fonts.gstatic.com` are expected. MathJax loads from `cdnjs.cloudflare.com` only when an answer contains math (`src/app.js:2061`). Tesseract loads from `cdn.jsdelivr.net` and `tessdata.projectnaptha.com` only if OCR is run (`src/app.js:685-697`). Nothing else.
- **Watch:** The README promise is specifically that a shared file "must not phone home" for *analytics* (`src/app.js:2586`). Fonts and MathJax still leak the reader's IP to third parties on open. If the copy ever hardens to "makes no external requests", this check must fail until the fonts link is stripped too.

### SEC-073 - Hostile note text survives the export/import round trip byte-for-byte
**P0** * Regression * `src/app.js:2571` / `src/app.js:287`

- **Pre:** Import `evil.notes.json` into a document, then **Share as HTML**.
- **Steps:**
  1. Open the exported file in a text editor; confirm the bundle JSON contains `<` and no bare `<` between `window.__PAIR_BUNDLE__=` and `;</script>`.
  2. Import the exported file back into the app (**Open PDF or bundle**).
  3. Compare each note's text against the original fixture.
- **Expect:** Every payload string returns identical — including the `</script>` inside the comment, the `<img …>` in the section, and the markdown fence. Ids will differ (they were regenerated at first import) but text must not.
- **Watch:** Double-escaping. If `<` survives as a literal six-character sequence in the re-imported note text instead of being read back as `<`, the round trip is corrupting user content.

### SEC-074 - The inlined app and PDF.js code cannot be terminated early
**P0** * Security * `src/app.js:2575 inlineJs()`

- **Pre:** An exported file.
- **Steps:**
  1. `grep -c '</script' <file>` and count how many of those are genuine tag closers (there should be one per inlined block).
  2. Confirm the file contains `<\/script` occurrences inside the inlined JS.
  3. Open the file and confirm the app boots (a broken parse shows as a blank page).
- **Expect:** No stray `</script` inside a `<script>` body. The app renders.
- **Watch:** `inlineJs` is applied to `pdfjs` and `appjs` but **not** to `worker` (`src/app.js:2582`) or `css` (`2580`). If `vendor/pdf.worker.b64.js` ever contains a literal `</script`, the export breaks. Re-check after any vendor upgrade.

### SEC-075 - The `$` substitution hazard is still handled
**P1** * Regression * `src/app.js:2579`

- **Pre:** An exported file built from a PDF whose base64 or whose notes contain `$&`, `$1`, `$'` sequences (a large binary almost always does).
- **Steps:**
  1. Open the exported file and confirm the app boots and the PDF renders all pages.
- **Expect:** Correct rendering. `put()` uses a function replacement precisely so `$`-patterns are inserted verbatim.
- **Watch:** A refactor to a plain string replacement. The corruption is data-dependent — it will pass on a small test PDF and fail on a real one.

### SEC-076 - The exported filename is sanitised
**P2** * Security * `src/app.js:2588`

- **Pre:** A document named `../../etc/passwd.pdf` (rename a PDF before opening it, or edit `docs[].name` in localStorage).
- **Steps:**
  1. **Share as HTML** and read the suggested filename in the save dialog.
- **Expect:** The suggestion is `.._.._etc_passwd.annotated.html` or similar — `[^\w.\- ]+` is replaced with `_`, so no `/` survives.
- **Watch:** The same sanitiser is used for `notesFileName` (`src/app.js:2266`), which feeds `dir.getFileHandle()` in folder-sync mode — a path separator there would be a directory escape inside the granted folder.

### SEC-077 - Cancelling the Save As dialog exports nothing
**P1** * Security * `src/app.js:2503 saveAsFile()` * Chromium only

- **Pre:** Chrome or Edge.
- **Steps:**
  1. **Share as HTML** → wait for "Building shareable file…" → in the OS dialog press Cancel/Escape.
  2. Check the Downloads folder and the Downloads shelf.
- **Expect:** No file is written and no fallback download starts. `saveAsFile` returns `{status:'cancelled'}` and `exportSelfContainedHTML` returns at `src/app.js:2594`.
- **Watch:** A cancelled dialog falling through to `URL.createObjectURL` + `a.click()` — the user gets a file they explicitly declined, containing their annotated paper, in their default download folder.

---

## 9. API key handling in the browser

### SEC-078 - The key field is a password input and is not autofilled into the DOM as text
**P1** * Security * `src/app.js:2771`, `src/app.js:2777`

- **Pre:** Settings → AI & Tools with a key saved.
- **Steps:**
  1. Inspect `#kOpenrouter` and `#kCompat` in the Elements panel.
- **Expect:** Both are `type="password"`. Their `value` attribute holds the escaped key (unavoidable — it must round-trip), but the on-screen rendering is dots.
- **Watch:** A "show key" toggle added without also considering screen sharing and screenshots. If one exists, confirm it is off by default on every open.

### SEC-079 - The key is sent only to same-origin `/api/*`
**P0** * Security * `src/app.js:1237 keyFor()` / `src/app.js:1245`, `1255`, `1265`, `1409`, `1441`

- **Pre:** Canary key `sk-or-QA-CANARY-000111` saved. Network tab recording, "Preserve log" on.
- **Steps:**
  1. Ask an AI question that triggers the agent (e.g. "summarise the whole paper"), generate a visual, and run a web-search-enabled question.
  2. In the Network panel use the global search (Ctrl/Cmd-F in the search drawer) for `QA-CANARY`.
- **Expect:** Every hit is a request to `/api/ai` or `/api/ai-image` on the app's own origin, in the request **body** as `userKey`. No hit in a URL, a query string, a header other than the implicit body, a referrer, or any third-party request.
- **Watch:** A refactor that moves the key to a URL parameter or an `Authorization` header on the browser side — both end up in server logs and in the Referer of any subsequent navigation.

### SEC-080 - The compat base URL is sent but ignored for OpenRouter
**P1** * Security * `api/ai.js:95`

- **Pre:** Provider = OpenRouter. Set the compat base URL to `http://169.254.169.254/latest/meta-data/`.
- **Steps:**
  1. Ask a question. Inspect the `/api/ai` request body.
  2. Confirm the answer comes back normally.
- **Expect:** The body does contain `baseUrl: "http://169.254.169.254/latest/meta-data/"` (the client always sends it), and the server ignores it entirely: `url = provider === 'openrouter' ? OR_BASE : baseOf(baseUrl)`.
- **Watch:** A server refactor that computes `url` from `baseUrl` first and only then branches on provider. That would make every OpenRouter request an SSRF with the *server's* key attached — the worst case in this codebase.

### SEC-081 - An empty key falls back to the server key without sending an empty string
**P2** * Security * `src/app.js:1237`, `src/app.js:1247`

- **Pre:** Clear both key fields and save.
- **Steps:**
  1. Ask a question and inspect the `/api/ai` request body JSON.
- **Expect:** No `userKey` property at all (`keyFor(provider) || undefined` omits it), not `"userKey": ""`.
- **Watch:** `"userKey": ""` would still be falsy on the server (`userKey && String(userKey).trim()` at `api/ai.js:87`), so behaviour is unchanged — but a change to `userKey !== undefined` on the server would flip it into "user has a key" and break the compat guard.

### SEC-082 - A whitespace-only key is treated as no key
**P2** * Edge * `src/app.js:1237` / `api/ai.js:87`

- **Pre:** Type three spaces into the OpenRouter key field and save.
- **Steps:**
  1. Reopen Settings and check the field. Ask a question.
- **Expect:** The field is empty (`$('#kOpenrouter').value.trim()` at `src/app.js:2825`), and the request omits `userKey`.
- **Watch:** Whitespace surviving into `Authorization: 'Bearer  '` upstream, which returns a confusing provider error instead of the app's own "No key" message.

### SEC-083 - The key is never written into any exported artifact
**P0** * Security * `src/app.js:2271`, `src/app.js:2734 exportPrompts()`

- **Pre:** Canary key saved.
- **Steps:**
  1. Export notes JSON (**Save notes**), export the shared HTML, and export prompt templates (Settings → Templates → **Export (JSON)**).
  2. `grep -l "QA-CANARY"` across all three files.
- **Expect:** No matches.
- **Watch:** `exportPrompts` serialises whatever is in the prompt textareas. If a user pasted their key into a prompt template, it *will* be exported — that is user error, but confirm the app does not put it there itself.

### SEC-084 - Clearing the key actually clears storage
**P1** * State * `src/app.js:2825-2826` / `src/app.js:151 save()`

- **Pre:** Canary key saved.
- **Steps:**
  1. Settings → clear both key fields → Save.
  2. Console: `localStorage.srw_state_v1.includes('QA-CANARY')`.
  3. Reload and reopen Settings.
- **Expect:** `false`, and the fields are empty after reload.
- **Watch:** The debounced `save()` (250 ms at `src/app.js:154`). Reading storage instantly after Save can show the old value; wait a second before asserting.

### SEC-085 - The quota message never leaks the site owner's provider account
**P1** * Copy * `api/ai.js:31-32`, `api/ai.js:108`

- **Pre:** Ability to force a 402/429 from the server key — either wait for the shared quota to run out, or `curl` the endpoint with a deliberately exhausted key.
- **Steps:**
  1. Ask a question with **no** personal key set and the shared key exhausted.
- **Expect:** The error toast reads exactly "The site's shared demo quota is used up right now — add your own key in Settings → AI & Tools to keep going (it stays in your browser and is never saved on our server)." (with a curly apostrophe in "site’s"). It must **not** contain the provider's own "add credits" text, a workspace URL, or an account id.
- **Watch:** `usedServerKey` is only true when no BYO key was sent (`api/ai.js:92`). With a BYO key the raw provider error is passed through, which is correct — the user needs to see their own billing message. Verify both directions.

### SEC-086 - The server key is never returned to the browser
**P0** * Security * `api/ai.js:106`, `api/ai.js:109`

- **Pre:** No personal key set.
- **Steps:**
  1. Ask a question; inspect the full `/api/ai` response body.
  2. Force an error (e.g. set the model to `does/not-exist`) and inspect the error response body.
- **Expect:** The success body is `{ "text": … }` only. The error body is `{ "error": <string> }` and contains no `sk-` prefixed token.
- **Watch:** `String(e.message)` on an upstream failure can echo back a request that included the Authorization header on some SDKs. This proxy builds the header itself with plain `fetch`, so it should not — confirm after any change to `postJSON`.

---

## 10. Proxy hardening: /api/ai

> These checks use `curl` against the deployed site (or `vercel dev`). Substitute your own host.

### SEC-087 - Only POST is accepted
**P1** * Security * `api/ai.js:79`

- **Steps:**
  1. `curl -i https://pairedx.com/api/ai`
  2. `curl -i -X PUT https://pairedx.com/api/ai`
- **Expect:** Both return `405` with body `{"error":"POST only"}`.
- **Watch:** A GET handler added for a health check would make the endpoint reachable from an `<img>` or a link, i.e. CSRF-able.

### SEC-088 - An unknown provider is rejected before any URL is computed
**P0** * Security * `api/ai.js:86`

- **Steps:**
  1. `curl -s -X POST https://pairedx.com/api/ai -H 'Content-Type: application/json' -d '{"provider":"evil","baseUrl":"http://169.254.169.254/","user":"hi","userKey":"x"}'`
  2. Repeat with `"provider":""`, `"provider":null`, `"provider":"COMPAT"`, `"provider":"compat "`, `"provider":["compat"]`, `"provider":{"toString":"compat"}`.
- **Expect:** Every one returns `400` with exactly `{"error":"Unsupported provider."}`. Note that omitting `provider` entirely defaults to `openrouter` (`api/ai.js:83`) and is *not* an error.
- **Watch:** The comment at `api/ai.js:84-85` explains why: an unknown provider name would skip the compat guards (which key off `provider === 'compat'`) and still reach `baseOf(baseUrl)`. Case-insensitive or trimmed matching would re-open exactly that.

### SEC-089 - The compat provider refuses to run on the server key
**P0** * Security * `api/ai.js:91`

- **Steps:**
  1. `curl -s -X POST https://pairedx.com/api/ai -H 'Content-Type: application/json' -d '{"provider":"compat","baseUrl":"https://api.openai.com/v1","user":"hi"}'`
  2. Repeat with `"userKey":""` and `"userKey":"   "`.
- **Expect:** All return `400` with exactly `{"error":"The OpenAI-compatible provider needs your own API key (add it in Settings → AI & Tools). The site's shared demo key only works with OpenRouter."}` (curly apostrophe in "site’s").
- **Watch:** This is the single guard preventing a caller-chosen URL from being paired with the server's credentials. Any change that lets `compat` fall back to `process.env.OPENAI_API_KEY` for anonymous callers hands the site's key to any host the caller names.

### SEC-090 - A non-HTTPS custom endpoint is rejected
**P0** * Security * `api/ai.js:97`

- **Steps:**
  1. `curl -s -X POST … -d '{"provider":"compat","userKey":"sk-test","baseUrl":"http://api.openai.com/v1","user":"hi"}'`
  2. Repeat with `file:///etc/passwd`, `gopher://127.0.0.1:6379/`, and `//api.openai.com/v1`.
- **Expect:** Each returns `400` with `{"error":"Custom endpoints must use HTTPS."}`.
- **Watch:** `baseOf` (`api/ai.js:14`) defaults an empty/blank `baseUrl` to `https://api.openai.com/v1` and strips trailing slashes — confirm `"baseUrl":""` and `"baseUrl":"   "` are accepted as the default OpenAI host, not rejected.

### SEC-091 - A host outside the allowlist is rejected
**P0** * Security * `api/ai.js:22-26`, `api/ai.js:98`

- **Steps:**
  1. `curl -s -X POST … -d '{"provider":"compat","userKey":"sk-test","baseUrl":"https://evil.example.com/v1","user":"hi"}'`
  2. Repeat with `https://169.254.169.254/`, `https://127.0.0.1/`, `https://localhost/`, `https://metadata.google.internal/`, and a domain you control whose DNS A-record points at `127.0.0.1`.
- **Expect:** Every one returns `400` with exactly `{"error":"That endpoint isn't a recognized OpenAI-compatible provider. Use a known provider, or self-host PairedX to point at any endpoint (including a local model)."}` (curly apostrophe in "isn’t").
- **Watch:** The DNS-rebind case is the reason this is an allowlist rather than a blocklist (comment at `api/ai.js:16-21`). If someone "improves" it into a regex blocking private ranges, that case starts passing.

### SEC-092 - Every allowlisted host is accepted
**P1** * Regression * `api/ai.js:22-26`

- **Steps:**
  1. For each of the twelve hosts in `COMPAT_HOSTS`, POST with `provider: "compat"`, a dummy `userKey`, and `baseUrl: "https://<host>/v1"`.
- **Expect:** None returns the "isn't a recognized OpenAI-compatible provider" error. They will fail upstream with an auth error instead (401/403 passed through) — that is the correct pass condition.
- **Watch:** A typo introduced when editing the set (e.g. `api.together.ai` vs `api.together.xyz` — both are listed and both must stay). Also confirm the match is on hostname only: `https://api.openai.com:8443/v1` and `https://api.openai.com/anything/v1` both pass, because `hostOf` (`api/ai.js:27`) compares only the host.

### SEC-093 - Host matching is case-insensitive and userinfo cannot spoof it
**P1** * Edge * `api/ai.js:27`

- **Steps:**
  1. POST with `baseUrl: "https://API.OpenAI.COM/v1"`.
  2. POST with `baseUrl: "https://api.openai.com@evil.example.com/v1"`.
  3. POST with `baseUrl: "https://evil.example.com#api.openai.com/v1"`.
- **Expect:** (1) accepted (lowercased at `api/ai.js:27`). (2) and (3) rejected — `new URL(...).hostname` resolves to `evil.example.com` in both.
- **Watch:** Replacing `new URL().hostname` with a string `indexOf` or a regex. Case 2 is the classic bypass and it passes trivially against `url.includes('api.openai.com')`.

### SEC-094 - Redirects are not followed
**P0** * Security * `api/ai.js:45`

- **Pre:** Control of an allowlisted-looking endpoint is not possible, so verify by code inspection plus a self-host run.
- **Steps:**
  1. Confirm `redirect: 'error'` is present on the `fetch` in `postJSON` (`api/ai.js:45`) and in `post` (`api/ai-image.js:23`).
  2. If you can run `vercel dev` with `ALLOW_PRIVATE_ENDPOINTS=1`, point `baseUrl` at a local server that 302s `/chat/completions` to `http://127.0.0.1:1234/`, and confirm the request fails rather than following.
- **Expect:** The function returns a 500-level error, not the redirect target's content.
- **Watch:** Node's `fetch` defaults to `redirect: 'follow'`. Dropping this option turns every allowlisted provider into a redirector into private space.

### SEC-095 - Upstream calls time out
**P1** * Perf * `api/ai.js:42-48`

- **Steps:**
  1. Confirm the `AbortController` + 60 s `setTimeout` exists in `postJSON` and that `clearTimeout` runs in the `finally`.
  2. With `ALLOW_PRIVATE_ENDPOINTS=1` locally, point at a server that accepts the connection and never responds. Time the failure.
- **Expect:** The request aborts at ~60 s with an `AbortError`-derived message, not an indefinite hang.
- **Watch:** A missing `clearTimeout` leaks a pending timer per request and keeps the serverless instance warm needlessly.

### SEC-096 - Bad request bodies degrade gracefully
**P2** * Edge * `api/ai.js:34-38`

- **Steps:**
  1. POST with an empty body, with `not json`, with `Content-Type: text/plain` and a JSON string, and with a 10 MB body.
- **Expect:** No 500 from a parse crash. An empty/garbage body parses to `{}`, defaults to `provider: 'openrouter'`, and returns either an answer or a clean `{"error": …}`.
- **Watch:** `readBody` swallows parse errors and returns `{}` — verify that path does not then reach the upstream provider with an empty prompt on the *server's* key on every malformed request, which is a cheap quota-drain.

---

## 11. Proxy hardening: /api/ai-image

### SEC-097 - Only POST, and only the two known providers
**P1** * Security * `api/ai-image.js:38`, `api/ai-image.js:42`

- **Steps:**
  1. `curl -i https://pairedx.com/api/ai-image` → expect `405 {"error":"POST only"}`.
  2. POST with `"provider":"evil"` → expect `400` with `{"error":"evil can't generate images — use OpenRouter or an OpenAI-compatible endpoint."}`.
- **Expect:** As stated. Note the message interpolates the caller-supplied provider name — confirm it is returned as a JSON string value (so it cannot break out) and that nothing renders it as HTML.
- **Watch:** The provider name is echoed back. If any client ever renders this error with `innerHTML` instead of through `toast()`/`esc()`, it becomes reflected XSS.

### SEC-098 - Image generation on a caller-chosen endpoint is BYO-key only
**P0** * Security * `api/ai-image.js:45`

- **Steps:**
  1. POST `{"provider":"compat","baseUrl":"https://api.openai.com/v1","prompt":"x"}` with no `userKey`.
- **Expect:** `400` with exactly `{"error":"The OpenAI-compatible provider needs your own API key (add it in Settings → AI & Tools)."}` — note this message is **shorter** than the `api/ai.js` equivalent (no "The site's shared demo key only works with OpenRouter." sentence).
- **Watch:** The two files carry near-duplicate guards. A fix applied to `api/ai.js` and not to `api/ai-image.js` is the most likely regression here — always test both.

### SEC-099 - The image proxy enforces the same host allowlist
**P0** * Security * `api/ai-image.js:50-53`

- **Steps:**
  1. POST `{"provider":"compat","userKey":"sk-test","baseUrl":"http://api.openai.com/v1","prompt":"x"}` → expect `{"error":"Custom endpoints must use HTTPS."}`.
  2. POST with `"baseUrl":"https://evil.example.com/v1"` → expect `{"error":"That endpoint isn't a recognized OpenAI-compatible provider. Use a known provider, or self-host PairedX to point at any endpoint."}` (curly apostrophe; and note this variant omits "(including a local model)").
- **Watch:** The `COMPAT_HOSTS` set is **duplicated** in both files (`api/ai.js:22-26`, `api/ai-image.js:12-16`). Diff them after any edit — a host added to one and not the other produces a provider that works for text but not images, with a confusing error.

### SEC-100 - The guard runs before the outbound request, not after
**P1** * Security * `api/ai-image.js:50` vs `api/ai-image.js:70`

- **Steps:**
  1. With `ALLOW_PRIVATE_ENDPOINTS` unset, POST a compat request with a disallowed `baseUrl` and a valid-looking `userKey`, and (if you control a logging endpoint on an internet host) confirm no connection is attempted.
- **Expect:** The 400 is returned with zero outbound traffic. Note that `baseOf(baseUrl)` is computed twice — once at `api/ai-image.js:51` for the check and again at `70` for the call — so confirm both derive from the same input.
- **Watch:** If the guard is ever moved below the `provider === 'openrouter'` branch, the compat call at line 70 would fire first.

### SEC-101 - A returned image URL is validated before it is rendered
**P0** * Security * `api/ai-image.js:64-75` / `src/app.js:1261` / `src/app.js:20`

- **Pre:** The proxy returns whatever the model produced — `api/ai-image.js` does **not** validate the URL shape beyond a loose regex at line 66.
- **Steps:**
  1. Simulate a hostile provider: with DevTools open, use a request-override / local overrides rule to make `/api/ai-image` respond `{"image":"javascript:alert('PROXY')"}`, then generate a visual.
  2. Repeat with `{"image":"data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4="}` and `{"image":"http://example.com/px.png"}`.
- **Expect:** In all three cases the visual card renders with no image and no alert, and no request to `example.com`. `aiImage` returns `j.image` unvalidated (`src/app.js:1261`), so the *only* thing standing between a malicious or compromised provider and your DOM is `safeImgSrc` at the render sites.
- **Watch:** This is the reason SEC-023 matters. If a render site is ever added that trusts a freshly generated image "because we just made it", a hostile or compromised model provider gets script execution in the user's session.

---

## 12. Public privacy promises

> Each check verifies that a published claim still matches the code. Fail these when the code changed and the copy did not — a stale privacy promise is a defect.

### SEC-102 - "We never see your PDF" - no upload path exists
**P0** * Security * `README.md:163` / `index.html:330`

- **Pre:** Network tab recording, "Preserve log" on, third-party requests visible.
- **Steps:**
  1. Open a large local PDF via **Open PDF or bundle**.
  2. Scroll every page, highlight, screenshot a figure, and run find-in-document.
  3. Filter the Network panel by request size > 100 KB and by method POST.
- **Expect:** No request carries the PDF bytes. The only POSTs are to `/api/ai` and `/api/ai-image`, and their bodies contain text plus — for a screenshot question — a base64 image of the *captured region only*, never the whole file. The landing page chip still reads exactly "We never see your PDF".
- **Watch:** A new feature that hashes or previews server-side. The claim is absolute; anything that ships bytes breaks it.

### SEC-103 - "Notes stay in your browser" - no note ever reaches a server unbidden
**P0** * Security * `index.html:330` / `src/app.js:151`

- **Pre:** As above.
- **Steps:**
  1. Create several notes, edit them, tag them, delete one.
  2. Confirm zero network requests fire from those actions.
  3. Confirm the notes are in `localStorage.srw_state_v1` and large images in IndexedDB `srw_assets`.
- **Expect:** Silence on the network. The chip still reads exactly "Notes stay in your browser".
- **Watch:** Folder sync (`scheduleFolderSync`, `src/app.js:2451`) writes to the local filesystem, not a server — confirm the distinction holds and that no cloud sync has been added behind the same wording.

### SEC-104 - "Your key stays in your browser, sent per request"
**P0** * Copy * `index.html:277` / `features.html:240` / `README.md:165` / `src/app.js:2786`

- **Pre:** SEC-079 passed.
- **Steps:**
  1. Read the landing-page card 3 copy, the features-page AI section copy, the README "Privacy & keys" bullet, and the Settings hint.
- **Expect:** Landing page reads exactly "Point it at OpenRouter or any OpenAI-compatible endpoint. Your key stays in your browser, sent per request." Features page reads exactly "OpenRouter (default) or any OpenAI-compatible endpoint. Your key stays **in your browser** and is sent per-request — never saved on a server. Toggle visuals and web search." Settings hint reads exactly "Your own key (if entered) is stored only in this browser and sent per‑request to the site's `/api/ai` proxy as an override; otherwise the server's key is used and never exposed to the browser."
- **Watch:** The Settings hint uses a non-breaking hyphen in "per‑request" (U+2011) while the features page uses a plain hyphen. Both are as-shipped; do not "fix" either without checking this document.

### SEC-105 - The README SSRF claim matches the code
**P0** * Copy * `README.md:172` / `api/ai.js:22-26`

- **Steps:**
  1. Read the README bullet listing the allowed providers: "OpenAI, Groq, Together, Mistral, DeepInfra, Fireworks, Perplexity, xAI, DeepSeek, Google Gemini".
  2. Diff that list against `COMPAT_HOSTS` in both API files.
- **Expect:** They correspond. Note `openrouter.ai` is in the set but not in the README's parenthetical (it is covered by the separate "only call OpenRouter or…" clause) — confirm that remains the only discrepancy.
- **Watch:** Adding a provider to the code without adding it to the README, or vice versa. The README is the document a security reviewer reads first.

### SEC-106 - The README sanitisation claim matches the code
**P0** * Copy * `README.md:173` / `src/app.js:2288`, `src/app.js:19`

- **Steps:**
  1. Read the bullet: "ids are constrained to a safe character set (they end up in HTML attributes and CSS selectors), and images may only be `data:` rasters (PNG/JPEG/WebP/GIF — never SVG) or `https:` URLs — nothing else reaches an `<img src>`. All note text is HTML-escaped at render."
  2. Verify each clause against `IMP_ID`, `RASTER_DATA`, `safeImgSrc`, and section 4 of this document.
- **Expect:** Every clause true. The four raster formats listed match the regex exactly.
- **Watch:** "All note text is HTML-escaped at render" is the claim most at risk — SEC-013 shows `a.page` is interpolated raw. If SEC-013 ever fails, this README line is also false and must be fixed alongside the code.

### SEC-107 - The README key claim matches the code
**P1** * Copy * `README.md:174` / `src/app.js:2568`

- **Steps:**
  1. Read: "Your API key never leaves your browser at rest. It lives in `localStorage`, is sent per request as an override, and is **never** stored on the server or written into exported/shared files."
  2. Confirm against SEC-069, SEC-079 and SEC-083.
- **Expect:** All three sub-claims verified.
- **Watch:** "never stored on the server" — confirm the serverless functions have no logging of the request body. Inspect `api/ai.js` for any `console.log` of `body` or `key`; there should be none.

### SEC-108 - The analytics claim matches what actually loads
**P1** * Copy * `README.md:166` / `index.html:403-404` / `app.html:135-136`

- **Steps:**
  1. Read: "Analytics: privacy-friendly, cookieless page analytics (Vercel Web Analytics) — no accounts, no tracking cookies, no personal data, no access to your notes or prompts."
  2. On the live site, load `/` and `/app`, then check Application → Cookies and Application → Local Storage for anything set by the insights script.
  3. Confirm the only analytics script tags are the two at `index.html:403-404` and `app.html:135-136`.
- **Expect:** No cookies set. Only `srw_state_v1` and `srw_saveas_tip` in local storage, both written by the app. The landing chip still reads exactly "Cookieless analytics".
- **Watch:** A second analytics or session-replay tag added anywhere. A replay tool would capture note text and the Settings key field, contradicting "no access to your notes or prompts" outright.

### SEC-109 - The OCR on-device claim matches the network trace
**P1** * Copy * `README.md:46` / `features.html:165` / `src/app.js:685-697`

- **Pre:** A scanned, image-only PDF.
- **Steps:**
  1. Open it, accept the OCR banner, and let a page or two complete with the Network tab recording.
  2. List every request made during OCR.
- **Expect:** Only asset downloads: `cdn.jsdelivr.net` (tesseract.js and its core WASM) and `tessdata.projectnaptha.com` (the language data). **No** request carries page images or PDF bytes. The features-page copy still reads exactly "Open an image-only PDF and PairedX notices there's no selectable text, then offers one-tap OCR that runs **entirely in your browser** — your file is never uploaded. It rebuilds a real text layer, so search, highlights, and the AI all work like a normal PDF."
- **Watch:** Verify by request *size* as well as destination — a POST of a rendered page canvas would be hundreds of KB and stands out immediately in the size column.

### SEC-110 - The vulnerability-reporting route still exists
**P2** * Copy * `README.md:176`

- **Steps:**
  1. Read: "Reporting a vulnerability. Please report suspected security issues privately — use **Report a vulnerability** under the repository's *Security* tab — rather than opening a public issue."
  2. Visit the repository's Security tab and confirm private vulnerability reporting is enabled.
- **Expect:** The advertised route works. If it is disabled on GitHub, the README is pointing reporters at a dead end and they will file public issues instead.
- **Watch:** Repo settings drift after a fork, transfer, or visibility change.

---

## Coverage map
| Code or element | Checks |
|---|---|
| `esc()` src/app.js:14 | SEC-026, SEC-027, SEC-028, SEC-029, SEC-030, SEC-031, SEC-032, SEC-033, SEC-034, SEC-035, SEC-036, SEC-037, SEC-038 |
| `RASTER_DATA` src/app.js:19 | SEC-016, SEC-017, SEC-020, SEC-021 |
| `safeImgSrc()` src/app.js:20 | SEC-015, SEC-018, SEC-019, SEC-022, SEC-023, SEC-024, SEC-101 |
| `save()` src/app.js:151 | SEC-061, SEC-084, SEC-103 |
| `idbPut()` src/app.js:133 / `rehydrateAssets()` src/app.js:144 | SEC-024, SEC-066 |
| `openFiles()` src/app.js:255 | SEC-057, SEC-058 |
| `importSharedHTML()` src/app.js:279 | SEC-049, SEC-050, SEC-051, SEC-052, SEC-053, SEC-054, SEC-055 |
| `attachNotesFile()` src/app.js:310 | SEC-057, SEC-058 |
| `renderTree()` src/app.js:368 | SEC-036 |
| `scrollToAnnotation()` src/app.js:548 | SEC-013 |
| `buildOcrTextLayer()` src/app.js:644 / `runOcr()` src/app.js:753 | SEC-066, SEC-109 |
| `keyFor()` src/app.js:1237 / `aiText()` 1244 / `aiImage()` 1253 | SEC-079, SEC-080, SEC-081, SEC-082, SEC-101 |
| `agentWeb()` src/app.js:1407 / `aiAgentStep()` src/app.js:1440 | SEC-079 |
| `actorAvatar()` src/app.js:1713 / `actorName()` src/app.js:1721 | SEC-014, SEC-025 |
| `tagPills()` src/app.js:1723 / `chipRow()` src/app.js:1727 | SEC-029, SEC-030 |
| `quoteBlock()` src/app.js:1731 | SEC-027 |
| `msgCard()` src/app.js:1794 | SEC-013, SEC-026, SEC-028, SEC-031, SEC-033 |
| `fullMsgHTML()` src/app.js:1853 / `compactCard()` src/app.js:1865 | SEC-013, SEC-033, SEC-034 |
| `traceHTML()` src/app.js:1939 | SEC-032 |
| `mdInline()` src/app.js:1958 / `mdLite()` src/app.js:1969 | SEC-040, SEC-041, SEC-042, SEC-043, SEC-044, SEC-048 |
| `codeBlockHTML()` 2007 / `mathToken()` 2010 / `protectMath()` 2017 / `restoreRich()` 2027 | SEC-045, SEC-046, SEC-047 |
| `mdRich()` src/app.js:2039 / `commentHTML()` src/app.js:2041 | SEC-026, SEC-040, SEC-045, SEC-046 |
| `render()` src/app.js:2084 | SEC-035 |
| `docNotesJSON()` src/app.js:2271 | SEC-069, SEC-070, SEC-083 |
| `IMP_ID` 2288 / `impId()` 2289 / `impCap()` 2290 | SEC-004, SEC-005, SEC-006, SEC-007, SEC-011 |
| `sanitizeImportedMessage()` src/app.js:2292 | SEC-006, SEC-012, SEC-015, SEC-016, SEC-017 |
| `sanitizeImportedAnnotation()` src/app.js:2303 | SEC-005, SEC-008, SEC-009, SEC-010, SEC-012, SEC-013, SEC-018, SEC-022 |
| `sanitizeImportedNotes()` src/app.js:2314 | SEC-001, SEC-009, SEC-012, SEC-063 |
| `applyNotesJSON()` src/app.js:2316 | SEC-003, SEC-050, SEC-057, SEC-059 |
| `openNotesFileFor()` src/app.js:2435 | SEC-056 |
| `maybeShowSaveAsTip()` src/app.js:2460 / `saveAsFile()` src/app.js:2503 | SEC-061, SEC-077 |
| `importNotesJSON()` src/app.js:2533 | SEC-003, SEC-059 |
| `notesJSONForExport()` src/app.js:2540 | SEC-069 |
| `exportSelfContainedHTML()` src/app.js:2553 | SEC-069, SEC-070, SEC-071, SEC-072, SEC-073, SEC-074, SEC-075, SEC-076, SEC-077 |
| `ptItemHTML()` 2710 / `importPrompts()` 2746 / `exportPrompts()` 2734 | SEC-039, SEC-083 |
| `openSettings()` src/app.js:2760 | SEC-038, SEC-078, SEC-084, SEC-104 |
| `buildSheet()` src/app.js:2881 | SEC-013, SEC-022, SEC-028 |
| `findMarkPage()` src/app.js:2992 | SEC-037 |
| `wire()` src/app.js:3058 (drop wiring) | SEC-064 |
| `initBundleState()` src/app.js:3283 | SEC-062, SEC-063 |
| `applyReadOnly()` src/app.js:3294 | SEC-060, SEC-064, SEC-065, SEC-067, SEC-068 |
| `boot()` src/app.js:3303 | SEC-002, SEC-062 |
| `api/ai.js` provider + key guards (79, 86, 91, 93-94) | SEC-087, SEC-088, SEC-089, SEC-096 |
| `api/ai.js` COMPAT_HOSTS + HTTPS (22-26, 95-98) | SEC-080, SEC-090, SEC-091, SEC-092, SEC-093 |
| `api/ai.js` postJSON (42-49) | SEC-094, SEC-095 |
| `api/ai.js` quota handling (31-32, 108) | SEC-085, SEC-086 |
| `api/ai-image.js` (38, 42, 45, 50-53, 19-27) | SEC-097, SEC-098, SEC-099, SEC-100, SEC-101 |
| `README.md` Security + Privacy sections (161-176) | SEC-102, SEC-103, SEC-104, SEC-105, SEC-106, SEC-107, SEC-108, SEC-109, SEC-110 |
| `index.html:277,330,403-404` / `features.html:165,240` | SEC-102, SEC-103, SEC-104, SEC-108, SEC-109 |
| `app.html:135-136` (analytics tags) | SEC-071, SEC-108 |

## Deliberately not covered here
- Whether import/export *works* at all — the happy path of picking a file, the toast counts, merge-vs-replace semantics, and folder sync - covered in **10 - Storage and persistence** and **11 - Share and export**.
- The Save As dialog's UX, the Firefox/Safari "Choose where your files save" tip, and download fallbacks as features - covered in **11 - Share and export**. Only their security consequences (cancelled dialog writes nothing, filename sanitisation) appear here.
- AI answer quality, agent tool selection, the ReAct loop's step limit, and the provenance chip *contents* - covered in **08 - AI and agent**. Only the escaping of what those produce appears here.
- OCR accuracy, the scanned-PDF detection heuristic, engine loading and cancellation - covered in **09 - OCR**. Only "does OCR upload anything" and "does OCR write storage in a read-only bundle" appear here.
- Note creation, editing, tagging, resolving and deleting as features - covered in **06 - Annotation tools** and **07 - Notes panel**.
- Keyboard access, focus order, screen-reader labels on the Settings key fields and the confirm dialogs - covered in the accessibility document.
- Landing- and features-page layout, responsive behaviour and animation - covered in **01 - Landing page** and **02 - Features page**. Only the privacy copy's exact wording appears here.
- localStorage quota exhaustion, IndexedDB eviction and the storage meter - covered in **10 - Storage and persistence**.
