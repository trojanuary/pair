// SPDX-License-Identifier: AGPL-3.0-only
// redeploy nudge 2026-07-05T20:12:51.929Z
// Vercel serverless function: server-side AI proxy (text/vision + tool-calling agent step).
// Two providers, both OpenAI-compatible: `openrouter` (default) and `compat` (any OpenAI-compatible
// endpoint — OpenAI, Together, Groq, a local LLM… — with a user-supplied base URL + key + model).
// Uses the site's env key by default, or a user-supplied BYO key passed in the request. No npm deps.
const ENV = { openrouter: 'OPENROUTER_API_KEY', compat: 'OPENAI_API_KEY' };
const DEFAULT_MODEL = { openrouter: 'openai/gpt-5.4-mini', compat: 'gpt-5.4-mini' };
const OR_BASE = 'https://openrouter.ai/api/v1';
const OR_HEADERS = { 'HTTP-Referer': 'https://pairedx.com', 'X-Title': 'Source-Linked AI Reading Workspace' };
// GPT-5+/o-series are reasoning models: reasoning tokens bill against max_completion_tokens,
// so add a generous reasoning buffer or the visible answer can come back empty.
const capTokens = (m, n) => (/(^|\/)(gpt-5|o\d)/.test(m || '') ? { max_completion_tokens: n + 4000 } : { max_tokens: n });
const baseOf = (u) => (u && String(u).trim() ? String(u).trim() : 'https://api.openai.com/v1').replace(/\/+$/, '');
const isOR = (url) => url.indexOf('openrouter.ai') >= 0;

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise(r => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
}
async function postJSON(url, key, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, ...(isOR(url) ? OR_HEADERS : {}) }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  return { r, j };
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
  if (!r.ok) throw new Error(j.error?.message || j.error || 'AI error');
  return (j.choices?.[0]?.message?.content || '').trim();
}
// ---- One tool-calling ReAct step for any OpenAI-compatible endpoint ----
async function agentStep(url, key, { messages, tools, model }) {
  const body = { model, messages, ...capTokens(model, 1500) };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  const { r, j } = await postJSON(url + '/chat/completions', key, body);
  if (!r.ok) throw new Error(j.error?.message || j.error || 'AI error');
  const msg = j.choices?.[0]?.message || {};
  return { content: (msg.content || '').trim(), tool_calls: msg.tool_calls || null };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await readBody(req);
    const { provider = 'openrouter', mode, messages, tools, model, userKey, baseUrl } = body;
    const key = (userKey && String(userKey).trim()) || process.env[ENV[provider]];
    if (!key) return res.status(400).json({ error: `No ${provider} key available. Add your own key in Settings, or ask the site owner to set ${ENV[provider] || 'the API key'}.` });
    const url = provider === 'openrouter' ? OR_BASE : baseOf(baseUrl);
    const m = model || DEFAULT_MODEL[provider] || DEFAULT_MODEL.compat;
    if (mode === 'agent' && Array.isArray(messages)) {
      return res.status(200).json(await agentStep(url, key, { messages, tools, model: m }));
    }
    const { system = '', user = '', image = null, maxTokens, web = false } = body;
    const text = await chatCall(url, key, { system, user, image, model: m, maxTokens, foldSystem: provider === 'openrouter', web });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
