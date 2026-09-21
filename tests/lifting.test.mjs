import test from "node:test";
import assert from "node:assert/strict";
import { e1RM, exerciseHistory, suggestNextTarget, detectPlateau, bestPR, isNewPR, workoutVolume } from "../src/lib/lifting.ts";

const w = (date, weight, reps) => ({ id: date, date, programDayId: "d", programDayName: "D", exercises: [{ exerciseId: "bench", sets: [{ weight, reps, completed: true }, { weight: weight - 10, reps: 2, completed: false }] }], updatedAt: 0 });

test("Epley e1RM", () => {
  assert.equal(e1RM(100, 1), 100);
  assert.equal(Math.round(e1RM(100, 5)), 117);
  assert.equal(e1RM(0, 5), 0);
});

test("history ignores incomplete sets and sorts by date", () => {
  const h = exerciseHistory([w("2026-02-01", 100, 5), w("2026-01-01", 90, 5)], "bench");
  assert.equal(h.length, 2);
  assert.equal(h[0].date, "2026-01-01");
  assert.equal(h[1].sets.length, 1);
  assert.equal(workoutVolume(w("2026-02-01", 100, 5)), 500);
});

test("smart targets follow the LiftLog progression rules", () => {
  const heavy = { type: "heavy", repsMin: 3, repsMax: 5, sets: 3 };
  assert.deepEqual(suggestNextTarget(exerciseHistory([w("2026-01-01", 100, 5)], "bench"), heavy, 5).weight, 105);
  assert.equal(suggestNextTarget(exerciseHistory([w("2026-01-01", 100, 4)], "bench"), heavy, 5).reps, 5);
  const fail = { type: "failure", repsMin: 8, repsMax: 12, sets: 2 };
  assert.equal(suggestNextTarget(exerciseHistory([w("2026-01-01", 50, 6)], "bench"), fail, 2.5).hint, "repeat · below rep range");
  assert.equal(suggestNextTarget(exerciseHistory([w("2026-01-01", 50, 12)], "bench"), fail, 2.5).weight, 52.5);
  assert.equal(suggestNextTarget([], fail, 2.5), null);
});

test("plateau needs 5 sessions, 14+ day span and <4% spread", () => {
  const flat = ["2026-01-01", "2026-01-05", "2026-01-10", "2026-01-17", "2026-01-24"].map((d) => w(d, 100, 5));
  assert.equal(detectPlateau(exerciseHistory(flat, "bench")), true);
  const rising = flat.map((x, i) => w(x.date, 100 + i * 5, 5));
  assert.equal(detectPlateau(exerciseHistory(rising, "bench")), false);
  assert.equal(detectPlateau(exerciseHistory(flat.slice(0, 4), "bench")), false);
});

test("PR detection", () => {
  const h = exerciseHistory([w("2026-01-01", 100, 5), w("2026-01-08", 105, 5)], "bench");
  assert.equal(bestPR(h).weight, 105);
  assert.equal(isNewPR(h, "2026-01-08", { weight: 105, reps: 5, completed: true }), true);
  assert.equal(isNewPR(h, "2026-01-08", { weight: 95, reps: 5, completed: true }), false);
  assert.equal(isNewPR(h, "2026-01-01", { weight: 100, reps: 5, completed: true }), false, "first session is not a PR");
});
