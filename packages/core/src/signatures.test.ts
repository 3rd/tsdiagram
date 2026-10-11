import { expect, it, assert } from "vitest";
import { parseModels } from "./index";
import { isFunctionSchemaField } from "./model";

it("keeps method bindings aligned when intersections deduplicate equivalent generic types", () => {
  const models = parseModels(`
    type Id = string;
    type Label = string;
    interface Callable<T> { read(value: T): T }
    type Result = Callable<Id> & Callable<Label> & Callable<number>;
  `);
  const id = models.find((model) => model.name === "Id");
  const result = models.find((model) => model.name === "Result");
  assert.exists(id);
  assert.exists(result);

  expect(result.schema).toEqual([
    expect.objectContaining({ name: "read", arguments: [{ name: "value", type: id }], returnType: id }),
    expect.objectContaining({
      name: "read",
      arguments: [{ name: "value", type: "number" }],
      returnType: "number",
    }),
  ]);
});

it("preserves named arguments in generic callable property annotations", () => {
  const models = parseModels(`
    type Id = string;
    interface Callback<T> { (value: T): T; default: T }
    interface Result { callback: Callback<Id> }
  `);
  const id = models.find((model) => model.name === "Id");
  const result = models.find((model) => model.name === "Result");
  assert.exists(id);
  assert.exists(result);

  expect(result.schema).toEqual([
    expect.objectContaining({ name: "callback", arguments: [{ name: "value", type: id }], returnType: id }),
  ]);
  expect(result.dependencies).toContain(id);
});

it.each(["Base<Id>", "Identity<Base<Id>>"])(
  "preserves primitive alias arguments in %s signatures",
  (source) => {
    const models = parseModels(`
    type Id = string;
    interface Base<T> { read(): T; send(value: T): void; list(): T[]; receive(values: T[]): void; (value: T): T }
    type Identity<T> = T;
    type Result = ${source};
  `);
    const id = models.find((model) => model.name === "Id");
    const result = models.find((model) => model.name === "Result");
    assert.exists(id);
    assert.exists(result);

    expect(result.schema).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "read", returnType: id }),
        expect.objectContaining({ name: "send", arguments: [{ name: "value", type: id }] }),
        expect.objectContaining({ name: "list", returnType: [id] }),
        expect.objectContaining({
          name: "receive",
          arguments: [{ name: "values", type: "Id[]" }],
          typeRefs: [id],
        }),
        expect.objectContaining({ name: "", returnType: id, arguments: [{ name: "value", type: id }] }),
      ])
    );
    expect(result.dependencies).toContain(id);
  }
);

it("preserves named arguments of generic array aliases in methods", () => {
  const models = parseModels(`
    type Other = string;
    type Id = string;
    type List<T, U> = U[];
    interface Result { read(): List<Other, Id>; send(values: List<Other, Id>): void }
  `);
  const id = models.find((model) => model.name === "Id");
  const result = models.find((model) => model.name === "Result");
  assert.exists(id);
  assert.exists(result);

  expect(result.schema).toEqual([
    expect.objectContaining({ name: "read", returnType: [id] }),
    expect.objectContaining({ name: "send", arguments: [{ name: "values", type: "Id[]" }] }),
  ]);
});

