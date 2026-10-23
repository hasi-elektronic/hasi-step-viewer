// Faz 1 DXF für den Laser: CIRCLE/ARC-Bögen, geschlossene LWPOLYLINE mit Bulge, Layer KONTUR / BIEGELINIEN_AUF / BIEGELINIEN_AB / BESCHRIFTUNG,
// $INSUNITS = 4 (mm). Jede Datei wird zweimal gelesen: eigener Gruppencode-Leser (immer) und ezdxf (Python, in CI immer; lokal über $PYTHON).
// Außerdem: „Feste Fläche wählen“ ändert die Abwicklung eines symmetrischen Teils nicht. Belege nach $QA_DIR (z. B. /workspace/qa/faz1).
import assert from 'assert';import fs from 'fs';import os from 'os';import path from 'path';import {execFileSync} from 'child_process';
import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
const B=createBrep(await loadOC());const PI=Math.PI,TOL=1e-3;
const QA=process.env.QA_DIR||null;const AUS=QA?path.join(QA,'dxf'):fs.mkdtempSync(path.join(os.tmpdir(),'dxf-'));fs.mkdirSync(AUS,{recursive:true});
const run=(f,opts={modus:'manuell',K:0.5})=>{B.load(new Uint8Array(fs.readFileSync('testdaten/'+f)),f);return B.sheet(opts)};
const ok=t=>console.log('  ok  '+t);
// Eigener Leser: Gruppencode/Wert-Paare → Header, Layer, Entities
function lies(txt){const z=txt.split(/\r?\n/);assert(z.length%2===1||z.at(-1)==='','DXF: ungerade Zeilenzahl');const p=[];for(let i=0;i+1<z.length;i+=2)p.push([+z[i].trim(),z[i+1]]);
  assert(p.at(-1)[1]==='EOF','DXF endet nicht mit EOF');const hdr={},lay=[],ent=[];let sek=null,cur=null,hv=null;
  for(const [c,v] of p){if(c===0&&v==='SECTION'){sek='?';continue}if(c===2&&sek==='?'){sek=v;continue}if(c===0&&v==='ENDSEC'){sek=null;cur=null;continue}
    if(sek==='HEADER'){if(c===9)hv=v;else if(hv){hdr[hv]=v;hv=null}}
    else if(sek==='TABLES'){if(c===0)cur=v==='LAYER'?{}:null;if(cur&&c===2){cur.name=v;lay.push(v)}}
    else if(sek==='ENTITIES'){if(c===0){cur={typ:v,g:[]};ent.push(cur)}else cur.g.push([c,v])}}
  for(const e of ent){const w=c=>e.g.find(x=>x[0]===c)?.[1];e.layer=w(8);if(e.typ==='CIRCLE')e.c=[+w(10),+w(20)],e.r=+w(40);
    if(e.typ==='LWPOLYLINE'){e.zu=(+w(70)&1)===1;e.n=+w(90);e.pts=[];for(const [c,v] of e.g){if(c===10)e.pts.push({x:+v,b:0});if(c===20)e.pts.at(-1).y=+v;if(c===42)e.pts.at(-1).b=+v}
      assert.equal(e.pts.length,e.n,'LWPOLYLINE: Punktzahl ≠ 90')}}
  return {hdr,lay,ent}}
