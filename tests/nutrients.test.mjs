import test from "node:test";
import assert from "node:assert/strict";
import { addNutrients, scaleNutrients, sumNutrients, netCarbs, macroKcal, referenceTargets } from "../src/lib/nutrients.ts";

test("scale and add nutrients", () => {
  const per100 = { kcal: 100, protein: 10, fiber: 2 };
  const half = scaleNutrients(per100, 0.5);
  assert.equal(half.kcal, 50);
  assert.equal(half.protein, 5);
  const sum = sumNutrients([half, half, { carbs: 3 }]);
  assert.equal(sum.kcal, 100);
  assert.equal(sum.carbs, 3);
  assert.equal(addNutrients({}, per100, 2).fiber, 4);
});

test("net carbs and Atwater energy", () => {
  assert.equal(netCarbs({ carbs: 30, fiber: 8 }), 22);
  assert.equal(netCarbs({ carbs: 2, fiber: 5 }), 0);
  assert.equal(macroKcal({ protein: 10, carbs: 10, fat: 10 }), 170);
});

test("reference targets differ by sex and scale fiber with energy", () => {
  const m = referenceTargets("male", 30, 2500);
  const f = referenceTargets("female", 30, 2000);
  assert.equal(m.iron, 8);
  assert.equal(f.iron, 18);
  assert.equal(m.fiber, 35);
  assert.equal(f.fiber, 28);
  assert.equal(m.sodium, 2300);
});
