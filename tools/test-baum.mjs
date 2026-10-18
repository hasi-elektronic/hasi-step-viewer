// Prüft Hierarchie/Namen-Zuordnung (occt-import-js -> B-Rep-Körper) mit der eigenen Test-Baugruppe.
import {loadOC} from './oc-node.mjs';import {createBrep} from '../src/brep.js';import {parseStepHierarchy} from '../src/stephier.js';import fs from 'fs';import assert from 'assert';import {createRequire} from 'module';
const B=createBrep(await loadOC());const bytes=new Uint8Array(fs.readFileSync('testdaten/testbaugruppe.step'));
const r=B.load(bytes,'testbaugruppe.step',parseStepHierarchy(bytes));
const flat=[];const walk=(n,d)=>{flat.push('  '.repeat(d)+n.name+':'+n.bodies.join(','));n.children.forEach(c=>walk(c,d+1))};walk(r.tree,0);
console.log(flat.join('\n'));
assert.deepEqual(flat,['Halter komplett:','  Grundplatte:0','  Winkelbaugruppe:','    Winkel links:1','    Winkel rechts:2','  Bolzen 1 <1>:3','  Bolzen 1 <2>:4']);
console.log(JSON.stringify(r.stats),r.uniq.length);const s=B.sheet(0.5,1);assert.equal(s.t,2);assert.equal(s.bends.length,1);assert(Math.abs(Math.max(...s.flat.size)-(40+30+Math.PI/2*4))<1e-3);
// Messen über zwei Instanzen desselben Unikats (Bolzen <1>, <2>): Achsabstand = √(120² + 50²)
const bu=r.inst[3].u;const cf=r.uniq[bu].faces.findIndex(f=>f.type==='zylindrisch');
const rows=B.measure([{k:'face',id:cf,inst:3},{k:'face',id:cf,inst:4}]).rows;const ax=rows.find(x=>x[0]==='Lochabstand Mitte–Mitte')[1];
assert(Math.abs(ax-130)<1e-6,'Achsabstand '+ax);
console.log('OK: Baugruppenbaum');
