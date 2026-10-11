import {
  Node,
  ts,
  type GetAccessorDeclaration,
  type EnumMember,
  type MappedTypeNode,
  type MethodDeclaration,
  type MethodSignature,
  type ParameterDeclaration,
  type PropertyDeclaration,
  type PropertySignature,
  type SetAccessorDeclaration,
  type Signature,
  type Symbol as CompilerSymbol,
  type Type,
  type TypeNode,
  type TypeParameterDeclaration,
} from "ts-morph";
import { cleanName, type ClassRecord, type ObjectDeclarationRecord } from "./declarations";
import type { FunctionSchemaField, GenericSchemaField, SchemaFieldModifier } from "./model";
import type { ModelReference, ProjectedField } from "./projection";
import { trimSourcePath } from "./references";
import { projectMemberSignature } from "./signatures";
import {
  getArrayElementNode,
  getEffectiveTypeNode,
  projectTypeDisplay,
  type CompilerProjectionContext,
  type ProjectionContext,
} from "./type-display";
import {
  bindSignatureTypeArguments,
  collectTypeBindings,
  projectBoundType,
  resolveBoundTypeNode,
  type TypeBindings,
} from "./type-parameters";

type ClassPropertyDeclaration = ParameterDeclaration | PropertyDeclaration;

type MemberDeclaration =
  | ClassPropertyDeclaration
  | EnumMember
  | GetAccessorDeclaration
  | MethodDeclaration
  | MethodSignature
  | PropertySignature
  | SetAccessorDeclaration;

type Member = {
  name: string;
  kind: "property" | "method" | "get" | "set";
  declaration?: MemberDeclaration;
  type: Type;
  typeNode?: TypeNode;
  typeBindings: TypeBindings;
  location: Node;
  isOptional: boolean;
  isInherited: boolean;
  modifiers: SchemaFieldModifier[];
};

type MemberInput = {
  owner: ObjectDeclarationRecord;
  symbol?: CompilerSymbol;
  declaration?: MemberDeclaration;
  context: CompilerProjectionContext;
};

type ArrayPropertyInput = {
  member: Member;
  type: Type;
  elementType: Type;
};

type GenericPropertyInput = {
  member: Member;
  genericName: string;
  typeArguments: Type[];
};

const READONLY_CHECK_FLAG = 1 << 3;

const isClassPropertyDeclaration = (node: Node | undefined): node is ClassPropertyDeclaration =>
  Node.isPropertyDeclaration(node) || (Node.isParameterDeclaration(node) && node.isParameterProperty());

const isMemberDeclaration = (node: Node | undefined) =>
  Node.isEnumMember(node) ||
  isClassPropertyDeclaration(node) ||
  Node.isPropertySignature(node) ||
  Node.isMethodDeclaration(node) ||
  Node.isMethodSignature(node) ||
  Node.isGetAccessorDeclaration(node) ||
  Node.isSetAccessorDeclaration(node);

const getMemberContainer = (declaration: MemberDeclaration) =>
  Node.isParameterDeclaration(declaration) ? declaration.getParent().getParent() : declaration.getParent();

const isSynthesizedReadonly = (symbol: CompilerSymbol) => {
  const links: unknown = Reflect.get(symbol.compilerSymbol, "links");
  const hasLinks = typeof links === "object" && links !== null;
  if (!hasLinks) return false;

  const flags: unknown = Reflect.get(links, "checkFlags");
  return typeof flags === "number" && (flags & READONLY_CHECK_FLAG) !== 0;
};

const getMemberModifiers = (declaration: MemberDeclaration | undefined, symbol?: CompilerSymbol) => {
  const modifiers: SchemaFieldModifier[] = [];

  if (!declaration) {
    const isMappedReadonly = symbol !== undefined && isSynthesizedReadonly(symbol);
    if (isMappedReadonly) {
      modifiers.push("readonly");
    }

    return modifiers;
  }

  const hasScope = Node.isScoped(declaration) || Node.isScopeable(declaration);

  const scope = hasScope ? declaration.getScope() : undefined;
  const hasRestrictedScope = scope === "private" || scope === "protected";
  if (hasRestrictedScope) {
    modifiers.push(scope);
  }

  const isStatic = Node.isStaticable(declaration) && declaration.isStatic();
  if (isStatic) {
    modifiers.push("static");
  }

  const isReadonly = Node.isReadonlyable(declaration) && declaration.isReadonly();
  if (isReadonly) {
    modifiers.push("readonly");
  }

  const isAbstract = Node.isAbstractable(declaration) && declaration.isAbstract();
  if (isAbstract) {
    modifiers.push("abstract");
  }

  return modifiers;
};

