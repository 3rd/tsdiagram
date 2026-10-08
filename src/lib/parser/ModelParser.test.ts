import { expect, it } from "vitest";
import { isDefaultSchemaField, isFunctionSchemaField, ModelParser } from "./ModelParser";

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
  const [model] = new ModelParser(`type Example<T> = ${text};`).getModels();
  const segments = model.typeTextSegments[text];

  expect(segments.map((segment) => segment.text).join("")).toBe(text);
  expect(segments.filter((segment) => segment.kind !== "default")).toEqual(colored);
});

it("provides cloneable type segments for every field shape without replacing model references", () => {
  const models = new ModelParser(`
    interface Item { id: string }
    interface Example<T> {
      item: Item;
      list: readonly string[];
      generic: Map<string, T>;
      run(argument: boolean): number[];
    }
    type Choice = "open" | 2;
    enum State { Open }
  `).getModels();
  const cloned = structuredClone(models);
  const example = cloned.find((model) => model.name === "Example");
  const item = cloned.find((model) => model.name === "Item");
  const choice = cloned.find((model) => model.name === "Choice");
  const state = cloned.find((model) => model.name === "State");
  if (!example || !item || !choice || !state) throw new Error("Expected source models");

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

it("links interface extends declared after the deriving interface", () => {
  const parser = new ModelParser("interface B extends A { b: string }\ninterface A { a: string }");
  const models = parser.getModels();
  const a = models.find((model) => model.name === "A");
  const b = models.find((model) => model.name === "B");

  if (b?.type !== "interface") throw new Error("expected interface");
  expect(b.extends[0]).toBe(a);
});

it("links class heritage declared after the class", () => {
  const source = "class C extends D implements I {}\nclass D {}\ninterface I { i: string }";
  const models = new ModelParser(source).getModels();
  const c = models.find((model) => model.name === "C");
  const d = models.find((model) => model.name === "D");
  const i = models.find((model) => model.name === "I");

  if (c?.type !== "class") throw new Error("expected class");
  expect(c.extends).toBe(d);
  expect(c.implements[0]).toBe(i);
});

it("narrows default schema fields only", () => {
  const source =
    "interface A { x: string }\ninterface B { y: string }\ntype U = A | B;\ninterface C { fn(): string; plain: string }";
  const models = new ModelParser(source).getModels();
  const unionField = models.find((model) => model.name === "U")?.schema[0];
  const c = models.find((model) => model.name === "C");
  const fnField = c?.schema.find((field) => field.name === "fn");
  const plainField = c?.schema.find((field) => field.name === "plain");
  if (!unionField || !fnField || !plainField) throw new Error("missing fields");

  expect(isDefaultSchemaField(unionField)).toBe(false);
  expect(isDefaultSchemaField(fnField)).toBe(false);
  expect(isDefaultSchemaField(plainField)).toBe(true);
});

it("keeps a declared | null on optional properties", () => {
  const parser = new ModelParser("interface A { req: string | null; opt?: string | null }");
  const [a] = parser.getModels();

  expect(a.schema).toEqual([
    expect.objectContaining({ name: "req", optional: false, type: "string | null" }),
    expect.objectContaining({ name: "opt", optional: true, type: "string | null" }),
  ]);
});

it("parses top level type aliases and interfaces into models", () => {
  const parser = new ModelParser("interface A { a: string; }; type B = { b: string };");
  const models = parser.getModels();

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

it("parses exported top level type aliases and interfaces into models", () => {
  const parser = new ModelParser("export interface A { a: string; }; export type B = { b: string };");
  const models = parser.getModels();

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
  const parser = new ModelParser(`
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

  const models = parser.getModels();
  const order = models.find((model) => model.name === "Order");
  const invoice = models.find((model) => model.name === "Domain.Billing.Invoice");

  if (order?.type !== "interface" || invoice?.type !== "interface") {
    throw new Error("expected interfaces");
  }

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
  expect(invoice.dependants).toContain(order);
});

it("preserves qualified names across namespace spellings and declaration merging", () => {
  const getModelNames = (source: string) => new ModelParser(source).getModels().map((model) => model.name);

  expect(getModelNames("namespace A.B.C { export interface D {} }")).toEqual(["A.B.C.D"]);
  expect(
    getModelNames("namespace A { export namespace B { export namespace C { export interface D {} } } }")
  ).toEqual(["A.B.C.D"]);
  expect(getModelNames("namespace A { export interface C {} }")).toEqual(["A.C"]);

  const mergedModels = new ModelParser(`
    namespace A.B { export interface C { dotted: string; } }
    namespace A { export namespace B { export interface C { nested: string; } } }
  `).getModels();

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

it("resolves references from the nearest nested namespace", () => {
  const models = new ModelParser(`
    namespace Domain {
      export interface Target { outer: string; }
      export namespace Billing {
        export interface Target { id: string; }
        export interface Child extends Target {}
        export interface Picked extends Pick<Target, "id"> {}
        export class Parent {}
        export interface Contract {}
        export class Worker extends Parent implements Contract {}
        export type Constrained<T extends Target> = T;
        export type TargetId = Target["id"];
        export enum State { Open }
        export type StateKeys = keyof typeof State;
      }
    }
  `).getModels();
  const target = models.find((model) => model.name === "Domain.Billing.Target");
  const child = models.find((model) => model.name === "Domain.Billing.Child");
  const picked = models.find((model) => model.name === "Domain.Billing.Picked");
  const parent = models.find((model) => model.name === "Domain.Billing.Parent");
  const contract = models.find((model) => model.name === "Domain.Billing.Contract");
  const worker = models.find((model) => model.name === "Domain.Billing.Worker");
  const constrained = models.find((model) => model.name === "Domain.Billing.Constrained");
  const targetId = models.find((model) => model.name === "Domain.Billing.TargetId");
  const state = models.find((model) => model.name === "Domain.Billing.State");
  const stateKeys = models.find((model) => model.name === "Domain.Billing.StateKeys");

  if (
    !target ||
    child?.type !== "interface" ||
    picked?.type !== "interface" ||
    !parent ||
    !contract ||
    worker?.type !== "class" ||
    !constrained ||
    !targetId ||
    !state ||
    !stateKeys
  ) {
    throw new Error("expected namespaced models");
  }

  expect(child.extends).toEqual([target]);
  expect(child.dependencies).toContain(target);
  expect(picked.headerRefs).toContain(target);
  expect(worker.extends).toBe(parent);
  expect(worker.implements).toEqual([contract]);
  expect(constrained.dependencies).toContain(target);
  expect(targetId.dependencies).toContain(target);
  expect(stateKeys.dependencies).toContain(state);
});

it("resolves nested namespace import aliases by declaration identity", () => {
  const models = new ModelParser(`
    interface User {}
    namespace A { export interface User {} }
    namespace N {
      export namespace M {
        export import User = A.User;
        export interface X { value: User; }
      }
    }
  `).getModels();
  const globalUser = models.find((model) => model.name === "User");
  const aliasedUser = models.find((model) => model.name === "A.User");
  const x = models.find((model) => model.name === "N.M.X");

  if (!globalUser || !aliasedUser || x?.type !== "interface") {
    throw new Error("expected alias models");
  }

  expect(x.schema).toEqual([{ name: "value", type: aliasedUser, optional: false }]);
  expect(x.dependencies).toEqual([aliasedUser]);
  expect(aliasedUser.dependants).toEqual([x]);
  expect(globalUser.dependants).toEqual([]);
});

it("resolves nested namespace import aliases by declaration identity in a module file", () => {
  const models = new ModelParser(`
    export interface User {}
    export namespace A { export interface User {} }
    export namespace N {
      export namespace M {
        export import User = A.User;
        export interface X { value: User; }
      }
    }
  `).getModels();
  const globalUser = models.find((model) => model.name === "User");
  const aliasedUser = models.find((model) => model.name === "A.User");
  const x = models.find((model) => model.name === "N.M.X");

  if (!globalUser || !aliasedUser || x?.type !== "interface") {
    throw new Error("expected alias models");
  }

  expect(x.schema).toEqual([{ name: "value", type: aliasedUser, optional: false }]);
  expect(x.dependencies).toEqual([aliasedUser]);
  expect(aliasedUser.dependants).toEqual([x]);
  expect(globalUser.dependants).toEqual([]);
});

it("links inherited members of a module file to the declared model over a namespace homonym", () => {
  const models = new ModelParser(`
    export interface Item { top: string }
    export interface Box { value: Item }
    export namespace N {
      export interface Item { inner: string }
      export interface Holder extends Box {}
    }
  `).getModels();
  const item = models.find((model) => model.name === "Item");
  const box = models.find((model) => model.name === "Box");
  const innerItem = models.find((model) => model.name === "N.Item");
  const holder = models.find((model) => model.name === "N.Holder");

  if (!item || !box || !innerItem || holder?.type !== "interface") {
    throw new Error("expected module models");
  }

  expect(holder.extends).toEqual([box]);
  expect(holder.schema).toEqual([{ name: "value", type: item, optional: false, inherited: true }]);
  expect(holder.dependencies).toEqual([box, item]);
  expect(innerItem.dependants).toEqual([]);
});

it("resolves heritage through namespace import aliases by declaration identity", () => {
  const models = new ModelParser(`
    interface User {}
    namespace A { export interface User {} }
    namespace N {
      export namespace M {
        export import User = A.User;
        export interface X extends User {}
        export class Y implements User {}
      }
    }
  `).getModels();
  const globalUser = models.find((model) => model.name === "User");
  const aliasedUser = models.find((model) => model.name === "A.User");
  const x = models.find((model) => model.name === "N.M.X");
  const y = models.find((model) => model.name === "N.M.Y");

  if (!globalUser || !aliasedUser || x?.type !== "interface" || y?.type !== "class") {
    throw new Error("expected alias models");
  }

  expect(x.extends).toEqual([aliasedUser]);
  expect(x.dependencies).toEqual([aliasedUser]);
  expect(y.implements).toEqual([aliasedUser]);
  expect(y.dependencies).toEqual([aliasedUser]);
  expect(aliasedUser.dependants).toEqual([x, y]);
  expect(globalUser.dependants).toEqual([]);
});

it("resolves inherited index signature values through namespace import aliases", () => {
  const models = new ModelParser(`
    interface User {}
    namespace A { export interface User { id: string } }
    namespace N {
      export import User = A.User;
      export interface D extends Record<string, User> {}
    }
  `).getModels();
  const globalUser = models.find((model) => model.name === "User");
  const aliasedUser = models.find((model) => model.name === "A.User");
  const d = models.find((model) => model.name === "N.D");

  if (!globalUser || !aliasedUser || d?.type !== "interface") throw new Error("expected alias models");

  expect(d.schema).toEqual([{ name: "[key: string]", type: aliasedUser, optional: false, inherited: true }]);
  expect(d.dependencies).toEqual([aliasedUser]);
  expect(globalUser.dependants).toEqual([]);
});

it("links heritage to a namespace sibling declared later over an outer homonym", () => {
  const models = new ModelParser(`
    interface Target {}
    namespace D {
      export interface Child extends Target {}
      export class Derived extends Target {}
      export interface Target {}
    }
  `).getModels();
  const outerTarget = models.find((model) => model.name === "Target");
  const siblingTarget = models.find((model) => model.name === "D.Target");
  const child = models.find((model) => model.name === "D.Child");
  const derived = models.find((model) => model.name === "D.Derived");

  if (!outerTarget || !siblingTarget || child?.type !== "interface" || derived?.type !== "class") {
    throw new Error("expected heritage models");
  }

  expect(child.extends).toEqual([siblingTarget]);
  expect(child.dependencies).toEqual([siblingTarget]);
  expect(derived.extends).toBe(siblingTarget);
  expect(derived.dependencies).toEqual([siblingTarget]);
  expect(outerTarget.dependants).toEqual([]);
});

it("keeps generic type parameters distinct from same-named namespace models", () => {
  const models = new ModelParser(`
    namespace Domain {
      export interface T { target: string; }
      export interface U { sibling: string; }
      export interface Box<T> {
        value: T;
        sibling: U;
        map<U>(input: U): U;
        list<U>(input: U[]): U[];
      }
      export type Alias<T> = { value: T };
      export interface Callable {
        <U>(input: U[]): U[];
      }
      export class Adapter {}
      export interface Adapter extends Callable {}
    }
  `).getModels();
  const sibling = models.find((model) => model.name === "Domain.U");
  const target = models.find((model) => model.name === "Domain.T");
  const box = models.find((model) => model.name === "Domain.Box");
  const alias = models.find((model) => model.name === "Domain.Alias");
  const callable = models.find((model) => model.name === "Domain.Callable");
  const adapter = models.find((model) => model.name === "Domain.Adapter");

  if (
    !sibling ||
    !target ||
    box?.type !== "interface" ||
    alias?.type !== "typeAlias" ||
    callable?.type !== "interface" ||
    adapter?.type !== "class"
  ) {
    throw new Error("expected generic namespace models");
  }

  expect(box.schema).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "value", type: "T" }),
      expect.objectContaining({ name: "sibling", type: sibling }),
      expect.objectContaining({
        name: "map",
        arguments: [{ name: "input", type: "U" }],
        returnType: "U",
      }),
      expect.objectContaining({
        name: "list",
        arguments: [{ name: "input", type: "U[]" }],
        returnType: ["U"],
      }),
    ])
  );
  expect(box.dependencies).toContain(sibling);
  expect(box.dependencies).not.toContain(target);
  expect(alias.schema).toContainEqual(expect.objectContaining({ name: "value", type: "T" }));
  expect(alias.dependencies).not.toContain(target);
  expect(adapter.schema).toContainEqual(
    expect.objectContaining({
      name: "",
      arguments: [{ name: "input", type: "U[]" }],
      returnType: "U[]",
    })
  );
  expect(adapter.dependencies).toContain(callable);
  expect(adapter.dependencies).not.toContain(sibling);
});

it("does not treat an owner namespace as a field type qualifier", () => {
  const models = new ModelParser(`
    class Domain {}
    namespace Domain {
      export interface Box<T> {
        value: T;
        primitive: string;
        list: T[];
      }
    }
  `).getModels();
  const domain = models.find((model) => model.name === "Domain");
  const box = models.find((model) => model.name === "Domain.Box");

  if (!domain || box?.type !== "interface") throw new Error("expected namespace models");

  expect(box.schema).toEqual([
    { name: "value", type: "T", optional: false },
    { name: "primitive", type: "string", optional: false },
    { name: "list", type: "array", elementType: "T", optional: false },
  ]);
  expect(box.dependencies).toEqual([]);
  expect(domain.dependants).toEqual([]);
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
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
    dependencies: [],
    dependants: [expect.objectContaining({ name: "B" }), expect.objectContaining({ name: "C" })],
    type: "typeAlias",
    arguments: [],
  });
  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "field", type: expect.objectContaining({ name: "A" }), optional: false }],
    typeTextSegments: {},
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
    typeTextSegments: { Record: [{ text: "Record", kind: "reference" }] },
    dependencies: [expect.objectContaining({ name: "A" })],
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
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [],
  });
});

it("renders synthesized properties from mapped interface heritage", () => {
  const models = new ModelParser(`
    interface Full { a: string; b: number; }
    interface Picked extends Pick<Full, "a"> { own: boolean; }
    interface Optional extends Partial<Full> {}
    interface Plain extends Full {}
    interface Other { c: boolean; }
    interface Mixed extends Full, Partial<Other> { own: bigint; }
    interface OverrideBase { inherited?: string; }
    interface Override extends OverrideBase { own: boolean; inherited: string; }
    class Merged { own: boolean; }
    interface Merged extends Partial<Full> {}
    type Alias = Pick<Full, "a">;
  `).getModels();
  const full = models.find((model) => model.name === "Full");
  const picked = models.find((model) => model.name === "Picked");
  const optional = models.find((model) => model.name === "Optional");
  const plain = models.find((model) => model.name === "Plain");
  const mixed = models.find((model) => model.name === "Mixed");
  const override = models.find((model) => model.name === "Override");
  const merged = models.find((model) => model.name === "Merged");
  const alias = models.find((model) => model.name === "Alias");

  if (!full || !picked || !optional || !plain || !mixed || !override || merged?.type !== "class" || !alias) {
    throw new Error("expected mapped models");
  }
  expect(picked.schema).toEqual([
    { name: "a", type: "string", optional: false, inherited: true },
    { name: "own", type: "boolean", optional: false },
  ]);
  expect(picked.dependencies).toContain(full);
  expect(optional.schema).toEqual([
    { name: "a", type: "string", optional: true, inherited: true },
    { name: "b", type: "number", optional: true, inherited: true },
  ]);
  expect(plain.schema).toEqual([
    { name: "a", type: "string", optional: false, inherited: true },
    { name: "b", type: "number", optional: false, inherited: true },
  ]);
  expect(mixed.schema).toEqual([
    { name: "a", type: "string", optional: false, inherited: true },
    { name: "b", type: "number", optional: false, inherited: true },
    { name: "c", type: "boolean", optional: true, inherited: true },
    { name: "own", type: "bigint", optional: false },
  ]);
  expect(override.schema).toEqual([
    { name: "own", type: "boolean", optional: false },
    { name: "inherited", type: "string", optional: false },
  ]);
  expect(merged.schema).toEqual([
    { name: "a", type: "string", optional: true, inherited: true },
    { name: "b", type: "number", optional: true, inherited: true },
    { name: "own", type: "boolean", optional: false },
  ]);
  expect(merged.dependencies).toContain(full);
  expect(alias.schema).toEqual([{ name: "a", type: "string", optional: false }]);
});

it.each([
  { base: 'Pick<Source, "value">', optional: false, readonly: false },
  { base: 'Omit<Source, "other">', optional: false, readonly: false },
  { base: "Partial<Source>", optional: true, readonly: false },
  { base: "Required<Source>", optional: false, readonly: false },
  { base: "Readonly<Source>", optional: false, readonly: true },
  { base: 'Record<"value", Entity>', optional: false, readonly: false },
  { base: "{ [K in keyof Source]: Source[K] }", optional: false, readonly: false },
])("renders inherited class properties from $base", ({ base, optional, readonly }) => {
  const models = new ModelParser(`
    interface Entity { id: string }
    interface Source { value: Entity }
    type Base = ${base};
    declare const Ctor: new () => Base;
    class Impl extends Ctor { own = ""; }
    interface IfaceImpl extends Base { own: string; }
  `).getModels();
  const entity = models.find((model) => model.name === "Entity");
  const impl = models.find((model) => model.name === "Impl");
  const iface = models.find((model) => model.name === "IfaceImpl");
  if (!entity || !impl || !iface) throw new Error("expected mapped class models");

  const value = {
    name: "value",
    type: entity,
    optional,
    inherited: true,
    ...(readonly ? { modifiers: ["readonly"] } : {}),
  };
  const own = { name: "own", type: "string", optional: false };
  expect(impl.schema).toHaveLength(2);
  expect(impl.schema).toEqual(expect.arrayContaining([own, value]));
  expect(iface.schema).toEqual([value, own]);
  expect(impl.dependencies).toContain(entity);
});

it("keeps class overrides and merged synthesized members once without reordering own members", () => {
  const models = new ModelParser(`
    interface Source { value: string | number; inherited: boolean }
    declare const Ctor: new () => Partial<Source>;
    class Impl extends Ctor {
      own = "";
      value = 1;
      static inherited = 2;
      run() {}
      get size() { return 1; }
    }
    interface Impl extends Partial<Source> {}
  `).getModels();
  const impl = models.find((model) => model.name === "Impl");
  if (!impl) throw new Error("expected merged class");

  expect(impl.schema.filter((field) => !field.inherited).map((field) => field.name)).toEqual([
    "own",
    "value",
    "inherited",
    "run",
    "size",
  ]);
  expect(impl.schema.filter((field) => field.name === "value")).toEqual([
    { name: "value", type: "number", optional: false },
  ]);
  const inheritedRows = impl.schema.filter((field) => field.name === "inherited");
  expect(inheritedRows).toHaveLength(2);
  expect(inheritedRows).toEqual(
    expect.arrayContaining([
      { name: "inherited", type: "number", optional: false, modifiers: ["static"] },
      { name: "inherited", type: "boolean", optional: true, inherited: true },
    ])
  );
});

it("keeps effective mapped property types and readonly modifiers", () => {
  const models = new ModelParser(`
    interface Entity {}
    interface Source { value: Entity; }
    type Strings = { [K in keyof Source]: string };
    interface StringView extends Strings {}
    declare const StringCtor: new () => Strings;
    class StringModel extends StringCtor {}
    interface ReadonlyView extends Readonly<Source> {}
    class ReadonlyModel {}
    interface ReadonlyModel extends Readonly<Source> {}
  `).getModels();
  const entity = models.find((model) => model.name === "Entity");
  const strings = models.find((model) => model.name === "Strings");
  const stringView = models.find((model) => model.name === "StringView");
  const stringModel = models.find((model) => model.name === "StringModel");
  const readonlyView = models.find((model) => model.name === "ReadonlyView");
  const readonlyModel = models.find((model) => model.name === "ReadonlyModel");

  if (
    !entity ||
    !strings ||
    !stringView ||
    !stringModel ||
    !readonlyView ||
    readonlyModel?.type !== "class"
  ) {
    throw new Error("expected mapped models");
  }

  expect(strings.schema).toEqual([{ name: "value", type: "string", optional: false }]);
  expect(stringView.schema).toEqual([{ name: "value", type: "string", optional: false, inherited: true }]);
  expect(stringModel.schema).toEqual([{ name: "value", type: "string", optional: false, inherited: true }]);
  expect(strings.dependencies).not.toContain(entity);
  expect(stringView.dependencies).not.toContain(entity);
  expect(stringModel.dependencies).not.toContain(entity);
  expect(readonlyView.schema).toEqual([
    {
      name: "value",
      type: expect.objectContaining({ name: "Entity" }),
      optional: false,
      modifiers: ["readonly"],
      inherited: true,
    },
  ]);
  expect(readonlyModel.schema).toEqual([
    {
      name: "value",
      type: expect.objectContaining({ name: "Entity" }),
      optional: false,
      modifiers: ["readonly"],
      inherited: true,
    },
  ]);
});

it("renders inherited index signatures from Record heritage", () => {
  const models = new ModelParser(`
    interface User { id: string; }
    interface UserMap extends Record<string, User> {}
    interface Scores extends Record<string, number> {}
    interface MixedScores extends Record<string, number> { [key: number]: number; }
  `).getModels();
  const user = models.find((model) => model.name === "User");
  const userMap = models.find((model) => model.name === "UserMap");
  const scores = models.find((model) => model.name === "Scores");
  const mixedScores = models.find((model) => model.name === "MixedScores");

  if (!user || !userMap || !scores || !mixedScores) throw new Error("expected record models");
  expect(userMap.schema).toEqual([{ name: "[key: string]", type: user, optional: false, inherited: true }]);
  expect(userMap.dependencies).toContain(user);
  expect(scores.schema).toEqual([
    { name: "[key: string]", type: "number", optional: false, inherited: true },
  ]);
  expect(mixedScores.schema).toEqual([
    { name: "[key: string]", type: "number", optional: false, inherited: true },
    { name: "[key: number]", type: "number", optional: false },
  ]);
});

it("renders inherited symbol and template-literal index signatures", () => {
  const models = new ModelParser(`
    interface User { id: string; }
    interface SymbolRegistry { [key: symbol]: User; }
    interface Symbols extends SymbolRegistry {}
    interface DataRegistry { [key: \`data-\${string}\`]: User; }
    interface Data extends DataRegistry { [key: number]: number; }
  `).getModels();
  const user = models.find((model) => model.name === "User");
  const symbols = models.find((model) => model.name === "Symbols");
  const data = models.find((model) => model.name === "Data");

  if (!user || !symbols || !data) throw new Error("expected index models");
  expect(symbols.schema).toEqual([{ name: "[key: symbol]", type: user, optional: false, inherited: true }]);
  expect(symbols.dependencies).toContain(user);
  expect(data.schema).toEqual([
    { name: "[key: `data-${string}`]", type: user, optional: false, inherited: true },
    { name: "[key: number]", type: "number", optional: false },
  ]);
  expect(data.dependencies).toContain(user);
});

it("keeps interface heritage when the interface merges with a class", () => {
  const models = new ModelParser(`
    interface Base { x: string; }
    class Sprite { name: string; }
    interface Sprite extends Base {}
  `).getModels();
  const base = models.find((model) => model.name === "Base");
  const sprite = models.find((model) => model.name === "Sprite");

  if (!base || sprite?.type !== "class") throw new Error("expected merged class and base");
  expect(models.length).toBe(2);
  expect(sprite.schema).toEqual([
    { name: "x", type: "string", optional: false, inherited: true },
    { name: "name", type: "string", optional: false },
  ]);
  expect(sprite.extends).toBe(base);
  expect(sprite.dependencies).toEqual([base]);
  expect(base.dependants).toEqual([sprite]);
});

it("keeps class heritage and every merged interface heritage entry", () => {
  const models = new ModelParser(`
    class Root {}
    interface First {}
    interface Second {}
    class Sprite extends Root {}
    interface Sprite extends First, Second {}
  `).getModels();
  const root = models.find((model) => model.name === "Root");
  const first = models.find((model) => model.name === "First");
  const second = models.find((model) => model.name === "Second");
  const sprite = models.find((model) => model.name === "Sprite");

  if (!root || !first || !second || sprite?.type !== "class") {
    throw new Error("expected merged class and heritage models");
  }
  expect(sprite.extends).toBe(root);
  expect(sprite.headerRefs).toEqual([first, second]);
  expect(sprite.dependencies).toHaveLength(3);
  expect(sprite.dependencies).toEqual(expect.arrayContaining([root, first, second]));
  expect(root.dependants).toContain(sprite);
  expect(first.dependants).toContain(sprite);
  expect(second.dependants).toContain(sprite);
});

it("keeps interface-only signatures on a class merge without heritage", () => {
  const models = new ModelParser(`
    class Sprite {}
    interface Sprite {
      extra: number;
      (value: string): boolean;
      new (value: string): object;
      [key: string]: unknown;
    }
  `).getModels();
  const [sprite] = models;

  if (sprite?.type !== "class") throw new Error("expected merged class");
  expect(models.length).toBe(1);
  expect(sprite.schema.map((field) => field.name)).toEqual(["", "new", "[key: string]", "extra"]);
  expect(sprite.dependencies).toEqual([]);
});

it("keeps inherited generic signatures on a class merge", () => {
  const models = new ModelParser(`
    interface User { id: string; }
    interface Callable<T> {
      (value: T): T;
      (values: T[]): T[];
      new (value: T): { value: T };
    }
    class Adapter {}
    interface Adapter extends Callable<User> {}
  `).getModels();
  const user = models.find((model) => model.name === "User");
  const adapter = models.find((model) => model.name === "Adapter");

  if (!user || adapter?.type !== "class") throw new Error("expected merged class");
  expect(adapter.schema).toEqual([
    {
      name: "",
      type: "function",
      arguments: [{ name: "value", type: user }],
      returnType: user,
      optional: false,
      inherited: true,
    },
    {
      name: "",
      type: "function",
      arguments: [{ name: "values", type: "User[]" }],
      returnType: "User[]",
      optional: false,
      inherited: true,
      typeRefs: [user],
    },
    {
      name: "new",
      type: "function",
      arguments: [{ name: "value", type: user }],
      returnType: "{ value: User; }",
      optional: false,
      inherited: true,
      typeRefs: [user],
    },
  ]);
  expect(adapter.dependencies).toContain(user);
});

it("renders inherited generic signatures on a plain interface", () => {
  const models = new ModelParser(`
    interface User { id: string; }
    interface Callable<T> {
      (value: T): T;
      new (value: T): { value: T };
    }
    interface Adapter extends Callable<User> {}
  `).getModels();
  const user = models.find((model) => model.name === "User");
  const adapter = models.find((model) => model.name === "Adapter");

  if (!user || adapter?.type !== "interface") throw new Error("expected interface models");
  expect(adapter.schema).toEqual([
    {
      name: "",
      type: "function",
      arguments: [{ name: "value", type: user }],
      returnType: user,
      optional: false,
      inherited: true,
    },
    {
      name: "new",
      type: "function",
      arguments: [{ name: "value", type: user }],
      returnType: "{ value: User; }",
      optional: false,
      inherited: true,
      typeRefs: [user],
    },
  ]);
  expect(adapter.dependencies).toContain(user);
});

it("parses arrays of primitives", () => {
  const parser = new ModelParser("type A = { a: string[] };");
  const models = parser.getModels();

  expect(models.length).toBe(1);
  expect(models[0]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "a", type: "array", elementType: "string", optional: false }],
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
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
    typeTextSegments: {},
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
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
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
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
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
    typeTextSegments: {
      Record: [{ text: "Record", kind: "reference" }],
      string: [{ text: "string", kind: "primitive" }],
    },
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
    typeTextSegments: { Map: [{ text: "Map", kind: "reference" }] },
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
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
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
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
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
    typeTextSegments: { T: [{ text: "T", kind: "reference" }] },
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [{ name: "T" }, { name: "U", extends: "string" }],
  });

  expect(models[1]).toEqual({
    id: "A",
    name: "A",
    schema: [{ name: "a", type: "T", optional: false }],
    typeTextSegments: { T: [{ text: "T", kind: "reference" }] },
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
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
    dependencies: [],
    dependants: [],
    type: "interface",
    arguments: [],
  });

  expect(models[1]).toEqual({
    id: "B",
    name: "B",
    schema: [{ name: "b", type: "string", optional: true }],
    typeTextSegments: { string: [{ text: "string", kind: "primitive" }] },
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
    typeTextSegments: {
      string: [{ text: "string", kind: "primitive" }],
      number: [{ text: "number", kind: "primitive" }],
    },
    dependencies: [],
    dependants: [],
    type: "class",
    arguments: [],
    implements: [],
  });
});

it("preserves declared alias union order and resolved model references", () => {
  const models = new ModelParser(`
    interface User { id: string }
    interface Admin { id: string }
    type Actor = User | Admin | null | undefined;
    interface Holder { actor: User | Admin | null | undefined }
  `).getModels();
  const user = models.find((model) => model.name === "User");
  const admin = models.find((model) => model.name === "Admin");
  const actor = models.find((model) => model.name === "Actor");
  const holder = models.find((model) => model.name === "Holder");
  if (!user || !admin || !actor || !holder) throw new Error("missing models");

  expect(actor.schema).toEqual([
    { name: "==>", type: "union", types: [user, admin, "null", "undefined"], optional: false },
  ]);
  expect(actor.dependencies).toEqual([user, admin]);
  expect(user.dependants).toContain(actor);
  expect(admin.dependants).toContain(actor);
  expect(holder.schema).toEqual([
    { name: "actor", type: "User | Admin | null | undefined", optional: false, typeRefs: [user, admin] },
  ]);
});

it.each([
  ["User | User | null | never", ["User", "null"]],
  ["boolean | null", ["false", "true", "null"]],
  ["Pair | null", ["User", "Admin", "null"]],
  ["User | (Admin | null)", ["User", "Admin", "null"]],
  ["(User | Admin | null)", ["User", "Admin", "null"]],
  ["null | User | Admin", ["null", "User", "Admin"]],
  ["Indirect", ["null", "User", "Admin"]],
])("preserves normalized alias union members for %s", (expression, expectedNames) => {
  const models = new ModelParser(`
    interface User { id: string }
    interface Admin { id: string }
    type Pair = User | Admin;
    type Indirect = Pair | null;
    type Result = ${expression};
  `).getModels();
  const field = models.find((model) => model.name === "Result")?.schema[0];
  if (!field || !("types" in field)) throw new Error("expected union field");

  expect(field.types.map((type) => (typeof type === "string" ? type : type.name))).toEqual(expectedNames);
});

it("retains distinct alias union members with identical rendered text", () => {
  const [model] = new ModelParser(`
    type Result = { value: string } | { value: string } | null;
  `).getModels();

  expect(model.schema).toEqual([
    {
      name: "==>",
      type: "union",
      types: ["{ value: string; }", "{ value: string; }", "null"],
      optional: false,
    },
  ]);
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
    typeTextSegments: {
      '"tool"': [{ text: '"tool"', kind: "literal" }],
      '"context"': [{ text: '"context"', kind: "literal" }],
      '"escalation"': [{ text: '"escalation"', kind: "literal" }],
    },
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
    typeTextSegments: { void: [{ text: "void", kind: "default" }] },
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
    typeTextSegments: {},
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
    typeTextSegments: {
      Record: [{ text: "Record", kind: "reference" }],
      string: [{ text: "string", kind: "primitive" }],
    },
    dependants: [],
    type: "typeAlias",
    arguments: [],
  });
});

it.each(["interface Example", "declare class Example", "type Example ="])(
  "preserves readonly array types and independent property modifiers in %s",
  (declaration) => {
    const models = new ModelParser(`
      interface Item { id: string }
      type Items = ReadonlyArray<Item>;
      ${declaration} {
        mutable: string[];
        immutable: readonly string[];
        generic: ReadonlyArray<string>;
        optional?: readonly string[];
        items: readonly Item[];
        aliased: Items;
        readonly property: string[];
        readonly both: readonly string[];
        tuple: readonly [Item, number];
        map: ReadonlyMap<string, Item>;
      }
    `).getModels();
    const example = models.find((model) => model.name === "Example");
    const item = models.find((model) => model.name === "Item");
    if (!example || !item) throw new Error("missing models");

    expect(example.schema).toEqual([
      { name: "mutable", type: "array", elementType: "string", optional: false },
      { name: "immutable", type: "array", elementType: "string", readonly: true, optional: false },
      { name: "generic", type: "array", elementType: "string", readonly: true, optional: false },
      { name: "optional", type: "array", elementType: "string", readonly: true, optional: true },
      { name: "items", type: "array", elementType: item, readonly: true, optional: false },
      expect.objectContaining({ name: "aliased", type: "array", elementType: item, readonly: true }),
      { name: "property", type: "array", elementType: "string", modifiers: ["readonly"], optional: false },
      {
        name: "both",
        type: "array",
        elementType: "string",
        readonly: true,
        modifiers: ["readonly"],
        optional: false,
      },
      { name: "tuple", type: "readonly [Item, number]", typeRefs: [item], optional: false },
      {
        name: "map",
        type: "generic",
        genericName: "ReadonlyMap",
        arguments: ["string", item],
        optional: false,
      },
    ]);
    expect(example.dependencies).toContain(item);
    expect(item.dependants).toContain(example);
  }
);

it.each(["interface Example", "declare class Example", "type Example ="])(
  "preserves readonly method and callback array returns in %s",
  (declaration) => {
    const models = new ModelParser(`
      interface Item { id: string }
      type Items = ReadonlyArray<Item>;
      ${declaration} {
        mutable(): Item[];
        immutable(input: readonly Item[]): readonly Item[];
        callback: () => ReadonlyArray<string>;
        aliased(): Items;
      }
    `).getModels();
    const example = models.find((model) => model.name === "Example");
    const item = models.find((model) => model.name === "Item");
    if (!example || !item) throw new Error("missing models");

    expect(example.schema).toHaveLength(4);
    expect(example.schema).toEqual(
      expect.arrayContaining([
        { name: "mutable", type: "function", arguments: [], returnType: [item], optional: false },
        {
          name: "immutable",
          type: "function",
          arguments: [{ name: "input", type: "readonly Item[]" }],
          returnType: [item],
          returnTypeReadonly: true,
          optional: false,
          typeRefs: [item],
        },
        {
          name: "callback",
          type: "function",
          arguments: [],
          returnType: ["string"],
          returnTypeReadonly: true,
          optional: false,
        },
        expect.objectContaining({
          name: "aliased",
          type: "function",
          returnType: [item],
          returnTypeReadonly: true,
        }),
      ])
    );
    expect(example.dependencies).toContain(item);
    expect(item.dependants).toContain(example);
  }
);

it("links function argument and return types to their models", () => {
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

it("preserves indexed access aliases in property and function argument types", () => {
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

  expect(worksField?.type).toEqual(expect.objectContaining({ name: "UnionKey" }));
  if (!functionField || !isFunctionSchemaField(functionField)) {
    throw new Error("Expected AlsoWorks to be parsed as a function field");
  }
  expect(functionField.arguments[0]?.type).toEqual(expect.objectContaining({ name: "UnionKey" }));
});

it("preserves alias references for function return types on class properties", () => {
  const parser = new ModelParser(`
    type A = { type: "a" };
    type B = { type: "b" };
    type C = { type: "c" };
    type Union = A | B | C;
    type UnionKey = Union["type"];

    class Test {
      name: string;
      doThis: () => UnionKey;

      help() {
        console.log(2);
      }
    }
  `);

  const models = parser.getModels();

  const unionKeyModel = models.find((m) => m.name === "UnionKey");
  const testModel = models.find((m) => m.name === "Test");
  expect(unionKeyModel).toBeDefined();
  if (!testModel) throw new Error("Expected Test model");

  const doThisField = testModel.schema.find((field) => field.name === "doThis");

  expect(doThisField).toBeDefined();
  if (!doThisField || !isFunctionSchemaField(doThisField)) {
    throw new Error("Expected doThis to be parsed as a function field");
  }

  expect(doThisField.returnType).toEqual(expect.objectContaining({ name: "UnionKey" }));
  expect(testModel.dependencies).toEqual([expect.objectContaining({ name: "UnionKey" })]);
  expect(unionKeyModel?.dependants).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Test" })])
  );
});

it("preserves alias references for class methods, getters, and setters", () => {
  const parser = new ModelParser(`
    type A = { type: "a" };
    type B = { type: "b" };
    type Union = A | B;
    type UnionKey = Union["type"];

    class Example {
      doThis(): UnionKey {
        return "a";
      }

      get aliasStatus(): UnionKey {
        return "a";
      }

      set aliasStatus(value: UnionKey) {
        console.log(value);
      }
    }
  `);

  const models = parser.getModels();
  const exampleModel = models.find((m) => m.name === "Example");
  const unionKeyModel = models.find((m) => m.name === "UnionKey");

  expect(exampleModel?.dependencies).toEqual([expect.objectContaining({ name: "UnionKey" })]);
  expect(unionKeyModel?.dependants).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Example" })])
  );

  const doThisField = exampleModel?.schema.find((field) => field.name === "doThis");
  expect(doThisField).toBeDefined();
  if (!doThisField || !isFunctionSchemaField(doThisField)) {
    throw new Error("Expected doThis to be parsed as a function field");
  }
  expect(doThisField.returnType).toEqual(expect.objectContaining({ name: "UnionKey" }));

  const statusFields = exampleModel?.schema.filter((field) => field.name === "aliasStatus") ?? [];
  expect(doThisField.accessor).toBeUndefined();
  expect(statusFields.length).toBe(2);

  const getterField = statusFields.find(
    (field) => isFunctionSchemaField(field) && field.arguments.length === 0
  );
  if (!getterField || !isFunctionSchemaField(getterField)) {
    throw new Error("Expected getter to be parsed as a function field");
  }
  expect(getterField.returnType).toEqual(expect.objectContaining({ name: "UnionKey" }));
  expect(getterField.accessor).toBe("get");

  const setterField = statusFields.find(
    (field) => isFunctionSchemaField(field) && field.arguments.length === 1
  );
  if (!setterField || !isFunctionSchemaField(setterField)) {
    throw new Error("Expected setter to be parsed as a function field");
  }
  expect(setterField.returnType).toBe("void");
  expect(setterField.accessor).toBe("set");
  expect(setterField.arguments[0]?.type).toEqual(expect.objectContaining({ name: "UnionKey" }));
});

it("inherits accessor rows and their model dependencies without duplicating own accessors", () => {
  const models = new ModelParser(`
    interface Value { amount: number }
    class Base {
      label: string;
      get value(): Value { return { amount: 0 }; }
      set value(next: Value) {}
      run(): void {}
    }
    class Child extends Base { count: number; }
  `).getModels();
  const value = models.find((model) => model.name === "Value");
  const base = models.find((model) => model.name === "Base");
  const child = models.find((model) => model.name === "Child");
  if (!value || !base || !child) throw new Error("Expected accessor models");

  for (const model of [base, child]) {
    const inheritance = model === child ? { inherited: true } : {};
    expect(model.schema.filter((field) => field.name === "value")).toEqual([
      {
        name: "value",
        type: "function",
        accessor: "get",
        arguments: [],
        returnType: value,
        optional: false,
        ...inheritance,
      },
      {
        name: "value",
        type: "function",
        accessor: "set",
        arguments: [{ name: "next", type: value }],
        returnType: "void",
        optional: false,
        ...inheritance,
      },
    ]);
    expect(model.dependencies).toContain(value);
    expect(value.dependants).toContain(model);
  }
  expect(child.schema.map(({ name, inherited }) => ({ name, inherited }))).toEqual([
    { name: "label", inherited: true },
    { name: "count", inherited: undefined },
    { name: "run", inherited: true },
    { name: "value", inherited: true },
    { name: "value", inherited: true },
  ]);
});

it.each([
  { argument: "string", setterType: "string | number" },
  { argument: "Value", setterType: "number | Value" },
])("specializes inherited getter and setter types with $argument", ({ argument, setterType }) => {
  const parser = new ModelParser(`
    interface Value { amount: number }
    class Base<T> {
      get value(): T { throw 0; }
      set value(next: T | number) {}
      set reversed(next: T) {}
      get reversed(): T { throw 0; }
      get readOnly(): T { throw 0; }
      set writeOnly(next: T) {}
    }
    class Child extends Base<${argument}> {}
    class Grandchild extends Child {}
  `);
  expect(parser.project.getPreEmitDiagnostics()).toHaveLength(0);
  const models = parser.getModels();
  const value = models.find((model) => model.name === "Value");
  if (!value) throw new Error("Expected Value");
  const expectedType = argument === "Value" ? value : argument;

  for (const name of ["Child", "Grandchild"]) {
    const model = models.find((model) => model.name === name);
    if (!model) throw new Error(`Expected ${name}`);
    const fields = model.schema.filter(isFunctionSchemaField);
    expect(fields).toHaveLength(6);
    expect(fields.filter((field) => field.accessor === "get").map((field) => field.returnType)).toEqual([
      expectedType,
      expectedType,
      expectedType,
    ]);
    expect(fields.filter((field) => field.accessor === "set").map((field) => field.arguments)).toEqual([
      [{ name: "next", type: setterType }],
      [{ name: "next", type: expectedType }],
      [{ name: "next", type: expectedType }],
    ]);
    expect(fields.every((field) => field.inherited)).toBe(true);
    if (argument === "Value") {
      expect(model.dependencies).toContain(value);
      expect(fields.find((field) => field.accessor === "set" && field.name === "value")?.typeRefs).toContain(
        value
      );
    }
  }
});

it("preserves computed accessors and specializes inherited symbol accessors", () => {
  const parser = new ModelParser(`
    declare const key: unique symbol;
    const dynamicKey: string = "value";
    class Base<T> {
      get [Symbol.iterator](): T { throw 0; }
      set [Symbol.iterator](next: T) {}
      get [key](): T { throw 0; }
      set [key](next: T) {}
      get [dynamicKey](): T { throw 0; }
      set [dynamicKey](next: T) {}
    }
    class Child extends Base<string> {}
  `);
  const models = parser.getModels();
  for (const modelName of ["Base", "Child"]) {
    const model = models.find((candidate) => candidate.name === modelName);
    if (!model) throw new Error(`Expected ${modelName}`);
    const type = modelName === "Base" ? "T" : "string";
    const names = ["[Symbol.iterator]", "[key]"];
    if (modelName === "Base") names.push("[dynamicKey]");
    const fields = model.schema.filter(isFunctionSchemaField);
    expect(fields).toHaveLength(names.length * 2);
    for (const name of names) {
      expect(fields.filter((field) => field.name === name)).toEqual([
        expect.objectContaining({ accessor: "get", returnType: type }),
        expect.objectContaining({ accessor: "set", arguments: [{ name: "next", type }] }),
      ]);
    }
  }
});

it.each([
  ["get value(): string;", "", ["get"]],
  ["set value(next: string);", "", ["set"]],
  ["get value(): string; set value(next: string);", "", ["get", "set"]],
  ["get value(): string;", "set value(next: string);", ["get", "set"]],
  ["set value(next: string);", "get value(): string;", ["set", "get"]],
])("emits merged interface accessors once: %s %s", (accessors, laterAccessors, expectedKinds) => {
  const parser = new ModelParser(`
    interface Combined { ${accessors} }
    interface Combined { get later(): number; set later(next: number); ${laterAccessors} }
    class Base { get inherited(): boolean { return true; } }
    class Combined extends Base {}
  `);
  const combined = parser.getModels().find((model) => model.name === "Combined");
  if (!combined) throw new Error("Expected Combined");
  const fields = combined.schema.filter(isFunctionSchemaField);
  expect(fields.filter((field) => field.name === "value").map((field) => field.accessor)).toEqual(
    expectedKinds
  );
  expect(fields.filter((field) => field.name === "inherited")).toEqual([
    expect.objectContaining({ accessor: "get", returnType: "boolean", inherited: true }),
  ]);
  expect(fields.filter((field) => field.name === "later")).toEqual([
    expect.objectContaining({ accessor: "get", returnType: "number" }),
    expect.objectContaining({ accessor: "set", arguments: [{ name: "next", type: "number" }] }),
  ]);
});

it.each(["class", "interface"])("places inherited members first within each %s member group", (kind) => {
  const models = new ModelParser(`
    ${kind} Base {
      baseField: string;
      baseMethod(): void;
      callback: () => void;
      overridden: string;
    }
    ${kind} Child extends Base {
      ownMethod(): void;
      ownField: number;
      overridden: string;
      ownCallback: () => void;
    }
  `).getModels();
  const child = models.find((model) => model.name === "Child");
  if (!child) throw new Error("Expected Child");
  expect(child.schema.map(({ name, inherited }) => ({ name, inherited }))).toEqual([
    { name: "baseField", inherited: true },
    { name: "callback", inherited: true },
    { name: "ownField", inherited: undefined },
    { name: "overridden", inherited: undefined },
    { name: "ownCallback", inherited: undefined },
    { name: "baseMethod", inherited: true },
    { name: "ownMethod", inherited: undefined },
  ]);
});

it("preserves own accessor order and static accessors after inherited accessors", () => {
  const models = new ModelParser(`
    class Base { get inherited(): boolean { return true; } }
    class Child extends Base {
      set first(value: string) {}
      get first(): string { return ""; }
      static get first(): number { return 0; }
      static set first(value: number) {}
      run(): void {}
      static count: number;
      static build(): void {}
      get second(): string { return ""; }
      label: string;
    }
  `).getModels();
  const child = models.find((model) => model.name === "Child");
  if (!child) throw new Error("Expected Child");

  expect(child.schema.map((field) => field.name)).toEqual([
    "label",
    "count",
    "run",
    "build",
    "inherited",
    "first",
    "first",
    "second",
    "first",
    "first",
  ]);
  expect(child.schema.filter(isFunctionSchemaField).filter((field) => field.name === "first")).toEqual([
    {
      name: "first",
      type: "function",
      accessor: "get",
      arguments: [],
      returnType: "string",
      optional: false,
    },
    {
      name: "first",
      type: "function",
      accessor: "get",
      arguments: [],
      returnType: "number",
      optional: false,
      modifiers: ["static"],
    },
    {
      name: "first",
      type: "function",
      accessor: "set",
      arguments: [{ name: "value", type: "string" }],
      returnType: "void",
      optional: false,
    },
    {
      name: "first",
      type: "function",
      accessor: "set",
      arguments: [{ name: "value", type: "number" }],
      returnType: "void",
      optional: false,
      modifiers: ["static"],
    },
  ]);
});

it("uses overridden accessors once and inherits getter-only and setter-only scalar rows", () => {
  const models = new ModelParser(`
    class Base {
      get value(): string | number { return ""; }
      set value(next: string | number) {}
      get ready(): boolean { return true; }
      set label(next: string) {}
    }
    class Child extends Base {
      get value(): number { return 0; }
      set value(next: number) {}
    }
    class Grandchild extends Child {}
  `).getModels();

  for (const name of ["Child", "Grandchild"]) {
    const model = models.find((item) => item.name === name);
    if (!model) throw new Error(`Expected ${name}`);
    const inheritance = name === "Grandchild" ? { inherited: true } : {};
    expect(model.schema.map((field) => field.name)).toEqual(
      name === "Child" ? ["ready", "value", "label", "value"] : ["value", "ready", "value", "label"]
    );
    expect(model.schema).toEqual(
      expect.arrayContaining([
        {
          name: "value",
          type: "function",
          accessor: "get",
          arguments: [],
          returnType: "number",
          optional: false,
          ...inheritance,
        },
        {
          name: "ready",
          type: "function",
          accessor: "get",
          arguments: [],
          returnType: "boolean",
          optional: false,
          inherited: true,
        },
        {
          name: "value",
          type: "function",
          accessor: "set",
          arguments: [{ name: "next", type: "number" }],
          returnType: "void",
          optional: false,
          ...inheritance,
        },
        {
          name: "label",
          type: "function",
          accessor: "set",
          arguments: [{ name: "next", type: "string" }],
          returnType: "void",
          optional: false,
          inherited: true,
        },
      ])
    );
    expect(model.dependencies.map((dependency) => dependency.name)).toEqual([
      name === "Child" ? "Base" : "Child",
    ]);
  }
});

it("preserves alias references for nested promise and tuple return types", () => {
  const parser = new ModelParser(`
    type Variant = { kind: "x" } | { kind: "y" };
    type VariantKind = Variant["kind"];

    class Handler {
      doAsync(): Promise<VariantKind> {
        return Promise.resolve("x");
      }

      doTuple(): [VariantKind, number] {
        return ["x", 1];
      }
    }
  `);

  const models = parser.getModels();
  const handlerModel = models.find((m) => m.name === "Handler");
  const variantKindModel = models.find((m) => m.name === "VariantKind");

  expect(handlerModel?.dependencies).toEqual([expect.objectContaining({ name: "VariantKind" })]);

  const asyncField = handlerModel?.schema.find((field) => field.name === "doAsync");
  if (!asyncField || !isFunctionSchemaField(asyncField)) {
    throw new Error("Expected doAsync to be parsed as a function field");
  }
  expect(asyncField.returnType).toBe("Promise<VariantKind>");

  const tupleField = handlerModel?.schema.find((field) => field.name === "doTuple");
  if (!tupleField || !isFunctionSchemaField(tupleField)) {
    throw new Error("Expected doTuple to be parsed as a function field");
  }
  expect(tupleField.returnType).toBe("[VariantKind, number]");

  expect(variantKindModel?.dependants).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Handler" })])
  );
});

