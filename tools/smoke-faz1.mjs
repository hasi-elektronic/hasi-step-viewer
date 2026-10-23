// Headless-Test Faz 1 in der Oberfläche (nur selbst erzeugte Teile aus tools/make-faz1-teile.py):
// Abstandsmethode, Projektion, ΔX/ΔY/ΔZ-Linien, Kegel/Kugel, ausgeblendete Bauteile, Ketten-/Basislinien-/Fasenmaß,
// Bemaßungen speichern/laden, 180°-Umschlag ohne NaN, feste Fläche per Klick, DXF mit Kreisen. Bilder: $SHOTS (Standard /tmp/faz1).
import { chromium } from 'playwright-core';import fs from 'fs';import path from 'path';
const TEILE=['faz1-messteil.step','messbaugruppe.step','blech-bohrungen.step','umschlag.step'];
for(const d of ['public','dist'])if(fs.existsSync(d))for(const t of TEILE)fs.copyFileSync('testdaten/'+t,d+'/'+t);
const SHOTS=process.env.SHOTS||'/tmp/faz1';fs.mkdirSync(SHOTS,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const fail=m=>{throw new Error(m)};const A=(f,a)=>p.evaluate(f,a);const nah=(a,c,t=1e-4)=>Math.abs(a-c)<t;
const laden=async f=>{await A(f=>window.__loadUrl('./'+f),f);await p.waitForFunction(f=>window.__lastLoad?.name===f&&window.__app.data(),f,{timeout:60000});await p.waitForTimeout(300)};
const bild=async n=>{await p.waitForTimeout(400);await p.screenshot({path:path.join(SHOTS,n)});console.log('  Bild',path.join(SHOTS,n))};
await p.goto(process.env.URL||'http://localhost:4173/');
// 1) Messteil: Senkung ↔ Kugelmulde, alle Methoden
await laden('faz1-messteil.step');
const m=await A(async()=>{const app=window.__app,U=app.data().uniq[0],out={};const ei=f=>U.edges.findIndex(f);
  const kS=ei(e=>e.r&&Math.abs(e.r-8)<1e-6&&Math.abs(e.c[2]-20)<1e-6),kK=ei(e=>e.r&&Math.abs(e.r-6)<1e-6&&Math.abs(e.c[2]-20)<1e-6);
  const wert=(r,n)=>r.rows.find(x=>x[0]===n)?.[1];
  for(const mt of ['min','rand-mitte','mitte-rand','mitte','max']){document.getElementById('methode').value=mt;document.getElementById('methode').dispatchEvent(new Event('change'));
    app.clearSel();await app.select({k:'edge',id:kS,inst:0});await app.select({k:'edge',id:kK,inst:0},true);const r=app.letzteMessung().r;const [a,c]=r.gfx[0];
    out[mt]={linie:Math.hypot(c[0]-a[0],c[1]-a[1],c[2]-a[2]),wahl:r.wahl,delta:app.deltaLinien(),text:document.getElementById('mresult').innerText}}
  document.getElementById('projektion').value='xy';document.getElementById('projektion').dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,300));
  out.proj=wert(app.letzteMessung().r,'Projiziert auf Ebene XY');
  const kf=U.faces.findIndex(f=>f.type==='kegelig');app.clearSel();await app.select({k:'face',id:kf,inst:0});out.kegel=[wert(app.letzteMessung().r,'Kegelwinkel (Senkwinkel)'),wert(app.letzteMessung().r,'Durchmesser groß Ø'),wert(app.letzteMessung().r,'Kegelhöhe')];
  const kg=U.faces.findIndex(f=>f.type==='kugelig');app.clearSel();await app.select({k:'face',id:kg,inst:0});out.kugel=wert(app.letzteMessung().r,'Kugelradius R');
  return out});
for(const [mt,soll] of [['min',21],['rand-mitte',27],['mitte-rand',29],['mitte',35],['max',49]]){if(!nah(m[mt].linie,soll))fail(`Methode ${mt}: ${m[mt].linie} ≠ ${soll}`);
  if(!m[mt].delta.length)fail('ΔX/ΔY/ΔZ-Linien fehlen ('+mt+')');if(/NaN|undefined|Infinity/.test(m[mt].text))fail('Anzeige: '+m[mt].text)}
