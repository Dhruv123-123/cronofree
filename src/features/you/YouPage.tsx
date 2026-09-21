import { useEffect, useRef, useState } from "react";
import { Target, UserRound, SlidersHorizontal, Cloud, Database, Globe, Info, ChevronRight, Check, Dumbbell } from "lucide-react";
import type { Profile } from "@/db/types";
import { useProfile, updateProfile, useSyncStatus } from "@/hooks";
import { useCheckin } from "@/lib/checkin";
import { ACTIVITY_LABELS } from "@/lib/energy";
import { kgToUnit, cmToUnit, unitToCm, fmt } from "@/lib/units";
import { getSyncConfig, setSyncConfig, syncNow, testConnection, exportAll, importAll, wipeLocal } from "@/lib/sync";
import { kvGet, kvSet, db } from "@/db";
import { formatTime } from "@/lib/dates";
import { PageHeader, Page } from "@/components/Shell";
import { Button, Sheet, Field, Input, NumberInput, Segmented, Toggle, Confirm, useToast, Row } from "@/components/ui";
import GoalsSheet from "./GoalsSheet";
import { getTrainPrefs, setTrainPrefs, convertTrainingUnits, DEFAULT_TRAIN_PREFS, type TrainPrefs } from "@/features/train/trainRepo";
import type { SourceSettings } from "@/lib/foodSources";

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[15px] font-semibold"><span className="text-ink-3">{icon}</span>{title}</div>
      <div className="divide-y divide-line px-4">{children}</div>
    </section>
  );
}

