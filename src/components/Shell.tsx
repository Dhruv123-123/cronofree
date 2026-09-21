import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { CalendarDays, Dumbbell, TrendingUp, Apple, UserRound, RefreshCw, CloudOff, Cloud, AlertCircle } from "lucide-react";
import { useSyncStatus } from "@/hooks";
import { syncNow } from "@/lib/sync";

const TABS = [
  { to: "/", label: "Today", icon: CalendarDays, end: true },
  { to: "/foods", label: "Foods", icon: Apple },
  { to: "/train", label: "Train", icon: Dumbbell },
  { to: "/trends", label: "Trends", icon: TrendingUp },
  { to: "/you", label: "You", icon: UserRound },
];

export function SyncPill({ compact }: { compact?: boolean }) {
  const s = useSyncStatus();
  const icon = s.state === "syncing" ? <RefreshCw size={14} className="animate-spin" /> : s.state === "error" ? <AlertCircle size={14} /> : s.state === "off" ? <CloudOff size={14} /> : <Cloud size={14} />;
  const tone = s.state === "error" ? "text-bad" : s.state === "off" ? "text-ink-3" : "text-ink-2";
  const label = s.state === "off" ? "Not synced" : s.state === "syncing" ? "Syncing" : s.state === "error" ? "Sync failed" : s.pending > 0 ? `${s.pending} pending` : "Synced";
  return (
    <button onClick={() => syncNow()} title={s.message ?? label} className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[12px] font-medium ${tone}`}>
      {icon}{!compact && <span>{label}</span>}
    </button>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1200px] md:gap-8 md:px-6">
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-[200px] shrink-0 flex-col gap-1 py-6 md:flex">
        <div className="mb-6 flex items-center gap-2 px-3">
          <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <div className="display text-[18px] font-semibold tracking-tight">Cronofree</div>
        </div>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${isActive ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink"}`}>
            <t.icon size={20} strokeWidth={1.9} />{t.label}
          </NavLink>
        ))}
        <div className="mt-auto px-3"><SyncPill /></div>
      </aside>

      <main className="min-w-0 flex-1 pb-[calc(76px+env(safe-area-inset-bottom,0px))] md:pb-10">
        <div key={loc.pathname.split("/")[1]} className="anim-fade">{children}</div>
      </main>

      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-[90] border-t border-line bg-surface/95 backdrop-blur safe-bottom md:hidden">
        <div className="mx-auto grid max-w-[600px] grid-cols-5">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `flex h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? "text-accent" : "text-ink-3"}`}>
              {({ isActive }) => (<><t.icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />{t.label}</>)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Page header used by every tab. */
export function PageHeader({ title, sub, right, children }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-[80] bg-bg/90 backdrop-blur safe-top">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3 md:px-0 md:pt-6">
        <div className="min-w-0">
          {sub && <div className="eyebrow">{sub}</div>}
          <h1 className="truncate text-[24px] font-semibold leading-tight">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="md:hidden"><SyncPill compact /></span>
          {right}
        </div>
      </div>
      {children}
    </header>
  );
}

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-4 px-4 md:px-0 ${className}`}>{children}</div>;
}
