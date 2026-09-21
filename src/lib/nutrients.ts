/**
 * Nutrient model. Every food stores amounts per 100 g (per 100 mL for liquids
 * is handled by the food's density = 1 assumption). Units are fixed per key.
 */
export type NutrientKey =
  | "kcal" | "protein" | "carbs" | "fiber" | "sugar" | "addedSugar" | "fat" | "satFat"
  | "monoFat" | "polyFat" | "transFat" | "cholesterol" | "sodium" | "potassium" | "calcium"
  | "iron" | "magnesium" | "phosphorus" | "zinc" | "selenium" | "vitA" | "vitC" | "vitD" | "vitE"
  | "vitK" | "thiamin" | "riboflavin" | "niacin" | "vitB6" | "folate" | "vitB12" | "choline"
  | "omega3" | "caffeine" | "alcohol" | "water";

export type Nutrients = Partial<Record<NutrientKey, number>>;

export interface NutrientDef {
  key: NutrientKey;
  label: string;
  short: string;
  unit: "kcal" | "g" | "mg" | "µg";
  group: "energy" | "macro" | "carb" | "lipid" | "mineral" | "vitamin" | "other";
  decimals: number;
  /** true when less is better (sodium, sat fat, added sugar…) */
  limit?: boolean;
}

export const NUTRIENTS: NutrientDef[] = [
  { key: "kcal", label: "Energy", short: "kcal", unit: "kcal", group: "energy", decimals: 0 },
  { key: "protein", label: "Protein", short: "Protein", unit: "g", group: "macro", decimals: 1 },
  { key: "carbs", label: "Carbohydrate", short: "Carbs", unit: "g", group: "macro", decimals: 1 },
  { key: "fat", label: "Fat", short: "Fat", unit: "g", group: "macro", decimals: 1 },
  { key: "fiber", label: "Fiber", short: "Fiber", unit: "g", group: "carb", decimals: 1 },
  { key: "sugar", label: "Sugars", short: "Sugar", unit: "g", group: "carb", decimals: 1 },
  { key: "addedSugar", label: "Added sugars", short: "Added sugar", unit: "g", group: "carb", decimals: 1, limit: true },
  { key: "satFat", label: "Saturated fat", short: "Sat fat", unit: "g", group: "lipid", decimals: 1, limit: true },
  { key: "monoFat", label: "Monounsaturated fat", short: "Mono", unit: "g", group: "lipid", decimals: 1 },
  { key: "polyFat", label: "Polyunsaturated fat", short: "Poly", unit: "g", group: "lipid", decimals: 1 },
  { key: "transFat", label: "Trans fat", short: "Trans", unit: "g", group: "lipid", decimals: 1, limit: true },
  { key: "omega3", label: "Omega-3", short: "Omega-3", unit: "g", group: "lipid", decimals: 2 },
  { key: "cholesterol", label: "Cholesterol", short: "Chol", unit: "mg", group: "lipid", decimals: 0, limit: true },
  { key: "sodium", label: "Sodium", short: "Sodium", unit: "mg", group: "mineral", decimals: 0, limit: true },
  { key: "potassium", label: "Potassium", short: "Potassium", unit: "mg", group: "mineral", decimals: 0 },
  { key: "calcium", label: "Calcium", short: "Calcium", unit: "mg", group: "mineral", decimals: 0 },
  { key: "iron", label: "Iron", short: "Iron", unit: "mg", group: "mineral", decimals: 1 },
  { key: "magnesium", label: "Magnesium", short: "Mg", unit: "mg", group: "mineral", decimals: 0 },
  { key: "phosphorus", label: "Phosphorus", short: "Phos", unit: "mg", group: "mineral", decimals: 0 },
  { key: "zinc", label: "Zinc", short: "Zinc", unit: "mg", group: "mineral", decimals: 1 },
  { key: "selenium", label: "Selenium", short: "Se", unit: "µg", group: "mineral", decimals: 0 },
  { key: "vitA", label: "Vitamin A", short: "A", unit: "µg", group: "vitamin", decimals: 0 },
  { key: "vitC", label: "Vitamin C", short: "C", unit: "mg", group: "vitamin", decimals: 0 },
  { key: "vitD", label: "Vitamin D", short: "D", unit: "µg", group: "vitamin", decimals: 1 },
  { key: "vitE", label: "Vitamin E", short: "E", unit: "mg", group: "vitamin", decimals: 1 },
  { key: "vitK", label: "Vitamin K", short: "K", unit: "µg", group: "vitamin", decimals: 0 },
  { key: "thiamin", label: "Thiamin (B1)", short: "B1", unit: "mg", group: "vitamin", decimals: 2 },
  { key: "riboflavin", label: "Riboflavin (B2)", short: "B2", unit: "mg", group: "vitamin", decimals: 2 },
  { key: "niacin", label: "Niacin (B3)", short: "B3", unit: "mg", group: "vitamin", decimals: 1 },
  { key: "vitB6", label: "Vitamin B6", short: "B6", unit: "mg", group: "vitamin", decimals: 2 },
  { key: "folate", label: "Folate", short: "Folate", unit: "µg", group: "vitamin", decimals: 0 },
  { key: "vitB12", label: "Vitamin B12", short: "B12", unit: "µg", group: "vitamin", decimals: 2 },
  { key: "choline", label: "Choline", short: "Choline", unit: "mg", group: "vitamin", decimals: 0 },
  { key: "caffeine", label: "Caffeine", short: "Caffeine", unit: "mg", group: "other", decimals: 0, limit: true },
  { key: "alcohol", label: "Alcohol", short: "Alcohol", unit: "g", group: "other", decimals: 1, limit: true },
  { key: "water", label: "Water", short: "Water", unit: "g", group: "other", decimals: 0 },
];

