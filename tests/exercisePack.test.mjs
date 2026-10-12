import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toPackExercise, packToExercise, validateExercisePack, defaultScheme, exerciseMatches, exerciseScore } from "../src/lib/exerciseTransform.ts";
import { ALIASES, EXTRAS } from "../src/lib/exerciseAliases.ts";

test("exercise pack on disk is valid and large", () => {
  const pack = JSON.parse(readFileSync("public/data/exercises.json", "utf8"));
  assert.equal(pack.type, "exercises");
  assert.ok(pack.count >= 800, `only ${pack.count}`);
  assert.deepEqual(validateExercisePack(pack), []);
  const names = pack.exercises.map((e) => e.n.toLowerCase());
  for (const must of ["barbell squat", "deadlift", "pull-up", "bench press", "romanian deadlift", "lateral raise"]) assert.ok(names.some((n) => n.includes(must.split(" ")[0])), `missing ${must}`);
});

test("transform maps muscles, equipment and schemes", () => {
  const row = toPackExercise({ id: "X", name: " Barbell Squat ", mechanic: "compound", equipment: "barbell", primaryMuscles: ["quadriceps"], secondaryMuscles: ["glutes"], instructions: [" Set up. ", ""], category: "strength", level: "beginner" });
  assert.equal(row.n, "Barbell Squat"); assert.equal(row.m, "legs"); assert.equal(row.eq, "barbell"); assert.deepEqual(row.ins, ["Set up."]);
  const ex = packToExercise(row);
  assert.equal(ex.id, "exp_X"); assert.equal(ex.scheme.type, "heavy"); assert.equal(ex.increment, 5); assert.equal(ex.updatedAt, 1); assert.equal(ex.source, "pack");
  assert.equal(defaultScheme(toPackExercise({ id: "s", name: "Stretch", category: "stretching", equipment: "body only", primaryMuscles: ["hamstrings"] })).scheme.type, "feel");
  assert.equal(defaultScheme(toPackExercise({ id: "c", name: "Curl", mechanic: "isolation", equipment: "dumbbell", primaryMuscles: ["biceps"] })).increment, 2.5);
  assert.equal(toPackExercise({ id: "n", name: "Neck", primaryMuscles: ["neck"], equipment: "foam roll" }).eq, "other");
});

test("aliases point at real rows and gym names resolve", () => {
  const pack = JSON.parse(readFileSync("public/data/exercises.json", "utf8"));
  const ids = new Set(pack.exercises.map((e) => e.id));
  for (const id of Object.keys(ALIASES)) assert.ok(ids.has(id), `alias target missing: ${id}`);
  for (const x of EXTRAS) assert.ok(ids.has(x.id) && x.instructions.length >= 2, `extra missing/short: ${x.id}`);
  const rows = pack.exercises.map(packToExercise);
  const find = (q) => rows.filter((e) => exerciseMatches(e, q.toLowerCase().split(/\s+/))).map((e) => e.name);
  assert.ok(find("bulgarian").includes("Bulgarian Split Squat"));
  assert.ok(find("ohp").includes("Standing Military Press"));
  assert.ok(find("rdl").includes("Romanian Deadlift"));
  assert.ok(find("lat pulldown").includes("Wide-Grip Lat Pulldown"));
  assert.ok(find("hip thrust").includes("Barbell Hip Thrust"));
  assert.ok(find("lateral raise dumbbell").includes("Side Lateral Raise"));
  assert.ok(find("pec deck").includes("Butterfly"));
  assert.ok(pack.count >= 900, `count ${pack.count}`);
  const top = (q) => rows.map((e) => ({ e, s: exerciseScore(e, q.split(" ")) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))[0]?.e.name;
  assert.equal(top("rdl"), "Romanian Deadlift");
  assert.equal(top("ohp"), "Standing Military Press");
  assert.equal(top("bench press"), "Barbell Bench Press - Medium Grip");
  assert.equal(top("squat"), "Barbell Squat");
});
