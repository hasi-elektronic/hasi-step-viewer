// Untere Werkzeugleiste: Zweiton-Symbole (Set A) inline, Farben nur über CSS-Variablen, Tooltip „Name – Hinweis“ auf Deutsch.
import assert from 'assert';import fs from 'fs';
const html=fs.readFileSync('index.html','utf8');const css=fs.readFileSync('src/style.css','utf8');
const boden=html.match(/<footer id="boden">([\s\S]*?)<\/footer>/)[1];
const SOLL={btnReset:'Zurücksetzen',btnDreh:'Drehen',btnMessen:'Messen',btnSchnitt:'Schnitt',btnMass:'Bemaßung',btnBlech:'Blech'};
const knoepfe=[...boden.matchAll(/<button type="button" id="(\w+)"[^>]*title="([^"]+)"[^>]*>(<svg[\s\S]*?<\/svg>)<span>([^<]+)<\/span><\/button>/g)];
assert.deepStrictEqual(knoepfe.map(k=>k[1]),Object.keys(SOLL),'Reihenfolge/Anzahl der Knöpfe');
for(const [,id,titel,svg,text] of knoepfe){
  assert.strictEqual(text,SOLL[id],id+': Beschriftung');
  assert(titel.startsWith(SOLL[id]+' – ')&&titel.length>SOLL[id].length+8,id+': Tooltip „Name – Hinweis“ fehlt: '+titel);
  assert(/class="ik duo"/.test(svg),id+': kein Zweiton-Symbol');
  assert(!/#[0-9a-f]{3,6}\b|rgb\(|fill="|stroke="|style=/i.test(svg),id+': feste Farbe im Symbol');
  assert(!/href|url\(|<image|<use/i.test(svg),id+': externer Verweis im Symbol');
  assert(/class="(fl|ac|acf)/.test(svg),id+': Akzentteil fehlt');
}
const t=Object.fromEntries(knoepfe.map(k=>[k[1],k[3]]));
// Messen = Lineal (schräges Rechteck mit Teilstrichen), Bemaßung = Maßlinie mit zwei Pfeilspitzen und Hilfslinien
assert(/rotate\(-45/.test(t.btnMessen)&&/<rect[^>]*width="22"/.test(t.btnMessen),'Messen ist kein Lineal');
assert(!/acf/.test(t.btnMessen),'Messen darf keine Maßpfeile haben (Verwechslung mit Bemaßung)');
assert((t.btnMass.match(/z/g)||[]).length>=2&&/class="acf"/.test(t.btnMass),'Bemaßung ohne zwei Pfeilspitzen');
assert(/M3\.4 12\.6V3\.6M20\.6 12\.6V3\.6/.test(t.btnMass),'Bemaßung ohne Hilfslinien');
assert(/Messen – [^"]*nicht gespeichert/.test(html)&&/Bemaßung – [^"]*speichern[^"]*exportieren/.test(html),'Tooltips Messen/Bemaßung');
// Farben: normal Strich Text, Akzent Markenfarbe; aktiv Strich Akzent, Details dunkler Akzent
assert(/:root\{--a:#33AFE2;--a-dunkel:#1A7FAE/.test(css),'Hasi-Farben');
assert(/html\[data-marke="sickinger"\]\{--a:#009EDF;--a-dunkel:#004B85\}/.test(css),'Sickinger-Farben');
assert(/#boden button\.on\{--ik-strich:var\(--a\);--ik-akzent:var\(--a-dunkel\)/.test(css),'Aktiv-Zustand');
console.log('  ok  6 Knöpfe, Zweiton über Variablen, Tooltips, Lineal ≠ Maßlinie');
console.log('OK: Werkzeugleiste');
