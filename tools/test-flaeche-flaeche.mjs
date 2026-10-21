// Fläche zu Fläche messen (wie ZW3D „Instant Measure“) – Abnahme nach specs/flaeche-zu-flaeche.md, Tabellen 5.1–5.4.
// Flächen werden über ihre Geometrie gefunden (Normale + Punkt bzw. Zylinderradius + Achse), nie über Indizes:
// so läuft derselbe Test mit dem WASM-Kern und mit KERN=native (hasi-kern + BREP) identisch.
// WERTE_JSON=pfad schreibt die Soll/Ist-Tabelle als JSON (für den Bericht).
import assert from 'assert';import fs from 'fs';import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';import {parseStepHierarchy} from '../src/stephier.js';
import {ebeneEbene,ebeneAchse,achseAchse,innenWinkel,istParallel,kopierWert,lotPaar} from '../src/messen-hilfen.js';
const B=createBrep(await loadOC());const TOL=1e-4;let n=0;const tabelle=[];
const tp=(m,q)=>[m[0]*q[0]+m[1]*q[1]+m[2]*q[2]+m[3],m[4]*q[0]+m[5]*q[1]+m[6]*q[2]+m[7],m[8]*q[0]+m[9]*q[1]+m[10]*q[2]+m[11]];
const td=(m,q)=>{const v=[m[0]*q[0]+m[1]*q[1]+m[2]*q[2],m[4]*q[0]+m[5]*q[1]+m[6]*q[2],m[8]*q[0]+m[9]*q[1]+m[10]*q[2]];const l=Math.hypot(...v)||1;return v.map(x=>x/l)};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],nrm=a=>{const l=Math.hypot(...a);return a.map(x=>x/l)};
let teil='',baum=null;
function laden(name){teil=name;const bytes=new Uint8Array(fs.readFileSync('testdaten/'+name+'.step'));const r=B.load(bytes,name+'.step',parseStepHierarchy(bytes));baum=r.tree;return r}
function instVon(name){let hit=null;const w=k=>{if(k.name===name)hit=k;k.children.forEach(w)};w(baum);if(!hit)throw new Error('Knoten fehlt: '+name);return hit.bodies[0]}
// Schwerpunkt einer Fläche aus dem Anzeigenetz (nur zum Unterscheiden gleich liegender Flächen)
function netzMitte(I,fi){const U=B.uniq[I.u],p=U.p,ix=U.i,f=U.f;let s=[0,0,0],k=0;for(let t=0;t<f.length;t++){if(f[t]!==fi)continue;for(let j=0;j<3;j++){const v=ix[t*3+j]*3;s[0]+=p[v];s[1]+=p[v+1];s[2]+=p[v+2];k++}}return k?tp(I.m,s.map(x=>x/k)):null}
/** Ebene Fläche mit äußerer Normale n durch Punkt p (Modellkoordinaten); bei mehreren die mit dem nächsten Schwerpunkt. */
function E(n,p,inst=0){const I=B.inst[inst],F=B.uniq[I.u].faces;n=nrm(n);const c=[];
  F.forEach((f,i)=>{if(!f.plane)return;const fn=td(I.m,f.plane.n),fo=tp(I.m,f.plane.o);if(dot(fn,n)<0.99999)return;if(Math.abs(dot(sub(p,fo),n))>1e-3)return;c.push(i)});
  if(!c.length)throw new Error(`${teil}: ebene Fläche n=${n.map(x=>x.toFixed(3))} durch ${p} fehlt`);
  if(c.length>1){const d=i=>{const m=netzMitte(I,i);return Math.hypot(...sub(m,p))};c.sort((a,b)=>d(a)-d(b))}
  return {k:'face',id:c[0],inst}}
