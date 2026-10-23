// Öffnen-Leistungstest mit dem synthetischen Großteil (tools/make-grossteil.mjs, keine Kundendaten).
// Prüft: 1) Kern bleibt unter einem großzügigen Zeitbudget, 2) aufgeschobene, parallele Heilung liefert exakt dasselbe
// Ergebnis wie die alte, sofortige Heilung (BREP bytegleich, Netze/Flächen/Kanten gleich).
// Aufruf: node tools/perf-oeffnen.mjs <datei.step> [budget_ms=30000]   (HASI_KERN = Pfad zum Kern, Standard kern/build/hasi-kern)
import {spawnSync} from 'child_process';import fs from 'fs';import os from 'os';import path from 'path';
const f=process.argv[2];const budget=+(process.argv[3]||30000);const exe=process.env.HASI_KERN||'kern/build/hasi-kern';
if(!f)throw new Error('Aufruf: node tools/perf-oeffnen.mjs <datei.step> [budget_ms]');
const fail=m=>{console.error('FEHLER:',m);process.exit(1)};
function lauf(name,env){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'perf-'+name+'-'));const t0=Date.now();
  const r=spawnSync(exe,[f,dir],{env:{...process.env,...env},encoding:'utf8',maxBuffer:1<<26});
  const ms=Date.now()-t0;if(r.status!==0)fail(name+': Kern-Fehler '+r.status+' '+(r.stderr||'').slice(-2000));
  const bin=(r.stdout.match(/^BIN (\d+)/m)||[])[1];
  const b=fs.readFileSync(path.join(dir,'modell.bin'));const hl=b.readUInt32LE(0);const kopf=JSON.parse(b.subarray(4,4+hl).toString('utf8'));
  let ds=4+hl;while(ds%4)ds++;
  return {ms,binMs:bin==null?null:+bin,kopf,daten:b.subarray(ds),brep:fs.readFileSync(path.join(dir,'modell.brep')),dir};
}
const neu=lauf('neu',{});const alt=lauf('alt',{HASI_KERN_SOFORT_HEILEN:'1'});
const t=neu.kopf.times||{};
console.log(`Großteil: ${neu.kopf.uniq.length} Teile, ${neu.kopf.uniq.reduce((s,u)=>s+u.faces.length,0)} Flächen`);
console.log(`neu (aufgeschoben/parallel): Prozess ${neu.ms} ms, modell.bin nach ${neu.binMs} ms | lesen ${t.lesen} uebersetzen ${t.uebersetzen} heilen ${t.heilen} tessellieren ${t.tessellieren}`);
console.log(`alt (sofort heilen):         Prozess ${alt.ms} ms | uebersetzen ${alt.kopf.times?.uebersetzen}`);
if(neu.kopf.fehler)fail('Kern meldet Fehler: '+neu.kopf.fehler);
if(!neu.brep.equals(alt.brep))fail('BREP weicht von der sofortigen Heilung ab');
if(!neu.daten.equals(alt.daten))fail('Netzdaten weichen von der sofortigen Heilung ab');
const ohneZeit=k=>JSON.stringify({...k,times:undefined});
if(ohneZeit(neu.kopf)!==ohneZeit(alt.kopf))fail('Kopfdaten (Flächen/Kanten/Struktur) weichen ab');
if(neu.binMs==null)fail('Kern meldet BIN nicht auf stdout');
if(neu.binMs>budget)fail(`zu langsam: modell.bin nach ${neu.binMs} ms, Budget ${budget} ms`);
for(const d of [neu.dir,alt.dir])fs.rmSync(d,{recursive:true,force:true});
console.log(`perf-oeffnen ok: identisch zur alten Heilung, modell.bin nach ${neu.binMs} ms (Budget ${budget} ms)`);
