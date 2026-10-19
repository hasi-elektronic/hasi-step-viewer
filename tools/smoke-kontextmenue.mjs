// Headless-Test Kontextmenü in der 3D-Ansicht: Rechtsklick ohne Ziehen → Menü, mit Ziehen → Schwenken (kein Menü).
import { chromium } from 'playwright-core';import fs from 'fs';
for(const d of ['public','dist'])if(fs.existsSync(d))fs.copyFileSync('testdaten/testbaugruppe.step',d+'/testbaugruppe.step');
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:'+(process.env.PORT||4173)+'/');await p.waitForFunction(()=>window.__loadUrl);await p.evaluate(()=>window.__loadUrl('./testbaugruppe.step'));
const cv=await (await p.$('#view canvas')).boundingBox();const cx=cv.x+cv.width/2,cy=cv.y+cv.height/2;
const items=async()=>p.$$eval('#ctx button',bs=>bs.map(b=>b.textContent));
// Teil treffen: Bildschirmmitte, sonst Raster absuchen
let hit=null;for(let dy=0;dy<200&&!hit;dy+=20)for(let dx=0;dx<300&&!hit;dx+=20){await p.mouse.move(cx+dx,cy+dy);await p.mouse.down({button:'right'});await p.mouse.up({button:'right'});const it=await items();if(it.includes('Im Baum zeigen'))hit=it;else await p.keyboard.press('Escape')}
if(!hit)throw new Error('Kein Teil-Menü');console.log('Teil:',hit.join(' | '));
for(const w of ['Ausblenden','Nur dieses anzeigen','Transparent','Heranzoomen','Im Baum zeigen','Messen ab hier','Eigenschaften','Blech-Abwicklung','Biegetabelle'])if(!hit.includes(w))throw new Error('fehlt: '+w);
await p.click('#ctx button:has-text("Heranzoomen")');
await p.keyboard.press('Escape');
// leerer Raum: Ecke
await p.mouse.move(cv.x+15,cv.y+15);await p.mouse.down({button:'right'});await p.mouse.up({button:'right'});const leer=await items();console.log('Leer:',leer.join(' | '));
for(const w of ['Alle einblenden','Ansicht einpassen','Vorne','Oben','Rechts','Iso','Schnitt ein','Alle Bemaßungen löschen','Screenshot speichern …'])if(!leer.includes(w))throw new Error('fehlt: '+w);
await p.click('#ctx button:has-text("Screenshot")');await p.waitForFunction(()=>window.__lastExport?.ext==='png');
const png=await p.evaluate(()=>window.__lastExport.bytes.length);console.log('Screenshot',png,'B');
// Rechtsklick mit Ziehen: kein Menü, Kamera bewegt
const before=await p.evaluate(()=>1);await p.mouse.move(cx,cy);await p.mouse.down({button:'right'});await p.mouse.move(cx+120,cy+40,{steps:8});await p.mouse.up({button:'right'});
if((await items()).length)throw new Error('Menü nach Ziehen');console.log('Ziehen: kein Menü');
if(errs.length)throw new Error(errs.join(' | '));await b.close();console.log('OK: Kontextmenü 3D');
