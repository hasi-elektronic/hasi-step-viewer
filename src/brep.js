import {biegung} from './kfaktor.js';
// B-Rep-Kern: Einlesen, Topologie, Messen, Blech. Läuft im Worker (Browser) und in Node (Tests).
// Alle Längen intern in mm (OCCT rechnet STEP-Dateien beim Import in mm um).
const V = {
  sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],
  mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s], dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len:a=>Math.hypot(a[0],a[1],a[2]), norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l]},
};
const P = p=>[p.X(),p.Y(),p.Z()], D = d=>[d.X(),d.Y(),d.Z()];
const tryCall=(...fs)=>{let err;for(const f of fs){try{return f()}catch(e){err=e}}throw err};
const DEG=180/Math.PI;

/** Längeneinheit aus dem STEP-Text lesen. */
export function stepUnit(text){
  const t=text.slice(0,4e6).toUpperCase().replace(/\s+/g,'');
  const m=/LENGTH_UNIT\(\)[^;]*?SI_UNIT\((\.\w+\.|\$),\.METRE\.\)|SI_UNIT\((\.\w+\.|\$),\.METRE\.\)[^;]*?LENGTH_UNIT/.exec(t);
  const conv=/CONVERSION_BASED_UNIT\('(INCH|FOOT|MILLIMETRE|METRE)'/.exec(t);
  if(conv&&/INCH/.test(conv[1]))return {name:'Zoll',sym:'in',mm:25.4};
  if(conv&&/FOOT/.test(conv[1]))return {name:'Fuß',sym:'ft',mm:304.8};
  const pre=m?(m[1]||m[2]):null;
  if(pre==='.MILLI.')return {name:'Millimeter',sym:'mm',mm:1};
  if(pre==='.CENTI.')return {name:'Zentimeter',sym:'cm',mm:10};
  if(pre==='.MICRO.')return {name:'Mikrometer',sym:'µm',mm:0.001};
  if(pre==='$')return {name:'Meter',sym:'m',mm:1000};
  return {name:'Millimeter (nicht angegeben, angenommen)',sym:'mm',mm:1};
}

export function createBrep(oc){
  const TA=oc.TopAbs_ShapeEnum, ST=oc.GeomAbs_SurfaceType, CT=oc.GeomAbs_CurveType;
  const explore=(s,type,f)=>{const ex=new oc.TopExp_Explorer_2(s,type,TA.TopAbs_SHAPE);for(;ex.More();ex.Next())f(ex.Current());ex.delete?.()};
  const mkVertex=p=>new oc.BRepBuilderAPI_MakeVertex(new oc.gp_Pnt_3(p[0],p[1],p[2])).Vertex();
  const props=(kind,s)=>{const g=new oc.GProp_GProps_1();
    if(kind==='L')tryCall(()=>oc.BRepGProp.LinearProperties(s,g,false,false),()=>oc.BRepGProp.LinearProperties(s,g,false),()=>oc.BRepGProp.LinearProperties(s,g));
    if(kind==='S')tryCall(()=>oc.BRepGProp.SurfaceProperties_1(s,g,false,false),()=>oc.BRepGProp.SurfaceProperties_1(s,g,false),()=>oc.BRepGProp.SurfaceProperties_1(s,g));
    if(kind==='V')tryCall(()=>oc.BRepGProp.VolumeProperties_1(s,g,false,false,false),()=>oc.BRepGProp.VolumeProperties_1(s,g,false,false),()=>oc.BRepGProp.VolumeProperties_1(s,g,false),()=>oc.BRepGProp.VolumeProperties_1(s,g));
    return {mass:g.Mass(),c:P(g.CentreOfMass())}};
  class Index{constructor(){this.b=new Map();this.list=[]}
    find(s,add){const h=s.HashCode(1<<30);let arr=this.b.get(h);if(!arr)this.b.set(h,arr=[]);
      for(const i of arr)if(this.list[i].shape.IsSame(s))return i;if(!add)return -1;const i=this.list.length;this.list.push(add(s));arr.push(i);return i}}

  const M={};
  // Instanz-Transformationen (3x4, zeilenweise)
  const T={p:(m,q)=>[m[0]*q[0]+m[1]*q[1]+m[2]*q[2]+m[3],m[4]*q[0]+m[5]*q[1]+m[6]*q[2]+m[7],m[8]*q[0]+m[9]*q[1]+m[10]*q[2]+m[11]],
    d:(m,q)=>[m[0]*q[0]+m[1]*q[1]+m[2]*q[2],m[4]*q[0]+m[5]*q[1]+m[6]*q[2],m[8]*q[0]+m[9]*q[1]+m[10]*q[2]]};
  const trsfArr=loc=>{const t=loc.Transformation();const m=[];for(let r=1;r<=3;r++)for(let c=1;c<=4;c++)m.push(t.Value(r,c));return m};
  M.load=(bytes,name='modell.step',hier=null,progress=()=>{})=>{
    const t0=Date.now(),times={};let tt=Date.now();const lap=k=>{times[k]=Date.now()-tt;tt=Date.now()};
    const text=new TextDecoder('latin1').decode(bytes.subarray(0,Math.min(bytes.length,4e6)));
    const unit=stepUnit(text);
    progress('STEP-Datei wird gelesen …');
    oc.FS.writeFile('/in.step',bytes);
    const r=new oc.STEPControl_Reader_1();
    const st=r.ReadFile('/in.step');oc.FS.unlink('/in.step');
    if(st!==oc.IFSelect_ReturnStatus.IFSelect_RetDone)throw new Error('STEP-Datei konnte nicht gelesen werden');
    lap('lesen');progress('Geometrie wird übersetzt …');
    tryCall(()=>r.TransferRoots(),()=>r.TransferRoots(new oc.Message_ProgressRange_1()));
    const shape=r.OneShape();lap('uebersetzen');
    // OCCT-Struktur mit kumulierten Lagen durchlaufen; Volumenkörper = Instanzen, gleiche TShape = ein Unikat
    progress('Teile werden zugeordnet …');
    const occTree=sh=>{const n={sh,kids:[],solids:[]};
      if(sh.ShapeType()===TA.TopAbs_SOLID){n.solids.push(sh);return n}
      if(sh.ShapeType()===TA.TopAbs_COMPOUND||sh.ShapeType()===TA.TopAbs_COMPSOLID){const it=new oc.TopoDS_Iterator_2(sh,true,true);for(;it.More();it.Next())n.kids.push(occTree(it.Value()));return n}
      const ss=[];explore(sh,TA.TopAbs_SOLID,x=>ss.push(x));if(!ss.length&&(sh.ShapeType()===TA.TopAbs_SHELL))ss.push(sh);n.solids.push(...ss);return n};
    const oroot=occTree(shape);
    const allSolids=n=>[...n.solids,...n.kids.flatMap(allSolids)];
    const uniq=new Index(),inst=[];const ident=new oc.TopLoc_Location_1();
    const addInst=sh=>{const loc=sh.Location_1();const base=sh.Located(ident);
      const u=uniq.find(base,x=>({shape:x}));const i=inst.length;inst.push({u,loc,m:trsfArr(loc)});return i};
    // Baum: STEP-Hierarchie (Namen) strukturgleich auf OCCT-Baum legen
    let stats={knoten:0,passend:0};
    const match=(sn,on)=>{stats.knoten++;
      const node={name:sn?sn.name:'Körper',children:[],bodies:[]};
      if(!sn||!sn.children.length){allSolids(on).forEach(x=>node.bodies.push(addInst(x)));if(sn)stats.passend++;return node}
      let o=on;while(o.kids.length===1&&!o.solids.length&&sn.children.length>1)o=o.kids[0];
      if(o.kids.length===sn.children.length)stats.passend++;
      const n=Math.min(o.kids.length,sn.children.length);
      for(let i=0;i<n;i++){const c=match(sn.children[i],o.kids[i]);if(c.bodies.length||c.children.length)node.children.push(c)}
      for(let i=n;i<o.kids.length;i++)allSolids(o.kids[i]).forEach(x=>node.children.push({name:'Körper',children:[],bodies:[addInst(x)]}));
      o.solids.forEach(x=>node.bodies.push(addInst(x)));
      return node};
    let sroot=hier&&hier.roots&&hier.roots.length===1?hier.roots[0]:(hier&&hier.roots&&hier.roots.length>1?{name:name.replace(/\.(step|stp)$/i,''),children:hier.roots}:null);
    let tree;
    if(sroot&&sroot.children.length)tree=match(sroot,oroot);
    else{tree={name:(sroot&&sroot.name)||name.replace(/\.(step|stp)$/i,''),children:[],bodies:[]};const ss=allSolids(oroot);
      if(ss.length===1)tree.bodies.push(addInst(ss[0]));else ss.forEach((x,i)=>tree.children.push({name:`Körper ${i+1}`,children:[],bodies:[addInst(x)]}))}
    numberNames(tree);lap('zuordnen');
    // Unikate tessellieren und indizieren
    progress(`${uniq.list.length} Einzelteile werden aufbereitet …`);
    const U=uniq.list;const bbAll=M.bbox(shape);const diag=V.len(V.sub(bbAll.max,bbAll.min))||1;
    U.forEach((u,ui)=>{
      const bb=M.bbox(u.shape);const d=V.len(V.sub(bb.max,bb.min))||diag;
      const defl=Math.min(Math.max(d/600,diag/20000),diag/1500);
      tryCall(()=>new oc.BRepMesh_IncrementalMesh_2(u.shape,defl,false,0.35,false));
      const faces=new Index(),edges=new Index(),verts=new Index();const pos=[],idx=[],fid=[];
      explore(u.shape,TA.TopAbs_FACE,fs=>{const f=oc.TopoDS.Face_1(fs);const fi=faces.find(f,x=>M.faceInfo(oc.TopoDS.Face_1(x),ui));
        const loc=new oc.TopLoc_Location_1();const h=oc.BRep_Tool.Triangulation(f,loc);
        if(!h.IsNull()){const tri=h.get();const tr=loc.Transformation();const base=pos.length/3;
          const nodes=tryCall(()=>{const a=tri.Nodes();return i=>a.Value(i)},()=>i=>tri.Node(i));
          for(let i=1;i<=tri.NbNodes();i++){const q=nodes(i).Transformed(tr);pos.push(q.X(),q.Y(),q.Z())}
          const tris=tryCall(()=>{const a=tri.Triangles();return i=>a.Value(i)},()=>i=>tri.Triangle(i));
          const rev=f.Orientation_1()===oc.TopAbs_Orientation.TopAbs_REVERSED;
          for(let i=1;i<=tri.NbTriangles();i++){const t=tris(i);let a=t.Value(1),b=t.Value(2),c=t.Value(3);if(rev)[b,c]=[c,b];idx.push(base+a-1,base+b-1,base+c-1);fid.push(fi)}}
        explore(f,TA.TopAbs_EDGE,es=>{const ei=edges.find(es,x=>M.edgeInfo(oc.TopoDS.Edge_1(x)));const e=edges.list[ei];if(!e.faces.includes(fi))e.faces.push(fi)})});
      explore(u.shape,TA.TopAbs_VERTEX,vs=>verts.find(vs,x=>({shape:oc.TopoDS.Vertex_1(x),p:P(oc.BRep_Tool.Pnt(oc.TopoDS.Vertex_1(x)))})));
      Object.assign(u,{faces:faces.list,edges:edges.list,verts:verts.list,p:new Float32Array(pos),i:new Uint32Array(idx),f:new Uint32Array(fid),bb});
      if(ui%20===0)progress(`Einzelteile werden aufbereitet … ${ui+1}/${U.length}`)});
    lap('tessellieren');
    M.shape=shape;M.uniq=U;M.inst=inst;M.unit=unit;M.vcache=new Map();
    const nameOf=new Array(inst.length).fill('Körper');const w=n=>{n.bodies.forEach(b=>nameOf[b]=n.name);n.children.forEach(w)};w(tree);
    M.faces=U[0]?.faces||[];M.edges=U[0]?.edges||[];
    times.gesamt=Date.now()-t0;
    return {name,unit,tree,times,stats:{...stats,unikate:U.length,instanzen:inst.length},
      uniq:U.map(u=>({p:u.p,i:u.i,f:u.f,faces:u.faces.map(f=>({type:f.type,ax:f.cyl&&{c:f.cyl.c,d:f.cyl.d,r:f.cyl.r}})),edges:u.edges.map(e=>({type:e.type,pts:e.pts,c:e.circle?.c,n:e.circle?.n,r:e.circle?.r,mid:e.mid})),verts:u.verts.map(v=>v.p)})),
      inst:inst.map((x,i)=>({u:x.u,m:x.m,name:nameOf[i]})),ms:Date.now()-t0}};
  function numberNames(root){
    const names=new Map(),cnt=new Map();const walk=(n,f)=>{f(n);n.children.forEach(c=>walk(c,f))};
    walk(root,n=>{if(n!==root)names.set(n.name,(names.get(n.name)||0)+1)});
    walk(root,n=>{if(n!==root&&names.get(n.name)>1){const c=(cnt.get(n.name)||0)+1;cnt.set(n.name,c);n.name=`${n.name} <${c}>`}})}
  const uProps=u=>{if(!M.uniq[u].vp){const sh=M.uniq[u].shape;const v=props('V',sh),a=props('S',sh);M.uniq[u].vp={v:Math.abs(v.mass),c:v.c,a:a.mass}}return M.uniq[u].vp};
  M.solidProps=ids=>{let vol=0,area=0;const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
    ids.forEach(i=>{const I=M.inst[i],q=uProps(I.u);vol+=q.v;area+=q.a;
      M.uniq[I.u].edges.forEach(e=>e.pts.forEach(p0=>{const p=T.p(I.m,p0);for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k])}}))});
    return {volume:vol,area,bbox:{min:mn,max:mx},bodies:ids.length}};
  M.bbox=s=>{const b=new oc.Bnd_Box_1();tryCall(()=>oc.BRepBndLib.Add(s,b,true),()=>oc.BRepBndLib.Add(s,b));return {min:P(b.CornerMin()),max:P(b.CornerMax())}};
  M.faceInfo=(f,solid)=>{
    const a=new oc.BRepAdaptor_Surface_2(f,true);const t=a.GetType();const rev=f.Orientation_1()===oc.TopAbs_Orientation.TopAbs_REVERSED;
    const o={shape:f,solid,type:'sonstige'};let _a;Object.defineProperty(o,'area',{get:()=>_a??=props('S',f).mass,enumerable:true});
    const u0=a.FirstUParameter(),u1=a.LastUParameter(),v0=a.FirstVParameter(),v1=a.LastVParameter();
    o.mid=P(a.Value((u0+u1)/2,(v0+v1)/2));
    if(t===ST.GeomAbs_Plane){const pl=a.Plane();let n=D(pl.Axis().Direction());if(rev)n=V.mul(n,-1);o.type='eben';o.plane={o:P(pl.Location()),n}}
    else if(t===ST.GeomAbs_Cylinder){const c=a.Cylinder();o.type='zylindrisch';o.cyl={c:P(c.Location()),d:D(c.Axis().Direction()),r:c.Radius(),ang:u1-u0,v0,v1,rev}}
    else if(t===ST.GeomAbs_Cone)o.type='kegelig';else if(t===ST.GeomAbs_Sphere)o.type='kugelig';else if(t===ST.GeomAbs_Torus)o.type='torisch';else o.type='Freiform';
    return o};
  M.edgeInfo=e=>{
    const a=new oc.BRepAdaptor_Curve_2(e);const t=a.GetType();const u0=a.FirstParameter(),u1=a.LastParameter();
    const o={shape:e,faces:[],type:'Kurve'};let _l;Object.defineProperty(o,'len',{get:()=>_l??=props('L',e).mass,enumerable:true});
    let n=24;if(t===CT.GeomAbs_Line){o.type='Gerade';n=1;o.line={p:P(a.Value(u0)),d:V.norm(V.sub(P(a.Value(u1)),P(a.Value(u0))))}}
    else if(t===CT.GeomAbs_Circle){const c=a.Circle();o.type='Kreis';o.circle={c:P(c.Location()),n:D(c.Axis().Direction()),r:c.Radius(),ang:Math.abs(u1-u0)};n=Math.max(8,Math.ceil(o.circle.ang/(Math.PI/24)))}
    o.pts=[];for(let i=0;i<=n;i++)o.pts.push(P(a.Value(u0+(u1-u0)*i/n)));o.mid=P(a.Value((u0+u1)/2));
    return o};

  // ---------- Messen ----------
  // Alle Werte exakt aus der B-Rep (OCCT), immer in mm. Auswahl {k,id,inst}: id lokal im Unikat der Instanz.
  // Arten: solid, face, edge, vertex, center (Kreismittelpunkt), mid (Kantenmitte), axis (Achse einer Zylinderfläche/Kreiskante), point
  const RES=s=>{if(s._r)return s._r;const I=M.inst[s.inst??0],U=M.uniq[I.u],m=I.m;const o={};
    if(s.k==='solid'){o.shape=U.shape.Moved(I.loc)}
    const cylW=c=>c&&{...c,c:T.p(m,c.c),d:T.d(m,c.d)};
    if(s.k==='face'||(s.k==='axis'&&s.src==='face')){const f=U.faces[s.id];o.f={type:f.type,area:f.area,plane:f.plane&&{o:T.p(m,f.plane.o),n:T.d(m,f.plane.n)},cyl:cylW(f.cyl)};o.shape=f.shape.Moved(I.loc)}
    if(s.k==='edge'||s.k==='center'||s.k==='mid'||(s.k==='axis'&&s.src!=='face')){const e=U.edges[s.id];o.e={type:e.type,len:e.len,mid:T.p(m,e.mid),line:e.line&&{p:T.p(m,e.line.p),d:T.d(m,e.line.d)},circle:e.circle&&{...e.circle,c:T.p(m,e.circle.c),n:T.d(m,e.circle.n)}};o.shape=e.shape.Moved(I.loc)}
    if(s.k==='vertex'){o.p=T.p(m,U.verts[s.id].p);o.shape=U.verts[s.id].shape.Moved(I.loc)}
    if(s.k==='center'){o.p=o.e.circle.c;o.shape=mkVertex(o.p)}
    if(s.k==='mid'){o.p=o.e.mid;o.shape=mkVertex(o.p)}
    if(s.k==='axis'){const a=o.f?o.f.cyl:o.e.circle&&{c:o.e.circle.c,d:o.e.circle.n,r:o.e.circle.r};if(!a)throw new Error('Keine Achse vorhanden');
      o.axis={c:a.c,d:V.norm(a.d),r:a.r};const L=1e5;o.shape=new oc.BRepBuilderAPI_MakeEdge_3(new oc.gp_Pnt_3(...V.add(a.c,V.mul(o.axis.d,-L))),new oc.gp_Pnt_3(...V.add(a.c,V.mul(o.axis.d,L)))).Edge()}
    if(s.k==='point'){o.p=s.p;o.shape=mkVertex(s.p)}
    return s._r=o};
  const sel2shape=s=>RES(s).shape;
  const selPoint=s=>RES(s).p;
  const isP=s=>['vertex','center','mid','point'].includes(s.k);
  // Richtung: n = Normale (ebene Fläche, Kreisebene), a = Achse/Richtung (Gerade, Zylinder, Achse)
  const dirOf=s=>{const r=RES(s);if(r.axis)return{kind:'a',d:r.axis.d};if(r.f){if(r.f.plane)return{kind:'n',d:r.f.plane.n};if(r.f.cyl)return{kind:'a',d:r.f.cyl.d}}
    if(r.e&&s.k==='edge'){if(r.e.line)return{kind:'a',d:r.e.line.d};if(r.e.circle)return{kind:'n',d:r.e.circle.n}}return null};
  // Mitte einer Auswahl (für Mitte-Mitte): Punkt, Kreismitte, Kantenmitte, Flächen-/Körperschwerpunkt (Zylinder: auf die Achse projiziert)
  const centerOf=s=>{const r=RES(s);if(r.p)return r.p;if(r.axis)return r.axis.c;
    if(r.e)return r.e.circle?r.e.circle.c:r.e.mid;
    if(r.f){const c=props('S',r.shape).c;if(r.f.cyl){const a=r.f.cyl,dd=V.norm(a.d);return V.add(a.c,V.mul(dd,V.dot(V.sub(c,a.c),dd)))}return c}
    return props('V',r.shape).c};
  const holeAxis=s=>{const r=RES(s);if(r.axis)return r.axis;if(r.f&&r.f.cyl)return{c:r.f.cyl.c,d:V.norm(r.f.cyl.d),r:r.f.cyl.r};if(r.e&&r.e.circle&&(s.k==='edge'||s.k==='center'))return{c:r.e.circle.c,d:r.e.circle.n,r:r.e.circle.r};return null};
  M.minDist=(a,b)=>{const d=new oc.BRepExtrema_DistShapeShape_1();d.LoadS1(a);d.LoadS2(b);tryCall(()=>d.Perform(),()=>d.Perform(new oc.Message_ProgressRange_1()));
    if(!d.IsDone())throw new Error('Abstand konnte nicht berechnet werden');return {d:d.Value(),p1:P(d.PointOnShape1(1)),p2:P(d.PointOnShape2(1))}};
  // ---- Maximaler Abstand ----
  // Ebenen, Zylinder und Kegel sind Regelflächen: der Abstand² zu einem Punkt ist entlang jeder Regelgeraden konvex,
  // das Maximum liegt deshalb auf dem Rand. Es genügt, die Randkanten zu betrachten.
  // Je Kante: Gerade → Endpunkte, Kreis → analytisch (Gegenpunkt oder Endpunkte), sonst Abtastung + Goldener Schnitt.
  const curvesOf=s=>{const r=RES(s);if(r.p)return [{pt:r.p}];if(r.axis)return null;const out=[];
    const add=e=>{const a=new oc.BRepAdaptor_Curve_2(e);out.push({a,t:a.GetType(),u0:a.FirstParameter(),u1:a.LastParameter()})};
    if(s.k==='edge')add(oc.TopoDS.Edge_1(r.shape));else explore(r.shape,TA.TopAbs_EDGE,e=>add(oc.TopoDS.Edge_1(e)));return out};
  const val=(c,u)=>P(c.a.Value(u));
  const far=(c,q)=>{if(c.pt)return c.pt;const d2=p=>{const w=V.sub(p,q);return V.dot(w,w)};
    const cand=[val(c,c.u0),val(c,c.u1)];
    if(c.t===CT.GeomAbs_Circle){const ci=c.a.Circle(),ctr=P(ci.Location()),X=D(ci.XAxis().Direction()),Y=D(ci.YAxis().Direction());
      const w=V.sub(q,ctr);let t=Math.atan2(V.dot(w,Y),V.dot(w,X))+Math.PI;const TW=2*Math.PI;while(t<c.u0)t+=TW;while(t>c.u0+TW)t-=TW;if(t<=c.u1+1e-12)cand.push(val(c,t))}
    else if(c.t!==CT.GeomAbs_Line){const n=64;let bi=0,bv=-1;for(let i=0;i<=n;i++){const v=d2(val(c,c.u0+(c.u1-c.u0)*i/n));if(v>bv){bv=v;bi=i}}
      let lo=c.u0+(c.u1-c.u0)*Math.max(0,bi-1)/n,hi=c.u0+(c.u1-c.u0)*Math.min(n,bi+1)/n;const g=(Math.sqrt(5)-1)/2;
      for(let k=0;k<80;k++){const x1=hi-g*(hi-lo),x2=lo+g*(hi-lo);if(d2(val(c,x1))>d2(val(c,x2)))hi=x2;else lo=x1}cand.push(val(c,(lo+hi)/2))}
    let best=cand[0];for(const p of cand)if(d2(p)>d2(best))best=p;return best};
  M.maxDist=(sa,sb)=>{const A=curvesOf(sa),B=curvesOf(sb);if(!A||!B||!A.length||!B.length)return null;
    const samp=c=>c.pt?[c.pt]:Array.from({length:17},(_,i)=>val(c,c.u0+(c.u1-c.u0)*i/16));
    let best={d:-1};
    for(const ca of A)for(const cb of B){const pa0=samp(ca),pb0=samp(cb);let p1=pa0[0],p2=pb0[0],bd=-1;
      for(const x of pa0)for(const y of pb0){const d=V.len(V.sub(x,y));if(d>bd){bd=d;p1=x;p2=y}}
      for(let it=0;it<60;it++){const n2=far(cb,p1),n1=far(ca,n2);const d=V.len(V.sub(n1,n2));const done=d<=bd+1e-12;if(d>=bd){bd=d;p1=n1;p2=n2}if(done)break}
      if(bd>best.d)best={d:bd,p1,p2}}
    return best};
  const perimeter=f=>{let s=0,outer=0;explore(f,TA.TopAbs_EDGE,e=>{s+=props('L',e).mass});
    try{const w=tryCall(()=>oc.BRepTools.OuterWire(oc.TopoDS.Face_1(f)));outer=props('L',w).mass}catch{outer=s}return {s,outer}};
  // ---- Blech-Biegung per Ein-Klick auf eine Rundung ----
  // Partner = koaxiale Zylinderfläche mit anderem Radius (Innen-/Außenseite). Schenkel = ebene Flächen, die tangential an den
  // geraden Randkanten der Rundung anschließen. Schenkellänge = gerader Anteil + R·tan(φ/2) (bis zum virtuellen Knickpunkt).
  M.bendInfo=(u,fi)=>{const U=M.uniq[u],F=U.faces,f=F[fi].cyl;if(!f)return null;
    const coax=(A,B)=>Math.abs(V.dot(A.d,B.d))>1-1e-6&&V.len(V.sub(V.sub(B.c,A.c),V.mul(A.d,V.dot(V.sub(B.c,A.c),A.d))))<1e-4;
    const pi=F.findIndex((g,i)=>i!==fi&&g.cyl&&coax(f,g.cyl)&&Math.abs(g.cyl.r-f.r)>1e-4&&Math.abs(g.cyl.r-f.r)<Math.max(f.r,g.cyl.r)&&Math.abs(g.cyl.ang-f.ang)<1e-3);
    if(pi<0)return null;
    const [ii,oi]=F[pi].cyl.r<f.r?[pi,fi]:[fi,pi];const ri=F[ii].cyl.r,ro=F[oi].cyl.r,phi=f.ang,ax=V.norm(f.d);
    const legs=ci=>{const C=F[ci].cyl,out=[];U.edges.forEach(e=>{if(!e.line||!e.faces.includes(ci))return;const gi=e.faces.find(x=>x!==ci);const G=F[gi];if(gi==null||!G?.plane)return;
        const w=V.sub(e.line.p,C.c),rad=V.norm(V.sub(w,V.mul(ax,V.dot(w,ax))));
        let L=0;U.edges.forEach(e2=>{if(!e2.faces.includes(gi))return;e2.pts.forEach(p=>{const q=V.sub(p,e.line.p);L=Math.max(L,V.len(V.sub(q,V.mul(e.line.d,V.dot(q,e.line.d)))))})});
        out.push({rad,L})});return out};
    const li=legs(ii),lo=legs(oi),tn=phi<Math.PI-1e-6?Math.tan(phi/2):NaN;
    const pair=lo.map(o=>({o,i:li.find(x=>V.dot(x.rad,o.rad)>0.99)}));
    return {ri,ro,t:ro-ri,phi,inner:ii,outer:oi,legs:pair.map(({o,i})=>({aussen:o.L+ro*tn,innen:i?i.L+ri*tn:null,geradeAussen:o.L,geradeInnen:i?i.L:null}))}};
  M.describe=s=>{const R0=RES(s),R=[];if(s.k==='solid'){const q=M.solidProps([s.inst]);R.push(['Volumen',q.volume,'V'],['Oberfläche',q.area,'A']);return R}
    if(s.k==='face'){const f=R0.f;R.push(['Fläche',f.type,'t'],['Flächeninhalt',f.area,'A']);const u=perimeter(R0.shape);R.push(['Umfang (gesamt)',u.s,'L']);if(Math.abs(u.outer-u.s)>1e-9)R.push(['Umfang (außen)',u.outer,'L']);
      if(f.cyl){const bi=M.bendInfo(M.inst[s.inst??0].u,s.id);
        if(bi){R.unshift(['Radius innen Ri',bi.ri,'L','!'],['Radius außen Ra',bi.ro,'L','!'],['Bogenlänge (angeklickt)',f.cyl.r*f.cyl.ang,'L','!'],['Biegewinkel',bi.phi*DEG,'W','!']);
          R.push(['Blechdicke',bi.t,'L'],['Bogenlänge innen',bi.ri*bi.phi,'L'],['Bogenlänge außen',bi.ro*bi.phi,'L'],['Öffnungswinkel der Schenkel',180-bi.phi*DEG,'W']);
          // Schenkellänge in zwei Varianten: bis Biegepunkt (gerader Teil + R·tan(φ/2)) und gerader Teil ohne Biegung
          bi.legs.forEach((l,i)=>{const n='Schenkel '+(i+1);R.push([n+' (bis Biegepunkt) außen',l.aussen,'L']);if(l.innen!=null)R.push([n+' (bis Biegepunkt) innen',l.innen,'L']);
            R.push([n+' gerader Teil außen',l.geradeAussen,'L']);if(l.geradeInnen!=null)R.push([n+' gerader Teil innen',l.geradeInnen,'L'])});
          if(bi.legs.length===2)R.push(['Außenmaß über die Biegung',bi.legs[0].aussen+bi.legs[1].aussen,'L'])}
        else{R.unshift(['Radius R',f.cyl.r,'L','!'],['Bogenlänge',f.cyl.r*f.cyl.ang,'L','!']);R.push(['Durchmesser Ø',2*f.cyl.r,'L'],['Radius R',f.cyl.r,'L'],['Öffnungswinkel',f.cyl.ang*DEG,'W'],['Bogenlänge',f.cyl.r*f.cyl.ang,'L'])}}
      if(f.plane)R.push(['Normale',f.plane.n.map(x=>x.toFixed(4)).join(' / '),'t'])}
    if(s.k==='edge'){const e=R0.e;R.push(['Kante',e.type,'t'],['Kantenlänge',e.len,'L']);
      if(e.circle){R.unshift(e.circle.ang>2*Math.PI-1e-6?['Durchmesser Ø',2*e.circle.r,'L','!']:['Radius R',e.circle.r,'L','!'],['Bogenlänge',e.circle.r*e.circle.ang,'L','!']);R.push(['Durchmesser Ø',2*e.circle.r,'L'],['Radius R',e.circle.r,'L'],['Bogenwinkel',e.circle.ang*DEG,'W'],['Bogenlänge',e.circle.r*e.circle.ang,'L'],['Mittelpunkt',e.circle.c,'P'])}
      R.push(['Kantenmitte',e.mid,'P'])}
    if(s.k==='axis'){const a=R0.axis;R.push(['Achse durch',a.c,'P'],['Richtung',a.d.map(x=>x.toFixed(4)).join(' / '),'t']);if(a.r)R.push(['Durchmesser Ø',2*a.r,'L'],['Radius R',a.r,'L'])}
    if(isP(s))R.push([{center:'Kreismittelpunkt',vertex:'Eckpunkt',mid:'Kantenmitte',point:'Punkt'}[s.k],selPoint(s),'P']);
    const seen=new Set();return R.filter(r=>!seen.has(r[0])&&seen.add(r[0]))};
  const delta=(rows,p1,p2,pre='')=>rows.push([pre+'ΔX',Math.abs(p2[0]-p1[0]),'L'],[pre+'ΔY',Math.abs(p2[1]-p1[1]),'L'],[pre+'ΔZ',Math.abs(p2[2]-p1[2]),'L']);
  M.measure=sels=>{
    const rows=[],gfx=[];
    if(sels.length===1)return {rows:M.describe(sels[0]),gfx};
    if(sels.length>2){const ed=sels.filter(s=>s.k==='edge');
      if(ed.length)rows.push(['Gesamtlänge ('+ed.length+' Kanten)',ed.reduce((a,s)=>a+RES(s).e.len,0),'L']);
      const fa=sels.filter(s=>s.k==='face');if(fa.length)rows.push(['Gesamtfläche ('+fa.length+' Flächen)',fa.reduce((a,s)=>a+RES(s).f.area,0),'A']);
      if(!rows.length)rows.push(['Hinweis','Mehrfachauswahl nur für Kanten (Gesamtlänge) oder Flächen','t']);
      return {rows,gfx}}
    const [a,b]=sels;
    if(isP(a)&&isP(b)){const pa=selPoint(a),pb=selPoint(b);rows.push(['Abstand',V.len(V.sub(pb,pa)),'L']);delta(rows,pa,pb);gfx.push([pa,pb]);return {rows,gfx,label:rows[0]}}
    const md=M.minDist(sel2shape(a),sel2shape(b));
    rows.push(['Abstand min.',md.d,'L']);delta(rows,md.p1,md.p2);gfx.push([md.p1,md.p2]);
    const mx=M.maxDist(a,b);if(mx)rows.push(['Abstand max.',mx.d,'L']);
    if(a.k!=='axis'&&b.k!=='axis'){const ca=centerOf(a),cb=centerOf(b);rows.push(['Abstand Mitte–Mitte',V.len(V.sub(cb,ca)),'L']);delta(rows,ca,cb,'Mitte ')}
    const da=dirOf(a),db=dirOf(b);
    if(da&&db){const c=Math.min(1,Math.abs(V.dot(da.d,db.d)));let ang=Math.acos(c)*DEG;
      // Fläche–Fläche: Winkel zwischen den Flächen (über die Normalen), Kante–Kante: zwischen den Richtungen, Kante–Fläche: Winkel zur Fläche (90° − Winkel zur Normalen)
      if(da.kind!==db.kind)ang=90-ang;
      const kind=x=>x.k==='face'?'Fläche':'Kante';
      rows.push(['Winkel '+kind(a)+'–'+kind(b),ang,'W']);
      if(da.kind==='n'&&db.kind==='n'){const s=V.dot(da.d,db.d);rows.push(['Winkel der Normalen',Math.acos(Math.max(-1,Math.min(1,s)))*DEG,'W'])}
      if(a.k==='face'&&b.k==='face'&&RES(a).f.plane&&RES(b).f.plane&&c>1-1e-9){const pa=RES(a).f.plane,pb=RES(b).f.plane;rows.push(['Paralleler Abstand',Math.abs(V.dot(V.sub(pb.o,pa.o),pa.n)),'L'])}
      if(da.kind==='a'&&db.kind==='a'&&c>1-1e-9&&a.k==='edge'&&b.k==='edge'&&RES(a).e.line&&RES(b).e.line){const pa=RES(a).e.line.p,pb=RES(b).e.line.p,w=V.sub(pb,pa);rows.push(['Paralleler Abstand',V.len(V.sub(w,V.mul(da.d,V.dot(w,da.d)))),'L'])}}
    const ha=holeAxis(a),hb=holeAxis(b);
    if(ha&&hb&&Math.abs(V.dot(ha.d,hb.d))>1-1e-9){const w=V.sub(hb.c,ha.c);const d=V.len(V.sub(w,V.mul(ha.d,V.dot(w,ha.d))));rows.push(['Lochabstand Mitte–Mitte',d,'L'])}
    return {rows,gfx,label:rows[0]}};
  const meshVA=u=>{const U=M.uniq[u];if(U.mva)return U.mva;const p=U.p,ix=U.i;let v=0,A=0,cx=0,cy=0,cz=0;
    for(let t=0;t<ix.length;t+=3){const a=ix[t]*3,b=ix[t+1]*3,c=ix[t+2]*3;const ax=p[a],ay=p[a+1],az=p[a+2],bx=p[b],by=p[b+1],bz=p[b+2],qx=p[c],qy=p[c+1],qz=p[c+2];
      const dv=(ax*(by*qz-bz*qy)-ay*(bx*qz-bz*qx)+az*(bx*qy-by*qx))/6;v+=dv;cx+=dv*(ax+bx+qx)/4;cy+=dv*(ay+by+qy)/4;cz+=dv*(az+bz+qz)/4;
      const ux=bx-ax,uy=by-ay,uz=bz-az,wx=qx-ax,wy=qy-ay,wz=qz-az;A+=Math.hypot(uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx)/2}
    return U.mva={v:Math.abs(v),a:A,c:v?[cx/v,cy/v,cz/v]:[0,0,0]}};
  M.modelFast=()=>{let vol=0,area=0,cx=[0,0,0];const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
    M.inst.forEach(I=>{const q=meshVA(I.u);vol+=q.v;area+=q.a;const c=T.p(I.m,q.c);for(let k=0;k<3;k++)cx[k]+=c[k]*q.v;
      const b=M.uniq[I.u].bb;for(let k=0;k<8;k++){const pt=T.p(I.m,[k&1?b.max[0]:b.min[0],k&2?b.max[1]:b.min[1],k&4?b.max[2]:b.min[2]]);for(let j=0;j<3;j++){mn[j]=Math.min(mn[j],pt[j]);mx[j]=Math.max(mx[j],pt[j])}}});
    if(vol)cx=cx.map(x=>x/vol);
    return {approx:true,volume:vol,area,centroid:cx,bbox:{min:mn,max:mx},solids:M.inst.length,unique:M.uniq.length,faces:M.inst.reduce((s,I)=>s+M.uniq[I.u].faces.length,0),edges:M.inst.reduce((s,I)=>s+M.uniq[I.u].edges.length,0)}};
  M.model=()=>{const all=M.inst.map((_,i)=>i);const q=M.solidProps(all);let cx=[0,0,0];
    M.inst.forEach(I=>{const v=uProps(I.u);const c=T.p(I.m,v.c);for(let k=0;k<3;k++)cx[k]+=c[k]*v.v});if(q.volume)cx=cx.map(x=>x/q.volume);
    return {volume:q.volume,area:q.area,centroid:cx,bbox:isFinite(q.bbox.min[0])?q.bbox:M.bbox(M.shape),solids:M.inst.length,unique:M.uniq.length,faces:M.inst.reduce((s,I)=>s+M.uniq[I.u].faces.length,0),edges:M.inst.reduce((s,I)=>s+M.uniq[I.u].edges.length,0)}};
  // ---------- Blech ----------
  const coaxial=(A,B)=>{if(Math.abs(V.dot(A.d,B.d))<1-1e-6)return false;const w=V.sub(B.c,A.c);return V.len(V.sub(w,V.mul(A.d,V.dot(w,A.d))))<1e-3};
  M.sheet=(opts=0.5,inst=null)=>{if(typeof opts==='number')opts={modus:'manuell',K:opts};const K=opts.K??0.5;if(inst==null){if(M.inst.length!==1)return {ok:false,msg:'Mehrere Körper: Bitte im Baum ein einzelnes Teil wählen (Rechtsklick → Blech-Abwicklung).'};inst=0}
    const UU=M.uniq[M.inst[inst].u];M.faces=UU.faces;M.edges=UU.edges;const solid=null;const inS=()=>true;
    const cyl=M.faces.map((f,i)=>[f,i]).filter(([f])=>inS(f)&&f.cyl&&f.cyl.ang<Math.PI*1.999);
    const cand=new Map();const add=(t,w)=>{const k=t.toFixed(3);cand.set(k,(cand.get(k)||0)+w)};
    for(let i=0;i<cyl.length;i++)for(let j=i+1;j<cyl.length;j++){const A=cyl[i][0].cyl,B=cyl[j][0].cyl;if(coaxial(A,B)&&Math.abs(A.r-B.r)>1e-4)add(Math.abs(A.r-B.r),10*(cyl[i][0].area+cyl[j][0].area))}
    const pl=M.faces.map((f,i)=>[f,i]).filter(([f])=>inS(f)&&f.plane);
    for(let i=0;i<pl.length;i++)for(let j=i+1;j<pl.length;j++){const A=pl[i][0].plane,B=pl[j][0].plane;if(V.dot(A.n,B.n)<-1+1e-6){const d=Math.abs(V.dot(V.sub(B.o,A.o),A.n));if(d>1e-4)add(d,Math.min(pl[i][0].area,pl[j][0].area))}}
    if(!cand.size)return {ok:false,msg:'Keine Blechdicke erkennbar (keine parallelen Gegenflächen oder koaxialen Biegeflächen).'};
    const t=+[...cand.entries()].sort((a,b)=>b[1]-a[1])[0][0];
    const res={ok:true,t,K,modus:opts.modus,bends:[],warn:[]};
    // Basis: größte ebene Fläche
    const base=pl.sort((a,b)=>b[0].area-a[0].area)[0];if(!base){res.warn.push('Keine ebene Basisfläche gefunden.');return res}
    // Kanten-Nachbarschaft
    const lineEdgesOf=fi=>M.edges.map((e,i)=>[e,i]).filter(([e])=>e.faces.includes(fi)&&e.line&&e.faces.length===2);
    const maps=new Map();const skin=new Set([base[1]]);
    // Basis-Frame
    const n0=base[0].plane.n;let e1=null;
    for(const [e] of lineEdgesOf(base[1])){const o=M.faces[e.faces.find(x=>x!==base[1])];if(o.cyl&&Math.abs(V.dot(e.line.d,o.cyl.d))>1-1e-6){e1=e.line.d;break}}
    if(!e1)e1=lineEdgesOf(base[1])[0]?.[0].line.d||(Math.abs(n0[0])<.9?V.norm(V.cross(n0,[1,0,0])):V.norm(V.cross(n0,[0,1,0])));
    const e2=V.norm(V.cross(n0,e1));
    const planeMap=(o,a1,a2,O2,U2,V2)=>({kind:'p',o,a1,a2,O2,U2,V2,f:p=>{const w=V.sub(p,o),x=V.dot(w,a1),y=V.dot(w,a2);return [O2[0]+x*U2[0]+y*V2[0],O2[1]+x*U2[1]+y*V2[1]]},
      lin:v=>{const x=V.dot(v,a1),y=V.dot(v,a2);return [x*U2[0]+y*V2[0],x*U2[1]+y*V2[1]]}});
    maps.set(base[1],planeMap(base[0].plane.o,e1,e2,[0,0],[1,0],[0,1]));
    const queue=[base[1]];const bendLines=[];
    while(queue.length){const fi=queue.shift();const F=M.faces[fi],mF=maps.get(fi);
      for(const [e,ei] of lineEdgesOf(fi)){const gi=e.faces.find(x=>x!==fi);if(skin.has(gi))continue;const G=M.faces[gi];
        if(F.plane&&G.cyl&&Math.abs(V.dot(e.line.d,G.cyl.d))>1-1e-6){
          const C=G.cyl,d=C.d,q0=e.line.p;const w0=V.sub(q0,C.c);const r0=V.norm(V.sub(w0,V.mul(d,V.dot(w0,d))));
          let t0=V.cross(d,r0);const phiOf=(p,tt)=>{const w=V.sub(p,C.c),wr=V.sub(w,V.mul(d,V.dot(w,d)));let f=Math.atan2(V.dot(wr,tt),V.dot(wr,r0));if(f<-1e-7)f+=2*Math.PI;return f};
          if(phiOf(G.mid,t0)>C.ang)t0=V.mul(t0,-1);
          const rin=C.r>t*0.999&&coaxialPartner(gi,t)?.r<C.r?C.r-t:C.r; // Innenradius
          const th=C.ang;const bz=biegung(rin,t,th,opts);if(bz.hinweis&&!res.warn.includes(bz.hinweis))res.warn.push(bz.hinweis);
          const rn=bz.ba/th;const Q0=mF.f(q0),D2=norm2(mF.lin(d)),W2=norm2(mF.lin(t0));
          const mC={kind:'c',f:p=>{const ax=V.dot(V.sub(p,q0),d),ph=phiOf(p,t0);return [Q0[0]+ax*D2[0]+ph*rn*W2[0],Q0[1]+ax*D2[1]+ph*rn*W2[1]]},phiOf,t0,d,C,D2,W2,rn};
          maps.set(gi,mC);skin.add(gi);
          // Richtung: Achse auf der Seite der Flächennormale -> nach oben (zur Normalen)
          const side=V.dot(V.sub(C.c,q0),F.plane.n);
          const ba=bz.ba;
          const ends=e.pts;const mid=ends.map(p=>{const P2=mF.f(p);return [P2[0]+th*rn/2*W2[0],P2[1]+th*rn/2*W2[1]]});
          bendLines.push(mid);
          res.bends.push({nr:res.bends.length+1,face:gi,ri:rin,ang:th*DEG,dir:side>0?'nach oben':'nach unten',len:V.len(V.sub(ends[1],ends[0])),ba,v:bz.v,K:bz.K,quelle:bz.quelle,schenkel:(M.bendInfo(M.inst[inst].u,gi)?.legs)||[]});
          // weiter zur nächsten ebenen Fläche über die zweite Tangentenkante
          for(const [e2_,ei2] of lineEdgesOf(gi)){const hi=e2_.faces.find(x=>x!==gi);if(skin.has(hi)||ei2===ei)continue;const H=M.faces[hi];
            if(H.plane&&Math.abs(V.dot(e2_.line.d,d))>1-1e-6){const q1=e2_.line.p;const w1=V.sub(q1,C.c),r1=V.norm(V.sub(w1,V.mul(d,V.dot(w1,d))));
              let t1=V.cross(d,r1);if(V.dot(t1,t0)*Math.sign(V.dot(V.cross(d,r0),t0))<0||V.dot(V.cross(d,r1),V.cross(d,r0))*0!==0){} // Vorzeichen wie t0
              t1=V.mul(V.cross(d,r1),Math.sign(V.dot(V.cross(d,r0),t0)));
              maps.set(hi,planeMap(q1,d,t1,mC.f(q1),D2,W2));skin.add(hi);queue.push(hi)}
            else if(H.cyl)res.warn.push('Zwei Biegungen ohne geraden Abschnitt dazwischen werden nicht abgewickelt.')}
        }
      }
    }
    function coaxialPartner(gi,t){const A=M.faces[gi].cyl;for(const [f,i] of cyl)if(i!==gi&&coaxial(A,f.cyl)&&Math.abs(Math.abs(A.r-f.cyl.r)-t)<1e-3)return f.cyl;return null}
    // Konturen
    const lines=[];
    M.edges.forEach(e=>{const inSkin=e.faces.filter(f=>skin.has(f));if(!inSkin.length)return;if(inSkin.length===2)return;const m=maps.get(inSkin[0]);lines.push(e.pts.map(m.f))});
    const all=lines.flat();const mn=[Math.min(...all.map(p=>p[0])),Math.min(...all.map(p=>p[1]))],mx=[Math.max(...all.map(p=>p[0])),Math.max(...all.map(p=>p[1]))];
    res.flat={contour:lines,bendLines,min:mn,max:mx,size:[mx[0]-mn[0],mx[1]-mn[1]]};
    const nonSkinSheet=M.faces.filter((f,i)=>!skin.has(i)&&(f.plane||f.cyl)&&f.area>4*t*t*20).length;
    if(M.faces.some((f,i)=>inS(f)&&!skin.has(i)&&f.type!=='eben'&&f.type!=='zylindrisch'))res.warn.push('Das Teil enthält Freiform-/Kegelflächen; diese werden nicht abgewickelt.');
    if(false)res.warn.push('Mehrere Körper: Blechauswertung nur für zusammenhängende Flächen ab der größten ebenen Fläche.');
    // Plausibilität: Fläche der Abwicklung vs. Hautfläche
    const skinArea=[...skin].reduce((s,i)=>s+M.faces[i].area,0);res.skinArea=skinArea;
    return res};
  const norm2=v=>{const l=Math.hypot(v[0],v[1])||1;return [v[0]/l,v[1]/l]};

  M.dxf=(flat,unitsMm=true)=>{const L=[];const g=(c,v)=>L.push(String(c),String(v));
    g(0,'SECTION');g(2,'HEADER');g(9,'$INSUNITS');g(70,4);g(0,'ENDSEC');
    g(0,'SECTION');g(2,'TABLES');g(0,'TABLE');g(2,'LAYER');g(70,2);
    for(const [n,c] of [['KONTUR',7],['BIEGELINIEN',1]]){g(0,'LAYER');g(2,n);g(70,0);g(62,c);g(6,n==='KONTUR'?'CONTINUOUS':'DASHED')}
    g(0,'ENDTAB');g(0,'ENDSEC');g(0,'SECTION');g(2,'ENTITIES');
    const line=(a,b,layer)=>{g(0,'LINE');g(8,layer);g(10,(a[0]-flat.min[0]).toFixed(4));g(20,(a[1]-flat.min[1]).toFixed(4));g(30,0);g(11,(b[0]-flat.min[0]).toFixed(4));g(21,(b[1]-flat.min[1]).toFixed(4));g(31,0)};
    flat.contour.forEach(pl=>{for(let i=1;i<pl.length;i++)line(pl[i-1],pl[i],'KONTUR')});
    flat.bendLines.forEach(b=>line(b[0],b[1],'BIEGELINIEN'));
    g(0,'ENDSEC');g(0,'EOF');return L.join('\n')+'\n'};
  return M;
}

/** Nur Hierarchie + Namen aus occt-import-js (grobe Tessellierung, nur für die Zuordnung). */
export function hierFromImport(occt,bytes){
  const r=occt.ReadStepFile(bytes,{linearUnit:'millimeter',linearDeflectionType:'bounding_box_ratio',linearDeflection:0.02,angularDeflection:0.8});
  if(!r||!r.success)return null;
  const boxes=r.meshes.map(m=>{const p=m.attributes.position.array;const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
    for(let k=0;k<p.length;k+=3)for(let j=0;j<3;j++){mn[j]=Math.min(mn[j],p[k+j]);mx[j]=Math.max(mx[j],p[k+j])}return {min:mn,max:mx,name:m.name}});
  const strip=n=>({name:n.name,meshes:n.meshes,children:(n.children||[]).map(strip)});
  return {root:strip(r.root),boxes};
}
