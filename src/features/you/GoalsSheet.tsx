import { useEffect, useState } from "react";
import type { Profile, MacroTargets, GoalType, ExpenditureMode } from "@/db/types";
import { updateProfile } from "@/hooks";
import { defaultMacros, kcalTargetFor, macrosFromPercent } from "@/lib/energy";
import { kgToUnit, unitToKg, fmt } from "@/lib/units";
import { Sheet, Button, Field, NumberInput, Segmented, Toggle, useToast } from "@/components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRESETS: { id: string; label: string; pct: { protein: number; carbs: number; fat: number }; netCarbs?: number }[] = [
  { id: "balanced", label: "Balanced 30/40/30", pct: { protein: 30, carbs: 40, fat: 30 } },
  { id: "highprotein", label: "High protein 40/30/30", pct: { protein: 40, carbs: 30, fat: 30 } },
  { id: "lowfat", label: "Low fat 25/55/20", pct: { protein: 25, carbs: 55, fat: 20 } },
  { id: "keto", label: "Keto 25/5/70", pct: { protein: 25, carbs: 5, fat: 70 }, netCarbs: 25 },
  { id: "zone", label: "Zone 30/40/30", pct: { protein: 30, carbs: 40, fat: 30 } },
];

export default function GoalsSheet({ open, onClose, profile, tdee, trendKg }: { open: boolean; onClose: () => void; profile: Profile; tdee: number; trendKg: number | null }) {
  const toast = useToast();
  const unit = profile.units.weight;
  const [goal, setGoal] = useState<GoalType>(profile.goal);
  const [rate, setRate] = useState<number | "">(Math.abs(profile.rateKgPerWeek));
  const [target, setTarget] = useState<number | "">(profile.targetWeightKg ? Math.round(kgToUnit(profile.targetWeightKg, unit) * 10) / 10 : "");
  const [mode, setMode] = useState<ExpenditureMode>(profile.expenditureMode);
  const [manual, setManual] = useState<number | "">(profile.manualTdee ?? Math.round(tdee));
  const [t, setT] = useState<MacroTargets>(profile.targets);
  const [byPct, setByPct] = useState(false);
  const [pct, setPct] = useState({ protein: 30, carbs: 40, fat: 30 });
  const [weekday, setWeekday] = useState<Partial<Record<number, Partial<MacroTargets>>>>(profile.weekdayTargets ?? {});
  const [showWeekday, setShowWeekday] = useState(!!profile.weekdayTargets && Object.keys(profile.weekdayTargets).length > 0);
  const [netCarbs, setNetCarbs] = useState<number | "">(profile.netCarbsTarget ?? "");

  useEffect(() => {
    if (!open) return;
    setGoal(profile.goal); setRate(Math.abs(profile.rateKgPerWeek)); setMode(profile.expenditureMode); setT(profile.targets); setWeekday(profile.weekdayTargets ?? {});
    setTarget(profile.targetWeightKg ? Math.round(kgToUnit(profile.targetWeightKg, unit) * 10) / 10 : "");
    const k = profile.targets.kcal || 1;
    setPct({ protein: Math.round((profile.targets.protein * 4 / k) * 100), carbs: Math.round((profile.targets.carbs * 4 / k) * 100), fat: Math.round((profile.targets.fat * 9 / k) * 100) });
  }, [open, profile, unit]);

  const signedRate = goal === "lose" ? -Math.abs(Number(rate) || 0) : goal === "gain" ? Math.abs(Number(rate) || 0) : 0;
  const effTdee = mode === "manual" ? Number(manual) || tdee : tdee;
  const suggestedKcal = kcalTargetFor(effTdee, unitToKg(signedRate, unit) || 0);
  const macroKcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
  const pctSum = pct.protein + pct.carbs + pct.fat;
  const kgNow = trendKg ?? profile.targetWeightKg ?? 75;

  function useSuggested() {
    setT(defaultMacros(suggestedKcal, kgNow, goal));
  }
  function setPctField(k: "protein" | "carbs" | "fat", v: number) {
    const next = { ...pct, [k]: v };
    setPct(next);
    if (next.protein + next.carbs + next.fat === 100) setT(macrosFromPercent(t.kcal, next));
  }

  async function save() {
    await updateProfile({
      goal, rateKgPerWeek: unitToKg(signedRate, unit), targetWeightKg: target ? unitToKg(Number(target), unit) : undefined,
      expenditureMode: mode, manualTdee: mode === "manual" ? Number(manual) || undefined : profile.manualTdee,
      targets: { kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat) },
      weekdayTargets: showWeekday ? weekday : undefined,
      netCarbsTarget: netCarbs === "" ? undefined : Number(netCarbs),
    });
    toast("Goals saved"); onClose();
  }

  const wk = (d: number, k: keyof MacroTargets) => weekday[d]?.[k] ?? "";
  const setWk = (d: number, k: keyof MacroTargets, v: number | "") => setWeekday((w) => { const row = { ...(w[d] ?? {}) }; if (v === "") delete row[k]; else row[k] = Number(v); const next = { ...w }; if (Object.keys(row).length) next[d] = row; else delete next[d]; return next; });

  return (
    <Sheet open={open} onClose={onClose} title="Goals & targets" size="lg" footer={<Button full variant="primary" onClick={save}>Save goals</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Goal">
          <Segmented value={goal} onChange={(g) => { setGoal(g); if (g === "maintain") setRate(0); else if (!rate) setRate(g === "lose" ? Math.round(kgToUnit(0.5, unit) * 10) / 10 : Math.round(kgToUnit(0.25, unit) * 100) / 100); }} options={[{ value: "lose", label: "Lose fat" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Build muscle" }]} className="w-full" />
        </Field>
        {goal !== "maintain" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Rate (${unit} per week)`} hint={goal === "lose" ? "0.5–1 % of body weight per week keeps muscle." : "0.25–0.5 kg/wk limits fat gain."}><NumberInput value={rate} onChange={setRate} step={0.05} suffix={`${unit}/wk`} /></Field>
            <Field label="Target weight (optional)"><NumberInput value={target} onChange={setTarget} step={0.1} suffix={unit} /></Field>
          </div>
        )}

        <Field label="How to estimate your expenditure" hint="Adaptive learns your real TDEE from logged food and weight trend, like MacroFactor. Formula uses Mifflin-St Jeor and your activity level.">
          <Segmented value={mode} onChange={setMode} options={[{ value: "adaptive", label: "Adaptive" }, { value: "formula", label: "Formula" }, { value: "manual", label: "Manual" }]} className="w-full" />
        </Field>
        {mode === "manual" && <Field label="My maintenance calories"><NumberInput value={manual} onChange={setManual} suffix="kcal" /></Field>}

        <div className="rounded-xl bg-raised p-3 text-[13px]">
          <div className="flex items-center justify-between"><span className="text-ink-2">Estimated expenditure</span><span className="tnum font-semibold">{fmt(effTdee)} kcal</span></div>
          <div className="mt-1 flex items-center justify-between"><span className="text-ink-2">Suggested target for this goal</span><span className="tnum font-semibold">{fmt(suggestedKcal)} kcal</span></div>
          <Button size="sm" variant="soft" className="mt-2" onClick={useSuggested}>Use suggested calories & macros</Button>
        </div>

        <div className="flex items-center justify-between"><div className="text-[13px] font-semibold">Daily targets</div><Segmented value={byPct ? "pct" : "g"} onChange={(v) => setByPct(v === "pct")} options={[{ value: "g", label: "grams" }, { value: "pct", label: "%" }]} /></div>
        <div className="scroll-x -mx-5 flex gap-2 px-5">{PRESETS.map((pr) => <button key={pr.id} onClick={() => { setPct(pr.pct); setByPct(true); setT(macrosFromPercent(t.kcal, pr.pct)); if (pr.netCarbs) setNetCarbs(pr.netCarbs); }} className="h-8 shrink-0 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-ink-2">{pr.label}</button>)}</div>
        <Field label="Calories"><NumberInput value={t.kcal} onChange={(v) => { const kcal = Number(v) || 0; setT(byPct && pctSum === 100 ? macrosFromPercent(kcal, pct) : { ...t, kcal }); }} suffix="kcal" /></Field>
        {byPct ? (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Protein %"><NumberInput value={pct.protein} onChange={(v) => setPctField("protein", Number(v) || 0)} suffix="%" /></Field>
            <Field label="Carbs %"><NumberInput value={pct.carbs} onChange={(v) => setPctField("carbs", Number(v) || 0)} suffix="%" /></Field>
            <Field label="Fat %"><NumberInput value={pct.fat} onChange={(v) => setPctField("fat", Number(v) || 0)} suffix="%" /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Protein"><NumberInput value={t.protein} onChange={(v) => setT({ ...t, protein: Number(v) || 0 })} suffix="g" /></Field>
            <Field label="Carbs"><NumberInput value={t.carbs} onChange={(v) => setT({ ...t, carbs: Number(v) || 0 })} suffix="g" /></Field>
            <Field label="Fat"><NumberInput value={t.fat} onChange={(v) => setT({ ...t, fat: Number(v) || 0 })} suffix="g" /></Field>
          </div>
        )}
        <div className={`text-[12px] ${Math.abs(macroKcal - t.kcal) > 60 ? "text-warn" : "text-ink-3"}`}>
          {byPct && pctSum !== 100 ? `Percentages add up to ${pctSum} % — make it 100.` : `Macros add up to ${fmt(macroKcal)} kcal${Math.abs(macroKcal - t.kcal) > 60 ? ` (target is ${fmt(t.kcal)})` : ""} · protein ${(t.protein / Math.max(1, kgNow)).toFixed(1)} g/kg`}
        </div>

        <Field label="Net carbs limit (optional, keto)" hint="Shown on Today when set. Net carbs = carbs − fiber."><NumberInput value={netCarbs} onChange={setNetCarbs} suffix="g" /></Field>
        <div className="flex items-center justify-between rounded-xl bg-raised px-3 py-2">
          <div><div className="text-[14px]">Different targets on some days</div><div className="text-[12px] text-ink-3">Calorie cycling: e.g. more carbs on training days.</div></div>
          <Toggle checked={showWeekday} onChange={setShowWeekday} label="Weekday targets" />
        </div>
        {showWeekday && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-ink-3"><th className="py-1 font-medium">Day</th><th className="font-medium">kcal</th><th className="font-medium">P</th><th className="font-medium">C</th><th className="font-medium">F</th></tr></thead>
              <tbody>{DAYS.map((d, i) => (
                <tr key={d}><td className="py-1 pr-2">{d}</td>
                  {(["kcal", "protein", "carbs", "fat"] as (keyof MacroTargets)[]).map((k) => <td key={k} className="pr-1"><input type="number" inputMode="numeric" value={wk(i, k)} placeholder={String(t[k])} onChange={(e) => setWk(i, k, e.target.value === "" ? "" : Number(e.target.value))} className="field !h-9 !px-2 tnum" /></td>)}
                </tr>
              ))}</tbody>
            </table>
            <p className="mt-1 text-[12px] text-ink-3">Blank cells use the default target.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
