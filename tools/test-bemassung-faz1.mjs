// Faz 1 Bemaßung: Ketten-, Basislinien- und Fasenbemaßung, Begleitdatei *.hasi3d.json (Speichern/Laden mit Modellprüfung),
// Biegetabelle ohne NaN beim Umschlag / über 180°.
import assert from 'assert';import fs from 'fs';import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
import * as BM from '../src/bemassung.js';import {tabelle,pdf,xlsx} from '../src/biegetabelle-export.js';
const ok=t=>console.log('  ok  '+t),nah=(a,b)=>Math.abs(a-b)<1e-9;
console.log('Ketten- und Basislinienmaß:');
// Bezug: horizontales Maß 0 → 10 entlang X, Maßlinie 5 mm unterhalb
const ref={no:1,typ:'horizontal',p1:[0,0,0],p2:[10,0,0],dir:[1,0,0],off:[0,-5,0],sels:[]};
const k1=BM.folgeMass(ref,[25,3,0],'kette',4);assert.deepEqual(k1.p1,[10,0,0]);assert(nah(k1.wert,15));assert.deepEqual(k1.dir,[1,0,0]);assert.equal(k1.refNo,1);assert(nah(k1.off[1],-5));
const k2=BM.folgeMass({...k1,no:2},[40,0,0],'kette',4);assert.deepEqual(k2.p1,[25,3,0]);assert(nah(k2.wert,15));ok('Kette 0 → 10 → 25 → 40: 10 / 15 / 15, gleiche Maßlinie');
const b1=BM.folgeMass(ref,[25,0,0],'basislinie',4);assert.deepEqual(b1.p1,[0,0,0]);assert(nah(b1.wert,25));assert(nah(b1.off[1],-9));
const b2=BM.folgeMass({...b1,no:3},[40,0,0],'basislinie',4);assert.deepEqual(b2.p1,[0,0,0]);assert(nah(b2.wert,40));assert(nah(b2.off[1],-13));ok('Basislinie 0 → 25 / 0 → 40, je 4 mm weiter außen');
const b3=BM.folgeMass({...k2,no:4},[50,0,0],'basislinie',4);assert.deepEqual(b3.p1,[0,0,0]);assert(nah(b3.wert,50));ok('Basislinie nach Kette: wieder vom Anfang der Reihe (0 → 50)');
assert.equal(BM.folgeMass({typ:'radius'},[1,0,0],'kette',4),null);assert.equal(BM.folgeMass(ref,null,'kette',4),null);ok('ohne lineares Bezugsmaß keine Folgebemaßung');
// Kette auf schrägem Bezug: Richtung bleibt die des Bezugs
const s=BM.folgeMass({no:5,typ:'ausgerichtet',p1:[0,0,0],p2:[3,4,0],off:[0,0,2]},[6,8,0],'kette',1);assert(nah(s.wert,5));assert(nah(s.dir[0],0.6)&&nah(s.dir[1],0.8));
const g=BM.geomLinear(k1);assert(nah(BM.V.len(BM.V.sub(g.l2,g.l1)),15));ok('Kette auf ausgerichtetem Bezug (3-4-5)');
for(const t of ['kette','basislinie','fase'])assert(BM.TYPEN.some(x=>x[0]===t),'Typ fehlt: '+t);
console.log('Fasenbemaßung:');
const st={...BM.STIL_STANDARD,stellen:2};
assert.equal(BM.massText({typ:'fase',a:2,b:2,winkel:45,wert:2},st)[0],'Fase 2 × 45°');assert.equal(BM.massText({typ:'fase',a:3,b:1.5,winkel:26.565,wert:3},st)[0],'Fase 3 × 1,5');
assert.equal(BM.massText({typ:'fase',a:2,b:2,winkel:45,text:'2x45 umlaufend'},st)[0],'2x45 umlaufend');ok('Text „2 × 45°“, „3 × 1,5“, eigener Text');
console.log('Begleitdatei *.hasi3d.json:');
const modell={instanzen:1,flaechen:23,kanten:51};
const dims=[{...ref,sels:[{k:'vertex',id:1,inst:0,extra:'weg'},{k:'vertex',id:2,inst:0}],title:'Länge',tol:{art:'symm',o:0.1,u:0},r:{rows:[]},opts:{methode:'mitte',projektion:{art:'xy'}}},
  {no:2,typ:'kette',sels:[{k:'point',id:-1,inst:0,p:[1,2,3]}],refNo:1,off:[0,-5,0],dir:[1,0,0]},{no:3,typ:'fase',sels:[{k:'face',id:7,inst:0}]},{lose:true}];
const txt=BM.bemassungenSpeichern(dims,{datei:'teil.step',modell,erstellt:'2026-10-21T10:00:00Z'});const j=JSON.parse(txt);
assert.equal(j.format,'hasi3d-bemassungen');assert.equal(j.version,1);assert.equal(j.einheit,'mm');assert.equal(j.bemassungen.length,3);
assert.deepEqual(j.bemassungen[0].sels[0],{k:'vertex',id:1,inst:0});assert.deepEqual(j.bemassungen[0].opts,{methode:'mitte',projektion:{art:'xy'}});assert.deepEqual(j.bemassungen[0].tol,{art:'symm',o:0.1,u:0});
assert(!('r' in j.bemassungen[0])&&!('p1' in j.bemassungen[0]),'Messwerte/Punkte gehören nicht in die Datei (werden neu gemessen)');
assert.deepEqual(j.bemassungen[1].sels[0].p,[1,2,3]);assert.equal(j.bemassungen[1].refNo,1);assert.deepEqual(j.bemassungen[1].dir,[1,0,0]);
const back=BM.bemassungenLaden(txt,{modell});assert.deepEqual(back.bemassungen,j.bemassungen);ok('Speichern → Laden: Bezüge, Art, Lage, Toleranz, Messmethode');
const wirft=(t,m,re)=>assert.throws(()=>BM.bemassungenLaden(t,{modell:m}),e=>re.test(e.message)&&!/[a-z]+ is not|undefined|Unexpected/.test(e.message));
wirft('{kaputt',modell,/kein gültiges JSON/);wirft('{"format":"x"}',modell,/Keine Bemaßungsdatei/);wirft(txt.replace('"version": 1','"version": 9'),modell,/Unbekannte Version/);
wirft(txt,{...modell,flaechen:24},/anderen Modell/);ok('Fehler auf Deutsch: kein JSON, falsches Format, Version, anderes Modell');
console.log('Biegetabelle beim Umschlag und über 180°:');
const B=createBrep(await loadOC());
for(const f of ['umschlag.step','umschlag-200.step']){B.load(new Uint8Array(fs.readFileSync('testdaten/'+f)),f);const sh=B.sheet(0.5);const t=tabelle(sh,{teil:f});
  const flach=JSON.stringify(t);assert(!/NaN|Infinity/.test(flach),f+': NaN/∞ in der Tabelle');
  const p=new Uint8Array(pdf(sh,{teil:f}));assert.equal(String.fromCharCode(...p.slice(0,5)),'%PDF-');
  const x=await xlsx(sh,{teil:f});assert(x&&(x.byteLength||x.size||x.length)>100,f+': XLSX');
  if(f==='umschlag-200.step')assert.equal(t.zeilen[0].v,null);ok(`${f}: Tabelle, PDF, XLSX ohne NaN${t.zeilen[0].v==null?' (v = –)':''}`)}
console.log('OK: Bemaßung Faz 1');
