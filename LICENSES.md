# Lizenzen der Komponenten

| Komponente | Version | Lizenz | Quelle |
|---|---|---|---|
| Tauri 2 (tauri, tauri-build, @tauri-apps/cli) | 2.x / CLI 2.12.3 | MIT OR Apache-2.0 | https://github.com/tauri-apps/tauri/blob/dev/LICENSE-MIT , https://github.com/tauri-apps/tauri/blob/dev/LICENSE-APACHE-2.0 |
| three.js | 0.186.1 | MIT | https://github.com/mrdoob/three.js/blob/dev/LICENSE |
| occt-import-js | 0.0.23 | LGPL-2.1 (package.json + dist/license.occt-import-js.txt) | https://github.com/kovacsv/occt-import-js/blob/main/LICENSE.md |
| Open CASCADE Technology (in occt-import-js.wasm) | 7.x | LGPL-2.1 mit "Open CASCADE Exception" (dist/license.occt.txt) | https://github.com/Open-Cascade-SAS/OCCT/blob/master/LICENSE_LGPL_21.txt , https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt |
| Vite (nur Build) | 8.x | MIT | https://github.com/vitejs/vite/blob/main/LICENSE |
| playwright-core (nur Test) | 1.64 | Apache-2.0 | https://github.com/microsoft/playwright/blob/main/LICENSE |
| Rust-Crates (über Tauri) | – | überwiegend MIT/Apache-2.0; vor Release mit `cargo about`/`cargo deny` prüfen | – |

LGPL-Hinweis: occt-import-js.wasm wird als separate, austauschbare Datei (`public/occt/`) ausgeliefert und dynamisch geladen; Lizenztexte liegen bei (`public/occt/`). Bei Weitergabe: LGPL-Text + Quellverweis mitliefern.

Keine kommerziellen Komponenten (kein CAD Exchanger, HOOPS, Parasolid).

Testdatei `as1-oc-214.stp`: CAx-IF-Testmodell, übernommen aus https://github.com/kovacsv/occt-import-js/tree/main/test/testfiles/cax-if ; keine eigene Lizenzdatei für das Modell – nur intern testen, nicht mitverteilen.
