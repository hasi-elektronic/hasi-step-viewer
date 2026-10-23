// Reine Rechenhilfen fürs Messen (ohne OCCT, ohne three.js) – im Worker, in der Oberfläche und in Node-Tests nutzbar.
// Alle Längen in mm, Punkte als [x, y, z] in Modellkoordinaten.
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l]};

/** Abstandsmethoden (Auswahl im Panel „Messen“). Name = Zeile im Ergebnis. */
export const METHODEN=[
  ['auto','Automatisch (wie ZW3D)','Abstand min.'],
  ['min','Rand–Rand (min.)','Abstand min.'],
  ['rand-mitte','Rand–Mitte','Abstand Rand–Mitte'],
  ['mitte-rand','Mitte–Rand','Abstand Mitte–Rand'],
  ['mitte','Mitte–Mitte','Abstand Mitte–Mitte'],
  ['max','Max.','Abstand max.'],
  ['unendlich','Gerade/Ebene unendlich verlängert','Abstand unendlich verlängert'],
];
export const methodenZeile=m=>(METHODEN.find(x=>x[0]===m)||METHODEN[1])[2];

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

// ---------- Fläche zu Fläche (wie ZW3D „Instant Measure“) ----------
// Parallel heißt: Winkel zwischen den Normalen/Achsen ≤ 0,01°. Gefertigte Teile (STEP aus anderen Systemen) sind selten bitgenau parallel;
// die alte Grenze (1 − 1e−9 ≈ 0,0026°) lag zu knapp. 0,01° auf 1000 mm sind 0,17 mm – darüber zeigen wir ehrlich einen Winkel.
export const PARALLEL_TOL_GRAD=0.01;
const RAD=Math.PI/180,GRAD=180/Math.PI;
export const COS_PARALLEL=Math.cos(PARALLEL_TOL_GRAD*RAD),SIN_PARALLEL=Math.sin(PARALLEL_TOL_GRAD*RAD);
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const acosK=c=>Math.acos(Math.max(-1,Math.min(1,c)));
/** Richtungen parallel (auch antiparallel) innerhalb 0,01°? */
export const istParallel=(d1,d2)=>Math.abs(dot(norm(d1),norm(d2)))>=COS_PARALLEL;
/** Punkt p senkrecht auf die Ebene {o,n} fällen. */
export function aufEbene(p,e){const n=norm(e.n);return sub(p,mul(n,dot(sub(p,e.o),n)))}
/** Punkt p senkrecht auf die Achse {c,d} fällen. */
export function aufAchse(p,a){const d=norm(a.d);return add(a.c,mul(d,dot(sub(p,a.c),d)))}
/** Ebene–Ebene: parallel → senkrechter Abstand (über die Normale von Ebene 1) und Lage; sonst Winkel. */
export function ebeneEbene(e1,e2){const n1=norm(e1.n),n2=norm(e2.n),c=dot(n1,n2);
  if(Math.abs(c)>=COS_PARALLEL){const s=dot(sub(e2.o,e1.o),n1);return {parallel:true,abstand:Math.abs(s),vorzeichen:Math.sign(s)||1,lage:c<0?'gegenüberliegend':'gleichgerichtet'}}
  return {parallel:false,winkel:acosK(Math.abs(c))*GRAD,winkelNormalen:acosK(c)*GRAD}}
/** Lotpaar Ebene 1 → Ebene 2 durch den Punkt p (p liegt auf/nahe Ebene 1). Strecke entlang der Normalen von Ebene 1. */
export function lotPaar(p,e1,e2){const q1=aufEbene(p,e1),n=norm(e1.n);const s=dot(sub(e2.o,q1),n);return [q1,add(q1,mul(n,s))]}
/** Ebene–Achse (Zylinder, Bohrung): parallel → Abstand Ebene–Achse; senkrecht; sonst Winkel Achse–Ebene. */
export function ebeneAchse(e,a){const n=norm(e.n),d=norm(a.d),s=Math.abs(dot(n,d));
  if(s<=SIN_PARALLEL){const t=dot(sub(a.c,e.o),n);return {lage:'parallel',abstand:Math.abs(t),vorzeichen:Math.sign(t)||1,winkel:0}}
  if(s>=COS_PARALLEL)return {lage:'senkrecht',winkel:90};
  return {lage:'schraeg',winkel:Math.asin(Math.min(1,s))*GRAD}}
/** Achse–Achse: parallel → Achsabstand (koaxial bei ≤ 0,001 mm); sonst windschief/schneidend mit Achswinkel und kürzestem Abstand. */
export function achseAchse(a1,a2){const d1=norm(a1.d),d2=norm(a2.d),c=dot(d1,d2),w=sub(a2.c,a1.c);
  if(Math.abs(c)>=COS_PARALLEL){const quer=sub(w,mul(d1,dot(w,d1)));const d=len(quer);return {parallel:true,abstand:d,koaxial:d<=1e-3,quer:d>1e-12?norm(quer):null,winkel:0}}
  const nn=norm(cross(d1,d2));const dd=dot(w,nn);
  // nächste Punkte der beiden unendlichen Achsen
  const b=dot(d1,d2),dw1=dot(d1,w),dw2=dot(d2,w),den=1-b*b;const t=(dw1-b*dw2)/den,u=(b*dw1-dw2)/den;
  return {parallel:false,abstand:Math.abs(dd),winkel:acosK(Math.abs(c))*GRAD,p1:add(a1.c,mul(d1,t)),p2:add(a2.c,mul(d2,u))}}
/** Winkel im Material an einer gemeinsamen Kante zweier ebener Flächen (n1, n2 = äußere Normalen). konvex → 180° − φ, konkav → 180° + φ. */
export function innenWinkel(n1,n2,konvex){const phi=acosK(dot(norm(n1),norm(n2)))*GRAD;return konvex?180-phi:180+phi}
/** Kopieren aus dem Ergebnis: 1. Klick voller Wert (bis 6 Nachkommastellen, ohne Endnullen), 2. Klick gerundet auf die Anzeige. Dezimalkomma. */
export function kopierWert(v,stellen,gerundet){if(typeof v!=='number'||!isFinite(v))return String(v);
  const t=gerundet?v.toFixed(stellen):String(+v.toFixed(6));return t.replace('.',',')}
