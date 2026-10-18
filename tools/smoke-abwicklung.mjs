// Headless-Test Abwicklung mit CadQuery-Testteilen. Screenshots: docs/abwicklung-*.png
import { chromium } from 'playwright-core';import fs from 'fs';
const files=['wanne.step','s-profil.step','wanne-ohne-freischnitt.step'];
for(const d of ['public','dist'])if(fs.existsSync(d))files.forEach(f=>fs.copyFileSync('testdaten/'+f,d+'/'+f));
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.env.URL||'http://localhost:4173/');const fail=m=>{throw new Error(m)};
const blech=async(f,shot)=>{await p.evaluate(u=>window.__loadUrl(u),'./'+f);await p.evaluate(()=>{window.__lastSheet=null;window.__app.tab('blech')});await p.waitForFunction(()=>window.__lastSheet);await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{const s=window.__lastSheet;return {size:s.flat?.size,bends:s.bends.length,fehler:s.fehler,dxf:!document.getElementById('dxf').disabled,warn:document.getElementById('sheeterr').innerText}});
  console.log(f,JSON.stringify(r).slice(0,300));if(shot){await p.screenshot({path:'docs/'+shot});await p.locator('#flatprev').screenshot({path:'docs/'+shot.replace('.png','-flach.png')})}return r};
let r=await blech('wanne.step','abwicklung-wanne.png');if(r.bends!==4||!r.dxf||r.fehler.length)fail('Wanne');
r=await blech('s-profil.step','abwicklung-s-profil.png');if(r.bends!==2||!r.dxf)fail('S-Profil');
r=await blech('wanne-ohne-freischnitt.step','abwicklung-warnung.png');if(r.dxf||!r.warn.includes('DXF gesperrt'))fail('Warnung fehlt / DXF nicht gesperrt');
console.log('fehler',JSON.stringify(errs));await b.close();if(errs.length)process.exit(1);
