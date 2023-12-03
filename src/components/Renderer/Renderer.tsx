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
} from "reactflow";
import classNames from "classnames";
import { SmartStepEdge } from "@tisoap/react-flow-smart-edge";
import Elk, { LayoutOptions } from "elkjs";
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

const getLayoutedElements = async (nodes: Node[], edges: Edge[], options: UserOptions) => {
  const elkOptions: LayoutOptions = {
    "elk.algorithm": "layered",
    "elk.direction": options.renderer.direction === "horizontal" ? "RIGHT" : "DOWN",
    "elk.spacing.nodeNode": "30",
    "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    "elk.layered.mergeEdges": "false",
    "elk.edgeRouting": "ORTHOGONAL",
    // experiments
    "elk.insideSelfLoops.activate": "false",
  };
  const isHorizontal = options.renderer.direction === "horizontal";

  const elk = new Elk({
    defaultLayoutOptions: elkOptions,
  });

  const graph = {
    id: "root",
    layoutOptions: elkOptions,
    children: nodes.map((node) => {
      return {
        ...node,
        targetPosition: isHorizontal ? "left" : "top",
        sourcePosition: isHorizontal ? "right" : "bottom",
        width: node.width ?? 0,
        height: node.height ?? 0,
        ports: node.data?.model?.schema.map((field: Model["schema"][0], index: number) => {
          return {
            id: `${node.id}-${field.name}`,
            order: index,
          };
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

  const layoutedGraph = await elk.layout(graph);
  // console.log("getLayoutedElements", { nodes, edges, layoutedGraph });

  return {
    nodes: nodes.map((node) => {
      const layoutedNode = layoutedGraph.children?.find((n) => n.id === node.id);
      if (!layoutedNode) return node;
      const clone = omit(node, ["width", "height"]);
      clone.position = { x: layoutedNode?.x ?? clone.position.x, y: layoutedNode?.y ?? clone.position.y };
      if (layoutedNode.width && layoutedNode.height) {
        return { ...clone, width: layoutedNode.width, height: layoutedNode.height };
      }
      return clone;
    }),
    edges,
  };
};

const extractModelNodes = (models: Model[]) => {
  let x = 0;
  let y = 0;
  return models.map((model) => {
    return {
      id: model.id,
      type: "model",
      position: { x: (x += 100), y: (y += 100) },
      data: { model },
    };
  });
};

const extractModelEdges = (models: Model[]) => {
  const result: Edge[] = [];

  const sharedEdgeProps = {
    type: "smoothstep",
    // type: "smart",
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
  const options = useOptions();

  const parser = useRef<ModelParser>(new ModelParser(source));
  const models = useMemo(() => {
    parser.current.setSource(source);
    return parser.current.getModels();
  }, [source]);
  const parsedNodes = useMemo(() => extractModelNodes(models), [models]);
  const parsedEdges = useMemo(() => extractModelEdges(models), [models]);

  console.log({ parsedNodes, parsedEdges });

  // auto layout
  const handleAutoLayout = useCallback(() => {
    getLayoutedElements(getNodes(), getEdges(), options).then(
      ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        if (options.renderer.autoFitView) requestAnimationFrame(() => fitView());
      }
    );
  }, [fitView, getEdges, getNodes, options, setEdges, setNodes]);
  const handleInit = useCallback(handleAutoLayout, [handleAutoLayout]);

  // update nodes and edges
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
        return { ...node, position: cachedNode.position };
      }
      return node;
    });
    setNodes(updatedNodes);
    setEdges(parsedEdges);
    requestAnimationFrame(handleAutoLayout);
  }, [handleAutoLayout, parsedEdges, parsedNodes, setEdges, setNodes]);

  // cache nodes
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
    handleAutoLayout();
  }, [handleAutoLayout, options.renderer]);

  return (
    <ReactFlow
      attributionPosition="top-right"
      edgeTypes={edgeTypes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodes={nodes}
      proOptions={{ hideAttribution: true }}
      fitView
      onEdgesChange={onEdgesChange}
      onInit={handleInit}
      onNodesChange={onNodesChange}
    >
      <Panel className="overflow-hidden bg-white rounded-md shadow-md text-stone-600" position="top-center">
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
