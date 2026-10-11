import { assert, expect, it } from "vitest";
import { parseModels } from "./index";

it("keeps inherited callable bindings distinct for equivalent and different primitive arguments", () => {
  const models = parseModels(`
    type Id = string;
    type Label = string;
    interface Callable<T> { (value: T): T; (values: T[]): T[] }
    interface Left extends Callable<Id> {}
    interface Right extends Callable<Label> {}
    interface Numbers extends Callable<number> {}
    interface Result extends Left, Right, Numbers {}
  `);
  const id = models.find((model) => model.name === "Id");
  const result = models.find((model) => model.name === "Result");
  const label = models.find((model) => model.name === "Label");
  assert.exists(id);
  assert.exists(result);
  assert.exists(label);

  expect(result.schema).toEqual([
    expect.objectContaining({ arguments: [{ name: "value", type: id }], returnType: id }),
    expect.objectContaining({ arguments: [{ name: "values", type: "Id[]" }], returnType: "Id[]" }),
    expect.objectContaining({ arguments: [{ name: "value", type: label }], returnType: label }),
    expect.objectContaining({ arguments: [{ name: "values", type: "Label[]" }], returnType: "Label[]" }),
    expect.objectContaining({ arguments: [{ name: "value", type: "number" }], returnType: "number" }),
    expect.objectContaining({
      arguments: [{ name: "values", type: "number[]" }],
      returnType: "number[]",
    }),
  ]);
});

it("keeps constructor bindings distinct across generic inheritance paths", () => {
  const models = parseModels(`
    type Id = string;
    interface Factory<T> { new(value: T): { value: T } }
    interface Left extends Factory<Id> {}
    interface Right extends Factory<number> {}
    interface Result extends Left, Right {}
  `);
  const id = models.find((model) => model.name === "Id");
  const result = models.find((model) => model.name === "Result");
  assert.exists(id);
  assert.exists(result);

  expect(result.schema).toEqual([
    expect.objectContaining({
      name: "new",
      arguments: [{ name: "value", type: id }],
      returnType: "{ value: Id; }",
    }),
    expect.objectContaining({
      name: "new",
      arguments: [{ name: "value", type: "number" }],
      returnType: "{ value: number; }",
    }),
  ]);
});

it("renders inherited index signatures from Record heritage", () => {
  const models = parseModels(`
    interface User { id: string; }
    interface UserMap extends Record<string, User> {}
    interface Scores extends Record<string, number> {}
    interface MixedScores extends Record<string, number> { [key: number]: number; }
  `);
  const user = models.find((model) => model.name === "User");
  const userMap = models.find((model) => model.name === "UserMap");
  const scores = models.find((model) => model.name === "Scores");
  const mixedScores = models.find((model) => model.name === "MixedScores");

  assert.exists(user);
  assert.exists(userMap);
  assert.exists(scores);
  assert.exists(mixedScores);
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
  const models = parseModels(`
    interface User { id: string; }
    interface SymbolRegistry { [key: symbol]: User; }
    interface Symbols extends SymbolRegistry {}
    interface DataRegistry { [key: \`data-\${string}\`]: User; }
    interface Data extends DataRegistry { [key: number]: number; }
  `);
  const user = models.find((model) => model.name === "User");
  const symbols = models.find((model) => model.name === "Symbols");
  const data = models.find((model) => model.name === "Data");

  assert.exists(user);
  assert.exists(symbols);
  assert.exists(data);
  expect(symbols.schema).toEqual([{ name: "[key: symbol]", type: user, optional: false, inherited: true }]);
  expect(symbols.dependencies).toContain(user);
  expect(data.schema).toEqual([
    { name: "[key: `data-${string}`]", type: user, optional: false, inherited: true },
    { name: "[key: number]", type: "number", optional: false },
  ]);
  expect(data.dependencies).toContain(user);
});

it("keeps interface-only signatures on a class merge without heritage", () => {
  const models = parseModels(`
    class Sprite {}
    interface Sprite {
      extra: number;
      (value: string): boolean;
      new (value: string): object;
      [key: string]: unknown;
    }
  `);
  const [sprite] = models;

  assert.exists(sprite);
  assert(sprite.type === "class");
  expect(models.length).toBe(1);
  expect(sprite.schema.map((field) => field.name)).toEqual(["", "new", "[key: string]", "extra"]);
  expect(sprite.dependencies).toEqual([]);
});

