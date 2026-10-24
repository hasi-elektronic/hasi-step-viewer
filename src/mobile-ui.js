/** Gemeinsame Touch-Oberfläche ohne Kopie des CAD-/Messcodes. */
const unavailableActions=new Set(['screenshot','exportPng','exportPdf','dxf','geo','expPdf','expXlsx','drucken','verschieben','blech','move','sheet','bendtab','shot','einzelOeffnen','einzelStep','alleStep']);
export const mobileActionUnavailable=action=>unavailableActions.has(action);
export function installTouchUi({mobileBuild,view,dock,resize,onLayoutChange}) {
  const $=id=>document.getElementById(id),root=document.documentElement;
  const coarse=matchMedia('(pointer: coarse)'),narrow=matchMedia('(max-width: 900px)');
  const button=document.createElement('button');button.type='button';button.id='touchBaum';button.className='btn';button.textContent='Bauteile';button.setAttribute('aria-controls','baum');
  button.onclick=()=>{const tree=$('baum');if(tree.classList.contains('zu'))$('baumLasche').click();else $('baumZu').click()};
  document.querySelector('header .schnell').prepend(button);
  const hint=document.createElement('span');hint.id='touchHinweis';hint.textContent='1 Finger: Drehen · 2 Finger: Zoom / Verschieben';$('boden').append(hint);
  let initial=true;
  const update=()=>{
    const touch=mobileBuild||coarse.matches;root.dataset.touch=String(touch);
    const bottom=touch&&narrow.matches,changed=root.dataset.touchBottom!==String(bottom);root.dataset.touchBottom=String(bottom);
    if(bottom&&dock.parentElement===view)view.parentElement.append(dock);
    else if(!bottom&&dock.parentElement!==view)view.append(dock);
    if(initial&&touch){$('baum').classList.add('zu');$('baumLasche').hidden=false}initial=false;
    button.hidden=!touch;hint.hidden=!touch;button.setAttribute('aria-expanded',String(!$('baum').classList.contains('zu')));
    requestAnimationFrame(()=>{resize();if(changed)onLayoutChange?.()});
  };
  coarse.addEventListener('change',update);narrow.addEventListener('change',update);
  new MutationObserver(()=>button.setAttribute('aria-expanded',String(!$('baum').classList.contains('zu')))).observe($('baum'),{attributes:true,attributeFilter:['class']});
  if(mobileBuild){
    // Der Pilot zeigt/misst lokal. Nicht implementierte OS-Exporte werden nicht
    // als erfolgreiche Browser-Downloads oder neue OS-Fenster ausgegeben.
    const exports=['exportKnopf','dimSpeichern','dimPng','dimPdf','protPdf','protXlsx','expPdf','expXlsx','geoSpeichern','dxf'];
    for(const id of exports){const el=$(id);if(el){el.disabled=true;el.dataset.mobileUnavailable='true';el.title='Speichern und Export sind im mobilen Pilot nicht verfügbar.'}}
    for(const el of document.querySelectorAll('[data-aktion]'))if(mobileActionUnavailable(el.dataset.aktion)){el.disabled=true;el.title='Im mobilen Pilot nicht verfügbar.'}
    $('btnBlech').hidden=true;
    $('drop').textContent='STEP-Datei öffnen';
    // Android-Anbieter kennen die STEP-Endung häufig nicht als MIME-Typ.
    // Der Picker darf sie trotzdem anbieten; die Endung wird beim Import geprüft.
    $('file').removeAttribute('accept');
  }
  update();
}
