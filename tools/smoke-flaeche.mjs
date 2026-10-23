// Headless-Test Fläche zu Fläche (wie ZW3D): Q = nur Flächen, Vorschau beim Überfahren, Klick-Messung mit Abstand senkrecht,
// Kopieren per Klick (voller Wert / gerundet), Strg+C, Hervorheben beim Überfahren der Ergebniszeile, Reihe mit Umschalt, Esc,
// Abmessungen (D) mit Neuausrichtung per Flächenklick, Ebene–Zylinder, Hinweis bei offenem Körper, Messen-Fenster verdeckt das Modell nicht.
// Aufruf: node tools/smoke-flaeche.mjs (vite preview, PORT; MARKE=ms3d prüft den Titel). KERN=native: Tauri simuliert, echter hasi-kern (HASI_KERN).
// SHOTDIR=… speichert Bildschirmfotos (Standard: keine).
import { chromium } from 'playwright-core';import fs from 'fs';import path from 'path';import os from 'os';import {execFileSync} from 'child_process';
const port=process.env.PORT||'4173',shot=process.env.SHOTDIR,nativ=process.env.KERN==='native',marke=process.env.MARKE||'hasi';if(shot)fs.mkdirSync(shot,{recursive:true});
const TEILE=['messteil','blech-bohrungen','schraeger-fuss','offene-schale'];
if(!nativ)for(const d of ['public','dist'])if(fs.existsSync(d))for(const t of TEILE)fs.copyFileSync(`testdaten/${t}.step`,`${d}/${t}.step`);
const fail=m=>{throw new Error(m)};const ok=m=>console.log('  ok  '+m);
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:1500,height:900}});const errs=[];
if(nativ){const exe=process.env.HASI_KERN||'kern/build/hasi-kern',tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hff-'));let nr=0;
  await ctx.exposeFunction('__kernPfad',async pfad=>{const d=path.join(tmp,'k'+(nr++));fs.mkdirSync(d);execFileSync(exe,[pfad,d],{stdio:'ignore'});
    return {bin:fs.readFileSync(path.join(d,'modell.bin')).toString('base64'),brep:fs.readFileSync(path.join(d,'modell.brep'),'latin1')}});
  await ctx.exposeFunction('__dateiLesen',async pfad=>fs.readFileSync(pfad).toString('base64'));
  await ctx.addInitScript(()=>{const ab=s=>{const t=atob(s);const u=new Uint8Array(t.length);for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u.buffer};let letzt=null;
    window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{if(cmd==='kern_verfuegbar')return true;if(cmd==='start_pfad')return null;
      if(cmd==='kern_laden_pfad'){letzt=await window.__kernPfad(args.pfad);return ab(letzt.bin)}if(cmd==='datei_lesen')return ab(await window.__dateiLesen(args.pfad));
      if(cmd==='kern_brep')return letzt.brep;throw new Error('unbekannt '+cmd)},transformCallback:()=>0}})}
await ctx.addInitScript(()=>{localStorage.removeItem('nurFlaechen')});
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://localhost:${port}/`);await p.waitForFunction(()=>window.__app&&(window.__loadUrl||window.__oeffnePfad));
if(marke==='ms3d'){const t=await p.title();if(t!=='MS3D')fail('Titel MS3D erwartet, ist '+t);ok('Marke MS3D')}
const bild=async n=>{if(shot){await p.waitForTimeout(250);await p.screenshot({path:path.join(shot,n+'.png')});console.log('  bild '+path.join(shot,n+'.png'))}};
async function laden(t){await p.evaluate(()=>{window.__lastLoad=null});
  if(nativ)await p.evaluate(f=>window.__oeffnePfad(f),path.resolve(`testdaten/${t}.step`));else await p.evaluate(u=>window.__loadUrl(u),`./${t}.step`);
  await p.waitForFunction(()=>window.__lastLoad&&window.__lastLoad.bodies>0,null,{timeout:90000});if(nativ){await p.evaluate(()=>window.__messBereit);const k=await p.evaluate(()=>window.__lastLoad.kern);if(k!=='nativ')fail('nativer Pfad nicht benutzt: '+k)}
  await p.waitForTimeout(900)}
