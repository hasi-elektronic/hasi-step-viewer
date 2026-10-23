// Erzeugt ein großes, synthetisches Testteil (selbst erzeugt, keine Kundendaten) für den Öffnen-Leistungstest:
// viele Lochbleche mit Freiformkante, als STEP ohne Parameterkurven (wie viele Fremd-CAD-Exporte), damit der Kern
// die Formheilung (Parameterkurven nachrechnen) wirklich leisten muss.
// Aufruf: node tools/make-grossteil.mjs <ausgabe.step> [teile=160]
import {loadOC} from './oc-node.mjs';import fs from 'fs';import path from 'path';
const oc=await loadOC();
const out=process.argv[2]||'grossteil.step';const N=+(process.argv[3]||160);
const P=(x,y,z=0)=>new oc.gp_Pnt_3(x,y,z);
const kante=c=>new oc.BRepBuilderAPI_MakeEdge_24(new oc.Handle_Geom_Curve_2(c)).Edge();
const strecke=(a,b)=>kante(new oc.GC_MakeSegment_1(a,b).Value().get());
let zufall=12345;const rnd=()=>(zufall=(zufall*1103515245+12345)%2147483648)/2147483648;
function teil(i){
  const L=80+rnd()*120,B=50+rnd()*80,t=1+Math.round(rnd()*4),welle=4+rnd()*10;
  // Außenkontur: drei Strecken und eine Freiformkante (B-Spline) oben
  const pts=new oc.TColgp_Array1OfPnt_2(1,9);
  for(let k=0;k<9;k++){const x=L*(1-k/8);pts.SetValue(k+1,P(x,B+welle*Math.sin(k*0.9+i)))}
  const bs=new oc.GeomAPI_PointsToBSpline_2(pts,3,8,oc.GeomAbs_Shape.GeomAbs_C2,1e-3).Curve().get();
  const pA=P(L,B+welle*Math.sin(i)),pE=P(0,B+welle*Math.sin(8*0.9+i));
  const mw=new oc.BRepBuilderAPI_MakeWire_1();
  mw.Add_1(strecke(P(0,0),P(L,0)));mw.Add_1(strecke(P(L,0),pA));mw.Add_1(kante(bs));mw.Add_1(strecke(pE,P(0,0)));
  const mf=new oc.BRepBuilderAPI_MakeFace_15(mw.Wire(),true);
  // Lochraster
  const nx=3+Math.floor(rnd()*8),ny=2+Math.floor(rnd()*5),r=1.5+rnd()*2.5;
  for(let a=0;a<nx;a++)for(let b=0;b<ny;b++){
    const ax=new oc.gp_Ax2_3(P(L*(a+1)/(nx+1),(B-welle)*(b+1)/(ny+1)),new oc.gp_Dir_4(0,0,1));
    const w=new oc.BRepBuilderAPI_MakeWire_2(kante(new oc.GC_MakeCircle_2(ax,r).Value().get())).Wire();
    mf.Add(oc.TopoDS.Wire_1(w.Reversed()));
  }
  let s=new oc.BRepPrimAPI_MakePrism_1(mf.Face(),new oc.gp_Vec_4(0,0,t),false,true).Shape();
  const tr=new oc.gp_Trsf_1();tr.SetTranslation_1(new oc.gp_Vec_4((i%16)*230,Math.floor(i/16)*160,0));
  return new oc.BRepBuilderAPI_Transform_2(s,tr,true).Shape();
}
const bb=new oc.BRep_Builder(),comp=new oc.TopoDS_Compound();bb.MakeCompound(comp);
for(let i=0;i<N;i++)bb.Add(comp,teil(i));
const w=new oc.STEPControl_Writer_1();
oc.Interface_Static.SetCVal('write.step.unit','MM');oc.Interface_Static.SetCVal('write.step.product.name','Synthetisches Grossteil');
w.Transfer(comp,oc.STEPControl_StepModelType.STEPControl_AsIs,true);w.Write('/out.step');
// Parameterkurven entfernen: Kanten zeigen direkt auf ihre 3D-Kurve (so schreiben es z. B. manche Fremd-CAD-Systeme)
let txt=new TextDecoder().decode(oc.FS.readFile('/out.step'));
const auf=new Map();for(const m of txt.matchAll(/#(\d+)\s*=\s*(?:SURFACE_CURVE|SEAM_CURVE)\s*\(\s*'[^']*'\s*,\s*#(\d+)/g))auf.set(m[1],m[2]);
txt=txt.replace(/(#\d+\s*=\s*EDGE_CURVE\s*\([^;]*?,\s*)#(\d+)(\s*,\s*\.[TF]\.\s*\)\s*;)/g,(g,a,id,e)=>a+'#'+(auf.get(id)||id)+e);
txt=txt.replace(/^#\d+\s*=\s*(?:SURFACE_CURVE|SEAM_CURVE|PCURVE)\s*\([^;]*;\s*$/gm,'');
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,txt);const n=re=>(txt.match(re)||[]).length;
console.log('geschrieben',out,fs.statSync(out).size,'Bytes,',N,'Teile,',n(/ADVANCED_FACE\(/g),'Flächen,',n(/PCURVE\(/g),'Parameterkurven');
