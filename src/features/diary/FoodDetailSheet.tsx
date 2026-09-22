import { useEffect, useMemo, useState } from "react";
import { Heart, Minus, Plus, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import type { DiaryEntry, Food, ISODate, Serving } from "@/db/types";
import { defaultServing, nutrientsFor, logFood, updateEntry, deleteEntry, toggleFavorite, gramUnitLabel } from "@/lib/foodRepo";
import { formatAmount, netCarbs, type Nutrients } from "@/lib/nutrients";
import { Sheet, Button, Chip, Segmented, NumberInput, useToast } from "@/components/ui";
import NutrientPanel from "./NutrientPanel";
import { fmt } from "@/lib/units";

export const SOURCE_LABEL: Record<Food["source"], string> = { seed: "Starter", custom: "My food", off: "Open Food Facts", usda: "USDA", recipe: "Recipe", restaurant: "Restaurant" };

const GRAMS_ID = "__grams";

export default function FoodDetailSheet({ food, open, onClose, date, mealId, meals, entry, nutrientTargets, macroTargets, onDone, onEdit }: {
  food: Food | null; open: boolean; onClose: () => void; date: ISODate; mealId: string; meals: { id: string; name: string }[];
  entry?: DiaryEntry | null; nutrientTargets: Nutrients; macroTargets: { kcal: number; protein: number; carbs: number; fat: number };
  onDone: () => void; onEdit?: (food: Food) => void;
}) {
  const toast = useToast();
  const [servingId, setServingId] = useState<string>("");
  const [qty, setQty] = useState<number | "">(1);
  const [grams, setGrams] = useState<number | "">(100);
  const [meal, setMeal] = useState(mealId);
  const [showAll, setShowAll] = useState(false);
  const [fav, setFav] = useState(!!food?.favorite);
  const [time, setTime] = useState("");

  useEffect(() => {
    if (!food || !open) return;
    setFav(!!food.favorite);
    setMeal(entry?.mealId ?? mealId);
    setTime(entry?.time ?? "");
    if (entry) {
      const s = entry.servingLabel ? food.servings.find((x) => x.label === entry.servingLabel) : undefined;
      if (s && entry.servingQty) { setServingId(s.id); setQty(entry.servingQty); }
      else { setServingId(GRAMS_ID); setGrams(entry.grams); }
    } else {
      const s = defaultServing(food);
      setServingId(s.id);
      setQty(1);
      setGrams(s.grams);
    }
    setShowAll(false);
  }, [food, open, entry, mealId]);

  const serving: Serving | null = useMemo(() => (food && servingId !== GRAMS_ID ? food.servings.find((s) => s.id === servingId) ?? null : null), [food, servingId]);
  const totalGrams = servingId === GRAMS_ID ? Number(grams) || 0 : (Number(qty) || 0) * (serving?.grams ?? 0);
  const n = food ? nutrientsFor(food, totalGrams) : {};
  const unit = food ? gramUnitLabel(food) : "g";

  async function submit() {
    if (!food || totalGrams <= 0) return;
    if (entry) {
      await updateEntry(entry, { grams: totalGrams, servingLabel: serving?.label, servingQty: serving ? Number(qty) : undefined, mealId: meal, time: time || entry.time });
      toast("Updated");
    } else {
      await logFood({ food, grams: totalGrams, serving: serving ?? undefined, qty: serving ? Number(qty) : undefined, date, mealId: meal });
      toast(`Added ${food.name}`);
    }
    onDone();
  }
  async function del() {
    if (!entry) return;
    await deleteEntry(entry.id);
    toast("Removed");
    onDone();
  }

  if (!food) return null;
  const macroPill = (label: string, key: "protein" | "carbs" | "fat", color: string) => (
    <div className="flex flex-1 flex-col items-center rounded-xl bg-raised py-2">
      <div className="tnum text-[17px] font-semibold" style={{ color }}>{formatAmount(key, n[key])}<span className="text-[12px] font-normal text-ink-3">g</span></div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  );
  const step = (d: number) => setQty((q) => Math.max(0.25, Math.round(((Number(q) || 0) + d) * 100) / 100));

  return (
    <Sheet open={open} onClose={onClose} title={entry ? "Edit entry" : "Add food"} size="md"
      footer={
        <div className="flex gap-2">
          {entry && <Button variant="danger" onClick={del}>Remove</Button>}
          <Button full variant="primary" onClick={submit} disabled={totalGrams <= 0}>
            {entry ? "Save changes" : `Add to ${meals.find((m) => m.id === meal)?.name ?? "diary"}`} · {fmt(n.kcal)} kcal
          </Button>
        </div>
      }>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="display text-[20px] font-semibold leading-tight">{food.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            {food.brand && <span>{food.brand}</span>}
            <Chip className="!h-6 !px-2 !text-[11px]">{SOURCE_LABEL[food.source]}</Chip>
            {food.source === "restaurant" ? <Chip tone={food.basis === "published" ? "good" : "warn"} className="!h-6 !px-2 !text-[11px]">{food.basis === "published" ? "published nutrition" : "estimated"}</Chip> : food.verified && <span>verified</span>}
            {food.vegan && <Chip tone="good" className="!h-6 !px-2 !text-[11px]">vegan</Chip>}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {(food.source === "custom" || food.source === "recipe") && onEdit && <button aria-label="Edit food" onClick={() => onEdit(food)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-raised"><Pencil size={18} /></button>}
          <button aria-label={fav ? "Remove from favorites" : "Add to favorites"} onClick={async () => { setFav(!fav); await toggleFavorite(food); }} className={`flex h-10 w-10 items-center justify-center rounded-full ${fav ? "text-bad" : "text-ink-3"} hover:bg-raised`}>
            <Heart size={20} fill={fav ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {food.note && <p className="mt-3 whitespace-pre-line rounded-xl bg-raised px-3 py-2 text-[12px] text-ink-2">{food.note}</p>}
      <div className="mt-4 flex items-center gap-2">
        {servingId !== GRAMS_ID ? (
          <div className="flex h-11 items-center rounded-xl bg-raised">
            <button aria-label="Less" onClick={() => step(-0.5)} className="flex h-11 w-10 items-center justify-center text-ink-2"><Minus size={16} /></button>
            <input type="number" inputMode="decimal" value={qty} step={0.25} min={0} onFocus={(e) => e.target.select()} onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))} className="tnum h-11 w-14 bg-transparent text-center text-[16px] font-semibold outline-none" />
            <button aria-label="More" onClick={() => step(0.5)} className="flex h-11 w-10 items-center justify-center text-ink-2"><Plus size={16} /></button>
          </div>
        ) : (
          <NumberInput value={grams} onChange={setGrams} suffix={unit} className="w-32" />
        )}
        <select value={servingId} onChange={(e) => { setServingId(e.target.value); if (e.target.value === GRAMS_ID) setGrams(Math.round(totalGrams) || 100); }} className="field h-11 flex-1">
          {food.servings.map((s) => <option key={s.id} value={s.id}>{s.label}{/^100\s?(g|ml)/i.test(s.label) ? "" : ` · ${Math.round(s.grams)} ${unit}`}</option>)}
          <option value={GRAMS_ID}>Custom {unit === "g" ? "grams" : "millilitres"}</option>
        </select>
      </div>
      <div className="mt-1 text-[12px] text-ink-3">{Math.round(totalGrams)} {unit} total</div>

      <div className="mt-4 flex items-end justify-between">
        <div><span className="tnum display text-[40px] font-semibold leading-none">{fmt(n.kcal)}</span><span className="ml-1 text-[14px] text-ink-3">kcal</span></div>
        <div className="text-right text-[12px] text-ink-3">{Math.round(((n.kcal ?? 0) / Math.max(1, macroTargets.kcal)) * 100)}% of today's target</div>
      </div>
      <div className="mt-3 flex gap-2">
        {macroPill("Protein", "protein", "var(--protein)")}
        {macroPill("Carbs", "carbs", "var(--carbs)")}
        {macroPill("Fat", "fat", "var(--fat)")}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[12px] text-ink-2">
        <div className="tnum">Fiber {formatAmount("fiber", n.fiber)} g</div>
        <div className="tnum">Sugar {formatAmount("sugar", n.sugar)} g</div>
        <div className="tnum">Net carbs {formatAmount("carbs", netCarbs(n))} g</div>
        <div className="tnum">Sat fat {formatAmount("satFat", n.satFat)} g</div>
        <div className="tnum">Sodium {formatAmount("sodium", n.sodium)} mg</div>
        <div className="tnum">Potassium {formatAmount("potassium", n.potassium)} mg</div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[13px] font-medium text-ink-2">Meal</div>
        <Segmented value={meal} onChange={setMeal} options={meals.map((m) => ({ value: m.id, label: m.name }))} className="w-full" />
      </div>
      {entry && <label className="mt-3 flex items-center justify-between text-[13px] text-ink-2">Time eaten<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field !h-9 !w-auto !py-0" /></label>}

      <button onClick={() => setShowAll((s) => !s)} className="mt-5 flex w-full items-center justify-between py-2 text-[14px] font-medium text-ink-2">
        <span>All nutrients · % of daily target</span>{showAll ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {showAll && <NutrientPanel totals={n} targets={nutrientTargets} macroTargets={macroTargets} compact />}
    </Sheet>
  );
}
