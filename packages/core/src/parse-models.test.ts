import { assert, expect, it } from "vitest";
import { parseModels } from "./index";

it("keeps each parse's declarations and graph references isolated", () => {
  const first = parseModels("interface Entry { next: Entry; value: string }");
  const second = parseModels("interface Entry { value: number }");
  const [firstEntry] = first;
  const [secondEntry] = second;

  expect(firstEntry.schema).toEqual([
    { name: "next", type: firstEntry, optional: false },
    { name: "value", type: "string", optional: false },
  ]);
  expect(firstEntry.dependencies).toEqual([firstEntry]);
  expect(firstEntry.dependants).toEqual([firstEntry]);
  expect(secondEntry.schema).toEqual([{ name: "value", type: "number", optional: false }]);
  expect(secondEntry.dependencies).toEqual([]);
  expect(secondEntry.dependants).toEqual([]);
});

it("projects a class's implicit constructor through a typeof alias", () => {
  const models = parseModels("class Item { id: string } type Factory = typeof Item;");
  const item = models.find((model) => model.name === "Item");
  const factory = models.find((model) => model.name === "Factory");
  assert.exists(item);
  assert.exists(factory);

  expect(factory.schema).toContainEqual({
    name: "new",
    type: "function",
    arguments: [],
    returnType: item,
    optional: false,
  });
  expect(factory.dependencies).toContain(item);
});

it("keeps incomplete editor declarations available without rejecting diagnostics", () => {
  const [model] = parseModels("interface Draft { value: MissingType; next:");
  assert.exists(model);

  expect(model.name).toBe("Draft");
  expect(model.schema).toContainEqual({ name: "value", type: "MissingType", optional: false });
});
