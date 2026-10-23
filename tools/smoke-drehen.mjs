// Drehen wie SolidWorks: kein Nachlauf nach dem Loslassen (Drehen, Schwenken, Zoom), Autodrehen nur als ausdrücklicher Schalter.
import { chromium } from 'playwright-core';
const port = process.env.PORT || '4173';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
const fail = m => { throw new Error(m); };
await p.goto('http://localhost:' + port + '/');
await p.waitForFunction(() => window.__loadUrl);
await p.evaluate(() => window.__loadUrl('./testblech.step'));
await p.waitForFunction(() => window.__lastLoad && window.__lastLoad.bodies > 0, { timeout: 60000 });
await p.evaluate(() => window.__app.fitIso());
await p.waitForTimeout(800);
const st = () => p.evaluate(() => window.__steuerung());
const frames = n => p.evaluate(n => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const gleich = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
let s = await st();
if (s.daempfung) fail('Dämpfung (Nachlauf) ist an');
if (s.autoRotate || s.autodrehen) fail('Autodrehen läuft ohne Schalter');
const mitte = s.mitte;
if (!gleich(s.ziel, mitte)) fail('Drehpunkt ist nicht die Modellmitte: ' + s.ziel + ' / ' + mitte);
const matrizen = await p.evaluate(() => window.__app.matrizen());
const r = await p.locator('#buehne').boundingBox();
const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
// schnelles Ziehen mit der mittleren Taste, dann loslassen: danach darf sich nichts mehr bewegen
async function ziehen(mods, dx, dy) {
  for (const m of mods) await p.keyboard.down(m);
  await p.mouse.move(cx, cy); await p.mouse.down({ button: 'middle' });
  for (let i = 1; i <= 6; i++) await p.mouse.move(cx + dx * i / 6, cy + dy * i / 6);
  await p.mouse.up({ button: 'middle' });
  for (const m of mods) await p.keyboard.up(m);
}
const vor = (await st()).pos;
await ziehen([], 240, 60);
await frames(2);
const nach = await st();
if (gleich(nach.pos, vor)) fail('Mitte ziehen dreht nicht');
if (!gleich(nach.ziel, mitte)) fail('Drehen verschiebt den Drehpunkt');
await frames(30);
if (!gleich((await st()).pos, nach.pos)) fail('Nachlauf nach dem Drehen');
// Über die Pole hinweg bis hinter das Modell: bei OrbitControls blieb up immer
// (0,1,0), senkrechtes Drehen blieb an den Polen hängen.
await p.evaluate(() => window.__app.ansicht('vorne'));
await p.waitForFunction(() => window.__app.animFertig());
let ueberKopf = false, hinten = false;
for (let i = 0; i < 5; i++) {
  await ziehen([], 0, Math.min(220, r.height * 0.3));
  await frames(2);
  const frei = await st();
  ueberKopf ||= frei.up[1] < -0.2;
  hinten ||= frei.pos[2] < frei.ziel[2];
  if (!gleich(frei.ziel, mitte)) fail('Freies Drehen verändert den Drehpunkt');
}
if (!ueberKopf || !hinten) fail('Drehen erreicht die Rückseite über den Pol nicht');
await ziehen([], 160, 80);
const frei = await st();
await frames(20);
if (!gleich((await st()).up, frei.up)) fail('Rollwinkel läuft nach');
if (JSON.stringify(await p.evaluate(() => window.__app.matrizen())) !== JSON.stringify(matrizen)) fail('Ansicht drehen verändert Bauteillagen');
// Strg+Mitte = schwenken, ohne Nachlauf
await ziehen(['Control'], 150, 40);
await frames(2);
const pan = await st();
if (gleich(pan.ziel, mitte)) fail('Strg+Mitte schwenkt nicht');
await frames(30);
const pan2 = await st();
if (!gleich(pan2.pos, pan.pos) || !gleich(pan2.ziel, pan.ziel)) fail('Nachlauf nach dem Schwenken');
// Rad = Zoom zum Cursor, ohne Nachlauf
await p.mouse.move(cx + 120, cy - 80);
await p.mouse.wheel(0, -400);
await frames(2);
const z = await st();
if (gleich(z.pos, pan2.pos)) fail('Rad zoomt nicht');
await frames(30);
if (!gleich((await st()).pos, z.pos)) fail('Nachlauf nach dem Zoomen');
// Zoomanker bleibt unter dem Cursor, auch mit seitlich versetztem Kamerabild.
await p.evaluate(() => window.__app.ansicht('vorne'));
await p.waitForFunction(() => window.__app.animFertig());
const punkt = (await st()).ziel.map((x,i) => x + (i === 0 ? 10 : 0));
const pixel = await p.evaluate(p => window.__app.screenOf(p), punkt);
await p.mouse.move(pixel[0], pixel[1]);await p.mouse.wheel(0, -250);await frames(2);
const pixelDanach = await p.evaluate(p => window.__app.screenOf(p), punkt);
if (Math.hypot(pixel[0]-pixelDanach[0],pixel[1]-pixelDanach[1]) > 0.5) fail('Zoom verschiebt den Punkt unter dem Cursor');
// Hauptknopf startet freie Mausnavigation statt automatischer Einachsdrehung.
await p.locator('#btnDreh').click();
if ((await st()).autodrehen || await p.evaluate(() => window.__app.werkzeug()) !== 'drehen') fail('Hauptknopf startet kein freies Drehen');
if (await p.locator('#btnDreh').getAttribute('aria-pressed') !== 'true') fail('Drehen-Werkzeug nicht aktiv markiert');
const linksVorher = (await st()).pos;
await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+140,cy+100,{steps:8});await p.mouse.up();await frames(2);
if (gleich(linksVorher,(await st()).pos)) fail('Drehen-Werkzeug dreht mit Links nicht');
await p.locator('#btnDreh').click();
if (await p.evaluate(() => window.__app.werkzeug()) !== 'wahl') fail('Drehen-Knopf kehrt nicht zur Auswahl zurück');
// Autodrehen: Schalter an, dann dreht es; ein Griff in die Ansicht schaltet es aus und es steht danach still
await p.getByRole('button',{name:'Werkzeuge',exact:true}).click();
await p.locator('[data-aktion="drehen"]').click();
s = await st();
if (!s.autodrehen || (await p.locator('[data-aktion="drehen"]').getAttribute('aria-pressed')) !== 'true') fail('Autodrehen-Schalter geht nicht an');
const a0 = s.pos; await frames(10);
if (gleich((await st()).pos, a0)) fail('Autodrehen dreht nicht');
await ziehen([], 60, 0);
s = await st();
if (s.autodrehen || (await p.locator('[data-aktion="drehen"]').getAttribute('aria-pressed')) !== 'false') fail('Autodrehen bleibt nach dem Ziehen an');
const a1 = s.pos; await frames(30);
if (!gleich((await st()).pos, a1)) fail('Nach dem Loslassen dreht es von selbst weiter');
const txt = await p.locator('#btnDreh').innerText();
if (txt.trim() !== 'Frei drehen') fail('Beschriftung: ' + txt);
if (errs.length) fail('Seitenfehler: ' + errs.join(' | '));
console.log('smoke-drehen ok: frei über die Pole zur Rückseite, Bauteillagen unverändert, Mitte/Links drehen, Strg+Mitte schwenken, Cursorzoom, kein Nachlauf');
await b.close();
