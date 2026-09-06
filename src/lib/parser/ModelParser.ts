import {
  CallSignatureDeclaration,
  ConstructSignatureDeclaration,
  ExpressionWithTypeArguments,
  FunctionTypeNode,
  GetAccessorDeclaration,
  IndexedAccessTypeNode,
  MethodDeclaration,
  MethodSignature,
  Node,
  ParameterDeclaration,
  PropertyDeclaration,
  PropertySignature,
  SetAccessorDeclaration,
  Signature,
  ts,
  Symbol as TsMorphSymbol,
  Type,
  TypeNode,
  TypeParameterDeclaration,
  TypeReferenceNode,
} from "ts-morph";
import {
  ClassModel,
  EnumModel,
  GenericSchemaField,
  InterfaceModel,
  Model,
  SchemaFieldModifier,
  TypeAliasModel,
} from "./model-types";

import { ParsedClass, ParsedInterface, ParsedTypeAlias, Parser } from "./Parser";

export * from "./model-types";

type SynthesizedProperty = {
  getName: () => string;
  getSymbol: () => TsMorphSymbol;
  getType: () => Type;
  isReadonly: () => boolean;
  optional: boolean;
  typeLocation: Node;
};

type AddIndexSignatureRowArgs = {
  keyName: string;
  keyTypeName: string;
  valueType?: Type;
  valueTypeNode?: TypeNode;
};

type Prop =
  | GetAccessorDeclaration
  | MethodDeclaration
  | MethodSignature
  | PropertyDeclaration
  | PropertySignature
  | SetAccessorDeclaration
  | SynthesizedProperty;

const READONLY_CHECK_FLAG = 1 << 3;
const QUALIFIED_NAME_PATTERN =
  /^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*(?:\.[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*)*$/u;

const getObjectProperty = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, key);
};

const isSynthesizedPropertyReadonly = (symbol: TsMorphSymbol) => {
  const links = getObjectProperty(symbol.compilerSymbol, "links");
  const checkFlags = getObjectProperty(links, "checkFlags");
  return typeof checkFlags === "number" && (checkFlags & READONLY_CHECK_FLAG) !== 0;
};

const createSynthesizedProperty = (symbol: TsMorphSymbol, type: Type, typeLocation: Node) => ({
  getName: () => symbol.getName(),
  getSymbol: () => symbol,
  getType: () => type,
  isReadonly: () => isSynthesizedPropertyReadonly(symbol),
  optional: symbol.hasFlags(ts.SymbolFlags.Optional),
  typeLocation,
});

const trimImport = (str: string) => str.replace(`import("/source").`, "").replace(/^"\/source"\./, "");

const stripTypeArguments = (text: string) => {
  const bracketIndex = text.indexOf("<");
  return bracketIndex === -1 ? text : text.slice(0, bracketIndex);
};

