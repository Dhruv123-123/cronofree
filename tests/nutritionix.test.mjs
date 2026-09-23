import test from "node:test";
import assert from "node:assert/strict";
import { nutritionixToFood } from "../src/lib/foodSources.ts";

test("Nutritionix items map per-serving attr ids to per-100 g", () => {
  const f = nutritionixToFood({ food_name: "egg", serving_qty: 2, serving_unit: "large", serving_weight_grams: 100, nf_calories: 143, full_nutrients: [{ attr_id: 208, value: 143 }, { attr_id: 203, value: 12.6 }, { attr_id: 307, value: 142 }] }, "common");
  assert.equal(f.per100.kcal, 143);
  assert.equal(f.per100.protein, 12.6);
  assert.equal(f.servings[0].label, "2 large");
  const b = nutritionixToFood({ food_name: "protein bar", brand_name: "Quest", nix_item_id: "abc", serving_weight_grams: 60, full_nutrients: [{ attr_id: 208, value: 190 }] }, "branded");
  assert.equal(Math.round(b.per100.kcal), 317);
  assert.equal(b.brand, "Quest");
  assert.equal(nutritionixToFood({ food_name: "mystery" }, "common"), null);
});
