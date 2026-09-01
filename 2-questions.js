/* ============================================================
   Question generation
   Every option shown to the learner is real Vocabook data.
   ============================================================ */

const KINDS = {
  wd:      { label: 'Recognize', short: 'Word \u2192 definition', verb: 'recognition' },
  dw:      { label: 'Recall',    short: 'Definition \u2192 word', verb: 'recall' },
  blank:   { label: 'Complete',  short: 'Fill in the blank',      verb: 'completion' },
  context: { label: 'Understand',short: 'Meaning in context',     verb: 'context reading' }
};
const KIND_KEYS = Object.keys(KINDS);

const LETTERS = ['A', 'B', 'C', 'D'];

const headword = (i) => VOCAB[i].word;
const defOf    = (i) => VOCAB[i].definition;

/* The book marks some headwords with a leading "To " or a trailing
   part-of-speech note. Those are lemma markers, not part of the word,
   and an option formatted differently from its three neighbours is a
   giveaway. Display is normalised; the original stays in the data and
   is still shown in the library. */
const plainWord = (i) => VOCAB[i].word
  .replace(/\s*\((?:verb|noun|adj\.?|adjective|adv\.?|adverb)\)\s*$/i, '')
  .replace(/^to\s+/i, '')
  .trim();

/* ---- fallback distractor pool, used for words added by hand ---- */
const STOPW = new Set('a an the to of in on for with and or but not is are was were be by from as at it its his her their our your my this that someone something very more most other another way thing person people able can could would should may might will do does did have has had make made get got give given take use used'.split(' '));
function defTokens(s) {
  return new Set(String(s).toLowerCase().replace(/^\d\)\s*/, ' ').match(/[a-z]{3,}/g)?.filter(w => !STOPW.has(w)) || []);
}
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0; a.forEach(t => { if (b.has(t)) n++; });
  return n / (a.size + b.size - n);
}
const _poolCache = new Map();
function poolFor(i) {
  if (Array.isArray(VOCAB[i].d) && VOCAB[i].d.length >= 4) return VOCAB[i].d;
  if (_poolCache.has(i)) return _poolCache.get(i);
  const me = defTokens(VOCAB[i].definition);
  const mine = VOCAB[i].word.toLowerCase().slice(0, 5);
  const out = [];
  const order = shuffle(VOCAB.map((_, k) => k));
  for (const j of order) {
    if (j === i || out.length >= 18) continue;
    if (VOCAB[j].pos && VOCAB[i].pos && VOCAB[j].pos !== VOCAB[i].pos) continue;
    if (VOCAB[j].word.toLowerCase().slice(0, 5) === mine) continue;
    if (overlap(me, defTokens(VOCAB[j].definition)) >= 0.3) continue;
    out.push(j);
  }
  _poolCache.set(i, out);
  return out;
}

/* Words you add by hand won't have precomputed spans, so work them out
   at load time. Without this a new word would silently drop out of
   fill-in-the-blank questions. */
