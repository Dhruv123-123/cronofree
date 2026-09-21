import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, MoreHorizontal, Scale, ChevronDown, ChevronUp, Copy, Save, Trash2, CalendarDays, Flame } from "lucide-react";
import { db, put } from "@/db";
import type { DiaryEntry, Food } from "@/db/types";
import { useProfile } from "@/hooks";
import { useDay, mealsOf, suggestedMealId } from "@/lib/dayModel";
import { addDays, today, formatDay, parseISODate } from "@/lib/dates";
import { fmt, kgToUnit, unitToKg } from "@/lib/units";
import { formatAmount, netCarbs } from "@/lib/nutrients";
import { copyEntries, deleteEntry, saveMealFromEntries, mealTotals } from "@/lib/foodRepo";
import { scheduleSync } from "@/lib/sync";
import { uid } from "@/lib/id";
import { PageHeader, Page } from "@/components/Shell";
import { Ring, Bar, Sheet, Button, Input, NumberInput, Confirm, useToast, IconButton } from "@/components/ui";
import AddFoodSheet from "./AddFoodSheet";
import FoodDetailSheet from "./FoodDetailSheet";
import NutrientPanel from "./NutrientPanel";
import WaterCard from "./WaterCard";
import FastingCard from "./FastingCard";

export default function DiaryPage() {
  const profile = useProfile();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const date = params.get("d") ?? today();
  const setDate = (d: string) => setParams(d === today() ? {} : { d }, { replace: true });
  const day = useDay(date, profile);
  const meals = mealsOf(profile);
  const [add, setAdd] = useState<{ open: boolean; mealId: string }>({ open: params.get("add") === "1", mealId: suggestedMealId(profile) });
  const [editing, setEditing] = useState<{ entry: DiaryEntry; food: Food } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [showNutrients, setShowNutrients] = useState(false);
  const [saveMeal, setSaveMeal] = useState<{ mealId: string; name: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [weightOpen, setWeightOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);

  const weightToday = useLiveQuery(() => db.weights.where("date").equals(date).filter((w) => !w.deletedAt).first(), [date]);
  const lastWeight = useLiveQuery(() => db.weights.orderBy("at").reverse().filter((w) => !w.deletedAt).first(), []);

  const eaten = day.totals.kcal ?? 0;
  const budget = day.targets.kcal + day.exerciseKcal;
  const remaining = budget - eaten;
  const isToday = date === today();

  async function openEntry(e: DiaryEntry) {
    if (e.kind !== "food" || !e.foodId) return;
    const food = await db.foods.get(e.foodId);
    if (!food) { toast("Original food is gone; remove and re-add to edit.", "warn"); return; }
    setEditing({ entry: e, food });
  }

  async function doCopyMeal(mealId: string, fromDate: string) {
    const src = await db.entries.where("[date+mealId]").equals([fromDate, mealId]).filter((e) => !e.deletedAt).toArray();
    if (!src.length) { toast(`Nothing in that meal on ${formatDay(fromDate)}`, "warn"); return; }
    const n = await copyEntries(src, date, mealId);
    toast(`Copied ${n} items`);
    setMenu(null); setCopyFrom(null);
  }
  async function doCopyDay(fromDate: string) {
    const src = await db.entries.where("date").equals(fromDate).filter((e) => !e.deletedAt).toArray();
    if (!src.length) { toast(`Nothing logged on ${formatDay(fromDate)}`, "warn"); return; }
    const n = await copyEntries(src, date);
    toast(`Copied ${n} items from ${formatDay(fromDate)}`);
    setCopyFrom(null);
  }
  async function clearMeal(mealId: string) {
    for (const e of day.byMeal[mealId] ?? []) await deleteEntry(e.id);
    setConfirmClear(null); setMenu(null);
    toast("Meal cleared");
  }
  async function logWeight(v: number) {
    const kg = unitToKg(v, profile.units.weight);
    await put("weights", { id: weightToday?.id ?? uid("w"), date, at: Date.now(), kg, updatedAt: 0 });
    scheduleSync();
    setWeightOpen(false);
    toast("Weight logged");
  }

  const macro = (label: string, key: "protein" | "carbs" | "fat", color: string) => {
    const v = day.totals[key] ?? 0;
    const t = day.targets[key];
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="font-medium text-ink-2">{label}</span>
          <span className="tnum text-ink-3"><span className="font-semibold text-ink">{fmt(v)}</span> / {t} g</span>
        </div>
        <Bar value={v} max={t} color={color} />
      </div>
    );
  };

  const weightPrompt = isToday && !weightToday;
  const dayList = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(date, i - 3)), [date]);

  return (
    <>
      <PageHeader
        sub={parseISODate(date).toLocaleDateString(undefined, { year: "numeric", month: "long" })}
        title={formatDay(date)}
        right={
          <div className="flex items-center gap-1">
            <IconButton label="Previous day" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={22} /></IconButton>
            <label className="relative">
              <IconButton label="Pick a date" onClick={() => {}}><CalendarDays size={20} /></IconButton>
              <input type="date" value={date} max={addDays(today(), 60)} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a date" />
            </label>
            <IconButton label="Next day" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={22} /></IconButton>
          </div>
        }>
        <div className="scroll-x flex gap-1 px-4 pb-2 md:px-0">
          {dayList.map((d) => {
            const active = d === date;
            const dd = parseISODate(d);
            return (
              <button key={d} onClick={() => setDate(d)} className={`flex h-14 min-w-[46px] flex-1 flex-col items-center justify-center rounded-xl text-[12px] ${active ? "bg-ink text-bg" : "bg-surface text-ink-2 border border-line"}`}>
                <span className="text-[10px] uppercase tracking-wide opacity-70">{dd.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span className="tnum text-[16px] font-semibold">{dd.getDate()}</span>
              </button>
            );
          })}
        </div>
      </PageHeader>

      <Page>
        {/* Summary */}
        <section className="card p-4 md:p-5">
          <div className="flex items-center gap-5">
            <Ring value={eaten} max={budget} size={140} over>
              <div className="tnum display text-[30px] font-semibold leading-none">{fmt(Math.abs(remaining))}</div>
              <div className="mt-1 text-[11px] text-ink-3">{remaining >= 0 ? "kcal left" : "kcal over"}</div>
            </Ring>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {macro("Protein", "protein", "var(--protein)")}
              {macro("Carbs", "carbs", "var(--carbs)")}
              {macro("Fat", "fat", "var(--fat)")}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
            <div><div className="tnum text-[15px] font-semibold">{fmt(eaten)}</div><div className="text-[11px] text-ink-3">eaten</div></div>
            <div><div className="tnum text-[15px] font-semibold">{fmt(day.targets.kcal)}{day.exerciseKcal > 0 && <span className="text-[12px] text-good"> +{fmt(day.exerciseKcal)}</span>}</div><div className="text-[11px] text-ink-3">target</div></div>
            <div><div className="tnum text-[15px] font-semibold">{fmt(day.totals.fiber ?? 0)}<span className="text-[11px] font-normal text-ink-3"> / {day.nutrientTargets.fiber} g</span></div><div className="text-[11px] text-ink-3">fiber</div></div>
          </div>
          <button onClick={() => setShowNutrients((s) => !s)} className="mt-3 flex w-full items-center justify-between text-[13px] font-medium text-ink-2">
            <span>All nutrients · net carbs {formatAmount("carbs", netCarbs(day.totals))} g · sodium {formatAmount("sodium", day.totals.sodium)} mg</span>
            {showNutrients ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showNutrients && <div className="mt-3 border-t border-line pt-3"><NutrientPanel totals={day.totals} targets={day.nutrientTargets} macroTargets={day.targets} /></div>}
        </section>

        {weightPrompt && (
          <button onClick={() => setWeightOpen(true)} className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-left">
            <Scale size={20} className="text-ink-3" />
            <div className="flex-1 text-[14px]"><span className="font-medium">Log this morning's weight</span><div className="text-[12px] text-ink-3">{lastWeight ? `Last: ${kgToUnit(lastWeight.kg, profile.units.weight).toFixed(1)} ${profile.units.weight} on ${formatDay(lastWeight.date)}` : "Daily weigh-ins power the adaptive calorie target."}</div></div>
            <Plus size={18} className="text-accent" />
          </button>
        )}

        {/* Meals */}
        {meals.map((m) => {
          const items = day.byMeal[m.id] ?? [];
          const t = mealTotals(items);
          return (
            <section key={m.id} className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <h2 className="flex-1 text-[16px] font-semibold">{m.name}</h2>
                {items.length > 0 && <span className="tnum text-[13px] text-ink-2">{fmt(t.kcal)} kcal</span>}
                <IconButton label="Meal options" onClick={() => setMenu(m.id)} className="-mr-2 h-9 w-9"><MoreHorizontal size={18} /></IconButton>
              </div>
              {items.length > 0 && (
                <div className="divide-y divide-line px-4">
                  {items.map((e) => (
                    <button key={e.id} onClick={() => (e.kind === "food" ? openEntry(e) : setConfirmClear(`entry:${e.id}`))} className="flex w-full items-center gap-3 py-2.5 text-left active:bg-raised">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px]">{e.name}{e.kind === "quick" && <span className="ml-1 text-[11px] text-ink-3">quick</span>}</div>
                        <div className="truncate text-[12px] text-ink-3">
                          {e.kind === "exercise" ? "Exercise" : e.servingLabel && e.servingQty ? (e.servingQty === 1 ? e.servingLabel : `${e.servingQty} × ${e.servingLabel}`) : e.grams ? `${Math.round(e.grams)} g` : ""}
                          {e.brand ? ` · ${e.brand}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`tnum text-[15px] font-semibold ${e.kind === "exercise" ? "text-good" : ""}`}>{e.kind === "exercise" ? "−" : ""}{fmt(e.nutrients.kcal)}</div>
                        <div className="tnum text-[11px] text-ink-3">{fmt(e.nutrients.protein)}p · {fmt(e.nutrients.carbs)}c · {fmt(e.nutrients.fat)}f</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setAdd({ open: true, mealId: m.id })} className="flex w-full items-center gap-2 px-4 py-3 text-[14px] font-semibold text-accent active:bg-raised">
                <Plus size={18} /> Add food
              </button>
            </section>
          );
        })}

        {(day.byMeal["exercise"]?.length ?? 0) > 0 && (
          <section className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-3 pb-1"><h2 className="flex-1 text-[16px] font-semibold">Exercise</h2><span className="tnum text-[13px] text-good">+{fmt(day.exerciseKcal)} kcal</span></div>
            <div className="divide-y divide-line px-4 pb-2">
              {day.byMeal["exercise"].map((e) => (
                <button key={e.id} onClick={() => setConfirmClear(`entry:${e.id}`)} className="flex w-full items-center gap-3 py-2.5 text-left active:bg-raised">
                  <div className="min-w-0 flex-1 truncate text-[15px]">{e.name}</div>
                  <div className="tnum text-[15px] font-semibold text-good">−{fmt(e.nutrients.kcal)}</div>
                </button>
              ))}
            </div>
          </section>
        )}
        <WaterCard date={date} profile={profile} />
        <FastingCard profile={profile} />
        <ExerciseQuickAdd date={date} />
      </Page>

      {/* FAB (mobile) */}
      <button onClick={() => setAdd({ open: true, mealId: suggestedMealId(profile) })} aria-label="Add food" className="fixed bottom-[calc(80px+env(safe-area-inset-bottom,0px))] right-4 z-[85] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[var(--shadow)] active:brightness-95 md:hidden">
        <Plus size={26} />
      </button>

      <AddFoodSheet open={add.open} onClose={() => { setAdd((a) => ({ ...a, open: false })); if (params.get("add")) setParams({}, { replace: true }); }} date={date} mealId={add.mealId} meals={meals} nutrientTargets={day.nutrientTargets} macroTargets={day.targets} />
      <FoodDetailSheet food={editing?.food ?? null} entry={editing?.entry} open={!!editing} onClose={() => setEditing(null)} date={date} mealId={editing?.entry.mealId ?? meals[0].id} meals={meals} nutrientTargets={day.nutrientTargets} macroTargets={day.targets} onDone={() => setEditing(null)} />

      {/* Meal menu */}
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={meals.find((m) => m.id === menu)?.name}>
        <div className="flex flex-col gap-1">
          <MenuItem icon={<Copy size={18} />} label="Copy from yesterday" sub="Same meal, previous day" onClick={() => menu && doCopyMeal(menu, addDays(date, -1))} />
          <MenuItem icon={<CalendarDays size={18} />} label="Copy from another day…" onClick={() => { setCopyFrom(menu); setMenu(null); }} />
          <MenuItem icon={<Save size={18} />} label="Save as meal" sub="Reuse this whole meal later" disabled={!(day.byMeal[menu ?? ""]?.length)} onClick={() => { const m = meals.find((x) => x.id === menu)!; setSaveMeal({ mealId: m.id, name: `${m.name} · ${formatDay(date, { relative: false })}` }); setMenu(null); }} />
          <MenuItem icon={<Copy size={18} />} label="Copy whole day from yesterday" onClick={() => doCopyDay(addDays(date, -1))} />
          <MenuItem icon={<Trash2 size={18} />} label="Clear meal" danger disabled={!(day.byMeal[menu ?? ""]?.length)} onClick={() => setConfirmClear(menu)} />
        </div>
      </Sheet>

      <Sheet open={!!copyFrom} onClose={() => setCopyFrom(null)} title="Copy from which day?">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 7 }, (_, i) => addDays(date, -(i + 1))).map((d) => (
            <Button key={d} onClick={() => (copyFrom && doCopyMeal(copyFrom, d))} className="justify-start">{formatDay(d)}</Button>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!saveMeal} onClose={() => setSaveMeal(null)} title="Save as meal">
        <Input autoFocus value={saveMeal?.name ?? ""} onChange={(e) => setSaveMeal((s) => s && { ...s, name: e.target.value })} />
        <Button full variant="primary" className="mt-3" onClick={async () => { if (!saveMeal) return; await saveMealFromEntries(saveMeal.name, day.byMeal[saveMeal.mealId] ?? []); toast("Meal saved"); setSaveMeal(null); }}>Save meal</Button>
      </Sheet>

      <Confirm open={!!confirmClear && !confirmClear.startsWith("entry:")} title="Clear this meal?" body="Removes every item in the meal for this day." confirmLabel="Clear" onCancel={() => setConfirmClear(null)} onConfirm={() => confirmClear && clearMeal(confirmClear)} />
      <Confirm open={!!confirmClear && confirmClear.startsWith("entry:")} title="Remove this entry?" confirmLabel="Remove" onCancel={() => setConfirmClear(null)} onConfirm={async () => { if (confirmClear) await deleteEntry(confirmClear.slice(6)); setConfirmClear(null); }} />

      <WeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} unit={profile.units.weight} initial={lastWeight ? kgToUnit(lastWeight.kg, profile.units.weight) : undefined} onSave={logWeight} />
    </>
  );
}

function MenuItem({ icon, label, sub, onClick, danger, disabled }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-raised disabled:opacity-40 ${danger ? "text-bad" : ""}`}>
      <span className={danger ? "" : "text-ink-2"}>{icon}</span>
      <span className="flex-1"><span className="block text-[15px]">{label}</span>{sub && <span className="block text-[12px] text-ink-3">{sub}</span>}</span>
    </button>
  );
}

export function WeightSheet({ open, onClose, unit, initial, onSave, title = "Log weight" }: { open: boolean; onClose: () => void; unit: "kg" | "lb"; initial?: number; onSave: (v: number) => void; title?: string }) {
  const [v, setV] = useState<number | "">(initial !== undefined ? Math.round(initial * 10) / 10 : "");
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="mb-3 text-[14px] text-ink-2">Weigh in at the same time each day, ideally first thing. The trend line smooths daily noise.</p>
      <NumberInput autoFocus value={v} onChange={setV} suffix={unit} step={0.1} className="text-[20px]" />
      <div className="mt-2 flex gap-2">
        {[-0.5, -0.2, 0.2, 0.5].map((d) => <Button key={d} size="sm" onClick={() => setV((x) => Math.round(((Number(x) || 0) + d) * 10) / 10)}>{d > 0 ? "+" : ""}{d}</Button>)}
      </div>
      <Button full variant="primary" className="mt-4" disabled={!v} onClick={() => v && onSave(Number(v))}>Save</Button>
    </Sheet>
  );
}

/** Small "Exercise" card: add burned calories that widen today's budget. */
function ExerciseQuickAdd({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState<number | "">("");
  const toast = useToast();
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-left">
        <Flame size={20} className="text-ink-3" />
        <div className="flex-1 text-[14px]"><span className="font-medium">Add exercise calories</span><div className="text-[12px] text-ink-3">Optional. Adds to today's budget (workouts from Train are not counted automatically).</div></div>
        <Plus size={18} className="text-accent" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Exercise calories">
        <div className="flex flex-col gap-3">
          <Input placeholder="e.g. 5 km run" value={name} onChange={(e) => setName(e.target.value)} />
          <NumberInput value={kcal} onChange={setKcal} suffix="kcal" placeholder="Calories burned" />
          <Button full variant="primary" disabled={!kcal} onClick={async () => {
            const { logQuick } = await import("@/lib/foodRepo");
            await logQuick({ date, mealId: "exercise", name: name.trim() || "Exercise", nutrients: { kcal: Number(kcal) }, kind: "exercise" });
            toast("Exercise added"); setOpen(false); setName(""); setKcal("");
          }}>Add</Button>
        </div>
      </Sheet>
    </>
  );
}
