import { useEffect, useState } from "react";
import { Sparkles, Globe, Check, Search, Loader2, ExternalLink } from "lucide-react";
import type { Food, ISODate } from "@/db/types";
import { aiLookupFood, aiParseMeal, aiConfigured, type AiCandidate, type AiMealItem } from "@/lib/ai";
import { getSourceSettings, saveCustomFood, logAdHoc, logFood, searchLocal } from "@/lib/foodRepo";
import { nutritionixNatural } from "@/lib/foodSources";
import { fmt } from "@/lib/units";
import { Sheet, Button, Segmented, Chip, useToast, Field } from "@/components/ui";

type Mode = "lookup" | "describe";

/** "Ask AI about …" and "Describe what you ate": model-backed lookup and natural-language logging. */
export default function AiFoodSheet({ open, onClose, mode: initialMode, query, date, mealId, meals, onOpenSettings, onPickFood }: {
  open: boolean; onClose: () => void; mode: Mode; query: string; date: ISODate; mealId: string; meals: { id: string; name: string }[]; onOpenSettings: () => void; onPickFood: (f: Food) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [text, setText] = useState(query);
  const [busy, setBusy] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [nix, setNix] = useState(false);
  const [cands, setCands] = useState<AiCandidate[] | null>(null);
  const [items, setItems] = useState<(AiMealItem & { selected: boolean; localMatch?: Food })[] | null>(null);
  const [meta, setMeta] = useState<string>("");
  const [meal, setMeal] = useState(mealId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode); setText(query); setCands(null); setItems(null); setError(null); setMeal(mealId);
    aiConfigured().then(setConfigured);
    getSourceSettings().then((s) => setNix(!!(s.nutritionixAppId && s.nutritionixAppKey && s.nutritionixEnabled !== false)));
  }, [open, initialMode, query, mealId]);

  async function runLookup() {
    setBusy("Looking it up…"); setError(null); setCands(null);
    try {
      const r = await aiLookupFood(text.trim());
      setCands(r.candidates); setMeta(`${r.model}${r.usedWebSearch ? " · web search" : ""}`);
      if (!r.candidates.length) setError("The model returned no usable candidates. Try adding the restaurant or brand name.");
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }
  async function runDescribe() {
    setBusy("Working out the items…"); setError(null); setItems(null);
    try {
      let parsed: AiMealItem[] = [];
      if (nix && !configured) {
        const s = await getSourceSettings();
        const r = await nutritionixNatural(text.trim(), s.nutritionixAppId!, s.nutritionixAppKey!);
        parsed = r.map((x) => ({ text: x.label, name: x.food.name, serving: x.label, grams: x.grams, nutrients: Object.fromEntries(Object.entries(x.food.per100).map(([k, v]) => [k, (v as number) * x.grams / 100])), confidence: "medium" as const, note: "Nutritionix" }));
        setMeta("Nutritionix natural language");
      } else {
        const r = await aiParseMeal(text.trim());
        parsed = r.items; setMeta(`${r.model}${r.usedWebSearch ? " · web search" : ""}`);
      }
      const withMatches = await Promise.all(parsed.map(async (it) => { const m = await searchLocal(it.name, 1); return { ...it, selected: true, localMatch: m[0] }; }));
      setItems(withMatches);
      if (!parsed.length) setError("Nothing recognisable in that description.");
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }

  async function addCandidate(c: AiCandidate, save: boolean) {
    const note = [c.note, c.source ? `Source: ${c.source}` : "", `AI lookup (${meta})`].filter(Boolean).join("\n");
    if (save) {
      const food = await saveCustomFood({ name: c.name, brand: c.brand, servingLabel: c.serving, servingGrams: c.grams, perServing: c.nutrients, note, basis: c.confidence === "high" ? "published" : "estimated" });
      await logFood({ food, grams: c.grams, serving: food.servings[0], qty: 1, date, mealId: meal });
      toast(`Saved and added ${c.name}`);
    } else {
      await logAdHoc({ date, mealId: meal, name: c.name, brand: c.brand, grams: c.grams, servingLabel: c.serving, nutrients: c.nutrients, note });
      toast(`Added ${c.name}`);
    }
    onClose();
  }
  async function addItems() {
    if (!items) return;
    let n = 0;
    for (const it of items) {
      if (!it.selected) continue;
      await logAdHoc({ date, mealId: meal, name: it.name, grams: it.grams, servingLabel: it.serving, nutrients: it.nutrients, note: `From: "${it.text}" · ${meta}${it.note ? ` · ${it.note}` : ""}` });
      n++;
    }
    toast(`Added ${n} item${n === 1 ? "" : "s"}`); onClose();
  }

  const total = items?.filter((i) => i.selected).reduce((a, i) => a + (i.nutrients.kcal ?? 0), 0) ?? 0;
  const ready = configured || (mode === "describe" && nix);

  return (
    <Sheet open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Sparkles size={18} className="text-accent" /> {mode === "lookup" ? "Ask AI" : "Describe what you ate"}</span>} size="lg"
      footer={items ? <Button full variant="primary" disabled={!items.some((i) => i.selected)} onClick={addItems}>Add {items.filter((i) => i.selected).length} items · {fmt(total)} kcal to {meals.find((m) => m.id === meal)?.name}</Button> : undefined}>
      <Segmented value={mode} onChange={(m) => { setMode(m); setCands(null); setItems(null); setError(null); }} options={[{ value: "lookup", label: "Look up a food" }, { value: "describe", label: "Describe a meal" }]} className="mb-3 w-full" />
      {!ready ? (
        <div className="rounded-xl bg-raised p-4 text-[14px]">
          <p>{mode === "describe" ? "Natural-language logging needs either an AI provider or Nutritionix keys." : "Ask AI needs an AI provider (Azure OpenAI or any OpenAI-compatible API)."} Keys stay on this device.</p>
          <Button variant="primary" className="mt-3" onClick={onOpenSettings}>Set up AI assistant</Button>
        </div>
      ) : (
        <>
          <Field label={mode === "lookup" ? "Food, dish or product" : "What did you eat?"}>
            <textarea rows={mode === "lookup" ? 2 : 3} value={text} onChange={(e) => setText(e.target.value)} className="field" placeholder={mode === "lookup" ? "e.g. Souvla frozen greek yogurt, Kirkland protein bar chocolate brownie" : "e.g. two scrambled eggs with cheddar, a slice of sourdough with butter, and a 16 oz oat latte"} />
          </Field>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" disabled={!text.trim() || !!busy} onClick={mode === "lookup" ? runLookup : runDescribe}>{busy ? <><Loader2 size={16} className="animate-spin" /> {busy}</> : <><Search size={16} /> {mode === "lookup" ? "Look up" : "Break it down"}</>}</Button>
            <select value={meal} onChange={(e) => setMeal(e.target.value)} className="field !h-11 !w-auto">{meals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </div>
          {error && <p className="mt-3 text-[13px] text-warn">{error}</p>}

          {cands && cands.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex items-center gap-1.5 eyebrow"><Globe size={12} /> {meta}</div>
              <div className="divide-y divide-line">
                {cands.map((c, i) => (
                  <div key={i} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[15px]">{c.name}{c.brand && <span className="text-ink-3"> · {c.brand}</span>}</div>
                        <div className="text-[12px] text-ink-3">{c.serving} · {Math.round(c.grams)} g · <Chip tone={c.confidence === "high" ? "good" : c.confidence === "medium" ? "accent" : "warn"} className="!h-5 !px-1.5 !text-[10px]">{c.confidence} confidence</Chip></div>
                        {c.note && <div className="mt-1 text-[12px] text-ink-2">{c.note}</div>}
                        {c.source && <a href={c.source} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] text-accent"><ExternalLink size={11} /> {c.source.replace(/^https?:\/\//, "").slice(0, 48)}</a>}
                      </div>
                      <div className="shrink-0 text-right"><div className="tnum text-[16px] font-semibold">{fmt(c.nutrients.kcal)}<span className="text-[11px] font-normal text-ink-3"> kcal</span></div><div className="tnum text-[11px] text-ink-3">{fmt(c.nutrients.protein)}p · {fmt(c.nutrients.carbs)}c · {fmt(c.nutrients.fat)}f</div></div>
                    </div>
                    <div className="mt-2 flex gap-2"><Button size="sm" variant="primary" onClick={() => addCandidate(c, true)}><Check size={14} /> Save & add</Button><Button size="sm" onClick={() => addCandidate(c, false)}>Add once</Button></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {items && items.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 eyebrow">{meta} · tap to include or skip</div>
              <div className="divide-y divide-line">
                {items.map((it, i) => (
                  <div key={i} className="py-2.5">
                    <button onClick={() => setItems((l) => l && l.map((x, j) => (j === i ? { ...x, selected: !x.selected } : x)))} className="flex w-full items-center gap-3 text-left">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${it.selected ? "bg-accent text-accent-ink" : "bg-raised text-ink-3"}`}>{it.selected && <Check size={14} />}</span>
                      <div className="min-w-0 flex-1"><div className="truncate text-[15px]">{it.name}</div><div className="truncate text-[12px] text-ink-3">{it.serving} · {Math.round(it.grams)} g · from "{it.text}"</div></div>
                      <div className="shrink-0 text-right"><div className="tnum text-[15px] font-semibold">{fmt(it.nutrients.kcal)}</div><div className="tnum text-[11px] text-ink-3">{fmt(it.nutrients.protein)}p · {fmt(it.nutrients.carbs)}c · {fmt(it.nutrients.fat)}f</div></div>
                    </button>
                    {it.localMatch && <div className="ml-9 mt-1 text-[12px] text-ink-3">Library has <button onClick={() => onPickFood(it.localMatch!)} className="text-accent">{it.localMatch.name}</button> if you'd rather log that.</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {cands && cands.length > 0 && <p className="mt-3 text-[12px] text-ink-3">"Save & add" keeps it in My foods for next time. Check the source for anything marked low confidence.</p>}
        </>
      )}
    </Sheet>
  );
}
