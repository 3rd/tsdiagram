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
} from "reactflow";
import { SmartStepEdge } from "@tisoap/react-flow-smart-edge";
import Elk from "elkjs";
import isEqual from "lodash/isEqual";
import "reactflow/dist/style.css";

import { Model, ModelParser } from "../../lib/parser/ModelParser";
import { ModelNode } from "./ModelNode";

const nodeTypes = {
  model: ModelNode,
};

const edgeTypes = {
  smart: SmartStepEdge,
};

const elkOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "80",
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.layered.spacing": "50",
  "elk.layered.mergeEdges": "false",
  "elk.spacing": "50",
  "elk.spacing.individual": "50",
  // "elk.edgeRouting": "POLYLINE",
  "elk.edgeRouting": "ORTHOGONAL",
  // experiments
  "elk.insideSelfLoops.activate": "false",
  "elk.spacing.edgeEdge": "50",
};

const elk = new Elk({
  defaultLayoutOptions: elkOptions,
});

const getLayoutedElements = async (nodes: Node[], edges: Edge[], options: Record<string, string> = {}) => {
  const isHorizontal = options?.["elk.direction"] === "RIGHT";
  const graph = {
    id: "root",
    layoutOptions: options,
    children: nodes.map((node) => {
      return {
        ...node,
        targetPosition: isHorizontal ? "left" : "top",
        sourcePosition: isHorizontal ? "right" : "bottom",
        width: node.width ?? 0,
        height: node.height ?? 0,
      };
    }),
    edges: edges.map((edge) => {
      return {
        ...edge,
        sources: [edge.source],
        targets: [edge.target],
      };
    }),
  };
  const layoutedGraph = await elk.layout(graph);
  return {
    nodes: nodes.map((node) => {
      const layoutedNode = layoutedGraph.children?.find((n) => n.id === node.id);
      const clone = { ...node };
      clone.position = { x: layoutedNode?.x ?? clone.position.x, y: layoutedNode?.y ?? clone.position.y };
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

  const parser = useRef<ModelParser>(new ModelParser(source));
  const models = useMemo(() => {
    parser.current.setSource(source);
    return parser.current.getModels();
  }, [source]);
  const parsedNodes = useMemo(() => extractModelNodes(models), [models]);
  const parsedEdges = useMemo(() => extractModelEdges(models), [models]);

  // console.log({ parsedNodes, parsedEdges });

  // auto layout
  const handleAutoLayout = useCallback(() => {
    getLayoutedElements(getNodes(), getEdges(), elkOptions).then(
      ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        requestAnimationFrame(() => fitView());
      }
    );
  }, [fitView, getEdges, getNodes, setEdges, setNodes]);
  const handleInit = useCallback(handleAutoLayout, [handleAutoLayout]);

  // update nodes and edges
  useLayoutEffect(() => {
    const updatedNodes = parsedNodes.map((node) => {
      const cachedNode = cachedNodesMap.current.get(node.id);
      if (cachedNode) {
        if (cachedNode.type === node.type && isEqual(cachedNode.data?.model, node.data.model)) {
          console.log("cached node", node.id, cachedNode);
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
      <Controls />
      <MiniMap />
      <Background gap={12} size={1} variant={BackgroundVariant.Dots} />
    </ReactFlow>
  );
};
