import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright-core';
import {checkDokumenteUi} from './check-dokumente-ui.mjs';
import {checkDokumenteAsyncUi} from './check-dokumente-async-ui.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];
  page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${process.env.PORT||5173}/`);await page.waitForFunction(()=>window.__dateienBereit);
  const load=(file,name=file)=>page.evaluate(async({bytes,name})=>window.__loadBytes(Uint8Array.from(bytes).buffer,name),{bytes:[...fs.readFileSync('testdaten/'+file)],name});
  const result=await checkDokumenteUi(page,{loadPart:()=>load('messteil.step','A – Şasi.step'),loadAssembly:()=>load('messbaugruppe.step','B.step'),loadExtra:()=>page.evaluate(async bytes=>{
    const files=['C.step','D.step','E.step','F.step'].map(name=>new File([Uint8Array.from(bytes)],name));
    const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));dt.items.add(new File(['x'],'notiz.txt'));
    document.querySelector('header').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));
    await new Promise((resolve,reject)=>{const end=Date.now()+45000;const poll=()=>{if(window.__dokumente().length===6&&!document.getElementById('dokumentAnsicht').inert)resolve();else if(Date.now()>end)reject(new Error('Mehrfach-Drop unvollständig'));else setTimeout(poll,50)};poll()});
  },[...fs.readFileSync('testdaten/messteil.step')])});
  result.async=await checkDokumenteAsyncUi(page,{loadPart:()=>load('messteil.step'),loadAssembly:()=>load('messbaugruppe.step'),loadSheet:name=>page.evaluate(({bytes,name})=>window.__loadBytes(Uint8Array.from(bytes).buffer,name),{bytes:[...fs.readFileSync('public/testblech.step')],name})});
  if(process.env.SHOT)await page.screenshot({path:process.env.SHOT});
  assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
}finally{await browser.close()}
