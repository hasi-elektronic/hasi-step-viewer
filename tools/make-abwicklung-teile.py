# Erzeugt Testteile für die Abwicklung (selbst konstruiert, CadQuery Apache-2.0, nur Entwicklung).
#  s-profil.step : zwei direkt aufeinanderfolgende Biegungen (+90°/−90°, Ri 3, s 2), Schenkel 30 / 30, Breite 40
#  wanne.step    : Wanne 100 × 60 × 20 (außen), s 2, Ri 2, vier Laschen in vier Richtungen, Eckfreischnitte 6 × 6
#  wanne-ohne-freischnitt.step : dieselbe Wanne ohne Eckfreischnitte (geschlossene Ecken, nicht abwickelbar)
#  winkel-senkung.step : Winkel mit Senkbohrung (Kegelfläche → Warnung)
#  kuppel.step   : Kugelschale (nicht abwickelbar)
# Aufruf: python tools/make-abwicklung-teile.py testdaten
import sys, math, os, cadquery as cq
out = sys.argv[1] if len(sys.argv) > 1 else 'testdaten'
os.makedirs(out, exist_ok=True)
t, ri, W = 2.0, 3.0, 40.0

def profil(segs, t):
    """Mittellinie aus ('L', länge) und ('B', winkel_grad, ri) -> geschlossenes Profil (Innen-/Außenkontur) in XZ."""
    x, z, h = 0.0, 0.0, 0.0  # Position, Richtung (rad)
    left, right = [], []      # Listen von ('L', p) bzw. ('A', mid, end)
    def off(px, pz, hh, s):   # Versatz senkrecht zur Richtung, s=+1 links
        return (px - s * t / 2 * math.sin(hh), pz + s * t / 2 * math.cos(hh))
    left.append(('P', off(x, z, h, 1))); right.append(('P', off(x, z, h, -1)))
    for sg in segs:
        if sg[0] == 'L':
            x += sg[1] * math.cos(h); z += sg[1] * math.sin(h)
            left.append(('L', off(x, z, h, 1))); right.append(('L', off(x, z, h, -1)))
        else:
            a = math.radians(sg[1]); rm = sg[2] + t / 2; s = 1 if a > 0 else -1
            cx, cz = x - s * rm * math.sin(h), z + s * rm * math.cos(h)
            def pt(hh, r): return (cx + s * r * math.sin(hh), cz - s * r * math.cos(hh))
            hm, he = h + a / 2, h + a
            for lst, sd in ((left, 1), (right, -1)):
                r = rm - s * sd * t / 2
                lst.append(('A', pt(hm, r), pt(he, r)))
            h = he; x, z = pt(h, rm)
    w = cq.Workplane('XZ').moveTo(*left[0][1])
    for s_ in left[1:]:
        w = w.lineTo(*s_[1]) if s_[0] == 'L' else w.threePointArc(s_[1], s_[2])
    w = w.lineTo(*(right[-1][1] if right[-1][0] == 'L' else right[-1][2]))
    rr = right[::-1]
    for k in range(len(rr) - 1):
        cur, nxt = rr[k], rr[k + 1]
        tgt = nxt[1] if nxt[0] in ('L', 'P') else nxt[2]
        if cur[0] == 'A':
            w = w.threePointArc(cur[1], tgt)
        else:
            w = w.lineTo(*tgt)
    return w.close()

s = profil([('L', 30), ('B', 90, ri), ('B', -90, ri), ('L', 30)], t).extrude(-W)
cq.exporters.export(s, f'{out}/s-profil.step')

# Wanne: außen 100 × 60 × 20, Boden außen verrundet R = ri2 + t, Schale nach innen, Ecken freigeschnitten
ri2 = 2.0
w = cq.Workplane('XY').box(100, 60, 20, centered=(True, True, False)).edges('<Z').fillet(ri2 + t)
w = w.faces('>Z').shell(-t)
cq.exporters.export(w, f'{out}/wanne-ohne-freischnitt.step')
e = 6.0
for sx in (-1, 1):
    for sy in (-1, 1):
        w = w.cut(cq.Workplane('XY').box(e * 2, e * 2, 50).translate((sx * 50, sy * 30, 0)))
cq.exporters.export(w, f'{out}/wanne.step')

# Winkel mit Senkbohrung (Kegelfläche, nicht abwickelbar)
l = profil([('L', 40), ('B', 90, ri), ('L', 25)], t).extrude(-W)
l = l.faces('<Z').workplane(centerOption='CenterOfBoundBox').center(0, 0).cskHole(6, 10, 90)
cq.exporters.export(l, f'{out}/winkel-senkung.step')

k = cq.Workplane('XY').sphere(50).cut(cq.Workplane('XY').sphere(48)).cut(cq.Workplane('XY').box(200, 200, 200).translate((0, 0, -70)))
cq.exporters.export(k, f'{out}/kuppel.step')
print('geschrieben', out)
