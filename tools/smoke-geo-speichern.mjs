// „Abwicklung als GEO speichern“ über den echten Speicherweg der App: Menü Datei › Abwicklung als GEO und Knopf im Blech-Reiter,
// Tauri-Aufrufe simuliert (nativer Kern, wenn HASI_KERN da ist). Geprüft wird, was die Oberfläche an save_text übergibt:
// nicht leer, CRLF, neu eingelesen gleiche Konturen, Biegungen und Ausdehnung wie die Abwicklung. Der Inhalt landet in OUT
// (<name>.inhalt + <name>.soll.json); cargo test geo_aus_der_oberflaeche_speichern schreibt ihn danach mit der Rust-Funktion der App,
// tools/geo-pruefen.mjs liest die geschriebene Datei neu ein.
// Aufruf: node tools/smoke-geo-speichern.mjs (vite preview, PORT). DATEI=… anderes Teil, OUT=… Ablage, SHOT=… Bildschirmfoto.
import { chromium } from 'playwright-core';import fs from 'fs';import {execFileSync} from 'child_process';import os from 'os';import path from 'path';
import {geoDateiPruefen} from './geo-pruefen.mjs';
const port=process.env.PORT||'4173';const exe=process.env.HASI_KERN||'kern/build/hasi-kern';const nativ=fs.existsSync(exe);
const datei=path.resolve(process.env.DATEI||'testdaten/haube-6mm.step');const out=path.resolve(process.env.OUT||fs.mkdtempSync(path.join(os.tmpdir(),'geo-')));fs.mkdirSync(out,{recursive:true});
const fail=m=>{throw new Error(m)};const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hg-'));let nr=0;const saves=[];
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:1400,height:880}});const errs=[];
await ctx.exposeFunction('__kernPfad',async pfad=>{const d=path.join(tmp,'k'+(nr++));fs.mkdirSync(d);execFileSync(exe,[pfad,d],{stdio:'ignore'});
  return {bin:fs.readFileSync(path.join(d,'modell.bin')).toString('base64'),brep:fs.readFileSync(path.join(d,'modell.brep'),'latin1')}});
await ctx.exposeFunction('__dateiLesen',async pfad=>fs.readFileSync(pfad).toString('base64'));
// save_text wie in Rust: Inhalt muss ein nicht leerer String sein, zurück kommt die Byte-Zahl (GEO: ANSI mit CRLF)
await ctx.exposeFunction('__speichern',async a=>{if(typeof a.content!=='string'||!a.content.length)throw new Error('GEO ist leer – nichts gespeichert');
  const ziel=path.join(out,a.name+'.inhalt');fs.writeFileSync(ziel,a.content,'utf8');saves.push({name:a.name,ext:a.ext,filter:a.filter,ziel,len:a.content.length});
  return Buffer.byteLength(a.content.replace(/\r?\n/g,'\r\n'),'latin1')});
await ctx.addInitScript(nativ=>{const ab=s=>{const t=atob(s);const u=new Uint8Array(t.length);for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u.buffer};let letzt=null;
  window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{if(cmd==='kern_verfuegbar')return nativ;if(cmd==='start_pfad')return null;
    if(cmd==='kern_laden_pfad'){letzt=await window.__kernPfad(args.pfad);return ab(letzt.bin)}if(cmd==='datei_lesen')return ab(await window.__dateiLesen(args.pfad));
    if(cmd==='kern_brep')return letzt.brep;if(cmd==='save_text')return window.__speichern(args);throw new Error('unbekannt '+cmd)},transformCallback:()=>0}},nativ);
