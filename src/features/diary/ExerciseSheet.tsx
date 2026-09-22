import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, Flame } from "lucide-react";
import { db } from "@/db";
import type { ISODate } from "@/db/types";
import { ACTIVITIES, kcalBurned, searchActivities, type Activity } from "@/lib/exerciseDb";
import { logQuick } from "@/lib/foodRepo";
import { Sheet, Button, Field, Input, NumberInput, Chip, useToast } from "@/components/ui";

/** MyFitnessPal / Cronometer-style exercise logging: pick an activity, set minutes, calories from MET × body weight. */
export default function ExerciseSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: ISODate }) {
  const toast = useToast();
  const latest = useLiveQuery(() => db.weights.orderBy("at").reverse().filter((w) => !w.deletedAt).first(), []);
  const kg = latest?.kg ?? 75;
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [sel, setSel] = useState<Activity | null>(null);
  const [minutes, setMinutes] = useState<number | "">(30);
  const [manualName, setManualName] = useState("");
  const [manualKcal, setManualKcal] = useState<number | "">("");
  const [mode, setMode] = useState<"activity" | "manual">("activity");
  useEffect(() => { if (open) { setSel(null); setQ(""); setMode("activity"); } }, [open]);
  const groups = useMemo(() => ["all", ...new Set(ACTIVITIES.map((a) => a.group))], []);
  const list = searchActivities(q).filter((a) => group === "all" || a.group === group);
  const kcal = sel ? kcalBurned(sel.met, kg, Number(minutes) || 0) : 0;

  async function submit() {
    if (mode === "manual") {
      if (!manualKcal) return;
      await logQuick({ date, mealId: "exercise", name: manualName.trim() || "Exercise", nutrients: { kcal: Number(manualKcal) }, kind: "exercise" });
    } else {
      if (!sel || !kcal) return;
      await logQuick({ date, mealId: "exercise", name: `${sel.name} · ${minutes} min`, nutrients: { kcal }, kind: "exercise" });
    }
    toast("Exercise added"); onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise" noPad footer={<Button full variant="primary" disabled={mode === "manual" ? !manualKcal : !sel || !kcal} onClick={submit}>{mode === "manual" ? `Add ${manualKcal || 0} kcal` : sel ? `Add ${kcal} kcal · ${sel.name.split(",")[0]}` : "Pick an activity"}</Button>}>
      <div className="px-5 pb-5">
        <div className="mb-3 flex gap-2">
          <Chip active={mode === "activity"} onClick={() => setMode("activity")}>From activity</Chip>
          <Chip active={mode === "manual"} onClick={() => setMode("manual")}>Enter calories</Chip>
        </div>
        {mode === "manual" ? (
          <div className="flex flex-col gap-3">
            <Field label="What did you do?"><Input placeholder="e.g. 5 km run from my watch" value={manualName} onChange={(e) => setManualName(e.target.value)} /></Field>
            <Field label="Calories burned"><NumberInput value={manualKcal} onChange={setManualKcal} suffix="kcal" /></Field>
          </div>
        ) : sel ? (
          <div className="flex flex-col gap-3">
            <button onClick={() => setSel(null)} className="text-left text-[13px] text-accent">← Choose another activity</button>
            <div className="display text-[18px] font-semibold">{sel.name}</div>
            <div className="text-[12px] text-ink-3">{sel.met} MET · {sel.group} · using {Math.round(kg * 10) / 10} kg body weight</div>
            <Field label="Duration"><NumberInput value={minutes} onChange={setMinutes} suffix="min" /></Field>
            <div className="flex gap-2">{[15, 30, 45, 60, 90].map((m) => <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>{m} min</Chip>)}</div>
            <div className="flex items-center gap-3 rounded-xl bg-raised p-3"><Flame size={20} className="text-accent" /><div><div className="tnum display text-[26px] font-semibold leading-none">{kcal} <span className="text-[13px] font-normal text-ink-3">kcal</span></div><div className="text-[12px] text-ink-3">Gross estimate (MET × kg × hours). Added to today's budget.</div></div></div>
          </div>
        ) : (
          <>
            <div className="relative"><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activities" className="field h-12 pl-10 text-[16px]" /></div>
            <div className="scroll-x -mx-5 mt-2 flex gap-2 px-5">{groups.map((g) => <Chip key={g} active={group === g} onClick={() => setGroup(g)}>{g === "all" ? "All" : g}</Chip>)}</div>
            <div className="mt-1 divide-y divide-line">
              {list.map((a) => (
                <button key={a.id} onClick={() => setSel(a)} className="flex w-full items-center justify-between py-3 text-left active:bg-raised">
                  <span className="text-[14px]">{a.name}<span className="ml-2 text-[12px] text-ink-3">{a.group}</span></span>
                  <span className="tnum text-[12px] text-ink-2">{kcalBurned(a.met, kg, 30)} kcal / 30 min</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
