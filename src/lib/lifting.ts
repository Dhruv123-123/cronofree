import type { Workout, WorkoutSet, Exercise, ISODate } from "@/db/types";

/** Epley estimated one-rep max. */
export function e1RM(weight: number, reps: number): number {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function bestE1RM(sets: WorkoutSet[]): number {
  let best = 0;
  for (const s of sets) {
    if (!s.completed) continue;
    best = Math.max(best, e1RM(s.weight, s.reps));
  }
  return best;
}

export function workoutVolume(w: Workout): number {
  let t = 0;
  for (const ex of w.exercises) for (const s of ex.sets) if (s.completed) t += s.weight * s.reps;
  return t;
}

export function workoutSetCount(w: Workout): number {
  return w.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.completed).length, 0);
}

export interface HistorySession {
  date: ISODate;
  workoutId: string;
  sets: WorkoutSet[];
  e1rm: number;
  volume: number;
  topWeight: number;
}

export function exerciseHistory(workouts: Workout[], exerciseId: string): HistorySession[] {
  const out: HistorySession[] = [];
  for (const w of workouts) {
    if (w.deletedAt) continue;
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const sets = ex.sets.filter((s) => s.completed);
    if (!sets.length) continue;
    out.push({
      date: w.date,
      workoutId: w.id,
      sets,
      e1rm: bestE1RM(sets),
      volume: sets.reduce((a, s) => a + s.weight * s.reps, 0),
      topWeight: Math.max(...sets.map((s) => s.weight)),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.workoutId.localeCompare(b.workoutId));
}

export interface Target {
  weight: number;
  reps: number;
  hint: string;
}

/** Smart next-session target based on the last session and the exercise's rep scheme. */
export function suggestNextTarget(history: HistorySession[], scheme: Exercise["scheme"], increment = 5): Target | null {
  if (!history.length) return null;
  const last = history[history.length - 1];
  const top = last.sets.reduce((b, s) => (e1RM(s.weight, s.reps) > e1RM(b.weight, b.reps) ? s : b));
  const w = top.weight;
  const r = top.reps;
  const { repsMin, repsMax, type } = scheme;
  const up = Number((w + increment).toFixed(2));
  if (type === "heavy") {
    if (r >= repsMax) return { weight: up, reps: repsMin, hint: `+${increment} · you hit ${repsMax} last time` };
    return { weight: w, reps: r + 1, hint: "same weight, +1 rep" };
  }
  if (r >= repsMax) return { weight: up, reps: repsMin, hint: `+${increment} · top of range last time` };
  if (r < repsMin) return { weight: w, reps: r, hint: "repeat · below rep range" };
  return { weight: w, reps: r + 1, hint: "+1 rep" };
}

/** Plateau: ≥5 sessions, last 3 span ≥14 days, e1RM within 4 %. */
export function detectPlateau(history: HistorySession[]): boolean {
  if (history.length < 5) return false;
  const recent = history.slice(-3);
  const span = (new Date(recent[2].date + "T12:00").getTime() - new Date(recent[0].date + "T12:00").getTime()) / 86_400_000;
  if (span < 14) return false;
  const vals = recent.map((s) => s.e1rm);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  return max > 0 && (max - min) / max < 0.04;
}

export interface PR {
  weight: number;
  reps: number;
  e1rm: number;
  date: ISODate;
}

export function bestPR(history: HistorySession[]): PR | null {
  let best: PR | null = null;
  for (const s of history) for (const set of s.sets) {
    const e = e1RM(set.weight, set.reps);
    if (!best || e > best.e1rm) best = { weight: set.weight, reps: set.reps, e1rm: e, date: s.date };
  }
  return best;
}

/** Was this set a new e1RM PR relative to all previous sessions? */
export function isNewPR(history: HistorySession[], beforeDate: ISODate, set: WorkoutSet): boolean {
  const prev = history.filter((h) => h.date < beforeDate);
  const prevBest = bestPR(prev)?.e1rm ?? 0;
  return e1RM(set.weight, set.reps) > prevBest && prevBest > 0;
}

export function lastWorkoutForDay(workouts: Workout[], dayId: string): ISODate | null {
  let latest: ISODate | null = null;
  for (const w of workouts) if (!w.deletedAt && w.programDayId === dayId && (!latest || w.date > latest)) latest = w.date;
  return latest;
}

/** Weekly sets per muscle group over the last 7 days. */
export function weeklyVolumeByMuscle(workouts: Workout[], exercises: Exercise[], sinceIso: ISODate): Record<string, number> {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const out: Record<string, number> = {};
  for (const w of workouts) {
    if (w.deletedAt || w.date < sinceIso) continue;
    for (const ex of w.exercises) {
      const m = byId.get(ex.exerciseId)?.muscle ?? "other";
      out[m] = (out[m] ?? 0) + ex.sets.filter((s) => s.completed).length;
    }
  }
  return out;
}
