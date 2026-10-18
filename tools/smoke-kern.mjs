// Headless-Test des nativen Ladepfads im Browser: Tauri-Aufrufe werden simuliert (modell.bin/modell.brep vom echten hasi-kern),
// Worker, Baum, Szene und Messen laufen wie in der Desktop-App. Aufruf: node tools/smoke-kern.mjs [datei.step] (vite preview auf :4173)
import { chromium } from 'playwright-core';import fs from 'fs';import {execFileSync} from 'child_process';import os from 'os';import path from 'path';
const f=process.argv[2]||'testdaten/testbaugruppe.step';const exe=process.env.HASI_KERN||'kern/build/hasi-kern';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hk-'));
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
let kernMs=0;
await p.exposeFunction('__kernLauf',async()=>{const t=Date.now();execFileSync(exe,[f,dir],{stdio:'ignore'});kernMs=Date.now()-t;return fs.readFileSync(path.join(dir,'modell.bin')).toString('base64')});
await p.exposeFunction('__kernBrep',async()=>fs.readFileSync(path.join(dir,'modell.brep'),'latin1'));
await p.addInitScript(()=>{window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
  if(cmd==='kern_verfuegbar')return true;
  if(cmd==='kern_laden'){const s=atob(await window.__kernLauf());const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer}
  if(cmd==='kern_brep')return await window.__kernBrep();throw new Error('unbekannt '+cmd)}}});
await p.goto('http://localhost:4173/');await p.waitForFunction(()=>window.__loadBytes||window.__loadUrl,{timeout:60000});
const bytes=fs.readFileSync(f).toString('base64');
const t0=Date.now();
const info=await p.evaluate(async b64=>{const s=atob(b64);const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return await window.__loadBytes(u.buffer,'modell.step')},bytes);
const tLoad=Date.now()-t0;
await p.evaluate(()=>window.__messBereit);const tMess=Date.now()-t0;
const status=await p.textContent('#status');
// eine Messung über die nachgeladenen Messdaten: Volumen des ersten Körpers
const vol=await p.evaluate(async()=>{const r=await window.__call('props',{ids:[0]});return r.volume});
console.log(JSON.stringify({kern:info.kern,koerper:info.bodies,unikate:info.unique,kernMs,ladenMs:tLoad,messenBereitMs:tMess,volumen0:vol,status:process.env.KEIN_STATUS?undefined:status}));
if(info.kern!=='nativ')throw new Error('nativer Pfad nicht benutzt');if(!(vol>0))throw new Error('Messen über nachgeladene Daten fehlgeschlagen');
if(errs.length)throw new Error('Fehler im Browser: '+errs.join(' | '));
fs.rmSync(dir,{recursive:true,force:true});await b.close();console.log('OK: nativer Ladepfad im Browser');
