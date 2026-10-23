import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadOC} from './oc-node.mjs';
import {createBrep} from './kern-loader.mjs';
import {dreiPunktWinkel,dreiPunktKreis,kreisbogenMasse} from '../src/messarten.js';
import {bogenPunkte,bogenWinkel,V} from '../src/bemassung.js';
import {gezieltMessen} from '../src/messauswertung.js';

const oc=await loadOC(),B=createBrep(oc);
const load=(b,file)=>b.load(new Uint8Array(fs.readFileSync('testdaten/'+file)),file);
load(B,'messteil.step');
const near=(a,b,txt)=>assert(Math.abs(a-b)<1e-6,`${txt}: ${a} != ${b}`);
const measure=(art,sels,b=B)=>b.measure(sels.map(s=>({...s})),{messart:art});
const val=(r,name)=>{const row=r.rows.find(x=>x[0]===name);assert(row,`Zeile fehlt: ${name}`);return row[1]};
const edge=pred=>{const id=B.uniq[0].edges.findIndex(pred);assert(id>=0,'Kante fehlt');return {k:'edge',id,inst:0}};
const arc=edge(e=>e.circle&&Math.abs(e.circle.r-5)<1e-6&&Math.abs(e.circle.ang-Math.PI/2)<1e-6);
const full=edge(e=>e.circle&&Math.abs(e.circle.r-5)<1e-6&&e.circle.ang>6);
const straight=edge(e=>e.line&&Math.abs(e.len-95)<1e-6),straight100=edge(e=>e.line&&Math.abs(e.len-100)<1e-6);
for(const [s,id,typ] of [[arc,'radius','radius'],[full,'durchmesser','durchmesser'],[straight,'laenge','ausgerichtet']]){
  const r=measure('auto',[s]);assert.equal(r.automatik.id,id);assert.equal(r.automatik.bemassungstyp,typ);
}
near(measure('auto',[straight]).rows.find(row=>row[0]==='Kantenlänge')[1],95,'Auto: echte Kantenlänge');
const lines=B.uniq[0].edges.map((e,id)=>e.line?{e,id}:null).filter(Boolean);let crossing;
for(let i=0;i<lines.length&&!crossing;i++)for(let j=i+1;j<lines.length;j++)if(Math.abs(lines[i].e.line.d.reduce((s,v,k)=>s+v*lines[j].e.line.d[k],0))<1e-8){const r=measure('auto',[{k:'edge',id:lines[i].id,inst:0},{k:'edge',id:lines[j].id,inst:0}]);if(r.automatik.id==='winkel'){crossing=r;break}}
assert(crossing,'Auto: sich schneidende Geraden erkennen');near(crossing.winkelMass.wert,90,'Auto: Winkel');assert.equal(crossing.label[2],'W');
for(const [art,wert] of [['radius',5],['durchmesser',10],['bogen',5*Math.PI/2],['sehne',5*Math.SQRT2],['bogenhoehe',5*(1-Math.SQRT1_2)]]){
  const r=measure(art,[arc]);assert.equal(r.bereit,true);near(r.label[1],wert,art);assert.equal(r.rows.filter(x=>x[3]).length,1);
}
const r=measure('bogen',[arc]);
near(val(r,'Kreissektorfläche'),25*Math.PI/4,'Sektor');near(val(r,'Kreissegmentfläche'),25*(Math.PI/2-1)/2,'Segment');
assert(r.messkreis.p0.every(Number.isFinite));
near(Math.hypot(...r.linien.Sehnenlänge[0].map((x,i)=>x-r.linien.Sehnenlänge[1][i])),5*Math.SQRT2,'Sehnenlinie');
near(measure('umfang',[full]).label[1],10*Math.PI,'Kreisumfang');
assert.equal(measure('sehne',[full]).bereit,false);assert.equal(measure('bogenhoehe',[full]).bereit,false);
for(const art of ['radius','durchmesser','bogen','umfang'])assert.equal(measure(art,[straight]).bereit,false,art+' auf Gerade');
near(measure('laenge',[straight]).label[1],95,'Kantenlänge');
near(measure('summe',[straight,straight100]).label[1],195,'Summe zweier Kanten');
assert.equal(measure('summe',[straight,straight]).bereit,false,'Doppelte Auswahl');
assert.equal(measure('unbekannt',[straight]).bereit,false);
assert.equal(measure('abstand',[straight]).bereit,false);
const points=[[100,0,0],[100,60,0],[0,60,0]].map(p=>({k:'point',p,inst:0}));
near(measure('winkel3',points).label[1],90,'3-Punkt-Winkel');
near(measure('winkel3',points.toReversed()).label[1],90,'Winkel umgekehrt');
assert.equal(measure('winkel3',points.slice(0,2)).bereit,false);
assert.equal(measure('winkel3',[points[0],points[1],points[1]]).bereit,false);
const p=[[-5,0,0],[0,5,0],[5,0,0]].map(p=>({k:'point',p,inst:0}));
const k=measure('kreis3',p);near(k.label[1],5,'3-Punkt-Kreis');assert.deepEqual(k.messkreis.c,[0,0,0]);
assert.equal(measure('kreis3',[[0,0,0],[1,0,0],[2,0,0]].map(p=>({k:'point',p,inst:0}))).bereit,false);
for(const [p,w] of [[[[1,0,0],[0,0,0],[2,0,0]],0],[[[-1,0,0],[0,0,0],[1,0,0]],180]]){
  const z=dreiPunktWinkel(p);near(z.wert,w,'Grenzwinkel');assert(bogenPunkte(z.v,z.u1,z.u2,5).flat().every(Number.isFinite));
}
assert.throws(()=>dreiPunktKreis([[0,0,0],[1,0,0],[2,0,0]]),/Geraden/);
assert.throws(()=>dreiPunktWinkel([[0,0,0],[0,0,0],[1,0,0]]),/unterschiedliche/);
const gross=kreisbogenMasse(3,200*Math.PI/180);near(gross.hoehe,3*(1-Math.cos(100*Math.PI/180)),'200° Bogenhöhe');
assert.throws(()=>kreisbogenMasse(-1,1));
// Bekannter großer Bogen aus einem synthetischen Umschlag, nicht aus Messwerten abgeleitet.
const U=createBrep(oc);load(U,'umschlag-200.step');
const ui=U.uniq[0].edges.findIndex(e=>e.circle&&Math.abs(e.circle.r-3)<1e-6&&Math.abs(e.circle.ang-200*Math.PI/180)<1e-6);assert(ui>=0,'200°-Bogen fehlt');
const ur=measure('bogen',[{k:'edge',id:ui,inst:0}],U);
near(ur.label[1],3*200*Math.PI/180,'200° Länge');near(val(ur,'Bogenhöhe'),gross.hoehe,'200° Höhe');
const c=ur.messkreis,[a0]=bogenWinkel(c.c,c.n,c.p0,c.p1,false);near(c.winkel,200*Math.PI/180,'BREP Sweep');assert(Number.isFinite(a0));
const radial=V.sub(c.p0,c.c),end=V.add(c.c,V.add(V.mul(radial,Math.cos(c.winkel)),V.mul(V.cross(c.n,radial),Math.sin(c.winkel))));near(V.len(V.sub(end,c.p1)),0,'200° gezeichneter Endpunkt');
near(Math.hypot(...V.sub(ur.linien.Bogenhöhe[0],ur.linien.Bogenhöhe[1])),gross.hoehe,'200° Höhenlinie');
const A=createBrep(oc);load(A,'messbaugruppe.step');const inst=A.inst.findIndex(i=>A.uniq[i.u].faces.length===6&&A.uniq[i.u].faces.every(f=>f.plane&&Math.abs(f.area-400)<1e-6));assert(inst>=0,'Klotz fehlt');
const faces=A.uniq[A.inst[inst].u].faces.map((f,id)=>({f,id})).filter(x=>x.f.plane&&Math.abs(x.f.area-400)<1e-6).slice(0,2).map(x=>({k:'face',id:x.id,inst}));assert.equal(faces.length,2);
near(measure('summe',faces,A).label[1],800,'Summe zweier Flächen');
near(measure('flaeche',[faces[0]],A).label[1],400,'Flächeninhalt');near(measure('umfang',[faces[0]],A).label[1],80,'Flächenumfang');
assert.equal(measure('summe',[faces[0],{k:'edge',id:0,inst}],A).bereit,false,'Gemischte Summe');
near(measure('koerper',[{k:'solid',inst}],A).label[1],8000,'Körpervolumen');
// Panelwert und gezeichnete Schenkel müssen denselben kleinen Winkel tragen.
const wm=gezieltMessen([{k:'edge',id:0},{k:'edge',id:1}],{messart:'winkel'},{
  auto:()=>({rows:[['Winkel Kante–Kante',45,'W']],gfx:[[[0,0,0],[0,0,0]]]}),
  resolve:s=>({e:{line:{d:s.id===0?[1,0,0]:[-Math.SQRT1_2,Math.SQRT1_2,0]}}}),
});
near(Math.acos(V.dot(wm.winkelMass.u1,wm.winkelMass.u2))*180/Math.PI,45,'45° statt 135°');
const top=B.uniq[0].faces.findIndex(f=>f.plane&&Math.abs(f.plane.n[2]-1)<1e-6);
const slope=B.uniq[0].faces.findIndex(f=>f.plane&&Math.abs(f.plane.n[2]-Math.cos(Math.PI/6))<1e-6);
const fw=measure('winkel',[{k:'face',id:top,inst:0},{k:'face',id:slope,inst:0}]);near(fw.label[1],30,'Flächenwinkel');near(Math.acos(V.dot(fw.winkelMass.u1,fw.winkelMass.u2))*180/Math.PI,30,'Gezeichnete Fläche–Fläche');
const cyl=B.uniq[0].faces.findIndex(f=>f.cyl&&f.cyl.ang<2);
const cr=measure('bogen',[{k:'face',id:cyl,inst:0}]);assert(cr.messkreis.p0&&cr.messkreis.p1);near(cr.messkreis.winkel,Math.PI/2,'Zylinderbogen');near(V.len(V.sub(cr.messkreis.p0,cr.messkreis.c)),5,'Zylinderzentrum in richtiger Höhe');
const S=createBrep(oc);load(S,'faz1-messteil.step');const sf=S.uniq[0].faces.findIndex(f=>f.sph);assert(sf>=0,'Kugel fehlt');
for(const art of ['radius','durchmesser']){const sr=measure(art,[{k:'face',id:sf,inst:0}],S);assert(sr.messkreis.n);near(sr.messkreis.r,10,'Kugel-Bemaßung');near(sr.label[1],art==='radius'?10:20,'Kugelwert')}
const original=measure('radius',[arc]).messkreis;
const ms=B.inst.map(i=>i.m.slice());ms[0]=[0,-1,0,200,1,0,0,-70,0,0,1,30];B.lagen(ms);
const moved=measure('radius',[arc]).messkreis;near(moved.r,5,'Radius nach Bauteilbewegung');near(moved.c[0],200-original.c[1],'Kreismitte X');near(moved.c[1],original.c[0]-70,'Kreismitte Y');near(moved.c[2],original.c[2]+30,'Kreismitte Z');
console.log('OK: Messarten; analytische Kreis-/Bogenmaße, 3 Punkte, zwei Elemente summieren, Fläche/Körper, unzulässige Auswahl, 0°/180°/200°');
