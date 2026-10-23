import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BM from './bemassung.js';
import { MARKE } from './marke.js';
import { biegeNotizen } from './biegenotiz.js';
import { falteNetz } from './falten.js';
import { deltaLinien ,richtungsVektor,RICHTUNGEN} from './messen-hilfen.js';
const $=id=>document.getElementById(id), view=$('view');
if(MARKE.id==='sickinger'){document.documentElement.dataset.marke='sickinger';document.title=MARKE.produkt}
let logoZusage=null;
function logoDaten(){if(!MARKE.logo)return Promise.resolve(null);if(!logoZusage)logoZusage=fetch(MARKE.logo).then(r=>{if(!r.ok)throw new Error('Logo fehlt');return r.blob()}).then(b=>new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)}));return logoZusage}
const ueberBtn=$('ueber');if(ueberBtn){ueberBtn.onclick=()=>{$('ueberDlg').hidden=false};$('ueberClose').onclick=()=>{$('ueberDlg').hidden=true}}
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:true})}catch(e){$('status').textContent='Fehler: 3D-Grafik (WebGL) wird auf diesem Rechner nicht unterstützt.';throw e}
renderer.setPixelRatio(devicePixelRatio);renderer.setClearColor(0x000000,0);renderer.domElement.id='buehne';view.appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,0.1,1e6);
scene.add(new THREE.HemisphereLight(0xffffff,0xb0b4bc,1.5));const dl=new THREE.DirectionalLight(0xffffff,1.3);camera.add(dl);dl.position.set(1,2,3);scene.add(camera);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.autoRotate=false;controls.screenSpacePanning=true;
// Maus wie eDrawings/SolidWorks: Mitte ziehen = drehen um die Modellmitte, Strg+Mitte, Umschalt+Mitte oder Rechts ziehen = schwenken,
// ohne Nachlauf (keine Dämpfung): nach dem Loslassen steht das Modell sofort still, Rad = Zoom auf den Cursor, Links = Auswahl/Messen
controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};controls.zoomToCursor=true;
renderer.domElement.addEventListener('mousedown',e=>{if(e.button===1)e.preventDefault()});
const overlay=document.createElement('canvas');overlay.id='dimoverlay';overlay.style.cssText='position:absolute;left:0;top:0;pointer-events:none';view.appendChild(overlay);
const plane=new THREE.Plane(new THREE.Vector3(1,0,0),0);
let model=null,box=new THREE.Box3(),needs=true,data=null,bodies=[],edgeObjs=[],baseMat=null,marks=new THREE.Group(),hoverObj=new THREE.Group();
let ersteZeichnung=0,anim=null,drehen=false,mausUnten=false,werkzeug='wahl',triade=null,wahlMark=null;
const ACHSEN=[new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)];
const ANSICHT={iso:{d:[.8,.6,1],up:[0,1,0]},vorne:{d:[0,0,1],up:[0,1,0]},hinten:{d:[0,0,-1],up:[0,1,0]},links:{d:[-1,0,0],up:[0,1,0]},rechts:{d:[1,0,0],up:[0,1,0]},oben:{d:[0,1,0],up:[0,0,-1]},unten:{d:[0,-1,0],up:[0,0,-1]}};
let vr=null,vc=null,vHit=null;
(function viewcube(){
  const ziel=$('wuerfelbild');if(!ziel)return;
  vr=new THREE.WebGLRenderer({antialias:true,alpha:true});vr.setPixelRatio(Math.min(devicePixelRatio||1,2));vr.setSize(112,112);vr.setClearColor(0x000000,0);ziel.appendChild(vr.domElement);
  const vs=new THREE.Scene();vc=new THREE.PerspectiveCamera(34,1,0.1,20);
  const wurzel=new THREE.Group();vs.add(wurzel);
  const textur=txt=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#e4e8ed';g.fillRect(0,0,256,256);g.strokeStyle='#8b939c';g.lineWidth=12;g.strokeRect(8,8,240,240);g.fillStyle='#2a3036';g.font='700 44px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,128,128);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t};
  const flaechen=[{t:'OBEN',p:[0,.51,0],r:[-Math.PI/2,0,0]},{t:'UNTEN',p:[0,-.51,0],r:[Math.PI/2,0,0]},{t:'VORNE',p:[0,0,.51],r:[0,0,0]},{t:'HINTEN',p:[0,0,-.51],r:[0,Math.PI,0]},{t:'RECHTS',p:[.51,0,0],r:[0,Math.PI/2,0]},{t:'LINKS',p:[-.51,0,0],r:[0,-Math.PI/2,0]}];
  const pg=new THREE.PlaneGeometry(.96,.96);
  flaechen.forEach(f=>{const m=new THREE.Mesh(pg,new THREE.MeshBasicMaterial({map:textur(f.t)}));m.position.set(...f.p);m.rotation.set(...f.r);wurzel.add(m)});
  wurzel.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),new THREE.LineBasicMaterial({color:0x5c656e})));
  vHit=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({visible:false}));wurzel.add(vHit);vr.userData={vs,wurzel};
})();
function resize(){const w=view.clientWidth,h=view.clientHeight;renderer.setSize(w,h);overlay.width=w*devicePixelRatio;overlay.height=h*devicePixelRatio;overlay.style.width=w+'px';overlay.style.height=h+'px';camera.aspect=w/h;if(dockBereit)freiraum();else camera.updateProjectionMatrix();needs=true}
var dockBereit=false,freiD=0; // Seitenleiste (siehe unten)
addEventListener('resize',resize);resize();controls.addEventListener('change',()=>needs=true);
if(window.ResizeObserver)new ResizeObserver(()=>resize()).observe(view);
// ---------- Seitenleiste: Bedienfelder (Messen, Blech, Schnitt, Verschieben, Eigenschaften) liegen neben dem Modell, nie darüber ----------
// Rechts unter dem Ansichtswürfel (oder links), einklappbar, an der Titelleiste ziehbar (rastet links/rechts ein), Zustand in localStorage.
// Die Kamera verschiebt ihren Bildmittelpunkt in den freien Bereich (setViewOffset), Einpassen rechnet mit der freien Breite.
const dock=document.createElement('div');dock.id='dock';view.appendChild(dock);
const dockLasche=document.createElement('button');dockLasche.type='button';dockLasche.id='dockLasche';dockLasche.title='Seitenleiste ausklappen';dock.appendChild(dockLasche);
for(const id of ['schnittPanel','bewegenPanel','props','messenPanel','blechPanel']){const el=$(id);if(el)dock.appendChild(el)}
{const zu=$('blechZu');if(zu){const b=document.createElement('button');b.type='button';b.className='zuKnopf dockEin';b.id='blechEin';b.title='Einklappen';b.textContent='–';zu.before(b);b.style.marginLeft='auto';zu.style.marginLeft='0'}}
let dockZustand={seite:'rechts',oben:null,zu:false};try{const g=JSON.parse(localStorage.getItem('seitenleiste')||'{}');if(g&&typeof g==='object')Object.assign(dockZustand,g)}catch{}
const DOCK_OBEN={rechts:184,links:56};
function dockSpeichern(){try{localStorage.setItem('seitenleiste',JSON.stringify(dockZustand))}catch{}}
function dockSichtbar(){return [...dock.children].filter(e=>e!==dockLasche&&!e.hidden)}
function dockEinklappen(zu){dockZustand.zu=!!zu;dockSpeichern();dockAnwenden()}
function dockAnwenden(){const z=dockZustand;if(z.seite!=='links')z.seite='rechts';dock.classList.toggle('links',z.seite==='links');dock.classList.toggle('zu',!!z.zu);
  const vh=view.clientHeight||600,min=DOCK_OBEN[z.seite];const oben=Math.round(Math.min(Math.max(Number.isFinite(z.oben)?z.oben:min,min),Math.max(min,vh-140)));
  dock.style.top=oben+'px';dock.style.left=z.seite==='links'?'12px':'';dock.style.right=z.seite==='links'?'':'12px';
  const s=dockSichtbar();if(dock.hidden!==!s.length)dock.hidden=!s.length;
  const haupt=s.find(e=>e.id==='messenPanel'||e.id==='blechPanel')||s[0];const name=haupt?.querySelector('.ptitel,.dhead')?.firstChild?.textContent?.trim()||'Seitenleiste';
  if(dockLasche.textContent!==name)dockLasche.textContent=name;freiraum()}
