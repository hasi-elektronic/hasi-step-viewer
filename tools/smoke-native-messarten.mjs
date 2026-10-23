// Echter nativer Import/BREP mit kontrolliert verzögertem Desktop-Transport im Browser.
// Dies ist kein OS-/WebView2-Pakettest.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {checkMessartenUi} from './check-messarten-ui.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hasi-messen-native-'));
const exe=process.env.HASI_KERN||path.resolve('kern/build/hasi-kern'+(process.platform==='win32'?'.exe':''));
let browser;
try{
  execFileSync(exe,[path.resolve('testdaten/messteil.step'),dir],{stdio:'pipe',windowsHide:true});
  const files={step:fs.readFileSync('testdaten/messteil.step'),bin:fs.readFileSync(path.join(dir,'modell.bin')),brep:fs.readFileSync(path.join(dir,'modell.brep'))};
  browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome'});
  const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__messdaten/*',route=>route.fulfill({body:files[new URL(route.request().url()).pathname.split('/').at(-1)],contentType:'application/octet-stream'}));
  await page.addInitScript(()=>{
    const gate=new Promise(r=>window.__testAttachFreigeben=r);
    window.__TAURI_INTERNALS__={transformCallback:()=>0,invoke:async cmd=>{if(cmd==='dokumente_zuruecksetzen'||cmd==='dokument_schliessen')return true;if(cmd==='dokument_neu')return 'mock-'+Math.random();
      if(cmd==='plugin:event|listen')return 0;if(cmd==='start_pfad')return null;if(cmd==='kern_verfuegbar')return true;
      const file={datei_lesen:'step',kern_laden_pfad:'bin',kern_brep:'brep'}[cmd];if(!file)throw new Error(cmd);
      if(cmd==='kern_brep'){window.__testAttachWartet=true;await gate}
      const r=await fetch('/__messdaten/'+file);return file==='brep'?new TextDecoder('latin1').decode(await r.arrayBuffer()):r.arrayBuffer();
    }};
  });
  await page.goto(process.env.URL||'http://localhost:4173/');await page.waitForFunction(()=>window.__app);
  await page.evaluate(()=>{window.__testOeffnen=window.__oeffnePfad('synthetisch.step')});
  await page.waitForFunction(()=>window.__lastLoad?.kern==='nativ'&&window.__testAttachWartet);
  await page.evaluate(()=>{document.getElementById('btnMessen').click();window.__app.messartSetzen('radius');const id=window.__app.data().uniq[0].edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-6);window.__testFrueheMessung=window.__app.select({k:'edge',id,inst:0})});
  assert.equal(await page.locator('#ergebnis').getAttribute('aria-busy'),'true');
  assert.equal(await page.evaluate(()=>window.__lastMeasure),null,'Vor BREP keine erfundene Messung');
  await page.evaluate(async()=>{window.__testAttachFreigeben();await window.__testOeffnen;await window.__testFrueheMessung});
  const early=await page.evaluate(()=>window.__lastMeasure);assert.equal(early.bereit,true);assert(Math.abs(early.label[1]-5)<1e-6);
  const result=await checkMessartenUi(page);assert.deepEqual(errors,[]);
  console.log('OK: Native Messarten, erste Auswahl vor BREP attach bleibt erhalten '+JSON.stringify(result));
}finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