const resolveParameterConstraint = (parameter: TypeParameterDeclaration) => {
  let constraint = parameter.getConstraint();
  const visited = new Set<Node>();

  while (Node.isTypeReference(constraint)) {
    if (visited.has(constraint)) {
      break;
    }

    visited.add(constraint);

    const typeParameter = constraint
      .getTypeName()
      .getSymbol()
      ?.getDeclarations()
      .find(Node.isTypeParameterDeclaration);
    constraint = typeParameter?.getConstraint();
  }

  return constraint;
};

const isSourcePropertyMapping = (declaration: MappedTypeNode) => {
  const value = declaration.getTypeNode();
  if (!Node.isIndexedAccessTypeNode(value)) return false;

  const parameter = declaration.getTypeParameter();
  const keySymbol = value.getIndexTypeNode().getType().getSymbol();
  const hasCurrentKey =
    keySymbol !== undefined && keySymbol.compilerSymbol === parameter.getSymbol()?.compilerSymbol;
  if (!hasCurrentKey) return false;

  const constraint = resolveParameterConstraint(parameter);
  if (!Node.isTypeOperatorTypeNode(constraint)) return false;

  return (
    constraint.getOperator() === ts.SyntaxKind.KeyOfKeyword &&
    constraint.getTypeNode().getType().compilerType === value.getObjectTypeNode().getType().compilerType
  );
};

const findMappedPropertyAnnotation = (type: Type, symbol: CompilerSymbol) => {
  const pending = [type];
  const visited = new Set<ts.Type>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (visited.has(current.compilerType)) continue;

    visited.add(current.compilerType);

    const property = current.getProperty(symbol.getName());
    if (property?.compilerSymbol !== symbol.compilerSymbol) continue;

    for (const declaration of current.getSymbol()?.getDeclarations() ?? []) {
      const isPropertyMapping = Node.isMappedTypeNode(declaration) && isSourcePropertyMapping(declaration);
      if (!isPropertyMapping) continue;

      const original = symbol
        .getDeclarations()
        .find((node) => Node.isPropertySignature(node) || isClassPropertyDeclaration(node));
      return original?.getTypeNode();
    }

    pending.push(...current.getBaseTypes(), ...current.getIntersectionTypes());
  }
};

const canUseMappedAnnotation = (node: TypeNode | undefined, member: Member, context: ProjectionContext) => {
  const declaredType = node ? resolveBoundTypeNode(node, member.typeBindings).getType() : undefined;
  const hasMatchingType =
    declaredType?.compilerType === member.type.compilerType ||
    (member.isOptional &&
      declaredType?.getNonNullableType().compilerType === member.type.getNonNullableType().compilerType);
  const hasRemovedUndefined =
    !member.isOptional &&
    declaredType?.getUnionTypes().some((part) => part.isUndefined()) === true &&
    !member.type.getUnionTypes().some((part) => part.isUndefined());
  const hasBoundAnnotation = !hasRemovedUndefined && projectBoundType(node, context) !== undefined;

  return hasMatchingType || hasBoundAnnotation;
};

