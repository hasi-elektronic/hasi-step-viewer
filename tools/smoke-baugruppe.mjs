// Headless-Test Baugruppenbaum mit eigener Test-Baugruppe (testdaten/testbaugruppe.step). Screenshots in docs/.
import { chromium } from 'playwright-core';import fs from 'fs';import assert from 'assert';
fs.copyFileSync('testdaten/testbaugruppe.step','dist/testbaugruppe.step');fs.mkdirSync('docs',{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto(process.env.URL||'http://localhost:4173/');
const info=await p.evaluate(()=>window.__loadUrl('./testbaugruppe.step'));console.log('load',JSON.stringify(info));
const names=await p.$$eval('#tree .nm',e=>e.map(x=>x.textContent));console.log('baum',JSON.stringify(names));
assert.deepEqual(names,['Halter komplett','Grundplatte','Winkelbaugruppe','Winkel links','Winkel rechts','Bolzen 1 <1>','Bolzen 1 <2>']);
const row=n=>p.locator('#tree .trow',{has:p.locator('.nm',{hasText:new RegExp('^'+n.replace(/[<>]/g,'.')+'$')})}).first();
await p.screenshot({path:'docs/baum-uebersicht.png'});
// Klick im Baum -> Hervorhebung
await row('Winkel links').click();await p.waitForTimeout(300);await p.screenshot({path:'docs/baum-auswahl.png'});
// Kontextmenü
await row('Winkelbaugruppe').click({button:'right'});await p.waitForTimeout(200);
const ctx=await p.$$eval('#ctx button',e=>e.map(x=>x.textContent+(x.disabled?' (aus)':'')));console.log('kontextmenü',JSON.stringify(ctx));
await p.screenshot({path:'docs/baum-kontextmenue.png'});
await p.locator('#ctx button[data-a="toggle"]').click();
const V=()=>p.evaluate(()=>window.__app.vis());
let v=await V();console.log('nach Ausblenden Winkelbaugruppe',JSON.stringify(v));assert.deepEqual(v,[true,false,false,true,true]);
assert.equal(await row('Winkel links').locator('input').isChecked(),true); // Kind bleibt angehakt, aber über Elternteil ausgeblendet
await row('Winkelbaugruppe').locator('input').check();v=await V();assert.deepEqual(v,[true,true,true,true,true]);
// Isolieren per Zeilen-Icon
await row('Grundplatte').hover();await row('Grundplatte').locator('button[data-a="isolate"]').click();v=await V();console.log('isoliert',JSON.stringify(v));assert.deepEqual(v,[true,false,false,false,false]);
await row('Grundplatte').click({button:'right'});await p.locator('#ctx button[data-a="showall"]').click();assert.deepEqual(await V(),[true,true,true,true,true]);
// Transparent
await row('Grundplatte').click({button:'right'});await p.locator('#ctx button[data-a="transp"]').click();console.log('opazität',JSON.stringify(await p.evaluate(()=>window.__app.trans())));
// Klick im 3D-Modell auf Bolzen 2 -> Baumknoten markiert
await p.evaluate(()=>window.__app.selectNode(null));
const pt=await p.evaluate(()=>window.__app.screenOf([60,-25,20]));await p.mouse.move(pt[0],pt[1]+2);await p.mouse.down();await p.mouse.up();await p.waitForTimeout(300);
const sel=await p.evaluate(()=>window.__app.selName());console.log('3D-Klick ->',sel);assert.equal(sel,'Bolzen 1 <2>');
await p.screenshot({path:'docs/baum-3d-klick.png'});
// Eigenschaften
await row('Winkel rechts').click({button:'right'});await p.locator('#ctx button[data-a="props"]').click();await p.waitForTimeout(300);
const pr=await p.evaluate(()=>window.__lastProps);console.log('eigenschaften',JSON.stringify(pr));await p.screenshot({path:'docs/baum-eigenschaften.png'});await p.click('#propsClose');
// Messen am Teil
await row('Winkel links').click({button:'right'});await p.locator('#ctx button[data-a="measure"]').click();await p.waitForTimeout(300);
console.log('messen',JSON.stringify(await p.evaluate(()=>window.__lastMeasure.rows)));
// Blech-Abwicklung für einen Körper; bei Baugruppe deaktiviert
await row('Winkelbaugruppe').click({button:'right'});console.log('blech bei Baugruppe deaktiviert',await p.locator('#ctx button[data-a="sheet"]').isDisabled());await p.keyboard.press('Escape');
await row('Winkel links').click({button:'right'});await p.locator('#ctx button[data-a="sheet"]').click();await p.waitForFunction(()=>window.__lastSheet);await p.waitForTimeout(300);
const sh=await p.evaluate(()=>{const s=window.__lastSheet;return {t:s.t,bends:s.bends.length,size:s.flat?.size}});console.log('blech',JSON.stringify(sh));assert.equal(sh.t,2);
await p.screenshot({path:'docs/baum-blech.png'});
// Suche
await p.fill('#treeSearch','bolz');await p.waitForTimeout(200);const found=await p.$$eval('#tree .nm',e=>e.map(x=>x.textContent));console.log('suche',JSON.stringify(found));
await p.screenshot({path:'docs/baum-suche.png'});
console.log('fehler',JSON.stringify(errs));assert.equal(errs.length,0);await b.close();console.log('OK');
