import { useEffect, useState } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { PageHeader } from "@/components/Shell";
import { useRestTimer } from "./useRestTimer";
import LogTab from "./LogTab";
import HistoryTab from "./HistoryTab";
import StatsTab from "./StatsTab";
import ProgramTab from "./ProgramTab";
import LibraryTab from "./LibraryTab";
import { formatDuration } from "@/lib/dates";
import { X } from "lucide-react";

const TABS = [
  { to: "/train", label: "Workout", end: true },
  { to: "/train/history", label: "History" },
  { to: "/train/stats", label: "Stats" },
  { to: "/train/program", label: "Program" },
  { to: "/train/library", label: "Exercises" },
];

export default function TrainPage() {
  const timer = useRestTimer();
  const loc = useLocation();
  const [editingInput, setEditingInput] = useState(false);
  useEffect(() => {
    const onIn = (e: FocusEvent) => setEditingInput(["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName));
    const onOut = () => setEditingInput(false);
    window.addEventListener("focusin", onIn); window.addEventListener("focusout", onOut);
    return () => { window.removeEventListener("focusin", onIn); window.removeEventListener("focusout", onOut); };
  }, []);
  const showTimer = (timer.running || timer.secondsLeft > 0) && !editingInput;
  const finishing = timer.running && timer.secondsLeft <= 5;

  return (
    <>
      <PageHeader title="Train" sub="Lifting log">
        <div className="scroll-x flex gap-1 px-4 pb-2 md:px-0">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium leading-9 ${isActive ? "bg-ink text-bg" : "border border-line bg-surface text-ink-2"}`}>{t.label}</NavLink>
          ))}
        </div>
      </PageHeader>
      <div key={loc.pathname} className="anim-fade">
        <Routes>
          <Route path="/" element={<LogTab timer={timer} />} />
          <Route path="history" element={<HistoryTab />} />
          <Route path="stats" element={<StatsTab />} />
          <Route path="program" element={<ProgramTab />} />
          <Route path="library" element={<LibraryTab />} />
        </Routes>
      </div>
      {showTimer && (
        <div className={`anim-sheet fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-[95] md:bottom-0 md:left-auto md:right-6 md:w-[380px] md:rounded-t-2xl ${finishing ? "bg-accent text-accent-ink" : "bg-ink text-bg"} px-4 py-3 shadow-[var(--shadow-sheet)]`}>
          <div className="mx-auto flex max-w-[600px] items-center gap-3">
            <span className="eyebrow !text-current opacity-70">Rest</span>
            <span className={`tnum display text-[26px] font-semibold leading-none ${finishing ? "anim-pulse" : ""}`}>{formatDuration(timer.secondsLeft)}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => timer.adjust(-15)} className="h-8 rounded-full border border-current/40 px-3 text-[12px] font-medium">−15</button>
              <button onClick={() => timer.adjust(15)} className="h-8 rounded-full border border-current/40 px-3 text-[12px] font-medium">+15</button>
              <button aria-label="Stop timer" onClick={timer.stop} className="flex h-8 w-8 items-center justify-center rounded-full border border-current/40"><X size={16} /></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