/** Zylinderfläche mit Radius r, deren Achse durch c geht und parallel zu d ist. */
function Z(r,c,d,inst=0){const I=B.inst[inst],F=B.uniq[I.u].faces;d=nrm(d);
  const i=F.findIndex(f=>{if(!f.cyl||Math.abs(f.cyl.r-r)>1e-6)return false;const fc=tp(I.m,f.cyl.c),fd=td(I.m,f.cyl.d);if(Math.abs(Math.abs(dot(fd,d))-1)>1e-6)return false;
    const w=sub(c,fc);const q=sub(w,fd.map(x=>x*dot(w,fd)));return Math.hypot(...q)<1e-3});
  if(i<0)throw new Error(`${teil}: Zylinder r=${r} Achse durch ${c} fehlt`);return {k:'face',id:i,inst}}
const messen=(sels,opts={})=>B.measure(sels.map(s=>({...s})),opts);
function wert(r,name){const x=r.rows.find(q=>q[0]===name);if(!x)throw new Error(`${teil}: Zeile „${name}“ fehlt in: ${r.rows.map(q=>q[0]).join(', ')}`);return x[1]}
function chk(was,ist,soll,tol=TOL){const ok=typeof soll==='string'?String(ist).includes(soll):Math.abs(ist-soll)<tol;tabelle.push({teil,was,soll,ist,ok});
  assert(ok,`${teil} ${was}: Ist ${ist} ≠ Soll ${soll}`);n++;console.log(`  ok  ${(teil+' '+was).padEnd(62)} ${typeof soll==='number'?soll.toFixed(4):soll}`)}
const haupt=r=>r.rows.find(x=>x[3]);
// Fall A: Hauptwert „Abstand senkrecht“, Messlinie = Lot, ΔX/ΔY/ΔZ des Lots
function A(name,a,b,soll,dx){const r=messen([a,b]);chk(name+': Abstand senkrecht',wert(r,'Abstand senkrecht'),soll);
  assert.equal(haupt(r)[0],'Abstand senkrecht',teil+' '+name+': Hauptwert');assert.equal(r.wahl,'Abstand senkrecht');
  chk(name+': Bemaßungslinie = Lot',Math.hypot(...sub(r.gfx[0][1],r.gfx[0][0])),soll);
  if(dx){chk(name+': ΔX',wert(r,'ΔX'),dx[0]);chk(name+': ΔY',wert(r,'ΔY'),dx[1]);chk(name+': ΔZ',wert(r,'ΔZ'),dx[2])}return r}
const S30=Math.sqrt(3)/2;

console.log('5.1 Ebene ∥ Ebene');
laden('messteil');
const mBoden=E([0,0,-1],[50,30,0]),mDeckel=E([0,0,1],[50,30,20]),mX0=E([-1,0,0],[0,30,10]),mX100=E([1,0,0],[100,30,5]),mY0=E([0,-1,0],[50,0,10]),mY60=E([0,1,0],[50,60,10]);
const mSchraege=E([0.5,0,S30],[85,0,20]),mZ10=Z(5,[25,30,0],[0,0,1]),mZ16=Z(8,[75,30,0],[0,0,1]);
A('Boden–Deckel',mBoden,mDeckel,20,[0,0,20]);A('x0–x100',mX0,mX100,100);A('y0–y60',mY0,mY60,60);
chk('Boden–Deckel: Lage',wert(messen([mBoden,mDeckel]),'Lage'),'gegenüberliegend');
// Klickpunkt bestimmt den Fußpunkt des Lots (ZW3D: am Klickpunkt)
{const r=messen([{...mBoden,p:[10,40,0]},mDeckel]);chk('Lot am Klickpunkt x',r.gfx[0][0][0],10);chk('Lot am Klickpunkt y',r.gfx[0][0][1],40)}
laden('block-45');
const b45=k=>E(...k);
A('f0–f1',b45([[-1,-1,0],[-0.607,-25.962,0]]),b45([[1,1,0],[55.962,30.607,0]]),80,[56.5685,56.5685,0]);
A('f2–f3',b45([[1,-1,0],[-0.607,-25.962,0]]),b45([[-1,1,0],[-35.962,9.393,0]]),50);
A('f4–f5',E([0,0,-1],[0,0,0]),E([0,0,1],[0,0,30]),30,[0,0,30]);
laden('block-schraeg');
{const n0=[-0.70710678,-0.61237244,-0.35355339],n4=[0,0.5,-S30];
 A('f0–f1',E(n0,[-5.607,-35.304,4.029]),E(n0.map(x=>-x),[50.962,13.686,32.313]),80,[56.5685,48.9898,28.2843]);
 A('f4–f5',E(n4,[-5.607,-35.304,4.029]),E(n4.map(x=>-x),[-5.607,-50.304,30.009]),30,[0,15,25.9808])}
