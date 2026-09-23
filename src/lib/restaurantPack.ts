/** Offline restaurant pack (public/data/restaurants.json): vegetarian menu items near campus and select SF spots. */
import { db, kvGet, kvSet } from "@/db";
import { restaurantFoods, type RestaurantPack } from "./restaurantTransform";

export interface RestaurantInfo { version: number; restaurants: number; items: number; installedAt: number }
export const getRestaurantInfo = () => kvGet<RestaurantInfo | null>("restaurantPackInfo", null);

let running: Promise<RestaurantInfo | null> | null = null;
export function installRestaurantPack(opts: { force?: boolean } = {}): Promise<RestaurantInfo | null> {
  if (running) return running;
  running = (async () => {
    try {
      const info = await getRestaurantInfo();
      const r = await fetch("/data/restaurants.json", { cache: "no-cache" }).catch(() => null);
      if (!r || !r.ok || !/json/i.test(r.headers.get("content-type") ?? "")) return info;
      const pack = (await r.json()) as RestaurantPack;
      const foods = restaurantFoods(pack);
      if (!opts.force && info && info.version === pack.version && info.items === foods.length) return info;
      const existing = await db.foods.bulkGet(foods.map((f) => f.id));
      const rows = foods.map((f, i) => { const cur = existing[i]; return cur ? { ...f, favorite: cur.favorite, useCount: cur.useCount, lastUsedAt: cur.lastUsedAt, updatedAt: cur.updatedAt, deletedAt: cur.deletedAt ?? null } : f; });
      await db.foods.bulkPut(rows);
      // remove items that disappeared from the pack (only untouched ones)
      const ids = new Set(foods.map((f) => f.id));
      const stale = await db.foods.where("source").equals("restaurant").filter((f) => !ids.has(f.id) && (f.useCount ?? 0) === 0 && !f.favorite).primaryKeys();
      if (stale.length) await db.foods.bulkDelete(stale);
      const next: RestaurantInfo = { version: pack.version, restaurants: pack.restaurants.length, items: foods.length, installedAt: Date.now() };
      await kvSet("restaurantPackInfo", next);
      return next;
    } finally { running = null; }
  })();
  return running;
}
