import { useState } from "react";
import { Link2, Search, RefreshCw } from "lucide-react";
import type { Food, Recipe } from "@/db/types";
import { fetchRecipePage, extractRecipe, matchIngredients, gramsFor, type MatchedIngredient } from "@/lib/recipeImport";
import { saveRecipe, searchLocal, searchOnline } from "@/lib/foodRepo";
import { scaleNutrients, sumNutrients } from "@/lib/nutrients";
import { fmt } from "@/lib/units";
import { Sheet, Button, Field, Input, NumberInput, useToast } from "@/components/ui";
import { FoodRow } from "@/features/diary/AddFoodSheet";

/** Paste a recipe URL, match every ingredient line to a food, fix anything odd, save as a recipe. */
export default function RecipeUrlImport({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (r: Recipe) => void }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [servings, setServings] = useState<number | "">(4);
  const [lines, setLines] = useState<MatchedIngredient[] | null>(null);
  const [swap, setSwap] = useState<{ idx: number; q: string; results: Food[] } | null>(null);

  async function load() {
    setBusy("Fetching page…");
    try {
      const html = await fetchRecipePage(url.trim());
      const rec = extractRecipe(html, url.trim());
      if (!rec) throw new Error("No recipe found on that page (no schema.org Recipe data or ingredient list).");
      setName(rec.name); setServings(rec.yieldServings);
      setBusy(`Matching ${rec.ingredients.length} ingredients…`);
      setLines(await matchIngredients(rec.ingredients, true));
    } catch (e) { toast((e as Error).message, "warn"); }
    setBusy(null);
  }
  async function doSwapSearch(q: string) {
    if (!swap) return;
    const local = await searchLocal(q, 10);
    let results = local;
    if (local.length < 5 && navigator.onLine) { try { results = [...local, ...(await searchOnline(q)).foods.slice(0, 10)]; } catch { /* offline */ } }
    setSwap({ ...swap, q, results });
  }
  const totals = lines ? sumNutrients(lines.filter((l) => l.food).map((l) => scaleNutrients(l.food!.per100, l.grams / 100))) : {};
  const per = scaleNutrients(totals, 1 / Math.max(1, Number(servings) || 1));
  const unmatched = lines?.filter((l) => !l.food).length ?? 0;

  async function save() {
    if (!lines || !name.trim()) return;
    const ings = lines.filter((l) => l.food && l.grams > 0).map((l) => ({ foodId: l.food!.id, name: `${l.food!.name} · ${l.raw}`, grams: l.grams, per100: l.food!.per100 }));
    if (!ings.length) return;
    const r = await saveRecipe({ name: name.trim(), ingredients: ings, yieldServings: Math.max(1, Number(servings) || 1), notes: `Imported from ${url.trim()}` });
    toast("Recipe imported"); onSaved(r);
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Import recipe from a link" size="lg" footer={lines ? <Button full variant="primary" disabled={!name.trim() || unmatched === (lines?.length ?? 0)} onClick={save}>Save recipe · {fmt(per.kcal)} kcal per serving</Button> : undefined}>
        {!lines ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-ink-2">Works with most recipe sites (anything that publishes schema.org recipe data). Pages are fetched through your sync server, so set up Sync first.</p>
            <Field label="Recipe URL"><Input inputMode="url" autoCapitalize="none" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} /></Field>
            <Button variant="primary" disabled={!/^https?:\/\//i.test(url.trim()) || !!busy} onClick={load}><Link2 size={16} /> {busy ?? "Fetch recipe"}</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Servings"><NumberInput value={servings} onChange={setServings} /></Field>
            </div>
            <p className="text-[12px] text-ink-3">Check each match. Tap a food name to pick a different one; edit grams if the guess is off.{unmatched ? ` ${unmatched} line${unmatched > 1 ? "s" : ""} had no match and will be skipped.` : ""}</p>
            <div className="divide-y divide-line">
              {lines.map((l, i) => (
                <div key={i} className="py-2.5">
                  <div className="text-[12px] text-ink-3">{l.raw}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <button onClick={() => { setSwap({ idx: i, q: l.name, results: l.candidates }); }} className={`min-w-0 flex-1 truncate text-left text-[14px] ${l.food ? "" : "text-warn"}`}>{l.food ? l.food.name : "No match — tap to search"}</button>
                    <NumberInput value={l.grams} onChange={(v) => setLines((ls) => ls && ls.map((x, j) => (j === i ? { ...x, grams: Number(v) || 0 } : x)))} suffix="g" className="w-24" />
                  </div>
                  {l.food && <div className="tnum text-[11px] text-ink-3">{fmt((l.food.per100.kcal ?? 0) * l.grams / 100)} kcal</div>}
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setLines(null); }}><RefreshCw size={14} /> Start over</Button>
          </div>
        )}
      </Sheet>
      <Sheet open={!!swap} onClose={() => setSwap(null)} title="Pick a food" noPad>
        {swap && (
          <div className="px-5 pb-5">
            <div className="relative"><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" /><input autoFocus defaultValue={swap.q} onKeyDown={(e) => { if (e.key === "Enter") doSwapSearch((e.target as HTMLInputElement).value); }} placeholder="Search…" className="field h-12 pl-10" /></div>
            <div className="divide-y divide-line">{swap.results.map((f) => <FoodRow key={f.id} food={f} onClick={() => { setLines((ls) => ls && ls.map((x, j) => (j === swap.idx ? { ...x, food: f, grams: gramsFor(x, f) } : x))); setSwap(null); }} />)}</div>
            {!swap.results.length && <p className="py-4 text-center text-[13px] text-ink-3">Type a name and press Enter.</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}
