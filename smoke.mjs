// Headless-Test mit selbst erzeugtem Testblech (npm run testblech). Erzeugt Screenshots in docs/.
import { chromium } from 'playwright-core';import fs from 'fs';
fs.mkdirSync('docs',{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto(process.env.URL||'http://localhost:4173/');
const info=await p.evaluate(()=>window.__loadUrl('./testblech.step'));console.log('load',JSON.stringify(info));
const ids=await p.evaluate(()=>{const d=window.__app.data();return {hole:d.uniq[0].edges.findIndex(e=>e.type==='Kreis'&&e.pts.length>40),v:0,faces:d.uniq[0].faces.map((f,i)=>[i,f.type])}});
// 1) Kreismittelpunkt der Bohrung -> Eckpunkt
await p.evaluate(async i=>{window.__app.clearSel();await window.__app.select({k:'center',id:i.hole,inst:0,p:window.__app.data().uniq[0].edges[i.hole].c});const v=window.__app.data().uniq[0].verts[0];await window.__app.select({k:'vertex',id:0,inst:0,p:v})},ids);
await p.waitForTimeout(300);console.log('mess1',JSON.stringify(await p.evaluate(()=>window.__lastMeasure.rows)));await p.screenshot({path:'docs/messen-kreismitte.png'});
// 2) echte Mausauswahl: zwei Flächen über Bildschirmkoordinaten (Hover/Fangen)
const r2=await p.evaluate(async()=>{window.__app.clearSel();const d=window.__app.data();
  const picks=[];for(let y=200;y<800&&picks.length<2;y+=23)for(let x=400;x<1150&&picks.length<2;x+=23){const s=window.__app.pickAt(x,y);if(s&&s.k==='face'&&d.uniq[0].faces[s.id].type==='eben'&&!picks.some(q=>q.id===s.id))picks.push(s)}
  for(const s of picks)await window.__app.select(s);return window.__lastMeasure?.rows});
console.log('mess2',JSON.stringify(r2));await p.waitForTimeout(300);await p.screenshot({path:'docs/messen-flaechen.png'});
// 3) Radius der Biegung
await p.evaluate(async()=>{window.__app.clearSel();const d=window.__app.data();const i=d.uniq[0].faces.findIndex(f=>f.type==='zylindrisch');await window.__app.select({k:'face',id:i,inst:0})});
console.log('mess3',JSON.stringify(await p.evaluate(()=>window.__lastMeasure.rows)));
// 4) Blech
await p.evaluate(()=>{window.__app.clearSel();window.__app.tab('blech')});await p.waitForFunction(()=>window.__lastSheet);await p.waitForTimeout(400);
console.log('blech',JSON.stringify(await p.evaluate(()=>{const s=window.__lastSheet;return {t:s.t,bends:s.bends,size:s.flat?.size,warn:s.warn,dxfBytes:s.dxf?.length}})));
await p.screenshot({path:'docs/blech-abwicklung.png'});
const dxf=await p.evaluate(()=>window.__lastSheet.dxf);fs.writeFileSync('docs/testblech_Abwicklung.dxf',dxf);
// 5) Schnitt
await p.evaluate(()=>{window.__app.tab('messen');window.__setCut('Y',500)});await p.waitForTimeout(400);await p.screenshot({path:'docs/schnitt.png'});
console.log('fehler',JSON.stringify(errs));await b.close();
