import { useId, useRef, useState } from "react";
import { useDocuments, documentsStore } from "../../stores/documents";

type RecoveryScreenProps = {
  region: "application" | "diagram";
  message: string;
  componentStack: string;
  onRetry: () => void;
};

export const RecoveryScreen = ({ region, message, componentStack, onRetry }: RecoveryScreenProps) => {
  const state = useDocuments();
  const currentDocument = state.documents.find((document) => document.id === state.currentDocumentId);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const actionOperationRef = useRef(0);
  const documentSelectId = useId();
  const sourceId = useId();

  const handleDocumentChange = (id: string) => {
    actionOperationRef.current++;
    setActionMessage(null);

    try {
      documentsStore.state.setCurrentDocumentId(id);
    } catch {
      setActionMessage(
        "The document was selected, but saving failed. Copy or download its source before leaving."
      );
    }
  };

  const handleCopySource = async () => {
    if (!currentDocument) return;

    const operation = ++actionOperationRef.current;
    const { id, source } = currentDocument;
    let copyMessage: string;

    try {
      await navigator.clipboard.writeText(source);
      copyMessage = "Source copied.";
    } catch {
      copyMessage = "Could not copy the source. Select it below and copy it manually, or download it.";
    }

    const selectedDocument = documentsStore.state.documents.find(
      (document) => document.id === documentsStore.state.currentDocumentId
    );
    const isCurrentCopy =
      operation === actionOperationRef.current &&
      selectedDocument?.id === id &&
      selectedDocument.source === source;
    if (!isCurrentCopy) return;

    setActionMessage(copyMessage);
  };

  const handleDownloadSource = () => {
    if (!currentDocument) return;

    actionOperationRef.current++;

    try {
      const url = URL.createObjectURL(
        new Blob([currentDocument.source], { type: "text/plain;charset=utf-8" })
      );

      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "document.ts";
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }

      setActionMessage("Source download started.");
    } catch {
      setActionMessage("Could not download the source. Select it below and copy it manually.");
    }
  };

  return (
    <section className="h-full overflow-auto bg-canvas p-5 text-body text-text">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div role="alert">
          <h1 className="text-title">
            {region === "diagram"
              ? "The diagram could not be displayed."
              : "The application could not be displayed."}
          </h1>
          <p className="mt-2 text-text-muted">
            {currentDocument
              ? "Your source is still available in this tab. Copy or download it before leaving."
              : "The active document could not be found. Select another document to recover."}
          </p>
        </div>

        {state.documents.length > 0 && (
          <div className="field-group">
            <label className="field-label" htmlFor={documentSelectId}>
              Document
            </label>
            <select
              className="field-control"
              id={documentSelectId}
              value={currentDocument?.id ?? ""}
              onChange={(event) => handleDocumentChange(event.target.value)}
            >
              {!currentDocument && (
                <option value="" disabled>
                  Select a document
                </option>
              )}
              {state.documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="button-primary" onClick={onRetry}>
            {region === "diagram" ? "Retry diagram" : "Retry application"}
          </button>
          {currentDocument && (
            <>
              <button type="button" className="button-secondary" onClick={handleCopySource}>
                Copy source
              </button>
              <button type="button" className="button-secondary" onClick={handleDownloadSource}>
                Download .ts
              </button>
            </>
          )}
        </div>
        {actionMessage && <p role="status">{actionMessage}</p>}

        {currentDocument && (
          <div className="field-group">
            <label className="field-label" htmlFor={sourceId}>
              Source
            </label>
            <textarea
              className="field-control h-48 resize-y font-mono"
              id={sourceId}
              value={currentDocument.source}
              readOnly
            />
          </div>
        )}

        <details className="rounded-lg border border-border bg-pane p-3">
          <summary className="cursor-pointer font-strong">Error details</summary>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-ui">
            {message}
            {"\n"}
            {componentStack}
          </pre>
        </details>
      </div>
    </section>
  );
};
