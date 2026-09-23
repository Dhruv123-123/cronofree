/**
 * Platform-neutral request handler for the Cronofree API, shared by the
 * Netlify Function (netlify/functions/sync.mjs) and the Vercel Function
 * (api/[...route].mjs). Web-standard Request in, Response out.
 *
 *   /api/health        GET   store size + seq
 *   /api/sync          POST  {since, changes} -> {seq, changes}
 *   /api/fetch?url=    GET   HTML of a recipe page (CORS relay for the importer)
 *   /api/ai            POST  {url, method, headers, body} relayed to an allow-listed AI host
 *
 * `storage` is { load(): Promise<store|null>, save(store): Promise<void> }.
 */
import { applySync, emptyStore, rowCount, tokenMatches } from "./syncCore.mjs";

export const AI_HOSTS = [/\.openai\.azure\.com$/, /\.cognitiveservices\.azure\.com$/, /\.services\.ai\.azure\.com$/, /^api\.openai\.com$/, /^trackapi\.nutritionix\.com$/, /^openrouter\.ai$/, /^api\.groq\.com$/, /^generativelanguage\.googleapis\.com$/, /^api\.anthropic\.com$/];

export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

/**
 * @param {Request} req
 * @param {{ token?: string, storage: { load: () => Promise<any>, save: (s: any) => Promise<void> }, name?: string, setupHint?: string }} ctx
 */
export async function handleApi(req, ctx) {
  const url = new URL(req.url);
  const cors = { "Access-Control-Allow-Origin": req.headers.get("origin") || "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const token = ctx.token;
  if (!token) return json({ error: ctx.setupHint || "Set the CRONOFREE_TOKEN environment variable, then redeploy." }, 503, cors);
  const auth = req.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!tokenMatches(given, token)) return json({ error: "unauthorized" }, 401, cors);

  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/health") {
    const store = (await ctx.storage.load()) || emptyStore();
    return json({ ok: true, name: ctx.name || "cronofree", rows: rowCount(store), seq: store.seq }, 200, cors);
  }

  if (path === "/api/sync" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const since = Number(body?.since || 0);
    const changes = Array.isArray(body?.changes) ? body.changes : [];
    const store = (await ctx.storage.load()) || emptyStore();
    const { result, changed } = applySync(store, since, changes);
    if (changed) await ctx.storage.save(store);
    return json(result, 200, cors);
  }

  if (path === "/api/ai" && req.method === "POST") {
    const { url: target, method = "POST", headers = {}, body = "" } = await req.json().catch(() => ({}));
    let host = "";
    try { host = new URL(String(target)).hostname; } catch { return json({ error: "bad url" }, 400, cors); }
    if (!AI_HOSTS.some((re) => re.test(host))) return json({ error: `host not allowed: ${host}` }, 400, cors);
    try {
      const r = await fetch(String(target), { method, headers: { ...headers }, body: method === "GET" ? undefined : body });
      return json({ status: r.status, text: await r.text() }, 200, cors);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 502, cors);
    }
  }

  if (path === "/api/fetch") {
    const target = url.searchParams.get("url") || "";
    if (!/^https?:\/\//i.test(target)) return json({ error: "http(s) url required" }, 400, cors);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(target, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; Cronofree/1.0; +recipe import)", Accept: "text/html,application/xhtml+xml" } });
      clearTimeout(t);
      const html = (await r.text()).slice(0, 2_000_000);
      return json({ status: r.status, url: r.url, html }, 200, cors);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 502, cors);
    }
  }
  return json({ error: "not found" }, 404, cors);
}

/**
 * Adapter for Node-style (req, res) serverless signatures (Vercel's Node.js
 * runtime, Express-like hosts). Builds a Web Request, then writes the Response.
 */
export async function handleNode(req, res, ctx) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v); else if (Array.isArray(v)) headers.set(k, v.join(", "));
  let body;
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    if (typeof req.body === "string") body = req.body;
    else if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) body = JSON.stringify(req.body);
    else if (Buffer.isBuffer(req.body)) body = req.body;
    else body = await new Promise((resolve, reject) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject); });
  }
  const response = await handleApi(new Request(`${proto}://${host}${req.url}`, { method: req.method, headers, body }), ctx);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  const text = await response.text();
  res.end(text);
}
