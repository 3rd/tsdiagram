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
import "../../reactflow.css";

import throttle from "lodash/throttle";
import { useFullscreen } from "../../hooks/useFullscreen";
import { Model } from "../../lib/parser/model-types";
import { graphStore } from "../../stores/graph";
import { optionsStore, useUserOptions } from "../../stores/user-options";
import { computeBadgeHubIds, EMPTY_BADGE_HUB_IDS } from "./badge-hubs";
import { CustomEdge, selectLowDetail } from "./CustomEdge";
import { arePortColorsEqual, assignEdgeColors, EDGE_COLOR_PALETTES, EMPTY_PORT_COLORS } from "./edge-colors";
import { EdgeRoutingProvider } from "./EdgeRoutingProvider";
import {
  decorateModelEdges,
  extractModelEdges,
  extractModelNodes,
  isUnplacedNode,
  LAYOUT_RESET_NODE_COUNT_CHANGE_THRESHOLD,
  LAYOUT_RESET_NODE_OVERLAP_THRESHOLD,
  layoutModelNodes,
  ModelEdge,
  ModelNodeState,
  normalizeLayoutEdges,
  shouldResetLayoutAnchors,
} from "./layout";
import { ModelNode } from "./ModelNode";
import { PortColorsContext } from "./port-colors";

const AUTO_LAYOUT_THROTTLE_MS = 120;

// a composited layer is not re-rasterized while it moves, so a pan must advance in whole
// device pixels or its text is resampled at a fractional offset until the layer is dropped
const snapToDevicePixel = (value: number) => Math.round(value * devicePixelRatio) / devicePixelRatio;

const nodeTypes = { model: ModelNode };
const edgeTypes = { custom: CustomEdge };
const proOptions = { hideAttribution: true };
const minimapStyle = { opacity: 0.9 };

export type RendererProps = {
  documentId: string;
  models: Model[];
  isParsing: boolean;
  disableMiniMap?: boolean;
};

