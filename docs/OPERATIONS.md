# Operations, upgrades and recovery

[Documentation](README.md) · [Configuration](CONFIGURATION.md) · [Troubleshooting](TROUBLESHOOTING.md)

Run commands from the installation root under the same Windows account used for setup. The companion, HTTP server and tunnel are separate processes; a running MCP connection does not itself collect game data.

## Daily use

```powershell
.\scripts\Start-Companion.ps1
npm run doctor
```

Start once, then use the minimap icon when you want a SavedVariables refresh. The watcher checks saved files; the icon does not receive an acknowledgement from Windows. Inspect game `observedAt`, not only collector `success_at`.

For an already-provisioned private tunnel, run `Connect-Tunnel.ps1 -TunnelId 'YOUR_TUNNEL_ID'`. Follow [ChatGPT setup](CHATGPT.md) before using it. Keep the PC awake and both the companion and tunnel running when you need new data available to ChatGPT.

| Process | Start | Stop | Role |
| --- | --- | --- | --- |
| Companion | `scripts/Start-Companion.ps1` | `scripts/Stop-Companion.ps1` | File imports and opt-in optical capture |
| Optional HTTP MCP | `scripts/Start-Companion.ps1 -Http` | `scripts/Stop-Companion.ps1` | Authenticated local HTTP reads |
| Managed tunnel | `scripts/Connect-Tunnel.ps1 -TunnelId YOUR_TUNNEL_ID` | `tools/tunnel-client/tunnel-client.exe runtimes stop wow-character-intelligence` | Private remote access to its stdio MCP child |
| Foreground stdio client | Client-specific launch of `node dist/src/cli.js stdio` | Close the MCP client/session | Local read-only queries |

`Start-Companion.ps1` records PIDs and avoids launching a second identified worker. A “Started” message means the process launched, not that every source or secret is valid. Confirm `doctor`, recent local logs and a representative MCP call. Changing configuration paths while an existing worker runs requires stop/start; the start script does not replace it automatically.

## Automatic startup

```powershell
.\scripts\Set-Startup.ps1 -Enable
# To undo:
.\scripts\Set-Startup.ps1 -Disable
```

This creates/removes a current-user Startup shortcut. It starts only the companion watcher, using the installation's default config. It does **not** start the HTTP listener or tunnel. Startup is opt-in; unattended reboot/reconnect is not certified. Moving the installation requires recreating the shortcut and verifying the tunnel's command paths.

## Mode changes

`Configure-Sync.ps1` opens the Windows settings dialog. Use `-Mode reload`, `screen`, `both` or `off` for command-line configuration. Make the corresponding selection in `/wci options`. Existing observations remain queryable when acquisition is off; their age continues to increase. Manual Blizzard sync is independent.

The watcher observes config changes independently of file scanning. Optical opt-out revokes the helper; a file import already in progress may finish. Changes to file sources or polling settings schedule a new batch after the current batch completes. Database/mode changes need a companion restart; server freshness/port/secret changes need a server restart.

## Upgrade and rollback

1. Stop the companion/HTTP server, stop the project's tunnel runtime and close any local stdio clients. Do not stop unrelated applications.
2. Make a private backup of `config.local.json`, `data/`, any environment configuration, and the installed addon folder. Copy SQLite only while its writers/readers are stopped; retain any adjacent WAL/SHM files with it. Protect backups like the original data. DPAPI ciphertext normally requires the original Windows account/machine context; it is not a portable plaintext credential backup.
3. For a clean Git checkout, use `git pull --ff-only`. If tracked local edits exist, review and preserve them first. For a ZIP upgrade, extract to a separate staging directory and copy the shipped source/runtime files into the existing installation. **Do not overwrite your local config with the ZIP's empty `config.local.json`, or replace `data/` or private tunnel profiles.** Keeping the installation path avoids stale absolute runtime paths.
4. Run `npm ci` and `npm run build`. On a Git source checkout, also run `npm test` and `npm run check:docs`. The source/publication checks use Git and are not an extracted-ZIP installation requirement.
5. Upgrade the installed addon. For the single-character installer, repeat your original arguments with `-ReplaceExisting`; this backs up the old addon and regenerates **one** identity mapping. Preserve manually maintained multi-character `Identity.lua` entries separately. Do not copy the repository's empty `Identity.lua` over your authorized mapping.
6. Fully exit and relaunch WoW if files or `.toc` declarations changed. An ordinary `/reload` is sufficient for subsequent changes to an already-loaded Lua file. Confirm `/wci status`, the minimap icon and the first saved capture.
7. Start the companion and existing tunnel again. Verify `doctor`, then a real MCP lookup with non-sample provenance and the new observation timestamp.

The current store remains schema version 1; these updates require no migration. To roll back code, stop the same processes, restore the prior source/addon backup, rebuild and restart. Restore a database backup only deliberately: it discards observations newer than that backup. Never roll back into a version that cannot safely read the current schema.

## Backup, export and deletion

```powershell
# KEY comes from your own doctor/list_characters result:
node dist/src/cli.js export --character 'YOUR_CHARACTER_KEY' --output data/private-export.json
```

Export writes a new JSON bundle of retained snapshots; it refuses to overwrite an existing output. It is an archive, not a directly importable `format:json` single snapshot. There is no bulk restore CLI. Database backup is the restore route for a complete installation.

For deletion, stop acquisition and remove/disable the relevant source mappings first. The local `delete` command requires both `--character KEY` and `--confirm KEY`. It affects the normalized store, not game files, exports, API caches, remote credentials or existing assistant conversations. Follow the complete [deletion/uninstall procedure](SECURITY.md#export-deletion-and-uninstall).

`Uninstall.ps1` stops the companion and removes its optional startup shortcut. `-ClientPath` additionally removes that client's WCI addon folder after validation. It preserves local data and SavedVariables; stop/revoke the private tunnel separately.

## Logs and capacity

Diagnostics are under `data/logs/`: `watch.stderr.log`, `serve.stderr.log` and their stdout counterparts. Logs and exports may reveal private paths and character information; do not post them publicly. `doctor` reports detailed local errors; MCP sync errors are redacted.

History and logs currently have no automatic retention/rotation. Optical mode can generate many more snapshots than occasional reloads. Monitor disk use and keep private backups; do not edit SQLite rows by hand. There is no per-snapshot pruning command yet. See the [roadmap](ROADMAP.md).
