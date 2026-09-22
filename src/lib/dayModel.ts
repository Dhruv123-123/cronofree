import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { DiaryEntry, ISODate, MacroTargets, Profile } from "@/db/types";
import { referenceTargets, type Nutrients } from "./nutrients";
import { targetsForDate } from "./energy";
import { dayTotals, exerciseKcal } from "./foodRepo";

export interface DayModel {
  date: ISODate;
  entries: DiaryEntry[];
  byMeal: Record<string, DiaryEntry[]>;
  totals: Nutrients;
  exerciseKcal: number;
  targets: MacroTargets;
  nutrientTargets: Nutrients;
  loading: boolean;
}

export function ageOf(p: Profile): number {
  return Math.max(14, new Date().getFullYear() - p.birthYear);
}

export function nutrientTargetsFor(p: Profile, kcal: number, kg?: number): Nutrients {
  return { ...referenceTargets(p.sex, ageOf(p), kcal, kg ?? p.targetWeightKg ?? 70), ...(p.nutrientTargetOverrides ?? {}) };
}

export function useDay(date: ISODate, profile: Profile): DayModel {
  const entries = useLiveQuery(() => db.entries.where("date").equals(date).filter((e) => !e.deletedAt).toArray(), [date]);
  const override = useLiveQuery(() => db.dayOverrides.where("date").equals(date).filter((o) => !o.deletedAt).first(), [date]);
  return useMemo(() => {
    const list = (entries ?? []).slice().sort((a, b) => a.order - b.order);
    const byMeal: Record<string, DiaryEntry[]> = {};
    for (const e of list) (byMeal[e.mealId] ||= []).push(e);
    const targets = targetsForDate(profile, date, override?.targets ?? null);
    return {
      date,
      entries: list,
      byMeal,
      totals: dayTotals(list),
      exerciseKcal: exerciseKcal(list),
      targets,
      nutrientTargets: nutrientTargetsFor(profile, targets.kcal),
      loading: entries === undefined,
    };
  }, [entries, override, profile, date]);
}

export function mealIdFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function mealsOf(profile: Profile): { id: string; name: string }[] {
  return profile.mealNames.map((n) => ({ id: mealIdFor(n), name: n }));
}

/** Pick the meal for "now" by time of day. */
export function suggestedMealId(profile: Profile): string {
  const meals = mealsOf(profile);
  const h = new Date().getHours();
  const idx = h < 10.5 ? 0 : h < 15 ? 1 : h < 21 ? 2 : 3;
  return (meals[Math.min(idx, meals.length - 1)] ?? meals[0]).id;
}