function dockRechteck(){if(dock.hidden)return null;const r=dock.getBoundingClientRect(),v=view.getBoundingClientRect();return {x0:r.left-v.left,y0:r.top-v.top,x1:r.right-v.left,y1:r.bottom-v.top}}
function modellRechteck(){if(!model||box.isEmpty())return null;camera.updateMatrixWorld();const v=new THREE.Vector3(),w=view.clientWidth,h=view.clientHeight;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(let i=0;i<8;i++){v.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(camera);const x=(v.x+1)/2*w,y=(1-v.y)/2*h;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
  return {x0,y0,x1,y1}}
function modellUnterDock(){const d=dockRechteck(),m=modellRechteck();return !!(d&&m&&m.x0<d.x1&&m.x1>d.x0&&m.y0<d.y1&&m.y1>d.y0)}
function freiraum(){if(!dockBereit)return;const w=view.clientWidth,h=view.clientHeight;let D=0;const d=dockRechteck();
  if(d&&w>0)D=Math.max(0,Math.min(dockZustand.seite==='links'?d.x1+12:w-d.x0+12,w*0.6));
  const alt=freiD;freiD=D;
  if(D>0&&w>0&&h>0)camera.setViewOffset(w,h,dockZustand.seite==='links'?-D/2:D/2,0,w,h);else camera.clearViewOffset();
  camera.updateProjectionMatrix();needs=true;
  if(model&&!anim&&!dockZug&&Math.abs(D-alt)>1&&modellUnterDock())fit()}
let dockZug=null;
dock.addEventListener('pointerdown',e=>{const kopf=e.target.closest('.ptitel,.dhead');if(!kopf||e.button!==0||e.target.closest('button,select,input,label,a'))return;
  const r=dock.getBoundingClientRect(),v=view.getBoundingClientRect();dockZug={dx:e.clientX-r.left,dy:e.clientY-r.top,v};dock.classList.add('zieht');try{kopf.setPointerCapture(e.pointerId)}catch{}e.preventDefault()});
addEventListener('pointermove',e=>{if(!dockZug)return;const v=dockZug.v;dock.style.right='';dock.style.left=Math.round(e.clientX-v.left-dockZug.dx)+'px';dock.style.top=Math.round(e.clientY-v.top-dockZug.dy)+'px'});
const dockLoslassen=()=>{if(!dockZug)return;const v=dockZug.v,r=dock.getBoundingClientRect();dockZug=null;dock.classList.remove('zieht');
  dockZustand.seite=(r.left+r.width/2)<(v.left+v.width/2)?'links':'rechts';dockZustand.oben=Math.round(r.top-v.top);dockSpeichern();dockAnwenden()};
addEventListener('pointerup',dockLoslassen);addEventListener('pointercancel',dockLoslassen);
dockLasche.onclick=()=>dockEinklappen(false);
// Ein Feld, das neu aufgeht, klappt die Seitenleiste aus
const dockBeobachter=new MutationObserver(rs=>{let auf=false;for(const r of rs)if(r.oldValue!==null&&!r.target.hidden)auf=true;if(auf&&dockZustand.zu){dockZustand.zu=false;dockSpeichern()}dockAnwenden()});
for(const el of dock.children)if(el!==dockLasche)dockBeobachter.observe(el,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
if(window.ResizeObserver)new ResizeObserver(()=>freiraum()).observe(dock);
dockBereit=true;dockAnwenden();
window.__dock=()=>({zustand:{...dockZustand},frei:freiD,dock:dockRechteck(),modell:modellRechteck(),ueberlappt:modellUnterDock(),ansicht:[view.clientWidth,view.clientHeight]});
function wuerfelSync(){if(!vr)return;const dir=camera.position.clone().sub(controls.target);if(dir.lengthSq()<1e-8)dir.set(0,0,1);vc.position.copy(dir.normalize().multiplyScalar(2.7));vc.up.copy(camera.up);vc.lookAt(0,0,0);vr.render(vr.userData.vs,vc);
  const q=camera.quaternion.clone().invert();const set=(id,v)=>{const p=v.clone().applyQuaternion(q);const el=$(id);if(!el)return;el.style.left=(50+p.x*46)+'%';el.style.top=(50-p.y*46)+'%'};
  set('kN',new THREE.Vector3(0,0,-1));set('kO',new THREE.Vector3(1,0,0));set('kS',new THREE.Vector3(0,0,1));set('kW',new THREE.Vector3(-1,0,0))}
// Abstand fürs Einpassen; bei schmalem freiem Bereich (neben der Seitenleiste) zählt auch die freie Breite
function sichtDistanz(s){const tan35=Math.tan(35*Math.PI/360);const h=view.clientHeight||1,fa=Math.min(1,Math.max(0.2,((view.clientWidth||h)-freiD)/h));return s*1.7*(tan35/(Math.tan(camera.fov*Math.PI/360)*fa))}
function animSchritt(){const t=Math.min(1,(performance.now()-anim.t0)/anim.ms);const k=t*t*(3-2*t);
  const q=new THREE.Quaternion().setFromUnitVectors(anim.dirA,anim.dirB);const qi=new THREE.Quaternion().slerp(q,k);
  const dir=anim.dirA.clone().applyQuaternion(qi);const len=anim.aLen+(anim.bLen-anim.aLen)*k;const tar=anim.aTar.clone().lerp(anim.bTar,k);
  camera.position.copy(tar).add(dir.multiplyScalar(len));
  camera.up.copy(anim.aUp).lerp(anim.bUp,k);if(camera.up.lengthSq()<1e-6)camera.up.copy(anim.bUp);camera.up.normalize();
  const look=tar.clone().sub(camera.position);if(look.lengthSq()>1e-8){look.normalize();camera.up.addScaledVector(look,-camera.up.dot(look));if(camera.up.lengthSq()<1e-6)camera.up.copy(anim.bUp);camera.up.normalize()}
  camera.lookAt(tar);controls.target.copy(tar);controls.update();
  if(t>=1){camera.up.copy(anim.bUp);const look2=controls.target.clone().sub(camera.position).normalize();camera.up.addScaledVector(look2,-camera.up.dot(look2));if(camera.up.lengthSq()<1e-6)camera.up.set(0,1,0);camera.up.normalize();camera.lookAt(controls.target);controls.update();anim=null}
  needs=true}
(function loop(){requestAnimationFrame(loop);
  if(anim)animSchritt();
  else{if(drehen&&model){const achse=new THREE.Vector3(0,1,0);const off=camera.position.clone().sub(controls.target).applyAxisAngle(achse,0.005);camera.position.copy(controls.target).add(off);camera.up.applyAxisAngle(achse,0.005);needs=true}controls.update()}
  if(needs||drehen){const tB=ersteZeichnung?performance.now():0;if(triade&&triade.visible)triadeSkalieren();renderer.render(scene,camera);drawDims();wuerfelSync();needs=false;
    if(ersteZeichnung){const st=window.__ladeStufen;if(st){st.erstesBild=Math.round(performance.now()-tB);st.bisErstesBild=Math.round(performance.now()-ersteZeichnung)}ersteZeichnung=0}}})();

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
const views={};for(const [n,a] of Object.entries(ANSICHT))views[n]=new THREE.Vector3(...a.d);
function fit(dir){anim=null;if(!model)return;const s=box.getSize(new THREE.Vector3()).length()||1,c=box.getCenter(new THREE.Vector3());
  let d;if(dir)d=dir.clone();else{d=camera.position.clone().sub(controls.target);if(d.lengthSq()<1e-8)d=new THREE.Vector3(.8,.6,1)}
  d.normalize();camera.near=s/2000;camera.far=s*100;
  if(dir){camera.up.set(0,1,0);if(Math.abs(d.y)>.99)camera.up.set(0,0,-1)}
  camera.position.copy(c).add(d.multiplyScalar(sichtDistanz(s)));camera.updateProjectionMatrix();controls.target.copy(c);controls.update();needs=true}
function animiere(dir,up){if(!model)return;const s=box.getSize(new THREE.Vector3()).length()||1,c=box.getCenter(new THREE.Vector3());
  const d=dir.clone();if(d.lengthSq()<1e-8)d.set(.8,.6,1);d.normalize();const bUp=up.clone().normalize();
  camera.near=s/2000;camera.far=s*100;camera.updateProjectionMatrix();
  const bPos=c.clone().add(d.multiplyScalar(sichtDistanz(s)));const aPos=camera.position.clone(),aTar=controls.target.clone();
  const aOff=aPos.clone().sub(aTar),bOff=bPos.clone().sub(c);
  let dirA=aOff.clone();if(dirA.lengthSq()<1e-8)dirA=d.clone();dirA.normalize();const dirB=bOff.clone().normalize();
  anim={t0:performance.now(),ms:420,aOff,bOff,aTar,bTar:c.clone(),aUp:camera.up.clone(),bUp,aLen:Math.max(aOff.length(),s*0.2),bLen:bOff.length(),dirA,dirB};needs=true}
function animiereAnsicht(name){const a=ANSICHT[name];if(a)animiere(new THREE.Vector3(...a.d),new THREE.Vector3(...a.up))}
function naechsteAchse(v,sperre){let best=null,bd=-Infinity;for(const a of ACHSEN){if(sperre&&Math.abs(a.dot(sperre))>0.85)continue;const d=v.dot(a);if(d>bd){bd=d;best=a}}return (best||ACHSEN[0]).clone()}
function upSenkrecht(dir,bevorzugt){const d=dir.clone().normalize();const p=(bevorzugt||camera.up).clone().addScaledVector(d,-d.dot(bevorzugt||camera.up));if(p.lengthSq()<1e-8)p.set(0,0,-1);p.normalize();
  if(Math.abs(d.y)>0.9)return new THREE.Vector3(0,0,-1);
  let best=null,bd=Math.cos(28*Math.PI/180);for(const a of ACHSEN){if(Math.abs(a.dot(d))>0.2)continue;const dot=p.dot(a);if(dot>bd){bd=dot;best=a}}return best?best.clone():p}
function f9(){if(!model)return;const blick=camera.position.clone().sub(controls.target);if(blick.lengthSq()<1e-8)return;const dir=naechsteAchse(blick.normalize());animiere(dir,naechsteAchse(camera.up,dir))}
function flaechenNormalWelt(s){const B=bodies[s.inst??0];if(!B?.geometry?.userData?.face)return null;const fa=B.geometry.userData.face,pos=B.geometry.attributes.position.array;
  const n=new THREE.Vector3(),mid=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let cnt=0;
  for(let t=0;t<fa.length;t++){if(fa[t]!==s.id)continue;a.fromArray(pos,t*9);b.fromArray(pos,t*9+3);c.fromArray(pos,t*9+6);n.add(b.clone().sub(a).cross(c.clone().sub(a)));mid.add(a).add(b).add(c);cnt++}
  if(!cnt||n.lengthSq()<1e-12)return null;mid.multiplyScalar(1/(cnt*3));n.normalize();n.applyMatrix3(new THREE.Matrix3().getNormalMatrix(B.matrixWorld)).normalize();
  const welt=B.localToWorld(mid);if(n.dot(welt.sub(box.getCenter(new THREE.Vector3())))<0)n.negate();return n}
function f10(){if(!model)return;const face=[...sels].reverse().find(s=>s.k==='face');if(!face){animiereAnsicht('iso');return}const n=flaechenNormalWelt(face);if(!n){animiereAnsicht('iso');return}animiere(n,upSenkrecht(n,camera.up))}
function setStil(stil){const draht=stil==='draht',kanten=stil==='kanten'||draht;$('showEdges').checked=stil==='kanten';if($('stilWahl'))$('stilWahl').value=stil;
  edgeObjs.forEach(e=>e.visible=kanten);if(baseMat){baseMat.transparent=draht;baseMat.opacity=draht?0.04:1;baseMat.depthWrite=!draht;baseMat.needsUpdate=true}needs=true}
function setWerkzeug(w){werkzeug=w;document.querySelectorAll('[data-werkzeug]').forEach(b=>b.classList.toggle('on',b.dataset.werkzeug===w));
  const mb={LEFT:null,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};
  if(w==='schwenk')mb.LEFT=THREE.MOUSE.PAN;if(w==='drehen')mb.LEFT=THREE.MOUSE.ROTATE;if(w==='zoom')mb.LEFT=THREE.MOUSE.DOLLY;controls.mouseButtons=mb}
$('fit').onclick=()=>{if(!model)return;let d=camera.position.clone().sub(controls.target);if(d.lengthSq()<1e-8)d=new THREE.Vector3(.8,.6,1);animiere(d,camera.up.clone())};
$('showEdges').onchange=()=>setStil($('showEdges').checked?'kanten':'schattiert');

// ---------- Laden ----------
// Fortschritt des nativen Kerns (Zeilen „STUFE …“, von der Desktop-App weitergereicht)
const KERN_STUFE={lesen:'Datei wird gelesen …',uebersetzen:'Geometrie wird übersetzt …',heilen:'Geometrie wird aufbereitet …',tessellieren:'Darstellung wird berechnet …'};
window.__kernStufe=(name,k,n)=>{const t=KERN_STUFE[name];if(!t||$('busy').style.display!=='block')return;const txt=n>0?`${t} ${Math.round(100*k/n)} %`:t;$('busy').textContent=txt;$('status').textContent=txt};
async function load(buf,name,opt){
  const t0=performance.now();const stufen={};let tS=t0;const stufe=k=>{const n=performance.now();stufen[k]=Math.round(n-tS);tS=n};window.__ladeStufen=stufen;$('status').textContent='Lade '+name+' …';$('drop').style.display='none';const hinweis=$('dropHint');if(hinweis)hinweis.hidden=true;$('busy').style.display='block';$('busy').textContent='Datei wird geladen …';
  let size=buf?buf.byteLength:0;
  // Desktop-App: zuerst der native Kern (schnell, mehrere Threads); bei Fehlern oder im Browser der WASM-Kern
  const inv=window.__TAURI_INTERNALS__?.invoke;let nativ=false;
  try{
    if(inv&&localStorage.getItem('kern')!=='wasm'&&await inv('kern_verfuegbar').catch(()=>false)){
      try{$('busy').textContent='Datei wird geladen …';
        // Pfad: Kern und Lesen der Rohdaten (Einheit, Teilenamen) laufen gleichzeitig
        let bin;if(opt&&opt.pfad){const r=await Promise.all([inv('kern_laden_pfad',{pfad:opt.pfad}),opt.roh]);bin=r[0];buf=r[1];size=buf.byteLength}
        else bin=await inv('kern_laden',new Uint8Array(buf),{headers:{'x-name':encodeURIComponent(name)}});
        stufe('kern');$('busy').textContent='Modell wird angezeigt …';data=await call('loadNative',{bin,step:buf,name},[bin]);nativ=true;stufe('worker')}
      catch(e){console.warn('Nativer Kern fehlgeschlagen, WASM-Kern übernimmt:',e);$('busy').textContent='Nativer Kern nicht verfügbar – WASM-Kern lädt …'}}
    if(!nativ){if(!buf&&opt&&opt.roh){buf=await opt.roh;size=buf.byteLength}data=await call('load',{buf,name},[buf])}
  }finally{$('busy').style.display='none'}
  data.kernArt=nativ?'nativ':'wasm';data.modelAlle=data.model;
  U=data.unit;
  if(triade)triade.removeFromParent();
  if(model){scene.remove(model);model.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.()})}
  model=new THREE.Group();model.rotation.x=-Math.PI/2;bodies=[];
  $('status').textContent='Szene wird aufgebaut …';stufe('vorSzene');
  transpMat=null;baseMat=new THREE.MeshStandardMaterial({color:0xb9bec7,metalness:.15,roughness:.5,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  const edgeMat=new THREE.LineBasicMaterial({color:0x2a2d33});
  // Ein Netz pro Einzelteil (Unikat), Instanzen teilen sich die Geometrie
  const geos=data.uniq.map(u=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(u.p,3));g.setIndex(new THREE.BufferAttribute(u.i,1));
    const g2=g.toNonIndexed();g.dispose();g2.computeVertexNormals();g2.userData.face=u.f;
    const seg=[],segE=[];u.edges.forEach((e,i)=>{for(let k=1;k<e.pts.length;k++){seg.push(...e.pts[k-1],...e.pts[k]);segE.push(i)}});
    const eg=new THREE.BufferGeometry();eg.setAttribute('position',new THREE.Float32BufferAttribute(seg,3));eg.userData.edge=segE;return {g:g2,eg}});
  stufe('netze');edgeObjs=[];
  data.inst.forEach((I,i)=>{const mesh=new THREE.Mesh(geos[I.u].g,baseMat);const m=I.m;mesh.matrixAutoUpdate=false;
    mesh.matrix.set(m[0],m[1],m[2],m[3],m[4],m[5],m[6],m[7],m[8],m[9],m[10],m[11],0,0,0,1);mesh.name=I.name;mesh.userData.inst=i;mesh.userData.u=I.u;
    const el=new THREE.LineSegments(geos[I.u].eg,edgeMat);el.userData.inst=i;el.visible=$('showEdges').checked;mesh.add(el);edgeObjs.push(el);
    model.add(mesh);bodies.push(mesh)});
  model.add(marks);model.add(hoverObj);wahlMark=new THREE.Group();model.add(wahlMark);festMark=new THREE.Group();model.add(festMark);rissMark=new THREE.Group();model.add(rissMark);if(triade)model.add(triade);
  fest=null;festWahl=false;festAnzeigen();riss=[];rissAnzeigen(null);faltObj=null;faltNetzCache=null;if(faltLauf){cancelAnimationFrame(faltLauf);faltLauf=null}$('faltRegler').disabled=$('faltPlay').disabled=true;$('faltAus').hidden=true;huelle=null;huellObj=null;spObj=null;$('huellinfo').innerHTML='';$('schwerpunktZeigen').checked=false;
  ursprung=data.inst.map(I=>I.m.slice());undoStapel=[];redoStapel=[];isoSnap=null;selNode=null;selMenge=new Set();selAnker=null;bewegenOffen=false;
  stufe('instanzen');scene.add(model);model.updateMatrixWorld(true);box.setFromObject(model);stufe('box');
  vIdx=new Map();
  buildTree();clearSel();hov=null;hoverObj.clear();$('snaptip').hidden=true;dims=[];dimSel=null;$('dimedit').hidden=true;dimNo=0;lastRes=null;renderDims();sheetSolid=null;fit(views.iso);setCut();showModel();zeigeReiter(name);sheetCache=null;$('sheeterr').innerHTML='';$('sheetinfo').innerHTML='';$('bends').innerHTML='';$('flatprev').innerHTML='';$('dxf').disabled=true;$('sheetwarn').textContent='';
  stufe('baumUndPanel');if(!$('tab-blech').hidden)calcSheet();
  ersteZeichnung=performance.now();needs=true;
  const ms=Math.round(performance.now()-t0);const tris=data.inst.reduce((s,I)=>s+data.uniq[I.u].i.length/3,0);
  const info={name,bytes:size,bodies:data.inst.length,unique:data.uniq.length,faces:data.model.faces,edges:data.model.edges,triangles:tris,totalMs:ms,unit:U.sym,times:data.times,stats:data.stats};window.__lastLoad=info;
  info.kern=data.kernArt;
  $('status').textContent=`${name} · ${(size/1024).toFixed(0)} KB · ${info.bodies} Körper · ${info.faces} Flächen · Datei: ${U.sym} → Anzeige: mm · ${ms} ms${nativ?' · Messdaten werden vorbereitet …':''}`;
  if(nativ){const st=$('status').textContent;window.__messBereit=inv('kern_brep').then(text=>call('attach',{text})).then(a=>{info.attachMs=a.ms;if($('status').textContent===st)$('status').textContent=st.replace(' · Messdaten werden vorbereitet …',' · nativer Kern')})
    .catch(e=>{$('status').textContent=st.replace(' · Messdaten werden vorbereitet …',' · Messen nicht verfügbar: '+(e.message||e))})}
  return info}
function puffer(roh){if(roh instanceof ArrayBuffer)return roh;if(ArrayBuffer.isView(roh))return roh.buffer.slice(roh.byteOffset,roh.byteOffset+roh.byteLength);if(Array.isArray(roh))return new Uint8Array(roh).buffer;throw new Error('Datei konnte nicht gelesen werden')}
async function loadPath(pfad){
  const name=String(pfad).split(/[/\\]/).pop()||String(pfad);
  if(!/\.(step|stp)$/i.test(name)){$('status').textContent='Nur STEP-Dateien (.step, .stp)';return}
  const inv=window.__TAURI_INTERNALS__?.invoke;
  if(!inv)throw new Error('Öffnen per Pfad nur in der Desktop-App');
  const tL=performance.now();window.__ladeStart=tL;
  const roh=inv('datei_lesen',{pfad}).then(r=>{window.__dateiLesenMs=Math.round(performance.now()-tL);return puffer(r)});roh.catch(()=>{});
  return load(null,name,{pfad,roh})}
let laufPfad=null;
async function oeffnePfad(pfad){if(!pfad||laufPfad===pfad)return;laufPfad=pfad;try{await loadPath(pfad)}catch(e){$('status').textContent=e.message||String(e)}finally{setTimeout(()=>{if(laufPfad===pfad)laufPfad=null},1500)}}
window.__oeffnePfad=oeffnePfad;
window.__dateiZiehen=an=>{const h=$('dropHint');if(h)h.hidden=!an};
{const inv=window.__TAURI_INTERNALS__?.invoke;if(inv)inv('start_pfad').then(p=>{if(p)oeffnePfad(p)}).catch(()=>{})}
const key=p=>p.map(x=>x.toFixed(5)).join(',');let vIdx=new Map();
const vIndexOf=u=>{if(!vIdx.has(u)){const m=new Map();data.uniq[u].verts.forEach((p,i)=>m.set(key(p),i));vIdx.set(u,m)}return vIdx.get(u)};
const toModel=(i,p)=>V3(p).applyMatrix4(bodies[i].matrix).toArray();
// ---------- Baugruppenbaum ----------
let transpMat=null,treeRoot=null,nodes=[],selNode=null,sheetSolid=null;
let selMenge=new Set(),selAnker=null,isoSnap=null,ursprung=[],undoStapel=[],redoStapel=[],bewegenOffen=false,letzteMaus=null;
function buildTree(){treeRoot=data.tree;nodes=[];let id=0;
  const prep=(n,parent,depth)=>{n.id=id++;n.parent=parent;n.depth=depth;n.checked=true;n.open=depth<2;n.transp=false;nodes.push(n);n.children.forEach(c=>prep(c,n,depth+1));
    n.all=[...n.bodies,...n.children.flatMap(c=>c.all)];return n};
  prep(treeRoot,null,0);renderTree()}
const isAsm=n=>n.children.length>0;
const ICON={eye:'<svg viewBox="0 0 16 16"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  eyeOff:'<svg viewBox="0 0 16 16"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor"/><path d="M3 13 13 3" stroke="currentColor"/></svg>',
  iso:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  zoom:'<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor"/><path d="M10.5 10.5 14 14" stroke="currentColor"/></svg>',
  info:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor"/><path d="M8 7v4M8 5v.5" stroke="currentColor"/></svg>',
  asm:`<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="6" height="6" fill="${MARKE.akzent}"/><rect x="8.5" y="8.5" width="6" height="6" fill="${MARKE.akzent}"/><rect x="8.5" y="1.5" width="6" height="6" fill="none" stroke="${MARKE.akzent}"/></svg>`,
  part:'<svg viewBox="0 0 16 16"><path d="M8 1.5 14 5v6l-6 3.5L2 11V5z" fill="#c9ced6" stroke="#6e6e73"/></svg>'};
function baumTreffer(q){const match=n=>!q||n.name.toLowerCase().includes(q)||n.children.some(match);return match}
function sichtbareReihenfolge(){const q=$('treeSearch').value.trim().toLowerCase();const match=baumTreffer(q);const out=[];
  const walk=n=>{if(!match(n))return;out.push(n);if(isAsm(n)&&(n.open||q))n.children.forEach(walk)};walk(treeRoot);return out}
function renderTree(){const q=$('treeSearch').value.trim().toLowerCase();const tree=$('tree');tree.innerHTML='';
  const match=baumTreffer(q);
  const ul=document.createElement('ul');
  const add=(n,ul)=>{if(!match(n))return;const li=document.createElement('li');const row=document.createElement('div');
    const gewaehlt=selMenge.has(n)||selNode===n;const aus=!visible(n);
    row.className='trow'+(gewaehlt?' sel':'')+(aus?' aus':'')+(q&&n.name.toLowerCase().includes(q)?' hit':'');row.dataset.id=n.id;
    row.innerHTML=`<span class="tw">${isAsm(n)?(n.open||q?'▾':'▸'):''}</span><input type="checkbox" title="Sichtbarkeit" ${n.checked?'checked':''}><span class="ic">${isAsm(n)?ICON.asm:ICON.part}</span><span class="nm" title="${esc(n.name)}">${esc(n.name)}</span><span class="acts"><button data-a="toggle" title="${n.checked?'Ausblenden':'Einblenden'}">${n.checked?ICON.eye:ICON.eyeOff}</button><button data-a="isolate" title="Nur dieses anzeigen">${ICON.iso}</button><button data-a="zoom" title="Heranzoomen">${ICON.zoom}</button><button data-a="props" title="Eigenschaften">${ICON.info}</button></span>`;
    row.querySelector('.tw').onclick=e=>{e.stopPropagation();n.open=!n.open;renderTree()};
    row.querySelector('input').onclick=e=>e.stopPropagation();row.querySelector('input').onchange=e=>{n.checked=e.target.checked;if(n.checked)for(let p=n.parent;p;p=p.parent)p.checked=true;applyVis();renderTree();triadeAktualisieren()};
    row.querySelectorAll('.acts button').forEach(b=>b.onclick=e=>{e.stopPropagation();act(b.dataset.a,n)});
    row.onclick=e=>{if(e.target.closest('button,input,.tw'))return;if(e.shiftKey||e.ctrlKey||e.metaKey)mehrfach(n,e);else selectNode(n,true)};
    row.oncontextmenu=e=>{e.preventDefault();if(!selMenge.has(n))selectNode(n,true);else{selNode=n;renderTree()}ctxMenu(e.clientX,e.clientY,n)};
    li.append(row);ul.append(li);
    if(isAsm(n)&&(n.open||q)){const sub=document.createElement('ul');n.children.forEach(c=>add(c,sub));li.append(sub)}};
  add(treeRoot,ul);tree.append(ul);triadeAktualisieren()}
function mehrfach(n,e){
  if(e.shiftKey&&selAnker){const liste=sichtbareReihenfolge();let a=liste.indexOf(selAnker),b=liste.indexOf(n);if(a<0)a=b;if(b<0)return;
    selMenge=new Set(liste.slice(Math.min(a,b),Math.max(a,b)+1));selNode=n}
  else{if((e.ctrlKey||e.metaKey)&&selMenge.has(n))selMenge.delete(n);else selMenge.add(n);selNode=n;selAnker=n}
  renderTree();hervorheben()}
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
$('treeSearch').oninput=()=>renderTree();
function visible(n){for(let x=n;x;x=x.parent)if(!x.checked)return false;return true}
function applyVis(){const vis=new Array(bodies.length).fill(false);
  const walk=n=>{if(visible(n))n.bodies.forEach(b=>vis[b]=true);n.children.forEach(walk)};if(treeRoot)walk(treeRoot);
  bodies.forEach((b,i)=>b.visible=vis[i]);hoverObj.clear();hervorheben();needs=true;modellAktualisieren()}
