/**
 * Build public/data/exercises.json from free-exercise-db (public domain,
 * https://github.com/yuhonas/free-exercise-db): 870+ strength, stretching,
 * plyometric, powerlifting, olympic and strongman movements with muscles,
 * equipment and step-by-step instructions.
 *
 *   npm run exercises
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { toPackExercise, validateExercisePack } from "../src/lib/exerciseTransform.ts";
import { ALIASES, EXTRAS } from "../src/lib/exerciseAliases.ts";

const SRC = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const CACHE = ".cache/fedb/exercises.json";
const OUT = "public/data/exercises.json";
const VERSION = 2;

await mkdir(".cache/fedb", { recursive: true });
let raw;
if (existsSync(CACHE)) raw = await readFile(CACHE, "utf8");
else {
  const r = await fetch(SRC);
  if (!r.ok) throw new Error(`fetch ${SRC}: ${r.status}`);
  raw = await r.text();
  await writeFile(CACHE, raw);
}
const src = JSON.parse(raw);
const seen = new Set();
const known = new Set(src.map((x) => x.id));
const orphan = Object.keys(ALIASES).filter((id) => !known.has(id));
if (orphan.length) { console.error("aliases for unknown ids:", orphan.join(", ")); process.exit(1); }
const exercises = [...src, ...EXTRAS].filter((x) => x?.id && x?.name && !seen.has(x.id) && seen.add(x.id)).map((x) => toPackExercise(x, ALIASES[x.id])).sort((a, b) => a.n.localeCompare(b.n));
const pack = { app: "cronofree", type: "exercises", version: VERSION, generatedAt: new Date().toISOString(), count: exercises.length, source: "free-exercise-db (public domain) + Cronofree extras", exercises };
const errs = validateExercisePack(pack);
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
await writeFile(OUT, JSON.stringify(pack));
const by = (k) => Object.entries(exercises.reduce((a, e) => ((a[e[k]] = (a[e[k]] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
console.log(`${OUT}: ${exercises.length} exercises (${(JSON.stringify(pack).length / 1024).toFixed(0)} KB)\n  muscle: ${by("m")}\n  equipment: ${by("eq")}`);
