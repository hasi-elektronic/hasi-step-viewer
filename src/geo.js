// Trumpf GEO (TruTops / TruTops Boost): Lesen und Schreiben der Abwicklung.
// Aufbau (Textdatei, Abschnitte „#~Nr“ … „##~~“): #~1 Kopf (Version, Datum, Zuschnitt min/max, Fläche), #~11 Teil (Name, Werkstoff, Dicke),
// #~3 Ansicht/Bearbeitung, #~30 Attribute (NAME@Wert), #~31 Punkte (P / Nr / x y z), #~38 Biegeattribute (BATT),
// #~33 + #~331 Konturen (LIN p1 p2, ARC Mitte Start Ende Richtung, CIR Mitte Radius; Kopf: „Nr 24 0|1“ 0 = Außen-, 1 = Innenkontur),
// #~37 + #~371 Biegelinien (Winkel ±, Radius, Biegeverkürzung negativ, Werkzeuge, LIN mit Stift 4). Einheiten mm, Ursprung links unten.
const f9=v=>(Math.abs(v)<5e-10?0:v).toFixed(9);
/** GEO-Text lesen. Ergebnis: {kopf:{min,max,flaeche,datum}, teil:{name,werkstoff,dicke}, attr:{}, punkte:Map, konturen:[{nr,innen,elemente}], biegungen:[…]} */
export function parseGeo(text){
  const L=String(text).replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');const num=s=>s.trim().split(/\s+/).map(Number);
  const out={kopf:null,teil:null,attr:{},punkte:new Map(),konturen:[],biegungen:[],battr:new Map()};let i=0;
  const bis=(i,ende)=>{let j=i;while(j<L.length&&L[j]!==ende)j++;return j};
  while(i<L.length){const z=L[i];
    if(z==='#~1'){out.kopf={version:L[i+1],datum:L[i+3],min:num(L[i+4]),max:num(L[i+5]),flaeche:+L[i+6]};i=bis(i,'##~~')+1;continue}
    if(z==='#~11'){const blk=L.slice(i+1,bis(i,'##~~'));out.teil={name:blk[0],werkstoff:blk[5]||'',dicke:+blk[6]};i+=blk.length+1;continue}
    if(z==='#~30'){let j=i+1;for(;j<L.length&&!L[j].startsWith('#~');j++){const k=L[j].indexOf('@');if(k>0)out.attr[L[j].slice(0,k)]=L[j].slice(k+1)}i=j;continue}
    if(z==='#~31'){let j=i+1;for(;j<L.length&&L[j]!=='##~~';j++)if(L[j]==='P'){out.punkte.set(+L[j+1],num(L[j+2]).slice(0,2));j+=3}i=j+1;continue}
    if(z==='#~38'){let j=i+1;for(;j<L.length&&L[j]!=='#~BEND_ATTRIBUTE_END';j++)if(L[j]==='BATT'){out.battr.set(+L[j+1],{wert:L[j+3],name:L[j+4]});j+=5}i=j+1;continue}
    if(z==='#~33'){const h=L[i+2].trim().split(/\s+/).map(Number);const k={nr:h[0],innen:h[2]===1,elemente:[]};
      let j=bis(i,'#~331')+1;for(;j<L.length&&L[j]!=='##~~';j++){const t=L[j];
        if(t==='LIN'){const [a,b]=num(L[j+2]);k.elemente.push({typ:'LIN',p:[a,b]});j+=3}
        else if(t==='ARC'){const [c,a,b]=num(L[j+2]);k.elemente.push({typ:'ARC',c,p:[a,b],dir:+L[j+3]});j+=4}
        else if(t==='CIR'){k.elemente.push({typ:'CIR',c:+L[j+2],r:+L[j+3]});j+=4}}
      out.konturen.push(k);i=bis(j,'#~KONT_END')+1;continue}
    if(z==='#~37'){const w=num(L[i+2]),r=num(L[i+3]);const b={winkel:w[0],winkel2:w[1],radius:r[0],bd:-(+L[i+4]),oben:L[i+5],unten:L[i+6]};
      const n=+L[i+7];b.attribute=L.slice(i+8,i+8+n).map(Number);let j=bis(i,'#~371')+1;
      for(;j<L.length&&L[j]!=='##~~';j++)if(L[j]==='LIN'){b.stift=num(L[j+1]);b.p=num(L[j+2]);j+=3}
      out.biegungen.push(b);i=bis(j,'#~BIEG_END')+1;continue}
    i++}
  // Biegeattribute je Biegung (Konstruktionsradius, Biegeverkürzung) zuordnen
  for(const b of out.biegungen){for(const a of b.attribute||[]){const x=out.battr.get(a);if(!x)continue;if(x.name==='DESIGN_BEND_RADIUS')b.riKonstruktion=+x.wert;if(x.name==='DESIGN_BEND_DEDUCTION')b.bdKonstruktion=+x.wert}}
  return out}
