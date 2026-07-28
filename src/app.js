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
// Only ever put a raster image URL we generate/import into an <img src>. A data: raster (never svg —
// svg can script) or a clean https: URL; anything else renders as no image. Belt-and-suspenders with
// import sanitization: even a value that slipped into state can't break out of the src attribute.
const RASTER_DATA = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/\s]+=*$/i;
function safeImgSrc(u) {
  if (typeof u !== 'string') return '';
  const s = u.trim();
  if (RASTER_DATA.test(s)) return s.replace(/\s+/g, '');
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return '';
}
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
const SAMPLE_DOC_NAME = 'BERT — Devlin et al. 2019 (NAACL).pdf';   // bundled sample, CC BY 4.0 — see NOTICE
const SEED_VERSION = 3;   // bumped when the bundled sample changes, so existing installs re-seed its notes
/* Self-contained share file: a single .html carrying one document + its notes. When present,
   the app boots into a read-only viewer of that embedded paper (see boot()/initBundleState). */
const PAIR_BUNDLE = (typeof window !== 'undefined' && window.__PAIR_BUNDLE__) || null;
const READONLY = !!(PAIR_BUNDLE && PAIR_BUNDLE.readOnly);
const ACTORS = {
  you:   { name: 'You',            initials: 'YO', color: '#547089', type: 'human' },
  sara:  { name: 'Sara Davis',     initials: 'SD', color: '#488048', type: 'human' },
  bonnie:{ name: 'Bonnie Kearney', initials: 'BK', color: '#7B6A8D', type: 'human' },
};
const PROVIDER_LABEL = { openrouter: 'OpenRouter', compat: 'OpenAI-compatible' };
const DEFAULT_MODELS = {
  openrouter: 'openai/gpt-5.4', openrouterImage: 'google/gemini-3.1-flash-lite-image', openrouterRouter: 'openai/gpt-5.4-mini',
  compat: 'gpt-5.4', compatImage: 'gpt-image-1', compatRouter: 'gpt-5.4-mini',
};
function defaultState() {
  return {
    settings: {
      provider: 'openrouter',
      models: { ...DEFAULT_MODELS },
      keys: { openrouter: '', compat: '' },
      compatBaseUrl: 'https://api.openai.com/v1',
      enableVisuals: true, enableWeb: true,
      actorName: 'You', actorInitials: 'YO',
      storage: { mode: 'browser', folderName: '' },
      prompts: {},
    },
    annotations: [],
    docs: [{ id: 'sample', name: SAMPLE_DOC_NAME, kind: 'sample', addedAt: nowISO() }],
    ui: { page: 1, zoom: 1.15, tool: 'cursor', filter: 'all', autoscroll: true, sort: 'time',
          collapseLeft: false, collapseRight: false, activeId: null, activeDoc: 'sample', libView: 'home', continuous: true, _contDefaulted: true },
    seeded: false,
  };
}
let state = migrateState(loadState()) || defaultState();
function loadState() { try { return JSON.parse(localStorage.getItem(LS)); } catch { return null; } }
// Bring older saved state up to the multi-document model.
function migrateState(s) {
  if (!s) return null;
  if (!s.ui) s.ui = {};
  if (!Array.isArray(s.docs)) s.docs = [];
  // The bundled sample is auto-added on every load UNTIL the user removes it (state.sampleDismissed),
  // so removing it actually sticks across reloads.
  if (!s.sampleDismissed && !s.docs.some(d => d.id === 'sample')) s.docs.unshift({ id: 'sample', name: SAMPLE_DOC_NAME, kind: 'sample', addedAt: nowISO() });
  if (!s.ui.activeDoc || !s.docs.some(d => d.id === s.ui.activeDoc && !d.trashed)) s.ui.activeDoc = (s.docs.find(d => !d.trashed) || {}).id || null;
  if (!s.ui.libView) s.ui.libView = 'home';
  if (s.ui.tool === 'text') s.ui.tool = 'cursor';
  if (!s.ui._contDefaulted) { s.ui.continuous = true; s.ui._contDefaulted = true; }
  // one-time: turn all tools on by default (respects later manual changes via the flag)
  if (s.settings && !s.settings._toolsDefaulted) { s.settings.enableVisuals = true; s.settings.enableWeb = true; s.settings._toolsDefaulted = true; }
  // (per-provider model upgrade removed — providers are now openrouter + compat)
  // Legacy notes carried the file name as their doc label — map them onto the sample doc id.
  if (s.settings && !s.settings.storage) s.settings.storage = { mode: 'browser', folderName: '' };
  if (s.settings && !s.settings.prompts) s.settings.prompts = {};
  if (s.settings) {
    s.settings.keys = s.settings.keys || {}; if (!('openrouter' in s.settings.keys)) s.settings.keys.openrouter = '';
    s.settings.models = s.settings.models || {};
    if (!s.settings.models.openrouter) s.settings.models.openrouter = DEFAULT_MODELS.openrouter;
    if (s.settings.models.openrouter === 'google/gemma-4-31b-it:free') s.settings.models.openrouter = DEFAULT_MODELS.openrouter;
    if (s.settings.models.openrouter === 'openai/gpt-5.4-mini') s.settings.models.openrouter = DEFAULT_MODELS.openrouter;   // 5.4-mini erred too often — bump the old default up to 5.4
    if (!s.settings.models.openrouterImage) s.settings.models.openrouterImage = DEFAULT_MODELS.openrouterImage;
    if (s.settings.models.openrouterImage === 'x-ai/grok-imagine-image-quality') s.settings.models.openrouterImage = DEFAULT_MODELS.openrouterImage;
    if (!('compat' in s.settings.keys)) s.settings.keys.compat = '';
    if (!s.settings.models.compat) s.settings.models.compat = DEFAULT_MODELS.compat;
    if (s.settings.models.compat === 'gpt-5.4-mini') s.settings.models.compat = DEFAULT_MODELS.compat;   // bump the old default up to 5.4
    if (!s.settings.models.openrouterRouter) s.settings.models.openrouterRouter = DEFAULT_MODELS.openrouterRouter;   // fast/cheap model for the intent router
    if (!s.settings.models.compatRouter) s.settings.models.compatRouter = DEFAULT_MODELS.compatRouter;
    if (!s.settings.models.compatImage) s.settings.models.compatImage = DEFAULT_MODELS.compatImage;
    if (!s.settings.compatBaseUrl) s.settings.compatBaseUrl = 'https://api.openai.com/v1';
    if (!s.settings._orDefaulted) { s.settings.provider = 'openrouter'; s.settings._orDefaulted = true; }
    if (s.settings.provider !== 'openrouter' && s.settings.provider !== 'compat') s.settings.provider = 'openrouter';
    const P = s.settings.prompts || (s.settings.prompts = {});
    if (!P.text && (P.answer_direct || P.answer_agent)) P.text = P.answer_direct || P.answer_agent;
    if (!P.image && P.visual_planner) P.image = P.visual_planner;
    ['answer_direct', 'answer_agent', 'visual_planner', 'diagram'].forEach(k => delete P[k]);
  }
  { const sd = (s.docs || []).find(d => d.id === 'sample'); if (sd && (sd.name === 'Turbulence_review.pdf' || sd.name === 'NIPS-2017-attention-is-all-you-need-Paper.pdf')) sd.name = SAMPLE_DOC_NAME; }
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
  if (READONLY) return;   // a shared read-only file never mutates storage
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
function bytesToB64(bytes) { let bin = ''; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(bin); }
// Content identity of a PDF: the SHA-256 of its bytes. Stable across filename, folder, machine,
// and Drive copy — so notes re-attach by content, and the same paper never duplicates.
async function sha256Hex(bytes) {
  try {
    const view = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    const h = await crypto.subtle.digest('SHA-256', view);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { return null; }   // crypto.subtle needs a secure context; degrade gracefully
}

/* ---------- documents (real multi-doc library) ----------
   Sample PDF ships inline; user-opened PDFs persist as bytes in IndexedDB (key `pdf:<id>`)
   with a runtime cache so switching is instant. Notes are scoped per document id. */
const _docBytes = {};                         // id -> Uint8Array (runtime cache)
function docIdOf(a) { const d = a && a.doc; return (!d || d === 'Turbulence_review.pdf') ? 'sample' : d; }
function inActiveDoc(a) { return docIdOf(a) === state.ui.activeDoc; }
function activeDoc() { return state.docs.find(d => d.id === state.ui.activeDoc) || state.docs[0]; }
async function loadDocBytes(id) {
  const doc = state.docs.find(d => d.id === id); if (!doc) return null;
  if (doc.kind === 'bundle') return PAIR_BUNDLE ? b64ToBytes(PAIR_BUNDLE.pdfB64) : null;
  if (doc.kind === 'sample') return b64ToBytes(window.SAMPLE_PDF_B64);
  if (!_docBytes[id]) { const v = await idbGet('pdf:' + id); if (v) _docBytes[id] = (v instanceof Uint8Array) ? v : new Uint8Array(v); }
  return _docBytes[id] ? _docBytes[id].slice() : null;   // hand PDF.js a copy so the cache can't be detached
}
async function switchDoc(id) {
  if (id === state.ui.activeDoc) { renderTree(); return; }
  document.getElementById('notesBanner')?.remove();   // clear a stale "open notes?" banner on switch
  document.getElementById('ocrBanner')?.remove(); if (ocrRunning) ocrCancel = true;   // stop OCR for the doc we're leaving
  const doc = state.docs.find(d => d.id === id); if (!doc) { toast('Document not found.', 'err'); return; }
  state.ui.activeDoc = id; state.ui.activeId = null; state.ui.page = 1;
  doc.lastOpened = nowISO();
  Object.keys(pageTextCache).forEach(k => delete pageTextCache[k]);
  save(); renderTree(); render();
  const bytes = await loadDocBytes(id);
  if (!bytes) { showReaderFallback('Could not load “' + doc.name + '”. Re-open it with New.'); return; }
  await loadOcrStore(doc.sha);   // load any saved OCR for this PDF before the first render uses its text layer
  try { await initPdf(bytes); } catch (e) { showReaderFallback('Could not open “' + doc.name + '” — it may not be a valid PDF.'); return; }
  render(); drawHighlights(); drawPins();
  setTimeout(() => { for (let n = 1; n <= numPages; n++) ensurePageText(n).catch(() => {}); detectAndOfferOcr(doc); }, 500);
}
async function openPdfFile(f) {
  if (!f) return null;
  // Grab folder access now, while the file-open click still counts as a user gesture, so we can
  // auto-offer matching notes even on a fresh session (re-granting needs a gesture).
  let noteDir = null;
  if (storageCfg().mode === 'folder') { try { noteDir = await notesDirHandle(true); } catch (e) {} }
  const buf = new Uint8Array(await f.arrayBuffer());
  const name = f.name || 'Document.pdf';
  const sha = await sha256Hex(buf);
  // Content addressing: if this exact PDF (by bytes) is already in the library — regardless of its
  // filename or which folder/machine it came from — reopen that entry instead of duplicating, so
  // its notes come with it automatically.
  const dup = sha && state.docs.find(d => d.sha === sha && !d.trashed);
  if (dup) {
    if (!_docBytes[dup.id]) { _docBytes[dup.id] = buf; idbPut('pdf:' + dup.id, buf); }  // refresh bytes if they were evicted
    state.ui.libView = 'home'; save();
    await switchDoc(dup.id);
    updateStorage();
    toast('Reopened ' + dup.name + ' — same paper, your notes are here.');
    maybeOfferFolderNotes(dup.id, noteDir);
    return dup.id;
  }
  const id = uid('doc');
  _docBytes[id] = buf; idbPut('pdf:' + id, buf);
  state.docs.push({ id, name, sha, kind: 'user', addedAt: nowISO(), lastOpened: nowISO() });
  state.ui.libView = 'home'; save();
  await switchDoc(id);
  updateStorage();
  toast('Opened ' + name + ' — highlight text or capture a figure to start.');
  maybeOfferFolderNotes(id, noteDir);
  return id;
}
// Open a mix of files in one gesture — PDFs plus their ".notes.json" sidecars. Each PDF opens (or
// re-attaches by content); each notes file is merged into the document it belongs to, matched by
// SHA-256 first, then "opened alongside", then filename. This is what makes a paper and its notes
// travel together across a plain file picker or a drag-and-drop.
async function openFiles(files) {
  files = [...(files || [])].filter(Boolean);
  if (!files.length) return;
  const isJson = f => /\.json$/i.test(f.name) || f.type === 'application/json';
  const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  const isHtml = f => /\.html?$/i.test(f.name) || f.type === 'text/html';
  const htmls = files.filter(isHtml);
  const pdfs = files.filter(isPdf);
  const notes = files.filter(f => isJson(f) && !isPdf(f) && !isHtml(f));
  // A shared "<paper>.annotated.html" carries the PDF + notes: open each as an editable library doc.
  for (const hf of htmls) { try { await importSharedHTML(hf); } catch (e) { toast('Could not open ' + hf.name + ': ' + (e && e.message || e), 'err'); } }
  const openedIds = [];
  for (const f of pdfs) { try { const id = await openPdfFile(f); if (id) openedIds.push(id); } catch (e) { toast('Could not open ' + f.name + ': ' + (e && e.message || e), 'err'); } }
  for (const nf of notes) {
    let obj; try { obj = JSON.parse(await nf.text()); } catch (e) { toast('Could not read ' + nf.name + ' — not valid JSON.', 'err'); continue; }
    await attachNotesFile(obj, nf.name, openedIds);
  }
  // Opened a single PDF with no notes alongside it, and no notes folder is set to auto-search:
  // offer to pick its .notes.json by hand (folder mode is handled in openPdfFile → maybeOfferFolderNotes).
  if (storageCfg().mode !== 'folder' && openedIds.length === 1 && !notes.length) maybeOfferNotesFallback(openedIds[0]);
}
// Import a shared single-file HTML (exported by exportSelfContainedHTML): pull the embedded PDF +
// notes back out and add them as a normal, editable library document, so the recipient can keep
// annotating. The exact inverse of the export — closes the share → edit → re-share loop.
async function importSharedHTML(f) {
  const html = await f.text();
  const marker = 'window.__PAIR_BUNDLE__=';
  const i = html.indexOf(marker);
  if (i < 0) { toast('“' + f.name + '” isn’t a PairedX shared paper.', 'err'); return; }
  let bundle;
  try {
    const start = i + marker.length;
    const end = html.indexOf(';</script>', start);   // JSON has every "<" escaped, so this is unambiguous
    if (end < 0) throw new Error('unterminated bundle');
    bundle = JSON.parse(html.slice(start, end).trim());
  } catch (e) { toast('Could not read the shared paper in “' + f.name + '”.', 'err'); return; }
  if (!bundle || !bundle.pdfB64) { toast('“' + f.name + '” has no embedded PDF.', 'err'); return; }
  const bytes = b64ToBytes(bundle.pdfB64);
  const sha = bundle.sha || await sha256Hex(bytes);
  const name = bundle.name || (f.name || 'Shared paper').replace(/\.annotated\.html?$/i, '').replace(/\.html?$/i, '') + '.pdf';
  // Content-address dedupe: same paper already in the library → reuse it and merge, else add it.
  let id, dup = sha && state.docs.find(d => d.sha === sha && !d.trashed);
  if (dup) { id = dup.id; if (!_docBytes[id]) { _docBytes[id] = bytes; idbPut('pdf:' + id, bytes); } }
  else {
    id = uid('doc'); _docBytes[id] = bytes; idbPut('pdf:' + id, bytes);
    state.docs.push({ id, name, sha, kind: 'user', addedAt: nowISO(), lastOpened: nowISO() });
  }
  state.ui.libView = 'home'; save();
  await switchDoc(id);
  let n = 0;
  if (bundle.notes && Array.isArray(bundle.notes.annotations)) n = applyNotesJSON(bundle.notes, id, { merge: true });
  updateStorage();
  toast('Opened ' + name + (n ? ' — ' + n + ' note' + (n === 1 ? '' : 's') + ' loaded. Keep annotating.' : '.'));
}
// Merge a parsed notes object into the library document it belongs to.
async function attachNotesFile(obj, fileName, preferIds) {
  if (!obj || !Array.isArray(obj.annotations)) { toast('“' + fileName + '” has no notes to import.', 'err'); return; }
  const sha = obj.document && obj.document.sha256;
  let doc = null;
  if (sha) doc = state.docs.find(d => d.sha && d.sha === sha && !d.trashed);           // bulletproof: by content
  if (!doc && preferIds && preferIds.length) doc = state.docs.find(d => preferIds.includes(d.id));  // dropped alongside its PDF
  if (!doc) {                                                                          // legacy fallback: by filename
    const want = (String(fileName || '').replace(/\.notes\.json$/i, '').replace(/\.json$/i, '').replace(/[^\w.\- ]+/g, '_').trim() || 'document').toLowerCase();
    doc = state.docs.find(d => !d.trashed && notesFileName(d.id).replace(/\.notes\.json$/i, '').toLowerCase() === want);
  }
  if (!doc) { toast('Notes “' + fileName + '” don’t match an open document — open its PDF too.', 'err'); return; }
  if (doc.id !== state.ui.activeDoc) await switchDoc(doc.id);
  const n = applyNotesJSON(obj, doc.id, { merge: true });
  if (n) toast(n + ' note' + (n === 1 ? '' : 's') + ' attached to “' + doc.name + '”.');
}
function toggleStar(id) { const d = state.docs.find(x => x.id === id); if (d) { d.starred = !d.starred; save(); renderTree(); } }
// After the active doc is trashed/removed, open the next still-in-library doc — or, if the whole
// library is now empty (the sample can be removed too), show a friendly empty reader.
function openFallbackDoc() {
  const next = state.docs.find(d => !d.trashed);
  if (next) { switchDoc(next.id); }
  else { state.ui.activeDoc = null; save(); renderTree(); render(); showEmptyReader(); }
}
function trashDoc(id) {   // soft delete -> Trash view (sample included)
  const d = state.docs.find(x => x.id === id); if (!d) return;
  d.trashed = true; d.trashedAt = nowISO();
  if (d.id === 'sample') state.sampleDismissed = true;   // don't auto-re-add it on reload
  if (state.ui.activeDoc === id) openFallbackDoc(); else { save(); renderTree(); }
  toast('Moved “' + d.name + '” to Trash.');
}
function restoreDoc(id) {
  const d = state.docs.find(x => x.id === id); if (!d) return;
  d.trashed = false; if (id === 'sample') state.sampleDismissed = false; save();
  if (!state.ui.activeDoc) switchDoc(id); else renderTree();   // open it if the library was empty
  toast('Restored “' + d.name + '”.');
}
async function purgeDoc(id) {   // permanent delete
  const d = state.docs.find(x => x.id === id); if (!d) return;
  const n = state.annotations.filter(a => docIdOf(a) === id).length;
  if (!(await confirmDialog('Permanently delete “' + d.name + '”' + (n ? ' and its ' + n + ' note' + (n === 1 ? '' : 's') : '') + '? This cannot be undone.', { okLabel: 'Delete', danger: true }))) return;
  if (d.id === 'sample') state.sampleDismissed = true;
  state.docs = state.docs.filter(x => x.id !== id);
  state.annotations = state.annotations.filter(a => docIdOf(a) !== id);
  idbDel('pdf:' + id); delete _docBytes[id];
  if (state.ui.activeDoc === id) openFallbackDoc(); else { save(); renderTree(); render(); }
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
    const msg = inTrash ? 'Trash is empty.' : view === 'starred' ? 'No starred documents yet.' : 'No documents yet — use “Open PDF or bundle” to add one.';
    list.appendChild(el(`<div class="lib-empty">${msg}</div>`)); return;
  }
  docs.forEach(d => {
    const active = d.id === state.ui.activeDoc && !inTrash;
    const actions = inTrash
      ? `<button class="doc-act" data-restore="${d.id}" title="Restore">↩</button><button class="doc-act danger" data-purge="${d.id}" title="Delete forever">${ICON_TRASH}</button>`
      : `<button class="doc-act star ${d.starred ? 'on' : ''}" data-star="${d.id}" title="${d.starred ? 'Unstar' : 'Star'}">${_STAR(d.starred)}</button>`
        + `<button class="doc-act" data-trash="${d.id}" title="Move to trash">${ICON_TRASH}</button>`;
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
// The zoom at which a page's width matches the reader — the view that shows the whole page and
// every control. Used for a phone's first open, and as the snap target when the reader pinches out.
// A page too wide to reach 0.5 stays pannable rather than shrinking past the zoom buttons' floor.
async function fitZoom(pageNo) {
  const scroller = document.getElementById('rdScroll');
  if (!scroller || !pdfDoc) return null;
  const avail = scroller.clientWidth - 8;   // a little gutter so the page shadow isn't flush
  if (avail <= 0) return null;
  const base = (await pdfDoc.getPage(clamp(pageNo || 1, 1, numPages))).getViewport({ scale: 1 }).width;
  return base ? clamp(+(avail / base).toFixed(3), 0.5, 3) : null;
}
// Size the page column to the screen, so a phone opens on a whole page instead of a half-cut one.
// Runs once, on the same narrow first load as the drawers.
async function fitZoomToWidth() {
  if (!isNarrowViewport()) return;   // layout may have settled wide since boot
  const z = await fitZoom(1);
  if (!z) return;
  state.ui.zoom = z;
  $('#zoomVal').textContent = Math.round(z * 100) + '%';
  save();
}
async function initPdf(bytes) {
  setupWorker();
  pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
  numPages = pdfDoc.numPages;
  $('#pageTotal').textContent = '/ ' + numPages;
  if (pendingMobileFit) { pendingMobileFit = false; await fitZoomToWidth(); }   // before the first render
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
  applyOcrLayer(tl, viewport, n);   // scanned page we've OCR'd -> lay in the selectable OCR text layer

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
    applyOcrLayer(tl, vp, n);   // scanned page we've OCR'd -> lay in the selectable OCR text layer
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
// Scroll the reader so a note's linked source is actually in view (~30% down the viewport), not just
// the page top — otherwise a source in the lower half of a tall page stays below the fold and the
// connector line dangles off-screen toward its pin.
async function scrollToAnnotation(a) {
  const rd = $('#rdScroll'); if (!rd || !a) return;
  const rc = a.rects && a.rects[0];
  if (state.ui.continuous) {
    let pg = $(`#contPages .pg[data-page="${a.page}"]`);
    if (pg && !pg._rendered) await renderInto(a.page, pg);
    pg = $(`#contPages .pg[data-page="${a.page}"]`); if (!pg) return;
    state.ui.page = a.page; const pi = $('#pageInput'); if (pi) pi.value = a.page;
    const top = pg.getBoundingClientRect().top - rd.getBoundingClientRect().top;
    rd.scrollTop += top + (rc ? rc.y * pg.offsetHeight : 0) - rd.clientHeight * 0.3;
  } else {
    if (a.page !== state.ui.page) await renderPage(a.page);
    const wrap = $('#pageWrap'); if (!wrap) return;
    const top = wrap.getBoundingClientRect().top - rd.getBoundingClientRect().top;
    rd.scrollTop += top + (rc ? rc.y * wrap.offsetHeight : 0) - rd.clientHeight * 0.3;
  }
  drawPins(); requestAnimationFrame(drawConnector);
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
  if (on) { await buildContinuous(); }
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
  const rec = ocrRec(n);   // scanned page we've already OCR'd -> use that text, skip the empty native layer
  if (rec) { pageTextCache[n] = { text: rec.text || '', items: [], vp, ocr: true }; return pageTextCache[n]; }
  const tc = await page.getTextContent();
  pageTextCache[n] = { text: tc.items.map(i => i.str).join(' '), items: tc.items, vp };
  return pageTextCache[n];
}

/* ---------- OCR for scanned / image-based PDFs (client-side, Tesseract.js) ----------
   Detection is free: PDF.js returns near-empty text for a scanned page. On a hit we prompt
   (a banner); on accept we render each empty page to a canvas, OCR it in-browser (nothing
   leaves the machine), and rebuild a transparent, selectable text layer from the word boxes —
   so find, the AI tools, and source-anchored highlights all work like a native text PDF.
   Results cache in IndexedDB keyed by the doc's SHA-256, so a document is OCR'd once. */
let ocrStore = null;               // { pages: { [n]: { text, words:[{x0,y0,x1,y1,t}] } } } for the active doc
let ocrRunning = false, ocrCancel = false;
const TESS_VER = '5.1.1';
function ocrRec(n) { return (ocrStore && ocrStore.pages && ocrStore.pages[n]) || null; }
async function loadOcrStore(sha) {
  ocrStore = null;
  if (!sha) return;
  try { const v = await idbGet('ocr:' + sha); if (v && v.pages) ocrStore = v; } catch (e) {}
}
// Fraction of the page covered by the single largest painted image (0..1). Replays the content
// stream's transform stack so a full-page scan reads ~1.0 even when it also carries a bit of real
// text (a stamp / watermark / page number).
async function pageImageCoverage(page) {
  try {
    const OPS = pdfjsLib.OPS, ol = await page.getOperatorList();
    const view = page.view, pageArea = (view[2] - view[0]) * (view[3] - view[1]);
    if (!pageArea) return 0;
    const mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let max = 0;
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
      else if (fn === OPS.transform) ctm = mul(ctm, ol.argsArray[i]);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageXObjectRepeat || fn === OPS.paintInlineImageXObject) {
        const w = Math.hypot(ctm[0], ctm[1]), h = Math.hypot(ctm[2], ctm[3]);
        max = Math.max(max, (w * h) / pageArea);
      }
    }
    return max;
  } catch (e) { return 0; }
}
// A page "needs OCR" when it's image-dominated with little real text (a scan) — NOT merely because
// it has a short paragraph. This catches scanned pages that carry a stamp/watermark as real text.
async function pageNeedsOcr(n) {
  const t = (await ensureText(n)) || '';
  if (t.replace(/\s+/g, '').length > 200) return false;   // has genuine selectable text -> leave it
  try { const page = await pdfDoc.getPage(n); return (await pageImageCoverage(page)) >= 0.5; } catch (e) { return false; }
}
// Lay transparent word spans (from OCR boxes) into a text layer, scaled to fill each box so the
// browser's own selection geometry matches the words — that's what powers highlight anchoring.
function buildOcrTextLayer(tl, vp, rec) {
  if (!tl || !rec || !rec.words) return;
  const spans = [];
  for (const wd of rec.words) {
    const w = (wd.x1 - wd.x0) * vp.width, h = (wd.y1 - wd.y0) * vp.height;
    if (w <= 0 || h <= 1) continue;
    const s = document.createElement('span');
    s.textContent = wd.t;   // word only for now, so the box scale is measured from the word (not a trailing space)
    s.style.cssText = 'left:' + (wd.x0 * vp.width).toFixed(2) + 'px;top:' + (wd.y0 * vp.height).toFixed(2)
      + 'px;height:' + h.toFixed(2) + 'px;line-height:' + h.toFixed(2) + 'px;font-size:' + (h * 0.86).toFixed(2) + 'px';
    s._bw = w; tl.appendChild(s); spans.push(s);
  }
  const nat = spans.map(s => s.offsetWidth);   // one batched reflow, then scale each word to its box width
  // Scale the word to its box, THEN append a trailing space so selecting across words yields spaced,
  // searchable text (the space sits in the inter-word gap and doesn't skew the box geometry).
  spans.forEach((s, i) => { if (nat[i] > 0) s.style.transform = 'scaleX(' + (s._bw / nat[i]).toFixed(4) + ')'; s.textContent += ' '; });
}
// Called by the render paths after PDF.js builds its (empty) text layer for a scanned page.
function applyOcrLayer(tl, vp, n) {
  const rec = ocrRec(n); if (!rec) return;
  tl.innerHTML = '';   // replace the sparse native layer (e.g. a watermark) with the OCR one
  buildOcrTextLayer(tl, vp, rec);
  pageTextCache[n] = { text: rec.text || '', items: [], vp, ocr: true };
}
// Live-refresh a page that's already on screen once its OCR finishes.
function applyOcrToRendered(n) {
  const rec = ocrRec(n); if (!rec) return;
  if (state.ui.continuous) {
    const pg = document.querySelector('#contPages .pg[data-page="' + n + '"]');
    if (pg && pg._rendered) { const tl = pg.querySelector('.textLayer'); tl.innerHTML = ''; buildOcrTextLayer(tl, pg._vp, rec); pageTextCache[n] = { text: rec.text, items: [], vp: pg._vp, ocr: true }; }
  } else if (state.ui.page === n) {
    const tl = document.getElementById('textLayer');
    if (tl && viewport) { tl.innerHTML = ''; buildOcrTextLayer(tl, viewport, rec); pageTextCache[n] = { text: rec.text, items: [], vp: viewport, ocr: true }; }
  }
  drawHighlights();
}
function ensureTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (window.__tessLoad) return window.__tessLoad;
  window.__tessLoad = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@' + TESS_VER + '/dist/tesseract.min.js';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => { window.__tessLoad = null; rej(new Error('tesseract load failed')); };
    document.head.appendChild(s);
  });
  return window.__tessLoad;
}
function createTesseractWorker() {
  return Tesseract.createWorker('eng', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@' + TESS_VER + '/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@' + TESS_VER,
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });
}
// Tesseract v5 returns hierarchy under data.blocks; older builds expose data.words. Handle both.
function ocrCollectWords(data) {
  if (data && data.words && data.words.length) return data.words;
  const out = [];
  for (const b of (data && data.blocks || [])) for (const p of (b.paragraphs || [])) for (const l of (p.lines || [])) for (const w of (l.words || [])) out.push(w);
  return out;
}
async function ocrOnePage(worker, n) {
  const page = await pdfDoc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.max(1.5, Math.min(4, 2000 / base.width));   // ~2000px wide is a good OCR resolution
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);   // white bg for cleaner OCR
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const W = canvas.width, H = canvas.height;
  const words = ocrCollectWords(data)
    .filter(w => w.text && w.text.trim() && w.bbox)
    .map(w => ({ x0: w.bbox.x0 / W, y0: w.bbox.y0 / H, x1: w.bbox.x1 / W, y1: w.bbox.y1 / H, t: w.text }));
  return { text: (data.text || '').replace(/[ \t]+\n/g, '\n').trim(), words };
}
const OCR_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>';
async function detectAndOfferOcr(doc) {
  if (!pdfDoc || ocrRunning || !doc) return;
  if (ocrStore && ocrStore.pages && Object.keys(ocrStore.pages).length) return;   // already OCR'd this doc
  if (doc.ocrDismissed) return;                                                    // user said "not now"
  const N = numPages, step = Math.max(1, Math.floor(N / 8)), sample = [];
  for (let n = 1; n <= N && sample.length < 8; n += step) sample.push(n);
  let scanned = 0, checked = 0;
  for (const n of sample) { try { checked++; if (await pageNeedsOcr(n)) scanned++; } catch (e) {} }
  if (checked && scanned / checked >= 0.5 && !ocrRunning) showOcrBanner(doc);   // mostly image pages -> looks scanned
}
// Multiple top-banners (e.g. the OCR prompt + the "open notes file" offer) can be live at once —
// stack them vertically instead of overlapping at the same fixed top.
function restackBanners() {
  let top = 64;
  document.querySelectorAll('.top-banner').forEach(b => { b.style.top = top + 'px'; top += b.offsetHeight + 8; });
}
function showOcrBanner(doc) {
  document.getElementById('ocrBanner')?.remove();
  const b = el('<div id="ocrBanner" class="top-banner ocr" role="status">'
    + '<span class="tb-ic">' + OCR_ICON + '</span>'
    + '<span class="tb-msg">This looks like a <b>scanned PDF</b> — no selectable text. Run OCR to make it searchable, highlightable & AI-readable?</span>'
    + '<button class="tb-act" id="ocrRun">Run OCR</button>'
    + '<button class="tb-x" id="ocrClose" aria-label="Dismiss">✕</button></div>');
  document.body.appendChild(b);
  b.querySelector('#ocrRun').onclick = () => runOcr(doc);
  b.querySelector('#ocrClose').onclick = () => { b.remove(); doc.ocrDismissed = true; save(); restackBanners(); };
  requestAnimationFrame(() => { b.classList.add('show'); restackBanners(); });
}
async function runOcr(doc) {
  if (ocrRunning) return;
  ocrRunning = true; ocrCancel = false;
  const banner = document.getElementById('ocrBanner');
  const msg = html => { const m = banner && banner.querySelector('.tb-msg'); if (m) m.innerHTML = html; };
  msg('Loading the OCR engine…');
  const run = banner && banner.querySelector('#ocrRun'); if (run) run.remove();
  const stop = banner && banner.querySelector('#ocrClose');
  if (stop) { stop.textContent = 'Stop'; stop.className = 'tb-act'; stop.onclick = () => { ocrCancel = true; msg('Finishing current page…'); }; }
  let worker = null, done = 0;
  // Capture the store + page count for THIS doc, so switching docs mid-run can't corrupt another
  // doc's store (the module-level ocrStore/numPages get reassigned on switch).
  const store = (ocrStore && ocrStore.pages) ? ocrStore : (ocrStore = { pages: {} });
  const total = numPages, active = () => ocrStore === store;
  try {
    await ensureTesseract();
    worker = await createTesseractWorker();
    const todo = [];
    for (let n = 1; n <= total; n++) { if (store.pages[n]) continue; if (await pageNeedsOcr(n)) todo.push(n); }
    for (const n of todo) {
      if (ocrCancel || !active()) break;
      msg('Reading text… <b>page ' + (done + 1) + ' of ' + todo.length + '</b>');
      try { store.pages[n] = await ocrOnePage(worker, n); idbPut('ocr:' + doc.sha, store); if (active()) applyOcrToRendered(n); } catch (e) {}
      done++;
    }
  } catch (e) {
    toast('OCR could not run: ' + (e && e.message || e), 'err');
  } finally {
    if (worker) { try { await worker.terminate(); } catch (e) {} }
    ocrRunning = false;
    document.getElementById('ocrBanner')?.remove();
  }
  // Refresh caches + on-screen layers for everything we OCR'd — only if this doc is still open.
  if (active()) for (const k of Object.keys(store.pages)) {
    const n = +k, rec = store.pages[k], vp = pageTextCache[n] ? pageTextCache[n].vp : null;
    pageTextCache[n] = { text: rec.text, items: [], vp, ocr: true };
    applyOcrToRendered(n);
  }
  if (done) toast(ocrCancel
    ? ('OCR stopped — ' + done + ' page' + (done !== 1 ? 's' : '') + ' done.')
    : ('OCR complete — ' + done + ' page' + (done !== 1 ? 's' : '') + ' now searchable & highlightable.'));
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
  if (READONLY || state.ui.tool === 'shot') return;
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
  if (state.ui.tool === 'highlight') { highlightSelection(); return; }
  pop.classList.remove('hidden');
  positionSelPop();
}
function positionSelPop() {
  const sel = window.getSelection(); const pop = $('#selPop');
  if (!sel || !sel.rangeCount || !String(sel).trim()) { pop.classList.add('hidden'); return; }
  // On a phone the popover is pinned to the bottom by CSS — iOS's own edit menu owns the space
  // beside the selection. Drop any inline coordinates a wider layout left behind.
  if (drawerMQ.matches) { pop.style.left = ''; pop.style.top = ''; return; }
  const rects = sel.getRangeAt(0).getClientRects(); const last = rects[rects.length - 1]; if (!last) return;
  const pw = pop.offsetWidth || 220, ph = pop.offsetHeight || 40;
  pop.style.left = clamp(last.left + last.width / 2 - pw / 2, 8, window.innerWidth - pw - 8) + 'px';
  // Below the selection, or above it when the bottom of the screen is too close — on a phone the
  // selection is often near the bottom, and a popover placed off-screen reads as "Ask AI is broken".
  const below = last.bottom + 8;
  pop.style.top = (below + ph <= window.innerHeight - 8 ? below : Math.max(8, last.top - ph - 8)) + 'px';
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
function highlightSelection() {
  if (!pendingSel) return;
  newAnnotation({
    source_type: 'text', page: pendingSel.page, section: pendingSel.section,
    selected_text: pendingSel.text, prefix: pendingSel.prefix, suffix: pendingSel.suffix,
    rects: pendingSel.rects, hlColor: 'yellow',
  });
  window.getSelection().removeAllRanges();
  $('#selPop').classList.add('hidden');
  pendingSel = null;
  renumber(); render(); drawHighlights(); drawPins();
  toast('Highlighted — drag more text, or pick another tool.');
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
  if (kind !== 'yellow') openRightPanel(ann.id);   // Note / Ask AI reveal the panel; a highlight stays silent
  selectAnnotation(ann.id, true);   // expands the note
  // Picking Note / Ask AI *is* a "now type" intent, so raise the keyboard here. Merely selecting a
  // note doesn't, which is why selectAnnotation no longer focuses on touch.
  if (kind !== 'yellow') focusThreadCompose();
  drawHighlights(); drawPins();
  pendingSel = null;
}

/* ---------- screenshot capture ---------- */
let cap = null;
function setTool(t) {
  state.ui.tool = t; save();
  $$('.tool').forEach(b => b.classList.remove('active', 'hl', 'shot'));
  const map = { cursor: '#toolCursor', highlight: '#toolHi', comment: '#toolComment', shot: '#toolShot' };
  const b = $(map[t]); if (b) { b.classList.add('active'); if (t === 'highlight') b.classList.add('hl'); if (t === 'shot') b.classList.add('shot'); }
  const mask = $('#captureMask'); const bar = $('#capBar');
  if (t === 'shot') { mask.style.display = 'block'; bar.classList.remove('hidden'); $('#textLayer').style.pointerEvents = 'none'; }
  else { mask.style.display = 'none'; bar.classList.add('hidden'); $('#textLayer').style.pointerEvents = 'auto'; }
}
// Pointer events, not mouse events: a finger drag never produces mousedown/mousemove/mouseup, so
// box-select was mouse-only. #captureMask sets touch-action:none so the drag doesn't scroll instead.
function initCaptureMask() {
  const mask = $('#captureMask'); let box = null, start = null;
  const at = e => { const r = mask.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const rect = p => ({ l: Math.min(p.x, start.x), t: Math.min(p.y, start.y),
                       w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) });
  mask.addEventListener('pointerdown', e => {
    if (e.button) return;   // primary button / any touch or pen contact
    e.preventDefault();
    try { mask.setPointerCapture(e.pointerId); } catch (err) {}   // a nicety; the mask already spans the reader
    start = at(e);
    box = el('<div class="selbox"><span class="selhandle" style="left:-5px;top:-5px"></span><span class="selhandle" style="right:-5px;top:-5px"></span><span class="selhandle" style="left:-5px;bottom:-5px"></span><span class="selhandle" style="right:-5px;bottom:-5px"></span></div>');
    mask.appendChild(box);
  });
  mask.addEventListener('pointermove', e => {
    if (!box) return; e.preventDefault();
    const r = rect(at(e));
    Object.assign(box.style, { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px' });
  });
  mask.addEventListener('pointerup', async e => {
    if (!box) return;
    const r = rect(at(e));
    box.remove(); box = null;
    if (r.w < 12 || r.h < 12) return;
    await captureRegion(r.l, r.t, r.w, r.h);
  });
  mask.addEventListener('pointercancel', () => { if (box) { box.remove(); box = null; } });
}
// iOS keeps the layout viewport (and 100dvh) at full height when the keyboard opens, so a drawer
// pinned to the bottom hides its own composer behind the keyboard and Safari's accessory bar.
// visualViewport does shrink, so measure the overlap and let CSS lift the drawers by --kb.
// Is the reader typing into a note's own composer (rather than the document-level one)?
const isNoteField = el => !!(el && el.matches && el.matches('.tc-input,.edit-input') && el.closest('#notes'));

function initKeyboardInset() {
  // A field inside the notes list sits in its own scroller. Shrinking the drawer doesn't move it,
  // so the box you're typing in can end up behind the list's footer. Pull it back into view.
  const revealFocused = () => {
    const el = document.activeElement;
    if (!el || !el.closest || !el.closest('#notes')) return;
    try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  };
  // `.replying` folds away the document composer + count row, freeing the room the keyboard took.
  const syncReplying = () => {
    const n = document.getElementById('notes');
    if (n) n.classList.toggle('replying', isNoteField(document.activeElement));
  };
  const vv = window.visualViewport;
  // Wait out the keyboard animation and the layout it triggers before measuring where to scroll.
  document.addEventListener('focusin', e => {
    syncReplying();
    if (drawerMQ.matches && e.target.closest && e.target.closest('#notes')) setTimeout(revealFocused, 320);
  });
  document.addEventListener('focusout', () => setTimeout(syncReplying, 0));   // activeElement settles next tick
  if (!vv) return;
  const apply = () => {
    const overlap = drawerMQ.matches ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    document.documentElement.style.setProperty('--kb', Math.round(overlap) + 'px');
    if (overlap > 0) requestAnimationFrame(revealFocused);
  };
  vv.addEventListener('resize', apply); vv.addEventListener('scroll', apply);
  if (drawerMQ.addEventListener) drawerMQ.addEventListener('change', apply);
  apply();
}

/* ---------- pinch to zoom ---------- */
// Browser pinch magnifies the whole UI — toolbar, drawers and all — and only rescales the canvas'
// existing pixels, so text goes soft. Handle the gesture ourselves: preview it with a transform,
// then re-render the PDF crisply at the new scale. Pinching out lands on fitZoom(), the view that
// shows the whole page and every button, rather than some arbitrary scale in between.
// `.rd-scroll` sets touch-action so the browser never claims the gesture.
let pinch = null;
const zoomLayer = () => (state.ui.continuous ? $('#contPages') : $('#pageWrap'));
const fingerGap = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
function initPinch() {
  const rd = $('#rdScroll'); if (!rd) return;

  rd.addEventListener('touchstart', e => {
    if (e.touches.length !== 2 || !pdfDoc) return;
    const layer = zoomLayer(); if (!layer) return;
    const t = [e.touches[0], e.touches[1]];
    const cx = (t[0].clientX + t[1].clientX) / 2, cy = (t[0].clientY + t[1].clientY) / 2;
    const hit = document.elementFromPoint(cx, cy);
    const anchor = (hit && hit.closest && hit.closest('.pg')) || $('#pageWrap');
    if (!anchor) return;
    const ab = anchor.getBoundingClientRect(), lb = layer.getBoundingClientRect();
    pinch = {
      d0: fingerGap(t), z0: state.ui.zoom, k: 1, cx, cy, layer,
      page: +anchor.dataset.page || state.ui.page,
      fx: (cx - ab.left) / state.ui.zoom,   // focal point, in page units
      fy: (cy - ab.top) / state.ui.zoom,
    };
    layer.style.transformOrigin = (cx - lb.left) + 'px ' + (cy - lb.top) + 'px';
    layer.style.willChange = 'transform';
  }, { passive: true });

  rd.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    pinch.k = clamp(fingerGap([e.touches[0], e.touches[1]]) / pinch.d0, 0.2, 5);
    pinch.layer.style.transform = 'scale(' + pinch.k + ')';
  }, { passive: false });

  async function commit() {
    const p = pinch; if (!p) return; pinch = null;
    p.layer.style.transform = ''; p.layer.style.transformOrigin = ''; p.layer.style.willChange = '';
    if (Math.abs(p.k - 1) < 0.06) return;   // a nudge while scrolling, not a pinch
    let z = clamp(p.z0 * p.k, 0.5, 3);
    if (p.k < 1) {
      // Pinching out means "show me the whole page". Stop at fitZoom rather than shrinking the page
      // below the screen, and pull a near miss exactly onto it. Only when the reader was zoomed in
      // past fit — otherwise a pinch-out would zoom *in*, which is the opposite of the gesture.
      const fit = await fitZoom(p.page);
      if (fit && fit <= p.z0 && z <= fit * 1.06) z = fit;
    }
    if (Math.abs(z - state.ui.zoom) < 0.005) return;
    state.ui.page = p.page; state.ui.zoom = z;
    await updateZoom();
    // hold the pinched-on spot under the fingers across the re-render
    const el2 = state.ui.continuous ? $(`#contPages .pg[data-page="${p.page}"]`) : $('#pageWrap');
    if (el2) {
      const b = el2.getBoundingClientRect();
      rd.scrollLeft += (b.left + p.fx * z) - p.cx;
      rd.scrollTop += (b.top + p.fy * z) - p.cy;
    }
    drawHighlights(); drawPins(); drawConnector();
  }
  rd.addEventListener('touchend', e => { if (pinch && e.touches.length < 2) commit(); }, { passive: true });
  rd.addEventListener('touchcancel', () => { if (pinch) commit(); }, { passive: true });
}

async function captureRegion(l, t, w, h) {
  // l,t,w,h are pixels within the capture mask (which overlays the scroll viewport).
  const mask = $('#captureMask'); const mr = mask.getBoundingClientRect();
  const sx = mr.left + l, sy = mr.top + t;   // selection top-left in screen coords
  let canvas, vp, page;
  if (state.ui.continuous) {
    const cx = sx + w / 2, cy = sy + h / 2; let pgEl = null;
    $$('#contPages .pg').forEach(p => { const r = p.getBoundingClientRect(); if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) pgEl = p; });
    if (!pgEl) { toast('Draw the box over a page to capture it.', 'err'); return; }
    if (!pgEl._rendered) await renderInto(+pgEl.dataset.page, pgEl);
    canvas = pgEl.querySelector('canvas'); vp = pgEl._vp; page = +pgEl.dataset.page;
  } else {
    canvas = $('#pageCanvas'); vp = viewport; page = state.ui.page;
  }
  if (!canvas || !vp) { toast('Nothing to capture here.', 'err'); return; }
  const cr = canvas.getBoundingClientRect();
  const dx = Math.max(0, sx - cr.left), dy = Math.max(0, sy - cr.top);   // display px inside the canvas
  const dw = Math.min(w, cr.width - dx), dh = Math.min(h, cr.height - dy);
  if (dw < 12 || dh < 12) { toast('Draw the box over a page to capture it.', 'err'); return; }
  const sc = canvas.width / cr.width;   // device px per display px
  const tmp = document.createElement('canvas'); tmp.width = Math.round(dw * sc); tmp.height = Math.round(dh * sc);
  tmp.getContext('2d').drawImage(canvas, dx * sc, dy * sc, dw * sc, dh * sc, 0, 0, dw * sc, dh * sc);
  const dataURL = tmp.toDataURL('image/png');
  const pt = pageTextCache[page] || { text: '' };
  const figM = pt.text.match(/Figure\s+\d+[:.][^.]{0,120}/i);
  const ann = newAnnotation({
    source_type: 'screenshot', page,
    section: sectionForIndex(pt.text, 0), screenshot: dataURL,
    caption: figM ? figM[0].trim() : '',
    rects: [{ x: dx / cr.width, y: dy / cr.height, w: dw / cr.width, h: dh / cr.height }],
  });
  setTool('cursor');
  openRightPanel(ann.id);           // reveal the panel so the captured note is visible
  // drawHighlights too, not just the pin: the captured region persists as a
  // dashed .figbox, and without this the outline only appeared the next time
  // something else forced a redraw (a zoom, a page change). From the user's
  // side the box simply vanished the moment the drag ended.
  selectAnnotation(ann.id, true); render(); drawHighlights(); drawPins(); focusComposer();
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
// A pin can be nudged off its anchor when it covers something you want to read.
// The offset is stored on the annotation as a fraction of the page box — not as
// pixels — so it holds through zoom, window resize and re-render, and travels in
// the .notes.json like any other field. Capped so a pin stays a nudge from its
// own highlight rather than wandering off and losing the association.
const PIN_NUDGE_MAX = 0.12;
const pinOffset = a => [
  clamp(Number(a.pinDx) || 0, -PIN_NUDGE_MAX, PIN_NUDGE_MAX),
  clamp(Number(a.pinDy) || 0, -PIN_NUDGE_MAX, PIN_NUDGE_MAX)
];
const pinLeft = (rc, w, dx) => clamp((rc.x + rc.w + dx) * w.vp.width, 0, w.vp.width - 25);
const pinTop = (rc, w, dy) => clamp((rc.y + dy) * w.vp.height, 0, w.vp.height - 25);
function placePin(p, rc, w, dx, dy) {
  // keep the bead on the page even when the anchor sits at an edge
  p.style.left = pinLeft(rc, w, dx) + 'px';
  p.style.top = pinTop(rc, w, dy) + 'px';
  // A moved pin would otherwise read as unattached, so run a hairline back to
  // where it belongs. Both ends carry .pin's translate(6px,-4px), so the offsets
  // below just put the line through the bead's centre in the same space.
  const t = p._tether; if (!t) return;
  const x1 = pinLeft(rc, w, 0) + 18.5, y1 = pinTop(rc, w, 0) + 8.5;
  const x2 = pinLeft(rc, w, dx) + 18.5, y2 = pinTop(rc, w, dy) + 8.5;
  t.style.left = x1 + 'px'; t.style.top = y1 + 'px';
  t.style.width = Math.hypot(x2 - x1, y2 - y1) + 'px';
  t.style.transform = 'rotate(' + Math.atan2(y2 - y1, x2 - x1) + 'rad)';
}
function drawPins() {
  pageWrappers().forEach(w => {
    const pins = w.pins; if (!pins) return; pins.innerHTML = ''; pins.style.width = w.vp.width + 'px'; pins.style.height = w.vp.height + 'px';
    state.annotations.filter(a => inActiveDoc(a) && a.page === w.page && a.rects && a.rects.length).forEach(a => {
      const rc = a.rects[0];
      const [dx, dy] = pinOffset(a);
      const p = el(`<div class="pin ${a.source_type === 'screenshot' ? 'shot' : ''} ${a.id === state.ui.activeId ? 'sel' : ''}${dx || dy ? ' moved' : ''}" data-ann="${a.id}" title="Drag to move · double-click to put it back">${a.anchor}</div>`);
      p._tether = el('<div class="pin-tether"></div>');
      p._tether.hidden = !(dx || dy);
      pins.appendChild(p._tether);
      placePin(p, rc, w, dx, dy);
      attachPinDrag(p, a, rc, w);
      pins.appendChild(p);
    });
  });
  drawConnector();
}
// Drag-to-nudge. Click still selects: a press only becomes a drag once it passes
// a small threshold, and the click that the browser fires after the drag is
// swallowed. Pointer capture keeps the move events coming even when the cursor
// outruns the 25px bead.
function attachPinDrag(p, a, rc, w) {
  const DRAG_MIN = 3;
  let x0 = 0, y0 = 0, dx0 = 0, dy0 = 0, down = false, moved = false;

  p.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    down = true; moved = false;
    x0 = ev.clientX; y0 = ev.clientY;
    [dx0, dy0] = pinOffset(a);
    try { p.setPointerCapture(ev.pointerId); } catch (e) {}
    // NB: no preventDefault here — it would suppress the compatibility click
    // and break selecting a note by its pin. .pin carries user-select:none and
    // touch-action:none instead.
  });

  p.addEventListener('pointermove', ev => {
    if (!down) return;
    const mx = ev.clientX - x0, my = ev.clientY - y0;
    if (!moved && Math.hypot(mx, my) < DRAG_MIN) return;
    if (!moved) { moved = true; p.classList.add('dragging'); if (p._tether) p._tether.hidden = false; }
    a.pinDx = clamp(dx0 + mx / w.vp.width, -PIN_NUDGE_MAX, PIN_NUDGE_MAX);
    a.pinDy = clamp(dy0 + my / w.vp.height, -PIN_NUDGE_MAX, PIN_NUDGE_MAX);
    placePin(p, rc, w, a.pinDx, a.pinDy);
    drawConnector();                       // the thread tracks the bead as it moves
  });

  const finish = ev => {
    if (!down) return;
    down = false;
    p.classList.remove('dragging');
    try { p.releasePointerCapture(ev.pointerId); } catch (e) {}
    if (!moved) return;
    p.classList.add('moved');
    a.updated_at = nowISO(); save();
    p._ateClick = true;                    // cleared by the click handler below
  };
  p.addEventListener('pointerup', finish);
  p.addEventListener('pointercancel', finish);

  // clicking a note's number reveals the panel + scrolls its card in — but does
  // NOT move the reader (the pin is already visible)
  p.addEventListener('click', ev => {
    if (p._ateClick) { p._ateClick = false; ev.stopPropagation(); return; }
    openRightPanel(a.id); selectAnnotation(a.id, true, false);
  });

  p.addEventListener('dblclick', ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (!a.pinDx && !a.pinDy) return;
    delete a.pinDx; delete a.pinDy;
    a.updated_at = nowISO(); save();
    drawPins();
    toast('Pin put back');
  });
}
// Open the notes panel if it's collapsed (used when a note/answer/screenshot/comment is created, so
// the new card is visible and the connector has something to point at). Highlighting doesn't call this.
function openRightPanel(settleId) {
  if (!state.ui.collapseRight) return;
  setPanel('right', true);
  // Re-scroll the card and redraw the connector once the panel's slide-in transition (.18s) settles.
  setTimeout(() => { if (settleId) scrollNoteIntoView(settleId, true); drawConnector(); }, 210);
}
// Below this width the asides overlay the page instead of taking a grid column (see styles.css).
const drawerMQ = window.matchMedia('(max-width:820px)');
let pendingMobileFit = false;   // narrow first run: fit the zoom once the page's size is known
// A document that hasn't been laid out yet reports a width of 0, and `0 <= 820` would read as
// "phone". Treat 0 as unknown: the mobile default is persisted and one-way, so it must never be
// decided from an unmeasured viewport.
function isNarrowViewport() {
  const w = window.innerWidth || document.documentElement.clientWidth || 0;
  return w > 0 && w <= 820;
}

