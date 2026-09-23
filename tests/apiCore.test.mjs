import { test } from "node:test";
import assert from "node:assert/strict";
import { handleApi, handleNode } from "../server/apiCore.mjs";
import { EventEmitter } from "node:events";

const memory = () => { let store = null; return { load: async () => store, save: async (s) => { store = JSON.parse(JSON.stringify(s)); } }; };
const ctx = (over = {}) => ({ token: "secret", storage: memory(), name: "test", ...over });
const req = (path, init = {}, auth = "Bearer secret") => new Request(`https://x.test${path}`, { ...init, headers: { authorization: auth, "content-type": "application/json", ...(init.headers || {}) } });

test("api: refuses without token env, rejects wrong token, answers preflight", async () => {
  const noToken = await handleApi(req("/api/health"), ctx({ token: undefined, setupHint: "set it" }));
  assert.equal(noToken.status, 503);
  assert.match((await noToken.json()).error, /set it/);
  assert.equal((await handleApi(req("/api/health", {}, "Bearer nope"), ctx())).status, 401);
  const pre = await handleApi(new Request("https://x.test/api/sync", { method: "OPTIONS", headers: { origin: "https://app.test" } }), ctx());
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "https://app.test");
});

test("api: health + sync round trip through the storage adapter", async () => {
  const c = ctx();
  const h = await (await handleApi(req("/api/health"), c)).json();
  assert.deepEqual([h.ok, h.rows, h.seq], [true, 0, 0]);
  const push = await (await handleApi(req("/api/sync", { method: "POST", body: JSON.stringify({ since: 0, changes: [{ collection: "weights", row: { id: "w1", kg: 70, updatedAt: 5 } }] }) }), c)).json();
  assert.equal(push.seq, 1);
  const pull = await (await handleApi(req("/api/sync", { method: "POST", body: JSON.stringify({ since: 0, changes: [] }) }), c)).json();
  assert.equal(pull.changes.length, 1);
  assert.equal(pull.changes[0].row.kg, 70);
  assert.equal((await (await handleApi(req("/api/health"), c)).json()).rows, 1);
});

test("api: ai relay only forwards to allow-listed hosts; unknown routes 404", async () => {
  const bad = await handleApi(req("/api/ai", { method: "POST", body: JSON.stringify({ url: "https://evil.example/x" }) }), ctx());
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /not allowed/);
  assert.equal((await handleApi(req("/api/nope"), ctx())).status, 404);
  assert.equal((await handleApi(req("/api/fetch?url=ftp://x"), ctx())).status, 400);
});

test("api: node (req, res) adapter builds a Request and writes the Response", async () => {
  const c = ctx();
  const fake = (method, url, body) => {
    const r = new EventEmitter(); r.method = method; r.url = url; r.headers = { host: "x.test", authorization: "Bearer secret", "content-type": "application/json" }; r.body = body;
    const out = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(t) { this.text = t; this.done(); } };
    return { r, out, wait: new Promise((res) => { out.done = res; }) };
  };
  const a = fake("POST", "/api/sync", { since: 0, changes: [{ collection: "weights", row: { id: "w2", kg: 71, updatedAt: 9 } }] });
  await handleNode(a.r, a.out, c); await a.wait;
  assert.equal(a.out.statusCode, 200);
  assert.equal(JSON.parse(a.out.text).seq, 1);
  const b = fake("GET", "/api/health");
  await handleNode(b.r, b.out, c); await b.wait;
  assert.equal(JSON.parse(b.out.text).rows, 1);
  assert.equal(b.out.headers["content-type"], "application/json");
});
