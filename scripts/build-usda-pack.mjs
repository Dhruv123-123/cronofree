#!/usr/bin/env node
/**
 * Build the offline USDA food pack.
 *
 *   npm run usda            → SR Legacy (7,793 foods) + Foundation Foods (~340)
 *   npm run usda -- --survey → also FNDDS survey foods (~5,400 prepared dishes, restaurant-style items)
 *
 * Downloads the official FoodData Central JSON releases (no API key needed),
 * normalises every food to per-100 g using the same mapper the app uses for
 * live USDA search, keeps household portions with gram weights, and writes
 * public/data/usda-pack.json. The app installs the pack into IndexedDB on
 * first launch so search works fully offline.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { usdaToFood } from "../src/lib/foodSources.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache", "usda");
const OUT = path.join(ROOT, "public", "data", "usda-pack.json");
const PACK_VERSION = 2;

const DATASETS = [
  { key: "sr", kind: "S", url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip", root: "SRLegacyFoods" },
  { key: "foundation", kind: "F", url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2025-04-24.zip", root: "FoundationFoods" },
];
if (process.argv.includes("--survey")) DATASETS.push({ key: "survey", kind: "V", url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip", root: "SurveyFoods" });

fs.mkdirSync(CACHE, { recursive: true });

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  process.stdout.write(`  downloading ${path.basename(file)} … `);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log(`${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}

/** Minimal ZIP reader (stored + deflate) so we need no dependency. Returns the first .json entry. */
function readFirstJsonFromZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  // End of central directory
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!name.endsWith(".json")) continue;
    const lnameLen = buf.readUInt16LE(localOff + 26), lextraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lnameLen + lextraLen;
    const data = buf.subarray(start, start + csize);
    return method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: 2 ** 31 - 1 }) : data;
  }
  throw new Error("no json in zip");
}

const FRACTIONS = { 0.125: "1/8", 0.25: "1/4", 0.333: "1/3", 0.5: "1/2", 0.666: "2/3", 0.75: "3/4", 1.5: "1 1/2" };
function fmtAmount(a) {
  if (!a) return "";
  const r = Math.round(a * 1000) / 1000;
  for (const [k, v] of Object.entries(FRACTIONS)) if (Math.abs(r - Number(k)) < 0.002) return v;
  return String(r);
}

/** Turn FDC portion records into clean household labels. */
function cleanPortions(portions = []) {
  const out = [];
  for (const p of portions) {
    const g = Number(p.gramWeight);
    if (!g || g <= 0) continue;
    let unit = p.measureUnit?.name && p.measureUnit.name !== "undetermined" ? p.measureUnit.name : "";
    let mod = (p.modifier || "").replace(/\s*From \d{4,}\s*$/i, "").trim();
    let label = p.portionDescription && !/quantity not specified/i.test(p.portionDescription) ? p.portionDescription : "";
    if (!label) {
      const amt = fmtAmount(p.amount ?? p.value);
      const parts = [amt, unit.toLowerCase(), mod].filter(Boolean);
      label = parts.join(" ").replace(/\s+,/g, ",").trim();
    }
    if (!label || /^\d*\.?\d*$/.test(label)) label = `${fmtAmount(p.amount ?? 1) || "1"} serving`;
    label = label.replace(/\bNLEA serving\b/i, "serving (label)").replace(/\s{2,}/g, " ");
    label = label.replace(/\b(.{3,}?)\s+\1\b/i, "$1"); // "not packed not packed"
    out.push({ gramWeight: g, portionDescription: label });
  }
  // Prefer the portion a person would actually pick: medium → large → small → label serving → unit/piece → cup → rest
  const rank = (l) => /\byield from\b/i.test(l) ? 6 : /\bmedium\b/i.test(l) ? 0 : /\blarge\b/i.test(l) ? 1 : /\bsmall\b/i.test(l) ? 2 : /serving \(label\)/i.test(l) ? 3 : /^1 (unit|piece|slice|fillet|steak|chop|breast|thigh|egg|bar|can|bottle|container|package|patty|link|cookie|muffin|roll|bagel|tortilla|pita|waffle|pancake|scoop|tbsp|tsp|oz)\b/i.test(l) ? 4 : /^1 cup\b/i.test(l) ? 5 : /^\d/.test(l) ? 6 : 7;
  return out.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p.portionDescription) - rank(b.p.portionDescription) || a.i - b.i).map((x) => x.p);
}

function sig(v) {
  if (v === 0) return 0;
  const m = Math.pow(10, 3 - Math.ceil(Math.log10(Math.abs(v))));
  return Math.round(v * m) / m;
}

const foods = [];
const seen = new Set();
for (const ds of DATASETS) {
  const zip = path.join(CACHE, `${ds.key}.zip`);
  await download(ds.url, zip);
  process.stdout.write(`  parsing ${ds.key} … `);
  const json = JSON.parse(readFirstJsonFromZip(zip).toString("utf8"));
  const list = json[ds.root] ?? [];
  let n = 0;
  for (const raw of list) {
    const f = usdaToFood({ fdcId: raw.fdcId, description: raw.description, dataType: raw.dataType ?? ds.key, foodNutrients: raw.foodNutrients, foodPortions: cleanPortions(raw.foodPortions), foodCategory: raw.foodCategory ?? raw.wweiaFoodCategory?.wweiaFoodCategoryDescription });
    if (!f || seen.has(f.id) || f.per100.kcal === undefined) continue;
    seen.add(f.id);
    const per100 = {};
    for (const [k, v] of Object.entries(f.per100)) if (typeof v === "number" && Number.isFinite(v)) per100[k] = sig(v);
    const servings = f.servings.filter((s) => !/^100 g$/.test(s.label)).slice(0, 8).map((s) => [s.label, Math.round(s.gramWeight ?? s.grams)]);
    foods.push({ i: raw.fdcId, n: f.name, c: f.category ?? "", k: ds.kind, p: per100, s: servings });
    n++;
  }
  console.log(`${n} foods`);
}

// Foundation entries supersede SR duplicates with the same name: keep both ids but flag SR ones lower.
foods.sort((a, b) => a.n.localeCompare(b.n));
const pack = { app: "cronofree", type: "usda-pack", version: PACK_VERSION, generatedAt: new Date().toISOString(), datasets: DATASETS.map((d) => d.key), count: foods.length, foods };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(pack));
fs.writeFileSync(OUT + ".gz", zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }));
const size = fs.statSync(OUT).size;
console.log(`\n  wrote ${path.relative(ROOT, OUT)} · ${foods.length.toLocaleString()} foods · ${(size / 1e6).toFixed(1)} MB (${(zlib.gzipSync(fs.readFileSync(OUT)).length / 1e6).toFixed(1)} MB gzipped)\n`);
