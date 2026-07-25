# 00 — Test plan, environments & conventions

> How to run this QA suite: what to install, what data to test with, how to reset state between runs, and what the IDs, priorities and exit criteria mean.

Read this once before running any other document in this folder.

## Contents
- [1. What this suite is for](#1-what-this-suite-is-for)
- [2. Product facts a tester needs](#2-product-facts-a-tester-needs)
- [3. Environments](#3-environments)
- [4. Local setup](#4-local-setup)
- [5. Test data](#5-test-data)
- [6. Resetting state between runs](#6-resetting-state-between-runs)
- [7. Conventions: IDs, priorities, types](#7-conventions-ids-priorities-types)
- [8. Bug severity & triage](#8-bug-severity--triage)
- [9. Test tiers & exit criteria](#9-test-tiers--exit-criteria)
- [10. Recording results](#10-recording-results)

---

## 1. What this suite is for

PairedX is **local-first and single-user**. There is no backend database, no accounts, and no server-side state to inspect. Almost everything that can regress is **in the browser**: rendering, layout, storage, permissions, and per-engine API support.

That has two consequences for QA:

1. **Manual, in-browser testing is the primary safety net.** There is no automated test suite in this repo. These documents are the regression net.
2. **State is sticky and invisible.** A stale `localStorage` blob or an IndexedDB handle from a previous run will silently change behaviour. **Always reset state (§6) before a formal run**, or you will chase ghosts.

Run this suite when:

| Situation | What to run |
|---|---|
| Any release to `main` (deploys live) | Tier S — smoke (`19-regression-smoke.md`) |
| A UI rework / restyle / layout change | Tier U — UI gate (`20-new-feature-gate.md`) + affected documents |
| A new feature | `20-new-feature-gate.md` + the documents it touches + Tier S |
| A dependency bump (PDF.js, Tesseract, MathJax) | `05`, `09`, `08` + Tier S |
| A change to `api/` | `08`, `13`, `18` |
| Quarterly / before a milestone | Tier F — full suite |

---

## 2. Product facts a tester needs

| | |
|---|---|
| **Live site** | `https://pairedx.com` (apex). `www.pairedx.com` 307-redirects to the apex. |
| **Hosting** | Vercel. Static files + two serverless functions. |
| **Routing** | `vercel.json` rewrites `/app` → `/app.html`. Both URLs must work. |
| **Landing page** | `/` → `index.html` |
| **Features page** | `/features.html` |
| **The app** | `/app` or `/app.html` |
| **Deploy trigger** | Push/merge to `main` auto-deploys to production. `development` gets a preview URL. |
| **Bundled sample** | *BERT: Pre-training of Deep Bidirectional Transformers…* (Devlin et al., 2019), 16 pages, CC BY 4.0. Loads automatically on first run with sample notes. |
| **AI** | Runs through `/api/ai` and `/api/ai-image` (Vercel functions). The public site uses a **shared key with a small quota** — expect quota errors, they are a real test case. |
| **License** | AGPL-3.0. The read-only share banner and repo links are part of compliance — treat broken attribution as a P0. |

**Storage locations** (you will need these constantly):

| Store | Key | Holds |
|---|---|---|
| `localStorage` | `srw_state_v1` | All state: settings, documents, annotations, UI |
| `localStorage` | `srw_saveas_tip` | `"1"` once the Firefox/Safari save tip has been shown |
| IndexedDB | `srw_assets` → `assets` | `pdf:<docId>`, `shot:<annId>`, `img:<msgId>`, `ocr:<sha>`, `dir:notes` |

Large images are offloaded from `localStorage` to IndexedDB and replaced by the sentinel string `"@idb"`. If you see `"@idb"` in an exported file, that is a **bug** — exports must re-inline images.

---

## 3. Environments

### 3.1 Browser matrix

Full detail lives in `16-cross-browser-and-platform.md`. Minimum bar per run:

| Tier | Browsers |
|---|---|
| **Tier S (smoke)** | Chrome desktop (latest) + Safari iOS |
| **Tier U (UI gate)** | Chrome desktop, Safari macOS, Firefox desktop + one phone |
| **Tier F (full)** | Chrome, Edge, Firefox, Safari macOS, Safari iOS, Chrome Android |

> **Chromium-only features.** The File System Access API (`showSaveFilePicker`, `showDirectoryPicker`) powers *Save As*, folder sync, and folder-based notes discovery. Firefox and Safari **must** take a documented fallback. Any check marked *Chromium only* is expected to fall back — verify the fallback, do not report it as a failure.

### 3.2 Viewports

Breakpoints are at **1100px**, **820px** and **560px** (`src/styles.css`). Test **on both sides of each boundary** (e.g. 1101 and 1099) — off-by-one breakpoint bugs are common.

| Name | Size | Notes |
|---|---|---|
| Desktop wide | 1440×900 | Three panes visible |
| Desktop narrow | 1101×800 | Just above the first breakpoint |
| Laptop | 1099×800 | Left sidebar collapses (`--left-w:0`) |
| Tablet | 820×1180 | Drawer behaviour begins |
| Phone portrait | 390×844 | iPhone 14/15 class |
| Phone landscape | 844×390 | Keyboard + toolbar pressure |
| Small phone | 360×640 | Below the 560px breakpoint |

### 3.3 Conditions to simulate

- **Offline** (DevTools → Network → Offline) — CDN assets (MathJax, Tesseract) and `/api` must fail gracefully.
- **Slow 3G** — loading and progress states.
- **CDN blocked** (block `cdnjs.cloudflare.com`, `fonts.googleapis.com`) — the PDF.js worker fallback chain and font fallback.
- **Storage denied / full** — private windows, and the quota path.
- **Permission denied** — decline the folder/file picker prompts.

---

## 4. Local setup

Two ways to run, and **they are not equivalent**:

### 4.1 Static only (no AI)

```bash
cd /path/to/pair
python3 -m http.server 8765
# open http://localhost:8765/app.html
```

Everything works **except** `/api/*`. AI questions will fail — that is expected here. `localhost` is a **secure context**, so `showSaveFilePicker`, `showDirectoryPicker`, `crypto.subtle` and IndexedDB all work normally.

> Note: `/app` (without `.html`) is a Vercel rewrite and will **404** under a plain static server. Use `/app.html` locally.

### 4.2 Full stack (with AI)

```bash
npm i -g vercel
vercel dev          # serves index.html + /api on http://localhost:3000
```

Provide keys via `vercel env` or a git-ignored `.env`:

```
OPENROUTER_API_KEY=sk-or-...
OPENAI_API_KEY=sk-...        # optional
```

Use this whenever testing anything in `08-ai-and-agent.md`, `13-security-and-privacy.md` or the `/api` paths in `18-error-states-and-recovery.md`.

### 4.3 Testing a change before it ships

Preferred order: **local → `development` preview → merge to `main`**. Never validate a UI change only against `main` — by then it is live.

---

## 5. Test data

Keep a `qa-fixtures/` folder outside the repo with:

| Fixture | Why |
|---|---|
| **The bundled sample** (loads itself) | Baseline; has pre-seeded notes |
| **A small text PDF** (5–15 pages) | Fast happy path |
| **A large PDF** (100+ pages, >20 MB) | Perf, continuous scroll, memory (`17`) |
| **A scanned/image-only PDF** | OCR detection and run (`09`) |
| **A PDF with heavy math/equations** | Screenshot + MathJax (`08`) |
| **The same PDF renamed** | SHA-256 re-attachment (`04`) |
| **A different PDF with the same filename** | Proves matching is by content, not name (`04`) |
| **A corrupt file renamed `.pdf`** | Error path (`18`) |
| **A valid `.notes.json`** | Import (`10`) |
| **A malformed `.notes.json`** (truncated JSON) | Error path (`18`) |
| **A malicious `.notes.json`** | Sanitisation (`13`) — see below |
| **An exported `.annotated.html`** | Round trip (`11`) |
| **A very large `.notes.json`** (many notes) | DoS guards (`17`) |

**Malicious fixture** — build one for `13-security-and-privacy.md` containing, at minimum: an annotation `id` with quotes/brackets/spaces, an `image` set to a `javascript:` URL, an `image` set to `data:image/svg+xml,...` containing a script, a note whose text contains raw HTML and a `</script>` sequence, and one text field over 2 MB. Expected: **nothing executes**, ids are regenerated, unsafe images are dropped, text renders escaped and visible, and legitimate fields survive.

---

## 6. Resetting state between runs

**Do this before every formal run.** Use a dedicated browser profile for QA.

### 6.1 Full reset (recommended)

DevTools → **Application** → **Storage** → **Clear site data** (ticks Local Storage, IndexedDB, Cache).

### 6.2 Targeted reset (console)

> ⚠️ Destroys all PairedX notes for this origin. Only run on a QA profile.

```js
localStorage.removeItem('srw_state_v1');
localStorage.removeItem('srw_saveas_tip');
indexedDB.deleteDatabase('srw_assets');
location.reload();
```

### 6.3 Reset only the one-time save tip

```js
localStorage.removeItem('srw_saveas_tip'); // then reload
```

Needed for every `maybeShowSaveAsTip` check — it fires **once per device** by design.

### 6.4 Revoking File System Access grants

Chrome: click the icon left of the URL → **Site settings** → reset **File editing**. Required to re-test first-grant and denied-permission paths.

### 6.5 Inspecting state without breaking it

```js
JSON.parse(localStorage.getItem('srw_state_v1'));           // whole state
JSON.parse(localStorage.getItem('srw_state_v1')).annotations.length;
```

---

## 7. Conventions: IDs, priorities, types

**Check IDs** are `PREFIX-NNN`, unique across the whole suite and stable. **Never renumber an existing check** — a bug report or a commit may reference it. Retire with `(retired)` instead, and add new checks at the end of their section.

| Prefix | Document |
|---|---|
| `LAND` | 01 — Landing page |
| `FEAT` | 02 — Features page |
| `SHELL` | 03 — App shell & library |
| `DOC` | 04 — Document lifecycle |
| `READ` | 05 — Reader & navigation |
| `ANN` | 06 — Annotation tools |
| `NOTE` | 07 — Notes panel |
| `AI` | 08 — AI & agent |
| `OCR` | 09 — OCR |
| `STOR` | 10 — Storage & persistence |
| `SHARE` | 11 — Share & export |
| `SET` | 12 — Settings & templates |
| `SEC` | 13 — Security & privacy |
| `RESP` | 14 — Responsive, mobile & touch |
| `A11Y` | 15 — Accessibility |
| `XB` | 16 — Cross-browser & platform |
| `PERF` | 17 — Performance & limits |
| `ERR` | 18 — Error states & recovery |

**Priorities**

| | Meaning | If it fails |
|---|---|---|
| **P0** | Core path. The product is broken or data is at risk. | Block the release |
| **P1** | Important. The affected feature is unusable or visibly wrong. | Block that feature; fix before release unless explicitly waived |
| **P2** | Polish, cosmetic, rare edge. | File it; ship at the owner's discretion |

**Types** — `Functional`, `Visual`, `State`, `Edge`, `Regression`, `Copy`, `Perf`, `Security`, `A11y`.

**Check anatomy**

- **Pre** — required starting state. If you skip it the result is meaningless.
- **Steps** — exact actions.
- **Expect** — the observable pass condition. Quoted strings must match **character for character**, including curly quotes (`'`, `"`) and en/em dashes.
- **Watch** — the specific way this historically breaks. Read it *before* running the steps.

---

## 8. Bug severity & triage

| Severity | Definition | Examples |
|---|---|---|
| **S1 — Critical** | Data loss, security hole, or the app cannot be used. | Notes lost on reload; imported file executes script; the app white-screens |
| **S2 — Major** | A primary flow is broken with no workaround. | Cannot open a PDF; AI never answers; Save writes nothing |
| **S3 — Moderate** | A flow is broken but has a workaround, or is wrong in a visible way. | Connector line points at the wrong note; a filter misses items |
| **S4 — Minor** | Cosmetic or rare. | Tooltip truncated; 1px misalignment |

**Always S1, regardless of how small the trigger looks:**

- Any note or document silently lost or overwritten.
- Any imported/shared file causing script execution, or reading `localStorage`.
- An API key appearing in an exported file, a shared bundle, or any network request other than the `/api` override.
- A shared `.annotated.html` phoning home (any outbound request when opened offline).
- The AI proxy reaching a non-allowlisted host, or forwarding the server key to a caller-supplied URL.

---

## 9. Test tiers & exit criteria

### Tier S — Smoke (~30 checks, ~30 min)
Run before **every** production deploy. Defined in `19-regression-smoke.md`.
**Exit:** 100% of P0 pass. No S1/S2 open.

### Tier U — UI gate
Run for any restyle, layout change, or component rework. Defined in `20-new-feature-gate.md`.
**Exit:** 100% of P0 pass; all layout checks pass at every breakpoint in §3.2; no new S1/S2.

### Tier N — New feature
`20-new-feature-gate.md` in full, plus every document whose scope the feature touches, plus Tier S.
**Exit:** the feature's own checks are **written and added to this suite** (this is a gate, not a suggestion), all P0/P1 pass, no S1/S2.

### Tier F — Full regression
All 18 documents across the full browser matrix.
**Exit:** 100% P0, ≥95% P1, no open S1/S2, every P2 failure filed.

---

## 10. Recording results

One row per check, per browser:

| Check ID | Browser | Result | Notes / bug link |
|---|---|---|---|
| `STOR-014` | Chrome 141 | Pass | |
| `STOR-014` | Firefox 133 | N/A | Chromium-only; fallback verified by `XB-022` |
| `RESP-007` | Safari iOS | **Fail** | Toolbar clipped at 390px — S3, issue #41 |

Rules:

- **N/A** requires a reason and, where one exists, the ID of the check that covers the fallback.
- A **Fail** must have a severity and a filed issue before the run is considered complete.
- Record the **commit SHA** and **URL** (local / preview / production) the run was performed against.
- Attach a screenshot for every visual failure.
- If a check is ambiguous, that is a **defect in this suite** — fix the wording in the same PR.
