import { useEffect, useMemo } from "react";
import { useStoreApi } from "@xyflow/react";
import { useDiagramCanvas } from "../DiagramProvider/DiagramProvider";
import { useDiagramStore } from "../DiagramProvider/diagram-state";
import { createSVGExporter } from "./svg-export-flow";

export const useDiagramSVGExporter = () => {
  const reactFlowStore = useStoreApi();
  const graphStore = useDiagramStore();
  const canvas = useDiagramCanvas();
  const exporter = useMemo(
    () => createSVGExporter({ reactFlowStore, graphStore, getCanvas: () => canvas.current }),
    [canvas, graphStore, reactFlowStore]
  );

  useEffect(() => () => exporter.abortAll(), [exporter]);

  return useMemo(() => ({ getCurrentSVGSource: exporter.getCurrentSVGSource }), [exporter]);
};
