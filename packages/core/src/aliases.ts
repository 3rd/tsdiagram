import { Node, ts, type Type, type TypeNode } from "ts-morph";
import type { AliasRecord } from "./declarations";
import { projectMembers } from "./members";
import { projectObjectCalls, projectObjectIndexes } from "./object-signatures";
import type { DisplayValue, ModelReference, ProjectedField } from "./projection";
import { trimSourcePath } from "./references";
import type { CompilerProjectionContext } from "./type-display";

const collectDeclaredUnionTypes = (node: TypeNode) => {
  const pending = [node];
  const types: Type[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    if (Node.isParenthesizedTypeNode(current)) {
      pending.push(current.getTypeNode());
    } else if (Node.isUnionTypeNode(current)) {
      pending.push(...current.getTypeNodes().reverse());
    } else {
      const type = current.getType();
      types.push(...(type.isUnion() ? type.getUnionTypes() : [type]));
    }
  }

  return types;
};

const orderUnionMembers = (type: Type, node: TypeNode | undefined) => {
  const members = type.getUnionTypes();
  if (!node) return members;

  const indexByType = new Map(members.map((member, index) => [member.compilerType, index]));
  const declaredOrder = new Set<number>();

  for (const declared of collectDeclaredUnionTypes(node)) {
    const index = indexByType.get(declared.compilerType);
    if (index === undefined) continue;

    declaredOrder.add(index);
  }

  if (declaredOrder.size !== members.length) return members;

  return [...declaredOrder].map((index) => members[index]);
};

const isPrimitiveLikeType = (type: Type) =>
  type.isString() ||
  type.isNumber() ||
  type.isBoolean() ||
  type.isBigInt() ||
  type.isStringLiteral() ||
  type.isNumberLiteral();

const shouldDisplayAliasText = (type: Type, context: CompilerProjectionContext) => {
  const declarations = type.getSymbol()?.getDeclarations() ?? [];
  const isLibraryObject =
    declarations.some(Node.isInterfaceDeclaration) &&
    declarations.every((declaration) => declaration.getSourceFile() !== context.compiler.sourceFile);

  return (
    isLibraryObject ||
    type.isNumber() ||
    type.isString() ||
    type.isBoolean() ||
    type.isBigInt() ||
    type.isVoid() ||
    (type.getFlags() & (ts.TypeFlags.ESSymbolLike | ts.TypeFlags.NonPrimitive)) !== 0 ||
    type.isUndefined() ||
    type.isNull() ||
    type.isAny() ||
    type.isUnknown() ||
    type.isNever() ||
    type.isEnum() ||
    type.isEnumLiteral() ||
    type.isLiteral() ||
    type.isTemplateLiteral()
  );
};

export const projectAlias = (owner: AliasRecord, context: CompilerProjectionContext) => {
  const type = owner.declaration.getType();
  const node = owner.declaration.getTypeNode();
  const references = new Set<ModelReference>();

  for (const constituent of type.getIntersectionTypes()) {
    const text = constituent.getAliasSymbol()?.getName() ?? trimSourcePath(constituent.getText());
    const direct = context.references.resolveExact({ text, type: constituent, owner });
    const constituentReferences = direct
      ? [direct]
      : context.references.collectTypeReferences({ type: constituent, owner });

    for (const reference of constituentReferences) {
      references.add(reference);
    }
  }

  for (const reference of context.references.collectQueryReferences({ node, owner })) {
    references.add(reference);
  }

  if (Node.isIndexedAccessTypeNode(node)) {
    const object = node.getObjectTypeNode();
    const reference = context.references.resolveExact({
      text: object.getText(),
      type: object.getType(),
      owner,
    });
    if (reference) {
      references.add(reference);
    }
  }

  const isTextAlias =
    Node.isConditionalTypeNode(node) ||
    type.isTuple() ||
    (type.isIntersection() && type.getIntersectionTypes().some(isPrimitiveLikeType)) ||
    shouldDisplayAliasText(type, context);
  if (isTextAlias) {
    for (const reference of context.references.collectNodeReferences({ node, owner })) {
      references.add(reference);
    }

    const text =
      node?.getText() ?? trimSourcePath(type.getText(owner.declaration, ts.TypeFormatFlags.InTypeAlias));
    const fields: ProjectedField[] = [{ name: "==>", type: text, optional: false }];
    return { fields, references: [...references] };
  }

  if (type.isUnion()) {
    const values: DisplayValue[] = [];

    for (const member of orderUnionMembers(type, node)) {
      const text = trimSourcePath(member.getText());
      const reference = context.references.resolveExact({ text, type: member, owner });
      values.push(reference ?? text);

      if (reference) {
        references.add(reference);
      }
    }

    for (const referenceNode of node?.getDescendantsOfKind(ts.SyntaxKind.TypeReference) ?? []) {
      const reference = context.references.resolveNested({
        text: referenceNode.getText(),
        type: referenceNode.getType(),
        owner,
      });
      if (!reference) continue;

      references.add(reference);
    }

    const fields: ProjectedField[] = [{ name: "==>", type: "union", types: values, optional: false }];
    return { fields, references: [...references] };
  }

  const calls = projectObjectCalls(owner, context);
  const members = projectMembers(owner, context);
  const indexes = projectObjectIndexes(owner, context);

  for (const reference of [...calls.references, ...members.references, ...indexes.references]) {
    references.add(reference);
  }

  return {
    fields: [...calls.fields, ...members.fields, ...indexes.fields],
    references: [...references],
  };
};
