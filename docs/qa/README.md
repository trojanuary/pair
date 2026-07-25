# PairedX QA suite

**2,132 manual checks across 18 documents**, covering every button, menu, option, state, message and platform behaviour in the product — the landing page, the features page, and the app itself.

Run this whenever the UI is reworked or a feature is added, to prove nothing regressed.

| | |
|---|---|
| **Checks** | 2,132 — 713 P0 · 1,078 P1 · 341 P2 |
| **Authored against** | `main` @ `25be159` |
| **Scope** | `index.html`, `features.html`, `app.html`, `src/app.js` (234 functions), `src/styles.css`, `api/ai.js`, `api/ai-image.js` |
| **Type** | Manual QA. There is **no automated test suite** in this repo — this is the regression net. |

---

## Start here

1. **`00-test-plan.md`** — read this first. Environments, browser/viewport matrix, local setup, test fixtures, **how to reset state between runs** (essential for a local-first app), ID/priority conventions, severity triage, exit criteria.
2. **`19-regression-smoke.md`** — the 36-check, ~30-minute gate before **every** production deploy.
3. **`20-new-feature-gate.md`** — the definition of done for a new feature or UI rework, plus the *landmines* table of changes that silently break something far away.

## The checklists

| # | Document | Prefix | Checks |
|---|---|---|---|
| 01 | [Landing page](01-landing-page.md) | `LAND` | 130 |
| 02 | [Features page](02-features-page.md) | `FEAT` | 128 |
| 03 | [App shell & library](03-app-shell-and-library.md) | `SHELL` | 115 |
| 04 | [Document lifecycle](04-document-lifecycle.md) | `DOC` | 122 |
| 05 | [Reader & navigation](05-reader-and-navigation.md) | `READ` | 126 |
| 06 | [Annotation tools](06-annotation-tools.md) | `ANN` | 128 |
| 07 | [Notes panel](07-notes-panel.md) | `NOTE` | 128 |
| 08 | [AI & agent](08-ai-and-agent.md) | `AI` | 130 |
| 09 | [OCR](09-ocr.md) | `OCR` | 124 |
| 10 | [Storage & persistence](10-storage-and-persistence.md) | `STOR` | 130 |
| 11 | [Share & export](11-share-and-export.md) | `SHARE` | 130 |
| 12 | [Settings & templates](12-settings-and-templates.md) | `SET` | 105 |
| 13 | [Security & privacy](13-security-and-privacy.md) | `SEC` | 110 |
| 14 | [Responsive, mobile & touch](14-responsive-mobile-touch.md) | `RESP` | 105 |
| 15 | [Accessibility](15-accessibility.md) | `A11Y` | 107 |
| 16 | [Cross-browser & platform](16-cross-browser-and-platform.md) | `XB` | 104 |
| 17 | [Performance & limits](17-performance-and-limits.md) | `PERF` | 100 |
| 18 | [Error states & recovery](18-error-states-and-recovery.md) | `ERR` | 110 |

Process documents: **00** (test plan) · **19** (smoke suite) · **20** (new-feature gate).

## How a check reads

```
### STOR-060 - Chromium: choosing an existing file overwrites it in place
**P0** · Functional · Chromium only · `src/app.js:2607 saveNotesNow()`

- **Pre:**    A document with at least one note; Chrome or Edge.
- **Steps:**  1. Click Save …
- **Expect:** … including exact copy in quotes
- **Watch:**  the specific way this actually breaks
```

**Priorities:** P0 blocks the release · P1 blocks the affected feature · P2 is polish.

**Never renumber an existing check** — issues and commits reference these IDs. Retire with `(retired)` and append new ones.

Each document ends with a **Coverage map** (code → check IDs) so gaps become visible when the code changes, and a **Deliberately not covered here** section pointing at the document that owns the overlap.

## Which documents to run

See `20-new-feature-gate.md` §9 for the full matrix. Quick version:

