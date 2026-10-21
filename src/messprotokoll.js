// Messprotokoll als PDF (jsPDF + jspdf-autotable, MIT) und XLSX (write-excel-file, MIT).
// Inhalt: Kopfdaten, Modellwerte (Volumen, Masse, Schwerpunkt), Hüllquader (achsparallel, Bezug, minimal), Rohmaß,
// alle Bemaßungen mit Toleranz und die aktuelle Messung. Zahlen bleiben Zahlen (XLSX), im PDF deutsch formatiert.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import writeExcelFile from 'write-excel-file/universal';

const zahl = (v, d) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const zelle = (v, d) => (typeof v === 'number' ? (Number.isFinite(v) ? zahl(v, d) : '–') : v == null || v === '' ? '–' : String(v));
const quaderZeile = (name, q) => q && [name, q.sortiert[0], q.sortiert[1], q.sortiert[2], q.volumen / 1000];

/** Protokolldaten zusammenstellen (für PDF, XLSX und Tests). */
export function protokollDaten({ meta = {}, modell = null, huelle = null, bemassungen = [], messung = [] } = {}) {
  const kopf = [
    ['Datei', meta.datei || '–'],
    ['Datum', meta.datum || new Date().toLocaleString('de-DE')],
    ['Programm', meta.produkt || 'Hasi 3D'],
    ['Einheit', 'mm (Winkel in °)'],
  ];
  if (meta.werkstoff) kopf.push(['Werkstoff', meta.werkstoff]);
  if (meta.pruefer) kopf.push(['Prüfer', meta.pruefer]);
  const abschnitte = [];
  if (modell) {
    const z = [['Volumen', modell.volume, 'mm³'], ['Oberfläche', modell.area, 'mm²']];
    if (modell.masse != null) z.push(['Masse', modell.masse, 'g']);
    if (modell.centroid) ['X', 'Y', 'Z'].forEach((a, i) => z.push([`Schwerpunkt ${a}`, modell.centroid[i], 'mm']));
    abschnitte.push({ titel: 'Modell', spalten: ['Größe', 'Wert', 'Einheit'], zahlen: [1], zeilen: z });
  }
  if (huelle) {
    const z = [quaderZeile('achsparallel (Modellachsen)', huelle.achsparallel), quaderZeile(`gedreht: ${huelle.bezug?.name || 'Bezug'}`, huelle.bezug), quaderZeile('minimal (kleinstes Volumen)', huelle.minimal)].filter(Boolean);
    abschnitte.push({ titel: 'Hüllquader', spalten: ['Art', 'L [mm]', 'B [mm]', 'H [mm]', 'Volumen [cm³]'], zahlen: [1, 2, 3, 4], zeilen: z });
    const r = huelle.rohmass;
    if (r) {
      const z2 = [['Block L × B × H', `${zahl(r.block.masse[0], meta.stellen ?? 3)} × ${zahl(r.block.masse[1], meta.stellen ?? 3)} × ${zahl(r.block.masse[2], meta.stellen ?? 3)}`, r.block.volumen / 1000]];
      if (r.zylinder) z2.push(['Zylinder Ø × L', `Ø ${zahl(r.zylinder.d, meta.stellen ?? 3)} × ${zahl(r.zylinder.l, meta.stellen ?? 3)}`, r.zylinder.volumen / 1000]);
      z2.push(['Empfehlung (kleineres Volumen)', r.empfehlung, '']);
      abschnitte.push({ titel: 'Rohmaß', spalten: ['Form', 'Maße [mm]', 'Volumen [cm³]'], zahlen: [2], zeilen: z2 });
    }
  }
  if (bemassungen.length) abschnitte.push({ titel: 'Bemaßungen', spalten: ['Nr.', 'Art', 'Wert', 'Einheit', 'Toleranz', 'Elemente'], zahlen: [2], zeilen: bemassungen.map(b => [b.nr, b.art, b.wert, b.einheit || '', b.toleranz || '–', b.elemente || '']) });
  if (messung.length) abschnitte.push({ titel: 'Aktuelle Messung', spalten: ['Größe', 'Wert', 'Einheit'], zahlen: [1], zeilen: messung });
  const hinweis = 'Werte aus der B-Rep-Geometrie der STEP-Datei. Hüllquader und Rohmaß über die Netzknoten: ebene Teile exakt, gekrümmte Flächen bis auf die Netzfeinheit.';
  return { titel: 'Messprotokoll', kopf, abschnitte, hinweis };
}

/** PDF (A4 hoch). */
export function protokollPdf(D, meta = {}) {
  const st = meta.stellen ?? 3;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const produkt = meta.produkt || 'Hasi 3D', farbe = meta.kopfFarbe || [51, 175, 226];
  doc.setProperties({ title: D.titel, creator: produkt });
  let y = 16;
  if (meta.logo) { doc.addImage(meta.logo, 'PNG', 14, 6, 16, 16); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(D.titel, 34, 14); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text(produkt, 34, 19); y = 28 }
  else { doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(D.titel, 14, y); y += 8 }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  D.kopf.forEach(([a, b], i) => { const x = 14 + (i % 2) * 95, yy = y + Math.floor(i / 2) * 5.5; doc.setTextColor(110); doc.text(a + ':', x, yy); doc.setTextColor(20); doc.text(String(b), x + 24, yy) });
  y += Math.ceil(D.kopf.length / 2) * 5.5 + 4;
  for (const A of D.abschnitte) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20); doc.text(A.titel, 14, y); doc.setFont('helvetica', 'normal');
    autoTable(doc, { startY: y + 2, head: [A.spalten], body: A.zeilen.map(z => z.map(v => zelle(v, st))), theme: 'grid', styles: { fontSize: 9, cellPadding: 1.4 }, headStyles: { fillColor: farbe },
      columnStyles: Object.fromEntries((A.zahlen || []).map(i => [i, { halign: 'right' }])) });
    y = doc.lastAutoTable.finalY + 8; if (y > 265) { doc.addPage(); y = 18 }
  }
  doc.setFontSize(8); doc.setTextColor(110);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.text(doc.splitTextToSize(D.hinweis, 150), 14, 287); doc.text(`Seite ${i} von ${n} · ${produkt}`, 196, 287, { align: 'right' }) }
  return new Uint8Array(doc.output('arraybuffer'));
}

/** XLSX: ein Blatt, Abschnitte untereinander, Zahlen als Zahlen. */
export async function protokollXlsx(D) {
  const B = v => ({ value: v, fontWeight: 'bold' });
  const Z = v => (typeof v === 'number' ? (Number.isFinite(v) ? { value: v, type: Number, format: '0.000' } : { value: '–' }) : { value: v == null ? '' : String(v) });
  const rows = [[{ value: D.titel, fontWeight: 'bold', fontSize: 14 }], ...D.kopf.map(([a, b]) => [{ value: a }, B(String(b))]), []];
  for (const A of D.abschnitte) { rows.push([{ value: A.titel, fontWeight: 'bold', fontSize: 12 }]); rows.push(A.spalten.map(B)); A.zeilen.forEach(z => rows.push(z.map(Z))); rows.push([]) }
  rows.push([{ value: D.hinweis }]);
  const blob = await writeExcelFile(rows, { columns: [{ width: 34 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 30 }], sheet: 'Messprotokoll' }).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
