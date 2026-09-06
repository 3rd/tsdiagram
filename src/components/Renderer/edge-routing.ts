export type RoutingPoint = { x: number; y: number };

export type RoutingRect = { bottom: number; left: number; right: number; top: number };

export type EdgeRoutingNode = { id: string; rect: RoutingRect };

export type EdgeRoutingEdge = {
  id: string;
  source: string;
  sourcePort: RoutingPoint;
  target: string;
  targetPort: RoutingPoint;
};

export type EdgeRoutingInput = { edges: EdgeRoutingEdge[]; nodes: EdgeRoutingNode[] };

export type EdgeRoute = { path: string; points: RoutingPoint[]; simplePath: string };

export type EdgeRoutes = Record<string, EdgeRoute>;

export const EDGE_CORNER_RADIUS = 14;
export const EDGE_NODE_CLEARANCE = 20;
const LANE_SPACING = 10;
const BRIDGE_RADIUS = 5;
const EPSILON = 0.001;
const BEND_COST = 30;
const CROSSING_COST = 40;
const OVERLAP_COST = 12;
const BACKWARD_COST = 0.25;
const OUTSIDE_COST = 1.5;
const CROSSING_IMPROVEMENT_ATTEMPTS = 2;
const SEARCH_WINDOW_MARGIN = EDGE_NODE_CLEARANCE * 2 + LANE_SPACING * 4;
const SEARCH_WINDOW_GROWTH = 3;
const MAX_SEARCH_CELLS = 40_000;
const MAX_CORRIDOR_LANES = 16;
const MAX_CORRIDOR_LEG_SHIFTS = 4;

type Direction = "horizontal" | "vertical";

type EdgeGeometry = {
  edge: EdgeRoutingEdge;
  endpointClearance: number;
  hasSourceLane: boolean;
  sourceGateway: RoutingPoint;
  sourceStub: RoutingPoint[];
  targetGateway: RoutingPoint;
  targetStub: RoutingPoint[];
};

type Segment = {
  a: RoutingPoint;
  b: RoutingPoint;
  direction: Direction;
  edgeId: string;
  segmentIndex: number;
  sourceKey: string;
  targetKey: string;
};

type RoutedEdge = {
  geometry: EdgeGeometry;
  points: RoutingPoint[];
};

type Crossing = { horizontal: Segment; point: RoutingPoint; vertical: Segment };

export type PathCrossing = { bridged: boolean; point: RoutingPoint; segmentIndex: number };

class IndexHeap {
  private keys = new Float64Array(64);
  private values = new Int32Array(64);
  private count = 0;

  get size() {
    return this.count;
  }

  push(key: number, value: number) {
    if (this.count === this.keys.length) {
      const keys = new Float64Array(this.count * 2);
      const values = new Int32Array(this.count * 2);
      keys.set(this.keys);
      values.set(this.values);
      this.keys = keys;
      this.values = values;
    }
    const { keys, values } = this;
    let index = this.count;
    this.count += 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[index] = keys[parent];
      values[index] = values[parent];
      index = parent;
    }
    keys[index] = key;
    values[index] = value;
  }

  pop() {
    if (this.count === 0) return undefined;
    const { keys, values } = this;
    const first = values[0];
    this.count -= 1;
    const count = this.count;
    if (count === 0) return first;
    const lastKey = keys[count];
    const lastValue = values[count];
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      let smallestKey = lastKey;
      if (left < count && keys[left] < smallestKey) {
        smallest = left;
        smallestKey = keys[left];
      }
      if (right < count && keys[right] < smallestKey) smallest = right;
      if (smallest === index) break;
      keys[index] = keys[smallest];
      values[index] = values[smallest];
      index = smallest;
    }
    keys[index] = lastKey;
    values[index] = lastValue;
    return first;
  }
}

const roundCoordinate = (value: number) => Math.round(value * 100) / 100;

const roundPoint = (point: RoutingPoint): RoutingPoint => ({
  x: roundCoordinate(point.x),
  y: roundCoordinate(point.y),
});

const DIRECTION_NONE = 0;
const DIRECTION_HORIZONTAL = 1;
const DIRECTION_VERTICAL = 2;

const pointEquals = (a: RoutingPoint, b: RoutingPoint) =>
  Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

const getDirection = (a: RoutingPoint, b: RoutingPoint): Direction | null => {
  if (Math.abs(a.x - b.x) < EPSILON) return "vertical";
  if (Math.abs(a.y - b.y) < EPSILON) return "horizontal";
  return null;
};

const getSegmentLength = (a: RoutingPoint, b: RoutingPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const inflateRect = (rect: RoutingRect, amount: number): RoutingRect => ({
  bottom: rect.bottom + amount,
  left: rect.left - amount,
  right: rect.right + amount,
  top: rect.top - amount,
});

const rectsIntersect = (a: RoutingRect, b: RoutingRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const getSegmentRect = (a: RoutingPoint, b: RoutingPoint): RoutingRect => ({
  bottom: Math.max(a.y, b.y),
  left: Math.min(a.x, b.x),
  right: Math.max(a.x, b.x),
  top: Math.min(a.y, b.y),
});

const isPointInsideRect = (point: RoutingPoint, rect: RoutingRect) =>
  point.x > rect.left + EPSILON &&
  point.x < rect.right - EPSILON &&
  point.y > rect.top + EPSILON &&
  point.y < rect.bottom - EPSILON;

const segmentIntersectsRect = (a: RoutingPoint, b: RoutingPoint, rect: RoutingRect) => {
  const direction = getDirection(a, b);
  if (direction === null) return false;
  const axis = direction === "horizontal" ? "x" : "y";
  const crossAxis = direction === "horizontal" ? "y" : "x";
  const min = direction === "horizontal" ? rect.left : rect.top;
  const max = direction === "horizontal" ? rect.right : rect.bottom;
  const crossMin = direction === "horizontal" ? rect.top : rect.left;
  const crossMax = direction === "horizontal" ? rect.bottom : rect.right;
  if (a[crossAxis] <= crossMin + EPSILON || a[crossAxis] >= crossMax - EPSILON) return false;
  return getRangeOverlapLength(a[axis], b[axis], min, max) > 0;
};

const stepIsBlocked = (a: RoutingPoint, b: RoutingPoint, obstacles: readonly RoutingRect[]) =>
  obstacles.some(
    (obstacle) =>
      isPointInsideRect(a, obstacle) ||
      isPointInsideRect(b, obstacle) ||
      segmentIntersectsRect(a, b, obstacle),
  );

const getRangeOverlapLength = (a1: number, a2: number, b1: number, b2: number) =>
  Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)));

const LANE_HUG_PROXIMITY = 0.05;

const getLaneProximity = (a: number, b: number, hug: boolean) => {
  const distance = Math.abs(a - b);
  if (distance < LANE_SPACING) return 1 - distance / LANE_SPACING;
  if (hug && distance < LANE_SPACING * 2) return LANE_HUG_PROXIMITY * (2 - distance / LANE_SPACING);
  return 0;
};

const getSegmentOverlapLength = (a: RoutingPoint, b: RoutingPoint, occupied: Segment, hug: boolean) => {
  const direction = getDirection(a, b);
  if (direction !== occupied.direction) return 0;
  const axis = direction === "horizontal" ? "x" : "y";
  const crossAxis = direction === "horizontal" ? "y" : "x";
  return (
    getRangeOverlapLength(a[axis], b[axis], occupied.a[axis], occupied.b[axis]) *
    getLaneProximity(a[crossAxis], occupied.a[crossAxis], hug)
  );
};

const segmentsShareLane = (a: RoutingPoint, b: RoutingPoint, occupied: Segment) => {
  const direction = getDirection(a, b);
  if (direction !== occupied.direction) return false;
  if (direction === "horizontal") {
    return (
      Math.abs(a.y - occupied.a.y) < LANE_SPACING - EPSILON &&
      getRangeOverlapLength(a.x, b.x, occupied.a.x, occupied.b.x) > EPSILON
    );
  }
  return (
    Math.abs(a.x - occupied.a.x) < LANE_SPACING - EPSILON &&
    getRangeOverlapLength(a.y, b.y, occupied.a.y, occupied.b.y) > EPSILON
  );
};

const getPerpendicularIntersection = (
  horizontal: Segment | { a: RoutingPoint; b: RoutingPoint },
  vertical: Segment | { a: RoutingPoint; b: RoutingPoint },
  endMargin = EPSILON,
): RoutingPoint | null => {
  const point = { x: vertical.a.x, y: horizontal.a.y };
  const insideHorizontal =
    point.x > Math.min(horizontal.a.x, horizontal.b.x) + endMargin &&
    point.x < Math.max(horizontal.a.x, horizontal.b.x) - endMargin;
  const insideVertical =
    point.y > Math.min(vertical.a.y, vertical.b.y) + endMargin &&
    point.y < Math.max(vertical.a.y, vertical.b.y) - endMargin;
  return insideHorizontal && insideVertical ? point : null;
};

const getSegmentsIntersection = (a: { a: RoutingPoint; b: RoutingPoint }, b: Segment) => {
  const direction = getDirection(a.a, a.b);
  if (!direction || direction === b.direction) return null;
  return direction === "horizontal" ? getPerpendicularIntersection(a, b) : getPerpendicularIntersection(b, a);
};