// Bildschirmpunkt einer ebenen Fläche über die Trefferpunkte: Achse j hat den Wert v (± 0,01), Punkt möglichst mittig in der Fläche
async function flaechePunkt(j,v,ausser,vorn){return p.evaluate(([j,v,ausser,vorn])=>{const app=window.__app,U=app.data().uniq;const hits=[];
  for(let y=120;y<820;y+=8)for(let x=260;x<1180;x+=8){const s=app.pickAt(x,y);if(!s||s.k!=='face'||U[app.data().inst[s.inst].u].faces[s.id].type!=='eben')continue;if(Math.abs(s.p[j]-v)>0.01)continue;if(ausser&&s.id===ausser)continue;hits.push([x,y,s.id])}
  if(!hits.length)return null;const id=hits.map(h=>h[2]).sort((a,b)=>hits.filter(h=>h[2]===b).length-hits.filter(h=>h[2]===a).length)[0];const H=hits.filter(h=>h[2]===id);
  const cx=H.reduce((s,h)=>s+h[0],0)/H.length,cy=H.reduce((s,h)=>s+h[1],0)/H.length;H.sort((a,b)=>Math.hypot(a[0]-cx,a[1]-cy)-Math.hypot(b[0]-cx,b[1]-cy));if(vorn){H.sort((a,b)=>b[1]-a[1]);return H[Math.floor(H.length*0.15)]}return H[0]},[j,v,ausser??null,!!vorn])}
const mres=()=>p.textContent('#mresult');

// 1) Messteil: Standardmethode, Messen-Fenster seitlich angedockt (verdeckt das Modell nicht), Ebene–Zylinder über die Schnittstelle
await laden('messteil');
if(await p.inputValue('#methode')!=='auto')fail('Abstandsmethode „Automatisch (wie ZW3D)“ ist nicht Standard');ok('Standard: Automatisch (wie ZW3D)');
const verdeckt=await p.evaluate(()=>{const r=document.getElementById('messenPanel').getBoundingClientRect();if(!r.width)return 'Messen-Fenster nicht sichtbar';let n=0;
  for(let y=r.top+4;y<r.bottom;y+=10)for(let x=r.left+4;x<r.right;x+=10)if(window.__app.pickAt(x,y))n++;return n?`${n} Modelltreffer unter dem Messen-Fenster`:''});
if(verdeckt)fail(verdeckt);ok('Messen-Fenster angedockt, Modell frei');
{const r=await p.evaluate(async()=>{const app=window.__app,F=app.data().uniq[0].faces;app.clearSel();
  // x0-Fläche über die Bounding-Box-Lage: ebene Fläche ohne Achse, Zylinder Ø10 = Achse mit r 5 und voller Länge
  const z=F.findIndex(f=>f.ax&&Math.abs(f.ax.r-5)<1e-6&&Math.abs(f.ax.c[0]-25)<1e-6);await app.select({k:'face',id:z,inst:0});
  const ebenen=F.map((f,i)=>[f,i]).filter(([f])=>f.type==='eben').map(x=>x[1]);let best=null;
  for(const e of ebenen){app.clearSel();await app.select({k:'face',id:e,inst:0});const r=await app.select({k:'face',id:z,inst:0});const w=r.rows.find(x=>x[0]==='Abstand Fläche–Achse');if(w&&Math.abs(w[1]-25)<1e-6){best=r;break}}
  return best&&{h:best.rows.find(x=>x[3])[0],v:best.rows.find(x=>x[3])[1]}});
 if(!r||r.h!=='Abstand Fläche–Achse'||Math.abs(r.v-25)>1e-6)fail('Ebene–Zylinder: '+JSON.stringify(r));ok('Ebene–Zylinder: Abstand Fläche–Achse 25 als Hauptwert')}
await p.evaluate(()=>{window.__app.clearSel();window.__app.dims().length=0;window.__app.renderDims()});

