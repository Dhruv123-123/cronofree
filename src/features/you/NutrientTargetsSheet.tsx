import { useEffect, useState } from "react";
import type { Profile } from "@/db/types";
import { updateProfile } from "@/hooks";
import { NUTRIENT_BY_KEY, formatAmount, type Nutrients, type NutrientKey } from "@/lib/nutrients";
import { referenceTargets } from "@/lib/nutrients";
import { ageOf } from "@/lib/dayModel";
import { NUTRIENT_GROUPS } from "@/features/diary/NutrientPanel";
import { Sheet, Button, Segmented, Toggle, useToast } from "@/components/ui";

export const DEFAULT_TRACKED: NutrientKey[] = ["fiber", "sodium", "potassium", "calcium", "iron", "magnesium", "vitD", "vitB12"];

/** Cronometer-style custom nutrient targets and the "highlighted" set shown on Today. */
export default function NutrientTargetsSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const toast = useToast();
  const [group, setGroup] = useState("general");
  const [overrides, setOverrides] = useState<Nutrients>({});
  const [tracked, setTracked] = useState<string[]>(DEFAULT_TRACKED);
  useEffect(() => { if (open) { setOverrides(profile.nutrientTargetOverrides ?? {}); setTracked(profile.trackedNutrients ?? DEFAULT_TRACKED); } }, [open, profile]);
  const defaults = referenceTargets(profile.sex, ageOf(profile), profile.targets.kcal, profile.targetWeightKg ?? 70);
  const g = NUTRIENT_GROUPS.find((x) => x.id === group)!;
  const keys = g.keys.filter((k) => !["kcal", "protein", "carbs", "fat"].includes(k));

  return (
    <Sheet open={open} onClose={onClose} title="Nutrient targets" size="lg" footer={<Button full variant="primary" onClick={async () => { await updateProfile({ nutrientTargetOverrides: overrides, trackedNutrients: tracked }); toast("Targets saved"); onClose(); }}>Save</Button>}>
      <p className="mb-3 text-[13px] text-ink-2">Defaults are the adult Dietary Reference Intakes for your sex and age. Type a value to override it, clear it to go back. Toggle the star to show a nutrient in Today's highlights.</p>
      <Segmented value={group} onChange={setGroup} options={NUTRIENT_GROUPS.map((x) => ({ value: x.id, label: x.label }))} className="mb-2 w-full" />
      <div className="divide-y divide-line">
        {keys.map((k) => {
          const def = NUTRIENT_BY_KEY[k];
          const d = defaults[k];
          const o = overrides[k];
          const on = tracked.includes(k);
          return (
            <div key={k} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1"><div className="text-[14px]">{def.label}{def.limit && <span className="ml-1 text-[11px] text-ink-3">limit</span>}</div><div className="text-[11px] text-ink-3">default {d !== undefined ? `${formatAmount(k, d)} ${def.unit}` : "none"}</div></div>
              <input type="number" inputMode="decimal" placeholder={d !== undefined ? formatAmount(k, d) : "–"} value={o ?? ""} onChange={(e) => setOverrides((s) => { const n = { ...s }; if (e.target.value === "") delete n[k]; else n[k] = Number(e.target.value); return n; })} className="field tnum !h-9 w-24 !px-2 text-right" />
              <span className="w-7 text-[11px] text-ink-3">{def.unit}</span>
              <Toggle checked={on} onChange={(v) => setTracked((t) => (v ? [...t, k] : t.filter((x) => x !== k)))} label={`Highlight ${def.label}`} />
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
