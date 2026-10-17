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
  M.load=(bytes,name='modell.step')=>{
    const t0=Date.now();
    const text=new TextDecoder('latin1').decode(bytes.subarray(0,Math.min(bytes.length,4e6)));
    const unit=stepUnit(text);
    const pn=/PRODUCT\(\s*'([^']*)'/.exec(text);
    oc.FS.writeFile('/in.step',bytes);
    const r=new oc.STEPControl_Reader_1();
    const st=r.ReadFile('/in.step');
    if(st!==oc.IFSelect_ReturnStatus.IFSelect_RetDone)throw new Error('STEP-Datei konnte nicht gelesen werden');
    tryCall(()=>r.TransferRoots(),()=>r.TransferRoots(new oc.Message_ProgressRange_1()));
    const shape=r.OneShape();oc.FS.unlink('/in.step');
    // Feinheit relativ zur Größe
    const bb=M.bbox(shape);const diag=V.len(V.sub(bb.max,bb.min))||1;
    tryCall(()=>new oc.BRepMesh_IncrementalMesh_2(shape,diag/1500,false,0.35,false));
    const faces=new Index(),edges=new Index(),verts=new Index();const solids=[];
    explore(shape,TA.TopAbs_SOLID,s=>solids.push(oc.TopoDS.Solid_1(s)));
    if(!solids.length)solids.push(shape);
    const meshes=[];
    solids.forEach((sol,si)=>{
      const pos=[],idx=[],fid=[];
      explore(sol,TA.TopAbs_FACE,fs=>{
        const f=oc.TopoDS.Face_1(fs);
        const fi=faces.find(f,s=>M.faceInfo(oc.TopoDS.Face_1(s),si));
        const loc=new oc.TopLoc_Location_1();const h=oc.BRep_Tool.Triangulation(f,loc);
        if(h.IsNull())return;const tri=h.get();const tr=loc.Transformation();
        const base=pos.length/3;const n=tri.NbNodes();
        const nodes=tryCall(()=>{const a=tri.Nodes();return i=>a.Value(i)},()=>i=>tri.Node(i));
        for(let i=1;i<=n;i++){const p=nodes(i).Transformed(tr);pos.push(p.X(),p.Y(),p.Z())}
        const tris=tryCall(()=>{const a=tri.Triangles();return i=>a.Value(i)},()=>i=>tri.Triangle(i));
        const rev=f.Orientation_1()===oc.TopAbs_Orientation.TopAbs_REVERSED;
        for(let i=1;i<=tri.NbTriangles();i++){const t=tris(i);let a=t.Value(1),b=t.Value(2),c=t.Value(3);if(rev)[b,c]=[c,b];idx.push(base+a-1,base+b-1,base+c-1);fid.push(fi)}
        explore(f,TA.TopAbs_EDGE,es=>{const ei=edges.find(es,s=>M.edgeInfo(oc.TopoDS.Edge_1(s)));const e=edges.list[ei];if(!e.faces.includes(fi))e.faces.push(fi)});
      });
      meshes.push({name:solids.length>1?`Körper ${si+1}`:(pn&&pn[1]&&!/^Open CASCADE/i.test(pn[1])?pn[1]:name.replace(/\.(step|stp)$/i,'')),p:new Float32Array(pos),i:new Uint32Array(idx),f:new Uint32Array(fid)});
    });
    explore(shape,TA.TopAbs_VERTEX,vs=>verts.find(vs,s=>({shape:oc.TopoDS.Vertex_1(s),p:P(oc.BRep_Tool.Pnt(oc.TopoDS.Vertex_1(s)))})));
    M.shape=shape;M.faces=faces.list;M.edges=edges.list;M.verts=verts.list;M.solids=solids;M.unit=unit;
    return {name,unit,meshes,
      edges:M.edges.map(e=>({type:e.type,pts:e.pts,c:e.circle?.c})),
      verts:M.verts.map(v=>v.p),
      faces:M.faces.map(f=>({type:f.type})),
      ms:Date.now()-t0};
  };
  M.bbox=s=>{const b=new oc.Bnd_Box_1();tryCall(()=>oc.BRepBndLib.Add(s,b,true),()=>oc.BRepBndLib.Add(s,b));return {min:P(b.CornerMin()),max:P(b.CornerMax())}};
  M.faceInfo=(f,solid)=>{
    const a=new oc.BRepAdaptor_Surface_2(f,true);const t=a.GetType();const rev=f.Orientation_1()===oc.TopAbs_Orientation.TopAbs_REVERSED;
    const o={shape:f,solid,type:'sonstige',area:props('S',f).mass};
    const u0=a.FirstUParameter(),u1=a.LastUParameter(),v0=a.FirstVParameter(),v1=a.LastVParameter();
    o.mid=P(a.Value((u0+u1)/2,(v0+v1)/2));
    if(t===ST.GeomAbs_Plane){const pl=a.Plane();let n=D(pl.Axis().Direction());if(rev)n=V.mul(n,-1);o.type='eben';o.plane={o:P(pl.Location()),n}}
    else if(t===ST.GeomAbs_Cylinder){const c=a.Cylinder();o.type='zylindrisch';o.cyl={c:P(c.Location()),d:D(c.Axis().Direction()),r:c.Radius(),ang:u1-u0,v0,v1,rev}}
    else if(t===ST.GeomAbs_Cone)o.type='kegelig';else if(t===ST.GeomAbs_Sphere)o.type='kugelig';else if(t===ST.GeomAbs_Torus)o.type='torisch';else o.type='Freiform';
    return o};
  M.edgeInfo=e=>{
    const a=new oc.BRepAdaptor_Curve_2(e);const t=a.GetType();const u0=a.FirstParameter(),u1=a.LastParameter();
    const o={shape:e,faces:[],type:'Kurve',len:props('L',e).mass};
    let n=24;if(t===CT.GeomAbs_Line){o.type='Gerade';n=1;o.line={p:P(a.Value(u0)),d:V.norm(V.sub(P(a.Value(u1)),P(a.Value(u0))))}}
    else if(t===CT.GeomAbs_Circle){const c=a.Circle();o.type='Kreis';o.circle={c:P(c.Location()),n:D(c.Axis().Direction()),r:c.Radius(),ang:Math.abs(u1-u0)};n=Math.max(8,Math.ceil(o.circle.ang/(Math.PI/24)))}
    o.pts=[];for(let i=0;i<=n;i++)o.pts.push(P(a.Value(u0+(u1-u0)*i/n)));
    return o};

  // ---------- Messen ----------
  const sel2shape=s=>s.k==='face'?M.faces[s.id].shape:s.k==='edge'?M.edges[s.id].shape:s.k==='vertex'?M.verts[s.id].shape:mkVertex(selPoint(s));
  const selPoint=s=>s.k==='vertex'?M.verts[s.id].p:(s.k==='center'?M.edges[s.id].circle.c:s.p);
  const dirOf=s=>{if(s.k==='face'){const f=M.faces[s.id];if(f.plane)return{kind:'n',d:f.plane.n};if(f.cyl)return{kind:'a',d:f.cyl.d}}
    if(s.k==='edge'){const e=M.edges[s.id];if(e.line)return{kind:'a',d:e.line.d};if(e.circle)return{kind:'n',d:e.circle.n}}return null};
  M.minDist=(a,b)=>{const d=new oc.BRepExtrema_DistShapeShape_1();d.LoadS1(a);d.LoadS2(b);tryCall(()=>d.Perform(),()=>d.Perform(new oc.Message_ProgressRange_1()));
    if(!d.IsDone())throw new Error('Abstand konnte nicht berechnet werden');return {d:d.Value(),p1:P(d.PointOnShape1(1)),p2:P(d.PointOnShape2(1))}};
  M.describe=s=>{const R=[];
    if(s.k==='face'){const f=M.faces[s.id];R.push(['Fläche',f.type,'t'],['Flächeninhalt',f.area,'A']);
      if(f.cyl){R.push(['Radius',f.cyl.r,'L'],['Durchmesser',2*f.cyl.r,'L'],['Öffnungswinkel',f.cyl.ang*DEG,'W'])}
      if(f.plane)R.push(['Normale',f.plane.n.map(x=>x.toFixed(4)).join(' / '),'t'])}
    if(s.k==='edge'){const e=M.edges[s.id];R.push(['Kante',e.type,'t'],['Kantenlänge',e.len,'L']);
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
      if(a.k==='face'&&b.k==='face'&&M.faces[a.id].plane&&M.faces[b.id].plane&&c>1-1e-9){const pa=M.faces[a.id].plane,pb=M.faces[b.id].plane;rows.push(['Paralleler Abstand',Math.abs(V.dot(V.sub(pb.o,pa.o),pa.n)),'L'])}
      if(da.kind==='a'&&db.kind==='a'&&c>1-1e-9&&a.k==='edge'&&b.k==='edge'){const pa=M.edges[a.id].line.p,pb=M.edges[b.id].line.p,w=V.sub(pb,pa);rows.push(['Paralleler Abstand',V.len(V.sub(w,V.mul(da.d,V.dot(w,da.d)))),'L'])}}
    const ax=s=>{if(s.k==='face'&&M.faces[s.id].cyl)return M.faces[s.id].cyl;if(s.k==='edge'&&M.edges[s.id].circle){const c=M.edges[s.id].circle;return{c:c.c,d:c.n}}return null};
    const ca=ax(a),cb=ax(b);
    if(ca&&cb&&Math.abs(V.dot(ca.d,cb.d))>1-1e-9){const w=V.sub(cb.c,ca.c);rows.push(['Achsabstand',V.len(V.sub(w,V.mul(ca.d,V.dot(w,ca.d)))),'L'])}
    const isP=s=>['vertex','center','point'].includes(s.k);
    if(isP(a)&&isP(b)){const pa=selPoint(a),pb=selPoint(b);rows.splice(0,4,['Abstand',V.len(V.sub(pb,pa)),'L'],['ΔX',Math.abs(pb[0]-pa[0]),'L'],['ΔY',Math.abs(pb[1]-pa[1]),'L'],['ΔZ',Math.abs(pb[2]-pa[2]),'L']);gfx[0]=[pa,pb]}
    return {rows,gfx}};
  M.model=()=>{const vp=props('V',M.shape),sp=props('S',M.shape),bb=M.bbox(M.shape);
    // Bnd_Box enthält Toleranz-Zuschlag; enger über Vertices/Kanten-Punkte
    const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
    M.edges.forEach(e=>e.pts.forEach(p=>{for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k])}}));
    const ok=isFinite(mn[0]);return {volume:Math.abs(vp.mass),area:sp.mass,centroid:vp.c,bbox:ok?{min:mn,max:mx}:bb,solids:M.solids.length,faces:M.faces.length,edges:M.edges.length}};

  // ---------- Blech ----------
  const coaxial=(A,B)=>{if(Math.abs(V.dot(A.d,B.d))<1-1e-6)return false;const w=V.sub(B.c,A.c);return V.len(V.sub(w,V.mul(A.d,V.dot(w,A.d))))<1e-3};
  M.sheet=(K=0.5)=>{
    const cyl=M.faces.map((f,i)=>[f,i]).filter(([f])=>f.cyl&&f.cyl.ang<Math.PI*1.999);
    const cand=new Map();const add=(t,w)=>{const k=t.toFixed(3);cand.set(k,(cand.get(k)||0)+w)};
    for(let i=0;i<cyl.length;i++)for(let j=i+1;j<cyl.length;j++){const A=cyl[i][0].cyl,B=cyl[j][0].cyl;if(coaxial(A,B)&&Math.abs(A.r-B.r)>1e-4)add(Math.abs(A.r-B.r),10*(cyl[i][0].area+cyl[j][0].area))}
    const pl=M.faces.map((f,i)=>[f,i]).filter(([f])=>f.plane);
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
    if(M.faces.some((f,i)=>!skin.has(i)&&f.type!=='eben'&&f.type!=='zylindrisch'))res.warn.push('Das Teil enthält Freiform-/Kegelflächen; diese werden nicht abgewickelt.');
    if(M.solids.length>1)res.warn.push('Mehrere Körper: Blechauswertung nur für zusammenhängende Flächen ab der größten ebenen Fläche.');
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
