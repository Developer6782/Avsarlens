/* AvsarLens — snap the notice, seize the opportunity.
   Verification-first: never invent a deadline or eligibility.
   BYOK Gemini key in localStorage. No server. UI text: English only. */
'use strict';

const $ = (s) => document.querySelector(s);
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']; // Flash-only chain (fixed rule)
const KEY_LS = 'av_key';
const NOTES_LS = 'av_notices';

const EXTRACT_PROMPT = `You are AvsarLens, a notice-reading assistant for school students in India.
You receive a photo of a paper notice (scholarship, exam form, circular, competition, advertisement).
Extract ONLY what is visibly printed. NEVER guess, infer, or fill from general knowledge.
- If a field is not printed or is unreadable: use empty array or found:false, and list the field name in "unreadable".
- Dates: convert to ISO (YYYY-MM-DD) ONLY if the complete date is clearly printed; always keep as_printed verbatim.
- Write plain English a 14-year-old can understand; keep original terms in brackets when helpful.
Return strict JSON exactly matching this schema, no markdown, no extra keys:
{"what":"one plain sentence","type":"scholarship|exam|competition|circular|admission|other","who_can_apply":["bullet"],"deadline":{"found":false,"date":null,"as_printed":null,"extra":null},"documents":["bullet"],"how_to_apply":["step"],"extra":["bullet"],"unreadable":["field"],"confidence":"high|medium|low","language":"primary language of the notice"}`;

let currentImage = null;   // {b64, mime}
let lastCard = null;       // last extraction JSON

/* ---------- views ---------- */
function show(view) {
  document.querySelectorAll('.view').forEach(v => v.hidden = (v.id !== 'view-' + view));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'tracker') renderTracker();
  if (view === 'key') { $('#key-input').value = localStorage.getItem(KEY_LS) || ''; keyStatus(localStorage.getItem(KEY_LS) ? 'Key saved in this browser.' : 'No key saved yet.', 'ok'); }
}
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

/* ---------- api key ---------- */
function keyStatus(msg, cls) { const s = $('#key-status'); s.textContent = msg; s.className = 'status ' + (cls || ''); }
$('#key-save').addEventListener('click', () => {
  const v = $('#key-input').value.trim();
  if (!v) return keyStatus('Paste a key first.', 'err');
  localStorage.setItem(KEY_LS, v); keyStatus('Key saved in this browser.', 'ok');
});
$('#key-clear').addEventListener('click', () => { localStorage.removeItem(KEY_LS); $('#key-input').value = ''; keyStatus('Key removed.', 'ok'); });

/* ---------- capture: upload ---------- */
$('#file-input').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  setStatus('Processing...');
  const r = new FileReader();
  r.onload = () => setPreview(r.result);
  r.readAsDataURL(f);
});

/* ---------- capture: camera ---------- */
let camStream = null;
$('#cam-toggle').addEventListener('click', async () => {
  const v = $('#cam-video');
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; v.hidden = true; $('#cam-shoot').hidden = true; $('#cam-toggle').textContent = 'Start camera'; return; }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    v.srcObject = camStream; v.hidden = false; $('#cam-shoot').hidden = false; $('#cam-toggle').textContent = 'Stop camera'; setStatus('');
  } catch (err) { setStatus('Camera unavailable: ' + err.message + '. Use upload instead.', 'err'); }
});
$('#cam-shoot').addEventListener('click', () => {
  const v = $('#cam-video');
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  setPreview(c.toDataURL('image/jpeg', 0.92));
});

function setPreview(dataUrl) {
  const img = $('#preview');
  img.src = dataUrl; img.hidden = false; $('#analyze-btn').disabled = false; setStatus('Photo ready. Press Analyze notice.');
  const im = new Image();
  im.onload = () => { currentImage = preprocess(im); };
  im.src = dataUrl;
}

