import { once } from "node:events";
import { closeSync, openSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { ReadStream } from "node:tty";
import { UsageError } from "gunsmith";

const openConfirmationInput = () => {
  const descriptor = openSync(process.platform === "win32" ? "CONIN$" : "/dev/tty", "r");

  try {
    return new ReadStream(descriptor);
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
};

type ConfirmOutputOverwriteOptions = {
  paths: string[];
  signal: AbortSignal;
};

export const confirmOutputOverwrite = async ({ paths, signal }: ConfirmOutputOverwriteOptions) => {
  signal.throwIfAborted();
  let input: ReadStream;

  try {
    input = openConfirmationInput();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(
      `Could not open the terminal for confirmation: ${message}. Use --force to overwrite.`
    );
  }

  const prompt = createInterface({ input, output: process.stdout });
  const closed = Promise.withResolvers<string>();
  prompt.once("close", () => closed.resolve(""));

  try {
    const answer = await Promise.race([
      prompt.question(
        `Existing output files:\n${paths.map((path) => `  ${path}`).join("\n")}\nOverwrite? [y/N] `,
        { signal }
      ),
      closed.promise,
    ]);
    signal.throwIfAborted();
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    prompt.close();

    if (!input.closed) {
      const inputClosed = once(input, "close");
      input.destroy();
      await inputClosed;
    }
  }
};
