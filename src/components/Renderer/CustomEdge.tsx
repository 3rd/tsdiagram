import { useMemo } from "react";
import { getSmartEdge, PathFindingFunction, SVGDrawFunction } from "@tisoap/react-flow-smart-edge";
import { DiagonalMovement, JumpPointFinder } from "pathfinding";
import { BezierEdge, EdgeProps, useNodes, XYPosition } from "reactflow";
import { useIsEdgeDecorated } from "../../stores/graph";
import { Direction } from "../../types";
// import { edgeSegmentCache } from "../../edge-segment-cache";

const toPoint = ([x, y]: number[]): XYPosition => ({ x, y });
// const toXYPosition = ({ x, y }: XYPosition): [number, number] => [x, y];

const getDirection = (a: XYPosition, b: XYPosition) => {
  if (a.x === b.x) {
    if (a.y > b.y) return Direction.Top;
    return Direction.Bottom;
  } else if (a.y === b.y) {
    if (a.x > b.x) return Direction.Left;
    return Direction.Right;
  }
  return Direction.None;
};

const processSegments = (points: XYPosition[]) => {
  const segments: { start: XYPosition; end: XYPosition; direction: Direction }[] = [];
  const directions = points
    .map((_, index) => {
      if (index === 0) return Direction.None;
      return getDirection(points[index - 1], points[index]);
    })
    .slice(1);

  let [prev, curr] = points;
  let prevDirection = directions[0];

  // align first segment
  if (prevDirection === Direction.None) {
    const nextDirection = directions[1];
    if (nextDirection !== Direction.None) {
      prevDirection = nextDirection;
      if (nextDirection === Direction.Right || nextDirection === Direction.Left) {
        curr.x = prev.x;
      } else {
        curr.y = prev.y;
      }
    }
  }

  for (const next of points.slice(2)) {
    const nextDirection = getDirection(curr, next);
    if (nextDirection !== prevDirection) {
      segments.push({ start: prev, end: curr, direction: prevDirection });
      prev = curr;
      prevDirection = nextDirection;
    }
    curr = next;
  }

  const lastSegment = { start: prev, end: curr, direction: prevDirection };

  // align last segment (works, but the arrow goes crazy)
  // if (lastSegment.direction === Direction.None) {
  //   const prevSegment = segments[segments.length - 1];
  //   if (prevSegment.direction === Direction.Right || prevSegment.direction === Direction.Left) {
  //     lastSegment.start.x = lastSegment.end.x;
  //   } else {
  //     lastSegment.start.y = lastSegment.end.y;
  //   }
  // }

  segments.push(lastSegment);
  return segments;
};

const drawEdge: SVGDrawFunction = (source, target, path) => {
  const points = [
    [Math.floor(source.x), Math.floor(source.y)],
    ...path,
    [Math.floor(target.x), Math.floor(target.y)],
  ].map(toPoint);

  try {
    processSegments(points);
    // edgeSegmentCache.set(edge.id, {});
  } catch (error) {
    console.error(error);
  }

  const first = points[0];
  let svgPath = `M${first.x},${first.y}M`;

  let prev = first;

  for (const next of points) {
    const midPoint = { x: (prev.x - next.x) / 2 + next.x, y: (prev.y - next.y) / 2 + next.y };
    svgPath += ` ${midPoint.x},${midPoint.y}`;
    svgPath += `Q${next.x},${next.y}`;
    prev = next;
  }

  const last = points[points.length - 1];
  svgPath += ` ${last.x},${last.y}`;

  return svgPath;
};

const generatePath: PathFindingFunction = (grid, start, end) => {
  try {
    // @ts-ignore
    const finder = new JumpPointFinder({ diagonalMovement: DiagonalMovement.Never });
    const fullPath = finder.findPath(start.x, start.y, end.x, end.y, grid);
    if (fullPath.length === 0) return null;
    return { fullPath, smoothedPath: fullPath };
  } catch {
    return null;
  }
};

const styles = {
  selfLoop: {
    strokeDasharray: "5, 5",
    stroke: "#a9b2bc",
  },
  highlighted: {
    strokeWidth: 1,
  },
  faded: {
    stroke: "#cad0d6",
    strokeOpacity: 0.5,
  },
};

export const CustomEdge = (edge: EdgeProps) => {
  const nodes = useNodes();
  const { highlighted, faded } = useIsEdgeDecorated(edge);

  const edgeStyle = useMemo(() => {
    return {
      ...edge.style,
      ...(edge.source === edge.target ? styles.selfLoop : {}),
      ...(highlighted ? styles.highlighted : {}),
      ...(faded ? styles.faded : {}),
    };
  }, [edge.source, edge.style, edge.target, faded, highlighted]);

  const getSmartEdgeResponse = useMemo(
    () =>
      getSmartEdge({
        sourcePosition: edge.sourcePosition,
        targetPosition: edge.targetPosition,
        sourceX: edge.sourceX,
        sourceY: edge.sourceY,
        targetX: edge.targetX,
        targetY: edge.targetY,
        nodes,
        options: {
          drawEdge,
          generatePath,
          nodePadding: 6,
          gridRatio: 10,
        },
      }),
    [edge.sourcePosition, edge.targetPosition, edge.sourceX, edge.sourceY, edge.targetX, edge.targetY, nodes]
  );

  if (getSmartEdgeResponse === null) {
    return <BezierEdge {...edge} style={edgeStyle} />;
  }

  return (
    <>
      <path
        className="react-flow__edge-path"
        d={getSmartEdgeResponse.svgPathString}
        markerEnd={edge.markerEnd}
        markerStart={edge.markerStart}
        style={edgeStyle}
      />
    </>
  );
};