it.each(["interface Example", "declare class Example", "type Example ="])(
  "preserves readonly method and callback array returns in %s",
  (declaration) => {
    const models = parseModels(`
      interface Item { id: string }
      type Items = ReadonlyArray<Item>;
      ${declaration} {
        mutable(): Item[];
        immutable(input: readonly Item[]): readonly Item[];
        callback: () => ReadonlyArray<string>;
        aliased(): Items;
      }
    `);
    const example = models.find((model) => model.name === "Example");
    const item = models.find((model) => model.name === "Item");
    assert.exists(example);
    assert.exists(item);

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

it.each(["interface Example", "declare class Example", "type Example ="])(
  "preserves primitive-alias arrays in method and callback signatures in %s",
  (declaration) => {
    const models = parseModels(`
      type Id = string;
      ${declaration} {
        mutable(values: Id[]): Id[];
        immutable(values: ReadonlyArray<Id>): readonly Id[];
        callback: (values: Array<Id>) => Array<Id>;
      }
    `);
    const example = models.find((model) => model.name === "Example");
    assert.exists(example);

    const id = models.find((model) => model.name === "Id");
    assert.exists(id);

    expect(example.schema).toEqual(
      expect.arrayContaining([
        {
          name: "mutable",
          type: "function",
          arguments: [{ name: "values", type: "Id[]" }],
          returnType: [id],
          optional: false,
          typeRefs: [id],
        },
        {
          name: "immutable",
          type: "function",
          arguments: [{ name: "values", type: "readonly Id[]" }],
          returnType: [id],
          returnTypeReadonly: true,
          optional: false,
          typeRefs: [id],
        },
        {
          name: "callback",
          type: "function",
          arguments: [{ name: "values", type: "Id[]" }],
          returnType: [id],
          optional: false,
          typeRefs: [id],
        },
      ])
    );
    expect(example.schema).toHaveLength(3);
    expect(example.dependencies).toEqual([id]);
  }
);

it("keeps declared generic constraints while specializing inherited method constraints", () => {
  const models = parseModels(`
    interface User { id: string }
    type Id = string;
    declare function select<T extends keyof User, U extends Id = Id>(): void;
    interface Base<T> { select<U extends T, V extends Id = Id, D = T>(): void }
    interface Derived extends Base<User> {}
  `);
  const select = models.find((model) => model.name === "select");
  assert.exists(select);

  const derived = models.find((model) => model.name === "Derived");
  assert.exists(derived);

  const user = models.find((model) => model.name === "User");
  assert.exists(user);

  const id = models.find((model) => model.name === "Id");
  assert.exists(id);

  expect(select.schema).toContainEqual(
    expect.objectContaining({
      typeParameters: [
        { name: "T", extends: "keyof User" },
        { name: "U", extends: "Id", default: "Id" },
      ],
    })
  );
  expect(derived.schema).toContainEqual(
    expect.objectContaining({
      typeParameters: [
        { name: "U", extends: "User" },
        { name: "V", extends: "Id", default: "Id" },
        { name: "D", extends: undefined, default: "User" },
      ],
      typeRefs: [user, id],
    })
  );
});

it("links function argument and return types to their models", () => {
  const models = parseModels(`
    type ResourceType = "tool" | "context" | "escalation";
    interface Handler {
      onAdd: (type: ResourceType) => void;
      onRemove: (id: string, type: ResourceType) => ResourceType;
    }
  `);

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
  const models = parseModels(`
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

  const unionKeyModel = models.find((m) => m.name === "UnionKey");
  const sampleAModel = models.find((m) => m.name === "SampleA");
  const sampleBModel = models.find((m) => m.name === "SampleB");

  const worksField = sampleAModel?.schema.find((field) => field.name === "Works");
  const functionField = sampleBModel?.schema.find((field) => field.name === "AlsoWorks");
  expect(models.length).toBe(7);

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
  assert.exists(functionField);
  assert(isFunctionSchemaField(functionField));
  expect(functionField.arguments[0]?.type).toEqual(expect.objectContaining({ name: "UnionKey" }));
});

it("preserves alias references for function return types on class properties", () => {
  const models = parseModels(`
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

  const unionKeyModel = models.find((m) => m.name === "UnionKey");
  const testModel = models.find((m) => m.name === "Test");
  assert.exists(unionKeyModel);
  assert.exists(testModel);

  const doThisField = testModel.schema.find((field) => field.name === "doThis");
  assert.exists(doThisField);
  assert(isFunctionSchemaField(doThisField));

  expect(doThisField.returnType).toEqual(expect.objectContaining({ name: "UnionKey" }));
  expect(testModel.dependencies).toEqual([expect.objectContaining({ name: "UnionKey" })]);
  expect(unionKeyModel.dependants).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Test" })])
  );
});

it("preserves alias references for nested promise and tuple return types", () => {
  const models = parseModels(`
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

  const handlerModel = models.find((m) => m.name === "Handler");
  const variantKindModel = models.find((m) => m.name === "VariantKind");

  expect(handlerModel?.dependencies).toEqual([expect.objectContaining({ name: "VariantKind" })]);

  const asyncField = handlerModel?.schema.find((field) => field.name === "doAsync");
  assert.exists(asyncField);
  assert(isFunctionSchemaField(asyncField));
  expect(asyncField.returnType).toBe("Promise<VariantKind>");

  const tupleField = handlerModel?.schema.find((field) => field.name === "doTuple");
  assert.exists(tupleField);
  assert(isFunctionSchemaField(tupleField));
  expect(tupleField.returnType).toBe("[VariantKind, number]");

  expect(variantKindModel?.dependants).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "Handler" })])
  );
});

it("prefers declared overload signatures for alias return types", () => {
  const models = parseModels(`
    type Option = "enabled" | "disabled";

    class Overloaded {
      compute(value: number): Option;
      compute(): Option;
      compute(value?: number) {
        return "enabled";
      }
    }
  `);

  const overloadedModel = models.find((m) => m.name === "Overloaded");

  const computeField = overloadedModel?.schema.find((field) => field.name === "compute");
  assert.exists(computeField);
  assert(isFunctionSchemaField(computeField));

  expect(computeField.returnType).toEqual(expect.objectContaining({ name: "Option" }));
  expect(overloadedModel?.dependencies).toEqual([expect.objectContaining({ name: "Option" })]);
});

it.each([
  ["interface Base<T>", "interface Child extends Base<User> {}"],
  ["declare class Base<T>", "declare class Child extends Base<User> {}"],
  ["type Base<T> =", "type Child = Base<User>;"],
])("specializes nested method and callback returns from %s", (declaration, consumer) => {
  const models = parseModels(`
    interface User { id: string }
    ${declaration} {
      callback: (value: T) => [T, number];
      method(value: T): Promise<T>;
      nested(): { value: T };
    }
    ${consumer}
  `);
  const user = models.find((model) => model.name === "User");
  assert.exists(user);

  const child = models.find((model) => model.name === "Child");
  assert.exists(child);

  const fields = child.schema.filter(isFunctionSchemaField);
  expect(fields.map(({ name, returnType }) => ({ name, returnType }))).toEqual([
    { name: "callback", returnType: "[User, number]" },
    { name: "method", returnType: "Promise<User>" },
    { name: "nested", returnType: "{ value: User; }" },
  ]);

  for (const field of fields) {
    expect(field.typeRefs).toEqual([user]);
  }
});

it("renders every overload signature instead of collapsing them", () => {
  const models = parseModels(`
    interface Converter {
      convert(s: string): number;
      convert(n: number): string;
    }
  `);

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

it("keeps optional methods as optional function fields", () => {
  const models = parseModels(`
    interface Hooks {
      onInit?(): void;
      onDone?: () => void;
    }
  `);

  expect(models[0]?.schema).toEqual([
    { name: "onDone", type: "function", arguments: [], returnType: "void", optional: true },
    { name: "onInit", type: "function", arguments: [], returnType: "void", optional: true },
  ]);
});

it("models a top-level function with its parameters and return type", () => {
  const models = parseModels(`
    interface Order { id: string }
    interface Receipt { total: number }
    type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
    type Failure = { kind: "declined" };
    export declare function charge(order: Order, amount: number): Result<Receipt, Failure>;
  `);

  const charge = models.find((m) => m.name === "charge");
  const order = models.find((m) => m.name === "Order");
  const receipt = models.find((m) => m.name === "Receipt");
  assert.exists(charge);
  assert.exists(order);
  assert.exists(receipt);

  expect(charge.type).toBe("function");
  expect(charge.schema).toHaveLength(1);

  const [row] = charge.schema;
  assert(isFunctionSchemaField(row));

  expect(row.name).toBe("");
  expect(row.arguments.map((argument) => argument.name)).toEqual(["order", "amount"]);
  expect(row.arguments[0].type).toBe(order);
  expect(row.arguments[1].type).toBe("number");
  expect(row.returnType).toBe("Result<Receipt, Failure>");
  expect(charge.dependencies.map((m) => m.name).sort()).toEqual(["Failure", "Order", "Receipt", "Result"]);
  expect(order.dependants.map((m) => m.name)).toContain("charge");
  expect(receipt.dependants.map((m) => m.name)).toContain("charge");
});

it("keeps generic parameters and constraints on each visible function overload", () => {
  const models = parseModels(`
    interface Item { id: string }
    interface Other { code: number }
    function choose<T extends Item = Item>(value: T): T;
    function choose<U extends Other = Other>(value: U): U;
    function choose(value: unknown): unknown { return value; }
  `);
  const choose = models.find((model) => model.name === "choose");
  assert.exists(choose);

  const item = models.find((model) => model.name === "Item");
  assert.exists(item);

  const other = models.find((model) => model.name === "Other");
  assert.exists(other);

  expect(choose.arguments).toEqual([]);
  expect(choose.schema).toEqual([
    {
      name: "",
      type: "function",
      optional: false,
      typeParameters: [{ name: "T", extends: "Item", default: "Item" }],
      arguments: [{ name: "value", type: "T" }],
      returnType: "T",
      typeRefs: [item],
    },
    {
      name: "",
      type: "function",
      optional: false,
      typeParameters: [{ name: "U", extends: "Other", default: "Other" }],
      arguments: [{ name: "value", type: "U" }],
      returnType: "U",
      typeRefs: [other],
    },
  ]);
  expect(choose.dependencies).toEqual([item, other]);
});

it("preserves optional, rest, and initialized parameters across callable rows", () => {
  const models = parseModels(`
    declare function send(value?: string, ...rest: number[]): void;
    function configured(value = "x"): void {}
    function required(value = "x", count: number): void {}
    interface Callable {
      (value?: string, ...rest: number[]): void;
      new (value?: string, ...rest: number[]): Callable;
    }
    interface Inherited extends Callable {}
    type Callback = (value?: string, ...rest: number[]) => void;
    interface Methods {
      send(value?: string, ...rest: number[]): void;
      callback: (value?: string, ...rest: number[]) => void;
    }
    class Console { log(value?: string, ...rest: number[]): void {} }
    class Configured { log(value = "x", count: number): void {} }
  `);

  for (const [name, type] of [
    ["send", "string"],
    ["Callable", "string"],
    ["Inherited", "string | undefined"],
    ["Callback", "string"],
    ["Methods", "string | undefined"],
    ["Console", "string | undefined"],
  ]) {
    const model = models.find((candidate) => candidate.name === name);
    assert.exists(model);
    expect(model.schema.length).toBeGreaterThan(0);

    for (const field of model.schema) {
      assert(isFunctionSchemaField(field));
      expect(field.arguments, name).toEqual([
        { name: "value", type, isOptional: true },
        { name: "rest", type: "number[]", isRest: true },
      ]);
    }
  }

  const configured = models.find((model) => model.name === "configured");
  assert.exists(configured);
  expect(configured.schema).toContainEqual(
    expect.objectContaining({
      arguments: [{ name: "value", type: "string", isOptional: true, initializer: '"x"' }],
    })
  );

  for (const name of ["required", "Configured"]) {
    const model = models.find((candidate) => candidate.name === name);
    assert.exists(model);

    expect(model.schema).toContainEqual(
      expect.objectContaining({
        arguments: [
          { name: "value", type: "string", initializer: '"x"' },
          { name: "count", type: "number" },
        ],
      })
    );
  }
});

it("substitutes inherited call signature constraints and defaults", () => {
  const models = parseModels(`
    interface Item { id: string }
    interface Provider<T> { <U extends T = T>(value: U): U }
    interface Concrete extends Provider<Item> {}
  `);
  const concrete = models.find((model) => model.name === "Concrete");
  assert.exists(concrete);

  expect(concrete.schema).toMatchObject([
    { typeParameters: [{ name: "U", extends: "Item", default: "Item" }] },
  ]);
});

it("preserves import-like literal text in a signature's generic default", () => {
  const [model] = parseModels(`declare function create<T = 'import("/source").Id'>(): T;`);

  expect(model.schema).toMatchObject([
    { typeParameters: [{ name: "T", default: `'import("/source").Id'` }] },
  ]);
});
