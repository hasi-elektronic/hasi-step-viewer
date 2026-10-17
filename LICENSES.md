# Lizenzen der Komponenten

| Komponente | Version | Lizenz | Quelle |
|---|---|---|---|
| Tauri 2 (tauri, tauri-build, @tauri-apps/cli) | 2.x / CLI 2.12.3 | MIT OR Apache-2.0 | https://github.com/tauri-apps/tauri/blob/dev/LICENSE-MIT , https://github.com/tauri-apps/tauri/blob/dev/LICENSE-APACHE-2.0 |
| three.js | 0.186.1 | MIT | https://github.com/mrdoob/three.js/blob/dev/LICENSE |
| opencascade.js | 1.1.1 | LGPL-2.1-only (package.json, LICENSE) | https://github.com/donalffons/opencascade.js/blob/master/LICENSE |
| Open CASCADE Technology (in opencascade.wasm.wasm) | 7.4/7.5 | LGPL-2.1 mit "Open CASCADE Exception" | https://github.com/Open-Cascade-SAS/OCCT/blob/master/LICENSE_LGPL_21.txt , https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt |
| Vite (nur Build) | 8.x | MIT | https://github.com/vitejs/vite/blob/main/LICENSE |
| playwright-core (nur Test) | 1.64 | Apache-2.0 | https://github.com/microsoft/playwright/blob/main/LICENSE |
| tauri-plugin-dialog | 2.x | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace/blob/v2/LICENSE_MIT |
| Rust-Crates (über Tauri) | – | überwiegend MIT/Apache-2.0; vor Release mit `cargo about`/`cargo deny` prüfen | – |

LGPL-Hinweis: opencascade.wasm.js/.wasm werden unverändert als separate, austauschbare Dateien (`ocjs/`) ausgeliefert und zur Laufzeit dynamisch geladen; der Lizenztext liegt als `ocjs/LICENSE-opencascade.js.txt` bei. Bei Weitergabe: LGPL-Text + Quellverweis mitliefern.

Keine kommerziellen Komponenten (kein CAD Exchanger, HOOPS, Parasolid).

Testdatei: `tools/make-testblech.mjs` erzeugt ein eigenes Testblech (Z-Profil, s = 2 mm, Ri = 3 mm, Bohrung Ø 10) – keine Fremddaten.
