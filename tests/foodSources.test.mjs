import test from "node:test";
import assert from "node:assert/strict";
import { offToFood, usdaToFood } from "../src/lib/foodSources.ts";

test("Open Food Facts product maps to per-100 g with unit conversion", () => {
  const f = offToFood({ code: "3017624010701", product_name: "Nutella", brands: "Ferrero, Nutella", serving_size: "15 g", serving_quantity: 15, serving_quantity_unit: "g", product_quantity: 400,
    nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sugars_100g: 56.3, "saturated-fat_100g": 10.6, salt_100g: 0.107, calcium_100g: 0.108 } });
  assert.equal(f.brand, "Ferrero");
  assert.equal(f.per100.kcal, 539);
  assert.equal(Math.round(f.per100.sodium), 43, "salt g → sodium mg");
  assert.equal(f.per100.calcium, 108, "calcium g → mg");
  assert.equal(f.servings[0].grams, 15);
  assert.equal(f.servings.some((s) => s.grams === 400), true);
  assert.equal(f.barcode, "3017624010701");
});

test("OFF product without a name or energy is rejected", () => {
  assert.equal(offToFood({ code: "1", nutriments: {} }), null);
  assert.equal(offToFood({ code: "1", product_name: "Mystery", nutriments: {} }), null);
});

test("USDA food maps nutrient numbers, IU vitamin D and portions", () => {
  const f = usdaToFood({ fdcId: 173944, description: "Bananas, raw", dataType: "SR Legacy",
    foodNutrients: [{ nutrientNumber: "208", value: 89, unitName: "KCAL" }, { nutrientNumber: "203", value: 1.09 }, { nutrientNumber: "205", value: 22.8 }, { nutrientNumber: "328", value: 40, unitName: "IU" }, { nutrientNumber: "621", value: 0.1 }, { nutrientNumber: "851", value: 0.2 }],
    foodPortions: [{ gramWeight: 118, portionDescription: "1 medium (7\" to 7-7/8\" long)" }, { gramWeight: 150, amount: 1, measureUnit: { name: "cup" }, modifier: "sliced" }] });
  assert.equal(f.per100.kcal, 89);
  assert.equal(f.per100.vitD, 1, "40 IU → 1 µg");
  assert.equal(Math.round(f.per100.omega3 * 10) / 10, 0.3, "ALA + DHA");
  assert.equal(f.servings[0].grams, 118);
  assert.equal(f.servings[1].label, "1 cup sliced");
  assert.equal(f.verified, true);
});
