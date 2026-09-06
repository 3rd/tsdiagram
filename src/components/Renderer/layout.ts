import { Edge, Node } from "@xyflow/react";
import ElkConstructor, { ELK, ElkNode, LayoutOptions } from "elkjs/lib/elk-api";
import {
  isArraySchemaField,
  isFunctionSchemaField,
  isGenericSchemaField,
  isUnionSchemaField,
  Model,
  TypeAliasModel,
} from "../../lib/parser/model-types";
import { EMPTY_BADGE_HUB_IDS } from "./badge-hubs";

export const LAYOUT_RESET_NODE_OVERLAP_THRESHOLD = 0.7;
export const LAYOUT_RESET_NODE_COUNT_CHANGE_THRESHOLD = 0.25;

let elk: ELK | null = null;
const getElk = () => {
  elk ??= new ElkConstructor({
    workerFactory: () => new Worker(new URL("./elk.worker.ts", import.meta.url), { type: "module" }),
  });
  return elk;
};

export type LayoutDirection = "horizontal" | "vertical";
export type LayoutPreset = "anchored" | "fresh" | "legacy";
export type ModelNodeState = Node<{ model: Model; badgeHubIds: ReadonlySet<string> }>;

type LayoutEdgeKind =
  | "dependency"
  | "extends"
  | "field-array"
  | "field-function-arg"
  | "field-function-return"
  | "field-generic"
  | "field-union"
  | "field"
  | "implements";

