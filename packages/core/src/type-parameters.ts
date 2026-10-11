import {
  Node,
  ts,
  type ClassDeclaration,
  type ExpressionWithTypeArguments,
  type InterfaceDeclaration,
  type Signature,
  type Type,
  type TypeNode,
  type TypeParameterDeclaration,
} from "ts-morph";
import { cleanName, type DeclarationRecord } from "./declarations";
import type { ModelTypeParameter } from "./model";
import type { ModelReference } from "./projection";
import { trimSourcePath } from "./references";
import type { ProjectionContext } from "./type-display";

export type TypeBindings = ReadonlyMap<ts.Symbol, TypeNode>;
type GenericReference = TypeNode | ExpressionWithTypeArguments;

type TypeBindingQuery = {
  owner: DeclarationRecord;
  memberName?: string;
  memberTypeNode?: TypeNode;
  memberBindings?: TypeBindings;
};

type SignatureBindingQuery = {
  signatures: Signature[];
  context: ProjectionContext;
  memberName?: string;
  memberTypeNode?: TypeNode;
};

export const bindTypeArguments = (node: GenericReference, inherited: TypeBindings) => {
  if (!Node.isTypeReference(node) && !Node.isExpressionWithTypeArguments(node)) return [];

  const name = Node.isTypeReference(node) ? node.getTypeName() : node.getExpression();
  return (name.getSymbol()?.getDeclarations() ?? []).flatMap((declaration) => {
    const canDeclareTypeParameters =
      Node.isTypeAliasDeclaration(declaration) ||
      Node.isInterfaceDeclaration(declaration) ||
      Node.isClassDeclaration(declaration);
    if (!canDeclareTypeParameters) return [];

    const bindings = new Map(inherited);

    for (const [index, parameter] of declaration.getTypeParameters().entries()) {
      const symbol = parameter.getSymbol();
      const argument = node.getTypeArguments()[index] ?? parameter.getDefault();
      if (!symbol || !argument) continue;

      const argumentSymbol = Node.isTypeReference(argument) ? argument.getTypeName().getSymbol() : undefined;
      const bound = argumentSymbol ? bindings.get(argumentSymbol.compilerSymbol) : undefined;
      bindings.set(symbol.compilerSymbol, bound ?? argument);
    }

    return [{ declaration, bindings }];
  });
};

export const getDeclaredBases = (declaration: ClassDeclaration | InterfaceDeclaration) => {
  if (Node.isClassDeclaration(declaration)) {
    const base = declaration.getExtends();
    return base ? [base] : [];
  }

  return declaration.getExtends();
};

export const resolveBoundTypeNode = (node: TypeNode, bindings: TypeBindings) => {
  const visited = new Set<TypeNode>();

  while (!visited.has(node)) {
    visited.add(node);

    if (Node.isParenthesizedTypeNode(node)) {
      node = node.getTypeNode();
      continue;
    }

    const symbol = Node.isTypeReference(node) ? node.getTypeName().getSymbol() : undefined;
    const argument = symbol ? bindings.get(symbol.compilerSymbol) : undefined;
    if (!argument) return node;

    node = argument;
  }

  return node;
};