| Change | Run |
|---|---|
| Any production deploy | `19` |
| UI rework / restyle | `20` + `14`, `15`, `03`, `05`, `07` |
| New feature | `20` + affected docs + `19` |
| `api/` or anything security-relevant | `08`, `13`, `18` + `/security-review` |
| Dependency bump (PDF.js, Tesseract, MathJax) | `05`, `09`, `08`, `19` |

---

## ⚠️ Open defects found while authoring this suite

Writing these checks surfaced real bugs in the shipped product. Each is captured as a check that **currently fails**.

| Severity | Check | Defect |
|---|---|---|
| ~~**S1**~~ **FIXED** | `SEC-013` | **Stored XSS — fixed.** `sanitizeImportedAnnotation()` never sanitised `page`, and `page` was interpolated **unescaped** into HTML at four sites, so a hostile `.notes.json` / `.annotated.html` executed script (verified with a working payload) and could read the API key from `localStorage`. **Fixed:** `page`/`anchor` are now coerced to integers via `impInt()` in the sanitiser, and every HTML render site is wrapped in `esc()`. Re-verified: the same payload no longer fires and renders as inert text. `SEC-013` is now a regression guard. |
| **S3** | `SEC-072` | **Shared files phone home.** `exportSelfContainedHTML()` strips the two Vercel analytics tags but leaves `app.html:7,9,10` — the cdnjs preconnect and the Google Fonts preconnect + stylesheet. Every shared `.annotated.html` contacts `fonts.googleapis.com` on open, leaking the recipient's IP and user-agent. Contradicts the code's own comment, *"a shared file must not phone home."* |
| **S4** | `SEC-066` | **Read-only bundles still write.** `idbPut()` (`src/app.js:133`) has no `READONLY` guard although `save()` does (`:152`). `ocrBanner` is not in the `applyReadOnly()` hide-list, so OCR can run in a shared read-only file and write `ocr:<sha>` to IndexedDB. Contradicts *"a shared read-only file never mutates storage."* |
| **S4** | `SHELL-087` | **Save confirmation never shows.** `flashSaved()` adds only `saved`, but the CSS requires `.icon-btn.save-btn.saved` (`src/styles.css:119`) and the button is created with `class="icon-btn"` alone. The green flash is dead code. |
| **S3** | `FEAT-109` et al. | **Marketing over-promises.** `features.html` claims *page thumbnails* (0 implementations in `src/app.js`), *"Streaming answers"* (no `stream: true`, `EventSource` or `ReadableStream` anywhere in `src/app.js` or `api/ai.js` — answers arrive in one response), and *"One-click Vercel deploy"* (the README documents a 6-step fork-and-import). |
| **S4** | `FEAT-034`, `FEAT-047` | **Stale screenshots.** `01-workspace.jpg` and `feat-library.jpg` still show the retired *NIPS-2017-attention* sample instead of the shipped BERT paper; `03-toolbar.png` shows 5 tools including a retired text tool, while `app.html` ships 4 (`toolCursor`, `toolHi`, `toolComment`, `toolShot`). A dead `'toolText'` reference also survives in `applyReadOnly()`. |

Additional code-derived issues flagged for in-browser confirmation: `SHELL-064` (821–1100px band), `SHELL-081` (inline `--right-w` overriding the media query), `SHELL-096` (`#sortSel` label not re-synced at boot), `SEC-029`/`SEC-014` (unescaped class lookup and prototype-key rendering — cosmetic today).

## Maintaining this suite

- A new feature **must** add its checks here in the same PR (`20-new-feature-gate.md` §2.4).
- Changing user-facing copy means updating the quoted strings in the affected checks — otherwise the suite fails on a false positive.
- If a check is ambiguous when you run it, that is a defect **in this suite**; fix the wording in the same PR.
- Re-verify `file:line` references after any large refactor of `src/app.js`.
