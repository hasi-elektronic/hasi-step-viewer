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

/** Maßrichtungen (wie SolidWorks/AutoCAD). Name = Zeile im Ergebnis. */
export const RICHTUNGEN=[
  ['ausgerichtet','Ausgerichtet (wahre Länge)',null],
  ['vertikal','Vertikal (Höhe)','Höhe (vertikal)'],
  ['horizontal','Horizontal (waagerecht)','Horizontal (waagerecht)'],
  ['x','Modellachse X','Abstand in X'],
  ['y','Modellachse Y','Abstand in Y'],
  ['z','Modellachse Z','Abstand in Z'],
  ['ansicht','Senkrecht zur Ansicht (wie gesehen)','In der Ansichtsebene'],
];
export const MODELL_OBEN=[0,0,1];// Hochachse des Modells (Z oben, wie in der Ansicht)
/**
 * Richtung (Einheitsvektor) für eine Maßrichtung und die Strecke p1→p2.
 * sicht: {oben, rechts, blick} in Modellkoordinaten; bildschirm = true: „Vertikal/Horizontal“ nach dem Bildschirm statt nach der Hochachse.
 * Liefert null für „ausgerichtet“ oder wenn die Richtung nicht bestimmbar ist (z. B. waagerechter Anteil 0).
 */
export function richtungsVektor(art,p1,p2,sicht={},bildschirm=false){const v=sub(p2,p1);
  const oben=norm(bildschirm&&sicht.oben?sicht.oben:MODELL_OBEN);
  if(art==='vertikal')return oben;
  if(art==='horizontal'){if(bildschirm&&sicht.rechts)return norm(sicht.rechts);const s=dot(v,oben);const h=[v[0]-oben[0]*s,v[1]-oben[1]*s,v[2]-oben[2]*s];return len(h)>1e-9?norm(h):null}
  if(art==='x')return [1,0,0];if(art==='y')return [0,1,0];if(art==='z')return [0,0,1];
  if(art==='ansicht'){if(!sicht.blick)return null;const b=norm(sicht.blick),s=dot(v,b);const q=[v[0]-b[0]*s,v[1]-b[1]*s,v[2]-b[2]*s];return len(q)>1e-9?norm(q):null}
  return null}
/** Länge von p1→p2 in einer Maßrichtung (Betrag der Projektion; ausgerichtet = wahre Länge). */
export function richtungsWert(art,p1,p2,sicht,bildschirm){const v=sub(p2,p1);const d=richtungsVektor(art,p1,p2,sicht,bildschirm);if(art==='ausgerichtet'||!d)return art==='ausgerichtet'?len(v):0;return Math.abs(dot(v,d))}
/**
 * Lineare Bemaßung beim Ziehen (wie AutoCAD BEMLINEAR): Ziehen seitlich → vertikal (Höhe), nach oben/unten → horizontal,
 * senkrecht zu einer schrägen Strecke → ausgerichtet. Alles im Bildschirm (rechts/oben in Modellkoordinaten).
 */
export function linearArt(p1,p2,M,sicht){const r=norm(sicht.rechts),o=norm(sicht.oben);const v=sub(p2,p1),m=[(p1[0]+p2[0])/2,(p1[1]+p2[1])/2,(p1[2]+p2[2])/2],w=sub(M,m);
  const sx=dot(v,r),sy=dot(v,o),ox=dot(w,r),oy=dot(w,o);const sl=Math.hypot(sx,sy),ol=Math.hypot(ox,oy);if(ol<1e-9)return null;
  const winkel=sl>1e-9?Math.atan2(Math.abs(sy),Math.abs(sx))*180/Math.PI:0;const schraeg=winkel>15&&winkel<75;
  const quer=sl>1e-9?Math.abs(sx*ox+sy*oy)/(sl*ol):1;// cos(Strecke, Zugrichtung): 0 = genau senkrecht dazu
  if(schraeg&&quer<Math.sin(15*Math.PI/180))return 'ausgerichtet';
  return Math.abs(ox)>Math.abs(oy)?'vertikal':'horizontal'}
