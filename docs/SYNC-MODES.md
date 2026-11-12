# Reload and on-screen sync

There are two independently selectable transports. The default is **reload enabled, screen disabled**. Both use the same character validation, SQLite history and read-only MCP queries.

## In-game controls

After upgrading from the first release, **exit WoW completely and relaunch it once** so the new addon file and per-character settings declaration are loaded. Normal later syncs need only a button click.

The small circular book icon sits around the minimap, outside combat:

* **Left-click:** collect a fresh snapshot, then reload the interface. A failed capture or combat state prevents the reload. Nothing is queued to reload after combat.
* **Drag:** move the icon around the minimap. Its position is saved per character on reload/logout.
* **Right-click:** open settings. Choose the reload button, the on-screen marker, both, or neither. Set the reminder interval from 1 to 120 minutes (default 15).
* **Gentle pulse / “Save due” tooltip:** a newer in-memory capture exists and the last save opportunity is older than the reminder interval. This is a reminder, not an automatic reload and not confirmation that the companion received data.

Commands are also available:

```text
/wci sync
/wci options
/wci mode reload
/wci mode screen
/wci mode both
/wci mode off
/wci reminder 15
/wci status
```

The button, settings window and marker hide during combat/world departure. Settings are per character and persist on the next UI reload or normal logout. WoW still owns all SavedVariables disk writes; disabling reload mode removes the reload action/reminder (the settings button remains) but does not prevent WoW's normal logout saves.

## Windows controls

Run `scripts/Configure-Sync.ps1` to open the settings window, or use the command-line form:

```powershell
# Default; no screen capture:
.\scripts\Configure-Sync.ps1 -Mode reload

# Opt in to both transports, using YOUR authorized source and actual executable:
.\scripts\Configure-Sync.ps1 -Mode both -SourceId 'my-character-addon' `
  -ExecutablePath 'C:\YOUR_WOW_INSTALL\_forever_\Wow.exe'

# Stop all acquisition while keeping saved data queryable:
.\scripts\Configure-Sync.ps1 -Mode off
```

Choose the corresponding mode in WoW as well. These are separate controls: WoW decides whether to display the data, and Windows decides whether it may capture the marker. Enabling an addon checkbox alone never turns on desktop capture. Windows configuration changes are picked up by the running companion within about one second, independently of file scanning; an already-started file read can finish first. Start the companion normally if it is not running.

`reload` imports configured SavedVariables sources. `screen` receives the selected addon source through the marker. `both` enables both. `off` stops acquisition. The optical source must already have an explicit character identity, expected player name and expected realm. Real-mode screen input cannot enter a sample database.

## On-screen mode

While transmitting, the addon displays a roughly **160 × 64 physical pixel** marker in the upper-right area. It uses ordinary textures to display its own authorized character snapshot. It sends numbered pages with a checksum, freezes each transfer until complete, and then sends the latest waiting snapshot. An additional capture is scheduled approximately every 30 seconds when outside combat and not busy transmitting. Large snapshots can take tens of seconds; this is not a continuous combat feed.

The Windows helper:

* Requires the selected executable to own the **foreground**, non-minimized window.
* Searches only its upper-right 480 × 300 pixel area, then crops to the detected marker. Frames stay inside the capture helper and are discarded; only validated encoded packet bytes are passed to the companion; no screenshot files or chat logs are retained.
* Samples at up to five frames per second. HDR, color filters, occlusion and display scaling can make the marker unreadable; SDR is the initial target.
* Has no input-injection, gameplay-command, packet-interception or game-memory-reading path. It uses limited OS process queries only to verify executable identity.
* Rejects corrupt, oversized, incomplete, conflicting or unauthorized transfers. Previous records remain available with their original timestamps.

The marker hides during combat. If you alt-tab to ChatGPT, capture pauses; ChatGPT reads the last complete imported observation. A visible marker means the addon is transmitting, **not** that the companion acknowledged receipt. Check `npm run doctor` or MCP `get_sync_status` and observation timestamps. New observations expose `transport: optical` or `transport: savedvariables`; older records can lack this optional field.

This optical mode is experimental. The addon display uses ordinary APIs, but we do not claim Blizzard approval of the external reader. See the [addon policy](https://us.forums.blizzard.com/en/wow/t/ui-add-on-development-policy/24534) and [related policy discussion](https://us.forums.blizzard.com/en/wow/t/policy-question-is-a-chat-translation-companion-app-allowed/2367458/8). SavedVariables remains the default and fallback.

## Validation boundary

Tests execute the actual Lua encoder and controls, decode its frames in TypeScript, import complete packets into SQLite, and verify identity, bank coverage, timestamp, corruption and interrupted-transfer behavior. Windows tests compile the native capture helper without screen capture and exercise all four configuration modes. Live capture on each display/client configuration still needs user validation. No on-screen transport is silently enabled by installing this update.
