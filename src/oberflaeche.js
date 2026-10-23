import {STANDARD_EINSTELLUNGEN,pruefeEinstellungen,speichereEinstellungen} from './einstellungen.js';

/** Gemeinsame, native modale Dialoge für beide Marken: Fokus, Escape und Tab. */
export function installOberflaeche({marke,einstellungen,onSettings,readExtras,applyExtras}) {
  const $=id=>document.getElementById(id),settings=$('einstDlg'),about=$('ueberDlg');
  $('ueberProdukt').textContent=marke.produkt;
  $('ueberTitel').textContent='Über '+marke.produkt;
  $('ueberVersion').textContent=__APP_VERSION__;
  $('ueberBadge').textContent='Version '+__APP_VERSION__;
  const close=(dlg)=>{if(dlg.open)dlg.close()};
  for(const dlg of [settings,about]) {
    dlg.querySelector('[data-dialog-close]').onclick=()=>close(dlg);
    // Native Tab-/Escape-Verarbeitung bleibt erhalten; CAD-Kürzel ruhen.
    dlg.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.key==='Tab') {
        const targets=[...dlg.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
        const first=targets[0],last=targets.at(-1);
        if(first&&((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last))){e.preventDefault();(e.shiftKey?last:first).focus()}
      }
    });
  }
  const show=dlg=>{if(!dlg.open)dlg.showModal()};
  $('ueber').onclick=()=>show(about);
  const fields=['zoomRichtung','zoomTempo','drehTempo','bildqualitaet','hintergrund','baumDichte'];
  function sync() {
    for(const key of fields)$('einst-'+key).value=String(einstellungen[key]);
    for(const key of ['zoomTempo','drehTempo'])$('wert-'+key).textContent=Number(einstellungen[key]).toLocaleString('de-DE')+'×';
    const extras=readExtras();$('einst-prec').value=String(extras.prec);$('einst-farben').checked=extras.farben;
  }
  function save() {
    const candidate={};for(const key of fields)candidate[key]=['zoomTempo','drehTempo'].includes(key)?Number($('einst-'+key).value):$('einst-'+key).value;
    einstellungen=pruefeEinstellungen(candidate);onSettings(einstellungen);
    $('einst-status').textContent=speichereEinstellungen(localStorage,einstellungen)?'Änderungen werden sofort angewendet und automatisch gespeichert.':'Änderungen sind aktiv. Speichern ist in dieser Umgebung nicht möglich.';
    sync();
  }
  for(const key of fields)$('einst-'+key).addEventListener(['zoomTempo','drehTempo'].includes(key)?'input':'change',save);
  $('einst-prec').onchange=()=>{applyExtras({prec:Number($('einst-prec').value)});sync()};
  $('einst-farben').onchange=()=>{applyExtras({farben:$('einst-farben').checked});sync()};
  $('einstReset').onclick=()=>{einstellungen={...STANDARD_EINSTELLUNGEN};sync();applyExtras({prec:3,farben:true});save()};
  sync();
  return {openSettings:()=>{sync();show(settings)}};
}
