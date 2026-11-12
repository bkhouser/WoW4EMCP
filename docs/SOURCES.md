# Source assessment

The initial implementation inspected a Windows 11 environment with Node 24, PowerShell and a Forever client using interface 16001. Exact machine paths, account directories, personal strategy pages and captures are deliberately excluded from this public source.

## Existing projects

| Candidate | Assessment at initial implementation |
| --- | --- |
| [PatchVault](https://www.curseforge.com/wow/addons/patchvault) | Listed All Rights Reserved; no code copied. |
| [Forever Character Export](https://www.curseforge.com/wow/addons/forever-character-export) | MIT listing; manual text export assessed, no code reused. |
| [ForeverDataExporter](https://www.curseforge.com/wow/addons/foreverdataexporter) | Listed All Rights Reserved; no code copied. |
| [InfiniteSync](https://www.curseforge.com/wow/addons/infinitesync) | Listed All Rights Reserved; no code copied. |
| [Pinta365/blizzard_api](https://github.com/Pinta365/blizzard_api) | MIT client examined as a routing reference; no code reused. |
| [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | MIT dependency; exact version in package-lock.json. |

The original lightweight exporter controls structured evidence and coverage semantics. A legacy WowAdvisor SavedVariables adapter exists, but that external exporter is not bundled and is not required. Its filtered inventories and profession scans have reduced coverage and independent timestamps.

## API references

* [Forever UI-source mirror](https://github.com/Gethe/wow-ui-source/tree/forever/Interface/AddOns/Blizzard_APIDocumentationGenerated) and generated quest declarations. Function presence/protected reads still determine actual access. `QUEST_TURNED_IN` and `QUEST_REMOVED` are distinct events; removal is not automatic proof of abandonment.
* [Community Forever API investigation](https://us.forums.blizzard.com/en/blizzard/t/wow-forever-api-what-works-so-far-plus-a-ts-client/60334). Reported `profile-forever-us`, `static-forever-us`, `dynamic-forever-us` and realmless slug routes are experimental, not a stable official contract.
* [Blizzard profile APIs](https://develop.battle.net/documentation/world-of-warcraft/profile-apis) and [OAuth guide](https://develop.battle.net/documentation/guides/using-oauth). No authenticated Forever endpoint result has yet been certified. Do not mistake unauthenticated 404 probes for proven unsupported endpoints or absent characters.
* [Blizzard addon policy](https://us.forums.blizzard.com/en/wow/t/ui-add-on-development-policy/24534). No protected-internal reverse engineering, gameplay automation, all-rights-reserved exporter source, or bulk game database is included.
* [OpenAI custom MCP guide](https://developers.openai.com/api/docs/guides/custom-mcp-server), [plugin quickstart](https://developers.openai.com/plugins/build/app-quickstart), [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), and [versioned stdio deployment limits](https://github.com/openai/tunnel-client/blob/v0.0.20/docs/configuration.md#stdio-deployment-limits).

Acquisition supports endpoint assessment for profiles, equipment, quests, history, reputations, achievements, professions, encounters, collections, statistics and specializations. Only recognized profile/equipment/completed-quest schemas normalize; other successful API responses remain in a private cache. Non-200 responses never establish confirmed empty data. API acquisition does not supply bag contents.