// Ausgeblendete Bauteile zählen nicht zu Volumen, Oberfläche, Masse und Schwerpunkt (wie ZW3D „Mass Properties“)
let modellSeq=0;
async function modellAktualisieren(){if(!data||!bodies.length)return;const ids=bodies.map((b,i)=>b.visible?i:-1).filter(i=>i>=0);const nr=++modellSeq;
  if(ids.length===bodies.length&&data.modelAlle){data.model=data.modelAlle;showModel();return}
  try{const q=await call('modell',{ids,schnell:data.kernArt==='nativ'||bodies.length>50});if(nr!==modellSeq)return;data.model=q;showModel()}catch(e){console.warn(e)}}
const nodeOfBody=i=>{let best=null;nodes.forEach(n=>{if(n.bodies.includes(i))best=n});return best};
function selectNode(n){selNode=n;selMenge=n?new Set([n]):new Set();selAnker=n;sels=[];marks.clear();$('selinfo').textContent='';$('mresult').innerHTML='';
  if(n)for(let x=n.parent;x;x=x.parent)x.open=true;
  renderTree();hervorheben();const row=document.querySelector(`.trow[data-id="${n?.id}"]`);row?.scrollIntoView({block:'nearest'});needs=true}
function hervorheben(){if(!wahlMark)return;wahlMark.clear();const ids=zielIds().filter(i=>bodies[i]?.visible);wahlMark.userData.ids=ids;if(ids.length)wahlMark.add(bodyHi(ids,0x1f8fd0));needs=true}
function bodyHi(ids,color){const g=new THREE.Group();const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.45,depthTest:true,side:THREE.DoubleSide,clippingPlanes:renderer.localClippingEnabled?[plane]:[]});ids.forEach(i=>{const b=bodies[i];if(!b.visible)return;const m=new THREE.Mesh(b.geometry,mat);m.matrixAutoUpdate=false;m.matrix.copy(b.matrix);m.renderOrder=5;g.add(m)});return g}
function boxOf(ids){const b=new THREE.Box3();ids.forEach(i=>{if(bodies[i].visible)b.expandByObject(bodies[i])});return b}
function zielKnoten(){const ns=[...selMenge].filter(Boolean);if(!ns.length&&selNode)ns.push(selNode);return ns}
function zielIds(){return [...new Set(zielKnoten().flatMap(n=>n.all||[]))]}
function umkehren(){const alt=new Map(nodes.map(n=>[n,visible(n)]));
  const braucht=n=>!alt.get(n)||n.children.some(braucht);
  const setz=n=>{if(alt.get(n)&&!n.children.some(braucht)){n.checked=false;return}n.checked=true;n.children.forEach(setz)};
  if(treeRoot)setz(treeRoot)}
async function act(a,n){
  if(a==='toggle'){const ziel=n&&selMenge.has(n)&&selMenge.size?[...selMenge]:[n];const wert=!n.checked;ziel.forEach(x=>{x.checked=wert;if(wert)for(let p=x.parent;p;p=p.parent)p.checked=true});applyVis();renderTree()}
  if(a==='isolate'){isoSnap=nodes.map(x=>[x.id,x.checked]);nodes.forEach(x=>x.checked=false);for(let x=n;x;x=x.parent)x.checked=true;const on=x=>{x.checked=true;x.children.forEach(on)};on(n);applyVis();renderTree();zoomTo(n)}
  if(a==='isoEnde'){if(!isoSnap)return;const map=new Map(isoSnap);nodes.forEach(x=>{if(map.has(x.id))x.checked=map.get(x.id)});isoSnap=null;applyVis();renderTree()}
  if(a==='showall'){isoSnap=null;nodes.forEach(x=>x.checked=true);applyVis();renderTree()}
  if(a==='invert'){umkehren();applyVis();renderTree()}
  if(a==='transp'){const ziel=n&&selMenge.has(n)&&selMenge.size?[...selMenge]:[n];const an=!n.transp;if(!transpMat){transpMat=baseMat.clone();transpMat.transparent=true;transpMat.opacity=.3;transpMat.depthWrite=false}ziel.forEach(x=>{x.transp=an;x.all.forEach(i=>{if(bodies[i])bodies[i].material=an?transpMat:baseMat})});needs=true;renderTree()}
  if(a==='zoom')zoomTo(n);
  if(a==='move'){bewegenOffen=true;if($('bewegenPanel'))$('bewegenPanel').hidden=false;triadeAktualisieren()}
  if(a==='measure'){tabTo('messen');if(n.all.length===1){clearSel();await select({k:'solid',inst:n.all[0]})}else{$('selinfo').textContent='Messen: bitte ein einzelnes Teil wählen.'}}
  if(a==='props')showProps(n);
  if(a==='sheet'){if(n.all.length!==1)return;sheetSolid=n.all[0];tabTo('blech');await calcSheet()}}
function zoomTo(n){const b=boxOf(n.all);if(b.isEmpty())return;const s=b.getSize(new THREE.Vector3()).length(),c=b.getCenter(new THREE.Vector3());
  const d=camera.position.clone().sub(controls.target).normalize();camera.position.copy(c).add(d.multiplyScalar(s*1.6));controls.target.copy(c);controls.update();needs=true}
function ctxMenu(x,y,n,items,run){closeCtx();const m=document.createElement('div');m.id='ctx';
  const one=n?n.all.length===1:false;
  items=items||[['toggle',n.checked?'Ausblenden':'Einblenden'],['isolate','Nur dieses anzeigen'],['isoEnde','Isolieren beenden',!isoSnap],['showall','Alle einblenden'],['invert','Ausgeblendete umkehren'],['-'],['transp',n.transp?'Undurchsichtig':'Transparent'],['move','Komponente verschieben'],['zoom','Heranzoomen'],['-'],['measure','Messen',!one],['props','Eigenschaften'],['sheet','Blech-Abwicklung',!one]];
  run=run||(a=>act(a,n));
  m.innerHTML=items.map(([a,t,dis])=>a==='-'?'<hr>':`<button data-a="${a}" ${dis?`disabled title="${a==='isoEnde'?'Zuerst „Nur dieses anzeigen“':'Nur bei genau einem Körper'}"`:''}>${t}</button>`).join('');
  m.style.left=x+'px';m.style.top=y+'px';document.body.append(m);
  const r=m.getBoundingClientRect();if(r.bottom>innerHeight)m.style.top=Math.max(0,y-r.height)+'px';if(r.right>innerWidth)m.style.left=Math.max(0,x-r.width)+'px';
  m.querySelectorAll('button').forEach(b=>b.onclick=()=>{closeCtx();run(b.dataset.a)})}
// Kontextmenü in der 3D-Ansicht (wie eDrawings): Rechtsklick ohne Ziehen öffnet das Menü, mit Ziehen wird geschwenkt
function viewMenu(x,y){const s=pickAt(x,y);const n=s&&s.body?nodeOfBody(s.body.userData.inst):null;
  if(n){const one=n.all.length===1;selNode=n;selMenge=new Set([n]);selAnker=n;renderTree();
    ctxMenu(x,y,n,[['toggle','Ausblenden'],['isolate','Nur dieses anzeigen'],['isoEnde','Isolieren beenden',!isoSnap],['showall','Alle einblenden'],['invert','Ausgeblendete umkehren'],['transp',n.transp?'Undurchsichtig':'Transparent'],['move','Komponente verschieben'],['zoom','Heranzoomen'],['tree','Im Baum zeigen'],['-'],['measureHere','Messen ab hier'],['props','Eigenschaften'],['-'],['sheet','Blech-Abwicklung',!one],['bendtab','Biegetabelle',!one]],
      async a=>{if(a==='tree'){selectNode(n);$('tree').querySelector(`.trow[data-id="${n.id}"]`)?.scrollIntoView({block:'center'})}
        else if(a==='measureHere'){tabTo('messen');clearSel();await select(s,false)}
        else if(a==='bendtab'){await act('sheet',n);$('bends').scrollIntoView({block:'start'})}
        else act(a,n)});return}
  const cutOn=!!$('axis').value;
  ctxMenu(x,y,null,[['showall','Alle einblenden'],['invert','Ausgeblendete umkehren'],['fit','Ansicht einpassen'],['-'],['vorne','Vorne'],['hinten','Hinten'],['links','Links'],['rechts','Rechts'],['oben','Oben'],['unten','Unten'],['iso','Iso'],['-'],['cut',cutOn?'Schnitt aus':'Schnitt ein'],['dims','Alle Bemaßungen löschen',!dims.length],['shot','Screenshot speichern …']],
    a=>{if(a==='showall')act('showall');if(a==='invert')act('invert');
      if(a==='fit'){$('fit').click()}if(views[a])animiereAnsicht(a);
      if(a==='cut'){$('axis').value=cutOn?'':(lastAxis||'X');setCut()}
      if(a==='dims'){dims=[];renderDims()}
      if(a==='shot')screenshot()})}
let lastAxis='';$('axis').addEventListener('change',()=>{if($('axis').value)lastAxis=$('axis').value});
async function screenshot(){const url=ansichtBild().toDataURL('image/png');
  const bin=atob(url.split(',')[1]);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  const name=(window.__lastLoad?.name||'ansicht').replace(/\.(step|stp)$/i,'')+'-ansicht.png';await saveBytes(name,bytes,'PNG-Bild','png','image/png')}
let rdown=null;
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===2)rdown=[e.clientX,e.clientY]});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('pointerup',e=>{if(e.button!==2||!rdown)return;const moved=Math.hypot(e.clientX-rdown[0],e.clientY-rdown[1])>4;rdown=null;if(!moved&&model)viewMenu(e.clientX,e.clientY)});
const closeCtx=()=>document.getElementById('ctx')?.remove();addEventListener('pointerdown',e=>{if(!e.target.closest('#ctx'))closeCtx();if(!e.target.closest('.menu')&&!e.target.closest('#exportMenue')&&!e.target.closest('#exportKnopf'))menueZu()});addEventListener('keydown',e=>{if(e.key==='Escape'){const offen=!!document.getElementById('ctx')||!$('props').hidden||!$('einstDlg').hidden||!$('hilfeDlg').hidden||!!document.querySelector('.menu.offen,.menu.open');
  closeCtx();$('props').hidden=true;$('einstDlg').hidden=true;$('hilfeDlg').hidden=true;menueZu();if(offen)e.hasiDialogZu=true}});
async function showProps(n){const sicht=n.all.filter(i=>bodies[i]?.visible);const ids=sicht.length?sicht:n.all;const q=await call('props',{ids});const d=parseFloat($('dens').value)||0;const s=V3(q.bbox.max).sub(V3(q.bbox.min));
  $('propsTitle').textContent='Eigenschaften: '+n.name;const aus=n.all.length-sicht.length;
  kv($('propsBody'),[['Typ',isAsm(n)?'Baugruppe':'Teil'],['Körper',q.bodies],...(sicht.length&&aus?[['Ausgeblendet (nicht gerechnet)',aus+' Körper']]:[]),...(!sicht.length?[['Hinweis','Teil ist ausgeblendet – Werte des ausgeblendeten Teils']]:[]),['Volumen',q.volume,'V'],['Oberfläche',q.area,'A'],['Dichte',nf(d,2)+' g/cm³'],['Masse',q.volume/1000*d,'M'],['Bounding-Box X',s.x,'L'],['Bounding-Box Y',s.y,'L'],['Bounding-Box Z',s.z,'L']]);
  $('props').hidden=false;window.__lastProps=q;return q}
$('propsClose').onclick=()=>$('props').hidden=true;
const tabTo=n=>document.querySelector(`.tab[data-tab="${n}"]`).click();
function showModel(){const m=data.model,s=isFinite(m.bbox.min[0])?V3(m.bbox.max).sub(V3(m.bbox.min)):new THREE.Vector3();
  kv($('modelinfo'),[['Einheit der Datei',U.name],['Anzeige','Millimeter'],...(m.ausgeblendet?[['Ausgeblendet (nicht gerechnet)',m.ausgeblendet+' Körper']]:[]),['Körper',m.solids],['Flächen',m.faces],['Kanten',m.edges],['Bounding-Box X',s.x,'L'],['Bounding-Box Y',s.y,'L'],['Bounding-Box Z',s.z,'L'],[m.approx?'Volumen (≈, Netz)':'Volumen',m.volume,'V'],[m.approx?'Oberfläche (≈, Netz)':'Oberfläche',m.area,'A'],['Schwerpunkt',m.centroid,'P'],...(m.unique&&m.unique!==m.solids?[['Einzelteile (Unikate)',m.unique]]:[])]);showMass()}
const V3=a=>new THREE.Vector3(...a);
function showMass(){if(!data)return;const d=parseFloat($('dens').value)||0;kv($('massinfo'),[['Volumen',data.model.volume,'V'],['Dichte',nf(d,2)+' g/cm³'],['Masse',data.model.volume/1000*d,'M']])}
$('mat').onchange=()=>{if($('mat').value!=='custom')$('dens').value=$('mat').value;showMass()};
// ---------- Hüllquader, Rohmaß, Schwerpunkt, Messprotokoll ----------
let huelle=null,huellObj=null,spObj=null;
const sichtbareIds=()=>bodies.map((b,i)=>b.visible||b.userData.faltVersteckt?i:-1).filter(i=>i>=0);
const huellBezug=()=>sels.find(x=>x.k==='face'||x.k==='edge'||x.k==='axis');
async function huelleRechnen(art){if(!data)return null;art=art||$('huellArt').value;$('huellArt').value=art;const bez=huellBezug();
  if(art==='bezug'&&!bez){$('status').textContent='Bitte zuerst eine ebene Fläche oder eine Kante als Bezug wählen.';return null}
  const ids=sichtbareIds(),netze={};ids.forEach(i=>{const u=data.inst[i].u;netze[u]=data.uniq[u].p});
  const r=await call('huelle',{opts:{ids,netze,bezug:bez?{k:bez.k,id:bez.id,inst:bez.inst??0}:null}});huelle=r;window.__huelle=r;
  if(!r.ok){$('huellinfo').innerHTML=`<div>Hinweis</div><div>${r.msg}</div>`;return r}
  const q=art==='bezug'?r.bezug:art==='achsparallel'?r.achsparallel:r.minimal;const name={minimal:'Hüllquader minimal',bezug:'Hüllquader gedreht',achsparallel:'Hüllquader achsparallel'}[art];
  const rows=[];if(art==='bezug'&&r.bezugFehler)rows.push(['Hinweis',r.bezugFehler]);
  if(q){rows.push([name+' L',q.sortiert[0],'L',true],[name+' B',q.sortiert[1],'L'],[name+' H',q.sortiert[2],'L'],['Quadervolumen',q.volumen,'V']);if(q.name)rows.push(['Bezug',q.name])}
  const z=r.rohmass.zylinder,b=r.rohmass.block;
  rows.push(['Rohmaß Block',`${nf(b.masse[0],PREC)} × ${nf(b.masse[1],PREC)} × ${nf(b.masse[2],PREC)} mm`]);if(z)rows.push(['Rohmaß Zylinder',`Ø ${nf(z.d,PREC)} × ${nf(z.l,PREC)} mm`]);
  rows.push(['Rohmaß Empfehlung',r.rohmass.empfehlung+' (kleineres Volumen)']);
  kv($('huellinfo'),rows);huellZeichnen(q);return r}
function huellZeichnen(q){if(huellObj){huellObj.removeFromParent();huellObj.geometry.dispose();huellObj=null}if(!q||!$('huellZeigen').checked||!model){needs=true;return}
  const E=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]],a=[];E.forEach(([i,j])=>a.push(...q.ecken[i],...q.ecken[j]));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));huellObj=new THREE.LineSegments(g,new THREE.LineDashedMaterial({color:0xe07b00,dashSize:3,gapSize:2,depthTest:false,transparent:true}));
  huellObj.computeLineDistances();huellObj.renderOrder=5;model.add(huellObj);needs=true}
function schwerpunktZeigen(){if(spObj){spObj.removeFromParent();spObj.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.()});spObj=null}
  if(!$('schwerpunktZeigen').checked||!data||!model){needs=true;return null}const c=data.model.centroid,s=(box.getSize(new THREE.Vector3()).length()||100)*0.012;
  spObj=new THREE.Group();const m=new THREE.MeshBasicMaterial({color:0xd81b60,depthTest:false,transparent:true});const k=new THREE.Mesh(new THREE.SphereGeometry(s,20,14),m);k.renderOrder=6;spObj.add(k);
  const a=[];for(let j=0;j<3;j++){const e=[0,0,0];e[j]=s*3;a.push(-e[0],-e[1],-e[2],...e)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));
  const l=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xd81b60,depthTest:false,transparent:true}));l.renderOrder=6;spObj.add(l);spObj.position.set(...c);spObj.userData.schwerpunkt=c;model.add(spObj);needs=true;return c}
