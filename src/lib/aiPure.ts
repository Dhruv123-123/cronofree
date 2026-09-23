/** Pure helpers for the AI client (no DB imports; unit-tested in Node). */
/** Accepts a bare resource URL or a full pasted one (…/openai/v1/responses, …/openai/deployments/x/chat/completions?api-version=…). */
export function baseUrl(c: { provider: "azure" | "openai"; endpoint: string }): string {
  let e = c.endpoint.trim().replace(/\?.*$/, "").replace(/\/+$/, "");
  e = e.replace(/\/openai\/(v1|deployments)(\/.*)?$/i, "").replace(/\/v1\/(responses|chat\/completions)$/i, "").replace(/\/v1$/i, "");
  return c.provider === "openai" ? (e || "https://api.openai.com") : e;
}

export function extractJson(text: string): unknown {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  throw new Error("The model did not return JSON.");
}

