// Echte Chromium-Touchereignisse, echter lokaler WASM-Kern, keine CAD-Mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const out=path.resolve(process.env.TOUCH_OUT||'output/touch-validation');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const context=await browser.newContext({viewport:{width:1280,height:800},hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  let mutations=0;
  if(process.env.NEGATIVE){
    const navigation=process.env.NEGATIVE==='navigation';
    await page.route(navigation?'**/src/navigation.js*':'**/src/main.js*',async route=>{
      const response=await route.fetch();let body=await response.text();
      const pattern=navigation?/element\.ownerDocument\.addEventListener\('pointer(?:up|cancel)',touchEnd,\{capture:true,signal\}\);/g:
        process.env.NEGATIVE==='label'?/\|\|tapGuard\.isMultiple\(\)/g:/if\(!tapGuard\.wasTap\(e\)\)return;/g;
      assert(pattern.test(body),'Negativvariante passt nicht zum geprüften Quelltext');pattern.lastIndex=0;body=body.replace(pattern,'');mutations++;
      await route.fulfill({response,body});
    });
  }
  await page.addInitScript(()=>{window.__touchEvents=[];for(const kind of ['pointerdown','pointerup','pointercancel'])document.addEventListener(kind,e=>window.__touchEvents.push([kind,e.pointerType,e.button,e.pointerId,e.target.id,e.clientX,e.clientY]),true)});
  await page.goto(process.env.URL||'http://localhost:5181');await page.waitForFunction(()=>window.__dateienBereit);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.touch),'true');if(process.env.NEGATIVE)assert(mutations>0,'Negativvariante wurde nicht geladen');
  const cdp=await context.newCDPSession(page),delay=()=>page.waitForTimeout(50);
  const send=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});await delay()};
  const tap=async xy=>{await send('touchStart',[[1,...xy]]);await send('touchEnd',[])};
  const load=async file=>{await page.locator('#file').setInputFiles(file);await page.waitForFunction(()=>window.__app.data()&&!document.getElementById('dokumentAnsicht').inert);await page.waitForFunction(()=>window.__app.animFertig())};
  await load('testdaten/messteil.step');
  await page.locator('#btnMessen').tap();
  const ids=await page.evaluate(()=>{const edges=window.__app.data().uniq[0].edges;return {
    arc:edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-6&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-5*Math.SQRT2)<1e-5),
    full:edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-6&&Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))<1e-5),
    line:edges.findIndex(e=>e.type==='Gerade'&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-95)<1e-5)}});
  assert(Object.values(ids).every(i=>i>=0));
  const point=async id=>{
    for(const view of ['iso','unten','oben','vorne','hinten','rechts','links']){
      await page.evaluate(view=>window.__app.ansicht(view),view);await page.waitForFunction(()=>window.__app.animFertig());
      const xy=await page.evaluate(id=>{const a=window.__app,e=a.data().uniq[0].edges[id],points=e.pts.length>2?e.pts.slice(1,-1):[.2,.35,.5,.65,.8].map(t=>e.pts[0].map((x,i)=>x+(e.pts[1][i]-x)*t));
        for(const p of points){const xy=a.screenOf(p),hit=a.pickAt(...xy);if(hit?.k==='edge'&&hit.id===id&&hit.inst===0&&document.elementFromPoint(...xy)?.id==='buehne')return xy}return null},id);
      if(xy)return xy;
    }throw Error('Kein sichtbarer Referenz-Fangpunkt: '+id);
  };
  const clear=()=>page.evaluate(()=>window.__app.clearSel());
  const value=async expected=>{await page.waitForFunction(()=>document.getElementById('ergebnis').getAttribute('aria-busy')!=='true');const r=await page.evaluate(()=>window.__lastMeasure);assert(r?.rows?.length,JSON.stringify(r));assert(Math.abs(r.rows.find(row=>row[2]==='L')[1]-expected)<1e-6,JSON.stringify(r))};
  const state=()=>page.evaluate(()=>window.__steuerung());
  for(const [edge,expected] of [[ids.arc,5],[ids.full,10],[ids.line,95]]){await clear();await tap(await point(edge));await value(expected)}
  await page.locator('#keepDim').tap();assert.equal(await page.evaluate(()=>window.__app.dims().length),1);
  // Beide Finger-Endreihenfolgen müssen ohne neue Auswahl enden, auch ohne Bewegung.
  for(const first of [1,2]){
    await clear();const xy=await point(ids.line),other=[Math.max(30,xy[0]-70),Math.max(200,xy[1]-60)];
    await send('touchStart',[[1,...xy]]);await send('touchStart',[[1,...xy],[2,...other]]);
    await send('touchEnd',first===1?[[2,...other]]:[[1,...xy]]);await send('touchEnd',[]);
    assert.deepEqual(await page.evaluate(()=>window.__app.sels()),[],'Mehrfinger-Ende darf keine Messauswahl erzeugen');
  }
  // Zweiter Finger darf eine bereits gegriffene Bemaßung weder bewegen noch öffnen.
  const dimensionState=()=>page.evaluate(()=>JSON.stringify(window.__app.dims()));
  for(const end of ['first','second','cancel']){
    const label=await page.evaluate(()=>window.__app.dimLabels()[0]?.[0]),b=await page.locator('#buehne').boundingBox();assert(label);
    const p=[label[0]+b.x,label[1]+b.y],q=[b.x+b.width*.7,b.y+b.height*.65],saved=await dimensionState();
    assert.equal(await page.evaluate(p=>document.elementFromPoint(...p)?.id,p),'buehne','Bemaßung muss auf sichtbarer 3D-Fläche liegen');
    await send('touchStart',[[1,...p]]);await send('touchStart',[[1,...p],[2,...q]]);
    await send('touchMove',[[1,p[0]+20,p[1]+15],[2,q[0]+25,q[1]+10]]);
    if(end==='cancel')await send('touchCancel',[]);
    else{await send('touchEnd',end==='first'?[[2,q[0]+25,q[1]+10]]:[[1,p[0]+20,p[1]+15]]);await send('touchEnd',[])}
    assert.equal(await dimensionState(),saved,'Mehrfinger-Geste darf keine Bemaßung verschieben');assert.equal(await page.locator('#dimedit').isVisible(),false);
  }
  const canvas=await page.locator('#buehne').boundingBox(),x=canvas.x+canvas.width*.58,y=canvas.y+canvas.height*.6;
  const before=await state(),matrices=await page.evaluate(()=>window.__app.matrizen());
  await send('touchStart',[[1,x,y]]);await send('touchMove',[[1,x+75,y+50]]);await send('touchEnd',[]);
  const rotated=await state();assert(Math.hypot(...rotated.pos.map((v,i)=>v-before.pos[i]))>1,'Ein Finger muss die Ansicht drehen');
  await send('touchStart',[[1,x-45,y],[2,x+45,y]]);await send('touchMove',[[1,x-80,y+25],[2,x+110,y+25]]);await send('touchEnd',[]);
  const zoomed=await state(),dist=s=>Math.hypot(...s.pos.map((v,i)=>v-s.ziel[i]));assert(dist(zoomed)<dist(rotated)*.8,'Zwei Finger müssen zoomen');assert(zoomed.ziel.some((v,i)=>Math.abs(v-rotated.ziel[i])>1),'Zwei Finger müssen verschieben');
  const saved=await page.evaluate(()=>({sels:window.__app.sels(),dims:JSON.stringify(window.__app.dims()),r:window.__lastMeasure}));
  await send('touchStart',[[1,x,y],[2,x+50,y]]);await send('touchCancel',[]);
  assert.deepEqual(await page.evaluate(()=>({sels:window.__app.sels(),dims:JSON.stringify(window.__app.dims()),r:window.__lastMeasure})),saved,'Cancel darf keine Auswahl oder Messung erzeugen');
  const cancelled=await state();await send('touchStart',[[1,x,y]]);await send('touchMove',[[1,x+30,y+25]]);await send('touchEnd',[]);assert.notDeepEqual((await state()).pos,cancelled.pos,'Orbit nach Cancel');
  const afterOrbit=await state();await send('touchStart',[[1,x-30,y],[2,x+30,y]]);await send('touchMove',[[1,x-60,y],[2,x+60,y]]);await send('touchEnd',[]);assert(dist(await state())<dist(afterOrbit)*.8,'Pinch nach Cancel');
  await clear();await tap(await point(ids.arc));await value(5);
  assert.deepEqual(await page.evaluate(()=>window.__app.matrizen()),matrices,'Navigation darf Bauteillage nicht verändern');
  // Mobile Kontextmenüs: dieselbe Politik wie bei den Hauptmenüs.
  await page.locator('#touchBaum').tap();await page.locator('.tree-more').first().tap();
  for(const action of ['move','sheet','einzelOeffnen','einzelStep','alleStep'])assert(await page.locator(`#ctx [data-a="${action}"]`).isDisabled(),action);
  await page.keyboard.press('Escape');await page.locator('#touchBaum').tap();
  assert(await page.locator('#dimSpeichern').isDisabled());
  // Telefon/Portrait: der Messbereich liegt unter einer echten, kleineren 3D-Fläche.
  await page.setViewportSize({width:480,height:900});await page.waitForTimeout(300);
  const layout=await page.evaluate(()=>({view:document.getElementById('view').getBoundingClientRect().toJSON(),dock:document.getElementById('dock').getBoundingClientRect().toJSON(),width:document.documentElement.scrollWidth}));
  assert(layout.view.bottom<=layout.dock.top+1);assert(layout.view.height>160);assert(layout.width<=480);await page.screenshot({path:path.join(out,'portrait.png')});
  // Falsche Endung und kaputte STEP: sichtbarer Fehler, gültiger Tab bleibt erhalten.
  const docs=await page.evaluate(()=>window.__dokumente().length);
  await page.locator('#file').setInputFiles({name:'notiz.txt',mimeType:'text/plain',buffer:Buffer.from('x')});assert((await page.locator('#status').innerText()).includes('Nur STEP'));
  await page.locator('#file').setInputFiles({name:'kaputt.step',mimeType:'application/octet-stream',buffer:Buffer.from('invalid STEP')});
  await page.waitForFunction(()=>!document.getElementById('dokumentAnsicht').inert&&!document.getElementById('status').textContent.startsWith('Lade '));
  assert.equal(await page.evaluate(()=>window.__dokumente().length),docs);assert(await page.locator('#status').isVisible());assert((await page.locator('#status').innerText()).length>0);
  await load('testdaten/messbaugruppe.step');assert.equal(await page.evaluate(()=>window.__dokumente().length),docs+1);
  await page.setViewportSize({width:1280,height:800});await page.screenshot({path:path.join(out,'tablet.png')});
  if(process.env.LARGE_STEP){
    await load(process.env.LARGE_STEP);assert((await page.evaluate(()=>window.__app.data().inst.length))>=500);
    const b=await page.locator('#buehne').boundingBox(),cx=b.x+b.width*.6,cy=b.y+b.height*.6;
    const edges=(await state()).kantenSichtbar;assert(edges>=500);
    await send('touchStart',[[1,cx,cy]]);await send('touchMove',[[1,cx+40,cy+20]]);assert.equal((await state()).schnell,true);assert.equal((await state()).kantenSichtbar,0);
    await send('touchEnd',[]);await page.waitForTimeout(300);assert.equal((await state()).schnell,false,'Kanten müssen nach Touch-Ende zurückkehren');assert.equal((await state()).kantenSichtbar,edges,'Echte Kantenobjekte müssen wieder sichtbar sein');
    await send('touchStart',[[1,cx,cy],[2,cx+40,cy]]);await send('touchCancel',[]);await page.waitForTimeout(300);assert.equal((await state()).schnell,false);
  }
  assert.deepEqual(errors,[]);console.log('OK: Touch Auto R5/Ø10/L95, Orbit, Pinch/Pan, Endreihenfolge, Cancel, Matrix, Menüs, Portrait, Dateifehler/Tab; '+(process.env.LARGE_STEP?'große Baugruppe':'große Baugruppe nicht angefordert'));
}finally{await browser.close()}
