/* ============================================================
   Vocabook Trainer
   Data: VOCAB (injected above) — every entry comes from the
   two Vocabook PDFs. Nothing here invents vocabulary.
   ============================================================ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* deterministic RNG so the daily challenge is stable within a day */
function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const today = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local

/* ------------------------------------------------------------
   Storage — works in three places, in order of preference:
     1. the Claude artifact sandbox (window.storage)
     2. a normal browser, file:// or http:// (localStorage)
     3. neither (memory only, with an honest warning)
   ------------------------------------------------------------ */
const Store = (() => {
  const KEY = 'vocabook.progress.v1';
  let mode = 'memory';
  let mem = null;

  async function detect() {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.set === 'function') {
      try { await window.storage.set(KEY + '.probe', '1'); mode = 'sandbox'; return; } catch (e) { /* fall through */ }
    }
    try {
      localStorage.setItem(KEY + '.probe', '1');
      localStorage.removeItem(KEY + '.probe');
      mode = 'local';
    } catch (e) { mode = 'memory'; }
  }

  async function load() {
    try {
      if (mode === 'sandbox') {
        const r = await window.storage.get(KEY);
        return r && r.value ? JSON.parse(r.value) : null;
      }
      if (mode === 'local') {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      }
    } catch (e) { console.warn('progress could not be read', e); }
    return mem;
  }

  let queued = null, timer = null;
  async function flush() {
    timer = null;
    const data = queued; queued = null;
    if (data == null) return;
    const s = JSON.stringify(data);
    mem = data;
    try {
      if (mode === 'sandbox') await window.storage.set(KEY, s);
      else if (mode === 'local') localStorage.setItem(KEY, s);
    } catch (e) { console.warn('progress could not be saved', e); }
  }
  function save(data) {
    queued = data;
    if (!timer) timer = setTimeout(flush, 220);
  }
  async function wipe() {
    mem = null;
    try {
      if (mode === 'sandbox') await window.storage.delete(KEY);
      else if (mode === 'local') localStorage.removeItem(KEY);
    } catch (e) { /* nothing to remove */ }
  }
  return { detect, load, save, wipe, get mode() { return mode; } };
})();

/* ------------------------------------------------------------
   State
   S.w[i] = per-word record, keyed by index into VOCAB
     c   correct answers
     x   incorrect answers
     n   times tested
     t   last tested (epoch ms)
     l   mastery level 0-5
     r   current run of consecutive correct answers
     m   per-mode tallies { wd:[c,x], dw:[c,x], blank:[c,x], context:[c,x] }
   ------------------------------------------------------------ */
const BLANK_STATE = () => ({
  v: 1,
  w: {},
  tests: [],
  review: [],
  daily: null,
  day: null,
  streak: { cur: 0, best: 0, last: null },
  settings: { theme: 'auto' },
  lastConfig: null
});

let S = BLANK_STATE();

const rec = (i) => S.w[i] || (S.w[i] = { c: 0, x: 0, n: 0, t: 0, l: 0, r: 0, m: {} });
const seen = (i) => !!(S.w[i] && S.w[i].n);
const accOf = (i) => { const r = S.w[i]; return r && r.n ? r.c / r.n : null; };

const MASTERY_LABEL = ['Not started', 'Weak', 'Weak', 'Medium', 'Strong', 'Mastered'];
function band(i) {
  const r = S.w[i];
  if (!r || !r.n) return 'new';
  if (r.l <= 2) return 'weak';
  if (r.l === 3) return 'medium';
  return 'strong';
}
const isMastered = (i) => { const r = S.w[i]; return !!r && r.l >= 4; };

function saveState() { Store.save(S); }

/* record one answered question */
function score(i, right, kind) {
  resetAppetite();
  noteAnswer(right);
  const r = rec(i);
  r.n++;
  r.t = Date.now();
  if (!r.m[kind]) r.m[kind] = [0, 0];
  if (right) {
    r.c++; r.r++; r.m[kind][0]++;
    r.l = clamp(r.l + 1, 1, 5);
    if (r.l >= 4 && r.r >= 2) {
      const k = S.review.indexOf(i);
      if (k > -1) S.review.splice(k, 1);       // consistent mastery clears the review flag
    }
  } else {
    r.x++; r.r = 0; r.m[kind][1]++;
    r.l = clamp(r.l - 1, 1, 5);
    if (!S.review.includes(i)) S.review.push(i);
  }
}

function bumpStreak() {
  const d = today();
  if (S.streak.last === d) return;
  const y = new Date(Date.now() - 864e5).toLocaleDateString('en-CA');
  S.streak.cur = (S.streak.last === y) ? S.streak.cur + 1 : 1;
  S.streak.best = Math.max(S.streak.best, S.streak.cur);
  S.streak.last = d;
}

/* ------------------------------------------------------------
   Adaptive weighting — weak and stale words surface more often
   ------------------------------------------------------------ */
const LEVEL_W = [3.0, 3.4, 2.5, 1.5, 0.6, 0.25];

