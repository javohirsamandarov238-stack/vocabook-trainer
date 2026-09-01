/* Headless test of the question engine and progress model. */
const ROOT = require('path').resolve(__dirname, '..');
const P = (...a) => require('path').join(ROOT, ...a);

const fs = require('fs');
const path = ROOT;

const VOCAB = JSON.parse(fs.readFileSync(P('data','vocabulary.build.json'), 'utf8'));
global.VOCAB = VOCAB;

// pull in the two pure-logic modules
function load(f) {
  let src = fs.readFileSync(P('src') + '/' + f, 'utf8');
  return src;
}
const esc = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
global.esc = esc;

// stub the storage layer's browser bits
global.window = undefined;
global.localStorage = { _d: {}, setItem(k, v) { this._d[k] = v; }, getItem(k) { return this._d[k] ?? null; }, removeItem(k) { delete this._d[k]; } };

let code = load('1-core.js') + '\n' + load('2-questions.js');
code += `
module.exports = { S: () => S, setS: v => { S = v; }, buildTest, buildQuestion, KINDS, KIND_KEYS,
  score, summary, band, weight, pickWeighted, dailyWords, BLANK_STATE, plainWord, wrapExample,
  blankedSentence, markedSentence, exampleWithEm, poolFor, spansOf, newWordAllowance, resetAppetite, defTokens, overlap, today, hashStr, mulberry, rec, MASTERY_LABEL };
`;
const M = new module.constructor();
M._compile(code, 'app.js');
const A = M.exports;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL:', name, extra === undefined ? '' : extra); }
}
function section(t) { console.log('\n== ' + t); }

/* ---------------------------------------------------------- */
section('Dataset integrity');
ok('1343 words', VOCAB.length === 1343, VOCAB.length);
ok('every word has a definition', VOCAB.every(v => v.definition && v.definition.length > 1));
ok('every word has an example', VOCAB.every(v => v.example && v.example.length > 10));
ok('every word has a distractor pool >= 4', VOCAB.every(v => Array.isArray(v.d) && v.d.length >= 4));
ok('no distractor points at itself', VOCAB.every((v, i) => !v.d.includes(i)));
ok('every word has at least one span', VOCAB.every(v => Array.isArray(v.spans) && v.spans.length >= 1));
ok('every span is inside its example', VOCAB.every(v => v.spans.every(([a, b]) => a >= 0 && b <= v.example.length && b > a)));
ok('spans have >=1 word chars', VOCAB.every(v => v.spans.every(([a, b]) => /[A-Za-z]/.test(v.example.slice(a, b)))));
ok('spans do not overlap and are sorted', VOCAB.every(v => v.spans.every(([a], k) => k === 0 || a >= v.spans[k - 1][1])));
ok('difficulty always set', VOCAB.every(v => ['easy', 'medium', 'hard'].includes(v.difficulty)));
const dup = new Set(); let dupes = 0;
VOCAB.forEach(v => { const k = v.word.toLowerCase(); if (dup.has(k)) dupes++; dup.add(k); });
ok('no duplicate headwords', dupes === 0, dupes);

/* ---------------------------------------------------------- */
section('Question construction (all words, all modes)');
let built = 0, problems = [];
for (let i = 0; i < VOCAB.length; i++) {
  for (const kind of A.KIND_KEYS) {
    const q = A.buildQuestion(i, kind);
    if (!q) { problems.push(`no question for ${VOCAB[i].word}/${kind}`); continue; }
    built++;
    if (q.options.length !== 4) problems.push(`${VOCAB[i].word}/${kind}: ${q.options.length} options`);
    if (q.options[q.answer].id !== i) problems.push(`${VOCAB[i].word}/${kind}: answer index wrong`);
    const texts = q.options.map(o => (o.kind === 'word' ? o.word : o.text).toLowerCase());
    if (new Set(texts).size !== 4) problems.push(`${VOCAB[i].word}/${kind}: duplicate options -> ${texts.join(' | ')}`);
    if (kind === 'blank') {
      const html = q.prompt.html || '';
      for (const [a, b] of (VOCAB[i].spans || [])) {
        const sur = VOCAB[i].example.slice(a, b).toLowerCase();
        if (html.toLowerCase().includes(sur)) problems.push(`${VOCAB[i].word}: answer still visible in blanked sentence`);
      }
      // no distractor should already appear in the sentence
      const sent = VOCAB[i].example.toLowerCase();
      for (const o of q.options) {
        if (o.id === i) continue;
        const w = o.word.toLowerCase();
        if (sent.includes(w) && w.length > 3) problems.push(`${VOCAB[i].word}: distractor "${o.word}" appears in the sentence`);
      }
    }
    if (kind === 'context') {
      if (!(q.prompt.html || '').includes('<mark>')) problems.push(`${VOCAB[i].word}: context question has no highlight`);
    }
  }
}
ok('a question builds for every word in every mode', problems.length === 0, problems.slice(0, 8));
console.log('   built', built.toLocaleString(), 'questions');

