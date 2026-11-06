# Local Mods (Experimental)

Sandbox Protocol imports JSON mod packages from the device and saves installed mod data in the current browser/WebView profile using localStorage.

## Install a mod

1. Run the developer build and open Mods.
2. Select Import mod JSON.
3. Choose a .json or .spmod.json mod file.
4. Enable or disable it in the Mods panel.
5. Open Spawn → Props to find the mod's items.

Use Export example mod for a starter file. The experimental AI Mod Studio can generate a package and export it for import here.

## Manifest format

A package contains id, name, version, author, description and 1–30 items. Each item supports name, mass, bounce, behavior, power, static and parts.

Supported part shapes: box, sphere, cylinder, cone and torus. Each part supports size, pos, rot, color and glow. Colors use hexadecimal notation such as #33aaff.

Built-in behavior presets: none, explode, rocket, float, magnet, spin, turret and heal.

An optional item script may use only:
- api.log(text)
- api.spawn(spec)

The host validates spawn requests and currently limits a script run to 10 additional props. Scripts are started when the mod item is spawned. There are no persistent game events or stable scripting lifecycle yet.

## Limits and security

- Maximum imported JSON file size: 256 KiB.
- Maximum 30 items per mod and 12 parts per item.
- Maximum script size: 64 KiB per item.
- Maximum 8 units per part dimension and 8 units per part offset.
- Scripts run in a sandboxed iframe with no same-origin permission and a restrictive CSP.
- The bridge exposes no documented DOM, network, filesystem, Node.js or game-internal access.
- This is experimental defense-in-depth, not a hardened security boundary. There is no hard CPU quota, and a browser engine vulnerability could undermine isolation. Only run scripts you trust.
- Mod data is reconstructed from an allowlist before use.
- Mods are local to the current browser/WebView profile and are not uploaded or shared.

## AI Mod Studio and resource support

The developer-only AI Mod Studio connects to a separately configured local StarCoder2-compatible endpoint. Model weights/runtime are not bundled.

Text, Markdown, JSON and source resources can be supplied as context; binary models, textures and audio are currently catalogued by metadata and user notes only. Binary assets are not yet stored in the mod package, parsed, previewed or rendered by the game.

## Current limitations

No stable public mod API, Workshop distribution, cross-device mod packs, external model renderer, texture/audio binding, or production-grade script isolation is implemented yet.
