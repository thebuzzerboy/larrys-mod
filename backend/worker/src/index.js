const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TAGS = 8;
const MAX_TAG_INPUT_LENGTH = 1024;
const MAX_PENDING_ROOM_TICKETS = 64;
const MAX_PENDING_USER_TICKETS = 4;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AI_BODY_BYTES = 64 * 1024;
const MAX_AI_MESSAGES = 32;
const MAX_AI_INPUT_CHARS = 48 * 1024;
const MAX_AI_OUTPUT_TOKENS = 1024;
const MAX_AI_OUTPUT_CHARS = 64 * 1024;
const AI_TIMEOUT_MS = 30_000;

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

const jwksCache = new Map();

class BodyTooLargeError extends Error {}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...headers },
  });
}

async function readLimitedStream(stream, maxBytes) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new BodyTooLargeError("Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function readLimitedBody(request, maxBytes) {
  return readLimitedStream(request.body, maxBytes);
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
    vary: "Origin",
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
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url value");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function getJwks(url, force = false) {
  const now = Date.now();
  const cached = jwksCache.get(url);
  if (!force && cached && cached.expiresAt > now) return cached.keys;

  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    throw new Error("JWKS URL must be a trusted HTTPS URL");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let response;
  try {
    response = await fetch(parsed.toString(), { headers: { accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error("JWKS request failed");
  const body = await response.json();
  if (!body || !Array.isArray(body.keys) || body.keys.length < 1 || body.keys.length > 32) {
    throw new Error("Invalid JWKS document");
  }
  const keys = body.keys.filter((key) => key && typeof key === "object" && typeof key.kid === "string");
  if (!keys.length) throw new Error("JWKS contains no usable keys");
  if (jwksCache.size > 16) jwksCache.clear();
  jwksCache.set(url, { keys, expiresAt: now + 5 * 60 * 1000 });
  return keys;
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
    if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) return null;
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= now) return null;
    if (typeof claims.iat !== "number" || !Number.isFinite(claims.iat) || claims.iat > now + 60) return null;
    if (claims.nbf != null && (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > now + 60)) return null;
    if (claims.iss !== env.SUPABASE_ISSUER || claims.role !== "authenticated") return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes("authenticated")) return null;

    let keys = await getJwks(env.SUPABASE_JWKS_URL);
    let jwk = keys.find((key) => key.kid === header.kid && (!key.use || key.use === "sig"));
    if (!jwk) {
      keys = await getJwks(env.SUPABASE_JWKS_URL, true);
      jwk = keys.find((key) => key.kid === header.kid && (!key.use || key.use === "sig"));
    }
    if (!jwk || (jwk.alg && jwk.alg !== header.alg)) return null;

    let importAlgorithm;
    let verifyAlgorithm;
    if (header.alg === "ES256" && jwk.kty === "EC" && jwk.crv === "P-256") {
      importAlgorithm = { name: "ECDSA", namedCurve: "P-256" };
      verifyAlgorithm = { name: "ECDSA", hash: "SHA-256" };
    } else if (header.alg === "RS256" && jwk.kty === "RSA") {
      importAlgorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      verifyAlgorithm = { name: "RSASSA-PKCS1-v1_5" };
    } else {
      return null;
    }

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

function assetExtension(filename) {
  const name = String(filename || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function validAssetKey(key, id) {
  if (typeof key !== "string" || !key.startsWith("assets/" + id)) return false;
  const ext = assetExtension(key);
  return ALLOWED_ASSETS.has(ext) && key === "assets/" + id + ext;
}

function publicMetadata(metadata) {
  return {
    id: metadata.id,
    name: metadata.name,
    description: metadata.description,
    category: metadata.category,
    tags: metadata.tags,
    fileName: metadata.fileName,
    size: metadata.size,
    contentType: metadata.contentType,
    createdAt: metadata.createdAt,
    version: metadata.version,
    assetUrl: "/api/workshop/items/" + metadata.id + "/asset",
  };
}

export function validateWorkshopFile(file) {
  if (!file || typeof file.size !== "number" || file.size < 1 || typeof file.slice !== "function") {
    return "A non-empty file is required.";
  }
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
    if (head.length < 12) return "GLB header is incomplete.";
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    if (ascii(0, 4) !== "glTF" || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== file.size) return "GLB header is invalid or not version 2.";
  }
  if (ext === ".gltf" || ext === ".json") {
    let document;
    try { document = JSON.parse(await file.text()); } catch { return "The JSON file is malformed."; }
    if (!document || typeof document !== "object") return "The JSON root must be an object or array.";
    if (ext === ".gltf") {
      if (!document.asset || document.asset.version !== "2.0") return "Only glTF 2.0 documents are supported.";
      if ((document.buffers != null && !Array.isArray(document.buffers)) || (document.images != null && !Array.isArray(document.images))) return "Invalid glTF buffers or images list.";
      for (const entry of [...(document.buffers || []), ...(document.images || [])]) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "Invalid glTF resource entry.";
        if (entry.uri != null) {
          if (typeof entry.uri !== "string") return "glTF resource URI must be text.";
          if (!entry.uri.startsWith("data:")) return "Single-file glTF uploads cannot reference external files; use GLB or embedded data URIs.";
        }
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
  if (typeof value !== "string") return [];
  return value.split(",").map((tag) => tag.trim().toLowerCase())
    .filter((tag) => /^[a-z0-9 _-]{1,24}$/.test(tag)).slice(0, MAX_TAGS);
}

async function workshopList(env, url) {
  if (!env.WORKSHOP_BUCKET) return json({ error: "Workshop storage is not configured." }, 503);
  const rawLimit = url.searchParams.get("limit");
  const requestedLimit = rawLimit == null ? 20 : Number(rawLimit);
  if (!Number.isFinite(requestedLimit)) return json({ error: "Invalid limit." }, 400);
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 50);
  const cursor = url.searchParams.get("cursor") || undefined;
  if (cursor && cursor.length > 2048) return json({ error: "Invalid cursor." }, 400);
  const page = await env.WORKSHOP_BUCKET.list({ prefix: "items/", limit, cursor });
  const records = await Promise.all(page.objects.map(async (object) => {
    const match = object.key.match(/^items\/([0-9a-f-]{36})\.json$/i);
    if (!match) return null;
    const stored = await env.WORKSHOP_BUCKET.get(object.key);
    if (!stored) return null;
    try {
      const metadata = await stored.json();
      if (!metadata || metadata.id !== match[1] || !validAssetKey(metadata.assetKey, metadata.id)) return null;
      return publicMetadata(metadata);
    } catch {
      return null;
    }
  }));
  return json({ items: records.filter(Boolean), cursor: page.truncated ? page.cursor : null });
}

async function workshopItem(request, env, id, action) {
  const key = "items/" + id + ".json";
  const stored = await env.WORKSHOP_BUCKET.get(key);
  if (!stored) return json({ error: "Workshop item not found." }, 404);
  let metadata;
  try { metadata = await stored.json(); } catch { return json({ error: "Invalid item metadata." }, 500); }
  if (!metadata || metadata.id !== id || !validAssetKey(metadata.assetKey, id)) return json({ error: "Invalid item metadata." }, 500);

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

  const contentType = request.headers.get("Content-Type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return json({ error: "Expected multipart form data." }, 415);
  const contentLengthHeader = request.headers.get("Content-Length");
  if (contentLengthHeader != null) {
    if (!/^\d+$/.test(contentLengthHeader)) return json({ error: "Invalid Content-Length." }, 400);
    if (Number(contentLengthHeader) > MAX_MULTIPART_BYTES) return json({ error: "Upload body exceeds the 25 MiB file limit." }, 413);
  }

  let form;
  try {
    const bytes = await readLimitedBody(request, MAX_MULTIPART_BYTES);
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    form = await new Request(request.url, { method: "POST", headers, body: bytes }).formData();
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "Upload body exceeds the 25 MiB file limit." }, 413);
    return json({ error: "Expected valid multipart form data." }, 400);
  }

  const file = form.get("file");
  const validationError = await validateWorkshopFileContent(file);
  if (validationError) return json({ error: validationError }, 400);

  const tagsField = form.get("tags");
  if (tagsField != null && typeof tagsField !== "string") return json({ error: "Tags must be text." }, 400);
  if (typeof tagsField === "string" && tagsField.length > MAX_TAG_INPUT_LENGTH) {
    return json({ error: "Tags are limited to 1024 characters." }, 400);
  }

  let name;
  let description;
  let category;
  try {
    name = safeText(form.get("name"), MAX_NAME_LENGTH, "Name");
    description = safeText(form.get("description"), MAX_DESCRIPTION_LENGTH, "Description");
    category = safeText(form.get("category"), 32, "Category") || "other";
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  if (!name) return json({ error: "Item name is required." }, 400);
  if (!/^[a-z0-9_-]{1,32}$/i.test(category)) return json({ error: "Invalid category." }, 400);

  const id = crypto.randomUUID();
  const fileName = safeFilename(file.name);
  const ext = assetExtension(fileName);
  const assetKey = "assets/" + id + ext;
  const metadata = {
    id,
    name,
    description,
    category: category.toLowerCase(),
    tags: normalizeTags(tagsField),
    ownerId: user.id,
    fileName,
    size: file.size,
    contentType: file.type || "application/octet-stream",
    assetKey,
    createdAt: new Date().toISOString(),
    version: 1,
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
  return json(publicMetadata(metadata), 201, { "cache-control": "no-store" });
}

export function parseAIProviders(env) {
  let configured;
  try { configured = JSON.parse(env.AI_PROVIDERS_JSON || "[]"); } catch { throw new Error("AI provider configuration is invalid JSON."); }
  if (!Array.isArray(configured) || configured.length > 8) throw new Error("AI provider configuration must be an array of at most 8 providers.");
  const seen = new Set();
  return configured.map((entry) => {
    if (!entry || typeof entry !== "object" || !/^[a-z0-9_-]{1,32}$/.test(entry.id || "") || seen.has(entry.id)) {
      throw new Error("AI provider IDs must be unique lowercase identifiers.");
    }
    seen.add(entry.id);
    let endpoint;
    try { endpoint = new URL(entry.endpoint); } catch { throw new Error("AI provider endpoint is invalid."); }
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash || endpoint.search || (endpoint.port && endpoint.port !== "443")) {
      throw new Error("AI provider endpoints must be HTTPS URLs without credentials, query strings, or nonstandard ports.");
    }
    if (!Array.isArray(entry.models) || entry.models.length < 1 || entry.models.length > 20 || entry.models.some((model) => typeof model !== "string" || !model || model.length > 128)) {
      throw new Error("Each AI provider needs an allowlist of 1 to 20 model names.");
    }
    return { id: entry.id, endpoint: endpoint.toString(), models: [...new Set(entry.models)] };
  });
}

export function validateAIRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Request must be a JSON object.";
  if (typeof body.provider !== "string" || !/^[a-z0-9_-]{1,32}$/.test(body.provider)) return "A valid provider ID is required.";
  if (typeof body.model !== "string" || !body.model || body.model.length > 128) return "A valid model name is required.";
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_AI_MESSAGES) return "Messages must contain 1 to 32 entries.";
  let total = 0;
  for (const message of body.messages) {
    if (!message || typeof message !== "object" || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content) {
      return "Each message needs a supported role and non-empty text content.";
    }
    total += message.content.length;
    if (message.content.length > MAX_AI_INPUT_CHARS || total > MAX_AI_INPUT_CHARS) return "AI input is limited to 48 KiB of text.";
  }
  if (body.max_tokens != null && (!Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > MAX_AI_OUTPUT_TOKENS)) return "max_tokens must be between 1 and 1024.";
  if (body.temperature != null && (typeof body.temperature !== "number" || !Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2)) return "temperature must be between 0 and 2.";
  return null;
}

async function aiChat(request, env) {
  const user = await requireUser(request, env);
  if (user?.error === "not-configured") return json({ error: "Authentication is not configured." }, 503);
  if (!user) return json({ error: "Authentication required." }, 401);

  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) return json({ error: "Expected application/json." }, 415);
  let body;
  try {
    const bytes = await readLimitedBody(request, MAX_AI_BODY_BYTES);
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "AI request exceeds 64 KiB." }, 413);
    return json({ error: "Invalid JSON request." }, 400);
  }
  const validationError = validateAIRequest(body);
  if (validationError) return json({ error: validationError }, 400);

  let providers;
  let keys;
  try {
    providers = parseAIProviders(env);
    keys = JSON.parse(env.AI_PROVIDER_KEYS_JSON || "{}");
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) throw new Error("Invalid AI provider key map.");
  } catch {
    return json({ error: "AI gateway is not configured correctly." }, 503);
  }
  const provider = providers.find((entry) => entry.id === body.provider);
  if (!provider) return json({ error: "The requested AI provider is not enabled." }, 400);
  if (!provider.models.includes(body.model)) return json({ error: "The requested model is not allowed for this provider." }, 400);
  const apiKey = keys[provider.id];
  if (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 512) return json({ error: "The selected AI provider has no valid server-side key configured." }, 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const upstream = await fetch(provider.endpoint, {
      method: "POST",
      headers: { authorization: "Bearer " + apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        max_tokens: body.max_tokens || 512,
        temperature: body.temperature == null ? 0.7 : body.temperature,
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) return json({ error: "The AI provider returned an unsuccessful response." }, 502);
    let result;
    try {
      const bytes = await readLimitedStream(upstream.body, 128 * 1024);
      result = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      if (error instanceof BodyTooLargeError) return json({ error: "The AI provider response was too large." }, 502);
      return json({ error: "The AI provider returned invalid JSON." }, 502);
    }
    const text = result?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text || text.length > MAX_AI_OUTPUT_CHARS) return json({ error: "The AI provider returned an invalid or oversized response." }, 502);
    return json({ provider: provider.id, model: result.model || body.model, text });
  } catch (error) {
    if (controller.signal.aborted) return json({ error: "AI provider request timed out." }, 504);
    return json({ error: "AI provider could not be reached." }, 502);
  } finally {
    clearTimeout(timer);
  }
}

