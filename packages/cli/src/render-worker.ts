import { text } from "node:stream/consumers";
import { renderDiagramImage } from "@tsdiagram/renderer/takumi";
import { renderWorkerRequestSchema, renderWorkerResponseSchema } from "./render/render-worker-protocol";

const renderWorkerInput = async () => {
  const value: unknown = JSON.parse(await text(process.stdin));
  const request = renderWorkerRequestSchema.parse(value);

  const result = await renderDiagramImage(request);

  return renderWorkerResponseSchema.parse({
    ok: true,
    svg: result.svg,
    width: result.width,
    height: result.height,
    png:
      result.png === null
        ? null
        : {
            base64: Buffer.from(result.png.bytes).toString("base64"),
            width: result.png.width,
            height: result.png.height,
          },
  });
};

try {
  process.stdout.write(JSON.stringify(await renderWorkerInput()));
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exitCode = 1;
}
