// Messprotokoll als PDF und XLSX (Faz 2): Inhalt per pdftotext bzw. XLSX-XML prüfen. Läuft über test-export (nach der Installation von poppler-utils).
import assert from 'assert';import fs from 'fs';import os from 'os';import path from 'path';import {execSync} from 'child_process';
import {loadOC} from './oc-node.mjs';import {createBrep} from './kern-loader.mjs';
const B=createBrep(await loadOC());const QA=process.env.QA_DIR||null;const AUS=QA?path.join(QA,'blech2'):fs.mkdtempSync(path.join(os.tmpdir(),'protokoll-'));fs.mkdirSync(AUS,{recursive:true});
const lade=f=>B.load(new Uint8Array(fs.readFileSync('testdaten/'+f)),f);const ok=t=>console.log('  ok  '+t);
console.log('Messprotokoll (PDF, XLSX):');
{const PM=await import('../src/messprotokoll.js');lade('block-45.step');const m=B.model(),hh=B.huelle({});
  const D=PM.protokollDaten({meta:{datei:'block-45.step',produkt:'Hasi 3D',werkstoff:'Stahl (7,85 g/cm³)',datum:'21.10.2026'},modell:{...m,masse:m.volume/1000*7.85},huelle:hh,
    bemassungen:[{nr:1,art:'Abstand',wert:80,einheit:'mm',toleranz:'80 ±0,1',elemente:'Fläche / Fläche'}],messung:[['Abstand',50,'mm']]});
  assert.deepEqual(D.abschnitte.map(a=>a.titel),['Modell','Hüllquader','Rohmaß','Bemaßungen','Aktuelle Messung']);
  const pf=path.join(AUS,'messprotokoll.pdf'),xf=path.join(AUS,'messprotokoll.xlsx');fs.writeFileSync(pf,PM.protokollPdf(D,{produkt:'Hasi 3D'}));fs.writeFileSync(xf,await PM.protokollXlsx(D));
  const txt=execSync(`pdftotext -layout "${pf}" -`).toString();for(const w of ['Messprotokoll','Hüllquader','minimal','80,000','50,000','30,000','Rohmaß','Schwerpunkt X','10,000','Bemaßungen','80 ±0,1','Seite 1 von 1'])assert(txt.includes(w),'PDF enthält nicht: '+w);
  const xml=execSync(`unzip -p "${xf}" xl/worksheets/sheet1.xml xl/sharedStrings.xml`).toString();for(const w of ['Messprotokoll','Hüllquader','Rohmaß','Schwerpunkt Z'])assert(xml.includes(w),'XLSX enthält nicht: '+w);
  assert(/<v>80(\.0+)?<\/v>|<v>79\.9999|<v>80\.0000/.test(xml),'XLSX: Zahl 80 als Zahl');
  ok(`PDF und XLSX: Modell, Hüllquader (3 Arten), Rohmaß, Bemaßungen, Messung → ${AUS}`)}
console.log('OK: Messprotokoll');
