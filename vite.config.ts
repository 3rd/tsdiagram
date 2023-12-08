/// <reference types="vitest" />
// https://vitejs.dev/config/
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [react(), visualizer()],
  test: {},
  build: {
    rollupOptions: {
      external: ["perf_hooks"],
      output: {
        manualChunks: {
          "ts-morph": ["ts-morph"],
          elkjs: ["elkjs"],
        },
      },
    },
  },
});