const collectTypeBindingPaths = ({ owner, memberName, memberTypeNode, memberBindings }: TypeBindingQuery) => {
  const paths: ReturnType<typeof bindTypeArguments> = [];
  const pending: {
    node: GenericReference;
    bindings: TypeBindings;
    visited: ReadonlySet<Node>;
    memberName?: string;
  }[] = [];
  const initial = { bindings: new Map<ts.Symbol, TypeNode>(), visited: new Set<Node>(), memberName };

  if (memberTypeNode) {
    pending.push({
      node: memberTypeNode,
      bindings: memberBindings ?? initial.bindings,
      visited: initial.visited,
    });
  }

  if (owner.kind === "typeAlias") {
    paths.push({ declaration: owner.declaration, bindings: initial.bindings });
    const node = owner.declaration.getTypeNode();
    if (node) {
      pending.push({ node, ...initial });
    }
  } else if (owner.kind === "class" || owner.kind === "interface") {
    const declarations =
      owner.kind === "class" ? [owner.declaration, ...owner.interfaces] : owner.declarations;

    paths.push(...declarations.map((declaration) => ({ declaration, bindings: initial.bindings })));

    for (const declaration of [...declarations].reverse()) {
      pending.push(...[...getDeclaredBases(declaration)].reverse().map((node) => ({ node, ...initial })));
    }
  }

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    const node = Node.isExpressionWithTypeArguments(current.node)
      ? current.node
      : resolveBoundTypeNode(current.node, current.bindings);
    if (current.visited.has(node)) continue;

    const visited = new Set(current.visited);
    visited.add(node);

    const hasOtherMembers =
      current.memberName !== undefined &&
      node.getType().getProperties().length > 0 &&
      !node.getType().getProperty(current.memberName);
    if (hasOtherMembers) continue;

    if (Node.isIntersectionTypeNode(node)) {
      pending.push(
        ...node
          .getTypeNodes()
          .reverse()
          .map((part) => ({ ...current, node: part, visited }))
      );
      continue;
    }

    const mappedValue = Node.isMappedTypeNode(node) ? node.getTypeNode() : undefined;
    if (Node.isIndexedAccessTypeNode(mappedValue)) {
      pending.push({ ...current, node: mappedValue.getObjectTypeNode(), visited });
    }

    const instances = bindTypeArguments(node, current.bindings);
    paths.push(...instances);

    for (const instance of instances.reverse()) {
      const declaration = instance.declaration;

      if (Node.isTypeAliasDeclaration(declaration)) {
        const type = declaration.getTypeNode();
        if (type) {
          pending.push({ ...current, node: type, bindings: instance.bindings, visited });
        }
      } else {
        pending.push(
          ...[...getDeclaredBases(declaration)]
            .reverse()
            .map((base) => ({ ...current, node: base, bindings: instance.bindings, visited }))
        );
      }
    }
  }

  return paths;
};

export const collectTypeBindings = (owner: DeclarationRecord, memberName?: string) =>
  new Map(
    collectTypeBindingPaths({ owner, memberName })
      .reverse()
      .flatMap((path) => [...path.bindings])
  );

const deduplicateTypeBindingPaths = (paths: ReturnType<typeof collectTypeBindingPaths>) => {
  const typeArguments = paths.map((path) =>
    path.declaration.getTypeParameters().map((parameter) => {
      const symbol = parameter.getSymbol();
      const argument = symbol ? path.bindings.get(symbol.compilerSymbol) : undefined;
      return argument
        ? resolveBoundTypeNode(argument, path.bindings).getType().compilerType
        : parameter.getType().compilerType;
    })
  );

  return paths.filter((_, index) => {
    const argumentsForPath = typeArguments[index];
    const hasEarlierInstantiation = typeArguments
      .slice(0, index)
      .some((earlier) => earlier.every((argument, position) => argument === argumentsForPath[position]));
    return !hasEarlierInstantiation;
  });
};

