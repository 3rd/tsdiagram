import { useEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  MarkerType,
  MiniMap,
  useEdgesState,
  useNodesState,
} from "reactflow";
import { SmartStepEdge } from "@tisoap/react-flow-smart-edge";
import "reactflow/dist/style.css";

import { ModelParser } from "../../lib/parser/ModelParser";
import { ModelNode } from "./ModelNode";

const nodeTypes = {
  model: ModelNode,
};

const edgeTypes = {
  smart: SmartStepEdge,
};

export type RendererProps = {
  source: string;
};

export const Renderer = ({ source }: RendererProps) => {
  const parser = useRef<ModelParser>(new ModelParser(source));

  const models = useMemo(() => {
    parser.current.setSource(source);
    return parser.current.getModels();
  }, [source]);

  const parsedNodes = useMemo(() => {
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
  }, [models]);

  const parsedEdges = useMemo(() => {
    const result: Edge[] = [];

    const sharedEdgeProps = {
      type: "smart",
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
  }, [models]);

  console.log({ parsedNodes, parsedEdges });

  const [nodes, setNodes, onNodesChange] = useNodesState(parsedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsedEdges);

  useEffect(() => {
    setNodes(parsedNodes);
    setEdges(parsedEdges);
  }, [parsedEdges, parsedNodes, setEdges, setNodes]);

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
      onNodesChange={onNodesChange}
    >
      <Controls />
      <MiniMap />
      <Background gap={12} size={1} variant={BackgroundVariant.Dots} />
    </ReactFlow>
  );
};
