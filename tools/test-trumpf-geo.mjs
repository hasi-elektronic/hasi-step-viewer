// Trumpf-kompatible Abwicklung, Freiform-Stirnflächen, Lage wie Trumpf und GEO-Export (nur synthetische Testdaten aus dem Repo).
// haube-6mm.step (tools/make-haube-teil.py): s 6, Ri 6, Biegungen 90° und 82,46°, Außenmaße 80 + 200 + 70, Ausklinkung mit Spline-Kontur.
import assert from 'assert';import fs from 'fs';import os from 'os';import path from 'path';import {execFileSync} from 'child_process';
import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
import {parseGeo,geoKennzahlen,geoBiegetabelle,abwicklungLage} from '../src/geo.js';import {trumpfWert,biegung} from '../src/kfaktor.js';
const B=createBrep(await loadOC());const PI=Math.PI;
B.load(new Uint8Array(fs.readFileSync('testdaten/haube-6mm.step')),'haube-6mm.step');
console.log('Freiform-Stirnflächen sperren die Abwicklung nicht:');
let r=B.sheet({modus:'din'},0);
assert.deepEqual(r.fehler,[],'Fehler: '+JSON.stringify(r.fehler));assert(!r.flat.incomplete);assert(r.stirnFrei>=1&&r.warn.some(w=>/Freiform-Stirnfläche/.test(w)),'Hinweis Stirnfläche fehlt');
console.log(`  ok  ${r.stirnFrei} Freiform-Stirnfläche(n) erkannt, Abwicklung vollständig (DIN: ${r.flat.size.map(v=>v.toFixed(4)).join(' × ')})`);
// DIN 6935: Ri/s = 1 → K 0,325
const din=v=>{const ph=v*PI/180;return 2*Math.tan(ph/2)*12-ph*(6+0.325*6)};
const sollDin=350-din(90)-din(82.46002);assert(Math.abs(Math.max(...r.flat.size)-sollDin)<1e-3,`DIN ${Math.max(...r.flat.size)} ≠ ${sollDin}`);
console.log(`  ok  DIN 6935 (K 0,325): 80 + 200 + 70 − BD = ${sollDin.toFixed(4)}`);
console.log('Trumpf-kompatibel (BD wie TruTops Boost, TruBend 5230, EV W40/80 R5):');
r=B.sheet({modus:'trumpf',lage:'trumpf'},0);assert.deepEqual(r.fehler,[]);
const soll=350-11.1996-9.70327;const L=Math.max(...r.flat.size);assert(Math.abs(L-soll)<1e-4,`Trumpf ${L} ≠ ${soll}`);
assert(r.bends.every(b=>b.quelle==='Trumpf'));assert.deepEqual(r.bends.map(b=>+b.bd.toFixed(5)).sort((a,b)=>a-b),[9.70327,11.1996]);
console.log(`  ok  Zuschnitt ${r.flat.size.map(v=>v.toFixed(4)).join(' × ')} = 80 + 200 + 70 − 11,1996 − 9,70327 (Abweichung ${(L-soll).toExponential(1)} mm)`);
// gleichwertiger K: 90° 0,3582, 82,46° 0,3120 – kein einzelner K-Faktor trifft beide (darum Tabelle statt K)
const K90=r.bends.find(b=>Math.abs(b.ang-90)<1e-6).K,K82=r.bends.find(b=>b.ang<89).K;assert(Math.abs(K90-0.3582)<5e-4&&Math.abs(K82-0.3120)<5e-4,`K ${K90} ${K82}`);
console.log(`  ok  gleichwertiger K: 90° → ${K90.toFixed(4)}, 82,46° → ${K82.toFixed(4)} (DIN 0,3250)`);
// Interpolation zwischen den Winkeln, außerhalb: K des nächsten Winkels mit Hinweis, andere Dicke: DIN mit Hinweis
const zw=trumpfWert(null,6,6,86);const kz=(2*Math.tan(86*PI/360)*12-zw.bd)/(86*PI/180);assert(zw.art==='interpoliert'&&(kz-6)/6>K82&&(kz-6)/6<K90,'Interpolation');
const aus=trumpfWert(null,6,6,120);assert(aus.hinweis&&/außerhalb/.test(aus.hinweis));
const fremd=biegung(2,2,PI/2,{modus:'trumpf'});assert(fremd.quelle==='DIN 6935'&&/kein Trumpf-Wert/.test(fremd.hinweis));
console.log('  ok  86° interpoliert, 120° mit Hinweis, s 2 / Ri 2 ohne Trumpf-Wert → DIN 6935 mit Hinweis');
console.log('GEO-Export (Trumpf GEO 1.03) schreiben und neu einlesen:');
const geo=B.geo(r.flat,{name:'HAUBE-6MM',werkstoff:'1.0038-6',dicke:r.t,bends:r.bends.map(b=>({ang:b.ang,ri:b.ri,bd:b.bd,dir:b.dir}))});
assert(geo.startsWith('#~1\r\n1.03\r\n')&&geo.trimEnd().endsWith('#~EOF'),'Kopf/Ende');
const g=parseGeo(geo),k=geoKennzahlen(g);
assert(k.groesse.every((v,i)=>Math.abs(v-r.flat.size[i])<1e-6),`GEO-Ausdehnung ${k.groesse} ≠ ${r.flat.size}`);assert(Math.abs(k.min[0])<1e-9&&Math.abs(k.min[1])<1e-9,'Ursprung links unten');
assert.equal(k.aussen,1);assert.equal(k.innen,2,'Bohrung + Langloch');assert.equal(k.kreise,1);assert(k.boegen>=2,'Langloch-Bögen');assert.equal(k.biegungen,2);
assert.deepEqual(g.biegungen.map(b=>+Math.abs(b.winkel).toFixed(3)).sort((a,b)=>a-b),[90,97.54]);assert(g.biegungen.every(b=>b.riKonstruktion===6));
// Fläche: Volumen/s ist die Mittelfläche (K 0,5); je Biegung (Länge 300) um φ·(Ri + s/2) − BZ(Trumpf) kleiner. Spline-Kontur als Sehnenzug: < 3 mm²
const vol=Math.abs(B.solidProps([0]).volume);const sollA=vol/6-r.bends.reduce((a,b)=>a+300*((b.ang*PI/180)*(6+3)-b.ba),0);
assert(Math.abs(k.flaeche-sollA)<3,`Fläche ${k.flaeche} ≠ ${sollA}`);
assert(Math.abs(+g.attr.TOTAL_LENGTH-k.schnittLaenge)<0.01,'TOTAL_LENGTH');assert.equal(g.teil.dicke,6);assert.equal(g.attr.BEND_COUNT,'2');
console.log(`  ok  ${k.groesse.map(v=>v.toFixed(3)).join(' × ')}, ${k.konturen} Konturen (1 außen, ${k.innen} innen), ${k.kreise} Kreis, ${k.boegen} Bögen, ${k.biegungen} Biegelinien, Fläche ${k.flaeche.toFixed(1)} mm², Schnittlänge ${k.schnittLaenge.toFixed(2)}`);
// BD aus der GEO als Biegetabelle übernehmen → gleiche Abwicklung
const rows=geoBiegetabelle(g);const r2=B.sheet({modus:'din',tabelle:rows},0);assert(Math.abs(Math.max(...r2.flat.size)-soll)<1e-4&&r2.bends.every(b=>b.quelle==='Tabelle'),'GEO-Tabelle');
console.log(`  ok  Biegetabelle aus GEO (${rows.length} Zeilen, Spalte BD) → gleicher Zuschnitt`);
// DXF: ezdxf-Prüfung, falls vorhanden
const dxf=B.dxf(r.flat,{});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'geo-'));fs.writeFileSync(path.join(tmp,'haube.dxf'),dxf);fs.writeFileSync(path.join(tmp,'haube.geo'),geo,'latin1');
let py=null;for(const p of [process.env.PYTHON,'python3','python'].filter(Boolean)){try{execFileSync(p,['-c','import ezdxf'],{stdio:'ignore'});py=p;break}catch{}}
if(py){const e=JSON.parse(execFileSync(py,['tools/pruefe-dxf.py',path.join(tmp,'haube.dxf')],{encoding:'utf8'}))[0];assert.equal(e.audit_fehler,0);assert(e.polylinien.every(p=>p.geschlossen));
  assert(e.kontur_groesse.every((v,i)=>Math.abs(v-r.flat.size[i])<1e-3),'DXF-Ausdehnung');console.log(`  ok  DXF (ezdxf audit 0 Fehler, ${e.polylinien.length} geschlossene Konturen, ${e.kontur_groesse.join(' × ')})`)}
