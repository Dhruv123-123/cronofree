import { db, put, remove, kvGet, kvSet } from "@/db";
import type { Exercise, Program, ProgramDay, Workout } from "@/db/types";
import { scheduleSync } from "@/lib/sync";
import { uid } from "@/lib/id";

export interface TrainPrefs { defaultRest: number; heavyRest: number; autoStartTimer: boolean }
export const DEFAULT_TRAIN_PREFS: TrainPrefs = { defaultRest: 120, heavyRest: 180, autoStartTimer: true };
export const getTrainPrefs = () => kvGet<TrainPrefs>("trainPrefs", DEFAULT_TRAIN_PREFS).then((p) => ({ ...DEFAULT_TRAIN_PREFS, ...p }));
export const setTrainPrefs = (p: TrainPrefs) => kvSet("trainPrefs", p);

export async function saveWorkout(w: Workout): Promise<void> { await put("workouts", w); scheduleSync(); }
export async function deleteWorkout(id: string): Promise<void> { await remove("workouts", id); scheduleSync(); }

export async function saveExercise(e: Exercise): Promise<Exercise> { const r = await put("exercises", { ...e, deletedAt: null }); scheduleSync(); return r; }
export async function deleteExercise(id: string): Promise<void> {
  await remove("exercises", id);
  // also drop from program days
  const programs = await db.programs.filter((p) => !p.deletedAt).toArray();
  for (const p of programs) if (p.days.some((d) => d.exerciseIds.includes(id))) await saveProgram({ ...p, days: p.days.map((d) => ({ ...d, exerciseIds: d.exerciseIds.filter((x) => x !== id) })) });
  scheduleSync();
}
export function newExercise(name: string, muscle: Exercise["muscle"] = "other"): Exercise {
  return { id: uid("ex"), name, muscle, scheme: { type: "failure", repsMin: 8, repsMax: 12, sets: 3 }, increment: 2.5, notes: "", updatedAt: 0 };
}

export async function saveProgram(p: Program): Promise<void> { await put("programs", { ...p, deletedAt: null }); scheduleSync(); }
export async function deleteProgram(id: string): Promise<void> { await remove("programs", id); scheduleSync(); }
export async function setActiveProgram(id: string): Promise<void> {
  const all = await db.programs.filter((p) => !p.deletedAt).toArray();
  for (const p of all) if (!!p.active !== (p.id === id)) await put("programs", { ...p, active: p.id === id });
  scheduleSync();
}
export const newDay = (name: string): ProgramDay => ({ id: uid("day"), name, exerciseIds: [] });

/** Convert stored workout weights and exercise increments between units. */
export async function convertTrainingUnits(from: "kg" | "lb", to: "kg" | "lb"): Promise<void> {
  if (from === to) return;
  const f = from === "kg" ? 2.20462 : 1 / 2.20462;
  const r1 = (v: number) => Math.round(v * f * 4) / 4;
  const workouts = await db.workouts.filter((w) => !w.deletedAt).toArray();
  for (const w of workouts) await put("workouts", { ...w, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s, weight: r1(s.weight) })) })) });
  const exercises = await db.exercises.filter((e) => !e.deletedAt).toArray();
  for (const e of exercises) await put("exercises", { ...e, increment: Math.max(0.5, Math.round(e.increment * f * 2) / 2) });
  scheduleSync();
}
