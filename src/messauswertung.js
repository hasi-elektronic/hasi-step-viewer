import {messartInfo,messauswahlHinweis,kreisbogenMasse,dreiPunktWinkel,dreiPunktKreis} from './messarten.js';

const hinweis = text => ({rows:[['Auswahl',text,'t']],gfx:[],bereit:false,hinweis:text});
const plus=(a,b)=>a.map((x,i)=>x+b[i]);
const minus=(a,b)=>a.map((x,i)=>x-b[i]);
const mal=(a,f)=>a.map(x=>x*f);
const mitte=(a,b)=>mal(plus(a,b),0.5);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const norm=a=>mal(a,1/Math.hypot(...a));
const quer=n=>{const a=Math.abs(n[0])<0.8?[1,0,0]:[0,1,0];return norm(minus(a,mal(n,dot(a,n))))};
function winkelGeometrie(r,sels,resolve,wert){
  const fertig=r.ff?.winkelMass;
  let v,u1,u2;
  if(fertig){({v,u1,u2}=fertig)}
  else{
    const richtung=s=>{const q=resolve(s);if(q.axis)return {d:q.axis.d,art:'a'};
      if(q.f?.plane)return {d:q.f.plane.n,art:'n'};
      if(q.f?.cyl||q.f?.cone)return {d:(q.f.cyl||q.f.cone).d,art:'a'};
      if(q.e?.line)return {d:q.e.line.d,art:'a'};
      if(q.e?.circle)return {d:q.e.circle.n,art:'n'};return null};
    const a=richtung(sels[0]),b=richtung(sels[1]);if(!a||!b)return null;
    u1=norm(a.d);u2=norm(b.d);
    if(a.art!==b.art){const n=a.art==='n'?u1:u2,d=a.art==='a'?u1:u2,proj=minus(d,mal(n,dot(n,d)));
      u1=d;u2=Math.hypot(...proj)>1e-10?norm(proj):quer(n)}
    v=r.gfx[0]?mitte(...r.gfx[0]):[0,0,0];
  }
  // Der Abstandskern meldet den kleineren Winkel; dieselben Schenkel zeichnen ihn.
  if(Math.abs(Math.acos(Math.max(-1,Math.min(1,dot(u1,u2))))*180/Math.PI-wert)>1e-6)u2=mal(u2,-1);
  return {v,u1,u2,wert};
}

/** Ergänzt CAD-Ergebnisse um explizite Messarten, ohne den Abstandskern zu duplizieren.
 * resolve liefert ausschließlich welttransformierte B-Rep-Geometrie, niemals das Anzeigenetz.
 */
