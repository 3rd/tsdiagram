import { defineConfig, mergeConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import { createBrowserConfig } from "../../build/browser-config";

export default defineConfig(
  mergeConfig(createBrowserConfig(), {
    plugins: [visualizer()],
  })
);
