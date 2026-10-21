// Einzelteile als STEP: jedes Unikat der Test-Baugruppe exportieren, wieder einlesen und vergleichen
// (Flächen, Kanten, Volumen, Hüllquader; Toleranz 1e-6 relativ). Verschobene Komponente: eigenes Koordinatensystem = Originalgeometrie,
// mit Option „Position in der Baugruppe“ = aktuelle Lage. Mit KERN=native schreibt der native Kern (hasi-kern --step-export).
import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';import {createBrep as wasmBrep} from '../src/brep.js';
import {parseStepHierarchy} from '../src/stephier.js';import {stepText,stepNachbearbeiten,eindeutigeNamen,sichererName,teilName} from '../src/step-export.js';
import {execFileSync} from 'child_process';import fs from 'fs';import os from 'os';import path from 'path';import assert from 'assert';
const oc=await loadOC();const B=createBrep(oc);const nativ=process.env.KERN==='native';
const datei='testdaten/testbaugruppe.step';const bytes=new Uint8Array(fs.readFileSync(datei));
const r=B.load(bytes,'testbaugruppe.step',parseStepHierarchy(bytes));
const tol=(a,b,ref)=>Math.abs(a-b)<=1e-6*Math.max(Math.abs(ref??b),1e-9);
// Namen und Dateinamen
assert.equal(stepText("Bolzen Ø8 – Çelik ÄÖÜß 'x'"),"Bolzen \\X2\\00D8\\X0\\8 \\X2\\2013\\X0\\ \\X2\\00C7\\X0\\elik \\X2\\00C400D600DC00DF\\X0\\ ''x''");
assert.equal(teilName('Bolzen 1 <2>'),'Bolzen 1');
assert.equal(sichererName('CON'),'CON_');assert.equal(sichererName('a<b>:c?. '),'a_b__c_');assert.equal(sichererName('Şasi Ölçü Ğ ı'),'Şasi Ölçü Ğ ı');
assert.deepEqual(eindeutigeNamen(['Bolzen','bolzen','Bolzen','Teil/1']),['Bolzen.step','bolzen (2).step','Bolzen (3).step','Teil_1.step']);
// Kernpfad: native → Kern schreibt, WASM → opencascade.js schreibt; danach gleiches Nachbearbeiten
let brepDir=null;
if(nativ){brepDir=fs.mkdtempSync(path.join(os.tmpdir(),'et-'));execFileSync(process.env.HASI_KERN||'kern/build/hasi-kern',[datei,brepDir],{stdio:'ignore'})}
function exportiere(dateien,schema){ // dateien: [{name, teile:[{u,m}]}] → [Text]
  if(!nativ)return dateien.map(d=>stepNachbearbeiten(new TextDecoder().decode(B.stepSchreiben({name:d.name,schema,teile:d.teile})),{name:d.name,schema}));
  const aus=fs.mkdtempSync(path.join(os.tmpdir(),'eo-'));const auf=path.join(aus,'auftrag.txt');
  fs.writeFileSync(auf,dateien.map((d,k)=>[`t${k}.step`,schema,d.teile.length,...d.teile.flatMap(t=>[t.u,t.m?t.m.join(','):'-',t.f||'-'])].join('\t')).join('\n')+'\n');
  const out=execFileSync(process.env.HASI_KERN||'kern/build/hasi-kern',['--step-export',path.join(brepDir,'modell.brep'),auf,aus],{encoding:'utf8'});
  assert.equal((out.match(/^STUFE schreiben/mg)||[]).length,dateien.length,'Fortschritt je Datei');
  const t=dateien.map((d,k)=>stepNachbearbeiten(fs.readFileSync(path.join(aus,`t${k}.step`),'latin1'),{name:d.name,schema}));fs.rmSync(aus,{recursive:true,force:true});return t}
