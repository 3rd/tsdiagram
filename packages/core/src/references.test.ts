import { expect, it, assert } from "vitest";
import { parseModels } from "./index";

it("resolves references from the nearest nested namespace", () => {
  const models = parseModels(`
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
  `);
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

  assert.exists(target);
  assert.exists(child);
  assert(child.type === "interface");
  assert.exists(picked);
  assert(picked.type === "interface");
  assert.exists(parent);
  assert.exists(contract);
  assert.exists(worker);
  assert(worker.type === "class");
  assert.exists(constrained);
  assert.exists(targetId);
  assert.exists(state);
  assert.exists(stateKeys);

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
  const models = parseModels(`
    interface User {}
    namespace A { export interface User {} }
    namespace N {
      export namespace M {
        export import User = A.User;
        export interface X { value: User; }
      }
    }
  `);
  const aliasedUser = models.find((model) => model.name === "A.User");
  const x = models.find((model) => model.name === "N.M.X");

  assert.exists(aliasedUser);
  assert.exists(x);
  assert(x.type === "interface");

  expect(x.schema).toEqual([{ name: "value", type: aliasedUser, optional: false }]);
  expect(x.dependencies).toEqual([aliasedUser]);
});

it("resolves nested namespace import aliases by declaration identity in a module file", () => {
  const models = parseModels(`
    export interface User {}
    export namespace A { export interface User {} }
    export namespace N {
      export namespace M {
        export import User = A.User;
        export interface X { value: User; }
      }
    }
  `);
  const aliasedUser = models.find((model) => model.name === "A.User");
  const x = models.find((model) => model.name === "N.M.X");

  assert.exists(aliasedUser);
  assert.exists(x);
  assert(x.type === "interface");

  expect(x.schema).toEqual([{ name: "value", type: aliasedUser, optional: false }]);
  expect(x.dependencies).toEqual([aliasedUser]);
});

it("links inherited members of a module file to the declared model over a namespace homonym", () => {
  const models = parseModels(`
    export interface Item { top: string }
    export interface Box { value: Item }
    export namespace N {
      export interface Item { inner: string }
      export interface Holder extends Box {}
    }
  `);
  const item = models.find((model) => model.name === "Item");
  const box = models.find((model) => model.name === "Box");
  const innerItem = models.find((model) => model.name === "N.Item");
  const holder = models.find((model) => model.name === "N.Holder");

  assert.exists(item);
  assert.exists(box);
  assert.exists(innerItem);
  assert.exists(holder);
  assert(holder.type === "interface");

  expect(holder.extends).toEqual([box]);
  expect(holder.schema).toEqual([{ name: "value", type: item, optional: false, inherited: true }]);
  expect(holder.dependencies).toEqual([box, item]);
  expect(innerItem.dependants).toEqual([]);
});

it("resolves heritage through namespace import aliases by declaration identity", () => {
  const models = parseModels(`
    interface User {}
    namespace A { export interface User {} }
    namespace N {
      export namespace M {
        export import User = A.User;
        export interface X extends User {}
        export class Y implements User {}
      }
    }
  `);
  const aliasedUser = models.find((model) => model.name === "A.User");
  const x = models.find((model) => model.name === "N.M.X");
  const y = models.find((model) => model.name === "N.M.Y");

  assert.exists(aliasedUser);
  assert.exists(x);
  assert(x.type === "interface");
  assert.exists(y);
  assert(y.type === "class");

  expect(x.extends).toEqual([aliasedUser]);
  expect(x.dependencies).toEqual([aliasedUser]);
  expect(y.implements).toEqual([aliasedUser]);
  expect(y.dependencies).toEqual([aliasedUser]);
});

