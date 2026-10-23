# İlk bağımsız ekip denetimi — 23.10.2026

İncelenen uygulama commit'i: `97779ad0fdef56baec8decff0d343681fea032d0` (0.1.3). Üç ayrı alt ajan salt okunur çalıştı; uygulama kodu değiştirilmedi, kurulum veya derleme başlatılmadı. Bu kayıt ajan iş akışının kurulmasına aittir; aşağıdaki bulguların düzeltildiği anlamına gelmez.

## Doğrulananlar

- İki yerel 0.1.3 NSIS paketinin SHA256 değerleri teslim manifestiyle eşleşiyor.
- İki çıkarılmış programda `--pruefe-messkern` yeniden çalıştırıldı: 65.864.037 bayt WASM ve `6cc2f3fa1611d32ad7563f7092aa1bf58741124302630cef7d21561ecd7b7284` SHA256 ile geçti.
- Sürüm ve marka/kimlik bilgileri tutarlı. Bu denetimde mevcut paketin bozuk olduğuna ilişkin kanıt bulunmadı.

## Açık somut kod kusurları

| Kimlik | Önem | Kanıt | Tetikleyici ve etki |
| --- | --- | --- | --- |
| CODE-01 | P2 | `src/navigation.js:27`, `src/main.js:1055` | Capture wheel dinleyicisi `stopImmediatePropagation()` ile sonraki dinleyiciyi engelliyor. Autodrehen açıkken wheel zoom otomatik dönüşü kapatmıyor. Wheel ile durma regresyon testi eklenmeli. |
| CODE-02 | P2 | `src-tauri/build.rs:25`, `src-tauri/tauri.conf.json:9`, `README.md` | Temiz checkout'ta `npm ci` ardından `npm run tauri dev` yalnız public dosyalarını üretirken build.rs koşulsuz dist WASM okuyor. Belgelenen geliştirme başlangıcı bozuluyor. Release bütünlük kontrolü korunarak geliştirme yolu ayrılmalı. |

## Zorunlu kontrol kapsamındaki açıklar

| Kimlik | Önem | Kanıt | Eksik doğrulama |
| --- | --- | --- | --- |
| QA-01 | P1 | `tools/bench-navigation.mjs`, `.github/workflows/release.yml` | En az 500 gövdeli zoom/detay yolu CI'da çağrılmıyor. Sentetik büyük montajla zorunlu test gerekli. |
| QA-02 | P1 | `tools/smoke-desktop-messen.mjs`, `tools/test-messkern-paket.mjs` | Paket hash kontrolü var; paketli WebView2 + worker + bilinen ölçüm zinciri CI teslim kapısı değil. Önceki yerel test ile zorunlu CI kapısı birbirine karıştırılmamalı. |
| QA-03 | P2 | `tools/smoke-desktop-messen.mjs:19`, `src/main.js:265` | İlk görüntüden hemen sonra ölçüm seçimi denenmiyor; test BREP hazırlığını bekliyor. Bu test boşluğudur, kanıtlanmış runtime kusuru değildir. |
| QA-04 | P2 | `tools/smoke-drop.mjs`, `tools/smoke-datei-oeffnen.mjs` | DOM/mock bırakma testleri gerçek Windows OS olay zincirini kanıtlamıyor. Fiziksel Explorer bırakma kontrolü ayrı kalmalı. |
| QA-05 | P2 | `tools/bench-navigation.mjs` | Frame süreleri raporlanıyor ancak kontrollü donanımda göreli performans gerilemesi kapısı yok. Genel yazılım renderer'ına mutlak 60 FPS şartı konmamalı. |
| REL-01 | P1 | `.github/workflows/release.yml:246`, `:469` | Build işi test/kern işlerine bağımlı değil; genel testler başarısızken artefakt üretilebilir. Ön kontrol ve teslim bağımlılıkları kurulmalı. |
| REL-02 | P2 | `.github/workflows/release.yml:411`, `:427` | CI WASM kontrolü MSI'dan çıkarılan uygulamada, NSIS için yalnız liste kontrolü var. Her teslim formatı kendi içinden doğrulanmalı; DMG içindeki uygulama da ayrıca sınanmalı. |

## Karar ve sınırlar

- Yeni üretim derlemesi bu görevde istenmedi ve başlatılmadı. Sonraki uygulama/teslim çalışması öncesinde ilgili açık kusurlar ve zorunlu kontrol kapıları ele alınmalı, üç rol yeniden rapor vermeli.
- Kod denetçisi kritik/P1 runtime kusuru bulmadı; P1 maddeleri test/teslim kapsamı riskleridir.
- Bu denetimde yeni GUI veya fiziksel mouse testi yapılmadı. Yerel paket bütünlük testi gerçek masaüstü kullanıcı akışının yerine geçmez.
- Son canlı CI gözleminde `39934637969` çalışmasının test, kern, iki Windows ve macOS Sickinger işleri başarılıydı; macOS Hasi hâlâ sürüyordu. Bu anlık gözlem tamamlanmış tüm platform onayı değildir.