it("prefers declared overload signatures for alias return types", () => {
  const parser = new ModelParser(`
    type Option = "enabled" | "disabled";

    class Overloaded {
      compute(value: number): Option;
      compute(): Option;
      compute(value?: number) {
        return "enabled";
      }
    }
  `);

  const models = parser.getModels();
  const overloadedModel = models.find((m) => m.name === "Overloaded");

  const optionModel = models.find((m) => m.name === "Option");
  expect(optionModel).toBeDefined();

  const computeField = overloadedModel?.schema.find((field) => field.name === "compute");
  if (!computeField || !isFunctionSchemaField(computeField)) {
    throw new Error("Expected compute to be parsed as a function field");
  }

  expect(computeField.returnType).toEqual(expect.objectContaining({ name: "Option" }));
  expect(overloadedModel?.dependencies).toEqual([expect.objectContaining({ name: "Option" })]);
});

it("renders tuple aliases as their type text instead of Array members", () => {
  const parser = new ModelParser(`
    interface User { id: string }
    type Pair = [User, number];
  `);

  const models = parser.getModels();
  const pair = models.find((m) => m.name === "Pair");

  expect(pair?.schema).toEqual([{ name: "==>", type: "[User, number]", optional: false }]);
  expect(pair?.dependencies).toEqual([expect.objectContaining({ name: "User" })]);
});

