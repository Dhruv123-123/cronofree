import test from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../src/lib/aiPure.ts";
import { baseUrl } from "../src/lib/aiPure.ts";

test("endpoint normalisation accepts pasted full URLs", () => {
  assert.equal(baseUrl({ provider: "azure", endpoint: "https://x.services.ai.azure.com/openai/v1/responses" }), "https://x.services.ai.azure.com");
  assert.equal(baseUrl({ provider: "azure", endpoint: "https://x.openai.azure.com/openai/deployments/gpt/chat/completions?api-version=2024-10-21" }), "https://x.openai.azure.com");
  assert.equal(baseUrl({ provider: "azure", endpoint: "https://x.openai.azure.com/" }), "https://x.openai.azure.com");
  assert.equal(baseUrl({ provider: "openai", endpoint: "" }), "https://api.openai.com");
  assert.equal(baseUrl({ provider: "openai", endpoint: "https://openrouter.ai/api/v1" }), "https://openrouter.ai/api");
});

test("extractJson tolerates prose around the object", () => {
  assert.deepEqual(extractJson('Sure! {"kcal": 400, "note": "x"} hope that helps'), { kcal: 400, note: "x" });
  assert.throws(() => extractJson("no json here"));
});
