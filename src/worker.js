import {createBrep,hierFromImport} from './brep.js';
let B=null,initP=null,oiP=null;
function occtImport(base){if(!oiP)oiP=(async()=>{const t=await (await fetch(base+'occt/occt-import-js.js')).text();(0,eval)(t+'\n;self.__oi=occtimportjs;');return await self.__oi({locateFile:f=>base+'occt/'+f})})();return oiP}
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
    else if(cmd==='load'){const bytes=new Uint8Array(args.buf);let hier=null;
      try{hier=hierFromImport(await occtImport(args.base),bytes)}catch(e){hier=null}
      r=B.load(bytes,args.name,hier);r.model=B.model();r.hierOk=!!hier}
    else if(cmd==='props')r=B.solidProps(args.ids);
    else if(cmd==='measure')r=B.measure(args.sels);
    else if(cmd==='sheet'){r=B.sheet(args.K,args.solid);if(r.flat)r.dxf=B.dxf(r.flat)}
    const tr=[];if(cmd==='load')r.meshes.forEach(m=>tr.push(m.p.buffer,m.i.buffer,m.f.buffer));
    self.postMessage({id,ok:true,r},tr);
  }catch(err){
    const m=String(err&&err.message||err);
    self.postMessage({id,ok:false,error:/[äöüÄÖÜß]|konnte|nicht/.test(m)?m:'Interner Geometriefehler ('+m.slice(0,80)+')'});
  }
};
