// Prüft K-Faktor nach DIN 6935, CSV-Biegetabelle und Vorrang der Tabelle.
import assert from 'assert';import fs from 'fs';import {dinKFaktor,parseBiegetabelle,biegung} from '../src/kfaktor.js';
import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
const near=(a,b,e=1e-6,m='')=>assert(Math.abs(a-b)<e,`${m}: ${a} ≠ ${b}`);
near(dinKFaktor(3,2).K,(0.65+0.5*Math.log10(1.5))/2,1e-12,'K bei ri/s=1,5');near(dinKFaktor(10,2).K,0.5,1e-12,'K bei ri/s≥5');near(dinKFaktor(2,2).K,0.325,1e-12,'K bei ri/s=1');
assert(dinKFaktor(0.5,2).hinweis,'Hinweis bei ri/s<0,65');
const rows=parseBiegetabelle('s;ri;Winkel;v\n2,0;3,0;90;-3,9\n2;3;45;-1,2\n3;3;;\n'.replace('3;3;;\n','3;3;;0\n'));assert.equal(rows.length,3);near(rows[0].v,-3.9);
const rowsK=parseBiegetabelle('Dicke,Radius,K\n2,3,0.42\n');near(rowsK[0].K,0.42);
assert.throws(()=>parseBiegetabelle('a;b\n1;2'),/Spalten/);
// v aus Tabelle direkt
near(biegung(3,2,Math.PI/2,{modus:'din',tabelle:rows}).v,-3.9,1e-9,'v aus Tabelle');assert.equal(biegung(3,2,Math.PI/2,{modus:'din',tabelle:rows}).quelle,'Tabelle');
// ohne Tabelle DIN: v = φ(ri+K s) − 2(ri+s)
const K=(0.65+0.5*Math.log10(1.5))/2;near(biegung(3,2,Math.PI/2,{modus:'din'}).v,Math.PI/2*(3+K*2)-10,1e-9,'v DIN');
// Im Modell: Testblech (s=2, ri=3, 2×90°) mit DIN und mit Tabelle
const B=createBrep(await loadOC());B.load(new Uint8Array(fs.readFileSync(process.argv[2]||'public/testblech.step')),'t.step');
const sd=B.sheet({modus:'din'});sd.bends.forEach(b=>{near(b.K,K,1e-9,'K Biegung');near(b.v,Math.PI/2*(3+K*2)-10,1e-6,'v Biegung');assert.equal(b.quelle,'DIN 6935')});
near(Math.max(...sd.flat.size),122+2*Math.PI/2*(3+K*2),1e-3,'Zuschnitt DIN');
const st=B.sheet({modus:'din',tabelle:rows});st.bends.forEach(b=>{near(b.v,-3.9,1e-9,'v Tabelle');assert.equal(b.quelle,'Tabelle')});
near(Math.max(...st.flat.size),122+2*(-3.9+10),1e-3,'Zuschnitt Tabelle');
console.log('OK: K-Faktor DIN 6935 + Biegetabelle');
