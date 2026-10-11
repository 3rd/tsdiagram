import { parseModels } from "@tsdiagram/core";
import ElkConstructor from "elkjs/lib/elk.bundled.js";
import { Renderer } from "takumi-js/node";
import type { Node } from "takumi-js/helpers";
import { computeBadgeHubIds, EMPTY_BADGE_HUB_IDS } from "../graph/badge-hubs";
import {
  assignEdgeColors,
  EDGE_COLOR_PALETTES,
  EMPTY_PORT_COLORS,
  getSourcePortId,
  getTargetPortId,
} from "../graph/edge-colors";
import {
  EDGE_SELF_LOOP_DASH,
  routeModelEdges,
  type EdgeRoutes,
  type EdgeRoutingInput,
} from "../graph/edge-routing";
import {
  extractModelEdges,
  extractModelNodes,
  layoutModelNodes,
  normalizeLayoutEdges,
  type ModelEdge,
  type ModelNodeState,
} from "../graph/layout";
import { diagramOptionsSchema, type DiagramOptions } from "../diagram-options";
import { getSvgFrame } from "../export/svg-frame";
import { getDiagramThemeClass, loadDiagramAssets, resolveDiagramColors } from "./assets";
import { createModelCardNode, measureModelCard } from "./model-card";

type PngOptions = {
  scale: number;
  maxSide: number;
};

export type RenderDiagramImageOptions = {
  source: string;
  assetsDirectory: string;
  options?: Partial<DiagramOptions>;
  png?: PngOptions;
};

type MeasuredCard = Awaited<ReturnType<typeof measureModelCard>> & {
  node: Node;
  css: string[];
};

type MeasureDiagramCardsOptions = {
  renderer: Renderer;
  css: string;
  nodes: ModelNodeState[];
  portColors: ReadonlyMap<string, string>;
  colors: Awaited<ReturnType<typeof resolveDiagramColors>>;
  theme: DiagramOptions["theme"];
};

const measureDiagramCards = async ({
  renderer,
  css,
  nodes,
  portColors,
  colors,
  theme,
}: MeasureDiagramCardsOptions) => {
  const cards = new Map<string, MeasuredCard>();

  for (const node of nodes) {
    const card = await createModelCardNode({
      model: node.data.model,
      badgeHubIds: node.data.badgeHubIds,
      portColors,
      paneColor: colors.pane,
      accentColor: colors.accent,
      theme,
    });
    const measured = await measureModelCard({ renderer, node: card.node, css: [css, ...card.css] });
    node.measured = { width: measured.width, height: measured.height };
    cards.set(node.id, { ...card, ...measured });
  }

  return cards;
};

const createRoutingInput = (
  nodes: ModelNodeState[],
  edges: ModelEdge[],
  cards: ReadonlyMap<string, MeasuredCard>
) => {
  const input: EdgeRoutingInput = { nodes: [], edges: [] };
  const positions = new Map(nodes.map((node) => [node.id, node.position]));

  for (const node of nodes) {
    const card = cards.get(node.id);
    if (card === undefined) {
      throw new Error(`Missing measured diagram card: ${node.id}`);
    }

    const { x, y } = node.position;
    input.nodes.push({
      id: node.id,
      rect: { left: x, top: y, right: x + card.width, bottom: y + card.height },
    });
  }

  for (const edge of edges) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    const sourcePort = cards.get(edge.source)?.ports.get(getSourcePortId(edge));
    const targetPort = cards.get(edge.target)?.ports.get(getTargetPortId(edge));
    const hasMissingPort =
      source === undefined || target === undefined || sourcePort === undefined || targetPort === undefined;
    if (hasMissingPort) {
      throw new Error(`Missing diagram port for edge: ${edge.id}`);
    }

    input.edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourcePort: { x: source.x + sourcePort.x, y: source.y + sourcePort.y },
      targetPort: { x: target.x + targetPort.x, y: target.y + targetPort.y },
    });
  }

  return input;
};

const getDiagramBounds = (input: EdgeRoutingInput, routes: EdgeRoutes) => {
  if (input.nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const { rect } of input.nodes) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  for (const route of Object.values(routes)) {
    const coordinates = route.path.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];

    for (let index = 0; index < coordinates.length; index += 2) {
      left = Math.min(left, coordinates[index]);
      top = Math.min(top, coordinates[index + 1]);
      right = Math.max(right, coordinates[index]);
      bottom = Math.max(bottom, coordinates[index + 1]);
    }
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
};

type CreateEdgeLayerOptions = {
  edges: ModelEdge[];
  routes: EdgeRoutes;
  colors: string[];
  frame: ReturnType<typeof getSvgFrame>;
};

