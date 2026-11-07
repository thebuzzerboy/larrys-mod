import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  WorkshopRoom,
  parseAIProviders,
  validateAIRequest,
  validateWorkshopFile,
  validateWorkshopFileContent,
  verifySupabaseJwt,
} from "../src/index.js";

const encoder = new TextEncoder();
const ISSUER = "https://project.example.supabase.co/auth/v1";

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function createJwt({ sub = "user-123", overrides = {}, keyPair = null } = {}) {
  const pair = keyPair || await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "test-es256-key";
  jwk.alg = "ES256";
  jwk.use = "sig";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", typ: "JWT", kid: jwk.kid };
  const claims = {
    iss: ISSUER,
    aud: "authenticated",
    role: "authenticated",
    sub,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  const input = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, pair.privateKey, encoder.encode(input),
  );
  return { token: input + "." + b64url(new Uint8Array(signature)), jwk, keyPair: pair };
}

async function createRsJwt() {
  const pair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "test-rs256-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: jwk.kid };
  const claims = { iss: ISSUER, aud: "authenticated", role: "authenticated", sub: "rsa-user", iat: now, exp: now + 3600 };
  const input = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, encoder.encode(input));
  return { token: input + "." + b64url(new Uint8Array(signature)), jwk };
}

function mockJwks(t, url, jwk, upstreamHandler = null) {
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const target = String(input);
    if (target === url) return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
    if (upstreamHandler) return upstreamHandler(target, init);
    throw new Error("Unexpected outbound request: " + target);
  });
}

function authEnv(url) {
  return { SUPABASE_JWKS_URL: url, SUPABASE_ISSUER: ISSUER };
}

class MemoryBucket {
  constructor() { this.objects = new Map(); }
  async put(key, value, options = {}) {
    const bytes = typeof value === "string"
      ? encoder.encode(value)
      : new Uint8Array(await new Response(value).arrayBuffer());
    this.objects.set(key, { bytes, httpMetadata: options.httpMetadata || {} });
  }
  async get(key) {
    const record = this.objects.get(key);
    if (!record) return null;
    return {
      size: record.bytes.byteLength,
      body: new Response(record.bytes).body,
      json: async () => JSON.parse(new TextDecoder().decode(record.bytes)),
      writeHttpMetadata(headers) {
        if (record.httpMetadata.contentType) headers.set("content-type", record.httpMetadata.contentType);
      },
    };
  }
  async delete(key) { this.objects.delete(key); }
  async list({ prefix, limit, cursor }) {
    const all = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const offset = Number(cursor || 0);
    const page = all.slice(offset, offset + limit);
    const next = offset + page.length;
    return { objects: page.map((key) => ({ key })), truncated: next < all.length, cursor: next < all.length ? String(next) : undefined };
  }
}

function makeGlb() {
  const bytes = new Uint8Array(12);
  bytes.set(encoder.encode("glTF"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  return new File([bytes], "chair.glb", { type: "model/gltf-binary" });
}

test("health endpoint responds without storage or authentication configuration", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "sandbox-protocol-backend" });
});

test("Workshop listing reports missing storage as a configuration error", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/workshop/items"), {});
  assert.equal(response.status, 503);
});

test("upload refuses to run when optional Supabase authentication is not configured", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/workshop/items", {
    method: "POST", headers: { "content-type": "multipart/form-data; boundary=empty" },
  }), { WORKSHOP_BUCKET: new MemoryBucket() });
  assert.equal(response.status, 503);
});

test("upload rejects missing bearer token when Supabase JWKS is configured", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/workshop/items", {
    method: "POST", headers: { "content-type": "multipart/form-data; boundary=empty" },
  }), { ...authEnv("https://unused.example.test/jwks"), WORKSHOP_BUCKET: new MemoryBucket() });
  assert.equal(response.status, 401);
});

