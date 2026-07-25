# 12 - Settings modal: AI & Tools, Templates, Storage

> Every control in the Settings modal — the three tabs, provider defaults, keys, model fields, identity, tool toggles, the 5 editable system prompts and 7 agent tool descriptions, prompt export/import, reset behaviour, save/cancel semantics, and how a saved change reaches the running app.

| | |
|---|---|
| **ID prefix** | SET |
| **Scope** | `#btnSettings` → `openSettings()` and everything inside it: `mClose` / `mCancel` / `mSave`, the three `.settab` panes, the two `.def-radio` buttons, `kOpenrouter` / `mOpenrouter` / `mOpenrouterImg` / `mOpenrouterRouter`, `cBase` / `kCompat` / `mCompat` / `mCompatImg` / `mCompatRouter`, `actorName` / `actorInit`, `tgVis` / `tgWeb`, the `pt_<key>` and `pt_tool_<key>` textareas, `[data-reset]`, `ptExport` / `ptImport` / `ptResetAll`, `stFolder` / `stChange` / `stDisconnect` / `stExport` / `stImport`, and the propagation of each saved value into `/api/ai` requests and note rendering. |
| **Primary code** | `src/app.js:2643-2842`, `src/app.js:50-118`, `src/app.js:1234-1300`, `src/app.js:1415-1426`, `src/styles.css:366-388`, `src/styles.css:630-653`, `api/ai.js:80-110`, `api/ai-image.js:37-56` |
| **Checks** | 105 |

