// Faz 2 „Blech 2.0“: virtueller Riss, Innenradius annehmen, Biegetabelle mit Werkstoff und BD, Falten/Entfalten, Biegerichtungspfeile,
// Hüllquader (gedreht/minimal), Rohmaß, Messprotokoll. Nur selbst erzeugte Testteile (tools/make-faz2-teile.py, make-abwicklung-teile.py).
// Belege (DXF, PNG, PDF, XLSX) nach $QA_DIR/blech2, sonst in ein temporäres Verzeichnis.
import assert from 'assert';import fs from 'fs';import os from 'os';import path from 'path';import {execSync} from 'child_process';
import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
import {falteNetz,faltePunkt,einbetten} from '../src/falten.js';import {biegeNotizen} from '../src/biegenotiz.js';import {parseBiegetabelle} from '../src/kfaktor.js';
import {lies,ausdehnung,PY,ezdxf} from './dxf-lesen.mjs';
const B=createBrep(await loadOC());const PI=Math.PI,TOL=1e-3;
const QA=process.env.QA_DIR||null;const AUS=QA?path.join(QA,'blech2'):fs.mkdtempSync(path.join(os.tmpdir(),'blech2-'));fs.mkdirSync(AUS,{recursive:true});
const lade=f=>B.load(new Uint8Array(fs.readFileSync('testdaten/'+f)),f);
const run=(f,o={})=>{lade(f);return B.sheet({modus:'manuell',K:0.5,...o})};
const ok=t=>console.log('  ok  '+t);const near=(a,b,t=TOL,m='')=>assert(Math.abs(a-b)<t,`${m}: ${a} ≠ ${b}`);
const groesse=(r,a,b,n)=>{const s=[...r.flat.size].sort((x,y)=>x-y);near(s[0],a,TOL,n+' Breite');near(s[1],b,TOL,n+' Länge')};
const dxfDatei=(r,name)=>{const txt=B.dxf(r.flat,{beschriftung:true});const p=path.join(AUS,name);fs.writeFileSync(p,txt);return {txt,p,d:lies(txt)}};

console.log('Virtueller Riss (geschlossener Kasten 100 × 60 × 20, s 2, Ri 2, ohne Eckfreischnitt):');
lade('wanne-ohne-freischnitt.step');const E=B.uniq[0].edges,F=B.uniq[0].faces;
// Senkrechte Eckkanten geometrisch suchen (unabhängig von der Kantennummer im Kern): Außen- und Innenkanten
const senk=E.map((e,i)=>[e,i]).filter(([e])=>e.line&&Math.abs(e.line.d[2])>1-1e-9&&e.faces.every(f=>F[f].plane));
const aussen=senk.filter(([e])=>Math.abs(Math.abs(e.pts[0][0])-50)<1e-6).map(([,i])=>i),innen=senk.filter(([e])=>Math.abs(Math.abs(e.pts[0][0])-48)<1e-6).map(([,i])=>i);
assert.equal(aussen.length,4);assert.equal(innen.length,4);
let r=B.sheet({modus:'manuell',K:0.5});assert(r.flat.incomplete&&r.fehler.some(f=>f.includes('Geschlossene Ecken')));
for(const [name,kanten] of [['Innenkanten',innen],['Außenkanten (auf die Hautkante übertragen)',aussen]]){
  r=B.sheet({modus:'manuell',K:0.5,riss:kanten});
  assert(!r.flat.incomplete,name+': '+JSON.stringify(r.fehler));assert.equal(r.riss.length,4);assert.equal(r.rissKanten.length,8,'4 Eckkanten + 4 Gehrungskurven');
  assert(r.flaeche.anteil>0.99,`${name}: nur ${(r.flaeche.anteil*100).toFixed(2)} % abgewickelt`);groesse(r,52+2*(PI/2*3+16),92+2*(PI/2*3+16),name);
  ok(`${name}: 4 Risse → ${r.rissKanten.length} Kanten aufgetrennt, ${(r.flaeche.anteil*100).toFixed(2).replace('.',',')} % der Fläche abgewickelt, Zuschnitt ${r.flat.size.map(v=>v.toFixed(3)).join(' × ')}`)}
{const {d,p}=dxfDatei(r,'kasten-riss.dxf');assert(d.lay.includes('RISS'));const rl=d.ent.filter(e=>e.layer==='RISS');assert.equal(rl.length,16,'jede Risskante zweimal (beide Seiten)');
  const k=d.ent.filter(e=>e.layer==='KONTUR'&&e.typ==='LWPOLYLINE');assert.equal(k.length,1);assert(k[0].zu,'Kontur geschlossen');const s=ausdehnung(k).sort((a,b)=>a-b);near(s[1],92+2*(PI/2*3+16),TOL,'DXF');
  if(PY){const z=ezdxf([p],AUS)[0];assert.equal(z.audit_fehler,0);assert(z.layer.includes('RISS'));ok(`ezdxf: Audit 0, Layer ${z.layer.join('/')}, RISS ${rl.length} Elemente`)}
  ok('DXF: Kontur geschlossen, Risskanten auf Layer RISS (nicht plotten)')}
