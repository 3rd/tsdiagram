const MAX_TIMER_DELAY_MS = 2_147_483_647;

export const createRenderOperation = (timeoutSeconds: number) => {
  const controller = new AbortController();
  const deadline = performance.now() + timeoutSeconds * 1000;
  let timer: ReturnType<typeof setTimeout>;

  const scheduleDeadline = () => {
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      controller.abort(new Error(`Rendering timed out after ${timeoutSeconds}s`));
      return;
    }

    timer = setTimeout(scheduleDeadline, Math.min(remaining, MAX_TIMER_DELAY_MS));
  };

  const cancelOnInterrupt = () => controller.abort(new Error("Rendering cancelled by SIGINT"));
  const cancelOnTerminate = () => controller.abort(new Error("Rendering cancelled by SIGTERM"));
  const cancelOnHangup = () => controller.abort(new Error("Rendering cancelled by SIGHUP"));
  process.on("SIGINT", cancelOnInterrupt);
  process.on("SIGTERM", cancelOnTerminate);
  process.on("SIGHUP", cancelOnHangup);
  scheduleDeadline();

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      process.off("SIGINT", cancelOnInterrupt);
      process.off("SIGTERM", cancelOnTerminate);
      process.off("SIGHUP", cancelOnHangup);
    },
  };
};
