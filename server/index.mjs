#!/usr/bin/env node
/**
 * Cronofree sync server.
 *   npm run serve        → serves the built app (dist/) and the sync API
 *
 * Data lives in server/data/store.json — one JSON document, written atomically.
 * The first run generates a pairing token and prints it. Set CRONOFREE_TOKEN to
 * choose your own. Set PORT to change the port (default 8787).
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { applySync, emptyStore, rowCount, COLLECTIONS, tokenMatches } from "./syncCore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.CRONOFREE_DATA_DIR || path.join(__dirname, "data");
const STORE = path.join(DATA_DIR, "store.json");
const TOKEN_FILE = path.join(DATA_DIR, "token.txt");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 8787);

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadToken() {
  if (process.env.CRONOFREE_TOKEN) return process.env.CRONOFREE_TOKEN.trim();
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  const t = crypto.randomBytes(9).toString("base64url");
  fs.writeFileSync(TOKEN_FILE, t + "\n");
  return t;
}
const TOKEN = loadToken();

/** store = { seq, collections: { [name]: { [id]: { row, seq } } } } */
function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return emptyStore();
  }
}
const store = loadStore();
let writeTimer = null;
function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const tmp = STORE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, STORE);
  }, 250);
}
process.on("SIGINT", () => { if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; fs.writeFileSync(STORE, JSON.stringify(store)); } process.exit(0); });

void COLLECTIONS;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "200mb" }));

// CORS so a phone running the dev server or another origin can talk to this box.
app.use("/api", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!tokenMatches(t, TOKEN)) return res.status(401).json({ error: "unauthorized" });
  next();
}

app.get("/api/health", auth, (_req, res) => {
  res.json({ ok: true, name: `${os.hostname()} · cronofree`, rows: rowCount(store), seq: store.seq });
});

app.post("/api/sync", auth, (req, res) => {
  const since = Number(req.body?.since || 0);
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
  const { result, changed } = applySync(store, since, changes);
  if (changed) persist();
  res.json(result);
});

// Fetch proxy for recipe import (browsers block cross-origin page fetches). Token-protected, small, short.
app.get("/api/fetch", auth, async (req, res) => {
  const url = String(req.query.url || "");
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "http(s) url required" });
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; Cronofree/1.0; +recipe import)", Accept: "text/html,application/xhtml+xml" } });
    clearTimeout(t);
    const text = (await r.text()).slice(0, 2_000_000);
    res.json({ status: r.status, url: r.url, html: text });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// Pre-compressed offline food pack (6+ MB raw, ~1 MB gzipped)
app.get("/data/usda-pack.json", (req, res, next) => {
  const gz = path.join(DIST, "data", "usda-pack.json.gz");
  if (!fs.existsSync(gz) || !/\bgzip\b/.test(req.headers["accept-encoding"] || "")) return next();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Encoding", "gzip");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Vary", "Accept-Encoding");
  fs.createReadStream(gz).pipe(res);
});

// Static app
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: "index.html", maxAge: "1h", setHeaders: (res, p) => { if (p.endsWith("sw.js") || p.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache"); } }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(DIST, "index.html")));
} else {
  app.get("/", (_req, res) => res.type("text").send("Cronofree sync server is running. Build the app with `npm run build` to serve it from here too."));
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  return out;
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Cronofree server ready`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  This computer:  http://localhost:${PORT}`);
  for (const a of lanAddresses()) console.log(`  Your phone:     http://${a}:${PORT}`);
  console.log(`  Pairing token:  ${TOKEN}`);
  console.log(`  Data file:      ${STORE}`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Open the phone URL on the same Wi-Fi, add to Home Screen, then paste the token in You → Sync.\n`);
});
