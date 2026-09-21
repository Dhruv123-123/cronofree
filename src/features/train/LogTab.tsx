import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, Copy, Plus, Trash2, Trophy, TrendingDown, Camera, Image as ImageIcon, X, Timer } from "lucide-react";
import { db } from "@/db";
import type { Exercise, Program, Workout, WorkoutDraft, DraftExercise, DraftSet, WorkoutSet } from "@/db/types";
import { useProfile } from "@/hooks";
import { useNow } from "@/hooks";
import { today, formatShort, formatDuration } from "@/lib/dates";
import { uid } from "@/lib/id";
import { e1RM, exerciseHistory, suggestNextTarget, detectPlateau, bestPR, lastWorkoutForDay, isNewPR } from "@/lib/lifting";
import { compressImage, addPhoto } from "@/lib/photos";
import { Page } from "@/components/Shell";
import { Button, Sheet, Confirm, Input, Chip, useToast, EmptyState, Field } from "@/components/ui";
import { loadDraft, saveDraft } from "./draft";
import { saveWorkout, getTrainPrefs, saveExercise, newExercise, type TrainPrefs, DEFAULT_TRAIN_PREFS } from "./trainRepo";
import type { RestTimer } from "./useRestTimer";
import { MUSCLE_GROUPS } from "@/lib/liftingDefaults";

const blankSet = (): DraftSet => ({ weight: "", reps: "", rpe: "", completed: false });

