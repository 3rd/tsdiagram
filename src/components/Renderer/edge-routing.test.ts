import { describe, expect, it } from "vitest";
import {
  createEdgeRouter,
  EDGE_NODE_CLEARANCE,
  EdgeRoutingEdge,
  EdgeRoutingInput,
  EdgeRoutingNode,
  getBridgedCrossingPoints,
  routeModelEdges,
  RoutingPoint,
  RoutingRect,
  toRoundedPath,
} from "./edge-routing";

const makeNode = (id: string, left: number, top: number, width = 200, height = 100): EdgeRoutingNode => ({
  id,
  rect: { bottom: top + height, left, right: left + width, top },
});

const makeEdge = (
  id: string,
  source: EdgeRoutingNode,
  target: EdgeRoutingNode,
  sourceRow = 0.5,
  targetRow = 0.2,
): EdgeRoutingEdge => ({
  id,
  source: source.id,
  sourcePort: {
    x: source.rect.right + 4,
    y: source.rect.top + (source.rect.bottom - source.rect.top) * sourceRow,
  },
  target: target.id,
  targetPort: {
    x: target.rect.left - 4,
    y: target.rect.top + (target.rect.bottom - target.rect.top) * targetRow,
  },
});

const segmentCrossesRect = (a: RoutingPoint, b: RoutingPoint, rect: RoutingRect) => {
  if (a.x === b.x) {
    if (a.x <= rect.left || a.x >= rect.right) return false;
    return Math.max(Math.min(a.y, b.y), rect.top) < Math.min(Math.max(a.y, b.y), rect.bottom);
  }
  if (a.y <= rect.top || a.y >= rect.bottom) return false;
  return Math.max(Math.min(a.x, b.x), rect.left) < Math.min(Math.max(a.x, b.x), rect.right);
};

const isOrthogonal = (points: RoutingPoint[]) =>
  points.every(
    (point, index) => index === 0 || point.x === points[index - 1].x || point.y === points[index - 1].y,
  );

