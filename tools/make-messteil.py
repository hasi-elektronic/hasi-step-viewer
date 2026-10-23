# Erzeugt das Messteil mit bekannten Sollmaßen (selbst konstruiert) für tools/test-messen.mjs.
# Quader 100 × 60 × 20 mm (Ecke im Ursprung), Bohrungen Ø10 bei (25|30) und Ø16 bei (75|30) durchgehend,
# senkrechte Kante bei (0|0) mit R5 verrundet, Schräge 30° ab x = 85 an der Oberseite.
# Werkzeug: CadQuery (Apache-2.0), nur zur Entwicklung. Aufruf: python tools/make-messteil.py testdaten/messteil.step
import sys, math, cadquery as cq
out = sys.argv[1] if len(sys.argv) > 1 else 'testdaten/messteil.step'
b = cq.Workplane('XY').box(100, 60, 20, centered=False)
b = b.edges('|Z').edges('<X and <Y').fillet(5)
b = b.faces('>Z').workplane(origin=(0, 0, 20)).pushPoints([(25, 30)]).hole(10).faces('>Z').workplane(origin=(0, 0, 20)).pushPoints([(75, 30)]).hole(16)
h = 15 * math.tan(math.radians(30))
keil = cq.Workplane('XZ').polyline([(85, 20), (100, 20 - h), (100, 21), (85, 21)]).close().extrude(-60)
b = b.cut(keil)
cq.exporters.export(b, out)
print('geschrieben', out)
