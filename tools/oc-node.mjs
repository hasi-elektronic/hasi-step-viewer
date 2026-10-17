// Lädt opencascade.js in Node (für Tests/Testblech-Erzeugung)
import {createRequire} from 'module';import fs from 'fs';import path from 'path';
const require=createRequire(import.meta.url);
const dir=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../node_modules/opencascade.js/dist');
globalThis.__dirname=dir;globalThis.require=require;
export async function loadOC(){const {default:f}=await import(dir+'/opencascade.wasm.js');return await new f({wasmBinary:fs.readFileSync(dir+'/opencascade.wasm.wasm')})}