/* ---------------------------------------------------------- */
section('Anti-guessing: no two options mean the same thing');
let synClash = 0, samples = [];
for (let i = 0; i < VOCAB.length; i++) {
  const q = A.buildQuestion(i, 'wd');
  const defs = q.options.map(o => A.defTokens(VOCAB[o.id].definition));
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
    if (A.overlap(defs[a], defs[b]) >= 0.3) {
      synClash++;
      if (samples.length < 5) samples.push(`${VOCAB[q.options[a].id].word} / ${VOCAB[q.options[b].id].word}`);
    }
  }
}
ok('no near-synonym option pairs', synClash === 0, samples);

section('Anti-guessing: part of speech does not give it away');
let posLeak = 0;
for (let i = 0; i < VOCAB.length; i++) {
  if (!VOCAB[i].pos) continue;
  const q = A.buildQuestion(i, 'blank');
  const poss = q.options.map(o => VOCAB[o.id].pos);
  const known = poss.filter(Boolean);
  if (known.length === 4 && new Set(known).size > 1) {
    // mixed POS is only a leak if the correct one is the unique odd one out
    const counts = {};
    known.forEach(p => counts[p] = (counts[p] || 0) + 1);
    if (counts[VOCAB[i].pos] === 1) posLeak++;
  }
}
ok('correct answer is rarely the only one of its part of speech', posLeak / VOCAB.length < 0.02, (posLeak / VOCAB.length * 100).toFixed(2) + '%');

section('Answer position is evenly spread');
const posCount = [0, 0, 0, 0];
for (let n = 0; n < 4000; n++) {
  const i = Math.floor(Math.random() * VOCAB.length);
  const q = A.buildQuestion(i, 'wd');
  posCount[q.answer]++;
}
const mn = Math.min(...posCount), mx = Math.max(...posCount);
ok('A/B/C/D each get roughly a quarter', mx / mn < 1.25, posCount);

section('No three-in-a-row in the same slot');
let runs3 = 0, totalQ = 0;
for (let t = 0; t < 60; t++) {
  const qs = A.buildTest({ count: 30, mode: 'mixed', difficulty: 'adaptive', includeMissed: false, randomize: true });
  totalQ += qs.length;
  for (let k = 2; k < qs.length; k++) {
    if (qs[k].answer === qs[k - 1].answer && qs[k].answer === qs[k - 2].answer) runs3++;
  }
}
ok('correct answer never lands in the same slot 3x running', runs3 === 0, runs3);

/* ---------------------------------------------------------- */
section('Test builder honours its configuration');
for (const c of [10, 20, 30, 50]) {
  const qs = A.buildTest({ count: c, mode: 'mixed', difficulty: 'adaptive', includeMissed: false, randomize: true });
  ok(`count=${c} produces ${c} questions`, qs.length === c, qs.length);
}
const all = A.buildTest({ count: 'all', mode: 'wd', difficulty: 'hard', includeMissed: false, randomize: true });
const hardN = VOCAB.filter(v => v.difficulty === 'hard').length;
ok('count=all + hard uses every hard word', all.length === hardN, `${all.length} vs ${hardN}`);
ok('difficulty filter respected', all.every(q => VOCAB[q.word].difficulty === 'hard'));
for (const m of A.KIND_KEYS) {
  const qs = A.buildTest({ count: 40, mode: m, difficulty: 'adaptive', includeMissed: false, randomize: true });
  ok(`mode=${m} produces only that kind`, qs.every(q => q.kind === m));
}
const mixed = A.buildTest({ count: 200, mode: 'mixed', difficulty: 'adaptive', includeMissed: false, randomize: true });
ok('mixed uses all four kinds', new Set(mixed.map(q => q.kind)).size === 4, [...new Set(mixed.map(q => q.kind))]);
const noRepeatKind = mixed.every((q, k) => k === 0 || q.kind !== mixed[k - 1].kind);
ok('mixed never repeats a kind back-to-back', noRepeatKind);
const wordsInTest = mixed.map(q => q.word);
ok('a word is never asked twice in one test', new Set(wordsInTest).size === wordsInTest.length);

const ordered = A.buildTest({ count: 20, mode: 'wd', difficulty: 'adaptive', includeMissed: false, randomize: false });
ok('randomize:false keeps Vocabook order', ordered.every((q, k) => k === 0 || q.word > ordered[k - 1].word));

