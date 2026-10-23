// Headless-Test (Hamdi 22.10.): jede Bemaßung sagt, WAS sie misst; zwei Punkte an einer schrägen Seite → Höhe (Z) als Standard in der Ansicht Vorne,
// schräger Abstand mit eigenem Etikett; Richtung Ausgerichtet/Horizontal/Vertikal umschaltbar; Gesamthöhe (H) mit Höhe Fläche–Fläche, Länge, Breite;
// kein doppelter Hover-Hinweis. Nur synthetisches Teil testdaten/bock.step (tools/make-bock-teil.py). SHOTDIR=… speichert Bildschirmfotos.
import { chromium } from 'playwright-core';import fs from 'fs';
const port=process.env.PORT||'4173',dir=process.env.SHOTDIR;if(dir)fs.mkdirSync(dir,{recursive:true});const NAME='bock-teil.step';
const fail=m=>{throw new Error(m)};const ok=m=>console.log('  ok  '+m);
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/'+NAME,r=>r.fulfill({status:200,body:fs.readFileSync('testdaten/bock.step'),headers:{'content-type':'application/octet-stream'}}));
await p.goto(`http://localhost:${port}/`);await p.evaluate(()=>{localStorage.clear()});await p.reload();await p.waitForFunction(()=>window.__app&&window.__loadUrl);
const A=(f,a)=>p.evaluate(f,a);const bild=async n=>{if(dir){await p.waitForTimeout(300);await p.locator('#view').screenshot({path:`${dir}/${n}.png`})}};
await A(n=>{return window.__loadUrl('./'+n)},NAME);await p.waitForFunction(()=>window.__lastLoad&&window.__lastLoad.bodies>0,null,{timeout:180000});await p.waitForTimeout(600);
if(await p.locator('#btnMass').count())fail('Bemaßung-Knopf in der Fußleiste soll entfallen');
await p.locator('#btnMessen').click();await p.waitForTimeout(500);
for(const t of ['Auto','Ausgerichtet','Horizontal','Vertikal','Gesamthöhe (H)'])if(!(await p.locator('#messenPanel').innerText()).includes(t))fail('Messen ohne „'+t+'“');
ok('Messen: Richtung Auto/Ausgerichtet/Horizontal/Vertikal und Gesamthöhe (H); kein Bemaßung-Knopf');
// 1) Zwei Ecken an der schrägen Seite (unten außen → oben), Ansicht Vorne: Standard = Höhe (Z), schräger Abstand eigenes Etikett
const ecken=await A(()=>{const D=window.__app.data(),U=D.uniq[D.inst[0].u];const v=U.verts.map((q,i)=>[i,q]);const y0=Math.min(...v.map(x=>x[1][1]));
  const u=v.find(x=>Math.abs(x[1][0])<1e-6&&Math.abs(x[1][2])<1e-6&&Math.abs(x[1][1]-y0)<1e-6),o=v.find(x=>Math.abs(x[1][0]-20)<1e-6&&Math.abs(x[1][2]-60)<1e-6&&Math.abs(x[1][1]-y0)<1e-6);return u&&o?[u,o]:null});
if(!ecken)fail('Ecken der schrägen Seite nicht gefunden');
await A(async e=>{const a=window.__app;a.ansicht('vorne');a.clearSel();await a.select({k:'vertex',id:e[0][0],inst:0,p:e[0][1]});await a.select({k:'vertex',id:e[1][0],inst:0,p:e[1][1]})},ecken);await p.waitForTimeout(400);
{const d=await A(()=>window.__app.dimTexte()),l=await A(()=>window.__app.messLabels()),t=await A(()=>window.__app.ergebnis());
  if(d.length!==1||d[0].linArt!=='vertikal'||d[0].text!=='Höhe (Z) 60,000')fail('Standard soll Höhe (Z) 60,000 sein: '+JSON.stringify(d));
  if(!l.some(x=>x.zeilen[0]==='Abstand (schräg): 63,246 mm'))fail('schräger Abstand ohne eigenes Etikett: '+JSON.stringify(l));
  if(!l.some(x=>/^ΔZ: 60,000 mm$/.test(x.zeilen[0]))||!l.some(x=>/^ΔX: 20,000 mm$/.test(x.zeilen[0])))fail('ΔX/ΔZ-Linien ohne Etikett: '+JSON.stringify(l));
  if(!/^Höhe \(ΔZ\): 60,000 mm/.test(t))fail('Ergebnis soll mit „Höhe (ΔZ)“ beginnen: '+t);
  for(const s of ['Abstand: 63,246 mm','Delta X: 20,000 mm','Delta Y: 0,000 mm','Delta Z: 60,000 mm'])if(!t.includes(s))fail('Ergebnis ohne „'+s+'“: '+t);
  ok('Vorne, zwei Ecken der schrägen Seite: Bemaßung „'+d[0].text+'“, Etikett „Abstand (schräg): 63,246 mm“, Ergebnis: '+t.split('\n').join(' | '));await bild('schraeg-und-hoehe')}
