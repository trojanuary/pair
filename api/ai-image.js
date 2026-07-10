// SPDX-License-Identifier: AGPL-3.0-only
// Vercel serverless function: server-side image generation proxy.
// Two providers: `openrouter` (default; images via the chat-completions image modality) and
// `compat` (any OpenAI-compatible /images/generations endpoint — base URL + key from the request).
const ENV = { openrouter: 'OPENROUTER_API_KEY', compat: 'OPENAI_API_KEY' };
const DEFAULT_IMG = { openrouter: 'google/gemini-3.1-flash-lite-image', compat: 'gpt-image-1' };
const OR_HEADERS = { 'HTTP-Referer': 'https://pairedx.com', 'X-Title': 'Source-Linked AI Reading Workspace' };
const baseOf = (u) => (u && String(u).trim() ? String(u).trim() : 'https://api.openai.com/v1').replace(/\/+$/, '');
// When the caller supplies the endpoint (OpenAI-compatible provider), reject SSRF targets so this
// function can't be turned into a proxy into a private network. A self-hoster pointing at a local
// image model can set ALLOW_PRIVATE_ENDPOINTS=1.
const isBlockedHost = (u) => {
  let h; try { h = new URL(u).hostname.toLowerCase(); } catch (e) { return true; }
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === 'metadata.google.internal') return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const a = +m[1], b = +m[2];
    if (a === 0 || a === 127 || a === 10 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true; }
  if (h === '::1' || h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
};
// POST JSON with an abort backstop and no redirect-following (SSRF hardening).
async function post(url, headers, body) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(url, { method: 'POST', signal: ctrl.signal, redirect: 'error', headers, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    return { r, j };
  } finally { clearTimeout(to); }
}
const isQuotaErr = (e) => { const s = e && e.status; return s === 402 || s === 429 || /insufficient|quota|rate.?limit|limit exceeded|credit|payment required|billing|openrouter\.ai\/(workspaces|settings)/i.test(String((e && e.message) || '')); };
const QUOTA_MSG = 'The site’s shared demo quota is used up right now — add your own key in Settings → AI & Tools to keep going (it stays in your browser and is never saved on our server).';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise(r => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let usedServerKey = false;
  try {
    const { provider = 'openrouter', prompt = '', model, userKey, baseUrl } = await readBody(req);
    if (provider !== 'openrouter' && provider !== 'compat') return res.status(400).json({ error: `${provider} can't generate images — use OpenRouter or an OpenAI-compatible endpoint.` });
    const ownKey = userKey && String(userKey).trim();
    // Caller-chosen endpoint (compat) must never ride the server's key — bring-your-own-key only.
    if (provider === 'compat' && !ownKey) return res.status(400).json({ error: 'The OpenAI-compatible provider needs your own API key (add it in Settings → AI & Tools).' });
    usedServerKey = !ownKey;
    const key = ownKey || process.env[ENV[provider]];
    if (!key) return res.status(400).json({ error: `No ${provider} image key available. Add your own in Settings, or set ${ENV[provider]}.` });
    const m = model || DEFAULT_IMG[provider];
    if (provider === 'compat' && !process.env.ALLOW_PRIVATE_ENDPOINTS) {
      const u = baseOf(baseUrl);
      if (!/^https:\/\//i.test(u)) return res.status(400).json({ error: 'Custom endpoints must use HTTPS.' });
      if (isBlockedHost(u)) return res.status(400).json({ error: 'That endpoint host isn’t allowed.' });
    }
    let image = null;

    if (provider === 'openrouter') {
      // OpenRouter image models generate through chat-completions; request the image modality.
      const { r, j } = await post('https://openrouter.ai/api/v1/chat/completions',
        { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, ...OR_HEADERS },
        { model: m, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }], modalities: ['image', 'text'] });
      if (!r.ok) { const err = new Error(j.error?.message || j.error || 'OpenRouter image error'); err.status = r.status; throw err; }
      const msg = (j.choices && j.choices[0] && j.choices[0].message) || {};
      image = msg.images?.[0]?.image_url?.url || msg.images?.[0]?.url || null;
      if (!image && Array.isArray(msg.content)) { const part = msg.content.find(p => p && (p.type === 'image_url' || p.image_url)); if (part) image = (part.image_url && part.image_url.url) || part.url || null; }
      if (!image && typeof msg.content === 'string') { const mm = msg.content.match(/data:image\/[a-zA-Z+.\-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/\S+?\.(?:png|jpe?g|webp|gif)/i); if (mm) image = mm[0]; }
      if (!image) throw new Error('OpenRouter returned no image. Model may not generate images. Response: ' + (typeof msg.content === 'string' ? msg.content.slice(0, 140) : JSON.stringify(msg.content || msg).slice(0, 140)));
    } else {
      // OpenAI-compatible /images/generations
      const { r, j } = await post(baseOf(baseUrl) + '/images/generations',
        { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        { model: m, prompt, size: '1024x1024', n: 1 });
      if (!r.ok) { const err = new Error(j.error?.message || j.error || 'Image error'); err.status = r.status; throw err; }
      const d = j.data && j.data[0]; if (!d) throw new Error('No image returned');
      image = d.b64_json ? ('data:image/png;base64,' + d.b64_json) : d.url;
    }
    return res.status(200).json({ image });
  } catch (e) {
    if (usedServerKey && isQuotaErr(e)) return res.status((e && e.status) || 429).json({ error: QUOTA_MSG });
    return res.status((e && e.status) || 500).json({ error: String((e && e.message) || e) });
  }
};