/* ---------------------------------------------------------- */
section('Progress model');
A.setS(A.BLANK_STATE());
let S = A.S();
ok('starts empty', A.summary().answered === 0 && A.summary().mastered === 0);

A.score(5, false, 'wd');
ok('a miss lands on the review list', A.S().review.includes(5));
ok('a miss sets level 1', A.S().w[5].l === 1);
ok('band is weak after a miss', A.band(5) === 'weak');

for (let n = 0; n < 5; n++) A.score(5, true, 'wd');
ok('five straight correct reaches level 5', A.S().w[5].l === 5, A.S().w[5].l);
ok('sustained accuracy clears the review flag', !A.S().review.includes(5));
ok('band is strong', A.band(5) === 'strong');
ok('counted as mastered', A.summary().mastered === 1);

A.score(5, false, 'dw');
ok('a miss knocks the level down by one', A.S().w[5].l === 4, A.S().w[5].l);
ok('and puts it back on the review list', A.S().review.includes(5));
ok('per-mode tallies kept', A.S().w[5].m.wd[0] === 5 && A.S().w[5].m.dw[1] === 1);

const sm = A.summary();
ok('summary counts questions', sm.answered === 7, sm.answered);
ok('summary accuracy right', sm.accuracy === Math.round(5 / 7 * 100), sm.accuracy);

/* ---------------------------------------------------------- */
section('Adaptive scheduling prioritises weak words');
A.setS(A.BLANK_STATE());
const WEAK = [10, 11, 12, 13, 14];
const STRONG = [];
for (let i = 20; i < 55; i++) STRONG.push(i);        // plenty of well-known words to compete with
for (const i of WEAK) for (let n = 0; n < 4; n++) A.score(i, false, 'wd');
for (const i of STRONG) for (let n = 0; n < 5; n++) A.score(i, true, 'wd');
const wWeak = WEAK.reduce((s, i) => s + A.weight(i), 0) / WEAK.length;
const wStrong = STRONG.reduce((s, i) => s + A.weight(i), 0) / STRONG.length;
ok('weak words weigh much more than strong ones', wWeak > wStrong * 6, `${wWeak.toFixed(2)} vs ${wStrong.toFixed(2)}`);

let weakHits = 0, strongHits = 0;
for (let t = 0; t < 300; t++) {
  const qs = A.buildTest({ count: 20, mode: 'mixed', difficulty: 'adaptive', includeMissed: false, randomize: true });
  for (const q of qs) { if (WEAK.includes(q.word)) weakHits++; if (STRONG.includes(q.word)) strongHits++; }
}
const weakRate = weakHits / (300 * WEAK.length);
const strongRate = strongHits / (300 * STRONG.length);
ok('a weak word is picked far more often than a strong one',
   weakRate > strongRate * 4, `${(weakRate * 100).toFixed(0)}% vs ${(strongRate * 100).toFixed(0)}% per test`);

section('Repeated correct answers reduce a word frequency');
A.setS(A.BLANK_STATE());
const ws = [];
for (let n = 0; n < 5; n++) { A.score(30, true, 'wd'); ws.push(A.weight(30)); }
ok('weight falls with every correct answer', ws.every((w, k) => k === 0 || w < ws[k - 1]), ws.map(w => w.toFixed(2)));
A.setS(A.BLANK_STATE());
A.score(31, true, 'wd'); const wRight = A.weight(31);
A.setS(A.BLANK_STATE());
A.score(31, false, 'wd'); const wWrong = A.weight(31);
ok('a missed word outweighs a correct one', wWrong > wRight * 2, `${wWrong.toFixed(2)} vs ${wRight.toFixed(2)}`);

section('Review + weak-word drills');
A.setS(A.BLANK_STATE());
[100, 101, 102, 103].forEach(i => A.score(i, false, 'wd'));
const rq = A.buildTest({ count: 4, mode: 'mixed', difficulty: 'adaptive', onlyIds: A.S().review.slice(), randomize: true });
ok('review drill only uses missed words', rq.every(q => [100, 101, 102, 103].includes(q.word)), rq.map(q => q.word));
ok('review drill covers them all', new Set(rq.map(q => q.word)).size === 4);

section('includeMissed pulls the review list into a normal test');
A.setS(A.BLANK_STATE());
const missed = [200, 201, 202, 203, 204, 205];
missed.forEach(i => A.score(i, false, 'wd'));
let hits = 0, runsN = 40;
for (let t = 0; t < runsN; t++) {
  const qs = A.buildTest({ count: 10, mode: 'mixed', difficulty: 'easy', includeMissed: true, randomize: true });
  hits += qs.filter(q => missed.includes(q.word)).length;
}
ok('missed words show up when the toggle is on', hits > runsN, `${hits} across ${runsN} tests`);

