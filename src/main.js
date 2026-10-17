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
let model=null,box=new THREE.Box3(),needs=true,data=null,bodies=[],edgeObj=null,marks=new THREE.Group(),hoverObj=new THREE.Group();
function resize(){const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();needs=true}
addEventListener('resize',resize);resize();controls.addEventListener('change',()=>needs=true);
(function loop(){requestAnimationFrame(loop);controls.update();if(needs){renderer.render(scene,camera);needs=false}})();

// ---------- Worker ----------
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});const base=new URL('./',location.href).href;
let seq=0;const pend=new Map();
worker.onmessage=e=>{const p=pend.get(e.data.id);pend.delete(e.data.id);e.data.ok?p.res(e.data.r):p.rej(new Error(e.data.error))};
worker.onerror=()=>{for(const p of pend.values())p.rej(new Error('Fehler: Der Geometrie-Kern konnte nicht gestartet werden.'));pend.clear()};
const call=(cmd,args={},tr=[])=>new Promise((res,rej)=>{const id=++seq;pend.set(id,{res,rej});worker.postMessage({id,cmd,args:{...args,base}},tr)});
call('init').catch(()=>{});

// ---------- Einheiten / Formatierung ----------
let U={sym:'mm',mm:1,name:'Millimeter'};
const nf=(v,d=3)=>v.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
function fmt(v,k){if(k==='L')return nf(v/U.mm)+' '+U.sym;if(k==='A')return nf(v/U.mm**2)+' '+U.sym+'²';if(k==='V')return nf(v/U.mm**3)+' '+U.sym+'³';
  if(k==='W')return nf(v,2)+' °';if(k==='P')return v.map(x=>nf(x/U.mm)).join(' / ');if(k==='M')return v>=1000?nf(v/1000)+' kg':nf(v,1)+' g';return String(v)}
const kv=(el,rows)=>{el.innerHTML=rows.map(([a,b,k])=>`<div>${a}</div><div>${k?fmt(b,k):b}</div>`).join('')};

// ---------- Ansicht ----------
function fit(dir){if(!model)return;const s=box.getSize(new THREE.Vector3()).length(),c=box.getCenter(new THREE.Vector3());
  const d=(dir||new THREE.Vector3(.8,.6,1)).clone().normalize();camera.near=s/2000;camera.far=s*100;
  camera.up.set(0,1,0);if(Math.abs(d.y)>.99)camera.up.set(0,0,-1);
  camera.position.copy(c).add(d.multiplyScalar(s*1.7));camera.updateProjectionMatrix();controls.target.copy(c);controls.update();needs=true}
$('fit').onclick=()=>fit();
const views={iso:new THREE.Vector3(.8,.6,1),vorne:new THREE.Vector3(0,0,1),oben:new THREE.Vector3(0,1,0),rechts:new THREE.Vector3(1,0,0)};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>fit(views[b.dataset.view]));
$('showEdges').onchange=()=>{if(edgeObj)edgeObj.visible=$('showEdges').checked;needs=true};

