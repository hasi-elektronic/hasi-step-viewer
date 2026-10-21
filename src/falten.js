// Falten/Entfalten (lineares Abwickeln wie ZW3D „Linear Unfold“): Jede Biegung wird gleichzeitig um den Anteil λ aufgebogen.
// Die neutrale Faser behält ihre Länge (Biegezugabe BZ), der Radius wächst dabei mit 1/(1−λ). λ = 0: gefaltet (3D-Teil), λ = 1: flach (Abwicklung).
// Die Abwicklung liegt in der Ebene der festen Fläche (basis: Ursprung o, Achsen e1/e2, Normale n0 = e1 × e2).
// Biegung b (aus M.sheet): Streifenanfang S2, Kantenrichtung D2, Richtung in die Lasche W2 (alles 2D), Biegezugabe BZ, Winkel th,
// dS = neutraler Radius − Radius der Haut, sigma = +1 (Lasche hebt sich zur Normale n0, „nach oben“) oder −1.
// kette: Biegungen von der festen Fläche bis zur Fläche (Wurzel → Blatt); wrap: Fläche ist selbst die letzte Biegung (Zylinder).
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const rot=(v,k,a)=>{const c=Math.cos(a),s=Math.sin(a);return add(add(mul(v,c),mul(cross(k,v),s)),mul(k,dot(k,v)*(1-c)))};
export const einbetten=(B,u,v)=>add(add(B.o,mul(B.e1,u)),mul(B.e2,v));
const vek=(B,d)=>add(mul(B.e1,d[0]),mul(B.e2,d[1]));

/** Punkt der Abwicklung (2D) für den Entfaltungsgrad lambda (0 … 1) in 3D. */
export function faltePunkt(P2,kette,wrap,bends,B,lambda){
  let p=einbetten(B,P2[0],P2[1]);
  for(let j=kette.length-1;j>=0;j--){const b=bends[kette[j]];const al=(1-lambda)*b.th;if(!(al>1e-12))continue;
    const S=einbetten(B,b.S2[0],b.S2[1]),w=vek(B,b.W2),d=vek(B,b.D2),n=B.n0,sg=b.sigma;
    const ra=b.BZ/al-b.dS,C=add(S,mul(n,sg*ra));
    if(wrap&&j===kette.length-1){const rel=sub(p,S),ww=dot(rel,w),ax=dot(rel,d),ph=ww*al/b.BZ;
      p=add(add(C,mul(n,-sg*ra*Math.cos(ph))),add(mul(w,ra*Math.sin(ph)),mul(d,ax)));continue}
    const Es=add(S,mul(w,b.BZ)),Ee=add(C,add(mul(n,-sg*ra*Math.cos(al)),mul(w,ra*Math.sin(al))));
    p=add(Ee,rot(sub(p,Es),mul(cross(w,n),sg),al))}
  return p;
}

/** Netz für einen Entfaltungsgrad: netz = {p2: [u,v,…] je Dreiecksecke, fk: Fläche je Dreieck}, F = {basis, bends, kette}. */
export function falteNetz(netz,F,lambda,out){
  const n=netz.p2.length/2;out=out||new Float32Array(n*3);
  for(let i=0;i<n;i++){const fi=netz.fk[Math.floor(i/3)],k=F.kette[fi];const p=faltePunkt([netz.p2[2*i],netz.p2[2*i+1]],k?k.k:[],k?k.wrap:false,F.bends,F.basis,lambda);
    out[3*i]=p[0];out[3*i+1]=p[1];out[3*i+2]=p[2]}
  return out;
}
