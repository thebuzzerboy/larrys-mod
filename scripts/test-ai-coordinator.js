"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../app/src/main/assets/ai/ai-coordinator.js");

test("ensemble calls providers concurrently and returns partial results", async () => {
  const ai = new global.SandboxAI.AICoordinator({ maxConcurrent: 2, timeoutMs: 1000 });
  ai.register("local", { complete: async () => ({ text: "local answer" }) }, { kind: "local" });
  ai.register("cloud-a", { complete: async () => ({ text: "cloud answer" }) }, { kind: "cloud" });
  ai.register("offline", { complete: async () => { throw new Error("offline"); } });
  const result = await ai.complete({ messages: [{ role: "user", content: "hello" }] });
  assert.equal(result.results.length, 2);
  assert.equal(result.errors.length, 1);
  assert.match(result.text, /local answer/);
  assert.match(result.text, /cloud answer/);
});

test("local mode selects only the local provider", async () => {
  const ai = new global.SandboxAI.AICoordinator();
  ai.register("local", { complete: async () => ({ text: "offline works" }) }, { kind: "local" });
  ai.register("cloud", { complete: async () => ({ text: "should not run" }) }, { kind: "cloud" });
  const result = await ai.complete({ messages: [{ role: "user", content: "test" }] }, { mode: "local" });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].provider, "local");
});

test("rejects requests with no messages", async () => {
  const ai = new global.SandboxAI.AICoordinator();
  await assert.rejects(() => ai.complete({ messages: [] }), /non-empty/);
});

test("Worker gateway adapter sends only an account token and provider/model selection", async (t) => {
  let captured;
  t.mock.method(global, "fetch", async (url, init) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ provider: "openai", model: "gpt-test", text: "gateway answer" }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  });
  const adapter = global.SandboxAI.workerGateway({
    baseUrl: "https://backend.example.workers.dev/",
    provider: "openai",
    model: "gpt-test",
    getAccessToken: async () => "short-lived-user-token"
  });
  const result = await adapter.complete({ messages: [{ role: "user", content: "hello" }] });
  assert.equal(captured.url, "https://backend.example.workers.dev/api/ai/chat");
  assert.equal(new Headers(captured.init.headers).get("authorization"), "Bearer short-lived-user-token");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.provider, "openai");
  assert.equal(body.model, "gpt-test");
  assert.equal(Object.prototype.hasOwnProperty.call(body, "apiKey"), false);
  assert.equal(result.text, "gateway answer");
});

test("Worker gateway adapter refuses to send without an account token", async () => {
  const adapter = global.SandboxAI.workerGateway({
    baseUrl: "https://backend.example.workers.dev",
    provider: "openai",
    model: "gpt-test",
    getAccessToken: async () => ""
  });
  await assert.rejects(() => adapter.complete({ messages: [{ role: "user", content: "hello" }] }), /access token is required/);
});