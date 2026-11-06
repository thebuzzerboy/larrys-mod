# Sandbox Protocol AI architecture

This document describes the hybrid AI design and the first provider-coordination implementation. It does not claim that model binaries, provider credentials, a payment system, or a production inference runtime are already bundled.

## Two complementary sources

- **Local AI:** a small local model is available as the baseline and can run without internet once its runtime and model are installed.
- **Cloud AI ensemble:** players may configure multiple cloud providers. Independent providers can be queried concurrently and their answers returned together or combined by a configured local synthesizer.
- **Local-only mode:** cloud requests are never required. If cloud providers fail or are unavailable, local AI remains available.

## Provider-neutral interface

The game talks to adapters, not directly to a specific model vendor. Each adapter implements `complete({ messages, characterId, signal })` and returns `{ text, provider, model }`. The coordinator applies bounded concurrency, per-request timeouts, cancellation, provider selection, and partial-failure handling.

`app/src/main/assets/ai/ai-coordinator.js` contains the first reusable coordinator and an OpenAI-compatible HTTP adapter. It deliberately does not ship provider keys, choose a model vendor, or assume a local server port. A native local-runtime adapter and secure credential storage are platform integration work still to be completed.

## Character scheduling

Each character keeps a distinct `characterId` and conversation history. A shared scheduler should prioritize foreground interactions, limit background chatter, cancel duplicate work, and pause background tasks when the app is suspended or memory pressure is high. Context is managed with configurable history and summarization; no finite model has literally unlimited context.

## Build channels

- `developer`: no purchase prompts, entitlement checks, payment SDK, or feature locks. Development can access local and cloud adapters without consumer purchase gating.
- `consumer`: baseline local AI is included. A future one-time purchase may unlock optional advanced local model features.

Payment integration is intentionally absent until the project owner selects the provider and configures consumer purchase handling. The channel must be injected by native build configuration, not trusted from an editable JavaScript preference.

## Privacy and safety

- Cloud AI is opt-in and the UI must identify which providers receive a prompt.
- API keys must never be committed, logged, placed in localStorage, or exported with Workshop content. The current generic adapter accepts a key in memory only; native secure storage is still required for persistent credentials.
- Treat all model output as untrusted text. Do not execute model output as code or expose unrestricted game APIs.
- Workshop uploads and future entity scripts require validation and a restricted sandbox.

## Local inference engine

An inference-engine adapter should be selected after native packaging and device support are tested on Windows and Android. `llama.cpp` is a plausible GGUF-based option with CPU builds and Android/Windows build paths, but it must be compiled and benchmarked per target rather than assumed to work in the existing WebView. See the upstream [build guide](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md).

## Remaining implementation

- Native local runtime and model download/verification manager.
- Windows and Android secure credential storage.
- Provider settings UI, cloud consent UI, and provider health indicators.
- Character-aware queue and memory-pressure scheduling.
- Build-channel injection and consumer-only entitlement boundary.
- Integration tests against a real local model and explicitly configured cloud providers.

## Status

The coordinator is an initial code foundation, not a complete AI release. Model packaging, real provider setup, native storage, UI, and device testing remain outstanding.