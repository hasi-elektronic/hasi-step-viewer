// Informationsfelder verwenden ausschließlich bereits berechnete B-Rep-Ergebnisse.
export function pruefeInfoOptionen(raw) {const p=raw&&typeof raw==='object'?raw:{};return {bezug:typeof p.bezug==='boolean'?p.bezug:true,koordinaten:typeof p.koordinaten==='boolean'?p.koordinaten:false,flaechen:typeof p.flaechen==='boolean'?p.flaechen:true}}
export function informationsZeilen(rows,optionen,titel='') {
  const {bezug,koordinaten,flaechen}=pruefeInfoOptionen(optionen);
  const result=[];
  if(bezug&&titel)result.push(['Bezug',titel,'t']);
  for(const row of rows||[]) {
    const [name,value,unit]=row;
    if(!koordinaten&&(unit==='P'||/Koordinate|Schwerpunkt|Mittelpunkt/.test(name)))continue;
    if(!flaechen&&['A','V'].includes(unit))continue;
    if(['L','W','A','V','M'].includes(unit)&&typeof value==='number'&&Number.isFinite(value))result.push(row);
    else if(unit==='P'&&Array.isArray(value)&&value.length===3&&value.every(Number.isFinite))result.push(row);
    else if(unit==='t'&&['Fläche','Kante','Hinweis','Lage','Bezug'].includes(name)&&String(value).trim())result.push(row);
  }
  return result;
}
