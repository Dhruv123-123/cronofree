import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2, HeartPulse } from "lucide-react";
import { db, put, remove } from "@/db";
import type { BiometricKind } from "@/db/types";
import { BIOMETRICS, BIOMETRIC_BY_KIND, formatBiometric } from "@/lib/biometrics";
import { today, formatDay, formatShort, addDays } from "@/lib/dates";
import { uid } from "@/lib/id";
import { scheduleSync } from "@/lib/sync";
import { TrendChart } from "@/components/charts";
import { Button, Sheet, Field, NumberInput, Chip, Stat, EmptyState, useToast } from "@/components/ui";

export default function BiometricsSection() {
  const toast = useToast();
  const rows = useLiveQuery(() => db.biometrics.filter((b) => !b.deletedAt).toArray(), []) ?? [];
  const [kind, setKind] = useState<BiometricKind>("restingHr");
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Partial<Record<BiometricKind, { a: number | ""; b: number | "" }>>>({});
  const def = BIOMETRIC_BY_KIND[kind];
  const list = useMemo(() => rows.filter((r) => r.kind === kind).sort((a, b) => a.at - b.at), [rows, kind]);
  const latest = (k: BiometricKind) => rows.filter((r) => r.kind === k).sort((a, b) => b.at - a.at)[0];
  const since = addDays(today(), -90);
  const chart = list.filter((r) => r.date >= since).map((r) => ({ date: r.date, value: r.value, value2: r.value2 }));

  async function save() {
    let n = 0;
    for (const [k, v] of Object.entries(vals)) {
      if (!v || v.a === "" || v.a === undefined) continue;
      const d = BIOMETRIC_BY_KIND[k as BiometricKind];
      await put("biometrics", { id: uid("b"), date: today(), at: Date.now(), kind: k as BiometricKind, value: Number(v.a), value2: d.twoValues && v.b !== "" ? Number(v.b) : undefined, updatedAt: 0 });
      n++;
    }
    scheduleSync(); setOpen(false); setVals({}); toast(`Saved ${n} reading${n === 1 ? "" : "s"}`);
  }

  const tiles: BiometricKind[] = ["restingHr", "sleep", "steps", "bodyFat"];
  return (
    <>
      <div className="flex items-center justify-between"><div className="eyebrow">Biometrics</div><Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus size={16} /> Log</Button></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {tiles.map((k) => { const l = latest(k); const d = BIOMETRIC_BY_KIND[k]; return <Stat key={k} label={d.label} value={l ? formatBiometric(k, l.value, l.value2) : "–"} unit={d.unit} sub={l ? formatShort(l.date) : "not logged"} />; })}
      </div>
      <section className="card p-4">
        <div className="scroll-x -mx-4 mb-3 flex gap-2 px-4">{BIOMETRICS.map((b) => <Chip key={b.kind} active={kind === b.kind} onClick={() => setKind(b.kind)}>{b.label}</Chip>)}</div>
        {chart.length ? (
          <TrendChart data={chart} series={def.twoValues ? [{ key: "value", name: "Systolic", color: "var(--accent)", dot: true }, { key: "value2", name: "Diastolic", color: "var(--protein)", dot: true }] : [{ key: "value", name: def.label, color: "var(--accent)", dot: true }]} fmtValue={(v) => `${v} ${def.unit}`} />
        ) : <EmptyState icon={<HeartPulse size={26} />} title={`No ${def.label.toLowerCase()} readings`} body="Log readings from your watch, scale or cuff. Cronometer biometrics exports import here too." />}
        {list.length > 0 && (
          <div className="mt-3 divide-y divide-line">{[...list].reverse().slice(0, 5).map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-2 text-[14px]"><span className="flex-1">{formatDay(r.date)}</span><span className="tnum font-medium">{formatBiometric(r.kind, r.value, r.value2)} {def.unit}</span><button aria-label="Delete" onClick={async () => { await remove("biometrics", r.id); scheduleSync(); }} className="text-ink-3 hover:text-bad"><Trash2 size={15} /></button></div>
          ))}</div>
        )}
      </section>
      <Sheet open={open} onClose={() => setOpen(false)} title="Log biometrics" footer={<Button full variant="primary" onClick={save}>Save</Button>}>
        <p className="mb-3 text-[13px] text-ink-2">Fill in what you measured; leave the rest blank.</p>
        <div className="grid grid-cols-2 gap-2">
          {BIOMETRICS.map((b) => (
            <Field key={b.kind} label={b.label}>
              {b.twoValues ? (
                <div className="flex items-center gap-1"><NumberInput value={vals[b.kind]?.a ?? ""} onChange={(v) => setVals((s) => ({ ...s, [b.kind]: { a: v, b: s[b.kind]?.b ?? "" } }))} placeholder="sys" /><span className="text-ink-3">/</span><NumberInput value={vals[b.kind]?.b ?? ""} onChange={(v) => setVals((s) => ({ ...s, [b.kind]: { a: s[b.kind]?.a ?? "", b: v } }))} placeholder="dia" /></div>
              ) : <NumberInput value={vals[b.kind]?.a ?? ""} onChange={(v) => setVals((s) => ({ ...s, [b.kind]: { a: v, b: "" } }))} suffix={b.unit} step={b.step} min={b.min} max={b.max} placeholder={latest(b.kind) ? formatBiometric(b.kind, latest(b.kind)!.value) : ""} />}
            </Field>
          ))}
        </div>
      </Sheet>
    </>
  );
}
