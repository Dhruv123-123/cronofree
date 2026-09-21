export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const ML_PER_FLOZ = 29.5735;

export type WeightUnit = "kg" | "lb";

export const kgToUnit = (kg: number, unit: WeightUnit): number => (unit === "kg" ? kg : kg / KG_PER_LB);
export const unitToKg = (v: number, unit: WeightUnit): number => (unit === "kg" ? v : v * KG_PER_LB);
export const cmToUnit = (cm: number, unit: "cm" | "in"): number => (unit === "cm" ? cm : cm / CM_PER_IN);
export const unitToCm = (v: number, unit: "cm" | "in"): number => (unit === "cm" ? v : v * CM_PER_IN);
export const mlToUnit = (ml: number, unit: "ml" | "oz"): number => (unit === "ml" ? ml : ml / ML_PER_FLOZ);
export const unitToMl = (v: number, unit: "ml" | "oz"): number => (unit === "ml" ? v : v * ML_PER_FLOZ);

export function fmtWeight(kg: number, unit: WeightUnit, decimals = 1): string {
  return `${kgToUnit(kg, unit).toFixed(decimals)} ${unit}`;
}

export function round(v: number, d = 1): number {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

export function fmt(v: number | undefined | null, d = 0): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "–";
  return v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