const segmentsTouch = (a: { a: RoutingPoint; b: RoutingPoint }, b: Segment) => {
  const direction = getDirection(a.a, a.b);
  if (!direction || direction === b.direction) return false;
  const horizontal = direction === "horizontal" ? a : b;
  const vertical = direction === "horizontal" ? b : a;
  return (
    vertical.a.x >= Math.min(horizontal.a.x, horizontal.b.x) - EPSILON &&
    vertical.a.x <= Math.max(horizontal.a.x, horizontal.b.x) + EPSILON &&
    horizontal.a.y >= Math.min(vertical.a.y, vertical.b.y) - EPSILON &&
    horizontal.a.y <= Math.max(vertical.a.y, vertical.b.y) + EPSILON
  );
};

const getPortKey = (nodeId: string, port: RoutingPoint) => `${nodeId}:${roundCoordinate(port.y)}`;

const toSegments = (points: readonly RoutingPoint[], geometry: EdgeGeometry): Segment[] => {
  const segments: Segment[] = [];
  const edgeId = geometry.edge.id;
  const sourceKey = getPortKey(geometry.edge.source, geometry.edge.sourcePort);
  const targetKey = getPortKey(geometry.edge.target, geometry.edge.targetPort);
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const direction = getDirection(a, b);
    if (!direction || pointEquals(a, b)) continue;
    segments.push({ a, b, direction, edgeId, segmentIndex: index, sourceKey, targetKey });
  }
  return segments;
};

const MAX_FAN_LANES = 8;
const PORT_ZONE_WIDTH = EDGE_NODE_CLEARANCE + LANE_SPACING * MAX_FAN_LANES;
const PORT_ZONE_HEIGHT = LANE_SPACING * MAX_FAN_LANES;

const isWithinPortZone = (segment: Segment, port: RoutingPoint) =>
  [segment.a, segment.b].every(
    (point) =>
      Math.abs(point.x - port.x) <= PORT_ZONE_WIDTH + EPSILON &&
      Math.abs(point.y - port.y) <= PORT_ZONE_HEIGHT + EPSILON,
  );

const isLaneMate = (geometry: EdgeGeometry, segment: Segment) =>
  segment.sourceKey === getPortKey(geometry.edge.source, geometry.edge.sourcePort);

const sharesPort = (geometry: EdgeGeometry, segment: Segment) =>
  (segment.sourceKey === getPortKey(geometry.edge.source, geometry.edge.sourcePort) &&
    isWithinPortZone(segment, geometry.edge.sourcePort)) ||
  segment.targetKey === getPortKey(geometry.edge.target, geometry.edge.targetPort);

const simplifyPoints = (points: readonly RoutingPoint[]) => {
  const unique = points.filter((point, index) => index === 0 || !pointEquals(points[index - 1], point));
  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true;
    return getDirection(unique[index - 1], point) !== getDirection(point, unique[index + 1]);
  });
};

const routePointsCache = new WeakMap<RoutedEdge, RoutingPoint[]>();
const routeSegmentsCache = new WeakMap<RoutedEdge, Segment[]>();

const combinePoints = (route: RoutedEdge) => {
  const cached = routePointsCache.get(route);
  if (cached) return cached;
  const points = simplifyPoints([
    ...route.geometry.sourceStub,
    ...route.points,
    ...route.geometry.targetStub,
  ]);
  routePointsCache.set(route, points);
  return points;
};

const getRouteSegments = (route: RoutedEdge) => {
  const cached = routeSegmentsCache.get(route);
  if (cached) return cached;
  const segments = toSegments(combinePoints(route), route.geometry);
  routeSegmentsCache.set(route, segments);
  return segments;
};

const createFanOffsets = (
  edges: readonly EdgeRoutingEdge[],
  getKey: (edge: EdgeRoutingEdge) => string,
  getFixed: (edge: EdgeRoutingEdge) => RoutingPoint,
  getOther: (edge: EdgeRoutingEdge) => RoutingPoint,
) => {
  const groups = new Map<string, EdgeRoutingEdge[]>();
  for (const edge of edges) {
    const key = getKey(edge);
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  const offsets = new Map<string, number>();
  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (a, b) =>
        Math.abs(getOther(a).y - getFixed(a).y) - Math.abs(getOther(b).y - getFixed(b).y) ||
        Math.abs(getOther(a).x - getFixed(a).x) - Math.abs(getOther(b).x - getFixed(b).x) ||
        a.id.localeCompare(b.id),
    );
    const usedSlots = new Set([0]);
    for (const [index, edge] of sorted.entries()) {
      if (index === 0) {
        offsets.set(edge.id, 0);
        continue;
      }
      let direction = Math.sign(getOther(edge).y - getFixed(edge).y);
      if (direction === 0) direction = index % 2 === 0 ? 1 : -1;
      let magnitude = 1;
      while (usedSlots.has(direction * magnitude)) magnitude += 1;
      usedSlots.add(direction * magnitude);
      offsets.set(edge.id, direction * magnitude * LANE_SPACING);
    }
  }
  return offsets;
};

const isBackward = (edge: EdgeRoutingEdge) => edge.targetPort.x < edge.sourcePort.x;

const departsVertically = (edge: EdgeRoutingEdge) =>
  edge.source !== edge.target &&
  (isBackward(edge) ||
    Math.abs(edge.targetPort.y - edge.sourcePort.y) > Math.abs(edge.targetPort.x - edge.sourcePort.x));

const compareSourceLaneOrder = (a: EdgeRoutingEdge, b: EdgeRoutingEdge) => {
  const aBackward = isBackward(a);
  const bBackward = isBackward(b);
  if (aBackward !== bBackward) return aBackward ? -1 : 1;
  const aSpan = Math.abs(a.targetPort.y - a.sourcePort.y);
  const bSpan = Math.abs(b.targetPort.y - b.sourcePort.y);
  return (aBackward ? aSpan - bSpan : bSpan - aSpan) || a.id.localeCompare(b.id);
};