const TW=2*Math.PI;
/** Bogen eines GEO-ARC: Richtung −1 = im Uhrzeigersinn, +1 = gegen den Uhrzeigersinn */
export function geoBogen(P,e){const c=P.get(e.c),a=P.get(e.p[0]),b=P.get(e.p[1]);const r=Math.hypot(a[0]-c[0],a[1]-c[1]);
  const wa=Math.atan2(a[1]-c[1],a[0]-c[0]),wb=Math.atan2(b[1]-c[1],b[0]-c[0]);let sw=((wb-wa)%TW+TW)%TW;if(e.dir<0)sw=sw-TW;if(Math.abs(sw)<1e-12)sw=e.dir<0?-TW:TW;return {c,r,wa,sw}}
/** Kennzahlen einer GEO-Datei zum Vergleich: Ausdehnung, Konturen, Bögen, Kreise, Biegungen, Fläche (Außen − Innen, exakt mit Bögen) */
export function geoKennzahlen(g){const P=g.punkte;let mn=[Infinity,Infinity],mx=[-Infinity,-Infinity];const ext=p=>{for(let k=0;k<2;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k])}};
  let flaeche=0,boegen=0,kreise=0,linien=0,schnitt=0;
  for(const k of g.konturen){let A=0;
    for(const e of k.elemente){
      if(e.typ==='CIR'){kreise++;schnitt+=TW*e.r;const c=P.get(e.c);ext([c[0]-e.r,c[1]-e.r]);ext([c[0]+e.r,c[1]+e.r]);A+=Math.PI*e.r*e.r;continue}
      const a=P.get(e.p[0]),b=P.get(e.p[1]);ext(a);ext(b);
      if(e.typ==='LIN'){linien++;schnitt+=Math.hypot(b[0]-a[0],b[1]-a[1]);A+=(a[0]*b[1]-b[0]*a[1])/2;continue}
      boegen++;const q=geoBogen(P,e);schnitt+=q.r*Math.abs(q.sw);A+=(a[0]*b[1]-b[0]*a[1])/2+q.r*q.r*(q.sw-Math.sin(q.sw))/2;
      for(let m=-8;m<=8;m++){const w=m*Math.PI/2;const d=q.sw>0?((w-q.wa)%TW+TW)%TW:((q.wa-w)%TW+TW)%TW;if(d<=Math.abs(q.sw)+1e-12)ext([q.c[0]+q.r*Math.cos(w),q.c[1]+q.r*Math.sin(w)])}}
    k.flaeche=k.elemente.length===1&&k.elemente[0].typ==='CIR'?A:Math.abs(A);flaeche+=k.innen?-k.flaeche:k.flaeche}
  return {min:mn,max:mx,groesse:[mx[0]-mn[0],mx[1]-mn[1]],konturen:g.konturen.length,aussen:g.konturen.filter(k=>!k.innen).length,innen:g.konturen.filter(k=>k.innen).length,
    linien,boegen,kreise,schnittLaenge:schnitt,biegungen:g.biegungen.length,flaeche,biegeLaenge:g.biegungen.reduce((s,b)=>{const a=P.get(b.p?.[0]),c=P.get(b.p?.[1]);return s+(a&&c?Math.hypot(c[0]-a[0],c[1]-a[1]):0)},0)}}