describe("routeModelEdges", () => {
  it.each([
    [19.99, "C", "Q"],
    [20, "Q", "C"],
  ])("uses the expected curve at a %s-pixel row offset", (offset, curve, excludedCurve) => {
    const source = makeNode("source", 0, 0);
    const target = makeNode("target", 400, offset);
    const edge = makeEdge("edge", source, target, 0.5, 0.5);
    const route = routeModelEdges({ nodes: [source, target], edges: [edge] }).edge;

    expect(route.path).toContain(` ${curve} `);
    expect(route.path).not.toContain(` ${excludedCurve} `);
    expect(route.simplePath).toBe(route.path);
  });

  it("routes a forward edge as an orthogonal polyline between the ports", () => {
    const source = makeNode("source", 0, 0);
    const target = makeNode("target", 320, 300);
    const edge = makeEdge("edge", source, target);
    const routes = routeModelEdges({ edges: [edge], nodes: [source, target] });
    const { points, path } = routes[edge.id];

    expect(points[0]).toEqual(edge.sourcePort);
    expect(points[points.length - 1]).toEqual(edge.targetPort);
    expect(isOrthogonal(points)).toBe(true);
    expect(path.startsWith("M ")).toBe(true);
    expect(path).toContain("Q ");
  });

  it("keeps routes outside the clearance zone of unrelated nodes", () => {
    const source = makeNode("source", 0, 0);
    const blocker = makeNode("blocker", 320, -40, 200, 180);
    const target = makeNode("target", 700, 0);
    const edge = makeEdge("edge", source, target, 0.5, 0.5);
    const { points } = routeModelEdges({ edges: [edge], nodes: [source, blocker, target] })[edge.id];
    const clearanceZone: RoutingRect = {
      bottom: blocker.rect.bottom + EDGE_NODE_CLEARANCE,
      left: blocker.rect.left - EDGE_NODE_CLEARANCE,
      right: blocker.rect.right + EDGE_NODE_CLEARANCE,
      top: blocker.rect.top - EDGE_NODE_CLEARANCE,
    };

    for (let index = 0; index < points.length - 1; index += 1) {
      expect(segmentCrossesRect(points[index], points[index + 1], clearanceZone)).toBe(false);
    }
  });

  it("fans edges that share a target port into separate lanes", () => {
    const top = makeNode("top", 0, 0);
    const bottom = makeNode("bottom", 0, 400);
    const target = makeNode("target", 400, 200);
    const edges = [makeEdge("from-top", top, target), makeEdge("from-bottom", bottom, target)];
    const routes = routeModelEdges({ edges, nodes: [top, bottom, target] });
    const verticals = (points: RoutingPoint[]) =>
      points.flatMap((point, index) =>
        index > 0 && point.x === points[index - 1].x ?
          [{ x: point.x, from: points[index - 1].y, to: point.y }]
        : [],
      );
    const overlapsInSameLane = verticals(routes["from-top"].points).some((a) =>
      verticals(routes["from-bottom"].points).some(
        (b) =>
          Math.abs(a.x - b.x) < 10 &&
          Math.min(Math.max(a.from, a.to), Math.max(b.from, b.to)) >
            Math.max(Math.min(a.from, a.to), Math.min(b.from, b.to)),
      ),
    );

    expect(overlapsInSameLane).toBe(false);
    expect(routes["from-top"].points.at(-3)?.y).not.toEqual(routes["from-bottom"].points.at(-3)?.y);
  });

  it("ends a fanned edge on the side its route arrives from instead of folding back to the port", () => {
    const target = makeNode("target", 600, 300);
    const near = makeNode("near", 0, 300);
    const blocker = makeNode("blocker", 300, 250, 200, 700);
    const source = makeNode("source", 0, 500);
    const edges = [
      makeEdge("near-1", near, target, 0.25),
      makeEdge("near-2", near, target, 0.35),
      makeEdge("near-3", near, target, 0.45),
      makeEdge("edge", source, target),
    ];
    const routes = routeModelEdges({ edges, nodes: [target, near, blocker, source] });
    const { points } = routes.edge;
    const portY = edges[3].targetPort.y;
    const approach = points.slice(-4);

    expect(approach.at(-1)?.y).toBe(portY);
    expect(approach.every((point) => point.y <= portY)).toBe(true);
  });

  it("keeps a fan of lane edges in straight parallel lanes past a neighboring node", () => {
    const hub = makeNode("hub", 500, 300, 400, 100);
    const tall = makeNode("tall", 1000, 320, 400, 300);
    const back = makeNode("back", 0, 800, 300, 100);
    const targets = [0, 1, 2, 3, 4].map((index) => makeNode(`t${index}`, 1050, 700 + index * 200, 300, 120));
    const edges = [
      ...targets.map((target, index) => makeEdge(`fan-${index}`, hub, target, 0.5, 0.2)),
      makeEdge("fan-back", hub, back, 0.5, 0.2),
    ];
    const routes = routeModelEdges({ edges, nodes: [hub, tall, back, ...targets] });

    for (const target of targets) {
      const { points } = routes[`fan-${target.id.slice(1)}`];
      expect(points.map((point) => point.x)).toEqual(
        points.map((point) => point.x).sort((a, b) => a - b),
      );
      expect(points).toHaveLength(4);
    }
  });

  it("routes a lane edge whose port row is not on the coordinate grid", () => {
    const source = makeNode("source", 0, 0.7644, 200, 100);
    const target = makeNode("target", 300, 400);
    const edge = makeEdge("edge", source, target, 0.5, 0.2);
    const { points } = routeModelEdges({ edges: [edge], nodes: [source, target] })[edge.id];

    expect(points[0].y).toBeCloseTo(edge.sourcePort.y, 1);
    expect(points.at(-1)?.y).toBeCloseTo(edge.targetPort.y, 1);
    expect(isOrthogonal(points)).toBe(true);
  });

  it("adds a bridge arc to the horizontal edge at a crossing", () => {
    const leftTop = makeNode("leftTop", 0, 0);
    const leftBottom = makeNode("leftBottom", 0, 400);
    // far enough apart that both edges travel horizontally first and cross midway
    const rightTop = makeNode("rightTop", 900, 0);
    const rightBottom = makeNode("rightBottom", 900, 400);
    const edges = [
      makeEdge("down", leftTop, rightBottom, 0.5, 0.5),
      makeEdge("up", leftBottom, rightTop, 0.5, 0.5),
    ];
    const routes = routeModelEdges({ edges, nodes: [leftTop, leftBottom, rightTop, rightBottom] });
    const bridgedPaths = Object.values(routes).filter((route) => route.path.includes("C "));

    expect(bridgedPaths).toHaveLength(1);
  });

  it("bridges a horizontal run once per crossing, on the crossed side only", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    const path = toRoundedPath(points, [
      { bridged: true, point: { x: 60, y: 0 }, segmentIndex: 0 },
      { bridged: true, point: { x: 140, y: 0 }, segmentIndex: 0 },
      { bridged: false, point: { x: 100, y: 0 }, segmentIndex: 0 },
    ]);

    expect(path.match(/C /g)).toHaveLength(4);
    expect(path).toContain("L 55 0 C 55 -2.76 57.24 -5 60 -5 C 62.76 -5 65 -2.76 65 0");
    expect(path).toContain("L 135 0 C");
  });

  it("spans neighboring crossings with one wide bridge instead of scalloping the line", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    const path = toRoundedPath(points, [
      { bridged: true, point: { x: 100, y: 0 }, segmentIndex: 0 },
      { bridged: true, point: { x: 100, y: 0 }, segmentIndex: 0 },
      { bridged: true, point: { x: 110, y: 0 }, segmentIndex: 0 },
      { bridged: true, point: { x: 124, y: 0 }, segmentIndex: 0 },
      { bridged: true, point: { x: 160, y: 0 }, segmentIndex: 0 },
    ]);

    expect(path.match(/C /g)).toHaveLength(4);
    expect(path).toContain(
      "L 95 0 C 95 -2.76 97.24 -5 100 -5 L 124 -5 C 126.76 -5 129 -2.76 129 0 L 155 0 C",
    );
    expect(path).toContain("165 0 L 200 0");
  });

  it("shortens a corner to make room for a bridge but never below the corner floor", () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 100 },
    ];

    expect(toRoundedPath(corner)).toContain("Q 60 0 60 14");
    expect(toRoundedPath(corner, [{ bridged: true, point: { x: 40, y: 0 }, segmentIndex: 0 }])).toContain(
      "L 35 0 C 35 -2.76 37.24 -5 40 -5 C 42.76 -5 45 -2.76 45 0 L 51 0 Q 60 0 60 9",
    );
    expect(toRoundedPath(corner, [{ bridged: true, point: { x: 50, y: 0 }, segmentIndex: 0 }])).toBe(
      "M 0 0 L 54 0 Q 60 0 60 6 L 60 100",
    );
    expect(toRoundedPath(corner, [{ bridged: false, point: { x: 60, y: 6 }, segmentIndex: 1 }])).toContain(
      "Q 60 0 60 14",
    );
  });

  it("breaks the crossed line around each arch stroke, merging breaks that would leave a sliver", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 200 },
    ];
    const path = toRoundedPath(points, [
      { bridged: false, point: { x: 0, y: 60 }, segmentIndex: 0 },
      { bridged: false, point: { x: 0, y: 100 }, segmentIndex: 0 },
      { bridged: false, point: { x: 0, y: 106 }, segmentIndex: 0 },
    ]);

    expect(path).toBe("M 0 0 L 0 53 M 0 57 L 0 93 M 0 103 L 0 200");
  });

  it("reports only the crossings whose arch is drawn, so a dropped arch leaves no break", () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 100 },
    ];
    const drawn = { x: 40, y: 0 };
    const dropped = { x: 50, y: 0 };
    const bridged = getBridgedCrossingPoints(corner, [
      { bridged: true, point: drawn, segmentIndex: 0 },
      { bridged: true, point: dropped, segmentIndex: 0 },
    ]);

    expect(bridged.has(drawn)).toBe(true);
    expect(bridged.has(dropped)).toBe(false);
  });

  it("drops a bridge that cannot fit between the crossing and the segment end", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ];
    const path = toRoundedPath(points, [{ bridged: true, point: { x: 3, y: 0 }, segmentIndex: 0 }]);

    expect(path).toBe("M 0 0 L 200 0");
  });

  it("loops a self-referencing edge around the top of its node", () => {
    const node = makeNode("node", 100, 100);
    const edge = makeEdge("self", node, node);
    const { points } = routeModelEdges({ edges: [edge], nodes: [node] })[edge.id];

    expect(points[0]).toEqual(edge.sourcePort);
    expect(points[points.length - 1]).toEqual(edge.targetPort);
    expect(Math.min(...points.map((point) => point.y))).toBeLessThan(node.rect.top);
  });

  it("reuses untouched routes when one node moves", () => {
    const { route: routeEdges } = createEdgeRouter();
    const left = makeNode("left", 0, 0);
    const right = makeNode("right", 400, 0);
    const farTop = makeNode("farTop", 0, 600);
    const farBottom = makeNode("farBottom", 400, 600);
    const edges = [makeEdge("near", left, right, 0.5, 0.5), makeEdge("far", farTop, farBottom, 0.5, 0.5)];
    const first = routeEdges({ edges, nodes: [left, right, farTop, farBottom] });
    const movedRight = makeNode("right", 400, 40);
    const movedEdges = [makeEdge("near", left, movedRight, 0.5, 0.5), edges[1]];
    const second = routeEdges({ edges: movedEdges, nodes: [left, movedRight, farTop, farBottom] });

    expect(second.far.points).toEqual(first.far.points);
    expect(second.near.points).not.toEqual(first.near.points);
    expect(second.near.points[second.near.points.length - 1]).toEqual(movedEdges[0].targetPort);
  });

  it("routes a large layered graph without falling back to node-crossing paths", () => {
    const columns = 12;
    const rows = 20;
    const nodes: EdgeRoutingNode[] = [];
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        nodes.push(makeNode(`n${column}-${row}`, column * 320, row * 160, 220, 110));
      }
    }
    const edges: EdgeRoutingEdge[] = [];
    for (let column = 0; column < columns - 1; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const source = nodes[column * rows + row];
        for (const offset of [0, 3, 7]) {
          const target = nodes[(column + 1) * rows + ((row + offset) % rows)];
          edges.push(makeEdge(`e${column}-${row}-${offset}`, source, target, 0.3 + offset * 0.1));
        }
      }
    }
    const input: EdgeRoutingInput = { edges, nodes };
    const started = performance.now();
    const routes = routeModelEdges(input);
    const elapsed = performance.now() - started;

    let nodeCrossings = 0;
    for (const route of Object.values(routes)) {
      for (const node of nodes) {
        for (let index = 0; index < route.points.length - 1; index += 1) {
          if (segmentCrossesRect(route.points[index], route.points[index + 1], node.rect)) nodeCrossings += 1;
        }
      }
    }
    expect(Object.keys(routes)).toHaveLength(edges.length);
    expect(nodeCrossings).toBe(0);
    expect(elapsed).toBeLessThan(4000);
  });
});