test("validates supported model and texture formats", () => {
  assert.equal(validateWorkshopFile({ name: "chair.glb", size: 100, type: "model/gltf-binary", slice() {} }), null);
  assert.equal(validateWorkshopFile({ name: "brick.webp", size: 100, type: "image/webp", slice() {} }), null);
});

test("rejects executable, oversized, and mismatched uploads", () => {
  assert.match(validateWorkshopFile({ name: "payload.exe", size: 10, type: "application/octet-stream", slice() {} }), /Unsupported/);
  assert.match(validateWorkshopFile({ name: "huge.glb", size: 26 * 1024 * 1024, type: "model/gltf-binary", slice() {} }), /25 MiB/);
  assert.match(validateWorkshopFile({ name: "texture.png", size: 100, type: "text/html", slice() {} }), /do not match/);
});

test("checks file signatures and single-file glTF references", async () => {
  const invalidPng = new File(["not a png"], "bad.png", { type: "image/png" });
  assert.equal(await validateWorkshopFileContent(invalidPng), "PNG signature is invalid.");
  const validGlb = makeGlb();
  assert.equal(await validateWorkshopFileContent(validGlb), null);
  const externalGltf = new File([JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "mesh.bin" }] })], "mesh.gltf", { type: "model/gltf+json" });
  assert.match(await validateWorkshopFileContent(externalGltf), /cannot reference external files/);
});

test("verifies a valid Supabase ES256 JWT using the configured JWKS", async (t) => {
  const signed = await createJwt();
  const jwksUrl = "https://jwks-" + crypto.randomUUID() + ".example.test/keys";
  mockJwks(t, jwksUrl, signed.jwk);
  assert.deepEqual(await verifySupabaseJwt(signed.token, authEnv(jwksUrl)), { id: "user-123", role: "authenticated" });
});

test("verifies RS256 Supabase JWTs as well as ES256", async (t) => {
  const signed = await createRsJwt();
  const jwksUrl = "https://jwks-" + crypto.randomUUID() + ".example.test/keys";
  mockJwks(t, jwksUrl, signed.jwk);
  assert.deepEqual(await verifySupabaseJwt(signed.token, authEnv(jwksUrl)), { id: "rsa-user", role: "authenticated" });
});

test("rejects expired, wrong-issuer, and wrong-audience Supabase JWTs", async (t) => {
  const jwksUrl = "https://jwks-" + crypto.randomUUID() + ".example.test/keys";
  const signed = await createJwt({ overrides: { exp: Math.floor(Date.now() / 1000) - 10 } });
  mockJwks(t, jwksUrl, signed.jwk);
  assert.equal(await verifySupabaseJwt(signed.token, authEnv(jwksUrl)), null);
  const wrongIssuer = await createJwt({ overrides: { iss: "https://attacker.example/" }, keyPair: signed.keyPair });
  assert.equal(await verifySupabaseJwt(wrongIssuer.token, authEnv(jwksUrl)), null);
  const wrongAudience = await createJwt({ overrides: { aud: "anon" }, keyPair: signed.keyPair });
  assert.equal(await verifySupabaseJwt(wrongAudience.token, authEnv(jwksUrl)), null);
});

