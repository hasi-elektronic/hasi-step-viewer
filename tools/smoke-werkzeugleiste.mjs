// Headless: untere Werkzeugleiste je Marke – Farben normal/aktiv aus den Markenvariablen, Lesbarkeit bei 20 px, Screenshots.
import { chromium } from 'playwright-core';
import fs from 'fs';
const port = process.env.PORT || '4173';
const dir = process.env.SHOTDIR || 'docs/werkzeugleiste';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
const errs = [], extern = [];
p.on('pageerror', e => errs.push(e.message));
p.on('request', r => { const u = r.url(); if (!u.startsWith('http://localhost:' + port) && !u.startsWith('data:') && !u.startsWith('blob:')) extern.push(u); });
const fail = m => { throw new Error(m); };
await p.goto('http://localhost:' + port + '/');
await p.waitForFunction(() => window.__loadUrl);
const marke = await p.evaluate(() => document.documentElement.dataset.marke || 'hasi');
const F = marke === 'sickinger' ? { a: 'rgb(0, 158, 223)', d: 'rgb(0, 75, 133)' } : { a: 'rgb(51, 175, 226)', d: 'rgb(26, 127, 174)' };
const farben = id => p.evaluate(id => { const s = document.querySelector('#' + id + ' svg'); const g = el => el && getComputedStyle(el);
  return { strich: g(s).stroke, akzent: g(s.querySelector('.ac'))?.stroke || g(s.querySelector('.acf'))?.fill, flaeche: g(s.querySelector('.fl'))?.fill, groesse: s.getBoundingClientRect().width }; }, id);
fs.mkdirSync(dir, { recursive: true });
const name = marke === 'sickinger' ? 'ms3d' : 'hasi3d';
const leiste = p.locator('#boden');
// Normalzustand: kein Knopf aktiv
await p.evaluate(() => document.querySelectorAll('#boden button').forEach(b => b.classList.remove('on')));
for (const id of ['btnReset', 'btnDreh', 'btnMessen', 'btnSchnitt', 'btnMass', 'btnBlech']) {
  const f = await farben(id);
  if (f.strich !== 'rgb(29, 29, 31)') fail(id + ' normal: Strich ' + f.strich);
  if (f.akzent && f.akzent !== F.a) fail(id + ' normal: Akzent ' + f.akzent);
  if (f.flaeche && f.flaeche !== F.a) fail(id + ' normal: Fläche ' + f.flaeche);
  if (Math.round(f.groesse) !== 26) fail(id + ': Symbolgröße ' + f.groesse);
  const t = await p.locator('#' + id).getAttribute('title'); if (!/ – /.test(t)) fail(id + ': Tooltip ' + t);
}
await leiste.screenshot({ path: `${dir}/${name}-normal.png` });
// Aktiv: Messen (Tab) bzw. Bemaßung
for (const [id, datei] of [['btnMessen', 'aktiv-messen'], ['btnMass', 'aktiv-bemassung']]) {
  await p.evaluate(id => document.querySelectorAll('#boden button').forEach(b => b.classList.toggle('on', b.id === id)), id);
  const f = await farben(id);
  if (f.strich !== F.a) fail(id + ' aktiv: Strich ' + f.strich + ' statt ' + F.a);
  if (f.akzent !== F.d) fail(id + ' aktiv: Detail ' + f.akzent + ' statt ' + F.d);
  await leiste.screenshot({ path: `${dir}/${name}-${datei}.png` });
}
// Lesbarkeit: dieselbe Leiste mit 20-px-Symbolen
await p.addStyleTag({ content: '#boden button .ik{width:20px;height:20px}' });
await p.evaluate(() => document.querySelectorAll('#boden button').forEach(b => b.classList.toggle('on', b.id === 'btnBlech')));
await leiste.screenshot({ path: `${dir}/${name}-20px.png` });
if (extern.length) fail('Externe Anfragen: ' + extern.join(', '));
if (errs.length) fail('Seitenfehler: ' + errs.join(' | '));
await b.close();
console.log(`OK: Werkzeugleiste ${marke} (Screenshots in ${dir})`);
