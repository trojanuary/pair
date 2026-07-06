// Vercel serverless function: server-side image generation proxy.
// Env key by default, or BYO key from the request. OpenRouter (default), OpenAI (gpt-image), or Google (Imagen).
const ENV = { openrouter: 'OPENROUTER_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };
const DEFAULT_IMG = { openrouter: 'x-ai/grok-imagine-image-quality', openai: 'gpt-image-1', gemini: 'imagen-3.0-generate-002' };
const OR_HEADERS = { 'HTTP-Referer': 'https://pair-liart.vercel.app', 'X-Title': 'Source-Linked AI Reading Workspace' };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise(r => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } }); });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { provider = 'openrouter', prompt = '', model, userKey } = await readBody(req);
    if (provider !== 'openrouter' && provider !== 'openai' && provider !== 'gemini') return res.status(400).json({ error: `${provider} can't generate images — use OpenRouter, OpenAI, or Gemini.` });
    const key = (userKey && String(userKey).trim()) || process.env[ENV[provider]];
    if (!key) return res.status(400).json({ error: `No ${provider} image key available. Add your own in Settings, or set ${ENV[provider]}.` });
    const m = model || DEFAULT_IMG[provider];
    let image = null;

    if (provider === 'openrouter') {
      // OpenRouter generates images through the chat-completions endpoint with the image modality.
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, ...OR_HEADERS },
        body: JSON.stringify({ model: m, messages: [{ role: 'user', content: prompt }], modalities: ['image', 'text'] }),
      });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || j.error || 'OpenRouter image error');
      const img = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!img) throw new Error('No image returned by OpenRouter');
      image = img;
    } else if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: m, prompt, size: '1024x1024', n: 1 }),
      });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'OpenAI image error');
      image = j.data[0].b64_json ? ('data:image/png;base64,' + j.data[0].b64_json) : j.data[0].url;
    } else {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:predict?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
      });
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Imagen error');
      const b = j.predictions?.[0]?.bytesBase64Encoded; if (!b) throw new Error('No image returned'); image = 'data:image/png;base64,' + b;
    }
    return res.status(200).json({ image });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
