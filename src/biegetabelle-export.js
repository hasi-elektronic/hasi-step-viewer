// Export der Biegetabelle als PDF (jsPDF + jspdf-autotable, MIT) und XLSX (write-excel-file, MIT). Alle Maße in mm.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import writeExcelFile from 'write-excel-file/universal';
import { biegeNotizen } from './biegenotiz.js';

// Fehlende Werte (z. B. Biegepunkt beim 180°-Umschlag, v über 180°) als „–“, nie als 0 oder NaN
const de = (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? '–' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));

/** Lage einer Biegelinie im Zuschnitt (Ursprung: linke untere Ecke, wie im DXF). */
export function biegelinie(b, flat) {
  const p = b.map(q => [q[0] - flat.min[0], q[1] - flat.min[1]]);
  const [a, c] = p, eps = 1e-6 * Math.max(...flat.size);
  if (Math.abs(a[0] - c[0]) < eps) return { text: `senkrecht, x = ${de(a[0])} mm von links`, x1: a[0], y1: a[1], x2: c[0], y2: c[1] };
  if (Math.abs(a[1] - c[1]) < eps) return { text: `waagerecht, y = ${de(a[1])} mm von unten`, x1: a[0], y1: a[1], x2: c[0], y2: c[1] };
  return { text: `von (${de(a[0])} | ${de(a[1])}) bis (${de(c[0])} | ${de(c[1])})`, x1: a[0], y1: a[1], x2: c[0], y2: c[1] };
}

// Quelle je Biegung: Tabelle (Spalte v/BD/K, Werkstoff), DIN 6935, manuell; angenommener Radius deutlich markiert
export function quelleText(b) {
  let q = b.quelle || '–';
  if (b.quelle === 'Tabelle' && b.tabelle) q = `Tabelle (${b.tabelle.spalte}${b.tabelle.werkstoff ? ', ' + b.tabelle.werkstoff : ''})`;
  if (b.angenommen) q += ', Ri angenommen – nicht aus der Datei';
  return q;
}

/** Tabelleninhalt (für PDF, XLSX und Tests). */
export function tabelle(sheet, meta = {}) {
  const f = sheet.flat;
  const kopf = [
    ['Teil', meta.teil || '–'],
    ['Datum', meta.datum || new Date().toLocaleDateString('de-DE')],
    ['Blechdicke', `${de(sheet.t)} mm`],
    ['Werkstoff', meta.werkstoff || '–'],
    ['K-Faktor', meta.kfaktor || (sheet.modus === 'manuell' ? de(sheet.K, 2) : 'nach DIN 6935 (je Biegung)')],
    ['Zuschnitt', f ? `${de(Math.max(...f.size))} × ${de(Math.min(...f.size))} mm` : '–'],
    ['Biegungen', String(sheet.biegungen?.length ?? sheet.bends.length)],
  ];
  if (sheet.biegungen && sheet.biegungen.length !== sheet.bends.length) kopf.push(['Biegezonen', `${sheet.bends.length} (gleiche Nr. = eine Biegelinie, ein Hub)`]);
  if (meta.masse) kopf.push(['Masse', meta.masse]);
  const spalten = ['Nr.', 'Winkel [°]', 'Ri [mm]', 'Richtung', 'Biegelinie (Lage im Zuschnitt)', 'Biegelänge [mm]', 'BZ [mm]', 'v [mm]', 'BD [mm]', 'K', 'Quelle'];
  const zeilen = sheet.bends.map((b, i) => {
    const bl = f?.bendLines?.[i] ? biegelinie(f.bendLines[i], f) : null;
    return { nr: b.gruppe ?? b.nr, zone: b.nr, winkel: b.ang, ri: b.ri, richtung: b.dir, lage: bl?.text || '–', lageXY: bl, laenge: b.len, bz: b.ba, v: b.v, bd: b.bd ?? (b.v == null ? null : -b.v), k: b.K, quelle: quelleText(b), schenkel: b.schenkel || [] };
  });
  const hinweis = 'Nr. = Biegung in der Reihenfolge der Abwicklung (keine Biegefolgeplanung); Biegezonen auf derselben Biegelinie mit gleichem Winkel, Richtung und Ri tragen dieselbe Nr. Ursprung der Lageangaben: linke untere Ecke des Zuschnitts, wie im DXF. Werte vor der Fertigung prüfen.';
  return { kopf, spalten, zeilen, hinweis, zuschnitt: f ? { laenge: Math.max(...f.size), breite: Math.min(...f.size) } : null };
}

