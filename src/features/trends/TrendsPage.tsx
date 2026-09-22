import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2, Camera, Image as ImageIcon, Scale, Flame, Ruler, Images, Sparkles, Check } from "lucide-react";
import { db, put, remove } from "@/db";
import type { MeasurementKind, Photo } from "@/db/types";
import { useProfile } from "@/hooks";
import { useCheckin, applyRecommendation, averageNutrients } from "@/lib/checkin";
import { nutrientTargetsFor } from "@/lib/dayModel";
import { addDays, today, rangeDays, formatDay, formatShort } from "@/lib/dates";
import { kgToUnit, unitToKg, cmToUnit, unitToCm, fmt } from "@/lib/units";
import { uid } from "@/lib/id";
import { scheduleSync } from "@/lib/sync";
import { compressImage, addPhoto, deletePhoto, pickEvenlySpaced } from "@/lib/photos";
import { PageHeader, Page } from "@/components/Shell";
import { TrendChart, Columns } from "@/components/charts";
import { Segmented, Stat, Button, Sheet, Confirm, NumberInput, Field, useToast, EmptyState, Chip } from "@/components/ui";
import NutrientPanel from "@/features/diary/NutrientPanel";
import { WeightSheet } from "@/features/diary/DiaryPage";
import BiometricsSection from "./BiometricsSection";
import CalendarTab from "./CalendarTab";
import { NUTRIENTS, NUTRIENT_BY_KEY, type NutrientKey } from "@/lib/nutrients";

type Tab = "weight" | "nutrition" | "calendar" | "body" | "photos";
const RANGES = [{ v: 14, l: "2w" }, { v: 30, l: "1m" }, { v: 90, l: "3m" }, { v: 365, l: "1y" }];

export default function TrendsPage() {
  const [tab, setTab] = useState<Tab>("weight");
  return (
    <>
      <PageHeader title="Trends" sub="Progress">
        <div className="px-4 pb-2 md:px-0">
          <Segmented value={tab} onChange={setTab} className="w-full" options={[{ value: "weight", label: "Weight" }, { value: "nutrition", label: "Food" }, { value: "calendar", label: "Calendar" }, { value: "body", label: "Body" }, { value: "photos", label: "Photos" }]} />
        </div>
      </PageHeader>
      {tab === "weight" && <WeightTab />}
      {tab === "nutrition" && <NutritionTab />}
      {tab === "calendar" && <CalendarTab />}
      {tab === "body" && <BodyTab />}
      {tab === "photos" && <PhotosTab />}
    </>
  );
}

