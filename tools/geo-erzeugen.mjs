// GEO-Inhalt einer Abwicklung erzeugen (WASM-Kern, wie der Worker der App) für den Rust-Schreibtest auf Windows/macOS ohne Browser.
// Aufruf: node tools/geo-erzeugen.mjs teil.step ordner → ordner/<teil>_Abwicklung.geo.inhalt und .soll.json (Konturen, Biegungen, Ausdehnung)
import fs from 'fs';import path from 'path';import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';import {geoDateiPruefen} from './geo-pruefen.mjs';
const [datei,ordner]=process.argv.slice(2);const B=createBrep(await loadOC());const name=path.basename(datei).replace(/\.(step|stp)$/i,'');
B.load(new Uint8Array(fs.readFileSync(datei)),path.basename(datei));const r=B.sheet({modus:'trumpf',lage:'trumpf'},0);if(!r.ok||r.flat.incomplete)throw new Error('Abwicklung: '+r.msg);
const geo=B.geo(r.flat,{name:name.toUpperCase(),dicke:r.t,bends:r.bends.map(b=>({ang:b.ang,ri:b.ri,bd:b.bd,dir:b.dir}))});
const k=geoDateiPruefen(Buffer.from(geo,'latin1'),null);fs.mkdirSync(ordner,{recursive:true});const ziel=path.join(ordner,name+'_Abwicklung.geo');
fs.writeFileSync(ziel+'.inhalt',geo,'utf8');fs.writeFileSync(ziel+'.soll.json',JSON.stringify({konturen:k.konturen,innen:k.innen,biegungen:r.bends.length,max:k.max,bytes:k.bytes}));
console.log(`GEO-Inhalt: ${ziel}.inhalt (${k.bytes} Bytes, ${k.konturen} Konturen, ${r.bends.length} Biegungen)`);