/* ---------- preprocess: downscale + contrast stretch (fresh implementation) ---------- */
function preprocess(img) {
  const MAX = 1568;
  let w = img.naturalWidth, h = img.naturalHeight;
  const s = Math.min(1, MAX / Math.max(w, h));
  w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  // luminance percentiles (2nd / 98th) for a gentle stretch
  const lum = new Uint8Array(w * h);
  for (let i = 0; i < lum.length; i++) { const j = i * 4; lum[i] = (px[j] * 77 + px[j + 1] * 151 + px[j + 2] * 28) >> 8; }
  const sorted = Array.from(lum).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.98)];
  const range = Math.max(hi - lo, 1);
  for (let i = 0; i < px.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = px[i + k];
      px[i + k] = Math.max(0, Math.min(255, Math.round(((v - lo) / range) * 235 + 10)));
    }
  }
  ctx.putImageData(d, 0, 0);
  const out = c.toDataURL('image/jpeg', 0.85);
  return { b64: out.split(',')[1], mime: 'image/jpeg' };
}

/* ---------- gemini call (Flash-only fallback chain) ---------- */
async function gemini(prompt, image, responseJson) {
  const key = localStorage.getItem(KEY_LS);
  if (!key) throw new Error('No API key saved. Go to API Key tab and paste your Gemini key.');
  let lastErr = null;
  for (const model of MODELS) {
    try {
      const parts = [{ text: prompt }];
      if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.b64 } });
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: Object.assign({ temperature: 0.1 }, responseJson ? { responseMimeType: 'application/json' } : {}),
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        lastErr = new Error(`API ${res.status} (${model}): ${t.slice(0, 180)}`);
        if (res.status === 404 || res.status === 400) continue; // try next Flash model
        throw lastErr; // 401/403/429 etc: report honestly, stop
      }
      const data = await res.json();
      const txt = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text;
      if (!txt) throw new Error('Empty response from model.');
      return txt;
    } catch (e) { lastErr = e; if (e.message && e.message.startsWith('API 4')) { /* handled above */ } else { throw e; } }
  }
  throw lastErr || new Error('All Flash models failed.');
}

function parseJson(txt) {
  let t = txt.trim();
  t = t.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(t);
}

/* ---------- analyze ---------- */
function setStatus(msg, cls) { const s = $('#status'); s.textContent = msg || ''; s.className = 'status ' + (cls || ''); }

$('#analyze-btn').addEventListener('click', async () => {
  if (!currentImage) return setStatus('No photo loaded.', 'err');
  const btn = $('#analyze-btn'); btn.disabled = true;
  setStatus('Processing...');
  try {
    const raw = await gemini(EXTRACT_PROMPT, currentImage, true);
    const x = parseJson(raw);
    lastCard = x;
    renderCard(x);
    setStatus('Done. See Result tab.', 'ok');
    show('card');
  } catch (e) {
    setStatus('Failed: ' + e.message, 'err');
  } finally { btn.disabled = false; }
});

/* ---------- card rendering (textContent only — XSS safe) ---------- */
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function fillList(node, arr) { node.innerHTML = ''; (arr || []).forEach(t => node.appendChild(el('li', null, String(t)))); if (!arr || !arr.length) node.appendChild(el('li', null, 'Not printed on the notice.')); }

function daysLeft(iso) {
  const d = new Date(iso + 'T23:59:59');
  return Math.ceil((d - new Date()) / 86400000);
}

