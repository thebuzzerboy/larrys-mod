(function (root) {
  "use strict";

  class Semaphore {
    constructor(limit) {
      this.limit = Math.max(1, Number(limit) || 1);
      this.active = 0;
      this.waiters = [];
    }
    async acquire(signal) {
      if (signal && signal.aborted) throw new Error("Request cancelled");
      if (this.active < this.limit) {
        this.active++;
        return () => this.release();
      }
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, signal, abort: null };
        waiter.abort = () => {
          const i = this.waiters.indexOf(waiter);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new Error("Request cancelled"));
        };
        if (signal) signal.addEventListener("abort", waiter.abort, { once: true });
        this.waiters.push(waiter);
      }).then(() => {
        this.active++;
        return () => this.release();
      });
    }
    release() {
      this.active = Math.max(0, this.active - 1);
      const next = this.waiters.shift();
      if (next) {
        if (next.signal) next.signal.removeEventListener("abort", next.abort);
        next.resolve();
      }
    }
  }

  class AICoordinator {
    constructor(options) {
      options = options || {};
      this.providers = new Map();
      this.semaphore = new Semaphore(options.maxConcurrent || 3);
      this.timeoutMs = options.timeoutMs || 45000;
    }

    register(name, adapter, options) {
      if (!name || !adapter || typeof adapter.complete !== "function") {
        throw new TypeError("A provider needs a name and complete() adapter");
      }
      this.providers.set(name, {
        name: name,
        adapter: adapter,
        kind: (options && options.kind) || "cloud",
        enabled: !options || options.enabled !== false,
        model: (options && options.model) || null
      });
      return this;
    }

    unregister(name) {
      this.providers.delete(name);
    }

    listProviders() {
      return Array.from(this.providers.values()).map(function (p) {
        return { name: p.name, kind: p.kind, enabled: p.enabled, model: p.model };
      });
    }

    async callProvider(provider, payload, externalSignal) {
      const release = await this.semaphore.acquire(externalSignal);
      const controller = new AbortController();
      const abortFromCaller = function () { controller.abort(); };
      if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener("abort", abortFromCaller, { once: true });
      }
      const timer = setTimeout(function () { controller.abort(); }, this.timeoutMs);
      try {
        const result = await provider.adapter.complete({
          messages: payload.messages,
          characterId: payload.characterId || "default",
          signal: controller.signal,
          metadata: payload.metadata || {}
        });
        if (!result || typeof result.text !== "string") {
          throw new Error("Provider returned no text");
        }
        return {
          provider: provider.name,
          model: result.model || provider.model || null,
          text: result.text
        };
      } finally {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener("abort", abortFromCaller);
        release();
      }
    }

    async complete(payload, options) {
      options = options || {};
      if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
        throw new TypeError("messages must be a non-empty array");
      }
      const mode = options.mode || "ensemble";
      const requested = options.providers || [];
      const candidates = Array.from(this.providers.values()).filter(function (p) {
        return p.enabled && (!requested.length || requested.indexOf(p.name) !== -1);
      });
      const selected = mode === "local"
        ? candidates.filter(function (p) { return p.kind === "local"; }).slice(0, 1)
        : mode === "single"
          ? candidates.slice(0, 1)
          : candidates;
      if (!selected.length) throw new Error("No enabled AI provider matches this request");

      const settled = await Promise.allSettled(selected.map((provider) =>
        this.callProvider(provider, payload, options.signal)
      ));
      const results = settled.filter(function (x) { return x.status === "fulfilled"; })
        .map(function (x) { return x.value; });
      const errors = settled.filter(function (x) { return x.status === "rejected"; })
        .map(function (x) { return String(x.reason && x.reason.message || x.reason); });
      if (!results.length) throw new Error("All AI providers failed: " + errors.join("; "));

      let combined = results.map(function (r) {
        return "[" + r.provider + (r.model ? " / " + r.model : "") + "]\n" + r.text;
      }).join("\n\n");
      if (typeof options.synthesize === "function" && results.length > 1) {
        combined = await options.synthesize(results, {
          messages: payload.messages,
          characterId: payload.characterId || "default",
          signal: options.signal
        });
      }
      return { text: String(combined), results: results, errors: errors };
    }
  }

  function openAICompatible(options) {
    options = options || {};
    if (!options.baseUrl || !options.model) {
      throw new TypeError("baseUrl and model are required");
    }
    return {
      complete: async function (request) {
        const headers = { "Content-Type": "application/json" };
        if (options.apiKey) headers.Authorization = "Bearer " + options.apiKey;
        const response = await fetch(options.baseUrl.replace(/\/$/, "") + "/chat/completions", {
          method: "POST",
          headers: headers,
          signal: request.signal,
          body: JSON.stringify({
            model: options.model,
            messages: request.messages,
            temperature: options.temperature == null ? 0.7 : options.temperature
          })
        });
        if (!response.ok) throw new Error("AI endpoint returned HTTP " + response.status);
        const data = await response.json();
        const text = data && data.choices && data.choices[0] &&
          data.choices[0].message && data.choices[0].message.content;
        if (typeof text !== "string") throw new Error("AI endpoint response had no message text");
        return { text: text, model: data.model || options.model };
      }
    };
  }

  // Calls the Sandbox Protocol Worker gateway. Provider API keys stay on the server;
  // the client supplies only a short-lived account access token and provider/model IDs.
  function workerGateway(options) {
    options = options || {};
    if (!options.baseUrl || !/^[a-z0-9_-]{1,32}$/.test(options.provider || "") ||
        !options.model || typeof options.getAccessToken !== "function") {
      throw new TypeError("baseUrl, provider, model and getAccessToken are required");
    }
    return {
      complete: async function (request) {
        const token = await options.getAccessToken();
        if (typeof token !== "string" || !token) throw new Error("A valid account access token is required for the AI gateway");
        const response = await fetch(options.baseUrl.replace(/\/$/, "") + "/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          signal: request.signal,
          body: JSON.stringify({
            provider: options.provider,
            model: options.model,
            messages: request.messages,
            max_tokens: options.maxTokens == null ? 512 : options.maxTokens,
            temperature: options.temperature == null ? 0.7 : options.temperature
          })
        });
        const data = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error((data && data.error) || ("AI gateway returned HTTP " + response.status));
        if (!data || typeof data.text !== "string") throw new Error("AI gateway returned no message text");
        return { text: data.text, model: data.model || options.model };
      }
    };
  }

  root.SandboxAI = Object.freeze({
    AICoordinator: AICoordinator,
    openAICompatible: openAICompatible,
    workerGateway: workerGateway
  });
})(typeof window !== "undefined" ? window : globalThis);