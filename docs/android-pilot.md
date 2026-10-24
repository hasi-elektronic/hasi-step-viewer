# Android tablet pilotu — 0.1.7

Bu dal Hasi 3D ve MS3D için Android tablet denemesidir. Tam üretim veya fiziksel tablet performans onayı değildir. iOS derlemesi/testi bu aşamaya dahil değildir. Masaüstü uygulamasının aynı renderer, STEP sekmeleri ve B-Rep ölçüm motoru kullanılır; Android host yerel WASM worker çalıştırır.

Desteklenen akış: uygulamanın dosya düğmesinden STEP/STP seçme, birden çok belge, parça görünürlüğü/izolasyonu, kesit, Auto ve manuel ölçümler, oturum içinde ölçü/kart tutma. Tek parmak döndürür; iki parmak yakınlaştırır ve kaydırır; kısa dokunuş seçer. Dar ekranda ölçüm paneli modelin altına geçer. Kapatılan ölçüler/sekme oturumu dosyaya yazılmaz.

Pilot sınırları: işletim sistemine kaydetme/PNG/PDF/STEP dışa aktarma, yazdırma, Blech, parça taşıma ve ayrı işletim sistemi pencereleri kapalıdır. Dış uygulamadan dosya açma/paylaşma intentleri ilan edilmez. STEP renklerinin native OCCT okuması mobilde bulunmaz. Büyük montaj süresi ve bellek tüketimi gerçek cihazlarda ayrıca ölçülmelidir.

Bilinen açık P2: Android 16 / 16 KB emülatöründe yaklaşık 3 GB guest bellek/2 core koşusunda, dosya seçicisi açıkken Android WebView renderer'ını `LOW_MEMORY` nedeniyle sonlandırdı; işlenmeyen renderer kaybı ana uygulamayı da bitirdi. 4 GB/4 core tek emülatör tekrarında da aynı düşük bellek çıkışı kaydedildi. Açık oturum kaybolabilir; güvenli renderer kurtarma henüz yoktur. Bu bir linker hatası değildir. Başka bir bellek veya işletim sistemi koşusunun başarılı olması bu bulguyu kapatmaz ve fiziksel cihazlar için RAM alt sınırı kanıtlamaz. Genel Android üretim onayından önce renderer kaybı/kurtarma ve gerçek cihaz bellek testleri ayrıca gereklidir.

Android 15 / 16 KB / 4 GB / x86_64 / WebView 124.0.6367.219 koşusunda Hasi ana işlev testi (gerçek dosya seçicisi, çevrimdışı ölçüm, üç sekme, 512 gövde) geçti. Ardından native inset matrisinin ilk koşusu tamamlanmadan WebView `MemoryInfra` thread'i `SIGSEGV` ve ana süreç `SIGTRAP` ile Google Trichrome `libmonochrome_64.so` içinde çöktü. Bu koşu `LOW_MEMORY` olarak sınıflandırılmaz ve başarılı 16 KB yerleşim testi sayılmaz. Crash stack bileşeni gösterir; hatayı tetikleyen tam kök neden henüz ayrıştırılmadı. Bu bulgu da fiziksel cihaz doğrulaması ve WebView sürümüyle ayrıca incelenmelidir.

Aynı Android 15 ortamında MS3D ana işlev koşusu da 512 gövdeli dosyayı açarken aynı `MemoryInfra` renderer `SIGSEGV` / ana süreç `SIGTRAP` dizisiyle başarısız oldu. MS3D için 16 KB ana işlev veya inset kabulü verilmedi. Her iki markanın Android 16 / 4 KB emülatöründeki ana işlev ve 4/4 native inset sonuçları ayrı, başarılı kanıtlardır; bu sonuçlar 16 KB hatalarını kapatmaz. Kontrollü DEBUG cihaz denemesi dışındaki genel Android ve üretim kabulü engellidir.

## Mimari

- `src-tauri/src/lib.rs` ortak giriş; `desktop.rs` mevcut masaüstü davranışını korur; `mobile.rs` yalnız host yeteneklerini bildirir.
- `src/platform.js` açık host sözleşmesini doğrular. Android hiçbir zaman masaüstü komutlarına geri düşmez.
- Android sistem dosya seçicisi WebView `File` nesnesi döndürür; `content://` URI bir Windows/Linux dosya yolu gibi kullanılmaz. MIME tanımayan sağlayıcılar için seçim filtresi açık, uzantı kontrolü uygulamadadır.
- `src/pointer-gesture.js` çok parmak hareketini son parmak kalkana kadar seçimden ayırır. TrackballControls sonlandırması olay dağıtımı tamamlandıktan sonra ele alınır.
- `src-tauri/android/MainActivity.kt.in` Android sistem çubukları, ekran çentiği ve klavyenin kapladığı alanı gerçek native inset değerlerinden ayırır. İşlenen değerler WebView'e sıfırlanarak iletilir; CSS ile çift boşluk uygulanmaz.
- Üretilen Android projesi Git’e girmez. `tools/android-projekt.mjs` iki markanın generated projesini ayrı tutar; gerçek yol, marker, Gradle namespace/applicationId ve config eşleşmesini doğrular. API36 ve Gradle9.6.1 dağıtım SHA256 değeri sabittir.

