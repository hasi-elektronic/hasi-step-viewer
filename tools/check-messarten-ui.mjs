import assert from 'node:assert/strict';

/** Gemeinsame Funktionsprüfung: Browser und echtes WebView2 verwenden dieselben Sollwerte. */
export async function checkMessartenUi(page) {
  await page.evaluate(()=>{if(document.getElementById('messenPanel').hidden)document.getElementById('btnMessen').click();window.__app.clearSel()});
  const ids=await page.evaluate(()=>{
    const u=window.__app.data().uniq[0],eq=(p,q)=>p.every((v,i)=>Math.abs(v-q[i])<1e-5);
    const arc=u.edges.findIndex(e=>e.r&&Math.abs(e.r-5)<1e-5&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-5*Math.SQRT2)<1e-5);
    const lines=[95,100].map(l=>u.edges.findIndex(e=>e.type==='Gerade'&&Math.abs(Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))-l)<1e-5));
    const vertices=[[100,0,0],[100,60,0],[0,60,0]].map(p=>u.verts.findIndex(v=>eq(v,p)));
    const face=u.faces.findIndex(f=>f.type==='eben');
    const normals=new Map();for(let t=0;t<u.f.length;t++){if(normals.has(u.f[t]))continue;const p=[0,1,2].map(j=>Array.from(u.p.slice(u.i[3*t+j]*3,u.i[3*t+j]*3+3))),a=p[1].map((x,j)=>x-p[0][j]),b=p[2].map((x,j)=>x-p[0][j]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],l=Math.hypot(...n);if(l>1e-9)normals.set(u.f[t],n.map(x=>x/l))}
    const top=[...normals].find(([,n])=>n[2]>0.999)?.[0],slope=[...normals].find(([,n])=>Math.abs(n[2]-Math.cos(Math.PI/6))<1e-5)?.[0];
    const cylinder=u.faces.findIndex(f=>f.type==='zylindrisch'&&f.ax&&Math.abs(f.ax.r-5)<1e-6);
    return {arc,lines,vertices,face,top,slope,cylinder};
  });
  assert(ids.arc>=0&&ids.lines.every(i=>i>=0)&&ids.vertices.every(i=>i>=0),'Referenzgeometrie fehlt');
  const mode=async art=>{await page.selectOption('#messart',art);await page.waitForFunction(()=>document.getElementById('ergebnis').getAttribute('aria-busy')!=='true')};
  const select=(k,id)=>page.evaluate(async({k,id})=>window.__app.select({k,id,inst:0}),{k,id});
  const clickSelect=async(k,id)=>{
    let xy=null;
    for(const view of ['iso','unten','oben','vorne','hinten','rechts','links']){
      await page.evaluate(view=>window.__app.ansicht(view),view);await page.waitForFunction(()=>window.__app.animFertig());
      xy=await page.evaluate(({k,id})=>{const a=window.__app,u=a.data().uniq[0],e=u.edges[id],punkte=k==='vertex'?[u.verts[id]]:e.pts.length>2?e.pts.slice(1,-1):[0.2,0.35,0.5,0.65,0.8].map(t=>e.pts[0].map((x,i)=>x+(e.pts[1][i]-x)*t));
        for(const p of punkte){const xy=a.screenOf(p),s=a.pickAt(...xy);if(s?.k===k&&s.id===id&&s.inst===0&&document.elementFromPoint(...xy)?.id==='buehne')return xy}return null;},{k,id});
      if(xy)break;
    }
    assert(xy,`Kein sichtbarer Fangpunkt für ${k} ${id}`);await page.mouse.click(...xy);
    await page.waitForFunction(()=>document.getElementById('ergebnis').getAttribute('aria-busy')!=='true');
  };
  const clear=()=>page.evaluate(()=>window.__app.clearSel());
  const result=()=>page.evaluate(()=>({r:window.__lastMeasure,ui:window.__app.ergebnis(),sels:window.__app.sels(),opts:window.__app.messOpts()}));
  const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
  await mode('radius');await clickSelect('edge',ids.arc);let q=await result();near(q.r.label[1],5);assert(q.ui.startsWith('Radius R: 5,000 mm'),q.ui);
  await mode('durchmesser');q=await result();near(q.r.label[1],10);assert.equal(q.sels.length,1,'Messartwechsel behält passende Auswahl');
  await mode('bogen');q=await result();near(q.r.label[1],5*Math.PI/2);assert(q.ui.startsWith('Bogenlänge:'),q.ui);
  await page.locator('#messenErweitert').evaluate(el=>el.open=true);
  await page.selectOption('#dimtyp','auto');await page.locator('#keepDim').click();
  const d=await page.evaluate(()=>window.__app.dims().at(-1));assert.equal(d.typ,'bogen');near(d.a1-d.a0,Math.PI/2);near(d.wert,5*Math.PI/2);
  await mode('sehne');q=await result();near(q.r.label[1],5*Math.SQRT2);
  await page.locator('#keepDim').click();let linear=await page.evaluate(()=>window.__app.dims().at(-1));assert.equal(linear.typ,'ausgerichtet');assert.equal(linear.art,'Sehnenlänge');near(linear.wert,5*Math.SQRT2);near(Math.hypot(...linear.p1.map((x,i)=>x-linear.p2[i])),linear.wert);
  await mode('bogenhoehe');q=await result();near(q.r.label[1],5*(1-Math.SQRT1_2));
  await page.locator('#keepDim').click();linear=await page.evaluate(()=>window.__app.dims().at(-1));assert.equal(linear.typ,'ausgerichtet');assert.equal(linear.art,'Bogenhöhe');near(linear.wert,5*(1-Math.SQRT1_2));
  await page.selectOption('#prec','2');q=await result();assert(q.ui.startsWith('Bogenhöhe: 1,46 mm'),q.ui);
  await page.locator('#copySel').click();assert((await page.evaluate(()=>window.__lastCopy)).includes('Bogenhöhe: 1,46 mm'));
  await page.selectOption('#prec','3');await clear();await mode('bogen');await select('edge',ids.lines[0]);q=await result();assert.equal(q.r.bereit,false);assert.equal(await page.locator('#keepDim').isDisabled(),true);assert(!/NaN|CompileError/.test(q.ui));
  await clear();await mode('winkel3');for(const id of ids.vertices)await clickSelect('vertex',id);q=await result();assert.equal(q.sels.length,3);near(q.r.label[1],90);assert(q.ui.startsWith('Winkel (3 Punkte): 90,000 °'),q.ui);
  await page.locator('#keepDim').click();assert.equal((await page.evaluate(()=>window.__app.dims().at(-1))).typ,'winkel');
  await clear();await mode('kreis3');for(const id of ids.vertices)await select('vertex',id);q=await result();near(q.r.label[1],Math.hypot(100,60)/2);assert(q.ui.startsWith('Radius R:'),q.ui);
  await clear();await mode('summe');for(const id of ids.lines)await clickSelect('edge',id);q=await result();near(q.r.label[1],195);assert.equal(q.sels.length,2);
  await select('edge',ids.lines[0]);q=await result();near(q.r.label[1],100);assert.equal(q.sels.length,1,'Erneuter Klick entfernt eine Kante');
  await clear();await mode('flaeche');await select('face',ids.face);q=await result();assert(q.r.label[1]>0);assert(q.ui.startsWith('Flächeninhalt:'),'Explizite Fläche darf nicht durch flaecheZeigen versteckt werden');assert((await page.locator('#mresult').innerText()).includes('mm²'));
  await clear();await mode('winkel');assert(ids.top!=null&&ids.slope!=null);await select('face',ids.top);await select('face',ids.slope);q=await result();near(q.r.label[1],30);
  await page.locator('#keepDim').click();const faceDim=await page.evaluate(()=>window.__app.dims().at(-1));assert.equal(faceDim.typ,'winkel');near(faceDim.wert,30);
  await clear();await mode('bogen');await select('face',ids.cylinder);q=await result();assert.equal(q.r.bereit,true);await page.locator('#keepDim').click();const cylDim=await page.evaluate(()=>window.__app.dims().at(-1));assert.equal(cylDim.typ,'bogen');near(cylDim.wert,q.r.label[1]);near(cylDim.a1-cylDim.a0,q.r.messkreis.winkel);
  // Explizite Messarten überschreiben Fangfilter vorübergehend, ohne gespeicherte Einstellungen zu ändern.
  await page.locator('#dimClear').click();
  await clear();await page.evaluate(()=>window.__app.nurFlaechen(true));await mode('radius');
  await clickSelect('edge',ids.arc);
  const pick=await page.evaluate(()=>({hit:window.__app.sels()[0],onlyFaces:document.getElementById('nurFlaechen').checked}));
  assert(pick.hit,'Radius muss Kreiskante statt Kreismittelpunkt fangen');assert.equal(pick.onlyFaces,true);
  await page.evaluate(()=>window.__app.nurFlaechen(false));await clear();await mode('auto');
  await page.locator('#messenErweitert').evaluate(el=>el.open=false);
  return {radiusMm:5,arcLengthMm:5*Math.PI/2,chordMm:5*Math.SQRT2,sagittaMm:5*(1-Math.SQRT1_2),angleDeg:90,sumMm:195};
}