it("renders declared and inherited class index signatures without an interface merge", () => {
  const models = parseModels(`
    interface User { id: string }
    declare class Registry<T> { [name: string]: T }
    declare class Users extends Registry<User> {}
  `);
  const user = models.find((model) => model.name === "User");
  const registry = models.find((model) => model.name === "Registry");
  const users = models.find((model) => model.name === "Users");
  assert.exists(user);
  assert.exists(registry);
  assert.exists(users);

  expect(registry.schema).toEqual([{ name: "[name: string]", type: "T", optional: false }]);
  expect(users.schema).toEqual([{ name: "[key: string]", type: user, optional: false, inherited: true }]);
  expect(users.dependencies).toContain(user);
});

it("preserves named index values through generic aliases and heritage", () => {
  const models = parseModels(`
    type Id = string;
    type Label = string;
    interface Base<T> { [key: string]: T }
    interface Child<T, U> extends Base<T> {}
    type Forward<T, U> = Child<U, T>;
    type Values = Forward<Label, Id>;
    interface Direct extends Child<Id, Label> {}
    interface Defaults<T, U = T> { [key: string]: U }
    type DefaultValues = Defaults<Id>;
  `);
  const id = models.find((model) => model.name === "Id");
  const values = models.find((model) => model.name === "Values");
  const direct = models.find((model) => model.name === "Direct");
  const defaults = models.find((model) => model.name === "DefaultValues");
  assert.exists(id);
  assert.exists(values);
  assert.exists(direct);
  assert.exists(defaults);

  expect(values.schema).toEqual([{ name: "[key: string]", type: id, optional: false }]);
  expect(values.dependencies).toEqual([id]);

  expect(direct.schema).toEqual([{ name: "[key: string]", type: id, optional: false, inherited: true }]);
  expect(direct.dependencies).toContain(id);

  expect(defaults.schema).toEqual([{ name: "[key: string]", type: id, optional: false }]);
  expect(defaults.dependencies).toEqual([id]);
});

