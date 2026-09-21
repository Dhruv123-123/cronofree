import { db, kvGet, kvSet, putMany, put } from "@/db";
import type { Profile, Program } from "@/db/types";
import { buildSeedFoods, SEED_VERSION } from "./seedFoods";
import { buildDefaultExercises, PROGRAM_TEMPLATES, programFromTemplate } from "./liftingDefaults";
import { defaultMacros } from "./energy";

export const DEFAULT_MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"];

export function defaultProfile(): Profile {
  return {
    id: "me",
    sex: "male",
    birthYear: 1995,
    heightCm: 175,
    activity: "moderate",
    goal: "maintain",
    rateKgPerWeek: 0,
    expenditureMode: "adaptive",
    targets: defaultMacros(2400, 75, "maintain"),
    mealNames: DEFAULT_MEALS,
    units: { weight: "kg", height: "cm", volume: "ml" },
    startOfWeek: 1,
    waterGoalMl: 2500,
    fastingDefaultHours: 16,
    theme: "system",
    onboarded: false,
    updatedAt: 0,
  };
}

/** Idempotent first-run setup. Built-in rows use deterministic ids and are
 *  written silently (not queued for sync) so every device seeds identically. */
export async function bootstrap(): Promise<void> {
  const seedVersion = await kvGet<number>("seedVersion", 0);
  if (seedVersion < SEED_VERSION) {
    const foods = buildSeedFoods();
    const existing = await db.foods.bulkGet(foods.map((f) => f.id));
    const fresh = foods.filter((_, i) => !existing[i]);
    if (fresh.length) await putMany("foods", fresh, { silent: true });
    await kvSet("seedVersion", SEED_VERSION);
  }
  const exVersion = await kvGet<number>("exerciseSeedVersion", 0);
  if (exVersion < 1) {
    const ex = buildDefaultExercises();
    const existing = await db.exercises.bulkGet(ex.map((e) => e.id));
    const fresh = ex.filter((_, i) => !existing[i]);
    if (fresh.length) await putMany("exercises", fresh, { silent: true });
    await kvSet("exerciseSeedVersion", 1);
  }
  if (!(await db.profile.get("me"))) await put("profile", defaultProfile(), { silent: true });
  if ((await db.programs.count()) === 0) {
    const p: Program = { ...programFromTemplate(PROGRAM_TEMPLATES[0], "default"), id: "prog_default", name: "My Program", active: true };
    await put("programs", p, { silent: true });
  }
}
