/* eslint-disable @typescript-eslint/no-magic-numbers */
import { expect, it } from "vitest";
import { ModelParser } from "./TSMorphModelParser";

it("parses top level type aliases and interfaces into models", () => {
  const parser = new ModelParser("interface A { a: string; }; type B = { b: string };");
  const models = parser.getModels();

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "a", type: "string" }],
    dependencies: [],
    dependants: [],
    type: "interface",
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "b", type: "string" }],
    dependencies: [],
    dependants: [],
    type: "typeAlias",
  });
});

it("parses exported top level type aliases and interfaces into models", () => {
  const parser = new ModelParser("export interface A { a: string; }; export type B = { b: string };");
  const models = parser.getModels();

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "a", type: "string" }],
    dependencies: [],
    dependants: [],
    type: "interface",
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "b", type: "string" }],
    dependencies: [],
    dependants: [],
    type: "typeAlias",
  });
});

it("supports type aliases with kind != TypeLiteral", () => {
  const parser = new ModelParser("type A = string; type B = { field: A };");
  const models = parser.getModels();

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "B" })],
    type: "typeAlias",
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "field", type: expect.objectContaining({ name: "A" }) }],
    dependencies: [expect.objectContaining({ name: "A" })],
    dependants: [],
    type: "typeAlias",
  });
});

it("supports declaration merging", () => {
  const parser = new ModelParser(`
    interface A { a: string; }
    interface A { b: string; }
  `);
  const models = parser.getModels();

  expect(models.length).toBe(1);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [
      { name: "a", type: "string" },
      { name: "b", type: "string" },
    ],
    dependencies: [],
    dependants: [],
    type: "interface",
  });
});

it("parses arrays of primitives", () => {
  const parser = new ModelParser("type A = { a: string[] };");
  const models = parser.getModels();

  expect(models.length).toBe(1);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "a", type: "array", elementType: "string" }],
    dependencies: [],
    dependants: [],
    type: "typeAlias",
  });
});

it("parses arrays of models", () => {
  const parser = new ModelParser("type A = { a: B[] }; type B = { b: string };");
  const models = parser.getModels();

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [
      {
        name: "a",
        type: "array",
        elementType: expect.objectContaining({
          id: "B",
          name: "B",
          schema: [{ name: "b", type: "string" }],
        }),
      },
    ],
    dependencies: [expect.objectContaining({ name: "B" })],
    dependants: [],
    type: "typeAlias",
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "b", type: "string" }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "A" })],
    type: "typeAlias",
  });
});

it("parses references", () => {
  const parser = new ModelParser(`
    type A = { a: Array<string> };
    type B = { b: Record<string, A> };
    type C = { c: Map<A, A> };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(3);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "a", type: "reference", referenceName: "Array", arguments: ["string"] }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "B" }), expect.objectContaining({ name: "C" })],
    type: "typeAlias",
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [
      {
        name: "b",
        type: "reference",
        referenceName: "Record",
        arguments: ["string", expect.objectContaining({ name: "A" })],
      },
    ],
    dependencies: [expect.objectContaining({ name: "A" })],
    dependants: [],
    type: "typeAlias",
  });
  expect(models[2]).toEqual({
    id: "C",
    name: "C",
    schema: [
      {
        name: "c",
        type: "reference",
        referenceName: "Map",
        arguments: [expect.objectContaining({ name: "A" }), expect.objectContaining({ name: "A" })],
      },
    ],
    dependencies: [expect.objectContaining({ name: "A" })],
    dependants: [],
    type: "typeAlias",
  });
});
