import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Node,
  MarkerType,
  MiniMap,
  useEdgesState,
  useNodesState,
  useReactFlow,
  Panel,
  FitViewOptions,
} from "reactflow";
import classNames from "classnames";
import { SmartStepEdge } from "@tisoap/react-flow-smart-edge";
import Elk, { ElkNode, LayoutOptions } from "elkjs";
import isEqual from "lodash/isEqual";
import omit from "lodash/omit";
import "reactflow/dist/style.css";

import { Model, ModelParser } from "../../lib/parser/ModelParser";
import { ModelNode } from "./ModelNode";
import { useOptions, UserOptions } from "../../store";

const nodeTypes = {
  model: ModelNode,
};

const edgeTypes = {
  smart: SmartStepEdge,
};

const proOptions = {
  hideAttribution: true,
};

type GetLayoutedElementsArgs = {
  nodes: Node[];
  edges: Edge[];
  options: UserOptions;
  manuallyMovedNodesSet: Set<string>;
};
const getLayoutedElements = async ({
  nodes,
  edges,
  options,
  manuallyMovedNodesSet,
}: GetLayoutedElementsArgs) => {
  const elkOptions: LayoutOptions = {
    "elk.algorithm": "layered",
    "elk.direction": options.renderer.direction === "horizontal" ? "RIGHT" : "DOWN",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.insideSelfLoops.activate": "false",
    "elk.interactiveLayout": "true",
    "elk.layered.crossingMinimization.semiInteractive": "true",
    "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
    "elk.layered.layering.strategy": "INTERACTIVE",
    "elk.layered.nodePlacement.strategy": "INTERACTIVE",
    "elk.layered.spacing.edgeNodeBetweenLayers": "30",
    "elk.layered.spacing.nodeNodeBetweenLayers": "50",
    "elk.spacing.nodeNode": "50",
  };

  const elk = new Elk({
    defaultLayoutOptions: elkOptions,
  });

  const graph: ElkNode = {
    id: "root",
    layoutOptions: elkOptions,
    children: nodes.map((node) => {
      const wasManuallyMoved = manuallyMovedNodesSet.has(node.id);

      return {
        ...node,
        width: node.width ?? 0,
        height: node.height ?? 0,
        ports: node.data?.model?.schema.map((field: Model["schema"][0], index: number) => {
          return {
            id: `${node.id}-${field.name}`,
            order: index,
            properties: {
              "port.side": "EAST",
            },
          };
        }),
        ...(wasManuallyMoved && {
          x: node.position.x,
          y: node.position.y,
        }),
      };
    }),
    edges: edges.map((edge) => {
      return {
        ...edge,
        sources: [edge.sourceHandle ?? edge.source],
        targets: [edge.target],
      };
    }),
  };
  // console.log(
  //   "getLayoutedElements",
  //   graph.children!.map((child) => {
  //     return {
  //       id: child.id,
  //       width: child.width,
  //       height: child.height,
  //       layoutOptions: child.layoutOptions,
  //       x: child.x,
  //       y: child.y,
  //     };
  //   })
  // );

  const layoutedGraph = await elk.layout(graph);
  // console.log("layoutedGraph", layoutedGraph);

  return {
    nodes: nodes.map((node) => {
      const layoutedNode = layoutedGraph.children?.find((n) => n.id === node.id);
      if (!layoutedNode) return node;
      const clone = omit(node, ["width", "height"]);
      const hasManuallyMoved = manuallyMovedNodesSet.has(node.id);
      return {
        ...clone,
        position: {
          x: hasManuallyMoved ? node.position.x : layoutedNode.x ?? clone.position.x,
          y: hasManuallyMoved ? node.position.y : layoutedNode.y ?? clone.position.y,
        },
        ...(layoutedNode.width &&
          layoutedNode.height && {
            width: layoutedNode.width,
            height: layoutedNode.height,
          }),
      };
    }),
    edges,
  };
};

const extractModelNodes = (models: Model[]) => {
  return models.map((model) => {
    return {
      id: model.id,
      type: "model",
      position: { x: -1, y: -1 },
      data: { model },
    };
  });
};

const extractModelEdges = (models: Model[]) => {
  const result: Edge[] = [];

  const sharedEdgeProps = {
    // type: "smoothstep",
    type: "smart",
    markerEnd: { type: MarkerType.ArrowClosed },
    // animated: true,
  };

  for (const model of models) {
    for (const field of model.schema) {
      // direct model reference
      if (field.type instanceof Object) {
        result.push({
          ...sharedEdgeProps,
          id: `${model.id}-${field.name}`,
          source: model.id,
          target: field.type.id,
          sourceHandle: `${model.id}-${field.name}`,
        });
      }
      // array of model references
      if (field.type === "array" && "elementType" in field && field.elementType instanceof Object) {
        result.push({
          ...sharedEdgeProps,
          id: `${model.id}-${field.name}`,
          source: model.id,
          target: field.elementType.id,
          sourceHandle: `${model.id}-${field.name}`,
        });
      }
      // map of model references
      if (field.type === "map" && "keyType" in field && "valueType" in field) {
        if (field.valueType instanceof Object) {
          result.push({
            ...sharedEdgeProps,
            id: `${model.id}-${field.name}`,
            source: model.id,
            target: field.valueType.id,
            sourceHandle: `${model.id}-${field.name}`,
          });
        }
        if (field.keyType instanceof Object) {
          result.push({
            ...sharedEdgeProps,
            id: `${model.id}-${field.name}`,
            source: model.id,
            target: field.keyType.id,
            sourceHandle: `${model.id}-${field.name}`,
          });
        }
      }
    }
  }
  return result;
};

