import assert from 'node:assert/strict';
/** Dieselben echten UI-Aktionen im Browser und im entpackten Windows-Programm. */
export async function checkOberflaecheUi(page,{produkt,version,loadAssembly,loadPart,afterReload}) {
  await page.waitForFunction(()=>window.__dateienBereit);
  const distance=()=>page.evaluate(()=>{const s=window.__steuerung();return Math.hypot(...s.pos.map((v,i)=>v-s.ziel[i]))});
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const openSettings=()=>page.locator('header .schnell [data-aktion=einstellungen]').click();
  const closeSettings=()=>page.locator('#einstZu').click();
  // Rechts positioniert, gemeinsame Firmen-/Versionsinformationen, Escape und Fokus.
  await loadAssembly();
  if(await page.locator("#messenPanel").isVisible())await page.locator("#btnMessen").click();
  await page.evaluate(()=>{const a=window.__app,n=a.nodes().find(n=>n.all.length===1);a.selectNode(n)});
  const before=await page.evaluate(()=>({name:window.__app.selName(),vis:window.__app.vis()}));
  await page.locator('#ueber').click();
  assert(await page.locator('#ueberDlg').evaluate(d=>d.open));
  const about=await page.locator('#ueberDlg').innerText();
  for(const text of [produkt,version,'Manfred Sickinger GmbH','Hasi Elektronic','Hamdi Güncavdi'])assert(about.includes(text),text);
  await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement.closest('#ueberDlg')!==null));
  await page.keyboard.press('Escape');assert.equal(await page.locator('#ueberDlg').evaluate(d=>d.open),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'ueber');
  assert.deepEqual(await page.evaluate(()=>({name:window.__app.selName(),vis:window.__app.vis()})),before);
  // Große Pfeile: Maus, Enter, Space; Zustand/Fokus/Checkboxen unabhängig.
  const node=await page.evaluate(()=>window.__app.nodes().find(n=>n.children.length>0&&n.parent)?.id??0);
  const tw=page.locator(`.trow[data-id="${node}"] button.tw`);
  await tw.scrollIntoViewIfNeeded();const size=await tw.boundingBox();assert(size.width>=28&&size.height>=28);
  const opened=await tw.getAttribute('aria-expanded');await tw.click();assert.notEqual(await tw.getAttribute('aria-expanded'),opened);
  assert.deepEqual(await page.evaluate(()=>({name:window.__app.selName(),vis:window.__app.vis()})),before);
  await page.keyboard.press('Enter');assert.equal(await tw.getAttribute('aria-expanded'),opened);
  await page.keyboard.press('Space');assert.notEqual(await tw.getAttribute('aria-expanded'),opened);
  assert.equal(await page.evaluate(()=>document.activeElement.closest('.trow')?.dataset.id),String(node));
  await page.keyboard.press('Tab');assert.deepEqual(await page.evaluate(()=>window.__app.vis()),before.vis);
  await page.locator('#treeSearch').fill('Winkel');
  assert.equal(await page.locator('#tree button.tw:not(:disabled)').count(),0);
  await page.locator('#treeSearch').fill('m');assert(await page.locator('#messenPanel').isHidden());
  await page.locator('#treeSearch').fill('');await page.locator('#treeSearch').evaluate(e=>e.blur());
  await page.keyboard.press('m');assert(await page.locator('#messenPanel').isVisible());
  await page.locator('#messenZu').click();await page.keyboard.press('M');assert(await page.locator('#messenPanel').isVisible());
  assert.equal(await page.evaluate(()=>window.__app.werkzeug()),'wahl');
  assert.equal(await page.locator('#btnDreh,[data-werkzeug=drehen]').count(),0);
  // Echter Wheel-Zoom in beiden Richtungen und umschaltbar, Cursoranker bleibt.
  await page.evaluate(()=>window.__app.fitIso());await page.waitForFunction(()=>window.__app.animFertig());await frames();
  const canvas=await page.locator('#buehne').boundingBox();const x=canvas.x+canvas.width*.72,y=canvas.y+canvas.height*.6;
  await page.mouse.move(x,y);const d0=await distance();await page.mouse.wheel(0,160);await frames();const d1=await distance();assert(d1<d0,'CAD: Rad nach unten muss nähern');
  await page.mouse.wheel(0,-160);await frames();assert((await distance())>d1,'CAD: Rad nach oben muss entfernen');
  await openSettings();await page.locator('#einst-zoomRichtung').selectOption('klassisch');
  await page.locator('#einst-zoomTempo').focus();await page.keyboard.press('End');
  await page.locator('#einst-drehTempo').focus();await page.keyboard.press('Home');for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');
  await page.locator('#einst-hintergrund').selectOption('dunkel');await page.locator('#einst-bildqualitaet').selectOption('sparsam');await page.locator('#einst-baumDichte').selectOption('kompakt');
  await page.locator('#einst-prec').selectOption('2');assert.equal(await page.locator('#prec').inputValue(),'2');
  await page.locator('#einst-farben').uncheck();assert.equal(await page.evaluate(()=>localStorage.getItem('stepFarben')),'aus');
  const wheelSettings=await page.evaluate(()=>({p:window.__steuerung(),bg:getComputedStyle(document.getElementById('view')).backgroundImage,density:document.documentElement.dataset.baumdichte}));
  assert.equal(wheelSettings.p.zoomTempo,2);assert.equal(wheelSettings.p.drehTempo,3);assert.equal(wheelSettings.p.pixelRatio,1);assert.equal(wheelSettings.density,'kompakt');assert(wheelSettings.bg.includes('48, 61, 75'));
  await closeSettings();await page.mouse.move(x,y);const c0=await distance();await page.mouse.wheel(0,160);await frames();assert((await distance())>c0,'Klassisch: Rad nach unten muss entfernen');
  await page.reload();await page.waitForFunction(()=>window.__dateienBereit);await afterReload?.();
  await openSettings();assert.equal(await page.locator('#einst-zoomRichtung').inputValue(),'klassisch');assert.equal(await page.locator('#einst-prec').inputValue(),'2');assert.equal(await page.locator('#einst-hintergrund').inputValue(),'dunkel');assert.equal(await page.locator('#einst-farben').isChecked(),false);
  await page.locator('#einstReset').click();assert.equal(await page.locator('#einst-zoomRichtung').inputValue(),'cad');assert.equal(await page.locator('#prec').inputValue(),'3');assert(await page.locator('#einst-farben').isChecked());await page.keyboard.press('Escape');
  // Lange Dateinamen dürfen das Schließen nicht verkleinern; Reflow in beiden Größen.
  await loadPart();await page.locator('#btnMessen').click();await page.evaluate(()=>{document.getElementById('dateiname').textContent='Sehr_langer_Dateiname_'.repeat(20)+'.step'});
  for(const viewport of [{width:1000,height:700},{width:1500,height:900}]) {
    await page.setViewportSize(viewport);await page.locator('#fit').click();const close=await page.locator('#dateiZu').boundingBox(),aboutButton=await page.locator('#ueber').boundingBox();
    assert(close.width>=32&&close.height>=32);assert(aboutButton.x+aboutButton.width<=viewport.width);assert(aboutButton.x>viewport.width*.7);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.locator('#dateiZu').click();assert(await page.locator('#dateitab').isHidden());assert.equal(await page.locator('#tree .trow').count(),0);assert.equal(await page.evaluate(()=>window.__app.data()),null);
  await loadPart();assert(await page.locator('#dateitab').isVisible());
  return {version,produkt,treeButtons:true,shortcutM:true,settingsPersist:true,zoomDirections:true,closeReopen:true};
}
