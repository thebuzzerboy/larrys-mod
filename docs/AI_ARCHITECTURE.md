# Sandbox Protocol AI architecture

This document describes the hybrid AI design and the currently implemented provider-coordination and Worker gateway foundations. It does not claim that model binaries, provider credentials, a payment system, or a production inference runtime are bundled.

## Two complementary sources

- **Local AI:** the architecture keeps local inference as the offline path. A model/runtime may be installed separately; the Worker gateway is not required for local inference.
- **Cloud AI:** optional cloud providers can be configured through server-side gateway IDs. Provider API keys remain in Worker secrets, not in the distributed game client. The first Worker gateway supports OpenAI-compatible Chat Completions endpoints and routes one selected provider per request.
- **Multi-provider coordination:** the reusable `AICoordinator` can invoke multiple adapters concurrently and handle partial failures. When adapters use the Worker gateway, the coordinator makes separate authenticated gateway requests; the Worker does not yet perform server-side fan-out or synthesis.
- **Local-only mode:** cloud requests are never required. If cloud providers are unavailable, the local path remains independent.

## Provider-neutral interface

Each adapter implements `complete({ messages, characterId, signal })` and returns `{ text, provider, model }`. The coordinator applies bounded concurrency, per-request timeouts, cancellation, provider selection, and partial-failure handling.

`app/src/main/assets/ai/ai-coordinator.js` contains the coordinator, a generic OpenAI-compatible adapter, and `workerGateway({ baseUrl, provider, model, getAccessToken })`. The gateway adapter sends only the user's account bearer token, provider ID, model ID, and messages. It never sends a provider API key from the client. The access token callback should retrieve a short-lived token from the selected account integration; the current game does not yet include Supabase sign-in or wire this adapter into its in-game AI request path.

The Worker endpoint is `POST /api/ai/chat`. It validates the provider/model against `AI_PROVIDERS_JSON`, obtains the corresponding server-side key from `AI_PROVIDER_KEYS_JSON`, applies request/token/time/response limits, and forwards an OpenAI-compatible request. Native Anthropic/Gemini payload adapters, usage accounting, user quotas, cost budgets, and moderation are future work.

The older direct `openAICompatible` adapter remains useful for a local/private endpoint or a user's own in-memory key. Do not bundle shared provider credentials into the app. For a shared cloud service, prefer `workerGateway`.

## Character scheduling

Each character keeps a distinct `characterId` and conversation history. A shared scheduler should prioritize foreground interactions, limit background chatter, cancel duplicate work, and pause background tasks when the app is suspended or memory pressure is high. Context is managed with configurable history and summarization; no finite model has literally unlimited context.

## Build channels

- `developer`: no purchase prompts, entitlement checks, payment SDK, or feature locks. Development can access local and cloud adapters without consumer purchase gating.
- `consumer`: baseline local AI is intended to remain included. A future one-time purchase may unlock optional advanced local model features.

Payment integration is intentionally absent until the project owner selects the provider and configures consumer purchase handling. The channel must be injected by native build configuration, not trusted from an editable JavaScript preference.

## Privacy and safety

- Cloud AI is opt-in and the UI should identify which providers receive a prompt.
- Provider API keys must never be committed, logged, placed in localStorage, or exported with Workshop content. Worker gateway keys belong in server-only secrets. The direct generic adapter can accept a user's own key in memory, but it is not a shared server credential mechanism.
- Account bearer tokens are separate from provider API keys. Keep them in platform-secure storage when an account integration is implemented; do not persist them in ordinary browser storage.
- Treat all model output as untrusted text. Do not execute model output as code or expose unrestricted game APIs.
- Workshop uploads and future entity scripts require validation and a restricted sandbox.

## Local inference engine

An inference-engine adapter should be selected after native packaging and device support are tested on each target. `llama.cpp` is a plausible GGUF-based option with CPU builds and Android/Windows build paths, but it must be compiled and benchmarked per target rather than assumed to work in the existing WebView. See the upstream [build guide](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md).

## Remaining implementation

- Native local runtime and model download/verification manager.
- Supabase sign-in/session integration and platform-secure access-token storage.
- Wire the Worker gateway adapter into the in-game AI request path and add provider-selection UI.
- Native Anthropic/Gemini adapters or a deliberately limited OpenAI-compatible-only configuration.
- Per-user AI quotas, budgets, usage metering, provider health and abuse controls.
- Character-aware queue and memory-pressure scheduling.
- Build-channel injection and consumer-only entitlement boundary.
- Integration tests against a real local model and explicitly configured cloud providers.

## Status

The coordinator, Worker gateway contract, and gateway adapter are code foundations, not a complete AI release. Model packaging, account sign-in, secure credential storage, in-game gateway integration, and real-device inference tests remain outstanding.
