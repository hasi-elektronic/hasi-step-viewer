// K-Faktor und Biegetabellen.
// Quelle der Formel: DIN 6935:2011-10 „Kaltbiegen von Flacherzeugnissen aus Stahl“, Abschnitt 4 (Ausgleichswert v)
// mit dem Korrekturfaktor k = 0,65 + 0,5 · lg(ri / s) für ri/s < 5 und k = 1 für ri/s ≥ 5.
// Die neutrale Faser liegt bei ri + k · s/2. Der hier verwendete K-Faktor (Anteil der Dicke) ist daher K = k/2.
// Ausgleichswert (Biegeverkürzung) für den Biegewinkel φ (= 180° − Öffnungswinkel β):
//   v = φ · (ri + k·s/2) − 2 · (ri + s) · tan(φ/2)     (0° < φ ≤ 90°: tan(φ/2) ≤ 1; DIN rechnet bis β ≥ 0°)
export function dinKFaktor(ri,s){
  const q=ri/s;let k=q>=5?1:0.65+0.5*Math.log10(q);
  const hinweis=q<0.65?'ri/s < 0,65: außerhalb des üblichen Gültigkeitsbereichs der DIN-Formel':null;
  k=Math.min(1,Math.max(0,k));return {K:k/2,k,hinweis};
}
const num=x=>{if(x==null)return NaN;const t=String(x).trim().replace(/\s/g,'');if(!t)return NaN;return parseFloat(t.replace(',','.'))};
/** CSV mit Kopfzeile, Spalten (beliebige Reihenfolge): s|Dicke, ri|Radius, Winkel (optional), Werkstoff|Material (optional),
 *  v (Ausgleichswert nach DIN 6935, negativ), BD|Biegeverkürzung (positiv: Zuschnitt = a + b − BD, a/b = Außenmaße bis zum
 *  Schnittpunkt der Außenflächen) und/oder K. Trenner ; oder , oder Tab. BD ist für Biegungen bis 180° gleich −v. */