const bbox=s=>{const b=new oc.Bnd_Box_1();oc.BRepBndLib.AddOptimal(s,b,false,false);const p0=b.CornerMin(),p1=b.CornerMax();return [p0.X(),p0.Y(),p0.Z(),p1.X(),p1.Y(),p1.Z()]};
const vol=s=>{const g=new oc.GProp_GProps_1();oc.BRepGProp.VolumeProperties_1(s,g,false,false,false);return Math.abs(g.Mass())};
const trsf=m=>{const t=new oc.gp_Trsf_1();t.SetValues(...m);return t};
const bewegt=(s,m)=>m?new oc.BRepBuilderAPI_Transform_2(s,trsf(m),true).Shape():s;
function vergleiche(text,soll,was){
  const b=new TextEncoder().encode(text);const L=wasmBrep(oc);L.r=L.load(b,'x.step',parseStepHierarchy(b));
  const flaechen=L.uniq.reduce((s,u)=>s+u.faces.length,0),kanten=L.uniq.reduce((s,u)=>s+u.edges.length,0);
  assert.equal(flaechen,soll.flaechen,was+': Flächen');assert.equal(kanten,soll.kanten,was+': Kanten');
  const formen=L.inst.map(I=>L.uniq[I.u].shape.Moved(I.loc));
  const v=formen.reduce((s,f)=>s+vol(f),0);assert.ok(tol(v,soll.vol),was+': Volumen '+v+' statt '+soll.vol);
  const bb=formen.map(bbox).reduce((a,c)=>[Math.min(a[0],c[0]),Math.min(a[1],c[1]),Math.min(a[2],c[2]),Math.max(a[3],c[3]),Math.max(a[4],c[4]),Math.max(a[5],c[5])]);
  const diag=Math.hypot(soll.bb[3]-soll.bb[0],soll.bb[4]-soll.bb[1],soll.bb[5]-soll.bb[2]);
  bb.forEach((x,i)=>assert.ok(Math.abs(x-soll.bb[i])<=1e-6*diag,was+': Hüllquader '+bb+' statt '+soll.bb));
  return L}
const soll=(teile)=>{const fs_=teile.map(t=>bewegt(B.uniq[t.u].shape,t.m));const bb=fs_.map(bbox).reduce((a,c)=>[Math.min(a[0],c[0]),Math.min(a[1],c[1]),Math.min(a[2],c[2]),Math.max(a[3],c[3]),Math.max(a[4],c[4]),Math.max(a[5],c[5])]);
  return {flaechen:teile.reduce((s,t)=>s+B.uniq[t.u].faces.length,0),kanten:teile.reduce((s,t)=>s+B.uniq[t.u].edges.length,0),vol:fs_.reduce((s,f)=>s+vol(f),0),bb}};
// 1) jedes Unikat einzeln, AP214 und AP242, Name als Produktname
const namen=B.uniq.map((_,u)=>teilName(r.inst.find(i=>i.u===u).name));
for(const schema of ['AP214','AP242']){
  const texte=exportiere(namen.map((name,u)=>({name,teile:[{u,m:null}]})),schema);
  texte.forEach((t,u)=>{
    assert.ok(t.replace(/\s+/g,'').includes(`PRODUCT('${stepText(namen[u])}','${stepText(namen[u])}'`.replace(/\s+/g,'')),'Produktname '+namen[u]);
    assert.ok(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/.test(t),'Einheit mm');
    assert.ok(schema==='AP242'?/AP242_MANAGED_MODEL_BASED_3D_ENGINEERING/.test(t):/AUTOMOTIVE_DESIGN/.test(t),'Schema '+schema);
    const L=vergleiche(t,soll([{u,m:null}]),`${schema} ${namen[u]}`);assert.equal(L.inst.length,1);assert.equal(L.r.tree.name,namen[u],'Name nach dem Einlesen');
  });
  console.log(`  ok  ${schema}: ${texte.length} Einzelteile, Flächen/Kanten/Volumen/Hüllquader gleich, Produktname, mm`);
}
// 2) verschobene Komponente: Standard = Originalgeometrie, Option = aktuelle Lage
const i0=r.inst.findIndex(i=>i.name.startsWith('Winkel links'));const I=B.inst[i0];const m0=I.m.slice();
const verschoben=[...m0];verschoben[3]+=12.5;verschoben[7]-=40;verschoben[11]+=3;
const c=Math.cos(0.3),s=Math.sin(0.3);const R=[c,-s,0,s,c,0,0,0,1];const dreh=[ // Drehung um Z vor der Verschiebung
  R[0]*verschoben[0]+R[1]*verschoben[4],R[0]*verschoben[1]+R[1]*verschoben[5],R[0]*verschoben[2]+R[1]*verschoben[6],verschoben[3],
  R[3]*verschoben[0]+R[4]*verschoben[4],R[3]*verschoben[1]+R[4]*verschoben[5],R[3]*verschoben[2]+R[4]*verschoben[6],verschoben[7],
  verschoben[8],verschoben[9],verschoben[10],verschoben[11]];
