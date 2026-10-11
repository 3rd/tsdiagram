import { Node, ts, type ExpressionWithTypeArguments, type Type, type TypeNode } from "ts-morph";
import type { CompilerContext } from "./compiler-context";
import { getMergedInterfaces, type ObjectDeclarationRecord } from "./declarations";
import type { ModelReference, ProjectedField } from "./projection";
import { trimSourcePath } from "./references";
import { getSignatureDeclaration, projectDeclaredSignature, projectEffectiveSignature } from "./signatures";
import { projectTypeDisplay, type CompilerProjectionContext, type ProjectionContext } from "./type-display";
import {
  bindSignatureTypeArguments,
  bindTypeArguments,
  getDeclaredBases,
  resolveBoundTypeNode,
} from "./type-parameters";

type DeclaredIndexInput = {
  keyName: string;
  keyType: string;
  valueType: Type;
  valueNode?: TypeNode;
};

type CompilerIndexInput = {
  index: ts.IndexInfo;
  valueType?: Type;
  valueNode?: TypeNode;
};

const projectDeclaredIndex = (input: DeclaredIndexInput, context: ProjectionContext) => {
  const text =
    input.valueNode?.getText() ?? input.valueType.getAliasSymbol()?.getName() ?? input.valueType.getText();
  const display = projectTypeDisplay({
    ...context,
    text,
    type: input.valueType,
    node: input.valueNode,
  });
  const field: ProjectedField = {
    name: `[${input.keyName}: ${input.keyType}]`,
    type: display.value,
    optional: false,
    ...(display.nestedReferences.length > 0 ? { typeRefs: display.nestedReferences } : {}),
  };
  return { field, references: display.references };
};

export const projectObjectCalls = (owner: ObjectDeclarationRecord, context: CompilerProjectionContext) => {
  const fields: ProjectedField[] = [];
  const references = new Set<ModelReference>();
  const type = owner.declaration.getType();
  const interfaces = getMergedInterfaces(owner);
  const groups = [
    {
      name: "",
      effective: type.getCallSignatures(),
      declared: interfaces.flatMap((declaration) => declaration.getCallSignatures()),
    },
    {
      name: "new",
      effective: type.getConstructSignatures(),
      declared: interfaces.flatMap((declaration) => declaration.getConstructSignatures()),
    },
  ];

  for (const group of groups) {
    const declaredNodes = new Set<ts.Node>(group.declared.map((declaration) => declaration.compilerNode));
    const boundSignatures = bindSignatureTypeArguments({ signatures: group.effective, context });

    for (const { signature, typeBindings } of boundSignatures) {
      const declaration = getSignatureDeclaration(signature);
      const isOwnInterfaceSignature =
        declaration !== undefined && declaredNodes.has(declaration.compilerNode);
      if (isOwnInterfaceSignature) continue;

      const isAliasSignature =
        owner.kind === "typeAlias" &&
        declaration !== undefined &&
        (Node.isFunctionTypeNode(declaration) ||
          Node.isConstructorTypeNode(declaration) ||
          Node.isCallSignatureDeclaration(declaration) ||
          Node.isConstructSignatureDeclaration(declaration)) &&
        declaration.getFirstAncestorByKind(ts.SyntaxKind.TypeAliasDeclaration) === owner.declaration;
      const signatureContext = { ...context, typeBindings };
      const result = isAliasSignature
        ? projectDeclaredSignature(declaration, group.name, signatureContext)
        : projectEffectiveSignature(
            { signature, name: group.name, isInherited: owner.kind !== "typeAlias" },
            signatureContext
          );

      fields.push(...result.fields);

      for (const reference of result.references) {
        references.add(reference);
      }
    }

    for (const declaration of group.declared) {
      const result = projectDeclaredSignature(declaration, group.name, context);
      fields.push(...result.fields);

      for (const reference of result.references) {
        references.add(reference);
      }
    }
  }

  return { fields, references: [...references] };
};

const findIndexValueArgument = (
  index: ts.IndexInfo,
  owner: ObjectDeclarationRecord,
  compiler: CompilerContext
) => {
  const pending: {
    node: TypeNode | ExpressionWithTypeArguments | undefined;
    bindings: Map<ts.Symbol, TypeNode>;
  }[] = [];
  const visited = new Set<Node>();

  if (owner.kind === "typeAlias") {
    pending.push({ node: owner.declaration.getTypeNode(), bindings: new Map() });
  } else {
    const declarations =
      owner.kind === "class" ? [owner.declaration, ...owner.interfaces] : owner.declarations;

    for (const declaration of declarations) {
      pending.push(
        ...getDeclaredBases(declaration).map((node) => ({ node, bindings: new Map<ts.Symbol, TypeNode>() }))
      );
    }
  }

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current?.node) continue;
    if (visited.has(current.node)) continue;

    const node = Node.isExpressionWithTypeArguments(current.node)
      ? current.node
      : resolveBoundTypeNode(current.node, current.bindings);
    if (visited.has(node)) continue;

    visited.add(node);

    for (const { declaration, bindings } of bindTypeArguments(node, current.bindings)) {
      const aliasNode = Node.isTypeAliasDeclaration(declaration) ? declaration.getTypeNode() : undefined;
      const mappedValue = Node.isMappedTypeNode(aliasNode) ? aliasNode.compilerNode.type : undefined;
      const valueTypeNode = index.declaration?.type ?? mappedValue;
      const hasValueReference = valueTypeNode !== undefined && ts.isTypeReferenceNode(valueTypeNode);
      if (hasValueReference) {
        const symbol = compiler.compilerChecker.getSymbolAtLocation(valueTypeNode.typeName);
        const argument = symbol ? bindings.get(symbol) : undefined;
        if (argument) return argument;
      }

      if (Node.isTypeAliasDeclaration(declaration)) {
        pending.push({ node: aliasNode, bindings });
      } else {
        pending.push(...getDeclaredBases(declaration).map((base) => ({ node: base, bindings })));
      }
    }
  }
};

