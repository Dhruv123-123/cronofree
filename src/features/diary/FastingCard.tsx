import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Timer } from "lucide-react";
import { db, put } from "@/db";
import type { Profile } from "@/db/types";
import { useNow } from "@/hooks";
import { formatDuration, formatTime } from "@/lib/dates";
import { uid } from "@/lib/id";
import { scheduleSync } from "@/lib/sync";
import { Button, Sheet, Segmented, Bar } from "@/components/ui";

const PRESETS = [12, 14, 16, 18, 20, 24];

export default function FastingCard({ profile }: { profile: Profile }) {
  const active = useLiveQuery(() => db.fasts.filter((f) => !f.deletedAt && !f.endAt).first(), []);
  const recent = useLiveQuery(() => db.fasts.orderBy("startAt").reverse().filter((f) => !f.deletedAt && !!f.endAt).limit(7).toArray(), []);
  const now = useNow(1000);
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(profile.fastingDefaultHours);

  async function start() {
    await put("fasts", { id: uid("fast"), startAt: Date.now(), endAt: null, targetHours: hours, updatedAt: 0 });
    scheduleSync();
    setOpen(false);
  }
  async function stop() {
    if (!active) return;
    await put("fasts", { ...active, endAt: Date.now() });
    scheduleSync();
  }

  const elapsed = active ? (now - active.startAt) / 1000 : 0;
  const targetSec = (active?.targetHours ?? hours) * 3600;
  const remaining = Math.max(0, targetSec - elapsed);
  const avgH = recent && recent.length ? recent.reduce((a, f) => a + ((f.endAt! - f.startAt) / 3.6e6), 0) / recent.length : null;

  return (
    <div className="card p-4">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised text-accent"><Timer size={22} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <div className="text-[15px] font-semibold">{active ? "Fasting" : "Fasting"}</div>
            {active ? <div className="tnum text-[13px] text-ink-2">{active.targetHours}h goal</div> : avgH !== null && <div className="tnum text-[13px] text-ink-3">avg {avgH.toFixed(1)}h · last {recent!.length}</div>}
          </div>
          {active ? (
            <>
              <div className="tnum display mt-1 text-[22px] font-semibold leading-none">{formatDuration(elapsed)}</div>
              <Bar value={elapsed} max={targetSec} color="var(--accent)" className="mt-2" height={4} />
              <div className="mt-1 text-[12px] text-ink-3">{remaining > 0 ? `${formatDuration(remaining)} to go · started ${formatTime(active.startAt)}` : "Goal reached · eat when ready"}</div>
            </>
          ) : (
            <div className="mt-0.5 text-[13px] text-ink-2">Not fasting. Start a timer after your last meal.</div>
          )}
        </div>
        {active ? <Button size="sm" onClick={stop}>End</Button> : <Button size="sm" variant="soft" onClick={() => setOpen(true)}>Start</Button>}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Start a fast">
        <p className="mb-3 text-[14px] text-ink-2">Pick a fasting window. The timer keeps running in the background and shows on Today.</p>
        <Segmented value={String(hours)} onChange={(v) => setHours(Number(v))} options={PRESETS.map((h) => ({ value: String(h), label: `${h}h` }))} className="w-full" />
        <Button full variant="primary" className="mt-4" onClick={start}>Start {hours}-hour fast</Button>
      </Sheet>
    </div>
  );
}
