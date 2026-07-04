# Google Drive integration

Open PDFs straight from your Google Drive and save an evidence‑notes JSON back to Drive — all
client‑side (no server changes). It uses Google Identity Services (OAuth token) + the Google
Picker, with the least‑privilege **`drive.file`** scope: the app only ever sees the PDFs you
explicitly pick, plus files it creates.

## What you get
- **Open from Drive** button in the left sidebar → Google sign‑in → Picker (filtered to PDFs) →
  the file downloads into the reader and is added to your library (marked as a Drive doc).
- **Save notes to Google Drive** in the Notes ⋯ menu → uploads a `"<doc> — notes.json"` with every
  highlight, comment, AI answer, and its provenance for the current document.

## One‑time setup (Google Cloud)
1. Create/choose a project at <https://console.cloud.google.com/>.
2. **APIs & Services → Enable APIs**: enable **Google Drive API** and **Google Picker API**.
3. **OAuth consent screen**: configure it (External is fine for testing; add yourself as a test user).
4. **Credentials → Create OAuth client ID → Web application**:
   - **Authorized JavaScript origins**: add your site origin(s), e.g.
     `https://pair-liart.vercel.app`, your branch/preview URL, and `http://localhost:8099` for local.
   - Copy the **Client ID** (`…apps.googleusercontent.com`).
5. **Credentials → Create API key** (a browser key). Recommended: restrict it to the Drive + Picker
   APIs and to your site as an HTTP‑referrer. Copy the **API key** (`AIza…`).
6. In the app: **Settings (gear) → Google Drive**, paste the **Client ID** and **API key**, Save.

Keys are stored only in your browser (localStorage) and are safe to expose for a web OAuth client.

## Notes / limits
- Works on the deployed site (or any origin you authorized) — not when opening the HTML file directly
  (`file://` can't run the OAuth flow).
- Scope is `drive.file` (minimal). To browse *all* Drive files you'd switch to `drive.readonly`, which
  triggers Google's app‑verification process — intentionally avoided here.
- Downloaded PDFs are cached in the browser (IndexedDB) like any opened file; re‑opening the same
  Drive file re‑downloads it.
