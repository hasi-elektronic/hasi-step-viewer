#!/usr/bin/env python3
"""Erzeugt die Sickinger-App-Icons aus marken/sickinger/logo-quelle.png.

Braucht Pillow (nur für diese Erzeugung, nicht zur Laufzeit): pip install pillow
Schreibt src-tauri/icons-sickinger/ (ico, icns, png) und public/marken/sickinger.png.
"""
import struct
from io import BytesIO
from pathlib import Path
from PIL import Image

WURZEL = Path(__file__).resolve().parents[1]
QUELLE = WURZEL / 'marken' / 'sickinger' / 'logo-quelle.png'
ICONS = WURZEL / 'src-tauri' / 'icons-sickinger'
UI = WURZEL / 'public' / 'marken' / 'sickinger.png'


def zuschneiden(src, schwelle=248):
    bild = src.convert('RGBA')
    px, w, h = bild.load(), *bild.size

    def leer(x, y):
        r, g, b, a = px[x, y]
        return a < 8 or (r >= schwelle and g >= schwelle and b >= schwelle)

    top = 0
    while top < h and all(leer(x, top) for x in range(w)):
        top += 1
    bot = h - 1
    while bot > top and all(leer(x, bot) for x in range(w)):
        bot -= 1
    left = 0
    while left < w and all(leer(left, y) for y in range(h)):
        left += 1
    right = w - 1
    while right > left and all(leer(right, y) for y in range(h)):
        right -= 1
    kern = bild.crop((left, top, right + 1, bot + 1))
    seite = max(kern.size)
    rand = max(8, int(seite * 0.06))
    quad = Image.new('RGBA', (seite + 2 * rand, seite + 2 * rand), (255, 255, 255, 255))
    quad.paste(kern, ((quad.size[0] - kern.size[0]) // 2, (quad.size[1] - kern.size[1]) // 2), kern)
    return quad.resize((1024, 1024), Image.Resampling.LANCZOS)


def png_bytes(bild, n):
    klein = bild.resize((n, n), Image.Resampling.LANCZOS)
    buf = BytesIO()
    klein.save(buf, 'PNG')
    return klein, buf.getvalue()


def icns(master):
    typen = {16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10'}
    body = b''
    for n, typ in typen.items():
        daten = png_bytes(master, n)[1]
        body += typ.encode('ascii') + struct.pack('>I', 8 + len(daten)) + daten
    return b'icns' + struct.pack('>I', 8 + len(body)) + body


def main():
    master = zuschneiden(Image.open(QUELLE))
    ICONS.mkdir(parents=True, exist_ok=True)
    UI.parent.mkdir(parents=True, exist_ok=True)
    for n, name in ((32, '32x32.png'), (128, '128x128.png'), (256, '128x128@2x.png')):
        png_bytes(master, n)[0].save(ICONS / name, 'PNG')
    png_bytes(master, 256)[0].save(UI, 'PNG')
    groessen = [16, 24, 32, 48, 64, 128, 256]
    bilder = [master.resize((n, n), Image.Resampling.LANCZOS) for n in groessen]
    bilder[-1].save(ICONS / 'icon.ico', format='ICO', sizes=[(n, n) for n in groessen])
    (ICONS / 'icon.icns').write_bytes(icns(master))
    print('Icons geschrieben nach', ICONS)


if __name__ == '__main__':
    main()
