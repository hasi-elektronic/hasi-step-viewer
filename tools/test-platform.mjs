import assert from 'node:assert/strict';
import {readHostCapabilities} from '../src/platform.js';
assert.equal((await readHostCapabilities()).desktopBackend,false);
const mobile={version:1,platform:'android',desktopBackend:false,nativeKernel:false,nativeDocuments:false,nativeSave:false,multipleWindows:false};
assert.deepEqual(await readHostCapabilities(async name=>{assert.equal(name,'app_faehigkeiten');return mobile},true),mobile);
await assert.rejects(()=>readHostCapabilities(async()=>({...mobile,desktopBackend:true}),true),/Mobiler/);
await assert.rejects(()=>readHostCapabilities(async()=>{throw Error('Fehlt')},true),/Fehlt/);
assert.equal((await readHostCapabilities(async()=>{throw Error('Alter Desktop')},false)).desktopBackend,true);
console.log('OK: Browser, Android-Vertrag, fail-closed Mobile und bestehender Desktop');
