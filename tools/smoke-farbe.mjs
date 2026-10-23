// STEP-Farben im nativen Ladepfad (Tauri-Aufrufe simuliert, echter hasi-kern): Teil-, Flächen- und Instanzfarbe in der Anzeige,
// Schalter „STEP-Farben anzeigen“ (aus = gewohntes Grau), Datei ohne Farben bleibt grau, Export-Hinweis „Farben werden übernommen“,
// und Ablegen einer Datei im Einzelteil-Fenster (Desktop: Rust ruft __oeffnePfad im Fenster, in das gezogen wurde).
// Aufruf: node tools/smoke-farbe.mjs (vite preview, PORT). SHOTDIR=… speichert Bildschirmfotos.
import { chromium } from 'playwright-core';import fs from 'fs';import {execFileSync} from 'child_process';import os from 'os';import path from 'path';
const port=process.env.PORT||'4173';const exe=process.env.HASI_KERN||'kern/build/hasi-kern';const shot=process.env.SHOTDIR;if(shot)fs.mkdirSync(shot,{recursive:true});
const fail=m=>{throw new Error(m)};const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hf-'));
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx=await b.newContext({viewport:{width:1400,height:880}});const errs=[];let nr=0;
await ctx.exposeFunction('__kernPfad',async pfad=>{const d=path.join(tmp,'k'+(nr++));fs.mkdirSync(d);execFileSync(exe,[pfad,d],{stdio:'ignore'});
  return {bin:fs.readFileSync(path.join(d,'modell.bin')).toString('base64'),step:fs.readFileSync(pfad).toString('base64'),brep:fs.readFileSync(path.join(d,'modell.brep'),'latin1')}});
await ctx.exposeFunction('__dateiLesen',async pfad=>fs.readFileSync(pfad).toString('base64'));
await ctx.addInitScript(()=>{localStorage.removeItem('stepFarben');const ab=s=>{const t=atob(s);const u=new Uint8Array(t.length);for(let i=0;i<t.length;i++)u[i]=t.charCodeAt(i);return u.buffer};let letzt=null;
  window.__TAURI_INTERNALS__={transformCallback:()=>0,invoke:async(cmd,args)=>{if(cmd==='dokumente_zuruecksetzen'||cmd==='dokument_schliessen')return true;if(cmd==='dokument_neu')return 'mock-'+Math.random();if(cmd==='plugin:event|listen')return 0;
    if(cmd==='kern_verfuegbar')return true;if(cmd==='start_pfad')return null;
    if(cmd==='kern_laden_pfad'){letzt=await window.__kernPfad(args.pfad);return ab(letzt.bin)}
    if(cmd==='datei_lesen')return ab(await window.__dateiLesen(args.pfad));
    if(cmd==='kern_brep')return letzt.brep;
    throw new Error('unbekannt '+cmd)},transformCallback:()=>0}});
const seite=async url=>{const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto(url);await p.waitForFunction(()=>window.__oeffnePfad&&window.__farben);return p};
const oeffnen=async(p,f)=>{await p.evaluate(()=>{});await p.evaluate(f=>window.__oeffnePfad(f),path.resolve(f));
  await p.waitForFunction(()=>window.__lastLoad&&window.__lastLoad.bodies>0,null,{timeout:90000});return p.evaluate(()=>window.__lastLoad)};
const p=await seite(`http://localhost:${port}/`);
const info=await oeffnen(p,'testdaten/farbbaugruppe.step');if(info.kern!=='nativ')fail('nativer Pfad nicht benutzt: '+info.kern);
let F=await p.evaluate(()=>window.__farben());
const farben=F.koerper.map(k=>k.farbe).sort();
// Platte: rot mit grüner Oberseite (Flächenfarben), Bolzen gelb, zweiter Bolzen (Instanzfarbe) blau
if(JSON.stringify(farben)!==JSON.stringify(['#1933cc','#e5cc19','flaechen']))fail('Farben in der Anzeige: '+farben);
if(shot){await p.evaluate(()=>window.__app?.einpassen?.());await p.waitForTimeout(400);await p.screenshot({path:path.join(shot,'farbbaugruppe-farben-an.png')})}
console.log('  ok  Farben angezeigt:',farben.join(', '));
await p.locator('.menuknopf',{hasText:'Ansicht'}).click();const mt=await p.locator('#menuFarben').textContent();if(!mt.startsWith('✓'))fail('Menü: '+mt);
await p.locator('#menuFarben').click();F=await p.evaluate(()=>window.__farben());
if(F.an||!F.koerper.every(k=>k.grau))fail('Schalter aus: nicht alles grau');
if(shot){await p.waitForTimeout(300);await p.screenshot({path:path.join(shot,'farbbaugruppe-farben-aus.png')})}
await p.evaluate(()=>window.__farben().umschalten());
console.log('  ok  Schalter „STEP-Farben anzeigen“ aus = Grau, wieder an');
// Export-Dialog: nativer Kern übernimmt Farben
await p.locator('#tree .trow',{hasText:'Platte'}).first().click({button:'right'});await p.locator('#ctx button[data-a=einzelStep]').click();
const hw=await p.locator('#einzelDlg .einzelHinweis').textContent();if(!/Farben werden übernommen/.test(hw))fail('Hinweis nativ: '+hw);
if(shot)await p.screenshot({path:path.join(shot,'export-dialog-farben.png')});await p.locator('#einzelAbbr').click();
// Datei ohne Farben bleibt im gewohnten Grau
const ohne=await oeffnen(p,'testdaten/messteil.step');F=await p.evaluate(()=>window.__farben());
if(!F.koerper.every(k=>k.grau))fail('Datei ohne Farben nicht grau');
if(shot){await p.waitForTimeout(300);await p.screenshot({path:path.join(shot,'ohne-farben-grau.png')})}
console.log('  ok  ohne STEP-Farben: gewohntes Grau ('+ohne.bodies+' Körper)');
// Einzelteil-Fenster (?datei=): Ablegen öffnet die Datei in diesem Fenster
const tb=path.resolve('testdaten/testbaugruppe.step');const e=await seite(`http://localhost:${port}/index.html?datei=${encodeURIComponent(tb)}`);
await e.waitForFunction(()=>window.__lastLoad&&window.__lastLoad.bodies>0,null,{timeout:90000});
const vor=await e.evaluate(()=>window.__lastLoad.name);
if(shot){await e.waitForTimeout(400);await e.screenshot({path:path.join(shot,'testbaugruppe-farben.png')})}
const nach=await oeffnen(e,'testdaten/farbbaugruppe.step');if(nach.name!=='farbbaugruppe.step'||nach.bodies!==3)fail('Ablegen im Einzelteil-Fenster: '+JSON.stringify(nach));
if(shot){await e.waitForTimeout(300);await e.screenshot({path:path.join(shot,'einzelteil-fenster-abgelegt.png')})}
console.log('  ok  Einzelteil-Fenster: Ablegen ersetzt',vor,'durch',nach.name);
if(errs.length)fail('Seitenfehler: '+errs.join(' | '));
await b.close();fs.rmSync(tmp,{recursive:true,force:true});console.log('OK: STEP-Farben (nativ) und Ablegen im Einzelteil-Fenster');
