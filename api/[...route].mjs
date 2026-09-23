/**
 * Cronofree API on Vercel (Hobby tier): /api/health, /api/sync, /api/fetch and
 * /api/ai, backed by a private Vercel Blob. Logic lives in server/apiCore.mjs.
 *
 * Setup (once, in the Vercel dashboard):
 *   1. Storage → Create Database → Blob → connect it to this project
 *      (this adds BLOB_READ_WRITE_TOKEN to the project's environment variables).
 *   2. Settings → Environment Variables → CRONOFREE_TOKEN = any long random string.
 *   3. Redeploy. Paste the same token into You → Sync on each device; leave the URL blank.
 */
import { get, put } from "@vercel/blob";
import { handleApi, handleNode } from "../server/apiCore.mjs";

const KEY = "cronofree/store.json";

function context() {
  const blobReady = !!process.env.BLOB_READ_WRITE_TOKEN;
  return {
    token: blobReady ? process.env.CRONOFREE_TOKEN : undefined,
    name: "Vercel · cronofree",
    setupHint: blobReady
      ? "Set the CRONOFREE_TOKEN environment variable in Vercel → Settings → Environment Variables, then redeploy."
      : "Connect a Vercel Blob store to this project (Storage → Create Database → Blob) so BLOB_READ_WRITE_TOKEN is set, then redeploy.",
    storage: {
      load: async () => {
        const r = await get(KEY, { access: "private", useCache: false });
        if (!r) return null;
        return new Response(r.stream).json();
      },
      save: (store) => put(KEY, JSON.stringify(store), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" }),
    },
  };
}

// Vercel's Node.js runtime calls either the web signature (Request) or the
// classic (req, res) one depending on the project's runtime version; support both.
export default function handler(req, res) {
  if (res && typeof res.setHeader === "function") return handleNode(req, res, context());
  return handleApi(req, context());
}
