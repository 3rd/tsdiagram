/* eslint-disable @typescript-eslint/no-magic-numbers */
import { expect, it } from "vitest";
import { ModelParser } from "./ModelParser";

it("parses top level type aliases and interfaces into models", () => {
  const parser = new ModelParser("interface A { a: string; }; type B = { b: string };");
  const models = parser.getModels();

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "66",
    name: "A",
    schema: [{ name: "a", type: "string" }],
    dependencies: [],
    dependants: [],
  });
  expect(models[1]).toEqual({
    id: "67",
    name: "B",
    schema: [{ name: "b", type: "string" }],
    dependencies: [],
    dependants: [],
  });
});

it("parses exported top level type aliases and interfaces into models", () => {
  const parser = new ModelParser("export interface A { a: string; }; export type B = { b: string };");
  const models = parser.getModels();

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "66",
    name: "A",
    schema: [{ name: "a", type: "string" }],
    dependencies: [],
    dependants: [],
  });
  expect(models[1]).toEqual({
    id: "67",
    name: "B",
    schema: [{ name: "b", type: "string" }],
    dependencies: [],
    dependants: [],
  });
});

it("skips type aliases that are not direct aliases", () => {
  const parser = new ModelParser("type A = { a: string }; type B = A;");
  const models = parser.getModels();

  expect(models.length).toBe(1);
  expect(models[0]).toEqual({
    id: "66",
    name: "A",
    schema: [{ name: "a", type: "string" }],
    dependencies: [],
    dependants: [],
  });
});

it("parses arrays of primitives", () => {
  const parser = new ModelParser("type A = { a: string[] };");
  const models = parser.getModels();

  expect(models.length).toBe(1);
  expect(models[0]).toEqual({
    id: "66",
    name: "A",
    schema: [{ name: "a", type: "array", elementType: "string" }],
    dependencies: [],
    dependants: [],
  });
});

it("parses arrays of models", () => {
  const parser = new ModelParser("type A = { a: B[] }; type B = { b: string };");
  const models = parser.getModels();

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "66",
    name: "A",
    schema: [
      {
        name: "a",
        type: "array",
        elementType: expect.objectContaining({
          id: "67",
          name: "B",
          schema: [{ name: "b", type: "string" }],
        }),
      },
    ],
    dependencies: [expect.objectContaining({ name: "B" })],
    dependants: [],
  });
  expect(models[1]).toEqual({
    id: "67",
    name: "B",
    schema: [{ name: "b", type: "string" }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "A" })],
  });
});

it("parses maps of primitives", () => {
  const parser = new ModelParser(`
    type A = { a: Record<string, string> };
    type B = { b: Map<string, string> };
    type C = { c: WeakMap<string, string> };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(3);
  expect(models[0]).toEqual({
    id: "66",
    name: "A",
    schema: [{ name: "a", type: "map", keyType: "string", valueType: "string" }],
    dependencies: [],
    dependants: [],
  });
  expect(models[1]).toEqual({
    id: "67",
    name: "B",
    schema: [{ name: "b", type: "map", keyType: "string", valueType: "string" }],
    dependencies: [],
    dependants: [],
  });
  expect(models[2]).toEqual({
    id: "68",
    name: "C",
    schema: [{ name: "c", type: "map", keyType: "string", valueType: "string" }],
    dependencies: [],
    dependants: [],
  });
});

it("parses maps of models", () => {
  const parser = new ModelParser(`
    type A = { a: Record<B, C> };
    type B = { b: string };
    type C = { c: number; };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(3);
  expect(models[0]).toEqual({
    id: "66",
    name: "A",
    schema: [
      {
        name: "a",
        type: "map",
        keyType: expect.objectContaining({ name: "B" }),
        valueType: expect.objectContaining({ name: "C" }),
      },
    ],
    dependencies: [expect.objectContaining({ name: "B" }), expect.objectContaining({ name: "C" })],
    dependants: [],
  });
  expect(models[1]).toEqual({
    id: "67",
    name: "B",
    schema: [{ name: "b", type: "string" }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "A" })],
  });
  expect(models[2]).toEqual({
    id: "68",
    name: "C",
    schema: [{ name: "c", type: "number" }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "A" })],
  });
});
