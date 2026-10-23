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
    window.__deliverFile=path=>{pending=path;const handler=listeners.get('datei-oeffnen');if(handler!=null)callbacks.get(handler)({event:'datei-oeffnen',id:handler,payload:null})};
    window.__TAURI_INTERNALS__={
      transformCallback:fn=>{callbacks.set(++nr,fn);return nr},
      invoke:async(cmd,args)=>{
        window.__openCommands.push(cmd);
        if(cmd==='plugin:event|listen'){listeners.set(args.event,args.handler);return args.handler}
        if(cmd==='start_pfad'){const p=pending;pending=null;return p}
        if(cmd==='datei_waehlen')return 'C:/große Baugruppe Şasi 測定/Dialog.step';
        if(cmd==='kern_verfuegbar')return false;
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
  assert.equal(await page.locator('#dateiname').textContent(),'Drop.STP');
  const commands=await page.evaluate(()=>window.__openCommands);
  assert(commands.includes('datei_waehlen'));assert.equal(commands.filter(c=>c==='datei_lesen').length,3);
  assert(!commands.includes('kern_laden'),'Alle Desktop-Öffnungswege müssen pfadbasiert sein');
  assert.deepEqual(errors,[]);
  assert(await page.locator('#tree .trow').count()>0);
  if(process.env.SHOT)await page.screenshot({path:process.env.SHOT});
  console.log('OK: wartender Startpfad, nativer Dateidialog und OS-Drop laden über denselben Pfad, Unicode-Namen im Reiter, keine Laufzeitfehler');
} finally {await browser.close()}