const createSourceLaneOffsets = (
  edges: readonly EdgeRoutingEdge[],
  obstacles: readonly RoutingRect[],
  nodesById: ReadonlyMap<string, EdgeRoutingNode>,
) => {
  const groups = new Map<string, EdgeRoutingEdge[]>();
  for (const edge of edges) {
    if (!departsVertically(edge)) continue;
    const key = `${edge.source}:${roundCoordinate(edge.sourcePort.y)}:${Math.sign(edge.targetPort.y - edge.sourcePort.y)}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  const offsets = new Map<string, number>();
  for (const group of groups.values()) {
    const sorted = [...group].sort(compareSourceLaneOrder);
    let lane = 0;
    for (const edge of sorted) {
      const gateway = {
        x: edge.sourcePort.x + EDGE_NODE_CLEARANCE + lane * LANE_SPACING,
        y: edge.sourcePort.y,
      };
      const sourceRect = nodesById.get(edge.source)?.rect;
      const blocked = obstacles.some((rect) => rect !== sourceRect && isPointInsideRect(gateway, rect));
      if (blocked || lane >= MAX_FAN_LANES) continue;
      offsets.set(edge.id, lane * LANE_SPACING);
      lane += 1;
    }
  }
  return offsets;
};

const createGeometry = (
  edge: EdgeRoutingEdge,
  endpointClearance: number,
  sourceGateway: RoutingPoint,
  targetGateway: RoutingPoint,
  hasSourceLane: boolean,
): EdgeGeometry => {
  const sourcePort = roundPoint(edge.sourcePort);
  const targetPort = roundPoint(edge.targetPort);
  return {
    edge,
    endpointClearance,
    hasSourceLane,
    sourceGateway,
    sourceStub: [sourcePort, { x: sourceGateway.x, y: sourcePort.y }, sourceGateway],
    targetGateway,
    targetStub: [targetGateway, { x: targetGateway.x, y: targetPort.y }, targetPort],
  };
};

const mirrorGateway = (gateway: RoutingPoint, port: RoutingPoint): RoutingPoint => ({
  x: gateway.x,
  y: roundCoordinate(port.y * 2 - gateway.y),
});

const buildGeometries = (
  input: EdgeRoutingInput,
  nodesById: ReadonlyMap<string, EdgeRoutingNode>,
  inflatedObstacles: readonly RoutingRect[],
) => {
  const routable = input.edges.filter((edge) => nodesById.has(edge.source) && nodesById.has(edge.target));
  const sourceLanes = createSourceLaneOffsets(routable, inflatedObstacles, nodesById);
  const sourceOffsets = createFanOffsets(
    routable.filter((edge) => !sourceLanes.has(edge.id)),
    (edge) => `${edge.source}:${roundCoordinate(edge.sourcePort.y)}`,
    (edge) => edge.sourcePort,
    (edge) => edge.targetPort,
  );
  const targetOffsets = createFanOffsets(
    routable,
    (edge) => `${edge.target}:${roundCoordinate(edge.targetPort.y)}`,
    (edge) => edge.targetPort,
    (edge) => edge.sourcePort,
  );

  return routable.map((edge): EdgeGeometry => {
    const forwardGap = edge.targetPort.x - edge.sourcePort.x;
    const endpointClearance =
      forwardGap >= 0 ?
        Math.max(LANE_SPACING, Math.min(EDGE_NODE_CLEARANCE, forwardGap / 2))
      : EDGE_NODE_CLEARANCE;
    const sourceLane = sourceLanes.get(edge.id);
    const sourceGateway = {
      x: roundCoordinate(
        edge.sourcePort.x + (sourceLane === undefined ? endpointClearance : EDGE_NODE_CLEARANCE + sourceLane),
      ),
      y: roundCoordinate(edge.sourcePort.y + (sourceOffsets.get(edge.id) ?? 0)),
    };
    const targetGateway = {
      x: roundCoordinate(edge.targetPort.x - endpointClearance),
      y: roundCoordinate(edge.targetPort.y + (targetOffsets.get(edge.id) ?? 0)),
    };
    return createGeometry(edge, endpointClearance, sourceGateway, targetGateway, sourceLane !== undefined);
  });
};

const getSelfLoopPoints = (geometry: EdgeGeometry, rect: RoutingRect) => {
  const { sourcePort, targetPort } = geometry.edge;
  const aboveY = rect.top - EDGE_NODE_CLEARANCE;
  const rightX = sourcePort.x + EDGE_NODE_CLEARANCE;
  const leftX = targetPort.x - EDGE_NODE_CLEARANCE;
  return [
    sourcePort,
    { x: rightX, y: sourcePort.y },
    { x: rightX, y: aboveY },
    { x: leftX, y: aboveY },
    { x: leftX, y: targetPort.y },
    targetPort,
  ];
};

const addCoordinate = (values: Map<number, true>, value: number, min: number, max: number) => {
  const rounded = roundCoordinate(value);
  if (rounded < min - EPSILON || rounded > max + EPSILON) return;
  values.set(rounded, true);
};

const collectCoordinates = (
  geometry: EdgeGeometry,
  window: RoutingRect,
  obstacles: readonly RoutingRect[],
  occupied: readonly Segment[],
) => {
  const xValues = new Map<number, true>();
  const yValues = new Map<number, true>();
  const addX = (value: number) => addCoordinate(xValues, value, window.left, window.right);
  const addY = (value: number) => addCoordinate(yValues, value, window.top, window.bottom);
  addX(window.left);
  addX(window.right);
  addY(window.top);
  addY(window.bottom);
  addX(geometry.sourceGateway.x);
  addX(geometry.targetGateway.x);
  addY(geometry.sourceGateway.y);
  addY(geometry.targetGateway.y);
  for (const obstacle of obstacles) {
    addX(obstacle.left);
    addX(obstacle.right);
    addX(obstacle.left - LANE_SPACING);
    addX(obstacle.right + LANE_SPACING);
    addY(obstacle.top);
    addY(obstacle.bottom);
    addY(obstacle.top - LANE_SPACING);
    addY(obstacle.bottom + LANE_SPACING);
  }
  const corridor = inflateRect(getSegmentRect(geometry.sourceGateway, geometry.targetGateway), LANE_SPACING);
  for (const segment of occupied) {
    if (!rectsIntersect(getSegmentRect(segment.a, segment.b), corridor)) continue;
    if (segment.direction === "vertical") {
      addX(segment.a.x - LANE_SPACING);
      addX(segment.a.x + LANE_SPACING);
    } else {
      addY(segment.a.y - LANE_SPACING);
      addY(segment.a.y + LANE_SPACING);
    }
  }
  const sortNumbers = (a: number, b: number) => a - b;
  return { xValues: [...xValues.keys()].sort(sortNumbers), yValues: [...yValues.keys()].sort(sortNumbers) };
};

const getStateIndex = (xIndex: number, yIndex: number, direction: number, xCount: number) =>
  (yIndex * xCount + xIndex) * 3 + direction;

const getStepIndex = (
  xIndex: number,
  yIndex: number,
  nextXIndex: number,
  nextYIndex: number,
  xCount: number,
  yCount: number,
) =>
  xIndex === nextXIndex ?
    (xCount - 1) * yCount + Math.min(yIndex, nextYIndex) * xCount + xIndex
  : yIndex * (xCount - 1) + Math.min(xIndex, nextXIndex);

const lowerBound = (values: readonly number[], target: number) => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
};

const forEachCrowdedCoordinate = (
  values: readonly number[],
  target: number,
  hug: boolean,
  callback: (index: number, proximity: number) => void,
) => {
  const last = lowerBound(values, target + LANE_SPACING * 2);
  for (let index = lowerBound(values, target - LANE_SPACING * 2); index < last; index += 1) {
    const proximity = getLaneProximity(values[index], target, hug);
    if (proximity > 0) callback(index, proximity);
  }
};

const getStepRange = (values: readonly number[], min: number, max: number) => ({
  first: Math.max(0, lowerBound(values, min - EPSILON) - 1),
  last: Math.min(values.length - 2, lowerBound(values, max + EPSILON)),
});

const buildInteractionCosts = (
  geometry: EdgeGeometry,
  xValues: readonly number[],
  yValues: readonly number[],
  occupied: readonly Segment[],
  crossings: Uint16Array,
  overlap: Float64Array,
) => {
  const horizontalStepCount = (xValues.length - 1) * yValues.length;
  const stepCount = horizontalStepCount + (yValues.length - 1) * xValues.length;
  crossings.fill(0, 0, stepCount);
  overlap.fill(0, 0, stepCount);

  for (const segment of occupied) {
    if (sharesPort(geometry, segment)) continue;
    const { a, b } = segment;
    const hug = !isLaneMate(geometry, segment);
    if (segment.direction === "vertical") {
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      const ySteps = getStepRange(yValues, minY, maxY);
      forEachCrowdedCoordinate(xValues, a.x, hug, (xIndex, proximity) => {
        for (let yIndex = ySteps.first; yIndex <= ySteps.last; yIndex += 1) {
          const length = getRangeOverlapLength(yValues[yIndex], yValues[yIndex + 1], a.y, b.y);
          if (length <= 0) continue;
          overlap[horizontalStepCount + yIndex * xValues.length + xIndex] += length * proximity;
        }
      });
      const xSteps = getStepRange(xValues, a.x, a.x);
      const lastYIndex = Math.min(yValues.length - 1, lowerBound(yValues, maxY + EPSILON));
      for (let yIndex = lowerBound(yValues, minY - EPSILON); yIndex <= lastYIndex; yIndex += 1) {
        const y = yValues[yIndex];
        if (y < minY - EPSILON || y > maxY + EPSILON) continue;
        for (let xIndex = xSteps.first; xIndex <= xSteps.last; xIndex += 1) {
          if (xValues[xIndex] > a.x + EPSILON || xValues[xIndex + 1] < a.x - EPSILON) continue;
          crossings[yIndex * (xValues.length - 1) + xIndex] += 1;
        }
      }
      continue;
    }

    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const xSteps = getStepRange(xValues, minX, maxX);
    forEachCrowdedCoordinate(yValues, a.y, hug, (yIndex, proximity) => {
      for (let xIndex = xSteps.first; xIndex <= xSteps.last; xIndex += 1) {
        const length = getRangeOverlapLength(xValues[xIndex], xValues[xIndex + 1], a.x, b.x);
        if (length <= 0) continue;
        overlap[yIndex * (xValues.length - 1) + xIndex] += length * proximity;
      }
    });
    const ySteps = getStepRange(yValues, a.y, a.y);
    const lastXIndex = Math.min(xValues.length - 1, lowerBound(xValues, maxX + EPSILON));
    for (let xIndex = lowerBound(xValues, minX - EPSILON); xIndex <= lastXIndex; xIndex += 1) {
      const x = xValues[xIndex];
      if (x < minX - EPSILON || x > maxX + EPSILON) continue;
      for (let yIndex = ySteps.first; yIndex <= ySteps.last; yIndex += 1) {
        if (yValues[yIndex] > a.y + EPSILON || yValues[yIndex + 1] < a.y - EPSILON) continue;
        crossings[horizontalStepCount + yIndex * xValues.length + xIndex] += 1;
      }
    }
  }
};

const markBlockedSteps = (
  xValues: readonly number[],
  yValues: readonly number[],
  obstacles: readonly RoutingRect[],
  blocked: Uint8Array,
) => {
  const xCount = xValues.length;
  const yCount = yValues.length;
  const horizontalStepCount = (xCount - 1) * yCount;
  blocked.fill(0, 0, horizontalStepCount + (yCount - 1) * xCount);
  for (const { bottom, left, right, top } of obstacles) {
    const xSteps = getStepRange(xValues, left, right);
    const lastRow = Math.min(yCount - 1, lowerBound(yValues, bottom - EPSILON));
    for (let yIndex = lowerBound(yValues, top + EPSILON); yIndex <= lastRow; yIndex += 1) {
      const y = yValues[yIndex];
      if (y <= top + EPSILON || y >= bottom - EPSILON) continue;
      for (let xIndex = xSteps.first; xIndex <= xSteps.last; xIndex += 1) {
        if (Math.max(xValues[xIndex], left) < Math.min(xValues[xIndex + 1], right)) {
          blocked[yIndex * (xCount - 1) + xIndex] = 1;
        }
      }
    }
    const ySteps = getStepRange(yValues, top, bottom);
    const lastColumn = Math.min(xCount - 1, lowerBound(xValues, right - EPSILON));
    for (let xIndex = lowerBound(xValues, left + EPSILON); xIndex <= lastColumn; xIndex += 1) {
      const x = xValues[xIndex];
      if (x <= left + EPSILON || x >= right - EPSILON) continue;
      for (let yIndex = ySteps.first; yIndex <= ySteps.last; yIndex += 1) {
        if (Math.max(yValues[yIndex], top) < Math.min(yValues[yIndex + 1], bottom)) {
          blocked[horizontalStepCount + yIndex * xCount + xIndex] = 1;
        }
      }
    }
  }
};

const isCellReachable = (
  startCell: number,
  goalCell: number,
  xCount: number,
  yCount: number,
  blockedSteps: Uint8Array,
  visited: Uint8Array,
  queue: Int32Array,
) => {
  const horizontalStepCount = (xCount - 1) * yCount;
  visited.fill(0, 0, xCount * yCount);
  let head = 0;
  let tail = 0;
  queue[tail++] = startCell;
  visited[startCell] = 1;
  const visit = (cell: number) => {
    if (visited[cell]) return;
    visited[cell] = 1;
    queue[tail++] = cell;
  };
  while (head < tail) {
    const cell = queue[head++];
    if (cell === goalCell) return true;
    const xIndex = cell % xCount;
    const yIndex = (cell - xIndex) / xCount;
    if (xIndex > 0 && !blockedSteps[yIndex * (xCount - 1) + xIndex - 1]) visit(cell - 1);
    if (xIndex < xCount - 1 && !blockedSteps[yIndex * (xCount - 1) + xIndex]) visit(cell + 1);
    if (yIndex > 0 && !blockedSteps[horizontalStepCount + (yIndex - 1) * xCount + xIndex]) {
      visit(cell - xCount);
    }
    if (yIndex < yCount - 1 && !blockedSteps[horizontalStepCount + yIndex * xCount + xIndex]) {
      visit(cell + xCount);
    }
  }
  return false;
};

const estimateRemainingCost = (point: RoutingPoint, direction: number, goal: RoutingPoint) => {
  const dx = Math.abs(goal.x - point.x) >= EPSILON;
  const dy = Math.abs(goal.y - point.y) >= EPSILON;
  const needsBend =
    (dx && dy) || (dx && direction === DIRECTION_VERTICAL) || (dy && direction === DIRECTION_HORIZONTAL);
  const bends = needsBend ? 1 : 0;
  return getSegmentLength(point, goal) + bends * BEND_COST;
};

const STEP_DX = [-1, 1, 0, 0];
const STEP_DY = [0, 0, -1, 1];
const STEP_DIRECTION = [DIRECTION_HORIZONTAL, DIRECTION_HORIZONTAL, DIRECTION_VERTICAL, DIRECTION_VERTICAL];

type SearchScratch = {
  backtrackings: Float64Array;
  bendCounts: Uint16Array;
  blockedSteps: Uint8Array;
  closed: Uint8Array;
  crossingCounts: Uint16Array;
  lengths: Float64Array;
  overlaps: Float64Array;
  previousStates: Int32Array;
  queue: Int32Array;
  scores: Float64Array;
  stepCrossings: Uint16Array;
  stepOverlap: Float64Array;
  visited: Uint8Array;
};

const createSearchScratch = (): SearchScratch => ({
  backtrackings: new Float64Array(0),
  bendCounts: new Uint16Array(0),
  blockedSteps: new Uint8Array(0),
  closed: new Uint8Array(0),
  crossingCounts: new Uint16Array(0),
  lengths: new Float64Array(0),
  overlaps: new Float64Array(0),
  previousStates: new Int32Array(0),
  queue: new Int32Array(0),
  scores: new Float64Array(0),
  stepCrossings: new Uint16Array(0),
  stepOverlap: new Float64Array(0),
  visited: new Uint8Array(0),
});

const reserveScratch = (scratch: SearchScratch, cellCount: number, stepCount: number) => {
  const stateCount = cellCount * 3;
  if (scratch.scores.length < stateCount) {
    const size = Math.max(stateCount, scratch.scores.length * 2);
    scratch.backtrackings = new Float64Array(size);
    scratch.bendCounts = new Uint16Array(size);
    scratch.closed = new Uint8Array(size);
    scratch.crossingCounts = new Uint16Array(size);
    scratch.lengths = new Float64Array(size);
    scratch.overlaps = new Float64Array(size);
    scratch.previousStates = new Int32Array(size);
    scratch.scores = new Float64Array(size);
  }
  if (scratch.blockedSteps.length < stepCount) {
    const size = Math.max(stepCount, scratch.blockedSteps.length * 2);
    scratch.blockedSteps = new Uint8Array(size);
    scratch.stepCrossings = new Uint16Array(size);
    scratch.stepOverlap = new Float64Array(size);
  }
  if (scratch.visited.length < cellCount) {
    const size = Math.max(cellCount, scratch.visited.length * 2);
    scratch.queue = new Int32Array(size);
    scratch.visited = new Uint8Array(size);
  }
};

const findOrthogonalRoute = (
  geometry: EdgeGeometry,
  window: RoutingRect,
  bounds: RoutingRect,
  obstacles: readonly RoutingRect[],
  occupied: readonly Segment[],
  scratch: SearchScratch,
) => {
  const { xValues, yValues } = collectCoordinates(geometry, window, obstacles, occupied);
  const startXIndex = xValues.indexOf(geometry.sourceGateway.x);
  const startYIndex = yValues.indexOf(geometry.sourceGateway.y);
  const goalXIndex = xValues.indexOf(geometry.targetGateway.x);
  const goalYIndex = yValues.indexOf(geometry.targetGateway.y);
  if (startXIndex < 0 || startYIndex < 0 || goalXIndex < 0 || goalYIndex < 0) return null;

  const xCount = xValues.length;
  const yCount = yValues.length;
  const cellCount = xCount * yCount;
  if (cellCount > MAX_SEARCH_CELLS) return null;
  reserveScratch(scratch, cellCount, (xCount - 1) * yCount + (yCount - 1) * xCount);
  const { blockedSteps, stepCrossings, stepOverlap } = scratch;
  markBlockedSteps(xValues, yValues, obstacles, blockedSteps);
  const startCell = startYIndex * xCount + startXIndex;
  const goalCell = goalYIndex * xCount + goalXIndex;
  if (!isCellReachable(startCell, goalCell, xCount, yCount, blockedSteps, scratch.visited, scratch.queue)) {
    return null;
  }
  const goal = geometry.targetGateway;
  const { backtrackings, bendCounts, closed, crossingCounts, lengths, overlaps, previousStates, scores } =
    scratch;
  const stateCount = cellCount * 3;
  scores.fill(Infinity, 0, stateCount);
  previousStates.fill(-1, 0, stateCount);
  closed.fill(0, 0, stateCount);
  buildInteractionCosts(geometry, xValues, yValues, occupied, stepCrossings, stepOverlap);
  const frontier = new IndexHeap();
  const startIndex = getStateIndex(startXIndex, startYIndex, DIRECTION_NONE, xCount);
  scores[startIndex] = 0;
  lengths[startIndex] = 0;
  overlaps[startIndex] = 0;
  backtrackings[startIndex] = 0;
  bendCounts[startIndex] = 0;
  crossingCounts[startIndex] = 0;
  frontier.push(estimateRemainingCost(geometry.sourceGateway, DIRECTION_NONE, goal), startIndex);
  const currentPoint = { x: 0, y: 0 };
  const nextPoint = { x: 0, y: 0 };

  while (frontier.size > 0) {
    const currentIndex = frontier.pop();
    if (currentIndex === undefined || closed[currentIndex]) continue;
    closed[currentIndex] = 1;
    const cell = (currentIndex - (currentIndex % 3)) / 3;
    const currentDirection = currentIndex % 3;
    const currentXIndex = cell % xCount;
    const currentYIndex = (cell - currentXIndex) / xCount;
    if (currentXIndex === goalXIndex && currentYIndex === goalYIndex) {
      const points: RoutingPoint[] = [];
      for (let index = currentIndex; index >= 0; index = previousStates[index]) {
        const stateCell = (index - (index % 3)) / 3;
        const xIndex = stateCell % xCount;
        points.push({ x: xValues[xIndex], y: yValues[(stateCell - xIndex) / xCount] });
      }
      points.reverse();
      return simplifyPoints(points);
    }
    currentPoint.x = xValues[currentXIndex];
    currentPoint.y = yValues[currentYIndex];
    const currentBacktracking = backtrackings[currentIndex];
    const currentBends = bendCounts[currentIndex];
    const currentCrossings = crossingCounts[currentIndex];
    const currentLength = lengths[currentIndex];
    const currentOverlap = overlaps[currentIndex];

    for (let step = 0; step < 4; step += 1) {
      const dx = STEP_DX[step];
      const xIndex = currentXIndex + dx;
      const yIndex = currentYIndex + STEP_DY[step];
      if (xIndex < 0 || xIndex >= xCount || yIndex < 0 || yIndex >= yCount) continue;
      const stepIndex = getStepIndex(currentXIndex, currentYIndex, xIndex, yIndex, xCount, yCount);
      if (blockedSteps[stepIndex]) continue;
      nextPoint.x = xValues[xIndex];
      nextPoint.y = yValues[yIndex];
      const direction = STEP_DIRECTION[step];

      const backtracking = currentBacktracking + (dx < 0 ? currentPoint.x - nextPoint.x : 0);
      const bends =
        currentBends + (currentDirection !== DIRECTION_NONE && currentDirection !== direction ? 1 : 0);
      const crossings = currentCrossings + stepCrossings[stepIndex];
      const stepLength = getSegmentLength(currentPoint, nextPoint);
      const length = currentLength + stepLength;
      const outsideStep =
        (currentPoint.x + nextPoint.x) / 2 < bounds.left ||
        (currentPoint.x + nextPoint.x) / 2 > bounds.right ||
        (currentPoint.y + nextPoint.y) / 2 < bounds.top ||
        (currentPoint.y + nextPoint.y) / 2 > bounds.bottom;
      const overlap =
        currentOverlap +
        stepOverlap[stepIndex] +
        (outsideStep ? (stepLength * OUTSIDE_COST) / OVERLAP_COST : 0);
      const score =
        length +
        bends * BEND_COST +
        crossings * CROSSING_COST +
        overlap * OVERLAP_COST +
        backtracking * BACKWARD_COST;
      const index = getStateIndex(xIndex, yIndex, direction, xCount);
      if (closed[index] || scores[index] <= score + EPSILON) continue;
      scores[index] = score;
      lengths[index] = length;
      overlaps[index] = overlap;
      backtrackings[index] = backtracking;
      bendCounts[index] = bends;
      crossingCounts[index] = crossings;
      previousStates[index] = currentIndex;
      frontier.push(score + estimateRemainingCost(nextPoint, direction, goal), index);
    }
  }
  return null;
};

const getWindow = (geometry: EdgeGeometry, margin: number): RoutingRect => ({
  bottom: Math.max(geometry.sourceGateway.y, geometry.targetGateway.y) + margin,
  left: Math.min(geometry.sourceGateway.x, geometry.targetGateway.x) - margin,
  right: Math.max(geometry.sourceGateway.x, geometry.targetGateway.x) + margin,
  top: Math.min(geometry.sourceGateway.y, geometry.targetGateway.y) - margin,
});

const DIRECT_LANE_OFFSETS = [0, 1, -1, 2, -2, 3, -3];

const getDirectCandidates = (geometry: EdgeGeometry) => {
  const { sourceGateway, targetGateway } = geometry;
  if (getDirection(sourceGateway, targetGateway)) return [[sourceGateway, targetGateway]];
  const candidates: RoutingPoint[][] = [];
  // a lane edge travels its lane first, so the fan stays ordered when the lane is clear
  if (geometry.hasSourceLane) {
    candidates.push([sourceGateway, { x: sourceGateway.x, y: targetGateway.y }, targetGateway]);
  }
  if (targetGateway.x <= sourceGateway.x) return candidates;
  const middleX = (sourceGateway.x + targetGateway.x) / 2;
  const halfSpan = (targetGateway.x - sourceGateway.x) / 2;
  for (const lane of DIRECT_LANE_OFFSETS) {
    const offset = lane * LANE_SPACING;
    if (Math.abs(offset) >= halfSpan) continue;
    const x = roundCoordinate(middleX + offset);
    candidates.push([sourceGateway, { x, y: sourceGateway.y }, { x, y: targetGateway.y }, targetGateway]);
  }
  return candidates;
};

const pointsAreClear = (points: readonly RoutingPoint[], obstacles: readonly RoutingRect[]) => {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (stepIsBlocked(points[index], points[index + 1], obstacles)) return false;
  }
  return true;
};

const MAX_CANDIDATE_CROSSINGS = 1;

const candidateIsAcceptable = (
  geometry: EdgeGeometry,
  points: readonly RoutingPoint[],
  occupied: readonly Segment[],
) => {
  let crossings = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (pointEquals(a, b)) continue;
    for (const segment of occupied) {
      if (sharesPort(geometry, segment)) continue;
      if (segmentsShareLane(a, b, segment)) return false;
      if (segmentsTouch({ a, b }, segment)) {
        crossings += 1;
        if (crossings > MAX_CANDIDATE_CROSSINGS) return false;
      }
    }
  }
  return true;
};

const getFallbackPoints = (geometry: EdgeGeometry) => {
  const { sourceGateway, targetGateway } = geometry;
  if (getDirection(sourceGateway, targetGateway)) return [sourceGateway, targetGateway];
  const middleY = roundCoordinate((sourceGateway.y + targetGateway.y) / 2);
  return [
    sourceGateway,
    { x: sourceGateway.x, y: middleY },
    { x: targetGateway.x, y: middleY },
    targetGateway,
  ];
};

const countObstructions = (geometry: EdgeGeometry, obstacles: readonly RoutingRect[]) => {
  const { sourceGateway, targetGateway } = geometry;
  const horizontalFirst = { x: targetGateway.x, y: sourceGateway.y };
  const verticalFirst = { x: sourceGateway.x, y: targetGateway.y };
  const countVia = (middle: RoutingPoint) =>
    obstacles.filter(
      (obstacle) =>
        segmentIntersectsRect(sourceGateway, middle, obstacle) ||
        segmentIntersectsRect(middle, targetGateway, obstacle),
    ).length;
  return Math.min(countVia(horizontalFirst), countVia(verticalFirst));
};

type RoutingContext = {
  bounds: RoutingRect;
  nodesById: ReadonlyMap<string, EdgeRoutingNode>;
  obstaclesByEdgeId: ReadonlyMap<string, readonly RoutingRect[]>;
  rawObstacles: readonly RoutingRect[];
  scratch: SearchScratch;
};

const collectOccupied = (routes: Iterable<RoutedEdge>, exceptEdgeId?: string) => {
  const segments: Segment[] = [];
  for (const route of routes) {
    if (route.geometry.edge.id === exceptEdgeId) continue;
    segments.push(...getRouteSegments(route));
  }
  return segments;
};

const getStubSegments = (geometry: EdgeGeometry) => [
  ...toSegments(geometry.sourceStub, geometry),
  ...toSegments(geometry.targetStub, geometry),
];

const replaceEdgeSegments = (occupied: Segment[], edgeId: string, segments: readonly Segment[]) => {
  let kept = 0;
  for (const segment of occupied) if (segment.edgeId !== edgeId) occupied[kept++] = segment;
  occupied.length = kept;
  occupied.push(...segments);
};

const filterByWindow = <T extends { a: RoutingPoint; b: RoutingPoint }>(
  segments: readonly T[],
  window: RoutingRect,
) => segments.filter((segment) => rectsIntersect(getSegmentRect(segment.a, segment.b), window));

const candidateHasFreeLanes = (
  geometry: EdgeGeometry,
  points: readonly RoutingPoint[],
  occupied: readonly Segment[],
) => {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (pointEquals(a, b)) continue;
    for (const segment of occupied) {
      if (!sharesPort(geometry, segment) && segmentsShareLane(a, b, segment)) return false;
    }
  }
  return true;
};

const findCorridorRoute = (geometry: EdgeGeometry, context: RoutingContext, occupied: readonly Segment[]) => {
  const { sourceGateway, targetGateway } = geometry;
  const obstacles = context.obstaclesByEdgeId.get(geometry.edge.id) ?? [];
  const spanLeft = Math.min(sourceGateway.x, targetGateway.x) - LANE_SPACING * MAX_CORRIDOR_LEG_SHIFTS;
  const spanRight = Math.max(sourceGateway.x, targetGateway.x) + LANE_SPACING * MAX_CORRIDOR_LEG_SHIFTS;
  let top = Math.min(sourceGateway.y, targetGateway.y);
  let bottom = Math.max(sourceGateway.y, targetGateway.y);
  const spanObstacles: RoutingRect[] = [];
  for (const obstacle of obstacles) {
    if (obstacle.right < spanLeft || obstacle.left > spanRight) continue;
    spanObstacles.push(obstacle);
    top = Math.min(top, obstacle.top);
    bottom = Math.max(bottom, obstacle.bottom);
  }
  const middleY = (sourceGateway.y + targetGateway.y) / 2;
  const sides = middleY - top <= bottom - middleY ? [-1, 1] : [1, -1];
  const spanWindow: RoutingRect = {
    bottom: bottom + LANE_SPACING * (MAX_CORRIDOR_LANES + 1),
    left: spanLeft,
    right: spanRight,
    top: top - LANE_SPACING * (MAX_CORRIDOR_LANES + 1),
  };
  const spanOccupied = filterByWindow(occupied, spanWindow);
  const forward = Math.sign(targetGateway.x - sourceGateway.x) || 1;
  // the two stubs depend on the shift alone, so their checks are shared across lanes
  const stubs = Array.from({ length: MAX_CORRIDOR_LEG_SHIFTS + 1 }, (_, shift) => {
    const sourceX = roundCoordinate(sourceGateway.x + forward * shift * LANE_SPACING);
    const targetX = roundCoordinate(targetGateway.x - forward * shift * LANE_SPACING);
    const sourceStub = [sourceGateway, { x: sourceX, y: sourceGateway.y }];
    const targetStub = [{ x: targetX, y: targetGateway.y }, targetGateway];
    return {
      clear: pointsAreClear(sourceStub, spanObstacles) && pointsAreClear(targetStub, spanObstacles),
      freeLanes:
        candidateHasFreeLanes(geometry, sourceStub, spanOccupied) &&
        candidateHasFreeLanes(geometry, targetStub, spanOccupied),
      sourceX,
      targetX,
    };
  });
  let fallback: RoutingPoint[] | null = null;
  for (const side of sides) {
    const baseY = side < 0 ? top - LANE_SPACING : bottom + LANE_SPACING;
    for (let lane = 0; lane < MAX_CORRIDOR_LANES; lane += 1) {
      const y = roundCoordinate(baseY + side * lane * LANE_SPACING);
      for (let shift = 0; shift <= MAX_CORRIDOR_LEG_SHIFTS; shift += 1) {
        const stub = stubs[shift];
        if (!stub.clear) continue;
        const legs = [
          { x: stub.sourceX, y: sourceGateway.y },
          { x: stub.sourceX, y },
          { x: stub.targetX, y },
          { x: stub.targetX, y: targetGateway.y },
        ];
        if (!pointsAreClear(legs, spanObstacles)) continue;
        const points = [sourceGateway, ...legs, targetGateway];
        if (stub.freeLanes && candidateHasFreeLanes(geometry, legs, spanOccupied)) {
          return simplifyPoints(points);
        }
        fallback ??= simplifyPoints(points);
        break;
      }
    }
  }
  return fallback;
};

const isGatewayEnclosed = (geometry: EdgeGeometry, obstacles: readonly RoutingRect[]) =>
  !pointEquals(geometry.sourceGateway, geometry.targetGateway) &&
  obstacles.some(
    (obstacle) =>
      isPointInsideRect(geometry.sourceGateway, obstacle) ||
      isPointInsideRect(geometry.targetGateway, obstacle),
  );

const searchRoute = (geometry: EdgeGeometry, context: RoutingContext, occupied: readonly Segment[]) => {
  const obstacles = context.obstaclesByEdgeId.get(geometry.edge.id) ?? [];
  // every step into or out of a point inside an obstacle is blocked, so no window can
  // contain a route; a node dragged over another node's ports hits this every frame
  if (isGatewayEnclosed(geometry, obstacles)) return findCorridorRoute(geometry, context, occupied);
  const windows = [
    getWindow(geometry, SEARCH_WINDOW_MARGIN),
    getWindow(geometry, SEARCH_WINDOW_MARGIN * SEARCH_WINDOW_GROWTH),
    inflateRect(context.bounds, SEARCH_WINDOW_MARGIN),
  ];
  for (const window of windows) {
    const localObstacles = obstacles.filter((obstacle) => rectsIntersect(obstacle, window));
    const localOccupied = filterByWindow(occupied, window);
    for (const candidate of getDirectCandidates(geometry)) {
      if (
        pointsAreClear(candidate, localObstacles) &&
        candidateIsAcceptable(geometry, candidate, localOccupied)
      ) {
        return candidate;
      }
    }
    const points = findOrthogonalRoute(
      geometry,
      window,
      context.bounds,
      localObstacles,
      localOccupied,
      context.scratch,
    );
    if (points) return points;
  }
  return findCorridorRoute(geometry, context, occupied);
};

const PORT_ROW_CUT_REACH = LANE_SPACING * 2;

const findPortRowCrossing = (
  points: readonly RoutingPoint[],
  gateway: RoutingPoint,
  port: RoutingPoint,
  end: "end" | "start",
  reach: number,
) => {
  // route points are rounded, so the row must be too or a leg starting on it reads as crossing
  const rowY = roundCoordinate(port.y);
  const step = end === "start" ? 1 : -1;
  for (let index = end === "start" ? 0 : points.length - 1; ; index += step) {
    const next = index + step;
    if (next < 0 || next >= points.length) return null;
    const a = points[index];
    const b = points[next];
    if (getDirection(a, b) !== "vertical") continue;
    if (Math.abs(a.x - gateway.x) > reach + EPSILON) return null;
    if ((a.y - rowY) * (b.y - rowY) < -EPSILON) return { far: next, x: a.x };
  }
};

const findSourceRowCrossing = (route: RoutedEdge, reach: number) =>
  findPortRowCrossing(
    route.points,
    route.geometry.sourceGateway,
    route.geometry.edge.sourcePort,
    "start",
    reach,
  );

const findTargetRowCrossing = (route: RoutedEdge, reach: number) =>
  findPortRowCrossing(
    route.points,
    route.geometry.targetGateway,
    route.geometry.edge.targetPort,
    "end",
    reach,
  );

const cutAtPortRows = (route: RoutedEdge, obstacles: readonly RoutingRect[]): RoutedEdge => {
  const { edge, endpointClearance, hasSourceLane } = route.geometry;
  let { sourceGateway, targetGateway } = route.geometry;
  let points = route.points;
  // a stub always lies inside its own node's clearance, so only foreign obstacles count
  const foreignObstacles = (port: RoutingPoint) => obstacles.filter((rect) => !isPointInsideRect(port, rect));
  for (;;) {
    const crossing = findPortRowCrossing(
      points,
      route.geometry.targetGateway,
      edge.targetPort,
      "end",
      PORT_ROW_CUT_REACH,
    );
    if (!crossing) break;
    const gateway = { x: crossing.x, y: roundCoordinate(edge.targetPort.y) };
    if (!pointsAreClear([gateway, roundPoint(edge.targetPort)], foreignObstacles(edge.targetPort))) break;
    const cut = [...points.slice(0, crossing.far + 1), gateway];
    if (cut.length >= points.length) break;
    targetGateway = gateway;
    points = cut;
  }
  for (;;) {
    const crossing = findPortRowCrossing(
      points,
      route.geometry.sourceGateway,
      edge.sourcePort,
      "start",
      PORT_ROW_CUT_REACH,
    );
    if (!crossing) break;
    const gateway = { x: crossing.x, y: roundCoordinate(edge.sourcePort.y) };
    if (!pointsAreClear([roundPoint(edge.sourcePort), gateway], foreignObstacles(edge.sourcePort))) break;
    const cut = [gateway, ...points.slice(crossing.far)];
    if (cut.length >= points.length) break;
    sourceGateway = gateway;
    points = cut;
  }
  if (points === route.points) return route;
  return {
    geometry: createGeometry(edge, endpointClearance, sourceGateway, targetGateway, hasSourceLane),
    points: simplifyPoints(points),
  };
};

const routeGeometry = (
  geometry: EdgeGeometry,
  context: RoutingContext,
  occupied: readonly Segment[],
): RoutedEdge | null => {
  // the edge's own stubs are registered before it is routed and would otherwise shape its grid
  const others = occupied.filter((segment) => segment.edgeId !== geometry.edge.id);
  const points = searchRoute(geometry, context, others);
  if (!points) return null;
  const route = { geometry, points };
  const sourceCrossing = findSourceRowCrossing(route, PORT_ZONE_WIDTH);
  const targetCrossing = findTargetRowCrossing(route, PORT_ZONE_WIDTH);
  if (!sourceCrossing && !targetCrossing) return route;
  const obstacles = context.obstaclesByEdgeId.get(geometry.edge.id) ?? [];
  const { sourcePort, targetPort } = geometry.edge;
  const mirrored = createGeometry(
    geometry.edge,
    geometry.endpointClearance,
    sourceCrossing ? mirrorGateway(geometry.sourceGateway, sourcePort) : geometry.sourceGateway,
    targetCrossing ? mirrorGateway(geometry.targetGateway, targetPort) : geometry.targetGateway,
    geometry.hasSourceLane,
  );
  const mirroredPoints = searchRoute(mirrored, context, others);
  const candidates = [cutAtPortRows(route, obstacles)];
  if (mirroredPoints) {
    candidates.push(cutAtPortRows({ geometry: mirrored, points: mirroredPoints }, obstacles));
  }
  return candidates.reduce((best, candidate) =>
    getRouteCost(candidate, others) < getRouteCost(best, others) ? candidate : best,
  );
};

const routeAll = (
  geometries: readonly EdgeGeometry[],
  context: RoutingContext,
  routes: Map<string, RoutedEdge>,
  occupied: Segment[],
) => {
  // lane edges hold fixed trunk positions by design, so they go first and everything else
  // routes around the fan
  const ordered = [...geometries].sort(
    (a, b) =>
      Number(b.hasSourceLane) - Number(a.hasSourceLane) ||
      countObstructions(b, context.obstaclesByEdgeId.get(b.edge.id) ?? []) -
        countObstructions(a, context.obstaclesByEdgeId.get(a.edge.id) ?? []) ||
      getSegmentLength(b.sourceGateway, b.targetGateway) -
        getSegmentLength(a.sourceGateway, a.targetGateway) ||
      a.edge.id.localeCompare(b.edge.id),
  );
  for (const geometry of ordered) {
    const selfRect =
      geometry.edge.source === geometry.edge.target && context.nodesById.get(geometry.edge.source)?.rect;
    let route: RoutedEdge;
    if (selfRect) {
      route = {
        geometry: { ...geometry, sourceStub: [], targetStub: [] },
        points: getSelfLoopPoints(geometry, selfRect),
      };
    } else {
      const routed = routeGeometry(geometry, context, occupied);
      if (routed) {
        route = routed;
      } else {
        const relaxed = findOrthogonalRoute(
          geometry,
          inflateRect(context.bounds, SEARCH_WINDOW_MARGIN),
          context.bounds,
          context.rawObstacles,
          [],
          context.scratch,
        );
        route = { geometry, points: relaxed ?? getFallbackPoints(geometry) };
      }
    }
    routes.set(geometry.edge.id, route);
    replaceEdgeSegments(occupied, geometry.edge.id, getRouteSegments(route));
  }
  return routes;
};

const getRouteCost = (route: RoutedEdge, others: readonly Segment[]) => {
  const points = combinePoints(route);
  let length = 0;
  let bends = 0;
  let backtracking = 0;
  let crossings = 0;
  let overlap = 0;
  const window = getWindow(route.geometry, 0);
  for (const point of points) {
    window.left = Math.min(window.left, point.x);
    window.right = Math.max(window.right, point.x);
    window.top = Math.min(window.top, point.y);
    window.bottom = Math.max(window.bottom, point.y);
  }
  const nearby = filterByWindow(others, window);
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    length += getSegmentLength(a, b);
    if (b.x < a.x) backtracking += a.x - b.x;
    if (index > 0 && getDirection(points[index - 1], a) !== getDirection(a, b)) bends += 1;
    for (const segment of nearby) {
      if (sharesPort(route.geometry, segment)) continue;
      overlap += getSegmentOverlapLength(a, b, segment, !isLaneMate(route.geometry, segment));
      if (getSegmentsIntersection({ a, b }, segment)) crossings += 1;
    }
  }
  return (
    length +
    bends * BEND_COST +
    crossings * CROSSING_COST +
    overlap * OVERLAP_COST +
    backtracking * BACKWARD_COST
  );
};

const CROSSING_CELL_SIZE = 256;

const collectCrossings = (routes: ReadonlyMap<string, RoutedEdge>) => {
  const cells = new Map<string, Segment[]>();
  const verticals: Segment[] = [];
  const cellIndex = (value: number) => Math.floor(value / CROSSING_CELL_SIZE);
  for (const route of routes.values()) {
    for (const segment of getRouteSegments(route)) {
      if (segment.direction === "vertical") {
        verticals.push(segment);
        continue;
      }
      const row = cellIndex(segment.a.y);
      const first = cellIndex(Math.min(segment.a.x, segment.b.x));
      const last = cellIndex(Math.max(segment.a.x, segment.b.x));
      for (let column = first; column <= last; column += 1) {
        const key = `${column},${row}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(segment);
        else cells.set(key, [segment]);
      }
    }
  }
  const crossings: Crossing[] = [];
  for (const vertical of verticals) {
    const column = cellIndex(vertical.a.x);
    const first = cellIndex(Math.min(vertical.a.y, vertical.b.y));
    const last = cellIndex(Math.max(vertical.a.y, vertical.b.y));
    for (let row = first; row <= last; row += 1) {
      const bucket = cells.get(`${column},${row}`);
      if (!bucket) continue;
      for (const horizontal of bucket) {
        if (horizontal.edgeId === vertical.edgeId) continue;
        const point = getPerpendicularIntersection(horizontal, vertical, BRIDGE_RADIUS);
        if (point) crossings.push({ horizontal, point, vertical });
      }
    }
  }
  return crossings;
};