const PANEL_KEY = { left: 'collapseLeft', right: 'collapseRight' };
function setPanel(side, open) {
  const app = document.getElementById('app');
  if (open && drawerMQ.matches) {   // a drawer covers the page — only one at a time
    const other = side === 'left' ? 'right' : 'left';
    state.ui[PANEL_KEY[other]] = true;
    app.classList.add('collapse-' + other);
  }
  state.ui[PANEL_KEY[side]] = !open;
  app.classList.toggle('collapse-' + side, !open);
  save();
  trackConnector();
}
/* #app animates grid-template-columns, so the panel keeps moving for ~180ms
   after the class flips. A single rAF measures it one frame in — the line
   freezes pointing at where the card used to be, until some later event
   (a scroll) happens to redraw it. Track it across the whole transition
   instead, which also lets the line follow the panel rather than jump. */
let _connTrack = 0;
function trackConnector(ms = 260) {
  if (!viewport) return;
  const token = ++_connTrack;
  const start = performance.now();
  const draw = () => { if (token === _connTrack) { try { drawConnector(); } catch (e) {} } };
  const step = () => {
    if (token !== _connTrack) return;          // a newer toggle owns the loop
    draw();
    if (performance.now() - start < ms) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // rAF is throttled to nothing in a background/hidden tab, which would leave
  // the line stranded at its pre-transition position. These land it anyway.
  setTimeout(draw, 210);
  setTimeout(draw, ms + 40);
}
function drawConnector() {
  const svg = $('#connectors'); if (!svg) return; while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (state.ui.collapseRight) return;   // notes panel closed -> no visible card to point at, so drop the line
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
  // Drawn as stacked strokes so the thread reads as glass rather than as a line:
  // a blurred white glow, a soft light core, the dashed clay hairline, then a
  // specular sliver riding on top. Only the hairline is dashed — dashing the
  // glow as well would make it flicker rather than glow.
  const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  for (const cls of ['glow', 'core', 'dash', 'spec']) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', cls);
    svg.appendChild(path);
  }
  // the bead where the thread leaves the pin
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('cx', x1); dot.setAttribute('cy', y1); dot.setAttribute('r', 3.6);
  dot.setAttribute('class', 'endcap');
  svg.appendChild(dot);
}

