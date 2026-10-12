/**
 * Turning a workout draft into saved sets. Pure, so it can be unit-tested.
 *
 * Rule: a set counts if it has reps. A missing weight means bodyweight (0).
 * The "completed" tick is a convenience for the rest timer and the progress
 * counter, not a gate on saving: people routinely type weight × reps and go
 * straight to Finish, and the data they typed must not be thrown away.
 */
import type { DraftExercise, WorkoutExercise, WorkoutSet } from "../db/types.ts";

export interface FinalizeResult {
  exercises: WorkoutExercise[];
  /** Sets that had weight × reps but were not ticked; saved anyway. */
  untickedSaved: number;
  /** Sets skipped because reps were missing. */
  skipped: { exerciseIndex: number; setIndex: number }[];
  /** Exercises that ended up with no sets. */
  droppedExercises: number[];
}

const num = (s: string): number | null => { const v = parseFloat(String(s).replace(",", ".")); return Number.isFinite(v) ? v : null; };

export function finalizeDraft(exercises: DraftExercise[]): FinalizeResult {
  let untickedSaved = 0;
  const skipped: FinalizeResult["skipped"] = [];
  const droppedExercises: number[] = [];
  const out: WorkoutExercise[] = [];
  exercises.forEach((ex, exerciseIndex) => {
    const sets: WorkoutSet[] = [];
    ex.sets.forEach((s, setIndex) => {
      const reps = num(s.reps);
      const weight = s.weight === "" ? 0 : num(s.weight);
      if (reps == null || reps <= 0 || weight == null) {
        if (s.weight !== "" || s.reps !== "" || s.completed) skipped.push({ exerciseIndex, setIndex });
        return;
      }
      if (!s.completed) untickedSaved++;
      const rpe = s.rpe ? num(s.rpe) : null;
      sets.push({ weight, reps: Math.round(reps), rpe, completed: true });
    });
    if (sets.length) out.push(ex.customName ? { exerciseId: ex.exerciseId, customName: ex.customName, sets } : { exerciseId: ex.exerciseId, sets });
    else droppedExercises.push(exerciseIndex);
  });
  return { exercises: out, untickedSaved, skipped, droppedExercises };
}

/** Saved workout → editable draft rows (for editing history). */
export function workoutToDraftExercises(exercises: WorkoutExercise[]): DraftExercise[] {
  return exercises.map((ex) => ({ exerciseId: ex.exerciseId, customName: ex.customName, sets: ex.sets.map((s) => ({ weight: String(s.weight), reps: String(s.reps), rpe: s.rpe == null ? "" : String(s.rpe), completed: true })) }));
}
