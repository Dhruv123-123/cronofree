import Dexie, { type EntityTable } from "dexie";
import type {
  Food, Recipe, DiaryEntry, SavedMeal, WaterLog, Fast, WeightEntry, Measurement, Photo, Profile,
  DayTargetOverride, Exercise, Program, Workout, Outbox, KV, Collection, Base,
} from "./types";

export class CronofreeDB extends Dexie {
  foods!: EntityTable<Food, "id">;
  recipes!: EntityTable<Recipe, "id">;
  entries!: EntityTable<DiaryEntry, "id">;
  savedMeals!: EntityTable<SavedMeal, "id">;
  water!: EntityTable<WaterLog, "id">;
  fasts!: EntityTable<Fast, "id">;
  weights!: EntityTable<WeightEntry, "id">;
  measurements!: EntityTable<Measurement, "id">;
  photos!: EntityTable<Photo, "id">;
  profile!: EntityTable<Profile, "id">;
  dayOverrides!: EntityTable<DayTargetOverride, "id">;
  exercises!: EntityTable<Exercise, "id">;
  programs!: EntityTable<Program, "id">;
  workouts!: EntityTable<Workout, "id">;
  outbox!: EntityTable<Outbox, "key">;
  kv!: EntityTable<KV, "key">;

  constructor() {
    super("cronofree");
    this.version(1).stores({
      foods: "id, source, barcode, search, favorite, lastUsedAt, useCount, updatedAt, deletedAt",
      recipes: "id, updatedAt, deletedAt",
      entries: "id, date, [date+mealId], foodId, updatedAt, deletedAt",
      savedMeals: "id, updatedAt, deletedAt",
      water: "id, date, updatedAt, deletedAt",
      fasts: "id, startAt, endAt, updatedAt, deletedAt",
      weights: "id, date, at, updatedAt, deletedAt",
      measurements: "id, date, kind, updatedAt, deletedAt",
      photos: "id, date, at, workoutId, updatedAt, deletedAt",
      profile: "id, updatedAt",
      dayOverrides: "id, date, updatedAt, deletedAt",
      exercises: "id, muscle, updatedAt, deletedAt",
      programs: "id, active, updatedAt, deletedAt",
      workouts: "id, date, programDayId, updatedAt, deletedAt",
      outbox: "key, collection, at",
      kv: "key",
    });
  }
}

export const db = new CronofreeDB();

export const COLLECTIONS: Collection[] = [
  "foods", "recipes", "entries", "savedMeals", "water", "fasts", "weights", "measurements",
  "photos", "profile", "dayOverrides", "exercises", "programs", "workouts",
];

export function table<T extends Base>(c: Collection): EntityTable<T, "id"> {
  return (db as unknown as Record<Collection, EntityTable<T, "id">>)[c];
}

/** Write helper: stamps updatedAt, upserts, and queues the row for sync. */
export async function put<T extends Base>(c: Collection, row: T, opts: { silent?: boolean } = {}): Promise<T> {
  // Silent writes are built-in seeds: stamp them low so any synced edit wins.
  const stamped = { ...row, updatedAt: opts.silent ? row.updatedAt || 1 : Date.now() };
  await db.transaction("rw", table<T>(c), db.outbox, async () => {
    await table<T>(c).put(stamped);
    if (!opts.silent) await db.outbox.put({ key: `${c}:${row.id}`, collection: c, id: row.id, at: stamped.updatedAt });
  });
  return stamped;
}

export async function putMany<T extends Base>(c: Collection, rows: T[], opts: { silent?: boolean } = {}): Promise<void> {
  const now = Date.now();
  const stamped = rows.map((r) => ({ ...r, updatedAt: opts.silent ? r.updatedAt || 1 : now }));
  await db.transaction("rw", table<T>(c), db.outbox, async () => {
    await table<T>(c).bulkPut(stamped);
    if (!opts.silent) await db.outbox.bulkPut(stamped.map((r) => ({ key: `${c}:${r.id}`, collection: c, id: r.id, at: now })));
  });
}

/** Soft delete (tombstone) so the deletion syncs to other devices. */
export async function remove(c: Collection, id: string): Promise<void> {
  const row = await table<Base>(c).get(id);
  if (!row) return;
  await put(c, { ...row, deletedAt: Date.now() });
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

/** Filter helper for live queries: drop tombstones. */
export const alive = <T extends Base>(rows: T[]): T[] => rows.filter((r) => !r.deletedAt);