function renderCard(x) {
  $('#card-empty').hidden = true; $('#card-out').hidden = false;
  const chips = $('#chips'); chips.innerHTML = '';
  if (x.confidence === 'low') chips.appendChild(el('span', 'chip bad', 'LOW CONFIDENCE — verify every field manually'));
  else if (x.confidence === 'medium') chips.appendChild(el('chip', 'MEDIUM CONFIDENCE — re-check important fields'));
  (x.unreadable || []).forEach(u => chips.appendChild(el('span', 'chip', 'VERIFY MANUALLY: ' + u)));
  if (!chips.children.length) chips.appendChild(el('span', 'chip ok', 'Extraction complete'));

  $('#c-type').textContent = x.type || 'other';
  $('#c-lang').textContent = x.language ? ('Notice language: ' + x.language) : '';
  $('#c-what').textContent = x.what || '(no summary returned)';
  fillList($('#c-who'), x.who_can_apply);
  fillList($('#c-docs'), x.documents);
  fillList($('#c-how'), x.how_to_apply);
  fillList($('#c-extra'), x.extra);

  const dl = $('#c-deadline'); dl.innerHTML = '';
  const d = x.deadline || {};
  if (d.found && d.date) {
    dl.appendChild(el('div', 'deadline-big', d.as_printed ? `${d.as_printed} (${d.date})` : d.date));
    const n = daysLeft(d.date);
    dl.appendChild(el('span', 'days' + (n < 0 ? ' over' : ''), n < 0 ? 'Date has passed (as printed)' : n + ' days left'));
    if (d.extra) dl.appendChild(el('div', 'muted', String(d.extra)));
  } else {
    dl.appendChild(el('span', 'chip', 'NO DEADLINE PRINTED — VERIFY MANUALLY'));
    if (d.as_printed) dl.appendChild(el('div', 'muted', 'Seen on paper: ' + d.as_printed));
  }

  // can-i-apply availability
  $('#cia-btn').hidden = !(Array.isArray(x.who_can_apply) && x.who_can_apply.length >= 1);
  $('#cia-panel').hidden = true; $('#cia-body').innerHTML = '';
}

/* ---------- can I apply? ---------- */
$('#cia-btn').addEventListener('click', async () => {
  if (!lastCard) return;
  const panel = $('#cia-panel'), body = $('#cia-body');
  panel.hidden = false; body.innerHTML = ''; body.appendChild(el('p', 'status', 'Generating questions from the notice...'));
  try {
    const qRaw = await gemini(`Based ONLY on this extracted notice data, create up to 3 quick yes/no style questions a student must answer to check eligibility. Use the notice's own rules. If the data is too thin, return {"questions":[]}. JSON schema: {"questions":[{"q":"question","options":["option A","option B"]}]}\n\nDATA:\n${JSON.stringify(lastCard)}`, null, true);
    const qj = parseJson(qRaw);
    body.innerHTML = '';
    if (!qj.questions || !qj.questions.length) {
      body.appendChild(el('p', null, 'The notice does not print enough eligibility rules for a fair check. ASK YOUR SCHOOL OFFICE — show them the notice.'));
      return;
    }
    const form = el('form'); form.id = 'cia-form';
    qj.questions.forEach((q, i) => {
      const wrap = el('div', 'q'); wrap.appendChild(el('p', null, (i + 1) + '. ' + q.q));
      (q.options || []).forEach(op => {
        const lab = el('label', 'opt');
        const inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'q' + i; inp.value = op; inp.required = true;
        lab.appendChild(inp); lab.appendChild(document.createTextNode(op));
        wrap.appendChild(lab);
      });
      form.appendChild(wrap);
    });
    const sub = el('button', 'btn primary', 'Get verdict'); sub.type = 'submit'; form.appendChild(sub);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const answers = qj.questions.map((q, i) => ({ q: q.q, a: (form.querySelector(`input[name="q${i}"]:checked`) || {}).value || 'unanswered' }));
      sub.disabled = true;
      const vOut = el('div', 'status', 'Checking against the printed rules...'); form.appendChild(vOut);
      try {
        const vRaw = await gemini(`A student answered eligibility questions about a notice. Compare ONLY against the notice's printed rules. JSON schema: {"verdict":"likely|maybe|not_eligible","why":["short line"]}\n\nNOTICE DATA:\n${JSON.stringify(lastCard)}\n\nANSWERS:\n${JSON.stringify(answers)}`, null, true);
        const v = parseJson(vRaw);
        vOut.remove();
        const box = el('div', 'verdict ' + (v.verdict === 'likely' ? 'likely' : v.verdict === 'maybe' ? 'maybe' : 'not'));
        box.appendChild(el('div', null, v.verdict === 'likely' ? 'LIKELY ELIGIBLE (as per printed rules)' : v.verdict === 'maybe' ? 'MAYBE — ASK YOUR SCHOOL' : 'NOT ELIGIBLE (as per printed rules)'));
        const ul = el('ul'); (v.why || []).forEach(wl => ul.appendChild(el('li', null, String(wl)))); box.appendChild(ul);
        box.appendChild(el('div', 'disc', 'Final confirmation: contact the office listed on the notice. AvsarLens never overrides the issuing authority.'));
        form.appendChild(box); sub.hidden = true;
      } catch (e2) { vOut.textContent = 'Failed: ' + e2.message; vOut.className = 'status err'; sub.disabled = false; }
    });
    body.appendChild(form);
  } catch (e) { body.innerHTML = ''; body.appendChild(el('p', 'status err', 'Failed: ' + e.message)); }
});

