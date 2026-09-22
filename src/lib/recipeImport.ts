/**
 * Recipe import from a URL: fetch through the sync server (browsers block
 * cross-site page reads), read schema.org Recipe JSON-LD, parse each
 * ingredient line into quantity + unit + name, and match to foods.
 */
import type { Food } from "@/db/types";
import { getSyncConfig } from "./sync";
import { searchLocal, searchOnline } from "./foodRepo";
import { parseIngredient, gramsFor, type ParsedIngredient } from "./ingredientParse";
export { parseIngredient, gramsFor, type ParsedIngredient };

export interface ImportedRecipe { name: string; yieldServings: number; ingredients: ParsedIngredient[]; sourceUrl: string; image?: string }
export interface MatchedIngredient extends ParsedIngredient { food: Food | null; grams: number; candidates: Food[] }

export function extractRecipe(html: string, url: string): ImportedRecipe | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  const find = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) { for (const n of node) { const r = find(n); if (r) return r; } return null; }
    const o = node as Record<string, unknown>;
    const type = o["@type"];
    if ((typeof type === "string" && /Recipe/i.test(type)) || (Array.isArray(type) && type.some((t) => /Recipe/i.test(String(t))))) return o;
    if (o["@graph"]) return find(o["@graph"]);
    for (const v of Object.values(o)) if (v && typeof v === "object") { const r = find(v); if (r) return r; }
    return null;
  };
  let recipe: Record<string, unknown> | null = null;
  for (const s of scripts) { try { recipe = find(JSON.parse(s.textContent || "")); } catch { /* skip bad json */ } if (recipe) break; }
  let lines: string[] = [];
  let name = doc.querySelector("h1")?.textContent?.trim() || doc.title || "Imported recipe";
  let yieldServings = 4;
  let image: string | undefined;
  if (recipe) {
    const ing = recipe.recipeIngredient ?? recipe.ingredients;
    if (Array.isArray(ing)) lines = ing.map(String);
    if (typeof recipe.name === "string") name = recipe.name;
    const y = recipe.recipeYield;
    const yStr = Array.isArray(y) ? String(y[0]) : String(y ?? "");
    const yn = parseInt(yStr.match(/\d+/)?.[0] ?? "", 10);
    if (yn > 0 && yn < 100) yieldServings = yn;
    const img = recipe.image;
    image = typeof img === "string" ? img : Array.isArray(img) ? String(img[0]?.url ?? img[0]) : (img as { url?: string } | undefined)?.url;
  }
  if (!lines.length) {
    lines = [...doc.querySelectorAll('[class*="ingredient" i] li, li[class*="ingredient" i], [itemprop="recipeIngredient"]')].map((el) => el.textContent?.trim() ?? "").filter((t) => t && t.length < 160);
  }
  if (!lines.length) return null;
  return { name: name.replace(/\s+/g, " ").trim(), yieldServings, ingredients: lines.map(parseIngredient), sourceUrl: url, image };
}

export async function fetchRecipePage(url: string): Promise<string> {
  const cfg = await getSyncConfig();
  const base = cfg.url.trim().replace(/\/+$/, "");
  const r = await fetch(`${base}/api/fetch?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (r.status === 401) throw new Error("Set up Sync first: the recipe importer fetches pages through your server.");
  if (!r.ok) throw new Error(`Could not fetch that page (${r.status}).`);
  const j = (await r.json()) as { html?: string; error?: string };
  if (!j.html) throw new Error(j.error ?? "Empty page");
  return j.html;
}

export async function matchIngredients(list: ParsedIngredient[], online: boolean): Promise<MatchedIngredient[]> {
  const out: MatchedIngredient[] = [];
  for (const ing of list) {
    let candidates = await searchLocal(ing.name, 6);
    if (!candidates.length && online && navigator.onLine) {
      try { candidates = (await searchOnline(ing.name)).foods.slice(0, 6); } catch { /* offline */ }
    }
    const food = candidates[0] ?? null;
    out.push({ ...ing, food, candidates, grams: gramsFor(ing, food) });
  }
  return out;
}
