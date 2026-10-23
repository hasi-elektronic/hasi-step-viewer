import assert from 'node:assert/strict';

/** Dieselben Dokument-/Automatik-Szenarien im Browser und im echten Paket. */
export async function checkDokumenteUi(page,{loadPart,loadAssembly,loadExtra}) {
  const docs=()=>page.evaluate(()=>window.__dokumente());
  for(const d of await docs())await page.evaluate(id=>window.__dokumentSchliessen(id),d.id);
  await loadPart();const a=(await docs())[0];assert(a);
  await page.evaluate(()=>{window.__savedDocumentA=window.__app.data();window.__app.tab('messen');window.__app.clearSel()});
  const ids=await page.evaluate(()=>{const u=window.__app.data().uniq[0];return {
    arc:u.edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-6&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-5*Math.SQRT2)<1e-5),
    full:u.edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-6&&Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))<1e-5),
    line:u.edges.findIndex(e=>e.type==='Gerade'&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-95)<1e-5)
  }});
  assert(Object.values(ids).every(id=>id>=0),'Analytische Referenzkanten fehlen');
  const clickEdge=async id=>{
    let xy=null;
    for(const view of ['iso','unten','oben','vorne','hinten','rechts','links']){
      await page.evaluate(view=>window.__app.ansicht(view),view);await page.waitForFunction(()=>window.__app.animFertig());
      xy=await page.evaluate(id=>{const a=window.__app,e=a.data().uniq[0].edges[id],pts=e.pts.length>2?e.pts.slice(1,-1):[.2,.35,.5,.65,.8].map(t=>e.pts[0].map((x,i)=>x+(e.pts[1][i]-x)*t));
        for(const p of pts){const xy=a.screenOf(p),s=a.pickAt(...xy);if(s?.k==='edge'&&s.id===id&&s.inst===0&&document.elementFromPoint(...xy)?.id==='buehne')return xy}return null},id);
      if(xy)break;
    }
    assert(xy,'Sichtbarer Auto-Kantenfang fehlt: '+id);await page.mouse.click(...xy);await page.waitForFunction(()=>window.__lastMeasure?.automatik);
  };
  const detected=[];
  for(const [edge,id,type,value] of [[ids.arc,'radius','radius',5],[ids.full,'durchmesser','durchmesser',10],[ids.line,'laenge','ausgerichtet',95]]){
    await page.evaluate(()=>window.__app.clearSel());await page.selectOption('#messart','auto');await clickEdge(edge);
    assert.equal(await page.locator('#messart').inputValue(),'auto');assert(await page.locator('#autoErkannt').isVisible());
    const result=await page.evaluate(()=>window.__lastMeasure.automatik);assert.equal(result.id,id);
    await page.locator('#keepDim').click();const dim=await page.evaluate(()=>window.__app.dims().at(-1));assert.equal(dim.typ,type);assert(Math.abs(dim.wert-value)<1e-6);detected.push(id);
  }
  await page.locator('#keepInfo').click();await page.waitForFunction(()=>window.__app.dims().some(d=>d.typ==='info'));
  const search=await page.evaluate(async()=>{const app=window.__app,n=app.nodes().find(n=>n.all.length===1);app.selectNode(n);await app.verschiebe(n.name,5,0,0);await app.act('toggle',n);app.schief();window.__setCut('X',350);return n.name});
  await page.locator('#treeSearch').fill(search);const treeRows=await page.locator('#tree .trow').count();assert(treeRows>0);
  const state=()=>page.evaluate(()=>({camera:window.__steuerung(),matrices:window.__app.matrizen(),vis:window.__app.vis(),dims:window.__app.dims(),cut:[document.getElementById('axis').value,document.getElementById('cut').value],search:document.getElementById('treeSearch').value}));
  const original=await state();await loadAssembly();const b=(await docs()).find(d=>d.aktiv);assert.notEqual(b.id,a.id);assert.equal((await docs()).length,2);
  await page.evaluate(async()=>{const app=window.__app,n=app.nodes().find(n=>n.all.length===1);app.selectNode(n);await app.verschiebe(n.name,10,0,0);await app.rueckgaengig()});
  await page.evaluate(id=>window.__dokumentAktivieren(id),a.id);
  const restored=await state();assert.deepEqual(restored.matrices,original.matrices);assert.deepEqual(restored.vis,original.vis);assert.deepEqual(restored.dims,original.dims);assert.deepEqual(restored.cut,original.cut);assert.equal(restored.search,original.search);
  for(const k of ['pos','up','ziel'])for(let i=0;i<3;i++)assert(Math.abs(restored.camera[k][i]-original.camera[k][i])<1e-7,'Kamera bleibt unverändert: '+k);
  assert(await page.evaluate(()=>window.__app.data()===window.__savedDocumentA),'Sekmenwechsel darf Modell nicht erneut importieren');
  assert.equal(await page.locator('#tree .trow').count(),treeRows);
  const checkbox=page.locator('#tree .trow input[type=checkbox]').last();assert.equal(await checkbox.isChecked(),false);await checkbox.check();await page.waitForFunction(()=>window.__app.vis()[0]);
  await page.locator('#treeSearch').fill('');await page.evaluate(()=>window.__setCut('',500));
  await page.evaluate(()=>window.__app.rueckgaengig());assert(Math.abs((await state()).matrices[0][3]-original.matrices[0][3]+5)<1e-7,'A hat seinen eigenen Undo-Stapel');
  // Fehlerhafte neue Datei lässt A/B unverändert und blockiert weitere Dateien nicht.
  await page.evaluate(()=>window.__loadBytes(new Uint8Array([1,2,3]).buffer,'defekt.step'));assert.equal((await docs()).length,2);assert.equal((await docs()).find(d=>d.aktiv).id,a.id);
  // Mehrere Aufträge sofort, ohne die vorherige Datei abzuwarten.
  await loadExtra();assert.deepEqual((await docs()).map(d=>d.name),[a.name,b.name,'C.step','D.step','E.step','F.step']);
  const all=await docs();assert.equal(await page.locator('[role=tab]').count(),all.length);
  await page.evaluate(id=>window.__dokumentAktivieren(id),a.id);await page.keyboard.press('Control+Tab');
  await page.waitForFunction(id=>window.__dokumente().find(d=>d.aktiv)?.id!==id,a.id);
  await page.keyboard.press('Control+Shift+Tab');await page.waitForFunction(id=>window.__dokumente().find(d=>d.aktiv)?.id===id,a.id);
  await page.locator('[role=tab][aria-selected=true]').focus();await page.keyboard.press('End');await page.waitForFunction(()=>window.__dokumente().at(-1).aktiv);
  await page.keyboard.press('Home');await page.waitForFunction(()=>window.__dokumente()[0].aktiv);
  const last=(await docs()).at(-1);await page.locator(`[data-document="${last.id}"] .datei-schliessen`).click();await page.waitForFunction(id=>!window.__dokumente().some(d=>d.id===id),last.id);assert.equal((await docs()).find(d=>d.aktiv).id,a.id);
  await page.keyboard.press('Control+W');await page.waitForFunction(id=>!window.__dokumente().some(d=>d.id===id),a.id);assert(await page.locator('[role=tab][aria-selected=true]').evaluate(el=>el===document.activeElement));
  await loadPart();const reopened=(await docs()).find(d=>d.aktiv);
  for(const d of await docs())if(d.id!==reopened.id)await page.evaluate(id=>window.__dokumentSchliessen(id),d.id);
  assert.equal((await docs()).length,1);await page.locator('.dateitab.aktiv .datei-schliessen').click();await page.waitForFunction(()=>window.__dokumente().length===0);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const resources=await page.evaluate(()=>window.__dokumentRessourcen());assert.equal(resources.worker,0);assert.equal(resources.geometrien,0,'Geschlossene Dokumente geben ihre gerenderten GPU-Geometrien frei');
  assert.equal(await page.evaluate(()=>window.__app.data()),null);assert.equal(await page.locator('#tree .trow').count(),0);
  await loadPart();assert.equal((await docs()).length,1);
  return {autoDetected:detected,cameraPreserved:true,dimensionsPreserved:true,visibilityPreserved:true,cutPreserved:true,undoIsolated:true,noReimport:true,errorIsolation:true,queuedFiles:true,keyboardTabs:true,closeReopen:true};
}
