// Nur eigene, explizit benannte Emulatorinstanz; keine Benutzer-App/-Dateien.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const [serial,brand,apk]=process.argv.slice(2);assert(serial?.startsWith('emulator-')&&['hasi','sickinger'].includes(brand));assert(apk&&fs.statSync(apk).isFile(),'Zu prüfende installierte APK angeben');assert(/^[a-f0-9]{40}$/.test(process.env.EXPECTED_SOURCE||''),'Exakten CI-Quellcommit als EXPECTED_SOURCE angeben');
const config=JSON.parse(fs.readFileSync('src-tauri/tauri.mobile-'+brand+'.conf.json','utf8')),id=config.identifier;
const sdk=process.env.ANDROID_HOME;assert(sdk);const adb=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const call=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000}).trim();
assert.equal(call('emu','avd','name').split(/\r?\n/)[0].trim(),'Hasi3D_Pilot_Tablet','Nur eigenen Pilot-Emulator verwenden');
const out=path.resolve(process.env.ANDROID_TEST_OUT||'output/android-runtime-'+brand);fs.mkdirSync(out,{recursive:true});
const installed=call('shell','pm','path',id).split(/\r?\n/);assert.equal(installed.length,1,'Nur eigenständige APK erwartet');assert(installed[0].startsWith('package:/data/app/')&&installed[0].endsWith('/base.apk'));
const installedCopy=path.join(out,'installed.apk');call('pull',installed[0].slice(8),installedCopy);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),apkSha256=sha(fs.readFileSync(apk));assert.equal(sha(fs.readFileSync(installedCopy)),apkSha256,'Installierte APK weicht vom CI-Artefakt ab');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
call('shell','mkdir','-p','/sdcard/Download/Hasi3D-Pilot');
for(const file of ['messteil.step','messbaugruppe.step'])call('push','testdaten/'+file,'/sdcard/Download/Hasi3D-Pilot/'+file);
fs.writeFileSync(path.join(out,'kaputt.step'),'invalid STEP');call('push',path.join(out,'kaputt.step'),'/sdcard/Download/Hasi3D-Pilot/kaputt.step');
call('shell','svc','wifi','disable');call('shell','svc','data','disable');
call('shell','am','force-stop',id);call('shell','am','start','-n',id+'/.MainActivity');
let socket;for(let i=0;i<60;i++){try{const pid=call('shell','pidof',id).trim();socket=call('shell','cat','/proc/net/unix').split('\n').find(l=>l.includes('@webview_devtools_remote_'+pid))?.split('@')[1]?.trim()}catch{}if(socket)break;await pause(500)}assert(socket,'App-WebView nicht erreichbar');
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));call('forward','tcp:'+port,'localabstract:'+socket);
let browser;
try{
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{noDefaults:true});const context=browser.contexts()[0],page=context.pages()[0],errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>window.__app);assert.equal(new URL(page.url()).hostname,'tauri.localhost');
  assert.equal(await page.evaluate(()=>window.__hostCapabilities.platform),'android');assert.equal(await page.evaluate(()=>window.__hostCapabilities.desktopBackend),false);
  const ui=async()=>{
    for(let i=0;i<10;i++){try{call('shell','uiautomator','dump','/data/local/tmp/hasi-pilot-ui.xml');const xml=call('shell','cat','/data/local/tmp/hasi-pilot-ui.xml');fs.writeFileSync(path.join(out,'picker.xml'),xml);return [...xml.matchAll(/<node\b([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])))}catch{await pause(300)}}throw Error('Keine Android-UI-Hierarchie');
  };
  const nativeTap=async(text,description=false)=>{
    const nodes=await ui(),node=nodes.find(n=>n[description?'content-desc':'text']===text&&n.enabled==='true');assert(node,'Android-Dateiauswahl: '+text);
    const b=[...node.bounds.matchAll(/\d+/g)].map(m=>Number(m[0]));call('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));await pause(250);
  };
  const choose=async file=>{
    await page.locator('label:has(#file)').click();await nativeTap('Show roots',true);
    // ExternalStorageProvider zeigt auch nicht indizierte STEP-MIME-Dateien.
    await nativeTap(call('shell','getprop','ro.product.model'));await nativeTap('Download');await nativeTap('Hasi3D-Pilot');await nativeTap(file);
  };
  const open=async(file,count)=>{
    await choose(file);
    await page.waitForFunction(count=>window.__dokumente().length===count&&window.__app.data()&&!document.getElementById('dokumentAnsicht').inert,count);await page.waitForFunction(()=>window.__app.animFertig());
  };
  await open('messteil.step',1);await page.locator('#btnMessen').click();
  const cdp=await context.newCDPSession(page),send=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});await pause(80)};
  const references=await page.evaluate(()=>{const edges=window.__app.data().uniq[0].edges;return [
    edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-6&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-5*Math.SQRT2)<1e-5),
    edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-6&&Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))<1e-5),
    edges.findIndex(e=>e.type==='Gerade'&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-95)<1e-5)]});
  for(let i=0;i<references.length;i++){
    await page.evaluate(()=>window.__app.clearSel());let xy;
    for(const view of ['iso','unten','oben','vorne','hinten','rechts','links']){
      await page.evaluate(v=>window.__app.ansicht(v),view);await page.waitForFunction(()=>window.__app.animFertig());
      xy=await page.evaluate(id=>{const a=window.__app,e=a.data().uniq[0].edges[id],pts=e.pts.length>2?e.pts.slice(1,-1):[.2,.35,.5,.65,.8].map(t=>e.pts[0].map((x,i)=>x+(e.pts[1][i]-x)*t));for(const p of pts){const xy=a.screenOf(p),hit=a.pickAt(...xy);if(hit?.k==='edge'&&hit.id===id&&document.elementFromPoint(...xy)?.id==='buehne')return xy}return null},references[i]);if(xy)break;
    }assert(xy,'Kein echter Fangpunkt');await send('touchStart',[[1,...xy]]);await send('touchEnd',[]);
    await page.waitForFunction(()=>window.__lastMeasure?.rows?.some(r=>r[2]==='L'));const value=await page.evaluate(()=>window.__lastMeasure.rows.find(r=>r[2]==='L')[1]);assert(Math.abs(value-[5,10,95][i])<1e-6);
  }
  await page.locator('#keepDim').click();assert.equal(await page.evaluate(()=>window.__app.dims().length),1);
  const before=await page.evaluate(()=>window.__steuerung()),matrix=await page.evaluate(()=>window.__app.matrizen()),r=await page.locator('#buehne').boundingBox(),x=r.x+r.width*.82,y=r.y+r.height*.82;
  await send('touchStart',[[1,x,y]]);await send('touchMove',[[1,x+40,y+30]]);await send('touchEnd',[]);assert.notDeepEqual((await page.evaluate(()=>window.__steuerung())).pos,before.pos);
  const after=await page.evaluate(()=>window.__steuerung());await send('touchStart',[[1,x-30,y],[2,x+30,y]]);await send('touchMove',[[1,x-60,y+10],[2,x+60,y+10]]);await send('touchEnd',[]);
  const zoom=await page.evaluate(()=>window.__steuerung()),distance=s=>Math.hypot(...s.pos.map((v,i)=>v-s.ziel[i]));assert(distance(zoom)<distance(after)*.8,JSON.stringify({after,zoom,rect:r,x,y,labels:await page.evaluate(()=>window.__app.dimLabels())}));assert.deepEqual(await page.evaluate(()=>window.__app.matrizen()),matrix);
  const sessionState=()=>page.evaluate(()=>({sels:window.__app.sels(),dims:JSON.stringify(window.__app.dims()),r:window.__lastMeasure}));
  const saved=await sessionState();await send('touchStart',[[1,x-30,y],[2,x+30,y]]);await send('touchCancel',[]);assert.deepEqual(await sessionState(),saved);
  // Ein gegriffenes Label bleibt bei zusätzlichem Finger und Cancel unverändert.
  const label=await page.evaluate(()=>window.__app.dimLabels()[0][0]),p=[label[0]+r.x,label[1]+r.y];assert.equal(await page.evaluate(p=>document.elementFromPoint(...p)?.id,p),'buehne');
  await send('touchStart',[[1,...p]]);await send('touchStart',[[1,...p],[2,x,y]]);await send('touchMove',[[1,p[0]+15,p[1]+15],[2,x+20,y]]);await send('touchCancel',[]);assert.deepEqual(await sessionState(),saved);
  const wasm=await page.evaluate(async()=>{const bytes=await(await fetch('./ocjs/opencascade.wasm.wasm')).arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);return {bytes:bytes.byteLength,magic:[...new Uint8Array(bytes,0,8)],sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}});
  const source=fs.readFileSync('public/ocjs/opencascade.wasm.wasm');assert.equal(wasm.sha256,crypto.createHash('sha256').update(source).digest('hex'));assert.deepEqual(wasm.magic,[0,97,115,109,1,0,0,0]);
  // Echter Android-Pickerabbruch und defekte Datei erhalten das offene Dokument.
  await page.locator('label:has(#file)').click();await ui();call('shell','input','keyevent','KEYCODE_BACK');await pause(300);assert.deepEqual(await sessionState(),saved);
  await choose('kaputt.step');await page.waitForFunction(()=>!document.getElementById('dokumentAnsicht').inert&&!document.getElementById('status').textContent.startsWith('Lade '));assert.equal(await page.evaluate(()=>window.__dokumente().length),1);assert(await page.locator('#status').isVisible());assert.deepEqual(await sessionState(),saved);
  await open('messbaugruppe.step',2);
  // Sichtbarkeit und Isolieren über die tatsächlichen Touch-Baumschaltflächen.
  await page.locator('#touchBaum').click();const node=await page.evaluate(()=>window.__app.nodes().find(n=>n.all.length===1)),row=page.locator(`.trow[data-id="${node.id}"]`),vis=await page.evaluate(()=>window.__app.vis());
  await row.locator('input[type=checkbox]').click();assert.equal(await page.evaluate(i=>window.__app.vis()[i],node.all[0]),false);await row.locator('input[type=checkbox]').click();assert.deepEqual(await page.evaluate(()=>window.__app.vis()),vis);
  await row.locator('.tree-more').click();assert(await page.locator('#ctx [data-a="move"]').isDisabled());assert(await page.locator('#ctx [data-a="sheet"]').isDisabled());await page.locator('#ctx [data-a="isolate"]').click();assert.equal((await page.evaluate(()=>window.__app.vis())).filter(Boolean).length,1);
  await row.locator('.tree-more').click();await page.locator('#ctx [data-a="isoEnde"]').click();assert.deepEqual(await page.evaluate(()=>window.__app.vis()),vis);await page.locator('#touchBaum').click();
  const docs=await page.evaluate(()=>window.__dokumente());await page.evaluate(id=>window.__dokumentAktivieren(id),docs[0].id);assert.equal(await page.evaluate(()=>window.__app.dims().length),1);
  assert(await page.locator('#dimSpeichern').isDisabled());assert.deepEqual(errors,[]);
  const urls=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));assert(urls.every(u=>u.startsWith('http://tauri.localhost/')||u.startsWith('http://ipc.localhost/')||u.startsWith('data:')),'Externe App-Ressource');
  await page.screenshot({path:path.join(out,'apk.png')});fs.writeFileSync(path.join(out,'runtime.json'),JSON.stringify({brand,identifier:id,serial,source:process.env.EXPECTED_SOURCE,apkSha256,device:'Hasi3D_Pilot_Tablet',offline:true,scope:'x86_64 emulator, not physical ARM64',systemPicker:true,pickerCancel:true,badFileIsolation:true,visibility:true,isolate:true,gestureCancel:true,labelCancel:true,measurements:[5,10,95],tabs:2,wasm,urls,errors},null,2)+'\n');console.log('OK: echte Android-APK offline, Systempicker/content URI, Auto R5/Ø10/L95, Touch/Cancel, Sichtbarkeit/Isolieren, Dateifehler, Sekmen, WASM-SHA256');
}finally{if(browser)await browser.close();call('forward','--remove','tcp:'+port)}
