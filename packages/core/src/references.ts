import { Node, ts, type Type, type TypeNode } from "ts-morph";
import type { CompilerContext } from "./compiler-context";
import { cleanName, getHeaderTypeParameters, type DeclarationRecord } from "./declarations";
import type { ModelReference } from "./projection";

const QUALIFIED_NAME_PATTERN =
  /^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*(?:\.[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*)*$/u;
const TYPE_QUERY_PREFIX = "typeof ";

export const trimSourcePath = (text: string) =>
  text.replace('import("/source").', "").replace(/^"\/source"\./, "");

const removeTypeArguments = (text: string) => text.replace(/<.*$/s, "");

type TypeReferencesQuery = {
  owner: DeclarationRecord;
  type?: Type;
  node?: TypeNode;
  typeParameterNames?: ReadonlySet<string>;
};

type ReferenceQuery = TypeReferencesQuery & { text: string };

type CompilerReferencesQuery = {
  type: ts.Type;
  owner: DeclarationRecord;
  typeParameterNames?: ReadonlySet<string>;
};

export const createReferenceResolver = (compiler: CompilerContext, declarations: DeclarationRecord[]) => {
  const types = new Map<string, DeclarationRecord>();
  const values = new Map<string, DeclarationRecord>();
  const references = new Map<string, ModelReference>();

  for (const declaration of declarations) {
    references.set(declaration.id, { id: declaration.id });

    if (declaration.kind !== "function") {
      types.set(declaration.name, declaration);
    }

    const hasValue =
      declaration.kind === "function" || declaration.kind === "class" || declaration.kind === "enum";
    if (!hasValue) continue;

    values.set(declaration.name, declaration);
  }

  const findReference = (declaration: DeclarationRecord | undefined) =>
    declaration ? references.get(declaration.id) : undefined;

  const getScopedNames = (text: string, owner: DeclarationRecord) => {
    const names: string[] = [];

    for (let length = owner.scope.length; length > 0; length -= 1) {
      names.push(`${owner.scope.slice(0, length).join(".")}.${text}`);
    }

    names.push(text);
    return names;
  };

  const isTypeParameter = ({ text, owner, type, typeParameterNames }: ReferenceQuery) => {
    const isScopedParameter = type?.isTypeParameter() || typeParameterNames?.has(text);
    if (isScopedParameter) return true;

    return getHeaderTypeParameters(owner).some((parameter) => parameter.getName() === text);
  };

  const findTypeIdentity = ({ text, type, node }: ReferenceQuery) => {
    if (!QUALIFIED_NAME_PATTERN.test(text)) return;

    const declaredSymbol = Node.isTypeReference(node) ? node.getTypeName().getSymbol() : undefined;

    for (const symbol of [declaredSymbol, type?.getAliasSymbol(), type?.getSymbol()]) {
      if (!symbol) continue;

      const name = cleanName(trimSourcePath(compiler.checker.getFullyQualifiedName(symbol)));
      const value = values.get(name);

      const isFunctionType =
        value?.kind === "function" && value.declaration.getType().compilerType === type?.compilerType;
      if (isFunctionType) return findReference(value);

      const reference = findReference(types.get(name));
      if (reference) return reference;
    }
  };

  const resolveValue = ({ text, owner, typeParameterNames }: ReferenceQuery) => {
    const name = removeTypeArguments(trimSourcePath(text));
    if (typeParameterNames?.has(name)) return;

    for (const scopedName of getScopedNames(name, owner)) {
      const reference = findReference(values.get(scopedName));
      if (reference) return reference;
    }
  };

  const resolveExact = (query: ReferenceQuery) => {
    const text = trimSourcePath(query.text);
    if (isTypeParameter({ ...query, text })) return;

    const identity = findTypeIdentity({ ...query, text });
    if (identity) return identity;

    for (const name of getScopedNames(text, query.owner)) {
      const reference = findReference(types.get(name));
      if (reference) return reference;
    }
  };

  const resolveNested = (query: ReferenceQuery) => {
    const text = trimSourcePath(query.text);
    if (text.startsWith(TYPE_QUERY_PREFIX)) {
      return resolveValue({ ...query, text: text.slice(TYPE_QUERY_PREFIX.length) });
    }

    const name = removeTypeArguments(text);
    if (isTypeParameter({ ...query, text: name })) return;

    const identity = findTypeIdentity({ ...query, text: name });
    if (identity) return identity;

    const referenceSegments = name.split(".").length;

    for (const scopedName of getScopedNames(name, query.owner)) {
      const direct = findReference(types.get(scopedName));
      if (direct) return direct;

      const segments = scopedName.split(".");
      const scopeLength = segments.length - referenceSegments;

      for (let length = segments.length - 1; length > scopeLength; length -= 1) {
        const qualifier = findReference(types.get(segments.slice(0, length).join(".")));
        if (qualifier) return qualifier;
      }
    }
  };

  const collectQueryReferences = ({ node, owner, typeParameterNames }: TypeReferencesQuery) => {
    if (!node) return [];

    const queries = node.getDescendantsOfKind(ts.SyntaxKind.TypeQuery);

    if (Node.isTypeQuery(node)) {
      queries.unshift(node);
    }

    return queries.flatMap((query) => {
      const reference = resolveValue({ text: query.getExprName().getText(), owner, typeParameterNames });
      return reference ? [reference] : [];
    });
  };

  const collectNodeReferences = ({ node, owner, typeParameterNames }: TypeReferencesQuery) => {
    if (!node) return [];

    const result = new Set<ModelReference>();

    const addNode = (candidate: TypeNode) => {
      const nameNode = Node.isTypeReference(candidate) ? candidate.getTypeName() : candidate;
      const reference = resolveNested({
        text: nameNode.getText(),
        type: nameNode.getType(),
        node: candidate,
        owner,
        typeParameterNames,
      });
      if (!reference) return;

      result.add(reference);
    };

    addNode(node);

    for (const candidate of node.getDescendantsOfKind(ts.SyntaxKind.TypeReference)) {
      addNode(candidate);
    }

    for (const reference of collectQueryReferences({ node, owner, typeParameterNames })) {
      result.add(reference);
    }

    return [...result];
  };

  const collectTypeReferences = ({ type, owner, typeParameterNames }: TypeReferencesQuery) => {
    const result = new Set<ModelReference>();
    const visited = new Set<ts.Type>();

    const visitType = (candidate: Type) => {
      if (visited.has(candidate.compilerType)) return;

      visited.add(candidate.compilerType);

      const names = [
        candidate.getAliasSymbol()?.getName(),
        candidate.getSymbol()?.getName(),
        candidate.getText(),
      ];

      for (const text of names) {
        if (!text) continue;

        const reference = resolveNested({ text, owner, type: candidate, typeParameterNames });
        if (!reference) continue;

        result.add(reference);
      }

      const elementType = candidate.getArrayElementType();
      if (elementType) {
        visitType(elementType);
      }

      const nestedTypes = [
        ...candidate.getTupleElements(),
        ...candidate.getTypeArguments(),
        ...candidate.getAliasTypeArguments(),
        ...candidate.getUnionTypes(),
        ...candidate.getIntersectionTypes(),
      ];

      for (const nested of nestedTypes) {
        visitType(nested);
      }
    };

    if (type) {
      visitType(type);
    }

    return [...result];
  };

  const collectCompilerReferences = ({ type, owner, typeParameterNames }: CompilerReferencesQuery) => {
    const node = compiler.compilerChecker.typeToTypeNode(
      type,
      owner.declaration.compilerNode,
      ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.InTypeAlias
    );
    if (!node) return [];

    const result = new Set<ModelReference>();

    const getEntityName = (name: ts.EntityName) => {
      const segments: string[] = [];
      let current = name;

      while (ts.isQualifiedName(current)) {
        segments.unshift(current.right.text);
        current = current.left;
      }

      segments.unshift(current.text);
      return segments.join(".");
    };

    const visitNode = (candidate: ts.Node) => {
      let reference: ModelReference | undefined;

      if (ts.isTypeReferenceNode(candidate)) {
        reference = resolveNested({
          text: getEntityName(candidate.typeName),
          owner,
          typeParameterNames,
        });
      } else if (ts.isTypeQueryNode(candidate)) {
        reference = resolveValue({
          text: getEntityName(candidate.exprName),
          owner,
          typeParameterNames,
        });
      }

      if (reference) {
        result.add(reference);
      }

      ts.forEachChild(candidate, visitNode);
    };

    visitNode(node);
    return [...result];
  };

  const collectReferences = (query: TypeReferencesQuery) => [
    ...new Set([...collectNodeReferences(query), ...collectTypeReferences(query)]),
  ];

  return {
    resolveExact,
    resolveNested,
    collectReferences,
    collectQueryReferences,
    collectNodeReferences,
    collectTypeReferences,
    collectCompilerReferences,
  };
};

export type ReferenceResolver = ReturnType<typeof createReferenceResolver>;