const projectCompilerIndex = (
  { index, valueType, valueNode }: CompilerIndexInput,
  context: CompilerProjectionContext
) => {
  const { compilerChecker } = context.compiler;
  const location = context.owner.declaration.compilerNode;
  const keyText = compilerChecker.typeToString(index.keyType, location);
  const node = valueNode?.getType().compilerType === index.type ? valueNode : undefined;
  const valueText = trimSourcePath(
    node?.getText() ?? index.type.aliasSymbol?.getName() ?? compilerChecker.typeToString(index.type, location)
  );

  const reference = context.references.resolveExact({
    text: valueText,
    type: valueType,
    owner: context.owner,
  });
  const nestedReferences = reference
    ? []
    : [
        ...new Set([
          ...context.references.collectNodeReferences({ node, owner: context.owner }),
          ...context.references.collectCompilerReferences({ type: index.type, owner: context.owner }),
        ]),
      ];
  const field: ProjectedField = {
    name: `[key: ${keyText}]`,
    type: reference ?? valueText,
    optional: false,
    ...(context.owner.kind !== "typeAlias" ? { inherited: true } : {}),
    ...(nestedReferences.length > 0 ? { typeRefs: nestedReferences } : {}),
  };
  return { field, references: reference ? [reference] : nestedReferences };
};

const getDeclaredIndexSignatures = (owner: ObjectDeclarationRecord) => {
  if (owner.kind === "typeAlias") {
    const aliasNode = owner.declaration.getTypeNode();
    return Node.isTypeLiteral(aliasNode) ? aliasNode.getIndexSignatures() : [];
  }

  if (owner.kind === "class") {
    return [
      ...owner.declaration.forEachChildAsArray().filter(Node.isIndexSignatureDeclaration),
      ...owner.interfaces.flatMap((declaration) => declaration.getIndexSignatures()),
    ];
  }

  return owner.declarations.flatMap((declaration) => declaration.getIndexSignatures());
};

export const projectObjectIndexes = (owner: ObjectDeclarationRecord, context: CompilerProjectionContext) => {
  const fields: ProjectedField[] = [];
  const references = new Set<ModelReference>();
  const type = owner.declaration.getType();

  const declarations = getDeclaredIndexSignatures(owner);
  const declaredNodes = new Set(declarations.map((declaration) => declaration.compilerNode));

  const stringType = context.compiler.compilerChecker.getStringType();
  const numberType = context.compiler.compilerChecker.getNumberType();
  const indexValueTypes = new Map([
    [stringType, type.getStringIndexType()],
    [numberType, type.getNumberIndexType()],
  ]);

  const indexes = context.compiler.compilerChecker.getIndexInfosOfType(type.compilerType);
  const aliasIndexOrder = new Map([
    [stringType, 0],
    [numberType, 1],
  ]);
  const orderedIndexes =
    owner.kind === "typeAlias"
      ? [...indexes].sort(
          (first, second) =>
            (aliasIndexOrder.get(first.keyType) ?? 2) - (aliasIndexOrder.get(second.keyType) ?? 2)
        )
      : indexes;

  for (const index of orderedIndexes) {
    const isDeclaredIndex = index.declaration !== undefined && declaredNodes.has(index.declaration);
    if (isDeclaredIndex) continue;

    const result = projectCompilerIndex(
      {
        index,
        valueType: indexValueTypes.get(index.keyType),
        valueNode: findIndexValueArgument(index, owner, context.compiler),
      },
      context
    );
    fields.push(result.field);

    for (const reference of result.references) {
      references.add(reference);
    }
  }

  for (const declaration of declarations) {
    const result = projectDeclaredIndex(
      {
        keyName: owner.kind === "typeAlias" ? "key" : declaration.getKeyName(),
        keyType: declaration.getKeyType().getText(),
        valueType: declaration.getReturnType(),
        valueNode: declaration.getReturnTypeNode(),
      },
      context
    );
    fields.push(result.field);

    for (const reference of result.references) {
      references.add(reference);
    }
  }

  return { fields, references: [...references] };
};
