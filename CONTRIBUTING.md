# Contributing

Use Node.js 22.13 or newer. Run `npm ci`, `npm test`, then `npm run build`.

Windows builds also compile the x86 SAM adapter using the .NET Framework C# compiler. The unmodified SAM.API DLL and its original license are included under `native/sam/`. Linux builds support the dashboard and farming but skip the Windows-only adapter.

Keep credentials and real account identifiers out of examples, fixtures, screenshots and issues. Use `config.example.json` as a template; never commit `config.json`, `.env` or `data/`.

Add English and Turkish strings together in `ui/i18n.js`. Add behavior tests for changes to scheduling, authentication, local API access, achievement confirmation or account isolation. Do not test achievement writes against real accounts in CI. Use mocks for mutation paths and clearly distinguish them from read-only live checks.

Before sharing, run `npm run package:source -- /absolute/path/to/a/new-directory`. The output includes a SHA-256 source manifest and excludes local runtime files and account state.
