import type { ActivityLevel, GoalType, MacroTargets, Profile, WeightEntry, ISODate } from "@/db/types";
import { addDays, daysBetween, today } from "./dates.ts";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary · desk job, little exercise",
  light: "Lightly active · 1–3 workouts a week",
  moderate: "Moderately active · 3–5 workouts a week",
  active: "Active · 6–7 workouts a week or physical job",
  very: "Very active · hard daily training",
};

/** Mifflin-St Jeor resting metabolic rate. */
export function bmr(sex: "male" | "female", kg: number, cm: number, age: number): number {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function formulaTdee(p: Pick<Profile, "sex" | "heightCm" | "birthYear" | "activity">, kg: number): number {
  const age = new Date().getFullYear() - p.birthYear;
  return Math.round(bmr(p.sex, kg, p.heightCm, age) * ACTIVITY_FACTORS[p.activity]);
}

/** ~7700 kcal per kg of body weight. */
export const KCAL_PER_KG = 7700;

export function kcalTargetFor(tdee: number, rateKgPerWeek: number): number {
  const daily = (rateKgPerWeek * KCAL_PER_KG) / 7;
  return Math.max(1200, Math.round(tdee + daily));
}

export function defaultRateFor(goal: GoalType): number {
  return goal === "lose" ? -0.5 : goal === "gain" ? 0.25 : 0;
}

/**
 * Default macro split: protein 1.8 g/kg (scaled toward 2.2 when cutting),
 * fat 25 % of kcal, carbs fill the rest.
 */
export function defaultMacros(kcal: number, kg: number, goal: GoalType): MacroTargets {
  const proteinPerKg = goal === "lose" ? 2.0 : goal === "gain" ? 1.8 : 1.8;
  const protein = Math.round(kg * proteinPerKg);
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

export function macrosFromPercent(kcal: number, pct: { protein: number; carbs: number; fat: number }): MacroTargets {
  return {
    kcal,
    protein: Math.round((kcal * pct.protein) / 100 / 4),
    carbs: Math.round((kcal * pct.carbs) / 100 / 4),
    fat: Math.round((kcal * pct.fat) / 100 / 9),
  };
}

/* ───────────────────────── Weight trend (EMA) ───────────────────────── */
export interface TrendPoint {
  date: ISODate;
  kg?: number; // raw scale weight that day (average if multiple)
  trend: number;
}

/**
 * MacroFactor / Happy Scale-style trend weight: an exponentially weighted moving
 * average over calendar days, carrying the trend forward across missing days.
 */
export function weightTrend(entries: WeightEntry[], alpha = 0.1): TrendPoint[] {
  const byDay = new Map<ISODate, number[]>();
  for (const e of entries) {
    if (e.deletedAt) continue;
    const arr = byDay.get(e.date) ?? [];
    arr.push(e.kg);
    byDay.set(e.date, arr);
  }
  const days = [...byDay.keys()].sort();
  if (!days.length) return [];
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  let cursor = days[0];
  const last = days[days.length - 1];
  while (cursor <= last) {
    const raw = byDay.get(cursor);
    const kg = raw ? raw.reduce((a, b) => a + b, 0) / raw.length : undefined;
    if (kg !== undefined) trend = trend === null ? kg : trend + alpha * (kg - trend);
    if (trend !== null) out.push({ date: cursor, kg, trend });
    cursor = addDays(cursor, 1);
  }
  return out;
}

/* ───────────────────────── Adaptive expenditure ───────────────────────── */
export interface ExpenditureInput {
  /** daily intake kcal by date (only days with any logged food) */
  intakeByDay: Map<ISODate, number>;
  trend: TrendPoint[];
  /** fallback when there is not enough data */
  fallbackTdee: number;
  windowDays?: number;
}

export interface ExpenditureEstimate {
  tdee: number;
  confidence: "low" | "medium" | "high";
  daysUsed: number;
  avgIntake: number;
  weightChangeKg: number;
  note: string;
}

/**
 * Estimates true energy expenditure from logged intake and the trend-weight
 * slope over a rolling window (default 21 days), the same energy-balance idea
 * MacroFactor uses: TDEE ≈ avg intake − (Δtrend kg × 7700) / days.
 * Days with no food logged are excluded from the intake average and the
 * estimate is shrunk toward the formula TDEE when data is thin.
 */
export function estimateExpenditure(input: ExpenditureInput): ExpenditureEstimate {
  const windowDays = input.windowDays ?? 21;
  const end = today();
  const start = addDays(end, -(windowDays - 1));
  const trendInWindow = input.trend.filter((t) => t.date >= start && t.date <= end);
  const intakeDays = [...input.intakeByDay.entries()].filter(([d, kcal]) => d >= start && d <= end && kcal > 300);

  if (trendInWindow.length < 5 || intakeDays.length < 7) {
    return {
      tdee: Math.round(input.fallbackTdee),
      confidence: "low",
      daysUsed: intakeDays.length,
      avgIntake: intakeDays.length ? Math.round(intakeDays.reduce((a, [, k]) => a + k, 0) / intakeDays.length) : 0,
      weightChangeKg: 0,
      note: "Log food and weight for at least a week to unlock an adaptive estimate.",
    };
  }
  const first = trendInWindow[0];
  const last = trendInWindow[trendInWindow.length - 1];
  const span = Math.max(1, daysBetween(first.date, last.date));
  const deltaKg = last.trend - first.trend;
  const avgIntake = intakeDays.reduce((a, [, k]) => a + k, 0) / intakeDays.length;
  const raw = avgIntake - (deltaKg * KCAL_PER_KG) / span;

  // shrink toward formula by how complete the logging is
  const completeness = Math.min(1, intakeDays.length / windowDays);
  const weight = 0.35 + 0.65 * completeness;
  const tdee = Math.round(raw * weight + input.fallbackTdee * (1 - weight));
  const confidence = completeness > 0.85 && span >= 14 ? "high" : completeness > 0.6 ? "medium" : "low";
  return {
    tdee: Math.max(1000, Math.min(6000, tdee)),
    confidence,
    daysUsed: intakeDays.length,
    avgIntake: Math.round(avgIntake),
    weightChangeKg: deltaKg,
    note: `${intakeDays.length} logged days · trend ${deltaKg >= 0 ? "+" : ""}${deltaKg.toFixed(2)} kg over ${span} days`,
  };
}

/** Effective targets for a calendar date, applying weekday overrides. */
export function targetsForDate(profile: Profile, date: ISODate, override?: Partial<MacroTargets> | null): MacroTargets {
  const wd = new Date(date + "T12:00:00").getDay();
  const wk = profile.weekdayTargets?.[wd] ?? {};
  return { ...profile.targets, ...wk, ...(override ?? {}) };
}