$('huellRechnen').onclick=()=>huelleRechnen();$('huellArt').onchange=()=>{if(huelle)huelleRechnen()};
$('huellZeigen').onchange=()=>{if(huelle){const a=$('huellArt').value;huellZeichnen(a==='bezug'?huelle.bezug:a==='achsparallel'?huelle.achsparallel:huelle.minimal)}};
$('schwerpunktZeigen').onchange=()=>schwerpunktZeigen();
const EINHEIT={L:'mm',W:'°',A:'mm²',V:'mm³',M:'g'};
async function protokollDatenSammeln(){if(!data)return null;if(!huelle||!huelle.ok)await huelleRechnen($('huellArt').value==='bezug'&&!huellBezug()?'minimal':$('huellArt').value);
  const d=parseFloat($('dens').value)||0;const m=data.model;
  const wert=(v,k)=>k==='P'?v.map(x=>nf(x,PREC)).join(' / '):k==='M'?v:typeof v==='number'?v:v;
  const bem=dims.map(x=>{const r=mainRow(x.r);const tol=x.tol&&x.tol.art&&x.tol.art!=='keine'?BM.massText(x,{...STIL,stellen:PREC}).filter(Boolean).join(' '):'–';
    return {nr:x.no,art:x.title||r[0],wert:wert(r[1],r[2]),einheit:EINHEIT[r[2]]||(r[2]==='P'?'mm':''),toleranz:tol,elemente:(x.sels||[]).map(s=>{try{return label(s)}catch{return s.k}}).join(' / ')}});
  const mess=(lastRes?.r?.rows||[]).map(r=>[r[0],wert(r[1],r[2]),EINHEIT[r[2]]||(r[2]==='P'?'mm':'')]);
  const PM=await import('./messprotokoll.js');
  return PM.protokollDaten({meta:{datei:window.__lastLoad?.name||'',produkt:MARKE.produkt||'Hasi 3D',werkstoff:$('mat').value==='custom'?`eigene Dichte ${nf(d,2)} g/cm³`:$('mat').selectedOptions[0]?.textContent,stellen:PREC},
    modell:{volume:m.volume,area:m.area,masse:m.volume/1000*d,centroid:m.centroid},huelle,bemassungen:bem,messung:mess})}
$('protPdf').onclick=async()=>{const D=await protokollDatenSammeln();if(!D)return;const PM=await import('./messprotokoll.js');const meta={produkt:MARKE.produkt||'Hasi 3D',stellen:PREC};
  if(MARKE.logo)Object.assign(meta,{kopfFarbe:MARKE.akzentRgb,logo:await logoDaten()});await saveBytes(baseName()+'_Messprotokoll.pdf',PM.protokollPdf(D,meta),'PDF-Dokument','pdf','application/pdf')};
$('protXlsx').onclick=async()=>{const D=await protokollDatenSammeln();if(!D)return;const PM=await import('./messprotokoll.js');await saveBytes(baseName()+'_Messprotokoll.xlsx',await PM.protokollXlsx(D),'Excel-Arbeitsmappe','xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')};$('dens').oninput=()=>{$('mat').value='custom';showMass()};
$('file').onchange=async e=>{const f=e.target.files[0];if(f)load(await f.arrayBuffer(),f.name).catch(err=>$('status').textContent=err.message)};
// In der Desktop-App fängt Tauri das Ziehen ab (on_webview_event). Im Browser bleibt HTML5.
if(!window.__TAURI_INTERNALS__){
  view.ondragover=e=>e.preventDefault();
  view.ondrop=async e=>{e.preventDefault();const f=e.dataTransfer?.files?.[0];if(f)load(await f.arrayBuffer(),f.name).catch(err=>$('status').textContent=err.message)};
}

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
function pickAt(cx,cy,opt){if(!model)return null;const r=renderer.domElement.getBoundingClientRect();const ndc=new THREE.Vector2(((cx-r.left)/r.width)*2-1,-((cy-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc,camera);
  const clipOk=p=>!renderer.localClippingEnabled||plane.distanceToPoint(p)>=0;
  const liste=(opt&&opt.verdeckt)?bodies:bodies.filter(b=>b.visible);
  const fh=ray.intersectObjects(liste,false).filter(h=>clipOk(h.point))[0];
  if(opt&&opt.nurFlaeche){if(!fh)return null;const b=fh.object;return {k:'face',id:b.geometry.userData.face[fh.faceIndex],inst:b.userData.inst,p:model.worldToLocal(fh.point.clone()).toArray(),body:b}}
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
const teilName=s=>data.inst[s.inst??0]?.name||nodeOfBody(s.inst)?.name||'';
const label=s=>{const basis=s.k==='solid'?`Teil (${teilName(s)||'Körper'})`:s.k==='face'?`Fläche (${UQ(s).faces[s.id].type})`:s.k==='edge'?`Kante (${UQ(s).edges[s.id].type})`:s.k==='axis'?`Achse (Ø ${nf(2*(UQ(s).faces[s.id].ax?.r||0),PREC)} mm)`:names[s.k];
  return s.k==='solid'||!teilName(s)?basis:`${basis} · ${teilName(s)}`};
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
renderer.domElement.addEventListener('pointermove',e=>{letzteMaus=[e.clientX,e.clientY];if(e.buttons||hoverRAF||zug)return;hoverRAF=requestAnimationFrame(()=>{hoverRAF=0;hov=pickAt(e.clientX,e.clientY);hoverObj.clear();if(hov)hoverObj.add(hiObj(hov,0xff6a00));$('hover').textContent=hov?label(hov):'';
  const tip=$('snaptip'),r=$('view').getBoundingClientRect();tip.hidden=!hov;if(hov){tip.textContent=label(hov);tip.style.left=(e.clientX-r.left)+'px';tip.style.top=(e.clientY-r.top)+'px'}needs=true})});
renderer.domElement.addEventListener('pointerleave',()=>{if(hoverRAF){cancelAnimationFrame(hoverRAF);hoverRAF=0}$('snaptip').hidden=true;hov=null;hoverObj.clear();$('hover').textContent='';needs=true});
renderer.domElement.addEventListener('pointerup',e=>{if(zugSperre){zugSperre=false;return}if(e.button!==0||werkzeug!=='wahl')return;if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)return;
  if(festWahl){const f=pickAt(e.clientX,e.clientY,{nurFlaeche:true});if(f)festSetzen(f);return}
  const s=pickAt(e.clientX,e.clientY);if(!s&&!(e.ctrlKey||e.shiftKey||e.metaKey)){auswahlAufheben();return}if(s){select(s,e.ctrlKey||e.shiftKey||e.metaKey);if(s.body){const n=nodeOfBody(s.body.userData.inst);if(n){selNode=n;selMenge=new Set([n]);selAnker=n;for(let x=n.parent;x;x=x.parent)x.open=true;renderTree();hervorheben();document.querySelector(`.trow[data-id="${n.id}"]`)?.scrollIntoView({block:'nearest'})}}}});
// Esc wie in eDrawings: 1. Esc löscht die aktuelle Mess-Auswahl samt Ergebnis (Messen bleibt aktiv), 2. Esc hebt die Bauteilauswahl auf.
// Gespeicherte Bemaßungen bleiben immer erhalten. Nicht beim Tippen in einem Textfeld.
function textFeld(){const t=document.activeElement;if(!t)return false;if(t.tagName==='TEXTAREA'||t.isContentEditable)return true;
  return t.tagName==='INPUT'&&!['checkbox','radio','range','button','submit','reset','color','file'].includes((t.type||'').toLowerCase())}
function auswahlAufheben(){if(zug)return null;
  if(festWahl){festWahl=false;festAnzeigen();return 'feste Fläche'}
  if(sels.length||lastRes||$('mresult').textContent.trim()){clearSel();lastRes=null;hoverObj.clear();needs=true;$('status').textContent='Auswahl aufgehoben – nächste Messung wählen';return 'messung'}
  if(selNode||selMenge.size){selectNode(null);triadeAktualisieren();return 'bauteil'}
  return null}
addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(e.hasiDialogZu||textFeld()||e.repeat)return;const t=document.activeElement;if(t&&['SELECT','BUTTON'].includes(t.tagName))t.blur();
    if(auswahlAufheben())e.preventDefault();return}
  if(tippt())return;
  if(e.key==='Tab'){e.preventDefault();tabSicht(e);return}
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.code==='KeyZ'&&!e.shiftKey){e.preventDefault();rueckgaengig();return}
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.code==='KeyY'||(e.code==='KeyZ'&&e.shiftKey))){e.preventDefault();wiederholen();return}
  if(e.code==='Space'){e.preventDefault();clearSel();return}
  if(e.repeat||e.altKey||e.metaKey)return;
  if(e.code==='KeyF'&&!e.ctrlKey){e.preventDefault();$('fit').click();return}
  if(e.code==='F9'){e.preventDefault();f9();return}
  if(e.code==='F10'){e.preventDefault();f10();return}
  const ans=ZIFFER[e.code];if(ans&&!e.shiftKey){e.preventDefault();animiereAnsicht(ans)}
});
function teilAnCursor(auchVerdeckt){if(!letzteMaus||!model)return null;const [cx,cy]=letzteMaus;const rct=renderer.domElement.getBoundingClientRect();
  const ndc=new THREE.Vector2(((cx-rct.left)/rct.width)*2-1,-((cy-rct.top)/rct.height)*2+1);ray.setFromCamera(ndc,camera);
  const clipOk=p=>!renderer.localClippingEnabled||plane.distanceToPoint(p)>=0;
  const hits=ray.intersectObjects(bodies,false).filter(h=>clipOk(h.point));
  const h=auchVerdeckt?hits.find(x=>!x.object.visible):hits.find(x=>x.object.visible);
  return h?nodeOfBody(h.object.userData.inst):null}
function tabSicht(e){if(!model)return;
  if(e.ctrlKey&&e.shiftKey){act('showall');return}
  if(e.shiftKey){const n=teilAnCursor(true);if(!n)return;n.checked=true;for(let p=n.parent;p;p=p.parent)p.checked=true;applyVis();renderTree();return}
  const n=teilAnCursor(false);if(!n)return;n.checked=false;applyVis();renderTree()}
$('clearSel').onclick=()=>clearSel();
// Messoptionen: Abstandsmethode und Projektion (Bildschirm = aktuelle Blickrichtung in Modellkoordinaten)
// Bildschirmrichtungen in Modellkoordinaten: oben, rechts, blick (zum Betrachter hin)
function sicht(){if(!model)return {};return {oben:camDir(new THREE.Vector3(0,1,0)),rechts:camDir(new THREE.Vector3(1,0,0)),blick:camDir(new THREE.Vector3(0,0,1))}}
function messOpts(){const art=$('projektion')?.value||'keine';const pj={art};if(art==='bildschirm'&&model)pj.n=camDir(new THREE.Vector3(0,0,1));return {methode:$('methode')?.value||'min',projektion:pj,richtung:$('massRichtung')?.value||'ausgerichtet',sicht:sicht()}}
function messGrafik(r){r.gfx.forEach(([a,b])=>{const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(a),V3(b)]),new THREE.LineBasicMaterial({color:0x1f8fd0,depthTest:false}));l.renderOrder=11;marks.add(l)});
  if(r.delta&&$('deltaZeigen')?.checked)deltaLinien(r.delta[0],r.delta[1]).forEach(d=>{const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(d.von),V3(d.bis)]),new THREE.LineBasicMaterial({color:d.farbe,depthTest:false}));l.renderOrder=11;l.userData.delta=d.achse;marks.add(l)})}
async function neuMessen(){if(!sels.length)return;const s=sels.slice(),opts=messOpts();try{const r=await call('measure',{sels:s,opts});lastRes={r,sels:s,title:s.map(label).join(' + '),opts};
  marks.clear();s.forEach(x=>marks.add(hiObj(x,0x1f8fd0)));messGrafik(r);zeigeMessung(r);window.__lastMeasure=r;needs=true;return r}catch(err){$('mresult').innerHTML=`<div>Fehler</div><div>${err.message}</div>`}}
function clearSel(){sels=[];marks.clear();$('selinfo').textContent='';$('mresult').innerHTML='';window.__lastMeasure=null;needs=true}
let lastRes=null;
function zeigeMessung(r){const namen=[...new Set(sels.map(teilName).filter(Boolean))];
  kv($('mresult'),namen.length?[['Bauteil',namen.join(' · '),'t'],...r.rows]:r.rows);betonung()}
async function select(s,add=false){if(sels.length>=2&&!add)clearSel();const clean={k:s.k,id:s.id,inst:s.inst,p:s.p};if(s.src)clean.src=s.src;sels.push(clean);marks.add(hiObj(clean,0x1f8fd0));
  $('selinfo').textContent=sels.map(label).join('  +  ');needs=true;
  try{const opts=messOpts();const r=await call('measure',{sels,opts});lastRes={r,sels:sels.slice(),title:sels.map(label).join(' + '),opts};zeigeMessung(r);
    messGrafik(r);
    if(sels.length===2&&!add)keepDim();
    window.__lastMeasure=r;needs=true;return r}catch(err){$('mresult').innerHTML=`<div>Fehler</div><div>${err.message}</div>`}}
// ---------- Bemaßungen (bleiben im 3D stehen) ----------
const dimGroup=new THREE.Group();dimGroup.renderOrder=20;let dims=[],dimNo=0;
const rowText=r=>`${r[0]}: ${r[2]&&r[2]!=='t'?fmt(r[1],r[2]):r[1]}`;
const mainRow=r=>r.rows.find(x=>x[3])||r.rows.find(x=>x[2]==='L'||x[2]==='A'||x[2]==='W')||r.rows[0];
// Maßstil (Textgröße, Pfeilart, Nachkommastellen) – bleibt gespeichert
let STIL={...BM.STIL_STANDARD,...JSON.parse(localStorage.getItem('massstil')||'{}')};
const projL=p=>{const w=model.localToWorld(V3(p)).project(camera);return [(w.x+1)/2*view.clientWidth,(1-w.y)/2*view.clientHeight,w.z]};
let dimHits=[],dimSel=null,dimDrag=null;
function drawDims(){const c=overlay.getContext('2d');c.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);c.clearRect(0,0,overlay.width,overlay.height);dimHits=[];
  if(!model||!dims.length)return;dims.forEach(d=>{if(!d.typ)return;const h=BM.zeichne(c,d,projL,STIL,d.no===dimSel?'#e05a00':'#0a6fb0');if(h)dimHits.push({...h,no:d.no})})}
// Bemaßung aus der Auswahl bauen (Werte aus der B-Rep, Modellkoordinaten in mm)
const IM=s=>data.inst[s.inst??0].m;const TP=(m,q)=>[m[0]*q[0]+m[1]*q[1]+m[2]*q[2]+m[3],m[4]*q[0]+m[5]*q[1]+m[6]*q[2]+m[7],m[8]*q[0]+m[9]*q[1]+m[10]*q[2]+m[11]];
const TD=(m,q)=>BM.V.norm([m[0]*q[0]+m[1]*q[1]+m[2]*q[2],m[4]*q[0]+m[5]*q[1]+m[6]*q[2],m[8]*q[0]+m[9]*q[1]+m[10]*q[2]]);
const camDir=v=>{const o=model.worldToLocal(new THREE.Vector3(0,0,0));const w=model.worldToLocal(v.clone().applyQuaternion(camera.quaternion));return BM.V.norm(w.sub(o).toArray())};
const rowVal=(r,...names)=>{for(const n of names){const x=r.rows.find(q=>q[0]===n);if(x)return x[1]}return null};
const circleOf=s=>{const U=UQ(s),m=IM(s);if(s.k==='edge'||s.k==='center'){const e=U.edges[s.id];if(e.r==null)return null;const voll=V3(e.pts[0]).distanceTo(V3(e.pts.at(-1)))<1e-6*Math.max(1,e.r);
    return {c:TP(m,e.c),n:TD(m,e.n),r:e.r,voll,p0:TP(m,e.pts[0]),p1:TP(m,e.pts.at(-1))}}
  if(s.k==='face'){const f=U.faces[s.id];if(!f.ax)return null;return {c:TP(m,f.ax.c),n:TD(m,f.ax.d),r:f.ax.r,voll:true}}return null};
