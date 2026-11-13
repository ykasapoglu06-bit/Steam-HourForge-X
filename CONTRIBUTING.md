# Contributing / Katkı rehberi

English · [Türkçe](#türkçe)

## English

Use Node.js 22.13 or newer. Run `npm ci`, `npm test`, then `npm run build`.

Windows builds also compile the x86 SAM adapter using the .NET Framework C# compiler. The unmodified SAM.API DLL and its original license are included under `native/sam/`. Linux builds support the dashboard and farming but skip the Windows-only adapter.

Keep credentials and real account identifiers out of examples, fixtures, screenshots and issues. Use `config.example.json` as a template; never commit `config.json`, `.env` or `data/`.

Add English and Turkish strings together in `ui/i18n.js`. Add behavior tests for changes to scheduling, authentication, local API access, achievement confirmation or account isolation. Do not test achievement writes against real accounts in CI. Use mocks for mutation paths and clearly distinguish them from read-only live checks.

Before sharing, run `npm run package:source -- /absolute/path/to/a/new-directory`. The output includes a SHA-256 source manifest and excludes local runtime files and account state.

## Türkçe

Node.js 22.13 veya daha yeni bir sürüm kullan. Sırasıyla `npm ci`, `npm test` ve `npm run build` çalıştır.

Windows derlemesi, .NET Framework C# derleyicisiyle x86 SAM bağdaştırıcısını da oluşturur. Değiştirilmemiş SAM.API DLL ve orijinal lisansı `native/sam/` altında bulunur. Linux derlemesi paneli ve saat/kart işlemlerini destekler; Windows'a özel bağdaştırıcıyı atlar.

Örneklere, test verilerine, ekran görüntülerine ve hata bildirimlerine gerçek giriş bilgisi veya hesap kimliği koyma. `config.example.json` dosyasını örnek al; `config.json`, `.env` ve `data/` dosyalarını Git'e ekleme.

`ui/i18n.js` içindeki İngilizce ve Türkçe metinleri birlikte güncelle. Sıralama, giriş, yerel API erişimi, başarım onayı veya hesap ayrımı değişiyorsa davranış testi ekle. CI içinde gerçek hesaplarda başarım yazma; değişiklik yapan işlemleri taklit et ve salt okunur canlı kontrollerden açıkça ayır.

Paylaşmadan önce `npm run package:source -- /absolute/path/to/a/new-directory` çalıştır. Çıktı SHA-256 kaynak manifesti içerir; yerel çalışma dosyalarını ve hesap durumunu dışarıda bırakır.

## Issues and pull requests / Hata bildirimleri ve değişiklikler

English or Turkish is welcome. For bugs, include your version, operating system, reproduction steps, expected behavior and actual behavior. For pull requests, explain the user-visible change and the checks you ran. Keep unrelated changes separate. Never attach an active QR code or private configuration.

Türkçe veya İngilizce yazabilirsin. Hatalarda sürümü, işletim sistemini, tekrar etme adımlarını, beklenen ve gerçekleşen davranışı ekle. Pull request açıklamasında kullanıcıya yansıyan değişikliği ve çalıştırdığın kontrolleri belirt. İlgisiz değişiklikleri ayrı tut. Aktif QR kodu veya kişisel yapılandırma ekleme.