// ---------- Laden ----------
async function load(buf,name){
  const t0=performance.now();$('status').textContent='Lade '+name+' …';$('drop').style.display='none';$('busy').style.display='block';
  const size=buf.byteLength;
  try{data=await call('load',{buf,name},[buf])}finally{$('busy').style.display='none'}
  U=data.unit;
  if(model){scene.remove(model);model.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.()})}
  model=new THREE.Group();model.rotation.x=-Math.PI/2;bodies=[];
  data.meshes.forEach(m=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.p,3));g.setIndex(new THREE.BufferAttribute(m.i,1));
    const g2=g.toNonIndexed();g2.computeVertexNormals();g2.userData.face=m.f;g2.userData.src=m;
    const mesh=new THREE.Mesh(g2,new THREE.MeshStandardMaterial({color:0xb9bec7,metalness:.15,roughness:.5,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
    mesh.name=m.name;model.add(mesh);bodies.push(mesh)});
  const seg=[],segE=[];data.edges.forEach((e,i)=>{for(let k=1;k<e.pts.length;k++){seg.push(...e.pts[k-1],...e.pts[k]);segE.push(i)}});
  const eg=new THREE.BufferGeometry();eg.setAttribute('position',new THREE.Float32BufferAttribute(seg,3));eg.userData.edge=segE;
  edgeObj=new THREE.LineSegments(eg,new THREE.LineBasicMaterial({color:0x2a2d33}));edgeObj.visible=$('showEdges').checked;model.add(edgeObj);
  model.add(marks);model.add(hoverObj);scene.add(model);model.updateMatrixWorld(true);box.setFromObject(model);
  vIndex=new Map();data.verts.forEach((p,i)=>vIndex.set(key(p),i));
  buildTree();clearSel();sheetSolid=null;fit();setCut();showModel();sheetCache=null;$('sheetinfo').innerHTML='';$('bends').innerHTML='';$('flatprev').innerHTML='';$('dxf').disabled=true;$('sheetwarn').textContent='';
  if(!$('tab-blech').hidden)calcSheet();
  const ms=Math.round(performance.now()-t0);const tris=data.meshes.reduce((s,m)=>s+m.i.length/3,0);
  const info={name,bytes:size,bodies:data.meshes.length,faces:data.faces.length,edges:data.edges.length,triangles:tris,totalMs:ms,unit:U.sym};window.__lastLoad=info;
  $('status').textContent=`${name} · ${(size/1024).toFixed(0)} KB · ${info.bodies} Körper · ${info.faces} Flächen · Einheit: ${U.name} · ${ms} ms`;return info}
const key=p=>p.map(x=>x.toFixed(5)).join(',');let vIndex=new Map();
// ---------- Baugruppenbaum ----------
let treeRoot=null,nodes=[],selNode=null,sheetSolid=null;
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
function bodyHi(ids,color){const g=new THREE.Group();ids.forEach(i=>{const b=bodies[i];if(!b.visible)return;const m=new THREE.Mesh(b.geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.45,depthTest:true,side:THREE.DoubleSide,clippingPlanes:renderer.localClippingEnabled?[plane]:[]}));m.renderOrder=5;g.add(m)});return g}
function boxOf(ids){const b=new THREE.Box3();ids.forEach(i=>{if(bodies[i].visible)b.expandByObject(bodies[i])});return b}
async function act(a,n){
  if(a==='toggle'){n.checked=!n.checked;applyVis();renderTree()}
  if(a==='isolate'){nodes.forEach(x=>x.checked=false);for(let x=n;x;x=x.parent)x.checked=true;const on=x=>{x.checked=true;x.children.forEach(on)};on(n);applyVis();renderTree();zoomTo(n)}
  if(a==='showall'){nodes.forEach(x=>x.checked=true);applyVis();renderTree()}
  if(a==='transp'){n.transp=!n.transp;n.all.forEach(i=>{const m=bodies[i].material;m.transparent=n.transp;m.opacity=n.transp?.3:1;m.depthWrite=!n.transp;m.needsUpdate=true});needs=true}
  if(a==='zoom')zoomTo(n);
  if(a==='measure'){tabTo('messen');if(n.all.length===1){clearSel();await select({k:'solid',id:n.all[0]})}else{$('selinfo').textContent='Messen: bitte ein einzelnes Teil wählen.'}}
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
  kv($('modelinfo'),[['Einheit',U.name],['Körper',m.solids],['Flächen',m.faces],['Kanten',m.edges],['Bounding-Box X',s.x,'L'],['Bounding-Box Y',s.y,'L'],['Bounding-Box Z',s.z,'L'],['Volumen',m.volume,'V'],['Oberfläche',m.area,'A'],['Schwerpunkt',m.centroid,'P']]);showMass()}
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
  if(edgeObj&&($('snapE').checked||$('snapV').checked||$('snapC').checked)){ray.params.Line.threshold=7*wpp;
    const hs=ray.intersectObject(edgeObj,false).filter(h=>clipOk(h.point)&&(!fh||h.distance<=fh.distance+10*wpp));
    if(hs.length){const eid=edgeObj.geometry.userData.edge[hs[0].index/2|0];eh={id:eid,e:data.edges[eid],p:model.worldToLocal(hs[0].point.clone()).toArray()}}}
  if(eh){const e=eh.e;
    if($('snapV').checked)for(const p of [e.pts[0],e.pts[e.pts.length-1]]){if(px(p)<10){const vi=vIndex.get(key(p));if(vi!=null)return {k:'vertex',id:vi,p}}}
    if($('snapC').checked&&e.type==='Kreis')return {k:'center',id:eh.id,p:e.c};
    if($('snapE').checked)return {k:'edge',id:eh.id,p:eh.p}}
  if(fh&&$('snapF').checked){const b=fh.object;const fid=b.geometry.userData.face[fh.faceIndex];return {k:'face',id:fid,p:model.worldToLocal(fh.point.clone()).toArray(),body:b}}
  return null}