export const NUTRIENT_BY_KEY: Record<NutrientKey, NutrientDef> = Object.fromEntries(
  NUTRIENTS.map((n) => [n.key, n]),
) as Record<NutrientKey, NutrientDef>;

export const MACRO_KEYS: NutrientKey[] = ["protein", "carbs", "fat"];

export function emptyNutrients(): Nutrients {
  return {};
}

export function addNutrients(a: Nutrients, b: Nutrients, factor = 1): Nutrients {
  const out: Nutrients = { ...a };
  for (const k of Object.keys(b) as NutrientKey[]) {
    const v = b[k];
    if (typeof v !== "number" || Number.isNaN(v)) continue;
    out[k] = (out[k] ?? 0) + v * factor;
  }
  return out;
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out: Nutrients = {};
  for (const k of Object.keys(n) as NutrientKey[]) {
    const v = n[k];
    if (typeof v === "number" && !Number.isNaN(v)) out[k] = v * factor;
  }
  return out;
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce((acc, n) => addNutrients(acc, n), {} as Nutrients);
}

export function netCarbs(n: Nutrients): number {
  return Math.max(0, (n.carbs ?? 0) - (n.fiber ?? 0));
}

/** Atwater energy from macros (used when a food has no kcal). */
export function macroKcal(n: Nutrients): number {
  return (n.protein ?? 0) * 4 + (n.carbs ?? 0) * 4 + (n.fat ?? 0) * 9 + (n.alcohol ?? 0) * 7;
}

export function formatAmount(key: NutrientKey, value: number | undefined): string {
  const def = NUTRIENT_BY_KEY[key];
  if (value === undefined || Number.isNaN(value)) return "–";
  const d = value >= 100 ? 0 : def.decimals;
  return value.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

/* ─────────────────────────── Reference targets ─────────────────────────── */
export type Sex = "male" | "female";

export interface NutrientTargets {
  /** target (RDA / AI) or upper limit when the nutrient is a "limit" nutrient */
  [key: string]: number | undefined;
}

/**
 * Dietary reference intakes (NIH/IOM DRIs, adults). Limits use the DGA / AHA
 * guidance. Returns a per-day target map keyed by NutrientKey.
 */
export function referenceTargets(sex: Sex, age: number, kcal: number): Nutrients {
  const f = sex === "female";
  const older = age >= 51;
  const t: Nutrients = {
    fiber: Math.round((kcal / 1000) * 14),
    addedSugar: Math.round((kcal * 0.1) / 4),
    satFat: Math.round((kcal * 0.1) / 9),
    transFat: 2,
    cholesterol: 300,
    sodium: 2300,
    potassium: f ? 2600 : 3400,
    calcium: older || (f && age >= 51) ? 1200 : 1000,
    iron: f && !older ? 18 : 8,
    magnesium: f ? (age >= 31 ? 320 : 310) : age >= 31 ? 420 : 400,
    phosphorus: 700,
    zinc: f ? 8 : 11,
    selenium: 55,
    vitA: f ? 700 : 900,
    vitC: f ? 75 : 90,
    vitD: age >= 70 ? 20 : 15,
    vitE: 15,
    vitK: f ? 90 : 120,
    thiamin: f ? 1.1 : 1.2,
    riboflavin: f ? 1.1 : 1.3,
    niacin: f ? 14 : 16,
    vitB6: older ? (f ? 1.5 : 1.7) : 1.3,
    folate: 400,
    vitB12: 2.4,
    choline: f ? 425 : 550,
    omega3: f ? 1.1 : 1.6,
    caffeine: 400,
    water: Math.round(kcal), // ~1 mL per kcal (total water incl. food)
  };
  return t;
}