const rerouteCrossings = (routes: Map<string, RoutedEdge>, context: RoutingContext) => {
  const crossings = collectCrossings(routes);
  const crossingCounts = new Map<string, number>();
  for (const crossing of crossings) {
    for (const segment of [crossing.horizontal, crossing.vertical]) {
      crossingCounts.set(segment.edgeId, (crossingCounts.get(segment.edgeId) ?? 0) + 1);
    }
  }
  const candidates = Array.from(crossingCounts, ([edgeId, count]) => ({ edgeId, count }))
    .sort((a, b) => b.count - a.count || a.edgeId.localeCompare(b.edgeId))
    .slice(0, CROSSING_IMPROVEMENT_ATTEMPTS);
  let changed = false;
  for (const { edgeId } of candidates) {
    const current = routes.get(edgeId);
    if (!current || current.geometry.edge.source === current.geometry.edge.target) continue;
    const others = collectOccupied(routes.values(), edgeId);
    const candidate = routeGeometry(current.geometry, context, others);
    if (!candidate) continue;
    if (getRouteCost(candidate, others) < getRouteCost(current, others) - EPSILON) {
      routes.set(edgeId, candidate);
      changed = true;
    }
  }
  return changed ? collectCrossings(routes) : crossings;
};

const buildPathCrossings = (crossings: readonly Crossing[]) => {
  const byEdgeId = new Map<string, PathCrossing[]>();
  const add = (segment: Segment, point: RoutingPoint, bridged: boolean) => {
    const edgeCrossings = byEdgeId.get(segment.edgeId) ?? [];
    edgeCrossings.push({ bridged, point, segmentIndex: segment.segmentIndex });
    byEdgeId.set(segment.edgeId, edgeCrossings);
  };
  for (const crossing of crossings) {
    add(crossing.horizontal, crossing.point, true);
    add(crossing.vertical, crossing.point, false);
  }
  return byEdgeId;
};

