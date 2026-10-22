# Synthetisches Blechteil für die Trumpf-kompatible Abwicklung (selbst konstruiert, CadQuery Apache-2.0, nur Entwicklung). Keine Kundendaten.
#  haube-6mm.step: U-Profil s 6, Ri 6, Länge 300. Grundfläche außen 200, Schenkel 1 senkrecht (Biegung 90°, außen 80),
#  Schenkel 2 nach außen geneigt (Biegung 82,46°, Öffnungswinkel 97,54°, außen 70 ab dem Schnittpunkt der Außenflächen).
#  Bohrung Ø20 in der Grundfläche, Langloch 40 × 12 in Schenkel 1, Ausklinkung mit Spline-Kontur an der Stirnseite
#  (Seitenflächen = Extrusionsflächen → „Freiform“-Stirnflächen wie bei schräg geschnittenen Biegungsenden).
# Aufruf: <venv>/bin/python tools/make-haube-teil.py testdaten
import sys, os, math, cadquery as cq
out = sys.argv[1] if len(sys.argv) > 1 else 'testdaten'
os.makedirs(out, exist_ok=True)
t, ri, B, H1, L2, LY = 6.0, 6.0, 200.0, 80.0, 70.0, 300.0
phi = math.radians(82.46002)
d = (math.cos(phi), math.sin(phi)); n = (-math.sin(phi), math.cos(phi))
P0, P1, P2 = (0, H1), (0, 0), (B, 0)
P3 = (B + L2 * d[0], L2 * d[1]); P4 = (P3[0] + t * n[0], P3[1] + t * n[1])
s = t * (1 - math.cos(phi)) / math.sin(phi)
I2 = (B - t * math.sin(phi) + s * math.cos(phi), t); I1 = (t, t)
pts = [P0, P1, P2, P3, P4, I2, I1, (t, H1)]
w = cq.Workplane('XZ').polyline(pts).close().extrude(-LY)  # XZ-Ebene, Extrusion in +Y
w = w.edges(cq.selectors.NearestToPointSelector((P1[0], LY / 2, P1[1]))).fillet(ri + t)
w = w.edges(cq.selectors.NearestToPointSelector((P2[0], LY / 2, P2[1]))).fillet(ri + t)
w = w.edges(cq.selectors.NearestToPointSelector((I1[0], LY / 2, I1[1]))).fillet(ri)
w = w.edges(cq.selectors.NearestToPointSelector((I2[0], LY / 2, I2[1]))).fillet(ri)
# Bohrung Ø20 in der Grundfläche, Langloch in Schenkel 1
w = w.cut(cq.Workplane('XY').center(100, 150).circle(10).extrude(20, both=True))
w = w.cut(cq.Workplane('YZ').center(150, 45).slot2D(40, 12).extrude(20, both=True))
# Ausklinkung an der Stirnseite y = 0 mit Spline-Kontur (durch die Dicke extrudiert)
sp = cq.Workplane('XY').workplane(offset=-5).moveTo(60, -1).spline([(75, 18), (95, 25), (115, 15)], includeCurrent=True).lineTo(130, -1).close().extrude(20)
w = w.cut(sp)
cq.exporters.export(w, f'{out}/haube-6mm.step')
print('geschrieben', f'{out}/haube-6mm.step')
