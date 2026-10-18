// Prüft: STEP in cm wird intern in mm umgerechnet; Maße, Blech und DXF sind identisch zur mm-Datei.
import assert from 'assert';import fs from 'fs';import {loadOC} from './oc-node.mjs';import {createBrep} from '../src/brep.js';
const B=createBrep(await loadOC());
const run=f=>{const r=B.load(new Uint8Array(fs.readFileSync(f)),f);const m=B.model();const s=B.sheet(0.5);return {unit:r.unit,m,s,dxf:B.dxf(s.flat)}};
const a=run(process.argv[2]||'public/testblech.step'),b=run('testdaten/testblech-cm.step');
assert.equal(a.unit.sym,'mm');assert.equal(b.unit.sym,'cm','Einheit cm erkannt');
const near=(x,y,e,t)=>assert(Math.abs(x-y)<e,`${t}: ${x} ≠ ${y}`);
near(b.m.bbox.max[0],108,1e-6,'Bounding-Box X in mm');near(b.m.volume,a.m.volume,1e-3,'Volumen mm³');near(b.m.area,a.m.area,1e-3,'Fläche mm²');
near(b.s.t,2,1e-6,'Blechdicke mm');b.s.bends.forEach((x,i)=>near(x.ri,a.s.bends[i].ri,1e-6,'Ri mm'));
near(Math.max(...b.s.flat.size),Math.max(...a.s.flat.size),1e-6,'Zuschnitt mm');
assert(/\$INSUNITS\n70\n4\n/.test(b.dxf),'DXF-Kopf: mm');
const xs=d=>d.split('\n').filter((l,i,arr)=>['10','11','20','21'].includes(arr[i-1])).map(Number);
near(Math.max(...xs(b.dxf)),Math.max(...xs(a.dxf)),1e-3,'DXF-Koordinaten in mm');assert(Math.max(...xs(b.dxf))>100,'DXF in mm, nicht cm');
console.log('OK: Einheiten (cm → mm)');
