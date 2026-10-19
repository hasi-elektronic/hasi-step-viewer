// Bemaßung wie in AutoCAD, als 2D-Overlay über der 3D-Ansicht (bleibt beim Drehen lesbar, Text immer zur Kamera ausgerichtet).
// Alle Punkte in Modellkoordinaten (mm, aus der B-Rep). P(p) projiziert einen Modellpunkt auf den Bildschirm [x,y] (CSS-Pixel).
const V={add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len:a=>Math.hypot(a[0],a[1],a[2]),
  norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l]}};
export {V};
export const STIL_STANDARD={groesse:14,pfeil:'pfeil',stellen:2};
export const PFEILARTEN=[['pfeil','Pfeil (gefüllt)'],['offen','Pfeil (offen)'],['schraeg','Schrägstrich'],['punkt','Punkt']];
export const TYPEN=[['auto','Automatisch'],['ausgerichtet','Linear ausgerichtet'],['horizontal','Linear horizontal'],['vertikal','Linear vertikal'],['winkel','Winkel'],['radius','Radius R'],['durchmesser','Durchmesser Ø'],['bogen','Bogenlänge'],['koordinate','Koordinate']];
export const TOLERANZEN=[['keine','Keine'],['symm','± symmetrisch'],['abmass','Abmaße (+/−)'],['grenz','Grenzmaß']];
const zahl=(v,n)=>v.toLocaleString('de-DE',{minimumFractionDigits:n,maximumFractionDigits:n});
const basis=n=>{const a=Math.abs(n[0])<0.9?[1,0,0]:[0,1,0];const e1=V.norm(V.cross(n,a));return [e1,V.cross(n,e1)]};

/** Maßtext: [Haupttext, Zusatz oben, Zusatz unten] (Zusätze klein gestapelt, z. B. Abmaße). */
export function massText(d,stil){const n=stil.stellen,w=d.wert;const t=d.tol||{art:'keine'};const o=+t.o||0,u=+t.u||0;
  const wert=d.einheit==='W'?zahl(w,n)+'°':zahl(w,n);
  const vor={radius:'R ',durchmesser:'Ø ',bogen:'⌒ '}[d.typ]||'';
  let haupt=d.text&&d.text.trim()?d.text:vor+wert,oben='',unten='';
  if(t.art==='symm')haupt+=' ±'+zahl(o,n);
  else if(t.art==='abmass'){oben=(o>=0?'+':'−')+zahl(Math.abs(o),n);unten=(u>0?'+':'−')+zahl(Math.abs(u),n)}
  else if(t.art==='grenz'){haupt=d.text&&d.text.trim()?d.text:vor;oben=zahl(w+o,n);unten=zahl(w-Math.abs(u),n)}
  return [(d.praefix||'')+haupt,oben,unten,d.suffix||'']}

function pfeil(ctx,p,dir,art,s){const [x,y]=p,[dx,dy]=dir;const nx=-dy,ny=dx;const L=s*0.9,W=s*0.3;
  ctx.beginPath();
  if(art==='schraeg'){ctx.moveTo(x-(dx+nx)*L*0.45,y-(dy+ny)*L*0.45);ctx.lineTo(x+(dx+nx)*L*0.45,y+(dy+ny)*L*0.45);ctx.lineWidth=2;ctx.stroke();ctx.lineWidth=1.2;return}
  if(art==='punkt'){ctx.arc(x,y,s*0.22,0,7);ctx.fill();return}
  ctx.moveTo(x,y);ctx.lineTo(x-dx*L+nx*W,y-dy*L+ny*W);if(art==='offen'){ctx.moveTo(x,y)}ctx.lineTo(x-dx*L-nx*W,y-dy*L-ny*W);
  if(art==='offen')ctx.stroke();else{ctx.closePath();ctx.fill()}}
