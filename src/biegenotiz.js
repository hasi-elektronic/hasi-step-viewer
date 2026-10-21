// Biegenotizen für Vorschau und PDF (ZW3D: Biegerichtungspfeile + „AUF 90° Ri 2“ an jeder Biegelinie).
// AUF = Lasche biegt aus der Zeichenebene nach vorn (Blick auf die Abwicklung wie im DXF), AB = nach hinten.
// Der Pfeil steht in der Mitte der Biegelinie und zeigt zur Seite der Lasche, die beim Biegen bewegt wird.
const zahl = (v, n) => (+Number(v).toFixed(n)).toLocaleString('de-DE', { maximumFractionDigits: n });
export function notizText(q) {
  return `${q.dir === 'nach oben' ? 'AUF' : 'AB'} ${zahl(q.ang, 1)}° Ri ${zahl(q.ri, 2)}${q.angenommen ? ' (angenommen)' : ''}`;
}
/** Notizen je Biegelinie: {nr, auf, text, mitte, pfeil:[von, bis], richtung (Einheitsvektor), winkel (Textwinkel in Grad)} – Koordinaten wie flat. */
export function biegeNotizen(flat) {
  const bi = flat?.bendInfo || [];
  const L = Math.min(15, Math.max(4, 0.06 * Math.max(...(flat?.size || [0]))));
  return (flat?.bendLines || []).map((b, i) => {
    const q = bi[i] || { nr: i + 1, dir: 'nach oben', ang: 90, ri: 0 };
    const m = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
    let s = q.seite;
    if (!s) { const d = [b[1][0] - b[0][0], b[1][1] - b[0][1]], l = Math.hypot(d[0], d[1]) || 1; s = [-d[1] / l, d[0] / l]; }
    let w = Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]) * 180 / Math.PI; if (w > 90) w -= 180; if (w <= -90) w += 180;
    // Text entlang der Biegelinie bei drei Vierteln der Länge, auf der Seite der festen Fläche (gegenüber dem Pfeil):
    // so überdecken sich Text und Pfeil auch bei eng liegenden Biegungen nicht
    const anker = [m[0] + (b[1][0] - m[0]) * 0.5, m[1] + (b[1][1] - m[1]) * 0.5];
    return { nr: q.nr, auf: q.dir === 'nach oben', text: `B${q.nr} ${notizText(q)}`, mitte: m, richtung: s, pfeil: [m, [m[0] + s[0] * L, m[1] + s[1] * L]], winkel: w, laenge: L, anker };
  });
}
