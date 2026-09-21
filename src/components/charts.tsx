import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, ReferenceLine, Area, ComposedChart, Cell } from "recharts";
import { formatShort } from "@/lib/dates";

const axis = { fontSize: 11, fill: "var(--ink-3)" };

function TooltipBox({ active, payload, label, fmtValue }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]; label?: string; fmtValue?: (v: number, key?: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow)]">
      <div className="mb-1 text-ink-3">{label ? formatShort(String(label)) : ""}</div>
      {payload.filter((p) => p.value !== undefined && p.value !== null).map((p, i) => (
        <div key={i} className="flex items-center gap-2 tnum"><span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} /><span className="text-ink-2">{p.name}</span><span className="ml-auto font-medium">{fmtValue ? fmtValue(Number(p.value), String(p.dataKey)) : Math.round(Number(p.value) * 10) / 10}</span></div>
      ))}
    </div>
  );
}

export interface Series { key: string; name: string; color: string; dashed?: boolean; dot?: boolean; area?: boolean }

export function TrendChart({ data, series, height = 200, yDomain, refY, refLabel, fmtValue, unit }: { data: Record<string, unknown>[]; series: Series[]; height?: number; yDomain?: [number | "auto", number | "auto"]; refY?: number; refLabel?: string; fmtValue?: (v: number, key?: string) => string; unit?: string }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} tickFormatter={(d) => formatShort(String(d))} minTickGap={28} />
          <YAxis tick={axis} tickLine={false} axisLine={false} domain={yDomain ?? ["auto", "auto"]} width={52} tickFormatter={(v) => `${Math.round(Number(v))}${unit ?? ""}`} />
          <Tooltip content={<TooltipBox fmtValue={fmtValue} />} cursor={{ stroke: "var(--line-strong)" }} />
          {refY !== undefined && <ReferenceLine y={refY} stroke="var(--ink-3)" strokeDasharray="4 4" label={refLabel ? { value: refLabel, position: "insideTopRight", fontSize: 10, fill: "var(--ink-3)" } : undefined} />}
          {series.map((s) => s.area
            ? <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={0.1} strokeWidth={2} dot={false} connectNulls />
            : <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={s.dashed ? 1.5 : 2} strokeDasharray={s.dashed ? "3 3" : undefined} dot={s.dot ? { r: 3, strokeWidth: 0, fill: s.color } : false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }} connectNulls isAnimationActive={false} />)}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Columns({ data, dataKey, color, height = 160, refY, refLabel, colorFor, fmtValue, unit }: { data: Record<string, unknown>[]; dataKey: string; color: string; height?: number; refY?: number; refLabel?: string; colorFor?: (row: Record<string, unknown>) => string; fmtValue?: (v: number) => string; unit?: string }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap={3}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={{ stroke: "var(--line)" }} tickFormatter={(d) => formatShort(String(d))} minTickGap={28} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `${Math.round(Number(v))}${unit ?? ""}`} />
          <Tooltip content={<TooltipBox fmtValue={fmtValue} />} cursor={{ fill: "var(--raised)" }} />
          {refY !== undefined && <ReferenceLine y={refY} stroke="var(--ink-3)" strokeDasharray="4 4" label={refLabel ? { value: refLabel, position: "insideTopRight", fontSize: 10, fill: "var(--ink-3)" } : undefined} />}
          <Bar dataKey={dataKey} name={dataKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {colorFor && data.map((row, i) => <Cell key={i} fill={colorFor(row)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny inline sparkline. */
export function Sparkline({ values, color = "var(--accent)", width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values), max = Math.max(...values);
  const r = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 3 - ((v - min) / r) * (height - 6)}`);
  const last = pts[pts.length - 1].split(",");
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}

export { LineChart, Line };
