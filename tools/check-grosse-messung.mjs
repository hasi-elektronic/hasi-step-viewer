// Optionale lokale Kontrolle einer großen Baugruppe. Keine Kundendatei wird kopiert.
import assert from 'node:assert/strict';
export async function checkGrosseMessung(page,step){
  await page.evaluate(p=>window.__oeffnePfad(p),step);
  const result=await page.evaluate(async()=>{
    const a=window.__app,d=a.data();if(document.getElementById('messenPanel').hidden)document.getElementById('btnMessen').click();
    let chosen=null;for(let inst=0;inst<d.inst.length;inst++){const u=d.uniq[d.inst[inst].u],id=u.edges.findIndex(e=>e.r>0&&e.pts.length>2&&Math.hypot(...e.pts[0].map((x,i)=>x-e.pts.at(-1)[i]))>1e-6*e.r);if(id>=0){chosen={inst,u,id};break}}
    if(!chosen)throw new Error('Keine offene Kreiskante in der großen Baugruppe.');
    const {inst,id,u}=chosen,e=u.edges[id];let angle=0;
    for(let i=1;i<e.pts.length;i++){const p=e.pts[i-1].map((x,j)=>x-e.c[j]),q=e.pts[i].map((x,j)=>x-e.c[j]),dot=p.reduce((s,x,j)=>s+x*q[j],0),cross=[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]];angle+=Math.atan2(Math.hypot(...cross),dot)}
    a.clearSel();await a.messartSetzen('radius');await a.select({k:'edge',id,inst});const radius=window.__lastMeasure;
    a.clearSel();await a.messartSetzen('bogen');await a.select({k:'edge',id,inst});const arc=window.__lastMeasure;
    return {kernel:window.__lastLoad.kern,bodies:d.inst.length,loadMs:window.__lastLoad.totalMs,inst,edge:id,nativeRadius:e.r,radiusMm:radius.label[1],nativeArcMm:e.r*angle,arcMm:arc.label[1],sweep:arc.messkreis.winkel,ui:a.ergebnis(),selected:a.sels().map(s=>({k:s.k,id:s.id,inst:s.inst}))};
  });
  assert.equal(result.kernel,'nativ');assert(result.bodies>=500);assert(Math.abs(result.radiusMm-result.nativeRadius)<1e-5);assert(Math.abs(result.arcMm-result.nativeArcMm)<1e-4);
  assert.equal(result.selected[0].inst,result.inst);assert.equal(result.selected[0].id,result.edge);
  return result;
}