const moveToward = (from: RoutingPoint, to: RoutingPoint, distance: number) => {
  const total = Math.hypot(to.x - from.x, to.y - from.y);
  if (total < EPSILON) return from;
  const ratio = Math.min(1, distance / total);
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
};

const formatCoordinate = (value: number) => {
  const rounded = roundCoordinate(value);
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

const formatPoint = (point: RoutingPoint) => `${formatCoordinate(point.x)} ${formatCoordinate(point.y)}`;

const BRIDGE_CORNER_GAP = 6;
const MIN_CORNER_RADIUS = 6;
const QUARTER_ARC_CONTROL = 0.5523;

const getCornerRadii = (points: readonly RoutingPoint[], crossings: readonly PathCrossing[]) => {
  const radii = points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return 0;
    return Math.min(
      EDGE_CORNER_RADIUS,
      getSegmentLength(points[index - 1], point) / 3,
      getSegmentLength(point, points[index + 1]) / 3,
    );
  });
  // a bridged crossing pushes the neighboring corners back so the arc sits on a straight run;
  // a corner never shrinks below the floor, so a hop that still does not fit is dropped instead
  for (const crossing of crossings) {
    if (!crossing.bridged) continue;
    const start = points[crossing.segmentIndex];
    const end = points[crossing.segmentIndex + 1];
    if (!start || !end) continue;
    const margin = BRIDGE_RADIUS + BRIDGE_CORNER_GAP;
    const shrink = (index: number, room: number) => {
      radii[index] = Math.max(
        Math.min(radii[index], room - margin),
        Math.min(radii[index], MIN_CORNER_RADIUS),
      );
    };
    shrink(crossing.segmentIndex, getSegmentLength(start, crossing.point));
    shrink(crossing.segmentIndex + 1, getSegmentLength(crossing.point, end));
  }
  return radii;
};

