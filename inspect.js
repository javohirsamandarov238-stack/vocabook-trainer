const ROOT = require('path').resolve(__dirname, '..');
const P = (...a) => require('path').join(ROOT, ...a);

const fs = require('fs'), { JSDOM } = require('jsdom');
const html = fs.readFileSync(P('index.html'), 'utf8');

function open(disk) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local/' });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { value: {
    getItem: k => (k in disk ? disk[k] : null), setItem: (k, v) => disk[k] = String(v), removeItem: k => delete disk[k] } });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = q => ({ matches: /dark/.test(q), addEventListener() {} });
  return dom;
}
const T = (w, s) => [...w.document.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, ' ').trim());
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---- 1. fresh account ----
  let dom = open({}), w = dom.window;
  await wait(200);
  console.log('=========== FRESH ACCOUNT ===========');
  console.log('theme  :', w.document.documentElement.dataset.theme);
  console.log('HERO   :', T(w, '.hero-title')[0]);
  console.log('SUB    :', T(w, '.hero-sub')[0]);
  console.log('ORB    :', T(w, '.orb-in')[0]);
  console.log('OVERVW :', T(w, '.overview')[0]);
  console.log('spread bar segments:', w.document.querySelectorAll('.spine-bar i').length);

  // ---- 2. play several full tests, then look again ----
  const disk = {};
  dom = open(disk); w = dom.window;
  await wait(200);
  const click = s => { const e = w.document.querySelector(s); if (e) e.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return !!e; };
  for (let t = 0; t < 6; t++) {
    click('[data-act="adaptive"]'); await wait(40);
    let g = 0;
    while (w.document.querySelector('.options') && g++ < 40) {
      const pick = (t + g) % 4;                       // a mix of right and wrong
      click(`.ans[data-opt="${pick}"]`); await wait(12);
      click('[data-act="next"]'); await wait(12);
    }
    click('[data-tab="dash"]'); await wait(40);
  }
  await wait(120);
  console.log('\n=========== AFTER SIX TESTS ===========');
  console.log('HERO   :', T(w, '.hero-title')[0]);
  console.log('SUB    :', T(w, '.hero-sub')[0]);
  console.log('ORB    :', T(w, '.orb-in')[0]);
  console.log('OVERVW :', T(w, '.overview')[0]);
  console.log('sparkline:', w.document.querySelector('.spark') ? 'drawn' : 'absent');
  console.log('CHALL  :', T(w, '.challenge-txt')[0].slice(0, 130));
  console.log('\nINSIGHTS:');
  T(w, '.insight').forEach(x => console.log('  •', x));

  // ---- 3. a question screen ----
  click('[data-mode="mixed"]'); await wait(40);
  click('[data-act="start"]'); await wait(60);
  console.log('\n=========== QUESTION SCREEN ===========');
  console.log('chrome hidden:', w.document.body.classList.contains('focus-mode'));
  console.log('label  :', T(w, '.quiz-top .eyebrow')[0]);
  console.log('ask    :', T(w, '.q-ask')[0]);
  console.log('prompt :', (T(w, '.q-word')[0] || T(w, '.q-def')[0] || T(w, '.q-sent')[0]));
  T(w, '.ans').forEach((x, i) => console.log('   ', 'ABCD'[i], x));
  console.log('footer :', T(w, '.q-foot')[0]);
  console.log('thread segments:', w.document.querySelectorAll('.qthread i').length);

  click('.ans[data-opt="0"]'); await wait(50);
  console.log('\nFEEDBACK:');
  console.log('  verdict:', T(w, '.fb-verdict')[0]);
  console.log('  lead   :', T(w, '.fb-lead')[0]);
  T(w, '.fb-row').forEach(x => console.log('  •', x.slice(0, 120)));

  // ---- 4. a vocabulary card ----
  click('[data-tab="library"]'); await wait(80);
  console.log('\n=========== WORD CARD (collapsed) ===========');
  console.log(T(w, '.entry')[0]);
  click('.entry'); await wait(60);
  console.log('\n=========== WORD CARD (expanded) ===========');
  console.log(T(w, '.entry.open')[0]);
  console.log('\nNaN/undefined anywhere:', /NaN|undefined/.test(w.document.body.innerHTML) ? 'YES — PROBLEM' : 'no');
})();
