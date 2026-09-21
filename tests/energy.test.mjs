import test from "node:test";
import assert from "node:assert/strict";
import { bmr, formulaTdee, kcalTargetFor, defaultMacros, weightTrend, estimateExpenditure, targetsForDate } from "../src/lib/energy.ts";
import { addDays, today } from "../src/lib/dates.ts";

test("Mifflin-St Jeor", () => {
  assert.equal(Math.round(bmr("male", 80, 180, 30)), 1780);
  assert.equal(Math.round(bmr("female", 60, 165, 30)), 1320);
  const year = new Date().getFullYear() - 30;
  assert.equal(formulaTdee({ sex: "male", heightCm: 180, birthYear: year, activity: "moderate" }, 80), Math.round(1780 * 1.55));
});

test("calorie target from rate", () => {
  assert.equal(kcalTargetFor(2500, -0.5), 2500 - 550);
  assert.equal(kcalTargetFor(1500, -2), 1200, "never below 1200");
  const m = defaultMacros(2000, 80, "lose");
  assert.equal(m.protein, 160);
  assert.equal(m.protein * 4 + m.carbs * 4 + m.fat * 9 <= 2000 + 4, true);
});

test("weight trend smooths and carries across gaps", () => {
  const d0 = "2026-01-01";
  const entries = [80, 81, 79, 80.5].map((kg, i) => ({ id: String(i), date: addDays(d0, i * 2), at: i, kg, updatedAt: 0 }));
  const trend = weightTrend(entries, 0.5);
  assert.equal(trend.length, 7, "one point per calendar day incl. gaps");
  assert.equal(trend[0].trend, 80);
  assert.equal(trend[1].kg, undefined);
  assert.equal(trend[1].trend, 80, "gap days carry the trend");
  assert.equal(trend[2].trend, 80.5);
});

test("adaptive expenditure falls back with thin data and estimates from balance", () => {
  const thin = estimateExpenditure({ intakeByDay: new Map(), trend: [], fallbackTdee: 2400 });
  assert.equal(thin.tdee, 2400);
  assert.equal(thin.confidence, "low");
  // 21 days eating 2000 with a perfectly flat trend → TDEE ≈ 2000 (shrunk toward fallback)
  const t = today();
  const intake = new Map();
  const trend = [];
  for (let i = 20; i >= 0; i--) { const d = addDays(t, -i); intake.set(d, 2000); trend.push({ date: d, kg: 80, trend: 80 }); }
  const est = estimateExpenditure({ intakeByDay: intake, trend, fallbackTdee: 2400 });
  assert.equal(est.confidence, "high");
  assert.equal(est.tdee, 2000);
});

test("weekday overrides and day overrides layer on top of defaults", () => {
  const profile = { targets: { kcal: 2000, protein: 150, carbs: 200, fat: 60 }, weekdayTargets: { 1: { kcal: 2300, carbs: 275 } } };
  const monday = "2026-09-21";
  assert.deepEqual(targetsForDate(profile, monday), { kcal: 2300, protein: 150, carbs: 275, fat: 60 });
  assert.deepEqual(targetsForDate(profile, "2026-09-22"), profile.targets);
  assert.equal(targetsForDate(profile, monday, { kcal: 1800 }).kcal, 1800);
});
