# Capability coverage

`get_character_overview` is the machine-readable coverage report. `get_character_data` exposes each selected domain with its source, observation/sync timestamps, availability, alternatives and freshness. This matrix describes public beta 0.2.0-beta.3; runtime capability checks can downgrade coverage.

| Area | Implemented source/behavior | Remaining limitation |
| --- | --- | --- |
| Identity, level, race/class | Real addon capture verified | Version/region/ruleset/slug explicitly configured |
| XP, cap, rested XP, money | Real addon capture verified | Null if API does not return a value; no spending history before first capture |
| Active quest log | Real IDs, names, levels, structured objectives/counts/completion verified | Zone and some classification fields unavailable |
| Quest capacity | `GetMaxNumQuestsCanAccept`; runtime count/capacity captured | Hidden/filtered log entries can force partial enumeration |
| Objective completion | Separate boolean and per-objective state | Never converted into turn-in |
| Historical quest progress | Completion flags plus explicit current-session accepted/removed/turned-in events; persisted DB history | Flags have no turn-in date; event coverage starts after addon loads; removed cause unknown |
| Repeatable quests | Current log and historical events kept separate | Occurrence reconstruction not implemented |
| Quest rewards, chains, prerequisites, hidden/class story | Model and unknown coverage, caller-supplied IDs for readiness | No versioned catalog/reward collector; no availability or abandonment inference |
| Equipment | Item IDs, slots, names, quality, item level, links/stats; tested on one Forever installation | Binding may be unknown; no comprehensive parsed bonus/set catalog |
| Bags | Full enumerated bags, stack counts, bag/slot, links, binding where readable; tested on one Forever installation | Item cache/API failures downgrade; offline changes cannot be observed |
| Bank | Capture on bank open for Forever/classic layout | Not yet live-tested; last observation can be stale; Retail bank adapter deferred |
| Reagent/account bank | Separate domains | Not collected; never implied empty |
| Other own characters | Independent authorized source mappings/store keys | No automatic account discovery or unauthorized alt import |
| Inventory/gold changes | Immutable domain history, fingerprints and identity values | No semantic item-flow ledger; no inferred buy/sell cause |
| Gear comparison | Shared observed stat keys only | No full simulation, bonus weighting or upgrade recommendation |
| Talents | Committed trait nodes/ranks; allocated nodes verified on one installation | Unspent points/spec name unavailable on observed Forever client; no level-based inference |
| Known spells | Player spellbook enumeration verified; rank text where exposed | Pet/demon spellbook not implemented |
| Professions/recipes | Existing WowAdvisor adapter retains own scan timestamps, known/unlearned flags and truncation | Original addon profession collector deferred; materials do not establish learnability |
| Attributes/stats | Primary stats, armor, max health/mana | Advanced combat statistics partial |
| Reputation/currencies | Schemas/query access | Acquisition not yet normalized/live-tested; money is captured separately |
| Achievements/Legacy/collections | Schemas, API assessment endpoints | No comprehensive normalized acquisition |
| Travel | Hearth binding location | Flight-path enumeration and cooldown deferred |
| Dungeons | Client cached saved-instance/lockout rows | Normal dungeon history and comprehensive encounters unavailable; no claim of completion from being in an instance |
| Auction prices | Not implemented | No unsupported scraping or fabricated market prices |
| Official Blizzard APIs | OAuth, allowlisting, pacing/retry/cache, probes; profile/equipment/completed-quest adapters tested | Authenticated Forever endpoints unverified; no credentials supplied |
| Retail/Mists/Classic Era | Identity isolation and API namespace routing tested | Live addon capture needs per-client interface version and compatibility testing |
| ChatGPT | Owner-private stdio tunnel workflow verified on one installation | PC/runtime must stay on; launch scripts include the tunnel initialization compatibility option; each user must provision their own tunnel; startup is opt-in |
| Sync controls | One-click capture/reload, save-due pulse, per-character settings; optional one-way optical transport | Screen capture is opt-in in Windows and the addon; display/client live validation remains required. See [sync modes](SYNC-MODES.md). |

The older exporter remains useful for professions but cannot establish full bag quantities or quest capacity. Newer comprehensive addon observations take precedence by timestamp without rewriting old evidence. Unsupported scopes remain visible.
