// Fläche anklicken → Maße in mm (Hamdi 22.10.): eben Länge × Breite (an der längsten Kante), Blechdicke, Gesamthöhe; Zylinder Ø, R, Länge.
// Flächeninhalt bleibt als Zeile da (nur unter Messen › Erweitert sichtbar). Nur synthetische Teile aus testdaten/.
import assert from 'assert';import fs from 'fs';import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
const B=createBrep(await loadOC());let n=0;const nah=(a,b,was,tol=1e-3)=>{assert(a!=null&&Math.abs(a-b)<=tol,`${was}: ${a} ≠ ${b}`);n++};
const lade=f=>B.load(new Uint8Array(fs.readFileSync('testdaten/'+f)),f);
const zeilen=id=>B.measure([{k:'face',id,inst:0}]).rows;const w=(r,x)=>r.find(z=>z[0]===x)?.[1];
const suche=pr=>{const F=B.uniq[0].faces;for(let i=0;i<F.length;i++){const r=zeilen(i);if(pr(r))return r}return null};
lade('haube-6mm.step');
{const r=suche(r=>Math.abs((w(r,'Länge')??0)-300)<1e-3&&Math.abs((w(r,'Breite')??0)-177.4837)<1e-3);assert(r,'Flansch nicht gefunden');
  nah(w(r,'Blechdicke'),6,'Blechdicke');nah(w(r,'Gesamthöhe'),80,'Gesamthöhe');assert(r.findIndex(z=>z[0]==='Länge')<r.findIndex(z=>z[0]==='Flächeninhalt'));
  assert.deepEqual(r.slice(0,4).map(z=>z[0]),['Länge','Breite','Blechdicke','Gesamthöhe']);n++;
  console.log('  ok  Haube, Flansch: Länge 300 × Breite 177,4837, Blechdicke 6, Gesamthöhe 80 (vor dem Flächeninhalt)')}
{const r=suche(r=>w(r,'Radius innen Ri')!=null);nah(w(r,'Länge'),300,'Länge Biegung');console.log('  ok  Haube, Biegung: Ri '+w(r,'Radius innen Ri')+', Länge 300')}
lade('welle.step');
{const r=suche(r=>Math.abs((w(r,'Durchmesser Ø')??0)-40)<1e-6);assert(r,'Zylinder Ø40');nah(w(r,'Radius R'),20,'R');nah(w(r,'Länge'),60,'Länge');
  assert.equal(w(r,'Radius innen Ri'),undefined,'voller Zylinder ist keine Biegung');n++;
  const s=suche(r=>Math.abs((w(r,'Durchmesser Ø')??0)-25)<1e-6);nah(w(s,'Länge'),30,'Länge Ø25');console.log('  ok  Welle: Ø40 / R20 × Länge 60, Ø25 × Länge 30, keine „Biegung“')}
lade('bock.step');
{const r=suche(r=>Math.abs((w(r,'Länge')??0)-120)<1e-3&&Math.abs((w(r,'Breite')??0)-50)<1e-3);nah(w(r,'Gesamthöhe'),66,'Gesamthöhe Bock');
  assert.equal(w(r,'Blechdicke'),undefined,'Klotz hat keine Blechdicke');n++;console.log('  ok  Bock, Fußfläche: Länge 120 × Breite 50, Gesamthöhe 66, keine Blechdicke (Klotz)')}
console.log(`OK: Flächenmaße in mm (${n} Prüfungen)`);
