import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png", "icons/maskable-512.png"],
      manifest: {
        name: "Cronofree",
        short_name: "Cronofree",
        description: "Food and training log. Local-first, syncs with your own computer.",
        theme_color: "#0f1213",
        background_color: "#0f1213",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
        shortcuts: [
          { name: "Log food", url: "/?add=1" },
          { name: "Start workout", url: "/train" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,json}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith("openfoodfacts.org"),
            handler: "NetworkFirst",
            options: { cacheName: "off-api", expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === "api.nal.usda.gov",
            handler: "NetworkFirst",
            options: { cacheName: "usda-api", expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { host: true, port: 5173, proxy: { "/api": "http://localhost:8787" } },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          scanner: ["@zxing/browser", "@zxing/library"],
        },
      },
    },
  },
});
