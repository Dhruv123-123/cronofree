import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, ChevronUp, ChevronDown, X, Pencil, Trash2, Check, Star } from "lucide-react";
import { db } from "@/db";
import type { Program, ProgramDay } from "@/db/types";
import { PROGRAM_TEMPLATES, programFromTemplate } from "@/lib/liftingDefaults";
import { uid } from "@/lib/id";
import { Page } from "@/components/Shell";
import { Button, Sheet, Input, Confirm, useToast, Chip, EmptyState } from "@/components/ui";
import { saveProgram, deleteProgram, setActiveProgram, newDay } from "./trainRepo";
import { AddExerciseSheet } from "./LogTab";

export default function ProgramTab() {
  const toast = useToast();
  const programs = useLiveQuery(() => db.programs.filter((p) => !p.deletedAt).toArray(), []) ?? [];
  const exercises = useLiveQuery(() => db.exercises.filter((e) => !e.deletedAt).toArray(), []) ?? [];
  const exById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const [selId, setSelId] = useState<string | null>(null);
  const program = programs.find((p) => p.id === selId) ?? programs.find((p) => p.active) ?? programs[0];
  const [templates, setTemplates] = useState(false);
  const [rename, setRename] = useState<{ kind: "program" | "day"; id?: string; name: string } | null>(null);
  const [addTo, setAddTo] = useState<ProgramDay | null>(null);
  const [del, setDel] = useState<Program | null>(null);

  const update = (p: Program) => saveProgram(p);
  const patchDay = (dayId: string, fn: (d: ProgramDay) => ProgramDay) => program && update({ ...program, days: program.days.map((d) => (d.id === dayId ? fn(d) : d)) });
  const move = (dayId: string, exId: string, dir: -1 | 1) => patchDay(dayId, (d) => { const ids = [...d.exerciseIds]; const i = ids.indexOf(exId); const j = i + dir; if (i < 0 || j < 0 || j >= ids.length) return d; [ids[i], ids[j]] = [ids[j], ids[i]]; return { ...d, exerciseIds: ids }; });
  const moveDay = (dayId: string, dir: -1 | 1) => { if (!program) return; const days = [...program.days]; const i = days.findIndex((d) => d.id === dayId); const j = i + dir; if (j < 0 || j >= days.length) return; [days[i], days[j]] = [days[j], days[i]]; update({ ...program, days }); };

  async function addFromTemplate(tid: string) {
    const t = PROGRAM_TEMPLATES.find((x) => x.id === tid)!;
    const p = programFromTemplate(t, uid().slice(0, 6));
    await saveProgram(p);
    if (!programs.length) await setActiveProgram(p.id);
    setSelId(p.id); setTemplates(false); toast(`Added ${t.name}`);
  }
  async function addBlank() {
    const p: Program = { id: uid("prog"), name: "New program", level: "custom", days: [], active: programs.length === 0, updatedAt: 0 };
    await saveProgram(p); setSelId(p.id); setTemplates(false); setRename({ kind: "program", name: p.name });
  }

  return (
    <Page>
      <div className="scroll-x -mx-4 flex gap-2 px-4 md:mx-0 md:px-0">
        {programs.map((p) => <Chip key={p.id} active={program?.id === p.id} onClick={() => setSelId(p.id)}>{p.active && <Star size={12} fill="currentColor" />}{p.name}</Chip>)}
        <Chip onClick={() => setTemplates(true)}><Plus size={14} /> New</Chip>
      </div>

      {!program ? <EmptyState title="No program" body="Start from a template or build your own." action={<Button variant="primary" onClick={() => setTemplates(true)}>Choose a template</Button>} /> : (
        <>
          <div className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="display text-[20px] font-semibold">{program.name}</h2>
                <div className="text-[12px] text-ink-3">{program.days.length} days · {program.days.reduce((a, d) => a + d.exerciseIds.length, 0)} exercise slots · {program.level}</div>
              </div>
              <div className="flex gap-1">
                <button aria-label="Rename program" onClick={() => setRename({ kind: "program", name: program.name })} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-raised"><Pencil size={16} /></button>
                <button aria-label="Delete program" onClick={() => setDel(program)} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-bad"><Trash2 size={16} /></button>
              </div>
            </div>
            {program.active ? <div className="mt-2 flex items-center gap-1 text-[13px] text-good"><Check size={14} /> Active program · shown on the Workout tab</div> : <Button size="sm" variant="soft" className="mt-2" onClick={() => setActiveProgram(program.id)}>Make active</Button>}
          </div>

          {program.days.map((d, di) => (
            <section key={d.id} className="card overflow-hidden">
              <div className="flex items-center gap-1 px-4 pt-3 pb-1">
                <h3 className="flex-1 text-[16px] font-semibold">{d.name}</h3>
                <button aria-label="Move day up" disabled={di === 0} onClick={() => moveDay(d.id, -1)} className="text-ink-3 disabled:opacity-30"><ChevronUp size={18} /></button>
                <button aria-label="Move day down" disabled={di === program.days.length - 1} onClick={() => moveDay(d.id, 1)} className="text-ink-3 disabled:opacity-30"><ChevronDown size={18} /></button>
                <button aria-label="Rename day" onClick={() => setRename({ kind: "day", id: d.id, name: d.name })} className="ml-1 text-ink-3"><Pencil size={16} /></button>
                <button aria-label="Delete day" onClick={() => update({ ...program, days: program.days.filter((x) => x.id !== d.id) })} className="ml-2 text-ink-3 hover:text-bad"><Trash2 size={16} /></button>
              </div>
              <div className="divide-y divide-line px-4">
                {d.exerciseIds.map((id, i) => {
                  const ex = exById.get(id);
                  return (
                    <div key={id} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1"><div className="truncate text-[14px]">{ex?.name ?? "Missing exercise"}</div>{ex && <div className="text-[12px] text-ink-3">{ex.scheme.sets} × {ex.scheme.repsMin}–{ex.scheme.repsMax} · {ex.scheme.type} · +{ex.increment}</div>}</div>
                      <button aria-label="Move up" disabled={i === 0} onClick={() => move(d.id, id, -1)} className="text-ink-3 disabled:opacity-30"><ChevronUp size={16} /></button>
                      <button aria-label="Move down" disabled={i === d.exerciseIds.length - 1} onClick={() => move(d.id, id, 1)} className="text-ink-3 disabled:opacity-30"><ChevronDown size={16} /></button>
                      <button aria-label="Remove" onClick={() => patchDay(d.id, (x) => ({ ...x, exerciseIds: x.exerciseIds.filter((y) => y !== id) }))} className="ml-1 text-ink-3 hover:text-bad"><X size={16} /></button>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setAddTo(d)} className="flex w-full items-center gap-2 px-4 py-3 text-[14px] font-semibold text-accent"><Plus size={16} /> Add exercise</button>
            </section>
          ))}
          <Button onClick={() => update({ ...program, days: [...program.days, newDay(`Day ${program.days.length + 1}`)] })}><Plus size={16} /> Add a day</Button>
        </>
      )}

      <Sheet open={templates} onClose={() => setTemplates(false)} title="New program">
        <div className="flex flex-col gap-2">
          {PROGRAM_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => addFromTemplate(t.id)} className="card px-4 py-3 text-left active:bg-raised">
              <div className="flex items-center justify-between"><span className="text-[15px] font-semibold">{t.name}</span><span className="text-[12px] capitalize text-ink-3">{t.level} · {t.days.length} days</span></div>
              <div className="mt-0.5 text-[12px] text-ink-2">{t.description}</div>
            </button>
          ))}
          <Button onClick={addBlank}>Start from scratch</Button>
        </div>
      </Sheet>

      <Sheet open={!!rename} onClose={() => setRename(null)} title={rename?.kind === "program" ? "Rename program" : "Rename day"}>
        <Input autoFocus value={rename?.name ?? ""} onChange={(e) => setRename((r) => r && { ...r, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("rename-save")?.click(); }} />
        <Button id="rename-save" full variant="primary" className="mt-3" onClick={() => { if (!rename || !program) return; const n = rename.name.trim(); if (!n) return; if (rename.kind === "program") update({ ...program, name: n }); else patchDay(rename.id!, (d) => ({ ...d, name: n })); setRename(null); }}>Save</Button>
      </Sheet>

      <AddExerciseSheet open={!!addTo} onClose={() => setAddTo(null)} exercises={exercises} exclude={addTo?.exerciseIds} onPick={(e) => { if (addTo) patchDay(addTo.id, (d) => ({ ...d, exerciseIds: [...d.exerciseIds, e.id] })); setAddTo(null); }} />
      <Confirm open={!!del} title={`Delete “${del?.name}”?`} body="Workouts already logged with it stay in History." onCancel={() => setDel(null)} onConfirm={async () => { if (del) { await deleteProgram(del.id); if (del.active) { const next = programs.find((p) => p.id !== del.id); if (next) await setActiveProgram(next.id); } } setDel(null); setSelId(null); }} />
    </Page>
  );
}
