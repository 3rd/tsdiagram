import { assert, expect, it } from "vitest";
import { parseModels } from "./index";

it.each([
  "type Result = Base<Id>;",
  "interface Result extends Base<Id> {}",
  "declare class Result extends Base<Id> {}",
  "type Identity<T> = T; type Result = Identity<Base<Id>>;",
])("preserves named primitive arguments in members of %s", (declaration) => {
  const models = parseModels(`
    type Id = string;
    declare class Base<T> { value: T; values: T[]; promise: Promise<T> }
    ${declaration}
  `);
  const id = models.find((model) => model.name === "Id");
  const result = models.find((model) => model.name === "Result");
  assert.exists(id);
  assert.exists(result);

  expect(result.schema).toEqual([
    expect.objectContaining({ name: "value", type: id }),
    expect.objectContaining({ name: "values", type: "array", elementType: id }),
    expect.objectContaining({ name: "promise", type: "generic", genericName: "Promise", arguments: [id] }),
  ]);
  expect(result.dependencies).toContain(id);
});

it("keeps mapped inheritance bindings separate for each selected member", () => {
  const models = parseModels(`
    type Id = string;
    type Label = string;
    interface Box<T> { left: T; right: T; values: T[]; read(): T }
    interface Left extends Pick<Box<Id>, "left" | "values" | "read"> {}
    interface Right extends Pick<Box<Label>, "right"> {}
    interface Result extends Left, Right {}
  `);
  const id = models.find((model) => model.name === "Id");
  const label = models.find((model) => model.name === "Label");
  const result = models.find((model) => model.name === "Result");
  assert.exists(id);
  assert.exists(label);
  assert.exists(result);

  expect(result.schema).toEqual([
    expect.objectContaining({ name: "left", type: id }),
    expect.objectContaining({ name: "values", type: "array", elementType: id }),
    expect.objectContaining({ name: "read", type: "function", returnType: id }),
    expect.objectContaining({ name: "right", type: label }),
  ]);
  expect(result.dependencies).toEqual(expect.arrayContaining([id, label]));
});

it("selects named array alias arguments by their parameter identity", () => {
  const models = parseModels(`
    type Other = string;
    type Id = string;
    type List<T, U = T> = readonly U[];
    interface Result { values: List<Other, Id>; defaults: List<Id> }
  `);
  const id = models.find((model) => model.name === "Id");
  const result = models.find((model) => model.name === "Result");
  assert.exists(id);
  assert.exists(result);

  expect(result.schema).toEqual([
    { name: "values", type: "array", elementType: id, optional: false, readonly: true },
    { name: "defaults", type: "array", elementType: id, optional: false, readonly: true },
  ]);
  expect(result.dependencies).toEqual([id]);
});

it("resolves array alias element names in their declaration's namespace", () => {
  const models = parseModels(`
    type Id = string;
    namespace Api { export type Id = string; export type List = Id[]; }
    interface Result { values: Api.List }
  `);
  const id = models.find((model) => model.name === "Api.Id");
  const result = models.find((model) => model.name === "Result");
  assert.exists(id);
  assert.exists(result);

  expect(result.schema).toEqual([{ name: "values", type: "array", elementType: id, optional: false }]);
  expect(result.dependencies).toEqual([id]);
});

it("uses effective types when generic annotations require evaluation", () => {
  const models = parseModels(`
    type Id = string;
    type List<T> = T[];
    interface Base<T> { value: T extends string ? number : T; values: (T extends string ? number : T)[] }
    type Result = Base<Id>;
    interface Values { values: List<string>; read(): List<string> }
  `);
  const result = models.find((model) => model.name === "Result");
  const values = models.find((model) => model.name === "Values");
  assert.exists(result);
  assert.exists(values);

  expect(result.schema).toEqual([
    { name: "value", type: "number", optional: false },
    { name: "values", type: "array", elementType: "number", optional: false },
  ]);
  expect(values.schema).toEqual([
    { name: "values", type: "array", elementType: "string", optional: false },
    { name: "read", type: "function", arguments: [], returnType: ["string"], optional: false },
  ]);
});

it("keeps a declared | null on optional properties", () => {
  const models = parseModels("interface A { req: string | null; opt?: string | null }");
  const [a] = models;

  expect(a.schema).toEqual([
    expect.objectContaining({ name: "req", optional: false, type: "string | null" }),
    expect.objectContaining({ name: "opt", optional: true, type: "string | null" }),
  ]);
});

