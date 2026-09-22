/** Pure CSV + header-detection helpers shared by the importers (no database imports, unit-testable in Node). */
import type { NutrientKey } from "./nutrients.ts";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export const num = (s: string | undefined): number | undefined => { if (s === undefined) return undefined; const n = parseFloat(String(s).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : undefined; };

/** Header text → nutrient key. Handles both apps' spellings and unit suffixes. */
const HEADER_MAP: [RegExp, NutrientKey][] = [
  [/^(energy|calories)\b/i, "kcal"], [/^protein/i, "protein"], [/^(carbs|carbohydrates)\b(?!.*net)/i, "carbs"], [/^(fat|total fat)\b/i, "fat"],
  [/^fiber|^fibre/i, "fiber"], [/^(sugars?)\b(?!.*added)/i, "sugar"], [/added sugar/i, "addedSugar"], [/^starch/i, "starch"],
  [/^saturated/i, "satFat"], [/^monounsaturated/i, "monoFat"], [/^polyunsaturated/i, "polyFat"], [/^trans/i, "transFat"], [/omega.?3/i, "omega3"], [/omega.?6/i, "omega6"], [/^cholesterol/i, "cholesterol"],
  [/^sodium/i, "sodium"], [/^potassium/i, "potassium"], [/^calcium/i, "calcium"], [/^iron/i, "iron"], [/^magnesium/i, "magnesium"], [/^phosphorus/i, "phosphorus"], [/^zinc/i, "zinc"], [/^selenium/i, "selenium"], [/^copper/i, "copper"], [/^manganese/i, "manganese"],
  [/^vitamin a\b/i, "vitA"], [/^vitamin c\b/i, "vitC"], [/^vitamin d\b/i, "vitD"], [/^vitamin e\b/i, "vitE"], [/^vitamin k\b/i, "vitK"], [/^b1\b|thiamin/i, "thiamin"], [/^b2\b|riboflavin/i, "riboflavin"], [/^b3\b|niacin/i, "niacin"], [/^b5\b|pantothenic/i, "pantothenicAcid"], [/^b6\b|vitamin b6/i, "vitB6"], [/^b12\b|vitamin b12/i, "vitB12"], [/^folate/i, "folate"], [/^choline/i, "choline"],
  [/^caffeine/i, "caffeine"], [/^alcohol/i, "alcohol"], [/^water/i, "water"],
  [/^histidine/i, "histidine"], [/^isoleucine/i, "isoleucine"], [/^leucine/i, "leucine"], [/^lysine/i, "lysine"], [/^methionine/i, "methionine"], [/^cystine/i, "cystine"], [/^phenylalanine/i, "phenylalanine"], [/^tyrosine/i, "tyrosine"], [/^threonine/i, "threonine"], [/^tryptophan/i, "tryptophan"], [/^valine/i, "valine"],
];

export function headerKey(h: string): NutrientKey | null {
  const clean = h.trim();
  // MFP exports vitamins A/C, calcium, iron as % daily value — skip those
  if (/\(%\)|% ?dv/i.test(clean)) return null;
  for (const [re, k] of HEADER_MAP) if (re.test(clean)) return k;
  return null;
}

export function unitFactor(h: string, key: NutrientKey): number {
  const u = (h.match(/\(([^)]+)\)/)?.[1] ?? "").toLowerCase();
  const mgKeys: NutrientKey[] = ["cholesterol", "sodium", "potassium", "calcium", "iron", "magnesium", "phosphorus", "zinc", "vitC", "vitE", "thiamin", "riboflavin", "niacin", "vitB6", "choline", "caffeine", "copper", "manganese", "pantothenicAcid"];
  const ugKeys: NutrientKey[] = ["selenium", "vitA", "vitD", "vitK", "folate", "vitB12"];
  if (u === "g" && mgKeys.includes(key)) return 1000;
  if (u === "g" && ugKeys.includes(key)) return 1e6;
  if (u === "mg" && ugKeys.includes(key)) return 1000;
  if (u === "µg" || u === "ug" || u === "mcg") { if (mgKeys.includes(key)) return 0.001; }
  if (u === "kj" && key === "kcal") return 1 / 4.184;
  if ((u === "iu") && key === "vitD") return 1 / 40;
  return 1;
}

export type ImportKind = "mfp-nutrition" | "mfp-measurements" | "cronometer-servings" | "cronometer-biometrics" | "cronometer-daily" | "unknown";

export function detectImport(rows: string[][]): ImportKind {
  const h = rows[0]?.map((x) => x.trim().toLowerCase()) ?? [];
  if (h.includes("date") && h.includes("meal") && h.some((x) => x.startsWith("calories"))) return "mfp-nutrition";
  if (h.includes("date") && h.includes("weight") && h.length <= 4) return "mfp-measurements";
  if (h.includes("day") && h.includes("group") && h.includes("food name")) return "cronometer-servings";
  if (h.includes("day") && h.includes("metric") && h.includes("amount")) return "cronometer-biometrics";
  if (h.includes("date") && h.includes("energy (kcal)") && !h.includes("food name")) return "cronometer-daily";
  return "unknown";
}

