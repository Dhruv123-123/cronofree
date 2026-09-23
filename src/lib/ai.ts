/**
 * AI assistant: Azure OpenAI or any OpenAI-compatible endpoint, used for
 *  - looking up a food the library doesn't have (with the model's web search when available)
 *  - turning a plain-English meal description into logged items
 * Keys stay on this device (local kv, never synced). Requests go straight to
 * the provider from the browser; if the provider blocks browser calls (CORS),
 * they are relayed through your sync server's /api/ai, which only forwards.
 */
import { kvGet, kvSet } from "@/db";
import { getSyncConfig } from "./sync";
import type { Nutrients } from "./nutrients";

export interface AiConfig {
  provider: "azure" | "openai";
  endpoint: string; // https://myres.openai.azure.com  |  https://api.openai.com (or any compatible base)
  apiKey: string;
  authMode: "api-key" | "bearer"; // Azure: api-key header (default) or Entra bearer token
  model: string; // Azure deployment name or model id
  apiVersion: string; // Azure chat completions api-version
  webSearch: boolean; // use the Responses API web_search tool when possible
  transport: "auto" | "direct" | "proxy";
}

export const DEFAULT_AI: AiConfig = { provider: "azure", endpoint: "", apiKey: "", authMode: "api-key", model: "gpt-4o-mini", apiVersion: "2024-10-21", webSearch: true, transport: "auto" };
export const getAiConfig = async (): Promise<AiConfig> => ({ ...DEFAULT_AI, ...(await kvGet<Partial<AiConfig>>("ai", {})) });
export const setAiConfig = (c: AiConfig) => kvSet("ai", c);
export const aiConfigured = async () => { const c = await getAiConfig(); return !!(c.apiKey && c.model && (c.provider === "openai" || c.endpoint)); };

