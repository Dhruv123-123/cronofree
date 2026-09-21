import { useEffect, useRef, useState, createContext, useContext, useCallback, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { X, Check, AlertTriangle, Info } from "lucide-react";

/* ───────────────────────────── Button ───────────────────────────── */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-semibold hover:brightness-110 active:brightness-95",
  secondary: "bg-raised text-ink border border-line hover:border-line-strong active:bg-sunken",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
  danger: "bg-bad-soft text-bad font-semibold hover:brightness-105",
  soft: "bg-accent-soft text-accent font-semibold hover:brightness-105",
};
const SIZES: Record<Size, string> = { sm: "h-9 px-3 text-[13px] rounded-lg gap-1.5", md: "h-11 px-4 text-[15px] rounded-xl gap-2", lg: "h-13 px-5 text-base rounded-2xl gap-2" };

export function Button({ variant = "secondary", size = "md", className = "", full, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; full?: boolean }) {
  return <button {...rest} className={`inline-flex items-center justify-center whitespace-nowrap transition-[filter,background-color] select-none ${VARIANTS[variant]} ${SIZES[size]} ${full ? "w-full" : ""} ${className}`} />;
}

export function IconButton({ className = "", label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} {...rest} className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-raised hover:text-ink active:bg-sunken ${className}`} />;
}

/* ───────────────────────────── Layout bits ───────────────────────────── */
export function Card({ children, className = "", onClick, as: Tag = "div" }: { children: ReactNode; className?: string; onClick?: () => void; as?: "div" | "section" | "button" }) {
  return <Tag onClick={onClick} className={`card ${onClick ? "text-left w-full active:bg-raised" : ""} ${className}`}>{children}</Tag>;
}

export function SectionTitle({ children, action, className = "" }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <h2 className="text-[17px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <div className="text-[16px] font-semibold">{title}</div>
      {body && <p className="max-w-[34ch] text-[14px] text-ink-2">{body}</p>}
      {action}
    </div>
  );
}

export function Chip({ children, active, onClick, tone = "default", className = "" }: { children: ReactNode; active?: boolean; onClick?: () => void; tone?: "default" | "good" | "warn" | "bad" | "accent"; className?: string }) {
  const tones = {
    default: active ? "bg-ink text-bg border-ink" : "bg-surface text-ink-2 border-line hover:border-line-strong",
    good: "bg-good-soft text-good border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    bad: "bg-bad-soft text-bad border-transparent",
    accent: "bg-accent-soft text-accent border-transparent",
  };
  const Tag = onClick ? "button" : "span";
  return <Tag onClick={onClick} className={`inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium ${tones[tone]} ${className}`}>{children}</Tag>;
}

export function Segmented<T extends string>({ value, onChange, options, className = "" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={`inline-flex rounded-xl bg-raised p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors ${value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label && <span className="text-[13px] font-medium text-ink-2">{label}</span>}
      {children}
      {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field ${props.className ?? ""}`} />;
}

export function NumberInput({ value, onChange, suffix, className = "", ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number | ""; onChange: (v: number | "") => void; suffix?: string }) {
  return (
    <div className={`relative ${className}`}>
      <input
        {...rest}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        className={`field tnum ${suffix ? "pr-12" : ""}`}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">{suffix}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line-strong"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export function Row({ label, value, sub, onClick, right, className = "" }: { label: ReactNode; value?: ReactNode; sub?: ReactNode; onClick?: () => void; right?: ReactNode; className?: string }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`flex w-full items-center gap-3 py-3 text-left ${onClick ? "active:bg-raised" : ""} ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px]">{label}</div>
        {sub && <div className="truncate text-[12px] text-ink-3">{sub}</div>}
      </div>
      {value !== undefined && <div className="tnum shrink-0 text-[15px] text-ink-2">{value}</div>}
      {right}
    </Tag>
  );
}