export const Renderer = memo(({ documentId, models, isParsing, disableMiniMap }: RendererProps) => {
  const { fitView, getNodes, getEdges } = useReactFlow<ModelNodeState, ModelEdge>();
  const reactFlowStore = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  const [nodes, setNodes, onNodesChange] = useNodesState<ModelNodeState>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ModelEdge>([]);
  const cachedNodesMap = useRef<Map<string, ModelNodeState>>(new Map());
  const manuallyMovedNodesSet = useRef<Set<string>>(new Set());
  const autoLayoutRunId = useRef(0);
  const snapFitPendingRef = useRef(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const previousParsedGraphRef = useRef<
    | {
        documentId: string;
        nodeIds: Set<string>;
      }
    | undefined
  >(undefined);
  const options = useUserOptions();
  const lowDetail = useStore(selectLowDetail);
  const previousBadgeHubIdsRef = useRef<{ documentId: string; ids: ReadonlySet<string> } | undefined>(
    undefined
  );
  const badgeHubIds = useMemo(() => {
    const previousBadgeHubIds =
      previousBadgeHubIdsRef.current?.documentId === documentId
        ? previousBadgeHubIdsRef.current.ids
        : EMPTY_BADGE_HUB_IDS;
    return options.renderer.badgeHubs ? computeBadgeHubIds(models, previousBadgeHubIds) : EMPTY_BADGE_HUB_IDS;
  }, [documentId, models, options.renderer.badgeHubs]);
  useEffect(() => {
    previousBadgeHubIdsRef.current = { documentId, ids: badgeHubIds };
  }, [badgeHubIds, documentId]);
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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
      if (!currentNode) graphStore.state.hoveredNode = null;
      else if (currentNode.data.model !== hoveredNode.data.model) graphStore.state.hoveredNode = currentNode;
    }
    if (selectedNode) {
      const currentNode = parsedNodes.find((node) => node.id === selectedNode.id);
      if (!currentNode) graphStore.state.selectedNode = null;
      else if (currentNode.data.model !== selectedNode.data.model) {
        graphStore.state.selectedNode = currentNode;
      }
    }
  }, [parsedNodes]);
  useEffect(() => {
    const { selectedEdge } = graphStore.state;
    if (selectedEdge && !modelEdges.some((edge) => edge.id === selectedEdge.id)) {
      graphStore.state.selectedEdge = null;
    }
  }, [modelEdges]);
  useEffect(() => {
    graphStore.state.hoveredNode = null;
    graphStore.state.selectedNode = null;
    graphStore.state.selectedEdge = null;
  }, [documentId]);
  const edgeColors = useMemo(
    () =>
      options.renderer.colorizeEdges
        ? assignEdgeColors(modelEdges, EDGE_COLOR_PALETTES[options.renderer.theme])
        : null,
    [modelEdges, options.renderer.colorizeEdges, options.renderer.theme]
  );
  // ports read this through context; an unchanged map keeps its identity so they skip rendering
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
      const isUnchanged =
        previousEdge &&
        previousEdge.source === edge.source &&
        previousEdge.target === edge.target &&
        previousEdge.sourceHandle === edge.sourceHandle &&
        previousEdge.style === edge.style &&
        previousEdge.markerEnd === edge.markerEnd &&
        previousEdge.markerStart === edge.markerStart &&
        previousEdge.type === edge.type &&
        previousEdge.data?.layoutKind === edge.data?.layoutKind;
      return isUnchanged ? previousEdge : edge;
    });
    previousParsedEdgesRef.current = new Map(reused.map((edge) => [edge.id, edge]));
    return reused;
  }, [edgeColors, getEdgeColorProps, modelEdges, sharedEdgeProps]);

  const layoutInFlightRef = useRef(false);
  const layoutRequestedRef = useRef(false);
  const handleAutoLayout = useMemo(() => {
    return throttle(
      () => {
        if (layoutInFlightRef.current) {
          layoutRequestedRef.current = true;
          return;
        }
        const currentNodes = getNodes();
        if (currentNodes.length === 0) return;
        const currentEdges = normalizeLayoutEdges(getEdges());
        const hasSizeForAllNodes = currentNodes.every(
          (node) => node.measured?.width && node.measured?.height
        );
        if (!hasSizeForAllNodes) return;
        const currentRunId = ++autoLayoutRunId.current;
        layoutInFlightRef.current = true;

        layoutModelNodes({
          compact: options.renderer.compactLayout,
          direction: options.renderer.direction,
          edges: currentEdges,
          manuallyMovedNodesSet: manuallyMovedNodesSet.current,
          nodes: currentNodes,
        })
          .then((layoutedNodes) => {
            if (currentRunId !== autoLayoutRunId.current) return;

            setNodes(layoutedNodes);

            if (options.renderer.autoFitView && !snapFitPendingRef.current) {
              requestIdleCallback(() => fitView(fitViewOptions));
            }
          })
          .catch((error: unknown) => {
            if (currentRunId !== autoLayoutRunId.current) return;
            setIsPlacing(false);
            console.error(error);
          })
          .finally(() => {
            layoutInFlightRef.current = false;
            if (!layoutRequestedRef.current) return;
            layoutRequestedRef.current = false;
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
    options.renderer.autoFitView,
    options.renderer.compactLayout,
    options.renderer.direction,
    setNodes,
  ]);

  const handleAutoLayoutRef = useRef(handleAutoLayout);
  useEffect(() => {
    handleAutoLayoutRef.current = handleAutoLayout;
  }, [handleAutoLayout]);

  useEffect(() => {
    return () => {
      handleAutoLayout.cancel();
    };
  }, [handleAutoLayout]);

  const previousCompactLayoutRef = useRef(options.renderer.compactLayout);
  useEffect(() => {
    if (previousCompactLayoutRef.current === options.renderer.compactLayout) return;
    previousCompactLayoutRef.current = options.renderer.compactLayout;
    handleAutoLayoutRef.current();
  }, [options.renderer.compactLayout]);

  // update nodes and edges after parsing (before auto layout)
  useLayoutEffect(() => {
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
      optionsStore.state.renderer.autoFitView = true;
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

    const hitCachedNodeSet = new Set<ModelNodeState>();
    const nodesThatMissedCache: ModelNodeState[] = [];

    const updatedNodes = parsedNodes.map((node) => {
      const cachedNode = cachedNodesMap.current.get(node.id);
      if (cachedNode) {
        hitCachedNodeSet.add(cachedNode);
        if (
          cachedNode.data.model === node.data.model &&
          cachedNode.data.badgeHubIds === node.data.badgeHubIds
        ) {
          return cachedNode;
        }
        if (cachedNode.measured?.width && cachedNode.measured?.height) {
          return {
            ...node,
            measured: cachedNode.measured,
            position: cachedNode.position,
          };
        }
        return { ...node, position: cachedNode.position };
      }
      nodesThatMissedCache.push(node);
      return node;
    });

    // if there's a single node that missed the cache and a single cache miss we're probably editing a node's name
    if (nodesThatMissedCache.length === 1 && hitCachedNodeSet.size === cachedNodesMap.current.size - 1) {
      const missedCachedNode = [...cachedNodesMap.current.values()].find(
        (cachedNode) => !hitCachedNodeSet.has(cachedNode)
      );
      const updatedNode = nodesThatMissedCache.values().next().value;

      if (!missedCachedNode) throw new Error("missedCachedNode not found");
      if (!updatedNode) throw new Error("updatedNode not found");

      updatedNode.position = missedCachedNode.position;
    }

    autoLayoutRunId.current += 1;
    setNodes(updatedNodes);
    setEdges(parsedEdges);
  }, [documentId, parsedEdges, parsedNodes, setEdges, setNodes]);

  // cache computed nodes and trigger auto layout if their width or height changed
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
    if (needsAutoLayout) requestAnimationFrame(handleAutoLayout);
  }, [handleAutoLayout, nodes, edges]);

  useEffect(() => {
    if (!snapFitPendingRef.current) return;
    if (nodes.length === 0 || nodes.some(isUnplacedNode)) return;
    snapFitPendingRef.current = false;
    fitView({ ...fitViewOptions, duration: 0 }).then(() => setIsPlacing(false));
  }, [fitView, fitViewOptions, nodes]);

  const nodesAreInitialized = useNodesInitialized();
  useEffect(() => {
    if (!nodesAreInitialized) return;
    const frame = requestAnimationFrame(() => handleAutoLayoutRef.current());
    return () => cancelAnimationFrame(frame);
  }, [nodesAreInitialized, documentId]);

  // update node internals when node dependencies or edges change
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
      if (
        previousDependantsHash !== currentDependantsHash ||
        previousDependenciesHash !== currentDependenciesHash
      ) {
        staleNodeIds.add(model.id);
      }
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
      if (previousHash !== hash) staleNodeIds.add(modelId);
    }
    previousModelEdgeHashMap.current = modelEdgeHashMap;
    if (staleNodeIds.size > 0) updateNodeInternals([...staleNodeIds]);
  }, [getEdges, models, updateNodeInternals]);

  const handleAutoFitToggle = useCallback(() => {
    options.renderer.autoFitView = !options.renderer.autoFitView;
    handleAutoLayout();
  }, [handleAutoLayout, options.renderer]);

  const handleDirectionToggle = useCallback(() => {
    options.renderer.direction = options.renderer.direction === "horizontal" ? "vertical" : "horizontal";
    options.renderer.autoFitView = true;
    options.save();
    manuallyMovedNodesSet.current.clear();
    handleAutoLayout();
  }, [handleAutoLayout, options]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target && panelRef.current?.contains(event.target as HTMLElement)) return;
      if (options.renderer.autoFitView) options.renderer.autoFitView = false;
    },
    [options.renderer]
  );
  const pointerPanZoomRef = useRef<number | null>(null);
  const handleMoveStart = useCallback((event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    pointerPanZoomRef.current =
      event?.type === "mousedown" || event?.type === "touchstart" ? viewport.zoom : null;
    containerRef.current?.classList.add("renderer-moving");
  }, []);
  const handleMoveEnd = useCallback(() => {
    pointerPanZoomRef.current = null;
    containerRef.current?.classList.remove("renderer-moving");
  }, []);
  const handleMove = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (event instanceof WheelEvent && options.renderer.autoFitView) {
        options.renderer.autoFitView = false;
      }
      const isPointerPan = event instanceof MouseEvent || event instanceof TouchEvent;
      if (!isPointerPan || pointerPanZoomRef.current !== viewport.zoom) return;
      const x = snapToDevicePixel(viewport.x);
      const y = snapToDevicePixel(viewport.y);
      if (x === viewport.x && y === viewport.y) return;
      // the same two writes React Flow makes for a controlled viewport, without the
      // per-frame re-render of this component that the viewport prop would cost
      reactFlowStore.getState().panZoom?.syncViewport({ x, y, zoom: viewport.zoom });
      reactFlowStore.setState({ transform: [x, y, viewport.zoom] });
    },
    [options.renderer, reactFlowStore]
  );
  const handleNodeDragStop = useCallback((_event: MouseEvent | TouchEvent, node: ModelNodeState) => {
    manuallyMovedNodesSet.current.add(node.id);
  }, []);
  const handleNodeMouseEnter = useCallback((_event: React.MouseEvent, node: ModelNodeState) => {
    graphStore.state.hoveredNode = node;
  }, []);
  const handleNodeMouseLeave = useCallback(() => {
    graphStore.state.hoveredNode = null;
  }, []);
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: ModelNodeState) => {
    graphStore.state.selectedNode = node;
  }, []);
  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: ModelEdge) => {
    graphStore.state.selectedEdge = edge;
  }, []);
  const handlePaneClick = useCallback(() => {
    graphStore.state.selectedNode = null;
    graphStore.state.selectedEdge = null;
  }, []);

  useEffect(() => {
    setShouldAnimate(true);
  }, []);

  const previousPanelDirection = useRef(options.panels.splitDirection);
  useEffect(() => {
    if (previousPanelDirection.current === options.panels.splitDirection) return;
    previousPanelDirection.current = options.panels.splitDirection;
    requestIdleCallback(() => fitView(fitViewOptions));
  }, [fitView, fitViewOptions, options.panels.splitDirection, options.renderer]);

  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);
  const isLoading = isParsing || isPlacing;
  const isEmpty = !isLoading && models.length === 0;

  return (
    <div
      ref={containerRef}
      className={classNames("relative flex h-full w-full flex-1 bg-canvas", {
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
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
          <ComponentNoneIcon className="mb-3 size-8 text-text-faint" />
          <p className="text-title font-strong text-text">No types to diagram</p>
          <p className="mt-1 text-ui text-text-muted">
            Declare an interface, type alias, or class in the editor.
          </p>
        </div>
      )}
      <EdgeRoutingProvider>
        <PortColorsContext.Provider value={portColors}>
          <ReactFlow
            className={options.renderer.theme === "dark" ? "theme-dark" : undefined}
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
            onInit={handleAutoLayout}
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
                    options.renderer.autoFitView
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
                  {options.renderer.direction === "vertical" ? <HeightIcon /> : <WidthIcon />}
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

            {!disableMiniMap && options.renderer.enableMinimap && (
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
            {!lowDetail && (
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
});
