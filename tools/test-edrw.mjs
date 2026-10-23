// Messen wie eDrawings (nur synthetische Testdaten): zwei Flächen → parallel / Normaler Abstand / Abstand / Delta X·Y·Z,
// nicht parallel → Mindestabstand und Winkel; Bogen-/Kreismessungen Mitte zu Mitte, Min., Max.
import assert from 'assert';import fs from 'fs';
import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
const B=createBrep(await loadOC());const d=B.load(new Uint8Array(fs.readFileSync('testdaten/haube-6mm.step')),'haube-6mm.step');const U=d.uniq[0];
const F=i=>({k:'face',id:i,inst:0}),E=i=>({k:'edge',id:i,inst:0});const nah=(a,b,t=1e-6)=>Math.abs(a-b)<=t;
const ebenen=U.faces.map((f,i)=>f.type==='eben'?i:-1).filter(i=>i>=0);
// 1) parallel: Ober- und Unterseite des Stegs (Abstand = Blechdicke 6)
let par=null,schief=null;
for(const a of ebenen){for(const b of ebenen){if(b<=a)continue;const r=B.measure([F(a),F(b)],{});const e=r.edrw;assert(e,'edrw fehlt');
  assert(nah(Math.hypot(...e.delta),e.abstand,1e-6),'Delta passt nicht zum Abstand');
  if(!par&&e.parallel&&nah(e.normal,6,1e-6))par={a,b,e};if(!schief&&e.parallel===false&&e.winkel>1)schief={a,b,e};if(par&&schief)break}if(par&&schief)break}
assert(par,'kein paralleles Flächenpaar mit Abstand 6');assert(par.e.normalPaar&&par.e.abstand<=par.e.normal+1e-9);
console.log(`  ok  parallel: Normaler Abstand ${par.e.normal.toFixed(4)}, Abstand ${par.e.abstand.toFixed(4)}, Delta ${par.e.delta.map(v=>v.toFixed(3)).join(' / ')}`);
assert(schief,'kein nicht paralleles Paar');assert(schief.e.normal==null&&Number.isFinite(schief.e.winkel));
console.log(`  ok  nicht parallel: Mindestabstand ${schief.e.abstand.toFixed(4)}, Winkel ${schief.e.winkel.toFixed(3)}°`);
// 2) Bogen-/Kreismessungen: Bohrung Ø20 gegen eine gerade Kante
const kreis=U.edges.findIndex(e=>e.type==='Kreis'&&nah(e.r??0,10,1e-6)),gerade=U.edges.findIndex(e=>e.type==='Gerade');
assert(kreis>=0&&gerade>=0,'Kreis Ø20 / Gerade fehlt');
const w=bogen=>B.measure([E(kreis),E(gerade)],{methode:'auto',bogen});
const m=w('mitte'),mn=w('min'),mx=w('max'),au=w();
assert.equal(m.wahl,'Abstand Mitte–Rand');assert.equal(mn.wahl,'Abstand min.');assert.equal(mx.wahl,'Abstand max.');
const v=r=>r.rows.find(x=>x[0]===r.wahl)[1];assert(v(mn)<v(m)&&v(m)<v(mx),'min < Mitte < max');assert(v(m)-v(mn)<=10+1e-6,'Mitte höchstens einen Radius weiter als Min.');
assert.equal(au.wahl,'Abstand min.','ohne Vorgabe wie bisher');
// Methode ausdrücklich gewählt → hat Vorrang vor der Bogen-Einstellung
assert.equal(B.measure([E(kreis),E(gerade)],{methode:'max',bogen:'min'}).wahl,'Abstand max.');
// zwei Bögen: Mitte zu Mitte
const boegen=U.edges.map((e,i)=>e.type==='Kreis'&&!nah(e.r??0,10,1e-6)?i:-1).filter(i=>i>=0);
const bb=B.measure([E(boegen[0]),E(boegen.at(-1))],{bogen:'mitte'});assert.equal(bb.wahl,'Abstand Mitte–Mitte');
console.log(`  ok  Bogen/Kreis: Mitte ${v(m).toFixed(3)}, Min. ${v(mn).toFixed(3)}, Max. ${v(mx).toFixed(3)}; zwei Bögen Mitte–Mitte ${v(bb).toFixed(3)}`);
console.log('OK: Messen wie eDrawings');
