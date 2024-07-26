/// <reference types="vitest" />
// https://vitejs.dev/config/
import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [react(), visualizer()],
  test: {},
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ["perf_hooks"],
      output: {
        manualChunks: {
          "ts-morph": ["ts-morph"],
          elkjs: ["elkjs"],
          "dom-to-svg": ["dom-to-svg"],
        },
      },
    },
  },
  resolve: {
    alias: {
      process: "process/browser",
      path: path.resolve("./node_modules/@jspm/core/nodelibs/browser/path.js"),
      url: path.resolve("./node_modules/@jspm/core/nodelibs/browser/url.js"),
      fs: path.resolve("./node_modules/@jspm/core/nodelibs/browser/fs.js"),
      "source-map-js": path.resolve("./node_modules/source-map-js/source-map.js"),
    },
  },
});
