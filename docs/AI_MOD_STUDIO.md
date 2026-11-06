# Experimental AI Mod Studio

This branch is a developer-only experiment. It does not enable StarCoder2 in consumer builds and does not include model weights or a native inference runtime.

## Current architecture
- mod-studio-core.js contains package validation, an OpenAI-compatible local StarCoder2 adapter, source-aware prompt builder, resource-file classification, and an isolated iframe script runner.
- StarCoder2 connects to a local OpenAI-compatible inference endpoint. Default: http://127.0.0.1:8080/v1. The endpoint must be supplied by a separately installed local inference server; the game does not install or launch it.
- docs/GAME_KNOWLEDGE.md is the initial reviewed knowledge file. npm run knowledge:build inventories source files, but an inventory is not a semantic knowledge base.
- Recognized resource types: GLB/GLTF/OBJ, PNG/JPG/WEBP, WAV/OGG/MP3, JSON, Markdown, text and source files. Text, Markdown, JSON and source files are read (up to 12 KiB each) into the generation prompt. Binary resources are catalogued by metadata and user notes only; their contents are not interpreted, persisted or rendered.

## Mod package
A package uses format sandbox-protocol-mod, formatVersion 1, one or more items, optional resource references, and optional JavaScript source in each item.

Structured item fields remain the default. A script may use only api.log(text) and api.spawn(spec). Scripts run in a sandboxed iframe with restrictive CSP and no same-origin permission. This is defense-in-depth, not a hardened security boundary: browser engines can have bugs, CSP is not a substitute for native isolation, and this runner has no CPU quotas or reliable way to interrupt an infinite loop. Do not run untrusted scripts from unknown mods in production.

## Tests
Run npm test to exercise core validation and resource metadata helpers.

## Deliberately not claimed
- StarCoder2 weights are not bundled.
- No local inference server is installed or launched by the game.
- Model quality and performance have not been benchmarked.
- Imported binary assets are not stored, parsed, or rendered.
- Source inventory is not a complete semantic knowledge base.
- Experimental JavaScript runner is not production-hardened.
