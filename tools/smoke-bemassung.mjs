// Headless-Test Bemaßung wie AutoCAD + Maussteuerung wie eDrawings. Screenshots in docs/ (nur selbst erzeugtes Messteil).
import { chromium } from 'playwright-core';import fs from 'fs';
for(const d of ['public','dist'])if(fs.existsSync(d))fs.copyFileSync('testdaten/messteil.step',d+'/messteil.step');
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const fail=m=>{throw new Error(m)};
await p.goto(process.env.URL||'http://localhost:4173/');await p.evaluate(()=>window.__loadUrl('./messteil.step'));
const A=(f,a)=>p.evaluate(f,a);
const cam=()=>A(()=>window.__app.cam?window.__app.cam():null);
// Maus: Mitte ziehen = drehen, Rad = Zoom, Links ziehen = keine Drehung
const cv=await (await p.$('#buehne')).boundingBox();const cx=cv.x+cv.width/2,cy=cv.y+cv.height/2;
const pos=()=>A(()=>window.__app.camPos());
let c0=await pos();await p.mouse.move(cx,cy);await p.mouse.down({button:'left'});await p.mouse.move(cx+150,cy+60,{steps:8});await p.mouse.up({button:'left'});await p.waitForTimeout(400);
let c1=await pos();if(Math.hypot(...c0.map((x,i)=>x-c1[i]))>1e-3)fail('Links-Ziehen dreht die Ansicht');
await p.mouse.move(cx,cy);await p.mouse.down({button:'middle'});await p.mouse.move(cx+150,cy+60,{steps:8});await p.mouse.up({button:'middle'});await p.waitForTimeout(400);
let c2=await pos();if(Math.hypot(...c1.map((x,i)=>x-c2[i]))<1e-3)fail('Mitte-Ziehen dreht nicht');
await p.mouse.move(cx+100,cy);await p.mouse.wheel(0,-400);await p.waitForTimeout(400);let c3=await pos();if(Math.hypot(...c2.map((x,i)=>x-c3[i]))<1e-3)fail('Rad zoomt nicht');
console.log('maus ok (links: keine Drehung, Mitte: Drehung, Rad: Zoom)');
await A(()=>window.__app.fitIso());await p.waitForTimeout(300);
// Bemaßungen aller Arten
const r=await A(async()=>{const app=window.__app,U=app.data().uniq[0];const out={};
  const vi=q=>U.verts.findIndex(v=>v.every((x,j)=>Math.abs(x-q[j])<1e-6));const ei=f=>U.edges.findIndex(f);
  const set=async(sels,typ)=>{app.clearSel();for(const s of sels)await app.select(s,true);document.getElementById('dimtyp').value=typ;return app.keepDim(typ)};
  const lin=(a,b)=>e=>e.type==='Gerade'&&((e.pts[0].every((x,j)=>Math.abs(x-a[j])<1e-6)&&e.pts.at(-1).every((x,j)=>Math.abs(x-b[j])<1e-6))||(e.pts[0].every((x,j)=>Math.abs(x-b[j])<1e-6)&&e.pts.at(-1).every((x,j)=>Math.abs(x-a[j])<1e-6)));
  out.h=await set([{k:'vertex',id:vi([100,0,0]),inst:0},{k:'vertex',id:vi([0,60,0]),inst:0}],'horizontal');
  out.a=await set([{k:'vertex',id:vi([100,0,0]),inst:0},{k:'vertex',id:vi([0,60,20]),inst:0}],'ausgerichtet');
  const h=15*Math.tan(Math.PI/6);out.w=await set([{k:'edge',id:ei(lin([85,0,20],[100,0,20-h])),inst:0},{k:'edge',id:ei(lin([5,0,0],[100,0,0])),inst:0}],'winkel');
  const c16=ei(e=>e.type==='Kreis'&&Math.abs(e.r-8)<1e-6&&Math.abs(e.c[2]-20)<1e-6);out.d=await set([{k:'edge',id:c16,inst:0}],'durchmesser');
  const c10=ei(e=>e.type==='Kreis'&&Math.abs(e.r-5)<1e-6&&Math.abs(e.c[2]-20)<1e-6&&e.pts.length>40);out.r=await set([{k:'edge',id:c10,inst:0}],'radius');
  const fil=ei(e=>e.type==='Kreis'&&Math.abs(e.r-5)<1e-6&&e.pts.length<20&&Math.abs(e.c[2]-20)<1e-6);out.b=await set([{k:'edge',id:fil,inst:0}],'bogen');
  out.k=await set([{k:'vertex',id:vi([0,60,20]),inst:0}],'koordinate');app.clearSel();
  return {out,dims:app.dims().map(d=>({typ:d.typ,wert:d.wert}))}});
