import ts from "typescript";
import { Parser } from "./Parser";

type DefaultSchemaField = { name: string; type: Model | string };
type ArraySchemaField = { name: string; type: "array"; elementType: Model | (string & {}) };
type GenericSchemaField = {
  name: string;
  type: "generic";
  genericName: string;
  arguments: (Model | (string & {}))[];
};
type SchemaField = ArraySchemaField | DefaultSchemaField | GenericSchemaField;

export const isArraySchemaField = (field: SchemaField): field is ArraySchemaField => {
  return field.type === "array";
};
export const isGenericSchemaField = (field: SchemaField): field is GenericSchemaField => {
  return field.type === "generic";
};
export const isDefaultSchemaField = (field: SchemaField): field is DefaultSchemaField => {
  return !isArraySchemaField(field) && !isGenericSchemaField(field);
};

export type Model = {
  id: string;
  name: string;
  schema: (ArraySchemaField | DefaultSchemaField | GenericSchemaField)[];
  dependencies: Model[];
  dependants: Model[];
};

const typeNodeToString = (checker: ts.TypeChecker, node: ts.Node) => {
  if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) && node.type) {
    if (ts.isArrayTypeNode(node.type)) {
      const elementType = node.type.elementType;
      return `${checker.typeToString(checker.getTypeFromTypeNode(elementType))}[]`;
    }
    return checker.typeToString(checker.getTypeFromTypeNode(node.type));
  }
  return checker.typeToString(checker.getTypeAtLocation(node));
};

// FIXME: proper access
const getTypeId = (type: ts.Type) => {
  return (type as unknown as { id: number }).id.toString();
};

export class ModelParser extends Parser {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  getModels() {
    const typeIdToModelMap = new Map<string, Model>();
    const dependencyMap = new Map<string, Set<Model>>();

    const nodes = this.getTopLevelNodes().filter((node) => {
      if (ts.isInterfaceDeclaration(node)) return true;
      // if it's not a type literal, it's not a model
      if (
        ts.isTypeAliasDeclaration(node) &&
        (node as { type?: ts.Node }).type?.kind === ts.SyntaxKind.TypeLiteral
      ) {
        return true;
      }
      return false;
    }) as (ts.InterfaceDeclaration | ts.TypeAliasDeclaration)[];

    // first pass: init models
    for (const node of nodes) {
      const type = this.checker.getTypeAtLocation(node);
      const id = getTypeId(type);
      const model: Model = {
        id,
        name: node.name.getText(),
        schema: [],
        dependencies: [],
        dependants: [],
      };
      typeIdToModelMap.set(id, model);
    }

    // second pass: parse schema
    for (const node of nodes) {
      const type = this.checker.getTypeAtLocation(node);
      const typeId = getTypeId(type);
      const model = typeIdToModelMap.get(typeId);
      if (!model) continue;

      const dependencies = dependencyMap.get(typeId) ?? new Set<Model>();

      for (const prop of type.getProperties()) {
        const propDeclaration = prop.getDeclarations()?.[0] as ts.PropertyDeclaration | undefined;
        if (!propDeclaration) continue;

        // arrays
        if (propDeclaration.type && ts.isArrayTypeNode(propDeclaration.type)) {
          const elementType = propDeclaration.type.elementType;
          const elementTypeNode = this.checker.getTypeFromTypeNode(elementType);

          const elementTypeId = getTypeId(elementTypeNode);
          const elementModel = typeIdToModelMap.get(elementTypeId);

          if (elementModel) dependencies.add(elementModel);

          model.schema.push({
            name: prop.name,
            type: "array",
            elementType: elementModel ?? this.checker.typeToString(elementTypeNode),
          });
          continue;
        }

        // generics
        if (propDeclaration.type && ts.isTypeReferenceNode(propDeclaration.type)) {
          const typeArguments = propDeclaration.type.typeArguments;
          if (!typeArguments || typeArguments.length === 0) {
            const typeModel = typeIdToModelMap.get(
              getTypeId(this.checker.getTypeFromTypeNode(propDeclaration.type))
            );
            if (typeModel) dependencies.add(typeModel);
            model.schema.push({
              name: prop.name,
              type:
                typeModel ??
                this.checker.typeToString(this.checker.getTypeFromTypeNode(propDeclaration.type)),
            });
            continue;
          }

          const genericName = propDeclaration.type.typeName.getText();

          const schemaField: GenericSchemaField = {
            name: prop.name,
            type: "generic",
            genericName,
            arguments: [],
          };

          for (const typeArgument of typeArguments) {
            const typeArgumentNode = this.checker.getTypeFromTypeNode(typeArgument);
            const typeArgumentId = getTypeId(typeArgumentNode);
            const typeArgumentModel = typeIdToModelMap.get(typeArgumentId);

            if (typeArgumentModel) dependencies.add(typeArgumentModel);

            schemaField.arguments.push(typeArgumentModel ?? this.checker.typeToString(typeArgumentNode));
          }

          model.schema.push(schemaField);
          continue;
        }

        // default
        const propTypeName = typeNodeToString(this.checker, propDeclaration);
        const propType = this.checker.getTypeOfSymbolAtLocation(prop, propDeclaration);
        const propTypeId = getTypeId(propType);
        const propTypeModel = typeIdToModelMap.get(propTypeId);

        if (propTypeModel) dependencies.add(propTypeModel);

        model.schema.push({
          name: prop.name,
          type: propTypeModel ?? propTypeName,
        });
      }

      dependencyMap.set(typeId, dependencies);
    }

    // third pass: link dependencies
    for (const [typeId, dependencies] of dependencyMap.entries()) {
      const model = typeIdToModelMap.get(typeId);
      if (!model) continue;

      for (const dependency of dependencies) {
        model.dependencies.push(dependency);
        dependency.dependants.push(model);
      }
    }

    return Array.from(typeIdToModelMap.values());
  }
}
