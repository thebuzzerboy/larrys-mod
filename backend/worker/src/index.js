const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TAGS = 8;
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{3,48}$/;
const MAX_AI_BODY_BYTES = 64 * 1024;
const MAX_AI_MESSAGES = 32;
const MAX_AI_INPUT_CHARS = 48 * 1024;
const MAX_AI_OUTPUT_TOKENS = 1024;
const AI_PROVIDER_DEFINITIONS = {
  openai: { keyName: "OPENAI_API_KEY", modelsName: "OPENAI_MODELS" },
  anthropic: { keyName: "ANTHROPIC_API_KEY", modelsName: "ANTHROPIC_MODELS" },
  gemini: { keyName: "GEMINI_API_KEY", modelsName: "GEMINI_MODELS" },
  compatible: { keyName: "COMPATIBLE_API_KEY", modelsName: "COMPATIBLE_MODELS" },
};

const ALLOWED_ASSETS = new Map([
  [".glb", new Set(["model/gltf-binary", "application/octet-stream"])],
  [".gltf", new Set(["model/gltf+json", "application/json"])],
  [".obj", new Set(["text/plain", "application/octet-stream"])],
  [".mtl", new Set(["text/plain", "application/octet-stream"])],
  [".png", new Set(["image/png"])],
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".webp", new Set(["image/webp"])],
  [".json", new Set(["application/json"])],
]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function originAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return allowed.length === 0 || allowed.includes(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const headers = {
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
  if (origin && originAllowed(request, env)) headers["access-control-allow-origin"] = allowed.length ? origin : "*";
  return headers;
}

function withCors(response, request, env) {
  if (response.webSocket) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

const jwksCache = new Map();
async function getJwks(url, force = false) {
  const now = Date.now();
  const cached = jwksCache.get(url);
  if (!force && cached && cached.expiresAt > now) return cached.keys;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("JWKS URL must use HTTPS");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let response;
  try {
    response = await fetch(parsed.toString(), { headers: { accept: "application/json" }, signal: controller.signal });
  } finally { clearTimeout(timer); }
  if (!response.ok) throw new Error("JWKS request failed");
  const body = await response.json();
  if (!body || !Array.isArray(body.keys) || body.keys.length > 32) throw new Error("Invalid JWKS document");
  jwksCache.set(url, { keys: body.keys, expiresAt: now + 5 * 60 * 1000 });
  return body.keys;
}

export async function verifySupabaseJwt(token, env) {
  if (!token || token.length > 8192 || !env.SUPABASE_JWKS_URL || !env.SUPABASE_ISSUER) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (!header || !["ES256", "RS256"].includes(header.alg) || typeof header.kid !== "string" || header.crit || header.b64 === false) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.sub !== "string" || !claims.sub || typeof claims.exp !== "number" || claims.exp <= now) return null;
    if (claims.iss !== env.SUPABASE_ISSUER || claims.role !== "authenticated") return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes("authenticated")) return null;
    if (typeof claims.iat === "number" && claims.iat > now + 60) return null;
    if (typeof claims.nbf === "number" && claims.nbf > now + 60) return null;

    let keys = await getJwks(env.SUPABASE_JWKS_URL);
    let jwk = keys.find((key) => key.kid === header.kid && (!key.use || key.use === "sig"));
    if (!jwk) {
      keys = await getJwks(env.SUPABASE_JWKS_URL, true);
      jwk = keys.find((key) => key.kid === header.kid && (!key.use || key.use === "sig"));
    }
    if (!jwk || (jwk.alg && jwk.alg !== header.alg)) return null;

    let importAlgorithm, verifyAlgorithm;
    if (header.alg === "ES256" && jwk.kty === "EC" && jwk.crv === "P-256") {
      importAlgorithm = { name: "ECDSA", namedCurve: "P-256" };
      verifyAlgorithm = { name: "ECDSA", hash: "SHA-256" };
    } else if (header.alg === "RS256" && jwk.kty === "RSA") {
      importAlgorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      verifyAlgorithm = { name: "RSASSA-PKCS1-v1_5" };
    } else return null;

    const key = await crypto.subtle.importKey("jwk", jwk, importAlgorithm, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      verifyAlgorithm,
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1]),
    );
    return valid ? { id: claims.sub, role: claims.role } : null;
  } catch {
    return null;
  }
}