it("renders built-in object aliases as declared text without library members or self-dependencies", () => {
  const types = [
    "string[]",
    "Array<string>",
    "readonly string[]",
    "ReadonlyArray<string>",
    "Map<string, number>",
    "Set<string>",
    "Promise<string>",
    "Date",
    "RegExp",
    "Uint8Array",
  ];
  const models = new ModelParser(
    types.map((type, index) => `type BuiltIn${index} = ${type};`).join("\n")
  ).getModels();

  expect(models).toHaveLength(types.length);
  for (const [index, model] of models.entries()) {
    expect(model.schema).toHaveLength(1);
    expect(model.schema).toEqual([{ name: "==>", type: types[index], optional: false }]);
    expect(model.dependencies).toEqual([]);
  }
});

it("preserves declared dependencies inside built-in object aliases", () => {
  const types = ["User[]", "readonly User[]", "Map<string, Promise<User>>", "Set<User>", "Promise<User>"];
  const models = new ModelParser(`
    interface User { id: string }
    ${types.map((type, index) => `type Users${index} = ${type};`).join("\n")}
    type List<T> = ReadonlyArray<T>;
  `).getModels();
  const user = models.find((model) => model.name === "User");
  if (!user) throw new Error("missing User model");

  for (const [index, type] of types.entries()) {
    const alias = models.find((model) => model.name === `Users${index}`);
    if (!alias) throw new Error("missing alias model");
    expect(alias.schema).toHaveLength(1);
    expect(alias.schema).toEqual([{ name: "==>", type, optional: false }]);
    expect(alias.dependencies).toEqual([user]);
    expect(user.dependants).toContain(alias);
  }
  const list = models.find((model) => model.name === "List");
  if (!list) throw new Error("missing List model");
  expect(list.schema).toEqual([{ name: "==>", type: "ReadonlyArray<T>", optional: false }]);
  expect(list.dependencies).toEqual([]);
});

