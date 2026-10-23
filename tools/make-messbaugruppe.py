# Eigene Mess-Baugruppe (lizenzfrei, selbst erzeugt) mit bekannten Abständen.
# CadQuery (Apache-2.0), nur zur Entwicklung.
# Aufruf: python tools/make-messbaugruppe.py testdaten/messbaugruppe.step
#
# Boden: Quader 100×40×10, Mittelpunkt im Ursprung (x −50…50, y −20…20, z −5…5).
# Klotz: Würfel 20, 90° um Y gedreht, dann nach (90, 0, 25) geschoben.
#   Danach liegt die Fläche mit Normale −X bei x = 80.
#   Abstand zur Bodenfläche x = 50: min = √(30²+10²), Mitte–Mitte = √(30²+25²).
# Bolzen A/B: Zylinder Höhe 20, r = 4 bzw. 5, Achse Z, bei (0, 0, 5) und (50, 0, 5). Lochabstand 50 mm.
# Bolzen C: Zylinder r = 3, 90° um X gedreht, nach (0, 30, 0). Achse zeigt danach in −Y.
import sys, cadquery as cq
boden = cq.Workplane("XY").box(100, 40, 10)
klotz = cq.Workplane("XY").box(20, 20, 20)
# Unterschiedliche Radien, damit jedes Bauteil einen eigenen Produktnamen behält.
bolzen_a = cq.Workplane("XY").circle(4).extrude(20)
bolzen_b = cq.Workplane("XY").circle(5).extrude(20)
bolzen_c = cq.Workplane("XY").circle(3).extrude(20)
asm = (cq.Assembly(name="Messbaugruppe")
       .add(boden, name="Boden", color=cq.Color(0.72, 0.75, 0.78))
       .add(klotz, name="Klotz", loc=cq.Location((90, 0, 25), (0, 1, 0), 90), color=cq.Color(0.45, 0.62, 0.78))
       .add(bolzen_a, name="Bolzen A", loc=cq.Location((0, 0, 5)), color=cq.Color(0.8, 0.6, 0.2))
       .add(bolzen_b, name="Bolzen B", loc=cq.Location((50, 0, 5)), color=cq.Color(0.8, 0.6, 0.2))
       .add(bolzen_c, name="Bolzen C", loc=cq.Location((0, 30, 0), (1, 0, 0), 90), color=cq.Color(0.75, 0.45, 0.2)))
asm.save(sys.argv[1] if len(sys.argv) > 1 else "messbaugruppe.step")
print("ok")
