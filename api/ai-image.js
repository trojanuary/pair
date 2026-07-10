// SPDX-License-Identifier: AGPL-3.0-only
// Vercel serverless function: server-side image generation proxy.
// Two providers: `openrouter` (default; images via the chat-completions image modality) and
// `compat` (any OpenAI-compatible /images/generations endpoint — base URL + key from the request).
const ENV = { openrouter: 'OPENROUTER_API_KEY', compat: 'OPENAI_API_KEY' };
const DEFAULT_IMG = { openrouter: 'google/gemini-3.1-flash-lite-image', compat: 'gpt-image-1' };
const OR_HEADERS = { 'HTTP-Referer': 'https://pairedx.com', 'X-Title': 'Source-Linked AI Reading Workspace' };
const baseOf = (u) => (u && String(u).trim() ? String(u).trim() : 'https://api.openai.com/v1').replace(/\/+$/, '');
// Server-proxied custom endpoints are restricted to an allowlist of known OpenAI-compatible
// providers (a string block on private literals is bypassable via DNS). Self-hosters set
// ALLOW_PRIVATE_ENDPOINTS=1 to point at any/local endpoint.
const COMPAT_HOSTS = new Set([
  'api.openai.com', 'api.together.xyz', 'api.together.ai', 'api.groq.com', 'api.mistral.ai',
  'api.deepinfra.com', 'api.fireworks.ai', 'api.perplexity.ai', 'api.x.ai', 'api.deepseek.com',
  'generativelanguage.googleapis.com', 'openrouter.ai',
]);
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } };
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
      if (!COMPAT_HOSTS.has(hostOf(u))) return res.status(400).json({ error: 'That endpoint isn’t a recognized OpenAI-compatible provider. Use a known provider, or self-host PairedX to point at any endpoint.' });
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
