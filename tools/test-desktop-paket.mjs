// Startet ausschließlich ein angegebenes, separat entpacktes Windows-Testprogramm.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
assert.equal(process.platform,'win32','WebView2-Prüfung benötigt Windows');
const exe=path.resolve(process.argv[2]||'');assert(fs.statSync(exe).isFile(),'Entpackte Programmdatei angeben');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hasi-paket-webview-'));
const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const child=spawn(exe,[],{cwd:path.dirname(exe),windowsHide:true,stdio:'ignore',env:{...process.env,
  WEBVIEW2_USER_DATA_FOLDER:path.join(dir,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`,
}});
let startError=null;child.on('error',e=>startError=e);
try{
  const endpoint=`http://127.0.0.1:${port}`;let ready=false;
  for(let i=0;i<150;i++){
    if(startError)throw startError;
    assert.equal(child.exitCode,null,'Testprogramm wurde beendet; eventuell läuft bereits dieselbe Marke. Benutzerprogramm nicht schließen.');
    try{const response=await fetch(endpoint+'/json/version');if(response.ok){ready=true;break}}catch{}
    await new Promise(r=>setTimeout(r,200));
  }
  assert(ready,'Eigene WebView2-Testinstanz nicht erreichbar');
  const result=execFileSync(process.execPath,['tools/smoke-desktop-messen.mjs',endpoint,path.resolve('testdaten/messteil.step')],{encoding:'utf8',timeout:120000,windowsHide:true});
  console.log(result.trim());
}finally{
  if(child.pid&&child.exitCode===null)try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true})}catch{}
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
