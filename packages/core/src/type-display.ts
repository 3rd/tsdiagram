import { Node, type Type, type TypeNode } from "ts-morph";
import type { CompilerContext } from "./compiler-context";
import type { DeclarationRecord } from "./declarations";
import { trimSourcePath, type ReferenceResolver } from "./references";
import { bindTypeArguments, projectBoundType, type TypeBindings } from "./type-parameters";

export type ProjectionContext = {
  owner: DeclarationRecord;
  references: ReferenceResolver;
  typeBindings: TypeBindings;
};

export type CompilerProjectionContext = ProjectionContext & { compiler: CompilerContext };

type DisplayQuery = ProjectionContext & {
  text: string;
  type: Type;
  node?: TypeNode;
  typeParameterNames?: ReadonlySet<string>;
  shouldInspectCompilerType?: boolean;
};

type ArrayElementNode = { node: TypeNode; typeBindings: TypeBindings } | undefined;

export const getArrayElementNode = (
  node: TypeNode | undefined,
  context: ProjectionContext,
  visited = new Set<Node>()
): ArrayElementNode => {
  if (!node) return;
  if (visited.has(node)) return;

  visited.add(node);

  const hasWrappedType = Node.isParenthesizedTypeNode(node) || Node.isTypeOperatorTypeNode(node);
  if (hasWrappedType) {
    return getArrayElementNode(node.getTypeNode(), context, visited);
  }

  if (Node.isArrayTypeNode(node)) {
    let element = node.getElementTypeNode();

    while (Node.isParenthesizedTypeNode(element)) {
      element = element.getTypeNode();
    }

    return { node: element, typeBindings: context.typeBindings };
  }

  if (!Node.isTypeReference(node)) return;

  const symbol = node.getTypeName().getSymbol();
  const isArrayReference =
    symbol !== undefined &&
    (symbol.getName() === "Array" || symbol.getName() === "ReadonlyArray") &&
    symbol === node.getType().getSymbol();
  if (isArrayReference) {
    const element = node.getTypeArguments()[0];
    return element ? { node: element, typeBindings: context.typeBindings } : undefined;
  }

  const argument = symbol ? context.typeBindings.get(symbol.compilerSymbol) : undefined;
  if (argument) return getArrayElementNode(argument, context, visited);

  for (const instance of bindTypeArguments(node, context.typeBindings)) {
    if (!Node.isTypeAliasDeclaration(instance.declaration)) continue;

    const element = getArrayElementNode(
      instance.declaration.getTypeNode(),
      { ...context, typeBindings: instance.bindings },
      visited
    );
    if (element) return element;
  }
};

export const getEffectiveTypeNode = (node: TypeNode | undefined, type: Type, context: ProjectionContext) => {
  const isEffectiveNode =
    node?.getType().compilerType === type.compilerType || projectBoundType(node, context) !== undefined;
  if (isEffectiveNode) return node;
};

export const projectTypeDisplay = ({
  text,
  type,
  node,
  owner,
  references,
  typeBindings,
  typeParameterNames,
  shouldInspectCompilerType = false,
}: DisplayQuery) => {
  const bound = projectBoundType(node, { owner, references, typeBindings });
  const displayText = trimSourcePath(bound?.text ?? text);
  const query = { text: displayText, type, node, owner, typeParameterNames };

  const reference = references.resolveExact(query);
  if (reference) {
    return {
      value: reference,
      references: [reference],
      nestedReferences: [],
    };
  }

  const nestedReferences = new Set([...references.collectReferences(query), ...(bound?.references ?? [])]);

  const needsCompilerReferences = shouldInspectCompilerType && !node;
  if (needsCompilerReferences) {
    for (const nested of references.collectCompilerReferences({
      type: type.compilerType,
      owner,
      typeParameterNames,
    })) {
      nestedReferences.add(nested);
    }
  }

  return {
    value: displayText,
    references: [...nestedReferences],
    nestedReferences: [...nestedReferences],
  };
};
