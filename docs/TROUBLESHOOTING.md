# Diagnostics and troubleshooting

## Normal daily use

Start the companion once (`scripts/Start-Companion.ps1 -Http`), play normally, and reload/logout when you want a disk snapshot. `npm run doctor` reports per-source attempts and last success. `get_character_overview` reports actual observation age. `data/logs/watch.stderr.log` and `serve.stderr.log` contain local diagnostics. Node's SQLite experimental warning on stderr is expected.

No terminal window is left visible by background start. A tray UI is not included; the small `/wci status` interface, CLI diagnostics and logs are the release's status surfaces. Logs are local and currently need occasional rotation if you run for months.

## Addon not listed / no snapshot file

Exit WoW completely and relaunch the correct client. At character selection choose **AddOns** and enable **WoW Character Intelligence**. Verify the folder contains the `.toc`, `Identity.lua` and `Collector.lua` directly, with no extra nested folder. Run `/wci status`. If no identity matches, compare the configured character name and `GetRealmName` result; do not relabel an unknown character automatically.

Run `/wci capture`, then `/reload` outside combat. New addon SavedVariables are **per-character**, unlike WowAdvisor's account-wide file. Use `node dist/src/cli.js discover --root 'C:/actual/World of Warcraft'` and update the exact path. `ENOENT` before the first save is expected. The watcher retries and clears the error after a successful capture.

## Stale or missing data

* “Captured in memory” is not confirmation of a disk write. Reload/logout, then wait about 15 seconds for the watcher.
* A fresh import time alongside an old observation means the game data is still old. Restarting the server will not refresh it.
* Bank `not_observed`: open the bank and capture/reload. Closing the bank retains its last observed timestamp. Retail bank support is deferred.
* Professions are currently supplied by WowAdvisor's separate profession-window scans. Their timestamps can be older than the main snapshot. Truncated lists are not complete learned/missing recipe inventories.
* Unknown unspent talent points stay unknown; no level-based estimate is substituted.
* Conflicts preserve alternatives. Consult timestamps and coverage; do not merge unrelated collection scopes or call null a zero.

## Import failures

The reader refuses partial/changing/malformed files. Let WoW finish saving and retry. Never run the SavedVariables as Lua to recover a parse failure. Record only the local source ID and error; avoid sharing the entire character file unintentionally. A bad import leaves the prior valid snapshot intact.

## MCP connectivity

`npm run smoke` tests real stdio initialization/discovery/tool invocation. `npm run smoke -- --http` tests the configured running HTTP server and decrypts its bearer privately. A 401 means missing/wrong credentials, 403 means forbidden Host/Origin, 413 means oversized input, and 429 means local rate/concurrency limits. Open the server through an MCP client, not a normal browser tab.

If the server fails to read its secret, run `Initialize.ps1` or `Set-Secret.ps1` as the same Windows user that runs the companion. Do not copy another Windows account's DPAPI ciphertext. The internal reader explicitly loads Windows PowerShell's Security module to avoid inherited PowerShell 7 module-path conflicts, and trims the encrypted file's line ending.

For port collisions, change `http.port` and restart. Start/stop scripts check the process's command line before acting; a recycled PID belonging to another application is left alone. If a stale process still runs during development, stop it through the provided script before rebuilding/restarting.

## Blizzard / ChatGPT

Blizzard 401/403/404 responses do not establish empty character state. Confirm the app client, region, experimental namespace, explicit identity allowlist and profile availability. The client retries 401 with a renewed token, backs off on 429/5xx and bounds timeout/retry cost. Private/account-wide endpoints need a separate authorization-code flow not included in this release.

For ChatGPT, consult [CHATGPT.md](CHATGPT.md). Verify tunnel runtime readiness, organization/workspace association and Read + Use permission before plugin discovery. A local MCP client is not a ChatGPT invocation. Never use an unrelated tunnel or remove authentication to work around access errors.