/* ───────────────────────────── Weight & expenditure ───────────────────────────── */
function WeightTab() {
  const profile = useProfile();
  const toast = useToast();
  const c = useCheckin(profile);
  const [range, setRange] = useState(30);
  const [log, setLog] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const unit = profile.units.weight;
  const u = (kg: number) => Math.round(kgToUnit(kg, unit) * 10) / 10;

  const data = useMemo(() => {
    if (!c) return [];
    const from = addDays(today(), -range);
    return c.trend.filter((t) => t.date >= from).map((t) => ({ date: t.date, scale: t.kg !== undefined ? u(t.kg) : undefined, trend: u(t.trend) }));
  }, [c, range, unit]);

  const recent = useMemo(() => (c?.weights ?? []).filter((w) => !w.deletedAt).sort((a, b) => b.at - a.at), [c]);
  const est = c?.estimate;
  const rateTone = c?.rateKgPerWeek === null || c?.rateKgPerWeek === undefined ? undefined : profile.goal === "maintain" ? (Math.abs(c.rateKgPerWeek) < 0.25 ? "good" : "warn") : Math.sign(c.rateKgPerWeek) === Math.sign(profile.rateKgPerWeek) ? "good" : "warn";
  const kcalDiff = c ? c.recommendedKcal - profile.targets.kcal : 0;

  async function saveWeight(v: number) {
    await put("weights", { id: uid("w"), date: today(), at: Date.now(), kg: unitToKg(v, unit), updatedAt: 0 });
    scheduleSync(); setLog(false); toast("Weight logged");
  }

  return (
    <Page>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Trend weight" value={c?.trendKg ? u(c.trendKg) : "–"} unit={unit} sub={c?.latestKg ? `scale ${u(c.latestKg)}` : "no weigh-ins"} />
        <Stat label="Rate · 2 wks" value={c?.rateKgPerWeek !== null && c?.rateKgPerWeek !== undefined ? `${c.rateKgPerWeek > 0 ? "+" : ""}${u(c.rateKgPerWeek)}` : "–"} unit={`${unit}/wk`} tone={rateTone} sub={`goal ${profile.rateKgPerWeek > 0 ? "+" : ""}${u(profile.rateKgPerWeek)}`} />
        <Stat label="To goal" value={profile.targetWeightKg && c?.trendKg ? Math.abs(u(profile.targetWeightKg - c.trendKg)) : "–"} unit={unit} sub={c?.goalEtaDays ? `~${Math.round(c.goalEtaDays / 7)} wks` : profile.targetWeightKg ? "set a rate" : "no target"} />
      </div>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">Weight</h2>
          <Button size="sm" variant="primary" onClick={() => setLog(true)}><Plus size={16} /> Log weight</Button>
        </div>
        <Segmented value={String(range)} onChange={(v) => setRange(Number(v))} options={RANGES.map((r) => ({ value: String(r.v), label: r.l }))} className="mb-3 w-full" />
        {data.length ? (
          <>
            <TrendChart data={data} series={[{ key: "scale", name: "Scale", color: "var(--ink-3)", dot: true, dashed: true }, { key: "trend", name: "Trend", color: "var(--accent)" }]} refY={profile.targetWeightKg ? u(profile.targetWeightKg) : undefined} refLabel={profile.targetWeightKg ? "goal" : undefined} fmtValue={(v) => `${v} ${unit}`} />
            <div className="mt-1 flex gap-4 text-[11px] text-ink-3"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />Trend (smoothed)</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--ink-3)]" />Daily scale weight</span></div>
          </>
        ) : <EmptyState icon={<Scale size={28} />} title="No weigh-ins yet" body="Log your weight daily; the trend line filters water and food weight so you see the real direction." action={<Button variant="primary" onClick={() => setLog(true)}>Log weight</Button>} />}
      </section>

      <section className="card p-4">
        <div className="flex items-center gap-2"><Flame size={18} className="text-accent" /><h2 className="text-[16px] font-semibold">Energy expenditure</h2></div>
        {c && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-raised p-3"><div className="text-[12px] text-ink-3">Estimated TDEE</div><div className="tnum display text-[26px] font-semibold">{fmt(c.currentTdee)}<span className="ml-1 text-[12px] font-normal text-ink-3">kcal</span></div><div className="text-[12px] text-ink-2">{profile.expenditureMode === "adaptive" ? `adaptive · ${est?.confidence} confidence` : profile.expenditureMode === "manual" ? "set manually" : "formula (Mifflin-St Jeor)"}</div></div>
              <div className="rounded-xl bg-raised p-3"><div className="text-[12px] text-ink-3">Avg intake · 7 days</div><div className="tnum display text-[26px] font-semibold">{c.avgIntake7 ? fmt(c.avgIntake7) : "–"}<span className="ml-1 text-[12px] font-normal text-ink-3">kcal</span></div><div className="text-[12px] text-ink-2">{c.loggedDays30}/30 days logged · {c.weightsLast30} weigh-ins</div></div>
            </div>
            <p className="mt-3 text-[13px] text-ink-2">{est?.note}{profile.expenditureMode === "adaptive" && est?.confidence !== "low" ? ` Formula says ${fmt(c.formulaTdee)} kcal; your data says ${fmt(est?.tdee)}.` : ""}</p>
            {Math.abs(kcalDiff) >= 25 && (profile.expenditureMode !== "adaptive" || est?.confidence !== "low") && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/50 p-3">
                <Sparkles size={18} className="shrink-0 text-accent" />
                <div className="flex-1 text-[13px]"><span className="font-semibold">Weekly check-in:</span> to hit {profile.rateKgPerWeek > 0 ? "+" : ""}{u(profile.rateKgPerWeek)} {unit}/week, set {fmt(c.recommendedKcal)} kcal ({kcalDiff > 0 ? "+" : ""}{fmt(kcalDiff)} vs now). Carbs absorb the change; protein stays.</div>
                <Button size="sm" variant="primary" onClick={async () => { await applyRecommendation(profile, c.recommendedKcal, c.currentTdee); toast(`Target set to ${fmt(c.recommendedKcal)} kcal`); }}><Check size={14} /> Apply</Button>
              </div>
            )}
            {Math.abs(kcalDiff) < 25 && <div className="mt-3 flex items-center gap-2 text-[13px] text-good"><Check size={14} /> Your calorie target matches the current estimate.</div>}
          </>
        )}
      </section>

      {c && c.loggedDays30 > 0 && (
        <section className="card p-4">
          <h2 className="mb-1 text-[16px] font-semibold">Energy balance · 30 days</h2>
          <p className="mb-2 text-[12px] text-ink-3">Daily intake against your current expenditure estimate. Bars below the line are a deficit.</p>
          <Columns data={Array.from({ length: 30 }, (_, i) => { const d = addDays(today(), i - 29); return { date: d, kcal: Math.round(c.intakeByDay.get(d) ?? 0) }; })} dataKey="kcal" color="var(--accent)" refY={c.currentTdee} refLabel="expenditure" colorFor={(r) => (Number(r.kcal) === 0 ? "var(--line)" : Number(r.kcal) > c.currentTdee ? "var(--warn)" : "var(--protein)")} fmtValue={(v) => `${Math.round(v)} kcal`} />
        </section>
      )}

      {recent.length > 0 && (
        <section className="card px-4 py-2">
          <div className="divide-y divide-line">
            {(showAll ? recent : recent.slice(0, 6)).map((w) => (
              <div key={w.id} className="flex items-center gap-3 py-2 text-[14px]">
                <span className="flex-1">{formatDay(w.date)}</span>
                <span className="tnum font-medium">{u(w.kg)} {unit}</span>
                <button aria-label="Delete" onClick={async () => { await remove("weights", w.id); scheduleSync(); }} className="text-ink-3 hover:text-bad"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          {recent.length > 6 && <button onClick={() => setShowAll((s) => !s)} className="w-full py-2 text-[13px] font-medium text-accent">{showAll ? "Show fewer" : `Show all ${recent.length}`}</button>}
        </section>
      )}
      <WeightSheet open={log} onClose={() => setLog(false)} unit={unit} initial={c?.latestKg ? kgToUnit(c.latestKg, unit) : undefined} onSave={saveWeight} />
    </Page>
  );
}

/* ───────────────────────────── Nutrition ───────────────────────────── */
function NutritionTab() {
  const profile = useProfile();
  const [range, setRange] = useState(14);
  const days = useMemo(() => rangeDays(today(), range), [range]);
  const entries = useLiveQuery(() => db.entries.where("date").between(days[0], days[days.length - 1], true, true).filter((e) => !e.deletedAt).toArray(), [days]);
  const { avg, loggedDays } = useMemo(() => averageNutrients(entries ?? [], days), [entries, days]);
  const series = useMemo(() => {
    const byDay = new Map<string, { kcal: number; protein: number; carbs: number; fat: number }>();
    for (const e of entries ?? []) { if (e.kind === "exercise") continue; const d = byDay.get(e.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }; d.kcal += e.nutrients.kcal ?? 0; d.protein += e.nutrients.protein ?? 0; d.carbs += e.nutrients.carbs ?? 0; d.fat += e.nutrients.fat ?? 0; byDay.set(e.date, d); }
    return days.map((date) => ({ date, ...(byDay.get(date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 }) }));
  }, [entries, days]);
  const t = profile.targets;
  const nutrientTargets = nutrientTargetsFor(profile, t.kcal);
  const adherence = series.filter((d) => d.kcal > 300).filter((d) => Math.abs(d.kcal - t.kcal) <= t.kcal * 0.1).length;
  const [nk, setNk] = useState<NutrientKey>("fiber");
  const nutrientSeries = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const e of entries ?? []) { if (e.kind === "exercise") continue; byDay.set(e.date, (byDay.get(e.date) ?? 0) + (e.nutrients[nk] ?? 0)); }
    return days.map((date) => ({ date, value: byDay.has(date) ? Math.round((byDay.get(date) ?? 0) * 100) / 100 : undefined }));
  }, [entries, days, nk]);

  return (
    <Page>
      <div className="flex items-center justify-between gap-3"><div className="eyebrow">Averages over logged days</div><Segmented value={String(range)} onChange={(v) => setRange(Number(v))} options={RANGES.slice(0, 3).map((r) => ({ value: String(r.v), label: r.l }))} /></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Calories / day" value={fmt(avg.kcal)} unit="kcal" sub={`target ${fmt(t.kcal)}`} tone={avg.kcal ? (Math.abs((avg.kcal ?? 0) - t.kcal) <= t.kcal * 0.1 ? "good" : "warn") : undefined} />
        <Stat label="Protein / day" value={fmt(avg.protein)} unit="g" sub={`target ${t.protein}`} tone={avg.protein ? ((avg.protein ?? 0) >= t.protein * 0.9 ? "good" : "warn") : undefined} />
        <Stat label="Within ±10 %" value={`${adherence}/${loggedDays}`} unit="days" sub="calorie adherence" />
        <Stat label="Fiber / day" value={fmt(avg.fiber)} unit="g" sub={`target ${nutrientTargets.fiber}`} />
      </div>
      <section className="card p-4">
        <h2 className="mb-2 text-[16px] font-semibold">Calories by day</h2>
        <Columns data={series} dataKey="kcal" color="var(--accent)" refY={t.kcal} refLabel="target" colorFor={(r) => (Number(r.kcal) === 0 ? "var(--line)" : Number(r.kcal) > t.kcal * 1.1 ? "var(--bad)" : Number(r.kcal) < t.kcal * 0.9 ? "var(--warn)" : "var(--good)")} fmtValue={(v) => `${Math.round(v)} kcal`} />
        <div className="mt-1 flex gap-3 text-[11px] text-ink-3"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--good)]" />within 10 %</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--warn)]" />under</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--bad)]" />over</span></div>
      </section>
      <section className="card p-4">
        <h2 className="mb-2 text-[16px] font-semibold">Macros by day</h2>
        <TrendChart data={series.map((d) => ({ date: d.date, protein: d.kcal ? Math.round(d.protein) : undefined, carbs: d.kcal ? Math.round(d.carbs) : undefined, fat: d.kcal ? Math.round(d.fat) : undefined }))} series={[{ key: "protein", name: "Protein", color: "var(--protein)" }, { key: "carbs", name: "Carbs", color: "var(--carbs)" }, { key: "fat", name: "Fat", color: "var(--fat)" }]} unit="g" fmtValue={(v) => `${v} g`} />
        <div className="mt-1 flex gap-3 text-[11px] text-ink-3"><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--protein)]" />Protein</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--carbs)]" />Carbs</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--fat)]" />Fat</span></div>
      </section>
      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold">Nutrient over time</h2>
          <select value={nk} onChange={(e) => setNk(e.target.value as NutrientKey)} className="field !h-9 !w-auto !py-0 !text-[13px]">{NUTRIENTS.filter((n) => n.key !== "kcal").map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}</select>
        </div>
        <TrendChart data={nutrientSeries} series={[{ key: "value", name: NUTRIENT_BY_KEY[nk].label, color: "var(--accent)", dot: true, area: true }]} refY={(nutrientTargets as Record<string, number | undefined>)[nk] ?? (t as unknown as Record<string, number | undefined>)[nk]} refLabel="target" fmtValue={(v) => `${v} ${NUTRIENT_BY_KEY[nk].unit}`} />
      </section>
      <section className="card p-4">
        <h2 className="mb-1 text-[16px] font-semibold">Nutrient report</h2>
        <p className="mb-3 text-[12px] text-ink-3">Average per logged day over the last {range} days ({loggedDays} days with food logged).</p>
        {loggedDays ? <NutrientPanel totals={avg} targets={nutrientTargets} macroTargets={t} /> : <EmptyState title="Nothing logged in this range" />}
      </section>
    </Page>
  );
}

