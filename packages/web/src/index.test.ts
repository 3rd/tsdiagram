import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/postcss";
import postcss, { type Rule } from "postcss";
import { expect, it } from "vitest";

it("emits a base-layer pointer cursor limited to enabled buttons", async () => {
  const stylesheetPath = fileURLToPath(new URL("./index.css", import.meta.url));
  const source = await readFile(stylesheetPath, "utf8");
  const result = await postcss([tailwindcss()]).process(source, { from: stylesheetPath });

  const buttonRules: Rule[] = [];
  result.root.walkRules(/^button:not\(:disabled\),\s*\[role="button"\]:not\(:disabled\)$/, (rule) => {
    buttonRules.push(rule);
  });

  expect(buttonRules).toMatchObject([
    {
      parent: { type: "atrule", name: "layer", params: "base" },
      nodes: [{ type: "decl", prop: "cursor", value: "pointer" }],
    },
  ]);
});
