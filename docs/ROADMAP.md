# Prioritized next milestones

## P0 — Public beta and independent installation validation

Validate the documented setup on a clean Windows machine. Exercise reconnect/reboot behavior before claiming unattended reliability. Monitor the pinned tunnel-client initialization workaround and transient network timeouts. Keep the bearer listener private; users provision separate owner-private credentials and tunnels.

Before promoting screen sync, exercise a real display/client session: SDR/DPI scaling, foreground changes, occlusion, combat pauses, maximum transfers, mid-transfer disable and recovery. Keep screen mode off by default until that evidence exists.

## P1 — Harden live capture and expand useful context

* Observe bank open/change/close with real data and retain bank cache timestamps across sessions without claiming freshness. Extend Retail storage only after verifying its current APIs.
* Obtain structured unspent talent-point currency/spec data on Forever through verified permitted APIs; retain null if unavailable.
* Add in-addon profession/recipe scans with per-profession coverage, reagents and explicit learned flags. Preserve material availability separately from learnability.
* Capture quest rewards and precise quest classification without changing the player's selected quest/UI state. Attach verified, versioned static quest-chain/dungeon metadata with source attribution and license review. Implement repeatable occurrence IDs before deriving turn-in disposition across repeats.
* Improve item names/cache-readiness diagnostics and parsed gear bonus/enchantment details. Add semantic inventory/gold deltas with explicit unknown causes.

## P2 — Authenticated API and additional clients

* Provision a Blizzard developer client; directly probe every intended Forever endpoint and record supported schemas/statuses. Test API/addon conflict behavior using real contradictory observations.
* Add authorization-code OAuth with state, PKCE where supported and `wow.profile` consent for deliberately authorized account/protected data. No password storage.
* Normalize reputations, achievements/Legacy, currencies, encounters and collections only after verified response contracts.
* Test Retail, Classic Era and Mists Classic capture on their actual installations/interface versions. Identity isolation is implemented; client compatibility is not inferred from that test.

## P3 — Operations and optional integrations

Add a compact tray status window, supervised tunnel startup, bounded log rotation and explicit history retention controls. Add migrations with backup/rollback contracts before altering schema. Optional Companion Site integration should consume the same read-only normalized store/query contract; it must not become a server dependency. Evaluate permitted AH data and richer gear models only after provenance, freshness and game-version coverage are adequate.
