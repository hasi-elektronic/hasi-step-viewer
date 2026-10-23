# Änderungen

## 0.1.4

- Messen mit gezielter Messartwahl und Schnellzugriff: Radius, Durchmesser, Bogenlänge, Sehne, Bogenhöhe, Kantenlänge, Abstand, Winkel, Fläche, Umfang und Körperwerte.
- Kreisbogendaten kommen aus der B-Rep: tatsächlicher Sweep auch über 180°, Kreissektor- und Kreissegmentfläche; volle Kreise erhalten keine willkürliche Sehne/Bogenhöhe.
- Drei definierte Punkte bestimmen einen Winkel (zweiter Punkt = Scheitel) oder einen Kreis mit Radius, Durchmesser und Mittelpunkt. Degenerierte Kreise werden abgewiesen.
- Summenmodus addiert bereits zwei Kanten oder zwei Flächen; erneuter Klick entfernt ein Element. Fangarten folgen vorübergehend der Messart, gespeicherte Fangoptionen bleiben erhalten.
- Späte Messantworten können neue Auswahl, neue Messart oder Esc nicht mehr überschreiben. Frühe Auswahl wartet auf die nativen BREP-Messdaten.
- Bemaßungen übernehmen dieselbe Kreis-/Winkelgeometrie wie das Ergebnis; 180°-Winkel bleiben stabil. Nicht grafisch bemaßbare Ergebnisse bleiben über Kopieren und Messprotokoll verfügbar.
- Wheel-Zoom beendet Autodrehen. Desktop-Entwicklung verwendet den vorbereiteten Messkern aus public statt ein vorhandenes dist vorauszusetzen.
- CI bindet Paketierung an die Tests, prüft NSIS/MSI/DMG separat und testet die neuen Messarten auch im Windows-WebView2 sowie mit einer synthetischen Baugruppe aus 512 Körpern.

## 0.1.3

- Zoom per Rad und Zoom-Werkzeug behält auch bei großen Baugruppen alle Kantenlinien. Ein Zoom während des Drehens stellt die volle Detaildarstellung sofort her.
- Unvollständig geschriebene Brotli-Assets nach einem abgebrochenen Build werden vor der Wiederverwendung geprüft und neu erzeugt.
- Der paketierte WASM-Messkern wird aus der gebauten Programmdatei entpackt und mit SHA256 gegen die Quelle geprüft; Installer-Tests unter Windows und macOS führen diese Prüfung aus.
- Ungültige WASM-Antworten erhalten eine verständliche Fehlermeldung; ein erneuter Start nach einem Ladefehler ist möglich.

## 0.1.2

- Freies Drehen mit Trackball-Navigation: keine feste Hochachse und kein Anschlag an den Polen; Rückseite und Unterseite lassen sich mit der Maus erreichen.
- Der Hauptknopf „Frei drehen“ aktiviert die linke Maustaste für die Ansicht. „Autodrehen“ bleibt als eigener Menüpunkt unter Werkzeuge erhalten.
- Mitte ziehen dreht jederzeit frei; Strg/Umschalt+Mitte und Rechts schwenken, das Rad zoomt zum Cursor. Kein Nachlauf nach dem Loslassen.
- Regressionstest für Polüberquerung, Rückseite, unveränderte Bauteillagen und den Zoomanker ergänzt.
- Große Baugruppen zeichnen während der Mausnavigation vorübergehend ohne zusätzliche Kantenlinien; nach dem Loslassen kehrt die volle Darstellung zurück. Drahtdarstellung behält ihre Kanten.

## 0.1.1

- Windows: native Dateidrops im Haupt- und Einzelteil-Fenster verarbeiten; Dateiaufträge während des Seitenstarts bleiben erhalten.
- Alle Desktop-Öffnungswege verwenden denselben pfadbasierten Ladeweg mit Zwischenspeicher.
- Unicode-Dateipfade bleiben beim nativen STEP-Import und -Export erhalten, einschließlich Umlauten, ß und türkischen oder asiatischen Zeichen.
- Dateiwechsel warten auf die zugehörigen Messdaten. Doppelte gleichzeitige Ereignisse öffnen eine Datei nur einmal; wartende Wechsel werden auf den neuesten reduziert.
- HTML5-Dateidrops funktionieren im gesamten Fenster und öffnen unterstützte STEP-/STP-Dateien auch neben anderen abgelegten Dateien.
- Regressionstests für Unicode-Import/Export, Dateiauswahl, OS-Aufträge und Dateiwechsel ergänzt.
