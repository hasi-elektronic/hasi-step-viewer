// Faz 1 „Messen perfekt“: Kegel/Senkung, Kugel, Fase, Abstandsmethoden, unendlich verlängert, Normalabstand, Projektion, ΔX/ΔY/ΔZ,
// 180°-Umschlag und Biegung über 180°. Nur selbst erzeugte Teile (tools/make-faz1-teile.py). Toleranz ±0,0001 mm.
import assert from 'assert';import fs from 'fs';import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
import {deltaLinien,projiziere,normalAbstand,methodenZeile} from '../src/messen-hilfen.js';
const B=createBrep(await loadOC());const TOL=1e-4,PI=Math.PI,DEG=180/PI;let n=0;
const lade=f=>{B.load(new Uint8Array(fs.readFileSync('testdaten/'+f)),f);return B.uniq[0]};
const eq=(a,b,t=1e-6)=>Math.abs(a-b)<t,near3=(p,q)=>p.every((x,i)=>Math.abs(x-q[i])<1e-6);
const ok=(name,ist,soll)=>{const g=Array.isArray(soll)?soll.every((x,i)=>Math.abs(x-ist[i])<TOL):typeof soll==='string'?ist===soll:Math.abs(ist-soll)<TOL;
  assert(g,`${name}: Ist ${ist} ≠ Soll ${soll}`);n++;console.log(`  ok  ${name.padEnd(44)} ${Array.isArray(soll)?soll.map(x=>x.toFixed(4)).join(' / '):typeof soll==='string'?soll:soll.toFixed(6)}`)};
const zeile=(r,name)=>{const z=r.rows.find(x=>x[0]===name);assert(z,`Wert „${name}“ fehlt in: ${r.rows.map(x=>x[0]).join(', ')}`);return z[1]};
const mess=(sels,opts)=>B.measure(sels.map(s=>({...s})),opts);
const chk=(sels,name,soll,opts)=>ok(name+(opts?.methode?` [${opts.methode}]`:''),zeile(mess(sels,opts),name),soll);
const keinNaN=(rows,wo)=>rows.forEach(([k,v,t])=>{if(t==='t')return;const vs=Array.isArray(v)?v:[v];assert(vs.every(x=>x!=null&&Number.isFinite(x)),`${wo}: „${k}“ ist ${v}`)});

let U=lade('faz1-messteil.step');
const fi=f=>{const i=U.faces.findIndex(f);assert(i>=0,'Fläche nicht gefunden');return {k:'face',id:i,inst:0}};
const ei=f=>{const i=U.edges.findIndex(f);assert(i>=0,'Kante nicht gefunden');return {k:'edge',id:i,inst:0}};
const vi=p=>{const i=U.verts.findIndex(v=>near3(v.p,p));assert(i>=0,'Ecke nicht gefunden '+p);return {k:'vertex',id:i,inst:0}};
console.log('Kegel (Senkung 90°) und Kugel:');
const kegel=fi(f=>f.type==='kegelig'),kugel=fi(f=>f.type==='kugelig');
chk([kegel],'Kegelwinkel (Senkwinkel)',90);chk([kegel],'Halber Kegelwinkel',45);chk([kegel],'Durchmesser groß Ø',16);chk([kegel],'Durchmesser klein Ø',8);
chk([kegel],'Kegelhöhe',4);chk([kegel],'Mantellinie',4*Math.SQRT2);chk([kegel],'Kegelspitze',[20,25,12]);
chk([kugel],'Kugelradius R',10);chk([kugel],'Kugeldurchmesser Ø',20);chk([kugel],'Kugelmittelpunkt',[55,25,28]);
keinNaN(mess([kegel]).rows,'Kegel');keinNaN(mess([kugel]).rows,'Kugel');
// Achse der Senkung fangen (wie Bohrungsachse): Lochabstand Senkung ↔ Kugelmulde über die Kreise
console.log('Fase:');
const f245=fi(f=>f.plane&&eq(f.plane.n[0],-Math.SQRT1_2)&&eq(f.plane.n[1],-Math.SQRT1_2));
const f315=fi(f=>f.plane&&f.plane.n[0]<-1e-3&&f.plane.n[1]>1e-3&&Math.abs(f.plane.n[2])<1e-9);
ok('Fase 2 × 45° Text',zeile(mess([f245]),'Fase'),'2 × 45°');chk([f245],'Fase Schenkel 1',2);chk([f245],'Fase Schenkel 2',2);chk([f245],'Fasenwinkel',45);chk([f245],'Fasenbreite',2*Math.SQRT2);
chk([f315],'Fase Schenkel 1',3);chk([f315],'Fase Schenkel 2',1.5);chk([f315],'Fasenwinkel',Math.atan(1.5/3)*DEG);
{const r=mess([f245]);assert(r.fase&&eq(r.fase.a,2)&&eq(r.fase.winkel,45),'Fasen-Anker fehlt');n++}
assert(!mess([fi(f=>f.plane&&near3(f.plane.n,[0,0,-1]))]).rows.some(x=>x[0]==='Fase'),'Bodenfläche darf keine Fase sein');n++;
console.log('Abstandsmethoden (Senkung Ø16 ↔ Kugelrand r 6, Mitten 35 mm auseinander):');
const kS=ei(e=>e.circle&&eq(e.circle.r,8)&&eq(e.circle.c[2],20)),kK=ei(e=>e.circle&&eq(e.circle.r,6)&&eq(e.circle.c[2],20));
chk([kS,kK],'Abstand min.',35-8-6);chk([kS,kK],'Abstand Rand–Mitte',35-8);chk([kS,kK],'Abstand Mitte–Rand',35-6);chk([kS,kK],'Abstand Mitte–Mitte',35);chk([kS,kK],'Abstand max.',35+8+6);
chk([kS,kK],'Lochabstand Mitte–Mitte',35);
for(const [m,soll] of [['min',21],['rand-mitte',27],['mitte-rand',29],['mitte',35],['max',49]]){const r=mess([kS,kK],{methode:m});const [p,q]=r.gfx[0];
  assert.equal(r.wahl,methodenZeile(m));ok(`Messlinie = ${methodenZeile(m)}`,Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]),soll);assert.deepEqual(r.delta,r.gfx[0]);n++}
