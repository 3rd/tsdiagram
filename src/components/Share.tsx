import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { CopyIcon, DownloadIcon, Link2Icon } from "@radix-ui/react-icons";
import { getNodesBounds, useNodesInitialized, useStore, useStoreApi } from "@xyflow/react";
import { graphStore } from "../stores/graph";
import {
  copySVG,
  createAbortError,
  downloadSVG,
  exportReactFlowToSVG,
  GraphSnapshotMismatchError,
  isAbortError,
} from "../utils/svg-export";

export type ShareProps = {
  isOpen: boolean;
  onClose: () => void;
};

const getExportErrorMessage = (error: unknown) => {
  if (error instanceof GraphSnapshotMismatchError) return "Export failed: the diagram could not be captured.";
  return `Export failed: ${error instanceof Error ? error.message : String(error)}`;
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

const ShareContent = memo(() => {
  const [hasCopiedLink, setHasCopiedLink] = useState(false);
  const [hasCopiedSVG, setHasCopiedSVG] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [previewImageURL, setPreviewImageURL] = useState<string | null>(null);
  const activeExportsRef = useRef(new Set<AbortController>());
  const copySVGOperationRef = useRef(0);
  const edges = useStore((state) => state.edges);
  const nodes = useStore((state) => state.nodes);
  const nodesInitialized = useNodesInitialized();
  const reactFlowStore = useStoreApi();

  const shareLink = window.location.href;

  const graphIsCurrent = useCallback(() => {
    const state = reactFlowStore.getState();
    return state.nodes === nodes && state.edges === edges && (nodes.length === 0 || state.nodesInitialized);
  }, [edges, nodes, reactFlowStore]);

  const exportDepthRef = useRef(0);
  const getSVGSource = useCallback(
    async (callerSignal?: AbortSignal) => {
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
      activeExportsRef.current.add(controller);

      const abortOnGraphChange = () => {
        if (!exportGraphIsCurrent()) controller.abort();
      };
      const unsubscribe = reactFlowStore.subscribe(abortOnGraphChange);
      abortOnGraphChange();

      exportDepthRef.current += 1;
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
        activeExportsRef.current.delete(controller);
        exportDepthRef.current -= 1;
        if (exportDepthRef.current === 0) graphStore.state.svgExportMode = false;
      }
    },
    [reactFlowStore],
  );

  const getCurrentSVGSource = useCallback(async () => {
    const operationController = new AbortController();
    activeExportsRef.current.add(operationController);

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
      activeExportsRef.current.delete(operationController);
    }
  }, [getSVGSource, reactFlowStore]);

  useEffect(() => {
    const previewController = new AbortController();
    const buildPreviewImage = async () => {
      try {
        const svgSource = await getSVGSource(previewController.signal);
        const imageURL = URL.createObjectURL(new Blob([svgSource], { type: "image/svg+xml" }));
        if (previewController.signal.aborted || !graphIsCurrent()) {
          URL.revokeObjectURL(imageURL);
          return;
        }
        setPreviewImageURL(imageURL);
        setExportError(null);
      } catch (error) {
        if (isAbortError(error)) return;
        setExportError(getExportErrorMessage(error));
      }
    };
    buildPreviewImage();
    return () => previewController.abort();
  }, [getSVGSource, graphIsCurrent, nodesInitialized]);

  useEffect(() => {
    if (!previewImageURL) return;
    return () => URL.revokeObjectURL(previewImageURL);
  }, [previewImageURL]);

  useEffect(() => {
    const activeExports = activeExportsRef.current;
    return () => {
      for (const controller of activeExports) controller.abort();
    };
  }, []);

  const handleExportSVGToFile = async () => {
    setExportError(null);
    try {
      const svgSource = await getCurrentSVGSource();
      downloadSVG(svgSource, "diagram.svg");
    } catch (error) {
      if (isAbortError(error)) return;
      setExportError(getExportErrorMessage(error));
    }
  };

  const handleCopySVG = async () => {
    const operation = ++copySVGOperationRef.current;
    setExportError(null);
    setHasCopiedSVG(false);
    try {
      await copySVG(getCurrentSVGSource());
    } catch (error) {
      if (isAbortError(error) || operation !== copySVGOperationRef.current) return;
      setExportError(getExportErrorMessage(error));
      return;
    }
    if (operation === copySVGOperationRef.current) setHasCopiedSVG(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      return;
    }
    setHasCopiedLink(true);
  };

  return (
    <>
      {previewImageURL && (
        <div className="flex justify-center border-b border-gray-200 bg-gray-50 p-3 checkered">
          <img alt="diagram" className="h-auto max-h-[22vh] w-auto max-w-full" src={previewImageURL} />
        </div>
      )}

      <div className="dialog-body">
        <div className="field-group">
          <label className="field-label" htmlFor="share-link">
            Share a link to this diagram:
          </label>
          <div className="flex">
            <div className="relative flex min-w-0 grow items-stretch focus-within:z-10">
              <input
                className="field-control rounded-r-none"
                id="share-link"
                name="share-link"
                type="text"
                value={shareLink}
                readOnly
              />
            </div>
            <button
              className="button-secondary relative -ml-px shrink-0 rounded-l-none"
              type="button"
              onClick={handleCopyLink}
            >
              <Link2Icon />
              {hasCopiedLink ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Export as SVG:</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button className="button-primary" type="button" onClick={handleCopySVG}>
              <CopyIcon />
              {hasCopiedSVG ? "Copied" : "Copy to clipboard"}
            </button>

            <button className="button-primary" type="button" onClick={handleExportSVGToFile}>
              <DownloadIcon />
              Download .svg
            </button>
          </div>
          {exportError && (
            <p className="text-sm text-red-600" role="alert">
              {exportError}
            </p>
          )}
        </div>
      </div>
    </>
  );
});

export const Share = ({ isOpen, onClose }: ShareProps) => {
  const cancelButtonRef = useRef(null);

  return (
    <Transition as={Fragment} show={isOpen}>
      <Dialog as="div" className="relative z-50" initialFocus={cancelButtonRef} onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="dialog-backdrop" />
        </TransitionChild>

        <div className="overflow-y-auto fixed inset-0 z-10 w-screen">
          <div className="flex justify-center items-end p-4 min-h-full text-center sm:items-center sm:p-0">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="dialog-panel">
                <DialogTitle as="h3" className="dialog-title">
                  Share
                </DialogTitle>

                <ShareContent />

                <div className="dialog-footer">
                  <button
                    ref={cancelButtonRef}
                    className="button-secondary w-full sm:w-auto"
                    type="button"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
