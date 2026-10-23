import assert from 'node:assert/strict';
export async function checkMessinformationenUi(page,{loadAssembly}) {
  await loadAssembly();await page.waitForFunction(()=>window.__app.animFertig());await page.evaluate(async()=>{const a=window.__app;a.tab('messen');await a.messartSetzen('auto');a.clearSel()});
  const ids=await page.evaluate(async()=>{
    const a=window.__app,inst=a.nodes().find(n=>n.name==='Klotz').all[0],faces=a.data().uniq[a.data().inst[inst].u].faces;
    for(let id=1;id<faces.length;id++){const r=await window.__call('measure',{sels:[{k:'face',id:0,inst},{k:'face',id,inst}],opts:{}});if(r.edrw?.parallel&&Math.abs(r.edrw.normal-20)<1e-5)return {inst,ids:[0,id]}}throw new Error('Gegenflächen am 20-mm-Würfel fehlen');
  });
  await page.evaluate(async({inst,ids})=>{const a=window.__app;await a.select({k:'face',inst,id:ids[0]});await a.select({k:'face',inst,id:ids[1]},true)},ids);
  await page.locator('.mess-info-optionen').evaluate(e=>e.open=true);
  await page.locator('#infoFlaechen').check();await page.locator('#infoBezug').check();await page.locator('#infoKoordinaten').uncheck();
  await page.locator('#keepInfo').click();await page.waitForFunction(()=>window.__app.dims().filter(d=>d.typ==='info').length===3);
  let cards=await page.evaluate(()=>window.__app.dims().filter(d=>d.typ==='info'));
  assert(cards[0].r.rows.some(r=>/Normaler Abstand|Abstand senkrecht/.test(r[0])&&Math.abs(r[1]-20)<1e-6));
  for(const d of cards.slice(1)){assert(Math.abs(d.r.rows.find(r=>r[0]==='Flächeninhalt')[1]-400)<1e-6);assert(Math.abs(d.r.rows.find(r=>r[0]==='Umfang (gesamt)')[1]-80)<1e-6);assert.deepEqual(d.p,d.r.messpunkt)}
  const matrices=await page.evaluate(()=>window.__app.matrizen());
  const last=cards.at(-1);
  await page.waitForFunction(no=>window.__app.dimLabels().some(h=>h[1]===no&&h[0].every(Number.isFinite)),last.no,{timeout:15000}).catch(async error=>{throw new Error('Informationsfeld wurde nicht gezeichnet: '+JSON.stringify(await page.evaluate(()=>({labels:window.__app.dimLabels(),camera:window.__steuerung(),cards:window.__app.dims().filter(d=>d.typ==='info').map(d=>({no:d.no,p:d.p,off:d.off}))}))),{cause:error})});
  const pos=await page.evaluate(no=>window.__app.dimLabels().find(h=>h[1]===no)?.[0],last.no);assert(pos);
  const canvas=await page.locator('#buehne').boundingBox();await page.mouse.move(canvas.x+pos[0],canvas.y+pos[1]);await page.mouse.down();await page.mouse.move(canvas.x+pos[0]+55,canvas.y+pos[1]+30,{steps:6});await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>window.__app.matrizen()),matrices);
  const dragged=await page.evaluate(no=>window.__app.dims().find(d=>d.no===no).off,last.no);assert.notDeepEqual(dragged,last.off);
  // Neue globale Einstellungen dürfen bereits gemerkte Karten nicht verändern.
  await page.locator('#infoFlaechen').uncheck();
  await page.evaluate(async()=>{const a=window.__app;await a.verschiebe('Klotz',5,0,0);await a.rueckgaengig()});
  cards=await page.evaluate(()=>window.__app.dims().filter(d=>d.typ==='info'));assert(cards.every(d=>d.infoOptionen.flaechen));
  const snapshot=JSON.parse(JSON.stringify(cards.map(d=>({sels:d.sels,opts:d.opts,off:d.off,p:d.p,infoOptionen:d.infoOptionen}))));
  const json=await page.evaluate(()=>window.__app.bemassungenText());
  await page.locator('#messenErweitert').evaluate(e=>e.open=true);await page.locator('#dimClear').click();
  await page.evaluate(text=>window.__app.bemassungenEinlesen(text),json);
  assert.deepEqual(await page.evaluate(()=>window.__app.dims().filter(d=>d.typ==='info').map(d=>({sels:d.sels,opts:d.opts,off:d.off,p:d.p,infoOptionen:d.infoOptionen}))),snapshot);
  await page.evaluate(()=>window.__app.clearSel());
  const protocol=await page.evaluate(()=>window.__app.protokollDaten());
  const table=protocol.abschnitte.find(t=>t.titel==='Bemaßungen');assert(table);
  assert.equal(table.zeilen.filter(r=>String(r[1]).includes('Flächeninhalt')&&Math.abs(r[2]-400)<1e-6&&r[3]==='mm²').length,2);
  assert.equal(table.zeilen.filter(r=>String(r[1]).includes('Umfang (gesamt)')&&Math.abs(r[2]-80)<1e-6&&r[3]==='mm').length,2);
  // Der OS-Speicherdialog ist kein Browser-Mock: Tauri-IPC ist schreibgeschützt.
  // Exporte im Browser erzeugen; echte Desktop-Pakete testen UI/Geometrie/JSON/Protokoll.
  const desktop=await page.evaluate(()=>!!window.__TAURI_INTERNALS__);
  if(!desktop) {
    const exports=await page.evaluate(async()=>{
      await window.__app.exportPng();window.__infoExportPreview=window.__lastExport.bytes;const png={bytes:window.__lastExport.bytes.length,header:Array.from(window.__lastExport.bytes.slice(0,8))};
      await window.__app.exportPdf();return {png,pdf:{bytes:window.__lastExport.bytes.length,header:new TextDecoder().decode(window.__lastExport.bytes.slice(0,5))}};
    });
    assert.deepEqual(exports.png.header,[137,80,78,71,13,10,26,10]);assert(exports.png.bytes>10000);assert.equal(exports.pdf.header,'%PDF-');assert(exports.pdf.bytes>10000);
  }
  await page.locator('#infoFlaechen').check();await page.locator('#messenErweitert').evaluate(e=>e.open=false);
  return {cards:3,normalMm:20,faceAreaMm2:400,perimeterMm:80,drag:true,filtersPreserved:true,jsonRoundtrip:true,protocolAllRows:true,pngPdfGenerated:!desktop,osSaveDialogTested:false};
}
