# Optical transport protocol — WCI1

[Documentation](README.md) · [User controls](SYNC-MODES.md) · [Security](SECURITY.md)

This is a developer reference for the **experimental, opt-in** one-way screen transport. Reload/SavedVariables remains the default. There is no acknowledgement or command channel from Windows back into WoW.

## Components

| Component | Responsibility |
| --- | --- |
| [`Sync.lua`](../addon/WoWCharacterIntelligence/Sync.lua) | Freeze serialized addon bundle, page it, draw ordinary textures |
| [`Read-Optical.ps1`](../scripts/Read-Optical.ps1) | Verify foreground executable, locate/sample marker, decode bounded packet bytes |
| [`optical.ts`](../src/optical.ts) | Bound helper output, validate packets, reassemble/checksum/decode and authorize import |
| [`acquisition.ts`](../src/acquisition.ts) | Shared live-addon, subject, schema and snapshot validation |
| [`store.ts`](../src/store.ts) | Atomic canonicalized persistence and history |

## Marker geometry and colors

The data grid is 80 columns × 25 rows with nominal 2 × 2 physical pixel cells. Row 0 begins with four locator cells: magenta `(255,0,255)`, cyan `(0,255,255)`, yellow `(255,255,0)`, green `(0,255,0)`. The remaining 24 rows encode bytes. A label below the grid brings the nominal panel to about 160 × 64 pixels.

Each data cell carries six bits: two bits each in red, green and blue. Channel levels are `24, 88, 152, 216`; the decoder allows an absolute deviation of at most 25 from the selected level. Bits are packed most-significant-first across cells. The grid carries 1,440 bytes per page, including its header. Unused bytes are painted as zero padding; the native helper emits only the declared packet, never padding or raw RGB cells.

## Packet header

All integers are unsigned, big-endian. A packet is exactly 18 header bytes plus its declared payload.

| Offset | Bytes | Field |
| --- | --- | --- |
| 0 | 4 | ASCII magic `WCI1` |
| 4 | 4 | Generation counter, incremented per frozen transfer |
| 8 | 2 | Zero-based page index |
| 10 | 2 | Page count, 1–256 |
| 12 | 2 | This page's payload length, 1–1422 |
| 14 | 4 | Adler-32 of the complete UTF-8 bundle |
| 18 | 1–1422 | Payload slice |

Every non-final page must contain exactly 1,422 payload bytes. Maximum bundle size is **364,032 bytes**. A larger snapshot remains available through SavedVariables; screen mode reports that it is too large instead of truncating it. Empty payloads, bad magic, invalid bounds and trailing packet bytes are rejected.

## Sender lifecycle

The addon paints at most one page per 250 ms update, normally four pages/second. It sends two passes of each frozen generation and retains only the latest waiting capture while busy. A maximum-size generation needs about 128 seconds for both uninterrupted passes. Frame delays can make it slower.

Combat/world departure hides the marker and pauses its cursor. A generation older than 180 seconds expires so the latest pending snapshot can proceed. The periodic optical capture attempts another snapshot roughly every 30 seconds when outside combat and not transmitting; collector events can also queue a newer capture. These are bounded best-effort transfers, not a guaranteed real-time feed.

## Receiver lifecycle

The Windows helper requires the configured executable to own the foreground, non-minimized window. It queries only limited process identity information. It searches the upper-right 480 × 300 client pixels, then samples only the located marker. Window/geometry changes invalidate its cache; foreground changes during capture discard the image. Composited overlays, HDR, color filters and scaling can make a packet unreadable.

Decoded packet bytes are emitted as `PACKET BASE64` lines; wait states use `WAIT ...`. The Node reader bounds buffered line length and checks canonical base64 before packet parsing. The helper exits on parent disappearance or stdin closure; revocation disables callbacks before helper termination and waits for closure before replacement. No screenshots are written to disk.

Reassembly keys a generation by counter, page count and checksum. Pages may arrive out of order; conflicting duplicates, checksum errors, invalid UTF-8, size violations and incomplete expired transfers do not import. The assembler expires after 180 seconds and remembers the last 16 **committed** generation keys. A failed database import does not consume the generation, allowing retransmission to retry.

A complete JSON bundle must contain schema version 1, only live addon snapshots, and the configured character/player/realm. Every member is validated before the batch commits. Nested payload fields are canonicalized through the domain schema so undeclared fields do not persist. Transport metadata is assigned by acquisition rather than trusted from the incoming bundle.

## Trust and validation limits

Adler-32 detects damage; it does not authenticate the sender. Same-user software can forge a marker or a local SavedVariables file. The allowed executable and explicit subject checks reduce accidental capture, but the design assumes a trusted owner session. It is not a network transport, encryption scheme or anti-malware boundary.

Tests run actual Lua encoding, native decoding of synthetic BGRA pixels, TypeScript reassembly, canonicalization, authorization and SQLite import. They cover unused-pixel overlays, bounds, corruption, retries, stale child events and transfer expiry. **Live optical capture across a real display/client session remains unverified.** No Blizzard approval of the external reader is claimed.
