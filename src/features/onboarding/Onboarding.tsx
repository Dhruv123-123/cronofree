import { useState } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import type { GoalType, ActivityLevel } from "@/db/types";
import { updateProfile } from "@/hooks";
import { defaultProfile } from "@/lib/bootstrap";
import { bmr, ACTIVITY_FACTORS, ACTIVITY_LABELS, kcalTargetFor, defaultMacros, defaultRateFor } from "@/lib/energy";
import { unitToKg, unitToCm, kgToUnit } from "@/lib/units";
import { put } from "@/db";
import { uid } from "@/lib/id";
import { today } from "@/lib/dates";
import { Button, Field, NumberInput, Segmented, Input, Sheet, useToast } from "@/components/ui";
import { setSyncConfig, syncNow, testConnection } from "@/lib/sync";
import { db } from "@/db";

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [birthYear, setBirthYear] = useState<number | "">(1995);
  const [height, setHeight] = useState<number | "">(175);
  const [weight, setWeight] = useState<number | "">(75);
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<GoalType>("maintain");
  const [rate, setRate] = useState<number | "">(0.5);
  const [theme, setTheme] = useState<"system" | "dark" | "light">("system");
  const [pair, setPair] = useState(false);
  const [pairUrl, setPairUrl] = useState("");
  const [pairToken, setPairToken] = useState("");
  const [pairMsg, setPairMsg] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);
  const toast = useToast();

  async function doPair() {
    setPairing(true); setPairMsg(null);
    const t = await testConnection({ url: pairUrl.trim(), token: pairToken.trim() });
    if (!t.ok) { setPairMsg(t.message); setPairing(false); return; }
    await setSyncConfig({ url: pairUrl.trim(), token: pairToken.trim(), autoSync: true });
    await syncNow();
    const p = await db.profile.get("me");
    setPairing(false);
    if (p?.onboarded) { toast("Paired · your data is here"); setPair(false); return; }
    setPairMsg("Connected, but the server has no profile yet. Finish setup here; it will sync everywhere.");
  }

  const wu = units === "metric" ? "kg" : "lb";
  const hu = units === "metric" ? "cm" : "in";
  const kg = unitToKg(Number(weight) || 70, wu);
  const cm = unitToCm(Number(height) || 170, hu);
  const age = new Date().getFullYear() - (Number(birthYear) || 1990);
  const tdee = Math.round(bmr(sex, kg, cm, age) * ACTIVITY_FACTORS[activity]);
  const signedRate = goal === "lose" ? -Math.abs(unitToKg(Number(rate) || 0, wu)) : goal === "gain" ? Math.abs(unitToKg(Number(rate) || 0, wu)) : 0;
  const kcal = kcalTargetFor(tdee, signedRate);
  const macros = defaultMacros(kcal, kg, goal);

  async function finish() {
    const base = defaultProfile();
    await updateProfile({
      ...base, name: name.trim() || undefined, sex, birthYear: Number(birthYear) || 1990, heightCm: cm, activity, goal, rateKgPerWeek: signedRate,
      units: { weight: wu, height: hu, volume: units === "metric" ? "ml" : "oz" }, targets: macros, expenditure: tdee, expenditureUpdatedAt: Date.now(), theme, onboarded: true,
    });
    await put("weights", { id: uid("w"), date: today(), at: Date.now(), kg, updatedAt: 0 });
  }

  const steps = [
    <div key="0" className="flex flex-col gap-5">
      <div><img src="/icons/icon.svg" alt="" className="mb-5 h-16 w-16 rounded-2xl" /><h1 className="text-[34px] font-semibold leading-tight">Food and training,<br />on your own terms.</h1><p className="mt-3 max-w-[38ch] text-[16px] text-ink-2">Cronofree logs what you eat and what you lift, learns your real energy expenditure, and keeps every byte on devices you control.</p></div>
      <Field label="What should we call you? (optional)"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
      <Field label="Units"><Segmented value={units} onChange={(v) => { setUnits(v); if (v === "imperial") { setHeight(69); setWeight(165); setRate(1); } else { setHeight(175); setWeight(75); setRate(0.5); } }} options={[{ value: "metric", label: "kg · cm" }, { value: "imperial", label: "lb · in" }]} className="w-full" /></Field>
      <Field label="Appearance"><Segmented value={theme} onChange={setTheme} options={[{ value: "system", label: "System" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} className="w-full" /></Field>
      <button onClick={() => setPair(true)} className="text-left text-[14px] font-medium text-accent">Already using Cronofree on another device? Pair this one instead →</button>
    </div>,
    <div key="1" className="flex flex-col gap-4">
      <h1 className="text-[28px] font-semibold">About you</h1>
      <p className="text-[14px] text-ink-2">Used for your starting calorie estimate and nutrient targets. Adaptive mode replaces the estimate with your real data within a couple of weeks.</p>
      <Field label="Sex"><Segmented value={sex} onChange={setSex} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} className="w-full" /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Birth year"><NumberInput value={birthYear} onChange={setBirthYear} /></Field>
        <Field label={`Height`}><NumberInput value={height} onChange={setHeight} suffix={hu} /></Field>
        <Field label="Weight"><NumberInput value={weight} onChange={setWeight} suffix={wu} step={0.1} /></Field>
      </div>
      <Field label="Activity outside training"><select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)} className="field">{Object.entries(ACTIVITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    </div>,
    <div key="2" className="flex flex-col gap-4">
      <h1 className="text-[28px] font-semibold">Your goal</h1>
      <Segmented value={goal} onChange={(g) => { setGoal(g); setRate(Math.abs(Math.round(kgToUnit(defaultRateFor(g), wu) * 100) / 100)); }} options={[{ value: "lose", label: "Lose fat" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Build muscle" }]} className="w-full" />
      {goal !== "maintain" && <Field label={`How fast? (${wu} per week)`} hint={goal === "lose" ? "0.5–1 % of body weight a week keeps muscle and is sustainable." : "Slow gains (0.25–0.5 kg a week) keep fat in check."}><NumberInput value={rate} onChange={setRate} step={0.05} suffix={`${wu}/wk`} /></Field>}
      <div className="rounded-2xl bg-raised p-4">
        <div className="text-[12px] text-ink-3">Estimated maintenance</div>
        <div className="tnum display text-[28px] font-semibold">{tdee.toLocaleString()} <span className="text-[13px] font-normal text-ink-3">kcal/day</span></div>
        <div className="mt-3 text-[12px] text-ink-3">Daily target</div>
        <div className="tnum display text-[34px] font-semibold text-accent">{kcal.toLocaleString()} <span className="text-[13px] font-normal text-ink-3">kcal</span></div>
        <div className="tnum mt-2 flex gap-4 text-[13px]"><span><span style={{ color: "var(--protein)" }}>●</span> {macros.protein} g protein</span><span><span style={{ color: "var(--carbs)" }}>●</span> {macros.carbs} g carbs</span><span><span style={{ color: "var(--fat)" }}>●</span> {macros.fat} g fat</span></div>
      </div>
      <p className="text-[13px] text-ink-2">You can change every number later under You → Goals, set different targets per weekday, or let the weekly check-in adjust them from your weight trend.</p>
    </div>,
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col px-5 pb-8 pt-10 safe-top safe-bottom">
      <Sheet open={pair} onClose={() => setPair(false)} title="Pair with your server" footer={<Button full variant="primary" disabled={!pairToken.trim() || pairing} onClick={doPair}>{pairing ? "Connecting…" : "Connect and pull my data"}</Button>}>
        <p className="mb-3 text-[14px] text-ink-2">Run <code className="mono text-[12px]">npm start</code> on the computer that already has your data. It prints a URL and a pairing token.</p>
        <div className="flex flex-col gap-3">
          <Field label="Server URL" hint="Leave blank if you opened this app from the server's own address."><Input placeholder={location.origin} value={pairUrl} onChange={(e) => setPairUrl(e.target.value)} inputMode="url" autoCapitalize="none" /></Field>
          <Field label="Pairing token"><Input value={pairToken} onChange={(e) => setPairToken(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></Field>
          {pairMsg && <p className="text-[13px] text-warn">{pairMsg}</p>}
        </div>
      </Sheet>
      <div className="mb-8 flex gap-1.5">{steps.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />)}</div>
      <div className="anim-fade flex-1" key={step}>{steps[step]}</div>
      <div className="mt-8 flex gap-2">
        {step > 0 && <Button size="lg" onClick={() => setStep(step - 1)}><ArrowLeft size={18} /> Back</Button>}
        {step < steps.length - 1 ? <Button size="lg" full variant="primary" onClick={() => setStep(step + 1)}>Continue <ArrowRight size={18} /></Button> : <Button size="lg" full variant="primary" onClick={finish}>Start logging</Button>}
      </div>
    </div>
  );
}