/* ---------------------------------------------------------- */
section('Daily challenge');
A.setS(A.BLANK_STATE());
const d1 = A.dailyWords(10), d2 = A.dailyWords(10);
ok('daily returns 10 words', d1.length === 10);
ok('daily is stable within the same day', JSON.stringify(d1) === JSON.stringify(d2));
ok('daily words are unique', new Set(d1).size === 10);
A.setS(A.BLANK_STATE());
[300, 301, 302].forEach(i => { for (let n = 0; n < 4; n++) A.score(i, false, 'wd'); });
const d3 = A.dailyWords(10);
ok('daily prioritises frequently missed words', [300, 301, 302].every(i => d3.includes(i)), d3);

/* ---------------------------------------------------------- */
section('Blanked sentences read correctly');
let blankBad = [];
for (let i = 0; i < VOCAB.length; i++) {
  const h = A.blankedSentence(i);
  if (!h || !h.includes('class="blank"')) blankBad.push(VOCAB[i].word);
  const stripped = h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  if (stripped.trim().length < 8) blankBad.push(VOCAB[i].word + ' (too short)');
}
ok('every word yields a usable blanked sentence', blankBad.length === 0, blankBad.slice(0, 5));

let emBad = 0;
for (let i = 0; i < VOCAB.length; i++) if (!A.exampleWithEm(i).includes('<em>')) emBad++;
ok('every example highlights its target word', emBad === 0, emBad);

/* ---------------------------------------------------------- */
section('New words are rationed so the cohort can actually be learned');
A.setS(A.BLANK_STATE());
let inflightTrace = [];
for (let t = 0; t < 20; t++) {
  const qs = A.buildTest({ count: 20, mode: 'mixed', difficulty: 'adaptive', includeMissed: true, randomize: true });
  for (const q of qs) A.score(q.word, Math.random() < 0.7, q.kind);
  let n = 0; for (const k in A.S().w) { const r = A.S().w[k]; if (r.n && r.l < 4) n++; }
  inflightTrace.push(n);
}
const peak = Math.max(...inflightTrace);
ok('the set of words being learned stays bounded', peak <= 55, peak);
const seenTotal = Object.keys(A.S().w).length;
ok('the session focuses rather than sampling everything', seenTotal < 140, seenTotal);
ok('mastery accumulates over a longer session', A.summary().mastered >= 15, A.summary().mastered);

section('Higher accuracy masters words faster');
function sim(acc, tests) {
  A.setS(A.BLANK_STATE());
  for (let t = 0; t < tests; t++) {
    const qs = A.buildTest({ count: 20, mode: 'mixed', difficulty: 'adaptive', includeMissed: true, randomize: true });
    for (const q of qs) A.score(q.word, Math.random() < acc, q.kind);
  }
  return A.summary();
}
const lo = sim(0.55, 14), hi = sim(0.9, 14);
ok('a stronger learner masters more', hi.mastered > lo.mastered, `${hi.mastered} vs ${lo.mastered}`);
ok('a weaker learner carries a longer review list', lo.review > hi.review, `${lo.review} vs ${hi.review}`);

section('Full simulated study session');
A.setS(A.BLANK_STATE());
let answered = 0, correct = 0;
for (let t = 0; t < 12; t++) {
  const qs = A.buildTest({ count: 20, mode: 'mixed', difficulty: 'adaptive', includeMissed: true, randomize: true });
  for (const q of qs) {
    const right = Math.random() < 0.7;
    A.score(q.word, right, q.kind);
    answered++; if (right) correct++;
  }
}
const fin = A.summary();
ok('session recorded every answer', fin.answered === answered, `${fin.answered} vs ${answered}`);
ok('session accuracy matches', fin.accuracy === Math.round(correct / answered * 100));
ok('a meaningful number of words reached mastery', fin.mastered >= 5, fin.mastered);
ok('review list is non-empty but bounded', fin.review > 0 && fin.review <= fin.tested, fin.review);
ok('bands add up to tested count', fin.weak + fin.medium + fin.strong === fin.tested);
ok('tested + untested = total', fin.tested + fin.untested === VOCAB.length);

section('Progress survives a serialise/deserialise round trip');
const json = JSON.stringify(A.S());
const back = JSON.parse(json);
A.setS(back);
const after = A.summary();
ok('summary identical after reload', JSON.stringify(after) === JSON.stringify(fin));

/* ---------------------------------------------------------- */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
