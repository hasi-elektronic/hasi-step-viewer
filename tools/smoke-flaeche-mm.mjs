// Headless-Test (Hamdi 22.10.): Klick auf eine Fläche zeigt Maße in mm statt Flächeninhalt – eben: Länge × Breite (an der längsten
// Kante ausgerichtet), Blechdicke, Gesamthöhe; Zylinder: Ø, R und Länge. Flächeninhalt, Volumen und Oberfläche nur unter
// Messen › Erweitert (Standard aus). ΔX/ΔY/ΔZ-Etiketten überlappen nicht. Nur synthetische Teile (testdaten/haube-6mm.step, welle.step, bock.step).
// SHOTDIR=… speichert Bildschirmfotos.
import { chromium } from 'playwright-core';import fs from 'fs';
const port=process.env.PORT||'4173',dir=process.env.SHOTDIR;if(dir)fs.mkdirSync(dir,{recursive:true});
const fail=m=>{throw new Error(m)};const ok=m=>console.log('  ok  '+m);
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
for(const n of ['haube-6mm','welle','bock'])await p.route('**/'+n+'-teil.step',r=>r.fulfill({status:200,body:fs.readFileSync('testdaten/'+n+'.step'),headers:{'content-type':'application/octet-stream'}}));
await p.goto(`http://localhost:${port}/`);await p.evaluate(()=>{localStorage.clear()});await p.reload();await p.waitForFunction(()=>window.__app&&window.__loadUrl);
const A=(f,a)=>p.evaluate(f,a);const bild=async n=>{if(dir){await p.waitForTimeout(300);await p.locator('#view').screenshot({path:`${dir}/${n}.png`})}};
const laden=async n=>{await A(n=>{window.__lastLoad=null;return window.__loadUrl('./'+n+'-teil.step')},n);await p.waitForFunction(()=>window.__lastLoad&&window.__lastLoad.bodies>0,null,{timeout:180000});await p.waitForTimeout(500)};
// Fläche anklicken (Punkt = Schwerpunkt des ersten Dreiecks der Fläche), Zeilen der Messung zurück
const flaeche=(id)=>A(async id=>{const a=window.__app,D=a.data(),U=D.uniq[D.inst[0].u];let t=0;while(t<U.f.length&&U.f[t]!==id)t++;
  const P=[0,1,2].map(j=>{const k=U.i[3*t+j]*3;return [U.p[k],U.p[k+1],U.p[k+2]]});const q=[0,1,2].map(c=>(P[0][c]+P[1][c]+P[2][c])/3);
  a.clearSel();await a.select({k:'face',id,inst:0,p:q});return window.__lastMeasure.rows},id);
const wert=(rows,n)=>rows.find(r=>r[0]===n)?.[1];const nah=(a,b)=>a!=null&&Math.abs(a-b)<1e-3;
const sichtbar=()=>A(()=>['ergebnis','mresult','modelinfo','massinfo'].map(i=>document.getElementById(i)?.innerText||'').join('\n'));
await laden('haube-6mm');await p.locator('#btnMessen').click();await p.waitForTimeout(300);
const n=await A(()=>{const D=window.__app.data();return D.uniq[D.inst[0].u].faces.length});let top=null,rows=null;
for(let i=0;i<n&&!top;i++){const r=await flaeche(i);if(nah(wert(r,'Länge'),300)&&nah(wert(r,'Breite'),177.4837)){top=i;rows=r}}
if(top==null)fail('Flansch 300 × 177,484 nicht gefunden');
{const e=await A(()=>window.__app.ergebnis()),l=await A(()=>window.__app.messLabels()),t=await sichtbar();
  for(const s of ['Länge: 300,000 mm','Breite: 177,484 mm','Blechdicke: 6,000 mm','Gesamthöhe: 80,000 mm'])if(!e.includes(s))fail('Ergebnis ohne „'+s+'“: '+e);
  if(!l.some(x=>x.zeilen[0]==='Länge × Breite: 300,000 × 177,484 mm'&&x.zeilen[1]==='Blechdicke: 6,000 mm'))fail('3D-Etikett: '+JSON.stringify(l));
  if(/mm²|m²|Flächeninhalt|Volumen|Oberfläche/.test(t.replace(/Volumen nicht verlässlich/g,'')))fail('Fläche/Volumen sichtbar (Standard aus): '+t);
  ok('Fläche oben (Flansch): '+e.split('\n').join(' | ')+' – kein mm², kein Volumen');await bild('flaeche-mm-haube')}
{await A(()=>{const c=document.getElementById('flaecheZeigen');c.checked=true;c.dispatchEvent(new Event('change'))});const t=await sichtbar();
  if(!/Flächeninhalt\s*[\d.,]+ mm²/.test(t)||!/Volumen\s*[\d.,]+ mm³/.test(t))fail('Erweitert an: Flächeninhalt/Volumen fehlen: '+t);
  await A(()=>{const c=document.getElementById('flaecheZeigen');c.checked=false;c.dispatchEvent(new Event('change'))});if(/Flächeninhalt/.test(await sichtbar()))fail('Erweitert aus: Flächeninhalt bleibt');
  ok('Messen › Erweitert „Flächeninhalt, Volumen und Oberfläche anzeigen“: an → mm²/mm³, aus (Standard) → nur mm')}
