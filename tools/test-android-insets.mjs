// Native system UI acceptance on our isolated emulator after the full APK test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {connectAndroidWebView,PILOT_AVDS} from './android-webview.mjs';
const [serial,brand,runtimeFile]=process.argv.slice(2);
assert(serial?.startsWith('emulator-')&&['hasi','sickinger'].includes(brand));
const evidence=JSON.parse(fs.readFileSync(runtimeFile,'utf8')),out=path.dirname(path.resolve(runtimeFile));
const id=JSON.parse(fs.readFileSync('src-tauri/tauri.mobile-'+brand+'.conf.json','utf8')).identifier;
assert.equal(evidence.identifier,id);assert.equal(evidence.serial,serial);
const adb=path.join(process.env.ANDROID_HOME,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const call=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000}).trim();
const avdName=call('emu','avd','name').split(/\r?\n/)[0].trim();assert(PILOT_AVDS.includes(avdName));assert.equal(evidence.device,avdName);
const pageSize=Number(call('shell','getconf','PAGE_SIZE'));assert.equal(evidence.pageSize,pageSize);
const apk=call('shell','pm','path',id);assert(/^package:\/data\/app\/.+\/base\.apk$/.test(apk));
const installed=path.join(out,'insets-installed.apk');call('pull',apk.slice(8),installed);
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(installed)).digest('hex'),evidence.apkSha256);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sizeBefore=call('shell','wm','size'),rotationBefore=call('shell','settings','get','system','user_rotation'),autoBefore=call('shell','settings','get','system','accelerometer_rotation');
const navBefore=call('shell','cmd','overlay','list').split('\n').find(l=>/^\[x\] com\.android\.internal\.systemui\.navbar\./.test(l))?.slice(4).trim();assert(navBefore);
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
let browser,page,forwarded=false;const results=[];
try{
  const state=()=>page.evaluate(()=>({docs:window.__dokumente().map(d=>d.id),bodies:window.__app.data().inst.length,matrices:window.__app.matrizen(),dims:JSON.stringify(window.__app.dims())}));
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
    fs.writeFileSync(path.join(out,'latest-window-dump.txt'),dump);
    assert((call('shell','dumpsys','activity','activities').split('\n').find(l=>l.includes('topResumedActivity='))||'').includes(id+'/'),'App muss im Vordergrund sein');
    const display=dump.match(/Display: mDisplayId=0\b[\s\S]*?(?=Control map:)/)?.[0];assert(display,'Aktueller Default-Display-Insetzustand fehlt');
    for(const m of display.matchAll(/InsetsSource id=\w+ type=(statusBars|navigationBars|ime) frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\][^\r\n]*?\bvisible=(true|false)/g)){
      if(seen.has(m[1]))continue;seen.add(m[1]);if(m[6]!=='true')continue;
      const [left,top,right,bottom]=m.slice(2,6).map(Number);if(right<=left||bottom<=top)continue;
      assert(!(Math.min(b.right,right)>Math.max(b.left,left)&&Math.min(b.bottom,bottom)>Math.max(b.top,top)),JSON.stringify({b,type:m[1],left,top,right,bottom}));sources.push({type:m[1],left,top,right,bottom});
    }
    assert(sources.some(s=>s.type==='statusBars'));assert(sources.some(s=>s.type==='navigationBars'));
    const wm=call('shell','wm','size'),[width,height]=[...(wm.match(/Override size: (\d+)x(\d+)/)||wm.match(/Physical size: (\d+)x(\d+)/))].slice(1).map(Number);
    const available={left:0,top:0,right:width,bottom:height};
    for(const s of sources){
      if(s.right-s.left>=s.bottom-s.top){if(s.top===0)available.top=Math.max(available.top,s.bottom);if(s.bottom===height)available.bottom=Math.min(available.bottom,s.top)}
      else {if(s.left===0)available.left=Math.max(available.left,s.right);if(s.right===width)available.right=Math.min(available.right,s.left)}
    }
    for(const key of Object.keys(b))assert(Math.abs(b[key]-available[key])<=1,'WebView muss verfügbare Fläche genau einmal nutzen: '+JSON.stringify({b,available}));
    const convergenceStart=Date.now();
    // Native configuration changes and WebView layout arrive separately.
    // Require convergence to the exact native size; never relax the bounds.
    await page.waitForFunction(({width,height})=>Math.abs(innerWidth*devicePixelRatio-width)<=2&&Math.abs(innerHeight*devicePixelRatio-height)<=2,{width:b.right-b.left,height:b.bottom-b.top},{timeout:10000,polling:100});
    const viewport=await page.evaluate(()=>{
      const probe=document.createElement('div');probe.style.cssText='position:fixed;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';document.body.append(probe);
      const style=getComputedStyle(probe),safeArea=['Top','Right','Bottom','Left'].map(side=>parseFloat(style['padding'+side]));probe.remove();
      return {width:innerWidth,height:innerHeight,visualHeight:visualViewport.height,dpr:devicePixelRatio,safeArea};
    });
    fs.writeFileSync(path.join(out,'latest-viewport.json'),JSON.stringify({bounds:b,available,viewport,sources},null,2)+'\n');
    assert(Math.abs(viewport.width*viewport.dpr-(b.right-b.left))<=2,JSON.stringify({bounds:b,viewport}));assert(Math.abs(viewport.height*viewport.dpr-(b.bottom-b.top))<=2,'CSS layout viewport muss der nativen WebView folgen: '+JSON.stringify({bounds:b,viewport}));assert(viewport.safeArea.every(v=>v===0),'Bereits nativ verarbeitete Safe-Area darf CSS nicht erneut auffüllen');
    return {bounds:b,sources,available,viewport,convergenceMs:Date.now()-convergenceStart};
  };
  call('shell','settings','put','system','accelerometer_rotation','0');call('shell','settings','put','system','user_rotation','0');
  for(const navigation of ['gestural','threebutton']){
    if(browser){await browser.close();browser=undefined}if(forwarded){call('forward','--remove','tcp:'+port);forwarded=false}
    // Changing Android resource overlays may recreate Activities. Test each
    // navigation mode in its own launch, not through a stale WebView target.
    call('shell','am','force-stop',id);
    call('shell','cmd','overlay','enable-exclusive','--category','com.android.internal.systemui.navbar.'+navigation);await wait(1200);
    assert(call('shell','cmd','overlay','list').includes('[x] com.android.internal.systemui.navbar.'+navigation));
    call('shell','wm','size','1280x800');call('shell','am','start','-n',id+'/.MainActivity');
    let socket;for(let i=0;i<60;i++){try{const pid=call('shell','pidof',id);socket=call('shell','cat','/proc/net/unix').split('\n').find(l=>l.includes('@webview_devtools_remote_'+pid))?.split('@')[1]?.trim()}catch{}if(socket)break;await wait(500)}assert(socket);
    call('forward','tcp:'+port,'localabstract:'+socket);forwarded=true;
    const connected=await connectAndroidWebView('http://127.0.0.1:'+port,id);browser=connected.browser;page=connected.page;page.setDefaultTimeout(15000);
    await page.waitForFunction(()=>window.__app);assert.equal(new URL(page.url()).hostname,'tauri.localhost');
    // Layout fixture setup only. Actual Android picker/content-URI import is
    // independently covered by test-android-pilot on this exact APK hash.
    await page.locator('#file').setInputFiles({name:'messteil.step',mimeType:'application/octet-stream',buffer:fs.readFileSync('testdaten/messteil.step')});
    await page.waitForFunction(()=>window.__app.data()&&window.__app.animFertig(),null,{timeout:60000});
    await page.locator('#btnMessen').click();await page.locator('#messart').selectOption('auto');
    const edge=await page.evaluate(()=>window.__app.data().uniq[0].edges.findIndex(e=>e.type==='Gerade'&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-95)<1e-5));assert(edge>=0);
    let xy;
    for(const view of ['iso','unten','oben','vorne','hinten','rechts','links']){
      await page.evaluate(v=>window.__app.ansicht(v),view);await page.waitForFunction(()=>window.__app.animFertig());
      xy=await page.evaluate(id=>{const a=window.__app,e=a.data().uniq[0].edges[id];for(const t of [.2,.35,.5,.65,.8]){const p=e.pts[0].map((x,i)=>x+(e.pts.at(-1)[i]-x)*t),xy=a.screenOf(p),hit=a.pickAt(...xy);if(hit?.k==='edge'&&hit.id===id&&document.elementFromPoint(...xy)?.id==='buehne')return xy}return null},edge);if(xy)break;
    }assert(xy,'Echter 95-mm-Kantenfangpunkt fehlt');
    const touch=await browser.contexts()[0].newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:xy[0],y:xy[1],radiusX:2,radiusY:2,force:1}]});await wait(80);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>window.__lastMeasure?.rows?.some(r=>r[2]==='L'&&Math.abs(r[1]-95)<1e-6));await page.locator('#keepDim').click();assert.equal(await page.evaluate(()=>window.__app.dims().length),1);
    const saved=await state();
    for(const size of ['1280x800','800x1280']){
      call('shell','wm','size',size);await wait(1200);await page.waitForFunction(()=>window.__app.animFertig());
      const name='native-'+navigation+'-'+size,layout=await checkBounds();
      const wasHidden=await page.locator('#messenPanel').evaluate(el=>el.hidden);await nativeTap('#btnMessen');await page.waitForFunction(hidden=>document.getElementById('messenPanel').hidden!==hidden,wasHidden);await nativeTap('#btnMessen');
      await nativeTap('label:has(#file)');let resumed='';
      for(let i=0;i<20;i++){resumed=call('shell','dumpsys','activity','activities').split('\n').find(l=>l.includes('topResumedActivity='))||'';if(/com\.(?:google\.android|android)\.documentsui\//.test(resumed))break;await wait(200)}
      assert(/com\.(?:google\.android|android)\.documentsui\//.test(resumed),'Native Open muss Systempicker in den Vordergrund bringen');
      for(let i=0;i<8;i++){call('shell','input','keyevent','KEYCODE_BACK');await wait(250);resumed=call('shell','dumpsys','activity','activities').split('\n').find(l=>l.includes('topResumedActivity='))||'';if(resumed.includes(id+'/'))break}assert(resumed.includes(id+'/'));
      await nativeTap('#touchBaum');await page.waitForFunction(()=>!document.getElementById('baum').classList.contains('zu'));await nativeTap('#treeSearch');
      for(let i=0;i<20;i++){if(/mInputShown=true/.test(call('shell','dumpsys','input_method')))break;await wait(200)}assert(/mInputShown=true/.test(call('shell','dumpsys','input_method')),'Native Tap muss IME öffnen');
      await wait(500);const keyboard=await checkBounds();assert(keyboard.sources.some(s=>s.type==='ime'),'Sichtbare IME-Inset fehlt');assert(keyboard.bounds.bottom<layout.bounds.bottom);assert(keyboard.viewport.height<layout.viewport.height,'IME muss CSS viewport wirklich verkleinern');capture(name+'-keyboard');
      call('shell','input','keyevent','KEYCODE_BACK');await wait(700);await checkBounds();await nativeTap('#touchBaum');await page.waitForFunction(()=>!!document.getElementById('baum').classList.contains('zu'));
      const after=await checkBounds();assert.deepEqual(after.bounds,layout.bounds,'Kein bleibendes Keyboard-Padding');assert.equal(after.viewport.height,layout.viewport.height);assert.deepEqual(await state(),saved);capture(name);results.push({navigation,size,layout,keyboard,after,nativeOpen:true,nativeMeasure:true,keptDimensions:JSON.parse(saved.dims).length,bodyCount:saved.bodies});
    }
  }
  fs.writeFileSync(path.join(out,'insets.json'),JSON.stringify({brand,source:evidence.source,apkSha256:evidence.apkSha256,device:avdName,pageSize,fixtureSetup:'CDP File payload for layout only; real picker import tested separately',launches:'one isolated Activity launch per navigation mode',results},null,2)+'\n');console.log('OK: native Android taps/insets, two orientations, two navigation modes, IME roundtrip');
}catch(error){
  fs.writeFileSync(path.join(out,'insets-failure-native.png'),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true,maxBuffer:16*1024*1024,timeout:30000}));
  throw error;
}finally{
  if(/mInputShown=true/.test(call('shell','dumpsys','input_method')))call('shell','input','keyevent','KEYCODE_BACK');
  call('shell','am','force-stop',id);
  call('shell','cmd','overlay','enable-exclusive','--category',navBefore);
  const size=sizeBefore.match(/Override size: (\d+x\d+)/)?.[1]||'reset';call('shell','wm','size',size);
  for(const [key,value] of [['user_rotation',rotationBefore],['accelerometer_rotation',autoBefore]]){if(value==='null')call('shell','settings','delete','system',key);else call('shell','settings','put','system',key,value)}
  if(browser)await browser.close();if(forwarded)call('forward','--remove','tcp:'+port);
}