export default function LogTab({ timer }: { timer: RestTimer }) {
  const profile = useProfile();
  const toast = useToast();
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deletedAt).toArray(), []) ?? [];
  const programs = useLiveQuery(() => db.programs.filter((p) => !p.deletedAt).toArray(), []) ?? [];
  const workouts = useLiveQuery(() => db.workouts.filter((w) => !w.deletedAt).toArray(), []) ?? [];
  const [prefs, setPrefs] = useState<TrainPrefs>(DEFAULT_TRAIN_PREFS);
  useEffect(() => { getTrainPrefs().then(setPrefs); }, []);
  const [draft, setDraft] = useState<WorkoutDraft | null>(() => loadDraft());
  useEffect(() => saveDraft(draft), [draft]);
  const [confirmChange, setConfirmChange] = useState(false);
  const [finish, setFinish] = useState(false);
  const [addEx, setAddEx] = useState(false);
  const exById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const unit = profile.units.weight;

  const active = programs.find((p) => p.active) ?? programs[0];

  function startDay(program: Program | null, dayId: string | null) {
    const day = program?.days.find((d) => d.id === dayId);
    const exs: DraftExercise[] = (day?.exerciseIds ?? []).map((id) => {
      const ex = exById.get(id);
      const n = ex?.scheme.sets ?? 2;
      return { exerciseId: id, sets: Array.from({ length: n }, blankSet) };
    });
    setDraft({ date: today(), startedAt: Date.now(), programId: program?.id, programDayId: day?.id ?? "custom", programDayName: day?.name ?? "Custom workout", exercises: exs, sessionNotes: "", currentExerciseIdx: 0, pendingPhotos: [] });
    window.scrollTo({ top: 0 });
  }

  const hasProgress = !!draft && (draft.sessionNotes.trim().length > 0 || draft.pendingPhotos.length > 0 || draft.exercises.some((ex) => ex.sets.some((s) => s.completed || s.weight !== "" || s.reps !== "")));

  /* ─────────── Day picker ─────────── */
  if (!draft) {
    return (
      <Page>
        <div className="eyebrow mt-1">Pick today's workout</div>
        {active ? (
          <div className="flex flex-col gap-2">
            {active.days.map((d) => {
              const last = lastWorkoutForDay(workouts, d.id);
              return (
                <button key={d.id} onClick={() => startDay(active, d.id)} className="card flex items-center gap-3 px-4 py-4 text-left active:bg-raised">
                  <div className="min-w-0 flex-1">
                    <div className="display text-[17px] font-semibold">{d.name}</div>
                    <div className="mt-0.5 text-[12px] text-ink-3">{d.exerciseIds.length} exercises{last ? ` · last ${formatShort(last)}` : " · never done"} · {active.name}</div>
                  </div>
                  <ChevronRight size={20} className="text-accent" />
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No program yet" body="Create one in the Program tab, or start an empty workout." />
        )}
        <Button variant="ghost" onClick={() => startDay(null, null)} className="self-center">Start an empty workout</Button>
        {programs.length > 1 && <p className="text-center text-[12px] text-ink-3">Switch programs in the Program tab.</p>}
      </Page>
    );
  }

  /* ─────────── In-progress ─────────── */
  const dr: WorkoutDraft = draft;
  const idx = Math.max(0, Math.min(dr.currentExerciseIdx, dr.exercises.length - 1));
  const cur = draft.exercises[idx];
  const curDef = cur ? exById.get(cur.exerciseId) : undefined;
  const completedSets = draft.exercises.reduce((n, ex) => n + ex.sets.filter((s) => s.completed).length, 0);
  const totalSets = draft.exercises.reduce((n, ex) => n + ex.sets.length, 0);

  const setIdx = (i: number) => { setDraft((d) => d && { ...d, currentExerciseIdx: i }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const patchSet = (exI: number, setI: number, patch: Partial<DraftSet>) => setDraft((d) => d && { ...d, exercises: d.exercises.map((ex, i) => (i === exI ? { ...ex, sets: ex.sets.map((s, j) => (j === setI ? { ...s, ...patch } : s)) } : ex)) });
  const addSet = (exI: number) => setDraft((d) => d && { ...d, exercises: d.exercises.map((ex, i) => (i === exI ? { ...ex, sets: [...ex.sets, { ...(ex.sets[ex.sets.length - 1] ?? blankSet()), completed: false }] } : ex)) });
  const removeSet = (exI: number, setI: number) => setDraft((d) => d && { ...d, exercises: d.exercises.map((ex, i) => (i === exI ? { ...ex, sets: ex.sets.filter((_, j) => j !== setI) } : ex)) });
  const removeExercise = (exI: number) => setDraft((d) => d && { ...d, exercises: d.exercises.filter((_, i) => i !== exI), currentExerciseIdx: Math.max(0, Math.min(d.currentExerciseIdx, d.exercises.length - 2)) });
  function completeSet(exI: number, setI: number) {
    const s = dr.exercises[exI].sets[setI];
    const completing = !s.completed;
    if (completing && (!s.weight || !s.reps)) { toast("Enter weight and reps first", "warn"); return; }
    patchSet(exI, setI, { completed: completing });
    if (completing && prefs.autoStartTimer) {
      const def = exById.get(dr.exercises[exI].exerciseId);
      timer.start(def?.scheme.type === "heavy" ? prefs.heavyRest : prefs.defaultRest);
    }
  }
  function addExerciseToDraft(ex: Exercise) {
    setDraft((d) => d && { ...d, exercises: [...d.exercises, { exerciseId: ex.id, sets: Array.from({ length: ex.scheme.sets }, blankSet) }], currentExerciseIdx: d.exercises.length });
    setAddEx(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finishWorkout() {
    const final = dr.exercises.map((ex) => ({
      exerciseId: ex.exerciseId, customName: ex.customName,
      sets: ex.sets.filter((s) => s.completed && s.weight !== "" && s.reps !== "").map<WorkoutSet>((s) => ({ weight: parseFloat(s.weight), reps: parseInt(s.reps), rpe: s.rpe ? parseFloat(s.rpe) : null, completed: true })),
    })).filter((ex) => ex.sets.length > 0);
    if (!final.length) { toast("No completed sets to save", "warn"); return; }
    const id = uid("wo");
    const w: Workout = { id, date: dr.date, startedAt: dr.startedAt, finishedAt: Date.now(), programId: dr.programId, programDayId: dr.programDayId, programDayName: dr.programDayName, exercises: final, sessionNotes: dr.sessionNotes.trim() || undefined, updatedAt: 0 };
    // PR count for the toast
    let prs = 0;
    for (const ex of final) { const h = exerciseHistory(workouts, ex.exerciseId); for (const s of ex.sets) if (isNewPR(h, "9999-12-31", s)) { prs++; break; } }
    await saveWorkout(w);
    for (const p of dr.pendingPhotos) await addPhoto(p.dataUrl, { date: dr.date, workoutId: id });
    saveDraft(null); setDraft(null); setFinish(false); timer.stop();
    toast(prs ? `Workout saved · ${prs} new PR${prs > 1 ? "s" : ""}` : "Workout saved");
    window.scrollTo({ top: 0 });
  }

  return (
    <Page>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-accent">{draft.programDayName}</div>
          <div className="mt-1 flex items-center gap-2 text-[13px] text-ink-2">
            <input type="date" value={draft.date} onChange={(e) => e.target.value && setDraft({ ...draft, date: e.target.value })} className="field !h-8 !w-auto !py-0 !text-[13px]" />
            <Elapsed since={draft.startedAt} />
            <span className="tnum">{completedSets}/{totalSets} sets</span>
          </div>
        </div>
        <Button size="sm" onClick={() => (hasProgress ? setConfirmChange(true) : setDraft(null))}>Change</Button>
      </div>

      {/* exercise stepper */}
      <div className="scroll-x -mx-4 flex gap-2 px-4 md:mx-0 md:px-0">
        {draft.exercises.map((ex, i) => {
          const def = exById.get(ex.exerciseId);
          const done = ex.sets.length > 0 && ex.sets.every((s) => s.completed);
          const some = ex.sets.some((s) => s.completed);
          return (
            <button key={i} onClick={() => setIdx(i)} className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${i === idx ? "bg-ink text-bg" : "border border-line bg-surface text-ink-2"}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${done ? "bg-good" : some ? "bg-accent" : "bg-line-strong"}`} />
              {def?.name ?? ex.customName ?? "Exercise"}
            </button>
          );
        })}
        <button onClick={() => setAddEx(true)} className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[13px] font-medium text-ink-2"><Plus size={14} /> Add</button>
      </div>

      {cur ? (
        <ExerciseCard key={`${cur.exerciseId}-${idx}`} ex={cur} def={curDef} workouts={workouts} unit={unit} draftDate={draft.date}
          onPatch={(si, p) => patchSet(idx, si, p)} onComplete={(si) => completeSet(idx, si)} onAddSet={() => addSet(idx)} onRemoveSet={(si) => removeSet(idx, si)} onRemoveExercise={() => removeExercise(idx)} />
      ) : (
        <EmptyState title="No exercises in this workout" body="Add one to get going." action={<Button variant="primary" onClick={() => setAddEx(true)}><Plus size={16} /> Add exercise</Button>} />
      )}

      <div className="flex gap-2">
        {idx < draft.exercises.length - 1 ? (
          <Button full variant="primary" onClick={() => setIdx(idx + 1)}>Next exercise <ChevronRight size={18} /></Button>
        ) : (
          <Button full variant="primary" onClick={() => setFinish(true)} disabled={completedSets === 0}>Finish workout</Button>
        )}
        {idx < draft.exercises.length - 1 && <Button onClick={() => setFinish(true)} disabled={completedSets === 0}>Finish</Button>}
      </div>
      <div className="flex justify-center"><Button variant="ghost" size="sm" onClick={() => timer.start(prefs.defaultRest)}><Timer size={16} /> Start rest timer</Button></div>

      <Confirm open={confirmChange} title="Discard this workout?" body="Sets you've entered will be lost." confirmLabel="Discard" onCancel={() => setConfirmChange(false)} onConfirm={() => { setConfirmChange(false); setDraft(null); timer.stop(); }} />

      <FinishSheet open={finish} onClose={() => setFinish(false)} draft={draft} setDraft={setDraft} unit={unit} onConfirm={finishWorkout} exById={exById} />
      <AddExerciseSheet open={addEx} onClose={() => setAddEx(false)} exercises={exercises} onPick={addExerciseToDraft} onCustom={async (name) => { const ex = await saveExercise(newExercise(name)); addExerciseToDraft(ex); }} />
    </Page>
  );
}

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000);
  return <span className="tnum">{formatDuration((now - since) / 1000)}</span>;
}

function ExerciseCard({ ex, def, workouts, unit, draftDate, onPatch, onComplete, onAddSet, onRemoveSet, onRemoveExercise }: {
  ex: DraftExercise; def?: Exercise; workouts: Workout[]; unit: string; draftDate: string;
  onPatch: (setIdx: number, p: Partial<DraftSet>) => void; onComplete: (setIdx: number) => void; onAddSet: () => void; onRemoveSet: (setIdx: number) => void; onRemoveExercise: () => void;
}) {
  const history = useMemo(() => exerciseHistory(workouts.filter((w) => w.date <= draftDate), ex.exerciseId), [workouts, ex.exerciseId, draftDate]);
  const target = def ? suggestNextTarget(history, def.scheme, def.increment) : null;
  const plateau = detectPlateau(history);
  const pr = bestPR(history);
  const last = history[history.length - 1];
  const scheme = def?.scheme;
  const name = def?.name ?? ex.customName ?? "Exercise";

  function applyTarget() {
    if (!target) return;
    const i = ex.sets.findIndex((s) => !s.completed);
    if (i >= 0) onPatch(i, { weight: String(target.weight), reps: String(target.reps) });
  }
  function copyPrev(i: number) {
    const p = ex.sets[i - 1];
    if (p) onPatch(i, { weight: p.weight, reps: p.reps, rpe: p.rpe });
  }

  return (
    <section className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display text-[22px] font-semibold leading-tight">{name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            {def && <Chip className="!h-6 !px-2 !text-[11px] capitalize">{def.muscle}</Chip>}
            {scheme && <span>{scheme.sets} × {scheme.repsMin}{scheme.repsMax !== scheme.repsMin ? `–${scheme.repsMax}` : ""} · {scheme.type === "heavy" ? "heavy" : scheme.type === "failure" ? "to failure" : "by feel"}</span>}
            {def?.notes && <span>· {def.notes}</span>}
          </div>
        </div>
        <button aria-label="Remove exercise from workout" onClick={onRemoveExercise} className="text-ink-3 hover:text-bad"><X size={18} /></button>
      </div>

      {(target || last || pr) && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          {target ? (
            <button onClick={applyTarget} className="rounded-xl bg-accent-soft px-3 py-2 text-left">
              <div className="eyebrow !text-accent">Target · tap to fill</div>
              <div className="tnum mt-0.5 text-[15px] font-semibold text-ink">{target.weight} {unit} × {target.reps}</div>
              <div className="text-ink-2">{target.hint}</div>
            </button>
          ) : <div className="rounded-xl bg-raised px-3 py-2 text-ink-3">No history yet. Log a session to get a target next time.</div>}
          <div className="rounded-xl bg-raised px-3 py-2">
            {last && <><div className="eyebrow">Last · {formatShort(last.date)}</div><div className="tnum mt-0.5 text-ink">{last.sets.map((s) => `${s.weight}×${s.reps}`).join(", ")}</div></>}
            {pr && <div className="mt-1 flex items-center gap-1 text-ink-2"><Trophy size={12} className="text-warn" /> PR {pr.weight}×{pr.reps} · e1RM {Math.round(pr.e1rm)}</div>}
          </div>
        </div>
      )}
      {plateau && <div className="mt-2 flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12px] text-warn"><TrendingDown size={14} /> Plateau: e1RM flat across the last 3 sessions. Try a deload, a rep-range change or a variation.</div>}

      <div className="mt-4 grid grid-cols-[28px_1fr_1fr_64px_44px_28px] items-center gap-2 text-[11px] uppercase tracking-wide text-ink-3">
        <span>Set</span><span>{unit}</span><span>Reps</span><span>RPE</span><span /><span />
      </div>
      <div className="mt-1 flex flex-col gap-2">
        {ex.sets.map((s, i) => (
          <SetRow key={i} i={i} s={s} unit={unit} onPatch={(p) => onPatch(i, p)} onComplete={() => onComplete(i)} onCopy={() => copyPrev(i)} onRemove={() => onRemoveSet(i)} isPR={s.completed && !!s.weight && !!s.reps && history.length > 0 && e1RM(+s.weight, +s.reps) > (pr?.e1rm ?? 0)} />
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={onAddSet} className="mt-2"><Plus size={16} /> Add set</Button>
    </section>
  );
}

function SetRow({ i, s, unit, onPatch, onComplete, onCopy, onRemove, isPR }: { i: number; s: DraftSet; unit: string; onPatch: (p: Partial<DraftSet>) => void; onComplete: () => void; onCopy: () => void; onRemove: () => void; isPR: boolean }) {
  const repsRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const cls = `field tnum !h-11 text-center text-[16px] font-medium ${s.completed ? "!bg-good-soft" : ""}`;
  function onRepsBlur(e: React.FocusEvent<HTMLInputElement>) {
    // auto-complete when both filled and focus leaves this row (LiftLog behaviour)
    const next = e.relatedTarget as HTMLElement | null;
    if (!s.completed && s.weight && s.reps && !(next && rowRef.current?.contains(next))) onComplete();
  }
  return (
    <div ref={rowRef} className="grid grid-cols-[28px_1fr_1fr_64px_44px_28px] items-center gap-2">
      <span className="tnum text-[13px] text-ink-3">{i + 1}{isPR && <Trophy size={11} className="ml-0.5 inline text-warn" />}</span>
      <input type="number" inputMode="decimal" placeholder={unit} value={s.weight} onFocus={(e) => e.target.select()} onChange={(e) => onPatch({ weight: e.target.value, completed: false })} onKeyDown={(e) => { if (e.key === "Enter") repsRef.current?.focus(); }} className={cls} aria-label={`Set ${i + 1} weight`} />
      <input ref={repsRef} type="number" inputMode="numeric" placeholder="reps" value={s.reps} onFocus={(e) => e.target.select()} onChange={(e) => onPatch({ reps: e.target.value, completed: false })} onBlur={onRepsBlur} onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }} className={cls} aria-label={`Set ${i + 1} reps`} />
      <input type="number" inputMode="decimal" placeholder="–" value={s.rpe} min={5} max={10} step={0.5} onChange={(e) => onPatch({ rpe: e.target.value })} className={`${cls} !text-[13px]`} aria-label={`Set ${i + 1} RPE`} />
      <button aria-label={s.completed ? "Mark incomplete" : "Complete set"} onClick={onComplete} className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.completed ? "bg-good text-white" : "bg-raised text-ink-3"}`}><Check size={20} /></button>
      <div className="flex flex-col items-center gap-1">
        {i > 0 && !s.completed && <button aria-label="Copy previous set" onClick={onCopy} className="text-ink-3 hover:text-ink"><Copy size={13} /></button>}
        <button aria-label="Remove set" onClick={onRemove} className="text-ink-3 hover:text-bad"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

function FinishSheet({ open, onClose, draft, setDraft, unit, onConfirm, exById }: { open: boolean; onClose: () => void; draft: WorkoutDraft; setDraft: (d: WorkoutDraft) => void; unit: string; onConfirm: () => void; exById: Map<string, Exercise> }) {
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const done = draft.exercises.flatMap((ex) => ex.sets.filter((s) => s.completed && s.weight && s.reps).map((s) => ({ ...s, ex })));
  const volume = done.reduce((a, s) => a + parseFloat(s.weight) * parseInt(s.reps), 0);
  async function pick(files: FileList | null) {
    if (!files) return;
    const added: { id: string; dataUrl: string }[] = [];
    for (const f of Array.from(files)) added.push({ id: uid("p"), dataUrl: await compressImage(f) });
    setDraft({ ...draft, pendingPhotos: [...draft.pendingPhotos, ...added] });
  }
  return (
    <Sheet open={open} onClose={onClose} title="Finish workout" footer={<Button full variant="primary" onClick={onConfirm}>Save workout</Button>}>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-raised p-3 text-center"><div className="tnum display text-[22px] font-semibold">{done.length}</div><div className="text-[11px] text-ink-3">sets</div></div>
        <div className="rounded-xl bg-raised p-3 text-center"><div className="tnum display text-[22px] font-semibold">{Math.round(volume).toLocaleString()}</div><div className="text-[11px] text-ink-3">{unit} volume</div></div>
        <div className="rounded-xl bg-raised p-3 text-center"><div className="tnum display text-[22px] font-semibold"><Elapsed since={draft.startedAt} /></div><div className="text-[11px] text-ink-3">duration</div></div>
      </div>
      <div className="mt-3 divide-y divide-line text-[13px]">
        {draft.exercises.filter((ex) => ex.sets.some((s) => s.completed)).map((ex, i) => (
          <div key={i} className="flex justify-between py-1.5"><span>{exById.get(ex.exerciseId)?.name ?? ex.customName}</span><span className="tnum text-ink-2">{ex.sets.filter((s) => s.completed).map((s) => `${s.weight}×${s.reps}`).join("  ")}</span></div>
        ))}
      </div>
      <Field label="Session notes" className="mt-4"><textarea rows={3} value={draft.sessionNotes} onChange={(e) => setDraft({ ...draft, sessionNotes: e.target.value })} className="field" placeholder="How did it go? Sleep, energy, form cues…" /></Field>
      <div className="mt-4">
        <div className="mb-2 text-[13px] font-medium text-ink-2">Progress photos</div>
        <div className="flex flex-wrap gap-2">
          {draft.pendingPhotos.map((p) => (
            <div key={p.id} className="relative h-20 w-20 overflow-hidden rounded-xl"><img src={p.dataUrl} alt="" className="h-full w-full object-cover" /><button aria-label="Remove photo" onClick={() => setDraft({ ...draft, pendingPhotos: draft.pendingPhotos.filter((x) => x.id !== p.id) })} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"><X size={12} /></button></div>
          ))}
          <button onClick={() => camRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-[11px] text-ink-2"><Camera size={18} /> Camera</button>
          <button onClick={() => libRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-[11px] text-ink-2"><ImageIcon size={18} /> Library</button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files)} />
          <input ref={libRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
        </div>
      </div>
    </Sheet>
  );
}

export function AddExerciseSheet({ open, onClose, exercises, onPick, onCustom, exclude = [] }: { open: boolean; onClose: () => void; exercises: Exercise[]; onPick: (e: Exercise) => void; onCustom?: (name: string) => void; exclude?: string[] }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<string>("all");
  const list = exercises.filter((e) => !exclude.includes(e.id) && (muscle === "all" || e.muscle === muscle) && (!q || e.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Sheet open={open} onClose={onClose} title="Add exercise" noPad>
      <div className="px-5">
        <Input autoFocus placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="scroll-x -mx-5 mt-2 flex gap-2 px-5">
          <Chip active={muscle === "all"} onClick={() => setMuscle("all")}>All</Chip>
          {MUSCLE_GROUPS.map((m) => <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)} className="capitalize">{m}</Chip>)}
        </div>
        <div className="mt-2 divide-y divide-line">
          {list.map((e) => (
            <button key={e.id} onClick={() => onPick(e)} className="flex w-full items-center justify-between py-3 text-left active:bg-raised">
              <span>{e.name}<span className="ml-2 text-[12px] capitalize text-ink-3">{e.muscle}</span></span>
              <span className="text-[12px] text-ink-3">{e.scheme.sets} × {e.scheme.repsMin}–{e.scheme.repsMax}</span>
            </button>
          ))}
          {q.trim() && onCustom && <button onClick={() => { onCustom(q.trim()); setQ(""); }} className="flex w-full items-center gap-2 py-3 text-left font-medium text-accent"><Plus size={16} /> Create “{q.trim()}”</button>}
        </div>
      </div>
      <div className="h-4" />
    </Sheet>
  );
}
