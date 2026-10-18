import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
const $=id=>document.getElementById(id), view=$('view');
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true})}catch(e){$('status').textContent='Fehler: 3D-Grafik (WebGL) wird auf diesem Rechner nicht unterstützt.';throw e}
renderer.setPixelRatio(devicePixelRatio);renderer.setClearColor(0xf5f5f7);view.appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,0.1,1e6);
scene.add(new THREE.HemisphereLight(0xffffff,0xb0b4bc,1.5));const dl=new THREE.DirectionalLight(0xffffff,1.3);camera.add(dl);dl.position.set(1,2,3);scene.add(camera);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.screenSpacePanning=true;
const plane=new THREE.Plane(new THREE.Vector3(1,0,0),0);
let model=null,box=new THREE.Box3(),needs=true,data=null,bodies=[],edgeObjs=[],baseMat=null,marks=new THREE.Group(),hoverObj=new THREE.Group();
function resize(){const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();needs=true}
addEventListener('resize',resize);resize();controls.addEventListener('change',()=>needs=true);
(function loop(){requestAnimationFrame(loop);controls.update();if(needs){renderer.render(scene,camera);needs=false}})();

// ---------- Worker ----------
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});const base=new URL('./',location.href).href;
let seq=0;const pend=new Map();
worker.onmessage=e=>{if(e.data.progress){$('busy').textContent=e.data.progress;$('status').textContent=e.data.progress;return}const p=pend.get(e.data.id);if(!p)return;pend.delete(e.data.id);e.data.ok?p.res(e.data.r):p.rej(new Error(e.data.error))};
worker.onerror=()=>{for(const p of pend.values())p.rej(new Error('Fehler: Der Geometrie-Kern konnte nicht gestartet werden.'));pend.clear()};
const call=(cmd,args={},tr=[])=>new Promise((res,rej)=>{const id=++seq;pend.set(id,{res,rej});worker.postMessage({id,cmd,args:{...args,base}},tr)});
call('init').catch(()=>{});

// ---------- Einheiten / Formatierung ----------
// Der Kern rechnet intern immer in mm (OCCT rechnet cm/m/Zoll beim Import um).
// Angezeigt wird daher immer in mm; U ist nur die Einheit der Datei (Info in der Statusleiste).
let U={sym:'mm',mm:1,name:'Millimeter'};
let PREC=(()=>{const v=parseInt(localStorage.getItem('genauigkeit'));return v>=0&&v<=4?v:3})();
const nf=(v,d=3)=>v.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
function fmt(v,k){if(k==='L')return nf(v,PREC)+' mm';if(k==='A')return nf(v,PREC)+' mm²';if(k==='V')return nf(v,PREC)+' mm³';
  if(k==='W')return nf(v,Math.max(PREC,1))+' °';if(k==='P')return v.map(x=>nf(x,PREC)).join(' / ')+' mm';if(k==='M')return v>=1000?nf(v/1000)+' kg':nf(v,1)+' g';return String(v)}
const kv=(el,rows)=>{el.innerHTML=rows.map(([a,b,k,x])=>`<div${x?' class="big"':''}>${a}</div><div${x?' class="big"':''}>${k?fmt(b,k):b}</div>`).join('')};

// ---------- Ansicht ----------
function fit(dir){if(!model)return;const s=box.getSize(new THREE.Vector3()).length(),c=box.getCenter(new THREE.Vector3());
  const d=(dir||new THREE.Vector3(.8,.6,1)).clone().normalize();camera.near=s/2000;camera.far=s*100;
  camera.up.set(0,1,0);if(Math.abs(d.y)>.99)camera.up.set(0,0,-1);
  camera.position.copy(c).add(d.multiplyScalar(s*1.7));camera.updateProjectionMatrix();controls.target.copy(c);controls.update();needs=true}
$('fit').onclick=()=>fit();
const views={iso:new THREE.Vector3(.8,.6,1),vorne:new THREE.Vector3(0,0,1),oben:new THREE.Vector3(0,1,0),rechts:new THREE.Vector3(1,0,0)};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>fit(views[b.dataset.view]));
$('showEdges').onchange=()=>{edgeObjs.forEach(e=>e.visible=$('showEdges').checked);needs=true};