export const bindSignatureTypeArguments = ({
  signatures,
  context,
  memberName,
  memberTypeNode,
}: SignatureBindingQuery) => {
  const paths = collectTypeBindingPaths({
    owner: context.owner,
    memberName,
    memberTypeNode,
    memberBindings: context.typeBindings,
  });
  const occurrences = new Map<Node, number>();
  const declarations = signatures.map((signature) =>
    signature.compilerSignature.declaration ? signature.getDeclaration() : undefined
  );

  return signatures.map((signature, index) => {
    const declaration = declarations[index];
    const signatureOwner = declaration?.getFirstAncestor(
      (node) =>
        Node.isTypeAliasDeclaration(node) ||
        Node.isInterfaceDeclaration(node) ||
        Node.isClassDeclaration(node)
    );
    const hasDeclaringOwner = declaration !== undefined && signatureOwner !== undefined;
    if (!hasDeclaringOwner) return { signature, typeBindings: context.typeBindings };

    const occurrence = occurrences.get(declaration) ?? 0;
    occurrences.set(declaration, occurrence + 1);

    const candidates = paths.filter((path) => path.declaration === signatureOwner);
    const signatureCount = declarations.filter((candidate) => candidate === declaration).length;
    const effectiveCandidates =
      candidates.length > signatureCount ? deduplicateTypeBindingPaths(candidates) : candidates;
    const path = effectiveCandidates[occurrence];
    return { signature, typeBindings: path?.bindings ?? context.typeBindings };
  });
};

const createEntityName = (qualifiedName: string) => {
  const segments = qualifiedName.split(".");
  let entityName: ts.EntityName = ts.factory.createIdentifier(segments[0]);

  for (const segment of segments.slice(1)) {
    entityName = ts.factory.createQualifiedName(entityName, segment);
  }

  return entityName;
};

export const projectBoundType = (node: TypeNode | undefined, context: ProjectionContext) => {
  if (!node) return;

  const needsTypeEvaluation =
    (node.getType().getFlags() &
      (ts.TypeFlags.Conditional | ts.TypeFlags.IndexedAccess | ts.TypeFlags.Index)) !==
    0;
  if (needsTypeEvaluation) return;

  const checker = node.getProject().getTypeChecker().compilerObject;
  const references = new Set<ModelReference>();
  const active = new Set<ts.Symbol>();
  let hasSubstitution = false;
  let hasErasedReference = false;
  let hasComputedType = false;
  const transformed = ts.transform(node.compilerNode, [
    (transform) => {
      const visit: ts.Visitor = (candidate) => {
        const needsComputation =
          ts.isConditionalTypeNode(candidate) ||
          ts.isIndexedAccessTypeNode(candidate) ||
          (ts.isTypeOperatorNode(candidate) && candidate.operator !== ts.SyntaxKind.ReadonlyKeyword);
        if (needsComputation) {
          hasComputedType = true;
        }

        if (ts.isTypeReferenceNode(candidate)) {
          const symbol = checker.getSymbolAtLocation(candidate.typeName);
          const argument = symbol ? context.typeBindings.get(symbol) : undefined;
          const canSubstituteArgument = symbol !== undefined && argument !== undefined && !active.has(symbol);
          if (canSubstituteArgument) {
            hasSubstitution = true;
            active.add(symbol);
            const result = ts.visitNode(argument.compilerNode, visit, ts.isTypeNode);
            active.delete(symbol);
            return result;
          }

          const hasBoundReference = symbol !== undefined && active.size > 0;
          if (hasBoundReference) {
            const name = trimSourcePath(checker.getFullyQualifiedName(symbol));

            const reference = context.references.resolveExact({ text: name, owner: context.owner });
            if (reference) {
              references.add(reference);
            }

            const type = checker.getTypeAtLocation(candidate);
            const isErasedReference =
              reference !== undefined && type.aliasSymbol !== symbol && type.getSymbol() !== symbol;
            if (isErasedReference) {
              hasErasedReference = true;
            }

            const shouldQualifyReference = reference !== undefined && name.includes(".");
            if (shouldQualifyReference) {
              candidate = ts.factory.updateTypeReferenceNode(
                candidate,
                createEntityName(name),
                candidate.typeArguments
              );
            }
          }
        }

        const result = ts.visitEachChild(candidate, visit, transform);
        if (ts.isTypeLiteralNode(result)) {
          return ts.setEmitFlags(ts.factory.createTypeLiteralNode(result.members), ts.EmitFlags.SingleLine);
        }

        if (ts.isTupleTypeNode(result)) {
          return ts.setEmitFlags(ts.factory.createTupleTypeNode(result.elements), ts.EmitFlags.SingleLine);
        }

        return result;
      };

      return (root) => ts.visitNode(root, visit, ts.isTypeNode) ?? root;
    },
  ]);

  try {
    if (!hasSubstitution || !hasErasedReference || hasComputedType) return;

    return {
      text: ts
        .createPrinter()
        .printNode(ts.EmitHint.Unspecified, transformed.transformed[0], node.getSourceFile().compilerNode),
      references: [...references],
    };
  } finally {
    transformed.dispose();
  }
};

