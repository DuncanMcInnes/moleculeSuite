import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
  },
  build: {
    chunkSizeWarningLimit: 10000,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward /api/* to the FastAPI backend during development
      "/api": {
        target: process.env.VITE_API_BASE_URL ?? "http://api:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
