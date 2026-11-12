# Changelog

Changes are grouped by public release. This is experimental software; see [validation](docs/VALIDATION.md) for the difference between automated tests and live compatibility.

## 0.2.0-beta.3 — 2026-11-12

### Fixed

- Require live addon provenance on both SavedVariables and optical ingestion.
- Canonicalize payloads before persistence so undeclared fields do not enter new observations; preserve legacy receipts when unchanged data is re-imported after upgrade.
- Reschedule file sync after mode/source/poll changes, including during an active batch.
- Allow maximum-size optical transfers enough time for both passes.
- Preserve UTF-8 names/paths in Windows mode settings and reject stale configuration saves.

### Documented

- Reworked README with controls, support status, quick start and navigation.
- Added setup, configuration, operations/rollback, all-tool reference, optical protocol, development/release and review guides.
- Added public issue/PR templates and automated documentation-link checks.

Validation: 74 Windows tests passed without skips, plus documentation links and publication checks. See the [review record](docs/REVIEW.md).

## 0.2.0-beta.2 — 2026-11-12

- Added the circular draggable minimap icon: left-click capture/reload, right-click settings, configurable save-due pulse.
- Added reload/screen/both/off selection in the addon and Windows settings; reload-only remains the default.
- Added experimental, separately opted-in optical sync with foreground executable checks, bounded packet decoding and authorized atomic import.
- Added transport provenance and retained history without duplicate current evidence for identical captures received by both routes.
- Hardened SavedVariables parsing for the new settings string and UTF-8 byte escapes.
- Passed 65 Windows tests and clean GitHub CI; owner confirmed live minimap/reload behavior and a connected MCP quest lookup. Live optical capture remains unverified.

[Release and downloads](https://github.com/bkhouser/WoW4EMCP/releases/tag/v0.2.0-beta.2)

## 0.2.0-beta.1 — 2026-11-12

- Initial public source release with sanitized history and synthetic examples.
- Lua addon, stable Windows file collector, SQLite history and 13 bounded read-only MCP tools.
- Private stdio/tunnel workflow and authenticated loopback Streamable HTTP.
- Explicit coverage, freshness, quest objective/turn-in separation and sample/real isolation.
- Windows tests, source/secret checks, license notices and verified release packaging.

[Release and downloads](https://github.com/bkhouser/WoW4EMCP/releases/tag/v0.2.0-beta.1)
