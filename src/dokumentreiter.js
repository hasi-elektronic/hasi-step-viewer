/** Zugängliche Dokumentreiter. Modelle und Ressourcen gehören dem Aufrufer. */
export function createDocumentTabs({element, open, activate, close}) {
  const list=document.createElement('div');list.className='dokumentreiter';list.setAttribute('role','tablist');list.setAttribute('aria-label','Geöffnete STEP-Dateien');
  const add=document.createElement('button');add.type='button';add.id='dateiNeu';add.className='neuer-reiter';add.textContent='+';add.title='Weitere STEP-Dateien öffnen (Strg+O)';add.setAttribute('aria-label',add.title);add.onclick=open;
  element.replaceChildren(list,add);
  function render(documents, active) {
    const focused=document.activeElement?.closest('[data-document]')?.dataset.document;
    list.replaceChildren();
    for(const doc of documents){
      const item=document.createElement('div');item.className='dateitab'+(doc.id===active?' aktiv':'');item.dataset.document=doc.id;
      const tab=document.createElement('button');tab.type='button';tab.className='datei-aktivieren';tab.id='reiter-'+doc.id;tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(doc.id===active));tab.setAttribute('aria-controls','dokumentAnsicht');tab.tabIndex=doc.id===active?0:-1;tab.title=doc.path||doc.name;
      const name=document.createElement('span');name.className='dateiname';name.textContent=doc.name;tab.append(name);tab.onclick=()=>activate(doc.id);
      const x=document.createElement('button');x.type='button';x.className='datei-schliessen';x.title=doc.name+' schließen';x.setAttribute('aria-label',x.title);x.textContent='×';x.onclick=()=>close(doc.id);
      item.append(tab,x);list.append(item);
    }
    const current=list.querySelector('[aria-selected="true"]');
    if(focused)(list.querySelector(`[data-document="${CSS.escape(focused)}"] [role=tab]`)||current)?.focus({preventScroll:true});
    current?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  list.addEventListener('keydown',e=>{
    const tabs=[...list.querySelectorAll('[role=tab]')],at=tabs.indexOf(e.target);if(at<0)return;
    let next;if(e.key==='ArrowRight')next=(at+1)%tabs.length;else if(e.key==='ArrowLeft')next=(at+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;
    e.preventDefault();tabs[next].focus();activate(tabs[next].closest('[data-document]').dataset.document);
  });
  return {render};
}

// Nur dokumentbezogene DOM-Werte. Gemeinsame Einstellungen bleiben gemeinsam.
const REGIONS=['tree','modelinfo','massinfo','selinfo','mresult','ergebnis','dimlist','dimcount','deDetails','deNo','abminfo','huellinfo','sheeterr','sheetinfo','bends','flatprev','sheetwarn','festInfo','rissInfo','bewegenName','propsTitle','propsBody','faltInfo','faltWert','messAuswahl','messHinweis','autoErkannt'];
export function captureDocumentUi(root, status) {
  const regions=REGIONS.map(id=>root.querySelector('#'+id)).filter(Boolean).map(el=>({el,nodes:[...el.childNodes],rows:el._rows,linien:el._linien}));
  const fields=[...root.querySelectorAll('input:not([type=file]),select,textarea,details')].filter(el=>!['prec','stGroesse','stPfeil','stStellen','infoBezug','infoKoordinaten','infoFlaechen'].includes(el.id)).map(el=>({el,value:el.value,checked:el.checked,open:el.open}));
  const states=[...root.querySelectorAll('[id],button[data-messart],button[data-w],button[data-werkzeug],button.tab')].map(el=>({el,hidden:el.hidden,disabled:el.disabled,className:el.getAttribute('class'),pressed:el.getAttribute('aria-pressed'),scrollTop:el.scrollTop}));
  return {regions,fields,states,status:status.textContent};
}
export function restoreDocumentUi(snapshot, status) {
  for(const {el,nodes,rows,linien} of snapshot.regions){el.replaceChildren(...nodes);el._rows=rows;el._linien=linien}
  for(const s of snapshot.fields){if(s.value!==undefined)s.el.value=s.value;if(s.checked!==undefined)s.el.checked=s.checked;if(s.open!==undefined)s.el.open=s.open}
  for(const s of snapshot.states){s.el.hidden=s.hidden;if(s.disabled!==undefined)s.el.disabled=s.disabled;if(s.className==null)s.el.removeAttribute('class');else s.el.setAttribute('class',s.className);if(s.pressed==null)s.el.removeAttribute('aria-pressed');else s.el.setAttribute('aria-pressed',s.pressed);s.el.scrollTop=s.scrollTop}
  status.textContent=snapshot.status;
}

/** Geteilte Geometrien/Materialien genau einmal freigeben; Texturen können App-weit sein. */
export function disposeDocumentScene(model, extraMaterials=[]) {
  const geometries=new Set(),materials=new Set(extraMaterials.filter(Boolean));
  model?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.userData.geo)geometries.add(o.userData.geo);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m)});
  for(const g of geometries)g.dispose();for(const m of materials){m.userData.transp?.dispose();m.dispose()}model?.removeFromParent();
}
export function clearVisualChildren(group) {
  if(!group)return;const geometries=new Set(),materials=new Set();
  group.traverse(o=>{if(o.geometry&&!o.userData.sharedGeometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m)});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();group.clear();
}
