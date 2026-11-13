<p align="center"><img src="ui/logo.png" alt="Steam HourForge X" width="180"></p>

# Steam HourForge X

**Steam saatlerini, kart sırasını ve birden fazla hesabı yerel bir panelden yönet.**

Türkçe · [English](README.md)

[![Build and test](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/actions/workflows/ci.yml/badge.svg)](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/ykasapoglu06-bit/Steam-HourForge-X)](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/releases/latest)
[![MIT license](https://img.shields.io/badge/license-MIT-58d5ff)](LICENSE)
[![Interface EN / TR](https://img.shields.io/badge/interface-English%20%2F%20T%C3%BCrk%C3%A7e-007bff)](README.tr.md)

[Son kaynak sürümü indir](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/releases/latest) · [Hata bildir](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/issues/new/choose) · [Özellik öner](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/issues/new/choose)

Öncelikli oyunlarını seç, Steam'e bildirilen oyunları gör ve sıradaki grubu takip et. Önce kart moduyla kart hakkı kalan oyunları çalıştır; haklar bitince saat önceliklerine dön. Arayüz Türkçe ve İngilizce kullanılabilir.

## Neler yapabilirsin?

| Özellik | Davranış |
| --- | --- |
| Saat öncelikleri | Yıldız verdiğin oyunları her grupta tut; diğer oyunları boş yerlerde sırayla çalıştır. |
| Önce kart | Kart hakkı olan oyunları tek tek çalıştır; haklar bitince saat sırasına dön. |
| Çoklu hesap | En fazla 20 yerel hesap kaydında ayrı giriş, oturum, kütüphane ve ayarlar kullan. |
| Şifre veya QR ile giriş | Steam hesap adı ve şifrenle ya da QR koduyla bağlan. Steam isterse doğrulamayı tamamla. |
| Kütüphane ve keşif | Kütüphaneni yükle, herkese açık profilleri ara, eksik oyunu App ID veya mağaza bağlantısıyla ekle. |
| Sıra görünümü | Aktif grubu, sıradaki grubu ve tam sırayı gör. Oyun listelerini gerektiğinde genişlet. |
| Başarım düzenleyicisi | İlerlemeyi oku; Windows SAM işleminde değiştirmek istediğin eksikleri seçip açıkça onayla. |
| Profil kısayolları | Steam fotoğrafı, SteamID64, Steam2 ID ve özel profil yolunu gör; Steam ve beş hesap hizmetini aç. |
| Yerel tercihler | Hesap etiketi, öncelikler, grup süresi ve dil seçimi hatırlanır. |

## Windows'ta başla

İndirilen sürüm bir **kaynak paketidir**; bağımsız kurulum programı veya paketlenmiş Node.js içermez.

1. **Node.js 22.13 veya daha yeni** bir sürümü kur ve [Releases](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/releases/latest) sayfasından ZIP dosyasını indir.
2. Yazma iznin olan bir klasöre çıkar. `start.bat` dosyasını aç.
3. Başlatıcı gerektiğinde bağımlılıkları kurar, uygulamayı derler; klasörde ve masaüstünde logolu kısayollar oluşturur.
4. **http://127.0.0.1:17321** adresini aç, gerekiyorsa hesap ekle ve giriş yap.
5. **Kütüphane** bölümünde öncelikli oyunlarına yıldız ver. Canlı durum sayfasında **Önce saat** veya **Önce kart** seç.

Windows derlemesinde x86 başarım köprüsü için .NET Framework C# derleyicisi de gerekir. Sonraki açılışlarda logolu kısayolu kullanabilirsin. Tarayıcıyı kapatmak arka plan işlemini durdurmaz. Güncel arka uç kodunu kullanmak için uygulamanın arka plan işlemini de yeniden başlatmalısın.

### Git deposundan başlat

```sh
git clone https://github.com/ykasapoglu06-bit/Steam-HourForge-X.git
cd Steam-HourForge-X
npm ci
npm test
npm run build
npm start
```

İlk açılışta kişisel `.env` veya `config.json` gerekmez. Elle yapılandırma için `config.example.json` dosyasını örnek alabilirsin.

## Yalnızca seçtiğin oyunları açık tut

**Kütüphane** bölümünde istediğin oyunlara yıldız ver; canlı durum sayfasında **Yalnızca seçtiklerim** modunu seç. Tek yıldız yalnızca bir oyunu, birkaç yıldız yalnızca o oyunları açık tutar; en fazla 32 oyun seçebilirsin. Bu modda grup sırası değişmez ve kart önceliği uygulanmaz. Seçim boşsa oyun bildirilmez. Diğer sıralara dönmek için Önce saat veya Önce kart seç.

## Programı tamamen kapat

**Hepsini sürdür** yanındaki kırmızı güç simgeli **Programı kapat** düğmesini kullan. Tüm hesap işlemleri durur, yerel sunucu ve arka plandaki uygulama kapanır; hesaplar, kayıtlı girişler ve tercihler korunur. Sayfa kapanıyor/kapandı durumunu gösterir; tarayıcı sekmesini kendin kapatabilirsin. Tekrar kullanmak için uygulama kısayolunu aç. Yerel başarım işlemi sürerken kapatma geçici olarak kullanılamaz.

## Giriş ve kayıtlı hesaplar

Herkese görünen profil adından farklı olabilen gerçek **Steam hesap adını** kullan. Steam Guard olmayan hesaplar yalnızca şifreyle giriş yapabilir. Steam e-posta kodu, doğrulayıcı kodu veya onay isterse ilgili adımı panelde ya da Steam uygulamasında tamamla. QR koduyla giriş de bir seçenektir.

Panelde girilen şifre yalnızca o giriş denemesinde kullanılır; yapılandırmaya veya tarayıcı deposuna kaydedilmez. Yeniden bağlanmak için giriş anahtarı yerel olarak saklanır. Yapılandırma dosyasına elle yazdığın şifrelerin sorumluluğu sende kalır.

| İşlem | Ne olur? |
| --- | --- |
| Duraklat / Sürdür | İlgili hesabın çalışmasını değiştirir. Başarım işlemi sırasında verilen son tercih korunur. |
| Bağlantıyı kes | Hesabın etkinliğini durdurur; kayıtlı girişi korur. |
| Profilden çıkış | Bağlantıyı keser; kayıtlı girişi ve yapılandırılmış şifreleri temizler. Şifre veya QR ile yeniden giriş yapabilirsin. |
| Hesabı uygulamadan kaldır | Onaydan sonra yerel kaydı, tercihleri ve kayıtlı girişi kaldırır. Steam hesabın ve kütüphanen etkilenmez. |

Son hesabı da kaldırıp daha sonra yeni bir hesap ekleyebilirsin. Yerel başarım işlemi sırasında çakışabilecek hesap düğmeleri kilitlenir. Yeni çözümlenen Steam girişi devam etmeden önce aynı aktif kimlik kontrol edilir.

## Saat ve kart sıraları

**Önce saat**, en fazla 32 oyunluk gruplar oluşturur. Öncelikli oyunlar her grupta bir yer kaplar; diğer oyunlar kalan yerlerde döner. 32 yeri de sabitlersen diğer oyunlara yer kalmaz. Hesap ayarlarında grup süresini **5–240 dakika** arasında belirleyebilirsin.

**Önce kart**, kart hakkı bulunan tek bir oyunu çalıştırır; saat önceliklerini geçici olarak bekletir. Rozet sayfaları beş dakikada bir kontrol edilir. Panelde mevcut oyun, kalan hak ve sıradaki oyun gösterilir. Haklar bitince saat sırası önceliklerinle devam eder. Rozet sayacındaki azalma bir gözlemdir; uygunluğu ve kartın düşme zamanını Steam belirler.

Bildirim durumu, uygulamanın Steam'e oynama durumunu gönderdiğini gösterir; kazanılan saatleri bağımsız olarak doğrulamaz. Kayıtlı oynama süresini güncellemek için kütüphaneyi yenile. App ID eklemek Steam'deki oyun adını kontrol eder; sahiplik veya saat kazanımı sağlamaz.

## Windows'ta başarım işlemleri

1. Steam masaüstü istemcisini panelde seçili hesapla **aynı hesapta** çevrimiçi tut. Diğer oturumlarda çalışan oyunları durdur.
2. Sahip olunan bir oyunda ilerlemeyi kontrol et veya başarım seçimini aç. Herkese açık topluluk istatistikleri okunamasa da yerel erişim çalışabilir.
3. Gerçek eksik başarım listesini incele ve değiştirmek istediklerini seç.
4. Hesabı, oyunu ve seçimi onayla. Önizleme anahtarı tek kullanımlıktır ve iki dakika sonra geçersiz olur.
5. Ayrı bir yerel okumayla doğrulanan sonucu kontrol et. Gönderim zaman aşımına uğrarsa veya sonuç belirsizse tekrar denemeden önce ilerlemeyi yeniden oku.

Yerel oturum devri için saat bağlantısı geçici olarak kesilir; ardından kayıtlı oturumla yeniden bağlanılır. Son duraklat/sürdür tercihin korunur. Kontrol veya önizleme açmak başarım yazmaz. Tamamlama denemeleri `data/achievement-actions.jsonl` dosyasına kaydedilir.

Sunucudan yönetilen veya korumalı başarımlar değişikliği reddedebilir. Hesap kurallarını, kaydedilen saatleri ve kartları Steam belirler; sonuç ve hesap güvenliği garanti edilmez. Uygulama oyun dosyalarını, sayısal oyuncu istatistiklerini veya liderlik tablolarını değiştirmez.

## Profil bağlantıları

Hesap kartında giriş yapılan profil ve kullanılabilir kimlik bilgileri gösterilir. İlk sırada **Steam profili**, ardından **VacList, CSRep, CSStats, CSWatch ve SteamIDCheck** bulunur. Her bağlantı seçili herkese açık SteamID'yi ilgili sitede açar. Uygulama toplu ban/durum taraması yapmaz ve kayıtlı giriş bilgilerini bu hizmetlere göndermez. [Simge kaynakları](docs/LOGO_SOURCES.md) dosyasına bakabilirsin.

## Platformlar ve gereksinimler

| Platform | Panel, saat ve kart | Yerel başarım düzenleyicisi |
| --- | --- | --- |
| Windows | Desteklenir; Node.js 22.13+ | Masaüstü Steam ve .NET Framework C# derleyicisi gerekir. |
| Linux | Desteklenir; Node.js 22.13+ | Yalnızca Windows; herkese açık ilerleme okuması kullanılabilir olabilir. |
| Docker / Linux | Compose örneği bulunur; canlı Docker doğrulaması kaydedilmedi. | Kullanılamaz. |

`docker compose up --build`, paneli ana makinenin yerel arayüzünde açar. Örnek `data/` klasörünü saklar; kapsayıcı yeniden oluşturulunca hesap kayıtları ve tercihlerin de kalsın istiyorsan `config.json` dosyasını ayrıca kalıcılaştır. Paneli bilgisayarına özel tut.

## Yerel veriler ve gizlilik

| Konum | İçerik |
| --- | --- |
| `config.json` | Hesap kayıtları ve ayarlar; elle yapılandırılmışsa şifre içerebilir. |
| `data/tokens/` | Kayıtlı Steam giriş anahtarları. |
| `data/steam/` | Hesap başına Steam istemci önbelleği. |
| `data/achievement-actions.jsonl` | Başarım tamamlama denemeleri. |
| `data/steam-hourforge-x.log` | Masaüstü başlatıcısının çıktısı. |

Uygulamada analitik yoktur. Steam bağlantıları, görsel istekleri ve harici profil bağlantıları yine ağı kullanır. Yerel durum uç noktası şifre, ortak sır, çerez ve giriş anahtarı içermez; hesap bilgilerini ve aktif QR girişini içerebilir. Herkese açma; günlükleri ve ekran görüntülerini gizli bilgileri temizlemeden paylaşma. [SECURITY.md](SECURITY.md) dosyasını oku.

## Sorun giderme

| Belirti | Kontrol et |
| --- | --- |
| `npm` veya Node.js bulunamıyor | Node.js 22.13+ kur; terminali veya başlatıcıyı yeniden aç. |
| Yerel derleme başarısız | Windows .NET Framework derleyicisi gereksinimini ve derleme çıktısını kontrol et. |
| Giriş kod istiyor | Steam'in istediği doğrulamayı tamamla; herkese açık profil adı giriş adın değildir. |
| Kütüphane veya ilerleme okunamıyor | Profil gizliliği, oyun sahipliği ve Steam bağlantısını kontrol et; kütüphane taramasını yeniden dene. |
| Kart hakkı kalmadı | Saat sırası devam eder; uygulama yeni kart hakkı oluşturamaz. |
| Başarım sonucu reddedildi veya belirsiz | Masaüstündeki hesabı ve sahipliği kontrol et; tekrar denemeden önce ilerlemeyi yeniden oku. |
| Eski sürüm görünüyor | Uygulamanın arka plan işlemini yeniden başlat; ardından paneli yenile. |

## Geliştirme ve katkı

Arka uç TypeScript, arayüz sade JavaScript/CSS kullanır. Windows ve Linux derlemeleri [GitHub Actions](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/actions/workflows/ci.yml) üzerinde çalışır. v2.4.4 kontrollerinde **80 test** geçti; kapsam ve sınırlamalar [sürüm kontrollerinde](docs/RELEASE_CHECKS.md) yer alır.

Hata ve özellik önerilerini **Türkçe veya İngilizce** yazabilirsin. Uygulama sürümünü, işletim sistemini ve tekrar etme adımlarını ekle. Şifre, giriş anahtarı, çerez, aktif QR kodu veya kişisel yapılandırmanı ekleme. [CONTRIBUTING.md](CONTRIBUTING.md) ve [son değişikliklere](docs/CHANGELOG.md) bakabilirsin.

Temiz bir kaynak paketi oluştur:

```sh
npm run package:source -- /absolute/path/to/a/new-output-directory
```

Paket SHA-256 kaynak manifesti içerir; yerel yapılandırmayı, oturumları, günlükleri, bağımlılıkları ve isteğe bağlı özel çalışma ortamını dışarıda bırakır. SAM.API kendi lisansıyla pakete dahildir; yardımcı EXE, C# kaynağından derlenir.

## Proje sahibi ve lisans

**Yusuf Kasapoglu** · [GitHub](https://github.com/ykasapoglu06-bit) · [Steam: yuu55uuf](https://steamcommunity.com/id/yuu55uuf/)

MIT lisanslıdır; Alden (realalden27) tarafından yazılan temel kodun atıfları korunur. SAM.API, Rick (gibbed) tarafından geliştirilmiştir ve kendi lisansını korur. Steam, oyun görselleri ve hizmet logoları ilgili sahiplerine aittir. Steam HourForge X, Valve ve Steam'den bağımsızdır. [LICENSE](LICENSE) ve [üçüncü taraf bildirimlerini](THIRD_PARTY_NOTICES.md) okuyabilirsin.

Proje işine yaradıysa GitHub yıldızı vererek daha sonra kolayca bulabilirsin. Tekrar edilebilen hata bildirimleri ve belge düzeltmeleri de katkıdır.
