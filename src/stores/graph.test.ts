import { afterEach, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import type { Model } from "../lib/parser/model-types";
import { computeHighlightedNodeIds, getEdgeDecoration, getNodeDecoration, graphStore } from "./graph";

const model = (id: string, links: { dependencies?: Model[]; dependants?: Model[] } = {}): Model => ({
  id,
  name: id,
  type: "typeAlias",
  schema: [],
  typeTextSegments: {},
  arguments: [],
  dependencies: links.dependencies ?? [],
  dependants: links.dependants ?? [],
});

const hoveredNode = (model: Model): Node<{ model: Model }> => ({
  id: model.id,
  data: { model },
  position: { x: 0, y: 0 },
});

it("returns an empty record when nothing is hovered", () => {
  expect(computeHighlightedNodeIds(null)).toEqual({});
});

it("highlights only the hovered node when it has no links", () => {
  expect(computeHighlightedNodeIds(hoveredNode(model("A")))).toEqual({ A: true });
});

it("highlights the hovered node together with its dependencies and dependants", () => {
  const hovered = model("A", {
    dependencies: [model("B")],
    dependants: [model("C")],
  });

  expect(computeHighlightedNodeIds(hoveredNode(hovered))).toEqual({ A: true, B: true, C: true });
});

it("does not duplicate an id that is both a dependency and a dependant", () => {
  const shared = model("B");
  const hovered = model("A", { dependencies: [shared], dependants: [shared] });

  expect(computeHighlightedNodeIds(hoveredNode(hovered))).toEqual({ A: true, B: true });
});

it("stores prototype-named model ids as own properties", () => {
  const highlightedNodeIds = computeHighlightedNodeIds(
    hoveredNode(
      model("constructor", {
        dependencies: [model("toString"), model("__proto__")],
      })
    )
  );

  expect(Object.hasOwn(highlightedNodeIds, "constructor")).toBe(true);
  expect(Object.hasOwn(highlightedNodeIds, "toString")).toBe(true);
  expect(Object.hasOwn(highlightedNodeIds, "__proto__")).toBe(true);

  graphStore.state.hoveredNode = hoveredNode(model("toString"));
  expect(Object.hasOwn(graphStore.state.highlightedNodeIds, "toString")).toBe(true);
  expect(graphStore.state.highlightedNodeIds.toString).toBe(true);
  graphStore.state.hoveredNode = null;
  expect(Object.hasOwn(graphStore.state.highlightedNodeIds, "toString")).toBe(false);
});

afterEach(() => {
  graphStore.state.hoveredNode = null;
  graphStore.state.selectedNode = null;
  graphStore.state.selectedEdge = null;
  graphStore.state.svgExportMode = false;
  graphStore.state.clearHoveredBadgeHub(graphStore.state.hoveredBadgePillId ?? "");
});

it("derives hoveredNodeId and highlightedNodeIds when hoveredNode is assigned", () => {
  const hovered = model("A", { dependencies: [model("B")], dependants: [model("C")] });
  graphStore.state.hoveredNode = hoveredNode(hovered);

  expect(graphStore.state.hoveredNodeId).toBe("A");
  expect(graphStore.state.highlightedNodeIds).toEqual({ A: true, B: true, C: true });
});

it("reconciles derived state in place when the hovered node changes", () => {
  const first = graphStore.state.highlightedNodeIds;
  graphStore.state.hoveredNode = hoveredNode(model("A", { dependencies: [model("B")] }));
  graphStore.state.hoveredNode = hoveredNode(model("X", { dependants: [model("Y")] }));

  expect(graphStore.state.highlightedNodeIds).toBe(first);
  expect(graphStore.state.hoveredNodeId).toBe("X");
  expect(graphStore.state.highlightedNodeIds).toEqual({ X: true, Y: true });
});

it("clears derived state when the hovered node is cleared", () => {
  graphStore.state.hoveredNode = hoveredNode(model("A", { dependencies: [model("B")] }));
  graphStore.state.hoveredNode = null;

  expect(graphStore.state.hoveredNodeId).toBeNull();
  expect(graphStore.state.highlightedNodeIds).toEqual({});
});

it("focuses the selected node and its links when nothing is hovered", () => {
  graphStore.state.selectedNode = hoveredNode(model("A", { dependencies: [model("B")] }));

  expect(graphStore.state.selectedNodeId).toBe("A");
  expect(graphStore.state.focusedNodeId).toBe("A");
  expect(graphStore.state.highlightedNodeIds).toEqual({ A: true, B: true });
});

it("lets hover take precedence over the selection and restores it on leave", () => {
  graphStore.state.selectedNode = hoveredNode(model("A", { dependencies: [model("B")] }));
  graphStore.state.hoveredNode = hoveredNode(model("X", { dependants: [model("Y")] }));

  expect(graphStore.state.focusedNodeId).toBe("X");
  expect(graphStore.state.highlightedNodeIds).toEqual({ X: true, Y: true });

  graphStore.state.hoveredNode = null;
  expect(graphStore.state.focusedNodeId).toBe("A");
  expect(graphStore.state.highlightedNodeIds).toEqual({ A: true, B: true });
});

it("selecting an edge keeps only its two ends and itself undimmed", () => {
  graphStore.state.selectedEdge = { id: "A-B", source: "A", target: "B" };

  expect(graphStore.state.selectedEdgeId).toBe("A-B");
  expect(graphStore.state.focusedNodeId).toBeNull();
  expect(graphStore.state.highlightedNodeIds).toEqual({ A: true, B: true });
  expect(getNodeDecoration(graphStore.state, "A")).toBe("none");
  expect(getNodeDecoration(graphStore.state, "B")).toBe("none");
  expect(getNodeDecoration(graphStore.state, "C")).toBe("dimmed");
  expect(getEdgeDecoration(graphStore.state, { id: "A-B", source: "A", target: "B" })).toBe("highlighted");
  expect(getEdgeDecoration(graphStore.state, { id: "B-C", source: "B", target: "C" })).toBe("faded");
});

it("makes node and edge selection exclusive", () => {
  graphStore.state.selectedEdge = { id: "A-B", source: "A", target: "B" };
  graphStore.state.selectedNode = hoveredNode(model("C", { dependencies: [model("D")] }));

  expect(graphStore.state.selectedEdgeId).toBeNull();
  expect(graphStore.state.highlightedNodeIds).toEqual({ C: true, D: true });

  graphStore.state.selectedEdge = { id: "A-B", source: "A", target: "B" };
  expect(graphStore.state.selectedNodeId).toBeNull();
  expect(graphStore.state.highlightedNodeIds).toEqual({ A: true, B: true });
});

it("suspends selection and hover decoration while an svg export is taken", () => {
  graphStore.state.selectedNode = hoveredNode(model("A", { dependencies: [model("B")] }));
  const edge = { id: "A-B", source: "A", target: "B" };

  expect(getNodeDecoration(graphStore.state, "A")).toBe("selected");
  expect(getNodeDecoration(graphStore.state, "C")).toBe("dimmed");
  expect(getEdgeDecoration(graphStore.state, edge)).toBe("highlighted");

  graphStore.state.svgExportMode = true;
  expect(getNodeDecoration(graphStore.state, "A")).toBe("none");
  expect(getNodeDecoration(graphStore.state, "C")).toBe("none");
  expect(getEdgeDecoration(graphStore.state, edge)).toBe("none");

  graphStore.state.selectedEdge = edge;
  expect(getNodeDecoration(graphStore.state, "C")).toBe("none");
  expect(getEdgeDecoration(graphStore.state, { id: "B-C", source: "B", target: "C" })).toBe("none");
});

it("only lets the owning badge pill clear hover", () => {
  graphStore.state.setHoveredBadgeHub("Id", "first-pill");
  graphStore.state.clearHoveredBadgeHub("second-pill");

  expect(graphStore.state.hoveredBadgeHubId).toBe("Id");
  graphStore.state.clearHoveredBadgeHub("first-pill");
  expect(graphStore.state.hoveredBadgeHubId).toBeNull();
});
