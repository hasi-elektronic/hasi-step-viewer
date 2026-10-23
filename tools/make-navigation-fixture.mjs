// Viele Instanzen eines eigenen Messteils, ohne Kundendaten; für den ≥500-Körper-Pfad.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loadOC} from './oc-node.mjs';
import {createBrep} from '../src/brep.js';
const out=process.argv[2],n=Number(process.argv[3]||512);assert(out&&Number.isInteger(n)&&n>=500&&n<=4096);
const oc=await loadOC(),b=createBrep(oc);b.load(new Uint8Array(fs.readFileSync('testdaten/messteil.step')),'messteil.step');
const shape=b.uniq[0].shape,builder=new oc.BRep_Builder(),compound=new oc.TopoDS_Compound();builder.MakeCompound(compound);
for(let i=0;i<n;i++){const tr=new oc.gp_Trsf_1();tr.SetTranslation_1(new oc.gp_Vec_4((i%16)*120,(Math.floor(i/16)%16)*80,Math.floor(i/256)*40));const moved=new oc.BRepBuilderAPI_Transform_2(shape,tr,false).Shape();builder.Add(compound,moved);tr.delete();moved.delete()}
const w=new oc.STEPControl_Writer_1();assert.equal(w.Transfer(compound,oc.STEPControl_StepModelType.STEPControl_AsIs,true),oc.IFSelect_ReturnStatus.IFSelect_RetDone);assert.equal(w.Write('/out.step'),oc.IFSelect_ReturnStatus.IFSelect_RetDone);
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,oc.FS.readFile('/out.step'));console.log('OK: '+n+' synthetische Körper');
