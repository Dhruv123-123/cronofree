#!/usr/bin/env node
/**
 * Merge data/restaurants/*.json (one file per research batch, hand-editable)
 * into public/data/restaurants.json. Validates numbers and vegetarian-ness.
 *   npm run restaurants
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePack } from "../src/lib/restaurantTransform.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "data", "restaurants");
const OUT = path.join(ROOT, "public", "data", "restaurants.json");

const restaurants = [];
for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith(".json")).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8"));
  for (const r of j.restaurants ?? []) restaurants.push({ ...r, items: (r.items ?? []).filter((it) => it && it.name) });
}
// merge duplicates of the same restaurant name (e.g. Sweetgreen in both cities keeps both since city differs)
const byKey = new Map();
for (const r of restaurants) {
  const k = `${r.name.toLowerCase()}|${r.city}`;
  if (byKey.has(k)) byKey.get(k).items.push(...r.items); else byKey.set(k, { ...r, items: [...r.items] });
}
const merged = [...byKey.values()].sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
const pack = { app: "cronofree", type: "restaurant-pack", version: Date.now(), generatedAt: new Date().toISOString(), restaurants: merged };
const problems = validatePack(pack);
if (problems.length) { console.error("Problems:\n  " + problems.join("\n  ")); if (process.argv.includes("--strict")) process.exit(1); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(pack));
const n = merged.reduce((a, r) => a + r.items.length, 0);
const pub = merged.reduce((a, r) => a + r.items.filter((i) => i.basis === "published").length, 0);
console.log(`wrote ${path.relative(ROOT, OUT)} · ${merged.length} restaurants · ${n} items (${pub} published, ${n - pub} estimated) · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB${problems.length ? ` · ${problems.length} warnings` : ""}`);
