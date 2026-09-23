import { db, put, putMany, remove, kvGet } from "@/db";
import type { Food, DiaryEntry, Recipe, SavedMeal, Serving, ISODate } from "@/db/types";
import { scaleNutrients, sumNutrients, type Nutrients, macroKcal } from "./nutrients";
import { offSearch, usdaSearch, offLookupBarcode, nutritionixSearch, type SourceSettings } from "./foodSources";
import { uid } from "./id";
import { nowHHMM } from "./dates";
import { scheduleSync } from "./sync";

/* ───────────────────────────── Search ───────────────────────────── */
export interface SearchResult {
  local: Food[];
  online: Food[];
  errors: string[];
}

function tokens(q: string): string[] {
  return q.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
}

const MEAT_RE = /\b(chicken|beef|pork|bacon|ham|turkey|steak|carnitas|barbacoa|shrimp|prawn|fish|salmon|tuna|cod|crab|lobster|anchov|pepperoni|sausage|chorizo|lamb|duck|veal|gelatin|prosciutto|salami|meatball|pastrami|brisket|ribs?)\b/;
const DAIRY_EGG_RE = /\b(cheese|milk|butter|cream|yogurt|egg|whey|casein|ghee|paneer|honey)\b/;
export interface SearchOpts { diet?: "none" | "vegetarian" | "vegan" }

function scoreLocal(f: Food, toks: string[], q: string, opts: SearchOpts = {}): number {
  const s = f.search;
  let score = 0;
  if (opts.diet && opts.diet !== "none" && f.source !== "restaurant") {
    const name = f.name.toLowerCase();
    if (MEAT_RE.test(name) && !/\b(vegan|veggie|vegetarian|meatless|plant|tofu|impossible|beyond|mock)\b/.test(name)) score -= 35;
    else if (opts.diet === "vegan" && DAIRY_EGG_RE.test(name) && !/\b(vegan|plant|oat|almond|soy|coconut)\b/.test(name)) score -= 15;
  }
  if (s.startsWith(q)) score += 50;
  const name = f.name.toLowerCase();
  if (name === q) score += 100;
  for (const t of toks) {
    if (!s.includes(t)) return -1;
    if (name.split(/[\s,]+/).some((w) => w.startsWith(t))) score += 10;
  }
  score += Math.min(30, (f.useCount ?? 0) * 3);
  if (f.favorite) score += 25;
  if (f.source === "custom" || f.source === "recipe") score += 8;
  if (f.verified) score += 3;
  if (f.lastUsedAt) score += Math.max(0, 10 - (Date.now() - f.lastUsedAt) / 86_400_000);
  score -= Math.min(10, name.length / 8);
  return score;
}

export async function searchLocal(query: string, limit = 40, opts: SearchOpts = {}): Promise<Food[]> {
  const q = query.trim().toLowerCase();
  const toks = tokens(q);
  if (!toks.length) return [];
  const all = await db.foods.filter((f) => !f.deletedAt && toks.every((t) => f.search.includes(t))).toArray();
  return all
    .map((f) => ({ f, s: scoreLocal(f, toks, q, opts) }))
    .filter((x) => x.s >= -30 || toks.some((t) => MEAT_RE.test(t)))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f);
}

export async function getSourceSettings(): Promise<SourceSettings> {
  return { offEnabled: true, usdaEnabled: true, ...(await kvGet<SourceSettings>("foodSources", {})) };
}