it("renders template literal aliases as their type text instead of String members", () => {
  const parser = new ModelParser("type EventName = `on${string}`;");

  const models = parser.getModels();

  expect(models[0]?.schema).toEqual([{ name: "==>", type: "`on${string}`", optional: false }]);
});

it("renders generic conditional aliases as their declared expression", () => {
  const parser = new ModelParser(`
    interface Success { ok: true }
    type Result<T> = T extends Error ? never : Success;
  `);

  const models = parser.getModels();
  const result = models.find((m) => m.name === "Result");

  expect(result?.schema).toEqual([
    { name: "==>", type: "T extends Error ? never : Success", optional: false },
  ]);
  expect(result?.dependencies).toEqual([expect.objectContaining({ name: "Success" })]);
});

it("renders interface index signatures", () => {
  const parser = new ModelParser(`
    interface User { id: string }
    interface Registry {
      count: number;
      [name: string]: number | User;
    }
  `);

  const models = parser.getModels();
  const registry = models.find((m) => m.name === "Registry");

  expect(registry?.schema).toContainEqual(
    expect.objectContaining({
      name: "[name: string]",
      type: "number | User",
      optional: false,
      typeRefs: [expect.objectContaining({ name: "User" })],
    })
  );
  expect(registry?.schema).toContainEqual({ name: "count", type: "number", optional: false });
});

