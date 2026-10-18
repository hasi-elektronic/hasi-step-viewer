import {createBrep} from './brep.js';
import {parseStepHierarchy} from './stephier.js';
let B=null,initP=null;
async function init(base){
  const {default:f}=await import(/* @vite-ignore */ base+'ocjs/opencascade.wasm.js');
  const wasmBinary=await (await fetch(base+'ocjs/opencascade.wasm.wasm')).arrayBuffer();
  B=createBrep(await new f({wasmBinary,print:()=>{},printErr:()=>{}}));
}
self.onmessage=async e=>{const {id,cmd,args}=e.data;
  try{
    if(!initP)initP=init(args.base);await initP;
    let r;
    if(cmd==='init')r=true;
    else if(cmd==='load'){const bytes=new Uint8Array(args.buf);let hier=null;const th=Date.now();
      try{hier=parseStepHierarchy(bytes)}catch(e){hier=null}const thier=Date.now()-th;
      const prog=t=>self.postMessage({id,progress:t});
      r=B.load(bytes,args.name,hier,prog);r.times.namen=thier;prog('Volumen und Masse werden berechnet …');const tm=Date.now();r.model=B.inst.length>50?B.modelFast():B.model();r.times.modell=Date.now()-tm;r.hierOk=!!hier}
    else if(cmd==='props')r=B.solidProps(args.ids);
    else if(cmd==='measure')r=B.measure(args.sels);
    else if(cmd==='sheet'){r=B.sheet(args.K,args.inst);if(r.flat)r.dxf=B.dxf(r.flat)}
    const tr=[];if(cmd==='load')r.uniq.forEach(m=>tr.push(m.p.buffer,m.i.buffer,m.f.buffer));
    self.postMessage({id,ok:true,r},tr);
  }catch(err){
    const m=String(err&&err.message||err);
    self.postMessage({id,ok:false,error:/[äöüÄÖÜß]|konnte|nicht/.test(m)?m:'Interner Geometriefehler ('+m.slice(0,80)+')'});
  }
};
