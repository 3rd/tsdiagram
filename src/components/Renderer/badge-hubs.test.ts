import { describe, expect, it } from "vitest";
import { ModelParser } from "../../lib/parser/ModelParser";
import { computeBadgeHubIds, EMPTY_BADGE_HUB_IDS } from "./badge-hubs";

const consumersOf = (typeName: string, count: number) =>
  Array.from({ length: count }, (_, i) => `interface Consumer${i} { ref: ${typeName} }`).join("\n");

describe("computeBadgeHubIds", () => {
  it("badges a simple leaf alias at the enter threshold", () => {
    const models = new ModelParser(`type Id = string;\n${consumersOf("Id", 6)}`).getModels();
    const badgeHubIds = computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS);
    expect([...badgeHubIds]).toEqual(["Id"]);
  });

  it("does not badge below the enter threshold", () => {
    const models = new ModelParser(`type Id = string;\n${consumersOf("Id", 5)}`).getModels();
    expect(computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS).size).toBe(0);
  });

  it("keeps an existing badge between exit and enter thresholds (hysteresis)", () => {
    const source = `type Id = string;\n${consumersOf("Id", 4)}`;
    const models = new ModelParser(source).getModels();
    // 4 consumers: below enter (6) but at exit (4)
    expect(computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS).size).toBe(0);
    expect([...computeBadgeHubIds(models, new Set(["Id"]))]).toEqual(["Id"]);
  });

  it("drops a badge below the exit threshold", () => {
    const models = new ModelParser(`type Id = string;\n${consumersOf("Id", 3)}`).getModels();
    expect(computeBadgeHubIds(models, new Set(["Id"])).size).toBe(0);
  });

  it("never badges aliases whose schema references models", () => {
    const source = `interface Other { x: string }\ntype Wrap = { a: Other };\n${consumersOf("Wrap", 8)}`;
    const models = new ModelParser(source).getModels();
    expect(computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS).size).toBe(0);
  });

  it("never badges structured aliases that contain only primitive fields", () => {
    const source = `
      type Address = { street: string; city: string; zip: string; active: boolean };
      ${consumersOf("Address", 8)}
    `;
    const models = new ModelParser(source).getModels();
    expect(computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS).size).toBe(0);
  });

  it("never badges aliases whose relationships render only as text", () => {
    const anonymousUnionConsumers = Array.from(
      { length: 6 },
      (_, i) => `type Consumer${i} = { ref: Id } | { empty: true }`,
    ).join("\n");
    const models = new ModelParser(`type Id = string;\n${anonymousUnionConsumers}`).getModels();
    expect(computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS).size).toBe(0);
  });

  it("never badges aliases nested inside generic field text", () => {
    const consumers = Array.from(
      { length: 6 },
      (_, i) => `interface Consumer${i} { ref: Promise<Array<Id>> }`,
    ).join("\n");
    const models = new ModelParser(`type Id = string;\n${consumers}`).getModels();
    expect(computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS).size).toBe(0);
  });

  it("never badges aliases referenced through extends text", () => {
    const consumers = Array.from({ length: 6 }, (_, i) => `interface Consumer${i} extends Empty {}`).join(
      "\n",
    );
    const models = new ModelParser(`type Empty = {};\n${consumers}`).getModels();
    expect(computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS).size).toBe(0);
  });

  it("never badges interfaces regardless of fan-in", () => {
    const source = `interface Id { value: string }\n${consumersOf("Id", 8)}`;
    const models = new ModelParser(source).getModels();
    expect(computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS).size).toBe(0);
  });

  it("returns the previous set identity when the classification is unchanged", () => {
    const models = new ModelParser(`type Id = string;\n${consumersOf("Id", 6)}`).getModels();
    const first = computeBadgeHubIds(models, EMPTY_BADGE_HUB_IDS);
    const second = computeBadgeHubIds(models, first);
    expect(second).toBe(first);
  });
});
