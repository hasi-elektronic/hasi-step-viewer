#!/usr/bin/env python3
"""Erzeugt das Sickinger-Firmenlogo für Kopfzeile, Ablege-Hinweis und PDF-Kopf aus marken/sickinger/logo-quelle.png.

Braucht Pillow (nur für diese Erzeugung, nicht zur Laufzeit): pip install pillow
Schreibt nur public/marken/sickinger.png. Die App-Icons (MS3D-Würfel) erzeugt tools/ms3d-icons.py.
"""
from io import BytesIO
from pathlib import Path
from PIL import Image

WURZEL = Path(__file__).resolve().parents[1]
QUELLE = WURZEL / 'marken' / 'sickinger' / 'logo-quelle.png'
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



def main():
    master = zuschneiden(Image.open(QUELLE))
    UI.parent.mkdir(parents=True, exist_ok=True)
    png_bytes(master, 256)[0].save(UI, 'PNG')
    print('Logo geschrieben nach', UI)


if __name__ == '__main__':
    main()