/* ---------- selection / navigation of notes ---------- */
function scrollNoteIntoView(id, center) {
  // Scroll ONLY the notes list — never use element.scrollIntoView(), which also scrolls
  // ancestor/window and would push the top bars off-screen.
  const list = $('#notesList'), c = $(`.card[data-ann="${id}"]`);
  if (!list || !c) return;
  const lb = list.getBoundingClientRect(), cb = c.getBoundingClientRect();
  if (center) { list.scrollTop += (cb.top - lb.top) - (lb.height / 2 - cb.height / 2); return; }
  if (cb.height > lb.height) {
    // Card is taller than the panel: only move if it's fully out of view — never yank a
    // card that already fills the viewport (that was the "jump to the top" bug).
    if (cb.top > lb.bottom - 40) list.scrollTop += (cb.top - lb.top) - 12;          // below → bring its top up
    else if (cb.bottom < lb.top + 40) list.scrollTop += (cb.bottom - lb.bottom) + 12; // above → bring its bottom up
  } else if (cb.top < lb.top + 8 || cb.bottom > lb.bottom - 8) list.scrollTop += (cb.top - lb.top) - 12; // short → bring fully into view
}
// Stick-to-bottom: keep the newest content of a growing/streaming note in view.
function followNoteBottom(id) {
  const list = $('#notesList'), c = $(`.card[data-ann="${id}"]`);
  if (!list || !c) return;
  const lb = list.getBoundingClientRect(), cb = c.getBoundingClientRect();
  if (cb.height > lb.height) list.scrollTop += (cb.bottom - lb.bottom) + 12;            // tall → show the bottom (latest content)
  else if (cb.top < lb.top + 8 || cb.bottom > lb.bottom - 8) list.scrollTop += (cb.top - lb.top) - 12; // short → bring into view
}
function selectAnnotation(id, scrollCard, scrollPage) {
  state.ui.activeId = id; save();
  const a = state.annotations.find(x => x.id === id);
  if (a && scrollPage) scrollToAnnotation(a);   // bring the linked source into view (not just the page top)
  render(); drawPins();
  if (scrollCard) scrollNoteIntoView(id, true);
  requestAnimationFrame(drawConnector);
  // Only on a pointer device. On a phone, focus means the keyboard: tapping a note's number to read
  // it would throw the keyboard over half the screen. Callers that follow a "now type" intent —
  // creating a note or a comment — still focus the composer themselves.
  if (!drawerMQ.matches) focusThreadCompose();
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
const canImage = p => p === 'openrouter' || p === 'compat';
function activeProvider() { return state.settings.provider; }
function keyFor(p) { return (state.settings.keys[p] || '').trim(); }
function pickImageProvider() {
  const a = activeProvider(); if (canImage(a)) return a;   // server may hold the key
  return 'openrouter';   // fallback image-capable provider (server key or BYO)
}
// AI calls go through the server-side proxy (/api/*): uses the site's env key by default,
// or the user's BYO key (from Settings) passed through as `userKey`.
async function aiText(provider, { system, user, image, maxTokens }) {
  const r = await fetch('/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, system, user, image, web: !!state.settings.enableWeb, model: state.settings.models[provider], maxTokens, userKey: keyFor(provider) || undefined, baseUrl: state.settings.compatBaseUrl }),
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || `AI request failed (${r.status})`);
  return j.text || '';
}
async function aiImage(provider, prompt) {
  const model = provider === 'openrouter' ? state.settings.models.openrouterImage : state.settings.models.compatImage;
  const r = await fetch('/api/ai-image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, prompt, model, userKey: keyFor(provider) || undefined, baseUrl: state.settings.compatBaseUrl }),
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || `Image request failed (${r.status})`);
  return j.image;
}
// ---- Intent router: a fast/cheap model classifies a note message → answer | visual | note ----
async function aiClassify(provider, model, system, user) {
  const r = await fetch('/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, mode: 'text', system, user, model, maxTokens: 220, userKey: keyFor(provider) || undefined, baseUrl: state.settings.compatBaseUrl }),
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || `Router failed (${r.status})`);
  return j.text || '';
}
function parseRoute(raw) {
  let o = {};
  try { o = JSON.parse(raw); } catch (e) { const m = String(raw).match(/\{[\s\S]*\}/); if (m) { try { o = JSON.parse(m[0]); } catch (e2) {} } }
  const it = String(o.intent || '').toLowerCase();
  const intent = /visual|image|diagram|picture/.test(it) ? 'visual' : /note|comment|reminder/.test(it) ? 'note' : 'answer';
  const visual_type = /image|picture|photo|illustrat|draw|sketch|hand/i.test(String(o.visual_type || '')) ? 'image' : 'diagram';
  const tags = Array.isArray(o.tags) ? o.tags.filter(t => typeof t === 'string' && t.trim()).slice(0, 2) : [];
  return { intent, visual_type, tags };
}
async function routeMessage(a, question) {
  const provider = activeProvider();
  const model = (provider === 'openrouter' ? state.settings.models.openrouterRouter : state.settings.models.compatRouter) || DEFAULT_MODELS.openrouterRouter;
  const c = buildContext(a);
  const where = a.source_type === 'screenshot' ? 'a captured figure/screenshot' : a.source_type === 'doc' ? 'the whole document' : 'a text selection';
  const user = [
    `The note is anchored to ${where} (page ${c.page}${c.section ? ', ' + c.section : ''}).`,
    c.evidence ? `Selected excerpt: """${c.evidence.slice(0, 300)}"""` : '',
    c.thread ? `Earlier in this note:\n${c.thread.slice(0, 500)}` : '',
    `The reader just wrote: """${question}"""`,
  ].filter(Boolean).join('\n');
  return parseRoute(await aiClassify(provider, model, promptFor('router'), user));
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
  chips.push(`Page ${a.page}`);   // chipRow() escapes each chip at render
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
  if ((provider === 'openrouter' || provider === 'compat') && a.source_type !== 'screenshot') { await askAIAgent(a, question, msg, provider); return; }
  const ctx = buildContext(a);
  const passages = retrievePassages(question, a.page);
  const system = promptFor('text');
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
      body: JSON.stringify({ provider: activeProvider(), web: true, system: promptFor('web'), user: String(query), userKey: keyFor(activeProvider()) || undefined, baseUrl: state.settings.compatBaseUrl }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'web search failed');
    return j.text || '(no web results)';
  } catch (e) { return 'Web search error: ' + (e.message || e); }
}
function agentTools() {
  const t = [
    { type: 'function', function: { name: 'read_selection_context', description: toolDesc('read_selection_context'), parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'read_page', description: toolDesc('read_page'), parameters: { type: 'object', properties: { page: { type: 'integer', description: '1-based page number' } }, required: ['page'] } } },
    { type: 'function', function: { name: 'search_document', description: toolDesc('search_document'), parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'document_outline', description: toolDesc('document_outline'), parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'read_full_document', description: toolDesc('read_full_document'), parameters: { type: 'object', properties: {} } } },
  ];
  if (state.settings.enableVisuals) t.push({ type: 'function', function: { name: 'create_visual', description: toolDesc('create_visual'), parameters: { type: 'object', properties: { description: { type: 'string', description: 'What the visual should depict.' } }, required: ['description'] } } });
  if (state.settings.enableWeb) t.push({ type: 'function', function: { name: 'web_search', description: toolDesc('web_search'), parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } });
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
async function aiAgentStep(provider, model, messages, tools) {
  const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, mode: 'agent', model, messages, tools, userKey: keyFor(provider) || undefined, baseUrl: state.settings.compatBaseUrl }) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || `Agent step failed (${r.status})`);
  return j;
}
function agentChips(a, used) {
  const chips = [`Page ${a.page}`];   // chipRow() escapes each chip at render
  if (a.section) chips.push(a.section.replace(/^(\d+(\.\d+)*)\s+/, m => 'Section ' + m.trim() + ' ').trim());
  if (used.has('read_full_document')) chips.push('Read full paper');
  if (used.has('search_document')) chips.push('Searched document');
  if (used.has('read_page') || used.has('document_outline')) chips.push('Read related pages');
  if (used.has('create_visual')) chips.push('Generated visual');
  chips.push(a.source_type === 'screenshot' ? 'Used screenshot' : 'Used highlighted text');
  chips.push(used.has('web_search') ? 'Used web search' : 'No external sources');
  return chips;
}
async function askAIAgent(a, question, msg, provider) {
  state.ui.streamingId = a.id;   // let render() follow this note's newest content while the AI works
  const model = state.settings.models[provider] || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openrouter;
  const c = buildContext(a);
  const system = promptFor('text');
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
      const step = await aiAgentStep(provider, model, messages, tools);
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
  } finally { if (state.ui.streamingId === a.id) state.ui.streamingId = null; }
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
async function generateVisual(annId, prompt, typeHint) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  state.ui.streamingId = a.id;   // follow this note's newest content while the visual generates
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
  let planSys = promptFor('image');
  if (!canImage && !/image generation is unavailable/i.test(planSys)) planSys += '\nNOTE: image generation is unavailable, so you must use "ascii".';
  if (typeHint && canImage) planSys += `\nThe reader's intent is already classified as "${typeHint}". Set "format" to "${typeHint === 'image' ? 'image' : 'ascii'}" and fill the matching field (${typeHint === 'image' ? 'a detailed image_prompt' : 'the ascii diagram'}).`;
  if (!/STRICT JSON/i.test(planSys)) planSys += '\nReturn STRICT JSON only. Put the heavy field ("ascii" or "image_prompt") FIRST so it survives if the response is cut off: {"format":"ascii"|"image","ascii":"<monospace diagram, <=24 lines, only if ascii>","image_prompt":"<detailed prompt, only if image>","title":"<=6 words","takeaways":["2-4 short bullets grounded in the doc"],"caption":"one line"}';
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
    if (typeHint && canImage) plan.format = (typeHint === 'image') ? 'image' : 'ascii';   // router already decided image vs diagram
    if (!plan.format) plan.format = (canImage && /\b(illustrat|picture|scene|concept art|artistic|imagine|photo)\b/i.test(prompt || '')) ? 'image' : 'ascii';
    if (plan.format === 'image' && !canImage) plan.format = 'ascii';
    msg.title = plan.title || (plan.format === 'image' ? 'Generated image' : 'Diagram');
    msg.takeaways = Array.isArray(plan.takeaways) ? plan.takeaways : [];
    msg.caption = plan.caption || '';
    if (plan.format === 'image' && plan.image_prompt) {
      msg.status = 'Generating image…'; save(); render();
      try {
        msg.image = await aiImage(ip, `${plan.image_prompt}. Compose everything inside a single square frame with generous margins — no text, label, or element may touch or run off any edge. Clean, legible, uncluttered, white background, no logos. Only depict the content described above; do not invent unrelated words, names, or examples.`);
        msg.kind = 'image'; msg.model = state.settings.models[ip + 'Image'];
      } catch (e) { if (plan.ascii) { msg.kind = 'ascii'; msg.ascii = plan.ascii; } else { msg.error = 'Image generation failed: ' + (e.message || e); msg.title = 'Visual unavailable'; } }
    } else {
      msg.kind = 'ascii'; msg.model = state.settings.models[tp];
      let art = (plan.ascii || '').trim();
      if (!art) {
        // Planner JSON was unusable (e.g. truncated before the diagram) — ask for the diagram as plain text so there's no JSON to break.
        msg.status = 'Drawing the diagram…'; save(); render();
        try { const rawDiagram = await aiText(tp, { system: promptFor('diagram'), user: planUser, image: ctx.image, maxTokens: 2200 }); art = String(rawDiagram || '').replace(/```[a-z]*|```/g, '').trim(); } catch (e) {}
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
  } finally { if (state.ui.streamingId === a.id) state.ui.streamingId = null; }
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
  const sync = () => { hl.innerHTML = esc(ta.value).replace(/@ai\b/ig, m => `<span class="men">${m}</span>`) + '\n'; hl.scrollTop = ta.scrollTop; };
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
  const clean = text.replace(/@ai\b/ig, '').trim();
  a.messages.push({ id: uid('m'), actor: 'you', type: 'comment', text: text, created_at: nowISO() });
  a.auto_tags = Array.from(new Set([...(a.auto_tags || []), ...autoTag(text, a.source_type, 'comment')]));
  a.updated_at = nowISO(); save(); render(); focusThreadCompose();
  const forceAsk = askNextId === a.id; askNextId = null;   // user chose “Ask AI” on this note
  const forceEngage = forceAsk || /@ai\b/i.test(text);     // an explicit @ai / “Ask AI” always engages the model
  routeAndAct(a, clean || text, clean, forceEngage);
}
// Route a note message via the intent router (a fast model). Falls back to the legacy keyword
// heuristics only if the router is unreachable (offline / no /api / quota). Leans to "answer" when unsure.
async function routeAndAct(a, question, clean, forceEngage) {
  let route;
  try {
    route = await routeMessage(a, question);
  } catch (e) {
    const wantAI = forceEngage || /\?\s*$/.test(question) || /^(explain|summar|derive|what|why|how|does|is|are|prove|show|compare)/i.test(clean || '');
    route = { intent: isVisualRequest(clean || question) ? 'visual' : wantAI ? 'answer' : 'note', visual_type: 'image', tags: [] };
  }
  if (forceEngage && route.intent === 'note') route.intent = 'answer';   // @ai overrides a "personal note" call
  if (route.tags && route.tags.length) a.auto_tags = Array.from(new Set([...(a.auto_tags || []), ...route.tags]));
  if (route.intent === 'visual') generateVisual(a.id, question, route.visual_type);
  else if (route.intent === 'answer') askAI(a.id, question);
  else { save(); render(); }   // keep as a personal note — the comment is already saved; persist any tags
}
// Recognize a request to CREATE a visual (image or diagram) — a visual noun + a make/turn-into verb.
function isVisualRequest(t) {
  t = (t || '').toLowerCase();
  const NOUN = 'image|picture|pic|illustration|figure|visual|diagram|chart|graph|plot|infographic|schematic|flow-?chart|drawing|mind ?map|sketch';
  const noun = new RegExp(`\\b(${NOUN})\\b`).test(t);
  // Catch natural phrasings so image requests aren't silently dropped: a "make" verb near a visual noun,
  // a bare visual verb (draw/sketch/illustrate…), "as a <visual>", "<visual> of/showing…", or a leading
  // visual noun ("image of the model"). Previously required BOTH a noun AND a verb, so "draw the
  // architecture" / "a picture of the encoder" / "illustrate X" fell through and did nothing.
  const makeVerb = /\b(generate|make|create|draw|produce|render|design|sketch|mock ?up|whip up|visuali[sz]e|illustrate|depict|show me|give me|turn|convert)\b/.test(t);
  const asNoun = new RegExp(`\\bas an?\\s+(${NOUN})\\b`).test(t);
  const nounOf = new RegExp(`\\b(${NOUN})\\s+(of|for|showing|depicting|that|to|with)\\b`).test(t);
  const leadNoun = new RegExp(`^\\s*(a|an|the|another|one)?\\s*(${NOUN})\\b`).test(t);
  const visualVerb = /\b(draw|sketch|illustrate|diagram|visuali[sz]e|depict)\b/.test(t);
  return (noun && makeVerb) || asNoun || nounOf || leadNoun || visualVerb;
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
  if (p === 'openrouter') return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h6a4 4 0 0 1 4 4"/><path d="M13 4l3 3-3 3"/><circle cx="6" cy="17" r="1.8"/><path d="M8 17h9"/></svg>';
  if (p === 'compat') return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0z"/><path d="M12 16v6"/></svg>';
  return '✦';
}
function actorAvatar(m) {
  if (m.actor === 'ai') {
    const p = m.provider, cls = p === 'openrouter' ? 'openrouter' : p === 'compat' ? 'compat' : p === 'openai' ? 'gpt' : p === 'anthropic' ? 'claude' : p === 'gemini' ? 'gemini' : '';
    return `<div class="avatar ai brand ${cls}" title="${esc(PROVIDER_LABEL[p] || 'AI')}">${providerGlyph(p)}</div>`;
  }
  const ac = ACTORS[m.actor] || { initials: state.settings.actorInitials || 'YO', color: '#547089' };
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
const ICON_CHECKBOX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/></svg>';
const ICON_CHECKBOX_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" stroke="currentColor"/><path d="M8 12.3l2.7 2.7L16 9.3" stroke="#fff"/></svg>';
// hover action icons in a message head — collapse (note head), copy, edit (comment or AI), plus delete-note / delete-reply
function msgActions(a, m, isFirst) {
  const editable = m.type === 'comment' || m.type === 'ai_answer';
  // Collapse chevron sits outside .macts so it stays visible; copy/edit/delete reveal on hover.
  const collapse = isFirst ? `<button class="mact collapse-btn" data-collapse="${a.id}" title="Collapse thread">${ICON_CHEVUP}</button>` : '';
  // "Show on card" checkbox — also always-visible — lets you pick which message(s) appear on the
  // collapsed card (e.g. show the AI's summary instead of your question). Off = faint, on = blue.
  const showable = m.type === 'comment' || m.type === 'ai_answer' || m.type === 'generated_visual';
  const showtog = showable
    ? `<button class="mact showtog ${m.showOnCard ? 'on' : ''}" data-showtog="${m.id}" data-ann="${a.id}" title="${m.showOnCard ? 'Showing on the collapsed card — click to hide' : 'Show this on the collapsed card'}">${m.showOnCard ? ICON_CHECKBOX_ON : ICON_CHECKBOX}</button>`
    : '';
  const copy = isFirst
    ? `<button class="mact" data-copynote="${a.id}" title="Copy whole thread">${ICON_COPY}</button>`
    : `<button class="mact" data-copymsg="${m.id}" data-ann="${a.id}" title="Copy this response">${ICON_COPY}</button>`;
  return collapse + showtog + `<span class="macts">`
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
  const L = [`${srcLabel(a)} — Page ${a.page}${a.section ? ' · ' + a.section : ''}`];   // plain text for the clipboard, never HTML
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
    body += `<div class="q-src"><span class="qn">${esc(a.anchor)}</span>${srcLabel(a)} · Page ${esc(a.page)}${a.section ? ' · ' + esc(a.section) : ''}${a.resolved ? ' · <span class="resolved-flag">✓ Resolved</span>' : ''}</div>`;
    if (a.source_type === 'screenshot' && a.screenshot) body += `<div class="shot-thumb"><img src="${safeImgSrc(a.screenshot)}"></div>`;
    else if (a.selected_text) body += quoteBlock(a.selected_text);
  }
  if (m.type === 'comment') body += editing ? editBox(a, m) : `<div class="msg">${m.text ? commentHTML(m.text) : ''}</div>`;
  if (m.type === 'ai_answer') {
    if (m.pending) body += `<div class="msg"><span class="typing">${esc(m.status || 'Thinking')}<i></i><i></i><i></i></span></div>`;
    else if (m.error) body += `<div class="msg" style="color:#B91C1C">⚠ ${esc(m.error)}</div>`;
    else if (editing) body += editBox(a, m);
    else {
      // Answer first; provenance chips are tucked into a collapsed “sources” disclosure.
      body += `<div class="msg">${mdRich(m.text)}</div>`
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
      if (m.image) body += `<img src="${safeImgSrc(m.image)}">`;
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
function msgPreviewText(m) {
  if (!m) return '';
  if (m.type === 'comment' || m.type === 'ai_answer') return m.text || '';
  if (m.type === 'generated_visual') return m.title || 'Visual';
  return '';
}
// Flatten a message to a one-glance preview: drop markdown syntax, fold newlines/bullets inline.
function plainPreview(t) {
  return String(t || '').replace(/`{1,3}/g, '').replace(/[*_#>]/g, '')
    .replace(/^\s*[-•]\s+/gm, '• ').replace(/\s*\n+\s*/g, '  ').trim();
}
// Full, formatted render of a message for a "shown on card" preview (bullets/markdown/line breaks
// preserved) — so a checked AI summary reads in full on the card without expanding the thread.
function fullMsgHTML(m) {
  if (m.type === 'ai_answer') return mdRich(m.text || '');
  if (m.type === 'comment') return commentHTML(m.text || '');
  if (m.type === 'generated_visual') {
    let h = `<div class="vis-card cc-vis"><h4>${esc(m.title || 'Visual')}</h4>`;
    if (m.image) h += `<img src="${safeImgSrc(m.image)}">`;
    else if (m.ascii) h += `<pre class="ascii">${esc(m.ascii)}</pre>`;
    if (m.takeaways?.length) h += `<ul class="vis-take">${m.takeaways.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
    return h + `</div>`;
  }
  return esc(msgPreviewText(m));
}
function compactCard(a) {
  // Compact card: number badge inline with the preview, time top-right, then location.
  // Preview = the message(s) the user checked "Show on card" (e.g. the AI answer); if none are
  // checked, fall back to the first question/answer. (Type label was dropped — badge+text say enough.)
  const m0 = a.messages[0];
  const when = timeLabel(m0 ? m0.created_at : a.created_at);
  const badge = a.source_type === 'screenshot' ? 'var(--green)' : 'var(--blue)';
  const shown = (a.messages || []).filter(m => m.showOnCard && msgPreviewText(m).trim());
  // Checked messages show IN FULL (no 2-line clamp); the default fallback stays a clamped preview.
  const full = shown.length > 0;
  let items;
  if (full) items = shown.map(m => ({ m, tag: m.actor === 'ai' ? 'ai' : 'you' }));
  else {
    const first = (a.messages || []).find(m => (m.type === 'comment' || m.type === 'ai_answer') && (m.text || '').trim());
    items = first ? [{ m: first, tag: null }] : [];
  }
  let previews = items.map(({ m, tag }) => {
    const tagHTML = tag === 'ai' ? '<span class="cc-tag ai">AI</span>' : tag === 'you' ? '<span class="cc-tag you">You</span>' : '';
    if (full) return `<div class="msg cc-full">${tagHTML}${fullMsgHTML(m)}</div>`;
    return `<div class="msg clamp">${tagHTML}${esc(plainPreview(msgPreviewText(m))).replace(/@ai\b/ig, x => `<span class="men">${x}</span>`)}</div>`;
  }).join('');
  if (!previews && a.selected_text) previews = `<div class="msg clamp">${esc(a.selected_text)}</div>`;
  const wrap = el(`<div class="card compact k-${cardKind(a)} ${a.resolved ? 'isres' : ''}" data-ann="${a.id}">
    ${!a.resolved ? '<span class="unread-dot"></span>' : ''}
    <div class="cc">
      <span class="cc-badge" style="background:${badge}">${a.anchor}</span>
      <div class="cc-main">
        ${previews}
        ${a.source_type === 'screenshot' && a.screenshot ? `<div class="shot-thumb"><img src="${safeImgSrc(a.screenshot)}"></div>` : ''}
        <div class="loc-line">Page ${esc(a.page)}${a.section ? ' · ' + esc(a.section) : ''}${a.resolved ? ' · <span class="resolved-flag">✓ Resolved</span>' : ''}</div>
      </div>
      <span class="cc-when">${when}</span>
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
    firstBody = `<div class="q-src"><span class="qn">${esc(a.anchor)}</span>${srcLabel(a)} · Page ${esc(a.page)}${a.section ? ' · ' + esc(a.section) : ''}</div>`
      + (a.source_type === 'screenshot' && a.screenshot ? `<div class="shot-thumb"><img src="${safeImgSrc(a.screenshot)}"></div>` : (a.selected_text ? quoteBlock(a.selected_text) : ''));
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
    .replace(/@ai\b/ig, x => `<span class="men">${x}</span>`);
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

/* ---------- rich content: LaTeX math (MathJax) + fenced pseudocode ---------- */
const RICH_FENCE = /```[ \t]*([A-Za-z0-9_+#.\-]*)[ \t]*\n?([\s\S]*?)```/g;
// Private-use sentinels (U+E000/E001) wrap protected spans; built at runtime so only ASCII
// lives in source, and these code points never occur in real prose, LaTeX, or code.
const RTOK0 = String.fromCharCode(0xE000), RTOK1 = String.fromCharCode(0xE001);
const RTOK_RE = new RegExp(RTOK0 + '(\\d+)' + RTOK1, 'g');
function codeBlockHTML(lang, code) {
  return '<pre class="code-block"' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '><code>' + esc(String(code).replace(/\s+$/, '')) + '</code></pre>';
}
function mathToken(store, tex, display) {
  const inner = esc(String(tex).trim());
  store.push(display ? '<span class="math math-d">\\[' + inner + '\\]</span>' : '<span class="math">\\(' + inner + '\\)</span>');
  return RTOK0 + (store.length - 1) + RTOK1;
}
// Pull math spans out of a (code-free) text run so markdown formatting can't mangle the LaTeX.
// Everything is normalized to \(..\) / \[..\] — the only delimiters MathJax is configured for.
function protectMath(t) {
  const store = [];
  let s = String(t == null ? '' : t).replace(/\r\n?/g, '\n');
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, x) => mathToken(store, x, true));
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, x) => mathToken(store, x, true));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, x) => mathToken(store, x, false));
  // bare $...$ only with an unambiguous math signal (\, ^, _, {, }), so "$5 and $10" stays text
  s = s.replace(/\$(?=\S)([^\n$]*?\S)\$/g, (m, x) => /[\\^_{}]/.test(x) ? mathToken(store, x, false) : m);
  return { s, store };
}
function restoreRich(html, store) { return html.replace(RTOK_RE, (_, i) => store[+i] != null ? store[+i] : ''); }
// Segment on fenced code first (code stays literal), then render each text run.
function richSegments(t, renderText) {
  const parts = String(t == null ? '' : t).replace(/\r\n?/g, '\n').split(RICH_FENCE);
  let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) out += renderText(parts[i]);
    if (i + 2 < parts.length) out += codeBlockHTML(parts[i + 1] || '', parts[i + 2] || '');
  }
  return out;
}
// AI answers: full markdown + math + pseudocode.
function mdRich(t) { return richSegments(t, run => { const { s, store } = protectMath(run); return restoreRich(mdLite(s), store); }); }
// Comments: plain prose (no headings/bold) but still render math + code + @mentions.
function commentHTML(t) {
  return richSegments(t, run => {
    const { s, store } = protectMath(run);
    const html = esc(s).replace(/@ai\b/ig, x => `<span class="men">${x}</span>`).replace(/\n/g, '<br>');
    return restoreRich(html, store);
  });
}
// MathJax (tex-svg -> self-contained SVG, no font files) loads on demand, only when an
// answer actually contains math, so users who never see math never pay for the download.
let _mjTypesetT = null;
function ensureMathJax() {
  if (window.MathJax || window.__mjLoading) return;
  window.__mjLoading = true;
  window.MathJax = {
    tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']], processEscapes: false },
    svg: { fontCache: 'global' },
    options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] },
    startup: { typeset: false, ready() { window.MathJax.startup.defaultReady(); typesetMath(); } },
  };
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-svg.min.js';
  s.async = true; s.id = 'mathjax-script';
  s.onerror = () => { window.__mjLoading = false; };
  document.head.appendChild(s);
}
function mathRoots() {
  const r = [];
  const list = document.getElementById('notesList'); if (list && /\\\(|\\\[/.test(list.innerHTML)) r.push(list);
  const exp = document.getElementById('exportRoot'); if (exp && !exp.classList.contains('hidden') && /\\\(|\\\[/.test(exp.innerHTML)) r.push(exp);
  return r;
}
function typesetMath() {
  const roots = mathRoots(); if (!roots.length) return;
  if (!(window.MathJax && window.MathJax.typesetPromise)) { ensureMathJax(); return; }
  try { window.MathJax.typesetClear && window.MathJax.typesetClear(roots); } catch (e) {}
  window.MathJax.typesetPromise(roots).catch(() => {});
}
function scheduleTypeset() {
  if (!mathRoots().length) return;
  ensureMathJax();
  clearTimeout(_mjTypesetT); _mjTypesetT = setTimeout(typesetMath, 120);
}

function render() {
  // notes list
  renumber();
  const list = $('#notesList'); const scrollTop = list.scrollTop;
  const wasAtBottom = (list.scrollHeight - scrollTop - list.clientHeight) < 40; // "stick to bottom" only if already there
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
  $$('[data-edit]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); state.ui.editing = b.dataset.edit; render(); const ta = list.querySelector('.edit-input'); if (ta) { try { ta.focus({ preventScroll: true }); } catch (x) { ta.focus(); } ta.setSelectionRange(ta.value.length, ta.value.length); } });
  $$('[data-canceledit]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); state.ui.editing = null; render(); });
  $$('details[data-disc]', list).forEach(d => d.addEventListener('toggle', () => { state.ui.openDisc = state.ui.openDisc || {}; if (d.open) state.ui.openDisc[d.dataset.disc] = true; else delete state.ui.openDisc[d.dataset.disc]; save(); }));
  $$('[data-savemsg]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); saveMsgEdit(b.dataset.ann, b.dataset.savemsg); });
  $$('[data-reask]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); saveAndReask(b.dataset.ann, b.dataset.reask); });
  $$('[data-collapse]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); collapseNote(b.dataset.collapse); });
  $$('[data-showtog]', list).forEach(b => b.onclick = (e) => { e.stopPropagation(); toggleShowOnCard(b.dataset.ann, b.dataset.showtog); });
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
  if (state.ui.autoscroll && state.ui.activeId) {
    list.scrollTop = scrollTop;
    const _ed = state.ui.editing && list.querySelector('.edit-input');
    if (_ed) { const lb = list.getBoundingClientRect(), eb = _ed.getBoundingClientRect(); list.scrollTop += (eb.top - lb.top) - (lb.height / 2 - eb.height / 2); }
    else if (state.ui.streamingId === state.ui.activeId) {
      // The AI is producing content in this note — follow the newest content at the bottom,
      // but only if the user was already near the bottom (don't yank them while they read).
      if (wasAtBottom) followNoteBottom(state.ui.activeId);
      // Re-anchor once a late-decoding generated image reports its real height (avoids a second jump).
      list.querySelectorAll('.card.sel img').forEach(img => { if (!img.complete) img.addEventListener('load', () => { if (wasAtBottom && state.ui.streamingId === state.ui.activeId) followNoteBottom(state.ui.activeId); }, { once: true }); });
    }
    else scrollNoteIntoView(state.ui.activeId, false);
  }
  else list.scrollTop = scrollTop;
  // restore inline composer draft + focus
  if (draft && box) { const ta = box.querySelector('.tc-input'); ta.value = draft.v; ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; ta.dispatchEvent(new Event('input')); if (draft.focused) { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } ta.setSelectionRange(draft.caret, draft.caret); } }
  scheduleTypeset();
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
  askAI(annId, newText.replace(/@ai\b/ig, '').trim() || newText);
}
function confirmDialog(message, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const m = el('<div class="modal-mask confirm-mask"><div class="confirm-box"><div class="confirm-msg"></div><div class="confirm-acts"><button class="btn ghost" data-cd="0"></button><button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-cd="1"></button></div></div></div>');
    m.querySelector('.confirm-msg').textContent = message;
    m.querySelector('[data-cd="0"]').textContent = opts.cancelLabel || 'Cancel';
    m.querySelector('[data-cd="1"]').textContent = opts.okLabel || 'OK';
    document.getElementById('modalRoot').appendChild(m);
    const done = v => { m.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); done(true); } };
    m.addEventListener('click', e => { if (e.target === m) done(false); });
    m.querySelector('[data-cd="0"]').onclick = () => done(false);
    m.querySelector('[data-cd="1"]').onclick = () => done(true);
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { const ok = m.querySelector('[data-cd="1"]'); if (ok) ok.focus(); }, 30);
  });
}
function deleteMsg(annId, msgId) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  a.messages = a.messages.filter(m => m.id !== msgId); a.updated_at = nowISO(); save(); render();
}
// Toggle whether a message appears on the collapsed card (the "Show on card" checkbox).
function toggleShowOnCard(annId, msgId) {
  const a = state.annotations.find(x => x.id === annId); if (!a) return;
  const m = a.messages.find(x => x.id === msgId); if (!m) return;
  m.showOnCard = !m.showOnCard; a.updated_at = nowISO(); save(); render();
}
async function deleteNote(annId) {
  if (!(await confirmDialog('Delete this note and its thread?', { okLabel: 'Delete', danger: true }))) return;
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
    { label: 'Delete note', onClick: async () => { if (!(await confirmDialog('Delete this note and its thread?', { okLabel: 'Delete', danger: true }))) return; state.annotations = state.annotations.filter(x => x.id !== annId); if (state.ui.activeId === annId) state.ui.activeId = null; save(); render(); drawHighlights(); drawPins(); } },
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
    document: { id: docId, sha256: (d && d.sha) || null, name: d ? d.name : 'document' }, noteCount: anns.length, annotations: anns };
}
// Apply a notes object onto a document. Default REPLACES this doc's notes (explicit Import). With
// { merge:true } it UNIONS by annotation id, newest-wins — used by auto-attach and cross-device
// sync so re-opening the same paper elsewhere combines notes instead of clobbering them.
// ---- import hardening ----
// A shared .notes.json / .annotated.html can come from anyone. Every text field is escaped at its
// render site, and enum fields (source_type, message type, colors) are never interpolated raw into
// HTML — so the ONLY DOM-injection vectors are (a) ids, which land in HTML attributes and CSS
// selectors, and (b) image URLs in <img src>. Neutralize exactly those and PRESERVE every other
// field (edited flags, errors, captions, agent traces, long text, …). We deliberately do NOT rebuild
// from a whitelist: that silently drops legitimate content on a re-opened bundle. Only extreme sizes
// and counts are bounded, as a denial-of-service guard, with limits far above any real document.
const IMP_ID = /^[A-Za-z0-9_-]{1,80}$/;
const impId = (v, p) => (typeof v === 'string' && IMP_ID.test(v)) ? v : uid(p);
const impCap = (o, k, max) => { if (o && typeof o[k] === 'string' && o[k].length > max) o[k] = o[k].slice(0, max); };
// A plain non-negative integer, or the fallback. Rejects strings, NaN, Infinity and huge values.
const impInt = (v, dflt) => { const n = parseInt(v, 10); return (Number.isFinite(n) && n >= 0 && n <= 1e6) ? n : dflt; };
const IMP_TEXT_CAP = 2000000;   // ~2MB per text field — orders of magnitude above any real note/answer
function sanitizeImportedMessage(m) {
  if (!m || typeof m !== 'object') return null;
  let o; try { o = JSON.parse(JSON.stringify(m)); } catch (e) { return null; }   // deep clone; drops non-JSON values
  o.id = impId(o.id, 'm');                                                        // safe in data-* attrs + selectors
  if ('image' in o) o.image = o.image ? (safeImgSrc(o.image) || null) : o.image;  // only a raster/https URL reaches <img src>
  ['text', 'ascii', 'title', 'approximation_note'].forEach(k => impCap(o, k, IMP_TEXT_CAP));
  if (Array.isArray(o.trace)) { o.trace = o.trace.slice(0, 500); o.trace.forEach(s => { impCap(s, 'text', IMP_TEXT_CAP); impCap(s, 'result', IMP_TEXT_CAP); }); }
  if (Array.isArray(o.takeaways)) o.takeaways = o.takeaways.slice(0, 200);
  if (Array.isArray(o.chips)) o.chips = o.chips.slice(0, 60);
  return o;
}
function sanitizeImportedAnnotation(a) {
  if (!a || typeof a !== 'object') return null;
  let o; try { o = JSON.parse(JSON.stringify(a)); } catch (e) { return null; }
  o.id = impId(o.id, 'ann');
  o.thread = impId(o.thread, 'thr');
  // page and anchor are numbers everywhere the app creates them, but they land in HTML text and in a
  // [data-page="…"] selector — so a string here is both a broken selector and an injection vector.
  // Force them to plain integers on the way in; the render sites escape as well (belt and braces).
  o.page = impInt(o.page, 1);
  o.anchor = impInt(o.anchor, 0);
  if ('screenshot' in o) o.screenshot = o.screenshot ? (safeImgSrc(o.screenshot) || null) : o.screenshot;
  ['selected_text', 'section', 'prefix', 'suffix', 'caption'].forEach(k => impCap(o, k, IMP_TEXT_CAP));
  if (Array.isArray(o.rects)) o.rects = o.rects.slice(0, 5000);
  if (Array.isArray(o.messages)) o.messages = o.messages.slice(0, 3000).map(sanitizeImportedMessage).filter(Boolean);
  return o;
}
const sanitizeImportedNotes = (list) => (Array.isArray(list) ? list : []).slice(0, 50000).map(sanitizeImportedAnnotation).filter(Boolean);

function applyNotesJSON(obj, docId, opts) {
  if (!obj || !Array.isArray(obj.annotations)) { toast('That file has no notes to import.', 'err'); return 0; }
  const incoming = sanitizeImportedNotes(obj.annotations).map(a => { a.doc = docId; return a; });
  const others = state.annotations.filter(a => docIdOf(a) !== docId);
  if (opts && opts.merge) {
    const byId = new Map(state.annotations.filter(a => docIdOf(a) === docId).map(a => [a.id, a]));
    const stamp = a => new Date(a.updated_at || a.created_at || 0).getTime() || 0;
    for (const c of incoming) { const cur = byId.get(c.id); if (!cur || stamp(c) >= stamp(cur)) byId.set(c.id, c); }
    state.annotations = others.concat([...byId.values()]);
  } else {
    state.annotations = others.concat(incoming);
  }
  state.ui.activeId = null; if (typeof renumber === 'function') renumber();
  save(); render(); drawHighlights(); drawPins();
  return incoming.length;
}
async function chooseNotesFolder() {
  if (!fsSupported()) { toast('Folder sync needs Chrome or Edge. Use Export / Import notes instead.', 'err'); return false; }
  try {
    const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'srw-notes', startIn: 'documents' });
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
// Look in the chosen notes folder for this PDF's notes: first the "<name>.notes.json" filename
// (fast), then — so a renamed PDF still matches — any .json whose document.sha256 equals the doc's
// content hash. Returns { name, obj } or null.
async function findFolderNotes(dir, docId) {
  const fname = notesFileName(docId);
  try {
    const fh = await dir.getFileHandle(fname, { create: false });
    const obj = JSON.parse(await (await fh.getFile()).text());
    if (obj && Array.isArray(obj.annotations)) return { name: fname, obj };
  } catch (e) {}
  const doc = state.docs.find(x => x.id === docId);
  if (doc && doc.sha) {
    try {
      for await (const h of dir.values()) {
        if (h.kind !== 'file' || !/\.json$/i.test(h.name || '')) continue;
        try {
          const obj = JSON.parse(await (await h.getFile()).text());
          if (obj && obj.document && obj.document.sha256 === doc.sha && Array.isArray(obj.annotations)) return { name: h.name, obj };
        } catch (e) {}
      }
    } catch (e) {}
  }
  return null;
}
// On opening a PDF, if a notes folder is set (Settings → Notes storage), search it for this PDF's
// notes and — only when they'd add something new — pop up asking to open them.
async function maybeOfferFolderNotes(docId, dir) {
  if (storageCfg().mode !== 'folder') return;
  if (!dir) { try { dir = await notesDirHandle(false); } catch (e) {} }
  if (!dir) return;
  let found = null;
  try { found = await findFolderNotes(dir, docId); } catch (e) { return; }
  if (!found) return;
  // Don't nag: skip if every note in the file is already loaded for this document.
  const have = new Set(state.annotations.filter(a => docIdOf(a) === docId).map(a => a.id));
  const fresh = found.obj.annotations.filter(a => a && !have.has(a.id)).length;
  if (!fresh) return;
  if (!(await confirmDialog('Found notes for this PDF in “' + dir.name + '”: ' + found.name + '. Open them?', { okLabel: 'Open notes', cancelLabel: 'Not now' }))) return;
  try { const n = applyNotesJSON(found.obj, docId, { merge: true }); toast(n + ' note' + (n === 1 ? '' : 's') + ' loaded from “' + dir.name + '”.'); }
  catch (e) { toast('Could not read the notes file: ' + (e.message || e), 'err'); }
}
// No notes folder set and the freshly opened PDF has no notes yet: a browser can't peek into its
// folder, so surface a slim, non-blocking banner to pick the .notes.json by hand. Once per document.
function maybeOfferNotesFallback(docId) {
  const doc = state.docs.find(d => d.id === docId); if (!doc) return;
  if (doc.notesAsked) return;                                        // already asked — don't nag
  if (state.annotations.some(a => docIdOf(a) === docId)) return;     // already has notes
  doc.notesAsked = true; save();                                     // mark asked, whether or not they proceed
  showNotesBanner(docId, doc.name);
}
// A dismissible announcement strip across the top of the reader — click to add notes, or ✕ to close.
// Non-blocking: no backdrop, the page stays fully usable underneath.
function showNotesBanner(docId, name) {
  const old = document.getElementById('notesBanner'); if (old) old.remove();
  const b = el('<div id="notesBanner" class="top-banner" role="status">'
    + '<span class="tb-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h8l6 6v14H6z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg></span>'
    + '<span class="tb-msg">Have notes for <b>' + esc(name) + '</b>? Open its <b>.notes.json</b> to load them.</span>'
    + '<button class="tb-act" id="tbOpen">Open notes file…</button>'
    + '<button class="tb-x" id="tbClose" aria-label="Dismiss">✕</button></div>');
  document.body.appendChild(b);
  b.querySelector('#tbOpen').onclick = () => { b.remove(); restackBanners(); openNotesFileFor(docId); };  // direct click keeps the file-picker gesture
  b.querySelector('#tbClose').onclick = () => { b.remove(); restackBanners(); };
  requestAnimationFrame(() => { b.classList.add('show'); restackBanners(); });
}
// Pick a .notes.json and merge it into the given document (with a nudge if it was saved for another PDF).
function openNotesFileFor(docId) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const doc = state.docs.find(d => d.id === docId);
      const sha = obj.document && obj.document.sha256;
      if (sha && doc && doc.sha && sha !== doc.sha && !(await confirmDialog('“' + f.name + '” was saved for a different PDF. Attach it to “' + doc.name + '” anyway?', { okLabel: 'Attach', cancelLabel: 'Cancel' }))) return;
      const n = applyNotesJSON(obj, docId, { merge: true });
      toast(n + ' note' + (n === 1 ? '' : 's') + ' loaded.');
    } catch (e) { toast('Could not read that JSON: ' + (e.message || e), 'err'); }
  };
  inp.click();
}
let _folderSyncT;
function scheduleFolderSync() {
  if (storageCfg().mode !== 'folder') return;
  clearTimeout(_folderSyncT);
  _folderSyncT = setTimeout(() => { writeNotesToFolder(state.ui.activeDoc, false); }, 1500);
}
// One-time tip for browsers without the File System Access API (Firefox, Safari, and any other
// non-Chromium browser): explain that a web page can't open a "Save As" dialog there, and point at
// the browser setting that makes downloads prompt for a location. Gated on feature detection — never
// shown where showSaveFilePicker exists (Chrome/Edge get the real dialog) — and never twice per device.
function maybeShowSaveAsTip() {
  if (READONLY || 'showSaveFilePicker' in window) return;
  try { if (localStorage.getItem('srw_saveas_tip') === '1') return; } catch (e) { return; }
  const ua = navigator.userAgent || '';
  const isFirefox = /firefox|fxios/i.test(ua);
  const isSafari = !isFirefox && /safari/i.test(ua) && !/chrome|chromium|crios|edg|edgios|android|opr\//i.test(ua);
  const browser = isFirefox ? 'Firefox' : isSafari ? 'Safari' : 'your browser';
  const cfg = isFirefox
    ? { steps: ['Open <b>Settings → General</b>', 'Scroll to <b>Files and Applications</b>'], setting: 'Always ask you where to save files', control: 'toggle' }
    : isSafari
      ? { steps: ['Open <b>Settings → General</b>', 'Find <b>File download location</b>'], setting: 'Ask for each download', control: 'check' }
      : { steps: ['Open your browser’s <b>download settings</b>'], setting: 'Always ask where to save files', control: 'toggle' };
  // A numbered stepper: indigo badges joined by a connector line, ending in a mock of the exact
  // control to flip (a toggle for Firefox / a selected option ✓ for Safari) so it's recognizable.
  const BADGE = 'position:relative;flex:0 0 27px;height:27px;border-radius:50%;background:#4F46E5;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center';
  const LINE = 'position:absolute;left:12.5px;top:27px;bottom:-3px;width:2px;background:var(--line,#E5E7EB)';
  const step = (n, html, withLine) => `<div style="position:relative;display:flex;gap:14px;align-items:flex-start;padding-bottom:16px">${withLine ? `<div style="${LINE}"></div>` : ''}<div style="${BADGE}">${n}</div><div style="flex:1;padding-top:4px;font-size:14px;color:var(--text,#111827);line-height:1.45">${html}</div></div>`;
  const control = cfg.control === 'toggle'
    ? '<span style="flex:0 0 auto;width:40px;height:23px;border-radius:999px;background:#4F46E5;position:relative;display:inline-block"><span style="position:absolute;top:2px;right:2px;width:19px;height:19px;border-radius:50%;background:#fff"></span></span>'
    : '<span style="flex:0 0 auto;color:#4F46E5;font-weight:800;font-size:18px;line-height:1">✓</span>';
  const settingBox = `<div style="display:flex;align-items:center;gap:12px;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:11px;padding:11px 13px"><span style="flex:1;font-weight:700;font-size:14px;color:#312E81">${cfg.setting}</span>${control}</div>`;
  const stepsHTML = cfg.steps.map((s, i) => step(i + 1, s, true)).join('')
    + `<div style="position:relative;display:flex;gap:14px;align-items:flex-start"><div style="${BADGE}">${cfg.steps.length + 1}</div><div style="flex:1"><div style="font-size:14px;color:var(--text,#111827);margin:4px 0 8px">Turn on:</div>${settingBox}</div></div>`;
  const m = el(`<div class="modal-mask"><div class="confirm-box" style="max-width:470px;text-align:left">
    <div style="font-weight:800;font-size:17px;color:var(--text,#111827)">Choose where your files save</div>
    <div style="font-size:13.5px;color:var(--muted,#6B7280);margin:7px 0 20px;line-height:1.5">In <b>${browser}</b>, turn on one setting to pick where each download goes — and overwrite instead of piling up “(1)” copies.</div>
    ${stepsHTML}
    <div class="confirm-acts" style="margin-top:22px;justify-content:flex-end"><button class="btn primary" data-ok>Got it</button></div>
  </div></div>`);
  document.getElementById('modalRoot').appendChild(m);
  const done = () => { m.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); done(); } };
  m.addEventListener('click', e => { if (e.target === m) done(); });
  m.querySelector('[data-ok]').onclick = done;
  document.addEventListener('keydown', onKey, true);
  try { localStorage.setItem('srw_saveas_tip', '1'); } catch (e) {}
}
// Native "Save As" (Chrome/Edge): pop the OS save dialog so the user picks the location + filename,
// overwriting in place if they choose an existing file (no browser "(1)" duplication). A FRESH dialog
// every call — we deliberately remember NO handle, so there's no silent re-save and no cross-visit
// "allow on every visit" permission prompt; the only dialog is the picker the user asked for. `id`
// just makes the dialog re-open in the last place they saved to (a convenience, not a grant).
// Returns { status:'saved'|'cancelled'|'fallback', name? }; 'fallback' → the caller should download.
async function saveAsFile(suggestedName, contents, accept) {
  if (typeof window === 'undefined' || !('showSaveFilePicker' in window)) { maybeShowSaveAsTip(); return { status: 'fallback' }; }
  let handle;
  try {
    handle = await window.showSaveFilePicker({
      id: 'srw-save', startIn: 'documents', suggestedName,
      types: accept ? [{ description: accept.desc, accept: accept.map }] : undefined,
    });
  } catch (e) {
    return { status: (e && e.name === 'AbortError') ? 'cancelled' : 'fallback' };   // user backed out → save nothing
  }
  try {
    const w = await handle.createWritable();
    await w.write(contents);
    await w.close();
    return { status: 'saved', name: handle.name || suggestedName };
  } catch (e) {
    toast('Couldn’t write there: ' + (e && e.message || e) + ' — downloading a copy instead.', 'err');
    return { status: 'fallback' };
  }
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
// Notes for the self-contained export: like docNotesJSON, but with any images that were offloaded
// to IndexedDB ("@idb") re-inlined as data URLs, so the shared file is truly standalone.
async function notesJSONForExport(docId) {
  const j = docNotesJSON(docId);
  for (const a of j.annotations) {
    if (a.screenshot === '@idb') a.screenshot = await idbGet('shot:' + a.id);
    for (const m of (a.messages || [])) if (m.image === '@idb') m.image = await idbGet('img:' + m.id);
  }
  return j;
}
/* ---------- single-file annotated-paper sharing ----------
   Export the active document + its notes as ONE self-contained .html: the live app shell with
   PDF.js, styles, and app code inlined, plus the PDF bytes and notes
   embedded as a read-only "bundle". Opens anywhere with no server — a portable annotated paper
   with working math, connectors, highlights, and captured figures. */
async function exportSelfContainedHTML(docId) {
  docId = docId || state.ui.activeDoc;
  const doc = state.docs.find(d => d.id === docId) || activeDoc();
  toast('Building shareable file…');
  try {
    const bytes = await loadDocBytes(docId);
    if (!bytes) { toast('Could not read the PDF for this document.', 'err'); return; }
    const [shell, css, pdfjs, worker, appjs] = await Promise.all([
      fetch('/app.html').then(r => r.text()),
      fetch('/src/styles.css').then(r => r.text()),
      fetch('/vendor/pdf.min.js').then(r => r.text()),
      fetch('/vendor/pdf.worker.b64.js').then(r => r.text()),
      fetch('/src/app.js').then(r => r.text()),
    ]);
    const notes = await notesJSONForExport(docId);
    const bundle = { readOnly: true, name: doc.name, sha: doc.sha || null, pdfB64: bytesToB64(bytes), notes };
    // Escaping every "<" in the bundle as < keeps note text that happens to contain a script
    // close-tag from ending the inline block early (JSON.parse reads < back as "<").
    const bundleJson = JSON.stringify(bundle).replace(/</g, '\\u003c');
    // Same hazard for the inlined code: neutralize any literal close-tag so the HTML parser can't
    // see it. "<\/script>" is byte-identical JS (a backslash before "/" is just "/") but invisible
    // to the parser. (Needed because the embedded notes and PDF bytes can contain that sequence.)
    const inlineJs = s => s.replace(/<\/script/gi, '<\\/script');
    let html = shell;
    // Use function replacements so "$" in the inlined code/base64 is inserted verbatim (a plain
    // string replacement would treat "$&", "$1", etc. as substitution patterns and corrupt the code).
    const put = (re, out) => { html = html.replace(re, () => out); };
    put(/<link\b[^>]*href="\/src\/styles\.css"[^>]*>/, '<style>\n' + css + '\n</style>');
    put(/<script src="\/vendor\/pdf\.min\.js"><\/script>/, '<script>\n' + inlineJs(pdfjs) + '\n</script>');
    put(/<script src="\/vendor\/pdf\.worker\.b64\.js"><\/script>/, '<script>\n' + worker + '\n</script>');
    put(/<script src="\/assets\/sample-pdf\.js"><\/script>\s*/, '');       // drop the bundled sample; the doc travels in the bundle
    put(/<script src="\/assets\/sample-notes\.js"><\/script>\s*/, '');
    put(/<script src="\/src\/app\.js"><\/script>/, '<script>window.__PAIR_BUNDLE__=' + bundleJson + ';</script>\n<script>\n' + inlineJs(appjs) + '\n</script>');
    put(/<script>window\.va=[\s\S]*?<\/script>\s*/, '');                    // strip analytics — a shared file must not phone home
    put(/<script defer src="\/_vercel\/insights\/script\.js"><\/script>\s*/, '');
    const base = (doc.name || 'paper').replace(/\.pdf$/i, '').replace(/[^\w.\- ]+/g, '_').trim() || 'paper';
    const fname = base + '.annotated.html';
    const sizeMB = (html.length / 1048576).toFixed(1);
    // Save As so the user chooses where the shared file lands; fall back to a download where unsupported.
    const r = await saveAsFile(fname, html, { desc: 'Annotated paper (HTML)', map: { 'text/html': ['.html'] } });
    if (r.status === 'saved') { toast('Saved ' + r.name + ' — ' + sizeMB + ' MB, opens anywhere.'); return; }
    if (r.status === 'cancelled') return;                     // dialog dismissed → export nothing
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Exported ' + fname + ' — ' + sizeMB + ' MB, opens anywhere.');
  } catch (e) { toast('Could not build the file: ' + (e && e.message || e), 'err'); }
}
function flashSaved() { const b = document.getElementById('btnSaveNotes'); if (b) { b.classList.add('saved'); setTimeout(() => b.classList.remove('saved'), 1400); } }
// Save button. If a sync folder is set (Settings → Storage) it silently overwrites there; otherwise
// it pops a Save As dialog so the user chooses where — and can overwrite in place instead of piling
// up "(1)" copies. Nothing is remembered, so it never silently re-saves or re-prompts. Browsers
// without showSaveFilePicker fall back to a plain download.
async function saveNotesNow() {
  if (storageCfg().mode === 'folder' && await writeNotesToFolder(state.ui.activeDoc, true)) {
    toast('Saved to “' + storageCfg().folderName + '”.'); flashSaved(); return;
  }
  const r = await saveAsFile(notesFileName(state.ui.activeDoc),
    JSON.stringify(docNotesJSON(state.ui.activeDoc), null, 2),
    { desc: 'Notes JSON', map: { 'application/json': ['.json'] } });
  if (r.status === 'saved') { toast('Saved ' + r.name + '.'); flashSaved(); return; }
  if (r.status === 'cancelled') return;                       // dialog dismissed → save nothing
  downloadNotesJSON(state.ui.activeDoc); flashSaved();
}
function injectNotesButtons() {
  const fb = document.getElementById('btnFilter'); if (!fb) return;
  // Retire the reader-toolbar "⋯" and the notes "⋮" menu — everything is a labelled button now.
  ['btnExportTop', 'btnNotesMenu'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
  const mk = (id, before, title, svg, on) => { if (!before || document.getElementById(id)) return; const b = el('<button class="icon-btn" id="' + id + '" title="' + title + '">' + svg + '</button>'); before.parentNode.insertBefore(b, before); b.onclick = on; };
  const SAVE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7"/><path d="M8 13h8v6H8z"/></svg>';
  const IMPORT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/></svg>';
  const PDF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h8l6 6v14H6z"/><path d="M14 2v6h6"/><rect x="5" y="12.5" width="14" height="7" rx="1.5" fill="currentColor" stroke="none"/><text x="12" y="18" font-size="5.4" font-weight="700" text-anchor="middle" fill="#fff" stroke="none" font-family="Arial,Helvetica,sans-serif">PDF</text></svg>';
  const TRASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  // (Share-as-HTML now lives on the left sidebar, next to New — see #btnShareHtml wiring in wire().)
  mk('btnSaveNotes', fb, 'Save notes (JSON; auto-saves to your folder when one is set)', SAVE, () => saveNotesNow());
  mk('btnImportNotes', fb, 'Import notes from a JSON file', IMPORT, () => importNotesJSON());
  mk('btnExportPdf', fb, 'Export annotations to PDF', PDF, () => openExport());
  const cr = document.getElementById('btnCollapseRight');
  mk('btnClearNotes', cr || fb, 'Delete all notes for this document', TRASH, () => clearActiveNotes());
}
async function clearActiveNotes() {
  const n = state.annotations.filter(inActiveDoc).length;
  if (!n) { toast('No notes to delete for this document.'); return; }
  if (!(await confirmDialog('Delete all ' + n + ' note' + (n === 1 ? '' : 's') + ' for “' + activeDoc().name + '”? This cannot be undone.', { okLabel: 'Delete all', danger: true }))) return;
  state.annotations = state.annotations.filter(a => !inActiveDoc(a));
  state.ui.activeId = null; save(); render(); drawHighlights(); drawPins();
  toast('Deleted all notes for this document.');
}

/* ---------- settings modal ---------- */
/* ---------- editable prompt templates (Settings → Templates) ----------
   The prompts below are the app's built-in defaults. A user can override any of them in
   Settings → Templates (stored in state.settings.prompts) and export/import the set as JSON.
   Only the WORDING is user-owned — the dynamic per-request context (selection, question,
   page info) and the tool wiring are always supplied by the app, so overrides can restyle
   the assistant without breaking how it works. */
const DEFAULT_PROMPTS = {
  text: `You are a precise reading assistant embedded in a source-linked research workspace. You answer questions about the SELECTED SOURCE and its surrounding context from the document the reader is viewing.
When tools are available (reading other pages, searching the document, searching the web, or generating a visual), use them only as needed to gather the smallest sufficient context, then answer.
Answer style — this matters:
- Lead with the direct answer in the first sentence. No preamble, no restating the question, no throat-clearing ("Great question", "Sure!", "Based on the provided context…").
- Be brief: 1–3 sentences, or a tight bullet list for multi-part answers. Add length only when the question truly needs it.
- Plain, concrete language. No filler, no hedging, no summary of what you just said.
- Ground claims in the reader's document; prefer it over generic knowledge. If the context is insufficient, say in one line exactly what's missing.
- Use Markdown. Write mathematics in LaTeX — \\( … \\) for inline and \\[ … \\] for display — so it renders cleanly.`,
  image: `You turn a reader's request into the most useful visual. Choose the FORMAT ("ascii" = monospace text diagram built only from the document; "image" = an AI-rendered picture) using this PRIORITY ORDER:
1) If the request depicts the paper's RESULTS, findings, data, numbers, statistics, a table, comparisons, equations, or a "summary of results" → "ascii". This wins EVEN IF the reader wrote "image" or "picture" (an image would fabricate the specifics). Example: "create an image of the main results" → ascii.
2) Else if the reader says diagram / flowchart / schematic / chart / pipeline / tree / table → "ascii".
3) Else if the reader asks to illustrate / draw / sketch / picture a phenomenon, physical scene, mechanism, object, analogy, or concept → "image". Examples: "illustrate eddies breaking into smaller eddies" → image; "draw the experimental setup" → image; "picture of a hairpin vortex" → image.
4) If ambiguous → "ascii".
For "ascii" build a faithful monospace diagram from the document (never invent numbers). For "image" write a vivid image_prompt.
Return STRICT JSON only. Put the heavy field ("ascii" or "image_prompt") FIRST so it survives if the response is cut off: {"format":"ascii"|"image","ascii":"<monospace diagram, <=24 lines, only if ascii>","image_prompt":"<detailed prompt, only if image>","title":"<=6 words","takeaways":["2-4 short bullets grounded in the doc"],"caption":"one line"}`,
  diagram: `Return ONLY a faithful monospace/ASCII diagram (max 24 lines) built strictly from the document context below. No prose, no explanation, no JSON, no code fences.`,
  web: `Search the web and answer concisely with source links.`,
  router: `You are a fast intent router for a source-linked PDF reading app. The reader typed a message on a note. Decide what should happen with it.
Return STRICT JSON only, no prose: {"intent":"answer"|"visual"|"note","visual_type":"image"|"diagram","tags":["..."]}
The core test: does the message ASK the AI to answer or do something? If yes → "answer" (or "visual"). If the reader is just reacting, observing, or jotting a note for themselves → "note".
- "answer": the message asks the assistant for something — a question, or an instruction/request directed at the AI (explain, summarize, define, compute, compare, "what/why/how", "tell me…"). Only when the reader actually wants a response. If it's genuinely ambiguous between a terse question and a request, prefer "answer".
- "visual": the reader wants a picture or diagram GENERATED (make/draw/sketch/illustrate/render an image, "as a diagram/chart/flowchart", "make it hand-drawn", "redraw this", etc.). Set visual_type: "image" for a rendered picture / illustration / scene / photo / artistic or hand-drawn look; "diagram" for structure / process / flow / comparison / data best shown as a labeled monospace diagram (also use "diagram" when the request is about the paper's specific results or numbers, which a generated image would fabricate).
- "note": the reader is writing for THEMSELVES, not asking the AI — a reaction, observation, opinion, highlight, or reminder. This is the DEFAULT for any bare comment on the content with no question and no request to the AI. Examples: "interesting", "cool", "important", "nice", "hmm", "wow", "agree", "not sure about this", "revisit", "reread this", "my take: …", "todo: check ref 12". A single word or short phrase reacting to the selection is almost always a "note", NOT a question.
tags: 0–2 short labels (e.g. "Question", "Observation", "Claim", "Definition", "Confusion", "Action item", "Summary"). Use [] if none is clear.`,
};
const PROMPT_KEYS = ['text', 'image', 'diagram', 'web', 'router'];
const PROMPT_META = {
  text: { label: 'Text answers', desc: 'The system prompt used for every text answer, whatever model you pick — set the assistant’s voice and answer style here.' },
  image: { label: 'Images & diagrams', desc: 'Decides whether a request becomes a diagram or an image, and how. The strict-JSON output contract is always enforced automatically, so you can safely reword the guidance.' },
  diagram: { label: 'Diagram (text fallback)', desc: 'Redraws a monospace/ASCII diagram when the visual planner returns an empty one.' },
  web: { label: 'Web search', desc: 'System prompt for the web-search tool (used when “Allow external web search” is on).' },
  router: { label: 'Intent router', desc: 'A fast, cheap first-pass model decides whether a note message is a question for the AI, a request for a visual (image vs diagram), or a personal note — replacing the old keyword heuristics. Typing @ai always routes to the AI regardless.' },
};
function promptFor(key) {
  const o = state.settings && state.settings.prompts;
  const v = o && o[key];
  return (v && String(v).trim()) ? String(v) : (DEFAULT_PROMPTS[key] || '');
}
/* ---- ReAct tool descriptions (the tool-using agent reads these to decide when to call each tool) ---- */
const TOOL_KEYS = ['read_selection_context', 'read_page', 'search_document', 'document_outline', 'read_full_document', 'create_visual', 'web_search'];
const DEFAULT_TOOLS = {
  read_selection_context: "Re-read the reader's highlighted selection plus the text immediately around it on its page.",
  read_page: 'Read the full text of a specific page (use for the previous/next section or a referenced page).',
  search_document: 'Keyword-search the whole document; returns matching snippets with page numbers.',
  document_outline: 'List detected section headings with their page numbers to navigate the paper.',
  read_full_document: 'Read the entire document text (use for whole-paper summaries; may be truncated if very long).',
  create_visual: 'Generate a visual to help answer: an AI-rendered image (for illustrations, physical scenes, mechanisms, or concepts) or a monospace diagram built from the document (for structure, process, data, or comparisons). Call this when a picture or diagram would materially help — e.g. the reader asks to see, draw, illustrate, or visualize something. Provide a clear description of what to depict.',
  web_search: 'Search the public web for facts beyond this document. Returns text with source links.',
};
const TOOL_META = {
  read_selection_context: 'read_selection_context', read_page: 'read_page', search_document: 'search_document',
  document_outline: 'document_outline', read_full_document: 'read_full_document', create_visual: 'create_visual', web_search: 'web_search',
};
function toolDesc(name) {
  const t = state.settings && state.settings.prompts && state.settings.prompts.tools;
  const v = t && t[name];
  return (v && String(v).trim()) ? String(v) : (DEFAULT_TOOLS[name] || '');
}
// One collapsible editor row (title shown; expand to view/edit). id is a prompt key or "tool_<name>".
function ptItemHTML(id, label, value, def, desc) {
  const overridden = value != null && String(value).trim() && String(value) !== def;
  return `<details class="pt-item" data-pt="${id}"><summary><span class="pt-cx">▸</span><span class="pt-title">${esc(label)}</span>${overridden ? '<span class="pt-badge">customized</span>' : ''}</summary>
    <div class="pt-body"><div class="pt-actions-row"><button type="button" class="pt-reset" data-reset="${id}">Reset to default</button></div>
    <textarea id="pt_${id}" spellcheck="false">${esc(value)}</textarea>
    <div class="hint">${esc(desc)}</div></div></details>`;
}
function templatesPaneHTML() {
  const prompts = PROMPT_KEYS.map(k => ptItemHTML(k, (PROMPT_META[k] || {}).label || k, promptFor(k), DEFAULT_PROMPTS[k], (PROMPT_META[k] || {}).desc || '')).join('');
  const tools = TOOL_KEYS.map(k => ptItemHTML('tool_' + k, (TOOL_META[k] || k), toolDesc(k), DEFAULT_TOOLS[k], 'What the tool-using agent reads to decide when to call this tool. Only used while the tool-using agent runs.')).join('');
  return `<div class="hint" style="margin:-2px 0 14px">Make the assistant your own — expand any prompt below to view or edit it. The per-request context (your selection, question, and page) is always added by the app, so restyling here won’t break how answers are built. Changes apply after you press <b>Save</b>.</div>
    <div class="pt-actions"><button type="button" class="btn ghost" id="ptExport">Export (JSON)</button><button type="button" class="btn ghost" id="ptImport">Import (JSON)</button><button type="button" class="btn ghost" id="ptResetAll">Reset all to default</button></div>
    <div class="pt-sec">System prompts</div>
    ${prompts}
    <div class="pt-sec">Agent tools · ReAct — how the tool-using agent decides when to call each tool</div>
    ${tools}`;
}
function collectPrompts(m) {
  const out = {}; const tools = {};
  PROMPT_KEYS.forEach(k => { const ta = document.getElementById('pt_' + k); if (ta && ta.value.trim() && ta.value !== DEFAULT_PROMPTS[k]) out[k] = ta.value; });
  TOOL_KEYS.forEach(k => { const ta = document.getElementById('pt_tool_' + k); if (ta && ta.value.trim() && ta.value !== DEFAULT_TOOLS[k]) tools[k] = ta.value; });
  if (Object.keys(tools).length) out.tools = tools;
  return out;
}
function exportPrompts(m) {
  try {
    const data = { app: 'Source-Linked AI Reading Workspace', kind: 'prompt-templates', schema: 2, exportedAt: nowISO(), prompts: {}, tools: {} };
    PROMPT_KEYS.forEach(k => { const ta = document.getElementById('pt_' + k); data.prompts[k] = ta ? ta.value : promptFor(k); });
    TOOL_KEYS.forEach(k => { const ta = document.getElementById('pt_tool_' + k); data.tools[k] = ta ? ta.value : toolDesc(k); });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'reading-workspace-prompts.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Exported prompt templates.');
  } catch (e) { toast('Could not export prompts: ' + (e.message || e), 'err'); }
}
function importPrompts(m) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const p = (obj && obj.prompts) || obj || {}; const tls = (obj && obj.tools) || (p && p.tools) || {}; let n = 0;
      PROMPT_KEYS.forEach(k => { if (typeof p[k] === 'string') { const ta = document.getElementById('pt_' + k); if (ta) { ta.value = p[k]; n++; } } });
      TOOL_KEYS.forEach(k => { if (tls && typeof tls[k] === 'string') { const ta = document.getElementById('pt_tool_' + k); if (ta) { ta.value = tls[k]; n++; } } });
      toast(n ? n + ' prompt' + (n === 1 ? '' : 's') + ' imported — review and press Save.' : 'No matching prompts in that file.', n ? '' : 'err');
    } catch (e) { toast('Could not read that JSON: ' + (e.message || e), 'err'); }
  };
  inp.click();
}
function openSettings(note) {
  const s = state.settings;
  const m = el(`<div class="modal-mask"><div class="modal">
    <h3>Settings <span class="icon-btn" id="mClose">✕</span></h3>
    <div class="body">
      <div class="settabs"><button type="button" class="settab on" data-tab="ai">AI &amp; Tools</button><button type="button" class="settab" data-tab="templates">Templates</button><button type="button" class="settab" data-tab="storage">Storage</button></div>
      <div class="tabpane" data-pane="ai">
      ${note ? `<div class="field"><div class="set-note">${esc(note)}</div></div>` : ''}
      <p class="set-lead">AI runs through a <b>shared key</b> so you can try it instantly, on a <b>small test quota</b>. Add your own key below for real use — it stays in this browser and is never saved on our servers.</p>

      <div class="provider ${s.provider === 'openrouter' ? 'on' : ''}">
        <div class="provider__hd">
          <div class="provider__name">OpenRouter <span class="provider__rec">recommended</span></div>
          <button type="button" class="def-radio ${s.provider === 'openrouter' ? 'on' : ''}" data-def="openrouter"><span class="rdot"></span>Default</button>
        </div>
        <p class="provider__desc">Text, images, and the tool-using agent.</p>
        <div class="field"><label for="kOpenrouter">API key</label>
          <input id="kOpenrouter" type="password" placeholder="sk-or-…  (optional — the server key is used by default)" value="${esc(s.keys.openrouter || '')}"></div>
        <div class="modelgrid">
          <div class="field"><label for="mOpenrouter">Text model</label><input id="mOpenrouter" value="${esc((s.models && s.models.openrouter) || '')}"></div>
          <div class="field"><label for="mOpenrouterImg">Image model</label><input id="mOpenrouterImg" value="${esc((s.models && s.models.openrouterImage) || '')}"></div>
          <div class="field"><label for="mOpenrouterRouter">Router model <span class="lbl-note">fast &amp; cheap</span></label><input id="mOpenrouterRouter" value="${esc((s.models && s.models.openrouterRouter) || '')}"></div>
        </div>
      </div>

      <div class="provider ${s.provider === 'compat' ? 'on' : ''}">
        <div class="provider__hd">
          <div class="provider__name">OpenAI-compatible API</div>
          <button type="button" class="def-radio ${s.provider === 'compat' ? 'on' : ''}" data-def="compat"><span class="rdot"></span>Default</button>
        </div>
        <p class="provider__desc">Any OpenAI-compatible endpoint — OpenAI, Together, Groq, or a local model.</p>
        <div class="field"><label for="cBase">Base URL</label>
          <input id="cBase" placeholder="https://api.openai.com/v1" value="${esc(s.compatBaseUrl || '')}"></div>
        <div class="field"><label for="kCompat">API key</label>
          <input id="kCompat" type="password" placeholder="sk-…" value="${esc((s.keys && s.keys.compat) || '')}"></div>
        <div class="modelgrid">
          <div class="field"><label for="mCompat">Text model</label><input id="mCompat" value="${esc((s.models && s.models.compat) || '')}"></div>
          <div class="field"><label for="mCompatImg">Image model</label><input id="mCompatImg" value="${esc((s.models && s.models.compatImage) || '')}"></div>
          <div class="field"><label for="mCompatRouter">Router model <span class="lbl-note">fast &amp; cheap</span></label><input id="mCompatRouter" value="${esc((s.models && s.models.compatRouter) || '')}"></div>
        </div>
      </div>

      <p class="set-foot">Mark a provider as <b>Default</b>, or type <b>@ai</b> in a note to pick one per question.</p>

      <div class="field"><label>Your identity (actor)</label>
        <div style="display:flex;gap:8px"><input id="actorName" placeholder="Your name" value="${esc(s.actorName)}" style="flex:1"><input id="actorInit" placeholder="IN" maxlength="2" value="${esc(s.actorInitials)}" style="width:70px;text-transform:uppercase"></div></div>
      <div class="field"><label>Tools</label>
        <div class="chk"><div class="sw ${s.enableVisuals ? 'on' : ''}" id="tgVis"><i></i></div> Enable generated visuals</div>
        <div class="chk"><div class="sw ${s.enableWeb ? 'on' : ''}" id="tgWeb"><i></i></div> Allow external web search (changes provenance to “Used web search”)</div>
      </div>
      <div class="hint">Your own key (if entered) is stored only in this browser and sent per‑request to the site's <code>/api/ai</code> proxy as an override; otherwise the server's key is used and never exposed to the browser.</div>
      </div>
      <div class="tabpane hidden" data-pane="templates">${templatesPaneHTML()}</div>
      <div class="tabpane hidden" data-pane="storage">
        <div class="field"><label>Notes storage</label>
        <div class="hint" style="margin-top:0">Notes are always saved in this browser. Optionally sync a portable <b>.notes.json</b> to a folder (Chrome/Edge) — great for backups, other devices, and Google Drive. Export / Import works in any browser.</div>
        ${(s.storage && s.storage.mode === 'folder')
          ? `<div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">
               <span style="font-size:13px;color:var(--text)">Notes sync to <b>📁 ${esc(s.storage.folderName || 'your folder')}</b></span>
               <button type="button" class="btn-link" id="stChange">Change folder</button>
               <button type="button" class="btn-link" id="stDisconnect">Turn off</button>
             </div>`
          : `<div style="margin-top:12px"><button type="button" class="btn ghost" id="stFolder">Choose folder…</button></div>`}
        <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
          <button type="button" class="btn ghost" id="stExport">Export notes (JSON)</button>
          <button type="button" class="btn ghost" id="stImport">Import notes (JSON)</button>
        </div>
        </div>
      </div>
    </div>
    <div class="foot"><button class="btn ghost" id="mCancel">Close</button><button class="btn primary" id="mSave">Save</button></div>
  </div></div>`);
  $('#modalRoot').appendChild(m);
  const close = () => m.remove();
  $('#mClose', m).onclick = close; $('#mCancel', m).onclick = close;
  m.addEventListener('click', e => { if (e.target === m) close(); });
  $$('.def-radio', m).forEach(b => b.onclick = () => { $$('.def-radio', m).forEach(x => x.classList.remove('on')); b.classList.add('on'); });
  ['tgVis', 'tgWeb'].forEach(id => $('#' + id, m).onclick = () => $('#' + id, m).classList.toggle('on'));
  $$('.settab', m).forEach(t => t.onclick = () => { $$('.settab', m).forEach(x => x.classList.toggle('on', x === t)); $$('.tabpane', m).forEach(p => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab)); });
  $$('[data-reset]', m).forEach(b => b.onclick = () => { const key = b.dataset.reset; const ta = $('#pt_' + key, m); if (ta) ta.value = key.indexOf('tool_') === 0 ? DEFAULT_TOOLS[key.slice(5)] : DEFAULT_PROMPTS[key]; });
  { const pe = $('#ptExport', m); if (pe) pe.onclick = () => exportPrompts(m); const pi = $('#ptImport', m); if (pi) pi.onclick = () => importPrompts(m); const pr = $('#ptResetAll', m); if (pr) pr.onclick = () => { PROMPT_KEYS.forEach(k => { const ta = $('#pt_' + k, m); if (ta) ta.value = DEFAULT_PROMPTS[k]; }); TOOL_KEYS.forEach(k => { const ta = $('#pt_tool_' + k, m); if (ta) ta.value = DEFAULT_TOOLS[k]; }); }; }
  { const pick = async () => { if (await chooseNotesFolder()) close(); };
    const stF = $('#stFolder', m); if (stF) stF.onclick = pick;
    const stC = $('#stChange', m); if (stC) stC.onclick = pick; }
  { const stE = $('#stExport', m); if (stE) stE.onclick = () => downloadNotesJSON(state.ui.activeDoc); }
  { const stI = $('#stImport', m); if (stI) stI.onclick = () => importNotesJSON(); }
  { const stD = $('#stDisconnect', m); if (stD) stD.onclick = () => { state.settings.storage = { mode: 'browser', folderName: '' }; save(); close(); toast('Folder sync off — notes stay in this browser.'); }; }
  $('#mSave', m).onclick = () => {
    const defEl = $('.def-radio.on', m); if (defEl) s.provider = defEl.dataset.def;
    s.keys.openrouter = $('#kOpenrouter', m).value.trim();
    s.keys.compat = $('#kCompat', m).value.trim();
    s.compatBaseUrl = $('#cBase', m).value.trim();
    s.models.openrouter = $('#mOpenrouter', m).value.trim() || DEFAULT_MODELS.openrouter;
    s.models.openrouterImage = $('#mOpenrouterImg', m).value.trim() || DEFAULT_MODELS.openrouterImage;
    s.models.compat = $('#mCompat', m).value.trim() || DEFAULT_MODELS.compat;
    s.models.compatImage = $('#mCompatImg', m).value.trim() || DEFAULT_MODELS.compatImage;
    s.models.openrouterRouter = $('#mOpenrouterRouter', m).value.trim() || DEFAULT_MODELS.openrouterRouter;
    s.models.compatRouter = $('#mCompatRouter', m).value.trim() || DEFAULT_MODELS.compatRouter;
    s.actorName = $('#actorName', m).value.trim() || 'You';
    s.actorInitials = ($('#actorInit', m).value.trim() || 'YO').toUpperCase().slice(0, 2);
    ACTORS.you.name = s.actorName; ACTORS.you.initials = s.actorInitials;
    s.enableVisuals = $('#tgVis', m).classList.contains('on');
    s.enableWeb = $('#tgWeb', m).classList.contains('on');
    s.prompts = collectPrompts(m);
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
    if (hasShot && inc.screenshots && a.screenshot) left.push(`<div class="ex-sub">Screenshot</div><div class="ex-shot"><img src="${safeImgSrc(a.screenshot)}"></div>`);
    if (!hasShot && inc.linked && a.selected_text) left.push(`<div class="ex-sub">${a.hlColor === 'yellow' ? 'Highlight' : 'Linked text'}</div><div class="ex-quote ${a.hlColor === 'yellow' ? 'yellow' : ''}">${esc(a.selected_text)}</div>`);
    const right = [];
    a.messages.forEach(m => {
      if (m.type === 'comment' && inc.comments) right.push(`<div class="ex-comment"><div class="card-h" style="padding:0;margin:2px 0 4px">${actorAvatar(m)}<span class="who">${esc(actorName(m))}</span><span class="when">${new Date(m.created_at).toLocaleDateString()} · ${timeLabel(m.created_at)}</span></div><div class="msg">${esc(m.text || '')}</div></div>`);
      if (m.type === 'ai_answer' && inc.ai && !m.pending && !m.error) right.push(`<div class="ex-resp"><div class="ex-sub">AI response · ${esc(PROVIDER_LABEL[m.provider] || 'AI')}</div><div class="msg">${mdRich(m.text)}</div>${chipRow(m.chips)}</div>`);
      if (m.type === 'generated_visual' && inc.visuals && !m.pending && m.image) right.push(`<div class="ex-resp"><div class="ex-sub">Generated visual</div><div class="ex-shot"><img src="${safeImgSrc(m.image)}"></div>${m.approximation_note ? `<div style="margin-top:6px"><span class="badge-appx">Approximate</span></div>` : ''}</div>`);
    });
    if (!left.length && !right.length) { n--; return; }
    html += `<div class="ex-item ${compact ? 'compact' : ''}"><div class="ex-left"><div class="ex-loc"><span class="ex-num">${n}</span>Page ${esc(a.page)}${a.section ? ' · ' + esc(a.section) : ''}</div>${left.join('')}</div><div class="ex-right">${right.join('') || '<div class="ex-sub" style="color:#9CA3AF">—</div>'}</div></div>`;
  });
  if (n === 0) html += `<div class="empty">Nothing selected to export. Toggle include options or add notes.</div>`;
  sheet.innerHTML = html;
  scheduleTypeset();
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
  // Seed the bundled sample: the BERT paper (Devlin et al., 2019, CC BY 4.0) and its saved notes.
  const src = window.SAMPLE_NOTES_JSON;
  const others = (state.annotations || []).filter(a => docIdOf(a) !== 'sample');
  if (src && Array.isArray(src.annotations)) {
    const sample = src.annotations.map(a => { const c = JSON.parse(JSON.stringify(a)); c.doc = 'sample'; return c; });
    state.annotations = others.concat(sample);
  } else {
    state.annotations = others;
  }
  state.ui.activeId = null;
  if (typeof renumber === 'function') renumber();
  state.seeded = true; state.seedVersion = SEED_VERSION; save();
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
  const toggleLeft = () => setPanel('left', state.ui.collapseLeft);
  const toggleRight = () => setPanel('right', state.ui.collapseRight);
  $('#btnCollapseLeft').onclick = toggleLeft; $('#btnToggleLeft').onclick = toggleLeft;
  $('#btnCollapseRight').onclick = toggleRight; $('#btnToggleRight').onclick = toggleRight;
  { const sc = $('#scrim'); if (sc) sc.onclick = () => { setPanel('left', false); setPanel('right', false); }; }
  $('#btnSettings').onclick = () => openSettings();
  $('#newBtn').onclick = () => $('#fileInput').click();
  { const sh = $('#btnShareHtml'); if (sh) sh.onclick = () => exportSelfContainedHTML(state.ui.activeDoc); }
  $('#fileInput').onchange = async e => { const files = [...e.target.files]; e.target.value = ''; try { await openFiles(files); } catch (err) { toast('Could not open file: ' + (err && err.message || err), 'err'); } };
  // Drag-and-drop a PDF (and, optionally, its ".notes.json") anywhere on the reader to open them
  // together — the one gesture that makes a paper and its notes travel as a pair in any browser.
  if (!READONLY) {
    const rd = $('#reader');
    if (rd && !rd._dropWired) {
      rd._dropWired = true;
      const stop = e => { e.preventDefault(); e.stopPropagation(); };
      ['dragenter', 'dragover'].forEach(ev => rd.addEventListener(ev, e => { stop(e); rd.classList.add('drop-hint'); }));
      ['dragleave', 'dragend'].forEach(ev => rd.addEventListener(ev, e => { stop(e); rd.classList.remove('drop-hint'); }));
      rd.addEventListener('drop', async e => {
        stop(e); rd.classList.remove('drop-hint');
        const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
        if (files.length) { try { await openFiles(files); } catch (err) { toast('Could not open dropped files: ' + (err && err.message || err), 'err'); } }
      });
    }
  }
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
  $('#toolHi').onclick = () => setTool('highlight');
  $('#toolComment').onclick = () => setTool('comment');
  $('#toolShot').onclick = () => setTool('shot');
  $('#capCancel').onclick = () => setTool('cursor');
  { const _rd = $('#reader'), _mk = $('#captureMask'), _cb = $('#capBar'); if (_rd && _mk) _rd.appendChild(_mk); if (_rd && _cb) _rd.appendChild(_cb); }
  // Comment tool: click anywhere on the page to drop a point comment
  const placeComment = (pageEl, pageNum, vp, cx, cy) => {
    const r = pageEl.getBoundingClientRect();
    const x = clamp((cx - r.left) / vp.width, 0, 0.97), y = clamp((cy - r.top) / vp.height, 0, 0.97);
    const pt = pageTextCache[pageNum] || { text: '' };
    const ann = newAnnotation({ source_type: 'free_comment', page: pageNum, section: sectionForIndex(pt.text, 0), rects: [{ x, y, w: 0.02, h: 0.02 }] });
    setTool('cursor'); openRightPanel(ann.id); selectAnnotation(ann.id, true); render(); drawPins(); focusComposer();
    toast('Comment placed — type your note below.');
  };
  // Comment tool: click any page to drop a point comment — works in single AND continuous mode.
  $('#rdScroll').addEventListener('click', e => {
    if (state.ui.tool !== 'comment') return;
    if (window.getSelection && String(window.getSelection())) return;   // ignore text selections
    if (state.ui.continuous) {
      const pgEl = e.target.closest && e.target.closest('#contPages .pg');
      if (pgEl && pgEl._vp) placeComment(pgEl, +pgEl.dataset.page, pgEl._vp, e.clientX, e.clientY);
    } else if (viewport) {
      placeComment($('#pageWrap'), state.ui.page, viewport, e.clientX, e.clientY);
    }
  });
  $('#btnSearch').onclick = () => { const b = document.getElementById('findBar'); (b && !b.classList.contains('hidden')) ? closeFind() : openFind(); };
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F') && numPages > 0) { e.preventDefault(); openFind(); } });
  { const _bx = $('#btnExportTop'); if (_bx) _bx.onclick = openExport; }
  // selection popover
  document.addEventListener('mouseup', e => { const t = e.target; if (t && t.nodeType === 1 && t.closest('#selPop')) return; setTimeout(onTextSelect, 0); });
  // iOS dispatches `mouseup` only for taps: a long-press that makes a selection is consumed by the
  // selection UI, so `mouseup` alone never surfaces Highlight/Note/Ask AI on a phone. Key off
  // `selectionchange` too — debounced, since it fires on every nudge of a selection handle.
  // Never act while the pointer is still down: mid-drag, `selectionchange` fires on every character,
  // and the highlight tool would commit a partial selection before the reader let go.
  let touching = 0, held = false, selTimer = null;   // touching is read off e.touches, so a dropped touchend can't wedge it
  const scheduleSel = ms => { clearTimeout(selTimer); selTimer = setTimeout(() => { if (!touching && !held) onTextSelect(); }, ms); };
  document.addEventListener('mousedown', () => { held = true; }, true);
  document.addEventListener('mouseup', () => { held = false; }, true);   // capture: runs before the bubble handler above
  document.addEventListener('touchstart', e => { touching = e.touches.length; }, { passive: true });
  const liftTouch = e => {
    touching = e.touches.length;
    const t = e && e.target;
    if (t && t.closest && t.closest('#selPop')) return;   // let the popover button's click land first
    scheduleSel(80);
  };
  document.addEventListener('touchend', liftTouch, { passive: true });
  document.addEventListener('touchcancel', liftTouch, { passive: true });
  document.addEventListener('selectionchange', () => scheduleSel(350));
  $('#spHi').onclick = () => highlightSelection();   // popover Highlight is silent, like the highlight tool
  $('#spNote').onclick = () => createFromSelection('text');
  $('#spAsk').onclick = () => createFromSelection('ask');
  document.addEventListener('scroll', () => { if (pendingSel && window.getSelection && String(window.getSelection()).trim()) positionSelPop(); else $('#selPop').classList.add('hidden'); }, true);
  // notes header (mockup 2: funnel + search + kebab)
  $('#btnFilter').onclick = e => openFilterPopover(e.currentTarget);
  injectNotesButtons();
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
  // final word on the column transition, so the line lands exactly even if the
  // CSS duration is retuned out from under trackConnector()
  $('#app').addEventListener('transitionend', (e) => {
    if (e.propertyName === 'grid-template-columns') requestAnimationFrame(drawConnector);
  });
  window.addEventListener('resize', () => requestAnimationFrame(drawConnector));
  initCaptureMask(); initPinch(); initKeyboardInset();
}
function updateZoom() { $('#zoomVal').textContent = Math.round(state.ui.zoom * 100) + '%'; save(); return state.ui.continuous ? buildContinuous() : renderPage(state.ui.page); }
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
// Shown when the library has no documents (the user removed everything, including the sample).
function showEmptyReader() {
  pdfDoc = null; numPages = 0; viewport = null;
  try { teardownContinuous(); } catch (e) {}
  const pt = $('#pageTotal'); if (pt) pt.textContent = '/ 0';
  const scroll = $('#rdScroll'); if (!scroll) return;
  const pw = $('#pageWrap'); if (pw) pw.style.display = 'none';
  let fb = $('#readerFallback');
  if (!fb) { fb = el('<div id="readerFallback"></div>'); scroll.insertBefore(fb, scroll.firstChild); }
  fb.innerHTML = `<div class="fb-card">
    <div style="font-size:34px;margin-bottom:6px">📄</div>
    <h3 style="margin:0 0 8px;font-size:18px">Your library is empty</h3>
    <p style="color:var(--muted);line-height:1.55;margin:0">Use <b>Open PDF or bundle</b> (top-left) to open a paper, its notes, or a shared <b>.html</b>.</p>
  </div>`;
}

