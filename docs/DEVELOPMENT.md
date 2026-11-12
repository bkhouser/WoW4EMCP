# Development and releases

[Documentation](README.md) · [Contributing](../CONTRIBUTING.md) · [Review record](REVIEW.md)

## Build and test

Use Node.js 24.14+ within the 24 series and Windows PowerShell for platform-specific tests. There is no external database service or native npm SQLite build.

```powershell
npm ci
npm test
npm run check:docs
```

`npm test` compiles TypeScript and runs Node's test runner. Fengari executes the actual addon Lua against controlled API fixtures. Native optical tests compile the embedded C# and feed synthetic pixels, without capturing the live screen. MCP tests exercise SDK initialization/discovery/tool calls and authenticated loopback HTTP. Windows-only tests are skipped on non-Windows hosts; a non-Windows pass is not full release validation.

## Source map

| Path | Responsibility |
| --- | --- |
| `addon/WoWCharacterIntelligence/Collector.lua` | Permitted game API collection, event debounce, logout preservation |
| `addon/WoWCharacterIntelligence/Sync.lua` | Minimap/settings/reminders, explicit reload, optional marker |
| `src/model.ts` | Versioned schemas, payload canonicalization, identity keys |
| `src/acquisition.ts` | Stable reads, non-executing Lua parsing, subject authorization and normalization |
| `src/watch.ts` / `src/optical.ts` | Independent config revocation and bounded optical lifecycle |
| `src/store.ts` / `src/queries.ts` | SQLite history, evidence selection and query operations |
| `src/mcp.ts` | Tool schemas, read-only handlers and transport security |
| `src/blizzard.ts` | Explicit API allowlist, OAuth, retries, caching and adapters |
| `src/cli.ts` | Local operator commands and process entry point |
| `scripts/` | Windows setup, lifecycle, DPAPI, optical helper and packaging |
| `tests/` | Synthetic acceptance, security and regression scenarios |

Changing a payload requires updating validation, acquisition, query/output schemas, tests and coverage docs together. Preserve `unknown`/`not_observed` semantics, turn-in separation, independent storage timestamps and sample/real isolation. Game text must never become executable instructions.

## Documentation and review

Update the relevant guide and [changelog](../CHANGELOG.md) with observable behavior, upgrade steps, validation and limits. `npm run check:docs` checks repository-relative Markdown links/anchors and required documentation; CI runs it too. It does not validate account-specific pages or prove external services are available.

Use [private vulnerability reporting](../SECURITY.md) for security-sensitive reports. Public bug reports must use synthetic/redacted examples. Review notes should name the baseline, concrete reproduction, fix, regression evidence and remaining limits; do not call an AI-assisted code review an independent security certification.

## Public-source checks

```powershell
# Review the diff, then stage the intended public files:
git diff
# Use git add with your reviewed file paths.
npm run check:publication
```

The publication check scans **indexed bytes** and refuses unstaged tracked edits. It rejects private local paths, deployment identifiers, secret-shaped strings and forbidden files, checks version consistency, and requires an empty source `Identity.lua`. This complements Gitleaks; neither proves the absence of every sensitive value. Never stage local captures, database files, configured identities or credentials.

## Release procedure

1. Update the version consistently in `package.json`, both root version fields in `package-lock.json`, `plugin.json`, and the MCP/smoke version strings. Update the changelog and validation boundaries. Keep the addon compatibility version and `.toc` interface number deliberate.
2. Run the full Windows suite and documentation checks. Review and stage intended changes, then run `check:publication` and `git diff --cached --check`.
3. Scan the public source and full Git history with the pinned Gitleaks version/checksum used by CI. Inspect findings privately before publishing anything.
4. Commit and push. Require the clean Windows GitHub Actions run to pass tests, documentation/publication checks, synthetic CLI and package verification.
5. From the clean source checkout, run `scripts/Package.ps1`. It includes only tracked allowlisted source and corresponding compiled outputs. Its staging folder must not already exist. The ZIP contains an empty generated `config.local.json`, never an installation's config.
6. Scan the extracted release, calculate SHA-256 and upload the ZIP plus checksum as a **prerelease**. Point the tag at the exact tested commit. Do not replace a published archive silently; use a new version for changed release bytes.
7. Verify the uploaded asset digest, release links, GitHub rendering and repository cleanliness. Report live validation separately from synthetic tests.

The initializer installs dependencies after extraction; `node_modules`, credentials, local SQLite, caches, logs, tunnel binaries and private Git history are not bundled. Source/publication checks require a Git checkout; the extracted ZIP is intended for installation, not repackaging without Git metadata.

## Optional live checks

Live game verification requires the owner to perform permitted actions: enable the addon, reload, inspect the icon/settings and capture known quests. Do not inject input or automate gameplay. Screen-mode validation requires separate user opt-in; synthetic decoder tests are not permission to enable desktop capture. Keep real evidence in ignored/private artifacts and publish only a redacted account of what was verified.
