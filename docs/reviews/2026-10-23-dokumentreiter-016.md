# Dokumentreiter und automatische Messung 0.1.6

Taban: `4bfb6233b7c3ae2e70cac3c219985dc0342a0a6d`. Bu kayıt commit öncesindeki 0.1.6 çalışma ağacını kapsar. Uygulama commit'i ve gerçek paket hashleri dış teslim manifestinde sabitlenir.

## Mimari ve davranış

Tek renderer kullanılır. Her sekme kendi modelini, kamera/ölçüm/görünürlük/kesit/undo durumunu, worker'ını ve native belge kimliğini korur. Geçiş bekleyen belge işlemlerini tamamlar; kapatma yalnız ilgili belgenin kaynaklarını bırakır. Her sekmenin kendi WASM worker'ı olduğundan açık belge sayısıyla bellek tüketimi artar. Çoklu açma kuyruğu, klavye gezinmesi ve son sekmeyi kapatıp yeniden açma desteklenir.

Auto, mevcut gerçek BREP türünden radius/çap/kenar uzunluğu/yüzey/mesafe/açı seçer. Eğrilere tahmini daire uydurmaz. Açık Maßrichtung seçimi Auto mesafede korunur. Native export belge kimliğiyle doğru BREP'e bağlanır; aynı pencerede tek export yapılır.

## Bağımsız kaynak incelemeleri

`hasi_code_reviewer`, `hasi_qa_reviewer`, `hasi_release_reviewer` salt okunur inceleme yaptı. Ana ajan düzeltmeleri uyguladı. Üç rolün son kaynak kararı UYGUN; açık P0/P1 veya istenen davranışı bozan ilgili P2 yok.

Bulunup düzeltilenler: renk geometri kaynaklarının bırakılması, geç başlayan folding RAF'ın iptali, native belge oluşturulurken H/V/A kısayollarının eski belgeye işlemesi, Blech otomatik hesabının BREP hazır olmadan başlaması, Auto'nun açık ölçü yönünü ezmesi. Son ilgili değişiklikler tekrar incelendi.

## Doğrulama

- Rust `cargo test --locked`: 16 test geçti. Ortam değişkeni isteyen bazı testlerin erken dönüşü gerçek native export kanıtı sayılmaz.
- Açma kuyruğu, Auto ve mevcut ölçü testleri; ayarlar, bilgi kartları, dil ve toolbar kontrolleri geçti. Frontend doğrulama derlemeleri geçti; mevcut büyük bundle uyarısı sürüyor.
- Gerçek browser pointer olaylarıyla R5/Ø10/L95 ve ölçülendirme; altı belge, kamera/ölçü/kesit/visibility/undo izolasyonu, dinamik ağaç eventleri, hata sonrası geri dönüş, kısayollar, kapat/yeniden aç geçti.
- Gerçek worker komutlarını geciktiren testlerle ölçüm/geçiş, Info/kapatma, yükleme/kapatma, STEP export/geçiş, folding/geçiş ve ilk otomatik Blech hesabı geçti. Son sekme sonrası worker referansları ve renderer geometri sayısı sıfırlandı; bu OS bellek ölçümü değildir.
- H kilidi kaldırılan yalnız test yanıtında negatif regresyon denemesi beklenen assertion ile başarısız oldu; normal kaynak aynı testi geçti.
- Mevcut ölçülendirme, yüzey, montaj, Einzelteil, Faz1, triad/Esc/yükseklik ve Faz2 akışları geçti. Yükseklik380/yatay60 assertionları değiştirilmeden korundu.

## Gerçek paket test planı ve sınırlar

Bu kayıt henüz oluşturulmamış paketi geçmiş saymaz. Aynı sabit kaynaktan iki Windows x64 NSIS üretilir; paket içinden çıkarılan EXE/core/DLL/WASM hashleri ve marka/sürüm denetlenir. İki gerçek WebView2 uygulamasında startup çoklu dosya, sekme/Auto/async akışları, native STEP export ve yeniden import, yerel büyük montaj kontrol edilir. Kullanıcı uygulaması kapatılmaz; test yalnız kendi başlattığı PID'yi kapatır.

Fiziksel Explorer drop, native OS dosya seçici/kaydet diyalogu, MSI ve macOS bu yerel NSIS teslim kapsamının dışında. Browser PNG/PDF üretimi native OS kaydetme testi değildir. Müşteri STEP dosyası yalnız yerel okunur; repoya veya dış servise gönderilmez. Native/WASM sayısal tutarlılığı bağımsız teknik resim doğrulaması sayılmaz. Son paket sonuçları ve bağımsız teslim kararları dış manifestte tutulur.

## Sabit paket kaynağı ve test taşıması

Uygulama commit'i `bffec0afcc28c97cd155993a184823ff58bf2bea`. İki NSIS aynı uygulama girdileriyle üretilir. Sonraki bu belge ve test-only değişiklikler için uygulama tekrar derlenmez; manifest uygulama ve doğrulama commit'lerini ayırır.

İlk CI39987088182, yeni smoke-dokumente'nin `127.0.0.1` adresine bağlanamadı; hemen önce localhost kullanan UI testi geçmişti. Yeni yardımcı diğer testler ve Vite sağlık kontrolüyle aynı `localhost` adresine taşındı. Yerel yalnız `::1` dinleyen preview4187 üzerinde IPv4 bağlantısının reddedildiği doğrulandı; değiştirilmiş tam sekme/Auto/async testi exit0 geçti. Code ve QA dar test değişikliğini uygun buldu. İlk CI başarısızlığı başarı diye yazılmaz; yeni CI ayrı izlenir.

Hasi 3D gerçek NSIS içinden çıkan uygulamanın WebView2 testi exit0 geçti: iki CLI başlangıç dosyası, altı sekme izolasyonu/Auto/async, native STEP export ve tekrar import, eski UI/ayar/Info akışları ve yerel2078 gövdeli montaj. Bu kayıt anında MS3D paket testi hâlâ bekleniyor; dış manifest nihai iki marka sonucunu kaydeder.

MS3D de aynı tam gerçek paket testini exit0 geçti. İki pakette marka/sürüm0.1.6,33'er DLL ve paket içi WASM65864037 bayt/hash eşleşmesi doğrulandı.

İkinci CI39988098744 yeni sekme/Auto testini geçti; ardından eski smoke-messen raster taramasında `Fangart fehlt: mid` ile durdu. Auto'nun eğri kenarını R/Ø için mid/center'dan önce seçmesi yeni açık sözleşmedir. Eski raster/hover bölümü explicit Abstand'a alındı, sonraki otomatik ölçülendirme bölümü öncesi Auto'ya dönüldü. Tüm fang türü, hover, üç ölçü, kopyalama, hassasiyet ve Blech assertionları korunarak tam smoke exit0 geçti. Gerçek pointer Auto R5/Ø10/L95 testi ayrıca korunur. Bu değişiklik yalnız test hazırlığıdır; paket uygulama girdileri değişmedi. Son CI ve bağımsız teslim durumları dış manifestte güncellenir.