// ---------- Laden ----------
async function load(buf,name){
  const t0=performance.now();$('status').textContent='Lade '+name+' …';$('drop').style.display='none';$('busy').style.display='block';$('busy').textContent='Kern wird gestartet …';
  const size=buf.byteLength;
  try{data=await call('load',{buf,name},[buf])}finally{$('busy').style.display='none'}
  U=data.unit;
  if(model){scene.remove(model);model.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.()})}
  model=new THREE.Group();model.rotation.x=-Math.PI/2;bodies=[];
  $('status').textContent='Szene wird aufgebaut …';
  transpMat=null;baseMat=new THREE.MeshStandardMaterial({color:0xb9bec7,metalness:.15,roughness:.5,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  const edgeMat=new THREE.LineBasicMaterial({color:0x2a2d33});
  // Ein Netz pro Einzelteil (Unikat), Instanzen teilen sich die Geometrie
  const geos=data.uniq.map(u=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(u.p,3));g.setIndex(new THREE.BufferAttribute(u.i,1));
    const g2=g.toNonIndexed();g.dispose();g2.computeVertexNormals();g2.userData.face=u.f;
    const seg=[],segE=[];u.edges.forEach((e,i)=>{for(let k=1;k<e.pts.length;k++){seg.push(...e.pts[k-1],...e.pts[k]);segE.push(i)}});
    const eg=new THREE.BufferGeometry();eg.setAttribute('position',new THREE.Float32BufferAttribute(seg,3));eg.userData.edge=segE;return {g:g2,eg}});
  edgeObjs=[];
  data.inst.forEach((I,i)=>{const mesh=new THREE.Mesh(geos[I.u].g,baseMat);const m=I.m;mesh.matrixAutoUpdate=false;
    mesh.matrix.set(m[0],m[1],m[2],m[3],m[4],m[5],m[6],m[7],m[8],m[9],m[10],m[11],0,0,0,1);mesh.name=I.name;mesh.userData.inst=i;mesh.userData.u=I.u;
    const el=new THREE.LineSegments(geos[I.u].eg,edgeMat);el.userData.inst=i;el.visible=$('showEdges').checked;mesh.add(el);edgeObjs.push(el);
    model.add(mesh);bodies.push(mesh)});
  model.add(marks);model.add(hoverObj);scene.add(model);model.updateMatrixWorld(true);box.setFromObject(model);
  vIdx=new Map();
  buildTree();clearSel();hov=null;hoverObj.clear();$('snaptip').hidden=true;dims=[];dimNo=0;lastRes=null;renderDims();sheetSolid=null;fit();setCut();showModel();sheetCache=null;$('sheetinfo').innerHTML='';$('bends').innerHTML='';$('flatprev').innerHTML='';$('dxf').disabled=true;$('sheetwarn').textContent='';
  if(!$('tab-blech').hidden)calcSheet();
  const ms=Math.round(performance.now()-t0);const tris=data.inst.reduce((s,I)=>s+data.uniq[I.u].i.length/3,0);
  const info={name,bytes:size,bodies:data.inst.length,unique:data.uniq.length,faces:data.model.faces,edges:data.model.edges,triangles:tris,totalMs:ms,unit:U.sym,times:data.times,stats:data.stats};window.__lastLoad=info;
  $('status').textContent=`${name} · ${(size/1024).toFixed(0)} KB · ${info.bodies} Körper · ${info.faces} Flächen · Datei: ${U.sym} → Anzeige: mm · ${ms} ms`;return info}
const key=p=>p.map(x=>x.toFixed(5)).join(',');let vIdx=new Map();
const vIndexOf=u=>{if(!vIdx.has(u)){const m=new Map();data.uniq[u].verts.forEach((p,i)=>m.set(key(p),i));vIdx.set(u,m)}return vIdx.get(u)};
const toModel=(i,p)=>V3(p).applyMatrix4(bodies[i].matrix).toArray();
// ---------- Baugruppenbaum ----------
let transpMat=null,treeRoot=null,nodes=[],selNode=null,sheetSolid=null;
function buildTree(){treeRoot=data.tree;nodes=[];let id=0;
  const prep=(n,parent,depth)=>{n.id=id++;n.parent=parent;n.depth=depth;n.checked=true;n.open=depth<2;n.transp=false;nodes.push(n);n.children.forEach(c=>prep(c,n,depth+1));
    n.all=[...n.bodies,...n.children.flatMap(c=>c.all)];return n};
  prep(treeRoot,null,0);renderTree()}
const isAsm=n=>n.children.length>0;
const ICON={eye:'<svg viewBox="0 0 16 16"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  iso:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  zoom:'<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor"/><path d="M10.5 10.5 14 14" stroke="currentColor"/></svg>',
  info:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor"/><path d="M8 7v4M8 5v.5" stroke="currentColor"/></svg>',
  asm:'<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="6" height="6" fill="#33AFE2"/><rect x="8.5" y="8.5" width="6" height="6" fill="#33AFE2"/><rect x="8.5" y="1.5" width="6" height="6" fill="none" stroke="#33AFE2"/></svg>',
  part:'<svg viewBox="0 0 16 16"><path d="M8 1.5 14 5v6l-6 3.5L2 11V5z" fill="#c9ced6" stroke="#6e6e73"/></svg>'};
function renderTree(){const q=$('treeSearch').value.trim().toLowerCase();const tree=$('tree');tree.innerHTML='';
  const match=n=>!q||n.name.toLowerCase().includes(q)||n.children.some(match);
  const ul=document.createElement('ul');
  const add=(n,ul)=>{if(!match(n))return;const li=document.createElement('li');const row=document.createElement('div');row.className='trow'+(selNode===n?' sel':'')+(q&&n.name.toLowerCase().includes(q)?' hit':'');row.dataset.id=n.id;
    row.innerHTML=`<span class="tw">${isAsm(n)?(n.open||q?'▾':'▸'):''}</span><input type="checkbox" title="Sichtbarkeit" ${n.checked?'checked':''}><span class="ic">${isAsm(n)?ICON.asm:ICON.part}</span><span class="nm" title="${esc(n.name)}">${esc(n.name)}</span><span class="acts"><button data-a="toggle" title="${n.checked?'Ausblenden':'Einblenden'}">${ICON.eye}</button><button data-a="isolate" title="Nur dieses anzeigen">${ICON.iso}</button><button data-a="zoom" title="Heranzoomen">${ICON.zoom}</button><button data-a="props" title="Eigenschaften">${ICON.info}</button></span>`;
    row.querySelector('.tw').onclick=e=>{e.stopPropagation();n.open=!n.open;renderTree()};
    row.querySelector('input').onclick=e=>e.stopPropagation();row.querySelector('input').onchange=e=>{n.checked=e.target.checked;applyVis();renderTree()};
    row.querySelectorAll('.acts button').forEach(b=>b.onclick=e=>{e.stopPropagation();act(b.dataset.a,n)});
    row.onclick=()=>selectNode(n,true);row.oncontextmenu=e=>{e.preventDefault();selectNode(n,true);ctxMenu(e.clientX,e.clientY,n)};
    li.append(row);ul.append(li);
    if(isAsm(n)&&(n.open||q)){const sub=document.createElement('ul');n.children.forEach(c=>add(c,sub));li.append(sub)}};
  add(treeRoot,ul);tree.append(ul)}
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
$('treeSearch').oninput=()=>renderTree();
function visible(n){for(let x=n;x;x=x.parent)if(!x.checked)return false;return true}
function applyVis(){const vis=new Array(bodies.length).fill(false);
  const walk=n=>{if(visible(n))n.bodies.forEach(b=>vis[b]=true);n.children.forEach(walk)};walk(treeRoot);
  bodies.forEach((b,i)=>b.visible=vis[i]);hoverObj.clear();needs=true}
