// Kopiert opencascade.js (LGPL-2.1) als separate Dateien nach public/ocjs (nicht im Git).
import fs from 'fs';
const src='node_modules/opencascade.js/',dst='public/ocjs/';fs.mkdirSync(dst,{recursive:true});
for(const f of ['dist/opencascade.wasm.js','dist/opencascade.wasm.wasm','LICENSE'])fs.copyFileSync(src+f,dst+f.split('/').pop().replace('LICENSE','LICENSE-opencascade.js.txt'));
fs.mkdirSync('public/occt',{recursive:true});
for(const f of ['occt-import-js.js','occt-import-js.wasm','license.occt-import-js.txt','license.occt.txt']){try{fs.copyFileSync('node_modules/occt-import-js/dist/'+f,'public/occt/'+f)}catch(e){if(!f.startsWith('license'))throw e}}
console.log('opencascade.js nach public/ocjs kopiert');