export async function searchOnline(query: string, signal?: AbortSignal): Promise<{ foods: Food[]; errors: string[] }> {
  const cfg = await getSourceSettings();
  const errors: string[] = [];
  const tasks: Promise<Food[]>[] = [];
  if (cfg.usdaEnabled !== false) tasks.push(usdaSearch(query, cfg.usdaApiKey, signal, 20).catch((e) => { errors.push(`USDA: ${(e as Error).message}`); return []; }));
  if (cfg.offEnabled !== false) tasks.push(offSearch(query, signal, 20).catch((e) => { errors.push(`Open Food Facts: ${(e as Error).message}`); return []; }));
  if (cfg.nutritionixEnabled !== false && cfg.nutritionixAppId && cfg.nutritionixAppKey) tasks.push(nutritionixSearch(query, cfg.nutritionixAppId, cfg.nutritionixAppKey, signal).catch((e) => { errors.push(`Nutritionix: ${(e as Error).message}`); return []; }));
  const results = await Promise.all(tasks);
  const seen = new Set<string>();
  const localIds = new Set((await db.foods.where("id").anyOf(results.flat().map((f) => f.id)).toArray()).map((f) => f.id));
  const foods: Food[] = [];
  // interleave: USDA whole foods first, then OFF branded
  for (const list of results) for (const f of list) {
    if (seen.has(f.id) || localIds.has(f.id)) continue;
    seen.add(f.id);
    foods.push(f);
  }
  return { foods, errors };
}

export async function lookupBarcode(code: string): Promise<Food | null> {
  const local = await db.foods.where("barcode").equals(code).filter((f) => !f.deletedAt).first();
  if (local) return local;
  return offLookupBarcode(code);
}

export async function recentFoods(limit = 30): Promise<Food[]> {
  return db.foods.orderBy("lastUsedAt").reverse().filter((f) => !f.deletedAt && !!f.lastUsedAt).limit(limit).toArray();
}
export async function frequentFoods(limit = 30): Promise<Food[]> {
  return db.foods.orderBy("useCount").reverse().filter((f) => !f.deletedAt && (f.useCount ?? 0) > 0).limit(limit).toArray();
}
export async function favoriteFoods(): Promise<Food[]> {
  return db.foods.filter((f) => !f.deletedAt && !!f.favorite).toArray();
}

/* ───────────────────────────── Servings ───────────────────────────── */
export function defaultServing(food: Food): Serving {
  return food.servings.find((s) => s.id === food.defaultServingId) ?? food.servings[0] ?? { id: "g100", label: "100 g", grams: 100 };
}

export function nutrientsFor(food: Food, grams: number): Nutrients {
  const n = scaleNutrients(food.per100, grams / 100);
  if (n.kcal === undefined) n.kcal = macroKcal(n);
  return n;
}

export function gramUnitLabel(food: Food): "g" | "mL" {
  return food.isLiquid ? "mL" : "g";
}

/* ───────────────────────────── Logging ───────────────────────────── */
export async function ensureFoodCached(food: Food): Promise<Food> {
  const existing = await db.foods.get(food.id);
  const merged: Food = existing
    ? { ...existing, useCount: (existing.useCount ?? 0) + 1, lastUsedAt: Date.now(), deletedAt: null }
    : { ...food, useCount: 1, lastUsedAt: Date.now() };
  return put("foods", merged);
}

export interface LogArgs {
  food: Food;
  grams: number;
  serving?: Serving;
  qty?: number;
  date: ISODate;
  mealId: string;
  time?: string;
  note?: string;
}

export async function logFood(a: LogArgs): Promise<DiaryEntry> {
  const food = await ensureFoodCached(a.food);
  const order = ((await db.entries.where("[date+mealId]").equals([a.date, a.mealId]).count()) || 0) + 1;
  const entry: DiaryEntry = {
    id: uid("e"),
    date: a.date,
    mealId: a.mealId,
    kind: "food",
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    grams: a.grams,
    servingLabel: a.serving?.label,
    servingQty: a.qty,
    nutrients: nutrientsFor(food, a.grams),
    time: a.time ?? nowHHMM(),
    note: a.note,
    order,
    updatedAt: 0,
  };
  await put("entries", entry);
  scheduleSync();
  return entry;
}

export async function logQuick(a: { date: ISODate; mealId: string; name: string; nutrients: Nutrients; kind?: "quick" | "exercise" }): Promise<DiaryEntry> {
  const entry: DiaryEntry = {
    id: uid("e"),
    date: a.date,
    mealId: a.mealId,
    kind: a.kind ?? "quick",
    name: a.name,
    grams: 0,
    nutrients: a.nutrients,
    time: nowHHMM(),
    order: Date.now(),
    updatedAt: 0,
  };
  await put("entries", entry);
  scheduleSync();
  return entry;
}