type BridgeSpan = { from: number; to: number };

const BRIDGE_GROUP_GAP = 4;

const getBridgeSpans = (
  start: RoutingPoint,
  end: RoutingPoint,
  crossings: readonly PathCrossing[],
  startInset: number,
  endInset: number,
) => {
  const length = getSegmentLength(start, end);
  const room = {
    from: startInset > 0 ? startInset + BRIDGE_CORNER_GAP : 0,
    to: length - (endInset > 0 ? endInset + BRIDGE_CORNER_GAP : 0),
  };
  const centers = crossings
    .map((crossing) => getSegmentLength(start, crossing.point))
    .filter(
      (center) =>
        center - BRIDGE_RADIUS >= room.from - EPSILON && center + BRIDGE_RADIUS <= room.to + EPSILON,
    )
    .sort((a, b) => a - b);
  const spans: BridgeSpan[] = [];
  for (const center of centers) {
    const previous = spans[spans.length - 1];
    if (previous && center - BRIDGE_RADIUS <= previous.to + BRIDGE_GROUP_GAP) {
      previous.to = Math.max(previous.to, center + BRIDGE_RADIUS);
      continue;
    }
    spans.push({ from: center - BRIDGE_RADIUS, to: center + BRIDGE_RADIUS });
  }
  return spans;
};

