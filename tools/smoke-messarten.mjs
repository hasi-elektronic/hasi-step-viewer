import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {checkMessartenUi} from './check-messarten-ui.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const Original=window.Worker;
    window.Worker=class extends Original{
      gehalten=new Set();
      postMessage(data,...rest){if(data.cmd==='measure'&&window.__testMessHalteNaechste){this.gehalten.add(data.id);window.__testMessHalteNaechste=false}return super.postMessage(data,...rest)}
      set onmessage(fn){super.onmessage=e=>{if(this.gehalten.delete(e.data.id))window.__testMessAntwortFreigeben=()=>{window.__testMessAntwortFreigeben=null;fn(e)};else fn(e)}}
    };
  });
  await page.route('**/messteil.step',r=>r.fulfill({body:fs.readFileSync('testdaten/messteil.step'),contentType:'application/octet-stream'}));
  await page.goto(process.env.URL||'http://localhost:4173/');await page.waitForFunction(()=>window.__app);
  await page.evaluate(()=>window.__loadUrl('./messteil.step'));await page.waitForFunction(()=>window.__app.animFertig());
  const result=await checkMessartenUi(page);
  await page.evaluate(async()=>{
    const a=window.__app;await a.messartSetzen('radius');
    const id=a.data().uniq[0].edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-6);
    window.__testMessHalteNaechste=true;window.__testMessAlt=a.select({k:'edge',id,inst:0});
  });await page.waitForFunction(()=>typeof window.__testMessAntwortFreigeben==='function');
  await page.selectOption('#messart','durchmesser');await page.waitForFunction(()=>window.__lastMeasure?.messart==='durchmesser');
  const race=await page.evaluate(async()=>{window.__testMessAntwortFreigeben();await window.__testMessAlt;return {r:window.__lastMeasure,ui:window.__app.ergebnis()}});
  assert.equal(race.r.messart,'durchmesser');assert(race.ui.startsWith('Durchmesser Ø: 10,000 mm'),race.ui);
  await page.evaluate(()=>{window.__testMessHalteNaechste=true;window.__testMessAlt=window.__app.neuMessen()});await page.waitForFunction(()=>typeof window.__testMessAntwortFreigeben==='function');
  await page.evaluate(async()=>{window.__app.clearSel();window.__testMessAntwortFreigeben();await window.__testMessAlt});
  assert.equal(await page.evaluate(()=>window.__lastMeasure),null,'Esc/Leeren muss verspätete Antwort ignorieren');
  // Kleine Seitenleiste: Messart und Ergebnis sind erreichbar, keine horizontale Überbreite.
  await page.setViewportSize({width:1000,height:700});
  assert(await page.locator('#messart').isVisible());
  assert(await page.locator('#messenPanel').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  if(process.env.SHOT){
    await page.evaluate(async()=>{const a=window.__app;await a.messartSetzen('bogen');a.ansicht('iso');const id=a.data().uniq[0].edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-6&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-5*Math.SQRT2)<1e-5);await a.select({k:'edge',id,inst:0})});
    await page.waitForFunction(()=>window.__app.animFertig());fs.mkdirSync(path.dirname(process.env.SHOT),{recursive:true});await page.screenshot({path:process.env.SHOT});
  }
  assert.deepEqual(errors,[]);console.log('OK: Messarten UI '+JSON.stringify(result));
}finally{await browser.close()}