export class WorkshopRoom {
  constructor(state) {
    this.state = state;
  }

  async issueTicket(userId) {
    const ticket = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + 30_000;
    const result = await this.state.storage.transaction(async (transaction) => {
      const pending = await transaction.list({ prefix: "ticket:", limit: MAX_PENDING_ROOM_TICKETS + 1 });
      let total = 0;
      let userTotal = 0;
      let alarmAt = expiresAt;
      for (const [key, record] of pending) {
        if (!record || !Number.isFinite(record.expiresAt) || record.expiresAt <= now || typeof record.userId !== "string") {
          await transaction.delete(key);
          continue;
        }
        total++;
        if (record.userId === userId) userTotal++;
        alarmAt = Math.min(alarmAt, record.expiresAt);
      }
      if (total >= MAX_PENDING_ROOM_TICKETS || userTotal >= MAX_PENDING_USER_TICKETS) return { created: false };
      await transaction.put("ticket:" + ticket, { userId, expiresAt });
      return { created: true, alarmAt };
    });
    if (!result.created) return null;
    await this.state.storage.setAlarm(result.alarmAt);
    return ticket;
  }

  async consumeTicket(ticket) {
    if (typeof ticket !== "string" || !UUID_PATTERN.test(ticket)) return null;
    const key = "ticket:" + ticket;
    return this.state.storage.transaction(async (transaction) => {
      const record = await transaction.get(key);
      if (record) await transaction.delete(key);
      if (!record || record.expiresAt <= Date.now() || typeof record.userId !== "string") return null;
      return record;
    });
  }

