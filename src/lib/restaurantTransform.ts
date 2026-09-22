/** Pure transform from the restaurant pack format to Food rows (no DB imports; unit-tested). */
import type { Food } from "@/db/types";
import type { Nutrients } from "./nutrients.ts";

export interface PackItem { name: string; description?: string; serving: string; grams: number; vegan?: boolean; basis: "published" | "estimated"; kcal: number; protein: number; carbs: number; fat: number; fiber?: number; sugar?: number; satFat?: number; sodium?: number; note?: string }
export interface PackRestaurant { name: string; city: string; area?: string; cuisine?: string; website?: string; nutritionSource?: string; items: PackItem[] }
export interface RestaurantPack { version: number; generatedAt?: string; restaurants: PackRestaurant[] }

export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function restaurantFoods(pack: RestaurantPack): Food[] {
  const out: Food[] = [];
  const seen = new Set<string>();
  for (const r of pack.restaurants) {
    for (const it of r.items) {
      const grams = it.grams > 0 ? it.grams : 100;
      const id = `rest_${slug(r.name)}_${slug(it.name)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const f = 100 / grams;
      const per100: Nutrients = { kcal: it.kcal * f, protein: it.protein * f, carbs: it.carbs * f, fat: it.fat * f };
      if (it.fiber !== undefined) per100.fiber = it.fiber * f;
      if (it.sugar !== undefined) per100.sugar = it.sugar * f;
      if (it.satFat !== undefined) per100.satFat = it.satFat * f;
      if (it.sodium !== undefined) per100.sodium = it.sodium * f;
      const noteParts = [it.description, it.note, `${it.basis === "published" ? "Nutrition published by the restaurant" : "Estimated from the menu"}${r.nutritionSource ? ` · ${r.nutritionSource}` : ""}`, r.area ? `${r.name} · ${r.area}` : r.name].filter(Boolean);
      out.push({
        id,
        name: it.name,
        brand: r.name,
        source: "restaurant",
        per100,
        servings: [{ id: `${id}_s`, label: it.serving || "1 order", grams }, { id: `${id}_g100`, label: "100 g", grams: 100 }],
        defaultServingId: `${id}_s`,
        category: `Eat out · ${r.city}`,
        verified: it.basis === "published",
        basis: it.basis,
        vegan: !!it.vegan,
        note: noteParts.join("\n"),
        search: `${it.name} ${r.name} ${r.city} ${r.cuisine ?? ""} vegetarian${it.vegan ? " vegan" : ""}`.toLowerCase(),
        updatedAt: 1,
        useCount: 0,
      });
    }
  }
  return out;
}

/** Validation used by the build script: returns human-readable problems. */
export function validatePack(pack: RestaurantPack): string[] {
  const problems: string[] = [];
  const MEAT = /\b(chicken|beef|pork|bacon|ham|turkey|steak|carnitas|barbacoa|al pastor|shrimp|prawn|fish|salmon|tuna|crab|lobster|anchov|pepperoni|sausage|chorizo|lamb|duck|gelatin|prosciutto|salami)\b/i;
  for (const r of pack.restaurants) {
    if (!r.name || !r.city) problems.push(`restaurant missing name/city: ${JSON.stringify(r).slice(0, 80)}`);
    for (const it of r.items ?? []) {
      const where = `${r.name} → ${it.name}`;
      for (const k of ["kcal", "protein", "carbs", "fat", "grams"] as const) if (typeof it[k] !== "number" || !Number.isFinite(it[k])) problems.push(`${where}: ${k} must be a number`);
      if (it.basis !== "published" && it.basis !== "estimated") problems.push(`${where}: basis must be published|estimated`);
      if (MEAT.test(`${it.name} ${it.description ?? ""}`) && !/\b(no |without |veggie|vegan|plant|impossible|beyond|tofu|mock|meatless|vegetarian)\b/i.test(`${it.name} ${it.description ?? ""}`)) problems.push(`${where}: looks non-vegetarian`);
      if (it.kcal > 0 && Math.abs((it.protein * 4 + it.carbs * 4 + it.fat * 9) - it.kcal) > Math.max(120, it.kcal * 0.35)) problems.push(`${where}: macros (${it.protein * 4 + it.carbs * 4 + it.fat * 9} kcal) disagree with kcal ${it.kcal}`);
    }
  }
  return problems;
}
