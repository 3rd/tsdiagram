import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { RenderOptions } from "./render-command";
import { renderWorkerResponseSchema, type RenderWorkerRequest } from "./render-worker-protocol";

type RenderProcessOptions = {
  source: string;
  assetsDirectory: string;
  options: RenderOptions;
  signal: AbortSignal;
  workerUrl?: URL;
};

type WorkerExit = {
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
};

const runWorkerProcess = async (workerUrl: URL, input: string, signal: AbortSignal) => {
  const child = spawn(process.execPath, [fileURLToPath(workerUrl)], { stdio: ["pipe", "pipe", "pipe"] });
  const closed = Promise.withResolvers<WorkerExit>();
  let output = "";
  let diagnostic = "";
  let failure: Error | undefined;
  const killOnAbort = () => child.kill("SIGKILL");

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    diagnostic += chunk;
  });
  child.on("error", (error) => {
    failure = error;
  });
  child.stdin.on("error", (error) => {
    failure = error;
  });
  child.once("close", (exitCode, exitSignal) => {
    closed.resolve({ exitCode, exitSignal });
  });
  signal.addEventListener("abort", killOnAbort, { once: true });

  try {
    if (signal.aborted) {
      killOnAbort();
    } else {
      child.stdin.end(input);
    }

    const exit = await closed.promise;
    signal.throwIfAborted();

    if (failure) {
      throw failure;
    }

    return { ...exit, output, diagnostic };
  } finally {
    signal.removeEventListener("abort", killOnAbort);

    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }

    await closed.promise;
  }
};

export const renderInWorkerProcess = async ({
  source,
  assetsDirectory,
  options,
  signal,
  workerUrl = new URL("./render-worker.js", import.meta.url),
}: RenderProcessOptions) => {
  signal.throwIfAborted();

  const request: RenderWorkerRequest = {
    source,
    assetsDirectory,
    png: options.png ? { scale: options.scale, maxSide: options.maxSide } : undefined,
  };

  const { output, diagnostic, exitCode, exitSignal } = await runWorkerProcess(
    workerUrl,
    JSON.stringify(request),
    signal
  );
  if (output.length === 0) {
    throw new Error(`Renderer process failed (${exitSignal ?? exitCode}): ${diagnostic.trim()}`);
  }

  const value: unknown = JSON.parse(output);
  const response = renderWorkerResponseSchema.parse(value);
  if (!response.ok) {
    throw new Error(response.error);
  }

  if (exitCode !== 0) {
    throw new Error(`Renderer process exited with ${exitSignal ?? exitCode}`);
  }

  if (options.verbose) {
    console.error(`Rendered SVG (${response.width}x${response.height})`);
  }

  const result = {
    svg: response.svg,
    width: response.width,
    height: response.height,
  };
  if (response.png === null) return { ...result, png: null };

  const bytes: Uint8Array = Buffer.from(response.png.base64, "base64");
  return {
    ...result,
    png: {
      bytes,
      width: response.png.width,
      height: response.png.height,
    },
  };
};