/* ---------- boot ---------- */
/* ---------- resizable right notes panel (drag its left edge) ---------- */
function clampRightW(px) {
  const max = Math.min(760, Math.max(340, window.innerWidth - 460));
  return Math.round(Math.max(300, Math.min(max, px)));
}
function setRightW(px) { document.documentElement.style.setProperty('--right-w', clampRightW(px) + 'px'); }
function curRightW() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--right-w'), 10) || 384; }
function applyPanelWidths() { const w = state.settings && state.settings.rightW; if (w) setRightW(w); }
function initPanelResize() {
  const notes = document.getElementById('notes'); if (!notes || document.getElementById('rightResizer')) return;
  const grip = el('<div id="rightResizer" class="col-resizer" title="Drag to resize · double-click to reset"></div>');
  notes.insertBefore(grip, notes.firstChild);
  let startX = 0, startW = 0, dragging = false;
  const px = e => (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
  const onMove = e => { if (!dragging) return; setRightW(startW - (px(e) - startX)); if (e.cancelable) e.preventDefault(); };
  const onUp = () => {
    if (!dragging) return;
    dragging = false; document.body.classList.remove('col-resizing');
    state.settings.rightW = curRightW(); save();
    window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp);
    requestAnimationFrame(() => { try { drawConnector(); } catch (e) {} });
  };
  const onDown = e => {
    if (document.getElementById('app').classList.contains('collapse-right')) return; // no resize while collapsed
    dragging = true; startX = px(e); startW = curRightW();
    document.body.classList.add('col-resizing'); if (e.cancelable) e.preventDefault();
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false }); window.addEventListener('touchend', onUp);
  };
  grip.addEventListener('mousedown', onDown);
  grip.addEventListener('touchstart', onDown, { passive: false });
  grip.addEventListener('dblclick', () => { state.settings.rightW = 384; save(); setRightW(384); requestAnimationFrame(() => { try { drawConnector(); } catch (e) {} }); });
}
/* ---------- double-click a comment / AI answer to edit it ---------- */
function editableIdsFromMsg(msgEl) {
  if (!msgEl) return null;
  const reply = msgEl.closest('.reply');
  let btn = null;
  if (reply) btn = reply.querySelector('[data-edit]');
  else { const card = msgEl.closest('.card'); btn = card ? card.querySelector(':scope > .card-h [data-edit]') : null; }
  return btn ? { annId: btn.dataset.ann, msgId: btn.dataset.edit } : null;
}
let _lastMsgClick = { id: null, t: 0 };
function wireNoteEditDblclick() {
  const host = document.getElementById('notesList') || document.getElementById('notes');
  if (!host || host._dblWired) return; host._dblWired = true;
  const enter = (annId, msgId) => {
    state.ui.activeId = annId; state.ui.editing = msgId; render();
    const ta = document.querySelector('.edit-input[data-editing="' + msgId + '"]');
    if (ta) { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } ta.setSelectionRange(ta.value.length, ta.value.length); }
  };
  const target = ev => {
    if (ev.target.closest('a,button,summary,.men,.edit-wrap,textarea,input,.thread-compose,.linked-quote,.shot-thumb')) return null;
    const msgEl = ev.target.closest('.msg');
    if (!msgEl || msgEl.classList.contains('clamp')) return null;
    return editableIdsFromMsg(msgEl);
  };
  // Manual double-click detection: two clicks on the SAME message id within 400ms. This is
  // immune to the re-render each single click triggers (element identity can change between clicks).
  host.addEventListener('click', ev => {
    const ids = target(ev);
    if (!ids) { _lastMsgClick = { id: null, t: 0 }; return; }
    const now = Date.now();
    if (_lastMsgClick.id === ids.msgId && now - _lastMsgClick.t < 400) { _lastMsgClick = { id: null, t: 0 }; enter(ids.annId, ids.msgId); }
    else _lastMsgClick = { id: ids.msgId, t: now };
  });
}
// Build an ephemeral, storage-free state from an embedded share bundle (see exportSelfContainedHTML).
// The whole library is just the one shared document; its notes load read-only. Nothing persists.
function initBundleState() {
  state = defaultState();
  state.docs = [{ id: 'bundle', name: PAIR_BUNDLE.name || 'Shared paper', kind: 'bundle', sha: PAIR_BUNDLE.sha || null, addedAt: nowISO() }];
  state.ui.activeDoc = 'bundle';
  const anns = (PAIR_BUNDLE.notes && Array.isArray(PAIR_BUNDLE.notes.annotations)) ? PAIR_BUNDLE.notes.annotations : [];
  // Sanitize even here (the bundle is isolated on its own origin, but this is free defense-in-depth
  // and preserves legitimate notes unchanged).
  state.annotations = sanitizeImportedNotes(anns).map(a => { a.doc = 'bundle'; return a; });
  state.seeded = true; state.seedVersion = SEED_VERSION;   // never seed the sample over a shared doc
}
// Strip the read-only viewer down to reading: hide every editing affordance, show a made-with banner.
function applyReadOnly() {
  document.body.classList.add('readonly');
  ['newBtn', 'fileInput', 'toolHi', 'toolText', 'toolComment', 'toolShot', 'composer',
   'btnSaveNotes', 'btnImportNotes', 'btnClearNotes', 'btnShareHtml', 'btnSettings'
  ].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  $$('.sb-storage').forEach(e => e.style.display = 'none');
  const banner = el('<div id="roBanner">Read-only annotated paper · To add notes, open this file at <a href="https://pairedx.com/app" target="_blank" rel="noopener">pairedx.com</a> · made with PairedX</div>');
  document.body.appendChild(banner);
}
async function boot() {
  if (PAIR_BUNDLE) initBundleState();
  // restore actor identity
  ACTORS.you.name = state.settings.actorName || 'You'; ACTORS.you.initials = state.settings.actorInitials || 'YO';
  // First run on a narrow screen: start with the page, not a drawer covering it. Once set, the
  // reader's own choice sticks — so this never re-collapses a panel they deliberately opened.
  if (isNarrowViewport() && !state.ui._mobileDefaulted) {
    state.ui._mobileDefaulted = true;
    state.ui.collapseLeft = true; state.ui.collapseRight = true;
    pendingMobileFit = true;
    save();
  }
  // apply ui
  $('#app').classList.toggle('collapse-left', state.ui.collapseLeft);
  $('#app').classList.toggle('collapse-right', state.ui.collapseRight);
  $('#zoomVal').textContent = Math.round(state.ui.zoom * 100) + '%';
  await idbOpen(); await rehydrateAssets();   // restore any offloaded screenshot/visual images
  wire(); setTool(state.ui.tool || 'cursor');
  if (READONLY) applyReadOnly();
  applyPanelWidths(); initPanelResize(); wireNoteEditDblclick();
  // Resolve the active document's bytes (sample inline, or a user PDF from IndexedDB). Fall back to
  // any remaining library doc, then the sample (unless removed), then an empty-library reader.
  let startBytes = state.ui.activeDoc ? await loadDocBytes(state.ui.activeDoc) : null;
  if (!startBytes && !READONLY) {
    const anyDoc = state.docs.find(d => !d.trashed);
    if (anyDoc) { state.ui.activeDoc = anyDoc.id; startBytes = await loadDocBytes(anyDoc.id); }
    else if (!state.sampleDismissed) { state.ui.activeDoc = 'sample'; startBytes = b64ToBytes(window.SAMPLE_PDF_B64); }
  }
  renderTree(); updateStorage();
  const bootDoc = state.docs.find(d => d.id === state.ui.activeDoc);
  await loadOcrStore(bootDoc && bootDoc.sha);   // boot skips switchDoc — load saved OCR before the first render
  let pdfOk = true;
  if (!startBytes && !READONLY) {
    pdfOk = false; showEmptyReader();   // library is empty (sample removed and no user docs)
  } else {
    try {
      // Race against a timeout: in a sandboxed preview the worker can hang instead of
      // erroring, which would otherwise block seeding + the whole UI.
      await Promise.race([
        initPdf(startBytes),
        new Promise((_, rej) => setTimeout(() => rej(new Error('PDF engine did not start — likely a sandboxed preview. Open the downloaded file directly.')), 7000)),
      ]);
    } catch (e) { pdfOk = false; showReaderFallback(e && e.message); }
  }
  if (!state.sampleDismissed && ((!state.seeded && !state.annotations.length) || state.seedVersion !== SEED_VERSION)) { try { await seed(); } catch (e) { console.warn('seed failed', e); } }
  if (pdfOk && !state.ui.continuous) { await renderPage(state.ui.page); }
  render(); if (pdfOk) { drawHighlights(); drawPins(); }
  // Pre-cache all page text in the background so AI context retrieval + document search
  // can draw on the whole document (not just visited pages).
  if (pdfOk) setTimeout(() => { for (let n = 1; n <= numPages; n++) ensurePageText(n).catch(() => {}); detectAndOfferOcr(bootDoc); }, 1200);
}
document.addEventListener('DOMContentLoaded', boot);
})();