const BRIDGE_GAP_CLEARANCE = 2;
const MIN_DASH_LENGTH = 4;

const getBridgeGaps = (
  start: RoutingPoint,
  end: RoutingPoint,
  crossings: readonly PathCrossing[],
  startInset: number,
  endInset: number,
) => {
  const length = getSegmentLength(start, end);
  const towardArch = getDirection(start, end) === "vertical" ? end.y < start.y : end.x < start.x;
  const archOffset = towardArch ? BRIDGE_RADIUS : -BRIDGE_RADIUS;
  const centers = crossings
    .map((crossing) => getSegmentLength(start, crossing.point) + archOffset)
    .sort((a, b) => a - b);
  const gaps: BridgeSpan[] = [];
  for (const center of centers) {
    const from = center - BRIDGE_GAP_CLEARANCE;
    const to = center + BRIDGE_GAP_CLEARANCE;
    if (from < startInset - EPSILON || to > length - endInset + EPSILON) continue;
    const previous = gaps[gaps.length - 1];
    if (previous && from - previous.to < MIN_DASH_LENGTH) previous.to = Math.max(previous.to, to);
    else gaps.push({ from, to });
  }
  return gaps;
};

const appendSegment = (
  commands: string[],
  start: RoutingPoint,
  end: RoutingPoint,
  segmentStart: RoutingPoint,
  spans: readonly BridgeSpan[],
  gaps: readonly BridgeSpan[],
) => {
  const horizontal = getDirection(start, end) === "horizontal";
  const unit = horizontal ? { x: Math.sign(end.x - start.x), y: 0 } : { x: 0, y: Math.sign(end.y - start.y) };
  const normal = horizontal ? { x: 0, y: -1 } : { x: -1, y: 0 };
  const at = (distance: number, lift = 0) => ({
    x: start.x + unit.x * distance + normal.x * lift,
    y: start.y + unit.y * distance + normal.y * lift,
  });
  const radius = BRIDGE_RADIUS;
  const control = QUARTER_ARC_CONTROL * radius;
  const features = [
    ...spans.map((span) => ({ ...span, arc: true })),
    ...gaps.map((gap) => ({ ...gap, arc: false })),
  ].sort((a, b) => a.from - b.from);
  let cursor = segmentStart;
  for (const { arc, from, to } of features) {
    const before = at(from);
    const after = at(to);
    if (!pointEquals(cursor, before)) commands.push(`L ${formatPoint(before)}`);
    if (arc) {
      const riseTop = at(from + radius, radius);
      const fallTop = at(to - radius, radius);
      commands.push(
        `C ${formatPoint(at(from, control))} ${formatPoint(at(from + radius - control, radius))} ${formatPoint(riseTop)}`,
      );
      if (!pointEquals(riseTop, fallTop)) commands.push(`L ${formatPoint(fallTop)}`);
      commands.push(
        `C ${formatPoint(at(to - radius + control, radius))} ${formatPoint(at(to, control))} ${formatPoint(after)}`,
      );
    } else {
      commands.push(`M ${formatPoint(after)}`);
    }
    cursor = after;
  }
  commands.push(`L ${formatPoint(end)}`);
};

type SegmentPlan = {
  gaps: BridgeSpan[];
  segmentEnd: RoutingPoint;
  segmentStart: RoutingPoint;
  spans: BridgeSpan[];
};

const planSegments = (points: readonly RoutingPoint[], crossings: readonly PathCrossing[]) => {
  const radii = getCornerRadii(points, crossings);
  const plans: SegmentPlan[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const startVertex = points[index];
    const endVertex = points[index + 1];
    const segmentCrossings = crossings.filter((crossing) => crossing.segmentIndex === index);
    plans.push({
      gaps: getBridgeGaps(
        startVertex,
        endVertex,
        segmentCrossings.filter((crossing) => !crossing.bridged),
        radii[index],
        radii[index + 1],
      ),
      segmentEnd: moveToward(endVertex, startVertex, radii[index + 1]),
      segmentStart: moveToward(startVertex, endVertex, radii[index]),
      spans: getBridgeSpans(
        startVertex,
        endVertex,
        segmentCrossings.filter((crossing) => crossing.bridged),
        radii[index],
        radii[index + 1],
      ),
    });
  }
  return plans;
};

