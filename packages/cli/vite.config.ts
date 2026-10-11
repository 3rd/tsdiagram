import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    target: "node22",
    sourcemap: true,
    rolldownOptions: {
      input: { cli: "src/cli.ts", "render-worker": "src/render-worker.ts" },
      output: { entryFileNames: "[name].js" },
    },
  },
  ssr: {
    noExternal: ["@tsdiagram/core", "@tsdiagram/renderer", "classnames"],
    external: ["elkjs", "gunsmith", "react", "takumi-js", "ts-morph", "zod"],
  },
});
