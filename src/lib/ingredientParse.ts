/** Ingredient line parsing and unit → gram conversion. Pure, no database imports. */
import type { Food } from "@/db/types";

export interface ParsedIngredient { raw: string; qty: number; unit: string; name: string }

const UNICODE_FRAC: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
const UNITS: Record<string, { grams?: number; ml?: number; aliases: string[] }> = {
  g: { grams: 1, aliases: ["g", "gram", "grams", "gr"] }, kg: { grams: 1000, aliases: ["kg", "kilogram", "kilograms"] },
  oz: { grams: 28.35, aliases: ["oz", "ounce", "ounces"] }, lb: { grams: 453.6, aliases: ["lb", "lbs", "pound", "pounds"] },
  ml: { ml: 1, aliases: ["ml", "milliliter", "millilitre", "milliliters", "millilitres"] }, l: { ml: 1000, aliases: ["l", "liter", "litre", "liters", "litres"] },
  tsp: { ml: 4.93, aliases: ["tsp", "teaspoon", "teaspoons", "t"] }, tbsp: { ml: 14.79, aliases: ["tbsp", "tablespoon", "tablespoons", "tbs", "tb"] },
  cup: { ml: 236.6, aliases: ["cup", "cups", "c"] }, floz: { ml: 29.57, aliases: ["fl oz", "fluid ounce", "fluid ounces"] }, pint: { ml: 473, aliases: ["pint", "pints", "pt"] }, quart: { ml: 946, aliases: ["quart", "quarts", "qt"] },
  clove: { grams: 3, aliases: ["clove", "cloves"] }, slice: { grams: 28, aliases: ["slice", "slices"] }, can: { grams: 400, aliases: ["can", "cans", "tin", "tins"] }, stick: { grams: 113, aliases: ["stick", "sticks"] },
  pinch: { grams: 0.3, aliases: ["pinch", "pinches", "dash"] }, bunch: { grams: 100, aliases: ["bunch", "bunches"] }, handful: { grams: 30, aliases: ["handful", "handfuls"] },
  piece: { aliases: ["piece", "pieces", "whole", "large", "medium", "small", "pc", "pcs", "each"] },
};
const UNIT_LOOKUP = new Map<string, string>();
for (const [k, v] of Object.entries(UNITS)) for (const a of v.aliases) UNIT_LOOKUP.set(a, k);

function parseQty(s: string): [number, string] {
  let rest = s.trim();
  let qty = 0, found = false;
  const m = rest.match(/^(\d+)?\s*([½⅓⅔¼¾⅛⅜⅝⅞])/);
  if (m) { qty = (m[1] ? Number(m[1]) : 0) + UNICODE_FRAC[m[2]]; rest = rest.slice(m[0].length); found = true; }
  else {
    const m2 = rest.match(/^(\d+)\s+(\d+)\/(\d+)/) ?? rest.match(/^(\d+)\/(\d+)/) ?? rest.match(/^(\d+(?:[.,]\d+)?)/);
    if (m2) {
      if (m2.length === 4) qty = Number(m2[1]) + Number(m2[2]) / Number(m2[3]);
      else if (m2.length === 3) qty = Number(m2[1]) / Number(m2[2]);
      else qty = Number(m2[1].replace(",", "."));
      rest = rest.slice(m2[0].length); found = true;
    }
  }
  // ranges "1-2" / "1 to 2" → upper-ish average
  const r = rest.match(/^\s*(?:-|–|to)\s*(\d+(?:[.,]\d+)?)/);
  if (found && r) { qty = (qty + Number(r[1].replace(",", "."))) / 2; rest = rest.slice(r[0].length); }
  return [found ? qty : 1, rest.trim()];
}

export function parseIngredient(raw: string): ParsedIngredient {
  let line = raw.replace(/\s+/g, " ").replace(/^[-•*]\s*/, "").trim();
  // "(200 g)" metric hints take priority
  const metric = line.match(/\((\d+(?:[.,]\d+)?)\s*(g|grams?|ml|kg|oz)\)/i);
  const [qty0, rest0] = parseQty(line);
  let qty = qty0, rest = rest0;
  let unit = "";
  const um = rest.match(/^(fl oz|fluid ounces?|[a-zA-Z]+)\.?\s+/);
  if (um && UNIT_LOOKUP.has(um[1].toLowerCase())) { unit = UNIT_LOOKUP.get(um[1].toLowerCase())!; rest = rest.slice(um[0].length); }
  if (metric) { qty = Number(metric[1].replace(",", ".")); unit = UNIT_LOOKUP.get(metric[2].toLowerCase().replace(/s$/, "")) ?? "g"; }
  let name = rest.replace(/\(.*?\)/g, "").replace(/,.*$/, "").replace(/\b(of|fresh|finely|roughly|chopped|diced|minced|sliced|grated|peeled|optional|to taste|large|medium|small|about|approx\.?)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!name) name = rest.trim() || raw;
  return { raw, qty, unit, name };
}

/** grams for a parsed line given the food it matched */
export function gramsFor(ing: ParsedIngredient, food: Food | null): number {
  const u = UNITS[ing.unit];
  if (u?.grams) return Math.round(ing.qty * u.grams);
  if (u?.ml) return Math.round(ing.qty * u.ml * (food?.isLiquid || !food ? 1 : 0.9)); // dry goods in cups weigh less than water
  if (food) {
    const serv = food.servings.find((s) => ing.unit && s.label.toLowerCase().includes(ing.unit)) ?? food.servings.find((s) => /medium|large|small|piece|each|whole|slice|clove/i.test(s.label)) ?? (food.servings.find((s) => s.id === food.defaultServingId) ?? food.servings[0] ?? { id: "g", label: "100 g", grams: 100 });
    return Math.round(ing.qty * serv.grams);
  }
  return Math.round(ing.qty * 100);
}

