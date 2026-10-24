import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

export const PILOT_AVDS=Object.freeze(['Hasi3D_Pilot_Tablet','Hasi3D_Pilot_16K','Hasi3D_Pilot_16K_A15']);

// Android can publish the debug socket before its page target. Discover the
// actual app page before Playwright attaches; never retry a running test flow.
export async function connectAndroidWebView(endpoint,identifier) {
  const start=Date.now(),deadline=start+60000;let attempts=0;
  while(Date.now()<deadline){
    let version,targets;
    try{
      [version,targets]=await Promise.all(['json/version','json/list'].map(async suffix=>{
        const response=await fetch(endpoint+'/'+suffix,{signal:AbortSignal.timeout(2000)});assert(response.ok);return response.json();
      }));
    }catch{await new Promise(r=>setTimeout(r,100));continue}
    assert.equal(version['Android-Package'],identifier,'Falscher Android-WebView-Prozess');
    const appPage=targets.find(t=>t.type==='page'&&t.url.startsWith('http://tauri.localhost/'));
    if(!appPage){await new Promise(r=>setTimeout(r,100));continue}
    const remaining=deadline-Date.now();if(remaining<=0)break;
    attempts++;
    const browser=await chromium.connectOverCDP(endpoint,{noDefaults:true,timeout:Math.min(10000,remaining)});
    const context=browser.contexts().find(c=>c.pages().some(p=>p.url().startsWith('http://tauri.localhost/')));
    const page=context?.pages().find(p=>p.url().startsWith('http://tauri.localhost/'));
    if(page)return {browser,context,page,attach:{waitMs:Date.now()-start,attempts}};
    await browser.close();await new Promise(r=>setTimeout(r,100));
  }
  throw Error('Android-App-Seite wurde innerhalb von 60 s nicht veröffentlicht');
}
