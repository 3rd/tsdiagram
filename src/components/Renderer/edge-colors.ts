import { ModelEdge } from "./layout";

export const EDGE_COLOR_PALETTES: Record<"dark" | "light", readonly string[]> = {
  light: [
    "#3b82f6", // blue-500
    "#f97316", // orange-500
    "#10b981", // emerald-500
    "#f43f5e", // rose-500
    "#8b5cf6", // violet-500
    "#d97706", // amber-600
    "#0891b2", // cyan-600
    "#d946ef", // fuchsia-500
    "#65a30d", // lime-600
    "#6366f1", // indigo-500
  ],
  dark: [
    "#60a5fa", // blue-400
    "#fb923c", // orange-400
    "#34d399", // emerald-400
    "#fb7185", // rose-400
    "#a78bfa", // violet-400
    "#fbbf24", // amber-400
    "#22d3ee", // cyan-400
    "#e879f9", // fuchsia-400
    "#a3e635", // lime-400
    "#818cf8", // indigo-400
  ],
};

const hashString = (value: string) => {
  let hash = 0x81_1C_9D_C5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return hash >>> 0;
};

// edges without a sourceHandle attach to the node's header handle, `${model.id}-source`;
// every edge enters through the target's header handle, `${model.id}-target`
const getSourcePortId = (edge: Pick<ModelEdge, "source" | "sourceHandle">) =>
  edge.sourceHandle ?? `${edge.source}-source`;
const getTargetPortId = (edge: Pick<ModelEdge, "target">) => `${edge.target}-target`;

export const EMPTY_PORT_COLORS: ReadonlyMap<string, string> = new Map();

export type EdgeColors = {
  edges: string[];
  ports: ReadonlyMap<string, string>;
};

export const assignEdgeColors = (
  edges: Pick<ModelEdge, "source" | "sourceHandle" | "target">[],
  palette: readonly string[],
): EdgeColors => {
  const nextIndexBySource = new Map<string, number>();
  const ports = new Map<string, string>();
  const sharedPortIds = new Set<string>();
  const claimPort = (portId: string, color: string) => {
    if (ports.has(portId)) sharedPortIds.add(portId);
    else ports.set(portId, color);
  };
  const edgeColors = edges.map((edge) => {
    const index = nextIndexBySource.get(edge.source) ?? hashString(edge.source) % palette.length;
    nextIndexBySource.set(edge.source, index + 1);
    const color = palette[index % palette.length];
    claimPort(getSourcePortId(edge), color);
    claimPort(getTargetPortId(edge), color);
    return color;
  });
  for (const portId of sharedPortIds) ports.delete(portId);
  return { edges: edgeColors, ports };
};

export const arePortColorsEqual = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>) => {
  if (a.size !== b.size) return false;
  for (const [portId, color] of a) if (b.get(portId) !== color) return false;
  return true;
};