B.lagen(B.inst.map((x,i)=>i===i0?dreh:x.m));
const [eigen,lage]=exportiere([{name:'Winkel links',teile:[{u:I.u,m:null}]},{name:'Winkel links',teile:[{u:I.u,m:B.inst[i0].m}]}],'AP214');
vergleiche(eigen,soll([{u:I.u,m:null}]),'verschoben, eigenes Koordinatensystem');
vergleiche(lage,soll([{u:I.u,m:dreh}]),'verschoben, Position in der Baugruppe');
const bE=soll([{u:I.u,m:null}]).bb,bL=soll([{u:I.u,m:dreh}]).bb;assert.ok(Math.abs(bE[0]-bL[0])>1,'Lage-Option muss sich unterscheiden');
B.lagen(B.inst.map((x,i)=>i===i0?m0:x.m));
console.log('  ok  verschobene Komponente: ohne Option Originalgeometrie, mit Option aktuelle Lage');
// 3) Unterbaugruppe/mehrere Teile als ein Verbund, Unicode-Name
const alle=B.inst.map(x=>({u:x.u,m:x.m}));const name='Baugruppe Şasi – Ölçü ÄÖÜß';
const [ver]=exportiere([{name,teile:alle}],'AP242');const LV=vergleiche(ver,soll(alle),'Verbund');assert.ok(ver.includes(stepText(name)));
assert.equal(LV.r.tree.name,name,'Unicode-Name nach dem Einlesen');
console.log('  ok  Verbund aller Teile in Baugruppenlage, Unicode-Name');
if(brepDir)fs.rmSync(brepDir,{recursive:true,force:true});
// 4) Farben (testdaten/farbbaugruppe.step: Platte rot mit grüner Oberseite, Bolzen gelb, zweiter Bolzen per Instanzfarbe blau)
//    native: Kern liest Teil-/Flächen-/Instanzfarben, Export → erneut einlesen → gleiche Farben. WASM: Export ohne Farben (Hinweis in der App).
{const fDatei='testdaten/farbbaugruppe.step';const fb=new Uint8Array(fs.readFileSync(fDatei));
  const hex=c=>c==null?null:(c&0xffffff).toString(16).padStart(6,'0');
  // wie farbAuftrag() in main.js
  const auftragF=(R,i)=>{const I=R.inst[i],u=R.uniq[I.u];const k=I.farbe??u.farbe;const fl=new Map();if(u.ff)u.ff.forEach((c,fi)=>{if(c)fl.set(fi,c&0xffffff)});if(I.ff)for(const [fi,c] of Object.entries(I.ff))fl.set(+fi,c);
    if(k==null&&!fl.size)return null;return (k!=null?hex(k):'-')+(fl.size?';'+[...fl].map(([fi,c])=>fi+':'+hex(c)).join(','):'')};
  // Flächenfarben mit Lage der Fläche (Mittel-z der Dreiecke) – unabhängig von der Flächennummer
  const flaechenFarben=(R,i)=>{const I=R.inst[i],u=R.uniq[I.u];const aus=[];if(!u.ff)return aus;u.ff.forEach((c,fi)=>{if(!c)return;let z=0,n=0;
      for(let t=0;t<u.f.length;t++)if(u.f[t]===fi)for(let k=0;k<3;k++){const v=u.i[t*3+k];z+=I.m[8]*u.p[v*3]+I.m[9]*u.p[v*3+1]+I.m[10]*u.p[v*3+2]+I.m[11];n++}
      aus.push(hex(c)+'@z'+Math.round(z/n))});return aus};
  const farbBild=R=>R.inst.map((I,i)=>({koerper:hex(I.farbe??R.uniq[I.u].farbe),flaechen:flaechenFarben(R,i)})).map(x=>x.koerper+(x.flaechen.length?'+'+x.flaechen.join(','):'')).sort();
  if(nativ){const F=createBrep(oc);const R=F.load(fb,'farbbaugruppe.step',parseStepHierarchy(fb));
    const bild=farbBild(R);assert.deepEqual(bild,['1933cc','cc1919+19b333@z10','e5cc19'],'Farben gelesen: '+bild);
    const d2=fs.mkdtempSync(path.join(os.tmpdir(),'ef-'));execFileSync(process.env.HASI_KERN||'kern/build/hasi-kern',[fDatei,d2],{stdio:'ignore'});const altBrep=brepDir;brepDir=d2;
    const fNamen=R.inst.map(I=>teilName(I.name));
    // je Instanz einzeln (eigenes Koordinatensystem) und alles als Verbund in Baugruppenlage
    const einzeln=exportiere(R.inst.map((I,i)=>({name:fNamen[i],teile:[{u:I.u,m:null,f:auftragF(R,i)}]})),'AP214');
    const [verbund]=exportiere([{name:'Farbverbund',teile:R.inst.map((I,i)=>({u:I.u,m:I.m,f:auftragF(R,i)}))}],'AP242');
    fs.rmSync(d2,{recursive:true,force:true});brepDir=altBrep;
    einzeln.forEach((t,i)=>{assert.ok(/COLOUR_RGB/.test(t),'Farbe im Export '+fNamen[i]);const b=new TextEncoder().encode(t);const Q=createBrep(oc).load(b,'x.step',parseStepHierarchy(b));
      const soll=farbBild({uniq:R.uniq,inst:[{...R.inst[i],m:[1,0,0,0,0,1,0,0,0,0,1,0]}]});assert.deepEqual(farbBild(Q),soll,'Farben nach Export → Einlesen '+fNamen[i])});
    {const b=new TextEncoder().encode(verbund);const Q=createBrep(oc).load(b,'v.step',parseStepHierarchy(b));assert.deepEqual(farbBild(Q),bild,'Farben im Verbund nach Export → Einlesen')}
    console.log('  ok  Farben: Teil-, Flächen- und Instanzfarbe gelesen; nach Export → Einlesen gleich (einzeln AP214, Verbund AP242)')}
  else{const L=createBrep(oc);L.load(fb,'farbbaugruppe.step',parseStepHierarchy(fb));
    const t=new TextDecoder().decode(L.stepSchreiben({name:'Platte',schema:'AP214',teile:[{u:0,m:null,f:'cc1919'}]}));
    assert.ok(/MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS/.test(t)&&!/COLOUR_RGB/.test(t),'WASM: Export ohne Farben');
    console.log('  ok  WASM: farbige Datei wird ohne Farben exportiert (Hinweis „ohne Farben“ im Dialog)')}}
console.log('OK: Einzelteile als STEP ('+(nativ?'nativer Kern':'WASM')+')');
