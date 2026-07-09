// SPDX-License-Identifier: AGPL-3.0-only
// Vercel serverless function: server-side image generation proxy.
// Two providers: `openrouter` (default; images via the chat-completions image modality) and
// `compat` (any OpenAI-compatible /images/generations endpoint — base URL + key from the request).
const ENV = { openrouter: 'OPENROUTER_API_KEY', compat: 'OPENAI_API_KEY' };
const DEFAULT_IMG = { openrouter: 'google/gemini-3.1-flash-lite-image', compat: 'gpt-image-1' };
const OR_HEADERS = { 'HTTP-Referer': 'https://pairedx.com', 'X-Title': 'Source-Linked AI Reading Workspace' };
const baseOf = (u) => (u && String(u).trim() ? String(u).trim() : 'https://api.openai.com/v1').replace(/\/+$/, '');
const isQuotaErr = (e) => { const s = e && e.status; return s === 402 || s === 429 || /insufficient|quota|rate.?limit|credit|payment required|billing/i.test(String((e && e.message) || '')); };
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
    usedServerKey = !ownKey;
    const key = ownKey || process.env[ENV[provider]];
    if (!key) return res.status(400).json({ error: `No ${provider} image key available. Add your own in Settings, or set ${ENV[provider]}.` });
    const m = model || DEFAULT_IMG[provider];
    let image = null;

    if (provider === 'openrouter') {
      // OpenRouter image models generate through chat-completions; request the image modality.
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, ...OR_HEADERS },
        body: JSON.stringify({ model: m, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }], modalities: ['image', 'text'] }),
      });
      const j = await r.json(); if (!r.ok) { const err = new Error(j.error?.message || j.error || 'OpenRouter image error'); err.status = r.status; throw err; }
      const msg = (j.choices && j.choices[0] && j.choices[0].message) || {};
      image = msg.images?.[0]?.image_url?.url || msg.images?.[0]?.url || null;
      if (!image && Array.isArray(msg.content)) { const part = msg.content.find(p => p && (p.type === 'image_url' || p.image_url)); if (part) image = (part.image_url && part.image_url.url) || part.url || null; }
      if (!image && typeof msg.content === 'string') { const mm = msg.content.match(/data:image\/[a-zA-Z+.\-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/\S+?\.(?:png|jpe?g|webp|gif)/i); if (mm) image = mm[0]; }
      if (!image) throw new Error('OpenRouter returned no image. Model may not generate images. Response: ' + (typeof msg.content === 'string' ? msg.content.slice(0, 140) : JSON.stringify(msg.content || msg).slice(0, 140)));
    } else {
      // OpenAI-compatible /images/generations
      const r = await fetch(baseOf(baseUrl) + '/images/generations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: m, prompt, size: '1024x1024', n: 1 }),
      });
      const j = await r.json(); if (!r.ok) { const err = new Error(j.error?.message || j.error || 'Image error'); err.status = r.status; throw err; }
      const d = j.data && j.data[0]; if (!d) throw new Error('No image returned');
      image = d.b64_json ? ('data:image/png;base64,' + d.b64_json) : d.url;
    }
    return res.status(200).json({ image });
  } catch (e) {
    if (usedServerKey && isQuotaErr(e)) return res.status((e && e.status) || 429).json({ error: QUOTA_MSG });
    return res.status((e && e.status) || 500).json({ error: String((e && e.message) || e) });
  }
};