export function gezieltMessen(sels,opts,{auto,resolve,punkt}) {
  const art=opts.messart||'auto';
  if(art!=='auto'){
    const msg=messauswahlHinweis(art,sels);if(msg)return hinweis(msg);
  }
  if(!sels.length)return hinweis(messartInfo(art).hint);
  if(art==='winkel3'||art==='kreis3'){
    const p=sels.map(punkt);
    try{
      if(art==='winkel3'){
        const w=dreiPunktWinkel(p),rows=[['Winkel (3 Punkte)',w.wert,'W','!'],['Schenkel 1',w.l1,'L'],['Schenkel 2',w.l2,'L'],['Scheitelpunkt',w.v,'P']];
        return {rows,gfx:[[p[1],p[0]],[p[1],p[2]]],label:rows[0],wahl:rows[0][0],bereit:true,messart:art,winkelMass:w,messpunkt:w.v,bemassungstyp:'winkel'};
      }
      const k=dreiPunktKreis(p),rows=[['Radius R',k.r,'L','!'],['Durchmesser Ø',2*k.r,'L'],['Kreisumfang',2*Math.PI*k.r,'L'],['Mittelpunkt',k.c,'P'],['Bezug','Kreis durch drei gewählte Punkte','t']];
      return {rows,gfx:[[k.c,p[0]]],label:rows[0],wahl:rows[0][0],bereit:true,messart:art,messkreis:k,messpunkt:k.c,bemassungstyp:'radius'};
    }catch(e){return hinweis(e.message)}
  }
  if(art==='summe'){
    const kanten=sels[0].k==='edge',name=kanten?'Gesamtlänge':'Gesamtfläche';
    const rows=[[name,sels.reduce((s,x)=>s+(kanten?resolve(x).e.len:resolve(x).f.area),0),kanten?'L':'A','!'],['Anzahl',sels.length,'t']];
    return {rows,gfx:[],label:rows[0],wahl:name,bereit:true,messart:art};
  }
  const r=auto(sels,opts);
  let kreis=null;
  if(sels.length===1){
    const s=sels[0],q=resolve(s),e=s.k==='edge'?q.e:null,f=s.k==='face'?q.f:null;
    if(e?.circle){
      kreis={...e.circle,voll:e.circle.ang>2*Math.PI-1e-6,winkel:e.circle.ang};
      r.messkreis=kreis;r.messpunkt=e.mid;
      if(!kreis.voll){
        const m=kreisbogenMasse(kreis.r,kreis.winkel);
        r.rows.push(['Sehnenlänge',m.sehne,'L'],['Bogenhöhe',m.hoehe,'L'],['Kreissektorfläche',m.sektor,'A'],['Kreissegmentfläche',m.segment,'A']);
        const basis=mitte(kreis.p0,kreis.p1);
        r.linien={...r.linien,'Sehnenlänge':[kreis.p0,kreis.p1],'Bogenhöhe':[basis,kreis.pm]};
      }else r.rows.push(['Kreisumfang',2*Math.PI*kreis.r,'L']);
    }else if(f?.cyl){
      const z=f.cyl;
      kreis={c:plus(z.c,mal(z.d,(z.v0+z.v1)/2)),n:z.d,r:z.r,voll:z.ang>2*Math.PI-1e-6,winkel:z.ang,p0:z.p0,p1:z.p1,pm:z.pm};r.messkreis=kreis;r.messpunkt=z.pm;
      // Biegeradien bleiben im Automatik-Ergebnis Ri/Ra; explizit gilt der angeklickte Mantel.
      if(!r.rows.some(row=>row[0]==='Radius R'))r.rows.push(['Radius R',kreis.r,'L'],['Durchmesser Ø',2*kreis.r,'L']);
    }else if(f?.sph){
      // Jeder Großkreis der Kugel besitzt denselben Radius; Beschriftung in Modell-XY.
      kreis={c:f.sph.c,n:[0,0,1],r:f.sph.r,voll:true};r.messkreis=kreis;r.messpunkt=f.sph.c;
    }else if(s.k==='axis'&&q.axis&&!q.f?.cone){
      kreis={c:q.axis.c,n:q.axis.d,r:q.axis.r,voll:true};r.messkreis=kreis;
    }
  }
  if(art==='auto')return r;
  let haupt=null,typ=null;
  const row=(...namen)=>namen.map(n=>r.rows.find(z=>z[0]===n)).find(Boolean);
  if(art==='radius'||art==='durchmesser'){
    if(!kreis)return hinweis('Diese Geometrie besitzt keinen konstanten Kreisradius. Bitte Kreis, Bogen, Zylinder oder Kugel wählen.');
    haupt=art==='radius'?row('Radius R','Kugelradius R'):row('Durchmesser Ø','Kugeldurchmesser Ø');
    typ=art;
    if(kreis.p0)r.gfx=art==='radius'?[[kreis.c,kreis.p0]]:[[kreis.p0,minus(mal(kreis.c,2),kreis.p0)]];
  }else if(art==='bogen'){
    haupt=row('Bogenlänge','Bogenlänge (angeklickt)');typ='bogen';
  }else if(art==='sehne'||art==='bogenhoehe'){
    haupt=row(art==='sehne'?'Sehnenlänge':'Bogenhöhe');typ='ausgerichtet';
    if(haupt)r.gfx=[r.linien[haupt[0]]];
  }else if(art==='laenge'){
    haupt=row('Kantenlänge');const e=resolve(sels[0]).e;
    if(e.line){r.gfx=[[e.line.p,minus(mal(e.mid,2),e.line.p)]];typ='ausgerichtet'}
  }
  else if(art==='flaeche')haupt=row('Flächeninhalt');
  else if(art==='umfang')haupt=row('Umfang (gesamt)','Kreisumfang');
  else if(art==='koerper')haupt=row('Volumen');
  else if(art==='abstand'){
    haupt=r.label?.[2]==='L'?r.label:row('Abstand min.','Abstand');
    typ='ausgerichtet';
    // Ein reiner Winkel-Fall (z.B. schneidende Ebenen) hat als Abstand den Randabstand.
    if(haupt&&r.label?.[2]!=='L'&&r.linien?.[haupt[0]])r.gfx=[r.linien[haupt[0]]];
  }else if(art==='winkel'){
    haupt=r.rows.find(z=>z[2]==='W'&&/^Winkel |^Achswinkel/.test(z[0]));typ='winkel';
    if(haupt)r.winkelMass=winkelGeometrie(r,sels,resolve,haupt[1]);
  }
  if(!haupt)return hinweis(messartInfo(art).hint+' Die gewählte Geometrie ist dafür nicht geeignet.');
  r.rows.forEach(z=>{if(z[3])z.length=3});haupt[3]='!';
  Object.assign(r,{label:haupt,wahl:haupt[0],bereit:true,messart:art,bemassungstyp:typ});
  return r;
}
