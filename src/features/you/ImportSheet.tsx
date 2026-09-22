import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { Profile } from "@/db/types";
import { parseCsv, detectImport, runImport, type ImportKind, type ImportResult } from "@/lib/importers";
import { Sheet, Button, useToast } from "@/components/ui";

const LABEL: Record<ImportKind, string> = {
  "mfp-nutrition": "MyFitnessPal nutrition export (per meal, per day)",
  "mfp-measurements": "MyFitnessPal measurements (weight)",
  "cronometer-servings": "Cronometer servings (every food you logged)",
  "cronometer-biometrics": "Cronometer biometrics (weight, sleep, blood pressure…)",
  "cronometer-daily": "Cronometer daily summary",
  unknown: "Not recognised",
};

export default function ImportSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string; kind: ImportKind; rows: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    const rows = parseCsv(text);
    setFile({ name: f.name, text, kind: detectImport(rows), rows: Math.max(0, rows.length - 1) });
    setResult(null);
  }
  async function go() {
    if (!file) return;
    setBusy(true);
    try {
      const r = await runImport(file.text, { mealNames: profile.mealNames, weightUnitGuess: profile.units.weight });
      setResult(r);
      toast(`Imported ${r.entries + r.weights + r.biometrics} records`);
    } catch (e) { toast(`Import failed: ${(e as Error).message}`, "warn"); }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Import from another app" footer={<Button full variant="primary" disabled={!file || file.kind === "unknown" || busy} onClick={go}>{busy ? "Importing…" : "Import"}</Button>}>
      <div className="flex flex-col gap-3 text-[14px]">
        <div className="rounded-xl bg-raised p-3 text-[13px] text-ink-2">
          <div className="font-semibold text-ink">How to get your export</div>
          <p className="mt-1"><span className="font-medium text-ink">MyFitnessPal:</span> myfitnesspal.com → Reports → Export Data (choose a date range). Import <em>Nutrition-Summary.csv</em> and <em>Measurement-Summary.csv</em>.</p>
          <p className="mt-1"><span className="font-medium text-ink">Cronometer:</span> cronometer.com → Settings → Account → Export Data. Import <em>servings.csv</em> (every food, all nutrients) and <em>biometrics.csv</em>.</p>
          <p className="mt-1">Imports merge safely: identical rows are skipped, so you can re-run with a bigger range.</p>
        </div>
        <button onClick={() => ref.current?.click()} className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-4 text-left">
          <Upload size={20} className="text-ink-3" />
          <div className="flex-1"><div className="font-medium">{file ? file.name : "Choose a CSV file"}</div><div className="text-[12px] text-ink-3">{file ? `${LABEL[file.kind]} · ${file.rows.toLocaleString()} rows` : "From MyFitnessPal or Cronometer"}</div></div>
        </button>
        <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {file?.kind === "unknown" && <p className="text-[13px] text-warn">That file's columns weren't recognised. Make sure it is one of the exports named above.</p>}
        {result && <div className="rounded-xl bg-good-soft p-3 text-[13px] text-good">Done: {result.entries} diary entries, {result.weights} weigh-ins, {result.biometrics} biometrics added · {result.skipped} rows skipped (duplicates or unreadable).</div>}
      </div>
    </Sheet>
  );
}
