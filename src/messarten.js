// Gemeinsamer Vertrag für Werkzeugwahl, Auswahlführung und B-Rep-Messkern.
// Längen bleiben intern in mm; Anzeige-Rundung verändert niemals Messwerte.
const PUNKTE = ['vertex', 'mid', 'center', 'point'];
export const MESSARTEN = [
  {id:'auto', name:'Automatisch', gruppe:'Allgemein', max:Infinity, arten:null, hint:'Kante, Fläche oder Punkt anklicken. Zwei Elemente messen Abstand und Winkel; Strg+Klick erweitert die Auswahl.'},
  {id:'abstand', name:'Abstand', gruppe:'Allgemein', min:2, max:2, arten:[...PUNKTE,'edge','face','axis','solid'], hint:'Zwei Punkte, Kanten, Flächen oder Achsen wählen. Abstandsmethode und Richtung bestimmen die Messlinie.'},
  {id:'laenge', name:'Kantenlänge', gruppe:'Allgemein', min:1, max:1, arten:['edge'], hint:'Eine gerade oder gekrümmte Kante wählen. Gemessen wird die tatsächliche Kurvenlänge.'},
  {id:'winkel', name:'Winkel', gruppe:'Allgemein', min:2, max:2, arten:['edge','face','axis'], hint:'Zwei gerade Kanten, ebene Flächen oder Achsen wählen.'},
  {id:'radius', name:'Radius R', gruppe:'Kreis und Bogen', min:1, max:1, arten:['edge','face','axis'], hint:'Kreiskante, Bogen, Zylinder- oder Kugelfläche wählen.'},
  {id:'durchmesser', name:'Durchmesser Ø', gruppe:'Kreis und Bogen', min:1, max:1, arten:['edge','face','axis'], hint:'Kreis, Bogen, Zylinder- oder Kugelfläche wählen.'},
  {id:'bogen', name:'Bogenlänge', gruppe:'Kreis und Bogen', min:1, max:1, arten:['edge','face'], hint:'Kreisbogen oder Zylinderfläche wählen. Zusätzlich: Bogenwinkel; bei Kreiskanten auch Sehne und Bogenhöhe.'},
  {id:'sehne', name:'Sehnenlänge', gruppe:'Kreis und Bogen', min:1, max:1, arten:['edge'], hint:'Einen offenen Kreisbogen wählen. Gemessen wird die gerade Verbindung seiner Endpunkte.'},
  {id:'bogenhoehe', name:'Bogenhöhe', gruppe:'Kreis und Bogen', min:1, max:1, arten:['edge'], hint:'Einen offenen Kreisbogen wählen. Bogenhöhe = Abstand zwischen Sehnenmitte und Bogenmitte, auch bei Bögen über 180°.'},
  {id:'umfang', name:'Umfang', gruppe:'Fläche und Körper', min:1, max:1, arten:['face','edge'], hint:'Eine Fläche oder eine geschlossene Kreiskante wählen. Flächenumfang enthält auch die Innenkonturen.'},
  {id:'flaeche', name:'Flächeninhalt', gruppe:'Fläche und Körper', min:1, max:1, arten:['face'], hint:'Eine Fläche wählen. Flächeninhalt und Randlängen werden aus der CAD-Geometrie berechnet.'},
  {id:'koerper', name:'Volumen und Oberfläche', gruppe:'Fläche und Körper', min:1, max:1, arten:['solid'], hint:'Einen Körper in der Ansicht anklicken. Bei offenen Körpern ist das Volumen nicht verlässlich.'},
  {id:'summe', name:'Summe: Kanten / Flächen', gruppe:'Mehrfachauswahl', min:1, max:Infinity, arten:['edge','face'], hint:'Kanten oder Flächen nacheinander anklicken; gleicher Klick entfernt ein Element. Kanten und Flächen getrennt summieren.'},
  {id:'winkel3', name:'Winkel aus 3 Punkten', gruppe:'Mehrfachauswahl', min:3, max:3, arten:PUNKTE, hint:'Drei Punkte wählen: Schenkel 1 → Scheitelpunkt → Schenkel 2. Der zweite Punkt ist der Winkelscheitel.'},
  {id:'kreis3', name:'Kreis aus 3 Punkten', gruppe:'Mehrfachauswahl', min:3, max:3, arten:PUNKTE, hint:'Drei unterschiedliche, nicht auf einer Geraden liegende Punkte wählen. Ergebnis: Radius, Durchmesser und Mittelpunkt des definierten Kreises.'},
];
export const messartInfo = id => MESSARTEN.find(m => m.id === id) || MESSARTEN[0];
export const gleicheMessauswahl = (a,b) => a.k===b.k && (a.inst??0)===(b.inst??0) && a.id===b.id && a.src===b.src && (a.k!=='point'||a.p?.every((v,i)=>v===b.p?.[i]));
export function messauswahlHinweis(art, sels) {
  const m=MESSARTEN.find(m=>m.id===art);
  if(!m)return 'Unbekannte Messart.';
  if(m.arten&&sels.some(s=>!m.arten.includes(s.k)))return m.hint;
  if(art==='summe'&&sels.some(s=>s.k!==sels[0]?.k))return 'Kanten und Flächen bitte getrennt summieren.';
  if(sels.length<(m.min||1))return m.hint+` (${sels.length}/${m.min||1} gewählt)`;
  if(sels.length>m.max)return m.hint;
  if(sels.some((s,i)=>sels.slice(0,i).some(p=>gleicheMessauswahl(p,s))))return 'Dasselbe Element wurde mehrfach gewählt.';
  return null;
}

