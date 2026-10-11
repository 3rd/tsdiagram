import { assert, expect, it } from "vitest";
import { parseModels } from "./index";

it("links interface extends declared after the deriving interface", () => {
  const models = parseModels("interface B extends A { b: string }\ninterface A { a: string }");

  const a = models.find((model) => model.name === "A");
  const b = models.find((model) => model.name === "B");

  assert.exists(b);
  assert(b.type === "interface");
  expect(b.extends[0]).toBe(a);
});

it("links class heritage declared after the class", () => {
  const source = "class C extends D implements I {}\nclass D {}\ninterface I { i: string }";
  const models = parseModels(source);
  const c = models.find((model) => model.name === "C");
  const d = models.find((model) => model.name === "D");
  const i = models.find((model) => model.name === "I");

  assert.exists(c);
  assert(c.type === "class");
  expect(c.extends).toBe(d);
  expect(c.implements[0]).toBe(i);
});

it("keeps interface heritage when the interface merges with a class", () => {
  const models = parseModels(`
    interface Base { x: string; }
    class Sprite { name: string; }
    interface Sprite extends Base {}
  `);
  const base = models.find((model) => model.name === "Base");
  const sprite = models.find((model) => model.name === "Sprite");

  assert.exists(base);
  assert.exists(sprite);
  assert(sprite.type === "class");
  expect(models.length).toBe(2);
  expect(sprite.schema).toEqual([
    { name: "x", type: "string", optional: false, inherited: true },
    { name: "name", type: "string", optional: false },
  ]);
  expect(sprite.extends).toBe(base);
  expect(sprite.dependencies).toEqual([base]);
});

it("keeps class heritage and every merged interface heritage entry", () => {
  const models = parseModels(`
    class Root {}
    interface First {}
    interface Second {}
    class Sprite extends Root {}
    interface Sprite extends First, Second {}
  `);
  const root = models.find((model) => model.name === "Root");
  const first = models.find((model) => model.name === "First");
  const second = models.find((model) => model.name === "Second");
  const sprite = models.find((model) => model.name === "Sprite");

  assert.exists(root);
  assert.exists(first);
  assert.exists(second);
  assert.exists(sprite);
  assert(sprite.type === "class");
  expect(sprite.extends).toBe(root);
  expect(sprite.headerRefs).toEqual([first, second]);
  expect(sprite.dependencies).toHaveLength(3);
  expect(sprite.dependencies).toEqual(expect.arrayContaining([root, first, second]));
});

it("parses generic alias and interface arguments", () => {
  const models = parseModels(`
    type A<T> = { a: T };
    interface B<T, U extends string> {
      b: T
    };
  `);

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

it("links heritage through utility types to the referenced models", () => {
  const models = parseModels(`
    interface Full { a: string; b: number; c: boolean }
    interface Slim extends Pick<Full, "a" | "b"> { d: string }
    class Impl implements Omit<Full, "c"> {
      a = "";
      b = 0;
    }
  `);

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

it("links the base model when heritage uses a generic instantiation", () => {
  const models = parseModels(`
    interface User { id: string }
    interface Collection<T> { items: T[] }
    interface Users extends Collection<User> {}
  `);

  const users = models.find((m) => m.name === "Users");

  expect(users?.type === "interface" ? users.headerRefs : undefined).toEqual([
    expect.objectContaining({ name: "Collection" }),
    expect.objectContaining({ name: "User" }),
  ]);
});

it.each([
  ["interface Example", "{}"],
  ["declare class Example", "{}"],
  ["type Example", "= {}"],
])("preserves named constraints and links generic defaults and type queries in %s", (declaration, body) => {
  const models = parseModels(`
      interface User { id: string }
      type Id = string;
      declare function create(): User;
      ${declaration}<T extends keyof User = "id", U extends Id = Id, F extends typeof create = typeof create, D = User> ${body}
    `);
  const example = models.find((model) => model.name === "Example");
  assert.exists(example);

  const user = models.find((model) => model.name === "User");
  assert.exists(user);

  const id = models.find((model) => model.name === "Id");
  assert.exists(id);

  const create = models.find((model) => model.name === "create");
  assert.exists(create);

  expect(example.arguments).toEqual([
    { name: "T", extends: "keyof User", default: '"id"' },
    { name: "U", extends: "Id", default: "Id" },
    { name: "F", extends: "typeof create", default: "typeof create" },
    { name: "D", extends: undefined, default: "User" },
  ]);
  expect(example.dependencies).toEqual([user, id, create]);
});

it("links models used only by generic defaults in interface and class headers", () => {
  const models = parseModels(`
    interface User { id: string }
    interface Pool<T = User> {}
    declare class Store<T = User> {}
    type Alias<T = User> = {};
  `);
  const user = models.find((model) => model.name === "User");
  assert.exists(user);

  const pool = models.find((model) => model.name === "Pool");
  assert.exists(pool);

  const store = models.find((model) => model.name === "Store");
  assert.exists(store);

  const alias = models.find((model) => model.name === "Alias");
  assert.exists(alias);

  expect(pool).toMatchObject({ headerRefs: [user], dependencies: [user] });
  expect(store).toMatchObject({ headerRefs: [user], dependencies: [user] });
  expect(alias.dependencies).toEqual([user]);
});

it("preserves literal quotes in generic class heritage", () => {
  const models = parseModels(`
    class Base<T> {}
    interface Other<T> {}
    class Child extends Base<"a" | "b"> implements Other<"c"> {}
  `);
  const child = models.find((model) => model.name === "Child");
  assert.exists(child);
  assert(child.type === "class");

  const base = models.find((model) => model.name === "Base");
  assert.exists(base);

  const other = models.find((model) => model.name === "Other");
  assert.exists(other);

  expect(child.extends).toBe('Base<"a" | "b">');
  expect(child.implements).toEqual(['Other<"c">']);
  expect(child.headerRefs).toEqual([base, other]);
});

it("marks optional generic properties and links generic heads in constraints and heritage", () => {
  const models = parseModels(`
    interface User { id: string }
    interface Collection<T> { items: T[] }
    class Store {
      cache?: Map<string, string>;
    }
    interface Repo<T extends Collection<User>> { current: T }
    interface Wide extends Pick<Collection<User>, "items"> {}
  `);

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
