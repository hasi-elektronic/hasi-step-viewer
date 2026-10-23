# Änderungen

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
