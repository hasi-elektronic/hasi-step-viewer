# Änderungen

## 0.1.1

- Windows: native Dateidrops im Haupt- und Einzelteil-Fenster verarbeiten; Dateiaufträge während des Seitenstarts bleiben erhalten.
- Alle Desktop-Öffnungswege verwenden denselben pfadbasierten Ladeweg mit Zwischenspeicher.
- Unicode-Dateipfade bleiben beim nativen STEP-Import und -Export erhalten, einschließlich Umlauten, ß und türkischen oder asiatischen Zeichen.
- Dateiwechsel warten auf die zugehörigen Messdaten. Doppelte gleichzeitige Ereignisse öffnen eine Datei nur einmal; wartende Wechsel werden auf den neuesten reduziert.
- HTML5-Dateidrops funktionieren im gesamten Fenster und öffnen unterstützte STEP-/STP-Dateien auch neben anderen abgelegten Dateien.
- Regressionstests für Unicode-Import/Export, Dateiauswahl, OS-Aufträge und Dateiwechsel ergänzt.
