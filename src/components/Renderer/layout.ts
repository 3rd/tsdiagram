import Elk, { ElkNode, LayoutOptions } from "elkjs";
import { Edge, Node } from "reactflow";
import {
  isArraySchemaField,
  isFunctionSchemaField,
  isGenericSchemaField,
  isUnionSchemaField,
  Model,
} from "../../lib/parser/ModelParser";

export const LAYOUT_RESET_NODE_OVERLAP_THRESHOLD = 0.7;
export const LAYOUT_RESET_NODE_COUNT_CHANGE_THRESHOLD = 0.25;

export type LayoutDirection = "horizontal" | "vertical";
export type LayoutPreset = "legacy" | "fresh" | "anchored";
export type ModelNodeState = Node<{ model: Model }>;

type LayoutEdgeKind =
  | "dependency"
  | "extends"
  | "field"
  | "field-array"
  | "field-function-arg"
  | "field-function-return"
  | "field-generic"
  | "field-union"
  | "implements";

export type ModelEdgeData = {
  layoutKind: LayoutEdgeKind;
  rerouteEpoch?: number;
};

export type ModelEdge = Edge<ModelEdgeData>;

type SharedModelEdgeProps = Omit<Partial<ModelEdge>, "data">;

type CreateModelEdgeArgs = {
  id: string;
  layoutKind: LayoutEdgeKind;
  source: string;
  sourceHandle?: string;
  target: string;
};

type LayoutMetricsRelationship = {
  euclideanDistance: number;
  horizontalDistance: number;
  manhattanDistance: number;
  source: string;
  target: string;
  verticalDistance: number;
};

type GetLayoutMetricsArgs = {
  edges: Pick<ModelEdge, "source" | "target">[];
  nodes: Pick<ModelNodeState, "height" | "id" | "position" | "width">[];
};

type ShouldResetLayoutAnchorsArgs = {
  countChangeThreshold?: number;
  nextDocumentId: string;
  nextNodeIds: Iterable<string>;
  overlapThreshold?: number;
  previousDocumentId?: string;
  previousNodeIds: Iterable<string>;
};

type LayoutModelNodesArgs = {
  direction: LayoutDirection;
  edges: ModelEdge[];
  manuallyMovedNodesSet: Set<string>;
  nodes: ModelNodeState[];
  preset?: LayoutPreset;
};

const createModelEdge = ({
  id,
  layoutKind,
  source,
  sourceHandle,
  target,
}: CreateModelEdgeArgs): ModelEdge => ({
  data: { layoutKind },
  id,
  source,
  ...(sourceHandle ? { sourceHandle } : {}),
  target,
});

const requireLayoutKind = (edge: ModelEdge) => {
  const layoutKind = edge.data?.layoutKind;
  if (!layoutKind) throw new Error(`Missing layoutKind for edge: ${edge.id}`);
  return layoutKind;
};

