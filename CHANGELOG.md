# Änderungen

## 0.1.7 — Android tablet pilotu (geliştirme)

- Ortak CAD/ölçüm kodunu kullanan Android host; masaüstü OCCT komutları ve dosya yolu varsayımları mobilde devre dışı.
- Tek parmakla serbest döndürme, iki parmakla yakınlaştırma/kaydırma; çok parmak hareketinden sonra yanlış seçim ve ölçü sürükleme engeli.
- Dokunmatik parça ağacı, büyük işlem düğmeleri, dar ekranda modelin altında ölçüm paneli ve görünür hata mesajları.
- Android sistem çubukları, ekran çentiği ve klavye alanı native inset değerleriyle ayrılır; model ve ölçüler ekran yönü/klavye değişiminde korunur.
- Android native kütüphanesi 16 KB sayfa hizalamasıyla bağlanır; gerçek rustc komutu, ELF/RELRO ve APK ZIP hizalaması teslim kapısında denetlenir.
- Büyük montajlarda dokunma bitince kenarlar yeniden gösterilir. Üç gerçek hata varyantını yakalayan CDP dokunma testleri eklendi.
- İki ayrı marka/kimlik için Android test APK derlemesi ve paket içeriği denetimi. Pilot; sistem dışa aktarma, Blech ve dış uygulamadan STEP açma sunmaz.
- macOS kaynak ayarında minimum sürüm 11.0 ile native çekirdeğin gereksinimi eşleştirildi; mevcut 0.1.6 DMG’leri değiştirilmedi.

## 0.1.6

- macOS-Universal-Vorschau für Hasi 3D und MS3D auf [GitHub Releases](https://github.com/hasi-elektronic/hasi-step-viewer/releases/tag/macos-v0.1.6-vorschau). Paket-/Kernkontrollen bestanden; keine vollständige Mac-GUI-/Intel-Laufzeitfreigabe und keine Apple-Notarisierung. Einzelheiten stehen in den veröffentlichten Prüfberichten.
- Mehrere STEP-Dateien gleichzeitig in Dokumentreitern öffnen; Dateiauswahl, Drag & Drop und Programmstart verarbeiten alle ausgewählten Dateien der Reihe nach. Bereits geöffnete Pfade aktivieren ihren Reiter.
- Kamera, Schnitt, Sichtbarkeit, Messungen, Informationsfelder, Bauteillagen und Rückgängig-Verlauf bleiben je Dokument erhalten. Reiterwechsel importiert die Datei nicht erneut. Strg+O öffnet weitere Dateien, Strg+Tab wechselt, Strg+W schließt den aktiven Reiter.
- Automatische Messart aus der exakten CAD-Geometrie: Gerade → Länge, Kreisbogen → Radius/Bogenlänge, geschlossener Kreis → Durchmesser/Radius; passende grafische Bemaßung und sichtbare Erkennungsanzeige. Manuelle Messarten bleiben verfügbar.
- Native Mess-/Export-Geometrie ist je Dokument getrennt und vor Cache-Bereinigung geschützt. Geschlossene Dokumente können nicht durch späte Kernantworten wiederhergestellt werden; Export hält seine eigene Geometrie-Referenz.
- Beim Schließen werden Dokument-Worker und zugehörige GPU-Ressourcen freigegeben; alle Reiter nutzen denselben Renderer.

## 0.1.5

- Informationsfelder merken Abstand/Normalabstand, Achsanteile, Winkel, Kreis- und Flächenwerte direkt am Modell. Flächenpaare können zusätzlich zwei eigene Karten mit Fläche und Umfang erhalten. Karten sind verschiebbar, werden in der Begleitdatei gespeichert, neu gemessen und vollständig ins Messprotokoll übernommen.

- Größere Baugruppen-Pfeile mit klarer Auf-/Zu-Anzeige und Tastaturbedienung; vergrößerte Datei-Schließen-Taste, modernisierte Tabs und Dialoge.
- Über steht für beide Marken rechts oben und zeigt die echte Programmversion, Manfred Sickinger GmbH, Hasi Elektronic und Hamdi Güncavdi.
- Einstellungen wirken sofort und bleiben gespeichert: Mausradrichtung und -tempo, Drehtempo, Bildauflösung, Hintergrund, Baumdichte, STEP-Farben und Mess-Nachkommastellen.
- Mausrad standardmäßig umgekehrt: nach unten näher, nach oben weiter. Die Richtung ist umschaltbar; der Punkt unter dem Cursor bleibt stehen.
- M aktiviert Messen und wechselt aus Navigationswerkzeugen zurück zur Auswahl. Textfelder und modale Dialoge sind von CAD-Kürzeln ausgenommen.
- Redundante Frei-drehen-Schaltflächen entfernt; die mittlere Maustaste dreht weiterhin frei.

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
