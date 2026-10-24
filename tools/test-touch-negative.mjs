// Mutanten müssen die zugehörige fachliche Assertion auslösen, nicht nur abstürzen.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.TOUCH_OUT||'output/touch-validation');fs.mkdirSync(out,{recursive:true});
for(const [negative,message] of [['tap','Mehrfinger-Ende darf keine Messauswahl erzeugen'],['label','Mehrfinger-Geste darf keine Bemaßung verschieben'],['navigation','Kanten müssen nach Touch-Ende zurückkehren']]){
  const result=spawnSync(process.execPath,['tools/smoke-touch.mjs'],{encoding:'utf8',timeout:180000,env:{...process.env,NEGATIVE:negative}});
  const log=(result.stdout||'')+(result.stderr||'');fs.writeFileSync(path.join(out,'negative-'+negative+'.log'),log);
  assert.equal(result.status,1,'Negativkontrolle '+negative+' muss fehlschlagen');assert(log.includes(message),'Falscher Fehler in '+negative+': '+log.slice(-2000));
  console.log('OK: Negativkontrolle '+negative+' erkennt die entfernte Schutzfunktion');
}
