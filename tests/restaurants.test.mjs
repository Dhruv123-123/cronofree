import test from "node:test";
import assert from "node:assert/strict";
import { restaurantFoods, validatePack } from "../src/lib/restaurantTransform.ts";

const pack = { version: 1, restaurants: [{ name: "Chipotle", city: "Berkeley", area: "Telegraph", nutritionSource: "https://chipotle.com", items: [
  { name: "Sofritas Bowl", serving: "1 bowl", grams: 400, vegan: true, basis: "published", kcal: 600, protein: 20, carbs: 80, fat: 20, fiber: 12, sodium: 1100 },
  { name: "Chicken Bowl", serving: "1 bowl", grams: 400, basis: "published", kcal: 600, protein: 40, carbs: 60, fat: 18 },
  { name: "Guacamole", serving: "1 side", grams: 113, basis: "published", kcal: 230, protein: 2, carbs: 8, fat: 22 },
] }] };

test("pack items become per-100 g foods with the serving as default", () => {
  const foods = restaurantFoods(pack);
  const bowl = foods.find((f) => f.id === "rest_chipotle_sofritas_bowl");
  assert.equal(bowl.brand, "Chipotle");
  assert.equal(bowl.source, "restaurant");
  assert.equal(Math.round(bowl.per100.kcal), 150);
  assert.equal(bowl.servings[0].grams, 400);
  assert.equal(bowl.verified, true);
  assert.equal(bowl.vegan, true);
  assert.match(bowl.search, /chipotle/);
  assert.match(bowl.note, /published/i);
});

test("validation flags non-vegetarian items and bad numbers", () => {
  const problems = validatePack(pack);
  assert.ok(problems.some((p) => /Chicken Bowl.*non-vegetarian/.test(p)));
  const bad = { version: 1, restaurants: [{ name: "X", city: "Berkeley", items: [{ name: "Thing", serving: "1", grams: 100, basis: "published", kcal: 900, protein: 1, carbs: 1, fat: 1 }] }] };
  assert.ok(validatePack(bad).some((p) => /disagree/.test(p)));
});