const sanitizePropertyName = (name: string) => {
  return name.replace(/'/g, "").replace(/"/g, "");
};

const toModelArgument = (parameter: TypeParameterDeclaration) => {
  const name = sanitizePropertyName(parameter.getName());
  const type = parameter.getType();
  const constraint = type.getConstraint()?.getText();
  const defaultType = parameter.getDefault()?.getText();
  return {
    name,
    extends: constraint,
    ...(defaultType ? { default: defaultType } : {}),
  };
};

const getPropModifiers = (prop: Prop): SchemaFieldModifier[] => {
  const modifiers: SchemaFieldModifier[] = [];
  const candidate = prop as Partial<{
    getScope: () => string;
    isAbstract: () => boolean;
    isReadonly: () => boolean;
    isStatic: () => boolean;
  }>;
  if (typeof candidate.isStatic === "function" && candidate.isStatic()) modifiers.push("static");
  const scope = typeof candidate.getScope === "function" ? candidate.getScope() : "public";
  if (scope === "private" || scope === "protected") modifiers.push(scope);
  if (typeof candidate.isReadonly === "function" && candidate.isReadonly()) modifiers.push("readonly");
  if (typeof candidate.isAbstract === "function" && candidate.isAbstract()) modifiers.push("abstract");
  return modifiers;
};

const QUESTION_TOKEN_KINDS = [
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.MethodDeclaration,
] as const;

const hasQuestionToken = (prop: Prop): boolean => {
  if ("typeLocation" in prop) return prop.optional;
  if (!QUESTION_TOKEN_KINDS.some((kind) => prop.isKind?.(kind))) return false;
  const questionable = prop as MethodDeclaration | MethodSignature | PropertyDeclaration | PropertySignature;
  return questionable.hasQuestionToken();
};

const getDeclaredPropType = (prop: Prop, type?: Type) => {
  const propType = type ?? prop.getType();
  if (!hasQuestionToken(prop)) return propType;
  const containsNull = propType.isUnion() && propType.getUnionTypes().some((unionType) => unionType.isNull());
  if (!containsNull) return propType.getNonNullableType();
  const typeNode = (prop as Partial<Pick<PropertySignature, "getTypeNode">>).getTypeNode?.();
  if (!typeNode) return propType;
  const nodeType = typeNode.getType();
  const memberTexts = (candidate: Type) =>
    (candidate.isUnion() ? candidate.getUnionTypes() : [candidate]).map((member) => member.getText()).sort();
  const strippedMemberTexts = propType
    .getUnionTypes()
    .filter((member) => !member.isUndefined())
    .map((member) => member.getText())
    .sort();
  const nodeMatchesStrippedType =
    JSON.stringify(memberTexts(nodeType)) === JSON.stringify(strippedMemberTexts);
  return nodeMatchesStrippedType ? nodeType : propType;
};

const getPropTypeText = (prop: Prop, type: Type) => {
  const typeText = trimImport(type.getText());
  if (!hasQuestionToken(prop) || !type.isUnion()) return typeText;
  return typeText
    .replace(/^undefined \| /, "")
    .replace(/ \| undefined$/, "")
    .replace(/ \| undefined \| /, " | ");
};

export class ModelParser extends Parser {
  getModels() {
    const models: Model[] = [];
    const modelNameToModelMap = new Map<string, Model>();
    const dependencyMap = new Map<string, Set<Model>>();
    const classMergedInterfaces = new Map<string, ParsedInterface>();
    const modelTypeParameterNames = new Map<string, Set<string>>();

    const findModelOrQualifier = (referenceName: string, ownerSegmentCount: number) => {
      const directModel = modelNameToModelMap.get(referenceName);
      if (directModel) return directModel;

      const segments = referenceName.split(".");
      for (let i = segments.length - 1; i > ownerSegmentCount; i--) {
        const qualifierModel = modelNameToModelMap.get(segments.slice(0, i).join("."));
        if (qualifierModel) return qualifierModel;
      }
    };

    const getScopedReferenceNames = (referenceName: string, ownerName?: string) => {
      const scopedNames: string[] = [];
      const ownerSegments = ownerName?.split(".").slice(0, -1) ?? [];
      while (ownerSegments.length > 0) {
        scopedNames.push(`${ownerSegments.join(".")}.${referenceName}`);
        ownerSegments.pop();
      }
      scopedNames.push(referenceName);
      return scopedNames;
    };

    const resolveTypeModelReference = (referenceName: string, type?: Type) => {
      if (!QUALIFIED_NAME_PATTERN.test(referenceName)) return;

      for (const symbol of [type?.getAliasSymbol(), type?.getSymbol()]) {
        if (!symbol) continue;
        const qualifiedName = sanitizePropertyName(trimImport(this.checker.getFullyQualifiedName(symbol)));
        const model = modelNameToModelMap.get(qualifiedName);
        if (model) return model;
      }
    };

    const isTypeParameterReference = (referenceName: string, ownerName?: string, type?: Type) => {
      return Boolean(
        type?.isTypeParameter() || (ownerName && modelTypeParameterNames.get(ownerName)?.has(referenceName)),
      );
    };

    const resolveExactModelReference = (text: string, ownerName?: string, type?: Type) => {
      const referenceName = trimImport(text);
      if (isTypeParameterReference(referenceName, ownerName, type)) return;
      const typeModel = resolveTypeModelReference(referenceName, type);
      if (typeModel) return typeModel;
      for (const scopedName of getScopedReferenceNames(referenceName, ownerName)) {
        const model = modelNameToModelMap.get(scopedName);
        if (model) return model;
      }
    };

    const resolveModelReference = (text: string, ownerName?: string, type?: Type): Model | undefined => {
      const referenceName = trimImport(text);
      const baseName = stripTypeArguments(referenceName);
      if (isTypeParameterReference(baseName, ownerName, type)) return;
      const typeModel = resolveTypeModelReference(baseName, type);
      if (typeModel) return typeModel;
      const referenceSegmentCount = baseName.split(".").length;
      for (const scopedName of getScopedReferenceNames(baseName, ownerName)) {
        const ownerSegmentCount = scopedName.split(".").length - referenceSegmentCount;
        const model = findModelOrQualifier(scopedName, ownerSegmentCount);
        if (model) return model;
      }
    };

    // first pass: build nodes and models
    const items: ((
      | { type: "class"; model: ClassModel; node: ParsedClass }
      | { type: "interface"; model: InterfaceModel; node: ParsedInterface }
      | { type: "typeAlias"; model: TypeAliasModel; node: ParsedTypeAlias }
    ) & { name: string })[] = [];

    for (const _interface of this.interfaces) {
      const name = sanitizePropertyName(_interface.name);
      const typeParameters = _interface.declaration.getTypeParameters();
      modelTypeParameterNames.set(name, new Set(typeParameters.map((parameter) => parameter.getName())));

      const model: InterfaceModel = {
        id: name,
        name,
        extends: [],
        schema: [],
        dependencies: [],
        dependants: [],
        type: "interface",
        arguments: [],
      };

      for (const parameter of typeParameters) model.arguments.push(toModelArgument(parameter));

      if (_interface.declaration.getType().isClass()) {
        classMergedInterfaces.set(name, _interface);
      } else {
        models.push(model);
        modelNameToModelMap.set(model.id, model);
      }
      items.push({
        type: "interface",
        name,
        node: _interface,
        model,
      });
    }

    for (const typeAlias of this.typeAliases) {
      const name = sanitizePropertyName(typeAlias.name);
      const typeParameters = typeAlias.declaration.getTypeParameters();
      modelTypeParameterNames.set(name, new Set(typeParameters.map((parameter) => parameter.getName())));

      const model: TypeAliasModel = {
        id: name,
        name,
        schema: [],
        dependencies: [],
        dependants: [],
        type: "typeAlias",
        arguments: [],
      };

      for (const parameter of typeParameters) model.arguments.push(toModelArgument(parameter));

      models.push(model);
      modelNameToModelMap.set(model.id, model);

      items.push({
        type: "typeAlias",
        name,
        node: typeAlias,
        model,
      });
    }

    for (const currentClass of this.classes) {
      const name = sanitizePropertyName(currentClass.name);
      const typeParameters = currentClass.declaration.getTypeParameters();
      modelTypeParameterNames.set(name, new Set(typeParameters.map((parameter) => parameter.getName())));

      const model: ClassModel = {
        id: name,
        name,
        implements: [],
        schema: [],
        dependencies: [],
        dependants: [],
        type: "class",
        arguments: [],
      };
      if (currentClass.declaration.isAbstract()) model.isAbstract = true;

      for (const parameter of typeParameters) model.arguments.push(toModelArgument(parameter));

      models.push(model);
      modelNameToModelMap.set(model.id, model);

      items.push({
        type: "class",
        name,
        node: currentClass,
        model,
      });
    }

    for (const _enum of this.enums) {
      const name = sanitizePropertyName(_enum.name);

      const model: EnumModel = {
        id: name,
        name,
        schema: _enum.members.map((member) => {
          const value = member.getValue();
          const valueText =
            typeof value === "string" ? `"${value}"`
            : typeof value === "number" ? String(value)
            : (member.getInitializer()?.getText() ?? "");
          return { name: sanitizePropertyName(member.getName()), type: valueText, optional: false };
        }),
        dependencies: [],
        dependants: [],
        type: "enum",
        arguments: [],
      };

      models.push(model);
      modelNameToModelMap.set(model.id, model);
    }

    const collectHeaderExpressionRefs = (
      expression: ExpressionWithTypeArguments,
      ownerName: string,
    ): Model[] => {
      const refs = new Set<Model>();
      const headExpression = expression.getExpression();
      const headModel = resolveModelReference(headExpression.getText(), ownerName, headExpression.getType());
      if (headModel) refs.add(headModel);
      for (const typeReference of expression.getDescendantsOfKind(ts.SyntaxKind.TypeReference)) {
        const referencedModel = resolveModelReference(
          typeReference.getText(),
          ownerName,
          typeReference.getType(),
        );
        if (referencedModel) refs.add(referencedModel);
      }
      return [...refs];
    };

    const collectTypeRefModels = (type: Type, ownerName: string): Model[] => {
      const refs = new Set<Model>();
      const seen = new Set<Type>();
      const visit = (candidate: Type) => {
        if (seen.has(candidate)) return;
        seen.add(candidate);

        const names = [
          candidate.getAliasSymbol()?.getName(),
          candidate.getSymbol()?.getName(),
          candidate.getText(),
        ];
        for (const name of names) {
          if (!name) continue;
          const candidateModel = resolveModelReference(name, ownerName, candidate);
          if (candidateModel) refs.add(candidateModel);
        }

        if (candidate.isArray()) {
          const elementType = candidate.getArrayElementType();
          if (elementType) visit(elementType);
        }
        if (candidate.isTuple()) {
          for (const elementType of candidate.getTupleElements()) visit(elementType);
        }
        for (const typeArgument of candidate.getTypeArguments()) visit(typeArgument);
        for (const typeArgument of candidate.getAliasTypeArguments()) visit(typeArgument);
        if (candidate.isUnion()) for (const unionType of candidate.getUnionTypes()) visit(unionType);
        if (candidate.isIntersection()) {
          for (const intersectionType of candidate.getIntersectionTypes()) visit(intersectionType);
        }
      };
      visit(type);
      return [...refs];
    };

    const collectTypeNodeRefModels = (typeNode: TypeNode | undefined, ownerName: string): Model[] => {
      if (!typeNode) return [];
      const refs = new Set<Model>();
      const addTypeNode = (node: TypeNode) => {
        const referencedModel = resolveModelReference(node.getText(), ownerName, node.getType());
        if (referencedModel) refs.add(referencedModel);
      };
      addTypeNode(typeNode);
      for (const typeReference of typeNode.getDescendantsOfKind(ts.SyntaxKind.TypeReference)) {
        addTypeNode(typeReference);
      }
      return [...refs];
    };

    // models referenced by type-parameter constraints, e.g. User in `Repo<T extends User>`
    const collectConstraintRefs = (
      declaration: {
        getTypeParameters: () => TypeParameterDeclaration[];
      },
      ownerName: string,
    ): Model[] => {
      const refs = new Set<Model>();
      const addTypeNode = (node: TypeNode) => {
        const referencedModel = resolveModelReference(node.getText(), ownerName, node.getType());
        if (referencedModel) refs.add(referencedModel);
      };
      for (const parameter of declaration.getTypeParameters()) {
        const constraint = parameter.getConstraint();
        if (!constraint) continue;
        if (constraint.isKind(ts.SyntaxKind.TypeReference)) addTypeNode(constraint);
        for (const typeReference of constraint.getDescendantsOfKind(ts.SyntaxKind.TypeReference)) {
          addTypeNode(typeReference);
        }
      }
      return [...refs];
    };

    const getCompilerEntityNameText = (name: ts.EntityName): string => {
      if (ts.isIdentifier(name)) return name.text;
      return `${getCompilerEntityNameText(name.left)}.${name.right.text}`;
    };

    const collectCompilerTypeRefModels = ({
      type,
      typeLocation,
      ownerName,
      typeParameterNames = new Set<string>(),
    }: {
      type: ts.Type;
      typeLocation: Node;
      ownerName: string;
      typeParameterNames?: ReadonlySet<string>;
    }) => {
      const typeNode = this.tsChecker.typeToTypeNode(
        type,
        typeLocation.compilerNode,
        ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.InTypeAlias,
      );
      if (!typeNode) return [];

      const refs = new Set<Model>();
      const visit = (node: ts.Node) => {
        if (ts.isTypeReferenceNode(node)) {
          const referenceName = getCompilerEntityNameText(node.typeName);
          const referencedModel =
            typeParameterNames.has(referenceName) ? undefined : (
              resolveModelReference(referenceName, ownerName)
            );
          if (referencedModel) refs.add(referencedModel);
        } else if (ts.isTypeQueryNode(node)) {
          const referenceName = getCompilerEntityNameText(node.exprName);
          const referencedModel =
            typeParameterNames.has(referenceName) ? undefined : (
              resolveModelReference(referenceName, ownerName)
            );
          if (referencedModel) refs.add(referencedModel);
        }
        ts.forEachChild(node, visit);
      };
      visit(typeNode);
      return [...refs];
    };

    for (const item of items) {
      if (item.type === "interface") {
        for (const extendsExpression of item.node.extends) {
          const extendsName = trimImport(extendsExpression.getText());
          item.model.extends.push(
            resolveExactModelReference(extendsName, item.name, extendsExpression.getType()) ?? extendsName,
          );
        }
      }
      if (item.type === "class") {
        const extendsExpression = item.node.extends ?? classMergedInterfaces.get(item.name)?.extends[0];
        if (extendsExpression) {
          const extendsName = sanitizePropertyName(trimImport(extendsExpression.getText()));
          item.model.extends =
            resolveExactModelReference(extendsName, item.name, extendsExpression.getType()) ?? extendsName;
        }
        for (const implementsExpression of item.node.implements) {
          const implementsName = sanitizePropertyName(trimImport(implementsExpression.getText()));
          item.model.implements.push(
            resolveExactModelReference(implementsName, item.name, implementsExpression.getType()) ??
              implementsName,
          );
        }
      }
    }

    // second pass: parse schema and root dependencies
    for (const item of items) {
      const model = modelNameToModelMap.get(item.name);
      if (!model) continue;

      const dependencies = dependencyMap.get(item.name) ?? new Set<Model>();

      const collectTextTypeRefs = (type: Type, typeNode?: TypeNode, renderedModel?: Model) => {
        if (renderedModel) return new Set<Model>();
        const refs = new Set([
          ...collectTypeNodeRefModels(typeNode, item.name),
          ...collectTypeRefModels(type, item.name),
        ]);
        for (const ref of refs) dependencies.add(ref);
        return refs;
      };

      const addFunctionProp = (prop: Prop, type?: Type) => {
        const propName = sanitizePropertyName(prop.getName());
        const propType = getDeclaredPropType(prop, type);
        const propKind = "getKind" in prop ? prop.getKind() : undefined;
        const modifiers = getPropModifiers(prop);
        const modifiersProps = modifiers.length > 0 ? { modifiers } : {};

        const toArgumentSchema = (
          argumentName: string,
          argumentType: Type,
          typeRefs: Set<Model>,
          typeNode?: TypeNode,
        ) => {
          let argumentTypeName = trimImport(argumentType.getText());

          if (typeNode?.isKind(ts.SyntaxKind.TypeReference)) {
            const nodeName = trimImport(typeNode.getText());
            if (resolveExactModelReference(nodeName, item.name, argumentType)) {
              argumentTypeName = nodeName;
            }
          }

          const aliasSymbol = argumentType.getAliasSymbol();
          if (!resolveExactModelReference(argumentTypeName, item.name, argumentType) && aliasSymbol) {
            argumentTypeName = aliasSymbol.getName();
          }

          const argumentTypeModel = resolveExactModelReference(argumentTypeName, item.name, argumentType);
          if (argumentTypeModel) dependencies.add(argumentTypeModel);
          for (const typeRef of collectTextTypeRefs(argumentType, typeNode, argumentTypeModel)) {
            typeRefs.add(typeRef);
          }

          return {
            name: argumentName,
            type: argumentTypeModel ?? argumentTypeName,
          };
        };

        if (propKind === ts.SyntaxKind.GetAccessor) {
          const getter = prop as GetAccessorDeclaration;
          const returnTypeNode = getter.getReturnTypeNode();
          const returnType = getter.getReturnType();
          const declaredName = returnTypeNode ? trimImport(returnTypeNode.getText()) : undefined;

          const returnTypeName = declaredName ?? trimImport(returnType.getText());
          const returnTypeModel = resolveExactModelReference(returnTypeName, item.name, returnType);
          if (returnTypeModel) dependencies.add(returnTypeModel);
          const typeRefs = collectTextTypeRefs(returnType, returnTypeNode, returnTypeModel);

          model.schema.push({
            name: propName,
            type: "function",
            arguments: [],
            returnType: returnTypeModel ?? returnTypeName,
            optional: false,
            ...modifiersProps,
            ...(typeRefs.size > 0 ? { typeRefs: [...typeRefs] } : {}),
          });
          return true;
        }

        if (propKind === ts.SyntaxKind.SetAccessor) {
          const setter = prop as SetAccessorDeclaration;
          const parameters = setter.getParameters();
          const functionArguments: { name: string; type: Model | string }[] = [];
          const typeRefs = new Set<Model>();

          for (const parameter of parameters) {
            const parameterName = sanitizePropertyName(parameter.getName());
            const parameterType = parameter.getType();
            functionArguments.push(
              toArgumentSchema(parameterName, parameterType, typeRefs, parameter.getTypeNode() ?? undefined),
            );
          }

          model.schema.push({
            name: propName,
            type: "function",
            arguments: functionArguments,
            returnType: "void",
            optional: false,
            ...modifiersProps,
            ...(typeRefs.size > 0 ? { typeRefs: [...typeRefs] } : {}),
          });
          return true;
        }

        const callSignatures = propType.getCallSignatures();
        if (callSignatures.length === 0) return false;

        const optional = hasQuestionToken(prop);

        // render every declared signature so overloads are not collapsed into one row
        for (const callSignature of callSignatures) {
          const functionArguments: { name: string; type: Model | string }[] = [];
          const typeRefs = new Set<Model>();

          for (const parameter of callSignature.getParameters()) {
            const parameterName = sanitizePropertyName(parameter.getName());
            const parameterType = parameter.getTypeAtLocation(
              "typeLocation" in prop ? prop.typeLocation : prop,
            );
            const parameterDeclaration = parameter.getDeclarations()?.[0];
            const parameterTypeNode =
              parameterDeclaration?.isKind(ts.SyntaxKind.Parameter) ?
                ((parameterDeclaration as ParameterDeclaration).getTypeNode() ?? undefined)
              : undefined;

            functionArguments.push(
              toArgumentSchema(parameterName, parameterType, typeRefs, parameterTypeNode),
            );
          }

          const declaredReturnTypeNode = (() => {
            const candidateNodes: TypeNode[] = [];

            // the signature's own annotation comes first so each overload keeps its return type
            const signatureDeclaration = callSignature.getDeclaration();
            if (signatureDeclaration && "getReturnTypeNode" in signatureDeclaration) {
              const signatureReturnTypeNode = signatureDeclaration.getReturnTypeNode();
              if (signatureReturnTypeNode) candidateNodes.push(signatureReturnTypeNode);
            }

            if ("getReturnTypeNode" in prop && typeof prop.getReturnTypeNode === "function") {
              const returnTypeNode = prop.getReturnTypeNode();
              if (returnTypeNode) candidateNodes.push(returnTypeNode);
            }

            if ("getTypeNode" in prop && typeof prop.getTypeNode === "function") {
              const typeNode = prop.getTypeNode();
              if (typeNode?.isKind(ts.SyntaxKind.FunctionType)) {
                const functionTypeNode = typeNode as FunctionTypeNode;
                const returnTypeNode = functionTypeNode.getReturnTypeNode();
                if (returnTypeNode) candidateNodes.push(returnTypeNode);
              }
            }

            return (
              candidateNodes.find((node) => {
                const text = trimImport(node.getText());
                return Boolean(resolveExactModelReference(text, item.name, node.getType()));
              }) ?? candidateNodes[0]
            );
          })();

          const declaredReturnTypeName =
            declaredReturnTypeNode ? trimImport(declaredReturnTypeNode.getText()) : undefined;

          const returnType = callSignature.getReturnType();
          const isArray = returnType.isArray();
          let returnTypeReference = returnType;
          let returnTypeName = "";

          if (isArray) {
            const elementType = returnType.getArrayElementType();
            if (elementType) {
              returnTypeReference = elementType;
              const aliasSymbol = elementType.getAliasSymbol();
              returnTypeName = aliasSymbol ? aliasSymbol.getName() : trimImport(elementType.getText());
            }
          } else if (
            declaredReturnTypeName &&
            resolveExactModelReference(declaredReturnTypeName, item.name, returnType)
          ) {
            returnTypeName = declaredReturnTypeName;
          } else {
            const aliasSymbol = returnType.getAliasSymbol();
            const checkerName = aliasSymbol ? aliasSymbol.getName() : trimImport(returnType.getText());
            returnTypeName =
              resolveExactModelReference(checkerName, item.name, returnType) ? checkerName : (
                (declaredReturnTypeName ?? checkerName)
              );
          }

          const returnTypeModel = resolveExactModelReference(returnTypeName, item.name, returnTypeReference);
          if (returnTypeModel) dependencies.add(returnTypeModel);

          for (const typeRef of collectTextTypeRefs(returnType, declaredReturnTypeNode, returnTypeModel)) {
            typeRefs.add(typeRef);
          }

          if (declaredReturnTypeNode) {
            const declaredText = trimImport(declaredReturnTypeNode.getText());
            const declaredModel = resolveExactModelReference(
              declaredText,
              item.name,
              declaredReturnTypeNode.getType(),
            );
            if (declaredModel) dependencies.add(declaredModel);
          }

          model.schema.push({
            name: propName,
            type: "function",
            arguments: functionArguments,
            returnType: isArray ? [returnTypeModel ?? returnTypeName] : (returnTypeModel ?? returnTypeName),
            optional,
            ...modifiersProps,
            ...(typeRefs.size > 0 ? { typeRefs: [...typeRefs] } : {}),
          });
        }
        return true;
      };

      const addArrayProp = (prop: Prop, type?: Type) => {
        const propName = sanitizePropertyName(prop.getName());
        const propType = getDeclaredPropType(prop, type);

        if (!propType.isArray()) return false;

        const elementType = propType.getArrayElementType();
        if (!elementType) return false;

        const aliasSymbol = elementType.getAliasSymbol();
        const elementTypeName = aliasSymbol ? aliasSymbol.getName() : trimImport(elementType.getText());
        const elementTypeModel = resolveExactModelReference(elementTypeName, item.name, elementType);
        const typeNode =
          "getTypeNode" in prop && typeof prop.getTypeNode === "function" ?
            (prop.getTypeNode() ?? undefined)
          : undefined;

        // union elements like (A | B)[] link their member models while rendering as text
        const typeRefs = collectTextTypeRefs(propType, typeNode, elementTypeModel);

        const optional = hasQuestionToken(prop);

        const modifiers = getPropModifiers(prop);
        model.schema.push({
          name: propName,
          type: "array",
          elementType: elementTypeModel ?? elementTypeName,
          optional,
          ...(modifiers.length > 0 ? { modifiers } : {}),
          ...(typeRefs.size > 0 ? { typeRefs: [...typeRefs] } : {}),
        });
        if (elementTypeModel) dependencies.add(elementTypeModel);

        return true;
      };

      const addGenericProp = (prop: Prop, type?: Type) => {
        const propName = sanitizePropertyName(prop.getName());
        const propType = getDeclaredPropType(prop, type);

        const aliasSymbol = propType.getAliasSymbol();
        const symbol = aliasSymbol ?? propType.getSymbol();
        const typeArguments = aliasSymbol ? propType.getAliasTypeArguments() : propType.getTypeArguments();
        const typeNode =
          "getTypeNode" in prop ? (prop.getTypeNode() as TypeReferenceNode | undefined) : undefined;
        const typeNodeArguments =
          typeNode?.isKind(ts.SyntaxKind.TypeReference) ? typeNode.getTypeArguments() : [];

        if (symbol && typeArguments.length > 0) {
          const genericName = symbol.getName();
          if (!genericName) return false;

          const genericModel = resolveExactModelReference(genericName, item.name);
          if (genericModel) dependencies.add(genericModel);
          const typeRefs = new Set<Model>();
          if (genericModel) typeRefs.add(genericModel);

          const optional = hasQuestionToken(prop);

          const modifiers = getPropModifiers(prop);
          const schemaField: GenericSchemaField = {
            name: propName,
            type: "generic",
            genericName,
            arguments: [],
            optional,
            ...(modifiers.length > 0 ? { modifiers } : {}),
          };

          for (const [i, typeArgument] of typeArguments.entries()) {
            let typeArgumentName = trimImport(typeArgument.getText());

            const typeArgumentAliasSymbol = typeArgument.getAliasSymbol();
            if (typeArgumentAliasSymbol) {
              typeArgumentName = typeArgumentAliasSymbol.getName();
            } else if (typeNodeArguments[i] && typeNodeArguments[i].isKind(ts.SyntaxKind.TypeReference)) {
              typeArgumentName = trimImport(typeNodeArguments[i].getText());
            }

            const typeArgumentModel = resolveExactModelReference(typeArgumentName, item.name, typeArgument);

            schemaField.arguments.push(typeArgumentModel ?? typeArgumentName);
            if (typeArgumentModel) dependencies.add(typeArgumentModel);
            for (const typeRef of collectTextTypeRefs(
              typeArgument,
              typeNodeArguments[i],
              typeArgumentModel,
            )) {
              typeRefs.add(typeRef);
            }
          }

          if (typeRefs.size > 0) schemaField.typeRefs = [...typeRefs];
          model.schema.push(schemaField);
          return true;
        }

        return false;
      };

      const addDefaultProp = (prop: Prop, type?: Type) => {
        const propName = sanitizePropertyName(prop.getName());
        const propType = getDeclaredPropType(prop, type);
        const typeNode =
          "getTypeNode" in prop && typeof prop.getTypeNode === "function" ?
            (prop.getTypeNode() ?? undefined)
          : undefined;
        let typeName = getPropTypeText(prop, propType);

        const symbolDeclaration = prop.getSymbol?.()?.getDeclarations()?.[0];
        if (!("typeLocation" in prop) && symbolDeclaration?.isKind(ts.SyntaxKind.PropertySignature)) {
          const declarationTypeNode = symbolDeclaration.getTypeNode();
          if (declarationTypeNode) {
            const declarationTypeName = trimImport(declarationTypeNode.getText());
            const declarationTypeModel = resolveExactModelReference(
              declarationTypeName,
              item.name,
              declarationTypeNode.getType(),
            );
            if (declarationTypeModel) {
              typeName = declarationTypeName;
            }
          }
        }

        if (!resolveExactModelReference(typeName, item.name, propType)) {
          const aliasSymbol = propType.getAliasSymbol();
          if (aliasSymbol) {
            typeName = aliasSymbol.getName();
          }
        }

        const typeModel = resolveExactModelReference(typeName, item.name, propType);
        if (typeModel) dependencies.add(typeModel);

        const typeRefs = collectTextTypeRefs(propType, typeNode, typeModel);

        const optional = hasQuestionToken(prop);

        const modifiers = getPropModifiers(prop);
        model.schema.push({
          name: propName,
          type: typeModel ?? typeName,
          optional,
          ...(modifiers.length > 0 ? { modifiers } : {}),
          ...(typeRefs.size > 0 ? { typeRefs: [...typeRefs] } : {}),
        });
      };

      const addPropToSchema = (prop: Prop, type?: Type) => {
        if (addFunctionProp(prop, type)) return;
        if (addArrayProp(prop, type)) return;
        if (addGenericProp(prop, type)) return;
        addDefaultProp(prop, type);
      };

      const addSynthesizedPropertyToSchema = (symbol: TsMorphSymbol, typeLocation: Node) => {
        const propertyType = this.checker.getTypeOfSymbolAtLocation(symbol, typeLocation);
        addPropToSchema(createSynthesizedProperty(symbol, propertyType, typeLocation), propertyType);
      };

      const addIndexSignatureRow = ({
        keyName,
        keyTypeName,
        valueType,
        valueTypeNode,
      }: AddIndexSignatureRowArgs) => {
        if (!valueType) return;
        const valueTypeName = trimImport(
          valueTypeNode?.getText() ?? valueType.getAliasSymbol()?.getName() ?? valueType.getText(),
        );
        const valueTypeModel = resolveExactModelReference(valueTypeName, item.name, valueType);
        if (valueTypeModel) dependencies.add(valueTypeModel);
        const typeRefs = collectTextTypeRefs(valueType, valueTypeNode, valueTypeModel);
        model.schema.push({
          name: `[${keyName}: ${keyTypeName}]`,
          type: valueTypeModel ?? valueTypeName,
          optional: false,
          ...(typeRefs.size > 0 ? { typeRefs: [...typeRefs] } : {}),
        });
      };

      const addCompilerIndexSignatureRow = (indexInfo: ts.IndexInfo, valueType?: Type) => {
        const enclosingNode = item.node.declaration.compilerNode;
        const keyTypeName = this.tsChecker.typeToString(indexInfo.keyType, enclosingNode);
        const valueTypeName = trimImport(
          indexInfo.type.aliasSymbol?.getName() ?? this.tsChecker.typeToString(indexInfo.type, enclosingNode),
        );
        const valueTypeModel = resolveExactModelReference(valueTypeName, item.name, valueType);
        if (valueTypeModel) dependencies.add(valueTypeModel);
        const typeRefs =
          valueTypeModel ?
            new Set<Model>()
          : new Set(
              collectCompilerTypeRefModels({
                type: indexInfo.type,
                typeLocation: item.node.declaration,
                ownerName: item.name,
              }),
            );
        for (const typeRef of typeRefs) dependencies.add(typeRef);
        model.schema.push({
          name: `[key: ${keyTypeName}]`,
          type: valueTypeModel ?? valueTypeName,
          optional: false,
          ...(typeRefs.size > 0 ? { typeRefs: [...typeRefs] } : {}),
        });
      };

      if (item.type === "typeAlias") {
        for (const constraintRef of collectConstraintRefs(item.node.declaration, item.name)) {
          dependencies.add(constraintRef);
        }

        const typeNode = item.node.declaration.getTypeNode();
        const registerDeclaredTypeDependencies = () => {
          for (const typeRef of collectTypeNodeRefModels(typeNode, item.name)) dependencies.add(typeRef);
        };

        // intersection constituents link like union members do
        if (item.node.type.isIntersection()) {
          for (const intersectionType of item.node.type.getIntersectionTypes()) {
            const memberName =
              intersectionType.getAliasSymbol()?.getName() ?? trimImport(intersectionType.getText());
            const memberModel = resolveExactModelReference(memberName, item.name, intersectionType);
            if (memberModel) dependencies.add(memberModel);
            else {
              for (const typeRef of collectTypeRefModels(intersectionType, item.name)) {
                dependencies.add(typeRef);
              }
            }
          }
        }

        // `typeof Enum` / `keyof typeof Enum` link the queried model
        const typeQueryNodes = [
          ...(typeNode?.isKind(ts.SyntaxKind.TypeQuery) ? [typeNode] : []),
          ...(typeNode?.getDescendantsOfKind(ts.SyntaxKind.TypeQuery) ?? []),
        ];
        for (const typeQueryNode of typeQueryNodes) {
          const queriedModel = resolveExactModelReference(
            typeQueryNode.getExprName().getText(),
            item.name,
            typeQueryNode.getType(),
          );
          if (queriedModel) dependencies.add(queriedModel);
        }
        if (typeNode?.isKind(ts.SyntaxKind.IndexedAccessType)) {
          const indexedAccessType = typeNode as IndexedAccessTypeNode;
          // first child which should be the object type
          const children = indexedAccessType.getChildren();
          const objectType = children[0];
          if (objectType) {
            const objectTypeName = trimImport(objectType.getText());
            const objectTypeModel = resolveExactModelReference(
              objectTypeName,
              item.name,
              objectType.getType(),
            );
            if (objectTypeModel) {
              dependencies.add(objectTypeModel);
            }
          }
        }

        // unresolved conditional types (generic aliases) render as their declared expression
        if (typeNode?.isKind(ts.SyntaxKind.ConditionalType)) {
          registerDeclaredTypeDependencies();
          model.schema.push({ name: "==>", type: typeNode.getText(), optional: false });
          dependencyMap.set(item.name, dependencies);
          continue;
        }

        // tuples render as their type text instead of dumping Array.prototype members
        if (item.node.type.isTuple()) {
          registerDeclaredTypeDependencies();
          const tupleText =
            typeNode?.getText() ??
            item.node.type.getText(item.node.declaration, ts.TypeFormatFlags.InTypeAlias);
          model.schema.push({ name: "==>", type: trimImport(tupleText), optional: false });
          dependencyMap.set(item.name, dependencies);
          continue;
        }

        if (
          [
            item.node.type.isNumber(),
            item.node.type.isString(),
            item.node.type.isBoolean(),
            item.node.type.isUndefined(),
            item.node.type.isNull(),
            item.node.type.isAny(),
            item.node.type.isUnknown(),
            item.node.type.isNever(),
            item.node.type.isEnum(),
            item.node.type.isEnumLiteral(),
            item.node.type.isLiteral(),
            item.node.type.isTemplateLiteral(),
          ].some(Boolean)
        ) {
          registerDeclaredTypeDependencies();
          model.schema.push({
            name: "==>",
            type:
              typeNode?.getText() ??
              item.node.type.getText(item.node.declaration, ts.TypeFormatFlags.InTypeAlias),
            optional: false,
          });
          dependencyMap.set(item.name, dependencies);
          continue;
        }

        if (item.node.type.isUnion()) {
          const types: (Model | ({} & string))[] = [];
          for (const type of item.node.type.getUnionTypes()) {
            const typeName = trimImport(type.getText());
            const typeModel = resolveExactModelReference(typeName, item.name, type);
            if (typeModel) dependencies.add(typeModel);
            types.push(typeModel ?? typeName);
          }

          for (const typeReference of typeNode?.getDescendantsOfKind(ts.SyntaxKind.TypeReference) ?? []) {
            const referenceName = trimImport(typeReference.getText());
            const referencedModel = resolveModelReference(referenceName, item.name, typeReference.getType());
            if (referencedModel) dependencies.add(referencedModel);
          }

          model.schema.push({ name: "==>", type: "union", types, optional: false });
          dependencyMap.set(item.name, dependencies);
          continue;
        }

        const typeAtLocation = this.checker.getTypeAtLocation(item.node.declaration);

        for (const prop of typeAtLocation.getProperties()) {
          const valueDeclaration = prop.getValueDeclaration() as PropertyDeclaration | undefined;

          if (valueDeclaration) {
            const substitutedType = this.checker.getTypeOfSymbolAtLocation(prop, item.node.declaration);
            addPropToSchema(valueDeclaration, substitutedType);
          } else {
            addSynthesizedPropertyToSchema(prop, item.node.declaration);
          }
        }

        // index-signature-only aliases (e.g. Record<string, T>) would otherwise render empty
        const declaredIndexSignatures =
          typeNode?.isKind(ts.SyntaxKind.TypeLiteral) ? typeNode.getIndexSignatures() : [];
        if (declaredIndexSignatures.length > 0) {
          for (const indexSignature of declaredIndexSignatures) {
            addIndexSignatureRow({
              keyName: "key",
              keyTypeName: indexSignature.getKeyType().getText(),
              valueType: indexSignature.getReturnType(),
              valueTypeNode: indexSignature.getReturnTypeNode(),
            });
          }
        } else {
          const declaredValueTypeNode =
            typeNode?.isKind(ts.SyntaxKind.TypeReference) ? typeNode.getTypeArguments().at(-1) : undefined;
          addIndexSignatureRow({
            keyName: "key",
            keyTypeName: "string",
            valueType: typeAtLocation.getStringIndexType(),
            valueTypeNode: declaredValueTypeNode,
          });
          addIndexSignatureRow({
            keyName: "key",
            keyTypeName: "number",
            valueType: typeAtLocation.getNumberIndexType(),
            valueTypeNode: declaredValueTypeNode,
          });
        }
      }

      if (item.type === "interface") {
        const headerModel = model.type === "class" ? model : item.model;
        const headerRefs = new Set(headerModel.headerRefs);
        for (const constraintRef of collectConstraintRefs(item.node.declaration, item.name)) {
          headerRefs.add(constraintRef);
          dependencies.add(constraintRef);
        }
        for (const extended of item.node.extends) {
          const extendsName = trimImport(extended.getText());
          const extendsModel = resolveExactModelReference(extendsName, item.name, extended.getType());
          if (extendsModel) {
            dependencies.add(extendsModel);
            if (
              headerModel.type === "class" &&
              (typeof headerModel.extends === "string" || headerModel.extends?.id !== extendsModel.id)
            ) {
              headerRefs.add(extendsModel);
            }
          } else {
            for (const headerRef of collectHeaderExpressionRefs(extended, item.name)) {
              headerRefs.add(headerRef);
              dependencies.add(headerRef);
            }
          }
        }
        if (headerRefs.size > 0) headerModel.headerRefs = [...headerRefs];

        const substitutedTypes = new Map<Prop, Type>();
        const interfaceType = this.checker.getTypeAtLocation(item.node.declaration);
        for (const symbol of interfaceType.getProperties()) {
          const symbolValueDeclaration = symbol.getValueDeclaration();
          if (!symbolValueDeclaration) continue;
          substitutedTypes.set(
            symbolValueDeclaration as Prop,
            this.checker.getTypeOfSymbolAtLocation(symbol, item.node.declaration),
          );
        }

        for (const member of [
          ...item.node.members,
          ...item.node.declaration.getGetAccessors(),
          ...item.node.declaration.getSetAccessors(),
        ]) {
          if (member instanceof TsMorphSymbol) {
            if (model.type === "class") continue;
            addSynthesizedPropertyToSchema(member, item.node.declaration);
            continue;
          }

          addPropToSchema(member, substitutedTypes.get(member));
        }

        const addSignatureRow = ({
          displayName,
          parameters,
          returnType,
          returnTypeNode,
          typeParameterNames = new Set<string>(),
        }: {
          displayName: string;
          parameters: { name: string; type: Type; typeNode?: TypeNode }[];
          returnType: Type;
          returnTypeNode?: TypeNode;
          typeParameterNames?: ReadonlySet<string>;
        }) => {
          const functionArguments: { name: string; type: Model | string }[] = [];
          const signatureTypeRefs = new Set<Model>();
          for (const parameter of parameters) {
            const parameterTypeName = trimImport(
              parameter.typeNode?.getText() ?? parameter.type.getText(item.node.declaration),
            );
            const parameterTypeModel = resolveExactModelReference(
              parameterTypeName,
              item.name,
              parameter.type,
            );
            if (parameterTypeModel) dependencies.add(parameterTypeModel);
            for (const typeRef of collectTextTypeRefs(
              parameter.type,
              parameter.typeNode,
              parameterTypeModel,
            )) {
              signatureTypeRefs.add(typeRef);
            }
            if (!parameter.typeNode && !parameterTypeModel) {
              for (const typeRef of collectCompilerTypeRefModels({
                type: parameter.type.compilerType,
                typeLocation: item.node.declaration,
                ownerName: item.name,
                typeParameterNames,
              })) {
                dependencies.add(typeRef);
                signatureTypeRefs.add(typeRef);
              }
            }
            functionArguments.push({
              name: sanitizePropertyName(parameter.name),
              type: parameterTypeModel ?? parameterTypeName,
            });
          }

          const returnTypeName = trimImport(
            returnTypeNode?.getText() ?? returnType.getText(item.node.declaration),
          );
          const returnTypeModel = resolveExactModelReference(returnTypeName, item.name, returnType);
          if (returnTypeModel) dependencies.add(returnTypeModel);
          for (const typeRef of collectTextTypeRefs(returnType, returnTypeNode, returnTypeModel)) {
            signatureTypeRefs.add(typeRef);
          }
          if (!returnTypeNode && !returnTypeModel) {
            for (const typeRef of collectCompilerTypeRefModels({
              type: returnType.compilerType,
              typeLocation: item.node.declaration,
              ownerName: item.name,
              typeParameterNames,
            })) {
              dependencies.add(typeRef);
              signatureTypeRefs.add(typeRef);
            }
          }

          model.schema.push({
            name: displayName,
            type: "function",
            arguments: functionArguments,
            returnType: returnTypeModel ?? returnTypeName,
            optional: false,
            ...(signatureTypeRefs.size > 0 ? { typeRefs: [...signatureTypeRefs] } : {}),
          });
        };

        const addSignatureProp = (
          signature: CallSignatureDeclaration | ConstructSignatureDeclaration,
          displayName: string,
        ) => {
          addSignatureRow({
            displayName,
            parameters: signature.getParameters().map((parameter) => ({
              name: parameter.getName(),
              type: parameter.getType(),
              typeNode: parameter.getTypeNode(),
            })),
            returnType: signature.getReturnType(),
            returnTypeNode: signature.getReturnTypeNode(),
            typeParameterNames: new Set(
              signature.getTypeParameters().map((parameter) => parameter.getName()),
            ),
          });
        };

        const addEffectiveSignature = (signature: Signature, displayName: string) => {
          addSignatureRow({
            displayName,
            parameters: signature.getParameters().map((parameter) => ({
              name: parameter.getName(),
              type: this.checker.getTypeOfSymbolAtLocation(parameter, item.node.declaration),
            })),
            returnType: signature.getReturnType(),
            typeParameterNames: new Set(
              signature
                .getTypeParameters()
                .map(
                  (parameter) => parameter.getSymbol()?.getName() ?? parameter.getText(item.node.declaration),
                ),
            ),
          });
        };

        for (const callSignature of item.node.callSignatures) addSignatureProp(callSignature, "");
        const declaredCallSignatures = new Set<ts.Node>(
          item.node.callSignatures.map((signature) => signature.compilerNode),
        );
        for (const signature of interfaceType.getCallSignatures()) {
          const declaration = signature.getDeclaration();
          if (declaration && declaredCallSignatures.has(declaration.compilerNode)) continue;
          addEffectiveSignature(signature, "");
        }
        for (const constructSignature of item.node.constructSignatures) {
          addSignatureProp(constructSignature, "new");
        }
        const declaredConstructSignatures = new Set<ts.Node>(
          item.node.constructSignatures.map((signature) => signature.compilerNode),
        );
        for (const signature of interfaceType.getConstructSignatures()) {
          const declaration = signature.getDeclaration();
          if (declaration && declaredConstructSignatures.has(declaration.compilerNode)) continue;
          addEffectiveSignature(signature, "new");
        }

        const declaredIndexSignatures = new Set(
          item.node.indexSignatures.map((indexSignature) => indexSignature.compilerNode),
        );
        // ts-morph wraps only the string and number index types, so other key types
        // resolve by text
        const inheritedIndexValueTypes = new Map([
          [this.tsChecker.getStringType(), interfaceType.getStringIndexType()],
          [this.tsChecker.getNumberType(), interfaceType.getNumberIndexType()],
        ]);
        for (const indexInfo of this.tsChecker.getIndexInfosOfType(interfaceType.compilerType)) {
          if (indexInfo.declaration && declaredIndexSignatures.has(indexInfo.declaration)) continue;
          addCompilerIndexSignatureRow(indexInfo, inheritedIndexValueTypes.get(indexInfo.keyType));
        }
        for (const indexSignature of item.node.indexSignatures) {
          addIndexSignatureRow({
            keyName: indexSignature.getKeyName(),
            keyTypeName: indexSignature.getKeyType().getText(),
            valueType: indexSignature.getReturnType(),
            valueTypeNode: indexSignature.getReturnTypeNode(),
          });
        }
      }

      if (item.type === "class") {
        const headerRefs = new Set(item.model.headerRefs);
        for (const constraintRef of collectConstraintRefs(item.node.declaration, item.name)) {
          headerRefs.add(constraintRef);
          dependencies.add(constraintRef);
        }
        if (item.node.extends) {
          const extendsName = trimImport(item.node.extends.getText());
          const extendsModel = resolveExactModelReference(
            extendsName,
            item.name,
            item.node.extends.getType(),
          );
          if (extendsModel) {
            dependencies.add(extendsModel);
          } else {
            for (const headerRef of collectHeaderExpressionRefs(item.node.extends, item.name)) {
              headerRefs.add(headerRef);
              dependencies.add(headerRef);
            }
          }
        }

        for (const implemented of item.node.implements) {
          const implementsName = trimImport(implemented.getText());
          const implementsModel = resolveExactModelReference(
            implementsName,
            item.name,
            implemented.getType(),
          );
          if (implementsModel) {
            dependencies.add(implementsModel);
          } else {
            for (const headerRef of collectHeaderExpressionRefs(implemented, item.name)) {
              headerRefs.add(headerRef);
              dependencies.add(headerRef);
            }
          }
        }
        if (headerRefs.size > 0) item.model.headerRefs = [...headerRefs];

        // see the interface branch: substitute inherited generic member types
        const substitutedTypes = new Map<Prop, Type>();
        for (const symbol of this.checker.getTypeAtLocation(item.node.declaration).getProperties()) {
          const symbolValueDeclaration = symbol.getValueDeclaration();
          if (!symbolValueDeclaration) continue;
          substitutedTypes.set(
            symbolValueDeclaration as Prop,
            this.checker.getTypeOfSymbolAtLocation(symbol, item.node.declaration),
          );
        }

        for (const prop of [
          ...item.node.properties,
          ...item.node.methods,
          ...item.node.declaration.getGetAccessors(),
          ...item.node.declaration.getSetAccessors(),
        ]) {
          addPropToSchema(prop, substitutedTypes.get(prop));
        }

        const mergedInterface = classMergedInterfaces.get(item.name);
        if (mergedInterface) {
          for (const member of mergedInterface.members) {
            if (!(member instanceof TsMorphSymbol)) continue;
            addSynthesizedPropertyToSchema(member, mergedInterface.declaration);
          }
        }
      }

      dependencyMap.set(item.name, dependencies);
    }

    // third pass: link dependencies
    for (const [name, dependencies] of dependencyMap.entries()) {
      const model = modelNameToModelMap.get(name);
      if (!model) continue;

      for (const dependency of dependencies) {
        model.dependencies.push(dependency);
        dependency.dependants.push(model);
      }
    }

    return models;
  }
}