// Ausdehnung einer LWPOLYLINE mit Bulges (Bogen-Extrempunkte mitgezählt)
function ausdehnung(ents){let mn=[1e18,1e18],mx=[-1e18,-1e18];const add=(x,y)=>{mn=[Math.min(mn[0],x),Math.min(mn[1],y)];mx=[Math.max(mx[0],x),Math.max(mx[1],y)]};
  for(const e of ents){if(e.typ==='CIRCLE'){add(e.c[0]-e.r,e.c[1]-e.r);add(e.c[0]+e.r,e.c[1]+e.r)}
    if(e.typ==='LWPOLYLINE')e.pts.forEach((a,i)=>{add(a.x,a.y);const b=e.pts[(i+1)%e.pts.length];if(!a.b||(!e.zu&&i===e.pts.length-1))return;
      const th=4*Math.atan(a.b),dx=b.x-a.x,dy=b.y-a.y,ch=Math.hypot(dx,dy),r=ch/(2*Math.sin(Math.abs(th)/2));const mxp=(a.x+b.x)/2,myp=(a.y+b.y)/2,dd=r*Math.cos(Math.abs(th)/2),s=Math.sign(th)*(Math.abs(th)>PI?-1:1);
      const cx=mxp-dy/ch*dd*s,cy=myp+dx/ch*dd*s;const a0=Math.atan2(a.y-cy,a.x-cx);for(let k=0;k<=64;k++){const t=a0+th*k/64;add(cx+r*Math.cos(t),cy+r*Math.sin(t))}})}
  return [mx[0]-mn[0],mx[1]-mn[1]]}
// ezdxf finden (CI: notfalls in ein venv installieren)
function python(){const kand=[process.env.PYTHON,'python3','python'].filter(Boolean);
  for(const p of kand){try{execFileSync(p,['-c','import ezdxf'],{stdio:'ignore'});return p}catch{}}
  if(!process.env.CI)return null;const venv=path.join(os.tmpdir(),'ezdxf-venv'),vp=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
  try{execFileSync('python3',['-m','venv',venv],{stdio:'inherit'});execFileSync(vp,['-m','pip','install','-q','ezdxf'],{stdio:'inherit'});return vp}
  catch{execFileSync('python3',['-m','pip','install','-q','--user','--break-system-packages','ezdxf'],{stdio:'inherit'});return 'python3'}}
const PY=python();if(!PY)console.log('  Hinweis: ezdxf nicht gefunden (PYTHON=…/python setzen) – nur eigener DXF-Leser');
const ezdxf=(dateien,png)=>JSON.parse(execFileSync(PY,['tools/pruefe-dxf.py',...dateien,...(png?['--png',png]:[])],{encoding:'utf8'}));

