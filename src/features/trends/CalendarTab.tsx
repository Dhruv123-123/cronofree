import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/db";
import { useProfile } from "@/hooks";
import { today, addDays, parseISODate, toISODate } from "@/lib/dates";
import { intakeMap } from "@/lib/checkin";
import { Page } from "@/components/Shell";
import { Stat, IconButton } from "@/components/ui";

/** Month view of logged days with adherence colouring and streaks (MyFitnessPal / Cronometer calendar). */
export default function CalendarTab() {
  const profile = useProfile();
  const nav = useNavigate();
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const first = `${month}-01`;
  const d0 = parseISODate(first);
  const daysInMonth = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  const last = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const entries = useLiveQuery(() => db.entries.where("date").between(addDays(first, -400), last, true, true).filter((e) => !e.deletedAt).toArray(), [first, last]);
  const workouts = useLiveQuery(() => db.workouts.where("date").between(first, last, true, true).filter((w) => !w.deletedAt).toArray(), [first, last]) ?? [];
  const completed = useLiveQuery(() => db.dayOverrides.where("date").between(first, last, true, true).filter((o) => !o.deletedAt && !!o.completed).toArray(), [first, last]) ?? [];
  const intake = useMemo(() => intakeMap(entries ?? []), [entries]);
  const workoutDays = new Set(workouts.map((w) => w.date));
  const completedDays = new Set(completed.map((c) => c.date));
  const target = profile.targets.kcal;

  const { current, longest, loggedThisMonth } = useMemo(() => {
    let cur = 0; let d = today();
    if (!(intake.get(d) ?? 0)) d = addDays(d, -1); // today may not be logged yet
    while ((intake.get(d) ?? 0) > 300) { cur++; d = addDays(d, -1); if (cur > 2000) break; }
    let best = 0, run = 0;
    const days = [...intake.entries()].filter(([, k]) => k > 300).map(([x]) => x).sort();
    for (let i = 0; i < days.length; i++) { run = i > 0 && addDays(days[i - 1], 1) === days[i] ? run + 1 : 1; best = Math.max(best, run); }
    const inMonth = [...intake.entries()].filter(([x, k]) => x >= first && x <= last && k > 300).length;
    return { current: cur, longest: best, loggedThisMonth: inMonth };
  }, [intake, first, last]);

  const startPad = (d0.getDay() - profile.startOfWeek + 7) % 7;
  const cells: (string | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  const dow = profile.startOfWeek === 1 ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  const shift = (n: number) => { const d = parseISODate(first); d.setMonth(d.getMonth() + n); setMonth(toISODate(d).slice(0, 7)); };
  const color = (kcal: number) => kcal === 0 ? "var(--raised)" : kcal > target * 1.1 ? "var(--bad)" : kcal < target * 0.9 ? "var(--warn)" : "var(--good)";

  return (
    <Page>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Current streak" value={current} unit="days" tone={current >= 7 ? "good" : undefined} />
        <Stat label="Longest streak" value={longest} unit="days" />
        <Stat label="Logged this month" value={`${loggedThisMonth}/${daysInMonth}`} unit="days" />
      </div>
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <IconButton label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={20} /></IconButton>
          <h2 className="text-[16px] font-semibold">{d0.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
          <IconButton label="Next month" onClick={() => shift(1)}><ChevronRight size={20} /></IconButton>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-ink-3">{dow.map((d, i) => <div key={i}>{d}</div>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const kcal = intake.get(d) ?? 0;
            const future = d > today();
            return (
              <button key={d} disabled={future} onClick={() => nav(d === today() ? "/" : `/?d=${d}`)} className="relative flex aspect-square flex-col items-center justify-center rounded-lg text-[13px] disabled:opacity-30" style={{ background: future ? "transparent" : color(kcal), color: kcal ? "#fff" : "var(--ink-2)" }}>
                <span className={`tnum ${d === today() ? "font-bold underline" : ""}`}>{parseISODate(d).getDate()}</span>
                {kcal > 0 && <span className="tnum text-[9px] opacity-90">{Math.round(kcal)}</span>}
                <span className="absolute bottom-0.5 flex gap-0.5">{workoutDays.has(d) && <span className="h-1 w-1 rounded-full bg-white/90" />}{completedDays.has(d) && <span className="h-1 w-1 rounded-full bg-white/60" />}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-3">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--good)]" />within 10 % of target</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--warn)]" />under</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--bad)]" />over</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ink-3" />workout</span>
        </div>
      </section>
    </Page>
  );
}
