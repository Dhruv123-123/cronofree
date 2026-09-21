import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search } from "lucide-react";
import { db } from "@/db";
import type { Exercise } from "@/db/types";
import { MUSCLE_GROUPS } from "@/lib/liftingDefaults";
import { exerciseHistory, bestPR } from "@/lib/lifting";
import { useProfile } from "@/hooks";
import { Page } from "@/components/Shell";
import { Button, Sheet, Input, Field, NumberInput, Segmented, Confirm, Chip, useToast } from "@/components/ui";
import { saveExercise, deleteExercise, newExercise } from "./trainRepo";

export default function LibraryTab() {
  const profile = useProfile();
  const toast = useToast();
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deletedAt).toArray(), []) ?? [];
  const workouts = useLiveQuery(() => db.workouts.filter((w) => !w.deletedAt).toArray(), []) ?? [];
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("all");
  const [edit, setEdit] = useState<Exercise | null>(null);
  const [del, setDel] = useState<Exercise | null>(null);
  const list = useMemo(() => exercises.filter((e) => (muscle === "all" || e.muscle === muscle) && (!q || e.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name)), [exercises, q, muscle]);

  return (
    <Page>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className="field h-12 pl-10 text-[16px]" />
        </div>
        <Button variant="primary" onClick={() => setEdit(newExercise(q.trim() || "New exercise"))}><Plus size={16} /> New</Button>
      </div>
      <div className="scroll-x -mx-4 flex gap-2 px-4 md:mx-0 md:px-0">
        <Chip active={muscle === "all"} onClick={() => setMuscle("all")}>All</Chip>
        {MUSCLE_GROUPS.map((m) => <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)} className="capitalize">{m}</Chip>)}
      </div>
      <div className="card divide-y divide-line px-4">
        {list.map((e) => {
          const pr = bestPR(exerciseHistory(workouts, e.id));
          return (
            <button key={e.id} onClick={() => setEdit(e)} className="flex w-full items-center gap-3 py-3 text-left active:bg-raised">
              <div className="min-w-0 flex-1">
                <div className="text-[15px]">{e.name}</div>
                <div className="text-[12px] text-ink-3"><span className="capitalize">{e.muscle}</span> · {e.scheme.sets} × {e.scheme.repsMin}–{e.scheme.repsMax} · {e.scheme.type} · +{e.increment} {profile.units.weight}{e.notes ? ` · ${e.notes}` : ""}</div>
              </div>
              {pr && <div className="tnum text-right text-[12px] text-ink-2">PR<br /><span className="font-semibold text-ink">{pr.weight}×{pr.reps}</span></div>}
            </button>
          );
        })}
      </div>

      <ExerciseEditor ex={edit} onClose={() => setEdit(null)} unit={profile.units.weight} onSave={async (e) => { await saveExercise(e); setEdit(null); toast("Saved"); }} onDelete={(e) => { setEdit(null); setDel(e); }} />
      <Confirm open={!!del} title={`Delete “${del?.name}”?`} body="It is removed from programs. Past workouts keep their sets." onCancel={() => setDel(null)} onConfirm={async () => { if (del) await deleteExercise(del.id); setDel(null); }} />
    </Page>
  );
}

export function ExerciseEditor({ ex, onClose, onSave, onDelete, unit }: { ex: Exercise | null; onClose: () => void; onSave: (e: Exercise) => void; onDelete?: (e: Exercise) => void; unit: string }) {
  const [draft, setDraft] = useState<Exercise | null>(null);
  const d = draft && ex && draft.id === ex.id ? draft : ex;
  const set = (patch: Partial<Exercise>) => d && setDraft({ ...d, ...patch });
  if (!d) return null;
  return (
    <Sheet open={!!ex} onClose={onClose} title={ex?.updatedAt ? "Edit exercise" : "New exercise"} footer={
      <div className="flex gap-2">{onDelete && ex?.updatedAt ? <Button variant="danger" onClick={() => onDelete(d)}>Delete</Button> : null}<Button full variant="primary" disabled={!d.name.trim()} onClick={() => onSave({ ...d, name: d.name.trim() })}>Save</Button></div>
    }>
      <div className="flex flex-col gap-3">
        <Field label="Name"><Input autoFocus value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Muscle group"><select value={d.muscle} onChange={(e) => set({ muscle: e.target.value as Exercise["muscle"] })} className="field capitalize">{MUSCLE_GROUPS.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
        <Field label="Progression style" hint="Heavy: add weight once you hit the top of the range. Failure: +1 rep until the top, then add weight. Feel: no targets.">
          <Segmented value={d.scheme.type} onChange={(v) => set({ scheme: { ...d.scheme, type: v } })} options={[{ value: "heavy", label: "Heavy" }, { value: "failure", label: "To failure" }, { value: "feel", label: "By feel" }]} className="w-full" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Sets"><NumberInput value={d.scheme.sets} onChange={(v) => set({ scheme: { ...d.scheme, sets: Math.max(1, Number(v) || 1) } })} /></Field>
          <Field label="Reps min"><NumberInput value={d.scheme.repsMin} onChange={(v) => set({ scheme: { ...d.scheme, repsMin: Number(v) || 1 } })} /></Field>
          <Field label="Reps max"><NumberInput value={d.scheme.repsMax} onChange={(v) => set({ scheme: { ...d.scheme, repsMax: Number(v) || 1 } })} /></Field>
        </div>
        <Field label={`Weight increment (${unit})`}><NumberInput value={d.increment} step={0.5} onChange={(v) => set({ increment: Number(v) || 0 })} /></Field>
        <Field label="Notes"><Input value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} placeholder="Seat setting, grip, cue…" /></Field>
      </div>
    </Sheet>
  );
}
