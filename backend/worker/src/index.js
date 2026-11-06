const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TAGS = 8;
const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{3,48}$/;

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

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const configured = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = !origin || configured.length === 0 || configured.includes(origin);
  return {
    "access-control-allow-origin": allowed ? (configured.length ? (origin || configured[0]) : "*") : "null",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type,X-Workshop-Name,X-Workshop-Description,X-Workshop-Category,X-Workshop-Tags",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function withCors(response, request, env) {
  // Cloudflare's WebSocket 101 response must be returned intact; the standard
  // Response constructor cannot recreate a 101 response or preserve its socket.
  if (response.webSocket) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function verifySupabaseJwt(token, secret) {
  if (!secret || !token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (header.alg !== "HS256" || !claims.sub || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    if (claims.role !== "authenticated") return null;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, decodeBase64Url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1])
    );
    return valid ? { id: String(claims.sub), role: claims.role } : null;
  } catch {
    return null;
  }
}

async function requireUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return verifySupabaseJwt(match[1], env.SUPABASE_JWT_SECRET);
}

function safeText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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

function normalizeTags(value) {
  return String(value || "").split(",").map((tag) => tag.trim().toLowerCase())
    .filter((tag) => /^[a-z0-9 _-]{1,24}$/.test(tag)).slice(0, MAX_TAGS);
}

async function workshopList(request, env, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);
  const cursor = url.searchParams.get("cursor") || undefined;
  const page = await env.WORKSHOP_BUCKET.list({ prefix: "items/", limit, cursor });
  const items = [];
  for (const object of page.objects) {
    const stored = await env.WORKSHOP_BUCKET.get(object.key);
    if (!stored) continue;
    try { items.push(await stored.json()); } catch { /* ignore malformed metadata */ }
  }
  return json({ items, cursor: page.truncated ? page.cursor : null });
}

async function workshopItem(request, env, id, action) {
  const key = `items/${id}.json`;
  const stored = await env.WORKSHOP_BUCKET.get(key);
  if (!stored) return json({ error: "Workshop item not found." }, 404);

  let metadata;
  try { metadata = await stored.json(); } catch { return json({ error: "Invalid item metadata." }, 500); }

  if (action === "asset") {
    const asset = await env.WORKSHOP_BUCKET.get(metadata.assetKey);
    if (!asset) return json({ error: "Workshop asset not found." }, 404);
    const headers = new Headers();
    asset.writeHttpMetadata(headers);
    headers.set("content-length", String(asset.size));
    headers.set("content-disposition", `attachment; filename="${metadata.fileName.replace(/["\\\\\\r\\n]/g, "_")}"`);
    headers.set("x-content-type-options", "nosniff");
    headers.set("cache-control", "public, max-age=300");
    return new Response(asset.body, { headers });
  }

  if (request.method === "DELETE") {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (metadata.ownerId !== user.id) return json({ error: "You can only delete your own Workshop items." }, 403);
    await env.WORKSHOP_BUCKET.delete(metadata.assetKey);
    await env.WORKSHOP_BUCKET.delete(key);
    return json({ deleted: true, id });
  }
  return json(metadata);
}

async function workshopUpload(request, env) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "A valid Supabase access token is required." }, 401);
  if (!env.WORKSHOP_BUCKET) return json({ error: "Workshop storage is not configured." }, 503);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Expected multipart form data." }, 400); }
  const file = form.get("file");
  const validationError = validateWorkshopFile(file);
  if (validationError) return json({ error: validationError }, 400);

  const name = safeText(form.get("name"), MAX_NAME_LENGTH);
  const description = safeText(form.get("description"), MAX_DESCRIPTION_LENGTH);
  const category = safeText(form.get("category"), 32) || "other";
  if (!name) return json({ error: "Item name is required." }, 400);

  const id = crypto.randomUUID();
  const ext = assetExtension(file.name);
  const assetKey = `assets/${id}${ext}`;
  const metadata = {
    id, name, description, category, tags: normalizeTags(form.get("tags")),
    ownerId: user.id, fileName: safeText(file.name, 120), size: file.size,
    contentType: file.type || "application/octet-stream", assetKey,
    createdAt: new Date().toISOString(), version: 1,
  };

  await env.WORKSHOP_BUCKET.put(assetKey, file.stream(), {
    httpMetadata: { contentType: metadata.contentType },
    customMetadata: { itemId: id, ownerId: user.id },
  });
  try {
    await env.WORKSHOP_BUCKET.put(`items/${id}.json`, JSON.stringify(metadata), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  } catch (error) {
    await env.WORKSHOP_BUCKET.delete(assetKey);
    throw error;
  }
  return json(metadata, 201);
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