const faelle=[
  // Winkel mit Ø6, Ø6, Langloch 20×8 im Grundschenkel, Ø10 im Steg, Eckradien R5: 60 × (80 + π/2·3)
  {f:'blech-bohrungen.step',groesse:[60,80+PI/2*3],kreise:[3,3,5],konturen:2,boegen:{aussen:2,langloch:2},biegungen:{BIEGELINIEN_AUF:1}},
  {f:'s-profil.step',groesse:[40,60+PI*4],kreise:[],konturen:1,biegungen:{BIEGELINIEN_AUF:1,BIEGELINIEN_AB:1}},
  {f:'wanne.step',groesse:[52+2*(PI/2*3+16),92+2*(PI/2*3+16)],kreise:[],konturen:1,biegungen:{BIEGELINIEN_AUF:4}},
  {f:'umschlag.step',groesse:[30,60+2*PI],kreise:[],konturen:1,biegungen:{BIEGELINIEN_AUF:1}},
];
const dateien=[];
console.log('DXF schreiben und neu einlesen:');
for(const F of faelle){const s=run(F.f);assert(s.ok&&!s.flat.incomplete,F.f+': '+JSON.stringify(s.fehler));
  for(const mitText of [false,true]){const txt=B.dxf(s.flat,{beschriftung:mitText});const d=lies(txt);const name=F.f.replace('.step',mitText?'-beschriftet.dxf':'.dxf');
    fs.writeFileSync(path.join(AUS,name),txt);dateien.push(path.join(AUS,name));
    assert.equal(d.hdr.$INSUNITS?.trim(),'4',name+': $INSUNITS');assert.equal(d.hdr.$ACADVER,'AC1015');
    const soll=['KONTUR','BIEGELINIEN_AUF','BIEGELINIEN_AB',...(mitText?['BESCHRIFTUNG']:[])];assert.deepEqual(d.lay,soll,name+': Layer '+d.lay);
    const K=d.ent.filter(e=>e.layer==='KONTUR');assert(K.every(e=>e.typ==='CIRCLE'||e.typ==='LWPOLYLINE'),name+': Kontur nur aus CIRCLE/LWPOLYLINE');
    const kr=K.filter(e=>e.typ==='CIRCLE').map(e=>e.r).sort((a,b)=>a-b);assert.deepEqual(kr.map(r=>+r.toFixed(4)),F.kreise,name+': Kreise '+kr);
    const pl=K.filter(e=>e.typ==='LWPOLYLINE');assert.equal(pl.length,F.konturen,name+': Konturen');assert(pl.every(e=>e.zu),name+': Kontur nicht geschlossen');
    const gr=ausdehnung(K),sg=[...s.flat.size];assert(gr.every((v,i)=>Math.abs(v-sg[i])<TOL),`${name}: DXF ${gr} ≠ Anzeige ${sg}`);
    assert([...sg].sort((a,b)=>a-b).every((v,i)=>Math.abs(v-F.groesse[i])<TOL),`${name}: Zuschnitt ${sg} ≠ ${F.groesse}`);
    const bl={};for(const e of d.ent.filter(e=>e.typ==='LINE'))bl[e.layer]=(bl[e.layer]||0)+1;assert.deepEqual(bl,F.biegungen,name+': Biegelinien '+JSON.stringify(bl));
    const tx=d.ent.filter(e=>e.typ==='TEXT');assert.equal(tx.length,mitText?s.bends.length:0,name+': Beschriftung');
    if(mitText)assert(tx.every(e=>/^B\d+ (AUF|AB) [\d,]+%%d Ri [\d,]+$/.test(e.g.find(x=>x[0]===1)[1])),name+': Text');
    if(F.boegen&&!mitText){const b=pl.map(e=>e.pts.filter(p=>p.b).length).sort();assert.deepEqual(b,[F.boegen.aussen,F.boegen.langloch].sort(),name+': Bögen '+b);
      assert(pl.every(e=>e.pts.filter(p=>p.b).every(p=>Math.abs(Math.abs(p.b)-Math.tan(PI/8))<1e-9||Math.abs(Math.abs(p.b)-1)<1e-9)),'Bulge: 90°-Eckradius tan(22,5°), Langloch-Halbkreis 1')}
    ok(`${name.padEnd(34)} ${sg.map(v=>v.toFixed(4)).join(' × ')}, ${kr.length} Kreise, ${pl.length} geschlossene Konturen${mitText?', '+tx.length+' Texte':''}`)}}
if(PY){console.log('ezdxf:');const R=ezdxf(dateien,QA?path.join(QA,'dxf'):null);if(QA)fs.writeFileSync(path.join(QA,'dxf','ezdxf-pruefung.json'),JSON.stringify(R,null,1));
  for(const r of R){const F=faelle.find(x=>r.datei.startsWith(x.f.replace('.step','')));const s=run(F.f);
    assert.equal(r.insunits,4);assert.equal(r.audit_fehler,0,r.datei+': ezdxf-Audit');assert.equal(r.version,'AC1015');
    assert.deepEqual(r.kreise.map(k=>k.r).sort((a,b)=>a-b),F.kreise,r.datei+': ezdxf-Kreise');assert(r.kreise.every(k=>k.layer==='KONTUR'));
    assert(r.polylinien.filter(p=>p.layer==='KONTUR').every(p=>p.geschlossen)&&r.polylinien.length===F.konturen,r.datei+': ezdxf-Konturen');
    assert(r.kontur_groesse.every((v,i)=>Math.abs(v-s.flat.size[i])<TOL),`${r.datei}: ezdxf ${r.kontur_groesse} ≠ Anzeige ${s.flat.size}`);
    ok(`ezdxf ${r.datei.padEnd(28)} Audit 0, ${r.kreise.length} CIRCLE r=${r.kreise.map(k=>k.r).join('/')||'–'}, Kontur ${r.kontur_groesse.join(' × ')}`)}}
