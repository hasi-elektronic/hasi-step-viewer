// Headless-Test: Testblech in cm laden, Anzeige muss überall mm sein. Screenshot: docs/einheit-cm.png
import { chromium } from 'playwright-core';import fs from 'fs';
for(const d of ['public','dist'])if(fs.existsSync(d))fs.copyFileSync('testdaten/testblech-cm.step',d+'/testblech-cm.step');
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.env.URL||'http://localhost:4173/');
await p.evaluate(()=>window.__loadUrl('./testblech-cm.step'));
const st=await p.textContent('#status');console.log('status',st);if(!st.includes('Datei: cm → Anzeige: mm'))throw new Error('Statusleiste ohne Einheiten-Info');
const mi=await p.textContent('#modelinfo');console.log('modell',mi);if(!/108,000 mm/.test(mi)||/ cm/.test(mi))throw new Error('Bounding-Box nicht in mm');
await p.evaluate(async()=>{const d=window.__app.data();const i=d.uniq[0].faces.findIndex(f=>f.type==='zylindrisch');await window.__app.select({k:'face',id:i,inst:0})});
const ms=JSON.stringify(await p.evaluate(()=>window.__lastMeasure.rows));console.log('messen',ms);if(/cm/.test(ms))throw new Error('Messen nicht in mm');
await p.evaluate(()=>{window.__app.clearSel();window.__app.tab('blech')});await p.waitForFunction(()=>window.__lastSheet);await p.waitForTimeout(400);
const sh=await p.textContent('#sheetinfo')+await p.textContent('#bends');console.log('blech',sh.slice(0,400));if(/ cm/.test(sh)||!/2,000 mm/.test(sh))throw new Error('Blech nicht in mm');
await p.screenshot({path:'docs/einheit-cm.png'});
console.log('fehler',JSON.stringify(errs));await b.close();if(errs.length)process.exit(1);
