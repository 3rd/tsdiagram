import { assert, expect, it } from "vitest";
import { parseModels } from "./index";
import { isDefaultSchemaField } from "./model";

it("narrows default schema fields only", () => {
  const source =
    "interface A { x: string }\ninterface B { y: string }\ntype U = A | B;\ninterface C { fn(): string; plain: string }";
  const models = parseModels(source);
  const unionField = models.find((model) => model.name === "U")?.schema[0];
  const c = models.find((model) => model.name === "C");
  const fnField = c?.schema.find((field) => field.name === "fn");
  const plainField = c?.schema.find((field) => field.name === "plain");
  assert.exists(unionField);
  assert.exists(fnField);
  assert.exists(plainField);

  expect(isDefaultSchemaField(unionField)).toBe(false);
  expect(isDefaultSchemaField(fnField)).toBe(false);
  expect(isDefaultSchemaField(plainField)).toBe(true);
});
