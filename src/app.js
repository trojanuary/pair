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
  openai: 'gpt-5.4', anthropic: 'claude-sonnet-5', gemini: 'gemini-3.5-flash',
  openaiImage: 'gpt-image-1', geminiImage: 'imagen-3.0-generate-002',
};
function defaultState() {
  return {
    settings: {
      provider: 'openai',
      models: { ...DEFAULT_MODELS },
      keys: { openai: '', anthropic: '', gemini: '' },
      enableVisuals: true, enableWeb: true, enablePython: true,
      actorName: 'You', actorInitials: 'YO',
      storage: { mode: 'browser', folderName: '' },
    },
    annotations: [],
    docs: [{ id: 'sample', name: 'Turbulence_review.pdf', kind: 'sample', addedAt: nowISO() }],
    ui: { page: 1, zoom: 1.15, tool: 'cursor', filter: 'all', autoscroll: true, sort: 'time',
          collapseLeft: false, collapseRight: false, activeId: null, activeDoc: 'sample', libView: 'home', continuous: false },
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
  if (!s.ui.libView) s.ui.libView = 'home';
  // one-time: turn all tools on by default (respects later manual changes via the flag)
  if (s.settings && !s.settings._toolsDefaulted) { s.settings.enableVisuals = true; s.settings.enableWeb = true; s.settings.enablePython = true; s.settings._toolsDefaulted = true; }
  // upgrade anyone still on the previous default models to the current generation
  if (s.settings && s.settings.models) {
    const OLD = { openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022', gemini: 'gemini-1.5-pro' };
    for (const k of ['openai', 'anthropic', 'gemini']) if (s.settings.models[k] === OLD[k]) s.settings.models[k] = DEFAULT_MODELS[k];
  }
  // Legacy notes carried the file name as their doc label — map them onto the sample doc id.
  if (s.settings && !s.settings.storage) s.settings.storage = { mode: 'browser', folderName: '' };
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
      scheduleFolderSync();
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
  doc.lastOpened = nowISO();
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
  state.docs.push({ id, name, kind: 'user', addedAt: nowISO(), lastOpened: nowISO() });
  state.ui.libView = 'home'; save();
  await switchDoc(id);
  updateStorage();
  toast('Opened ' + name + ' — highlight text or capture a figure to start.');
}
function toggleStar(id) { const d = state.docs.find(x => x.id === id); if (d) { d.starred = !d.starred; save(); renderTree(); } }
function trashDoc(id) {   // soft delete -> Trash view
  const d = state.docs.find(x => x.id === id); if (!d || d.kind === 'sample') return;
  d.trashed = true; d.trashedAt = nowISO();
  if (state.ui.activeDoc === id) { state.ui.activeDoc = 'sample'; save(); switchDoc('sample'); }
  else { save(); renderTree(); }
  toast('Moved “' + d.name + '” to Trash.');
}
function restoreDoc(id) { const d = state.docs.find(x => x.id === id); if (d) { d.trashed = false; save(); renderTree(); toast('Restored “' + d.name + '”.'); } }
function purgeDoc(id) {   // permanent delete
  const d = state.docs.find(x => x.id === id); if (!d) return;
  const n = state.annotations.filter(a => docIdOf(a) === id).length;
  if (!confirm('Permanently delete “' + d.name + '”' + (n ? ' and its ' + n + ' note' + (n === 1 ? '' : 's') : '') + '? This cannot be undone.')) return;
  state.docs = state.docs.filter(x => x.id !== id);
  state.annotations = state.annotations.filter(a => docIdOf(a) !== id);
  idbDel('pdf:' + id); delete _docBytes[id];
  if (state.ui.activeDoc === id) { state.ui.activeDoc = 'sample'; save(); switchDoc('sample'); }
  else { save(); renderTree(); render(); }
  updateStorage();
}
function docsForView() {
  const v = state.ui.libView || 'home';
  let docs = state.docs.slice();
  if (v === 'trash') return docs.filter(d => d.trashed).sort((a, b) => new Date(b.trashedAt || 0) - new Date(a.trashedAt || 0));
  docs = docs.filter(d => !d.trashed);
  if (v === 'starred') docs = docs.filter(d => d.starred);
  if (v === 'recents') docs.sort((a, b) => new Date(b.lastOpened || b.addedAt || 0) - new Date(a.lastOpened || a.addedAt || 0));
  return docs;
}
const _FILEIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
const _STAR = f => `<svg viewBox="0 0 24 24" fill="${f ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.6 6.6 20.4l1-6.1L3.2 10l6.1-.9z"/></svg>`;
function renderTree() {
  $$('.nav-item[data-view]').forEach(n => n.classList.toggle('active', (state.ui.libView || 'home') === n.dataset.view));
  const lab = $('#libSecLabel'); if (lab) lab.textContent = { home: 'My Library', recents: 'Recents', starred: 'Starred', trash: 'Trash' }[state.ui.libView || 'home'];
  const list = $('#docList'); if (!list) return; list.innerHTML = '';
  const view = state.ui.libView || 'home', inTrash = view === 'trash';
  const docs = docsForView();
  if (!docs.length) {
    const msg = inTrash ? 'Trash is empty.' : view === 'starred' ? 'No starred documents yet.' : 'No documents yet — use New to open a PDF.';
    list.appendChild(el(`<div class="lib-empty">${msg}</div>`)); return;
  }
  docs.forEach(d => {
    const active = d.id === state.ui.activeDoc && !inTrash;
    const actions = inTrash
      ? `<button class="doc-act" data-restore="${d.id}" title="Restore">↩</button><button class="doc-act danger" data-purge="${d.id}" title="Delete forever">${ICON_TRASH}</button>`
      : `<button class="doc-act star ${d.starred ? 'on' : ''}" data-star="${d.id}" title="${d.starred ? 'Unstar' : 'Star'}">${_STAR(d.starred)}</button>`
        + (d.kind === 'user' ? `<button class="doc-act" data-trash="${d.id}" title="Move to trash">${ICON_TRASH}</button>` : '');
    const row = el(`<div class="tree-row indent-1 doc-row ${active ? 'active' : ''}" data-doc="${d.id}" title="${esc(d.name)}">
      <span class="fic" style="color:${active ? '#DC2626' : 'currentColor'}">${_FILEIC}</span>
      <span class="doc-name">${esc(d.name)}</span>
      <span class="doc-actions">${actions}</span></div>`);
    if (!inTrash) row.addEventListener('click', e => { if (e.target.closest('.doc-actions')) return; switchDoc(d.id); });
    list.appendChild(row);
  });
  $$('[data-star]', list).forEach(b => b.onclick = e => { e.stopPropagation(); toggleStar(b.dataset.star); });
  $$('[data-trash]', list).forEach(b => b.onclick = e => { e.stopPropagation(); trashDoc(b.dataset.trash); });
  $$('[data-restore]', list).forEach(b => b.onclick = e => { e.stopPropagation(); restoreDoc(b.dataset.restore); });
  $$('[data-purge]', list).forEach(b => b.onclick = e => { e.stopPropagation(); purgeDoc(b.dataset.purge); });
}
async function updateStorage() {
  const fmt = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(0) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const txt = $('#storageText'), bar = $('#storageBar');
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      if (txt) txt.textContent = fmt(usage) + (quota ? ' of ' + fmt(quota) : ' used');
      if (bar) bar.style.width = Math.max(2, quota ? Math.min(100, usage / quota * 100) : 4) + '%';
      return;
    }
  } catch (e) {}
  if (txt) txt.textContent = state.docs.filter(d => !d.trashed).length + ' documents';
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
  teardownContinuous();
  await renderPage(clamp(state.ui.page, 1, numPages));   // renders single elements (also seeds `viewport`)
  if (state.ui.continuous) await buildContinuous();
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

/* ---------- continuous (scroll-through-all-pages) mode ---------- */
let _contIO = null;
function contHost(create) {
  let h = $('#contPages');
  if (!h && create) { h = el('<div id="contPages"></div>'); $('#rdScroll').insertBefore(h, $('#pageWrap')); }
  return h;
}
async function renderInto(n, pg) {
  if (!pdfDoc || !pg || pg._rendering) return; pg._rendering = true;
  try {
    const page = await pdfDoc.getPage(n);
    const vp = page.getViewport({ scale: state.ui.zoom });
    const canvas = pg.querySelector('canvas'), ctx = canvas.getContext('2d');
    canvas.width = Math.floor(vp.width * outputScale); canvas.height = Math.floor(vp.height * outputScale);
    canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
    pg.style.width = vp.width + 'px'; pg.style.height = vp.height + 'px'; pg.style.minHeight = '';
    await page.render({ canvasContext: ctx, viewport: vp, transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null }).promise;
    const tl = pg.querySelector('.textLayer'); tl.innerHTML = ''; tl.style.width = vp.width + 'px'; tl.style.height = vp.height + 'px'; tl.style.setProperty('--scale-factor', state.ui.zoom);
    const tc = await page.getTextContent();
    await pdfjsLib.renderTextLayer({ textContent: tc, container: tl, viewport: vp, textDivs: [] }).promise;
    pageTextCache[n] = { text: tc.items.map(i => i.str).join(' '), items: tc.items, vp };
    pg._vp = vp; pg._rendered = true;
    drawHighlights(); drawPins();
  } catch (e) { /* leave placeholder */ } finally { pg._rendering = false; }
}
async function buildContinuous() {
  if (!pdfDoc) return;
  const _pw = $('#pageWrap'); if (_pw) _pw.style.display = 'none';
  const _fb = $('#readerFallback'); if (_fb) _fb.remove();
  const host = contHost(true); host.innerHTML = ''; if (_contIO) { _contIO.disconnect(); _contIO = null; }
  const est = viewport ? viewport.height : 900;
  for (let n = 1; n <= numPages; n++) {
    const pg = el(`<div class="pg" data-page="${n}"><canvas></canvas><div class="textLayer"></div><div class="overlay"></div><div class="overlay pins"></div></div>`);
    pg.style.minHeight = est + 'px';
    host.appendChild(pg);
  }
  _contIO = new IntersectionObserver(ents => ents.forEach(e => { if (e.isIntersecting && !e.target._rendered) renderInto(+e.target.dataset.page, e.target); }),
    { root: $('#rdScroll'), rootMargin: '1000px 0px' });
  $$('#contPages .pg').forEach(pg => _contIO.observe(pg));
  const first = clamp(state.ui.page, 1, numPages);
  await renderInto(first, $(`#contPages .pg[data-page="${first}"]`));
  scrollToPage(first, false);
}
function teardownContinuous() {
  if (_contIO) { _contIO.disconnect(); _contIO = null; }
  const h = $('#contPages'); if (h) h.remove();
}
function scrollToPage(n, smooth) {
  const rd = $('#rdScroll'), pg = $(`#contPages .pg[data-page="${n}"]`); if (!rd || !pg) return;
  rd.scrollTop += pg.getBoundingClientRect().top - rd.getBoundingClientRect().top - 12;
}
function currentContinuousPage() {
  const rd = $('#rdScroll'); if (!rd) return state.ui.page; const mid = rd.getBoundingClientRect().top + rd.clientHeight * 0.35;
  let best = state.ui.page, bestD = Infinity;
  $$('#contPages .pg').forEach(pg => { const r = pg.getBoundingClientRect(); const d = Math.abs(r.top - mid); if (r.bottom > rd.getBoundingClientRect().top && d < bestD) { bestD = d; best = +pg.dataset.page; } });
  return best;
}
async function setContinuous(on) {
  state.ui.continuous = on; save();
  const btn = $('#btnContinuous'); if (btn) btn.classList.toggle('active', on);
  if (on) { if (state.ui.tool === 'shot') setTool('cursor'); await buildContinuous(); }
  else { teardownContinuous(); const _pw = $('#pageWrap'); if (_pw) _pw.style.display = ''; await renderPage(state.ui.page); }
  drawHighlights(); drawPins();
}
async function gotoPage(n) {
  n = clamp(n, 1, numPages); state.ui.page = n; $('#pageInput').value = n;
  if (state.ui.continuous) { const pg = $(`#contPages .pg[data-page="${n}"]`); if (pg && !pg._rendered) await renderInto(n, pg); scrollToPage(n, true); requestAnimationFrame(drawConnector); }
  else await renderPage(n);
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
let askNextId = null;   // when set, the next composer message on this note is routed to the AI
function onTextSelect() {
  if (state.ui.tool === 'shot') return;
  const sel = window.getSelection();
  const text = sel && sel.toString().trim();
  const pop = $('#selPop');
  if (!text || text.length < 2) { pop.classList.add('hidden'); return; }
  const range = sel.getRangeAt(0);
  // Find the text layer that holds this selection (single mode: #textLayer; continuous: a .pg .textLayer)
  let node = range.commonAncestorContainer; node = node.nodeType === 1 ? node : node.parentElement;
  const tl = node && node.closest ? node.closest('.textLayer') : null;
  if (!tl) { pop.classList.add('hidden'); return; }
  const pgEl = tl.closest('.pg');
  const selPage = pgEl ? +pgEl.dataset.page : state.ui.page;
  const tlBox = tl.getBoundingClientRect();
  const rects = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1).map(r => ({
    x: (r.left - tlBox.left) / tlBox.width, y: (r.top - tlBox.top) / tlBox.height,
    w: r.width / tlBox.width, h: r.height / tlBox.height,
  }));
  if (!rects.length) { pop.classList.add('hidden'); return; }
  const pt = pageTextCache[selPage] || { text: '' };
  const idx = pt.text.replace(/\s+/g, ' ').toLowerCase().indexOf(text.replace(/\s+/g, ' ').slice(0, 30).toLowerCase());
  const cleanText = pt.text.replace(/\s+/g, ' ');
  pendingSel = {
    text, rects, page: selPage,
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
  // For "Ask AI", flag this note so the user's next message routes to the AI even without a "?".
  askNextId = (kind === 'ask') ? ann.id : null;
  selectAnnotation(ann.id, true);   // expands the note; its inline composer auto-focuses
  drawHighlights(); drawPins();
  pendingSel = null;
}

/* ---------- screenshot capture ---------- */
let cap = null;
function setTool(t) {
  if (t === 'shot' && state.ui.continuous) { toast('Switch to single-page view to capture a figure.'); return; }
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
// The set of on-page render targets for the current mode: single page (#overlay/#pins) or,
// in continuous mode, every rendered .pg wrapper. Keeps highlights/pins/selection unified.
function pageWrappers() {
  if (state.ui.continuous) {
    return $$('#contPages .pg').filter(pg => pg._vp).map(pg => ({ page: +pg.dataset.page, vp: pg._vp, overlay: pg.querySelector('.overlay'), pins: pg.querySelector('.pins') }));
  }
  if (!viewport) return [];
  return [{ page: state.ui.page, vp: viewport, overlay: $('#overlay'), pins: $('#pins') }];
}
function drawHighlights() {
  pageWrappers().forEach(w => {
    const ov = w.overlay; if (!ov) return; ov.innerHTML = ''; ov.style.width = w.vp.width + 'px'; ov.style.height = w.vp.height + 'px';
    state.annotations.filter(a => inActiveDoc(a) && a.page === w.page).forEach(a => {
      if (a.source_type === 'free_comment') return;   // point comments show only a pin, no highlight box
      (a.rects || []).forEach(rc => {
        const cls = a.source_type === 'screenshot' ? 'figbox' : (a.hlColor === 'box' ? 'box' : (a.hlColor === 'yellow' ? 'yellow' : 'text'));
        const d = el(`<div class="hl-rect ${cls}"></div>`);
        Object.assign(d.style, { left: rc.x * w.vp.width + 'px', top: rc.y * w.vp.height + 'px', width: rc.w * w.vp.width + 'px', height: rc.h * w.vp.height + 'px' });
        d.onclick = () => selectAnnotation(a.id, true);
        ov.appendChild(d);
      });
    });
  });
}
function drawPins() {
  pageWrappers().forEach(w => {
    const pins = w.pins; if (!pins) return; pins.innerHTML = ''; pins.style.width = w.vp.width + 'px'; pins.style.height = w.vp.height + 'px';
    state.annotations.filter(a => inActiveDoc(a) && a.page === w.page && a.rects && a.rects.length).forEach(a => {
      const rc = a.rects[0];
      const p = el(`<div class="pin ${a.source_type === 'screenshot' ? 'shot' : ''} ${a.id === state.ui.activeId ? 'sel' : ''}" data-ann="${a.id}">${a.anchor}</div>`);
      p.style.left = (rc.x + rc.w) * w.vp.width + 'px';
      p.style.top = rc.y * w.vp.height + 'px';
      p.onclick = () => selectAnnotation(a.id, false, true);
      pins.appendChild(p);
    });
  });
  drawConnector();
}
function drawConnector() {
  const svg = $('#connectors'); if (!svg) return; while (svg.firstChild) svg.removeChild(svg.firstChild);
  const a = state.annotations.find(x => x.id === state.ui.activeId);
  if (!a) return;
  const pin = document.querySelector(`#rdScroll .pin[data-ann="${a.id}"]`);
  const card = $(`.card[data-ann="${a.id}"]`);
  if (!pin || !card) return;
  const pr = pin.getBoundingClientRect(), cr = card.getBoundingClientRect();
  // Clip to the notes list's visible band so the line tracks the card as the panel scrolls
  // (and disappears when the card is scrolled out of view behind the header/footer).
  const list = $('#notesList');
  const lb = list ? list.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  if (cr.bottom < lb.top + 4 || cr.top > lb.bottom - 4) return;   // card fully out of the list viewport
  const x1 = pr.right, y1 = pr.top + pr.height / 2, x2 = cr.left;
  const y2 = Math.max(lb.top + 6, Math.min(lb.bottom - 6, cr.top + 22));   // anchor clamped into the visible band
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
  if (a && scrollPage) {
    // Continuous mode: scroll the stacked view to the note's page (renderPage would draw into the
    // hidden single-page canvas and never move the reader). Single mode: swap the page as before.
    if (state.ui.continuous) gotoPage(a.page);
    else if (a.page !== state.ui.page) renderPage(a.page).then(() => { drawPins(); });
  }
  render(); drawPins();
  if (scrollCard) scrollNoteIntoView(id, true);
  requestAnimationFrame(drawConnector);
  focusThreadCompose();
}

/* ---------- auto-tagging (heuristic; swappable for a model call) ---------- */
function autoTag(text, srcType, msgType) {
  // Keep this minimal — at most one tag, only on a clear signal. (Users add their own via “+ tag”.)
  const t = (text || '').trim();
  if (msgType === 'generated_visual') return ['Generated visual'];
  if (srcType === 'screenshot') return ['Screenshot'];
  if (/\?\s*$/.test(t) || /^(what|why|how|can you|does|is |are |explain|derive|summar|prove|compare)/i.test(t)) return ['Question'];
  return [];
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
async function aiText(provider, { system, user, image, maxTokens }) {
  const r = await fetch('/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, system, user, image, web: !!state.settings.enableWeb, model: state.settings.models[provider], maxTokens, userKey: keyFor(provider) || undefined }),
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
  const msg = { id: uid('m'), actor: 'ai', provider, model: state.settings.models[provider],
    type: 'ai_answer', text: '', created_at: nowISO(), pending: true,
    chips: chipsFor(a), external: state.settings.enableWeb, tools: [] };
  a.messages.push(msg); a.updated_at = nowISO(); save(); render();
  // OpenAI text notes use the agentic ReAct loop (it can pull more of the document as needed).
  if (provider === 'openai' && a.source_type !== 'screenshot') { await askAIAgent(a, question, msg); return; }
  const ctx = buildContext(a);
  const passages = retrievePassages(question, a.page);
  const system = [
    `You are a precise reading assistant embedded in a source-linked research workspace, answering about the SELECTED SOURCE and its surrounding context from the SAME document.`,
    `Answer style — this matters:`,
    `- Lead with the direct answer in the first sentence. No preamble, no restating the question, no throat-clearing ("Great question", "The selected text discusses…", "Sure!", "Based on the provided context…").`,
    `- Be brief: 1–3 sentences, or a tight bullet list for multi-part answers. Add length only when the question truly needs it.`,
    `- Plain, concrete language. No filler, no hedging, no summary of what you just said.`,
    `- Ground claims in the reader's document; prefer it over generic knowledge. If the context is insufficient, say in one line exactly what's missing.`,
    state.settings.enableWeb
      ? `- Web search is ON: you may look up facts beyond the document when needed, and briefly note when an answer relies on the web.`
      : `- Web search is OFF: rely only on the provided context; do not use outside knowledge.`,
  ].join('\n');
  const user = [
    `SELECTED SOURCE — page ${ctx.page}${ctx.section ? `, ${ctx.section}` : ''}${a.source_type === 'screenshot' ? ' (screenshot)' : ''}:`,
    `"""${ctx.evidence || '(see attached image)'}"""`,
    ctx.caption ? `Nearby caption: ${ctx.caption}` : '',
    ctx.surrounding ? `Surrounding text on the page (…[SELECTION] marks where the excerpt sits…):\n${ctx.surrounding}` : '',
    passages.length ? `Related passages elsewhere in the document:\n${passages.join('\n')}` : '',
    ctx.thread ? `Conversation so far on this note:\n${ctx.thread}` : '',
    `\nReader's question: ${question}`,
  ].filter(Boolean).join('\n\n');
  msg.trace = [{ type: 'context', title: 'Context sent to the model', text: system + '\n\n' + user }];
  if (state.settings.enableWeb) msg.trace.push({ type: 'note', title: 'Web search enabled', text: 'This provider searched the web live; any outside facts and citation links came from that search.' });
  if (passages.length) msg.chips = msg.chips.map(c => c === 'No external sources' ? 'Used related passages · no external sources' : c);
  try {
    const out = await aiText(provider, { system, user, image: ctx.image });
    msg.text = out; msg.pending = false;
    if (msg.trace) msg.trace.push({ type: 'final', title: 'Final answer', text: out });
    a.auto_tags = Array.from(new Set([...(a.auto_tags || []), ...autoTag(question, a.source_type, 'ai_answer')]));
    save(); render();
  } catch (e) {
    msg.pending = false; msg.text = ''; msg.error = e.message;
    save(); render(); toast(errHint(e.message), 'err');
  }
}
/* ---------- agentic ReAct loop (OpenAI): the model gathers exactly the context it needs ---------- */
async function ensureText(p) { try { const e = await ensurePageText(p); if (e && e.text) return e.text.replace(/\s+/g, ' ').trim(); } catch (x) {} return (pageTextCache[p] && pageTextCache[p].text || '').replace(/\s+/g, ' ').trim(); }
async function agentSearch(query) {
  const terms = [...new Set((String(query).toLowerCase().match(/[a-z0-9]{3,}/g) || []))].slice(0, 6);
  if (!terms.length) return 'No search terms.';
  const hits = [];
  for (let p = 1; p <= numPages; p++) {
    const text = await ensureText(p); if (!text) continue; const low = text.toLowerCase();
    for (const t of terms) { const i = low.indexOf(t); if (i >= 0) { hits.push(`(page ${p}) …${text.slice(Math.max(0, i - 90), i + 160).trim()}…`); break; } }
    if (hits.length >= 8) break;
  }
  return hits.length ? hits.join('\n') : `No matches for "${query}".`;
}
async function agentOutline() {
  const out = [];
  for (let p = 1; p <= numPages; p++) {
    const text = await ensureText(p);
    (text.match(/(?:^|\s)(\d+(?:\.\d+)*)\s+([A-Z][A-Za-z][^.]{2,60})/g) || []).slice(0, 3).forEach(h => out.push(`p${p}: ${h.trim()}`));
  }
  return out.length ? out.slice(0, 40).join('\n') : 'No clear section headings detected.';
}
async function agentWeb(query) {
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', web: true, system: 'Search the web and answer concisely with source links.', user: String(query), userKey: keyFor('openai') || undefined }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'web search failed');
    return j.text || '(no web results)';
  } catch (e) { return 'Web search error: ' + (e.message || e); }
}
function agentTools() {
  const t = [
    { type: 'function', function: { name: 'read_selection_context', description: "Re-read the reader's highlighted selection plus the text immediately around it on its page.", parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'read_page', description: 'Read the full text of a specific page (use for the previous/next section or a referenced page).', parameters: { type: 'object', properties: { page: { type: 'integer', description: '1-based page number' } }, required: ['page'] } } },
    { type: 'function', function: { name: 'search_document', description: 'Keyword-search the whole document; returns matching snippets with page numbers.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'document_outline', description: 'List detected section headings with their page numbers to navigate the paper.', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'read_full_document', description: 'Read the entire document text (use for whole-paper summaries; may be truncated if very long).', parameters: { type: 'object', properties: {} } } },
  ];
  if (state.settings.enableVisuals) t.push({ type: 'function', function: { name: 'create_visual', description: 'Generate a visual to help answer: an AI-rendered image (for illustrations, physical scenes, mechanisms, or concepts) or a monospace diagram built from the document (for structure, process, data, or comparisons). Call this when a picture or diagram would materially help — e.g. the reader asks to see, draw, illustrate, or visualize something. Provide a clear description of what to depict.', parameters: { type: 'object', properties: { description: { type: 'string', description: 'What the visual should depict.' } }, required: ['description'] } } });
  if (state.settings.enableWeb) t.push({ type: 'function', function: { name: 'web_search', description: 'Search the public web for facts beyond this document. Returns text with source links.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } });
  return t;
}
const TOOL_LABEL = { read_selection_context: 'Re-reading the selection…', read_page: 'Reading a page…', search_document: 'Searching the document…', document_outline: 'Scanning the outline…', read_full_document: 'Reading the full paper…', create_visual: 'Creating a visual…', web_search: 'Searching the web…' };
async function runAgentTool(a, name, args) {
  try {
    if (name === 'read_selection_context') { const c = buildContext(a); return `Selected (page ${c.page}${c.section ? ', ' + c.section : ''}): "${c.evidence}"\n\nSurrounding text: ${c.surrounding || '(none)'}`; }
    if (name === 'read_page') { const p = clamp(parseInt(args.page) || a.page, 1, numPages); return `Page ${p}:\n${(await ensureText(p)).slice(0, 4500)}`; }
    if (name === 'search_document') return await agentSearch(args.query || '');
    if (name === 'document_outline') return await agentOutline();
    if (name === 'read_full_document') { let out = ''; for (let n = 1; n <= numPages; n++) { out += `\n\n[Page ${n}]\n` + await ensureText(n); if (out.length > 48000) { out += '\n\n[…truncated…]'; break; } } return out.slice(0, 50000); }
    if (name === 'create_visual') { await generateVisual(a.id, String(args.description || '').trim() || 'A visual that helps explain the selected content.'); const vm = a.messages[a.messages.length - 1]; if (vm && vm.type === 'generated_visual' && !vm.error) return `Generated a ${vm.kind === 'image' ? 'image' : 'diagram'} titled "${vm.title}" — it is now shown to the reader in this thread.${vm.caption ? ' Caption: ' + vm.caption : ''} The reader can already see it — reply with at most ONE short sentence pointing to it (e.g. "Here's the diagram."); do NOT describe its contents or offer other versions.`; return 'The visual could not be generated: ' + ((vm && vm.error) || 'unknown error') + '. Answer in text instead.'; }
    if (name === 'web_search') return await agentWeb(args.query || '');
  } catch (e) { return 'Tool error: ' + (e.message || e); }
  return 'Unknown tool: ' + name;
}
async function aiAgentStep(model, messages, tools) {
  const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'openai', mode: 'agent', model, messages, tools, userKey: keyFor('openai') || undefined }) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || `Agent step failed (${r.status})`);
  return j;
}
function agentChips(a, used) {
  const chips = [`Page ${a.page}`];
  if (a.section) chips.push(a.section.replace(/^(\d+(\.\d+)*)\s+/, m => 'Section ' + m.trim() + ' ').trim());
  if (used.has('read_full_document')) chips.push('Read full paper');
  if (used.has('search_document')) chips.push('Searched document');
  if (used.has('read_page') || used.has('document_outline')) chips.push('Read related pages');
  if (used.has('create_visual')) chips.push('Generated visual');
  chips.push(a.source_type === 'screenshot' ? 'Used screenshot' : 'Used highlighted text');
  chips.push(used.has('web_search') ? 'Used web search' : 'No external sources');
  return chips;
}
async function askAIAgent(a, question, msg) {
  const model = state.settings.models.openai || 'gpt-5.4';
  const c = buildContext(a);
  const system = [
    `You are a precise research assistant embedded in a source-linked reading workspace, answering about the document the reader is viewing.`,
    `You have tools to fetch exactly the context you need before answering: re-read the selection, read a specific page, search the document, get the outline, read the whole paper${state.settings.enableWeb ? ', search the web' : ''}${state.settings.enableVisuals ? ', or generate a visual (an image, or a monospace diagram built from the document)' : ''}. Use them when they help — e.g. to summarize the whole paper, verify a claim elsewhere, pull an adjacent section, or produce a picture/diagram when the reader asks to see or visualize something. Prefer the smallest sufficient context; call tools only as needed, then answer.`,
    `Answer style: lead with the direct answer, be concise (no preamble or fluff), and ground claims in the document.`,
  ].join('\n');
  const userContext = [
    c.evidence ? `The reader selected this passage on page ${c.page}${c.section ? `, ${c.section}` : ''}:\n"""${c.evidence}"""` : `The reader is on page ${c.page}${c.section ? `, ${c.section}` : ''} (no text selected).`,
    c.surrounding ? `Immediate surrounding text: ${c.surrounding.slice(0, 700)}` : '',
    c.thread ? `Conversation so far on this note:\n${c.thread}` : '',
    `The document has ${numPages} pages. Reader's question: ${question}`,
  ].filter(Boolean).join('\n\n');
  const messages = [{ role: 'system', content: system }, { role: 'user', content: userContext }];
  const tools = agentTools(); const used = new Set();
  msg.trace = [{ type: 'context', title: 'Context sent to the model', text: userContext }];
  try {
    let answer = '';
    for (let i = 0; i < 7 && !answer; i++) {
      msg.status = i === 0 ? 'Thinking…' : 'Gathering context…'; save(); render();
      const step = await aiAgentStep(model, messages, tools);
      if (step.tool_calls && step.tool_calls.length) {
        messages.push({ role: 'assistant', content: step.content || '', tool_calls: step.tool_calls });
        if (step.content && step.content.trim()) msg.trace.push({ type: 'thought', title: 'Model reasoning', text: step.content.trim() });
        for (const tc of step.tool_calls) {
          let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
          used.add(tc.function.name);
          msg.status = TOOL_LABEL[tc.function.name] || 'Working…'; save(); render();
          const result = String(await runAgentTool(a, tc.function.name, args));
          messages.push({ role: 'tool', tool_call_id: tc.id, content: result.slice(0, 50000) });
          msg.trace.push({ type: 'tool', name: tc.function.name, args, result: result.slice(0, 6000) });
        }
        continue;
      }
      if (step.content && step.content.trim()) { answer = step.content.trim(); break; }
      // Empty turn with no tool call — nudge the model to answer from what it has.
      messages.push({ role: 'user', content: 'Answer the question now, directly and concisely, using the context you have gathered. Do not call any tools.' });
    }
    // Guaranteed final answer: one more call with NO tools so the model must produce text.
    if (!answer) {
      msg.status = 'Writing the answer…'; save(); render();
      const fin = await aiAgentStep(model, messages.concat([{ role: 'user', content: 'Give your best answer now in a few sentences using the gathered context. If the document lacks the detail, say briefly what is missing. Do not call tools.' }]), []);
      answer = (fin.content || '').trim();
      msg.trace.push({ type: 'final', title: 'Final synthesis', text: answer });
    }
    msg.text = answer || 'The document doesn’t seem to cover that — try selecting the relevant passage, or ask a more specific question.';
    if (answer && !(msg.trace.length && msg.trace[msg.trace.length - 1].type === 'final')) msg.trace.push({ type: 'final', title: 'Final answer', text: answer });
    msg.pending = false; msg.status = null; msg.chips = agentChips(a, used);
    a.auto_tags = Array.from(new Set([...(a.auto_tags || []), ...autoTag(question, a.source_type, 'ai_answer')]));
    save(); render();
  } catch (e) {
    msg.pending = false; msg.status = null; msg.text = ''; msg.error = e.message;
    save(); render(); toast(errHint(e.message), 'err');
  }
}
function stripJson(s) {
  const raw = String(s == null ? '' : s).replace(/```json|```/g, '').trim();
  try { return JSON.parse(raw); } catch (e) {}
  const m = raw.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  // Salvage a truncated/partial planner object by pulling known fields out of the text (never return raw JSON to the UI).
  const out = {}; const un = v => { try { return JSON.parse('"' + v + '"'); } catch (e) { return v; } }; let x;
  if ((x = raw.match(/"format"\s*:\s*"(ascii|image)"/))) out.format = x[1];
  if ((x = raw.match(/"ascii"\s*:\s*"((?:\\.|[^"\\])*)"/))) out.ascii = un(x[1]);
  if ((x = raw.match(/"image_prompt"\s*:\s*"((?:\\.|[^"\\])*)"/))) out.image_prompt = un(x[1]);
  if ((x = raw.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/))) out.title = un(x[1]);
  if ((x = raw.match(/"caption"\s*:\s*"((?:\\.|[^"\\])*)"/))) out.caption = un(x[1]);
  if ((x = raw.match(/"takeaways"\s*:\s*\[([\s\S]*?)\]/))) { try { out.takeaways = JSON.parse('[' + x[1] + ']'); } catch (e) {} }
  return Object.keys(out).length ? out : null;
}
// Broader document context for a visual (selection + surrounding + cross-document passages).
function visualContext(a, prompt) {
  const ctx = buildContext(a);
  const passages = retrievePassages((prompt || '') + ' ' + (a.selected_text || ''), a.page);
  let docText = '';
  if (a.source_type === 'doc' || /\b(paper|document|overall|whole|entire|main results?|summary|summari[sz]e)\b/i.test(prompt || '')) {
    for (let n = 1; n <= Math.min(numPages, 6); n++) { const t = (pageTextCache[n] && pageTextCache[n].text) || ''; if (t) docText += `\n[p${n}] ${t.replace(/\s+/g, ' ').slice(0, 700)}`; }
  }
  return { ctx, passages, docText };
}
async function generateVisual(annId, prompt) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  const ip = pickImageProvider();
  const canImage = state.settings.enableVisuals && ip;
  const msg = { id: uid('m'), actor: 'ai', provider: ip || activeProvider(), model: '',
    type: 'generated_visual', created_at: nowISO(), pending: true, status: 'Planning the visual…', title: 'Visual',
    kind: null, image: null, ascii: '', takeaways: [], strip: [], caption: '',
    chips: chipsFor(a, { visual: true }) };
  a.messages.push(msg); a.updated_at = nowISO(); save(); render();
  const { ctx, passages, docText } = visualContext(a, prompt);
  const tp = activeProvider();
  // 1) Let the model choose the RIGHT format and produce it, grounded in the document.
  const planSys = [
    'You turn a reader\'s request into the most useful visual. Choose the FORMAT ("ascii" = monospace text diagram built only from the document; "image" = an AI-rendered picture) using this PRIORITY ORDER:',
    '1) If the request depicts the paper\'s RESULTS, findings, data, numbers, statistics, a table, comparisons, equations, or a "summary of results" → "ascii". This wins EVEN IF the reader wrote "image" or "picture" (an image would fabricate the specifics). Example: "create an image of the main results" → ascii.',
    '2) Else if the reader says diagram / flowchart / schematic / chart / pipeline / tree / table → "ascii".',
    '3) Else if the reader asks to illustrate / draw / sketch / picture a phenomenon, physical scene, mechanism, object, analogy, or concept → "image". Examples: "illustrate eddies breaking into smaller eddies" → image; "draw the experimental setup" → image; "picture of a hairpin vortex" → image.',
    '4) If ambiguous → "ascii".',
    'For "ascii" build a faithful monospace diagram from the document (never invent numbers). For "image" write a vivid image_prompt.',
    (canImage ? '' : 'NOTE: image generation is unavailable, so you must use "ascii".'),
    'Return STRICT JSON only. Put the heavy field ("ascii" or "image_prompt") FIRST so it survives if the response is cut off: {"format":"ascii"|"image","ascii":"<monospace diagram, <=24 lines, only if ascii>","image_prompt":"<detailed prompt, only if image>","title":"<=6 words","takeaways":["2-4 short bullets grounded in the doc"],"caption":"one line"}',
  ].filter(Boolean).join('\n');
  const planUser = [
    `Reader's request: ${prompt || 'Make a helpful visual of this.'}`,
    ctx.evidence ? `Selected source (page ${ctx.page}${ctx.section ? ', ' + ctx.section : ''}): """${ctx.evidence}"""` : `Location: page ${ctx.page}${ctx.section ? ', ' + ctx.section : ''}`,
    ctx.caption ? `Nearby caption: ${ctx.caption}` : '',
    ctx.surrounding ? `Surrounding text: ${ctx.surrounding.slice(0, 700)}` : '',
    passages.length ? `Other relevant passages:\n${passages.join('\n')}` : '',
    docText ? `Document excerpts:${docText}` : '',
  ].filter(Boolean).join('\n\n');
  try {
    const planRaw = await aiText(tp, { system: planSys, user: planUser, image: ctx.image, maxTokens: 2600 });
    let plan = stripJson(planRaw) || {};
    if (!plan.format) plan.format = (canImage && /\b(illustrat|picture|scene|concept art|artistic|imagine|photo)\b/i.test(prompt || '')) ? 'image' : 'ascii';
    if (plan.format === 'image' && !canImage) plan.format = 'ascii';
    msg.title = plan.title || (plan.format === 'image' ? 'Generated image' : 'Diagram');
    msg.takeaways = Array.isArray(plan.takeaways) ? plan.takeaways : [];
    msg.caption = plan.caption || '';
    if (plan.format === 'image' && plan.image_prompt) {
      msg.status = 'Generating image…'; save(); render();
      try {
        msg.image = await aiImage(ip, `${plan.image_prompt}. Clean, legible, uncluttered, white background, no logos, no gibberish text.`);
        msg.kind = 'image'; msg.model = state.settings.models[ip === 'openai' ? 'openaiImage' : 'geminiImage'];
      } catch (e) { msg.kind = 'ascii'; msg.ascii = plan.ascii || ('Image generation failed: ' + (e.message || e)); }
    } else {
      msg.kind = 'ascii'; msg.model = state.settings.models[tp];
      let art = (plan.ascii || '').trim();
      if (!art) {
        // Planner JSON was unusable (e.g. truncated before the diagram) — ask for the diagram as plain text so there's no JSON to break.
        msg.status = 'Drawing the diagram…'; save(); render();
        try { const rawDiagram = await aiText(tp, { system: 'Return ONLY a faithful monospace/ASCII diagram (max 24 lines) built strictly from the document context below. No prose, no explanation, no JSON, no code fences.', user: planUser, image: ctx.image, maxTokens: 2200 }); art = String(rawDiagram || '').replace(/```[a-z]*|```/g, '').trim(); } catch (e) {}
      }
      if (art) msg.ascii = art;
      else { msg.error = 'Could not render the diagram — please try again.'; msg.title = 'Visual unavailable'; }
    }
    msg.pending = false; msg.status = null;
    a.auto_tags = Array.from(new Set([...(a.auto_tags || []), 'Generated visual']));
    save(); render();
  } catch (e) {
    msg.pending = false; msg.status = null; msg.error = e.message; msg.title = 'Visual generation failed';
    save(); render(); toast(errHint(e.message), 'err');
  }
}
function errHint(m) {
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Could not reach the AI endpoint (/api/ai). This works on the deployed site; when opening the file locally without the server, add a key in Settings or run it via the deployment.';
  if (/no .*key available/i.test(m)) return m + ' (Settings → paste a key to use your own.)';
  return m;
}
// Live-highlight @gpt/@claude/@gemini/@ai mentions in a composer textarea by mirroring its text
// into a backdrop div (the textarea itself is transparent-text with a visible caret).
function attachMentions(ta) {
  if (!ta || ta._menWired) return;
  const box = ta.closest('.men-box'); if (!box) return;
  const hl = box.querySelector('.men-hl'); if (!hl) return;
  const cs = getComputedStyle(ta);
  ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'textIndent', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].forEach(p => { hl.style[p] = cs[p]; });
  hl.style.borderStyle = 'solid'; hl.style.borderColor = 'transparent';
  const sync = () => { hl.innerHTML = esc(ta.value).replace(/@(gpt|claude|gemini|ai)\b/ig, m => `<span class="men">${m}</span>`) + '\n'; hl.scrollTop = ta.scrollTop; };
  ta.addEventListener('input', sync);
  ta.addEventListener('scroll', () => { hl.scrollTop = ta.scrollTop; });
  ta._menWired = true; sync();
}

/* ---------- composer ---------- */
// Focus the inline composer that lives inside the active note card.
function focusThreadCompose() {
  const go = () => { const ta = document.querySelector('.card.sel .tc-input'); if (!ta) return; try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } };
  go(); requestAnimationFrame(go); setTimeout(go, 60);
}
const focusComposer = focusThreadCompose;   // back-compat alias for existing callers
// Add the user's message to a note and route it (visual request / question / @mention / “Ask AI”).
function submitToNote(annId, rawText) {
  const text = (rawText || '').trim();
  const a = state.annotations.find(x => x.id === annId);
  if (!text || !a) return;
  if (a.messages.some(mm => mm.actor === 'you' && mm.type === 'comment' && mm.text === text && (Date.now() - new Date(mm.created_at).getTime()) < 5000)) return;
  const mProvider = /@claude/i.test(text) ? 'anthropic' : /@gpt/i.test(text) ? 'openai' : /@gemini/i.test(text) ? 'gemini' : null;
  const clean = text.replace(/@(ai|gpt|claude|gemini)/ig, '').trim();
  a.messages.push({ id: uid('m'), actor: 'you', type: 'comment', text: text, created_at: nowISO() });
  a.auto_tags = Array.from(new Set([...(a.auto_tags || []), ...autoTag(text, a.source_type, 'comment')]));
  a.updated_at = nowISO(); save(); render(); focusThreadCompose();
  const forceAsk = askNextId === a.id; askNextId = null;   // user chose “Ask AI” on this note
  const wantAI = forceAsk || mProvider || /@ai/i.test(text) || /\?\s*$/.test(text) || /^(explain|summar|derive|what|why|how|does|is|are|prove|show|compare)/i.test(clean);
  if (isVisualRequest(clean)) generateVisual(a.id, clean);
  else if (wantAI) askAI(a.id, clean || text, mProvider || undefined);
}
// Recognize a request to CREATE a visual (image or diagram) — a visual noun + a make/turn-into verb.
function isVisualRequest(t) {
  t = t || '';
  const noun = /\b(image|picture|illustration|figure|visual|diagram|chart|graph|plot|infographic|schematic|flow-?chart|drawing|mind ?map|sketch)\b/i.test(t);
  const verb = /\b(generate|make|create|draw|produce|render|design|sketch|mock ?up|whip up|visuali[sz]e|turn|convert|give me|summari[sz]e)\b/i.test(t);
  const asNoun = /\bas an?\s+(image|picture|diagram|chart|graph|figure|schematic|flow-?chart|infographic|sketch|visual|mind ?map)\b/i.test(t);
  return (noun && verb) || asNoun || /\bvisuali[sz]e\b/i.test(t);
}
// Ask a general question about the whole document — no text selection required.
// Creates a document-level note (no pin/highlight) and routes the question to the AI.
function askAboutDocument(text) {
  if (!text || !text.trim() || !pdfDoc) { if (!pdfDoc) toast('Open a document first.', 'err'); return; }
  const pt = pageTextCache[state.ui.page] || { text: '' };
  const ann = newAnnotation({ source_type: 'doc', page: state.ui.page, section: sectionForIndex(pt.text, 0), selected_text: '', rects: [] });
  askNextId = ann.id;                 // force this message to the AI
  if (state.ui.collapsed) delete state.ui.collapsed[ann.id];
  selectAnnotation(ann.id, true);
  submitToNote(ann.id, text);
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
    const hay = [a.selected_text, a.section, a.caption, srcLabel(a), 'page ' + a.page,
      ...(a.auto_tags || []), ...(a.manual_tags || []),
      ...a.messages.map(m => (m.text || m.title || '') + ' ' + (m.actor === 'ai' ? (PROVIDER_LABEL[m.provider] || 'AI') : ''))
    ].join(' ').toLowerCase();
    // every whitespace-separated term must appear (so "energy cascade" matches even if not adjacent)
    const terms = state.ui.query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.every(t => hay.includes(t))) return false;
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
function srcLabel(a) { return a.source_type === 'screenshot' ? 'Screenshot' : a.source_type === 'free_comment' ? 'Comment' : a.source_type === 'equation' ? 'Equation' : a.source_type === 'doc' ? 'Question about document' : 'Linked text'; }
// linked quote — long quotes are clamped to a few lines with a Show more/less toggle so a big
// selection (e.g. a whole abstract) doesn't dominate the card for a one-line question.
function quoteBlock(text) {
  const long = (text || '').length > 150;
  if (!long) return `<div class="linked-quote">${esc(text)}</div>`;
  return `<div class="quote-wrap"><div class="linked-quote clip">${esc(text)}</div><button class="quote-more" data-quotemore="1">Show more</button></div>`;
}

const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
const ICON_CHEVUP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
// hover action icons in a message head — collapse (note head), copy, edit (comment or AI), plus delete-note / delete-reply
function msgActions(a, m, isFirst) {
  const editable = m.type === 'comment' || m.type === 'ai_answer';
  // Collapse chevron sits outside .macts so it stays visible; copy/edit/delete reveal on hover.
  const collapse = isFirst ? `<button class="mact collapse-btn" data-collapse="${a.id}" title="Collapse thread">${ICON_CHEVUP}</button>` : '';
  const copy = isFirst
    ? `<button class="mact" data-copynote="${a.id}" title="Copy whole thread">${ICON_COPY}</button>`
    : `<button class="mact" data-copymsg="${m.id}" data-ann="${a.id}" title="Copy this response">${ICON_COPY}</button>`;
  return collapse + `<span class="macts">`
    + copy
    + (editable ? `<button class="mact" data-edit="${m.id}" data-ann="${a.id}" title="Edit">${ICON_EDIT}</button>` : '')
    + (isFirst ? `<button class="mact" data-delnote="${a.id}" title="Delete note">${ICON_TRASH}</button>`
               : `<button class="mact" data-delmsg="${m.id}" data-ann="${a.id}" title="Delete reply">${ICON_TRASH}</button>`)
    + `</span>`;
}
function msgToText(a, m) {
  const who = m.actor === 'ai' ? (PROVIDER_LABEL[m.provider] || 'AI') : actorName(m);
  if (m.type === 'comment') return `${who}: ${m.text || ''}`;
  if (m.type === 'ai_answer') return `${who}: ${m.text || ''}` + (m.chips && m.chips.length ? `\n(${m.chips.join(' · ')})` : '');
  if (m.type === 'generated_visual') return `${who}: ${m.title || 'Visual'}${m.image ? ' [image]' : ''}` + (m.ascii ? `\n\n${m.ascii}` : '') + (m.takeaways && m.takeaways.length ? `\n\n- ${m.takeaways.join('\n- ')}` : '');
  return '';
}
function noteToText(a) {
  const L = [`${srcLabel(a)} — Page ${a.page}${a.section ? ' · ' + a.section : ''}`];
  if (a.selected_text) L.push(`"${a.selected_text}"`);
  (a.messages || []).forEach(m => { const t = msgToText(a, m); if (t) L.push(t); });
  const tags = [...(a.auto_tags || []), ...(a.manual_tags || [])]; if (tags.length) L.push(`Tags: ${tags.join(', ')}`);
  return L.join('\n\n');
}
function fallbackCopy(txt, done) {
  try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); ta.remove(); (done || (() => {}))(); }
  catch (e) { toast('Copy failed — select the text and copy manually.', 'err'); }
}
function copyTextToClipboard(txt, label) {
  const done = () => toast((label || 'Copied') + ' to clipboard.');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  else fallbackCopy(txt, done);
}
function copyNote(annId) { const a = state.annotations.find(x => x.id === annId); if (a) copyTextToClipboard(noteToText(a), 'Note'); }
function copyMsg(annId, msgId) { const a = state.annotations.find(x => x.id === annId); if (!a) return; const m = a.messages.find(x => x.id === msgId); if (m) copyTextToClipboard(msgToText(a, m).replace(/^[^:]+:\s*/, ''), 'Response'); }
function editBox(a, m) {
  const reask = m.actor === 'you' ? `<button class="eb-reask" data-reask="${m.id}" data-ann="${a.id}">Save &amp; re-ask AI</button>` : '';
  return `<div class="edit-wrap"><textarea class="edit-input" data-editing="${m.id}" data-ann="${a.id}">${esc(m.text || '')}</textarea>`
    + `<div class="edit-actions"><button class="eb-save" data-savemsg="${m.id}" data-ann="${a.id}">Save</button>${reask}<button class="eb-cancel" data-canceledit="1">Cancel</button></div></div>`;
}
function msgCard(a, m, isFirst) {
  const head = `<div class="card-h">${actorAvatar(m)}<span class="who">${esc(actorName(m))}</span><span class="when">${timeLabel(m.created_at)}</span>${msgActions(a, m, isFirst)}</div>`;
  const editing = state.ui.editing === m.id;
  let body = '';
  if (isFirst) {
    body += `<div class="q-src"><span class="qn">${a.anchor}</span>${srcLabel(a)} · Page ${a.page}${a.section ? ' · ' + esc(a.section) : ''}${a.resolved ? ' · <span class="resolved-flag">✓ Resolved</span>' : ''}</div>`;
    if (a.source_type === 'screenshot' && a.screenshot) body += `<div class="shot-thumb"><img src="${a.screenshot}"></div>`;
    else if (a.selected_text) body += quoteBlock(a.selected_text);
  }
  if (m.type === 'comment') body += editing ? editBox(a, m) : `<div class="msg">${m.text ? esc(m.text).replace(/@(ai|gpt|claude|gemini)/ig, x => `<span class="men">${x}</span>`) : ''}</div>`;
  if (m.type === 'ai_answer') {
    if (m.pending) body += `<div class="msg"><span class="typing">${esc(m.status || 'Thinking')}<i></i><i></i><i></i></span></div>`;
    else if (m.error) body += `<div class="msg" style="color:#B91C1C">⚠ ${esc(m.error)}</div>`;
    else if (editing) body += editBox(a, m);
    else {
      // Answer first; provenance chips are tucked into a collapsed “sources” disclosure.
      body += `<div class="msg">${mdLite(m.text)}</div>`
        + `<details class="prov" data-disc="prov:${m.id}"${(state.ui.openDisc || {})['prov:' + m.id] ? ' open' : ''}><summary><span class="disc-i">ⓘ</span> AI-generated${m.model ? ' · ' + esc(m.model) : ''}<span class="prov-more"> · sources</span></summary><div class="prov-body"><div class="prov-lbl">What this answer used</div>${chipRow((m.chips && m.chips.length) ? m.chips : chipsFor(a))}</div></details>`
        + traceHTML(m);
    }
  }
  if (m.type === 'generated_visual') {
    const isImg = m.kind === 'image' || (!m.kind && m.image);
    body += `<div class="badge-gen">${isImg ? 'Generated image' : 'Diagram'}</div>`;
    if (m.pending) body += `<div class="vis-card"><span class="typing">${esc(m.status || 'Working')}<i></i><i></i><i></i></span></div>`;
    else if (m.error) body += `<div class="msg" style="color:#B91C1C">⚠ ${esc(m.error)}</div>`;
    else {
      body += `<div class="vis-card"><h4>${esc(m.title || 'Visual')}</h4>`;
      if (m.image) body += `<img src="${m.image}">`;
      else if (m.ascii) body += `<pre class="ascii">${esc(m.ascii)}</pre>`;
      if (m.takeaways?.length) body += `<ul class="vis-take">${m.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
      body += `</div>`;
      body += chipRow((m.chips ? m.chips.slice() : chipsFor(a, { visual: true })));
      body += `<div class="disc">${isImg ? 'AI-generated illustration · not extracted data' : 'Text diagram from the document'}${m.model ? ' · ' + esc(m.model) : ''}</div>`;
    }
  }
  return { head, body };
}

function cardKind(a) {
  // AI presence wins: any note we asked AI in (answer or generated visual) reads as an "AI" card.
  if ((a.messages || []).some(m => m.actor === 'ai' && (m.type === 'ai_answer' || m.type === 'generated_visual'))) return 'ai';
  if (a.source_type === 'screenshot') return 'shot';
  if (a.source_type === 'free_comment') return 'comment';
  return 'hl';
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
  const wrap = el(`<div class="card compact k-${cardKind(a)} ${a.resolved ? 'isres' : ''}" data-ann="${a.id}">
    ${!a.resolved ? '<span class="unread-dot"></span>' : ''}
    <div class="card-h"><span style="width:22px;height:22px;border-radius:50%;background:${badge};color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center;flex:0 0 auto">${a.anchor}</span>
      <span class="who">${label}</span><span class="when">${when}</span></div>
    <div class="card-b">
      ${preview ? `<div class="msg clamp">${esc(preview).replace(/@(ai|gpt|claude|gemini)/ig, x => `<span class="men">${x}</span>`)}</div>` : ''}
      ${a.source_type === 'screenshot' && a.screenshot ? `<div class="shot-thumb"><img src="${a.screenshot}"></div>` : ''}
      <div class="loc-line">Page ${a.page}${a.section ? ' · ' + esc(a.section) : ''}${a.resolved ? ' · <span class="resolved-flag">✓ Resolved</span>' : ''}</div>
    </div></div>`);
  wrap.addEventListener('click', ev => { if (ev.target.closest('[data-menu],button')) return; if (window.getSelection && String(window.getSelection()).trim()) return; if (state.ui.collapsed) delete state.ui.collapsed[a.id]; selectAnnotation(a.id, true, true); });
  return wrap;
}
function annCard(a) {
  // Compact unless it's the active note AND not explicitly collapsed by the user.
  if (a.id !== state.ui.activeId || (state.ui.collapsed && state.ui.collapsed[a.id])) return [compactCard(a)];
  // Expanded: ONE card holds the whole note thread — the question/comment first, then every
  // AI answer / follow-up nested INSIDE it as a reply (so replies read as replies, not siblings).
  let headHtml, firstBody;
  if (a.messages.length) {
    const mc = msgCard(a, a.messages[0], true);
    headHtml = mc.head; firstBody = mc.body;
  } else {
    headHtml = `<div class="card-h">${actorAvatar({ actor: 'you' })}<span class="who">${esc(state.settings.actorName || 'You')}</span><span class="when">${timeLabel(a.created_at)}</span>`
      + `<button class="mact collapse-btn" data-collapse="${a.id}" title="Collapse thread">${ICON_CHEVUP}</button><span class="macts"><button class="mact" data-copynote="${a.id}" title="Copy note">${ICON_COPY}</button><button class="mact" data-delnote="${a.id}" title="Delete note">${ICON_TRASH}</button></span></div>`;
    firstBody = `<div class="q-src"><span class="qn">${a.anchor}</span>${srcLabel(a)} · Page ${a.page}${a.section ? ' · ' + esc(a.section) : ''}</div>`
      + (a.source_type === 'screenshot' && a.screenshot ? `<div class="shot-thumb"><img src="${a.screenshot}"></div>` : (a.selected_text ? quoteBlock(a.selected_text) : ''));
  }
  let replies = '';
  for (let i = 1; i < a.messages.length; i++) {
    const m = a.messages[i];
    const { head, body } = msgCard(a, m, false);
    replies += `<div class="reply ${m.actor === 'ai' ? 'ai' : ''}" data-msg="${m.id}">${head}<div class="reply-b">${body}</div></div>`;
  }
  // Inline thread composer — reply / ask a follow-up right inside the note (no detached bottom bar).
  const compose = `<div class="thread-compose">
    <div class="men-box"><div class="men-hl" aria-hidden="true"></div><textarea class="tc-input men-input" rows="1" placeholder="Reply or ask a follow-up…"></textarea></div>
    <button class="tc-send" title="Send"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg></button>
  </div>`;
  const wrap = el(`<div class="card sel k-${cardKind(a)} ${a.resolved ? 'isres' : ''}" data-ann="${a.id}">
    ${headHtml}<div class="card-b">${firstBody}${tagPills(a)}</div>
    ${replies ? `<div class="replies">${replies}</div>` : ''}
    ${compose}</div>`);
  wrap.addEventListener('click', ev => {
    if (ev.target.closest('[data-menu],[data-rmtag],[data-addtag],[data-edit],[data-delnote],[data-delmsg],[data-quotemore],.thread-compose,button,a,textarea,summary,details')) return;
    if (window.getSelection && String(window.getSelection()).trim()) return;   // let the user select/copy text without re-rendering
    selectAnnotation(a.id, false);
  });
  return [wrap];
}
// Collapsible "agent's work" transcript: the context sent, each tool call + result, final synthesis.
function traceHTML(m) {
  if (!m.trace || !m.trace.length) return '';
  const tools = m.trace.filter(s => s.type === 'tool');
  const nTools = tools.length;
  let n = 0;
  const steps = m.trace.map(s => {
    n++;
    if (s.type === 'tool') {
      const args = (s.args && Object.keys(s.args).length) ? esc(JSON.stringify(s.args)) : '(none)';
      return `<div class="tr-step"><div class="tr-h"><span class="tr-n">${n}</span>🔧 Tool call · <b>${esc(s.name)}</b></div><div class="tr-sub">Input</div><pre class="tr-body">${args}</pre><div class="tr-sub">Result</div><pre class="tr-body">${esc(s.result || '(empty)')}</pre></div>`;
    }
    const label = s.title || (s.type === 'final' ? 'Final answer' : s.type === 'thought' ? 'Model reasoning' : s.type === 'context' ? 'Context sent to the model' : s.type);
    return `<div class="tr-step"><div class="tr-h"><span class="tr-n">${n}</span>${esc(label)}</div><pre class="tr-body">${esc(s.text || '')}</pre></div>`;
  }).join('');
  const toolsLine = nTools ? `<div class="tr-tools">Tools called: ${tools.map(t => `<code>${esc(t.name)}</code>`).join(', ')}</div>` : `<div class="tr-tools">No tools were needed — answered directly from the context.</div>`;
  const id = 'trace:' + (m.id || '');
  const open = (state.ui.openDisc || {})[id] ? ' open' : '';
  return `<details class="trace" data-disc="${id}"${open}><summary>Show the agent's work${nTools ? ` · ${nTools} tool call${nTools === 1 ? '' : 's'}` : ''}</summary><div class="tr-list">${toolsLine}${steps}</div></details>`;
}
function mdInline(s) {
  // s is ALREADY html-escaped. Apply inline markdown (code, links, bold, italic, mentions).
  return s
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="cite">$1</a>')
    .replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([^\n]+?)__/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)(?<!\s)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/@(ai|gpt|claude|gemini)\b/ig, x => `<span class="men">${x}</span>`);
}
function mdLite(t) {
  // Block-aware markdown -> HTML: headers, tables, ordered/unordered lists, blockquotes, rules,
  // paragraphs, plus inline formatting. Input is escaped up front so it is XSS-safe.
  const lines = esc(t == null ? '' : String(t)).replace(/\r\n?/g, '\n').split('\n');
  const isSep = l => l.includes('|') && /^[\s|:\-]+$/.test(l) && l.includes('-');
  const cells = l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
  const isBlock = (l, nx) => /^#{1,6}\s+/.test(l) || /^\s*[-*+•]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)
    || /^\s*>\s?/.test(l) || /^\s*([-*_])\1{2,}\s*$/.test(l) || (l.includes('|') && isSep(nx || ''));
  const out = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.includes('|') && isSep(lines[i + 1] || '')) {
      const header = cells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
      const th = '<tr>' + header.map(c => `<th>${mdInline(c)}</th>`).join('') + '</tr>';
      const tb = rows.map(r => '<tr>' + r.map(c => `<td>${mdInline(c)}</td>`).join('') + '</tr>').join('');
      out.push(`<div class="md-tablewrap"><table class="md-table"><thead>${th}</thead><tbody>${tb}</tbody></table></div>`); continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lvl = h[1].length <= 1 ? 4 : h[1].length === 2 ? 5 : 6; out.push(`<h${lvl} class="md-h">${mdInline(h[2].trim())}</h${lvl}>`); i++; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push('<hr class="md-hr">'); i++; continue; }
    if (/^\s*>\s?/.test(line)) { const buf = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(mdInline(lines[i].replace(/^\s*>\s?/, ''))); i++; } out.push(`<blockquote class="md-q">${buf.join('<br>')}</blockquote>`); continue; }
    if (/^\s*[-*+•]\s+/.test(line)) { const buf = []; while (i < lines.length && /^\s*[-*+•]\s+/.test(lines[i])) { buf.push(`<li>${mdInline(lines[i].replace(/^\s*[-*+•]\s+/, ''))}</li>`); i++; } out.push(`<ul class="md-ul">${buf.join('')}</ul>`); continue; }
    if (/^\s*\d+[.)]\s+/.test(line)) { const buf = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { buf.push(`<li>${mdInline(lines[i].replace(/^\s*\d+[.)]\s+/, ''))}</li>`); i++; } out.push(`<ol class="md-ol">${buf.join('')}</ol>`); continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlock(lines[i], lines[i + 1])) { buf.push(mdInline(lines[i])); i++; }
    out.push(`<p class="md-p">${buf.join('<br>')}</p>`);
  }
  return out.join('');
}

