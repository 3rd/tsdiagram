/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  EnterFullScreenIcon,
  ExitFullScreenIcon,
  HeightIcon,
  TransformIcon,
  WidthIcon,
} from "@radix-ui/react-icons";
import { SmartStepEdge } from "@tisoap/react-flow-smart-edge";
import classNames from "classnames";
import throttle from "lodash/throttle";
import "../../reactflow.css";

import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  FitViewOptions,
  MarkerType,
  MiniMap,
  Node,
  Panel,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
} from "reactflow";
import { useFullscreen } from "../../hooks/useFullscreen";
import { Model } from "../../lib/parser/ModelParser";
import { graphStore } from "../../stores/graph";
import { useUserOptions } from "../../stores/user-options";
import { CustomEdge } from "./CustomEdge";
import {
  bumpModelEdgeRerouteEpoch,
  decorateModelEdges,
  extractModelEdges,
  extractModelNodes,
  layoutModelNodes,
  LAYOUT_RESET_NODE_COUNT_CHANGE_THRESHOLD,
  LAYOUT_RESET_NODE_OVERLAP_THRESHOLD,
  ModelEdge,
  ModelEdgeData,
  shouldResetLayoutAnchors,
  normalizeLayoutEdges,
} from "./layout";
import { ModelNode } from "./ModelNode";

const AUTO_LAYOUT_THROTTLE_MS = 120;

const nodeTypes = { model: ModelNode };
const edgeTypes = { smart: SmartStepEdge, custom: CustomEdge };
const proOptions = { hideAttribution: true };

