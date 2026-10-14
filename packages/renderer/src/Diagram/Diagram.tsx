import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ComponentNoneIcon,
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  HeightIcon,
  TransformIcon,
  WidthIcon,
} from "@radix-ui/react-icons";
import {
  Background,
  BackgroundVariant,
  Controls,
  FitViewOptions,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
  useStoreApi,
  useUpdateNodeInternals,
  Viewport,
} from "@xyflow/react";
import classNames from "classnames";

import throttle from "lodash/throttle";
import { useFullscreen } from "./use-fullscreen";
import { Model } from "@tsdiagram/core/model";
import { useDiagramStore, type DiagramProcessingStatus } from "../DiagramProvider/diagram-state";
import { useDiagramCanvas } from "../DiagramProvider/DiagramProvider";
import type { DiagramOptions } from "../diagram-options";
import { reuseUnchangedModels } from "./model-cache";
import { computeBadgeHubIds, EMPTY_BADGE_HUB_IDS } from "../graph/badge-hubs";
import { CustomEdge, selectLowDetail } from "./CustomEdge";
import {
  arePortColorsEqual,
  assignEdgeColors,
  EDGE_COLOR_PALETTES,
  EMPTY_PORT_COLORS,
} from "../graph/edge-colors";
import { EdgeRoutingProvider } from "./EdgeRoutingProvider";
import { createLayoutEngine } from "./layout-engine";
import {
  decorateModelEdges,
  extractModelEdges,
  extractModelNodes,
  isSameModelEdge,
  isUnplacedNode,
  LAYOUT_RESET_NODE_COUNT_CHANGE_THRESHOLD,
  LAYOUT_RESET_NODE_OVERLAP_THRESHOLD,
  layoutModelNodes,
  ModelEdge,
  ModelNodeState,
  normalizeLayoutEdges,
  shouldResetLayoutAnchors,
} from "../graph/layout";
import { ModelNode } from "./ModelNode";
import { PortColorsContext } from "./port-colors";
import "../fonts.css";

const AUTO_LAYOUT_THROTTLE_MS = 120;

const snapToDevicePixel = (value: number) => Math.round(value * devicePixelRatio) / devicePixelRatio;

const nodeTypes = { model: ModelNode };
const edgeTypes = { custom: CustomEdge };
const proOptions = { hideAttribution: true };
const minimapStyle = { opacity: 0.9 };

const reuseCachedNodes = (
  parsedNodes: ModelNodeState[],
  cachedNodes: ReadonlyMap<string, ModelNodeState>
) => {
  const hitCachedNodeSet = new Set<ModelNodeState>();
  const nodesThatMissedCache: ModelNodeState[] = [];

  const updatedNodes = parsedNodes.map((node) => {
    const cachedNode = cachedNodes.get(node.id);
    if (!cachedNode) {
      nodesThatMissedCache.push(node);
      return node;
    }

    hitCachedNodeSet.add(cachedNode);

    const canReuseCachedNode =
      cachedNode.data.model === node.data.model && cachedNode.data.badgeHubIds === node.data.badgeHubIds;
    if (canReuseCachedNode) return cachedNode;

    if (cachedNode.measured?.width && cachedNode.measured?.height) {
      return {
        ...node,
        measured: cachedNode.measured,
        position: cachedNode.position,
      };
    }

    return { ...node, position: cachedNode.position };
  });

  const isLikelyNodeRename =
    nodesThatMissedCache.length === 1 && hitCachedNodeSet.size === cachedNodes.size - 1;
  if (isLikelyNodeRename) {
    const missedCachedNode = [...cachedNodes.values()].find(
      (cachedNode) => !hitCachedNodeSet.has(cachedNode)
    );
    const updatedNode = nodesThatMissedCache.values().next().value;

    if (!missedCachedNode) {
      throw new Error("missedCachedNode not found");
    }

    if (!updatedNode) {
      throw new Error("updatedNode not found");
    }

    updatedNode.position = missedCachedNode.position;
  }

  return updatedNodes;
};