const nodeOfBody=i=>{let best=null;nodes.forEach(n=>{if(n.bodies.includes(i))best=n});return best};
function selectNode(n,from3d){selNode=n;sels=[];marks.clear();$('selinfo').textContent='';$('mresult').innerHTML='';
  if(n){marks.add(bodyHi(n.all,0x1f8fd0));for(let x=n.parent;x;x=x.parent)x.open=true}
  renderTree();const row=document.querySelector(`.trow[data-id="${n?.id}"]`);row?.scrollIntoView({block:'nearest'});needs=true}
function bodyHi(ids,color){const g=new THREE.Group();const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.45,depthTest:true,side:THREE.DoubleSide,clippingPlanes:renderer.localClippingEnabled?[plane]:[]});ids.forEach(i=>{const b=bodies[i];if(!b.visible)return;const m=new THREE.Mesh(b.geometry,mat);m.matrixAutoUpdate=false;m.matrix.copy(b.matrix);m.renderOrder=5;g.add(m)});return g}
function boxOf(ids){const b=new THREE.Box3();ids.forEach(i=>{if(bodies[i].visible)b.expandByObject(bodies[i])});return b}
async function act(a,n){
  if(a==='toggle'){n.checked=!n.checked;applyVis();renderTree()}
  if(a==='isolate'){nodes.forEach(x=>x.checked=false);for(let x=n;x;x=x.parent)x.checked=true;const on=x=>{x.checked=true;x.children.forEach(on)};on(n);applyVis();renderTree();zoomTo(n)}
  if(a==='showall'){nodes.forEach(x=>x.checked=true);applyVis();renderTree()}
  if(a==='transp'){n.transp=!n.transp;if(!transpMat){transpMat=baseMat.clone();transpMat.transparent=true;transpMat.opacity=.3;transpMat.depthWrite=false}n.all.forEach(i=>{bodies[i].material=n.transp?transpMat:baseMat});needs=true}
  if(a==='zoom')zoomTo(n);
  if(a==='measure'){tabTo('messen');if(n.all.length===1){clearSel();await select({k:'solid',inst:n.all[0]})}else{$('selinfo').textContent='Messen: bitte ein einzelnes Teil wählen.'}}
  if(a==='props')showProps(n);
  if(a==='sheet'){if(n.all.length!==1)return;sheetSolid=n.all[0];tabTo('blech');await calcSheet()}}
function zoomTo(n){const b=boxOf(n.all);if(b.isEmpty())return;const s=b.getSize(new THREE.Vector3()).length(),c=b.getCenter(new THREE.Vector3());
  const d=camera.position.clone().sub(controls.target).normalize();camera.position.copy(c).add(d.multiplyScalar(s*1.6));controls.target.copy(c);controls.update();needs=true}
function ctxMenu(x,y,n){closeCtx();const m=document.createElement('div');m.id='ctx';
  const one=n.all.length===1;
  const items=[['toggle',n.checked?'Ausblenden':'Einblenden'],['isolate','Nur dieses anzeigen'],['showall','Alle einblenden'],['-'],['transp',n.transp?'Undurchsichtig':'Transparent'],['zoom','Heranzoomen'],['-'],['measure','Messen',!one],['props','Eigenschaften'],['sheet','Blech-Abwicklung',!one]];
  m.innerHTML=items.map(([a,t,dis])=>a==='-'?'<hr>':`<button data-a="${a}" ${dis?'disabled title="Nur bei genau einem Körper"':''}>${t}</button>`).join('');
  m.style.left=x+'px';m.style.top=y+'px';document.body.append(m);
  const r=m.getBoundingClientRect();if(r.bottom>innerHeight)m.style.top=(y-r.height)+'px';
  m.querySelectorAll('button').forEach(b=>b.onclick=()=>{closeCtx();act(b.dataset.a,n)})}
const closeCtx=()=>document.getElementById('ctx')?.remove();addEventListener('pointerdown',e=>{if(!e.target.closest('#ctx'))closeCtx()});addEventListener('keydown',e=>{if(e.key==='Escape'){closeCtx();$('props').hidden=true}});
async function showProps(n){const q=await call('props',{ids:n.all});const d=parseFloat($('dens').value)||0;const s=V3(q.bbox.max).sub(V3(q.bbox.min));
  $('propsTitle').textContent='Eigenschaften: '+n.name;
  kv($('propsBody'),[['Typ',isAsm(n)?'Baugruppe':'Teil'],['Körper',q.bodies],['Volumen',q.volume,'V'],['Oberfläche',q.area,'A'],['Dichte',nf(d,2)+' g/cm³'],['Masse',q.volume/1000*d,'M'],['Bounding-Box X',s.x,'L'],['Bounding-Box Y',s.y,'L'],['Bounding-Box Z',s.z,'L']]);
  $('props').hidden=false;window.__lastProps=q;return q}
