// Messen gegen bekannte Sollmaße (testdaten/messteil.step, erzeugt mit tools/make-messteil.py). Toleranz < 0,001 mm.
import assert from 'assert';import fs from 'fs';import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
const B=createBrep(await loadOC());B.load(new Uint8Array(fs.readFileSync(process.argv[2]||'testdaten/messteil.step')),'messteil.step');
const U=B.uniq[0],TOL=1e-4,PI=Math.PI;let n=0;
const eq=(a,b)=>Math.abs(a-b)<1e-6, near3=(p,q)=>p.every((x,i)=>Math.abs(x-q[i])<1e-6);
const face=f=>{const i=U.faces.findIndex(f);assert(i>=0,'Fläche nicht gefunden');return {k:'face',id:i,inst:0}};
const edge=f=>{const i=U.edges.findIndex(f);assert(i>=0,'Kante nicht gefunden');return {k:'edge',id:i,inst:0}};
const vert=p=>{const i=U.verts.findIndex(v=>near3(v.p,p));assert(i>=0,'Eckpunkt nicht gefunden '+p);return {k:'vertex',id:i,inst:0}};
const plane=(n,o)=>f=>f.plane&&near3(f.plane.n,n)&&(o==null||Math.abs(f.plane.o[2]-o)<1e-6||true);
const cylR=r=>f=>f.cyl&&eq(f.cyl.r,r);
const circ=(r,z)=>e=>e.circle&&eq(e.circle.r,r)&&eq(e.circle.c[2],z)&&e.circle.ang>6;
const line=(a,b)=>e=>e.line&&((near3(e.pts[0],a)&&near3(e.pts.at(-1),b))||(near3(e.pts[0],b)&&near3(e.pts.at(-1),a)));
const get=(sels,name)=>{const r=B.measure(sels.map(s=>({...s}))).rows.find(x=>x[0]===name);assert(r,`Wert „${name}“ fehlt`);return r[1]};
const chk=(sels,name,soll)=>{const ist=get(sels,name);const ok=Array.isArray(soll)?soll.every((x,i)=>Math.abs(x-ist[i])<TOL):Math.abs(ist-soll)<TOL;
  assert(ok,`${name}: Ist ${ist} ≠ Soll ${soll}`);n++;console.log(`  ok  ${name.padEnd(28)} ${Array.isArray(soll)?soll.join(' / '):soll.toFixed(6)}`)};
