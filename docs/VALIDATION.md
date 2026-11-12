# Validation and limits

This public beta derives from a privately tested installation, but contains no actual character captures, private links, account identifiers or private Git history. Names and character data in tests/examples are synthetic. Do not treat fixture values as live observations.

## Automated coverage

The 41-test suite covers the six acceptance scenarios: quest-slot evidence, partial objective readiness, inventory coverage, talent evidence, freshness across observations, and isolation between game versions. It also exercises safe SavedVariables parsing, stable reads, transactional import, conflicts, bank-history retention, repeatable-quest semantics, deletion, addon logout/timer handling, real MCP SDK transports Windows DPAPI helpers, and MCP sync-error path redaction with retained local diagnostics.

Run `npm test` on Windows with localhost sockets available. CI additionally checks the sample-store path, package exclusions, public-source hygiene and Gitleaks. Test results from this public source are recorded by GitHub Actions; they do not certify every game API or external account flow.

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