it.each([
  { declaration: "type Derived = Required<Source>;", field: { optional: false } },
  { declaration: "type Derived = Partial<Source>;", field: { optional: true } },
  { declaration: 'type Derived = Pick<Source, "value">;', field: { optional: true } },
  {
    declaration: "interface Derived extends Required<Source> {}",
    field: { optional: false, inherited: true },
  },
])("preserves named property types in $declaration", ({ declaration, field }) => {
  const models = parseModels(`
    type Id = string;
    interface Source { readonly value?: Id }
    ${declaration}
  `);
  const id = models.find((model) => model.name === "Id");
  const derived = models.find((model) => model.name === "Derived");
  assert.exists(id);
  assert.exists(derived);

  expect(derived.schema).toEqual([{ name: "value", type: id, modifiers: ["readonly"], ...field }]);
  expect(derived.dependencies).toContain(id);
});

it("does not preserve a named property type when a mapped type replaces it", () => {
  const models = parseModels(`
    type Id = string;
    interface Source { readonly value?: Id }
    type Strings = { -readonly [K in keyof Source]-?: string };
    interface Other { value: string }
    type Replaced = { -readonly [K in keyof Source]-?: Other[K] };
  `);
  const id = models.find((model) => model.name === "Id");
  assert.exists(id);

  for (const name of ["Strings", "Replaced"]) {
    const model = models.find((candidate) => candidate.name === name);
    assert.exists(model);
    expect(model.schema).toEqual([{ name: "value", type: "string", optional: false }]);
    expect(model.dependencies).not.toContain(id);
  }
});

it.each(["Source", "GenericSource<MaybeId>"])(
  "does not preserve undefined in a named alias after Required removes it from %s",
  (source) => {
    const models = parseModels(`
    type MaybeId = string | undefined;
    interface Source { value?: MaybeId }
    interface GenericSource<T> { value?: T }
    type Complete = Required<${source}>;
  `);
    const complete = models.find((model) => model.name === "Complete");
    assert.exists(complete);

    expect(complete.schema).toEqual([{ name: "value", type: "string", optional: false }]);
    expect(complete.dependencies).toEqual([]);
  }
);

