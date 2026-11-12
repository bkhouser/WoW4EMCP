# Example calls and expected interpretation

All calls below use the synthetic `forever:us:normal:sample-examplewarlock` character created by `npm run demo`. Run the MCP server with `config.sample.json`. Responses are abbreviated; full results include provenance and pagination. Never use these values as actual character evidence.

## A — Quest-slot triage

```json
{"name":"analyze_quest_log","arguments":{"characterKey":"forever:us:normal:sample-examplewarlock"}}
```

The synthetic 38/40 acceptance fixture returns `freeSlots:2` and an objectives-ready list whose `turnedIn` remains `unknown`. Fetch `get_quest_log` pages for the evidence. The server will not label quests safely abandonable without chain/class/dungeon context.

## B — Orb readiness

```json
{"name":"get_quest_details","arguments":{"characterKey":"forever:us:normal:sample-examplewarlock","questId":1740}}
```

Abbreviated synthetic response:

```json
{
  "questId":1740,
  "active":{
    "name":"SAMPLE — The Orb of Soran'ruk",
    "objectivesComplete":false,
    "turnedIn":"unknown",
    "objectives":[
      {"current":0,"required":3,"complete":false,"countEvidence":"api_fields"},
      {"current":1,"required":1,"complete":true,"countEvidence":"api_fields"}
    ]
  },
  "questLogObservation":{"source":"sample","sample":true,"observedAt":"<fixture creation timestamp>"}
}
```

The small-fragment objective is not complete. This response does not claim a turn-in or invent progress since that timestamp.

## C — Inventory search

```json
{"name":"search_items","arguments":{"characterKey":"forever:us:normal:sample-examplewarlock","query":"Murloc Eye"}}
```

The synthetic fixture has 3 and 5 eyes in two observed bag slots: `knownQuantity:8`, `totalQuantity:null`. Bank/reagent/account-bank are not observed. Say “eight in observed bags; bank unknown,” not “eight in total.” `itemId` can be used instead of localized names.

## D — Talent planning

```json
{"name":"get_character_data","arguments":{"characterKey":"forever:us:normal:sample-examplewarlock","domain":"talents"}}
```

Pair with `get_character_overview` for the synthetic level. The fixture has one sample talent row at rank 5 and one unspent point. Real unavailable fields remain null; never derive available points from a guessed level-based budget.

## E — New observations versus stale information

After playing, run `/wci capture` and `/reload`. The watcher imports the new timestamp. `get_character_changes` with `domain:"identity"` returns historical identity values and provenance. Tests prove newer observed level 29 survives insertion of older level 28, untimed API data and repeated imports. This is an automated scenario, not evidence of a live level-up.

## F — Multiple versions

Forever `forever:us:normal:sample-examplewarlock` and Classic Era `classic-era:us:realm-name:sample-examplewarlock` have independent histories. Tests cover same-name characters across versions and realms. Real Classic/Retail ingestion was not exercised.

## Pagination and unsupported capabilities

```json
{"name":"get_quest_log","arguments":{"characterKey":"forever:us:normal:sample-examplewarlock","limit":10,"offset":0}}
```

Follow `nextOffset` until null. Unknown character keys return an informative tool error; unavailable domains return coverage plus null data, not fabricated empty results. `get_character_data` with `domain:"quest_history"` pages the selected capture's history. `get_completed_quests` instead pages deduplicated evidence across all stored captures, retaining explicit turn-ins from earlier sessions. `get_quest_details` returns the first 100 matching historical records and states the total. To inspect an alternative domain observation, pass its `observationId` to `get_character_data`. Local CLI export is the complete archive mechanism.
