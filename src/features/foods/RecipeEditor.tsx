import { useEffect, useRef, useState } from "react";
import { Search, Trash2, Loader2 } from "lucide-react";
import type { Food, Recipe, RecipeIngredient } from "@/db/types";
import { searchLocal, searchOnline, saveRecipe, recipeTotals, recipeTotalGrams, defaultServing } from "@/lib/foodRepo";
import { scaleNutrients } from "@/lib/nutrients";
import { fmt } from "@/lib/units";
import { Sheet, Button, Field, Input, NumberInput, useToast } from "@/components/ui";
import { FoodRow } from "@/features/diary/AddFoodSheet";

export default function RecipeEditor({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Recipe | null; onSaved: (r: Recipe) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [servings, setServings] = useState<number | "">(4);
  const [yieldGrams, setYieldGrams] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [ings, setIngs] = useState<RecipeIngredient[]>([]);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState<{ food: Food; qty: number | ""; servingId: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? ""); setServings(initial?.yieldServings ?? 4); setYieldGrams(initial?.yieldGrams ?? ""); setNotes(initial?.notes ?? ""); setIngs(initial?.ingredients ?? []);
  }, [open, initial]);

  useEffect(() => {
    abortRef.current?.abort();
    const query = q.trim();
    if (query.length < 2) { setResults([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      const local = await searchLocal(query, 15);
      if (cancelled) return;
      setResults(local);
      if (navigator.onLine) {
        const on = await searchOnline(query, ctrl.signal).catch(() => ({ foods: [] as Food[] }));
        if (!cancelled && !ctrl.signal.aborted) setResults([...local, ...on.foods]);
      }
      if (!cancelled) setLoading(false);
    }, 350);
    return () => { cancelled = true; clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const totals = recipeTotals({ ingredients: ings });
  const totalG = recipeTotalGrams({ ingredients: ings, yieldGrams: Number(yieldGrams) || undefined });
  const perServing = scaleNutrients(totals, 1 / Math.max(1, Number(servings) || 1));

  function addIngredient() {
    if (!amount) return;
    const s = amount.food.servings.find((x) => x.id === amount.servingId) ?? defaultServing(amount.food);
    const grams = (Number(amount.qty) || 0) * s.grams;
    if (grams <= 0) return;
    setIngs((l) => [...l, { foodId: amount.food.id, name: `${amount.food.name}${amount.qty !== 1 ? ` · ${amount.qty} × ${s.label}` : ` · ${s.label}`}`, grams, per100: amount.food.per100 }]);
    setAmount(null); setPicking(false); setQ(""); setResults([]);
  }

  async function submit() {
    if (!name.trim() || !ings.length) return;
    const r = await saveRecipe({ id: initial?.id, foodId: initial?.foodId, name, ingredients: ings, yieldServings: Math.max(1, Number(servings) || 1), yieldGrams: Number(yieldGrams) || undefined, notes });
    toast(initial ? "Recipe updated" : "Recipe saved");
    onSaved(r);
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title={initial ? "Edit recipe" : "New recipe"} size="lg" footer={<Button full variant="primary" disabled={!name.trim() || !ings.length} onClick={submit}>{initial ? "Save recipe" : "Save recipe"} · {fmt(perServing.kcal)} kcal per serving</Button>}>
        <div className="flex flex-col gap-3">
          <Field label="Recipe name"><Input autoFocus placeholder="e.g. Chicken burrito bowl" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Servings it makes"><NumberInput value={servings} onChange={setServings} min={1} /></Field>
            <Field label="Cooked weight (optional)" hint={`Raw total ${Math.round(ings.reduce((a, i) => a + i.grams, 0))} g`}><NumberInput value={yieldGrams} onChange={setYieldGrams} suffix="g" placeholder="after cooking" /></Field>
          </div>

          <div className="mt-1 flex items-center justify-between"><div className="text-[13px] font-semibold">Ingredients</div><Button size="sm" variant="soft" onClick={() => setPicking(true)}>Add ingredient</Button></div>
          {ings.length === 0 && <div className="rounded-xl border border-dashed border-line-strong p-4 text-center text-[13px] text-ink-3">No ingredients yet. Search any food and set the amount.</div>}
          <div className="divide-y divide-line">
            {ings.map((i, idx) => {
              const n = scaleNutrients(i.per100, i.grams / 100);
              return (
                <div key={idx} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1"><div className="truncate text-[14px]">{i.name}</div><div className="text-[12px] text-ink-3">{Math.round(i.grams)} g · {fmt(n.kcal)} kcal · {fmt(n.protein)}p {fmt(n.carbs)}c {fmt(n.fat)}f</div></div>
                  <NumberInput value={Math.round(i.grams)} onChange={(v) => setIngs((l) => l.map((x, j) => (j === idx ? { ...x, grams: Number(v) || 0 } : x)))} suffix="g" className="w-24" />
                  <button aria-label="Remove ingredient" onClick={() => setIngs((l) => l.filter((_, j) => j !== idx))} className="text-ink-3 hover:text-bad"><Trash2 size={18} /></button>
                </div>
              );
            })}
          </div>

          {ings.length > 0 && (
            <div className="rounded-xl bg-raised p-3 text-[13px]">
              <div className="flex justify-between"><span className="text-ink-2">Per serving ({Math.round(totalG / Math.max(1, Number(servings) || 1))} g)</span><span className="tnum font-semibold">{fmt(perServing.kcal)} kcal</span></div>
              <div className="tnum mt-1 text-ink-2">{fmt(perServing.protein)} g protein · {fmt(perServing.carbs)} g carbs · {fmt(perServing.fat)} g fat · {fmt(perServing.fiber)} g fiber</div>
              <div className="tnum mt-1 text-ink-3">Whole recipe: {fmt(totals.kcal)} kcal · {Math.round(totalG)} g</div>
            </div>
          )}
          <Field label="Notes (optional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="field" placeholder="Method, oven temp, swaps…" /></Field>
        </div>
      </Sheet>

      <Sheet open={picking} onClose={() => { setPicking(false); setAmount(null); }} title={amount ? "Amount" : "Add ingredient"} noPad>
        {!amount ? (
          <div className="px-5 pb-5">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ingredient…" className="field h-12 pl-10 text-[16px]" />
              {loading && <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-3" />}
            </div>
            <div className="divide-y divide-line">{results.map((f) => <FoodRow key={f.id} food={f} onClick={() => setAmount({ food: f, qty: 1, servingId: defaultServing(f).id })} />)}</div>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <div className="display text-[18px] font-semibold">{amount.food.name}</div>
            <div className="mt-3 flex gap-2">
              <NumberInput value={amount.qty} onChange={(v) => setAmount({ ...amount, qty: v })} className="w-24" step={0.25} />
              <select value={amount.servingId} onChange={(e) => setAmount({ ...amount, servingId: e.target.value })} className="field flex-1">
                {amount.food.servings.map((s) => <option key={s.id} value={s.id}>{s.label} · {Math.round(s.grams)} g</option>)}
              </select>
            </div>
            <div className="mt-2 flex gap-2"><Button full onClick={() => setAmount(null)}>Back</Button><Button full variant="primary" onClick={addIngredient}>Add to recipe</Button></div>
          </div>
        )}
      </Sheet>
    </>
  );
}
