import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "statelift";
import type { ParseRequest, ParseResponse } from "../../lib/parser/parser.worker";
import { useDebounced } from "../../hooks/useDebounced";
import { useIsMobile } from "../../hooks/useIsMobile";
import { Model } from "../../lib/parser/model-types";
import { documentsStore } from "../../stores/documents";
import { reuseUnchangedModels } from "./model-cache";
import { Renderer } from "./Renderer";

const PARSE_DEBOUNCE_MS = 200;
const PARSER_WORKER_ERROR = "The TypeScript parser is unavailable.";
const EMPTY_MODELS: Model[] = [];

export const RendererWrapper = () => {
  const documentSource = useStore(documentsStore, (state) => state.currentDocument.source);
  const currentDocumentId = useStore(documentsStore, (state) => state.currentDocumentId);
  const isMobile = useIsMobile();

  const debouncedSource = useDebounced(documentSource, PARSE_DEBOUNCE_MS, currentDocumentId);

  const [parsed, setParsed] = useState<{ documentId: string; models: Model[] } | null>(null);
  const modelsRef = useRef<Model[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const inFlightRef = useRef(false);
  const pendingRequestRef = useRef<ParseRequest | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);

  const handleWorkerFailure = useCallback((worker: Worker | null) => {
    worker?.terminate();
    if (workerRef.current === worker) workerRef.current = null;
    inFlightRef.current = false;
    pendingRequestRef.current = null;
    setWorkerError(PARSER_WORKER_ERROR);
  }, []);

  const postParse = useCallback(
    (source: string, documentId: string) => {
      const worker = workerRef.current;
      if (!worker) return;
      const request: ParseRequest = { documentId, source };
      if (inFlightRef.current) {
        pendingRequestRef.current = request;
        return;
      }
      inFlightRef.current = true;
      try {
        worker.postMessage(request);
      } catch {
        handleWorkerFailure(worker);
      }
    },
    [handleWorkerFailure],
  );

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../../lib/parser/parser.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      handleWorkerFailure(null);
      return;
    }
    let active = true;
    setWorkerError(null);
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      if (!active) return;
      inFlightRef.current = false;
      const { documentId, models: parsedModels, error } = event.data;
      if (parsedModels) {
        const reusedModels = reuseUnchangedModels(modelsRef.current, parsedModels);
        modelsRef.current = reusedModels;
        setParsed({ documentId, models: reusedModels });
      } else if (error) {
        // keep the previous diagram when a parse fails instead of tearing down the canvas
        console.error(`[parser.worker] ${error}`);
        setParsed((previous) =>
          previous?.documentId === documentId ? previous : { documentId, models: EMPTY_MODELS },
        );
      }
      const pendingRequest = pendingRequestRef.current;
      if (pendingRequest !== null) {
        pendingRequestRef.current = null;
        postParse(pendingRequest.source, pendingRequest.documentId);
      }
    };
    worker.onerror = () => {
      if (active) handleWorkerFailure(worker);
    };
    worker.addEventListener('messageerror', () => {
      if (active) handleWorkerFailure(worker);
    });
    workerRef.current = worker;
    return () => {
      active = false;
      worker.terminate();
      workerRef.current = null;
      inFlightRef.current = false;
      pendingRequestRef.current = null;
    };
  }, [handleWorkerFailure, postParse]);

  useEffect(() => {
    postParse(debouncedSource, currentDocumentId);
  }, [debouncedSource, currentDocumentId, postParse]);

  if (workerError !== null) {
    return (
      <div className="flex flex-1 justify-center items-center p-4 text-red-700" role="alert">
        {workerError}
      </div>
    );
  }

  return (
    <Renderer
      disableMiniMap={isMobile}
      documentId={parsed?.documentId ?? currentDocumentId}
      isParsing={parsed === null || parsed.documentId !== currentDocumentId}
      models={parsed?.models ?? EMPTY_MODELS}
    />
  );
};