/** Biegetabelle (Zeilen wie parseBiegetabelle: s, ri, w = Biegewinkel φ, bd) aus einer Trumpf-GEO. GEO-Winkel = Öffnungswinkel β → φ = 180° − |β|. */
export function geoBiegetabelle(g){const s=g.teil?.dicke;if(!(s>0))throw new Error('GEO: Blechdicke fehlt (Abschnitt #~11).');const rows=[],seen=new Set();
  for(const b of g.biegungen){const ri=b.riKonstruktion??b.radius;const w=180-Math.abs(b.winkel);const bd=b.bdKonstruktion??b.bd;if(!(ri>=0)||!(bd>0)||!(w>0))continue;
    const key=`${s}|${ri}|${w.toFixed(3)}`;if(seen.has(key))continue;seen.add(key);rows.push({s,ri,w,bd,v:-bd,K:NaN,spalte:'BD',quelle:'Trumpf-GEO',werkzeug:[b.oben,b.unten].filter(Boolean).join(' / ')})}
  if(!rows.length)throw new Error('GEO: keine Biegungen mit Biegeverkürzung gefunden.');return rows}

// ---------- Lage der Abwicklung wie Trumpf ----------
/** Lage 'trumpf': lange Seite in Y (Hochformat) – liegt der Zuschnitt quer, wird er um +90° (gegen den Uhrzeigersinn) gedreht.
 *  So lag ein Kundenteil 1:1 auf der TruTops-Boost-GEO (Bohrungen und Biegelinien ≤ 0,0001 mm). Ursprung bleibt links unten (min).
 *  Gibt eine gedrehte Kopie zurück (flat.lage = {art, drehung}). 'original' = Lage wie berechnet. */
export function abwicklungLage(flat,lage='trumpf'){if(!flat||lage!=='trumpf'||!(flat.size[0]>flat.size[1]+1e-9))return {...flat,lage:{art:lage,drehung:0}};
  const R=p=>[-p[1],p[0]],Rv=v=>v&&[-v[1],v[0]];
  const kanten=(flat.kanten||[]).map(k=>({pts:k.pts.map(R),bogen:k.bogen?{...k.bogen,c:R(k.bogen.c),...(k.bogen.voll?{}:{a0:k.bogen.a0+Math.PI/2,a1:k.bogen.a1+Math.PI/2})}:null}));
  const mn=[-flat.max[1],flat.min[0]],mx=[-flat.min[1],flat.max[0]];
  return {...flat,contour:flat.contour.map(l=>l.map(R)),kanten,bendLines:flat.bendLines.map(b=>b.map(R)),rissLinien:(flat.rissLinien||[]).map(l=>l.map(R)),
    bendInfo:(flat.bendInfo||[]).map(b=>({...b,seite:Rv(b.seite)})),min:mn,max:mx,size:[mx[0]-mn[0],mx[1]-mn[1]],lage:{art:'trumpf',drehung:90}}}

// ---------- GEO schreiben ----------
/** Abwicklung als Trumpf-GEO (Aufbau wie TruTops Boost 1.03): Außenkontur und Innenkonturen mit echten Bögen (ARC) und Kreisen (CIR),
 *  Biegelinien mit Winkel (GEO: Öffnungswinkel, Vorzeichen − = AB, + = AUF), Radius und Biegeverkürzung. Ursprung links unten (0,0).
 *  schleifen: Ergebnis von konturSchleifen(flat). meta: {name, werkstoff, dicke, datum, bends:[{ang, ri, bd, dir}]}. CRLF, Codepage 1252 (nur ASCII-Namen). */
