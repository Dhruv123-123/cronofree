import type { ISODate } from "@/db/types";

export function toISODate(d: Date = new Date()): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export const today = (): ISODate => toISODate(new Date());

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function weekday(iso: ISODate): number {
  return parseISODate(iso).getDay();
}

export function formatDay(iso: ISODate, opts: { relative?: boolean; long?: boolean } = {}): string {
  const t = today();
  if (opts.relative !== false) {
    if (iso === t) return "Today";
    if (iso === addDays(t, -1)) return "Yesterday";
    if (iso === addDays(t, 1)) return "Tomorrow";
  }
  const d = parseISODate(iso);
  return d.toLocaleDateString(undefined, opts.long
    ? { weekday: "long", month: "long", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric" });
}

export function formatShort(iso: ISODate): string {
  return parseISODate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function rangeDays(endIso: ISODate, count: number): ISODate[] {
  const out: ISODate[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(endIso, -i));
  return out;
}

export function startOfWeek(iso: ISODate, startDay: 0 | 1): ISODate {
  const wd = weekday(iso);
  const diff = (wd - startDay + 7) % 7;
  return addDays(iso, -diff);
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
