/**
 * Importers for the two big apps' data exports.
 *  - MyFitnessPal: Nutrition-Summary (per meal per day) and Measurement-Summary CSVs
 *  - Cronometer: servings.csv (per food), biometrics.csv, dailysummary.csv
 * Everything becomes ordinary diary entries / weights / biometrics that sync like the rest.
 */
import { db, putMany } from "@/db";
import type { DiaryEntry, WeightEntry, Biometric, BiometricKind } from "@/db/types";
import type { Nutrients, NutrientKey } from "./nutrients";
import { parseCsv, detectImport, headerKey, unitFactor, num, type ImportKind } from "./csv";
export { parseCsv, detectImport, type ImportKind };
import { uid } from "./id";
import { scheduleSync } from "./sync";
import { mealIdFor } from "./dayModel";

function toIso(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export interface ImportResult { kind: ImportKind; entries: number; weights: number; biometrics: number; skipped: number }

export async function runImport(text: string, opts: { mealNames: string[]; weightUnitGuess?: "kg" | "lb" } = { mealNames: ["Breakfast", "Lunch", "Dinner", "Snacks"] }): Promise<ImportResult> {
  const rows = parseCsv(text);
  const kind = detectImport(rows);
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const result: ImportResult = { kind, entries: 0, weights: 0, biometrics: 0, skipped: 0 };
  const idx = (name: RegExp) => header.findIndex((h) => name.test(h.trim()));
  const nutrientCols = header.map((h, i) => ({ i, key: headerKey(h), f: 1 })).filter((c): c is { i: number; key: NutrientKey; f: number } => !!c.key).map((c) => ({ ...c, f: unitFactor(header[c.i], c.key) }));
  const mealFor = (name: string) => { const n = name.trim().toLowerCase(); const hit = opts.mealNames.find((m) => m.toLowerCase() === n) ?? opts.mealNames.find((m) => n.includes(m.toLowerCase().slice(0, 5))); return mealIdFor(hit ?? (n.includes("snack") ? "Snacks" : opts.mealNames[opts.mealNames.length - 1])); };
  const now = Date.now();

  if (kind === "mfp-nutrition" || kind === "cronometer-servings") {
    const dateI = kind === "mfp-nutrition" ? idx(/^date$/i) : idx(/^day$/i);
    const mealI = kind === "mfp-nutrition" ? idx(/^meal$/i) : idx(/^group$/i);
    const nameI = idx(/^food name$/i);
    const amountI = idx(/^amount$/i);
    const timeI = idx(/^time$/i);
    const noteI = idx(/^note/i);
    const entries: DiaryEntry[] = [];
    for (const r of body) {
      const date = toIso(r[dateI] ?? "");
      if (!date) { result.skipped++; continue; }
      const nutrients: Nutrients = {};
      for (const c of nutrientCols) { const v = num(r[c.i]); if (v !== undefined) nutrients[c.key] = v * c.f; }
      if (nutrients.kcal === undefined && nutrients.protein === undefined) { result.skipped++; continue; }
      const amount = amountI >= 0 ? r[amountI] : "";
      const grams = /(\d+(?:\.\d+)?)\s*g\b/i.exec(amount ?? "")?.[1];
      entries.push({
        id: uid("e"), date, mealId: mealFor(r[mealI] ?? ""), kind: kind === "mfp-nutrition" ? "quick" : "food",
        name: nameI >= 0 ? (r[nameI] || "Imported food") : `${r[mealI] ?? "Meal"} (MyFitnessPal)`,
        grams: grams ? Number(grams) : 0, servingLabel: amount && !grams ? amount : undefined, servingQty: amount && !grams ? 1 : undefined,
        nutrients, time: timeI >= 0 ? (r[timeI] || undefined) : undefined, note: noteI >= 0 ? (r[noteI] || undefined) : undefined, order: now + entries.length, updatedAt: 0,
      });
    }
    // don't double-import the same day: skip dates that already have imported entries with same name+kcal
    const existing = await db.entries.where("date").anyOf([...new Set(entries.map((e) => e.date))]).filter((e) => !e.deletedAt).toArray();
    const sig = new Set(existing.map((e) => `${e.date}|${e.mealId}|${e.name}|${Math.round(e.nutrients.kcal ?? 0)}`));
    const fresh = entries.filter((e) => !sig.has(`${e.date}|${e.mealId}|${e.name}|${Math.round(e.nutrients.kcal ?? 0)}`));
    result.skipped += entries.length - fresh.length;
    if (fresh.length) await putMany("entries", fresh);
    result.entries = fresh.length;
  } else if (kind === "mfp-measurements") {
    const dateI = idx(/^date$/i), wI = idx(/^weight$/i);
    const weights: WeightEntry[] = [];
    for (const r of body) {
      const date = toIso(r[dateI] ?? ""); const v = num(r[wI]);
      if (!date || v === undefined) { result.skipped++; continue; }
      const kg = (opts.weightUnitGuess ?? (v > 130 ? "lb" : "kg")) === "lb" ? v * 0.45359237 : v;
      weights.push({ id: uid("w"), date, at: new Date(date + "T08:00:00").getTime(), kg, updatedAt: 0 });
    }
    if (weights.length) await putMany("weights", weights);
    result.weights = weights.length;
  } else if (kind === "cronometer-biometrics") {
    const dateI = idx(/^day$/i), timeI = idx(/^time$/i), metricI = idx(/^metric$/i), unitI = idx(/^unit$/i), amountI = idx(/^amount$/i);
    const weights: WeightEntry[] = []; const bios: Biometric[] = [];
    const MAP: [RegExp, BiometricKind][] = [[/blood pressure/i, "bloodPressure"], [/resting heart/i, "restingHr"], [/heart rate variability|hrv/i, "hrv"], [/sleep/i, "sleep"], [/steps/i, "steps"], [/body fat/i, "bodyFat"], [/glucose/i, "glucose"], [/ketone/i, "ketones"], [/temperature/i, "temperature"], [/mood/i, "mood"], [/energy/i, "energy"]];
    for (const r of body) {
      const date = toIso(r[dateI] ?? ""); if (!date) { result.skipped++; continue; }
      const at = new Date(`${date}T${(r[timeI] || "08:00").slice(0, 5)}:00`).getTime() || Date.now();
      const metric = r[metricI] ?? ""; const unit = (r[unitI] ?? "").toLowerCase(); const raw = r[amountI] ?? "";
      if (/^weight$/i.test(metric.trim())) { const v = num(raw); if (v === undefined) continue; weights.push({ id: uid("w"), date, at, kg: unit.startsWith("lb") ? v * 0.45359237 : v, updatedAt: 0 }); continue; }
      const kind2 = MAP.find(([re]) => re.test(metric))?.[1];
      if (!kind2) { result.skipped++; continue; }
      if (kind2 === "bloodPressure") { const m = raw.match(/(\d+)\D+(\d+)/); if (!m) continue; bios.push({ id: uid("b"), date, at, kind: kind2, value: Number(m[1]), value2: Number(m[2]), updatedAt: 0 }); continue; }
      const v = num(raw); if (v === undefined) continue;
      bios.push({ id: uid("b"), date, at, kind: kind2, value: kind2 === "sleep" && unit.startsWith("min") ? v / 60 : v, updatedAt: 0 });
    }
    if (weights.length) await putMany("weights", weights);
    if (bios.length) await putMany("biometrics", bios);
    result.weights = weights.length; result.biometrics = bios.length;
  } else if (kind === "cronometer-daily") {
    const dateI = idx(/^date$/i);
    const entries: DiaryEntry[] = [];
    for (const r of body) {
      const date = toIso(r[dateI] ?? ""); if (!date) continue;
      const nutrients: Nutrients = {};
      for (const c of nutrientCols) { const v = num(r[c.i]); if (v !== undefined) nutrients[c.key] = v * c.f; }
      if (!nutrients.kcal) continue;
      entries.push({ id: uid("e"), date, mealId: mealIdFor(opts.mealNames[0]), kind: "quick", name: "Day total (Cronometer)", grams: 0, nutrients, order: now, updatedAt: 0 });
    }
    if (entries.length) await putMany("entries", entries);
    result.entries = entries.length;
  }
  scheduleSync();
  return result;
}