// Methode passt nicht (Punkt hat keinen Rand): nächstliegende Methode
{const r=mess([vi([100,0,0]),kK],{methode:'rand-mitte'});assert.equal(r.wahl,'Abstand Mitte–Mitte');n++;const r2=mess([kK,vi([100,0,0])],{methode:'rand-mitte'});assert.equal(r2.wahl,'Abstand min.');n++}
console.log('Unendlich verlängert und Normalabstand:');
const h=20*Math.tan(25*PI/180),sch=fi(f=>f.plane&&eq(f.plane.n[0],Math.sin(25*PI/180))&&eq(f.plane.n[2],Math.cos(25*PI/180)));
const pE=vi([100,0,0]);
chk([pE,sch],'Abstand min.',20-h);chk([pE,sch],'Abstand unendlich verlängert',Math.abs(20*Math.sin(25*PI/180)-20*Math.cos(25*PI/180)));
chk([pE,sch],'Normalabstand Punkt–Ebene',Math.abs(20*Math.sin(25*PI/180)-20*Math.cos(25*PI/180)));chk([sch,pE],'Normalabstand Punkt–Ebene',Math.abs(20*Math.sin(25*PI/180)-20*Math.cos(25*PI/180)));
const oKante=ei(e=>e.line&&e.pts.every(p=>eq(p[1],0)&&eq(p[2],20))&&e.pts.some(p=>eq(p[0],80)));const pV=vi([100,0,20-h]);
chk([pV,oKante],'Abstand min.',Math.hypot(20,h));chk([pV,oKante],'Abstand unendlich verlängert',h);
{const r=mess([pV,oKante],{methode:'unendlich'});const [p,q]=r.gfx[0];ok('Messlinie unendlich verlängert',Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]),h)}
console.log('Projektion (Ecke (100|0|0) → Ecke (80|50|20), v = (−20|50|20)):');
const pa=vi([100,0,0]),pb=vi([80,50,20]);
for(const [art,inE,nor] of [['xy',Math.hypot(20,50),20],['xz',Math.hypot(20,20),50],['yz',Math.hypot(50,20),20]]){const r=mess([pa,pb],{projektion:{art}});
  ok('Projiziert auf Ebene '+art.toUpperCase(),zeile(r,'Projiziert auf Ebene '+art.toUpperCase()),inE);ok('Senkrecht zu Ebene '+art.toUpperCase(),zeile(r,'Senkrecht zu Ebene '+art.toUpperCase()),nor)}
{const r=mess([pa,pb],{projektion:{art:'bildschirm',n:[0,0,1]}});ok('Projiziert auf Bildschirm (Blick Z)',zeile(r,'Projiziert auf Bildschirm'),Math.hypot(20,50));ok('Senkrecht zu Bildschirm',zeile(r,'Senkrecht zu Bildschirm'),20)}
{const top=fi(f=>f.plane&&near3(f.plane.n,[0,0,1]));const r=mess([pa,top],{projektion:{art:'flaeche'}});ok('Projiziert auf gewählte Ebene',zeile(r,'Projiziert auf gewählte Ebene'),20);ok('Senkrecht zu gewählte Ebene',zeile(r,'Senkrecht zu gewählte Ebene'),20)}
console.log('ΔX/ΔY/ΔZ-Linien:');
{const L=deltaLinien([0,0,0],[1,-2,3]);assert.equal(L.length,3);assert.deepEqual(L.map(l=>l.achse),['X','Y','Z']);assert.deepEqual(L[0].von,[0,0,0]);assert.deepEqual(L[2].bis,[1,-2,3]);
  for(let i=1;i<3;i++)assert.deepEqual(L[i].von,L[i-1].bis);ok('ΔX/ΔY/ΔZ-Strecken',L.map(l=>l.wert),[1,2,3]);
  assert.deepEqual(deltaLinien([0,0,0],[0,5,0]).map(l=>l.achse),['Y']);n++;
  const q=projiziere([0,0,0],[3,4,12],[0,0,2]);ok('projiziere()',[q.inEbene,q.normal],[5,12]);ok('normalAbstand()',normalAbstand([1,2,7],[0,0,3],[0,0,-1]),4)}
