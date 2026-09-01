const ROOT = require('path').resolve(__dirname, '..');
const P = (...a) => require('path').join(ROOT, ...a);

const fs = require('fs');
const css = fs.readFileSync(P('src','app.css'), 'utf8');

function tokens(block) {
  const o = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) o[m[1]] = m[2].trim();
  return o;
}
const root = tokens(css.slice(css.indexOf(':root {'), css.indexOf('[data-theme="light"]')));
const light = tokens(css.slice(css.indexOf('[data-theme="light"] {'), css.indexOf('*, *::before')));

function hex(c) {
  c = c.trim();
  const m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const r = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (r) return [+r[1], +r[2], +r[3], r[4] === undefined ? 1 : +r[4]];
  return null;
}
const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
const lum = ([r, g, b]) => .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b);
function over(fg, bg) {           // composite an alpha colour onto a background
  if (fg.length < 4 || fg[3] === 1) return fg.slice(0, 3);
  const a = fg[3];
  return [0, 1, 2].map(i => Math.round(fg[i] * a + bg[i] * (1 - a)));
}
function ratio(fgc, bgc) {
  const bg = hex(bgc).slice(0, 3);
  const fg = over(hex(fgc), bg);
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + .05) / (b + .05);
}

let warn = 0;
function check(theme, T, fg, bg, min, label) {
  const r = ratio(T[fg] || fg, T[bg] || bg);
  const ok = r >= min;
  if (!ok) warn++;
  console.log(`  ${ok ? 'ok  ' : 'WARN'} ${theme} ${label.padEnd(34)} ${r.toFixed(2)}:1  (need ${min})`);
}

for (const [name, T] of [['dark ', root], ['light', light]]) {
  console.log(`\n${name} theme`);
  check(name, T, '--text',   '--bg',      4.5, 'body text on background');
  check(name, T, '--text-2', '--bg',      4.5, 'secondary text on background');
  check(name, T, '--text-3', '--bg',      3.0, 'faint text on background (large/meta)');
  check(name, T, '--text',   '--surface', 4.5, 'body text on card');
  check(name, T, '--text-2', '--surface', 4.5, 'secondary text on card');
  check(name, T, '--text-3', '--surface', 3.0, 'faint text on card');
  check(name, T, '--accent', '--bg',      3.0, 'accent on background (large type)');
  check(name, T, '--accent', '--surface', 3.0, 'accent on card (large type)');
  check(name, T, '--ok',     '--surface', 3.0, 'correct colour on card');
  check(name, T, '--bad',    '--surface', 3.0, 'incorrect colour on card');
  check(name, T, '--gold',   '--surface', 3.0, 'attention colour on card');
  check(name, T, '--accent-ink', '--accent', 4.5, 'primary button label');
}

console.log('\ndesign system');
const sizes = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map(m => +m[1]);
const uniq = [...new Set(sizes)].sort((a, b) => a - b);
console.log('  distinct rem font sizes:', uniq.length, uniq.join(', '));
const radii = [...new Set([...css.matchAll(/border-radius:\s*([^;]+);/g)].map(m => m[1].trim()))];
console.log('  radii in use:', radii.join(' | '));
const usedVars = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]));
const defined = new Set([...Object.keys(root), ...Object.keys(light)]);
const missing = [...usedVars].filter(v => !defined.has(v) && !v.startsWith('--t') && !v.startsWith('--e'));
console.log('  undefined vars:', missing.length ? missing.join(', ') : 'none');
const lightOnly = Object.keys(root).filter(k => !(k in light) && !/^--(serif|sans|shell|narrow|e|t\d)$/.test(k));
console.log('  tokens dark defines but light does not:', lightOnly.length ? lightOnly.join(', ') : 'none');

console.log(`\n${warn} contrast warnings`);
