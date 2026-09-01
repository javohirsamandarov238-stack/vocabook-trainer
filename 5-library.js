/* ============================================================
   Vocabulary library — expandable cards, not a table
   ============================================================ */
let lib = { q: '', filter: 'all', chapter: 'all', sort: 'book', shown: 48, open: null };

function libMatches() {
  const q = lib.q.trim().toLowerCase();
  let out = VOCAB.map((_, i) => i);

  if (lib.filter !== 'all') out = out.filter(i => band(i) === lib.filter);
  if (lib.chapter !== 'all') out = out.filter(i => VOCAB[i].chapter === lib.chapter);
  if (q) out = out.filter(i => {
    const e = VOCAB[i];
    return e.word.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q)
        || e.antonym.toLowerCase().includes(q) || e.example.toLowerCase().includes(q);
  });

  if (lib.sort === 'az') out.sort((a, b) => plainWord(a).localeCompare(plainWord(b)));
  else if (lib.sort === 'weakest') out.sort((a, b) => {
    const aa = accOf(a), ba = accOf(b);
    if (aa === null && ba === null) return 0;
    if (aa === null) return 1;
    if (ba === null) return -1;
    return aa - ba;
  });
  else if (lib.sort === 'attempts') out.sort((a, b) => (S.w[b]?.n || 0) - (S.w[a]?.n || 0));
  return out;
}

function entryHtml(i) {
  const e = VOCAB[i];
  const r = S.w[i];
  const a = accOf(i);
  const lvl = r ? r.l : 0;
  const weak = band(i) === 'weak';
  const open = lib.open === i;

  return `<button class="entry${open ? ' open' : ''}" data-entry="${i}" aria-expanded="${open}">
    <div class="entry-w">${esc(plainWord(i))}${e.pos ? `<span class="pos">${esc(e.pos)}</span>` : ''}</div>
    <div class="entry-def">${esc(e.definition)}</div>
    <div class="entry-more">
      <div class="entry-ex">${exampleWithEm(i)}</div>
      ${e.antonym ? `<div class="entry-ant">Opposite &middot; ${esc(e.antonym)}</div>` : ''}
      <div class="entry-src">${esc(e.chapter)}${e.set ? `, set ${e.set}` : ''} &middot; ${esc(e.difficulty)}${
        plainWord(i) !== e.word ? ` &middot; listed as &ldquo;${esc(e.word)}&rdquo;` : ''}</div>
      ${e.issues && e.issues.length ? `<div class="entry-flag">${e.issues.map(esc).join(' ')}</div>` : ''}
    </div>
    <div class="entry-foot">
      <span class="mastery-t"><i class="mastery-f${weak ? ' weak' : ''}" style="width:${(lvl / 5) * 100}%"></i></span>
      <span class="entry-stat">${r && r.n ? `${Math.round(a * 100)}% of ${r.n}` : 'Not tested'}</span>
    </div>
  </button>`;
}

const LIB_FILTERS = [['all', 'All'], ['weak', 'Weak'], ['medium', 'Medium'], ['strong', 'Strong'], ['new', 'Never tested']];

/* Only the results are redrawn as you type. Rebuilding the whole panel
   would destroy the search box mid-keystroke, losing the caret. */
function renderLibResults() {
  const ids = libMatches();
  const s = summary();
  const counts = { all: VOCAB.length, weak: s.weak, medium: s.medium, strong: s.strong, new: s.untested };

  $$('[data-filter]').forEach(b => {
    b.setAttribute('aria-pressed', String(lib.filter === b.dataset.filter));
    const c = b.querySelector('span');
    if (c) c.textContent = counts[b.dataset.filter];
  });

  const box = $('#libResults');
  if (!box) return;
  box.innerHTML = `
    <p class="small faint" style="margin:0 0 16px">${ids.length.toLocaleString()} word${ids.length === 1 ? '' : 's'}${ids.length ? ' &middot; tap a card for its sentence' : ' \u2014 try a different search or filter'}</p>
    ${ids.length ? `<div class="cards">${ids.slice(0, lib.shown).map(entryHtml).join('')}</div>
      ${ids.length > lib.shown ? `<div style="text-align:center;margin-top:30px"><button class="btn" data-act="more">Show more (${ids.length - lib.shown} left)</button></div>` : ''}
      ${ids.length <= 400 ? `<div style="text-align:center;margin-top:18px"><button class="btn btn-primary" data-act="drill-filtered">Test me on these ${ids.length} words ${ICON.arrow}</button></div>` : ''}`
      : `<div class="empty"><h3>Nothing matches</h3><p class="small">Clear the search box or pick a different filter.</p></div>`}`;
}

