import { getNodesBounds, type ReactFlowState } from "@xyflow/react";
import { graphStore } from "../stores/graph";
import { createAbortError, exportReactFlowToSVG, isAbortError } from "./svg-export";

type ReactFlowStoreApi = {
  getState: () => ReactFlowState;
  subscribe: (listener: (state: ReactFlowState) => void) => () => void;
};

const waitForExportRender = (signal: AbortSignal) => {
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<void>((resolve, reject) => {
    let frame = 0;
    const rejectOnAbort = () => {
      cancelAnimationFrame(frame);
      signal.removeEventListener("abort", rejectOnAbort);
      reject(createAbortError());
    };
    signal.addEventListener("abort", rejectOnAbort, { once: true });
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        signal.removeEventListener("abort", rejectOnAbort);
        resolve();
      });
    });
  });
};

/**
 * Exports the rendered graph to SVG. The share dialog and the headless export
 * (`?export=svg`) share this, so both wait for the same layout state.
 */
export const createSVGExporter = (reactFlowStore: ReactFlowStoreApi) => {
  const activeExports = new Set<AbortController>();
  let exportDepth = 0;

  const getSVGSource = async (callerSignal?: AbortSignal) => {
    const exportState = reactFlowStore.getState();
    const edgesToExport = exportState.edges;
    const nodesToExport = exportState.nodes;
    const exportGraphIsCurrent = () => {
      const state = reactFlowStore.getState();
      return (
        state.nodes === nodesToExport &&
        state.edges === edgesToExport &&
        (nodesToExport.length === 0 || state.nodesInitialized)
      );
    };

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    if (callerSignal?.aborted) controller.abort();
    activeExports.add(controller);

    const abortOnGraphChange = () => {
      if (!exportGraphIsCurrent()) controller.abort();
    };
    const unsubscribe = reactFlowStore.subscribe(abortOnGraphChange);
    abortOnGraphChange();

    exportDepth += 1;
    graphStore.state.svgExportMode = true;
    try {
      if (nodesToExport.length > 0 && !exportState.nodesInitialized) throw createAbortError();
      await waitForExportRender(controller.signal);
      return await exportReactFlowToSVG({
        edgeIds: edgesToExport.map((edge) => edge.id),
        nodeBounds: getNodesBounds(nodesToExport),
        nodeIds: nodesToExport.map((node) => node.id),
        signal: controller.signal,
      });
    } finally {
      callerSignal?.removeEventListener("abort", abortFromCaller);
      unsubscribe();
      activeExports.delete(controller);
      exportDepth -= 1;
      if (exportDepth === 0) graphStore.state.svgExportMode = false;
    }
  };

  /** Waits until the graph is laid out, then exports. Retries when the graph changes during the export. */
  const getCurrentSVGSource = async () => {
    const operationController = new AbortController();
    activeExports.add(operationController);

    const waitForInitializedGraph = () => {
      if (operationController.signal.aborted) return Promise.reject(createAbortError());
      const state = reactFlowStore.getState();
      if (state.nodes.length === 0 || state.nodesInitialized) return Promise.resolve();

      return new Promise<void>((resolve, reject) => {
        let unsubscribe = () => {};
        const cleanup = () => {
          operationController.signal.removeEventListener("abort", rejectOnAbort);
          unsubscribe();
        };
        const rejectOnAbort = () => {
          cleanup();
          reject(createAbortError());
        };
        const resolveWhenInitialized = () => {
          const currentState = reactFlowStore.getState();
          if (currentState.nodes.length > 0 && !currentState.nodesInitialized) return;
          cleanup();
          resolve();
        };

        unsubscribe = reactFlowStore.subscribe(resolveWhenInitialized);
        operationController.signal.addEventListener("abort", rejectOnAbort, { once: true });
        resolveWhenInitialized();
      });
    };

    try {
      while (true) {
        await waitForInitializedGraph();
        try {
          return await getSVGSource(operationController.signal);
        } catch (error) {
          if (!isAbortError(error) || operationController.signal.aborted) throw error;
        }
      }
    } finally {
      activeExports.delete(operationController);
    }
  };

  const abortAll = () => {
    for (const controller of activeExports) controller.abort();
  };

  return { getSVGSource, getCurrentSVGSource, abortAll };
};

export type SVGExporter = ReturnType<typeof createSVGExporter>;