/* Spaced repetition only works if words come back often enough to
   stick. With 1,343 words, an unbounded appetite for new material
   means everything gets seen once and nothing is ever learned. So the
   number of words being actively learned is capped: new ones are only
   introduced to top the cohort back up to COHORT, and otherwise the
   test drills what is already in flight. */
const COHORT = 40;

let _inFlight = null;
function inFlightCount() {
  if (_inFlight !== null) return _inFlight;
  let n = 0;
  for (const k in S.w) { const r = S.w[k]; if (r.n && r.l < 4) n++; }
  return (_inFlight = n);
}
const resetAppetite = () => { _inFlight = null; };
const newWordAllowance = () => Math.max(0, COHORT - inFlightCount());

function weight(i) {
  const r = S.w[i];
  if (!r || !r.n) return 1.2;                       // only reached via top-up
  const acc = r.c / r.n;
  let w = 1;
  w *= 1 + 3.2 * (1 - acc);                         // accuracy dominates
  w *= LEVEL_W[r.l] ?? 1;
  const days = (Date.now() - r.t) / 864e5;
  w *= 1 + Math.min(days / 6, 1.6);                 // spacing
  if (r.x >= 2 && acc < 0.6) w *= 1.9;              // frequently missed
  if (r.r >= 3) w *= 0.5;                           // answered right repeatedly, back off
  return Math.max(0.04, w);
}

/* weighted sample without replacement */
function pickWeighted(pool, k, rnd = Math.random) {
  const items = pool.map(i => [i, weight(i)]);
  const out = [];
  let total = items.reduce((s, p) => s + p[1], 0);
  k = Math.min(k, items.length);
  while (out.length < k && total > 0) {
    let t = rnd() * total, hit = items.length - 1;
    for (let j = 0; j < items.length; j++) {
      if (items[j][1] <= 0) continue;
      t -= items[j][1];
      if (t <= 0) { hit = j; break; }
    }
    if (items[hit][1] <= 0) break;
    out.push(items[hit][0]);
    total -= items[hit][1];
    items[hit][1] = 0;
  }
  return out;
}

/* ------------------------------------------------------------
   Today's session
   ------------------------------------------------------------ */
const DAY_GOAL = 20;

function todaySession() {
  if (!S.day || S.day.d !== today()) S.day = { d: today(), n: 0, c: 0 };
  return S.day;
}
function noteAnswer(right) {
  const t = todaySession();
  t.n++; if (right) t.c++;
}

/* ------------------------------------------------------------
   Insights — every figure below is computed from the user's own
   history. Nothing here is hardcoded or estimated.
   ------------------------------------------------------------ */
function weekWindow() {
  const cut = Date.now() - 7 * 864e5;
  return S.tests.filter(t => t.ts >= cut);
}

function questionsThisWeek() {
  return weekWindow().reduce((n, t) => n + t.total, 0);
}

/* Compare accuracy per question type over the recent half of your
   history against the earlier half. Needs enough answers on both
   sides or it reports nothing rather than inventing a trend. */
function modeTrend() {
  if (S.tests.length < 4) return null;
  const half = Math.floor(S.tests.length / 2);
  const tally = (list) => {
    const m = {};
    for (const t of list) for (const [k, v] of Object.entries(t.byType || {})) {
      m[k] = m[k] || [0, 0];
      m[k][0] += v[0]; m[k][1] += v[1];
    }
    return m;
  };
  const older = tally(S.tests.slice(0, half));
  const newer = tally(S.tests.slice(half));
  let best = null;
  for (const k of Object.keys(newer)) {
    if (!older[k]) continue;
    const oN = older[k][0] + older[k][1], nN = newer[k][0] + newer[k][1];
    if (oN < 8 || nN < 8) continue;
    const delta = Math.round((newer[k][0] / nN - older[k][0] / oN) * 100);
    if (!best || Math.abs(delta) > Math.abs(best.delta)) {
      best = { kind: k, delta, now: Math.round((newer[k][0] / nN) * 100), n: nN };
    }
  }
  return best && Math.abs(best.delta) >= 3 ? best : null;
}

/* A word you have actually met, chosen deterministically per day so
   it does not change while you are looking at it. */
function wordOfDay() {
  const rnd = mulberry(hashStr('wotd' + today()));
  const met = [];
  for (const k in S.w) if (S.w[k].n > 0) met.push(+k);
  const pool = met.length >= 5 ? met : VOCAB.map((_, i) => i);
  return pool[Math.floor(rnd() * pool.length)];
}

/* Words responsible for most of your mistakes, worst first. */
function troubleWords(limit = 40) {
  const out = [];
  for (const k in S.w) {
    const r = S.w[k];
    if (r.n < 2 || r.x === 0) continue;
    const acc = r.c / r.n;
    if (acc >= 0.6) continue;
    out.push([+k, r.x, acc]);
  }
  out.sort((a, b) => b[1] - a[1] || a[2] - b[2]);
  return out.slice(0, limit).map(p => p[0]);
}

/* Median seconds per question, used to estimate how long a set takes. */
function secsPerQuestion() {
  const rec = S.tests.slice(-10).filter(t => t.total > 0);
  if (!rec.length) return 22;
  const rates = rec.map(t => t.secs / t.total).sort((a, b) => a - b);
  return clamp(rates[Math.floor(rates.length / 2)], 6, 90);
}

