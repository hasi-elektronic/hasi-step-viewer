// Kopiert opencascade.js (LGPL-2.1) als separate Dateien nach public/ocjs (nicht im Git).
import fs from 'fs';
const src='node_modules/opencascade.js/',dst='public/ocjs/';fs.mkdirSync(dst,{recursive:true});
for(const f of ['dist/opencascade.wasm.js','dist/opencascade.wasm.wasm','LICENSE'])fs.copyFileSync(src+f,dst+f.split('/').pop().replace('LICENSE','LICENSE-opencascade.js.txt'));
console.log('opencascade.js nach public/ocjs kopiert');