export type ModelEdgeData = {
  layoutKind: LayoutEdgeKind;
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
  nodes: Pick<ModelNodeState, "id" | "measured" | "position">[];
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
  compact?: boolean;
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

export const UNPLACED_NODE_POSITION = { x: -1, y: -1 } as const;

export const isUnplacedNode = (node: Pick<Node, "position">) =>
  node.position.x === UNPLACED_NODE_POSITION.x && node.position.y === UNPLACED_NODE_POSITION.y;

export const extractModelNodes = (
  models: Model[],
  badgeHubIds: ReadonlySet<string> = EMPTY_BADGE_HUB_IDS,
): ModelNodeState[] => {
  return models
    .filter((model) => !badgeHubIds.has(model.id))
    .map((model) => ({
      data: { model, badgeHubIds },
      id: model.id,
      position: UNPLACED_NODE_POSITION,
      type: "model",
    }));
};

export const fieldHasSourceEdge = (
  field: Model["schema"][number],
  badgeHubIds: ReadonlySet<string>,
): boolean => {
  const refersToNode = (value: Model | string | undefined): boolean =>
    value instanceof Object && !badgeHubIds.has(value.id);
  if (field.typeRefs?.some((typeRef) => !badgeHubIds.has(typeRef.id))) return true;
  if (isArraySchemaField(field)) return refersToNode(field.elementType);
  if (isGenericSchemaField(field)) return field.arguments.some(refersToNode);
  if (isFunctionSchemaField(field)) {
    if (field.arguments.some((argument) => refersToNode(argument.type))) return true;
    return Array.isArray(field.returnType) ?
        refersToNode(field.returnType[0])
      : refersToNode(field.returnType);
  }
  if (isUnionSchemaField(field)) return field.types.some(refersToNode);
  return refersToNode(field.type);
};

export const getTypeAliasHeaderDependencies = (model: TypeAliasModel) => {
  const fieldTargets = new Set(
    model.schema.flatMap((field) => {
      const targets: string[] = [];
      if (field.type instanceof Object) targets.push(field.type.id);
      if (isArraySchemaField(field) && field.elementType instanceof Object) {
        targets.push(field.elementType.id);
      }
      if (isGenericSchemaField(field)) {
        for (const argument of field.arguments) if (argument instanceof Object) targets.push(argument.id);
      }
      if (isFunctionSchemaField(field)) {
        for (const argument of field.arguments) {
          if (argument.type instanceof Object) targets.push(argument.type.id);
        }
        const returnType = Array.isArray(field.returnType) ? field.returnType[0] : field.returnType;
        if (returnType instanceof Object) targets.push(returnType.id);
      }
      if (isUnionSchemaField(field)) {
        for (const type of field.types) if (type instanceof Object) targets.push(type.id);
      }
      for (const typeRef of field.typeRefs ?? []) targets.push(typeRef.id);
      return targets;
    }),
  );
  return model.dependencies.filter((dependency) => !fieldTargets.has(dependency.id));
};

export const extractModelEdges = (
  models: Model[],
  badgeHubIds: ReadonlySet<string> = EMPTY_BADGE_HUB_IDS,
): ModelEdge[] => {
  const result: ModelEdge[] = [];

  // stable, content-derived edge ids: a structural edit renumbers nothing, so unchanged
  // edge objects keep their identity (and their published routes) across reparses
  const usedEdgeIds = new Map<string, number>();
  const uniqueEdgeId = (base: string) => {
    const occurrence = usedEdgeIds.get(base) ?? 0;
    usedEdgeIds.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}~${occurrence}`;
  };
  for (const model of models) {
    if (model.type === "interface") {
      for (const extended of model.extends) {
        if (extended instanceof Object) {
          result.push(
            createModelEdge({
              id: uniqueEdgeId(`extends-${model.id}-${extended.id}`),
              layoutKind: "extends",
              source: model.id,
              target: extended.id,
            }),
          );
        }
      }
    }

    if (model.type === "typeAlias") {
      for (const dependency of getTypeAliasHeaderDependencies(model)) {
        result.push(
          createModelEdge({
            id: uniqueEdgeId(`dep-${model.id}-${dependency.id}`),
            layoutKind: "dependency",
            source: model.id,
            target: dependency.id,
          }),
        );
      }
    }

    if (model.type === "class") {
      if (model.extends instanceof Object) {
        result.push(
          createModelEdge({
            id: uniqueEdgeId(`extends-${model.id}-${model.extends.id}`),
            layoutKind: "extends",
            source: model.id,
            target: model.extends.id,
          }),
        );
      }

      for (const implemented of model.implements) {
        if (implemented instanceof Object) {
          result.push(
            createModelEdge({
              id: uniqueEdgeId(`implements-${model.id}-${implemented.id}`),
              layoutKind: "implements",
              source: model.id,
              target: implemented.id,
            }),
          );
        }
      }
    }

    if ((model.type === "class" || model.type === "interface") && model.headerRefs) {
      for (const headerRef of model.headerRefs) {
        result.push(
          createModelEdge({
            id: uniqueEdgeId(`heritage-${model.id}-${headerRef.id}`),
            layoutKind: "extends",
            source: model.id,
            target: headerRef.id,
          }),
        );
      }
    }

    for (const field of model.schema) {
      if (field.type instanceof Object) {
        result.push(
          createModelEdge({
            id: uniqueEdgeId(`field-${model.id}-${field.name}`),
            layoutKind: "field",
            source: model.id,
            sourceHandle: `${model.id}-source-${field.name}`,
            target: field.type.id,
          }),
        );
      }

      if (isArraySchemaField(field) && field.elementType instanceof Object) {
        result.push(
          createModelEdge({
            id: uniqueEdgeId(`fieldarr-${model.id}-${field.name}`),
            layoutKind: "field-array",
            source: model.id,
            sourceHandle: `${model.id}-source-${field.name}`,
            target: field.elementType.id,
          }),
        );
      }

      if (isGenericSchemaField(field)) {
        for (const argument of field.arguments) {
          if (argument instanceof Object) {
            result.push(
              createModelEdge({
                id: uniqueEdgeId(`fieldgen-${model.id}-${field.name}-${argument.id}`),
                layoutKind: "field-generic",
                source: model.id,
                sourceHandle: `${model.id}-source-${field.name}`,
                target: argument.id,
              }),
            );
          }
        }
      }

      if (isFunctionSchemaField(field)) {
        for (const argument of field.arguments) {
          if (argument.type instanceof Object) {
            result.push(
              createModelEdge({
                id: uniqueEdgeId(`fnarg-${model.id}-${field.name}-${argument.type.id}`),
                layoutKind: "field-function-arg",
                source: model.id,
                sourceHandle: `${model.id}-source-${field.name}`,
                target: argument.type.id,
              }),
            );
          }
        }

        const returnType = Array.isArray(field.returnType) ? field.returnType[0] : field.returnType;
        if (returnType instanceof Object) {
          result.push(
            createModelEdge({
              id: uniqueEdgeId(`fnret-${model.id}-${field.name}-${returnType.id}`),
              layoutKind: "field-function-return",
              source: model.id,
              sourceHandle: `${model.id}-source-${field.name}`,
              target: returnType.id,
            }),
          );
        }
      }

      if (field.typeRefs) {
        for (const typeRef of field.typeRefs) {
          result.push(
            createModelEdge({
              id: uniqueEdgeId(`fieldref-${model.id}-${field.name}-${typeRef.id}`),
              layoutKind: "field",
              source: model.id,
              sourceHandle: `${model.id}-source-${field.name}`,
              target: typeRef.id,
            }),
          );
        }
      }

      if (isUnionSchemaField(field)) {
        for (const unionType of field.types) {
          if (unionType instanceof Object) {
            result.push(
              createModelEdge({
                id: uniqueEdgeId(`fieldunion-${model.id}-${field.name}-${unionType.id}`),
                layoutKind: "field-union",
                source: model.id,
                sourceHandle: `${model.id}-source-${field.name}`,
                target: unionType.id,
              }),
            );
          }
        }
      }
    }
  }
  // badge hubs have no node; every edge touching one is represented by its inline pill
  return result.filter((edge) => !badgeHubIds.has(edge.source) && !badgeHubIds.has(edge.target));
};

export const decorateModelEdges = (
  edges: ModelEdge[],
  sharedEdgeProps: SharedModelEdgeProps = {},
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

  for (const [index, edge] of edges.entries()) {
    const key = `${edge.source}=>${edge.target}`;
    const priority = getLayoutEdgePriority(edge);
    const existing = edgesByPair.get(key);

    if (!existing) {
      edgesByPair.set(key, { edge, firstIndex: index, priority });
      continue;
    }

    if (priority > existing.priority) {
      edgesByPair.set(key, { edge, firstIndex: existing.firstIndex, priority });
    }
  }

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
    "elk.aspectRatio": "1.6",
    "elk.direction": direction === "horizontal" ? "RIGHT" : "DOWN",
    "elk.edgeRouting": "POLYLINE",
    "elk.insideSelfLoops.activate": "false",
    "elk.layered.mergeEdges": "true",
    "elk.layered.compaction.postCompaction.strategy": "LEFT",
    "elk.layered.nodePlacement.strategy": "LINEAR_SEGMENTS",
    "elk.layered.spacing.edgeEdgeBetweenLayers": "10",
    "elk.layered.spacing.edgeNodeBetweenLayers": "20",
    "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    "elk.spacing.componentComponent": "64",
    "elk.spacing.edgeEdge": "10",
    "elk.spacing.edgeNode": "20",
    "elk.spacing.nodeNode": "72",
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

const NO_PINNED_IDS: ReadonlySet<string> = new Set();

export const layoutModelNodes = async ({
  compact,
  direction,
  edges,
  manuallyMovedNodesSet,
  nodes,
  preset,
}: LayoutModelNodesArgs): Promise<ModelNodeState[]> => {
  const resolvedPreset = preset ?? getLayoutPreset(manuallyMovedNodesSet);
  const elkOptions = getLayoutOptions(direction, resolvedPreset);

  const graph: ElkNode = {
    children: nodes.map((node) => {
      const isPinned = manuallyMovedNodesSet.has(node.id);

      // overload rows share a field name, so ports are deduped by id
      const ports = new Map<string, { id: string; order: number; properties: Record<string, string> }>();
      for (const [index, field] of node.data.model.schema.entries()) {
        const portId = `${node.id}-source-${field.name}`;
        if (ports.has(portId)) continue;
        ports.set(portId, {
          id: portId,
          order: index,
          properties: {
            "port.side": "EAST",
          },
        });
      }

      return {
        height: node.measured?.height ?? 0,
        id: node.id,
        ports: [...ports.values()],
        ...(resolvedPreset === "anchored" && isPinned ?
          {
            x: node.position.x,
            y: node.position.y,
          }
        : {}),
        width: node.measured?.width ?? 0,
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

  const layoutedGraph = await getElk().layout(graph, { layoutOptions: elkOptions });
  const layoutedNodesMap = new Map(layoutedGraph.children?.map((node) => [node.id, node]) ?? []);

  const layoutedNodes = nodes.map((node) => {
    const layoutedNode = layoutedNodesMap.get(node.id);
    if (!layoutedNode) return node;

    const isPinned = resolvedPreset === "anchored" && manuallyMovedNodesSet.has(node.id);

    return {
      ...node,
      position: {
        x: isPinned ? node.position.x : (layoutedNode.x ?? node.position.x),
        y: isPinned ? node.position.y : (layoutedNode.y ?? node.position.y),
      },
    };
  });

  if (!compact) return layoutedNodes;
  return compactLayoutedNodes({
    direction,
    nodes: layoutedNodes,
    pinnedIds: resolvedPreset === "anchored" ? manuallyMovedNodesSet : NO_PINNED_IDS,
  });
};

const COMPACT_PAD_PX = 72;
const COMPACT_ASPECT_CAP = 1.7;

type CompactBox = {
  h: number;
  id: string;
  pinned: boolean;
  w: number;
  x: number;
  y: number;
};

const transposeBoxes = (boxes: CompactBox[]) => {
  for (const box of boxes) {
    [box.x, box.y] = [box.y, box.x];
    [box.w, box.h] = [box.h, box.w];
  }
};

const groupLayers = (boxes: CompactBox[]) => {
  const ordered = [...boxes].sort((a, b) => a.x - b.x);
  const layers: CompactBox[][] = [];
  let right = -Infinity;
  for (const box of ordered) {
    if (layers.length === 0 || box.x >= right) layers.push([]);
    layers[layers.length - 1].push(box);
    right = Math.max(right, box.x + box.w);
  }
  return layers;
};

const slideUp = (boxes: CompactBox[], pad: number, layoutTop: number): Map<string, number> => {
  const shifts = new Map<string, number>();
  const ordered = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const box of ordered) {
    if (box.pinned) continue;
    let ceiling = layoutTop;
    for (const other of ordered) {
      if (other === box) continue;
      const overlapsX = other.x < box.x + box.w + pad && box.x < other.x + other.w + pad;
      if (!overlapsX) continue;
      if (other.y + other.h <= box.y) ceiling = Math.max(ceiling, other.y + other.h + pad);
    }
    const shift = box.y - ceiling;
    if (shift <= 0) continue;
    box.y = ceiling;
    shifts.set(box.id, shift);
  }
  return shifts;
};

const getBoxBounds = (boxes: CompactBox[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return { height: maxY - minY, top: minY, width: maxX - minX };
};

type CompactLayoutedNodesArgs = {
  aspectCap?: number;
  direction: LayoutDirection;
  nodes: ModelNodeState[];
  pad?: number;
  pinnedIds: ReadonlySet<string>;
};

export const compactLayoutedNodes = ({
  aspectCap = COMPACT_ASPECT_CAP,
  direction,
  nodes,
  pad = COMPACT_PAD_PX,
  pinnedIds,
}: CompactLayoutedNodesArgs): ModelNodeState[] => {
  if (nodes.length < 2) return nodes;
  if (nodes.some((node) => !node.measured?.width || !node.measured.height)) return nodes;

  const boxes: CompactBox[] = nodes.map((node) => ({
    h: node.measured?.height ?? 0,
    id: node.id,
    pinned: pinnedIds.has(node.id),
    w: node.measured?.width ?? 0,
    x: node.position.x,
    y: node.position.y,
  }));

  // vertical layouts flow down; transposing makes the same pass (and the same aspect
  // cap, now on height/width) apply to their in-layer axis
  if (direction === "vertical") transposeBoxes(boxes);

  const originalY = new Map(boxes.map((box) => [box.id, box.y]));
  const { top, width } = getBoxBounds(boxes);
  const shifts = new Map<string, number>();
  for (const layer of groupLayers(boxes)) {
    for (const [id, shift] of slideUp(layer, pad, top)) shifts.set(id, shift);
  }
  const heightAt = (scale: number) => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const box of boxes) {
      const y = (originalY.get(box.id) ?? box.y) - scale * (shifts.get(box.id) ?? 0);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + box.h);
    }
    return maxY - minY;
  };
  if (width / heightAt(1) > aspectCap) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (width / heightAt(mid) > aspectCap) high = mid;
      else low = mid;
    }
    for (const box of boxes) {
      const shift = shifts.get(box.id);
      if (shift) box.y = (originalY.get(box.id) ?? box.y) - low * shift;
    }
  }

  if (direction === "vertical") transposeBoxes(boxes);

  const boxById = new Map(boxes.map((box) => [box.id, box]));
  return nodes.map((node) => {
    const box = boxById.get(node.id);
    if (!box || (box.x === node.position.x && box.y === node.position.y)) return node;
    return { ...node, position: { x: box.x, y: box.y } };
  });
};

export const getNodeIdOverlapRatio = (previousNodeIds: Iterable<string>, nextNodeIds: Iterable<string>) => {
  const previousNodeIdSet = new Set(previousNodeIds);
  const nextNodeIdSet = new Set(nextNodeIds);
  const denominator = Math.max(previousNodeIdSet.size, nextNodeIdSet.size);
  if (denominator === 0) return 1;

  let overlapCount = 0;
  for (const nodeId of nextNodeIdSet) {
    if (previousNodeIdSet.has(nodeId)) overlapCount += 1;
  }

  return overlapCount / denominator;
};

export const getNodeCountChangeRatio = (previousNodeIds: Iterable<string>, nextNodeIds: Iterable<string>) => {
  const previousNodeIdSet = new Set(previousNodeIds);
  const nextNodeIdSet = new Set(nextNodeIds);
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

    const sourceWidth = sourceNode.measured?.width ?? 0;
    const sourceHeight = sourceNode.measured?.height ?? 0;
    const targetWidth = targetNode.measured?.width ?? 0;
    const targetHeight = targetNode.measured?.height ?? 0;
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
  const maxX = Math.max(...nodes.map((node) => node.position.x + (node.measured?.width ?? 0)));
  const maxY = Math.max(...nodes.map((node) => node.position.y + (node.measured?.height ?? 0)));

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