// Zylinder: Ø, R, Länge
await laden('welle');{const m=await A(()=>{const D=window.__app.data();return D.uniq[D.inst[0].u].faces.length});let gef=null;
  for(let i=0;i<m&&!gef;i++){const r=await flaeche(i);if(nah(wert(r,'Durchmesser Ø'),40))gef=r}
  if(!gef||!nah(wert(gef,'Länge'),60)||!nah(wert(gef,'Radius R'),20))fail('Zylinder Ø40 × 60: '+JSON.stringify(gef));
  const e=await A(()=>window.__app.ergebnis());for(const s of ['Durchmesser Ø: 40,000 mm','Radius R: 20,000 mm','Länge: 60,000 mm'])if(!e.includes(s))fail('Zylinder: '+e);
  ok('Zylinder: '+e.split('\n').join(' | '));await bild('flaeche-mm-zylinder')}
// ΔX/ΔY/ΔZ-Etiketten überlappen nicht (zwei Ecken mit allen drei Anteilen, Iso-Ansicht)
await laden('bock');{const e=await A(()=>{const D=window.__app.data(),U=D.uniq[D.inst[0].u];const v=U.verts.map((q,i)=>[i,q]);
    let best=null;for(const a of v)for(const c of v){const d=[0,1,2].map(j=>Math.abs(c[1][j]-a[1][j]));if(d.every(x=>x>5)&&(!best||Math.min(...d)/Math.max(...d)<best.r))best={a,c,r:Math.min(...d)/Math.max(...d)}}return best&&[best.a,best.c]});
  if(!e)fail('keine zwei Ecken mit ΔX, ΔY und ΔZ');
  await A(async e=>{const a=window.__app;a.ansicht('iso');a.clearSel();await a.select({k:'vertex',id:e[0][0],inst:0,p:e[0][1]});await a.select({k:'vertex',id:e[1][0],inst:0,p:e[1][1]})},e);await p.waitForTimeout(500);
  const K=await A(()=>window.__app.messLabelKaesten());const d=K.filter(k=>/^Δ[XYZ]:/.test(k.zeilen[0]));if(d.length<2)fail('ΔX/ΔY-Etiketten fehlen: '+JSON.stringify(K));
  for(let i=0;i<K.length;i++)for(let j=i+1;j<K.length;j++){const a=K[i],c=K[j];if(a.x<c.x+c.w&&c.x<a.x+a.w&&a.y<c.y+c.h&&c.y<a.y+a.h)fail('Etiketten überlappen: '+a.zeilen[0]+' / '+c.zeilen[0])}
  ok(K.length+' Etiketten ('+d.map(k=>k.zeilen[0]).join(', ')+') ohne Überlappung');await bild('delta-etiketten')}
if(errs.length)fail('Seitenfehler: '+errs.join(' | '));await b.close();console.log('OK: Flächenmaße in mm');
