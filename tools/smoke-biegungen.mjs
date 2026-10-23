// Headless-Test Blech-Reiter: zwei Laschen auf derselben Biegelinie zählen als EINE Biegung (synthetisches Teil testdaten/zwei-laschen.step).
// Kurzwert „Biegungen 2 (3 Biegezonen)“, Tabelle und Biegenotizen mit gleicher Nummer. SHOT=… speichert ein Bildschirmfoto.
import { chromium } from 'playwright-core';import fs from 'fs';
const port=process.env.PORT||'4173',NAME='zwei-laschen.step';const fail=m=>{throw new Error(m)};const ok=m=>console.log('  ok  '+m);
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/'+NAME,r=>r.fulfill({status:200,body:fs.readFileSync('testdaten/'+NAME),headers:{'content-type':'application/octet-stream'}}));
await p.goto(`http://localhost:${port}/`);await p.evaluate(()=>{localStorage.clear()});await p.reload();await p.waitForFunction(()=>window.__app&&window.__loadUrl);
const A=(f,a)=>p.evaluate(f,a);
await A(n=>{window.__lastLoad=null;return window.__loadUrl('./'+n)},NAME);await p.waitForFunction(()=>window.__lastLoad&&window.__lastLoad.bodies>0,null,{timeout:180000});await p.waitForTimeout(800);
await A(async()=>{const a=window.__app;a.clearSel();await a.act('sheet',a.nodes()[0])});
await p.waitForFunction(()=>window.__lastSheet,null,{timeout:180000});await p.waitForTimeout(500);
const r=await A(()=>({info:document.getElementById('sheetinfo').innerText,nr:[...document.querySelectorAll('#bends table:not(.schenkel) tr td:first-child')].map(td=>td.textContent),
  notizen:[...document.querySelectorAll('#flatprev g.biegenotiz')].map(g=>g.dataset.nr),zonen:window.__lastSheet.bends.length,biegungen:window.__lastSheet.biegungen.length}));
if(!/Biegungen\s*2 \(3 Biegezonen\)/.test(r.info))fail('Kurzwert Biegungen: '+r.info);
if(r.zonen!==3||r.biegungen!==2)fail(`Zonen ${r.zonen}, Biegungen ${r.biegungen}`);
if(new Set(r.nr).size!==2||r.nr.length!==3)fail('Tabelle Nr.: '+r.nr.join(','));
if(r.notizen.length!==3||new Set(r.notizen).size!==2)fail('Biegenotizen: '+r.notizen.join(','));
if(errs.length)fail('Seitenfehler: '+errs.join(' | '));
ok(`Blech: „Biegungen 2 (3 Biegezonen)“, Tabelle Nr. ${r.nr.join('/')}, Biegenotizen ${r.notizen.map(n=>'B'+n).join('/')}`);
if(process.env.SHOT){await p.waitForTimeout(250);await p.screenshot({path:process.env.SHOT})}
await b.close();
