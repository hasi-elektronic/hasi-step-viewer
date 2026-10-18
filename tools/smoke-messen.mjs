// Headless-Test Messen: Fangen mit Hover, Bemaßungen, Liste, Genauigkeit, Blech-Rundung. Screenshots in docs/.
import { chromium } from 'playwright-core';import fs from 'fs';
for(const d of ['public','dist'])if(fs.existsSync(d))fs.copyFileSync('testdaten/messteil.step',d+'/messteil.step');
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.env.URL||'http://localhost:4173/');
const fail=m=>{throw new Error(m)};
await p.evaluate(()=>window.__loadUrl('./messteil.step'));
const sel=(f,a)=>p.evaluate(f,a);
// Fangen per Maus: Raster absuchen, bis Kantenmitte / Ecke / Kreismittelpunkt gefangen werden
const found=await p.evaluate(()=>{const o={};for(let y=150;y<800;y+=6)for(let x=300;x<1150;x+=6){const s=window.__app.pickAt(x,y);if(s&&!o[s.k])o[s.k]=[x,y]}return o});
console.log('fangen',JSON.stringify(Object.keys(found)));for(const k of ['vertex','mid','center','edge','face'])if(!found[k])fail('Fangart fehlt: '+k);
await p.mouse.move(...found.center);await p.waitForTimeout(250);const tip=await p.textContent('#snaptip');console.log('hover',tip);if(tip!=='Kreismittelpunkt')fail('Hover-Vorschau fehlt');
await p.screenshot({path:'docs/messen-fangen.png'});
// Bemaßungen
const ids=await p.evaluate(()=>{const U=window.__app.data().uniq[0];const c=U.edges.map((e,i)=>[e,i]).filter(([e])=>e.type==='Kreis'&&e.c[2]>19.9&&e.pts.length>40);return c.map(x=>x[1])});
await sel(async i=>{window.__app.clearSel();await window.__app.select({k:'center',id:i[0],inst:0,p:window.__app.data().uniq[0].edges[i[0]].c});await window.__app.select({k:'center',id:i[1],inst:0,p:window.__app.data().uniq[0].edges[i[1]].c})},ids);
await sel(async i=>{window.__app.clearSel();await window.__app.select({k:'edge',id:i[0],inst:0});await window.__app.select({k:'edge',id:i[1],inst:0})},ids);
const vi=await p.evaluate(()=>{const v=window.__app.data().uniq[0].verts;const f=q=>v.findIndex(p=>p.every((x,j)=>Math.abs(x-q[j])<1e-6));return [f([100,0,0]),f([0,60,20])]});
await sel(async v=>{const d=window.__app.data().uniq[0].verts;window.__app.clearSel();await window.__app.select({k:'vertex',id:v[0],inst:0,p:d[v[0]]});await window.__app.select({k:'vertex',id:v[1],inst:0,p:d[v[1]]})},vi);
await sel(()=>window.__app.clearSel());
let dims=await p.evaluate(()=>window.__dims);console.log('bemassungen',JSON.stringify(dims.map(d=>d.text.split('\n')[1])));
if(dims.length!==3)fail('3 Bemaßungen erwartet');if(!dims[0].text.includes('Abstand: 50,000 mm'))fail('Lochabstand falsch: '+dims[0].text);
if(!dims[1].text.includes('Abstand max.: 63,000 mm'))fail('Abstand max fehlt');
await p.selectOption('#prec','1');await p.waitForTimeout(200);dims=await p.evaluate(()=>window.__dims);if(!dims[2].text.includes('Abstand: 118,3 mm'))fail('Genauigkeit 1: '+dims[2].text);
await p.click('#dimlist .dim:nth-child(1) button[data-a=copy]');const cp=await p.evaluate(()=>window.__lastCopy);console.log('kopiert',JSON.stringify(cp.split('\n').slice(0,2)));if(!cp.includes('50,0 mm'))fail('Kopieren');
await p.selectOption('#prec','3');await p.waitForTimeout(300);await p.screenshot({path:'docs/messen-bemassungen.png'});
await p.click('#dimlist .dim:nth-child(2) button[data-a=del]');dims=await p.evaluate(()=>window.__dims);if(dims.length!==2)fail('Löschen');
// Blech: Ein-Klick auf Rundung des Testblechs
await p.evaluate(()=>window.__loadUrl('./testblech.step'));
await sel(async()=>{const U=window.__app.data().uniq[0];const i=U.faces.findIndex(f=>f.type==='zylindrisch'&&f.ax&&Math.abs(f.ax.r-5)<1e-6);window.__app.clearSel();await window.__app.select({k:'face',id:i,inst:0})});
const mr=await p.textContent('#mresult');console.log('rundung',mr.slice(0,300));for(const t of ['Radius innen Ri3,000 mm','Radius außen Ra5,000 mm','Biegewinkel90,0','Außenmaß über die Biegung'])if(!mr.includes(t))fail('Blech-Rundung: '+t);
await p.waitForTimeout(200);await p.screenshot({path:'docs/messen-blech-rundung.png'});
console.log('fehler',JSON.stringify(errs));await b.close();if(errs.length)process.exit(1);
