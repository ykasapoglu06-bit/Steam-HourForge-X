# Release verification

Version 2.3.0 added Steam persona photos and names, Steam profile links, external profile shortcuts and a bilingual About page.

Run automated checks:

```sh
npm ci
npm test
npm run build
```

The test suite covers scheduling and priority limits, card/achievement parsing, profile URL validation, account isolation, credentials omitted from public state, local-origin controls, SAM preview expiration and confirmation, native-operation failure recovery, bilingual static labels, and DOM interactions including account links and About navigation.

Use a fresh source directory for an installation check. With no config or environment credentials, the app creates and saves a default full-library QR account and shows its sign-in challenge in the dashboard. No real Steam login or achievement write is required for the tests.

The local HTTP server and launcher can be smoke-tested without opening a visible browser. Where a browser connection is available, also inspect desktop/mobile layouts and test the external links. External sites may require sign-in or show anti-bot/rate-limit pages. This application only creates the correct profile URL; it does not certify their returned ban/reputation/statistics data.

The Linux Docker recipe is included, but a release should not claim a Docker image was tested unless it was actually built and started. SAM is unavailable inside the Linux container. Tests mock achievement writes; they are not evidence of a successful real-account unlock.

## 2.3 dependency maintenance

Zod 4 uses `prefault` for nested settings defaults. Vitest 5 and Vite 8 replace the vulnerable legacy test toolchain. Transitive overrides select adm-zip 0.6.1+ and protobufjs 7.6.6+; the latter replaces steam-appticket’s older protobufjs 6 runtime, whose generated-message API remains compatible. Tests, native build and real Steam login/library reporting are checked after these changes. `npm audit` reports zero known vulnerabilities at preparation time; this is not a permanent security guarantee.


## Version 2.4.0

Interactive username/password sign-in, email/authenticator code retry on the same session, device/email approval and QR choice. A regression test reproduces the immediate no-Guard event race; listeners are now registered before authentication begins. Cancellation is awaited before changing methods. Dashboard passwords are ephemeral and never copied into persisted configuration or public account state. Login and Guard routes enforce the same exact local Host/Origin checks as other controls. Tests also verify masked/cleared inputs, disabled empty-account controls, inline Guard errors and account-scoped notices.

UI review: compact sign-in workspace, consistent panel spacing, independent account-list scrolling, keyboard-accessible sign-in tabs, scoped achievement errors, dismissible notices, wrapped account actions, image fallbacks and responsive layouts. Real password sign-in requires the owner to enter their password locally; automated tests use simulated Steam sessions.

### Achievement/card verification follow-up

Fixed two real integration issues: unavailable community-page counts hid the local editor; overlapping desktop and farmer game sessions could block achievement writes. Windows now prefers native achievement reads, with a web fallback when the client is unavailable. The farmer disconnects for a native operation, waits for its session to release, and reconnects afterward, preserving manual pause and mode. Writes can select a subset of the preview; a separate native process rereads the result before success is reported. A real one-achievement write was verified end to end, and farming reconnected afterward. No bulk achievement write was performed.

Cards-first runs one eligible game, shows the current game and remaining badge-page rights, and resumes the hours queue after rights are exhausted. Observed right decreases are tracked per process/account and are not an inventory or market-value guarantee. Automated tests cover the transition back to hours. At verification time a real account had 14 eligible games and 60 remaining rights; a new card drop was not independently observed during this short check.

## Version 2.4.1

Account removal is available on account cards and in settings, with an account-specific confirmation. It clears saved sign-in and profile metadata after stopping the account, invalidates achievement previews, and saves the remaining list. Empty account lists survive restart. Tests cover removal cancellation, last-account removal, adding afterward, local Origin/confirmation requirements and blocking during native operations. A regression test also keeps the Steam profile display name separate from the login account name.

Humanizer review updated both languages: account creation no longer promises QR-only login, sign-out copy covers password and QR methods, and account removal explains its local scope. Marketing-style headings and technical language in user flows were shortened. Localization keys and substitution placeholders are retained.
