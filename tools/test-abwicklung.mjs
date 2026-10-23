// Abwicklung: Testteile aus tools/make-abwicklung-teile.py (CadQuery) mit bekannten Zuschnittmaßen. K = 0,5 (manuell).
import assert from 'assert';import fs from 'fs';import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
const B=createBrep(await loadOC());const PI=Math.PI,TOL=1e-4;
const run=f=>{B.load(new Uint8Array(fs.readFileSync('testdaten/'+f)),f);return B.sheet(0.5)};
const size=(r,a,b,n)=>{const s=[...r.flat.size].sort((x,y)=>x-y);assert(Math.abs(s[0]-a)<TOL&&Math.abs(s[1]-b)<TOL,`${n}: Zuschnitt ${s} ≠ ${a} × ${b}`);console.log(`  ok  ${n.padEnd(34)} ${a.toFixed(4)} × ${b.toFixed(4)}`)};
console.log('Abwickelbar:');
// S-Profil: zwei direkt aufeinanderfolgende 90°-Biegungen, Ri 3, s 2: 30 + 30 + 2·(π/2)·(3 + 0,5·2)
let r=run('s-profil.step');assert(!r.flat.incomplete,JSON.stringify(r.fehler));assert.equal(r.bends.length,2);assert.deepEqual(r.bends.map(b=>b.dir).sort(),['nach oben','nach unten']);
size(r,40,60+PI*4,'S-Profil (Biegung an Biegung)');
// Wanne 100×60×20 außen, s 2, Ri 2, 4 Laschen in 4 Richtungen, Eckfreischnitte: (100−2·4) + 2·(π/2·3 + 16)
r=run('wanne.step');assert(!r.flat.incomplete,JSON.stringify(r.fehler));assert.equal(r.bends.length,4);
size(r,52+2*(PI/2*3+16),92+2*(PI/2*3+16),'Wanne mit Eckfreischnitten');
assert(Math.abs(r.flaeche.anteil-1)<1e-6,'Flächenbilanz Wanne');
// Testblech (Z-Profil)
B.load(new Uint8Array(fs.readFileSync('public/testblech.step')),'t');r=B.sheet(0.5);assert(!r.flat.incomplete);size(r,50,122+2*PI/2*4,'Testblech Z-Profil');
console.log('Nicht abwickelbar (klare Warnung statt falscher Kontur):');
r=run('wanne-ohne-freischnitt.step');assert(r.flat.incomplete&&r.fehler.some(f=>f.includes('Geschlossene Ecken')),'Wanne ohne Freischnitt muss gesperrt sein');console.log('  ok  Wanne ohne Eckfreischnitt → '+r.fehler[0].slice(0,60));
r=run('winkel-senkung.step');assert(r.flat.incomplete&&r.fehler.some(f=>f.includes('kegelig')));console.log('  ok  Winkel mit Senkung → '+r.fehler[0]);
r=run('kuppel.step');assert(!r.ok&&/Nicht abwickelbar/.test(r.msg));console.log('  ok  Kuppel → '+r.msg);
console.log('OK: Abwicklung');
await import('./test-dxf.mjs');
await import('./test-blech2.mjs');
