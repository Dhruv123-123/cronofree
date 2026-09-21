import { useState } from "react";
import { NUTRIENT_BY_KEY, formatAmount, netCarbs, type Nutrients, type NutrientKey } from "@/lib/nutrients";
import { Bar, Segmented } from "@/components/ui";

const GROUPS: { id: string; label: string; keys: NutrientKey[] }[] = [
  { id: "general", label: "General", keys: ["kcal", "protein", "carbs", "fat", "fiber", "sugar", "addedSugar", "water", "alcohol", "caffeine"] },
  { id: "lipids", label: "Lipids", keys: ["fat", "satFat", "monoFat", "polyFat", "transFat", "omega3", "cholesterol"] },
  { id: "vitamins", label: "Vitamins", keys: ["vitA", "vitC", "vitD", "vitE", "vitK", "thiamin", "riboflavin", "niacin", "vitB6", "folate", "vitB12", "choline"] },
  { id: "minerals", label: "Minerals", keys: ["sodium", "potassium", "calcium", "iron", "magnesium", "phosphorus", "zinc", "selenium"] },
];

export function pctOf(value: number | undefined, target: number | undefined): number | null {
  if (!target || value === undefined) return null;
  return Math.round((value / target) * 100);
}

function tone(key: NutrientKey, pct: number | null): string {
  if (pct === null) return "var(--ink-3)";
  const def = NUTRIENT_BY_KEY[key];
  if (def.limit) return pct > 100 ? "var(--bad)" : pct > 80 ? "var(--warn)" : "var(--good)";
  return pct >= 100 ? "var(--good)" : pct >= 50 ? "var(--accent)" : "var(--warn)";
}

export default function NutrientPanel({ totals, targets, macroTargets, compact }: { totals: Nutrients; targets: Nutrients; macroTargets?: { kcal: number; protein: number; carbs: number; fat: number }; compact?: boolean }) {
  const [group, setGroup] = useState("general");
  const g = GROUPS.find((x) => x.id === group)!;
  const allTargets: Nutrients = { ...targets, ...(macroTargets ?? {}) };
  const rows = g.keys.map((key) => {
    const value = totals[key];
    const target = allTargets[key];
    return { key, def: NUTRIENT_BY_KEY[key], value, target, pct: pctOf(value, target) };
  });
  return (
    <div className="flex flex-col gap-3">
      <Segmented value={group} onChange={setGroup} options={GROUPS.map((x) => ({ value: x.id, label: x.label }))} />
      <div className="flex flex-col divide-y divide-line">
        {group === "general" && (
          <div className="flex items-center justify-between py-2 text-[13px] text-ink-2">
            <span>Net carbs</span>
            <span className="tnum">{formatAmount("carbs", netCarbs(totals))} g</span>
          </div>
        )}
        {rows.map(({ key, def, value, target, pct }) => (
          <div key={key} className={`flex flex-col gap-1 ${compact ? "py-1.5" : "py-2.5"}`}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className={value === undefined ? "text-ink-3" : ""}>{def.label}</span>
              <span className="tnum flex items-baseline gap-1.5">
                <span className={value === undefined ? "text-ink-3" : "font-medium"}>{formatAmount(key, value)}</span>
                {target !== undefined && <span className="text-[12px] text-ink-3">/ {formatAmount(key, target)} {def.unit}</span>}
                {target === undefined && <span className="text-[12px] text-ink-3">{def.unit}</span>}
                {pct !== null && <span className="w-11 text-right text-[12px]" style={{ color: tone(key, pct) }}>{pct}%</span>}
              </span>
            </div>
            {target !== undefined && <Bar value={value ?? 0} max={target} color={tone(key, pct)} height={4} />}
          </div>
        ))}
      </div>
      <p className="text-[12px] text-ink-3">Targets are adult Dietary Reference Intakes (RDA/AI) for your sex and age. Limits (sodium, saturated fat, added sugar) follow the Dietary Guidelines. Foods without micronutrient data show as missing, not zero.</p>
    </div>
  );
}