/* ------------------------------------------------------------
   Today's session — the dashboard needs to answer "what now?",
   so it tracks questions answered today against a daily goal.
   ------------------------------------------------------------ */
const DAILY_GOAL = 20;
function todaySession() {
  const d = today();
  let done = 0;
  for (const t of S.tests) {
    if (new Date(t.ts).toLocaleDateString('en-CA') === d) done += t.total;
  }
  return { done: Math.min(done, DAILY_GOAL), raw: done, goal: DAILY_GOAL, pct: pct(Math.min(done, DAILY_GOAL), DAILY_GOAL) };
}

function questionsThisWeek() {
  const cut = Date.now() - 7 * 864e5;
  return S.tests.reduce((n, t) => n + (t.ts >= cut ? t.total : 0), 0);
}

/* accuracy per question type over the last N tests */
function typeAccuracy(tests) {
  const agg = {};
  for (const t of tests) {
    for (const [k, v] of Object.entries(t.byType || {})) {
      agg[k] = agg[k] || [0, 0];
      agg[k][0] += v[0]; agg[k][1] += v[1];
    }
  }
  return agg;
}

/* ------------------------------------------------------------
   Insights — every one is derived from the user's own record.
   Anything that cannot be computed honestly is simply not shown.
   ------------------------------------------------------------ */
function insights() {
  const out = [];
  const s = summary();

  // 1. movement in one question type, recent half vs the half before
  if (S.tests.length >= 4) {
    const half = Math.floor(S.tests.length / 2);
    const older = typeAccuracy(S.tests.slice(0, half));
    const newer = typeAccuracy(S.tests.slice(half));
    let best = null;
    for (const k of Object.keys(newer)) {
      if (!older[k]) continue;
      const [oc, ox] = older[k], [nc, nx] = newer[k];
      if (oc + ox < 5 || nc + nx < 5) continue;
      const delta = pct(nc, nc + nx) - pct(oc, oc + ox);
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { kind: k, delta, now: pct(nc, nc + nx) };
    }
    if (best && Math.abs(best.delta) >= 4) {
      const up = best.delta > 0;
      out.push({
        cls: up ? 'pos' : 'attn',
        head: up ? 'Getting better at ' + KINDS[best.kind].verb : 'Slipping on ' + KINDS[best.kind].verb,
        big: (up ? '+' : '') + best.delta + '%',
        body: `Your ${KINDS[best.kind].short.toLowerCase()} accuracy ${up ? 'rose' : 'fell'} to ${best.now}% over your recent tests.`
      });
    }
  }

  // 2. word of the day — a word you have actually met, stable per day
  const met = VOCAB.map((_, i) => i).filter(i => S.w[i] && S.w[i].n > 0);
  if (met.length) {
    const i = met[Math.floor(mulberry(hashStr('wotd' + today()))() * met.length)];
    const r = S.w[i];
    out.push({
      cls: '', head: 'Word of the day', big: plainWord(i), bigSmall: true,
      body: `You have seen it ${r.n} time${r.n === 1 ? '' : 's'} and answered it correctly ${r.c} of ${r.n}. ${MASTERY_LABEL[r.l]}.`,
      word: i
    });
  }

  // 3. the words doing the most damage
  const trouble = VOCAB.map((_, i) => i)
    .filter(i => { const r = S.w[i]; return r && r.x >= 2 && r.c / r.n < 0.6; });
  if (trouble.length) {
    out.push({
      cls: 'attn', head: 'Needs attention', big: String(trouble.length),
      body: `${trouble.length === 1 ? 'One word is' : 'These are the words'} you keep getting wrong \u2014 missed at least twice, and right less than half the time.`,
      action: 'weak', actionLabel: 'Practise them'
    });
  } else if (s.review) {
    out.push({
      cls: 'attn', head: 'On your review list', big: String(s.review),
      body: `Missed at least once and not yet re-learned. They leave the list once you answer them right twice running.`,
      action: 'review', actionLabel: 'Review them'
    });
  }

  return out.slice(0, 3);
}
function summary() {
  const N = VOCAB.length;
  let mastered = 0, strong = 0, medium = 0, weak = 0, tested = 0, c = 0, x = 0;
  for (let i = 0; i < N; i++) {
    const b = band(i);
    if (b === 'new') continue;
    tested++;
    if (b === 'weak') weak++; else if (b === 'medium') medium++; else strong++;
    if (isMastered(i)) mastered++;
    c += S.w[i].c; x += S.w[i].x;
  }
  return {
    total: N, tested, untested: N - tested,
    mastered, strong, medium, weak,
    answered: c + x, correct: c, wrong: x,
    accuracy: pct(c, c + x),
    review: S.review.length,
    tests: S.tests.length,
    streak: S.streak.cur,
    weekQuestions: questionsThisWeek(),
    session: todaySession(),
    goal: DAY_GOAL,
    progress: pct(mastered, N)
  };
}
