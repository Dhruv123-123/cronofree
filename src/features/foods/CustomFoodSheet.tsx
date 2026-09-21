import { useEffect, useState } from "react";
import type { Food } from "@/db/types";
import { saveCustomFood, type CustomFoodInput } from "@/lib/foodRepo";
import { NUTRIENTS, type NutrientKey, type Nutrients, macroKcal, scaleNutrients } from "@/lib/nutrients";
import { Sheet, Button, Field, Input, NumberInput, Toggle, useToast } from "@/components/ui";

const PRIMARY: NutrientKey[] = ["kcal", "protein", "carbs", "fat"];
const SECONDARY: NutrientKey[] = ["fiber", "sugar", "addedSugar", "satFat", "transFat", "cholesterol", "sodium", "potassium", "calcium", "iron", "vitD"];
const MORE: NutrientKey[] = NUTRIENTS.map((n) => n.key).filter((k) => !PRIMARY.includes(k) && !SECONDARY.includes(k));

export default function CustomFoodSheet({ open, onClose, initial, barcode, onSaved }: { open: boolean; onClose: () => void; initial?: Food | null; barcode?: string; onSaved: (f: Food) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [code, setCode] = useState("");
  const [servingLabel, setServingLabel] = useState("1 serving");
  const [servingGrams, setServingGrams] = useState<number | "">(100);
  const [liquid, setLiquid] = useState(false);
  const [vals, setVals] = useState<Record<string, number | "">>({});
  const [more, setMore] = useState(false);
  const [extra, setExtra] = useState<{ label: string; grams: number | "" }[]>([]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name); setBrand(initial.brand ?? ""); setCode(initial.barcode ?? "");
      const s = initial.servings.find((x) => x.id === initial.defaultServingId) ?? initial.servings[0];
      setServingLabel(s?.label ?? "1 serving"); setServingGrams(s?.grams ?? 100); setLiquid(!!initial.isLiquid);
      const per = scaleNutrients(initial.per100, (s?.grams ?? 100) / 100);
      const v: Record<string, number | ""> = {};
      for (const k of Object.keys(per) as NutrientKey[]) v[k] = Math.round((per[k] ?? 0) * 100) / 100;
      setVals(v);
      setExtra(initial.servings.filter((x) => x.id !== s?.id && !/^100\s?(g|ml)/i.test(x.label)).map((x) => ({ label: x.label, grams: x.grams })));
    } else {
      setName(""); setBrand(""); setCode(barcode ?? ""); setServingLabel("1 serving"); setServingGrams(100); setLiquid(false); setVals({}); setExtra([]);
    }
    setMore(false);
  }, [open, initial, barcode]);

  const per: Nutrients = {};
  for (const [k, v] of Object.entries(vals)) if (v !== "") per[k as NutrientKey] = Number(v);
  const kcalFromMacros = macroKcal(per);

  async function submit() {
    if (!name.trim() || !servingGrams) return;
    if (per.kcal === undefined && kcalFromMacros > 0) per.kcal = kcalFromMacros;
    const input: CustomFoodInput = { id: initial?.id, name, brand, barcode: code, servingLabel, servingGrams: Number(servingGrams), perServing: per, isLiquid: liquid, extraServings: extra.filter((e) => e.label && e.grams).map((e) => ({ label: e.label, grams: Number(e.grams) })) };
    const f = await saveCustomFood(input);
    toast(initial ? "Food updated" : "Food created");
    onSaved(f);
  }

  const field = (k: NutrientKey) => {
    const def = NUTRIENTS.find((n) => n.key === k)!;
    return (
      <Field key={k} label={def.label}>
        <NumberInput value={vals[k] ?? ""} onChange={(v) => setVals((s) => ({ ...s, [k]: v }))} suffix={def.unit} placeholder={k === "kcal" && kcalFromMacros ? String(Math.round(kcalFromMacros)) : "0"} />
      </Field>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={initial ? "Edit food" : "New food"} size="lg" footer={<Button full variant="primary" onClick={submit} disabled={!name.trim() || !servingGrams}>{initial ? "Save food" : "Create food"}</Button>}>
      <p className="mb-4 text-[14px] text-ink-2">Copy the nutrition label. Values are per one serving; everything else is worked out from the serving weight.</p>
      <div className="flex flex-col gap-3">
        <Field label="Name"><Input autoFocus placeholder="e.g. Oat bar, cinnamon" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Brand (optional)"><Input value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
          <Field label="Barcode (optional)"><Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <Field label="Serving name"><Input placeholder="1 bar, 1 cup, 2 cookies…" value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} /></Field>
          <Field label={`Serving ${liquid ? "mL" : "grams"}`}><NumberInput value={servingGrams} onChange={setServingGrams} suffix={liquid ? "mL" : "g"} /></Field>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-raised px-3 py-2">
          <span className="text-[14px]">Liquid (measured in mL)</span>
          <Toggle checked={liquid} onChange={setLiquid} label="Liquid" />
        </div>
        <div className="mt-1 text-[13px] font-semibold">Per serving</div>
        <div className="grid grid-cols-2 gap-2">{PRIMARY.map(field)}</div>
        <div className="grid grid-cols-2 gap-2">{SECONDARY.map(field)}</div>
        <button onClick={() => setMore((m) => !m)} className="py-1 text-left text-[14px] font-medium text-accent">{more ? "Hide" : "Show"} vitamins, minerals and other nutrients</button>
        {more && <div className="grid grid-cols-2 gap-2">{MORE.map(field)}</div>}
        <div className="mt-1 text-[13px] font-semibold">Other serving sizes</div>
        {extra.map((e, i) => (
          <div key={i} className="grid grid-cols-[1fr_110px_40px] items-end gap-2">
            <Input placeholder="e.g. 1 box" value={e.label} onChange={(ev) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, label: ev.target.value } : y)))} />
            <NumberInput value={e.grams} onChange={(v) => setExtra((x) => x.map((y, j) => (j === i ? { ...y, grams: v } : y)))} suffix={liquid ? "mL" : "g"} />
            <Button variant="ghost" onClick={() => setExtra((x) => x.filter((_, j) => j !== i))}>✕</Button>
          </div>
        ))}
        <Button size="sm" onClick={() => setExtra((x) => [...x, { label: "", grams: "" }])} className="self-start">Add a serving size</Button>
      </div>
    </Sheet>
  );
}
