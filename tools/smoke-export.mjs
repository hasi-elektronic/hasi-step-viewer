// Headless-Test: Biegetabelle als PDF und XLSX aus dem Blech-Panel (Wanne, CadQuery-Testteil). Screenshots in docs/.
import { chromium } from 'playwright-core';import fs from 'fs';import {execSync} from 'child_process';
for(const d of ['public','dist'])if(fs.existsSync(d))fs.copyFileSync('testdaten/wanne.step',d+'/wanne.step');
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900},acceptDownloads:true});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.env.URL||'http://localhost:4173/');await p.evaluate(()=>{document.querySelectorAll('#messenErweitert,#blechDetails').forEach(d=>d.open=true);if(document.getElementById('messenPanel').hidden)document.getElementById('btnMessen').click()});;const fail=m=>{throw new Error(m)};
await p.evaluate(()=>window.__loadUrl('./wanne.step'));await p.evaluate(()=>window.__app.tab('blech'));await p.waitForFunction(()=>window.__lastSheet);await p.waitForTimeout(300);
if(await p.isDisabled('#expPdf')||await p.isDisabled('#expXlsx'))fail('Export-Knöpfe gesperrt');
let dl=p.waitForEvent('download');await p.click('#expPdf');let d=await dl;let f='/tmp/hasi-export/'+d.suggestedFilename();await d.saveAs(f);
if(fs.readFileSync(f).subarray(0,5).toString()!=='%PDF-')fail('kein PDF');console.log('pdf',d.suggestedFilename(),fs.statSync(f).size);
const txt=execSync(`pdftotext -layout "${f}" -`).toString();if(!txt.includes('Stahl (7,85 g/cm³)')||!txt.includes('nach DIN 6935'))fail('PDF-Kopf');
try{execSync(`pdftoppm -r 80 -png -singlefile "${f}" docs/biegetabelle-pdf`)}catch{}
dl=p.waitForEvent('download');await p.click('#expXlsx');d=await dl;f='/tmp/hasi-export/'+d.suggestedFilename();await d.saveAs(f);
const z=fs.readFileSync(f);if(z[0]!==0x50||z[1]!==0x4b)fail('kein XLSX');console.log('xlsx',d.suggestedFilename(),z.length);
await p.locator('#expPdf').scrollIntoViewIfNeeded();await p.screenshot({path:'docs/biegetabelle-export.png'});
console.log('fehler',JSON.stringify(errs));await b.close();if(errs.length)process.exit(1);
