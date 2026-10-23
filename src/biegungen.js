// Biegungen zählen wie an der Abkantpresse: Biegezonen, deren Biegelinien in der Abwicklung auf einer Geraden liegen und die
// denselben Winkel, dieselbe Richtung (AUF/AB) und denselben Innenradius haben, werden in EINEM Hub gebogen → eine Biegung.
// Beispiel: ein Schenkel, der durch Ausklinkungen in mehrere Laschen geteilt ist, oder eine Stirnlasche, die einem
// gekanteten Profil folgt (in der Abwicklung eine gerade Linie). Die Geometrie (DXF/GEO) behält jede Biegezone einzeln.
// bends: [{nr, ang (°), dir, ri, len}], bendLines: [[P0,P1]] je Biegezone (2D, gleiche Reihenfolge).
// Ergebnis: je Biegezone {gruppe, abschnitt, abschnitte}, dazu die Liste der Biegungen.
export const TOL_BIEGUNG = { winkel: 0.05, ri: 1e-3, richtung: 1e-6, abstand: 0.01 };

export function biegungenGruppieren(bends, bendLines, tol = TOL_BIEGUNG) {
  const n = bends.length, eltern = [...Array(n).keys()];
  const wurzel = i => { while (eltern[i] !== i) i = eltern[i] = eltern[eltern[i]]; return i; };
  const linie = i => { const l = bendLines?.[i]; if (!l || l.length < 2) return null; const [a, b] = [l[0], l.at(-1)]; const d = [b[0] - a[0], b[1] - a[1]]; const L = Math.hypot(d[0], d[1]); return L > 1e-9 ? { a, d: [d[0] / L, d[1] / L] } : null; };
  const L = bends.map((_, i) => linie(i));
  const abstand = (g, p) => Math.abs((p[0] - g.a[0]) * g.d[1] - (p[1] - g.a[1]) * g.d[0]);
  const gleich = (i, j) => {
    const A = bends[i], B = bends[j], la = L[i], lb = L[j];
    if (!la || !lb) return false;
    if (A.dir !== B.dir || Math.abs(A.ang - B.ang) > tol.winkel || Math.abs(A.ri - B.ri) > tol.ri) return false;
    if (Math.abs(la.d[0] * lb.d[1] - la.d[1] * lb.d[0]) > tol.richtung * 100) return false; // parallel
    const lbl = bendLines[j]; return abstand(la, lbl[0]) <= tol.abstand && abstand(la, lbl.at(-1)) <= tol.abstand; // auf derselben Geraden
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (wurzel(i) !== wurzel(j) && gleich(i, j)) eltern[wurzel(j)] = wurzel(i);
  // Nummern in der Reihenfolge der ersten Biegezone, Abschnitte entlang der Biegelinie sortiert
  const nrVon = new Map(), gruppen = [];
  for (let i = 0; i < n; i++) { const w = wurzel(i); if (!nrVon.has(w)) { nrVon.set(w, gruppen.length + 1); gruppen.push([]); } gruppen[nrVon.get(w) - 1].push(i); }
  const zonen = new Array(n);
  const biegungen = gruppen.map((idx, g) => {
    const l0 = L[idx[0]], pos = i => { const l = bendLines?.[i]; if (!l0 || !l) return i; const m = [(l[0][0] + l.at(-1)[0]) / 2, (l[0][1] + l.at(-1)[1]) / 2]; return (m[0] - l0.a[0]) * l0.d[0] + (m[1] - l0.a[1]) * l0.d[1]; };
    const sortiert = [...idx].sort((a, b) => pos(a) - pos(b));
    sortiert.forEach((i, k) => { zonen[i] = { gruppe: g + 1, abschnitt: k + 1, abschnitte: idx.length }; });
    const b0 = bends[idx[0]];
    return { nr: g + 1, zonen: sortiert.map(i => bends[i].nr), ang: b0.ang, dir: b0.dir, ri: b0.ri, len: idx.reduce((s, i) => s + (bends[i].len || 0), 0) };
  });
  return { zonen, biegungen };
}

/** Bezeichnung einer Biegezone: „B3“ oder bei mehreren Abschnitten auf derselben Biegelinie „B3“ (alle mit derselben Nummer). */
export const biegeNr = b => b?.gruppe ?? b?.nr;
