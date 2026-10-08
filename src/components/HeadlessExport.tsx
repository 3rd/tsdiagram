import { memo, useEffect, useMemo } from "react";
import { useStoreApi } from "@xyflow/react";
import { graphStore } from "../stores/graph";
import { createSVGExporter } from "../utils/svg-export-flow";

export type HeadlessExportResult =
  { status: "pending" } | { status: "done"; svg: string } | { status: "error"; message: string };

declare global {
  interface Window {
    __tsdiagramExport?: HeadlessExportResult;
  }
}

const EMPTY_GRACE_MS = 10_000;

export const isHeadlessExportRequested = () =>
  new URLSearchParams(window.location.search).get("export") === "svg";

/**
 * Runs the SVG export without the share dialog when the page opens with
 * `?export=svg`, and publishes the result on `window.__tsdiagramExport`.
 * `bin/tsdiagram-export.mjs` opens the page in headless Chrome and reads it.
 */
export const HeadlessExport = memo(() => {
  const reactFlowStore = useStoreApi();
  const exporter = useMemo(() => createSVGExporter(reactFlowStore), [reactFlowStore]);

  useEffect(() => {
    if (!isHeadlessExportRequested()) return;
    window.__tsdiagramExport = { status: "pending" };
    // the parser runs in a worker and elk places the nodes afterwards, so wait
    // until nodes exist, the layout is done, and the positions stayed the same
    // over 2 checks; an empty document gets a short grace period
    const positionsKey = () =>
      reactFlowStore
        .getState()
        .nodes.map((node) => `${node.id}:${Math.round(node.position.x)},${Math.round(node.position.y)}`)
        .join("|");
    const waitForNodes = () =>
      new Promise<void>((resolve) => {
        const startedAt = Date.now();
        let previousKey = "";
        const check = () => {
          const { nodes } = reactFlowStore.getState();
          const key = positionsKey();
          const placed = nodes.length > 0 && !graphStore.state.isPlacing && key === previousKey;
          previousKey = key;
          if (placed || Date.now() - startedAt > EMPTY_GRACE_MS) resolve();
          else window.setTimeout(check, 250);
        };
        check();
      });
    waitForNodes()
      .then(() => exporter.getCurrentSVGSource())
      .then((svg) => {
        window.__tsdiagramExport = { status: "done", svg };
      })
      .catch((error: unknown) => {
        window.__tsdiagramExport = {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      });
    return () => exporter.abortAll();
  }, [exporter, reactFlowStore]);

  return null;
});
HeadlessExport.displayName = "HeadlessExport";
