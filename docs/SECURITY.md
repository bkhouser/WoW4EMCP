# Security and privacy

## Boundary

The addon reads only the configured player's permitted APIs. It contains no process hooks, packet inspection, memory reads, gameplay automation, chat collection, addon messages, external sockets or writes to other addons. Its explicit user-click sync control can capture and reload the UI outside combat; reminders never trigger reloads. Collection defers during combat. Quest event recording uses explicit game events without executing quest actions. Protected/secret values are omitted; inaccessible fields remain unknown.

The collector accepts only configured files and matching character identities. Optional optical input requires a separately enabled Windows receiver and a foreground window owned by the configured executable. It is decoded as untrusted data with bounded pages, checksum, UTF-8, schema and subject validation before an atomic import. A checksum detects transmission damage; it is not cryptographic sender authentication. Same-user software can spoof a marker or local file, so both transports rely on a trusted local session. Raw screenshots are not stored. See [sync modes](SYNC-MODES.md) for capture boundaries and the external-reader policy uncertainty. SavedVariables are data, never executable Lua. It rejects unexpected assignments, appended code, duplicate/unsafe JSON keys, excessive nesting, oversized input and invalid snapshots. Two reads plus hash/metadata agreement avoid importing inconsistent writes. Both addon transports require live addon provenance plus the configured observed subject. Domain schema output, rather than the original unfiltered payload, is persisted for new imports. Imports are transactional and deduplicated; existing history is not retroactively rewritten. Sample data cannot enter a real store.

The MCP process opens SQLite **read-only**. Its 13 registered tools only execute fixed parameterized reads. There is no shell, arbitrary URL, arbitrary file, SQL, refresh, import, deletion or gameplay tool. Input schemas restrict sizes and pagination. Results cap at 200 KB. Game-provided text remains untrusted content, with explicit instructions not to execute it.

## Authentication

* HTTP binds loopback only. A cryptographically random bearer (48 random bytes) is required on every request, compared in constant time. Host allowlisting rejects DNS rebinding; browser Origin requests are rejected. The HTTP request body is capped at 64 KiB, request timeout is bounded, concurrent work is limited, and a per-process request-rate ceiling applies.
* Stdio runs under the owner Windows account through inherited pipes. It has no anonymous network listener. Secure MCP Tunnel adds authenticated outbound control-plane transport and owner-private ChatGPT access. It must be associated only with the intended personal account/workspace; do not share this plugin/tunnel. The server itself has no multi-user per-subject authorization layer. Shared-workspace use requires that additional layer before deployment.
* The local bearer listener is **not** a public OAuth service. Never put it behind an unauthenticated public tunnel. Public hosting requires HTTPS, OAuth protected-resource/authorization-server metadata, PKCE-capable OAuth, verified token issuer/audience/expiry/scopes, owner subject authorization and secure synchronization. That deployment is deferred.

## Secrets and files

`Set-Secret.ps1` prompts through secure input, or generates the local bearer. Windows current-user DPAPI encrypts it at rest. `Read-Secret.ps1` is an internal helper whose stdout is consumed privately by the application; **do not run it directly in a terminal**. It deliberately returns the decrypted value to its caller. Normal CLI diagnostics never echo values. Blizzard access tokens are held only in memory and never included in URLs, config, logs or caches. No Battle.net password is requested or stored.

For a newly created default data directory, the initializer removes inherited permissions and grants the current Windows user and SYSTEM access. Existing explicit grants on a reused directory can remain; inspect its ACL before reuse. Custom secret locations also require an appropriate owner-only ACL. It must run under the same user as the companion/server. Character databases, API caches and logs are plaintext inside that restricted directory; DPAPI protects credentials, not the entire character database. Use Windows full-disk encryption and protect backups according to your needs. Same-user malware/admins can access the app's data; DPAPI is not a defense against a compromised owner session.

The repository ignores `data/`, `artifacts/`, local config, secrets, caches and binaries. The release script excludes private data and supplies an empty source config. Configured local collection does not upload captures. Optional `blizzard-sync` sends the explicitly configured character identifiers and API requests to Blizzard independently of ChatGPT. Connecting a private MCP allows selected tool results to reach the assistant provider under the account's data controls. Source labels are included in sync status; choose labels without sensitive account/path information. Raw sync-error text stays in local diagnostics; MCP returns a generic failure summary to avoid leaking filesystem paths.

## Export, deletion and uninstall

1. Stop the companion and remove/disable the character's configured sources to avoid immediate re-import.
2. `node dist/src/cli.js export --character KEY --output data/export.json` writes a new private JSON history export; existing files are not overwritten.
3. `node dist/src/cli.js delete --character KEY --confirm KEY` deletes normalized observations and snapshots, checkpoints WAL and vacuums the database. It does not operate on game files.
4. For complete local deletion, also remove that character's exports/backups and corresponding files in `data/api-cache`. Cache files may include more API fields than normalized tool output. Remove the project's `data/` directory only after stopping the companion, closing MCP readers and verifying the absolute directory is this project's data directory. This removes all locally collected characters and credentials, not just one.
5. Remove the configured game SavedVariables separately if desired; this is a deliberate manual game-file operation. Uninstalling the addon alone does not erase SavedVariables.
6. Remove/revoke your ChatGPT plugin, tunnel and runtime key through their account settings. Local uninstall cannot revoke remote account resources or already returned ChatGPT tool results.

The uninstall script stops only the project's own identified Node processes, removes its optional startup shortcut, and optionally removes exactly its addon folder after path validation. It preserves local data by default.

## Known risks and mitigations

The beta Forever API can drift; unsupported schemas must fail closed rather than be treated as empty. New game patches may make APIs inaccessible; `/wci status` and coverage reveal failures. Timestamp skew is rejected beyond five minutes into the future. Repeated-file replays cannot make stale evidence fresh. Bank caches and recipe windows have independent timestamps. Losing the process between logout and a SavedVariables write can lose the latest in-memory events; the system makes no continuous-disk-feed claim. SQLite is currently experimental in Node 24, so the runtime major is pinned and upgrade tests are required.
