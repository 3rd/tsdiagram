/* eslint-disable @typescript-eslint/no-magic-numbers */
import { expect, it } from "vitest";
import { ModelParser } from "./ModelParser";

it("parses top level type aliases and interfaces into models", () => {
  const parser = new ModelParser("interface A { a: string; }; type B = { b: string };");
  const models = parser.getModels();

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    extends: [],
    schema: [{ name: "a", type: "string", optional: false }],
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [],
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "b", type: "string", optional: false }],
    dependencies: [],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it("parses exported top level type aliases and interfaces into models", () => {
  const parser = new ModelParser("export interface A { a: string; }; export type B = { b: string };");
  const models = parser.getModels();

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    extends: [],
    schema: [{ name: "a", type: "string", optional: false }],
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [],
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "b", type: "string", optional: false }],
    dependencies: [],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it("supports type aliases with kind != TypeLiteral", () => {
  const parser = new ModelParser(`
    type A = string;
    type B = { field: A };
    type C = { field: Record<A, A> };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(3);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "==>", type: "string", optional: false }],
    dependencies: [],
    dependants: [
      //
      expect.objectContaining({ name: "B" }),
      expect.objectContaining({ name: "C" }),
    ],
    type: "typeAlias",
    arguments: [],
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "field", type: expect.objectContaining({ name: "A" }), optional: false }],
    dependencies: [expect.objectContaining({ name: "A" })],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
  expect(models[2]).toEqual({
    id: "C",
    name: "C",
    schema: [
      {
        name: "field",
        type: "generic",
        genericName: "Record",
        arguments: [expect.objectContaining({ name: "A" }), expect.objectContaining({ name: "A" })],
        optional: false,
      },
    ],
    dependencies: [
      //
      expect.objectContaining({ name: "A" }),
    ],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it("supports declaration merging", () => {
  const parser = new ModelParser(`
    interface A { a: string; }
    interface A { a: string; b: string; }
  `);
  const models = parser.getModels();

  expect(models.length).toBe(1);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    extends: [],
    schema: [
      { name: "a", type: "string", optional: false },
      { name: "b", type: "string", optional: false },
    ],
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [],
  });
});

it("parses arrays of primitives", () => {
  const parser = new ModelParser("type A = { a: string[] };");
  const models = parser.getModels();

  expect(models.length).toBe(1);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "a", type: "array", elementType: "string", optional: false }],
    dependencies: [],
    dependants: [],
    type: "typeAlias",
    arguments: [],
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
          schema: [{ name: "b", type: "string", optional: false }],
        }),
        optional: false,
      },
    ],
    dependencies: [expect.objectContaining({ name: "B" })],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "b", type: "string", optional: false }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "A" })],
    type: "typeAlias",
    arguments: [],
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
    id: "A",
    name: "A",
    schema: [{ name: "a", type: "array", elementType: "string", optional: false }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "B" }), expect.objectContaining({ name: "C" })],
    type: "typeAlias",
    arguments: [],
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [
      {
        name: "b",
        type: "generic",
        genericName: "Record",
        arguments: ["string", expect.objectContaining({ name: "A" })],
        optional: false,
      },
    ],
    dependencies: [expect.objectContaining({ name: "A" })],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
  expect(models[2]).toEqual({
    id: "C",
    name: "C",
    schema: [
      {
        name: "c",
        type: "generic",
        genericName: "Map",
        arguments: [expect.objectContaining({ name: "A" }), expect.objectContaining({ name: "A" })],
        optional: false,
      },
    ],
    dependencies: [expect.objectContaining({ name: "A" })],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it("parses type alias functions and interface methods", () => {
  const parser = new ModelParser(`
    type A = { a: (b: string) => string };
    interface B {
      b(c: string) => string
    };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(2);

  expect(models[0]).toEqual({
    id: "B",
    name: "B",
    extends: [],
    schema: [
      {
        name: "b",
        type: "function",
        arguments: [{ name: "c", type: "string" }],
        returnType: "string",
        optional: false,
      },
    ],
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [],
  });

  expect(models[1]).toEqual({
    id: "A",
    name: "A",
    schema: [
      {
        name: "a",
        type: "function",
        arguments: [{ name: "b", type: "string" }],
        returnType: "string",
        optional: false,
      },
    ],
    dependencies: [],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it("parses generic alias and interface arguments", () => {
  const parser = new ModelParser(`
    type A<T> = { a: T };
    interface B<T, U extends string> {
      b: T
    };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(2);

  expect(models[0]).toEqual({
    id: "B",
    name: "B",
    extends: [],
    schema: [{ name: "b", type: "T", optional: false }],
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [{ name: "T" }, { name: "U", extends: "string" }],
  });

  expect(models[1]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "a", type: "T", optional: false }],
    dependencies: [],
    dependants: [],
    type: "typeAlias",
    arguments: [{ name: "T" }],
  });
});

it("parses classes", () => {
  const parser = new ModelParser(`
    class A { foo: string; }
    class B { bar(): string { throw new Error(); } }
    class C extends A implements B { bar() { return "baz"; } }
  `);
  const models = parser.getModels();

  expect(models.length).toBe(3);

  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "foo", type: "string", optional: false }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "C" })],
    type: "class",
    arguments: [],
    implements: [],
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [
      {
        name: "bar",
        type: "function",
        arguments: [],
        returnType: "string",
        optional: false,
      },
    ],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "C" })],
    type: "class",
    arguments: [],
    implements: [],
  });
  expect(models[2]).toEqual({
    id: "C",
    name: "C",
    extends: expect.objectContaining({ name: "A" }),
    implements: [expect.objectContaining({ name: "B" })],
    schema: [
      {
        name: "foo",
        type: "string",
        optional: false,
      },
      {
        name: "bar",
        type: "function",
        arguments: [],
        returnType: "string",
        optional: false,
      },
    ],
    dependencies: [expect.objectContaining({ name: "A" }), expect.objectContaining({ name: "B" })],
    dependants: [],
    type: "class",
    arguments: [],
  });
});

it("parses optional properties", () => {
  const parser = new ModelParser(`
    interface A { a?: string; };
    type B = { b?: string };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(2);

  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    extends: [],
    schema: [{ name: "a", type: "string", optional: true }],
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [],
  });

  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "b", type: "string", optional: true }],
    dependencies: [],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it("parses optional properties in classes", () => {
  const parser = new ModelParser(`
    class A {
      requiredProp: string;
      optionalProp?: number;
    }
  `);
  const models = parser.getModels();

  expect(models.length).toBe(1);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [
      { name: "requiredProp", type: "string", optional: false },
      { name: "optionalProp", type: "number", optional: true },
    ],
    dependencies: [],
    dependants: [],
    type: "class",
    arguments: [],
    implements: [],
  });
});