export const extractModelNodes = (models: Model[]): ModelNodeState[] => {
  return models.map((model) => ({
    data: { model },
    id: model.id,
    position: { x: -1, y: -1 },
    type: "model",
  }));
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export const extractModelEdges = (models: Model[]): ModelEdge[] => {
  const result: ModelEdge[] = [];

  let count = 1;
  for (const model of models) {
    if (model.type === "interface") {
      for (const extended of model.extends) {
        if (extended instanceof Object) {
          result.push(
            createModelEdge({
              id: `${count++}-${model.id}-${extended.id}`,
              layoutKind: "extends",
              source: model.id,
              target: extended.id,
            })
          );
        }
      }
    }

    if (model.type === "typeAlias") {
      for (const dependency of model.dependencies) {
        result.push(
          createModelEdge({
            id: `${count++}-${model.id}-${dependency.id}`,
            layoutKind: "dependency",
            source: model.id,
            target: dependency.id,
          })
        );
      }
    }

    if (model.type === "class") {
      if (model.extends instanceof Object) {
        result.push(
          createModelEdge({
            id: `${count++}-${model.id}-${model.extends.id}`,
            layoutKind: "extends",
            source: model.id,
            target: model.extends.id,
          })
        );
      }

      for (const implemented of model.implements) {
        if (implemented instanceof Object) {
          result.push(
            createModelEdge({
              id: `${count++}-${model.id}-${implemented.id}`,
              layoutKind: "implements",
              source: model.id,
              target: implemented.id,
            })
          );
        }
      }
    }

    for (const field of model.schema) {
      if (field.type instanceof Object) {
        result.push(
          createModelEdge({
            id: `${count++}-${model.id}-${field.name}`,
            layoutKind: "field",
            source: model.id,
            sourceHandle: `${model.id}-source-${field.name}`,
            target: field.type.id,
          })
        );
      }

      if (isArraySchemaField(field) && field.elementType instanceof Object) {
        result.push(
          createModelEdge({
            id: `${count++}-${model.id}-${field.name}`,
            layoutKind: "field-array",
            source: model.id,
            sourceHandle: `${model.id}-source-${field.name}`,
            target: field.elementType.id,
          })
        );
      }

      if (isGenericSchemaField(field)) {
        for (const argument of field.arguments) {
          if (argument instanceof Object) {
            result.push(
              createModelEdge({
                id: `${count++}-${model.id}-${field.name}-${argument.id}`,
                layoutKind: "field-generic",
                source: model.id,
                sourceHandle: `${model.id}-source-${field.name}`,
                target: argument.id,
              })
            );
          }
        }
      }

      if (isFunctionSchemaField(field)) {
        for (const argument of field.arguments) {
          if (argument.type instanceof Object) {
            result.push(
              createModelEdge({
                id: `${count++}-${model.id}-${field.name}-arg-${argument.type.id}`,
                layoutKind: "field-function-arg",
                source: model.id,
                sourceHandle: `${model.id}-source-${field.name}`,
                target: argument.type.id,
              })
            );
          }
        }

        if (Array.isArray(field.returnType)) {
          const returnType = field.returnType[0];
          if (returnType instanceof Object) {
            result.push(
              createModelEdge({
                id: `${count++}-${model.id}-${field.name}-${returnType.id}`,
                layoutKind: "field-function-return",
                source: model.id,
                sourceHandle: `${model.id}-source-${field.name}`,
                target: returnType.id,
              })
            );
          }
        } else if (field.returnType instanceof Object) {
          result.push(
            createModelEdge({
              id: `${count++}-${model.id}-${field.name}-${field.returnType.id}`,
              layoutKind: "field-function-return",
              source: model.id,
              sourceHandle: `${model.id}-source-${field.name}`,
              target: field.returnType.id,
            })
          );
        }
      }

      if (isUnionSchemaField(field)) {
        for (const unionType of field.types) {
          if (unionType instanceof Object) {
            result.push(
              createModelEdge({
                id: `${count++}-${model.id}-${field.name}-${unionType.id}`,
                layoutKind: "field-union",
                source: model.id,
                sourceHandle: `${model.id}-source-${field.name}`,
                target: unionType.id,
              })
            );
          }
        }
      }
    }
  }
  return result;
};

export const decorateModelEdges = (
  edges: ModelEdge[],
  sharedEdgeProps: SharedModelEdgeProps = {}
): ModelEdge[] => {
  return edges.map((edge) => ({
    ...edge,
    ...sharedEdgeProps,
    data: {
      ...edge.data,
      layoutKind: requireLayoutKind(edge),
    },
  }));
};

export const bumpModelEdgeRerouteEpoch = (edges: ModelEdge[]): ModelEdge[] => {
  return edges.map((edge) => ({
    ...edge,
    data: {
      ...edge.data,
      layoutKind: requireLayoutKind(edge),
      rerouteEpoch: (edge.data?.rerouteEpoch ?? 0) + 1,
    },
  }));
};

const getLayoutEdgePriority = (edge: ModelEdge) => {
  let priority = 0;
  if (edge.data?.layoutKind !== "dependency") priority += 1;
  if (edge.sourceHandle) priority += 2;
  return priority;
};

export const normalizeLayoutEdges = (edges: ModelEdge[]): ModelEdge[] => {
  const edgesByPair = new Map<
    string,
    {
      edge: ModelEdge;
      firstIndex: number;
      priority: number;
    }
  >();

  edges.forEach((edge, index) => {
    const key = `${edge.source}=>${edge.target}`;
    const priority = getLayoutEdgePriority(edge);
    const existing = edgesByPair.get(key);

    if (!existing) {
      edgesByPair.set(key, { edge, firstIndex: index, priority });
      return;
    }

    if (priority > existing.priority) {
      edgesByPair.set(key, { edge, firstIndex: existing.firstIndex, priority });
    }
  });

  return Array.from(edgesByPair.values())
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map(({ edge }) => edge);
};

const getLayoutOptions = (direction: LayoutDirection, preset: LayoutPreset): LayoutOptions => {
  if (preset === "legacy") {
    return {
      "elk.algorithm": "layered",
      "elk.direction": direction === "horizontal" ? "RIGHT" : "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.insideSelfLoops.activate": "false",
      "elk.interactiveLayout": "true",
      "elk.layered.crossingMinimization.semiInteractive": "true",
      "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
      "elk.layered.nodePlacement.strategy": "LINEAR_SEGMENTS",
      "elk.layered.spacing.edgeNodeBetweenLayers": "25",
      "elk.layered.spacing.nodeNodeBetweenLayers": "50",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": "100",
      "elk.spacing.nodeNode": "50",
    };
  }

  const compactOptions: LayoutOptions = {
    "elk.algorithm": "layered",
    "elk.direction": direction === "horizontal" ? "RIGHT" : "DOWN",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.insideSelfLoops.activate": "false",
    "elk.layered.nodePlacement.strategy": "LINEAR_SEGMENTS",
    "elk.layered.spacing.edgeNodeBetweenLayers": "12",
    "elk.layered.spacing.nodeNodeBetweenLayers": "24",
    "elk.spacing.componentComponent": "48",
    "elk.spacing.nodeNode": "24",
  };

  if (preset === "anchored") {
    return {
      ...compactOptions,
      "elk.interactiveLayout": "true",
      "elk.layered.crossingMinimization.semiInteractive": "true",
      "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
      "elk.layered.layering.strategy": "INTERACTIVE",
      "elk.separateConnectedComponents": "false",
    };
  }

  return {
    ...compactOptions,
    "elk.interactiveLayout": "false",
    "elk.layered.crossingMinimization.semiInteractive": "false",
    "elk.layered.cycleBreaking.strategy": "GREEDY",
    "elk.separateConnectedComponents": "true",
  };
};

export const getLayoutPreset = (manuallyMovedNodesSet: Set<string>): LayoutPreset => {
  return manuallyMovedNodesSet.size > 0 ? "anchored" : "fresh";
};

export const layoutModelNodes = async ({
  direction,
  edges,
  manuallyMovedNodesSet,
  nodes,
  preset,
}: LayoutModelNodesArgs): Promise<ModelNodeState[]> => {
  const resolvedPreset = preset ?? getLayoutPreset(manuallyMovedNodesSet);
  const elkOptions = getLayoutOptions(direction, resolvedPreset);
  const elk = new Elk({
    defaultLayoutOptions: elkOptions,
  });

  const graph: ElkNode = {
    children: nodes.map((node) => {
      const isPinned = manuallyMovedNodesSet.has(node.id);

      return {
        height: node.height ?? 0,
        id: node.id,
        ports: node.data.model.schema.map((field, index) => ({
          id: `${node.id}-source-${field.name}`,
          order: index,
          properties: {
            "port.side": "EAST",
          },
        })),
        ...(resolvedPreset === "anchored" && isPinned
          ? {
              x: node.position.x,
              y: node.position.y,
            }
          : {}),
        width: node.width ?? 0,
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceHandle ?? edge.source],
      targets: [edge.target],
    })),
    id: "root",
    layoutOptions: elkOptions,
  };

  const layoutedGraph = await elk.layout(graph);
  const layoutedNodesMap = new Map(layoutedGraph.children?.map((node) => [node.id, node]) ?? []);

  return nodes.map((node) => {
    const layoutedNode = layoutedNodesMap.get(node.id);
    if (!layoutedNode) return node;

    const isPinned = resolvedPreset === "anchored" && manuallyMovedNodesSet.has(node.id);
    const width = layoutedNode.width ?? node.width;
    const height = layoutedNode.height ?? node.height;

    return {
      ...node,
      ...(typeof height === "number" ? { height } : {}),
      position: {
        x: isPinned ? node.position.x : layoutedNode.x ?? node.position.x,
        y: isPinned ? node.position.y : layoutedNode.y ?? node.position.y,
      },
      ...(typeof width === "number" ? { width } : {}),
    };
  });
};