/** PDF (A4 quer) mit Kopfdaten, Tabelle, Schenkeln und Vorschau der Abwicklung. */
export function pdf(sheet, meta = {}) {
  const T = tabelle(sheet, meta);
  const produkt = meta.produkt || 'Hasi 3D';
  const kopfFarbe = meta.kopfFarbe || [51, 175, 226];
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'Biegetabelle ' + (meta.teil || ''), creator: produkt });
  let kopfY = 24, tabellenY = 38;
  if (meta.logo) {
    const primaer = meta.primaer || [0, 75, 133];
    doc.addImage(meta.logo, 'PNG', 14, 6, 18, 18);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...primaer); doc.text('Biegetabelle', 36, 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110); doc.text(produkt, 36, 18);
    if (meta.vermerk) { doc.setFontSize(8); doc.text(meta.vermerk, 36, 22.5); }
    kopfY = 34; tabellenY = 48;
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Biegetabelle', 14, 16);
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  T.kopf.forEach(([a, b], i) => { const x = 14 + (i % 4) * 68, y = kopfY + Math.floor(i / 4) * 6; doc.setTextColor(110); doc.text(a + ':', x, y); doc.setTextColor(20); doc.text(b, x + 22, y); });
  autoTable(doc, {
    startY: tabellenY, head: [T.spalten], theme: 'grid', styles: { fontSize: 9, cellPadding: 1.6 }, headStyles: { fillColor: kopfFarbe },
    body: T.zeilen.map(z => [z.nr, de(z.winkel, 1), de(z.ri), z.richtung, z.lage, de(z.laenge), de(z.bz), de(z.v), de(z.bd), de(z.k, 3), z.quelle]),
    columnStyles: { 0: { halign: 'right' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' } },
  });
  const sch = T.zeilen.flatMap(z => z.schenkel.map((l, i) => [z.nr, i + 1, de(l.aussen), de(l.innen), de(l.geradeAussen), de(l.geradeInnen)]));
  let y = doc.lastAutoTable.finalY + 6;
  if (sch.length) {
    autoTable(doc, { startY: y, head: [['Nr.', 'Schenkel', 'bis Biegepunkt außen [mm]', 'bis Biegepunkt innen [mm]', 'gerader Teil außen [mm]', 'gerader Teil innen [mm]']], body: sch, theme: 'grid', styles: { fontSize: 9, cellPadding: 1.4, halign: 'right' }, headStyles: { fillColor: [120, 120, 125] }, tableWidth: 170 });
    y = doc.lastAutoTable.finalY + 6;
  }
  // Vorschau der Abwicklung
  const f = sheet.flat;
  if (f) {
    if (y > 110) { doc.addPage(); y = 20 } // Vorschau mindestens ca. 80 mm hoch, sonst auf eigener Seite
    const bw = 120, bh = 184 - y, s = Math.min(bw / f.size[0], bh / f.size[1]); // unten Platz für die Biegenotizen
    const X = p => 14 + (p[0] - f.min[0]) * s, Y = p => y + (f.max[1] - p[1]) * s;
    doc.setFontSize(9); doc.setTextColor(110); doc.text(`Abwicklung (Maßstab ca. 1:${de(1 / s, 1)}), Biegelinien gestrichelt: rot = AUF (Lasche biegt aus der Zeichenebene nach vorn), blau = AB (nach hinten); Pfeil zeigt zur bewegten Lasche`, 14, y - 1.5);
    doc.setDrawColor(20); doc.setLineWidth(0.25);
    f.contour.forEach(pl => { for (let i = 1; i < pl.length; i++) doc.line(X(pl[i - 1]), Y(pl[i - 1]), X(pl[i]), Y(pl[i])) });
    if (f.rissLinien?.length) { doc.setDrawColor(156, 39, 176); doc.setLineWidth(0.6); f.rissLinien.forEach(pl => { for (let i = 1; i < pl.length; i++) doc.line(X(pl[i - 1]), Y(pl[i - 1]), X(pl[i]), Y(pl[i])) }); doc.setLineWidth(0.25) }
    const N = biegeNotizen(f), farbe = n => (n.auf ? [208, 52, 44] : [31, 111, 209]);
    f.bendLines.forEach((b, i) => { const c = farbe(N[i]); doc.setDrawColor(...c); doc.setLineDashPattern([1.5, 1], 0); doc.line(X(b[0]), Y(b[0]), X(b[1]), Y(b[1])) });
    doc.setLineDashPattern([], 0); doc.setFontSize(8);
    N.forEach(n => { const c = farbe(n); doc.setDrawColor(...c); doc.setFillColor(...c); doc.setTextColor(...c); doc.setLineWidth(0.4);
      // Pfeil in Papier-Millimetern (feste Länge 7 mm), y im PDF nach unten
      const a = [X(n.mitte), Y(n.mitte)], d = [n.richtung[0], -n.richtung[1]], L = 7, b = [a[0] + d[0] * L, a[1] + d[1] * L], k = 2.2, q = [-d[1], d[0]];
      doc.line(a[0], a[1], b[0], b[1]); doc.triangle(b[0], b[1], b[0] - d[0] * k + q[0] * k * 0.5, b[1] - d[1] * k + q[1] * k * 0.5, b[0] - d[0] * k - q[0] * k * 0.5, b[1] - d[1] * k - q[1] * k * 0.5, 'F');
      // Notiz entlang der Biegelinie (bei drei Vierteln der Länge) auf der Seite der festen Fläche, gegenüber dem Pfeil
      const w = n.winkel * Math.PI / 180, lv = [Math.cos(w), -Math.sin(w)], tw = doc.getTextWidth(n.text), nb = [-d[0], -d[1]], c0 = [X(n.anker), Y(n.anker)];
      const off = nb[0] * lv[1] - nb[1] * lv[0] > 0 ? 1.0 : 3.2; // Textoberseite zur festen Fläche → kleiner Abstand, sonst plus Texthöhe
      doc.text(n.text, c0[0] - lv[0] * tw / 2 + nb[0] * off, c0[1] - lv[1] * tw / 2 + nb[1] * off, { angle: n.winkel }) });
    doc.setLineWidth(0.25);
  }
  doc.setFontSize(8); doc.setTextColor(110);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.text(doc.splitTextToSize(T.hinweis, 200), 14, 200); doc.text(`Seite ${i} von ${n} · ${produkt}`, 283, 200, { align: 'right' }) }
  return new Uint8Array(doc.output('arraybuffer'));
}

