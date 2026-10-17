import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
const $=id=>document.getElementById(id), view=$('view');
let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true})}catch(e){document.getElementById('status').textContent='Fehler: 3D-Grafik (WebGL) wird auf diesem Rechner nicht unterstützt.';throw e}
renderer.setPixelRatio(devicePixelRatio);renderer.setClearColor(0xf5f5f7);view.appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,0.1,1e6);
scene.add(new THREE.HemisphereLight(0xffffff,0xb0b4bc,1.6));const dl=new THREE.DirectionalLight(0xffffff,1.4);camera.add(dl);dl.position.set(1,2,3);scene.add(camera);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.screenSpacePanning=true;
const plane=new THREE.Plane(new THREE.Vector3(1,0,0),0);let model=null,box=new THREE.Box3(),needs=true;
function resize(){const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();needs=true}
addEventListener('resize',resize);resize();controls.addEventListener('change',()=>needs=true);
(function loop(){requestAnimationFrame(loop);controls.update();if(needs){renderer.render(scene,camera);needs=false}})();
function fit(){if(!model)return;const s=box.getSize(new THREE.Vector3()).length(),c=box.getCenter(new THREE.Vector3());
camera.near=s/1000;camera.far=s*100;camera.position.copy(c).add(new THREE.Vector3(.8,.6,1).normalize().multiplyScalar(s*1.2));camera.updateProjectionMatrix();controls.target.copy(c);controls.update();needs=true}
$('fit').onclick=fit;
const worker=new Worker(new URL('./worker.js',import.meta.url));const base=new URL('./',location.href).href;
function parse(buf){return new Promise((res,rej)=>{worker.onmessage=e=>e.data.ok?res(e.data):rej(new Error('Fehler beim Lesen der STEP-Datei: '+e.data.error));worker.onerror=()=>rej(new Error('Fehler: Der STEP-Leser konnte nicht gestartet werden.'));worker.postMessage({buf,base},[buf])})}
async function load(buf,name){
  const t0=performance.now();$('status').textContent='Lade '+name+' …';$('drop').style.display='none';
  const size=buf.byteLength;const r=await parse(buf);
  if(model){scene.remove(model);model.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})}
  model=new THREE.Group();const meshObjs=r.meshes.map(m=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.p,3));
    if(m.n)g.setAttribute('normal',new THREE.BufferAttribute(m.n,3));else g.computeVertexNormals();g.setIndex(new THREE.BufferAttribute(m.i,1));
    const col=m.color?new THREE.Color(...m.color):new THREE.Color(0xb8bcc4);
    const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:col,metalness:.1,roughness:.55,side:THREE.DoubleSide,clippingPlanes:[]}));mesh.name=m.name||'Teil';return mesh});
  const tree=$('tree');tree.innerHTML='';
  function build(node,parent,ul){const grp=new THREE.Group();grp.name=node.name||'Baugruppe';parent.add(grp);
    const li=document.createElement('li'),row=document.createElement('div'),cb=document.createElement('input'),tw=document.createElement('span'),lb=document.createElement('span');
    cb.type='checkbox';cb.checked=true;cb.onchange=()=>{grp.visible=cb.checked;needs=true};tw.className='tw';lb.textContent=grp.name;row.append(tw,cb,lb);li.append(row);ul.append(li);
    const sub=document.createElement('ul');
    (node.meshes||[]).forEach(i=>{const m=meshObjs[i].clone();m.material=meshObjs[i].material;grp.add(m);const l2=document.createElement('li'),r2=document.createElement('div'),c2=document.createElement('input'),s2=document.createElement('span');
      c2.type='checkbox';c2.checked=true;c2.onchange=()=>{m.visible=c2.checked;needs=true};s2.textContent=m.name;const sp=document.createElement('span');sp.className='tw';r2.append(sp,c2,s2);l2.append(r2);sub.append(l2)});
    (node.children||[]).forEach(c=>build(c,grp,sub));
    if(sub.children.length){li.append(sub);tw.textContent='▾';tw.onclick=()=>{const h=sub.style.display==='none';sub.style.display=h?'':'none';tw.textContent=h?'▾':'▸'}}}
  const ul=document.createElement('ul');tree.append(ul);build(r.root,model,ul);
  // STEP: Z-Achse oben
  model.rotation.x=-Math.PI/2;scene.add(model);model.updateMatrixWorld(true);box.setFromObject(model);
  fit();setCut();const ms=performance.now()-t0;let tris=0;r.meshes.forEach(m=>tris+=m.i.length/3);
  const info={name,bytes:size,parts:r.meshes.length,triangles:tris,parseMs:Math.round(r.parseMs),totalMs:Math.round(ms)};window.__lastLoad=info;
  $('status').textContent=`${name} · ${(size/1024).toFixed(0)} KB · ${info.parts} Teile · ${info.totalMs} ms`;return info}
$('file').onchange=async e=>{const f=e.target.files[0];if(f)load(await f.arrayBuffer(),f.name).catch(err=>$('status').textContent=err.message)};
view.ondragover=e=>e.preventDefault();view.ondrop=async e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)load(await f.arrayBuffer(),f.name).catch(err=>$('status').textContent=err.message)};
window.__loadUrl=async u=>load(await (await fetch(u)).arrayBuffer(),u.split('/').pop());
// section
function setCut(){const ax=$('axis').value;$('cut').disabled=!ax;renderer.localClippingEnabled=!!ax;
  if(model)model.traverse(o=>{if(o.material)o.material.clippingPlanes=ax?[plane]:[]});
  if(ax&&model){const k=ax.toLowerCase(),t=$('cut').value/1000,v=box.min[k]+(box.max[k]-box.min[k])*t;plane.normal.set(k==='x'?-1:0,k==='y'?-1:0,k==='z'?-1:0);plane.constant=v}
  needs=true}
$('axis').onchange=setCut;$('cut').oninput=setCut;window.__setCut=(a,v)=>{$('axis').value=a;$('cut').value=v;setCut()};
// measure
let mOn=false,pts=[],marks=new THREE.Group();scene.add(marks);const ray=new THREE.Raycaster();
$('measure').onclick=()=>{mOn=!mOn;$('measure').classList.toggle('on',mOn);pts=[];marks.clear();$('mres').style.display='none';needs=true};
let down=null;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
renderer.domElement.addEventListener('pointerup',e=>{if(!mOn||!model||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)return;
  const r=renderer.domElement.getBoundingClientRect();pick(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1)});
function pick(x,y){ray.setFromCamera({x,y},camera);const hits=ray.intersectObject(model,true).filter(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent}return !renderer.localClippingEnabled||plane.distanceToPoint(h.point)>=0});
  if(!hits.length)return null;const p=hits[0].point;if(pts.length===2){pts=[];marks.clear()}pts.push(p);
  const s=box.getSize(new THREE.Vector3()).length()/200;const dot=new THREE.Mesh(new THREE.SphereGeometry(s),new THREE.MeshBasicMaterial({color:0x33afe2,depthTest:false}));dot.renderOrder=9;dot.position.copy(p);marks.add(dot);
  if(pts.length===2){const ln=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x33afe2,depthTest:false}));ln.renderOrder=9;marks.add(ln);
    const d=pts[0].distanceTo(pts[1]);$('mres').style.display='block';$('mres').textContent=`Abstand: ${d.toFixed(3)} mm`;window.__lastMeasure=d}
  needs=true;return p}
window.__pick=pick;window.__toggleMeasure=()=>$('measure').click();
