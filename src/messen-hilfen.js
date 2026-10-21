// Reine Rechenhilfen fürs Messen (ohne OCCT, ohne three.js) – im Worker, in der Oberfläche und in Node-Tests nutzbar.
// Alle Längen in mm, Punkte als [x, y, z] in Modellkoordinaten.
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l]};

/** Abstandsmethoden (Auswahl im Panel „Messen“). Name = Zeile im Ergebnis. */
export const METHODEN=[
  ['min','Rand–Rand (min.)','Abstand min.'],
  ['rand-mitte','Rand–Mitte','Abstand Rand–Mitte'],
  ['mitte-rand','Mitte–Rand','Abstand Mitte–Rand'],
  ['mitte','Mitte–Mitte','Abstand Mitte–Mitte'],
  ['max','Max.','Abstand max.'],
  ['unendlich','Gerade/Ebene unendlich verlängert','Abstand unendlich verlängert'],
];
export const methodenZeile=m=>(METHODEN.find(x=>x[0]===m)||METHODEN[0])[2];

/** Projektionen: Normale n (Einheitsvektor) der Bezugsebene. */
export const PROJEKTIONEN=[['keine','Keine'],['bildschirm','Bildschirm'],['xy','Ebene XY'],['xz','Ebene XZ'],['yz','Ebene YZ'],['flaeche','Gewählte ebene Fläche']];
export const PROJ_NORMALE={xy:[0,0,1],xz:[0,1,0],yz:[1,0,0]};

/** Zerlegt den Vektor p1→p2 in den Anteil in der Ebene (Normale n) und den Anteil entlang n. */
export function projiziere(p1,p2,n){const v=sub(p2,p1),u=norm(n),s=dot(v,u);const q=[v[0]-u[0]*s,v[1]-u[1]*s,v[2]-u[2]*s];return {inEbene:len(q),normal:Math.abs(s)}}

/** ΔX/ΔY/ΔZ als drei achsparallele Teilstrecken von p1 nach p2 (rot = X, grün = Y, blau = Z). Strecken der Länge 0 entfallen. */
export function deltaLinien(p1,p2){const a=[p2[0],p1[1],p1[2]],b=[p2[0],p2[1],p1[2]];
  return [{achse:'X',farbe:0xd24b4b,von:p1,bis:a,wert:Math.abs(p2[0]-p1[0])},{achse:'Y',farbe:0x3c9a4a,von:a,bis:b,wert:Math.abs(p2[1]-p1[1])},{achse:'Z',farbe:0x3a6fbf,von:b,bis:p2,wert:Math.abs(p2[2]-p1[2])}].filter(l=>l.wert>1e-9)}

/** Normalabstand eines Punktes zu einer Ebene (Punkt o, Normale n). */
export function normalAbstand(p,o,n){return Math.abs(dot(sub(p,o),norm(n)))}
