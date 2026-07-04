# Source‑Linked AI Reading Workspace

A calm, reading‑first workspace for papers and reports where **every** note, AI answer,
screenshot, and generated visual stays linked to the exact source location in the document.
Not "chat with PDF" — a source‑linked research notebook.

> **Read deeply. Ask AI in context. Generate visual explanations. Export evidence‑linked notes.**

Open‑source, single‑user, **bring‑your‑own‑API‑key** (OpenAI / Anthropic / Google). It runs
entirely in the browser — no server, no build step.

## ▶️ Live demo

Once GitHub Pages is enabled for this repo (Settings → Pages → *Deploy from a branch* → `main` / root):

**https://trojanuary.github.io/pair/**

Or just open `index.html` locally (double‑click it). It's a single self‑contained file with
PDF.js and a sample turbulence paper bundled in, so it works offline too.

### Configure AI (optional)
Click the **⚙ gear** (bottom‑left) → paste a key for OpenAI, Anthropic, or Google and mark one
**Default**. Then, in a note, just type naturally — end with `?` or mention `@gpt` / `@claude` /
`@gemini` to ask, or say "make a visual…" to generate one. Keys are stored only in your browser.

## What it does

- **Reader** — open the bundled sample or your own PDF; page nav, zoom, search, text selection,
  highlighting, and drag‑to‑capture **screenshot regions**.
- **Source‑linking** — every highlight/screenshot gets a numbered **anchor pin** with a connector
  line to its note; click a pin ↔ jump to the note. Annotations store the quote + surrounding
  context so they can be re‑attached if the PDF changes.
- **Notes** — actor model (human vs AI), threads, **auto‑tagging**, filters, resolve, and
  **provenance chips** (`Page 7 · Section 2.3 · Used highlighted text · No external sources`).
- **Ask AI in context** — sends the selected text/screenshot + page + section + surrounding text +
  nearby caption + related passages from the same document; answers carry provenance chips.
- **Generated visuals** — image‑model cards (chart/diagram) kept linked to the source and labelled
  *approximate* when recreating a figure.
- **Export** — a clean review packet (print‑to‑PDF) with actor avatars and source chips.

## Repository layout

| Path | What |
|---|---|
| `index.html` | The app — a single self‑contained file (this is what Pages serves). |
| `src/` | Modular source: `index.html`, `styles.css`, `app.js`, bundled `pdf.min.js` + `pdf.worker.min.js`, `pdf-data.js` |
| `build.js` | Inlines `src/` into the single‑file `index.html` (`node build.js`). |
| `make_sample_pdf.py` | Regenerates the bundled Computer‑Modern sample paper (`reportlab` + `matplotlib`). |

## Build

```bash
node build.js        # regenerate index.html from src/
python3 make_sample_pdf.py   # regenerate the sample paper (writes sample-paper.pdf)
```

## Roadmap

- **Next.js + server‑side AI proxy** so keys live server‑side instead of the browser, plus real
  asset storage and multi‑document search. (This needs a server host — Vercel or Cloudflare — since
  GitHub Pages is static‑only.)
- Cross‑document library search; collaboration via the actor model.

## License

Code: MIT. The bundled sample document (`sample-paper.pdf`) is released under CC BY 4.0.
