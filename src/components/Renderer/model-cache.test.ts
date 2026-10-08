import { describe, expect, it } from "vitest";
import { ModelParser } from "../../lib/parser/ModelParser";
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
  ])("replaces a function when its signature changes from %s to %s", (before, after) => {
    const previous = new ModelParser(`declare function run${before};`).getModels();
    const next = new ModelParser(`declare function run${after};`).getModels();

    expect(reuseUnchangedModels(previous, next)[0]).toBe(next[0]);
  });

  it("replaces a function when only a parameter initializer changes", () => {
    const previous = new ModelParser('function run(value = "before"): void {}').getModels();
    const next = new ModelParser('function run(value = "after"): void {}').getModels();

    expect(reuseUnchangedModels(previous, next)[0]).toBe(next[0]);
  });

  it("returns the previous array identity when nothing changed", () => {
    const previous = new ModelParser(SOURCE).getModels();
    const next = new ModelParser(SOURCE).getModels();

    const reused = reuseUnchangedModels(previous, next);

    expect(reused).toBe(previous);
  });

  it("reuses unchanged models and replaces the changed one", () => {
    const previous = new ModelParser(SOURCE).getModels();
    const next = new ModelParser(SOURCE.replace('"active"', '"open"')).getModels();

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
    const previous = new ModelParser(SOURCE).getModels();
    const next = new ModelParser(`${SOURCE}\ninterface Team { members: User[] }`).getModels();

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
      const mutable = new ModelParser(`interface Example { ${member} }`).getModels();
      const immutable = new ModelParser(
        `interface Example { ${member.replace("string[]", "readonly string[]")} }`
      ).getModels();

      expect(reuseUnchangedModels(mutable, immutable)[0]).toBe(immutable[0]);
      expect(reuseUnchangedModels(immutable, mutable)[0]).toBe(mutable[0]);
    }
  );

  it.each(["class", "interface"])("replaces a %s when a member changes between inherited and own", (kind) => {
    const source = `${kind} Base { value: string } ${kind} Child extends Base {}`;
    const inherited = new ModelParser(source).getModels();
    const own = new ModelParser(
      source.replace("extends Base {}", "extends Base { value: string }")
    ).getModels();
    const inheritedChild = inherited.find((model) => model.name === "Child");
    const ownChild = own.find((model) => model.name === "Child");
    if (!inheritedChild || !ownChild) throw new Error("Expected Child models");

    expect(reuseUnchangedModels(inherited, own).find((model) => model.name === "Child")).toBe(ownChild);
    expect(reuseUnchangedModels(own, inherited).find((model) => model.name === "Child")).toBe(inheritedChild);
  });

  it.each(["get value(): number { return 0; }", "set value(next: number) {}"])(
    "replaces a model when %s changes between an accessor and a method",
    (member) => {
      const accessor = new ModelParser(`class Example { ${member} }`).getModels();
      const method = new ModelParser(`class Example { ${member.replace(/^(get|set) /, "")} }`).getModels();

      expect(reuseUnchangedModels(accessor, method)[0]).toBe(method[0]);
      expect(reuseUnchangedModels(method, accessor)[0]).toBe(accessor[0]);
    }
  );
});
