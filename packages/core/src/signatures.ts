import {
  Node,
  type CallSignatureDeclaration,
  type ConstructSignatureDeclaration,
  type ConstructorTypeNode,
  type FunctionDeclaration,
  type FunctionTypeNode,
  type ParameterDeclaration,
  type Signature,
  type Type,
  type TypeNode,
} from "ts-morph";
import { cleanName } from "./declarations";
import type { FunctionArgument, FunctionSchemaField, ModelTypeParameter, SchemaFieldModifier } from "./model";
import type { ModelReference } from "./projection";
import { trimSourcePath } from "./references";
import {
  getArrayElementNode,
  getEffectiveTypeNode,
  projectTypeDisplay,
  type ProjectionContext,
} from "./type-display";
import {
  collectParameterReferences,
  collectSignatureParameterReferences,
  projectSignatureTypeParameters,
  projectTypeParameter,
  projectBoundType,
} from "./type-parameters";

type CallableParameter = {
  name: string;
  type: Type;
  node?: TypeNode;
  isOptional?: boolean;
  isRest?: boolean;
  initializer?: string;
};

type CallableInput = {
  name: string;
  parameters: CallableParameter[];
  returnType: Type;
  returnNode?: TypeNode;
  typeParameters: ModelTypeParameter[];
  typeParameterReferences: ModelReference[];
  notation: "member" | "standalone";
  isInherited?: boolean;
  isOptional?: boolean;
  modifiers?: SchemaFieldModifier[];
};

type DeclaredSignature =
  | CallSignatureDeclaration
  | ConstructSignatureDeclaration
  | ConstructorTypeNode
  | FunctionDeclaration
  | FunctionTypeNode;

type EffectiveSignatureInput = {
  signature: Signature;
  name: string;
  isInherited?: boolean;
};

type MemberSignatureInput = EffectiveSignatureInput & {
  location: Node;
  returnNode?: TypeNode;
  isOptional: boolean;
  modifiers: SchemaFieldModifier[];
};

const getParameterModifiers = (parameter: ParameterDeclaration | undefined) => {
  if (!parameter) return {};

  const initializer = parameter.getInitializer()?.getText();
  const modifiers = initializer ? { initializer } : {};

  if (parameter.isRestParameter()) return { ...modifiers, isRest: true };
  if (parameter.hasQuestionToken()) return { ...modifiers, isOptional: true };
  if (!initializer) return modifiers;

  const parameters = parameter.compilerNode.parent.parameters;
  const following = parameters.slice(parameters.indexOf(parameter.compilerNode) + 1);

  const hasRequiredFollowingParameter = following.some(
    (candidate) => !candidate.questionToken && !candidate.initializer && !candidate.dotDotDotToken
  );
  if (hasRequiredFollowingParameter) return modifiers;

  return { ...modifiers, isOptional: true };
};

export const getSignatureDeclaration = (signature: Signature) => {
  if (!signature.compilerSignature.declaration) return;

  return signature.getDeclaration();
};

const getSignatureReturnNode = (signature: Signature) => {
  const declaration = getSignatureDeclaration(signature);
  if (!declaration) return;
  if (Node.isConstructorDeclaration(declaration)) return;

  return declaration.getReturnTypeNode();
};

const getReferencedArrayText = (parameter: CallableParameter, context: ProjectionContext) => {
  const element = getArrayElementNode(parameter.node, context);

  const elementType = parameter.type.getArrayElementType();
  if (!elementType) return;

  const elementContext = { ...context, typeBindings: element?.typeBindings ?? context.typeBindings };

  const elementNode = getEffectiveTypeNode(element?.node, elementType, elementContext);
  if (!elementNode) return;

  const elementText = projectBoundType(elementNode, elementContext)?.text ?? elementNode.getText();

  const elementReference = context.references.resolveExact({
    text: elementText,
    type: elementType,
    node: elementNode,
    owner: context.owner,
  });
  if (!elementReference) return;

  return `${parameter.type.isReadonlyArray() ? "readonly " : ""}${elementText}[]`;
};