const createEdgeLayer = ({ edges, routes, colors, frame }: CreateEdgeLayerOptions) => {
  const definitions = colors.map(
    (color, index) =>
      `<marker id="arrow-${index}" markerWidth="12.5" markerHeight="12.5" viewBox="-10 -10 20 20" markerUnits="strokeWidth" orient="auto-start-reverse" refX="0" refY="0"><polyline points="-5,-4 0,0 -5,4 -5,-4" fill="${color}" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></marker>`
  );
  const paths = edges.map((edge, index) => {
    const route = routes[edge.id];
    if (route === undefined) {
      throw new Error(`Missing diagram route: ${edge.id}`);
    }

    const dash = edge.source === edge.target ? ` stroke-dasharray="${EDGE_SELF_LOOP_DASH}"` : "";
    return `<path d="${route.path}" fill="none" stroke="${colors[index]}" stroke-width="1" marker-end="url(#arrow-${index})"${dash}/>`;
  });

  return {
    type: "image",
    width: frame.width,
    height: frame.height,
    style: { position: "absolute", left: 0, top: 0 },
    src: `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}"><defs>${definitions.join("")}</defs><g transform="translate(${frame.offsetX},${frame.offsetY})">${paths.join("")}</g></svg>`,
  } satisfies Node;
};

type CreateDiagramSceneOptions = {
  nodes: ModelNodeState[];
  cards: ReadonlyMap<string, MeasuredCard>;
  edgeLayer: Node;
  frame: ReturnType<typeof getSvgFrame>;
  theme: DiagramOptions["theme"];
};

const createDiagramScene = ({ nodes, cards, edgeLayer, frame, theme }: CreateDiagramSceneOptions) =>
  ({
    type: "container",
    className: getDiagramThemeClass(theme),
    style: {
      width: frame.width,
      height: frame.height,
      position: "relative",
      backgroundColor: "var(--color-canvas)",
    },
    children: [
      edgeLayer,
      ...nodes.map((node) => {
        const card = cards.get(node.id);
        if (card === undefined) {
          throw new Error(`Missing measured diagram card: ${node.id}`);
        }

        return {
          ...card.node,
          style: {
            ...card.node.style,
            position: "absolute",
            left: node.position.x + frame.offsetX,
            top: node.position.y + frame.offsetY,
            width: card.width,
            height: card.height,
          },
        } satisfies Node;
      }),
    ],
  }) satisfies Node;

export const renderDiagramImage = async ({
  source,
  assetsDirectory,
  options: suppliedOptions,
  png,
}: RenderDiagramImageOptions) => {
  const options = diagramOptionsSchema.parse(suppliedOptions ?? {});
  const models = parseModels(source);
  const badgeHubIds = options.badgeHubs
    ? computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS)
    : EMPTY_BADGE_HUB_IDS;
  const edges = extractModelEdges(models, badgeHubIds);
  const edgeColors = options.colorizeEdges
    ? assignEdgeColors(edges, EDGE_COLOR_PALETTES[options.theme])
    : null;

  const renderer = new Renderer();
  const css = await loadDiagramAssets(assetsDirectory, renderer);
  const colors = await resolveDiagramColors(renderer, css, options.theme);

  const nodes = extractModelNodes(models, badgeHubIds);
  const cards = await measureDiagramCards({
    renderer,
    css,
    nodes,
    portColors: edgeColors?.ports ?? EMPTY_PORT_COLORS,
    colors,
    theme: options.theme,
  });
  const positionedNodes = await layoutModelNodes({
    engine: new ElkConstructor(),
    nodes,
    edges: normalizeLayoutEdges(edges),
    direction: options.direction,
    compact: options.compactLayout,
    manuallyMovedNodesSet: new Set(),
  });

  const routingInput = createRoutingInput(positionedNodes, edges, cards);
  const routes = routeModelEdges(routingInput);
  const svgFrame = getSvgFrame(getDiagramBounds(routingInput, routes));
  const frame = { ...svgFrame, width: Math.ceil(svgFrame.width), height: Math.ceil(svgFrame.height) };

  const scene = createDiagramScene({
    nodes: positionedNodes,
    cards,
    edgeLayer: createEdgeLayer({
      edges,
      routes,
      colors: edgeColors?.edges ?? edges.map(() => colors.edge),
      frame,
    }),
    frame,
    theme: options.theme,
  });
  const svg = await renderer.renderSvg(scene, {
    css: [css, ...[...cards.values()].flatMap((card) => card.css)],
  });
  const result = { svg, width: frame.width, height: frame.height };

  if (png === undefined) return { ...result, png: null };

  const factor = Math.min(png.scale, png.maxSide / Math.max(frame.width, frame.height));
  const width = Math.max(1, Math.round(frame.width * factor));
  const height = Math.max(1, Math.round(frame.height * factor));
  const bytes = await renderer.render(
    { type: "image", src: svg, width, height },
    { width, height, format: "png" }
  );

  return { ...result, png: { bytes, width, height } };
};
