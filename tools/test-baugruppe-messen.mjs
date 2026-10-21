// Sollmaße einer selbst erzeugten Baugruppe (tools/make-messbaugruppe.py). Toleranz 0,0001 mm.
// Boden 100×40×10 im Ursprung, Klotz 20 um 90° um Y gedreht und nach (90, 0, 25) geschoben,
// Bolzen A/B parallel im Abstand 50 mm, Bolzen C um 90° um X gedreht.
import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';import {parseStepHierarchy} from '../src/stephier.js';import fs from 'fs';import assert from 'assert';
const B=createBrep(await loadOC());
const tp=(m,q)=>[m[0]*q[0]+m[1]*q[1]+m[2]*q[2]+m[3],m[4]*q[0]+m[5]*q[1]+m[6]*q[2]+m[7],m[8]*q[0]+m[9]*q[1]+m[10]*q[2]+m[11]];
const td=(m,q)=>{const v=[m[0]*q[0]+m[1]*q[1]+m[2]*q[2],m[4]*q[0]+m[5]*q[1]+m[6]*q[2],m[8]*q[0]+m[9]*q[1]+m[10]*q[2]];const l=Math.hypot(...v)||1;return v.map(x=>x/l)};
const nahe=(ist,soll,was)=>{if(!(Math.abs(ist-soll)<1e-4))throw new Error(was+': '+ist+' statt '+soll)};
function knoten(tree,name){let hit=null;const w=n=>{if(n.name===name)hit=n;n.children.forEach(w)};w(tree);if(!hit)throw new Error('Knoten fehlt: '+name);return hit}
function flaeche(inst,nSoll,punkt){const I=B.inst[inst],faces=B.uniq[I.u].faces;let best=-1,bd=1e9;
  faces.forEach((f,i)=>{if(!f.plane)return;const n=td(I.m,f.plane.n),o=tp(I.m,f.plane.o);
    if(Math.abs(n[0]*nSoll[0]+n[1]*nSoll[1]+n[2]*nSoll[2])<0.99)return;
    const dist=Math.abs((o[0]-punkt[0])*nSoll[0]+(o[1]-punkt[1])*nSoll[1]+(o[2]-punkt[2])*nSoll[2]);
    if(dist<bd){bd=dist;best=i}});
  if(best<0||bd>0.5)throw new Error('Fläche nicht gefunden '+nSoll.join(',')+' Abweichung '+bd);
  return best}
function zyl(inst){const i=B.uniq[B.inst[inst].u].faces.findIndex(f=>f.type==='zylindrisch');if(i<0)throw new Error('kein Zylinder');return i}
function wert(rows,name){const r=rows.find(x=>x[0]===name);if(!r)throw new Error('Zeile fehlt: '+name+' in '+rows.map(x=>x[0]).join(', '));return r[1]}

const bytes=new Uint8Array(fs.readFileSync('testdaten/messbaugruppe.step'));
const r=B.load(bytes,'messbaugruppe.step',parseStepHierarchy(bytes));
assert.equal(r.tree.name,'Messbaugruppe');
assert.ok(!/open cascade/i.test(r.tree.name));
const namen=[];const walk=n=>{namen.push(n.name);n.children.forEach(walk)};walk(r.tree);
for(const n of ['Boden','Klotz','Bolzen A','Bolzen B','Bolzen C'])assert.ok(namen.includes(n),namen.join(' | '));
const id=name=>knoten(r.tree,name).bodies[0];
const boden=id('Boden'),klotz=id('Klotz'),a=id('Bolzen A'),b=id('Bolzen B'),c=id('Bolzen C');
const fb=flaeche(boden,[1,0,0],[50,0,0]);
const fk=flaeche(klotz,[-1,0,0],[80,0,25]);
const ff=B.measure([{k:'face',id:fb,inst:boden},{k:'face',id:fk,inst:klotz}]).rows;
nahe(wert(ff,'Abstand min.'),Math.hypot(30,10),'Fläche–Fläche min');
nahe(wert(ff,'Abstand Mitte–Mitte'),Math.hypot(30,25),'Fläche–Fläche Mitte');
nahe(wert(ff,'Abstand max.'),Math.hypot(30,30,40),'Fläche–Fläche max');
const achsen=B.measure([{k:'face',id:zyl(a),inst:a},{k:'face',id:zyl(b),inst:b}]).rows;
nahe(wert(achsen,'Lochabstand Mitte–Mitte'),50,'Lochabstand A–B');
const rc=B.measure([{k:'axis',src:'face',id:zyl(c),inst:c}]).rows;
const teile=wert(rc,'Richtung').split('/').map(s=>parseFloat(s));
const betrag=Math.hypot(...teile);
assert.ok(Math.abs(Math.abs(teile[1]/betrag)-1)<1e-4,'Bolzen C Achse nicht in Y: '+wert(rc,'Richtung'));
// Verschobene Lage: Bolzen B um 10 mm in X, ohne die Datei neu zu laden.
const lagen=B.inst.map(I=>I.m.slice());
lagen[b]=lagen[b].slice();lagen[b][3]+=10;
B.lagen(lagen);
const nach=B.measure([{k:'face',id:zyl(a),inst:a},{k:'face',id:zyl(b),inst:b}]).rows;
nahe(wert(nach,'Lochabstand Mitte–Mitte'),60,'Lochabstand nach Verschieben');
const orig=B.inst.map(I=>I.m.slice());orig[b]=orig[b].slice();orig[b][3]-=10;B.lagen(orig);
const wieder=B.measure([{k:'face',id:zyl(a),inst:a},{k:'face',id:zyl(b),inst:b}]).rows;
nahe(wert(wieder,'Lochabstand Mitte–Mitte'),50,'Lochabstand nach Zurücksetzen');
// Einteiliger OCCT-Export: Wurzel ist der Dateiname, nicht der Translator-Name.
// Faz 1: Masseeigenschaften nur der sichtbaren Bauteile (ausgeblendeter Klotz 20³ = 8000 mm³ zählt nicht)
{B.load(bytes,'messbaugruppe.step',parseStepHierarchy(bytes));const alle=B.model(),ids=B.inst.map((_,i)=>i).filter(i=>i!==klotz);const ohne=B.model(ids);
  nahe(alle.volume-ohne.volume,8000,'Volumen ohne Klotz');nahe(alle.area-ohne.area,6*400,'Oberfläche ohne Klotz');
  assert.equal(ohne.solids,alle.solids-1);assert.equal(ohne.ausgeblendet,1);assert.equal(alle.ausgeblendet,0);
  const f=B.modelFast(ids),fa=B.modelFast();nahe(fa.volume-f.volume,8000,'Volumen (schnell) ohne Klotz');assert.equal(f.ausgeblendet,1);
  assert.ok(ohne.bbox.max[0]<alle.bbox.max[0]-1e-6,'Hüllquader ohne Klotz muss kleiner sein');
  const leer=B.model([]);assert.equal(leer.volume,0);assert.equal(leer.solids,0);assert.ok(leer.bbox.min.every(Number.isFinite));
  console.log('  ok  Ausgeblendeter Klotz zählt nicht: ΔV = 8000 mm³, ΔA = 2400 mm²')}
const einzel=new Uint8Array(fs.readFileSync('testdaten/messteil.step'));
const e=B.load(einzel,'messteil.step',parseStepHierarchy(einzel));
assert.equal(e.tree.name,'messteil');
assert.ok(!/open cascade step translator/i.test(e.tree.name));
console.log('OK: Baugruppe messen');
