# Erzeugt die Testteile für Faz 2 „Blech 2.0“ (selbst konstruiert, CadQuery Apache-2.0, nur Entwicklung). Keine Kundendaten.
#  scharf-l.step     : L-Winkel ohne Biegeradius (scharfe Kante), s 2, Schenkel außen 50 / 30, Breite 40
#  block-45.step     : Quader 80 × 50 × 30, um Z um 45° gedreht (Hüllquader/Rohmaß)
#  block-schraeg.step: derselbe Quader, um Z 45° und danach um X 30° gedreht (minimaler Hüllquader)
#  welle.step        : Welle Ø40 × 60 mit Absatz Ø25 × 30, Achse schräg im Raum (Rohmaß Zylinder Ø40 × 90)
# Der geschlossene Kasten für den virtuellen Riss ist testdaten/wanne-ohne-freischnitt.step (make-abwicklung-teile.py).
# Aufruf: python tools/make-faz2-teile.py testdaten
import sys, os, cadquery as cq
out = sys.argv[1] if len(sys.argv) > 1 else 'testdaten'
os.makedirs(out, exist_ok=True)

l = cq.Workplane('XZ').polyline([(0, 0), (50, 0), (50, 30), (48, 30), (48, 2), (0, 2)]).close().extrude(-40)
cq.exporters.export(l, f'{out}/scharf-l.step')

b = cq.Workplane('XY').box(80, 50, 30).rotate((0, 0, 0), (0, 0, 1), 45).translate((10, 20, 15))
cq.exporters.export(b, f'{out}/block-45.step')
b2 = cq.Workplane('XY').box(80, 50, 30).rotate((0, 0, 0), (0, 0, 1), 45).rotate((0, 0, 0), (1, 0, 0), 30).translate((5, -3, 40))
cq.exporters.export(b2, f'{out}/block-schraeg.step')

w = cq.Workplane('XY').circle(20).extrude(60).faces('>Z').workplane().circle(12.5).extrude(30)
w = w.rotate((0, 0, 0), (1, 1, 0), 35).translate((30, 0, 20))
cq.exporters.export(w, f'{out}/welle.step')
