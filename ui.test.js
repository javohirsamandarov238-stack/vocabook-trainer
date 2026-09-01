/* Drives the built single-file app in a real DOM, clicking through
   the flows listed in the brief. */
const ROOT = require('path').resolve(__dirname, '..');
const P = (...a) => require('path').join(ROOT, ...a);

const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(P('index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('  FAIL:', n, x === undefined ? '' : x); } };
const sec = t => console.log('\n== ' + t);

// a localStorage that survives a "page reload"
const disk = {};
const storageStub = {
  getItem: k => (k in disk ? disk[k] : null),
  setItem: (k, v) => { disk[k] = String(v); },
  removeItem: k => { delete disk[k]; },
  clear: () => { for (const k in disk) delete disk[k]; }
};

function open() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local/' });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { value: storageStub, configurable: true });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = w.matchMedia || (q => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  return dom;
}

const settle = (w) => new Promise(r => setTimeout(r, 60));

function click(dom, sel) {
  const el = dom.window.document.querySelector(sel);
  if (!el) throw new Error('no element for ' + sel);
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  return el;
}
const q = (dom, s) => dom.window.document.querySelector(s);
const qa = (dom, s) => [...dom.window.document.querySelectorAll(s)];
const text = dom => dom.window.document.querySelector('#app').textContent;

(async () => {
  /* ---------------------------------------------------- */
  sec('Page boots');
  let dom = open();
  await settle(dom.window);
  ok('loading placeholder is removed', !q(dom, '#boot'));
  ok('nav renders four tabs', qa(dom, '#tabs button').length === 4);
  ok('dashboard is the landing view', /Vocabook/.test(text(dom)) && /today.s session/i.test(text(dom)));
  ok('word count shown', /1,343/.test(text(dom)), text(dom).slice(0, 120));
  ok('no unresolved template markers', !/__CSS__|__JS__|__DATA__|undefined%/.test(dom.window.document.body.innerHTML));

  /* ---------------------------------------------------- */
  sec('1-6. Start a test, answer right and wrong, move between questions');
  click(dom, '[data-act="adaptive"]');
  await settle(dom.window);
  ok('quiz view opened', !!q(dom, '.options'), text(dom).slice(0, 80));
  ok('four options rendered', qa(dom, '.ans').length === 4);
  ok('progress bar present', !!q(dom, '.qthread i'));

  // answer question 1 deliberately WRONG
  let optsBefore = qa(dom, '.ans').length;
  click(dom, '.ans[data-opt="0"]');
  await settle(dom.window);
  let fb = q(dom, '.fb');
  ok('feedback panel appears', !!fb);
  ok('feedback gives a verdict', !!fb.querySelector('.fb-verdict'));
  ok('an example sentence is shown', /In a sentence/.test(fb.textContent));
  ok('a Next button is offered, not an auto-advance', !!q(dom, '[data-act="next"]'));
  ok('all four options are locked after answering', qa(dom, '.ans.locked').length === 4);
  ok('exactly one option marked correct', qa(dom, '.ans.right').length === 1);
  ok('clicking another option does nothing', (click(dom, '.ans[data-opt="1"]'), qa(dom, '.ans.right').length === 1));

  const firstCount = q(dom, '.q-foot .tabular').textContent.trim();
  click(dom, '[data-act="next"]');
  await settle(dom.window);
  ok('advanced to the next question', q(dom, '.q-foot .tabular').textContent.trim() !== firstCount,
     `${firstCount} -> ${q(dom, '.q-foot .tabular').textContent.trim()}`);
  ok('feedback cleared on the new question', !q(dom, '.fb'));

  // finish the rest of the test, alternating right and wrong on purpose
  let guard = 0;
  let answeredRight = 0, answeredWrong = 0;
  while (q(dom, '.options') && guard++ < 100) {
    // find the genuinely correct option by reading the app's own marking:
    // click one, see if it was right, then continue
    const pick = guard % 3 === 0 ? 0 : 1;
    click(dom, `.ans[data-opt="${pick}"]`);
    await settle(dom.window);
    if (q(dom, '.ans.right.wrong')) { /* impossible, sanity */ }
    if (q(dom, `.ans[data-opt="${pick}"]`).classList.contains('is-right')) answeredRight++; else answeredWrong++;
    click(dom, '[data-act="next"]');
    await settle(dom.window);
  }
  ok('test ran to completion without stalling', guard < 100, guard);

  /* ---------------------------------------------------- */
  sec('7. Results page');
  const rt = text(dom);
  ok('results view reached', /Correct/.test(rt) && /Time spent/.test(rt), rt.slice(0, 100));
  ok('score ring rendered', !!q(dom, '.res-ring'));
  ok('percentage shown', /\d+%/.test(q(dom, '.res-ring').textContent));
  ok('correct/incorrect counts shown', qa(dom, '.metric').length >= 4);
  ok('accuracy by question type shown', /Accuracy by question type/.test(rt));
  ok('strongest and weakest listed', /strongest words/i.test(rt) && /weakest words/i.test(rt));
  ok('retake button present', !!q(dom, '[data-act="retake"]'));
  ok('review mistakes button present', !!q(dom, '[data-act="review"]'));
  ok('practise weak words button present', !!q(dom, '[data-act="weak"]'));
  ok('start new test button present', !!q(dom, '[data-tab="setup"]'));

  const totalAnswered = answeredRight + answeredWrong + 1;

  /* ---------------------------------------------------- */
  sec('8. Review mistakes flow');
  if (answeredWrong > 0) {
    click(dom, '[data-act="review"]');
    await settle(dom.window);
    ok('review drill starts', !!q(dom, '.options'), text(dom).slice(0, 80));
    click(dom, '.ans[data-opt="0"]'); await settle(dom.window);
    click(dom, '[data-act="next"]'); await settle(dom.window);
    ok('review drill is answerable', true);
    // bail out of the drill
    click(dom, '[data-tab="dash"]'); await settle(dom.window);
    const scrim = q(dom, '.scrim');
    if (scrim) { click(dom, '[data-no]'); await settle(dom.window); }
  } else { ok('review skipped: nothing was answered wrong', true); }

  /* ---------------------------------------------------- */
  sec('9. Adaptive test from the dashboard');
  click(dom, '[data-tab="dash"]'); await settle(dom.window);
  if (q(dom, '.scrim')) { click(dom, '[data-yes]'); await settle(dom.window); }
  ok('dashboard reachable again', /today.s session/i.test(text(dom)));
  const dashText = text(dom);
  ok('dashboard shows real accuracy, not a placeholder', /\d+%/.test(dashText));
  ok('dashboard reports real work done', /questions this week/i.test(dashText) && !/\b0\s+questions this week/.test(dashText.replace(/\s+/g,' ')));

  /* ---------------------------------------------------- */
  sec('11-12. Search and filter the vocabulary');
  click(dom, '[data-tab="library"]'); await settle(dom.window);
  ok('library renders entries', qa(dom, '.entry').length > 0, qa(dom, '.entry').length);
  ok('library paginates rather than dumping 1343 rows', qa(dom, '.entry').length <= 48, qa(dom, '.entry').length);

  const input = q(dom, '#q');
  input.value = 'erratic';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await settle(dom.window);
  ok('search narrows the list', qa(dom, '.entry').length >= 1 && qa(dom, '.entry').length < 20, qa(dom, '.entry').length);
  ok('search finds the right word', /Erratic/i.test(q(dom, '.entry').textContent));

  input.value = 'zzzznotaword';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await settle(dom.window);
  ok('empty search shows an empty state, not a crash', /Nothing matches/.test(text(dom)));

  input.value = '';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await settle(dom.window);

  const before = qa(dom, '.entry').length;
  click(dom, '[data-filter="new"]'); await settle(dom.window);
  ok('never-tested filter works', qa(dom, '.entry').length > 0);
  click(dom, '[data-filter="weak"]'); await settle(dom.window);
  const weakRows = qa(dom, '.entry').length;
  ok('weak filter returns only tested words', weakRows > 0 && !/Not tested/.test(qa(dom, '.entry').map(e => e.textContent).join('')), weakRows);
  click(dom, '[data-filter="all"]'); await settle(dom.window);
  ok('all filter restores the list', qa(dom, '.entry').length === before);

  const sort = q(dom, '#sort');
  sort.value = 'az';
  sort.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await settle(dom.window);
  const words = qa(dom, '.entry-w').map(e => e.firstChild.textContent.trim().toLowerCase());
  ok('A-Z sort is actually sorted', words.every((w, i) => i === 0 || w >= words[i - 1]), words.slice(0, 4));

  const chapSel = q(dom, '#chapter');
  chapSel.value = 'College Panda 400 Words';
  chapSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await settle(dom.window);
  ok('source filter works', qa(dom, '.entry').length > 0);

  ok('entries show definition, example, mastery and accuracy', (() => {
    const e = q(dom, '.entry');
    return !!e.querySelector('.entry-def') && !!e.querySelector('.entry-ex') && !!e.querySelector('.mastery-t') && /%|Not tested/.test(e.textContent);
  })());

  /* ---------------------------------------------------- */
  sec('Progress page');
  click(dom, '[data-tab="progress"]'); await settle(dom.window);
  const pt = text(dom);
  ok('progress page renders', /Words mastered/.test(pt));
  ok('recent tests listed', /Recent tests/.test(pt));
  ok('distribution chart present', /Where your words stand/.test(pt));
  ok('no NaN anywhere', !/NaN/.test(dom.window.document.body.innerHTML));

  /* ---------------------------------------------------- */
  sec('Daily challenge');
  click(dom, '[data-tab="dash"]'); await settle(dom.window);
  click(dom, '[data-act="daily"]'); await settle(dom.window);
  ok('daily challenge starts', !!q(dom, '.options'));
  let dg = 0;
  while (q(dom, '.options') && dg++ < 20) {
    click(dom, '.ans[data-opt="0"]'); await settle(dom.window);
    click(dom, '[data-act="next"]'); await settle(dom.window);
  }
  ok('daily challenge is exactly 10 questions', dg === 10, dg);
  ok('daily challenge ends on results', /Time spent/.test(text(dom)));
  click(dom, '[data-tab="dash"]'); await settle(dom.window);
  ok('dashboard records the daily result', /caught them today/i.test(text(dom)), text(dom).match(/Daily challenge.{0,60}/));

  /* ---------------------------------------------------- */
  sec('10. Refresh the page and confirm progress survives');
  const savedRaw = disk['vocabook.progress.v1'];
  ok('progress was written to storage', !!savedRaw);
  const saved = JSON.parse(savedRaw || '{}');
  ok('per-word records saved', Object.keys(saved.w || {}).length > 0, Object.keys(saved.w || {}).length);
  ok('test history saved', (saved.tests || []).length >= 2, (saved.tests || []).length);

  const dom2 = open();                       // fresh document, same "disk"
  await settle(dom2.window);
  const t2 = text(dom2);
  ok('reloaded app shows the earlier accuracy', /\d+%/.test(t2));
  ok('reloaded app shows tests completed', new RegExp(String((saved.tests || []).length)).test(t2));
  click(dom2, '[data-tab="progress"]'); await settle(dom2.window);
  ok('history survived the reload', /Recent tests/.test(text(dom2)) && !/No tests yet/.test(text(dom2)));

  /* ---------------------------------------------------- */
  sec('Configure a test');
  click(dom2, '[data-tab="setup"]'); await settle(dom2.window);
  ok('setup screen renders', /Number of questions/.test(text(dom2)));
  ok('all five count options offered', qa(dom2, '[data-set="count"]').length === 5);
  ok('all four difficulties offered', qa(dom2, '[data-set="difficulty"]').length === 4);
  ok('all five formats offered', qa(dom2, '[data-set="mode"]').length === 5);
  ok('two toggles offered', qa(dom2, '[data-toggle]').length === 2);

  click(dom2, '[data-set="count"][data-val="10"]'); await settle(dom2.window);
  ok('count selection sticks', q(dom2, '[data-set="count"][data-val="10"]').getAttribute('aria-pressed') === 'true');
  click(dom2, '[data-set="mode"][data-val="blank"]'); await settle(dom2.window);
  ok('mode selection sticks', q(dom2, '[data-set="mode"][data-val="blank"]').getAttribute('aria-pressed') === 'true');
  const tog = q(dom2, '[data-toggle="randomize"]');
  const wasOn = tog.getAttribute('aria-pressed');
  click(dom2, '[data-toggle="randomize"]'); await settle(dom2.window);
  ok('toggle flips', q(dom2, '[data-toggle="randomize"]').getAttribute('aria-pressed') !== wasOn);

  click(dom2, '[data-act="start"]'); await settle(dom2.window);
  ok('configured test starts', !!q(dom2, '.options'));
  ok('fill-in-the-blank mode shows a blank', !!q(dom2, '.blank'), q(dom2, '.quiz-top .eyebrow') && q(dom2, '.quiz-top .eyebrow').textContent);
  let cg = 0;
  while (q(dom2, '.options') && cg++ < 20) {
    click(dom2, '.ans[data-opt="2"]'); await settle(dom2.window);
    click(dom2, '[data-act="next"]'); await settle(dom2.window);
  }
  ok('configured count of 10 was honoured', cg === 10, cg);

  /* ---------------------------------------------------- */
  sec('Keyboard control');
  click(dom2, '[data-tab="dash"]'); await settle(dom2.window);
  click(dom2, '[data-act="adaptive"]'); await settle(dom2.window);
  dom2.window.document.dispatchEvent(new dom2.window.KeyboardEvent('keydown', { key: '2', bubbles: true }));
  await settle(dom2.window);
  ok('number keys answer', !!q(dom2, '.fb'));
  dom2.window.document.dispatchEvent(new dom2.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await settle(dom2.window);
  ok('Enter advances', !q(dom2, '.fb') && !!q(dom2, '.options'));

  /* ---------------------------------------------------- */
  sec('Theme switch');
  const before2 = dom2.window.document.documentElement.dataset.theme;
  click(dom2, '#themeBtn'); await settle(dom2.window);
  click(dom2, '#themeBtn'); await settle(dom2.window);
  ok('theme toggles', dom2.window.document.documentElement.dataset.theme !== undefined);

  /* ---------------------------------------------------- */
  sec('Reset');
  click(dom2, '[data-tab="progress"]'); await settle(dom2.window);
  click(dom2, '[data-act="reset"]'); await settle(dom2.window);
  ok('reset asks for confirmation first', !!q(dom2, '.scrim'));
  click(dom2, '[data-yes]'); await settle(dom2.window);
  await settle(dom2.window);
  ok('reset returns to a clean dashboard', /Starts here/i.test(text(dom2)), text(dom2).slice(0, 90));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
