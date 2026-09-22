import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, NotebookPen } from "lucide-react";
import { db, put } from "@/db";
import type { ISODate, Profile } from "@/db/types";
import { KCAL_PER_KG } from "@/lib/energy";
import { kgToUnit, fmt } from "@/lib/units";
import { scheduleSync } from "@/lib/sync";
import { Sheet, Button, useToast } from "@/components/ui";
import type { DayModel } from "@/lib/dayModel";

async function upsertOverride(date: ISODate, patch: { note?: string; completed?: boolean }) {
  const cur = await db.dayOverrides.where("date").equals(date).filter((o) => !o.deletedAt).first();
  await put("dayOverrides", { id: cur?.id ?? `dov_${date}`, date, targets: cur?.targets ?? {}, note: cur?.note, completed: cur?.completed, ...patch, updatedAt: 0, deletedAt: null });
  scheduleSync();
}

/** Diary notes for the day (Cronometer) and MyFitnessPal's "Complete diary" projection. */
export default function DayExtras({ date, day, profile, expenditure }: { date: ISODate; day: DayModel; profile: Profile; expenditure: number }) {
  const toast = useToast();
  const ov = useLiveQuery(() => db.dayOverrides.where("date").equals(date).filter((o) => !o.deletedAt).first(), [date]);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [complete, setComplete] = useState(false);
  useEffect(() => { setNote(ov?.note ?? ""); }, [ov?.note, date]);
  const eaten = day.totals.kcal ?? 0;
  const net = eaten - expenditure - day.exerciseKcal;
  const fiveWeeksKg = (net * 35) / KCAL_PER_KG;
  const unit = profile.units.weight;

  return (
    <>
      <section className="card p-4">
        <div className="flex items-center gap-2 text-[15px] font-semibold"><NotebookPen size={18} className="text-ink-3" /> Notes</div>
        {editing ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="field" placeholder="Hunger, sleep, digestion, how training felt…" />
            <div className="flex gap-2"><Button size="sm" onClick={() => { setEditing(false); setNote(ov?.note ?? ""); }}>Cancel</Button><Button size="sm" variant="primary" onClick={async () => { await upsertOverride(date, { note: note.trim() || undefined }); setEditing(false); toast("Note saved"); }}>Save</Button></div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="mt-1 block w-full text-left text-[14px] text-ink-2">{ov?.note ? ov.note : <span className="text-ink-3">Add a note for this day…</span>}</button>
        )}
      </section>

      <button onClick={() => setComplete(true)} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${ov?.completed ? "border-good/40 bg-good-soft/40" : "border-dashed border-line-strong"}`}>
        <CheckCircle2 size={20} className={ov?.completed ? "text-good" : "text-ink-3"} />
        <div className="flex-1 text-[14px]"><span className="font-medium">{ov?.completed ? "Day completed" : "Complete this day"}</span><div className="text-[12px] text-ink-3">{ov?.completed ? "Tap to see the projection again." : "See what today's intake means for the next five weeks."}</div></div>
      </button>

      <Sheet open={complete} onClose={() => setComplete(false)} title="Day complete" footer={<Button full variant="primary" onClick={async () => { await upsertOverride(date, { completed: true }); setComplete(false); toast("Day marked complete"); }}>{ov?.completed ? "Done" : "Mark complete"}</Button>}>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-raised p-3 text-center"><div className="tnum display text-[22px] font-semibold">{fmt(eaten)}</div><div className="text-[11px] text-ink-3">eaten</div></div>
          <div className="rounded-xl bg-raised p-3 text-center"><div className="tnum display text-[22px] font-semibold">{fmt(expenditure + day.exerciseKcal)}</div><div className="text-[11px] text-ink-3">burned</div></div>
          <div className={`rounded-xl bg-raised p-3 text-center ${net > 0 ? "text-warn" : "text-good"}`}><div className="tnum display text-[22px] font-semibold">{net > 0 ? "+" : ""}{fmt(net)}</div><div className="text-[11px] text-ink-3">net</div></div>
        </div>
        <p className="mt-4 text-[15px]">If every day were like today, in five weeks you'd be about <span className="tnum font-semibold">{Math.abs(kgToUnit(fiveWeeksKg, unit)).toFixed(1)} {unit} {fiveWeeksKg > 0 ? "heavier" : "lighter"}</span>.</p>
        <p className="mt-2 text-[13px] text-ink-2">Protein {fmt(day.totals.protein)} / {day.targets.protein} g · fiber {fmt(day.totals.fiber)} / {day.nutrientTargets.fiber} g · {day.entries.filter((e) => e.kind !== "exercise").length} items logged.</p>
        <p className="mt-2 text-[12px] text-ink-3">Projection uses {profile.expenditureMode === "adaptive" ? "your adaptive" : "your"} expenditure estimate and 7,700 kcal per kg. Real change is slower and noisier than a straight line.</p>
      </Sheet>
    </>
  );
}