/* ───────────────────────────── Progress ───────────────────────────── */
export function Ring({ value, max, size = 132, stroke = 11, color = "var(--accent)", children, over = false }: { value: number; max: number; size?: number; stroke?: number; color?: string; children?: ReactNode; over?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const overPct = max > 0 && value > max ? Math.min(1, (value - max) / max) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over && overPct > 0 ? "var(--bad)" : color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 500ms cubic-bezier(.2,.8,.2,1)" }} />
        {overPct > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bad)" strokeWidth={stroke} strokeLinecap="round" opacity={0.9}
            strokeDasharray={c} strokeDashoffset={c * (1 - overPct)} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function Bar({ value, max, color, height = 6, className = "" }: { value: number; max: number; color: string; height?: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div className={`w-full overflow-hidden rounded-full bg-[var(--ring-track)] ${className}`} style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: over ? "var(--bad)" : color }} />
    </div>
  );
}

/* ───────────────────────────── Sheet / dialog ───────────────────────────── */
export function Sheet({ open, onClose, title, children, footer, size = "md", noPad }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "md" | "lg" | "full"; noPad?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { md: "md:max-w-[520px]", lg: "md:max-w-[720px]", full: "md:max-w-[960px]" };
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} className={`anim-sheet relative flex max-h-[92dvh] w-full flex-col bg-surface shadow-[var(--shadow-sheet)] rounded-t-[22px] md:max-h-[86vh] md:rounded-[22px] ${widths[size]}`}>
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-strong md:hidden" />
        {(title || true) && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3">
            <div className="min-w-0 text-[17px] font-semibold display truncate">{title}</div>
            <IconButton label="Close" onClick={onClose} className="-mr-2"><X size={20} /></IconButton>
          </div>
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${noPad ? "" : "px-5 pb-5"}`}>{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-surface px-5 py-3 safe-bottom rounded-b-[22px]">{footer}</div>}
        {!footer && <div className="safe-bottom shrink-0" />}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, title, body, confirmLabel = "Delete", danger = true, onConfirm, onCancel }: { open: boolean; title: string; body?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {body && <p className="mb-5 text-[15px] text-ink-2">{body}</p>}
      <div className="flex gap-2">
        <Button full onClick={onCancel}>Cancel</Button>
        <Button full variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Sheet>
  );
}

/* ───────────────────────────── Toasts ───────────────────────────── */
type ToastKind = "ok" | "warn" | "info";
interface Toast { id: number; text: string; kind: ToastKind; action?: { label: string; onClick: () => void } }
const ToastCtx = createContext<(text: string, kind?: ToastKind, action?: Toast["action"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: ToastKind = "ok", action?: Toast["action"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 2800);
  }, []);
  const icons = { ok: <Check size={16} />, warn: <AlertTriangle size={16} />, info: <Info size={16} /> };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(150px+env(safe-area-inset-bottom,0px))] z-[200] flex flex-col items-center gap-2 px-4 md:bottom-6">
          {toasts.map((t) => (
            <div key={t.id} className={`anim-sheet pointer-events-auto flex max-w-[420px] items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-[14px] shadow-[var(--shadow)] ${t.kind === "warn" ? "text-warn" : "text-ink"}`}>
              <span className={t.kind === "ok" ? "text-good" : ""}>{icons[t.kind]}</span>
              <span>{t.text}</span>
              {t.action && <button onClick={t.action.onClick} className="ml-1 font-semibold text-accent">{t.action.label}</button>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

/* ───────────────────────────── Stat tile ───────────────────────────── */
export function Stat({ label, value, unit, sub, tone }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  const toneCls = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "";
  return (
    <div className="card flex flex-col gap-1 px-4 py-3">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className={`tnum display text-[24px] font-semibold leading-none ${toneCls}`}>{value}{unit && <span className="ml-1 text-[13px] font-medium text-ink-3">{unit}</span>}</div>
      {sub && <div className="text-[12px] text-ink-2">{sub}</div>}
    </div>
  );
}
