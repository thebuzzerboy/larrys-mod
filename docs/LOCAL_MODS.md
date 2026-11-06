# Local Mods (Experimental)

Sandbox Protocol's experimental local mod loader imports data-only JSON files from the device. Imported mods are saved in the current browser/WebView profile using localStorage.

## Install a mod

1. Run the game and open **Mods**.
2. Select **Import mod JSON**.
3. Choose a `.json` mod file.
4. Enable or disable it in the Mods panel.
5. Open **Spawn → Props** to find the mod's items.

Use **Export example mod** to download a starter file, edit it in a text editor, and import it again.

## Manifest format

A mod is a JSON object with:

- `id`: unique lowercase ID (2–40 characters; letters, numbers, underscores, hyphens).
- `name`: display name.
- `version`: version label.
- `author`: author label.
- `description`: short description.
- `items`: 1–30 spawnable physics props.

Each item supports `name`, `mass`, `bounce`, `behavior`, `power`, `static`, and `parts`.

Supported part shapes: `box`, `sphere`, `cylinder`, `cone`, `torus`.

Each part supports `size`, `pos`, `rot`, `color`, and `glow`. Colors must be hexadecimal, such as `#33aaff`.

Supported behavior presets are the game's existing built-ins: `explode`, `rocket`, `float`, `magnet`, `spin`, `turret`, and `heal`. Use `none` for no special behavior.

## Limits and security

- Maximum JSON file size: 256 KiB.
- Maximum 30 items per mod.
- Maximum 12 parts per item.
- Maximum 8 units per part dimension and 8 units per part offset.
- Mods cannot execute JavaScript, load remote scripts, or access game internals.
- Mod data is validated and reconstructed from an allowlist before use.
- Mods are local to the current device/browser profile; they are not uploaded or shared.
- Clearing browser/WebView app data can remove locally stored mods.

## Current limitations

This first experiment creates procedural physics props. It does not yet load external 3D model files, textures, audio, custom NPCs, scripted behaviors, or cross-device mod packs. Those can be added as separate, validated capabilities later.