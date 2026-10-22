# Synthetisches „Bock“-Teil für Gesamthöhe und Höhe vs. schräger Abstand (selbst konstruiert, CadQuery Apache-2.0). Keine Kundendaten.
#  bock.step: Trapez-Prisma (unten 120, oben 80, Höhe 60, Tiefe 50) mit schrägen Seiten, oben eine runde Rippe R6 (liegender Zylinder, Länge 30).
#  Fußfläche z = 0, Deckfläche z = 60 → Höhe Fläche–Fläche 60; Rippe (rund, keine ebene Fläche) bis z = 66 → Gesamthöhe (Hüllquader) 66.
#  Schräge Seite: Ecke unten (0|0) bis Ecke oben (20|60) → Abstand (schräg) √(20² + 60²) = 63,246, Höhe (Z) 60.
# Aufruf: <venv>/bin/python tools/make-bock-teil.py testdaten
import sys, os, cadquery as cq
out = sys.argv[1] if len(sys.argv) > 1 else 'testdaten'
os.makedirs(out, exist_ok=True)
w = cq.Workplane('XZ').polyline([(0, 0), (120, 0), (100, 60), (20, 60)]).close().extrude(-50)
w = w.union(cq.Workplane('XZ', origin=(0, 10, 0)).center(60, 60).circle(6).extrude(-30))
cq.exporters.export(w, os.path.join(out, 'bock.step'))
print('bock.step geschrieben')