export const getBridgedCrossingPoints = (
  points: readonly RoutingPoint[],
  crossings: readonly PathCrossing[],
) => {
  const plans = planSegments(points, crossings);
  const bridged = new Set<RoutingPoint>();
  for (const crossing of crossings) {
    if (!crossing.bridged) continue;
    const plan = plans[crossing.segmentIndex];
    if (!plan) continue;
    const distance = getSegmentLength(points[crossing.segmentIndex], crossing.point);
    if (plan.spans.some((span) => distance >= span.from - EPSILON && distance <= span.to + EPSILON)) {
      bridged.add(crossing.point);
    }
  }
  return bridged;
};

export const toRoundedPath = (points: readonly RoutingPoint[], crossings: readonly PathCrossing[] = []) => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${formatPoint(points[0])}`;
  const commands = [`M ${formatPoint(points[0])}`];
  for (const [index, plan] of planSegments(points, crossings).entries()) {
    const startVertex = points[index];
    if (!pointEquals(plan.segmentStart, startVertex)) {
      commands.push(`Q ${formatPoint(startVertex)} ${formatPoint(plan.segmentStart)}`);
    }
    appendSegment(commands, startVertex, plan.segmentEnd, plan.segmentStart, plan.spans, plan.gaps);
  }
  return commands.join(" ");
};

const buildEdgeRoute = (points: RoutingPoint[], crossings: readonly PathCrossing[]) => {
  let simplePath: string | undefined;
  if (points.length === 4) {
    const [start, firstTurn, secondTurn, end] = points;
    const departure = getDirection(start, firstTurn);
    const arrival = getDirection(secondTurn, end);
    const middle = getDirection(firstTurn, secondTurn);
    const compact =
      departure !== null &&
      departure === arrival &&
      departure !== middle &&
      getSegmentLength(firstTurn, secondTurn) < LANE_SPACING * 2;
    if (compact) {
      simplePath = `M ${formatPoint(start)} C ${formatPoint(firstTurn)} ${formatPoint(secondTurn)} ${formatPoint(end)}`;
    }
  }
  simplePath ??= toRoundedPath(points);
  return {
    path: crossings.length === 0 ? simplePath : toRoundedPath(points, crossings),
    points,
    simplePath,
  };
};

const getRouteRect = (route: RoutedEdge) => {
  const rect: RoutingRect = { bottom: -Infinity, left: Infinity, right: -Infinity, top: Infinity };
  for (const point of combinePoints(route)) {
    rect.left = Math.min(rect.left, point.x);
    rect.right = Math.max(rect.right, point.x);
    rect.top = Math.min(rect.top, point.y);
    rect.bottom = Math.max(rect.bottom, point.y);
  }
  return rect;
};

const rectEquals = (a: RoutingRect, b: RoutingRect) =>
  a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom;

const gatewayEquals = (a: RoutingPoint, b: RoutingPoint, port: RoutingPoint) =>
  pointEquals(a, b) || pointEquals(a, mirrorGateway(b, port));

const geometryEquals = (a: EdgeGeometry, b: EdgeGeometry) =>
  a.edge.source === b.edge.source &&
  a.edge.target === b.edge.target &&
  pointEquals(a.edge.sourcePort, b.edge.sourcePort) &&
  pointEquals(a.edge.targetPort, b.edge.targetPort) &&
  gatewayEquals(a.sourceGateway, b.sourceGateway, b.edge.sourcePort) &&
  gatewayEquals(a.targetGateway, b.targetGateway, b.edge.targetPort);

const INCREMENTAL_REROUTE_SHARE = 0.4;

export type EdgeRouterState = { nodes: EdgeRoutingNode[]; routes: Record<string, RoutedEdge> };

export type EdgeRouter = {
  getState: () => EdgeRouterState | null;
  route: (input: EdgeRoutingInput) => EdgeRoutes;
};

const findReusableRoutes = (
  previous: EdgeRouterState,
  nodesById: ReadonlyMap<string, EdgeRoutingNode>,
  geometries: readonly EdgeGeometry[],
) => {
  const previousNodesById = new Map(previous.nodes.map((node) => [node.id, node]));
  const changedRects: RoutingRect[] = [];
  for (const node of nodesById.values()) {
    const before = previousNodesById.get(node.id);
    if (!before) changedRects.push(inflateRect(node.rect, EDGE_NODE_CLEARANCE));
    else if (!rectEquals(before.rect, node.rect)) {
      changedRects.push(
        inflateRect(before.rect, EDGE_NODE_CLEARANCE),
        inflateRect(node.rect, EDGE_NODE_CLEARANCE),
      );
    }
  }
  for (const node of previous.nodes) {
    if (!nodesById.has(node.id)) changedRects.push(inflateRect(node.rect, EDGE_NODE_CLEARANCE));
  }
  const reusable = new Map<string, RoutedEdge>();
  for (const geometry of geometries) {
    const route = previous.routes[geometry.edge.id];
    if (!route || !geometryEquals(route.geometry, geometry)) continue;
    const routeRect = inflateRect(getRouteRect(route), LANE_SPACING);
    const nearbyRects = changedRects.filter((rect) => rectsIntersect(rect, routeRect));
    if (nearbyRects.length > 0 && !pointsAreClear(combinePoints(route), nearbyRects)) continue;
    reusable.set(geometry.edge.id, route);
  }
  return reusable;
};

const getCrossingKey = (crossings: readonly PathCrossing[]) =>
  crossings
    .map(
      (crossing) =>
        `${crossing.segmentIndex}:${crossing.bridged ? 1 : 0}:${crossing.point.x}:${crossing.point.y}`,
    )
    .join(";");

export const createEdgeRouter = (initialState: EdgeRouterState | null = null): EdgeRouter => {
  let previous = initialState;
  const outputCache = new WeakMap<RoutedEdge, { crossingKey: string; output: EdgeRoute }>();
  const scratch = createSearchScratch();

  const route = (input: EdgeRoutingInput): EdgeRoutes => {
    const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
    const rawObstacles = input.nodes.map((node) => node.rect);
    const inflatedObstacles = input.nodes.map((node) => inflateRect(node.rect, EDGE_NODE_CLEARANCE));
    const geometries = buildGeometries(input, nodesById, inflatedObstacles);
    const bounds: RoutingRect = { bottom: -Infinity, left: Infinity, right: -Infinity, top: Infinity };
    for (const rect of rawObstacles) {
      bounds.left = Math.min(bounds.left, rect.left);
      bounds.right = Math.max(bounds.right, rect.right);
      bounds.top = Math.min(bounds.top, rect.top);
      bounds.bottom = Math.max(bounds.bottom, rect.bottom);
    }
    for (const geometry of geometries) {
      for (const point of [geometry.sourceGateway, geometry.targetGateway]) {
        bounds.left = Math.min(bounds.left, point.x);
        bounds.right = Math.max(bounds.right, point.x);
        bounds.top = Math.min(bounds.top, point.y);
        bounds.bottom = Math.max(bounds.bottom, point.y);
      }
    }
    const obstaclesByEdgeId = new Map(
      geometries.map((geometry) => [
        geometry.edge.id,
        input.nodes.map((node, index) =>
          node.id === geometry.edge.source || node.id === geometry.edge.target ?
            inflateRect(node.rect, geometry.endpointClearance)
          : inflatedObstacles[index],
        ),
      ]),
    );
    const context: RoutingContext = { bounds, nodesById, obstaclesByEdgeId, rawObstacles, scratch };

    let reusable =
      previous ? findReusableRoutes(previous, nodesById, geometries) : new Map<string, RoutedEdge>();
    if (reusable.size < geometries.length * INCREMENTAL_REROUTE_SHARE) reusable = new Map();
    const routes = new Map(reusable);
    const occupied = collectOccupied(routes.values());
    const pending = geometries.filter((geometry) => !reusable.has(geometry.edge.id));
    for (const geometry of pending) occupied.push(...getStubSegments(geometry));
    routeAll(pending, context, routes, occupied);
    const crossings = rerouteCrossings(routes, context);
    previous = { nodes: input.nodes, routes: Object.fromEntries(routes) };

    const pathCrossings = buildPathCrossings(crossings);
    const bridgedPoints = new Set<RoutingPoint>();
    for (const [edgeId, edgeCrossings] of pathCrossings) {
      const routed = routes.get(edgeId);
      if (!routed) continue;
      for (const point of getBridgedCrossingPoints(combinePoints(routed), edgeCrossings)) {
        bridgedPoints.add(point);
      }
    }
    const result: EdgeRoutes = {};
    for (const [edgeId, routed] of routes) {
      const edgeCrossings = (pathCrossings.get(edgeId) ?? []).filter(
        (crossing) => crossing.bridged || bridgedPoints.has(crossing.point),
      );
      const crossingKey = getCrossingKey(edgeCrossings);
      const cached = outputCache.get(routed);
      if (cached && cached.crossingKey === crossingKey) {
        result[edgeId] = cached.output;
        continue;
      }
      const output = buildEdgeRoute(combinePoints(routed), edgeCrossings);
      outputCache.set(routed, { crossingKey, output });
      result[edgeId] = output;
    }
    return result;
  };

  return { getState: () => previous, route };
};

export const routeModelEdges = (input: EdgeRoutingInput) => createEdgeRouter().route(input);
