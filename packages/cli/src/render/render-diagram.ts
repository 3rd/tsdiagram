import type { Stats } from "node:fs";
import { readFile, readlink, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { UsageError } from "gunsmith";
import type { confirmOutputOverwrite } from "./confirm-output-overwrite";
import type { RenderedFile, RenderOptions } from "./render-command";
import { renderInWorkerProcess } from "./render-process";
import { createRenderOperation } from "./render-operation";

export type RenderInput =
  | { kind: "file"; path: string }
  | { kind: "code"; source: string }
  | { kind: "stdin"; readStdin: () => Promise<string> };

type RenderDiagramRequest = {
  input: RenderInput;
  output?: string;
  options: RenderOptions;
  assetsDirectory: string;
  confirmOverwrite?: typeof confirmOutputOverwrite;
};

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

const getDefaultOutputPath = (input: RenderInput) => {
  if (input.kind === "file") return `${input.path.replace(/\.[cm]?tsx?$/, "")}.svg`;

  return "diagram.svg";
};

const readRenderSource = async (input: RenderInput, signal: AbortSignal) => {
  signal.throwIfAborted();

  if (input.kind === "code") return input.source;
  if (input.kind === "file") return readFile(input.path, { encoding: "utf8", signal });

  const cancelled = Promise.withResolvers<never>();
  const rejectOnAbort = () => cancelled.reject(signal.reason);
  signal.addEventListener("abort", rejectOnAbort, { once: true });

  try {
    return await Promise.race([input.readStdin(), cancelled.promise]);
  } catch (error) {
    signal.throwIfAborted();
    throw new UsageError(`Could not read stdin: ${describeError(error)}`);
  } finally {
    signal.removeEventListener("abort", rejectOnAbort);
  }
};

const isSameFile = (first: Stats | null, second: Stats | null) =>
  first !== null && second !== null && first.dev === second.dev && first.ino === second.ino;

const resolveOutputTarget = async (output: string): Promise<string> => {
  try {
    return await realpath(output);
  } catch (error) {
    const isMissingTarget = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!isMissingTarget) {
      throw error;
    }
  }

  const linkTarget = await readlink(output).catch((error: unknown) => {
    const isMissingPath = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (isMissingPath) return null;

    throw error;
  });
  if (linkTarget !== null) {
    return resolveOutputTarget(path.resolve(path.dirname(output), linkTarget));
  }

  return path.join(await resolveOutputTarget(path.dirname(output)), path.basename(output));
};

const validateOutputPath = async (input: string | null, output: string) => {
  const inputInfo = input === null ? null : await stat(input);
  const outputInfo = await stat(output).catch((error: unknown) => {
    const isMissingOutput = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (isMissingOutput) return null;

    throw error;
  });

  const wouldOverwriteInput = input === output || isSameFile(inputInfo, outputInfo);
  if (wouldOverwriteInput) {
    throw new UsageError(`Output would overwrite the input file: ${output}`);
  }

  return outputInfo;
};

type OutputPaths = {
  inputPath: string | null;
  svgPath: string;
  pngPath: string | null;
};

const validateOutputPaths = async ({ inputPath, svgPath, pngPath }: OutputPaths) => {
  const existingOutputs: string[] = [];

  const svgInfo = await validateOutputPath(inputPath, svgPath);
  if (svgInfo !== null) {
    existingOutputs.push(svgPath);
  }

  if (pngPath) {
    const pngInfo = await validateOutputPath(inputPath, pngPath);
    const [svgTarget, pngTarget] = await Promise.all([
      resolveOutputTarget(svgPath),
      resolveOutputTarget(pngPath),
    ]);
    const wouldOverwriteSvg = svgTarget === pngTarget || isSameFile(svgInfo, pngInfo);
    if (wouldOverwriteSvg) {
      throw new UsageError(`SVG and PNG outputs would write to the same file: ${pngPath}`);
    }

    if (pngInfo !== null) {
      existingOutputs.push(pngPath);
    }
  }

  return existingOutputs;
};

const createOverwriteError = (outputs: string[]) =>
  new UsageError(
    `Output files already exist:\n${outputs.map((output) => `  ${output}`).join("\n")}\nUse --force to overwrite.`
  );

type WriteOutputOptions = {
  output: string;
  contents: string | Uint8Array;
  signal: AbortSignal;
  canOverwrite: boolean;
};

const writeOutput = async ({ output, contents, signal, canOverwrite }: WriteOutputOptions) => {
  signal.throwIfAborted();

  try {
    await writeFile(output, contents, { signal, flag: canOverwrite ? "w" : "wx" });
  } catch (error) {
    signal.throwIfAborted();

    const isExistingOutput = error instanceof Error && "code" in error && error.code === "EEXIST";
    if (isExistingOutput) {
      throw createOverwriteError([output]);
    }

    throw new UsageError(`Could not write output ${output}: ${describeError(error)}`);
  }
};

export const renderDiagram = async ({
  input,
  output,
  options,
  assetsDirectory,
  confirmOverwrite,
}: RenderDiagramRequest) => {
  const operation = createRenderOperation(options.timeout);
  const { signal } = operation;
  const inputPath = input.kind === "file" ? path.resolve(input.path) : null;
  const svgPath = path.resolve(output ?? getDefaultOutputPath(input));
  const pngPath = options.png ? `${svgPath.replace(/\.svg$/, "")}.png` : null;

  try {
    let source: string;
    let existingOutputs: string[];

    try {
      source = await readRenderSource(input, signal);
      existingOutputs = await validateOutputPaths({ inputPath, svgPath, pngPath });
    } catch (error) {
      signal.throwIfAborted();

      if (error instanceof UsageError) {
        throw error;
      }

      throw new UsageError(`Could not prepare input or output files: ${describeError(error)}`);
    }

    signal.throwIfAborted();

    const needsConfirmation = !options.force && existingOutputs.length > 0;
    if (needsConfirmation) {
      if (confirmOverwrite === undefined) {
        throw createOverwriteError(existingOutputs);
      }

      const shouldOverwrite = await confirmOverwrite({ paths: existingOutputs, signal });
      signal.throwIfAborted();

      if (!shouldOverwrite) {
        throw new UsageError("Overwrite cancelled. No files were written.");
      }
    }

    if (options.verbose) {
      console.error(`Rendering ${inputPath ?? input.kind} with Takumi`);
    }

    const result = await renderInWorkerProcess({ source, assetsDirectory, options, signal });
    await writeOutput({
      output: svgPath,
      contents: result.svg,
      signal,
      canOverwrite: options.force || existingOutputs.includes(svgPath),
    });
    let png: RenderedFile | null = null;

    if (pngPath) {
      if (!result.png) {
        throw new Error("The renderer did not return the requested PNG");
      }

      await writeOutput({
        output: pngPath,
        contents: result.png.bytes,
        signal,
        canOverwrite: options.force || existingOutputs.includes(pngPath),
      });
      png = {
        path: pngPath,
        bytes: result.png.bytes.byteLength,
        width: result.png.width,
        height: result.png.height,
      };
    }

    return {
      input: inputPath,
      svg: {
        path: svgPath,
        bytes: Buffer.byteLength(result.svg),
        width: result.width,
        height: result.height,
      },
      png,
    };
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    operation.dispose();
  }
};