it("renders index-signature-only aliases like Record instead of an empty node", () => {
  const parser = new ModelParser(`
    interface User { id: string }
    type Id = string;
    type UserMap = Record<string, User>;
    type Scores = { [id: number]: number };
    type Nested = { [name: string]: { id: Id } };
    type Promises = Record<string, Promise<Id>>;
  `);

  const models = parser.getModels();
  const userMap = models.find((m) => m.name === "UserMap");
  const scores = models.find((m) => m.name === "Scores");
  const nested = models.find((m) => m.name === "Nested");
  const promises = models.find((m) => m.name === "Promises");

  expect(userMap?.schema).toEqual([
    { name: "[key: string]", type: expect.objectContaining({ name: "User" }), optional: false },
  ]);
  expect(userMap?.dependencies).toEqual([expect.objectContaining({ name: "User" })]);
  expect(scores?.schema).toEqual([{ name: "[key: number]", type: "number", optional: false }]);
  expect(nested?.schema).toEqual([
    {
      name: "[key: string]",
      type: "{ id: Id }",
      optional: false,
      typeRefs: [expect.objectContaining({ name: "Id" })],
    },
  ]);
  expect(promises?.schema).toEqual([
    {
      name: "[key: string]",
      type: "Promise<Id>",
      optional: false,
      typeRefs: [expect.objectContaining({ name: "Id" })],
    },
  ]);
});

