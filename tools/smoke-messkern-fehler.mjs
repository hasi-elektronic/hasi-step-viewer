import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage();let invalid=true;
  await page.route('**/ocjs/opencascade.wasm.wasm',route=>invalid
    ?route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html>Asset fehlt</html>'})
    :route.continue());
  await page.goto('http://localhost:'+(process.env.PORT||4173)+'/');
  await page.waitForFunction(()=>window.__call);
  const error=await page.evaluate(async()=>{try{await window.__call('init');return ''}catch(error){return error.message}});
  assert.match(error,/Messkern.*beschädigt/);
  assert(!error.includes('CompileError'));
  invalid=false;
  assert.equal(await page.evaluate(()=>window.__call('init')),true,'Messkern muss nach einem Ladefehler erneut gestartet werden können');
  await page.evaluate(()=>window.__loadUrl('./testblech.step'));
  const result=await page.evaluate(()=>window.__call('props',{ids:[0]}));
  assert(result.volume>0,'Geometrie nach erneutem Start nicht messbar');
  console.log('OK: ungültiges WASM verständlich gemeldet; erneutes Laden und geometrische Berechnung erfolgreich');
} finally { await browser.close(); }
