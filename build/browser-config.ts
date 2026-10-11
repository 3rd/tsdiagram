import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import type { UserConfig } from "vite";

export const createBrowserConfig = () => {
  return {
    plugins: [
      react(),
      {
        name: "third-party-licenses",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "inter-license.txt",
            source: readFileSync(
              new URL("../packages/renderer/node_modules/@fontsource/inter/LICENSE", import.meta.url),
              "utf8"
            ),
          });
          this.emitFile({
            type: "asset",
            fileName: "elkjs-license.txt",
            source: readFileSync(
              new URL("../packages/renderer/node_modules/elkjs/LICENSE.md", import.meta.url),
              "utf8"
            ),
          });
        },
      },
    ],
    css: {
      postcss: {
        plugins: [tailwindcss()],
      },
    },
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
        path: fileURLToPath(new URL("../node_modules/@jspm/core/nodelibs/browser/path.js", import.meta.url)),
        url: fileURLToPath(new URL("../node_modules/@jspm/core/nodelibs/browser/url.js", import.meta.url)),
        fs: fileURLToPath(new URL("../node_modules/@jspm/core/nodelibs/browser/fs.js", import.meta.url)),
        "source-map-js": fileURLToPath(
          new URL("../node_modules/source-map-js/source-map.js", import.meta.url)
        ),
      },
    },
  } satisfies UserConfig;
};
