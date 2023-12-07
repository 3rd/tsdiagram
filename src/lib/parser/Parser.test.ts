import { expect, it } from "vitest";
import { SyntaxKind } from "typescript";
import { Parser } from "./Parser";

it("parses code into AST", () => {
  const parser = new Parser("const a = 1;");
  const identifierNodes = parser.getNodes(SyntaxKind.Identifier);

  expect(identifierNodes.length).toBe(1);
  expect(identifierNodes[0].getText()).toBe("a");
});

it("updates AST when code changes", () => {
  const parser = new Parser("const a = 1;");
  parser.setSource("const b = 2;");
  const identifierNodes = parser.getNodes(SyntaxKind.Identifier);

  expect(identifierNodes.length).toBe(1);
  expect(identifierNodes[0].getText()).toBe("b");
});

it("retrieves the top-level nodes", () => {
  const parser = new Parser("const a = 1; export const b = 2;");
  const topLevelNodes = parser.getTopLevelNodes();

  expect(topLevelNodes.length).toBe(2);
  expect(topLevelNodes[0].getText()).toBe("const a = 1;");
  expect(topLevelNodes[1].getText()).toBe("export const b = 2;");
});
