// Hinweis-Overlay „STEP-Datei hier ablegen“ und Pfad-Öffnen im Browser (ohne echtes OS-Drag).
// Aufruf: node tools/smoke-drop.mjs (vite preview, PORT)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const port = process.env.PORT || '4173';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:' + port + '/');
await p.waitForFunction(() => window.__dateiZiehen && window.__oeffnePfad);
const text = await p.locator('#dropHint').innerText();
if (text.trim() !== 'STEP-Datei hier ablegen') throw new Error('Hinweistext: ' + text);
const anfang = await p.locator('#dropHint').evaluate(el => el.hidden);
if (!anfang) throw new Error('Hinweis ist beim Start sichtbar');
await p.evaluate(() => window.__dateiZiehen(true));
const sichtbar = await p.locator('#dropHint').evaluate(el => ({ hidden: el.hidden, display: getComputedStyle(el).display, pe: getComputedStyle(el).pointerEvents }));
if (sichtbar.hidden || sichtbar.display === 'none') throw new Error('Hinweis bleibt versteckt: ' + JSON.stringify(sichtbar));
if (sichtbar.pe !== 'none') throw new Error('Hinweis fängt Zeiger: ' + sichtbar.pe);
await p.evaluate(() => window.__dateiZiehen(false));
const weg = await p.locator('#dropHint').evaluate(el => el.hidden && getComputedStyle(el).display === 'none');
if (!weg) throw new Error('Hinweis lässt sich nicht ausblenden');
// Auch außerhalb der 3D-Fläche muss ein Dateidrop abgefangen werden.
const html5 = await p.evaluate(() => {
  const dataTransfer = new DataTransfer();dataTransfer.items.add(new File(['Notiz'],'notiz.txt'));
  const event = new DragEvent('drop',{dataTransfer,bubbles:true,cancelable:true});
  document.querySelector('header').dispatchEvent(event);
  return event.defaultPrevented && document.getElementById('status').textContent.includes('Nur STEP-Dateien');
});
if (!html5) throw new Error('Fensterweiter Browser-Drop fehlt');
await p.evaluate(() => window.__oeffnePfad('notiz.txt'));
await p.waitForFunction(() => document.getElementById('status').textContent.includes('Nur STEP-Dateien'));
await p.evaluate(() => window.__oeffnePfad('/tmp/teil.step'));
await p.waitForFunction(() => document.getElementById('status').textContent.includes('Öffnen per Pfad nur in der Desktop-App'));
await p.evaluate(bytes=>{
  const dataTransfer=new DataTransfer();dataTransfer.items.add(new File([new Uint8Array(bytes)],'große Şasi.STP'));dataTransfer.items.add(new File([new Uint8Array(bytes)],'Zweite.step'));
  document.querySelector('header').dispatchEvent(new DragEvent('drop',{dataTransfer,bubbles:true,cancelable:true}));
},Array.from(fs.readFileSync('public/testblech.step')));
await p.waitForFunction(()=>window.__lastLoad?.name==='Zweite.step',null,{timeout:60000});
if(JSON.stringify(await p.evaluate(()=>window.__dokumente().map(d=>d.name)))!==JSON.stringify(['große Şasi.STP','Zweite.step']))throw new Error('Mehrfach-Drop verliert eine Datei');
await p.locator('#file').setInputFiles([{name:'Auswahl A.step',mimeType:'application/octet-stream',buffer:fs.readFileSync('public/testblech.step')},{name:'Auswahl B.step',mimeType:'application/octet-stream',buffer:fs.readFileSync('public/testblech.step')}]);
await p.waitForFunction(()=>window.__dokumente().length===4&&window.__lastLoad?.name==='Auswahl B.step',null,{timeout:60000});
if(await p.locator('#tree .trow').count()===0)throw new Error('Gültiger Drop zeigt kein Modell');
if (errs.length) throw new Error(errs.join(' | '));
await b.close();
console.log('OK: Ablegen-Hinweis', port);
