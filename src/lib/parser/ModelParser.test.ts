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

it("parses generics", () => {
  const parser = new ModelParser(`
    type A = { a: Array<string> };
    type B = { b: Record<string, A> };
    type C = { c: Map<A, A> };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(3);
  expect(models[0]).toEqual({
    id: "66",
    name: "A",
    schema: [{ name: "a", type: "generic", genericName: "Array", arguments: ["string"] }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "B" }), expect.objectContaining({ name: "C" })],
  });
  expect(models[1]).toEqual({
    id: "67",
    name: "B",
    schema: [
      {
        name: "b",
        type: "generic",
        genericName: "Record",
        arguments: ["string", expect.objectContaining({ name: "A" })],
      },
    ],
    dependencies: [expect.objectContaining({ name: "A" })],
    dependants: [],
  });
  expect(models[2]).toEqual({
    id: "68",
    name: "C",
    schema: [
      {
        name: "c",
        type: "generic",
        genericName: "Map",
        arguments: [expect.objectContaining({ name: "A" }), expect.objectContaining({ name: "A" })],
      },
    ],
    dependencies: [expect.objectContaining({ name: "A" })],
    dependants: [],
  });
});
