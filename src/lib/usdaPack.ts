/**
 * Offline USDA pack: public/data/usda-pack.json, built by `npm run usda`.
 * Installed into IndexedDB on first launch (and whenever the pack version
 * changes) so search and the nutrient finder work with no network at all.
 */
import { db, kvGet, kvSet } from "@/db";
import type { Food, Serving } from "@/db/types";
import type { Nutrients } from "./nutrients";

interface PackFood { i: number; n: string; c: string; k: "S" | "F" | "V"; p: Nutrients; s: [string, number][] }
interface Pack { version: number; count: number; generatedAt: string; datasets: string[]; foods: PackFood[] }

export interface PackInfo { version: number; count: number; installedAt: number; generatedAt: string; datasets: string[] }

let running: Promise<PackInfo | null> | null = null;

/** Install progress, so open screens can refresh as foods arrive. */
export interface PackProgress { installing: boolean; done: number; total: number }
let progress: PackProgress = { installing: false, done: 0, total: 0 };
const listeners = new Set<(p: PackProgress) => void>();
function setProgress(p: PackProgress) { progress = p; for (const l of listeners) l(p); }
export const getPackProgress = () => progress;
export function subscribePack(l: (p: PackProgress) => void): () => void { listeners.add(l); l(progress); return () => { listeners.delete(l); }; }

export const getPackInfo = () => kvGet<PackInfo | null>("usdaPackInfo", null);

function toFood(f: PackFood): Food {
  const id = `usda_${f.i}`;
  const servings: Serving[] = f.s.map(([label, grams], i) => ({ id: `${id}_p${i}`, label, grams }));
  servings.push({ id: `${id}_g100`, label: "100 g", grams: 100 });
  return {
    id,
    name: f.n,
    source: "usda",
    sourceId: String(f.i),
    per100: f.p,
    servings,
    defaultServingId: servings[0].id,
    category: f.c || undefined,
    verified: f.k !== "V",
    search: f.n.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, ""),
    updatedAt: 1,
    useCount: 0,
  };
}

/** Install or refresh the pack. Resolves null when no pack is shipped. */
export function installUsdaPack(opts: { force?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<PackInfo | null> {
  if (running) return running;
  running = (async () => {
    try {
      const info = await getPackInfo();
      const head = await fetch("/data/usda-pack.json", { method: "HEAD", cache: "no-cache" }).catch(() => null);
      if (!head || !head.ok) return info;
      const r = await fetch("/data/usda-pack.json");
      if (!r.ok) return info;
      const pack = (await r.json()) as Pack;
      if (!opts.force && info && info.version === pack.version && info.count === pack.count) return info;

      const CHUNK = 500;
      setProgress({ installing: true, done: 0, total: pack.foods.length });
      for (let i = 0; i < pack.foods.length; i += CHUNK) {
        const slice = pack.foods.slice(i, i + CHUNK).map(toFood);
        const existing = await db.foods.bulkGet(slice.map((f) => f.id));
        const rows = slice.map((f, j) => {
          const cur = existing[j];
          if (!cur) return f;
          // keep the user's marks and any synced edit, refresh the reference data
          return { ...cur, per100: f.per100, servings: cur.updatedAt > 1 ? cur.servings : f.servings, category: f.category, verified: f.verified, name: cur.updatedAt > 1 ? cur.name : f.name, search: cur.updatedAt > 1 ? cur.search : f.search, deletedAt: cur.deletedAt ?? null };
        });
        await db.foods.bulkPut(rows);
        opts.onProgress?.(Math.min(pack.foods.length, i + CHUNK), pack.foods.length);
        setProgress({ installing: true, done: Math.min(pack.foods.length, i + CHUNK), total: pack.foods.length });
      }
      const next: PackInfo = { version: pack.version, count: pack.count, installedAt: Date.now(), generatedAt: pack.generatedAt, datasets: pack.datasets };
      await kvSet("usdaPackInfo", next);
      return next;
    } finally {
      running = null;
      setProgress({ installing: false, done: progress.total, total: progress.total });
    }
  })();
  return running;
}
