# Changelog / Değişiklikler


## v2.4.8

### English

Quit app now attempts to close its own browser tab after the background server has stopped. If browser policy blocks script closing, the closed screen remains with manual-close guidance. Other tabs/windows are not targeted. 92 automated tests and Windows build pass; both successful close invocation and blocked-close fallback are covered with mocks. Real browser auto-close was not verified in this chat.

### Türkçe

Programı kapat, arka plan sunucusu durduktan sonra kendi tarayıcı sekmesini kapatmayı dener. Tarayıcı betikle kapatmayı engellerse elle kapatma açıklamalı kapandı ekranı kalır. Diğer sekmeler/pencereler hedeflenmez. 92 otomatik test ve Windows derlemesi başarılı; kapatma çağrısı ve engellenme durumundaki alternatif ekran taklitlerle kapsandı. Bu sohbette gerçek tarayıcı otomatik kapanması doğrulanmadı.

## v2.4.7

### English

- Rebuilt shared spacing and responsive rules for Activity, Library, Find games, Full queue, Accounts and About; compacted sign-in and dialogs.
- Narrow screens use bottom navigation, a compact language/header area, stacked forms/cards, readable inputs and safe-area spacing.
- Three-account desktop sidebar has a guaranteed minimum list height; account cards use content-safe grids.
- HTML/JS/CSS are snapshotted together on backend startup. Mismatched old pages show recovery guidance instead of crashing into a partial UI. Launcher warns when an older backend is still running.
- 91 automated tests pass, including all-six-view navigation with three accounts and long names, version recovery and consistent assets. Windows build passes. Visual mobile browser verification was unavailable in this chat; no claim of device-level verification is made.
- The dashboard remains localhost-only. Public hosting/remote login is not enabled.

### Türkçe

- Canlı durum, Kütüphane, Oyun bul, Tam sıralama, Hesaplar ve Hakkında için ortak boşluk ve duyarlı düzen yeniden kuruldu; giriş ve pencereler sıkılaştırıldı.
- Dar ekranda alt gezinme, küçük dil/üst bilgi alanı, alt alta form/kartlar, okunabilir girdiler ve ekran güvenli alanı boşluğu kullanılır.
- Masaüstünde üç hesap için sol listede en az yükseklik ayrıldı; hesap kartlarında içerik taşmasını önleyen sütunlar kullanılır.
- HTML/JS/CSS arka uç açılırken birlikte belleğe alınır. Eski sayfa/sürüm karışıklığında eksik arayüz yerine kurtarma açıklaması gösterilir. Başlatıcı eski arka uç açıkken uyarır.
- Üç hesap ve uzun adlarla altı sekme, sürüm kurtarma ve tutarlı dosya sunumu dahil 91 otomatik test başarılı. Windows derlemesi başarılı. Bu sohbette mobil tarayıcı görsel doğrulaması kullanılamadı; gerçek cihaz doğrulaması iddia edilmiyor.
- Panel yalnızca yerel erişimde kalır. Herkese açık sunucu veya uzaktan giriş etkinleştirilmedi.

## v2.4.6

### English

Project owner display name is Joseph-06. The existing Steam profile link is retained with the official Steam icon. The tagline is now “Your games. Your control.” Paragraph, heading and section spacing is tighter across About, sign-in and activity panels. Controls retain accessible target sizes. 87 tests and Windows build pass; no browser visual verification was available for this update.

### Türkçe

Proje sahibi görünen adı Joseph-06 olarak değiştirildi. Mevcut Steam profil bağlantısı resmî Steam logosuyla korundu. Yeni slogan: “Oyunların. Senin kontrolünde.” Hakkında, giriş ve durum panellerindeki paragraf, başlık ve bölüm aralıkları daraltıldı. Düğme hedef boyutları korundu. 87 test ve Windows derlemesi başarılı; bu güncellemede tarayıcı üzerinden görsel doğrulama yapılamadı.

## v2.4.5

### English

