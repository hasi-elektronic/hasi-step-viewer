// Headless-Test wie eDrawings: sauberer Start (kein Werkzeugfeld, Modell ganz unter der Werkzeugleiste), kompaktes Messen-Feld unten links,
// Wert am Element bei einem Klick (Kante, Kreis), zwei parallele Flächen mit „Normaler Abst.“ (lila) und Ergebnistext, keine Triade im Messen,
// Blech: Abwicklung oben mit Maßen, Kurzwerte, Details zugeklappt, DXF und GEO frei.
// Standard: synthetisches Teil testdaten/haube-6mm.step. TEILPFAD=… lädt eine Datei von außerhalb des Repos nur über das Netz-Routing
// (nichts wird kopiert), INST/FLAECHEN wählen Körper und Flächenpaar. SHOTDIR=… speichert Bildschirmfotos.
import { chromium } from 'playwright-core';import fs from 'fs';
const port=process.env.PORT||'4173',dir=process.env.SHOTDIR,INST=+(process.env.INST||0);if(dir)fs.mkdirSync(dir,{recursive:true});
const quelle=process.env.TEILPFAD||'testdaten/haube-6mm.step',NAME='edrw-teil.step';
const fail=m=>{throw new Error(m)};const ok=m=>console.log('  ok  '+m);
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/'+NAME,r=>r.fulfill({status:200,body:fs.readFileSync(quelle),headers:{'content-type':'application/octet-stream'}}));
await p.goto(`http://localhost:${port}/`);await p.evaluate(()=>{localStorage.clear()});await p.reload();await p.waitForFunction(()=>window.__app&&window.__loadUrl&&window.__dock);
const A=(f,a)=>p.evaluate(f,a);const bild=async n=>{if(dir){await p.waitForTimeout(250);await p.locator('#view').screenshot({path:`${dir}/${n}.png`})}};
await A(n=>{window.__lastLoad=null;return window.__loadUrl('./'+n)},NAME);await p.waitForFunction(()=>window.__lastLoad&&window.__lastLoad.bodies>0,null,{timeout:180000});await p.waitForTimeout(800);
// 1) Start: kein Feld offen, Modell ganz im Bild und unter der Werkzeugleiste
{const d=await A(()=>window.__dock());const leiste=await p.locator('#werkzeugleiste').boundingBox(),v=await p.locator('#view').boundingBox();
  if(d.dock||!(await p.locator('#messenPanel').isHidden())||!(await p.locator('#blechPanel').isHidden()))fail('Start: Werkzeugfeld offen');
  const m=d.modell,[w,h]=d.ansicht,unterLeiste=leiste.y+leiste.height-v.y;
  if(m.x0<-1||m.x1>w+1||m.y1>h+1||m.y0<unterLeiste-2)fail('Start: Modell nicht ganz frei '+JSON.stringify({m,unterLeiste}));
  ok(`Start ohne Werkzeugfeld, Modell ${Math.round(m.x1-m.x0)}×${Math.round(m.y1-m.y0)} px ab y ${Math.round(m.y0)} (Werkzeugleiste bis ${Math.round(unterLeiste)})`);await bild('1-start')}
// 2) Messen: ≤ 280 px, innerhalb der Ansicht; neue Messartwahl benötigt mehr Höhe. Modellmitte frei, Erweitert zu.
await p.locator('#btnMessen').click();await p.waitForTimeout(700);
{const r=await p.locator('#messenPanel').boundingBox(),v=await p.locator('#view').boundingBox(),d=await A(()=>window.__dock());
  if(r.width>282)fail('Messen zu breit: '+r.width);if(r.x-v.x>20||v.y+v.height-(r.y+r.height)>20)fail('Messen nicht unten links '+JSON.stringify(r));
  if(r.y<v.y||r.y+r.height>v.y+v.height+1)fail('Messen außerhalb der Ansicht: '+JSON.stringify(r));if(d.ueberlappt)fail('Messen verdeckt das Modell');
  if(await A(()=>document.getElementById('messenErweitert').open))fail('Erweitert offen');
  for(const t of ['Messart','mm · Grad','Bogen-/Kreismessungen','Ergebnisse'])if(!(await p.locator('#messenPanel').textContent()).includes(t))fail('fehlt: '+t);
  ok(`Messen ${Math.round(r.width)}×${Math.round(r.height)} px unten links, Modell frei`);await bild('2-messen')}
// 3) Ein Klick auf eine Kante: Länge am Element und im Ergebnis; Kreis: Durchmesser
const info=await A(i=>{const a=window.__app,D=a.data(),U=D.uniq[D.inst[i].u];let lang=-1,lm=0,kreis=-1,km=0;
  U.edges.forEach((e,j)=>{if(e.type==='Gerade'){const l=Math.hypot(...[0,1,2].map(k=>e.pts.at(-1)[k]-e.pts[0][k]));if(l>lm){lm=l;lang=j}}
    if(e.type==='Kreis'&&e.r&&Math.hypot(...[0,1,2].map(k=>e.pts.at(-1)[k]-e.pts[0][k]))<1e-6*e.r&&e.r>km){km=e.r;kreis=j}});return {lang,lm,kreis,km}},INST);
await A(async([i,e])=>{const a=window.__app;a.clearSel();await a.select({k:'edge',id:e,inst:i})},[INST,info.lang]);await p.waitForTimeout(200);
{const l=await A(()=>window.__app.messLabels()),t=await A(()=>window.__app.ergebnis());if(l.length!==1||!/^Länge: /.test(l[0].zeilen[0])||!t.includes(l[0].zeilen[0]))fail('Kante: '+JSON.stringify({l,t}));
  ok('Kante: '+l[0].zeilen[0]);await bild('3-kante')}
