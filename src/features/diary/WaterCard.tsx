import { useLiveQuery } from "dexie-react-hooks";
import { Droplets, Minus, Plus } from "lucide-react";
import { db, put } from "@/db";
import type { ISODate, Profile } from "@/db/types";
import { mlToUnit, unitToMl } from "@/lib/units";
import { scheduleSync } from "@/lib/sync";

export default function WaterCard({ date, profile }: { date: ISODate; profile: Profile }) {
  const log = useLiveQuery(() => db.water.where("date").equals(date).filter((w) => !w.deletedAt).first(), [date]);
  const ml = log?.ml ?? 0;
  const goal = profile.waterGoalMl;
  const unit = profile.units.volume;
  const step = unit === "ml" ? 250 : unitToMl(8, "oz");
  const pct = Math.min(100, (ml / goal) * 100);
  async function add(delta: number) {
    const next = Math.max(0, ml + delta);
    await put("water", { id: log?.id ?? `water_${date}`, date, ml: next, updatedAt: 0, deletedAt: null });
    scheduleSync();
  }
  const glasses = Math.round(goal / step);
  const filled = Math.floor(ml / step);
  return (
    <div className="card flex items-center gap-4 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised text-water"><Droplets size={22} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <div className="text-[15px] font-semibold">Water</div>
          <div className="tnum text-[13px] text-ink-2">{Math.round(mlToUnit(ml, unit))} / {Math.round(mlToUnit(goal, unit))} {unit === "ml" ? "mL" : "oz"}</div>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: Math.min(12, glasses) }).map((_, i) => (
            <div key={i} className="h-2 flex-1 rounded-full" style={{ background: i < filled ? "var(--water)" : "var(--ring-track)" }} />
          ))}
        </div>
        <div className="mt-1 text-[12px] text-ink-3">{pct >= 100 ? "Goal reached" : `${Math.round(pct)}% of goal · ${unit === "ml" ? "250 mL" : "8 oz"} per tap`}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button aria-label="Remove water" onClick={() => add(-step)} className="flex h-9 w-9 items-center justify-center rounded-full bg-raised text-ink-2 active:bg-sunken"><Minus size={16} /></button>
        <button aria-label="Add water" onClick={() => add(step)} className="flex h-9 w-9 items-center justify-center rounded-full bg-water text-white active:brightness-90"><Plus size={18} /></button>
      </div>
    </div>
  );
}