/* ───────────────────────────── Body measurements ───────────────────────────── */
const KINDS: { id: MeasurementKind; label: string }[] = [
  { id: "waist", label: "Waist" }, { id: "hips", label: "Hips" }, { id: "chest", label: "Chest" }, { id: "shoulders", label: "Shoulders" }, { id: "neck", label: "Neck" },
  { id: "leftArm", label: "Left arm" }, { id: "rightArm", label: "Right arm" }, { id: "leftThigh", label: "Left thigh" }, { id: "rightThigh", label: "Right thigh" }, { id: "calf", label: "Calf" },
];

function BodyTab() {
  const profile = useProfile();
  const toast = useToast();
  const unit = profile.units.height;
  const rows = useLiveQuery(() => db.measurements.filter((m) => !m.deletedAt).toArray(), []) ?? [];
  const [kind, setKind] = useState<MeasurementKind>("waist");
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Partial<Record<MeasurementKind, number | "">>>({});
  const list = rows.filter((m) => m.kind === kind).sort((a, b) => a.date.localeCompare(b.date));
  const latest = (k: MeasurementKind) => rows.filter((m) => m.kind === k).sort((a, b) => b.date.localeCompare(a.date))[0];
  const conv = (cm: number) => Math.round(cmToUnit(cm, unit) * 10) / 10;

  async function save() {
    let n = 0;
    for (const [k, v] of Object.entries(vals)) if (v !== "" && v !== undefined) { await put("measurements", { id: uid("m"), date: today(), kind: k as MeasurementKind, cm: unitToCm(Number(v), unit), updatedAt: 0 }); n++; }
    scheduleSync(); setOpen(false); setVals({}); toast(`Saved ${n} measurement${n === 1 ? "" : "s"}`);
  }

  return (
    <Page>
      <div className="flex items-center justify-between"><div className="eyebrow">Measurements</div><Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus size={16} /> Log</Button></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {KINDS.slice(0, 5).map((k) => { const l = latest(k.id); return <Stat key={k.id} label={k.label} value={l ? conv(l.cm) : "–"} unit={unit} sub={l ? formatShort(l.date) : "not logged"} />; })}
      </div>
      <section className="card p-4">
        <div className="scroll-x -mx-4 mb-3 flex gap-2 px-4">{KINDS.map((k) => <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</Chip>)}</div>
        {list.length ? <TrendChart data={list.map((m) => ({ date: m.date, value: conv(m.cm) }))} series={[{ key: "value", name: KINDS.find((k) => k.id === kind)!.label, color: "var(--accent)", dot: true }]} fmtValue={(v) => `${v} ${unit}`} /> : <EmptyState icon={<Ruler size={26} />} title={`No ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()} measurements`} body="Tape measurements catch changes the scale hides." />}
        {list.length > 0 && (
          <div className="mt-3 divide-y divide-line">{[...list].reverse().slice(0, 5).map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-2 text-[14px]"><span className="flex-1">{formatDay(m.date)}</span><span className="tnum font-medium">{conv(m.cm)} {unit}</span><button aria-label="Delete" onClick={async () => { await remove("measurements", m.id); scheduleSync(); }} className="text-ink-3 hover:text-bad"><Trash2 size={15} /></button></div>
          ))}</div>
        )}
      </section>
      <BiometricsSection />
      <Sheet open={open} onClose={() => setOpen(false)} title="Log measurements" footer={<Button full variant="primary" onClick={save}>Save</Button>}>
        <p className="mb-3 text-[13px] text-ink-2">Fill in any you measured today; leave the rest blank.</p>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => <Field key={k.id} label={k.label}><NumberInput value={vals[k.id] ?? ""} onChange={(v) => setVals((s) => ({ ...s, [k.id]: v }))} suffix={unit} step={0.1} placeholder={latest(k.id) ? String(conv(latest(k.id)!.cm)) : ""} /></Field>)}
        </div>
      </Sheet>
    </Page>
  );
}

