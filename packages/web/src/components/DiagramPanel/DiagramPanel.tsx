import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow, useStore } from "statelift";
import type { Model } from "@tsdiagram/core/model";
import { Diagram, type DiagramProcessingStatus } from "@tsdiagram/renderer";
import { useDebounced } from "./use-debounced";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { documentsStore } from "../../stores/documents";
import { optionsStore, updateRendererOptions } from "../../stores/user-options";
import type { ParseRequest, ParseResponse } from "./parser.worker";

const PARSE_DEBOUNCE_MS = 200;
const PARSER_WORKER_ERROR = "The TypeScript parser is unavailable.";
const EMPTY_MODELS: Model[] = [];

type ParsedDocument = ParseRequest & {
  models: Model[];
  error: string | null;
};

const useParsedDocument = (currentSource: string, currentDocumentId: string) => {
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const inFlightRequestRef = useRef<ParseRequest | null>(null);
  const pendingRequestRef = useRef<ParseRequest | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);

  const handleWorkerFailure = useCallback((worker: Worker | null) => {
    worker?.terminate();

    if (workerRef.current === worker) {
      workerRef.current = null;
    }

    inFlightRequestRef.current = null;
    pendingRequestRef.current = null;
    setWorkerError(PARSER_WORKER_ERROR);
  }, []);

  const postParse = useCallback(
    (source: string, documentId: string) => {
      const worker = workerRef.current;
      if (!worker) return;

      const request: ParseRequest = { documentId, source };

      if (inFlightRequestRef.current !== null) {
        pendingRequestRef.current = request;
        return;
      }

      inFlightRequestRef.current = request;

      try {
        worker.postMessage(request);
      } catch {
        handleWorkerFailure(worker);
      }
    },
    [handleWorkerFailure]
  );

  useEffect(() => {
    let worker: Worker;

    try {
      worker = new Worker(new URL("./parser.worker.ts", import.meta.url), { type: "module" });
    } catch {
      handleWorkerFailure(null);
      return;
    }

    let isActive = true;
    setWorkerError(null);

    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      if (!isActive) return;

      const request = inFlightRequestRef.current;
      if (request === null) return;

      inFlightRequestRef.current = null;

      const { documentId, models, error } = event.data;
      if (models !== null) {
        setParsed({ ...request, models, error: null });
      } else if (error !== null) {
        console.error(`[parser.worker] ${error}`);
        setParsed((previous) => ({
          ...request,
          models: previous?.documentId === documentId ? previous.models : EMPTY_MODELS,
          error,
        }));
      }

      const pendingRequest = pendingRequestRef.current;
      if (pendingRequest !== null) {
        pendingRequestRef.current = null;
        postParse(pendingRequest.source, pendingRequest.documentId);
      }
    };
    worker.onerror = () => {
      if (isActive) {
        handleWorkerFailure(worker);
      }
    };
    worker.addEventListener("messageerror", () => {
      if (isActive) {
        handleWorkerFailure(worker);
      }
    });
    workerRef.current = worker;

    return () => {
      isActive = false;
      worker.terminate();
      workerRef.current = null;
      inFlightRequestRef.current = null;
      pendingRequestRef.current = null;
    };
  }, [handleWorkerFailure, postParse]);

  useEffect(() => {
    postParse(currentSource, currentDocumentId);
  }, [currentSource, currentDocumentId, postParse]);

  return { parsed, workerError };
};

export const DiagramPanel = () => {
  const documentSource = useStore(documentsStore, (state) => state.currentDocument.source);
  const currentDocumentId = useStore(documentsStore, (state) => state.currentDocumentId);
  const rendererOptions = useStore(optionsStore, (state) => ({ ...state.renderer }), { equalityFn: shallow });
  const panelDirection = useStore(optionsStore, (state) => state.panels.splitDirection);
  const isMobile = useIsMobile();
  const debouncedSource = useDebounced(documentSource, PARSE_DEBOUNCE_MS, currentDocumentId);
  const { parsed, workerError } = useParsedDocument(debouncedSource, currentDocumentId);

  const processingStatus = useMemo<DiagramProcessingStatus>(() => {
    if (workerError !== null) return { status: "error", message: workerError };

    const hasCurrentParse =
      parsed !== null && parsed.documentId === currentDocumentId && parsed.source === documentSource;

    if (!hasCurrentParse) return { status: "pending" };
    if (parsed.error !== null) return { status: "error", message: parsed.error };

    return { status: "ready" };
  }, [currentDocumentId, documentSource, parsed, workerError]);

  return (
    <div className="relative h-full">
      {workerError !== null && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-canvas p-4 text-body text-error"
          role="alert"
        >
          {workerError}
        </div>
      )}
      <Diagram
        disableMiniMap={isMobile}
        documentId={parsed?.documentId ?? currentDocumentId}
        models={parsed?.models ?? EMPTY_MODELS}
        options={rendererOptions}
        processingStatus={processingStatus}
        viewportRevision={panelDirection}
        onOptionsChange={updateRendererOptions}
      />
    </div>
  );
};
