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
    return { seq: 0, collections: {} };
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

const COLLECTIONS = new Set(["foods", "recipes", "entries", "savedMeals", "water", "fasts", "weights", "measurements", "photos", "profile", "dayOverrides", "exercises", "programs", "workouts"]);

function rowCount() {
  let n = 0;
  for (const c of Object.values(store.collections)) n += Object.keys(c).length;
  return n;
}

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
  if (!t || !crypto.timingSafeEqual(Buffer.from(t.padEnd(64)), Buffer.from(TOKEN.padEnd(64)))) return res.status(401).json({ error: "unauthorized" });
  next();
}

app.get("/api/health", auth, (_req, res) => {
  res.json({ ok: true, name: `${os.hostname()} · cronofree`, rows: rowCount(), seq: store.seq });
});

app.post("/api/sync", auth, (req, res) => {
  const since = Number(req.body?.since || 0);
  const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
  let accepted = 0;
  const pushedIds = new Set();
  for (const c of changes) {
    if (!c || !COLLECTIONS.has(c.collection) || !c.row || typeof c.row.id !== "string") continue;
    const col = (store.collections[c.collection] ||= {});
    const cur = col[c.row.id];
    if (!cur || (c.row.updatedAt || 0) >= (cur.row.updatedAt || 0)) {
      store.seq += 1;
      col[c.row.id] = { row: c.row, seq: store.seq };
      accepted += 1;
    }
    pushedIds.add(`${c.collection}:${c.row.id}`);
  }
  const out = [];
  for (const [name, col] of Object.entries(store.collections)) {
    for (const [id, rec] of Object.entries(col)) {
      if (rec.seq > since && !pushedIds.has(`${name}:${id}`)) out.push({ collection: name, row: rec.row });
    }
  }
  if (accepted) persist();
  res.json({ seq: store.seq, changes: out, accepted });
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