  async alarm() {
    const now = Date.now();
    const pending = await this.state.storage.list({ prefix: "ticket:" });
    let nextAlarm = Infinity;
    for (const [key, record] of pending) {
      if (!record || !Number.isFinite(record.expiresAt) || record.expiresAt <= now || typeof record.userId !== "string") {
        await this.state.storage.delete(key);
      } else {
        nextAlarm = Math.min(nextAlarm, record.expiresAt);
      }
    }
    if (Number.isFinite(nextAlarm)) await this.state.storage.setAlarm(nextAlarm);
    else if (this.state.storage.deleteAlarm) await this.state.storage.deleteAlarm();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ticket" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid ticket request." }, 400); }
      if (!body || typeof body.userId !== "string" || !body.userId || body.userId.length > 128) return json({ error: "Invalid ticket request." }, 400);
      const ticket = await this.issueTicket(body.userId);
      if (!ticket) return json({ error: "Too many pending room tickets. Wait for existing tickets to expire." }, 429);
      return json({ ticket, expiresIn: 30 }, 201, { "cache-control": "no-store" });
    }
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
    const ticketRecord = await this.consumeTicket(url.searchParams.get("ticket"));
    if (!ticketRecord) return json({ error: "Room ticket is invalid, expired, or already used." }, 401);
    const sockets = this.state.getWebSockets();
    if (sockets.length >= 16) return json({ error: "Room is full (16 players maximum)." }, 429);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.serializeAttachment({ userId: ticketRecord.userId });
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
    if (!packet || typeof packet !== "object" || !["chat", "state"].includes(packet.type)) return;
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

  if (url.pathname === "/api/workshop/items" && request.method === "GET") return workshopList(env, url);
  if (url.pathname === "/api/workshop/items" && request.method === "POST") return workshopUpload(request, env);

  const itemMatch = url.pathname.match(/^\/api\/workshop\/items\/([0-9a-f-]{36})(\/asset)?$/i);
  if (itemMatch && UUID_PATTERN.test(itemMatch[1]) && ["GET", "DELETE"].includes(request.method)) {
    if (itemMatch[2] && request.method !== "GET") return json({ error: "Method not allowed." }, 405);
    if (!env.WORKSHOP_BUCKET) return json({ error: "Workshop storage is not configured." }, 503);
    return workshopItem(request, env, itemMatch[1], itemMatch[2] ? "asset" : "metadata");
  }

  if (url.pathname === "/api/ai/chat" && request.method === "POST") return aiChat(request, env);

  const roomTicketMatch = url.pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{3,48})\/ticket$/);
  if (roomTicketMatch && request.method === "POST") {
    const user = await requireUser(request, env);
    if (user?.error === "not-configured") return json({ error: "Authentication is not configured." }, 503);
    if (!user) return json({ error: "Authentication required." }, 401);
    if (!env.ROOMS) return json({ error: "Multiplayer rooms are not configured." }, 503);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(roomTicketMatch[1]));
    return stub.fetch(new Request("https://room.internal/ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    }));
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{3,48})$/);
  if (roomMatch && request.headers.get("Upgrade") === "websocket") {
    if (!originAllowed(request, env)) return json({ error: "WebSocket origin is not allowed." }, 403);
    if (!env.ROOMS) return json({ error: "Multiplayer rooms are not configured." }, 503);
    const ticket = url.searchParams.get("ticket");
    if (!ticket || !UUID_PATTERN.test(ticket)) return json({ error: "A short-lived room ticket is required." }, 401);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(roomMatch[1]));
    const connectUrl = new URL("https://room.internal/connect");
    connectUrl.searchParams.set("ticket", ticket);
    return stub.fetch(new Request(connectUrl, { headers: request.headers }));
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