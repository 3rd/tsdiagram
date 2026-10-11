import ElkConstructor from "elkjs/lib/elk-api";

export const createLayoutEngine = () =>
  new ElkConstructor({
    workerFactory: () => new Worker(new URL("./elk.worker.ts", import.meta.url), { type: "module" }),
  });
