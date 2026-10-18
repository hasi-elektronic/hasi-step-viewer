import {pathToFileURL,fileURLToPath} from 'url';
// Lädt opencascade.js in Node (für Tests/Testblech-Erzeugung)
import {createRequire} from 'module';import fs from 'fs';import path from 'path';
const require=createRequire(import.meta.url);
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../node_modules/opencascade.js/dist');
globalThis.__dirname=dir;globalThis.require=require;
export async function loadOC(){const {default:f}=await import(pathToFileURL(dir+'/opencascade.wasm.js').href);return await new f({wasmBinary:fs.readFileSync(dir+'/opencascade.wasm.wasm')})}
