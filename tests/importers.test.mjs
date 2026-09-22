import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectImport } from "../src/lib/csv.ts";

test("csv parser handles quotes, commas and CRLF", () => {
  const rows = parseCsv('a,b,c\r\n1,"x, y","he said ""hi"""\r\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "x, y", 'he said "hi"']]);
});

test("detects MyFitnessPal and Cronometer exports", () => {
  assert.equal(detectImport(parseCsv("Date,Meal,Calories,Fat (g),Protein (g)\n2026-01-01,Breakfast,400,10,30")), "mfp-nutrition");
  assert.equal(detectImport(parseCsv("Date,Weight\n2026-01-01,180")), "mfp-measurements");
  assert.equal(detectImport(parseCsv("Day,Group,Food Name,Amount,Energy (kcal),Protein (g)\n2026-01-01,Breakfast,Egg,2 large,143,12.6")), "cronometer-servings");
  assert.equal(detectImport(parseCsv("Day,Time,Group,Metric,Unit,Amount\n2026-01-01,08:00,Vitals,Weight,kg,80")), "cronometer-biometrics");
  assert.equal(detectImport(parseCsv("foo,bar\n1,2")), "unknown");
});
