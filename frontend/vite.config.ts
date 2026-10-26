import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
    proxy:
      mode === "demo"
        ? undefined
        : {
            "/api": "http://localhost:8081",
            "/ws": { target: "ws://localhost:8081", ws: true },
          },
  },
}));
