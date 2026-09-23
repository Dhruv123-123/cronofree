/**
 * Local-first sync. Every write goes to IndexedDB first and lands in an outbox.
 * syncNow() pushes the outbox to the server and pulls everything newer than the
 * last server sequence we saw. Conflicts resolve last-writer-wins on updatedAt;
 * deletions are tombstones so they propagate.
 */
import { db, COLLECTIONS, table, kvGet, kvSet } from "@/db";
import type { Base, Collection } from "@/db/types";
import { invalidateSearchIndex } from "./searchIndex";

export interface SyncConfig {
  url: string; // "" = same origin
  token: string;
  autoSync: boolean;
  lastSeq: number;
  lastSyncAt: number | null;
}

export type SyncState = "idle" | "syncing" | "ok" | "error" | "off";

export interface SyncStatus {
  state: SyncState;
  message?: string;
  lastSyncAt: number | null;
  pending: number;
}

const DEFAULT: SyncConfig = { url: "", token: "", autoSync: true, lastSeq: 0, lastSyncAt: null };

type Listener = (s: SyncStatus) => void;
const listeners = new Set<Listener>();
let status: SyncStatus = { state: "off", lastSyncAt: null, pending: 0 };
let inFlight: Promise<SyncStatus> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function emit(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function subscribeSync(l: Listener): () => void {
  listeners.add(l);
  l(status);
  return () => listeners.delete(l);
}
export const getSyncStatus = () => status;

export async function getSyncConfig(): Promise<SyncConfig> {
  return { ...DEFAULT, ...(await kvGet<Partial<SyncConfig>>("sync", {})) };
}
export async function setSyncConfig(patch: Partial<SyncConfig>): Promise<SyncConfig> {
  const next = { ...(await getSyncConfig()), ...patch };
  await kvSet("sync", next);
  emit({ state: next.token ? status.state === "off" ? "idle" : status.state : "off", lastSyncAt: next.lastSyncAt });
  return next;
}

export async function refreshPending(): Promise<number> {
  const n = await db.outbox.count();
  emit({ pending: n });
  return n;
}

function apiUrl(cfg: SyncConfig, path: string): string {
  const base = cfg.url.trim().replace(/\/+$/, "");
  return `${base}${path}`;
}

export async function testConnection(cfg: Pick<SyncConfig, "url" | "token">): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch(apiUrl(cfg as SyncConfig, "/api/health"), { headers: { Authorization: `Bearer ${cfg.token}` } });
    if (r.status === 401) return { ok: false, message: "Server reached, but the token is wrong." };
    if (!r.ok) return { ok: false, message: `Server answered ${r.status}.` };
    const j = (await r.json()) as { ok?: boolean; name?: string; rows?: number };
    return { ok: !!j.ok, message: j.ok ? `Connected to ${j.name ?? "server"} · ${j.rows ?? 0} rows stored` : "Unexpected reply." };
  } catch (e) {
    return { ok: false, message: `Could not reach server: ${(e as Error).message}` };
  }
}

interface Change { collection: Collection; row: Base }
interface SyncResponse { seq: number; changes: Change[]; accepted?: number }