async function requireUser(request, env) {
  if (!env.SUPABASE_JWKS_URL || !env.SUPABASE_ISSUER) return { error: "not-configured" };
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifySupabaseJwt(match[1], env);
}

function safeText(value, max, field) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new Error(field + " must be text.");
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(field + " is limited to " + max + " characters.");
  return trimmed;
}

function safeFilename(value) {
  const leaf = String(value || "asset").split(/[\\/]/).pop();
  return leaf.replace(/[\u0000-\u001f\u007f"<>]/g, "_").trim().slice(0, 120) || "asset";
}

function publicMetadata(metadata) {
  return {
    id: metadata.id, name: metadata.name, description: metadata.description,
    category: metadata.category, tags: metadata.tags, fileName: metadata.fileName,
    size: metadata.size, contentType: metadata.contentType, createdAt: metadata.createdAt,
    version: metadata.version, assetUrl: "/api/workshop/items/" + metadata.id + "/asset",
  };
}

function assetExtension(filename) {
  const name = String(filename || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

export function validateWorkshopFile(file) {
  if (!file || typeof file.size !== "number" || file.size < 1) return "A non-empty file is required.";
  if (file.size > MAX_UPLOAD_BYTES) return "Files are limited to 25 MiB.";
  const ext = assetExtension(file.name);
  const types = ALLOWED_ASSETS.get(ext);
  if (!types) return "Unsupported file type. Allowed: GLB, glTF, OBJ, MTL, PNG, JPG, WEBP and JSON.";
  const type = (file.type || "application/octet-stream").toLowerCase();
  if (!types.has(type)) return "File extension and content type do not match.";
  return null;
}

export async function validateWorkshopFileContent(file) {
  const typeError = validateWorkshopFile(file);
  if (typeError) return typeError;
  const ext = assetExtension(file.name);
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start, end) => String.fromCharCode(...head.slice(start, end));
  if (ext === ".png" && !(head[0] === 0x89 && ascii(1, 4) === "PNG" && head[4] === 13 && head[5] === 10 && head[6] === 26 && head[7] === 10)) return "PNG signature is invalid.";
  if ((ext === ".jpg" || ext === ".jpeg") && !(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) return "JPEG signature is invalid.";
  if (ext === ".webp" && !(ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")) return "WebP signature is invalid.";
  if (ext === ".glb") {
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    if (ascii(0, 4) !== "glTF" || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== file.size) return "GLB header is invalid or not version 2.";
  }
  if (ext === ".gltf" || ext === ".json") {
    let document;
    try { document = JSON.parse(await file.text()); } catch { return "The JSON file is malformed."; }
    if (!document || typeof document !== "object") return "The JSON root must be an object or array.";
    if (ext === ".gltf") {
      if (!document.asset || document.asset.version !== "2.0") return "Only glTF 2.0 documents are supported.";
      for (const entry of [...(document.buffers || []), ...(document.images || [])]) {
        if (entry.uri && !entry.uri.startsWith("data:")) return "Single-file glTF uploads cannot reference external files; use GLB or embedded data URIs.";
      }
    }
  }
  if (ext === ".obj" || ext === ".mtl") {
    const sample = new TextDecoder().decode(await file.slice(0, Math.min(file.size, 8192)).arrayBuffer());
    if (sample.includes("\0")) return "Binary content is not accepted for OBJ/MTL files.";
    const plausible = ext === ".obj" ? /(^|\n)\s*(v|vn|vt|f|o|g|mtllib|usemtl)\s/m : /(^|\n)\s*(newmtl|Ka|Kd|Ks|Ns|d|Tr|map_Kd|illum)\s/m;
    if (!plausible.test(sample)) return "The " + ext.slice(1).toUpperCase() + " file does not contain recognizable records.";
  }
  return null;
}

function normalizeTags(value) {
  return String(value || "").split(",").map((tag) => tag.trim().toLowerCase())
    .filter((tag) => /^[a-z0-9 _-]{1,24}$/.test(tag)).slice(0, MAX_TAGS);
}

async function workshopList(request, env, url) {
  if (!env.WORKSHOP_BUCKET) return json({ error: "Workshop storage is not configured." }, 503);
  const requestedLimit = Number(url.searchParams.get("limit")) || 20;
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 50);
  const cursor = url.searchParams.get("cursor") || undefined;
  const page = await env.WORKSHOP_BUCKET.list({ prefix: "items/", limit, cursor });
  const items = [];
  for (const object of page.objects) {
    const stored = await env.WORKSHOP_BUCKET.get(object.key);
    if (!stored) continue;
    try {
      const metadata = await stored.json();
      if (metadata && metadata.id && metadata.assetKey && metadata.assetKey.startsWith("assets/")) items.push(publicMetadata(metadata));
    } catch { /* Ignore malformed metadata. */ }
  }
  return json({ items, cursor: page.truncated ? page.cursor : null });
}

async function workshopItem(request, env, id, action) {
  const key = "items/" + id + ".json";
  const stored = await env.WORKSHOP_BUCKET.get(key);
  if (!stored) return json({ error: "Workshop item not found." }, 404);
  let metadata;
  try { metadata = await stored.json(); } catch { return json({ error: "Invalid item metadata." }, 500); }
  if (!metadata || metadata.id !== id || typeof metadata.assetKey !== "string" || !metadata.assetKey.startsWith("assets/")) return json({ error: "Invalid item metadata." }, 500);

  if (action === "asset") {
    const asset = await env.WORKSHOP_BUCKET.get(metadata.assetKey);
    if (!asset) return json({ error: "Workshop asset not found." }, 404);
    const headers = new Headers();
    asset.writeHttpMetadata(headers);
    headers.set("content-length", String(asset.size));
    headers.set("content-disposition", "attachment; filename=\"" + safeFilename(metadata.fileName).replace(/"/g, "_") + "\"");
    headers.set("x-content-type-options", "nosniff");
    headers.set("cache-control", "public, max-age=300");
    return new Response(asset.body, { headers });
  }

  if (request.method === "DELETE") {
    const user = await requireUser(request, env);
    if (user?.error === "not-configured") return json({ error: "Authentication is not configured." }, 503);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (metadata.ownerId !== user.id) return json({ error: "You can only delete your own Workshop items." }, 403);
    await env.WORKSHOP_BUCKET.delete(metadata.assetKey);
    await env.WORKSHOP_BUCKET.delete(key);
    return json({ deleted: true, id });
  }
  return json(publicMetadata(metadata));
}

async function workshopUpload(request, env) {
  if (!env.WORKSHOP_BUCKET) return json({ error: "Workshop storage is not configured." }, 503);
  const user = await requireUser(request, env);
  if (user?.error === "not-configured") return json({ error: "Authentication is not configured." }, 503);
  if (!user) return json({ error: "A valid Supabase access token is required." }, 401);
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + 256 * 1024) return json({ error: "Upload body exceeds the 25 MiB file limit." }, 413);
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Expected multipart form data." }, 400); }
  const file = form.get("file");
  const validationError = await validateWorkshopFileContent(file);
  if (validationError) return json({ error: validationError }, 400);

  let name, description, category;
  try {
    name = safeText(form.get("name"), MAX_NAME_LENGTH, "Name");
    description = safeText(form.get("description"), MAX_DESCRIPTION_LENGTH, "Description");
    category = safeText(form.get("category"), 32, "Category") || "other";
  } catch (error) { return json({ error: error.message }, 400); }
  if (!name) return json({ error: "Item name is required." }, 400);
  if (!/^[a-z0-9_-]{1,32}$/i.test(category)) return json({ error: "Invalid category." }, 400);

  const id = crypto.randomUUID();
  const fileName = safeFilename(file.name);
  const ext = assetExtension(fileName);
  const assetKey = "assets/" + id + ext;
  const metadata = {
    id, name, description, category: category.toLowerCase(), tags: normalizeTags(form.get("tags")),
    ownerId: user.id, fileName, size: file.size, contentType: file.type || "application/octet-stream",
    assetKey, createdAt: new Date().toISOString(), version: 1,
  };

  await env.WORKSHOP_BUCKET.put(assetKey, file.stream(), {
    httpMetadata: { contentType: metadata.contentType },
    customMetadata: { itemId: id, ownerId: user.id },
  });
  try {
    await env.WORKSHOP_BUCKET.put("items/" + id + ".json", JSON.stringify(metadata), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  } catch (error) {
    await env.WORKSHOP_BUCKET.delete(assetKey);
    throw error;
  }
  return json(publicMetadata(metadata), 201);
}

export class WorkshopRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
    const sockets = this.state.getWebSockets();
    if (sockets.length >= 16) return json({ error: "Room is full (16 players maximum)." }, 429);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.serializeAttachment({ userId: request.headers.get("x-sp-user") || "unknown" });
    server.send(JSON.stringify({ type: "room-ready", players: sockets.length + 1, maxPlayers: 16 }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(sender, message) {
    if (typeof message !== "string" || message.length > 8192) {
      sender.close(1009, "Message too large");
      return;
    }
    let packet;
    try { packet = JSON.parse(message); } catch { return; }
    if (!packet || !["chat", "state"].includes(packet.type)) return;
    const safePacket = JSON.stringify({
      type: packet.type,
      payload: packet.payload,
      sender: sender.deserializeAttachment()?.userId || "unknown",
      timestamp: Date.now(),
    });
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState === 1) socket.send(safePacket);
    }
  }

  webSocketClose() {}
  webSocketError() {}
}

async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "sandbox-protocol-backend" });

  if (url.pathname === "/api/workshop/items" && request.method === "GET") {
    if (!env.WORKSHOP_BUCKET) return json({ error: "Workshop storage is not configured." }, 503);
    return workshopList(request, env, url);
  }
  if (url.pathname === "/api/workshop/items" && request.method === "POST") return workshopUpload(request, env);

  const itemMatch = url.pathname.match(/^\/api\/workshop\/items\/([a-f0-9-]{36})(\/asset)?$/i);
  if (itemMatch && ["GET", "DELETE"].includes(request.method)) {
    if (itemMatch[2] && request.method !== "GET") return json({ error: "Method not allowed." }, 405);
    if (!env.WORKSHOP_BUCKET) return json({ error: "Workshop storage is not configured." }, 503);
    return workshopItem(request, env, itemMatch[1], itemMatch[2] ? "asset" : "metadata");
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{3,48})$/);
  if (roomMatch && request.headers.get("Upgrade") === "websocket") {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!env.ROOMS) return json({ error: "Multiplayer rooms are not configured." }, 503);
    const id = env.ROOMS.idFromName(roomMatch[1]);
    const stub = env.ROOMS.get(id);
    const headers = new Headers(request.headers);
    headers.set("x-sp-user", user.id);
    return stub.fetch(new Request(request, { headers }));
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return withCors(await route(request, env), request, env);
    } catch (error) {
      console.error("Sandbox Protocol backend error:", error);
      return withCors(json({ error: "Internal server error." }, 500), request, env);
    }
  },
};
