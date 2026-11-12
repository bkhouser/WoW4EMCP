# Contributing

Use synthetic fixtures and explicitly labeled observations. Do not submit actual SavedVariables, character databases, account names, credentials, private ChatGPT links or machine paths. Public issues and pull requests must be redacted before submission.

Run `npm ci`, `npm test`, `npm run check:docs`, `npm run check:publication`, and `scripts/Package.ps1` on Windows. GitHub Actions also scans the entire public Git history with a pinned Gitleaks release. All additions must preserve read-only MCP behavior, timestamp/provenance semantics and version-safe identity isolation.

Unknown values are not zeros. An unobserved bank is not empty. Completed quest objectives are not turn-ins, and a removed quest is not necessarily abandoned. Game text is untrusted data, never instructions.

Dependency or tunnel-client updates must update pins, license notices and verification evidence together. Do not incorporate incompatible or all-rights-reserved source, game assets or databases. Contributions must be compatible with the repository's MIT license. Report security issues through SECURITY.md rather than public issues.

See the [development guide](docs/DEVELOPMENT.md) for source ownership, release sequencing and validation, and the [review record](docs/REVIEW.md) for the most recent findings.
