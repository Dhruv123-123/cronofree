/**
 * Pure mapping from the free-exercise-db schema (public domain,
 * github.com/yuhonas/free-exercise-db) to Cronofree exercises. Used by the
 * pack build script and by tests; no DB imports so Node can run it.
 */
import type { Exercise, MuscleGroup, SchemeType } from "../db/types.ts";

export interface FedbExercise {
  id: string;
  name: string;
  force?: "push" | "pull" | "static" | null;
  level?: "beginner" | "intermediate" | "expert";
  mechanic?: "compound" | "isolation" | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  category?: string;
}

/** Compact on-disk row: keeps public/data/exercises.json small. */
export interface PackExercise {
  id: string; n: string; m: MuscleGroup; eq: string; p: string[]; s: string[]; ins: string[];
  lvl?: "beginner" | "intermediate" | "expert"; mech?: "compound" | "isolation"; cat?: string;
  /** Other common names (searchable). */
  aka?: string[];
}
export interface ExercisePack { app: "cronofree"; type: "exercises"; version: number; generatedAt: string; count: number; source: string; exercises: PackExercise[] }

const GROUP: Record<string, MuscleGroup> = {
  chest: "chest",
  lats: "back", "middle back": "back", "lower back": "back", traps: "back",
  shoulders: "shoulders",
  biceps: "arms", triceps: "arms", forearms: "arms",
  quadriceps: "legs", hamstrings: "legs", glutes: "legs", calves: "legs", adductors: "legs", abductors: "legs",
  abdominals: "core",
  neck: "other",
};

const EQUIP: Record<string, string> = {
  barbell: "barbell", dumbbell: "dumbbell", cable: "cable", machine: "machine", "body only": "bodyweight",
  kettlebells: "kettlebell", bands: "bands", "e-z curl bar": "barbell", "medicine ball": "other", "exercise ball": "other", "foam roll": "other", other: "other",
};

export const EQUIPMENT_GROUPS = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "bands", "other"] as const;

export const muscleGroupFor = (primary: string[] = []): MuscleGroup => GROUP[primary[0] ?? ""] ?? "other";
export const equipmentFor = (eq?: string | null): string => EQUIP[(eq ?? "other").toLowerCase()] ?? "other";

export function toPackExercise(x: FedbExercise, aliases?: string[]): PackExercise {
  const row: PackExercise = {
    id: x.id, n: x.name.trim(), m: muscleGroupFor(x.primaryMuscles), eq: equipmentFor(x.equipment),
    p: x.primaryMuscles ?? [], s: x.secondaryMuscles ?? [], ins: (x.instructions ?? []).map((t) => t.trim()).filter(Boolean),
  };
  if (x.level) row.lvl = x.level;
  if (x.mechanic) row.mech = x.mechanic;
  if (x.category) row.cat = x.category;
  if (aliases?.length) row.aka = aliases;
  return row;
}

/** Sensible starting scheme + increment for a catalog exercise; the user can edit everything. */
export function defaultScheme(r: PackExercise): { scheme: Exercise["scheme"]; increment: number } {
  const type: SchemeType =
    r.cat === "stretching" ? "feel"
    : r.cat === "cardio" || r.cat === "plyometrics" ? "feel"
    : (r.cat === "powerlifting" || r.cat === "olympic weightlifting" || r.cat === "strongman" || (r.mech === "compound" && r.eq === "barbell")) ? "heavy"
    : "failure";
  const scheme =
    r.cat === "stretching" ? { type, repsMin: 20, repsMax: 60, sets: 2 }
    : type === "heavy" ? { type, repsMin: 3, repsMax: 6, sets: 3 }
    : type === "feel" ? { type, repsMin: 8, repsMax: 15, sets: 3 }
    : r.mech === "isolation" ? { type, repsMin: 10, repsMax: 15, sets: 3 }
    : { type, repsMin: 8, repsMax: 12, sets: 3 };
  const increment = r.eq === "barbell" || r.eq === "machine" ? 5 : r.eq === "dumbbell" || r.eq === "cable" || r.eq === "kettlebell" ? 2.5 : 0;
  return { scheme, increment };
}

export function packToExercise(r: PackExercise): Exercise {
  const { scheme, increment } = defaultScheme(r);
  const notes = r.eq === "bodyweight" ? "Weight = added load (0 for bodyweight)" : r.cat === "stretching" ? "Reps = seconds held" : "";
  return {
    id: `exp_${r.id}`, name: r.n, muscle: r.m, scheme, increment, notes, builtin: true, source: "pack",
    equipment: r.eq, primary: r.p, secondary: r.s, instructions: r.ins, level: r.lvl, mechanic: r.mech, category: r.cat, aliases: r.aka,
    updatedAt: 1,
  };
}

export function validateExercisePack(pack: ExercisePack): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const r of pack.exercises) {
    if (ids.has(r.id)) errs.push(`duplicate id ${r.id}`); ids.add(r.id);
    if (!r.n) errs.push(`${r.id}: empty name`);
    if (!["chest", "back", "shoulders", "arms", "legs", "core", "other"].includes(r.m)) errs.push(`${r.id}: bad muscle ${r.m}`);
    if (!(EQUIPMENT_GROUPS as readonly string[]).includes(r.eq)) errs.push(`${r.id}: bad equipment ${r.eq}`);
  }
  if (pack.count !== pack.exercises.length) errs.push("count mismatch");
  return errs;
}

/**
 * Search score: 0 = no match. Every token must hit somewhere in the name,
 * aliases, primary muscles or equipment; whole-word hits in the name or an
 * alias outrank word prefixes, which outrank bare substrings ("rdl" should
 * find Romanian Deadlift before "hurdle hops").
 */
export function exerciseScore(e: { name: string; aliases?: string[]; primary?: string[]; equipment?: string }, toks: string[]): number {
  if (!toks.length) return 1;
  const name = e.name.toLowerCase();
  const nameWords = name.split(/[^a-z0-9°&]+/).filter(Boolean);
  const aliasWords = (e.aliases ?? []).flatMap((a) => a.toLowerCase().split(/[^a-z0-9°&]+/).filter(Boolean));
  const other = `${(e.primary ?? []).join(" ")} ${e.equipment ?? ""}`.toLowerCase();
  const aliasText = (e.aliases ?? []).join(" ").toLowerCase();
  let score = 0;
  for (const t of toks) {
    if (nameWords.includes(t)) score += 6;
    else if (aliasWords.includes(t)) score += 5;
    else if (nameWords.some((w) => w.startsWith(t))) score += 4;
    else if (aliasWords.some((w) => w.startsWith(t))) score += 3;
    else if (name.includes(t) || aliasText.includes(t)) score += 2;
    else if (other.includes(t)) score += 1;
    else return 0;
  }
  if (name === toks.join(" ") || (e.aliases ?? []).some((a) => a.toLowerCase() === toks.join(" "))) score += 10;
  if (name.startsWith(toks[0])) score += 1;
  // canonical movements carry aliases; prefer them and shorter names on ties
  if (e.aliases?.length) score += 2;
  score -= nameWords.length * 0.05;
  return score;
}

export const exerciseMatches = (e: { name: string; aliases?: string[]; primary?: string[]; equipment?: string }, toks: string[]): boolean => exerciseScore(e, toks) > 0;