/** Analytische Maße eines Kreisbogens; auch für Bögen über 180°. */
export function kreisbogenMasse(r, winkel) {
  if(!Number.isFinite(r)||r<=0||!Number.isFinite(winkel)||winkel<=0||winkel>2*Math.PI+1e-6)throw new Error('Ungültiger Kreisbogen.');
  const a=Math.min(winkel,2*Math.PI);
  return {laenge:r*a, sehne:2*r*Math.sin(a/2), hoehe:2*r*Math.sin(a/4)**2, sektor:r*r*a/2, segment:r*r*(a-Math.sin(a))/2};
}
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(...a);
function pruefePunkte(punkte) {
  if(punkte.length!==3||punkte.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))throw new Error('Drei gültige Punkte erforderlich.');
  if(punkte.some((p,i)=>punkte.slice(0,i).some(q=>len(sub(p,q))<1e-9)))throw new Error('Bitte drei unterschiedliche Punkte wählen.');
}
export function dreiPunktWinkel(punkte) {
  pruefePunkte(punkte);
  const [a,v,b]=punkte,u1=sub(a,v),u2=sub(b,v),l1=len(u1),l2=len(u2);
  return {v,u1:u1.map(x=>x/l1),u2:u2.map(x=>x/l2),l1,l2,wert:Math.atan2(len(cross(u1,u2)),dot(u1,u2))*180/Math.PI};
}
export function dreiPunktKreis(punkte) {
  pruefePunkte(punkte);
  const [a,b,c]=punkte,u=sub(b,a),v=sub(c,a),n=cross(u,v),nl=len(n);
  if(nl<=1e-10*len(u)*len(v))throw new Error('Die Punkte liegen auf einer Geraden oder zu nahe daran. Kein eindeutiger Kreis.');
  const q=cross(v,n),t=cross(n,u),u2=dot(u,u),v2=dot(v,v);
  const offset=q.map((x,i)=>(x*u2+t[i]*v2)/(2*nl*nl));
  const mitte=a.map((x,i)=>x+offset[i]),r=len(offset);
  if(!mitte.every(Number.isFinite)||!Number.isFinite(r))throw new Error('Aus diesen Punkten kann kein verlässlicher Kreis berechnet werden.');
  return {c:mitte,n:n.map(x=>x/nl),r,p0:a,p1:a,voll:true,winkel:2*Math.PI};
}
