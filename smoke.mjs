import { chromium } from 'playwright-core';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1400,height:860}});p.on('console',m=>console.log('console:',m.text()));p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto(process.env.URL||'http://localhost:4173/');
const runs=[];for(let i=0;i<3;i++)runs.push(await p.evaluate(()=>window.__loadUrl('./sample.stp')));
console.log(JSON.stringify(runs));
// hide first top-level child
const cbs=await p.$$('#tree input');console.log('tree checkboxes',cbs.length);
await cbs[2].click();
await p.evaluate(()=>{window.__toggleMeasure();window.__pick(0,0);window.__pick(0.15,0.1)});
console.log('measure',await p.evaluate(()=>window.__lastMeasure));
await p.waitForTimeout(400);await p.screenshot({path:'shot-tree.png'});
await cbs[2].click();await p.evaluate(()=>{window.__toggleMeasure();window.__setCut('X',500)});
await p.waitForTimeout(400);await p.screenshot({path:'shot-section.png'});await b.close();
