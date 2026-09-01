const ROOT = require('path').resolve(__dirname, '..');
const P = (...a) => require('path').join(ROOT, ...a);

const fs = require('fs');
const path = ROOT;
const VOCAB = JSON.parse(fs.readFileSync(P('data','vocabulary.build.json'), 'utf8'));
global.VOCAB = VOCAB;
global.esc = s => String(s);
global.localStorage = { setItem() {}, getItem() { return null; }, removeItem() {} };

let code = fs.readFileSync(P('src','1-core.js'), 'utf8') + '\n'
         + fs.readFileSync(P('src','2-questions.js'), 'utf8')
         + `\nmodule.exports={S:()=>S,setS:v=>{S=v},buildTest,score,summary,BLANK_STATE,weight,newWordAllowance,inFlightCount,band};`;
const M = new module.constructor(); M._compile(code, 'a.js');
const A = M.exports;

function run(accuracy, tests, per) {
  A.setS(A.BLANK_STATE());
  const seenSet = new Set();
  const rows = [];
  for (let t = 0; t < tests; t++) {
    const qs = A.buildTest({ count: per, mode: 'mixed', difficulty: 'adaptive', includeMissed: true, randomize: true });
    for (const q of qs) { seenSet.add(q.word); A.score(q.word, Math.random() < accuracy, q.kind); }
    if ((t + 1) % 4 === 0 || t === tests - 1) {
      const s = A.summary();
      let inFlight = 0; for (const k in A.S().w) { const r = A.S().w[k]; if (r.n && r.l < 4) inFlight++; }
      rows.push(`  after ${String(t + 1).padStart(2)} tests: seen ${String(seenSet.size).padStart(4)}  inFlight ${String(inFlight).padStart(3)}  mastered ${String(s.mastered).padStart(3)}  review ${String(s.review).padStart(3)}  newAllow ${A.newWordAllowance()}`);
    }
  }
  return rows.join('\n');
}

for (const acc of [0.6, 0.7, 0.85]) {
  console.log(`\naccuracy ${acc}, 12 tests x 20 questions`);
  console.log(run(acc, 12, 20));
}
console.log('\naccuracy 0.7, 40 tests x 20 questions (a few weeks of study)');
console.log(run(0.7, 40, 20));
