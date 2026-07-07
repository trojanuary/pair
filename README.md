# PeerReview — a source-linked AI reading workspace

> Read papers and reports with an AI that stays **pinned to the source**. Every highlight, note, screenshot, and AI answer is anchored to the exact spot in the PDF it came from — so nothing floats free of its evidence.

**▶ Try it now: [pairedx.com](https://pairedx.com)** — no signup, no install. Hit **Open app** to load the bundled *Attention Is All You Need* sample, or drop in your own PDF.

<div align="center"><img src="https://pub.hyperagent.com/api/published/pbf01KWYP4M3R_VEWNE016S50G5SE4/demo-reel.gif" alt="PeerReview in action — highlight a passage, ask the AI, and get a source-linked answer with rendered math and a generated image" width="820"></div>

---

## What it is

A single-user, in-browser reading workspace for papers and reports. Open a PDF, highlight text or screenshot a figure, and ask an AI about it — the answer is saved as a note **linked to that exact passage or region**, with a visible connector back to the page. Everything lives in your browser (and, optionally, in a portable `.notes.json` next to your PDF).

- **Source-linked notes** — highlights, comments, screenshots, and AI answers all pin to their location in the document.
- **A tool-using AI agent** — for questions it needs more context for, the AI can read other pages, search the whole document, pull the outline, and generate diagrams/images — you can watch every step under *“Show the agent’s work.”*
- **Renders math & code** — LaTeX (`\( … \)`, `\[ … \]`, `$$ … $$`) is typeset with MathJax; fenced code blocks render as code.
- **Screenshots of figures** — box any figure/equation and ask about it directly.
- **Continuous or single-page** reading, with find-in-document, filters, and tags.
- **Bring your own model** — OpenRouter (default) or any OpenAI-compatible endpoint. Your key is stored only in your browser.
- **Portable storage** — notes stay in the browser and can auto-save to a folder as `<doc>.notes.json` (Chrome/Edge), so they travel with the PDF (great for Drive folders and other machines). Export/Import works in any browser.
- **Fully customizable prompts** — edit every system prompt and even the agent’s tool descriptions in **Settings → Templates**, and export/import them as JSON.

## Using the app

**1. Open a document.** The sample paper loads automatically; use **New** (left sidebar) to open your own PDF. It’s cached in your browser — nothing is uploaded to a server.

**2. Pick a tool** (top toolbar):

- **Cursor** — select text to get a small popover: **Highlight · Note · Ask AI**.
- **Highlight (pen)** — drag to drop a yellow highlight instantly.
- **Comment** — click anywhere on the page to drop a point comment.
- **Screenshot** — box a figure or equation to capture it (works in single-page and continuous scroll).

**3. Ask the AI.** In any note, type a question (or just `@ai`) and send. The answer renders with math/code and stays linked to the source; open **“Show the agent’s work”** to see which tools it used.

<div align="center"><img src="https://pub.hyperagent.com/api/published/pbf01KWXBFPEJ_0F5AWE52VVH518MM/02-ai-math-answer.webp" alt="A source-linked AI answer with rendered LaTeX" width="360"></div>

**4. Save / move your notes.** In **Settings → Storage**, optionally choose a folder to auto-save a portable `<doc>.notes.json` next to your PDF, or export/import notes as JSON.

## Configure the AI

Open **Settings → AI & Tools**. Two providers, both OpenAI-compatible:

<div align="center"><img src="https://pub.hyperagent.com/api/published/pbf01KWXBFS40_GZYWNYBKMNYGFQRD/04-settings-ai.webp" alt="Settings — two providers, recommended OpenRouter" width="360"></div>

- **OpenRouter** (recommended) — one key for hundreds of models; powers text, images, and the tool-using agent.
- **OpenAI-compatible API** — point it at any endpoint (OpenAI, Together, Groq, a local model…) with a base URL + key + text/image models.

> The public site runs on a **shared key with a small test quota** so you can try it instantly. For real use, paste your own key — it’s stored **only in your browser** and sent per-request as an override; it is **never saved on the server**.

Every prompt — including the 7 agent tool descriptions — is editable and exportable under **Settings → Templates**:

<div align="center"><img src="https://pub.hyperagent.com/api/published/pbf01KWXBFWH4_0JPX0HMM2D69VQ5S/05-settings-templates.webp" alt="Settings — editable prompt templates" width="360"></div>

---

## Deploy your own (Vercel)

The site is static — a landing page (`index.html`), the app itself (`app.html`, served at `/app`), and two serverless functions in `api/`. No build step required.

1. **Fork** this repo (or “Use this template”).
2. Go to **[vercel.com/new](https://vercel.com/new)** → **Import** your fork.
3. Framework preset: **Other**. Leave Build Command empty and Output Directory as the repo root (there’s nothing to build).
4. Add **Environment Variables**:
   - `OPENROUTER_API_KEY` — your OpenRouter key (used as the default shared key).
   - `OPENAI_API_KEY` — *(optional)* used when the provider is “OpenAI-compatible” with the default OpenAI base URL.
5. **Deploy.** You’ll get a `*.vercel.app` URL.
6. *(Optional)* Add a custom domain (e.g. `pairedx.com`) in **Project → Settings → Domains**.

> Tip: keep the server key’s spending cap **low** — anyone using your public URL draws on it until they add their own key.

## Run locally

You need the [Vercel CLI](https://vercel.com/docs/cli) so the `api/` functions run alongside the static site:

```bash
npm i -g vercel
vercel dev          # serves index.html + /api on http://localhost:3000
```

Set your keys either via `vercel env` or a local `.env` (git-ignored):

```
OPENROUTER_API_KEY=sk-or-...
OPENAI_API_KEY=sk-...        # optional
```

You can also just open `index.html` directly to browse the reader UI, but the AI (`/api/*`) needs the serverless functions, i.e. `vercel dev` or a deploy.

## How it works (codebase)

```
index.html            # the landing page — self-contained: inlined fonts, CSS,
                       # SVG art, real screenshots; embeds demo.html in an iframe
demo.html             # standalone animated product demo — self-contained
                       # (embedded by the landing, and recorded for this README)
app.html              # the app — self-contained: inlined CSS, PDF.js,
                       # the sample PDF + notes, and the app JS (one IIFE)
vercel.json           # routing: /app → /app.html
api/
  ai.js               # serverless proxy: text/vision + one tool-calling agent step
  ai-image.js         # serverless proxy: image generation
src/
  app.js              # app logic (source of the inlined <script> in app.html)
  styles.css          # styles (source of the inlined <style>)
build.js              # inlines the src/ pieces into the bundled HTML
make_sample_pdf.py    # generates the bundled sample PDF
```

- **Frontend:** vanilla JS + [PDF.js](https://mozilla.github.io/pdf.js/), no framework. State (notes, settings) persists in `localStorage`; large images offload to IndexedDB. Math via MathJax (loaded on demand).
- **AI proxy:** `api/ai.js` and `api/ai-image.js` are Vercel Node functions (no npm deps, global `fetch`). They call OpenRouter or any OpenAI-compatible endpoint, using the server env key by default or a per-request BYO key. Keys are never returned to the browser.
- **The agent:** for OpenRouter/OpenAI-compatible providers, questions run a short ReAct loop — the model can call `read_page`, `search_document`, `document_outline`, `read_full_document`, `create_visual`, and `web_search` before answering.

## Privacy & keys

- Your PDFs and notes stay in your browser (and any folder you choose). Nothing is uploaded to a backend.
- API keys you enter are kept in `localStorage` and sent per-request to this app’s own `/api` proxy as an override — never persisted server-side, never exposed to other users.

## License

[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

PeerReview is free software — you can use, study, share, and modify it under the terms of the AGPL-3.0. Note the network clause (section 13): if you run a modified version as a network service, you must make the corresponding source available to its users. Copyright (C) 2026 PeerReview.
