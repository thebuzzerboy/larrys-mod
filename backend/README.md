# Sandbox Protocol backend

This directory contains a **free-tier-first Cloudflare Worker backend foundation**. It is not deployed by CI and does not create Cloudflare resources, enable billing, or store credentials in the repository.

The API and data contracts are intentionally provider-oriented. Cloudflare is one deployment target; the API code can be exercised locally without creating a Cloudflare account or adding payment information. A self-hosted Android cluster is a separate runtime adapter and is not implemented here yet.

## Architecture and scope

| Component | Responsibility | Current status |
|---|---|---|
| Cloudflare Worker | HTTP API, authorization, validation, optional AI proxy | Implemented and unit-tested |
| Cloudflare R2 | Workshop asset and JSON metadata objects | Implemented against the R2 binding; local emulation is supported by Wrangler |
| Durable Objects | Room ticket issuance and ephemeral WebSocket relay | Initial transport foundation; not an authoritative game server |
| Supabase Auth | Optional JWT identity verification via public JWKS | Optional; no Supabase project or database is provisioned |
| Supabase/Postgres data | Accounts, ratings, search index, moderation records | Not implemented; metadata currently lives in R2 |
| Cloud AI gateway | Server-side routing to configured OpenAI-compatible endpoints | Implemented as a single-provider-per-request API; no automatic fan-out or game UI integration yet |
| Local AI | Offline/local model execution | Remains a client-side concern; this Worker does not call or replace it |

The existing game-side AI coordinator remains provider-neutral and now has a reusable `workerGateway` adapter. The in-game AI request path and Supabase sign-in are not yet wired to that adapter. The local model path must continue to work when the network or cloud providers are unavailable.

## Run and test locally — no Cloudflare billing setup

You do **not** need to create a Cloudflare account, create a remote R2 bucket, or enter payment information to run the unit tests or Wrangler's local development emulator.

From this directory:

```sh
cd backend/worker
npm install
npm test
npx wrangler dev
```

`wrangler dev` runs the Worker locally. Wrangler locally emulates the R2 binding and SQLite-backed Durable Object state; it does not deploy the Worker. Local state is stored under `.wrangler/` and is ignored by Git.

Test the health route in another terminal:

```sh
curl http://127.0.0.1:8787/health
```

Expected response:

```json
{"ok":true,"service":"sandbox-protocol-backend"}
```

The Workshop listing route should respond with an empty list when the local R2 binding is available:

```sh
curl http://127.0.0.1:8787/api/workshop/items
```

For PowerShell, use `Invoke-RestMethod` with the same URLs. No Supabase or AI provider credentials are required for `/health` or public listing.

### Optional local secrets/configuration

Copy `.dev.vars.example` to `.dev.vars` only if you have configured the corresponding services. `.dev.vars` is ignored by Git. Do not commit it or paste its contents into issues or chats.

Supabase authentication is optional for running the Worker, but **uploads, deletion, room-ticket creation, and the AI gateway fail closed** until a valid auth configuration and bearer token are supplied. Unit tests use generated test keys and mocked JWKS responses; they do not need a real Supabase account.

## Optional Cloudflare deployment

Deployment is deliberately manual. The following steps are **not** part of CI:

1. Create/authorize a Cloudflare account only if you choose to deploy.
2. Create an R2 bucket named `sandbox-protocol-workshop` (or change the name in `wrangler.toml`).
3. Configure `SUPABASE_JWKS_URL`, `SUPABASE_ISSUER`, `ALLOWED_ORIGINS`, and `AI_PROVIDERS_JSON` as Worker variables.
4. Store `AI_PROVIDER_KEYS_JSON` as a Worker secret, never as a plain variable or client setting:

   ```sh
   npx wrangler secret put AI_PROVIDER_KEYS_JSON
   ```

5. Run `npx wrangler deploy` only after reviewing Cloudflare's current account and billing prompts.

Cloudflare may request billing details when activating R2 or other services even when you intend to stay within free allowances. **If you do not want to provide payment information, stop at local development; nothing in this repository requires you to deploy to Cloudflare.** Free allowances are not a guarantee that account activation is payment-free, and usage beyond allowances may be billable.

## Optional Supabase Auth configuration

Supabase is used here only as an optional identity/JWT issuer. The Worker does not require a Supabase database, does not provision tables, and never needs a service-role key.

For a Supabase project with reference `PROJECT_REF`:

- `SUPABASE_JWKS_URL=https://PROJECT_REF.supabase.co/auth/v1/.well-known/jwks.json`
- `SUPABASE_ISSUER=https://PROJECT_REF.supabase.co/auth/v1`

The verifier accepts asymmetric `ES256` and `RS256` JWTs and checks the signing key from JWKS, issuer, `authenticated` audience, `authenticated` role, subject, issued-at, not-before (when present), and expiration. It does not accept the legacy shared-secret HS256 scheme. Do not switch a project to a weaker signing method to accommodate this backend.

If authentication is not configured, write endpoints return `503`. If it is configured but the caller supplies no valid bearer token, they return `401`. A valid user can delete only their own Workshop items.

## Workshop API contract

Base URL: the deployed Worker URL, or `http://127.0.0.1:8787` locally.

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| GET | `/health` | Health check | None |
| GET | `/api/workshop/items?limit=20&cursor=...` | Paginated public metadata listing | None |
| POST | `/api/workshop/items` | Multipart upload | Supabase bearer token |
| GET | `/api/workshop/items/:uuid` | Read public metadata | None |
| GET | `/api/workshop/items/:uuid/asset` | Download the asset | None |
| DELETE | `/api/workshop/items/:uuid` | Delete an owned item | Supabase bearer token |