r=B.sheet({modus:'manuell',K:0.5,riss:[innen[0]]});assert(r.flat.incomplete&&r.fehler.some(f=>f.includes('Geschlossene Ecken (6')));ok('Ein Riss: übrige 3 Ecken bleiben gesperrt (6 Kanten)');
const boden=E.findIndex(e=>e.line&&e.faces.some(f=>F[f].cyl)&&e.faces.some(f=>F[f].plane));
r=B.sheet({modus:'manuell',K:0.5,riss:[boden]});assert(r.warn.some(w=>w.includes('keine geschlossene Ecke')));ok('Riss an einer Biegekante wird abgelehnt: '+r.warn.find(w=>w.includes('Riss')));

console.log('Innenradius annehmen (scharfkantiger L-Winkel, außen 50 / 30, s 2, Breite 40):');
r=run('scharf-l.step');assert(r.flat.incomplete&&r.fehler.some(f=>f.includes('scharfkantig')));ok('ohne Annahme: '+r.fehler[0].slice(0,60));
r=run('scharf-l.step',{riAnnahme:2});assert(!r.flat.incomplete,JSON.stringify(r.fehler));
// Zuschnitt = 50 + 30 − 2·(Ri + s) + π/2·(Ri + K·s) = 72 + π/2·3
groesse(r,40,72+PI/2*3,'Scharfes L, Ri 2 angenommen');assert(r.bends[0].angenommen);assert(r.warn.some(w=>w.includes('angenommen, nicht aus der Datei')));
near(r.flaeche.anteil,1,1e-6,'Flächenbilanz');ok(`Ri 2 angenommen: Zuschnitt ${r.flat.size.map(v=>v.toFixed(4)).join(' × ')} (= 72 + π/2·3), Warnung „${r.warn.find(w=>w.includes('angenommen'))}“`);
{const {d,p}=dxfDatei(r,'scharf-l-ri2.dxf');const k=d.ent.filter(e=>e.layer==='KONTUR');assert.equal(k.length,1);assert(k[0].zu);const s=ausdehnung(k).sort((a,b)=>a-b);near(s[1],72+PI/2*3,TOL,'DXF');
  assert(d.ent.some(e=>e.typ==='TEXT'&&e.g.some(([c,v])=>c===1&&v.includes('AB 90%%d Ri 2'))));
  if(PY){const z=ezdxf([p],AUS)[0];assert.equal(z.audit_fehler,0);near(Math.max(...z.kontur_groesse),72+PI/2*3,TOL,'ezdxf')}ok('DXF: geschlossene Kontur ohne Überlappung, Länge 76,712')}
r=run('scharf-l.step',{riAnnahme:2,modus:'din'});const Kd=r.bends[0].K;groesse(r,40,72+PI/2*(2+2*Kd),'DIN');ok(`DIN 6935 mit Ri 2: K ${Kd.toFixed(4)} → ${Math.max(...r.flat.size).toFixed(4)}`);

console.log('Biegetabelle je Werkstoff mit Biegeverkürzung BD (L-Winkel s 2, Ri 2, Breite 60):');
const tab=parseBiegetabelle(fs.readFileSync('testdaten/biegetabelle-werkstoffe.csv','utf8'));assert.equal(tab.length,3);assert(tab.every(t=>t.spalte==='BD'&&t.bd>0&&t.v===-t.bd));
lade('blech-bohrungen.step');const bb=B.model().bbox,ab=[0,1,2].map(j=>bb.max[j]-bb.min[j]).sort((a,b)=>b-a);
// Handrechnung: Außenmaße der Schenkel aus dem Hüllquader (60 = Breite, a = 54, b = 34) → Zuschnitt = a + b − BD
const a=ab.find(v=>Math.abs(v-60)>1e-6&&v>40),b=ab.filter(v=>Math.abs(v-60)>1e-6).find(v=>v<40);near(a,54,1e-6,'a');near(b,34,1e-6,'b');
for(const [ws,bd] of [['Stahl (7,85 g/cm³)',3.5],['Aluminium (2,70 g/cm³)',4.0],['Edelstahl (7,90 g/cm³)',3.7]]){r=B.sheet({modus:'manuell',K:0.5,tabelle:tab,werkstoff:ws});
  assert.equal(r.bends[0].quelle,'Tabelle');assert.equal(r.bends[0].tabelle.spalte,'BD');near(r.bends[0].bd,bd,1e-9,'BD');groesse(r,60,a+b-bd,ws);ok(`${ws.split(' ')[0].padEnd(10)} BD ${bd.toFixed(2)} → Zuschnitt ${(a+b-bd).toFixed(3)} = ${a} + ${b} − ${bd}`)}
