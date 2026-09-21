import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, Trash2, Trophy } from "lucide-react";
import { db } from "@/db";
import type { Workout } from "@/db/types";
import { useProfile } from "@/hooks";
import { formatDay, formatDuration } from "@/lib/dates";
import { workoutVolume, workoutSetCount, exerciseHistory, isNewPR } from "@/lib/lifting";
import { Page } from "@/components/Shell";
import { Sheet, Confirm, EmptyState, Button, useToast } from "@/components/ui";
import { deleteWorkout } from "./trainRepo";

export default function HistoryTab() {
  const profile = useProfile();
  const toast = useToast();
  const workouts = useLiveQuery(() => db.workouts.filter((w) => !w.deletedAt).toArray(), []) ?? [];
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const photos = useLiveQuery(() => db.photos.filter((p) => !p.deletedAt && !!p.workoutId).toArray(), []) ?? [];
  const exName = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<Workout | null>(null);
  const [del, setDel] = useState<Workout | null>(null);
  const unit = profile.units.weight;

  const sorted = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return workouts
      .filter((w) => !ql || w.programDayName.toLowerCase().includes(ql) || w.date.includes(ql) || w.exercises.some((e) => (exName.get(e.exerciseId) ?? e.customName ?? "").toLowerCase().includes(ql)) || (w.sessionNotes ?? "").toLowerCase().includes(ql))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  }, [workouts, q, exName]);

  const byMonth = useMemo(() => {
    const m = new Map<string, Workout[]>();
    for (const w of sorted) { const k = w.date.slice(0, 7); (m.get(k) ?? m.set(k, []).get(k)!).push(w); }
    return [...m.entries()];
  }, [sorted]);

  const prsIn = (w: Workout) => {
    let n = 0;
    for (const ex of w.exercises) { const h = exerciseHistory(workouts, ex.exerciseId); if (ex.sets.some((s) => isNewPR(h, w.date, s))) n++; }
    return n;
  };

  return (
    <Page>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by day, exercise or note" className="field h-12 pl-10 text-[16px]" />
      </div>
      {workouts.length === 0 && <EmptyState title="No workouts yet" body="Finish a workout and it shows up here with volume, sets and PRs." />}
      {byMonth.map(([month, list]) => (
        <section key={month} className="flex flex-col gap-2">
          <div className="eyebrow">{new Date(month + "-15T12:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })} · {list.length}</div>
          {list.map((w) => {
            const prs = prsIn(w);
            return (
              <button key={w.id} onClick={() => setView(w)} className="card px-4 py-3 text-left active:bg-raised">
                <div className="flex items-center justify-between">
                  <div className="display text-[16px] font-semibold">{w.programDayName}</div>
                  <div className="text-[12px] text-ink-3">{formatDay(w.date)}</div>
                </div>
                <div className="mt-1 text-[12px] text-ink-2">{workoutSetCount(w)} sets · {Math.round(workoutVolume(w)).toLocaleString()} {unit} · {w.finishedAt && w.startedAt ? formatDuration((w.finishedAt - w.startedAt) / 1000) : "–"}{prs > 0 && <span className="ml-2 text-warn"><Trophy size={11} className="mr-0.5 inline" />{prs} PR{prs > 1 ? "s" : ""}</span>}</div>
                <div className="mt-1 truncate text-[12px] text-ink-3">{w.exercises.map((e) => exName.get(e.exerciseId) ?? e.customName ?? "?").join(" · ")}</div>
              </button>
            );
          })}
        </section>
      ))}

      <Sheet open={!!view} onClose={() => setView(null)} title={view ? `${view.programDayName} · ${formatDay(view.date, { relative: false })}` : ""}>
        {view && (
          <>
            <div className="mb-3 text-[13px] text-ink-2">{workoutSetCount(view)} sets · {Math.round(workoutVolume(view)).toLocaleString()} {unit} volume{view.finishedAt && view.startedAt ? ` · ${formatDuration((view.finishedAt - view.startedAt) / 1000)}` : ""}</div>
            <div className="divide-y divide-line">
              {view.exercises.map((ex, i) => {
                const h = exerciseHistory(workouts, ex.exerciseId);
                return (
                  <div key={i} className="py-2.5">
                    <div className="text-[15px] font-medium">{exName.get(ex.exerciseId) ?? ex.customName}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {ex.sets.map((s, j) => (
                        <span key={j} className={`tnum rounded-lg px-2 py-1 text-[13px] ${isNewPR(h, view.date, s) ? "bg-warn-soft text-warn" : "bg-raised text-ink-2"}`}>{s.weight}×{s.reps}{s.rpe ? <span className="text-ink-3"> @{s.rpe}</span> : ""}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {view.sessionNotes && <p className="mt-3 rounded-xl bg-raised p-3 text-[14px]">{view.sessionNotes}</p>}
            {photos.filter((p) => p.workoutId === view.id).length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">{photos.filter((p) => p.workoutId === view.id).map((p) => <img key={p.id} src={p.dataUrl} alt="" className="h-28 w-28 shrink-0 rounded-xl object-cover" />)}</div>
            )}
            <Button variant="danger" className="mt-4" onClick={() => { setDel(view); setView(null); }}><Trash2 size={16} /> Delete workout</Button>
          </>
        )}
      </Sheet>
      <Confirm open={!!del} title="Delete this workout?" body="It will be removed from history, stats and PRs." onCancel={() => setDel(null)} onConfirm={async () => { if (del) await deleteWorkout(del.id); setDel(null); toast("Workout deleted"); }} />
    </Page>
  );
}
