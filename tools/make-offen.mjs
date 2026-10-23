// Erzeugt einen offenen Körper (Schale ohne Deckel und Boden, 60 × 40 × 30 mm) als STEP – Prüfteil für den Hinweis
// „Volumen nicht verlässlich“. Lizenz: wie Repo. Aufruf: node tools/make-offen.mjs testdaten/offene-schale.step
import {loadOC} from './oc-node.mjs';import fs from 'fs';import path from 'path';
const oc=await loadOC();
const P=(x,y,z)=>new oc.gp_Pnt_3(x,y,z);
const seg=(a,b)=>new oc.BRepBuilderAPI_MakeEdge_24(new oc.Handle_Geom_Curve_2(new oc.GC_MakeSegment_1(a,b).Value().get())).Edge();
const ecken=[P(0,0,0),P(60,0,0),P(60,40,0),P(0,40,0)];
const mw=new oc.BRepBuilderAPI_MakeWire_1();for(let i=0;i<4;i++)mw.Add_1(seg(ecken[i],ecken[(i+1)%4]));
// Draht (nicht Fläche) extrudiert → vier Seitenwände, oben und unten offen
const schale=new oc.BRepPrimAPI_MakePrism_1(mw.Wire(),new oc.gp_Vec_4(0,0,30),false,true).Shape();
const w=new oc.STEPControl_Writer_1();
oc.Interface_Static.SetCVal('write.step.unit','MM');oc.Interface_Static.SetCVal('write.step.product.name','Offene Schale');
w.Transfer(schale,oc.STEPControl_StepModelType.STEPControl_AsIs,true);w.Write('/out.step');
const out=process.argv[2]||'testdaten/offene-schale.step';fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,oc.FS.readFile('/out.step'));console.log('geschrieben',out,fs.statSync(out).size);
