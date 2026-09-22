import test from "node:test";
import assert from "node:assert/strict";
import { kcalBurned, searchActivities, ACTIVITIES } from "../src/lib/exerciseDb.ts";

test("MET formula and search", () => {
  assert.equal(kcalBurned(8, 75, 30), 300);
  assert.equal(kcalBurned(3.5, 60, 60), 210);
  assert.ok(searchActivities("cycl").length >= 5);
  assert.equal(searchActivities("").length, ACTIVITIES.length);
  assert.ok(new Set(ACTIVITIES.map((a) => a.id)).size === ACTIVITIES.length, "ids unique");
});
