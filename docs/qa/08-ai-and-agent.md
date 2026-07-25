# 08 - AI: providers, intent router, ReAct agent, visuals & rendering

> Manual QA for everything the AI touches: which provider and key a request uses, the fast intent router, the two answer paths (direct and tool-calling ReAct), all seven agent tools, the "Show the agent's work" trace, provenance chips, generated images and ASCII diagrams, the markdown/LaTeX/code render stack, `@ai` mentions, and every AI error and quota state.

| | |
|---|---|
| **ID prefix** | AI |
| **Scope** | `activeProvider` / `keyFor` / `pickImageProvider`; the `/api/ai` and `/api/ai-image` request envelopes and every server-side guard; the intent router (`routeMessage`, `parseRoute`, `routeAndAct`) and its keyword fallback (`isVisualRequest`); the direct ask path (`askAI`, `buildContext`, `retrievePassages`); the ReAct loop (`askAIAgent`, `aiAgentStep`, `agentTools`, `runAgentTool`) and all seven tools; the trace disclosure (`traceHTML`); provenance chips (`chipsFor`, `agentChips`, `chipRow`) and the `.prov` disclosure; generated visuals (`generateVisual`, `visualContext`, `stripJson`, `aiImage`); the render stack (`mdRich`, `mdLite`, `mdInline`, `richSegments`, `protectMath`, `codeBlockHTML`, MathJax loading); `@ai` mention highlighting (`attachMentions`); AI error copy (`errHint`) and the shared-key quota message. |
| **Primary code** | `src/app.js:1234-1298` (providers + router), `src/app.js:1299-1385` (context + direct ask), `src/app.js:1386-1510` (agent loop + tools), `src/app.js:1511-1598` (visuals + error hints), `src/app.js:1599-1677` (mentions + routing), `src/app.js:1794-1831` (message rendering), `src/app.js:1939-2082` (trace + render stack), `api/ai.js`, `api/ai-image.js`, `app.html:106-123`, `src/styles.css:203-274, 305-324, 619-630` |
| **Checks** | 130 |

**Standing pre-conditions** (assume for every check unless the check overrides them): desktop Chromium, window > 1100 px, both side panels expanded, the app served **with the serverless functions running** (`vercel dev`, or the deployed preview - see `00-test-plan.md` §4.2; a plain static server has no `/api` and every AI check fails by design). The bundled sample **"BERT — Devlin et al. 2019 (NAACL).pdf"** is open, all 16 pages have finished background text extraction (wait ~5 s after load), Settings → AI & Tools is at its shipped defaults (Default = **OpenRouter**, no BYO key, **both** tool toggles ON), and Templates are unmodified. "Fresh profile" means `localStorage` key `srw_state_v1` cleared and the page reloaded.

**Tooling you will need constantly:** DevTools → **Network**, filtered to `ai`. Every AI action produces one or more `POST /api/ai` (and possibly `/api/ai-image`) requests; the **Payload** tab is the only way to see what the app actually sent. Keep it open for the whole run.

**A note on model non-determinism.** The model's *wording* is never a pass criterion. Only assert on what the app controls: the request payload, the status ladder, chips, trace structure, format decisions, and copy that comes from our source. Where a check depends on the model choosing a specific tool, it says so and gives a prompt that reliably provokes it - if the model refuses twice, mark the check **Blocked**, not Failed, and re-run against a different text model.

