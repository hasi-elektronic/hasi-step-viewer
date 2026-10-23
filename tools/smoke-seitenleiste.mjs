// Seitenleiste: Messen, Blech, Schnitt, Verschieben und Eigenschaften dürfen das Modell nie verdecken.
// Prüft: projizierter Hüllquader des Modells überlappt das Feld nicht, Modell ganz im Bild, Einklappen, Ziehen nach links, Zustand bleibt nach Neuladen.
// Nur Testdaten aus dem Repo. Screenshots nach SHOTDIR (Standard docs/seitenleiste).
import { chromium } from 'playwright-core';
import fs from 'fs';
for (const d of ['public', 'dist']) if (fs.existsSync(d)) fs.copyFileSync('testdaten/testbaugruppe.step', d + '/testbaugruppe.step');
const port = process.env.PORT || '4173';const dir = process.env.SHOTDIR || 'docs/seitenleiste';const marke = process.env.MARKE || 'hasi';
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fail = m => { throw new Error(m); };
const errs = [];
async function seite(w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h } });p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + port + '/');await p.waitForFunction(() => window.__loadUrl && window.__dock);return p;
}
async function laden(p, datei) {
  await p.evaluate(d => { window.__lastLoad = null; return window.__loadUrl('./' + d); }, datei);
  await p.waitForFunction(() => window.__lastLoad && window.__lastLoad.bodies > 0, null, { timeout: 90000 });await ruhe(p);
}
const ruhe = p => p.waitForTimeout(700); // Einpassen ist animiert
async function pruefe(p, was, shot) {
  await ruhe(p);
  const d = await p.evaluate(() => window.__dock());
  if (!d.dock) fail(was + ': Seitenleiste nicht sichtbar');
  if (d.ueberlappt) fail(was + ': Modell liegt unter dem Feld ' + JSON.stringify(d));
  const [w, h] = d.ansicht, m = d.modell;
  if (m.x0 < -1 || m.y0 < -1 || m.x1 > w + 1 || m.y1 > h + 1) fail(was + ': Modell nicht ganz im Bild ' + JSON.stringify(m));
  if (shot) await p.locator('#view').screenshot({ path: `${dir}/${marke}-${shot}.png` });
  console.log('  ok ', was, JSON.stringify({ frei: Math.round(d.frei), seite: d.zustand.seite, zu: d.zustand.zu }));
  return d;
}
const shot0 = true;
for (const [w, h, tag] of [[1500, 900, 'gross'], [1100, 700, 'klein']]) {
  const p = await seite(w, h);
  await p.evaluate(() => localStorage.removeItem('seitenleiste'));await p.reload();await p.waitForFunction(() => window.__loadUrl && window.__dock);
  await laden(p, 'testbaugruppe.step');
  // Start wie eDrawings: kein Werkzeugfeld offen, Modell frei
  { const d0 = await p.evaluate(() => window.__dock()); if (d0.dock || !(await p.locator('#messenPanel').isHidden())) fail('Nach dem Laden ist ein Werkzeugfeld offen ' + JSON.stringify(d0)); if (shot0) await p.locator('#view').screenshot({ path: `${dir}/${marke}-start-${tag}.png` }); }
  await p.locator('#btnMessen').click();
  await pruefe(p, tag + ' Messen', tag === 'gross' ? 'messen' : 'messen-klein');
  // Einpassen nach dem Öffnen nutzt die freie Fläche
  await p.locator('#fit').click();await pruefe(p, tag + ' Einpassen mit Messen');
  await p.locator('#btnBlech').click();await pruefe(p, tag + ' Blech', tag === 'gross' ? 'blech' : null);
  if (await p.locator('#btnMass').count()) fail('Bemaßung-Knopf soll entfallen');await p.locator('#btnMessen').click();await p.evaluate(() => { document.getElementById('messenErweitert').open = true; });await pruefe(p, tag + ' Messen (Bemaßungen)', tag === 'gross' ? 'bemassung' : null);
  await p.locator('#btnSchnitt').click();
  await p.evaluate(async () => { const n = window.__app.nodes().find(n => n.all && n.all.length === 1) || window.__app.nodes()[0]; window.__app.selectNode(n, true); await window.__app.act('props', n); await window.__app.act('move', n); });
  if (await p.locator('#bewegenPanel').isHidden()) fail('Verschieben-Feld geht nicht auf');
  await pruefe(p, tag + ' Schnitt + Eigenschaften + Verschieben', tag === 'gross' ? 'alle-felder' : null);
  await p.locator('#btnSchnitt').click();await p.locator('#propsClose').click();await p.locator('#bewegenZu').click();
  // Einklappen: nur noch eine schmale Lasche, Modell bekommt die Fläche zurück
  if (await p.locator('#messenPanel').isHidden()) await p.locator('#btnMessen').click();await p.locator('#messenZu').click();
  const zu = await pruefe(p, tag + ' eingeklappt', tag === 'gross' ? 'eingeklappt' : null);
  if (!zu.zustand.zu || zu.frei > 80) fail('Einklappen wirkt nicht: ' + JSON.stringify(zu));
  await p.locator('#dockLasche').click();
  const auf = await pruefe(p, tag + ' ausgeklappt');
  if (auf.zustand.zu || auf.frei < 200) fail('Ausklappen wirkt nicht');
  if (tag === 'gross') {
    // Standard links unten; an der Titelleiste nach rechts ziehen: rastet rechts ein, Lage bleibt nach Neuladen, das Feld selbst ist nach dem Start zu
    const t = await p.locator('#messenPanel .ptitel').boundingBox();
    await p.mouse.move(t.x + 40, t.y + t.height / 2);await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(t.x + 40 + i * 140, t.y + t.height / 2 - i * 10);
    await p.mouse.up();
    const l = await pruefe(p, 'rechts angedockt', 'rechts');
    if (l.zustand.seite !== 'rechts') fail('Ziehen nach rechts rastet nicht ein: ' + JSON.stringify(l.zustand));
    await p.locator('#messenZu').click();
    await p.reload();await p.waitForFunction(() => window.__loadUrl && window.__dock);await laden(p, 'testbaugruppe.step');
    const n = await p.evaluate(() => window.__dock());
    if (n.zustand.seite !== 'rechts') fail('Lage nach Neuladen verloren: ' + JSON.stringify(n.zustand));
    if (n.dock || !(await p.locator('#messenPanel').isHidden())) fail('Nach dem Start ist ein Werkzeugfeld offen');
    await p.locator('#btnMessen').click();await pruefe(p, 'nach Neuladen rechts, Messen geöffnet');
    await p.evaluate(() => localStorage.removeItem('seitenleiste'));
  }
  await p.close();
}
if (errs.length) fail('Seitenfehler: ' + errs.join(' | '));
console.log('smoke-seitenleiste ok');
await b.close();
