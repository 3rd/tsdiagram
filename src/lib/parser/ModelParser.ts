import {
  FunctionTypeNode,
  GetAccessorDeclaration,
  IndexedAccessTypeNode,
  MethodDeclaration,
  MethodSignature,
  ParameterDeclaration,
  PropertyDeclaration,
  PropertySignature,
  SetAccessorDeclaration,
  ts,
  Type,
  TypeNode,
  TypeReferenceNode,
} from "ts-morph";
import { ParsedClass, ParsedInterface, ParsedTypeAlias, Parser } from "./Parser";

type SharedSchemaField = { name: string; optional: boolean };
type DefaultSchemaField = SharedSchemaField & { type: Model | string };
type ArraySchemaField = SharedSchemaField & { type: "array"; elementType: Model | string };
type GenericSchemaField = SharedSchemaField & {
  type: "generic";
  genericName: string;
  arguments: (Model | string)[];
};
type FunctionSchemaField = SharedSchemaField & {
  type: "function";
  arguments: { name: string; type: Model | string }[];
  returnType: Model | [Model | string] | string;
};
type UnionSchemaField = SharedSchemaField & { type: "union"; types: (Model | string)[] };
type SchemaField =
  | ArraySchemaField
  | DefaultSchemaField
  | FunctionSchemaField
  | GenericSchemaField
  | UnionSchemaField;

type Prop =
  | GetAccessorDeclaration
  | MethodDeclaration
  | MethodSignature
  | PropertyDeclaration
  | PropertySignature
  | SetAccessorDeclaration;

export const isArraySchemaField = (field: SchemaField): field is ArraySchemaField => {
  return field.type === "array";
};
export const isGenericSchemaField = (field: SchemaField): field is GenericSchemaField => {
  return field.type === "generic";
};
export const isFunctionSchemaField = (field: SchemaField): field is FunctionSchemaField => {
  return field.type === "function";
};
export const isUnionSchemaField = (field: SchemaField): field is UnionSchemaField => {
  return field.type === "union";
};
export const isDefaultSchemaField = (field: SchemaField): field is DefaultSchemaField => {
  return !isArraySchemaField(field) && !isGenericSchemaField(field);
};

type ModelBase = {
  id: string;
  name: string;
  schema: SchemaField[];
  dependencies: Model[];
  dependants: Model[];
  arguments: { name: string; extends?: string }[];
};

type InterfaceModel = ModelBase & {
  type: "interface";
  extends: (Model | ({} & string))[];
};
type TypeAliasModel = ModelBase & {
  type: "typeAlias";
};
type ClassModel = ModelBase & {
  type: "class";
  extends?: Model | string;
  implements: (Model | ({} & string))[];
};

export type Model = ClassModel | InterfaceModel | TypeAliasModel;

const trimImport = (str: string) => str.replace(`import("/source").`, "");

