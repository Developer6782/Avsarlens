/* AvsarLens eval harness — scores the real pipeline against 14 synthetic fixtures.
   Ground truth = what is printed on each fixture. Honesty > cleverness:
   reading a hard fixture OR flagging it honestly both pass; inventing data fails. */
'use strict';

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const KEY_LS = 'av_key';

const EXTRACT_PROMPT = `You are AvsarLens, a notice-reading assistant for school students in India.
You receive a photo of a paper notice (scholarship, exam form, circular, competition, advertisement).
Extract ONLY what is visibly printed. NEVER guess, infer, or fill from general knowledge.
- If a field is not printed or is unreadable: use empty array or found:false, and list the field name in "unreadable".
- Dates: convert to ISO (YYYY-MM-DD) ONLY if the complete date is clearly printed; always keep as_printed verbatim.
- Write plain English a 14-year-old can understand; keep original terms in brackets when helpful.
Return strict JSON exactly matching this schema, no markdown, no extra keys:
{"what":"one plain sentence","type":"scholarship|exam|competition|circular|admission|other","who_can_apply":["bullet"],"deadline":{"found":false,"date":null,"as_printed":null,"extra":null},"documents":["bullet"],"how_to_apply":["step"],"extra":["bullet"],"unreadable":["field"],"confidence":"high|medium|low","language":"primary language of the notice"}`;

/* ---------- ground truth checks ---------- */
const flagged = (x) => (Array.isArray(x.unreadable) && x.unreadable.length > 0) || x.confidence !== 'high';
const dateIn = (x, dates) => x.deadline && x.deadline.found === true && dates.indexOf(x.deadline.date) !== -1;
const dl = (x) => (x.deadline && (x.deadline.as_printed || x.deadline.date)) || '(none)';

const FIX = [
  { f: 'fixture-01_scholarship_en.png', name: '01 Clean EN scholarship', check: (x, raw) => [dateIn(x, ['2026-11-30']), 'date=' + dl(x)] },
  { f: 'fixture-02_scholarship_hinglish.png', name: '02 Hinglish scheme', check: (x, raw) => [dateIn(x, ['2026-12-15']), 'date=' + dl(x)] },
  { f: 'fixture-03_exam_form.png', name: '03 Exam form (2 dates)', check: (x, raw) => [dateIn(x, ['2026-10-25']), 'date=' + dl(x) + (raw.toLowerCase().includes('late fee') ? ' · late-fee noted' : '')] },
  { f: 'fixture-04_competition_poster.png', name: '04 Competition poster', check: (x, raw) => [dateIn(x, ['2026-11-05', '2026-11-10']), 'date=' + dl(x)] },
  { f: 'fixture-05_circular_no_deadline.png', name: '05 STAR no-deadline', check: (x, raw) => [x.deadline && x.deadline.found === false, x.deadline && x.deadline.found === false ? 'refused to invent (correct)' : 'INVENTED date=' + dl(x)] },
  { f: 'fixture-06_faded_news_ad.png', name: '06 Faded news ad', check: (x, raw) => [dateIn(x, ['2026-11-20']) || flagged(x), 'date=' + dl(x) + ' conf=' + x.confidence] },
  { f: 'fixture-07_sports_notice.png', name: '07 Sports notice', check: (x, raw) => [dateIn(x, ['2026-11-01', '2026-11-08']), 'date=' + dl(x)] },
  { f: 'fixture-08_handwritten_teacher.png', name: '08 Handwritten (relative day)', check: (x, raw) => [(x.deadline && x.deadline.found === false) || String(x.deadline && x.deadline.as_printed || '').toLowerCase().includes('friday'), 'deadline=' + dl(x) + ' found=' + !!(x.deadline && x.deadline.found)] },
  { f: 'fixture-09_admission_form.png', name: '09 Admission (2 dates)', check: (x, raw) => [dateIn(x, ['2027-06-10', '2027-06-20']), 'date=' + dl(x)] },
  { f: 'fixture-10_torn_corner.png', name: '10 STAR torn corner', check: (x, raw) => [dateIn(x, ['2026-12-05']) || flagged(x), 'date=' + dl(x) + ' conf=' + x.confidence + ' unread=' + JSON.stringify(x.unreadable || [])] },
  { f: 'fixture-11_newspaper_two_ads.png', name: '11 STAR two ads one photo', check: (x, raw) => {
      const both = (raw.includes('2026-11-30') || raw.toLowerCase().includes('30 november')) && (raw.includes('2026-12-15') || raw.toLowerCase().includes('15 december'));
      return [(dateIn(x, ['2026-11-30', '2026-12-15']) && both) || flagged(x), 'date=' + dl(x) + ' · both-dates-mentioned=' + both];
    } },
  { f: 'fixture-12_handwritten_hindi_note.png', name: '12 Handwritten Roman-Hindi', check: (x, raw) => [flagged(x) || String(x.deadline && x.deadline.as_printed || '').includes('20') || dateIn(x, ['2026-11-20']), 'deadline=' + dl(x) + ' conf=' + x.confidence] },
  { f: 'fixture-13_glare_tilt_variant.png', name: '13 Glare + tilt', check: (x, raw) => [dateIn(x, ['2026-11-30']) || flagged(x), 'date=' + dl(x) + ' conf=' + x.confidence] },
  { f: 'fixture-14_blur_lowres_variant.png', name: '14 Blur + low-res', check: (x, raw) => [dateIn(x, ['2026-10-25']) || flagged(x), 'date=' + dl(x) + ' conf=' + x.confidence] },
];