it("resolves inherited index signature values through namespace import aliases", () => {
  const models = parseModels(`
    interface User {}
    namespace A { export interface User { id: string } }
    namespace N {
      export import User = A.User;
      export interface D extends Record<string, User> {}
    }
  `);
  const aliasedUser = models.find((model) => model.name === "A.User");
  const d = models.find((model) => model.name === "N.D");

  assert.exists(aliasedUser);
  assert.exists(d);
  assert(d.type === "interface");

  expect(d.schema).toEqual([{ name: "[key: string]", type: aliasedUser, optional: false, inherited: true }]);
  expect(d.dependencies).toEqual([aliasedUser]);
});

it("links heritage to a namespace sibling declared later over an outer homonym", () => {
  const models = parseModels(`
    interface Target {}
    namespace D {
      export interface Child extends Target {}
      export class Derived extends Target {}
      export interface Target {}
    }
  `);
  const siblingTarget = models.find((model) => model.name === "D.Target");
  const child = models.find((model) => model.name === "D.Child");
  const derived = models.find((model) => model.name === "D.Derived");

  assert.exists(siblingTarget);
  assert.exists(child);
  assert(child.type === "interface");
  assert.exists(derived);
  assert(derived.type === "class");

  expect(child.extends).toEqual([siblingTarget]);
  expect(child.dependencies).toEqual([siblingTarget]);
  expect(derived.extends).toBe(siblingTarget);
  expect(derived.dependencies).toEqual([siblingTarget]);
});

it("keeps generic type parameters distinct from same-named namespace models", () => {
  const models = parseModels(`
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
  `);
  const sibling = models.find((model) => model.name === "Domain.U");
  const target = models.find((model) => model.name === "Domain.T");
  const box = models.find((model) => model.name === "Domain.Box");
  const alias = models.find((model) => model.name === "Domain.Alias");
  const callable = models.find((model) => model.name === "Domain.Callable");
  const adapter = models.find((model) => model.name === "Domain.Adapter");

  assert.exists(sibling);
  assert.exists(target);
  assert.exists(box);
  assert(box.type === "interface");
  assert.exists(alias);
  assert(alias.type === "typeAlias");
  assert.exists(callable);
  assert(callable.type === "interface");
  assert.exists(adapter);
  assert(adapter.type === "class");

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
  const models = parseModels(`
    class Domain {}
    namespace Domain {
      export interface Box<T> {
        value: T;
        primitive: string;
        list: T[];
      }
    }
  `);
  const box = models.find((model) => model.name === "Domain.Box");

  assert.exists(box);
  assert(box.type === "interface");

  expect(box.schema).toEqual([
    { name: "value", type: "T", optional: false },
    { name: "primitive", type: "string", optional: false },
    { name: "list", type: "array", elementType: "T", optional: false },
  ]);
  expect(box.dependencies).toEqual([]);
});

