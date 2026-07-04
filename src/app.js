/* =====================================================================
   Source-Linked AI Reading Workspace — prototype (vanilla JS + PDF.js)
   Single-user. BYO API key (client-side, live). Everything source-linked.
   Wrapped in an IIFE so our identifiers (e.g. $, $$) never collide with
   globals leaked by the inlined PDF.js bundles.
   ===================================================================== */
(function () {
'use strict';

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
const nowISO = () => new Date().toISOString();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function toast(msg, kind) {
  const t = el(`<div class="toast ${kind || ''}">${esc(msg)}</div>`);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, kind === 'err' ? 6000 : 3200);
  setTimeout(() => t.remove(), kind === 'err' ? 6500 : 3700);
}

/* ---------- state ---------- */
const LS = 'srw_state_v1';
const ACTORS = {
  you:   { name: 'You',            initials: 'YO', color: '#2563EB', type: 'human' },
  sara:  { name: 'Sara Davis',     initials: 'SD', color: '#059669', type: 'human' },
  bonnie:{ name: 'Bonnie Kearney', initials: 'BK', color: '#2563EB', type: 'human' },
};
const PROVIDER_LABEL = { openai: 'GPT', anthropic: 'Claude', gemini: 'Gemini' };
const DEFAULT_MODELS = {
  openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022', gemini: 'gemini-1.5-pro',
  openaiImage: 'gpt-image-1', geminiImage: 'imagen-3.0-generate-002',
};
function defaultState() {
  return {
    settings: {
      provider: 'openai',
      models: { ...DEFAULT_MODELS },
      keys: { openai: '', anthropic: '', gemini: '' },
      enableVisuals: true, enableWeb: false, enablePython: false,
      actorName: 'You', actorInitials: 'YO',
    },
    annotations: [],
    docs: [{ id: 'sample', name: 'Turbulence_review.pdf', kind: 'sample', addedAt: nowISO() }],
    ui: { page: 1, zoom: 1.15, tool: 'cursor', filter: 'all', autoscroll: true, sort: 'time',
          collapseLeft: false, collapseRight: false, activeId: null, activeDoc: 'sample' },
    seeded: false,
  };
}
let state = migrateState(loadState()) || defaultState();
function loadState() { try { return JSON.parse(localStorage.getItem(LS)); } catch { return null; } }
// Bring older saved state up to the multi-document model.
function migrateState(s) {
  if (!s) return null;
  if (!s.ui) s.ui = {};
  if (!Array.isArray(s.docs) || !s.docs.length) s.docs = [{ id: 'sample', name: 'Turbulence_review.pdf', kind: 'sample', addedAt: nowISO() }];
  if (!s.docs.some(d => d.id === 'sample')) s.docs.unshift({ id: 'sample', name: 'Turbulence_review.pdf', kind: 'sample', addedAt: nowISO() });
  if (!s.ui.activeDoc || !s.docs.some(d => d.id === s.ui.activeDoc)) s.ui.activeDoc = 'sample';
  // Legacy notes carried the file name as their doc label — map them onto the sample doc id.
  (s.annotations || []).forEach(a => { if (!a.doc || a.doc === 'Turbulence_review.pdf') a.doc = 'sample'; });
  return s;
}

/* ---- asset store: large base64 images live in IndexedDB (big quota), NOT localStorage.
   This keeps the persisted JSON tiny so the ~5MB localStorage limit is never the bottleneck. */
let _idb = null;
function idbOpen() {
  return new Promise(res => {
    try {
      const r = indexedDB.open('srw_assets', 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore('assets'); } catch (e) {} };
      r.onsuccess = () => { _idb = r.result; res(_idb); };
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
function idbPut(key, val) { try { if (_idb) _idb.transaction('assets', 'readwrite').objectStore('assets').put(val, key); } catch (e) {} }
function idbDel(key) { try { if (_idb) _idb.transaction('assets', 'readwrite').objectStore('assets').delete(key); } catch (e) {} }
function idbGet(key) {
  return new Promise(res => {
    try {
      if (!_idb) return res(null);
      const rq = _idb.transaction('assets', 'readonly').objectStore('assets').get(key);
      rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
async function rehydrateAssets() {
  for (const a of (state.annotations || [])) {
    if (a.screenshot === '@idb') a.screenshot = await idbGet('shot:' + a.id);
    for (const m of (a.messages || [])) if (m.image === '@idb') m.image = await idbGet('img:' + m.id);
  }
}
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      const light = JSON.parse(JSON.stringify(state));  // strip heavy images out of the localStorage copy
      for (const a of light.annotations) {
        if (typeof a.screenshot === 'string' && a.screenshot.startsWith('data:')) { idbPut('shot:' + a.id, a.screenshot); a.screenshot = '@idb'; }
        for (const m of (a.messages || [])) if (typeof m.image === 'string' && m.image.startsWith('data:')) { idbPut('img:' + m.id, m.image); m.image = '@idb'; }
      }
      localStorage.setItem(LS, JSON.stringify(light));
    } catch (e) {
      // Opaque-origin sandbox denies storage (SecurityError) -> silent; it's only a preview.
      if (e && /quota|exceeded/i.test((e.name || '') + (e.message || ''))) toast('Storage limit reached — export your notes to keep them.', 'err');
    }
  }, 250);
}

/* ---------- PDF.js ---------- */
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
let pdfDoc = null, numPages = 0, outputScale = Math.min(window.devicePixelRatio || 1, 2);
let viewport = null;                    // current page viewport (at scale)
const pageTextCache = {};               // pageNum -> {text, items, viewport}
let rendering = false, renderQueued = null;

function b64ToBytes(b64) { const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }

/* ---------- documents (real multi-doc library) ----------
   Sample PDF ships inline; user-opened PDFs persist as bytes in IndexedDB (key `pdf:<id>`)
   with a runtime cache so switching is instant. Notes are scoped per document id. */
const _docBytes = {};                         // id -> Uint8Array (runtime cache)
function docIdOf(a) { const d = a && a.doc; return (!d || d === 'Turbulence_review.pdf') ? 'sample' : d; }
function inActiveDoc(a) { return docIdOf(a) === state.ui.activeDoc; }
function activeDoc() { return state.docs.find(d => d.id === state.ui.activeDoc) || state.docs[0]; }
async function loadDocBytes(id) {
  const doc = state.docs.find(d => d.id === id); if (!doc) return null;
  if (doc.kind === 'sample') return b64ToBytes(window.SAMPLE_PDF_B64);
  if (!_docBytes[id]) { const v = await idbGet('pdf:' + id); if (v) _docBytes[id] = (v instanceof Uint8Array) ? v : new Uint8Array(v); }
  return _docBytes[id] ? _docBytes[id].slice() : null;   // hand PDF.js a copy so the cache can't be detached
}
async function switchDoc(id) {
  if (id === state.ui.activeDoc) { renderTree(); return; }
  const doc = state.docs.find(d => d.id === id); if (!doc) { toast('Document not found.', 'err'); return; }
  state.ui.activeDoc = id; state.ui.activeId = null; state.ui.page = 1;
  Object.keys(pageTextCache).forEach(k => delete pageTextCache[k]);
  save(); renderTree(); render();
  const bytes = await loadDocBytes(id);
  if (!bytes) { showReaderFallback('Could not load “' + doc.name + '”. Re-open it with New.'); return; }
  try { await initPdf(bytes); } catch (e) { showReaderFallback('Could not open “' + doc.name + '” — it may not be a valid PDF.'); return; }
  render(); drawHighlights(); drawPins();
  setTimeout(() => { for (let n = 1; n <= numPages; n++) ensurePageText(n).catch(() => {}); }, 500);
}
async function openPdfFile(f) {
  if (!f) return;
  const buf = new Uint8Array(await f.arrayBuffer());
  const id = uid('doc'), name = f.name || 'Document.pdf';
  _docBytes[id] = buf; idbPut('pdf:' + id, buf);
  state.docs.push({ id, name, kind: 'user', addedAt: nowISO() });
  save();
  await switchDoc(id);
  toast('Opened ' + name + ' — highlight text or capture a figure to start.');
}
function deleteDoc(id) {
  const doc = state.docs.find(d => d.id === id); if (!doc || doc.kind === 'sample') return;
  const n = state.annotations.filter(a => docIdOf(a) === id).length;
  if (!confirm('Remove “' + doc.name + '”' + (n ? ' and its ' + n + ' note' + (n === 1 ? '' : 's') : '') + '?')) return;
  state.docs = state.docs.filter(d => d.id !== id);
  state.annotations = state.annotations.filter(a => docIdOf(a) !== id);
  idbDel('pdf:' + id); delete _docBytes[id];
  if (state.ui.activeDoc === id) { state.ui.activeDoc = 'sample'; save(); switchDoc('sample'); }
  else { save(); renderTree(); render(); }
}
function renderTree() {
  const list = $('#docList'); if (!list) return; list.innerHTML = '';
  state.docs.forEach(d => {
    const active = d.id === state.ui.activeDoc;
    const row = el(`<div class="tree-row indent-2 doc-row ${active ? 'active' : ''}" data-doc="${d.id}" title="${esc(d.name)}">
      <span class="fic" style="color:${active ? '#DC2626' : 'currentColor'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg></span>
      <span class="doc-name">${esc(d.name)}</span>
      ${d.kind === 'user' ? `<button class="doc-del" data-del="${d.id}" title="Remove document">×</button>` : ''}</div>`);
    row.addEventListener('click', e => { if (e.target.closest('[data-del]')) return; switchDoc(d.id); });
    list.appendChild(row);
  });
  $$('[data-del]', list).forEach(b => b.onclick = e => { e.stopPropagation(); deleteDoc(b.dataset.del); });
}

function setupWorker() {
  try {
    // Preferred: worker script is inlined -> window.pdfjsWorker defined -> PDF.js runs it on the
    // main thread (no blob, no external fetch). Works under strict CSP and offline.
    if (window.pdfjsWorker && window.pdfjsWorker.WorkerMessageHandler) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = ''; return;
    }
    if (window.PDFJS_WORKER_B64) {
      const blob = new Blob([b64ToBytes(window.PDFJS_WORKER_B64)], { type: 'application/javascript' });
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob); return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN}/pdf.worker.min.js`;
  } catch (e) { pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN}/pdf.worker.min.js`; }
}
async function initPdf(bytes) {
  setupWorker();
  pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
  numPages = pdfDoc.numPages;
  $('#pageTotal').textContent = '/ ' + numPages;
  await renderPage(clamp(state.ui.page, 1, numPages));
}

async function renderPage(n) {
  if (!pdfDoc) return;
  n = clamp(n, 1, numPages);
  state.ui.page = n;
  const _fb = $('#readerFallback'); if (_fb) _fb.remove();   // PDF is live -> clear any fallback
  const _pw = $('#pageWrap'); if (_pw) _pw.style.display = '';
  if (rendering) { renderQueued = n; return; }
  rendering = true;
  const page = await pdfDoc.getPage(n);
  viewport = page.getViewport({ scale: state.ui.zoom });
  const canvas = $('#pageCanvas'), ctx = canvas.getContext('2d');
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';
  const wrap = $('#pageWrap');
  wrap.style.width = viewport.width + 'px'; wrap.style.height = viewport.height + 'px';
  await page.render({ canvasContext: ctx, viewport,
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null }).promise;

  // text layer
  const tl = $('#textLayer'); tl.innerHTML = ''; tl.style.width = viewport.width + 'px'; tl.style.height = viewport.height + 'px';
  tl.style.setProperty('--scale-factor', state.ui.zoom);
  const textContent = await page.getTextContent();
  await pdfjsLib.renderTextLayer({ textContent, container: tl, viewport, textDivs: [] }).promise;
  pageTextCache[n] = { text: textContent.items.map(i => i.str).join(' '), items: textContent.items, vp: viewport };

  $('#pageInput').value = n;
  drawHighlights(); drawPins();
  $('#textLayer').style.pointerEvents = (state.ui.tool === 'shot') ? 'none' : 'auto';
  rendering = false;
  if (renderQueued && renderQueued !== n) { const q = renderQueued; renderQueued = null; renderPage(q); }
  else renderQueued = null;
  requestAnimationFrame(drawConnector);
}

/* ---------- source resolution (quote -> page/rects) ---------- */
async function ensurePageText(n) {
  if (pageTextCache[n]) return pageTextCache[n];
  const page = await pdfDoc.getPage(n);
  const vp = page.getViewport({ scale: state.ui.zoom });
  const tc = await page.getTextContent();
  pageTextCache[n] = { text: tc.items.map(i => i.str).join(' '), items: tc.items, vp };
  return pageTextCache[n];
}
async function locateQuote(quote) {
  if (!pdfDoc) return null;
  const needle = quote.slice(0, 40).replace(/\s+/g, ' ').toLowerCase();
  for (let n = 1; n <= numPages; n++) {
    const { text } = await ensurePageText(n);
    if (text.replace(/\s+/g, ' ').toLowerCase().includes(needle)) return n;
  }
  return null;
}
function sectionForIndex(pageText, idx) {
  const re = /(\d+(?:\.\d+)*)\s+([A-Z][A-Za-z][A-Za-z \-]{2,48})/g; let m, best = null;
  while ((m = re.exec(pageText))) { if (m.index <= idx && (!best || m.index > best.index)) best = { index: m.index, s: `${m[1]} ${m[2]}`.trim() }; }
  return best ? best.s.replace(/\s{2,}/g, ' ').trim() : '';
}

/* ---------- selection popover ---------- */
let pendingSel = null;
function onTextSelect() {
  if (state.ui.tool === 'shot') return;
  const sel = window.getSelection();
  const text = sel && sel.toString().trim();
  const pop = $('#selPop');
  if (!text || text.length < 2) { pop.classList.add('hidden'); return; }
  const tl = $('#textLayer'); const tlBox = tl.getBoundingClientRect();
  const range = sel.getRangeAt(0);
  if (!tl.contains(range.commonAncestorContainer)) { pop.classList.add('hidden'); return; }
  const rects = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1).map(r => ({
    x: (r.left - tlBox.left) / tlBox.width, y: (r.top - tlBox.top) / tlBox.height,
    w: r.width / tlBox.width, h: r.height / tlBox.height,
  }));
  if (!rects.length) { pop.classList.add('hidden'); return; }
  const pt = pageTextCache[state.ui.page] || { text: '' };
  const idx = pt.text.replace(/\s+/g, ' ').toLowerCase().indexOf(text.replace(/\s+/g, ' ').slice(0, 30).toLowerCase());
  const cleanText = pt.text.replace(/\s+/g, ' ');
  pendingSel = {
    text, rects, page: state.ui.page,
    prefix: idx > 0 ? cleanText.slice(Math.max(0, idx - 32), idx) : '',
    suffix: idx >= 0 ? cleanText.slice(idx + text.length, idx + text.length + 32) : '',
    section: sectionForIndex(pt.text, idx < 0 ? 0 : idx),
  };
  const last = range.getClientRects()[range.getClientRects().length - 1];
  pop.style.left = clamp(last.left + last.width / 2 - 70, 8, window.innerWidth - 220) + 'px';
  pop.style.top = (last.bottom + 8) + 'px';
  pop.classList.remove('hidden');
}

/* ---------- create annotations ---------- */
function newAnnotation(a) {
  const n = state.annotations.length + 1;
  const ann = Object.assign({
    id: uid('ann'), doc: state.ui.activeDoc, page: state.ui.page, section: '',
    source_type: 'text', selected_text: '', prefix: '', suffix: '', rects: [],
    screenshot: null, caption: '', anchor: n, thread: uid('thr'), messages: [],
    auto_tags: [], manual_tags: [], resolved: false, created_at: nowISO(), updated_at: nowISO(),
  }, a);
  state.annotations.push(ann); save(); return ann;
}
function createFromSelection(kind /* 'yellow'|'text'|'ask' */) {
  if (!pendingSel) return;
  const ann = newAnnotation({
    source_type: 'text', page: pendingSel.page, section: pendingSel.section,
    selected_text: pendingSel.text, prefix: pendingSel.prefix, suffix: pendingSel.suffix,
    rects: pendingSel.rects, hlColor: kind === 'yellow' ? 'yellow' : 'text',
  });
  window.getSelection().removeAllRanges();
  $('#selPop').classList.add('hidden');
  selectAnnotation(ann.id, true);
  render(); drawHighlights(); drawPins();
  if (kind === 'ask') { focusComposer(); $('#composerInput').value = 'Can you explain this?'; }
  else focusComposer();
  pendingSel = null;
}

/* ---------- screenshot capture ---------- */
let cap = null;
function setTool(t) {
  state.ui.tool = t; save();
  $$('.tool').forEach(b => b.classList.remove('active', 'hl', 'shot'));
  const map = { cursor: '#toolCursor', text: '#toolText', highlight: '#toolHi', comment: '#toolComment', shot: '#toolShot' };
  const b = $(map[t]); if (b) { b.classList.add('active'); if (t === 'highlight') b.classList.add('hl'); if (t === 'shot') b.classList.add('shot'); }
  const mask = $('#captureMask'); const bar = $('#capBar');
  if (t === 'shot') { mask.style.display = 'block'; bar.classList.remove('hidden'); $('#textLayer').style.pointerEvents = 'none'; }
  else { mask.style.display = 'none'; bar.classList.add('hidden'); $('#textLayer').style.pointerEvents = 'auto'; }
}
function initCaptureMask() {
  const mask = $('#captureMask'); let box = null, start = null;
  mask.addEventListener('mousedown', e => {
    const r = mask.getBoundingClientRect(); start = { x: e.clientX - r.left, y: e.clientY - r.top };
    box = el('<div class="selbox"><span class="selhandle" style="left:-5px;top:-5px"></span><span class="selhandle" style="right:-5px;top:-5px"></span><span class="selhandle" style="left:-5px;bottom:-5px"></span><span class="selhandle" style="right:-5px;bottom:-5px"></span></div>');
    mask.appendChild(box);
  });
  mask.addEventListener('mousemove', e => {
    if (!box) return; const r = mask.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const l = Math.min(x, start.x), t = Math.min(y, start.y), w = Math.abs(x - start.x), h = Math.abs(y - start.y);
    Object.assign(box.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px' });
  });
  mask.addEventListener('mouseup', async e => {
    if (!box) return; const r = mask.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const l = Math.min(x, start.x), t = Math.min(y, start.y), w = Math.abs(x - start.x), h = Math.abs(y - start.y);
    box.remove(); box = null;
    if (w < 12 || h < 12) return;
    await captureRegion(l, t, w, h);
  });
}
async function captureRegion(l, t, w, h) {
  const canvas = $('#pageCanvas');
  const tmp = document.createElement('canvas'); tmp.width = w * outputScale; tmp.height = h * outputScale;
  tmp.getContext('2d').drawImage(canvas, l * outputScale, t * outputScale, w * outputScale, h * outputScale, 0, 0, w * outputScale, h * outputScale);
  const dataURL = tmp.toDataURL('image/png');
  const pt = pageTextCache[state.ui.page] || { text: '' };
  const figM = pt.text.match(/Figure\s+\d+[:.][^.]{0,120}/i);
  const ann = newAnnotation({
    source_type: 'screenshot', page: state.ui.page,
    section: sectionForIndex(pt.text, 0), screenshot: dataURL,
    caption: figM ? figM[0].trim() : '',
    rects: [{ x: l / viewport.width, y: t / viewport.height, w: w / viewport.width, h: h / viewport.height }],
  });
  setTool('cursor');
  selectAnnotation(ann.id, true); render(); drawPins(); focusComposer();
  toast('Region captured — ask the AI about it below.');
}

/* ---------- highlights + pins + connector ---------- */
// Number the active document's notes by reading order (page, then vertical position) so
// pins on the page and cards in the list stay 1..N top-to-bottom, per document.
function renumber() {
  state.annotations.filter(inActiveDoc)
    .sort((a, b) => (a.page - b.page) || (((a.rects && a.rects[0] || {}).y || 0) - ((b.rects && b.rects[0] || {}).y || 0)))
    .forEach((a, i) => { a.anchor = i + 1; });
}
function drawHighlights() {
  const ov = $('#overlay'); if (!ov) return; ov.innerHTML = ''; if (!viewport) return;
  ov.style.width = viewport.width + 'px'; ov.style.height = viewport.height + 'px';
  state.annotations.filter(a => inActiveDoc(a) && a.page === state.ui.page).forEach(a => {
    if (a.source_type === 'free_comment') return;   // point comments show only a pin, no highlight box
    (a.rects || []).forEach(rc => {
      const cls = a.source_type === 'screenshot' ? 'figbox' : (a.hlColor === 'box' ? 'box' : (a.hlColor === 'yellow' ? 'yellow' : 'text'));
      const d = el(`<div class="hl-rect ${cls}"></div>`);
      Object.assign(d.style, { left: rc.x * viewport.width + 'px', top: rc.y * viewport.height + 'px',
        width: rc.w * viewport.width + 'px', height: rc.h * viewport.height + 'px' });
      d.onclick = () => selectAnnotation(a.id, true);
      ov.appendChild(d);
    });
  });
}
function drawPins() {
  const pins = $('#pins'); if (!pins) return; pins.innerHTML = ''; if (!viewport) return;
  pins.style.width = viewport.width + 'px'; pins.style.height = viewport.height + 'px';
  state.annotations.filter(a => inActiveDoc(a) && a.page === state.ui.page && a.rects && a.rects.length).forEach(a => {
    const rc = a.rects[0];
    const p = el(`<div class="pin ${a.source_type === 'screenshot' ? 'shot' : ''} ${a.id === state.ui.activeId ? 'sel' : ''}">${a.anchor}</div>`);
    p.style.left = (rc.x + rc.w) * viewport.width + 'px';
    p.style.top = rc.y * viewport.height + 'px';
    p.onclick = () => selectAnnotation(a.id, false, true);
    pins.appendChild(p);
  });
  drawConnector();
}
function drawConnector() {
  const svg = $('#connectors'); if (!svg) return; while (svg.firstChild) svg.removeChild(svg.firstChild);
  const pinsEl = $('#pins'); if (!pinsEl) return;
  const a = state.annotations.find(x => x.id === state.ui.activeId);
  if (!a || a.page !== state.ui.page) return;
  const pin = [...pinsEl.children].find(p => p.textContent == String(a.anchor));
  const card = $(`.card[data-ann="${a.id}"]`);
  if (!pin || !card) return;
  const pr = pin.getBoundingClientRect(), cr = card.getBoundingClientRect();
  if (cr.top > window.innerHeight || cr.bottom < 0) return;
  const x1 = pr.right, y1 = pr.top + pr.height / 2, x2 = cr.left, y2 = cr.top + 22;
  const mx = (x1 + x2) / 2;
  const NS = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
  svg.appendChild(path);
}

/* ---------- selection / navigation of notes ---------- */
function scrollNoteIntoView(id, center) {
  // Scroll ONLY the notes list — never use element.scrollIntoView(), which also scrolls
  // ancestor/window and would push the top bars off-screen.
  const list = $('#notesList'), c = $(`.card[data-ann="${id}"]`);
  if (!list || !c) return;
  const lb = list.getBoundingClientRect(), cb = c.getBoundingClientRect();
  if (center) list.scrollTop += (cb.top - lb.top) - (lb.height / 2 - cb.height / 2);
  else if (cb.top < lb.top + 8 || cb.bottom > lb.bottom - 8) list.scrollTop += (cb.top - lb.top) - 12;
}
function selectAnnotation(id, scrollCard, scrollPage) {
  state.ui.activeId = id; save();
  const a = state.annotations.find(x => x.id === id);
  if (a && scrollPage && a.page !== state.ui.page) renderPage(a.page).then(() => { drawPins(); });
  render(); drawPins();
  if (scrollCard) scrollNoteIntoView(id, true);
  requestAnimationFrame(drawConnector);
  focusComposerCtx();
}

/* ---------- auto-tagging (heuristic; swappable for a model call) ---------- */
function autoTag(text, srcType, msgType) {
  const t = (text || '').toLowerCase(); const tags = new Set();
  if (msgType === 'generated_visual') tags.add('Generated visual');
  if (srcType === 'screenshot') tags.add('Screenshot');
  if (/\?\s*$/.test(text || '') || /^(what|why|how|can you|does|is |are |explain|derive)/.test(t)) tags.add('Question');
  if (/=|∝|∼|\bequation\b|k\^|E\(k\)/.test(text || '')) tags.add('Equation');
  if (/\bfigure\b|\bplot\b|\bgraph\b|\bspectrum\b/.test(t)) tags.add('Figure');
  if (/is defined as|refers to|is called|denotes|means /.test(t)) tags.add('Definition');
  if (/confus|unclear|don'?t (get|understand)/.test(t)) tags.add('Confusion');
  if (/wrong|however|but |disagree|doubt|questionable|flaw/.test(t)) tags.add('Critique');
  if (/todo|action|follow up|need to|check /.test(t)) tags.add('Action item');
  if (/summar|key takeaway|in short|tl;dr/.test(t)) tags.add('Summary');
  if (!tags.size) tags.add('Claim');
  return [...tags];
}
const TAG_CLASS = { 'Question': 'q', 'Claim': 'claim', 'Definition': 'def', 'Equation': 'eq',
  'Figure': 'fig', 'Screenshot': 'shot', 'Generated visual': 'vis', 'Confusion': 'conf',
  'Critique': 'crit', 'Summary': 'sum', 'Action item': 'act' };

/* ---------- AI providers (client-side, live) ---------- */
const canImage = p => p === 'openai' || p === 'gemini';
function activeProvider() { return state.settings.provider; }
function keyFor(p) { return (state.settings.keys[p] || '').trim(); }
function pickImageProvider() {
  const a = activeProvider(); if (canImage(a)) return a;   // server may hold the key
  return 'openai';   // fallback image-capable provider (server key or BYO)
}
// AI calls go through the server-side proxy (/api/*): uses the site's env key by default,
// or the user's BYO key (from Settings) passed through as `userKey`.
async function aiText(provider, { system, user, image }) {
  const r = await fetch('/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, system, user, image, model: state.settings.models[provider], userKey: keyFor(provider) || undefined }),
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || `AI request failed (${r.status})`);
  return j.text || '';
}
async function aiImage(provider, prompt) {
  const model = provider === 'openai' ? state.settings.models.openaiImage : state.settings.models.geminiImage;
  const r = await fetch('/api/ai-image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, prompt, model, userKey: keyFor(provider) || undefined }),
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || `Image request failed (${r.status})`);
  return j.image;
}
function imageEvidence(a) {
  if (a.source_type !== 'screenshot' || !a.screenshot) return null;
  const mm = a.screenshot.match(/^data:(.*?);base64,(.*)$/); return mm ? { mime: mm[1], b64: mm[2] } : null;
}
function buildContext(a) {
  const pt = pageTextCache[a.page];
  let surrounding = '';
  if (pt) {
    const text = pt.text.replace(/\s+/g, ' ').trim();
    if (a.selected_text) {
      const key = a.selected_text.replace(/\s+/g, ' ').slice(0, 40).toLowerCase();
      const idx = text.toLowerCase().indexOf(key);
      if (idx >= 0) {
        const before = text.slice(Math.max(0, idx - 450), idx);
        const after = text.slice(idx + a.selected_text.length, idx + a.selected_text.length + 450);
        surrounding = (before + ' [SELECTION] ' + after).trim();
      }
    }
    if (!surrounding) surrounding = text.slice(0, 900);
  }
  // prior conversation in this thread (excludes the current question + the pending answer)
  const thread = (a.messages || []).filter(m => m.text && !m.pending)
    .slice(0, -1)
    .map(m => `${m.actor === 'ai' ? (PROVIDER_LABEL[m.provider] || 'AI') : actorName(m)}: ${m.text}`)
    .join('\n');
  return {
    page: a.page, section: a.section,
    evidence: a.source_type === 'screenshot' ? '[a figure/region captured as a screenshot from this page — see the attached image]' : (a.selected_text || ''),
    caption: a.caption, surrounding, thread,
    image: imageEvidence(a),
  };
}
function retrievePassages(question, excludePage) {
  const stop = new Set(['about','which','these','their','there','would','could','should','where','while','being','across','after','before']);
  const terms = [...new Set((question.toLowerCase().match(/[a-z]{5,}/g) || []).filter(w => !stop.has(w)))];
  if (!terms.length) return [];
  const hits = [];
  for (const pn of Object.keys(pageTextCache)) {
    if (+pn === excludePage) continue;
    const text = pageTextCache[pn].text.replace(/\s+/g, ' '); const low = text.toLowerCase();
    for (const t of terms) { const i = low.indexOf(t); if (i >= 0) { hits.push(`(page ${pn}) …${text.slice(Math.max(0, i - 70), i + 130).trim()}…`); break; } }
    if (hits.length >= 3) break;
  }
  return hits;
}
function chipsFor(a, opts) {
  const chips = [];
  chips.push(`Page ${a.page}`);
  if (a.section) chips.push(a.section.replace(/^(\d+(\.\d+)*)\s+/, m => 'Section ' + m.trim() + ' ').trim());
  if (a.source_type === 'screenshot') { chips.push('Used screenshot'); if (a.caption) chips.push('Used nearby caption'); }
  else if (a.source_type === 'free_comment') { chips.push('Page comment'); }
  else chips.push('Used highlighted text');
  if (opts && opts.visual) chips.push('Generated visual');
  chips.push(state.settings.enableWeb ? 'Used web search' : 'No external sources');
  return chips;
}
async function askAI(annId, question, providerOverride) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  const provider = providerOverride || activeProvider();
  const ctx = buildContext(a);
  const msg = { id: uid('m'), actor: 'ai', provider, model: state.settings.models[provider],
    type: 'ai_answer', text: '', created_at: nowISO(), pending: true,
    chips: chipsFor(a), external: state.settings.enableWeb, tools: [] };
  a.messages.push(msg); a.updated_at = nowISO(); save(); render();
  const passages = retrievePassages(question, a.page);
  const system = `You are a reading assistant embedded in a source-linked research workspace. Answer the reader's question grounded in the SELECTED SOURCE and the surrounding context from the SAME document provided below. Be concise, precise, and faithful to the text; use the reader's own document rather than generic knowledge. ${state.settings.enableWeb ? 'You may draw on external knowledge if needed, and say when you do.' : 'Do NOT use outside knowledge or external sources — if the provided context is insufficient, say what is missing.'}`;
  const user = [
    `SELECTED SOURCE — page ${ctx.page}${ctx.section ? `, ${ctx.section}` : ''}${a.source_type === 'screenshot' ? ' (screenshot)' : ''}:`,
    `"""${ctx.evidence || '(see attached image)'}"""`,
    ctx.caption ? `Nearby caption: ${ctx.caption}` : '',
    ctx.surrounding ? `Surrounding text on the page (…[SELECTION] marks where the excerpt sits…):\n${ctx.surrounding}` : '',
    passages.length ? `Related passages elsewhere in the document:\n${passages.join('\n')}` : '',
    ctx.thread ? `Conversation so far on this note:\n${ctx.thread}` : '',
    `\nReader's question: ${question}`,
  ].filter(Boolean).join('\n\n');
  if (passages.length) msg.chips = msg.chips.map(c => c === 'No external sources' ? 'Used related passages · no external sources' : c);
  try {
    const out = await aiText(provider, { system, user, image: ctx.image });
    msg.text = out; msg.pending = false;
    a.auto_tags = Array.from(new Set([...(a.auto_tags || []), ...autoTag(question, a.source_type, 'ai_answer')]));
    save(); render();
  } catch (e) {
    msg.pending = false; msg.text = ''; msg.error = e.message;
    save(); render(); toast(errHint(e.message), 'err');
  }
}
async function generateVisual(annId, prompt) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  if (!state.settings.enableVisuals) { toast('Generated visuals are disabled in Settings.', 'err'); return; }
  const ip = pickImageProvider();
  const ctx = buildContext(a);
  const isFigure = a.source_type === 'screenshot' || /figure|plot|graph|spectrum|chart/i.test(a.selected_text || a.caption || '');
  const msg = { id: uid('m'), actor: 'ai', provider: ip, model: state.settings.models[ip === 'openai' ? 'openaiImage' : 'geminiImage'],
    type: 'generated_visual', created_at: nowISO(), pending: true, title: 'Generating visual…',
    image: null, takeaways: [], strip: [], is_conceptual: !isFigure, is_data_extracted: false,
    approximation_note: isFigure ? 'Visual is an approximate, cleaned recreation — not digitized data.' : '',
    chips: chipsFor(a, { visual: true }) };
  a.messages.push(msg); a.updated_at = nowISO(); save(); render();
  const imgPrompt = `Clean, minimal, publication-quality explanatory ${isFigure ? 'recreation of the figure' : 'diagram'} for a turbulence paper. ${prompt || ''}. Source excerpt: ${ctx.evidence}. ${ctx.caption || ''}. White background, clear axis labels, legible sans-serif, no clutter, no logos.`;
  try {
    const [img, meta] = await Promise.all([
      aiImage(ip, imgPrompt),
      keyFor(activeProvider()) ? aiText(activeProvider(), {
        system: 'You produce a short JSON object for a visual-summary card. Return ONLY valid JSON.',
        user: `From this source (page ${ctx.page}${ctx.section ? ', ' + ctx.section : ''}): """${ctx.evidence}""" ${ctx.caption || ''}\nReturn JSON: {"title": "<=6 words", "takeaways": ["3 short bullets"], "strip": ["3-4 short process steps"]}`,
        image: ctx.image,
      }).catch(() => null) : null,
    ]);
    msg.image = img; msg.pending = false;
    let parsed = null; if (meta) { try { parsed = JSON.parse(meta.replace(/```json|```/g, '').trim()); } catch {} }
    msg.title = parsed?.title || (isFigure ? 'Recreated Figure' : 'Visual Summary');
    msg.takeaways = parsed?.takeaways || [];
    msg.strip = parsed?.strip || [];
    a.auto_tags = Array.from(new Set([...(a.auto_tags || []), 'Generated visual']));
    save(); render();
  } catch (e) {
    msg.pending = false; msg.error = e.message; msg.title = 'Visual generation failed';
    save(); render(); toast(errHint(e.message), 'err');
  }
}
function errHint(m) {
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Could not reach the AI endpoint (/api/ai). This works on the deployed site; when opening the file locally without the server, add a key in Settings or run it via the deployment.';
  if (/no .*key available/i.test(m)) return m + ' (Settings → paste a key to use your own.)';
  return m;
}

/* ---------- composer ---------- */
function focusComposer() { const c = $('#composerInput'); focusComposerCtx(); setTimeout(() => c.focus({ preventScroll: true }), 60); }
function focusComposerCtx() {
  const a = state.annotations.find(x => x.id === state.ui.activeId);
  const ctx = $('#composerCtx'), input = $('#composerInput'), send = $('#composerSend');
  if (a) { ctx.classList.remove('hidden');
    ctx.innerHTML = `<span class="qn">${a.anchor}</span> Replying to ${a.source_type === 'screenshot' ? 'screenshot' : 'linked text'} · Page ${a.page}${a.section ? ' · ' + esc(a.section) : ''}`;
    input.placeholder = 'Ask with @gpt / @claude / @gemini, say “make a visual…”, or add a note'; input.disabled = false; send.disabled = false;
  } else { ctx.classList.add('hidden'); input.placeholder = 'Select text or a figure to start a note…'; }
}
function sendComposer() {
  const input = $('#composerInput'); const text = input.value.trim();
  const a = state.annotations.find(x => x.id === state.ui.activeId);
  if (!text || !a) return;
  input.value = '';
  const mProvider = /@claude/i.test(text) ? 'anthropic' : /@gpt/i.test(text) ? 'openai' : /@gemini/i.test(text) ? 'gemini' : null;
  const clean = text.replace(/@(ai|gpt|claude|gemini)/ig, '').trim();
  a.messages.push({ id: uid('m'), actor: 'you', type: 'comment', text: clean || text, created_at: nowISO() });
  a.auto_tags = Array.from(new Set([...(a.auto_tags || []), ...autoTag(text, a.source_type, 'comment')]));
  a.updated_at = nowISO(); save(); render();
  // Route from the text itself: a visual request -> generateVisual; otherwise a question/@mention -> askAI.
  const wantVisual = /\b(visual|diagram|chart|graph|plot|sketch|infographic)\b/i.test(clean) &&
                     /(generate|make|create|draw|turn|produce|render|convert|visuali[sz]e|cleaner|summar)/i.test(clean);
  const wantAI = mProvider || /@ai/i.test(text) || /\?\s*$/.test(text) || /^(explain|summar|derive|what|why|how|does|is|are|prove|show|compare)/i.test(clean);
  if (wantVisual) generateVisual(a.id, clean);
  else if (wantAI) askAI(a.id, clean || text, mProvider || undefined);
}

/* ---------- rendering the notes list ---------- */
function dayLabel(iso) {
  const d = new Date(iso), n = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'TODAY'; if (diff === 1) return 'YESTERDAY';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}
const timeLabel = iso => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
function passesFilter(a) {
  if (!inActiveDoc(a)) return false;
  if (state.ui.query) {
    const q = state.ui.query.toLowerCase();
    const hay = [a.selected_text, a.section, a.caption, ...(a.auto_tags || []), ...(a.manual_tags || []), ...a.messages.map(m => m.text || m.title || '')].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const f = state.ui.filter;
  if (f === 'unresolved') return !a.resolved;
  if (f === 'screenshots') return a.source_type === 'screenshot';
  if (f === 'ai') return a.messages.some(m => m.actor === 'ai');
  if (f === 'questions') return (a.auto_tags || []).concat(a.manual_tags || []).includes('Question');
  if (f === 'page') return a.page === state.ui.page;
  return true; // 'all'
}
function providerGlyph(p) {
  if (p === 'openai') return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"><path d="M12 3.5v17M4.4 7.75l15.2 8.5M19.6 7.75L4.4 16.25"/></svg>';   // OpenAI radial
  if (p === 'anthropic') return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>'; // Anthropic sunburst
  if (p === 'gemini') return '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2c.5 5.2 3.3 8 8.5 8.5-5.2.5-8 3.3-8.5 8.5-.5-5.2-3.3-8-8.5-8.5C8.7 10 11.5 7.2 12 2z"/></svg>';       // Gemini spark
  return '✦';
}
function actorAvatar(m) {
  if (m.actor === 'ai') {
    const p = m.provider, cls = p === 'openai' ? 'gpt' : p === 'anthropic' ? 'claude' : p === 'gemini' ? 'gemini' : '';
    return `<div class="avatar ai brand ${cls}" title="${esc(PROVIDER_LABEL[p] || 'AI')}">${providerGlyph(p)}</div>`;
  }
  const ac = ACTORS[m.actor] || { initials: state.settings.actorInitials || 'YO', color: '#2563EB' };
  return `<div class="avatar" style="background:${ac.color}">${esc(ac.initials)}</div>`;
}
function actorName(m) { return m.actor === 'ai' ? (PROVIDER_LABEL[m.provider] || 'AI') : (ACTORS[m.actor]?.name || state.settings.actorName || 'You'); }

function tagPills(a) {
  const tags = Array.from(new Set([...(a.auto_tags || []), ...(a.manual_tags || [])]));
  return `<div class="tagrow">${tags.map(t => `<span class="tag ${TAG_CLASS[t] || 'claim'}">${esc(t)}<span class="rm" data-rmtag="${esc(t)}" data-ann="${a.id}">×</span></span>`).join('')}<span class="addtag" data-addtag="${a.id}">+ tag</span></div>`;
}
function chipRow(chips) { return `<div class="chips">${(chips || []).map(c => `<span class="chip ${/no external|used web/i.test(c) ? 'dim' : ''}">${esc(c)}</span>`).join('')}</div>`; }
function srcLabel(a) { return a.source_type === 'screenshot' ? 'Screenshot' : a.source_type === 'free_comment' ? 'Comment' : a.source_type === 'equation' ? 'Equation' : 'Linked text'; }

function msgCard(a, m, isFirst) {
  const head = `<div class="card-h">${actorAvatar(m)}<span class="who">${esc(actorName(m))}</span><span class="when">${timeLabel(m.created_at)}</span><span class="kebab" data-menu="${m.id}" data-ann="${a.id}">⋯</span></div>`;
  let body = '';
  if (isFirst) {
    body += `<div class="q-src"><span class="qn">${a.anchor}</span>${srcLabel(a)} · Page ${a.page}${a.section ? ' · ' + esc(a.section) : ''}${a.resolved ? ' · <span class="resolved-flag">✓ Resolved</span>' : ''}</div>`;
    if (a.source_type === 'screenshot' && a.screenshot) body += `<div class="shot-thumb"><img src="${a.screenshot}"></div>`;
    else if (a.selected_text) body += `<div class="linked-quote">${esc(a.selected_text)}</div>`;
  }
  if (m.type === 'comment') body += `<div class="msg">${m.text ? esc(m.text).replace(/@(ai|gpt|claude|gemini)/ig, x => `<span class="men">${x}</span>`) : ''}</div>`;
  if (m.type === 'ai_answer') {
    if (m.pending) body += `<div class="msg"><span class="typing">Thinking<i></i><i></i><i></i></span></div>`;
    else if (m.error) body += `<div class="msg" style="color:#B91C1C">⚠ ${esc(m.error)}</div>`;
    else { body += `<div class="msg">${mdLite(m.text)}</div>` + chipRow(m.chips) + `<div class="disc">ⓘ AI-generated answer${m.model ? ' · ' + esc(m.model) : ''}</div>`; }
  }
  if (m.type === 'generated_visual') {
    body += `<div class="badge-gen">Generated visual</div>`;
    if (m.pending) body += `<div class="vis-card"><span class="typing">Rendering visual<i></i><i></i><i></i></span></div>`;
    else if (m.error) body += `<div class="msg" style="color:#B91C1C">⚠ ${esc(m.error)}</div>`;
    else {
      body += `<div class="vis-card"><h4>${esc(m.title || 'Visual')}</h4>${m.image ? `<img src="${m.image}">` : ''}`;
      if (m.takeaways?.length) body += `<ul class="vis-take">${m.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
      if (m.strip?.length) body += `<div class="strip">${m.strip.map((s, i) => `<span class="st ${i === m.strip.length - 1 ? 'v' : 'b'}">${esc(s)}</span>${i < m.strip.length - 1 ? '<span class="ar">→</span>' : ''}`).join('')}</div>`;
      body += `</div>`;
      const chips = m.chips ? m.chips.slice() : chipsFor(a, { visual: true });
      body += chipRow(chips);
      if (m.approximation_note) body += `<div style="margin-top:8px"><span class="badge-appx">Approximate</span> <span style="color:#6B7280;font-size:11.5px">${esc(m.approximation_note)}</span></div>`;
      else body += `<div class="disc">Conceptual visual · not extracted data</div>`;
    }
  }
  return { head, body };
}

function compactCard(a) {
  // compact by default (mockup 2): number badge + type label + time; clamped preview + location.
  const m0 = a.messages[0];
  const label = srcLabel(a);
  const preview = (a.messages.find(m => m.type === 'comment') || {}).text
    || (a.messages.find(m => m.type === 'ai_answer') || {}).text
    || a.selected_text || '';
  const when = timeLabel(m0 ? m0.created_at : a.created_at);
  const badge = a.source_type === 'screenshot' ? 'var(--green)' : 'var(--blue)';
  const wrap = el(`<div class="card compact ${a.resolved ? 'isres' : ''}" data-ann="${a.id}">
    ${!a.resolved ? '<span class="unread-dot"></span>' : ''}
    <div class="card-h"><span style="width:22px;height:22px;border-radius:50%;background:${badge};color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;flex:0 0 auto">${a.anchor}</span>
      <span class="who">${label}</span><span class="when">${when}</span>
      <span class="kebab" data-menu="c" data-ann="${a.id}">⋯</span></div>
    <div class="card-b">
      ${preview ? `<div class="msg clamp">${esc(preview).replace(/@(ai|gpt|claude|gemini)/ig, x => `<span class="men">${x}</span>`)}</div>` : ''}
      ${a.source_type === 'screenshot' && a.screenshot ? `<div class="shot-thumb"><img src="${a.screenshot}"></div>` : ''}
      <div class="loc-line">Page ${a.page}${a.section ? ' · ' + esc(a.section) : ''}${a.resolved ? ' · <span class="resolved-flag">✓ Resolved</span>' : ''}</div>
    </div></div>`);
  wrap.addEventListener('click', ev => { if (ev.target.closest('[data-menu]')) return; selectAnnotation(a.id, true); });
  return wrap;
}
function annCard(a) {
  if (a.id !== state.ui.activeId) return [compactCard(a)];  // compact unless selected
  const cards = [];
  if (!a.messages.length) {
    const wrap = el(`<div class="card sel" data-ann="${a.id}"><div class="card-h">${actorAvatar({ actor: 'you' })}<span class="who">${esc(state.settings.actorName || 'You')}</span><span class="when">${timeLabel(a.created_at)}</span></div>
      <div class="card-b"><div class="q-src"><span class="qn">${a.anchor}</span>${srcLabel(a)} · Page ${a.page}${a.section ? ' · ' + esc(a.section) : ''}</div>
      ${a.source_type === 'screenshot' && a.screenshot ? `<div class="shot-thumb"><img src="${a.screenshot}"></div>` : (a.selected_text ? `<div class="linked-quote">${esc(a.selected_text)}</div>` : '')}
      ${tagPills(a)}</div></div>`);
    cards.push(wrap); return cards;
  }
  a.messages.forEach((m, i) => {
    const { head, body } = msgCard(a, m, i === 0);
    const isAI = m.actor === 'ai';
    const first = i === 0;
    const wrap = el(`<div class="card ${isAI ? 'ai' : ''} sel ${a.resolved ? 'isres' : ''}" data-ann="${a.id}" data-msg="${m.id}">
      ${head}<div class="card-b">${body}
      ${first ? tagPills(a) : ''}
      </div></div>`);
    wrap.addEventListener('click', ev => { if (ev.target.closest('[data-menu],[data-rmtag],[data-addtag],button,a')) return; selectAnnotation(a.id, false); });
    cards.push(wrap);
  });
  return cards;
}
function mdLite(t) {
  return esc(t)
    .replace(/^\s*[-*]\s+(.*)$/gm, '• $1')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>');
}

function render() {
  // notes list
  renumber();
  const list = $('#notesList'); const scrollTop = list.scrollTop;
  list.innerHTML = '';
  let anns = state.annotations.filter(passesFilter);
  anns.sort((x, y) => state.ui.sort === 'page' ? (x.page - y.page || x.anchor - y.anchor) : (new Date(x.created_at) - new Date(y.created_at)));
  if (!anns.length) {
    list.appendChild(el(`<div class="empty">No notes yet.<br>Select text or capture a figure in the document to create a source-linked note.</div>`));
  } else {
    let lastDay = null;
    anns.forEach(a => {
      if (state.ui.sort === 'time') { const d = dayLabel(a.created_at); if (d !== lastDay) { list.appendChild(el(`<div class="daysep">${d}</div>`)); lastDay = d; } }
      annCard(a).forEach(c => list.appendChild(c));
    });
  }
  const fLabel = (FILTERS.find(f => f[0] === state.ui.filter) || [])[1];
  const docCount = state.annotations.filter(inActiveDoc).length;
  $('#notesCount').textContent = docCount + (docCount === 1 ? ' note' : ' notes') + (state.ui.filter !== 'all' ? ' · ' + fLabel : '');
  // wire dynamic controls (actions are driven from the composer text; card just has tags + ⋯ menu)
  $$('[data-rmtag]', list).forEach(b => b.onclick = () => { const a = state.annotations.find(x => x.id === b.dataset.ann); a.auto_tags = (a.auto_tags || []).filter(t => t !== b.dataset.rmtag); a.manual_tags = (a.manual_tags || []).filter(t => t !== b.dataset.rmtag); save(); render(); });
  $$('[data-addtag]', list).forEach(b => b.onclick = () => addTagFlow(b.dataset.addtag));
  $$('[data-menu]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); annMenu(b.dataset.ann, b.dataset.menu, b); });
  if (state.ui.autoscroll && state.ui.activeId) { list.scrollTop = scrollTop; scrollNoteIntoView(state.ui.activeId, false); }
  else list.scrollTop = scrollTop;
  focusComposerCtx();
  requestAnimationFrame(drawConnector);
}
function promptText(annId) { const a = state.annotations.find(x => x.id === annId); const q = a?.messages.filter(m => m.type === 'comment').pop(); return q ? q.text : 'Explain this in context.'; }
function addTagFlow(annId) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  const t = prompt('Add tag (Question, Claim, Definition, Equation, Figure, Screenshot, Generated visual, Confusion, Critique, Summary, Action item):');
  if (t) { a.manual_tags = Array.from(new Set([...(a.manual_tags || []), t.trim()])); save(); render(); }
}
function annMenu(annId, msgId, anchorEl) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  openPopover(anchorEl, [
    { label: a.resolved ? 'Mark unresolved' : 'Resolve', on: a.resolved, onClick: () => { a.resolved = !a.resolved; a.updated_at = nowISO(); save(); render(); drawHighlights(); drawPins(); } },
    { sep: true },
    { label: 'Delete note', onClick: () => { if (!confirm('Delete this note and its thread?')) return; state.annotations = state.annotations.filter(x => x.id !== annId); if (state.ui.activeId === annId) state.ui.activeId = null; save(); render(); drawHighlights(); drawPins(); } },
  ]);
}

/* ---------- popovers (funnel options / notes menu) ---------- */
function closePopovers() { $$('.popover').forEach(p => p.remove()); }
function openPopover(anchorEl, rows) {
  closePopovers();
  const pop = el('<div class="popover"></div>');
  rows.forEach(r => {
    if (r.sep) { pop.appendChild(el('<div class="sep"></div>')); return; }
    if (r.lab) { pop.appendChild(el(`<div class="lab">${esc(r.lab)}</div>`)); return; }
    const row = el(`<div class="row ${r.on ? 'on' : ''}"><span>${esc(r.label)}</span>${r.toggle !== undefined ? `<span class="sw ${r.toggle ? 'on' : ''}"><i></i></span>` : ''}</div>`);
    row.onclick = e => { e.stopPropagation(); if (r.onClick) r.onClick(); if (!r.keepOpen) closePopovers(); };
    pop.appendChild(row);
  });
  document.body.appendChild(pop);
  const b = anchorEl.getBoundingClientRect();
  pop.style.top = (b.bottom + 6) + 'px';
  pop.style.left = Math.max(8, Math.min(b.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  setTimeout(() => document.addEventListener('mousedown', function h(ev) { if (!ev.target.closest('.popover')) { closePopovers(); document.removeEventListener('mousedown', h); } }), 0);
}
const FILTERS = [['all', 'All notes'], ['unresolved', 'Unresolved'], ['screenshots', 'Screenshots'], ['ai', 'AI replies'], ['questions', 'Questions']];
function openFilterPopover(anchor) {
  openPopover(anchor, [
    { lab: 'Show' },
    ...FILTERS.map(([f, label]) => ({ label, on: state.ui.filter === f, keepOpen: true, onClick: () => { state.ui.filter = f; save(); render(); openFilterPopover(anchor); } })),
    { sep: true }, { lab: 'Sort' },
    { label: 'By time', on: state.ui.sort === 'time', keepOpen: true, onClick: () => { state.ui.sort = 'time'; $('#sortSel').textContent = 'Sorted by time ▾'; save(); render(); openFilterPopover(anchor); } },
    { label: 'By page order', on: state.ui.sort === 'page', keepOpen: true, onClick: () => { state.ui.sort = 'page'; $('#sortSel').textContent = 'Sorted by page ▾'; save(); render(); openFilterPopover(anchor); } },
    { sep: true },
    { label: 'Auto-scroll to active note', toggle: state.ui.autoscroll, keepOpen: true, onClick: () => { state.ui.autoscroll = !state.ui.autoscroll; save(); openFilterPopover(anchor); } },
  ]);
}
function openNotesMenu(anchor) {
  openPopover(anchor, [
    { label: 'Mark all resolved', onClick: () => { state.annotations.forEach(a => a.resolved = true); save(); render(); } },
    { label: 'Mark all unresolved', onClick: () => { state.annotations.forEach(a => a.resolved = false); save(); render(); } },
    { sep: true },
    { label: 'Clear all notes', onClick: () => { if (confirm('Delete all notes?')) { state.annotations = []; state.ui.activeId = null; save(); render(); drawHighlights(); drawPins(); } } },
  ]);
}

/* ---------- settings modal ---------- */
function openSettings(note) {
  const s = state.settings;
  const m = el(`<div class="modal-mask"><div class="modal">
    <h3>Settings <span class="icon-btn" id="mClose">✕</span></h3>
    <div class="body">
      ${note ? `<div class="field"><div style="background:#EFF6FF;border:1px solid #BFDBFE;color:#1D4ED8;border-radius:9px;padding:10px 12px">${esc(note)}</div></div>` : ''}
      <div class="hint" style="margin:-2px 0 16px">AI runs through the site's server keys by default — you don't need to enter anything. Optionally paste your <b>own</b> key below to use your account (BYO override). Mark one provider as <b>Default</b> for the composer; target any inline with @gpt / @claude / @gemini.</div>
      <div class="field">
        <div class="lbl-row"><label>OpenAI API key</label><button type="button" class="def-radio ${s.provider === 'openai' ? 'on' : ''}" data-def="openai"><span class="rdot"></span>Default</button></div>
        <input id="kOpenai" type="password" placeholder="sk-…" value="${esc(s.keys.openai)}"><div class="hint">Text model: <input style="width:auto;display:inline-block;padding:3px 7px" id="mOpenai" value="${esc(s.models.openai)}"> · Image: <input style="width:auto;display:inline-block;padding:3px 7px" id="mOpenaiImg" value="${esc(s.models.openaiImage)}"></div>
      </div>
      <div class="field">
        <div class="lbl-row"><label>Anthropic API key</label><button type="button" class="def-radio ${s.provider === 'anthropic' ? 'on' : ''}" data-def="anthropic"><span class="rdot"></span>Default</button></div>
        <input id="kAnthropic" type="password" placeholder="sk-ant-…" value="${esc(s.keys.anthropic)}"><div class="hint">Text/vision model: <input style="width:auto;display:inline-block;padding:3px 7px" id="mAnthropic" value="${esc(s.models.anthropic)}"> · (no image generation)</div>
      </div>
      <div class="field">
        <div class="lbl-row"><label>Google Gemini API key</label><button type="button" class="def-radio ${s.provider === 'gemini' ? 'on' : ''}" data-def="gemini"><span class="rdot"></span>Default</button></div>
        <input id="kGemini" type="password" placeholder="AIza…" value="${esc(s.keys.gemini)}"><div class="hint">Text model: <input style="width:auto;display:inline-block;padding:3px 7px" id="mGemini" value="${esc(s.models.gemini)}"> · Image: <input style="width:auto;display:inline-block;padding:3px 7px" id="mGeminiImg" value="${esc(s.models.geminiImage)}"></div>
      </div>
      <div class="field"><label>Your identity (actor)</label>
        <div style="display:flex;gap:8px"><input id="actorName" placeholder="Your name" value="${esc(s.actorName)}" style="flex:1"><input id="actorInit" placeholder="IN" maxlength="2" value="${esc(s.actorInitials)}" style="width:70px;text-transform:uppercase"></div></div>
      <div class="field"><label>Tools</label>
        <div class="chk"><div class="sw ${s.enableVisuals ? 'on' : ''}" id="tgVis"><i></i></div> Enable generated visuals</div>
        <div class="chk"><div class="sw ${s.enableWeb ? 'on' : ''}" id="tgWeb"><i></i></div> Allow external web search (changes provenance to “Used web search”)</div>
        <div class="chk"><div class="sw ${s.enablePython ? 'on' : ''}" id="tgPy"><i></i></div> Enable Python tool use (stub)</div>
      </div>
      <div class="hint">Your own keys (if entered) are stored only in this browser and sent per‑request to the site's <code>/api/ai</code> proxy as an override; otherwise the server's keys are used and never exposed to the browser.</div>
    </div>
    <div class="foot"><button class="btn ghost" id="mCancel">Close</button><button class="btn primary" id="mSave">Save</button></div>
  </div></div>`);
  $('#modalRoot').appendChild(m);
  const close = () => m.remove();
  $('#mClose', m).onclick = close; $('#mCancel', m).onclick = close;
  m.addEventListener('click', e => { if (e.target === m) close(); });
  $$('.def-radio', m).forEach(b => b.onclick = () => { $$('.def-radio', m).forEach(x => x.classList.remove('on')); b.classList.add('on'); });
  ['tgVis', 'tgWeb', 'tgPy'].forEach(id => $('#' + id, m).onclick = () => $('#' + id, m).classList.toggle('on'));
  $('#mSave', m).onclick = () => {
    const defEl = $('.def-radio.on', m); if (defEl) s.provider = defEl.dataset.def;
    s.keys.openai = $('#kOpenai', m).value.trim(); s.keys.anthropic = $('#kAnthropic', m).value.trim(); s.keys.gemini = $('#kGemini', m).value.trim();
    s.models.openai = $('#mOpenai', m).value.trim() || DEFAULT_MODELS.openai;
    s.models.anthropic = $('#mAnthropic', m).value.trim() || DEFAULT_MODELS.anthropic;
    s.models.gemini = $('#mGemini', m).value.trim() || DEFAULT_MODELS.gemini;
    s.models.openaiImage = $('#mOpenaiImg', m).value.trim() || DEFAULT_MODELS.openaiImage;
    s.models.geminiImage = $('#mGeminiImg', m).value.trim() || DEFAULT_MODELS.geminiImage;
    s.actorName = $('#actorName', m).value.trim() || 'You';
    s.actorInitials = ($('#actorInit', m).value.trim() || 'YO').toUpperCase().slice(0, 2);
    ACTORS.you.name = s.actorName; ACTORS.you.initials = s.actorInitials;
    s.enableVisuals = $('#tgVis', m).classList.contains('on');
    s.enableWeb = $('#tgWeb', m).classList.contains('on');
    s.enablePython = $('#tgPy', m).classList.contains('on');
    save(); close(); render(); toast('Settings saved.');
  };
}

/* ---------- export view ---------- */
const exState = { include: { comments: true, linked: true, ai: true, screenshots: true, visuals: true }, layout: 'detailed' };
function openExport() {
  const root = $('#exportRoot'); root.classList.remove('hidden'); root.innerHTML = '';
  const view = el(`<div id="exportView">
    <div class="ex-top"><div class="ex-back" id="exBack">← Back to document</div>
      <div style="display:flex;gap:10px"><button class="btn ghost" id="exPreview">Preview</button><button class="btn primary" id="exPdf">⭳ Export PDF</button></div></div>
    <div class="ex-body">
      <div class="ex-opts">
        <h1>Export annotations</h1><p class="sub">Create a clean PDF of comments, linked excerpts, AI replies, and screenshots.</p>
        <div class="lbl">Include</div>
        ${[
          ['comments', 'Comments', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.3 7.3L4 20l.7-5.7A8 8 0 1 1 21 12z"/></svg>'],
          ['linked', 'Linked text', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9.5 14.5l5-5M10 6l1-1a4 4 0 1 1 6 6l-1 1M14 18l-1 1a4 4 0 1 1-6-6l1-1"/></svg>'],
          ['ai', 'AI responses', '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/></svg>'],
          ['screenshots', 'Screenshots', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>'],
          ['visuals', 'Visuals', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-8M20 20H3"/></svg>'],
        ].map(([k, lab, ic]) =>
          `<div class="ex-chk ${exState.include[k] ? 'on' : ''}" data-inc="${k}"><span class="box">✓</span><span class="ic">${ic}</span> ${lab}</div>`).join('')}
        <div class="lbl">Layout</div>
        <div class="lay">
          <div class="opt ${exState.layout === 'detailed' ? 'on' : ''}" data-lay="detailed"><div><b>Detailed</b><small>Show excerpts, replies, and visuals.</small></div><span class="r"></span></div>
          <div class="opt ${exState.layout === 'compact' ? 'on' : ''}" data-lay="compact"><div><b>Compact</b><small>Condensed view with minimal content.</small></div><span class="r"></span></div>
        </div>
        <div class="lbl">Page size</div><select class="field" style="width:100%"><option>A4</option><option>Letter</option></select>
        <div class="lbl">Style</div><select style="width:100%"><option>Clean</option><option>Minimal</option></select>
      </div>
      <div class="ex-preview"><div class="ex-sheet" id="exSheet"></div></div>
    </div></div>`);
  root.appendChild(view);
  $('#exBack').onclick = () => { root.classList.add('hidden'); root.innerHTML = ''; };
  $('#exPreview').onclick = () => toast('Live preview shown on the right.');
  $('#exPdf').onclick = () => window.print();
  $$('[data-inc]', view).forEach(c => c.onclick = () => { exState.include[c.dataset.inc] = !exState.include[c.dataset.inc]; c.classList.toggle('on'); buildSheet(); });
  $$('[data-lay]', view).forEach(o => o.onclick = () => { exState.layout = o.dataset.lay; $$('[data-lay]', view).forEach(x => x.classList.remove('on')); o.classList.add('on'); buildSheet(); });
  buildSheet();
}
function buildSheet() {
  const sheet = $('#exSheet'); if (!sheet) return;
  const inc = exState.include, compact = exState.layout === 'compact';
  let html = `<h2>${esc(activeDoc().name)}</h2><div class="dt">Exported on ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>`;
  const anns = state.annotations.filter(inActiveDoc).sort((a, b) => a.page - b.page || a.anchor - b.anchor);
  let n = 0;
  anns.forEach(a => {
    const hasShot = a.source_type === 'screenshot';
    if (hasShot && !inc.screenshots) return;
    n++;
    const left = [];
    if (hasShot && inc.screenshots && a.screenshot) left.push(`<div class="ex-sub">Screenshot</div><div class="ex-shot"><img src="${a.screenshot}"></div>`);
    if (!hasShot && inc.linked && a.selected_text) left.push(`<div class="ex-sub">Linked text</div><div class="ex-quote">${esc(a.selected_text)}</div>`);
    const right = [];
    a.messages.forEach(m => {
      if (m.type === 'comment' && inc.comments) right.push(`<div class="ex-comment"><div class="card-h" style="padding:0;margin:2px 0 4px">${actorAvatar(m)}<span class="who">${esc(actorName(m))}</span><span class="when">${new Date(m.created_at).toLocaleDateString()} · ${timeLabel(m.created_at)}</span></div><div class="msg">${esc(m.text || '')}</div></div>`);
      if (m.type === 'ai_answer' && inc.ai && !m.pending && !m.error) right.push(`<div class="ex-resp"><div class="ex-sub">AI response · ${esc(PROVIDER_LABEL[m.provider] || 'AI')}</div><div class="msg">${mdLite(m.text)}</div>${chipRow(m.chips)}</div>`);
      if (m.type === 'generated_visual' && inc.visuals && !m.pending && m.image) right.push(`<div class="ex-resp"><div class="ex-sub">Generated visual</div><div class="ex-shot"><img src="${m.image}"></div>${m.approximation_note ? `<div style="margin-top:6px"><span class="badge-appx">Approximate</span></div>` : ''}</div>`);
    });
    if (!left.length && !right.length) { n--; return; }
    html += `<div class="ex-item ${compact ? 'compact' : ''}"><div class="ex-left"><div class="ex-loc"><span class="ex-num">${n}</span>Page ${a.page}${a.section ? ' · ' + esc(a.section) : ''}</div>${left.join('')}</div><div class="ex-right">${right.join('') || '<div class="ex-sub" style="color:#9CA3AF">—</div>'}</div></div>`;
  });
  if (n === 0) html += `<div class="empty">Nothing selected to export. Toggle include options or add notes.</div>`;
  sheet.innerHTML = html;
}

/* ---------- search ---------- */
async function runSearch(q) {
  if (!q) return; const hits = [];
  for (let i = 1; i <= numPages; i++) { const { text } = await ensurePageText(i); if (text.toLowerCase().includes(q.toLowerCase())) hits.push(i); }
  if (!hits.length) { toast('No matches for “' + q + '”.'); return; }
  const cur = state.ui.page; const next = hits.find(p => p > cur) ?? hits[0];
  await renderPage(next);
  setTimeout(() => { $$('#textLayer span').forEach(s => { if (s.textContent.toLowerCase().includes(q.toLowerCase())) s.classList.add('search-hit'); }); }, 120);
  toast(`“${q}” found on page${hits.length > 1 ? 's' : ''} ${hits.join(', ')} — showing ${next}.`);
}

/* ---------- seeding (mirror the mockups) ---------- */
async function seed() {
  const t = new Date(); const yest = new Date(t.getTime() - 86400000);
  const at = (base, h, m) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const figImg = window.FIG3_B64 ? 'data:image/png;base64,' + window.FIG3_B64 : null;

  // A1 — Energy Cascade explain (screen 1 + export)
  const q1 = 'A defining feature of turbulence is the transfer of kinetic energy across a wide range of scales.';
  const p1 = (await locateQuote(q1)) || 2;
  const rects1 = await rectsForQuote(p1, q1);
  const A1 = newAnnotation({ page: p1, section: '2.3 Energy Cascade', selected_text: q1, rects: rects1, hlColor: 'text',
    created_at: at(t, 10, 24), auto_tags: ['Question'] });
  A1.messages = [
    { id: uid('m'), actor: 'sara', type: 'comment', text: 'A defining feature of turbulence is the transfer of kinetic energy across a wide range of scales. @ai can you explain this in simple terms?', created_at: at(t, 10, 24) },
    { id: uid('m'), actor: 'ai', provider: 'openai', model: 'gpt-4o', type: 'ai_answer', created_at: at(t, 10, 24),
      text: 'Turbulence moves energy from big swirls to smaller ones in a step-by-step way. The big eddies break down into smaller eddies, and this continues until the eddies are so small that viscosity turns the energy into heat. This process happens across a very wide range of scales.',
      chips: ['Page ' + p1, 'Section 2.3', 'Used highlighted text', 'No external sources'] },
  ];

  // A1b — the equation boxed as a second anchor on the same page (mockup 1 ②, mockup 2 #2)
  const A1b = newAnnotation({ page: p1, section: '2.3 Energy Cascade', source_type: 'equation',
    selected_text: 'E(k) = C_K ε^(2/3) k^(−5/3)', hlColor: 'box',
    rects: [{ x: 0.11, y: 0.695, w: 0.42, h: 0.05 }], created_at: at(t, 10, 25), auto_tags: ['Equation', 'Question'] });
  A1b.messages = [
    { id: uid('m'), actor: 'you', type: 'comment', text: 'Can you explain how the −5/3 power law follows from Kolmogorov\'s assumptions?', created_at: at(t, 10, 25) },
    { id: uid('m'), actor: 'ai', provider: 'openai', model: 'gpt-4o', type: 'ai_answer', created_at: at(t, 10, 25),
      text: 'In the inertial subrange Kolmogorov assumed the spectrum depends only on the wavenumber k and the energy flux ε (equal to the mean dissipation rate). Dimensional analysis then leaves only one possibility: E(k) = C_K ε^(2/3) k^(−5/3), since that is the unique combination of ε and k with the units of E(k). The constant C_K ≈ 1.5 is universal and fixed by experiment.',
      chips: ['Page ' + p1, 'Section 2.3', 'Used highlighted text', 'No external sources'] },
  ];

  // A2 — "what does this spectrum look like?" -> generated visual (screens 1 & 5)
  const q2 = 'The energy cascade can be summarized as';
  const p2 = (await locateQuote(q2)) || p1;
  const A2 = newAnnotation({ page: p2, section: '2.3 Energy Cascade', selected_text: 'the energy spectrum E(k) in the inertial range follows the −5/3 power law', rects: await rectsForQuote(p2, 'the energy spectrum E(k) in the inertial range follows'), hlColor: 'text',
    created_at: at(t, 10, 35), auto_tags: ['Figure', 'Generated visual'] });
  A2.messages = [
    { id: uid('m'), actor: 'bonnie', type: 'comment', text: 'Can you turn this into a cleaner visual summary of the energy spectrum?', created_at: at(t, 10, 35) },
    { id: uid('m'), actor: 'ai', provider: 'openai', model: 'gpt-image-1', type: 'generated_visual', created_at: at(t, 10, 35),
      title: 'Turbulent Energy Spectrum', image: figImg,
      takeaways: ['Energy is injected at large scales (low k).', 'In the inertial subrange, E(k) ∝ k^(−5/3).', 'At high k, viscous dissipation removes energy.'],
      strip: ['Large scales (energy input)', 'Inertial subrange (E(k) ∝ k^−5/3)', 'Small scales (dissipation)'],
      is_conceptual: true, is_data_extracted: false,
      chips: ['Page ' + p2, 'Section 2.3', 'Used highlighted text', 'Generated visual', 'No external sources'] },
  ];

  // A3 — screenshot of Figure 3 (screen 3)
  const p3 = (await locateQuote('Energy Spectra in the Inertial Subrange')) || 3;
  const A3 = newAnnotation({ source_type: 'screenshot', page: p3, section: '3.2 Energy Spectra in the Inertial Subrange',
    screenshot: figImg, caption: 'Figure 3: Schematic of the turbulence kinetic energy spectrum.',
    rects: [{ x: 0.24, y: 0.42, w: 0.52, h: 0.28 }], created_at: at(yest, 16, 18), auto_tags: ['Screenshot', 'Figure'] });
  A3.messages = [
    { id: uid('m'), actor: 'sara', type: 'comment', text: 'What does this figure show?', created_at: at(yest, 16, 18) },
    { id: uid('m'), actor: 'ai', provider: 'anthropic', model: 'claude-3-5-sonnet', type: 'ai_answer', created_at: at(yest, 16, 18),
      text: 'This figure shows the turbulence kinetic energy spectrum E(k) as a function of wavenumber k on a log–log scale. It illustrates three classic regions:\n- **Energy-containing range** (low k): energy is injected at large scales.\n- **Inertial subrange** (mid k): E(k) ∝ k^(−5/3), a constant energy transfer rate across scales.\n- **Dissipation range** (high k): viscous effects dominate and energy dissipates.\nThe dashed line is the Kolmogorov −5/3 reference scaling.',
      chips: ['Page ' + p3, 'Figure 3', 'Used screenshot', 'Used nearby caption', 'No external sources'] },
  ];

  // A4 — clarification, unresolved (screen 2)
  const q4 = 'energy spectrum E(k), where k is the wavenumber';
  const p4 = (await locateQuote('Spectral Characteristics')) || 3;
  const A4 = newAnnotation({ page: p4, section: '4.1 Spectral Characteristics', selected_text: 'energy spectrum E(k), where k is the wavenumber', rects: await rectsForQuote(p4, 'energy spectrum'), hlColor: 'text',
    created_at: at(t, 9, 40), auto_tags: ['Question', 'Definition'], resolved: false });
  A4.messages = [
    { id: uid('m'), actor: 'you', type: 'comment', text: 'What exactly is meant by the energy spectrum E(k) in this context?', created_at: at(t, 9, 40) },
    { id: uid('m'), actor: 'ai', provider: 'gemini', model: 'gemini-1.5-pro', type: 'ai_answer', created_at: at(t, 9, 41),
      text: 'E(k) represents the distribution of turbulent kinetic energy across wavenumber k. It describes how energy is partitioned among eddies of different sizes, defined so that the integral of E(k) over all k gives the total turbulent kinetic energy per unit mass.',
      chips: ['Page ' + p4, 'Section 4.1', 'Used highlighted text', 'No external sources'] },
  ];

  // A5 — intermittency summary (export variety, Claude actor)
  const q5 = 'Turbulent flows are intermittent in space and time';
  const p5 = (await locateQuote(q5)) || 2;
  const A5 = newAnnotation({ page: p5, section: '2.4 Intermittency', selected_text: q5, rects: await rectsForQuote(p5, q5), hlColor: 'yellow',
    created_at: at(yest, 10, 15), auto_tags: ['Summary'] });
  A5.messages = [
    { id: uid('m'), actor: 'bonnie', type: 'comment', text: 'Can you summarize this section in 2 bullets?', created_at: at(yest, 10, 15) },
    { id: uid('m'), actor: 'ai', provider: 'openai', model: 'gpt-4o', type: 'ai_answer', created_at: at(yest, 10, 15),
      text: '- Turbulence is intermittent: intense, irregular bursts break self-similarity.\n- Structure functions S_p(r) ∼ r^(ζp) quantify it; ζp deviating from p/3 signals intermittency corrections.',
      chips: ['Page ' + p5, 'Section 2.4', 'Used highlighted text', 'No external sources'] },
  ];

  // Number + order by READING position (page, then vertical y), and assign ascending
  // timestamps in that order so the time-sorted list reads 1..N top-to-bottom and the
  // page pins ascend as you read. (Fixes scrambled badge/pin order.)
  const ord = [...state.annotations].sort((a, b) => (a.page - b.page) || (((a.rects[0] || {}).y || 0) - ((b.rects[0] || {}).y || 0)));
  const half = Math.ceil(ord.length / 2), dayY = new Date(t.getTime() - 86400000);
  ord.forEach((a, i) => {
    a.anchor = i + 1;
    const base = i < half ? dayY : t, mins = 9 * 60 + (i % half) * 26;   // first half "yesterday", rest "today", ascending
    const d = new Date(base); d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    a.created_at = d.toISOString();
    a.messages.forEach((mm, j) => { mm.created_at = new Date(d.getTime() + j * 90000).toISOString(); });
  });
  state.seeded = true; state.ui.activeId = ord[0].id; save();
}
function itemRect(it, vp) {
  const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
  const fh = Math.hypot(tx[2], tx[3]) || ((it.height || 8) * vp.scale);   // device glyph height
  const w = (it.width || 0) * vp.scale;                                    // device width
  return { x: tx[4] / vp.width, y: (tx[5] - fh) / vp.height, w: w / vp.width, h: (fh * 1.18) / vp.height };
}
async function rectsForQuote(page, quote) {
  const FALLBACK = [{ x: 0.14, y: 0.2, w: 0.72, h: 0.03 }];
  if (!pdfDoc) return FALLBACK;
  try {
    const { items, vp } = await ensurePageText(page);
    // Contiguous match: build the page text with a per-character -> item map, find the quote,
    // then compute rects from exactly the matched items (accurate, no false hits on filler).
    let s = ''; const idx = [];
    for (let i = 0; i < items.length; i++) { const t = items[i].str || ''; for (let k = 0; k < t.length; k++) { s += t[k]; idx.push(i); } s += ' '; idx.push(i); }
    const hay = s.toLowerCase(), norm = quote.replace(/\s+/g, ' ').trim().toLowerCase();
    let pos = -1;
    for (const L of [60, 40, 24, 14]) { pos = hay.indexOf(norm.slice(0, L)); if (pos >= 0) break; }
    if (pos < 0) return FALLBACK;
    const end = Math.min(pos + Math.min(norm.length, 110), idx.length - 1);
    const seen = new Set(), raw = [];
    for (let k = pos; k <= end; k++) { const ii = idx[k]; if (ii != null && !seen.has(ii)) { seen.add(ii); const r = itemRect(items[ii], vp); if (r.w > 0.002) raw.push(r); } }
    if (!raw.length) return FALLBACK;
    raw.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];   // merge matched items into per-line rects
    raw.forEach(r => {
      const ln = lines.find(l => Math.abs(l.y - r.y) < r.h * 0.6);
      if (ln) { const right = Math.max(ln.x + ln.w, r.x + r.w); ln.x = Math.min(ln.x, r.x); ln.w = right - ln.x; ln.h = Math.max(ln.h, r.h); }
      else lines.push({ ...r });
    });
    return lines.slice(0, 4);
  } catch (e) { return FALLBACK; }
}

/* ---------- wiring ---------- */
function wire() {
  // sidebar
  const toggleLeft = () => { state.ui.collapseLeft = !state.ui.collapseLeft; $('#app').classList.toggle('collapse-left', state.ui.collapseLeft); save(); requestAnimationFrame(() => { if (viewport) drawConnector(); }); };
  const toggleRight = () => { state.ui.collapseRight = !state.ui.collapseRight; $('#app').classList.toggle('collapse-right', state.ui.collapseRight); save(); requestAnimationFrame(() => { if (viewport) drawConnector(); }); };
  $('#btnCollapseLeft').onclick = toggleLeft; $('#btnToggleLeft').onclick = toggleLeft;
  $('#btnCollapseRight').onclick = toggleRight; $('#btnToggleRight').onclick = toggleRight;
  $('#btnSettings').onclick = () => openSettings();
  $('#newBtn').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; try { await openPdfFile(f); } catch (err) { toast('Could not open file: ' + (err && err.message || err), 'err'); } };
  // reader top
  $('#pagePrev').onclick = () => renderPage(state.ui.page - 1);
  $('#pageNext').onclick = () => renderPage(state.ui.page + 1);
  $('#pageInput').onchange = e => renderPage(parseInt(e.target.value) || 1);
  $('#zoomIn').onclick = () => { state.ui.zoom = clamp(state.ui.zoom + 0.15, 0.5, 3); updateZoom(); };
  $('#zoomOut').onclick = () => { state.ui.zoom = clamp(state.ui.zoom - 0.15, 0.5, 3); updateZoom(); };
  $('#toolCursor').onclick = () => setTool('cursor');
  $('#toolText').onclick = () => setTool('text');
  $('#toolHi').onclick = () => setTool('highlight');
  $('#toolComment').onclick = () => setTool('comment');
  $('#toolShot').onclick = () => setTool('shot');
  $('#capCancel').onclick = () => setTool('cursor');
  // Comment tool: click anywhere on the page to drop a point comment
  $('#pageWrap').addEventListener('click', e => {
    if (state.ui.tool !== 'comment' || !viewport) return;
    if (window.getSelection && String(window.getSelection())) return;   // ignore text selections
    const r = $('#pageWrap').getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / viewport.width, 0, 0.97), y = clamp((e.clientY - r.top) / viewport.height, 0, 0.97);
    const pt = pageTextCache[state.ui.page] || { text: '' };
    const ann = newAnnotation({ source_type: 'free_comment', page: state.ui.page, section: sectionForIndex(pt.text, 0), rects: [{ x, y, w: 0.02, h: 0.02 }] });
    setTool('cursor'); selectAnnotation(ann.id, true); render(); drawPins(); focusComposer();
    toast('Comment placed — type your note below.');
  });
  $('#btnSearch').onclick = () => { const q = prompt('Search inside document:'); if (q) runSearch(q.trim()); };
  $('#btnExportTop').onclick = openExport;
  // selection popover
  document.addEventListener('mouseup', e => { const t = e.target; if (t && t.nodeType === 1 && t.closest('#selPop')) return; setTimeout(onTextSelect, 0); });
  $('#spHi').onclick = () => createFromSelection('yellow');
  $('#spNote').onclick = () => createFromSelection('text');
  $('#spAsk').onclick = () => createFromSelection('ask');
  document.addEventListener('scroll', () => $('#selPop').classList.add('hidden'), true);
  // notes header (mockup 2: funnel + search + kebab)
  $('#btnFilter').onclick = e => openFilterPopover(e.currentTarget);
  $('#btnNotesMenu').onclick = e => openNotesMenu(e.currentTarget);
  $('#btnNotesSearch').onclick = () => {
    const b = $('#ntSearchbar'); b.classList.toggle('hidden');
    if (!b.classList.contains('hidden')) $('#notesSearchInput').focus();
    else { state.ui.query = ''; $('#notesSearchInput').value = ''; render(); }
  };
  $('#notesSearchInput').addEventListener('input', e => { state.ui.query = e.target.value.trim(); render(); });
  $('#composerSend').onclick = sendComposer;
  $('#composerInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComposer(); } });
  $('#composerInput').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px'; });
  $('#sortSel').onclick = () => { state.ui.sort = state.ui.sort === 'time' ? 'page' : 'time'; $('#sortSel').textContent = state.ui.sort === 'time' ? 'Sorted by time ▾' : 'Sorted by page ▾'; save(); render(); };
  $('#rdScroll').addEventListener('scroll', () => requestAnimationFrame(drawConnector));
  window.addEventListener('resize', () => requestAnimationFrame(drawConnector));
  initCaptureMask();
}
function updateZoom() { $('#zoomVal').textContent = Math.round(state.ui.zoom * 100) + '%'; renderPage(state.ui.page); save(); }
function showReaderFallback(msg) {
  // Keep #pageWrap (and its #overlay/#pins nodes) intact — just hide it and show a
  // sibling message. Destroying #pageWrap here previously nulled #overlay/#pins and
  // crashed drawHighlights()/drawPins().
  const scroll = $('#rdScroll'); if (!scroll) return;
  const pw = $('#pageWrap'); if (pw) pw.style.display = 'none';
  let fb = $('#readerFallback');
  if (!fb) { fb = el('<div id="readerFallback"></div>'); scroll.insertBefore(fb, scroll.firstChild); }
  fb.innerHTML = `<div class="fb-card">
    <div style="font-size:34px;margin-bottom:6px">📄</div>
    <h3 style="margin:0 0 8px;font-size:18px">Open this file directly to read the PDF</h3>
    <p style="color:var(--muted);line-height:1.55;margin:0 0 14px">The PDF engine and live AI calls can't run inside this embedded, sandboxed preview. <b>Download the HTML file and open it in your browser</b> (double-click it) to get the full reader, highlighting, screenshots, and live “Ask AI”.</p>
    <p style="color:var(--muted);line-height:1.55;margin:0">Everything else is live right now — explore the source-linked notes, provenance chips, filters, and the export packet on the right. You can also use <b>New</b> to open your own PDF once running locally.</p>
    ${msg ? `<div style="margin-top:14px;color:var(--faint);font-size:12px">Engine note: ${esc(msg)}</div>` : ''}
  </div>`;
}

/* ---------- boot ---------- */
async function boot() {
  // restore actor identity
  ACTORS.you.name = state.settings.actorName || 'You'; ACTORS.you.initials = state.settings.actorInitials || 'YO';
  // apply ui
  $('#app').classList.toggle('collapse-left', state.ui.collapseLeft);
  $('#app').classList.toggle('collapse-right', state.ui.collapseRight);
  $('#zoomVal').textContent = Math.round(state.ui.zoom * 100) + '%';
  await idbOpen(); await rehydrateAssets();   // restore any offloaded screenshot/visual images
  wire(); setTool(state.ui.tool || 'cursor');
  // Resolve the active document's bytes (sample inline, or a user PDF from IndexedDB).
  let startBytes = await loadDocBytes(state.ui.activeDoc);
  if (!startBytes) { state.ui.activeDoc = 'sample'; startBytes = b64ToBytes(window.SAMPLE_PDF_B64); }
  renderTree();
  let pdfOk = true;
  try {
    // Race against a timeout: in a sandboxed preview the worker can hang instead of
    // erroring, which would otherwise block seeding + the whole UI.
    await Promise.race([
      initPdf(startBytes),
      new Promise((_, rej) => setTimeout(() => rej(new Error('PDF engine did not start — likely a sandboxed preview. Open the downloaded file directly.')), 7000)),
    ]);
  } catch (e) { pdfOk = false; showReaderFallback(e && e.message); }
  if (!state.seeded && !state.annotations.length) { try { await seed(); } catch (e) { console.warn('seed failed', e); } }
  if (pdfOk) { await renderPage(state.ui.page); }
  render(); drawHighlights(); drawPins();
  // Pre-cache all page text in the background so AI context retrieval + document search
  // can draw on the whole document (not just visited pages).
  if (pdfOk) setTimeout(() => { for (let n = 1; n <= numPages; n++) ensurePageText(n).catch(() => {}); }, 1200);
}
document.addEventListener('DOMContentLoaded', boot);
})();
