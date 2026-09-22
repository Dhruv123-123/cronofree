import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, ChefHat, Search, Star, UtensilsCrossed, Trash2, Pencil } from "lucide-react";
import { db } from "@/db";
import type { Food, Recipe, SavedMeal } from "@/db/types";
import { useProfile } from "@/hooks";
import { mealsOf, suggestedMealId, nutrientTargetsFor } from "@/lib/dayModel";
import { today } from "@/lib/dates";
import { fmt } from "@/lib/units";
import { deleteFood, deleteRecipe, deleteSavedMeal, searchLocal } from "@/lib/foodRepo";
import { PageHeader, Page } from "@/components/Shell";
import { Segmented, Button, EmptyState, Confirm, Sheet, useToast, Chip } from "@/components/ui";
import { FoodRow } from "@/features/diary/AddFoodSheet";
import FoodDetailSheet from "@/features/diary/FoodDetailSheet";
import CustomFoodSheet from "./CustomFoodSheet";
import RecipeEditor from "./RecipeEditor";
import NutrientFinder from "./NutrientFinder";
import EatOut from "./EatOut";
import RecipeUrlImport from "./RecipeUrlImport";
import { Link2 } from "lucide-react";

type Tab = "browse" | "eatout" | "mine" | "recipes" | "meals" | "find";

