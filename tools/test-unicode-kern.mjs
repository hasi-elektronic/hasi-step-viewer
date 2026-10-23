// Reale CLI-Regressionsprüfung: Windows-UTF-16 → UTF-8, OCCT und C++-Dateiströme.
// Nur synthetische Repo-Testteile; keine Kundendaten.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const exe = path.resolve(process.env.HASI_KERN || 'kern/build/hasi-kern' + (process.platform === 'win32' ? '.exe' : ''));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hasi-unicode-'));
try {
  const dir = path.join(root, 'große Baugruppe Şasi 測定'); fs.mkdirSync(dir);
  const source = path.join(dir, 'Prüfung Ölçü.stp'); fs.copyFileSync('testdaten/testbaugruppe.step', source);
  const ascii = path.join(root, 'ascii'); fs.mkdirSync(ascii);
  const unicode = path.join(dir, 'Ausgabe äöüß'); fs.mkdirSync(unicode);
  const run = (input, out) => execFileSync(exe, [input, out, '--threads', '2'], {encoding:'utf8',timeout:90000,windowsHide:true,maxBuffer:16*1024*1024});
  run(path.resolve('testdaten/testbaugruppe.step'), ascii); run(source, unicode);
  const read = out => {
    const bin = fs.readFileSync(path.join(out,'modell.bin')), length = bin.readUInt32LE(0);
    const meta = JSON.parse(bin.subarray(4,4+length)); let offset = 4+length; while(offset%4) offset++;
    return {meta, data:bin.subarray(offset)};
  };
  const a = read(ascii), u = read(unicode);
  assert.equal(u.meta.fehler,0); assert(u.meta.uniq.length>0);
  assert.deepEqual(u.meta.uniq,a.meta.uniq); assert(u.data.equals(a.data),'Unicode-Pfad verändert keine Netzdaten');
  assert(fs.readFileSync(path.join(unicode,'modell.brep')).equals(fs.readFileSync(path.join(ascii,'modell.brep'))));
  const job = path.join(dir,'Auftrag Ölçü.txt'), filename = 'Einzelteil Ölçü 測定.step';
  fs.writeFileSync(job, `${filename}\tAP214\t1\t0\t-\n`, 'utf8');
  execFileSync(exe, ['--step-export',path.join(unicode,'modell.brep'),job,unicode], {encoding:'utf8',timeout:90000,windowsHide:true,stdio:'pipe'});
  const exported = path.join(unicode,filename); assert(fs.statSync(exported).size>100);
  const roundtrip = path.join(dir,'Erneut geöffnet');fs.mkdirSync(roundtrip);run(exported,roundtrip);
  assert.equal(read(roundtrip).meta.fehler,0);
  console.log('OK: STEP-Import, BREP/Binärdaten, Auftragsdatei, STEP-Export und Wiederimport mit äöüß, Ş und 測定');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
