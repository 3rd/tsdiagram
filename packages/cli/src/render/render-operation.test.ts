import { afterEach, expect, it, vi } from "vitest";
import { createRenderOperation } from "./render-operation";

afterEach(() => {
  vi.useRealTimers();
});

it("cancels at the operation deadline and removes signal listeners", async () => {
  vi.useFakeTimers();
  const listeners = process.listenerCount("SIGINT");
  const operation = createRenderOperation(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(operation.signal.aborted).toBe(true);
  expect(operation.signal.reason).toEqual(new Error("Rendering timed out after 1s"));
  operation.dispose();
  expect(process.listenerCount("SIGINT")).toBe(listeners);
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels on interruption and preserves unrelated signal listeners", () => {
  const unrelated = vi.fn();
  process.on("SIGINT", unrelated);
  const operation = createRenderOperation(60);

  try {
    process.emit("SIGINT");
    expect(operation.signal.aborted).toBe(true);
    expect(operation.signal.reason).toEqual(new Error("Rendering cancelled by SIGINT"));
    operation.dispose();
    expect(process.listeners("SIGINT")).toContain(unrelated);
  } finally {
    operation.dispose();
    process.off("SIGINT", unrelated);
  }
});
