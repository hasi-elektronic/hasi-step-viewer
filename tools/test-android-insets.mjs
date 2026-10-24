// Native system UI acceptance on our isolated emulator after the full APK test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const [serial,brand,runtimeFile]=process.argv.slice(2);
assert(serial?.startsWith('emulator-')&&['hasi','sickinger'].includes(brand));
const evidence=JSON.parse(fs.readFileSync(runtimeFile,'utf8')),out=path.dirname(path.resolve(runtimeFile));
const id=JSON.parse(fs.readFileSync('src-tauri/tauri.mobile-'+brand+'.conf.json','utf8')).identifier;
assert.equal(evidence.identifier,id);assert.equal(evidence.serial,serial);
const adb=path.join(process.env.ANDROID_HOME,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const call=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000}).trim();
assert.equal(call('emu','avd','name').split(/\r?\n/)[0].trim(),'Hasi3D_Pilot_Tablet');
const apk=call('shell','pm','path',id);assert(/^package:\/data\/app\/.+\/base\.apk$/.test(apk));
const installed=path.join(out,'insets-installed.apk');call('pull',apk.slice(8),installed);
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(installed)).digest('hex'),evidence.apkSha256);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sizeBefore=call('shell','wm','size'),rotationBefore=call('shell','settings','get','system','user_rotation'),autoBefore=call('shell','settings','get','system','accelerometer_rotation');
const navBefore=call('shell','cmd','overlay','list').split('\n').find(l=>/^\[x\] com\.android\.internal\.systemui\.navbar\./.test(l))?.slice(4).trim();assert(navBefore);
const pid=call('shell','pidof',id),socket=call('shell','cat','/proc/net/unix').split('\n').find(l=>l.includes('@webview_devtools_remote_'+pid))?.split('@')[1]?.trim();assert(socket);
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));call('forward','tcp:'+port,'localabstract:'+socket);
let browser;const results=[];
try{
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{noDefaults:true});const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(15000);
  assert.equal(new URL(page.url()).hostname,'tauri.localhost');assert(await page.evaluate(()=>window.__app?.data()));
  const state=()=>page.evaluate(()=>({docs:window.__dokumente().map(d=>d.id),dims:JSON.stringify(window.__app.dims())})),saved=await state();
  const rect=selector=>page.locator(selector).boundingBox();
  const bounds=async()=>{
    call('shell','uiautomator','dump','/data/local/tmp/hasi-insets-ui.xml');const xml=call('shell','cat','/data/local/tmp/hasi-insets-ui.xml');
    const node=[...xml.matchAll(/<node\b([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]))).find(n=>n.class==='android.webkit.WebView');assert(node,'Native WebView bounds fehlen');
    const [left,top,right,bottom]=[...node.bounds.matchAll(/\d+/g)].map(m=>Number(m[0]));return {left,top,right,bottom};
  };
  const nativeTap=async selector=>{
    const b=await bounds(),r=await rect(selector),v=await page.evaluate(()=>({w:innerWidth,h:innerHeight}));assert(r&&r.width&&r.height);
    const x=b.left+(r.x+r.width/2)*(b.right-b.left)/v.w,y=b.top+(r.y+r.height/2)*(b.bottom-b.top)/v.h;
    call('shell','input','tap',String(Math.round(x)),String(Math.round(y)));await wait(400);
  };
  const capture=name=>fs.writeFileSync(path.join(out,name+'.png'),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true,maxBuffer:16*1024*1024,timeout:30000}));
  const checkBounds=async()=>{
    const b=await bounds(),dump=call('shell','dumpsys','window'),seen=new Set(),sources=[];
    for(const m of dump.matchAll(/InsetsSource id=\w+ type=(statusBars|navigationBars|ime) frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\] visible=(true|false)/g)){
      if(seen.has(m[1]))continue;seen.add(m[1]);if(m[6]!=='true')continue;
      const [left,top,right,bottom]=m.slice(2,6).map(Number);if(right<=left||bottom<=top)continue;
      assert(!(Math.min(b.right,right)>Math.max(b.left,left)&&Math.min(b.bottom,bottom)>Math.max(b.top,top)),JSON.stringify({b,type:m[1],left,top,right,bottom}));sources.push({type:m[1],left,top,right,bottom});
    }
    assert(sources.some(s=>s.type==='statusBars'));assert(sources.some(s=>s.type==='navigationBars'));return {bounds:b,sources};
  };
  call('shell','settings','put','system','accelerometer_rotation','0');call('shell','settings','put','system','user_rotation','0');
  for(const navigation of ['gestural','threebutton']){
    call('shell','cmd','overlay','enable-exclusive','--category','com.android.internal.systemui.navbar.'+navigation);await wait(1200);
    for(const size of ['1280x800','800x1280']){
      call('shell','wm','size',size);await wait(1200);await page.waitForFunction(()=>window.__app.animFertig());
      const name='native-'+navigation+'-'+size,layout=await checkBounds();
      const wasHidden=await page.locator('#messenPanel').evaluate(el=>el.hidden);await nativeTap('#btnMessen');await page.waitForFunction(hidden=>document.getElementById('messenPanel').hidden!==hidden,wasHidden);await nativeTap('#btnMessen');
      await nativeTap('label:has(#file)');let resumed=call('shell','dumpsys','activity','activities');assert(resumed.includes('com.google.android.documentsui')||resumed.includes('com.android.documentsui'),'Native Open muss Systempicker öffnen');
      for(let i=0;i<8;i++){call('shell','input','keyevent','KEYCODE_BACK');await wait(250);resumed=call('shell','dumpsys','activity','activities').split('\n').find(l=>l.includes('topResumedActivity='))||'';if(resumed.includes(id+'/'))break}assert(resumed.includes(id+'/'));
      await nativeTap('#touchBaum');await page.waitForFunction(()=>!document.getElementById('baum').classList.contains('zu'));await nativeTap('#treeSearch');
      for(let i=0;i<20;i++){if(/mInputShown=true/.test(call('shell','dumpsys','input_method')))break;await wait(200)}assert(/mInputShown=true/.test(call('shell','dumpsys','input_method')),'Native Tap muss IME öffnen');
      await wait(500);const keyboard=await checkBounds();assert(keyboard.sources.some(s=>s.type==='ime'),'Sichtbare IME-Inset fehlt');capture(name+'-keyboard');
      call('shell','input','keyevent','KEYCODE_BACK');await wait(700);await checkBounds();await nativeTap('#touchBaum');await page.waitForFunction(()=>!!document.getElementById('baum').classList.contains('zu'));
      const after=await checkBounds();assert.deepEqual(after.bounds,layout.bounds,'Kein bleibendes Keyboard-Padding');assert.deepEqual(await state(),saved);capture(name);results.push({navigation,size,layout,keyboard,after,nativeOpen:true,nativeMeasure:true});
    }
  }
  fs.writeFileSync(path.join(out,'insets.json'),JSON.stringify({brand,source:evidence.source,apkSha256:evidence.apkSha256,results},null,2)+'\n');console.log('OK: native Android taps/insets, two orientations, two navigation modes, IME roundtrip');
}finally{
  call('shell','input','keyevent','KEYCODE_BACK');call('shell','cmd','overlay','enable-exclusive','--category',navBefore);
  const size=sizeBefore.match(/Override size: (\d+x\d+)/)?.[1]||'reset';call('shell','wm','size',size);
  for(const [key,value] of [['user_rotation',rotationBefore],['accelerometer_rotation',autoBefore]]){if(value==='null')call('shell','settings','delete','system',key);else call('shell','settings','put','system',key,value)}
  if(browser)await browser.close();call('forward','--remove','tcp:'+port);
}
