// Headless-Test Faz 2 „Blech 2.0“ in der Oberfläche (beide Ausgaben: PORT=4173 Hasi 3D, 4174 MS3D):
// virtueller Riss am geschlossenen Kasten, Innenradius annehmen am scharfen L, Biegenotizen/Pfeile in der Vorschau,
// Biegetabelle je Werkstoff mit BD, Falten/Entfalten (Regler), Hüllquader/Rohmaß/Schwerpunkt, Messprotokoll PDF/XLSX. Screenshots nach $SHOTS.
import { chromium } from 'playwright-core';import fs from 'fs';import path from 'path';import {parseBiegetabelle} from '../src/kfaktor.js';
const TEILE=['wanne-ohne-freischnitt.step','scharf-l.step','s-profil.step','blech-bohrungen.step','block-45.step','welle.step'];
for(const d of ['public','dist'])if(fs.existsSync(d))for(const t of TEILE)fs.copyFileSync('testdaten/'+t,d+'/'+t);
const URL=process.env.URL||`http://localhost:${process.env.PORT||'4173'}/`;const SHOTS=process.env.SHOTS||null;if(SHOTS)fs.mkdirSync(SHOTS,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const fail=m=>{throw new Error(m)};const A=(f,a)=>p.evaluate(f,a);const shot=async n=>{if(SHOTS){await p.waitForTimeout(250);await p.screenshot({path:path.join(SHOTS,n)})}};
const vorschau=async n=>{if(SHOTS){await A(()=>document.getElementById('flatprev').scrollIntoView());await p.waitForTimeout(150);await (await p.$('#flatprev')).screenshot({path:path.join(SHOTS,n)})}};
const laden=async f=>{await A(f=>window.__loadUrl('./'+f),f);await p.waitForFunction(f=>window.__lastLoad?.name===f&&window.__app.data(),f,{timeout:60000});await p.waitForTimeout(300)};
const blech=async()=>{await A(()=>window.__app.tab('blech'));await p.waitForFunction(()=>window.__lastSheet);return A(()=>window.__app.calcSheet())};
const notizen=()=>A(()=>[...document.querySelectorAll('#flatprev g.biegenotiz')].map(g=>({nr:+g.dataset.nr,r:g.dataset.richtung,t:g.querySelector('text').textContent})));
await p.goto(URL);

// 1) Virtueller Riss: geschlossene Ecken gesperrt → 4 senkrechte Eckkanten wählen → Abwicklung frei, Risskanten violett
await laden('wanne-ohne-freischnitt.step');let r=await blech();if(!r.fehler.some(f=>f.includes('Geschlossene Ecken')))fail('Kasten: geschlossene Ecken nicht erkannt');
const ecken=await A(()=>{const U=window.__app.data().uniq[0];return U.edges.map((e,i)=>[e,i]).filter(([e])=>e.type==='Gerade'&&Math.abs(e.pts[0][2]-e.pts.at(-1)[2])>10&&Math.abs(Math.abs(e.pts[0][0])-50)<1e-6).map(([,i])=>i)});
if(ecken.length!==4)fail('Eckkanten: '+ecken.length);
r=await A(k=>window.__app.rissSetzen(k.map(id=>({inst:0,id}))),ecken);
if(r.fehler.length||r.flaeche.anteil<0.99)fail('Riss: '+JSON.stringify(r.fehler)+' '+r.flaeche.anteil);
const riss=await A(()=>({info:document.getElementById('rissInfo').textContent,linien:document.querySelectorAll('#flatprev polyline.riss').length,dxf:!document.getElementById('dxf').disabled}));
if(riss.linien!==16||!riss.dxf||!riss.info.includes('8 Kante'))fail('Riss-Anzeige: '+JSON.stringify(riss));
console.log('riss ok:',riss.info,'|',(r.flaeche.anteil*100).toFixed(2)+' %','| DXF frei');await shot('faz2-riss-kasten.png');await vorschau('faz2-riss-vorschau.png');
// 2) Falten/Entfalten: Regler 50 % zeigt die Blechhaut halb entfaltet, „Teil wieder zeigen“ stellt den Körper wieder her
let pos=await A(async()=>{const a=await window.__app.faltSetzen(0.5);return a?a.length:0});if(!pos)fail('Faltung: kein Netz');
const st=await A(()=>({regler:document.getElementById('faltRegler').value,wert:document.getElementById('faltWert').textContent,sicht:window.__app.vis()[0],aus:!document.getElementById('faltAus').hidden}));
if(st.regler!=='50'||st.wert!=='50 %'||st.sicht||!st.aus)fail('Faltung: '+JSON.stringify(st));
await A(()=>window.__app.fitIso());await shot('faz2-falten-50.png');
await A(()=>window.__app.faltSetzen(1));await shot('faz2-falten-100.png');
await A(()=>document.getElementById('faltAus').click());if(!(await A(()=>window.__app.vis()[0])))fail('Teil nach der Animation nicht wieder sichtbar');
await A(()=>document.getElementById('faltPlay').click());await p.waitForTimeout(800);await A(()=>window.__app.faltEnde());console.log('falten ok: 50 % / 100 %, Animation, Teil wieder sichtbar');

// 3) Innenradius annehmen: scharfes L gesperrt → Haken setzen → Zuschnitt nach DIN-K, Warnung, Pfeil AB
await laden('scharf-l.step');r=await blech();if(!r.fehler.some(f=>f.includes('scharfkantig')))fail('scharfes L nicht erkannt');
await A(()=>{const c=document.getElementById('riAn');c.checked=true;document.getElementById('riWert').value='2';});r=await A(()=>window.__app.calcSheet());
// Standard: K nach DIN 6935 → Zuschnitt 50 + 30 − 2·(2 + 2) + π/2·(2 + K·2)
if(r.fehler.length||Math.abs(Math.max(...r.flat.size)-(72+Math.PI/2*(2+2*r.bends[0].K)))>1e-3)fail('Ri-Annahme: '+JSON.stringify(r.fehler)+' '+r.flat.size);
const warn=await A(()=>document.getElementById('sheetwarn').textContent+document.getElementById('bends').textContent);
if(!warn.includes('angenommen, nicht aus der Datei')||!warn.includes('2,00*'))fail('Warnung fehlt: '+warn.slice(0,200));
let N=await notizen();if(N.length!==1||N[0].r!=='AB'||!N[0].t.includes('AB 90° Ri 2 (angenommen)'))fail('Notiz scharfes L: '+JSON.stringify(N));
console.log('ri ok:',Math.max(...r.flat.size).toFixed(4),'|',N[0].t);await shot('faz2-ri-annahme.png');await vorschau('faz2-ri-annahme-vorschau.png');
await A(()=>{document.getElementById('riAn').checked=false});

// 4) Pfeile = Tabelle (S-Profil: eine Biegung nach oben, eine nach unten)
await laden('s-profil.step');r=await blech();N=await notizen();
const tabR=await A(()=>[...document.querySelectorAll('#bends table:first-of-type tr')].slice(1).map(tr=>tr.children[3].textContent.split(' ')[0]));
if(N.length!==2||N.map(n=>n.r).join()!==tabR.join()||N.map(n=>n.r).sort().join()!=='AB,AUF')fail('Pfeile ≠ Tabelle: '+JSON.stringify(N)+' '+tabR);
if(N.some((n,i)=>(n.r==='AUF')!==(r.bends[i].dir==='nach oben')))fail('Pfeil ≠ Richtung');console.log('pfeile ok:',N.map(n=>n.t).join(' | '));await vorschau('faz2-pfeile-s-profil.png');

// 5) Biegetabelle je Werkstoff (BD): Stahl 84,5 / Aluminium 84,0
await laden('blech-bohrungen.step');const rows=parseBiegetabelle(fs.readFileSync('testdaten/biegetabelle-werkstoffe.csv','utf8'));
await A(rows=>window.__setBiegetabelle('biegetabelle-werkstoffe.csv',rows),rows);
const mit=async v=>{await A(v=>{const s=document.getElementById('mat2');s.value=v;s.dispatchEvent(new Event('change'))},v);await p.waitForTimeout(200);return A(()=>window.__app.calcSheet())};
r=await mit('7.85');const stahl=Math.max(...r.flat.size);r=await mit('2.70');const alu=Math.max(...r.flat.size);
const csv=await A(()=>document.getElementById('csvinfo').textContent);const bdSp=await A(()=>document.getElementById('bends').textContent.includes('BD'));
if(Math.abs(stahl-84.5)>1e-3||Math.abs(alu-84)>1e-3||!csv.includes('Werkstoffe')||!bdSp)fail(`BD: Stahl ${stahl}, Alu ${alu}, ${csv}`);
console.log('bd ok: Stahl',stahl.toFixed(3),'Aluminium',alu.toFixed(3),'|',csv.slice(0,90));await shot('faz2-bd-werkstoff.png');
await A(()=>{document.getElementById('csvClear').click();const s=document.getElementById('mat2');s.value='7.85';s.dispatchEvent(new Event('change'))});

// 6) Messen: Hüllquader minimal / gedreht, Rohmaß, Schwerpunkt, Messprotokoll
await laden('block-45.step');await A(()=>window.__app.tab('messen'));
let h=await A(()=>window.__app.huelle('minimal'));if([80,50,30].some((v,i)=>Math.abs(h.minimal.sortiert[i]-v)>1e-3))fail('minimal: '+h.minimal.sortiert);
const hi=await A(()=>document.getElementById('huellinfo').textContent);if(!hi.includes('80,000')||!hi.includes('Rohmaß Block')||!(await A(()=>window.__app.huellObj())))fail('Hüllquader-Anzeige: '+hi);
const sp=await A(()=>window.__app.schwerpunkt());if(!sp||Math.hypot(sp[0]-10,sp[1]-20,sp[2]-15)>1e-6)fail('Schwerpunkt: '+sp);
await A(()=>window.__app.fitIso());await shot('faz2-huellquader-block45.png');
await A(()=>document.getElementById('protPdf').click());await p.waitForFunction(()=>window.__lastExport?.name?.endsWith('_Messprotokoll.pdf'),null,{timeout:20000});
const pdf=await A(()=>Array.from(window.__lastExport.bytes.slice(0,5)));if(String.fromCharCode(...pdf)!=='%PDF-')fail('Messprotokoll kein PDF');
if(SHOTS)fs.writeFileSync(path.join(SHOTS,'messprotokoll-block45.pdf'),Buffer.from(await A(()=>Array.from(window.__lastExport.bytes))));
await A(()=>document.getElementById('protXlsx').click());await p.waitForFunction(()=>window.__lastExport?.name?.endsWith('_Messprotokoll.xlsx'),null,{timeout:20000});
const x=await A(()=>Array.from(window.__lastExport.bytes.slice(0,2)));if(x[0]!==0x50||x[1]!==0x4b)fail('Messprotokoll kein XLSX');
const D=await A(()=>window.__app.protokollDaten());if(!D.abschnitte.some(a=>a.titel==='Hüllquader')||!D.abschnitte.some(a=>a.titel==='Rohmaß'))fail('Protokoll unvollständig');
await laden('welle.step');h=await A(()=>window.__app.huelle('minimal'));if(Math.abs(h.rohmass.zylinder.d-40)>1e-3||Math.abs(h.rohmass.zylinder.l-90)>1e-3)fail('Rohmaß Welle');
console.log('messen ok: minimal',h&&'80 × 50 × 30','| Welle Ø',h.rohmass.zylinder.d.toFixed(3),'×',h.rohmass.zylinder.l.toFixed(3),'| Protokoll PDF/XLSX');
console.log('fehler',JSON.stringify(errs));await b.close();if(errs.length)process.exit(1);console.log('OK: Faz 2 Oberfläche');
