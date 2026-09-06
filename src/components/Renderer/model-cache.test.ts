import { describe, expect, it } from "vitest";
import { ModelParser } from "../../lib/parser/ModelParser";
import { reuseUnchangedModels } from "./model-cache";

const SOURCE = `
  interface User { id: string; name: string }
  interface Group { users: User[] }
  type Status = "active" | "done";
`;

describe("reuseUnchangedModels", () => {
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
      expect.objectContaining({ type: "union", types: ['"open"', '"done"'] }),
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
});