export type DiagramProps = {
  documentId: string;
  models: Model[];
  processingStatus: DiagramProcessingStatus;
  options: DiagramOptions;
  onOptionsChange: (change: Partial<DiagramOptions>) => void;
  viewportRevision?: string;
  disableMiniMap?: boolean;
  isSourceEmpty?: boolean;
};

export const Diagram = memo(
  ({
    documentId,
    models: incomingModels,
    processingStatus,
    options,
    onOptionsChange,
    disableMiniMap,
    viewportRevision,
    isSourceEmpty = false,
  }: DiagramProps) => {
    const graphStore = useDiagramStore();

    const previousModelsRef = useRef<Model[]>([]);
    const models = useMemo(
      () => reuseUnchangedModels(previousModelsRef.current, incomingModels),
      [incomingModels]
    );

    useEffect(() => {
      previousModelsRef.current = models;
    }, [models]);

    const isParsing = processingStatus.status === "pending";
    const { fitView, getNodes, getEdges } = useReactFlow<ModelNodeState, ModelEdge>();
    const reactFlowStore = useStoreApi();
    const updateNodeInternals = useUpdateNodeInternals();
    const [nodes, setNodes, onNodesChange] = useNodesState<ModelNodeState>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<ModelEdge>([]);
    const layoutEngineRef = useRef<ReturnType<typeof createLayoutEngine> | null>(null);
    const layoutEngineErrorRef = useRef<string | null>(null);
    const optionsChangeRef = useRef(onOptionsChange);

    useLayoutEffect(() => {
      optionsChangeRef.current = onOptionsChange;
    }, [onOptionsChange]);

    useLayoutEffect(() => {
      graphStore.state.parserStatus = processingStatus;
    }, [graphStore, processingStatus]);

    useLayoutEffect(() => {
      try {
        layoutEngineRef.current = createLayoutEngine();
      } catch (error) {
        layoutEngineErrorRef.current = error instanceof Error ? error.message : String(error);
      }

      return () => {
        layoutEngineRef.current?.terminateWorker();
        layoutEngineRef.current = null;
      };
    }, []);

    useLayoutEffect(() => {
      return () => {
        graphStore.state.releaseDiagram();
      };
    }, [graphStore]);

    const cachedNodesMap = useRef<Map<string, ModelNodeState>>(new Map());
    const manuallyMovedNodesSet = useRef<Set<string>>(new Set());
    const autoLayoutRunId = useRef(0);
    const [completedLayoutRunId, setCompletedLayoutRunId] = useState(0);
    const snapFitPendingRef = useRef(false);
    const [isPlacing, setIsPlacing] = useState(false);
    const previousParsedGraphRef = useRef<
      | {
          documentId: string;
          nodeIds: Set<string>;
        }
      | undefined
    >(undefined);

    const isLowDetail = useStore(selectLowDetail);

    const previousBadgeHubIdsRef = useRef<{ documentId: string; ids: ReadonlySet<string> } | undefined>(
      undefined
    );
    const badgeHubIds = useMemo(() => {
      const previousBadgeHubIds =
        previousBadgeHubIdsRef.current?.documentId === documentId
          ? previousBadgeHubIdsRef.current.ids
          : EMPTY_BADGE_HUB_IDS;
      return options.badgeHubs ? computeBadgeHubIds(models, previousBadgeHubIds) : EMPTY_BADGE_HUB_IDS;
    }, [documentId, models, options.badgeHubs]);
    useEffect(() => {
      previousBadgeHubIdsRef.current = { documentId, ids: badgeHubIds };
    }, [badgeHubIds, documentId]);

    const panelRef = useRef<HTMLDivElement>(null);
    const containerRef = useDiagramCanvas();
    const [shouldAnimate, setShouldAnimate] = useState(false);

    const fitViewOptions: FitViewOptions<ModelNodeState> = useMemo(
      () => ({
        padding: 0.3,
        duration: shouldAnimate ? 500 : 0,
      }),
      [shouldAnimate]
    );

    const sharedEdgeProps = useMemo<Omit<Partial<ModelEdge>, "data">>(
      () => ({
        type: "custom",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          strokeWidth: 1,
          markerEndId: "arrow",
        },
      }),
      []
    );
    const getEdgeColorProps = useMemo(() => {
      const propsByColor = new Map<string, Pick<ModelEdge, "markerEnd" | "style">>();
      return (color: string) => {
        let props = propsByColor.get(color);
        if (!props) {
          props = {
            markerEnd: { type: MarkerType.ArrowClosed, color },
            style: { ...sharedEdgeProps.style, stroke: color },
          };
          propsByColor.set(color, props);
        }

        return props;
      };
    }, [sharedEdgeProps]);

    const parsedNodes = useMemo(() => extractModelNodes(models, badgeHubIds), [models, badgeHubIds]);
    const modelEdges = useMemo(() => extractModelEdges(models, badgeHubIds), [models, badgeHubIds]);

    useEffect(() => {
      const { hoveredNode, selectedNode } = graphStore.state;

      if (hoveredNode) {
        const currentNode = parsedNodes.find((node) => node.id === hoveredNode.id);
        if (!currentNode) {
          graphStore.state.hoveredNode = null;
        } else if (currentNode.data.model !== hoveredNode.data.model) {
          graphStore.state.hoveredNode = currentNode;
        }
      }

      if (selectedNode) {
        const currentNode = parsedNodes.find((node) => node.id === selectedNode.id);
        if (!currentNode) {
          graphStore.state.selectedNode = null;
        } else if (currentNode.data.model !== selectedNode.data.model) {
          graphStore.state.selectedNode = currentNode;
        }
      }
    }, [graphStore, parsedNodes]);

    useEffect(() => {
      const { selectedEdge } = graphStore.state;
      if (selectedEdge && !modelEdges.some((edge) => edge.id === selectedEdge.id)) {
        graphStore.state.selectedEdge = null;
      }
    }, [graphStore, modelEdges]);

    useEffect(() => {
      graphStore.state.hoveredNode = null;
      graphStore.state.selectedNode = null;
      graphStore.state.selectedEdge = null;
    }, [documentId, graphStore]);

    const edgeColors = useMemo(
      () => (options.colorizeEdges ? assignEdgeColors(modelEdges, EDGE_COLOR_PALETTES[options.theme]) : null),
      [modelEdges, options.colorizeEdges, options.theme]
    );

    const previousPortColorsRef = useRef<ReadonlyMap<string, string>>(EMPTY_PORT_COLORS);
    const portColors = useMemo(() => {
      const next = edgeColors === null ? EMPTY_PORT_COLORS : edgeColors.ports;
      const previous = previousPortColorsRef.current;
      if (arePortColorsEqual(previous, next)) return previous;

      previousPortColorsRef.current = next;
      return next;
    }, [edgeColors]);

    const previousParsedEdgesRef = useRef<Map<string, ModelEdge>>(new Map());
    const parsedEdges = useMemo(() => {
      const decorated = decorateModelEdges(modelEdges, sharedEdgeProps);
      const colored =
        edgeColors === null
          ? decorated
          : decorated.map((edge, index) => ({ ...edge, ...getEdgeColorProps(edgeColors.edges[index]) }));

      const previous = previousParsedEdgesRef.current;
      const reused = colored.map((edge) => {
        const previousEdge = previous.get(edge.id);
        const isUnchanged = previousEdge && isSameModelEdge(previousEdge, edge);
        return isUnchanged ? previousEdge : edge;
      });

      previousParsedEdgesRef.current = new Map(reused.map((edge) => [edge.id, edge]));
      return reused;
    }, [edgeColors, getEdgeColorProps, modelEdges, sharedEdgeProps]);

    const layoutInFlightRef = useRef(false);
    const layoutRequestedRef = useRef(false);
    const isLayoutScheduledRef = useRef(false);
    const layoutFrameRef = useRef<number | null>(null);
    const handleAutoLayout = useMemo(() => {
      return throttle(
        () => {
          isLayoutScheduledRef.current = false;

          if (layoutInFlightRef.current) {
            layoutRequestedRef.current = true;
            return;
          }

          const currentNodes = getNodes();
          if (currentNodes.length === 0) {
            graphStore.state.layoutStatus = { status: "ready" };
            return;
          }

          const engine = layoutEngineRef.current;
          if (engine === null) {
            graphStore.state.layoutStatus = {
              status: "error",
              message: layoutEngineErrorRef.current ?? "The diagram layout is unavailable.",
            };
            return;
          }

          const currentEdges = normalizeLayoutEdges(getEdges());

          const hasSizeForAllNodes = currentNodes.every(
            (node) => node.measured?.width && node.measured?.height
          );
          if (!hasSizeForAllNodes) return;

          const currentRunId = ++autoLayoutRunId.current;
          layoutInFlightRef.current = true;
          graphStore.state.layoutStatus = { status: "pending" };

          layoutModelNodes({
            engine,
            compact: options.compactLayout,
            direction: options.direction,
            edges: currentEdges,
            manuallyMovedNodesSet: manuallyMovedNodesSet.current,
            nodes: currentNodes,
          })
            .then((layoutedNodes) => {
              if (currentRunId !== autoLayoutRunId.current) return;

              setNodes(layoutedNodes);

              if (options.autoFitView && !snapFitPendingRef.current) {
                requestIdleCallback(() => fitView(fitViewOptions));
              }
            })
            .catch((error: unknown) => {
              if (currentRunId !== autoLayoutRunId.current) return;

              graphStore.state.layoutStatus = {
                status: "error",
                message: error instanceof Error ? error.message : String(error),
              };
              setIsPlacing(false);
              console.error(error);
            })
            .finally(() => {
              layoutInFlightRef.current = false;

              if (currentRunId === autoLayoutRunId.current) {
                setCompletedLayoutRunId(currentRunId);
              }

              if (!layoutRequestedRef.current) return;

              layoutRequestedRef.current = false;
              isLayoutScheduledRef.current = true;
              handleAutoLayoutRef.current();
            });
        },
        AUTO_LAYOUT_THROTTLE_MS,
        { leading: true, trailing: true }
      );
    }, [
      fitView,
      fitViewOptions,
      getEdges,
      getNodes,
      graphStore,
      options.autoFitView,
      options.compactLayout,
      options.direction,
      setNodes,
    ]);

    const handleAutoLayoutRef = useRef(handleAutoLayout);
    useEffect(() => {
      handleAutoLayoutRef.current = handleAutoLayout;
    }, [handleAutoLayout]);

    const handleAutoLayoutRequest = useCallback(() => {
      isLayoutScheduledRef.current = true;
      graphStore.state.layoutStatus = { status: "pending" };
      handleAutoLayoutRef.current();
    }, [graphStore]);

    const scheduleAutoLayout = useCallback(() => {
      graphStore.state.layoutStatus = { status: "pending" };

      if (layoutFrameRef.current !== null) return;

      layoutFrameRef.current = requestAnimationFrame(() => {
        layoutFrameRef.current = null;
        handleAutoLayoutRequest();
      });
    }, [graphStore, handleAutoLayoutRequest]);

    useEffect(() => {
      if (isLayoutScheduledRef.current) {
        handleAutoLayout();
      }

      return () => {
        handleAutoLayout.cancel();
      };
    }, [handleAutoLayout]);

    useLayoutEffect(() => {
      return () => {
        autoLayoutRunId.current += 1;
        layoutRequestedRef.current = false;
        isLayoutScheduledRef.current = false;

        if (layoutFrameRef.current !== null) {
          cancelAnimationFrame(layoutFrameRef.current);
          layoutFrameRef.current = null;
        }

        graphStore.state.layoutStatus = { status: "pending" };
      };
    }, [graphStore]);

    const previousCompactLayoutRef = useRef(options.compactLayout);
    useEffect(() => {
      if (previousCompactLayoutRef.current === options.compactLayout) return;

      previousCompactLayoutRef.current = options.compactLayout;
      handleAutoLayoutRequest();
    }, [options.compactLayout, handleAutoLayoutRequest]);

    const previousDirectionRef = useRef(options.direction);
    useEffect(() => {
      if (previousDirectionRef.current === options.direction) return;

      previousDirectionRef.current = options.direction;
      manuallyMovedNodesSet.current.clear();
      handleAutoLayoutRequest();
    }, [handleAutoLayoutRequest, options.direction]);

    useEffect(() => {
      if (!options.autoFitView) return;

      handleAutoLayoutRequest();
    }, [handleAutoLayoutRequest, options.autoFitView]);

    useLayoutEffect(() => {
      const shouldRetryLayout = graphStore.state.layoutStatus.status === "error";
      graphStore.state.layoutStatus = { status: "pending" };

      const currentNodeIds = new Set(parsedNodes.map((node) => node.id));
      const previousParsedGraph = previousParsedGraphRef.current;

      if (
        shouldResetLayoutAnchors({
          countChangeThreshold: LAYOUT_RESET_NODE_COUNT_CHANGE_THRESHOLD,
          nextDocumentId: documentId,
          nextNodeIds: currentNodeIds,
          overlapThreshold: LAYOUT_RESET_NODE_OVERLAP_THRESHOLD,
          previousDocumentId: previousParsedGraph?.documentId,
          previousNodeIds: previousParsedGraph?.nodeIds ?? [],
        })
      ) {
        manuallyMovedNodesSet.current.clear();
        cachedNodesMap.current.clear();
        const hasNodesToPlace = currentNodeIds.size > 0;
        optionsChangeRef.current({ autoFitView: true });
        snapFitPendingRef.current = hasNodesToPlace;
        setIsPlacing(hasNodesToPlace);
      } else {
        manuallyMovedNodesSet.current = new Set(
          [...manuallyMovedNodesSet.current].filter((nodeId) => currentNodeIds.has(nodeId))
        );
        cachedNodesMap.current = new Map(
          [...cachedNodesMap.current.entries()].filter(([nodeId]) => currentNodeIds.has(nodeId))
        );
      }

      previousParsedGraphRef.current = {
        documentId,
        nodeIds: currentNodeIds,
      };

      const updatedNodes = reuseCachedNodes(parsedNodes, cachedNodesMap.current);

      autoLayoutRunId.current += 1;

      if (layoutInFlightRef.current) {
        layoutRequestedRef.current = true;
      }

      setNodes(updatedNodes);
      setEdges(parsedEdges);

      if (shouldRetryLayout) {
        scheduleAutoLayout();
      }
    }, [documentId, graphStore, parsedEdges, parsedNodes, scheduleAutoLayout, setEdges, setNodes]);

    const previousEdges = useRef<ModelEdge[]>(edges);
    useLayoutEffect(() => {
      let needsAutoLayout = false;
      if (previousEdges.current.length !== edges.length) {
        needsAutoLayout = true;
        previousEdges.current = edges;
      } else if (nodes.length === cachedNodesMap.current.size) {
        for (const node of nodes) {
          const previousNode = cachedNodesMap.current.get(node.id);
          if (
            !previousNode ||
            (previousNode?.measured?.width && node.measured?.width !== previousNode.measured.width) ||
            (previousNode?.measured?.height && node.measured?.height !== previousNode.measured.height)
          ) {
            needsAutoLayout = true;
            break;
          }
        }
      } else {
        needsAutoLayout = true;
      }

      cachedNodesMap.current = new Map(nodes.map((node) => [node.id, node]));

      if (needsAutoLayout) {
        scheduleAutoLayout();
        return;
      }

      const hasCurrentGraph =
        edges.length === parsedEdges.length &&
        edges.every((edge, index) => isSameModelEdge(edge, parsedEdges[index])) &&
        nodes.length === parsedNodes.length &&
        nodes.every(
          (node, index) =>
            node.id === parsedNodes[index].id && node.data.model === parsedNodes[index].data.model
        );
      const hasPendingLayout =
        layoutInFlightRef.current ||
        layoutRequestedRef.current ||
        isLayoutScheduledRef.current ||
        layoutFrameRef.current !== null;
      const hasPlacedNodes = nodes.every(
        (node) => node.measured?.width && node.measured?.height && !isUnplacedNode(node)
      );
      const isLayoutReady =
        hasCurrentGraph &&
        hasPlacedNodes &&
        !hasPendingLayout &&
        graphStore.state.layoutStatus.status !== "error";
      if (isLayoutReady) {
        graphStore.state.layoutStatus = { status: "ready" };
      }
    }, [completedLayoutRunId, edges, graphStore, nodes, parsedEdges, parsedNodes, scheduleAutoLayout]);

    useEffect(() => {
      if (!snapFitPendingRef.current) return;
      if (nodes.length === 0 || nodes.some(isUnplacedNode)) return;

      snapFitPendingRef.current = false;
      fitView({ ...fitViewOptions, duration: 0 }).then(() => setIsPlacing(false));
    }, [fitView, fitViewOptions, nodes]);

    const areNodesInitialized = useNodesInitialized();
    useEffect(() => {
      if (!areNodesInitialized) return;

      scheduleAutoLayout();
    }, [areNodesInitialized, documentId, scheduleAutoLayout]);

    const previousModels = useRef<Map<string, Model>>(new Map());
    const previousModelEdgeHashMap = useRef<Map<string, string>>(new Map());
    useEffect(() => {
      const modelsMap = new Map(models.map((model) => [model.id, model]));
      const staleNodeIds = new Set<string>();

      for (const model of models) {
        const previousModel = previousModels.current.get(model.id);
        if (!previousModel) continue;

        const previousDependantsHash = previousModel.dependants.map((curr) => curr.id).join(":");
        const currentDependantsHash = model.dependants.map((curr) => curr.id).join(":");
        const previousDependenciesHash = previousModel.dependencies.map((curr) => curr.id).join(":");
        const currentDependenciesHash = model.dependencies.map((curr) => curr.id).join(":");
        const hasChangedRelations =
          previousDependantsHash !== currentDependantsHash ||
          previousDependenciesHash !== currentDependenciesHash;
        if (!hasChangedRelations) continue;

        staleNodeIds.add(model.id);
      }

      previousModels.current = modelsMap;

      const currentEdges = getEdges();
      const modelEdgesMap = new Map<Model, ModelEdge[]>();
      const modelEdgeHashMap = new Map<string, string>();

      for (const edge of currentEdges) {
        const sourceModel = modelsMap.get(edge.source);
        if (sourceModel) {
          const sourceEdges = modelEdgesMap.get(sourceModel) ?? [];
          sourceEdges.push(edge);
          modelEdgesMap.set(sourceModel, sourceEdges);
        }

        const targetModel = modelsMap.get(edge.target);
        if (targetModel) {
          const targetEdges = modelEdgesMap.get(targetModel) ?? [];
          targetEdges.push(edge);
          modelEdgesMap.set(targetModel, targetEdges);
        }
      }

      for (const [currentModel, currentModelEdges] of modelEdgesMap.entries()) {
        const hash = currentModelEdges.map((edge) => edge.id).join(":");
        modelEdgeHashMap.set(currentModel.id, hash);
      }

      for (const [modelId, hash] of modelEdgeHashMap.entries()) {
        const previousHash = previousModelEdgeHashMap.current.get(modelId);
        if (previousHash === hash) continue;

        staleNodeIds.add(modelId);
      }

      previousModelEdgeHashMap.current = modelEdgeHashMap;

      if (staleNodeIds.size === 0) return;

      updateNodeInternals([...staleNodeIds]);
    }, [getEdges, models, updateNodeInternals]);

    const handleAutoFitToggle = useCallback(() => {
      onOptionsChange({ autoFitView: !options.autoFitView });
    }, [onOptionsChange, options.autoFitView]);

    const handleDirectionToggle = useCallback(() => {
      onOptionsChange({
        direction: options.direction === "horizontal" ? "vertical" : "horizontal",
        autoFitView: true,
      });
    }, [onOptionsChange, options.direction]);

    const handleMouseDown = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target && panelRef.current?.contains(event.target as HTMLElement)) return;

        if (options.autoFitView) {
          onOptionsChange({ autoFitView: false });
        }
      },
      [onOptionsChange, options.autoFitView]
    );

    const pointerPanZoomRef = useRef<number | null>(null);

    const handleMoveStart = useCallback(
      (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
        pointerPanZoomRef.current =
          event?.type === "mousedown" || event?.type === "touchstart" ? viewport.zoom : null;
        containerRef.current?.classList.add("renderer-moving");
      },
      [containerRef]
    );

    const handleMoveEnd = useCallback(() => {
      pointerPanZoomRef.current = null;
      containerRef.current?.classList.remove("renderer-moving");
    }, [containerRef]);

    const handleMove = useCallback(
      (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
        if (event instanceof WheelEvent && options.autoFitView) {
          onOptionsChange({ autoFitView: false });
        }

        const isPointerPan = event instanceof MouseEvent || event instanceof TouchEvent;
        if (!isPointerPan || pointerPanZoomRef.current !== viewport.zoom) return;

        const x = snapToDevicePixel(viewport.x);
        const y = snapToDevicePixel(viewport.y);
        if (x === viewport.x && y === viewport.y) return;

        reactFlowStore.getState().panZoom?.syncViewport({ x, y, zoom: viewport.zoom });
        reactFlowStore.setState({ transform: [x, y, viewport.zoom] });
      },
      [onOptionsChange, options.autoFitView, reactFlowStore]
    );

    const handleNodeDragStop = useCallback((_event: MouseEvent | TouchEvent, node: ModelNodeState) => {
      manuallyMovedNodesSet.current.add(node.id);
    }, []);

    const handleNodeMouseEnter = useCallback(
      (_event: React.MouseEvent, node: ModelNodeState) => {
        graphStore.state.hoveredNode = node;
      },
      [graphStore]
    );

    const handleNodeMouseLeave = useCallback(() => {
      graphStore.state.hoveredNode = null;
    }, [graphStore]);

    const handleNodeClick = useCallback(
      (_event: React.MouseEvent, node: ModelNodeState) => {
        graphStore.state.selectedNode = node;
      },
      [graphStore]
    );

    const handleEdgeClick = useCallback(
      (_event: React.MouseEvent, edge: ModelEdge) => {
        graphStore.state.selectedEdge = edge;
      },
      [graphStore]
    );

    const handlePaneClick = useCallback(() => {
      graphStore.state.selectedNode = null;
      graphStore.state.selectedEdge = null;
    }, [graphStore]);

    useEffect(() => {
      setShouldAnimate(true);
    }, []);

    const previousViewportRevisionRef = useRef(viewportRevision);
    useEffect(() => {
      if (previousViewportRevisionRef.current === viewportRevision) return;

      previousViewportRevisionRef.current = viewportRevision;
      requestIdleCallback(() => fitView(fitViewOptions));
    }, [fitView, fitViewOptions, viewportRevision]);

    const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);
    const isLoading = isParsing || isPlacing;
    const shouldShowParseError = !isLoading && processingStatus.status === "error";
    const isEmpty = !isLoading && processingStatus.status === "ready" && models.length === 0;

    return (
      <div
        ref={containerRef}
        className={classNames("tsdiagram relative flex h-full w-full flex-1 bg-canvas", {
          "renderer-loading": isLoading,
        })}
      >
        {isLoading && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 text-ui text-text-muted"
            role="status"
          >
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading diagram…
          </div>
        )}
        {shouldShowParseError && (
          <div
            className={classNames("pointer-events-none absolute inset-0 z-10 flex justify-center p-6", {
              "items-center": models.length === 0,
              "items-start pt-16": models.length > 0,
            })}
          >
            <div
              className="pointer-events-auto max-h-full max-w-xl overflow-auto rounded-lg border border-border bg-pane p-4 shadow-(--shadow-card)"
              role="alert"
            >
              <p className="text-title font-strong text-error">Could not parse TypeScript</p>
              {models.length > 0 && (
                <p className="mt-1 text-ui text-text">Showing the last successful diagram.</p>
              )}
              <p className="mt-1 text-ui break-words text-text-muted">{processingStatus.message}</p>
            </div>
          </div>
        )}
        {isEmpty && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center"
            role="status"
          >
            <ComponentNoneIcon className="mb-3 size-8 text-text-faint" />
            <p className="text-title font-strong text-text">
              {isSourceEmpty ? "This document is empty" : "No supported declarations found"}
            </p>
            <p className="mt-1 text-ui text-text-muted">
              Declare an interface, type alias, class, enum, or function in the editor.
            </p>
          </div>
        )}
        <EdgeRoutingProvider>
          <PortColorsContext.Provider value={portColors}>
            <ReactFlow
              className={options.theme === "dark" ? "theme-dark" : undefined}
              autoPanOnNodeDrag={false}
              deleteKeyCode={null}
              panActivationKeyCode={null}
              edgeTypes={edgeTypes}
              edges={edges}
              maxZoom={2}
              minZoom={0.1}
              nodeTypes={nodeTypes}
              nodes={nodes}
              nodesConnectable={false}
              proOptions={proOptions}
              elevateEdgesOnSelect
              elevateNodesOnSelect
              onEdgesChange={onEdgesChange}
              onInit={handleAutoLayoutRequest}
              onMouseDownCapture={handleMouseDown}
              onMove={handleMove}
              onMoveEnd={handleMoveEnd}
              onMoveStart={handleMoveStart}
              onEdgeClick={handleEdgeClick}
              onNodeClick={handleNodeClick}
              onNodeDragStop={handleNodeDragStop}
              onNodeMouseEnter={handleNodeMouseEnter}
              onNodeMouseLeave={handleNodeMouseLeave}
              onNodesChange={onNodesChange}
              onPaneClick={handlePaneClick}
            >
              <Panel position="top-center">
                <div
                  ref={panelRef}
                  className="mt-1 flex flex-nowrap items-center gap-0.5 whitespace-nowrap rounded-lg border border-border bg-pane p-0.5 text-text-muted shadow-(--shadow-card)"
                >
                  <button
                    className={classNames(
                      "flex h-7 items-center gap-1.5 rounded-control px-2 text-ui font-medium transition-[color,background-color] duration-(--duration-hover) ease-out active:duration-(--duration-instant) [&_svg]:size-3.5",
                      options.autoFitView
                        ? "bg-selection text-text hover:bg-selection-hover"
                        : "hover:bg-control-hover hover:text-text"
                    )}
                    onClick={handleAutoFitToggle}
                  >
                    <TransformIcon />
                    <span>Auto-fit</span>
                  </button>

                  <span className="h-4 w-px bg-border" />

                  <button
                    className="flex h-7 items-center gap-1.5 rounded-control px-2 text-ui font-medium transition-[color,background-color] duration-(--duration-hover) ease-out hover:bg-control-hover hover:text-text active:duration-(--duration-instant) [&_svg]:size-3.5"
                    onClick={handleDirectionToggle}
                  >
                    <span>Orientation:</span>{" "}
                    {options.direction === "vertical" ? <HeightIcon /> : <WidthIcon />}
                  </button>
                </div>
              </Panel>

              <Panel position="top-right">
                <div className="flex flex-nowrap whitespace-nowrap">
                  <button
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    className="flex size-8 items-center justify-center rounded-lg border border-border bg-pane text-text-muted shadow-(--shadow-card) transition-[color,background-color,border-color] duration-(--duration-hover) ease-out hover:border-border-strong hover:bg-control-hover hover:text-text active:duration-(--duration-instant)"
                    onClick={toggleFullscreen}
                  >
                    {isFullscreen ? (
                      <ExitFullScreenIcon height={16} width={16} />
                    ) : (
                      <EnterFullScreenIcon height={16} width={16} />
                    )}
                  </button>
                </div>
              </Panel>

              <Controls className="renderer-controls" />

              {!disableMiniMap && options.enableMinimap && (
                <MiniMap
                  bgColor="var(--color-pane)"
                  className="overflow-hidden rounded-lg border border-border shadow-(--shadow-card)"
                  maskColor="var(--color-border)"
                  nodeColor="var(--color-border-strong)"
                  style={minimapStyle}
                  zoomStep={1}
                  pannable
                  zoomable
                />
              )}
              {!isLowDetail && (
                <Background
                  color="color-mix(in oklab, var(--color-border-strong) 80%, transparent)"
                  gap={12}
                  size={1}
                  variant={BackgroundVariant.Dots}
                />
              )}
            </ReactFlow>
          </PortColorsContext.Provider>
        </EdgeRoutingProvider>
      </div>
    );
  }
);
