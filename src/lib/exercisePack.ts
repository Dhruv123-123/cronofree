/**
 * Offline exercise catalog (public/data/exercises.json, built by `npm run exercises`
 * from free-exercise-db). Installed once per pack version into the `exercises`
 * table. Only missing rows are added, so edits, deletions (tombstones) and
 * synced changes on the user's side always win; everything lives in IndexedDB.
 */
import { db, kvGet, kvSet, putMany } from "@/db";
import { packToExercise, type ExercisePack } from "./exerciseTransform";

export interface ExercisePackInfo { version: number; count: number; installedAt: number }
export const getExercisePackInfo = () => kvGet<ExercisePackInfo | null>("exercisePackInfo", null);

let running: Promise<ExercisePackInfo | null> | null = null;
export function installExercisePack(opts: { force?: boolean } = {}): Promise<ExercisePackInfo | null> {
  if (running) return running;
  running = (async () => {
    try {
      const info = await getExercisePackInfo();
      const r = await fetch("/data/exercises.json", { cache: "no-cache" }).catch(() => null);
      if (!r || !r.ok || !/json/i.test(r.headers.get("content-type") ?? "")) return info;
      const pack = (await r.json()) as ExercisePack;
      if (pack.type !== "exercises" || !Array.isArray(pack.exercises)) return info;
      if (!opts.force && info && info.version === pack.version && info.count === pack.count) return info;
      const rows = pack.exercises.map(packToExercise);
      const CHUNK = 300;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const existing = await db.exercises.bulkGet(slice.map((e) => e.id));
        // never touch a row the user has (even a tombstoned one); refresh catalog text on untouched rows
        const fresh = slice.filter((_, j) => !existing[j]);
        const refresh = slice.flatMap((e, j) => { const cur = existing[j]; return cur && cur.updatedAt <= 1 && !cur.deletedAt ? [{ ...cur, instructions: e.instructions, primary: e.primary, secondary: e.secondary, equipment: e.equipment, level: e.level, mechanic: e.mechanic, category: e.category, aliases: e.aliases }] : []; });
        if (fresh.length) await putMany("exercises", fresh, { silent: true });
        if (refresh.length) await putMany("exercises", refresh, { silent: true });
      }
      const next: ExercisePackInfo = { version: pack.version, count: pack.count, installedAt: Date.now() };
      await kvSet("exercisePackInfo", next);
      return next;
    } finally { running = null; }
  })();
  return running;
}