export default function FoodsPage() {
  const profile = useProfile();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("browse");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [detail, setDetail] = useState<Food | null>(null);
  const [custom, setCustom] = useState<{ open: boolean; initial?: Food | null }>({ open: false });
  const [recipe, setRecipe] = useState<{ open: boolean; initial?: Recipe | null }>({ open: false });
  const [confirm, setConfirm] = useState<{ kind: "food" | "recipe" | "meal"; id: string; recipe?: Recipe } | null>(null);
  const [mealView, setMealView] = useState<SavedMeal | null>(null);
  const [urlImport, setUrlImport] = useState(false);

  const foods = useLiveQuery(() => db.foods.filter((f) => !f.deletedAt).toArray(), []);
  const recipesLive = useLiveQuery(() => db.recipes.filter((r) => !r.deletedAt).toArray(), []);
  const meals = useLiveQuery(() => db.savedMeals.filter((m) => !m.deletedAt).toArray(), []);
  const searched = useLiveQuery(() => (q.trim().length >= 2 ? searchLocal(q, 100) : Promise.resolve([] as Food[])), [q]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const f of foods ?? []) if (f.category && (f.source === "seed" || f.source === "usda")) set.add(f.category);
    return [...set].sort();
  }, [foods]);

  const browse = useMemo(() => {
    if (q.trim().length >= 2) return searched ?? [];
    let list = (foods ?? []).filter((f) => f.source !== "recipe");
    if (cat === "favorites") list = list.filter((f) => f.favorite);
    else if (cat === "recent") list = list.filter((f) => f.lastUsedAt).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    else if (cat !== "all") list = list.filter((f) => f.category === cat);
    if (cat !== "recent") list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [foods, searched, q, cat]);

  const mine = useMemo(() => (foods ?? []).filter((f) => f.source === "custom").sort((a, b) => a.name.localeCompare(b.name)), [foods]);
  const recipeFoods = useMemo(() => new Map((foods ?? []).filter((f) => f.source === "recipe").map((f) => [f.id, f])), [foods]);
  const dayMeals = mealsOf(profile);
  const nutrientTargets = nutrientTargetsFor(profile, profile.targets.kcal);

  return (
    <>
      <PageHeader title="Foods" sub="Library" right={
        <div className="flex gap-1">
          <Button size="sm" onClick={() => setRecipe({ open: true })}><ChefHat size={16} /> Recipe</Button>
          <Button size="sm" variant="primary" onClick={() => setCustom({ open: true })}><Plus size={16} /> Food</Button>
        </div>
      }>
        <div className="px-4 pb-2 md:px-0">
          <Segmented value={tab} onChange={setTab} className="w-full" options={[{ value: "browse", label: "All" }, { value: "eatout", label: "Eat out" }, { value: "find", label: "Find" }, { value: "mine", label: "Mine" }, { value: "recipes", label: "Recipes" }, { value: "meals", label: "Meals" }]} />
        </div>
      </PageHeader>
      <Page>
        {tab === "browse" && (
          <>
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your library" className="field h-12 pl-10 text-[16px]" />
            </div>
            {q.trim().length < 2 && (
              <div className="scroll-x -mx-4 flex gap-2 px-4 md:mx-0 md:px-0">
                <Chip active={cat === "all"} onClick={() => setCat("all")}>All</Chip>
                <Chip active={cat === "recent"} onClick={() => setCat("recent")}>Recent</Chip>
                <Chip active={cat === "favorites"} onClick={() => setCat("favorites")}><Star size={12} /> Favorites</Chip>
                {categories.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
              </div>
            )}
            <div className="card divide-y divide-line px-4">
              {browse.slice(0, 200).map((f) => <FoodRow key={f.id} food={f} onClick={() => setDetail(f)} />)}
              {browse.length === 0 && <EmptyState title="No foods here" body="Anything you log from USDA or Open Food Facts is saved here for offline use." />}
              {browse.length > 200 && <div className="py-3 text-center text-[12px] text-ink-3">Showing 200 of {browse.length.toLocaleString()} · search to narrow down</div>}
            </div>
            <p className="text-[12px] text-ink-3">{(foods?.length ?? 0).toLocaleString()} foods on this device, searchable offline. Online results are cached the first time you log them.</p>
          </>
        )}

        {tab === "find" && <NutrientFinder onPick={(f) => setDetail(f)} />}
        {tab === "eatout" && <EatOut onPick={(f) => setDetail(f)} />}

        {tab === "mine" && (
          <div className="card divide-y divide-line px-4">
            {mine.length === 0 && <EmptyState title="No custom foods yet" body="Create a food from its label, or scan a barcode that Open Food Facts doesn't know." action={<Button variant="primary" onClick={() => setCustom({ open: true })}><Plus size={16} /> New food</Button>} />}
            {mine.map((f) => (
              <FoodRow key={f.id} food={f} onClick={() => setDetail(f)} trailing={
                <div className="ml-1 flex shrink-0">
                  <button aria-label="Edit" onClick={(e) => { e.stopPropagation(); setCustom({ open: true, initial: f }); }} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-raised"><Pencil size={16} /></button>
                  <button aria-label="Delete" onClick={(e) => { e.stopPropagation(); setConfirm({ kind: "food", id: f.id }); }} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-bad"><Trash2 size={16} /></button>
                </div>
              } />
            ))}
          </div>
        )}

        {tab === "recipes" && (
          <div className="card divide-y divide-line px-4">
            <div className="flex gap-2 py-3"><Button size="sm" onClick={() => setUrlImport(true)}><Link2 size={14} /> Import from a link</Button><Button size="sm" variant="soft" onClick={() => setRecipe({ open: true })}><ChefHat size={14} /> New recipe</Button></div>
            {(recipesLive?.length ?? 0) === 0 && <EmptyState title="No recipes yet" body="Add ingredients once, set how many servings it makes, then log a serving in one tap. Or paste a recipe link and we match the ingredients for you." />}
            {(recipesLive ?? []).sort((a, b) => a.name.localeCompare(b.name)).map((r) => {
              const f = recipeFoods.get(r.foodId);
              return (
                <div key={r.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">{f ? <FoodRow food={f} onClick={() => setDetail(f)} /> : <div className="py-3 text-[14px]">{r.name}</div>}</div>
                  <button aria-label="Edit" onClick={() => setRecipe({ open: true, initial: r })} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-raised"><Pencil size={16} /></button>
                  <button aria-label="Delete" onClick={() => setConfirm({ kind: "recipe", id: r.id, recipe: r })} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-bad"><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "meals" && (
          <div className="card divide-y divide-line px-4">
            {(meals?.length ?? 0) === 0 && <EmptyState icon={<UtensilsCrossed size={28} />} title="No saved meals" body="On Today, open a meal's menu and choose “Save as meal” to reuse the whole thing later." />}
            {(meals ?? []).sort((a, b) => a.name.localeCompare(b.name)).map((m) => {
              const kcal = m.items.reduce((a, i) => a + (i.nutrients.kcal ?? 0), 0);
              return (
                <div key={m.id} className="flex items-center gap-2 py-2.5">
                  <button onClick={() => setMealView(m)} className="min-w-0 flex-1 text-left"><div className="truncate text-[15px]">{m.name}</div><div className="truncate text-[12px] text-ink-3">{m.items.length} items · {m.items.map((i) => i.name).join(", ")}</div></button>
                  <div className="tnum text-[15px] font-semibold">{fmt(kcal)}<span className="ml-0.5 text-[11px] font-normal text-ink-3">kcal</span></div>
                  <button aria-label="Delete" onClick={() => setConfirm({ kind: "meal", id: m.id })} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-bad"><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        )}
      </Page>

      <FoodDetailSheet food={detail} open={!!detail} onClose={() => setDetail(null)} date={today()} mealId={suggestedMealId(profile)} meals={dayMeals} nutrientTargets={nutrientTargets} macroTargets={profile.targets} onDone={() => setDetail(null)} onEdit={(f) => { setDetail(null); if (f.source === "recipe" && f.recipeId) { const r = recipesLive?.find((x) => x.id === f.recipeId); if (r) setRecipe({ open: true, initial: r }); } else setCustom({ open: true, initial: f }); }} />
      <CustomFoodSheet open={custom.open} initial={custom.initial} onClose={() => setCustom({ open: false })} onSaved={() => setCustom({ open: false })} />
      <RecipeUrlImport open={urlImport} onClose={() => setUrlImport(false)} onSaved={() => setUrlImport(false)} />
      <RecipeEditor open={recipe.open} initial={recipe.initial} onClose={() => setRecipe({ open: false })} onSaved={() => setRecipe({ open: false })} />
      <Confirm open={!!confirm} title={confirm?.kind === "recipe" ? "Delete this recipe?" : confirm?.kind === "meal" ? "Delete this saved meal?" : "Delete this food?"} body="Diary entries that already use it keep their nutrition." onCancel={() => setConfirm(null)} onConfirm={async () => {
        if (!confirm) return;
        if (confirm.kind === "food") await deleteFood(confirm.id);
        else if (confirm.kind === "recipe" && confirm.recipe) await deleteRecipe(confirm.recipe);
        else if (confirm.kind === "meal") await deleteSavedMeal(confirm.id);
        toast("Deleted"); setConfirm(null);
      }} />
      <Sheet open={!!mealView} onClose={() => setMealView(null)} title={mealView?.name}>
        <div className="divide-y divide-line">
          {mealView?.items.map((i, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 text-[14px]"><span className="truncate">{i.name} <span className="text-ink-3">· {i.servingQty && i.servingLabel ? `${i.servingQty} × ${i.servingLabel}` : `${Math.round(i.grams)} g`}</span></span><span className="tnum text-ink-2">{fmt(i.nutrients.kcal)} kcal</span></div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-ink-3">Log this meal from Today → Add food → Meals.</p>
      </Sheet>
    </>
  );
}
