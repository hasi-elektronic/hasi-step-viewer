# Hasi 3D / MS3D çalışma kuralları

Kullanıcıyla Türkçe iletişim kur. Ürün arayüzü ve teknik CAD terimleri Almanca kalır.

## Bağımsız denetim

Kullanıcı alt ajan denetimini kalıcı olarak istemiştir. Her üretim derlemesi öncesinde üç bağımsız rolü çalıştır:

| Rol | Görev |
| --- | --- |
| `hasi_code_reviewer` | Doğruluk, async/olay akışı, mimari, güvenlik, veri ve kaynak bütünlüğü |
| `hasi_qa_reviewer` | Kullanıcı senaryoları, regresyonu yakalayan testler, büyük montaj, ölçüm ve gezinme |
| `hasi_release_reviewer` | Sürüm/marka, derleme girdileri, önbellek, gerçek teslim paketleri ve CI kanıtı |

Ana ajan uygulamayı değiştirir; denetçiler inceleme yapar. Raporlanan kusuru doğrula, düzelt, ilgili denetçiye tekrar incelet. Açık P0/P1 veya kapsamı bozan P2 varken üretim derlemesine geçme. Derleme öncesi ve derleme sonrası onaylar ayrıdır; henüz üretilmemiş paketin testi beklemede kalır.

Raporları incelenen commit/çalışma ağacı, bulgu önemleri, kanıt, karar ve kapsam sınırlarıyla `docs/reviews/` altında kaydet. Kaynak değişince ilgili incelemeyi yenile. Ajanın olumlu görüşü gerçek testin yerini tutmaz.

## CAD doğrulaması

- Serbest kamera döndürme parça matrislerini değiştirmemeli. Zoom sırasında detaylar korunmalı; büyük montaj yolu küçük test parçasıyla doğrulanmış sayılmaz.
- Görüntü native çekirdekle açılırken ölçüm WASM kullanabilir. Native import başarısı, Messen başarısı değildir. Gerçek paket WASM bütünlüğünü ve gerçek masaüstünde bilinen ölçüyü ayrı kontrol et.
- Hasi 3D ve MS3D aynı koddan, farklı marka/kimliklerle üretilir. Teslim edilen her paket türünü kendi içinden çıkarıp doğrula; MSI testi NSIS testi yerine geçmez.
- Dosya seçme, Unicode/ağ yolu, çift tıklama ve OS drag/drop yollarını ayır. DOM/mock testi fiziksel Windows bırakması kanıtı değildir.
- Gerekli native yapılandırmayı kullan: `src-tauri/tauri.kern.json`. Çalışan kullanıcı uygulamasını kapatma veya üzerine kurma. Test uygulamalarını ayrı dizinde başlat; derleme sırasında `target/release` içinden uygulama çalıştırma.
- Müşteri STEP dosyalarını, BREP/mesh verilerini veya ekran görüntülerini repoya/CI'a ekleme. Sentetik örnekler kullan. Geçici raporları kaynak ağacının dışında tut.
- Belge/ajan ayarı değişikliği için uygulamayı yeniden derleme. Üretim kaynakları değiştiğinde uygun testleri çalıştır; git diff/type/import/derleme kontrollerini değişikliğin kapsamına göre seç.

İlk bağımsız denetim ve açık bulgular: `docs/reviews/2026-10-23-initial-team-audit.md`.
