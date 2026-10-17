// Prüft Hierarchie/Namen-Zuordnung (occt-import-js -> B-Rep-Körper) mit der eigenen Test-Baugruppe.
import {loadOC} from './oc-node.mjs';import {createBrep,hierFromImport} from '../src/brep.js';import fs from 'fs';import assert from 'assert';import {createRequire} from 'module';
const require=createRequire(import.meta.url);const oi=await require('occt-import-js')();
const B=createBrep(await loadOC());const bytes=new Uint8Array(fs.readFileSync('testdaten/testbaugruppe.step'));
const r=B.load(bytes,'testbaugruppe.step',hierFromImport(oi,bytes));
const flat=[];const walk=(n,d)=>{flat.push('  '.repeat(d)+n.name+':'+n.bodies.join(','));n.children.forEach(c=>walk(c,d+1))};walk(r.tree,0);
console.log(flat.join('\n'));
assert.deepEqual(flat,['Halter komplett:','  Grundplatte:0','  Winkelbaugruppe:','    Winkel links:1','    Winkel rechts:2','  Bolzen 1 <1>:3','  Bolzen 1 <2>:4']);
const s=B.sheet(0.5,1);assert.equal(s.t,2);assert.equal(s.bends.length,1);assert(Math.abs(Math.max(...s.flat.size)-(40+30+Math.PI/2*4))<1e-3);
console.log('OK: Baugruppenbaum');
