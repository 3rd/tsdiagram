import { describe, expect, it } from "vitest";
import { ModelParser } from "../../lib/parser/ModelParser";
import { assignEdgeColors, EDGE_COLOR_PALETTES, EdgeColors } from "./edge-colors";
import { extractModelEdges, ModelEdge } from "./layout";

const edgesOf = (source: string) => extractModelEdges(new ModelParser(source).getModels());
const colorOf = (edges: ModelEdge[], colors: EdgeColors, edgeId: string) => {
  const color = colors.edges[edges.findIndex((edge) => edge.id === edgeId)];
  expect(color, `Expected a color for edge ${edgeId}`).toBeDefined();
  return color;
};

describe("assignEdgeColors", () => {
  const palette = EDGE_COLOR_PALETTES.light;

  it("gives every edge leaving a node a distinct color", () => {
    const edges = edgesOf(`
      interface A { b: B; c: C; d: D[]; e: (x: E) => F }
      interface B {} interface C {} interface D {} interface E {} interface F {}
    `);
    const colors = assignEdgeColors(edges, palette);
    const fromA = colors.edges.filter((_, index) => edges[index].source === "A");
    expect(fromA).toHaveLength(5);
    expect(new Set(fromA).size).toBe(5);
  });

  it("starts sibling nodes with single edges on different colors", () => {
    const edges = edgesOf(`
      interface Shared {}
      interface A { x: Shared } interface B { x: Shared } interface C { x: Shared }
    `);
    expect(new Set(assignEdgeColors(edges, palette).edges).size).toBe(3);
  });

  it("wraps around the palette when a node has more edges than colors", () => {
    const edges = Array.from({ length: 4 }, (_, index) => ({ source: "A", target: `T${index}` }));
    const colors = assignEdgeColors(edges, ["#111", "#222", "#333"]);
    expect(colors.edges[3]).toBe(colors.edges[0]);
    expect(new Set(colors.edges).size).toBe(3);
  });

  it("assigns the same colors after an unrelated model is added", () => {
    const before = edgesOf(`interface A { b: B; c: C } interface B {} interface C {}`);
    const after = edgesOf(`interface A { b: B; c: C } interface B {} interface C {} interface Z { a: A }`);
    const beforeColors = assignEdgeColors(before, palette);
    const afterColors = assignEdgeColors(after, palette);
    expect(before).toHaveLength(2);
    for (const edge of before) {
      expect(colorOf(after, afterColors, edge.id)).toBe(colorOf(before, beforeColors, edge.id));
    }
  });

  it("colors a port with its single edge's color and keys header edges to the header port", () => {
    const edges = edgesOf(`interface Base {} interface A extends Base { b: B } interface B {}`);
    const colors = assignEdgeColors(edges, palette);
    expect(colors.ports.get("A-source")).toBe(colorOf(edges, colors, "extends-A-Base"));
    expect(colors.ports.get("A-source-b")).toBe(colorOf(edges, colors, "field-A-b"));
  });

  it("leaves a port shared by several edges uncolored", () => {
    const edges = edgesOf(`interface A { f: (x: B) => C } interface B {} interface C {}`);
    expect(edges.filter((edge) => edge.sourceHandle === "A-source-f")).toHaveLength(2);
    expect(assignEdgeColors(edges, palette).ports.has("A-source-f")).toBe(false);
  });

  it("colors a target port with its single incoming edge and leaves a shared one uncolored", () => {
    const edges = edgesOf(`interface A { b: B; c: C } interface Z { c: C } interface B {} interface C {}`);
    const colors = assignEdgeColors(edges, palette);
    expect(colors.ports.get("B-target")).toBe(colorOf(edges, colors, "field-A-b"));
    expect(colors.ports.has("C-target")).toBe(false);
  });
});