export default function YouPage() {
  const profile = useProfile();
  const toast = useToast();
  const c = useCheckin(profile);
  const [goals, setGoals] = useState(false);
  const [prof, setProf] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [sync, setSync] = useState(false);
  const [sources, setSources] = useState(false);
  const [train, setTrain] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const s = useSyncStatus();
  const unit = profile.units.weight;

  async function doExport() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `cronofree-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Backup downloaded");
  }
  async function doExportCsv() {
    const rows = await db.entries.filter((e) => !e.deletedAt).toArray();
    const head = ["date", "meal", "time", "name", "brand", "grams", "serving", "kcal", "protein", "carbs", "fat", "fiber", "sugar", "sodium"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...rows.sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, e.mealId, e.time, e.name, e.brand, Math.round(e.grams), e.servingLabel ? `${e.servingQty} × ${e.servingLabel}` : "", ...["kcal", "protein", "carbs", "fat", "fiber", "sugar", "sodium"].map((k) => Math.round(((e.nutrients as Record<string, number | undefined>)[k] ?? 0) * 10) / 10)].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `cronofree-diary-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    toast("Diary CSV downloaded");
  }
  async function doImport(f: File | undefined) {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== "cronofree") throw new Error("Not a Cronofree backup");
      const n = await importAll(data);
      toast(`Imported ${n} records`);
    } catch (e) { toast(`Import failed: ${(e as Error).message}`, "warn"); }
  }

  return (
    <>
      <PageHeader title={profile.name ? profile.name : "You"} sub="Goals, profile & settings" />
      <Page>
        <button onClick={() => setGoals(true)} className="card flex items-center gap-4 p-4 text-left active:bg-raised">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Target size={22} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">{profile.goal === "lose" ? "Losing fat" : profile.goal === "gain" ? "Building muscle" : "Maintaining"}{profile.rateKgPerWeek ? ` · ${profile.rateKgPerWeek > 0 ? "+" : ""}${(kgToUnit(profile.rateKgPerWeek, unit)).toFixed(2)} ${unit}/wk` : ""}</div>
            <div className="tnum text-[13px] text-ink-2">{fmt(profile.targets.kcal)} kcal · {profile.targets.protein}p / {profile.targets.carbs}c / {profile.targets.fat}f{profile.weekdayTargets && Object.keys(profile.weekdayTargets).length ? " · cycling" : ""}</div>
            <div className="text-[12px] text-ink-3">Expenditure {c ? fmt(c.currentTdee) : "…"} kcal · {profile.expenditureMode}</div>
          </div>
          <ChevronRight size={20} className="text-ink-3" />
        </button>

        <Section icon={<UserRound size={18} />} title="Profile">
          <Row label="Body & activity" sub={`${profile.sex === "male" ? "Male" : "Female"} · born ${profile.birthYear} · ${Math.round(cmToUnit(profile.heightCm, profile.units.height))} ${profile.units.height} · ${ACTIVITY_LABELS[profile.activity].split(" · ")[0]}`} onClick={() => setProf(true)} right={<ChevronRight size={18} className="text-ink-3" />} />
        </Section>

        <Section icon={<SlidersHorizontal size={18} />} title="Preferences">
          <Row label="Units, meals, water, theme" sub={`${unit} · ${profile.units.height} · ${profile.mealNames.join(", ")} · ${profile.theme}`} onClick={() => setPrefs(true)} right={<ChevronRight size={18} className="text-ink-3" />} />
          <Row label="Training" sub="Rest timer, auto-start" onClick={() => setTrain(true)} right={<ChevronRight size={18} className="text-ink-3" />} />
        </Section>

        <Section icon={<Cloud size={18} />} title="Sync">
          <Row label={s.state === "off" ? "Not connected" : s.state === "error" ? "Sync error" : "Connected to your server"} sub={s.state === "off" ? "Run the server on your computer and pair this device" : `${s.message ?? ""}${s.lastSyncAt ? ` · last ${formatTime(s.lastSyncAt)}` : ""}${s.pending ? ` · ${s.pending} pending` : ""}`} onClick={() => setSync(true)} right={<ChevronRight size={18} className="text-ink-3" />} />
        </Section>

        <Section icon={<Globe size={18} />} title="Food sources">
          <Row label="USDA & Open Food Facts" sub="Online search settings and API key" onClick={() => setSources(true)} right={<ChevronRight size={18} className="text-ink-3" />} />
        </Section>

        <Section icon={<Database size={18} />} title="Your data">
          <Row label="Download backup (JSON)" sub="Everything: foods, diary, weights, workouts, photos" onClick={doExport} />
          <Row label="Export diary (CSV)" sub="Every food entry with macros" onClick={doExportCsv} />
          <Row label="Restore from backup" sub="Merges; newer records win" onClick={() => fileRef.current?.click()} />
          <Row label={<span className="text-bad">Erase data on this device</span>} sub="Your server copy is not touched" onClick={() => setConfirmWipe(true)} />
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => doImport(e.target.files?.[0])} />
        </Section>

        <Section icon={<Info size={18} />} title="About">
          <div className="py-3 text-[13px] text-ink-2">
            <p>Cronofree keeps everything on your devices. Food search uses USDA FoodData Central and Open Food Facts; nothing you log leaves your phone except to the sync server you run.</p>
            <p className="mt-2 text-ink-3">v1.0 · {navigator.onLine ? "online" : "offline"}</p>
          </div>
        </Section>
      </Page>

      <GoalsSheet open={goals} onClose={() => setGoals(false)} profile={profile} tdee={c?.currentTdee ?? 2200} trendKg={c?.trendKg ?? null} />
      <ProfileSheet open={prof} onClose={() => setProf(false)} profile={profile} />
      <PrefsSheet open={prefs} onClose={() => setPrefs(false)} profile={profile} />
      <TrainPrefsSheet open={train} onClose={() => setTrain(false)} />
      <SyncSheet open={sync} onClose={() => setSync(false)} />
      <SourcesSheet open={sources} onClose={() => setSources(false)} />
      <Confirm open={confirmWipe} title="Erase all data on this device?" body="Diary, foods, workouts and photos stored here are deleted. Data on your sync server stays and can be pulled again by pairing." confirmLabel="Erase" onCancel={() => setConfirmWipe(false)} onConfirm={async () => { await wipeLocal(); location.reload(); }} />
    </>
  );
}

function ProfileSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const toast = useToast();
  const [p, setP] = useState(profile);
  const [h, setH] = useState<number | "">(Math.round(cmToUnit(profile.heightCm, profile.units.height) * 10) / 10);
  useEffect(() => { if (open) { setP(profile); setH(Math.round(cmToUnit(profile.heightCm, profile.units.height) * 10) / 10); } }, [open, profile]);
  return (
    <Sheet open={open} onClose={onClose} title="Body & activity" footer={<Button full variant="primary" onClick={async () => { await updateProfile({ name: p.name, sex: p.sex, birthYear: p.birthYear, heightCm: unitToCm(Number(h) || 170, profile.units.height), activity: p.activity }); toast("Profile saved"); onClose(); }}>Save</Button>}>
      <div className="flex flex-col gap-3">
        <Field label="Name (optional)"><Input value={p.name ?? ""} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label="Sex (for energy and nutrient targets)"><Segmented value={p.sex} onChange={(v) => setP({ ...p, sex: v })} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} className="w-full" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Birth year"><NumberInput value={p.birthYear} onChange={(v) => setP({ ...p, birthYear: Number(v) || 1990 })} /></Field>
          <Field label={`Height (${profile.units.height})`}><NumberInput value={h} onChange={setH} step={0.5} suffix={profile.units.height} /></Field>
        </div>
        <Field label="Activity outside the gym" hint="Used only by the formula; adaptive mode learns your real expenditure.">
          <select value={p.activity} onChange={(e) => setP({ ...p, activity: e.target.value as Profile["activity"] })} className="field">{Object.entries(ACTIVITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
      </div>
    </Sheet>
  );
}

function PrefsSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const toast = useToast();
  const [p, setP] = useState(profile);
  const [meals, setMeals] = useState(profile.mealNames.join(", "));
  useEffect(() => { if (open) { setP(profile); setMeals(profile.mealNames.join(", ")); } }, [open, profile]);
  async function save() {
    const names = meals.split(",").map((s) => s.trim()).filter(Boolean);
    if (p.units.weight !== profile.units.weight) await convertTrainingUnits(profile.units.weight, p.units.weight);
    await updateProfile({ units: p.units, mealNames: names.length ? names : profile.mealNames, waterGoalMl: p.waterGoalMl, fastingDefaultHours: p.fastingDefaultHours, theme: p.theme, startOfWeek: p.startOfWeek });
    toast("Preferences saved"); onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Preferences" footer={<Button full variant="primary" onClick={save}>Save</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Theme"><Segmented value={p.theme} onChange={(v) => setP({ ...p, theme: v })} options={[{ value: "system", label: "System" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} className="w-full" /></Field>
        <Field label="Body weight & lifting weights" hint="Changing this converts your logged workouts."><Segmented value={p.units.weight} onChange={(v) => setP({ ...p, units: { ...p.units, weight: v } })} options={[{ value: "kg", label: "Kilograms" }, { value: "lb", label: "Pounds" }]} className="w-full" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Height & tape"><Segmented value={p.units.height} onChange={(v) => setP({ ...p, units: { ...p.units, height: v } })} options={[{ value: "cm", label: "cm" }, { value: "in", label: "in" }]} className="w-full" /></Field>
          <Field label="Water"><Segmented value={p.units.volume} onChange={(v) => setP({ ...p, units: { ...p.units, volume: v } })} options={[{ value: "ml", label: "mL" }, { value: "oz", label: "fl oz" }]} className="w-full" /></Field>
        </div>
        <Field label="Meals (comma separated)" hint="Existing entries keep their meal; rename carefully."><Input value={meals} onChange={(e) => setMeals(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Water goal"><NumberInput value={p.waterGoalMl} onChange={(v) => setP({ ...p, waterGoalMl: Number(v) || 2000 })} suffix="mL" /></Field>
          <Field label="Default fast"><NumberInput value={p.fastingDefaultHours} onChange={(v) => setP({ ...p, fastingDefaultHours: Number(v) || 16 })} suffix="h" /></Field>
        </div>
        <Field label="Week starts on"><Segmented value={String(p.startOfWeek)} onChange={(v) => setP({ ...p, startOfWeek: Number(v) as 0 | 1 })} options={[{ value: "1", label: "Monday" }, { value: "0", label: "Sunday" }]} className="w-full" /></Field>
      </div>
    </Sheet>
  );
}

function TrainPrefsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<TrainPrefs>(DEFAULT_TRAIN_PREFS);
  useEffect(() => { if (open) getTrainPrefs().then(setP); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Training" footer={<Button full variant="primary" onClick={async () => { await setTrainPrefs(p); toast("Saved"); onClose(); }}>Save</Button>}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[13px] text-ink-2"><Dumbbell size={16} /> Rest timer starts automatically when you complete a set.</div>
        <div className="flex items-center justify-between rounded-xl bg-raised px-3 py-2"><span className="text-[14px]">Auto-start rest timer</span><Toggle checked={p.autoStartTimer} onChange={(v) => setP({ ...p, autoStartTimer: v })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Rest · accessories"><NumberInput value={p.defaultRest} onChange={(v) => setP({ ...p, defaultRest: Number(v) || 90 })} suffix="s" /></Field>
          <Field label="Rest · heavy lifts"><NumberInput value={p.heavyRest} onChange={(v) => setP({ ...p, heavyRest: Number(v) || 180 })} suffix="s" /></Field>
        </div>
      </div>
    </Sheet>
  );
}

function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const s = useSyncStatus();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [auto, setAuto] = useState(true);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) getSyncConfig().then((c) => { setUrl(c.url); setToken(c.token); setAuto(c.autoSync); setTest(null); }); }, [open]);
  const sameOrigin = location.pathname && !/^https?:\/\/localhost:5173/.test(location.origin);
  async function save() {
    await setSyncConfig({ url: url.trim(), token: token.trim(), autoSync: auto });
    toast("Sync settings saved");
    if (token.trim()) void syncNow();
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Sync with your computer" footer={<div className="flex gap-2"><Button full onClick={async () => { setBusy(true); setTest(await testConnection({ url: url.trim(), token: token.trim() })); setBusy(false); }} disabled={busy}>Test</Button><Button full variant="primary" onClick={save}>Save</Button></div>}>
      <div className="flex flex-col gap-3 text-[14px]">
        <div className="rounded-xl bg-raised p-3 text-[13px] text-ink-2">
          <div className="font-semibold text-ink">How it works</div>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>On your computer run <code className="mono text-[12px]">npm start</code> in the Cronofree folder. It prints a URL and a pairing token.</li>
            <li>Open that URL on your phone (same Wi-Fi) and add it to your Home Screen.</li>
            <li>Paste the token here on every device. Server URL can stay blank when the app is opened from the server itself.</li>
          </ol>
          <p className="mt-2">Everything stays local-first: you can log offline and it merges when you're back on the network. Newer edits win.</p>
        </div>
        <Field label="Server URL" hint={sameOrigin ? "Leave blank to use the address this app was opened from." : "e.g. http://192.168.1.20:8787 or your Tailscale / tunnel address"}><Input placeholder={location.origin} value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" /></Field>
        <Field label="Pairing token"><Input value={token} onChange={(e) => setToken(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="printed by the server" /></Field>
        <div className="flex items-center justify-between rounded-xl bg-raised px-3 py-2"><span>Sync automatically</span><Toggle checked={auto} onChange={setAuto} /></div>
        {test && <div className={`flex items-center gap-2 text-[13px] ${test.ok ? "text-good" : "text-bad"}`}>{test.ok && <Check size={14} />}{test.message}</div>}
        {s.state !== "off" && <div className="text-[12px] text-ink-3">Status: {s.message ?? s.state}{s.lastSyncAt ? ` · last sync ${formatTime(s.lastSyncAt)}` : ""}{s.pending ? ` · ${s.pending} changes waiting` : ""}</div>}
        {s.state !== "off" && <Button onClick={() => syncNow()} disabled={s.state === "syncing"}>Sync now</Button>}
      </div>
    </Sheet>
  );
}

function SourcesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [cfg, setCfg] = useState<SourceSettings>({ offEnabled: true, usdaEnabled: true, usdaApiKey: "" });
  useEffect(() => { if (open) kvGet<SourceSettings>("foodSources", {}).then((c) => setCfg({ offEnabled: true, usdaEnabled: true, usdaApiKey: "", ...c })); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Food sources" footer={<Button full variant="primary" onClick={async () => { await kvSet("foodSources", cfg); toast("Saved"); onClose(); }}>Save</Button>}>
      <div className="flex flex-col gap-3 text-[14px]">
        <div className="flex items-center justify-between rounded-xl bg-raised px-3 py-2"><div><div>USDA FoodData Central</div><div className="text-[12px] text-ink-3">Whole foods with full vitamins & minerals</div></div><Toggle checked={cfg.usdaEnabled !== false} onChange={(v) => setCfg({ ...cfg, usdaEnabled: v })} /></div>
        <Field label="USDA API key (free)" hint="The shared DEMO_KEY allows ~30 searches an hour. Get your own in seconds at api.data.gov/signup."><Input value={cfg.usdaApiKey ?? ""} onChange={(e) => setCfg({ ...cfg, usdaApiKey: e.target.value })} autoCapitalize="none" spellCheck={false} placeholder="DEMO_KEY" /></Field>
        <div className="flex items-center justify-between rounded-xl bg-raised px-3 py-2"><div><div>Open Food Facts</div><div className="text-[12px] text-ink-3">Packaged products and barcodes, community data</div></div><Toggle checked={cfg.offEnabled !== false} onChange={(v) => setCfg({ ...cfg, offEnabled: v })} /></div>
        <p className="text-[12px] text-ink-3">Results you log are saved on this device, so they keep working offline and sync to your other devices.</p>
      </div>
    </Sheet>
  );
}
