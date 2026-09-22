/**
 * Cronofree sync on Netlify (free tier): the same /api/health, /api/sync and
 * /api/fetch endpoints as server/index.mjs, backed by Netlify Blobs.
 *
 * Setup: in the Netlify site settings add an environment variable
 *   CRONOFREE_TOKEN = any long random string
 * and paste the same string into You → Sync on each device.
 */
import { getStore } from "@netlify/blobs";
import { applySync, emptyStore, rowCount, tokenMatches } from "../../server/syncCore.mjs";

export const config = { path: ["/api/health", "/api/sync", "/api/fetch"] };

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

export default async (req) => {
  const url = new URL(req.url);
  const cors = { "Access-Control-Allow-Origin": req.headers.get("origin") || "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const token = process.env.CRONOFREE_TOKEN;
  if (!token) return json({ error: "Set the CRONOFREE_TOKEN environment variable in Netlify site settings, then redeploy." }, 503, cors);
  const auth = req.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!tokenMatches(given, token)) return json({ error: "unauthorized" }, 401, cors);

  const blobs = getStore({ name: "cronofree", consistency: "strong" });

  if (url.pathname === "/api/health") {
    const store = (await blobs.get("store", { type: "json" })) || emptyStore();
    return json({ ok: true, name: "Netlify · cronofree", rows: rowCount(store), seq: store.seq }, 200, cors);
  }

  if (url.pathname === "/api/sync" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const since = Number(body?.since || 0);
    const changes = Array.isArray(body?.changes) ? body.changes : [];
    const store = (await blobs.get("store", { type: "json" })) || emptyStore();
    const { result, changed } = applySync(store, since, changes);
    if (changed) await blobs.setJSON("store", store);
    return json(result, 200, cors);
  }

  if (url.pathname === "/api/fetch") {
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
};
