# WoW Character Intelligence — public beta

A local-first, read-only World of Warcraft character evidence service for Windows: **Lua addon → SavedVariables or optional screen marker → collector → SQLite → MCP → your AI assistant**.

**Experimental release 0.2.0-beta.2.** The capture and private ChatGPT tunnel workflow have been exercised on one Windows 11 / Forever installation. Retail, Classic Era and Mists Classic identities are modeled, but their live addon compatibility is **not certified**. Authenticated Blizzard Forever endpoints and unattended reboot recovery remain unverified. See [coverage](docs/COVERAGE.md) and [validation](docs/VALIDATION.md).

This is an unofficial community project, not affiliated with or endorsed by Blizzard Entertainment or OpenAI. World of Warcraft and other product names belong to their respective owners. The MIT license covers this project's original code, not game data, trademarks or third-party software.

## What it does

* Reads active quests with IDs, objective counts and completion evidence. **Completed objectives are not confirmed turn-ins.**
* Exposes equipment, bag quantities/locations, talents, spells and available progression fields.
* Preserves source timestamps, history, conflicts, unknown values and incomplete storage coverage.
* Provides 13 schema-validated, bounded, read-only MCP tools. No gameplay automation, memory inspection, chat capture or MCP game-command tools.
* Keeps real and synthetic data separate. All examples in this repository are synthetic; no user's captures or deployment credentials are included.

Choose **reload-button sync**, optional **on-screen sync**, or both. The draggable circular minimap button gently pulses when a save is due. Configure the addon with `/wci options` and Windows with `scripts/Configure-Sync.ps1`. Screen capture is off by default. See [sync modes](docs/SYNC-MODES.md).

The addon refreshes in memory on game events. WoW normally writes SavedVariables on `/reload` or logout, **not continuously**. The companion polls saved files; it cannot force the game to save them. Unopened bank/storage remains unobserved.

## Requirements

Windows 11 x64, Node.js 24 LTS (24.14 or later in the 24 series), PowerShell and an authorized local WoW installation. Node's SQLite feature may emit an experimental warning on stderr. The tunnel client is optional and pinned to the tested version 0.0.20 with a fixed archive SHA256.

## Try synthetic data first

```powershell
git clone https://github.com/bkhouser/WoW4EMCP.git
Set-Location WoW4EMCP
npm ci
npm test
npm run demo
node dist/src/cli.js show --config config.sample.json --character forever:us:normal:sample-examplewarlock
node dist/src/cli.js stdio --config config.sample.json
```

The last command starts an MCP stdio server and waits for an MCP client; it is not an interactive shell. For a client, use `node` with absolute arguments to `dist/src/cli.js`, `stdio`, `--config`, and `config.sample.json`. Sample and real databases must never be combined.

## Capture your own character

1. Run `.\scripts\Initialize.ps1`. This installs locked dependencies, builds, creates an empty local configuration and restricts the data directory. Credentials use current-user Windows DPAPI. Run under the same Windows user as the companion.
2. Run `node dist/src/cli.js discover` and identify your actual client and per-character SavedVariables locations. Discovery does not authorize importing every character it finds.
3. Install the addon, replacing every placeholder below with your own observed values:

```powershell
.\scripts\Install-Addon.ps1 `
  -ClientPath 'C:\YOUR_WOW_INSTALL\_forever_' `
  -CharacterName 'YOUR_CHARACTER_NAME' -DisplayName 'YOUR_DISPLAY_NAME' `
  -Slug 'your-profile-slug' -Scope normal -ObservedRealm 'YOUR_OBSERVED_REALM'
```

4. Enable **WoW Character Intelligence** in WoW's AddOns menu. After this upgrade, exit and relaunch WoW once. Outside combat, left-click the **WCI book icon around the minimap** (or run `/wci sync`). Right-click the button or use `/wci options` for settings.
5. Add an explicitly authorized source to `config.local.json`. This is a template, not a working identity:

```json
{
  "id": "my-character-addon",
  "format": "addon",
  "path": "C:/YOUR_WOW_INSTALL/_forever_/WTF/Account/YOUR_ACCOUNT/YOUR_SCOPE/YOUR_CHARACTER/SavedVariables/WoWCharacterIntelligence.lua",
  "identity": {"gameVersion":"forever","region":"us","scope":"normal","slug":"your-profile-slug","name":"YOUR_DISPLAY_NAME"},
  "expectedName": "YOUR_DISPLAY_NAME",
  "expectedPlayerName": "YOUR_CHARACTER_NAME",
  "expectedRealm": "YOUR_OBSERVED_REALM"
}
```

6. Run `npm run sync`, `npm run doctor`, then `.\scripts\Start-Companion.ps1 -Http`. The HTTP listener binds **127.0.0.1** and requires a bearer on every request. Stdio is independently useful and does not require HTTP.

Automatic startup is opt-in via `Set-Startup.ps1 -Enable`; this starts the companion, not the tunnel. Inspect the [operations and deletion instructions](docs/SECURITY.md) before removing local data. `Uninstall.ps1` preserves data by default.

## Query tools

| Area | Tools |
| --- | --- |
| Status/history | `list_characters`, `get_character_overview`, `get_character_changes`, `get_sync_status` |
| Quests | `get_quest_log`, `get_quest_details`, `get_completed_quests`, `analyze_quest_log`, `get_quest_chain_status`, `get_dungeon_quest_readiness` |
| Gear/storage/progression | `get_character_data`, `search_items`, `compare_equipment` |

See [example calls](docs/EXAMPLES.md). Missing data is not evidence of an empty bank, an abandoned quest or an available quest. Chain/readiness tools use caller-supplied quest IDs; there is no comprehensive licensed quest database.

## Connect your private ChatGPT plugin

Follow the [connection runbook](docs/CHATGPT.md). Every user needs their **own** account access, restricted runtime credential, tunnel and owner-private plugin. This repository contains no shared hosted service and grants no access to the maintainer's data. Keep the PC and runtime running. A public source repository does not make your private data service public.

The server has no multi-user subject authorization. Do not share a tunnel/plugin across users or expose the loopback bearer server as a public service. Public hosting requires additional OAuth and owner-authorization implementation.

## Blizzard API and compatibility

Client-credentials OAuth, allowlisting, retries, caching and conservative profile/equipment/completed-quest normalization are implemented. Real authenticated Forever responses are still unverified; reported namespaces/routes are experimental. Account-wide authorization-code consent is deferred. Never provide a Battle.net password. See [source assessment](docs/SOURCES.md).

## Development and releases

```powershell
npm ci
npm test
npm run check:publication
.\scripts\Package.ps1
```

Windows CI runs tests, a sample-store check, packaging and Gitleaks. Release archives exclude credentials, data, local configuration and dependencies; after extraction, run `Initialize.ps1`. The shipped `config.local.json` is generated from the empty example, never copied from a user's setup. Do not attach logs, SQLite files, SavedVariables or unredacted configuration to public issues.

[Architecture](docs/ARCHITECTURE.md) · [Security reporting](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Third-party notices](THIRD_PARTY_NOTICES.md) · [Roadmap](docs/ROADMAP.md)
