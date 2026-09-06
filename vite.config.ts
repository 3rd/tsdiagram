// https://vitejs.dev/config/
import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [react(), visualizer()],
  test: {},
  build: {
    sourcemap: true,
    rolldownOptions: {
      external: ["perf_hooks"],
      output: {
        codeSplitting: {
          groups: [
            { name: "elkjs", test: /node_modules[\\/]elkjs[\\/]/ },
            { name: "dom-to-svg", test: /node_modules[\\/]dom-to-svg[\\/]/ },
            { name: "monaco", test: /node_modules[\\/]monaco-editor[\\/]/ },
          ],
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
