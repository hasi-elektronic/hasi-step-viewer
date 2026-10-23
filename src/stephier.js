// Schneller STEP-Parser nur für die Baugruppenstruktur (PRODUCT / PRODUCT_DEFINITION / NEXT_ASSEMBLY_USAGE_OCCURRENCE).
export function decodeStepString(s){
  return s.replace(/''/g,"'")
    .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g,(_,h)=>h.match(/.{4}/g).map(x=>String.fromCharCode(parseInt(x,16))).join(''))
    .replace(/\\X\\([0-9A-Fa-f]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)))
    .replace(/\\S\\(.)/g,(_,c)=>String.fromCharCode(c.charCodeAt(0)+128));
}
const firstStr=a=>{const m=/^\s*'((?:[^']|'')*)'/.exec(a);return m?decodeStepString(m[1]):''};
const refs=a=>{const r=[];a.replace(/'(?:[^']|'')*'/g,"").replace(/#(\d+)/g,(_,n)=>r.push(+n));return r};
/** Liefert {roots:[node]} mit node={name, product, children[]}; Kinder in Reihenfolge der NAUO-Entitäten. */
export function parseStepHierarchy(bytes){
  const text=typeof bytes==='string'?bytes:new TextDecoder('latin1').decode(bytes);
  const re=/#(\d+)\s*=\s*(PRODUCT_DEFINITION_FORMATION(?:_WITH_SPECIFIED_SOURCE)?|PRODUCT_DEFINITION(?:_WITH_ASSOCIATED_DOCUMENTS)?|PRODUCT|NEXT_ASSEMBLY_USAGE_OCCURRENCE)\s*\(((?:[^;']|'(?:[^']|'')*')*)\)\s*;/g;
  const prod=new Map(),pdf=new Map(),pd=new Map(),nauo=[];let m;
  while((m=re.exec(text))){const id=+m[1],t=m[2],a=m[3];
    if(t==='PRODUCT')prod.set(id,firstStr(a)||firstStr(a.replace(/^\s*'(?:[^']|'')*'\s*,/,'')));
    else if(t.startsWith('PRODUCT_DEFINITION_FORMATION')){const r=refs(a);pdf.set(id,r[r.length-1])}
    else if(t.startsWith('PRODUCT_DEFINITION')){pd.set(id,refs(a)[0])}
    else nauo.push([id,...refs(a).slice(0,2)]);}
  nauo.sort((x,y)=>x[0]-y[0]);
  const kids=new Map(),isChild=new Set();
  for(const [,p,c] of nauo){if(!kids.has(p))kids.set(p,[]);kids.get(p).push(c);isChild.add(c)}
  const nameOf=p=>prod.get(pdf.get(pd.get(p)))||'Teil';
  const build=(p,d)=>({name:nameOf(p),product:p,children:d>40?[]:(kids.get(p)||[]).map(c=>build(c,d+1))});
  const roots=[...pd.keys()].filter(p=>!isChild.has(p)&&kids.has(p)).map(p=>build(p,0));
  const leafRoots=[...pd.keys()].filter(p=>!isChild.has(p)&&!kids.has(p)).map(p=>build(p,0));
  return {roots:roots.length?roots:leafRoots,products:prod.size,nauo:nauo.length};
}