function viewLibrary() {
  const chapters = [...new Set(VOCAB.map(v => v.chapter))];
  app().innerHTML = `
  <div style="padding-top:64px">
    <div class="eyebrow">Your collection</div>
    <h1 class="hero-title" style="font-size:clamp(2.3rem,5vw,3.6rem);margin-top:14px">Every word you own.</h1>
    <p class="hero-sub">Straight from the Vocabook, with your own record attached to each one.</p>
  </div>
  <div class="lib-bar">
    <label class="search">${ICON.search}
      <input id="q" type="search" placeholder="Search words, meanings, sentences" value="${esc(lib.q)}" autocomplete="off">
    </label>
    <select class="sel" id="chapter">
      <option value="all">All sources</option>
      ${chapters.map(c => `<option value="${esc(c)}"${lib.chapter === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
    </select>
    <select class="sel" id="sort">
      <option value="book"${lib.sort === 'book' ? ' selected' : ''}>Vocabook order</option>
      <option value="az"${lib.sort === 'az' ? ' selected' : ''}>A to Z</option>
      <option value="weakest"${lib.sort === 'weakest' ? ' selected' : ''}>Weakest first</option>
      <option value="attempts"${lib.sort === 'attempts' ? ' selected' : ''}>Most attempted</option>
    </select>
  </div>
  <div class="chips" style="margin-bottom:24px">
    ${LIB_FILTERS.map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${lib.filter === k}">${l} <span></span></button>`).join('')}
  </div>
  <div id="libResults"></div>`;
  renderLibResults();
}

/* ============================================================
   Progress
   ============================================================ */
function lineChart(values, labels) {
  if (values.length < 2) return `<p class="small faint" style="margin:0">Finish two tests and your trend appears here.</p>`;
  const W = 640, H = 210, PL = 34, PR = 12, PT = 16, PB = 28;
  const iw = W - PL - PR, ih = H - PT - PB;
  const x = k => PL + (k / (values.length - 1)) * iw;
  const y = v => PT + ih - (v / 100) * ih;
  const pts = values.map((v, k) => [x(k), y(v)]);
  const d = pts.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const grid = [0, 25, 50, 75, 100].map(v =>
    `<line class="gl" x1="${PL}" y1="${y(v)}" x2="${W - PR}" y2="${y(v)}"/>
     <text class="at" x="${PL - 9}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('');
  const dots = pts.map((p, k) => `<circle class="dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.6"><title>${labels[k]}: ${values[k]}%</title></circle>`).join('');
  const xl = values.map((_, k) => (k === 0 || k === values.length - 1 || values.length <= 8)
    ? `<text class="at" x="${x(k)}" y="${H - 6}" text-anchor="middle">${labels[k]}</text>` : '').join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Accuracy across recent tests">
    ${grid}<path class="ln" d="${d}"/>${dots}${xl}</svg></div>`;
}

function viewProgress() {
  const s = summary();
  const recent = S.tests.slice(-7);
  const acc = recent.map(t => pct(t.correct, t.total));
  const labels = recent.map(t => { const d = new Date(t.ts); return `${d.getDate()}/${d.getMonth() + 1}`; });

  const agg = typeAccuracy(S.tests);
  const typeRows = Object.entries(agg).map(([k, [c, x]]) => {
    const tot = c + x, pp = pct(c, tot);
    return `<div class="bar"><span>${KINDS[k].short}</span>
      <span class="bar-t"><i class="bar-f" style="width:${pp}%"></i></span>
      <span class="v">${c}/${tot} &middot; ${pp}%</span></div>`;
  }).join('') || `<p class="small faint" style="margin:0">No questions answered yet.</p>`;

  const dist = [['Mastered', s.mastered, 'linear-gradient(90deg,var(--accent-2),var(--accent))'],
                ['Strong', Math.max(0, s.strong - s.mastered), 'var(--accent-2)'],
                ['Medium', s.medium, 'color-mix(in srgb,var(--accent) 45%,transparent)'],
                ['Weak', s.weak, 'var(--bad)'],
                ['Never tested', s.untested, 'var(--line-2)']];

  app().innerHTML = `
  <div style="padding-top:64px">
    <div class="eyebrow">Progress</div>
    <h1 class="hero-title" style="font-size:clamp(2.3rem,5vw,3.6rem);margin-top:14px">${
      S.tests.length ? 'How it is going.' : 'Nothing to plot yet.'}</h1>
    <p class="hero-sub">${S.tests.length
      ? `Across ${S.tests.length} test${S.tests.length === 1 ? '' : 's'} and ${s.answered.toLocaleString()} questions.`
      : 'Take a test and your history builds up here.'}</p>
  </div>

  <div class="metrics" style="margin-top:12px">
    <div class="metric"><div class="n tabular" data-count="${s.mastered}">0</div><div class="k">Words mastered</div></div>
    <div class="metric"><div class="n tabular" data-count="${s.review}">0</div><div class="k">Needing review</div></div>
    <div class="metric"><div class="n tabular" data-count="${s.answered}">0</div><div class="k">Questions answered</div></div>
    <div class="metric"><div class="n tabular" data-count="${s.accuracy}" data-suffix="%">0%</div><div class="k">Overall accuracy</div></div>
  </div>

  <div class="sec">
    <div class="sec-h"><div class="eyebrow">Accuracy over your last ${recent.length} test${recent.length === 1 ? '' : 's'}</div></div>
    <div class="panel">${lineChart(acc, labels)}</div>
  </div>

  <div class="two" style="margin-top:16px">
    <div class="panel">
      <h3>Where your words stand</h3>
      <div class="psub">All ${s.total.toLocaleString()} Vocabook words</div>
      <div class="bars">${dist.map(([l, n, c]) => `<div class="bar"><span>${l}</span>
        <span class="bar-t"><i class="bar-f" style="width:${(n / s.total) * 100}%;background:${c}"></i></span>
        <span class="v tabular">${n}</span></div>`).join('')}</div>
    </div>
    <div class="panel">
      <h3>Accuracy by question type</h3>
      <div class="psub">All time</div>
      <div class="bars">${typeRows}</div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-h"><div class="eyebrow">Recent tests</div></div>
    ${S.tests.length ? `<div class="hist">${S.tests.slice().reverse().slice(0, 12).map(t => {
      const d = new Date(t.ts);
      const name = t.kind === 'daily' ? 'Daily challenge' : t.kind === 'review' ? 'Review mistakes'
        : t.kind === 'weak' ? 'Weak words' : (t.mode === 'mixed' ? 'Mixed test' : (KINDS[t.mode]?.label || 'Test'));
      return `<div class="hist-row"><div class="ht"><div class="hn">${name}</div>
        <div class="hm">${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &middot; ${t.total} questions &middot; ${Math.round(t.secs / 60) || '<1'} min</div></div>
        <div class="hp">${pct(t.correct, t.total)}%</div></div>`;
    }).join('')}</div>` : `<div class="empty"><h3>No tests yet</h3><p class="small">Take one and it shows up here.</p></div>`}
  </div>

  <div class="sec">
    <div class="sec-h"><div class="eyebrow">Your data</div></div>
    <p class="hero-sub" style="margin-top:0">Progress is stored ${Store.mode === 'memory'
      ? 'in memory only \u2014 this browser is blocking storage, so a refresh will clear it.'
      : 'on this device. Nothing is sent anywhere.'}</p>
    <div style="display:flex;gap:11px;flex-wrap:wrap">
      <button class="btn" data-act="export">Download my progress</button>
      <button class="btn" data-act="import">Load from a file</button>
      <button class="btn" data-act="reset">Reset everything</button>
    </div>
  </div>`;

  animateNumbers();
  requestAnimationFrame(() => $$('.bar-f').forEach(b => { const w = b.style.width; b.style.width = '0'; requestAnimationFrame(() => b.style.width = w); }));
}

/* ============================================================
   Events
   ============================================================ */
function onClick(e) {
  const t = e.target;

  const tab = t.closest('[data-tab]');
  if (tab) return go(tab.dataset.tab);

  const opt = t.closest('[data-opt]');
  if (opt && view === 'quiz') return answerQuestion(+opt.dataset.opt);

  const setc = t.closest('[data-set]');
  if (setc) {
    const v = setc.dataset.val;
    cfg[setc.dataset.set] = (setc.dataset.set === 'count' && v !== 'all') ? +v : v;
    return viewSetup();
  }
  const tog = t.closest('[data-toggle]');
  if (tog) { cfg[tog.dataset.toggle] = !cfg[tog.dataset.toggle]; return viewSetup(); }

  const mode = t.closest('[data-mode]');
  if (mode) { cfg = { ...cfg, mode: mode.dataset.mode }; return go('setup'); }

  const filt = t.closest('[data-filter]');
  if (filt) { lib.filter = filt.dataset.filter; lib.shown = 48; return renderLibResults(); }

  const entry = t.closest('[data-entry]');
  if (entry) {
    const i = +entry.dataset.entry;
    lib.open = lib.open === i ? null : i;
    return renderLibResults();
  }

  const wc = t.closest('[data-word]');
  if (wc && !t.closest('[data-act]')) {
    const i = +wc.dataset.word;
    lib.q = plainWord(i); lib.filter = 'all'; lib.chapter = 'all'; lib.shown = 48; lib.open = i;
    return go('library');
  }

  const act = t.closest('[data-act]');
  if (!act) return;
  switch (act.dataset.act) {
    case 'adaptive':
      return startTest({ ...DEFAULT_CFG, difficulty: 'adaptive', mode: 'mixed', count: 20 }, { kind: 'test' });
    case 'start':
      return startTest({ ...cfg }, { kind: 'test' });
    case 'daily':
      return startTest({ count: 10, mode: 'mixed', difficulty: 'adaptive', onlyIds: dailyWords(10), randomize: true, seed: hashStr(today()) }, { kind: 'daily' });
    case 'review': {
      if (!S.review.length) return toast('Your review list is empty.');
      return startTest({ count: Math.min(20, S.review.length), mode: 'mixed', difficulty: 'adaptive', onlyIds: S.review.slice(), randomize: true }, { kind: 'review' });
    }
    case 'weak': {
      const weak = VOCAB.map((_, i) => i).filter(i => band(i) === 'weak');
      const pool = weak.length ? weak : S.review.slice();
      if (!pool.length) return toast('No weak words yet. Take a test first.');
      return startTest({ count: Math.min(20, pool.length), mode: 'mixed', difficulty: 'adaptive', onlyIds: pool, randomize: true }, { kind: 'weak' });
    }
    case 'drill-filtered': {
      const ids = libMatches();
      if (!ids.length) return;
      return startTest({ count: Math.min(30, ids.length), mode: 'mixed', difficulty: 'adaptive', onlyIds: ids, randomize: true }, { kind: 'test' });
    }
    case 'retake': return startTest({ ...quiz.cfg }, { ...quiz.meta });
    case 'next': return nextQuestion();
    case 'more': lib.shown += 48; return renderLibResults();
    case 'quit':
      return confirmDialog('Leave this test?', 'Answers you have already given are saved. The rest of the test is discarded.', 'Leave test', () => go('dash'));
    case 'export': return exportProgress();
    case 'import': return $('#file').click();
    case 'reset':
      return confirmDialog('Reset all progress?', 'Every score, streak and review word is deleted. Your vocabulary stays.', 'Reset everything', async () => {
        await Store.wipe(); S = BLANK_STATE(); saveState(); applyTheme(); go('dash'); toast('Progress reset.');
      });
  }
}

function onInput(e) {
  if (e.target.id === 'q') { lib.q = e.target.value; lib.shown = 48; renderLibResults(); }
}
function onChange(e) {
  if (e.target.id === 'chapter') { lib.chapter = e.target.value; lib.shown = 48; renderLibResults(); }
  if (e.target.id === 'sort') { lib.sort = e.target.value; lib.shown = 48; renderLibResults(); }
  if (e.target.id === 'file') importProgress(e.target.files[0]);
}
function onKey(e) {
  const t = e.target;
  if (t && typeof t.matches === 'function' && t.matches('input, select, textarea')) return;
  if (view !== 'quiz') return;
  if (!quiz.locked) {
    const k = ['1', '2', '3', '4'].indexOf(e.key);
    const l = ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
    if (k > -1) { e.preventDefault(); return answerQuestion(k); }
    if (l > -1) { e.preventDefault(); return answerQuestion(l); }
  } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return nextQuestion(); }
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vocabook-progress-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Progress downloaded.');
}
function importProgress(file) {
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!d || typeof d !== 'object' || !('w' in d)) throw new Error('not a progress file');
      S = Object.assign(BLANK_STATE(), d);
      S.settings = Object.assign({ theme: 'auto' }, d.settings);
      saveState(); applyTheme(); go('progress'); toast('Progress loaded.');
    } catch (err) { toast('That file is not a Vocabook progress file.'); }
  };
  fr.readAsText(file);
}

/* ============================================================
   Router + boot
   ============================================================ */
function render() {
  renderChrome();
  switch (view) {
    case 'setup':    return viewSetup();
    case 'quiz':     return viewQuiz();
    case 'results':  return viewResults();
    case 'library':  return viewLibrary();
    case 'progress': return viewProgress();
    default:         return viewDash();
  }
}

async function boot() {
  ensureSpans();
  await Store.detect();
  const saved = await Store.load();
  if (saved && saved.w) {
    S = Object.assign(BLANK_STATE(), saved);
    S.settings = Object.assign({ theme: 'auto' }, saved.settings);
    S.streak = Object.assign({ cur: 0, best: 0, last: null }, saved.streak);
    if (saved.lastConfig) cfg = Object.assign({ ...DEFAULT_CFG }, saved.lastConfig);
  }
  applyTheme();
  mq('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', moveIndicator);
  $('#themeBtn').addEventListener('click', cycleTheme);

  const b = $('#boot'); if (b) b.remove();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
