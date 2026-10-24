import assert from 'node:assert/strict';

/** Hält reale Worker-Kommandos an; weder Geometrie noch Ergebnisse werden gemockt. */
export async function checkDokumenteAsyncUi(page,{loadPart,loadAssembly,loadSheet}) {
  for(const d of await page.evaluate(()=>window.__dokumente()))await page.evaluate(id=>window.__dokumentSchliessen(id),d.id);
  await loadPart();const a=await page.evaluate(()=>window.__dokumente().find(d=>d.aktiv));
  await loadAssembly();const b=await page.evaluate(()=>window.__dokumente().find(d=>d.aktiv));
  await page.evaluate(()=>{
    const send=Worker.prototype.postMessage;
    window.__realWorkerSend=send;window.__heldWorkerCommand=null;window.__gateCommand=null;window.__workerCommandHistory=[];
    Worker.prototype.postMessage=function(message,...args){
      window.__workerCommandHistory.push(message.cmd);
      if(message.cmd===window.__gateCommand){window.__gateCommand=null;window.__heldWorkerCommand=()=>send.call(this,message,...args);return}
      return send.call(this,message,...args);
    };
  });
  const arm=cmd=>page.evaluate(cmd=>{window.__heldWorkerCommand=null;window.__gateCommand=cmd;window.__workerCommandHistory=[]},cmd);
  const held=()=>page.waitForFunction(()=>window.__heldWorkerCommand);
  const release=()=>page.evaluate(()=>{const send=window.__heldWorkerCommand;window.__heldWorkerCommand=null;send()});
  const active=()=>page.evaluate(()=>window.__dokumente().find(d=>d.aktiv)?.id);
  try{
    await page.evaluate(id=>window.__dokumentAktivieren(id),a.id);
    await arm('measure');const measurement=page.evaluate(()=>{window.__app.clearSel();return window.__app.select({k:'edge',id:0,inst:0})});await held();
    const switching=page.evaluate(id=>window.__dokumentAktivieren(id),b.id);
    await page.waitForFunction(()=>document.getElementById('dokumentAnsicht').inert);assert.equal(await active(),a.id,'Sekmenwechsel wartet auf laufende Messung');
    await release();await Promise.all([measurement,switching]);assert.equal(await active(),b.id);assert.equal(await page.evaluate(()=>window.__lastMeasure),null);
    // Info-Batch misst die beiden ausgewählten Flächen wirklich nach.
    await page.evaluate(id=>window.__dokumentAktivieren(id),a.id);
    await page.evaluate(async()=>{const app=window.__app;app.clearSel();app.tab('messen');const ids=app.data().uniq[0].faces.map((f,i)=>f.type==='eben'?i:-1).filter(i=>i>=0).slice(0,2);for(const id of ids)await app.select({k:'face',id,inst:0});document.getElementById('infoFlaechen').checked=true});
    await arm('measure');const information=page.evaluate(()=>document.getElementById('keepInfo').onclick());await held();
    const closing=page.evaluate(id=>window.__dokumentSchliessen(id),a.id);await page.waitForFunction(()=>document.getElementById('dokumentAnsicht').inert);assert.equal(await active(),a.id);
    await release();await Promise.all([information,closing]);assert.equal(await active(),b.id);assert.equal(await page.evaluate(()=>window.__app.dims().length),0,'A-Info darf nicht in B auftauchen');
    // Auch Laden/BREP-Anhängen darf einen anschließend geschlossenen Tab nicht wieder anlegen.
    const desktop=await page.evaluate(()=>!!window.__TAURI_INTERNALS__);
    await arm(desktop?'attach':'load');const loading=loadPart();await held();
    const pendingId=await active();assert.notEqual(pendingId,b.id);const closeLoading=page.evaluate(id=>window.__dokumentSchliessen(id),pendingId);
    await release();await Promise.all([loading,closeLoading]);assert.equal(await active(),b.id);assert.equal((await page.evaluate(()=>window.__dokumente())).length,1);
    // Reale STEP-Ausgabe aus A, während der Wechsel nach B vorgemerkt ist.
    await loadPart();const newA=await active();
    const oldExport=await page.evaluate(()=>{const old=localStorage.getItem('export');localStorage.setItem('export','wasm');return old});
    await arm('stepSchreiben');
    const exporting=page.evaluate(async()=>{const root=window.__app.nodes()[0];const out=await window.__einzelteil.exportieren([{name:'Dokument-A',teile:window.__einzelteil.teile(root.id,'baugruppe')}],'AP214','temp');return out?.map(d=>typeof d==='string'?d:{...d,bytes:Array.from(d.bytes)})});await held();
    const changeDuringExport=page.evaluate(id=>window.__dokumentAktivieren(id),b.id);await page.waitForFunction(()=>document.getElementById('dokumentAnsicht').inert);assert.equal(await active(),newA);
    await release();const [exported]=await Promise.all([exporting,changeDuringExport]);assert.equal(await active(),b.id);assert(exported?.length===1);
    await page.evaluate(value=>{if(value==null)localStorage.removeItem('export');else localStorage.setItem('export',value)},oldExport);
    if(desktop)await page.evaluate(path=>window.__oeffnePfad(path),exported[0]);
    else await page.evaluate(({bytes,name})=>window.__loadBytes(Uint8Array.from(bytes).buffer,name),{bytes:Array.from(exported[0].bytes),name:exported[0].name});
    assert.equal(await page.evaluate(()=>window.__lastLoad.bodies),1,'A-Export darf nicht Bs fünf Körper enthalten');
    // Native BREP-Ausgabe nach A→B→A, unabhängig vom vorherigen WASM-Export.
    if(desktop){
      await page.evaluate(id=>window.__dokumentAktivieren(id),b.id);await page.evaluate(id=>window.__dokumentAktivieren(id),newA);
      const nativeExport=await page.evaluate(()=>{const root=window.__app.nodes()[0];return window.__einzelteil.exportieren([{name:'Dokument-A-nativ',teile:window.__einzelteil.teile(root.id,'baugruppe')}],'AP214','temp')});
      assert.equal(await page.evaluate(()=>window.__stepKernel),'nativ','Native Exportprüfung darf nicht unbemerkt auf WASM zurückfallen');
      await page.evaluate(path=>window.__oeffnePfad(path),nativeExport[0]);assert.equal(await page.evaluate(()=>window.__lastLoad.bodies),1);
      const radius=await page.evaluate(async()=>{const u=window.__app.data().uniq[0],id=u.edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-5);const r=await window.__call('measure',{sels:[{k:'edge',inst:0,id}],opts:{messart:'radius'}});return r.label[1]});assert(Math.abs(radius-5)<1e-6);
    }
    let pendingFold=false;
    if(loadSheet){
      await loadSheet('Falt-A.step');const foldA=await active();await page.evaluate(async()=>{window.__app.tab('blech');await window.__app.calcSheet()});
      await arm(desktop?'attach':'load');const openingSheet=loadSheet('Falt-B.step');await held();
      assert.equal(await page.evaluate(()=>window.__workerCommandHistory.includes('sheet')),false,'Geerbtes Blech wartet auf die Messdaten des neuen Dokuments');
      await release();await openingSheet;const foldB=await active();
      assert.equal(await page.locator('#sheeterr').innerText(),'');
      assert(await page.evaluate(()=>!!window.__app.blech()?.faltung));
      await page.evaluate(id=>window.__dokumentAktivieren(id),foldA);await arm('faltNetz');
      const startingFold=page.evaluate(()=>document.getElementById('faltPlay').onclick());await held();
      const changeDuringFold=page.evaluate(id=>window.__dokumentAktivieren(id),foldB);await release();await Promise.all([startingFold,changeDuringFold]);
      await page.evaluate(()=>new Promise(r=>{let n=0;const frame=()=>++n===12?r():requestAnimationFrame(frame);requestAnimationFrame(frame)}));
      assert((await page.evaluate(()=>window.__app.vis())).every(Boolean),'Späte Falt-Animation aus A darf Bs Blech nicht entfalten');assert.equal(await page.locator('#faltRegler').inputValue(),'0');pendingFold=true;
    }
    return {pendingMeasure:true,pendingInfoClose:true,pendingLoadClose:true,pendingExport:true,pendingFold,inheritedSheetReady:pendingFold,exportBodyCount:1,nativeExportReadback:desktop};
  }finally{
    await page.evaluate(()=>{if(window.__heldWorkerCommand)window.__heldWorkerCommand();Worker.prototype.postMessage=window.__realWorkerSend;delete window.__heldWorkerCommand;delete window.__gateCommand;delete window.__realWorkerSend});
  }
}