/* ---------- pipeline (ported from app.js — identical logic) ---------- */
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

async function gemini(prompt, image) {
  const key = localStorage.getItem(KEY_LS);
  if (!key) throw new Error('No API key.');
  let lastErr = null;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: image.mime, data: image.b64 } }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      });
      if (!res.ok) { lastErr = new Error('API ' + res.status + ' ' + model); if (res.status === 404 || res.status === 400) continue; throw lastErr; }
      const data = await res.json();
      const txt = data.candidates[0].content.parts[0].text;
      if (!txt) throw new Error('Empty response');
      return txt;
    } catch (e) { lastErr = e; if (!String(e.message).startsWith('API 4')) throw e; }
  }
  throw lastErr || new Error('All models failed');
}

function parseJson(t) { return JSON.parse(t.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()); }

async function loadFixture(file) {
  const r = await fetch(file);
  if (!r.ok) throw new Error('fixture missing: ' + file);
  const b = await r.blob();
  const url = URL.createObjectURL(b);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  URL.revokeObjectURL(url);
  return img;
}

/* ---------- runner UI ---------- */
const $ = (s) => document.querySelector(s);
let results = [];

$('#key').value = localStorage.getItem(KEY_LS) || '';

$('#run').addEventListener('click', async () => {
  const key = $('#key').value.trim();
  if (!key) { $('#status').textContent = 'Paste your Gemini API key first.'; return; }
  localStorage.setItem(KEY_LS, key);
  $('#run').disabled = true; $('#copy').disabled = true;
  results = [];
  $('#out').innerHTML = ''; $('#summary').textContent = '';
  let pass = 0;
  for (let i = 0; i < FIX.length; i++) {
    const fx = FIX[i];
    $('#status').textContent = `Running ${i + 1}/${FIX.length}: ${fx.name} ...`;
    const t0 = performance.now();
    try {
      const img = await loadFixture(fx.f);
      const pre = preprocess(img);
      const raw = await gemini(EXTRACT_PROMPT, pre);
      const x = parseJson(raw);
      const ms = Math.round(performance.now() - t0);
      const [ok, note] = fx.check(x, raw);
      if (ok) pass++;
      results.push({ name: fx.name, pass: ok, date: dl(x), conf: x.confidence, ms, note });
    } catch (e) {
      results.push({ name: fx.name, pass: false, date: '-', conf: '-', ms: Math.round(performance.now() - t0), note: 'ERROR: ' + e.message });
    }
    renderTable();
  }
  $('#status').textContent = 'Done.';
  $('#summary').textContent = `PASS ${pass}/${FIX.length} — honesty score ${Math.round(pass / FIX.length * 100)}%`;
  $('#run').disabled = false; $('#copy').disabled = false;
});

function renderTable() {
  let html = '<table><thead><tr><th>Fixture</th><th>Result</th><th>Deadline read</th><th>Conf</th><th>ms</th><th>Note</th></tr></thead><tbody>';
  results.forEach(r => {
    html += `<tr><td>${r.name}</td><td class="${r.pass ? 'p' : 'f'}">${r.pass ? 'PASS' : 'FAIL'}</td><td>${esc(r.date)}</td><td>${esc(String(r.conf))}</td><td>${r.ms}</td><td>${esc(r.note)}</td></tr>`;
  });
  html += '</tbody></table>';
  $('#out').innerHTML = html;
}
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

$('#copy').addEventListener('click', () => {
  const lines = ['fixture\tresult\tdeadline\tconfidence\tms\tnote'];
  results.forEach(r => lines.push([r.name, r.pass ? 'PASS' : 'FAIL', r.date, r.conf, r.ms, r.note].join('\t')));
  const pass = results.filter(r => r.pass).length;
  lines.push('TOTAL\tPASS ' + pass + '/' + results.length);
  navigator.clipboard.writeText(lines.join('\n')).then(() => { $('#status').textContent = 'Copied TSV — paste it in chat.'; });
});
