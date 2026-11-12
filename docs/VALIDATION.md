# Validation and limits

This public beta derives from a privately tested installation, but contains no actual character captures, private links, account identifiers or private Git history. Names and character data in tests/examples are synthetic. Do not treat fixture values as live observations.

## Automated coverage

The automated suite covers the six acceptance scenarios: quest-slot evidence, partial objective readiness, inventory coverage, talent evidence, freshness across observations, and isolation between game versions. It also exercises safe SavedVariables parsing, stable reads, transactional import, conflicts, bank-history retention, repeatable-quest semantics, deletion, addon logout/timer handling, real MCP SDK transports, Windows DPAPI helpers, and MCP sync-error path redaction with retained local diagnostics.

Run `npm test` on Windows with localhost sockets available. CI additionally checks documentation links, the sample-store path, package exclusions, public-source hygiene and Gitleaks. Test results from this public source are recorded by GitHub Actions; they do not certify every game API or external account flow.

## Prior live verification, without private records

One Windows 11 / Forever installation successfully captured quest IDs and structured objectives, equipment, bags, allocated talents, spells and progression. A real MCP client and an owner-private ChatGPT plugin retrieved those records with observation timestamps and non-sample provenance. Objective completion and actual turn-in remained distinct; unopened bank remained unobserved.

A logout rescan could yield empty objective arrays during teardown. The exporter now preserves its prior serialized snapshot and flushes pending quest events without querying teardown APIs. Regression tests and a manual post-reload capture verified retained objective counts on that installation.

The pinned tunnel-client initialization workaround passed parallel calls. One later cold-restart request timed out and succeeded on a sequential retry. Continuous availability is not certified.

## Not yet live-certified

* Clean-machine end-to-end installation and unattended reboot recovery.
* Authenticated Blizzard Forever endpoint contracts; unauthenticated 404 responses were inconclusive.
* Bank-open capture, actual turn-in events across sessions and level-up behavior on multiple clients.
* Retail, Mists Classic, Classic Era and account-wide capture.
* Multi-user hosting, public OAuth service operation or unrestricted shared workspaces.

These limits remain visible in the coverage matrix and runtime provenance. Passing synthetic tests does not turn unobserved fields into known values.

The public archive initializer was also exercised in a separate extraction directory on the development host with empty real-source configuration, followed by a successful synthetic query. This is not a clean-machine or live-game certification.

## Configurable sync update

The new suite executes Lua reload-button/reminder/settings behavior and the real Lua optical encoder, decoding frames through the TypeScript receiver into the normalized store. It covers corruption, missing/reordered/repeated pages, timeout, foreign identity rejection, strict two-variable SavedVariables parsing, and screen-mode settings. Windows helper compilation is tested without capturing the screen. On the development installation, the user confirmed both one-click capture/reload and the final circular minimap control worked in the live game. A subsequent real connected MCP quest lookup retrieved the new SavedVariables capture. All 65 automated tests passed on Windows. Live optical display/capture remains unverified.

## Review hardening update

The [review record](REVIEW.md) documents six initial findings, a follow-up upgrade edge and their corrections. Added regressions cover stale configuration saves, UTF-8 names/paths, SavedVariables provenance, canonical payload persistence and historical views, polling reschedule during an active batch, and both passes of a maximum-size optical transfer. These tests use synthetic data and do not enable live desktop capture.

Public verification is available in [Windows beta checks](https://github.com/bkhouser/WoW4EMCP/actions/workflows/ci.yml). Source, generated archives and Git history are also checked for private-data patterns/secrets. A successful scan is not an absolute guarantee that every sensitive value would be detected.

Beta 0.2.0-beta.3 passed **74/74 automated tests on Windows**, with no skips. Documentation validation checked 25 Markdown files and 106 repository-relative links/anchors before publication. Live optical capture remains outside that result.
