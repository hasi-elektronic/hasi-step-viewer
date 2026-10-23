import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {checkOberflaecheUi} from './check-oberflaeche-ui.mjs';
import {checkMessinformationenUi} from './check-messinformationen-ui.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1500,height:900},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const file of ['testbaugruppe.step','messteil.step','messbaugruppe.step'])await page.route('**/'+file,r=>r.fulfill({body:fs.readFileSync('testdaten/'+file),contentType:'application/octet-stream'}));
  await page.goto('http://localhost:'+(process.env.PORT||4173)+'/');
  const load=file=>page.evaluate(file=>window.__loadUrl('./'+file),file);
  const result=await checkOberflaecheUi(page,{produkt:process.env.MARKE==='sickinger'?'MS3D':'Hasi 3D',version:JSON.parse(fs.readFileSync('package.json','utf8')).version,loadAssembly:()=>load('testbaugruppe.step'),loadPart:()=>load('messteil.step')});
  result.informationen=await checkMessinformationenUi(page,{loadAssembly:()=>load('messbaugruppe.step')});
  if(process.env.SHOT){fs.mkdirSync(path.dirname(process.env.SHOT),{recursive:true});await page.screenshot({path:process.env.SHOT.replace(/\.png$/, '-informationen.png')});fs.writeFileSync(process.env.SHOT.replace(/\.png$/, '-export.png'),Uint8Array.from(await page.evaluate(()=>Array.from(window.__infoExportPreview))));await page.locator('#ueber').click();await page.screenshot({path:process.env.SHOT});await page.keyboard.press('Escape');await page.locator('header .schnell [data-aktion=einstellungen]').click();await page.screenshot({path:process.env.SHOT.replace(/\.png$/, '-einstellungen.png')})}
  if(errors.length)throw new Error(errors.join('\n'));console.log(JSON.stringify(result));
} finally {await browser.close()}
