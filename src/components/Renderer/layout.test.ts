import { describe, expect, it } from "vitest";
import { ModelParser } from "../../lib/parser/ModelParser";
import { compactLayoutedNodes, fieldHasSourceEdge, ModelNodeState } from "./layout";

const NO_PINS: ReadonlySet<string> = new Set();

const makeNode = (id: string, x: number, y: number, width: number, height: number): ModelNodeState => ({
  data: {
    badgeHubIds: new Set<string>(),
    model: {
      id,
      name: id,
      type: "typeAlias",
      schema: [],
      arguments: [],
      dependencies: [],
      dependants: [],
    },
  },
  id,
  measured: { height, width },
  position: { x, y },
  type: "model",
});

const boxesOf = (nodes: ModelNodeState[]) =>
  nodes.map((node) => ({
    bottom: node.position.y + (node.measured?.height ?? 0),
    left: node.position.x,
    right: node.position.x + (node.measured?.width ?? 0),
    top: node.position.y,
  }));

const countOverlaps = (nodes: ModelNodeState[]) => {
  const boxes = boxesOf(nodes);
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
    }
  }
  return overlaps;
};

describe("compactLayoutedNodes", () => {
  it("closes an oversized vertical gap to the pad and keeps unmoved node identity", () => {
    const top = makeNode("top", 0, 0, 200, 100);
    const bottom = makeNode("bottom", 0, 600, 200, 100);
    const result = compactLayoutedNodes({
      direction: "horizontal",
      nodes: [top, bottom],
      pinnedIds: NO_PINS,
    });

    expect(result[0]).toBe(top);
    expect(result[1].position.y).toBe(172);
  });

  it("keeps layers where the layout placed them on the main axis", () => {
    const left = makeNode("left", 0, 0, 200, 100);
    const right = makeNode("right", 800, 600, 200, 100);
    const result = compactLayoutedNodes({
      direction: "horizontal",
      nodes: [left, right],
      pinnedIds: NO_PINS,
    });

    expect(result[1].position.x).toBe(800);
    expect(result[1].position.y).toBeLessThan(600);
  });

  it("never introduces overlaps in a staggered arrangement", () => {
    const nodes = [
      makeNode("a", 0, 0, 300, 100),
      makeNode("b", 100, 400, 300, 100),
      makeNode("c", 200, 900, 300, 100),
      makeNode("d", 500, 200, 300, 100),
      makeNode("e", 450, 1400, 300, 100),
    ];
    const result = compactLayoutedNodes({ direction: "horizontal", nodes, pinnedIds: NO_PINS });

    expect(countOverlaps(result)).toBe(0);
  });

  it("treats pinned nodes as fixed obstacles", () => {
    const pinned = makeNode("pinned", 0, 300, 200, 100);
    const below = makeNode("below", 0, 900, 200, 100);
    const result = compactLayoutedNodes({
      direction: "horizontal",
      nodes: [pinned, below],
      pinnedIds: new Set(["pinned"]),
    });

    expect(result[0].position).toEqual({ x: 0, y: 300 });
    // slides up to pad below the pinned obstacle, not past it
    expect(result[1].position.y).toBe(472);
  });

  it("scales vertical closure back to respect the aspect cap", () => {
    // wide contiguous row fixes width at 3400; a sparse column would fully close to a
    // flat strip (aspect ~7) without the cap
    const row = Array.from({ length: 4 }, (_, i) => makeNode(`row${i}`, i * 862, 0, 838, 100));
    const column = [
      makeNode("c1", 0, 1000, 200, 100),
      makeNode("c2", 0, 2000, 200, 100),
      makeNode("c3", 0, 3000, 200, 100),
    ];
    const result = compactLayoutedNodes({
      direction: "horizontal",
      nodes: [...row, ...column],
      pinnedIds: NO_PINS,
    });

    const boxes = boxesOf(result);
    const width = Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left));
    const height = Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top));
    expect(width / height).toBeLessThanOrEqual(1.71);
    expect(height).toBeLessThan(3000);
    expect(countOverlaps(result)).toBe(0);
  });

  it("compacts along the row for vertical layouts", () => {
    const left = makeNode("left", 0, 0, 200, 100);
    const right = makeNode("right", 800, 0, 200, 100);
    const result = compactLayoutedNodes({ direction: "vertical", nodes: [left, right], pinnedIds: NO_PINS });

    expect(result[1].position).toEqual({ x: 272, y: 0 });
  });
});

describe("fieldHasSourceEdge", () => {
  it("detects the model reference on a later overload row, not just the first", () => {
    const source = `
      interface Baz { x: string }
      class Foo {
        bar(): void;
        bar(x: Baz): Baz;
        bar(x?: Baz) { return x; }
      }
    `;
    const models = new ModelParser(source).getModels();
    const foo = models.find((model) => model.name === "Foo");
    const rows = (foo?.schema ?? []).filter((field) => field.name === "bar");

    expect(rows.length).toBe(2);
    // first declared overload has no model references; the shared handle must still show
    expect(fieldHasSourceEdge(rows[0], new Set())).toBe(false);
    expect(fieldHasSourceEdge(rows[1], new Set())).toBe(true);
  });

  it("treats badge-hub references as edge-free", () => {
    const models = new ModelParser("type Id = string;\ninterface A { ref: Id }").getModels();
    const a = models.find((model) => model.name === "A");
    const field = a?.schema[0];
    if (!field) throw new Error("missing field");

    expect(fieldHasSourceEdge(field, new Set())).toBe(true);
    expect(fieldHasSourceEdge(field, new Set(["Id"]))).toBe(false);
  });
});
