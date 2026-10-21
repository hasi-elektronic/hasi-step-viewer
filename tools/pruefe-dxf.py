# Liest DXF-Dateien mit ezdxf (MIT) neu ein und gibt eine Zusammenfassung als JSON aus (für tools/test-dxf.mjs).
# Aufruf: python tools/pruefe-dxf.py datei.dxf [weitere.dxf] [--png ordner]
import sys, json, os, math
import ezdxf
from ezdxf import bbox

def pruefe(pfad, png=None):
    doc = ezdxf.readfile(pfad)
    aud = doc.audit()
    msp = doc.modelspace()
    ents = list(msp)
    zaehl = {}
    for e in ents:
        k = f"{e.dxftype()}@{e.dxf.layer}"
        zaehl[k] = zaehl.get(k, 0) + 1
    kreise = [{'c': [round(e.dxf.center.x, 6), round(e.dxf.center.y, 6)], 'r': round(e.dxf.radius, 6), 'layer': e.dxf.layer} for e in ents if e.dxftype() == 'CIRCLE']
    polys = []
    for e in ents:
        if e.dxftype() != 'LWPOLYLINE':
            continue
        pts = list(e.get_points('xyb'))
        polys.append({'layer': e.dxf.layer, 'geschlossen': bool(e.closed), 'punkte': len(pts), 'boegen': sum(1 for p in pts if abs(p[2]) > 1e-12)})
    kontur = [e for e in ents if e.dxf.layer == 'KONTUR']
    ex = bbox.extents(kontur)
    out = {'datei': os.path.basename(pfad), 'version': doc.dxfversion, 'insunits': doc.header.get('$INSUNITS'),
           'audit_fehler': len(aud.errors), 'audit_korrekturen': len(aud.fixes), 'layer': sorted(l.dxf.name for l in doc.layers),
           'anzahl': zaehl, 'kreise': kreise, 'polylinien': polys,
           'kontur_min': [round(ex.extmin.x, 6), round(ex.extmin.y, 6)], 'kontur_max': [round(ex.extmax.x, 6), round(ex.extmax.y, 6)],
           'kontur_groesse': [round(ex.size.x, 6), round(ex.size.y, 6)],
           'texte': [e.dxf.text for e in ents if e.dxftype() == 'TEXT']}
    if png:
        try:
            import matplotlib; matplotlib.use('Agg')
            from ezdxf.addons.drawing import matplotlib as dm
            ziel = os.path.join(png, os.path.splitext(os.path.basename(pfad))[0] + '.png')
            dm.qsave(msp, ziel, bg='#FFFFFF', dpi=150)
            out['png'] = ziel
        except Exception as err:  # Darstellung ist nur Beleg, kein Testkriterium
            out['png_fehler'] = str(err)
    return out

args = sys.argv[1:]
png = None
if '--png' in args:
    i = args.index('--png'); png = args[i + 1]; del args[i:i + 2]
print(json.dumps([pruefe(a, png) for a in args], ensure_ascii=False))