const lineOf=s=>{if(s.k!=='edge')return null;const e=UQ(s).edges[s.id];if(e.type!=='Gerade')return null;const m=IM(s);return [TP(m,e.pts[0]),TP(m,e.pts.at(-1))]};
const pointOf=s=>{const U=UQ(s),m=IM(s);if(s.k==='vertex')return TP(m,U.verts[s.id]);if(s.k==='mid')return TP(m,U.edges[s.id].mid);if(s.k==='center'){const e=U.edges[s.id];return e.c?TP(m,e.c):null}if(s.k==='point')return s.p;return null};
const letzteLinear=()=>{const sel=dims.find(x=>x.no===dimSel);if(sel&&BM.LINEAR.includes(sel.typ))return sel;for(let i=dims.length-1;i>=0;i--)if(BM.LINEAR.includes(dims[i].typ))return dims[i];return null};
function baueDim(res,typ,refDim){const sl=res.sels,r=res.r,size=box.getSize(new THREE.Vector3()).length();const d={typ:null,einheit:'L',tol:{art:'keine',o:0,u:0},praefix:'',suffix:'',text:''};
  if(typ==='auto'){if(sl.length===1){const ci=circleOf(sl[0]);typ=ci?(ci.voll?'durchmesser':'radius'):r.fase?'fase':(pointOf(sl[0])?'koordinate':null)}else typ=r.gfx.length?(r.richtung&&BM.RICHTUNG_TYP[r.richtung.art]||'linear'):null}
  if(!typ)return null;d.typ=typ;
  if(typ==='kette'||typ==='basislinie'){const p=sl.length===1?pointOf(sl[0]):(r.gfx[0]&&r.gfx[0][1]);const ref=refDim||letzteLinear();if(!p||!ref)return null;
    const g=BM.folgeMass(ref,p,typ,size*0.05);if(!g)return null;return Object.assign(d,g)}
  if(typ==='fase'){const f=r.fase;if(!f)return null;return Object.assign(d,{a:f.a,b:f.b,winkel:f.winkel,p:f.p,wert:f.a,off:[size*0.05,size*0.05,size*0.03]})}
  const FEST={hoehe:'vertikal',waagerecht:'horizontal','achse-x':'x','achse-y':'y','achse-z':'z',ansicht:'ansicht'};
  if(['ausgerichtet','horizontal','vertikal','linear',...Object.keys(FEST)].includes(typ)){if(!r.gfx.length)return null;const [a,b]=r.gfx[0];d.p1=a;d.p2=b;
    if(FEST[typ]){d.dir=richtungsVektor(FEST[typ],a,b,sicht(),$('projektion')?.value==='bildschirm');if(!d.dir)return null}
    else d.dir=typ==='horizontal'?camDir(new THREE.Vector3(1,0,0)):typ==='vertikal'?camDir(new THREE.Vector3(0,1,0)):BM.V.norm(BM.V.sub(b,a));
    if(typ==='linear')d.linArt='ausgerichtet';
    d.wert=Math.abs(BM.V.dot(BM.V.sub(b,a),BM.V.norm(d.dir)));
    const up=camDir(new THREE.Vector3(0,1,0));let side=BM.V.norm(BM.V.cross(d.dir,camDir(new THREE.Vector3(0,0,1))));if(BM.V.dot(side,up)<0)side=BM.V.mul(side,-1);d.off=BM.V.mul(side,size*0.06);return d}
  if(typ==='winkel'){const L1=lineOf(sl[0]),L2=sl[1]&&lineOf(sl[1]);if(!L1||!L2)return null;
    const d1=BM.V.norm(BM.V.sub(L1[1],L1[0])),d2=BM.V.norm(BM.V.sub(L2[1],L2[0])),w=BM.V.sub(L1[0],L2[0]);const a=BM.V.dot(d1,d2),dd=BM.V.dot(d1,w),e=BM.V.dot(d2,w),den=1-a*a;if(den<1e-9)return null;
    const t=(a*e-dd)/den,u=(e-a*dd)/den;const v=BM.V.mul(BM.V.add(BM.V.add(L1[0],BM.V.mul(d1,t)),BM.V.add(L2[0],BM.V.mul(d2,u))),0.5);
    const far=L=>BM.V.len(BM.V.sub(L[0],v))>BM.V.len(BM.V.sub(L[1],v))?L[0]:L[1];d.v=v;d.u1=BM.V.norm(BM.V.sub(far(L1),v));d.u2=BM.V.norm(BM.V.sub(far(L2),v));
    d.einheit='W';d.wert=Math.acos(Math.max(-1,Math.min(1,BM.V.dot(d.u1,d.u2))))*180/Math.PI;d.off=BM.V.mul(d.u1,Math.min(BM.V.len(BM.V.sub(far(L1),v)),BM.V.len(BM.V.sub(far(L2),v)))*0.6);return d}
  const ci=circleOf(sl[0]);
  if(typ==='radius'||typ==='durchmesser'){if(!ci)return null;Object.assign(d,{c:ci.c,n:ci.n,rad:ci.r,ang:0.7});d.wert=typ==='radius'?ci.r:2*ci.r;return d}
  if(typ==='bogen'){if(!ci||!ci.p0)return null;const [a0,a1]=BM.bogenWinkel(ci.c,ci.n,ci.p0,ci.p1,ci.voll);Object.assign(d,{c:ci.c,n:ci.n,rad:ci.r,a0,a1,offR:ci.r*0.25});d.wert=rowVal(r,'Bogenlänge')??ci.r*(a1-a0);return d}
  if(typ==='koordinate'){const p=pointOf(sl[0]);if(!p)return null;d.p=p;d.off=[size*0.05,size*0.05,0];d.wert=0;return d}
  return null}
const dimText=d=>`Bemaßung ${d.no} (${d.title})\n`+d.r.rows.map(rowText).join('\n');
function renderDims(){if(dimSel&&!dims.some(d=>d.no===dimSel)){dimSel=null;$('dimedit').hidden=true}
  $('dimcount').textContent=dims.length?`(${dims.length})`:'';
  $('dimlist').innerHTML=dims.map(d=>{const r=mainRow(d.r);return `<div class="dim" data-no="${d.no}"><b>${d.no}</b><span title="${d.title}"><span class="t">${r[0]}</span> <b>${fmt(r[1],r[2])}</b></span><button data-a="edit" title="Bearbeiten">Bearbeiten</button><button data-a="copy" title="Kopieren">Kopieren</button><button data-a="del" title="Löschen">Löschen</button></div>`}).join('')||'<p class="hint">Noch keine Bemaßungen.</p>';
  window.__dims=dims.map(d=>({no:d.no,title:d.title,text:dimText(d)}));needs=true}
async function copyText(t){window.__lastCopy=t;try{await navigator.clipboard.writeText(t)}catch{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy')}catch{}a.remove()}$('status').textContent='In die Zwischenablage kopiert'}
function keepDim(typ){if(!lastRes)return false;typ=typ||$('dimtyp').value;const g=baueDim(lastRes,typ);if(typ!=='auto'&&!g){$('status').textContent='Diese Bemaßungsart passt nicht zur Auswahl.';return false}
  // Gleicher Bezugspunkt wie eine vorhandene Bemaßung: weiter nach außen versetzen, damit sich nichts überlappt
  if(g&&g.off&&!['kette','basislinie'].includes(g.typ)){const tol=box.getSize(new THREE.Vector3()).length()*0.04,ref=dimRef(g);const k=dims.filter(d=>d.typ&&BM.V.len(BM.V.sub(dimRef(d),ref))<tol).length;if(k)g.off=BM.V.mul(g.off,1+k*0.9)}
  dims.push({no:++dimNo,...lastRes,...(g||{})});renderDims();return true}
$('keepDim').onclick=()=>keepDim();
$('copySel').onclick=()=>{if(lastRes)copyText(lastRes.title+'\n'+lastRes.r.rows.map(rowText).join('\n'))};
$('dimlist').onclick=e=>{const b=e.target.closest('button');if(!b)return;const no=+b.closest('.dim').dataset.no;const d=dims.find(x=>x.no===no);
  if(b.dataset.a==='del'){dims=dims.filter(x=>x!==d);renderDims()}else if(b.dataset.a==='edit')editDim(d);else copyText(dimText(d))};
// ---- Bemaßung bearbeiten (Art, Präfix/Suffix, Text, Toleranz) ----
function editDim(d){if(!d)return;dimSel=d.no;$('dimedit').hidden=false;$('deNo').textContent=d.no;
  const lin=['ausgerichtet','horizontal','vertikal'];const ts=lin.includes(d.typ)?lin:[d.typ||'auto'];$('deTyp').innerHTML=ts.map(t=>`<option value="${t}">${BM.TYPEN.find(x=>x[0]===t)?.[1]||'Nur Text'}</option>`).join('');$('deTyp').value=d.typ||'auto';$('deTyp').disabled=!lin.includes(d.typ);
  $('dePre').value=d.praefix||'';$('deSuf').value=d.suffix||'';$('deText').value=d.text||'';$('deTol').value=d.tol?.art||'keine';$('deO').value=d.tol?.o??0;$('deU').value=d.tol?.u??0;needs=true}
const curDim=()=>dims.find(x=>x.no===dimSel);
['dePre','deSuf','deText','deTol','deO','deU','deTyp'].forEach(id=>$(id).addEventListener('input',()=>{const d=curDim();if(!d)return;
  d.praefix=$('dePre').value;d.suffix=$('deSuf').value;d.text=$('deText').value;d.tol={art:$('deTol').value,o:parseFloat(String($('deO').value).replace(',','.'))||0,u:parseFloat(String($('deU').value).replace(',','.'))||0};
  if(id==='deTyp'&&d.typ!==$('deTyp').value){const keep={tol:d.tol,praefix:d.praefix,suffix:d.suffix,text:d.text};const g=baueDim(d,$('deTyp').value);if(g)Object.assign(d,g,keep)}needs=true}));
$('deClose').onclick=()=>{dimSel=null;$('dimedit').hidden=true;needs=true};
// ---- Maßstil ----
$('stPfeil').innerHTML=BM.PFEILARTEN.map(([k,t])=>`<option value="${k}">${t}</option>`).join('');$('stGroesse').value=STIL.groesse;$('stPfeil').value=STIL.pfeil;$('stStellen').value=STIL.stellen;
['stGroesse','stPfeil','stStellen'].forEach(id=>$(id).addEventListener('input',()=>{STIL={groesse:Math.max(8,Math.min(40,+$('stGroesse').value||14)),pfeil:$('stPfeil').value,stellen:Math.max(0,Math.min(4,parseInt($('stStellen').value)||0))};localStorage.setItem('massstil',JSON.stringify(STIL));needs=true}));
if($('massRichtung'))$('massRichtung').innerHTML=RICHTUNGEN.map(([k,t])=>`<option value="${k}">${t}</option>`).join('');
$('dimtyp').innerHTML=BM.TYPEN.map(([k,t])=>`<option value="${k}">${t}</option>`).join('');
$('dimSet').onclick=()=>keepDim($('dimtyp').value);
// ---- Bemaßung ziehen: Maßtext mit links greifen und ziehen ----
const modelPointAt=(cx,cy,ref)=>{const r=renderer.domElement.getBoundingClientRect();const wr=model.localToWorld(V3(ref)).project(camera);
  const v=new THREE.Vector3(((cx-r.left)/r.width)*2-1,-((cy-r.top)/r.height)*2+1,wr.z).unproject(camera);return model.worldToLocal(v).toArray()};
function dimRef(d){return d.p1?BM.V.mul(BM.V.add(d.p1,d.p2),0.5):(d.v||d.c||d.p)}
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0||!dims.length)return;const r=renderer.domElement.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;
  const h=dimHits.find(h=>Math.abs(h.x-x)<(h.w?h.w/2+6:h.r)&&Math.abs(h.y-y)<(h.h?h.h:h.r));if(!h)return;const d=dims.find(q=>q.no===h.no);dimDrag={d,moved:false};dimSel=d.no;try{renderer.domElement.setPointerCapture(e.pointerId)}catch{}e.stopImmediatePropagation();needs=true},true);
renderer.domElement.addEventListener('pointermove',e=>{if(!dimDrag)return;e.stopImmediatePropagation();dimDrag.moved=true;BM.ziehe(dimDrag.d,modelPointAt(e.clientX,e.clientY,dimRef(dimDrag.d)),sicht());needs=true},true);
// Lineare Bemaßung sperren (beim Ziehen oder für die gewählte Bemaßung): H = horizontal, V = vertikal (Höhe), A = ausgerichtet, L = wieder automatisch
function linearSperren(art){const d=dimDrag?.d||dims.find(x=>x.no===dimSel);if(!d||d.typ!=='linear')return false;d.sperre=art||undefined;
  if(art){const dir=art==='ausgerichtet'?BM.V.norm(BM.V.sub(d.p2,d.p1)):richtungsVektor(art,d.p1,d.p2,sicht(),!BM.hochachseSichtbar(sicht()));if(dir){d.dir=dir;d.linArt=art;d.wert=Math.abs(BM.V.dot(BM.V.sub(d.p2,d.p1),dir));if(d.off)BM.ziehe(d,BM.V.add(d.p1,d.off))}}
  $('status').textContent=art?`Bemaßung ${d.no}: ${({horizontal:'horizontal',vertikal:'vertikal (Höhe)',ausgerichtet:'ausgerichtet'})[art]} gesperrt`:`Bemaßung ${d.no}: Richtung folgt wieder dem Ziehen`;renderDims();needs=true;return true}
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||textFeld())return;const art={KeyH:'horizontal',KeyV:'vertikal',KeyA:'ausgerichtet',KeyL:null}[e.code];if(art===undefined)return;if(linearSperren(art))e.preventDefault()});
renderer.domElement.addEventListener('pointerup',e=>{if(!dimDrag)return;e.stopImmediatePropagation();const d=dimDrag.d,mv=dimDrag.moved;dimDrag=null;down=null;if(!mv)editDim(d);needs=true},true);
// ---- Ansicht mit Bemaßungen exportieren (PNG/PDF) ----
function ansichtBild(){renderer.render(scene,camera);drawDims();const c=document.createElement('canvas');const pr=renderer.domElement.width/(view.clientWidth||1),fd=Math.round(freiD*pr),sx=dockZustand.seite==='links'?fd:0;c.width=Math.max(1,renderer.domElement.width-fd);c.height=renderer.domElement.height;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,c.height);g.addColorStop(0,'#e7eef5');g.addColorStop(.55,'#c5d0dc');g.addColorStop(1,'#b7c5d3');x.fillStyle=g;x.fillRect(0,0,c.width,c.height);
  x.drawImage(renderer.domElement,sx,0,c.width,c.height,0,0,c.width,c.height);x.drawImage(overlay,sx*overlay.width/renderer.domElement.width,0,c.width*overlay.width/renderer.domElement.width,overlay.height,0,0,c.width,c.height);return c}
const toBytes=url=>{const b=atob(url.split(',')[1]);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
async function exportPng(){await saveBytes(baseName()+'_Bemaßung.png',toBytes(ansichtBild().toDataURL('image/png')),'PNG-Bild','png','image/png')}
async function exportPdf(){const c=ansichtBild();const {jsPDF}=await import('jspdf');const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  pdf.setFontSize(12);let bildY=18,maxH=180;
  if(MARKE.logo){const logo=await logoDaten();pdf.addImage(logo,'PNG',12,6,14,14);pdf.setTextColor(...MARKE.primaerRgb);pdf.setFontSize(12);pdf.text(MARKE.produkt,30,12);pdf.setTextColor(110);pdf.setFontSize(8);pdf.text(MARKE.vermerk,30,17);pdf.setTextColor(0);pdf.setFontSize(12);pdf.text(`${window.__lastLoad?.name||'Teil'} – Bemaßung (Maße in mm)`,12,26);bildY=30;maxH=166}
  else pdf.text(`${window.__lastLoad?.name||'Teil'} – Bemaßung (Maße in mm)`,12,12);
  let w=273,h=w*c.height/c.width;if(h>maxH){h=maxH;w=h*c.width/c.height}
  pdf.addImage(c.toDataURL('image/png'),'PNG',12+(273-w)/2,bildY,w,h);pdf.setFontSize(8);pdf.setTextColor(0);pdf.text(new Date().toLocaleDateString('de-DE'),12,203);
  await saveBytes(baseName()+'_Bemaßung.pdf',new Uint8Array(pdf.output('arraybuffer')),'PDF-Dokument','pdf','application/pdf')}
$('dimPng').onclick=exportPng;$('dimPdf').onclick=exportPdf;

$('dimClear').onclick=()=>{dims=[];renderDims()};
// Begleitdatei *.hasi3d.json: Auswahl-Bezüge (Teil, Fläche/Kante/Ecke), Art, Lage und Toleranz. Die Werte werden beim Laden neu gemessen.
function modellKennung(){if(!data)return null;return {instanzen:data.inst.length,flaechen:data.inst.reduce((s,I)=>s+data.uniq[I.u].faces.length,0),kanten:data.inst.reduce((s,I)=>s+data.uniq[I.u].edges.length,0)}}
const bemassungenText=()=>BM.bemassungenSpeichern(dims,{datei:window.__lastLoad?.name||'',modell:modellKennung(),stil:STIL});
async function bemassungenEinlesen(text){if(!data)throw new Error('Bitte zuerst eine STEP-Datei öffnen.');const j=BM.bemassungenLaden(text,{modell:modellKennung()});
  const neu=[];let fehl=0;
  for(const b of j.bemassungen){try{const r=await call('measure',{sels:b.sels,opts:b.opts||{}});const ref=b.refNo!=null?neu.find(x=>x.no===b.refNo):null;
    const g=baueDim({r,sels:b.sels},b.typ,ref);if(!g){fehl++;continue}const d={no:b.no,r,sels:b.sels,title:b.title||'',opts:b.opts,...g};
    for(const k of ['off','ang','offR','tol','praefix','suffix','text','refNo','linArt','sperre'])if(b[k]!==undefined)d[k]=b[k];
    if(b.dir&&BM.LINEAR.includes(d.typ)&&d.typ!=='ausgerichtet'){d.dir=b.dir;d.wert=Math.abs(BM.V.dot(BM.V.sub(d.p2,d.p1),BM.V.norm(d.dir)))}
    neu.push(d)}catch{fehl++}}
  dims=neu;dimNo=neu.reduce((m,d)=>Math.max(m,d.no),0);dimSel=null;renderDims();
  $('status').textContent=`${neu.length} Bemaßung(en) geladen`+(fehl?`, ${fehl} passen nicht zum Modell`:'');return {geladen:neu.length,fehl}}
$('dimSpeichern').onclick=async()=>{if(!dims.length){$('status').textContent='Keine Bemaßungen zum Speichern.';return}
  await saveBytes(baseName()+'.hasi3d.json',new TextEncoder().encode(bemassungenText()),'Bemaßungen (JSON)','json','application/json')};
$('dimLaden').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{await bemassungenEinlesen(await f.text())}catch(err){$('status').textContent=err.message}};
$('dimCopyAll').onclick=()=>copyText(dims.map(dimText).join('\n\n'));
$('prec').value=String(PREC);$('prec').onchange=()=>{PREC=+$('prec').value;localStorage.setItem('genauigkeit',PREC);renderDims();if(lastRes)kv($('mresult'),lastRes.r.rows);if(data){showModel?.();showMass?.()}if(sheetCache)calcSheet()};

// ---------- Tabs / Blech ----------
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));
  const messen=t.dataset.tab==='messen';$('tab-messen').hidden=!messen;$('tab-blech').hidden=messen;$('messenPanel').hidden=!messen;$('blechPanel').hidden=messen;
  $('btnMessen')?.classList.toggle('on',messen);$('btnBlech')?.classList.toggle('on',!messen);if(!messen&&data&&!sheetCache)calcSheet()});
