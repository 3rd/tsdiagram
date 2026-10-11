import cli, { UsageError } from "gunsmith";
import { z } from "zod";
import { confirmOutputOverwrite } from "./confirm-output-overwrite";
import { renderDiagram, type RenderInput } from "./render-diagram";

const outputFileSchema = z.object({
  path: z.string(),
  bytes: z.number().int().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const renderOptionsSchema = z.object({
  png: z.boolean().default(false).describe("Also write a PNG beside the SVG"),
  force: z.boolean().default(false).describe("Overwrite existing output files without confirmation"),
  scale: z.coerce.number().finite().positive().default(2).describe("PNG scale factor"),
  maxSide: z.coerce.number().int().positive().default(4096).describe("Maximum PNG side in pixels"),
  timeout: z.coerce.number().finite().positive().default(60).describe("Rendering deadline in seconds"),
  verbose: z.boolean().default(false).describe("Report rendering progress"),
});

export type RenderOptions = z.infer<typeof renderOptionsSchema>;
export type RenderedFile = z.infer<typeof outputFileSchema>;

export const createRenderCommand = (assetsDirectory: string) =>
  cli.command("render", {
    description: "Render TypeScript from a file, stdin, or inline code using the bundled Takumi renderer.",
    args: z.object({
      input: z
        .string()
        .min(1)
        .optional()
        .describe("Input file; omit or use '-' for piped stdin; with --code, the SVG output path"),
      outputPath: z.string().min(1).optional().describe("Positional SVG output path; use this or --output"),
    }),
    options: renderOptionsSchema.extend({
      output: z
        .string()
        .min(1)
        .optional()
        .meta({ alias: "o" })
        .describe("SVG output path (defaults to the input basename.svg, or diagram.svg for stdin/code)"),
      code: z
        .string()
        .optional()
        .describe("Inline TypeScript source; defaults to diagram.svg unless an output path is supplied"),
    }),
    outputSchema: z.object({
      input: z.string().nullable().describe("Resolved input file path, or null for stdin and inline code"),
      svg: outputFileSchema,
      png: outputFileSchema.nullable(),
    }),
    examples: [
      { command: "tsdiagram render domain.ts" },
      { command: "tsdiagram render domain.ts -o diagram.svg --png" },
      { command: "cat domain.ts | tsdiagram render" },
      { command: "cat domain.ts | tsdiagram render -o diagram.svg" },
      { command: "tsdiagram render --code 'interface User { id: string }' -o diagram.svg" },
      { command: "tsdiagram render domain.ts --json" },
    ],
    notes: "No application server or browser is needed. SVG text is rendered as portable outlines.",
    run: async ({ args, options, hasStdin, readStdin, isTTY, isJSON }) => {
      const { code, output, ...renderOptions } = options;
      const inputArgument = args.input;
      const shouldReadStdin = inputArgument === undefined || inputArgument === "-";
      let input: RenderInput;
      let positionalOutput = args.outputPath;

      if (code !== undefined) {
        if (inputArgument === "-") {
          throw new UsageError("Choose either --code or '-' for stdin.");
        }

        if (args.outputPath !== undefined) {
          throw new UsageError("--code accepts only one positional argument: the SVG output path.");
        }

        input = { kind: "code", source: code };
        positionalOutput = inputArgument;
      } else if (shouldReadStdin) {
        if (!hasStdin) {
          throw new UsageError(
            "No stdin is available. Pipe TypeScript code or redirect a file into this command."
          );
        }

        input = { kind: "stdin", readStdin };
      } else {
        input = { kind: "file", path: inputArgument };
      }

      const hasConflictingOutputs = output !== undefined && positionalOutput !== undefined;
      if (hasConflictingOutputs) {
        throw new UsageError("Choose either --output or a positional output path, not both.");
      }

      const canConfirmOverwrite = isTTY && !isJSON;
      const result = await renderDiagram({
        input,
        output: output ?? positionalOutput,
        options: renderOptions,
        assetsDirectory,
        confirmOverwrite: canConfirmOverwrite ? confirmOutputOverwrite : undefined,
      });

      console.log(`wrote ${result.svg.path}`);

      if (result.png) {
        console.log(`wrote ${result.png.path} (${result.png.width}x${result.png.height})`);
      }

      return result;
    },
  });
