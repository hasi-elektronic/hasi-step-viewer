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
`.github/workflows/release.yml`: Jobs auf `windows-latest` (NSIS-.exe + .msi) und `macos-latest` (Universal-.dmg), je Marke `hasi` und `sickinger`. Start über Tag `v*` oder manuell (workflow_dispatch); Ergebnisse als Actions-Artefakte.

## Marke Sickinger
Dieselbe App, zweite Marke für Manfred Sickinger Apparatebau. Ohne Variable bleibt der Hasi-Build unverändert.

    MARKE=sickinger npm run build
    MARKE=sickinger npm run tauri build -- --config src-tauri/tauri.sickinger.conf.json

Produktname „Sickinger STEP-Betrachter“, Kennung `de.sickinger.stepbetrachter`, Herausgeber „Manfred Sickinger Apparatebau“. Farben aus dem Logo: Dunkelblau `#004B85`, Hellblau `#009EDF`. Im Über-Dialog steht zusätzlich „Entwickelt von Hasi Elektronic“.
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

## Messen

Alle Werte werden exakt aus der B-Rep (OCCT) berechnet, nicht aus dem Dreiecksnetz, und immer in mm angezeigt.

- **Fangen** mit Hover-Vorschau und Fangsymbol: Ecke (Quadrat), Kantenmitte (Dreieck), Kreismittelpunkt (Kreis mit Kreuz), Kante, Fläche, Achse (gestrichelt; Zylinderflächen).
- **Ein Element:** Kantenlänge, Kantenmitte, Ø und R, Bogenwinkel, Bogenlänge, Flächeninhalt, Umfang (gesamt und außen). Rundungen und Bögen zeigen Radius und Bogenlänge hervorgehoben.
- **Blech-Rundung (Ein-Klick):** Radius innen und außen, Biegewinkel, Blechdicke, Bogenlänge innen und außen, Schenkellänge innen und außen (gerader Anteil + R·tan(φ/2), bis zum virtuellen Knickpunkt), Außenmaß über die Biegung (Summe der äußeren Schenkellängen).
- **Zwei Elemente:** Abstand min., max. und Mitte–Mitte, jeweils mit ΔX/ΔY/ΔZ, Winkel Kante–Kante, Fläche–Fläche und Kante–Fläche, paralleler Abstand, Lochabstand Mitte–Mitte.
  - Der maximale Abstand wird über die Randkanten berechnet. Geraden werden über ihre Endpunkte ausgewertet, Kreise analytisch, andere Kurven per Abtastung mit Goldener-Schnitt-Verfeinerung.
  - Für Ebenen, Zylinder und Kegel ist das exakt, weil das Maximum auf dem Rand liegt.
- **Mehrfachauswahl** mit Strg/Umschalt: Gesamtlänge mehrerer Kanten, Gesamtfläche.
- **Bemaßungen** bleiben im 3D stehen. In der Liste lassen sie sich einzeln kopieren oder löschen, oder alle auf einmal.
- **Genauigkeit:** 0 bis 4 Nachkommastellen mit deutschem Komma.

Testsuite: `tools/test-messen.mjs` (läuft in CI). Sie prüft 58 Sollmaße am Messteil `testdaten/messteil.step` (erzeugt mit `tools/make-messteil.py`, CadQuery) und am Testblech mit einer Toleranz von 0,0001 mm. Der Headless-Test `tools/smoke-messen.mjs` erzeugt die Screenshots.

![Fangen](docs/messen-fangen.png) ![Bemaßungen](docs/messen-bemassungen.png) ![Blech-Rundung](docs/messen-blech-rundung.png)

## K-Faktor und Biegetabelle

Im Blech-Panel wird der K-Faktor standardmäßig automatisch je Biegung aus dem Verhältnis Innenradius zu Blechdicke berechnet.

**Quelle der Formel:** DIN 6935:2011-10 „Kaltbiegen von Flacherzeugnissen aus Stahl“, Beiblatt 1 / Ausgleichswert:

- Korrekturfaktor k = 0,65 + 0,5 · lg(ri/s) für ri/s < 5, sonst k = 1
- neutrale Faser bei ri + k·s/2, also K = k/2 (K = 0,5 bei ri/s ≥ 5)
- Ausgleichswert v = φ · (ri + K·s) − 2 · (ri + s) · tan(φ/2) (für φ ≤ 90°; Biegezugabe BZ = v + 2·(ri + s)·tan(φ/2))

Umsetzung: `src/kfaktor.js`. Werkstoffe (Dichte für die Masse): Stahl 7,85, Edelstahl 7,90, Aluminium 2,70, Kupfer 8,96 g/cm³.

**Eigene Biegetabelle (CSV):** Spalten `s;ri;Winkel;v` oder `s;ri;Winkel;K` (Trennzeichen `;`, `,` oder Tab, Dezimalkomma erlaubt, Winkel optional). Passende Zeilen (s ±1 %, ri ±2 %, Winkel ±1°) haben Vorrang vor DIN 6935. Beispiel: `testdaten/biegetabelle-beispiel.csv` (Beispielwerte, keine Herstellerangaben).

![Biegetabelle](docs/blech-biegetabelle.png)

## Abwicklung

Die Abwicklung ist ein Baum über den Flächengraphen einer Blechseite. Sie startet an der größten ebenen Hautfläche und geht nur über tangentiale gerade Kanten weiter: Ebene ↔ Zylinder, Zylinder ↔ Zylinder (Biegung direkt an Biegung) und geteilte ebene Flächen. Dadurch werden Laschen in mehrere Richtungen und Eckfreischnitte unterstützt. Biegungen werden über die neutrale Faser abgewickelt (Biegezugabe nach DIN 6935, Biegetabelle oder manueller K-Faktor).

