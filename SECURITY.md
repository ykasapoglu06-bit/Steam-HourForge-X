# Security and local data

The dashboard binds to `127.0.0.1` by default. Do not expose it through port forwarding or a public reverse proxy. The optional Docker container binds internally to all interfaces, while the example Compose file publishes only to host loopback.

Control endpoints require the dashboard's exact local Origin and JSON content type. Account names used for newly created profiles are generated internally. Public profile input is restricted to Steam profiles; redirects carrying Steam cookies are restricted to the Steam Community origin. Avatar URLs are restricted to Steam-owned image hosts. The status API omits passwords, shared secrets, cookies and refresh tokens.

Keep `config.json`, `.env`, `data/`, `.runtime/`, logs and cache directories out of GitHub. Use `npm run package:source` to produce an allowlisted source directory. The packager never copies those paths and scans text files for common credential formats. This is a useful check, not a guarantee that every possible secret format can be detected.

The Windows SAM bridge verifies the local SteamID and game ownership. Completion needs an expiring, single-use preview token for the selected account and game. It never uses arbitrary shell commands or accepts an executable path from the browser. It does not modify game files, inject into running games, edit leaderboards or change numeric player statistics. Achievement changes can still be rejected by Steam/game rules; account safety is not guaranteed. Recheck Steam after an unverified or timed-out write before trying again.

External account-service buttons open only the selected profile's public SteamID on the named site. No credentials or session cookies are sent to those sites by the app. Each service has its own availability and policies.

If reporting a security issue, do not post tokens, full account configuration or unredacted logs publicly. Send a minimal reproduction to the repository maintainer using the private reporting method they provide. This source package does not invent a maintainer contact or repository URL.