r=B.sheet({modus:'manuell',K:0.5,tabelle:tab,werkstoff:'Kupfer (8,96 g/cm³)'});assert.equal(r.bends[0].quelle,'manuell');groesse(r,60,80+PI/2*3,'Kupfer');ok('Kupfer nicht in der Tabelle → K-Faktor (manuell)');
assert.equal(parseBiegetabelle('s;ri;Winkel;Biegeverkürzung\n2;2;90;-3,5\n')[0].v,-3.5);assert.equal(parseBiegetabelle('s;ri;BD\n2;2;3,5\n')[0].v,-3.5);ok('BD positiv oder negativ eingetragen → v = −BD');

console.log('Falten/Entfalten (letztes Bild = Abwicklung, erstes Bild = 3D-Teil) und Biegerichtung:');
const teile=[['s-profil.step',{}],['wanne.step',{}],['blech-bohrungen.step',{}],['umschlag-200.step',{}],['scharf-l.step',{riAnnahme:2}],['wanne-ohne-freischnitt.step',{riss:innen}],['testblech','']];
for(const [f,o] of teile){r=f==='testblech'?(B.load(new Uint8Array(fs.readFileSync('public/testblech.step')),'t'),B.sheet({modus:'manuell',K:0.5})):run(f,o);assert(!r.flat.incomplete,f);
  const N=B.faltNetz(),Fd=N.faltung,Bs=Fd.basis;let d0=0,d1=0,h1=0;const P0=falteNetz(N,Fd,0),P1=falteNetz(N,Fd,1);
  for(let i=0;i<N.p2.length/2;i++){d0=Math.max(d0,Math.hypot(P0[3*i]-N.p3[3*i],P0[3*i+1]-N.p3[3*i+1],P0[3*i+2]-N.p3[3*i+2]));
    const w=[P1[3*i]-Bs.o[0],P1[3*i+1]-Bs.o[1],P1[3*i+2]-Bs.o[2]],u=w[0]*Bs.e1[0]+w[1]*Bs.e1[1]+w[2]*Bs.e1[2],v=w[0]*Bs.e2[0]+w[1]*Bs.e2[1]+w[2]*Bs.e2[2];
    h1=Math.max(h1,Math.abs(w[0]*Bs.n0[0]+w[1]*Bs.n0[1]+w[2]*Bs.n0[2]));d1=Math.max(d1,Math.hypot(u-N.p2[2*i],v-N.p2[2*i+1]))}
  assert(d0<TOL,`${f}: gefaltet weicht ${d0} mm vom 3D-Teil ab`);assert(d1<TOL&&h1<TOL,`${f}: letztes Bild weicht ${d1}/${h1} mm von der Abwicklung ab`);
  // Ausdehnung des letzten Bildes = Zuschnitt (nur Teile mit geraden Außenkanten)
  if(['s-profil.step','wanne.step','scharf-l.step'].includes(f)){const us=[],vs=[];for(let i=0;i<N.p2.length/2;i++){us.push(N.p2[2*i]);vs.push(N.p2[2*i+1])}
    near(Math.max(...us)-Math.min(...us),r.flat.size[0],TOL,f+' Zuschnitt X');near(Math.max(...vs)-Math.min(...vs),r.flat.size[1],TOL,f+' Zuschnitt Y')}
  // Zwischenbild: ebene Flächen bewegen sich starr (Dreieckskanten behalten ihre Länge)
  const Ph=falteNetz(N,Fd,0.5);let dl=0;const Fl=B.uniq[B.inst[0].u].faces;
  for(let t=0;t<N.fk.length;t++){if(!Fl[N.fk[t]].plane)continue;for(let j=0;j<3;j++){const a=3*t+j,b=3*t+(j+1)%3;const L=(P,x,y)=>Math.hypot(P[3*x]-P[3*y],P[3*x+1]-P[3*y+1],P[3*x+2]-P[3*y+2]);dl=Math.max(dl,Math.abs(L(Ph,a,b)-L(P0,a,b)))}}
  assert(dl<TOL,f+': ebene Fläche verzerrt '+dl);
  // Richtungspfeile: AUF/AB wie Tabelle (nach oben/unten) und wie die tatsächliche Faltung (Lasche hebt sich aus der Zeichenebene nach vorn = +n0)
  const Nn=biegeNotizen(r.flat);assert.equal(Nn.length,r.bends.length);
  r.bends.forEach((bd,i)=>{assert.equal(Nn[i].auf,bd.dir==='nach oben',`${f} B${bd.nr}: Pfeil ≠ Tabelle`);assert.equal(Nn[i].text.includes(' AUF '),bd.dir==='nach oben');
    const fb=Fd.bends[i];assert.equal(fb.sigma===1,bd.dir==='nach oben',`${f} B${bd.nr}: Faltung ≠ Tabelle`);
    // Laschenpunkt hinter der Biegung, nur diese Biegung zur Hälfte gefaltet: Höhe über der Abwicklung > 0 bei AUF
    const P2=[fb.S2[0]+fb.W2[0]*(fb.BZ+5),fb.S2[1]+fb.W2[1]*(fb.BZ+5)],p=faltePunkt(P2,[i],false,Fd.bends,Bs,0.5),o=einbetten(Bs,P2[0],P2[1]);
    const h=(p[0]-o[0])*Bs.n0[0]+(p[1]-o[1])*Bs.n0[1]+(p[2]-o[2])*Bs.n0[2];assert(bd.dir==='nach oben'?h>0:h<0,`${f} B${bd.nr}: Höhe ${h}`);
    // Pfeil zeigt zur Lasche (weg von der festen Fläche): Pfeilspitze liegt auf der Laschenseite der Biegelinie
    const bl=r.flat.bendLines[i],m=[(bl[0][0]+bl[1][0])/2,(bl[0][1]+bl[1][1])/2];assert((Nn[i].pfeil[1][0]-m[0])*fb.W2[0]+(Nn[i].pfeil[1][1]-m[1])*fb.W2[1]>0)});
  ok(`${f.padEnd(28)} ${r.bends.length} Biegung(en) ${r.bends.map(b=>b.dir==='nach oben'?'AUF':'AB').join('/')}, gefaltet Δ ${d0.toExponential(1)} mm, flach Δ ${Math.max(d1,h1).toExponential(1)} mm`)}