// 2) Blech mit Bohrungen: Q, Klick auf Oberseite Steg (z=1), Vorschau über Oberkante Flansch (z=33), Klick → Abstand senkrecht 32 (früher 32,062)
await laden('blech-bohrungen');
await p.mouse.move(700,450);await p.keyboard.press('q');if(!await p.isChecked('#nurFlaechen'))fail('Q schaltet „Nur Flächen“ nicht ein');
const nurF=await p.evaluate(()=>{let n=0,k=new Set();for(let y=150;y<800;y+=12)for(let x=300;x<1150;x+=12){const s=window.__app.pickAt(x,y);if(s){n++;k.add(s.k)}}return [n,[...k]]});
if(!nurF[0]||nurF[1].join()!=='face')fail('Nur Flächen: gefangen '+nurF[1]);ok('Q: nur Flächen gefangen ('+nurF[0]+' Treffer)');
const f1=await flaechePunkt(2,1,null,true),f2=await flaechePunkt(2,33);if(!f1||!f2)fail('Flächen z=1 / z=33 nicht im Bild '+JSON.stringify([f1,f2]));
await p.mouse.move(f1[0],f1[1]);await p.waitForTimeout(120);await p.mouse.down();await p.mouse.up();await p.waitForFunction(()=>window.__lastMeasure!==undefined);await p.waitForTimeout(200);
await p.mouse.move(f2[0]-3,f2[1]-3);await p.mouse.move(f2[0],f2[1],{steps:3});
await p.waitForFunction(()=>/Abstand senkrecht 32,000 mm/.test(document.getElementById('snaptip').textContent),null,{timeout:10000}).catch(async()=>fail('Vorschau fehlt: '+await p.textContent('#snaptip')));
ok('Vorschau am Cursor: '+await p.textContent('#snaptip'));await bild(`${marke}-vorschau-flaeche-zu-flaeche`);
await p.mouse.down();await p.mouse.up();await p.waitForFunction(()=>window.__app.dims().length>=1,null,{timeout:10000});await p.waitForTimeout(300);
let t=await mres();if(!/Abstand senkrecht32,000 mm/.test(t))fail('Abstand senkrecht fehlt: '+t.slice(0,300));
const big=await p.$$eval('#mresult div.big',d=>d.map(x=>x.textContent));if(big[0]!=='Abstand senkrecht'||big[1]!=='32,000 mm')fail('Hauptwert: '+big);
let dims=await p.evaluate(()=>window.__dims);if(!dims[0].text.includes('Abstand senkrecht: 32,000 mm'))fail('Bemaßung: '+dims[0].text.split('\n')[1]);
ok('Klick: Abstand senkrecht 32,000 mm als Hauptwert und Bemaßung');
for(const [n,v] of [['ΔX','0,000 mm'],['ΔY','0,000 mm'],['ΔZ','32,000 mm']])if(!t.includes(n+v))fail(`${n} folgt nicht dem Lot: `+t);ok('ΔX/ΔY/ΔZ folgen dem Lot (0 / 0 / 32)');
await p.mouse.move(1400,880);await p.waitForTimeout(150);await bild(`${marke}-flaeche-zu-flaeche-hoehe`);
// Überfahren der Ergebniszeile hebt die Strecke hervor, Klick kopiert (voll / gerundet), Strg+C = Hauptwert
const wert=await p.$('#mresult div.big.wert');await wert.hover();await p.waitForTimeout(150);const hi=await p.evaluate(()=>window.__zeileHi);
if(!hi||hi.name!=='Abstand senkrecht'||Math.abs(Math.hypot(...hi.linie[1].map((x,i)=>x-hi.linie[0][i]))-32)>1e-6)fail('Hervorheben: '+JSON.stringify(hi));ok('Ergebniszeile überfahren: Strecke im 3D hervorgehoben');
await bild(`${marke}-zeile-hervorheben`);
await wert.click();let cp=await p.evaluate(()=>window.__lastCopy);if(cp!=='32')fail('1. Klick: voller Wert erwartet, ist '+cp);
await wert.click();cp=await p.evaluate(()=>window.__lastCopy);if(cp!=='32,000')fail('2. Klick: gerundet erwartet, ist '+cp);ok('Kopieren: 1. Klick „32“, 2. Klick „32,000“');
await p.evaluate(()=>{window.__lastCopy=null;document.activeElement?.blur()});await p.mouse.move(700,450);await p.keyboard.press('Control+c');cp=await p.evaluate(()=>window.__lastCopy);if(cp!=='32')fail('Strg+C: '+cp);ok('Strg+C kopiert den Hauptwert');
// Reihe: Umschalt+Klick auf die Stirnfläche x=54 misst gegen die Bezugsfläche z=1 weiter
const f3=await flaechePunkt(0,54);if(!f3)fail('Fläche x=54 nicht im Bild');
await p.mouse.move(f3[0],f3[1]);await p.waitForTimeout(150);await p.keyboard.down('Shift');await p.mouse.down();await p.mouse.up();await p.keyboard.up('Shift');
await p.waitForFunction(()=>window.__app.dims().length>=2,null,{timeout:10000}).catch(()=>fail('Reihe: zweite Bemaßung fehlt'));
const rs=await p.evaluate(()=>window.__app.dims().map(d=>d.sels.map(s=>s.id)));if(rs[1][0]!==rs[0][0])fail('Reihe misst nicht gegen die Bezugsfläche: '+JSON.stringify(rs));ok('Umschalt+Klick: Reihe gegen die Bezugsfläche');
await p.keyboard.press('Escape');await p.waitForTimeout(150);if((await mres()).trim()||(await p.evaluate(()=>window.__app.sels().length)))fail('Esc löscht die Messung nicht');ok('Esc löscht die Messung (Bemaßungen bleiben: '+(await p.evaluate(()=>window.__app.dims().length))+')');
// Abmessungen (D)
await p.keyboard.press('d');await p.waitForFunction(()=>window.__abm&&window.__abm.ok,null,{timeout:15000});await p.waitForTimeout(200);
t=await p.textContent('#abminfo');if(!t.includes('60,000 × 54,000 × 34,000 mm'))fail('Abmessungen Blech: '+t);if(await p.evaluate(()=>window.__app.abmDims())!==3)fail('3 Maße am Quader erwartet');ok('D: Abmessungen 60 × 54 × 34');
await p.keyboard.press('Escape');await p.waitForTimeout(100);if(await p.evaluate(()=>window.__app.abm()))fail('Esc beendet Abmessungen nicht');
await p.keyboard.press('q');if(await p.isChecked('#nurFlaechen'))fail('Q schaltet nicht aus');