Statt einer stillschweigend falschen Kontur erscheint eine **rote Warnung**, und der DXF-Export wird gesperrt, wenn mindestens eines davon zutrifft:

- Die Flächenbilanz geht nicht auf: Die abgewickelte neutrale Fläche liegt unter 97 % von Volumen/Blechdicke.
- Es gibt geschlossene Ecken: Kanten zwischen zwei Hautflächen, die außerhalb des Baums in 2D nicht deckungsgleich sind (Eckfreischnitt fehlt).
- Es gibt scharfkantige Biegungen ohne Radius.
- Es gibt nicht abwickelbare Flächen (Kegel, Kugel, Torus, Freiform).
- Die Kontur überschneidet sich selbst.

Testteile (selbst erzeugt mit `tools/make-abwicklung-teile.py`, CadQuery):

- S-Profil (Biegung an Biegung)
- Wanne mit vier Laschen und Eckfreischnitten
- Wanne ohne Eckfreischnitte
- Winkel mit Senkung
- Kuppel

Geprüft durch `tools/test-abwicklung.mjs` (CI, Sollmaße) und `tools/smoke-abwicklung.mjs` (headless).

![Wanne](docs/abwicklung-wanne.png) ![Abwicklung Wanne](docs/abwicklung-wanne-flach.png) ![Warnung](docs/abwicklung-warnung.png)

## Biegetabelle exportieren

Im Blech-Panel stehen die Knöpfe **„Biegetabelle als PDF“** und **„Biegetabelle als Excel (XLSX)“**. Beide sind gesperrt, solange die Abwicklung unvollständig ist.

- **Inhalt:**
  - Kopf: Teil, Datum, Blechdicke, Werkstoff, K-Faktor, Zuschnitt (Länge × Breite), Masse
  - je Biegung: Nr. (Reihenfolge der Abwicklung, keine Biegefolgeplanung), Winkel, Ri, Richtung, Lage der Biegelinie im Zuschnitt (Ursprung linke untere Ecke wie im DXF; im XLSX zusätzlich x1/y1/x2/y2), Biegelänge, BZ, v, K mit Quelle
  - Schenkellängen bis Biegepunkt und gerader Teil, jeweils innen und außen
  - im PDF zusätzlich eine Vorschau der Abwicklung mit nummerierten Biegelinien
- **Format:** PDF A4 quer, deutsch, mit jsPDF + jspdf-autotable (MIT). XLSX mit write-excel-file (MIT); Zahlen werden als Zahlen gespeichert, deutsches Excel zeigt sie mit Komma.
- **Speichern:** In der Desktop-App über den System-Dialog (Rust-Befehl `save_bytes`), im Browser als Download.

Tests: `tools/test-export.mjs` (CI, prüft PDF-Text, XLSX-Inhalt und die Lage der Biegelinien gegen Sollwerte) und `tools/smoke-export.mjs` (headless, Knöpfe im Blech-Panel).

![Export](docs/biegetabelle-export.png) ![PDF](docs/biegetabelle-pdf.png)

## Nativer Kern (Desktop-App, ab feat/nativer-kern)

Die Desktop-App lädt STEP-Dateien mit einem nativen OCCT-Kern (`kern/hasi_kern.cpp`, Programm `hasi-kern`), der als Sidecar neben der App liegt. Der WASM-Kern bleibt als Rückfall (Browser, fehlender Sidecar, Fehler im nativen Lauf) und für das Messen.

- **Ablauf:** STEP parsen → Produktstruktur und Baugruppen-Lagen direkt aus der STEP-Datei (CONTEXT_DEPENDENT_SHAPE_REPRESENTATION) → Blatt-Teile parallel übersetzen, Mehrkörper-Teile je Körper → Unikate parallel tessellieren und indizieren (gleiche Reihenfolge der Flächen/Kanten wie im WASM-Kern).
- **Ausgabe:** `modell.bin` (Netze, Flächen-/Kanteninfo, Baum, Lagen) für die sofortige Anzeige und `modell.brep` (Unikate als BREP). Das BREP wird danach im Hintergrund in den WASM-Kern geladen; Flächen und Kanten eines Teils werden beim ersten Messen indiziert und gegen die nativen Zahlen geprüft. Gemessen wird also weiter mit demselben JS/WASM-Code.
- **Threads:** Das Parsen ist in OCCT nicht threadsicher und läuft nacheinander; bis zu 3 Leser übersetzen parallel, Tessellierung auf allen Kernen.
- **Prüfung:** `hasi-kern <datei> <ordner> --pruefen` vergleicht alle Instanzen (Welt-Bounding-Boxen) mit dem seriellen OCCT-Transfer. Unbekannte Strukturen → serieller Transfer (`--seriell`).
- **Tests:** `KERN=native node tools/test-*.mjs` lädt über den nativen Kern (`kern/build/hasi-kern`); `node tools/smoke-kern.mjs` prüft den nativen Ladepfad im Browser mit simulierten Tauri-Aufrufen.
- **Bauen:** `tools/occt-bauen.sh <ordner>` baut OCCT 7.8.1 ohne Fremdbibliotheken, dann `cmake -S kern -B kern/build -DCMAKE_PREFIX_PATH=<ordner> && cmake --build kern/build`. In CI mit Cache (Schlüssel: OCCT-Version und Betriebssystem); `tools/kern-paket.py` legt Programm und Bibliotheken für Tauri bereit. Windows: DLLs neben `hasi-kern.exe`. macOS universal: Bibliotheken unter `Contents/Resources/kern`, gefunden über `@rpath`/`@loader_path`.
- **Abschalten:** `localStorage.kern = 'wasm'` in der App oder Umgebungsvariable `HASI_KERN=aus`.
