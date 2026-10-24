import assert from 'node:assert/strict';
import fs from 'node:fs';
import {informationsZeilen,pruefeInfoOptionen} from '../src/messinformationen.js';
import {bemassungenSpeichern,bemassungenLaden,zeichne} from '../src/bemassung.js';
import {loadOC} from './oc-node.mjs';
import {createBrep} from './kern-loader.mjs';
import {parseStepHierarchy} from '../src/stephier.js';
const rows=[['Abstand',20,'L'],['Delta X',0,'L'],['Flächeninhalt',400,'A'],['Umfang (gesamt)',80,'L'],['Mittelpunkt',[1,2,3],'P'],['Kaputt',NaN,'L'],['Kaputt2',Infinity,'V']];
assert.equal(informationsZeilen(rows,{},'Klotz').length,5);
assert.deepEqual(informationsZeilen(rows,{bezug:false,flaechen:false}).map(r=>r[0]),['Abstand','Delta X','Umfang (gesamt)']);
assert(informationsZeilen(rows,{koordinaten:true}).some(r=>r[0]==='Mittelpunkt'));
assert.deepEqual(pruefeInfoOptionen(null),{bezug:true,koordinaten:false,flaechen:true});
const B=createBrep(await loadOC()),bytes=new Uint8Array(fs.readFileSync('testdaten/messbaugruppe.step'));const loaded=B.load(bytes,'messbaugruppe.step',parseStepHierarchy(bytes));
const walk=n=>n.name==='Klotz'?n:n.children.map(walk).find(Boolean);const inst=walk(loaded.tree).bodies[0];
const results=B.uniq[B.inst[inst].u].faces.map((_,id)=>B.measure([{k:'face',id,inst}],{}));
for(const r of results){assert(Math.abs(r.rows.find(r=>r[0]==='Flächeninhalt')[1]-400)<1e-6);assert(Math.abs(r.rows.find(r=>r[0]==='Umfang (gesamt)')[1]-80)<1e-6);assert(r.messpunkt?.every(Number.isFinite));}
for(const selection of [{k:'edge',id:0,inst},{k:'solid',id:0,inst},{k:'vertex',id:0,inst}]) {
  const a=B.measure([{...selection,p:[999,999,999]}],{}),b=B.measure([selection],{});
  assert(a.messpunkt?.every(Number.isFinite));assert.deepEqual(a.messpunkt,b.messpunkt,'Anker darf nicht vom UI-Treffpunkt abhängen');
}
const dim={no:1,typ:'info',sels:[{k:'face',id:0,inst}],off:[2,3,4],text:'Prüfung',infoOptionen:{bezug:false,koordinaten:true,flaechen:true}};
assert.deepEqual(bemassungenLaden(bemassungenSpeichern([dim])).bemassungen[0],dim);
const ctx={canvas:{width:1000,height:700},save(){},restore(){},measureText:t=>({width:t.length*8}),beginPath(){},moveTo(){},lineTo(){},stroke(){},rect(){},fill(){},fillRect(){},fillText(){}};
const hit=zeichne(ctx,{typ:'info',p:[10,20,0],off:[0,0,0],zeilen:Array(60).fill('Langer Messwert: 123,456 mm'),grenzen:{links:280,rechts:990,oben:64,unten:690}},p=>p,{groesse:40,pfeil:'pfeil',stellen:3});
assert(hit.y-hit.h>=64&&hit.y+hit.h<=690);assert(hit.x-hit.w/2>=280&&hit.x+hit.w/2<=990);
console.log('Messinformationen: 20-mm-Würfel mit 400 mm²/80 mm, BREP-Anker, Filter, JSON und begrenzte Karten bestanden');
