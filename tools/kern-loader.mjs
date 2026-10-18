// Test-Lader: mit KERN=native läuft B.load über den nativen Kern (hasi-kern) statt über den WASM-Transfer.
// Pfad zum Programm: HASI_KERN (Standard: kern/build/hasi-kern). Gemessen wird danach wie in der App auf dem nachgeladenen BREP.
import {createBrep as base} from '../src/brep.js';import {parseStepHierarchy} from '../src/stephier.js';
import {execFileSync} from 'child_process';import fs from 'fs';import os from 'os';import path from 'path';
export function createBrep(oc){const B=base(oc);if(process.env.KERN!=='native')return B;
  const exe=process.env.HASI_KERN||path.resolve('kern/build/hasi-kern'+(process.platform==='win32'?'.exe':''));
  B.load=(bytes,name='modell.step',hier=null)=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hk-'));const f=path.join(dir,'ein.step');fs.writeFileSync(f,bytes);
    execFileSync(exe,[f,dir,...(process.env.KERN_PRUEFEN?['--pruefen']:[])],{stdio:['ignore','ignore','pipe']});
    const bin=fs.readFileSync(path.join(dir,'modell.bin'));const buf=bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.length);
    if(!hier){try{hier=parseStepHierarchy(bytes)}catch{hier=null}}
    const r=B.fromNative(buf,bytes,name,hier);B.attachBrep(fs.readFileSync(path.join(dir,'modell.brep'),'latin1'));fs.rmSync(dir,{recursive:true,force:true});
    if(r.kern.modus!=='parallel'&&!process.env.KERN_SERIELL_OK)throw new Error('Nativer Kern lief im Rückfall-Modus: '+r.kern.modus);
    return r};
  return B}
