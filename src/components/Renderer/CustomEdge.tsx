import { memo, useMemo } from "react";
import { EdgeProps, getSmoothStepPath, useStore } from "@xyflow/react";
import { useIsEdgeDecorated } from "../../stores/graph";
import { EDGE_CORNER_RADIUS, EDGE_NODE_CLEARANCE, RoutingPoint } from "./edge-routing";
import { useModelEdgeRoute } from "./EdgeRoutingProvider";
import { ModelEdge } from "./layout";

const ROUTE_ENDPOINT_TOLERANCE_PX = 1;
const ROUTE_STRETCH_LIMIT_PX = EDGE_NODE_CLEARANCE * 2;
const EDGE_INTERACTION_WIDTH = 20;
export const LOW_DETAIL_ZOOM = 0.5;
export const selectLowDetail = (state: { transform: [number, number, number] }) =>
  state.transform[2] < LOW_DETAIL_ZOOM;

const styles = {
  selfLoop: {
    strokeDasharray: "5, 5",
  },
  highlighted: {
    strokeWidth: 1.5,
  },
  faded: {
    strokeOpacity: 0.35,
  },
};

const pointDistance = (point: RoutingPoint | undefined, x: number, y: number) =>
  point === undefined ? Infinity : Math.max(Math.abs(point.x - x), Math.abs(point.y - y));

const stretchToPorts = (path: string, points: RoutingPoint[], edge: EdgeProps) => {
  const first = points[0];
  const last = points[points.length - 1];
  const sourceStub =
    pointDistance(first, edge.sourceX, edge.sourceY) > ROUTE_ENDPOINT_TOLERANCE_PX ?
      `M ${edge.sourceX} ${edge.sourceY} L ${first.x} ${first.y} `
    : "";
  const targetStub =
    pointDistance(last, edge.targetX, edge.targetY) > ROUTE_ENDPOINT_TOLERANCE_PX ?
      ` M ${last.x} ${last.y} L ${edge.targetX} ${edge.targetY}`
    : "";
  return `${sourceStub}${path}${targetStub}`;
};

const useDecoratedEdgeStyle = (edge: EdgeProps) => {
  const { highlighted, faded } = useIsEdgeDecorated(edge);

  return useMemo(() => {
    return {
      ...edge.style,
      ...(edge.source === edge.target ? styles.selfLoop : {}),
      ...(highlighted ? styles.highlighted : {}),
      ...(faded ? styles.faded : {}),
    };
  }, [edge.source, edge.style, edge.target, faded, highlighted]);
};

export const CustomEdge = memo((edge: EdgeProps<ModelEdge>) => {
  const edgeStyle = useDecoratedEdgeStyle(edge);
  const route = useModelEdgeRoute(edge.id);
  const lowDetail = useStore(selectLowDetail);
  const routeDrift =
    route === undefined ? Infinity : (
      Math.max(
        pointDistance(route.points[0], edge.sourceX, edge.sourceY),
        pointDistance(route.points[route.points.length - 1], edge.targetX, edge.targetY),
      )
    );

  let path: string;
  if (route !== undefined && routeDrift <= ROUTE_ENDPOINT_TOLERANCE_PX) {
    path = lowDetail ? route.simplePath : route.path;
  } else if (route !== undefined && routeDrift <= ROUTE_STRETCH_LIMIT_PX) {
    path = stretchToPorts(lowDetail ? route.simplePath : route.path, route.points, edge);
  } else {
    [path] = getSmoothStepPath({
      borderRadius: EDGE_CORNER_RADIUS,
      offset: EDGE_NODE_CLEARANCE,
      sourcePosition: edge.sourcePosition,
      sourceX: edge.sourceX,
      sourceY: edge.sourceY,
      targetPosition: edge.targetPosition,
      targetX: edge.targetX,
      targetY: edge.targetY,
    });
  }

  return (
    <>
      <path
        className="react-flow__edge-path"
        d={path}
        markerEnd={edge.markerEnd}
        markerStart={edge.markerStart}
        style={edgeStyle}
      />
      <path
        className="react-flow__edge-interaction"
        d={path}
        fill="none"
        strokeOpacity={0}
        strokeWidth={EDGE_INTERACTION_WIDTH}
      />
    </>
  );
});

CustomEdge.displayName = "CustomEdge";
