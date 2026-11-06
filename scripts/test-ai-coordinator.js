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
