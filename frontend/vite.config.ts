import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // Forward /api/* to the backend. In native dev (npm run dev on the
      // host), the backend is at http://localhost:3000. In dockerised dev
      // (vite running inside the frontend container), the backend is at
      // http://backend:3000 via the docker network — set
      // VITE_API_PROXY_TARGET=http://backend:3000 in that container's env.
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
