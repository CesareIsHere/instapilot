'use strict';

/* ───────────────────────── Helpers ───────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    const isText = typeof c === 'string' || typeof c === 'number';
    node.appendChild(isText ? document.createTextNode(String(c)) : c);
  }
  return node;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/json' } : {},
    ...opts,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data.message || data.error || (text && text.slice(0, 200)) || `Errore ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'error' ? 6000 : 3500);
}

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

function setActiveNav(name) {
  document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

/* ───────────────────────── Health ────────────────────────── */
async function pollHealth() {
  try {
    const data = await api('/health');
    $('#health-dot').className = 'dot ' + (data.bundleReady ? 'ok' : 'bad');
    $('#health-text').textContent = data.bundleReady ? 'Servizio online' : 'Bundle non pronto';
  } catch {
    $('#health-dot').className = 'dot bad';
    $('#health-text').textContent = 'Offline';
  }
}

/* ───────────────────────── Router ─────────────────────────── */
const routes = [
  { re: /^#\/$/, view: renderLibrary, nav: 'library' },
  { re: /^#\/new$/, view: renderNew, nav: 'new' },
  { re: /^#\/jobs$/, view: renderJobs, nav: 'jobs' },
  { re: /^#\/job\/([^/]+)$/, view: renderJob, nav: 'jobs' },
  { re: /^#\/content\/([^/]+)$/, view: renderDetail, nav: 'library' },
];

async function router() {
  // Cancel any pending poll from the view we're leaving so a late timer can't
  // repaint a stale view over the new one.
  clearTimeout(jobsTimer);
  clearTimeout(jobTimer);
  const hash = location.hash || '#/';
  for (const r of routes) {
    const m = hash.match(r.re);
    if (m) {
      setActiveNav(r.nav);
      view.innerHTML = '<div class="loading">Caricamento…</div>';
      try { await r.view(...m.slice(1)); }
      catch (err) { view.innerHTML = ''; view.appendChild(errorState(err.message)); }
      return;
    }
  }
  location.hash = '#/';
}

function errorState(msg) {
  return h('div', { class: 'empty' }, h('h2', {}, 'Qualcosa è andato storto'), h('p', {}, msg));
}

/* ───────────────────────── Library ────────────────────────── */
async function renderLibrary() {
  const { items } = await api('/api/library');
  view.innerHTML = '';
  view.appendChild(h('div', { class: 'view-header' },
    h('div', {},
      h('h1', {}, 'Libreria'),
      h('p', { class: 'sub' }, `${items.length} contenut${items.length === 1 ? 'o' : 'i'} generat${items.length === 1 ? 'o' : 'i'}`),
    ),
    h('a', { class: 'btn btn-primary', href: '#/new' }, '✨ Nuovo contenuto'),
  ));

  if (!items.length) {
    view.appendChild(h('div', { class: 'empty' },
      h('h2', {}, 'Ancora nessun contenuto'),
      h('p', {}, 'Crea il tuo primo post o carosello per Instagram.'),
      h('a', { class: 'btn btn-primary', href: '#/new', style: { marginTop: '12px' } }, '✨ Crea contenuto'),
    ));
    return;
  }

  const grid = h('div', { class: 'grid' });
  for (const it of items) {
    grid.appendChild(h('div', { class: 'card', onclick: () => { location.hash = `#/content/${it.id}`; } },
      h('div', { class: 'card-thumb', style: it.coverUrl ? { backgroundImage: `url(${it.coverUrl})` } : {} }),
      h('div', { class: 'card-body' },
        h('div', { class: 'card-title' }, it.title || it.topic || 'Senza titolo'),
        h('div', { class: 'card-meta' },
          h('span', { class: 'badge ' + it.format }, it.format === 'carousel' ? 'Carosello' : 'Post'),
          h('span', {}, `${it.slideCount} slide`),
          h('span', { style: { marginLeft: 'auto' } }, fmtDate(it.updatedAt || it.createdAt)),
        ),
      ),
    ));
  }
  view.appendChild(grid);
}

/* ───────────────────────── New content ────────────────────── */
async function renderNew() {
  let meta = { slideCount: { min: 6, max: 9, default: 7 }, defaultModel: null };
  try { meta = await api('/api/meta'); } catch { /* keep defaults */ }

  const state = { format: 'carousel', slideCount: meta.slideCount.default };

  view.innerHTML = '';
  view.appendChild(h('div', { class: 'view-header' }, h('div', {}, h('h1', {}, 'Nuovo contenuto'), h('p', { class: 'sub' }, 'Descrivi l\'argomento: gli agenti AI fanno ricerca, struttura e design.'))));

  const slideField = h('div', { class: 'field' });
  function renderSlideField() {
    slideField.innerHTML = '';
    if (state.format !== 'carousel') return;
    slideField.appendChild(h('label', {}, 'Numero di slide'));
    const val = h('span', { class: 'range-val' }, String(state.slideCount));
    slideField.appendChild(h('div', { class: 'range-row' },
      h('input', {
        type: 'range', min: meta.slideCount.min, max: meta.slideCount.max, value: state.slideCount,
        oninput: (e) => { state.slideCount = Number(e.target.value); val.textContent = e.target.value; },
      }),
      val,
    ));
  }
  renderSlideField();

  const seg = h('div', { class: 'segmented' });
  function renderSeg() {
    seg.innerHTML = '';
    for (const f of [['carousel', 'Carosello'], ['single', 'Post singolo']]) {
      seg.appendChild(h('button', {
        type: 'button', class: state.format === f[0] ? 'active' : '',
        onclick: () => { state.format = f[0]; renderSeg(); renderSlideField(); },
      }, f[1]));
    }
  }
  renderSeg();

  const topic = h('textarea', { placeholder: 'Es. La leva del tempo negli investimenti', required: 'true' });
  const instructions = h('textarea', { placeholder: 'Es. Tono educativo, pubblico principiante. Usa un esempio numerico sull\'interesse composto.' });
  const model = h('input', { type: 'text', placeholder: meta.defaultModel || 'default dal server' });
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, '🚀 Avvia generazione');

  const form = h('form', { class: 'form card-panel', onsubmit: async (e) => {
    e.preventDefault();
    const body = {
      topic: topic.value.trim(),
      format: state.format,
      instructions: instructions.value.trim() || undefined,
      slideCount: state.format === 'carousel' ? state.slideCount : undefined,
      model: model.value.trim() || undefined,
    };
    if (!body.topic) { toast('Inserisci un argomento', 'error'); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Avvio…';
    try {
      const job = await api('/api/generate', { method: 'POST', body: JSON.stringify(body) });
      toast('Generazione avviata', 'success');
      location.hash = `#/job/${job.id}`;
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Avvia generazione';
    }
  } },
    h('div', { class: 'field' }, h('label', {}, 'Formato'), seg),
    slideField,
    h('div', { class: 'field' }, h('label', {}, 'Argomento *'), topic, h('span', { class: 'hint' }, 'L\'argomento principale del contenuto.')),
    h('div', { class: 'field' }, h('label', {}, 'Istruzioni (opzionale)'), instructions, h('span', { class: 'hint' }, 'Tono, pubblico, vincoli, esempi richiesti…')),
    h('div', { class: 'field' }, h('label', {}, 'Modello (opzionale)'), model, h('span', { class: 'hint' }, 'Override del modello LLM. Lascia vuoto per usare la configurazione del server.')),
    h('div', {}, submitBtn),
  );
  view.appendChild(form);
}

/* ───────────────────────── Jobs list ──────────────────────── */
let jobsTimer;
async function renderJobs() {
  clearTimeout(jobsTimer);
  async function load() {
    let data;
    try { data = await api('/api/generate'); } catch (err) { view.innerHTML = ''; view.appendChild(errorState(err.message)); return; }
    view.innerHTML = '';
    view.appendChild(h('div', { class: 'view-header' },
      h('div', {}, h('h1', {}, 'Generazioni')),
      h('a', { class: 'btn btn-primary', href: '#/new' }, '✨ Nuovo contenuto'),
    ));
    if (!data.jobs.length) {
      view.appendChild(h('div', { class: 'empty' }, h('h2', {}, 'Nessuna generazione'), h('p', {}, 'Le generazioni avviate compaiono qui.')));
      return;
    }
    const list = h('div', { class: 'job-list' });
    for (const j of data.jobs) list.appendChild(jobRow(j));
    view.appendChild(list);
    if (data.jobs.some((j) => j.status === 'running') && location.hash === '#/jobs') {
      jobsTimer = setTimeout(load, 2500);
    }
  }
  await load();
}

function jobRow(j) {
  const phaseTxt = j.status === 'error' ? (j.error?.message || 'Errore')
    : j.status === 'done' ? 'Completato'
    : `${j.progress?.phase || 'in corso'}${j.progress?.detail ? ' — ' + j.progress.detail : ''}`;
  const right = j.status === 'done' && j.contentId
    ? h('a', { class: 'btn btn-secondary btn-sm', href: `#/content/${j.contentId}` }, 'Apri →')
    : j.status === 'running' ? h('a', { class: 'btn btn-ghost btn-sm', href: `#/job/${j.id}` }, 'Dettagli')
    : h('span', {});
  return h('div', { class: 'job-row' },
    j.status === 'running' ? h('span', { class: 'spinner' }) : h('span', { class: 'status-pill ' + j.status }, j.status === 'done' ? 'OK' : 'Errore'),
    h('div', { class: 'job-main' },
      h('div', { class: 'job-title' }, `${j.input.topic} · ${j.input.format === 'carousel' ? 'Carosello' : 'Post'}`),
      h('div', { class: 'job-phase' }, phaseTxt),
    ),
    h('span', { style: { fontSize: '12px', color: 'var(--muted)' } }, fmtDate(j.createdAt)),
    right,
  );
}

/* ───────────────────────── Job progress ───────────────────── */
let jobTimer;
async function renderJob(id) {
  clearTimeout(jobTimer);
  async function load() {
    let j;
    try { j = await api(`/api/generate/${id}`); } catch (err) { view.innerHTML = ''; view.appendChild(errorState(err.message)); return; }

    if (j.status === 'done' && j.contentId) { location.hash = `#/content/${j.contentId}`; return; }

    view.innerHTML = '';
    view.appendChild(h('div', { class: 'view-header' }, h('div', {}, h('h1', {}, 'Generazione in corso'), h('p', { class: 'sub' }, j.input.topic))));

    const phases = ['research', 'plan', 'slides', 'review', 'done'];
    const labels = { research: 'Ricerca', plan: 'Pianificazione', slides: 'Generazione slide', review: 'Revisione', done: 'Completato' };
    const curPhase = j.progress?.phase || 'research';
    const curIdx = Math.max(0, phases.indexOf(curPhase));
    let pct = ((curIdx + (j.progress?.current && j.progress?.total ? j.progress.current / j.progress.total : 0.4)) / phases.length) * 100;
    if (j.status === 'error') pct = 100;

    const panel = h('div', { class: 'card-panel' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' } },
        j.status === 'error' ? h('span', { class: 'status-pill error' }, 'Errore') : h('span', { class: 'spinner' }),
        h('strong', {}, j.status === 'error' ? (j.error?.message || 'Errore') : (labels[curPhase] || curPhase)),
      ),
      h('p', { class: 'sub', style: { margin: '0 0 4px' } }, j.progress?.detail || ''),
      h('div', { class: 'progress-bar' }, h('span', { style: { width: pct + '%', background: j.status === 'error' ? 'var(--danger)' : 'var(--green)' } })),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '12px', color: 'var(--muted)' } },
        ...phases.map((p, i) => h('span', { style: { color: i <= curIdx && j.status !== 'error' ? 'var(--green)' : 'var(--muted)', fontWeight: i === curIdx ? '700' : '400' } }, labels[p])),
      ),
    );
    view.appendChild(panel);

    if (j.status === 'error') {
      view.appendChild(h('div', { style: { marginTop: '18px' } },
        h('a', { class: 'btn btn-secondary', href: '#/new' }, 'Riprova'),
      ));
      return;
    }
    if (location.hash === `#/job/${id}`) jobTimer = setTimeout(load, 2000);
  }
  await load();
}

/* ───────────────────────── Detail ─────────────────────────── */
async function renderDetail(id) {
  const data = await api(`/api/library/${id}`);
  let active = 0;

  if (!data.slides || !data.slides.length) {
    view.innerHTML = '';
    view.appendChild(h('div', { class: 'empty' },
      h('h2', {}, 'Nessuna slide'),
      h('p', {}, 'Questo contenuto non ha slide renderizzate.'),
      h('a', { class: 'btn btn-ghost', href: '#/', style: { marginTop: '12px' } }, '← Libreria'),
    ));
    return;
  }

  view.innerHTML = '';
  view.appendChild(h('div', { class: 'view-header' },
    h('div', {},
      h('h1', {}, data.title || data.topic),
      h('p', { class: 'sub' }, `${data.format === 'carousel' ? 'Carosello' : 'Post'} · ${data.slides.length} slide · ${data.framework || ''}`),
    ),
    h('div', { style: { display: 'flex', gap: '10px' } },
      h('a', { class: 'btn btn-ghost', href: '#/' }, '← Libreria'),
      h('button', { class: 'btn btn-danger', onclick: () => deleteContent(id) }, '🗑 Elimina'),
    ),
  ));

  const stageImg = h('img', { class: 'stage-img', src: data.slides[0].imageUrl, alt: 'slide' });
  const dlLink = h('a', { class: 'btn btn-ghost', href: data.slides[0].imageUrl, download: '' }, '⬇ PNG');
  const strip = h('div', { class: 'slide-strip' });
  const metaPanel = h('div', { class: 'meta-panel' });

  // Reloads the active slide image (cache-busted) + thumbnail + download link + metadata.
  function refreshActive() {
    const s = data.slides[active];
    const bust = s.imageUrl + '?t=' + Date.now();
    stageImg.src = bust;
    dlLink.href = bust;
    dlLink.setAttribute('download', `${id}-slide-${active + 1}.png`);
    const thumb = strip.children[active];
    if (thumb) thumb.style.backgroundImage = `url(${bust})`;
    renderMeta();
  }

  function selectSlide(i) {
    active = i;
    strip.querySelectorAll('.slide-thumb').forEach((t, idx) => t.classList.toggle('active', idx === i));
    refreshActive();
  }

  function renderMeta() {
    const s = data.slides[active];
    metaPanel.innerHTML = '';
    metaPanel.appendChild(h('h3', {}, `Slide ${active + 1} — ${s.role || ''}`));
    const rows = [
      ['Ruolo', s.role],
      ['Funzione', s.narrativeFunction],
      ['Intent', s.intent],
      ['Ultima modifica AI', s.lastEditSummary],
      ['Modificata', s.editedAt ? fmtDate(s.editedAt) : null],
    ];
    for (const [k, v] of rows) if (v) metaPanel.appendChild(h('div', { class: 'meta-row' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, String(v))));
    const w = s.warnings;
    if (Array.isArray(w) && w.length) metaPanel.appendChild(h('div', { class: 'warn-box' }, `${w.length} avviso/i di layout o qualità su questa slide.`));
  }

  data.slides.forEach((s, i) => {
    strip.appendChild(h('div', { class: 'slide-thumb' + (i === 0 ? ' active' : ''), style: { backgroundImage: `url(${s.imageUrl})` }, onclick: () => selectSlide(i) },
      h('span', { class: 'idx' }, String(i + 1)),
    ));
  });

  const stage = h('div', { class: 'stage' },
    stageImg,
    h('div', { class: 'stage-actions' },
      h('button', { class: 'btn btn-primary', onclick: () => openEditor(id, data, active, refreshActive) }, '✎ Visualizza / Edita HTML'),
      h('button', { class: 'btn btn-secondary', onclick: () => quickAiEdit(id, data, active, refreshActive) }, '✨ Edit AI'),
      dlLink,
    ),
  );

  view.appendChild(strip);
  view.appendChild(h('div', { class: 'detail-layout' }, stage, metaPanel));
  renderMeta();
}

async function deleteContent(id) {
  if (!confirm('Eliminare definitivamente questo contenuto?')) return;
  try {
    await api(`/api/library/${id}`, { method: 'DELETE' });
    toast('Contenuto eliminato', 'success');
    location.hash = '#/';
  } catch (err) { toast(err.message, 'error'); }
}

/* ───────────────────────── Editor modal ───────────────────── */
async function openEditor(id, data, idx, onSaved) {
  const slide = data.slides[idx];
  let html;
  try {
    const res = await fetch(`/api/library/${id}/slides/${idx}/html`);
    if (!res.ok) throw new Error(`Errore ${res.status}`);
    html = await res.text();
  } catch (err) { toast('Impossibile caricare l\'HTML: ' + err.message, 'error'); return; }

  const textarea = h('textarea', { spellcheck: 'false' }, html);
  const frame = h('iframe', { class: 'preview-frame' });
  const previewPane = h('div', { class: 'preview-pane' });
  previewPane.appendChild(frame);

  function updatePreview() {
    frame.srcdoc = textarea.value;
    // scale to fit pane width
    const avail = previewPane.clientWidth - 32;
    const scale = Math.max(0.05, Math.min(1, avail / 1080));
    frame.style.transform = `scale(${scale})`;
    previewPane.style.minHeight = (1350 * scale + 32) + 'px';
    // keep pane height bounded by scaled frame
  }

  let debounce;
  textarea.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(updatePreview, 350); });

  const aiInput = h('input', { type: 'text', placeholder: 'Istruzione AI: es. "accorcia il titolo e ingrandisci il numero"' });
  const saveBtn = h('button', { class: 'btn btn-primary' }, '💾 Salva e renderizza');
  const aiBtn = h('button', { class: 'btn btn-secondary' }, '✨ Applica AI');

  saveBtn.onclick = async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Render…';
    try {
      const r = await api(`/api/library/${id}/slides/${idx}/html`, { method: 'PUT', body: JSON.stringify({ html: textarea.value }) });
      slide.imageUrl = r.imageUrl; slide.editedAt = r.editedAt;
      toast('Slide salvata e renderizzata', 'success');
      onSaved && onSaved();
    } catch (err) { toast(err.message, 'error'); }
    finally { saveBtn.disabled = false; saveBtn.textContent = '💾 Salva e renderizza'; }
  };

  aiBtn.onclick = async () => {
    const instruction = aiInput.value.trim();
    if (!instruction) { toast('Scrivi un\'istruzione per l\'AI', 'error'); return; }
    aiBtn.disabled = true; aiBtn.textContent = 'Elaboro…';
    try {
      const r = await api(`/api/library/${id}/slides/${idx}/ai-edit`, { method: 'POST', body: JSON.stringify({ instruction }) });
      textarea.value = r.html;
      updatePreview();
      slide.imageUrl = r.imageUrl; slide.editedAt = r.editedAt; slide.intent = r.summary;
      aiInput.value = '';
      toast('Modifica AI applicata: ' + r.summary, 'success');
      onSaved && onSaved();
    } catch (err) { toast(err.message, 'error'); }
    finally { aiBtn.disabled = false; aiBtn.textContent = '✨ Applica AI'; }
  };

  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal-head' },
        h('h2', {}, `Slide ${idx + 1} — editor HTML`),
        h('button', { class: 'icon-btn', onclick: () => close() }, '✕'),
      ),
      h('div', { class: 'modal-body' },
        h('div', { class: 'editor-pane' }, textarea),
        previewPane,
      ),
      h('div', { class: 'modal-foot' },
        h('div', { class: 'ai-row' }, aiInput, aiBtn),
        saveBtn,
      ),
    ),
  );
  function close() { backdrop.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  requestAnimationFrame(updatePreview);
}

/* Quick AI edit without opening the full editor. */
async function quickAiEdit(id, data, idx, onSaved) {
  const instruction = prompt('Cosa vuoi modificare in questa slide? (es. "accorcia il titolo")');
  if (!instruction || !instruction.trim()) return;
  toast('Modifica AI in corso…');
  try {
    const r = await api(`/api/library/${id}/slides/${idx}/ai-edit`, { method: 'POST', body: JSON.stringify({ instruction: instruction.trim() }) });
    data.slides[idx].imageUrl = r.imageUrl; data.slides[idx].editedAt = r.editedAt; data.slides[idx].intent = r.summary;
    toast('Fatto: ' + r.summary, 'success');
    onSaved && onSaved();
  } catch (err) { toast(err.message, 'error'); }
}

/* ───────────────────────── Boot ───────────────────────────── */
window.addEventListener('hashchange', router);
window.addEventListener('load', () => { router(); pollHealth(); setInterval(pollHealth, 15000); });