laden('welle');
{const d=[-0.40557,0.40557,-0.81915];const c1=[30,0,20];const e1=E(d,c1),e2=E(d.map(x=>-x),[54.335,-24.335,69.149]),e4=E(d.map(x=>-x),[66.502,-36.502,93.724]);
 A('Stirn–Stirn',e1,e4,90);A('Stirn–Absatz',e1,e2,60);
 const z20=Z(20,c1,d),z125=Z(12.5,c1,d);
 console.log('5.3 Zylinder (welle)');
 const k=messen([z20,z125]);chk('Ø40–Ø25: Lage',wert(k,'Lage'),'koaxial');chk('Ø40–Ø25: Radiusdifferenz',wert(k,'Radiusdifferenz'),7.5);
 const s=messen([e1,z20]);chk('Stirn–Ø40: Winkel Achse–Fläche',wert(s,'Winkel Achse–Fläche'),90);chk('Stirn–Ø40: Hinweis',wert(s,'Hinweis'),'senkrecht')}
laden('blech-bohrungen');
const bbX0=E([-1,0,0],[0,30,0]),bbX54=E([1,0,0],[54,30,20]),bbZ1=E([0,0,1],[25,30,1]),bbZm1=E([0,0,-1],[25,30,-1]),bbZ33=E([0,0,1],[53,30,33]),bbX52=E([-1,0,0],[52,30,20]),bbY0=E([0,-1,0],[36,0,6.662]),bbY60=E([0,1,0],[36,60,6.662]);
A('Blechdicke z',bbZ1,bbZm1,2);A('Blechdicke x',bbX52,bbX54,2);A('y0–y60',bbY0,bbY60,60);
A('x0–x54 (früher 54,037)',bbX0,bbX54,54,[54,0,0]);A('z1–z33 (früher 32,062)',bbZ1,bbZ33,32,[0,0,32]);
laden('scharf-l');
{const sl0=E([0,0,-1],[25,20,0]),sl1=E([1,0,0],[50,20,15]),sl2=E([0,0,1],[49,20,30]),sl3=E([-1,0,0],[48,20,15]),sl4=E([0,0,1],[24,20,2]),sl5=E([-1,0,0],[0,20,1]),sl6=E([0,-1,0],[30,0,1]),sl7=E([0,1,0],[30,40,1]);
 A('f0–f2',sl0,sl2,30);A('f0–f4',sl0,sl4,2);A('f1–f5',sl1,sl5,50);A('f1–f3',sl1,sl3,2);A('f6–f7',sl6,sl7,40);
 console.log('5.2 konkave Kante');const r=messen([sl3,sl4]);chk('f3–f4: Winkel',wert(r,'Winkel Fläche–Fläche'),90);chk('f3–f4: Innenwinkel',wert(r,'Innenwinkel (im Material)'),270);chk('f3–f4: Kante',wert(r,'Kante'),'konkav')}
