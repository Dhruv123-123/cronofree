/**
 * In-memory index of every food's searchable fields. Scanning IndexedDB per
 * keystroke is fine at 200 rows and painful at 25,000; scanning 25,000 short
 * strings in memory takes a few milliseconds. The index is built once per
 * session and patched on every write (see db/index.ts and the pack installers).
 */
import { db } from "@/db";
import type { Food } from "@/db/types";

export type IndexRow = Pick<Food, "id" | "name" | "search" | "source" | "brand" | "category" | "useCount" | "favorite" | "lastUsedAt" | "verified" | "deletedAt" | "vegan">;

let rows: Map<string, IndexRow> | null = null;
let building: Promise<Map<string, IndexRow>> | null = null;
let version = 0;
let dirty = false;
const listeners = new Set<() => void>();

/** Fold apostrophes/diacritics so "joe's", "joe’s" and "joes" all match. Apply the same to queries. */
export const normSearch = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['’`´]/g, "");
const project = (f: Food): IndexRow => ({ id: f.id, name: f.name, search: normSearch(f.search ?? f.name), source: f.source, brand: f.brand, category: f.category, useCount: f.useCount, favorite: f.favorite, lastUsedAt: f.lastUsedAt, verified: f.verified, deletedAt: f.deletedAt, vegan: f.vegan });

export function getSearchIndex(): Promise<Map<string, IndexRow>> {
  if (rows) return Promise.resolve(rows);
  if (building) return building;
  building = (async () => {
    let m: Map<string, IndexRow>;
    // Dexie's each() streams rows without materialising a 25k-element array.
    // A pack install that finishes mid-stream invalidates us again; loop until
    // a pass completes with no invalidation, or that install's rows are missed.
    do {
      dirty = false;
      m = new Map<string, IndexRow>();
      await db.foods.each((f) => { if (!f.deletedAt) m.set(f.id, project(f)); });
    } while (dirty);
    rows = m;
    building = null;
    bump();
    return m;
  })();
  return building;
}

export const searchIndexVersion = () => version;
function bump() { version++; for (const l of listeners) l(); }
export function subscribeSearchIndex(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

/** Patch after a write. Tombstoned rows are dropped. */
export function indexUpsert(foods: Food[]): void {
  if (!rows) return;
  for (const f of foods) { if (f.deletedAt) rows.delete(f.id); else rows.set(f.id, project(f)); }
  bump();
}

/** After a bulk install or sync, drop the index and rebuild it in idle time so the next search is instant. */
export function invalidateSearchIndex(): void {
  rows = null;
  dirty = true;
  bump();
  warmSearchIndex();
}

/** Kick off the build without waiting for it. Safe to call often. */
export function warmSearchIndex(): void {
  if (rows || building) return;
  // Start on the next tick: the build streams rows through IndexedDB cursor callbacks,
  // so it never blocks the UI for long, and finishing it before the first keystroke
  // beats waiting for an idle slot that a running pack install rarely yields.
  setTimeout(() => { getSearchIndex().catch(() => undefined); }, 0);
}

/** Read-only peek for debugging from the console: `__cronofreeIndex()`. */
(globalThis as { __cronofreeIndex?: () => unknown }).__cronofreeIndex = () => ({ size: rows?.size ?? null, building: !!building, dirty, version });
