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
      uniq:U.map(u=>({p:u.p,i:u.i,f:u.f,faces:u.faces.map(f=>({type:f.type})),edges:u.edges.map(e=>({type:e.type,pts:e.pts,c:e.circle?.c})),verts:u.verts.map(v=>v.p)})),
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
    o.pts=[];for(let i=0;i<=n;i++)o.pts.push(P(a.Value(u0+(u1-u0)*i/n)));
    return o};

  // ---------- Messen ----------
  // Auswahl {k,id,inst}: id lokal im Unikat der Instanz; alles in Weltkoordinaten auflösen
  const RES=s=>{if(s._r)return s._r;const I=M.inst[s.inst??0],U=M.uniq[I.u],m=I.m;const o={};
    if(s.k==='solid'){o.shape=U.shape.Moved(I.loc)}
    if(s.k==='face'){const f=U.faces[s.id];o.f={type:f.type,area:f.area,plane:f.plane&&{o:T.p(m,f.plane.o),n:T.d(m,f.plane.n)},cyl:f.cyl&&{...f.cyl,c:T.p(m,f.cyl.c),d:T.d(m,f.cyl.d)}};o.shape=f.shape.Moved(I.loc)}
    if(s.k==='edge'||s.k==='center'){const e=U.edges[s.id];o.e={type:e.type,len:e.len,line:e.line&&{p:T.p(m,e.line.p),d:T.d(m,e.line.d)},circle:e.circle&&{...e.circle,c:T.p(m,e.circle.c),n:T.d(m,e.circle.n)}};o.shape=e.shape.Moved(I.loc)}
    if(s.k==='vertex'){o.p=T.p(m,U.verts[s.id].p);o.shape=U.verts[s.id].shape.Moved(I.loc)}
    if(s.k==='center'){o.p=o.e.circle.c;o.shape=mkVertex(o.p)}
    if(s.k==='point'){o.p=s.p;o.shape=mkVertex(s.p)}
    return s._r=o};
  const sel2shape=s=>RES(s).shape;
  const selPoint=s=>RES(s).p;
  const dirOf=s=>{const r=RES(s);if(r.f){if(r.f.plane)return{kind:'n',d:r.f.plane.n};if(r.f.cyl)return{kind:'a',d:r.f.cyl.d}}
    if(r.e&&s.k==='edge'){if(r.e.line)return{kind:'a',d:r.e.line.d};if(r.e.circle)return{kind:'n',d:r.e.circle.n}}return null};
  M.minDist=(a,b)=>{const d=new oc.BRepExtrema_DistShapeShape_1();d.LoadS1(a);d.LoadS2(b);tryCall(()=>d.Perform(),()=>d.Perform(new oc.Message_ProgressRange_1()));
    if(!d.IsDone())throw new Error('Abstand konnte nicht berechnet werden');return {d:d.Value(),p1:P(d.PointOnShape1(1)),p2:P(d.PointOnShape2(1))}};
  M.describe=s=>{const R0=RES(s),R=[];if(s.k==='solid'){const q=M.solidProps([s.inst]);R.push(['Volumen',q.volume,'V'],['Oberfläche',q.area,'A']);return R}
    if(s.k==='face'){const f=R0.f;R.push(['Fläche',f.type,'t'],['Flächeninhalt',f.area,'A']);
      if(f.cyl){R.push(['Radius',f.cyl.r,'L'],['Durchmesser',2*f.cyl.r,'L'],['Öffnungswinkel',f.cyl.ang*DEG,'W'])}
      if(f.plane)R.push(['Normale',f.plane.n.map(x=>x.toFixed(4)).join(' / '),'t'])}
    if(s.k==='edge'){const e=R0.e;R.push(['Kante',e.type,'t'],['Kantenlänge',e.len,'L']);
      if(e.circle){R.push(['Radius',e.circle.r,'L'],['Durchmesser',2*e.circle.r,'L'],['Bogenwinkel',e.circle.ang*DEG,'W'],['Bogenlänge',e.circle.r*e.circle.ang,'L'],['Mittelpunkt',e.circle.c,'P'])}}
    if(s.k==='vertex'||s.k==='center'||s.k==='point')R.push([s.k==='center'?'Kreismittelpunkt':s.k==='vertex'?'Eckpunkt':'Punkt',selPoint(s),'P']);
    return R};
  M.measure=sels=>{
    const rows=[],gfx=[];
    if(sels.length===1)return {rows:M.describe(sels[0]),gfx};
    const [a,b]=sels;
    const md=M.minDist(sel2shape(a),sel2shape(b));
    rows.push(['Minimaler Abstand',md.d,'L'],['ΔX',Math.abs(md.p2[0]-md.p1[0]),'L'],['ΔY',Math.abs(md.p2[1]-md.p1[1]),'L'],['ΔZ',Math.abs(md.p2[2]-md.p1[2]),'L']);gfx.push([md.p1,md.p2]);
    const da=dirOf(a),db=dirOf(b);
    if(da&&db){let c=Math.min(1,Math.abs(V.dot(da.d,db.d)));let ang=Math.acos(c)*DEG;
      // Fläche–Fläche: Winkel zwischen Normalen (Diederwinkel), Kante–Kante: zwischen Richtungen, Kante–Fläche: 90°-Winkel zur Normalen
      if(da.kind!==db.kind)ang=90-ang;
      if(da.kind==='n'&&db.kind==='n'){const s=V.dot(da.d,db.d);rows.push(['Winkel',ang,'W'],['Winkel (Normalen)',Math.acos(Math.max(-1,Math.min(1,s)))*DEG,'W'])}
      else rows.push(['Winkel',ang,'W']);
      if(a.k==='face'&&b.k==='face'&&RES(a).f.plane&&RES(b).f.plane&&c>1-1e-9){const pa=RES(a).f.plane,pb=RES(b).f.plane;rows.push(['Paralleler Abstand',Math.abs(V.dot(V.sub(pb.o,pa.o),pa.n)),'L'])}
      if(da.kind==='a'&&db.kind==='a'&&c>1-1e-9&&a.k==='edge'&&b.k==='edge'){const pa=RES(a).e.line.p,pb=RES(b).e.line.p,w=V.sub(pb,pa);rows.push(['Paralleler Abstand',V.len(V.sub(w,V.mul(da.d,V.dot(w,da.d)))),'L'])}}
    const ax=s=>{const r=RES(s);if(r.f&&r.f.cyl)return r.f.cyl;if(s.k==='edge'&&r.e.circle){const c=r.e.circle;return{c:c.c,d:c.n}}return null};
    const ca=ax(a),cb=ax(b);
    if(ca&&cb&&Math.abs(V.dot(ca.d,cb.d))>1-1e-9){const w=V.sub(cb.c,ca.c);rows.push(['Achsabstand',V.len(V.sub(w,V.mul(ca.d,V.dot(w,ca.d)))),'L'])}
    const isP=s=>['vertex','center','point'].includes(s.k);
    if(isP(a)&&isP(b)){const pa=selPoint(a),pb=selPoint(b);rows.splice(0,4,['Abstand',V.len(V.sub(pb,pa)),'L'],['ΔX',Math.abs(pb[0]-pa[0]),'L'],['ΔY',Math.abs(pb[1]-pa[1]),'L'],['ΔZ',Math.abs(pb[2]-pa[2]),'L']);gfx[0]=[pa,pb]}
    return {rows,gfx}};
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
  M.sheet=(K=0.5,inst=null)=>{if(inst==null){if(M.inst.length!==1)return {ok:false,msg:'Mehrere Körper: Bitte im Baum ein einzelnes Teil wählen (Rechtsklick → Blech-Abwicklung).'};inst=0}
    const UU=M.uniq[M.inst[inst].u];M.faces=UU.faces;M.edges=UU.edges;const solid=null;const inS=()=>true;
    const cyl=M.faces.map((f,i)=>[f,i]).filter(([f])=>inS(f)&&f.cyl&&f.cyl.ang<Math.PI*1.999);
    const cand=new Map();const add=(t,w)=>{const k=t.toFixed(3);cand.set(k,(cand.get(k)||0)+w)};
    for(let i=0;i<cyl.length;i++)for(let j=i+1;j<cyl.length;j++){const A=cyl[i][0].cyl,B=cyl[j][0].cyl;if(coaxial(A,B)&&Math.abs(A.r-B.r)>1e-4)add(Math.abs(A.r-B.r),10*(cyl[i][0].area+cyl[j][0].area))}
    const pl=M.faces.map((f,i)=>[f,i]).filter(([f])=>inS(f)&&f.plane);
    for(let i=0;i<pl.length;i++)for(let j=i+1;j<pl.length;j++){const A=pl[i][0].plane,B=pl[j][0].plane;if(V.dot(A.n,B.n)<-1+1e-6){const d=Math.abs(V.dot(V.sub(B.o,A.o),A.n));if(d>1e-4)add(d,Math.min(pl[i][0].area,pl[j][0].area))}}
    if(!cand.size)return {ok:false,msg:'Keine Blechdicke erkennbar (keine parallelen Gegenflächen oder koaxialen Biegeflächen).'};
    const t=+[...cand.entries()].sort((a,b)=>b[1]-a[1])[0][0];
    const res={ok:true,t,K,bends:[],warn:[]};
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
          const rn=rin+K*t;const Q0=mF.f(q0),D2=norm2(mF.lin(d)),W2=norm2(mF.lin(t0));
          const mC={kind:'c',f:p=>{const ax=V.dot(V.sub(p,q0),d),ph=phiOf(p,t0);return [Q0[0]+ax*D2[0]+ph*rn*W2[0],Q0[1]+ax*D2[1]+ph*rn*W2[1]]},phiOf,t0,d,C,D2,W2,rn};
          maps.set(gi,mC);skin.add(gi);
          // Richtung: Achse auf der Seite der Flächennormale -> nach oben (zur Normalen)
          const side=V.dot(V.sub(C.c,q0),F.plane.n);
          const th=C.ang;const ba=th*rn;const ossb=Math.tan(Math.min(th,Math.PI-1e-9)/2)*(rin+t);
          const ends=e.pts;const mid=ends.map(p=>{const P2=mF.f(p);return [P2[0]+th*rn/2*W2[0],P2[1]+th*rn/2*W2[1]]});
          bendLines.push(mid);
          res.bends.push({nr:res.bends.length+1,face:gi,ri:rin,ang:th*DEG,dir:side>0?'nach oben':'nach unten',len:V.len(V.sub(ends[1],ends[0])),ba,v:ba-2*ossb});
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
