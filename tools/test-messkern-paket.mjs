// Prüft die vom gebauten Programm tatsächlich entpackten WASM-Bytes (auch nach
// Installer-Extraktion), nicht nur dist/ oder den separaten nativen STEP-Importer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const executable=path.resolve(process.argv[2]);
const report=path.join(os.tmpdir(),'hasi-messkern-'+randomUUID()+'.txt');
try {
  execFileSync(executable,['--pruefe-messkern',report],{timeout:60000,windowsHide:true});
  const expected=fs.readFileSync('dist/ocjs/opencascade.wasm.wasm');
  const sha=createHash('sha256').update(expected).digest('hex');
  const result=fs.readFileSync(report,'utf8');
  assert.equal(result,`OK: Messkern im Paket, ${expected.length} Bytes, SHA256 ${sha}\n`);
  console.log(result.trim());
} finally { if(fs.existsSync(report))fs.unlinkSync(report); }