const createMember = ({ owner, symbol, declaration, context }: MemberInput) => {
  const name = declaration?.getName() ?? symbol?.getName();
  if (!name) {
    throw new Error("A member requires a declaration or symbol.");
  }

  const type = symbol ? symbol.getTypeAtLocation(owner.declaration) : declaration?.getType();
  if (!type) {
    throw new Error(`Missing type for member ${name}.`);
  }

  const isInherited =
    owner.kind !== "typeAlias" &&
    (!declaration || getMemberContainer(declaration).getSymbol() !== owner.declaration.getSymbol());
  const typeBindings = collectTypeBindings(owner, name);
  const memberContext = { ...context, typeBindings };
  const member: Member = {
    name: cleanName(name),
    kind: "property",
    declaration,
    type,
    typeBindings,
    location: declaration ?? owner.declaration,
    isOptional: symbol?.hasFlags(ts.SymbolFlags.Optional) ?? false,
    isInherited,
    modifiers: getMemberModifiers(declaration, symbol),
  };

  if (!declaration) {
    const node = symbol ? findMappedPropertyAnnotation(owner.declaration.getType(), symbol) : undefined;
    if (canUseMappedAnnotation(node, member, memberContext)) {
      member.typeNode = node;
    }

    return member;
  }

  if (Node.isQuestionTokenable(declaration)) {
    member.isOptional = declaration.hasQuestionToken();
  }

  const isMethod = Node.isMethodDeclaration(declaration) || Node.isMethodSignature(declaration);
  const needsAccessorSubstitution =
    symbol !== undefined && declaration.getParent().getSymbol() !== owner.declaration.getSymbol();

  if (isMethod) {
    member.kind = "method";
  } else if (Node.isGetAccessorDeclaration(declaration)) {
    member.kind = "get";
    member.type = needsAccessorSubstitution
      ? symbol.getTypeAtLocation(owner.declaration)
      : declaration.getReturnType();
    member.typeNode = getEffectiveTypeNode(declaration.getReturnTypeNode(), member.type, memberContext);
  } else if (Node.isSetAccessorDeclaration(declaration)) {
    member.kind = "set";
    member.type = needsAccessorSubstitution
      ? symbol.getTypeAtLocation(context.compiler.setterLocation)
      : type;
  } else if (!Node.isEnumMember(declaration)) {
    member.typeNode = getEffectiveTypeNode(declaration.getTypeNode(), type, memberContext);
  }

  return member;
};

const getAccessorDeclarations = (symbol: CompilerSymbol) =>
  symbol
    .getDeclarations()
    .filter(
      (declaration) =>
        Node.isGetAccessorDeclaration(declaration) || Node.isSetAccessorDeclaration(declaration)
    );

const collectInheritedPropertyOrder = (owner: ObjectDeclarationRecord) => {
  const inheritedOrder = new Map<string, number>();

  if (owner.kind === "interface") {
    for (const declaration of owner.declarations) {
      for (const heritage of declaration.getExtends()) {
        for (const property of heritage.getType().getProperties()) {
          if (inheritedOrder.has(property.getName())) continue;

          inheritedOrder.set(property.getName(), inheritedOrder.size);
        }
      }
    }
  }

  return inheritedOrder;
};