it("preserves property rows and optionality for mapped utility aliases", () => {
  const parser = new ModelParser(`
    interface User { id: string; age: number }
    type PartialUser = Partial<User>;
    type UserFlags = { [K in keyof User]?: boolean };
    type PickedUser = Pick<User, "id">;
    type OmittedUser = Omit<User, "age">;
    type ReadonlyUser = Readonly<User>;
  `);

  const models = parser.getModels();
  const partialUser = models.find((m) => m.name === "PartialUser");
  const userFlags = models.find((m) => m.name === "UserFlags");

  expect(partialUser?.schema).toEqual([
    { name: "id", type: "string", optional: true },
    { name: "age", type: "number", optional: true },
  ]);
  expect(userFlags?.schema).toEqual([
    { name: "id", type: "boolean", optional: true },
    { name: "age", type: "boolean", optional: true },
  ]);
  for (const name of ["PickedUser", "OmittedUser"]) {
    const model = models.find((candidate) => candidate.name === name);
    if (!model) throw new Error("missing utility alias model");
    expect(model.schema).toEqual([{ name: "id", type: "string", optional: false }]);
  }
  const readonlyUser = models.find((model) => model.name === "ReadonlyUser");
  if (!readonlyUser) throw new Error("missing ReadonlyUser model");
  expect(readonlyUser.schema).toEqual([
    { name: "id", type: "string", optional: false, modifiers: ["readonly"] },
    { name: "age", type: "number", optional: false, modifiers: ["readonly"] },
  ]);
});