$('propsClose').onclick=()=>$('props').hidden=true;
const tabTo=n=>document.querySelector(`.tab[data-tab="${n}"]`).click();
function showModel(){const m=data.model,s=V3(m.bbox.max).sub(V3(m.bbox.min));
  kv($('modelinfo'),[['Einheit der Datei',U.name],['Anzeige','Millimeter'],['Körper',m.solids],['Flächen',m.faces],['Kanten',m.edges],['Bounding-Box X',s.x,'L'],['Bounding-Box Y',s.y,'L'],['Bounding-Box Z',s.z,'L'],[m.approx?'Volumen (≈, Netz)':'Volumen',m.volume,'V'],[m.approx?'Oberfläche (≈, Netz)':'Oberfläche',m.area,'A'],['Schwerpunkt',m.centroid,'P'],...(m.unique&&m.unique!==m.solids?[['Einzelteile (Unikate)',m.unique]]:[])]);showMass()}
const V3=a=>new THREE.Vector3(...a);
function showMass(){if(!data)return;const d=parseFloat($('dens').value)||0;kv($('massinfo'),[['Volumen',data.model.volume,'V'],['Dichte',nf(d,2)+' g/cm³'],['Masse',data.model.volume/1000*d,'M']])}
$('mat').onchange=()=>{if($('mat').value!=='custom')$('dens').value=$('mat').value;showMass()};$('dens').oninput=()=>{$('mat').value='custom';showMass()};
$('file').onchange=async e=>{const f=e.target.files[0];if(f)load(await f.arrayBuffer(),f.name).catch(err=>$('status').textContent=err.message)};
view.ondragover=e=>e.preventDefault();view.ondrop=async e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)load(await f.arrayBuffer(),f.name).catch(err=>$('status').textContent=err.message)};

// ---------- Schnitt ----------
function setCut(){const ax=$('axis').value;$('cut').disabled=!ax;renderer.localClippingEnabled=!!ax;
  if(model)model.traverse(o=>{if(o.material&&o!==hoverObj)o.material.clippingPlanes=ax?[plane]:[]});
  if(ax&&model){const k=ax==='X'?'x':ax==='Y'?'z':'y';const sg=ax==='Y'?-1:1;const t=$('cut').value/1000;
    // Modellachsen (Z oben) -> Weltachsen
    let v=box.min[k]+(box.max[k]-box.min[k])*t;plane.normal.set(k==='x'?-1:0,k==='y'?-1:0,k==='z'?-1:0);plane.constant=v;if(sg<0){plane.normal.negate();plane.constant=-v}}
  needs=true}
$('axis').onchange=setCut;$('cut').oninput=setCut;window.__setCut=(a,v)=>{$('axis').value=a;$('cut').value=v;setCut()};

