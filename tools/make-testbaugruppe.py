# Erzeugt eine eigene Test-Baugruppe (lizenzfrei, selbst erzeugt) mit CadQuery (Apache-2.0).
# Aufruf: python tools/make-testbaugruppe.py testdaten/testbaugruppe.step
import sys, cadquery as cq
t, ri = 2.0, 3.0
def winkel(l1=40, l2=30, b=30):
    ro = ri + t
    prof = (cq.Workplane("XZ").moveTo(0, 0).lineTo(l1, 0)
            .radiusArc((l1 + ro, ro), -ro).lineTo(l1 + ro, ro + l2)
            .lineTo(l1 + ri, ro + l2).lineTo(l1 + ri, ro)
            .radiusArc((l1, t), ri).lineTo(0, t).close())
    w = prof.extrude(-b)
    return w.faces("<Z").workplane().center(-(l1 + ro) / 2 + 15, 0).hole(6)
platte = cq.Workplane("XY").box(160, 80, 5).translate((0, 0, -2.5)).faces(">Z").workplane().rarray(120, 50, 2, 2).hole(8)
bolzen = cq.Workplane("XY").circle(4).extrude(20)
unter = (cq.Assembly(name="Winkelbaugruppe")
         .add(winkel(), name="Winkel links", loc=cq.Location((-60, -15, 0)), color=cq.Color(0.6, 0.65, 0.75))
         .add(winkel(), name="Winkel rechts", loc=cq.Location((60, 15, 0), (0, 0, 1), 180), color=cq.Color(0.6, 0.65, 0.75)))
asm = (cq.Assembly(name="Halter komplett")
       .add(platte, name="Grundplatte", color=cq.Color(0.75, 0.75, 0.72))
       .add(unter, name="Winkelbaugruppe")
       .add(bolzen, name="Bolzen 1", loc=cq.Location((-60, 25, 0)), color=cq.Color(0.8, 0.6, 0.2))
       .add(bolzen, name="Bolzen 2", loc=cq.Location((60, -25, 0)), color=cq.Color(0.8, 0.6, 0.2)))
asm.save(sys.argv[1] if len(sys.argv) > 1 else "testbaugruppe.step")
print("ok")
