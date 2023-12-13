import { EdgeProps } from "reactflow";
import { PathSegment } from "./types";

type CacheEntry = {
  edge: EdgeProps;
  path: [number, number][];
  segments: PathSegment[];
};

const cache = new Map<string, CacheEntry>();
const pointSet = new Set<string>();

const edgeSegmentCache = {
  get: (id: string) => cache.get(id),
  getBySourcePosition: (sourceX: number, sourceY: number) => {
    for (const entry of cache.values()) {
      if (entry.edge.sourceX === sourceX && entry.edge.sourceY === sourceY) {
        return entry;
      }
    }
  },
  set: (id: string, entry: CacheEntry) => {
    return cache.set(id, entry);
  },
  clear: () => {
    cache.clear();
  },
};

export { edgeSegmentCache };