else console.log('  Hinweis: ezdxf nicht gefunden – DXF nur mit eigenem Leser (test-dxf.mjs)');
console.log('Lage wie Trumpf (lange Seite in Y, +90° gedreht):');
B.load(new Uint8Array(fs.readFileSync('testdaten/blech-bohrungen.step')),'b');const o=B.sheet({modus:'din'},0).flat;
// Testteil liegt hochkant → zuerst um −90° in die Querlage drehen (x, y) → (y, −x), dann muss „wie Trumpf“ es zurückdrehen
const Rm=p=>[p[1],-p[0]];const breit={...o,contour:o.contour.map(l=>l.map(Rm)),kanten:o.kanten.map(k=>({pts:k.pts.map(Rm),bogen:k.bogen?{...k.bogen,c:Rm(k.bogen.c),...(k.bogen.voll?{}:{a0:k.bogen.a0-PI/2,a1:k.bogen.a1-PI/2})}:null})),
  bendLines:o.bendLines.map(b=>b.map(Rm)),min:[o.min[1],-o.max[0]],max:[o.max[1],-o.min[0]],size:[o.size[1],o.size[0]]};assert(breit.size[0]>breit.size[1],'Querlage');const drehe=abwicklungLage(breit,'trumpf');assert.equal(drehe.lage.drehung,90);assert(drehe.size.every((v,i)=>Math.abs(v-o.size[i])<1e-9));
assert(drehe.size[1]>=drehe.size[0]-1e-9,'Hochformat');
const kr=x=>B.konturSchleifen(x).filter(s=>s.kreis).map(s=>[s.kreis.c[0]-x.min[0],s.kreis.c[1]-x.min[1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
{const A=kr(breit),D=kr(drehe),H=breit.size[1];const erw=A.map(p=>[H-p[1],p[0]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  assert(erw.every((p,i)=>Math.hypot(p[0]-D[i][0],p[1]-D[i][1])<1e-9),'Bohrungen nach Drehung');console.log(`  ok  ${breit.size.map(v=>v.toFixed(2)).join(' × ')} → ${drehe.size.map(v=>v.toFixed(2)).join(' × ')}, ${D.length} Bohrungen (x, y) → (B − y, x)`)}
assert.equal(abwicklungLage(drehe,'trumpf').lage.drehung,0,'Hochformat bleibt');assert.equal(abwicklungLage(o,'original').size[0],o.size[0]);
console.log('OK: Trumpf-kompatibel und GEO');
