import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, ScanBarcode, Zap, PlusCircle, Star, Clock, Repeat, UtensilsCrossed, ChefHat, Loader2, Globe } from "lucide-react";
import { db, alive } from "@/db";
import type { Food, ISODate, SavedMeal } from "@/db/types";
import type { Nutrients } from "@/lib/nutrients";
import { searchLocal, searchOnline, lookupBarcode, defaultServing, nutrientsFor, logSavedMeal, recentFoods, frequentFoods, favoriteFoods, logFood } from "@/lib/foodRepo";
import { CheckSquare, Square, ListChecks } from "lucide-react";
import { Sheet, Chip, useToast, EmptyState, Button } from "@/components/ui";
import { fmt } from "@/lib/units";
import FoodDetailSheet, { SOURCE_LABEL } from "./FoodDetailSheet";
import QuickAddSheet from "./QuickAddSheet";
import BarcodeScanner from "./BarcodeScanner";
import CustomFoodSheet from "@/features/foods/CustomFoodSheet";
import { subscribePack, type PackProgress } from "@/lib/usdaPack";

type Tab = "recent" | "frequent" | "favorites" | "mine" | "meals" | "recipes";

export function FoodRow({ food, onClick, trailing }: { food: Food; onClick: () => void; trailing?: React.ReactNode }) {
  const s = defaultServing(food);
  const n = nutrientsFor(food, s.grams);
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 py-2.5 text-left active:bg-raised">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px]">{food.name}</div>
        <div className="truncate text-[12px] text-ink-3">
          {food.brand ? `${food.brand} · ` : ""}{s.label}{/^100\s?(g|ml)/i.test(s.label) ? "" : ` (${Math.round(s.grams)} ${food.isLiquid ? "mL" : "g"})`}
          {food.source !== "seed" && <span className="ml-1 opacity-80">· {SOURCE_LABEL[food.source]}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tnum text-[15px] font-semibold">{fmt(n.kcal)}<span className="ml-0.5 text-[11px] font-normal text-ink-3">kcal</span></div>
        <div className="tnum text-[11px] text-ink-3"><span style={{ color: "var(--protein)" }}>P</span> {fmt(n.protein)} · <span style={{ color: "var(--carbs)" }}>C</span> {fmt(n.carbs)} · <span style={{ color: "var(--fat)" }}>F</span> {fmt(n.fat)}</div>
      </div>
      {trailing}
    </button>
  );
}

