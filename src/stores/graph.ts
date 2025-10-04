import { EdgeProps, Node } from "reactflow";
import { createStore, useStore } from "statelift";
import { Model } from "../lib/parser/ModelParser";

type GraphState = {
  // nodes: Node<{ model: Model }>[];
  // edges: Edge[];
  hoveredNode: Node<{ model: Model }> | null;
};
export const graphStore = createStore<GraphState>({
  hoveredNode: null,
});

export const useGraphStore = () => useStore(graphStore);

export const useIsNodeHighlighted = (model: Model) =>
  useStore(graphStore, (state) => {
    const { hoveredNode } = state;
    if (!hoveredNode) return false;
    if (hoveredNode.id === model.id) return true;
    if (model.dependencies.some((dependency) => dependency.id === hoveredNode.id)) return true;
    if (model.dependants.some((dependant) => dependant.id === hoveredNode.id)) return true;
    return false;
  });

export const useIsEdgeDecorated = (edge: EdgeProps) =>
  useStore(graphStore, (state) => {
    const { hoveredNode } = state;
    if (!hoveredNode) return { highlighted: false, faded: false };
    if (hoveredNode.id === edge.source || hoveredNode.id === edge.target) {
      return { highlighted: true, faded: false };
    }
    return { highlighted: false, faded: true };
  });
