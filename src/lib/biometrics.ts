import type { BiometricKind } from "@/db/types";

export interface BiometricDef { kind: BiometricKind; label: string; unit: string; step: number; min?: number; max?: number; twoValues?: boolean; higherIsBetter?: boolean; decimals: number }

export const BIOMETRICS: BiometricDef[] = [
  { kind: "bloodPressure", label: "Blood pressure", unit: "mmHg", step: 1, twoValues: true, decimals: 0 },
  { kind: "restingHr", label: "Resting heart rate", unit: "bpm", step: 1, decimals: 0 },
  { kind: "hrv", label: "HRV", unit: "ms", step: 1, decimals: 0, higherIsBetter: true },
  { kind: "sleep", label: "Sleep", unit: "h", step: 0.25, decimals: 2, higherIsBetter: true },
  { kind: "steps", label: "Steps", unit: "steps", step: 100, decimals: 0, higherIsBetter: true },
  { kind: "bodyFat", label: "Body fat", unit: "%", step: 0.1, decimals: 1 },
  { kind: "glucose", label: "Blood glucose", unit: "mg/dL", step: 1, decimals: 0 },
  { kind: "ketones", label: "Blood ketones", unit: "mmol/L", step: 0.1, decimals: 1 },
  { kind: "temperature", label: "Body temperature", unit: "°C", step: 0.1, decimals: 1 },
  { kind: "mood", label: "Mood", unit: "/5", step: 1, min: 1, max: 5, decimals: 0, higherIsBetter: true },
  { kind: "energy", label: "Energy", unit: "/5", step: 1, min: 1, max: 5, decimals: 0, higherIsBetter: true },
];

export const BIOMETRIC_BY_KIND = Object.fromEntries(BIOMETRICS.map((b) => [b.kind, b])) as Record<BiometricKind, BiometricDef>;

export function formatBiometric(kind: BiometricKind, value: number, value2?: number): string {
  const d = BIOMETRIC_BY_KIND[kind];
  if (d.twoValues) return `${Math.round(value)}/${Math.round(value2 ?? 0)}`;
  return value.toLocaleString(undefined, { maximumFractionDigits: d.decimals });
}
