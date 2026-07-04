// Vercel serverless function: server-side AI proxy (text/vision).
// Uses the site's env key by default, or a user-supplied BYO key passed in the request.
// No npm deps — global fetch (Node 18+).
const ENV = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };
const DEFAULT_MODEL = { openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022', gemini: 'gemini-1.5-pro' };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise(r => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { provider = 'openai', system = '', user = '', image = null, model, userKey } = await readBody(req);
    const key = (userKey && String(userKey).trim()) || process.env[ENV[provider]];
    if (!key) return res.status(400).json({ error: `No ${provider} key available. Add your own key in Settings, or ask the site owner to set ${ENV[provider] || 'the API key'}.` });
    const m = model || DEFAULT_MODEL[provider];
    let text = '';

    if (provider === 'openai') {
      const content = image ? [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.b64}` } }] : user;
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: m, messages: [{ role: 'system', content: system }, { role: 'user', content }], max_tokens: 900 }),
      });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'OpenAI error');
      text = (j.choices?.[0]?.message?.content || '').trim();

    } else if (provider === 'anthropic') {
      const content = image ? [{ type: 'text', text: user }, { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.b64 } }] : user;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: m, max_tokens: 900, system, messages: [{ role: 'user', content }] }),
      });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Anthropic error');
      text = (j.content || []).map(c => c.text || '').join('').trim();

    } else if (provider === 'gemini') {
      const parts = image ? [{ text: user }, { inline_data: { mime_type: image.mime, data: image.b64 } }] : [{ text: user }];
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }] }),
      });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Gemini error');
      text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();

    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
