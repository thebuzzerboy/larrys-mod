(function(root){"use strict";root.SandboxModStudioKnowledge=[
"GAME: Sandbox Protocol, Three.js r128, Cannon.js 0.6.2.",
"ENTRY: app/src/main/assets/index.html contains scene, actors, props, tools, physics and AI characters.",
"INTERNALS: mkProp creates physics props; spawnPos chooses player spawn position. These are private implementation details, not stable mod APIs.",
"BUILT-IN PROP BEHAVIORS: none, explode, rocket, float, magnet, spin, turret, heal.",
"BUILT-IN PART SHAPES: box, sphere, cylinder, cone, torus.",
"EXPERIMENTAL SCRIPT API: api.log(text), api.spawn(spec). No documented DOM, network, filesystem, Node.js, imports, or direct game object access.",
"STATUS: Binary model/texture/audio loading is PLANNED, not implemented. Imported resource files are currently catalogued by metadata only.",
"STATUS: StarCoder2 weights and inference runtime are NOT BUNDLED. A separately installed OpenAI-compatible local endpoint is required.",
"STATUS: The iframe script runner is EXPERIMENTAL, lacks hard CPU quotas, and is not production-hardened.",
"RULE: Do not invent APIs. If a feature is not documented as implemented, describe the limitation rather than hallucinating a function."
].join("\n")})(typeof window!=="undefined"?window:globalThis);
