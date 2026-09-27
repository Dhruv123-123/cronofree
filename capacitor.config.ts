import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell (Android / iOS) around the same web build. The bundled app has
 * no server of its own: set You → Sync → Server URL to your hosted site
 * (Vercel / Netlify / your computer) for sync, AI relay and recipe import.
 */
const config: CapacitorConfig = {
  appId: "app.cronofree",
  appName: "Cronofree",
  webDir: "dist",
  backgroundColor: "#0f1213",
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic" },
  server: { androidScheme: "https" },
};

export default config;