console.log('Hüllquader, Rohmaß, Schwerpunkt:');
lade('block-45.step');let h=B.huelle({});const sz=q=>q.sortiert.map(v=>v.toFixed(3)).join(' × ');
[80,50,30].forEach((v,i)=>near(h.minimal.sortiert[i],v,TOL,'minimal'));near(h.achsparallel.masse[0],130/Math.SQRT2,TOL,'achsparallel');
const fz=B.uniq[0].faces.findIndex(f=>f.plane&&Math.abs(f.plane.n[2])<1e-9);h=B.huelle({bezug:{k:'face',id:fz,inst:0}});[80,50,30].forEach((v,i)=>near(h.bezug.sortiert[i],v,TOL,'Bezug Fläche'));
const ke=B.uniq[0].edges.findIndex(e=>e.line&&Math.abs(e.line.d[2])<1e-9);h=B.huelle({bezug:{k:'edge',id:ke,inst:0}});[80,50,30].forEach((v,i)=>near(h.bezug.sortiert[i],v,TOL,'Bezug Kante'));
assert.equal(h.rohmass.empfehlung,'Block');[80,50,30].forEach((v,i)=>near(h.rohmass.block.masse[i],v,TOL,'Rohmaß'));
const c=B.model().centroid;near(c[0],10,1e-6,'S x');near(c[1],20,1e-6,'S y');near(c[2],15,1e-6,'S z');
ok(`Block 45° gedreht: achsparallel ${sz(h.achsparallel)}, gedreht (Fläche/Kante) ${sz(h.bezug)}, minimal ${sz(h.minimal)}, Schwerpunkt (10 | 20 | 15)`);
lade('block-schraeg.step');h=B.huelle({});[80,50,30].forEach((v,i)=>near(h.minimal.sortiert[i],v,TOL,'schräg'));ok(`Block um Z 45° und X 30° gedreht: minimal ${sz(h.minimal)} (achsparallel ${sz(h.achsparallel)})`);
lade('welle.step');h=B.huelle({});near(h.rohmass.zylinder.d,40,TOL,'Ø');near(h.rohmass.zylinder.l,90,TOL,'L');assert.equal(h.rohmass.empfehlung,'Zylinder');
ok(`Welle schräg im Raum: Rohmaß Zylinder Ø ${h.rohmass.zylinder.d.toFixed(3)} × ${h.rohmass.zylinder.l.toFixed(3)} (Empfehlung ${h.rohmass.empfehlung})`);

// Messprotokoll (PDF/XLSX) prüft tools/test-messprotokoll.mjs (über test-export, dort ist pdftotext installiert)
console.log('OK: Blech 2.0 und Messen (Faz 2)');
