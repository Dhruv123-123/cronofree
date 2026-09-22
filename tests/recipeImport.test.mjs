import test from "node:test";
import assert from "node:assert/strict";
import { parseIngredient, gramsFor } from "../src/lib/ingredientParse.ts";

test("parses quantities, fractions, ranges and units", () => {
  assert.deepEqual(parseIngredient("2 cups cooked rice"), { raw: "2 cups cooked rice", qty: 2, unit: "cup", name: "cooked rice" });
  const half = parseIngredient("½ tsp salt");
  assert.equal(half.qty, 0.5); assert.equal(half.unit, "tsp"); assert.equal(half.name, "salt");
  const mixed = parseIngredient("1 1/2 lb chicken breast, cubed");
  assert.equal(mixed.qty, 1.5); assert.equal(mixed.unit, "lb"); assert.equal(mixed.name, "chicken breast");
  const range = parseIngredient("2-3 cloves garlic, minced");
  assert.equal(range.qty, 2.5); assert.equal(range.unit, "clove"); assert.equal(range.name, "garlic");
  const metric = parseIngredient("1 cup (200 g) sugar");
  assert.equal(metric.qty, 200); assert.equal(metric.unit, "g");
  const bare = parseIngredient("Salt to taste");
  assert.equal(bare.qty, 1); assert.equal(bare.unit, "");
});

test("grams follow the unit, the food's servings, or a sane default", () => {
  assert.equal(gramsFor({ raw: "", qty: 2, unit: "tbsp", name: "" }, null), 30);
  assert.equal(gramsFor({ raw: "", qty: 1, unit: "lb", name: "" }, null), 454);
  const banana = { servings: [{ id: "a", label: "1 medium", grams: 118 }, { id: "b", label: "100 g", grams: 100 }], isLiquid: false };
  assert.equal(gramsFor({ raw: "", qty: 2, unit: "", name: "banana" }, banana), 236);
  assert.equal(gramsFor({ raw: "", qty: 1, unit: "", name: "" }, null), 100);
});
