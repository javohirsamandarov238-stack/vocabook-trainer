/* ============================================================
   Quiz + results
   The test screen drops all chrome. One word, four choices,
   a thin thread of progress. Nothing else competes.
   ============================================================ */

let quiz = null;

function startTest(config, meta = {}) {
  const qs = buildTest(config);
  if (!qs.length) { toast('No questions could be built for that combination.'); return; }
  quiz = {
    qs, idx: 0, picked: null, locked: false,
    log: [], started: Date.now(), cfg: config, meta
  };
  if (!config.onlyIds) S.lastConfig = config;
  go('quiz');
}

const TEST_TITLE = (m) => m.kind === 'daily' ? 'Daily challenge'
  : m.kind === 'review' ? 'Review mistakes'
  : m.kind === 'weak' ? 'Weak words'
  : (quiz.cfg.mode === 'mixed' ? 'Mixed test' : KINDS[quiz.cfg.mode].label + ' test');

function viewQuiz() {
  const q = quiz.qs[quiz.idx];
  const n = quiz.qs.length;

  const thread = quiz.qs.map((_, k) => {
    if (k < quiz.log.length) return `<i class="${quiz.log[k].right ? 'right' : 'wrong'}"></i>`;
    if (k === quiz.idx) return '<i class="now"></i>';
    return '<i></i>';
  }).join('');

  let promptHtml = '';
  if (q.prompt.type === 'word') {
    promptHtml = `<p class="q-ask">Choose the meaning of</p>
      <h1 class="q-word">${esc(q.prompt.word)}</h1>
      <div class="q-pos">${q.prompt.meta ? esc(q.prompt.meta) : '&nbsp;'}</div>`;
  } else if (q.prompt.type === 'def') {
    promptHtml = `<p class="q-ask">Which word carries this meaning?</p>
      <p class="q-def">&ldquo;${esc(q.prompt.text)}&rdquo;</p>`;
  } else if (q.prompt.type === 'blank') {
    promptHtml = `<p class="q-ask">Complete the sentence</p>
      <p class="q-sent">${q.prompt.html}</p>`;
  } else {
    promptHtml = `<p class="q-ask">What does the highlighted word most likely mean here?</p>
      <p class="q-sent">${q.prompt.html}</p>`;
  }

  const answers = q.options.map((o, k) => {
    const body = o.kind === 'word' ? `<div class="aw">${esc(o.word)}</div>` : `<div class="ad">${esc(o.text)}</div>`;
    return `<li><button class="ans" data-opt="${k}"><span class="key">${LETTERS[k]}</span><span class="body">${body}</span></button></li>`;
  }).join('');

  app().innerHTML = `
  <div class="quiz">
    <div class="quiz-top">
      <div class="eyebrow">${esc(TEST_TITLE(quiz.meta))}</div>
      <button class="btn btn-sm btn-ghost" data-act="quit">Leave</button>
    </div>
    <div class="qthread" role="progressbar" aria-valuenow="${quiz.idx + 1}" aria-valuemin="1" aria-valuemax="${n}">${thread}</div>
    <div class="qbody">
      ${promptHtml}
      <ul class="answers options">${answers}</ul>
      <div id="fb"></div>
    </div>
    <div class="q-foot"><span class="tabular">${String(quiz.idx + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</span></div>
  </div>`;
}

