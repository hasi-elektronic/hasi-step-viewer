# Lizenzen der Komponenten

| Komponente | Version | Lizenz | Quelle |
|---|---|---|---|
| Tauri 2 (tauri, tauri-build, @tauri-apps/cli) | 2.x / CLI 2.12.3 | MIT OR Apache-2.0 | https://github.com/tauri-apps/tauri/blob/dev/LICENSE-MIT , https://github.com/tauri-apps/tauri/blob/dev/LICENSE-APACHE-2.0 |
| three.js | 0.186.1 | MIT | https://github.com/mrdoob/three.js/blob/dev/LICENSE |
| opencascade.js | 1.1.1 | LGPL-2.1-only (package.json, LICENSE) | https://github.com/donalffons/opencascade.js/blob/master/LICENSE |
| Open CASCADE Technology (in opencascade.wasm.wasm) | 7.4/7.5 | LGPL-2.1 mit "Open CASCADE Exception" | https://github.com/Open-Cascade-SAS/OCCT/blob/master/LICENSE_LGPL_21.txt , https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt |
| Vite (nur Build) | 8.x | MIT | https://github.com/vitejs/vite/blob/main/LICENSE |
| playwright-core (nur Test) | 1.64 | Apache-2.0 | https://github.com/microsoft/playwright/blob/main/LICENSE |
| CadQuery (nur Entwicklerwerkzeug für Testdaten, nicht ausgeliefert) | 2.8 | Apache-2.0 | https://github.com/CadQuery/cadquery/blob/master/LICENSE |
| tauri-plugin-dialog | 2.x | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace/blob/v2/LICENSE_MIT |
| jsPDF (PDF-Export der Biegetabelle) | 4.2.1 | MIT | https://github.com/parallax/jsPDF/blob/master/LICENSE |
| jspdf-autotable (Tabellen im PDF) | 5.0.9 | MIT | https://github.com/simonbengtsson/jsPDF-AutoTable/blob/master/LICENSE.txt |
| write-excel-file (XLSX-Export der Biegetabelle) | 4.1.1 | MIT | https://gitlab.com/catamphetamine/write-excel-file/-/blob/master/LICENSE |
| fflate (Abhängigkeit von jsPDF/write-excel-file) | 0.8.3 | MIT | https://github.com/101arrowz/fflate/blob/master/LICENSE |
| fast-png, iobuffer (Abhängigkeit von jsPDF) | 6.4.0 / 5.4.0 | MIT | https://github.com/image-js/fast-png/blob/main/LICENSE , https://github.com/image-js/iobuffer/blob/main/LICENSE |
| Optionale jsPDF-Abhängigkeiten (werden mitgebündelt, aber nicht verwendet): html2canvas 1.4.1, canvg 3.0.11, core-js 3.50.0, raf 3.4.1, performance-now 2.1.0, regenerator-runtime 0.13.11, stackblur-canvas 2.7.0, svg-pathdata 6.0.3, rgbcolor 1.0.1, css-line-break 2.1.0, text-segmentation 1.0.3, utrie 1.0.2, base64-arraybuffer 1.0.2, @babel/runtime 7.29.10 | – | MIT (rgbcolor: „MIT OR SEE LICENSE IN FEEL-FREE.md“, LICENSE.md = MIT-Text) | jeweilige Repositories (npm) |
| DOMPurify (optionale jsPDF-Abhängigkeit) | 3.4.17 | MPL-2.0 OR Apache-2.0 – genutzt unter Apache-2.0 | https://github.com/cure53/DOMPurify/blob/main/LICENSE |
| pako (über canvg/jsPDF) | 2.2.0 | MIT AND Zlib | https://github.com/nodeca/pako/blob/master/LICENSE |
| Rust-Crates (über Tauri) | – | überwiegend MIT/Apache-2.0; vor Release mit `cargo about`/`cargo deny` prüfen | – |

LGPL-Hinweis: opencascade.wasm.js/.wasm werden unverändert als separate, austauschbare Dateien (`ocjs/`) ausgeliefert und zur Laufzeit dynamisch geladen; der Lizenztext liegt als `ocjs/LICENSE-opencascade.js.txt` bei. Bei Weitergabe: LGPL-Text + Quellverweis mitliefern.

Keine kommerziellen Komponenten (kein CAD Exchanger, HOOPS, Parasolid).

Testdatei: `tools/make-testblech.mjs` erzeugt ein eigenes Testblech (Z-Profil, s = 2 mm, Ri = 3 mm, Bohrung Ø 10) – keine Fremddaten.

Test-Baugruppe `testdaten/testbaugruppe.step`: selbst erzeugt mit `tools/make-testbaugruppe.py` – keine Fremddaten.

Lizenzprüfung der npm-Laufzeitabhängigkeiten (18.10.2026): `npx license-checker --production` – alle MIT, MIT AND Zlib, MPL-2.0 OR Apache-2.0 oder LGPL-2.1 (opencascade.js); keine GPL/AGPL, keine kommerziellen Lizenzen.

Testteile für Abwicklung und Messen (`testdaten/*.step`): selbst erzeugt mit `tools/make-abwicklung-teile.py`, `tools/make-messteil.py`, `tools/make-testblech-cm.py` – keine Fremddaten.