const collectMembers = (owner: ObjectDeclarationRecord, context: CompilerProjectionContext) => {
  const properties: Member[] = [];
  const methods: Member[] = [];
  const getters: Member[] = [];
  const setters: Member[] = [];
  const type = owner.declaration.getType();
  const isAlias = owner.kind === "typeAlias";

  for (const symbol of type.getProperties()) {
    const declaration = symbol.getValueDeclaration();
    if (!declaration) {
      properties.push(createMember({ owner, symbol, context }));
      continue;
    }

    if (!isMemberDeclaration(declaration)) continue;

    const member = createMember({ owner, symbol, declaration, context });

    if (isAlias) {
      const isAccessor = member.kind === "get" || member.kind === "set";
      if (isAccessor) {
        for (const accessor of getAccessorDeclarations(symbol)) {
          properties.push(createMember({ owner, symbol, declaration: accessor, context }));
        }
      } else {
        properties.push(member);
      }

      continue;
    }

    if (member.kind === "property") {
      properties.push(member);
    } else if (member.kind === "method") {
      methods.push(member);
    } else {
      for (const accessor of getAccessorDeclarations(symbol)) {
        const isOwnAccessor = accessor.getParent().getSymbol() === owner.declaration.getSymbol();
        if (isOwnAccessor) continue;

        const inheritedAccessor = createMember({ owner, symbol, declaration: accessor, context });
        const group = inheritedAccessor.kind === "get" ? getters : setters;
        group.push(inheritedAccessor);
      }
    }
  }

  if (isAlias) return properties;

  const ownDeclarations =
    owner.kind === "class" ? [owner.declaration, ...owner.interfaces.slice(1)] : owner.declarations;

  for (const declaration of ownDeclarations) {
    for (const accessor of declaration.getGetAccessors()) {
      getters.push(createMember({ owner, symbol: accessor.getSymbol(), declaration: accessor, context }));
    }

    for (const accessor of declaration.getSetAccessors()) {
      setters.push(createMember({ owner, symbol: accessor.getSymbol(), declaration: accessor, context }));
    }
  }

  if (owner.kind === "class") {
    for (const property of owner.declaration.getStaticProperties()) {
      if (!Node.isPropertyDeclaration(property)) continue;

      properties.push(createMember({ owner, declaration: property, context }));
    }

    for (const method of owner.declaration.getStaticMethods()) {
      methods.push(createMember({ owner, declaration: method, context }));
    }
  }

  const inheritedOrder = collectInheritedPropertyOrder(owner);

  const compareMembers = (left: Member, right: Member) => {
    if (left.isInherited !== right.isInherited) return Number(right.isInherited) - Number(left.isInherited);
    if (!left.isInherited) return 0;

    const leftOrder = inheritedOrder.get(left.name);
    const rightOrder = inheritedOrder.get(right.name);
    const hasBothPositions = leftOrder !== undefined && rightOrder !== undefined;
    if (!hasBothPositions) return 0;

    return leftOrder - rightOrder;
  };

  return [properties, methods, getters, setters].flatMap((group) => group.sort(compareMembers));
};

const getOptionalPropertyType = (member: Member) => {
  if (!member.isOptional) return member.type;

  const hasNull = member.type.getUnionTypes().some((type) => type.isNull());
  if (!hasNull) return member.type.getNonNullableType();

  if (!member.typeNode) return member.type;

  const declaredType = member.typeNode.getType();

  const getSortedTypeTexts = (type: Type) =>
    (type.isUnion() ? type.getUnionTypes() : [type]).map((item) => item.getText()).sort();

  const withoutUndefined = member.type.getUnionTypes().filter((type) => !type.isUndefined());
  const isDeclaredType =
    JSON.stringify(getSortedTypeTexts(declaredType)) ===
    JSON.stringify(withoutUndefined.map((type) => type.getText()).sort());
  return isDeclaredType ? declaredType : member.type;
};

const projectAccessor = (member: Member, context: CompilerProjectionContext) => {
  const declaration = member.declaration;
  if (!declaration) {
    throw new Error(`Missing accessor declaration for ${member.name}.`);
  }

  const dependencies = new Set<ModelReference>();
  const typeRefs = new Set<ModelReference>();
  const field: FunctionSchemaField<ModelReference> = {
    name: member.name,
    type: "function",
    arguments: [],
    returnType: "void",
    optional: false,
  };

  if (Node.isGetAccessorDeclaration(declaration)) {
    const display = projectTypeDisplay({
      ...context,
      text: member.typeNode?.getText() ?? member.type.getText(),
      type: member.type,
      node: member.typeNode,
      shouldInspectCompilerType: true,
    });
    field.accessor = "get";
    field.returnType = display.value;

    for (const reference of display.references) {
      dependencies.add(reference);
    }

    for (const reference of display.nestedReferences) {
      typeRefs.add(reference);
    }
  } else if (Node.isSetAccessorDeclaration(declaration)) {
    field.accessor = "set";

    for (const parameter of declaration.getParameters()) {
      const shouldUseMemberType = member.isInherited || context.owner.kind === "typeAlias";
      const type = shouldUseMemberType ? member.type : parameter.getType();
      const node = getEffectiveTypeNode(parameter.getTypeNode(), type, context);
      const alias = type.getAliasSymbol();
      let text = trimSourcePath(type.getText());

      const declaredReference = node
        ? context.references.resolveExact({ text: node.getText(), type, owner: context.owner })
        : undefined;
      const hasDeclaredReference = declaredReference !== undefined && node !== undefined;
      const shouldUseAlias =
        alias !== undefined && !context.references.resolveExact({ text, type, owner: context.owner });

      if (hasDeclaredReference) {
        text = node.getText();
      } else if (shouldUseAlias) {
        text = alias.getName();
      }

      const display = projectTypeDisplay({ ...context, text, type, node, shouldInspectCompilerType: true });
      field.arguments.push({ name: cleanName(parameter.getName()), type: display.value });

      for (const reference of display.references) {
        dependencies.add(reference);
      }

      for (const reference of display.nestedReferences) {
        typeRefs.add(reference);
      }
    }
  }

  if (typeRefs.size > 0) {
    field.typeRefs = [...typeRefs];
  }

  return { fields: [field], references: [...dependencies] };
};