const h=15*Math.tan(PI/6);
const bottom=face(f=>f.plane&&near3(f.plane.n,[0,0,-1])),top=face(f=>f.plane&&near3(f.plane.n,[0,0,1])),slope=face(f=>f.plane&&eq(f.plane.n[2],Math.cos(PI/6))&&f.plane.n[0]>0);
const c10=edge(circ(5,20)),c16=edge(circ(8,20)),z10=face(cylR(5)&&(f=>f.cyl&&eq(f.cyl.r,5)&&f.cyl.ang>6)),z16=face(cylR(8)),fil=face(f=>f.cyl&&eq(f.cyl.r,5)&&f.cyl.ang<2);
const eY60=edge(line([0,60,0],[100,60,0])),eY0=edge(line([5,0,0],[100,0,0])),eX100=edge(line([100,0,0],[100,60,0])),eX0=edge(line([0,5,0],[0,60,0]));
const eSlope=edge(line([85,0,20],[100,0,20-h])),eVert=edge(line([0,60,0],[0,60,20]));
console.log('Einzelelemente:');
chk([c10],'Durchmesser Ø',10);chk([c10],'Radius R',5);chk([c10],'Bogenlänge',10*PI);chk([z16],'Durchmesser Ø',16);
chk([fil],'Radius R',5);chk([fil],'Öffnungswinkel',90);chk([fil],'Bogenlänge',5*PI/2);
chk([eY0],'Kantenlänge',95);chk([eY60],'Kantenlänge',100);chk([eSlope],'Kantenlänge',15/Math.cos(PI/6));chk([eY60],'Kantenmitte',[50,60,0]);
const areaB=6000-(25-25*PI/4)-25*PI-64*PI;chk([bottom],'Flächeninhalt',areaB);
chk([bottom],'Umfang (gesamt)',95+60+100+55+2.5*PI+10*PI+16*PI);chk([bottom],'Umfang (außen)',95+60+100+55+2.5*PI);
console.log('Paare:');
chk([vert([100,0,0]),vert([0,60,20])],'Abstand',Math.hypot(100,60,20));chk([vert([100,0,0]),vert([0,60,20])],'ΔX',100);chk([vert([100,0,0]),vert([0,60,20])],'ΔY',60);chk([vert([100,0,0]),vert([0,60,20])],'ΔZ',20);
chk([c10,c16],'Lochabstand Mitte–Mitte',50);chk([c10,c16],'Abstand Mitte–Mitte',50);chk([c10,c16],'Abstand min.',37);chk([c10,c16],'Abstand max.',63);
chk([z10,z16],'Abstand min.',37);chk([z10,z16],'Abstand max.',63 /* Mantel gegenüber: Achsabstand 50 + 5 + 8 */);chk([z10,z16],'Abstand max. (räumlich)',Math.hypot(63,20));chk([z10,z16],'Achsabstand',50);chk([z10,z16],'Lochabstand Mitte–Mitte',50);
chk([{k:'center',id:c10.id,inst:0},{k:'center',id:c16.id,inst:0}],'Abstand',50);
chk([{k:'axis',src:'face',id:z10.id,inst:0},{k:'axis',src:'face',id:z16.id,inst:0}],'Abstand min.',50);
chk([bottom,top],'Paralleler Abstand',20);chk([bottom,top],'Abstand max.',Math.hypot(100,60,20) /* (100|0|0) → (0|60|20) */);
chk([top,slope],'Winkel Fläche–Fläche',30);chk([eSlope,eY0],'Winkel Kante–Kante',30);chk([eSlope,bottom],'Winkel Kante–Fläche',30);
chk([eVert,bottom],'Winkel Kante–Fläche',90);chk([eY60,top],'Winkel Kante–Fläche',0);chk([eX100,eY60],'Winkel Kante–Kante',90);
chk([eY0,eY60],'Paralleler Abstand',60);chk([eY0,eY60],'Abstand max.',Math.hypot(100,60));
chk([{k:'mid',id:eY60.id,inst:0},{k:'mid',id:eY0.id,inst:0}],'Abstand',Math.hypot(2.5,60));
chk([eY0,eX100,eY60,eX0],'Gesamtlänge (4 Kanten)',310);
console.log(`OK: ${n} Messungen innerhalb ${TOL} mm`);
// Blech: Testblech (Z-Profil s=2, ri=3, 2×90°; Flansch 1 außen 60, Steg außen 32, Flansch 2 außen 50 bis virtuellen Knick)
{const B2=createBrep(await loadOC());B2.load(new Uint8Array(fs.readFileSync('public/testblech.step')),'t.step');const U2=B2.uniq[0];
 const fi=U2.faces.findIndex(f=>f.cyl&&Math.abs(f.cyl.r-3)<1e-6);const fo=U2.faces.findIndex(f=>f.cyl&&Math.abs(f.cyl.r-5)<1e-6);
 const row=(id,name)=>{const r=B2.measure([{k:'face',id,inst:0}]).rows.find(x=>x[0]===name);assert(r,name+' fehlt');return r[1]};
 const c=(id,name,soll)=>{const v=row(id,name);assert(Math.abs(v-soll)<TOL,`${name}: ${v} ≠ ${soll}`);n++;console.log(`  ok  ${name.padEnd(28)} ${soll.toFixed(6)}`)};
 console.log('Blech (Ein-Klick auf Rundung):');
 for(const id of [fi,fo]){c(id,'Radius innen Ri',3);c(id,'Radius außen Ra',5);c(id,'Biegewinkel',90);c(id,'Blechdicke',2);c(id,'Bogenlänge innen',1.5*PI);c(id,'Bogenlänge außen',2.5*PI)}
 c(fi,'Bogenlänge (angeklickt)',1.5*PI);c(fo,'Bogenlänge (angeklickt)',2.5*PI);
 const legs=B2.bendInfo(0,fi).legs.map(l=>[l.aussen,l.innen]).sort((a,b)=>a[0]-b[0]);console.log('  Schenkel',JSON.stringify(legs));
 // Biegung 2: Steg gerade 22 (außen) bzw. 22 (innen), Flansch 2 gerade 40; + R·tan45°
 const soll=[[22+5,22+3],[40+5,40+3]];legs.forEach((l,i)=>l.forEach((v,j)=>{assert(Math.abs(v-soll[i][j])<TOL,`Schenkel ${v} ≠ ${soll[i][j]}`);n++}));
 c(fi,'Außenmaß über die Biegung',27+45);
 const gl=B2.bendInfo(0,fi).legs.map(l=>[l.geradeAussen,l.geradeInnen]).sort((a,b)=>a[0]-b[0]);[[22,22],[40,40]].forEach((r,i)=>r.forEach((v,j)=>{assert(Math.abs(gl[i][j]-v)<TOL,'gerader Teil '+gl[i][j]+' ≠ '+v);n++}));
 const sb=B2.sheet(0.5).bends;assert(sb.every(b=>b.schenkel.length===2),'Schenkel in Biegetabelle');n++;
 for(const nm of ['Schenkel 1 (bis Biegepunkt) außen','Schenkel 1 gerader Teil innen'])assert(row(fi,nm)!=null);console.log('  ok  Schenkel außen/innen          27/25, 45/43');
}
console.log(`OK gesamt: ${n} Messungen`);
await import('./test-messen-faz1.mjs');
await import('./test-hoehe.mjs');
