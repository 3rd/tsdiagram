import { assert, expect, it } from "vitest";
import { parseModels } from "./index";
import { isFunctionSchemaField } from "./model";

it("preserves alias references for class methods, getters, and setters", () => {
  const models = parseModels(`
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

  const exampleModel = models.find((m) => m.name === "Example");
  const unionKeyModel = models.find((m) => m.name === "UnionKey");
  assert.exists(exampleModel);
  assert.exists(unionKeyModel);

  expect(exampleModel.dependencies).toEqual([expect.objectContaining({ name: "UnionKey" })]);
  expect(unionKeyModel.dependants).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Example" })])
  );

  const doThisField = exampleModel.schema.find((field) => field.name === "doThis");
  assert.exists(doThisField);
  assert(isFunctionSchemaField(doThisField));
  expect(doThisField.returnType).toEqual(expect.objectContaining({ name: "UnionKey" }));

  const statusFields = exampleModel.schema.filter((field) => field.name === "aliasStatus");
  expect(doThisField.accessor).toBeUndefined();
  expect(statusFields.length).toBe(2);

  const getterField = statusFields.find(
    (field) => isFunctionSchemaField(field) && field.arguments.length === 0
  );
  assert.exists(getterField);
  assert(isFunctionSchemaField(getterField));
  expect(getterField.returnType).toEqual(expect.objectContaining({ name: "UnionKey" }));
  expect(getterField.accessor).toBe("get");

  const setterField = statusFields.find(
    (field) => isFunctionSchemaField(field) && field.arguments.length === 1
  );
  assert.exists(setterField);
  assert(isFunctionSchemaField(setterField));
  expect(setterField.returnType).toBe("void");
  expect(setterField.accessor).toBe("set");
  expect(setterField.arguments[0]?.type).toEqual(expect.objectContaining({ name: "UnionKey" }));
});

it("inherits accessor rows and their model dependencies without duplicating own accessors", () => {
  const models = parseModels(`
    interface Value { amount: number }
    class Base {
      label: string;
      get value(): Value { return { amount: 0 }; }
      set value(next: Value) {}
      run(): void {}
    }
    class Child extends Base { count: number; }
  `);
  const value = models.find((model) => model.name === "Value");
  const base = models.find((model) => model.name === "Base");
  const child = models.find((model) => model.name === "Child");
  assert.exists(value);
  assert.exists(base);
  assert.exists(child);

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

it("specializes inherited getter and setter types", () => {
  const models = parseModels(`
    interface Value { amount: number }
    class Base<T> {
      get value(): T { throw 0; }
      set value(next: T | number) {}
      set reversed(next: T) {}
      get reversed(): T { throw 0; }
      get readOnly(): T { throw 0; }
      set writeOnly(next: T) {}
    }
    class Child extends Base<Value> {}
    class Grandchild extends Child {}
  `);
  const value = models.find((model) => model.name === "Value");
  assert.exists(value);

  for (const name of ["Child", "Grandchild"]) {
    const model = models.find((model) => model.name === name);
    assert.exists(model);
    const fields = model.schema.filter(isFunctionSchemaField);
    expect(fields).toHaveLength(6);
    expect(fields.filter((field) => field.accessor === "get").map((field) => field.returnType)).toEqual([
      value,
      value,
      value,
    ]);
    expect(fields.filter((field) => field.accessor === "set").map((field) => field.arguments)).toEqual([
      [{ name: "next", type: "number | Value" }],
      [{ name: "next", type: value }],
      [{ name: "next", type: value }],
    ]);
    expect(fields.every((field) => field.inherited)).toBe(true);
    expect(model.dependencies).toContain(value);
    expect(fields.find((field) => field.accessor === "set" && field.name === "value")?.typeRefs).toContain(
      value
    );
  }
});

it("preserves computed accessors and specializes inherited symbol accessors", () => {
  const models = parseModels(`
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

  for (const { modelName, type, names } of [
    { modelName: "Base", type: "T", names: ["[Symbol.iterator]", "[key]", "[dynamicKey]"] },
    { modelName: "Child", type: "string", names: ["[Symbol.iterator]", "[key]"] },
  ]) {
    const model = models.find((candidate) => candidate.name === modelName);
    assert.exists(model);
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
  ["get value(): string; set value(next: string);", "", ["get", "set"]],
  ["get value(): string;", "set value(next: string);", ["get", "set"]],
  ["set value(next: string);", "get value(): string;", ["set", "get"]],
])("emits merged interface accessors once: %s %s", (accessors, laterAccessors, expectedKinds) => {
  const models = parseModels(`
    interface Combined { ${accessors} }
    interface Combined { get later(): number; set later(next: number); ${laterAccessors} }
    class Base { get inherited(): boolean { return true; } }
    class Combined extends Base {}
  `);
  const combined = models.find((model) => model.name === "Combined");
  assert.exists(combined);
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

it("preserves own accessor order and static accessors after inherited accessors", () => {
  const models = parseModels(`
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
  `);
  const child = models.find((model) => model.name === "Child");
  assert.exists(child);

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
  const models = parseModels(`
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
  `);
  const child = models.find((model) => model.name === "Child");
  const grandchild = models.find((model) => model.name === "Grandchild");
  assert.exists(child);
  assert.exists(grandchild);

  const valueGetter = {
    name: "value",
    type: "function",
    accessor: "get",
    arguments: [],
    returnType: "number",
    optional: false,
  };
  const valueSetter = {
    name: "value",
    type: "function",
    accessor: "set",
    arguments: [{ name: "next", type: "number" }],
    returnType: "void",
    optional: false,
  };
  const readyGetter = {
    name: "ready",
    type: "function",
    accessor: "get",
    arguments: [],
    returnType: "boolean",
    optional: false,
    inherited: true,
  };
  const labelSetter = {
    name: "label",
    type: "function",
    accessor: "set",
    arguments: [{ name: "next", type: "string" }],
    returnType: "void",
    optional: false,
    inherited: true,
  };

  expect(child.schema).toEqual([readyGetter, valueGetter, labelSetter, valueSetter]);
  expect(child.dependencies.map((dependency) => dependency.name)).toEqual(["Base"]);
  expect(grandchild.schema).toEqual([
    { ...valueGetter, inherited: true },
    readyGetter,
    { ...valueSetter, inherited: true },
    labelSetter,
  ]);
  expect(grandchild.dependencies.map((dependency) => dependency.name)).toEqual(["Child"]);
});

it("retains nested references in specialized getter and setter types", () => {
  const models = parseModels(`
    interface User { id: string }
    interface Base<T> {
      get value(): { item: T };
      set value(next: { item: T });
    }
    interface Child extends Base<User> {}
  `);
  const user = models.find((model) => model.name === "User");
  const child = models.find((model) => model.name === "Child");
  assert.exists(user);
  assert.exists(child);

  expect(child.schema).toEqual([
    expect.objectContaining({ accessor: "get", returnType: "{ item: User; }", typeRefs: [user] }),
    expect.objectContaining({
      accessor: "set",
      arguments: [{ name: "next", type: "{ item: User; }" }],
      typeRefs: [user],
    }),
  ]);
});

it("keeps both accessors and their distinct instantiated types in a class alias", () => {
  const models = parseModels(`
    interface User { id: string }
    declare class Base<T> {
      get value(): T;
      set value(next: T | number);
      set reversed(next: T);
      get reversed(): T;
    }
    type Alias = Base<User>;
  `);
  const user = models.find((model) => model.name === "User");
  const alias = models.find((model) => model.name === "Alias");
  assert.exists(user);
  assert.exists(alias);

  expect(alias.schema).toEqual([
    expect.objectContaining({ name: "value", accessor: "get", returnType: user }),
    expect.objectContaining({
      name: "value",
      accessor: "set",
      arguments: [{ name: "next", type: "number | User" }],
    }),
    expect.objectContaining({ name: "reversed", accessor: "set", arguments: [{ name: "next", type: user }] }),
    expect.objectContaining({ name: "reversed", accessor: "get", returnType: user }),
  ]);
  expect(alias.dependencies).toEqual([user]);
});
