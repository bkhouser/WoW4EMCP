# Code review record

[Documentation](README.md) · [Validation](VALIDATION.md) · [Security reporting](../SECURITY.md)

## 2026-11-12 — Sync controls and publication review

**Baseline:** [`a956c05`](https://github.com/bkhouser/WoW4EMCP/commit/a956c051dfae75e8b8b18b94f5d1a0ec339745f7), public beta 0.2.0-beta.2.

The review examined addon controls/capture, SavedVariables parsing, normalized persistence, optical decoding/reassembly, watcher revocation, Windows configuration, MCP query/transport boundaries, installation/operations and documentation. A separate Sol review focused on sync security and state handling. Reproductions used synthetic records and local tests; no private captures or credentials are part of this report. This is an AI-assisted code review, **not an independent security audit**.

### Findings addressed in this update

| Priority | Finding and trigger | Correction and regression evidence |
| --- | --- | --- |
| P2 | A Windows settings dialog opened before a source was removed could restore its stale copy when saved | Detect concurrent configuration changes and reject stale saves; synthetic save-conflict tests |
| P2 | Repeated mode changes in Windows PowerShell 5.1 could corrupt accented names/paths in UTF-8-without-BOM files | Explicit UTF-8 reads; repeated non-ASCII configuration round-trip test |
| P2 | A configured addon file could claim another source type and avoid the addon player/realm check | Both addon transports require live addon provenance and the configured subject; forged-source and missing-subject rejection tests |
| P2 | Payload validation accepted a parsed schema but persisted the original object, retaining undeclared fields | Persist canonical domain-schema output; nested/root extra-field regression test; canonicalized historical read views prevent false conflicts from older omitted defaults |
| P2 | Re-enabling file imports after a long polling interval retained the old deadline | Config changes reschedule the next batch, including changes during an in-flight batch; immediate re-enable regression |
| P3 | A 256-page optical transfer needed 128 seconds for two passes but expired after 120 seconds | Sender lifetime increased to 180 seconds; maximum-size two-pass test and interrupted-transfer recovery test |

A follow-up review identified one P3 upgrade edge: normalization could insert a second receipt for unchanged legacy bytes. Import now compares canonicalized candidates at the same character/source/capture time, preserving the original body and sync timestamp while keeping distinct transport receipts. A regression test covers this upgrade path.

### Additional checks and documentation corrections

* Read-only tool registration, parameterized query paths, response bounds, loopback bearer/Host/Origin checks and private sync-error redaction were reviewed against tests.
* Setup now states that the source object belongs inside `sources`, addon upgrades can replace a generated single-character identity, and normal file saves are owned by WoW.
* Operations distinguishes companion, HTTP and tunnel processes, startup scope, configuration restart rules, private backups and rollback.
* The tool reference documents OR semantics when both item filters are provided, recipe truncation, history pagination and the lack of unique-instance gear comparison.
* Sync documentation distinguishes addon reminders from data freshness and a visible marker from delivery acknowledgement. Windows/off mode does not erase data or disable explicitly invoked Blizzard API sync.
* Public documentation, issue/PR templates and publication checks exclude private captures, account identifiers and credentials.

### Validation and residual risks

Targeted regressions and the complete Windows suite passed: **74 tests, no failures or skips**, on the development Windows host. See the linked GitHub workflow and [validation record](VALIDATION.md) for the final run. Documentation links, source hygiene, secret scanning and package exclusions are checked separately.

The owner previously confirmed the minimap controls and one-click reload in the Forever client, followed by a real connected MCP quest lookup. **Live optical capture remains unverified.** HDR/scaling/occlusion, sustained combat/focus changes, clean-machine installation and unattended reboot/reconnect still need live testing.

Both file and screen inputs assume a trusted local owner session. A checksum is not sender authentication. Settings writers coordinate in the current Windows session and recheck before atomic replacement; an unrelated editor can still write in the narrow comparison-to-replace interval. Avoid simultaneous manual/config-dialog editing. There is no public multi-user authorization layer, automatic history retention, portable credential backup or schema-migration framework. No audit claim extends beyond the reviewed source and stated test conditions.