laden('schraeger-fuss');
const sfN=[0.98776,0,-0.15603];// Normale der schrägen Wand (380 hoch, 60 Versatz)
const sfFuss=E([0,0,-1],[20,15,0]),sfKopf=E([0,0,1],[80,15,380]),sfS1=E(sfN,[40,15,0]),sfS3=E(sfN.map(x=>-x),[60,15,380]),sfY0=E([0,-1,0],[50,0,190]),sfY30=E([0,1,0],[50,30,190]);
{const r=A('Fuß–Kopf (früher 380,526)',sfFuss,sfKopf,380,[0,0,380]);chk('Fuß–Kopf: versetzt',wert(r,'Lage'),'versetzt');chk('Fuß–Kopf: Höhe (vertikal)',wert(r,'Höhe (vertikal)'),380)}
A('schräg–schräg',sfS1,sfS3,39.5105,[39.0270,0,6.1622]);A('y0–y30',sfY0,sfY30,30);
laden('messbaugruppe');
const iB=instVon('Boden'),iK=instVon('Klotz'),iA=instVon('Bolzen A'),iBB=instVon('Bolzen B'),iC=instVon('Bolzen C');
const gB50=E([1,0,0],[50,0,5],iB),gBm50=E([-1,0,0],[-50,0,5],iB),gBoben=E([0,0,1],[0,0,5],iB),gK80=E([-1,0,0],[80,0,25],iK);
const zA=Z(4,[0,0,5],[0,0,1],iA),zB=Z(5,[50,0,5],[0,0,1],iBB),zC=Z(3,[0,30,0],[0,1,0],iC);
A('Boden x=50 – Klotz x=80 (früher 31,623)',gB50,gK80,30,[30,0,0]);

console.log('5.2 Ebene ∦ Ebene');
laden('messteil');
{const r=messen([mDeckel,mSchraege]);chk('Deckel–Schräge: Winkel',wert(r,'Winkel Fläche–Fläche'),30);chk('Deckel–Schräge: Innenwinkel',wert(r,'Innenwinkel (im Material)'),150);
 chk('Deckel–Schräge: Abstand min.',wert(r,'Abstand min.'),0);chk('Deckel–Schräge: ⟂ min.',wert(r,'Abstand senkrecht zu Fläche 1 min.'),0);chk('Deckel–Schräge: ⟂ max.',wert(r,'Abstand senkrecht zu Fläche 1 max.'),15*Math.tan(Math.PI/6));
 assert.equal(haupt(r)[0],'Winkel Fläche–Fläche');assert.ok(r.ff.winkelMass,'Winkelbemaßung fehlt');
 const w=r.ff.winkelMass;chk('Deckel–Schräge: Winkelbemaßung',Math.acos(dot(w.u1,w.u2))*180/Math.PI,30)}
{const r=messen([mBoden,mSchraege]);chk('Boden–Schräge: Winkel',wert(r,'Winkel Fläche–Fläche'),30);chk('Boden–Schräge: Abstand min.',wert(r,'Abstand min.'),20-15*Math.tan(Math.PI/6));
 chk('Boden–Schräge: ⟂ min.',wert(r,'Abstand senkrecht zu Fläche 1 min.'),20-15*Math.tan(Math.PI/6));chk('Boden–Schräge: ⟂ max.',wert(r,'Abstand senkrecht zu Fläche 1 max.'),20);assert.equal(haupt(r)[0],'Abstand min.')}
{const r=messen([mX100,mSchraege]);chk('x100–Schräge: Winkel',wert(r,'Winkel Fläche–Fläche'),60);chk('x100–Schräge: Innenwinkel',wert(r,'Innenwinkel (im Material)'),120);
 chk('x100–Schräge: ⟂ min.',wert(r,'Abstand senkrecht zu Fläche 1 min.'),0);chk('x100–Schräge: ⟂ max.',wert(r,'Abstand senkrecht zu Fläche 1 max.'),15)}
