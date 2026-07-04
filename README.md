# Source‑Linked AI Reading Workspace

A calm, reading‑first workspace for papers and reports where **every** note, AI answer,
screenshot, and generated visual stays linked to the exact source location in the document.
Not "chat with PDF" — a source‑linked research notebook.

> **Read deeply. Ask AI in context. Generate visual explanations. Export evidence‑linked notes.**

Static frontend + a tiny **server‑side AI proxy** (Vercel serverless functions). Runs in the
browser; AI calls go through `/api/ai` so provider keys stay **server‑side**, with an optional
per‑user **bring‑your‑own‑key** override.

## Architecture

| Path | What |
|---|---|
| `index.html` | The app — a single self‑contained file (PDF.js + sample paper bundled). |
| `api/ai.js` | Serverless proxy for text/vision (OpenAI / Anthropic / Gemini). |
| `api/ai-image.js` | Serverless proxy for image generation (OpenAI / Gemini). |
| `src/` | Modular source (`app.js`, `styles.css`, `index.html`, bundled PDF.js, `pdf-data.js`). |
| `build.js` | Inlines `src/` into `index.html` (`node build.js`). |
| `make_sample_pdf.py` | Regenerates the bundled sample paper (reportlab + matplotlib). |

The proxy uses the site's env key by default; if a user pastes their own key in **Settings**, it's
sent per‑request as an override and never stored server‑side.

## Deploy (Vercel — GitHub → Web pipeline)

1. Vercel → **Add New → Project → Import `trojanuary/pair`**. Framework preset: **Other**
   (zero build — static files + `/api` functions).
2. Add **Environment Variables** (any subset — a provider only works if its key is set, or if the
   user brings their own):
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
   - *(optional model overrides handled client‑side in Settings)*
3. **Deploy.** Every push to `main` auto‑deploys; each PR gets a preview URL.

No build step, no dependencies to install (functions use the built‑in `fetch`, Node 20).

## Use

Open the deployed URL (or `index.html` locally). Open the sample or your own PDF, highlight text or
capture a figure, then in a note just type naturally — end with `?` or mention `@gpt` / `@claude` /
`@gemini` to ask, or say "make a visual…" to generate one. Answers carry provenance chips
(`Page 7 · Section 2.3 · Used highlighted text · No external sources`). Notes persist in your
browser (localStorage + IndexedDB).

## Build locally

```bash
node build.js                # regenerate index.html from src/
python3 make_sample_pdf.py   # regenerate the sample paper
```

## Roadmap

- Migrate the frontend to Next.js/React (same `/api` proxy).
- Optional Supabase backend for accounts, cross‑device sync, and server‑side asset storage.

## License

Code: MIT. Bundled sample document: CC BY 4.0.