// 3) Schräger Fuß: Abmessungen an der Grundfläche 100 × 30 × 380, Klick auf die schräge Wand richtet neu aus
await laden('schraeger-fuss');await p.mouse.move(640,420);for(let i=0;i<4;i++){await p.mouse.wheel(0,250);await p.waitForTimeout(120)}await p.waitForTimeout(500);// 380 mm hohes Teil: etwas herauszoomen fürs Bild
await p.click('#abmKnopf');await p.waitForFunction(()=>window.__abm&&window.__abm.ok,null,{timeout:15000});await p.waitForTimeout(200);
t=await p.textContent('#abminfo');if(!t.includes('100,000 × 30,000 × 380,000 mm')||!t.includes('Grundfläche'))fail('Abmessungen schräger Fuß: '+t);ok('Abmessungen schräger Fuß 100 × 30 × 380 (Grundfläche)');
await p.mouse.move(1400,880);await bild(`${marke}-abmessungen-schraeger-fuss`);
const schraeg=await p.evaluate(()=>{const app=window.__app,F=app.data().uniq[0].faces;for(let y=120;y<820;y+=8)for(let x=260;x<1180;x+=8){const s=app.pickAt(x,y,{nurFlaeche:true});if(!s)continue;
  // schräge Wand: Punkt mit 0 < z < 380, nicht auf den Seiten y=0 / y=30
  if(s.p[2]>50&&s.p[2]<330&&s.p[1]>1&&s.p[1]<29)return [x,y]}return null});if(!schraeg)fail('schräge Wand nicht im Bild');
await p.mouse.move(...schraeg);await p.mouse.down();await p.mouse.up();await p.waitForFunction(()=>window.__abm?.quelle==='gewählte Fläche',null,{timeout:10000});await p.waitForTimeout(200);
t=await p.textContent('#abminfo');if(!t.includes('390,946 × 30,000 × 39,511 mm'))fail('Neu ausgerichtet: '+t);ok('Klick auf schräge Wand: 390,946 × 30 × 39,511');
await p.mouse.move(1400,880);await bild(`${marke}-abmessungen-neu-ausgerichtet`);
await p.click('#abmGrund');await p.waitForFunction(()=>window.__abm?.quelle==='Grundfläche');await p.keyboard.press('Escape');

// 4) Offener Körper: Hinweis „Volumen nicht verlässlich“
await laden('offene-schale');await p.waitForFunction(()=>/Volumen nicht verlässlich/.test(document.getElementById('massinfo').textContent),null,{timeout:15000}).catch(()=>fail('Hinweis offener Körper fehlt'));
ok('Offener Körper: '+(await p.textContent('#massinfo')).match(/Körper nicht geschlossen[^V]*Volumen nicht verlässlich/)[0]);
await p.evaluate(()=>document.getElementById('massinfo').scrollIntoView({block:'center'}));await bild(`${marke}-offener-koerper`);
await laden('messteil');if(await p.evaluate(()=>/nicht verlässlich/.test(document.getElementById('massinfo').textContent)))fail('Hinweis bei geschlossenem Körper');ok('Geschlossener Körper: kein Hinweis');

// 5) Alles deutsch: keine englischen Reste in den neuen Texten
const txt=await p.evaluate(()=>document.getElementById('messenPanel').innerText);for(const w of [' copy',' height',' width','Betrachter','Bounding Box '])if(txt.includes(w))fail('Text nicht deutsch: '+w);
console.log('fehler',JSON.stringify(errs));await b.close();if(errs.length)process.exit(1);console.log(`OK: Fläche zu Fläche in der Oberfläche (${marke}, ${nativ?'nativer Kern':'WASM'})`);
