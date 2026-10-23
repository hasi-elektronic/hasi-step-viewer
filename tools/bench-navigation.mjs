// Lokaler Navigationstest mit echtem nativen Modell. Kundendaten bleiben außerhalb
// des Repos. Aufruf: node tools/bench-navigation.mjs <STEP> <Ordner mit modell.bin/brep>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [step, fixture] = process.argv.slice(2);
assert(step && fixture, 'STEP-Datei und nativen Ergebnisordner angeben');
const data = {
  step:fs.readFileSync(step), bin:fs.readFileSync(path.join(fixture,'modell.bin')),
  brep:fs.readFileSync(path.join(fixture,'modell.brep')),
};
const browser = await chromium.launch({executablePath:process.env.CHROME || '/usr/bin/google-chrome'});
try {
  const page = await browser.newPage({viewport:{width:1500,height:900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__navigation/*', route => {
    const command = new URL(route.request().url()).pathname.split('/').pop();
    assert(command in data);
    return route.fulfill({body:data[command],contentType:'application/octet-stream'});
  });
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {transformCallback:()=>0, invoke:async command => {
      if (command === 'plugin:event|listen') return 0;
      if (command === 'kern_verfuegbar') return true;
      if (command === 'start_pfad') return null;
      const file = {datei_lesen:'step',kern_laden_pfad:'bin',kern_brep:'brep'}[command];
      if (!file) throw new Error(command);
      const response = await fetch('/__navigation/'+file);
      return file === 'brep' ? new TextDecoder('latin1').decode(await response.arrayBuffer()) : response.arrayBuffer();
    }};
  });
  await page.goto('http://localhost:'+(process.env.PORT || 4173)+'/');
  await page.waitForFunction(() => window.__oeffnePfad);
  await page.evaluate(() => window.__oeffnePfad('navigation.step'));
  await page.waitForFunction(() => window.__lastLoad && window.__app.animFertig(),null,{timeout:120000});
  const before = await page.evaluate(() => window.__app.matrizen());
  const rect = await page.locator('#buehne').boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.evaluate(() => {
    document.getElementById('buehne').addEventListener('pointerdown',event => {window.__navigationPointer=event.pointerId;},{once:true});
  });
  await page.mouse.down({button:'middle'});
  const result = await page.evaluate(() => new Promise(resolve => {
    const canvas = document.getElementById('buehne'), rect = canvas.getBoundingClientRect();
    const intervals = [];let last, frame = 0, inverted = false;
    function move(now) {
      if (last != null) intervals.push(now-last);
      last = now;
      const angle = frame/80*Math.PI*2;
      canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:window.__navigationPointer,pointerType:'mouse',buttons:4,
        clientX:rect.x+rect.width/2+Math.sin(angle)*rect.width*0.25,clientY:rect.y+rect.height/2+Math.cos(angle)*rect.height*0.3}));
      inverted ||= window.__steuerung().up[1] < 0;
      if (++frame < 100) requestAnimationFrame(move);
      else {
        const gl = canvas.getContext('webgl2'), extension = gl.getExtension('WEBGL_debug_renderer_info');
        intervals.sort((a,b)=>a-b);
        resolve({bodies:window.__lastLoad.bodies,triangles:window.__lastLoad.triangles,
          medianFrameMs:intervals[Math.floor(intervals.length/2)],p95FrameMs:intervals[Math.floor(intervals.length*0.95)],
          gpu:extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',inverted,
          interaction:window.__steuerung().schnell,drawCalls:window.__steuerung().drawCalls});
      }
    }
    requestAnimationFrame(move);
  }));
  await page.mouse.up({button:'middle'});
  await page.waitForFunction(() => !window.__steuerung().schnell);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  result.restoredDrawCalls = await page.evaluate(() => window.__steuerung().drawCalls);
  assert.deepEqual(await page.evaluate(() => window.__app.matrizen()),before,'Navigation verändert Bauteillagen');
  assert(result.inverted,'Keine freie Drehung über den Pol');
  if (result.bodies >= 500) {
    assert(result.interaction,'Große Baugruppe verwendet keine interaktive Darstellung');
    assert(result.restoredDrawCalls > result.drawCalls,'Kanten nach dem Loslassen nicht wiederhergestellt');
    await page.selectOption('#stilWahl','draht');
    await page.mouse.down({button:'middle'});
    await page.mouse.move(rect.x+rect.width/2+50,rect.y+rect.height/2,{steps:4});
    assert.equal(await page.evaluate(() => window.__steuerung().schnell),false,'Drahtdarstellung darf ihre Kanten beim Drehen nicht verlieren');
    await page.mouse.up({button:'middle'});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(result,null,2));
} finally { await browser.close(); }
