import { ReactFlowProvider, useStoreApi } from "@xyflow/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getNodeDecoration, createDiagramStore } from "../DiagramProvider/diagram-state";
import { exportReactFlowToSVG } from "./svg-export";
import { createSVGExporter as createExporter } from "./svg-export-flow";

let graphStore: ReturnType<typeof createDiagramStore>;

const createSVGExporter = (reactFlowStore: ReturnType<typeof createFlowStore>) =>
  createExporter({ reactFlowStore, graphStore, getCanvas: () => ({ querySelector: () => null }) });

vi.mock("./svg-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./svg-export")>()),
  exportReactFlowToSVG: vi.fn(),
}));

type CaptureFlowStoreProps = {
  stores: Array<ReturnType<typeof useStoreApi>>;
};

const CaptureFlowStore = ({ stores }: CaptureFlowStoreProps) => {
  stores.push(useStoreApi());
  return null;
};

const createFlowStore = () => {
  const stores: CaptureFlowStoreProps["stores"] = [];
  renderToStaticMarkup(
    createElement(ReactFlowProvider, { children: createElement(CaptureFlowStore, { stores }) })
  );
  return stores[0];
};

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const flushFrames = async () => {
  const pending = [...frames.entries()];
  frames.clear();

  for (const [frame, callback] of pending) {
    callback(frame);
  }

  await Promise.resolve();
};

beforeEach(() => {
  graphStore = createDiagramStore();
  graphStore.state.parserStatus = { status: "ready" };
  graphStore.state.layoutStatus = { status: "ready" };
  graphStore.state.routingStatus = { status: "ready" };
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const frame = ++nextFrame;
    frames.set(frame, callback);
    return frame;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => frames.delete(frame));
  vi.mocked(exportReactFlowToSVG).mockResolvedValue("<svg />");
});

afterEach(() => {
  frames.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("waits for parsing and layout before exporting an empty diagram", async () => {
  graphStore.state.parserStatus = { status: "pending" };
  graphStore.state.layoutStatus = { status: "pending" };
  vi.mocked(exportReactFlowToSVG).mockImplementation(() => {
    const { parserStatus, layoutStatus } = graphStore.state;
    return Promise.resolve(`<svg>${parserStatus.status}:${layoutStatus.status}</svg>`);
  });
  const exporter = createSVGExporter(createFlowStore());
  const result = exporter.getCurrentSVGSource();
  await flushFrames();
  await flushFrames();
  await flushFrames();

  graphStore.state.parserStatus = { status: "ready" };
  await flushFrames();
  await flushFrames();
  graphStore.state.layoutStatus = { status: "ready" };
  await flushFrames();
  await flushFrames();
  await flushFrames();

  await expect(result).resolves.toBe("<svg>ready:ready</svg>");
});

it.each(["parserStatus", "layoutStatus", "routingStatus"] as const)(
  "rejects a failed %s instead of exporting its empty graph",
  async (statusKey) => {
    graphStore.state[statusKey] = { status: "pending" };
    const exporter = createSVGExporter(createFlowStore());
    const result = exporter.getCurrentSVGSource();
    const rejection = expect(result).rejects.toThrow("Processing failed");
    graphStore.state[statusKey] = { status: "error", message: "Processing failed" };
    await flushFrames();
    await flushFrames();
    await flushFrames();

    await rejection;
  }
);

it("cancels a pending readiness wait without cancelling another exporter", async () => {
  graphStore.state.parserStatus = { status: "pending" };
  const flowStore = createFlowStore();
  const cancelledExporter = createSVGExporter(flowStore);
  const survivingExporter = createSVGExporter(flowStore);
  const cancelledResult = cancelledExporter.getCurrentSVGSource();
  const rejection = expect(cancelledResult).rejects.toMatchObject({ name: "AbortError" });
  const survivingResult = survivingExporter.getCurrentSVGSource();
  cancelledExporter.abortAll();
  await rejection;
  graphStore.state.parserStatus = { status: "ready" };
  await flushFrames();
  await flushFrames();
  await flushFrames();

  await expect(survivingResult).resolves.toBe("<svg />");
});

it("rejects a waiting export when its diagram is released", async () => {
  graphStore.state.parserStatus = { status: "pending" };
  const exporter = createSVGExporter(createFlowStore());
  const result = exporter.getCurrentSVGSource();
  const rejection = expect(result).rejects.toThrow("The diagram is unavailable.");
  graphStore.state.releaseDiagram();

  await rejection;
});

it("restarts capture when parsing changes before the SVG result is delivered", async () => {
  vi.mocked(exportReactFlowToSVG)
    .mockImplementationOnce(() => {
      graphStore.state.parserStatus = { status: "pending" };
      return Promise.resolve("<svg>stale</svg>");
    })
    .mockResolvedValue("<svg>current</svg>");
  const exporter = createSVGExporter(createFlowStore());
  const result = exporter.getCurrentSVGSource();
  await flushFrames();
  await flushFrames();
  await flushFrames();
  graphStore.state.parserStatus = { status: "ready" };
  await flushFrames();
  await flushFrames();
  await flushFrames();

  await expect(result).resolves.toBe("<svg>current</svg>");
});

it("keeps selection decoration suspended until every exporter finishes", async () => {
  const flowStore = createFlowStore();
  const firstExporter = createSVGExporter(flowStore);
  const secondExporter = createSVGExporter(flowStore);
  const completeCaptures: Array<(svg: string) => void> = [];
  vi.mocked(exportReactFlowToSVG).mockImplementation(
    () => new Promise<string>((resolve) => completeCaptures.push(resolve))
  );
  graphStore.state.selectedEdge = { id: "A-B", source: "A", target: "B" };
  const firstExport = firstExporter.getSVGSource();
  const secondExport = secondExporter.getSVGSource();
  await flushFrames();
  await flushFrames();
  expect(getNodeDecoration(graphStore.state, "C")).toBe("none");

  completeCaptures[0]("<svg>first</svg>");
  await expect(firstExport).resolves.toBe("<svg>first</svg>");
  const decorationWhileSecondExportRuns = getNodeDecoration(graphStore.state, "C");
  completeCaptures[1]("<svg>second</svg>");
  await expect(secondExport).resolves.toBe("<svg>second</svg>");

  expect(decorationWhileSecondExportRuns).toBe("none");
  expect(getNodeDecoration(graphStore.state, "C")).toBe("dimmed");
});