it("parses enums with members and links referencing fields", () => {
  const parser = new ModelParser(`
    enum Color { Red, Green, Blue }
    enum Status { Active = "active", Done = "done" }
    interface Shape {
      color: Color;
      status: Status;
    }
  `);

  const models = parser.getModels();
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

it("includes static members and surfaces member modifiers", () => {
  const parser = new ModelParser(`
    abstract class Base {
      static count: number;
      private secret: string;
      protected id: number;
      readonly tag: string;
      abstract run(): void;
      private static cache: string;
      protected static ids: string[];
      private static readonly registry: Map<string, number>;
      protected static create(): string { return ""; }
      public static publicCount: number;
      protected readonly name: string;
      abstract readonly label: string;
      plain: string;
    }
    interface Frozen { readonly key: string }
  `);

  const models = parser.getModels();
  const base = models.find((m) => m.name === "Base");
  const frozen = models.find((m) => m.name === "Frozen");

  expect(base?.type).toBe("class");
  expect(base?.type === "class" ? base.isAbstract : undefined).toBe(true);
  expect(base?.schema).toContainEqual({
    name: "count",
    type: "number",
    optional: false,
    modifiers: ["static"],
  });
  expect(base?.schema).toContainEqual({
    name: "secret",
    type: "string",
    optional: false,
    modifiers: ["private"],
  });
  expect(base?.schema).toContainEqual({
    name: "id",
    type: "number",
    optional: false,
    modifiers: ["protected"],
  });
  expect(base?.schema).toContainEqual({
    name: "tag",
    type: "string",
    optional: false,
    modifiers: ["readonly"],
  });
  expect(base?.schema).toContainEqual(
    expect.objectContaining({ name: "run", type: "function", modifiers: ["abstract"] })
  );
  expect(frozen?.schema).toContainEqual({
    name: "key",
    type: "string",
    optional: false,
    modifiers: ["readonly"],
  });
  for (const { name, modifiers } of [
    { name: "cache", modifiers: ["private", "static"] },
    { name: "ids", modifiers: ["protected", "static"] },
    { name: "registry", modifiers: ["private", "static", "readonly"] },
    { name: "create", modifiers: ["protected", "static"] },
    { name: "publicCount", modifiers: ["static"] },
    { name: "name", modifiers: ["protected", "readonly"] },
    { name: "label", modifiers: ["readonly", "abstract"] },
  ]) {
    expect(base?.schema).toContainEqual(expect.objectContaining({ name, modifiers }));
  }
  expect(base?.schema).toContainEqual({ name: "plain", type: "string", optional: false });
});

it("renders interface call and construct signatures", () => {
  const parser = new ModelParser(`
    interface Widget { id: string }
    interface Factory {
      (x: number): string;
      new (x: number): Widget;
    }
  `);

  const models = parser.getModels();
  const factory = models.find((m) => m.name === "Factory");

  expect(factory?.schema).toEqual([
    {
      name: "",
      type: "function",
      arguments: [{ name: "x", type: "number" }],
      returnType: "string",
      optional: false,
    },
    {
      name: "new",
      type: "function",
      arguments: [{ name: "x", type: "number" }],
      returnType: expect.objectContaining({ name: "Widget" }),
      optional: false,
    },
  ]);
  expect(factory?.dependencies).toEqual([expect.objectContaining({ name: "Widget" })]);
});

it("renders function and constructor aliases with the same relationships as interfaces", () => {
  const models = new ModelParser(`
    interface Item { id: string }
    type Handler = (item: Item) => Item;
    interface HandlerI { (item: Item): Item }
    type Ctor = new (item: Item) => Item;
    interface CtorI { new (item: Item): Item }
  `).getModels();
  const item = models.find((model) => model.name === "Item");
  if (!item) throw new Error("missing Item model");

  for (const [name, interfaceName, fieldName] of [
    ["Handler", "HandlerI", ""],
    ["Ctor", "CtorI", "new"],
  ]) {
    const alias = models.find((model) => model.name === name);
    const equivalent = models.find((model) => model.name === interfaceName);
    if (!alias || !equivalent) throw new Error("missing signature model");
    expect(alias.schema).toEqual([
      {
        name: fieldName,
        type: "function",
        arguments: [{ name: "item", type: item }],
        returnType: item,
        optional: false,
      },
    ]);
    expect(alias.schema).toEqual(equivalent.schema);
    expect(alias.dependencies).toEqual([item]);
    expect(item.dependants).toContain(alias);
  }
});

it("renders every alias call and construct overload alongside properties and index signatures", () => {
  const models = new ModelParser(`
    type Factory = {
      (text: string): number;
      (value: number): string;
      new (text: string): object;
      new (value: number): object;
      label: string;
      [key: string]: unknown;
    };
  `).getModels();
  expect(models[0].schema).toEqual([
    {
      name: "",
      type: "function",
      arguments: [{ name: "text", type: "string" }],
      returnType: "number",
      optional: false,
    },
    {
      name: "",
      type: "function",
      arguments: [{ name: "value", type: "number" }],
      returnType: "string",
      optional: false,
    },
    {
      name: "new",
      type: "function",
      arguments: [{ name: "text", type: "string" }],
      returnType: "object",
      optional: false,
    },
    {
      name: "new",
      type: "function",
      arguments: [{ name: "value", type: "number" }],
      returnType: "object",
      optional: false,
    },
    { name: "label", type: "string", optional: false },
    { name: "[key: string]", type: "unknown", optional: false },
  ]);
  expect(models[0].dependencies).toEqual([]);
});

it("resolves specialized function and constructor alias signatures", () => {
  const models = new ModelParser(`
    interface Item { id: string }
    type Callback<T> = (value: T) => T;
    type Constructor<T> = new (value: T) => T;
    type Handler = Callback<Item>;
    type Ctor = Constructor<Item>;
  `).getModels();
  const item = models.find((model) => model.name === "Item");
  if (!item) throw new Error("missing Item model");

  for (const [name, fieldName] of [
    ["Handler", ""],
    ["Ctor", "new"],
  ]) {
    const alias = models.find((model) => model.name === name);
    if (!alias) throw new Error("missing alias model");
    expect(alias.schema).toEqual([
      {
        name: fieldName,
        type: "function",
        arguments: [{ name: "value", type: item }],
        returnType: item,
        optional: false,
      },
    ]);
    expect(alias.dependencies).toEqual([item]);
    expect(item.dependants).toContain(alias);
  }
});

it("renders every overload signature instead of collapsing them", () => {
  const parser = new ModelParser(`
    interface Converter {
      convert(s: string): number;
      convert(n: number): string;
    }
  `);

  const models = parser.getModels();
  const converter = models.find((m) => m.name === "Converter");

  expect(converter?.schema).toEqual([
    {
      name: "convert",
      type: "function",
      arguments: [{ name: "s", type: "string" }],
      returnType: "number",
      optional: false,
    },
    {
      name: "convert",
      type: "function",
      arguments: [{ name: "n", type: "number" }],
      returnType: "string",
      optional: false,
    },
  ]);
});

it("links heritage through utility types to the referenced models", () => {
  const parser = new ModelParser(`
    interface Full { a: string; b: number; c: boolean }
    interface Slim extends Pick<Full, "a" | "b"> { d: string }
    class Impl implements Omit<Full, "c"> {
      a = "";
      b = 0;
    }
  `);

  const models = parser.getModels();
  const slim = models.find((m) => m.name === "Slim");
  const impl = models.find((m) => m.name === "Impl");

  expect(slim?.type === "interface" ? slim.headerRefs : undefined).toEqual([
    expect.objectContaining({ name: "Full" }),
  ]);
  expect(slim?.dependencies).toEqual([expect.objectContaining({ name: "Full" })]);
  expect(impl?.type === "class" ? impl.headerRefs : undefined).toEqual([
    expect.objectContaining({ name: "Full" }),
  ]);
});

it("substitutes generic type arguments for inherited and aliased members", () => {
  const parser = new ModelParser(`
    interface User { id: string }
    interface Collection<T> { items: T[]; first(): T }
    interface Users extends Collection<User> {}
    interface Box<T> { value: T }
    type UserBox = Box<User>;
  `);

  const models = parser.getModels();
  const users = models.find((m) => m.name === "Users");
  const userBox = models.find((m) => m.name === "UserBox");

  expect(users?.schema).toContainEqual({
    name: "items",
    type: "array",
    elementType: expect.objectContaining({ name: "User" }),
    optional: false,
    inherited: true,
  });
  expect(users?.schema).toContainEqual(
    expect.objectContaining({
      name: "first",
      type: "function",
      returnType: expect.objectContaining({ name: "User" }),
    })
  );
  expect(userBox?.schema).toEqual([
    { name: "value", type: expect.objectContaining({ name: "User" }), optional: false },
  ]);
  expect(userBox?.dependencies).toEqual([expect.objectContaining({ name: "User" })]);
});

it("links the base model when heritage uses a generic instantiation", () => {
  const parser = new ModelParser(`
    interface User { id: string }
    interface Collection<T> { items: T[] }
    interface Users extends Collection<User> {}
    class Base<T> { value!: T }
    class Child extends Base<string> {}
  `);

  const models = parser.getModels();
  const users = models.find((m) => m.name === "Users");
  const child = models.find((m) => m.name === "Child");

  expect(users?.type === "interface" ? users.headerRefs : undefined).toEqual([
    expect.objectContaining({ name: "Collection" }),
    expect.objectContaining({ name: "User" }),
  ]);
  expect(child?.type === "class" ? child.headerRefs : undefined).toEqual([
    expect.objectContaining({ name: "Base" }),
  ]);
});

it("keeps optional methods as optional function fields", () => {
  const parser = new ModelParser(`
    interface Hooks {
      onInit?(): void;
      onDone?: () => void;
    }
  `);

  const models = parser.getModels();

  expect(models[0]?.schema).toEqual([
    { name: "onDone", type: "function", arguments: [], returnType: "void", optional: true },
    { name: "onInit", type: "function", arguments: [], returnType: "void", optional: true },
  ]);
});

it("links models referenced inside text-rendered field types", () => {
  const parser = new ModelParser(`
    enum Status { Active = "active", Done = "done" }
    interface A { a: string }
    interface B { b: string }
    interface User { id: string }
    interface Holder {
      status: Status.Active;
      items: (A | B)[];
      fetch(): Promise<User>;
    }
  `);

  const models = parser.getModels();
  const holder = models.find((m) => m.name === "Holder");

  expect(holder?.schema).toContainEqual({
    name: "status",
    type: "Status.Active",
    optional: false,
    typeRefs: [expect.objectContaining({ name: "Status", type: "enum" })],
  });
  expect(holder?.schema).toContainEqual({
    name: "items",
    type: "array",
    elementType: "A | B",
    optional: false,
    typeRefs: [expect.objectContaining({ name: "A" }), expect.objectContaining({ name: "B" })],
  });
  expect(holder?.schema).toContainEqual(
    expect.objectContaining({
      name: "fetch",
      type: "function",
      returnType: "Promise<User>",
      typeRefs: [expect.objectContaining({ name: "User" })],
    })
  );
  expect(holder?.dependencies).toEqual([
    expect.objectContaining({ name: "Status" }),
    expect.objectContaining({ name: "A" }),
    expect.objectContaining({ name: "B" }),
    expect.objectContaining({ name: "User" }),
  ]);
});

it("links intersection constituents, typeof queries, and constraint models", () => {
  const parser = new ModelParser(`
    enum Color { Red, Green }
    interface User { id: string; name: string }
    interface Meta { tag: string }
    type Enriched = User & Partial<Meta>;
    type ColorTable = typeof Color;
    type ColorKey = keyof typeof Color;
    interface Repo<T extends User> { first: T }
  `);

  const models = parser.getModels();
  const enriched = models.find((m) => m.name === "Enriched");
  const colorTable = models.find((m) => m.name === "ColorTable");
  const colorKey = models.find((m) => m.name === "ColorKey");
  const repo = models.find((m) => m.name === "Repo");

  expect(enriched?.dependencies).toEqual([
    expect.objectContaining({ name: "User" }),
    expect.objectContaining({ name: "Meta" }),
  ]);
  expect(colorTable?.dependencies).toEqual([expect.objectContaining({ name: "Color" })]);
  expect(colorKey?.dependencies).toEqual([expect.objectContaining({ name: "Color" })]);
  expect(repo?.type === "interface" ? repo.headerRefs : undefined).toEqual([
    expect.objectContaining({ name: "User" }),
  ]);
});

it("captures type-parameter defaults for the node header", () => {
  const parser = new ModelParser(`
    interface Pool<T = string, N extends number = 10> { items: T[]; size: N; }
  `);

  const models = parser.getModels();

  expect(models[0]?.arguments).toEqual([
    { name: "T", extends: undefined, default: "string" },
    { name: "N", extends: "number", default: "10" },
  ]);
});

it("marks optional generic properties and links generic heads in constraints and heritage", () => {
  const parser = new ModelParser(`
    interface User { id: string }
    interface Collection<T> { items: T[] }
    class Store {
      cache?: Map<string, string>;
    }
    interface Repo<T extends Collection<User>> { current: T }
    interface Wide extends Pick<Collection<User>, "items"> {}
  `);

  const models = parser.getModels();
  const store = models.find((m) => m.name === "Store");
  const repo = models.find((m) => m.name === "Repo");
  const wide = models.find((m) => m.name === "Wide");

  expect(store?.schema).toContainEqual(
    expect.objectContaining({ name: "cache", type: "generic", genericName: "Map", optional: true })
  );
  expect(repo?.type === "interface" ? repo.headerRefs : undefined).toEqual([
    expect.objectContaining({ name: "Collection" }),
    expect.objectContaining({ name: "User" }),
  ]);
  expect(wide?.type === "interface" ? wide.headerRefs : undefined).toEqual([
    expect.objectContaining({ name: "Collection" }),
    expect.objectContaining({ name: "User" }),
  ]);
});

it("links models referenced in union-typed properties", () => {
  const parser = new ModelParser(`
    type FixedReply = { text: string };
    type LlmReply = { prompt: string };
    interface Message {
      reply: FixedReply | LlmReply;
      kind: "a" | "b";
    }
  `);

  const models = parser.getModels();
  const message = models.find((m) => m.name === "Message");
  const fixedReply = models.find((m) => m.name === "FixedReply");

  expect(message?.schema).toContainEqual({
    name: "reply",
    type: "FixedReply | LlmReply",
    optional: false,
    typeRefs: [
      expect.objectContaining({ name: "FixedReply" }),
      expect.objectContaining({ name: "LlmReply" }),
    ],
  });
  expect(message?.schema).toContainEqual({ name: "kind", type: '"a" | "b"', optional: false });
  expect(fixedReply?.dependants).toEqual([expect.objectContaining({ name: "Message" })]);
});

it("links primitive aliases referenced inside anonymous union members", () => {
  const parser = new ModelParser(`
    type Scalar = number;
    type Example = { value: Scalar } | { empty: true };
  `);

  const models = parser.getModels();
  const example = models.find((m) => m.name === "Example");
  const scalar = models.find((m) => m.name === "Scalar");

  expect(example?.dependencies).toEqual([expect.objectContaining({ name: "Scalar" })]);
  expect(scalar?.dependants).toEqual([expect.objectContaining({ name: "Example" })]);
});

it("links nested models from fields, standalone signatures, and index signatures", () => {
  const parser = new ModelParser(`
    interface A {}
    interface B {}
    interface Holder { value: A & B }
    interface Factory { (value: Promise<A>): Promise<B> }
    interface Lookup { [key: string]: Promise<A> }
  `);

  const models = parser.getModels();
  const dependencyNames = (name: string) =>
    models.find((model) => model.name === name)?.dependencies.map((dependency) => dependency.name);
  const fieldTypeRefNames = (modelName: string, fieldName: string) =>
    models
      .find((model) => model.name === modelName)
      ?.schema.find((field) => field.name === fieldName)
      ?.typeRefs?.map((typeRef) => typeRef.name);

  expect(dependencyNames("Holder")).toEqual(["A", "B"]);
  expect(dependencyNames("Factory")).toEqual(["A", "B"]);
  expect(dependencyNames("Lookup")).toEqual(["A"]);
  expect(fieldTypeRefNames("Holder", "value")).toEqual(["A", "B"]);
  expect(fieldTypeRefNames("Factory", "")).toEqual(["A", "B"]);
  expect(fieldTypeRefNames("Lookup", "[key: string]")).toEqual(["A"]);
});

it("links nested models from every text-rendered field position", () => {
  const parser = new ModelParser(`
    type Id = string;
    interface Box<T> {}
    interface User {}
    interface Recursive { next: Promise<Array<Recursive>> }
    interface Holder {
      value: Box<Promise<User>>;
      run(value: Promise<User>): void;
      get current(): Promise<User>;
      set current(value: Promise<User>);
      nested: { id: Id };
      entries: { id: Id }[];
    }
  `);

  const models = parser.getModels();
  const model = (name: string) => models.find((candidate) => candidate.name === name);
  const fieldTypeRefs = (modelName: string, fieldName: string) =>
    model(modelName)
      ?.schema.filter((field) => field.name === fieldName)
      .map((field) => field.typeRefs?.map((typeRef) => typeRef.name));

  expect(fieldTypeRefs("Recursive", "next")).toEqual([["Recursive"]]);
  expect(model("Recursive")?.dependencies).toEqual([expect.objectContaining({ name: "Recursive" })]);
  expect(fieldTypeRefs("Holder", "value")).toEqual([["Box", "User"]]);
  expect(fieldTypeRefs("Holder", "run")).toEqual([["User"]]);
  expect(fieldTypeRefs("Holder", "current")).toEqual([["User"], ["User"]]);
  expect(fieldTypeRefs("Holder", "nested")).toEqual([["Id"]]);
  expect(fieldTypeRefs("Holder", "entries")).toEqual([["Id"]]);
});

it("preserves qualified text in standalone signatures and index signatures", () => {
  const parser = new ModelParser(`
    enum Color { Red }
    interface Box<T> {}
    interface Uses {
      (value: Color.Red): Box<Color.Red>;
      [key: string]: Color.Red;
    }
  `);

  const uses = parser.getModels().find((model) => model.name === "Uses");
  const signature = uses?.schema.find((field) => field.name === "");
  const indexSignature = uses?.schema.find((field) => field.name === "[key: string]");

  expect(signature).toEqual(
    expect.objectContaining({
      arguments: [{ name: "value", type: "Color.Red" }],
      returnType: "Box<Color.Red>",
      typeRefs: expect.arrayContaining([
        expect.objectContaining({ name: "Color" }),
        expect.objectContaining({ name: "Box" }),
      ]),
    })
  );
  expect(indexSignature).toEqual({
    name: "[key: string]",
    type: "Color.Red",
    optional: false,
    typeRefs: [expect.objectContaining({ name: "Color" })],
  });
});

it("does not flatten direct model references into transitive field references", () => {
  const parser = new ModelParser(`
    interface User {}
    interface Admin {}
    type Choice = User | Admin;
    interface Holder { choose(value: Choice): Choice }
  `);

  const models = parser.getModels();
  const holder = models.find((model) => model.name === "Holder");
  const choice = models.find((model) => model.name === "Choice");

  expect(holder?.schema).toEqual([
    {
      name: "choose",
      type: "function",
      arguments: [{ name: "value", type: choice }],
      returnType: choice,
      optional: false,
    },
  ]);
  expect(holder?.dependencies).toEqual([choice]);
});

it("links models from every early type-alias branch and preserves declared text", () => {
  const parser = new ModelParser(`
    enum Color { Red }
    interface User {}
    interface Box<T> { value: T }
    type ColorAlias = Color;
    type Red = Color.Red;
    type Tuple = [Promise<User>];
    type Conditional<T> = T extends Box<User> ? User : never;
  `);

  const models = parser.getModels();
  const model = (name: string) => models.find((candidate) => candidate.name === name);
  const dependencyNames = (name: string) => model(name)?.dependencies.map((dependency) => dependency.name);

  expect(model("ColorAlias")?.schema).toEqual([{ name: "==>", type: "Color", optional: false }]);
  expect(model("Red")?.schema).toEqual([{ name: "==>", type: "Color.Red", optional: false }]);
  expect(dependencyNames("ColorAlias")).toEqual(["Color"]);
  expect(dependencyNames("Red")).toEqual(["Color"]);
  expect(dependencyNames("Tuple")).toEqual(["User"]);
  expect(dependencyNames("Conditional")).toEqual(["Box", "User"]);
});

it("merges index signatures independently of declaration order", () => {
  const parser = new ModelParser(`
    interface Value {}
    interface First { fixed: string }
    interface First { [key: string]: Value | string }
    interface Last { [key: string]: Value | string }
    interface Last { fixed: string }
  `);

  const models = parser.getModels();
  const first = models.find((model) => model.name === "First");
  const last = models.find((model) => model.name === "Last");

  expect(first?.schema).toContainEqual(
    expect.objectContaining({ name: "[key: string]", type: "Value | string" })
  );
  expect(last?.schema).toContainEqual(
    expect.objectContaining({ name: "[key: string]", type: "Value | string" })
  );
  expect(first?.dependencies).toEqual([expect.objectContaining({ name: "Value" })]);
  expect(last?.dependencies).toEqual([expect.objectContaining({ name: "Value" })]);
});

it("does not display checker-added undefined for optional generic fields", () => {
  const parser = new ModelParser(`
    interface User {}
    interface Box<T> { value?: T | null }
    type UserBox = Box<User>;
  `);

  const userBox = parser.getModels().find((model) => model.name === "UserBox");
  expect(userBox?.schema).toContainEqual({
    name: "value",
    type: "User | null",
    optional: true,
    typeRefs: [expect.objectContaining({ name: "User" })],
  });
});

it("renders a branded primitive as its declared type, not as the members of String", () => {
  const parser = new ModelParser(`
    declare const brand: unique symbol;
    type Brand<T, Name extends string> = T & { readonly [brand]: Name };
    type EmployeeId = Brand<string, "EmployeeId">;
    type Count = number & { readonly __unit: "count" };
    interface Employee { id: EmployeeId; head: Count }
  `);

  const models = parser.getModels();
  const employeeId = models.find((m) => m.name === "EmployeeId");
  const count = models.find((m) => m.name === "Count");
  const employee = models.find((m) => m.name === "Employee");

  expect(employeeId?.schema).toEqual([{ name: "==>", type: 'Brand<string, "EmployeeId">', optional: false }]);
  expect(count?.schema).toEqual([
    { name: "==>", type: 'number & { readonly __unit: "count" }', optional: false },
  ]);
  expect(employeeId?.schema.some((field) => field.name === "charAt")).toBe(false);
  expect(employee?.schema.map((field) => field.name)).toEqual(["id", "head"]);
  expect(employee?.dependencies.map((m) => m.name).sort()).toEqual(["Count", "EmployeeId"]);
});

it.each([`number & { readonly __brand: 'import("/source").Id' }`, `['import("/source").Id']`])(
  "preserves import-like literal text in %s",
  (declaredType) => {
    const [model] = new ModelParser(`type Id = ${declaredType};`).getModels();
    expect(model.schema).toEqual([{ name: "==>", type: declaredType, optional: false }]);
  }
);

it("models a top-level function with its parameters and return type", () => {
  const parser = new ModelParser(`
    interface Order { id: string }
    interface Receipt { total: number }
    type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
    type Failure = { kind: "declined" };
    export declare function charge(order: Order, amount: number): Result<Receipt, Failure>;
  `);

  const models = parser.getModels();
  const charge = models.find((m) => m.name === "charge");
  const order = models.find((m) => m.name === "Order");
  const receipt = models.find((m) => m.name === "Receipt");

  expect(charge?.type).toBe("function");
  expect(charge?.schema).toHaveLength(1);
  const [row] = charge!.schema;
  expect(row.name).toBe("");
  expect(isFunctionSchemaField(row)).toBe(true);
  if (!isFunctionSchemaField(row)) return;
  expect(row.arguments.map((argument) => argument.name)).toEqual(["order", "amount"]);
  expect(row.arguments[0].type).toBe(order);
  expect(row.arguments[1].type).toBe("number");
  expect(row.returnType).toBe("Result<Receipt, Failure>");
  expect(charge?.dependencies.map((m) => m.name).sort()).toEqual(["Failure", "Order", "Receipt", "Result"]);
  expect(order?.dependants.map((m) => m.name)).toContain("charge");
  expect(receipt?.dependants.map((m) => m.name)).toContain("charge");
});

it("shows each overload of a function as 1 row and skips the implementation", () => {
  const parser = new ModelParser(`
    interface User { id: string }
    function find(id: string): User;
    function find(ids: string[]): User[];
    function find(idOrIds: string | string[]): User | User[] { return [] as never; }
  `);

  const find = parser.getModels().find((m) => m.name === "find");
  expect(find?.type).toBe("function");
  expect(find?.schema).toHaveLength(2);
  expect(find?.schema.every((row) => isFunctionSchemaField(row) && row.name === "")).toBe(true);
});

it("qualifies a function inside a namespace and keeps its type parameters", () => {
  const parser = new ModelParser(`
    interface Box<T> { value: T }
    namespace Util {
      export declare function wrap<T extends object>(value: T): Box<T>;
    }
  `);

  const wrap = parser.getModels().find((m) => m.name === "Util.wrap");
  expect(wrap?.type).toBe("function");
  expect(wrap?.arguments).toEqual([{ name: "T", extends: "object" }]);
  expect(wrap?.dependencies.map((m) => m.name)).toEqual(["Box"]);
});