export async function syncNow(opts: { silent?: boolean } = {}): Promise<SyncStatus> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const cfg = await getSyncConfig();
    if (!cfg.token) {
      emit({ state: "off", message: "Sync not set up" });
      return status;
    }
    emit({ state: "syncing", message: opts.silent ? status.message : "Syncing…" });
    try {
      const outbox = await db.outbox.toArray();
      const changes: Change[] = [];
      for (const o of outbox) {
        const row = await table<Base>(o.collection).get(o.id);
        if (row) changes.push({ collection: o.collection, row });
      }
      const r = await fetch(apiUrl(cfg, "/api/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ since: cfg.lastSeq, changes }),
      });
      if (r.status === 401) throw new Error("Token rejected by server");
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const j = (await r.json()) as SyncResponse;

      // apply incoming with last-writer-wins
      const pushedKeys = new Set(outbox.map((o) => o.key));
      let applied = 0;
      const byCollection = new Map<Collection, Base[]>();
      for (const c of j.changes) {
        if (!COLLECTIONS.includes(c.collection)) continue;
        const arr = byCollection.get(c.collection) ?? [];
        arr.push(c.row);
        byCollection.set(c.collection, arr);
      }
      for (const [c, rows] of byCollection) {
        const t = table<Base>(c);
        await db.transaction("rw", t, async () => {
          const existing = await t.bulkGet(rows.map((r) => r.id));
          const toPut: Base[] = [];
          rows.forEach((row, i) => {
            const cur = existing[i];
            if (!cur || (row.updatedAt ?? 0) > (cur.updatedAt ?? 0)) toPut.push(row);
          });
          if (toPut.length) await t.bulkPut(toPut);
          applied += toPut.length;
        });
      }
      if (byCollection.has("foods")) invalidateSearchIndex();
      // clear outbox entries we pushed (unless they were modified again during the request)
      const now = await db.outbox.toArray();
      const clear = now.filter((o) => pushedKeys.has(o.key) && o.at <= (outbox.find((x) => x.key === o.key)?.at ?? 0)).map((o) => o.key);
      if (clear.length) await db.outbox.bulkDelete(clear);

      const at = Date.now();
      await setSyncConfig({ lastSeq: j.seq, lastSyncAt: at });
      emit({ state: "ok", message: `Synced · ${changes.length} sent, ${applied} received`, lastSyncAt: at, pending: await db.outbox.count() });
    } catch (e) {
      emit({ state: "error", message: (e as Error).message, pending: await db.outbox.count() });
    }
    return status;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Called after local writes: sync a few seconds later if auto-sync is on. */
export function scheduleSync(delayMs = 4000): void {
  void refreshPending();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const cfg = await getSyncConfig();
    if (cfg.token && cfg.autoSync && navigator.onLine) void syncNow({ silent: true });
  }, delayMs);
}

/** Wire up auto-sync triggers once at app start. */
export function startAutoSync(): () => void {
  const onVisible = () => { if (document.visibilityState === "visible") scheduleSync(500); };
  const onOnline = () => scheduleSync(500);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  const interval = setInterval(() => scheduleSync(0), 3 * 60 * 1000);
  void (async () => {
    const cfg = await getSyncConfig();
    emit({ state: cfg.token ? "idle" : "off", lastSyncAt: cfg.lastSyncAt, pending: await db.outbox.count() });
    if (cfg.token && cfg.autoSync) scheduleSync(1500);
  })();
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
  };
}

/** Full snapshot for export. */
export async function exportAll(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { app: "cronofree", version: 1, exportedAt: new Date().toISOString() };
  for (const c of COLLECTIONS) out[c] = await table<Base>(c).toArray();
  return out;
}

/** Import a snapshot (merge, last-writer-wins). */
export async function importAll(data: Record<string, unknown>, opts: { queue?: boolean } = { queue: true }): Promise<number> {
  let n = 0;
  for (const c of COLLECTIONS) {
    const rows = data[c];
    if (!Array.isArray(rows)) continue;
    const t = table<Base>(c);
    const valid = rows.filter((r): r is Base => r && typeof r === "object" && typeof (r as Base).id === "string");
    const existing = await t.bulkGet(valid.map((r) => r.id));
    const toPut = valid.filter((r, i) => !existing[i] || (r.updatedAt ?? 0) > (existing[i]!.updatedAt ?? 0));
    if (toPut.length) {
      await t.bulkPut(toPut);
      if (opts.queue) await db.outbox.bulkPut(toPut.map((r) => ({ key: `${c}:${r.id}`, collection: c, id: r.id, at: Date.now() })));
      n += toPut.length;
    }
  }
  invalidateSearchIndex();
  scheduleSync();
  return n;
}

/** Wipe everything local (server untouched). */
export async function wipeLocal(): Promise<void> {
  await db.delete();
  await db.open();
}
