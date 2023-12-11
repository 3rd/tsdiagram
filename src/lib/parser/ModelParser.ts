import { Node, ts, MethodSignature } from "ts-morph";
import { ParsedClass, ParsedInterface, ParsedTypeAlias, Parser } from "./Parser";

type DefaultSchemaField = { name: string; type: Model | string };
type ArraySchemaField = { name: string; type: "array"; elementType: Model | (string & {}) };
type ReferenceSchemaField = {
  name: string;
  type: "reference";
  referenceName: string;
  arguments: (Model | (string & {}))[];
};
type FunctionSchemaField = {
  name: string;
  type: "function";
  arguments: { name: string; type: Model | string }[];
  returnType: Model | [Model | (string & {})] | (string & {});
};
type SchemaField = ArraySchemaField | DefaultSchemaField | FunctionSchemaField | ReferenceSchemaField;

export const isArraySchemaField = (field: SchemaField): field is ArraySchemaField => {
  return field.type === "array";
};
export const isReferenceSchemaField = (field: SchemaField): field is ReferenceSchemaField => {
  return field.type === "reference";
};
export const isFunctionSchemaField = (field: SchemaField): field is FunctionSchemaField => {
  return field.type === "function";
};
export const isDefaultSchemaField = (field: SchemaField): field is DefaultSchemaField => {
  return !isArraySchemaField(field) && !isReferenceSchemaField(field);
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
};
type TypeAliasModel = ModelBase & {
  type: "typeAlias";
};
type ClassModel = ModelBase & {
  type: "class";
};

export type Model = ClassModel | InterfaceModel | TypeAliasModel;

const trimImport = (str: string) => str.replace(`import("/source").`, "");

export class ModelParser extends Parser {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  getModels() {
    const models: Model[] = [];
    const modelNameToModelMap = new Map<string, Model>();
    const dependencyMap = new Map<string, Set<Model>>();

    // first pass: build nodes and models
    const items: ({ id: string; name: string; compilerType: ts.Type } & (
      | { type: "class"; model: ClassModel; node: ParsedClass }
      | { type: "interface"; model: InterfaceModel; node: ParsedInterface }
      | { type: "typeAlias"; model: TypeAliasModel; node: ParsedTypeAlias }
    ))[] = [];