- Red Quit app power button beside Resume all stops accounts and the local server, exits the background app and preserves saved account data. Quit is unavailable during native achievement processing.
- Selected only mode keeps one or more starred games running without group rotation or card priority, up to 32 games. Empty selection reports no games.
- Shutdown is idempotent, rejects new work and has bounded cleanup. Owned native helpers are stopped; fatal exits use a failure code.
- 87 automated tests pass. A separate live-process shutdown/reopen probe was blocked by automatic approval review; no live-process shutdown success is claimed.

### Türkçe

- Hepsini sürdür yanındaki kırmızı güç simgeli Programı kapat düğmesi hesapları ve yerel sunucuyu durdurur, arka plandaki programdan çıkar; kayıtlı hesap verileri korunur. Yerel başarım işlemi sırasında kapatma kullanılamaz.
- Yalnızca seçtiklerim modu, en fazla 32 yıldızlı oyunu grup geçişi veya kart önceliği olmadan açık tutar. Seçim boşsa oyun bildirilmez.
- Kapatma bir kez çalışır, yeni işlemleri reddeder ve temizlik süresi sınırlıdır. Uygulamanın yerel yardımcıları durdurulur; ölümcül hatalar başarısız çıkış kodu kullanır.
- 87 otomatik test başarılı. Ayrı canlı süreç kapatma/yeniden açma denemesi otomatik onay denetimince engellendi; canlı süreç sonlandırmasının doğrulandığı iddia edilmiyor.

## v2.4.4

### English

- Keep the latest pause/resume choice across native achievement operations.
- Handle release timeouts while stop is pending and clean up timers/listeners on every exit.
- Check resolved Steam usernames before QR or saved-session logOn; display names remain separate.
- Explain busy account states and disable conflicting connect, sign-out and removal actions.
- Improve small-screen target sizes, translate navigation labels and preserve keyboard focus across sign-in tabs, including Home/End.
- Validation: 80 tests, Windows/Node 22 and Linux/Node 24 CI passed. Windows native bridge built; npm audit reported zero known vulnerabilities at release time. Browser fixture checks covered desktop, 375x812 and 812x375, English/Turkish and keyboard navigation. No real achievement writes were performed.

### Türkçe

- Yerel başarım işlemi sırasında verilen son duraklat/sürdür tercihi korunur.
- Durdurma beklerken bağlantı bırakma zaman aşımı ele alınır; tüm çıkışlarda zamanlayıcılar ve dinleyiciler temizlenir.
- QR veya kayıtlı oturum girişinden önce gerçek Steam kullanıcı adı kontrol edilir; görünen profil adı ayrı tutulur.
- Meşgul hesap durumları açıklanır; çakışabilecek bağlantı, çıkış ve kaldırma düğmeleri kilitlenir.
- Dar ekran dokunma alanları, çevrilmiş gezinme etiketleri ve Home/End dahil giriş sekmesi klavye odağı iyileştirildi.
- Doğrulama: 80 test, Windows/Node 22 ve Linux/Node 24 CI başarılı. Windows köprüsü derlendi; sürüm anındaki npm audit taramasında bilinen açık bulunmadı. Örnek verili tarayıcı kontrolleri masaüstü, 375x812, 812x375, Türkçe/İngilizce ve klavye kullanımını kapsadı. Gerçek hesaplarda başarım yazılmadı.

## v2.4.3

### English

- Serialize account sign-in/removal lifecycle changes and reserve usernames during concurrent sign-ins.
- Reject duplicate configured Steam usernames before saving invalid startup configuration.
- Lock native achievement handoff before its cooldown wait.
- Validation: 73 tests and Windows/Linux CI passed; no real achievement writes during review.

### Türkçe

- Hesaba giriş/kaldırma yaşam döngüsü değişiklikleri sıralanır; eşzamanlı girişte kullanıcı adları ayrılır.
- Geçersiz açılış yapılandırması kaydedilmeden önce yinelenen Steam kullanıcı adları reddedilir.
- Yerel başarım devri bekleme süresinden önce kilitlenir.
- Doğrulama: 73 test ve Windows/Linux CI başarılı; incelemede gerçek başarım yazılmadı.

Earlier changes / Önceki değişiklikler: [releases](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/releases) · [validation history / doğrulama geçmişi](RELEASE_CHECKS.md).
