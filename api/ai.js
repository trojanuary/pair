// SPDX-License-Identifier: AGPL-3.0-only
// redeploy nudge 2026-07-07T17:44:30.855Z
// Vercel serverless function: server-side AI proxy (text/vision + tool-calling agent step).
// Two providers, both OpenAI-compatible: `openrouter` (default) and `compat` (any OpenAI-compatible
// endpoint — OpenAI, Together, Groq, a local LLM… — with a user-supplied base URL + key + model).
// Uses the site's env key by default, or a user-supplied BYO key passed in the request. No npm deps.
const ENV = { openrouter: 'OPENROUTER_API_KEY', compat: 'OPENAI_API_KEY' };
const DEFAULT_MODEL = { openrouter: 'openai/gpt-5.4', compat: 'gpt-5.4' };
const OR_BASE = 'https://openrouter.ai/api/v1';
const OR_HEADERS = { 'HTTP-Referer': 'https://pairedx.com', 'X-Title': 'Source-Linked AI Reading Workspace' };
// GPT-5+/o-series are reasoning models: reasoning tokens bill against max_completion_tokens,
// so add a generous reasoning buffer or the visible answer can come back empty.
const capTokens = (m, n) => (/(^|\/)(gpt-5|o\d)/.test(m || '') ? { max_completion_tokens: n + 4000 } : { max_tokens: n });
const baseOf = (u) => (u && String(u).trim() ? String(u).trim() : 'https://api.openai.com/v1').replace(/\/+$/, '');
const isOR = (url) => url.indexOf('openrouter.ai') >= 0;
// When the CALLER supplies the endpoint (the OpenAI-compatible provider), reject SSRF targets so
// this function can't be turned into a proxy into a private network. Not a complete guard (no
// DNS-rebind protection) — the primary defense is requiring a caller-supplied key (see handler).
// A self-hoster pointing at a local model can set ALLOW_PRIVATE_ENDPOINTS=1.
const isBlockedHost = (u) => {
  let h; try { h = new URL(u).hostname.toLowerCase(); } catch (e) { return true; }
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === 'metadata.google.internal') return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const a = +m[1], b = +m[2];
    if (a === 0 || a === 127 || a === 10 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true; }
  if (h === '::1' || h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
};
// A quota / credit / rate-limit failure. When it happens on the SHARED server key we nudge the user
// to their own key instead of leaking the provider's "add credits" message (which points at the
// owner's account, not theirs, and reads as the user's fault).
const isQuotaErr = (e) => { const s = e && e.status; return s === 402 || s === 429 || /insufficient|quota|rate.?limit|limit exceeded|credit|payment required|billing|openrouter\.ai\/(workspaces|settings)/i.test(String((e && e.message) || '')); };
const QUOTA_MSG = 'The site’s shared demo quota is used up right now — add your own key in Settings → AI & Tools to keep going (it stays in your browser and is never saved on our server).';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise(r => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
}
async function postJSON(url, key, body) {
  // redirect:'error' stops a trusted host from 302-ing into a private address; the abort is a
  // backstop so a hung upstream can't pin the function open (the platform timeout is the real cap).
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(url, { method: 'POST', signal: ctrl.signal, redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, ...(isOR(url) ? OR_HEADERS : {}) }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    return { r, j };
  } finally { clearTimeout(to); }
}

// ---- Chat completion (text/vision) for any OpenAI-compatible endpoint ----
async function chatCall(url, key, { system, user, image, model, maxTokens, foldSystem, web }) {
  const imgPart = image ? { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.b64}` } } : null;
  let messages;
  if (foldSystem) {
    // OpenRouter's default models (e.g. gemma) can reject a separate system role; fold it into one user turn.
    const text = system ? system + '\n\n' + user : user;
    messages = [{ role: 'user', content: imgPart ? [{ type: 'text', text }, imgPart] : text }];
  } else {
    messages = [{ role: 'system', content: system }, { role: 'user', content: imgPart ? [{ type: 'text', text: user }, imgPart] : user }];
  }
  const body = { model, messages, ...capTokens(model, maxTokens || 900) };
  if (web && isOR(url)) body.plugins = [{ id: 'web', max_results: 3 }];   // OpenRouter web-search plugin
  const { r, j } = await postJSON(url + '/chat/completions', key, body);
  if (!r.ok) { const err = new Error(j.error?.message || j.error || 'AI error'); err.status = r.status; throw err; }
  return (j.choices?.[0]?.message?.content || '').trim();
}
// ---- One tool-calling ReAct step for any OpenAI-compatible endpoint ----
async function agentStep(url, key, { messages, tools, model }) {
  const body = { model, messages, ...capTokens(model, 1500) };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  const { r, j } = await postJSON(url + '/chat/completions', key, body);
  if (!r.ok) { const err = new Error(j.error?.message || j.error || 'AI error'); err.status = r.status; throw err; }
  const msg = j.choices?.[0]?.message || {};
  return { content: (msg.content || '').trim(), tool_calls: msg.tool_calls || null };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let usedServerKey = false;
  try {
    const body = await readBody(req);
    const { provider = 'openrouter', mode, messages, tools, model, userKey, baseUrl } = body;
    const ownKey = userKey && String(userKey).trim();
    // The OpenAI-compatible provider lets the caller name the endpoint. Never pair a caller-chosen
    // URL with the server's key — that would forward our credentials to an arbitrary host. This path
    // is bring-your-own-key only; the site's shared demo key is OpenRouter-only.
    if (provider === 'compat' && !ownKey) return res.status(400).json({ error: 'The OpenAI-compatible provider needs your own API key (add it in Settings → AI & Tools). The site’s shared demo key only works with OpenRouter.' });
    usedServerKey = !ownKey;
    const key = ownKey || process.env[ENV[provider]];
    if (!key) return res.status(400).json({ error: `No ${provider} key available. Add your own key in Settings, or ask the site owner to set ${ENV[provider] || 'the API key'}.` });
    const url = provider === 'openrouter' ? OR_BASE : baseOf(baseUrl);
    if (provider === 'compat' && !process.env.ALLOW_PRIVATE_ENDPOINTS) {
      if (!/^https:\/\//i.test(url)) return res.status(400).json({ error: 'Custom endpoints must use HTTPS.' });
      if (isBlockedHost(url)) return res.status(400).json({ error: 'That endpoint host isn’t allowed.' });
    }
    const m = model || DEFAULT_MODEL[provider] || DEFAULT_MODEL.compat;
    if (mode === 'agent' && Array.isArray(messages)) {
      return res.status(200).json(await agentStep(url, key, { messages, tools, model: m }));
    }
    const { system = '', user = '', image = null, maxTokens, web = false } = body;
    const text = await chatCall(url, key, { system, user, image, model: m, maxTokens, foldSystem: provider === 'openrouter', web });
    return res.status(200).json({ text });
  } catch (e) {
    if (usedServerKey && isQuotaErr(e)) return res.status((e && e.status) || 429).json({ error: QUOTA_MSG });
    return res.status((e && e.status) || 500).json({ error: String((e && e.message) || e) });
  }
};