const names={face:'Fläche',edge:'Kante',vertex:'Eckpunkt',center:'Kreismittelpunkt'};
const label=s=>s.k==='solid'?`Teil (${nodeOfBody(s.id)?.name||'Körper'})`:s.k==='face'?`Fläche (${data.faces[s.id].type})`:s.k==='edge'?`Kante (${data.edges[s.id].type})`:names[s.k];
function hiObj(s,color){const g=new THREE.Group();
  if(s.k==='face'){bodies.forEach(b=>{const fa=b.geometry.userData.face,pos=b.geometry.attributes.position.array,out=[];for(let t=0;t<fa.length;t++)if(fa[t]===s.id)for(let j=0;j<9;j++)out.push(pos[t*9+j]);
      if(out.length){const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(out,3));g.add(new THREE.Mesh(gg,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55,side:THREE.DoubleSide,depthTest:true,clippingPlanes:renderer.localClippingEnabled?[plane]:[]})))}})}
  if(s.k==='edge'){const p=data.edges[s.id].pts;const gg=new THREE.BufferGeometry().setFromPoints(p.map(V3));const l=new THREE.Line(gg,new THREE.LineBasicMaterial({color,depthTest:false,linewidth:2}));l.renderOrder=9;g.add(l)}
  if(s.k==='solid')return bodyHi([s.id],color);
  if(s.k==='vertex'||s.k==='center'){const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(s.p,3));const pt=new THREE.Points(gg,new THREE.PointsMaterial({color,size:11,sizeAttenuation:false,depthTest:false}));pt.renderOrder=10;g.add(pt)}
  return g}
let down=null,hoverRAF=0;
renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
renderer.domElement.addEventListener('pointermove',e=>{if(e.buttons||hoverRAF)return;hoverRAF=requestAnimationFrame(()=>{hoverRAF=0;hov=pickAt(e.clientX,e.clientY);hoverObj.clear();if(hov)hoverObj.add(hiObj(hov,0xff9f1c));$('hover').textContent=hov?label(hov):'';needs=true})});
renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)return;const s=pickAt(e.clientX,e.clientY);if(s){select(s);if(s.body){const n=nodeOfBody(bodies.indexOf(s.body));if(n){selNode=n;for(let x=n.parent;x;x=x.parent)x.open=true;renderTree();document.querySelector(`.trow[data-id="${n.id}"]`)?.scrollIntoView({block:'nearest'})}}}});
addEventListener('keydown',e=>{if(e.code==='Space'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();clearSel()}});
$('clearSel').onclick=()=>clearSel();
function clearSel(){sels=[];marks.clear();$('selinfo').textContent='';$('mresult').innerHTML='';needs=true}
async function select(s){if(sels.length>=2)clearSel();const clean={k:s.k,id:s.id,p:s.p};sels.push(clean);marks.add(hiObj(clean,0x1f8fd0));
  $('selinfo').textContent=sels.map(label).join('  +  ');needs=true;
  try{const r=await call('measure',{sels});kv($('mresult'),r.rows);
    r.gfx.forEach(([a,b])=>{const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(a),V3(b)]),new THREE.LineBasicMaterial({color:0x1f8fd0,depthTest:false}));l.renderOrder=11;marks.add(l)});
    window.__lastMeasure=r;needs=true;return r}catch(err){$('mresult').innerHTML=`<div>Fehler</div><div>${err.message}</div>`}}