it("renders synthesized properties from mapped interface heritage", () => {
  const models = parseModels(`
    interface Full { a: string; b: number; }
    interface Picked extends Pick<Full, "a"> { own: boolean; }
    interface Optional extends Partial<Full> {}
    interface Other { c: boolean; }
    interface Mixed extends Full, Partial<Other> { own: bigint; }
    interface OverrideBase { inherited?: string; }
    interface Override extends OverrideBase { own: boolean; inherited: string; }
    class Merged { own: boolean; }
    interface Merged extends Partial<Full> {}
    type Alias = Pick<Full, "a">;
  `);
  const full = models.find((model) => model.name === "Full");
  const picked = models.find((model) => model.name === "Picked");
  const optional = models.find((model) => model.name === "Optional");
  const mixed = models.find((model) => model.name === "Mixed");
  const override = models.find((model) => model.name === "Override");
  const merged = models.find((model) => model.name === "Merged");
  const alias = models.find((model) => model.name === "Alias");

  assert.exists(full);
  assert.exists(picked);
  assert.exists(optional);
  assert.exists(mixed);
  assert.exists(override);
  assert.exists(merged);
  assert(merged.type === "class");
  assert.exists(alias);
  expect(picked.schema).toEqual([
    { name: "a", type: "string", optional: false, inherited: true },
    { name: "own", type: "boolean", optional: false },
  ]);
  expect(picked.dependencies).toContain(full);
  expect(optional.schema).toEqual([
    { name: "a", type: "string", optional: true, inherited: true },
    { name: "b", type: "number", optional: true, inherited: true },
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
  { base: 'Pick<Source, "value">', field: { optional: false } },
  { base: 'Omit<Source, "other">', field: { optional: false } },
  { base: "Partial<Source>", field: { optional: true } },
  { base: "Required<Source>", field: { optional: false } },
  { base: "Readonly<Source>", field: { optional: false, modifiers: ["readonly"] } },
  { base: 'Record<"value", Entity>', field: { optional: false } },
  { base: "{ [K in keyof Source]: Source[K] }", field: { optional: false } },
])("renders inherited class properties from $base", ({ base, field }) => {
  const models = parseModels(`
    interface Entity { id: string }
    interface Source { value: Entity }
    type Base = ${base};
    declare const Ctor: new () => Base;
    class Impl extends Ctor { own = ""; }
    interface IfaceImpl extends Base { own: string; }
  `);
  const entity = models.find((model) => model.name === "Entity");
  const impl = models.find((model) => model.name === "Impl");
  const iface = models.find((model) => model.name === "IfaceImpl");
  assert.exists(entity);
  assert.exists(impl);
  assert.exists(iface);

  const value = { name: "value", type: entity, inherited: true, ...field };
  const own = { name: "own", type: "string", optional: false };
  expect(impl.schema).toHaveLength(2);
  expect(impl.schema).toEqual(expect.arrayContaining([own, value]));
  expect(iface.schema).toEqual([value, own]);
  expect(impl.dependencies).toContain(entity);
});

it("keeps class overrides and merged synthesized members once without reordering own members", () => {
  const models = parseModels(`
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
  `);
  const impl = models.find((model) => model.name === "Impl");
  assert.exists(impl);

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
  const models = parseModels(`
    interface Entity {}
    interface Source { value: Entity; }
    type Strings = { [K in keyof Source]: string };
    interface StringView extends Strings {}
    declare const StringCtor: new () => Strings;
    class StringModel extends StringCtor {}
    interface ReadonlyView extends Readonly<Source> {}
    class ReadonlyModel {}
    interface ReadonlyModel extends Readonly<Source> {}
  `);
  const entity = models.find((model) => model.name === "Entity");
  const stringView = models.find((model) => model.name === "StringView");
  const stringModel = models.find((model) => model.name === "StringModel");
  const readonlyView = models.find((model) => model.name === "ReadonlyView");
  const readonlyModel = models.find((model) => model.name === "ReadonlyModel");

  assert.exists(entity);
  assert.exists(stringView);
  assert.exists(stringModel);
  assert.exists(readonlyView);
  assert.exists(readonlyModel);
  assert(readonlyModel.type === "class");

  expect(stringView.schema).toEqual([{ name: "value", type: "string", optional: false, inherited: true }]);
  expect(stringModel.schema).toEqual([{ name: "value", type: "string", optional: false, inherited: true }]);
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

it("preserves type alias references in property types", () => {
  const models = parseModels(`
    type Status = "active" | "inactive" | "pending";
    interface User {
      status: Status;
      previousStatus?: Status;
    }
  `);
  const status = models.find((model) => model.name === "Status");
  const user = models.find((model) => model.name === "User");
  assert.exists(status);
  assert.exists(user);

  expect(user.schema).toEqual([
    { name: "status", type: status, optional: false },
    { name: "previousStatus", type: status, optional: true },
  ]);
  expect(user.dependencies).toEqual([status]);
});

it("preserves type alias references in arrays and generics", () => {
  const models = parseModels(`
    type Color = "red" | "green" | "blue";
    type Theme = {
      colors: Color[];
      colorMap: Record<string, Color>;
    };
  `);
  const color = models.find((model) => model.name === "Color");
  const theme = models.find((model) => model.name === "Theme");
  assert.exists(color);
  assert.exists(theme);

  expect(theme.schema).toEqual([
    { name: "colors", type: "array", elementType: color, optional: false },
    {
      name: "colorMap",
      type: "generic",
      genericName: "Record",
      arguments: ["string", color],
      optional: false,
    },
  ]);
  expect(theme.dependencies).toEqual([color]);
});

it.each(["interface Example", "declare class Example", "type Example ="])(
  "preserves readonly array types and independent property modifiers in %s",
  (declaration) => {
    const models = parseModels(`
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
    `);
    const example = models.find((model) => model.name === "Example");
    const item = models.find((model) => model.name === "Item");
    assert.exists(example);
    assert.exists(item);

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
  "preserves primitive-alias elements in array properties in %s",
  (declaration) => {
    const models = parseModels(`
      type Id = string;
      ${declaration} {
        values: Id[];
        immutable: readonly Id[];
        generic: Array<Id>;
        genericReadonly: ReadonlyArray<Id>;
      }
    `);
    const example = models.find((model) => model.name === "Example");
    assert.exists(example);

    const id = models.find((model) => model.name === "Id");
    assert.exists(id);

    expect(example.schema).toEqual([
      { name: "values", type: "array", elementType: id, optional: false },
      { name: "immutable", type: "array", elementType: id, readonly: true, optional: false },
      { name: "generic", type: "array", elementType: id, optional: false },
      { name: "genericReadonly", type: "array", elementType: id, readonly: true, optional: false },
    ]);
    expect(example.dependencies).toEqual([id]);
    expect(id.dependants).toContain(example);
  }
);

it.each(["class", "interface"])("places inherited members first within each %s member group", (kind) => {
  const models = parseModels(`
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
  `);
  const child = models.find((model) => model.name === "Child");
  assert.exists(child);
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

it("includes static members and surfaces member modifiers", () => {
  const models = parseModels(`
    abstract class Base {
      static count: number;
      private secret: string;
      protected id: number;
      readonly tag: string;
      abstract run(): void;
      private static readonly registry: Map<string, number>;
      protected static create(): string { return ""; }
      public static publicCount: number;
      abstract readonly label: string;
      plain: string;
    }
    interface Frozen { readonly key: string }
  `);
  const base = models.find((m) => m.name === "Base");
  const frozen = models.find((m) => m.name === "Frozen");
  assert.exists(base);
  assert(base.type === "class");
  assert.exists(frozen);

  expect(base.isAbstract).toBe(true);
  expect(base.schema).toContainEqual({
    name: "count",
    type: "number",
    optional: false,
    modifiers: ["static"],
  });
  expect(base.schema).toContainEqual({
    name: "secret",
    type: "string",
    optional: false,
    modifiers: ["private"],
  });
  expect(base.schema).toContainEqual({
    name: "id",
    type: "number",
    optional: false,
    modifiers: ["protected"],
  });
  expect(base.schema).toContainEqual({
    name: "tag",
    type: "string",
    optional: false,
    modifiers: ["readonly"],
  });
  expect(base.schema).toContainEqual(
    expect.objectContaining({ name: "run", type: "function", modifiers: ["abstract"] })
  );
  expect(frozen.schema).toContainEqual({
    name: "key",
    type: "string",
    optional: false,
    modifiers: ["readonly"],
  });
  for (const { name, modifiers } of [
    { name: "registry", modifiers: ["private", "static", "readonly"] },
    { name: "create", modifiers: ["protected", "static"] },
    { name: "publicCount", modifiers: ["static"] },
    { name: "label", modifiers: ["readonly", "abstract"] },
  ]) {
    expect(base.schema).toContainEqual(expect.objectContaining({ name, modifiers }));
  }
  expect(base.schema).toContainEqual({ name: "plain", type: "string", optional: false });
});

it("substitutes generic type arguments for inherited and aliased members", () => {
  const models = parseModels(`
    interface User { id: string }
    interface Collection<T> { items: T[]; first(): T }
    interface Users extends Collection<User> {}
    interface Box<T> { value: T }
    type UserBox = Box<User>;
  `);

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

it("does not display checker-added undefined for optional generic fields", () => {
  const models = parseModels(`
    interface User {}
    interface Box<T> { value?: T | null }
    type UserBox = Box<User>;
  `);

  const userBox = models.find((model) => model.name === "UserBox");
  expect(userBox?.schema).toContainEqual({
    name: "value",
    type: "User | null",
    optional: true,
    typeRefs: [expect.objectContaining({ name: "User" })],
  });
});

it.each([
  ["interface Base<T>", "interface Child extends Base<User> {}"],
  ["declare class Base<T>", "declare class Child extends Base<User> {}"],
  ["interface Base<T>", "type Child = Base<User>;"],
])("retains nested references in specialized members from %s through %s", (base, consumer) => {
  const models = parseModels(`
    interface User { id: string }
    ${base} {
      nested: { value: T };
      items: { value: T }[];
      promise: Promise<{ value: T }>;
    }
    ${consumer}
  `);
  const user = models.find((model) => model.name === "User");
  const child = models.find((model) => model.name === "Child");
  assert.exists(user);
  assert.exists(child);

  expect(child.schema).toEqual([
    expect.objectContaining({ name: "nested", type: "{ value: User; }", typeRefs: [user] }),
    expect.objectContaining({
      name: "items",
      type: "array",
      elementType: "{ value: User; }",
      typeRefs: [user],
    }),
    expect.objectContaining({
      name: "promise",
      type: "generic",
      genericName: "Promise",
      arguments: ["{ value: User; }"],
      typeRefs: [user],
    }),
  ]);
  expect(child.dependencies).toContain(user);
  expect(user.dependants).toContain(child);
});
