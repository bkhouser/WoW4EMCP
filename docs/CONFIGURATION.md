# Configuration reference

[Documentation](README.md) · [Setup](SETUP.md) · [Sync modes](SYNC-MODES.md)

The source of truth is [`src/config.ts`](../src/config.ts), with source validation in [`src/acquisition.ts`](../src/acquisition.ts). Configuration is strict JSON: no comments, duplicate keys or executable expressions. Unsupported top-level configuration fields are rejected. Start from [`config.example.json`](../config.example.json). Keep `config.local.json` private.

## File selection and paths

The CLI uses `--config PATH`, then `WOW_MCP_CONFIG`, then `config.local.json` in the working directory. Database, secret-directory and source paths resolve relative to the config file. `optical.executablePath` should be an absolute path to the actual game executable; the settings script produces one. Scripts normally use the config in the project root. `Configure-Sync.ps1` and `Start-Companion.ps1` accept `-ConfigPath`.

## Main fields

| Field | Default | Contract |
| --- | --- | --- |
| `database` | Required; example `data/characters.sqlite` | SQLite path; use a different file for samples |
| `mode` | `real` | `real` or `sample`; database mode is fixed when created |
| `sources` | `[]` | Up to 100 explicitly authorized file sources; unique IDs |
| `savedVariablesEnabled` | `true` | Enables configured file imports in `sync`/`watch`, including configured JSON/legacy sources |
| `pollSeconds` | `15` | Integer 5–3600; delay after a file batch finishes |
| `staleSeconds` | `900` | Integer 60–604800; query-time freshness threshold |
| `secretDirectory` | `data/secrets` | Current-user DPAPI files; protect custom locations with appropriate ACLs |
| `http.port` | `18794` | Integer 1–65535; listener remains loopback-only |
| `http.tokenSecret` | `mcp-bearer` | DPAPI secret name, letters/digits/underscore/hyphen |
| `optical.enabled` | `false` | Explicit permission to start the screen reader |
| `optical.sourceId` | `null` | ID of one configured addon source with expected player and realm |
| `optical.executablePath` | `null` | Exact executable whose foreground window may be inspected |
| `blizzard` | Absent | Optional API client settings; manual `blizzard-sync`, not periodic watcher work |

The addon reminder and `staleSeconds` are **independent**. The reminder measures time since an addon save opportunity; freshness measures the age of each observed game fact. Changing one does not change the other.

The settings dialog rejects changes made since it opened and coordinates its own writers before atomic replacement. Do not edit the file manually while saving the dialog: an unrelated editor can still race the final comparison/replacement.

The watcher rechecks configuration about every second. An invalid config pauses optical capture and prevents new file batches; a file read already underway can finish. Changes to the database path or `mode` require a restart. HTTP port, bearer selection and `staleSeconds` are read when each MCP process starts; restart that server/tunnel to apply them.

## Source fields

| Field | Meaning |
| --- | --- |
| `id` | 1–60 letters, digits, underscores or hyphens; choose a non-sensitive local label |
| `path` | Exact file to read; discovery does not authorize a source by itself |
| `format` | `addon`, `wowadvisor` or `json` |
| `identity.gameVersion` | `forever`, `classic-era`, `mists-classic`. The schema also accepts `retail` as an identity value outside the project's client scope. |
| `identity.region` | `us`, `eu`, `kr`, `tw` |
| `identity.scope` | Explicit ruleset/realm scope; 1–100 characters |
| `identity.slug` | Stable profile slug; 1–100 characters |
| `identity.name` | Canonical display name; 1–100 characters |
| `expectedName` | Required expected display name for addon/JSON; expected player name for the legacy WowAdvisor adapter |
| `expectedPlayerName` / `expectedRealm` | Explicit observed subject checks; both required for addon file/optical acquisition |

A character key is the lowercased, URI-encoded `gameVersion:region:scope:slug`. Two characters sharing a name across versions/realms cannot overwrite each other's records. Changing the key creates a different history; no automatic identity migration is provided.

`addon` accepts only the allowlisted export/settings strings and parses the export as JSON without executing Lua. `wowadvisor` adapts its single export string conservatively. `json` is for deliberately authorized single schema-version-1 snapshots; it is not a way to bypass sample/real or identity validation. See [architecture](ARCHITECTURE.md).

## Mode mapping

| Windows setting | File imports | Optical receiver |
| --- | --- | --- |
| `reload` | On | Off |
| `screen` | Off | On |
| `both` | On | On |
| `off` | Off | Off |

These modes control `sync`/`watch`. An explicitly invoked `blizzard-sync` is independent. Addon mode settings are per-character and separately saved by WoW. `off` does not delete history, disable normal WoW saves or prevent the addon from maintaining its in-memory snapshot. It stops the selected export controls and watcher acquisition when selected in both places.

## Optional Blizzard client

```json
{
  "clientId": "YOUR_BLIZZARD_CLIENT_ID",
  "clientSecretName": "blizzard-client-secret",
  "characters": [
    {"gameVersion":"forever","region":"us","scope":"normal","slug":"your-profile-slug","name":"YOUR_DISPLAY_NAME"}
  ]
}
```

Place this object under `blizzard`. Store the client secret through `Set-Secret.ps1 -Name blizzard-client-secret`, using its secure local prompt. Then invoke `node dist/src/cli.js blizzard-sync`; `--force` bypasses the local response cache. Do not put a Battle.net password, access token or client secret in JSON. Authenticated Forever contracts and account-wide OAuth remain unverified/deferred; see [sources](SOURCES.md).
