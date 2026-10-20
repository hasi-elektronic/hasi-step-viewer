// Export der Biegetabelle (PDF/XLSX) am Testblech und an der Wanne: Inhalt und Dateiformat prüfen.
import assert from 'assert';import fs from 'fs';import {execSync} from 'child_process';import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
import {tabelle,pdf,xlsx,biegelinie} from '../src/biegetabelle-export.js';
const B=createBrep(await loadOC());fs.mkdirSync('/tmp/hasi-export',{recursive:true});
for(const [f,nb] of [['public/testblech.step',2],['testdaten/wanne.step',4]]){
  B.load(new Uint8Array(fs.readFileSync(f)),f);const s=B.sheet(0.5);const meta={teil:f.split('/').pop(),werkstoff:'Stahl (7,85 g/cm³)',datum:'18.10.2026'};
  const T=tabelle(s,meta);assert.equal(T.zeilen.length,nb);T.zeilen.forEach(z=>{assert(z.lage!=='–','Lage der Biegelinie');assert(Math.abs(z.winkel-90)<1e-6);assert(z.schenkel.length===2)});
  assert(T.kopf.find(k=>k[0]==='Zuschnitt')[1].includes('×'));
  const p=pdf(s,meta);assert.equal(new TextDecoder().decode(p.slice(0,5)),'%PDF-');const pf='/tmp/hasi-export/'+meta.teil+'.pdf';fs.writeFileSync(pf,p);
  const txt=execSync(`pdftotext -layout "${pf}" -`).toString();for(const w of ['Biegetabelle','Blechdicke','Zuschnitt','Biegelinie','nach oben','Schenkel','Seite 1 von','Hasi 3D'])assert(txt.includes(w),'PDF enthält nicht: '+w);
  const x=await xlsx(s,meta);assert.equal(x[0],0x50);assert.equal(x[1],0x4b);const xf='/tmp/hasi-export/'+meta.teil+'.xlsx';fs.writeFileSync(xf,x);
  const xml=execSync(`unzip -p "${xf}" xl/worksheets/sheet1.xml xl/sharedStrings.xml`).toString();for(const w of ['Biegetabelle','Richtung','Zuschnitt','gerader Teil außen'])assert(xml.includes(w),'XLSX enthält nicht: '+w);
  assert(/<v>(89\.9999|90)[0-9.]*<\/v>/.test(xml),'Winkel als Zahl');
  console.log(`  ok  ${meta.teil}: ${nb} Biegungen, PDF ${p.length} B, XLSX ${x.length} B; Lage 1: ${T.zeilen[0].lage}`)}
// Lage am Testblech: Biegelinien senkrecht zur Länge, Mitte der Biegezone
B.load(new Uint8Array(fs.readFileSync('public/testblech.step')),'t');const s=B.sheet(0.5);const L=s.flat.bendLines.map(b=>biegelinie(b,s.flat));
const pos=L.map(l=>l.y1!==l.y2?l.x1:l.y1).sort((a,b)=>a-b);const soll=[60+Math.PI*2/2,60+Math.PI*2+26+Math.PI*2/2];
// Flansch 1 gerade 60, Biegezone π/2·4 (Mitte: +π), Steg gerade 22 (30−3−5), Biegezone 2π
const exp=[60+Math.PI,60+2*Math.PI+22+Math.PI];
// Die Abwicklung darf gespiegelt liegen (Basisfläche Innen-/Außenseite); dann zählen die Lagen vom anderen Ende
const Lx=L[0]&&L[0].y1!==L[0].y2?s.flat.size[0]:s.flat.size[1];const fits=p=>p.every((v,i)=>Math.abs(v-exp[i])<1e-4);
const mir=Lx?pos.map(v=>Lx-v).sort((a,b)=>a-b):[];assert(fits(pos)||(Lx&&fits(mir)),`Biegelinien: ${pos} ≠ ${exp}`);
console.log('  ok  Lage der Biegelinien am Testblech',pos.map(v=>v.toFixed(4)).join(' / '));
console.log('OK: Export Biegetabelle');