const getMemberParameterText = (parameter: CallableParameter, context: ProjectionContext) => {
  let text = trimSourcePath(parameter.type.getText());

  const arrayText = getReferencedArrayText(parameter, context);
  if (arrayText) return arrayText;

  const node = parameter.node;
  const hasReferenceAnnotation = node !== undefined && Node.isTypeReference(node);
  if (hasReferenceAnnotation) {
    const declaredText = trimSourcePath(node.getText());

    const declaredReference = context.references.resolveExact({
      text: declaredText,
      type: parameter.type,
      owner: context.owner,
    });
    if (declaredReference) {
      text = declaredText;
    }
  }

  const directReference = context.references.resolveExact({
    text,
    type: parameter.type,
    owner: context.owner,
  });
  const alias = parameter.type.getAliasSymbol();

  const shouldKeepAlias = !directReference && alias !== undefined;
  if (shouldKeepAlias) return alias.getName();

  return text;
};

const getMemberReturnText = (input: CallableInput, context: ProjectionContext) => {
  const declaredText = input.returnNode ? trimSourcePath(input.returnNode.getText()) : undefined;
  const declaredReference = declaredText
    ? context.references.resolveExact({ text: declaredText, type: input.returnType, owner: context.owner })
    : undefined;

  const shouldUseDeclaredReference = declaredReference !== undefined && declaredText !== undefined;
  if (shouldUseDeclaredReference) return declaredText;

  const text = input.returnType.getAliasSymbol()?.getName() ?? trimSourcePath(input.returnType.getText());

  const effectiveReference = context.references.resolveExact({
    text,
    type: input.returnType,
    owner: context.owner,
  });
  if (effectiveReference) return text;

  return declaredText ?? text;
};

const projectCallableReturn = (
  input: CallableInput,
  context: ProjectionContext,
  typeParameterNames: ReadonlySet<string>
) => {
  const elementType = input.notation === "member" ? input.returnType.getArrayElementType() : undefined;
  const element = elementType ? getArrayElementNode(input.returnNode, context) : undefined;
  const elementContext = { ...context, typeBindings: element?.typeBindings ?? context.typeBindings };
  const elementNode = elementType
    ? getEffectiveTypeNode(element?.node, elementType, elementContext)
    : undefined;
  let returnText: string;

  if (elementType) {
    returnText =
      elementNode?.getText() ??
      elementType.getAliasSymbol()?.getName() ??
      trimSourcePath(elementType.getText());
  } else if (input.notation === "member") {
    returnText = getMemberReturnText(input, context);
  } else {
    returnText = input.returnNode?.getText() ?? input.returnType.getText(context.owner.declaration);
  }

  const display = projectTypeDisplay({
    ...elementContext,
    text: returnText,
    type: elementType ?? input.returnType,
    node: elementType ? elementNode : input.returnNode,
    typeParameterNames,
    shouldInspectCompilerType: true,
  });
  const returnType: FunctionSchemaField<ModelReference>["returnType"] = elementType
    ? [display.value]
    : display.value;

  return {
    returnType,
    isReadonlyArray: elementType !== undefined && input.returnType.isReadonlyArray(),
    references: display.references,
    nestedReferences: display.nestedReferences,
  };
};

