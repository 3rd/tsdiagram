import { z } from "zod";

export const renderWorkerRequestSchema = z.object({
  source: z.string(),
  assetsDirectory: z.string(),
  png: z.object({ scale: z.number().finite().positive(), maxSide: z.number().int().positive() }).optional(),
});

export const renderWorkerResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    svg: z.string(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    png: z
      .object({
        base64: z.base64(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .nullable(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type RenderWorkerRequest = z.infer<typeof renderWorkerRequestSchema>;
