import { getEventListeners } from "node:events";
import { watch } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RenderOptions } from "./render-command";
import { createRenderOperation } from "./render-operation";
import { renderInWorkerProcess } from "./render-process";

const OPTIONS: RenderOptions = {
  png: false,
  force: false,
  scale: 2,
  maxSide: 4096,
  timeout: 60,
  verbose: false,
};
const workerUrl = new URL("./fixtures/render-worker.mjs", import.meta.url);
let directory: string;

const render = (source: string, signal = new AbortController().signal, options = OPTIONS) =>
  renderInWorkerProcess({ source, signal, options, workerUrl, assetsDirectory: directory });

const expectWorkerReaped = async () => {
  const pid = Number(await readFile(path.join(directory, "worker.pid"), "utf8"));
  expect(() => process.kill(pid, 0)).toThrow();
};

const waitForWorkerReady = () => {
  const ready = Promise.withResolvers<void>();
  const watcher = watch(directory, (_event, filename) => {
    if (filename !== "worker.ready") return;

    watcher.close();
    ready.resolve();
  });
  watcher.once("error", (error) => {
    watcher.close();
    ready.reject(error);
  });
  return { promise: ready.promise, close: () => watcher.close() };
};

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "tsdiagram-process-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

it("preserves Unicode source and binary PNG bytes across the process boundary", async () => {
  const source = 'interface Person { name: "Zoë & 李" }\n';
  const controller = new AbortController();
  const result = await render(source, controller.signal, { ...OPTIONS, png: true });
  expect(result).toEqual({
    svg: `<svg><metadata>${source}</metadata></svg>`,
    width: 120,
    height: 80,
    png: { bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), width: 240, height: 160 },
  });

  await expectWorkerReaped();
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});

it("preserves renderer failures after waiting for child closure", async () => {
  await expect(render("error")).rejects.toThrow("Could not lay out diagram");

  await expectWorkerReaped();
});

it.each(["malformed", "invalid binary"])("rejects %s worker output and reaps the child", async (source) => {
  await expect(render(source)).rejects.toThrow();

  await expectWorkerReaped();
});

it("reports a worker startup failure after child closure", async () => {
  await expect(
    renderInWorkerProcess({
      source: "",
      signal: new AbortController().signal,
      options: OPTIONS,
      assetsDirectory: directory,
      workerUrl: new URL("./missing-worker.js", import.meta.url),
    })
  ).rejects.toThrow("Renderer process failed");
});

it.each(["SIGINT", "SIGTERM", "SIGHUP"] as const)(
  "kills blocking work on %s before returning",
  async (signalName) => {
    const listeners = process.listenerCount(signalName);
    const operation = createRenderOperation(60);
    const cleanup = new AbortController();
    const ready = waitForWorkerReady();
    const run = render("hang", AbortSignal.any([operation.signal, cleanup.signal]));
    const outcome = expect(run).rejects.toThrow(`Rendering cancelled by ${signalName}`);

    try {
      await ready.promise;
      process.emit(signalName);
      await outcome;
      await expectWorkerReaped();
    } finally {
      cleanup.abort();
      await Promise.allSettled([run]);
      ready.close();
      operation.dispose();
    }

    expect(process.listenerCount(signalName)).toBe(listeners);
  }
);

it("kills blocking work at the operation deadline before returning", async () => {
  vi.useFakeTimers();
  const operation = createRenderOperation(1);
  const cleanup = new AbortController();
  const ready = waitForWorkerReady();
  const run = render("hang", AbortSignal.any([operation.signal, cleanup.signal]));
  const outcome = expect(run).rejects.toThrow("Rendering timed out after 1s");

  try {
    await ready.promise;
    await vi.advanceTimersByTimeAsync(1000);
    await outcome;
    await expectWorkerReaped();
  } finally {
    cleanup.abort();
    await Promise.allSettled([run]);
    ready.close();
    operation.dispose();
  }

  expect(vi.getTimerCount()).toBe(0);
});

it("does not launch a worker when already cancelled", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Already cancelled"));
  await expect(render("hang", controller.signal)).rejects.toThrow("Already cancelled");

  await expect(readFile(path.join(directory, "worker.pid"))).rejects.toMatchObject({ code: "ENOENT" });
});
