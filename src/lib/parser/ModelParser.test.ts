/* eslint-disable @typescript-eslint/no-magic-numbers */
import { expect, it } from "vitest";
import { isFunctionSchemaField, ModelParser } from "./ModelParser";

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

it("preserves type alias references instead of expanding unions", () => {
  const parser = new ModelParser(`
    type AgentResourceType = "tool" | "context" | "escalation";
    type AgentFlowProps = {
      onAddResource: (type: AgentResourceType) => void;
    };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(2);

  expect(models[0]).toEqual({
    id: "AgentResourceType",
    name: "AgentResourceType",
    schema: [{ name: "==>", type: "union", types: ['"tool"', '"context"', '"escalation"'], optional: false }],
    dependencies: [],
    dependants: [expect.objectContaining({ name: "AgentFlowProps" })],
    type: "typeAlias",
    arguments: [],
  });

  expect(models[1]).toEqual({
    id: "AgentFlowProps",
    name: "AgentFlowProps",
    schema: [
      {
        name: "onAddResource",
        type: "function",
        arguments: [
          {
            name: "type",
            type: expect.objectContaining({ name: "AgentResourceType" }),
          },
        ],
        returnType: "void",
        optional: false,
      },
    ],
    dependencies: [expect.objectContaining({ name: "AgentResourceType" })],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it("preserves type alias references in property types", () => {
  const parser = new ModelParser(`
    type Status = "active" | "inactive" | "pending";
    interface User {
      status: Status;
      previousStatus?: Status;
    }
  `);
  const models = parser.getModels();

  expect(models.length).toBe(2);

  expect(models[0]).toEqual({
    id: "User",
    name: "User",
    extends: [],
    schema: [
      { name: "status", type: expect.objectContaining({ name: "Status" }), optional: false },
      { name: "previousStatus", type: expect.objectContaining({ name: "Status" }), optional: true },
    ],
    dependencies: [expect.objectContaining({ name: "Status" })],
    dependants: [],
    type: "interface",
    arguments: [],
  });
});

it("preserves type alias references in arrays and generics", () => {
  const parser = new ModelParser(`
    type Color = "red" | "green" | "blue";
    type Theme = {
      colors: Color[];
      colorMap: Record<string, Color>;
    };
  `);
  const models = parser.getModels();

  expect(models.length).toBe(2);

  expect(models[1]).toEqual({
    id: "Theme",
    name: "Theme",
    schema: [
      {
        name: "colors",
        type: "array",
        elementType: expect.objectContaining({ name: "Color" }),
        optional: false,
      },
      {
        name: "colorMap",
        type: "generic",
        genericName: "Record",
        arguments: ["string", expect.objectContaining({ name: "Color" })],
        optional: false,
      },
    ],
    dependencies: [expect.objectContaining({ name: "Color" })],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it("ensures dependencies are properly tracked for function arguments", () => {
  const parser = new ModelParser(`
    type ResourceType = "tool" | "context" | "escalation";
    interface Handler {
      onAdd: (type: ResourceType) => void;
      onRemove: (id: string, type: ResourceType) => ResourceType;
    }
  `);
  const models = parser.getModels();

  expect(models.length).toBe(2);

  const resourceTypeModel = models.find((m) => m.name === "ResourceType");
  const handlerModel = models.find((m) => m.name === "Handler");

  expect(resourceTypeModel?.dependants).toEqual([expect.objectContaining({ name: "Handler" })]);
  expect(handlerModel?.dependencies).toEqual([expect.objectContaining({ name: "ResourceType" })]);

  expect(handlerModel?.schema).toEqual([
    {
      name: "onAdd",
      type: "function",
      arguments: [{ name: "type", type: expect.objectContaining({ name: "ResourceType" }) }],
      returnType: "void",
      optional: false,
    },
    {
      name: "onRemove",
      type: "function",
      arguments: [
        { name: "id", type: "string" },
        { name: "type", type: expect.objectContaining({ name: "ResourceType" }) },
      ],
      returnType: expect.objectContaining({ name: "ResourceType" }),
      optional: false,
    },
  ]);
});

it("handles indexed access type scenario", () => {
  const parser = new ModelParser(`
    type A = { type: "a" };
    type B = { type: "b" };
    type C = { type: "c" };
    type Union = A | B | C;
    type UnionKey = Union["type"];

    type SampleA = {
      id: string;
      Works: UnionKey;
    };

    type SampleB = {
      id: string;
      AlsoWorks: (arg: UnionKey) => void;
    };
  `);
  const models = parser.getModels();

  const unionKeyModel = models.find((m) => m.name === "UnionKey");
  const sampleAModel = models.find((m) => m.name === "SampleA");
  const sampleBModel = models.find((m) => m.name === "SampleB");

  const worksField = sampleAModel?.schema.find((field) => field.name === "Works");
  const functionField = sampleBModel?.schema.find((field) => field.name === "AlsoWorks");
  expect(models.length).toBe(7); // A, B, C, Union, UnionKey, SampleA, SampleB

  const unionModel = models.find((m) => m.name === "Union");

  // verify dependency chain: Union <- UnionKey <- SampleA/SampleB
  expect(unionKeyModel?.dependencies).toEqual([expect.objectContaining({ name: "Union" })]);
  expect(unionKeyModel?.dependants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "SampleA" }),
      expect.objectContaining({ name: "SampleB" }),
    ])
  );
  expect(sampleAModel?.dependencies).toEqual([expect.objectContaining({ name: "UnionKey" })]);
  expect(sampleBModel?.dependencies).toEqual([expect.objectContaining({ name: "UnionKey" })]);
  expect(unionModel?.dependants).toEqual([expect.objectContaining({ name: "UnionKey" })]);

  // check that type alias references are preserved
  expect(worksField?.type).toEqual(expect.objectContaining({ name: "UnionKey" }));
  if (functionField && isFunctionSchemaField(functionField)) {
    expect(functionField.arguments[0]?.type).toEqual(expect.objectContaining({ name: "UnionKey" }));
  }
});
