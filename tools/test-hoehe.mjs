// Höhe messen (Hamdi: schräger Fuß): ausgerichtet = wahre Länge, vertikal = Höhe entlang der Hochachse Z, horizontal = waagerechter Abstand,
// X/Y/Z = Modellachsen, „Senkrecht zur Ansicht“ = Länge wie gesehen. Dazu linearArt() (BEMLINEAR: Richtung aus der Zugrichtung). ±0,0001 mm.
import assert from 'assert';import fs from 'fs';import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
import {richtungsVektor,richtungsWert,linearArt,RICHTUNGEN} from '../src/messen-hilfen.js';import * as BM from '../src/bemassung.js';
const B=createBrep(await loadOC());const TOL=1e-4;let n=0;
const ok=(name,ist,soll)=>{assert(Math.abs(ist-soll)<TOL,`${name}: ${ist} ≠ ${soll}`);n++;console.log(`  ok  ${name.padEnd(52)} ${soll.toFixed(4)}`)};
B.load(new Uint8Array(fs.readFileSync('testdaten/schraeger-fuss.step')),'schraeger-fuss.step');const U=B.uniq[0];
const vi=p=>{const i=U.verts.findIndex(v=>v.p.every((x,k)=>Math.abs(x-p[k])<1e-6));assert(i>=0,'Ecke '+p);return {k:'vertex',id:i,inst:0}};
const ei=f=>{const i=U.edges.findIndex(f);assert(i>=0,'Kante');return {k:'edge',id:i,inst:0}};
const zeile=(r,name)=>{const z=r.rows.find(x=>x[0]===name);assert(z,`„${name}“ fehlt: ${r.rows.map(x=>x[0]).join(', ')}`);return z[1]};
const L=Math.hypot(60,380);
console.log('Ecke Oberkante (60|0|380) → Ecke Fuß (0|0|0):');
const oben=vi([60,0,380]),fuss=vi([0,0,0]);
let r=B.measure([oben,fuss]);ok('Abstand (ausgerichtet, wahre Länge)',zeile(r,'Abstand'),L);ok('Höhe (vertikal) immer im Ergebnis',zeile(r,'Höhe (vertikal)'),380);
ok('Horizontal (waagerecht) immer im Ergebnis',zeile(r,'Horizontal (waagerecht)'),60);ok('ΔZ',zeile(r,'ΔZ'),380);ok('ΔX',zeile(r,'ΔX'),60);
for(const [art,soll] of [['vertikal',380],['horizontal',60],['x',60],['y',0],['z',380]]){r=B.measure([oben,fuss],{richtung:art});const nm=(RICHTUNGEN.find(x=>x[0]===art))[2];
  ok(`Maßrichtung ${art}: hervorgehoben „${nm}“`,r.label[1],soll);assert.equal(r.wahl,nm);if(r.richtung.dir)assert(Math.abs(Math.hypot(...r.richtung.dir)-1)<1e-12)}