// ---------- Fangen / Auswahl ----------
const ray=new THREE.Raycaster();let sels=[],hov=null;
function pickAt(cx,cy){if(!model)return null;const r=renderer.domElement.getBoundingClientRect();const ndc=new THREE.Vector2(((cx-r.left)/r.width)*2-1,-((cy-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc,camera);
  const clipOk=p=>!renderer.localClippingEnabled||plane.distanceToPoint(p)>=0;
  const fh=ray.intersectObjects(bodies.filter(b=>b.visible),false).filter(h=>clipOk(h.point))[0];
  const dist=fh?fh.distance:camera.position.distanceTo(controls.target);
  const wpp=2*dist*Math.tan(camera.fov*Math.PI/360)/r.height;// Welt pro Pixel
  const toScreen=p=>{const w=model.localToWorld(V3(p)).project(camera);return [(w.x+1)/2*r.width+r.left,(1-w.y)/2*r.height+r.top]};
  const px=p=>{const s=toScreen(p);return Math.hypot(s[0]-cx,s[1]-cy)};
  let eh=null;
  if(edgeObjs.length&&$('showEdges').checked&&($('snapE').checked||$('snapV').checked||$('snapC').checked)){ray.params.Line.threshold=7*wpp;
    // nur Kanten von Teilen nahe am Strahl prüfen (schnell bei großen Baugruppen)
    const cand=edgeObjs.filter(el=>el.parent.visible&&(!fh||el.parent===fh.object||ray.ray.intersectsSphere((el.geometry.boundingSphere||(el.geometry.computeBoundingSphere(),el.geometry.boundingSphere)).clone().applyMatrix4(el.matrixWorld))));
    const hs=ray.intersectObjects(cand,false).filter(h=>clipOk(h.point)&&(!fh||h.distance<=fh.distance+10*wpp));
    if(hs.length){const h=hs[0],inst=h.object.userData.inst,u=data.inst[inst].u;const eid=h.object.geometry.userData.edge[h.index/2|0];eh={id:eid,inst,u,e:data.uniq[u].edges[eid],p:model.worldToLocal(h.point.clone()).toArray()}}}
  if(eh){const e=eh.e,inst=eh.inst;
    if($('snapV').checked)for(const p of [e.pts[0],e.pts[e.pts.length-1]]){const pm=toModel(inst,p);if(px(pm)<10){const vi=vIndexOf(eh.u).get(key(p));if(vi!=null)return {k:'vertex',id:vi,inst,p:pm,body:bodies[inst]}}}
    if($('snapM').checked&&e.mid&&!(e.type==='Kreis'&&near(e.pts[0],e.pts.at(-1)))){const pm=toModel(inst,e.mid);if(px(pm)<10)return {k:'mid',id:eh.id,inst,p:pm,body:bodies[inst]}}
    if($('snapC').checked&&e.type==='Kreis')return {k:'center',id:eh.id,inst,p:toModel(inst,e.c),body:bodies[inst]};
    if($('snapE').checked)return {k:'edge',id:eh.id,inst,p:eh.p,body:bodies[inst]}}
  if(fh&&$('snapA').checked){const b=fh.object;const fid=b.geometry.userData.face[fh.faceIndex];const f=data.uniq[data.inst[b.userData.inst].u].faces[fid];if(f.ax)return {k:'axis',src:'face',id:fid,inst:b.userData.inst,p:model.worldToLocal(fh.point.clone()).toArray(),body:b}}
  if(fh&&$('snapF').checked){const b=fh.object;const fid=b.geometry.userData.face[fh.faceIndex];return {k:'face',id:fid,inst:b.userData.inst,p:model.worldToLocal(fh.point.clone()).toArray(),body:b}}
  return null}
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<1e-9;
const names={face:'Fläche',edge:'Kante',vertex:'Ecke',center:'Kreismittelpunkt',mid:'Kantenmitte',axis:'Achse'};
const UQ=s=>data.uniq[data.inst[s.inst??0].u];
const label=s=>s.k==='solid'?`Teil (${nodeOfBody(s.inst)?.name||'Körper'})`:s.k==='face'?`Fläche (${UQ(s).faces[s.id].type})`:s.k==='edge'?`Kante (${UQ(s).edges[s.id].type})`:s.k==='axis'?`Achse (Ø ${nf(2*UQ(s).faces[s.id].ax.r,PREC)} mm)`:names[s.k];
function hiObj(s,color){const g=new THREE.Group();
  const B=bodies[s.inst??0];const atInst=o=>{o.matrixAutoUpdate=false;o.matrix.copy(B.matrix);return o};
  if(s.k==='face'){const b=B;{const fa=b.geometry.userData.face,pos=b.geometry.attributes.position.array,out=[];for(let t=0;t<fa.length;t++)if(fa[t]===s.id)for(let j=0;j<9;j++)out.push(pos[t*9+j]);
      if(out.length){const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(out,3));g.add(atInst(new THREE.Mesh(gg,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55,side:THREE.DoubleSide,depthTest:true,clippingPlanes:renderer.localClippingEnabled?[plane]:[]}))))}}}
  if(s.k==='edge'){const p=UQ(s).edges[s.id].pts;const gg=new THREE.BufferGeometry().setFromPoints(p.map(V3));const l=new THREE.Line(gg,new THREE.LineBasicMaterial({color,depthTest:false,linewidth:2}));l.renderOrder=9;g.add(atInst(l))}
  if(s.k==='solid')return bodyHi([s.inst],color);
  if(s.k==='vertex'||s.k==='center'||s.k==='mid'){g.add(snapSym(s.k,s.p,color));if(s.k==='center'){const e=UQ(s).edges[s.id];const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(e.pts.map(V3)),new THREE.LineBasicMaterial({color,depthTest:false}));l.renderOrder=9;g.add(atInst(l))}
    if(s.k==='mid'){const e=UQ(s).edges[s.id];const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(e.pts.map(V3)),new THREE.LineBasicMaterial({color,depthTest:false}));l.renderOrder=9;g.add(atInst(l))}}
  if(s.k==='axis'){const a=UQ(s).faces[s.id].ax;const L=Math.max(a.r*4,box.getSize(new THREE.Vector3()).length()*0.15);
    const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(a.c).addScaledVector(V3(a.d),-L),V3(a.c).addScaledVector(V3(a.d),L)]),new THREE.LineDashedMaterial({color,dashSize:L/20,gapSize:L/40,depthTest:false}));l.computeLineDistances();l.renderOrder=9;g.add(atInst(l))}
  return g}
// Fangsymbole (gut sichtbar, wie in eDrawings): Ecke = Quadrat, Kantenmitte = Dreieck, Kreismittelpunkt = Kreis mit Kreuz
const symTex={};function symTexture(k){if(symTex[k])return symTex[k];const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.strokeStyle='#fff';x.lineWidth=10;x.fillStyle='#fff';
  if(k==='vertex'){x.strokeRect(10,10,44,44)}else if(k==='mid'){x.beginPath();x.moveTo(32,6);x.lineTo(58,56);x.lineTo(6,56);x.closePath();x.stroke()}else{x.beginPath();x.arc(32,32,24,0,7);x.stroke();x.lineWidth=5;x.beginPath();x.moveTo(32,2);x.lineTo(32,62);x.moveTo(2,32);x.lineTo(62,32);x.stroke()}
  return symTex[k]=new THREE.CanvasTexture(c)}
