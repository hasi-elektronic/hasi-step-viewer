// Erzeugt ein eigenes Testblech (Z-Profil, 2 Biegungen, Bohrung) als STEP. Lizenz: wie Repo.
import {loadOC} from './oc-node.mjs';import fs from 'fs';import path from 'path';
const oc=await loadOC();
const P=(x,y,z)=>new oc.gp_Pnt_3(x,y,z);
const t=2, r=3, L1=60, H=30, L2=40, W=50; // mm
// Profil in XZ-Ebene: Flansch1 entlang X, 90° hoch, Flansch2 entlang X
const ri=r, ro=r+t;
// Mittellinie: (0,0)->(L1,0) Bogen um (L1, r_m) ... direkt Innen-/Außenkonturen
const segs=[];
const seg=(a,b)=>segs.push(new oc.BRepBuilderAPI_MakeEdge_24(new oc.Handle_Geom_Curve_2(new oc.GC_MakeSegment_1(a,b).Value().get())).Edge());
const arc=(a,m,b)=>segs.push(new oc.BRepBuilderAPI_MakeEdge_24(new oc.Handle_Geom_Curve_2(new oc.GC_MakeArcOfCircle_4(a,m,b).Value().get())).Edge());
const s=Math.SQRT1_2;
// Biegung 1: Zentrum c1=(L1, ro)  (unten außen, oben innen)
const c1x=L1,c1z=ro;
// Biegung 2: Zentrum c2=(L1+ro+... ) -> Flansch hoch bei x=L1+ro (außen) / L1+ri... 
// Außenkontur unten: (0,0)->(L1,0) arc außen r=ro um c1 -> (L1+ro, ro) hoch -> (L1+ro, H-ri) arc innen um c2=(L1+ro+ri, H-ri) r=ri -> (L1+ro+ri, H) -> (L1+ro+ri+L2, H)
// zurück Oberseite: (.., H+t) -> (L1+ro+ri, H+t) arc außen r=ro um c2 -> (L1+t... ) 
const c2x=L1+ro+ri, c2z=H-ri;
seg(P(0,0,0),P(L1,0,0));
arc(P(L1,0,0),P(c1x+ro*s,0,c1z-ro*s),P(c1x+ro,0,c1z));
seg(P(c1x+ro,0,c1z),P(c1x+ro,0,c2z));
arc(P(c1x+ro,0,c2z),P(c2x-ri*s,0,c2z+ri*s),P(c2x,0,H));
seg(P(c2x,0,H),P(c2x+L2,0,H));
seg(P(c2x+L2,0,H),P(c2x+L2,0,H+t));
seg(P(c2x+L2,0,H+t),P(c2x,0,H+t));
arc(P(c2x,0,H+t),P(c2x-ro*s,0,c2z+ro*s),P(c2x-ro,0,c2z));
seg(P(c2x-ro,0,c2z),P(c1x+ri,0,c1z));
arc(P(c1x+ri,0,c1z),P(c1x+ri*s,0,c1z-ri*s),P(L1,0,t));
seg(P(L1,0,t),P(0,0,t));
seg(P(0,0,t),P(0,0,0));
const mw=new oc.BRepBuilderAPI_MakeWire_1();segs.forEach(e=>mw.Add_1(e));
const face=new oc.BRepBuilderAPI_MakeFace_15(mw.Wire(),true).Face();
let solid=new oc.BRepPrimAPI_MakePrism_1(face,new oc.gp_Vec_4(0,W,0),false,true).Shape();
// Bohrung Ø10 im Flansch 1
const ax=new oc.gp_Ax2_3(P(25,W/2,-1),new oc.gp_Dir_4(0,0,1));
const cyl=new oc.BRepPrimAPI_MakeCylinder_3(ax,5,t+2).Shape();
solid=new oc.BRepAlgoAPI_Cut_3(solid,cyl).Shape();
const w=new oc.STEPControl_Writer_1();
oc.Interface_Static.SetCVal('write.step.unit','MM');oc.Interface_Static.SetCVal('write.step.product.name','Testblech Z-Profil');
w.Transfer(solid,oc.STEPControl_StepModelType.STEPControl_AsIs,true);
w.Write('/out.step');
const out=process.argv[2]||'testblech.step';fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,oc.FS.readFile('/out.step'));console.log('geschrieben',out,fs.statSync(out).size);
