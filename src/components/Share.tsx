import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { CopyIcon, DownloadIcon, Link2Icon } from "@radix-ui/react-icons";
import { useNodesInitialized, useStore, useStoreApi } from "@xyflow/react";
import { copySVG, downloadSVG, GraphSnapshotMismatchError, isAbortError } from "../utils/svg-export";
import { createSVGExporter } from "../utils/svg-export-flow";

export type ShareProps = {
  isOpen: boolean;
  onClose: () => void;
};

const getExportErrorMessage = (error: unknown) => {
  if (error instanceof GraphSnapshotMismatchError) return "Export failed: the diagram could not be captured.";
  return `Export failed: ${error instanceof Error ? error.message : String(error)}`;
};

const ShareContent = memo(() => {
  const [hasCopiedLink, setHasCopiedLink] = useState(false);
  const [hasCopiedSVG, setHasCopiedSVG] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [previewImageURL, setPreviewImageURL] = useState<string | null>(null);
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

  const exporter = useMemo(() => createSVGExporter(reactFlowStore), [reactFlowStore]);
  const { getSVGSource, getCurrentSVGSource } = exporter;

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

  useEffect(() => () => exporter.abortAll(), [exporter]);

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
        <div className="checkered mt-4 flex justify-center border-y border-border p-3">
          <img alt="diagram" className="h-auto max-h-[22vh] w-auto max-w-full" src={previewImageURL} />
        </div>
      )}

      <div className="dialog-body">
        <div className="field-group">
          <label className="field-label" htmlFor="share-link">
            Link
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
          <label className="field-label">Export SVG</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button className="button-secondary" type="button" onClick={handleCopySVG}>
              <CopyIcon />
              {hasCopiedSVG ? "Copied" : "Copy to clipboard"}
            </button>

            <button className="button-primary" type="button" onClick={handleExportSVGToFile}>
              <DownloadIcon />
              Download .svg
            </button>
          </div>
          {exportError && (
            <p className="text-ui text-error" role="alert">
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
          enter="ease-fade duration-(--duration-fade)"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-fade duration-(--duration-quick)"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="dialog-backdrop" />
        </TransitionChild>

        <div className="overflow-y-auto fixed inset-0 z-10 w-screen">
          <div className="flex justify-center items-end p-4 min-h-full text-center sm:items-center sm:p-0">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-(--duration-enter)"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-1 sm:scale-98"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-out duration-(--duration-quick)"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-1 sm:scale-98"
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
