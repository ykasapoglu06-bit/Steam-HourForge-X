# Security and local data / Güvenlik ve yerel veriler

English · [Türkçe](#türkçe)

## English

The dashboard binds to `127.0.0.1` by default. Do not expose it through port forwarding or a public reverse proxy. The optional Docker container binds internally to all interfaces, while the example Compose file publishes only to host loopback.

Control endpoints require the dashboard's exact local Origin and JSON content type. Account names used for newly created profiles are generated internally. Public profile input is restricted to Steam profiles; redirects carrying Steam cookies are restricted to the Steam Community origin. Avatar URLs are restricted to Steam-owned image hosts. The status API omits passwords, shared secrets, cookies and refresh tokens.

Keep `config.json`, `.env`, `data/`, `.runtime/`, logs and cache directories out of GitHub. Use `npm run package:source` to produce an allowlisted source directory. The packager never copies those paths and scans text files for common credential formats. This is a useful check, not a guarantee that every possible secret format can be detected.

The Windows SAM bridge verifies the local SteamID and game ownership. Completion needs an expiring, single-use preview token for the selected account and game. It never uses arbitrary shell commands or accepts an executable path from the browser. It does not modify game files, inject into running games, edit leaderboards or change numeric player statistics. Achievement changes can still be rejected by Steam/game rules; account safety is not guaranteed. Recheck Steam after an unverified or timed-out write before trying again.

External account-service buttons open only the selected profile's public SteamID on the named site. No credentials or session cookies are sent to those sites by the app. Each service has its own availability and policies.

If reporting a security issue, do not post tokens, full account configuration or unredacted logs publicly. Use GitHub’s private vulnerability reporting button in the Security tab if it is available. Otherwise, ask the maintainer for a private reporting channel without publishing exploit details or credentials.

## Türkçe

Panel varsayılan olarak `127.0.0.1` üzerinde çalışır. Port yönlendirmesi veya herkese açık ters vekille erişime açma. İsteğe bağlı Docker kapsayıcısı kendi içinde tüm arayüzlere bağlanır; örnek Compose dosyası portu ana makinenin yalnızca yerel arayüzünde yayımlar.

Kontrol uç noktaları panelin tam yerel Origin değerini ve JSON içerik türünü ister. Yeni yerel profil adları uygulama tarafından üretilir. Herkese açık profil girdileri Steam profilleriyle; Steam çerezi taşıyan yönlendirmeler Steam Community kaynağıyla; profil fotoğrafları Steam'e ait görsel sunucularıyla sınırlandırılır. Durum API'si şifreleri, ortak sırları, çerezleri ve giriş anahtarlarını dışarıda bırakır.

`config.json`, `.env`, `data/`, `.runtime/`, günlük ve önbellek klasörlerini GitHub'a ekleme. İzin verilen dosyalardan kaynak paketi oluşturmak için `npm run package:source` kullan. Paketleyici bu yerel yolları kopyalamaz ve metinlerde yaygın gizli anahtar biçimlerini tarar. Bu kontrol her olası gizli veri biçiminin bulunacağı garantisini vermez.

Windows SAM köprüsü yerel SteamID'yi ve oyun sahipliğini doğrular. Tamamlama için seçili hesap ve oyuna bağlı, süresi dolan ve tek kullanımlık önizleme anahtarı gerekir. Tarayıcıdan çalıştırılabilir dosya yolu veya rastgele kabuk komutu kabul etmez. Oyun dosyalarını değiştirmez, çalışan oyuna kod enjekte etmez, liderlik tablosu veya sayısal oyuncu istatistiği düzenlemez. Steam/oyun kuralları başarım değişikliğini reddedebilir; hesap güvenliği garanti edilmez. Doğrulanamayan veya zaman aşımına uğrayan bir yazmadan sonra tekrar denemeden önce Steam'deki ilerlemeyi kontrol et.

Harici hesap hizmeti düğmeleri yalnızca seçili profilin herkese açık SteamID'sini belirtilen sitede açar. Uygulama bu sitelere giriş bilgisi veya oturum çerezi göndermez. Her hizmetin erişilebilirliği ve kuralları kendisine aittir.

Güvenlik bildirirken giriş anahtarı, tam kişisel yapılandırma veya temizlenmemiş günlük yayımlama. Varsa GitHub Security sekmesindeki özel güvenlik açığı bildirim düğmesini kullan. Yoksa açık veya giriş bilgisi paylaşmadan proje sahibinden özel bildirim kanalı iste.