const sanitizePropertyName = (name: string) => {
  return name.replace(/'/g, "").replace(/"/g, "");
};

export class ModelParser extends Parser {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  getModels() {
    const models: Model[] = [];
    const modelNameToModelMap = new Map<string, Model>();
    const dependencyMap = new Map<string, Set<Model>>();

    // first pass: build nodes and models
    const items: ((
      | { type: "class"; model: ClassModel; node: ParsedClass }
      | { type: "interface"; model: InterfaceModel; node: ParsedInterface }
      | { type: "typeAlias"; model: TypeAliasModel; node: ParsedTypeAlias }
    ) & { id: string; name: string; compilerType: ts.Type })[] = [];

    for (const _interface of this.interfaces) {
      const name = sanitizePropertyName(_interface.name);
      const compilerType = _interface.declaration.getType().compilerType;

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

      for (const parameter of _interface.declaration.getTypeParameters()) {
        const parameterName = sanitizePropertyName(parameter.getName());
        const parameterType = parameter.getType();
        const parameterExtends = parameterType.getConstraint()?.getText();
        model.arguments.push({ name: parameterName, extends: parameterExtends });
      }

      for (const extendsExpression of _interface.extends) {
        const extendsName = trimImport(extendsExpression.getText());
        const extendsModel = modelNameToModelMap.get(extendsName);
        if (extendsModel) {
          model.extends.push(extendsModel);
        } else model.extends.push(extendsName);
      }

      models.push(model);

      modelNameToModelMap.set(model.id, model);
      items.push({
        type: "interface",
        id: name,
        name,
        node: _interface,
        compilerType,
        model,
      });
    }

    for (const typeAlias of this.typeAliases) {
      const name = sanitizePropertyName(typeAlias.name);
      const type = typeAlias.declaration.getType().compilerType;

      const model: TypeAliasModel = {
        id: name,
        name,
        schema: [],
        dependencies: [],
        dependants: [],
        type: "typeAlias",
        arguments: [],
      };

      for (const parameter of typeAlias.declaration.getTypeParameters()) {
        const parameterName = sanitizePropertyName(parameter.getName());
        const parameterType = parameter.getType();
        const parameterExtends = parameterType.getConstraint()?.getText();
        model.arguments.push({ name: parameterName, extends: parameterExtends });
      }

      models.push(model);
      modelNameToModelMap.set(model.id, model);

      items.push({
        type: "typeAlias",
        id: name,
        name,
        node: typeAlias,
        compilerType: type,
        model,
      });
    }

    for (const currentClass of this.classes) {
      const name = sanitizePropertyName(currentClass.name);
      const type = currentClass.declaration.getType().compilerType;

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

      for (const parameter of currentClass.declaration.getTypeParameters()) {
        const parameterName = sanitizePropertyName(parameter.getName());
        const parameterType = parameter.getType();
        const parameterExtends = parameterType.getConstraint()?.getText();
        model.arguments.push({ name: parameterName, extends: parameterExtends });
      }

      if (currentClass.extends) {
        const extendsName = sanitizePropertyName(trimImport(currentClass.extends.getText()));
        const extendsModel = modelNameToModelMap.get(extendsName);
        if (extendsModel) {
          model.extends = extendsModel;
        } else model.extends = extendsName;
      }

      if (currentClass.implements.length > 0) {
        for (const implementsExpression of currentClass.implements) {
          const implementsName = sanitizePropertyName(trimImport(implementsExpression.getText()));
          const implementsModel = modelNameToModelMap.get(implementsName);
          model.implements.push(implementsModel ?? implementsName);
        }
      }

      models.push(model);
      modelNameToModelMap.set(model.id, model);

      items.push({
        type: "class",
        id: name,
        name,
        node: currentClass,
        compilerType: type,
        model,
      });
    }

    // second pass: parse schema and root dependencies
    for (const item of items) {
      const model = modelNameToModelMap.get(item.name);
      if (!model) continue;

      const dependencies = dependencyMap.get(item.name) ?? new Set<Model>();

      // helpers
      const addFunctionProp = (prop: Prop, type?: Type) => {
        const propName = sanitizePropertyName(prop.getName());
        const propType = type ?? prop.getType();
        const propKind = "getKind" in prop ? prop.getKind() : undefined;

        const registerTypeDependencies = (currentType?: Type, seen = new Set<Type>()) => {
          if (!currentType || seen.has(currentType)) return;
          seen.add(currentType);

          const aliasSymbol = currentType.getAliasSymbol();
          if (aliasSymbol) {
            const aliasName = aliasSymbol.getName();
            const aliasModel = modelNameToModelMap.get(aliasName);
            if (aliasModel) dependencies.add(aliasModel);
          }

          const symbol = currentType.getSymbol();
          if (symbol) {
            const symbolName = trimImport(symbol.getName());
            const symbolModel = modelNameToModelMap.get(symbolName);
            if (symbolModel) dependencies.add(symbolModel);
          }

          if (currentType.isArray()) {
            const elementType = currentType.getArrayElementType();
            if (elementType) registerTypeDependencies(elementType, seen);
          }

          if (currentType.isTuple()) {
            for (const elementType of currentType.getTupleElements()) {
              registerTypeDependencies(elementType, seen);
            }
          }

          for (const typeArgument of currentType.getTypeArguments()) {
            registerTypeDependencies(typeArgument, seen);
          }

          if (currentType.isUnion()) {
            for (const unionType of currentType.getUnionTypes()) {
              registerTypeDependencies(unionType, seen);
            }
          }

          if (currentType.isIntersection()) {
            for (const intersectionType of currentType.getIntersectionTypes()) {
              registerTypeDependencies(intersectionType, seen);
            }
          }
        };

        const registerTypeDependenciesFromNode = (node?: TypeNode) => {
          if (!node) return;

          const addFromName = (name: string) => {
            const associatedModel = modelNameToModelMap.get(name);
            if (associatedModel) dependencies.add(associatedModel);
          };

          const trimmed = trimImport(node.getText());
          addFromName(trimmed);

          for (const typeReference of node.getDescendantsOfKind(ts.SyntaxKind.TypeReference)) {
            addFromName(trimImport(typeReference.getText()));
          }
        };

        const toArgumentSchema = (argumentName: string, argumentType: Type, typeNode?: TypeNode) => {
          let argumentTypeName = trimImport(argumentType.getText());

          if (typeNode?.isKind(ts.SyntaxKind.TypeReference)) {
            const nodeName = trimImport(typeNode.getText());
            if (modelNameToModelMap.get(nodeName)) {
              argumentTypeName = nodeName;
            }
          }

          const aliasSymbol = argumentType.getAliasSymbol();
          if (!modelNameToModelMap.get(argumentTypeName) && aliasSymbol) {
            argumentTypeName = aliasSymbol.getName();
          }

          const argumentTypeModel = modelNameToModelMap.get(argumentTypeName);
          if (argumentTypeModel) dependencies.add(argumentTypeModel);
          registerTypeDependencies(argumentType);
          registerTypeDependenciesFromNode(typeNode);

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
          const returnTypeModel = modelNameToModelMap.get(returnTypeName);
          if (returnTypeModel) dependencies.add(returnTypeModel);
          registerTypeDependencies(returnType);
          registerTypeDependenciesFromNode(returnTypeNode);

          model.schema.push({
            name: propName,
            type: "function",
            arguments: [],
            returnType: returnTypeModel ?? returnTypeName,
            optional: false,
          });
          return true;
        }

        if (propKind === ts.SyntaxKind.SetAccessor) {
          const setter = prop as SetAccessorDeclaration;
          const parameters = setter.getParameters();
          const functionArguments: { name: string; type: Model | string }[] = [];

          for (const parameter of parameters) {
            const parameterName = sanitizePropertyName(parameter.getName());
            const parameterType = parameter.getType();
            functionArguments.push(
              toArgumentSchema(parameterName, parameterType, parameter.getTypeNode() ?? undefined)
            );
          }

          registerTypeDependenciesFromNode(parameters[0]?.getTypeNode?.() ?? undefined);

          model.schema.push({
            name: propName,
            type: "function",
            arguments: functionArguments,
            returnType: "void",
            optional: false,
          });
          return true;
        }

        const callSignatures = propType.getCallSignatures();
        if (callSignatures.length === 0) return false;

        const propDeclarations = prop.getSymbol?.()?.getDeclarations?.() ?? [];

        const callSignature = (() => {
          if (callSignatures.length === 1) return callSignatures[0];

          const matchByDeclaration = callSignatures.find((signature) => {
            const declaration = signature.getDeclaration();
            if (!declaration) return false;
            return propDeclarations.includes(declaration);
          });
          if (matchByDeclaration) return matchByDeclaration;

          const matchByBody = callSignatures.find((signature) => {
            const declaration = signature.getDeclaration();
            if (!declaration) return false;
            if ("getBody" in declaration && typeof declaration.getBody === "function") {
              return Boolean(declaration.getBody());
            }
            return false;
          });
          if (matchByBody) return matchByBody;

          return callSignatures[callSignatures.length - 1];
        })();

        if (!callSignature) return false;

        const functionArguments: { name: string; type: Model | string }[] = [];

        for (const parameter of callSignature.getParameters()) {
          const parameterName = sanitizePropertyName(parameter.getName());
          const parameterType = parameter.getTypeAtLocation(prop);
          const parameterDeclaration = parameter.getDeclarations()?.[0];
          const parameterTypeNode = parameterDeclaration?.isKind(ts.SyntaxKind.Parameter)
            ? (parameterDeclaration as ParameterDeclaration).getTypeNode() ?? undefined
            : undefined;

          functionArguments.push(toArgumentSchema(parameterName, parameterType, parameterTypeNode));
        }

        const declaredReturnTypeNode = (() => {
          const candidateNodes: TypeNode[] = [];

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

          const signatureDeclaration = callSignature.getDeclaration();
          if (signatureDeclaration && "getReturnTypeNode" in signatureDeclaration) {
            const signatureReturnTypeNode = signatureDeclaration.getReturnTypeNode();
            if (signatureReturnTypeNode) candidateNodes.push(signatureReturnTypeNode);
          }

          if (candidateNodes.length === 0) {
            for (const signature of callSignatures) {
              const declaration = signature.getDeclaration();
              if (!declaration || !("getReturnTypeNode" in declaration)) continue;
              const signatureReturnTypeNode = declaration.getReturnTypeNode();
              if (signatureReturnTypeNode) candidateNodes.push(signatureReturnTypeNode);
            }
          }

          return (
            candidateNodes.find((node) => {
              const text = trimImport(node.getText());
              return Boolean(modelNameToModelMap.get(text));
            }) ?? candidateNodes[0]
          );
        })();

        const declaredReturnTypeName = declaredReturnTypeNode
          ? trimImport(declaredReturnTypeNode.getText())
          : undefined;

        const returnType = callSignature.getReturnType();
        const isArray = returnType.isArray();
        let returnTypeName = "";

        if (isArray) {
          const elementType = returnType.getArrayElementType();
          if (elementType) {
            const aliasSymbol = elementType.getAliasSymbol();
            returnTypeName = aliasSymbol ? aliasSymbol.getName() : trimImport(elementType.getText());
          }
        } else if (declaredReturnTypeName) {
          returnTypeName = declaredReturnTypeName;
        } else {
          const aliasSymbol = returnType.getAliasSymbol();
          returnTypeName = aliasSymbol ? aliasSymbol.getName() : trimImport(returnType.getText());
        }

        const returnTypeModel = modelNameToModelMap.get(returnTypeName);
        if (returnTypeModel) dependencies.add(returnTypeModel);

        registerTypeDependencies(returnType);

        if (declaredReturnTypeNode) {
          const declaredText = trimImport(declaredReturnTypeNode.getText());
          const declaredModel = modelNameToModelMap.get(declaredText);
          if (declaredModel) dependencies.add(declaredModel);
          registerTypeDependenciesFromNode(declaredReturnTypeNode);
        }

        let optional = false;
        if (prop.isKind?.(ts.SyntaxKind.PropertySignature)) {
          optional = prop.hasQuestionToken();
        }

        model.schema.push({
          name: propName,
          type: "function",
          arguments: functionArguments,
          returnType: isArray ? [returnTypeModel ?? returnTypeName] : returnTypeModel ?? returnTypeName,
          optional,
        });
        return true;
      };

      const addArrayProp = (prop: Prop, type?: Type) => {
        const propName = sanitizePropertyName(prop.getName());
        const propType = type ?? prop.getType();

        if (!propType.isArray()) return false;

        const elementType = propType.getArrayElementType();
        if (!elementType) return false;

        // check if the element type has an alias symbol
        const aliasSymbol = elementType.getAliasSymbol();
        const elementTypeName = aliasSymbol ? aliasSymbol.getName() : trimImport(elementType.getText());
        const elementTypeModel = modelNameToModelMap.get(elementTypeName);

        let optional = false;
        if (prop.isKind(ts.SyntaxKind.PropertySignature)) {
          optional = prop.hasQuestionToken();
        }

        model.schema.push({
          name: propName,
          type: "array",
          elementType: elementTypeModel ?? elementTypeName,
          optional,
        });
        if (elementTypeModel) dependencies.add(elementTypeModel);

        return true;
      };

      const addGenericProp = (prop: Prop, type?: Type) => {
        const propName = sanitizePropertyName(prop.getName());
        const propType = type ?? prop.getType();

        const aliasSymbol = propType.getAliasSymbol();
        const symbol = aliasSymbol ?? propType.getSymbol();
        const typeArguments = aliasSymbol ? propType.getAliasTypeArguments() : propType.getTypeArguments();
        const typeNode =
          "getTypeNode" in prop ? (prop.getTypeNode() as TypeReferenceNode | undefined) : undefined;
        const typeNodeArguments = typeNode?.isKind(ts.SyntaxKind.TypeReference)
          ? typeNode.getTypeArguments()
          : [];

        if (symbol && typeArguments.length > 0) {
          const genericName = symbol.getName();
          if (!genericName) return false;

          const genericModel = modelNameToModelMap.get(genericName);
          if (genericModel) dependencies.add(genericModel);

          let optional = false;
          if (prop.isKind(ts.SyntaxKind.PropertySignature)) {
            optional = prop.hasQuestionToken();
          }

          const schemaField: GenericSchemaField = {
            name: propName,
            type: "generic",
            genericName,
            arguments: [],
            optional,
          };

          for (const [i, typeArgument] of typeArguments.entries()) {
            let typeArgumentName = trimImport(typeArgument.getText());

            // check if type argument has an alias symbol
            const typeArgumentAliasSymbol = typeArgument.getAliasSymbol();
            if (typeArgumentAliasSymbol) {
              typeArgumentName = typeArgumentAliasSymbol.getName();
            } else if (typeNodeArguments[i] && typeNodeArguments[i].isKind(ts.SyntaxKind.TypeReference)) {
              typeArgumentName = trimImport(typeNodeArguments[i].getText());
            }

            const typeArgumentModel = modelNameToModelMap.get(typeArgumentName);

            schemaField.arguments.push(typeArgumentModel ?? typeArgumentName);
            if (typeArgumentModel) dependencies.add(typeArgumentModel);
          }

          model.schema.push(schemaField);
          return true;
        }

        return false;
      };

      const addDefaultProp = (prop: Prop, type?: Type) => {
        const propName = sanitizePropertyName(prop.getName());
        const propType = type ?? prop.getType();
        let typeName = trimImport(propType.getText());

        // try to get the type from the property's actual declaration
        const symbolDeclaration = prop.getSymbol?.()?.getDeclarations()?.[0];
        if (symbolDeclaration?.isKind(ts.SyntaxKind.PropertySignature)) {
          const declarationName = symbolDeclaration.getTypeNode()?.getText();
          if (declarationName) {
            const declarationTypeName = trimImport(declarationName);
            const declarationTypeModel = modelNameToModelMap.get(declarationTypeName);
            if (declarationTypeModel) {
              typeName = declarationTypeName;
            }
          }
        }

        // fallback: check if this type has an alias symbol
        if (!modelNameToModelMap.get(typeName)) {
          const aliasSymbol = propType.getAliasSymbol();
          if (aliasSymbol) {
            typeName = aliasSymbol.getName();
          }
        }

        const typeModel = modelNameToModelMap.get(typeName);
        if (typeModel) dependencies.add(typeModel);

        let optional = false;
        if (
          prop.isKind?.(ts.SyntaxKind.PropertySignature) ||
          prop.isKind?.(ts.SyntaxKind.PropertyDeclaration)
        ) {
          optional = prop.hasQuestionToken();
        }

        model.schema.push({
          name: propName,
          type: typeModel ?? typeName,
          optional,
        });
      };

      if (item.type === "typeAlias") {
        // check for indexed access type
        const typeNode = item.node.declaration.getTypeNode();
        if (typeNode?.isKind(ts.SyntaxKind.IndexedAccessType)) {
          const indexedAccessType = typeNode as IndexedAccessTypeNode;
          // first child which should be the object type
          const children = indexedAccessType.getChildren();
          const objectType = children[0];
          if (objectType) {
            const objectTypeName = trimImport(objectType.getText());
            const objectTypeModel = modelNameToModelMap.get(objectTypeName);
            if (objectTypeModel) {
              dependencies.add(objectTypeModel);
            }
          }
        }

        if (
          [
            //
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
          ].some(Boolean)
        ) {
          model.schema.push({ name: "==>", type: item.node.type.getText(), optional: false });
          dependencyMap.set(item.name, dependencies);
          continue;
        }

        if (item.node.type.isUnion()) {
          const types: (Model | ({} & string))[] = [];
          for (const type of item.node.type.getUnionTypes()) {
            const typeName = trimImport(type.getText());
            const typeModel = modelNameToModelMap.get(typeName);
            if (typeModel) dependencies.add(typeModel);
            types.push(typeModel ?? typeName);
          }

          model.schema.push({ name: "==>", type: "union", types, optional: false });
          dependencyMap.set(item.name, dependencies);
          continue;
        }

        const typeAtLocation = this.checker.getTypeAtLocation(item.node.declaration);

        for (const prop of typeAtLocation.getProperties()) {
          const valueDeclaration = prop.getValueDeclaration() as PropertyDeclaration | undefined;

          if (valueDeclaration) {
            if (addFunctionProp(valueDeclaration)) continue;
            if (addArrayProp(valueDeclaration)) continue;
            if (addGenericProp(valueDeclaration)) continue;
            addDefaultProp(valueDeclaration);
          } else {
            const propType = this.checker.getTypeOfSymbolAtLocation(prop, item.node.declaration);
            const fakeProp = {
              getName: () => prop.getName(),
              getType: () => propType,
              getSymbol: () => prop,
              isKind: () => false,
              hasQuestionToken: () => false,
            } as unknown as Prop;

            if (addFunctionProp(fakeProp, propType)) continue;
            if (addArrayProp(fakeProp, propType)) continue;
            if (addGenericProp(fakeProp, propType)) continue;
            addDefaultProp(fakeProp, propType);
          }
        }
      }

      if (item.type === "interface") {
        for (const extended of item.node.extends) {
          const extendsName = trimImport(extended.getText());
          const extendsModel = modelNameToModelMap.get(extendsName);
          if (extendsModel) dependencies.add(extendsModel);
        }

        for (const prop of [
          ...item.node.members,
          ...item.node.declaration.getGetAccessors(),
          ...item.node.declaration.getSetAccessors(),
        ]) {
          if (addFunctionProp(prop)) continue;
          if (addArrayProp(prop)) continue;
          if (addGenericProp(prop)) continue;
          addDefaultProp(prop);
        }
      }

      if (item.type === "class") {
        if (item.node.extends) {
          const extendsName = trimImport(item.node.extends.getText());
          const extendsModel = modelNameToModelMap.get(extendsName);
          if (extendsModel) dependencies.add(extendsModel);
        }

        for (const implemented of item.node.implements) {
          const implementsName = trimImport(implemented.getText());
          const implementsModel = modelNameToModelMap.get(implementsName);
          if (implementsModel) dependencies.add(implementsModel);
        }

        for (const prop of [
          ...item.node.properties,
          ...item.node.methods,
          ...item.node.declaration.getGetAccessors(),
          ...item.node.declaration.getSetAccessors(),
        ]) {
          if (addFunctionProp(prop)) continue;
          if (addArrayProp(prop)) continue;
          if (addGenericProp(prop)) continue;
          addDefaultProp(prop);
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