it("keeps inherited generic signatures on a class merge", () => {
  const models = parseModels(`
    interface User { id: string; }
    interface Callable<T> {
      (value: T): T;
      (values: T[]): T[];
      new (value: T): { value: T };
    }
    class Adapter {}
    interface Adapter extends Callable<User> {}
  `);
  const user = models.find((model) => model.name === "User");
  const adapter = models.find((model) => model.name === "Adapter");

  assert.exists(user);
  assert.exists(adapter);
  assert(adapter.type === "class");
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
  const models = parseModels(`
    interface User { id: string; }
    interface Callable<T> {
      (value: T): T;
      new (value: T): { value: T };
    }
    interface Adapter extends Callable<User> {}
  `);
  const user = models.find((model) => model.name === "User");
  const adapter = models.find((model) => model.name === "Adapter");

  assert.exists(user);
  assert.exists(adapter);
  assert(adapter.type === "interface");
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

it("renders interface index signatures", () => {
  const models = parseModels(`
    interface User { id: string }
    interface Registry {
      count: number;
      [name: string]: number | User;
    }
  `);

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
  const models = parseModels(`
    interface User { id: string }
    type Id = string;
    type UserMap = Record<string, User>;
    type Scores = { [id: number]: number };
    type Nested = { [name: string]: { id: Id } };
    type Promises = Record<string, Promise<Id>>;
  `);

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

it("renders interface call and construct signatures", () => {
  const models = parseModels(`
    interface Widget { id: string }
    interface Factory {
      (x: number): string;
      new (x: number): Widget;
    }
  `);

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

it("uses instantiated index values instead of assuming the last alias argument is the value", () => {
  const models = parseModels(`
    interface User { id: string }
    type Wrapped<T> = { [key: string]: Promise<T> };
    type Nested<T, U> = { [key: string]: { value: T } };
    type Promises = Wrapped<User>;
    type Objects = Nested<User, number>;
  `);
  const user = models.find((model) => model.name === "User");
  const promises = models.find((model) => model.name === "Promises");
  const objects = models.find((model) => model.name === "Objects");
  assert.exists(user);
  assert.exists(promises);
  assert.exists(objects);

  expect(promises.schema).toEqual([
    { name: "[key: string]", type: "Promise<User>", optional: false, typeRefs: [user] },
  ]);
  expect(objects.schema).toEqual([
    { name: "[key: string]", type: "{ value: User; }", optional: false, typeRefs: [user] },
  ]);
  expect(promises.dependencies).toEqual([user]);
  expect(objects.dependencies).toEqual([user]);
});

it("keeps specialized alias index signatures with non-string keys", () => {
  const models = parseModels(`
    interface User { id: string }
    type Registry<T> = { [key: symbol]: T };
    type Users = Registry<User>;
  `);
  const user = models.find((model) => model.name === "User");
  const users = models.find((model) => model.name === "Users");
  assert.exists(user);
  assert.exists(users);

  expect(users.schema).toEqual([{ name: "[key: symbol]", type: user, optional: false }]);
  expect(users.dependencies).toEqual([user]);
});

it("uses the index's type parameter when primitive alias arguments have the same compiler type", () => {
  const models = parseModels(`
    type Id = string;
    type Label = string;
    type First<T, U> = { [key: string]: T };
    type Last<T, U> = { [key: string]: U };
    type Ids = First<Id, Label>;
    type Labels = Last<Id, Label>;
    type DirectIds = Record<string, Id>;
    declare class Registry<T> { [key: string]: T }
    type ClassIds = Registry<Id>;
    type Identity<T> = T;
    type ForwardedIds = Identity<Registry<Id>>;
  `);
  const id = models.find((model) => model.name === "Id");
  const label = models.find((model) => model.name === "Label");
  assert.exists(id);
  assert.exists(label);

  for (const { name, type } of [
    { name: "Ids", type: id },
    { name: "Labels", type: label },
    { name: "DirectIds", type: id },
    { name: "ClassIds", type: id },
    { name: "ForwardedIds", type: id },
  ]) {
    const model = models.find((candidate) => candidate.name === name);
    assert.exists(model);

    expect(model.schema).toEqual([{ name: "[key: string]", type, optional: false }]);
    expect(model.dependencies).toEqual([type]);
  }
});

it("renders function and constructor aliases with the same relationships as interfaces", () => {
  const models = parseModels(`
    interface Item { id: string }
    type Handler = (item: Item) => Item;
    interface HandlerI { (item: Item): Item }
    type Ctor = new (item: Item) => Item;
    interface CtorI { new (item: Item): Item }
  `);
  const item = models.find((model) => model.name === "Item");
  assert.exists(item);

  for (const [name, interfaceName, fieldName] of [
    ["Handler", "HandlerI", ""],
    ["Ctor", "CtorI", "new"],
  ]) {
    const alias = models.find((model) => model.name === name);
    const equivalent = models.find((model) => model.name === interfaceName);
    assert.exists(alias);
    assert.exists(equivalent);
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
  const models = parseModels(`
    type Factory = {
      (text: string): number;
      (value: number): string;
      new (text: string): object;
      new (value: number): object;
      label: string;
      [key: string]: unknown;
    };
  `);
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
  const models = parseModels(`
    interface Item { id: string }
    type Callback<T> = (value: T) => T;
    type Constructor<T> = new (value: T) => T;
    type Handler = Callback<Item>;
    type Ctor = Constructor<Item>;
  `);
  const item = models.find((model) => model.name === "Item");
  assert.exists(item);

  for (const [name, fieldName] of [
    ["Handler", ""],
    ["Ctor", "new"],
  ]) {
    const alias = models.find((model) => model.name === name);
    assert.exists(alias);
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

it("merges index signatures independently of declaration order", () => {
  const models = parseModels(`
    interface Value {}
    interface First { fixed: string }
    interface First { [key: string]: Value | string }
    interface Last { [key: string]: Value | string }
    interface Last { fixed: string }
  `);

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