export type RendererProps = {
  source: string;
};

export const Renderer = ({ source }: RendererProps) => {
  const { fitView, getNodes, getEdges } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const cachedNodesMap = useRef<Map<string, Node>>(new Map());
  const manuallyMovedNodesSet = useRef<Set<string>>(new Set());
  const options = useOptions();
  const panelRef = useRef<HTMLDivElement>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  // computed reactflow props
  const fitViewOptions: FitViewOptions = useMemo(
    () => ({
      padding: options.renderer.direction === "horizontal" ? 0.15 : 0.5,
      duration: shouldAnimate ? 500 : 0,
    }),
    [options.renderer.direction, shouldAnimate]
  );

  // auto layout
  const handleAutoLayout = useCallback(() => {
    getLayoutedElements({
      nodes: getNodes(),
      edges: getEdges(),
      options,
      manuallyMovedNodesSet: manuallyMovedNodesSet.current,
    }).then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      if (options.renderer.autoFitView) {
        // FIXME: flicker when changing orientation
        requestIdleCallback(() => fitView(fitViewOptions));
      }
    });
  }, [fitView, fitViewOptions, getEdges, getNodes, options, setEdges, setNodes]);
  const handleInit = useCallback(handleAutoLayout, [handleAutoLayout]);

  // parse source
  const parser = useRef<ModelParser>(new ModelParser(source));
  const models = useMemo(() => {
    parser.current.setSource(source);
    return parser.current.getModels();
  }, [source]);
  const parsedNodes = useMemo(() => extractModelNodes(models), [models]);
  const parsedEdges = useMemo(() => extractModelEdges(models), [models]);

  // console.log({ parsedNodes, parsedEdges });

  // update nodes and edges after parsing
  useLayoutEffect(() => {
    const updatedNodes = parsedNodes.map((node) => {
      const cachedNode = cachedNodesMap.current.get(node.id);
      if (cachedNode) {
        if (
          cachedNode.type === node.type &&
          isEqual(cachedNode.data?.model, node.data.model) &&
          cachedNode.width &&
          cachedNode.height
        ) {
          return cachedNode;
        }
        return {
          ...node,
          data: { ...node.data },
          position: cachedNode.position,
        };
      }
      return node;
    });
    setNodes(updatedNodes);
    setEdges(parsedEdges);
    requestAnimationFrame(handleAutoLayout);
  }, [handleAutoLayout, parsedEdges, parsedNodes, setEdges, setNodes]);

  // cache computed nodes
  useLayoutEffect(() => {
    cachedNodesMap.current = new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  // option handlers
  const handleAutoFitToggle = useCallback(() => {
    options.renderer.autoFitView = !options.renderer.autoFitView;
    handleAutoLayout();
  }, [handleAutoLayout, options.renderer]);

  const handleDirectionToggle = useCallback(() => {
    options.renderer.direction = options.renderer.direction === "horizontal" ? "vertical" : "horizontal";
    options.renderer.autoFitView = true;
    handleAutoLayout();
  }, [handleAutoLayout, options.renderer]);

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
  const handleNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    manuallyMovedNodesSet.current.add(node.id);
  }, []);

  // enable animation after the initial render
  useEffect(() => {
    setShouldAnimate(true);
  }, []);

  return (
    <ReactFlow
      autoPanOnNodeDrag={false}
      deleteKeyCode={null}
      edgeTypes={edgeTypes}
      edges={edges}
      fitViewOptions={fitViewOptions}
      maxZoom={1.5}
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
      onNodesChange={onNodesChange}
    >
      <Panel position="top-center">
        <div ref={panelRef} className="overflow-hidden bg-white rounded-md shadow-md text-stone-600">
          {/* auto-fit */}
          <button
            className={classNames(
              "py-0.5 px-2 text-sm border-r",
              options.renderer.autoFitView ? "text-blue-600" : "hover:text-stone-500"
            )}
            onClick={handleAutoFitToggle}
          >
            🪄 Auto-fit
          </button>
          {/* direction: vertical | horizontal */}
          <button className={classNames("py-0.5 px-2 text-sm ")} onClick={handleDirectionToggle}>
            Orientation: {options.renderer.direction === "vertical" ? "↕" : "↔"}
          </button>
        </div>
      </Panel>
      <Controls />
      <MiniMap
        style={{
          opacity: 0.9,
        }}
        zoomStep={1}
        pannable
        zoomable
      />
      <Background gap={12} size={1} variant={BackgroundVariant.Dots} />
    </ReactFlow>
  );
};
