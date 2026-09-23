import { useEffect, useState } from "react";
import { Sparkles, Check } from "lucide-react";
import { getAiConfig, setAiConfig, testAi, DEFAULT_AI, type AiConfig } from "@/lib/ai";
import { Sheet, Button, Field, Input, Segmented, Toggle, useToast } from "@/components/ui";

export default function AiSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [c, setC] = useState<AiConfig>(DEFAULT_AI);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  useEffect(() => { if (open) { getAiConfig().then(setC); setResult(null); } }, [open]);
  const set = (p: Partial<AiConfig>) => setC((x) => ({ ...x, ...p }));

  return (
    <Sheet open={open} onClose={onClose} title="AI assistant" size="lg" footer={
      <div className="flex gap-2">
        <Button full disabled={testing || !c.apiKey} onClick={async () => { setTesting(true); try { setResult({ ok: true, msg: await testAi(c) }); } catch (e) { setResult({ ok: false, msg: (e as Error).message }); } setTesting(false); }}>{testing ? "Testing…" : "Test"}</Button>
        <Button full variant="primary" onClick={async () => { await setAiConfig(c); toast("AI settings saved"); onClose(); }}>Save</Button>
      </div>
    }>
      <div className="flex flex-col gap-4 text-[14px]">
        <div className="rounded-xl bg-raised p-3 text-[13px] text-ink-2">
          <div className="flex items-center gap-2 font-semibold text-ink"><Sparkles size={16} className="text-accent" /> What this unlocks</div>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li><span className="text-ink">Ask AI</span> when a search comes up empty: the model looks the item up (with web search when your deployment supports it) and returns calories and macros with a source you can check.</li>
            <li><span className="text-ink">Describe a meal</span> in plain English ("two eggs, sourdough toast with butter, oat latte") and get separate items to log.</li>
          </ul>
          <p className="mt-2">Your key is stored only on this device. Calls go straight to your provider; if it blocks browser requests, they're relayed through your sync server, which only forwards them.</p>
        </div>
        <Field label="Provider"><Segmented value={c.provider} onChange={(v) => set({ provider: v, endpoint: v === "openai" ? "" : c.endpoint, apiVersion: c.apiVersion })} options={[{ value: "azure", label: "Azure OpenAI" }, { value: "openai", label: "OpenAI / compatible" }]} className="w-full" /></Field>
        {c.provider === "azure" ? (
          <>
            <Field label="Endpoint" hint="From Azure AI Foundry → your resource → Keys and Endpoint."><Input placeholder="https://my-resource.openai.azure.com" value={c.endpoint} onChange={(e) => set({ endpoint: e.target.value })} inputMode="url" autoCapitalize="none" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Deployment name" hint="A cheap model is plenty: gpt-4o-mini, gpt-4.1-mini or gpt-5-mini."><Input placeholder="gpt-4o-mini" value={c.model} onChange={(e) => set({ model: e.target.value })} autoCapitalize="none" /></Field>
              <Field label="API version"><Input value={c.apiVersion} onChange={(e) => set({ apiVersion: e.target.value })} autoCapitalize="none" /></Field>
            </div>
            <Field label="Authentication"><Segmented value={c.authMode} onChange={(v) => set({ authMode: v })} options={[{ value: "api-key", label: "API key" }, { value: "bearer", label: "Entra ID token" }]} className="w-full" /></Field>
            <Field label={c.authMode === "api-key" ? "API key" : "Bearer token"} hint={c.authMode === "bearer" ? "An Entra access token for scope https://ai.azure.com/.default (az account get-access-token --scope https://ai.azure.com/.default). Tokens expire hourly; API keys are simpler for a personal app." : "Keys and Endpoint → KEY 1."}><Input type="password" value={c.apiKey} onChange={(e) => set({ apiKey: e.target.value })} autoCapitalize="none" spellCheck={false} /></Field>
          </>
        ) : (
          <>
            <Field label="Base URL (optional)" hint="Blank = api.openai.com. Any OpenAI-compatible server works (OpenRouter, Groq, a local one)."><Input placeholder="https://api.openai.com" value={c.endpoint} onChange={(e) => set({ endpoint: e.target.value })} inputMode="url" autoCapitalize="none" /></Field>
            <Field label="Model" hint="For built-in web search on OpenAI: gpt-4o-mini-search-preview (chat) or gpt-4.1-mini / gpt-5-mini via the Responses API."><Input placeholder="gpt-4o-mini" value={c.model} onChange={(e) => set({ model: e.target.value })} autoCapitalize="none" /></Field>
            <Field label="API key"><Input type="password" value={c.apiKey} onChange={(e) => set({ apiKey: e.target.value })} autoCapitalize="none" spellCheck={false} /></Field>
          </>
        )}
        <div className="flex items-center justify-between rounded-xl bg-raised px-3 py-2"><div><div>Use web search</div><div className="text-[12px] text-ink-3">Responses API <code className="mono">web_search</code> tool (on Azure: Bing-grounded, GPT-4-class models and later, billed per Bing request). Falls back to plain chat if the tool is blocked.</div></div><Toggle checked={c.webSearch} onChange={(v) => set({ webSearch: v })} /></div>
        <Field label="Transport"><Segmented value={c.transport} onChange={(v) => set({ transport: v })} options={[{ value: "auto", label: "Auto" }, { value: "direct", label: "Direct" }, { value: "proxy", label: "Via sync server" }]} className="w-full" /></Field>
        {result && <div className={`flex items-start gap-2 text-[13px] ${result.ok ? "text-good" : "text-bad"}`}>{result.ok && <Check size={14} className="mt-0.5 shrink-0" />}<span>{result.msg}</span></div>}
      </div>
    </Sheet>
  );
}
