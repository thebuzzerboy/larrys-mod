# AI providers and proxy connections

The developer build supports separate provider connections for the main AI configuration and individual AI characters. Credentials are entered in the game UI and are intentionally not saved to local storage or committed to this repository.

## Presets

| Connection | Base URL | API format | Model |
|---|---|---|---|
| LiteRouter | `https://api.literouter.com/v1` | OpenAI Chat Completions | Enter an exact model ID from LiteRouter |
| LoreLLM | `https://api.lorebary.com/lorellm` | OpenAI-compatible chat | `LoreLLM` |
| OpenRouter | `https://openrouter.ai/api/v1` | OpenAI Chat Completions | Enter an exact model ID |
| OpenAI | `https://api.openai.com/v1` | OpenAI Chat Completions | `gpt-4o-mini` default |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | Gemini generateContent | `gemini-2.5-flash` default |

LiteRouter's default chat route is `POST /v1/chat/completions`; the game appends `/chat/completions` to the configured base URL. LoreLLM's published external API setup gives the base URL, API key and model name shown above. LoreLLM's external API currently documents a 200-request daily allowance shared across the account, 30 requests per minute, 16,000 input tokens and 4,000 output tokens. Its external requests may also be paused during peak demand. Check the provider's current docs before relying on these limits.

## Protocol adapters

- **OpenAI-compatible:** Bearer key and `/chat/completions` request/response shape. Works with LiteRouter, LoreLLM and many OpenAI-compatible proxies.
- **Anthropic Messages:** `/v1/messages`, `x-api-key`, `anthropic-version`, Anthropic message and text-block response shape.
- **Gemini generateContent:** `/models/{model}:generateContent`, `x-goog-api-key`, Gemini contents/candidates shape.
- **Custom JSON:** Configure the exact endpoint path, auth header and prefix, request JSON template and response text path. Template placeholders are `{{model}}`, `{{system}}`, `{{user}}` and `{{messages}}`. The response path is dot-separated, for example `result.reply`.

The custom adapter is a configurable JSON-over-HTTP bridge, not a universal compatibility guarantee. It cannot automatically understand arbitrary binary protocols, streaming protocols, OAuth handshakes, multi-step sessions, or vendor-specific signing schemes. A provider must permit browser requests from the game origin (CORS), or be reached through a suitable HTTPS proxy.

## Per-character connections

Each AI character may override its protocol, base URL, endpoint path, model and key. If a field is left blank, the character inherits the global connection. Custom request templates, response paths and authentication-header settings currently come from the global connection settings.

## Security and reliability

- Never paste API keys into issues, chat messages, source files or screenshots.
- Keys are held in memory for the current session only and are not persisted to local storage.
- Direct browser requests can expose the key to the local browser session and provider; for shared/public deployments, use a private HTTPS backend that keeps provider secrets server-side.
- Provider APIs may have CORS restrictions, rate limits, quotas, model-specific request formats and costs.
- A successful HTTP response is not proof that the model can follow the game's structured JSON/action contract. Test each model with a single AI first.
