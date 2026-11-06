import test from "node:test";
import assert from "node:assert/strict";
import worker, { validateWorkshopFile } from "../src/index.js";

test("health endpoint responds without storage configuration", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "sandbox-protocol-backend" });
});

test("workshop listing reports missing storage as a configuration error", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/workshop/items"), {});
  assert.equal(response.status, 503);
});

test("upload endpoint rejects missing authentication before parsing upload", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/workshop/items", { method: "POST" }), {
    WORKSHOP_BUCKET: { put() {} },
  });
  assert.equal(response.status, 401);
});

test("validates supported model and texture formats", () => {
  assert.equal(validateWorkshopFile({ name: "chair.glb", size: 100, type: "model/gltf-binary" }), null);
  assert.equal(validateWorkshopFile({ name: "brick.webp", size: 100, type: "image/webp" }), null);
});

test("rejects executable and oversized uploads", () => {
  assert.match(validateWorkshopFile({ name: "payload.exe", size: 10, type: "application/octet-stream" }), /Unsupported/);
  assert.match(validateWorkshopFile({ name: "huge.glb", size: 26 * 1024 * 1024, type: "model/gltf-binary" }), /25 MiB/);
});

test("rejects mismatched extension and MIME type", () => {
  assert.match(validateWorkshopFile({ name: "texture.png", size: 100, type: "text/html" }), /do not match/);
});
