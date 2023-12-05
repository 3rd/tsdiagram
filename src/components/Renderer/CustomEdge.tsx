import { useNodes, BezierEdge, EdgeProps } from "reactflow";
import { SVGDrawFunction, getSmartEdge, pathfindingJumpPointNoDiagonal } from "@tisoap/react-flow-smart-edge";

// const distance = (a: XYPosition, b: XYPosition) => Math.hypot(b.x - a.x, b.y - a.y);
// const toPoint = ([x, y]: number[]): XYPosition => ({ x, y });

const getMidPoint = (Ax: number, Ay: number, Bx: number, By: number) => {
  const Zx = (Ax - Bx) / 2 + Bx;
  const Zy = (Ay - By) / 2 + By;
  return [Zx, Zy];
};

const quadraticBezierCurve = (points: number[][]) => {
  const X = 0;
  const Y = 1;
  let point = points[0];

  const first = points[0];
  let svgPath = `M${first[X]},${first[Y]}M`;

  for (const next of points) {
    const midPoint = getMidPoint(point[X], point[Y], next[X], next[Y]);

    svgPath += ` ${midPoint[X]},${midPoint[Y]}`;
    svgPath += `Q${next[X]},${next[Y]}`;
    point = next;
  }

  const last = points[points.length - 1];
  svgPath += ` ${last[0]},${last[1]}`;

  return svgPath;
};

const drawEdge: SVGDrawFunction = (source, target, path) => {
  const points = [[source.x, source.y], ...path, [target.x, target.y]];
  return quadraticBezierCurve(points);
};

const generatePath = pathfindingJumpPointNoDiagonal;

export const CustomEdge = (props: EdgeProps) => {
  const {
    sourcePosition,
    targetPosition,
    sourceX,
    sourceY,
    targetX,
    targetY,
    style,
    markerStart,
    markerEnd,
  } = props;

  const nodes = useNodes();

  const getSmartEdgeResponse = getSmartEdge({
    sourcePosition,
    targetPosition,
    sourceX,
    sourceY,
    targetX,
    targetY,
    nodes,
    options: {
      drawEdge,
      generatePath,
    },
  });

  // console.log({ props, getSmartEdgeResponse });

  if (getSmartEdgeResponse === null) {
    return <BezierEdge {...props} />;
  }

  const { svgPathString } = getSmartEdgeResponse;

  return (
    <>
      <path
        className="react-flow__edge-path"
        d={svgPathString}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
      />
    </>
  );
};