/* ───────────────────────────── Progress photos ───────────────────────────── */
function PhotosTab() {
  const toast = useToast();
  const photos = useLiveQuery(() => db.photos.orderBy("at").filter((p) => !p.deletedAt).toArray(), []) ?? [];
  const [all, setAll] = useState(false);
  const [view, setView] = useState<Photo | null>(null);
  const [del, setDel] = useState<Photo | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const picks = all ? photos : pickEvenlySpaced(photos, 6);
  const span = photos.length > 1 ? Math.round((photos[photos.length - 1].at - photos[0].at) / 86_400_000) : 0;

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) await addPhoto(await compressImage(f));
    toast(`Added ${files.length} photo${files.length > 1 ? "s" : ""}`);
  }

  return (
    <Page>
      <div className="flex items-center justify-between">
        <div className="eyebrow">{photos.length} photos{span ? ` · ${span} days` : ""}</div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => libRef.current?.click()}><ImageIcon size={16} /> Library</Button>
          <Button size="sm" variant="primary" onClick={() => camRef.current?.click()}><Camera size={16} /> Camera</Button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files)} />
          <input ref={libRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
        </div>
      </div>
      {photos.length === 0 ? <EmptyState icon={<Images size={28} />} title="No progress photos" body="Same spot, same light, same time of day. Photos stay on your devices and your own sync server." /> : (
        <>
          {photos.length >= 2 && (
            <section className="card p-3">
              <div className="mb-2 text-[13px] font-semibold">First vs latest</div>
              <div className="grid grid-cols-2 gap-2">
                {[photos[0], photos[photos.length - 1]].map((p, i) => (
                  <button key={p.id} onClick={() => setView(p)} className="relative overflow-hidden rounded-xl" style={{ aspectRatio: "3 / 4" }}><img src={p.dataUrl} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{i === 0 ? "First" : "Latest"} · {formatShort(p.date)}</span></button>
                ))}
              </div>
            </section>
          )}
          <div className="grid grid-cols-3 gap-2">
            {picks.map((p) => <button key={p.id} onClick={() => setView(p)} className="relative overflow-hidden rounded-xl" style={{ aspectRatio: "3 / 4" }}><img src={p.dataUrl} alt="" className="h-full w-full object-cover" loading="lazy" /><span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{formatShort(p.date)}</span></button>)}
          </div>
          {photos.length > 6 && <Button variant="ghost" onClick={() => setAll((a) => !a)} className="self-center">{all ? "Show timeline picks" : `Show all ${photos.length}`}</Button>}
        </>
      )}
      <Sheet open={!!view} onClose={() => setView(null)} title={view ? formatDay(view.date, { relative: false, long: true }) : ""}>
        {view && <><img src={view.dataUrl} alt="" className="w-full rounded-xl" /><Button variant="danger" className="mt-3" onClick={() => { setDel(view); setView(null); }}><Trash2 size={16} /> Delete photo</Button></>}
      </Sheet>
      <Confirm open={!!del} title="Delete this photo?" onCancel={() => setDel(null)} onConfirm={async () => { if (del) await deletePhoto(del.id); setDel(null); }} />
    </Page>
  );
}