/** Log an item that has no library food behind it (AI or natural-language results). */
export async function logAdHoc(a: { date: ISODate; mealId: string; name: string; brand?: string; grams: number; servingLabel?: string; nutrients: Nutrients; note?: string }): Promise<DiaryEntry> {
  const entry: DiaryEntry = { id: uid("e"), date: a.date, mealId: a.mealId, kind: "food", name: a.name, brand: a.brand, grams: a.grams, servingLabel: a.servingLabel, servingQty: a.servingLabel ? 1 : undefined, nutrients: a.nutrients, note: a.note, time: nowHHMM(), order: Date.now(), updatedAt: 0 };
  await put("entries", entry);
  scheduleSync();
  return entry;
}

export async function updateEntry(e: DiaryEntry, patch: Partial<DiaryEntry>): Promise<void> {
  const next = { ...e, ...patch };
  if (next.kind === "food" && next.foodId && (patch.grams !== undefined)) {
    const food = await db.foods.get(next.foodId);
    if (food) next.nutrients = nutrientsFor(food, next.grams);
    else next.nutrients = scaleNutrients(e.nutrients, e.grams > 0 ? next.grams / e.grams : 1);
  }
  await put("entries", next);
  scheduleSync();
}

export async function deleteEntry(id: string): Promise<void> {
  await remove("entries", id);
  scheduleSync();
}

export async function copyEntries(entries: DiaryEntry[], toDate: ISODate, toMealId?: string): Promise<number> {
  const copies = entries.map((e, i) => ({ ...e, id: uid("e"), date: toDate, mealId: toMealId ?? e.mealId, order: Date.now() + i, deletedAt: null }));
  if (copies.length) await putMany("entries", copies);
  scheduleSync();
  return copies.length;
}

export function dayTotals(entries: DiaryEntry[]): Nutrients {
  return sumNutrients(entries.filter((e) => !e.deletedAt && e.kind !== "exercise").map((e) => e.nutrients));
}

export function exerciseKcal(entries: DiaryEntry[]): number {
  return entries.filter((e) => !e.deletedAt && e.kind === "exercise").reduce((a, e) => a + (e.nutrients.kcal ?? 0), 0);
}

/* ───────────────────────────── Custom foods ───────────────────────────── */
export interface CustomFoodInput {
  id?: string;
  name: string;
  brand?: string;
  barcode?: string;
  servingLabel: string;
  servingGrams: number;
  /** nutrients per serving as typed from the label */
  perServing: Nutrients;
  extraServings?: { label: string; grams: number }[];
  isLiquid?: boolean;
  note?: string;
  basis?: "published" | "estimated";
}

export async function saveCustomFood(input: CustomFoodInput): Promise<Food> {
  const id = input.id ?? uid("food");
  const factor = 100 / Math.max(0.01, input.servingGrams);
  const per100 = scaleNutrients(input.perServing, factor);
  if (per100.kcal === undefined) per100.kcal = macroKcal(per100);
  const existing = input.id ? await db.foods.get(input.id) : undefined;
  const servings: Serving[] = [
    { id: `${id}_s0`, label: input.servingLabel || "1 serving", grams: input.servingGrams },
    ...(input.extraServings ?? []).filter((s) => s.label && s.grams > 0).map((s, i) => ({ id: `${id}_s${i + 1}`, label: s.label, grams: s.grams })),
    { id: `${id}_g100`, label: input.isLiquid ? "100 mL" : "100 g", grams: 100 },
  ];
  const food: Food = {
    ...(existing ?? { updatedAt: 0, useCount: 0 }),
    id,
    name: input.name.trim(),
    brand: input.brand?.trim() || undefined,
    barcode: input.barcode?.trim() || undefined,
    source: existing?.source === "recipe" ? "recipe" : "custom",
    per100,
    servings,
    defaultServingId: servings[0].id,
    isLiquid: !!input.isLiquid,
    note: input.note ?? existing?.note,
    basis: input.basis ?? existing?.basis,
    search: `${input.name} ${input.brand ?? ""}`.toLowerCase(),
    deletedAt: null,
  };
  await put("foods", food);
  scheduleSync();
  return food;
}

