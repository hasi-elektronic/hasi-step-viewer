// Zeitmessung „Datei öffnen“ wie in der Desktop-App (Doppelklick): Tauri-Aufrufe werden simuliert, der echte hasi-kern läuft.
// Aufruf: node tools/bench-oeffnen.mjs <datei.step> [--json]   (vite preview auf PORT, Standard 4173)
// Ausgabe: Zeiten je Stufe in ms. Die Kopie der Daten Node→Browser (Base64) wird gemessen und abgezogen, sie gibt es in der App nicht.
import { chromium } from 'playwright-core';import fs from 'fs';import {spawn} from 'child_process';import os from 'os';import path from 'path';
const f=path.resolve(process.argv[2]||'testdaten/testbaugruppe.step');const exe=path.resolve(process.env.HASI_KERN||'kern/build/hasi-kern');const port=process.env.PORT||4173;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hk-bench-'));
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const t={};let kernProc=null,kernFertig=null;const brücke={ms:0};
// Kern starten; Ergebnis, sobald modell.bin fertig ist (Zeile BIN auf stdout) oder der Prozess endet
function kernStart(ein){const t0=Date.now();fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir);
  kernProc=spawn(exe,[ein,dir],{stdio:['ignore','pipe','pipe']});let err='';kernProc.stderr.on('data',d=>err+=d);
  const ende=new Promise(r=>kernProc.on('exit',c=>{t.kernEnde=Date.now()-t0;t.kernLog=err;r(c)}));
  const bin=new Promise(r=>{let out='';kernProc.stdout.on('data',d=>{out+=d;if(/^BIN\b/m.test(out)){t.kernBin=Date.now()-t0;r()}});ende.then(()=>{if(t.kernBin==null)t.kernBin=Date.now()-t0;r()})});
  kernFertig=ende;return bin}
// Binärdaten wie in der App ohne Umweg über Text: der simulierte Aufruf holt sie per fetch (wie Tauris IPC-Protokoll)
await p.route('**/__bench/**',async route=>{const cmd=new URL(route.request().url()).pathname.split('/').pop();
  if(cmd==='datei_lesen'){const t0=Date.now();const d=fs.readFileSync(f);t.dateiLesen=Date.now()-t0;return route.fulfill({status:200,body:d,contentType:'application/octet-stream'})}
  if(cmd==='kern_laden_pfad'){await kernStart(f);return route.fulfill({status:200,body:fs.readFileSync(path.join(dir,'modell.bin')),contentType:'application/octet-stream'})}
  if(cmd==='kern_brep'){await kernFertig;return route.fulfill({status:200,body:fs.readFileSync(path.join(dir,'modell.brep')),contentType:'text/plain; charset=latin1'})}
  return route.fulfill({status:404,body:''})});
await p.addInitScript(([pfad])=>{window.__benchT0=performance.now();window.__bruecke=0;window.__lange=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lange.push([Math.round(e.startTime-window.__benchT0),Math.round(e.duration)])}).observe({type:'longtask',buffered:true})}catch{}
  const holen=async cmd=>{const r=await fetch('/__bench/'+cmd);if(!r.ok)throw new Error(cmd);return cmd==='kern_brep'?new TextDecoder('latin1').decode(await r.arrayBuffer()):await r.arrayBuffer()};
  window.__TAURI_INTERNALS__={transformCallback:()=>0,invoke:async(cmd,args)=>{if(cmd==='plugin:event|listen')return 0;
    if(cmd==='kern_verfuegbar')return true;
    if(cmd==='start_pfad')return pfad;
    if(cmd==='datei_lesen'||cmd==='kern_laden_pfad'||cmd==='kern_brep')return await holen(cmd);
    throw new Error('unbekannt '+cmd)}}},[f]);
const tStart=Date.now();
await p.goto(`http://localhost:${port}/`);
await p.waitForFunction(()=>window.__lastLoad,null,{timeout:180000,polling:20});
const tLoad=Date.now()-tStart;
// erstes Bild nach dem Laden
await p.waitForFunction(()=>window.__ladeStufen&&window.__ladeStufen.erstesBild!=null,null,{timeout:120000,polling:20});
const r=await p.evaluate(()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(()=>res({sichtbar:performance.now()-window.__benchT0,abLadeStart:performance.now()-(window.__ladeStart||window.__benchT0),dateiLesen:window.__dateiLesenMs,bruecke:window.__bruecke,info:{...window.__lastLoad,stats:undefined},stufen:window.__ladeStufen||null,lange:window.__lange,ladeStart:Math.round(window.__ladeStart-window.__benchT0)})))));
const tMess0=Date.now();await p.evaluate(()=>window.__messBereit);const tMess=Date.now()-tStart;
// Reaktion während/nach dem Laden: ein Messbefehl
const tv=Date.now();const vol=await p.evaluate(async()=>{const r=await window.__call('props',{ids:[0]});return r.volume});const tProps=Date.now()-tv;
await kernFertig;
const aus={datei:f.startsWith(path.resolve('testdaten'))||f.startsWith(path.resolve('public'))||f.startsWith(os.tmpdir())?path.basename(f):'(externe Datei)',bytes:fs.statSync(f).size,koerper:r.info.bodies,unikate:r.info.unique,flaechen:r.info.faces,dreiecke:r.info.triangles,
  kernBinMs:t.kernBin,kernEndeMs:t.kernEnde,kernStufen:r.info.times,appGesamtMs:r.info.totalMs,ersterSichtbarMs:Math.round(r.sichtbar),bruckeMs:Math.round(r.bruecke+brücke.ms),
  ersterSichtbarOhneBrueckeMs:Math.round(r.sichtbar-r.bruecke-brücke.ms),messenBereitMs:tMess,propsMs:tProps,volumen0:vol,stufen:r.stufen,langeAufgaben:r.lange,ladeStartAbSeite:r.ladeStart,abLadeStartMs:Math.round(r.abLadeStart),abLadeStartOhneBrueckeMs:Math.round(r.abLadeStart-r.bruecke-brücke.ms),dateiLesenMs:r.dateiLesen};
console.log(JSON.stringify(aus,null,process.argv.includes('--json')?0:1));
if(r.info.kern!=='nativ')throw new Error('nativer Pfad nicht benutzt');if(!(vol>0))throw new Error('Messen fehlgeschlagen');
if(errs.length)throw new Error('Fehler im Browser: '+errs.join(' | '));
fs.rmSync(dir,{recursive:true,force:true});await b.close();
