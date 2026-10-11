import { useMemo } from "react";
import { Edge, EdgeProps, Node } from "@xyflow/react";
import { createStore, createStoreContext } from "statelift";
import { Model } from "@tsdiagram/core/model";

type GraphNode = Node<{ model: Model }>;
type GraphEdge = Pick<Edge, "id" | "source" | "target">;

export type DiagramProcessingStatus =
  | { readonly status: "pending" }
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly message: string };

type GraphState = {
  acquireSvgExport: () => () => void;
  clearHoveredBadgeHub: (pillId: string) => void;
  hoveredNode: GraphNode | null;
  hoveredNodeId: string | null;
  selectedNode: GraphNode | null;
  selectedNodeId: string | null;
  selectedEdge: GraphEdge | null;
  selectedEdgeId: string | null;
  focusedNodeId: string | null;
  readonly svgExportMode: boolean;
  svgExportCount: number;
  parserStatus: DiagramProcessingStatus;
  layoutStatus: DiagramProcessingStatus;
  routingStatus: DiagramProcessingStatus;
  readonly exportStatus: DiagramProcessingStatus;
  hoveredBadgeHubId: string | null;
  hoveredBadgePillId: string | null;
  highlightedNodeIds: Record<string, true>;
  setHoveredBadgeHub: (hubId: string, pillId: string) => void;
};

const addHighlightedNodeId = (highlightedNodeIds: Record<string, true>, id: string) => {
  Object.defineProperty(highlightedNodeIds, id, {
    configurable: true,
    enumerable: true,
    value: true,
    writable: true,
  });
};

export const computeHighlightedNodeIds = (focusedNode: GraphNode | null) => {
  const highlightedNodeIds: Record<string, true> = {};

  if (!focusedNode) return highlightedNodeIds;

  addHighlightedNodeId(highlightedNodeIds, focusedNode.id);

  for (const dependency of focusedNode.data.model.dependencies) {
    addHighlightedNodeId(highlightedNodeIds, dependency.id);
  }

  for (const dependant of focusedNode.data.model.dependants) {
    addHighlightedNodeId(highlightedNodeIds, dependant.id);
  }

  return highlightedNodeIds;
};

const reconcileHighlightedNodeIds = (target: Record<string, true>, next: Record<string, true>) => {
  for (const id of Object.keys(target)) {
    if (Object.hasOwn(next, id)) continue;

    delete target[id];
  }

  for (const id of Object.keys(next)) {
    if (Object.hasOwn(target, id)) continue;

    addHighlightedNodeId(target, id);
  }
};

const computeEdgeEndIds = (edge: GraphEdge) => {
  const endIds: Record<string, true> = {};
  addHighlightedNodeId(endIds, edge.source);
  addHighlightedNodeId(endIds, edge.target);
  return endIds;
};

export const createDiagramStore = () =>
  createStore<GraphState>(() => {
    let hoveredNode: GraphNode | null = null;
    let selectedNode: GraphNode | null = null;
    let selectedEdge: GraphEdge | null = null;

    const reconcileFocus = (state: GraphState) => {
      const focusedNode = hoveredNode ?? selectedNode;
      state.focusedNodeId = focusedNode?.id ?? null;

      const next =
        focusedNode === null && selectedEdge !== null
          ? computeEdgeEndIds(selectedEdge)
          : computeHighlightedNodeIds(focusedNode);
      reconcileHighlightedNodeIds(state.highlightedNodeIds, next);
    };

    const initialState: GraphState = {
      acquireSvgExport() {
        this.svgExportCount += 1;
        let hasReleased = false;

        return () => {
          if (hasReleased) return;

          hasReleased = true;
          this.svgExportCount -= 1;
        };
      },
      clearHoveredBadgeHub(pillId) {
        if (this.hoveredBadgePillId !== pillId) return;

        this.hoveredBadgeHubId = null;
        this.hoveredBadgePillId = null;
      },
      highlightedNodeIds: {},
      hoveredNodeId: null,
      selectedNodeId: null,
      selectedEdgeId: null,
      focusedNodeId: null,
      svgExportCount: 0,
      get svgExportMode() {
        return this.svgExportCount > 0;
      },
      parserStatus: { status: "pending" },
      layoutStatus: { status: "pending" },
      routingStatus: { status: "pending" },
      get exportStatus() {
        if (this.parserStatus.status !== "ready") return this.parserStatus;
        if (this.layoutStatus.status !== "ready") return this.layoutStatus;

        return this.routingStatus;
      },
      hoveredBadgeHubId: null,
      hoveredBadgePillId: null,
      setHoveredBadgeHub(hubId, pillId) {
        this.hoveredBadgeHubId = hubId;
        this.hoveredBadgePillId = pillId;
      },
      get hoveredNode() {
        return hoveredNode;
      },
      set hoveredNode(node: GraphNode | null) {
        hoveredNode = node;
        this.hoveredNodeId = node?.id ?? null;
        reconcileFocus(this);
      },
      get selectedNode() {
        return selectedNode;
      },
      set selectedNode(node: GraphNode | null) {
        selectedNode = node;
        this.selectedNodeId = node?.id ?? null;
        if (node !== null) {
          selectedEdge = null;
          this.selectedEdgeId = null;
        }
        reconcileFocus(this);
      },
      get selectedEdge() {
        return selectedEdge;
      },
      set selectedEdge(edge: GraphEdge | null) {
        selectedEdge = edge;
        this.selectedEdgeId = edge?.id ?? null;
        if (edge !== null) {
          selectedNode = null;
          this.selectedNodeId = null;
        }
        reconcileFocus(this);
      },
    };

    return initialState;
  });

export const getNodeDecoration = (state: GraphState, modelId: string) => {
  if (state.svgExportMode) return "none";
  if (state.selectedNodeId === modelId) return "selected";

  const isHighlighted = state.highlightedNodeIds[modelId];
  if (isHighlighted) return state.hoveredNodeId === null ? "none" : "highlighted";

  return state.selectedNodeId === null && state.selectedEdgeId === null ? "none" : "dimmed";
};

export const getEdgeDecoration = (state: GraphState, edge: Pick<EdgeProps, "id" | "source" | "target">) => {
  if (state.svgExportMode) return "none";
  if (state.selectedEdgeId === edge.id) return "highlighted";

  const { focusedNodeId } = state;
  if (focusedNodeId !== null) {
    return focusedNodeId === edge.source || focusedNodeId === edge.target ? "highlighted" : "faded";
  }

  return state.selectedEdgeId === null ? "none" : "faded";
};

export const DiagramState = createStoreContext(createDiagramStore);

export const useDiagramStore = DiagramState.useStoreInstance;
export const useDiagramStatus = () => DiagramState.useStore((state) => state.exportStatus);
export const useSvgExportMode = () => DiagramState.useStore((state) => state.svgExportMode);
export const useIsBadgeHubHovered = (hubId: string) =>
  DiagramState.useStore((state) => state.hoveredBadgeHubId === hubId);

export const useNodeDecoration = (model: Model) =>
  DiagramState.useStore((state) => getNodeDecoration(state, model.id));

export const useIsEdgeDecorated = (edge: EdgeProps) => {
  const decoration = DiagramState.useStore((state) => getEdgeDecoration(state, edge));
  return useMemo(
    () => ({ highlighted: decoration === "highlighted", faded: decoration === "faded" }),
    [decoration]
  );
};
