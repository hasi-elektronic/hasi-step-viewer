import {biegung} from './kfaktor.js';
import {faltePunkt} from './falten.js';
import {methodenZeile,projiziere,normalAbstand,PROJ_NORMALE,RICHTUNGEN,richtungsVektor} from './messen-hilfen.js';
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
    numberNames(tree);bereinigeWurzel(tree,name);lap('zuordnen');
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
    inst.forEach(I=>bindLoc(I,I.loc));
    M.shape=shape;M.uniq=U;M.inst=inst;M.unit=unit;M.vcache=new Map();
    const nameOf=new Array(inst.length).fill('Körper');const w=n=>{n.bodies.forEach(b=>nameOf[b]=n.name);n.children.forEach(w)};w(tree);
    M.faces=U[0]?.faces||[];M.edges=U[0]?.edges||[];
    times.gesamt=Date.now()-t0;
    return {name,unit,tree,times,stats:{...stats,unikate:U.length,instanzen:inst.length},
      uniq:U.map(u=>({p:u.p,i:u.i,f:u.f,faces:u.faces.map(f=>({type:f.type,ax:f.cyl?{c:f.cyl.c,d:f.cyl.d,r:f.cyl.r}:f.cone?{c:f.cone.c,d:f.cone.d,r:f.cone.rGross}:undefined})),edges:u.edges.map(e=>({type:e.type,pts:e.pts,c:e.circle?.c,n:e.circle?.n,r:e.circle?.r,mid:e.mid})),verts:u.verts.map(v=>v.p)})),
      inst:inst.map((x,i)=>({u:x.u,m:x.m,name:nameOf[i]})),ms:Date.now()-t0}};
  // ---------- Nativer Kern ----------
  // fromNative: Anzeige-Daten aus modell.bin des nativen Kerns (Netze, Flächen-/Kanteninfo, Baum, Lagen).
  // attachBrep: Unikate als BREP nachladen; Flächen/Kanten werden je Unikat erst beim ersten Messen indiziert (gleiche Reihenfolge wie M.load).
  const mul34=(a,b)=>{const r=new Array(12);for(let i=0;i<3;i++){for(let j=0;j<4;j++){let v=0;for(let k=0;k<3;k++)v+=a[i*4+k]*b[k*4+j];r[i*4+j]=v+(j===3?a[i*4+3]:0)}}return r};
  const ID34=[1,0,0,0,0,1,0,0,0,0,1,0];
  M.fromNative=(buf,stepHead,name='modell.step',hier=null)=>{
    const t0=Date.now(),dv=new DataView(buf),hl=dv.getUint32(0,true);
    const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,4,hl)));let ds=4+hl;while(ds%4)ds++;
    if(meta.version!==1)throw new Error('Nativer Kern: unbekanntes Datenformat');
    const text=typeof stepHead==='string'?stepHead:new TextDecoder('latin1').decode(stepHead.subarray(0,Math.min(stepHead.length,4e6)));
    const unit=stepUnit(text);
    const arr=(C,[o,n])=>new C(buf,ds+o,n/4);
    const U=meta.uniq.map((q,ui)=>{const u={nf:q.n[0],ne:q.n[1],nv:q.n[2],bb:q.bb,p:arr(Float32Array,q.p),i:arr(Uint32Array,q.i),f:arr(Uint32Array,q.f),native:q,ui};
      for(const k of ['faces','edges','verts','shape'])Object.defineProperty(u,k,{get:()=>(M.ensure(ui),u['_'+k]),enumerable:false,configurable:true});return u});
    const inst=[];const addInst=(u,m)=>{inst.push({u,m});return inst.length-1};
    const stats={knoten:0,passend:0};let tree;const base=name.replace(/\.(step|stp)$/i,'');
    if(meta.modus==='parallel'){
      const pd=meta.pd;const isChild=new Set();Object.values(pd).forEach(e=>e.kids.forEach(k=>isChild.add(k[0])));
      const solidsOf=(id,W)=>{const e=pd[id];if(!e)return [];const r=e.bodies.map(([u,m])=>addInst(u,mul34(W,m)));e.kids.forEach(([c,,m])=>r.push(...solidsOf(c,mul34(W,m))));return r};
      const build=(id,sn,W)=>{stats.knoten++;const e=pd[id]||{kids:[],bodies:[]};const node={name:sn?sn.name:'Teil',children:[],bodies:[]};
        if(!sn||!sn.children.length||!e.kids.length){node.bodies.push(...solidsOf(id,W));if(sn)stats.passend++;return node}
        if(e.kids.length===sn.children.length)stats.passend++;
        e.kids.forEach(([c,,m],i)=>{const cs=sn.children[i]&&sn.children[i].product===c?sn.children[i]:null;const ch=build(c,cs||{name:'Teil',children:[]},mul34(W,m));if(ch.bodies.length||ch.children.length)node.children.push(ch)});
        e.bodies.forEach(([u,m])=>node.bodies.push(addInst(u,mul34(W,m))));return node};
      const roots=Object.keys(pd).map(Number).filter(id=>!isChild.has(id)).sort((a,b)=>a-b);
      const hroots=hier&&hier.roots||[];const sOf=id=>hroots.find(r=>r.product===id)||null;
      if(roots.length===1&&pd[roots[0]].kids.length){tree=build(roots[0],sOf(roots[0])||{name:base,children:[]},ID34);if(!sOf(roots[0]))tree.name=base}
      else if(roots.some(r=>pd[r].kids.length)){tree={name:base,children:[],bodies:[]};roots.forEach(r=>{const c=build(r,sOf(r)||{name:'Teil',children:[]},ID34);if(c.bodies.length||c.children.length)tree.children.push(c)})}
      else{const ids=roots.flatMap(r=>solidsOf(r,ID34));const sr=hroots.length===1?hroots[0]:null;tree={name:(sr&&sr.name)||base,children:[],bodies:[]};
        if(ids.length===1)tree.bodies.push(ids[0]);else ids.forEach((x,i)=>tree.children.push({name:`Körper ${i+1}`,children:[],bodies:[x]}))}
    }else{
      // Rückfall-Modus des Kerns: OCCT-Struktur wie in M.load, Namen aus der STEP-Hierarchie
      meta.inst.forEach(q=>inst.push({u:q.u,m:q.m}));const allS=n=>[...n.solids,...n.kids.flatMap(allS)];
      const match=(sn,on)=>{stats.knoten++;const node={name:sn?sn.name:'Körper',children:[],bodies:[]};
        if(!sn||!sn.children.length){node.bodies.push(...allS(on));if(sn)stats.passend++;return node}
        let o=on;while(o.kids.length===1&&!o.solids.length&&sn.children.length>1)o=o.kids[0];
        if(o.kids.length===sn.children.length)stats.passend++;const n=Math.min(o.kids.length,sn.children.length);
        for(let i=0;i<n;i++){const c=match(sn.children[i],o.kids[i]);if(c.bodies.length||c.children.length)node.children.push(c)}
        for(let i=n;i<o.kids.length;i++)allS(o.kids[i]).forEach(x=>node.children.push({name:'Körper',children:[],bodies:[x]}));
        node.bodies.push(...o.solids);return node};
      const sroot=hier&&hier.roots&&hier.roots.length===1?hier.roots[0]:(hier&&hier.roots&&hier.roots.length>1?{name:base,children:hier.roots}:null);
      if(sroot&&sroot.children.length)tree=match(sroot,meta.tree);
      else{tree={name:(sroot&&sroot.name)||base,children:[],bodies:[]};const ss=allS(meta.tree);if(ss.length===1)tree.bodies.push(ss[0]);else ss.forEach((x,i)=>tree.children.push({name:`Körper ${i+1}`,children:[],bodies:[x]}))}
    }
    numberNames(tree);bereinigeWurzel(tree,name);
    inst.forEach(I=>bindLoc(I,null));
    M.shape=null;M.uniq=U;M.inst=inst;M.unit=unit;M.vcache=new Map();M.nativeBrep=null;M.faces=[];M.edges=[];
    const nameOf=new Array(inst.length).fill('Körper');const w=n=>{n.bodies.forEach(b=>nameOf[b]=n.name);n.children.forEach(w)};w(tree);
    const times={...meta.times,js:Date.now()-t0};
    return {name,unit,tree,times,kern:{modus:meta.modus,threads:meta.threads,fehler:meta.fehler},stats:{...stats,unikate:U.length,instanzen:inst.length},
      uniq:U.map(u=>({p:u.p,i:u.i,f:u.f,faces:u.native.faces.map(f=>({type:f.type,ax:f.ax})),edges:u.native.edges.map(e=>({type:e.type,pts:e.pts,c:e.c,n:e.n,r:e.r,mid:e.mid})),verts:u.native.verts})),
      inst:inst.map((x,i)=>({u:x.u,m:x.m,name:nameOf[i]}))}};
  M.attachBrep=text=>{const t0=Date.now();oc.FS.writeFile('/m.brep',text);const sh=new oc.TopoDS_Shape();const b=new oc.BRep_Builder();
    const ok=tryCall(()=>oc.BRepTools.Read_2(sh,'/m.brep',b,new oc.Handle_Message_ProgressIndicator_1()),()=>oc.BRepTools.Read_2(sh,'/m.brep',b,new oc.Message_ProgressRange_1()));oc.FS.unlink('/m.brep'); // kurzer Name: ocjs 1.1.1 liest längere Pfade hier nicht
    if(ok===false||sh.IsNull())throw new Error('Messdaten des nativen Kerns konnten nicht gelesen werden ('+ok+','+text.length+')');
    const list=[];const it=new oc.TopoDS_Iterator_2(sh,true,true);for(;it.More();it.Next())list.push(it.Value());
    if(list.length!==M.uniq.length)throw new Error(`Messdaten passen nicht zum Modell (${list.length} statt ${M.uniq.length} Teile)`);
    M.nativeBrep=list;if(M.uniq.length){M.faces=M.uniq[0].faces;M.edges=M.uniq[0].edges}return {ms:Date.now()-t0,teile:list.length}};
  M.ensure=ui=>{const u=M.uniq[ui];if(u._shape)return;if(!M.nativeBrep)throw new Error('Messdaten werden noch vorbereitet – bitte kurz warten.');
    const shape=M.nativeBrep[ui];const faces=new Index(),edges=new Index(),verts=new Index();
    explore(shape,TA.TopAbs_FACE,fs=>{const f=oc.TopoDS.Face_1(fs);const fi=faces.find(f,x=>M.faceInfo(oc.TopoDS.Face_1(x),ui));
      explore(f,TA.TopAbs_EDGE,es=>{const ei=edges.find(es,x=>M.edgeInfo(oc.TopoDS.Edge_1(x)));const e=edges.list[ei];if(!e.faces.includes(fi))e.faces.push(fi)})});
    explore(shape,TA.TopAbs_VERTEX,vs=>verts.find(vs,x=>({shape:oc.TopoDS.Vertex_1(x),p:P(oc.BRep_Tool.Pnt(oc.TopoDS.Vertex_1(x)))})));
    if(faces.list.length!==u.nf||edges.list.length!==u.ne||verts.list.length!==u.nv)throw new Error(`Messdaten weichen ab (Teil ${ui+1}: Flächen ${faces.list.length}/${u.nf}, Kanten ${edges.list.length}/${u.ne})`);
    u._shape=shape;u._faces=faces.list;u._edges=edges.list;u._verts=verts.list};
  // OCCT-Exporte ohne Produktnamen heißen „Open CASCADE STEP translator …“. Dann den Dateinamen zeigen.
  function bereinigeWurzel(tree,dateiname){
    const basis=String(dateiname||'Modell').replace(/\.(step|stp)$/i,'')||'Modell';
    if(!tree.name||/open cascade step translator/i.test(tree.name))tree.name=basis;
  }
  // Lage aus der 3×4-Matrix neu aufbauen, sobald die Matrix ersetzt wird (Verschieben ohne Neuladen).
  function bindLoc(I,fertig){
    I._loc=fertig||null;I._locM=fertig?I.m:null;
    Object.defineProperty(I,'loc',{configurable:true,enumerable:false,get(){
      if(this._locM!==this.m){const t=new oc.gp_Trsf_1();const m=this.m;
        t.SetValues(m[0],m[1],m[2],m[3],m[4],m[5],m[6],m[7],m[8],m[9],m[10],m[11]);
        this._loc=new oc.TopLoc_Location_2(t);this._locM=this.m}
      return this._loc}})}
  M.lagen=ms=>{
    if(!Array.isArray(ms)||ms.length!==M.inst.length)throw new Error('Lagen passen nicht zum Modell');
    ms.forEach((m,i)=>{if(m&&m.length===12)M.inst[i].m=m.slice()});
    return true};
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
    else if(t===ST.GeomAbs_Cone){const k=a.Cone(),al=k.SemiAngle(),R0=k.RefRadius();o.type='kegelig';
      // Kegelpunkt(u,v) = Ort + (R0 + v·sin α)·(cos u·X + sin u·Y) + v·cos α·Z  → Radien und Höhe aus dem v-Bereich der Fläche
      const ra=Math.abs(R0+v0*Math.sin(al)),rb=Math.abs(R0+v1*Math.sin(al));
      o.cone={c:P(k.Location()),d:D(k.Axis().Direction()),apex:P(k.Apex()),semi:Math.abs(al),rGross:Math.max(ra,rb),rKlein:Math.min(ra,rb),h:Math.abs((v1-v0)*Math.cos(al)),mantel:Math.abs(v1-v0),ang:u1-u0}}
    else if(t===ST.GeomAbs_Sphere){const k=a.Sphere();o.type='kugelig';o.sph={c:P(k.Location()),r:k.Radius()}}
    else if(t===ST.GeomAbs_Torus)o.type='torisch';else o.type='Freiform';
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
    if(s.k==='face'||(s.k==='axis'&&s.src==='face')){const f=U.faces[s.id];o.f={type:f.type,area:f.area,plane:f.plane&&{o:T.p(m,f.plane.o),n:T.d(m,f.plane.n)},cyl:cylW(f.cyl),cone:f.cone&&{...f.cone,c:T.p(m,f.cone.c),d:T.d(m,f.cone.d),apex:T.p(m,f.cone.apex)},sph:f.sph&&{...f.sph,c:T.p(m,f.sph.c)}};o.shape=f.shape.Moved(I.loc)}
    if(s.k==='edge'||s.k==='center'||s.k==='mid'||(s.k==='axis'&&s.src!=='face')){const e=U.edges[s.id];o.e={type:e.type,len:e.len,mid:T.p(m,e.mid),line:e.line&&{p:T.p(m,e.line.p),d:T.d(m,e.line.d)},circle:e.circle&&{...e.circle,c:T.p(m,e.circle.c),n:T.d(m,e.circle.n)}};o.shape=e.shape.Moved(I.loc)}
    if(s.k==='vertex'){o.p=T.p(m,U.verts[s.id].p);o.shape=U.verts[s.id].shape.Moved(I.loc)}
    if(s.k==='center'){o.p=o.e.circle.c;o.shape=mkVertex(o.p)}
    if(s.k==='mid'){o.p=o.e.mid;o.shape=mkVertex(o.p)}
    if(s.k==='axis'){const a=o.f?(o.f.cyl||(o.f.cone&&{c:o.f.cone.c,d:o.f.cone.d,r:o.f.cone.rGross})):o.e.circle&&{c:o.e.circle.c,d:o.e.circle.n,r:o.e.circle.r};if(!a)throw new Error('Keine Achse vorhanden');
      o.axis={c:a.c,d:V.norm(a.d),r:a.r};const L=1e5;o.shape=new oc.BRepBuilderAPI_MakeEdge_3(new oc.gp_Pnt_3(...V.add(a.c,V.mul(o.axis.d,-L))),new oc.gp_Pnt_3(...V.add(a.c,V.mul(o.axis.d,L)))).Edge()}
    if(s.k==='point'){o.p=s.p;o.shape=mkVertex(s.p)}
    return s._r=o};
  const sel2shape=s=>RES(s).shape;
  const selPoint=s=>RES(s).p;
  const isP=s=>['vertex','center','mid','point'].includes(s.k);
  // Richtung: n = Normale (ebene Fläche, Kreisebene), a = Achse/Richtung (Gerade, Zylinder, Achse)
  const dirOf=s=>{const r=RES(s);if(r.axis)return{kind:'a',d:r.axis.d};if(r.f){if(r.f.plane)return{kind:'n',d:r.f.plane.n};if(r.f.cyl)return{kind:'a',d:r.f.cyl.d};if(r.f.cone)return{kind:'a',d:r.f.cone.d}}
    if(r.e&&s.k==='edge'){if(r.e.line)return{kind:'a',d:r.e.line.d};if(r.e.circle)return{kind:'n',d:r.e.circle.n}}return null};
  // Mitte einer Auswahl (für Mitte-Mitte): Punkt, Kreismitte, Kantenmitte, Flächen-/Körperschwerpunkt (Zylinder: auf die Achse projiziert)
  const centerOf=s=>{const r=RES(s);if(r.p)return r.p;if(r.axis)return r.axis.c;
    if(r.e)return r.e.circle?r.e.circle.c:r.e.mid;
    if(r.f){if(r.f.sph)return r.f.sph.c;const c=props('S',r.shape).c;const a=r.f.cyl||r.f.cone;if(a){const dd=V.norm(a.d);return V.add(a.c,V.mul(dd,V.dot(V.sub(c,a.c),dd)))}return c}
    return props('V',r.shape).c};
  const holeAxis=s=>{const r=RES(s);if(r.axis)return r.axis;if(r.f&&r.f.cyl)return{c:r.f.cyl.c,d:V.norm(r.f.cyl.d),r:r.f.cyl.r};if(r.f&&r.f.cone)return{c:r.f.cone.c,d:V.norm(r.f.cone.d),r:r.f.cone.rGross};if(r.e&&r.e.circle&&(s.k==='edge'||s.k==='center'))return{c:r.e.circle.c,d:r.e.circle.n,r:r.e.circle.r};return null};
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
    // Umschlag (Falz): φ = 180° ± 0,006°. tan(φ/2) ist dort unendlich, einen Biegepunkt gibt es nicht (Schenkel parallel).
    const art=phi<Math.PI-1e-4?'normal':phi<=Math.PI+1e-4?'umschlag':'ueber180';
    const li=legs(ii),lo=legs(oi),tn=art==='normal'?Math.tan(phi/2):null;
    const pair=lo.map(o=>({o,i:li.find(x=>V.dot(x.rad,o.rad)>0.99)}));
    return {ri,ro,t:ro-ri,phi,art,inner:ii,outer:oi,legs:pair.map(({o,i})=>({aussen:tn==null?null:o.L+ro*tn,innen:tn==null||!i?null:i.L+ri*tn,geradeAussen:o.L,geradeInnen:i?i.L:null,bisAussenkante:art==='umschlag'?o.L+ro:null}))}};
  // ---- Fase (ZW3D-PMI „Chamfer“): ebene Streifenfläche zwischen zwei nicht parallelen ebenen Nachbarflächen ----
  // Schenkel = Abstand der Fasenkanten zur gedachten Schnittkante der Nachbarflächen (im Querschnitt senkrecht zur Fase).
  const deZahl=(v,n=3)=>(+v.toFixed(n)).toLocaleString('de-DE',{maximumFractionDigits:n});
  M.fase=(u,fi)=>{const U=M.uniq[u],F=U.faces,f=F[fi];if(!f||!f.plane)return null;
    const rand=U.edges.filter(e=>e.faces.includes(fi));if(rand.length!==4)return null;
    const es=rand.filter(e=>e.line&&e.faces.length===2).map(e=>({e,g:F[e.faces.find(x=>x!==fi)]})).filter(x=>x.g&&x.g.plane&&Math.abs(V.dot(x.g.plane.n,f.plane.n))<1-1e-6);
    let best=null;
    for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){const A=es[i],B=es[j];
      if(Math.abs(V.dot(A.e.line.d,B.e.line.d))<1-1e-9||Math.abs(V.dot(A.g.plane.n,B.g.plane.n))>1-1e-6)continue;
      const L=Math.min(A.e.len,B.e.len);if(!best||L>best.L)best={A,B,L}}
    if(!best)return null;
    const d=best.A.e.line.d,P1=best.A.e.line.p,Q=best.B.e.line.p,P2=V.sub(Q,V.mul(d,V.dot(V.sub(Q,P1),d)));const breite=V.len(V.sub(P2,P1));
    if(breite<1e-9||breite>best.L+1e-9)return null;
    const nA=best.A.g.plane.n,nB=best.B.g.plane.n,tA=V.norm(V.cross(nA,d)),tB=V.norm(V.cross(nB,d));
    const dA=V.dot(tA,nB),dB=V.dot(tB,nA);if(Math.abs(dA)<1e-9||Math.abs(dB)<1e-9)return null;
    const sA=V.dot(V.sub(P2,P1),nB)/dA,sB=V.dot(V.sub(P1,P2),nA)/dB,X=V.add(P1,V.mul(tA,sA));
    if(V.len(V.sub(X,V.add(P2,V.mul(tB,sB))))>1e-6)return null;
    let a=Math.abs(sA),b=Math.abs(sB);const wi=(p,q)=>Math.acos(Math.max(-1,Math.min(1,V.dot(V.norm(V.sub(q,p)),V.norm(V.sub(X,p))))))*DEG;
    let winkel=wi(P1,P2);if(b>a+1e-9){[a,b]=[b,a];winkel=wi(P2,P1)}
    // Fasenwinkel = Winkel zwischen Fase und der Fläche mit dem längeren Schenkel
    const gleich=Math.abs(a-b)<1e-6;const text=gleich?`${deZahl(a)} × ${deZahl(winkel,2)}°`:`${deZahl(a)} × ${deZahl(b)} (${deZahl(winkel,2)}°)`;
    return {a,b,winkel,breite,text,ecke:X,p1:P1,p2:P2}};
  M.describe=s=>{const R0=RES(s),R=[];if(s.k==='solid'){const q=M.solidProps([s.inst]);R.push(['Volumen',q.volume,'V'],['Oberfläche',q.area,'A']);return R}
    if(s.k==='face'){const f=R0.f;R.push(['Fläche',f.type,'t'],['Flächeninhalt',f.area,'A']);const u=perimeter(R0.shape);R.push(['Umfang (gesamt)',u.s,'L']);if(Math.abs(u.outer-u.s)>1e-9)R.push(['Umfang (außen)',u.outer,'L']);
      if(f.cyl){const bi=M.bendInfo(M.inst[s.inst??0].u,s.id);
        if(bi){R.unshift(['Radius innen Ri',bi.ri,'L','!'],['Radius außen Ra',bi.ro,'L','!'],['Bogenlänge (angeklickt)',f.cyl.r*f.cyl.ang,'L','!'],['Biegewinkel',bi.phi*DEG,'W','!']);
          R.push(['Blechdicke',bi.t,'L'],['Bogenlänge innen',bi.ri*bi.phi,'L'],['Bogenlänge außen',bi.ro*bi.phi,'L'],['Öffnungswinkel der Schenkel',Math.abs(180-bi.phi*DEG)<1e-6?0:Math.abs(180-bi.phi*DEG),'W']);
          if(bi.art==='umschlag')R.push(['Biegeart','Umschlag 180° (Falz)','t'],['Hinweis','Schenkel parallel: kein Biegepunkt. Angegeben sind gerader Teil und Maß bis Außenkante Umschlag.','t']);
          if(bi.art==='ueber180')R.push(['Biegeart','Biegung über 180°','t'],['Hinweis','Biegewinkel über 180°: Schenkellänge bis Biegepunkt ist nicht definiert. Angegeben ist der gerade Teil.','t']);
          // Schenkellänge in zwei Varianten: bis Biegepunkt (gerader Teil + R·tan(φ/2)) und gerader Teil ohne Biegung
          bi.legs.forEach((l,i)=>{const n='Schenkel '+(i+1);if(l.aussen!=null)R.push([n+' (bis Biegepunkt) außen',l.aussen,'L']);if(l.innen!=null)R.push([n+' (bis Biegepunkt) innen',l.innen,'L']);
            R.push([n+' gerader Teil außen',l.geradeAussen,'L']);if(l.geradeInnen!=null)R.push([n+' gerader Teil innen',l.geradeInnen,'L']);
            if(l.bisAussenkante!=null)R.push([n+' bis Außenkante Umschlag',l.bisAussenkante,'L'])});
          if(bi.legs.length===2&&bi.art==='normal')R.push(['Außenmaß über die Biegung',bi.legs[0].aussen+bi.legs[1].aussen,'L']);
          if(bi.art==='umschlag')R.push(['Außenmaß über Umschlag',2*bi.ro,'L'])}
        else{R.unshift(['Radius R',f.cyl.r,'L','!'],['Bogenlänge',f.cyl.r*f.cyl.ang,'L','!']);R.push(['Durchmesser Ø',2*f.cyl.r,'L'],['Radius R',f.cyl.r,'L'],['Öffnungswinkel',f.cyl.ang*DEG,'W'],['Bogenlänge',f.cyl.r*f.cyl.ang,'L'])}}
      if(f.cone){const k=f.cone;R.unshift(['Kegelwinkel (Senkwinkel)',2*k.semi*DEG,'W','!'],['Durchmesser groß Ø',2*k.rGross,'L','!'],['Durchmesser klein Ø',2*k.rKlein,'L','!'],['Kegelhöhe',k.h,'L','!']);
        R.push(['Halber Kegelwinkel',k.semi*DEG,'W'],['Mantellinie',k.mantel,'L'],['Kegelspitze',k.apex,'P'],['Achse durch',k.c,'P'],['Richtung',V.norm(k.d).map(x=>x.toFixed(4)).join(' / '),'t'])}
      if(f.sph){R.unshift(['Kugelradius R',f.sph.r,'L','!'],['Kugeldurchmesser Ø',2*f.sph.r,'L','!']);R.push(['Kugelmittelpunkt',f.sph.c,'P'])}
      if(f.plane){const fa=M.fase(M.inst[s.inst??0].u,s.id);
        if(fa)R.push(['Fase',fa.text,'t'],['Fase Schenkel 1',fa.a,'L'],['Fase Schenkel 2',fa.b,'L'],['Fasenwinkel',fa.winkel,'W'],['Fasenbreite',fa.breite,'L']);
        R.push(['Normale',f.plane.n.map(x=>x.toFixed(4)).join(' / '),'t'])}}
    if(s.k==='edge'){const e=R0.e;R.push(['Kante',e.type,'t'],['Kantenlänge',e.len,'L']);
      if(e.circle){R.unshift(e.circle.ang>2*Math.PI-1e-6?['Durchmesser Ø',2*e.circle.r,'L','!']:['Radius R',e.circle.r,'L','!'],['Bogenlänge',e.circle.r*e.circle.ang,'L','!']);R.push(['Durchmesser Ø',2*e.circle.r,'L'],['Radius R',e.circle.r,'L'],['Bogenwinkel',e.circle.ang*DEG,'W'],['Bogenlänge',e.circle.r*e.circle.ang,'L'],['Mittelpunkt',e.circle.c,'P'])}
      R.push(['Kantenmitte',e.mid,'P'])}
    if(s.k==='axis'){const a=R0.axis;R.push(['Achse durch',a.c,'P'],['Richtung',a.d.map(x=>x.toFixed(4)).join(' / '),'t']);if(a.r)R.push(['Durchmesser Ø',2*a.r,'L'],['Radius R',a.r,'L'])}
    if(isP(s))R.push([{center:'Kreismittelpunkt',vertex:'Eckpunkt',mid:'Kantenmitte',point:'Punkt'}[s.k],selPoint(s),'P']);
    const seen=new Set();return R.filter(r=>!seen.has(r[0])&&seen.add(r[0]))};
  const GROSS=1e5;
  const unendlich=s=>{const r=RES(s);
    if(s.k==='face'&&r.f&&r.f.plane){const pl=new oc.gp_Pln_3(new oc.gp_Pnt_3(...r.f.plane.o),new oc.gp_Dir_4(...V.norm(r.f.plane.n)));return new oc.BRepBuilderAPI_MakeFace_9(pl,-GROSS,GROSS,-GROSS,GROSS).Face()}
    if(s.k==='edge'&&r.e&&r.e.line){const p=r.e.mid,d=V.norm(r.e.line.d);return new oc.BRepBuilderAPI_MakeEdge_3(new oc.gp_Pnt_3(...V.add(p,V.mul(d,-GROSS))),new oc.gp_Pnt_3(...V.add(p,V.mul(d,GROSS)))).Edge()}
    return null};
  const delta=(rows,p1,p2,pre='')=>rows.push([pre+'ΔX',Math.abs(p2[0]-p1[0]),'L'],[pre+'ΔY',Math.abs(p2[1]-p1[1]),'L'],[pre+'ΔZ',Math.abs(p2[2]-p1[2]),'L']);
  // Projektion: opts.projektion = {art:'keine'|'bildschirm'|'xy'|'xz'|'yz'|'flaeche', n:[…] (Bildschirm: Blickrichtung in Modellkoordinaten)}
  const projZeilen=(rows,paar,sels,opts)=>{const pj=opts&&opts.projektion;if(!pj||!pj.art||pj.art==='keine'||!paar)return;
    let n=null,name='';
    if(pj.art==='bildschirm'){n=pj.n;name='Bildschirm'}
    else if(PROJ_NORMALE[pj.art]){n=PROJ_NORMALE[pj.art];name='Ebene '+pj.art.toUpperCase()}
    else if(pj.art==='flaeche'){const f=sels.find(x=>x.k==='face'&&RES(x).f.plane);if(f){n=RES(f).f.plane.n;name='gewählte Ebene'}}
    if(!n||V.len(n)<1e-12){rows.push(['Projektion','keine ebene Fläche gewählt','t']);return}
    const q=projiziere(paar[0],paar[1],n);rows.push(['Projiziert auf '+name,q.inEbene,'L'],['Senkrecht zu '+name,q.normal,'L'])};
  // Höhe, waagerechter Abstand und gewählte Maßrichtung (opts.richtung) zur gewählten Strecke; Hochachse = Modell-Z,
  // bei „Projiziert auf: Bildschirm“ der Bildschirm (opts.sicht = {oben, rechts, blick} in Modellkoordinaten).
  const richtungZeilen=(rows,paar,opts)=>{if(!paar)return null;const sicht=opts.sicht||{},bs=opts.projektion?.art==='bildschirm'&&!!sicht.oben;const v=V.sub(paar[1],paar[0]);
    const hv=richtungsVektor('vertikal',paar[0],paar[1],sicht,bs),hz=richtungsVektor('horizontal',paar[0],paar[1],sicht,bs);
    const zus=bs?' (Bildschirm)':'';rows.push(['Höhe (vertikal)'+zus,Math.abs(V.dot(v,hv)),'L'],['Horizontal (waagerecht)'+zus,hz?Math.abs(V.dot(v,hz)):0,'L']);
    const art=opts.richtung||'ausgerichtet';if(art==='ausgerichtet')return null;
    if(art==='vertikal'||art==='horizontal')return {art,name:(art==='vertikal'?'Höhe (vertikal)':'Horizontal (waagerecht)')+zus,dir:art==='vertikal'?hv:hz};
    const d=richtungsVektor(art,paar[0],paar[1],sicht,bs);const name=(RICHTUNGEN.find(x=>x[0]===art)||[])[2];if(!name)return null;
    rows.push([name,d?Math.abs(V.dot(v,d)):0,'L']);return {art,name,dir:d}};
  M.measure=(sels,opts={})=>{
    const rows=[],gfx=[];
    if(sels.length===1){const s0=sels[0],out={rows:M.describe(s0),gfx};
      // Fase: Anker (Mitte der Fasenfläche im Querschnitt, Modellkoordinaten) für die Fasenbemaßung „2 × 45°“
      if(s0.k==='face'){const I=M.inst[s0.inst??0],fa=M.uniq[I.u].faces[s0.id]?.plane?M.fase(I.u,s0.id):null;
        if(fa)out.fase={a:fa.a,b:fa.b,winkel:fa.winkel,p:T.p(I.m,V.mul(V.add(fa.p1,fa.p2),0.5))}}
      return out}
    if(sels.length>2){const ed=sels.filter(s=>s.k==='edge');
      if(ed.length)rows.push(['Gesamtlänge ('+ed.length+' Kanten)',ed.reduce((a,s)=>a+RES(s).e.len,0),'L']);
      const fa=sels.filter(s=>s.k==='face');if(fa.length)rows.push(['Gesamtfläche ('+fa.length+' Flächen)',fa.reduce((a,s)=>a+RES(s).f.area,0),'A']);
      if(!rows.length)rows.push(['Hinweis','Mehrfachauswahl nur für Kanten (Gesamtlänge) oder Flächen','t']);
      return {rows,gfx}}
    const [a,b]=sels;
    if(isP(a)&&isP(b)){const pa=selPoint(a),pb=selPoint(b);rows.push(['Abstand',V.len(V.sub(pb,pa)),'L']);delta(rows,pa,pb);gfx.push([pa,pb]);const ri=richtungZeilen(rows,[pa,pb],opts);projZeilen(rows,[pa,pb],sels,opts);
      const wahl=ri?ri.name:'Abstand';return {rows,gfx,label:rows.find(r=>r[0]===wahl)||rows[0],delta:[pa,pb],wahl,richtung:ri}}
    const md=M.minDist(sel2shape(a),sel2shape(b));const paare={min:[md.p1,md.p2]};
    rows.push(['Abstand min.',md.d,'L']);delta(rows,md.p1,md.p2);
    const mx=M.maxDist(a,b);if(mx){rows.push(['Abstand max.',mx.d,'L']);paare.max=[mx.p1,mx.p2]}
    if(a.k!=='axis'&&b.k!=='axis'){const ca=centerOf(a),cb=centerOf(b);
      // Rand–Mitte: kürzester Abstand vom Element A zur Mitte von B; Mitte–Rand umgekehrt (ZW3D „Bound to Center“ / „Center to Bound“)
      if(!isP(a)&&!isP(b)){const rm=M.minDist(sel2shape(a),mkVertex(cb)),mr=M.minDist(mkVertex(ca),sel2shape(b));
        rows.push(['Abstand Rand–Mitte',rm.d,'L'],['Abstand Mitte–Rand',mr.d,'L']);paare['rand-mitte']=[rm.p1,rm.p2];paare['mitte-rand']=[mr.p1,mr.p2]}
      rows.push(['Abstand Mitte–Mitte',V.len(V.sub(cb,ca)),'L']);delta(rows,ca,cb,'Mitte ');paare.mitte=[ca,cb]}
    const ia=unendlich(a),ib=unendlich(b);
    if(ia||ib){const u=M.minDist(ia||sel2shape(a),ib||sel2shape(b));rows.push(['Abstand unendlich verlängert',u.d,'L']);paare.unendlich=[u.p1,u.p2]}
    for(const [p,f] of [[a,b],[b,a]])if(isP(p)&&f.k==='face'&&RES(f).f.plane){const pl=RES(f).f.plane;rows.push(['Normalabstand Punkt–Ebene',normalAbstand(selPoint(p),pl.o,pl.n),'L'])}
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
    // Gewählte Abstandsmethode bestimmt Messlinie, ΔX/ΔY/ΔZ-Linien und Bemaßung. Fehlt sie (z. B. Rand–Mitte bei einem Punkt), gilt die nächstliegende.
    let w=opts.methode||'min';if(!paare[w])w=w==='rand-mitte'?(isP(a)?'mitte':'min'):w==='mitte-rand'?(isP(b)?'mitte':'min'):'min';if(!paare[w])w='min';
    const ri=richtungZeilen(rows,paare[w],opts);const name=ri?ri.name:methodenZeile(w);gfx.push(paare[w]);projZeilen(rows,paare[w],sels,opts);
    return {rows,gfx,label:rows.find(r=>r[0]===name)||rows[0],delta:paare[w],wahl:name,richtung:ri}};
  const meshVA=u=>{const U=M.uniq[u];if(U.mva)return U.mva;const p=U.p,ix=U.i;let v=0,A=0,cx=0,cy=0,cz=0;
    for(let t=0;t<ix.length;t+=3){const a=ix[t]*3,b=ix[t+1]*3,c=ix[t+2]*3;const ax=p[a],ay=p[a+1],az=p[a+2],bx=p[b],by=p[b+1],bz=p[b+2],qx=p[c],qy=p[c+1],qz=p[c+2];
      const dv=(ax*(by*qz-bz*qy)-ay*(bx*qz-bz*qx)+az*(bx*qy-by*qx))/6;v+=dv;cx+=dv*(ax+bx+qx)/4;cy+=dv*(ay+by+qy)/4;cz+=dv*(az+bz+qz)/4;
      const ux=bx-ax,uy=by-ay,uz=bz-az,wx=qx-ax,wy=qy-ay,wz=qz-az;A+=Math.hypot(uy*wz-uz*wy,uz*wx-ux*wz,ux*wy-uy*wx)/2}
    return U.mva={v:Math.abs(v),a:A,c:v?[cx/v,cy/v,cz/v]:[0,0,0]}};
  // ids: nur diese Instanzen (z. B. die sichtbaren). Ohne ids: alle. Ausgeblendete Bauteile zählen nicht (wie ZW3D Mass Properties).
  const instListe=ids=>Array.isArray(ids)?[...new Set(ids)].filter(i=>i>=0&&i<M.inst.length):M.inst.map((_,i)=>i);
  M.modelFast=(ids)=>{let vol=0,area=0,cx=[0,0,0];const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];const L=instListe(ids),II=L.map(i=>M.inst[i]);
    II.forEach(I=>{const q=meshVA(I.u);vol+=q.v;area+=q.a;const c=T.p(I.m,q.c);for(let k=0;k<3;k++)cx[k]+=c[k]*q.v;
      const b=M.uniq[I.u].bb;for(let k=0;k<8;k++){const pt=T.p(I.m,[k&1?b.max[0]:b.min[0],k&2?b.max[1]:b.min[1],k&4?b.max[2]:b.min[2]]);for(let j=0;j<3;j++){mn[j]=Math.min(mn[j],pt[j]);mx[j]=Math.max(mx[j],pt[j])}}});
    if(vol)cx=cx.map(x=>x/vol);
    return {approx:true,volume:vol,area,centroid:cx,bbox:{min:mn,max:mx},solids:II.length,unique:new Set(II.map(I=>I.u)).size,faces:II.reduce((s,I)=>s+(M.uniq[I.u].nf??M.uniq[I.u].faces.length),0),edges:II.reduce((s,I)=>s+(M.uniq[I.u].ne??M.uniq[I.u].edges.length),0),ausgeblendet:M.inst.length-II.length}};
  M.model=(ids)=>{const L=instListe(ids),II=L.map(i=>M.inst[i]);const q=M.solidProps(L);let cx=[0,0,0];
    II.forEach(I=>{const v=uProps(I.u);const c=T.p(I.m,v.c);for(let k=0;k<3;k++)cx[k]+=c[k]*v.v});if(q.volume)cx=cx.map(x=>x/q.volume);
    const bbox=isFinite(q.bbox.min[0])?q.bbox:(L.length===M.inst.length&&M.shape?M.bbox(M.shape):{min:[0,0,0],max:[0,0,0]});
    return {volume:q.volume,area:q.area,centroid:cx,bbox,solids:II.length,unique:new Set(II.map(I=>I.u)).size,faces:II.reduce((s,I)=>s+M.uniq[I.u].faces.length,0),edges:II.reduce((s,I)=>s+M.uniq[I.u].edges.length,0),ausgeblendet:M.inst.length-II.length}};
  // ---------- Hüllquader und Rohmaß ----------
  // Punkte: Knoten der Tessellierung (liegen exakt auf den Flächen; Ecken ebener Teile exakt, gekrümmte Flächen bis auf die Netzfeinheit).
  // Hüllquader „achsparallel“ (Modellachsen), „bezug“ (eine Achse = Normale der gewählten Fläche bzw. Richtung der gewählten Kante,
  // die beiden anderen als kleinstes Rechteck darum) und „minimal“ (kleinstes Volumen über alle Flächennormalen, Kanten- und Zylinderachsen).
  const huellPunkte=(ids,netze)=>{const seen=new Set(),out=[];for(const i of instListe(ids)){const I=M.inst[i],p=netze?.[I.u]||M.uniq[I.u].p;
      for(let k=0;k<p.length;k+=3){const q=T.p(I.m,[p[k],p[k+1],p[k+2]]);const key=q.map(v=>Math.round(v*1e5)).join(',');if(!seen.has(key)){seen.add(key);out.push(q)}}}return out};
  const huelle2=P=>{const p=[...P].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
    const lo=[],hi=[];for(const q of p){while(lo.length>1&&cr(lo.at(-2),lo.at(-1),q)<=1e-12)lo.pop();lo.push(q)}
    for(let i=p.length-1;i>=0;i--){const q=p[i];while(hi.length>1&&cr(hi.at(-2),hi.at(-1),q)<=1e-12)hi.pop();hi.push(q)}lo.pop();hi.pop();return lo.concat(hi)};
  const basisZu=a=>{const u=V.norm(Math.abs(a[0])<0.9?V.cross(a,[1,0,0]):V.cross(a,[0,1,0]));return [u,V.cross(a,u)]};
  // kleinstes Rechteck um die Projektion auf die Ebene senkrecht zu a (Drehschieblehre über die Kanten der konvexen Hülle)
  const minRechteck=(pts,a)=>{const [u,v]=basisZu(a);const H=huelle2(pts.map(p=>[V.dot(p,u),V.dot(p,v)]));let best=null;
    const n=H.length;for(let i=0;i<Math.max(1,n);i++){const A=H[i],B=H[(i+1)%n]||A;let dx=B[0]-A[0],dy=B[1]-A[1];const l=Math.hypot(dx,dy);if(l<1e-12){dx=1;dy=0}else{dx/=l;dy/=l}
      let a0=Infinity,a1=-Infinity,b0=Infinity,b1=-Infinity;for(const q of H){const x=q[0]*dx+q[1]*dy,y=-q[0]*dy+q[1]*dx;if(x<a0)a0=x;if(x>a1)a1=x;if(y<b0)b0=y;if(y>b1)b1=y}
      const F=(a1-a0)*(b1-b0);if(!best||F<best.F-1e-9)best={F,dx,dy,a0,a1,b0,b1}}
    const e1=V.norm(V.add(V.mul(u,best.dx),V.mul(v,best.dy))),e2=V.cross(a,e1);return {e1,e2,r1:[best.a0,best.a1],r2:[best.b0,best.b1]}};
  const quader=(pts,a)=>{a=V.norm(a);const R=minRechteck(pts,a);let c0=Infinity,c1=-Infinity;for(const p of pts){const z=V.dot(p,a);if(z<c0)c0=z;if(z>c1)c1=z}
    const ach=[R.e1,R.e2,a],rr=[R.r1,R.r2,[c0,c1]];return mkQuader(ach,rr)};
  const mkQuader=(ach,rr)=>{const masse=rr.map(r=>r[1]-r[0]);const ecken=[];for(let k=0;k<8;k++){let p=[0,0,0];for(let j=0;j<3;j++)p=V.add(p,V.mul(ach[j],rr[j][(k>>j)&1]));ecken.push(p)}
    const mitte=[0,1,2].reduce((p,j)=>V.add(p,V.mul(ach[j],(rr[j][0]+rr[j][1])/2)),[0,0,0]);return {achsen:ach,masse,sortiert:[...masse].sort((x,y)=>y-x),volumen:masse[0]*masse[1]*masse[2],ecken,mitte}};
  const kandidaten=ids=>{const out=[];const add=d=>{if(!d)return;d=V.norm(d);if(!out.some(x=>Math.abs(V.dot(x,d))>1-1e-9))out.push(d)};
    [[1,0,0],[0,1,0],[0,0,1]].forEach(add);
    for(const i of instListe(ids)){const I=M.inst[i],U=M.uniq[I.u];const fl=[...U.faces].sort((a,b)=>b.area-a.area).slice(0,80);
      fl.forEach(f=>{if(f.plane)add(T.d(I.m,f.plane.n));else if(f.cyl)add(T.d(I.m,f.cyl.d));else if(f.cone)add(T.d(I.m,f.cone.d))});
      U.edges.filter(e=>e.line).slice(0,80).forEach(e=>add(T.d(I.m,e.line.d)));if(out.length>150)break}
    return out};
  // kleinster Hüllkreis (Welzl, iterativ) für Rohmaß Zylinder
  const kreis2=P=>{const pts=[...P];for(let i=pts.length-1;i>0;i--){const j=(i*7919+13)%(i+1);[pts[i],pts[j]]=[pts[j],pts[i]]}
    const k2=(a,b)=>({c:[(a[0]+b[0])/2,(a[1]+b[1])/2],r:Math.hypot(a[0]-b[0],a[1]-b[1])/2});
    const k3=(a,b,c)=>{const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));if(Math.abs(d)<1e-14)return null;const A=a[0]**2+a[1]**2,B=b[0]**2+b[1]**2,C=c[0]**2+c[1]**2;
      const x=(A*(b[1]-c[1])+B*(c[1]-a[1])+C*(a[1]-b[1]))/d,y=(A*(c[0]-b[0])+B*(a[0]-c[0])+C*(b[0]-a[0]))/d;return {c:[x,y],r:Math.hypot(a[0]-x,a[1]-y)}};
    const drin=(k,p)=>Math.hypot(p[0]-k.c[0],p[1]-k.c[1])<=k.r*(1+1e-12)+1e-9;
    let k={c:pts[0]||[0,0],r:0};for(let i=1;i<pts.length;i++)if(!drin(k,pts[i])){k={c:pts[i],r:0};for(let j=0;j<i;j++)if(!drin(k,pts[j])){k=k2(pts[i],pts[j]);
      for(let l=0;l<j;l++)if(!drin(k,pts[l])){const n=k3(pts[i],pts[j],pts[l]);if(n)k=n}}}return k};
  M.huelle=(opts={})=>{const ids=opts.ids;const pts=huellPunkte(ids,opts.netze);if(!pts.length)return {ok:false,msg:'Keine Geometrie (alles ausgeblendet?).'};
    const res={ok:true,punkte:pts.length};
    const mn=[0,1,2].map(j=>Math.min(...pts.map(p=>p[j]))),mx=[0,1,2].map(j=>Math.max(...pts.map(p=>p[j])));
    res.achsparallel=mkQuader([[1,0,0],[0,1,0],[0,0,1]],[0,1,2].map(j=>[mn[j],mx[j]]));
    if(opts.bezug){const s=opts.bezug,I=M.inst[s.inst??0],U=M.uniq[I.u];let a=null,name='';
      if(s.k==='face'||s.k==='axis'){const f=U.faces[s.id];if(f?.plane){a=T.d(I.m,f.plane.n);name='Normale der gewählten Fläche'}else if(f?.cyl){a=T.d(I.m,f.cyl.d);name='Achse der gewählten Zylinderfläche'}else if(f?.cone){a=T.d(I.m,f.cone.d);name='Achse der gewählten Kegelfläche'}}
      else if(s.k==='edge'){const e=U.edges[s.id];if(e?.line){a=T.d(I.m,e.line.d);name='Richtung der gewählten Kante'}else if(e?.circle){a=T.d(I.m,e.circle.n);name='Achse der gewählten Kreiskante'}}
      if(a){res.bezug={...quader(pts,a),name}}else res.bezugFehler='Bezug muss eine ebene Fläche, eine Zylinderfläche oder eine gerade bzw. kreisförmige Kante sein.'}
    const K=kandidaten(ids);let best=null;for(const a of K){const q=quader(pts,a);if(!best||q.volumen<best.volumen-1e-9)best=q}res.minimal=best;res.kandidaten=K.length;
    // Rohmaß Zylinder: Achse aus Zylinderflächen (nach Fläche gewichtet) oder den Achsen des minimalen Quaders
    const zk=[];const addZ=d=>{d=V.norm(d);if(!zk.some(x=>Math.abs(V.dot(x,d))>1-1e-9))zk.push(d)};
    for(const i of instListe(ids)){const I=M.inst[i];M.uniq[I.u].faces.filter(f=>f.cyl).sort((a,b)=>b.area-a.area).slice(0,20).forEach(f=>addZ(T.d(I.m,f.cyl.d)))}
    best.achsen.forEach(addZ);
    let z=null;for(const a of zk){const [u,v]=basisZu(a);const H=huelle2(pts.map(p=>[V.dot(p,u),V.dot(p,v)]));const k=kreis2(H);let c0=Infinity,c1=-Infinity;for(const p of pts){const t=V.dot(p,a);if(t<c0)c0=t;if(t>c1)c1=t}
      const vol=Math.PI*k.r*k.r*(c1-c0);if(!z||vol<z.volumen-1e-9)z={d:2*k.r,l:c1-c0,achse:a,mitte:V.add(V.add(V.mul(u,k.c[0]),V.mul(v,k.c[1])),V.mul(a,(c0+c1)/2)),volumen:vol}}
    res.rohmass={block:{masse:best.sortiert,volumen:best.volumen},zylinder:z,empfehlung:z&&z.volumen<best.volumen?'Zylinder':'Block'};
    return res};
  // ---------- Blech ----------
  // Abwicklung als Baum über den Flächengraphen einer Blechseite („Haut“): Start an der größten ebenen Hautfläche,
  // Übergänge nur über tangentiale gerade Kanten (Ebene↔Zylinder, Zylinder↔Zylinder bei direkt aufeinanderfolgenden Biegungen,
  // Ebene↔Ebene bei geteilten Flächen). Jede Kante liefert einen „Kantenrahmen“ (Punkt q, Kantenrichtung d, Tangente t in die
  // Nachbarfläche, Bild Q in 2D mit Richtungen D2/W2); daran wird die Nachbarfläche angehängt. Zylinder werden über die neutrale
  // Faser abgewickelt (Bogenlänge = Biegezugabe). Danach Prüfung: Flächenbilanz, Selbstüberschneidung, nicht erreichte Flächen.
  const coaxial=(A,B)=>{if(Math.abs(V.dot(A.d,B.d))<1-1e-6)return false;const w=V.sub(B.c,A.c);return V.len(V.sub(w,V.mul(A.d,V.dot(w,A.d))))<1e-3};
  const norm2=v=>{const l=Math.hypot(v[0],v[1])||1;return [v[0]/l,v[1]/l]};
  const radial=(C,p)=>{const w=V.sub(p,C.c);return V.norm(V.sub(w,V.mul(C.d,V.dot(w,C.d))))};
  const segX=(a,b,c,d)=>{const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);const e=1e-9;
    const d1=o(c,d,a),d2=o(c,d,b),d3=o(a,b,c),d4=o(a,b,d);return ((d1>e&&d2<-e)||(d1<-e&&d2>e))&&((d3>e&&d4<-e)||(d3<-e&&d4>e))};
  M.sheet=(opts=0.5,inst=null)=>{if(typeof opts==='number')opts={modus:'manuell',K:opts};const K=opts.K??0.5;if(inst==null){if(M.inst.length!==1)return {ok:false,msg:'Mehrere Körper: Bitte im Baum ein einzelnes Teil wählen (Rechtsklick → Blech-Abwicklung).'};inst=0}
    const UU=M.uniq[M.inst[inst].u];M.faces=UU.faces;M.edges=UU.edges;const F=M.faces,E=M.edges;
    const cyl=F.map((f,i)=>[f,i]).filter(([f])=>f.cyl&&f.cyl.ang<Math.PI*1.999);
    const cand=new Map();const add=(t,w)=>{const k=t.toFixed(3);cand.set(k,(cand.get(k)||0)+w)};
    for(let i=0;i<cyl.length;i++)for(let j=i+1;j<cyl.length;j++){const A=cyl[i][0].cyl,B=cyl[j][0].cyl;if(coaxial(A,B)&&Math.abs(A.r-B.r)>1e-4)add(Math.abs(A.r-B.r),10*(cyl[i][0].area+cyl[j][0].area))}
    const pl=F.map((f,i)=>[f,i]).filter(([f])=>f.plane);
    for(let i=0;i<pl.length;i++)for(let j=i+1;j<pl.length;j++){const A=pl[i][0].plane,B=pl[j][0].plane;if(V.dot(A.n,B.n)<-1+1e-6){const d=Math.abs(V.dot(V.sub(B.o,A.o),A.n));if(d>1e-4)add(d,Math.min(pl[i][0].area,pl[j][0].area))}}
    if(!cand.size){const fr=[...new Set(F.filter(f=>!f.plane&&!f.cyl).map(f=>f.type))];return {ok:false,msg:fr.length?`Nicht abwickelbar: Das Teil besteht aus ${fr.join(', ')}en Flächen ohne erkennbare Blechdicke.`:'Keine Blechdicke erkennbar (keine parallelen Gegenflächen oder koaxialen Biegeflächen).'}}
    const t=+[...cand.entries()].sort((a,b)=>b[1]-a[1])[0][0];
    const res={ok:true,t,K,modus:opts.modus,bends:[],warn:[],fehler:[]};
    const partner=gi=>{const A=F[gi].cyl;for(const [f,i] of cyl)if(i!==gi&&coaxial(A,f.cyl)&&Math.abs(Math.abs(A.r-f.cyl.r)-t)<1e-3)return f.cyl;return null};
    // Basis: größte ebene Fläche mit Gegenfläche im Abstand t (also eine Hautfläche, keine Stirnfläche)
    const hasOpp=([f])=>pl.some(([g])=>V.dot(f.plane.n,g.plane.n)<-1+1e-6&&Math.abs(Math.abs(V.dot(V.sub(g.plane.o,f.plane.o),f.plane.n))-t)<1e-3);
    // Gleich große Flächen (z. B. Innen-/Außenseite eines Flansches) geometrisch entscheiden, nicht nach Flächenreihenfolge (die hängt von der OCCT-Version ab)
    const byArea=(a,b)=>{const d=b[0].area-a[0].area;if(Math.abs(d)>1e-6*Math.max(a[0].area,b[0].area))return d;const na=a[0].plane.n,nb=b[0].plane.n;
      for(let k=0;k<3;k++)if(Math.abs(na[k]-nb[k])>1e-9)return nb[k]-na[k];return V.dot(b[0].plane.o,nb)-V.dot(a[0].plane.o,na)};
    // Feste Fläche (ZW3D „Set Stationary Face“): vom Benutzer gewählt (opts.basis = Flächen-Nr. im Teil) oder automatisch die größte Blechfläche
    let base;
    if(opts.basis!=null){const c=pl.find(([,i])=>i===opts.basis);
      if(!c){res.fehler.push('Die gewählte feste Fläche ist nicht eben. Bitte eine ebene Blechfläche wählen.');return res}
      if(!hasOpp(c)){res.fehler.push('Die gewählte feste Fläche ist keine Blechseite (Stirnfläche?). Bitte eine Ober- oder Unterseite wählen.');return res}
      base=c;res.basisGewaehlt=true}
    else base=pl.filter(hasOpp).sort(byArea)[0]||pl.sort(byArea)[0];
    if(base)res.basis=base[1];
    if(!base){res.warn.push('Keine ebene Basisfläche gefunden.');res.fehler.push('Keine ebene Basisfläche – keine Abwicklung möglich.');return res}
    const lineEdgesOf=fi=>E.map((e,i)=>[e,i]).filter(([e])=>e.faces.includes(fi)&&e.line&&e.faces.length===2);
    const n0=base[0].plane.n;let e1=null;
    for(const [e] of lineEdgesOf(base[1])){const o=F[e.faces.find(x=>x!==base[1])];if(o.cyl&&Math.abs(V.dot(e.line.d,o.cyl.d))>1-1e-6){e1=e.line.d;break}}
    if(!e1)e1=lineEdgesOf(base[1])[0]?.[0].line.d||(Math.abs(n0[0])<.9?V.norm(V.cross(n0,[1,0,0])):V.norm(V.cross(n0,[0,1,0])));
    const e2=V.norm(V.cross(n0,e1));
    const maps=new Map(),skin=new Set([base[1]]),bendLines=[],sharp=new Set(),tree=new Set();
    // Ebenen-Abbildung; frame(e,q) = Kantenrahmen in 2D: Bildpunkt Q, Bild der Kantenrichtung D2, Bild der Richtung aus der Fläche heraus W2
    const planeMap=(fi,o,a1,a2,O2,U2,V2)=>{const m={kind:'p',f:p=>{const w=V.sub(p,o),x=V.dot(w,a1),y=V.dot(w,a2);return [O2[0]+x*U2[0]+y*V2[0],O2[1]+x*U2[1]+y*V2[1]]},
      lin:v=>{const x=V.dot(v,a1),y=V.dot(v,a2);return [x*U2[0]+y*V2[0],x*U2[1]+y*V2[1]]}};
      m.frame=(e,q)=>({Q:m.f(q),D2:norm2(m.lin(e.line.d)),W2:norm2(m.lin(V.mul(tanInto(F[fi],e,q),-1)))});return m};
    // Tangente in Fläche G an der geraden Kante e im Punkt q, zeigt in G hinein
    const tanInto=(G,e,q)=>{if(G.plane){let m=V.norm(V.cross(G.plane.n,e.line.d));const c=props('S',G.shape).c;if(V.dot(V.sub(c,q),m)<0)m=V.mul(m,-1);return m}
      const C=G.cyl,r0=radial(C,q);let t0=V.norm(V.cross(C.d,r0));const w=radial(C,G.mid);let f=Math.atan2(V.dot(w,t0),V.dot(w,r0));if(f<0)f+=2*Math.PI;
      return f<=C.ang+1e-7?t0:V.mul(t0,-1)};
    const isTangent=(Fa,Gb,e,q)=>{if(Fa.cyl&&Math.abs(V.dot(e.line.d,Fa.cyl.d))<1-1e-6)return false;if(Gb.cyl&&Math.abs(V.dot(e.line.d,Gb.cyl.d))<1-1e-6)return false;
      const na=Fa.plane?Fa.plane.n:radial(Fa.cyl,q),nb=Gb.plane?Gb.plane.n:radial(Gb.cyl,q);return Math.abs(Math.abs(V.dot(na,nb))-1)<1e-6};
    maps.set(base[1],planeMap(base[1],base[0].plane.o,e1,e2,[0,0],[1,0],[0,1]));
    const isSkinPlane=G=>pl.some(([g])=>V.dot(G.plane.n,g.plane.n)<-1+1e-6&&Math.abs(Math.abs(V.dot(V.sub(g.plane.o,G.plane.o),G.plane.n))-t)<1e-3);
    // Falt-Daten für die Animation (src/falten.js): Kette der Biegungen je Hautfläche, Richtung sigma numerisch bestimmt
    const FB={o:base[0].plane.o,e1,e2,n0},fbends=[],kette=new Map([[base[1],{k:[],wrap:false}]]);let faltFehler=0;
    const neueFaltung=(fi,gi,b,wrap,probe,mG)=>{const kp=kette.get(fi).k;fbends.push({...b,sigma:1});const bi=fbends.length-1;const k={k:[...kp,bi],wrap};
      const P2=mG.f(probe);let best=Infinity,sg=1;for(const s of [1,-1]){fbends[bi].sigma=s;const p=faltePunkt(P2,k.k,wrap,fbends,FB,0);const d=V.len(V.sub(p,probe));if(d<best){best=d;sg=s}}
      fbends[bi].sigma=sg;kette.set(gi,k);faltFehler=Math.max(faltFehler,best);return sg};
    // Abschnitte (Klippen) je Fläche: angenommene Biegungen kürzen die angrenzenden Flächen um den Rückversatz
    const clips=new Map(),addClip=(fi,c)=>{if(!clips.has(fi))clips.set(fi,[]);clips.get(fi).push(c)};
    const extraKanten=[];let korr=0,annahmen=0;const pending=[];
    const queue=[base[1]];
    const bfs=()=>{while(queue.length){const fi=queue.shift();const Fa=F[fi],mF=maps.get(fi);
      for(const [e,ei] of lineEdgesOf(fi)){const gi=e.faces.find(x=>x!==fi);if(skin.has(gi))continue;const G=F[gi];if(!G.plane&&!G.cyl)continue;
        const q=e.line.p;
        if(!isTangent(Fa,G,e,q)){const c=Fa.plane&&G.plane?Math.abs(V.dot(Fa.plane.n,G.plane.n)):1;
          if(c<1-1e-6&&Fa.plane&&G.plane&&isSkinPlane(G)&&G.area>t*t*4)pending.push([fi,e,ei,gi]);continue}
        const {Q,D2,W2}=mF.frame(e,q),tq=tanInto(G,e,q),eD=e.line.d;
        if(G.plane){maps.set(gi,planeMap(gi,q,eD,tq,Q,D2,W2));const kp=kette.get(fi);kette.set(gi,{k:kp.k,wrap:false})}
        else{const C=G.cyl,r0=radial(C,q),t0=tq;
          const phiOf=p=>{const w=radial(C,p);let f=Math.atan2(V.dot(w,t0),V.dot(w,r0));if(f<-1e-7)f+=2*Math.PI;return f};
          const pc=partner(gi),rin=pc&&pc.r<C.r?pc.r:C.r,th=C.ang;
          const bz=biegung(rin,t,th,opts);if(bz.hinweis&&!res.warn.includes(bz.hinweis))res.warn.push(bz.hinweis);
          const rn=bz.ba/th;
          const m={kind:'c',f:p=>{const ax=V.dot(V.sub(p,q),eD),ph=phiOf(p);return [Q[0]+ax*D2[0]+ph*rn*W2[0],Q[1]+ax*D2[1]+ph*rn*W2[1]]},
            lin:v=>{const ax=V.dot(v,eD);return [ax*D2[0],ax*D2[1]]}};
          m.frame=(e2,q2)=>{const out=phiOf(q2)>th/2?W2:[-W2[0],-W2[1]];return {Q:m.f(q2),D2:norm2(m.lin(e2.line.d)),W2:out}};
          maps.set(gi,m);
          const ends=e.pts.map(mF.f);bendLines.push(ends.map(P2=>[P2[0]+th*rn/2*W2[0],P2[1]+th*rn/2*W2[1]]));
          const inner=!pc||pc.r>C.r;
          const sg=neueFaltung(fi,gi,{S2:Q,D2,W2,BZ:bz.ba,th,dS:rn-C.r},true,G.mid,m);
          res.bends.push({nr:res.bends.length+1,face:gi,ri:rin,ang:th*DEG,dir:inner?'nach oben':'nach unten',sigma:sg,seite:W2,len:V.len(V.sub(e.pts.at(-1),e.pts[0])),ba:bz.ba,v:bz.v,bd:bz.bd,K:bz.K,quelle:bz.quelle,tabelle:bz.tabelle||null,schenkel:(M.bendInfo(M.inst[inst].u,gi)?.legs)||[]})}
        skin.add(gi);queue.push(gi);tree.add(ei)}
    }};
    bfs();
    // Scharfe Kanten ohne Radius: mit opts.riAnnahme als Biegung mit angenommenem Innenradius abwickeln (ZW3D „Biegung an scharfer Kante“)
    const Ri=Number(opts.riAnnahme);
    while(Ri>0){const p=pending.find(([,,,gi])=>!skin.has(gi));if(!p)break;const [fi,e,ei,gi]=p;const Fa=F[fi],G=F[gi],mF=maps.get(fi),q=e.line.p,eD=e.line.d;
      const tA=tanInto(Fa,e,q),tB=tanInto(G,e,q),th=Math.PI-Math.acos(Math.max(-1,Math.min(1,V.dot(tA,tB))));
      const inner=V.dot(tB,Fa.plane.n)>0,rs=inner?Ri:Ri+t,s=rs*Math.tan(th/2);
      const bz=biegung(Ri,t,th,opts);if(bz.hinweis&&!res.warn.includes(bz.hinweis))res.warn.push(bz.hinweis);
      const {Q,D2,W2}=mF.frame(e,q),gap=bz.ba-2*s;
      const mG=planeMap(gi,q,eD,tB,[Q[0]+gap*W2[0],Q[1]+gap*W2[1]],D2,W2);maps.set(gi,mG);
      const sh=(P,a)=>[P[0]+a*W2[0],P[1]+a*W2[1]];
      addClip(fi,{Q,W2,max:-s});addClip(gi,{Q,W2,min:bz.ba-s});
      const ends=e.pts.map(mF.f);bendLines.push(ends.map(P=>sh(P,bz.ba/2-s)));
      for(const P of [ends[0],ends.at(-1)])extraKanten.push([sh(P,-s),sh(P,bz.ba-s)]);
      const len=V.len(V.sub(e.pts.at(-1),e.pts[0]));korr+=(inner?1:-1)*t*Math.tan(th/2)*len;
      const probe=V.add(q,V.mul(tB,Math.max(s*2,1)));
      const sg=neueFaltung(fi,gi,{S2:sh(Q,-s),D2,W2,BZ:bz.ba,th,dS:bz.ba/th-rs},false,probe,mG);
      res.bends.push({nr:res.bends.length+1,face:gi,ri:Ri,ang:th*DEG,dir:inner?'nach oben':'nach unten',sigma:sg,seite:W2,len,ba:bz.ba,v:bz.v,bd:bz.bd,K:bz.K,quelle:bz.quelle,tabelle:bz.tabelle||null,angenommen:true,schenkel:[]});
      annahmen++;skin.add(gi);tree.add(ei);queue.push(gi);bfs()}
    pending.forEach(([,,,gi])=>{if(!skin.has(gi))sharp.add(gi)});
    if(annahmen){const fz=v=>(+v.toFixed(2)).toLocaleString('de-DE');res.annahme={ri:Ri,kanten:annahmen};res.warn.push(`Innenradius Ri ${fz(Ri)} mm an ${annahmen} scharfen Kante(n) angenommen, nicht aus der Datei.`)}
    // ---- Virtueller Riss (ZW3D „Rip“): gewählte Kanten zwischen zwei Hautflächen werden aufgetrennt ----
    const rissKanten=new Set();res.riss=[];
    const offen=ei=>{const e=E[ei];if(tree.has(ei)||e.faces.length!==2||!e.faces.every(f=>skin.has(f)))return false;const [a,b]=e.faces.map(f=>maps.get(f));
      return Math.max(...e.pts.map(p=>{const u=a.f(p),v=b.f(p);return Math.hypot(u[0]-v[0],u[1]-v[1])}))>1e-3};
    if(Array.isArray(opts.riss)&&opts.riss.length){
      const cand=E.map((_,i)=>i).filter(offen);const mid=e=>e.mid||V.mul(V.add(e.pts[0],e.pts.at(-1)),0.5);
      for(const id of opts.riss){const e=E[id];if(!e){res.warn.push(`Riss: Kante ${id} gibt es nicht.`);continue}
        let w=offen(id)?id:-1;
        if(w<0){let best=Infinity;for(const c of cand){const k=E[c];if(e.line&&k.line&&Math.abs(V.dot(e.line.d,k.line.d))<1-1e-6)continue;const d=V.len(V.sub(mid(k),mid(e)));if(d<best&&d<=3*t){best=d;w=c}}}
        if(w<0){res.warn.push(`Riss: Kante ${id} ist keine geschlossene Ecke – nicht aufgetrennt.`);continue}
        // Zusammenhängende geschlossene Kanten mitnehmen (z. B. die Gehrungskurve zweier Biegungen an derselben Ecke)
        const st=[w];while(st.length){const c=st.pop();if(rissKanten.has(c))continue;rissKanten.add(c);const ec=E[c];
          for(const k of cand)if(!rissKanten.has(k)&&[E[k].pts[0],E[k].pts.at(-1)].some(p=>[ec.pts[0],ec.pts.at(-1)].some(r=>V.len(V.sub(p,r))<1e-4)))st.push(k)}
        res.riss.push({gewaehlt:id,kante:w})}
      for(const c of rissKanten){const e=E[c];const [A,Bf]=e.faces.map(f=>F[f]);
        if(e.line&&A.plane&&Bf.plane){const q=e.line.p,tA=tanInto(A,e,q),tB=tanInto(Bf,e,q),th=Math.PI-Math.acos(Math.max(-1,Math.min(1,V.dot(tA,tB))));
          korr+=(V.dot(tB,A.plane.n)>0?1:-1)*t*Math.tan(th/2)*V.len(V.sub(e.pts.at(-1),e.pts[0]))}}
      res.rissKanten=[...rissKanten]}
    // ---- Kontur ----
    // Kreiskanten auf ebenen Hautflächen sind in der Abwicklung exakte Kreise/Bögen (Ebenen-Abbildung ist eine Bewegung) → DXF CIRCLE/ARC/Bulge.
    const lines=[],kanten=[],rissLinien=[],TW=2*Math.PI,ccwW=(a,b)=>((b-a)%TW+TW)%TW;
    const clipPts=(fi,pts)=>{let teile=[pts];for(const c of clips.get(fi)||[]){const g=P=>{const d=(P[0]-c.Q[0])*c.W2[0]+(P[1]-c.Q[1])*c.W2[1];return c.max!=null?d-c.max:c.min-d};
      const neu=[];for(const T of teile){let cur=[];for(let i=0;i<T.length;i++){const P=T[i],gp=g(P);
        if(i>0){const A=T[i-1],ga=g(A);if((ga<=1e-9)!==(gp<=1e-9)){const u=ga/(ga-gp);const X=[A[0]+u*(P[0]-A[0]),A[1]+u*(P[1]-A[1])];cur.push(X);if(gp>1e-9){if(cur.length>1)neu.push(cur);cur=[]}}}
        if(gp<=1e-9)cur.push(P)}if(cur.length>1)neu.push(cur)}teile=neu}return teile};
    const kante=(e,fi)=>{const m=maps.get(fi);const pts=e.pts.map(m.f);
      let bogen=null;
      if(e.circle&&m.kind==='p'){const c=m.f(e.circle.c),r=e.circle.r;const rr=Math.hypot(pts[0][0]-c[0],pts[0][1]-c[1]);
        if(Math.abs(rr-r)<1e-6*Math.max(1,r)){if(e.circle.ang>TW-1e-6)bogen={c,r,voll:true};
          else{const w=p=>Math.atan2(p[1]-c[1],p[0]-c[0]);const as=w(pts[0]),ae=w(pts.at(-1)),am=w(m.f(e.mid));const ccw=ccwW(as,am)<ccwW(as,ae);
            bogen={c,r,voll:false,ccw,a0:ccw?as:ae,a1:ccw?ae:as};bogen.sweep=ccwW(bogen.a0,bogen.a1)}}}
      const teile=clips.has(fi)?clipPts(fi,pts):[pts];
      if(teile.length===1&&teile[0]===pts){lines.push(pts);kanten.push({pts,bogen});return [pts]}
      teile.forEach(T=>{lines.push(T);kanten.push({pts:T,bogen:null})});return teile};
    E.forEach((e,ei)=>{if(rissKanten.has(ei)){e.faces.forEach(f=>rissLinien.push(...kante(e,f)));return}
      const inSkin=e.faces.filter(f=>skin.has(f));if(!inSkin.length||inSkin.length===2)return;kante(e,inSkin[0])});
    extraKanten.forEach(pts=>{lines.push(pts);kanten.push({pts,bogen:null})});
    const all=lines.flat();
    if(!all.length){res.fehler.push('Keine Kontur erzeugt.');return res}
    // Zuschnitt exakt: Bögen über ihre Extrempunkte (0°, 90°, 180°, 270°), nicht nur über die Stützpunkte
    const ext=[];kanten.forEach(k=>{ext.push(...k.pts);const b=k.bogen;if(!b)return;
      for(let q=0;q<4;q++){const a=q*Math.PI/2;if(b.voll||ccwW(b.a0,a)<=b.sweep+1e-12)ext.push([b.c[0]+b.r*Math.cos(a),b.c[1]+b.r*Math.sin(a)])}});
    const mn=[Math.min(...ext.map(p=>p[0])),Math.min(...ext.map(p=>p[1]))],mx=[Math.max(...ext.map(p=>p[0])),Math.max(...ext.map(p=>p[1]))];
    res.flat={contour:lines,kanten,bendLines,rissLinien,bendInfo:res.bends.map(b=>({nr:b.nr,dir:b.dir,ang:b.ang,ri:b.ri,seite:b.seite,angenommen:!!b.angenommen})),min:mn,max:mx,size:[mx[0]-mn[0],mx[1]-mn[1]]};
    res.faltung={basis:FB,bends:fbends,kette:Object.fromEntries(kette),fehler:faltFehler};
    // ---- Prüfungen ----
    const free=F.filter(f=>!f.plane&&!f.cyl);if(free.length)res.fehler.push(`Das Teil enthält ${free.length} nicht abwickelbare Fläche(n) (${[...new Set(free.map(f=>f.type))].join(', ')}).`);
    // Zyklen im Flächengraphen: Kanten zwischen zwei Hautflächen, die nicht im Abwicklungsbaum liegen, müssen in 2D
    // aus beiden Flächen auf dieselbe Stelle fallen – sonst ist die Ecke geschlossen (Eckfreischnitt fehlt). Gerissene Kanten zählen nicht.
    let closed=0;E.forEach((e,ei)=>{if(!rissKanten.has(ei)&&offen(ei))closed++});
    if(closed)res.fehler.push(`Geschlossene Ecken (${closed} Kanten): Laschen hängen in 3D zusammen und lassen sich nicht ohne Eckfreischnitt abwickeln. Abhilfe: Kante wählen → „Virtueller Riss“.`);
    if(sharp.size)res.fehler.push(`${sharp.size} scharfkantige Biegung(en) ohne Radius gefunden – nicht abgewickelt. Abhilfe: „Innenradius annehmen“.`);
    // Flächenbilanz: neutrale Fläche der Haut vs. Volumen / t (Risse und angenommene Biegungen: Eckenkorrektur ± t · tan(θ/2) · Länge)
    const vol=Math.abs(props('V',UU.shape).mass);
    const mid=[...skin].reduce((s,i)=>{const f=F[i];if(f.cyl){const pc=partner(i);const rin=pc&&pc.r<f.cyl.r?pc.r:f.cyl.r;return s+f.area*(rin+t/2)/f.cyl.r}return s+f.area},0)+korr;
    res.flaeche={erreicht:mid,soll:vol/t,anteil:mid/(vol/t)};
    if(res.flaeche.anteil<0.97)res.fehler.push(`Nur ${(res.flaeche.anteil*100).toFixed(1).replace('.',',')} % der Blechfläche wurden abgewickelt – Kontur unvollständig.`);
    // Selbstüberschneidung der Kontur (überlappende Laschen)
    const segs=[];lines.forEach(l=>{for(let i=1;i<l.length;i++)segs.push([l[i-1],l[i]])});
    let hit=0;const tol=1e-6*Math.max(...res.flat.size);
    outer:for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){const [a,b]=segs[i],[c,d]=segs[j];
      const sh=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<tol;if(sh(a,c)||sh(a,d)||sh(b,c)||sh(b,d))continue;if(segX(a,b,c,d)){hit++;if(hit>0)break outer}}
    if(hit)res.fehler.push('Die abgewickelte Kontur überschneidet sich selbst (überlappende Laschen, Eckfreischnitt fehlt?).');
    res.flat.incomplete=res.fehler.length>0;
    if(res.flat.incomplete)res.warn.unshift('ACHTUNG: Abwicklung unvollständig oder fehlerhaft – DXF-Export gesperrt.');
    res.skinArea=[...skin].reduce((s,i)=>s+F[i].area,0);
    M._blech={inst,maps,skin:[...skin],faltung:res.faltung};
    return res};
  // Netz der Blechhaut für die Falt-Animation: je Dreiecksecke die 2D-Lage in der Abwicklung (letzte M.sheet-Rechnung)
  // netz: {p,i,f} aus dem Hauptthread (im Browser wurden die Netzpuffer beim Laden an die Oberfläche übertragen)
  M.faltNetz=(netz)=>{const S=M._blech;if(!S)return null;const I=M.inst[S.inst],U=M.uniq[I.u];const p=netz?.p||U.p,ix=netz?.i||U.i,f=netz?.f||U.f;if(!p.length)return null;const sk=new Set(S.skin);
    const p2=[],p3=[],fk=[];for(let t=0;t<f.length;t++){if(!sk.has(f[t]))continue;const m=S.maps.get(f[t]);fk.push(f[t]);
      for(let j=0;j<3;j++){const a=ix[3*t+j]*3;const q=[p[a],p[a+1],p[a+2]];const u=m.f(q);p2.push(u[0],u[1]);p3.push(...q)}}
    return {p2:new Float64Array(p2),p3:new Float32Array(p3),fk:new Int32Array(fk),m:I.m,faltung:S.faltung}};

  // ---- DXF für den Laser ----
  // Kreise = CIRCLE, Konturen = geschlossene LWPOLYLINE (Bögen als Bulge), Biegelinien je Richtung auf eigenem Layer, 1:1 in mm ($INSUNITS = 4).
  // Ursprung = linke untere Ecke des Zuschnitts. opts.beschriftung: Biegenotizen auf Layer BESCHRIFTUNG (Standard: aus).
  M.konturSchleifen=(flat,tol=1e-3)=>{const ks=(flat.kanten||flat.contour.map(pts=>({pts,bogen:null}))).filter(k=>k.pts.length>1||k.bogen?.voll);
    const used=new Array(ks.length).fill(false),out=[];const nah=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<tol;
    for(let i=0;i<ks.length;i++){if(used[i])continue;used[i]=true;const k0=ks[i];
      if(k0.bogen?.voll){out.push({kreis:k0.bogen,segs:[{k:k0,rev:false}],zu:true});continue}
      const segs=[{k:k0,rev:false}];const start=k0.pts[0];let end=k0.pts.at(-1);
      for(let guard=0;guard<ks.length&&!nah(end,start);guard++){let hit=-1,rev=false;
        for(let j=0;j<ks.length;j++){if(used[j]||ks[j].bogen?.voll)continue;if(nah(ks[j].pts[0],end)){hit=j;rev=false;break}if(nah(ks[j].pts.at(-1),end)){hit=j;rev=true;break}}
        if(hit<0)break;used[hit]=true;segs.push({k:ks[hit],rev});end=rev?ks[hit].pts[0]:ks[hit].pts.at(-1)}
      const zu=nah(end,start);
      // Schleife nur aus Bögen eines Kreises (z. B. in zwei Hälften geteilte Bohrung) → ein Kreis
      const b0=segs[0].k.bogen;let kreis=null;
      if(zu&&b0&&segs.every(x=>x.k.bogen&&!x.k.bogen.voll&&Math.abs(x.k.bogen.r-b0.r)<1e-6&&nah(x.k.bogen.c,b0.c))&&Math.abs(segs.reduce((a,x)=>a+x.k.bogen.sweep,0)-2*Math.PI)<1e-6)kreis={c:b0.c,r:b0.r,voll:true};
      out.push({segs,zu,kreis})}
    return out};
  const lwPunkte=(segs,zu)=>{const v=[];
    const gerade=pts=>{const r=[pts[0]];for(let i=1;i<pts.length-1;i++){const a=r.at(-1),b=pts[i],c=pts[i+1];const cr=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      const l=Math.hypot(c[0]-a[0],c[1]-a[1])||1;if(Math.abs(cr)/l>1e-7)r.push(b)}r.push(pts.at(-1));return r};
    for(const {k,rev} of segs){const pts=rev?[...k.pts].reverse():k.pts;
      if(k.bogen&&!k.bogen.voll){const ccw=rev?!k.bogen.ccw:k.bogen.ccw;v.push({p:pts[0],bulge:Math.tan(k.bogen.sweep/4)*(ccw?1:-1)})}
      else{const g=gerade(pts);for(let i=0;i<g.length-1;i++)v.push({p:g[i],bulge:0})}}
    if(!zu){const l=segs.at(-1);v.push({p:l.rev?l.k.pts[0]:l.k.pts.at(-1),bulge:0})}
    return v};
  M.dxf=(flat,opts={})=>{if(typeof opts!=='object'||!opts)opts={};const L=[];const g=(c,v)=>L.push(String(c),String(v));
    let h=0x100;const H=()=>(h++).toString(16).toUpperCase();const f4=v=>(Math.abs(v)<5e-5?0:v).toFixed(4);
    const X=p=>f4(p[0]-flat.min[0]),Y=p=>f4(p[1]-flat.min[1]);
    const layer=[['KONTUR',7,'CONTINUOUS'],['BIEGELINIEN_AUF',1,'DASHED'],['BIEGELINIEN_AB',5,'DASHED']];if(opts.beschriftung)layer.push(['BESCHRIFTUNG',3,'CONTINUOUS']);const riss=flat.rissLinien||[];if(riss.length)layer.push(['RISS',6,'DASHED',true]);
    g(0,'SECTION');g(2,'HEADER');g(9,'$ACADVER');g(1,'AC1015');g(9,'$INSUNITS');g(70,4);g(9,'$MEASUREMENT');g(70,1);g(9,'$HANDSEED');g(5,'FFFFF');g(0,'ENDSEC');
    g(0,'SECTION');g(2,'TABLES');
    g(0,'TABLE');g(2,'LTYPE');g(5,H());g(100,'AcDbSymbolTable');g(70,2);
    g(0,'LTYPE');g(5,H());g(100,'AcDbSymbolTableRecord');g(100,'AcDbLinetypeTableRecord');g(2,'CONTINUOUS');g(70,0);g(3,'Durchgezogen');g(72,65);g(73,0);g(40,0);
    g(0,'LTYPE');g(5,H());g(100,'AcDbSymbolTableRecord');g(100,'AcDbLinetypeTableRecord');g(2,'DASHED');g(70,0);g(3,'Gestrichelt __ __ __');g(72,65);g(73,2);g(40,9);g(49,6);g(74,0);g(49,-3);g(74,0);
    g(0,'ENDTAB');
    g(0,'TABLE');g(2,'LAYER');g(5,H());g(100,'AcDbSymbolTable');g(70,layer.length);
    for(const [n,c,lt,np] of layer){g(0,'LAYER');g(5,H());g(100,'AcDbSymbolTableRecord');g(100,'AcDbLayerTableRecord');g(2,n);g(70,0);g(62,c);g(6,lt);if(np)g(290,0)}
    g(0,'ENDTAB');g(0,'ENDSEC');
    g(0,'SECTION');g(2,'ENTITIES');
    const kopf=(typ,lay,sub)=>{g(0,typ);g(5,H());g(100,'AcDbEntity');g(8,lay);g(100,sub)};
    const kreis=(b,lay)=>{kopf('CIRCLE',lay,'AcDbCircle');g(10,X(b.c));g(20,Y(b.c));g(30,0);g(40,f4(b.r))};
    const linie=(a,b,lay)=>{kopf('LINE',lay,'AcDbLine');g(10,X(a));g(20,Y(a));g(30,0);g(11,X(b));g(21,Y(b));g(31,0)};
    const stat={kreise:0,konturen:0,offen:0};
    for(const s of M.konturSchleifen(flat)){
      if(s.kreis){kreis(s.kreis,'KONTUR');stat.kreise++;continue}
      const v=lwPunkte(s.segs,s.zu);if(v.length<2)continue;
      kopf('LWPOLYLINE','KONTUR','AcDbPolyline');g(90,v.length);g(70,s.zu?1:0);g(43,0);
      for(const q of v){g(10,X(q.p));g(20,Y(q.p));if(Math.abs(q.bulge)>1e-12)g(42,q.bulge.toFixed(10))}
      stat.konturen++;if(!s.zu)stat.offen++}
    // Virtueller Riss: aufgetrennte Kanten zusätzlich auf Layer RISS (nicht plotten, 290 = 0); geschnitten wird nur KONTUR
    for(const pts of riss){if(pts.length===2){linie(pts[0],pts[1],'RISS');continue}kopf('LWPOLYLINE','RISS','AcDbPolyline');g(90,pts.length);g(70,0);g(43,0);for(const q of pts){g(10,X(q));g(20,Y(q))}}
    stat.riss=riss.length;
    const bi=flat.bendInfo||[];
    flat.bendLines.forEach((b,i)=>{const auf=(bi[i]?.dir||'nach oben')==='nach oben';linie(b[0],b[1],auf?'BIEGELINIEN_AUF':'BIEGELINIEN_AB')});
    if(opts.beschriftung){const de=(v,n)=>(+v.toFixed(n)).toLocaleString('de-DE',{maximumFractionDigits:n});
      flat.bendLines.forEach((b,i)=>{const q=bi[i];if(!q)return;const m=[(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2];let w=Math.atan2(b[1][1]-b[0][1],b[1][0]-b[0][0])*DEG;if(w>90)w-=180;if(w<=-90)w+=180;
        // Text mittig 2 mm neben der Biegelinie (72 = 1: zentriert am Ausrichtpunkt 11/21)
        const wr=w/DEG,nx=-Math.sin(wr)*2,ny=Math.cos(wr)*2,t=[m[0]+nx,m[1]+ny];
        kopf('TEXT','BESCHRIFTUNG','AcDbText');g(10,X(t));g(20,Y(t));g(30,0);g(40,'3.5000');g(1,`B${q.nr} ${q.dir==='nach oben'?'AUF':'AB'} ${de(q.ang,1)}%%d Ri ${de(q.ri,2)}`);g(50,w.toFixed(4));g(72,1);g(11,X(t));g(21,Y(t));g(31,0);g(100,'AcDbText')})}
    g(0,'ENDSEC');g(0,'EOF');M.letzteDxf=stat;return L.join('\n')+'\n'};
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