function render() {
  // notes list
  renumber();
  const list = $('#notesList'); const scrollTop = list.scrollTop;
  // preserve the inline composer's in-progress text + focus across re-renders (e.g. while the AI replies)
  const prevTa = list.querySelector('.card.sel .tc-input');
  const draft = prevTa ? { v: prevTa.value, focused: document.activeElement === prevTa, caret: prevTa.selectionStart } : null;
  list.innerHTML = '';
  let anns = state.annotations.filter(passesFilter);
  anns.sort((x, y) => state.ui.sort === 'page' ? (x.page - y.page || x.anchor - y.anchor) : (new Date(x.created_at) - new Date(y.created_at)));
  if (!anns.length) {
    const emptyMsg = state.ui.query
      ? `No notes match “${esc(state.ui.query)}”.`
      : (state.ui.filter !== 'all' ? 'No notes match this filter.' : 'No notes yet.<br>Select text or capture a figure in the document to create a source-linked note.');
    list.appendChild(el(`<div class="empty">${emptyMsg}</div>`));
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
  // wire dynamic controls
  $$('[data-rmtag]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); const a = state.annotations.find(x => x.id === b.dataset.ann); a.auto_tags = (a.auto_tags || []).filter(t => t !== b.dataset.rmtag); a.manual_tags = (a.manual_tags || []).filter(t => t !== b.dataset.rmtag); save(); render(); });
  $$('[data-addtag]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); addTagFlow(b.dataset.addtag); });
  $$('[data-menu]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); annMenu(b.dataset.ann, b.dataset.menu, b); });
  // edit / delete / quote controls
  $$('[data-edit]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); state.ui.editing = b.dataset.edit; render(); const ta = list.querySelector('.edit-input'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } });
  $$('[data-canceledit]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); state.ui.editing = null; render(); });
  $$('details[data-disc]', list).forEach(d => d.addEventListener('toggle', () => { state.ui.openDisc = state.ui.openDisc || {}; if (d.open) state.ui.openDisc[d.dataset.disc] = true; else delete state.ui.openDisc[d.dataset.disc]; save(); }));
  $$('[data-savemsg]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); saveMsgEdit(b.dataset.ann, b.dataset.savemsg); });
  $$('[data-reask]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); saveAndReask(b.dataset.ann, b.dataset.reask); });
  $$('[data-collapse]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); collapseNote(b.dataset.collapse); });
  $$('[data-copynote]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); copyNote(b.dataset.copynote); });
  $$('[data-copymsg]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); copyMsg(b.dataset.ann, b.dataset.copymsg); });
  $$('[data-delnote]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); deleteNote(b.dataset.delnote); });
  $$('[data-delmsg]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); deleteMsg(b.dataset.ann, b.dataset.delmsg); });
  $$('[data-quotemore]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); const q = b.parentElement.querySelector('.linked-quote'); const on = q.classList.toggle('clip'); b.textContent = on ? 'Show more' : 'Show less'; });
  $$('.edit-input', list).forEach(ta => ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveMsgEdit(ta.dataset.ann, ta.dataset.editing); } if (e.key === 'Escape') { state.ui.editing = null; render(); } }));
  // inline thread composer (reply / follow-up), lives inside the active card
  const box = list.querySelector('.card.sel .thread-compose');
  if (box) {
    const ta = box.querySelector('.tc-input'), send = box.querySelector('.tc-send');
    const submit = () => { const t = ta.value.trim(); if (!t) return; ta.value = ''; ta.style.height = 'auto'; submitToNote(state.ui.activeId, t); };
    send.onclick = (e) => { e.stopPropagation(); submit(); };
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    ta.addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px'; });
    ta.addEventListener('click', e => e.stopPropagation());
    attachMentions(ta);
  }
  if (state.ui.autoscroll && state.ui.activeId) { list.scrollTop = scrollTop; scrollNoteIntoView(state.ui.activeId, false); }
  else list.scrollTop = scrollTop;
  // restore inline composer draft + focus
  if (draft && box) { const ta = box.querySelector('.tc-input'); ta.value = draft.v; ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; ta.dispatchEvent(new Event('input')); if (draft.focused) { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } ta.setSelectionRange(draft.caret, draft.caret); } }
  requestAnimationFrame(drawConnector);
}
function saveMsgEdit(annId, msgId) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  const m = a.messages.find(x => x.id === msgId); if (!m) return;
  const ta = document.querySelector(`.edit-input[data-editing="${msgId}"]`); if (ta) m.text = ta.value.trim();
  m.edited = true; a.updated_at = nowISO(); state.ui.editing = null; save(); render();
}
// Edit the user's question AND re-run the AI: drop the stale answer(s) right after it, then re-ask.
function saveAndReask(annId, msgId) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  const m = a.messages.find(x => x.id === msgId); if (!m) return;
  const ta = document.querySelector(`.edit-input[data-editing="${msgId}"]`);
  const newText = ta ? ta.value.trim() : (m.text || ''); if (!newText) return;
  m.text = newText; m.edited = true;
  const idx = a.messages.findIndex(x => x.id === msgId);
  while (idx + 1 < a.messages.length && a.messages[idx + 1].actor === 'ai') a.messages.splice(idx + 1, 1);
  state.ui.editing = null; a.updated_at = nowISO(); save(); render();
  const prov = /@claude/i.test(newText) ? 'anthropic' : /@gpt/i.test(newText) ? 'openai' : /@gemini/i.test(newText) ? 'gemini' : undefined;
  askAI(annId, newText.replace(/@(ai|gpt|claude|gemini)/ig, '').trim() || newText, prov);
}
function deleteMsg(annId, msgId) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  a.messages = a.messages.filter(m => m.id !== msgId); a.updated_at = nowISO(); save(); render();
}
function deleteNote(annId) {
  if (!confirm('Delete this note and its thread?')) return;
  state.annotations = state.annotations.filter(x => x.id !== annId);
  if (state.ui.activeId === annId) state.ui.activeId = null;
  save(); render(); drawHighlights(); drawPins();
}
function collapseNote(annId) {
  state.ui.collapsed = state.ui.collapsed || {};
  state.ui.collapsed[annId] = true; save(); render();
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
/* ---------- portable JSON notes storage ----------
   A human-readable "<doc>.notes.json" holding all annotations for a document. It auto-saves
   into a folder you pick (File System Access API — Chrome/Edge), so notes live next to your
   PDFs and sync anywhere the folder does (e.g. a Google Drive folder). Export/Import works in
   every browser as a fallback. Nothing leaves the browser except the folder you choose. */
function fsSupported() { return typeof window !== 'undefined' && 'showDirectoryPicker' in window; }
function storageCfg() { state.settings.storage = state.settings.storage || { mode: 'browser', folderName: '' }; return state.settings.storage; }
function notesFileName(docId) {
  const d = state.docs.find(x => x.id === docId) || activeDoc();
  const base = ((d && d.name) || 'document').replace(/\.pdf$/i, '').replace(/[^\w.\- ]+/g, '_').trim() || 'document';
  return base + '.notes.json';
}
function docNotesJSON(docId) {
  const anns = state.annotations.filter(a => docIdOf(a) === docId).map(a => JSON.parse(JSON.stringify(a)));
  const d = state.docs.find(x => x.id === docId) || activeDoc();
  return { app: 'Source-Linked AI Reading Workspace', schema: 1, exportedAt: nowISO(),
    document: { id: docId, name: d ? d.name : 'document' }, noteCount: anns.length, annotations: anns };
}
function applyNotesJSON(obj, docId) {
  if (!obj || !Array.isArray(obj.annotations)) { toast('That file has no notes to import.', 'err'); return 0; }
  const others = state.annotations.filter(a => docIdOf(a) !== docId);
  const incoming = obj.annotations.map(a => { const c = JSON.parse(JSON.stringify(a)); c.doc = docId; return c; });
  state.annotations = others.concat(incoming);
  state.ui.activeId = null; if (typeof renumber === 'function') renumber();
  save(); render(); drawHighlights(); drawPins();
  return incoming.length;
}
async function chooseNotesFolder() {
  if (!fsSupported()) { toast('Folder sync needs Chrome or Edge. Use Export / Import notes instead.', 'err'); return false; }
  try {
    const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'srw-notes' });
    idbPut('dir:notes', h);
    state.settings.storage = { mode: 'folder', folderName: h.name }; save();
    await writeNotesToFolder(state.ui.activeDoc, false);
    toast('Notes will auto-save to “' + h.name + '”.');
    return true;
  } catch (e) { if (e && e.name !== 'AbortError') toast('Could not open that folder: ' + (e.message || e), 'err'); return false; }
}
async function notesDirHandle(interactive) {
  const h = await idbGet('dir:notes'); if (!h) return null;
  try {
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p === 'granted') return h;
    if (interactive) { p = await h.requestPermission({ mode: 'readwrite' }); if (p === 'granted') return h; }
  } catch (e) {}
  return null;
}
async function writeNotesToFolder(docId, interactive) {
  const dir = await notesDirHandle(interactive); if (!dir) return false;
  try {
    const fh = await dir.getFileHandle(notesFileName(docId), { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(docNotesJSON(docId), null, 2)); await w.close();
    return true;
  } catch (e) { if (interactive) toast('Save failed: ' + (e.message || e), 'err'); return false; }
}
async function loadNotesFromFolder(docId, interactive) {
  const dir = await notesDirHandle(interactive); if (!dir) { if (interactive) toast('Pick a notes folder first (Settings → Notes storage).', 'err'); return false; }
  try {
    const fh = await dir.getFileHandle(notesFileName(docId), { create: false });
    const n = applyNotesJSON(JSON.parse(await (await fh.getFile()).text()), docId);
    toast(n + ' note' + (n === 1 ? '' : 's') + ' loaded from “' + dir.name + '”.');
    return true;
  } catch (e) { if (interactive) toast('No saved notes for this document in that folder yet.', 'err'); return false; }
}
let _folderSyncT;
function scheduleFolderSync() {
  if (storageCfg().mode !== 'folder') return;
  clearTimeout(_folderSyncT);
  _folderSyncT = setTimeout(() => { writeNotesToFolder(state.ui.activeDoc, false); }, 1500);
}
function downloadNotesJSON(docId) {
  try {
    const blob = new Blob([JSON.stringify(docNotesJSON(docId), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = notesFileName(docId); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Downloaded ' + notesFileName(docId));
  } catch (e) { toast('Could not export: ' + (e.message || e), 'err'); }
}
function importNotesJSON() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; try { const n = applyNotesJSON(JSON.parse(await f.text()), state.ui.activeDoc); toast(n + ' note' + (n === 1 ? '' : 's') + ' imported.'); } catch (e) { toast('Could not read that JSON: ' + (e.message || e), 'err'); } };
  inp.click();
}
function flashSaved() { const b = document.getElementById('btnSaveNotes'); if (b) { b.classList.add('saved'); setTimeout(() => b.classList.remove('saved'), 1400); } }
// Save button: write to the chosen folder; if none is set, offer to pick one (Chromium) or download.
async function saveNotesNow() {
  const cfg = storageCfg();
  if (cfg.mode === 'folder') {
    if (await writeNotesToFolder(state.ui.activeDoc, true)) { toast('Saved to “' + cfg.folderName + '”.'); flashSaved(); return; }
  }
  if (fsSupported()) { if (await chooseNotesFolder()) { flashSaved(); return; } }
  downloadNotesJSON(state.ui.activeDoc);
}
function injectSaveButton() {
  const fb = document.getElementById('btnFilter'); if (!fb || document.getElementById('btnSaveNotes')) return;
  const b = el('<button class="icon-btn save-btn" id="btnSaveNotes" title="Save notes (auto-saves to your folder when set)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7"/><path d="M8 13h8v6H8z"/></svg></button>');
  fb.parentNode.insertBefore(b, fb);
  b.onclick = () => saveNotesNow();
}
function openNotesMenu(anchor) {
  const folder = storageCfg().mode === 'folder';
  openPopover(anchor, [
    { label: folder ? 'Save notes to folder now' : 'Save notes…', onClick: () => saveNotesNow() },
    (folder ? { label: 'Load notes from folder', onClick: () => loadNotesFromFolder(state.ui.activeDoc, true) } : { label: 'Choose notes folder…', onClick: () => chooseNotesFolder() }),
    { label: 'Export notes (JSON)', onClick: () => downloadNotesJSON(state.ui.activeDoc) },
    { label: 'Import notes (JSON)', onClick: () => importNotesJSON() },
    { sep: true },
    { label: 'Export annotations (PDF)…', onClick: () => openExport() },
    { sep: true },
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
      <div class="field"><label>Notes storage</label>
        <div class="hint" style="margin-top:0">Notes are always kept in this browser. Optionally choose a folder to also auto-save a portable <b>.notes.json</b> next to your PDFs (Chrome/Edge) — ideal for backups, other computers, and Google Drive folders. Export / Import works in any browser.</div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
          <button type="button" class="btn ghost" id="stFolder">${(s.storage && s.storage.mode === 'folder') ? ('📁 ' + esc(s.storage.folderName || 'folder set')) : 'Choose folder…'}</button>
          <button type="button" class="btn ghost" id="stExport">Export notes (JSON)</button>
          <button type="button" class="btn ghost" id="stImport">Import notes (JSON)</button>
          ${(s.storage && s.storage.mode === 'folder') ? '<button type="button" class="btn ghost" id="stBrowserOnly">Stop folder sync</button>' : ''}
        </div>
      </div>
    <div class="foot"><button class="btn ghost" id="mCancel">Close</button><button class="btn primary" id="mSave">Save</button></div>
  </div></div>`);
  $('#modalRoot').appendChild(m);
  const close = () => m.remove();
  $('#mClose', m).onclick = close; $('#mCancel', m).onclick = close;
  m.addEventListener('click', e => { if (e.target === m) close(); });
  $$('.def-radio', m).forEach(b => b.onclick = () => { $$('.def-radio', m).forEach(x => x.classList.remove('on')); b.classList.add('on'); });
  ['tgVis', 'tgWeb', 'tgPy'].forEach(id => $('#' + id, m).onclick = () => $('#' + id, m).classList.toggle('on'));
  { const stF = $('#stFolder', m); if (stF) stF.onclick = async () => { if (await chooseNotesFolder()) close(); }; }
  { const stE = $('#stExport', m); if (stE) stE.onclick = () => downloadNotesJSON(state.ui.activeDoc); }
  { const stI = $('#stImport', m); if (stI) stI.onclick = () => importNotesJSON(); }
  { const stB = $('#stBrowserOnly', m); if (stB) stB.onclick = () => { state.settings.storage = { mode: 'browser', folderName: '' }; save(); close(); toast('Folder sync off — notes stay in this browser.'); }; }
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
    if (!hasShot && inc.linked && a.selected_text) left.push(`<div class="ex-sub">${a.hlColor === 'yellow' ? 'Highlight' : 'Linked text'}</div><div class="ex-quote ${a.hlColor === 'yellow' ? 'yellow' : ''}">${esc(a.selected_text)}</div>`);
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
/* ---------- in-document find bar (replaces the native prompt) ---------- */
let findS = { q: '', matches: [], idx: -1 };
function findBarEl() {
  let b = document.getElementById('findBar');
  if (b) return b;
  const r = document.getElementById('reader'); if (!r) return null;
  b = el(`<div id="findBar" class="find-bar hidden">
    <svg class="find-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
    <input id="findInput" placeholder="Find in document…" autocomplete="off" spellcheck="false">
    <span class="find-count" id="findCount"></span>
    <span class="find-sep"></span>
    <button class="find-nav" id="findPrev" title="Previous (Shift+Enter)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
    <button class="find-nav" id="findNext" title="Next (Enter)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>
    <button class="find-nav" id="findClose" title="Close (Esc)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </div>`);
  r.appendChild(b);
  const input = b.querySelector('#findInput');
  let deb;
  input.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => findRun(input.value), 160); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? findGo(-1) : findGo(1); }
    else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
  });
  b.querySelector('#findPrev').onclick = () => findGo(-1);
  b.querySelector('#findNext').onclick = () => findGo(1);
  b.querySelector('#findClose').onclick = () => closeFind();
  return b;
}
function openFind() {
  const b = findBarEl(); if (!b) return;
  b.classList.remove('hidden');
  const btn = document.getElementById('btnSearch'); if (btn) btn.classList.add('active');
  const input = b.querySelector('#findInput'); input.focus(); input.select();
  if (input.value.trim()) findRun(input.value);
}
function closeFind() {
  clearFindMarks();
  findS = { q: '', matches: [], idx: -1 };
  const b = document.getElementById('findBar');
  if (b) { b.classList.add('hidden'); const c = b.querySelector('#findCount'); if (c) c.textContent = ''; }
  const btn = document.getElementById('btnSearch'); if (btn) btn.classList.remove('active');
}
function clearFindMarks() {
  document.querySelectorAll('.textLayer span._shl').forEach(s => { s.textContent = s.textContent; s.classList.remove('_shl'); });
}
function findCurrentPage() { return state.ui.continuous ? currentContinuousPage() : state.ui.page; }
function findPageEl(p) { return state.ui.continuous ? document.querySelector(`#contPages .pg[data-page="${p}"]`) : document.getElementById('pageWrap'); }
async function findRun(raw) {
  const q = (raw || '').trim();
  const countEl = document.getElementById('findCount');
  clearFindMarks();
  findS.q = q; findS.matches = []; findS.idx = -1;
  if (!q) { if (countEl) countEl.textContent = ''; return; }
  if (!pdfDoc || !numPages) { if (countEl) countEl.textContent = 'No results'; return; }
  if (countEl) countEl.textContent = 'Searching…';
  const ql = q.toLowerCase(); const m = [];
  for (let i = 1; i <= numPages; i++) {
    const { text } = await ensurePageText(i);
    const lc = (text || '').toLowerCase(); let from = 0, k, occ = 0;
    while ((k = lc.indexOf(ql, from)) >= 0) { m.push({ page: i, occ }); occ++; from = k + ql.length; }
  }
  if (findS.q !== q) return; // a newer query superseded this run
  findS.matches = m;
  if (!m.length) { if (countEl) countEl.textContent = 'No results'; return; }
  const cur = findCurrentPage();
  let start = m.findIndex(x => x.page >= cur); if (start < 0) start = 0;
  await findGoto(start);
}
async function findGoto(idx) {
  const m = findS.matches; if (!m.length) return;
  idx = (idx + m.length) % m.length; findS.idx = idx;
  const { page, occ } = m[idx];
  clearFindMarks();
  if (state.ui.continuous) await gotoPage(page);
  else if (page !== state.ui.page) await renderPage(page);
  await new Promise(r => setTimeout(r, 50));
  const pel = findPageEl(page);
  if (pel) findMarkPage(pel, findS.q, occ);
  const countEl = document.getElementById('findCount'); if (countEl) countEl.textContent = (idx + 1) + ' / ' + m.length;
  const cur = pel && pel.querySelector('mark.sh.cur');
  if (cur) cur.scrollIntoView({ block: 'center', inline: 'nearest' });
}
function findGo(delta) { if (findS.matches.length) findGoto(findS.idx + delta); }
function findMarkPage(pel, q, curOcc) {
  const ql = q.toLowerCase(); let occ = 0;
  pel.querySelectorAll('.textLayer span').forEach(s => {
    const txt = s.textContent; const lc = txt.toLowerCase();
    if (!lc.includes(ql)) return;
    let html = '', from = 0, k;
    while ((k = lc.indexOf(ql, from)) >= 0) {
      html += esc(txt.slice(from, k));
      html += `<mark class="sh${occ === curOcc ? ' cur' : ''}">` + esc(txt.slice(k, k + ql.length)) + `</mark>`;
      from = k + ql.length; occ++;
    }
    html += esc(txt.slice(from));
    s.innerHTML = html; s.classList.add('_shl');
  });
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
  $$('.nav-item[data-view]').forEach(n => n.onclick = () => { state.ui.libView = n.dataset.view; save(); renderTree(); });
  // reader top
  $('#pagePrev').onclick = () => gotoPage(state.ui.page - 1);
  $('#pageNext').onclick = () => gotoPage(state.ui.page + 1);
  const commitPage = raw => { const v = parseInt(String(raw).replace(/[^\d]/g, ''), 10); if (!v || v < 1) { $('#pageInput').value = state.ui.page; return; } gotoPage(v); };
  $('#pageInput').onfocus = e => { try { e.target.select(); } catch (x) {} };
  $('#pageInput').onchange = e => commitPage(e.target.value);
  $('#pageInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); commitPage(e.target.value); e.target.blur(); } };
  $('#btnContinuous').onclick = () => setContinuous(!state.ui.continuous);
  $('#btnContinuous').classList.toggle('active', !!state.ui.continuous);
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
  $('#btnSearch').onclick = () => { const b = document.getElementById('findBar'); (b && !b.classList.contains('hidden')) ? closeFind() : openFind(); };
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F') && numPages > 0) { e.preventDefault(); openFind(); } });
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
  injectSaveButton();
  $('#btnNotesSearch').onclick = () => {
    const b = $('#ntSearchbar'); b.classList.toggle('hidden');
    if (!b.classList.contains('hidden')) $('#notesSearchInput').focus();
    else { state.ui.query = ''; $('#notesSearchInput').value = ''; render(); }
  };
  $('#notesSearchInput').addEventListener('input', e => { state.ui.query = e.target.value.trim(); render(); });
  // Bottom composer = ask a NEW question about the whole document (no highlight needed).
  // Replies/follow-ups to a specific note happen inline inside its card (wired in render).
  const gc = $('#composer'); if (gc) gc.classList.remove('hidden');
  const ci = $('#composerInput');
  if (ci) {
    ci.placeholder = 'Ask about this document…';
    const hl = $('#composerHL');
    const sendDoc = () => { const t = ci.value.trim(); if (!t) return; ci.value = ''; ci.style.height = 'auto'; if (hl) hl.innerHTML = '\n'; askAboutDocument(t); };
    $('#composerSend').onclick = sendDoc;
    ci.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDoc(); } });
    ci.addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px'; });
    attachMentions(ci);
  }
  $('#sortSel').onclick = () => { state.ui.sort = state.ui.sort === 'time' ? 'page' : 'time'; $('#sortSel').textContent = state.ui.sort === 'time' ? 'Sorted by time ▾' : 'Sorted by page ▾'; save(); render(); };
  $('#rdScroll').addEventListener('scroll', () => { if (state.ui.continuous) { const p = currentContinuousPage(); if (p !== state.ui.page) { state.ui.page = p; $('#pageInput').value = p; } } requestAnimationFrame(drawConnector); });
  $('#notesList').addEventListener('scroll', () => requestAnimationFrame(drawConnector));   // keep the connector pinned to the card as the notes panel scrolls
  window.addEventListener('resize', () => requestAnimationFrame(drawConnector));
  initCaptureMask();
}
function updateZoom() { $('#zoomVal').textContent = Math.round(state.ui.zoom * 100) + '%'; save(); if (state.ui.continuous) buildContinuous(); else renderPage(state.ui.page); }
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
  renderTree(); updateStorage();
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
  if (pdfOk && !state.ui.continuous) { await renderPage(state.ui.page); }
  render(); drawHighlights(); drawPins();
  // Pre-cache all page text in the background so AI context retrieval + document search
  // can draw on the whole document (not just visited pages).
  if (pdfOk) setTimeout(() => { for (let n = 1; n <= numPages; n++) ensurePageText(n).catch(() => {}); }, 1200);
}
document.addEventListener('DOMContentLoaded', boot);
})();