/** XLSX mit Kopfdaten, Biegetabelle und Schenkeln (Zahlen als Zahlen, Format 0,00 in deutschem Excel). */
export async function xlsx(sheet, meta = {}) {
  const T = tabelle(sheet, meta);
  const B = v => ({ value: v, fontWeight: 'bold' });
  const N = (v, fmt = '0.00') => (v == null || !Number.isFinite(Number(v)) ? { value: '–' } : { value: Number(v), type: Number, format: fmt });
  const rows = [[{ value: 'Biegetabelle', fontWeight: 'bold', fontSize: 14 }], ...T.kopf.map(([a, b]) => [{ value: a }, B(b)]), []];
  rows.push(T.spalten.concat(['x1 [mm]', 'y1 [mm]', 'x2 [mm]', 'y2 [mm]']).map(B));
  T.zeilen.forEach(z => rows.push([N(z.nr, '0'), N(z.winkel, '0.0'), N(z.ri), { value: z.richtung }, { value: z.lage }, N(z.laenge), N(z.bz), N(z.v), N(z.bd), N(z.k, '0.000'), { value: z.quelle },
    N(z.lageXY?.x1), N(z.lageXY?.y1), N(z.lageXY?.x2), N(z.lageXY?.y2)]));
  rows.push([]);
  rows.push(['Nr.', 'Schenkel', 'bis Biegepunkt außen [mm]', 'bis Biegepunkt innen [mm]', 'gerader Teil außen [mm]', 'gerader Teil innen [mm]'].map(B));
  T.zeilen.forEach(z => z.schenkel.forEach((l, i) => rows.push([N(z.nr, '0'), N(i + 1, '0'), N(l.aussen), N(l.innen), N(l.geradeAussen), N(l.geradeInnen)])));
  rows.push([], [{ value: T.hinweis }]);
  const columns = [{ width: 12 }, { width: 22 }, { width: 10 }, { width: 12 }, { width: 40 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }];
  const blob = await writeExcelFile(rows, { columns, sheet: 'Biegetabelle' }).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