test("uploads, lists, downloads, and owner-deletes a validated Workshop asset", async (t) => {
  const signed = await createJwt();
  const jwksUrl = "https://jwks-" + crypto.randomUUID() + ".example.test/keys";
  mockJwks(t, jwksUrl, signed.jwk);
  const bucket = new MemoryBucket();
  const form = new FormData();
  form.set("file", makeGlb());
  form.set("name", "Test chair");
  form.set("description", "A test model");
  form.set("category", "props");
  form.set("tags", "chair,wood");
  const upload = await worker.fetch(new Request("https://example.test/api/workshop/items", {
    method: "POST", headers: { authorization: "Bearer " + signed.token }, body: form,
  }), { ...authEnv(jwksUrl), WORKSHOP_BUCKET: bucket });
  assert.equal(upload.status, 201);
  const metadata = await upload.json();
  assert.equal(metadata.name, "Test chair");
  assert.equal(metadata.ownerId, undefined);
  assert.equal(bucket.objects.size, 2);

  const listing = await worker.fetch(new Request("https://example.test/api/workshop/items"), { WORKSHOP_BUCKET: bucket });
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).items.length, 1);

  const asset = await worker.fetch(new Request("https://example.test" + metadata.assetUrl), { WORKSHOP_BUCKET: bucket });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-type"), "model/gltf-binary");
  assert.equal((await asset.arrayBuffer()).byteLength, 12);

  const otherUser = await createJwt({ sub: "different-user", keyPair: signed.keyPair });
  const forbiddenDelete = await worker.fetch(new Request("https://example.test/api/workshop/items/" + metadata.id, {
    method: "DELETE", headers: { authorization: "Bearer " + otherUser.token },
  }), { ...authEnv(jwksUrl), WORKSHOP_BUCKET: bucket });
  assert.equal(forbiddenDelete.status, 403);

  const deletion = await worker.fetch(new Request("https://example.test/api/workshop/items/" + metadata.id, {
    method: "DELETE", headers: { authorization: "Bearer " + signed.token },
  }), { ...authEnv(jwksUrl), WORKSHOP_BUCKET: bucket });
  assert.equal(deletion.status, 200);
  assert.equal(bucket.objects.size, 0);
});

test("validates AI provider allowlists and request limits", () => {
  const env = { AI_PROVIDERS_JSON: JSON.stringify([{ id: "provider-a", endpoint: "https://api.example.test/v1/chat/completions", models: ["model-a"] }]) };
  assert.equal(parseAIProviders(env)[0].id, "provider-a");
  assert.equal(validateAIRequest({ provider: "provider-a", model: "model-a", messages: [{ role: "user", content: "hello" }] }) || "", "");
  assert.match(validateAIRequest({ provider: "provider-a", model: "model-a", messages: [{ role: "tool", content: "hello" }] }), /supported role/);
  assert.match(validateAIRequest({ provider: "provider-a", model: "model-a", messages: [{ role: "user", content: "hello" }], max_tokens: 2048 }), /between 1 and 1024/);
  assert.throws(() => parseAIProviders({ AI_PROVIDERS_JSON: JSON.stringify([{ id: "bad", endpoint: "http://127.0.0.1:8080", models: ["x"] }]) }), /HTTPS/);
});

test("AI gateway keeps provider keys server-side and routes only allowlisted models", async (t) => {
  const signed = await createJwt();
  const jwksUrl = "https://jwks-" + crypto.randomUUID() + ".example.test/keys";
  const endpoint = "https://provider-" + crypto.randomUUID() + ".example.test/v1/chat/completions";
  let capturedAuthorization = null;
  mockJwks(t, jwksUrl, signed.jwk, async (target, init) => {
    assert.equal(target, endpoint);
    capturedAuthorization = new Headers(init.headers).get("authorization");
    const sent = JSON.parse(init.body);
    assert.equal(sent.model, "model-a");
    assert.equal(sent.messages[0].content, "hello");
    return new Response(JSON.stringify({ model: "model-a", choices: [{ message: { content: "Hello from server gateway" } }] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  });
  const env = {
    ...authEnv(jwksUrl),
    AI_PROVIDERS_JSON: JSON.stringify([{ id: "provider-a", endpoint, models: ["model-a"] }]),
    AI_PROVIDER_KEYS_JSON: JSON.stringify({ "provider-a": "server-only-test-key" }),
  };
  const response = await worker.fetch(new Request("https://example.test/api/ai/chat", {
    method: "POST",
    headers: { authorization: "Bearer " + signed.token, "content-type": "application/json" },
    body: JSON.stringify({ provider: "provider-a", model: "model-a", messages: [{ role: "user", content: "hello" }] }),
  }), env);
  assert.equal(response.status, 200);
  assert.equal(capturedAuthorization, "Bearer server-only-test-key");
  const result = await response.json();
  assert.equal(result.text, "Hello from server gateway");
  assert.equal(JSON.stringify(result).includes("server-only-test-key"), false);
});

test("AI gateway rejects unauthenticated requests before contacting a provider", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/ai/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "provider-a", model: "model-a", messages: [{ role: "user", content: "hello" }] }),
  }), { ...authEnv("https://unused.example.test/jwks"), AI_PROVIDERS_JSON: "[]", AI_PROVIDER_KEYS_JSON: "{}" });
  assert.equal(response.status, 401);
});