console.log('Blech: 180°-Umschlag (Ri 1, s 2, Schenkel 40 / 20):');
U=lade('umschlag.step');
for(const id of U.faces.map((f,i)=>f.cyl?i:-1).filter(i=>i>=0)){const r=B.measure([{k:'face',id,inst:0}]);keinNaN(r.rows,'Umschlag');
  assert(!r.rows.some(x=>/bis Biegepunkt/.test(x[0])),'„bis Biegepunkt“ darf beim Umschlag nicht erscheinen');
  ok('Biegewinkel',zeile(r,'Biegewinkel'),180);ok('Radius innen Ri',zeile(r,'Radius innen Ri'),1);ok('Radius außen Ra',zeile(r,'Radius außen Ra'),3);ok('Öffnungswinkel der Schenkel',zeile(r,'Öffnungswinkel der Schenkel'),0);
  ok('Biegeart',zeile(r,'Biegeart'),'Umschlag 180° (Falz)');ok('Außenmaß über Umschlag',zeile(r,'Außenmaß über Umschlag'),6);
  const g=[zeile(r,'Schenkel 1 gerader Teil außen'),zeile(r,'Schenkel 2 gerader Teil außen')].sort((a,b)=>a-b);ok('gerader Teil außen',g,[20,40]);
  const gi=[zeile(r,'Schenkel 1 gerader Teil innen'),zeile(r,'Schenkel 2 gerader Teil innen')].sort((a,b)=>a-b);ok('gerader Teil innen',gi,[20,40]);
  const ak=[zeile(r,'Schenkel 1 bis Außenkante Umschlag'),zeile(r,'Schenkel 2 bis Außenkante Umschlag')].sort((a,b)=>a-b);ok('bis Außenkante Umschlag',ak,[23,43])}
{const s=B.sheet(0.5);assert(s.ok&&!s.flat.incomplete,JSON.stringify(s.fehler));const b=s.bends[0];assert(Number.isFinite(b.v),'v ist '+b.v);
  ok('Umschlag: Biegezugabe BZ',b.ba,PI*(1+0.5*2));ok('Umschlag: Ausgleichswert v = BZ − 2·(Ri + s)',b.v,PI*2-2*(1+2));
  ok('Umschlag: Zuschnitt',[...s.flat.size].sort((a,c)=>a-c),[30,60+2*PI]);assert(b.schenkel.every(l=>l.aussen==null&&Number.isFinite(l.geradeAussen)));n++}
console.log('Blech: Biegung 200° (Ri 3, s 2):');
U=lade('umschlag-200.step');
{const id=U.faces.findIndex(f=>f.cyl);const r=B.measure([{k:'face',id,inst:0}]);keinNaN(r.rows,'200°');ok('Biegewinkel',zeile(r,'Biegewinkel'),200);ok('Öffnungswinkel der Schenkel',zeile(r,'Öffnungswinkel der Schenkel'),20);
  assert(/über 180°/.test(zeile(r,'Hinweis')),'Hinweis über 180° fehlt');n++;assert(!r.rows.some(x=>/bis Biegepunkt|Außenmaß über/.test(x[0])));n++;
  const s=B.sheet(0.5);assert(s.bends[0].v==null&&/über 180°/.test(s.warn.join(' ')),'v muss bei 200° fehlen, mit Hinweis');n++;ok('200°: Zuschnitt',[...s.flat.size].sort((a,c)=>a-c),[30,40+200/DEG*4])}
console.log(`OK Faz 1 Messen: ${n} Prüfungen innerhalb ${TOL} mm`);