function snapSym(k,p,color){const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(p,3));const pt=new THREE.Points(gg,new THREE.PointsMaterial({color,size:20,map:symTexture(k),transparent:true,alphaTest:.3,sizeAttenuation:false,depthTest:false}));pt.renderOrder=12;return pt}
let down=null,hoverRAF=0;
renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
renderer.domElement.addEventListener('pointermove',e=>{if(e.buttons||hoverRAF)return;hoverRAF=requestAnimationFrame(()=>{hoverRAF=0;hov=pickAt(e.clientX,e.clientY);hoverObj.clear();if(hov)hoverObj.add(hiObj(hov,0xff6a00));$('hover').textContent=hov?label(hov):'';
  const tip=$('snaptip'),r=$('view').getBoundingClientRect();tip.hidden=!hov;if(hov){tip.textContent=label(hov);tip.style.left=(e.clientX-r.left)+'px';tip.style.top=(e.clientY-r.top)+'px'}needs=true})});
renderer.domElement.addEventListener('pointerleave',()=>{if(hoverRAF){cancelAnimationFrame(hoverRAF);hoverRAF=0}$('snaptip').hidden=true;hov=null;hoverObj.clear();$('hover').textContent='';needs=true});
renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)return;const s=pickAt(e.clientX,e.clientY);if(s){select(s,e.ctrlKey||e.shiftKey||e.metaKey);if(s.body){const n=nodeOfBody(s.body.userData.inst);if(n){selNode=n;for(let x=n.parent;x;x=x.parent)x.open=true;renderTree();document.querySelector(`.trow[data-id="${n.id}"]`)?.scrollIntoView({block:'nearest'})}}}});
addEventListener('keydown',e=>{if(e.code==='Space'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();clearSel()}});
$('clearSel').onclick=()=>clearSel();
function clearSel(){sels=[];marks.clear();$('selinfo').textContent='';$('mresult').innerHTML='';window.__lastMeasure=null;needs=true}
let lastRes=null;
async function select(s,add=false){if(sels.length>=2&&!add)clearSel();const clean={k:s.k,id:s.id,inst:s.inst,p:s.p};if(s.src)clean.src=s.src;sels.push(clean);marks.add(hiObj(clean,0x1f8fd0));
  $('selinfo').textContent=sels.map(label).join('  +  ');needs=true;
  try{const r=await call('measure',{sels});lastRes={r,sels:sels.slice(),title:sels.map(label).join(' + ')};kv($('mresult'),r.rows);
    r.gfx.forEach(([a,b])=>{const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(a),V3(b)]),new THREE.LineBasicMaterial({color:0x1f8fd0,depthTest:false}));l.renderOrder=11;marks.add(l)});
    if(sels.length===2&&!add)keepDim();
    window.__lastMeasure=r;needs=true;return r}catch(err){$('mresult').innerHTML=`<div>Fehler</div><div>${err.message}</div>`}}
// ---------- Bemaßungen (bleiben im 3D stehen) ----------
const dimGroup=new THREE.Group();dimGroup.renderOrder=20;let dims=[],dimNo=0;
const rowText=r=>`${r[0]}: ${r[2]&&r[2]!=='t'?fmt(r[1],r[2]):r[1]}`;
const mainRow=r=>r.rows.find(x=>x[3])||r.rows.find(x=>x[2]==='L'||x[2]==='A'||x[2]==='W')||r.rows[0];
function textSprite(txt){const c=document.createElement('canvas'),x=c.getContext('2d');const f='600 30px system-ui,sans-serif';x.font=f;const w=Math.ceil(x.measureText(txt).width)+24;c.width=w;c.height=44;
  x.font=f;x.fillStyle='rgba(29,29,31,.88)';x.beginPath();x.roundRect?x.roundRect(0,0,w,44,10):x.rect(0,0,w,44);x.fill();x.fillStyle='#fff';x.textBaseline='middle';x.fillText(txt,12,23);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,sizeAttenuation:false}));
  const h=0.03;sp.center.set(0.5,-0.2);sp.scale.set(h*w/44,h,1);sp.renderOrder=21;return sp}
function dimObject(d,k=0){const g=new THREE.Group();const col=0x0a7cc2;const r=mainRow(d.r);
  let at=null;for(const [a,b] of d.r.gfx){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(a),V3(b)]),new THREE.LineBasicMaterial({color:col,depthTest:false}));l.renderOrder=20;g.add(l);
    for(const p of [a,b])g.add(snapSym('vertex',p,col));at=V3(a).add(V3(b)).multiplyScalar(.5)}
  if(!at){const s=d.sels[0];at=V3(s.p||[0,0,0])}
  const sp=textSprite(`${d.no}: ${fmt(r[1],r[2])}`);sp.position.copy(at);sp.center.set(0.5,-0.2-1.35*k);g.add(sp);g.userData.dim=d.no;return g}
// Labels mit gleichem oder nahem Ankerpunkt (< 4 % der Modellgröße) übereinander versetzen statt überlappen
const dimAnchor=d=>{const g=d.r.gfx[0];return g?g[0].map((x,i)=>(x+g[1][i])/2):(d.sels[0].p||[0,0,0])};
function renderDims(){dimGroup.clear();const tol=box.getSize(new THREE.Vector3()).length()*0.04,placed=[];
  dims.forEach(d=>{const a=dimAnchor(d);const k=placed.filter(q=>Math.hypot(q[0]-a[0],q[1]-a[1],q[2]-a[2])<tol).length;placed.push(a);dimGroup.add(dimObject(d,k))});if(model&&dimGroup.parent!==model)model.add(dimGroup);
  $('dimcount').textContent=dims.length?`(${dims.length})`:'';
  $('dimlist').innerHTML=dims.map(d=>{const r=mainRow(d.r);return `<div class="dim" data-no="${d.no}"><b>${d.no}</b><span title="${d.title}"><span class="t">${r[0]}</span> <b>${fmt(r[1],r[2])}</b></span><button data-a="copy" title="Kopieren">Kopieren</button><button data-a="del" title="Löschen">Löschen</button></div>`}).join('')||'<p class="hint">Noch keine Bemaßungen.</p>';
  window.__dims=dims.map(d=>({no:d.no,title:d.title,text:dimText(d)}));needs=true}
