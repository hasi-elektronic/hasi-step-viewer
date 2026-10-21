// Headless-Test: Verschieben-Triade in fester Bildschirmgröße (unabhängig von Zoom, Projektion, Teilegröße und Einheit)
// und Esc im Messen: löscht Auswahl und Ergebnis, Bemaßungen bleiben. Läuft für beide Ausgaben (PORT=4173 Hasi 3D, 4174 MS3D).
import { chromium } from 'playwright-core';import fs from 'fs';import path from 'path';
const TEILE=['messbaugruppe.step','faz1-messteil.step','testblech-cm.step','umschlag.step','schraeger-fuss.step'];
for(const d of ['public','dist'])if(fs.existsSync(d))for(const t of TEILE)fs.copyFileSync('testdaten/'+t,d+'/'+t);
const URL=process.env.URL||`http://localhost:${process.env.PORT||'4173'}/`;const SHOTS=process.env.SHOTS||null;if(SHOTS)fs.mkdirSync(SHOTS,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const fail=m=>{throw new Error(m)};const A=(f,a)=>p.evaluate(f,a);
const laden=async f=>{await A(f=>window.__loadUrl('./'+f),f);await p.waitForFunction(f=>window.__lastLoad?.name===f&&window.__app.data(),f,{timeout:60000});await p.waitForTimeout(300)};
const SOLL=70,TOL=2;
const triade=async name=>{await A(async name=>{const a=window.__app;const n=a.nodes().find(x=>x.name===name)||a.nodes()[0];a.selectNode(n);await a.act('move',n);a.fitIso()},name);await p.waitForTimeout(500)};
const px=()=>A(()=>window.__app.triadePixel());const pruef=async was=>{const r=await px();if(r==null||Math.abs(r-SOLL)>TOL)fail(`Triade ${was}: ${r} px statt ${SOLL}`);return +r.toFixed(1)};
await p.goto(URL);
// 1) Triade: gleiche Pixelgröße bei verschiedenen Teilen, Zoomstufen und Projektion
const werte={};
await laden('messbaugruppe.step');await triade('Boden');werte.baugruppe=await pruef('Baugruppe');
const cv=await (await p.$('#buehne')).boundingBox();await p.mouse.move(cv.x+cv.width/2,cv.y+cv.height/2);
await p.mouse.wheel(0,-600);await p.waitForTimeout(400);werte.zoomNah=await pruef('nah gezoomt');
await p.mouse.wheel(0,1500);await p.waitForTimeout(400);werte.zoomFern=await pruef('fern gezoomt');
await A(()=>{const s=document.getElementById('projektionWahl');if(s){s.value='orthogonal';s.dispatchEvent(new Event('change'))}});await p.waitForTimeout(400);werte.orthogonal=await pruef('orthogonal');
await A(()=>{const s=document.getElementById('projektionWahl');if(s){s.value='perspektive';s.dispatchEvent(new Event('change'))}});
// Griff gut treffbar: X-Pfeil in der Mitte greifen und 60 px ziehen → Teil bewegt sich
await A(()=>window.__app.fitIso());await p.waitForTimeout(400);
const vor=await A(()=>window.__app.matrizen());
const [ax,ay]=await A(()=>{const a=window.__app,q=a.triadePos(),s=a.triadeSkala();return a.screenOf([q[0]+.55*s,q[1],q[2]])});
const [bx,by]=await A(()=>{const a=window.__app,q=a.triadePos(),s=a.triadeSkala();return a.screenOf([q[0]+.95*s,q[1],q[2]])});
const l=Math.hypot(bx-ax,by-ay);await p.mouse.move(ax+2,ay+2);await p.mouse.down();await p.mouse.move(ax+(bx-ax)/l*60,ay+(by-ay)/l*60,{steps:8});await p.mouse.up();await p.waitForTimeout(400);
const nach=await A(()=>window.__app.matrizen());if(JSON.stringify(vor)===JSON.stringify(nach))fail('X-Pfeil der Triade nicht greifbar (2 px neben der Mitte)');
await A(()=>window.__app.rueckgaengig());await p.waitForTimeout(300);
if(SHOTS){await A(()=>window.__app.fitIso());await p.waitForTimeout(400);await p.screenshot({path:path.join(SHOTS,'triade-nachher.png')})}
await laden('faz1-messteil.step');await triade('faz1-messteil');werte.einzelteil=await pruef('Einzelteil 100 mm');
await laden('testblech-cm.step');await triade('');werte.zentimeter=await pruef('Datei in cm');
console.log('triade ok (Ringradius px):',JSON.stringify(werte));
// 2) Esc im Messen
await laden('faz1-messteil.step');
const ebenen=await A(()=>window.__app.data().uniq[0].faces.map((f,i)=>f.type==='eben'?i:-1).filter(i=>i>=0));
const zweiFlaechen=async()=>{await A(async e=>{const a=window.__app;a.tab('messen');a.clearSel();await a.select({k:'face',id:e[0],inst:0});await a.select({k:'face',id:e[1],inst:0},true)},ebenen);
  const s=await A(()=>({n:window.__app.sels().length,txt:document.getElementById('mresult').innerText}));if(s.n!==2||!/Abstand/.test(s.txt))fail('Messung zweier Flächen fehlt: '+JSON.stringify(s))};
const zustand=()=>A(()=>({n:window.__app.sels().length,txt:document.getElementById('mresult').innerText.trim(),dims:window.__app.dims().length,messen:!!document.querySelector('.tab.on[data-tab="messen"],.tab.aktiv[data-tab="messen"],.tab.active[data-tab="messen"]')||!document.getElementById('messenPanel')?.hidden}));
// eine Bemaßung behalten
await zweiFlaechen();await A(()=>window.__app.keepDim('auto'));const dims0=(await zustand()).dims;if(!dims0)fail('Bemaßung nicht angelegt');
// a) Fokus in der 3D-Ansicht
await zweiFlaechen();await p.mouse.click(cv.x+cv.width-40,cv.y+40,{button:'middle'});await A(()=>document.getElementById('buehne')?.focus());await p.keyboard.press('Escape');
let z=await zustand();if(z.n||z.txt)fail('Esc (3D-Ansicht) hat die Messung nicht gelöscht: '+JSON.stringify(z));if(z.dims!==dims0)fail('Esc hat Bemaßungen gelöscht');
// b) Fokus im Messen-Fenster (Auswahlliste Abstandsmethode)
await zweiFlaechen();await p.focus('#methode');await p.keyboard.press('Escape');z=await zustand();if(z.n||z.txt)fail('Esc (Messen-Fenster) hat die Messung nicht gelöscht');if(z.dims!==dims0)fail('Esc hat Bemaßungen gelöscht (b)');
// c) beim Tippen in einem Textfeld bleibt die Messung
await zweiFlaechen();await p.focus('#treeSearch');await p.keyboard.press('Escape');z=await zustand();if(z.n!==2)fail('Esc im Textfeld darf die Messung nicht löschen');
await A(()=>document.activeElement.blur());
// d) sofort weiter messen
await zweiFlaechen();await p.keyboard.press('Escape');await zweiFlaechen();z=await zustand();if(z.n!==2)fail('nach Esc nicht weiter messbar');
// e) Klick ins Leere hebt die Auswahl auf, Bemaßungen bleiben
await p.mouse.click(cv.x+cv.width-60,cv.y+cv.height-60);await p.waitForTimeout(300);z=await zustand();if(z.n||z.txt)fail('Klick ins Leere hebt die Auswahl nicht auf');if(z.dims!==dims0)fail('Klick ins Leere löscht Bemaßungen');
// f) zweites Esc ohne Mess-Auswahl hebt die Bauteilauswahl auf (Triade verschwindet)
await triade('faz1-messteil');if(!await A(()=>window.__app.gizmo()))fail('Triade fehlt');await p.keyboard.press('Escape');
if(await A(()=>window.__app.gizmo()))fail('Esc ohne Messung: Bauteilauswahl/Triade bleibt');if(await A(()=>window.__app.dims().length)!==dims0)fail('Bemaßungen weg (f)');
console.log('esc ok: Messung gelöscht (3D-Ansicht, Messen-Fenster), Textfeld unberührt, Klick ins Leere, Bemaßungen bleiben:',dims0);
// 3) Höhe messen am schrägen Fuß: Maßrichtung, Ergebniszeilen, Höhenbemaßung, Linear beim Ziehen (BEMLINEAR) und Sperre mit H
await laden('schraeger-fuss.step');await A(()=>window.__app.ansicht('vorne'));await p.waitForFunction(()=>window.__app.animFertig(),null,{timeout:5000});await p.waitForTimeout(300);
const hoehe=await A(async()=>{const a=window.__app,U=a.data().uniq[0];const vi=q=>U.verts.findIndex(v=>v.every((x,j)=>Math.abs(x-q[j])<1e-6));const wert=n=>a.letzteMessung().r.rows.find(x=>x[0]===n)?.[1];
  const r=document.getElementById('massRichtung');const zwei=async()=>{a.clearSel();await a.select({k:'vertex',id:vi([60,0,380]),inst:0});await a.select({k:'vertex',id:vi([0,0,0]),inst:0},true)};
  const out={optionen:[...r.options].map(o=>o.value)};r.value='ausgerichtet';r.dispatchEvent(new Event('change'));await zwei();
  out.abstand=wert('Abstand');out.hoehe=wert('Höhe (vertikal)');out.waagerecht=wert('Horizontal (waagerecht)');out.text=document.getElementById('mresult').innerText;
  r.value='vertikal';r.dispatchEvent(new Event('change'));await new Promise(q=>setTimeout(q,200));out.wahl=a.letzteMessung().r.wahl;
  const n0=a.dims().length;a.keepDim('auto');const d=a.dims().at(-1);out.dimTyp=d.typ;out.dimWert=d.wert;
  r.value='ausgerichtet';r.dispatchEvent(new Event('change'));await zwei();a.keepDim('auto');const l=a.dims().at(-1);out.linTyp=l.typ;out.linWert0=l.wert;out.linNo=l.no;a.renderDims();return out});
if(Math.abs(hoehe.abstand-Math.hypot(60,380))>1e-4||Math.abs(hoehe.hoehe-380)>1e-4||Math.abs(hoehe.waagerecht-60)>1e-4)fail('Höhe/Abstand: '+JSON.stringify(hoehe));
if(!/Höhe \(vertikal\)/.test(hoehe.text))fail('„Höhe (vertikal)“ fehlt im Ergebnis');if(hoehe.wahl!=='Höhe (vertikal)')fail('Maßrichtung vertikal nicht hervorgehoben: '+hoehe.wahl);
if(hoehe.dimTyp!=='hoehe'||Math.abs(hoehe.dimWert-380)>1e-4)fail('Höhenbemaßung: '+hoehe.dimTyp+' '+hoehe.dimWert);if(hoehe.linTyp!=='linear')fail('Automatisch bei zwei Punkten soll „linear“ sein');
for(const o of ['ausgerichtet','vertikal','horizontal','x','y','z','ansicht'])if(!hoehe.optionen.includes(o))fail('Maßrichtung fehlt: '+o);
// Maßtext der linearen Bemaßung greifen und seitlich ziehen → Höhe; dann H drücken → horizontal gesperrt, Ziehen ändert nichts mehr
await p.waitForTimeout(300);const lab=async()=>{const r=await A(no=>{const b=document.getElementById('buehne').getBoundingClientRect();const h=window.__app.dimLabels().find(x=>x[1]===no);return h?[h[0][0]+b.left,h[0][1]+b.top]:null},hoehe.linNo);if(!r)fail('Maßtext nicht gefunden');return r};
let [lx,ly]=await lab();await p.mouse.move(lx,ly);await p.mouse.down();await p.mouse.move(lx+180,ly+10,{steps:10});await p.mouse.up();await p.waitForTimeout(300);
let lin=await A(no=>window.__app.dims().find(d=>d.no===no),hoehe.linNo);if(lin.linArt!=='vertikal'||Math.abs(lin.wert-380)>1e-4)fail('Linear seitlich gezogen: '+lin.linArt+' '+lin.wert+' off '+JSON.stringify(lin.off)+' lab '+[lx,ly]+' alle '+JSON.stringify(await A(()=>window.__app.dimLabels())));
await p.keyboard.press('h');lin=await A(no=>window.__app.dims().find(d=>d.no===no),hoehe.linNo);if(lin.sperre!=='horizontal'||Math.abs(lin.wert-60)>1e-4)fail('Sperre H: '+JSON.stringify([lin.sperre,lin.wert]));
[lx,ly]=await lab();await p.mouse.move(lx,ly);await p.mouse.down();await p.mouse.move(lx+200,ly,{steps:10});await p.mouse.up();await p.waitForTimeout(300);
lin=await A(no=>window.__app.dims().find(d=>d.no===no),hoehe.linNo);if(lin.linArt!=='horizontal'||Math.abs(lin.wert-60)>1e-4)fail('gesperrt, aber Richtung gewechselt: '+lin.linArt);
console.log('hoehe ok: wahre Länge',hoehe.abstand.toFixed(4),'Höhe',hoehe.hoehe,'waagerecht',hoehe.waagerecht,'| Linear seitlich → Höhe 380, H → 60 gesperrt');
if(SHOTS){await A(()=>document.activeElement?.blur());await p.mouse.move(cv.x+cv.width-80,cv.y+cv.height-80);await p.mouse.wheel(0,500);await p.waitForTimeout(300);await p.screenshot({path:path.join(SHOTS,'hoehe-schraeger-fuss.png')})}
console.log('fehler',JSON.stringify(errs));await b.close();if(errs.length)process.exit(1);console.log('OK: Triade und Esc');
await import('./smoke-faz2.mjs');
