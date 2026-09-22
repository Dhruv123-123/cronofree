import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, MapPin, Leaf, Search } from "lucide-react";
import { db } from "@/db";
import type { Food } from "@/db/types";
import { EmptyState, Chip } from "@/components/ui";
import { FoodRow } from "@/features/diary/AddFoodSheet";

/** Restaurants near campus and in SF, vegetarian items only, quick-addable. */
export default function EatOut({ onPick, compact }: { onPick: (f: Food) => void; compact?: boolean }) {
  const foods = useLiveQuery(() => db.foods.where("source").equals("restaurant").filter((f) => !f.deletedAt).toArray(), []);
  const [city, setCity] = useState<string>("all");
  const [restaurant, setRestaurant] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [veganOnly, setVeganOnly] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; city: string; items: Food[]; published: number }>();
    for (const f of foods ?? []) {
      const key = `${f.brand}|${f.category}`;
      const g = m.get(key) ?? { name: f.brand ?? "?", city: (f.category ?? "").replace("Eat out · ", ""), items: [], published: 0 };
      g.items.push(f); if (f.verified) g.published++;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  }, [foods]);
  const cities = [...new Set(groups.map((g) => g.city))];
  const visible = groups.filter((g) => city === "all" || g.city === city);
  const current = groups.find((g) => `${g.name}|${g.city}` === restaurant);
  const ql = q.trim().toLowerCase();
  const searchHits = ql ? (foods ?? []).filter((f) => f.search.includes(ql) && (!veganOnly || f.vegan)).slice(0, 60) : [];

  if (!foods) return null;
  if (!foods.length) return <EmptyState icon={<MapPin size={28} />} title="No restaurant data on this device yet" body="The restaurant pack installs automatically on first launch; check You → Food sources." />;

  return (
    <div className="flex flex-col gap-3">
      {!compact && <p className="text-[13px] text-ink-2">Vegetarian orders from restaurants around UC Berkeley and select San Francisco spots. Items marked <span className="text-good">published</span> use the restaurant's own nutrition; the rest are estimated from the menu.</p>}
      <div className="relative"><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes or restaurants" className="field h-11 pl-10" /></div>
      <div className="scroll-x -mx-4 flex gap-2 px-4 md:mx-0 md:px-0">
        <Chip active={city === "all"} onClick={() => { setCity("all"); setRestaurant(null); }}>All</Chip>
        {cities.map((c) => <Chip key={c} active={city === c} onClick={() => { setCity(c); setRestaurant(null); }}>{c}</Chip>)}
        <Chip active={veganOnly} onClick={() => setVeganOnly((v) => !v)} tone={veganOnly ? "good" : "default"}><Leaf size={12} /> Vegan only</Chip>
      </div>
      {ql ? (
        <div className="card divide-y divide-line px-4">
          {searchHits.map((f) => <FoodRow key={f.id} food={f} onClick={() => onPick(f)} />)}
          {!searchHits.length && <EmptyState title="No dishes matched" />}
        </div>
      ) : current ? (
        <div className="card overflow-hidden">
          <button onClick={() => setRestaurant(null)} className="flex w-full items-center gap-2 px-4 pt-3 text-[13px] text-accent">← All restaurants</button>
          <div className="px-4 pb-1 pt-2"><div className="display text-[18px] font-semibold">{current.name}</div><div className="text-[12px] text-ink-3">{current.city} · {current.items.length} vegetarian items · {current.published === current.items.length ? "nutrition published" : current.published ? `${current.published} published, rest estimated` : "estimated from menu"}</div></div>
          <div className="divide-y divide-line px-4">
            {current.items.filter((f) => !veganOnly || f.vegan).sort((a, b) => a.name.localeCompare(b.name)).map((f) => <FoodRow key={f.id} food={f} onClick={() => onPick(f)} trailing={f.vegan ? <Leaf size={14} className="ml-1 shrink-0 text-good" /> : undefined} />)}
          </div>
        </div>
      ) : (
        <div className="card divide-y divide-line px-4">
          {visible.map((g) => (
            <button key={`${g.name}|${g.city}`} onClick={() => setRestaurant(`${g.name}|${g.city}`)} className="flex w-full items-center gap-3 py-3 text-left active:bg-raised">
              <div className="min-w-0 flex-1"><div className="text-[15px]">{g.name}</div><div className="text-[12px] text-ink-3">{g.city} · {g.items.length} items{g.published ? ` · ${g.published === g.items.length ? "published nutrition" : `${g.published} published`}` : " · estimated"}</div></div>
              <ChevronRight size={18} className="text-ink-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
