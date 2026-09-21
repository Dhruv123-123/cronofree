import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { Profile, ISODate, DiaryEntry, WeightEntry } from "@/db/types";
import { weightTrend, estimateExpenditure, formulaTdee, kcalTargetFor, type ExpenditureEstimate, type TrendPoint } from "./energy";
import { addDays, today, daysBetween } from "./dates";
import { sumNutrients, type Nutrients } from "./nutrients";
import { updateProfile } from "@/hooks";

export interface Checkin {
  trend: TrendPoint[];
  latestKg: number | null;
  trendKg: number | null;
  /** kg per week over the last 14 days of trend */
  rateKgPerWeek: number | null;
  formulaTdee: number;
  estimate: ExpenditureEstimate;
  currentTdee: number;
  recommendedKcal: number;
  intakeByDay: Map<ISODate, number>;
  avgIntake7: number | null;
  loggedDays30: number;
  weightsLast30: number;
  entries: DiaryEntry[];
  weights: WeightEntry[];
  goalEtaDays: number | null;
}

export function intakeMap(entries: DiaryEntry[]): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const e of entries) if (!e.deletedAt && e.kind !== "exercise") m.set(e.date, (m.get(e.date) ?? 0) + (e.nutrients.kcal ?? 0));
  return m;
}

export function buildCheckin(profile: Profile, entries: DiaryEntry[], weights: WeightEntry[]): Checkin {
  const trend = weightTrend(weights);
  const last = trend[trend.length - 1];
  const latestRaw = [...weights].filter((w) => !w.deletedAt).sort((a, b) => b.at - a.at)[0];
  const kgForFormula = last?.trend ?? latestRaw?.kg ?? profile.targetWeightKg ?? 75;
  const fTdee = formulaTdee(profile, kgForFormula);
  const intakeByDay = intakeMap(entries);
  const estimate = estimateExpenditure({ intakeByDay, trend, fallbackTdee: fTdee });
  const currentTdee = profile.expenditureMode === "manual" && profile.manualTdee ? profile.manualTdee : profile.expenditureMode === "formula" ? fTdee : (estimate.confidence === "low" && profile.expenditure ? profile.expenditure : estimate.tdee);
  const recommendedKcal = kcalTargetFor(currentTdee, profile.rateKgPerWeek);

  let rate: number | null = null;
  if (trend.length >= 8) {
    const endT = trend[trend.length - 1];
    const startT = trend.find((t) => daysBetween(t.date, endT.date) <= 14) ?? trend[0];
    const days = Math.max(1, daysBetween(startT.date, endT.date));
    rate = ((endT.trend - startT.trend) / days) * 7;
  }
  const t = today();
  const last7 = [...intakeByDay.entries()].filter(([d, k]) => d > addDays(t, -7) && d <= t && k > 300);
  const avgIntake7 = last7.length ? Math.round(last7.reduce((a, [, k]) => a + k, 0) / last7.length) : null;
  const loggedDays30 = [...intakeByDay.entries()].filter(([d, k]) => d > addDays(t, -30) && k > 300).length;
  const weightsLast30 = weights.filter((w) => !w.deletedAt && w.date > addDays(t, -30)).length;

  let goalEtaDays: number | null = null;
  if (profile.targetWeightKg && last && profile.rateKgPerWeek !== 0) {
    const remaining = profile.targetWeightKg - last.trend;
    if (Math.sign(remaining) === Math.sign(profile.rateKgPerWeek)) goalEtaDays = Math.round((remaining / profile.rateKgPerWeek) * 7);
    else goalEtaDays = 0;
  }

  return { trend, latestKg: latestRaw?.kg ?? null, trendKg: last?.trend ?? null, rateKgPerWeek: rate, formulaTdee: fTdee, estimate, currentTdee, recommendedKcal, intakeByDay, avgIntake7, loggedDays30, weightsLast30, entries, weights, goalEtaDays };
}

export function useCheckin(profile: Profile): Checkin | undefined {
  return useLiveQuery(async () => {
    const since = addDays(today(), -120);
    const entries = await db.entries.where("date").aboveOrEqual(since).filter((e) => !e.deletedAt).toArray();
    const weights = await db.weights.filter((w) => !w.deletedAt).toArray();
    return buildCheckin(profile, entries, weights);
  }, [profile]);
}

/** Apply the recommended calories, keeping protein fixed and fat at its current share; carbs absorb the change. */
export async function applyRecommendation(profile: Profile, kcal: number, tdee: number): Promise<void> {
  const t = profile.targets;
  const fatShare = t.kcal > 0 ? (t.fat * 9) / t.kcal : 0.27;
  const fat = Math.round((kcal * fatShare) / 9);
  const carbs = Math.max(30, Math.round((kcal - t.protein * 4 - fat * 9) / 4));
  await updateProfile({ targets: { kcal, protein: t.protein, carbs, fat }, expenditure: tdee, expenditureUpdatedAt: Date.now() });
}

export function averageNutrients(entries: DiaryEntry[], days: ISODate[]): { avg: Nutrients; loggedDays: number } {
  const set = new Set(days);
  const byDay = new Map<ISODate, DiaryEntry[]>();
  for (const e of entries) if (set.has(e.date) && !e.deletedAt && e.kind !== "exercise") (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)!).push(e);
  const logged = [...byDay.values()].filter((l) => l.reduce((a, e) => a + (e.nutrients.kcal ?? 0), 0) > 300);
  if (!logged.length) return { avg: {}, loggedDays: 0 };
  const total = sumNutrients(logged.flat().map((e) => e.nutrients));
  const avg: Nutrients = {};
  for (const [k, v] of Object.entries(total)) avg[k as keyof Nutrients] = (v as number) / logged.length;
  return { avg, loggedDays: logged.length };
}
