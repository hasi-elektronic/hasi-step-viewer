// Gemeinsamer Desktop-Ladeweg: Start während Seitenaufbau, nativer Dateidialog
// und zugestellte OS-Drops. Die echten Geometrieberechnungen laufen im Worker.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const port=process.env.PORT||4173;
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const callbacks=new Map(),listeners=new Map();let nr=0,pending='C:/große Baugruppe Şasi 測定/Start.stp';
    window.__openCommands=[];
    window.__workerCommands=[];const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){window.__workerCommands.push(message.cmd);return send.call(this,message,...rest)};
    window.__deliverFile=path=>{pending=path;const handler=listeners.get('datei-oeffnen');if(handler!=null)callbacks.get(handler)({event:'datei-oeffnen',id:handler,payload:null})};
    window.__TAURI_INTERNALS__={
      transformCallback:fn=>{callbacks.set(++nr,fn);return nr},
      invoke:async(cmd,args)=>{
        window.__openCommands.push(cmd);
        if(cmd==='plugin:event|listen'){listeners.set(args.event,args.handler);return args.handler}
        if(cmd==='start_pfad'){const p=pending;pending=null;return p}
        if(cmd==='datei_waehlen')return 'C:/große Baugruppe Şasi 測定/Dialog.step';
        if(cmd==='kern_verfuegbar')return false;if(cmd==='dokument_neu'){if(window.__holdDocumentCreate)await new Promise(resolve=>{window.__releaseDocumentCreate=resolve});return 'mock-'+(++nr)}if(cmd==='dokument_schliessen'||cmd==='dokumente_zuruecksetzen')return true;
        if(cmd==='datei_lesen')return (await fetch('/testblech.step')).arrayBuffer();
        throw new Error('Unerwarteter Aufruf: '+cmd);
      }
    };
  });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(()=>window.__lastLoad?.name==='Start.stp',null,{timeout:60000});
  await page.evaluate(()=>window.__dateienBereit);
  assert.equal(await page.title(),'Hasi 3D');
  // Menü und Symbol müssen den nativen Dialog verwenden, nie den alten Byte-Ladeweg.
  await page.locator('.menuknopf',{hasText:'Datei'}).click();
  await page.locator('[data-aktion=oeffnen]').click();
  await page.waitForFunction(()=>window.__lastLoad?.name==='Dialog.step',null,{timeout:60000});
  await page.evaluate(()=>window.__deliverFile('C:/große Baugruppe Şasi 測定/Drop.STP'));
  await page.waitForFunction(()=>window.__lastLoad?.name==='Drop.STP',null,{timeout:60000});
  assert.equal(await page.locator('.dateitab.aktiv .dateiname').textContent(),'Drop.STP');assert.deepEqual(await page.evaluate(()=>window.__dokumente().map(d=>d.name)),['Start.stp','Dialog.step','Drop.STP']);
  const commands=await page.evaluate(()=>window.__openCommands);
  assert(commands.includes('datei_waehlen'));assert.equal(commands.filter(c=>c==='datei_lesen').length,3);
  assert(!commands.includes('kern_laden'),'Alle Desktop-Öffnungswege müssen pfadbasiert sein');
  await page.evaluate(()=>{window.__holdDocumentCreate=true;window.__workerCommands=[]});
  const pendingOpen=page.evaluate(()=>window.__oeffnePfad('C:/große Baugruppe Şasi 測定/Tastatur.step'));
  pendingOpen.catch(()=>{}); // Bei einer fehlgeschlagenen Assertion schließt finally die wartende Testseite.
  await page.waitForFunction(()=>window.__releaseDocumentCreate);await page.locator('#dateiNeu').focus();await page.keyboard.press('h');await page.keyboard.press('v');await page.keyboard.press('a');
  assert.equal(await page.evaluate(()=>window.__workerCommands.includes('abmessungen')),false,'H darf während dokument_neu keine Messung im alten Dokument starten');
  await page.evaluate(()=>{window.__holdDocumentCreate=false;window.__releaseDocumentCreate()});await pendingOpen;
  assert.equal(await page.evaluate(()=>window.__lastLoad.name),'Tastatur.step');assert.equal(await page.evaluate(()=>window.__app.abm()),null);
  assert.deepEqual(errors,[]);
  assert(await page.locator('#tree .trow').count()>0);
  if(process.env.SHOT)await page.screenshot({path:process.env.SHOT});
  console.log('OK: wartender Startpfad, nativer Dateidialog und OS-Drop laden über denselben Pfad, Unicode-Namen im Reiter, keine Laufzeitfehler');
} finally {await browser.close()}