export type RendererProps = {
  documentId: string;
  models: Model[];
  disableMiniMap?: boolean;
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export const Renderer = memo(({ documentId, models, disableMiniMap }: RendererProps) => {
  const { fitView, getNodes, getEdges } = useReactFlow<{ model: Model }, ModelEdgeData>();
  const updateNodeInternals = useUpdateNodeInternals();
  const [nodes, setNodes, onNodesChange] = useNodesState<{ model: Model }>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ModelEdgeData>([]);
  const cachedNodesMap = useRef<Map<string, Node<{ model: Model }>>>(new Map());
  const manuallyMovedNodesSet = useRef<Set<string>>(new Set());
  const autoLayoutRunId = useRef(0);
  const previousParsedGraphRef = useRef<{
    documentId: string;
    nodeIds: Set<string>;
  }>();
  const options = useUserOptions();
  const panelRef = useRef<HTMLDivElement>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  // computed reactflow props
  const fitViewOptions: FitViewOptions = useMemo(
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
        stroke: options.renderer.theme === "light" ? "#a9b2bc" : "#7f8084",
        strokeWidth: 1,
        markerEndId: "arrow",
      },
      // type: "smoothstep",
      // type: "smart",
      // animated: true,
    }),
    [options.renderer.theme]
  );
  const backgroundForeground = useMemo(() => {
    if (options.renderer.theme === "dark") return "#7f8084";
    return "#a9b2bc";
  }, [options.renderer.theme]);

  // parse source
  const parsedNodes = useMemo(() => extractModelNodes(models), [models]);
  const modelEdges = useMemo(() => extractModelEdges(models), [models]);
  const parsedEdges = useMemo(
    () => decorateModelEdges(modelEdges, sharedEdgeProps),
    [modelEdges, sharedEdgeProps]
  );

  const bumpEdgeRerouteEpoch = useCallback(() => {
    setEdges((currentEdges) => bumpModelEdgeRerouteEpoch(currentEdges));
  }, [setEdges]);

  // auto layout
  const handleAutoLayout = useMemo(() => {
    return throttle(
      () => {
        const currentNodes = getNodes();
        const currentEdges = normalizeLayoutEdges(getEdges() as ModelEdge[]);
        const hasSizeForAllNodes = currentNodes.every((node) => node.width && node.height);
        if (!hasSizeForAllNodes) return;
        const currentRunId = ++autoLayoutRunId.current;

        void layoutModelNodes({
          direction: options.renderer.direction,
          edges: currentEdges,
          manuallyMovedNodesSet: manuallyMovedNodesSet.current,
          nodes: currentNodes,
        })
          .then((layoutedNodes) => {
            if (currentRunId !== autoLayoutRunId.current) return;

            setNodes(layoutedNodes);
            requestAnimationFrame(() => {
              if (currentRunId !== autoLayoutRunId.current) return;
              bumpEdgeRerouteEpoch();
            });

            if (options.renderer.autoFitView) {
              requestIdleCallback(() => fitView(fitViewOptions));
            }
          })
          .catch((error) => {
            if (currentRunId !== autoLayoutRunId.current) return;
            console.error(error);
          });
      },
      AUTO_LAYOUT_THROTTLE_MS,
      { leading: true, trailing: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bumpEdgeRerouteEpoch,
    fitView,
    fitViewOptions,
    getEdges,
    getNodes,
    options.renderer.autoFitView,
    options.renderer.direction,
  ]);
  const handleInit = useCallback(handleAutoLayout, [handleAutoLayout]);

  useEffect(() => {
    return () => {
      handleAutoLayout.cancel();
    };
  }, [handleAutoLayout]);

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

    const hitCachedNodeSet = new Set<Node<{ model: Model }>>();
    const nodesThatMissedCache: Node<{ model: Model }>[] = [];

    const updatedNodes = parsedNodes.map((node) => {
      const cachedNode = cachedNodesMap.current.get(node.id);
      if (cachedNode) {
        hitCachedNodeSet.add(cachedNode);
        // console.log({ node, cachedNode });
        if (cachedNode.width && cachedNode.height) {
          return {
            ...node,
            width: cachedNode.width,
            height: cachedNode.height,
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
      const cachedNodesSet = new Set(cachedNodesMap.current.values());
      const missedCachedNode = [...cachedNodesSet].find((cachedNode) => !hitCachedNodeSet.has(cachedNode));
      const updatedNode = nodesThatMissedCache.values().next().value;

      if (!missedCachedNode) throw new Error("missedCachedNode not found");
      if (!updatedNode) throw new Error("updatedNode not found");

      // updatedNode.width = missedCachedNode.width;
      // updatedNode.height = missedCachedNode.height;
      updatedNode.position = missedCachedNode.position;
    }

    autoLayoutRunId.current += 1;
    setNodes(updatedNodes);
    setEdges(parsedEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, parsedEdges, parsedNodes]);

  // cache computed nodes and trigger auto layout if their width or height changed
  const previousEdges = useRef<ModelEdge[]>(edges);
  useLayoutEffect(() => {
    let needsAutoLayout = false;
    if (previousEdges.current.length !== edges.length) {
      // console.log("needsAutoLayout 1", { previousEdges: previousEdges.current, edges });
      needsAutoLayout = true;
      previousEdges.current = edges;
    } else if (nodes.length === cachedNodesMap.current.size) {
      for (const node of nodes) {
        const previousNode = cachedNodesMap.current.get(node.id);
        if (
          !previousNode ||
          (previousNode?.width && node.width !== previousNode.width) ||
          (previousNode?.height && node.height !== previousNode.height)
        ) {
          // console.log("needsAutoLayout 2", { node, previousNode });
          needsAutoLayout = true;
          break;
        }
      }
    } else {
      // console.log("needsAutoLayout 3", { nodes, cachedNodesMap: cachedNodesMap.current });
      needsAutoLayout = true;
    }
    cachedNodesMap.current = new Map(nodes.map((node) => [node.id, node]));
    if (needsAutoLayout) requestAnimationFrame(handleAutoLayout);
  }, [handleAutoLayout, nodes, edges]);

  // trigger auto layout after nodes are sized
  const nodesAreInitialized = useNodesInitialized();
  useEffect(() => {
    if (!nodesAreInitialized) return;
    requestAnimationFrame(handleAutoLayout);
  }, [handleAutoLayout, nodesAreInitialized]);

  // update node internals when node dependencies or edges change
  const previousModels = useRef<Map<string, Model>>(new Map());
  const previousModelEdgeHashMap = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const modelsMap = new Map(models.map((model) => [model.id, model]));
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
        updateNodeInternals(model.id);
      }
    }
    previousModels.current = modelsMap;

    const currentEdges = getEdges();
    const modelEdgesMap = new Map<Model, ModelEdge[]>();
    const modelEdgeHashMap = new Map<string, string>();

    for (const edge of currentEdges) {
      const sourceModel = modelsMap.get(edge.source);
      if (sourceModel) {
        const modelEdges = modelEdgesMap.get(sourceModel) ?? [];
        modelEdges.push(edge);
        modelEdgesMap.set(sourceModel, modelEdges);
      }
      const targetModel = modelsMap.get(edge.target);
      if (targetModel) {
        const modelEdges = modelEdgesMap.get(targetModel) ?? [];
        modelEdges.push(edge);
        modelEdgesMap.set(targetModel, modelEdges);
      }
    }

    for (const [currentModel, currentModelEdges] of modelEdgesMap.entries()) {
      const hash = currentModelEdges.map((edge) => edge.id).join(":");
      modelEdgeHashMap.set(currentModel.id, hash);
    }

    for (const [modelId, hash] of modelEdgeHashMap.entries()) {
      const previousHash = previousModelEdgeHashMap.current.get(modelId);
      if (previousHash !== hash) {
        updateNodeInternals(modelId);
      }
    }
    previousModelEdgeHashMap.current = modelEdgeHashMap;
  }, [getEdges, models, updateNodeInternals]);

  // option handlers
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

  // interaction handlers
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target && panelRef.current?.contains(event.target as HTMLElement)) return;
      options.renderer.autoFitView = false;
    },
    [options.renderer]
  );
  const handleMove = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (event instanceof WheelEvent) {
        options.renderer.autoFitView = false;
      }
    },
    [options.renderer]
  );
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      manuallyMovedNodesSet.current.add(node.id);

      // Edges connected to the dragged node rerender live via updated edge props. Force a
      // single full reroute after drop so the rest of the graph catches up without paying
      // that cost on every pointer move.
      requestAnimationFrame(() => {
        bumpEdgeRerouteEpoch();
      });
    },
    [bumpEdgeRerouteEpoch]
  );
  const handleNodeMouseEnter = useCallback((_event: React.MouseEvent, node: Node) => {
    graphStore.state.hoveredNode = node;
  }, []);
  const handleNodeMouseLeave = useCallback(() => {
    graphStore.state.hoveredNode = null;
  }, []);

  // enable animation after the initial render
  useEffect(() => {
    setShouldAnimate(true);
  }, []);

  // auto fit when the panel direction changes
  const previousPanelDirection = useRef(options.panels.splitDirection);
  useEffect(() => {
    if (previousPanelDirection.current === options.panels.splitDirection) return;
    previousPanelDirection.current = options.panels.splitDirection;
    requestIdleCallback(() => fitView(fitViewOptions));
  }, [fitView, fitViewOptions, options.panels.splitDirection, options.renderer]);

  // fullscreen
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);

  return (
    <div
      ref={containerRef}
      className={classNames("flex flex-1 w-full h-full", {
        "bg-gray-50": options.renderer.theme === "light",
        "bg-stone-800": options.renderer.theme === "dark",
      })}
    >
      <ReactFlow
        autoPanOnNodeDrag={false}
        deleteKeyCode={null}
        edgeTypes={edgeTypes}
        edges={edges}
        fitViewOptions={fitViewOptions}
        maxZoom={2}
        minZoom={0.1}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        proOptions={proOptions}
        elevateEdgesOnSelect
        elevateNodesOnSelect
        fitView
        onEdgesChange={onEdgesChange}
        onInit={handleInit}
        onMouseDownCapture={handleMouseDown}
        onMove={handleMove}
        onNodeDragStop={handleNodeDragStop}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodesChange={onNodesChange}
      >
        {/* main panel */}
        <Panel position="top-center">
          <div
            ref={panelRef}
            className={classNames(
              "flex flex-nowrap bg-opacity-90 overflow-hidden rounded-md shadow-md text-gray-800 whitespace-nowrap mt-0.5",
              {
                "bg-gray-50": options.renderer.theme === "light",
                "bg-stone-50": options.renderer.theme === "dark",
              }
            )}
          >
            {/* auto-fit */}
            <button
              className={classNames(
                "flex items-center gap-1 py-0.5 px-2 text-sm border-r border-stone-300",
                options.renderer.autoFitView ? "text-blue-600" : "hover:text-stone-500"
              )}
              onClick={handleAutoFitToggle}
            >
              <TransformIcon />
              <span>Auto-fit</span>
            </button>

            {/* direction: vertical | horizontal */}
            <button className="flex gap-1 items-center py-0.5 px-2 text-sm" onClick={handleDirectionToggle}>
              <span>Orientation:</span>{" "}
              {options.renderer.direction === "vertical" ? <HeightIcon /> : <WidthIcon />}
            </button>
          </div>
        </Panel>

        {/* top right panel */}
        <Panel position="top-right">
          <div
            className={classNames("flex flex-nowrap overflow-hidden text-gray-800 whitespace-nowrap rounded")}
          >
            {/* fullscreen */}
            <button
              className={classNames("flex gap-1 items-center p-0.5 text-sm", {
                "text-gray-600 hover:text-blue-600": options.renderer.theme === "light",
                "text-gray-500 hover:text-white": options.renderer.theme === "dark",
              })}
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <ExitFullScreenIcon height={18} width={18} />
              ) : (
                <EnterFullScreenIcon height={18} width={18} />
              )}
            </button>
          </div>
        </Panel>

        <Controls
          className={classNames("rounded overflow-hidden bg-opacity-90", {
            "bg-gray-50": options.renderer.theme === "light",
            "bg-stone-100": options.renderer.theme === "dark",
          })}
        />

        {/* TODO: refactor */}
        {!disableMiniMap && options.renderer.enableMinimap && (
          <MiniMap
            maskColor={backgroundForeground}
            style={{
              opacity: 0.9,
            }}
            zoomStep={1}
            pannable
            zoomable
          />
        )}
        <Background color={backgroundForeground} gap={12} size={1} variant={BackgroundVariant.Dots} />
      </ReactFlow>
    </div>
  );
});
