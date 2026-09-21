import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Trophy } from "lucide-react";
import { db } from "@/db";
import { useProfile } from "@/hooks";
import { exerciseHistory, bestPR, detectPlateau, weeklyVolumeByMuscle, workoutVolume } from "@/lib/lifting";
import { addDays, today, formatShort, startOfWeek } from "@/lib/dates";
import { Page } from "@/components/Shell";
import { TrendChart, Columns } from "@/components/charts";
import { Stat, Segmented, EmptyState } from "@/components/ui";

export default function StatsTab() {
  const profile = useProfile();
  const unit = profile.units.weight;
  const workouts = useLiveQuery(() => db.workouts.filter((w) => !w.deletedAt).toArray(), []) ?? [];
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deletedAt).toArray(), []) ?? [];
  const withHistory = useMemo(() => exercises.map((e) => ({ e, h: exerciseHistory(workouts, e.id) })).filter((x) => x.h.length > 0).sort((a, b) => b.h.length - a.h.length), [exercises, workouts]);
  const [sel, setSel] = useState<string>("");
  const [metric, setMetric] = useState<"e1rm" | "topWeight" | "volume">("e1rm");
  const current = withHistory.find((x) => x.e.id === sel) ?? withHistory[0];
  const history = current?.h ?? [];
  const pr = bestPR(history);
  const plateau = detectPlateau(history);

  const weekly = useMemo(() => {
    const out: Record<string, unknown>[] = [];
    const start = startOfWeek(addDays(today(), -7 * 11), profile.startOfWeek);
    for (let i = 0; i < 12; i++) {
      const ws = addDays(start, i * 7), we = addDays(ws, 6);
      const list = workouts.filter((w) => w.date >= ws && w.date <= we);
      out.push({ date: ws, workouts: list.length, volume: Math.round(list.reduce((a, w) => a + workoutVolume(w), 0)) });
    }
    return out;
  }, [workouts, profile.startOfWeek]);

  const muscle = useMemo(() => weeklyVolumeByMuscle(workouts, exercises, addDays(today(), -6)), [workouts, exercises]);
  const totalThisWeek = workouts.filter((w) => w.date >= addDays(today(), -6)).length;
  const streak = useMemo(() => {
    let n = 0; let cursor = startOfWeek(today(), profile.startOfWeek);
    while (workouts.some((w) => w.date >= cursor && w.date <= addDays(cursor, 6))) { n++; cursor = addDays(cursor, -7); if (n > 200) break; }
    return n;
  }, [workouts, profile.startOfWeek]);

  if (!workouts.length) return <Page><EmptyState title="No data yet" body="Stats appear after your first workout: e1RM trends, PRs, weekly volume and muscle balance." /></Page>;

  return (
    <Page>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="This week" value={totalThisWeek} unit="sessions" />
        <Stat label="Week streak" value={streak} unit="wks" />
        <Stat label="All time" value={workouts.length} unit="workouts" />
      </div>

      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold">Exercise progress</h2>
          <select value={current?.e.id ?? ""} onChange={(e) => setSel(e.target.value)} className="field !h-9 !w-auto !py-0 !text-[13px]">
            {withHistory.map((x) => <option key={x.e.id} value={x.e.id}>{x.e.name}</option>)}
          </select>
        </div>
        <Segmented value={metric} onChange={setMetric} options={[{ value: "e1rm", label: "e1RM" }, { value: "topWeight", label: "Top weight" }, { value: "volume", label: "Volume" }]} className="mb-3 w-full" />
        <TrendChart data={history.map((h) => ({ date: h.date, value: Math.round(h[metric]) }))} series={[{ key: "value", name: metric === "e1rm" ? "Est. 1RM" : metric === "topWeight" ? "Top set" : "Volume", color: "var(--accent)", dot: true }]} unit="" fmtValue={(v) => `${v} ${unit}`} />
        {pr && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-raised px-3 py-2 text-[13px]">
            <Trophy size={14} className="text-warn" /> Best: {pr.weight} {unit} × {pr.reps} on {formatShort(pr.date)} · e1RM {Math.round(pr.e1rm)} {unit}
            <span className="ml-auto text-ink-3">{history.length} sessions</span>
          </div>
        )}
        {plateau && <p className="mt-2 text-[12px] text-warn">Plateau detected: est. 1RM has moved less than 4 % across the last three sessions (two weeks or more).</p>}
        <p className="mt-2 text-[12px] text-ink-3">Estimated 1RM uses the Epley formula on your best completed set of each session.</p>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-[16px] font-semibold">Weekly volume · last 12 weeks</h2>
        <Columns data={weekly} dataKey="volume" color="var(--protein)" unit="" fmtValue={(v) => `${v.toLocaleString()} ${unit}`} />
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-[16px] font-semibold">Sets per muscle · last 7 days</h2>
        <p className="mb-3 text-[12px] text-ink-3">A common guide is 10–20 hard sets per muscle per week.</p>
        <div className="flex flex-col gap-2">
          {["chest", "back", "shoulders", "arms", "legs", "core", "other"].map((m) => {
            const v = muscle[m] ?? 0;
            return (
              <div key={m} className="flex items-center gap-3 text-[13px]">
                <span className="w-20 capitalize text-ink-2">{m}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--ring-track)]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (v / 20) * 100)}%`, background: v >= 10 ? "var(--good)" : "var(--accent)" }} /></div>
                <span className="tnum w-6 text-right font-medium">{v}</span>
              </div>
            );
          })}
        </div>
      </section>
    </Page>
  );
}