if(!nah(m.proj,49))fail('Projektion XY (Methode max., Linie liegt in z = 20) '+m.proj);if(!nah(m.kegel[0],90)||!nah(m.kegel[1],16)||!nah(m.kegel[2],4))fail('Kegel '+m.kegel);if(!nah(m.kugel,10))fail('Kugel '+m.kugel);
console.log('methoden ok',Object.fromEntries(Object.entries(m).filter(([k])=>k.length<11&&m[k].linie).map(([k,v])=>[k,+v.linie.toFixed(4)])),'kegel',m.kegel,'kugel',m.kugel);
// Bild: Mitte–Mitte mit ΔX/ΔY/ΔZ
await A(async()=>{const app=window.__app,U=app.data().uniq[0];document.getElementById('projektion').value='keine';const me=document.getElementById('methode');me.value='mitte';me.dispatchEvent(new Event('change'));
  const ei=f=>U.edges.findIndex(f);app.clearSel();await app.select({k:'edge',id:ei(e=>e.r&&Math.abs(e.r-8)<1e-6&&Math.abs(e.c[2]-20)<1e-6),inst:0});
  await app.select({k:'edge',id:ei(e=>e.r&&Math.abs(e.r-6)<1e-6&&Math.abs(e.c[2]-20)<1e-6),inst:0},true);app.fitIso()});
const dl=await A(()=>window.__app.deltaLinien());if(dl.join()!=='X')fail('Mitte–Mitte: nur ΔX erwartet, ist '+dl);await bild('messen-methode-delta.png');
// 2) Bemaßung: Kette, Basislinie, Fase; speichern / laden
const d=await A(async()=>{const app=window.__app,U=app.data().uniq[0];const vi=q=>U.verts.findIndex(v=>v.every((x,j)=>Math.abs(x-q[j])<1e-6));const typ=document.getElementById('dimtyp');
  const set=async(sels,t)=>{app.clearSel();for(const s of sels)await app.select(s,true);typ.value=t;return app.keepDim(t)};
  const me=document.getElementById('methode');me.value='min';me.dispatchEvent(new Event('change'));
  const out={};const h=20*Math.tan(25*Math.PI/180);out.h=await set([{k:'vertex',id:vi([2,0,20]),inst:0},{k:'vertex',id:vi([80,0,20]),inst:0}],'ausgerichtet');
  out.k=await set([{k:'vertex',id:vi([100,0,20-h]),inst:0}],'kette');out.b=await set([{k:'vertex',id:vi([100,0,0]),inst:0}],'basislinie');
  app.clearSel();
  // Fase 2 × 45°: Fläche mit Normale (−1,−1,0)/√2 – über die Messung finden
  for(let i=0;i<U.faces.length&&!out.f;i++){if(U.faces[i].type!=='eben')continue;await app.select({k:'face',id:i,inst:0});const r=app.letzteMessung().r;
    if(r.rows.find(x=>x[0]==='Fase'&&x[1]==='2 × 45°')){typ.value='auto';out.f=app.keepDim('auto')}app.clearSel()}
  out.dims=app.dims().map(x=>({typ:x.typ,wert:x.wert,a:x.a,winkel:x.winkel,refNo:x.refNo}));out.text=app.bemassungenText();
  out.laden=await app.bemassungenEinlesen(out.text);out.nach=app.dims().map(x=>({typ:x.typ,wert:x.wert}));app.fitIso();return out});
