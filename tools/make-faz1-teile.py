# Erzeugt die Testteile für Faz 1 (selbst konstruiert, CadQuery Apache-2.0, nur Entwicklung). Keine Kundendaten.
#  faz1-messteil.step : Quader 100 × 50 × 20 (Ecke im Ursprung) mit
#      Senkung 90° bei (20|25): Bohrung Ø8 durchgehend, Senkung Ø16 → Kegelhöhe 4
#      Kugelmulde bei (55|25): Kugel R10, Mittelpunkt (55|25|28) → Randkreis r = 6 auf der Oberseite
#      Schräge ab x = 80 an der Oberseite, 25° geneigt (bis x = 100)
#      Fase 2 × 45° an der senkrechten Kante (0|0), Fase 3 × 1,5 an der senkrechten Kante (0|50)
#  umschlag.step      : Blech s 2, Ri 1, Schenkel 40 / 20 (gerade), 180° Umschlag, Breite 30
#  umschlag-200.step  : Blech s 2, Ri 3, Schenkel 30 / 10 (gerade), 200° Biegung, Breite 30
#  blech-bohrungen.step : L-Winkel s 2, Ri 2, Schenkel 50 / 30, Breite 60, Bohrungen Ø6, Ø6, Ø10,
#      Langloch 20 × 8, Außenecken des Grundschenkels R5 (DXF-Test: CIRCLE, ARC, LWPOLYLINE mit Bulge)
# Aufruf: python tools/make-faz1-teile.py testdaten
import sys, math, os, importlib.util, cadquery as cq
out = sys.argv[1] if len(sys.argv) > 1 else 'testdaten'
os.makedirs(out, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))

# Profil-Funktion aus make-abwicklung-teile.py wiederverwenden (ohne deren Ausgaben zu erzeugen)
src = open(os.path.join(here, 'make-abwicklung-teile.py'), encoding='utf-8').read()
start = src.index('def profil'); end = src.index('\ns = profil')
ns = {'cq': cq, 'math': math}
exec(src[start:end], ns)
profil = ns['profil']

# ---- Messteil ----
b = cq.Workplane('XY').box(100, 50, 20, centered=False)
b = b.edges('|Z').edges('<X and <Y').chamfer(2)
b = b.edges('|Z').edges('<X and >Y').chamfer(3, 1.5)
b = b.faces('>Z').workplane(origin=(0, 0, 20)).pushPoints([(20, 25)]).cskHole(8, 16, 90)
b = b.cut(cq.Workplane('XY').sphere(10).translate((55, 25, 28)))
h = 20 * math.tan(math.radians(25))
keil = cq.Workplane('XZ').polyline([(80, 20), (100, 20 - h), (100, 21), (80, 21)]).close().extrude(-50)
b = b.cut(keil)
cq.exporters.export(b, f'{out}/faz1-messteil.step')

# ---- Umschlag 180° und 200° ----
u = profil([('L', 40), ('B', 180, 1.0), ('L', 20)], 2.0).extrude(-30)
cq.exporters.export(u, f'{out}/umschlag.step')
u2 = profil([('L', 30), ('B', 200, 3.0), ('L', 10)], 2.0).extrude(-30)
cq.exporters.export(u2, f'{out}/umschlag-200.step')

# ---- L-Winkel mit Bohrungen ----
l = profil([('L', 50), ('B', 90, 2.0), ('L', 30)], 2.0).extrude(-60)
# Grundschenkel: x 0…50, z −1…1, y 0…60; Biegung x 50…54; senkrechter Schenkel x 52…54, z 3…33
l = l.edges('|Z').edges('<X').fillet(5)
loch = lambda d, x, y: cq.Workplane('XY').circle(d / 2).extrude(10).translate((x, y, -5))
l = l.cut(loch(6, 15, 15)).cut(loch(6, 15, 45))
l = l.cut(cq.Workplane('XY').slot2D(20, 8, 0).extrude(10).translate((35, 30, -5)))
l = l.cut(cq.Workplane('YZ').circle(5).extrude(10).translate((48, 30, 20)))
cq.exporters.export(l, f'{out}/blech-bohrungen.step')
print('geschrieben', out)
