# Hasi STEP-Betrachter (Prototyp 0.1.0)

Reiner STEP/STP-Viewer (keine Bearbeitung). Tauri 2 + three.js + occt-import-js (OpenCascade als WASM, Parsing im Web Worker).

Funktionen: STEP öffnen (Button oder Drag & Drop), Drehen/Zoom/Pan (Maus: links/Rad/rechts), Modellbaum mit Ein-/Ausblenden je Baugruppe/Teil, Punkt-zu-Punkt-Messung (mm), Schnitt X/Y/Z mit Schieberegler.

## Starten
    npm ci
    npm run dev            # Web-Version: http://localhost:5173
    npm run build && npm run preview   # Produktions-Build: http://localhost:4173
    npm run smoke          # Headless-Test gegen Preview (Ladezeit, Baum, Messung, Screenshots)
    npm run tauri dev      # Desktop-Fenster (Rust + Systemlibs nötig)
    npm run tauri build    # Installer für das aktuelle OS

Linux-Voraussetzungen: libwebkit2gtk-4.1-dev, libgtk-3-dev, librsvg2-dev, Rust >= 1.85 (Lockfile ist auf 1.85 aufgelöst).

## Installer über CI
`.github/workflows/release.yml`: Jobs auf `windows-latest` (NSIS-.exe + .msi) und `macos-latest` (Universal-.dmg). Start über Tag `v*` oder manuell (workflow_dispatch); Ergebnisse als Actions-Artefakte.
Voraussetzung: Repository auf GitHub (noch nicht angelegt). Ohne Apple-Developer-ID ist die .dmg unsigniert/nicht notarisiert -> Gatekeeper-Warnung (Rechtsklick > Öffnen). Ohne Windows-Codesigning-Zertifikat -> SmartScreen-Hinweis.

## Testdatei
Testdatei nicht im Repo (Lizenz ungeklärt). Für `npm run smoke` eine eigene STEP-Datei als `public/sample.stp` ablegen.

## Messen und Blech (ab feat/messen-blech)

Geometriekern: opencascade.js (OCCT als WebAssembly, LGPL-2.1) im Web Worker – echte B-Rep (Flächen, Kanten, Eckpunkte), nicht nur Netz.

- Fangen: Eckpunkt, Kreismittelpunkt, Kante, Fläche
- Messen: minimaler Abstand (Punkt/Kante/Fläche), paralleler Abstand, Achsabstand, Winkel, Radius/Durchmesser, Bogenwinkel/-länge, Kantenlänge, Flächeninhalt, Bounding-Box, Volumen, Oberfläche, Schwerpunkt, Masse mit Dichte
- Einheit aus der STEP-Datei (SI_UNIT / CONVERSION_BASED_UNIT)
- Blech: Dickenerkennung, Biegetabelle (Ri, Winkel, Richtung), K-Faktor → Biegezugabe, Biegeverkürzung v, Zuschnitt; Abwicklung als DXF (Layer KONTUR, BIEGELINIEN)

Tests: `npm run testblech && node tools/test-brep.mjs` (Node), `npm run build && npx vite preview & node smoke.mjs` (Headless-Screenshots in `docs/`).

## Baugruppenbaum (ab feat/baugruppenbaum)

Eigener schneller STEP-Strukturparser (`src/stephier.js`) liefert Namen und Hierarchie; diese wird strukturgleich auf den Baum aus opencascade.js gelegt. Gleiche Teile werden nur einmal aufbereitet (Instanzen teilen Geometrie).
Baum mit Unterbaugruppen, Sichtbarkeit (vererbt), Suche, Kontextmenü und Zeilen-Icons, Auswahl Baum ↔ 3D.
Tests: `node tools/test-baum.mjs`, Headless: `node tools/smoke-baugruppe.mjs` (Screenshots `docs/baum-*.png`).

## Einheiten

Alle Maße werden immer in **mm** angezeigt (Fläche mm², Volumen mm³), egal ob die STEP-Datei in mm, cm, m oder Zoll vorliegt – das gilt für Messen, Eigenschaften, Bounding-Box, Blech, Biegetabelle und DXF-Export. Der OCCT-Import rechnet beim Einlesen in mm um; die DXF wird mit echten mm-Werten (`$INSUNITS = 4`) geschrieben. Die Einheit der Datei steht nur als Info in der Statusleiste, z. B. „Datei: cm → Anzeige: mm“.

Test: `testdaten/testblech-cm.step` (selbst erzeugt mit `tools/make-testblech-cm.py`), geprüft durch `tools/test-einheit.mjs` und `tools/smoke-einheit.mjs`.

![Einheit cm](docs/einheit-cm.png)
