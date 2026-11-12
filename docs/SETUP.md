# Windows setup

[Documentation](README.md) · [Configuration](CONFIGURATION.md) · [Troubleshooting](TROUBLESHOOTING.md)

This guide starts with reload-only mode. Screen sync and ChatGPT access are separate, optional steps. The maintained live validation target is one Forever installation; other clients need compatibility testing.

## 1. Get the source or release

Install Node.js 24 LTS (24.14 or newer **in the 24 series**) and use PowerShell under the Windows account that will run the companion. Git is needed for a source checkout; a release ZIP can be extracted without Git.

```powershell
git clone https://github.com/bkhouser/WoW4EMCP.git
Set-Location WoW4EMCP
.\scripts\Initialize.ps1
```

Alternatively, extract a ZIP from [Releases](https://github.com/bkhouser/WoW4EMCP/releases), enter its `wow-character-intelligence-VERSION` directory and run `Initialize.ps1`. Compare the archive's `Get-FileHash -Algorithm SHA256` result with the release `.sha256` file before extraction.

The initializer installs locked npm dependencies, builds TypeScript, creates an empty local configuration if missing, restricts the default data directory, creates a DPAPI-encrypted local HTTP bearer if missing, and initializes SQLite. It preserves an existing config and bearer. With no sources configured, an empty character list is expected. Normal operation does not require administrator privileges; writing the WoW addon directory may require elevation.

## 2. Find the actual client

```powershell
node dist/src/cli.js discover
# If the installation is elsewhere, supply the parent containing client folders:
node dist/src/cli.js discover --root 'D:\Games\World of Warcraft'
```

Discovery checks known client folder names and lists matching existing SavedVariables files; it does not authorize imports. Confirm the client you play. The addon target must contain `Interface\AddOns`. A new per-character SavedVariables file will not exist until its first normal save.

## 3. Install and authorize the addon

Replace **every placeholder** with your own values:

```powershell
.\scripts\Install-Addon.ps1 `
  -ClientPath 'C:\YOUR_WOW_INSTALL\_forever_' `
  -CharacterName 'YOUR_CHARACTER_NAME' `
  -DisplayName 'YOUR_DISPLAY_NAME' `
  -Slug 'your-profile-slug' `
  -Scope normal `
  -ObservedRealm 'YOUR_OBSERVED_REALM'
```

`CharacterName` and `ObservedRealm` must match the player's name and realm reported by the client. `DisplayName` is your canonical display label; `Slug` and `Scope` are the stable identity used in the store. On Forever, scope is the configured ruleset; on ordinary clients it is the realm scope. These values are explicit configuration, not an inferred account identity.

The installer writes one authorized mapping in `Identity.lua`. An absent or ambiguous match disables collection. For other versions, pass `-GameVersion`, `-Region` and the actual `-InterfaceVersion`; changing the number alone does not establish API compatibility. For multiple own characters, use separate source mappings and deliberately maintained addon identity entries. Re-running the installer replaces its generated identity file rather than appending an alt.

## 4. Produce the first snapshot

Exit and relaunch WoW once after installing the addon or upgrading its TOC/file declarations. In the correct client's AddOns menu, enable **WoW Character Intelligence**. Log into the authorized character outside combat.

Use `/wci status`, then left-click the circular book icon around the minimap, or run `/wci sync`. The addon captures and reloads the interface. A failed capture or combat state prevents the reload. There is no automatic reload.

Run discovery again. The new file is per-character, typically under:

```text
CLIENT/WTF/Account/ACCOUNT/SCOPE/CHARACTER/SavedVariables/WoWCharacterIntelligence.lua
```

Use the discovered path, not a guessed account or realm directory.

## 5. Authorize the Windows source

Edit the existing `config.local.json` and place this object **inside its `sources` array**. Keep the other top-level fields. This example is a template, not a working character:

```json
{
  "id": "my-character-addon",
  "format": "addon",
  "path": "C:/YOUR_WOW_INSTALL/_forever_/WTF/Account/YOUR_ACCOUNT/YOUR_SCOPE/YOUR_CHARACTER/SavedVariables/WoWCharacterIntelligence.lua",
  "identity": {
    "gameVersion": "forever",
    "region": "us",
    "scope": "normal",
    "slug": "your-profile-slug",
    "name": "YOUR_DISPLAY_NAME"
  },
  "expectedName": "YOUR_DISPLAY_NAME",
  "expectedPlayerName": "YOUR_CHARACTER_NAME",
  "expectedRealm": "YOUR_OBSERVED_REALM"
}
```

The identity and player/realm checks must agree with the addon. Use forward slashes in JSON paths, or escape backslashes. Do not include credentials or unrelated characters. See [configuration](CONFIGURATION.md) for multiple sources and defaults.

## 6. Import and start the companion

```powershell
npm run sync
npm run doctor
.\scripts\Start-Companion.ps1
```

`sync` imports saved files once. `doctor` should show your intended character and successful source status. `Start-Companion.ps1` starts a hidden watcher; it does not start the tunnel. The default poll is 15 seconds after each completed file batch. No tray icon is included.

For a local HTTP MCP client, add `-Http` to `Start-Companion.ps1`. HTTP is optional for the stdio/tunnel path. It binds to `127.0.0.1:18794` by default and requires the encrypted bearer. Never expose it anonymously to the Internet.

## 7. Verify evidence, then connect an assistant

```powershell
npm run smoke
# Optional, if the authenticated HTTP server is running:
npm run smoke -- --http
```

The smoke check lists tools/characters and queries quest 1740 on the first configured character. It tests transport and schemas; the quest may legitimately be unobserved. Its output contains private character evidence, so keep it local.

For a meaningful live check, use your actual key from `list_characters`, query a quest currently in your log, and verify `sample:false`, `source:addon`, `transport:savedvariables`, a recent `observedAt`, objective counts and storage coverage. A recent `success_at` alone does not prove recent game data.

Follow [Private ChatGPT connection](CHATGPT.md) for the final account-specific steps. Do not claim the connection works until a real tool invocation succeeds. Optional startup and screen mode are documented in [operations](OPERATIONS.md) and [sync modes](SYNC-MODES.md).