export function geoSchreiben(flat,schleifen,meta={}){
  const ox=flat.min[0],oy=flat.min[1];const P=[],key=new Map();const tol=1e-6;
  const pt=p=>{const x=p[0]-ox,y=p[1]-oy;const k=Math.round(x/tol)+':'+Math.round(y/tol);let i=key.get(k);if(i)return i;P.push([x,y]);i=P.length;key.set(k,i);return i};
  const gerade=pts=>{const r=[pts[0]];for(let i=1;i<pts.length-1;i++){const a=r.at(-1),b=pts[i],c=pts[i+1];const cr=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const l=Math.hypot(c[0]-a[0],c[1]-a[1])||1;if(Math.abs(cr)/l>1e-7)r.push(b)}r.push(pts.at(-1));return r};
  // Konturen → Elemente; Fläche (mit Bögen) und Länge je Kontur
  const kont=[];
  for(const s of schleifen){if(!s.zu)continue;const el=[];let A=0,len=0,mn=[Infinity,Infinity],mx=[-Infinity,-Infinity],cx=0,cy=0;
    const ext=p=>{mn=[Math.min(mn[0],p[0]-ox),Math.min(mn[1],p[1]-oy)];mx=[Math.max(mx[0],p[0]-ox),Math.max(mx[1],p[1]-oy)]};
    const seg=(a,b)=>{const c=(a[0]*b[1]-b[0]*a[1])/2;A+=c;cx+=c*(a[0]+b[0])/3;cy+=c*(a[1]+b[1])/3};
    if(s.kreis){const b=s.kreis;el.push({typ:'CIR',c:pt(b.c),r:b.r});ext([b.c[0]-b.r,b.c[1]-b.r]);ext([b.c[0]+b.r,b.c[1]+b.r]);A=Math.PI*b.r*b.r;cx=b.c[0]*A;cy=b.c[1]*A;len=TW*b.r;kont.push({el,A,len,mn,mx,c:[b.c[0]-ox,b.c[1]-oy],kreis:true});continue}
    for(const {k,rev} of s.segs){const pts=rev?[...k.pts].reverse():k.pts;pts.forEach(ext);
      if(k.bogen&&!k.bogen.voll){const b=k.bogen,ccw=rev?!b.ccw:b.ccw,a=pts[0],e=pts.at(-1);el.push({typ:'ARC',c:pt(b.c),p:[pt(a),pt(e)],dir:ccw?1:-1});
        const sw=(ccw?1:-1)*b.sweep;seg(a,e);const seg2=b.r*b.r*(sw-Math.sin(sw))/2;A+=seg2;
        // Schwerpunkt des Kreisabschnitts (für den Teileschwerpunkt in #~3)
        const m=Math.atan2((a[1]+e[1])/2-b.c[1],(a[0]+e[0])/2-b.c[0]),h=Math.abs(sw)>1e-12?4*b.r*Math.pow(Math.sin(Math.abs(sw)/2),3)/(3*(Math.abs(sw)-Math.sin(Math.abs(sw)))):0;
        const dirM=Math.abs(sw)<=Math.PI?m:m+Math.PI;cx+=seg2*(b.c[0]+h*Math.cos(dirM));cy+=seg2*(b.c[1]+h*Math.sin(dirM));len+=b.r*b.sweep;
        for(let q=0;q<4;q++){const w=q*Math.PI/2;const d=((w-b.a0)%TW+TW)%TW;if(d<=b.sweep+1e-12)ext([b.c[0]+b.r*Math.cos(w),b.c[1]+b.r*Math.sin(w)])}}
      else{const g=gerade(pts);for(let i=1;i<g.length;i++){const ia=pt(g[i-1]),ib=pt(g[i]);if(ia!==ib){el.push({typ:'LIN',p:[ia,ib]});seg(g[i-1],g[i]);len+=Math.hypot(g[i][0]-g[i-1][0],g[i][1]-g[i-1][1])}}}}
    // aufeinanderfolgende gerade Stücke auf einer Linie zusammenfassen (auch über Kantengrenzen, wie TruTops)
    const gl=(a,b,c)=>{const A=P[a-1],B2=P[b-1],C=P[c-1];const l=Math.hypot(C[0]-A[0],C[1]-A[1])||1;const cr=(B2[0]-A[0])*(C[1]-A[1])-(B2[1]-A[1])*(C[0]-A[0]);
      return Math.abs(cr)/l<1e-7&&((B2[0]-A[0])*(C[0]-B2[0])+(B2[1]-A[1])*(C[1]-B2[1]))>0};
    for(let i=0;el.length>1&&i<el.length;){const a=el[i],b=el[(i+1)%el.length];
      if(a!==b&&a.typ==='LIN'&&b.typ==='LIN'&&a.p[1]===b.p[0]&&gl(a.p[0],a.p[1],b.p[1])){a.p=[a.p[0],b.p[1]];el.splice((i+1)%el.length,1);if((i+1)%el.length===0&&i>0)i--;continue}i++}
    if(el.length)kont.push({el,A,len,mn,mx,c:A?[cx/A-ox,cy/A-oy]:[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2]})}
  if(!kont.length)throw new Error('GEO: keine geschlossene Kontur.');
  // Außenkontur = größte Fläche; Außen gegen den Uhrzeigersinn? Trumpf: Reihenfolge wie gelesen – Richtung bleibt, nur ARC-Richtung zählt
  kont.sort((a,b)=>Math.abs(b.A)-Math.abs(a.A));const aussen=kont[0],innen=kont.slice(1);
  const netto=Math.abs(aussen.A)-innen.reduce((s,k)=>s+Math.abs(k.A),0);
  const sp=(()=>{let x=Math.abs(aussen.A)*aussen.c[0],y=Math.abs(aussen.A)*aussen.c[1];for(const k of innen){x-=Math.abs(k.A)*k.c[0];y-=Math.abs(k.A)*k.c[1]}return netto?[x/netto,y/netto]:[0,0]})();
  const schnitt=kont.reduce((s,k)=>s+k.len,0);
  // Biegelinien
  const bi=flat.bendInfo||[],mb=meta.bends||[];
  const bends=flat.bendLines.map((b,i)=>{const q=bi[i]||{},m=mb[i]||{};const auf=(q.dir||m.dir||'nach oben')==='nach oben';const phi=q.ang??m.ang??90;const beta=180-phi;
    return {a:pt(b[0]),e:pt(b[1]),winkel:(auf?1:-1)*beta,ri:m.ri??q.ri??0,bd:m.bd,auf}});
  const W=flat.size[0],H=flat.size[1];const L=[];const z=(...a)=>L.push(...a.map(String));
  const datum=meta.datum||new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
  const asc=t=>String(t??'').normalize('NFKD').replace(/[^\x20-\x7e]/g,'').replace(/[\r\n]/g,' ');
  const nn=n=>n.toFixed(9);
  z('#~1','1.03','2',datum,`${nn(0)} ${nn(0)} ${nn(0)}`,`${f9(W)} ${f9(H)} ${nn(0)}`,f9(netto),'1','0.001000000','0','1','##~~');
  z('#~11',asc(meta.name||'Abwicklung'),'','','','',asc(meta.werkstoff||''),(+meta.dicke||0).toFixed(17).replace(/^(\d+\.\d{17}).*$/,'$1'),'','','0','0','0','0','0','0','0','0','0','','##~~','#~END');
  z('#~3','','LASER','',`${nn(0)} ${nn(0)} ${nn(1)}`,`${nn(1)} ${nn(0)} ${nn(0)} ${nn(0)}`,`${nn(0)} ${nn(1)} ${nn(0)} ${nn(0)}`,`${nn(0)} ${nn(0)} ${nn(1)} ${nn(0)}`,`${nn(0)} ${nn(0)} ${nn(0)} ${nn(1)}`,
    `${nn(0)} ${nn(0)} ${nn(0)}`,`${f9(W)} ${f9(H)} ${nn(0)}`,`${f9(sp[0])} ${f9(sp[1])} ${nn(0)}`,f9(netto),String(kont.length),'0','0','0','0','##~~');
  z('#~30','ANSI_CODEPAGE@1252',`BEND_COUNT@${bends.length}`,`FORM_COUNT@0`,`IDENT@${asc(meta.name||'Abwicklung')}`,`INFO_1@Part Contains ${bends.length} bend(s)`,
    ...(meta.werkstoff?[`MAT@${asc(meta.werkstoff)}`]:[]),`SOURCE@${asc(meta.quelle||'Hasi 3D')}`,`TOTAL_LENGTH@${schnitt.toFixed(2)}`,'#~TTINFO_END');
  z('#~31');P.forEach((p,i)=>z('P',String(i+1),`${f9(p[0])} ${f9(p[1])} ${nn(0)}`,'|~'));z('##~~');
  // Biegeattribute: Konstruktionsradius und Biegeverkürzung je Biegung (wie TruTops: BEND_IDENTIFIER, DESIGN_BEND_RADIUS, DESIGN_BEND_DEDUCTION)
  z('#~38');let ba=0;const attrNr=bends.map((b,i)=>{const n=[];const a=(w,name,typ)=>{ba++;z('BATT',String(ba),'2',w,name,String(typ),'|~');n.push(ba)};
    a('bend_'+i,'BEND_IDENTIFIER',101);a(String(+(+b.ri).toFixed(6)),'DESIGN_BEND_RADIUS',102);if(b.bd!=null&&isFinite(b.bd))a(String(+(+b.bd).toFixed(6)),'DESIGN_BEND_DEDUCTION',102);return n});z('#~BEND_ATTRIBUTE_END');
  const kopf=(k,nr,ist)=>{z('#~33','',`${nr} 24 ${ist?1:0}`,ist?'0':String(innen.length),`${nn(0)} ${nn(0)} ${nn(ist?-1:1)}`,`${f9(k.mn[0])} ${f9(k.mn[1])} ${nn(0)}`,`${f9(k.mx[0])} ${f9(k.mx[1])} ${nn(0)}`,
    `${f9((k.mn[0]+k.mx[0])/2)} ${f9((k.mn[1]+k.mx[1])/2)} ${nn(0)}`,f9(Math.abs(k.A)),ist?'1':'0','##~~','#~331');
    for(const e of k.el){if(e.typ==='LIN')z('LIN','1 0',`${e.p[0]} ${e.p[1]}`,'|~');else if(e.typ==='ARC')z('ARC','1 0',`${e.c} ${e.p[0]} ${e.p[1]}`,String(e.dir),'|~');else z('CIR','1 0',String(e.c),f9(e.r),'|~')}
    z('##~~','#~KONT_END')};
  kopf(aussen,1,false);innen.forEach((k,i)=>kopf(k,i+2,true));
  bends.forEach((b,i)=>{z('#~37','0 0 0',`${f9(b.winkel)} ${b.auf?'180.000000000':'-180.000000000'}`,`${f9(b.ri)} ${f9(b.ri)}`,b.bd!=null&&isFinite(b.bd)?f9(-b.bd):nn(0),'','',String(attrNr[i].length),...attrNr[i].map(String),'##~~','#~371','LIN',`4 ${b.auf?0:1}`,`${b.a} ${b.e}`,'|~','##~~','#~BIEG_END')});
  z('#~END','#~EOF');
  return {text:L.join('\r\n')+'\r\n',stat:{punkte:P.length,konturen:kont.length,innen:innen.length,biegungen:bends.length,flaeche:netto,schnittLaenge:schnitt,groesse:[W,H]}}}