export async function toggleFavorite(food: Food): Promise<void> {
  const existing = (await db.foods.get(food.id)) ?? food;
  await put("foods", { ...existing, favorite: !existing.favorite, deletedAt: null });
  scheduleSync();
}

export async function deleteFood(id: string): Promise<void> {
  await remove("foods", id);
  scheduleSync();
}

/* ───────────────────────────── Recipes ───────────────────────────── */
export function recipeTotals(r: Pick<Recipe, "ingredients">): Nutrients {
  return sumNutrients(r.ingredients.map((i) => scaleNutrients(i.per100, i.grams / 100)));
}

export function recipeTotalGrams(r: Pick<Recipe, "ingredients" | "yieldGrams">): number {
  return r.yieldGrams && r.yieldGrams > 0 ? r.yieldGrams : r.ingredients.reduce((a, i) => a + i.grams, 0);
}

/** Save a recipe and (re)materialise its Food row so it can be logged like any food. */
export async function saveRecipe(input: Omit<Recipe, "updatedAt" | "foodId" | "id"> & { id?: string; foodId?: string }): Promise<Recipe> {
  const id = input.id ?? uid("rcp");
  const foodId = input.foodId ?? `food_${id}`;
  const totals = recipeTotals(input);
  const grams = Math.max(1, recipeTotalGrams(input));
  const per100 = scaleNutrients(totals, 100 / grams);
  const servings = Math.max(1, input.yieldServings || 1);
  const perServingGrams = grams / servings;
  const existingFood = await db.foods.get(foodId);
  const food: Food = {
    ...(existingFood ?? { updatedAt: 0, useCount: 0 }),
    id: foodId,
    name: input.name.trim(),
    source: "recipe",
    recipeId: id,
    per100,
    servings: [
      { id: `${foodId}_serving`, label: `1 serving (1/${servings} recipe)`, grams: Math.round(perServingGrams * 10) / 10 },
      { id: `${foodId}_whole`, label: "Whole recipe", grams: grams },
      { id: `${foodId}_g100`, label: "100 g", grams: 100 },
    ],
    defaultServingId: `${foodId}_serving`,
    search: `${input.name} recipe`.toLowerCase(),
    deletedAt: null,
  };
  const recipe: Recipe = { ...input, id, foodId, updatedAt: 0, deletedAt: null };
  await put("foods", food);
  await put("recipes", recipe);
  scheduleSync();
  return recipe;
}

export async function deleteRecipe(r: Recipe): Promise<void> {
  await remove("recipes", r.id);
  await remove("foods", r.foodId);
  scheduleSync();
}

/* ───────────────────────────── Saved meals ───────────────────────────── */
export async function saveMealFromEntries(name: string, entries: DiaryEntry[]): Promise<SavedMeal> {
  const meal: SavedMeal = {
    id: uid("meal"),
    name: name.trim(),
    items: entries.map((e) => ({ foodId: e.foodId, name: e.name, grams: e.grams, servingLabel: e.servingLabel, servingQty: e.servingQty, nutrients: e.nutrients })),
    useCount: 0,
    updatedAt: 0,
  };
  await put("savedMeals", meal);
  scheduleSync();
  return meal;
}

export async function logSavedMeal(meal: SavedMeal, date: ISODate, mealId: string): Promise<number> {
  const entries: DiaryEntry[] = meal.items.map((it, i) => ({
    id: uid("e"), date, mealId, kind: "food", foodId: it.foodId, name: it.name, grams: it.grams, servingLabel: it.servingLabel, servingQty: it.servingQty,
    nutrients: it.nutrients, time: nowHHMM(), order: Date.now() + i, updatedAt: 0,
  }));
  await putMany("entries", entries);
  await put("savedMeals", { ...meal, useCount: (meal.useCount ?? 0) + 1 });
  scheduleSync();
  return entries.length;
}

export async function deleteSavedMeal(id: string): Promise<void> {
  await remove("savedMeals", id);
  scheduleSync();
}

export const mealTotals = (items: { nutrients: Nutrients }[]): Nutrients => sumNutrients(items.map((i) => i.nutrients));
