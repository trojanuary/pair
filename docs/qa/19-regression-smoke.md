# 19 — Regression smoke suite (Tier S)

> The 36 checks that must pass before **any** deploy to `main`. ~30 minutes. If one of these fails, do not ship.

`main` auto-deploys to the live `pairedx.com`. This is the last gate.

| | |
|---|---|
| **When** | Every production deploy, without exception |
| **Browsers** | Chrome desktop (required) + Safari iOS (required). Add Firefox if the change touched save/export. |
| **Time** | ~30 min for both browsers |
| **Pre** | **Reset state first** (`00-test-plan.md` §6). A stale profile invalidates the run. |
| **Exit** | 100% pass. Any failure blocks the deploy or requires a written waiver from the owner. |

This document does **not** restate the steps — it points at the authoritative check in its home document. Run them there.

---

## Note on `SEC-013`

`SEC-013` was a **confirmed stored XSS** when this suite was authored (unsanitised `page` field, verified with a working payload). It was **fixed** in the same batch: `page`/`anchor` are now coerced to integers in `sanitizeImportedAnnotation()` and escaped at every render site. The check is now a **regression guard** — it must keep passing. Never waive a failure here.

---

## 1. Boot & shell — 5 checks

| ID | Check | Doc |
|---|---|---|
| `DOC-001` | Clean profile boots straight into the bundled sample | 04 |
| `READ-010` | First paint shows page 1 of the sample at the saved zoom | 05 |
| `READ-013` | Text layer is selectable and invisibly aligned | 05 |
| `SHELL-001` | Three panes render at desktop width | 03 |
| `NOTE-001` | Fresh profile lists all 12 seeded notes, all compact | 07 |

> **Why these:** if any fails, the app is dead on arrival. `READ-013` specifically catches text-layer misalignment, which silently breaks selection, highlighting, find and every AI answer.

## 2. Persistence — 3 checks

| ID | Check | Doc |
|---|---|---|
| `STOR-001` | The one and only state key is `srw_state_v1` | 10 |
| `STOR-004` | Everything survives a reload | 10 |
| `SHELL-107` | Full shell state round-trips through a reload | 03 |

> **Why these:** this is a local-first app with no server backup. A persistence regression is unrecoverable data loss for every user who reloads.

## 3. Documents — 4 checks

| ID | Check | Doc |
|---|---|---|
| `DOC-013` | "Open PDF or bundle" button copy, tooltip and action | 04 |
| `DOC-015` | Opening a fresh PDF: toast copy | 04 |
| `DOC-027` | Same bytes, different filename: reopens instead of duplicating | 04 |
| `DOC-028` | Reopened document's notes are the real ones, not a fresh empty set | 04 |

> **Why these:** SHA-256 content addressing is the product's signature behaviour. `DOC-028` is the one that matters — a dedupe bug that returns an *empty* note set looks like total data loss to the user.

## 4. Annotation — 4 checks

| ID | Check | Doc |
|---|---|---|
| `ANN-001` | Cursor/Select is the default tool on a fresh profile | 06 |
| `ANN-015` | Popover appears on a mouse selection inside the page | 06 |
| `ANN-016` | Popover button copy | 06 |
| `ANN-064` | Capture bar copy and appearance | 06 |

## 5. Notes panel — 3 checks

| ID | Check | Doc |
|---|---|---|
| `NOTE-019` | Clicking a compact card expands it and moves the reader | 07 |
| `NOTE-022` | Exactly one note is expanded at a time | 07 |
| `NOTE-029` | AI answers render markdown, math and code | 07 |

> **Why these:** `NOTE-019` exercises the card ⇄ page link, the most fragile coupling in the UI. `NOTE-029` catches MathJax/markdown regressions.

## 6. AI — 4 checks *(needs `vercel dev` or a deployed preview)*

| ID | Check | Doc |
|---|---|---|
| `AI-001` | A fresh profile answers as "OpenRouter" | 08 |
| `AI-012` | Every note message hits the router first, on the router model | 08 |
| `AI-014` | intent "answer" produces a full AI reply | 08 |
| `AI-032` | The direct path's trace has context and final | 08 |

> **Note:** the public site runs on a shared key with a small quota. A quota error is a **valid result** for `AI-014` provided the message is the friendly shared-quota copy — verify that, don't just mark it failed.

## 7. Save, export & share — 5 checks

| ID | Check | Doc |
|---|---|---|
| `STOR-057` | Save writes a valid `.notes.json` with the expected top-level shape | 10 |
| `STOR-059` | Chromium: Save pops a native Save As dialog | 10 |
| `STOR-060` | Chromium: choosing an existing file overwrites it in place | 10 |
| `SHARE-005` | Share exports the ACTIVE document, not the last-shared one | 11 |
| `SHARE-102` | Anchors, numbering and ordering survive the round trip | 11 |

> **Why these:** `STOR-059`/`STOR-060` are the most recently changed code in the repo and have already been reverted twice. `SHARE-102` proves the export→import loop still preserves anchoring.

## 8. Security — 3 checks

| ID | Check | Doc |
|---|---|---|
| `SEC-004` | An id containing quotes is replaced, not escaped | 13 |
| `SEC-013` | A non-numeric `page` cannot inject markup — **⚠️ currently fails** | 13 |
| `SHARE-019` | A note containing script markup survives the round trip and renders inert | 11 |

> **Why these:** sharing annotated papers is a headline feature, so imported content is the primary untrusted input. **Never waive a failure here** — a regression means a shared file can run script and read the user's API key.

## 9. Responsive & platform — 3 checks

| ID | Check | Doc |
|---|---|---|
| `RESP-001` | Three panes at 1101px | 14 |
| `RESP-002` | Left sidebar collapses to zero width at 1099px | 14 |
| `XB-012` | Overwriting an existing file leaves no "(1)" copy | 16 |

## 10. Errors — 2 checks

| ID | Check | Doc |
|---|---|---|
| `ERR-063` | No `/api` under a plain static server | 18 |
| `ERR-065` | Going offline mid-answer | 18 |

> **Why these:** the app must stay usable when the AI is unavailable. Reading and annotating never depend on the network.

---

## Post-deploy verification

A green Vercel deploy is **not** proof the change shipped. After merging to `main`:

1. Fetch the live asset and confirm your change is in it:
   ```bash
   curl -s https://pairedx.com/src/app.js | grep -c "<a distinctive string from your change>"
   ```
2. Load `https://pairedx.com/app` — sample paper renders, **no console errors**.
3. Load `https://pairedx.com/` — landing page renders, "Enter" reaches the app.
4. Confirm `www.pairedx.com` still 307-redirects to the apex.

## Recording

Use the table format in `00-test-plan.md` §10. Record the **commit SHA** and the **URL** tested. File any failure with a severity before calling the run complete.
