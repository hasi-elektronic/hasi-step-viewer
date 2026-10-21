// Gemeinsame DXF-Prüfwerkzeuge für tools/test-blech2.mjs (eigener Gruppencode-Leser + ezdxf), gleiche Logik wie tools/test-dxf.mjs.
import assert from 'assert';import os from 'os';import path from 'path';import {execFileSync} from 'child_process';
const PI=Math.PI;
// Eigener Leser: Gruppencode/Wert-Paare → Header, Layer, Entities
export function lies(txt){const z=txt.split(/\r?\n/);assert(z.length%2===1||z.at(-1)==='','DXF: ungerade Zeilenzahl');const p=[];for(let i=0;i+1<z.length;i+=2)p.push([+z[i].trim(),z[i+1]]);
  assert(p.at(-1)[1]==='EOF','DXF endet nicht mit EOF');const hdr={},lay=[],ent=[];let sek=null,cur=null,hv=null;
  for(const [c,v] of p){if(c===0&&v==='SECTION'){sek='?';continue}if(c===2&&sek==='?'){sek=v;continue}if(c===0&&v==='ENDSEC'){sek=null;cur=null;continue}
    if(sek==='HEADER'){if(c===9)hv=v;else if(hv){hdr[hv]=v;hv=null}}
    else if(sek==='TABLES'){if(c===0)cur=v==='LAYER'?{}:null;if(cur&&c===2){cur.name=v;lay.push(v)}}
    else if(sek==='ENTITIES'){if(c===0){cur={typ:v,g:[]};ent.push(cur)}else cur.g.push([c,v])}}
  for(const e of ent){const w=c=>e.g.find(x=>x[0]===c)?.[1];e.layer=w(8);if(e.typ==='CIRCLE')e.c=[+w(10),+w(20)],e.r=+w(40);
    if(e.typ==='LWPOLYLINE'){e.zu=(+w(70)&1)===1;e.n=+w(90);e.pts=[];for(const [c,v] of e.g){if(c===10)e.pts.push({x:+v,b:0});if(c===20)e.pts.at(-1).y=+v;if(c===42)e.pts.at(-1).b=+v}
      assert.equal(e.pts.length,e.n,'LWPOLYLINE: Punktzahl ≠ 90')}}
  return {hdr,lay,ent}}
// Ausdehnung einer LWPOLYLINE mit Bulges (Bogen-Extrempunkte mitgezählt)
export function ausdehnung(ents){let mn=[1e18,1e18],mx=[-1e18,-1e18];const add=(x,y)=>{mn=[Math.min(mn[0],x),Math.min(mn[1],y)];mx=[Math.max(mx[0],x),Math.max(mx[1],y)]};
  for(const e of ents){if(e.typ==='CIRCLE'){add(e.c[0]-e.r,e.c[1]-e.r);add(e.c[0]+e.r,e.c[1]+e.r)}
    if(e.typ==='LWPOLYLINE')e.pts.forEach((a,i)=>{add(a.x,a.y);const b=e.pts[(i+1)%e.pts.length];if(!a.b||(!e.zu&&i===e.pts.length-1))return;
      const th=4*Math.atan(a.b),dx=b.x-a.x,dy=b.y-a.y,ch=Math.hypot(dx,dy),r=ch/(2*Math.sin(Math.abs(th)/2));const mxp=(a.x+b.x)/2,myp=(a.y+b.y)/2,dd=r*Math.cos(Math.abs(th)/2),s=Math.sign(th)*(Math.abs(th)>PI?-1:1);
      const cx=mxp-dy/ch*dd*s,cy=myp+dx/ch*dd*s;const a0=Math.atan2(a.y-cy,a.x-cx);for(let k=0;k<=64;k++){const t=a0+th*k/64;add(cx+r*Math.cos(t),cy+r*Math.sin(t))}})}
  return [mx[0]-mn[0],mx[1]-mn[1]]}
// ezdxf finden (CI: notfalls in ein venv installieren)
export function python(){const kand=[process.env.PYTHON,'python3','python'].filter(Boolean);
  for(const p of kand){try{execFileSync(p,['-c','import ezdxf'],{stdio:'ignore'});return p}catch{}}
  if(!process.env.CI)return null;const venv=path.join(os.tmpdir(),'ezdxf-venv'),vp=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
  try{execFileSync('python3',['-m','venv',venv],{stdio:'inherit'});execFileSync(vp,['-m','pip','install','-q','ezdxf'],{stdio:'inherit'});return vp}
  catch{execFileSync('python3',['-m','pip','install','-q','--user','--break-system-packages','ezdxf'],{stdio:'inherit'});return 'python3'}}
export const PY=python();
export const ezdxf=(dateien,png)=>JSON.parse(execFileSync(PY,['tools/pruefe-dxf.py',...dateien,...(png?['--png',png]:[])],{encoding:'utf8'}));

