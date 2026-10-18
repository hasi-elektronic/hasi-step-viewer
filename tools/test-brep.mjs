// Prüft den B-Rep-Kern mit dem selbst erzeugten Testblech (Sollwerte aus der Konstruktion).
import {loadOC} from './oc-node.mjs';import {createBrep} from '../src/brep.js';import fs from 'fs';import assert from 'assert';
const f=process.argv[2]||'public/testblech.step';const oc=await loadOC();const B=createBrep(oc);
const r=B.load(new Uint8Array(fs.readFileSync(f)),'testblech.step');const near=(a,b,e=1e-3,m='')=>assert(Math.abs(a-b)<e,`${m}: ${a} ≠ ${b}`);
assert.equal(r.unit.sym,'mm');assert.equal(r.uniq[0].faces.length,15);
const m=B.model();near(m.volume,(2*134.56637-0)*50-Math.PI*25*2,0.05,'Volumen');near(m.bbox.max[0]-m.bbox.min[0],108,1e-3,'BBox X');
const get=(rows,k)=>rows.find(x=>x[0]===k)[1];
const pl=B.faces.map((x,i)=>[x,i]).filter(([x])=>x.plane&&x.area>2900);near(get(B.measure([{k:'face',id:pl[0][1]},{k:'face',id:pl[1][1]}]).rows,'Paralleler Abstand'),2,1e-6,'Dicke parallel');
const hole=B.edges.findIndex(e=>e.circle&&e.circle.ang>6);const d=B.measure([{k:'edge',id:hole}]).rows;near(get(d,'Durchmesser'),10,1e-6,'Bohrung Ø');
const arc=B.edges.findIndex(e=>e.circle&&e.circle.ang<2&&Math.abs(e.circle.r-3)<1e-6);near(get(B.measure([{k:'edge',id:arc}]).rows,'Bogenlänge'),3*Math.PI/2,1e-6,'Bogenlänge');
const vf=B.faces.findIndex(x=>x.plane&&Math.abs(x.plane.n[0])>0.99&&x.area>1000);near(get(B.measure([{k:'face',id:pl[0][1]},{k:'face',id:vf}]).rows,'Winkel'),90,1e-6,'Winkel');
const s=B.sheet(0.5);near(s.t,2,1e-6,'Blechdicke');assert.equal(s.bends.length,2);s.bends.forEach(b=>{near(b.ri,3,1e-6,'Ri');near(b.ang,90,1e-6,'Winkel');near(b.v,Math.PI/2*4-10,1e-6,'v')});
near(Math.max(...s.flat.size),60+22+40+2*Math.PI/2*4,1e-3,'Zuschnittlänge');near(Math.min(...s.flat.size),50,1e-3,'Breite');
assert(B.dxf(s.flat).includes('BIEGELINIEN'));
console.log('OK: alle B-Rep-Prüfungen bestanden');