function locateWord(sentence, word) {
  const base = word.replace(/\s*\((?:verb|noun|adj\.?|adjective|adv\.?|adverb)\)\s*$/i, '')
                   .replace(/^to\s+/i, '').replace(/\(([a-z]+)\)/gi, '$1');
  const roots = [...new Set(base.split(/[\/\s]+/).filter(w => w.length > 2).map(w => w.toLowerCase()))];
  const forms = new Set();
  for (const r of roots) {
    const stem = r.endsWith('e') ? r.slice(0, -1) : r;
    forms.add(r);
    for (const suf of ['s', 'es', 'ed', 'd', 'ing', 'ment', 'ance', 'ence', 'ous', 'ive', 'ly', 'ness', 'ity']) {
      forms.add(r + suf); forms.add(stem + suf);
    }
    if (/[^aeiouwxy]$/.test(r) && /[aeiou]/.test(r.slice(-2, -1))) {
      for (const suf of ['ed', 'ing', 'er']) forms.add(r + r.slice(-1) + suf);
    }
    if (r.endsWith('y')) for (const suf of ['ed', 'es', 'er', 'est']) forms.add(r.slice(0, -1) + 'i' + suf);
  }
  const spans = [];
  for (const f of [...forms].sort((a, b) => b.length - a.length)) {
    if (f.length < 3) continue;
    let m, re = new RegExp('\\b' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    while ((m = re.exec(sentence))) {
      const s = [m.index, m.index + m[0].length];
      if (!spans.some(([a, b]) => s[0] < b && s[1] > a)) spans.push(s);
    }
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

function ensureSpans() {
  let filled = 0;
  for (const e of VOCAB) {
    if (Array.isArray(e.spans) && e.spans.length) continue;
    e.spans = locateWord(e.example || '', e.word || '');
    if (e.spans.length) filled++;
  }
  return filled;
}

/* ---- sentence helpers ----
   A few example sentences use the word more than once ("His hard work
   yielded excellent results, but he still had to yield..."). Every
   occurrence is replaced, otherwise the blank gives the answer away. */
const spansOf = (i) => VOCAB[i].spans || [];

function wrapExample(i, open, close) {
  const e = VOCAB[i];
  const sp = spansOf(i);
  if (!sp.length) return esc(e.example);
  let out = '', last = 0;
  for (const [a, b] of sp) {
    out += esc(e.example.slice(last, a)) + open + esc(e.example.slice(a, b)) + close;
    last = b;
  }
  return out + esc(e.example.slice(last));
}
function surfaceOf(i) {
  const sp = spansOf(i);
  return sp.length ? VOCAB[i].example.slice(sp[0][0], sp[0][1]) : plainWord(i);
}
function blankedSentence(i) {
  const e = VOCAB[i];
  const sp = spansOf(i);
  if (!sp.length) return null;
  let out = '', last = 0;
  for (const [a, b] of sp) {
    out += esc(e.example.slice(last, a)) + '<span class="blank">&nbsp;</span>';
    last = b;
  }
  return out + esc(e.example.slice(last));
}
const markedSentence  = (i) => wrapExample(i, '<mark>', '</mark>');
const exampleWithEm   = (i) => wrapExample(i, '<em>', '</em>');

/* ---- distractor choice ---- */
function chooseDistractors(i, kind, need, rnd) {
  const chosen = [];
  const takenWords = new Set([plainWord(i).toLowerCase()]);
  const takenDefs  = new Set([VOCAB[i].definition.toLowerCase()]);
  const sentence   = (kind === 'blank') ? VOCAB[i].example.toLowerCase() : '';
  // every option is checked against every other, so no two choices
  // can mean the same thing and be eliminated as a pair
  const tokenSets  = [defTokens(VOCAB[i].definition)];

  const accepts = (j) => {
    const w = plainWord(j).toLowerCase();
    const d = VOCAB[j].definition.toLowerCase();
    if (takenWords.has(w) || takenDefs.has(d)) return false;
    // a word already visible in the sentence would give the answer away
    if (sentence && sentence.includes(w.slice(0, Math.max(4, w.length - 2)))) return false;
    const ts = defTokens(VOCAB[j].definition);
    for (const other of tokenSets) if (overlap(ts, other) >= 0.3) return false;
    takenWords.add(w); takenDefs.add(d); tokenSets.push(ts);
    return true;
  };

  // In a blank, the slot often demands a particular word form. Parts of
  // speech alone are not enough: a word can be tagged a noun and still
  // be used as a participle in its sentence. Ranking by ending shape
  // keeps options that could plausibly occupy the same slot.
  let ranked = shuffle(poolFor(i), rnd);
  if (kind === 'blank') {
    const shape = (w) => /ing$/i.test(w) ? 'ing' : /ed$/i.test(w) ? 'ed' : /ly$/i.test(w) ? 'ly' : 'base';
    const want = shape(surfaceOf(i));
    ranked = ranked.sort((a, b) =>
      (shape(plainWord(b)) === want) - (shape(plainWord(a)) === want));
  }

  for (const j of ranked) {
    if (chosen.length >= need) break;
    if (accepts(j)) chosen.push(j);
  }
  // widen the net only if the vetted pool ran dry
  if (chosen.length < need) {
    for (const j of shuffle(VOCAB.map((_, k) => k), rnd)) {
      if (chosen.length >= need) break;
      if (j === i || chosen.includes(j)) continue;
      if (accepts(j)) chosen.push(j);
    }
  }
  return chosen;
}

/* ---- build one question ---- */
function buildQuestion(i, kind, rnd = Math.random, avoidPos = []) {
  if (kind === 'blank' && !spansOf(i).length) kind = 'dw';

  const wrong = chooseDistractors(i, kind, 3, rnd);
  if (wrong.length < 3) return null;

  const ids = shuffle([i, ...wrong], rnd);
  let answer = ids.indexOf(i);

  // don't let the correct answer sit in the same slot three times running
  if (avoidPos.length >= 2 && avoidPos.slice(-2).every(p => p === answer)) {
    const alt = [0, 1, 2, 3].filter(p => p !== answer);
    const to = alt[Math.floor(rnd() * alt.length)];
    [ids[answer], ids[to]] = [ids[to], ids[answer]];
    answer = to;
  }

  const optionsAreWords = (kind === 'dw' || kind === 'blank');
  const options = ids.map(j => optionsAreWords
    ? { id: j, kind: 'word', word: plainWord(j), sub: '' }
    : { id: j, kind: 'def',  text: VOCAB[j].definition });

  let prompt = '';
  switch (kind) {
    case 'wd':
      prompt = { type: 'word', word: plainWord(i), meta: metaLine(i), ask: 'Which definition matches this word?' };
      break;
    case 'dw':
      prompt = { type: 'def', text: VOCAB[i].definition, ask: 'Which word means this?' };
      break;
    case 'blank':
      prompt = { type: 'blank', html: blankedSentence(i), ask: 'Which word completes the sentence?' };
      break;
    case 'context':
      prompt = { type: 'context', html: markedSentence(i), ask: 'What does the highlighted word most likely mean here?' };
      break;
  }

  return { word: i, kind, options, answer, prompt };
}

function metaLine(i) {
  const e = VOCAB[i];
  const bits = [];
  if (e.pos) bits.push(e.pos);
  return bits.join(' ');
}

/* ---- build a whole test ---- */
function buildTest(cfg) {
  resetAppetite();
  const rnd = cfg.seed != null ? mulberry(cfg.seed) : Math.random;

  // 1. candidate words
  let pool = VOCAB.map((_, i) => i);
  if (cfg.difficulty && cfg.difficulty !== 'adaptive') {
    pool = pool.filter(i => VOCAB[i].difficulty === cfg.difficulty);
  }
  if (cfg.onlyIds) pool = cfg.onlyIds.slice();

  if (cfg.includeMissed && !cfg.onlyIds) {
    for (const i of S.review) if (!pool.includes(i)) pool.push(i);
  }
  if (!pool.length) pool = VOCAB.map((_, i) => i);

  const want = cfg.count === 'all' ? pool.length : Math.min(cfg.count, pool.length);

  // 2. choose words
  let words;
  if (cfg.difficulty === 'adaptive' || cfg.adaptive) {
    if (cfg.onlyIds) {
      // an explicit list (review, daily, weak drill) is the whole pool
      words = pickWeighted(pool, want, rnd);
    } else {
      // drill what is already being learned; introduce new words only
      // up to the cohort cap, so words actually get enough repetitions
      const known = pool.filter(i => seen(i));
      const fresh = pool.filter(i => !seen(i));
      // review keeps the majority of the slots. New words take at most
      // 40% of a test, and only while the cohort has room.
      const allowance = Math.min(newWordAllowance(), Math.ceil(want * 0.4), fresh.length);

      const fromKnown = pickWeighted(known, want - allowance, rnd);
      let fromFresh = shuffle(fresh, rnd).slice(0, allowance);

      // early on there is little to revise, so top up with new words
      const short = want - fromKnown.length - fromFresh.length;
      if (short > 0) {
        const taken = new Set(fromFresh);
        fromFresh = fromFresh.concat(shuffle(fresh.filter(i => !taken.has(i)), rnd).slice(0, short));
      }
      words = shuffle(fromKnown.concat(fromFresh), rnd);
    }
  } else if (cfg.includeMissed && S.review.length && !cfg.onlyIds) {
    const missed = shuffle(S.review.filter(i => pool.includes(i)), rnd).slice(0, Math.ceil(want * 0.4));
    const rest = shuffle(pool.filter(i => !missed.includes(i)), rnd).slice(0, want - missed.length);
    words = shuffle(missed.concat(rest), rnd);
  } else {
    words = shuffle(pool, rnd).slice(0, want);
  }
  if (cfg.randomize === false) words.sort((a, b) => a - b);

  // 3. choose a question kind per word
  const kinds = cfg.mode === 'mixed' ? KIND_KEYS : [cfg.mode];
  const qs = [];
  const posHist = [];
  let lastKind = null;
  for (const i of words) {
    let kind;
    if (kinds.length === 1) kind = kinds[0];
    else {
      const opts = kinds.filter(k => k !== lastKind || kinds.length === 1);
      kind = opts[Math.floor(rnd() * opts.length)];
    }
    const q = buildQuestion(i, kind, rnd, posHist);
    if (!q) continue;
    posHist.push(q.answer);
    lastKind = q.kind;
    qs.push(q);
  }
  return qs;
}

/* ---- daily challenge selection ---- */
function dailyWords(n = 10) {
  const d = today();
  const rnd = mulberry(hashStr(d));
  const scoreOf = (i) => {
    const r = S.w[i];
    if (!r || !r.n) return 1.0;                                    // 2. not practised recently
    const acc = r.c / r.n;
    const days = (Date.now() - r.t) / 864e5;
    let s = 0;
    if (r.x >= 2 && acc < 0.6) s += 4;                             // 1. frequently missed
    s += (1 - acc) * 2.2;
    s += Math.min(days / 4, 2);                                    // 2. stale
    if (r.l === 3) s += 1.6;                                       // 3. approaching mastery
    if (r.l >= 4) s -= 1.4;
    return Math.max(0.05, s);
  };
  const items = VOCAB.map((_, i) => [i, scoreOf(i) * (0.75 + rnd() * 0.5)]);
  items.sort((a, b) => b[1] - a[1]);
  return items.slice(0, n).map(p => p[0]);
}
