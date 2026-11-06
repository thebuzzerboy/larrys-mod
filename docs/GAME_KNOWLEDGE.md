# Sandbox Protocol game knowledge base
This is a reviewed bootstrap index. The experimental build also generates a source inventory with npm run knowledge:build. An inventory is not semantic understanding; this file must be reviewed and enriched.

## Project facts
- Game entry point: app/src/main/assets/index.html.
- Rendering: Three.js r128. Physics: Cannon.js 0.6.2.
- Android: WebView wrapper. Windows: Electron wrapper.
- Core gameplay is currently a large HTML document. Keep generated mod code separate.

## Implemented concepts (source-backed)
- Physics props are created through internal mkProp and use Cannon.js bodies plus Three.js groups.
- Current procedural mod loader supports data-only primitive parts and built-in behaviors. External 3D model files are not loaded by the game yet.
- Built-in behavior identifiers: none, explode, rocket, float, magnet, spin, turret, heal.
- Primitive geometry identifiers: box, sphere, cylinder, cone, torus.
- Spawn positions are selected by internal spawnPos.
- The game has actors, props, a physics world, a scene, a free camera, and player mode. These are internals, not public mod APIs.

## Experimental mod API boundary
- api.log(text): bounded diagnostic message to the game UI.
- api.spawn(spec): requests one validated primitive prop. Host must validate again and enforce quotas.
- No direct scene, physics-world, DOM, network, filesystem, Node.js, or arbitrary host-object access.
- API status: EXPERIMENTAL / NOT A STABLE PUBLIC API.

## Status labels
- IMPLEMENTED: confirmed in current source.
- EXPERIMENTAL: present in this branch but not runtime-verified.
- PLANNED: discussed but not implemented.
- NOT SUPPORTED: explicitly excluded from this format/runtime.

## Not yet implemented
- Bundled StarCoder2 weights and native inference runtime.
- Automatic semantic retrieval from the full repository at generation time.
- Durable asset storage and GLB/GLTF/OBJ parsing/rendering.
- Texture and audio binding into game materials/entities.
- Full preview/undo lifecycle.
- Production-grade script CPU/time quotas and mod permission UI.
- Windows and Android runtime verification of the mod studio.