export const projectTypeParameter = (parameter: TypeParameterDeclaration) => {
  const result: ModelTypeParameter = {
    name: cleanName(parameter.getName()),
    extends: parameter.getConstraint()?.getText(),
  };

  const defaultType = parameter.getDefault();
  if (defaultType) {
    result.default = defaultType.getText();
  }

  return result;
};

const getTypeParameterName = (parameter: Type) => parameter.getSymbol()?.getName() ?? parameter.getText();

export const projectSignatureTypeParameters = (signature: Signature, context: ProjectionContext) => {
  const sourceFile = context.owner.declaration.getSourceFile().compilerNode;
  const checker = context.owner.declaration.getProject().getTypeChecker().compilerObject;
  const resolvedSignature = checker.signatureToSignatureDeclaration(
    signature.compilerSignature,
    ts.SyntaxKind.CallSignature,
    context.owner.declaration.compilerNode,
    ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.NoTypeReduction
  );
  const printer = ts.createPrinter();

  return signature.getTypeParameters().map((parameter, index) => {
    const declaration = parameter.getSymbol()?.getDeclarations().find(Node.isTypeParameterDeclaration);
    const constraintNode = resolvedSignature?.typeParameters?.[index]?.constraint;
    const result: ModelTypeParameter = {
      name: getTypeParameterName(parameter),
      extends: constraintNode
        ? printer.printNode(ts.EmitHint.Unspecified, constraintNode, sourceFile)
        : parameter.getConstraint()?.getText(),
    };

    const defaultType = parameter.compilerType.getDefault();
    if (defaultType) {
      const defaultNode = declaration?.getDefault();
      const shouldKeepDefault =
        defaultNode !== undefined && defaultNode.getType().compilerType === defaultType;
      result.default = shouldKeepDefault ? defaultNode.getText() : checker.typeToString(defaultType);
    }

    return result;
  });
};

export const collectParameterReferences = (
  parameters: TypeParameterDeclaration[],
  context: ProjectionContext
) => {
  const names = new Set(parameters.map((parameter) => parameter.getName()));

  return parameters.flatMap((parameter) =>
    [parameter.getConstraint(), parameter.getDefault()].flatMap((node) =>
      context.references.collectNodeReferences({ owner: context.owner, node, typeParameterNames: names })
    )
  );
};

export const collectSignatureParameterReferences = (signature: Signature, context: ProjectionContext) => {
  const typeParameters = signature.getTypeParameters();
  const names = new Set(typeParameters.map(getTypeParameterName));

  return typeParameters.flatMap((parameter) => {
    const declaration = parameter.getSymbol()?.getDeclarations().find(Node.isTypeParameterDeclaration);
    const nodes = [declaration?.getConstraint(), declaration?.getDefault()];
    const types = [parameter.compilerType.getConstraint(), parameter.compilerType.getDefault()];

    return nodes.flatMap((node, index) => {
      const type = types[index];
      const shouldUseDeclaration = node !== undefined && (!type || node.getType().compilerType === type);
      if (shouldUseDeclaration) {
        return context.references.collectNodeReferences({
          owner: context.owner,
          node,
          typeParameterNames: names,
        });
      }

      if (!type) return [];

      return context.references.collectCompilerReferences({
        owner: context.owner,
        type,
        typeParameterNames: names,
      });
    });
  });
};
