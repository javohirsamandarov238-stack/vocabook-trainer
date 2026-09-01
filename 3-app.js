/* ============================================================
   Shell, navigation, dashboard, setup
   ============================================================ */

const ICON = {
  sun:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  x:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  arrow:'<svg class="arw" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
};

let view = 'dash';
const app = () => $('#app');

function go(v) {
  view = v;
  document.body.classList.toggle('focus-mode', v === 'quiz');
  render();
  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2400);
}

function confirmDialog(title, body, okLabel, onOk) {
  const wrap = document.createElement('div');
  wrap.className = 'scrim';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h2>${esc(title)}</h2><p>${esc(body)}</p>
      <div class="acts"><button class="btn" data-no>Cancel</button>
      <button class="btn btn-primary" data-yes>${esc(okLabel)}</button></div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-no]')) close(); });
  wrap.querySelector('[data-yes]').addEventListener('click', () => { close(); onOk(); });
  wrap.querySelector('[data-yes]').focus();
}

/* matchMedia is universal in browsers, but guard it so an odd embedding
   context degrades instead of failing to boot */
const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false, addEventListener() {} });

/* ---------------- theme ---------------- */
function applyTheme() {
  const pref = S.settings.theme;
  const dark = pref === 'dark' || (pref === 'auto' && mq('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const b = $('#themeBtn');
  if (b) { b.innerHTML = dark ? ICON.sun : ICON.moon; b.title = dark ? 'Switch to paper' : 'Switch to dark'; }
}
function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  S.settings.theme = order[(order.indexOf(S.settings.theme) + 1) % 3];
  saveState(); applyTheme();
  toast(S.settings.theme === 'auto' ? 'Theme follows your system' : `Theme: ${S.settings.theme}`);
}

/* ---------------- navigation ---------------- */
const TABS = [['dash', 'Home'], ['setup', 'Study'], ['library', 'Words'], ['progress', 'Progress']];

function renderChrome() {
  const active = (view === 'quiz' || view === 'results') ? 'setup' : view;
  $('#tabs').innerHTML =
    TABS.map(([k, l]) => `<button data-tab="${k}"${active === k ? ' aria-current="page"' : ''}>${l}</button>`).join('') +
    '<span class="nav-ind" id="navInd" style="opacity:0"></span>';
  requestAnimationFrame(moveIndicator);
}

/* the active pill slides between tabs rather than blinking on */
function moveIndicator() {
  const ind = $('#navInd'), cur = $('#tabs button[aria-current="page"]');
  if (!ind) return;
  if (!cur) { ind.style.opacity = '0'; return; }
  ind.style.left = cur.offsetLeft + 'px';
  ind.style.width = cur.offsetWidth + 'px';
  ind.style.opacity = '1';
}

/* ---------------- number count-up ---------------- */
function countUp(el, to, suffix = '') {
  const fmt = n => n.toLocaleString() + suffix;
  if (mq('(prefers-reduced-motion: reduce)').matches || to === 0) {
    el.textContent = fmt(to); return;
  }
  const dur = 900, t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
function animateNumbers() {
  $$('[data-count]').forEach(el => countUp(el, +el.dataset.count, el.dataset.suffix || ''));
}

/* ---------------- shared svg bits ---------------- */
function ring(size, stroke, pctVal, color) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
    <circle class="fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
      stroke="${color}" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-dash="${C * (1 - pctVal / 100)}"/>
  </svg>`;
}
function animateRings() {
  $$('circle.fill[data-dash]').forEach(c => {
    requestAnimationFrame(() => requestAnimationFrame(() => { c.style.strokeDashoffset = c.dataset.dash; }));
  });
}

function sparkline(values) {
  if (values.length < 2) return '';
  const W = 300, H = 46;
  const min = Math.min(...values, 0), max = Math.max(...values, 100);
  const x = k => (k / (values.length - 1)) * W;
  const y = v => H - ((v - min) / (max - min || 1)) * H;
  const d = values.map((v, k) => (k ? 'L' : 'M') + x(k).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const last = values.length - 1;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
    aria-label="Accuracy across your last ${values.length} tests">
    <path class="l" d="${d}"/><circle cx="${x(last).toFixed(1)}" cy="${y(values[last]).toFixed(1)}" r="3.2"/></svg>`;
}

/* ============================================================
   Dashboard
   ============================================================ */
function viewDash() {
  const s = summary();
  const sess = todaySession();
  const started = s.answered > 0;
  const dailyDone = S.daily && S.daily.date === today() && S.daily.done;
  const ins = insights();

  const recent = S.tests.slice(-8).map(t => pct(t.correct, t.total));
  const trend = recent.length >= 2 ? recent[recent.length - 1] - recent[0] : null;

  const greeting = !started
    ? `Your vocabulary.<span>Starts here.</span>`
    : sess.raw >= DAILY_GOAL
      ? `Today is done.<span>Come back sharper.</span>`
      : `Your vocabulary.<span>Getting sharper.</span>`;

  const sub = !started
    ? `<b>${s.total.toLocaleString()} Vocabook words</b> in your collection, none tested yet. One session is about eight minutes.`
    : `<b>${s.total.toLocaleString()} Vocabook words</b> &middot; <b>${s.mastered}</b> mastered &middot; ${
        sess.raw >= DAILY_GOAL ? 'today&rsquo;s goal met.' : `${DAILY_GOAL - sess.raw} more questions to hit today&rsquo;s goal.`}`;

  const diffCount = k => VOCAB.filter(v => v.difficulty === k).length;
  const sources = new Set(VOCAB.map(v => v.chapter)).size;

  /* A brand-new account has nothing to report, and six zeros is a dead
     first impression. Show the shape of the collection instead — still
     real data, just the only real data there is on day one. */
  const overview = started ? `
    <div class="big-stat">
      <div class="eyebrow" style="margin-bottom:14px">Your progress</div>
      <div class="n"><span data-count="${s.accuracy}" data-suffix="%">0%</span></div>
      <div class="k">overall accuracy</div>
      <div class="mini-stats">
        <span class="mini"><b>${questionsThisWeek()}</b> questions this week</span>
        <span class="mini"><b>${s.mastered}</b> words mastered</span>
        <span class="mini attn"><b>${s.review}</b> need attention</span>
      </div>
    </div>
    <div>
      ${recent.length >= 2 ? sparkline(recent) +
        `<div class="spark-note">last ${recent.length} tests${trend !== null ? ` &middot; ${trend >= 0 ? '+' : ''}${trend}%` : ''}</div>`
        : `<p class="small faint" style="margin:0">Your accuracy trend appears here once you have finished two tests.</p>`}
    </div>` : `
    <div class="big-stat">
      <div class="eyebrow" style="margin-bottom:14px">Your collection</div>
      <div class="n"><span data-count="${s.total}">0</span></div>
      <div class="k">words waiting, drawn from ${sources} sources in the Vocabook</div>
      <div class="mini-stats">
        <span class="mini"><b>${diffCount('easy')}</b> easy</span>
        <span class="mini"><b>${diffCount('medium')}</b> medium</span>
        <span class="mini"><b>${diffCount('hard')}</b> hard</span>
      </div>
    </div>
    <div>
      <div class="spine-bar" role="img" aria-label="Difficulty spread across the collection">
        <i style="width:${(diffCount('easy') / s.total) * 100}%;background:color-mix(in srgb,var(--accent) 40%,transparent)"></i>
        <i style="width:${(diffCount('medium') / s.total) * 100}%;background:var(--accent-2)"></i>
        <i style="width:${(diffCount('hard') / s.total) * 100}%;background:var(--accent)"></i>
      </div>
      <div class="spark-note">difficulty spread across all ${s.total.toLocaleString()} words</div>
    </div>`;

  app().innerHTML = `
  <section class="hero">
    <div class="rise">
      <h1 class="hero-title">${greeting}</h1>
      <p class="hero-sub">${sub}</p>
      <button class="btn btn-primary btn-lg" data-act="adaptive">Start today&rsquo;s session ${ICON.arrow}</button>
    </div>

    <div class="orb rise d1">
      ${ring(258, 9, sess.pct, 'var(--accent)')}
      <div class="orb-in">
        <div class="orb-n"><span data-count="${sess.done}">0</span><em>/${sess.goal}</em></div>
        <div class="orb-k">questions in today&rsquo;s session</div>
      </div>
    </div>
  </section>

  <section class="overview rise d2">
    ${overview}
  </section>

  <section class="challenge rise d3">
    <div class="challenge-txt">
      <div class="eyebrow">Today&rsquo;s challenge</div>
      <h2>${dailyDone ? 'You caught them today.' : 'The words that are trying to escape you.'}</h2>
      <p class="muted" style="margin:0;max-width:42ch">${dailyDone
        ? `You scored ${S.daily.correct} of ${S.daily.total} on today&rsquo;s ten. Run it again if you want another pass.`
        : 'Ten words chosen from what you miss most, what you have not seen in a while, and what is nearly mastered.'}</p>
      <div class="meta"><span>~8 min</span><span>10 questions</span><span>Adaptive</span></div>
      <button class="btn ${dailyDone ? '' : 'btn-primary'}" data-act="daily">${dailyDone ? 'Practise again' : 'Begin challenge'} ${ICON.arrow}</button>
    </div>
    <div class="challenge-art" aria-hidden="true">
      <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
      <div class="ring"></div><div class="ring r2"></div><div class="ring r3"></div>
    </div>
  </section>

  ${ins.length ? `<section class="sec">
    <div class="sec-h"><div class="eyebrow">What your record shows</div></div>
    <div class="insights">${ins.map(i => `
      <${i.action ? 'button' : 'div'} class="insight ${i.cls}"${i.action ? ` data-act="${i.action}"` : ''}${i.word !== undefined ? ` data-word="${i.word}"` : ''}>
        <div class="ih eyebrow">${esc(i.head)}</div>
        <div class="iw${i.bigSmall ? ' sm' : ''}">${esc(i.big)}</div>
        <p>${i.body}</p>
        ${i.action ? `<span class="ilink">${esc(i.actionLabel)} ${ICON.arrow}</span>` : ''}
      </${i.action ? 'button' : 'div'}>`).join('')}</div>
  </section>` : ''}

  <section class="sec">
    <div class="sec-h">
      <div class="eyebrow">Choose your training</div>
      <span class="more">Every question is built from your own ${s.total.toLocaleString()} words</span>
    </div>
    <div class="modes">
      ${[['wd', 'Recognize', 'Word to definition', 'See the word, choose what it means.'],
         ['dw', 'Recall', 'Definition to word', 'See the meaning, produce the word.'],
         ['blank', 'Complete', 'Fill in the blank', 'The word is cut out of its sentence.'],
         ['context', 'Understand', 'Meaning in context', 'Work the sense out from the sentence alone.']]
        .map(([k, t, d, sdesc], n) => `
        <button class="mode" data-mode="${k}">
          <div class="mode-n">0${n + 1}</div>
          <div class="mode-body">
            <div class="mode-t">${t}</div>
            <div class="mode-d">${d}</div>
            <div class="mode-s">${sdesc}</div>
          </div>
          <span class="mode-go">${ICON.arrow}</span>
        </button>`).join('')}
    </div>
    <button class="mode feature" data-mode="mixed">
      <div class="mode-n">05</div>
      <div class="mode-body">
        <div class="mode-t">Mix it up</div>
        <div class="mode-d">Adaptive mixed test</div>
        <div class="mode-s">All four formats, shuffled, weighted towards your weak words. The recommended route.</div>
      </div>
      <span class="mode-go">${ICON.arrow}</span>
    </button>
    ${s.review ? `<div style="margin-top:26px"><button class="btn" data-act="review">Review the ${s.review} word${s.review === 1 ? '' : 's'} you have missed ${ICON.arrow}</button></div>` : ''}
  </section>`;

  animateNumbers();
  animateRings();
}

/* ============================================================
   Setup
   ============================================================ */
const DEFAULT_CFG = { count: 20, difficulty: 'adaptive', mode: 'mixed', includeMissed: true, randomize: true };
let cfg = { ...DEFAULT_CFG };

function viewSetup() {
  const s = summary();
  const counts = [10, 20, 30, 50, 'all'];
  const diffs = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['adaptive', 'Adaptive']];
  const modes = [['wd', 'Recognize'], ['dw', 'Recall'], ['blank', 'Complete'], ['context', 'Understand'], ['mixed', 'Mixed']];
  const avail = cfg.difficulty === 'adaptive' ? VOCAB.length : VOCAB.filter(v => v.difficulty === cfg.difficulty).length;

  app().innerHTML = `
  <div class="setup">
    <div class="eyebrow rise">Build a session</div>
    <h1 class="hero-title rise" style="font-size:clamp(2.3rem,5vw,3.6rem);margin-top:14px">Set your terms.</h1>
    <p class="hero-sub rise d1" style="margin-bottom:44px">Questions are generated from your ${VOCAB.length.toLocaleString()} Vocabook words. Nothing is invented.</p>

    <div class="field">
      <div class="flab">Number of questions</div>
      <div class="chips">${counts.map(c =>
        `<button class="chip" data-set="count" data-val="${c}" aria-pressed="${String(cfg.count) === String(c)}">${c === 'all' ? `All <span>${avail}</span>` : c}</button>`).join('')}</div>
    </div>

    <div class="field">
      <div class="flab">Difficulty</div>
      <div class="fhint">Adaptive ignores the bands and goes after the words you are weakest on.</div>
      <div class="chips">${diffs.map(([k, l]) => {
        const n = k === 'adaptive' ? VOCAB.length : VOCAB.filter(v => v.difficulty === k).length;
        return `<button class="chip" data-set="difficulty" data-val="${k}" aria-pressed="${cfg.difficulty === k}">${l} <span>${n}</span></button>`;
      }).join('')}</div>
    </div>

    <div class="field">
      <div class="flab">Question format</div>
      <div class="chips">${modes.map(([k, l]) =>
        `<button class="chip" data-set="mode" data-val="${k}" aria-pressed="${cfg.mode === k}">${l}</button>`).join('')}</div>
    </div>

    <div class="switch-row">
      <div class="st"><div class="sl">Include previously missed words</div>
        <div class="ss">${s.review ? `${s.review} word${s.review === 1 ? '' : 's'} on your review list.` : 'Your review list is empty right now.'}</div></div>
      <button class="switch" data-toggle="includeMissed" aria-pressed="${!!cfg.includeMissed}" aria-label="Include previously missed words"></button>
    </div>
    <div class="switch-row">
      <div class="st"><div class="sl">Randomise question order</div>
        <div class="ss">Turn this off to move through the words in Vocabook order.</div></div>
      <button class="switch" data-toggle="randomize" aria-pressed="${!!cfg.randomize}" aria-label="Randomise question order"></button>
    </div>

    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:36px">
      <button class="btn btn-primary btn-lg" data-act="start">Start test ${ICON.arrow}</button>
      <button class="btn btn-lg" data-tab="dash">Back home</button>
    </div>
  </div>`;
}