const projectCallableRow = (input: CallableInput, context: ProjectionContext) => {
  const typeParameterNames = new Set(input.typeParameters.map((parameter) => parameter.name));
  const dependencies = new Set(input.typeParameterReferences);
  const nestedReferences = new Set(input.typeParameterReferences);
  const argumentsList: FunctionArgument<ModelReference>[] = [];

  for (const parameter of input.parameters) {
    const text =
      input.notation === "member"
        ? getMemberParameterText(parameter, context)
        : (parameter.node?.getText() ?? parameter.type.getText(context.owner.declaration));
    const display = projectTypeDisplay({
      ...context,
      text,
      type: parameter.type,
      node: parameter.node,
      typeParameterNames,
      shouldInspectCompilerType: true,
    });

    for (const reference of display.references) {
      dependencies.add(reference);
    }

    for (const reference of display.nestedReferences) {
      nestedReferences.add(reference);
    }

    argumentsList.push({
      name: cleanName(parameter.name),
      type: display.value,
      ...(parameter.isOptional ? { isOptional: true } : {}),
      ...(parameter.isRest ? { isRest: true } : {}),
      ...(parameter.initializer ? { initializer: parameter.initializer } : {}),
    });
  }

  const returned = projectCallableReturn(input, context, typeParameterNames);

  for (const reference of returned.references) {
    dependencies.add(reference);
  }

  for (const reference of returned.nestedReferences) {
    nestedReferences.add(reference);
  }

  const field: FunctionSchemaField<ModelReference> = {
    name: input.name,
    type: "function",
    arguments: argumentsList,
    returnType: returned.returnType,
    optional: input.isOptional ?? false,
  };

  if (input.typeParameters.length > 0) {
    field.typeParameters = input.typeParameters;
  }

  if (returned.isReadonlyArray) {
    field.returnTypeReadonly = true;
  }

  if (input.isInherited) {
    field.inherited = true;
  }

  const hasModifiers = input.modifiers !== undefined && input.modifiers.length > 0;
  if (hasModifiers) {
    field.modifiers = input.modifiers;
  }

  if (nestedReferences.size > 0) {
    field.typeRefs = [...nestedReferences];
  }

  return { fields: [field], references: [...dependencies] };
};

export const projectDeclaredSignature = (
  declaration: DeclaredSignature,
  name: string,
  context: ProjectionContext
) => {
  const typeParameters = declaration.forEachChildAsArray().filter(Node.isTypeParameterDeclaration);

  return projectCallableRow(
    {
      name,
      parameters: declaration.getParameters().map((parameter) => ({
        name: parameter.getName(),
        type: parameter.getType(),
        node: parameter.getTypeNode(),
        ...getParameterModifiers(parameter),
      })),
      returnType: declaration.getReturnType(),
      returnNode: declaration.getReturnTypeNode(),
      typeParameters: typeParameters.map(projectTypeParameter),
      typeParameterReferences: collectParameterReferences(typeParameters, context),
      notation: "standalone",
    },
    context
  );
};

const getCallableParameters = (signature: Signature, location: Node, context: ProjectionContext) =>
  signature.getParameters().map((parameter) => {
    const declaration = parameter.getDeclarations().find(Node.isParameterDeclaration);
    const type = parameter.getTypeAtLocation(location);

    return {
      name: parameter.getName(),
      type,
      node: getEffectiveTypeNode(declaration?.getTypeNode(), type, context),
      ...getParameterModifiers(declaration),
    };
  });

export const projectEffectiveSignature = (
  { signature, name, isInherited }: EffectiveSignatureInput,
  context: ProjectionContext
) =>
  projectCallableRow(
    {
      name,
      parameters: getCallableParameters(signature, context.owner.declaration, context),
      returnType: signature.getReturnType(),
      returnNode: getEffectiveTypeNode(getSignatureReturnNode(signature), signature.getReturnType(), context),
      typeParameters: projectSignatureTypeParameters(signature, context),
      typeParameterReferences: collectSignatureParameterReferences(signature, context),
      notation: "standalone",
      isInherited,
    },
    context
  );

export const projectMemberSignature = (
  {
    signature,
    name,
    location,
    returnNode: fallbackReturnNode,
    isInherited,
    isOptional,
    modifiers,
  }: MemberSignatureInput,
  context: ProjectionContext
) => {
  const returnType = signature.getReturnType();
  const declaredReturnNode = getSignatureReturnNode(signature) ?? fallbackReturnNode;
  const returnNode = getEffectiveTypeNode(declaredReturnNode, returnType, context);

  return projectCallableRow(
    {
      name,
      parameters: getCallableParameters(signature, location, context),
      returnType,
      returnNode,
      typeParameters: projectSignatureTypeParameters(signature, context),
      typeParameterReferences: collectSignatureParameterReferences(signature, context),
      notation: "member",
      isInherited,
      isOptional,
      modifiers,
    },
    context
  );
};
