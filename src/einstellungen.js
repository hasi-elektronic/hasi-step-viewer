// Nur Anzeige und Bedienung; CAD-Geometrie und Messgenauigkeit bleiben unverändert.
export const STANDARD_EINSTELLUNGEN = Object.freeze({zoomRichtung:'cad',zoomTempo:1,drehTempo:1,bildqualitaet:'auto',hintergrund:'stahl',baumDichte:'komfort'});
const KEY='bedienung.v1';
export function pruefeEinstellungen(input) {
  const p=input&&typeof input==='object'?input:{};
  const wahl=(key,werte)=>werte.includes(p[key])?p[key]:STANDARD_EINSTELLUNGEN[key];
  const tempo=key=>typeof p[key]==='number'&&Number.isFinite(p[key])?Math.min(2,Math.max(.25,p[key])):1;
  return {zoomRichtung:wahl('zoomRichtung',['cad','klassisch']),zoomTempo:tempo('zoomTempo'),drehTempo:tempo('drehTempo'),bildqualitaet:wahl('bildqualitaet',['auto','sparsam','hoch']),hintergrund:wahl('hintergrund',['stahl','hell','dunkel']),baumDichte:wahl('baumDichte',['komfort','kompakt'])};
}
export function ladeEinstellungen(storage) {try{return pruefeEinstellungen(JSON.parse(storage.getItem(KEY)))}catch{return {...STANDARD_EINSTELLUNGEN}}}
export function speichereEinstellungen(storage,value) {try{storage.setItem(KEY,JSON.stringify(pruefeEinstellungen(value)));return true}catch{return false}}
export function bildPixelRatio(qualitaet,dpr=1) {const basis=Number.isFinite(dpr)&&dpr>0?dpr:1;return qualitaet==='sparsam'?1:Math.min(basis,qualitaet==='hoch'?3:2)}
