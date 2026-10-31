import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Demo aliases and real SDK dependencies must not overwrite each other's cache.
  cacheDir: `node_modules/.vite-${mode}`,
  // `npm run demo` swaps LiveKit for an in-page simulation (src/demo).
  resolve:
    mode === "demo"
      ? {
          alias: {
            "livekit-client": new URL("./src/demo/livekit.ts", import.meta.url)
              .pathname,
          },
        }
      : undefined,
  server: {
    // Generated Playwright reports must not reload pages in another running suite.
    watch: { ignored: ["**/playwright-report/**", "**/test-results/**"] },
    proxy:
      mode === "demo"
        ? undefined
        : {
            "/api": "http://localhost:8081",
            "/ws": { target: "ws://localhost:8081", ws: true },
          },
  },
}));
