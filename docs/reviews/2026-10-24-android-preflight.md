# Android pilotu — derleme öncesi bağımsız denetim

24.10.2026. Uygulama girdileri: `3df75447fcdb7a773cdd81a5e879296023ee2d32`; paket/yol denetimi düzeltmesi: `15798fa3425d89069c4615513816ac854735ced5`; native kabul testi: `662d3ac7b44dc561af935f5ca0f03c96718566d7`. Karşılaştırma tabanı: `ef88b8f0c3c535c5cdd00516816c6844e8eebb3e`.

Üç denetçi salt okunur çalıştı; kaynak değiştirmedi, derleme/test çalıştırmadı. Ana ajan düzeltmeleri uygulayıp testleri çalıştırdı. Onay **iki marka için resmî Ubuntu Tauri CLI ile ARM64/x86_64 debug doğrulama APK’ları üretmek** içindir; üretim veya fiziksel tablet teslim onayı değildir.

| Rol | Karar ve incelenen kapsam |
|---|---|
| `hasi_code_reviewer` | `3df7544` uygun: host/module ayrımı, desktop komut sınırı, WASM dosya yolu, pointer sahipliği, çoklu dokunma ve timer ile final touch-end. Açık P0/P1 veya ilgili engelleyici P2 yok. |
| `hasi_qa_reviewer` | `3df7544` debug build için uygun: gerçek CDP dokunma testi, label/cancel durumları, görünür kenarlar ve tam beklenen assertion’la başarısız olan üç negatif varyant. Paket/native kabulü ayrıca gerekli. |
| `hasi_release_reviewer` | `15798fa` uygun: temiz marka başına Ubuntu job, kilitli SDK/NDK/Gradle checksum, CLI argümanları ve actual APK denetimi. Önceki iki P2 düzeltmesi yeniden incelendi. |

Kapanan bulgular: Rust root command macro çakışması (`host.rs`), mobilde gizlenen durum mesajı, dinamik menüde açık kalan pilot dışı işlemler, generated proje marker/identifier doğrulaması, Linux’ta harf duyarlı gerçek yol kontrolü, iki ABI’nin zorunlu tutulması ve ELF machine kontrolü. Gerçek touch testinin yakaladığı kenar geri gelmeme hatası `queueMicrotask` yerine olay dağıtımından sonraki task ile kapandı.

Derleme öncesi ana ajan sonuçları: Windows Rust16 test geçti; masaüstü `smoke-messarten` ve `smoke-dokumente`/async geçti; mobil browser Auto R5/Ø10/L95, orbit/pinch/pan, iki bırakma sırası, label/cancel, değişmeyen parça matrisleri, 512 gövdede kenar geri gelmesi, portrait paneli, dosya hatası ve sekmeler geçti. Üç negatif kontrol ilgili hatayı ayrı ayrı yakaladı.

Geçici Windows doğrulaması: Android Rust `.so` derlendi; resmî CLI symlink izni nedeniyle paketleme aşamasında durdu. Aynı `.so` kopyasıyla Gradle debug paketi, yalnız doğrulama için oluşturuldu. Bu eski çalışma ağacı paketinde Android sistem seçicisi, çevrimdışı WASM R5/Ø10/L95, orbit/pinch ve iki sekme çalıştı; WASM65.864.037 bayt ve SHA256 `6cc2f3fa1611d32ad7563f7092aa1bf58741124302630cef7d21561ecd7b7284`. Bu sonuç yeni CI paketine taşınmayacak.

Paket sonrası plan: iki marka/iki ABI actual APK metadata, sürüm/identifier/SDK/imza, tek ELF ve kaynak `.so` hash eşitliği; CI’dan indirilen x86_64 APK hashına bağlanmış gerçek Android WebView testleri, sistem picker/content URI, iptal/bozuk dosya, görünürlük/izolasyon, ölçüm ve dokunma. ARM64 fiziksel çalışma, iOS, macOS GUI ve önceki Windows CI/CDP problemi ayrı açık kapsamdır. Hiçbir müşteri CAD dosyası yüklenmez.

## Android sistem çubukları düzeltmesi için yenilenen kapı

İncelenen taban `073cefd696419ac5d89a35eab6ff8ecc038e33aa` + yeni `src-tauri/android/MainActivity.kt.in` ve `tools/android-projekt.mjs` deltası. Şablon SHA256: `2806d8f2dbb30085bc2513d3b905f22ee0a093153a1140d27cb0eb211ead1155` (Windows çalışma kopyası; Git satır sonlarını normalleştirebilir). App renderer/Rust değişmedi. Önceki run `40085471286` işlevsel testleri geçti ancak native ekran görüntüsünde sistem çubuğu çakışması bulundu; o paketler teslim adayı olmaktan çıkarıldı.

Üç bağımsız denetçi bu dar düzeltmeyi resmî iki marka/iki ABI DEBUG doğrulama derlemesi için uygun buldu. Release denetçisinin eski API IME uyumluluğu için istediği `SOFT_INPUT_ADJUST_RESIZE` eklendi ve yeniden onaylandı. Root container gerçek systemBars/cutout/IME inset'lerini bir kez uygular; işlenen değerler WebView'e sıfırlanarak iletilir. `CONSUMED` kullanılmaz.

Yeni paket kabulü: native ADB compositor görüntüsü (CDP PNG, WebGL katmanını atlayabiliyor); ADB üst Open ve alt Messen dokunmaları; yatay/dikey ekran, gesture/üç düğmeli navigation, klavye aç/kapat ve başlangıç bounds değerine dönüş. Resmî APK hashına bağlı çevrimdışı R5/Ø10/L95, sekmeler, sistem picker ve 512 gövde testi yeni pakette tekrarlanacak. Bu kayıt paket sonrası kabul yerine geçmez.
