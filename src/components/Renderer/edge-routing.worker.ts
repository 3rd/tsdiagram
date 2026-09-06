import { createEdgeRouter, EdgeRouterState, EdgeRoutes, EdgeRoutingInput } from "./edge-routing";

export type RouteRequest = { generation: number; includeState: boolean; input: EdgeRoutingInput };
export type RouteResponse = { generation: number; routes: EdgeRoutes; state?: EdgeRouterState | null };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<RouteRequest>) => void) | null;
  postMessage: (message: RouteResponse) => void;
};

const router = createEdgeRouter();

workerScope.onmessage = (event) => {
  const { generation, includeState, input } = event.data;
  const routes = router.route(input);
  workerScope.postMessage(
    includeState ? { generation, routes, state: router.getState() } : { generation, routes },
  );
};