if(info.kreis>=0){await A(async([i,e])=>{const a=window.__app;a.clearSel();await a.select({k:'edge',id:e,inst:i})},[INST,info.kreis]);await p.waitForTimeout(200);
  const l=await A(()=>window.__app.messLabels());if(!/^Durchmesser: /.test(l[0]?.zeilen[0]||''))fail('Kreis: '+JSON.stringify(l));ok('Kreis: '+l[0].zeilen.join(' · '));await bild('4-kreis')}
// 4) Zwei parallele Flächen: Normaler Abst. (lila, Lotlinie) und Ergebnistext wie eDrawings
const paar=process.env.FLAECHEN?process.env.FLAECHEN.split(',').map(Number):await A(async i=>{const a=window.__app,D=a.data(),U=D.uniq[D.inst[i].u];const eb=U.faces.map((f,j)=>f.type==='eben'?j:-1).filter(j=>j>=0);let best=null;
  for(const x of eb)for(const y of eb){if(y<=x)continue;a.clearSel();await a.select({k:'face',id:x,inst:i});const r=await a.select({k:'face',id:y,inst:i},true);const e=r?.edrw;if(e?.parallel&&e.normal>1&&(!best||e.normal>best[2]))best=[x,y,e.normal]}
  a.clearSel();return best&&best.slice(0,2)},INST);
if(!paar)fail('kein paralleles Flächenpaar');
await A(async([i,f])=>{const a=window.__app;a.clearSel();a.fitIso();await a.select({k:'face',id:f[0],inst:i});await a.select({k:'face',id:f[1],inst:i})},[INST,paar]);await p.waitForTimeout(400);
{const l=await A(()=>window.__app.messLabels()),t=await A(()=>window.__app.ergebnis()),n=await A(()=>window.__app.dims().length);
  const nl=l.find(x=>/^Normaler Abst\.: /.test(x.zeilen[0]));if(!nl||nl.farbe!=='#7b3fd0'||!nl.linie)fail('Normaler Abst. fehlt: '+JSON.stringify(l));
  for(const s of ['Die zwei gewählten Elemente sind parallel.','Normaler Abstand: ','Abstand: ','Delta X: ','Delta Y: ','Delta Z: '])if(!t.includes(s))fail('Ergebnis ohne „'+s+'“: '+t);
  if(n)fail('zwei Flächen sollen keine bleibende Bemaßung anlegen');
  if(await A(()=>window.__app.gizmo()))fail('Triade sichtbar im Messen');
  console.log('  ok  zwei Flächen:',t.replace(/\n/g,' | '));await bild('5-zwei-flaechen')}
// 5) Blech: Abwicklung oben mit Maßen, Kurzwerte, Details zu, DXF/GEO frei
await A(async i=>{const a=window.__app;a.clearSel();const n=a.nodes().find(x=>x.all&&x.all.length===1&&x.all[0]===i)||a.nodes()[0];await a.act('sheet',n)},INST);
await p.waitForFunction(()=>window.__lastSheet,null,{timeout:180000});await p.waitForTimeout(500);
{const r=await A(()=>{const s=window.__lastSheet,sec=document.getElementById('tab-blech');const erstes=[...sec.children].find(e=>!e.hidden&&e.offsetHeight>0);
  return {ok:s.ok,inc:!!s.flat?.incomplete,size:s.flat?.size,erstes:erstes?.id,masse:[...document.querySelectorAll('#flatprev g.mass')].map(g=>[g.dataset.art,+g.dataset.wert]),
    info:document.getElementById('sheetinfo').innerText,details:document.getElementById('blechDetails').open,dxf:!document.getElementById('dxf').disabled,geo:!document.getElementById('geoSpeichern').disabled,
    tabelleSichtbar:!!document.querySelector('#bends table')?.checkVisibility()}});
  const rest=await A(()=>({l:window.__app.messLabels().map(x=>x.zeilen),s:window.__app.sels()}));if(rest.l.length)fail('Messwerte bleiben nach dem Löschen stehen: '+JSON.stringify(rest));
  const px=await A(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const c=document.getElementById('dimoverlay');const g=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<g.length;i+=4)if(g[i])n++;r(n)}))));if(px)fail('Messwert bleibt im Bild stehen ('+px+' px)');
  if(!r.ok||r.inc)fail('Abwicklung: '+JSON.stringify(r));if(r.erstes!=='flatprev')fail('Abwicklung nicht oben: '+r.erstes);
  const L=r.masse.find(m=>m[0]==='laenge'),B=r.masse.find(m=>m[0]==='breite');if(!L||!B||Math.abs(L[1]-r.size[0])>1e-3||Math.abs(B[1]-r.size[1])>1e-3)fail('Maße in der Abwicklung: '+JSON.stringify(r.masse));
  for(const s of ['Blechdicke','Biegungen','Zuschnitt L × B','Werkstoff','Masse'])if(!r.info.includes(s))fail('Kurzwert fehlt: '+s);
  if(/BZ|Schenkel|DIN 6935: K =/.test(r.info)||r.details||r.tabelleSichtbar)fail('Details nicht zugeklappt '+JSON.stringify({info:r.info,d:r.details,t:r.tabelleSichtbar}));if(!r.dxf||!r.geo)fail('DXF/GEO gesperrt');
  ok(`Blech: ${r.size.map(v=>v.toFixed(2)).join(' × ')}, ${r.masse.length} Maße in der Abwicklung (${r.masse.filter(m=>m[0]==='biegelinie').length} Biegelinien), Details zu, DXF und GEO frei`);
  if(dir){await p.waitForTimeout(250);await p.screenshot({path:`${dir}/6-blech.png`})}}
if(errs.length)fail('Seitenfehler: '+errs.join(' | '));
console.log('smoke-edrw ok');await b.close();