const projectFunctionProperty = (member: Member, signatures: Signature[], context: ProjectionContext) => {
  const returnNode =
    member.typeNode && Node.isFunctionTypeNode(member.typeNode)
      ? member.typeNode.getReturnTypeNode()
      : undefined;
  const declaration = member.declaration;
  const hasPropertyDeclaration =
    Node.isPropertySignature(declaration) || isClassPropertyDeclaration(declaration);
  const memberTypeNode = hasPropertyDeclaration ? declaration.getTypeNode() : member.typeNode;
  const rows = bindSignatureTypeArguments({
    signatures,
    context,
    memberName: member.name,
    memberTypeNode,
  }).map(({ signature, typeBindings }) =>
    projectMemberSignature(
      {
        signature,
        name: member.name,
        location: member.location,
        returnNode,
        isOptional: member.isOptional,
        modifiers: member.modifiers,
      },
      { ...context, typeBindings }
    )
  );

  return { fields: rows.flatMap((row) => row.fields), references: rows.flatMap((row) => row.references) };
};

const projectArrayProperty = (
  { member, type, elementType }: ArrayPropertyInput,
  context: ProjectionContext
) => {
  const element = getArrayElementNode(member.typeNode, context);
  const elementContext = { ...context, typeBindings: element?.typeBindings ?? context.typeBindings };
  const elementNode = getEffectiveTypeNode(element?.node, elementType, elementContext);
  const elementText =
    elementNode?.getText() ?? elementType.getAliasSymbol()?.getName() ?? elementType.getText();
  const elementDisplay = projectTypeDisplay({
    ...elementContext,
    text: elementText,
    type: elementType,
    node: elementNode,
    shouldInspectCompilerType: true,
  });
  const arrayField: ProjectedField = {
    name: member.name,
    type: "array",
    elementType: elementDisplay.value,
    optional: member.isOptional,
    ...(type.isReadonlyArray() ? { readonly: true } : {}),
    ...(elementDisplay.nestedReferences.length > 0 ? { typeRefs: elementDisplay.nestedReferences } : {}),
  };

  return { fields: [arrayField], references: elementDisplay.references };
};

const projectGenericProperty = (
  { member, genericName, typeArguments }: GenericPropertyInput,
  context: ProjectionContext
) => {
  const genericReference = context.references.resolveExact({ text: genericName, owner: context.owner });
  const references = new Set<ModelReference>();
  const typeRefs = new Set<ModelReference>();
  const argumentNodes =
    member.typeNode && Node.isTypeReference(member.typeNode) ? member.typeNode.getTypeArguments() : [];
  const genericField: GenericSchemaField<ModelReference> = {
    name: member.name,
    type: "generic",
    genericName,
    arguments: [],
    optional: member.isOptional,
  };

  if (genericReference) {
    references.add(genericReference);
    typeRefs.add(genericReference);
  }

  for (const [index, argument] of typeArguments.entries()) {
    const node = argumentNodes[index];
    const aliasName = argument.getAliasSymbol()?.getName();
    let argumentText = aliasName ?? trimSourcePath(argument.getText());

    const shouldKeepAnnotation = !aliasName && node !== undefined && Node.isTypeReference(node);
    if (shouldKeepAnnotation) {
      argumentText = trimSourcePath(node.getText());
    }

    const argumentDisplay = projectTypeDisplay({
      ...context,
      text: argumentText,
      type: argument,
      node,
      shouldInspectCompilerType: true,
    });

    genericField.arguments.push(argumentDisplay.value);

    for (const reference of argumentDisplay.references) {
      references.add(reference);
    }

    for (const reference of argumentDisplay.nestedReferences) {
      typeRefs.add(reference);
    }
  }

  if (typeRefs.size > 0) {
    genericField.typeRefs = [...typeRefs];
  }

  return { fields: [genericField], references: [...references] };
};

