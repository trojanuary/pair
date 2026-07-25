# 20 — New feature & UI-rework gate

> The definition of done. Before a new feature or a UI rework is merged to `main`, every item here must be satisfied — or consciously waived in writing.

`main` auto-deploys to the live `pairedx.com`, so this gate is the last thing between a change and real users.

## Contents
- [1. How to use this gate](#1-how-to-use-this-gate)
- [2. Definition of done — new feature](#2-definition-of-done--new-feature)
- [3. Definition of done — UI rework](#3-definition-of-done--ui-rework)
- [4. Codebase conventions a new feature must follow](#4-codebase-conventions-a-new-feature-must-follow)
- [5. Landmines: changes that silently break something far away](#5-landmines-changes-that-silently-break-something-far-away)
- [6. Cross-browser obligations](#6-cross-browser-obligations)
- [7. Security review triggers](#7-security-review-triggers)
- [8. Content & copy rules](#8-content--copy-rules)
- [9. Which QA documents to re-run](#9-which-qa-documents-to-re-run)
- [10. Ship checklist](#10-ship-checklist)

---

## 1. How to use this gate

Work top to bottom. Each item is either **✅ done**, **N/A + reason**, or **waived by <name> + reason**. An unexplained blank is a blocked merge.

This document is **not** a list of test steps — it is the set of *properties that must hold*. The actual steps live in documents `01`–`18`; §9 says which to re-run.

---

## 2. Definition of done — new feature

### 2.1 The feature itself
- [ ] Works on the **happy path** in Chrome desktop.
- [ ] Works with **0 items, 1 item, and many items** (empty state designed, not accidental).
- [ ] **Cancelled** paths do nothing (a dismissed dialog must not half-apply).
- [ ] **Destructive** actions go through `confirmDialog()` and say exactly what will be lost.
- [ ] **Failure** paths produce a specific, actionable, non-blaming message — never a raw exception string alone.
- [ ] Does **not** require a page reload to become usable after any of its own actions.

### 2.2 State & persistence
- [ ] Any new persisted field is added to `defaultState()` **and** handled in `migrateState()` so an existing user upgrading does not crash or lose data.
- [ ] Verified by loading the app with a **pre-existing** `srw_state_v1` from before the change (do not clear storage — that is the exact bug migration catches).
- [ ] Any new `localStorage` key or IndexedDB key is documented in `00-test-plan.md` §2 **and** added to the reset snippet in §6.2.
- [ ] Large binary/base64 data goes to **IndexedDB**, never `localStorage` (follow the `"@idb"` sentinel pattern in `save()`).
- [ ] Anything written to IndexedDB per-document is **deleted in `purgeDoc()`**.

### 2.3 Read-only / shared-bundle safety
- [ ] If the feature edits anything, its control id is added to the hide-list in `applyReadOnly()` — otherwise it appears in shared read-only files and appears broken.
- [ ] `save()` still no-ops under `READONLY`.
- [ ] Opened a shared `.annotated.html` and confirmed the new UI is absent and nothing persists.

### 2.4 Tests & documentation
- [ ] **New checks are written into the appropriate QA document(s)** in this folder, numbered at the end of their section, with a Coverage-map row. *This is a hard gate.*
- [ ] `README.md` updated if the feature is user-visible.
- [ ] `features.html` updated if it changes what the product claims — and `02-features-page.md` re-run so the page does not over-promise.
- [ ] `index.html` updated if it changes the top-line pitch.
- [ ] If it changes the security posture, the **Security** section of `README.md` is updated and `13-security-and-privacy.md` gains checks.

---

## 3. Definition of done — UI rework

Everything in §2 that still applies, plus:

- [ ] Verified at **every breakpoint boundary on both sides**: 1101/1099, 821/819, 561/559 px.
- [ ] Verified at phone portrait **and landscape**, tablet, laptop, wide desktop (`00-test-plan.md` §3.2).
- [ ] The three-pane ⇄ drawer transition still works, including the **scrim** and both panel toggles.
- [ ] The **drag-to-resize splitter** still works and its width still clamps and persists.
- [ ] **Connector lines** still align to their pins after: panel toggle, panel resize, zoom change, scroll, and window resize. *(This is the single most fragile thing in the UI.)*
- [ ] **Highlight rectangles and pins** still align to the page at 50%, 100%, 115%, 200% and 300% zoom, in both single-page and continuous mode.
- [ ] Text selection still produces correctly positioned rects — including **after OCR** rebuilds the text layer.
- [ ] **Touch**: pinch-zoom, tap-select, drag-capture and long-press still behave on a real iOS device (not just a simulator).
- [ ] The **on-screen keyboard** still does not cover the composer; drawer chrome still folds away while replying.
- [ ] **Print / export-to-PDF** output still looks right (`@media print`, `src/styles.css:431`).
- [ ] No control lost its **`title`** attribute — several icon-only buttons rely on it as their only accessible name.
- [ ] Focus states remain **visible** and modals still trap and restore focus.
- [ ] Nothing depends on colour alone to convey state.

---

## 4. Codebase conventions a new feature must follow

This is a 3,300-line vanilla-JS IIFE with no framework and no build step. Consistency is the only thing keeping it maintainable.

### 4.1 Rendering & escaping
- **Escape everything.** All user/imported text goes through `esc()` at the render site. Never interpolate raw text into an HTML string.
- **Images:** every `<img src>` value must pass through `safeImgSrc()`. Only `data:` rasters (PNG/JPEG/WebP/GIF) and clean `https:` URLs are allowed. **SVG is deliberately excluded — it can execute script.**
- **Generated ids** must come from `uid()` so they match `/^[A-Za-z0-9_-]{1,80}$/`. Ids end up in `data-*` attributes *and* CSS selectors; an id with a quote or a space is both a bug and an injection vector.
- **Enums** (`source_type`, message `type`, colours) are never interpolated raw.

### 4.2 Event wiring
- One-time boot wiring goes in **`wire()`**.
- Anything inside a note card is destroyed and rebuilt by **`render()`** — its handlers must be re-attached **inside `render()`**, not once at boot. A handler attached once to a card will silently stop working after the next re-render.
- Runtime-injected toolbar buttons follow the **`injectNotesButtons()`** pattern (guard on `document.getElementById(id)` so a second call is a no-op).
- `render()` must keep preserving the inline composer **draft text and focus**, and keep sticking to the bottom while an answer streams.

### 4.3 Storage
- `save()` is **debounced 250 ms** and deep-clones state; do not call `localStorage.setItem` directly.
- `save()` also triggers `scheduleFolderSync()` — a 1.5 s debounced write of `<doc>.notes.json`.
- Never assume `idbOpen()` succeeded; every `idb*` helper is written to fail silently and return `null`.

### 4.4 Capability detection
- **Feature-detect, never UA-sniff**, for behaviour: `'showSaveFilePicker' in window`, `fsSupported()`, `navigator.storage?.estimate`.
- UA strings may only pick **wording** (as `maybeShowSaveAsTip()` does to name Firefox vs Safari), never to gate a capability.
- Every Chromium-only affordance needs a defined non-Chromium fallback, and must not be *shown* where unsupported.

### 4.5 Messaging
- Success/failure feedback uses **`toast(msg)`** / **`toast(msg, 'err')`**.
- Destructive actions use **`confirmDialog()`** with an explicit `okLabel` and `danger: true`.
- One-time educational dialogs must be **dismissible and remembered** (`localStorage`), never shown twice.
- Error copy must not blame the user, and must say what to do next. Compare the shared-quota message, which redirects to adding your own key rather than surfacing the provider's billing text.

### 4.6 Keyboard
- Escape closes; Enter confirms. Modals handle keys with `document.addEventListener('keydown', onKey, true)` and **must remove the listener on close**.
- Do not steal a shortcut already in use: Cmd/Ctrl+F (find), Enter/Shift+Enter (find step, composer send/newline), Cmd/Ctrl+Enter (save inline edit), Escape (cancel/close).

### 4.7 Licensing
- New files in `api/` carry the `// SPDX-License-Identifier: AGPL-3.0-only` header.
- AGPL §13 network clause: the repo link and attribution in the read-only share banner must remain intact.

---

## 5. Landmines: changes that silently break something far away

These have no compile error and no obvious symptom. **Check them explicitly.**

| If you change… | …you must also | Why |
|---|---|---|
| **`app.html` — add a `<script src>` or `<link>`** | Add it to the inline list in `exportSelfContainedHTML()` | The self-contained share rebuilds the shell by string-replacing *known* tags. A new external asset is **not** inlined, so shared files break when opened offline. Silent. |
| **The analytics snippet in `app.html`** | Update the strip regexes in `exportSelfContainedHTML()` | If the strip fails, **every shared file phones home** — an S1 privacy failure. |
| **Any editing control** | Add its id to `applyReadOnly()` | Otherwise it shows in read-only shared papers. |
| **`defaultState()` shape** | Add a `migrateState()` step | Existing users load an old blob; missing fields crash or wipe. |
| **A per-document IndexedDB key** | Delete it in `purgeDoc()` | Orphaned data inflates the storage meter forever. |
| **Note card markup** | Re-check `drawConnector()` and `scrollNoteIntoView()` | The connector measures live card geometry. |
| **The text layer or zoom pipeline** | Re-check highlight rects, pins, capture, and OCR overlay | All positions are normalised 0–1 against the page box. |
| **`notesFileName()` or the export JSON shape** | Re-check `findFolderNotes()` sha-matching and import | Cross-device re-attachment matches by filename *then* `document.sha256`. |
| **Prompt/tool defaults** | Confirm existing user overrides in `state.settings.prompts` still resolve | `promptFor()` falls back to defaults only for unset keys. |
| **`api/` provider handling** | Re-run `13-security-and-privacy.md` | The compat path is BYO-key-only and host-allowlisted specifically to prevent SSRF and key leakage. |
| **Breakpoint values in CSS** | Update `00-test-plan.md` §3.2 and `14-responsive-mobile-touch.md` | The suite tests exact boundaries. |

---

## 6. Cross-browser obligations

- [ ] Chrome/Edge: full functionality.
- [ ] Firefox & Safari: the feature either works, or **degrades with a clear message** — never a dead control.
- [ ] iOS Safari: touch, keyboard inset, and `dvh` layout verified on a **real device**.
- [ ] No console errors on load in any supported browser.
- [ ] Works from a **plain static server** (no `/api`) without throwing — AI features may fail, the app must not.

---

## 7. Security review triggers

Run `/security-review` **and** `13-security-and-privacy.md` if the change touches any of:

- [ ] Anything that renders **imported or shared** content (`.notes.json`, `.annotated.html`).
- [ ] Any new `<img src>`, `innerHTML`, or attribute interpolation.
- [ ] The sanitiser functions, `safeImgSrc()`, or `esc()`.
- [ ] `api/ai.js` or `api/ai-image.js` — especially provider handling, base URLs, or headers.
- [ ] API key storage, transmission, or anything written into an export.
- [ ] The self-contained export (escaping of `<` as `<`, `</script` rewriting, analytics stripping).

**Non-negotiable invariants:**
1. An imported file can never execute script or read the stored key.
2. The server key is never paired with a caller-supplied URL, and never returned to the browser.
3. Exported/shared files never contain a key and never phone home.

---

## 8. Content & copy rules

- [ ] Exact strings in QA checks are updated **in the same PR** as any copy change — otherwise the suite fails on a false positive.
- [ ] Marketing claims on `index.html` / `features.html` are **true of the shipped build**. Removing a capability means removing the claim.
- [ ] The comparison table on the landing page keeps its "to the best of our knowledge as of <date>" hedge and footnotes.
- [ ] Sample-paper attribution (BERT, CC BY 4.0) and `NOTICE` remain intact.
- [ ] Typography: the codebase uses curly quotes (`'` `"`) and en/em dashes in UI copy. Match it.

---

## 9. Which QA documents to re-run

| Change touches | Re-run |
|---|---|
| Landing page | `01`, `15`, `16` |
| Features page | `02`, `15` |
| Sidebar / library / panels | `03`, `14`, `15`, `19` |
| Opening or identifying documents | `04`, `10`, `18`, `19` |
| PDF rendering / zoom / navigation / find | `05`, `06`, `14`, `17`, `19` |
| Annotation tools or anchoring | `06`, `05`, `14`, `19` |
| Notes panel / cards / composer | `07`, `15`, `14`, `19` |
| AI, agent, prompts, `api/` | `08`, `12`, `13`, `18`, `19` |
| OCR | `09`, `05`, `17` |
| Storage, save, import/export | `10`, `11`, `16`, `18`, `19` |
| Share as HTML / read-only viewer | `11`, `13`, `16` |
| Settings modal | `12`, `08`, `10`, `15` |
| Anything security-relevant | `13` + `/security-review` |
| Any layout/CSS | `14`, `15`, `03`, `05`, `07` |
| Adding a browser API | `16`, `18` |
| Anything on a hot path | `17` |

---

## 10. Ship checklist

- [ ] Branch is **not** `main`; work staged on `development` (or a feature branch).
- [ ] `node --check src/app.js` passes.
- [ ] App boots with **no console errors** (hard-reload, then check load-time errors).
- [ ] Exercised in a **real browser** — not just reasoned about. Screenshot attached for UI change.
- [ ] Tier S smoke (`19-regression-smoke.md`) green.
- [ ] Tier U / N items above satisfied.
- [ ] New QA checks committed **in this PR**.
- [ ] Verified on the **`development` preview URL**, not only locally.
- [ ] Owner has confirmed they want it live.
- [ ] Merge to `main` → confirm the deploy actually shipped (fetch the live asset and grep for the change; a green deploy is not proof).
- [ ] Post-deploy: load `pairedx.com/app`, confirm no console errors and the sample paper renders.
