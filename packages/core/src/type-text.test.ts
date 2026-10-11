import { assert, expect, it } from "vitest";
import { parseModels } from "./index";

it.each([
  {
    name: "both branches of a conditional type",
    text: "T extends string ? Date : RegExp",
    colored: [
      { text: "T", kind: "reference" },
      { text: "string", kind: "primitive" },
      { text: "Date", kind: "reference" },
      { text: "RegExp", kind: "reference" },
    ],
  },
  {
    name: "types without coloring method, property, parameter, or tuple names",
    text: "[value: { run(arg: string): number; readonly name?: boolean; string: bigint }]",
    colored: [
      { text: "string", kind: "primitive" },
      { text: "number", kind: "primitive" },
      { text: "boolean", kind: "primitive" },
      { text: "bigint", kind: "primitive" },
    ],
  },
  {
    name: "nested template substitutions separately from literal text",
    text: "`item-${T extends string ? `inner-${T}` : number}-end`",
    colored: [
      { text: "`item-", kind: "literal" },
      { text: "T", kind: "reference" },
      { text: "string", kind: "primitive" },
      { text: "`inner-", kind: "literal" },
      { text: "T", kind: "reference" },
      { text: "`", kind: "literal" },
      { text: "number", kind: "primitive" },
      { text: "-end`", kind: "literal" },
    ],
  },
  {
    name: "literal syntax while leaving null and type operators neutral",
    text: '[value: -0x2An | "a\\\"b" | false | null, keys: keyof T]',
    colored: [
      { text: "-0x2An", kind: "literal" },
      { text: '"a\\\"b"', kind: "literal" },
      { text: "false", kind: "literal" },
      { text: "T", kind: "reference" },
    ],
  },
  {
    name: "qualified references and type queries without coloring punctuation",
    text: "[value: Outer.Inner, query: typeof registry.item]",
    colored: [
      { text: "Outer", kind: "reference" },
      { text: "Inner", kind: "reference" },
      { text: "registry", kind: "reference" },
      { text: "item", kind: "reference" },
    ],
  },
])("classifies $name and preserves the displayed text", ({ text, colored }) => {
  const [model] = parseModels(`type Example<T> = ${text};`);
  const segments = model.typeTextSegments[text];

  expect(segments.map((segment) => segment.text).join("")).toBe(text);
  expect(segments.filter((segment) => segment.kind !== "default")).toEqual(colored);
});

it("provides cloneable type segments for every field shape without replacing model references", () => {
  const models = parseModels(`
    interface Item { id: string }
    interface Example<T> {
      item: Item;
      list: readonly string[];
      generic: Map<string, T>;
      run(argument: boolean): number[];
    }
    type Choice = "open" | 2;
    enum State { Open }
  `);
  const cloned = structuredClone(models);
  const example = cloned.find((model) => model.name === "Example");
  const item = cloned.find((model) => model.name === "Item");
  const choice = cloned.find((model) => model.name === "Choice");
  const state = cloned.find((model) => model.name === "State");
  assert.exists(example);
  assert.exists(item);
  assert.exists(choice);
  assert.exists(state);

  expect(example.schema.find((field) => field.name === "item")?.type).toBe(item);
  expect(Object.keys(example.typeTextSegments).sort()).toEqual(["Map", "T", "boolean", "number", "string"]);
  expect(Object.keys(choice.typeTextSegments).sort()).toEqual(['"open"', "2"]);
  expect(state.typeTextSegments["0"]).toEqual([{ text: "0", kind: "literal" }]);
  for (const model of cloned) {
    for (const [text, segments] of Object.entries(model.typeTextSegments)) {
      expect(segments.map((segment) => segment.text).join("")).toBe(text);
    }
  }
});
