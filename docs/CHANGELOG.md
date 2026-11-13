# Changelog / Değişiklikler

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