const toNodeIdSet = (nodeIds: Iterable<string>) => new Set(nodeIds);

export const getNodeIdOverlapRatio = (previousNodeIds: Iterable<string>, nextNodeIds: Iterable<string>) => {
  const previousNodeIdSet = toNodeIdSet(previousNodeIds);
  const nextNodeIdSet = toNodeIdSet(nextNodeIds);
  const denominator = Math.max(previousNodeIdSet.size, nextNodeIdSet.size);
  if (denominator === 0) return 1;

  let overlapCount = 0;
  for (const nodeId of nextNodeIdSet) {
    if (previousNodeIdSet.has(nodeId)) overlapCount += 1;
  }

  return overlapCount / denominator;
};

export const getNodeCountChangeRatio = (previousNodeIds: Iterable<string>, nextNodeIds: Iterable<string>) => {
  const previousNodeIdSet = toNodeIdSet(previousNodeIds);
  const nextNodeIdSet = toNodeIdSet(nextNodeIds);
  const denominator = Math.max(previousNodeIdSet.size, nextNodeIdSet.size);
  if (denominator === 0) return 0;
  return Math.abs(previousNodeIdSet.size - nextNodeIdSet.size) / denominator;
};

export const shouldResetLayoutAnchors = ({
  countChangeThreshold = LAYOUT_RESET_NODE_COUNT_CHANGE_THRESHOLD,
  nextDocumentId,
  nextNodeIds,
  overlapThreshold = LAYOUT_RESET_NODE_OVERLAP_THRESHOLD,
  previousDocumentId,
  previousNodeIds,
}: ShouldResetLayoutAnchorsArgs) => {
  if (!previousDocumentId) return false;
  if (previousDocumentId !== nextDocumentId) return true;

  if (getNodeIdOverlapRatio(previousNodeIds, nextNodeIds) < overlapThreshold) return true;
  if (getNodeCountChangeRatio(previousNodeIds, nextNodeIds) > countChangeThreshold) return true;

  return false;
};

