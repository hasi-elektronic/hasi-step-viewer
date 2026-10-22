// Gespeicherte GEO-Datei prüfen: vollständig, CRLF, ANSI, Aufbau wie TruTops (Zeilen in #~11), neu eingelesen gleich der Abwicklung.
// Bibliothek für smoke-geo-speichern.mjs und Aufruf: node tools/geo-pruefen.mjs datei.geo soll.json
import fs from 'fs';import {parseGeo} from '../src/geo.js';
/** soll: {konturen, innen, biegungen, max:[x,y]} aus der Abwicklung der Oberfläche. Wirft bei Abweichung, gibt Kennzahlen zurück. */
export function geoDateiPruefen(bytes,soll){
  const fail=m=>{throw new Error('GEO-Datei: '+m)};
  if(!bytes||!bytes.length)fail('leer (0 Bytes)');
  for(let i=0;i<bytes.length;i++){if(bytes[i]===10&&bytes[i-1]!==13)fail('Zeilenende ohne CR an Byte '+i)}
  const text=Buffer.from(bytes).toString('latin1');
  if(!text.startsWith('#~1\r\n')||!text.endsWith('#~END\r\n#~EOF\r\n'))fail('Anfang/Ende fehlt');
  const L=text.split('\r\n');const i11=L.indexOf('#~11');const e11=L.indexOf('##~~',i11);
  if(e11-i11-1!==20)fail(`#~11 hat ${e11-i11-1} Zeilen statt 20 (TruTops-Aufbau)`);
  const g=parseGeo(text);const k=g.konturen.length,innen=g.konturen.filter(x=>x.innen).length,b=g.biegungen.length;
  const ele=g.konturen.reduce((s,x)=>s+x.elemente.length,0);
  if(!k||!ele)fail('keine Konturen');
  if(soll){
    if(k!==soll.konturen||innen!==soll.innen)fail(`Konturen ${k} (innen ${innen}) ≠ ${soll.konturen} (innen ${soll.innen})`);
    if(b!==soll.biegungen)fail(`Biegungen ${b} ≠ ${soll.biegungen}`);
    const d=Math.max(Math.abs(g.kopf.max[0]-soll.max[0]),Math.abs(g.kopf.max[1]-soll.max[1]));if(!(d<1e-6))fail(`Ausdehnung ${g.kopf.max} ≠ ${soll.max}`);
    if(soll.bytes!=null&&bytes.length!==soll.bytes)fail(`${bytes.length} Bytes ≠ ${soll.bytes}`);
  }
  return {bytes:bytes.length,konturen:k,innen,elemente:ele,biegungen:b,max:g.kopf.max.slice(0,2),teil:g.teil}}
if(process.argv[1]&&process.argv[1].endsWith('geo-pruefen.mjs')){
  const [datei,sollPfad]=process.argv.slice(2);const soll=sollPfad?JSON.parse(fs.readFileSync(sollPfad,'utf8')):null;
  const r=geoDateiPruefen(fs.readFileSync(datei),soll);
  console.log(`OK: ${datei}: ${r.bytes} Bytes, ${r.konturen} Konturen (innen ${r.innen}, ${r.elemente} Elemente), ${r.biegungen} Biegungen, Ausdehnung ${r.max.map(v=>v.toFixed(4)).join(' × ')} mm`)}
