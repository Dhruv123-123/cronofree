import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import type { Exercise, Workout, DraftExercise, DraftSet } from "@/db/types";
import { finalizeDraft, workoutToDraftExercises } from "@/lib/finalizeWorkout";
import { Button, Sheet, Confirm, Input, Field, useToast } from "@/components/ui";
import { AddExerciseSheet } from "./LogTab";
import { saveWorkout } from "./trainRepo";

const blankSet = (): DraftSet => ({ weight: "", reps: "", rpe: "", completed: true });

/**
 * Edit a saved workout: date, name, notes, every set, add/remove exercises.
 * Saves through the normal repo so the change syncs like any other edit.
 */
export function WorkoutEditor({ workout, exercises, unit, onClose, onSaved }: { workout: Workout | null; exercises: Exercise[]; unit: string; onClose: () => void; onSaved?: (w: Workout) => void }) {
  const toast = useToast();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<DraftExercise[]>([]);
  const [addEx, setAddEx] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [dirty, setDirty] = useState(false);
  const exById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  useEffect(() => {
    if (!workout) return;
    setDate(workout.date); setName(workout.programDayName); setNotes(workout.sessionNotes ?? ""); setRows(workoutToDraftExercises(workout.exercises)); setDirty(false);
  }, [workout]);

  const patch = (fn: (r: DraftExercise[]) => DraftExercise[]) => { setRows(fn); setDirty(true); };
  const patchSet = (exI: number, setI: number, p: Partial<DraftSet>) => patch((r) => r.map((ex, i) => (i === exI ? { ...ex, sets: ex.sets.map((s, j) => (j === setI ? { ...s, ...p } : s)) } : ex)));
  const result = useMemo(() => finalizeDraft(rows), [rows]);

  async function save() {
    if (!workout) return;
    if (!result.exercises.length) { toast("Add at least one set with reps", "warn"); return; }
    const w: Workout = { ...workout, date, programDayName: name.trim() || workout.programDayName, sessionNotes: notes.trim() || undefined, exercises: result.exercises };
    await saveWorkout(w);
    toast("Workout updated");
    onSaved?.(w);
    onClose();
  }
  const tryClose = () => (dirty ? setConfirmClose(true) : onClose());

  return (
    <>
      <Sheet open={!!workout} onClose={tryClose} title="Edit workout" size="lg" footer={<div className="flex gap-2"><Button full onClick={tryClose}>Cancel</Button><Button full variant="primary" onClick={save}>Save changes</Button></div>}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date"><input type="date" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setDirty(true); } }} className="field" /></Field>
            <Field label="Name"><Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></Field>
          </div>
          {rows.map((ex, exI) => {
            const def = exById.get(ex.exerciseId);
            return (
              <section key={`${ex.exerciseId}-${exI}`} className="card p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[15px] font-medium">{def?.name ?? ex.customName ?? "Unknown exercise"}</div>
                  <button aria-label="Remove exercise" onClick={() => patch((r) => r.filter((_, i) => i !== exI))} className="text-ink-3 hover:text-bad"><Trash2 size={15} /></button>
                </div>
                <div className="grid grid-cols-[28px_1fr_1fr_64px_28px] items-center gap-2 text-[11px] text-ink-3"><span>#</span><span>{unit}</span><span>reps</span><span>RPE</span><span /></div>
                <div className="mt-1 flex flex-col gap-1.5">
                  {ex.sets.map((s, setI) => {
                    const bad = s.reps === "" || !(parseFloat(s.reps) > 0);
                    return (
                      <div key={setI} className="grid grid-cols-[28px_1fr_1fr_64px_28px] items-center gap-2">
                        <span className="tnum text-[13px] text-ink-3">{setI + 1}</span>
                        <input type="number" inputMode="decimal" placeholder="0" value={s.weight} onChange={(e) => patchSet(exI, setI, { weight: e.target.value })} className="field tnum !h-10 text-center" aria-label={`Set ${setI + 1} weight`} />
                        <input type="number" inputMode="numeric" placeholder="reps" value={s.reps} onChange={(e) => patchSet(exI, setI, { reps: e.target.value })} className={`field tnum !h-10 text-center ${bad ? "!border-warn" : ""}`} aria-label={`Set ${setI + 1} reps`} />
                        <input type="number" inputMode="decimal" placeholder="–" value={s.rpe} min={5} max={10} step={0.5} onChange={(e) => patchSet(exI, setI, { rpe: e.target.value })} className="field tnum !h-10 text-center !text-[13px]" aria-label={`Set ${setI + 1} RPE`} />
                        <button aria-label="Remove set" onClick={() => patch((r) => r.map((x, i) => (i === exI ? { ...x, sets: x.sets.filter((_, j) => j !== setI) } : x)))} className="text-ink-3 hover:text-bad"><Trash2 size={13} /></button>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => patch((r) => r.map((x, i) => (i === exI ? { ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] ?? blankSet()) }] } : x)))} className="mt-2 flex items-center gap-1 text-[13px] font-medium text-accent"><Plus size={14} /> Add set</button>
              </section>
            );
          })}
          <Button onClick={() => setAddEx(true)}><Plus size={16} /> Add exercise</Button>
          {(result.skipped.length > 0 || result.droppedExercises.length > 0) && (
            <div className="flex items-start gap-2 rounded-xl bg-warn-soft p-3 text-[13px] text-warn"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div>{result.skipped.length > 0 && <div>{result.skipped.length} set{result.skipped.length > 1 ? "s" : ""} without reps will be left out.</div>}{result.droppedExercises.length > 0 && <div>{result.droppedExercises.map((i) => exById.get(rows[i].exerciseId)?.name ?? rows[i].customName ?? "an exercise").join(", ")} ha{result.droppedExercises.length > 1 ? "ve" : "s"} no sets and will be removed.</div>}</div></div>
          )}
          <Field label="Session notes"><textarea rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} className="field" /></Field>
        </div>
      </Sheet>
      <AddExerciseSheet open={addEx} onClose={() => setAddEx(false)} exercises={exercises} onPick={(e) => { patch((r) => [...r, { exerciseId: e.id, sets: Array.from({ length: Math.max(1, e.scheme.sets) }, blankSet) }]); setAddEx(false); }} />
      <Confirm open={confirmClose} title="Discard changes?" body="Your edits to this workout will be lost." confirmLabel="Discard" onCancel={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); onClose(); }} />
    </>
  );
}