// 2) Umschalten wie CAD
{await A(()=>window.__app.linWahl('ausgerichtet'));let d=await A(()=>window.__app.dimTexte());if(d[0].text!=='Abstand (schräg) 63,246')fail('Ausgerichtet: '+JSON.stringify(d));
  await A(()=>window.__app.linWahl('horizontal'));d=await A(()=>window.__app.dimTexte());if(d[0].text!=='Horizontal (X) 20,000')fail('Horizontal: '+JSON.stringify(d));
  await A(()=>window.__app.linWahl('vertikal'));d=await A(()=>window.__app.dimTexte());if(d[0].text!=='Höhe (Z) 60,000')fail('Vertikal: '+JSON.stringify(d));
  await A(()=>window.__app.linWahl('ausgerichtet'));await bild('schraeg-ausgerichtet');await A(()=>window.__app.linWahl('auto'));d=await A(()=>window.__app.dimTexte());if(d[0].text!=='Höhe (Z) 60,000')fail('Auto: '+JSON.stringify(d));
  ok('Richtung: Ausgerichtet → Abstand (schräg) 63,246, Horizontal → Horizontal (X) 20,000, Vertikal/Auto → Höhe (Z) 60,000')}
// 3) Hover: nur der Hinweis am Cursor, kein zweiter unten rechts
{const v=await p.locator('#view').boundingBox();let gesehen=false;for(let i=0;i<12&&!gesehen;i++){await p.mouse.move(v.x+v.width*(0.35+i*0.025),v.y+v.height*0.55);await p.waitForTimeout(120);gesehen=await p.isVisible('#snaptip')}
  if(!gesehen)fail('kein Hover-Hinweis am Cursor');const chip=await A(()=>window.__app.hoverChip());if(chip)fail('Hover-Hinweis doppelt (unten rechts): '+chip);ok('Hover: nur am Cursor („'+await p.textContent('#snaptip')+'“)')}
// 4) Gesamthöhe mit H
await p.keyboard.press('Escape');await A(()=>{window.__app.dims().length&&0;document.activeElement?.blur()});await p.mouse.move(5,5);await p.keyboard.press('h');await p.waitForFunction(()=>window.__app.abmDims()>0,null,{timeout:20000}).catch(()=>fail('H zeigt keine Gesamthöhe'));
{const t=await A(()=>window.__app.abmTexte()),e=await A(()=>window.__app.ergebnis());
  for(const s of ['Gesamthöhe (Hüllquader) 66,000','Höhe Fläche–Fläche 60,000','Länge 120,000','Breite 50,000'])if(!t.includes(s))fail('Gesamthöhe-Maß fehlt: '+s+' in '+JSON.stringify(t));
  for(const s of ['Gesamthöhe (Hüllquader): 66,000 mm','Höhe Fläche–Fläche: 60,000 mm','Länge: 120,000 mm','Breite: 50,000 mm'])if(!e.includes(s))fail('Ergebnis ohne „'+s+'“: '+e);
  if(!/^Gesamthöhe/.test(e))fail('Gesamthöhe nicht zuerst: '+e);ok('H: '+t.join(' · '));await bild('gesamthoehe')}
await p.keyboard.press('h');await p.waitForTimeout(200);if(await A(()=>window.__app.abmDims()))fail('H beendet die Gesamthöhe nicht');
// 5) Körper wählen (Baum → Messen) zeigt die Gesamthöhe ebenfalls
await A(async()=>{const a=window.__app;const n=a.nodes().find(x=>x.all&&x.all.length===1)||a.nodes()[0];await a.act('measure',n)});await p.waitForFunction(()=>window.__app.abmDims()>0,null,{timeout:20000}).catch(()=>fail('Körper gewählt: keine Gesamthöhe'));
if(!(await A(()=>window.__app.ergebnis())).startsWith('Gesamthöhe (Hüllquader): 66,000 mm'))fail('Körper: Ergebnis '+await A(()=>window.__app.ergebnis()));ok('Körper gewählt: Gesamthöhe 66,000');
if(errs.length)fail('Seitenfehler: '+errs.join(' | '));await b.close();console.log('smoke-hoehe-beschriftung ok');
