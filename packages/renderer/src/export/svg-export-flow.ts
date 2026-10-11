import { getNodesBounds, type ReactFlowState } from "@xyflow/react";
import { subscribe } from "statelift";
import type { createDiagramStore } from "../DiagramProvider/diagram-state";
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

type SVGExporterOptions = {
  reactFlowStore: ReactFlowStoreApi;
  graphStore: ReturnType<typeof createDiagramStore>;
  getCanvas: () => Pick<HTMLElement, "querySelector"> | null;
};

export const createSVGExporter = ({ reactFlowStore, graphStore, getCanvas }: SVGExporterOptions) => {
  const activeExports = new Set<AbortController>();

  const getSVGSource = async (callerSignal?: AbortSignal) => {
    const exportState = reactFlowStore.getState();
    const edgesToExport = exportState.edges;
    const nodesToExport = exportState.nodes;
    const exportGraphIsCurrent = () => {
      const state = reactFlowStore.getState();
      return (
        graphStore.state.exportStatus.status === "ready" &&
        state.nodes === nodesToExport &&
        state.edges === edgesToExport &&
        (nodesToExport.length === 0 || state.nodesInitialized)
      );
    };

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    if (callerSignal?.aborted) {
      controller.abort();
    }

    activeExports.add(controller);

    const abortOnGraphChange = () => {
      if (exportGraphIsCurrent()) return;

      controller.abort();
    };

    const unsubscribe = reactFlowStore.subscribe(abortOnGraphChange);
    const unsubscribeStatus = subscribe(graphStore, (state) => state.exportStatus, abortOnGraphChange);
    abortOnGraphChange();

    const releaseExport = graphStore.state.acquireSvgExport();

    try {
      if (nodesToExport.length > 0 && !exportState.nodesInitialized) {
        throw createAbortError();
      }

      await waitForExportRender(controller.signal);

      const canvas = getCanvas();
      if (canvas === null) {
        throw createAbortError();
      }

      const svg = await exportReactFlowToSVG({
        canvas,
        edgeIds: edgesToExport.map((edge) => edge.id),
        nodeBounds: getNodesBounds(nodesToExport),
        nodeIds: nodesToExport.map((node) => node.id),
        signal: controller.signal,
      });

      const hasStaleCapture = controller.signal.aborted || !exportGraphIsCurrent();
      if (hasStaleCapture) {
        throw createAbortError();
      }

      return svg;
    } finally {
      callerSignal?.removeEventListener("abort", abortFromCaller);
      unsubscribe();
      unsubscribeStatus();
      activeExports.delete(controller);
      releaseExport();
    }
  };

  const getCurrentSVGSource = async (callerSignal?: AbortSignal) => {
    const operationController = new AbortController();
    const abortFromCaller = () => operationController.abort();
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

    if (callerSignal?.aborted) {
      operationController.abort();
    }

    activeExports.add(operationController);

    const waitForReadyGraph = () => {
      if (operationController.signal.aborted) return Promise.reject(createAbortError());

      return new Promise<void>((resolve, reject) => {
        let unsubscribe = () => {};
        let unsubscribeStatus = () => {};
        const cleanup = () => {
          operationController.signal.removeEventListener("abort", rejectOnAbort);
          unsubscribe();
          unsubscribeStatus();
        };
        const rejectOnAbort = () => {
          cleanup();
          reject(createAbortError());
        };
        const settleWhenReady = () => {
          const status = graphStore.state.exportStatus;
          if (status.status === "error") {
            cleanup();
            reject(new Error(status.message));
            return;
          }

          if (status.status !== "ready") return;

          const currentState = reactFlowStore.getState();
          if (currentState.nodes.length > 0 && !currentState.nodesInitialized) return;

          cleanup();
          resolve();
        };

        unsubscribe = reactFlowStore.subscribe(settleWhenReady);
        unsubscribeStatus = subscribe(graphStore, (state) => state.exportStatus, settleWhenReady);
        operationController.signal.addEventListener("abort", rejectOnAbort, { once: true });
        settleWhenReady();
      });
    };

    try {
      while (true) {
        await waitForReadyGraph();

        try {
          return await getSVGSource(operationController.signal);
        } catch (error) {
          if (!isAbortError(error) || operationController.signal.aborted) {
            throw error;
          }
        }
      }
    } finally {
      callerSignal?.removeEventListener("abort", abortFromCaller);
      activeExports.delete(operationController);
    }
  };

  const abortAll = () => {
    for (const controller of activeExports) {
      controller.abort();
    }
  };

  return { getSVGSource, getCurrentSVGSource, abortAll };
};