const unit2=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [dx/l,dy/l]};
const linie=(ctx,pts)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke()};
// Text an Position p, Winkel ang (lesbar: nie kopfüber), oberhalb der Linie (oben=true) oder zentriert. Liefert Bildschirm-Rechteck.
function text(ctx,p,ang,teile,stil,ueber=true){const [haupt,o,u,suf]=teile;const g=stil.groesse;
  while(ang>Math.PI/2)ang-=Math.PI;while(ang<=-Math.PI/2)ang+=Math.PI;
  ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(ang);ctx.font=`600 ${g}px system-ui,sans-serif`;
  const wH=ctx.measureText(haupt).width;ctx.font=`600 ${g*0.7}px system-ui,sans-serif`;const wS=Math.max(ctx.measureText(o).width,ctx.measureText(u).width);
  ctx.font=`600 ${g}px system-ui,sans-serif`;const wSuf=suf?ctx.measureText(' '+suf).width:0;const W=wH+(wS?wS+3:0)+wSuf;
  const y0=ueber?-g*0.35:g*0.35;ctx.textBaseline=ueber?'bottom':'middle';ctx.lineJoin='round';
  const draw=(t,x,y)=>{ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=4;ctx.strokeText(t,x,y);ctx.fillText(t,x,y)};
  draw(haupt,-W/2,y0);
  if(wS){ctx.font=`600 ${g*0.7}px system-ui,sans-serif`;ctx.textBaseline='alphabetic';const xs=-W/2+wH+3,yb=ueber?y0-g*0.05:y0+g*0.35;draw(o,xs,yb-g*0.55);draw(u,xs,yb+(ueber?0:0.05*g));ctx.font=`600 ${g}px system-ui,sans-serif`;ctx.textBaseline=ueber?'bottom':'middle'}
  if(suf)draw(' '+suf,-W/2+wH+(wS?wS+3:0),y0);
  ctx.restore();const r=Math.max(W,g)/2+4;return {x:p[0],y:p[1],r,w:W,h:g*1.3}}

/** Zeichnet eine Bemaßung. Liefert die Trefferfläche für das Ziehen ({x,y,r}). */
export function zeichne(ctx,d,P,stil,farbe='#0a6fb0'){ctx.strokeStyle=farbe;ctx.fillStyle=farbe;ctx.lineWidth=1.2;const s=stil.groesse,art=stil.pfeil,T=massText(d,stil);
  const ext=(a,b)=>{const u=unit2(a,b),L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<4)return;linie(ctx,[[a[0]+u[0]*3,a[1]+u[1]*3],[b[0]+u[0]*6,b[1]+u[1]*6]])};
  if(['ausgerichtet','horizontal','vertikal'].includes(d.typ)){const g=geomLinear(d);const A=P(d.p1),B=P(d.p2),L1=P(g.l1),L2=P(g.l2);
    ext(A,L1);ext(B,L2);linie(ctx,[L1,L2]);const u=unit2(L1,L2);pfeil(ctx,L2,u,art,s);pfeil(ctx,L1,[-u[0],-u[1]],art,s);
    return text(ctx,[(L1[0]+L2[0])/2,(L1[1]+L2[1])/2],Math.atan2(u[1],u[0]),T,stil)}
  if(d.typ==='winkel'){const rr=Math.max(V.len(d.off||[0,0,0]),1e-6);const pts=bogenPunkte(d.v,d.u1,d.u2,rr).map(P);
    ext(P(d.v),pts[0]);ext(P(d.v),pts.at(-1));linie(ctx,pts);pfeil(ctx,pts.at(-1),unit2(pts.at(-2),pts.at(-1)),art,s);pfeil(ctx,pts[0],unit2(pts[1],pts[0]),art,s);
    const m=pts[pts.length>>1],t=unit2(pts[(pts.length>>1)-1],pts[(pts.length>>1)+1]);return text(ctx,m,Math.atan2(t[1],t[0]),T,stil)}
  if(d.typ==='radius'||d.typ==='durchmesser'){const [e1,e2]=basis(d.n);const a=d.ang??0.6;const dir=V.add(V.mul(e1,Math.cos(a)),V.mul(e2,Math.sin(a)));
    const q=V.add(d.c,V.mul(dir,d.rad)),C=P(d.c),Q=P(q);const qa=d.typ==='durchmesser'?P(V.sub(d.c,V.mul(dir,d.rad))):C;
    const u=unit2(qa,Q);const lead=[Q[0]+u[0]*s*2.2,Q[1]+u[1]*s*2.2];const right=u[0]>=0;const end=[lead[0]+(right?1:-1)*s*0.8,lead[1]];
    linie(ctx,[qa,Q,lead,end]);pfeil(ctx,Q,u,art,s);if(d.typ==='durchmesser')pfeil(ctx,qa,[-u[0],-u[1]],art,s);else{ctx.beginPath();ctx.arc(C[0],C[1],2.5,0,7);ctx.fill()}
    ctx.save();ctx.textAlign='left';const tw=(()=>{ctx.font=`600 ${s}px system-ui,sans-serif`;return ctx.measureText(T[0]).width+(T[1]?s:0)})();ctx.restore();
    return text(ctx,[end[0]+(right?1:-1)*(tw/2+4),end[1]],0,T,stil,false)}
  if(d.typ==='bogen'){const rr=d.rad+Math.max(d.offR??d.rad*0.3,1e-6);const [e1,e2]=basis(d.n);const pt=(a,r)=>V.add(d.c,V.add(V.mul(e1,Math.cos(a)*r),V.mul(e2,Math.sin(a)*r)));
    const N=32,pts=[];for(let i=0;i<=N;i++)pts.push(P(pt(d.a0+(d.a1-d.a0)*i/N,rr)));ext(P(pt(d.a0,d.rad)),pts[0]);ext(P(pt(d.a1,d.rad)),pts[N]);linie(ctx,pts);
    pfeil(ctx,pts[N],unit2(pts[N-1],pts[N]),art,s);pfeil(ctx,pts[0],unit2(pts[1],pts[0]),art,s);const t=unit2(pts[N/2-1],pts[N/2+1]);return text(ctx,pts[N/2],Math.atan2(t[1],t[0]),T,stil)}
  if(d.typ==='koordinate'){const A=P(d.p),B=P(V.add(d.p,d.off||[0,0,0]));const right=B[0]>=A[0];const E=[B[0]+(right?1:-1)*s,B[1]];linie(ctx,[A,B,E]);ctx.beginPath();ctx.arc(A[0],A[1],2.5,0,7);ctx.fill();
    const n=stil.stellen,zeilen=[`X ${zahl(d.p[0],n)}`,`Y ${zahl(d.p[1],n)}`,`Z ${zahl(d.p[2],n)}`];ctx.font=`600 ${s}px system-ui,sans-serif`;const w=Math.max(...zeilen.map(z=>ctx.measureText(z).width));
    const x0=right?E[0]+4:E[0]-4-w;zeilen.forEach((z,i)=>{ctx.textBaseline='middle';ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=4;const y=E[1]+(i-1)*s*1.2;ctx.strokeText(z,x0,y);ctx.fillText(z,x0,y)});
    return {x:x0+w/2,y:E[1],r:Math.max(w,s*3)/2+4}}
  return null}