## Contents
- [1. Provider selection, BYO keys & the request envelope](#1-provider-selection-byo-keys--the-request-envelope) - 11 checks
- [2. The intent router](#2-the-intent-router) - 12 checks
- [3. The non-agentic ask path (screenshots)](#3-the-non-agentic-ask-path-screenshots) - 11 checks
- [4. The ReAct agent loop](#4-the-react-agent-loop) - 14 checks
- [5. The seven agent tools](#5-the-seven-agent-tools) - 15 checks
- [6. The agent trace UI](#6-the-agent-trace-ui) - 10 checks
- [7. Provenance chips & the sources disclosure](#7-provenance-chips--the-sources-disclosure) - 10 checks
- [8. Generated visuals: images & ASCII diagrams](#8-generated-visuals-images--ascii-diagrams) - 15 checks
- [9. Markdown, LaTeX & fenced-code rendering](#9-markdown-latex--fenced-code-rendering) - 15 checks
- [10. @ai mentions](#10-ai-mentions) - 6 checks
- [11. AI errors, quota & degraded states](#11-ai-errors-quota--degraded-states) - 11 checks

---

## 1. Provider selection, BYO keys & the request envelope

### AI-001 - A fresh profile answers as "OpenRouter"
**P0** * State * `src/app.js:1236 activeProvider()`, `src/app.js:57 defaultState()`, `src/app.js:49 PROVIDER_LABEL`

- **Pre:** Fresh profile.
- **Steps:**
  1. Select a sentence in the abstract on page 1, click **"✦ Ask AI"** in the popover.
  2. Type `What is the main claim here?` and press Enter.
  3. Wait for the answer.
- **Expect:** The reply's author name reads exactly **"OpenRouter"**. Its avatar is an indigo circle (`.avatar.openrouter`, `#6566F1`) with a white node/arrow glyph, and hovering the avatar shows the native tooltip **"OpenRouter"**. The `POST /api/ai` payload contains `"provider":"openrouter"`.
- **Watch:** `migrateState()` (`src/app.js:108-109`) force-resets any legacy provider to `openrouter` once, via `_orDefaulted`. If someone re-runs that migration on every load, a user who deliberately picked the compatible provider silently gets bounced back to OpenRouter.

### AI-002 - The `/api/ai` text envelope carries exactly the nine expected fields
**P0** * Functional * `src/app.js:1244 aiText()`

- **Pre:** Default settings, no BYO key.
- **Steps:**
  1. Capture a figure with the screenshot tool (this forces the **non-agent** path), ask `Summarise this figure.`
  2. In Network → the `POST /api/ai` → **Payload**, read the JSON keys.
- **Expect:** Keys present: `provider`, `system`, `user`, `image`, `web`, `model`, `maxTokens`, `baseUrl`. `userKey` is **absent** (it is `undefined` when no key is stored, so `JSON.stringify` drops it). `web` is `true` (the web toggle ships on). `model` is `"openai/gpt-5.4"`. `baseUrl` is `"https://api.openai.com/v1"` even for OpenRouter (harmless - the server ignores it for `provider:"openrouter"`).
- **Watch:** `baseUrl` is sent unconditionally. If a future change starts trusting `baseUrl` for OpenRouter too, this stale default silently redirects every request. Also confirm `system` is the full Templates → "Text answers" prompt, not an empty string.

### AI-003 - Switching the default provider changes the label, the avatar and the payload
**P1** * State * `src/app.js:2824 openSettings() save`, `src/app.js:1715 actorAvatar()`

- **Pre:** At least one existing OpenRouter answer in the thread.
- **Steps:**
  1. Settings → AI & Tools → click **"Default"** next to **"OpenAI-compatible API"** → **Save**.
  2. Ask a new question on any text selection.
- **Expect:** The new reply is authored **"OpenAI-compatible"**; the payload has `"provider":"compat"` and `"model":"gpt-5.4"`. The **older** reply keeps its own stored `provider` and still reads "OpenRouter" - past answers are never relabelled.
- **Watch:** `PROVIDER_LABEL` has exactly two entries (`src/app.js:49`); any provider value not in it falls back to the string **"AI"**. A relabelling regression shows up as historic answers suddenly authored "AI".

### AI-004 - The compatible provider without a key is refused with exact copy
**P0** * Copy * `api/ai.js:91`, `src/app.js:1594 errHint()`

- **Pre:** Default = OpenAI-compatible, **API key field empty**, Base URL `https://api.openai.com/v1`.
- **Steps:**
  1. Ask any question on a text selection.
- **Expect:** The reply card shows a red line beginning "⚠ " followed by, verbatim: **"The OpenAI-compatible provider needs your own API key (add it in Settings → AI & Tools). The site's shared demo key only works with OpenRouter."** (curly apostrophe in "site's", arrow character "→"). An error toast carries the same text. HTTP status is **400**.
- **Watch:** This is the guard that stops the server's key being forwarded to a caller-named host. If it ever returns 200, that is an **S1**. `errHint()` must not rewrite this string - it only matches `/no .*key available/i` and network errors.

### AI-005 - A BYO key is sent per-request and only per-request
**P0** * Functional * `src/app.js:1237 keyFor()`, `src/app.js:1247`

- **Pre:** Default = OpenRouter.
- **Steps:**
  1. Settings → paste `sk-or-qa-test-key-12345` into the OpenRouter key field → Save.
  2. Ask a question. Inspect the `POST /api/ai` payload, then the **response** body and headers.
  3. Reopen Settings and inspect the key input.
- **Expect:** The payload contains `"userKey":"sk-or-qa-test-key-12345"`. The response body contains **no** key. The Settings field is `type="password"` (dots, not plain text) and holds the same value. Leading/trailing spaces you paste are trimmed (`keyFor` trims, and Save trims).
- **Watch:** The key must appear in **no other** request - check every entry in the Network tab including `/api/ai-image` (where it is expected) and analytics (`/_vercel/insights`, where it must never appear). A key in any exported artefact is an **S1** (see `13-security-and-privacy.md`).

### AI-006 - A whitespace-only key behaves as no key
**P1** * Edge * `src/app.js:1237 keyFor()`, `api/ai.js:87`

- **Pre:** Default = OpenRouter.
- **Steps:**
  1. Settings → type three spaces into the OpenRouter key field → Save → reopen Settings.
  2. Ask a question and inspect the payload.
- **Expect:** The stored key is empty (Save trims), the payload has **no** `userKey`, and the request succeeds on the shared server key. No error, no "no key" message.
- **Watch:** `keyFor()` trims and `|| undefined` drops the field; if a refactor sends `""` instead, `api/ai.js:87` still treats it as falsy - but a change to `!== undefined` there would send an empty Bearer token and produce an opaque provider 401.

### AI-007 - A non-allowlisted custom endpoint is refused, with different copy per endpoint
**P1** * Copy * `api/ai.js:22,98`, `api/ai-image.js:12,53`

- **Pre:** Default = OpenAI-compatible, key = any non-empty string.
- **Steps:**
  1. Settings → Base URL = `https://evil.example.com/v1` → Save.
  2. Ask a text question. Note the error.
  3. Ask for a picture (e.g. `draw a picture of the transformer encoder`) so the image endpoint is reached. Note that error.
- **Expect:** Text: **"That endpoint isn't a recognized OpenAI-compatible provider. Use a known provider, or self-host PairedX to point at any endpoint (including a local model)."** Image: the same sentence but ending **"…to point at any endpoint."** - **without** the parenthetical. Both are HTTP 400 and neither request ever leaves the function toward `evil.example.com`.
- **Watch:** The allowlist is a `Set` of 12 hostnames (`api.openai.com`, `api.together.xyz`, `api.together.ai`, `api.groq.com`, `api.mistral.ai`, `api.deepinfra.com`, `api.fireworks.ai`, `api.perplexity.ai`, `api.x.ai`, `api.deepseek.com`, `generativelanguage.googleapis.com`, `openrouter.ai`). Adding an entry to one file and not the other is the regression to look for. `http://127.0.0.1` and any DNS name resolving to a private address must both fail here - see `13-security-and-privacy.md`.

### AI-008 - A plain-HTTP base URL is refused before the allowlist is consulted
**P1** * Functional * `api/ai.js:97`, `api/ai-image.js:52`

- **Pre:** Default = OpenAI-compatible, key non-empty.
- **Steps:**
  1. Base URL = `http://api.openai.com/v1` (allowlisted host, wrong scheme) → Save → ask a question.
- **Expect:** **"Custom endpoints must use HTTPS."** - 400. The fact that the host *is* allowlisted must not rescue it.
- **Watch:** Order matters: the HTTPS test runs first (`api/ai.js:97` before `:98`). If a refactor reorders them, an `http://` allowlisted host would be proxied in the clear.

### AI-009 - The model name in Settings is the one shown in the provenance line
**P1** * Functional * `src/app.js:1354 askAI()`, `src/app.js:1811 msgCard()`

- **Pre:** Default = OpenRouter.
- **Steps:**
  1. Settings → OpenRouter "Text model" → replace with `openai/gpt-5.4-mini` → Save.
  2. Ask a question on a text selection; when the answer lands, read the grey line under it.
- **Expect:** The disclosure summary reads **"ⓘ AI-generated · openai/gpt-5.4-mini · sources"**. The payload's `model` matches. Older answers keep the model they were generated with.
- **Watch:** For the agent path the model is resolved in `askAIAgent` (`src/app.js:1460`) with a `DEFAULT_MODELS` fallback chain, but `msg.model` is stamped in `askAI` (`src/app.js:1354`) from `state.settings.models[provider]`. If a user blanks the field these can disagree - Settings restores the default on Save (`src/app.js:2828`), so the two should never diverge.

### AI-010 - The image provider always follows the active provider
**P2** * State * `src/app.js:1235 canImage`, `src/app.js:1238 pickImageProvider()`

- **Pre:** Default = OpenAI-compatible with a valid key and base URL.
- **Steps:**
  1. Ask for an illustration (`illustrate the masked language model objective`).
  2. Inspect the `POST /api/ai-image` payload.
- **Expect:** `"provider":"compat"` and `"model":"gpt-image-1"` (the compat image model) - **not** `openrouter`. The generated visual message is authored "OpenAI-compatible".
- **Watch:** `canImage` returns true for both shipped providers, so the `return 'openrouter'` fallback line (`src/app.js:1240`) is currently **unreachable**. If a third, non-image provider is ever added, that line silently sends the request to OpenRouter with the *OpenRouter* key - a cross-provider leak worth re-testing at that point.

### AI-011 - The compatible provider's avatar glyph is white on a light background
**P2** * Visual * `src/app.js:1710 providerGlyph()`, `src/app.js:1716 actorAvatar()`, `src/styles.css:205,477-483`

- **Pre:** Default = OpenAI-compatible; one answer in the thread.
- **Steps:**
  1. Look at the round avatar beside the author name "OpenAI-compatible", at 100% zoom.
- **Expect (documented defect):** The avatar carries classes `avatar ai brand compat`. There is **no** `.avatar.compat` rule in `src/styles.css`, so it falls back to `.avatar.ai` - a pale violet fill - while `providerGlyph('compat')` draws its flask glyph with `stroke="#fff"`. The glyph is therefore near-invisible. The tooltip **"OpenAI-compatible"** is still present on hover.
- **Watch:** Compare with `.avatar.openrouter` (`#6566F1`, white glyph - correct). This is the check that proves a styling fix landed; if a fix is made, update the Expect to describe the new fill and keep the tooltip assertion.

---

## 2. The intent router

### AI-012 - Every note message hits the router first, on the router model
**P0** * Functional * `src/app.js:1637 routeAndAct()`, `src/app.js:1282 routeMessage()`, `src/app.js:1264 aiClassify()`

- **Pre:** Network tab open, filtered to `ai`.
- **Steps:**
  1. Select a sentence, choose **"Note"** from the popover, type `interesting` and press Enter.
  2. Read the requests in order.
- **Expect:** Exactly **one** `POST /api/ai` fires immediately, with `"model":"openai/gpt-5.4-mini"` (the *router* model, not `openai/gpt-5.4`), `"maxTokens":220`, `"mode":"text"` and a `system` equal to the Templates → "Intent router" prompt. No second request follows (the router should classify this as `note`).
- **Watch:** The router runs **before** the comment is routed but **after** it is already saved and rendered (`src/app.js:1628-1633`), so the user's comment must appear instantly, even while the router request is in flight. If the comment only appears after the router responds, latency is leaking into the note-taking path.

### AI-013 - The router payload describes the anchor, the excerpt and the thread
**P1** * Functional * `src/app.js:1286-1292 routeMessage()`

- **Pre:** A text-selection note with one existing question and one existing answer.
- **Steps:**
  1. Type a follow-up (`and how does that compare to ELMo?`) and send.
  2. Read the router request's `user` field.
- **Expect:** It contains, in order: a line starting `The note is anchored to a text selection (page N` (plus `, <section>` when a section was detected); `Selected excerpt: """…"""` truncated at **300** characters; `Earlier in this note:` with the prior turns truncated at **500** characters; and finally `The reader just wrote: """and how does that compare to ELMo?"""`.
- **Watch:** For a screenshot note the phrase must be **"a captured figure/screenshot"**; for a document-level note (bottom composer) it must be **"the whole document"**. A wrong descriptor makes the router classify document questions as personal notes.

### AI-014 - intent "answer" produces a full AI reply
**P0** * Functional * `src/app.js:1648 routeAndAct()`, `src/app.js:1351 askAI()`

- **Pre:** Any text selection note.
- **Steps:**
  1. Type `Why do they mask 15% of tokens?` and send.
- **Expect:** The router request completes, then a second request fires and a pending AI reply appears in the thread within ~1 s of the router response. The note card's background switches to the AI tint (`.card.k-ai`, `#F2EFF8`).
- **Watch:** The pending bubble is created inside `askAI()` **before** any network call, so the "Thinking…" state must appear immediately after the router returns. A visible dead gap means the router response is being awaited twice.

### AI-015 - intent "note" leaves a personal comment and calls no model
**P0** * Functional * `src/app.js:1649 routeAndAct()`

- **Pre:** Any note.
- **Steps:**
  1. Send each of these separately, waiting for the network to settle: `interesting`, `revisit this`, `todo: check ref 12`, `my take: this is the key result`.
- **Expect:** Each becomes a plain comment with **no** AI reply and **no** second `/api/ai` request. The card stays a non-AI card (`.card.k-hl`) unless a previous answer already made it AI.
- **Watch:** This is the single most valuable router behaviour - a chatty router that answers "interesting" makes the app unusable as a note-taker. Test at least four phrasings; a regression usually shows as *some* bare reactions being answered.

### AI-016 - intent "visual" routes to the visual generator with a type hint
**P1** * Functional * `src/app.js:1647 routeAndAct()`, `src/app.js:1535 generateVisual()`

- **Pre:** Selection over the architecture description; "Enable generated visuals" ON.
- **Steps:**
  1. Send `draw the pre-training and fine-tuning pipeline as a diagram`.
  2. Then, on a new note, send `illustrate a hairpin vortex as a hand-drawn sketch`.
- **Expect:** Both produce a **generated visual** message (violet **"Generated image"** or **"Diagram"** badge), not a text answer. The first should land on the ASCII diagram; the second on an image (a `POST /api/ai-image` fires). No `mode:"agent"` request is made in either case - the router shortcuts straight past the agent.
- **Watch:** `parseRoute()` maps `visual_type` to `image` only for `/image|picture|photo|illustrat|draw|sketch|hand/i`; everything else becomes `diagram`. `generateVisual` then **forces** `plan.format` from that hint (`src/app.js:1563`), overriding the planner's own judgement.

### AI-017 - Malformed router output degrades to "answer", never to raw JSON
**P1** * Edge * `src/app.js:1273 parseRoute()`

- **Pre:** DevTools open; you will stub the router response.
- **Steps:**
  1. Override `/api/ai` responses for the router call (DevTools → Network → Request blocking is not enough; use a local `vercel dev` and temporarily return `Here you go: {"intent":"ANSWER-ish","tags":"nope"}` from `chatCall`, or use a Fetch interceptor snippet in the console).
  2. Send a question.
- **Expect:** The prose wrapper is ignored (`parseRoute` re-scans for the first `{…}` block), the unrecognised intent falls through to **`answer`**, and `tags` - not an array - is dropped to `[]`. No JSON text ever appears in the note. Same for a completely empty router response.
- **Watch:** `parseRoute` never throws: `JSON.parse` failures are caught and the regex fallback is optional. If a change makes it throw, `routeAndAct`'s `catch` turns *every* message into the keyword heuristic - subtle and easy to miss.

### AI-018 - Router tags become tag pills, capped at two
**P1** * Functional * `src/app.js:1279 parseRoute()`, `src/app.js:1646 routeAndAct()`, `src/app.js:1723 tagPills()`

- **Pre:** A note with no tags.
- **Steps:**
  1. Send `is this the same as the ELMo objective?`.
  2. Inspect the tag row on the note card.
- **Expect:** At most **two** router tags appear as pills, deduplicated against any existing tags. Unknown tag names get the default pill class (`claim` styling); known ones (`Question`, `Definition`, `Summary`, `Action item`, `Confusion`…) get their own colour via `TAG_CLASS` (`src/app.js:1230`). Each pill has a "×" remove affordance and the row ends with **"+ tag"**.
- **Watch:** Non-string or empty entries are filtered out before the `slice(0, 2)`. A router returning `["Question","Question"]` must not produce two identical pills - the `Set` in `routeAndAct` deduplicates.

### AI-019 - `@ai` overrides a "note" classification
**P0** * Functional * `src/app.js:1632,1645`

- **Pre:** Any note.
- **Steps:**
  1. Send `interesting` - confirm no AI reply (AI-015).
  2. Send `@ai interesting`.
- **Expect:** The second message *does* get an AI reply. The stored comment still displays the literal text "@ai interesting" with **@ai** rendered blue and bold; the question sent to the model has `@ai` stripped (see AI-116).
- **Watch:** `forceEngage` only upgrades `note` → `answer`. If the router says `visual`, `@ai` must **not** downgrade it to a text answer.

### AI-020 - "✦ Ask AI" forces engagement for exactly one message
**P0** * State * `src/app.js:894`, `src/app.js:1631 submitToNote()`

- **Pre:** No note selected.
- **Steps:**
  1. Select a sentence → **"✦ Ask AI"** → in the inline composer type `interesting` → Enter.
  2. In the **same** note, send a second `interesting`.
- **Expect:** The first gets an AI answer (the `askNextId` flag forces it). The second does **not** - `askNextId` is cleared on first use. Choosing **"Note"** instead of "Ask AI" must not force anything.
- **Watch:** `askNextId` is a module-level single slot. Create note A with "Ask AI", then create note B with "Note" **without** typing in A, then type in B: B must not steal A's forced ask. (Creating B sets `askNextId = null`, so A's forcing is silently lost too - document whichever behaviour you observe.)

### AI-021 - A dead router falls back to keyword heuristics, silently
**P1** * Edge * `src/app.js:1641-1644 routeAndAct()`

- **Pre:** DevTools → Network → **Block request URL** `*/api/ai*` (or go offline).
- **Steps:**
  1. Send `interesting` → observe.
  2. Send `Why is the [CLS] token used?` → observe.
  3. Send `draw the encoder stack` → observe.
- **Expect:** No error toast for the routing itself. (1) stays a personal note. (2) matches `/\?\s*$/` → an AI answer is attempted (which then fails with the network error - AI-123). (3) matches `isVisualRequest` → a visual is attempted. The fallback is invisible to the user apart from the downstream failure.
- **Watch:** The fallback lives in a `catch` around `routeMessage` only. A router that returns HTTP 200 with garbage does **not** hit the fallback (that is AI-017's path).

### AI-022 - The keyword fallback recognises natural visual phrasings
**P2** * Edge * `src/app.js:1652 isVisualRequest()`

- **Pre:** Router blocked as in AI-021.
- **Steps:**
  1. Send each on its own note: `draw the architecture`, `a picture of the encoder`, `illustrate this`, `show me a flowchart of fine-tuning`, `turn this into a diagram`.
- **Expect:** All five are treated as visual requests (a `generated_visual` message is created / attempted). The historic bug was requiring **both** a visual noun and a make-verb, which dropped `draw the architecture` and `a picture of the encoder` on the floor.
- **Watch:** Verify a negative too: `the results in figure 3 are surprising` starts with "the" + the noun "figure" and therefore **matches** `leadNoun` - it is misrouted to a visual. That false positive is expected today; it only bites while the router is unreachable.

### AI-023 - The router is skipped entirely by "Save & re-ask AI"
**P1** * Functional * `src/app.js:2165 saveAndReask()`

- **Pre:** A note with a question and an AI answer.
- **Steps:**
  1. Hover the **user's** message → click the pencil (title **"Edit"**).
  2. Change the text to `draw this as a diagram` and click **"Save & re-ask AI"**.
- **Expect:** The stale AI answer(s) directly beneath are deleted, and a **text** answer is generated - **not** a visual, because `saveAndReask` calls `askAI()` directly and never consults the router. Only one `/api/ai` request fires (no router call).
- **Watch:** The button label is exactly **"Save & re-ask AI"** and only exists on messages where `m.actor === 'you'` (`src/app.js:1790`). It must not appear on an AI answer's edit box, which shows only "Save" and "Cancel".

---

## 3. The non-agentic ask path (screenshots)

> The direct path in `askAI()` is reachable **only** for screenshot notes: every other source type with either shipped provider is handed to the ReAct agent (`src/app.js:1359`). Test this section with the screenshot tool.

### AI-024 - A screenshot question takes the direct path, with no tools
**P0** * Functional * `src/app.js:1359 askAI()`

- **Pre:** Screenshot tool armed.
- **Steps:**
  1. Drag a box around Figure 1 on page 3; the toast **"Region captured — ask the AI about it below."** appears.
  2. Type `What does this figure show?` and send.
  3. Inspect the second `POST /api/ai` payload.
- **Expect:** The payload has **no** `mode:"agent"` and **no** `tools` array; it carries `system`, `user` and a non-null `image`. Only one model request is made (plus the router call). The answer's trace contains no tool steps.
- **Watch:** If a refactor lets screenshots into the agent, the image evidence is dropped entirely (`askAIAgent` never sends `ctx.image`) and figure questions start being answered from page text alone - a silent quality collapse with no error.

### AI-025 - The captured image is sent as an inline data URL
**P0** * Functional * `src/app.js:1295 imageEvidence()`, `api/ai.js:53 chatCall()`

- **Pre:** As AI-024.
- **Steps:**
  1. In the payload, expand `image`.
- **Expect:** `{"mime":"image/png","b64":"iVBOR…"}` - mime and base64 split by `imageEvidence`'s regex. The server recomposes it into an OpenAI `image_url` part with `data:image/png;base64,…`.
- **Watch:** `imageEvidence` returns `null` unless `source_type === 'screenshot'` **and** `a.screenshot` is a `data:` URL. After a reload, screenshots are rehydrated from IndexedDB (`src/app.js:144`); if rehydration has not finished, `a.screenshot` is still the sentinel `"@idb"`, the regex misses, and the model is asked about an image it never received. Reload, then immediately ask about a screenshot, to test this race.

### AI-026 - The pending bubble on this path reads "Thinking" with no ellipsis
**P2** * Copy * `src/app.js:1805 msgCard()`

- **Pre:** As AI-024.
- **Steps:**
  1. Send a question on a screenshot note and watch the reply bubble before the answer lands.
- **Expect:** Violet text **"Thinking"** (no ellipsis) followed by three pulsing dots (`.typing i`, `@keyframes bl`, 1 s loop, 0.2 s stagger). Compare with the agent path, which shows **"Thinking…"** *with* an ellipsis (AI-036) - the difference is real: `askAI` never sets `msg.status`, so the `'Thinking'` literal fallback is used.
- **Watch:** A designer "fixing" the missing ellipsis in one place and not the other leaves the two paths inconsistent; whichever way it is resolved, both this check and AI-036 must be updated together.

### AI-027 - The user block is assembled with the documented labels, in order
**P1** * Functional * `src/app.js:1363-1371 askAI()`

- **Pre:** A screenshot note on a page whose section was detected, with a caption nearby.
- **Steps:**
  1. Ask a question, read the payload's `user` field.
- **Expect:** Blank-line-separated blocks in this order, omitting any that are empty: `SELECTED SOURCE — page N, <section> (screenshot):`; `"""[a figure/region captured as a screenshot from this page — see the attached image]"""`; `Nearby caption: …`; `Surrounding text on the page (…[SELECTION] marks where the excerpt sits…):`; `Related passages elsewhere in the document:`; `Conversation so far on this note:`; and finally `Reader's question: <text>`.
- **Watch:** For a screenshot the evidence string is the fixed placeholder above, never the raw base64 - a regression that inlines the data URL into `user` will blow past the token limit and produce a provider 400.

### AI-028 - Surrounding page text carries the `[SELECTION]` marker
**P1** * Functional * `src/app.js:1299 buildContext()`

- **Pre:** A **text**-selection note. (Temporarily force the direct path by setting `state.annotations.find(a=>a.id===state.ui.activeId).source_type='screenshot'` in the console is *not* valid - instead read this from the router payload, which uses the same `buildContext`.)
- **Steps:**
  1. Select a mid-paragraph sentence on page 4, ask a question, and read `Selected excerpt` in the **router** payload and `Immediate surrounding text` in the agent payload.
- **Expect:** Roughly 450 characters before and 450 after the selection, joined by the literal token ` [SELECTION] `. If the selection cannot be located in the cached page text, the first 900 characters of the page are used instead (no marker).
- **Watch:** The lookup uses only the first 40 characters of the selection, lowercased, after whitespace collapsing. A selection spanning a column break or a ligature-heavy line often fails to match; the fallback (page head) must still be non-empty. Empty surrounding text on a page that clearly has text means `pageTextCache` was not populated - re-check after OCR.

### AI-029 - Cross-document passages appear and rewrite the "no external sources" chip
**P1** * Functional * `src/app.js:1327 retrievePassages()`, `src/app.js:1374 askAI()`

- **Pre:** Screenshot note. Settings → turn **"Allow external web search" OFF** → Save.
- **Steps:**
  1. Ask a question containing at least one distinctive 5+ letter word that occurs elsewhere in the paper, e.g. `How does this relate to bidirectional pre-training?`.
  2. Read the payload, then open the answer's **"sources"** disclosure.
- **Expect:** The payload contains `Related passages elsewhere in the document:` with up to **three** `(page N) …snippet…` lines, none from the note's own page. The chip that would read "No external sources" instead reads **"Used related passages · no external sources"**.
- **Watch:** Terms are `[a-z]{5,}` minus a nine-word stop list (`about, which, these, their, there, would, could, should, where, while, being, across, after, before`). A short question like `why?` yields zero terms and zero passages - the chip then stays "No external sources". Also note the chip rewrite only fires when the web toggle is OFF, because with it ON the chip already reads "Used web search".

### AI-030 - The nearby caption is passed when one was captured
**P2** * Functional * `src/app.js:1366 askAI()`, `src/app.js:1323 buildContext()`

- **Pre:** A screenshot note whose `caption` field is non-empty (capture a region directly under a figure caption).
- **Steps:**
  1. Ask a question; read the payload.
- **Expect:** A line `Nearby caption: <the caption text>`. The provenance chips include both **"Used screenshot"** and **"Used nearby caption"**.
- **Watch:** `chipsFor` only adds "Used nearby caption" when `a.caption` is truthy (`src/app.js:1344`). A capture that produced no caption must show "Used screenshot" alone - a chip claiming a caption that was never sent is a provenance lie.

### AI-031 - Thread history is included but the current question is not duplicated
**P1** * Functional * `src/app.js:1316-1319 buildContext()`

- **Pre:** A screenshot note with two prior turns (your question, the AI's answer).
- **Steps:**
  1. Ask a third question; read the payload.
- **Expect:** `Conversation so far on this note:` lists the earlier turns as `OpenRouter: …` / `<your name>: …`. The **current** question appears only once, under `Reader's question:` - it is excluded from the thread by `.slice(0, -1)`.
- **Watch:** The filter drops messages that are `pending` or have empty text, so the just-created pending AI bubble is excluded *before* the slice. If a refactor pushes the pending message later, the slice would eat the last real turn instead - visible as the AI losing the immediately preceding exchange.

### AI-032 - The direct path's trace has context and final, and says no tools were needed
**P1** * Functional * `src/app.js:1372,1378 askAI()`, `src/app.js:1939 traceHTML()`

- **Pre:** Web toggle OFF; a completed screenshot answer.
- **Steps:**
  1. Click **"Show the agent's work"** under the answer.
- **Expect:** No tool count in the summary. The first line inside reads **"No tools were needed — answered directly from the context."** Step **1** is **"Context sent to the model"** and contains the system prompt **and** the user block concatenated with a blank line. Step **2** is **"Final answer"** with the answer text.
- **Watch:** On this path the trace's context step includes the *system prompt* too - the agent path's does not (`src/app.js:1471` stores only `userContext`). Testers reading both traces will notice the asymmetry; it is intended.

### AI-033 - With web search on, a third trace step explains it
**P2** * Copy * `src/app.js:1373 askAI()`

- **Pre:** Web toggle **ON** (the shipped default).
- **Steps:**
  1. Ask a screenshot question, open the trace.
- **Expect:** Between the context and the final answer there is a step titled **"Web search enabled"** whose body is exactly: **"This provider searched the web live; any outside facts and citation links came from that search."** The chips end with **"Used web search"**.
- **Watch:** This step is inserted unconditionally when the toggle is on - even if the provider ignored the plugin. It is a claim about intent, not evidence; if the underlying `plugins:[{id:'web'}]` request stops being sent (`api/ai.js:63`, OpenRouter only), the copy becomes false.

### AI-034 - An interrogative question auto-tags the note "Question"
**P2** * Functional * `src/app.js:1222 autoTag()`, `src/app.js:1379 askAI()`

- **Pre:** A note with no tags.
- **Steps:**
  1. Ask `What does this figure show?`.
  2. After the answer lands, look at the tag row.
- **Expect:** A **"Question"** pill (class `q`) appears. It is added after the answer completes, deduplicated against existing tags. A screenshot note also carries **"Screenshot"** from creation time.
- **Watch:** `autoTag` also fires on the user's comment at send time (`src/app.js:1629`), so the pill may appear before the answer. Both routes go through the same `Set`, so there must never be two "Question" pills.

---

## 4. The ReAct agent loop

### AI-035 - A text-selection question uses `mode:"agent"` with the tool list
**P0** * Functional * `src/app.js:1359,1458 askAIAgent()`, `src/app.js:1440 aiAgentStep()`

- **Pre:** Default settings, both toggles ON.
- **Steps:**
  1. Select a sentence in §3 and ask `How does this compare with what section 5 reports?`.
  2. Inspect the second `POST /api/ai` payload.
- **Expect:** `"mode":"agent"`, a `messages` array whose first element is `{"role":"system",…}` and second is `{"role":"user",…}`, and a `tools` array of **7** function definitions. No `system`/`user`/`image` top-level fields on this path.
- **Watch:** The server only branches to `agentStep` when `mode === 'agent'` **and** `Array.isArray(messages)` (`api/ai.js:101`). A payload with `mode:"agent"` but a missing `messages` array silently falls through to a plain chat call with empty prompts - the answer comes back generic and un-grounded, with no error.

### AI-036 - The status ladder walks Thinking → tool label → Gathering context
**P0** * Functional * `src/app.js:1475,1483 askAIAgent()`, `src/app.js:1427 TOOL_LABEL`

- **Pre:** A question that provokes at least one tool call, e.g. `Summarise the whole paper in three bullets.`
- **Steps:**
  1. Send it and watch the pending bubble without blinking.
- **Expect:** The violet typing line reads **"Thinking…"** first, then one of the seven tool labels while a tool runs - **"Re-reading the selection…"**, **"Reading a page…"**, **"Searching the document…"**, **"Scanning the outline…"**, **"Reading the full paper…"**, **"Creating a visual…"**, **"Searching the web…"** - then **"Gathering context…"** on each subsequent model turn. An unrecognised tool name shows **"Working…"**.
- **Watch:** Every status change calls `save()` + `render()`, so a slow tool with a busy notes list can make the panel feel janky. If the label never changes off "Thinking…", the loop is making a single call and the model is not calling tools - check that `tools` is present in the payload.

### AI-037 - Tool results are fed back with the matching `tool_call_id`
**P0** * Functional * `src/app.js:1480-1487 askAIAgent()`

- **Pre:** As AI-036.
- **Steps:**
  1. After the first tool call, inspect the **next** `POST /api/ai` payload's `messages`.
- **Expect:** The array grew by an `{"role":"assistant","content":…,"tool_calls":[…]}` entry followed by one `{"role":"tool","tool_call_id":"<the id from the call>","content":"<result>"}` per call. The ids match exactly.
- **Watch:** OpenAI-compatible endpoints reject a conversation where a `tool_calls` assistant turn is not immediately followed by a `tool` message for **every** id. If the loop ever skips one (e.g. a tool throws outside the `try`), the next step returns a provider 400 that surfaces as a raw error in the card.

### AI-038 - Parallel tool calls in one step are all executed, in order
**P1** * Edge * `src/app.js:1480 askAIAgent()`

- **Pre:** A question likely to trigger two tools at once, e.g. `Give me the outline and then the exact wording of the NSP objective.`
- **Steps:**
  1. Send it; when the answer lands open the trace.
- **Expect:** If the model emitted two `tool_calls` in one turn, the trace shows **two consecutive tool steps** with sequential numbers, and the following request contains **two** `role:"tool"` messages. The status line flickers through both labels.
- **Watch:** The loop `await`s each tool serially inside the `for…of`, so two `read_full_document` calls in one turn double the wait. There is no per-tool timeout anywhere - a hung tool hangs the whole answer with the status frozen on its label.

### AI-039 - Text emitted alongside a tool call becomes a "Model reasoning" step
**P1** * Functional * `src/app.js:1479 askAIAgent()`, `src/app.js:1950 traceHTML()`

- **Pre:** As AI-036 (some models narrate before calling a tool).
- **Steps:**
  1. Run several questions until one produces narration, then open the trace.
- **Expect:** A step labelled **"Model reasoning"** appears immediately before the tool step, containing the model's text. Whitespace-only narration is **not** recorded (the `.trim()` guard).
- **Watch:** This text is *not* shown as an answer - if a model narrates and never produces a final turn, the user only ever sees it inside the trace. That is intentional, but it means a chatty model can look silent.

### AI-040 - The loop caps at seven iterations and then forces a tool-less call
**P0** * Functional * `src/app.js:1474,1495-1500 askAIAgent()`, `api/ai.js:86`

- **Pre:** A question designed to make the model keep gathering, e.g. `Read every page and give me a per-page one-line summary.`
- **Steps:**
  1. Send it. Count the `POST /api/ai` requests with `mode:"agent"`.
  2. If the loop exhausts all seven without producing text, watch the status line and the final card.
- **Expect (intent):** at most **7** loop requests, then the status changes to **"Writing the answer…"** and a final call with **no tools** guarantees text.
- **Expect (actual, documented defect):** the forced call is made as `aiAgentStep(model, messages.concat([…]), [])` (`src/app.js:1497`) - three arguments into a four-parameter function. `provider` receives the model id, `model` receives the message array, `messages` receives `[]`, `tools` is `undefined`. The server rejects it at `api/ai.js:86` with HTTP 400 **"Unsupported provider."**, which is caught and shown in the card as **"⚠ Unsupported provider."** plus an error toast. **The "guaranteed final answer" therefore never works.**
- **Watch:** Also tracked as `ERR-073`. Because most questions resolve in 1-3 iterations, this only surfaces on long agentic runs - do not assume it is fixed just because normal questions work. Re-testing after a fix: the final call must carry the real provider, the real model, the accumulated `messages`, and `[]` for tools, and the trace must gain a **"Final synthesis"** step.

### AI-041 - An empty model turn with no tool call is nudged, not abandoned
**P1** * Edge * `src/app.js:1492 askAIAgent()`

- **Pre:** Local `vercel dev` where you can stub `agentStep` to return `{content:'', tool_calls:null}` once.
- **Steps:**
  1. Stub one empty turn, then ask a question.
- **Expect:** The loop pushes `{"role":"user","content":"Answer the question now, directly and concisely, using the context you have gathered. Do not call any tools."}` and iterates again. The user sees only the status ladder - no error, no empty bubble.
- **Watch:** The nudge counts against the seven iterations. Three consecutive empty turns therefore burn three loops and push the run toward the broken forced call (AI-040).

### AI-042 - A run that produces no text at all shows the fallback sentence
**P1** * Copy * `src/app.js:1501 askAIAgent()`

- **Pre:** Stub the forced-final call to return empty content (or fix AI-040 locally first, then stub it).
- **Steps:**
  1. Run a question that ends with `answer === ''`.
- **Expect:** The card shows, verbatim: **"The document doesn't seem to cover that — try selecting the relevant passage, or ask a more specific question."** (curly apostrophe in "doesn't", em dash). It renders as a normal answer - not red, not an error - with chips and a trace.
- **Watch:** With the AI-040 defect in place this string is currently unreachable via the forced call, because the failed call throws before it. It **is** reachable if the seventh loop iteration returns whitespace and the forced call somehow succeeds. Do not delete this check when AI-040 is fixed - it is the fix's acceptance criterion.

### AI-043 - Tool output handed to the model is capped at 50 000 characters
**P1** * Perf * `src/app.js:1485 askAIAgent()`, `src/app.js:1434 runAgentTool()`

- **Pre:** A long PDF (100+ pages) from the fixtures folder, open and fully text-extracted.
- **Steps:**
  1. Ask `Summarise the entire document.` and let the model call `read_full_document`.
  2. Inspect the following request's `role:"tool"` message length (copy it into the console and check `.length`).
- **Expect:** ≤ **50000** characters. The tool itself stops appending once it passes 48 000 and adds the literal marker `[…truncated…]` before slicing to 50 000.
- **Watch:** The double cap matters: even a tool whose own truncation is bypassed is re-sliced at the call site. A 300-page PDF must not push a multi-megabyte body through `/api/ai` - watch the request size in the Network tab (should stay well under 200 kB).

### AI-044 - The notes list follows the answer while it is being produced
**P1** * Functional * `src/app.js:1459,1509 askAIAgent()`, `src/app.js:2143-2149 render()`, `src/app.js:1201 followNoteBottom()`

- **Pre:** A long thread whose active note is taller than the notes panel.
- **Steps:**
  1. Scroll the notes list to the very bottom, then send a question.
  2. Repeat, but first scroll **up** ~200 px before sending.
- **Expect:** (1) Every status change and the final answer keep the newest content in view. (2) The list does **not** jump - `wasAtBottom` was false, so autoscroll is suppressed while you read.
- **Watch:** `state.ui.streamingId` is set at the start and cleared in `finally`. If an exception escapes before the `finally` (or two runs overlap - AI-098), the flag sticks and the panel keeps yanking to the bottom on every unrelated re-render until reload.

### AI-045 - A pending answer survives reload but never resumes
**P1** * State * `src/app.js:1355 askAI()`, `src/app.js:151 save()`

- **Pre:** Throttle to Slow 3G so the run lasts several seconds.
- **Steps:**
  1. Send a question; while the status line is still animating, reload the page.
- **Expect:** The note still shows a pending bubble with the last saved status text and animated dots - **forever**. No error, no retry. The only recovery is deleting that reply (hover → trash, title **"Delete reply"**) and asking again.
- **Watch:** This is by design (the loop lives in memory), but a pending message is indistinguishable from a live one. If a "stuck pending" cleanup is ever added at boot, this check's Expect must change. Also confirm the persisted message includes `trace` - a long trace inflates `srw_state_v1`; see `17-performance-and-limits.md`.

### AI-046 - Navigating and switching notes mid-run does not lose the answer
**P1** * State * `src/app.js:1503-1505 askAIAgent()`

- **Pre:** Slow 3G.
- **Steps:**
  1. Send a question on note A.
  2. While it runs: page to page 9, select a different note B, collapse and re-expand the notes panel, then return to A.
- **Expect:** The answer lands in **A**, complete with chips and trace, regardless of what is selected when it arrives. Note B is unaffected. The connector line redraws correctly afterwards.
- **Watch:** The loop mutates the message object captured at call time, so selection changes are safe. The risk is `render()` being called with `state.ui.activeId` pointing elsewhere while `streamingId` still points at A - the autoscroll branch requires both to match (`src/app.js:2143`), so no scroll hijack should occur while you are reading B.

### AI-047 - Rapid double-send produces two independent runs
**P1** * Edge * `src/app.js:1626 submitToNote()`, `src/app.js:2132 render()`

- **Pre:** Any note.
- **Steps:**
  1. Type a question and press Enter twice within a second.
  2. Then type the **same** text again and send it within 5 s of the first.
- **Expect:** (1) The composer clears on the first Enter, so the second Enter has an empty value and is a no-op. (2) The duplicate guard in `submitToNote` drops an identical `you`/`comment` message sent within **5000 ms**, so no second question and no second AI run. Sending the same text after 6 s **is** allowed and produces a second run.
- **Watch:** The guard compares exact text only. `What is BERT?` and `what is BERT?` are different and both go through - two parallel agent runs on one note, two pending bubbles, and whichever finishes last wins the `streamingId` clear.

### AI-048 - Switching documents mid-run makes the tools read the wrong paper
**P1** * Edge * `src/app.js:1387 ensureText()`, `src/app.js:174 pageTextCache`, `src/app.js:210`

- **Pre:** Two documents in the library; Slow 3G.
- **Steps:**
  1. Start an agent question on document A that will call `read_page` or `read_full_document`.
  2. Immediately switch to document B in the library.
  3. When the answer lands, return to A and open the trace.
- **Expect (documented risk):** `pageTextCache` and `numPages` are module-level and are reset/repopulated on document switch, so any tool that runs **after** the switch reads **document B's** text while answering a question about A. The trace will show page content that does not belong to the note's document.
- **Watch:** There is no document guard anywhere in `runAgentTool`. Verify at minimum that the app does not crash and the answer still lands on A's note. If a guard is added later, the Expect becomes "the tool returns nothing / the run aborts cleanly".

---

## 5. The seven agent tools

### AI-049 - With both toggles off the agent gets exactly five tools
**P0** * Functional * `src/app.js:1415 agentTools()`

- **Pre:** Settings → **"Enable generated visuals" OFF**, **"Allow external web search" OFF** → Save.
- **Steps:**
  1. Ask a text-selection question; inspect the payload's `tools`.
- **Expect:** Exactly five entries, in this order: `read_selection_context`, `read_page`, `search_document`, `document_outline`, `read_full_document`. Each is `{"type":"function","function":{"name":…,"description":…,"parameters":…}}`. `read_page` requires an integer `page`; `search_document` requires a string `query`; the other three take an empty object.
- **Watch:** If the model hallucinates a tool name anyway, `runAgentTool` returns the string `Unknown tool: <name>` as a normal tool result and the loop continues - it must not throw. Provoke this by editing a tool description in Templates to reference a fake tool name.

### AI-050 - `create_visual` appears only when generated visuals are enabled
**P0** * Functional * `src/app.js:1423 agentTools()`

- **Pre:** Web search OFF (to isolate).
- **Steps:**
  1. Visuals **ON** → ask a question → count tools.
  2. Visuals **OFF** → ask again → count tools.
- **Expect:** 6 tools then 5; `create_visual` present then absent. Its parameter is a required string `description` described as **"What the visual should depict."**
- **Watch:** With visuals off, a request like "draw this" that the router still classifies as `visual` goes to `generateVisual` directly (not through the agent) and is forced to ASCII - see AI-089. The toggle therefore removes the *tool*, not the feature.

### AI-051 - `web_search` appears only when external web search is allowed
**P0** * Functional * `src/app.js:1424 agentTools()`, `src/app.js:1247`

- **Pre:** Visuals ON.
- **Steps:**
  1. Web **ON** → ask → count tools and check the payload.
  2. Web **OFF** → ask again.
- **Expect:** 7 tools then 6. Independently, the non-agent `aiText` envelope's `"web"` flag flips `true`→`false` (AI-002), and the last provenance chip flips **"Used web search"** → **"No external sources"**.
- **Watch:** Two mechanisms share one toggle (the OpenRouter web plugin and the agent tool). A regression that only wires one of them shows as a chip claiming web search while no tool exists, or vice versa.

### AI-052 - Tool descriptions come from Templates, live
**P1** * Functional * `src/app.js:1704 toolDesc()`, `src/app.js:2691 DEFAULT_TOOLS`

- **Pre:** Templates unmodified.
- **Steps:**
  1. Inspect the `tools` descriptions in a payload; compare with `DEFAULT_TOOLS`.
  2. Settings → Templates → expand **"search_document"**, change the text to `QA-MARKER search the paper` → Save.
  3. Ask again and re-inspect.
- **Expect:** Defaults match verbatim before the edit (e.g. `read_page` = **"Read the full text of a specific page (use for the previous/next section or a referenced page)."**). After the edit, the payload carries `QA-MARKER search the paper` for that tool only; the other six are untouched.
- **Watch:** Overrides live under `state.settings.prompts.tools`. Blanking a description restores the default (`toolDesc` falls back when the stored value trims to empty) - an empty description would otherwise make the model stop calling that tool entirely.

### AI-053 - `read_selection_context` returns the selection plus its surroundings
**P1** * Functional * `src/app.js:1430 runAgentTool()`

- **Pre:** A selection mid-paragraph on page 4.
- **Steps:**
  1. Ask `Re-read exactly what I highlighted and quote it back.`
  2. Open the trace and find the tool step.
- **Expect:** Status flashed **"Re-reading the selection…"**. The Result begins `Selected (page 4, <section>): "<your exact selection>"` then a blank line then `Surrounding text: …`. When no surrounding text is available it reads `Surrounding text: (none)`.
- **Watch:** The Input line shows **"(none)"** because this tool takes no arguments (`src/app.js:1947`). An Input of `{}` instead of `(none)` means the `Object.keys` guard was lost.

### AI-054 - `read_page` clamps the page and truncates at 4 500 characters
**P1** * Edge * `src/app.js:1431 runAgentTool()`

- **Pre:** 16-page sample.
- **Steps:**
  1. Ask `Read page 12 and tell me what is on it.`
  2. In the trace, read the tool step's Input and the head/tail of the Result.
  3. Then ask `Read page 999.`
- **Expect:** Input `{"page":12}`; Result begins `Page 12:` followed by whitespace-collapsed text, cut at 4 500 characters with no ellipsis marker. For page 999 the request is clamped to **16** and the result header reads `Page 16:`.
- **Watch:** `parseInt(args.page) || a.page` means `0` and non-numeric values fall back to the **note's** page, not page 1. Ask `read page zero` to exercise it. Any exception inside a tool is caught and returned as `Tool error: <message>` - a tool must never break the loop.

### AI-055 - `search_document` snippet format, and its two caps
**P1** * Functional * `src/app.js:1388 agentSearch()`

- **Pre:** Sample document.
- **Steps:**
  1. Ask `Search the document for every mention of WordPiece and list the pages.`
  2. Read the tool Result in the trace.
- **Expect:** Lines of the form `(page N) …~250 characters of context…` - at most **8** lines (the loop breaks at 8), one line per page maximum. The query is reduced to at most **6** distinct `[a-z0-9]{3,}` terms; a page matches if **any** term is found.
- **Watch:** Because it breaks out of the page loop on the first matching term, a page's snippet is anchored on whichever term matched first, not the most relevant one. Also: it scans pages 1→N in order, so on a long PDF the 8-hit cap means late pages are never searched.

### AI-056 - `search_document` with no usable terms says so
**P2** * Copy * `src/app.js:1390 agentSearch()`

- **Pre:** As above.
- **Steps:**
  1. Provoke a search with a query of only short words, e.g. ask `search for "a of to"`. (If the model refuses, call it directly: in the console run `runAgentTool` is not exposed - instead edit the `search_document` description in Templates to instruct a literal short query.)
- **Expect:** The tool Result is exactly **"No search terms."** The loop continues and the model still answers.
- **Watch:** Terms are `[a-z0-9]{3,}` - digits count, so `search for 15%` yields the term `15`? No: `15` is only two characters and is dropped. Confirm a purely numeric two-digit query also produces "No search terms."

### AI-057 - `search_document` with no matches quotes the query back
**P2** * Copy * `src/app.js:1397 agentSearch()`

- **Pre:** Sample document.
- **Steps:**
  1. Ask `Search the document for zzzqqqxyzzy and tell me what you find.`
- **Expect:** Tool Result exactly `No matches for "zzzqqqxyzzy".` - double quotes around the query, trailing full stop. The answer then says the term is absent rather than inventing one.
- **Watch:** The query is interpolated **unescaped** into the tool result string, but the trace escapes it at render (`src/app.js:1948`). Search for `<img src=x onerror=alert(1)>` and confirm the trace shows it as literal text - see `SEC-032`.

### AI-058 - `document_outline` returns page-prefixed headings, capped at 40
**P1** * Functional * `src/app.js:1399 agentOutline()`

- **Pre:** Sample document (numbered sections).
- **Steps:**
  1. Ask `Give me the outline of this paper with page numbers.`
  2. Read the tool Result.
- **Expect:** Lines shaped `p3: 3.1 Pre-training BERT`, at most **3 per page** and at most **40** overall. Status flashed **"Scanning the outline…"**.
- **Watch:** The heading regex demands `<digits>[.<digits>…] <Capital><letter>…` with no full stop for 2-60 characters. Inline citations like `2 Related Work` match, but so do false positives from body text such as `2 Devlin et al` - the outline is heuristic, not authoritative. Expect noise; expect no crash.

### AI-059 - A document with no detectable headings says so
**P2** * Copy * `src/app.js:1405 agentOutline()`

- **Pre:** Open a PDF with unnumbered headings (any fixture without `N.M Title` structure).
- **Steps:**
  1. Ask for the outline; read the tool Result.
- **Expect:** Exactly **"No clear section headings detected."** The model then answers from other tools instead of claiming an outline.
- **Watch:** On an image-only PDF before OCR, every page's text is empty, so this string appears for the *right* reason but the wrong cause. Cross-check against the OCR banner (`09-ocr.md`).

### AI-060 - `read_full_document` marks pages and its truncation
**P1** * Functional * `src/app.js:1434 runAgentTool()`

- **Pre:** Sample document, then repeat on a 100+ page fixture.
- **Steps:**
  1. Ask `Summarise the whole paper.` and read the tool Result in the trace.
- **Expect:** Blocks separated by `[Page N]` headers. Status flashed **"Reading the full paper…"**. On the long fixture the result ends with `[…truncated…]` and the trace body is itself cut at 6 000 characters (AI-070).
- **Watch:** This tool awaits `ensurePageText` for every page. On a 300-page PDF whose text extraction has not finished, it triggers extraction for all of them serially - the status can sit on "Reading the full paper…" for a minute with no progress indicator. Time it and file a Perf bug if it exceeds 30 s on the large fixture.

### AI-061 - `create_visual` inserts the visual *below* the pending answer
**P1** * Functional * `src/app.js:1435 runAgentTool()`, `src/app.js:1917 annCard()`

- **Pre:** Visuals ON.
- **Steps:**
  1. On a text selection, ask `Explain the architecture and show me a diagram of it.` (a question, not a bare "draw…", so the router picks `answer` and the *agent* calls the tool).
  2. Watch the thread while it runs.
- **Expect:** Order in the thread is: your question, the AI reply bubble (still pending, status **"Creating a visual…"**), then the generated-visual card appearing **beneath** it. When the run finishes, the text answer fills the bubble **above** the visual - one short sentence pointing at it.
- **Watch:** The tool returns an instruction string ending "…reply with at most ONE short sentence pointing to it (e.g. "Here's the diagram."); do NOT describe its contents or offer other versions." If the model ignores it, you get a long description above the picture - annoying but not a failure of the app. What *is* a failure: the visual appearing above the question, or the answer bubble never resolving.

### AI-062 - A failed visual inside the agent is reported to the model, not the user
**P1** * Edge * `src/app.js:1435 runAgentTool()`

- **Pre:** Visuals ON; block `*/api/ai-image*` in DevTools.
- **Steps:**
  1. Ask a question that makes the agent call `create_visual`.
- **Expect:** The visual card shows its own error (AI-094), and the tool returns `The visual could not be generated: <reason>. Answer in text instead.` The agent then produces a normal text answer. The chips still include **"Generated visual"** because `create_visual` was in the `used` set.
- **Watch:** The chip is added on *attempt*, not success (`src/app.js:1453`). A chip claiming a generated visual next to a failed visual card is misleading provenance - file as P2 if the copy is ever tightened.

### AI-063 - A failed `web_search` never fails the answer
**P1** * Edge * `src/app.js:1407 agentWeb()`

- **Pre:** Web search ON. Block the request or go offline *after* the first agent step.
- **Steps:**
  1. Ask `What has been published since this paper that supersedes it?`
- **Expect:** The tool Result in the trace begins **"Web search error: "** followed by the message. The loop continues and the model answers from the document. **No** error toast, **no** red card.
- **Watch:** `agentWeb` catches everything and returns a string; a `(no web results)` literal is returned when the call succeeds but the text is empty. Neither must ever throw - if the answer dies with the web tool, the `try/catch` was removed.

---

## 6. The agent trace UI

### AI-064 - The summary copy and the tool counter
**P0** * Copy * `src/app.js:1956 traceHTML()`

- **Pre:** Three completed answers: one with 0 tool calls, one with exactly 1, one with 3+.
- **Steps:**
  1. Read each answer's disclosure summary.
- **Expect:** 0 tools → **"Show the agent's work"** with no suffix. 1 tool → **"Show the agent's work · 1 tool call"** (singular). 3 tools → **"Show the agent's work · 3 tool calls"** (plural). The apostrophe is a **straight** `'`, not a curly `'`. The summary is blue, 11.5 px, semi-bold, prefixed by a **▸** that becomes **▾** when open.
- **Watch:** The straight apostrophe is deliberate in the source; a "typographic tidy-up" pass that curls it is a copy regression this check exists to catch.

### AI-065 - A no-tool answer states that plainly
**P1** * Copy * `src/app.js:1953 traceHTML()`

- **Pre:** An answer the model produced without calling anything (short factual question on a selection).
- **Steps:**
  1. Expand the trace.
- **Expect:** The first line inside is exactly **"No tools were needed — answered directly from the context."** (em dash). No `Tools called:` line.
- **Watch:** The check is `nTools` - steps of type `context`/`thought`/`final` do not count. An answer with a "Model reasoning" step but no tool must still show this line.

### AI-066 - The tools-called line lists each call as inline code
**P1** * Visual * `src/app.js:1953 traceHTML()`, `src/styles.css:234`

- **Pre:** An answer with 2+ tool calls, including a repeated one.
- **Steps:**
  1. Expand the trace and read the first line.
- **Expect:** `Tools called: ` then each tool name in a bordered monospace chip (`.tr-tools code`), comma-separated, **including duplicates in call order** (it maps over the steps, not a `Set`). Compare with the provenance chips, which *do* deduplicate.
- **Watch:** A run with five `read_page` calls produces five chips on one line - confirm the line wraps inside the card and does not widen the notes panel.

### AI-067 - Step numbers run continuously across every step type
**P1** * Functional * `src/app.js:1943-1951 traceHTML()`

- **Pre:** An answer whose trace has context + reasoning + 2 tools + final.
- **Steps:**
  1. Expand and read the numbered blue circles.
- **Expect:** 1, 2, 3, 4, 5 with no gaps and no restart - the counter increments for **all** steps, not just tools. The circles are 16 px blue discs with white 9.5 px digits (`.tr-n`).
- **Watch:** `n++` happens before the type test, so a future "hide context step" feature would leave a gap at 1. If step numbering ever starts at 2, that is the symptom.

### AI-068 - A tool step shows the wrench header, Input and Result
**P0** * Visual * `src/app.js:1948 traceHTML()`

- **Pre:** Any answer with a tool call.
- **Steps:**
  1. Expand the trace and inspect one tool step.
- **Expect:** Header `🔧 Tool call · ` followed by the tool name in **bold**. Then a small uppercase label **"INPUT"** (rendered from the string `Input` via `text-transform:uppercase`), a monospace grey `pre` block with the arguments JSON, then **"RESULT"** and a second `pre` with the tool output.
- **Watch:** `.tr-sub` applies `text-transform:uppercase` and letter-spacing, so the DOM text is `Input`/`Result` while the screen shows `INPUT`/`RESULT`. Assert on the rendered text when reading visually, and on the DOM text when grepping.

### AI-069 - Empty arguments and empty results have their own placeholders
**P2** * Copy * `src/app.js:1947-1948 traceHTML()`

- **Pre:** An answer that called `document_outline` or `read_selection_context` (both parameterless).
- **Steps:**
  1. Read that step's Input block.
  2. Find or force a tool that returned an empty string (block `/api/ai` after a web tool starts, or use a page with no text).
- **Expect:** Input shows **"(none)"** (not `{}`). An empty Result shows **"(empty)"**.
- **Watch:** `(none)` is chosen when `s.args` is missing **or** has zero keys, so a tool called with `{}` explicitly also shows `(none)`.

### AI-070 - Trace results are truncated at 6 000 characters
**P1** * Perf * `src/app.js:1486 askAIAgent()`

- **Pre:** A `read_full_document` run on the sample.
- **Steps:**
  1. Expand the trace; select the Result block text and check its length (paste into the console).
- **Expect:** ≤ **6000** characters, with no truncation marker of its own - the text simply stops. The *model* received up to 50 000 (AI-043), so the trace is a preview, not a transcript.
- **Watch:** This cap is what keeps `srw_state_v1` from exploding: the trace is persisted with the note. Ten full-document answers ≈ 60 kB of trace. Confirm with `JSON.stringify(JSON.parse(localStorage.srw_state_v1)).length` before and after.

### AI-071 - Open/closed state persists per message across reload
**P1** * State * `src/app.js:2117 render()`, `src/app.js:1954-1955 traceHTML()`

- **Pre:** Two answers with traces in one note.
- **Steps:**
  1. Expand the trace on answer A only. Reload the page. Re-open the note.
  2. Collapse it again and reload.
- **Expect:** After (1) A's trace is still open and B's is still closed. After (2) both are closed. The key is `trace:<msgId>` inside `state.ui.openDisc`; the `sources` disclosure uses `prov:<msgId>` and toggles independently.
- **Watch:** The `toggle` listener writes to state and calls `save()` on **every** open/close - rapid toggling should not thrash the UI. Also: deleting a message leaves an orphan key in `openDisc` forever; harmless, but it must not resurrect a disclosure when ids are regenerated on import.

### AI-072 - A message with no trace renders no disclosure at all
**P1** * Functional * `src/app.js:1940 traceHTML()`

- **Pre:** Fresh profile with the seeded sample notes (which include AI answers authored before traces existed).
- **Steps:**
  1. Open a seeded AI answer.
- **Expect:** The **"sources"** disclosure is present but **"Show the agent's work"** is entirely absent - no empty summary, no stray `▸`.
- **Watch:** `traceHTML` early-returns `''` when `m.trace` is missing or empty. A change to render an empty shell would put a dead disclosure on every legacy note.

### AI-073 - Long trace bodies scroll internally and never widen the panel
**P1** * Visual * `src/styles.css:270-273`

- **Pre:** An answer whose trace contains a `read_full_document` result and a long unbroken token (search the document for a 200-character string first, so the query is echoed).
- **Steps:**
  1. Expand the trace at a 384 px notes panel and again at 760 px (drag the panel edge).
- **Expect:** `.tr-body` blocks stay inside the card; the notes panel never gains a horizontal scrollbar; the card does not push the reader pane. The left border rail (`.tr-list`, 2 px) stays aligned.
- **Watch:** The `pre` blocks are monospace and pre-formatted; the ASCII art of a `read_full_document` result is the worst case. Check at 560 px viewport width too, where the panel becomes a drawer.

---

## 7. Provenance chips & the sources disclosure

### AI-074 - The sources disclosure summary copy
**P0** * Copy * `src/app.js:1811 msgCard()`, `src/styles.css:256-263`

- **Pre:** Any completed AI answer.
- **Steps:**
  1. Look at the grey line directly under the answer text, closed.
- **Expect:** **"ⓘ AI-generated · openai/gpt-5.4 · sources"** - the ⓘ glyph, then `AI-generated`, then ` · ` + the model name (omitted entirely when `m.model` is empty), then ` · sources` where **"sources"** alone is blue and semi-bold. Hovering underlines only the "· sources" part. When open, that part turns grey and non-bold.
- **Watch:** The whole line is a `<summary>` with `list-style:none` and the webkit marker suppressed; a browser that ignores those shows a native triangle. Check Firefox and Safari explicitly.

### AI-075 - Opening it reveals the label and the chip row
**P0** * Functional * `src/app.js:1811 msgCard()`, `src/app.js:1727 chipRow()`

- **Pre:** As above.
- **Steps:**
  1. Click the summary.
- **Expect:** A small grey uppercase-weight label **"What this answer used"** followed by the chip row. Chips are pill-shaped, 10.5 px, bordered, and wrap onto multiple lines.
- **Watch:** If `m.chips` is missing or empty, the row is rebuilt live from `chipsFor(a)` - so an old note shows *current* settings-derived chips, not the ones it was answered with. That is a provenance inaccuracy on legacy data; confirm new answers always store their own chips.

### AI-076 - A screenshot answer's chips
**P1** * Functional * `src/app.js:1340 chipsFor()`

- **Pre:** A screenshot note with a caption, on a page with a detected section, web search ON.
- **Steps:**
  1. Ask a question, open **"sources"**.
- **Expect:** In order: **"Page N"**, **"Section 3.1 Pre-training BERT"**-style chip, **"Used screenshot"**, **"Used nearby caption"**, **"Used web search"**. The last one is dimmed (`.chip.dim`).
- **Watch:** The section chip is produced by rewriting a leading number: `3.1 Title` → `Section 3.1 Title`. A section with no leading number is shown raw, with no "Section" prefix - verify on a document whose headings are unnumbered.

### AI-077 - An agent answer's chips reflect the tools actually used
**P0** * Functional * `src/app.js:1447 agentChips()`

- **Pre:** Ask three questions that provoke different tools: a whole-paper summary, a keyword lookup, and a cross-reference to another page.
- **Steps:**
  1. Open **"sources"** on each.
- **Expect:** `read_full_document` → **"Read full paper"**; `search_document` → **"Searched document"**; `read_page` **or** `document_outline` → **"Read related pages"**; `create_visual` → **"Generated visual"**. Always followed by **"Used highlighted text"** (or "Used screenshot") and then **"Used web search"** / **"No external sources"**.
- **Watch:** `read_selection_context` maps to **no** chip at all - an answer that only re-read the selection shows just `Page N` + source + web chip. That is correct, not a bug.

### AI-078 - The web chip flips with the toggle and is always dimmed
**P1** * Visual * `src/app.js:1348,1455`, `src/app.js:1727 chipRow()`

- **Pre:** One answer with web ON, one with web OFF.
- **Steps:**
  1. Compare the last chip on each.
- **Expect:** **"Used web search"** vs **"No external sources"**. Both match `/no external|used web/i` and therefore both render with the `.chip.dim` muted colour, visibly lighter than the other chips.
- **Watch:** The rewritten passage chip **"Used related passages · no external sources"** also matches `/no external/i` and is dimmed - confirm it, since it is the longest chip and the one most likely to be ellipsized (AI-083).

### AI-079 - Chips are computed at answer time, not at render time
**P1** * State * `src/app.js:1503 askAIAgent()`

- **Pre:** An answer produced with web search ON.
- **Steps:**
  1. Turn web search **OFF** in Settings → Save.
  2. Re-open the answer's **"sources"**.
- **Expect:** It still reads **"Used web search"** - the stored `m.chips` wins. Only answers with no stored chips fall back to live computation (AI-075).
- **Watch:** This is the whole point of provenance: a chip must describe what *that* answer did. If flipping the toggle rewrites history on existing answers, that is a P0 provenance failure.

### AI-080 - A document-level question wrongly claims "Used highlighted text"
**P2** * Copy * `src/app.js:1454 agentChips()`, `src/app.js:1346 chipsFor()`

- **Pre:** Nothing selected.
- **Steps:**
  1. In the bottom composer (placeholder **"Ask about this document…"**), ask `What are the paper's three main contributions?`
  2. Open **"sources"** on the answer.
- **Expect (documented defect):** The chips include **"Used highlighted text"** even though `source_type` is `doc` and `selected_text` is empty. The note's own header correctly reads **"Question about document"** (`srcLabel`), so the two disagree.
- **Watch:** Both `chipsFor` and `agentChips` fall to that `else`/ternary branch for `doc` notes. A fix must change both, and this check's Expect with it.

### AI-081 - A pending answer already shows chips, which are replaced on completion
**P2** * State * `src/app.js:1356 askAI()`, `src/app.js:1503 askAIAgent()`

- **Pre:** Slow 3G.
- **Steps:**
  1. Send a whole-paper question. While pending, note that no chips are visible (the pending branch renders only the typing line).
  2. When it lands, open **"sources"**.
- **Expect:** Chips exist only after completion, and they are the **agent** set (with "Read full paper"), not the initial `chipsFor` set stamped at creation. If the run **errors**, the card shows only the red error line - no chips at all.
- **Watch:** The initial `chipsFor` chips are persisted on the pending message. A stuck-pending message (AI-045) therefore carries chips in `localStorage` that never reach the screen - harmless, but do not mistake them for what was used.

### AI-082 - The two disclosures are independent
**P1** * State * `src/app.js:2117 render()`

- **Pre:** One answer with both a `prov` and a `trace` disclosure.
- **Steps:**
  1. Open **"sources"**, leave the trace closed. Send another message to force a re-render.
- **Expect:** "sources" is still open, the trace is still closed. Re-rendering the whole list (which happens on every status tick during a run) must not close an open disclosure.
- **Watch:** `render()` rebuilds `innerHTML` wholesale; the `open` attribute is restored from `state.ui.openDisc`. If it flickers closed during an active run, the `openDisc` write is happening after the re-render instead of before.

### AI-083 - Long chips ellipsize rather than overflow
**P2** * Visual * `src/styles.css:250-253`

- **Pre:** An answer on a note whose section heading is very long (open a fixture with a 90-character heading, or edit `a.section` in the console and re-render).
- **Steps:**
  1. Open **"sources"** at the narrowest notes panel width (drag to ~300 px).
- **Expect:** The section chip is clipped with an ellipsis (`white-space:nowrap; text-overflow:ellipsis; max-width:100%`), stays on one line, and the row wraps. No horizontal scrollbar on the panel.
- **Watch:** Because chips never wrap internally, a long chip loses information silently - there is no `title` attribute to reveal the full text on hover. File as P2 if a tester cannot identify the section.

---

## 8. Generated visuals: images & ASCII diagrams

### AI-084 - The visual card's pending state
**P0** * Functional * `src/app.js:1541,1818 generateVisual()/msgCard()`

- **Pre:** Visuals ON; Slow 3G.
- **Steps:**
  1. Send `draw the fine-tuning procedure as a diagram` on a text selection.
  2. Watch the new card.
- **Expect:** A violet badge appears immediately (**"Diagram"** or **"Generated image"** depending on `kind`, which is `null` at this point → **"Diagram"**), then a bordered card containing the violet typing line **"Planning the visual…"** with three dots. If `status` is ever null the fallback literal is **"Working"**.
- **Watch:** The badge is computed as `m.kind === 'image' || (!m.kind && m.image)`, so a pending image is badged **"Diagram"** until it resolves. The badge flipping from Diagram to Generated image mid-run is expected, not a bug.

### AI-085 - A completed ASCII diagram card
**P0** * Visual * `src/app.js:1821-1827 msgCard()`, `src/styles.css:320-324`

- **Pre:** A diagram-format visual has completed.
- **Steps:**
  1. Inspect the card.
- **Expect:** Badge **"Diagram"**; a centred `h4` with the planner's title (≤6 words); a dark (`#0B0F19`) monospace `pre` with light text and horizontal scroll if wide; an optional bulleted **takeaways** list (2-4 items); the chip row; then a grey footer line reading **"Text diagram from the document"** followed by ` · ` and the text model name.
- **Watch:** The `pre` must scroll inside itself. A 100-column diagram that widens the notes panel is a P1 visual bug. Check at 300 px panel width.

### AI-086 - A completed image card
**P0** * Visual * `src/app.js:1822,1827 msgCard()`

- **Pre:** An image-format visual has completed (`illustrate a hairpin vortex`).
- **Steps:**
  1. Inspect the card.
- **Expect:** Badge **"Generated image"**; centred title; the image at `width:100%` with 8 px radius; optional takeaways; chips; footer **"AI-generated illustration · not extracted data"** followed by ` · ` and the **image** model name (`google/gemini-3.1-flash-lite-image` by default, i.e. `models.openrouterImage`).
- **Watch:** The footer is the honesty disclaimer - it must never be dropped for an image, and must never appear on a diagram. Also confirm the `src` passed the raster allowlist: a rejected URL renders a broken-image icon with no error (see `SEC-015`…`SEC-021`).

### AI-087 - The framing suffix is appended to every image prompt
**P1** * Functional * `src/app.js:1572 generateVisual()`

- **Pre:** Visuals ON.
- **Steps:**
  1. Request an illustration; inspect the `POST /api/ai-image` payload's `prompt`.
- **Expect:** The planner's `image_prompt`, then a full stop, then verbatim: **"Compose everything inside a single square frame with generous margins — no text, label, or element may touch or run off any edge. Clean, legible, uncluttered, white background, no logos. Only depict the content described above; do not invent unrelated words, names, or examples."**
- **Watch:** This suffix is what keeps labels from being cropped and stops the model inventing captions. Losing it shows up as edge-clipped images - compare a before/after sample if you suspect it.

### AI-088 - The router's type hint overrides the planner's own choice
**P1** * Functional * `src/app.js:1550,1563 generateVisual()`

- **Pre:** Visuals ON, router reachable.
- **Steps:**
  1. Send `make a hand-drawn sketch of the encoder` (router → `visual_type:"image"`).
  2. Inspect the planner request's `system`; then check what was produced.
- **Expect:** The system prompt has an extra line: `The reader's intent is already classified as "image". Set "format" to "image" and fill the matching field (a detailed image_prompt).` And regardless of what the planner returns, `plan.format` is forced to `image` - a `POST /api/ai-image` fires.
- **Watch:** The hint is only appended when image generation is actually possible (`typeHint && canImage`). With visuals OFF there is no hint and no override - see AI-089.

### AI-089 - With visuals off, the planner is told images are unavailable
**P1** * Functional * `src/app.js:1539,1549,1565 generateVisual()`

- **Pre:** Settings → **"Enable generated visuals" OFF** → Save.
- **Steps:**
  1. Send `draw a picture of the transformer block`.
  2. Inspect the planner request's `system`, then the result.
- **Expect:** The system prompt gains the line `NOTE: image generation is unavailable, so you must use "ascii".` No `/api/ai-image` request is made. Even if the planner returns `format:"image"`, it is forced back to `ascii` (`src/app.js:1565`). The card is badged **"Diagram"**.
- **Watch:** The extra line is skipped if the (possibly customised) prompt already contains "image generation is unavailable". A user who pastes that phrase into their Templates override changes nothing functionally - the forcing at `:1565` is the real guard.

### AI-090 - A truncated planner response is salvaged, never shown raw
**P1** * Edge * `src/app.js:1511 stripJson()`

- **Pre:** Locally, stub the planner call to return a JSON string cut off mid-object, e.g. `{"format":"ascii","ascii":"A -> B\n C -> D","title":"Encoder flow","takeaway`.
- **Steps:**
  1. Trigger a visual with that stub.
- **Expect:** The diagram, title and any complete fields are recovered by the field-by-field regex salvage; the incomplete `takeaways` is dropped. **No JSON text ever reaches the card.** Also verify a response wrapped in ```` ```json ```` fences parses cleanly (the fences are stripped first).
- **Watch:** If nothing can be salvaged, `stripJson` returns `null`, `plan` becomes `{}`, `format` defaults to `ascii`, `ascii` is empty, and the flow falls through to the diagram retry (AI-091). At no point should the card display `{"format":…`.

### AI-091 - An empty diagram triggers a second, plain-text call
**P1** * Functional * `src/app.js:1578-1582 generateVisual()`

- **Pre:** Stub the planner to return `{"format":"ascii","title":"X","ascii":""}`.
- **Steps:**
  1. Trigger a visual and watch the status line.
- **Expect:** Status changes to **"Drawing the diagram…"** and a second `POST /api/ai` fires with `system` = the Templates → **"Diagram (text fallback)"** prompt and `maxTokens:2200`. Any code fences in the reply are stripped before display.
- **Watch:** This second call has no `typeHint` and no JSON contract - it asks for raw ASCII. If the model returns prose, that prose is shown inside the dark monospace block, which looks broken but is not an error. That is the known weakness of this fallback.

### AI-092 - Both diagram attempts empty gives the exact failure copy
**P1** * Copy * `src/app.js:1584 generateVisual()`

- **Pre:** Stub both the planner and the diagram retry to return empty text.
- **Steps:**
  1. Trigger a visual.
- **Expect:** The card title becomes **"Visual unavailable"** and the body is a red line: **"⚠ Could not render the diagram — please try again."** No toast (this path sets `msg.error` without toasting). The badge still reads **"Diagram"**.
- **Watch:** Distinguish from AI-095, which *does* toast. Two different failure shapes for one feature is easy to get wrong in a refactor.

### AI-093 - Image failure with an ASCII fallback degrades silently
**P1** * Edge * `src/app.js:1574 generateVisual()`

- **Pre:** Visuals ON; block `*/api/ai-image*`. Ensure the planner returns **both** `image_prompt` and `ascii` (ask for something the planner is likely to hedge on, e.g. `illustrate the results table`).
- **Steps:**
  1. Trigger the visual.
- **Expect:** The image call fails, and the card silently renders the planner's ASCII diagram instead. Badge **"Diagram"**, footer **"Text diagram from the document"**. **No error is shown anywhere** - not in the card, not as a toast.
- **Watch:** `msg.model` is *not* updated on this fallback branch, so it stays `''` and the footer shows no model name at all. Cosmetic, but it is the tell that this branch was taken.

### AI-094 - Image failure with no fallback reports it in the card
**P1** * Copy * `src/app.js:1574 generateVisual()`

- **Pre:** Block `*/api/ai-image*`; force an image-only plan (router hint `image`, prompt `draw a photo of a laboratory setup`).
- **Steps:**
  1. Trigger the visual.
- **Expect:** Title **"Visual unavailable"**, red body **"⚠ Image generation failed: "** followed by the underlying message (e.g. `Failed to fetch`). No toast.
- **Watch:** The underlying message is inserted unescaped into `msg.error` and escaped at render (`src/app.js:1819`). A provider error containing HTML must render as literal text.

### AI-095 - A planner failure fails the whole visual, loudly
**P1** * Functional * `src/app.js:1589-1591 generateVisual()`

- **Pre:** Block `*/api/ai*` entirely (both the planner and everything else).
- **Steps:**
  1. Send `draw the architecture`.
- **Expect:** Card title **"Visual generation failed"**, red body with the error, **and** an error toast carrying `errHint()`'s network text (AI-123). `pending` clears and `status` clears - the dots stop.
- **Watch:** This is the only visual path that toasts. Confirm `state.ui.streamingId` is cleared in the `finally` - a stuck flag here makes the whole notes panel scroll-jump afterwards.

### AI-096 - A completed visual tags the note and recolours the card
**P2** * Functional * `src/app.js:1587 generateVisual()`, `src/app.js:1230 TAG_CLASS`, `src/app.js:1833 cardKind()`

- **Pre:** A note with no AI content.
- **Steps:**
  1. Generate any visual successfully, then collapse the note.
- **Expect:** A **"Generated visual"** tag pill (class `vis`) appears on the note. The collapsed card takes the AI treatment (`.card.k-ai`, `#F2EFF8`) because a `generated_visual` message counts as AI presence.
- **Watch:** The tag is added on success only (it is set after the planner branch completes) - a failed visual leaves the note untagged but *still* recoloured, since `cardKind` only checks the message type, not `error`.

### AI-097 - A generated image survives reload via IndexedDB
**P1** * State * `src/app.js:158 save()`, `src/app.js:144 rehydrateAssets()`, `src/app.js:20 safeImgSrc()`

- **Pre:** One successfully generated image.
- **Steps:**
  1. Inspect `localStorage.srw_state_v1` - find the message and read its `image` field.
  2. Reload; re-open the note.
- **Expect:** `localStorage` holds the sentinel string `"@idb"`, not the base64. IndexedDB `srw_assets` → `assets` holds `img:<msgId>`. After reload the image renders again. If IndexedDB is unavailable (private window), the image is gone after reload and the card shows a broken image with no error.
- **Watch:** A base64 blob left in `localStorage` is a quota bomb - `srw_state_v1` must stay small. Compare its size before and after generating three images; growth of more than a few kB means the offload broke.

### AI-098 - A visual generated inside an agent run releases the follow flag early
**P2** * Edge * `src/app.js:1537,1592 generateVisual()`, `src/app.js:1459,1509 askAIAgent()`

- **Pre:** Visuals ON; a tall thread; Slow 3G.
- **Steps:**
  1. Ask a question that makes the agent call `create_visual` (AI-061).
  2. Watch whether the panel keeps following the newest content **after** the visual finishes but **before** the text answer lands.
- **Expect (documented quirk):** `generateVisual`'s `finally` clears `state.ui.streamingId` for the same note id that `askAIAgent` set, so auto-follow stops for the remainder of the run. The final answer may land off-screen and require a manual scroll.
- **Watch:** Both functions set and clear the same single-slot flag. The symptom is subtle - "the answer appeared but I had to scroll". Confirm no *other* breakage (the answer itself must still land correctly).

---

## 9. Markdown, LaTeX & fenced-code rendering

> These checks are fastest to run by *pasting* the sample text into a note comment (which exercises `commentHTML`) and by getting the model to echo it (which exercises `mdRich`). Where a check needs exact input, the reliable route is to write the answer text directly: select a note's AI answer, hover → pencil (**"Edit"**), paste the markup, and click **"Save"**. Editing does not re-run the model, so the render stack gets exactly your input.

### AI-099 - Headings map to three levels
**P1** * Visual * `src/app.js:1988-1989 mdLite()`, `src/styles.css:214-217`

- **Pre:** An AI answer you can edit.
- **Steps:**
  1. Edit an answer to contain `# One`, `## Two`, `### Three`, `###### Six` on separate lines. Save.
- **Expect:** `#` → `<h4 class="md-h">` at 14.5 px; `##` → `<h5>` at 13.5 px; `###` and deeper → `<h6>` at 12.5 px in the muted ink colour. All bold, with 12 px top margin. A line of `#Hash` (no space) is **not** a heading - it renders as a paragraph.
- **Watch:** There is deliberately no `h1`-`h3`; a heading rendering at document-title size means the level mapping was "simplified".

### AI-100 - Bullet and ordered lists, in all accepted markers
**P1** * Visual * `src/app.js:1992-1993 mdLite()`

- **Pre:** As above.
- **Steps:**
  1. Paste a block using `-`, then one using `*`, then one using `+`, then one using `•`; then `1.` and `1)` forms.
- **Expect:** All four bullet markers produce one `<ul class="md-ul">` with disc bullets; both ordered forms produce `<ol class="md-ol">` with decimal numbers. Consecutive items merge into a single list; a blank line starts a new one. `padding-left:20px`, 2 px item spacing.
- **Watch:** A line starting `* italic *` is consumed as a bullet, not italics - block rules run before inline rules. That is expected; note it if a tester reports "italics broken at line start".

### AI-101 - A table needs a separator row, and scrolls
**P1** * Visual * `src/app.js:1981-1986 mdLite()`, `src/styles.css:225-228`

- **Pre:** As above.
- **Steps:**
  1. Paste a 3-column markdown table **with** a `|---|---|---|` separator.
  2. Paste the same table **without** the separator.
  3. Paste a 9-column table.
- **Expect:** (1) A real `<table class="md-table">` with a shaded `thead`, 1 px borders, left-aligned top-aligned cells. (2) Renders as plain paragraph text with visible pipes. (3) The table scrolls horizontally inside `.md-tablewrap` and does not widen the card.
- **Watch:** The separator test is `line.includes('|') && /^[\s|:\-]+$/.test(next) && next.includes('-')` - an alignment row of `|:--|--:|` qualifies. Cells are rendered through `mdInline`, so `**bold**` inside a cell works but a fenced block inside a cell does not.

### AI-102 - Blockquotes and horizontal rules
**P2** * Visual * `src/app.js:1990-1991 mdLite()`

- **Pre:** As above.
- **Steps:**
  1. Paste two consecutive `> quoted` lines, then a line of `---`, then `***`, then `___`.
- **Expect:** The two quote lines merge into one `<blockquote class="md-q">` separated by a `<br>`, with a 3 px left rule. Each of `---`/`***`/`___` (3 or more of the same character) becomes an `<hr class="md-hr">`.
- **Watch:** A mixed run like `-*-` is **not** a rule (the regex requires the same character repeated). `--` (two dashes) is also not a rule and falls through to a paragraph.

### AI-103 - Inline code, bold and italic, in both syntaxes
**P1** * Visual * `src/app.js:1958 mdInline()`

- **Pre:** As above.
- **Steps:**
  1. Paste: `` use `torch.nn` here, **bold**, __also bold__, *italic*, _also italic_, and snake_case_word ``.
- **Expect:** `torch.nn` renders in a bordered monospace chip; both bold forms render `<b>`; both italic forms render `<i>`; **`snake_case_word` stays literal** - the italic rules require a non-word character before the marker and forbid a word character after the closing one.
- **Watch:** Order matters: code is extracted first, so `` `**not bold**` `` inside backticks stays literal. Multi-line bold (`**` spanning a newline) is not matched by design (`[^\n]+?`).

### AI-104 - Only http(s) links are linkified, and they open safely
**P0** * Security * `src/app.js:1962 mdInline()`

- **Pre:** As above.
- **Steps:**
  1. Paste: `[good](https://example.com)`, `[bad](javascript:alert(1))`, `[relative](/app.html)`.
- **Expect:** Only the first becomes an `<a class="cite">` with `target="_blank"` and `rel="noopener noreferrer"`, blue and underlined on hover. The other two render as literal bracket-and-paren text. Clicking the good link opens a new tab; the app tab is not navigated.
- **Watch:** The regex hard-codes `https?://` in the URL group. A protocol-relative `//evil.com` is **not** matched. This is the single most important escape in the render stack - see also `SEC-041`.

### AI-105 - Paragraph line breaks fold to `<br>`
**P2** * Visual * `src/app.js:1994-1996 mdLite()`

- **Pre:** As above.
- **Steps:**
  1. Paste three consecutive prose lines with no blank line between them, then a blank line, then two more.
- **Expect:** Two `<p class="md-p">` elements; inside each, lines are joined by `<br>`. Paragraph spacing is 8 px, and the **last** paragraph has no bottom margin.
- **Watch:** The paragraph accumulator stops at the first line that looks like a block start (`isBlock`), so a bullet immediately after prose with no blank line still becomes a list. Verify that - it is a common markdown-emitter pattern.

### AI-106 - Fenced code stays literal and carries its language
**P1** * Functional * `src/app.js:2002 RICH_FENCE`, `src/app.js:2007 codeBlockHTML()`, `src/styles.css:621-622`

- **Pre:** As above.
- **Steps:**
  1. Paste a fenced block tagged ```` ```python ```` containing `**not bold**`, `# not a heading`, `$x^2$` and `<b>literal</b>`.
- **Expect:** A dark `pre.code-block` with `data-lang="python"`, monospace 11.5 px, horizontal scroll, and **every** character shown literally - no bold, no heading, no math typesetting, no HTML. Trailing whitespace is trimmed.
- **Watch:** Fences are split **before** math protection and markdown, so code is immune to both. A block with no language tag gets no `data-lang` attribute at all. A tag with unusual characters (e.g. ```` ```c++ ````) is accepted by the `[A-Za-z0-9_+#.\-]*` class.

### AI-107 - An unclosed fence degrades to text
**P2** * Edge * `src/app.js:2029 richSegments()`

- **Pre:** As above.
- **Steps:**
  1. Paste text containing a single ```` ``` ```` with no closing fence, followed by two more lines.
- **Expect:** The `split` yields one part, so the whole thing renders as normal markdown text with the literal backticks visible. Nothing is swallowed or hidden.
- **Watch:** Streaming/truncated answers frequently end mid-fence. Content disappearing after a stray fence is a P1 - the user loses the answer.

### AI-108 - Inline math renders as MathJax SVG
**P0** * Functional * `src/app.js:2017 protectMath()`, `src/app.js:2051 ensureMathJax()`, `src/app.js:2072 typesetMath()`

- **Pre:** Online (MathJax loads from `cdnjs.cloudflare.com`). No math anywhere on screen yet.
- **Steps:**
  1. Confirm in Network that `tex-svg.min.js` has **not** loaded.
  2. Edit an answer to contain `The loss is \(\mathcal{L} = -\sum_i \log p(x_i)\) per token.` and Save.
- **Expect:** `tex-svg.min.js` (MathJax **3.2.2**) loads once, then the expression renders as an inline SVG that sits **on the same line** as the surrounding words (`mjx-container svg{display:inline-block}`). The raw `\(` `\)` delimiters are gone.
- **Watch:** The global `svg{display:block}` reset would otherwise force every inline formula onto its own line - if sentences start breaking around equations, that override was lost. Also: MathJax is loaded lazily and only when `mathRoots()` finds `\(` or `\[` in `#notesList`, so a user who never sees math never downloads 1 MB.

### AI-109 - Display math is centred on its own line
**P1** * Visual * `src/app.js:2020-2021 protectMath()`, `src/styles.css:620,626`

- **Pre:** MathJax already loaded.
- **Steps:**
  1. Add `$$E = mc^2$$` on its own line, then `\[ \sum_{i=1}^{n} x_i \]` on another. Save.
- **Expect:** Both become block-level, horizontally centred, with 6-8 px vertical margins, and each scrolls horizontally on its own if too wide (`overflow-x:auto; overflow-y:hidden`). Both `$$…$$` and `\[…\]` normalise to the same `\[…\]` form internally.
- **Watch:** MathJax is configured for `\(…\)` and `\[…\]` **only** (`inlineMath`/`displayMath` at `src/app.js:2055`), which is exactly why `protectMath` rewrites `$$` into `\[`. If a change removes that rewrite, `$$` math silently stops typesetting.

### AI-110 - Bare `$…$` only becomes math with a real math signal
**P1** * Edge * `src/app.js:2024 protectMath()`

- **Pre:** As above.
- **Steps:**
  1. Save an answer containing: `It costs $5 and $10 for the second one.` and, separately, `the term $x^2$ dominates`.
- **Expect:** The currency line renders as plain text with visible dollar signs. The second renders `x²` as typeset math. The trigger is the presence of any of `\ ^ _ { }` inside the dollars.
- **Watch:** `$a$ and $b$` (letters only, no signal) stays literal - that is correct but will look wrong to a physicist. Do not "fix" it without re-running the currency case.

### AI-111 - Math inside code is never typeset
**P1** * Functional * `src/app.js:2029 richSegments()`, `src/app.js:2057 ensureMathJax()`

- **Pre:** MathJax loaded.
- **Steps:**
  1. Save an answer with a fenced block containing `\(x\)` and also an inline `` `\(y\)` `` in backticks.
- **Expect:** Both remain literal `\(x\)` / `\(y\)` text. Two mechanisms guarantee this: fences are extracted before `protectMath`, and MathJax's `skipHtmlTags` includes `pre`, `code` and `textarea`.
- **Watch:** Inline `<code>` produced by `mdInline` runs *after* math protection, so a `$x^2$` inside backticks is protected as math **before** the code rule sees it - it will typeset. Document whichever behaviour you observe; it is an edge the two rules disagree on.

### AI-112 - MathJax is loaded once, debounced, and fails soft
**P1** * Perf * `src/app.js:2051,2078 ensureMathJax()/scheduleTypeset()`

- **Pre:** Fresh reload with several math-bearing answers.
- **Steps:**
  1. Reload, open a note with math, then rapidly select five different notes.
  2. Count `tex-svg.min.js` requests.
  3. Now block `cdnjs.cloudflare.com` and reload.
- **Expect:** Exactly **one** script request regardless of how many re-renders occur (`window.MathJax || window.__mjLoading` guard). Typesetting is debounced 120 ms. With the CDN blocked, answers show raw `\( … \)` LaTeX, no error, no toast, and no retry storm - `onerror` resets `__mjLoading` but nothing re-requests until the next `scheduleTypeset`.
- **Watch:** `typesetMath` calls `typesetClear` on the roots first; without it, re-rendering the same answer stacks duplicate SVGs. Look for doubled equations after a run of status updates.

### AI-113 - Comments render math and code but not headings or bold
**P1** * Functional * `src/app.js:2041 commentHTML()`

- **Pre:** Any note.
- **Steps:**
  1. Post a comment containing `# Heading`, `**bold**`, `` `code` ``, a fenced block, `\(x^2\)`, and `@ai`.
- **Expect:** The heading and `**bold**` render **literally** (with the `#` and asterisks visible); the fenced block renders as a dark code block; the inline math typesets; `@ai` is blue and bold; newlines become `<br>`. Inline backticks are **not** turned into `<code>` in a comment - only fenced blocks are.
- **Watch:** This asymmetry with AI answers is deliberate (`commentHTML` skips `mdLite`). A comment suddenly rendering headings means someone pointed comments at `mdRich`.

---

## 10. @ai mentions

### AI-114 - The mention backdrop mirrors the textarea exactly
**P1** * Visual * `src/app.js:1601 attachMentions()`, `src/styles.css:305-310`

- **Pre:** A note expanded (inline composer visible) and the bottom document composer visible.
- **Steps:**
  1. Type a long wrapping sentence containing `@ai` in the **inline** composer, then in the **bottom** composer.
  2. Zoom the browser to 125% and repeat.
- **Expect:** The visible text is the backdrop `div.men-hl`; the textarea's own text is transparent with a visible caret. Character positions line up **exactly** - no ghosting, no doubled text, no offset. Font, size, weight, line-height, letter-spacing, all four paddings and all four border widths are copied from the textarea at wire time.
- **Watch:** The copy happens **once**, at `attachMentions` time. Anything that changes the textarea's computed style afterwards (a media-query font change on resize, a zoom that alters rounding) desynchronises the mirror. Resize across the 820 px and 560 px breakpoints with text in the box and look for drift.

### AI-115 - `@ai` highlights live, case-insensitively, on a word boundary
**P1** * Functional * `src/app.js:1608 attachMentions()`

- **Pre:** Inline composer focused.
- **Steps:**
  1. Type `@a` → `@ai` → `@aid` → ` @AI ` → `x@ai`.
- **Expect:** No highlight at `@a`. Blue bold at `@ai` (`.men-hl .men`, weight 700). The highlight **disappears** when it becomes `@aid` (the `\b` fails before a word character). `@AI` highlights (case-insensitive). `x@ai` **does** highlight - there is no left-boundary requirement.
- **Watch:** The mirror is rebuilt with `esc()` then the mention replace, so typing `<b>@ai</b>` shows literal tags with only the `@ai` coloured. A raw tag rendering as bold in the composer is an XSS-adjacent regression (`SEC-048`).

### AI-116 - `@ai` is stripped from the question but kept in the comment
**P0** * Functional * `src/app.js:1627,1633 submitToNote()`

- **Pre:** Network tab open.
- **Steps:**
  1. Send `@ai what does WordPiece do?` on a note.
  2. Read the stored comment on screen, then the router and answer payloads.
- **Expect:** The comment displays **"@ai what does WordPiece do?"** with the mention in blue. Both payloads contain `what does WordPiece do?` with **no** `@ai`. If the message is *only* `@ai` (nothing else), `clean` is empty and the original text is sent instead (`clean || text`).
- **Watch:** The `clean` value is also what the keyword fallback tests against (`src/app.js:1642`), so `@ai explain this` still matches the `^explain` heuristic when the router is down.

### AI-117 - `@ai` is coloured in comments, answers and compact previews
**P2** * Visual * `src/app.js:2044 commentHTML()`, `src/app.js:1967 mdInline()`, `src/app.js:1884 compactCard()`

- **Pre:** A note whose comment contains `@ai` and whose AI answer echoes `@ai` back.
- **Steps:**
  1. View the expanded thread, then collapse the note and view the compact card.
- **Expect:** Blue semi-bold `@ai` (`.msg .men`) in all three places. In the compact preview the text is escaped **before** the mention wrapper is applied, so a comment containing `<span class="men">` shows literal tags.
- **Watch:** Three separate call sites apply the same regex. A fix in one and not the others shows as `@ai` styled in the thread but plain on the card.

### AI-118 - The mirror survives re-render and draft restoration
**P1** * State * `src/app.js:2091,2154 render()`, `src/app.js:1611 attachMentions()`

- **Pre:** A note with an active AI run (so `render()` fires repeatedly).
- **Steps:**
  1. While the answer is being produced, type `@ai follow up on this` into the inline composer **without** sending.
  2. Watch through several status ticks.
- **Expect:** The draft text, the caret position and the focus are all preserved across every re-render, and the `@ai` stays highlighted (the restore dispatches a synthetic `input` event, which re-runs `sync()`). The textarea's auto-height is recomputed and capped at **120 px**.
- **Watch:** `attachMentions` guards with `ta._menWired`, but each re-render creates a **new** textarea element, so it is re-wired every time - correct, but it means the initial `sync()` must run or the draft appears invisible (transparent text with no backdrop). An invisible draft is the failure mode.

### AI-119 - The document composer clears its mirror on send
**P2** * Functional * `src/app.js:3167`

- **Pre:** Bottom composer, placeholder **"Ask about this document…"**.
- **Steps:**
  1. Type `@ai summarise the paper`, press Enter.
- **Expect:** The textarea empties, its height resets, and the backdrop is reset to a single newline - **no ghost text** left behind the placeholder. The placeholder becomes visible again in the muted colour (`.men-input::placeholder` forces the fill colour back).
- **Watch:** The inline thread composer's `submit()` (`src/app.js:2132`) does **not** reset its mirror explicitly - it relies on the following `render()` rebuilding the card. If a send ever fails to re-render, the inline composer keeps ghost text behind an empty box.

---

## 11. AI errors, quota & degraded states

### AI-120 - The shared-key quota message, verbatim
**P0** * Copy * `api/ai.js:31-32,108`, `api/ai-image.js:28-29,79`

- **Pre:** No BYO key (the shared server key is in use). Either wait for the real quota, or locally set `OPENROUTER_API_KEY` to a key with no credit, or stub `postJSON` to return HTTP 402.
- **Steps:**
  1. Ask any question.
- **Expect:** The card shows "⚠ " plus, character for character: **"The site's shared demo quota is used up right now — add your own key in Settings → AI & Tools to keep going (it stays in your browser and is never saved on our server)."** - curly apostrophe in "site's", em dash, "→" arrow. The same text appears in the error toast. HTTP status is the upstream status (402/429) or 429 as a floor.
- **Watch:** The provider's own "add credits" message must **never** reach the user - it points at the site owner's account and reads as the user's fault. `isQuotaErr` matches status 402/429 **or** the text `insufficient|quota|rate limit|limit exceeded|credit|payment required|billing|openrouter.ai/workspaces|settings`. Verify the image endpoint returns the identical string.

### AI-121 - A BYO key that is out of credit must NOT be masked
**P0** * Functional * `api/ai.js:80,92,108`

- **Pre:** Paste a real key with zero credit into Settings (OpenRouter) → Save.
- **Steps:**
  1. Ask a question.
- **Expect:** The **provider's own** error is shown verbatim (e.g. "Insufficient credits…"), **not** the demo-quota message - because `usedServerKey` is false when a `userKey` was supplied.
- **Watch:** If the demo-quota message appears here, the user is told to add a key they already added. Confirm `usedServerKey` is set from `!ownKey` **before** the try block's failure point (`api/ai.js:92`).

### AI-122 - No key anywhere appends the Settings pointer
**P1** * Copy * `api/ai.js:94`, `src/app.js:1596 errHint()`

- **Pre:** Run `vercel dev` with **no** `OPENROUTER_API_KEY` in the environment and no BYO key.
- **Steps:**
  1. Ask a question.
- **Expect:** The toast reads: **"No openrouter key available. Add your own key in Settings, or ask the site owner to set OPENROUTER_API_KEY. (Settings → paste a key to use your own.)"** - the trailing parenthetical is added client-side by `errHint`. The card's red line shows the message **without** the parenthetical (it stores `e.message`, not the hinted version).
- **Watch:** The card and the toast deliberately differ. The image endpoint's variant is `No openrouter image key available. Add your own in Settings, or set OPENROUTER_API_KEY.` and also matches `errHint`'s `/no .*key available/i`.

### AI-123 - A network failure names the endpoint and the local-file caveat
**P0** * Copy * `src/app.js:1595 errHint()`

- **Pre:** DevTools → Offline, **or** open a saved `.annotated.html` from `file://`.
- **Steps:**
  1. Ask a question.
- **Expect:** The error toast reads exactly: **"Could not reach the AI endpoint (/api/ai). This works on the deployed site; when opening the file locally without the server, add a key in Settings or run it via the deployment."** The card shows the browser's raw message (`Failed to fetch` in Chromium, `NetworkError when attempting to fetch resource.` in Firefox, `Load failed` in Safari).
- **Watch:** `errHint`'s regex covers all three engine wordings (`failed to fetch|networkerror|load failed`). A new engine phrasing would fall through to the raw message - re-check after any browser major bump.

### AI-124 - An error renders red in the card **and** raises a toast
**P0** * Visual * `src/app.js:1382-1383 askAI()`, `src/app.js:1507-1508 askAIAgent()`, `src/app.js:1806 msgCard()`

- **Pre:** Any reproducible failure (offline is easiest).
- **Steps:**
  1. Trigger a failed answer.
- **Expect:** The pending dots stop; the bubble becomes a single line in `#B91C1C` starting with **"⚠ "**. An error toast (red treatment) appears simultaneously and auto-dismisses after ~6 s. The message text is escaped. The note is **not** deleted and the question remains.
- **Watch:** Both the direct path and the agent path must clear `pending` **and** `status`. A failure that leaves `status` set renders neither the dots nor the error cleanly.

### AI-125 - A provider 401 surfaces verbatim, with the upstream status
**P1** * Functional * `api/ai.js:65,109`

- **Pre:** Paste `sk-or-invalid-key` into Settings → Save.
- **Steps:**
  1. Ask a question; check the Network response status and body.
- **Expect:** HTTP **401** (mirrored from upstream, not flattened to 500), body `{"error":"<the provider's message>"}`, and the card shows that message. No quota masking (401 is not a quota status and an own key was used anyway).
- **Watch:** `res.status((e && e.status) || 500)` mirrors the upstream code. If every provider error becomes 500, callers can no longer distinguish auth from outage.

### AI-126 - Going offline mid-answer fails the in-flight step only
**P1** * Edge * `src/app.js:1476 askAIAgent()`

- **Pre:** Slow 3G; a question that will make 3+ agent steps.
- **Steps:**
  1. Send it; after the first tool call completes, switch to Offline.
- **Expect:** The **next** `aiAgentStep` rejects, the loop's `catch` fires, the bubble goes red with the network hint toast, and `streamingId` is released in the `finally`. Everything already saved (the question, the trace so far) survives. Going back online and sending a new message works immediately - no reload needed.
- **Watch:** The partial `msg.trace` **is** persisted on the errored message but is not rendered, because the error branch replaces the body (`src/app.js:1806`) and never calls `traceHTML`. The gathered work is therefore invisible - acceptable, but do not report the trace as "lost".

### AI-127 - Recovery: a failed note is still fully usable
**P1** * Functional * `src/app.js:1507 askAIAgent()`

- **Pre:** A note with one errored AI reply.
- **Steps:**
  1. Go back online. Hover the errored reply → click the trash (title **"Delete reply"**).
  2. Ask the same question again in the same note.
- **Expect:** The errored reply is removed with no confirmation dialog (only whole-note deletion confirms). The retry produces a normal answer. Editing the original question and clicking **"Save & re-ask AI"** also works and removes the errored reply automatically (it removes every AI message directly after the edited one).
- **Watch:** `saveAndReask` splices while `a.messages[idx+1].actor === 'ai'` - an errored AI message counts, so it is cleaned up. A user comment between them stops the sweep.

### AI-128 - Both AI endpoints reject non-POST
**P2** * Functional * `api/ai.js:79`, `api/ai-image.js:38`

- **Pre:** The functions running.
- **Steps:**
  1. Open `/api/ai` and `/api/ai-image` directly in a browser tab (a GET).
- **Expect:** HTTP **405** with body `{"error":"POST only"}` from both. No stack trace, no key material, no CORS headers that would let a third-party page call them.
- **Watch:** A 200 or an HTML error page here means the function signature changed. Also confirm a POST with a malformed body (`readBody` catches and yields `{}`) is treated as an empty OpenRouter call rather than throwing a 500.

### AI-129 - The image endpoint's own failure copy
**P1** * Copy * `api/ai-image.js:42,45,48,67,74`

- **Pre:** Various.
- **Steps:**
  1. Set an unknown provider in the payload (via a console `fetch` to `/api/ai-image`) → read the error.
  2. Default = OpenAI-compatible with no key → request a visual.
  3. Set the OpenRouter **image** model to a text-only model (e.g. `openai/gpt-5.4`) → request an illustration.
- **Expect:** (1) `<provider> can't generate images — use OpenRouter or an OpenAI-compatible endpoint.` (2) **"The OpenAI-compatible provider needs your own API key (add it in Settings → AI & Tools)."** - note this variant has **no** trailing "The site's shared demo key…" sentence, unlike `/api/ai`. (3) `OpenRouter returned no image. Model may not generate images. Response: ` followed by up to 140 characters of what came back.
- **Watch:** The compat branch's own failure is the terse `No image returned`. Four distinct strings for four causes - a refactor that collapses them into one generic "Image error" removes the only diagnostic a user has.

### AI-130 - After every failure in this document, the app is still usable
**P0** * Regression * whole document

- **Pre:** Run this last, after exercising the failures above.
- **Steps:**
  1. Go back online, restore default settings, reload once.
  2. Ask a normal question, generate a diagram, generate an image, open both disclosures.
  3. Check: no stuck pending bubble on any note, no stuck typing dots, no permanently scroll-jumping notes panel, no modal or mask left on screen, no console errors.
- **Expect:** Everything works. `state.ui.streamingId` is `null` (check in the console: `JSON.parse(localStorage.srw_state_v1).ui.streamingId`). `state.ui.editing` is `null`. Notes, chips and traces from the failed runs are all still present and readable.
- **Watch:** The two flags that survive a bad run are `streamingId` (auto-scroll hijack) and `editing` (an edit box that reopens on every render). Both are persisted, so a bad run poisons the **next** session too until the note is touched.

---

## Coverage map

| Code or element | Checks |
|---|---|
| `canImage` src/app.js:1235 | AI-010 |
| `activeProvider()` src/app.js:1236 | AI-001, AI-003 |
| `keyFor()` src/app.js:1237 | AI-005, AI-006 |
| `pickImageProvider()` src/app.js:1238 | AI-010 |
| `aiText()` src/app.js:1244 | AI-002, AI-005, AI-051, AI-091 |
| `aiImage()` src/app.js:1253 | AI-010, AI-087, AI-129 |
| `aiClassify()` src/app.js:1264 | AI-012, AI-013 |
| `parseRoute()` src/app.js:1273 | AI-016, AI-017, AI-018 |
| `routeMessage()` src/app.js:1282 | AI-012, AI-013, AI-021 |
| `imageEvidence()` src/app.js:1295 | AI-025 |
| `buildContext()` src/app.js:1299 | AI-013, AI-028, AI-031, AI-053 |
| `retrievePassages()` src/app.js:1327 | AI-029, AI-078 |
| `chipsFor()` src/app.js:1340 | AI-029, AI-030, AI-075, AI-076, AI-080, AI-081 |
| `askAI()` src/app.js:1351 | AI-014, AI-024, AI-027, AI-032, AI-033, AI-034, AI-124 |
| `ensureText()` src/app.js:1387 | AI-048, AI-060 |
| `agentSearch()` src/app.js:1388 | AI-055, AI-056, AI-057 |
| `agentOutline()` src/app.js:1399 | AI-058, AI-059 |
| `agentWeb()` src/app.js:1407 | AI-063 |
| `agentTools()` src/app.js:1415 | AI-035, AI-049, AI-050, AI-051, AI-052 |
| `TOOL_LABEL` src/app.js:1427 | AI-036, AI-053, AI-058, AI-060, AI-061 |
| `runAgentTool()` src/app.js:1428 | AI-049, AI-053, AI-054, AI-055, AI-060, AI-061, AI-062 |
| `aiAgentStep()` src/app.js:1440 | AI-035, AI-037, AI-040, AI-126 |
| `agentChips()` src/app.js:1447 | AI-062, AI-077, AI-078, AI-079, AI-080 |
| `askAIAgent()` src/app.js:1458 | AI-035 … AI-048, AI-070, AI-098, AI-124, AI-126 |
| `stripJson()` src/app.js:1511 | AI-090 |
| `visualContext()` src/app.js:1526 | AI-016, AI-088 |
| `generateVisual()` src/app.js:1535 | AI-016, AI-084 … AI-098 |
| `errHint()` src/app.js:1594 | AI-004, AI-122, AI-123, AI-095 |
| `attachMentions()` src/app.js:1601 | AI-114, AI-115, AI-118, AI-119 |
| `submitToNote()` src/app.js:1622 | AI-019, AI-020, AI-047, AI-116 |
| `routeAndAct()` src/app.js:1637 | AI-012, AI-014 … AI-022 |
| `isVisualRequest()` src/app.js:1652 | AI-021, AI-022 |
| `askAboutDocument()` src/app.js:1669 | AI-080, AI-119 |
| `msgCard()` ai_answer branch src/app.js:1804-1814 | AI-026, AI-074, AI-075, AI-124 |
| `msgCard()` generated_visual branch src/app.js:1815-1829 | AI-084, AI-085, AI-086, AI-092, AI-094 |
| `saveAndReask()` src/app.js:2165 + "Save & re-ask AI" | AI-023, AI-127 |
| `traceHTML()` src/app.js:1939 | AI-032, AI-064 … AI-073 |
| `mdInline()` src/app.js:1958 | AI-101, AI-103, AI-104, AI-117 |
| `mdLite()` src/app.js:1969 | AI-099 … AI-102, AI-105 |
| `RICH_FENCE` / `codeBlockHTML()` src/app.js:2002, 2007 | AI-106, AI-107, AI-111 |
| `mathToken()` / `protectMath()` src/app.js:2010, 2017 | AI-108, AI-109, AI-110, AI-111 |
| `restoreRich()` / `richSegments()` src/app.js:2027, 2029 | AI-106, AI-107 |
| `mdRich()` src/app.js:2039 | AI-099 … AI-112 |
| `commentHTML()` src/app.js:2041 | AI-113, AI-117 |
| `ensureMathJax()` src/app.js:2051 | AI-108, AI-112 |
| `mathRoots()` / `typesetMath()` / `scheduleTypeset()` src/app.js:2066, 2072, 2078 | AI-108, AI-112 |
| `render()` streaming autoscroll src/app.js:2143-2149 | AI-044, AI-046, AI-098 |
| `render()` disclosure persistence src/app.js:2117 | AI-071, AI-082 |
| `render()` composer draft restore src/app.js:2091, 2154 | AI-118 |
| `chipRow()` src/app.js:1727 + `.chip.dim` | AI-075, AI-078, AI-083 |
| `actorAvatar()` / `providerGlyph()` src/app.js:1713, 1708 | AI-001, AI-003, AI-011 |
| `PROVIDER_LABEL` src/app.js:49 | AI-001, AI-003 |
| `DEFAULT_MODELS` src/app.js:50 | AI-002, AI-009, AI-012 |
| `autoTag()` src/app.js:1222 + `TAG_CLASS` | AI-018, AI-034, AI-096 |
| `cardKind()` src/app.js:1833 | AI-014, AI-096 |
| `safeImgSrc()` src/app.js:20 | AI-086, AI-097 |
| `save()` / `rehydrateAssets()` IndexedDB offload src/app.js:151, 144 | AI-025, AI-045, AI-097 |
| `promptFor()` / `DEFAULT_PROMPTS` src/app.js:2684, 2650 | AI-012, AI-089, AI-091 |
| `toolDesc()` / `DEFAULT_TOOLS` src/app.js:2704, 2691 | AI-052 |
| `api/ai.js` provider guard :86 | AI-040, AI-128 |
| `api/ai.js` compat-no-key :91 | AI-004 |
| `api/ai.js` no-key :94 | AI-122 |
| `api/ai.js` HTTPS / allowlist :97-98 | AI-007, AI-008 |
| `api/ai.js` `agentStep()` :69 | AI-035, AI-037 |
| `api/ai.js` `chatCall()` + web plugin :52, 63 | AI-002, AI-033, AI-051 |
| `api/ai.js` `isQuotaErr` / `QUOTA_MSG` :31-32 | AI-120, AI-121 |
| `api/ai.js` status mirroring :109 | AI-125 |
| `api/ai-image.js` provider / key / allowlist :42-53 | AI-007, AI-129 |
| `api/ai-image.js` OpenRouter image extraction :57-67 | AI-086, AI-129 |
| `api/ai-image.js` quota :79 | AI-120 |
| "✦ Ask AI" app.html:122 | AI-001, AI-020 |
| "Ask about this document…" src/app.js:3165 | AI-080, AI-119 |
| "Reply or ask a follow-up…" src/app.js:1924 | AI-114, AI-118 |
| "Show the agent's work" src/app.js:1956 | AI-032, AI-064 … AI-073 |
| "No tools were needed — answered directly from the context." src/app.js:1953 | AI-032, AI-065 |
| "What this answer used" src/app.js:1811 | AI-075 |
| "ⓘ AI-generated · … · sources" src/app.js:1811 | AI-009, AI-074 |
| "The document doesn't seem to cover that — …" src/app.js:1501 | AI-042 |
| "Could not render the diagram — please try again." src/app.js:1584 | AI-092 |
| "Image generation failed: " / "Visual unavailable" src/app.js:1574 | AI-093, AI-094 |
| "Visual generation failed" src/app.js:1590 | AI-095 |
| "AI-generated illustration · not extracted data" / "Text diagram from the document" src/app.js:1827 | AI-085, AI-086 |
| "Region captured — ask the AI about it below." src/app.js:1081 | AI-024 |
| `QUOTA_MSG` "The site's shared demo quota is used up right now — …" | AI-120, AI-121 |
| `.typing` / `@keyframes bl` src/styles.css:361-363 | AI-026, AI-036, AI-084 |
| `.badge-gen` src/styles.css:318 | AI-084, AI-085, AI-086 |
| `.vis-card` / `.ascii` / `.vis-take` src/styles.css:320-324 | AI-085, AI-086 |
| `.trace` / `.tr-step` / `.tr-body` src/styles.css:265-273 | AI-064, AI-067, AI-068, AI-073 |
| `.prov` disclosure src/styles.css:256-263 | AI-074, AI-075 |
| `.men-box` / `.men-hl` / `.men-input` src/styles.css:305-310 | AI-114, AI-115, AI-119 |
| `.md-*` render styles src/styles.css:211-228 | AI-099 … AI-105 |
| `pre.code-block` / `mjx-container` src/styles.css:621-628 | AI-106, AI-108, AI-109 |
| `.avatar.openrouter` / missing `.avatar.compat` src/styles.css:481 | AI-011 |
| `msg.external` / `msg.tools` fields src/app.js:1356 | none - see below |

## Deliberately not covered here

- **The Settings UI itself** - the AI & Tools tab layout, the Default radio behaviour, key masking, the six model inputs, the Templates editors, prompt export/import, and the Storage tab - is covered in `12-settings-and-templates.md`. This document only asserts the *effect* of those settings on an AI request (AI-003, AI-005, AI-009, AI-049…AI-052).
- **Escaping and sanitisation proofs** - hostile tool names, hostile model names, `javascript:` links, SVG data URLs, the math sentinel forgery, imported-note ids - are `13-security-and-privacy.md` (`SEC-030`…`SEC-048`). Checks here assert that content *renders*, not that hostile content is neutralised.
- **The generic error surface** - toast colour, stacking, lifetime, escaping - and the `/api` proxy's request-level guards tested by direct `fetch` are `18-error-states-and-recovery.md` (`ERR-005`…`ERR-010`, `ERR-078`…`ERR-090`). AI-040 and AI-120 intentionally duplicate `ERR-073` and `ERR-068` because they are load-bearing for this document's core paths; keep both in sync.
- **Note-thread mechanics that are not AI-specific** - collapse/expand, "Show on card", copy note / copy response, delete note / delete reply, tag add/remove, filters, sorting, notes search, the day separators - belong to the notes-panel document (prefix `NOTE`). They are touched here only where an AI message is the subject (AI-023, AI-096, AI-127).
- **Annotation creation** - the selection popover, the capture mask, comment placement and anchoring - is `06-annotation-tools.md`. Only the handoff into the AI (`askNextId`, the screenshot data URL) is checked here (AI-020, AI-024, AI-025).
- **Export and share rendering of AI content** - `buildSheet()`'s "AI response · <provider>" blocks, the `Approximate` badge, MathJax typesetting inside `#exportRoot`, and the self-contained `.annotated.html` - are the export/share document. `mathRoots()` explicitly includes `#exportRoot` (`src/app.js:2069`); that branch is exercised there, not here.
- **OCR** - `detectAndOfferOcr`, the banner, progress and cancel - is `09-ocr.md`. It matters to this document only as a precondition: on a scanned PDF the agent's text tools return empty results until OCR has run (noted in AI-059).
- **`msg.external` and `msg.tools`** (`src/app.js:1356`) are written on every AI message and never read or rendered anywhere. There is nothing observable to check; if a future UI starts surfacing them, they need their own checks.
- **`aiClassify`'s `mode:"text"` field** is sent but ignored by the server (`api/ai.js` only branches on `mode === 'agent'`). Not testable from the UI.
- **The `foldSystem` behaviour** (`api/ai.js:55-58`, OpenRouter only) and `capTokens`' reasoning-token buffer (`api/ai.js:13`) are server-side transformations with no observable client signal beyond answer quality. They are covered indirectly by AI-002 (the envelope the client sends) and by any answer that comes back non-empty; a dedicated check would need upstream request logging.
- **Performance envelopes** - time-to-first-token, the cost of seven agent iterations, `localStorage` growth from persisted traces, and MathJax's download weight - are quantified in `17-performance-and-limits.md`. AI-043, AI-060 and AI-070 assert only the structural caps.
- **Mobile/touch specifics of the composers** - the soft-keyboard inset, the drawer-mode popover pinning, and mention-mirror drift under iOS zoom - are `14-responsive-mobile-touch.md`. AI-114 flags the resize risk but does not test phone layouts.
- **No Chromium-only API is used anywhere in this document.** `showSaveFilePicker` / `showDirectoryPicker` are not on any AI path. The genuine cross-engine risks here are the `<details>` marker suppression (AI-074), the three different network-error strings (AI-123), and MathJax SVG inline layout (AI-108) - all of which must be re-run on Firefox and Safari.
