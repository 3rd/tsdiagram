import { ts } from "ts-morph";
import {
  isArraySchemaField,
  isFunctionSchemaField,
  isGenericSchemaField,
  isUnionSchemaField,
  type Model,
  type SchemaField,
  type TypeTextSegment,
} from "./model";

const SUBSTITUTION_START = "${";
const SUBSTITUTION_END = "}";

const classifyTypeText = (text: string) => {
  const prefix = "type Display = ";
  const source = ts.createSourceFile("display.ts", `${prefix}${text}`, ts.ScriptTarget.Latest);
  const segments: TypeTextSegment[] = [];
  let cursor = 0;

  const addSegment = (start: number, end: number, kind: TypeTextSegment["kind"]) => {
    if (start >= end) return;

    if (cursor < start) {
      segments.push({ text: text.slice(cursor, start), kind: "default" });
    }

    segments.push({ text: text.slice(start, end), kind });
    cursor = end;
  };

  const addReference = (name: ts.EntityName) => {
    if (ts.isQualifiedName(name)) {
      addReference(name.left);
      addReference(name.right);
    } else {
      addSegment(name.getStart(source) - prefix.length, name.end - prefix.length, "reference");
    }
  };

  const visitNode = (node: ts.Node) => {
    const start = node.getStart(source) - prefix.length;
    const end = node.end - prefix.length;

    switch (node.kind) {
      case ts.SyntaxKind.StringKeyword:
      case ts.SyntaxKind.NumberKeyword:
      case ts.SyntaxKind.BooleanKeyword:
      case ts.SyntaxKind.BigIntKeyword:
      case ts.SyntaxKind.SymbolKeyword:
      case ts.SyntaxKind.ObjectKeyword: {
        addSegment(start, end, "primitive");
        return;
      }
    }

    if (ts.isLiteralTypeNode(node)) {
      if (node.literal.kind !== ts.SyntaxKind.NullKeyword) {
        addSegment(start, end, "literal");
      }

      return;
    }

    if (ts.isTypeReferenceNode(node)) {
      addReference(node.typeName);
      node.typeArguments?.forEach(visitNode);
      return;
    }

    if (ts.isTypeQueryNode(node)) {
      addReference(node.exprName);
      node.typeArguments?.forEach(visitNode);
      return;
    }

    if (ts.isImportTypeNode(node)) {
      visitNode(node.argument);

      if (node.qualifier) {
        addReference(node.qualifier);
      }

      node.typeArguments?.forEach(visitNode);
      return;
    }

    if (ts.isTemplateLiteralTypeNode(node)) {
      addSegment(start, node.head.end - prefix.length - SUBSTITUTION_START.length, "literal");

      for (const span of node.templateSpans) {
        visitNode(span.type);

        const literalStart = span.literal.getStart(source) - prefix.length + SUBSTITUTION_END.length;
        const literalEnd = span.literal.end - prefix.length;
        const isTail = span.literal.kind === ts.SyntaxKind.TemplateTail;
        addSegment(literalStart, isTail ? literalEnd : literalEnd - SUBSTITUTION_START.length, "literal");
      }

      return;
    }

    ts.forEachChild(node, visitNode);
  };

  for (const statement of source.statements) {
    if (!ts.isTypeAliasDeclaration(statement)) continue;

    visitNode(statement.type);
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), kind: "default" });
  }

  return segments;
};

export const collectTypeTextSegments = (fields: SchemaField[]) => {
  const texts = new Set<string>();

  const addValue = (value: Model | string) => {
    if (typeof value !== "string") return;

    texts.add(value);
  };

  for (const field of fields) {
    if (isArraySchemaField(field)) {
      addValue(field.elementType);
    } else if (isGenericSchemaField(field)) {
      addValue(field.genericName);
      field.arguments.forEach(addValue);
    } else if (isFunctionSchemaField(field)) {
      field.arguments.forEach((argument) => addValue(argument.type));
      addValue(Array.isArray(field.returnType) ? field.returnType[0] : field.returnType);
    } else if (isUnionSchemaField(field)) {
      field.types.forEach(addValue);
    } else {
      addValue(field.type);
    }
  }

  return Object.fromEntries([...texts].map((text) => [text, classifyTypeText(text)]));
};
