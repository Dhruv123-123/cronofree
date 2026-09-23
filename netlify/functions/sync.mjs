/**
 * Cronofree API on Netlify (free tier): /api/health, /api/sync, /api/fetch and
 * /api/ai, backed by Netlify Blobs. Logic lives in server/apiCore.mjs.
 *
 * Setup: in the Netlify site settings add an environment variable
 *   CRONOFREE_TOKEN = any long random string
 * and paste the same string into You → Sync on each device.
 */
import { getStore } from "@netlify/blobs";
import { handleApi } from "../../server/apiCore.mjs";

export const config = { path: ["/api/health", "/api/sync", "/api/fetch", "/api/ai"] };

export default async (req) => {
  const blobs = getStore({ name: "cronofree", consistency: "strong" });
  return handleApi(req, {
    token: process.env.CRONOFREE_TOKEN,
    name: "Netlify · cronofree",
    setupHint: "Set the CRONOFREE_TOKEN environment variable in Netlify site settings, then redeploy.",
    storage: {
      load: () => blobs.get("store", { type: "json" }),
      save: (store) => blobs.setJSON("store", store),
    },
  });
};
