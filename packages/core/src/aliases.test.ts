import { assert, expect, it } from "vitest";
import { parseModels } from "./index";

it("renders branded primitives as declared types and retains their dependencies", () => {
  const models = parseModels(`
    declare const brand: unique symbol;
    type Brand<T, Name extends string> = T & { readonly [brand]: Name };
    type EmployeeId = Brand<string, "EmployeeId">;
    type Count = number & { readonly __unit: "count" };
    interface Employee { id: EmployeeId; head: Count }
  `);
  const employeeId = models.find((model) => model.name === "EmployeeId");
  const count = models.find((model) => model.name === "Count");
  const employee = models.find((model) => model.name === "Employee");
  assert.exists(employeeId);
  assert.exists(count);
  assert.exists(employee);

  expect(employeeId.schema).toEqual([{ name: "==>", type: 'Brand<string, "EmployeeId">', optional: false }]);
  expect(count.schema).toEqual([
    { name: "==>", type: 'number & { readonly __unit: "count" }', optional: false },
  ]);
  expect(employee.schema.map((field) => field.name)).toEqual(["id", "head"]);
  expect(employee.dependencies).toEqual([employeeId, count]);
});

it.each([`number & { readonly __brand: 'import("/source").Id' }`, `['import("/source").Id']`])(
  "preserves import-like literal text in %s",
  (declaredType) => {
    const [model] = parseModels(`type Id = ${declaredType};`);

    expect(model.schema).toEqual([{ name: "==>", type: declaredType, optional: false }]);
  }
);

it("supports type aliases with kind != TypeLiteral", () => {
  const models = parseModels(`
    type A = string;
    type B = { field: A };
    type C = { field: Record<A, A> };
  `);

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

it("preserves declared alias union order and resolved model references", () => {
  const models = parseModels(`
    interface User { id: string }
    interface Admin { id: string }
    type Actor = User | Admin | null | undefined;
    interface Holder { actor: User | Admin | null | undefined }
  `);
  const user = models.find((model) => model.name === "User");
  const admin = models.find((model) => model.name === "Admin");
  const actor = models.find((model) => model.name === "Actor");
  const holder = models.find((model) => model.name === "Holder");
  assert.exists(user);
  assert.exists(admin);
  assert.exists(actor);
  assert.exists(holder);

  expect(actor.schema).toEqual([
    { name: "==>", type: "union", types: [user, admin, "null", "undefined"], optional: false },
  ]);
  expect(actor.dependencies).toEqual([user, admin]);
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
  const models = parseModels(`
    interface User { id: string }
    interface Admin { id: string }
    type Pair = User | Admin;
    type Indirect = Pair | null;
    type Result = ${expression};
  `);
  const field = models.find((model) => model.name === "Result")?.schema[0];
  assert.exists(field);
  assert("types" in field);

  expect(field.types.map((type) => (typeof type === "string" ? type : type.name))).toEqual(expectedNames);
});

it("retains distinct alias union members with identical rendered text", () => {
  const [model] = parseModels(`
    type Result = { value: string } | { value: string } | null;
  `);

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
  const models = parseModels(`
    type AgentResourceType = "tool" | "context" | "escalation";
    type AgentFlowProps = {
      onAddResource: (type: AgentResourceType) => void;
    };
  `);

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

it("renders tuple aliases as their type text instead of Array members", () => {
  const models = parseModels(`
    interface User { id: string }
    type Pair = [User, number];
  `);

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
    "Date",
  ];
  const models = parseModels(types.map((type, index) => `type BuiltIn${index} = ${type};`).join("\n"));

  expect(models).toHaveLength(types.length);
  for (const [index, model] of models.entries()) {
    expect(model.schema).toEqual([{ name: "==>", type: types[index], optional: false }]);
    expect(model.dependencies).toEqual([]);
  }
});

it("preserves declared dependencies inside built-in object aliases", () => {
  const types = ["User[]", "readonly User[]", "Map<string, Promise<User>>"];
  const models = parseModels(`
    interface User { id: string }
    ${types.map((type, index) => `type Users${index} = ${type};`).join("\n")}
    type List<T> = ReadonlyArray<T>;
  `);
  const user = models.find((model) => model.name === "User");
  assert.exists(user);

  for (const [index, type] of types.entries()) {
    const alias = models.find((model) => model.name === `Users${index}`);
    assert.exists(alias);
    expect(alias.schema).toEqual([{ name: "==>", type, optional: false }]);
    expect(alias.dependencies).toEqual([user]);
  }
  const list = models.find((model) => model.name === "List");
  assert.exists(list);
  expect(list.schema).toEqual([{ name: "==>", type: "ReadonlyArray<T>", optional: false }]);
  expect(list.dependencies).toEqual([]);
});

it("renders template literal aliases as their type text instead of String members", () => {
  const models = parseModels("type EventName = `on${string}`;");

  expect(models[0]?.schema).toEqual([{ name: "==>", type: "`on${string}`", optional: false }]);
});

it.each(["bigint", "symbol", "object", "void"])("renders a %s alias as declared type text", (type) => {
  const [model] = parseModels(`type Value = ${type};`);

  expect(model.schema).toEqual([{ name: "==>", type, optional: false }]);
  expect(model.dependencies).toEqual([]);
});

it("renders generic conditional aliases as their declared expression", () => {
  const models = parseModels(`
    interface Success { ok: true }
    type Result<T> = T extends Error ? never : Success;
  `);

  const result = models.find((m) => m.name === "Result");

  expect(result?.schema).toEqual([
    { name: "==>", type: "T extends Error ? never : Success", optional: false },
  ]);
  expect(result?.dependencies).toEqual([expect.objectContaining({ name: "Success" })]);
});

it("preserves property rows and optionality for mapped utility aliases", () => {
  const models = parseModels(`
    interface User { id: string; age: number }
    type PartialUser = Partial<User>;
    type UserFlags = { [K in keyof User]?: boolean };
    type PickedUser = Pick<User, "id">;
    type OmittedUser = Omit<User, "age">;
    type ReadonlyUser = Readonly<User>;
  `);

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
    assert.exists(model);
    expect(model.schema).toEqual([{ name: "id", type: "string", optional: false }]);
  }
  const readonlyUser = models.find((model) => model.name === "ReadonlyUser");
  assert.exists(readonlyUser);
  expect(readonlyUser.schema).toEqual([
    { name: "id", type: "string", optional: false, modifiers: ["readonly"] },
    { name: "age", type: "number", optional: false, modifiers: ["readonly"] },
  ]);
});