let sheetCache=null;$('calcSheet').onclick=()=>calcSheet();
// Feste Fläche (ZW3D „Set Stationary Face“): anklicken statt automatisch die größte Fläche
let fest=null,festWahl=false,festMark=null;
function festAnzeigen(){const info=$('festInfo');if(!info)return;festMark?.clear();
  if(festWahl){info.textContent='Fläche in der 3D-Ansicht anklicken …';return}
  if(!fest){info.textContent='automatisch (größte Blechfläche)';$('festAuto').hidden=true;return}
  info.textContent=`Fläche ${fest.id+1}`+(teilName(fest)?` · ${teilName(fest)}`:'');$('festAuto').hidden=false;festMark?.add(hiObj({k:'face',id:fest.id,inst:fest.inst},0x2e9d4a));needs=true}
async function festSetzen(s){festWahl=false;fest={inst:s.inst,id:s.id};if(data&&data.inst.length>1)sheetSolid=s.inst;festAnzeigen();tabTo('blech');return calcSheet()}
$('festWaehlen').onclick=()=>{if(!data)return;festWahl=true;setWerkzeug('wahl');festAnzeigen()};
$('festAuto').onclick=()=>{fest=null;festWahl=false;festAnzeigen();if(data)calcSheet()};
$('dxfText').onchange=()=>{if(data)calcSheet()};
$('riAn').onchange=()=>{if(data)calcSheet()};$('riWert').onchange=()=>{if(data&&$('riAn').checked)calcSheet()};
// Virtueller Riss (ZW3D „Rip“): Kanten geschlossener Ecken auftrennen; gewählt wird in der 3D-Ansicht (auch die Innen- oder Außenkante der Ecke)
let riss=[],rissMark=null;
function rissAnzeigen(r){rissMark?.clear();const info=$('rissInfo');if(!info)return;$('rissLoeschen').hidden=!riss.length;
  if(!riss.length){info.textContent='keiner';return}
  const n=r?.rissKanten?.length||0;info.textContent=`${riss.length} gewählt`+(r?.ok?` · ${n} Kante(n) aufgetrennt`:'');
  const inst=sheetSolid??0;(r?.rissKanten||[]).forEach(id=>rissMark?.add(hiObj({k:'edge',id,inst},0x9c27b0)));needs=true}
async function rissSetzen(liste){const inst=sheetSolid??0;const neu=(liste||sels.filter(x=>x.k==='edge'||x.k==='mid').map(x=>({inst:x.inst??0,id:x.id}))).filter(x=>x.inst===inst);
  if(!neu.length){$('status').textContent='Bitte zuerst eine Kante der geschlossenen Ecke wählen.';return null}
  neu.forEach(x=>{if(!riss.some(y=>y.inst===x.inst&&y.id===x.id))riss.push(x)});tabTo('blech');return calcSheet()}
$('rissSetzen').onclick=()=>rissSetzen();
$('rissLoeschen').onclick=()=>{riss=[];if(data)calcSheet();else rissAnzeigen(null)};
// Falten/Entfalten in der 3D-Ansicht: Blechhaut des Teils, alle Biegungen gleichzeitig (λ = 0 gefaltet … 1 flach)
let faltNetzCache=null,faltObj=null,faltLauf=null;
async function faltNetzHolen(){if(!faltNetzCache){const u=data.uniq[data.inst[sheetSolid??0].u];faltNetzCache=await call('faltNetz',{netz:{p:u.p,i:u.i,f:u.f}})}return faltNetzCache}
async function faltSetzen(lambda){if(!data||!sheetCache?.faltung)return null;const N=await faltNetzHolen();if(!N)return null;
  const inst=sheetSolid??0,B=bodies[inst];
  if(!faltObj){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N.p2.length/2*3),3));
    faltObj=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xd9a441,metalness:.2,roughness:.55,side:THREE.DoubleSide}));faltObj.matrixAutoUpdate=false;faltObj.matrix.copy(B.matrix);faltObj.userData.inst=inst;model.add(faltObj)}
  const pos=faltObj.geometry.attributes.position;falteNetz(N,N.faltung,lambda,pos.array);pos.needsUpdate=true;faltObj.geometry.computeVertexNormals();faltObj.geometry.computeBoundingSphere();
  B.userData.faltVersteckt=true;B.visible=false;faltObj.visible=true;if(rissMark)rissMark.visible=false;$('faltAus').hidden=false;
  $('faltRegler').value=String(Math.round(lambda*100));$('faltWert').textContent=Math.round(lambda*100)+' %';needs=true;return pos.array}
function faltEnde(){if(faltLauf){cancelAnimationFrame(faltLauf);faltLauf=null}
  if(faltObj){faltObj.removeFromParent();faltObj.geometry.dispose();faltObj.material.dispose();faltObj=null}
  bodies.forEach(b=>{if(b.userData.faltVersteckt){b.userData.faltVersteckt=false;b.visible=true}});if(rissMark)rissMark.visible=true;
  if($('faltRegler')){$('faltRegler').value='0';$('faltWert').textContent='0 %';$('faltAus').hidden=true}needs=true}
$('faltRegler').oninput=()=>{if(faltLauf){cancelAnimationFrame(faltLauf);faltLauf=null}faltSetzen(+$('faltRegler').value/100)};
$('faltAus').onclick=()=>faltEnde();
$('faltPlay').onclick=async()=>{if(faltLauf){cancelAnimationFrame(faltLauf);faltLauf=null}await faltNetzHolen();const T=2600,t0=performance.now();
  const schritt=now=>{const u=Math.min(1,(now-t0)/(2*T));const l=u<.5?u*2:2-u*2;const e=l*l*(3-2*l);faltSetzen(e);faltLauf=u<1?requestAnimationFrame(schritt):null};faltLauf=requestAnimationFrame(schritt)};
// K-Faktor-Modus, Werkstoff, eigene Biegetabelle
let biegetabelle=null;try{biegetabelle=JSON.parse(localStorage.getItem('biegetabelle')||'null')}catch{}
function showCsv(){const ws=[...new Set((biegetabelle?.rows||[]).map(r=>r.werkstoff).filter(Boolean))],sp=[...new Set((biegetabelle?.rows||[]).map(r=>r.spalte).filter(Boolean))];
  $('csvinfo').textContent=biegetabelle?`Eigene Biegetabelle aktiv: ${biegetabelle.name} (${biegetabelle.rows.length} Zeilen${sp.length?', Spalte '+sp.join('/'):''}${ws.length?', Werkstoffe: '+ws.join(', ')+' – es gilt der gewählte Werkstoff':''}) – hat Vorrang.`:'Keine eigene Biegetabelle geladen.';$('csvClear').hidden=!biegetabelle}
showCsv();
$('kmode').onchange=()=>{$('kf').disabled=$('kmode').value!=='manuell';if(data)calcSheet()};
$('mat2').onchange=()=>{$('mat').value=$('mat2').value;$('dens').value=$('mat2').value;showMass();if(sheetCache)calcSheet()};
$('mat').addEventListener('change',()=>{if([...$('mat2').options].some(o=>o.value===$('mat').value))$('mat2').value=$('mat').value});
$('csv').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const {parseBiegetabelle}=await import('./kfaktor.js');const rows=parseBiegetabelle(await f.text());biegetabelle={name:f.name,rows};localStorage.setItem('biegetabelle',JSON.stringify(biegetabelle));showCsv();if(data)calcSheet()}catch(err){$('csvinfo').textContent=err.message}e.target.value=''};
$('csvClear').onclick=()=>{biegetabelle=null;localStorage.removeItem('biegetabelle');showCsv();if(data)calcSheet()};
window.__setBiegetabelle=(name,rows)=>{biegetabelle={name,rows};showCsv()};
function schenkelTab(bends,n2){const rows=bends.flatMap(b=>(b.schenkel||[]).map((l,i)=>`<tr><td>${b.nr}</td><td>${i+1}</td><td>${l.aussen!=null?n2(l.aussen):'–'}</td><td>${l.innen!=null?n2(l.innen):'–'}</td><td>${n2(l.geradeAussen)}</td><td>${l.geradeInnen!=null?n2(l.geradeInnen):'–'}</td></tr>`));
  return rows.length?`<table class="schenkel"><tr><th>Nr.</th><th>Schenkel</th><th title="gerader Teil + R·tan(φ/2), außen">bis Biegep. außen</th><th title="gerader Teil + R·tan(φ/2), innen">bis Biegep. innen</th><th>gerade außen</th><th>gerade innen</th></tr>${rows.join('')}</table>`:''}
async function calcSheet(){if(!data)return;const K=parseFloat(String($('kf').value).replace(',','.'));if(!(K>=0&&K<=1)){$('sheetwarn').textContent='K-Faktor muss zwischen 0 und 1 liegen.';return}
  const riW=parseFloat(String($('riWert').value).replace(',','.'));if($('riAn').checked&&!(riW>0)){$('sheetwarn').textContent='Angenommener Innenradius muss größer als 0 sein.';return}
  const opts={modus:$('kmode').value,K,tabelle:biegetabelle?.rows||null,werkstoff:$('mat2').selectedOptions[0]?.textContent||'',beschriftung:!!$('dxfText')?.checked,basis:fest&&(sheetSolid??0)===fest.inst?fest.id:null,
    riAnnahme:$('riAn').checked?riW:null,riss:riss.filter(x=>x.inst===(sheetSolid??0)).map(x=>x.id)};
  faltEnde();const r=await call('sheet',{opts,inst:sheetSolid});sheetCache=r;window.__lastSheet=r;faltNetzCache=null;rissAnzeigen(r);
  $('faltRegler').disabled=$('faltPlay').disabled=!(r.ok&&r.faltung&&r.bends?.length);
  if(!r.ok){$('expPdf').disabled=$('expXlsx').disabled=true;$('sheeterr').innerHTML=`<div class="err"><b>Keine Abwicklung</b><br>• ${r.msg}</div>`;$('sheetinfo').innerHTML='';$('bends').innerHTML='';$('flatprev').innerHTML='';$('dxf').disabled=true;$('sheetwarn').textContent=r.msg;return}
  const rows=[['Teil',sheetSolid==null?'gesamtes Modell':(nodeOfBody(sheetSolid)?.name||'Körper '+(sheetSolid+1))],['Blechdicke (erkannt)',r.t,'L'],['K-Faktor',r.modus==='din'?(r.bends.some(b=>b.quelle==='Tabelle')?(r.bends.every(b=>b.quelle==='Tabelle')?'nach Biegetabelle':'nach Biegetabelle / DIN 6935 (je Biegung)'):'nach DIN 6935 (je Biegung)'):nf(K,2)],...(biegetabelle?[['Biegetabelle',biegetabelle.name]]:[]),['Biegungen',r.bends.length]];
  if(r.flat)rows.push(['Zuschnitt Länge',Math.max(...r.flat.size),'L'],['Zuschnitt Breite',Math.min(...r.flat.size),'L']);
  try{const q=await call('props',{ids:[sheetSolid??0]});const d=parseFloat($('mat2').value);rows.push(['Werkstoff',$('mat2').selectedOptions[0].textContent],['Masse',q.volume/1000*d,'M'])}catch{}
  kv($('sheetinfo'),rows);
  const n2=v=>nf(v,2);
  $('bends').innerHTML=r.bends.length?`<table><tr><th>Nr.</th><th title="Innenradius">Ri</th><th>Winkel</th><th>Richtung</th><th title="Biegezugabe (neutrale Faser)">BZ</th><th title="Ausgleichswert nach DIN 6935">v</th><th title="Biegeverkürzung: Zuschnitt = Summe der Außenmaße − BD">BD</th><th title="K-Faktor und Quelle">K</th></tr>${r.bends.map(b=>`<tr${b.angenommen?' class="angenommen" title="Innenradius angenommen, nicht aus der Datei"':''}><td>${b.nr}</td><td>${n2(b.ri)}${b.angenommen?'*':''}</td><td>${nf(b.ang,1)}°</td><td>${b.dir==='nach oben'?'AUF':'AB'} <span class="m">(${b.dir})</span></td><td>${n2(b.ba)}</td><td>${b.v==null?'–':n2(b.v)}</td><td>${b.bd==null?'–':n2(b.bd)}</td><td title="${b.quelle}${b.tabelle?` · Spalte ${b.tabelle.spalte}${b.tabelle.werkstoff?' · '+b.tabelle.werkstoff:''}`:''}">${nf(b.K,3)}<span class="m"> ${b.quelle==='DIN 6935'?'DIN':b.quelle==='Tabelle'?'Tab.':'man.'}</span></td></tr>`).join('')}</table>${r.bends.some(b=>b.angenommen)?'<p class="warn">* Innenradius angenommen, nicht aus der Datei.</p>':''}${schenkelTab(r.bends,n2)}<p class="hint">Längen in mm. Schenkel bis Biegepunkt = gerader Teil + R·tan(Winkel/2); gerader Teil = ohne Biegung. BZ = Biegezugabe = Winkel·(Ri + K·s), K nach DIN 6935: K = (0,65 + 0,5·lg(Ri/s))/2 für Ri/s &lt; 5, sonst 0,5; v = BZ − 2·(Ri + s)·tan(Winkel/2), BD = −v (Zuschnitt = Summe der Außenmaße − BD). Biegelänge: ${r.bends.map(b=>n2(b.len)).join(' / ')} mm.</p>`:'<p class="hint">Keine zylindrischen Biegungen gefunden.</p>';
  $('flatprev').innerHTML=r.flat?svg(r.flat):'';$('dxf').disabled=!r.flat||!!r.flat.incomplete;$('expPdf').disabled=$('expXlsx').disabled=!r.flat||!!r.flat.incomplete||!r.bends.length;$('dxf').title=r.flat?.incomplete?'DXF gesperrt: Abwicklung unvollständig oder fehlerhaft':'Abwicklung als DXF speichern';
  const warn=[...r.warn,'Hinweis: Abwicklung für Blechteile mit zylindrischen Biegungen (auch Biegung an Biegung, Laschen in mehrere Richtungen). Werte vor der Fertigung prüfen.'];$('sheeterr').innerHTML=r.fehler?.length?`<div class="err"><b>Abwicklung unvollständig – DXF gesperrt</b><br>${r.fehler.map(w=>'• '+w).join('<br>')}</div>`:'';$('sheetwarn').innerHTML=warn.filter(w=>!w.startsWith('ACHTUNG')).map(w=>'• '+w).join('<br>');return r}
// Vorschau der Abwicklung: Kontur, Biegelinien (rot AUF / blau AB), Richtungspfeile mit Notiz „B1 AUF 90° Ri 2“, Risskanten violett
function svg(f){const N0=biegeNotizen(f),fs0=Math.max(...f.size)/40,pad=Math.max(...f.size)*0.06,w=f.size[0]+2*pad,h=f.size[1]+2*pad;const X=p=>p[0]-f.min[0]+pad,Y=p=>f.max[1]-p[1]+pad;const tr=p=>`${X(p).toFixed(3)},${Y(p).toFixed(3)}`;const sw=Math.max(w,h)/400;
  const N=N0,fs=fs0,farbe=n=>n.auf?'#d0342c':'#1f6fd1';
  const pfeile=N.map(n=>{const [a,b]=n.pfeil,d=n.richtung,k=n.laenge*0.35,qx=[-d[1],d[0]];const s1=[b[0]-d[0]*k+qx[0]*k*0.5,b[1]-d[1]*k+qx[1]*k*0.5],s2=[b[0]-d[0]*k-qx[0]*k*0.5,b[1]-d[1]*k-qx[1]*k*0.5];
    const tx=X(n.anker)-d[0]*fs*0.9,ty=Y(n.anker)+d[1]*fs*0.9;
    return `<g class="biegenotiz" data-nr="${n.nr}" data-richtung="${n.auf?'AUF':'AB'}" data-dx="${d[0].toFixed(6)}" data-dy="${d[1].toFixed(6)}"><line x1="${X(a).toFixed(3)}" y1="${Y(a).toFixed(3)}" x2="${X(b).toFixed(3)}" y2="${Y(b).toFixed(3)}" stroke="${farbe(n)}" stroke-width="${sw*1.6}"/><polygon points="${[b,s1,s2].map(tr).join(' ')}" fill="${farbe(n)}"/><text x="${tx.toFixed(3)}" y="${ty.toFixed(3)}" font-size="${fs.toFixed(3)}" fill="${farbe(n)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${(-n.winkel).toFixed(2)} ${tx.toFixed(3)} ${ty.toFixed(3)})" font-family="sans-serif">${n.text}</text></g>`}).join('');
  return `<svg viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}" xmlns="http://www.w3.org/2000/svg">${f.contour.map(pl=>`<polyline points="${pl.map(tr).join(' ')}" fill="none" stroke="${f.incomplete?'#c62828':'#1d1d1f'}" stroke-width="${sw}"/>`).join('')}${(f.rissLinien||[]).map(pl=>`<polyline class="riss" points="${pl.map(tr).join(' ')}" fill="none" stroke="#9c27b0" stroke-width="${sw*2.2}"/>`).join('')}${f.bendLines.map((b,i)=>`<polyline points="${b.map(tr).join(' ')}" stroke="${N[i]&&!N[i].auf?'#1f6fd1':'#d0342c'}" stroke-width="${sw}" stroke-dasharray="${sw*6} ${sw*4}"/>`).join('')}${pfeile}</svg>`}
$('dxf').onclick=async()=>{if(!sheetCache?.dxf||sheetCache.flat?.incomplete)return;const name=(window.__lastLoad?.name||'teil').replace(/\.(step|stp)$/i,'')+'_Abwicklung.dxf';
  const inv=window.__TAURI_INTERNALS__?.invoke;
  if(inv){try{const ok=await inv('save_text',{name,content:sheetCache.dxf});if(ok)$('status').textContent='DXF gespeichert: '+name}catch(e){$('status').textContent='Fehler beim Speichern: '+e}}
  else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([sheetCache.dxf],{type:'application/dxf'}));a.download=name;a.click()}};