test("issues one-use, short-lived Durable Object room tickets", async () => {
  const records = new Map();
  const storage = {
    put: async (key, value) => records.set(key, value),
    transaction: async (callback) => callback({
      get: async (key) => records.get(key),
      delete: async (key) => records.delete(key),
    }),
  };
  const room = new WorkshopRoom({ storage, getWebSockets: () => [] });
  const issued = await room.fetch(new Request("https://room.internal/ticket", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "user-42" }),
  }));
  assert.equal(issued.status, 201);
  const { ticket, expiresIn } = await issued.json();
  assert.equal(expiresIn, 30);
  const stored = records.get("ticket:" + ticket);
  assert.equal(stored.userId, "user-42");
  assert.ok(stored.expiresAt > Date.now());
  assert.deepEqual(await room.consumeTicket(ticket), stored);
  assert.equal(await room.consumeTicket(ticket), null);
});

test("authenticated room ticket endpoint forwards identity to its Durable Object", async (t) => {
  const signed = await createJwt();
  const jwksUrl = "https://jwks-" + crypto.randomUUID() + ".example.test/keys";
  mockJwks(t, jwksUrl, signed.jwk);
  let ticketRequest;
  const env = {
    ...authEnv(jwksUrl),
    ROOMS: {
      idFromName: (name) => name,
      get: () => ({ fetch: async (request) => {
        ticketRequest = request;
        return new Response(JSON.stringify({ ticket: "one-use-ticket", expiresIn: 30 }), { status: 201 });
      } }),
    },
  };
  const response = await worker.fetch(new Request("https://example.test/api/rooms/lobby-1/ticket", {
    method: "POST", headers: { authorization: "Bearer " + signed.token },
  }), env);
  assert.equal(response.status, 201);
  assert.equal(new URL(ticketRequest.url).pathname, "/ticket");
  assert.deepEqual(await ticketRequest.json(), { userId: "user-123" });
});

test("room WebSocket route forwards a ticket without requiring browser WebSocket headers", async () => {
  let forwarded;
  const env = {
    ROOMS: {
      idFromName: (name) => name,
      get: () => ({ fetch: async (request) => {
        forwarded = request;
        return new Response("upgrade forwarded");
      } }),
    },
  };
  const response = await worker.fetch(new Request("https://example.test/api/rooms/lobby-1?ticket=123e4567-e89b-42d3-a456-426614174000", {
    headers: { upgrade: "websocket" },
  }), env);
  assert.equal(response.status, 200);
  assert.equal(new URL(forwarded.url).searchParams.get("ticket"), "123e4567-e89b-42d3-a456-426614174000");
});

test("room relay forwards only chat/state packets and closes oversized messages", () => {
  const received = [];
  const sender = {
    readyState: 1,
    deserializeAttachment: () => ({ userId: "user-1" }),
    send: (message) => received.push(JSON.parse(message)),
    close: (code) => { sender.closedWith = code; },
  };
  const state = { getWebSockets: () => [sender] };
  const room = new WorkshopRoom(state);
  room.webSocketMessage(sender, JSON.stringify({ type: "chat", payload: { text: "hi" } }));
  assert.equal(received.length, 1);
  assert.equal(received[0].sender, "user-1");
  room.webSocketMessage(sender, JSON.stringify({ type: "execute", payload: "ignored" }));
  assert.equal(received.length, 1);
  room.webSocketMessage(sender, "x".repeat(8193));
  assert.equal(sender.closedWith, 1009);
});