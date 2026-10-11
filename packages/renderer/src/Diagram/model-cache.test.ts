import { describe, expect, it } from "vitest";
import { parseModels } from "@tsdiagram/core";
import { reuseUnchangedModels } from "./model-cache";

const SOURCE = `
  interface User { id: string; name: string }
  interface Group { users: User[] }
  type Status = "active" | "done";
`;

describe("reuseUnchangedModels", () => {
  it.each([
    ["<T>(value: T): T", "<T = string>(value: T): T"],
    ["(value: string): void", "(value?: string): void"],
    ["(values: string[]): void", "(...values: string[]): void"],
  ])("replaces a callable when %s changes to %s", (before, after) => {
    const previous = parseModels(`declare function use${before};`);
    const next = parseModels(`declare function use${after};`);

    expect(reuseUnchangedModels(previous, next)[0]).toBe(next[0]);
  });

  it("replaces a function when only a parameter initializer changes", () => {
    const previous = parseModels('function run(value = "before"): void {}');
    const next = parseModels('function run(value = "after"): void {}');

    expect(reuseUnchangedModels(previous, next)[0]).toBe(next[0]);
  });

  it("returns the previous array identity when nothing changed", () => {
    const previous = parseModels(SOURCE);
    const next = parseModels(SOURCE);

    const reused = reuseUnchangedModels(previous, next);

    expect(reused).toBe(previous);
  });

  it("reuses unchanged models and replaces the changed one", () => {
    const previous = parseModels(SOURCE);
    const next = parseModels(SOURCE.replace('"active"', '"open"'));

    const reused = reuseUnchangedModels(previous, next);

    const previousUser = previous.find((m) => m.name === "User");
    const previousGroup = previous.find((m) => m.name === "Group");
    const previousStatus = previous.find((m) => m.name === "Status");
    if (!previousUser || !previousGroup || !previousStatus) throw new Error("Expected source models");
    expect(reused.find((m) => m.name === "User")).toBe(previousUser);
    expect(reused.find((m) => m.name === "Group")).toBe(previousGroup);
    const status = reused.find((m) => m.name === "Status");
    expect(status).not.toBe(previousStatus);
    expect(status?.schema).toContainEqual(
      expect.objectContaining({ type: "union", types: ['"open"', '"done"'] })
    );
  });

  it("does not reuse a model whose dependants changed", () => {
    const previous = parseModels(SOURCE);
    const next = parseModels(`${SOURCE}\ninterface Team { members: User[] }`);

    const reused = reuseUnchangedModels(previous, next);

    const previousUser = previous.find((m) => m.name === "User");
    const previousStatus = previous.find((m) => m.name === "Status");
    const user = reused.find((m) => m.name === "User");
    if (!previousUser || !previousStatus || !user) throw new Error("Expected source models");
    expect(user).not.toBe(previousUser);
    expect(reused.find((m) => m.name === "Status")).toBe(previousStatus);
  });

  it.each(["items: string[]", "run(): string[]", "callback: () => string[]"])(
    "replaces the model when readonly changes on %s",
    (member) => {
      const mutable = parseModels(`interface Example { ${member} }`);
      const immutable = parseModels(
        `interface Example { ${member.replace("string[]", "readonly string[]")} }`
      );

      expect(reuseUnchangedModels(mutable, immutable)[0]).toBe(immutable[0]);
      expect(reuseUnchangedModels(immutable, mutable)[0]).toBe(mutable[0]);
    }
  );

  it.each(["class", "interface"])("replaces a %s when a member changes between inherited and own", (kind) => {
    const source = `${kind} Base { value: string } ${kind} Child extends Base {}`;
    const inherited = parseModels(source);
    const own = parseModels(source.replace("extends Base {}", "extends Base { value: string }"));
    const inheritedChild = inherited.find((model) => model.name === "Child");
    const ownChild = own.find((model) => model.name === "Child");
    if (!inheritedChild || !ownChild) throw new Error("Expected Child models");

    expect(reuseUnchangedModels(inherited, own).find((model) => model.name === "Child")).toBe(ownChild);
    expect(reuseUnchangedModels(own, inherited).find((model) => model.name === "Child")).toBe(inheritedChild);
  });

  it.each(["get value(): number { return 0; }", "set value(next: number) {}"])(
    "replaces a model when %s changes between an accessor and a method",
    (member) => {
      const accessor = parseModels(`class Example { ${member} }`);
      const method = parseModels(`class Example { ${member.replace(/^(get|set) /, "")} }`);

      expect(reuseUnchangedModels(accessor, method)[0]).toBe(method[0]);
      expect(reuseUnchangedModels(method, accessor)[0]).toBe(accessor[0]);
    }
  );
});
