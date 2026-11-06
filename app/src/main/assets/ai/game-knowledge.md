# Sandbox Protocol — Experimental AI Knowledge Bootstrap

## Source map
- app/src/main/assets/index.html: primary game, UI, scene, physics, props, actors, tools and AI characters.
- app/src/main/assets/ai/ai-coordinator.js: provider-neutral AI coordinator.
- app/src/main/assets/ai/mod-studio-core.js: experimental mod validation, StarCoder2 HTTP adapter, prompt builder, resource metadata and script sandbox.
- docs/GAME_KNOWLEDGE.md: reviewed status and current game concepts.

## Current implementation facts
- Renderer: Three.js r128. Physics: Cannon.js 0.6.2.
- Internal prop factory: mkProp. Spawn helper: spawnPos. Internal prop behavior set: none, explode, rocket, float, magnet, spin, turret, heal.
- Existing procedural mod format uses box, sphere, cylinder, cone and torus primitive parts.
- Existing local mod storage uses browser localStorage. It is profile-local and may be cleared with app data.
- Internal game objects such as scene, world, actors, props, camera and physics bodies are not public extension APIs.

## Mod scripting API (EXPERIMENTAL)
- api.log(text): display bounded diagnostic text.
- api.spawn(spec): ask the host to spawn one validated primitive item.
- Scripts have no documented access to the DOM, parent frame, network, filesystem, Node.js, imports or game internals.
- Do not invent APIs. If a requested behavior cannot be expressed through this API, explain that limitation in the generated mod description.

## State labels
IMPLEMENTED = present in source; EXPERIMENTAL = not runtime-verified; PLANNED = discussed only; NOT SUPPORTED = not available in this branch.

## Known limitations
- StarCoder2 model weights/runtime are not bundled.
- Binary resource contents are not parsed or loaded. Resource references currently carry metadata only.
- Generated source inventory is navigation, not semantic understanding.
- Script runner lacks hard CPU/time quotas and is not production-hardened.
