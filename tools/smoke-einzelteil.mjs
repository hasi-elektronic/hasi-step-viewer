// Einzelteile aus einer Baugruppe: Kontextmenü (Baum und 3D), Dialog, „Als STEP speichern …“, „Alle Einzelteile als STEP speichern …“
// und „Als Einzelteil öffnen“ im Browser (WASM-Kern). Nur Testdaten aus dem Repo.
import { chromium } from 'playwright-core';
import fs from 'fs';
for (const d of ['public', 'dist']) if (fs.existsSync(d)) fs.copyFileSync('testdaten/testbaugruppe.step', d + '/testbaugruppe.step');
const port = process.env.PORT || '4173';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fail = m => { throw new Error(m); };
const errs = [];
const ctx = await b.newContext({ viewport: { width: 1400, height: 880 }, acceptDownloads: true });
await ctx.addInitScript(() => { delete window.showDirectoryPicker; localStorage.removeItem('einzelteil'); });
const p = await ctx.newPage();p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:' + port + '/');await p.waitForFunction(() => window.__loadUrl && window.__einzelteil);
await p.evaluate(() => { window.__lastLoad = null; return window.__loadUrl('./testbaugruppe.step'); });
await p.waitForFunction(() => window.__lastLoad && window.__lastLoad.bodies > 0, null, { timeout: 90000 });
const zeile = name => p.locator('#tree .trow', { hasText: name }).first();
const lesen = async dl => fs.readFileSync(await dl.path(), 'latin1');
// Baum: Kontextmenü
await zeile('Winkel links').click({ button: 'right' });
const menue = await p.locator('#ctx button').allTextContents();
for (const t of ['Als Einzelteil öffnen', 'Als STEP speichern …', 'Alle Einzelteile als STEP speichern …']) if (!menue.includes(t)) fail('Baum-Menü ohne ' + t + ': ' + menue);
await p.locator('#ctx button[data-a=einzelStep]').click();
if (await p.locator('#einzelDlg').isHidden()) fail('Dialog fehlt');
const dlgText = await p.locator('#einzelDlg').innerText();
for (const t of ['Eigenes Koordinatensystem', 'Position in der Baugruppe beibehalten', 'AP214', 'AP242', 'Speichern']) if (!dlgText.includes(t)) fail('Dialog ohne ' + t);
await p.locator('input[name=einzelSchema][value=AP242]').check();
let [dl] = await Promise.all([p.waitForEvent('download'), p.locator('#einzelOk').click()]);
if (dl.suggestedFilename() !== 'Winkel links.step') fail('Dateiname ' + dl.suggestedFilename());
let t = await lesen(dl);
if (!/PRODUCT\('Winkel links',\s*'Winkel links'/.test(t)) fail('Produktname fehlt');
if (!/AP242_MANAGED_MODEL_BASED/.test(t) || !/SI_UNIT\(\.MILLI\.,\.METRE\.\)/.test(t)) fail('AP242/mm fehlt');
console.log('  ok  Baum → Als STEP speichern … (AP242, Name, mm)');
await p.waitForFunction(() => document.getElementById('exportLauf').hidden);
// Auswahl bleibt gespeichert
const wahl = await p.evaluate(() => JSON.parse(localStorage.getItem('einzelteil')));
if (wahl.schema !== 'AP242') fail('Auswahl nicht gespeichert');
// Alle Einzelteile (ohne Ordnerdialog: nacheinander herunterladen)
await zeile('Grundplatte').click({ button: 'right' });
const dls = [];p.on('download', d => dls.push(d));
await p.locator('#ctx button[data-a=alleStep]').click();
if (!(await p.locator('#einzelText').innerText()).includes('4 verschiedene Einzelteile')) fail('Batch-Text');
if (await p.locator('#einzelLageF').isVisible()) fail('Batch zeigt Lage-Auswahl');
await p.locator('#einzelOk').click();
await p.waitForFunction(() => /4 Einzelteile als STEP gespeichert/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
const namen = dls.map(d => d.suggestedFilename()).sort();
if (JSON.stringify(namen) !== JSON.stringify(['Bolzen 1.step', 'Grundplatte.step', 'Winkel links.step', 'Winkel rechts.step'])) fail('Batch-Namen ' + namen);
console.log('  ok  Alle Einzelteile: je Unikat eine Datei', namen.join(', '));
// 3D-Menü
const r = await p.evaluate(() => { const c = document.querySelector('#view').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
let menue3d = null;
const mr = await p.evaluate(() => window.__dock().modell);
suche: for (const fy of [.5, .4, .6, .3, .7]) for (const fx of [.5, .4, .6, .3, .7, .2, .8]) {
  await p.evaluate(([x, y]) => window.__viewMenu(x, y), [r.x + mr.x0 + (mr.x1 - mr.x0) * fx, r.y + mr.y0 + (mr.y1 - mr.y0) * fy]);
  menue3d = await p.locator('#ctx button').allTextContents();if (menue3d.includes('Als Einzelteil öffnen')) break suche;
}
if (!menue3d.includes('Als Einzelteil öffnen') || !menue3d.includes('Als STEP speichern …')) fail('3D-Menü ohne Einzelteil-Einträge: ' + menue3d);
await p.keyboard.press('Escape');await p.evaluate(() => document.getElementById('ctx')?.remove());
await p.evaluate(([x, y]) => window.__viewMenu(x, y), [r.x + 6, r.y + r.h - 6]);
if (!(await p.locator('#ctx button').allTextContents()).includes('Alle Einzelteile als STEP speichern …')) fail('Leeres 3D-Menü ohne Batch');
await p.evaluate(() => document.getElementById('ctx')?.remove());
console.log('  ok  3D-Kontextmenü');
// Als Einzelteil öffnen → neue Registerkarte mit genau einem Körper
await zeile('Winkel rechts').click({ button: 'right' });
await p.locator('#ctx button[data-a=einzelOeffnen]').click();
if (await p.locator('#einzelSchemaF').isVisible()) fail('Öffnen zeigt Format-Auswahl');
const [neu] = await Promise.all([ctx.waitForEvent('page'), p.locator('#einzelOk').click()]);
neu.on('pageerror', e => errs.push(e.message));
await neu.waitForFunction(() => window.__lastLoad && window.__lastLoad.bodies > 0, null, { timeout: 90000 });
const info = await neu.evaluate(() => ({ n: window.__lastLoad.bodies, name: window.__lastLoad.name }));
if (info.n !== 1 || info.name !== 'Winkel rechts.step') fail('Einzelteil ' + JSON.stringify(info));
console.log('  ok  Als Einzelteil öffnen:', info.name);
// Nie „Betrachter“ in der Oberfläche
for (const s of [p, neu]) if (/betrachter/i.test(await s.evaluate(() => document.body.innerText + [...document.querySelectorAll('[title]')].map(e => e.title).join(' ')))) fail('„Betrachter“ in der Oberfläche');
if (errs.length) fail('Seitenfehler: ' + errs.join(' | '));
await b.close();
console.log('OK: Einzelteile (Menü, Dialog, Speichern, Alle, Öffnen)');
