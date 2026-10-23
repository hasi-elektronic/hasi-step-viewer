# Synthetisches Blechteil für das Zählen der Biegungen (selbst konstruiert, CadQuery Apache-2.0, nur Entwicklung). Keine Kundendaten.
#  zwei-laschen.step: U-Profil s 2, Ri 2, Länge 200 (X), Grundfläche außen 120 (Y), Schenkel außen 30 (Z).
#  Der vordere Schenkel ist durch eine Ausklinkung (x 80 … 120, inkl. Biegezone) in zwei Laschen geteilt:
#  zwei Biegezonen auf derselben Biegelinie → in der Abkantpresse EIN Hub → 1 Biegung. Der hintere Schenkel ist eine zweite Biegung.
#  Erwartung: 3 Biegezonen, 2 Biegungen.
# Aufruf: <venv>/bin/python tools/make-biegung-teil.py testdaten
import sys, os, cadquery as cq
out = sys.argv[1] if len(sys.argv) > 1 else 'testdaten'
os.makedirs(out, exist_ok=True)
t, ri, B, H, L = 2.0, 2.0, 120.0, 30.0, 200.0
pts = [(0, H), (0, 0), (B, 0), (B, H), (B - t, H), (B - t, t), (t, t), (t, H)]
w = cq.Workplane('YZ').polyline(pts).close().extrude(L)  # YZ-Ebene, Extrusion in +X
for y, z, r in [(0, 0, ri + t), (B, 0, ri + t), (t, t, ri), (B - t, t, ri)]:
    w = w.edges(cq.selectors.NearestToPointSelector((L / 2, y, z))).fillet(r)
w = w.cut(cq.Workplane('XY').box(40, 12, 50, centered=(True, False, False)).translate((100, -1, -5)))
cq.exporters.export(w, f'{out}/zwei-laschen.step')
print('geschrieben', f'{out}/zwei-laschen.step')
