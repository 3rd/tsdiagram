import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { Edge, InternalNode, Position, useStore, useStoreApi } from "@xyflow/react";
import type { RouteRequest, RouteResponse } from "./edge-routing.worker";
import { useSvgExportMode } from "../../stores/graph";
import {
  createEdgeRouter,
  EdgeRoute,
  EdgeRouter,
  EdgeRouterState,
  EdgeRoutes,
  EdgeRoutingInput,
} from "./edge-routing";
import { isUnplacedNode } from "./layout";

type EdgeRouteStore = {
  get: (edgeId: string) => EdgeRoute | undefined;
  subscribe: (edgeId: string, listener: () => void) => () => void;
};

const createEdgeRouteStore = () => {
  let routes: EdgeRoutes = {};
  const listeners = new Map<string, Set<() => void>>();
  const store: EdgeRouteStore & { publish: (next: EdgeRoutes) => void } = {
    get: (edgeId) => routes[edgeId],
    publish: (next) => {
      const previous = routes;
      routes = next;
      for (const [edgeId, edgeListeners] of listeners) {
        if (previous[edgeId] === next[edgeId]) continue;
        for (const listener of edgeListeners) listener();
      }
    },
    subscribe: (edgeId, listener) => {
      const edgeListeners = listeners.get(edgeId) ?? new Set();
      edgeListeners.add(listener);
      listeners.set(edgeId, edgeListeners);
      return () => {
        edgeListeners.delete(listener);
        if (edgeListeners.size === 0) listeners.delete(edgeId);
      };
    },
  };
  return store;
};

const EMPTY_STORE = createEdgeRouteStore();
const EdgeRouteStoreContext = createContext<EdgeRouteStore>(EMPTY_STORE);

export const useModelEdgeRoute = (edgeId: string): EdgeRoute | undefined => {
  const store = useContext(EdgeRouteStoreContext);
  const subscribe = useCallback((listener: () => void) => store.subscribe(edgeId, listener), [edgeId, store]);
  return useSyncExternalStore(subscribe, () => store.get(edgeId));
};

const getHandlePort = (node: InternalNode, type: "source" | "target", handleId?: string | null) => {
  const handles = node.internals.handleBounds?.[type];
  if (!handles || handles.length === 0) return null;
  const handle =
    (handleId ? handles.find((candidate) => candidate.id === handleId) : undefined) ?? handles[0];
  const x = node.internals.positionAbsolute.x + handle.x;
  const y = node.internals.positionAbsolute.y + handle.y;
  return handle.position === Position.Right ?
      { x: x + handle.width, y: y + handle.height / 2 }
    : { x, y: y + handle.height / 2 };
};

const buildRoutingInput = (nodeLookup: ReadonlyMap<string, InternalNode>, edges: readonly Edge[]) => {
  const input: EdgeRoutingInput = { edges: [], nodes: [] };
  for (const node of nodeLookup.values()) {
    const width = node.measured.width;
    const height = node.measured.height;
    if (!width || !height) return null;
    const { x, y } = node.internals.positionAbsolute;
    input.nodes.push({ id: node.id, rect: { bottom: y + height, left: x, right: x + width, top: y } });
  }
  for (const edge of edges) {
    const source = nodeLookup.get(edge.source);
    const target = nodeLookup.get(edge.target);
    if (!source || !target) continue;
    const sourcePort = getHandlePort(source, "source", edge.sourceHandle);
    const targetPort = getHandlePort(target, "target", edge.targetHandle);
    if (!sourcePort || !targetPort) continue;
    input.edges.push({ id: edge.id, source: edge.source, sourcePort, target: edge.target, targetPort });
  }
  return input;
};

type PendingRequest = Omit<RouteRequest, "generation">;

type EdgeRoutingProviderProps = { children: ReactNode };

export const EdgeRoutingProvider = ({ children }: EdgeRoutingProviderProps) => {
  const reactFlowStore = useStoreApi();
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const nodesInitialized = useStore((state) => state.nodesInitialized);
  const svgExportMode = useSvgExportMode();
  const routeStore = useMemo(createEdgeRouteStore, []);
  const workerRef = useRef<Worker | null>(null);
  const workerUnavailableRef = useRef(false);
  const inFlightRef = useRef(false);
  const pendingRef = useRef<PendingRequest | null>(null);
  const generationRef = useRef(0);
  const workerStateRef = useRef<EdgeRouterState | null>(null);
  const mainThreadRouterRef = useRef<EdgeRouter | null>(null);

  const input = useMemo(() => {
    if (!nodesInitialized || nodes.some(isUnplacedNode)) return null;
    return buildRoutingInput(reactFlowStore.getState().nodeLookup, edges);
  }, [edges, nodes, nodesInitialized, reactFlowStore]);
  // the router state seeds a main-thread router for exports; it is the bulk of every reply
  // and no export can start mid-drag, so drag frames leave it out and the drop refreshes it
  const includeState = !nodes.some((node) => node.dragging);

  const routeOnMainThread = useCallback(
    (request: EdgeRoutingInput) => {
      mainThreadRouterRef.current ??= createEdgeRouter(workerStateRef.current);
      routeStore.publish(mainThreadRouterRef.current.route(request));
    },
    [routeStore],
  );

  const post = useCallback((worker: Worker, request: PendingRequest) => {
    inFlightRef.current = true;
    generationRef.current += 1;
    const message: RouteRequest = { generation: generationRef.current, ...request };
    worker.postMessage(message);
  }, []);

  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./edge-routing.worker.ts", import.meta.url), { type: "module" });
    } catch {
      workerUnavailableRef.current = true;
      return;
    }
    let active = true;
    worker.onmessage = (event: MessageEvent<RouteResponse>) => {
      if (!active) return;
      inFlightRef.current = false;
      if (event.data.generation === generationRef.current) {
        if (event.data.state !== undefined) {
          workerStateRef.current = event.data.state;
          mainThreadRouterRef.current = null;
        }
        routeStore.publish(event.data.routes);
      }
      const pending = pendingRef.current;
      if (pending) {
        pendingRef.current = null;
        post(worker, pending);
      }
    };
    worker.onerror = () => {
      if (!active) return;
      worker.terminate();
      workerRef.current = null;
      inFlightRef.current = false;
      pendingRef.current = null;
      workerUnavailableRef.current = true;
    };
    workerRef.current = worker;
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      post(worker, pending);
    }
    return () => {
      active = false;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      inFlightRef.current = false;
    };
  }, [post, routeStore]);

  // a drag posts every frame; while a route is in flight only the newest input is kept, so
  // the worker never queues behind stale positions and edges trail the node by one result
  useEffect(() => {
    if (!input) return;
    if (svgExportMode || workerUnavailableRef.current) {
      routeOnMainThread(input);
      return;
    }
    const worker = workerRef.current;
    if (!worker || inFlightRef.current) {
      pendingRef.current = { includeState, input };
      return;
    }
    post(worker, { includeState, input });
  }, [includeState, input, post, routeOnMainThread, svgExportMode]);

  return <EdgeRouteStoreContext.Provider value={routeStore}>{children}</EdgeRouteStoreContext.Provider>;
};