// Senkrecht zur Ansicht: Blick von vorne (−Y) → wie gesehen = wahre Länge in XZ; Blick schräg von oben
r=B.measure([oben,fuss],{richtung:'ansicht',sicht:{blick:[0,-1,0],oben:[0,0,1],rechts:[1,0,0]}});ok('Senkrecht zur Ansicht (Blick von vorne)',r.label[1],L);
r=B.measure([oben,fuss],{richtung:'ansicht',sicht:{blick:[0,0,1],oben:[0,1,0],rechts:[1,0,0]}});ok('Senkrecht zur Ansicht (Blick von oben)',r.label[1],60);
// Bildschirm: „Vertikal“ = senkrecht im Bild. Ansicht um 90° gekippt (Bild-oben = Modell-X) → Höhe 60
r=B.measure([oben,fuss],{richtung:'vertikal',projektion:{art:'bildschirm',n:[0,-1,0]},sicht:{oben:[1,0,0],rechts:[0,0,-1],blick:[0,-1,0]}});
ok('Vertikal bei „Projiziert auf: Bildschirm“',zeile(r,'Höhe (vertikal) (Bildschirm)'),60);ok('Horizontal bei „Bildschirm“',zeile(r,'Horizontal (waagerecht) (Bildschirm)'),380);
console.log('Kante Oberkante ↔ Kante Fuß:');
const kO=ei(e=>e.line&&e.pts.every(p=>Math.abs(p[0]-60)<1e-6&&Math.abs(p[2]-380)<1e-6)),kF=ei(e=>e.line&&e.pts.every(p=>Math.abs(p[0])<1e-6&&Math.abs(p[2])<1e-6));
r=B.measure([kO,kF]);ok('Abstand min. (schräg entlang des Fußes)',zeile(r,'Abstand min.'),L);ok('Höhe (vertikal)',zeile(r,'Höhe (vertikal)'),380);
r=B.measure([kO,kF],{richtung:'vertikal'});ok('Maßrichtung vertikal → Höhe',r.label[1],380);
// Ober- und Fußfläche: parallel, Höhe 380
const fo=U.faces.findIndex(f=>f.plane&&f.plane.n[2]>1-1e-9),ff=U.faces.findIndex(f=>f.plane&&f.plane.n[2]<-1+1e-9);
r=B.measure([{k:'face',id:fo,inst:0},{k:'face',id:ff,inst:0}]);ok('Fläche oben ↔ Fußfläche: Paralleler Abstand',zeile(r,'Paralleler Abstand'),380);ok('Fläche–Fläche: Höhe (vertikal)',zeile(r,'Höhe (vertikal)'),380);
console.log('Rechenhilfen:');
ok('richtungsWert ausgerichtet',richtungsWert('ausgerichtet',[0,0,0],[60,0,380]),L);ok('richtungsWert vertikal',richtungsWert('vertikal',[0,0,0],[60,0,380]),380);
assert.equal(richtungsVektor('horizontal',[0,0,0],[0,0,5]),null);n++;
// BEMLINEAR: Bildschirm rechts = X, oben = Z (Ansicht von vorne)
const S={rechts:[1,0,0],oben:[0,0,1],blick:[0,-1,0]},p1=[0,0,0],p2=[60,0,380];
assert.equal(linearArt(p1,p2,[120,0,190],S),'vertikal');assert.equal(linearArt(p1,p2,[30,0,500],S),'horizontal');
const q1=[0,0,0],q2=[100,0,100];assert.equal(linearArt(q1,q2,[20,0,80],S),'ausgerichtet');assert.equal(linearArt(q1,q2,[150,0,50],S),'vertikal');n+=4;
console.log('  ok  linearArt: seitlich → vertikal, oben → horizontal, quer zur Schrägen → ausgerichtet');
const d={typ:'linear',p1,p2,dir:BM.V.norm(BM.V.sub(p2,p1)),off:[0,0,0],linArt:'ausgerichtet'};
BM.ziehe(d,[150,0,190],S);assert.equal(d.linArt,'vertikal');ok('Ziehen seitlich: Bemaßung = Höhe',d.wert,380);
BM.ziehe(d,[30,0,450],S);assert.equal(d.linArt,'horizontal');ok('Ziehen nach oben: Bemaßung = waagerecht',d.wert,60);
d.sperre='vertikal';BM.ziehe(d,[30,0,450],S);assert.equal(d.linArt,'vertikal');ok('Gesperrt (V): bleibt Höhe beim Ziehen nach oben',d.wert,380);
const g=BM.geomLinear(d);ok('Maßlinie gesperrt: Länge',BM.V.len(BM.V.sub(g.l2,g.l1)),380);
assert(BM.TYPEN.some(t=>t[0]==='hoehe')&&BM.TYPEN.some(t=>t[0]==='linear')&&BM.LINEAR.includes('hoehe'));n++;
const txt=BM.bemassungenSpeichern([{...d,no:1,sels:[oben,fuss]}],{});const j=BM.bemassungenLaden(txt);assert.equal(j.bemassungen[0].sperre,'vertikal');assert.equal(j.bemassungen[0].linArt,'vertikal');n++;
console.log(`OK: Höhe messen (${n} Prüfungen)`);
