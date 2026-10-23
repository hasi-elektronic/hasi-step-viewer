// Gegen eine eigene Testinstanz mit WebView2-Remote-Debugging ausführen:
// node tools/smoke-desktop-messen.mjs http://127.0.0.1:9237 testdaten/messteil.step
import assert from 'node:assert/strict';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {checkMessartenUi} from './check-messarten-ui.mjs';
import {checkGrosseMessung} from './check-grosse-messung.mjs';
import fs from 'node:fs';
import {checkOberflaecheUi} from './check-oberflaeche-ui.mjs';
import {checkMessinformationenUi} from './check-messinformationen-ui.mjs';
import {checkDokumenteUi} from './check-dokumente-ui.mjs';
import {checkDokumenteAsyncUi} from './check-dokumente-async-ui.mjs';
const browser=await chromium.connectOverCDP(process.argv[2]);
try {
  const page=browser.contexts().flatMap(context=>context.pages()).find(page=>page.url().includes('tauri.localhost'));
  assert(page,'Eigene Desktop-Testseite nicht gefunden');
  await page.waitForFunction(()=>window.__dateienBereit);
  assert.deepEqual(await page.evaluate(()=>window.__dokumente().map(d=>d.name)),['messteil.step','messbaugruppe.step'],'Alle Windows-Startargumente werden zu Reitern');
  const bytes=await page.evaluate(async()=>{
    const response=await fetch('/ocjs/opencascade.wasm.wasm');
    const buffer=await response.arrayBuffer();
    return {status:response.status,length:buffer.byteLength,header:Array.from(new Uint8Array(buffer,0,8))};
  });
  assert.equal(bytes.status,200);assert.deepEqual(bytes.header,[0,97,115,109,1,0,0,0]);
  assert(bytes.length>60_000_000);
  await page.evaluate(file=>window.__oeffnePfad(file),path.resolve(process.argv[3]));
  await page.evaluate(()=>window.__messBereit);
  const result=await page.evaluate(async()=>{
    const data=window.__app.data(),u=data.uniq[data.inst[0].u];
    const vertices=u.verts.map((vertex,id)=>({id,p:vertex.p||vertex}));
    const a=vertices.find(vertex=>vertex.p.every((x,i)=>Math.abs(x-[100,0,0][i])<1e-5));
    const b=vertices.find(vertex=>vertex.p.every((x,i)=>Math.abs(x-[0,60,20][i])<1e-5));
    if(!a||!b)throw new Error('Soll-Eckpunkte im messteil fehlen');
    window.__app.tab('messen');
    await window.__app.select({k:'vertex',id:a.id,inst:0});
    await window.__app.select({k:'vertex',id:b.id,inst:0});
    const measurement=await window.__call('measure',{sels:[{k:'vertex',id:a.id,inst:0},{k:'vertex',id:b.id,inst:0}],opts:{}});
    return {kern:window.__lastLoad.kern,rows:measurement.rows,ui:window.__app.ergebnis()};
  });
  const distance=result.rows.find(row=>row[0]==='Abstand')?.[1];
  assert.equal(result.kern,'nativ');
  assert(Math.abs(distance-Math.hypot(100,60,20))<0.001,'Desktop-Messung stimmt nicht mit dem Sollmaß überein');
  assert(!/Fehler|CompileError/.test(result.ui),result.ui);
  assert(result.ui.includes('118,322'),result.ui);
  const messarten=await checkMessartenUi(page);
  const loadLocal=async file=>{await page.evaluate(file=>window.__oeffnePfad(file),path.resolve('testdaten',file));await page.evaluate(()=>window.__messBereit)};
  const oberflaeche=await checkOberflaecheUi(page,{produkt:process.env.HASI_TEST_PRODUKT||(process.env.MARKE==='sickinger'?'MS3D':'Hasi 3D'),version:JSON.parse(fs.readFileSync('package.json','utf8')).version,loadAssembly:()=>loadLocal('testbaugruppe.step'),loadPart:()=>loadLocal('messteil.step')});
  const informationen=await checkMessinformationenUi(page,{loadAssembly:()=>loadLocal('messbaugruppe.step')});
  const grosseBaugruppe=process.argv[4]?await checkGrosseMessung(page,path.resolve(process.argv[4])):null;
  const dokumente=await checkDokumenteUi(page,{loadPart:()=>loadLocal('messteil.step'),loadAssembly:()=>loadLocal('messbaugruppe.step'),loadExtra:()=>page.evaluate(async bytes=>{
    await Promise.all(['C.step','D.step','E.step','F.step'].map(name=>window.__loadBytes(Uint8Array.from(bytes).buffer,name)));
  },[...fs.readFileSync('testdaten/messteil.step')])});
  dokumente.async=await checkDokumenteAsyncUi(page,{loadPart:()=>loadLocal('messteil.step'),loadAssembly:()=>loadLocal('messbaugruppe.step'),loadSheet:name=>page.evaluate(({bytes,name})=>window.__loadBytes(Uint8Array.from(bytes).buffer,name),{bytes:[...fs.readFileSync('public/testblech.step')],name})});
  console.log(JSON.stringify({wasmBytes:bytes.length,nativeImport:true,startupTabs:2,distanceMm:distance,measurementUi:result.ui,messarten,oberflaeche,informationen,dokumente,...(grosseBaugruppe?{grosseBaugruppe}:{})}));
} finally { await browser.close(); }
