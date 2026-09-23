/**
 * Online food sources. Both are free:
 *  - Open Food Facts: barcode lookup + text search, no key needed.
 *  - USDA FoodData Central: whole foods with full micronutrients. Works with
 *    DEMO_KEY (rate-limited); the user can paste a free key in Settings.
 * Results are normalised to per-100 g Food rows and cached locally on use.
 */
import type { Food, Serving } from "@/db/types";
import type { Nutrients, NutrientKey } from "./nutrients.ts";
import { macroKcal } from "./nutrients.ts";

export interface SourceSettings {
  usdaApiKey?: string;
  offEnabled?: boolean;
  usdaEnabled?: boolean;
  nutritionixAppId?: string;
  nutritionixAppKey?: string;
  nutritionixEnabled?: boolean;
}

const OFF_BASE = "https://world.openfoodfacts.org";
const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
const UA = "Cronofree/1.0 (personal food log)";

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function lower(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/* ───────────────────────────── Open Food Facts ───────────────────────────── */
type OffProduct = Record<string, unknown> & { nutriments?: Record<string, unknown> };

const OFF_MAP: [NutrientKey, string, number][] = [
  ["kcal", "energy-kcal_100g", 1],
  ["protein", "proteins_100g", 1],
  ["carbs", "carbohydrates_100g", 1],
  ["fat", "fat_100g", 1],
  ["fiber", "fiber_100g", 1],
  ["sugar", "sugars_100g", 1],
  ["addedSugar", "added-sugars_100g", 1],
  ["satFat", "saturated-fat_100g", 1],
  ["monoFat", "monounsaturated-fat_100g", 1],
  ["polyFat", "polyunsaturated-fat_100g", 1],
  ["transFat", "trans-fat_100g", 1],
  ["omega3", "omega-3-fat_100g", 1],
  ["cholesterol", "cholesterol_100g", 1000],
  ["sodium", "sodium_100g", 1000],
  ["potassium", "potassium_100g", 1000],
  ["calcium", "calcium_100g", 1000],
  ["iron", "iron_100g", 1000],
  ["magnesium", "magnesium_100g", 1000],
  ["phosphorus", "phosphorus_100g", 1000],
  ["zinc", "zinc_100g", 1000],
  ["selenium", "selenium_100g", 1_000_000],
  ["vitA", "vitamin-a_100g", 1_000_000],
  ["vitC", "vitamin-c_100g", 1000],
  ["vitD", "vitamin-d_100g", 1_000_000],
  ["vitE", "vitamin-e_100g", 1000],
  ["vitK", "vitamin-k_100g", 1_000_000],
  ["thiamin", "vitamin-b1_100g", 1000],
  ["riboflavin", "vitamin-b2_100g", 1000],
  ["niacin", "vitamin-pp_100g", 1000],
  ["vitB6", "vitamin-b6_100g", 1000],
  ["folate", "folates_100g", 1_000_000],
  ["vitB12", "vitamin-b12_100g", 1_000_000],
  ["caffeine", "caffeine_100g", 1000],
  ["alcohol", "alcohol_100g", 1],
  ["copper", "copper_100g", 1000],
  ["manganese", "manganese_100g", 1000],
  ["pantothenicAcid", "pantothenic-acid_100g", 1000],
  ["omega6", "omega-6-fat_100g", 1],
  ["starch", "starch_100g", 1],
];

function offNutrients(n: Record<string, unknown> = {}): Nutrients {
  const out: Nutrients = {};
  for (const [key, field, mult] of OFF_MAP) {
    const v = num(n[field]);
    if (v !== undefined) out[key] = v * mult;
  }
  if (out.kcal === undefined) {
    const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
    if (kj !== undefined) out.kcal = kj / 4.184;
    else if (out.protein !== undefined || out.carbs !== undefined || out.fat !== undefined) out.kcal = macroKcal(out);
  }
  // OFF's "sodium" is sometimes missing but salt is present (salt g → sodium mg)
  if (out.sodium === undefined) {
    const salt = num(n["salt_100g"]);
    if (salt !== undefined) out.sodium = salt * 400;
  }
  return out;
}

function offServings(p: OffProduct, id: string): Serving[] {
  const out: Serving[] = [];
  const sq = num(p.serving_quantity);
  const unit = String(p.serving_quantity_unit ?? "g");
  const label = typeof p.serving_size === "string" ? p.serving_size.trim() : "";
  if (sq && sq > 0 && (unit === "g" || unit === "ml")) {
    // OFF serving_size is free text like "1 slice (43 g)" or "28 g" — reuse it when it already names a household unit
    const clean = label.replace(/\s+/g, " ");
    const pretty = /^\d+(\.\d+)?\s*(g|ml|oz)\b/i.test(clean) || !clean ? `1 serving${clean ? ` (${clean})` : ""}` : /^\d/.test(clean) ? clean : `1 ${clean}`;
    out.push({ id: `${id}_serving`, label: pretty.replace(/\b(\d+) serving \(1 serving/i, "$1 serving ("), grams: sq });
  }
  const pq = num(p.product_quantity);
  if (pq && pq > 0 && pq < 5000 && (!sq || Math.abs(pq - sq) > 1)) out.push({ id: `${id}_pack`, label: `Whole package (${Math.round(pq)} ${String(p.product_quantity_unit ?? "g")})`, grams: pq });
  out.push({ id: `${id}_g100`, label: "100 g", grams: 100 });
  return out;
}

export function offToFood(p: OffProduct): Food | null {
  const code = String(p.code ?? p._id ?? "");
  const name = String(p.product_name_en || p.product_name || p.generic_name || "").trim();
  if (!name) return null;
  const per100 = offNutrients(p.nutriments);
  if (per100.kcal === undefined && per100.protein === undefined) return null;
  const id = `off_${code}`;
  const brand = typeof p.brands === "string" ? p.brands.split(",")[0].trim() : undefined;
  const isLiquid = /\b(ml|l)\b/i.test(String(p.quantity ?? "")) || String(p.serving_quantity_unit ?? "") === "ml";
  return {
    id,
    name,
    brand: brand || undefined,
    source: "off",
    sourceId: code,
    barcode: code,
    per100,
    servings: offServings(p, id),
    isLiquid,
    category: typeof p.categories === "string" ? p.categories.split(",").pop()?.trim() : undefined,
    verified: false,
    search: lower(`${name} ${brand ?? ""}`),
    updatedAt: 0,
    useCount: 0,
  };
}

const OFF_FIELDS = "code,product_name,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,nutriments,categories";

export async function offLookupBarcode(code: string, signal?: AbortSignal): Promise<Food | null> {
  const r = await fetch(`${OFF_BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, { signal, headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const j = (await r.json()) as { status?: number; product?: OffProduct };
  if (!j.product) return null;
  return offToFood({ ...j.product, code });
}

export async function offSearch(query: string, signal?: AbortSignal, pageSize = 25): Promise<Food[]> {
  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${OFF_FIELDS}&sort_by=unique_scans_n`;
  const r = await fetch(url, { signal, headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Open Food Facts ${r.status}`);
  const j = (await r.json()) as { products?: OffProduct[] };
  return (j.products ?? []).map(offToFood).filter((f): f is Food => !!f);
}

/* ───────────────────────────── USDA FoodData Central ───────────────────────────── */
// nutrient number → key (per 100 g, units already match ours except IU→µg for vit D)
const USDA_MAP: Record<string, [NutrientKey, number]> = {
  "208": ["kcal", 1], "957": ["kcal", 1], "958": ["kcal", 1],
  "203": ["protein", 1], "205": ["carbs", 1], "204": ["fat", 1], "291": ["fiber", 1],
  "269": ["sugar", 1], "539": ["addedSugar", 1], "606": ["satFat", 1], "645": ["monoFat", 1], "646": ["polyFat", 1],
  "605": ["transFat", 1], "601": ["cholesterol", 1], "307": ["sodium", 1], "306": ["potassium", 1],
  "301": ["calcium", 1], "303": ["iron", 1], "304": ["magnesium", 1], "305": ["phosphorus", 1], "309": ["zinc", 1],
  "317": ["selenium", 1], "320": ["vitA", 1], "401": ["vitC", 1], "328": ["vitD", 1], "323": ["vitE", 1],
  "430": ["vitK", 1], "404": ["thiamin", 1], "405": ["riboflavin", 1], "406": ["niacin", 1], "415": ["vitB6", 1],
  "417": ["folate", 1], "435": ["folate", 1], "418": ["vitB12", 1], "421": ["choline", 1], "262": ["caffeine", 1],
  "221": ["alcohol", 1], "255": ["water", 1], "851": ["omega3", 1],
  "312": ["copper", 1], "315": ["manganese", 1], "410": ["pantothenicAcid", 1], "209": ["starch", 1],
  "501": ["tryptophan", 1], "502": ["threonine", 1], "503": ["isoleucine", 1], "504": ["leucine", 1], "505": ["lysine", 1],
  "506": ["methionine", 1], "507": ["cystine", 1], "508": ["phenylalanine", 1], "509": ["tyrosine", 1], "510": ["valine", 1],
  "511": ["arginine", 1], "512": ["histidine", 1], "513": ["alanine", 1], "514": ["asparticAcid", 1], "515": ["glutamicAcid", 1],
  "516": ["glycine", 1], "517": ["proline", 1], "518": ["serine", 1],
};

interface UsdaNutrient { nutrientNumber?: string; nutrientId?: number; number?: string; value?: number; amount?: number; unitName?: string; nutrient?: { number?: string; unitName?: string } }
interface UsdaPortion { gramWeight?: number; portionDescription?: string; modifier?: string; measureUnit?: { name?: string }; amount?: number }
interface UsdaFood {
  fdcId: number; description: string; brandOwner?: string; brandName?: string; dataType?: string;
  foodNutrients?: UsdaNutrient[]; foodPortions?: UsdaPortion[]; servingSize?: number; servingSizeUnit?: string; householdServingFullText?: string; foodCategory?: string | { description?: string };
}

export function usdaNutrients(list: UsdaNutrient[] = []): Nutrients {
  const out: Nutrients = {};
  let omega3 = 0;
  let omega6 = 0;
  for (const n of list) {
    const number = String(n.nutrientNumber ?? n.number ?? n.nutrient?.number ?? "");
    const value = num(n.value ?? n.amount);
    if (value === undefined) continue;
    const unit = String(n.unitName ?? n.nutrient?.unitName ?? "").toUpperCase();
    // omega-3 components (ALA 851, EPA 629, DPA 631, DHA 621)
    if (["629", "631", "621"].includes(number)) { omega3 += value; continue; }
    if (["618", "620"].includes(number)) { omega6 += value; continue; }
    const m = USDA_MAP[number];
    if (!m) continue;
    const [key] = m;
    if (key === "kcal" && out.kcal !== undefined && number !== "208") continue;
    if (key === "kcal" && unit === "KJ") continue;
    if (key === "folate" && out.folate !== undefined && number === "435") continue; // prefer 417
    if (key === "vitD" && unit === "IU") { out.vitD = value / 40; continue; }
    out[key] = value;
  }
  if (omega3 > 0) out.omega3 = (out.omega3 ?? 0) + omega3;
  if (omega6 > 0) out.omega6 = omega6;
  if (out.kcal === undefined && (out.protein !== undefined || out.carbs !== undefined)) out.kcal = macroKcal(out);
  return out;
}

function usdaServings(f: UsdaFood, id: string): Serving[] {
  const out: Serving[] = [];
  const seen = new Set<number>();
  for (const [i, p] of (f.foodPortions ?? []).entries()) {
    const g = num(p.gramWeight);
    if (!g || g <= 0 || seen.has(Math.round(g * 10))) continue;
    seen.add(Math.round(g * 10));
    const desc = p.portionDescription || [p.amount, p.measureUnit?.name, p.modifier].filter((x) => x && x !== "undetermined").join(" ");
    if (!desc || /quantity not specified/i.test(desc)) continue;
    out.push({ id: `${id}_p${i}`, label: desc.trim(), grams: g });
    if (out.length >= 8) break;
  }
  const ss = num(f.servingSize);
  if (ss && ss > 0 && (f.servingSizeUnit ?? "g").toLowerCase().startsWith("g") || (f.servingSizeUnit ?? "").toLowerCase().startsWith("ml")) {
    if (ss && !seen.has(Math.round(ss * 10))) out.unshift({ id: `${id}_serving`, label: f.householdServingFullText ? `1 serving (${f.householdServingFullText})` : "1 serving", grams: ss });
  }
  out.push({ id: `${id}_g100`, label: "100 g", grams: 100 });
  return out;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s,(/-])([a-z])/g, (m) => m.toUpperCase());
}

export function usdaToFood(f: UsdaFood): Food | null {
  const per100 = usdaNutrients(f.foodNutrients);
  if (per100.kcal === undefined && per100.protein === undefined) return null;
  const id = `usda_${f.fdcId}`;
  const branded = f.dataType === "Branded";
  const name = branded ? titleCase(f.description) : f.description.replace(/,\s*(raw|cooked|nfs)$/i, (m) => m);
  const brand = f.brandOwner || f.brandName || undefined;
  const cat = typeof f.foodCategory === "string" ? f.foodCategory : f.foodCategory?.description;
  return {
    id,
    name,
    brand,
    source: "usda",
    sourceId: String(f.fdcId),
    per100,
    servings: usdaServings(f, id),
    category: cat,
    verified: !branded,
    search: lower(`${name} ${brand ?? ""}`),
    updatedAt: 0,
    useCount: 0,
  };
}

export async function usdaSearch(query: string, apiKey: string | undefined, signal?: AbortSignal, pageSize = 25): Promise<Food[]> {
  const key = apiKey?.trim() || "DEMO_KEY";
  const r = await fetch(`${USDA_BASE}/foods/search?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, pageSize, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"], sortBy: "dataType.keyword", sortOrder: "asc" }),
  });
  if (r.status === 429) throw new Error("USDA rate limit reached. Add a free API key in Settings → Food sources.");
  if (!r.ok) throw new Error(`USDA ${r.status}`);
  const j = (await r.json()) as { foods?: UsdaFood[] };
  return (j.foods ?? []).map(usdaToFood).filter((f): f is Food => !!f);
}

/** Fetch full detail (portions + complete nutrient list) for a USDA food. */
export async function usdaDetail(fdcId: string, apiKey: string | undefined, signal?: AbortSignal): Promise<Food | null> {
  const key = apiKey?.trim() || "DEMO_KEY";
  const r = await fetch(`${USDA_BASE}/food/${fdcId}?api_key=${encodeURIComponent(key)}`, { signal });
  if (!r.ok) return null;
  const j = (await r.json()) as UsdaFood;
  return usdaToFood(j);
}

/* ───────────────────────────── Nutritionix (optional, needs free keys) ───────────────────────────── */
// full_nutrients uses USDA attr ids, so the USDA map applies.
interface NixFood { food_name: string; brand_name?: string; nix_item_id?: string; serving_qty?: number; serving_unit?: string; serving_weight_grams?: number; nf_calories?: number; full_nutrients?: { attr_id: number; value: number }[]; photo?: { thumb?: string } }

export function nutritionixToFood(f: NixFood, kind: "common" | "branded"): Food | null {
  const grams = f.serving_weight_grams && f.serving_weight_grams > 0 ? f.serving_weight_grams : 100;
  const perServing = usdaNutrients((f.full_nutrients ?? []).map((n) => ({ nutrientNumber: String(n.attr_id), value: n.value })));
  if (perServing.kcal === undefined && f.nf_calories !== undefined) perServing.kcal = f.nf_calories;
  if (perServing.kcal === undefined) return null;
  const factor = 100 / grams;
  const per100: Nutrients = {};
  for (const [k, v] of Object.entries(perServing)) if (typeof v === "number") per100[k as NutrientKey] = v * factor;
  const id = `nix_${kind}_${(f.nix_item_id ?? f.food_name).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const label = `${f.serving_qty ?? 1} ${f.serving_unit ?? "serving"}`.trim();
  const name = f.food_name.replace(/\b\w/g, (m) => m.toUpperCase());
  return {
    id, name, brand: f.brand_name || undefined, source: kind === "branded" ? "off" : "usda", sourceId: f.nix_item_id,
    per100, servings: [{ id: `${id}_s`, label, grams }, { id: `${id}_g100`, label: "100 g", grams: 100 }], defaultServingId: `${id}_s`,
    category: "Nutritionix", verified: false, search: lower(`${name} ${f.brand_name ?? ""}`), updatedAt: 0, useCount: 0,
    note: `From Nutritionix (${kind})`,
  };
}

const nixHeaders = (appId: string, appKey: string) => ({ "x-app-id": appId.trim(), "x-app-key": appKey.trim(), "Content-Type": "application/json", "x-remote-user-id": "0" });

export async function nutritionixSearch(query: string, appId: string, appKey: string, signal?: AbortSignal): Promise<Food[]> {
  const r = await fetch(`https://trackapi.nutritionix.com/v2/search/instant?query=${encodeURIComponent(query)}&detailed=true&common=true&branded=true`, { signal, headers: nixHeaders(appId, appKey) });
  if (r.status === 401) throw new Error("Nutritionix keys rejected");
  if (!r.ok) throw new Error(`Nutritionix ${r.status}`);
  const j = (await r.json()) as { common?: NixFood[]; branded?: NixFood[] };
  const out: Food[] = [];
  for (const f of (j.common ?? []).slice(0, 8)) { const x = nutritionixToFood(f, "common"); if (x) out.push(x); }
  for (const f of (j.branded ?? []).slice(0, 12)) { const x = nutritionixToFood(f, "branded"); if (x) out.push(x); }
  return out;
}

/** Natural-language: "2 eggs and a slice of toast with butter" → separate foods with amounts. */
export async function nutritionixNatural(text: string, appId: string, appKey: string): Promise<{ food: Food; grams: number; label: string }[]> {
  const r = await fetch("https://trackapi.nutritionix.com/v2/natural/nutrients", { method: "POST", headers: nixHeaders(appId, appKey), body: JSON.stringify({ query: text }) });
  if (r.status === 401) throw new Error("Nutritionix keys rejected");
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Nutritionix ${r.status}`);
  const j = (await r.json()) as { foods?: NixFood[] };
  return (j.foods ?? []).map((f) => { const food = nutritionixToFood(f, "common"); return food ? { food, grams: f.serving_weight_grams ?? 100, label: `${f.serving_qty ?? 1} ${f.serving_unit ?? "serving"}` } : null; }).filter((x): x is { food: Food; grams: number; label: string } => !!x);
}