const getMedian = (values: number[]) => {
  if (values.length === 0) return 0;
  const sortedValues = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[middleIndex];
  return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
};

export const getLayoutMetrics = ({ edges, nodes }: GetLayoutMetricsArgs) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const relationships: LayoutMetricsRelationship[] = [];
  for (const edge of edges) {
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourceWidth = sourceNode.width ?? 0;
    const sourceHeight = sourceNode.height ?? 0;
    const targetWidth = targetNode.width ?? 0;
    const targetHeight = targetNode.height ?? 0;
    const horizontalDistance =
      targetNode.position.x + targetWidth / 2 - (sourceNode.position.x + sourceWidth / 2);
    const verticalDistance =
      targetNode.position.y + targetHeight / 2 - (sourceNode.position.y + sourceHeight / 2);

    relationships.push({
      euclideanDistance: Math.hypot(horizontalDistance, verticalDistance),
      horizontalDistance: Math.abs(horizontalDistance),
      manhattanDistance: Math.abs(horizontalDistance) + Math.abs(verticalDistance),
      source: edge.source,
      target: edge.target,
      verticalDistance: Math.abs(verticalDistance),
    });
  }

  const manhattanDistances = relationships.map((relationship) => relationship.manhattanDistance);
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + (node.width ?? 0)));
  const maxY = Math.max(...nodes.map((node) => node.position.y + (node.height ?? 0)));

  return {
    averageManhattanDistance:
      manhattanDistances.reduce((sum, value) => sum + value, 0) / Math.max(manhattanDistances.length, 1),
    edgeCount: relationships.length,
    height: maxY - minY,
    medianManhattanDistance: getMedian(manhattanDistances),
    relationships,
    width: maxX - minX,
  };
};