it("links models referenced inside text-rendered field types", () => {
  const models = parseModels(`
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
  const models = parseModels(`
    enum Color { Red, Green }
    interface User { id: string; name: string }
    interface Meta { tag: string }
    type Enriched = User & Partial<Meta>;
    type ColorTable = typeof Color;
    type ColorKey = keyof typeof Color;
    interface Repo<T extends User> { first: T }
  `);

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

it("links models referenced in union-typed properties", () => {
  const models = parseModels(`
    type FixedReply = { text: string };
    type LlmReply = { prompt: string };
    interface Message {
      reply: FixedReply | LlmReply;
      kind: "a" | "b";
    }
  `);

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
  const models = parseModels(`
    type Scalar = number;
    type Example = { value: Scalar } | { empty: true };
  `);

  const example = models.find((m) => m.name === "Example");

  expect(example?.dependencies).toEqual([expect.objectContaining({ name: "Scalar" })]);
});

it("links nested models from fields, standalone signatures, and index signatures", () => {
  const models = parseModels(`
    interface A {}
    interface B {}
    interface Holder { value: A & B }
    interface Factory { (value: Promise<A>): Promise<B> }
    interface Lookup { [key: string]: Promise<A> }
  `);

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
  const models = parseModels(`
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
  const models = parseModels(`
    enum Color { Red }
    interface Box<T> {}
    interface Uses {
      (value: Color.Red): Box<Color.Red>;
      [key: string]: Color.Red;
    }
  `);

  const uses = models.find((model) => model.name === "Uses");
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
  const models = parseModels(`
    interface User {}
    interface Admin {}
    type Choice = User | Admin;
    interface Holder { choose(value: Choice): Choice }
  `);

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
  const models = parseModels(`
    enum Color { Red }
    interface User {}
    interface Box<T> { value: T }
    type ColorAlias = Color;
    type Red = Color.Red;
    type Tuple = [Promise<User>];
    type Conditional<T> = T extends Box<User> ? User : never;
  `);

  const model = (name: string) => models.find((candidate) => candidate.name === name);
  const dependencyNames = (name: string) => model(name)?.dependencies.map((dependency) => dependency.name);

  expect(model("ColorAlias")?.schema).toEqual([{ name: "==>", type: "Color", optional: false }]);
  expect(model("Red")?.schema).toEqual([{ name: "==>", type: "Color.Red", optional: false }]);
  expect(dependencyNames("ColorAlias")).toEqual(["Color"]);
  expect(dependencyNames("Red")).toEqual(["Color"]);
  expect(dependencyNames("Tuple")).toEqual(["User"]);
  expect(dependencyNames("Conditional")).toEqual(["Box", "User"]);
});

it.each(["interface Item { id: string }", "type Item = { id: string }"])(
  "keeps type and function identity separate for %s",
  (declaration) => {
    const models = parseModels(`
    namespace Store {
      export ${declaration}
      export declare function Item(): Item;
      export type Factory = typeof Item;
      export interface Holder { item: Item }
    }
  `);
    const item = models.find((model) => model.name === "Store.Item" && model.type !== "function");
    assert.exists(item);

    const createItem = models.find((model) => model.name === "Store.Item" && model.type === "function");
    assert.exists(createItem);

    const factory = models.find((model) => model.name === "Store.Factory");
    assert.exists(factory);

    const holder = models.find((model) => model.name === "Store.Holder");
    assert.exists(holder);

    expect(item.id).toBe("Store.Item");
    expect(new Set(models.map((model) => model.id)).size).toBe(models.length);

    expect(item.schema).toEqual([{ name: "id", type: "string", optional: false }]);
    expect(createItem.schema).toEqual([
      { name: "", type: "function", arguments: [], returnType: item, optional: false },
    ]);
    expect(holder.schema).toEqual([{ name: "item", type: item, optional: false }]);

    expect(createItem.dependencies).toEqual([item]);
    expect(factory.dependencies).toContain(createItem);
  }
);

it.each(["interface make { id: string }", "type make = { id: string }"])(
  "resolves typeof past a nested type-only declaration: %s",
  (declaration) => {
    const models = parseModels(`
      declare function make(): number;
      namespace Nested {
        export ${declaration}
        export type Factory = typeof make;
      }
    `);
    const make = models.find((model) => model.name === "make" && model.type === "function");
    assert.exists(make);

    const factory = models.find((model) => model.name === "Nested.Factory");
    assert.exists(factory);

    expect(factory.dependencies).toEqual([make]);
  }
);

it("keeps a same-named type's generic scope out of function references", () => {
  const models = parseModels(`
    interface T { id: string }
    interface Factory<T> { value: T }
    declare function Factory(value: T): T;
  `);
  const type = models.find((model) => model.name === "T");
  assert.exists(type);

  const factory = models.find((model) => model.name === "Factory" && model.type === "function");
  assert.exists(factory);

  expect(factory.schema).toEqual([
    { name: "", type: "function", optional: false, arguments: [{ name: "value", type }], returnType: type },
  ]);
  expect(factory.dependencies).toEqual([type]);
});