// ---------- Biegetabelle exportieren (PDF / XLSX) ----------
async function saveBytes(name,bytes,filter,ext,mime){window.__lastExport={name,bytes,ext};const inv=window.__TAURI_INTERNALS__?.invoke;
  if(inv){try{const ok=await inv('save_bytes',{name,data:Array.from(bytes),filter,ext});if(ok)$('status').textContent='Gespeichert: '+name}catch(e){$('status').textContent='Fehler beim Speichern: '+e}}
  else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:mime}));a.download=name;a.click();$('status').textContent='Gespeichert: '+name}}
const exportMeta=()=>{const rows=[...$('sheetinfo').children].map(d=>d.textContent);const get=k=>{const i=rows.indexOf(k);return i>=0?rows[i+1]:undefined};
  return {teil:(sheetSolid!=null&&nodeOfBody(sheetSolid)?.name)||window.__lastLoad?.name||'Teil',werkstoff:$('mat2').selectedOptions[0].textContent,kfaktor:get('K-Faktor'),masse:get('Masse')}};
async function exportMetaMarke(){const m=exportMeta();if(!MARKE.logo)return m;return {...m,produkt:MARKE.produkt,kopfFarbe:MARKE.akzentRgb,primaer:MARKE.primaerRgb,logo:await logoDaten(),vermerk:MARKE.vermerk}}
const baseName=()=>(window.__lastLoad?.name||'teil').replace(/\.(step|stp)$/i,'');
$('expPdf').onclick=async()=>{if(!sheetCache?.flat||sheetCache.flat.incomplete)return;const E=await import('./biegetabelle-export.js');await saveBytes(baseName()+'_Biegetabelle.pdf',E.pdf(sheetCache,await exportMetaMarke()),'PDF-Dokument','pdf','application/pdf')};
$('expXlsx').onclick=async()=>{if(!sheetCache?.flat||sheetCache.flat.incomplete)return;const E=await import('./biegetabelle-export.js');await saveBytes(baseName()+'_Biegetabelle.xlsx',await E.xlsx(sheetCache,exportMeta()),'Excel-Arbeitsmappe','xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')};

// ---------- Oberfläche: Menüs, Werkzeuge, Würfel, Kürzel ----------
const ZIFFER={Digit1:'vorne',Digit2:'hinten',Digit3:'links',Digit4:'rechts',Digit5:'oben',Digit6:'unten',Digit7:'iso',Digit0:'iso',Numpad1:'vorne',Numpad2:'hinten',Numpad3:'links',Numpad4:'rechts',Numpad5:'oben',Numpad6:'unten',Numpad7:'iso',Numpad0:'iso'};
function tippt(){const t=document.activeElement;if(!t)return false;const tag=t.tagName;return tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||t.isContentEditable}
function menueZu(){document.querySelectorAll('.menuliste').forEach(m=>m.hidden=true);document.querySelectorAll('.menu').forEach(m=>m.classList.remove('offen'))}
function zeigeReiter(name){const t=$('dateitab');if(!t)return;t.hidden=false;$('dateiname').textContent=name;$('dateiname').title=name}
function dateiSchliessen(){anim=null;drehen=false;$('btnDreh')?.classList.remove('on');$('btnDreh')?.setAttribute('aria-pressed','false');
  if(model){scene.remove(model);model.traverse(o=>{o.geometry?.dispose?.()});baseMat?.dispose?.()}
  model=null;data=null;bodies=[];edgeObjs=[];baseMat=null;treeRoot=null;nodes=[];selNode=null;selMenge=new Set();sheetCache=null;sheetSolid=null;fest=null;festWahl=false;festAnzeigen();riss=[];rissAnzeigen(null);if(faltLauf){cancelAnimationFrame(faltLauf);faltLauf=null}faltObj=null;faltNetzCache=null;huelle=null;huellObj=null;spObj=null;$('huellinfo').innerHTML='';
  ursprung=[];undoStapel=[];redoStapel=[];isoSnap=null;if(triade)triade.visible=false;if($('bewegenPanel'))$('bewegenPanel').hidden=true;
  $('tree').innerHTML='';$('modelinfo').innerHTML='';$('massinfo').innerHTML='';
  clearSel();dims=[];dimSel=null;$('dimedit').hidden=true;renderDims();
  $('sheeterr').innerHTML='';$('sheetinfo').innerHTML='';$('bends').innerHTML='';$('flatprev').innerHTML='';$('dxf').disabled=true;$('expPdf').disabled=true;$('expXlsx').disabled=true;$('sheetwarn').textContent='';
  $('drop').style.display='';$('dateitab').hidden=true;$('status').textContent='Keine Datei';if($('file'))$('file').value='';needs=true}
function betonung(){const wahl=lastRes?.r?.wahl;const kids=[...$('mresult').children];
  for(let i=0;i<kids.length;i+=2){const treffer=!!wahl&&kids[i].textContent===wahl;kids[i].classList.toggle('wahl',treffer);if(kids[i+1])kids[i+1].classList.toggle('wahl',treffer)}}
function drucken(){if(!model){$('status').textContent='Keine Datei zum Drucken';return}
  const url=ansichtBild().toDataURL('image/png');let f=$('druckrahmen');
  if(!f){f=document.createElement('iframe');f.id='druckrahmen';f.setAttribute('title','Druckvorschau');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.append(f)}
  const doc=f.contentDocument;doc.open();doc.write('<!doctype html><title>Drucken</title><style>html,body{margin:0}img{max-width:100%}</style><img src="'+url+'">');doc.close();
  setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch{$('status').textContent='Drucken ist in dieser Ansicht nicht verfügbar'}},60)}
function oeffneExport(anker){const m=$('exportMenue');document.querySelectorAll('.menuliste').forEach(x=>{if(x!==m)x.hidden=true});m.hidden=false;const r=anker.getBoundingClientRect();m.style.position='fixed';m.style.left=Math.max(8,r.left)+'px';m.style.top=(r.bottom+4)+'px'}
const aktion={
  oeffnen:()=>$('file').click(),screenshot:()=>screenshot(),exportPng:()=>$('dimPng').click(),exportPdf:()=>$('dimPdf').click(),dxf:()=>$('dxf').click(),expPdf:()=>$('expPdf').click(),expXlsx:()=>$('expXlsx').click(),
  drucken,schliessen:dateiSchliessen,einpassen:()=>$('fit').click(),f9,f10,schnitt:()=>$('btnSchnitt').click(),messen:()=>tabTo('messen'),bemassung:()=>$('btnMass').click(),blech:()=>tabTo('blech'),
  baum:()=>$('baum').classList.contains('zu')?$('baumLasche').click():$('baumZu').click(),drehen:()=>$('btnDreh').click(),zurueck:()=>animiereAnsicht('iso'),verschieben:()=>selNode?act('move',selNode):($('status').textContent='Bitte zuerst ein Bauteil im Baum oder in der Ansicht wählen.'),hilfe:()=>{$('hilfeDlg').hidden=false},einstellungen:()=>{$('einstDlg').hidden=false},
};
document.querySelectorAll('.menuknopf').forEach(b=>b.onclick=ev=>{const liste=b.nextElementSibling;const war=liste.hidden;menueZu();liste.hidden=!war;b.parentElement.classList.toggle('offen',!liste.hidden);ev.stopPropagation()});
document.querySelectorAll('[data-aktion]').forEach(b=>b.addEventListener('click',()=>{const fn=aktion[b.dataset.aktion];menueZu();fn?.()}));
document.querySelectorAll('[data-ansicht]').forEach(b=>b.addEventListener('click',()=>{menueZu();animiereAnsicht(b.dataset.ansicht)}));
$('exportKnopf').onclick=e=>{e.stopPropagation();if($('exportMenue').hidden)oeffneExport($('exportKnopf'));else $('exportMenue').hidden=true};
$('stilWahl').onchange=()=>setStil($('stilWahl').value);
$('projektionWahl').onchange=()=>{camera.fov=$('projektionWahl').value==='orthogonal'?4:35;camera.updateProjectionMatrix();if(model)fit()};
$('standardWahl').onchange=()=>{const v=$('standardWahl').value;if(v)animiereAnsicht(v);$('standardWahl').value=''};
['methode','projektion','deltaZeigen','massRichtung'].forEach(id=>$(id)?.addEventListener('change',()=>neuMessen()));
document.querySelectorAll('[data-werkzeug]').forEach(b=>b.onclick=()=>setWerkzeug(b.dataset.werkzeug));
$('btnReset').onclick=()=>animiereAnsicht('iso');
// Autodrehen ist ein ausdrücklicher Schalter; jeder Griff in die Ansicht (Maus oder Rad) schaltet es ab, damit danach nichts von selbst weiterläuft
function setAutodrehen(an){drehen=!!an;const b=$('btnDreh');if(b){b.classList.toggle('on',drehen);b.setAttribute('aria-pressed',String(drehen))}needs=true}
$('btnDreh').onclick=()=>setAutodrehen(!drehen);
renderer.domElement.addEventListener('pointerdown',()=>{if(drehen)setAutodrehen(false)},true);
renderer.domElement.addEventListener('wheel',()=>{if(drehen)setAutodrehen(false)},{capture:true,passive:true});
$('btnMessen').onclick=()=>tabTo('messen');
$('btnSchnitt').onclick=()=>{const p=$('schnittPanel');p.hidden=!p.hidden;$('btnSchnitt').classList.toggle('on',!p.hidden)};
$('btnMass').onclick=()=>{tabTo('messen');$('dimtyp')?.scrollIntoView({block:'nearest'})};
$('btnBlech').onclick=()=>tabTo('blech');
$('schnittZu').onclick=()=>{$('schnittPanel').hidden=true;$('btnSchnitt').classList.remove('on')};
$('messenZu').onclick=()=>dockEinklappen(true);$('blechEin').onclick=()=>dockEinklappen(true);
$('blechZu').onclick=()=>tabTo('messen');
$('baumZu').onclick=()=>{$('baum').classList.add('zu');$('baumLasche').hidden=false};
$('baumLasche').onclick=()=>{$('baum').classList.remove('zu');$('baumLasche').hidden=true};
$('dateiZu').onclick=dateiSchliessen;
$('einstZu').onclick=()=>$('einstDlg').hidden=true;
$('hilfeZu').onclick=()=>$('hilfeDlg').hidden=true;
renderer.domElement.addEventListener('pointerdown',()=>{anim=null;mausUnten=true});
renderer.domElement.addEventListener('pointerup',()=>{mausUnten=false});
renderer.domElement.addEventListener('pointerleave',()=>{mausUnten=false});
let zf=null;
function zoomFenster(a){const r=renderer.domElement.getBoundingClientRect();const w=Math.abs(a.x1-a.x0),h=Math.abs(a.y1-a.y0);const cx=(a.x0+a.x1)/2,cy=(a.y0+a.y1)/2;
  const ndc=new THREE.Vector2(((cx-r.left)/r.width)*2-1,-((cy-r.top)/r.height)*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
  const dist=Math.max(camera.position.distanceTo(controls.target),1);const hit=ray.ray.origin.clone().add(ray.ray.direction.clone().multiplyScalar(dist));
  const factor=Math.min(1,Math.max(w/r.width,h/r.height,0.05));const off=camera.position.clone().sub(controls.target).normalize().multiplyScalar(dist*factor);
  camera.position.copy(hit).add(off);controls.target.copy(hit);controls.update();needs=true}
function zfZeichnen(){const box=$('zoomrahmen'),r=renderer.domElement.getBoundingClientRect();const x=Math.min(zf.x0,zf.x1),y=Math.min(zf.y0,zf.y1);
  box.hidden=false;box.style.left=(x-r.left)+'px';box.style.top=(y-r.top)+'px';box.style.width=Math.abs(zf.x1-zf.x0)+'px';box.style.height=Math.abs(zf.y1-zf.y0)+'px'}
renderer.domElement.addEventListener('pointerdown',e=>{if(werkzeug!=='fenster'||e.button!==0)return;zf={x0:e.clientX,y0:e.clientY,x1:e.clientX,y1:e.clientY};zfZeichnen();mausUnten=true;anim=null;try{renderer.domElement.setPointerCapture(e.pointerId)}catch{}e.stopPropagation();e.preventDefault()},true);
renderer.domElement.addEventListener('pointermove',e=>{if(!zf)return;zf.x1=e.clientX;zf.y1=e.clientY;zfZeichnen();e.stopPropagation()},true);
renderer.domElement.addEventListener('pointerup',e=>{if(!zf||e.button!==0)return;const a=zf;zf=null;$('zoomrahmen').hidden=true;mausUnten=false;if(Math.abs(a.x1-a.x0)>8&&Math.abs(a.y1-a.y0)>8&&model)zoomFenster(a);e.stopPropagation()},true);
const wRay=new THREE.Raycaster();
if(vr)vr.domElement.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=vr.domElement.getBoundingClientRect();
  wuerfelSync();wRay.setFromCamera(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1),vc);
  const h=wRay.intersectObject(vHit,false)[0];if(!h)return;const p=h.point,dir=new THREE.Vector3();
  for(const k of ['x','y','z'])if(Math.abs(p[k])>0.28)dir[k]=Math.sign(p[k]);
  if(dir.lengthSq()<1e-8)dir.copy(h.face.normal);animiere(dir,upSenkrecht(dir,new THREE.Vector3(0,1,0)));e.preventDefault();e.stopPropagation()});
function ringWinkel(e){const r=$('kompass').getBoundingClientRect();return Math.atan2(e.clientX-(r.left+r.width/2),-(e.clientY-(r.top+r.height/2)))}
let ringDrag=null;
$('kring').addEventListener('pointerdown',e=>{if(e.button!==0)return;anim=null;ringDrag={a:ringWinkel(e),off:camera.position.clone().sub(controls.target),up:camera.up.clone()};try{$('kring').setPointerCapture(e.pointerId)}catch{}e.preventDefault()});
$('kring').addEventListener('pointermove',e=>{if(!ringDrag)return;const delta=ringWinkel(e)-ringDrag.a;const achse=new THREE.Vector3(0,1,0);
  camera.position.copy(controls.target).add(ringDrag.off.clone().applyAxisAngle(achse,delta));camera.up.copy(ringDrag.up).applyAxisAngle(achse,delta);camera.lookAt(controls.target);controls.update();needs=true});
$('kring').addEventListener('pointerup',()=>{ringDrag=null});
$('wuerfelHome').onclick=()=>animiereAnsicht('iso');
document.querySelectorAll('.tab').forEach(t=>{const alt=t.onclick;t.onclick=ev=>{alt?.call(t,ev);$('messenPanel').classList.remove('zu');dockEinklappen(false)}});

// ---------- Komponente verschieben / drehen (Triade, nur Matrix) ----------
let zug=null,zugSperre=false;
const ACHSE={X:new THREE.Vector3(1,0,0),Y:new THREE.Vector3(0,1,0),Z:new THREE.Vector3(0,0,1)};
const GRIFF={x:'X',y:'Y',z:'Z',rx:'X',ry:'Y',rz:'Z'};
// Triade in fester Bildschirmgröße (wie SolidWorks/eDrawings): Ringradius TRIADE_PX Pixel, unabhängig von Zoom, Teilegröße und Einheit
const TRIADE_PX=70,TRIADE_RING=.78;
function triadeMassstab(){if(!triade||!model)return 1;const welt=model.localToWorld(triade.position.clone());const blick=camera.getWorldDirection(new THREE.Vector3());
  const tiefe=Math.max(welt.sub(camera.position).dot(blick),camera.near);const h=renderer.domElement.clientHeight||1;
  const wpp=2*tiefe*Math.tan(camera.fov*Math.PI/360)/h;const ms=model.getWorldScale(new THREE.Vector3()).x||1;return TRIADE_PX*wpp/TRIADE_RING/ms}
function triadeSkalieren(){if(!triade||!triade.visible||!model)return;const s=triadeMassstab();if(Math.abs(triade.scale.x-s)>s*0.005)triade.scale.setScalar(s)}
// Ringradius der Triade in Pixel (für Tests)
function triadePixel(){if(!triade||!triade.visible)return null;triadeSkalieren();triade.updateMatrixWorld(true);const r=renderer.domElement.getBoundingClientRect();
  const c=triade.getWorldPosition(new THREE.Vector3()),rechts=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize();
  const welt=TRIADE_RING*triade.getWorldScale(new THREE.Vector3()).x;const sp=v=>{const q=v.clone().project(camera);return [(q.x+1)/2*r.width,(1-q.y)/2*r.height]};
  const a=sp(c),b=sp(c.clone().addScaledVector(rechts,welt));return Math.hypot(b[0]-a[0],b[1]-a[1])}
function baueTriade(){
  const g=new THREE.Group();g.name='triade';g.renderOrder=40;
  const pfeil=(farbe,dir,name)=>{const h=new THREE.Group();const mat=new THREE.MeshBasicMaterial({color:farbe,depthTest:false,transparent:true,opacity:.95});
    const schaft=new THREE.Mesh(new THREE.CylinderGeometry(.028,.028,.7,10),mat);schaft.position.y=.36;
    const kopf=new THREE.Mesh(new THREE.ConeGeometry(.075,.22,14),mat);kopf.position.y=.8;
    const treffer=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.95,8),new THREE.MeshBasicMaterial({visible:false}));treffer.position.y=.47;
    h.add(schaft,kopf,treffer);h.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
    h.traverse(o=>{if(o.isMesh){o.userData.griff=name;o.renderOrder=40}});return h};
  const ring=(farbe,dir,name)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(.78,.02,8,48),new THREE.MeshBasicMaterial({color:farbe,depthTest:false,transparent:true,opacity:.9}));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir.clone().normalize());m.userData.griff=name;m.renderOrder=39;
    const treffer=new THREE.Mesh(new THREE.TorusGeometry(.78,.07,6,48),new THREE.MeshBasicMaterial({visible:false}));treffer.userData.griff=name;m.add(treffer);return m};
  g.add(pfeil(0xd24b4b,ACHSE.X,'x'),pfeil(0x3c9a4a,ACHSE.Y,'y'),pfeil(0x3a6fbf,ACHSE.Z,'z'));
  g.add(ring(0xd24b4b,ACHSE.X,'rx'),ring(0x3c9a4a,ACHSE.Y,'ry'),ring(0x3a6fbf,ACHSE.Z,'rz'));
  const kugel=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),new THREE.MeshBasicMaterial({color:0xf2f4f6,depthTest:false}));
  kugel.userData.griff='frei';kugel.renderOrder=41;g.add(kugel);g.visible=false;return g}