/* ─────────────────────────── transport ─────────────────────────── */
export async function relayFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }, transport: AiConfig["transport"] = "auto"): Promise<{ status: number; text: string }> {
  if (transport !== "proxy") {
    try {
      const r = await fetch(url, { method: init.method ?? "POST", headers: init.headers, body: init.body });
      return { status: r.status, text: await r.text() };
    } catch (e) {
      if (transport === "direct") throw e;
      // CORS / network → fall through to the relay
    }
  }
  const cfg = await getSyncConfig();
  if (!cfg.token) throw new Error("The provider blocks direct browser calls. Set up Sync (You → Sync) so requests can be relayed through your server.");
  const base = cfg.url.trim().replace(/\/+$/, "");
  const r = await fetch(`${base}/api/ai`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` }, body: JSON.stringify({ url, method: init.method ?? "POST", headers: init.headers ?? {}, body: init.body ?? "" }) });
  if (r.status === 401) throw new Error("Sync token rejected by the relay server.");
  const j = (await r.json()) as { status: number; text: string; error?: string };
  if (j.error) throw new Error(j.error);
  return j;
}

function authHeaders(c: AiConfig): Record<string, string> {
  if (c.provider === "azure" && c.authMode === "api-key") return { "api-key": c.apiKey };
  return { Authorization: `Bearer ${c.apiKey}` };
}

function baseUrl(c: AiConfig): string {
  const e = c.endpoint.trim().replace(/\/+$/, "");
  return c.provider === "openai" ? (e || "https://api.openai.com") : e;
}

export function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  throw new Error("The model did not return JSON.");
}

interface Msg { role: "system" | "user"; content: string }

/** Ask the model for a JSON object. Tries the Responses API with web search first (when enabled), then plain chat completions. */
export async function askJson(messages: Msg[], opts: { config?: AiConfig } = {}): Promise<{ data: unknown; usedWebSearch: boolean; model: string }> {
  const c = opts.config ?? (await getAiConfig());
  if (!c.apiKey) throw new Error("Add your AI provider under You → AI assistant first.");
  const base = baseUrl(c);
  const isSearchModel = /search-preview/i.test(c.model);

  if (c.webSearch && !isSearchModel) {
    const url = c.provider === "azure" ? `${base}/openai/v1/responses?api-version=preview` : `${base}/v1/responses`;
    const body = JSON.stringify({ model: c.model, input: messages.map((m) => ({ role: m.role === "system" ? "developer" : "user", content: m.content })), tools: [{ type: "web_search_preview" }], text: { format: { type: "json_object" } } });
    try {
      const r = await relayFetch(url, { headers: { "Content-Type": "application/json", ...authHeaders(c) }, body }, c.transport);
      if (r.status < 400) {
        const j = JSON.parse(r.text) as { output_text?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
        const text = j.output_text ?? j.output?.flatMap((o) => o.content ?? []).map((p) => p.text ?? "").join("") ?? "";
        if (text) return { data: extractJson(text), usedWebSearch: true, model: c.model };
      } else if (r.status === 401 || r.status === 403) {
        throw new Error(`Provider rejected the key (${r.status}).`);
      }
      // 400/404 → this deployment/API doesn't support web search; fall back
    } catch (e) {
      if (/rejected the key|relay|Sync/.test((e as Error).message)) throw e;
    }
  }

  const url = c.provider === "azure" ? `${base}/openai/deployments/${encodeURIComponent(c.model)}/chat/completions?api-version=${encodeURIComponent(c.apiVersion)}` : `${base}/v1/chat/completions`;
  const payload: Record<string, unknown> = { messages, temperature: 0.2 };
  if (c.provider === "openai") payload.model = c.model;
  if (isSearchModel) payload.web_search_options = {}; else payload.response_format = { type: "json_object" };
  const r = await relayFetch(url, { headers: { "Content-Type": "application/json", ...authHeaders(c) }, body: JSON.stringify(payload) }, c.transport);
  if (r.status >= 400) {
    let msg = r.text.slice(0, 300);
    try { const j = JSON.parse(r.text) as { error?: { message?: string } | string }; msg = typeof j.error === "string" ? j.error : j.error?.message ?? msg; } catch { /* keep raw */ }
    throw new Error(`Provider error ${r.status}: ${msg}`);
  }
  const j = JSON.parse(r.text) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content ?? "";
  return { data: extractJson(text), usedWebSearch: isSearchModel, model: c.model };
}

/* ─────────────────────────── food tasks ─────────────────────────── */
export interface AiCandidate { name: string; brand?: string; serving: string; grams: number; nutrients: Nutrients; source?: string; confidence: "high" | "medium" | "low"; note?: string }

const num = (v: unknown): number | undefined => { const n = typeof v === "string" ? parseFloat(v) : (v as number); return typeof n === "number" && Number.isFinite(n) ? n : undefined; };

function toCandidate(x: Record<string, unknown>): AiCandidate | null {
  const kcal = num(x.kcal ?? x.calories);
  if (!x.name || kcal === undefined) return null;
  const n: Nutrients = { kcal };
  for (const [k, key] of [["protein", "protein"], ["carbs", "carbs"], ["fat", "fat"], ["fiber", "fiber"], ["sugar", "sugar"], ["sodium", "sodium"], ["satFat", "satFat"], ["cholesterol", "cholesterol"], ["potassium", "potassium"]] as const) { const v = num(x[k] ?? x[k === "satFat" ? "saturated_fat" : k]); if (v !== undefined) n[key] = v; }
  return { name: String(x.name), brand: x.brand ? String(x.brand) : undefined, serving: String(x.serving ?? "1 serving"), grams: num(x.grams) ?? 100, nutrients: n, source: x.source ? String(x.source) : undefined, confidence: (["high", "medium", "low"].includes(String(x.confidence)) ? String(x.confidence) : "medium") as AiCandidate["confidence"], note: x.note ? String(x.note) : undefined };
}

export async function aiLookupFood(query: string, context?: string): Promise<{ candidates: AiCandidate[]; usedWebSearch: boolean; model: string }> {
  const { data, usedWebSearch, model } = await askJson([
    { role: "system", content: "You are a nutrition database assistant for a food-logging app. Given a food, dish, menu item or packaged product, return the best matches as JSON: {\"candidates\":[{\"name\",\"brand\",\"serving\",\"grams\",\"kcal\",\"protein\",\"carbs\",\"fat\",\"fiber\",\"sugar\",\"sodium\",\"source\",\"confidence\",\"note\"}]}. Rules: numbers are per ONE serving as a person would order or eat it; grams is the serving weight; kcal/protein/carbs/fat are required numbers; prefer official data (restaurant nutrition pages, manufacturer labels, USDA) and cite the URL in source; if you must estimate, say so in note and set confidence low or medium; up to 5 candidates, most likely first; vegetarian options first when the item has variants; return ONLY JSON." },
    { role: "user", content: `${query}${context ? `\nContext: ${context}` : ""}` },
  ]);
  const list = Array.isArray((data as { candidates?: unknown[] })?.candidates) ? (data as { candidates: Record<string, unknown>[] }).candidates : [];
  return { candidates: list.map(toCandidate).filter((c): c is AiCandidate => !!c), usedWebSearch, model };
}

export interface AiMealItem extends AiCandidate { text: string }

export async function aiParseMeal(description: string): Promise<{ items: AiMealItem[]; usedWebSearch: boolean; model: string }> {
  const { data, usedWebSearch, model } = await askJson([
    { role: "system", content: "You turn a plain-English description of what someone ate into separate food items with nutrition. Return JSON: {\"items\":[{\"text\",\"name\",\"serving\",\"grams\",\"kcal\",\"protein\",\"carbs\",\"fat\",\"fiber\",\"sugar\",\"sodium\",\"confidence\",\"note\"}]}. text = the fragment of the description this item came from; name = a clean generic or branded food name; serving = the amount eaten in household terms (e.g. \"2 large eggs\", \"1 cup\", \"1 slice\"); grams = its weight; nutrients are for that whole amount. Use standard portions when the amount is not stated and say so in note. Numbers only, no ranges. Return ONLY JSON." },
    { role: "user", content: description },
  ]);
  const list = Array.isArray((data as { items?: unknown[] })?.items) ? (data as { items: Record<string, unknown>[] }).items : [];
  const items = list.map((x) => { const c = toCandidate(x); return c ? { ...c, text: String(x.text ?? c.name) } : null; }).filter((c): c is AiMealItem => !!c);
  return { items, usedWebSearch, model };
}

export async function testAi(config: AiConfig): Promise<string> {
  const { data, usedWebSearch, model } = await askJson([{ role: "system", content: "Reply with JSON {\"ok\":true,\"model\":\"<your model name>\"}." }, { role: "user", content: "ping" }], { config });
  return `Connected · ${model}${usedWebSearch ? " · web search available" : " · chat only (no web search)"}${(data as { ok?: boolean })?.ok ? "" : " · unexpected reply"}`;
}