export default function AddFoodSheet({ open, onClose, date, mealId, meals, nutrientTargets, macroTargets }: {
  open: boolean; onClose: () => void; date: ISODate; mealId: string; meals: { id: string; name: string }[]; nutrientTargets: Nutrients; macroTargets: { kcal: number; protein: number; carbs: number; fat: number };
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("recent");
  const [local, setLocal] = useState<Food[]>([]);
  const [online, setOnline] = useState<Food[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Food | null>(null);
  const [quick, setQuick] = useState(false);
  const [scan, setScan] = useState(false);
  const [custom, setCustom] = useState<{ open: boolean; initial?: Food | null; barcode?: string }>({ open: false });
  const [meal, setMeal] = useState(mealId);
  const [multi, setMulti] = useState(false);
  const [pack, setPack] = useState<PackProgress>({ installing: false, done: 0, total: 0 });
  const [packTick, setPackTick] = useState(0);
  useEffect(() => subscribePack((p) => { setPack(p); if (!p.installing) setPackTick((t) => t + 1); }), []);
  const [picked, setPicked] = useState<Food[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setMeal(mealId); setQ(""); setLocal([]); setOnline([]); setErrors([]); setMulti(false); setPicked([]); setTimeout(() => inputRef.current?.focus(), 250); } }, [open, mealId]);
  const togglePick = (f: Food) => setPicked((p) => (p.some((x) => x.id === f.id) ? p.filter((x) => x.id !== f.id) : [...p, f]));
  async function addPicked() {
    for (const f of picked) { const s = defaultServing(f); await logFood({ food: f, grams: s.grams, serving: s, qty: 1, date, mealId: meal }); }
    toast(`Added ${picked.length} food${picked.length === 1 ? "" : "s"}`); onClose();
  }

  useEffect(() => {
    abortRef.current?.abort();
    const query = q.trim();
    if (query.length < 2) { setLocal([]); setOnline([]); setErrors([]); setLoading(false); return; }
    let cancelled = false;
    searchLocal(query).then((r) => { if (!cancelled) setLocal(r); });
    if (packTick < 0) return; // (dependency)
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    const t = setTimeout(async () => {
      if (!navigator.onLine) { setLoading(false); setErrors(["Offline · showing saved foods only"]); return; }
      const r = await searchOnline(query, ctrl.signal);
      if (cancelled || ctrl.signal.aborted) return;
      setOnline(r.foods);
      setErrors(r.errors);
      setLoading(false);
    }, 450);
    return () => { cancelled = true; clearTimeout(t); ctrl.abort(); };
  }, [q, packTick]);

  const lists = useLiveQuery(async () => ({
    recent: await recentFoods(40),
    frequent: await frequentFoods(40),
    favorites: await favoriteFoods(),
    mine: alive(await db.foods.filter((f) => f.source === "custom").toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    meals: alive(await db.savedMeals.toArray()).sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0)),
    recipes: alive(await db.foods.filter((f) => f.source === "recipe").toArray()).sort((a, b) => a.name.localeCompare(b.name)),
  }), [open]);

  const onCode = useCallback(async (code: string) => {
    setScan(false);
    toast("Looking up barcode…", "info");
    try {
      const f = await lookupBarcode(code);
      if (f) setDetail(f);
      else { toast("Not in Open Food Facts yet. Create it from the label.", "warn"); setCustom({ open: true, barcode: code }); }
    } catch { toast("Lookup failed. Check your connection.", "warn"); }
  }, [toast]);

  async function addMeal(m: SavedMeal) {
    const n = await logSavedMeal(m, date, meal);
    toast(`Added ${n} items from ${m.name}`);
    onClose();
  }

  const mealName = meals.find((m) => m.id === meal)?.name ?? "";
  const searching = q.trim().length >= 2;
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "recent", label: "Recent", icon: <Clock size={14} /> },
    { id: "frequent", label: "Frequent", icon: <Repeat size={14} /> },
    { id: "favorites", label: "Favorites", icon: <Star size={14} /> },
    { id: "meals", label: "Meals", icon: <UtensilsCrossed size={14} /> },
    { id: "recipes", label: "Recipes", icon: <ChefHat size={14} /> },
    { id: "mine", label: "My foods", icon: <PlusCircle size={14} /> },
  ];

  return (
    <>
      <Sheet open={open} onClose={onClose} size="lg" noPad title={<span>Add to <span className="text-accent">{mealName}</span></span>} footer={multi && picked.length ? <Button full variant="primary" onClick={addPicked}>Add {picked.length} food{picked.length > 1 ? "s" : ""} (default servings)</Button> : undefined}>
        <div className="sticky top-0 z-10 bg-surface px-5 pb-2">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods, brands, recipes…" className="field h-12 pl-10 pr-10 text-[16px]" enterKeyHint="search" />
            {loading && <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-3" />}
          </div>
          <div className="scroll-x mt-2 flex gap-2">
            <Chip onClick={() => setScan(true)}><ScanBarcode size={14} /> Scan</Chip>
            <Chip onClick={() => setQuick(true)}><Zap size={14} /> Quick add</Chip>
            <Chip onClick={() => setCustom({ open: true })}><PlusCircle size={14} /> New food</Chip>
            {!searching && <Chip active={multi} onClick={() => { setMulti((m) => !m); setPicked([]); }}><ListChecks size={14} /> Multi-add</Chip>}
            <select value={meal} onChange={(e) => setMeal(e.target.value)} className="h-8 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink-2">
              {meals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {!searching && (
            <div className="scroll-x -mx-5 mt-3 flex gap-1 border-b border-line px-5">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium ${tab === t.id ? "border-accent text-ink" : "border-transparent text-ink-3"}`}>{t.icon}{t.label}</button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-6">
          {pack.installing && <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-3"><Loader2 size={12} className="animate-spin" /> Installing offline USDA library · {Math.round((pack.done / Math.max(1, pack.total)) * 100)}% · results fill in as it finishes</div>}
          {searching ? (
            <>
              {local.length > 0 && <div className="mb-1 mt-2 eyebrow">Saved on this device</div>}
              <div className="divide-y divide-line">{local.map((f) => <FoodRow key={f.id} food={f} onClick={() => setDetail(f)} />)}</div>
              {(online.length > 0 || loading) && <div className="mb-1 mt-4 flex items-center gap-1.5 eyebrow"><Globe size={12} /> Online · USDA & Open Food Facts</div>}
              <div className="divide-y divide-line">{online.map((f) => <FoodRow key={f.id} food={f} onClick={() => setDetail(f)} />)}</div>
              {errors.map((e) => <div key={e} className="mt-3 text-[12px] text-warn">{e}</div>)}
              {!loading && local.length === 0 && online.length === 0 && (
                <EmptyState title="Nothing matched" body="Try a shorter name, scan the barcode, or create the food from its label." action={<Chip onClick={() => setCustom({ open: true })}><PlusCircle size={14} /> New food “{q.trim()}”</Chip>} />
              )}
            </>
          ) : (
            <>
              {tab === "meals" ? (
                lists?.meals.length ? (
                  <div className="divide-y divide-line">
                    {lists.meals.map((m) => {
                      const kcal = m.items.reduce((a, i) => a + (i.nutrients.kcal ?? 0), 0);
                      return (
                        <button key={m.id} onClick={() => addMeal(m)} className="flex w-full items-center gap-3 py-2.5 text-left active:bg-raised">
                          <div className="min-w-0 flex-1"><div className="truncate text-[15px]">{m.name}</div><div className="truncate text-[12px] text-ink-3">{m.items.map((i) => i.name).join(", ")}</div></div>
                          <div className="tnum text-[15px] font-semibold">{fmt(kcal)}<span className="ml-0.5 text-[11px] font-normal text-ink-3">kcal</span></div>
                        </button>
                      );
                    })}
                  </div>
                ) : <EmptyState title="No saved meals yet" body="Open a meal's menu on Today and choose “Save as meal” to reuse it in one tap." />
              ) : (
                (() => {
                  const list = lists?.[tab] ?? [];
                  if (!list.length) {
                    const copy: Record<string, [string, string]> = {
                      recent: ["Nothing logged yet", "Foods you log show up here for one-tap re-adding."],
                      frequent: ["No frequent foods yet", "Your most-logged foods will collect here."],
                      favorites: ["No favorites yet", "Tap the heart on any food to pin it here."],
                      mine: ["No custom foods yet", "Create a food from its nutrition label."],
                      recipes: ["No recipes yet", "Build recipes in the Foods tab and log them by the serving."],
                    };
                    return <EmptyState title={copy[tab][0]} body={copy[tab][1]} />;
                  }
                  return <div className="divide-y divide-line">{list.map((f) => multi
                    ? <FoodRow key={f.id} food={f} onClick={() => togglePick(f)} trailing={<span className={`ml-1 ${picked.some((x) => x.id === f.id) ? "text-accent" : "text-ink-3"}`}>{picked.some((x) => x.id === f.id) ? <CheckSquare size={20} /> : <Square size={20} />}</span>} />
                    : <FoodRow key={f.id} food={f} onClick={() => setDetail(f)} />)}</div>;
                })()
              )}
            </>
          )}
        </div>
      </Sheet>

      <FoodDetailSheet food={detail} open={!!detail} onClose={() => setDetail(null)} date={date} mealId={meal} meals={meals} nutrientTargets={nutrientTargets} macroTargets={macroTargets}
        onDone={() => { setDetail(null); onClose(); }} onEdit={(f) => { setDetail(null); setCustom({ open: true, initial: f }); }} />
      <QuickAddSheet open={quick} onClose={() => { setQuick(false); onClose(); }} date={date} mealId={meal} meals={meals} />
      <BarcodeScanner open={scan} onClose={() => setScan(false)} onCode={onCode} />
      <CustomFoodSheet open={custom.open} initial={custom.initial} barcode={custom.barcode} onClose={() => setCustom({ open: false })} onSaved={(f) => { setCustom({ open: false }); setDetail(f); }} />
    </>
  );
}