/* ---------- tracker ---------- */
function getNotes() { try { return JSON.parse(localStorage.getItem(NOTES_LS) || '[]'); } catch (e) { return []; } }
function setNotes(a) { localStorage.setItem(NOTES_LS, JSON.stringify(a)); }

$('#save-btn').addEventListener('click', () => {
  if (!lastCard) return;
  const notes = getNotes();
  notes.push({ id: Date.now(), savedAt: new Date().toISOString(), status: 'new', card: lastCard });
  setNotes(notes);
  $('#save-btn').textContent = 'Saved'; setTimeout(() => $('#save-btn').textContent = 'Save to tracker', 1500);
});

function renderTracker() {
  const list = $('#tracker-list'); list.innerHTML = '';
  const notes = getNotes();
  $('#tracker-empty').hidden = notes.length > 0;
  notes.slice().reverse().forEach(n => {
    const row = el('div', 'trow');
    const left = el('div');
    left.appendChild(el('div', 't-title', n.card.what || '(untitled)'));
    const d = n.card.deadline || {};
    let meta = (n.card.type || 'other').toUpperCase() + ' · saved ' + new Date(n.savedAt).toLocaleDateString();
    if (d.found && d.date) { const k = daysLeft(d.date); meta += ' · deadline ' + d.date + (k < 0 ? ' (passed)' : ' (' + k + ' days left)'); }
    else meta += ' · no deadline printed — verify manually';
    left.appendChild(el('div', 't-meta', meta));
    row.appendChild(left);
    const right = el('div');
    const sel = document.createElement('select');
    ['new', 'asked', 'applied', 'missed'].forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s[0].toUpperCase() + s.slice(1); if (n.status === s) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', () => { const all = getNotes(); const t = all.find(x => x.id === n.id); if (t) { t.status = sel.value; setNotes(all); } });
    const del = el('button', 'btn danger', 'Delete');
    del.addEventListener('click', () => { setNotes(getNotes().filter(x => x.id !== n.id)); renderTracker(); });
    right.appendChild(sel); right.appendChild(del);
    row.appendChild(right);
    list.appendChild(row);
  });
}

/* ---------- print view ---------- */
$('#print-btn').addEventListener('click', () => {
  if (!lastCard) return;
  const x = lastCard, out = $('#print-out'); out.innerHTML = '';
  out.appendChild(el('h2', null, x.what || 'Notice summary'));
  const d = x.deadline || {};
  const head = el('div', 'p-field'); head.appendChild(el('h4', null, 'Deadline'));
  head.appendChild(el('div', null, d.found && d.date ? `${d.as_printed || ''} (${d.date})` : 'NOT PRINTED — verify manually'));
  out.appendChild(head);
  [['Who can apply', x.who_can_apply], ['Documents needed', x.documents], ['How to apply', x.how_to_apply], ['Extra details', x.extra]].forEach(([t, arr]) => {
    const f = el('div', 'p-field'); f.appendChild(el('h4', null, t));
    const ul = el('ul'); (arr || []).forEach(i => ul.appendChild(el('li', null, String(i)))); if (!arr || !arr.length) ul.appendChild(el('li', null, 'Not printed.'));
    f.appendChild(ul); out.appendChild(f);
  });
  out.appendChild(el('div', 'p-foot', `Generated by AvsarLens from a photo on ${new Date().toLocaleDateString()}. Extraction confidence: ${x.confidence || 'unknown'}. Verify with the issuing office before acting.`));
  show('print');
});
$('#do-print').addEventListener('click', () => window.print());
$('#print-close').addEventListener('click', () => show('card'));

/* init */
show('capture');
