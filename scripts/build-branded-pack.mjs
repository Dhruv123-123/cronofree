#!/usr/bin/env node
/**
 * Branded products pack from Open Food Facts: the most-scanned US products of
 * the brands people actually buy, vegetarian-filtered. Writes
 * public/data/branded-pack.json. Polite to OFF's rate limit (≈1 search / 6 s).
 *   npm run branded            (≈ 20 min for the full brand list)
 *   npm run branded -- --quick (1 page per brand)
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { offToFood } from "../src/lib/foodSources.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "data", "branded-pack.json");
const CACHE = path.join(ROOT, ".cache", "off");
fs.mkdirSync(CACHE, { recursive: true });
const PAGE_SIZE = 100;
// Two pages only for store brands with huge catalogues; one page (top 100 by scans) for everyone else.
const DEEP = new Set(["trader-joe-s", "kirkland-signature", "365-whole-foods-market", "great-value", "good-gather", "simple-truth", "signature-select", "o-organics"]);
const pagesFor = (brand) => (process.argv.includes("--quick") ? 1 : DEEP.has(brand) ? 2 : 1);

// OFF brand slugs. Grocery staples, snacks, protein, plant-based, drinks, cafés.
const BRANDS = [...new Set([
  "trader-joe-s", "kirkland-signature", "365-whole-foods-market", "365-everyday-value", "good-gather", "great-value", "simple-truth", "o-organics", "signature-select",
  "clif-bar", "kind", "larabar", "rxbar", "quest-nutrition", "perfect-bar", "gomacro", "built-bar", "barebells", "nature-valley", "kodiak-cakes", "nature-s-bakery", "that-s-it", "bobo-s",
  "chobani", "siggi-s", "fage", "oikos", "two-good", "noosa", "activia", "yoplait", "dannon", "fairlife", "core-power", "premier-protein", "muscle-milk", "orgain", "huel", "soylent", "optimum-nutrition", "dymatize", "ghost", "vega", "garden-of-life", "myprotein", "ka-chava", "athletic-greens",
  "oatly", "silk", "so-delicious", "califia-farms", "ripple", "almond-breeze", "planet-oat", "chobani-oat",
  "beyond-meat", "impossible-foods", "morningstar-farms", "gardein", "tofurky", "field-roast", "lightlife", "daiya", "violife", "follow-your-heart", "miyoko-s", "just-egg", "house-foods", "nasoya", "amy-s", "annie-s", "sweet-earth", "dr-praeger-s", "hilary-s",
  "sabra", "hope-foods", "cedar-s", "bob-s-red-mill", "quaker", "cheerios", "kellogg-s", "general-mills", "post", "kashi", "cascadian-farm", "nature-s-path", "purely-elizabeth", "bear-naked",
  "dave-s-killer-bread", "ezekiel-4-9", "mission", "la-tortilla-factory", "siete", "banza", "barilla", "rao-s", "prego", "classico",
  "nutella", "oreo", "lay-s", "doritos", "cheetos", "tostitos", "cheez-it", "goldfish", "pringles", "ritz", "triscuit", "wheat-thins", "popcorners", "skinnypop", "boom-chicka-pop", "hippeas", "lesser-evil", "pirate-s-booty", "veggie-straws", "terra",
  "kit-kat", "m-m-s", "reese-s", "snickers", "hershey-s", "ghirardelli", "lindt", "tony-s-chocolonely", "hu", "justin-s", "ben-jerry-s", "haagen-dazs", "halo-top", "talenti", "yasso", "magnum",
  "starbucks", "celsius", "red-bull", "monster-energy", "gatorade", "vitaminwater", "la-croix", "olipop", "poppi", "spindrift", "liquid-death", "bai", "body-armor", "coca-cola", "pepsi", "sprite", "dr-pepper", "arizona", "snapple", "honest-tea", "yakult", "gt-s-living-foods", "health-ade", "kevita", "boba-guys", "bubly",
  "tillamook", "philadelphia", "babybel", "the-laughing-cow", "sargento", "kraft", "cabot", "organic-valley", "horizon-organic", "land-o-lakes", "kerrygold", "boursin",
  "heinz", "hidden-valley", "sriracha", "huy-fong", "tajin", "cholula", "sir-kensington-s", "primal-kitchen", "chosen-foods", "kewpie", "kikkoman", "lee-kum-kee",
  "stouffer-s", "lean-cuisine", "healthy-choice", "eggo", "pillsbury", "betty-crocker", "duncan-hines", "king-arthur", "ghirardelli",
  "planters", "wonderful-pistachios", "blue-diamond", "emerald", "sahale-snacks", "justin-s", "jif", "skippy", "peter-pan", "smucker-s", "welch-s", "ocean-spray", "tropicana", "simply", "naked", "odwalla", "suja", "evolution-fresh", "pressed",
  "mccormick", "old-el-paso", "taco-bell", "ortega", "goya", "bush-s", "eden-foods", "pacific-foods", "progresso", "campbell-s", "kettle-brand", "cape-cod", "late-july", "garden-of-eatin", "food-should-taste-good", "chipotle", "sweetgreen",
])];

const FIELDS = "code,product_name,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,nutriments,categories,ingredients_analysis_tags,unique_scans_n,countries_tags";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(brand, page) {
  const cacheFile = path.join(CACHE, `${brand}-${page}.json`);
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  const url = `https://world.openfoodfacts.org/api/v2/search?brands_tags=${encodeURIComponent(brand)}&countries_tags=en:united-states&fields=${FIELDS}&page_size=${PAGE_SIZE}&page=${page}&sort_by=unique_scans_n`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": "Cronofree/1.0 (personal food log; github.com/Dhruv123-123/cronofree)" } });
    if (r.status === 429 || r.status >= 500) { await sleep(20000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`${brand} p${page} → ${r.status}`);
    const j = await r.json();
    fs.writeFileSync(cacheFile, JSON.stringify(j));
    await sleep(6500);
    return j;
  }
  return { products: [] };
}

const foods = [];
const seen = new Set();
let skippedMeat = 0, skippedNoData = 0;
for (const [i, brand] of BRANDS.entries()) {
  for (let page = 1; page <= pagesFor(brand); page++) {
    let j;
    try { j = await fetchPage(brand, page); } catch (e) { console.error(`  ! ${e.message}`); break; }
    const products = j.products ?? [];
    let kept = 0;
    for (const p of products) {
      const tags = p.ingredients_analysis_tags ?? [];
      if (tags.includes("en:non-vegetarian")) { skippedMeat++; continue; }
      if ((p.unique_scans_n ?? 0) < 2 && page > 1) continue;
      const f = offToFood(p);
      if (!f || f.per100.kcal === undefined || seen.has(f.id)) { if (!f || f.per100.kcal === undefined) skippedNoData++; continue; }
      seen.add(f.id);
      const per100 = {};
      for (const [k, v] of Object.entries(f.per100)) if (typeof v === "number" && Number.isFinite(v)) per100[k] = Math.round(v * 100) / 100;
      foods.push({ c: f.barcode, n: f.name, b: f.brand ?? "", p: per100, s: f.servings.filter((s) => !/^100 g$/.test(s.label)).slice(0, 3).map((s) => [s.label, Math.round(s.grams)]), l: f.isLiquid ? 1 : 0, v: tags.includes("en:vegan") ? 2 : tags.includes("en:vegetarian") ? 1 : 0, u: p.unique_scans_n ?? 0 });
      kept++;
    }
    process.stdout.write(`  [${i + 1}/${BRANDS.length}] ${brand} p${page}: ${kept} kept (total ${foods.length})\n`);
    if (products.length < PAGE_SIZE) break;
  }
}
foods.sort((a, b) => b.u - a.u);
const pack = { app: "cronofree", type: "branded-pack", version: Date.now(), generatedAt: new Date().toISOString(), count: foods.length, foods };
fs.writeFileSync(OUT, JSON.stringify(pack));
fs.writeFileSync(OUT + ".gz", zlib.gzipSync(fs.readFileSync(OUT), { level: 9 }));
console.log(`\n  wrote ${path.relative(ROOT, OUT)} · ${foods.length} products · ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB (${(fs.statSync(OUT + ".gz").size / 1e6).toFixed(1)} MB gz) · skipped ${skippedMeat} non-vegetarian, ${skippedNoData} without nutrition\n`);
