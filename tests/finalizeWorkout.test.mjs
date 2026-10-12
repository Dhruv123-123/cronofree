import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeDraft, workoutToDraftExercises } from "../src/lib/finalizeWorkout.ts";

const set = (weight, reps, completed = false, rpe = "") => ({ weight, reps, rpe, completed });

test("finalize keeps typed-but-unticked sets, treats blank weight as bodyweight, skips rep-less sets", () => {
  const r = finalizeDraft([
    { exerciseId: "a", sets: [set("100", "5", true), set("100", "5", false), set("", "12", false), set("60", "", false), set("", "", false)] },
    { exerciseId: "b", sets: [set("", "", false), set("", "", false)] },
    { exerciseId: "c", sets: [set("40", "8", false, "8.5")] },
  ]);
  assert.equal(r.exercises.length, 2);
  assert.deepEqual(r.exercises[0].sets.map((s) => [s.weight, s.reps]), [[100, 5], [100, 5], [0, 12]]);
  assert.equal(r.untickedSaved, 3);
  assert.deepEqual(r.skipped, [{ exerciseIndex: 0, setIndex: 3 }]);
  assert.deepEqual(r.droppedExercises, [1]);
  assert.equal(r.exercises[1].sets[0].rpe, 8.5);
  assert.equal(r.exercises[1].sets[0].completed, true);
});

test("finalize accepts comma decimals and rounds reps", () => {
  const r = finalizeDraft([{ exerciseId: "a", sets: [set("22,5", "8.0", true)] }]);
  assert.deepEqual([r.exercises[0].sets[0].weight, r.exercises[0].sets[0].reps], [22.5, 8]);
});

test("workout → draft → workout round-trips", () => {
  const ex = [{ exerciseId: "a", sets: [{ weight: 80, reps: 5, rpe: 9, completed: true }, { weight: 0, reps: 10, rpe: null, completed: true }] }];
  const r = finalizeDraft(workoutToDraftExercises(ex));
  assert.deepEqual(r.exercises, ex);
  assert.equal(r.untickedSaved, 0);
});
