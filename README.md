# Steam HourForge X

<p align="center"><img src="ui/logo.png" alt="Steam HourForge X" width="220"></p>
<p align="center"><b>Your library. Your pace.</b><br>English · <a href="README.tr.md">Türkçe</a></p>

[![Build and test](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/actions/workflows/ci.yml/badge.svg)](https://github.com/ykasapoglu06-bit/Steam-HourForge-X/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-58d5ff)
![Interface: EN / TR](https://img.shields.io/badge/interface-EN%20%2F%20TR-007bff)

Steam HourForge X is a local dashboard for Steam playtime reporting and eligible trading-card drops. It supports independent account queues, username/password or QR sign-in, always-on priority games, full library scans, public profile lookup, and Turkish/English interfaces.

## Run on Windows

Open the **Steam HourForge X** desktop shortcut, or run `start.bat` to build and open the application. The dashboard is available at http://127.0.0.1:17321 and is bound to this computer only. Closing the page does not stop the background process.

For a GitHub/source checkout, install Node.js 22.13 or newer, run `npm ci`, then `npm run build` and `npm start`. On Windows, `start.bat` installs missing dependencies, builds, creates branded shortcuts in the application folder and on the desktop, and opens the dashboard. A locally bundled runtime under `.runtime/` is optional and is not included in the source release.

The first run works without a `.env` or personal `config.json`: it opens a full-library account with a username/password sign-in form. Steam Guard is not required by the application. If Steam requests an email or authenticator code, enter it in the same panel; device/email approval is also supported. QR sign-in remains available as a separate option. Passwords entered in the dashboard are held only for the current attempt and never saved to config, logs, browser storage or the status API. The refresh token is stored locally for future sessions. Accounts and preferences are saved to `config.json`. Public identity metadata is cached locally in `data/profiles/` so account cards remain recognizable after restarting.

## Priorities and modes

In **Library**, star a game to make it a priority for the selected account. In **Hours first**, priority games remain in every group while all other library games rotate through the available slots. Steam allows up to 32 games at once. Pinning all 32 slots leaves no room for other games.

**Cards first** runs one game with remaining eligible card drops. It temporarily suspends the pinned hours queue. Badge pages are checked every five minutes; after all eligible drops are exhausted, the hours queue resumes. Card drops and exact drop times are not guaranteed. Steam HourForge X does not generate cases or gift cards.

Account settings let you choose a label and a group duration of 5–240 minutes. Settings are saved separately for each account.

## Accounts and libraries

Use **Add account**, then sign in with its Steam account name and password, or choose QR code. Each connected account has independent login sessions, priorities, playtime groups and card status. A pending QR login does not block other accounts. The same Steam account cannot run under multiple Steam HourForge X profiles at once.

**Find games** can scan your connected account's full library or look up a public Steam profile by URL, SteamID64 or custom name. Private and empty libraries may not be available. Looking up another profile does not grant ownership of its games; only games in the selected account's library can be prioritized.

Use **Pause all** or **Resume all** for connected accounts. Disconnecting an account preserves its saved login for reconnecting later.

## Türkçe kullanım

**Kütüphane** bölümünde yıldız verdiğin oyunlar, **Önce saat** modundaki her grupta açık kalır. Diğer oyunlar kalan yerlerde sırayla çalışır. **Önce kart** modu, kart hakkı bulunan oyunları tek tek çalıştırır ve bu sırada saat öncelikleri bekler.

**Hesap ekle** ile başka bir hesabı QR koduyla bağlayabilirsin. **Oyun bul** bölümünde kendi kütüphaneni yenileyebilir veya herkese açık bir Steam profilini arayabilirsin. Dil seçimi tarayıcıda, hesap ayarları ise `config.json` dosyasında saklanır.

## Local data and diagnostics

- `config.json`: account settings; configurations may contain credentials if you set credential login manually.
- `data/tokens/`: saved Steam refresh tokens. Keep these private.
- `data/steam/`: Steam client cache for each account.
- `data/steam-hourforge-x.log`: output from the desktop launcher.

The status API contains public-facing account state and QR challenges, never passwords, shared secrets, session cookies or refresh tokens. Control requests are restricted to the dashboard's local origin. No analytics or external account service is used by Steam HourForge X. Game artwork is loaded from Steam's CDN.

The live “reported” state confirms that the playing state was sent to Steam; it does not independently verify accumulated Steam hours. Library playtime is refreshed on library scans. Steam's ownership, playtime and drop rules continue to apply.

## Development

`npm test` runs scheduler, parsing, account lifecycle, multi-account management, localization and local API tests. `npm run build` compiles the TypeScript backend. The dashboard uses plain JavaScript and CSS under `ui/`.

## Account photos, profile shortcuts and About

The Accounts page shows the signed-in Steam persona name and avatar. A default silhouette is used if Steam cannot return an avatar. Go to Profile opens the matching Steam profile. VacList, CSRep, CSStats and CSWatch buttons each open the selected SteamID on that service using its own site icon. Results are supplied by the external service; no ban/status result is fabricated by the app.

The bilingual About page explains the product, local data handling, supported features and upstream credits. Icon origins are recorded in [docs/LOGO_SOURCES.md](docs/LOGO_SOURCES.md).

## Prepare a GitHub upload

```sh
npm run package:source -- /absolute/path/to/a/new-output-directory
```

Upload the contents of that source directory. It includes a SHA-256 manifest, build scripts, tests, CI workflow and license notices. It excludes account configuration, login tokens, logs, caches, installed dependencies and the private local runtime. The unmodified SAM.API DLL is intentionally bundled with its license; the app's native helper EXE is rebuilt from C# source.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [docs/RELEASE_CHECKS.md](docs/RELEASE_CHECKS.md). The Windows and Linux CI definitions are included; CI runs only after you upload the project to your repository. No repository URL or successful GitHub Actions run is claimed before that happens.

## Docker (hours/cards dashboard only)

The provided Compose file publishes the dashboard only to `127.0.0.1:17321`. Start with `docker compose up --build`. Add accounts and scan the QR in the dashboard. The Linux container cannot use Windows SAM, and that feature returns a Windows-only error. Docker was not available for a live image test in the preparation environment.

## License

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md` for upstream attribution and dependency notices. Steam HourForge X is an independently customized derivative and is not affiliated with Valve or Steam.

## Version 2.1 additions

- The activity page shows the current game group and the next group. Full Queue lists all groups in execution order, with priority games marked by stars.
- Game lists start collapsed. Expand the count to view games; search opens the matching results.
- Find Games includes manual App ID/store-link entry. Steam product data verifies the title. A manually added title does not create a game license or guarantee playtime credit.
- Achievement progress is fetched only when requested and cached for ten minutes. It displays actual unlocked/total counts when Steam exposes them. Missing achievements can be reviewed and completed using the Windows-only SAM integration after a game-specific confirmation.
- Sign Out disconnects the account and clears its saved refresh token and any manually configured credentials. Reconnecting requires a new QR approval. Other accounts are unaffected.
- Same-group playtime reports are throttled, duplicate achievement requests are coalesced, and results from scans started before sign-out are discarded.


## SAM integration (Windows)

The unmodified SAM.API 7.0.37 library is bundled under native/sam, with its original license. The C# adapter source is in native/AchievementBridge.cs. `npm run build` compiles the adapter for x86 using the installed .NET Framework compiler.

Check achievements, then choose Complete missing achievements if any remain. The preview connects to the Steam desktop client, checks that its SteamID matches the selected account and that it owns the game, then lists actual missing achievements. Only Confirm and complete writes changes. The confirmation is bound to that account and game, expires after two minutes and is single-use. No achievement changes happen just by checking or opening the preview.

Steam must be online and no game should be running in another session. Farming reports wait while the native operation runs. Steam/game rules and server-controlled achievements may reject changes; the UI reports only the outcome returned after StoreStats confirmation and a subsequent stats read. Zero ban/account risk is not guaranteed. Character stats, leaderboards and already-unlocked achievements are not modified. This feature is separate from card farming and does not guarantee rewards.

Completion attempts are recorded locally in data/achievement-actions.jsonl. A timeout after submission can mean an unknown outcome; recheck before retrying. The original README's read-only achievement behavior describes version 2.1; version 2.2 adds this explicit confirmation flow.

## Profile shortcuts and identity

Account cards display the Steam photo, display name, SteamID64, Steam2 ID and vanity path when available. Open the selected account on Steam, VacList, CSRep, CSStats, CSWatch or SteamIDCheck with a single click. These are external links; the application does not claim to verify results returned by those services. Flag buttons switch between English and Turkish.

## Project owner

**Yusuf Kasapoglu** · [Steam: yuu55uuf](https://steamcommunity.com/id/yuu55uuf/) · [GitHub](https://github.com/ykasapoglu06-bit)

Built on the upstream MIT project, with its attribution preserved. The provided project logo and third-party service marks identify their respective owners; this project is not affiliated with Valve or Steam. See [third-party notices](THIRD_PARTY_NOTICES.md).

### Achievement selection and session handoff

The local achievement editor is available even when community achievement pages are private or unreadable. Select one or more missing achievements in the preview, then confirm. For Windows native operations the farmer temporarily disconnects to avoid competing with the desktop Steam session, then reconnects using the saved token. Completion is verified in a separate native read. Some server-controlled achievements can still be rejected.

The cards-first dashboard shows the active eligible game, its remaining rights and the next game. When no rights remain, hours rotation resumes automatically with your saved priorities. A badge-counter decrease is an observation, not a guaranteed item drop time.

### Remove an account from the app

Open **Accounts → Remove from app**, or use the same option in **Account settings**. Check the account name in the confirmation dialog. Removal stops its running tasks, clears its saved sign-in and removes its entry and preferences. Your Steam account, games and achievements are unaffected. You can remove the last account; the app will show an empty list with an Add account button. Removal is unavailable during an achievement operation. To use the account again, add it and sign in.
