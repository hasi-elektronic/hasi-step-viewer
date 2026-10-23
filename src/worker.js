import {createBrep} from './brep.js';
import {parseStepHierarchy} from './stephier.js';
// Der WASM-Kern (opencascade.js, ~66 MB) lädt im Hintergrund. Die Anzeige aus dem nativen Kern (loadNative) wartet nicht auf ihn;
// alle anderen Befehle warten, bis er bereit ist.
const B=createBrep(null);let initP=null;
function init(base){
  if(!initP)initP=(async()=>{const {default:f}=await import(/* @vite-ignore */ base+'ocjs/opencascade.wasm.js');
    const wasmBinary=await (await fetch(base+'ocjs/opencascade.wasm.wasm')).arrayBuffer();
    B.setOC(await new f({wasmBinary,print:()=>{},printErr:()=>{}}))})();
  return initP}
self.onmessage=async e=>{const {id,cmd,args}=e.data;
  try{
    const p=init(args.base);if(cmd!=='loadNative')await p;else p.catch(()=>{});
    let r;
    if(cmd==='init')r=true;
    else if(cmd==='load'){const bytes=new Uint8Array(args.buf);let hier=null;const th=Date.now();
      try{hier=parseStepHierarchy(bytes)}catch(e){hier=null}const thier=Date.now()-th;
      const prog=t=>self.postMessage({id,progress:t});
      r=B.load(bytes,args.name,hier,prog);r.times.namen=thier;prog('Volumen und Masse werden berechnet …');const tm=Date.now();r.model=B.inst.length>50?B.modelFast():B.model();r.times.modell=Date.now()-tm;r.hierOk=!!hier}
    else if(cmd==='loadNative'){const bytes=new Uint8Array(args.step);let hier=null;const th=Date.now();
      try{hier=parseStepHierarchy(bytes)}catch(e){hier=null}const thier=Date.now()-th;
      r=B.fromNative(args.bin,bytes,args.name,hier);r.times.namen=thier;const tm=Date.now();r.model=B.modelFast();r.times.modell=Date.now()-tm;r.hierOk=!!hier}
    else if(cmd==='attach')r=B.attachBrep(args.text);
    else if(cmd==='lagen')r=B.lagen(args.m);
    else if(cmd==='stepSchreiben')r=B.stepSchreiben(args);
    else if(cmd==='props')r=B.solidProps(args.ids);
    else if(cmd==='modell')r=args.schnell?B.modelFast(args.ids):B.model(args.ids);
    else if(cmd==='huelle')r=B.huelle(args.opts||{});
    else if(cmd==='faltNetz')r=B.faltNetz(args.netz);
    else if(cmd==='measure')r=B.measure(args.sels,args.opts||{});
    else if(cmd==='vorschau')r=B.vorschau(args.a,args.b);
    else if(cmd==='abmessungen')r=B.abmessungen(args.opts||{});
    else if(cmd==='offen')r=B.offen(args.ids);
    else if(cmd==='sheet'){r=B.sheet(args.opts??args.K,args.inst);if(r.flat&&!r.flat.incomplete){r.dxf=B.dxf(r.flat,{beschriftung:!!(args.opts&&args.opts.beschriftung)});try{const o=args.opts||{};r.geo=B.geo(r.flat,{name:o.name,werkstoff:o.werkstoffGeo,dicke:r.t,bends:r.bends.map(b=>({ang:b.ang,ri:b.ri,bd:b.bd,dir:b.dir}))});r.geoStat=B.letzteGeo}catch(e){r.geoFehler=e.message}}}
    const tr=[];if(cmd==='load')r.uniq.forEach(m=>tr.push(m.p.buffer,m.i.buffer,m.f.buffer));if(cmd==='stepSchreiben')tr.push(r.buffer);
    self.postMessage({id,ok:true,r},tr);
  }catch(err){
    const m=String(err&&err.message||err);
    self.postMessage({id,ok:false,error:/[äöüÄÖÜß]|konnte|nicht/.test(m)?m:'Interner Geometriefehler ('+m.slice(0,80)+')'});
  }
};