## Contents
- [1. Opening and closing the modal](#1-opening-and-closing-the-modal) - 9 checks
- [2. Save and cancel semantics](#2-save-and-cancel-semantics) - 9 checks
- [3. The three tabs](#3-the-three-tabs) - 6 checks
- [4. AI & Tools: provider default and keys](#4-ai--tools-provider-default-and-keys) - 11 checks
- [5. AI & Tools: model fields](#5-ai--tools-model-fields) - 8 checks
- [6. Identity and tool toggles](#6-identity-and-tool-toggles) - 10 checks
- [7. Templates: the five system prompts](#7-templates-the-five-system-prompts) - 20 checks
- [8. Templates: the seven agent tool descriptions](#8-templates-the-seven-agent-tool-descriptions) - 8 checks
- [9. Prompt export and import](#9-prompt-export-and-import) - 10 checks
- [10. Storage tab](#10-storage-tab) - 9 checks
- [11. Layout, responsive, accessibility, security](#11-layout-responsive-accessibility-security) - 5 checks

**Standing setup for this document:** open `/app` in a normal (non-shared) browser profile, with the bundled sample `BERT — Devlin et al. 2019 (NAACL).pdf` loaded. Several checks read the request payload — keep DevTools open on the **Network** tab, filtered to `ai`, and use **Payload / Request** to inspect the JSON body of `/api/ai` and `/api/ai-image`. Several checks read persisted state — DevTools → **Application → Local Storage → key `srw_state_v1`** → the `settings` object.

---

## 1. Opening and closing the modal

### SET-001 - Open Settings from the sidebar gear
**P0** * Functional * `src/app.js:3065 wire()`, `src/app.js:2760 openSettings()`, `app.html:37`

- **Pre:** App loaded, left sidebar expanded.
- **Steps:**
  1. Scroll to the bottom of the left sidebar to the "Storage" block.
  2. Click the gear button (`#btnSettings`, `title="Settings"`).
- **Expect:** A centred modal opens over a dimmed backdrop. Header reads "Settings" with a "✕" at the right. Tab row reads exactly "AI & Tools", "Templates", "Storage" with "AI & Tools" active (blue text, blue underline). Footer has two buttons: "Close" (ghost) then "Save" (blue).
- **Watch:** The gear lives inside `.sb-storage`, which is `margin-top:auto` — if the doc list is long the gear can be pushed out of view; it must stay pinned at the sidebar bottom.

### SET-002 - Settings is the only way in — no other entry point opens it
**P2** * Regression * `src/app.js:3065`

- **Pre:** App loaded.
- **Steps:**
  1. Search the UI for any other "Settings" affordance: reader toolbar, notes "Filter & options" popover, the note card "⋮" menus, the export view.
- **Expect:** Only `#btnSettings` opens the modal. Error toasts that mention Settings (e.g. the quota message) are text only — they contain no clickable link.
- **Watch:** A regression that adds a second call site must pass no argument; `openSettings(note)` accepts an optional blue banner that no caller currently supplies (see SET-009).

### SET-003 - "✕" closes the modal
**P0** * Functional * `src/app.js:2810`

- **Pre:** Settings open.
- **Steps:**
  1. Click the "✕" in the header (`#mClose`).
- **Expect:** The modal and its backdrop disappear entirely. No toast. The app underneath is interactive again (click a note, it selects).
- **Watch:** A leftover `.modal-mask` with `z-index:120` swallows every click on the page while looking invisible.

### SET-004 - "Close" button closes the modal
**P0** * Functional * `src/app.js:2810`

- **Pre:** Settings open.
- **Steps:**
  1. Click the footer button (`#mCancel`).
- **Expect:** Button label is exactly "Close" (not "Cancel"). The modal closes with no toast and no state write.
- **Watch:** Copy regression to "Cancel" — the button genuinely closes rather than reverting, so "Close" is the honest label.

### SET-005 - Backdrop click closes the modal
**P1** * Functional * `src/app.js:2811`

- **Pre:** Settings open.
- **Steps:**
  1. Click the dimmed area outside the white modal panel.
- **Expect:** Modal closes.
- **Watch:** The handler is `if (e.target === m)` — clicking the header, footer, or any padding *inside* the panel must NOT close it.

### SET-006 - Text-selecting a prompt and releasing outside the panel closes the modal
**P1** * Edge * `src/app.js:2811`

- **Pre:** Settings open, Templates tab, "Text answers" expanded.
- **Steps:**
  1. Press the mouse down inside the prompt textarea.
  2. Drag left/up past the edge of the white panel onto the dim backdrop.
  3. Release the button.
- **Expect:** Document the observed behaviour. Today the `click` event resolves to the common ancestor (`.modal-mask`), so the modal closes and every unsaved edit is discarded.
- **Watch:** This is the single most likely way a tester loses a long prompt edit. Any fix must compare `mousedown` target, not just the click target.

### SET-007 - Escape does not close the modal
**P2** * Edge * `src/app.js:2809-2822`

- **Pre:** Settings open with an edited field.
- **Steps:**
  1. Press `Escape`.
- **Expect:** The modal stays open and the edit is intact — `openSettings()` binds no `keydown` handler (unlike `confirmDialog()` at `src/app.js:2185` and the Save-As tip at `src/app.js:2491`, which both handle Escape).
- **Watch:** If Escape is later wired, it must not close over unsaved edits without a confirm; and it must not also fire the find-bar Escape handler.

### SET-008 - Double-clicking the gear stacks two modals
**P1** * Edge * `src/app.js:3065`, `src/app.js:2727 collectPrompts()`, `src/app.js:2734 exportPrompts()`

- **Pre:** App loaded, Settings closed.
- **Steps:**
  1. Double-click `#btnSettings` quickly.
  2. In the topmost modal open Templates → "Text answers" and type "ZZZ-TOP" at the start of the prompt.
  3. Press "Save" on the topmost modal.
  4. Close the remaining modal, reopen Settings → Templates.
- **Expect:** Document what happens. Two `.modal-mask` elements are appended to `#modalRoot`, giving duplicate element ids; `collectPrompts()` and `exportPrompts()` resolve prompts with global `document.getElementById('pt_text')`, which matches the **first** (lower) modal — so "ZZZ-TOP" is silently dropped and no "customized" badge appears.
- **Watch:** Same failure via keyboard repeat (holding Enter on a focused gear) or a slow double-tap on touch.

### SET-009 - The optional blue note banner is not shown
**P2** * Regression * `src/app.js:2767`

- **Pre:** Settings open on the AI & Tools tab.
- **Steps:**
  1. Look immediately below the tab row, above the "AI runs through a shared key…" paragraph.
- **Expect:** No blue-bordered callout box. `openSettings(note)` renders one only when a caller passes `note`, and the only call site (`src/app.js:3065`) passes nothing.
- **Watch:** A future "add your key" deep link would pass this argument — if so, the box must be `#EFF6FF` background / `#BFDBFE` border / `#1D4ED8` text and must not shift the tab row.

---

## 2. Save and cancel semantics

### SET-010 - Save persists and confirms
**P0** * Functional * `src/app.js:2823-2841 openSettings()`

- **Pre:** Settings open.
- **Steps:**
  1. Change "Your name" to "QA Tester".
  2. Click "Save".
- **Expect:** The modal closes, a toast reads exactly "Settings saved.", and the notes list re-renders (`render()` at `src/app.js:2840`).
- **Watch:** Toast must appear only once per Save; the modal must close even if the notes list is empty.

### SET-011 - Closing without saving discards every edit on every tab
**P0** * State * `src/app.js:2809-2811`

- **Pre:** Settings open.
- **Steps:**
  1. AI & Tools: type `sk-or-DISCARD-ME` into the OpenRouter key, change the text model to `zzz/none`, switch the Default radio to "OpenAI-compatible API", change the name to "Nope", toggle both switches off.
  2. Templates: expand "Intent router" and delete its whole text.
  3. Click "Close".
  4. Reopen Settings and inspect all three tabs.
- **Expect:** Every field is back to its pre-edit value; no "customized" badge appears; `srw_state_v1.settings` in Local Storage is unchanged.
- **Watch:** `const s = state.settings` at `src/app.js:2761` is a live reference — a regression that mutates `s` inside an input handler instead of inside `mSave` would leak edits through Close.

### SET-012 - Saved settings survive a full reload
**P0** * State * `src/app.js:151 save()`, `src/app.js:37 LS`

- **Pre:** Settings saved with name "QA Tester" and text model `openai/gpt-5.4-mini`.
- **Steps:**
  1. Wait ~1 second (the `save()` write is debounced 250 ms).
  2. Hard-reload the page.
  3. Reopen Settings.
- **Expect:** Both values are still there; `srw_state_v1` → `settings.actorName === "QA Tester"`, `settings.models.openrouter === "openai/gpt-5.4-mini"`.
- **Watch:** Saving and reloading inside 250 ms loses the write; also confirm no `Storage limit reached — export your notes to keep them.` toast fires on a normal-size settings write.

### SET-013 - Save reads every field regardless of which tab is visible
**P1** * State * `src/app.js:2823-2839`

- **Pre:** Settings open.
- **Steps:**
  1. On AI & Tools change the name to "Tab Test".
  2. Switch to Templates and edit "Web search".
  3. Switch to Storage (so neither edited pane is visible).
  4. Click "Save", then reopen Settings.
- **Expect:** Both the name and the prompt edit are saved. Hidden panes are `display:none` only (`.tabpane.hidden`, `src/styles.css:634`), so their inputs still exist and are read.
- **Watch:** If a regression starts destroying hidden panes, `$('#kOpenrouter', m).value` at `src/app.js:2825` throws and Save silently does nothing.

### SET-014 - An untouched Save is a no-op for existing customisations
**P1** * State * `src/app.js:2727 collectPrompts()`

- **Pre:** A customised "Text answers" prompt already saved (badge visible on reopen).
- **Steps:**
  1. Open Settings, change only "Your name", press "Save".
  2. Reopen Settings → Templates.
- **Expect:** The "Text answers" row still shows the "customized" badge and the custom text — `collectPrompts()` re-reads the textareas, which were pre-filled from the stored value.
- **Watch:** A regression that collects only "dirty" fields would wipe customisations on any unrelated Save.

### SET-015 - Rapid double-click on Save
**P1** * Edge * `src/app.js:2823`

- **Pre:** Settings open with one changed field.
- **Steps:**
  1. Double-click "Save" as fast as possible.
  2. Watch the toast stack and the DevTools console.
- **Expect:** Exactly one "Settings saved." toast; no console error; the second click lands on the page beneath and must not, for example, delete a note or open a note menu.
- **Watch:** The modal is removed by the first click, so the second click hits whatever is underneath at that coordinate — usually the notes list.

### SET-016 - Reopening shows the saved values, not the last edit
**P0** * State * `src/app.js:2762-2807`

- **Pre:** Settings saved with the OpenRouter key blank.
- **Steps:**
  1. Open Settings, type `sk-or-xyz` into the OpenRouter key, click "Close".
  2. Reopen Settings.
- **Expect:** The key field is empty again (its `value` is rendered from `state.settings` each time the modal is built).
- **Watch:** Browser password-manager autofill can re-populate `#kOpenrouter` (it is `type="password"`) — confirm the field is genuinely empty and not an autofill artefact by checking `settings.keys.openrouter` in Local Storage.

### SET-017 - Navigating away mid-edit loses the edit silently
**P2** * Edge * `src/app.js:2760`

- **Pre:** Settings open with a long prompt edit in progress.
- **Steps:**
  1. Press browser Back, or reload, or click a different document in the library behind the modal (it is covered by the backdrop, so use Back/reload).
- **Expect:** No `beforeunload` prompt; the edit is gone on return. This is expected — record it so testers do not report it as data loss.
- **Watch:** If a future build adds a dirty-state guard, it must not fire on an untouched modal.

### SET-018 - Settings is unreachable in a read-only shared HTML
**P0** * Functional * `src/app.js:3294 applyReadOnly()`, `src/app.js:3299`

- **Pre:** Export a paper with "Share as HTML" and open the resulting `.annotated.html` from disk.
- **Steps:**
  1. Look at the left sidebar bottom.
- **Expect:** `#btnSettings` is hidden (`style.display = 'none'`) and the whole `.sb-storage` block is hidden too, so there is no way to open Settings. The bottom banner reads "Read-only annotated paper · To add notes, open this file at pairedx.com · made with PairedX".
- **Watch:** `save()` returns early under `READONLY` (`src/app.js:152`), so if a regression re-exposes the gear, a Save would appear to work and silently persist nothing.

---

## 3. The three tabs

### SET-019 - Tab labels and default tab
**P1** * Copy * `src/app.js:2765`, `src/styles.css:630-633`

- **Pre:** Settings just opened.
- **Steps:**
  1. Read the three tab labels left to right.
- **Expect:** "AI & Tools", "Templates", "Storage". The first is active: blue text with a 2px blue bottom border; the other two are muted grey. (The source writes `AI &amp; Tools` — it must render as a single ampersand, not the entity.)
- **Watch:** A stray `&amp;amp;` after an escaping change.

### SET-020 - Switching tabs swaps exactly one pane
**P0** * Functional * `src/app.js:2814`

- **Pre:** Settings open.
- **Steps:**
  1. Click "Templates", then "Storage", then "AI & Tools".
- **Expect:** Exactly one `.settab` carries `.on` at a time and exactly one `.tabpane` is visible at a time. No pane flashes both visible.
- **Watch:** `data-tab` ↔ `data-pane` must stay paired (`ai` / `templates` / `storage`); a renamed tab that does not rename its pane shows a blank modal body.

### SET-021 - Tab switching preserves in-progress edits
**P0** * State * `src/app.js:2814`, `src/styles.css:634`

- **Pre:** Settings open.
- **Steps:**
  1. On Templates, expand "Intent router" and append "XYZ" to its text.
  2. Switch to Storage, then to AI & Tools, then back to Templates.
- **Expect:** "Intent router" is still expanded and still ends in "XYZ" (panes are only `display:none`, never rebuilt).
- **Watch:** Scroll position of the modal body resets on tab change — acceptable, but the textarea content must not.

### SET-022 - The active tab is not remembered
**P2** * State * `src/app.js:2765`

- **Pre:** Settings open on Templates.
- **Steps:**
  1. Save (or Close), then reopen Settings.
- **Expect:** It always reopens on "AI & Tools" — the tab is not persisted.
- **Watch:** A tester repeatedly editing prompts will hit this every time; do not "fix" it silently without updating this check.

### SET-023 - Tab buttons never submit or navigate
**P1** * Functional * `src/app.js:2765`

- **Pre:** Settings open.
- **Steps:**
  1. Click each tab; watch the address bar and the Network tab.
- **Expect:** No page reload, no URL change, no network request. All three carry `type="button"`.
- **Watch:** Dropping `type="button"` inside a future `<form>` wrapper would turn each tab into a submit.

### SET-024 - Tab row at narrow widths
**P2** * Visual * `src/styles.css:630`, `src/styles.css:367-369`

- **Pre:** Resize the window to 360 px wide (or use device emulation, iPhone SE).
- **Steps:**
  1. Open Settings and look at the tab row.
- **Expect:** All three tabs are readable and tappable, the modal is `max-width:100%` inside a 20 px backdrop padding, and the page body does not scroll horizontally.
- **Watch:** `.settabs` is `display:flex` with no `flex-wrap` — a longer label ("AI, Tools & Models") would overflow the panel edge rather than wrap.

---

## 4. AI & Tools: provider default and keys

### SET-025 - Intro paragraph copy, including the non-breaking hyphens
**P1** * Copy * `src/app.js:2768`

- **Pre:** Settings → AI & Tools.
- **Steps:**
  1. Select the whole intro paragraph and paste it into a plain-text editor that shows exact characters.
- **Expect:** "AI runs through a **shared key** so you can try it instantly — but that key has a **small test quota**. For real use, add your **own key** below: it's stored only in this browser and sent per‑request as an override — **never saved on the server**. **OpenRouter** is the recommended default (text, images, and the tool‑using agent); or use any **OpenAI‑compatible API** (base URL + key + models). Mark one as **Default**, or type **@ai** in a note." The hyphens in "per‑request", "tool‑using" and "OpenAI‑compatible" are U+2011 non-breaking hyphens; the dashes are U+2014 em dashes.
- **Watch:** An editor pass that normalises U+2011 to a plain `-` lets those phrases break across lines mid-word.

### SET-026 - Closing hint about where the key goes
**P1** * Copy * `src/app.js:2786`

- **Pre:** Settings → AI & Tools, scrolled to the bottom of the pane.
- **Steps:**
  1. Read the last grey line above the footer.
- **Expect:** "Your own key (if entered) is stored only in this browser and sent per‑request to the site's `/api/ai` proxy as an override; otherwise the server's key is used and never exposed to the browser." `/api/ai` renders in a monospace `<code>` style.
- **Watch:** This is the app's security promise to the user — it must stay factually true (see SET-098).

### SET-027 - Provider block labels and the "recommended" flag
**P1** * Copy * `src/app.js:2770`, `src/app.js:2774-2775`

- **Pre:** Settings → AI & Tools.
- **Steps:**
  1. Read the two provider block headings and the compat sub-hint.
- **Expect:** First block: "OpenRouter" followed by "· recommended" in green bold (U+00B7 middle dot). Second block: "OpenAI-compatible API" (plain ASCII hyphen here) with the grey line "Any OpenAI-compatible endpoint (OpenAI, Together, Groq, a local model…). Used for text, images, and the tool-using agent."
- **Watch:** The two blocks use different hyphen characters in "OpenAI-compatible" (ASCII at :2774/:2775, U+2011 at :2768) — that is current source truth; flag it only if a copy pass claims to have unified them.

### SET-028 - Default radio reflects the stored provider on open
**P0** * State * `src/app.js:2770`, `src/app.js:2774`, `src/app.js:1236 activeProvider()`

- **Pre:** Fresh profile (`settings.provider === 'openrouter'` from `defaultState()`, `src/app.js:57`).
- **Steps:**
  1. Open Settings and look at the two "Default" pills.
- **Expect:** The OpenRouter pill is `.on`: blue text, blue border, pale blue fill, and its `.rdot` is a filled ring (`border:4px solid`). The compat pill is grey with a hollow dot.
- **Watch:** Both pills `.on` at once, or neither — `migrateState()` at `src/app.js:109` forces any unknown provider back to `openrouter`, so a blank state must never render two selected pills.

### SET-029 - Selecting a Default moves the selection to exactly one pill
**P0** * Functional * `src/app.js:2812`

- **Pre:** Settings → AI & Tools.
- **Steps:**
  1. Click the "Default" pill next to "OpenAI-compatible API".
  2. Click the "Default" pill next to "OpenRouter".
  3. Click the already-selected OpenRouter pill again.
- **Expect:** Selection follows the last click; only one pill is ever highlighted; re-clicking the selected pill leaves it selected (the handler clears all, then sets the clicked one).
- **Watch:** A regression using `classList.toggle` instead of `add` would let the user deselect both, and `$('.def-radio.on', m)` at `src/app.js:2824` would then leave `provider` unchanged on Save.

### SET-030 - Default selection is not applied until Save
**P0** * State * `src/app.js:2824`

- **Pre:** Provider is `openrouter`.
- **Steps:**
  1. Click the compat "Default" pill, then click "Close".
  2. Reopen Settings.
- **Expect:** OpenRouter is selected again; `settings.provider` in Local Storage is still `"openrouter"`.
- **Watch:** Same as SET-011 — the pill handler must only touch CSS classes.

### SET-031 - Switching the default provider reaches the request payload
**P0** * Functional * `src/app.js:2824`, `src/app.js:1236`, `src/app.js:1244 aiText()`

- **Pre:** A valid OpenAI-compatible key in `#kCompat` and base URL `https://api.openai.com/v1`.
- **Steps:**
  1. Select the compat "Default" pill, Save.
  2. Highlight a sentence in the PDF, click "✦ Ask AI", ask "what is this about?".
  3. In DevTools → Network → the `/api/ai` request → Payload.
- **Expect:** `"provider":"compat"`, `"baseUrl":"https://api.openai.com/v1"`, `"userKey"` present, and `"model"` equal to the "Text model" field of the compat block. When the answer lands, the reply's author name in the note card reads "OpenAI-compatible" (`PROVIDER_LABEL`, `src/app.js:49`, `src/app.js:1721`).
- **Watch:** Answers already in the thread keep their old provider label — only new replies change.

### SET-032 - Compat as default with no key gives the exact server error
**P1** * Functional * `api/ai.js:91`, `src/app.js:1594 errHint()`

- **Pre:** `#kCompat` empty, compat selected as Default, Saved. App running on the deployed site (or `vercel dev`).
- **Steps:**
  1. Ask any question on a highlighted selection.
- **Expect:** A red toast (6 s) reading "The OpenAI-compatible provider needs your own API key (add it in Settings → AI & Tools). The site's shared demo key only works with OpenRouter." and the AI message card shows an error state rather than an empty answer.
- **Watch:** The message must name the tab ("Settings → AI & Tools") — if the tab is ever renamed, this server string must change too.

### SET-033 - Key field is masked, trimmed, and round-trips
**P1** * Functional * `src/app.js:2771`, `src/app.js:2825`

- **Pre:** Settings → AI & Tools.
- **Steps:**
  1. Type `  sk-or-v1-TESTKEY  ` (with leading and trailing spaces) into the OpenRouter key.
  2. Save, wait a second, inspect `settings.keys.openrouter` in Local Storage, then reopen Settings.
- **Expect:** The characters are masked as dots while typing. Stored value is `sk-or-v1-TESTKEY` — `.trim()` applied. The reopened field shows the same masked length (16 characters).
- **Watch:** A pasted key with a trailing newline (common when copied from a terminal) must also be trimmed.

### SET-034 - Key placeholder copy
**P2** * Copy * `src/app.js:2771`, `src/app.js:2777`

- **Pre:** Both key fields empty.
- **Steps:**
  1. Read the two placeholders.
- **Expect:** OpenRouter: "API key — sk-or-… (optional; server key used by default)" (em dash + ellipsis character). Compat: "API key". Base URL: "Base URL — e.g. https://api.openai.com/v1".
- **Watch:** Placeholders vanish once a value exists — clear the field to re-check after any copy change.

### SET-035 - No key entered means no `userKey` in the request
**P0** * Security * `src/app.js:1237 keyFor()`, `src/app.js:1247`

- **Pre:** Both key fields empty, provider OpenRouter, Saved.
- **Steps:**
  1. Ask a question and inspect the `/api/ai` request payload.
- **Expect:** The body has **no** `userKey` property at all (`keyFor(provider) || undefined`), so the server falls back to its env key.
- **Watch:** A regression sending `"userKey":""` makes `api/ai.js:83` treat it as falsy anyway, but `provider:'compat'` with `""` would still be rejected — verify the field is genuinely absent.

---

## 5. AI & Tools: model fields

### SET-036 - The six model inputs are present with the right ids and defaults
**P0** * Functional * `src/app.js:2771`, `src/app.js:2778`, `src/app.js:50 DEFAULT_MODELS`

- **Pre:** Fresh profile.
- **Steps:**
  1. Read the inline inputs in both provider blocks.
- **Expect:** OpenRouter row reads "Text model: [openai/gpt-5.4] · Image: [google/gemini-3.1-flash-lite-image] · Router (fast/cheap): [openai/gpt-5.4-mini]" (ids `mOpenrouter`, `mOpenrouterImg`, `mOpenrouterRouter`). Compat row reads "Text model: [gpt-5.4] · Image model: [gpt-image-1] · Router model: [gpt-5.4-mini]" (ids `mCompat`, `mCompatImg`, `mCompatRouter`). "(fast/cheap)" is grey.
- **Watch:** The two rows use different labels ("Image" vs "Image model") — that asymmetry is current source truth.

### SET-037 - Blanking any model field restores its default on Save
**P1** * Edge * `src/app.js:2828-2833`

- **Pre:** Settings → AI & Tools.
- **Steps:**
  1. Clear all six model inputs (select-all, Delete).
  2. Save, then reopen Settings.
- **Expect:** All six are repopulated with the `DEFAULT_MODELS` values listed in SET-036 — `.trim() || DEFAULT_MODELS.x`.
- **Watch:** A field containing only spaces must behave the same (trim first).

### SET-038 - A changed text model shows up in the answer's provenance line
**P0** * Functional * `src/app.js:2828`, `src/app.js:1354`, `src/app.js:1811`

- **Pre:** OpenRouter default, working AI.
- **Steps:**
  1. Set "Text model" to `openai/gpt-5.4-mini`, Save.
  2. Ask a question on a highlighted selection and wait for the answer.
  3. Expand the "ⓘ AI-generated …" disclosure under the answer.
- **Expect:** It reads "ⓘ AI-generated · openai/gpt-5.4-mini · sources", and the `/api/ai` payload carries `"model":"openai/gpt-5.4-mini"`.
- **Watch:** Older answers keep the model they were generated with — only new answers reflect the change.

### SET-039 - The router model is used for classification only
**P1** * Functional * `src/app.js:2832`, `src/app.js:1282 routeMessage()`, `src/app.js:1264 aiClassify()`

- **Pre:** OpenRouter default; router model set to a distinctive value, e.g. `openai/gpt-5.4-mini`.
- **Steps:**
  1. Select text, create a note, and type a message that is NOT prefixed with `@ai`.
  2. Watch the Network tab for the two `/api/ai` calls.
- **Expect:** The first call carries `"mode":"text"`, `"maxTokens":220` and the **router** model; only if it routes to an answer does a second call go out with the **text** model and `"mode"` absent (agent) or the direct shape.
- **Watch:** If the router model field is blank at request time the code falls back to `DEFAULT_MODELS.openrouterRouter` (`src/app.js:1284`) even for the compat provider — a real cross-provider fallback worth confirming.

### SET-040 - The image model is used only for image generation
**P1** * Functional * `src/app.js:2829`, `src/app.js:1253 aiImage()`, `src/app.js:1573`

- **Pre:** "Enable generated visuals" ON; OpenRouter default; image model set to the shipped default.
- **Steps:**
  1. On a note, ask for something clearly pictorial, e.g. "illustrate a hairpin vortex".
  2. Inspect the `/api/ai-image` request payload when the status turns to "Generating image…".
- **Expect:** `"model"` equals `#mOpenrouterImg`'s value; `/api/ai` (the planner call) carries the **text** model, not the image model. The finished card's disclosure line reads "AI-generated illustration · not extracted data · <image model>".
- **Watch:** Diagram (ascii) results label the **text** model instead (`src/app.js:1576`) — that is correct, not a bug.

### SET-041 - Base URL is trimmed, and blanking it behaves differently within vs across sessions
**P1** * Edge * `src/app.js:2827`, `src/app.js:107 migrateState()`

- **Pre:** Compat base URL is `https://api.openai.com/v1`.
- **Steps:**
  1. Clear `#cBase`, Save, reopen Settings — note the field.
  2. Reload the page, reopen Settings — note the field again.
- **Expect:** Step 1: the field is empty (an empty string is stored). Step 2: it reads "https://api.openai.com/v1" again, because `migrateState()` refills a falsy `compatBaseUrl` on load. Requests sent in step 1 carry `"baseUrl":""`, which the server resolves to the same OpenAI default (`api/ai.js:14 baseOf`).
- **Watch:** Testers will report step 1 as a bug — record it as the documented behaviour of the migrate-on-load repair.

### SET-042 - A non-HTTPS or unknown base URL is rejected with the exact server copy
**P1** * Functional * `api/ai.js:96-98`, `api/ai-image.js:52-55`

- **Pre:** Compat selected as Default with a valid key in `#kCompat`.
- **Steps:**
  1. Set base URL to `http://api.openai.com/v1`, Save, ask a question.
  2. Set base URL to `https://evil.example.com/v1`, Save, ask again.
- **Expect:** (1) red toast "Custom endpoints must use HTTPS." (2) red toast "That endpoint isn't a recognized OpenAI-compatible provider. Use a known provider, or self-host PairedX to point at any endpoint (including a local model)." (the apostrophe is U+2019).
- **Watch:** The allowlist is `api/ai.js:22-26`; a base URL of `https://api.groq.com/openai/v1` must be accepted (host match, path ignored).

### SET-043 - A trailing slash in the base URL is tolerated
**P2** * Edge * `api/ai.js:14`

- **Pre:** Compat default with a valid key.
- **Steps:**
  1. Set base URL to `https://api.openai.com/v1///`, Save, ask a question.
- **Expect:** The request succeeds; the server strips trailing slashes before appending `/chat/completions`.
- **Watch:** A double slash in the upstream URL would 404 with an opaque provider error.

---

## 6. Identity and tool toggles

### SET-044 - Identity fields and their placeholders
**P1** * Copy * `src/app.js:2780-2781`

- **Pre:** Fresh profile.
- **Steps:**
  1. Read the "Your identity (actor)" field group.
- **Expect:** Label "Your identity (actor)"; a wide input placeholder "Your name" pre-filled "You"; a narrow 70 px input placeholder "IN" pre-filled "YO", capped at 2 characters (`maxlength="2"`) and displayed uppercase.
- **Watch:** `text-transform:uppercase` is presentational only — the stored value is uppercased separately at Save.

### SET-045 - Blank identity falls back to "You" / "YO"
**P1** * Edge * `src/app.js:2834-2835`

- **Pre:** Settings open.
- **Steps:**
  1. Clear both identity inputs entirely, Save, reopen Settings.
- **Expect:** Name is "You", initials are "YO".
- **Watch:** A name of only spaces must also fall back (trim first).

### SET-046 - Initials are uppercased and truncated
**P1** * Functional * `src/app.js:2835`

- **Pre:** Settings open.
- **Steps:**
  1. Type `qa` into the initials field, Save, reopen.
  2. Try to type `qat` — a third character.
- **Expect:** Stored and shown as "QA". The input refuses the third character (`maxlength="2"`); pasting "QATEST" leaves only the first two characters.
- **Watch:** A 2-code-unit emoji (e.g. 🙂) fills the field entirely — confirm the avatar renders it without clipping rather than showing mojibake.

### SET-047 - Identity propagates to existing and new note cards
**P0** * State * `src/app.js:2836`, `src/app.js:1714-1721`, `src/app.js:1911`

- **Pre:** At least one of your own comments exists on the sample document (author shows "You" with a blue "YO" avatar).
- **Steps:**
  1. Set name "Dana Ruiz" and initials "DR", Save.
  2. Look at the existing comment, then add a new comment.
- **Expect:** Both the existing and the new card headers read "Dana Ruiz" with a "DR" avatar — `ACTORS.you` is mutated in place, so all `actor:'you'` messages re-label. Seeded notes by "Sara Davis" / "Bonnie Kearney" are unaffected.
- **Watch:** The `render()` at `src/app.js:2840` is what refreshes the list — if Save stops calling it, the change only shows after the next unrelated re-render.

### SET-048 - Identity with quotes and angle brackets is escaped
**P1** * Security * `src/app.js:2781`, `src/app.js:14 esc()`

- **Pre:** Settings open.
- **Steps:**
  1. Set the name to `Ana "Q" <b>Diaz</b>`, Save.
  2. Look at a note card header, then reopen Settings.
- **Expect:** The card shows the literal text including the `<b>` tags — no bold rendering, no broken layout. Reopening Settings shows the exact same string in the input (the `value="${esc(...)}"` round-trips through the attribute).
- **Watch:** A quote that escapes the `value` attribute would blow the rest of the modal markup away — the pane would render half-empty.

### SET-049 - Tools toggles: labels, initial state, and click behaviour
**P0** * Functional * `src/app.js:2782-2785`, `src/app.js:2813`, `src/styles.css:168-172`

- **Pre:** Fresh profile (`enableVisuals` and `enableWeb` both true — `src/app.js:61`, plus the one-time forced default at `src/app.js:88`).
- **Steps:**
  1. Read the "Tools" group and click each switch twice.
- **Expect:** Label "Tools" above two rows: "Enable generated visuals" and "Allow external web search (changes provenance to “Used web search”)" — with curly quotes U+201C/U+201D. Both switches start blue with the knob right; a click slides the knob left and turns the track grey; a second click restores it.
- **Watch:** The switch is a `<div class="sw">` with an inner `<i>` — clicking the knob itself must still toggle (the handler is on the container).

### SET-050 - Toggle state persists only on Save
**P0** * State * `src/app.js:2837-2838`

- **Pre:** Both toggles ON.
- **Steps:**
  1. Toggle both OFF, click "Close", reopen Settings.
  2. Toggle both OFF again, click "Save", reopen Settings.
- **Expect:** After step 1 both are ON again; after step 2 both are OFF and `settings.enableVisuals` / `settings.enableWeb` are `false` in Local Storage.
- **Watch:** `migrateState()` at `src/app.js:88` force-enables both once, guarded by `_toolsDefaulted` — confirm that flag exists in stored state so a reload does not silently re-enable them.

### SET-051 - Web search OFF removes the tool and flips the request flag
**P0** * Functional * `src/app.js:1424 agentTools()`, `src/app.js:1247`, `src/app.js:1348 chipsFor()`

- **Pre:** "Allow external web search" OFF, Saved. Provider OpenRouter.
- **Steps:**
  1. Ask a question on a text selection.
  2. Inspect the `/api/ai` payload with `"mode":"agent"`.
  3. When the answer arrives, expand its "ⓘ AI-generated" disclosure.
- **Expect:** The `tools` array contains no `web_search` entry; direct (non-agent) calls carry `"web":false`; the chip row ends with "No external sources" rather than "Used web search".
- **Watch:** Chips are frozen onto the message when it is created — pre-existing answers keep whichever chip they were born with. Only new answers change.

### SET-052 - Visuals OFF removes create_visual and forces ascii
**P0** * Functional * `src/app.js:1423`, `src/app.js:1539`, `src/app.js:1549`

- **Pre:** "Enable generated visuals" OFF, Saved.
- **Steps:**
  1. Ask a question on a text selection and inspect the agent `tools` array.
  2. Trigger a visual anyway (a note message like "draw the experimental setup").
- **Expect:** No `create_visual` entry in `tools`. If a visual is still produced, it is a monospace diagram, never a generated image — the planner system prompt gets "NOTE: image generation is unavailable, so you must use \"ascii\"." appended, visible in the `/api/ai` payload's `system` field.
- **Watch:** The appended note is skipped if the prompt already matches `/image generation is unavailable/i` — a customised image prompt containing that phrase must not get it twice.

### SET-053 - Both toggles OFF leaves exactly five agent tools
**P1** * Functional * `src/app.js:1415-1425`

- **Pre:** Both toggles OFF, Saved.
- **Steps:**
  1. Ask a question on a text selection and count the entries in the agent request's `tools` array.
- **Expect:** 5 tools: `read_selection_context`, `read_page`, `search_document`, `document_outline`, `read_full_document`. With visuals ON only: 6. With web ON only: 6. With both ON: 7.
- **Watch:** Order matters for readability of the payload but not for correctness; the count is the assertion.

---

## 7. Templates: the five system prompts

### SET-054 - Templates pane intro copy
**P1** * Copy * `src/app.js:2720`

- **Pre:** Settings → Templates.
- **Steps:**
  1. Read the grey paragraph at the top of the pane.
- **Expect:** "Make the assistant your own — expand any prompt below to view or edit it. The per-request context (your selection, question, and page) is always added by the app, so restyling here won't break how answers are built. Changes apply after you press **Save**." ("won't" uses U+2019; "Save" is bold.)
- **Watch:** The last sentence is the user's only warning that edits need Save — it must not be dropped in a copy trim.

### SET-055 - Action row and section headers
**P1** * Copy * `src/app.js:2721-2724`, `src/styles.css:653`

- **Pre:** Settings → Templates.
- **Steps:**
  1. Read the three buttons under the intro and the two section headers.
- **Expect:** Buttons: "Export (JSON)", "Import (JSON)", "Reset all to default" (ids `ptExport`, `ptImport`, `ptResetAll`, all ghost style, wrapping onto a second line at narrow widths). Headers render UPPERCASE via CSS `text-transform` from the source strings "System prompts" and "Agent tools · ReAct — how the tool-using agent decides when to call each tool".
- **Watch:** The header is uppercased by CSS, so the source string must stay sentence case — a source change to caps would double-shout only if CSS is later removed.

### SET-056 - Five prompt rows, in order, with the right labels
**P0** * Functional * `src/app.js:2676 PROMPT_KEYS`, `src/app.js:2677 PROMPT_META`, `src/app.js:2718`

- **Pre:** Settings → Templates.
- **Steps:**
  1. List the rows under "SYSTEM PROMPTS" top to bottom.
- **Expect:** Exactly five, in this order: "Text answers", "Images & diagrams", "Diagram (text fallback)", "Web search", "Intent router". Each row is a collapsed `<details>` with a "▸" chevron on the left.
- **Watch:** "Images & diagrams" passes through `esc()` — it must show a single "&", not "&amp;".

### SET-057 - Expanding a row reveals reset, textarea and hint
**P0** * Functional * `src/app.js:2710 ptItemHTML()`

- **Pre:** Settings → Templates.
- **Steps:**
  1. Click the "Text answers" summary row.
- **Expect:** The chevron rotates 90°, and the body shows, in order: a right-aligned "Reset to default" button, a monospace textarea (min-height 94 px, vertically resizable, grey fill that turns white on focus), then a grey hint. The hint for "Text answers" reads "The system prompt used for every text answer, whatever model you pick — set the assistant's voice and answer style here."
- **Watch:** Rows expand independently; opening one must not collapse another.

### SET-058 - The other four hints
**P1** * Copy * `src/app.js:2679-2682`

- **Pre:** Settings → Templates, all five rows expanded.
- **Steps:**
  1. Read each hint under its textarea.
- **Expect:** Images & diagrams: "Decides whether a request becomes a diagram or an image, and how. The strict-JSON output contract is always enforced automatically, so you can safely reword the guidance." Diagram (text fallback): "Redraws a monospace/ASCII diagram when the visual planner returns an empty one." Web search: "System prompt for the web-search tool (used when “Allow external web search” is on)." Intent router: "A fast, cheap first-pass model decides whether a note message is a question for the AI, a request for a visual (image vs diagram), or a personal note — replacing the old keyword heuristics. Typing @ai always routes to the AI regardless."
- **Watch:** The Web search hint names the exact toggle label from SET-049 — the two must stay in sync.

### SET-059 - Default prompt text matches the shipped defaults
**P0** * Functional * `src/app.js:2650-2675 DEFAULT_PROMPTS`, `src/app.js:2684 promptFor()`

- **Pre:** Fresh profile (no customisations).
- **Steps:**
  1. Expand each of the five rows and read the first line of each textarea.
- **Expect:** Text answers starts "You are a precise reading assistant embedded in a source-linked research workspace."; Images & diagrams starts "You turn a reader's request into the most useful visual."; Diagram (text fallback) is the single line "Return ONLY a faithful monospace/ASCII diagram (max 24 lines) built strictly from the document context below. No prose, no explanation, no JSON, no code fences."; Web search is the single line "Search the web and answer concisely with source links."; Intent router starts "You are a fast intent router for a source-linked PDF reading app."
- **Watch:** `promptFor()` returns the default whenever the stored value is missing or blank-after-trim — so a blank stored value must still show full default text here, not an empty box.

### SET-060 - No "customized" badge on a fresh profile
**P0** * Visual * `src/app.js:2711`

- **Pre:** Fresh profile, `settings.prompts` is `{}`.
- **Steps:**
  1. Scan all twelve summary rows (5 prompts + 7 tools).
- **Expect:** No violet "customized" pill anywhere.
- **Watch:** The badge condition compares the *rendered* value against the default string — a stray trailing newline introduced by an editor would badge every row.

### SET-061 - Editing a prompt badges it only after Save and reopen
**P0** * State * `src/app.js:2711`, `src/app.js:2729`

- **Pre:** Settings → Templates.
- **Steps:**
  1. Expand "Web search" and replace its text with "Search the web. Answer in one sentence with links."
  2. Observe the summary row — no badge yet.
  3. Click "Save", reopen Settings → Templates.
- **Expect:** The "Web search" row now carries a violet "customized" pill, right-aligned in the summary. `settings.prompts` in Local Storage is `{"web":"Search the web. Answer in one sentence with links."}` — only the changed key is stored.
- **Watch:** The badge is computed at modal-build time only; it never appears live while typing. That is expected, but a tester will report it.

### SET-062 - Blanking a prompt restores the default rather than sending an empty prompt
**P0** * Edge * `src/app.js:2729`, `src/app.js:2687`

- **Pre:** "Web search" customised as in SET-061.
- **Steps:**
  1. Select all in the "Web search" textarea and delete, leaving it empty.
  2. Save, reopen Settings → Templates → "Web search".
- **Expect:** The textarea is repopulated with the default "Search the web and answer concisely with source links." and the badge is gone — `collectPrompts()` skips values that fail `.trim()`, so the key is dropped from `settings.prompts`.
- **Watch:** Leaving only spaces/newlines must behave the same. A regression that stored `""` would send an empty system prompt to the model.

### SET-063 - A whitespace-only difference still counts as customised
**P2** * Edge * `src/app.js:2711`, `src/app.js:2729`

- **Pre:** Fresh "Diagram (text fallback)" prompt.
- **Steps:**
  1. Append a single trailing space to the diagram prompt, Save, reopen.
- **Expect:** The row is badged "customized" — the comparison is exact string inequality, not trimmed inequality, and the stored value keeps the trailing space.
- **Watch:** This is the most common false-positive badge; useful when a tester swears they changed nothing.

### SET-064 - Per-row "Reset to default" restores text but keeps the badge until Save
**P0** * Functional * `src/app.js:2815`

- **Pre:** "Text answers" customised and saved (badge visible).
- **Steps:**
  1. Expand "Text answers", click "Reset to default".
  2. Note the badge, then click "Save" and reopen Settings.
- **Expect:** The textarea instantly reverts to the full default text; the "customized" badge is still shown at step 1 (it is not recomputed live); after Save and reopen the badge is gone and `settings.prompts` no longer has a `text` key.
- **Watch:** The handler maps by `data-reset` — a prompt row must map to `DEFAULT_PROMPTS[key]` and a tool row (`tool_<name>`) to `DEFAULT_TOOLS[name]` via `key.slice(5)`. A key rename that breaks the `tool_` prefix silently resets a prompt to `undefined` (empty box).

### SET-065 - "Reset all to default" clears all twelve editors
**P0** * Functional * `src/app.js:2816`

- **Pre:** At least one prompt and one tool description customised and saved.
- **Steps:**
  1. Click "Reset all to default".
  2. Expand several rows to confirm, then click "Save" and reopen Settings.
- **Expect:** All 5 prompt textareas and all 7 tool textareas hold their shipped defaults; no confirmation dialog is shown (the action is immediate); after Save, `settings.prompts` is `{}` and no badges remain.
- **Watch:** No undo exists — a destructive action with no confirm. Note it, and check that clicking it with nothing customised is a harmless no-op.

### SET-066 - The Text answers prompt actually reaches the model
**P0** * Functional * `src/app.js:1362`, `src/app.js:1372`, `src/app.js:1462`

- **Pre:** OpenRouter default with a working key.
- **Steps:**
  1. Prepend `Always begin every reply with the word BANANA.` to the "Text answers" prompt, Save.
  2. Capture a **figure region** with the screenshot tool (screenshot notes take the direct path, not the agent — `src/app.js:1359`) and ask "what does this show?".
  3. When the answer lands, expand "Show the agent's work" → "Context sent to the model".
- **Expect:** The trace's first block starts with your "Always begin every reply with the word BANANA." line, and the reply itself starts with "BANANA".
- **Watch:** On a **text selection** the agent path is used and the trace's context block holds only the user context — the system prompt is visible in the Network payload's `messages[0].content` instead.

### SET-067 - The Images & diagrams prompt is used and the JSON contract is auto-appended
**P0** * Functional * `src/app.js:1548-1551`

- **Pre:** Visuals ON, working AI.
- **Steps:**
  1. Replace the "Images & diagrams" prompt with the single line `Draw something useful.` and Save.
  2. On a note, ask "draw the experimental setup".
  3. Inspect the `/api/ai` planner request's `system` field.
- **Expect:** The system string is `Draw something useful.` followed by the appended contract beginning "Return STRICT JSON only. Put the heavy field (\"ascii\" or \"image_prompt\") FIRST…" — and the visual still renders correctly rather than erroring.
- **Watch:** The append is skipped when the custom prompt already matches `/STRICT JSON/i`; a custom prompt that says "strict json" in lowercase also suppresses it (case-insensitive) — verify a visual still renders in that case.

### SET-068 - The Diagram (text fallback) prompt is reachable
**P1** * Edge * `src/app.js:1577-1581`

- **Pre:** Visuals ON, working AI.
- **Steps:**
  1. Replace the "Images & diagrams" prompt with exactly: `Return STRICT JSON only: {"format":"ascii","ascii":"","title":"T","takeaways":[],"caption":"c"}` and Save.
  2. Ask for a diagram on a note and watch the pending card's status line.
- **Expect:** The status changes to "Drawing the diagram…", a second `/api/ai` call goes out whose `system` is the "Diagram (text fallback)" prompt, and an ascii diagram is rendered. Customise that fallback prompt too (e.g. add "Use only + and - characters.") to confirm it is the string being sent.
- **Watch:** If both calls fail the card shows "Could not render the diagram — please try again." with title "Visual unavailable".

### SET-069 - The Intent router prompt is used for classification
**P1** * Functional * `src/app.js:1293`, `src/app.js:2682`

- **Pre:** Working AI, OpenRouter default.
- **Steps:**
  1. Replace the "Intent router" prompt with `Return STRICT JSON only: {"intent":"note","visual_type":"diagram","tags":["Observation"]}` and Save.
  2. On an existing note, type "why does this matter?" (no `@ai` prefix) and send.
- **Expect:** The message is filed as a personal note with an "Observation" tag and **no** AI answer is generated. The router `/api/ai` payload's `system` is your custom string.
- **Watch:** Per the row hint, typing `@ai` must still force an AI answer regardless of the router's verdict — re-send with `@ai why does this matter?` and confirm an answer appears.

### SET-070 - The Web search prompt is used by the web tool
**P1** * Functional * `src/app.js:1407-1410 agentWeb()`

- **Pre:** "Allow external web search" ON; working AI.
- **Steps:**
  1. Replace the "Web search" prompt with `Reply with a numbered list of sources only.` and Save.
  2. Ask something that forces an outside lookup, e.g. "what has been published about BERT since this paper?".
  3. Find the `/api/ai` request that carries `"web":true`.
- **Expect:** That request's `system` field is exactly your custom string.
- **Watch:** The agent only calls `web_search` when it decides to — if it never does, re-run with an explicitly external question; the tool call also shows up in the trace as "Searching the web…".

### SET-071 - A prompt containing HTML and a `</textarea>` closer is safe
**P0** * Security * `src/app.js:2714`, `src/app.js:14 esc()`

- **Pre:** Settings → Templates.
- **Steps:**
  1. Paste `</textarea><img src=x onerror=alert(1)><b>bold?</b>` into the "Web search" prompt.
  2. Save, reopen Settings → Templates → "Web search".
- **Expect:** The textarea shows the literal string, character for character. No alert fires, no image placeholder appears, "bold?" is not bold, and the rest of the Templates pane still renders (the remaining rows and the footer buttons are intact).
- **Watch:** `esc()` escapes `& < > "` only — a value with a single quote is fine inside a textarea but must be re-verified if the markup is ever restructured to use attributes.

### SET-072 - A very long prompt saves or fails loudly
**P2** * Edge * `src/app.js:151 save()`, `src/app.js:165`

- **Pre:** Settings → Templates.
- **Steps:**
  1. Paste ~2 MB of text (e.g. a repeated paragraph) into the "Text answers" prompt.
  2. Save and watch for toasts, then reload and reopen Settings.
- **Expect:** Either the prompt persists intact, or a red toast "Storage limit reached — export your notes to keep them." appears — never a silent partial write. The modal itself must stay usable while the giant value is in the textarea (scroll, resize handle, footer reachable).
- **Watch:** `localStorage` holds the whole state as one JSON string; a huge prompt can push an otherwise-healthy library over quota and take notes down with it.

### SET-073 - Row expansion state is not remembered
**P2** * State * `src/app.js:2712`

- **Pre:** Settings → Templates with three rows expanded.
- **Steps:**
  1. Save (or Close), reopen Settings → Templates.
- **Expect:** All twelve rows are collapsed again — `<details>` is rendered without `open` and, unlike note-card disclosures (`src/app.js:2117`), its toggle state is not written to `state.ui.openDisc`.
- **Watch:** Do not confuse with the note-card "Show the agent's work" disclosures, which *are* remembered.

---

## 8. Templates: the seven agent tool descriptions

### SET-074 - Seven tool rows with snake_case titles
**P0** * Functional * `src/app.js:2690 TOOL_KEYS`, `src/app.js:2700 TOOL_META`, `src/app.js:2719`

- **Pre:** Settings → Templates, scrolled below the "AGENT TOOLS · REACT …" header.
- **Steps:**
  1. List the rows top to bottom.
- **Expect:** Exactly seven, in this order: "read_selection_context", "read_page", "search_document", "document_outline", "read_full_document", "create_visual", "web_search" — rendered literally in snake_case (the title comes from `TOOL_META`, which maps each key to its own name).
- **Watch:** A key added to `DEFAULT_TOOLS` but not to `TOOL_KEYS` never appears here and can never be edited; one added to `TOOL_KEYS` but not `TOOL_META` falls back to the raw key, which looks identical — check `agentTools()` (`src/app.js:1415`) has the same seven names.

### SET-075 - Every tool row carries the same hint
**P1** * Copy * `src/app.js:2719`

- **Pre:** All seven tool rows expanded.
- **Steps:**
  1. Read the grey hint under each textarea.
- **Expect:** All seven are identical: "What the tool-using agent reads to decide when to call this tool. Only used while the tool-using agent runs."
- **Watch:** A per-tool hint added to only some rows creates a visually ragged pane.

### SET-076 - Default tool descriptions match the shipped defaults
**P0** * Functional * `src/app.js:2691-2699 DEFAULT_TOOLS`, `src/app.js:2704 toolDesc()`

- **Pre:** Fresh profile.
- **Steps:**
  1. Expand each of the seven and compare to the source.
- **Expect:** e.g. `read_page` = "Read the full text of a specific page (use for the previous/next section or a referenced page)."; `search_document` = "Keyword-search the whole document; returns matching snippets with page numbers."; `web_search` = "Search the public web for facts beyond this document. Returns text with source links."; `create_visual` is the long paragraph starting "Generate a visual to help answer:".
- **Watch:** `read_selection_context` starts "Re-read the reader's highlighted selection…" with a straight ASCII apostrophe — a smart-quote pass would change what the model sees.

### SET-077 - Editing a tool description badges it and stores it under `prompts.tools`
**P0** * State * `src/app.js:2730-2731`, `src/app.js:2704`

- **Pre:** Settings → Templates.
- **Steps:**
  1. Replace `read_page`'s description with "Read one page of the PDF. Call this sparingly." and Save.
  2. Reopen Settings → Templates, then inspect Local Storage.
- **Expect:** The `read_page` row shows "customized"; `settings.prompts` is `{"tools":{"read_page":"Read one page of the PDF. Call this sparingly."}}` — nested under `tools`, with untouched tools omitted.
- **Watch:** `PROMPT_KEYS` does not contain `tools`, so the nested object cannot collide with a prompt key — verify after any key rename.

### SET-078 - An edited tool description reaches the agent request
**P0** * Functional * `src/app.js:1418`, `src/app.js:1440 aiAgentStep()`

- **Pre:** `read_page` customised as in SET-077 and Saved; provider OpenRouter with a working key.
- **Steps:**
  1. Ask a question on a text selection (not a screenshot).
  2. Inspect the `/api/ai` request with `"mode":"agent"` → `tools`.
- **Expect:** The entry named `read_page` has `function.description` exactly equal to your custom text; the other six carry their defaults.
- **Watch:** Every agent step re-sends the tool list, so a multi-step answer shows the same descriptions in each request.

### SET-079 - Per-tool reset maps to the right default
**P1** * Functional * `src/app.js:2815`

- **Pre:** `create_visual` and `web_search` both customised and saved.
- **Steps:**
  1. Expand `web_search`, click its "Reset to default", and compare the text to `DEFAULT_TOOLS.web_search`.
  2. Confirm `create_visual` is untouched. Save and reopen.
- **Expect:** Only `web_search` reverts; after Save only `create_visual` still carries a badge and `settings.prompts.tools` has just that one key.
- **Watch:** The handler slices five characters off `tool_` — a tool key that itself begins with `tool_` would resolve to the wrong default.

### SET-080 - Blanking a tool description restores its default
**P1** * Edge * `src/app.js:2730`, `src/app.js:2707`

- **Pre:** `document_outline` customised and saved.
- **Steps:**
  1. Clear its textarea completely, Save, reopen.
- **Expect:** The default "List detected section headings with their page numbers to navigate the paper." is shown and the badge is gone; the agent payload carries the default again.
- **Watch:** An empty tool description sent to the provider is a hard error on some endpoints — the fallback must never send `""`.

### SET-081 - Tool descriptions are irrelevant on the non-agent path
**P2** * State * `src/app.js:1359`, `src/app.js:1244`

- **Pre:** Several tool descriptions customised.
- **Steps:**
  1. Ask a question on a **screenshot** note and inspect the `/api/ai` payload.
- **Expect:** No `tools` array and no `mode:"agent"` — the direct vision path is used, so tool descriptions do not appear anywhere in the request.
- **Watch:** Testers may report "my tool edit did nothing" after testing only on screenshot notes.

---

## 9. Prompt export and import

### SET-082 - Export downloads a fixed-name JSON with the right shape
**P0** * Functional * `src/app.js:2734 exportPrompts()`

- **Pre:** Settings → Templates on a fresh profile.
- **Steps:**
  1. Click "Export (JSON)".
  2. Open the downloaded file in a text editor.
- **Expect:** File name `reading-workspace-prompts.json`; a green toast "Exported prompt templates."; the modal stays open. The JSON is pretty-printed with `"app": "Source-Linked AI Reading Workspace"`, `"kind": "prompt-templates"`, `"schema": 2`, an ISO `exportedAt`, a `prompts` object with all **5** keys and a `tools` object with all **7** keys — every value present even when it equals the default.
- **Watch:** The download is a plain `<a download>` click, **not** the Save As picker used for notes (`saveAsFile()`, `src/app.js:2503`) — so even in Chrome/Edge no OS dialog appears and repeat exports pile up as "(1)", "(2)" copies.

### SET-083 - Export captures unsaved edits
**P1** * Edge * `src/app.js:2737-2738`

- **Pre:** Settings → Templates.
- **Steps:**
  1. Type "DRAFT-ONLY" at the top of the "Intent router" prompt but do **not** Save.
  2. Click "Export (JSON)" and open the file.
  3. Click "Close" (discarding the edit) and reopen Settings.
- **Expect:** The exported `prompts.router` starts with "DRAFT-ONLY", while the app itself has no customisation and shows no badge. Export reads the live textareas, not stored state.
- **Watch:** This is a useful "draft a prompt, park it in a file" workflow — do not "fix" it to read stored state.

### SET-084 - Export never contains a key or note content
**P0** * Security * `src/app.js:2736`

- **Pre:** An API key saved in `#kOpenrouter`; several notes on the document.
- **Steps:**
  1. Export prompts and search the file for the key string, for "sk-", and for any note text.
- **Expect:** Zero matches — the export object holds only `app`, `kind`, `schema`, `exportedAt`, `prompts`, `tools`.
- **Watch:** Prompt files are the thing users share on forums; a leak here is a credential leak.

### SET-085 - Round trip: export defaults, import them back
**P0** * Functional * `src/app.js:2746 importPrompts()`

- **Pre:** Fresh profile; a `reading-workspace-prompts.json` exported from it.
- **Steps:**
  1. Click "Import (JSON)", pick that file.
  2. Read the toast, then click "Save" and reopen Settings → Templates.
- **Expect:** Toast reads exactly "12 prompts imported — review and press Save." (5 prompts + 7 tools). After Save, no row is badged and `settings.prompts` is `{}` — `collectPrompts()` drops values equal to the defaults.
- **Watch:** The pluralisation branch is `n === 1 ? '' : 's'` — a single-prompt file must read "1 prompt imported — review and press Save."

### SET-086 - Round trip: export customisations, reset, re-import
**P0** * Functional * `src/app.js:2734`, `src/app.js:2746`

- **Pre:** "Text answers" and `search_document` both customised and saved.
- **Steps:**
  1. Export. Click "Reset all to default", Save, and confirm both badges are gone.
  2. Reopen Settings → Templates → "Import (JSON)", pick the exported file, Save, reopen.
- **Expect:** Both rows are badged "customized" again with the exact text from before, and `settings.prompts` holds both `text` and `tools.search_document`.
- **Watch:** Import writes into the textareas only — closing instead of saving at step 2 must leave the app unchanged (verify once).

### SET-087 - Import does nothing until Save
**P0** * State * `src/app.js:2753-2755`

- **Pre:** A prompts file with visibly different text.
- **Steps:**
  1. Import it, read the toast, then click "Close".
  2. Reopen Settings → Templates.
- **Expect:** All rows hold their previous values; nothing was written to Local Storage.
- **Watch:** The toast says "review and press Save" precisely because of this — the copy and the behaviour must stay consistent.

### SET-088 - Import accepts a flat prompts object
**P1** * Edge * `src/app.js:2752`

- **Pre:** Create a file `flat.json` containing exactly `{"text":"FLAT TEXT PROMPT","tools":{"read_page":"FLAT TOOL"}}`.
- **Steps:**
  1. Import it.
- **Expect:** Toast "2 prompts imported — review and press Save."; the "Text answers" textarea shows "FLAT TEXT PROMPT" and `read_page` shows "FLAT TOOL" — the reader falls back to `obj` itself when there is no `prompts` wrapper, and finds `tools` at either level.
- **Watch:** Keys that are not in `PROMPT_KEYS` / `TOOL_KEYS` are ignored silently and do not count toward `n`.

### SET-089 - Import rejects unusable files with the right copy
**P0** * Edge * `src/app.js:2755-2756`

- **Pre:** Settings → Templates.
- **Steps:**
  1. Import a valid JSON with no matching keys, e.g. `{"hello":"world"}`.
  2. Import a `.notes.json` exported from the Storage tab.
  3. Import a non-JSON file (rename a PDF to `.json`, or pick a `.txt`).
  4. Open the picker and press Cancel.
- **Expect:** (1) and (2): a red toast "No matching prompts in that file." (2) is a *notes* file, whose top-level keys never match, so it must be rejected rather than silently mangling prompts. (3) a red toast beginning "Could not read that JSON: " with the parser message appended. (4) nothing at all — no toast, no change, modal still open.
- **Watch:** A non-string value (`{"prompts":{"text":123}}`) must be skipped by the `typeof === 'string'` guard and counted as 0.

### SET-090 - Import with a wrong-type value for `tools`
**P2** * Edge * `src/app.js:2752-2754`

- **Pre:** Create `{"prompts":{"web":"OK"},"tools":"not-an-object"}`.
- **Steps:**
  1. Import it.
- **Expect:** Toast "1 prompt imported — review and press Save."; the "Web search" textarea updates; no crash, and no tool row changes (indexing a string by a tool name yields `undefined`, which fails the `typeof` guard).
- **Watch:** A `tools` array (`[]`) must behave the same way.

### SET-091 - Import a huge prompts file
**P2** * Perf * `src/app.js:2751`

- **Pre:** Build a prompts JSON where each of the 12 values is ~200 KB.
- **Steps:**
  1. Import it and watch the modal.
- **Expect:** The import completes (the file read is awaited, so the UI may briefly freeze), the toast reports 12, and the twelve textareas remain scrollable and editable. Saving afterwards may hit the storage-limit toast from SET-072 — either outcome is acceptable, silence is not.
- **Watch:** There is no size cap on prompt import (unlike notes import, which caps at `IMP_TEXT_CAP`, `src/app.js:2291`).

---

## 10. Storage tab

### SET-092 - Browser mode: layout and copy
**P0** * Copy * `src/app.js:2789-2802`

- **Pre:** Fresh profile (`settings.storage.mode === 'browser'`). Settings → Storage.
- **Steps:**
  1. Read the whole pane.
- **Expect:** Label "Notes storage"; hint "Notes are always saved in this browser. Optionally sync a portable **.notes.json** to a folder (Chrome/Edge) — great for backups, other devices, and Google Drive. Export / Import works in any browser."; then a "Choose folder…" ghost button (`#stFolder`, with a U+2026 ellipsis); then a row with "Export notes (JSON)" (`#stExport`) and "Import notes (JSON)" (`#stImport`).
- **Watch:** In browser mode `#stChange` and `#stDisconnect` must not exist in the DOM at all (the template branches on `s.storage.mode`).

### SET-093 - Choosing a folder closes the modal and discards unsaved edits
**P0** * Edge * `src/app.js:2817-2819`, `src/app.js:2332 chooseNotesFolder()` * Chromium only

- **Pre:** Chrome or Edge. Settings open.
- **Steps:**
  1. On AI & Tools, change "Your name" to "WILL BE LOST".
  2. Switch to Storage, click "Choose folder…", pick a folder and grant access.
  3. Reopen Settings.
- **Expect:** A toast "Notes will auto-save to “<folder name>”." (curly quotes) and the **whole modal closes** — so the unsaved name change is gone and the field reads its previous value.
- **Watch:** This is the second most likely way to lose settings edits (after SET-006). The close is deliberate (`if (await chooseNotesFolder()) close();`) but silently drops the other tabs' edits.

### SET-094 - Cancelling the folder picker changes nothing
**P1** * Edge * `src/app.js:2341` * Chromium only

- **Pre:** Chrome or Edge, browser mode. Settings → Storage.
- **Steps:**
  1. Click "Choose folder…" and dismiss the OS picker with Cancel / Escape.
- **Expect:** No toast (an `AbortError` is swallowed), the modal stays open, the pane still shows "Choose folder…", and unsaved edits on other tabs are intact.
- **Watch:** A picker error other than `AbortError` must toast "Could not open that folder: …" and still leave the modal open.

### SET-095 - Folder mode: layout, and turning sync off
**P0** * Functional * `src/app.js:2792-2797`, `src/app.js:2822`

- **Pre:** A notes folder already chosen (Chromium). Settings → Storage.
- **Steps:**
  1. Read the pane, then click "Turn off".
  2. Reopen Settings → Storage.
- **Expect:** Before: "Notes sync to **📁 <folder name>**" with two link-styled buttons "Change folder" (`#stChange`) and "Turn off" (`#stDisconnect`), and no "Choose folder…" button. After clicking "Turn off": the modal closes with the toast "Folder sync off — notes stay in this browser." and reopening shows the browser-mode layout again.
- **Watch:** "Turn off" also closes the modal, discarding unsaved edits (same hazard as SET-093). It writes state directly via `save()` — confirm `settings.storage` becomes `{"mode":"browser","folderName":""}`.

### SET-096 - Non-Chromium: folder sync is refused, modal stays open
**P0** * Functional * `src/app.js:2264 fsSupported()`, `src/app.js:2333` * Firefox/Safari only

- **Pre:** Firefox or Safari. Settings → Storage.
- **Steps:**
  1. Click "Choose folder…".
- **Expect:** A red toast "Folder sync needs Chrome or Edge. Use Export / Import notes instead." No OS picker; the modal stays open; unsaved edits on other tabs survive.
- **Watch:** The button must still be rendered and clickable (it is not feature-gated in the markup) — the guard lives in the handler.

### SET-097 - Export notes from the Storage tab
**P0** * Functional * `src/app.js:2820`, `src/app.js:2524 downloadNotesJSON()`

- **Pre:** Sample document active with notes. Settings → Storage.
- **Steps:**
  1. Click "Export notes (JSON)".
- **Expect:** A file downloads named after the active document with every character outside `[\w.\- ]` replaced by `_` and a `.notes.json` suffix — for the bundled sample that is exactly `BERT _ Devlin et al. 2019 _NAACL_.notes.json` (`notesFileName()`, `src/app.js:2266`). Toast reads "Downloaded " + that same file name, and the **modal stays open** (unlike the folder buttons).
- **Watch:** This path always downloads — it never opens the Save As picker, even in Chrome, unlike the reader's own Save button (`saveNotesNow()`, `src/app.js:2607`).

### SET-098 - Import notes from the Storage tab replaces this document's notes
**P0** * Functional * `src/app.js:2821`, `src/app.js:2533 importNotesJSON()`

- **Pre:** Active document has 3 notes; a `.notes.json` exported earlier with 8 notes for the same document. Settings → Storage.
- **Steps:**
  1. Click "Import notes (JSON)" and pick the file.
- **Expect:** Toast "8 notes imported."; the modal stays open; the notes panel behind the modal already shows the imported notes (`applyNotesJSON` calls `render()`). This entry point **replaces** (no merge) the active document's notes.
- **Watch:** Cancelling the picker does nothing. An unreadable file toasts "Could not read that JSON: …"; a JSON with no `annotations` array toasts "That file has no notes to import."

### SET-099 - The Storage tab reflects folder state chosen elsewhere
**P1** * State * `src/app.js:2792`, `src/app.js:2265 storageCfg()`

- **Pre:** Chromium. Sync folder set from a different entry point (e.g. the reader Save flow).
- **Steps:**
  1. Open Settings → Storage.
- **Expect:** Folder mode with the correct folder name — the pane is rebuilt from `state.settings.storage` on every open, never cached.
- **Watch:** After clearing site data (which drops the IndexedDB directory handle) the pane may still claim folder mode while writes silently fail; confirm the name shown matches the folder that actually receives the file.

### SET-100 - No API keys leak into any exported artefact
**P0** * Security * `src/app.js:2553 exportSelfContainedHTML()`, `src/app.js:2524`

- **Pre:** Save a recognisable key such as `sk-or-v1-QATESTKEY123` in `#kOpenrouter`.
- **Steps:**
  1. Export notes (JSON) from the Storage tab.
  2. Use "Share as HTML" to build an `.annotated.html`.
  3. Search both files for `QATESTKEY123`, for `sk-or-`, and for `"keys"`.
- **Expect:** Zero matches in both. The share bundle carries only `readOnly`, `name`, `sha`, `pdfB64` and `notes`; the shared file boots from `defaultState()` (`src/app.js:3284`), so it starts with empty keys.
- **Watch:** Confirm the key IS present in `localStorage.srw_state_v1` on the authoring machine — that is by design and matches the hint in SET-026 — but must never travel in a file.

---

## 11. Layout, responsive, accessibility, security

### SET-101 - Tall panes scroll inside the modal and the footer stays reachable
**P1** * Visual * `src/styles.css:368-369`, `src/styles.css:383`

- **Pre:** A browser window about 700 px tall. Settings → Templates (all twelve rows collapsed).
- **Steps:**
  1. Scroll inside the modal to the bottom.
  2. Expand two long prompts and scroll again.
- **Expect:** The panel is capped at `max-height:90vh` and scrolls internally; the page behind does not scroll. The footer with "Close" / "Save" is **not** sticky — it sits at the end of the scrollable content, so the tester must scroll to the bottom to reach "Save".
- **Watch:** With every row expanded the scroll distance to "Save" is long; that is the current design, but a broken `max-height` would push the footer off-screen entirely with no way to save.

### SET-102 - Settings on a phone-width viewport
**P1** * Visual * `src/styles.css:544`, `src/styles.css:600`, `src/styles.css:548`

- **Pre:** Device emulation at 390×844 (iPhone), library drawer closed.
- **Steps:**
  1. Tap the "Show library" toggle in the reader toolbar to open the left drawer.
  2. Scroll to the drawer bottom and tap the gear.
  3. Open each tab, type into a prompt textarea, and rotate to landscape.
- **Expect:** The drawer is a fixed overlay above a scrim (`z-index:60` / `55`); the modal (`z-index:120`) renders above both. All inputs and textareas render at 16 px here, so iOS does not zoom the page on focus. The modal never causes horizontal page scroll at 390 px or at 360 px. Rotating mid-edit keeps the typed text.
- **Watch:** The inline model inputs have `min-width:190px` and sit inside a `.hint` line — check they wrap onto new lines rather than pushing the panel wider than the viewport.

### SET-103 - Resizing the window mid-edit
**P2** * Edge * `src/styles.css:367-369`

- **Pre:** Settings open on Templates with a long prompt expanded and half-typed.
- **Steps:**
  1. Drag the window from wide to ~500 px and back; cross the 1100 / 820 / 560 px breakpoints.
- **Expect:** The modal re-centres, the panel narrows to `max-width:100%`, textarea content and caret position survive, and no pane is left half-rendered.
- **Watch:** The modal is never rebuilt on resize, so any layout damage here is pure CSS.

### SET-104 - Keyboard and screen-reader gaps in the modal
**P2** * A11y * `src/app.js:2762-2763`, `src/app.js:2765`

- **Pre:** Settings open; use Tab only, no mouse.
- **Steps:**
  1. Tab from the moment the modal opens and note the focus path.
  2. Try to reach and activate the "✕" with the keyboard.
  3. Tab past the "Save" button.
- **Expect:** Document the current behaviour: focus is **not** moved into the modal on open, there is no focus trap, no `role="dialog"` / `aria-modal`, and the "✕" is a `<span class="icon-btn">` — not focusable and not activatable by Enter. "Close" and "Save" are real buttons and do work; Tab past "Save" moves into the page behind the backdrop.
- **Watch:** Keyboard-only users can still close via "Close"; if `#mClose` becomes a `<button>`, re-check that it does not gain a focus ring that breaks the header layout.

### SET-105 - Every settings-driven value ends up in the request, and nothing else does
**P0** * Security * `src/app.js:1244-1272`, `src/app.js:1442`

- **Pre:** A key saved, compat base URL set, both toggles ON, provider OpenRouter.
- **Steps:**
  1. Ask a question and inspect every outgoing request in the Network tab.
- **Expect:** Requests go only to same-origin `/api/ai` and `/api/ai-image`, always POST, with the key in the JSON body (never in the URL or a query string). The body contains exactly `provider`, `mode`/`system`/`user`/`image`/`messages`/`tools`, `web`, `model`, `maxTokens`, `userKey`, `baseUrl` — no note text beyond the built context, no library listing, no other settings.
- **Watch:** The key appears in the DevTools payload view by design (it is the user's own key going to their own proxy) — the check is that it never appears in a URL, a `GET`, or a third-party origin.

---

## Coverage map
| Code or element | Checks |
|---|---|
| `openSettings()` src/app.js:2760 | SET-001, SET-002, SET-009, SET-017 |
| `#mClose` / `#mCancel` / mask click src/app.js:2809-2811 | SET-003, SET-004, SET-005, SET-006, SET-007, SET-011 |
| `#mSave` handler src/app.js:2823-2841 | SET-010, SET-012, SET-013, SET-014, SET-015, SET-016 |
| gear wiring src/app.js:3065 | SET-001, SET-002, SET-008 |
| `applyReadOnly()` src/app.js:3294 | SET-018 |
| `.settab` handler src/app.js:2814 | SET-019, SET-020, SET-021, SET-022, SET-023, SET-024 |
| `.def-radio` handler src/app.js:2812 | SET-028, SET-029, SET-030 |
| `activeProvider()` src/app.js:1236 / `keyFor()` src/app.js:1237 | SET-031, SET-032, SET-035 |
| `kOpenrouter` / `kCompat` src/app.js:2771,2777 | SET-033, SET-034, SET-035, SET-100 |
| `cBase` src/app.js:2776 + `s.compatBaseUrl` src/app.js:2827 | SET-041, SET-042, SET-043 |
| `mOpenrouter` / `mOpenrouterImg` / `mOpenrouterRouter` src/app.js:2771 | SET-036, SET-037, SET-038, SET-039, SET-040 |
| `mCompat` / `mCompatImg` / `mCompatRouter` src/app.js:2778 | SET-036, SET-037, SET-031 |
| `DEFAULT_MODELS` src/app.js:50 | SET-036, SET-037 |
| `actorName` / `actorInit` src/app.js:2781 + save src/app.js:2834-2836 | SET-044, SET-045, SET-046, SET-047, SET-048 |
| `tgVis` / `tgWeb` src/app.js:2783-2784, handler src/app.js:2813 | SET-049, SET-050, SET-051, SET-052, SET-053 |
| `agentTools()` src/app.js:1415 | SET-051, SET-052, SET-053, SET-078 |
| `templatesPaneHTML()` src/app.js:2717 | SET-054, SET-055, SET-056, SET-074 |
| `ptItemHTML()` src/app.js:2710 | SET-057, SET-060, SET-061, SET-063, SET-071, SET-073, SET-075 |
| `DEFAULT_PROMPTS` src/app.js:2650 / `PROMPT_META` src/app.js:2677 | SET-056, SET-057, SET-058, SET-059 |
| `promptFor()` src/app.js:2684 | SET-059, SET-062, SET-066, SET-067, SET-068, SET-069, SET-070 |
| `collectPrompts()` src/app.js:2727 | SET-008, SET-014, SET-061, SET-062, SET-063, SET-077, SET-085 |
| `[data-reset]` handler src/app.js:2815 | SET-064, SET-079 |
| `#ptResetAll` src/app.js:2816 | SET-065, SET-086 |
| `exportPrompts()` src/app.js:2734 | SET-082, SET-083, SET-084, SET-086 |
| `importPrompts()` src/app.js:2746 | SET-085, SET-086, SET-087, SET-088, SET-089, SET-090, SET-091 |
| `TOOL_KEYS` / `DEFAULT_TOOLS` / `TOOL_META` src/app.js:2690-2703 | SET-074, SET-076 |
| `toolDesc()` src/app.js:2704 | SET-077, SET-078, SET-080, SET-081 |
| `askAI()` src/app.js:1351 / `askAIAgent()` src/app.js:1458 | SET-038, SET-066, SET-081 |
| `generateVisual()` src/app.js:1535 | SET-040, SET-052, SET-067, SET-068 |
| `routeMessage()` src/app.js:1282 / `aiClassify()` src/app.js:1264 | SET-039, SET-069 |
| `agentWeb()` src/app.js:1407 | SET-070 |
| `chipsFor()` src/app.js:1340 | SET-051 |
| Storage pane markup src/app.js:2789-2802 | SET-092, SET-095, SET-099 |
| `chooseNotesFolder()` src/app.js:2332, `#stFolder`/`#stChange` src/app.js:2817-2819 | SET-093, SET-094, SET-096 |
| `#stDisconnect` src/app.js:2822 | SET-095 |
| `#stExport` src/app.js:2820 → `downloadNotesJSON()` src/app.js:2524 | SET-097, SET-100 |
| `#stImport` src/app.js:2821 → `importNotesJSON()` src/app.js:2533 | SET-098 |
| `defaultState()` src/app.js:54 / `migrateState()` src/app.js:76 | SET-028, SET-036, SET-041, SET-050, SET-060 |
| `save()` src/app.js:151 | SET-012, SET-072, SET-091 |
| `esc()` src/app.js:14 | SET-048, SET-056, SET-071 |
| `api/ai.js` guards :91-98, quota :33 | SET-032, SET-042, SET-043 |
| `.modal` / `.settabs` / `.pt-item` CSS src/styles.css:366-388, 630-653 | SET-024, SET-057, SET-101, SET-102, SET-103 |
| breakpoints src/styles.css:538, 544, 600, 609 | SET-024, SET-102, SET-103 |
| modal a11y (no dialog role, span `#mClose`) src/app.js:2762-2765 | SET-104 |
| request surface src/app.js:1244-1272, 1442 | SET-035, SET-105 |

## Deliberately not covered here
- The sidebar Storage meter, library tree, and document switching — covered in **03 app shell and library**.
- Folder-sync mechanics themselves (auto-write debounce, permission re-prompts, `.notes.json` file naming, cross-device merge, `maybeOfferFolderNotes`) — covered in **10 storage and persistence**; this document only checks the Settings→Storage tab's controls and their effect on the modal.
- Note import/export correctness (annotation sanitisation, merge-by-id, sha mismatch confirm) — covered in **10 storage and persistence** and **11 share and export**.
- The self-contained `.annotated.html` build and its read-only viewer — covered in **11 share and export**; only the key-leak check (SET-100) and the hidden gear (SET-018) belong here.
- AI answer quality, the ReAct loop's step budget, trace rendering, streaming, retry and re-ask — covered in **08 AI and agent**; this document only proves the *configured* prompt/model/tool text reaches the request.
- Visual generation UI (image framing, approximation badge, ascii rendering) — covered in **08 AI and agent**; only the prompt plumbing is checked here.
- The `@ai` mention composer, note routing UX and tag pills — covered in **07 notes panel**.
- OCR settings and prompts — there are none; OCR is covered in **09 OCR**.
- The export-to-PDF view (`openExport()`, `src/app.js:2846`) and its include/layout options — covered in **11 share and export**.