// Bohrungsmittelpunkte im Blech-Winkel: (15|15), (15|45) im Grundschenkel (von der freien Kante x = 0), Ø10 im Steg 20 mm über der Außenseite
{const s=run('blech-bohrungen.step');const d=lies(B.dxf(s.flat));const kr=d.ent.filter(e=>e.typ==='CIRCLE');const big=kr.find(e=>e.r>4),kl=kr.filter(e=>e.r<4);
  const ax=s.flat.size[0]>s.flat.size[1]?0:1,q=1-ax;assert(Math.abs(Math.abs(kl[0].c[q]-kl[1].c[q])-30)<TOL,'Ø6-Abstand 30');
  const rand=v=>Math.min(v,s.flat.size[ax]-v);assert(kl.every(k=>Math.abs(rand(k.c[ax])-15)<TOL),'Ø6 15 mm vom Rand');
  // Steg: Außenmaß bis Lochmitte = 50 (Grund) + π/2·3 (BZ) + (20 − 3) … gemessen von der Kante x = 0 auf der Grundseite
  assert(Math.abs(rand(big.c[ax])-(80+PI/2*3-(33-20)))<TOL||Math.abs(rand(big.c[ax])-(33-20))<TOL,'Ø10-Lage '+big.c);ok('Lochlagen im Zuschnitt (15 / 15, Abstand 30, Ø10 auf dem Steg)')}
console.log('Feste Fläche wählen:');
{B.load(new Uint8Array(fs.readFileSync('testdaten/wanne.step')),'wanne.step');const auto=B.sheet(0.5);const U=B.uniq[0];
  const soll=[...auto.flat.size].sort((a,b)=>a-b);const fl=auto.flaeche.erreicht;let n=0;
  const haut=U.faces.map((f,i)=>[f,i]).filter(([f])=>f.plane&&U.faces.some(g=>g.plane&&g.plane.n.every((v,k)=>Math.abs(v+f.plane.n[k])<1e-6)&&Math.abs(Math.abs(f.plane.n.reduce((a,v,k)=>a+v*(g.plane.o[k]-f.plane.o[k]),0))-auto.t)<1e-3));
  for(const [,i] of haut){const r=B.sheet({modus:'manuell',K:0.5,basis:i});if(r.flat?.incomplete||!r.ok)continue;n++;
    assert(r.basisGewaehlt&&r.basis===i);const g=[...r.flat.size].sort((a,b)=>a-b);assert(g.every((v,k)=>Math.abs(v-soll[k])<1e-4),`Fläche ${i}: ${g} ≠ ${soll}`);
    assert.equal(r.bends.length,auto.bends.length);assert(Math.abs(r.flaeche.erreicht-fl)<1e-3*fl&&Math.abs(r.flaeche.anteil-1)<1e-6,'abgewickelte Fläche')}
  assert(n>=6,'zu wenige feste Flächen geprüft: '+n);ok(`Wanne: ${n} verschiedene feste Flächen → Zuschnitt immer ${soll.map(v=>v.toFixed(4)).join(' × ')}`);
  const stirn=U.faces.findIndex((f,i)=>f.plane&&!haut.some(([,j])=>j===i));const r=B.sheet({modus:'manuell',K:0.5,basis:stirn});assert(r.fehler.some(f=>/Stirnfläche/.test(f)),'Stirnfläche muss abgelehnt werden');
  const zyl=U.faces.findIndex(f=>f.cyl);assert(B.sheet({modus:'manuell',K:0.5,basis:zyl}).fehler.some(f=>/nicht eben/.test(f)));ok('Stirn- und Biegefläche als feste Fläche abgelehnt')}
console.log('OK: DXF und feste Fläche');
