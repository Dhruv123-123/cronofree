import { useEffect, useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, put } from "@/db";
import type { Profile } from "@/db/types";
import { defaultProfile } from "@/lib/bootstrap";
import { subscribeSync, type SyncStatus, scheduleSync } from "@/lib/sync";
import { getSearchIndex, subscribeSearchIndex, type IndexRow } from "@/lib/searchIndex";
import type { Food } from "@/db/types";

export function useProfile(): Profile {
  const p = useLiveQuery(() => db.profile.get("me"), []);
  return p ?? defaultProfile();
}

export async function updateProfile(patch: Partial<Profile>): Promise<void> {
  const cur = (await db.profile.get("me")) ?? defaultProfile();
  await put("profile", { ...cur, ...patch });
  scheduleSync();
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    h();
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}

export const useIsDesktop = () => useMediaQuery("(min-width: 900px)");

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>({ state: "off", lastSyncAt: null, pending: 0 });
  useEffect(() => subscribeSync(setS), []);
  return s;
}

export function useTheme(theme: Profile["theme"]) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0f1213" : "#f4f5f3"));
  }, [theme]);
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback((n: T | ((p: T) => T)) => {
    setV((p) => {
      const next = typeof n === "function" ? (n as (p: T) => T)(p) : n;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [key]);
  return [v, set];
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** All foods' searchable fields from the in-memory index (cheap; re-renders on writes). */
export function useIndexRows(): IndexRow[] | undefined {
  const [rows, setRows] = useState<IndexRow[] | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => { getSearchIndex().then((m) => { if (alive) setRows([...m.values()]); }); };
    load();
    const unsub = subscribeSearchIndex(load);
    return () => { alive = false; unsub(); };
  }, []);
  return rows;
}

/** Full Food rows for a bounded list of ids (keeps order). */
export function useFoodsByIds(ids: string[]): Food[] {
  const [foods, setFoods] = useState<Food[]>([]);
  const key = ids.join("|");
  useEffect(() => {
    let alive = true;
    if (!ids.length) { setFoods([]); return; }
    db.foods.bulkGet(ids).then((rows) => { if (alive) setFoods(rows.filter((f): f is Food => !!f)); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return foods;
}
