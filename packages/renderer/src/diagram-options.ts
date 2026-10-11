import { z } from "zod";

export const diagramOptionsSchema = z.object({
  direction: z.enum(["horizontal", "vertical"]).default("horizontal"),
  autoFitView: z.boolean().default(true),
  theme: z.enum(["light", "dark"]).default("light"),
  enableMinimap: z.boolean().default(true),
  badgeHubs: z.boolean().default(true),
  compactLayout: z.boolean().default(true),
  colorizeEdges: z.boolean().default(true),
});

export type DiagramOptions = z.infer<typeof diagramOptionsSchema>;

export const DEFAULT_DIAGRAM_OPTIONS: DiagramOptions = diagramOptionsSchema.parse({});