function answerQuestion(k) {
  if (quiz.locked) return;
  const q = quiz.qs[quiz.idx];
  quiz.locked = true;
  quiz.picked = k;
  const right = k === q.answer;

  score(q.word, right, q.kind);
  quiz.log.push({ word: q.word, kind: q.kind, right, picked: q.options[k].id });
  saveState();

  $$('.ans').forEach((el, j) => {
    el.classList.add('locked');
    if (j === q.answer) el.classList.add('right');
    else if (j === k) el.classList.add('wrong');
    else el.classList.add('dim');
  });
  const bar = $$('.qthread i')[quiz.idx];
  if (bar) { bar.className = right ? 'right' : 'wrong'; }

  $('#fb').innerHTML = feedbackHtml(q, k, right);
  const nx = $('#fb [data-act="next"]');
  if (nx) nx.focus({ preventScroll: true });
  $('#fb').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* Feedback is written as a small lesson, not a verdict. Everything in
   it is real data: the book's definition, its sentence, its antonym,
   and — when you miss — what the word you actually chose means. */
function feedbackHtml(q, k, right) {
  const i = q.word;
  const e = VOCAB[i];
  const chosen = q.options[k].id;
  const last = quiz.idx === quiz.qs.length - 1;
  const rows = [];

  if (!right && chosen !== i) {
    rows.push(`<div class="fb-row"><div class="rl">Where you went</div>
      <div class="rv">You chose <span class="w">${esc(plainWord(chosen))}</span>, which means &ldquo;${esc(VOCAB[chosen].definition)}&rdquo;. Close enough to be tempting, but not this sense.</div></div>`);
  }

  rows.push(`<div class="fb-row ex"><div class="rl">In a sentence</div>
    <div class="rv">${exampleWithEm(i)}</div></div>`);

  if (e.antonym) {
    rows.push(`<div class="fb-row"><div class="rl">Its opposite</div><div class="rv">${esc(e.antonym)}</div></div>`);
  }
  if (e.senses && e.senses.length > 1) {
    rows.push(`<div class="fb-row"><div class="rl">${e.senses.length} senses in the Vocabook</div>
      <div class="rv">${e.senses.map((t, n) => `${n + 1}. ${esc(t)}`).join('<br>')}</div></div>`);
  }

  const r = S.w[i];
  rows.push(`<div class="fb-row"><div class="rl">Your record</div>
    <div class="rv">${r.c} right, ${r.x} wrong across ${r.n} question${r.n === 1 ? '' : 's'} &middot; ${MASTERY_LABEL[r.l]}</div></div>`);

  if (e.issues && e.issues.length) {
    rows.push(`<div class="fb-row"><div class="rl">Flagged in the source</div>
      <div class="rv fb-flag">${e.issues.map(esc).join(' ')}</div></div>`);
  }

  const verdicts = right
    ? ['Correct.', 'That&rsquo;s it.', 'Yes.', 'Right.']
    : ['Not this one.', 'Close, but no.', 'Not quite.'];
  const verdict = verdicts[quiz.idx % verdicts.length];

  return `<div class="fb">
    <div class="fb-verdict ${right ? 'good' : 'bad'}">${right ? ICON.check : ICON.x}${verdict}</div>
    <div class="fb-card">
      <div class="fb-lead">
        <div class="w">${esc(plainWord(i))}${e.pos ? `<i>${esc(e.pos)}</i>` : ''}</div>
        <div class="d">${esc(e.definition)}</div>
      </div>
      <div class="fb-rows">${rows.join('')}</div>
    </div>
    <div class="fb-foot">
      <span class="hint">Press <kbd>Enter</kbd> to continue</span>
      <button class="btn btn-primary" data-act="next">${last ? 'See results' : 'Next question'} ${ICON.arrow}</button>
    </div>
  </div>`;
}

function nextQuestion() {
  if (!quiz.locked) return;
  if (quiz.idx === quiz.qs.length - 1) return finishTest();
  quiz.idx++; quiz.locked = false; quiz.picked = null;
  viewQuiz();
}

function finishTest() {
  const secs = Math.round((Date.now() - quiz.started) / 1000);
  const right = quiz.log.filter(l => l.right).length;
  const byType = {};
  for (const l of quiz.log) {
    byType[l.kind] = byType[l.kind] || [0, 0];
    byType[l.kind][l.right ? 0 : 1]++;
  }
  const entry = {
    ts: Date.now(), secs,
    total: quiz.log.length, correct: right,
    mode: quiz.cfg.mode, difficulty: quiz.cfg.difficulty,
    kind: quiz.meta.kind || 'test',
    byType, words: quiz.log.map(l => [l.word, l.right ? 1 : 0])
  };
  S.tests.push(entry);
  if (S.tests.length > 120) S.tests = S.tests.slice(-120);
  bumpStreak();
  if (quiz.meta.kind === 'daily') {
    S.daily = { date: today(), done: true, total: entry.total, correct: right, ids: quiz.qs.map(q => q.word) };
  }
  saveState();
  quiz.result = entry;
  go('results');
}

/* ============================================================
   Results
   ============================================================ */
function viewResults() {
  const r = quiz.result;
  const p = pct(r.correct, r.total);
  const mins = Math.floor(r.secs / 60), ss = r.secs % 60;
  const timeStr = mins ? `${mins}m ${ss}s` : `${ss}s`;

  const wrongIds = [...new Set(quiz.log.filter(l => !l.right).map(l => l.word))];
  const rightIds = [...new Set(quiz.log.filter(l => l.right).map(l => l.word))];

  const ranked = VOCAB.map((_, i) => i).filter(i => S.w[i] && S.w[i].n >= 2);
  ranked.sort((a, b) => (S.w[b].c / S.w[b].n) - (S.w[a].c / S.w[a].n) || S.w[b].n - S.w[a].n);
  const strongest = ranked.slice(0, 8);
  const weakest = ranked.slice().reverse().filter(i => S.w[i].c / S.w[i].n < 1).slice(0, 8);

  const col = p >= 80 ? 'var(--ok)' : p >= 50 ? 'var(--accent)' : 'var(--bad)';
  const typeRows = Object.entries(r.byType).map(([k, [c, x]]) => {
    const tot = c + x, pp = pct(c, tot);
    return `<div class="bar"><span>${KINDS[k].short}</span>
      <span class="bar-t"><i class="bar-f" style="width:${pp}%"></i></span>
      <span class="v">${c}/${tot} &middot; ${pp}%</span></div>`;
  }).join('');

  const tags = (ids, cls) => ids.length
    ? `<div class="tags">${ids.map(i => `<button class="tag ${cls}" data-word="${i}">${esc(plainWord(i))}</button>`).join('')}</div>`
    : `<p class="small faint" style="margin:0">Nothing here.</p>`;

  app().innerHTML = `
  <div class="setup" style="padding-top:0">
    <div class="res-hero">
      <div class="res-ring" style="position:relative;width:184px;margin:0 auto 30px">
        ${ring(184, 10, p, col)}
        <div style="position:absolute;inset:0;display:grid;place-content:center;text-align:center">
          <div style="font-family:var(--serif);font-size:3.2rem;line-height:1;letter-spacing:-.035em"
            class="tabular"><span data-count="${p}" data-suffix="%">0%</span></div>
          <div class="small faint" style="margin-top:4px">${r.correct} of ${r.total}</div>
        </div>
      </div>
      <h1 class="res-title">${p === 100 ? 'A clean sweep.' : p >= 80 ? 'Strong round.' : p >= 50 ? 'Solid, with gaps.' : 'Plenty to work on.'}</h1>
      <p class="hero-sub" style="margin:16px auto 0;text-align:center">${wrongIds.length
        ? `${wrongIds.length} word${wrongIds.length === 1 ? '' : 's'} went to your review list.`
        : 'Nothing was added to your review list.'}</p>
    </div>

    <div class="metrics">
      <div class="metric"><div class="n tabular">${r.correct}</div><div class="k">Correct</div></div>
      <div class="metric"><div class="n tabular">${r.total - r.correct}</div><div class="k">Incorrect</div></div>
      <div class="metric"><div class="n tabular">${timeStr}</div><div class="k">Time spent</div></div>
      <div class="metric"><div class="n tabular">${Math.round(r.secs / Math.max(1, r.total))}s</div><div class="k">Per question</div></div>
    </div>

    ${typeRows ? `<div class="sec"><div class="sec-h"><div class="eyebrow">Accuracy by question type</div></div>
      <div class="bars">${typeRows}</div></div>` : ''}

    <div class="sec"><div class="sec-h"><div class="eyebrow">Words to review</div></div>${tags(wrongIds, 'bad')}</div>
    <div class="sec"><div class="sec-h"><div class="eyebrow">Answered correctly</div></div>${tags(rightIds.slice(0, 24), 'good')}</div>
    <div class="sec"><div class="sec-h"><div class="eyebrow">Your strongest words</div></div>${tags(strongest, 'good')}</div>
    <div class="sec"><div class="sec-h"><div class="eyebrow">Your weakest words</div></div>${tags(weakest, 'bad')}</div>

    <div style="display:flex;gap:11px;flex-wrap:wrap;margin-top:48px">
      <button class="btn btn-primary btn-lg" data-act="retake">Retake this test ${ICON.arrow}</button>
      <button class="btn btn-lg" data-act="review"${S.review.length ? '' : ' disabled'}>Review mistakes</button>
      <button class="btn btn-lg" data-act="weak">Practise weak words</button>
      <button class="btn btn-lg" data-tab="setup">New test</button>
    </div>
  </div>`;

  animateNumbers();
  animateRings();
  requestAnimationFrame(() => $$('.bar-f').forEach(b => { const w = b.style.width; b.style.width = '0'; requestAnimationFrame(() => b.style.width = w); }));
}
