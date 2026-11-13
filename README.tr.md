# Steam HourForge X

<p align="center"><img src="ui/logo.png" alt="Steam HourForge X" width="220"></p>
<p align="center"><b>Kütüphanen, senin kontrolünde.</b><br>Türkçe · <a href="README.md">English</a></p>

Steam saatlerini, oyun sırasını ve birden fazla hesabı tek bir yerel panelden yönet. Kullanıcı adı/şifre veya QR koduyla bağlan; favorilerini önceliklendir, şimdi çalışan oyunları ve sıradaki grubu gör.

| Özellik | Neler yapabilirsin? |
| --- | --- |
| Saat önceliği | Öncelikli oyunlarını her grupta tut; kalan oyunları dönüşümlü çalıştır. |
| Kütüphane | Tüm oyunları tara, herkese açık profil ara, eksik oyunu AppID veya mağaza bağlantısıyla ekle. |
| Hesaplar | Bağımsız şifre/QR girişleri, kaydedilen oturumlar, fotoğraf ve Steam kimlik bilgileri. |
| Profil bağlantıları | Steam, VacList, CSRep, CSStats, CSWatch ve SteamIDCheck kısayolları. |
| Kart modu | Kart hakkı kalan oyunları sırayla çalıştır; haklar bitince saat sırasına dön. |
| Başarımlar | İlerlemeyi kontrol et; Windows SAM entegrasyonunda eksikleri görüp açıkça onayla. |
| Dil | Bayraklı Türkçe/İngilizce geçişi; dil tercihin hatırlanır. |

## Windows’ta başlat

1. Node.js **22.13 veya daha yeni** bir sürümü kur.
2. Kaynak dosyalarını bir klasöre çıkar ve `start.bat` dosyasını aç.
3. İlk açılış bağımlılıkları kurar, uygulamayı derler ve logolu **Steam HourForge X** kısayollarını klasörde ve masaüstünde oluşturur.
4. Steam hesap adın ve şifrenle giriş yap. Steam ayrıca kod isterse e-posta veya uygulama kodunu aynı panele gir. QR koduyla giriş de ayrı bir seçenektir.

Panel: **http://127.0.0.1:17321**. Sonraki açılışlarda logolu kısayolu kullanabilirsin. Tarayıcıyı kapatmak arka plandaki uygulamayı durdurmaz; panelden hesapları durdurabilirsin.

Geliştirici kurulumu:

```sh
npm ci
npm test
npm run build
npm start
```

Windows SAM köprüsü için .NET Framework C# derleyicisi gerekir. Linux’ta yerel panel çalışır; SAM köprüsü yalnızca Windows içindir. Docker tanımı depoda bulunur, bu sürümde Docker çalışma testi yapılmadı.

## Saat, sıra ve hesaplar

**Önce saat** modunda yıldız verdiğin oyunlar her grupta kalır. Steam’in hesap başına aynı anda 32 oyun sınırındaki boş yerlerde diğer oyunlar döner. 32 oyunun tamamını sabitlersen diğerlerine yer kalmaz. Grup süresini 5–240 dakika arasında seçebilirsin.

Oyun listesi başlangıçta kapalıdır; oyun sayısına tıklayarak aç. Şimdi çalışan grup, bir sonraki grup ve tam sıra ayrı ayrı görülebilir. Bulunmayan oyunları AppID veya Steam mağaza bağlantısıyla ekleyebilirsin; oyun sahipliği yine Steam’e bağlıdır.

Panelden girilen şifre yalnızca o giriş denemesinde kullanılır; yapılandırma dosyasına, günlüklere veya tarayıcı deposuna kaydedilmez. Steam Guard kullanmayan hesaplar kod gerekmeden devam eder. Steam doğrulama isterse ilgili kod/onay adımı gösterilir.

**Bağlantıyı kes** oturumu saklar. **Profilden çıkış** ilgili giriş verilerini siler; tekrar QR onayı gerekir. Hesap listesi ve tercihler `config.json` içinde, oturum tokenları ve profil önbellekleri `data/` içinde yerel olarak tutulur. Bu dosyaları başkalarıyla paylaşma. Kaynak paketine dahil edilmezler.

## Başarım işlemleri

Kontrol işlemi başarım ilerlemesini okur. Eksik başarımları değiştirmek için önce oyun bazında önizleme, ardından açık onay gerekir. Masaüstü Steam hesabı seçili hesapla eşleşmelidir. Bazı oyunlar sunucudan veya korumalı istatistiklerden yönetilen başarımlara izin vermez. İşlem sonucu yeniden okunarak doğrulanır; deneme kaydı `data/achievement-actions.jsonl` içinde tutulur.

Steam saat kaydını, kart uygunluğunu ve hesap kurallarını kendisi belirler. Saat, kart veya başarım sonucu garanti edilmez. Uygulama Valve veya Steam tarafından geliştirilmemiştir.

## Proje sahibi ve katkı

**Yusuf Kasapoglu** · [Steam: yuu55uuf](https://steamcommunity.com/id/yuu55uuf/) · [GitHub](https://github.com/ykasapoglu06-bit)

MIT lisansı ve temel alınan projenin atıfları korunur. SAM.API kendi orijinal lisansıyla dağıtılır. Ayrıntılar: [Üçüncü taraf bildirimleri](THIRD_PARTY_NOTICES.md), [güvenlik](SECURITY.md), [katkı rehberi](CONTRIBUTING.md).

Sorun bildirirken parolaları, tokenları, çerezleri veya kişisel `config.json` dosyanı ekleme. Ekran görüntülerindeki QR kodlarını ve hesap bilgilerini gizle.

### Başarım seçimi ve oturum devri

Topluluk sayfası gizli veya okunamıyor olsa da yerel başarım düzenleyicisine ulaşabilirsin. Eksik başarım listesinden tek tek seçim yapabilir ya da tümünü seçebilirsin. Önizlemeyi kontrol edip onayla. Windows işlemi sırasında saat oturumu geçici olarak ayrılır; işlemden sonra kayıtlı oturumla yeniden bağlanır. Sonuç ayrı bir yerel Steam okumasıyla doğrulanır. Sunucudan yönetilen bazı başarımlar reddedilebilir.

Önce kart modunda mevcut oyun, kalan kart hakkı ve sıradaki oyun gösterilir. Haklar bitince kaydedilmiş önceliklerle saat sırası otomatik devam eder. Rozet sayacındaki azalma gözlemlenir; kartın ne zaman düşeceği garanti edilmez.

### Hesabı uygulamadan kaldır

**Hesaplar → Hesabı uygulamadan kaldır** yolunu izle. Aynı seçenek hesap ayarlarında da bulunur. Onay ekranındaki hesap adını kontrol et. İşlemler durdurulur, kayıtlı giriş temizlenir ve hesabın kaydıyla tercihleri kaldırılır. Steam hesabın, oyunların ve başarımların etkilenmez. Son hesabı da kaldırabilirsin; panelde yeni hesap ekleme ekranı gösterilir. Başarım işlemi sürerken hesap kaldırılamaz. Hesabı yeniden kullanmak için ekleyip giriş yapman gerekir.