const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://localhost:${port}/`);await p.waitForFunction(()=>window.__oeffnePfad);await p.evaluate(f=>window.__oeffnePfad(f),datei);
await p.waitForFunction(()=>window.__lastLoad&&window.__lastLoad.bodies>0,null,{timeout:180000});const kern=await p.evaluate(()=>window.__lastLoad.kern);
if(nativ&&kern!=='nativ')fail('nativer Pfad nicht benutzt: '+kern);
// 1) Menü Datei › „Abwicklung als GEO (Trumpf)“ ohne vorher berechnete Abwicklung
await p.evaluate(()=>document.querySelector('[data-aktion=geo]').click());
await p.waitForFunction(()=>/GEO (gespeichert|konnte|nicht|gesperrt)/.test(document.getElementById('status').textContent),null,{timeout:180000});
let st=await p.textContent('#status');if(!/^GEO gespeichert: .+_Abwicklung\.geo \([\d.]+ Bytes\)$/.test(st))fail('Status Menü: '+st);
const sh=await p.evaluate(()=>{const s=window.__lastSheet;return {geo:s.geo,size:s.flat.size,bends:s.bends.length}});
if(saves.length!==1||saves[0].ext!=='geo'||saves[0].filter!=='Trumpf-GEO')fail('save_text: '+JSON.stringify(saves));
const inhalt=fs.readFileSync(saves[0].ziel,'utf8');if(inhalt!==sh.geo)fail('übergebener Inhalt ≠ Abwicklung ('+inhalt.length+' / '+sh.geo.length+')');
const geoKont=+sh.geo.split('\r\n')[sh.geo.split('\r\n').indexOf('#~3')+13];
const r=geoDateiPruefen(Buffer.from(inhalt,'latin1'),null);
const soll={konturen:geoKont,innen:r.innen,biegungen:sh.bends,max:[...sh.size].sort((a,b)=>a-b),bytes:Buffer.byteLength(inhalt,'latin1')};
const rmax=[...r.max].sort((a,b)=>a-b);
if(r.konturen!==soll.konturen)fail(`Konturen ${r.konturen} ≠ Kopf ${soll.konturen}`);if(r.biegungen!==soll.biegungen)fail(`Biegungen ${r.biegungen} ≠ ${soll.biegungen}`);
if(Math.max(Math.abs(rmax[0]-soll.max[0]),Math.abs(rmax[1]-soll.max[1]))>1e-6)fail(`Ausdehnung ${rmax} ≠ ${soll.max}`);
soll.max=r.max;fs.writeFileSync(saves[0].ziel.replace(/\.inhalt$/,'.soll.json'),JSON.stringify(soll));
console.log(`  ok  Menü › GEO: ${st} – ${r.konturen} Konturen (innen ${r.innen}), ${r.biegungen} Biegungen, ${rmax.map(v=>v.toFixed(4)).join(' × ')} mm (Kern ${kern})`);
// 2) Blech-Reiter: erst DXF, dann GEO – der GEO-Inhalt bleibt derselbe
await p.evaluate(()=>{window.__TAURI_INTERNALS__.invoke=(o=>async(c,a)=>c==='save_text'&&a.ext==='dxf'?a.content.length:o(c,a))(window.__TAURI_INTERNALS__.invoke)});
await p.evaluate(()=>document.getElementById('dxf').click());await p.waitForFunction(()=>/^DXF gespeichert/.test(document.getElementById('status').textContent));
await p.evaluate(()=>document.getElementById('geoSpeichern').click());await p.waitForFunction(n=>/^GEO gespeichert/.test(document.getElementById('status').textContent)&&true,1);
await p.waitForTimeout(300);if(saves.length!==2||fs.readFileSync(saves[1].ziel,'utf8')!==sh.geo)fail('GEO nach DXF: '+JSON.stringify(saves.map(s=>s.len)));
console.log('  ok  Blech-Reiter: DXF, danach GEO – vollständiger Inhalt ('+saves[1].len+' Zeichen)');
// 3) leerer Inhalt legt keine Datei an, sondern meldet es
await p.evaluate(()=>{window.__lastSheet.geo='';});const vor=saves.length;
await p.evaluate(()=>document.getElementById('geoSpeichern').click());await p.waitForTimeout(200);st=await p.textContent('#status');
if(saves.length!==vor||!/GEO ist leer/.test(st))fail('leere GEO: '+st);
console.log('  ok  leere GEO: kein Aufruf, Meldung „'+st+'“');
if(errs.length)fail('Seitenfehler: '+errs.join(' | '));
await b.close();fs.rmSync(tmp,{recursive:true,force:true});console.log('OK: GEO speichern über den Speicherweg der App ('+out+')');
