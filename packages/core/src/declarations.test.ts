import { assert, expect, it } from "vitest";
import { parseModels } from "./index";
import { collectDeclarations } from "./declarations";
import { createCompilerContext } from "./compiler-context";

it("collects ambient function overloads once across reopened namespaces", () => {
  const compiler = createCompilerContext(`
    declare function read(value: string): string;
    declare function read(value: number): number;
    declare namespace Nested { export function read(value: boolean): boolean; }
    declare namespace Nested { export function read(value: bigint): bigint; }
    export default function () {}
  `);
  const declarations = collectDeclarations(compiler.sourceFile);
  const functions = declarations.filter((declaration) => declaration.kind === "function");

  expect(functions.map((declaration) => declaration.name)).toEqual(["read", "Nested.read"]);
  expect(
    functions.map((declaration) =>
      declaration.signatures.map((signature) => signature.getReturnType().getText())
    )
  ).toEqual([
    ["string", "number"],
    ["boolean", "bigint"],
  ]);
});

it("keeps function overload annotations and omits their implementation", () => {
  const compiler = createCompilerContext(`
    function convert(value: string): number;
    function convert(value: number): string;
    function convert(value: string | number): string | number { return value; }
  `);
  const [declaration] = collectDeclarations(compiler.sourceFile);
  assert(declaration.kind === "function");

  expect(declaration.signatures.map((signature) => signature.getText())).toEqual([
    "function convert(value: string): number;",
    "function convert(value: number): string;",
  ]);
});

it("associates every merged interface declaration with its class owner", () => {
  const compiler = createCompilerContext(`
    interface Entry { id: string }
    interface Entry { label: string }
    class Entry { active: boolean }
  `);
  const declarations = collectDeclarations(compiler.sourceFile);
  const [declaration] = declarations;
  assert(declaration.kind === "class");

  expect(declarations).toHaveLength(1);
  expect(declaration.interfaces.map((item) => item.getText())).toEqual([
    "interface Entry { id: string }",
    "interface Entry { label: string }",
  ]);
});

it("parses top level type aliases and interfaces into models", () => {
  const models = parseModels("interface A { a: string; }; type B = { b: string };");

  expect(models.length).toBe(2);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    extends: [],
    schema: [{ name: "a", type: "string", optional: false }],
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [],
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "b", type: "string", optional: false }],
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
    dependencies: [],
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it("collects and links declarations from explicitly nested namespaces", () => {
  const models = parseModels(`
    namespace Domain {
      export namespace Billing {
        export interface Invoice { id: string; }
        export class Ledger { total: number; }
        export type InvoiceId = string;
        export enum InvoiceState { Open }
      }
    }

    interface Order { invoice: Domain.Billing.Invoice; }
  `);

  const order = models.find((model) => model.name === "Order");
  const invoice = models.find((model) => model.name === "Domain.Billing.Invoice");

  assert.exists(order);
  assert(order.type === "interface");
  assert.exists(invoice);
  assert(invoice.type === "interface");

  expect(models).toHaveLength(5);
  expect(models).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "Domain.Billing.Invoice", type: "interface" }),
      expect.objectContaining({ name: "Domain.Billing.Ledger", type: "class" }),
      expect.objectContaining({ name: "Domain.Billing.InvoiceId", type: "typeAlias" }),
      expect.objectContaining({ name: "Domain.Billing.InvoiceState", type: "enum" }),
    ])
  );
  expect(invoice.id).toBe("Domain.Billing.Invoice");
  expect(invoice.schema).toEqual([{ name: "id", type: "string", optional: false }]);
  expect(order.schema).toContainEqual({ name: "invoice", type: invoice, optional: false });
  expect(order.dependencies).toContain(invoice);
});

it("preserves qualified names across namespace spellings and declaration merging", () => {
  const getModelNames = (source: string) => parseModels(source).map((model) => model.name);

  expect(getModelNames("namespace A.B.C { export interface D {} }")).toEqual(["A.B.C.D"]);
  expect(
    getModelNames("namespace A { export namespace B { export namespace C { export interface D {} } } }")
  ).toEqual(["A.B.C.D"]);
  expect(getModelNames("namespace A { export interface C {} }")).toEqual(["A.C"]);

  const mergedModels = parseModels(`
    namespace A.B { export interface C { dotted: string; } }
    namespace A { export namespace B { export interface C { nested: string; } } }
  `);

  expect(mergedModels).toHaveLength(1);
  expect(mergedModels[0]).toEqual(
    expect.objectContaining({
      name: "A.B.C",
      schema: expect.arrayContaining([
        expect.objectContaining({ name: "dotted" }),
        expect.objectContaining({ name: "nested" }),
      ]),
    })
  );
});

it("supports declaration merging", () => {
  const models = parseModels(`
    interface A { a: string; }
    interface A { a: string; b: string; }
  `);

  expect(models.length).toBe(1);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    extends: [],
    schema: [
      { name: "a", type: "string", optional: false },
      { name: "b", type: "string", optional: false },
    ],
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [],
  });
});

it("parses classes", () => {
  const models = parseModels(`
    class A { foo: string; }
    class B { bar(): string { throw new Error(); } }
    class C extends A implements B { bar() { return "baz"; } }
  `);

  expect(models.length).toBe(3);

  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "foo", type: "string", optional: false }],
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
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
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
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
        inherited: true,
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
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
    dependants: [],
    type: "class",
    arguments: [],
  });
});

it("parses enums with members and links referencing fields", () => {
  const models = parseModels(`
    enum Color { Red, Green, Blue }
    enum Status { Active = "active", Done = "done" }
    interface Shape {
      color: Color;
      status: Status;
    }
  `);

  const color = models.find((m) => m.name === "Color");
  const status = models.find((m) => m.name === "Status");
  const shape = models.find((m) => m.name === "Shape");

  expect(color?.type).toBe("enum");
  expect(color?.schema).toEqual([
    { name: "Red", type: "0", optional: false },
    { name: "Green", type: "1", optional: false },
    { name: "Blue", type: "2", optional: false },
  ]);
  expect(status?.schema).toEqual([
    { name: "Active", type: '"active"', optional: false },
    { name: "Done", type: '"done"', optional: false },
  ]);
  expect(shape?.schema).toEqual([
    { name: "color", type: expect.objectContaining({ name: "Color", type: "enum" }), optional: false },
    { name: "status", type: expect.objectContaining({ name: "Status" }), optional: false },
  ]);
  expect(shape?.dependencies).toEqual([
    expect.objectContaining({ name: "Color" }),
    expect.objectContaining({ name: "Status" }),
  ]);
});

it("escapes string enum values as complete string literals", () => {
  const [model] = parseModels(String.raw`enum Text { Value = 'quote" slash\\ line\nend' }`);
  const text = '"quote\\" slash\\\\ line\\nend"';

  expect(model.schema).toEqual([{ name: "Value", type: text, optional: false }]);
  expect(model.typeTextSegments[text]).toEqual([{ text, kind: "literal" }]);
});
