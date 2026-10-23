// Biegungen zählen wie an der Abkantpresse: Biegezonen auf derselben Biegelinie (gleicher Winkel, Richtung, Ri) = eine Biegung.
// Nur selbst erzeugte Testteile (tools/make-biegung-teil.py, make-haube-teil.py, make-abwicklung-teile.py).
import assert from 'assert';import fs from 'fs';
import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
import {biegungenGruppieren} from '../src/biegungen.js';import {biegeNotizen} from '../src/biegenotiz.js';import {tabelle} from '../src/biegetabelle-export.js';
const ok=t=>console.log('  ok  '+t);

console.log('Gruppieren (reine Funktion):');
{const b=(nr,ang=90,dir='nach oben',ri=2)=>({nr,ang,dir,ri,len:10});
  const L=[[[0,0],[10,0]],[[20,0],[30,0]],[[0,5],[10,5]],[[40,0],[50,0]],[[60,0],[70,0]],[[80,0.004],[90,0.004]]];
  const g=biegungenGruppieren([b(1),b(2),b(3),b(4,45),b(5,90,'nach unten'),b(6)],L);
  assert.deepEqual(g.zonen.map(z=>z.gruppe),[1,1,2,3,4,1],JSON.stringify(g.zonen));
  assert.equal(g.biegungen.length,4);assert.deepEqual(g.biegungen[0].zonen,[1,2,6]);assert.equal(g.biegungen[0].len,30);
  assert.deepEqual(g.zonen.filter(z=>z.gruppe===1).map(z=>z.abschnitte),[3,3,3]);
  ok('kollinear + gleicher Winkel/Richtung/Ri → eine Biegung; parallel versetzt, anderer Winkel, andere Richtung → eigene Biegung');
  const r=biegungenGruppieren([b(1,90,'nach oben',2),b(2,90,'nach oben',3)],[L[0],L[1]]);assert.equal(r.biegungen.length,2);ok('anderer Innenradius → eigene Biegung');
  assert.equal(biegungenGruppieren([],[]).biegungen.length,0);ok('ohne Biegungen: 0')}

const B=createBrep(await loadOC());
const run=(f,o={})=>{B.load(new Uint8Array(fs.readFileSync('testdaten/'+f)),f);return B.sheet({modus:'manuell',K:0.5,...o})};

console.log('U-Profil mit geteiltem Schenkel (zwei Laschen auf einer Biegelinie, synthetisch):');
{const r=run('zwei-laschen.step');assert(!r.flat.incomplete,JSON.stringify(r.fehler));
  assert.equal(r.bends.length,3,'3 Biegezonen');assert.equal(r.biegungen.length,2,'2 Biegungen');
  const zwei=r.biegungen.find(g=>g.zonen.length===2);assert(zwei,'eine Biegung mit zwei Zonen');near(zwei.len,160,1e-3,'Biegelänge beider Laschen');
  const z=r.bends.filter(b=>b.abschnitte===2);assert.equal(z.length,2);assert.equal(z[0].gruppe,z[1].gruppe);
  assert.deepEqual(r.flat.bendInfo.map(b=>b.gruppe),r.bends.map(b=>b.gruppe));
  const n=biegeNotizen(r.flat);assert.equal(n.length,3,'Biegelinien bleiben je Zone');assert.equal(new Set(n.map(x=>x.text.split(' ')[0])).size,2,'zwei verschiedene Nummern in der Zeichnung');
  const dxf=B.dxf(r.flat,{beschriftung:true});const labels=[...dxf.matchAll(/\n1\n(B\d+) /g)].map(m=>m[1]);assert.equal(labels.length,3);assert.equal(new Set(labels).size,2);
  const geo=B.geo(r.flat,{name:'ZWEI-LASCHEN',werkstoff:'1.0038',dicke:r.t,bends:r.bends.map(b=>({ang:b.ang,ri:b.ri,bd:b.bd,dir:b.dir}))});
  assert(geo.includes('\r\n')&&!/[^\r]\n/.test(geo),'GEO: CRLF');assert(geo.includes('#~11\r\n'),'GEO: #~11-Kopf');assert(/^[\x00-\xff]*$/.test(geo),'GEO: Codepage 1252');
  assert(geo.includes('BEND_COUNT@3'),'GEO: eine Biegelinie je Biegezone wie TruTops');
  const T=tabelle(r);assert.equal(T.kopf.find(k=>k[0]==='Biegungen')[1],'2');assert(T.kopf.some(k=>k[0]==='Biegezonen'&&k[1].startsWith('3')));
  ok(`3 Biegezonen → ${r.biegungen.length} Biegungen (Laschen ${z.map(b=>'B'+b.gruppe).join(' + ')}, Biegelänge ${zwei.len.toFixed(1)} mm); DXF/Notizen mit gleicher Nummer, Tabelle „Biegungen 2“`)}

console.log('Teile ohne gemeinsame Biegelinie zählen unverändert:');
for(const [f,o] of [['haube-6mm.step',{}],['wanne.step',{}],['s-profil.step',{}]]){const r=run(f,o);
  assert.equal(r.biegungen.length,r.bends.length,f);assert(r.bends.every(b=>b.abschnitte===1),f);ok(`${f}: ${r.bends.length} Biegungen`)}
function near(a,b,t,m){assert(Math.abs(a-b)<t,`${m}: ${a} ≠ ${b}`)}
console.log('Biegungen zählen: alle Prüfungen bestanden');