laden('schraeger-fuss');
{const r=messen([sfFuss,sfS1]);const phi=Math.acos(0.15603)*180/Math.PI;chk('Fuß–schräg: Winkel',wert(r,'Winkel Fläche–Fläche'),81.0274,1e-3);chk('Fuß–schräg: Innenwinkel',wert(r,'Innenwinkel (im Material)'),98.9726,1e-3);
 chk('Fuß–schräg: ⟂ min.',wert(r,'Abstand senkrecht zu Fläche 1 min.'),0);chk('Fuß–schräg: ⟂ max.',wert(r,'Abstand senkrecht zu Fläche 1 max.'),380);void phi}

console.log('5.3 Ebene – Zylinder, Zylinder – Zylinder');
laden('messteil');
const C=(name,a,b,haupt0,soll,mn,mx)=>{const r=messen([a,b]);chk(name+': '+haupt0,wert(r,haupt0),soll);assert.equal(haupt(r)[0],haupt0,teil+' '+name+': Hauptwert');
  if(mn!=null)chk(name+': Mantelabstand min.',wert(r,'Mantelabstand min.'),mn);if(mx!=null){chk(name+': Mantelabstand max.',wert(r,'Mantelabstand max.'),mx);chk(name+': Abstand max.',wert(r,'Abstand max.'),mx)}
  if(r.gfx[0])chk(name+': Bemaßungslinie',Math.hypot(...sub(r.gfx[0][1],r.gfx[0][0])),soll);return r};
C('x0 – Ø10',mX0,mZ10,'Abstand Fläche–Achse',25,20,30);C('y0 – Ø16',mY0,mZ16,'Abstand Fläche–Achse',30,22,38);C('Ø16 – y0 (umgekehrt)',mZ16,mY0,'Abstand Fläche–Achse',30,22,38);
C('Ø10 – Ø16',mZ10,mZ16,'Achsabstand',50,37,63);
laden('blech-bohrungen');
{const z6a=Z(3,[15,15,0],[0,0,1]),z6b=Z(3,[15,45,0],[0,0,1]),z10=Z(5,[0,30,20],[1,0,0]);
 C('y0 – Ø6',bbY0,z6a,'Abstand Fläche–Achse',15,12,18);C('z=−1 – Ø10',bbZm1,z10,'Abstand Fläche–Achse',21,16,26);C('Ø6 – Ø6',z6a,z6b,'Achsabstand',30,24,36);
 const r=messen([bbX0,z10]);chk('x0 – Ø10: Winkel Achse–Fläche',wert(r,'Winkel Achse–Fläche'),90);chk('x0 – Ø10: Hinweis',wert(r,'Hinweis'),'Achse steht senkrecht zur Fläche')}
laden('messbaugruppe');
C('Boden oben – Bolzen C',gBoben,zC,'Abstand Fläche–Achse',5,2,8);C('Boden x=−50 – Bolzen A',gBm50,zA,'Abstand Fläche–Achse',50,46,54);
{const r=C('Boden x=50 – Bolzen B',gB50,zB,'Abstand Fläche–Achse',0,-5,5);chk('Boden x=50 – Bolzen B: Hinweis',wert(r,'Hinweis'),'schneidet')}
C('Bolzen A – B',zA,zB,'Achsabstand',50,41,59);
{const r=messen([zA,zC]);chk('Bolzen A – C: Achswinkel',wert(r,'Achswinkel'),90);chk('Bolzen A – C: Achsabstand',wert(r,'Achsabstand'),0);chk('Bolzen A – C: Mittenabstand',wert(r,'Abstand Mitte–Mitte'),Math.hypot(...sub(r.linien['Abstand Mitte–Mitte'][1],r.linien['Abstand Mitte–Mitte'][0])))}