    for (const _interface of this.interfaces) {
      const name = _interface.name;
      const compilerType = _interface.declaration.getType().compilerType;

      const model: InterfaceModel = {
        id: name,
        name,
        schema: [],
        dependencies: [],
        dependants: [],
        type: "interface",
        arguments: [],
      };

      for (const parameter of _interface.declaration.getTypeParameters()) {
        const parameterName = parameter.getName();
        const parameterType = parameter.getType();
        const parameterExtends = parameterType.getConstraint()?.getText();
        model.arguments.push({ name: parameterName, extends: parameterExtends });
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
      const name = typeAlias.name;
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
        const parameterName = parameter.getName();
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
      const name = currentClass.name;
      const type = currentClass.declaration.getType().compilerType;

      const model: ClassModel = {
        id: name,
        name,
        schema: [],
        dependencies: [],
        dependants: [],
        type: "class",
        arguments: [],
      };

      for (const parameter of currentClass.declaration.getTypeParameters()) {
        const parameterName = parameter.getName();
        const parameterType = parameter.getType();
        const parameterExtends = parameterType.getConstraint()?.getText();
        model.arguments.push({ name: parameterName, extends: parameterExtends });
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

    // second pass: parse schema
    for (const item of items) {
      const model = modelNameToModelMap.get(item.name);
      if (!model) continue;

      const dependencies = dependencyMap.get(item.name) ?? new Set<Model>();

      if (item.type === "typeAlias") {
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
            item.node.type.isUnion(),
          ].some(Boolean)
        ) {
          model.schema.push({ name: "==>", type: item.node.type.getText() });
          continue;
        }

        for (const prop of item.node.type.getProperties()) {
          const name = prop.getName();
          const signature = prop.getValueDeclaration() as MethodSignature;
          if (!signature) continue;
          const signatureType = signature.getType();

          // console.log(name, prop.getTypeAtLocation(signature).getText());

          // functions
          const callSignatures = signatureType.getCallSignatures();
          if (callSignatures.length === 1) {
            const callSignature = callSignatures[0];
            const functionArguments: { name: string; type: Model | string }[] = [];
            for (const parameter of callSignature.getParameters()) {
              const parameterName = parameter.getName();
              const parameterTypeName = trimImport(parameter.getTypeAtLocation(signature).getText());
              const parameterTypeModel = modelNameToModelMap.get(parameterTypeName);
              if (parameterTypeModel) dependencies.add(parameterTypeModel);
              functionArguments.push({ name: parameterName, type: parameterTypeModel ?? parameterTypeName });
            }

            const returnType = callSignature.getReturnType();
            const isArray = returnType.isArray();
            const returnTypeName = isArray
              ? trimImport(returnType.getArrayElementType()?.getText() ?? "")
              : trimImport(returnType.getText());
            const returnTypeModel = modelNameToModelMap.get(returnTypeName);
            if (returnTypeModel) dependencies.add(returnTypeModel);

            model.schema.push({
              name,
              type: "function",
              arguments: functionArguments,
              returnType: isArray ? [returnTypeModel ?? returnTypeName] : returnTypeModel ?? returnTypeName,
            });
            continue;
          }

          // arrays
          if (signatureType.isArray()) {
            const elementType = signatureType.getArrayElementType();
            if (!elementType) continue;
            const elementTypeName = trimImport(elementType.getText());
            const elementTypeModel = modelNameToModelMap.get(elementTypeName);

            model.schema.push({
              name,
              type: "array",
              elementType: elementTypeModel ?? elementTypeName,
            });
            if (elementTypeModel) dependencies.add(elementTypeModel);
            continue;
          }

          // generics
          const aliasSymbol = signatureType.getAliasSymbol();
          const symbol = aliasSymbol ?? signatureType.getSymbol();
          const typeArguments = aliasSymbol
            ? signatureType.getAliasTypeArguments()
            : signatureType.getTypeArguments();

          if (symbol && typeArguments.length > 0) {
            const genericName = symbol.getName();
            if (!genericName) continue;

            const genericModel = modelNameToModelMap.get(genericName);
            if (genericModel) dependencies.add(genericModel);

            const schemaField: ReferenceSchemaField = {
              name,
              type: "reference",
              referenceName: genericName,
              arguments: [],
            };

            for (const typeArgument of typeArguments) {
              const typeArgumentName = trimImport(typeArgument.getText());
              const typeArgumentModel = modelNameToModelMap.get(typeArgumentName);

              schemaField.arguments.push(typeArgumentModel ?? typeArgumentName);
              if (typeArgumentModel) dependencies.add(typeArgumentModel);
            }

            model.schema.push(schemaField);
            continue;
          }

          // default
          const propDeclaration = prop.getDeclarations()[0]?.compilerNode as ts.PropertyDeclaration;
          if (!propDeclaration) continue;

          const typeName = propDeclaration.type
            ? trimImport(propDeclaration.type.getText())
            : trimImport(signatureType.getText());
          const typeModel = modelNameToModelMap.get(typeName);
          // console.log("default", name, typeName, typeModel);
          if (typeModel) dependencies.add(typeModel);

          model.schema.push({ name, type: (typeModel ?? typeName) || "any" });
        }
      }

      if (item.type === "interface") {
        for (const prop of [
          ...item.node.properties,
          ...item.node.declaration.getMethods(),
          ...item.node.declaration.getGetAccessors(),
          ...item.node.declaration.getSetAccessors(),
        ]) {
          const name = prop.getName();

          // functions
          if (Node.isMethodSignature(prop)) {
            const callSignatures = prop.getType().getCallSignatures();
            if (callSignatures.length === 1) {
              const callSignature = callSignatures[0];
              const functionArguments: { name: string; type: Model | string }[] = [];

              for (const parameter of callSignature.getParameters()) {
                const parameterName = parameter.getName();
                const parameterTypeName = trimImport(parameter.getTypeAtLocation(prop).getText());
                const parameterTypeModel = modelNameToModelMap.get(parameterTypeName);
                if (parameterTypeModel) dependencies.add(parameterTypeModel);
                functionArguments.push({
                  name: parameterName,
                  type: parameterTypeModel ?? parameterTypeName,
                });
              }

              const returnType = callSignature.getReturnType();
              const isArray = returnType.isArray();
              const returnTypeName = isArray
                ? trimImport(returnType.getArrayElementType()?.getText() ?? "")
                : trimImport(returnType.getText());
              const returnTypeModel = modelNameToModelMap.get(returnTypeName);
              if (returnTypeModel) dependencies.add(returnTypeModel);

              model.schema.push({
                name,
                type: "function",
                arguments: functionArguments,
                returnType: isArray ? [returnTypeModel ?? returnTypeName] : returnTypeModel ?? returnTypeName,
              });
              continue;
            }
          }

          // arrays
          if (prop.getType().isArray()) {
            const elementType = prop.getType().getArrayElementType();
            if (!elementType) continue;
            const elementTypeName = trimImport(elementType.getText());
            const elementTypeModel = modelNameToModelMap.get(elementTypeName);

            model.schema.push({
              name,
              type: "array",
              elementType: elementTypeModel ?? elementTypeName,
            });
            if (elementTypeModel) dependencies.add(elementTypeModel);
            continue;
          }

          // generics
          const aliasSymbol = prop.getType().getAliasSymbol();
          const aliasArguments = prop.getType().getAliasTypeArguments();
          if (aliasSymbol && aliasArguments.length > 0) {
            const genericName = aliasSymbol.getName();
            if (!genericName) continue;

            const genericModel = modelNameToModelMap.get(genericName);
            if (genericModel) dependencies.add(genericModel);

            const schemaField: ReferenceSchemaField = {
              name,
              type: "reference",
              referenceName: genericName,
              arguments: [],
            };

            for (const typeArgument of aliasArguments) {
              const typeArgumentName = trimImport(typeArgument.getText());
              const typeArgumentModel = modelNameToModelMap.get(typeArgumentName);

              schemaField.arguments.push(typeArgumentModel ?? typeArgumentName);
              if (typeArgumentModel) dependencies.add(typeArgumentModel);
            }

            model.schema.push(schemaField);
            continue;
          }

          // default
          const typeName = trimImport(prop.getType().getText());
          const typeModel = modelNameToModelMap.get(typeName);
          if (typeModel) dependencies.add(typeModel);
          model.schema.push({
            name,
            type: typeModel ?? typeName,
          });
        }
      }

      if (item.type === "class") {
        for (const prop of [
          ...item.node.properties,
          ...item.node.declaration.getMethods(),
          ...item.node.declaration.getGetAccessors(),
          ...item.node.declaration.getSetAccessors(),
        ]) {
          const name = prop.getName();

          // functions
          if (Node.isMethodDeclaration(prop)) {
            const callSignatures = prop.getType().getCallSignatures();
            if (callSignatures.length === 1) {
              const callSignature = callSignatures[0];
              const functionArguments: { name: string; type: Model | string }[] = [];

              for (const parameter of callSignature.getParameters()) {
                const parameterName = parameter.getName();
                const parameterTypeName = trimImport(parameter.getTypeAtLocation(prop).getText());
                const parameterTypeModel = modelNameToModelMap.get(parameterTypeName);
                if (parameterTypeModel) dependencies.add(parameterTypeModel);
                functionArguments.push({
                  name: parameterName,
                  type: parameterTypeModel ?? parameterTypeName,
                });
              }

              const returnType = callSignature.getReturnType();
              const isArray = returnType.isArray();
              const returnTypeName = isArray
                ? trimImport(returnType.getArrayElementType()?.getText() ?? "")
                : trimImport(returnType.getText());
              const returnTypeModel = modelNameToModelMap.get(returnTypeName);
              if (returnTypeModel) dependencies.add(returnTypeModel);

              model.schema.push({
                name,
                type: "function",
                arguments: functionArguments,
                returnType: isArray ? [returnTypeModel ?? returnTypeName] : returnTypeModel ?? returnTypeName,
              });
              continue;
            }
          }

          // arrays
          if (prop.getType().isArray()) {
            const elementType = prop.getType().getArrayElementType();
            if (!elementType) continue;
            const elementTypeName = trimImport(elementType.getText());
            const elementTypeModel = modelNameToModelMap.get(elementTypeName);

            model.schema.push({
              name,
              type: "array",
              elementType: elementTypeModel ?? elementTypeName,
            });
            if (elementTypeModel) dependencies.add(elementTypeModel);
            continue;
          }

          // generics
          const aliasSymbol = prop.getType().getAliasSymbol();
          const aliasArguments = prop.getType().getAliasTypeArguments();
          if (aliasSymbol && aliasArguments.length > 0) {
            const genericName = aliasSymbol.getName();
            if (!genericName) continue;

            const genericModel = modelNameToModelMap.get(genericName);
            if (genericModel) dependencies.add(genericModel);

            const schemaField: ReferenceSchemaField = {
              name,
              type: "reference",
              referenceName: genericName,
              arguments: [],
            };

            for (const typeArgument of aliasArguments) {
              const typeArgumentName = trimImport(typeArgument.getText());
              const typeArgumentModel = modelNameToModelMap.get(typeArgumentName);

              schemaField.arguments.push(typeArgumentModel ?? typeArgumentName);
              if (typeArgumentModel) dependencies.add(typeArgumentModel);
            }

            model.schema.push(schemaField);
            continue;
          }

          // default
          const typeName = trimImport(prop.getType().getText());
          const typeModel = modelNameToModelMap.get(typeName);
          if (typeModel) dependencies.add(typeModel);
          model.schema.push({
            name,
            type: typeModel ?? typeName,
          });
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
