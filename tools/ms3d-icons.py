#!/usr/bin/env python3
"""Erzeugt die MS3D-App-Icons (Marke Sickinger) aus marken/sickinger/ms3d-icon.svg (Würfel V1, gewählt 20.10.2026).

Jede Größe wird direkt aus dem SVG gerendert, nicht aus einem großen PNG verkleinert.
Braucht cairosvg (nur für diese Erzeugung, nicht zur Laufzeit): pip install cairosvg
Schreibt src-tauri/icons-sickinger/ (32x32.png, 128x128.png, 128x128@2x.png, icon.ico, icon.icns).
Das Logo in Kopfzeile und PDF (public/marken/sickinger.png) bleibt das Firmenlogo, siehe tools/marke-icons.py.
"""
import struct
from pathlib import Path
import cairosvg

WURZEL = Path(__file__).resolve().parents[1]
SVG = (WURZEL / 'marken' / 'sickinger' / 'ms3d-icon.svg').read_bytes()
ICONS = WURZEL / 'src-tauri' / 'icons-sickinger'


def png(n):
    return cairosvg.svg2png(bytestring=SVG, output_width=n, output_height=n)


def ico(groessen):
    # ICO mit PNG-Einträgen (ab Windows Vista), je Größe eigenes Rendering
    bilder = [png(n) for n in groessen]
    kopf = struct.pack('<HHH', 0, 1, len(groessen))
    offset = 6 + 16 * len(groessen)
    eintraege, daten = b'', b''
    for n, b in zip(groessen, bilder):
        eintraege += struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, 1, 32, len(b), offset + len(daten))
        daten += b
    return kopf + eintraege + daten


def icns():
    typen = [('icp4', 16), ('icp5', 32), ('icp6', 64), ('ic07', 128), ('ic08', 256), ('ic09', 512), ('ic10', 1024),
             ('ic11', 32), ('ic12', 64), ('ic13', 256), ('ic14', 512)]
    body = b''
    for typ, n in typen:
        d = png(n)
        body += typ.encode('ascii') + struct.pack('>I', 8 + len(d)) + d
    return b'icns' + struct.pack('>I', 8 + len(body)) + body


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    for n, name in ((32, '32x32.png'), (128, '128x128.png'), (256, '128x128@2x.png')):
        (ICONS / name).write_bytes(png(n))
    (ICONS / 'icon.ico').write_bytes(ico([16, 24, 32, 48, 64, 128, 256]))
    (ICONS / 'icon.icns').write_bytes(icns())
    print('MS3D-Icons geschrieben nach', ICONS)


if __name__ == '__main__':
    main()
