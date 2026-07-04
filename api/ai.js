// Vercel serverless function: server-side AI proxy (text/vision), with optional web search.
// Uses the site's env key by default, or a user-supplied BYO key passed in the request.
// No npm deps — global fetch (Node 18+).
const ENV = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };
const DEFAULT_MODEL = { openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022', gemini: 'gemini-1.5-pro' };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise(r => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
}

// ---- OpenAI (chat completions; swaps to a web-search model when web is on and there's no image) ----
async function openaiCall(key, { system, user, image, model, web }) {
  const content = image ? [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.b64}` } }] : user;
  const useSearch = web && !image;
  const body = { model: useSearch ? 'gpt-4o-search-preview' : (model || DEFAULT_MODEL.openai),
    messages: [{ role: 'system', content: system }, { role: 'user', content }], max_tokens: 900 };
  if (useSearch) body.web_search_options = {};
  let r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body),
  });
  let j = await r.json();
  // Resilience: if the search-preview model isn't available on this account, retry once without web search.
  if (!r.ok && useSearch) {
    const b2 = { model: model || DEFAULT_MODEL.openai, messages: body.messages, max_tokens: 900 };
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(b2),
    });
    j = await r.json();
  }
  if (!r.ok) throw new Error(j.error?.message || 'OpenAI error');
  return (j.choices?.[0]?.message?.content || '').trim();
}

// ---- Anthropic (adds the server-side web_search tool when web is on) ----
async function anthropicCall(key, { system, user, image, model, web }) {
  const content = image ? [{ type: 'text', text: user }, { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.b64 } }] : user;
  const body = { model: model || DEFAULT_MODEL.anthropic, max_tokens: 1200, system, messages: [{ role: 'user', content }] };
  if (web) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body),
  });
  const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Anthropic error');
  return (j.content || []).map(c => (c.type === 'text' ? c.text : '')).join('').trim();
}

// ---- Gemini (adds Google Search grounding when web is on) ----
async function geminiCall(key, { system, user, image, model, web }) {
  const m = model || DEFAULT_MODEL.gemini;
  const parts = image ? [{ text: user }, { inline_data: { mime_type: image.mime, data: image.b64 } }] : [{ text: user }];
  const body = { system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }] };
  if (web) body.tools = [/1\.5/.test(m) ? { google_search_retrieval: {} } : { google_search: {} }];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Gemini error');
  return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { provider = 'openai', system = '', user = '', image = null, model, userKey, web = false } = await readBody(req);
    const key = (userKey && String(userKey).trim()) || process.env[ENV[provider]];
    if (!key) return res.status(400).json({ error: `No ${provider} key available. Add your own key in Settings, or ask the site owner to set ${ENV[provider] || 'the API key'}.` });
    const args = { system, user, image, model, web };
    let text = '';
    if (provider === 'openai') text = await openaiCall(key, args);
    else if (provider === 'anthropic') text = await anthropicCall(key, args);
    else if (provider === 'gemini') text = await geminiCall(key, args);
    else return res.status(400).json({ error: 'Unknown provider' });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