const dimText=d=>`Bemaßung ${d.no} (${d.title})\n`+d.r.rows.map(rowText).join('\n');
async function copyText(t){window.__lastCopy=t;try{await navigator.clipboard.writeText(t)}catch{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch{}a.remove()}$('status').textContent='In die Zwischenablage kopiert'}
function keepDim(){if(!lastRes)return;dims.push({no:++dimNo,...lastRes});renderDims()}
$('keepDim').onclick=()=>keepDim();
$('copySel').onclick=()=>{if(lastRes)copyText(lastRes.title+'\n'+lastRes.r.rows.map(rowText).join('\n'))};
$('dimlist').onclick=e=>{const b=e.target.closest('button');if(!b)return;const no=+b.closest('.dim').dataset.no;const d=dims.find(x=>x.no===no);
  if(b.dataset.a==='del'){dims=dims.filter(x=>x!==d);renderDims()}else copyText(dimText(d))};
$('dimClear').onclick=()=>{dims=[];renderDims()};
$('dimCopyAll').onclick=()=>copyText(dims.map(dimText).join('\n\n'));
$('prec').value=String(PREC);$('prec').onchange=()=>{PREC=+$('prec').value;localStorage.setItem('genauigkeit',PREC);renderDims();if(lastRes)kv($('mresult'),lastRes.r.rows);if(data){showModel?.();showMass?.()}if(sheetCache)calcSheet()};

// ---------- Tabs / Blech ----------
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
  $('tab-messen').hidden=t.dataset.tab!=='messen';$('tab-blech').hidden=t.dataset.tab!=='blech';if(t.dataset.tab==='blech'&&data&&!sheetCache)calcSheet()});
let sheetCache=null;$('calcSheet').onclick=()=>calcSheet();
// K-Faktor-Modus, Werkstoff, eigene Biegetabelle
let biegetabelle=null;try{biegetabelle=JSON.parse(localStorage.getItem('biegetabelle')||'null')}catch{}
function showCsv(){$('csvinfo').textContent=biegetabelle?`Eigene Biegetabelle aktiv: ${biegetabelle.name} (${biegetabelle.rows.length} Zeilen) – hat Vorrang.`:'Keine eigene Biegetabelle geladen.';$('csvClear').hidden=!biegetabelle}
showCsv();
$('kmode').onchange=()=>{$('kf').disabled=$('kmode').value!=='manuell';if(data)calcSheet()};
$('mat2').onchange=()=>{$('mat').value=$('mat2').value;$('dens').value=$('mat2').value;showMass();if(sheetCache)calcSheet()};
$('mat').addEventListener('change',()=>{if([...$('mat2').options].some(o=>o.value===$('mat').value))$('mat2').value=$('mat').value});
$('csv').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const {parseBiegetabelle}=await import('./kfaktor.js');const rows=parseBiegetabelle(await f.text());biegetabelle={name:f.name,rows};localStorage.setItem('biegetabelle',JSON.stringify(biegetabelle));showCsv();if(data)calcSheet()}catch(err){$('csvinfo').textContent=err.message}e.target.value=''};
$('csvClear').onclick=()=>{biegetabelle=null;localStorage.removeItem('biegetabelle');showCsv();if(data)calcSheet()};
window.__setBiegetabelle=(name,rows)=>{biegetabelle={name,rows};showCsv()};
function schenkelTab(bends,n2){const rows=bends.flatMap(b=>(b.schenkel||[]).map((l,i)=>`<tr><td>${b.nr}</td><td>${i+1}</td><td>${n2(l.aussen)}</td><td>${l.innen!=null?n2(l.innen):'–'}</td><td>${n2(l.geradeAussen)}</td><td>${l.geradeInnen!=null?n2(l.geradeInnen):'–'}</td></tr>`));
  return rows.length?`<table class="schenkel"><tr><th>Nr.</th><th>Schenkel</th><th title="gerader Teil + R·tan(φ/2), außen">bis Biegep. außen</th><th title="gerader Teil + R·tan(φ/2), innen">bis Biegep. innen</th><th>gerade außen</th><th>gerade innen</th></tr>${rows.join('')}</table>`:''}