function mittelpunkt(ids){const b=new THREE.Box3();ids.forEach(i=>{const body=bodies[i];if(!body)return;if(!body.geometry.boundingBox)body.geometry.computeBoundingBox();
  b.union(body.geometry.boundingBox.clone().applyMatrix4(body.matrix))});return b.isEmpty()?new THREE.Vector3():b.getCenter(new THREE.Vector3())}
function triadeAktualisieren(){const ids=zielIds();const panel=$('bewegenPanel');
  if(!model||!ids.length){if(triade)triade.visible=false;if(panel)panel.hidden=true;return}
  if(!triade)triade=baueTriade();if(triade.parent!==model)model.add(triade);
  if(!zug)triade.position.copy(mittelpunkt(ids));
  triade.visible=true;triadeSkalieren();
  if(panel){const namen=zielKnoten().map(n=>n.name);if($('bewegenName'))$('bewegenName').textContent=namen.join(', ')||'Bauteil';panel.hidden=!bewegenOffen}
  needs=true}
function lies34(i){const e=bodies[i].matrix.elements;return [e[0],e[4],e[8],e[12],e[1],e[5],e[9],e[13],e[2],e[6],e[10],e[14]]}
function setze34(i,m){bodies[i].matrix.set(m[0],m[1],m[2],m[3],m[4],m[5],m[6],m[7],m[8],m[9],m[10],m[11],0,0,0,1);bodies[i].matrixWorldNeedsUpdate=true;if(data)data.inst[i].m=m.slice()}
function snapshot(ids){const o={};ids.forEach(i=>{o[i]=lies34(i)});return o}
function anwendenSnap(o){for(const k of Object.keys(o))setze34(+k,o[k])}
function merke(before){undoStapel.push(before);if(undoStapel.length>100)undoStapel.shift();redoStapel.length=0}
function schiebe(ids,v){ids.forEach(i=>{const e=bodies[i].matrix.elements;e[12]+=v.x;e[13]+=v.y;e[14]+=v.z;bodies[i].matrixWorldNeedsUpdate=true})}
function dreheUm(ids,achse,winkel,mitte){if(!winkel)return;const T=new THREE.Matrix4().makeTranslation(mitte.x,mitte.y,mitte.z);
  const Ti=new THREE.Matrix4().makeTranslation(-mitte.x,-mitte.y,-mitte.z);const R=new THREE.Matrix4().makeRotationAxis(achse.clone().normalize(),winkel);
  const M=new THREE.Matrix4().multiplyMatrices(T,R).multiply(Ti);ids.forEach(i=>{bodies[i].matrix.premultiply(M);bodies[i].matrixWorldNeedsUpdate=true})}
function wahlMitziehen(){const g=wahlMark?.children[0];const ids=wahlMark?.userData.ids||[];if(!g)return;g.children.forEach((m,i)=>{if(bodies[ids[i]])m.matrix.copy(bodies[ids[i]].matrix)})}
function zahlFeld(id){const el=$(id);if(!el)return 0;const v=parseFloat(String(el.value).replace(',','.'));return Number.isFinite(v)?v:0}
function zeigeDelta(d,grad){if($('dx')){$('dx').value=(d?.x||0).toFixed(3);$('dy').value=(d?.y||0).toFixed(3);$('dz').value=(d?.z||0).toFixed(3)}
  if(grad!=null&&$('dWinkel'))$('dWinkel').value=grad.toFixed(3)}
async function nachBewegung(){if(!bodies.length)return;const lagen=bodies.map((_,i)=>lies34(i));lagen.forEach((m,i)=>{if(data)data.inst[i].m=m});
  triadeAktualisieren();hervorheben();
  try{await call('lagen',{m:lagen})}catch(e){console.warn(e)}
  if(sels.length){try{const gehalten=sels.map(s=>({k:s.k,id:s.id,inst:s.inst,p:s.p,...(s.src?{src:s.src}:{})}));
    const opts=messOpts();const r=await call('measure',{sels:gehalten,opts});lastRes={r,sels:gehalten,title:gehalten.map(label).join(' + '),opts};
    marks.clear();gehalten.forEach(s=>marks.add(hiObj(s,0x1f8fd0)));
    messGrafik(r);
    $('selinfo').textContent=gehalten.map(label).join('  +  ');zeigeMessung(r);window.__lastMeasure=r}catch(err){$('mresult').innerHTML=`<div>Fehler</div><div>${err.message}</div>`}}
  await dimsAktualisieren();needs=true}
async function dimsAktualisieren(){if(!dims.length){renderDims();return}
  for(const d of dims){if(!d.sels||!d.typ)continue;try{const r=await call('measure',{sels:d.sels,opts:d.opts||{}});
    const keep={no:d.no,tol:d.tol,praefix:d.praefix,suffix:d.suffix,text:d.text,off:d.off,ang:d.ang,offR:d.offR,title:d.title,refNo:d.refNo,linArt:d.linArt,sperre:d.sperre};
    const festDir=d.dir&&BM.LINEAR.includes(d.typ)&&!['ausgerichtet','kette','basislinie'].includes(d.typ)&&!(d.typ==='linear'&&d.linArt==='ausgerichtet')?d.dir:null;
    const g=baueDim({r,sels:d.sels},d.typ,d.refNo!=null?dims.find(x=>x.no===d.refNo):null);d.r=r;d.sels=d.sels;if(g)Object.assign(d,g,keep);else Object.assign(d,keep);if(festDir&&d.p1&&d.p2){d.dir=festDir;d.wert=Math.abs(BM.V.dot(BM.V.sub(d.p2,d.p1),festDir))}}catch{/* Messung bleibt stehen */}}
  renderDims()}
async function bewege(ids,dx,dy,dz,achse,grad){if(!ids.length)return;const before=snapshot(ids);const v=new THREE.Vector3(dx||0,dy||0,dz||0);
  if(v.lengthSq()>0)schiebe(ids,v);if(grad)dreheUm(ids,ACHSE[achse]||ACHSE.Z,grad*Math.PI/180,mittelpunkt(ids));
  const nach=snapshot(ids);if(JSON.stringify(before)===JSON.stringify(nach))return;merke(before);zeigeDelta(v,grad||0);await nachBewegung()}
async function rueckgaengig(){const before=undoStapel.pop();if(!before)return;redoStapel.push(snapshot(Object.keys(before).map(Number)));anwendenSnap(before);$('status').textContent='Rückgängig';await nachBewegung()}
async function wiederholen(){const next=redoStapel.pop();if(!next)return;undoStapel.push(snapshot(Object.keys(next).map(Number)));anwendenSnap(next);$('status').textContent='Wiederholen';await nachBewegung()}
function resetPos(ids){const aendern=ids.filter(i=>ursprung[i]&&lies34(i).some((v,k)=>Math.abs(v-ursprung[i][k])>1e-9));if(!aendern.length)return Promise.resolve();
  const before=snapshot(aendern);aendern.forEach(i=>setze34(i,ursprung[i]));merke(before);zeigeDelta(new THREE.Vector3(),0);return nachBewegung()}
function strahlModell(cx,cy){const rct=renderer.domElement.getBoundingClientRect();const ndc=new THREE.Vector2(((cx-rct.left)/rct.width)*2-1,-((cy-rct.top)/rct.height)*2+1);
  const rc=new THREE.Raycaster();rc.setFromCamera(ndc,camera);model.updateMatrixWorld();const o=model.worldToLocal(rc.ray.origin.clone());
  const d=model.worldToLocal(rc.ray.origin.clone().add(rc.ray.direction)).sub(o);if(d.lengthSq()<1e-12)d.set(0,0,1);return new THREE.Ray(o,d.normalize())}
function naechsterAufAchse(ray,punkt,achse){const o=ray.origin,d=ray.direction,a=achse.clone().normalize(),w0=o.clone().sub(punkt);
  const b=d.dot(a),c=d.dot(w0),e=a.dot(w0),den=1-b*b;const s=den<1e-8?0:(b*c-e)/den;return punkt.clone().add(a.multiplyScalar(s))}
function fangAchse(v){if(v.lengthSq()<1e-8)return v;const u=v.clone().normalize();let best=null;
  for(const a of [ACHSE.X,ACHSE.Y,ACHSE.Z]){const ad=Math.abs(u.dot(a));if(ad>Math.cos(12*Math.PI/180)&&(!best||ad>best.ad))best={ad,v:a.clone().multiplyScalar(v.dot(a))}}
  return best?best.v:v}
function zugAuf(e){if(!zug)return;const ray=strahlModell(e.clientX,e.clientY);basisZurueck();
  if(zug.art==='frei'||zug.art==='achse'){let delta;
    if(zug.art==='frei'){const hit=new THREE.Vector3();if(!ray.intersectPlane(zug.ebene,hit))return;delta=fangAchse(hit.sub(zug.startHit))}
    else delta=naechsterAufAchse(ray,zug.mitte,zug.achse).sub(zug.startAuf);schiebe(zug.ids,delta);zeigeDelta(delta,0);triade.position.copy(zug.mitte).add(delta)}
  else{const hit=new THREE.Vector3();if(!ray.intersectPlane(zug.ebene,hit))return;const v1=hit.sub(zug.mitte);const v0=zug.startV;
    const w=Math.atan2(v0.clone().cross(v1).dot(zug.achse),v0.dot(v1));dreheUm(zug.ids,zug.achse,w,zug.mitte);zeigeDelta(new THREE.Vector3(),w*180/Math.PI);if($('dAchse'))$('dAchse').value=zug.achsenName}
  wahlMitziehen();needs=true}
function basisZurueck(){zug.ids.forEach(i=>bodies[i].matrix.copy(zug.basis[i]))}
function zugStart(e,griff){const ids=zielIds();if(!ids.length||!triade)return false;const rot=griff.startsWith('r');const achsenName=GRIFF[griff];const achse=(ACHSE[achsenName]||ACHSE.X).clone();
  const mitte=triade.position.clone();const ray=strahlModell(e.clientX,e.clientY);const basis={};ids.forEach(i=>basis[i]=bodies[i].matrix.clone());
  zug={ids,art:griff==='frei'?'frei':rot?'rot':'achse',achse,achsenName,mitte,basis,before:snapshot(ids)};
  if(zug.art==='achse')zug.startAuf=naechsterAufAchse(ray,mitte,achse);
  else{const n=zug.art==='rot'?achse:kameraRichtung();zug.ebene=new THREE.Plane().setFromNormalAndCoplanarPoint(n,mitte);const hit=new THREE.Vector3();
    if(!ray.intersectPlane(zug.ebene,hit)){zug=null;return false}if(zug.art==='frei')zug.startHit=hit.clone();else zug.startV=hit.sub(mitte);if(zug.art==='rot'&&zug.startV.lengthSq()<1e-8){zug=null;return false}}
  controls.enabled=false;try{renderer.domElement.setPointerCapture(e.pointerId)}catch{}return true}
function kameraRichtung(){const n=new THREE.Vector3();camera.getWorldDirection(n);return n.transformDirection(new THREE.Matrix4().copy(model.matrixWorld).invert()).normalize()}
function zugEnde(){if(!zug)return;const vorher=zug.before;const ids=zug.ids;zug=null;zugSperre=true;controls.enabled=true;
  const jetzt=snapshot(ids);if(JSON.stringify(vorher)!==JSON.stringify(jetzt)){merke(vorher);$('status').textContent='Komponente verschoben';nachBewegung()}else needs=true}
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0||!triade?.visible||!model)return;const rct=renderer.domElement.getBoundingClientRect();
  const rc=new THREE.Raycaster();rc.setFromCamera(new THREE.Vector2(((e.clientX-rct.left)/rct.width)*2-1,-((e.clientY-rct.top)/rct.height)*2+1),camera);
  const h=rc.intersectObject(triade,true).find(x=>x.object.userData.griff);if(!h)return;if(zugStart(e,h.object.userData.griff)){e.stopImmediatePropagation();e.preventDefault()}},true);
renderer.domElement.addEventListener('pointermove',e=>{if(!zug)return;e.stopImmediatePropagation();zugAuf(e)},true);
addEventListener('pointerup',e=>{if(zug)zugEnde()},true);
$('btnSchieben')?.addEventListener('click',()=>aktion.verschieben());
$('bewegenZu')?.addEventListener('click',()=>{bewegenOffen=false;$('bewegenPanel').hidden=true});
$('bewegenAnwenden')?.addEventListener('click',()=>{const ids=zielIds();if(!ids.length){$('status').textContent='Bitte zuerst ein Bauteil wählen.';return}
  bewege(ids,zahlFeld('dx'),zahlFeld('dy'),zahlFeld('dz'),$('dAchse').value,zahlFeld('dWinkel'))});
$('posResetTeil')?.addEventListener('click',()=>{const ids=zielIds();if(!ids.length){$('status').textContent='Bitte zuerst ein Bauteil wählen.';return}resetPos(ids);$('status').textContent='Position zurückgesetzt'});
$('posResetAlle')?.addEventListener('click',()=>{resetPos(bodies.map((_,i)=>i));$('status').textContent='Alle Positionen zurückgesetzt'});
function knotenNachName(name){return nodes.find(n=>n.name===name)||null}

// ---------- Test-Schnittstelle ----------
window.__viewMenu=(x,y)=>viewMenu(x,y);window.__loadUrl=async u=>load(await (await fetch(u)).arrayBuffer(),u.split('/').pop());
window.__loadBytes=(buf,name)=>load(buf,name);window.__call=call;
window.__steuerung=()=>({daempfung:controls.enableDamping,autoRotate:controls.autoRotate,autodrehen:drehen,ziel:controls.target.toArray(),pos:camera.position.toArray(),mitte:model?box.getCenter(new THREE.Vector3()).toArray():null});
window.__app={huelle:a=>huelleRechnen(a),schwerpunkt:()=>{$('schwerpunktZeigen').checked=true;return schwerpunktZeigen()},protokollDaten:()=>protokollDatenSammeln(),faltSetzen,faltEnde,faltNetz:()=>faltNetzHolen(),rissSetzen,riss:()=>riss,huellObj:()=>huellObj&&!!huellObj.parent,hoverCount:()=>hoverObj.children.length,camPos:()=>camera.position.toArray(),fitIso:()=>fit(views.iso),dimLabels:()=>dimHits.map(h=>[[h.x,h.y,0],h.no]),exportPng,exportPdf,editDim:no=>editDim(dims.find(d=>d.no===no)),stil:()=>STIL,dims:()=>dims,keepDim,renderDims,copyText,vis:()=>bodies.map(b=>b.visible),selName:()=>selNode?.name,trans:()=>bodies.map(b=>b.material.opacity),act,selectNode,nodes:()=>nodes,ctxMenu,select,clearSel,calcSheet,pickAt,data:()=>data,tab:n=>document.querySelector(`.tab[data-tab="${n}"]`).click(),
  screenOf:p=>{const r=renderer.domElement.getBoundingClientRect();const w=model.localToWorld(V3(p)).project(camera);return [(w.x+1)/2*r.width+r.left,(1-w.y)/2*r.height+r.top]},
  ausrichtung:()=>{const d=camera.position.clone().sub(controls.target).normalize();return {blick:Math.max(...ACHSEN.map(a=>Math.abs(d.dot(a)))),oben:Math.max(...ACHSEN.map(a=>Math.abs(camera.up.dot(a)))),dir:d.toArray(),up:camera.up.toArray()}},
  schief:()=>{if(!model)return;const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3()).length()||1;camera.position.copy(c).add(new THREE.Vector3(.35,.15,1).normalize().multiplyScalar(s*1.7));camera.up.set(.45,.75,.4).normalize();controls.target.copy(c);camera.lookAt(c);controls.update();anim=null;needs=true},
  f9,f10,ansicht:name=>animiereAnsicht(name),animFertig:()=>!anim,werkzeug:()=>werkzeug,
  matrizen:()=>bodies.map((_,i)=>lies34(i)),lagenSync:nachBewegung,
  verschiebe:(name,dx,dy,dz)=>bewege((knotenNachName(name)||selNode)?.all||[],dx,dy,dz,'Z',0),
  drehe:(name,achse,grad)=>bewege((knotenNachName(name)||selNode)?.all||[],0,0,0,achse,grad),
  rueckgaengig,wiederholen,resetPos:name=>resetPos(name?((knotenNachName(name)||{all:[]}).all):bodies.map((_,i)=>i)),resetAlle:()=>resetPos(bodies.map((_,i)=>i)),
  gizmo:()=>!!(triade&&triade.visible),triadePixel,triadeSkala:()=>triade?.scale.x,auswahlAufheben,sels:()=>sels.slice(),triadePos:()=>triade?triade.position.toArray():null,
  oeffneBewegen:()=>selNode&&act('move',selNode),modell:()=>data?.model,neuMessen,messOpts,bemassungenText,bemassungenEinlesen,festSetzen,fest:()=>fest,letzteMessung:()=>lastRes,blech:()=>sheetCache,
  deltaLinien:()=>marks.children.filter(o=>o.userData.delta).map(o=>o.userData.delta),namen:()=>nodes.map(n=>n.name),ausgeblendet:()=>nodes.filter(n=>!visible(n)).map(n=>n.name)};
window.__toggleMeasure=()=>{};