export function parseBiegetabelle(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#'));
  if(lines.length<2)throw new Error('Biegetabelle: zu wenige Zeilen (Kopfzeile + mindestens eine Datenzeile nötig).');
  const sep=lines[0].includes(';')?';':lines[0].includes('\t')?'\t':',';
  const head=lines[0].split(sep).map(h=>h.trim().toLowerCase().replace(/[\s"()]|mm|°/g,''));
  const col=(...names)=>head.findIndex(h=>names.includes(h));
  const cs=col('s','dicke','blechdicke','t'),cr=col('ri','r','radius','innenradius'),cw=col('winkel','w','biegewinkel','phi'),cv=col('v','ausgleichswert'),ck=col('k','kfaktor','k-faktor');
  const cb=col('bd','biegeabzug','biegeverkürzung','biegeverkuerzung','verkürzung','verkuerzung','biegeverkürzungbd','biegeverkuerzungbd'),cm=col('werkstoff','material','mat');
  if(cs<0||cr<0)throw new Error('Biegetabelle: Spalten „s“ und „ri“ fehlen.');
  if(cv<0&&ck<0&&cb<0)throw new Error('Biegetabelle: Spalte „v“, „BD“ oder „K“ fehlt.');
  const rows=lines.slice(1).map((l,i)=>{const c=l.split(sep);const r={s:num(c[cs]),ri:num(c[cr]),w:cw>=0?num(c[cw]):NaN,v:cv>=0?num(c[cv]):NaN,K:ck>=0?num(c[ck]):NaN};
    if(cm>=0){const m=String(c[cm]??'').trim().replace(/^"|"$/g,'');if(m)r.werkstoff=m}
    // BD (Biegeverkürzung) ist eine positive Verkürzung; ein negativer Eintrag ist offensichtlich als v gemeint
    if(cb>=0){const bd=num(c[cb]);if(!isNaN(bd)){r.bd=Math.abs(bd);if(isNaN(r.v))r.v=-Math.abs(bd);r.spalte='BD'}}
    if(!r.spalte)r.spalte=!isNaN(r.v)?'v':'K';
    if(!(r.s>0)||!(r.ri>=0)||(isNaN(r.v)&&isNaN(r.K)))throw new Error(`Biegetabelle: Zeile ${i+2} ist ungültig.`);return r});
  return rows;
}
// Werkstoffnamen vergleichen: „Stahl (7,85 g/cm³)“ passt zu „Stahl“, „Edelstahl“ nicht zu „Stahl“
const wsName=w=>String(w||'').toLowerCase().replace(/\(.*$/,'').replace(/[^a-zäöüß0-9]+/g,' ').trim();
export function werkstoffPasst(zeile,gewaehlt){const a=wsName(zeile),b=wsName(gewaehlt);if(!a)return true;if(!b)return false;return b===a||b.startsWith(a+' ')||a.startsWith(b+' ')}
/** Werkstoffe einer Tabelle (für die Anzeige). */
export function tabellenWerkstoffe(rows){return [...new Set((rows||[]).map(r=>r.werkstoff).filter(Boolean))]}
/** Passenden Tabelleneintrag suchen (s ±1 %, ri ±2 %, Winkel ±1° bzw. Zeilen ohne Winkel gelten für alle).
 *  Mit Werkstoffspalte gelten nur Zeilen des gewählten Werkstoffs (und Zeilen ohne Werkstoff); Zeilen mit Werkstoff haben Vorrang. */
export function sucheTabelle(rows,s,ri,wDeg,werkstoff){
  if(!rows||!rows.length)return null;
  const ok=rows.filter(r=>Math.abs(r.s-s)<=Math.max(0.01,0.01*s)&&Math.abs(r.ri-ri)<=Math.max(0.01,0.02*ri)&&werkstoffPasst(r.werkstoff,werkstoff));
  const prio=r=>r.werkstoff?0:1;
  const mitW=ok.filter(r=>!isNaN(r.w)&&Math.abs(r.w-wDeg)<=1).sort((a,b)=>prio(a)-prio(b)||Math.abs(a.w-wDeg)-Math.abs(b.w-wDeg));
  return mitW[0]||ok.filter(r=>isNaN(r.w)).sort((a,b)=>prio(a)-prio(b))[0]||null;
}
/** Biegezugabe BZ, Ausgleichswert v und K für eine Biegung. opts: {modus:'din'|'manuell', K, tabelle} */
// Umschlag (φ = 180°) und φ > 180°: tan(φ/2) ist unendlich bzw. negativ. Für 180° gilt der DIN-Fall β = 0°: v = BZ − 2·(ri + s)
// (Schenkel bis Außenkante Umschlag gemessen). Über 180° gibt es keinen Ausgleichswert v; die Biegezugabe BZ bleibt gültig.
const UMSCHLAG_TOL=1e-4;
export function biegeArt(phi){return phi<Math.PI-UMSCHLAG_TOL?'normal':phi<=Math.PI+UMSCHLAG_TOL?'umschlag':'ueber180'}
export function biegung(ri,s,phi,opts){
  const r=biegungRoh(ri,s,phi,opts);const art=biegeArt(phi);
  if(art==='umschlag'){r.v=r.ba-2*(ri+s);r.vBezug='Außenkante Umschlag'}
  if(art==='ueber180'){r.v=null;r.hinweis='Biegewinkel über 180°: kein Ausgleichswert v (nur Biegezugabe BZ).'}
  r.bd=r.v==null?null:-r.v;r.art=art;return r}
function biegungRoh(ri,s,phi,opts){
  const art=biegeArt(phi);const ossb=art==='normal'?Math.tan(phi/2)*(ri+s):(ri+s);
  const tab=sucheTabelle(opts.tabelle,s,ri,phi*180/Math.PI,opts.werkstoff);
  const tq=tab?{spalte:tab.spalte,werkstoff:tab.werkstoff||null}:null;
  if(tab&&!isNaN(tab.v)){const ba=tab.v+2*ossb;return {ba,v:tab.v,bd:-tab.v,K:(ba/phi-ri)/s,quelle:'Tabelle',tabelle:tq}}
  if(tab&&!isNaN(tab.K)){const ba=phi*(ri+tab.K*s);return {ba,v:ba-2*ossb,bd:2*ossb-ba,K:tab.K,quelle:'Tabelle',tabelle:tq}}
  let K,quelle,hinweis=null;
  if(opts.modus==='trumpf'){const t=trumpfWert(opts.tabelle,s,ri,phi*180/Math.PI);
    if(t){const ba=2*ossb-t.bd;return {ba,v:-t.bd,bd:t.bd,K:(ba/phi-ri)/s,quelle:'Trumpf',tabelle:{spalte:'BD',werkstoff:null,trumpf:t.art,herkunft:t.herkunft},hinweis:t.hinweis||null}}
    const d=dinKFaktor(ri,s);const ba=phi*(ri+d.K*s);
    return {ba,v:ba-2*ossb,bd:2*ossb-ba,K:d.K,quelle:'DIN 6935',hinweis:`Trumpf-kompatibel: kein Trumpf-Wert für s ${de(s)} / Ri ${de(ri)} – DIN 6935 verwendet. Trumpf-GEO dieses Blechs laden, um die Werte zu übernehmen.`}}
  if(opts.modus==='din'){const d=dinKFaktor(ri,s);K=d.K;quelle='DIN 6935';hinweis=d.hinweis}else{K=opts.K;quelle='manuell'}
  const ba=phi*(ri+K*s);return {ba,v:ba-2*ossb,bd:2*ossb-ba,K,quelle,hinweis};
}

// ---------- Trumpf-kompatibel ----------
// Biegeverkürzung BD je Blechdicke s, Konstruktionsradius Ri und Biegewinkel φ, wie TruTops Boost sie für die Abwicklung verwendet
// (DESIGN_BEND_DEDUCTION aus der GEO-Datei). BD bezieht sich auf die Außenmaße bis zum Schnittpunkt der Außenflächen:
// Zuschnitt = a + b − BD, also Biegezugabe BZ = 2·(Ri + s)·tan(φ/2) − BD. Eingebaute Werte: Sickinger, TruBend 5230,
// Oberwerkzeug OW210/S R1/28 H240, Gesenk EV W40/80 R5, Stahl 6 mm (aus einer Trumpf-GEO, 22.10.2026).
// Weitere Werte: „Trumpf-GEO laden“ übernimmt BD je Biegung aus jeder GEO-Datei (Spalte BD in der Biegetabelle).
// Zwischen zwei Winkeln derselben Dicke/Radius wird der gleichwertige K-Faktor linear interpoliert, außerhalb gilt der K des nächsten Winkels.
export const TRUMPF_TABELLE=[
  {s:6,ri:6,w:90,bd:11.1996,herkunft:'TruBend 5230 · EV W40/80 R5'},
  {s:6,ri:6,w:82.46002,bd:9.70327,herkunft:'TruBend 5230 · EV W40/80 R5'}];
const de=v=>(+(+v).toFixed(3)).toLocaleString('de-DE');
const bzAusBd=(ri,s,phi,bd)=>2*Math.tan(phi/2)*(ri+s)-bd;
export function trumpfWert(eigene,s,ri,wDeg){
  const passt=r=>Math.abs(r.s-s)<=Math.max(0.01,0.01*s)&&Math.abs(r.ri-ri)<=Math.max(0.01,0.02*ri)&&r.bd>0&&r.w>0;
  const zeilen=[...(eigene||[]).filter(r=>passt(r)&&!isNaN(r.bd)&&!isNaN(r.w)).map(r=>({...r,herkunft:r.herkunft||r.quelle||'eigene Tabelle'})),...TRUMPF_TABELLE.filter(passt)];
  if(!zeilen.length)return null;
  const gleich=zeilen.find(r=>Math.abs(r.w-wDeg)<=0.05);if(gleich)return {bd:gleich.bd,art:'Tabelle',herkunft:gleich.herkunft};
  // gleichwertiger K je Winkel, dann interpolieren
  const phi=wDeg*Math.PI/180;const K=r=>{const p=r.w*Math.PI/180;return (bzAusBd(r.ri,r.s,p,r.bd)/p-r.ri)/r.s};
  const pk=[...new Map(zeilen.map(r=>[r.w.toFixed(3),r])).values()].sort((a,b)=>a.w-b.w);
  let k,hinweis=null;const lo=pk.filter(r=>r.w<wDeg).at(-1),hi=pk.find(r=>r.w>wDeg);
  if(lo&&hi){const u=(wDeg-lo.w)/(hi.w-lo.w);k=K(lo)+u*(K(hi)-K(lo))}
  else{const n=lo||hi;k=K(n);hinweis=`Trumpf-kompatibel: Winkel ${de(wDeg)}° außerhalb der Trumpf-Werte (${pk.map(r=>de(r.w)+'°').join(', ')}) – K des nächsten Winkels.`}
  const ba=phi*(ri+k*s);return {bd:bzAusBd(ri,s,phi,0)-ba,art:'interpoliert',herkunft:(lo||hi).herkunft,hinweis}}