const tw=d.dims.map(x=>x.typ+':'+(x.wert??0).toFixed(4)).join(' ');console.log('bemassungen',tw);
const soll=[['ausgerichtet',78],['kette',20],['basislinie',98],['fase',2]];
soll.forEach(([t,w],i)=>{if(d.dims[i]?.typ!==t||!nah(d.dims[i].wert,w))fail(`Bemaßung ${i+1}: ${JSON.stringify(d.dims[i])} ≠ ${t} ${w}`)});
if(d.laden.geladen!==4||d.laden.fehl)fail('Laden: '+JSON.stringify(d.laden));d.nach.forEach((x,i)=>{if(x.typ!==d.dims[i].typ||!nah(x.wert,d.dims[i].wert))fail('nach Laden anders: '+JSON.stringify(x))});
fs.writeFileSync(path.join(SHOTS,'faz1-messteil.hasi3d.json'),d.text);await bild('bemassung-kette-basislinie-fase.png');
// 3) Baugruppe: Klotz ausblenden → Volumen −8000 mm³
await laden('messbaugruppe.step');
const v=await A(async()=>{const app=window.__app;const vol=()=>app.modell().volume;const v0=vol();const n=app.nodes().find(x=>x.name==='Klotz');await app.act('toggle',n);
  for(let i=0;i<100&&!app.modell().ausgeblendet;i++)await new Promise(r=>setTimeout(r,50));const v1=vol();const info=document.getElementById('modelinfo').innerText;
  await app.act('showall');for(let i=0;i<100&&app.modell().ausgeblendet;i++)await new Promise(r=>setTimeout(r,50));return {v0,v1,v2:vol(),info,mass:document.getElementById('massinfo').innerText}});
if(!nah(v.v0-v.v1,8000,1e-3)||!nah(v.v2,v.v0,1e-6))fail('Ausblenden: '+JSON.stringify(v));if(!/Ausgeblendet \(nicht gerechnet\)/.test(v.info))fail('Hinweis ausgeblendet fehlt');
console.log('ausblenden ok: V',v.v0.toFixed(3),'→',v.v1.toFixed(3));
// 4) Umschlag 180°: keine NaN in Anzeige und Biegetabelle
await laden('umschlag.step');
const u=await A(async()=>{const app=window.__app,U=app.data().uniq[0];app.tab('blech');await app.calcSheet();const z=U.faces.findIndex(f=>f.type==='zylindrisch');app.tab('messen');app.clearSel();await app.select({k:'face',id:z,inst:0});
  return {mess:document.getElementById('mresult').innerText,bends:document.getElementById('bends').innerText,info:document.getElementById('sheetinfo').innerText}});
for(const t of [u.mess,u.bends,u.info])if(/NaN|Infinity|undefined|null/.test(t))fail('Umschlag: '+t.slice(0,300));if(!/Umschlag 180°/.test(u.mess))fail('Biegeart fehlt');
console.log('umschlag ok');await A(()=>window.__app.tab('messen'));await bild('umschlag-180.png');
// 5) Blech-Winkel: feste Fläche per Klick, DXF mit 3 Kreisen
await laden('blech-bohrungen.step');
await A(async()=>{const app=window.__app;app.tab('blech');await app.calcSheet();app.fitIso()});await p.waitForTimeout(500);
const auto=await A(()=>window.__app.blech().flat.size);
const pt=await A(()=>window.__app.screenOf([30,8,1]));await p.click('#festWaehlen');await p.mouse.click(pt[0],pt[1]);
await p.waitForFunction(()=>window.__app.fest()&&window.__app.blech()?.basisGewaehlt,null,{timeout:20000});
const f=await A(()=>({fest:window.__app.fest(),info:document.getElementById('festInfo').innerText,size:window.__app.blech().flat.size,dxf:window.__app.blech().dxf}));
if(!/Fläche/.test(f.info))fail('Anzeige feste Fläche: '+f.info);const s1=[...auto].sort(),s2=[...f.size].sort();if(!s1.every((x,i)=>nah(x,s2[i])))fail('Zuschnitt mit fester Fläche anders: '+s2+' ≠ '+s1);
const kreise=(f.dxf.match(/\n0\nCIRCLE\n/g)||[]).length,lw=(f.dxf.match(/\n0\nLWPOLYLINE\n/g)||[]).length;if(kreise!==3||lw!==2||!/\$INSUNITS\n70\n4/.test(f.dxf))fail(`DXF: ${kreise} Kreise, ${lw} Polylinien`);
fs.writeFileSync(path.join(SHOTS,'blech-bohrungen-aus-ui.dxf'),f.dxf);console.log('feste fläche ok:',f.info,'| dxf',kreise,'CIRCLE',lw,'LWPOLYLINE');await bild('blech-feste-flaeche.png');
await A(()=>window.__app.tab('blech'));await bild('blech-abwicklung-panel.png');
console.log('fehler',JSON.stringify(errs));await b.close();if(errs.length)process.exit(1);console.log('OK: Faz 1 Oberfläche');