async function calcSheet(){if(!data)return;const K=parseFloat(String($('kf').value).replace(',','.'));if(!(K>=0&&K<=1)){$('sheetwarn').textContent='K-Faktor muss zwischen 0 und 1 liegen.';return}
  const opts={modus:$('kmode').value,K,tabelle:biegetabelle?.rows||null};
  const r=await call('sheet',{opts,inst:sheetSolid});sheetCache=r;window.__lastSheet=r;
  if(!r.ok){$('sheetinfo').innerHTML='';$('bends').innerHTML='';$('flatprev').innerHTML='';$('dxf').disabled=true;$('sheetwarn').textContent=r.msg;return}
  const rows=[['Teil',sheetSolid==null?'gesamtes Modell':(nodeOfBody(sheetSolid)?.name||'Körper '+(sheetSolid+1))],['Blechdicke (erkannt)',r.t,'L'],['K-Faktor',r.modus==='din'?(r.bends.some(b=>b.quelle==='Tabelle')?(r.bends.every(b=>b.quelle==='Tabelle')?'nach Biegetabelle':'nach Biegetabelle / DIN 6935 (je Biegung)'):'nach DIN 6935 (je Biegung)'):nf(K,2)],...(biegetabelle?[['Biegetabelle',biegetabelle.name]]:[]),['Biegungen',r.bends.length]];
  if(r.flat)rows.push(['Zuschnitt Länge',Math.max(...r.flat.size),'L'],['Zuschnitt Breite',Math.min(...r.flat.size),'L']);
  try{const q=await call('props',{ids:[sheetSolid??0]});const d=parseFloat($('mat2').value);rows.push(['Werkstoff',$('mat2').selectedOptions[0].textContent],['Masse',q.volume/1000*d,'M'])}catch{}
  kv($('sheetinfo'),rows);
  const n2=v=>nf(v,2);
  $('bends').innerHTML=r.bends.length?`<table><tr><th>Nr.</th><th title="Innenradius">Ri</th><th>Winkel</th><th>Richtung</th><th title="Biegezugabe (neutrale Faser)">BZ</th><th title="Biegeverkürzung">v</th><th title="K-Faktor und Quelle">K</th></tr>${r.bends.map(b=>`<tr><td>${b.nr}</td><td>${n2(b.ri)}</td><td>${nf(b.ang,1)}°</td><td>${b.dir}</td><td>${n2(b.ba)}</td><td>${n2(b.v)}</td><td title="${b.quelle}">${nf(b.K,3)}<span class="m"> ${b.quelle==='DIN 6935'?'DIN':b.quelle==='Tabelle'?'Tab.':'man.'}</span></td></tr>`).join('')}</table>${schenkelTab(r.bends,n2)}<p class="hint">Längen in mm. Schenkel bis Biegepunkt = gerader Teil + R·tan(Winkel/2); gerader Teil = ohne Biegung. BZ = Biegezugabe = Winkel·(Ri + K·s), K nach DIN 6935: K = (0,65 + 0,5·lg(Ri/s))/2 für Ri/s &lt; 5, sonst 0,5; v = BZ − 2·(Ri + s)·tan(Winkel/2). Biegelänge: ${r.bends.map(b=>n2(b.len)).join(' / ')} mm.</p>`:'<p class="hint">Keine zylindrischen Biegungen gefunden.</p>';
  $('flatprev').innerHTML=r.flat?svg(r.flat):'';$('dxf').disabled=!r.flat;
  const warn=[...r.warn,'Hinweis: Abwicklung nur für einfache Blechteile mit zylindrischen Biegungen und geraden Abschnitten. Werte vor der Fertigung prüfen.'];$('sheetwarn').innerHTML=warn.map(w=>'• '+w).join('<br>');return r}
function svg(f){const pad=Math.max(...f.size)*0.04,w=f.size[0]+2*pad,h=f.size[1]+2*pad;const tr=p=>`${(p[0]-f.min[0]+pad).toFixed(3)},${(f.max[1]-p[1]+pad).toFixed(3)}`;const sw=Math.max(w,h)/400;
  return `<svg viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}" xmlns="http://www.w3.org/2000/svg">${f.contour.map(pl=>`<polyline points="${pl.map(tr).join(' ')}" fill="none" stroke="#1d1d1f" stroke-width="${sw}"/>`).join('')}${f.bendLines.map(b=>`<polyline points="${b.map(tr).join(' ')}" stroke="#d0342c" stroke-width="${sw}" stroke-dasharray="${sw*6} ${sw*4}"/>`).join('')}</svg>`}
$('dxf').onclick=async()=>{if(!sheetCache?.dxf)return;const name=(window.__lastLoad?.name||'teil').replace(/\.(step|stp)$/i,'')+'_Abwicklung.dxf';
  const inv=window.__TAURI_INTERNALS__?.invoke;
  if(inv){try{const ok=await inv('save_text',{name,content:sheetCache.dxf});if(ok)$('status').textContent='DXF gespeichert: '+name}catch(e){$('status').textContent='Fehler beim Speichern: '+e}}
  else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([sheetCache.dxf],{type:'application/dxf'}));a.download=name;a.click()}};

// ---------- Test-Schnittstelle ----------
window.__loadUrl=async u=>load(await (await fetch(u)).arrayBuffer(),u.split('/').pop());
window.__app={hoverCount:()=>hoverObj.children.length,dimLabels:()=>dimGroup.children.map(g=>{const sp=g.children.find(o=>o.isSprite);return [sp.position.toArray(),sp.center.y]}),dims:()=>dims,keepDim,renderDims,copyText,vis:()=>bodies.map(b=>b.visible),selName:()=>selNode?.name,trans:()=>bodies.map(b=>b.material.opacity),act,selectNode,nodes:()=>nodes,ctxMenu,select,clearSel,calcSheet,pickAt,data:()=>data,tab:n=>document.querySelector(`.tab[data-tab="${n}"]`).click(),
  screenOf:p=>{const r=renderer.domElement.getBoundingClientRect();const w=model.localToWorld(V3(p)).project(camera);return [(w.x+1)/2*r.width+r.left,(1-w.y)/2*r.height+r.top]}};
window.__toggleMeasure=()=>{};