console.log(JSON.stringify(r.dims));
const soll={horizontal:null,ausgerichtet:Math.hypot(100,60,20),winkel:30,durchmesser:16,radius:5,bogen:5*Math.PI/2};
for(const d of r.dims){const s=soll[d.typ];if(s!=null&&Math.abs(d.wert-s)>1e-4)fail(`${d.typ}: ${d.wert} ≠ ${s}`)}
if(r.dims.length!==7)fail('7 Bemaßungen erwartet: '+JSON.stringify(r.out));
await p.waitForTimeout(300);await p.screenshot({path:'docs/bemassung-arten.png'});
// Toleranz, Präfix/Suffix bearbeiten
await A(()=>window.__app.editDim(2));await p.selectOption('#deTol','symm');await p.fill('#deO','0,05');await p.fill('#dePre','2× ');
await A(()=>window.__app.editDim(4));await p.selectOption('#deTol','grenz');await p.fill('#deO','0,1');await p.fill('#deU','0');await p.fill('#deSuf','H7');
await p.click('#deClose');
// Ziehen: Maßtext der ersten Bemaßung greifen und versetzen
const h0=(await A(()=>window.__app.dimLabels())).find(l=>l[1]===1);await p.mouse.move(h0[0][0]+cv.x,h0[0][1]+cv.y);await p.mouse.down();await p.mouse.move(h0[0][0]+cv.x,h0[0][1]+cv.y+70,{steps:6});await p.mouse.up();await p.waitForTimeout(200);
const h1=(await A(()=>window.__app.dimLabels())).find(l=>l[1]===1);if(Math.hypot(h1[0][0]-h0[0][0],h1[0][1]-h0[0][1])<20)fail('Ziehen versetzt die Maßlinie nicht');console.log('ziehen',Math.round(h1[0][1]-h0[0][1]),'px');
// Maßstil
await p.fill('#stGroesse','17');await p.selectOption('#stPfeil','schraeg');await p.fill('#stStellen','3');await p.waitForTimeout(300);
await p.screenshot({path:'docs/bemassung-toleranz-stil.png'});
// Gedreht: weiterhin lesbar (Text wird zur Kamera gedreht, nie kopfüber)
await p.mouse.move(cx,cy);await p.mouse.down({button:'middle'});await p.mouse.move(cx-260,cy+120,{steps:10});await p.mouse.up({button:'middle'});await p.waitForTimeout(400);
await p.screenshot({path:'docs/bemassung-gedreht.png'});
// Export
await A(()=>window.__app.exportPng());let ex=await A(()=>({n:window.__lastExport.name,l:window.__lastExport.bytes.length}));console.log('png',JSON.stringify(ex));if(!ex.n.endsWith('.png')||ex.l<10000)fail('PNG');
fs.writeFileSync('/tmp/bemassung.png',Buffer.from(await A(()=>Array.from(window.__lastExport.bytes))));
await A(()=>window.__app.exportPdf());ex=await A(()=>({n:window.__lastExport.name,l:window.__lastExport.bytes.length,h:String.fromCharCode(...window.__lastExport.bytes.slice(0,5))}));console.log('pdf',JSON.stringify(ex));if(ex.h!=='%PDF-')fail('PDF');
fs.writeFileSync('/tmp/bemassung.pdf',Buffer.from(await A(()=>Array.from(window.__lastExport.bytes))));
console.log('fehler',JSON.stringify(errs));await b.close();if(errs.length)process.exit(1);console.log('OK: Bemaßung und Maus');