const projectDefaultProperty = (member: Member, type: Type, context: ProjectionContext) => {
  let text = trimSourcePath(type.getText());

  const hasOptionalUnion = member.isOptional && type.isUnion();
  if (hasOptionalUnion) {
    text = text
      .replace(/^undefined \| /, "")
      .replace(/ \| undefined$/, "")
      .replace(/ \| undefined \| /, " | ");
  }

  const declaration = member.declaration;
  const typeNode = member.typeNode;
  const hasPropertyAnnotation =
    (declaration === undefined || Node.isPropertySignature(declaration)) && typeNode !== undefined;
  if (hasPropertyAnnotation) {
    const declaredText = trimSourcePath(typeNode.getText());

    const reference = context.references.resolveExact({
      text: declaredText,
      type: typeNode.getType(),
      owner: context.owner,
    });
    if (reference) {
      text = declaredText;
    }
  }

  const direct = context.references.resolveExact({ text, type, owner: context.owner });
  const alias = type.getAliasSymbol();
  const shouldUseAlias = !direct && alias !== undefined;
  if (shouldUseAlias) {
    text = alias.getName();
  }

  const display = projectTypeDisplay({
    ...context,
    text,
    type,
    node: member.typeNode,
    shouldInspectCompilerType: true,
  });
  const field: ProjectedField = {
    name: member.name,
    type: display.value,
    optional: member.isOptional,
    ...(display.nestedReferences.length > 0 ? { typeRefs: display.nestedReferences } : {}),
  };

  return { fields: [field], references: display.references };
};

const projectProperty = (member: Member, context: CompilerProjectionContext) => {
  const type = getOptionalPropertyType(member);

  const callSignatures = type.getCallSignatures();
  if (callSignatures.length > 0) return projectFunctionProperty(member, callSignatures, context);

  const elementType = type.getArrayElementType();
  if (elementType) return projectArrayProperty({ member, type, elementType }, context);

  const alias = type.getAliasSymbol();
  const symbol = alias ?? type.getSymbol();
  const typeArguments = alias ? type.getAliasTypeArguments() : type.getTypeArguments();
  const hasGenericArguments = symbol !== undefined && typeArguments.length > 0;
  if (hasGenericArguments) {
    return projectGenericProperty({ member, genericName: symbol.getName(), typeArguments }, context);
  }

  return projectDefaultProperty(member, type, context);
};

const projectMemberRows = (members: Member[], context: CompilerProjectionContext) => {
  const fields: ProjectedField[] = [];
  const references = new Set<ModelReference>();

  for (const member of members) {
    const memberContext = { ...context, typeBindings: member.typeBindings };
    const isAccessor = member.kind === "get" || member.kind === "set";
    const result = isAccessor
      ? projectAccessor(member, memberContext)
      : projectProperty(member, memberContext);

    for (const field of result.fields) {
      if (member.isInherited) {
        field.inherited = true;
      }

      if (member.modifiers.length > 0) {
        field.modifiers = member.modifiers;
      }

      fields.push(field);
    }

    for (const reference of result.references) {
      references.add(reference);
    }
  }

  return { fields, references: [...references] };
};

export const projectMembers = (owner: ObjectDeclarationRecord, context: CompilerProjectionContext) =>
  projectMemberRows(collectMembers(owner, context), context);

export const projectMergedAccessors = (owner: ClassRecord, context: CompilerProjectionContext) => {
  const declaration = owner.interfaces[0];
  const accessors = [...(declaration?.getGetAccessors() ?? []), ...(declaration?.getSetAccessors() ?? [])];
  const members = accessors.map((accessor) =>
    createMember({ owner, symbol: accessor.getSymbol(), declaration: accessor, context })
  );
  return projectMemberRows(members, context);
};