Upload multipart fields:

- `file` — required asset.
- `name` — required, 1–80 characters.
- `description` — optional, up to 500 characters.
- `category` — optional, up to 32 letters, digits, `_` or `-`.
- `tags` — optional comma-separated tags; input is limited to 1,024 characters and at most 8 normalized tags are retained.

Allowed extensions/MIME types: GLB, single-file glTF 2.0 JSON, OBJ, MTL, PNG, JPG/JPEG, WEBP and JSON. Maximum file size is 25 MiB; multipart overhead is separately bounded. The server checks MIME/extension agreement and basic signatures/structure for supported formats. It does not execute uploaded content.

### Workshop metadata model

The R2 metadata object is stored at `items/<uuid>.json`; the asset is stored at a server-generated `assets/<uuid>.<extension>` key.

```json
{
  "id": "opaque UUID",
  "name": "Example prop",
  "description": "Optional description",
  "category": "props",
  "tags": ["wood", "chair"],
  "ownerId": "authenticated user ID",
  "fileName": "chair.glb",
  "size": 12345,
  "contentType": "model/gltf-binary",
  "assetKey": "assets/<uuid>.glb",
  "createdAt": "ISO-8601 timestamp",
  "version": 1
}
```

`ownerId` and `assetKey` are not returned in public metadata. R2 object names are generated by the server; the client filename is never used as a storage path. Listing uses a paginated R2 prefix scan for this initial version. Search, ratings, moderation queues, and larger-scale indexing need a database (Supabase/Postgres or another selected store) later.

Public metadata and asset downloads are intentionally public in this first contract. Add moderation, reporting, malware scanning, publication states, quotas and rate limits before opening a public Workshop to untrusted uploads.

## AI gateway contract

`POST /api/ai/chat` requires a valid Supabase bearer token and JSON:

```json
{
  "provider": "openrouter",
  "model": "provider/model-name",
  "messages": [
    {"role": "system", "content": "You are a helpful game character."},
    {"role": "user", "content": "Build a wooden chair."}
  ],
  "max_tokens": 512,
  "temperature": 0.7
}
```

The server checks the provider ID and model against `AI_PROVIDERS_JSON`, retrieves the matching API key from the server-only `AI_PROVIDER_KEYS_JSON` secret, and forwards a bounded OpenAI-compatible Chat Completions request. The response is `{ "provider", "model", "text" }`. The reusable `SandboxAI.workerGateway({ baseUrl, provider, model, getAccessToken })` client adapter sends the account bearer token and provider/model IDs, never the provider API key. The game has not yet connected its existing in-game AI calls to this adapter.

Example non-secret provider configuration:

```json
[
  {"id":"openai","endpoint":"https://api.openai.com/v1/chat/completions","models":["gpt-4o-mini"]},
  {"id":"openrouter","endpoint":"https://openrouter.ai/api/v1/chat/completions","models":["provider/model-name"]}
]
```

The secret value is a JSON object mapping IDs to keys, for example `{"openai":"...","openrouter":"..."}`. Keep the real values only in Wrangler secrets or local `.dev.vars`.

Current limits: at most 8 configured providers, 20 allowlisted models per provider, 32 messages, 48 KiB of message text, 64 KiB request body, 1–1024 output tokens, 30-second upstream timeout, and a 128 KiB upstream response cap. Only OpenAI-compatible Chat Completions endpoints are supported. Native Anthropic/Gemini request formats, automatic multi-provider fan-out/synthesis, per-user quotas, budgets, and provider-specific moderation are not implemented. A client may select one configured provider per request. The existing offline/local model is not routed through this endpoint and remains available independently.

## Multiplayer room foundation

1. An authenticated client sends `POST /api/rooms/:roomId/ticket` with its bearer token.
2. The Worker asks the Durable Object for a one-use ticket valid for 30 seconds.
3. The browser opens `wss://<worker>/api/rooms/:roomId?ticket=<ticket>`; this avoids relying on custom Authorization headers, which the browser WebSocket API cannot set.
4. The Durable Object consumes the ticket once, then accepts the WebSocket.

Rooms currently relay JSON `chat` and `state` packets up to 8 KiB, with at most 16 connected sockets. Room tickets are one-use, valid for 30 seconds, limited to 4 pending tickets per user and 64 per room, and expired tickets are removed by a Durable Object alarm. When `ALLOWED_ORIGINS` is configured, browser WebSocket handshakes must match that allowlist; native clients without an `Origin` header are accepted. This is an ephemeral transport primitive only: no matchmaking, persistent world state, authoritative physics, anti-cheat, reconnect/resume, or room discovery is implemented.

## Security and operational limitations

- No secrets, deployment, remote resources, or billing changes are included in this repository change.
- Do not put Supabase signing secrets, service-role keys, or cloud AI provider keys in game/client code.
- The Worker currently has no distributed rate limiter or abuse/moderation pipeline. Do not expose write/AI endpoints broadly without adding those controls and cost limits.
- R2 metadata listing is a simple object-prefix scan, not a full search index.
- The AI gateway forwards one provider request; it does not automatically call every configured provider.
- The room relay is not a full game server.
- Cloudflare Worker code does not run directly on Android 4.2/4.4. Hosting the same API on the user's old Ainol/ImPAD tablets requires a separate Java-based Android server/cluster adapter; that is not included here.

## CI

`.github/workflows/backend.yml` runs the Node test suite on backend changes. It does not deploy. The tests cover JWT verification, Workshop upload/list/download/delete behavior with an in-memory R2 test double, validation limits, AI gateway routing with mocked upstream requests, room-ticket issuance, and room message filtering.
