# Release verification

Version 2.3.0 adds Steam persona photos and names, Steam profile links, external profile shortcuts and a bilingual About page.

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