## Tekrarlanabilir derleme

CI: `.github/workflows/android-pilot.yml`; iki marka için ayrı Ubuntu24.04 checkout, Node20, Rust1.99.0, JDK21, NDK27.2.12479018, SDK36. Her marka ARM64 ve x86_64 **debug** APK üretir. Debug imzası mağaza/üretim imzası değildir; CI'nin her yeni anahtarı eski test APK üzerine güncelleme sağlamayabilir.

`src-tauri/build.rs`, yalnız final Android cdylib için 16 KB `max-page-size` ve `common-page-size` linker ayarlarını Cargo direktifleriyle uygular. Masaüstü hedeflerinin ve bütün statik bağımlılıkların RUSTFLAGS değerleri değişmez. Paket kabulü gerçek verbose rustc komutundaki iki flag'i, bütün native LOAD/RELRO segmentlerini ve `zipalign -c -P 16 4` sonucunu doğrular. Kaynak: [Android 16 KB rehberi](https://developer.android.com/guide/practices/page-sizes). Statik hizalama kontrolü gerçek 16 KB çekirdekli cihazda çalışma testi yerine geçmez.

Linux/macOS geliştirme ortamında Hasi:

```sh
npm ci
export MARKE=hasi MOBIL=1
export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
node tools/android-projekt.mjs "$MARKE"
export ANDROID_NATIVE_BUILD_LOG=/tmp/hasi-android-native-build.log
set -o pipefail
npx tauri android build --debug --apk --split-per-abi --target aarch64 x86_64 --config src-tauri/tauri.mobile-hasi.conf.json --ci -- --locked --verbose 2>&1 | tee "$ANDROID_NATIVE_BUILD_LOG"
node tools/check-android-apk.mjs "$MARKE" output/android
```

MS3D için `MARKE=sickinger`; CLI config sırası: önce `src-tauri/tauri.sickinger.conf.json`, sonra `src-tauri/tauri.mobile-sickinger.conf.json`.

Windows’ta Tauri CLI native `.so` için symlink oluşturur. Developer Mode kapalıysa paketleme bu aşamada başarısız olabilir. Sistem güvenlik ayarlarını otomatik değiştirmeyin. Sadece doğrulama için derlenmiş `.so` kopyası ve Gradle Rust görevini atlama kullanılabilir; bu, resmi CLI derlemesine eşdeğer veya teslim paketi kabul edilmez. Kaynak/config değiştiğinde eski `.so` yeniden kullanılamaz.

## Doğrulama ve kabul

```sh
node tools/test-platform.mjs
node tools/test-pointer-gesture.mjs
node tools/make-navigation-fixture.mjs /tmp/hasi-navigation.step 512
MOBIL=1 npm run dev -- --port 5181 --strictPort
# Başka terminal:
LARGE_STEP=/tmp/hasi-navigation.step node tools/smoke-touch.mjs
LARGE_STEP=/tmp/hasi-navigation.step node tools/test-touch-negative.mjs
```

Gerçek Chromium touch olaylarıyla R5/Ø10/L95, iki parmak bırakma sıraları, ölçü üzerinde ikinci parmak, cancel sonrası seçim/orbit/pinch, değişmeyen parça matrisleri, 512 gövdede gerçek kenar görünürlüğü, dar ekran, yanlış dosya ve sekmeler sınanır. Negatif kontroller ilgili korumayı kaldırıp tam beklenen assertion’ın başarısız olmasını ister.

APK kabulünde ayrıca sistem dosya seçicisi, çevrimdışı açılış ve ölçüm, paket içindeki WASM SHA256, identifier/sürüm/SDK/ABI/imza ve kaynak `.so` eşitliği denetlenir. Emulator sonucu fiziksel tablet veya ARM64 çalışma kanıtı değildir. macOS GUI ve önceki Windows CI/CDP sorunu bağımsız açık doğrulama konularıdır.