console.log('Toleranter Parallel-Test (0,01°) und reine Rechenhilfen');teil='Rechenhilfen';
{const e1={o:[0,0,0],n:[0,0,1]},k=a=>({o:[0,0,10],n:[Math.sin(a*Math.PI/180),0,Math.cos(a*Math.PI/180)]});
 assert.ok(ebeneEbene(e1,k(0.005)).parallel,'0,005° muss parallel sein');assert.ok(!ebeneEbene(e1,k(0.02)).parallel,'0,02° darf nicht parallel sein');
 chk('Ebene–Ebene 0,005°: Abstand',ebeneEbene(e1,k(0.005)).abstand,10);chk('Ebene–Ebene 0,02°: Winkel',ebeneEbene(e1,k(0.02)).winkel,0.02,1e-9);
 assert.ok(istParallel([1,0,0],[-1,1e-5,0]));assert.equal(ebeneAchse(e1,{c:[0,0,7],d:[1,0,0],r:2}).abstand,7);assert.equal(ebeneAchse(e1,{c:[0,0,7],d:[0,0,1]}).lage,'senkrecht');
 chk('Achse–Achse windschief',achseAchse({c:[0,0,0],d:[1,0,0]},{c:[0,0,5],d:[0,1,0]}).abstand,5);chk('Innenwinkel konkav',innenWinkel([1,0,0],[0,0,1],false),270);
 const lp=lotPaar([3,4,0],e1,{o:[0,0,10],n:[0,0,-1]});chk('Lotpaar',lp[1][2]-lp[0][2],10);
 assert.equal(kopierWert(39.51049,3,false),'39,51049');assert.equal(kopierWert(39.51049,3,true),'39,510');assert.equal(kopierWert(380,3,false),'380');n+=3}

console.log('Kantenpaare bleiben wie bisher (keine Fläche zu Fläche)');
laden('messteil');
{const U=B.uniq[0];const ei=U.edges.findIndex(e=>e.circle&&Math.abs(e.circle.r-5)<1e-6&&Math.abs(e.circle.c[2]-20)<1e-6&&e.circle.ang>6),ej=U.edges.findIndex(e=>e.circle&&Math.abs(e.circle.r-8)<1e-6&&Math.abs(e.circle.c[2]-20)<1e-6);
 const r=messen([{k:'edge',id:ei,inst:0},{k:'edge',id:ej,inst:0}]);assert.ok(!r.ff);assert.equal(r.wahl,'Abstand min.');chk('Kreis–Kreis: Abstand max.',wert(r,'Abstand max.'),63)}

console.log('Leistung');
{laden('messteil');const P=[[mBoden,mDeckel],[mX0,mZ10],[mZ10,mZ16],[mDeckel,mSchraege]];const t0=performance.now();let k=0;
 for(let i=0;i<50;i++)for(const [a,b] of P){B.ffAnalyse({...a},{...b});k++}const ff=(performance.now()-t0)/k;
 const t1=performance.now();k=0;for(let i=0;i<200;i++)for(const [a,b] of P){B.vorschau({...a,p:[50,30,20]},{...b});k++}const vs=(performance.now()-t1)/k;
 const t2=performance.now();k=0;for(let i=0;i<10;i++)for(const [a,b] of P){messen([a,b]);k++}const ms=(performance.now()-t2)/k;
 console.log(`  Fläche-zu-Fläche-Analyse ${ff.toFixed(2)} ms, Vorschau ${vs.toFixed(3)} ms, komplette Messung ${ms.toFixed(2)} ms (je Paar)`);
 tabelle.push({teil:'Leistung',was:'Analyse / Vorschau / Messung [ms]',soll:'< 5 / < 5 / –',ist:`${ff.toFixed(2)} / ${vs.toFixed(3)} / ${ms.toFixed(2)}`,ok:ff<5&&vs<5});
 assert.ok(ff<5,'Analyse zu langsam: '+ff);assert.ok(vs<5,'Vorschau zu langsam: '+vs)}

if(process.env.WERTE_JSON)fs.writeFileSync(process.env.WERTE_JSON,JSON.stringify(tabelle,null,1));
console.log(`OK: Fläche zu Fläche (${n} Prüfungen, Kern ${process.env.KERN||'wasm'})`);
