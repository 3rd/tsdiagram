import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Renderer } from "takumi-js/node";
import type { DiagramOptions } from "../diagram-options";

const fontManifestSchema = z.array(
  z.object({
    file: z
      .string()
      .min(1)
      .refine((file) => !path.isAbsolute(file) && !file.split(/[\\/]/).includes("..")),
    weight: z.number().int().positive(),
    subset: z.string().min(1),
  })
);

export const loadDiagramAssets = async (directory: string, renderer: Renderer) => {
  const [css, manifestText] = await Promise.all([
    readFile(path.join(directory, "styles.css"), "utf8"),
    readFile(path.join(directory, "fonts.json"), "utf8"),
  ]);
  const manifest: unknown = JSON.parse(manifestText);
  const fonts = fontManifestSchema.parse(manifest);

  await Promise.all(
    fonts.map(async ({ file, weight, subset }) => {
      const data = await readFile(path.join(directory, file));
      await renderer.registerFont({ name: `Inter ${subset}`, subsetOf: "Inter", weight, data });
    })
  );

  return css;
};

export const getDiagramThemeClass = (theme: DiagramOptions["theme"]) =>
  theme === "dark" ? "tsdiagram theme-dark" : "tsdiagram";

export const resolveDiagramColors = async (
  renderer: Renderer,
  css: string,
  theme: DiagramOptions["theme"]
) => {
  const bytes = await renderer.render(
    {
      type: "container",
      className: getDiagramThemeClass(theme),
      style: { display: "flex", width: 3, height: 1 },
      children: ["pane", "accent", "edge"].map((name) => ({
        type: "container",
        style: { width: 1, height: 1, backgroundColor: `var(--color-${name})` },
      })),
    },
    { css: [css], width: 3, height: 1, format: "raw" }
  );
  if (bytes.length !== 12) {
    throw new Error("Could not resolve diagram colors");
  }

  const readColor = (index: number) => {
    const offset = index * 4;
    return `rgba(${bytes[offset]}, ${bytes[offset + 1]}, ${bytes[offset + 2]}, ${bytes[offset + 3] / 255})`;
  };

  return { pane: readColor(0), accent: readColor(1), edge: readColor(2) };
};
