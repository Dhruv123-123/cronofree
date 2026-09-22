import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { Food } from "@/db/types";
import { NUTRIENTS, NUTRIENT_BY_KEY, formatAmount, type NutrientKey } from "@/lib/nutrients";
import { defaultServing } from "@/lib/foodRepo";
import { Segmented, Chip, EmptyState } from "@/components/ui";
import { fmt } from "@/lib/units";

type Basis = "per100g" | "per100kcal" | "perServing";

/** Cronometer's "Oracle": which foods are richest in a nutrient. Works entirely offline on the local library. */
export default function NutrientFinder({ onPick }: { onPick: (f: Food) => void }) {
  const [key, setKey] = useState<NutrientKey>("protein");
  const [basis, setBasis] = useState<Basis>("per100kcal");
  const [cat, setCat] = useState("all");
  const [rows, setRows] = useState<{ f: Food; v: number }[]>([]);
  const foods = useLiveQuery(() => db.foods.filter((f) => !f.deletedAt).toArray(), []);
  const categories = useMemo(() => [...new Set((foods ?? []).map((f) => f.category).filter((c): c is string => !!c))].sort(), [foods]);
  const def = NUTRIENT_BY_KEY[key];

  useEffect(() => {
    if (!foods) return;
    const list = foods.filter((f) => (cat === "all" || f.category === cat) && f.per100[key] !== undefined && (f.per100.kcal ?? 0) >= 0);
    const scored = list.map((f) => {
      const v = f.per100[key] ?? 0;
      let val = v;
      if (basis === "per100kcal") val = (f.per100.kcal ?? 0) > 5 ? (v / (f.per100.kcal ?? 1)) * 100 : 0;
      if (basis === "perServing") val = (v * defaultServing(f).grams) / 100;
      return { f, v: val };
    }).filter((x) => x.v > 0);
    scored.sort((a, b) => (def.limit ? a.v - b.v : b.v - a.v));
    setRows(scored.slice(0, 60));
  }, [foods, key, basis, cat, def.limit]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-2">Find foods richest in a nutrient across the {foods?.length.toLocaleString() ?? "…"} foods on this device. Ranking per 100 kcal favours nutrient density; per serving shows what one realistic portion gives you.</p>
      <div className="flex gap-2">
        <select value={key} onChange={(e) => setKey(e.target.value as NutrientKey)} className="field flex-1">
          {NUTRIENTS.filter((n) => n.key !== "kcal").map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="field flex-1"><option value="all">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      <Segmented value={basis} onChange={setBasis} options={[{ value: "per100kcal", label: "per 100 kcal" }, { value: "per100g", label: "per 100 g" }, { value: "perServing", label: "per serving" }]} className="w-full" />
      {def.limit && <Chip tone="warn">Showing lowest first (limit nutrient)</Chip>}
      <div className="card divide-y divide-line px-4">
        {rows.map(({ f, v }, i) => (
          <button key={f.id} onClick={() => onPick(f)} className="flex w-full items-center gap-3 py-2.5 text-left active:bg-raised">
            <span className="tnum w-6 text-[12px] text-ink-3">{i + 1}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-[14px]">{f.name}</div><div className="truncate text-[12px] text-ink-3">{f.category ?? ""}{basis === "perServing" ? ` · ${defaultServing(f).label}` : ""} · {fmt(basis === "perServing" ? ((f.per100.kcal ?? 0) * defaultServing(f).grams) / 100 : f.per100.kcal)} kcal</div></div>
            <div className="tnum text-right text-[15px] font-semibold">{formatAmount(key, v)}<span className="ml-1 text-[11px] font-normal text-ink-3">{def.unit}</span></div>
          </button>
        ))}
        {!rows.length && <EmptyState title="No data for this nutrient yet" body="Install the offline USDA pack (You → Food sources) for full coverage." />}
      </div>
    </div>
  );
}
