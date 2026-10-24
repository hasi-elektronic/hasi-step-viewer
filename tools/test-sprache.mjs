// Oberfläche 100 % Deutsch: keine englischen UI-Wörter in index.html und in den Texten der Quelldateien; das Wort „Betrachter“ ist verboten.
import assert from 'assert';import fs from 'fs';
const ENGLISCH=['Measure','Measurement','Distance','Angle','Radius of','Diameter','Save','Load','Open file','Cancel','Delete','Settings','Error','Warning','Hidden','Visible','Screen','Plane','Chain','Baseline','Chamfer',
  'Cone','Sphere','Stationary','Face','Edge','Vertex','None','Projected','Infinite','Center','Thickness','Bend','Flat pattern','Unfold','Mass properties','Volume','Surface area','Dimension','Hint','Note','Loading','Ready','Select','Selected'];
const dateien=['index.html','src/main.js','src/einstellungen.js','src/oberflaeche.js','src/messinformationen.js','src/brep.js','src/bemassung.js','src/messen-hilfen.js','src/messarten.js','src/messauswertung.js','src/messauftraege.js','src/biegetabelle-export.js','src/kfaktor.js','src/worker.js','src/biegenotiz.js','src/messprotokoll.js','src/falten.js'];
const texte=f=>{const s=fs.readFileSync(f,'utf8');if(f.endsWith('.html'))return [s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,' ')];
  // nur Zeichenketten-Literale (UI-Texte), keine Bezeichner im Code
  return [...s.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|"((?:[^"\\\n]|\\.)*)"/g)].map(m=>m[1]??m[2]??m[3])};
let n=0;
for(const f of dateien){if(!fs.existsSync(f))continue;const T=texte(f);
  for(const t of T){assert(!/betrachter/i.test(t),`${f}: verbotenes Wort „Betrachter“ in „${t.slice(0,80)}“`);
    for(const w of ENGLISCH){const re=new RegExp(`(^|[^A-Za-zÄÖÜäöüß])${w}([^A-Za-zÄÖÜäöüß]|$)`);assert(!re.test(t),`${f}: englischer UI-Text „${w}“ in „${t.slice(0,80)}“`)}}n+=T.length}
console.log(`  ok  ${dateien.length} Dateien, ${n} Texte: kein Englisch, kein „Betrachter“`);
console.log('OK: Sprache');
