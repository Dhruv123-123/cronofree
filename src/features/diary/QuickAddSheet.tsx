import { useState } from "react";
import type { ISODate } from "@/db/types";
import { logQuick } from "@/lib/foodRepo";
import { macroKcal } from "@/lib/nutrients";
import { Sheet, Button, Field, Input, NumberInput, Segmented, useToast } from "@/components/ui";

export default function QuickAddSheet({ open, onClose, date, mealId, meals }: { open: boolean; onClose: () => void; date: ISODate; mealId: string; meals: { id: string; name: string }[] }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState<number | "">("");
  const [p, setP] = useState<number | "">("");
  const [c, setC] = useState<number | "">("");
  const [f, setF] = useState<number | "">("");
  const [meal, setMeal] = useState(mealId);
  const fromMacros = macroKcal({ protein: Number(p) || 0, carbs: Number(c) || 0, fat: Number(f) || 0 });
  const effectiveKcal = kcal === "" ? fromMacros : Number(kcal);

  async function submit() {
    if (effectiveKcal <= 0 && !p && !c && !f) return;
    await logQuick({ date, mealId: meal, name: name.trim() || "Quick add", nutrients: { kcal: effectiveKcal, protein: Number(p) || 0, carbs: Number(c) || 0, fat: Number(f) || 0 } });
    toast("Added");
    setName(""); setKcal(""); setP(""); setC(""); setF("");
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Quick add" footer={<Button full variant="primary" onClick={submit} disabled={effectiveKcal <= 0}>Add {Math.round(effectiveKcal)} kcal</Button>}>
      <p className="mb-4 text-[14px] text-ink-2">Log calories or macros without a food. Leave calories blank to calculate them from the macros.</p>
      <div className="flex flex-col gap-3">
        <Field label="Description (optional)"><Input placeholder="e.g. Restaurant pasta" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Calories"><NumberInput value={kcal} onChange={setKcal} suffix="kcal" placeholder={fromMacros ? String(Math.round(fromMacros)) : "0"} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Protein"><NumberInput value={p} onChange={setP} suffix="g" /></Field>
          <Field label="Carbs"><NumberInput value={c} onChange={setC} suffix="g" /></Field>
          <Field label="Fat"><NumberInput value={f} onChange={setF} suffix="g" /></Field>
        </div>
        <Field label="Meal"><Segmented value={meal} onChange={setMeal} options={meals.map((m) => ({ value: m.id, label: m.name }))} className="w-full" /></Field>
      </div>
    </Sheet>
  );
}