export function geomLinear(d){const dir=d.typ==='ausgerichtet'?V.norm(V.sub(d.p2,d.p1)):V.norm(d.dir);let off=d.off||[0,0,0];off=V.sub(off,V.mul(dir,V.dot(off,dir)));
  const l1=V.add(d.p1,off),l2=V.add(l1,V.mul(dir,V.dot(V.sub(d.p2,d.p1),dir)));return {dir,off,l1,l2,mid:V.mul(V.add(d.p1,d.p2),0.5)}}
export function bogenPunkte(v,u1,u2,rr,N=32){const a=V.norm(u1),b=V.norm(u2);const om=Math.acos(Math.max(-1,Math.min(1,V.dot(a,b))));const out=[];
  for(let i=0;i<=N;i++){const t=i/N;let w;if(om<1e-6)w=a;else{const s=Math.sin(om);w=V.add(V.mul(a,Math.sin((1-t)*om)/s),V.mul(b,Math.sin(t*om)/s))}out.push(V.add(v,V.mul(w,rr)))}return out}
/** Ziehen: Bemaßung so versetzen, dass sie durch den Modellpunkt M geht. */
export function ziehe(d,M){if(['ausgerichtet','horizontal','vertikal'].includes(d.typ)){const g=geomLinear(d);d.off=V.sub(M,d.p1);d.off=V.sub(d.off,V.mul(g.dir,V.dot(d.off,g.dir)))}
  else if(d.typ==='winkel'){const r=V.len(V.sub(M,d.v));d.off=V.mul(V.norm(d.u1),Math.max(r,1e-3))}
  else if(d.typ==='radius'||d.typ==='durchmesser'){const [e1,e2]=basis(d.n);const w=V.sub(M,d.c);d.ang=Math.atan2(V.dot(w,e2),V.dot(w,e1))}
  else if(d.typ==='bogen'){const [e1,e2]=basis(d.n);const w=V.sub(M,d.c);const r=Math.hypot(V.dot(w,e1),V.dot(w,e2));d.offR=Math.max(r-d.rad,d.rad*0.05)}
  else if(d.typ==='koordinate')d.off=V.sub(M,d.p)}
/** Bogenwinkel a0..a1 eines Kreisbogens (Kreis c,n,r) aus Anfangs- und Endpunkt. */
export function bogenWinkel(c,n,p0,p1,voll){const [e1,e2]=basis(n);const ang=p=>{const w=V.sub(p,c);return Math.atan2(V.dot(w,e2),V.dot(w,e1))};let a0=ang(p0),a1=ang(p1);
  if(voll)return [a0,a0+2*Math.PI];while(a1<=a0)a1+=2*Math.PI;return [a0,a1]}
