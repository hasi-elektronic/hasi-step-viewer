let occtP=null;
self.onmessage=async(e)=>{
  try{
    if(!occtP){ importScripts(e.data.base+'occt/occt-import-js.js'); occtP=occtimportjs({locateFile:f=>e.data.base+'occt/'+f}); }
    const occt=await occtP; const t0=performance.now();
    const r=occt.ReadStepFile(new Uint8Array(e.data.buf),null);
    if(!r.success) throw new Error('STEP konnte nicht gelesen werden');
    const tr=[]; const meshes=r.meshes.map(m=>{const p=new Float32Array(m.attributes.position.array),n=m.attributes.normal?new Float32Array(m.attributes.normal.array):null,i=new Uint32Array(m.index.array);tr.push(p.buffer,i.buffer);if(n)tr.push(n.buffer);return{name:m.name,color:m.color,p,n,i}});
    self.postMessage({ok:true,meshes,root:r.root,parseMs:performance.now()-t0},tr);
  }catch(err){self.postMessage({ok:false,error:/konnte/.test(String(err.message))?err.message:'Die Datei ist beschädigt oder kein gültiges STEP-Format.'})}
};