// ---------- Tabs / Blech ----------
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
  $('tab-messen').hidden=t.dataset.tab!=='messen';$('tab-blech').hidden=t.dataset.tab!=='blech';if(t.dataset.tab==='blech'&&data&&!sheetCache)calcSheet()});
let sheetCache=null;$('calcSheet').onclick=()=>calcSheet();
async function calcSheet(){if(!data)return;const K=parseFloat(String($('kf').value).replace(',','.'));if(!(K>=0&&K<=1)){$('sheetwarn').textContent='K-Faktor muss zwischen 0 und 1 liegen.';return}
  const r=await call('sheet',{K,solid:sheetSolid});sheetCache=r;window.__lastSheet=r;
  if(!r.ok){$('sheetinfo').innerHTML='';$('bends').innerHTML='';$('flatprev').innerHTML='';$('dxf').disabled=true;$('sheetwarn').textContent=r.msg;return}
  const rows=[['Teil',sheetSolid==null?'gesamtes Modell':(nodeOfBody(sheetSolid)?.name||'Körper '+(sheetSolid+1))],['Blechdicke (erkannt)',r.t,'L'],['K-Faktor',nf(K,2)],['Biegungen',r.bends.length]];
  if(r.flat)rows.push(['Zuschnitt Länge',Math.max(...r.flat.size),'L'],['Zuschnitt Breite',Math.min(...r.flat.size),'L']);
  kv($('sheetinfo'),rows);
  const n2=v=>nf(v/U.mm,2);
  $('bends').innerHTML=r.bends.length?`<table><tr><th>Nr.</th><th title="Innenradius">Ri</th><th>Winkel</th><th>Richtung</th><th title="Biegezugabe (neutrale Faser)">BZ</th><th title="Biegeverkürzung">v</th></tr>${r.bends.map(b=>`<tr><td>${b.nr}</td><td>${n2(b.ri)}</td><td>${nf(b.ang,1)}°</td><td>${b.dir}</td><td>${n2(b.ba)}</td><td>${n2(b.v)}</td></tr>`).join('')}</table><p class="hint">Längen in ${U.sym}. BZ = Biegezugabe = Winkel·(Ri + K·s); v = BZ − 2·(Ri + s)·tan(Winkel/2). Biegelänge: ${r.bends.map(b=>n2(b.len)).join(' / ')} ${U.sym}.</p>`:'<p class="hint">Keine zylindrischen Biegungen gefunden.</p>';
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
window.__app={vis:()=>bodies.map(b=>b.visible),selName:()=>selNode?.name,trans:()=>bodies.map(b=>b.material.opacity),act,selectNode,nodes:()=>nodes,ctxMenu,select,clearSel,calcSheet,pickAt,data:()=>data,tab:n=>document.querySelector(`.tab[data-tab="${n}"]`).click(),
  screenOf:p=>{const r=renderer.domElement.getBoundingClientRect();const w=model.localToWorld(V3(p)).project(camera);return [(w.x+1)/2*r.width+r.left,(1-w.y)/2*r.height+r.top]}};
window.__toggleMeasure=()=>{};
