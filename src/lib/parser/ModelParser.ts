import ts from "typescript";
import { Parser } from "./Parser";

type DefaultSchemaField = { name: string; type: Model | string };
type ArraySchemaField = { name: string; type: "array"; elementType: Model | (string & {}) };
type ReferenceSchemaField = {
  name: string;
  type: "reference";
  referenceName: string;
  arguments: (Model | (string & {}))[];
};
type SchemaField = ArraySchemaField | DefaultSchemaField | ReferenceSchemaField;

export const isArraySchemaField = (field: SchemaField): field is ArraySchemaField => {
  return field.type === "array";
};
export const isReferenceSchemaField = (field: SchemaField): field is ReferenceSchemaField => {
  return field.type === "reference";
};
export const isDefaultSchemaField = (field: SchemaField): field is DefaultSchemaField => {
  return !isArraySchemaField(field) && !isReferenceSchemaField(field);
};

export type Model = {
  id: string;
  name: string;
  schema: (ArraySchemaField | DefaultSchemaField | ReferenceSchemaField)[];
  dependencies: Model[];
  dependants: Model[];
};

// const typeNodeToString = (checker: ts.TypeChecker, node: ts.Node) => {
//   if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) && node.type) {
//     if (ts.isArrayTypeNode(node.type)) {
//       const elementType = node.type.elementType;
//       return `${checker.typeToString(checker.getTypeFromTypeNode(elementType))}[]`;
//     }
//     return checker.typeToString(checker.getTypeFromTypeNode(node.type));
//   }
//   return checker.typeToString(checker.getTypeAtLocation(node));
// };

export class ModelParser extends Parser {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  getModels() {
    const models: Model[] = [];
    const modelNameToModelMap = new Map<string, Model>();
    const dependencyMap = new Map<string, Set<Model>>();

    const nodes = (
      this.getTopLevelNodes().filter((node) => {
        if (ts.isInterfaceDeclaration(node)) return true;
        if (ts.isTypeAliasDeclaration(node)) return true;
        return false;
      }) as (ts.InterfaceDeclaration | ts.TypeAliasDeclaration)[]
    ).map((node) => {
      const type = this.checker.getTypeAtLocation(node);
      const typeSymbol = type.getSymbol();

      const id = node.name;
      const name = node.name.getText();

      return { id, name, node, type, typeSymbol };
    });

    // first pass: init models
    for (const node of nodes) {
      const model: Model = {
        id: node.name,
        name: node.name,
        schema: [],
        dependencies: [],
        dependants: [],
      };
      models.push(model);

      modelNameToModelMap.set(model.id, model);
    }

    // second pass: parse schema
    for (const node of nodes) {
      const model = modelNameToModelMap.get(node.name);
      if (!model) continue;

      const dependencies = dependencyMap.get(node.name) ?? new Set<Model>();

      for (const prop of node.type.getProperties()) {
        const propDeclaration = prop.getDeclarations()?.[0] as ts.PropertyDeclaration | undefined;
        if (!propDeclaration?.type) continue;

        // arrays
        if (ts.isArrayTypeNode(propDeclaration.type)) {
          const elementType = propDeclaration.type.elementType;
          const referencedTypeName = elementType.getText();
          const typeModel = modelNameToModelMap.get(referencedTypeName);

          model.schema.push({
            name: prop.name,
            type: "array",
            elementType:
              typeModel ?? this.checker.typeToString(this.checker.getTypeFromTypeNode(elementType)),
          });
          if (typeModel) dependencies.add(typeModel);
          continue;
        }

        // references
        if (ts.isTypeReferenceNode(propDeclaration.type)) {
          const typeArguments = propDeclaration.type.typeArguments;
          if (!typeArguments || typeArguments.length === 0) {
            const referencedTypeName = propDeclaration.type.typeName.getText();
            const typeModel = modelNameToModelMap.get(referencedTypeName);

            model.schema.push({
              name: prop.name,
              type:
                typeModel ??
                this.checker.typeToString(this.checker.getTypeFromTypeNode(propDeclaration.type)),
            });
            if (typeModel) dependencies.add(typeModel);
            continue;
          }

          const referenceName = propDeclaration.type.typeName.getText();

          const schemaField: ReferenceSchemaField = {
            name: prop.name,
            type: "reference",
            referenceName,
            arguments: [],
          };

          for (const typeArgument of typeArguments) {
            const typeArgumentNode = this.checker.getTypeFromTypeNode(typeArgument);

            if (ts.isTypeReferenceNode(typeArgument)) {
              const typeArgumentName = typeArgument.typeName.getText();
              const typeArgumentModel = modelNameToModelMap.get(typeArgumentName);

              schemaField.arguments.push(typeArgumentModel ?? typeArgumentName);
              if (typeArgumentModel) dependencies.add(typeArgumentModel);
              continue;
            }

            schemaField.arguments.push(this.checker.typeToString(typeArgumentNode));
          }

          model.schema.push(schemaField);
          continue;
        }

        // default
        model.schema.push({
          name: prop.name,
          type: this.checker.typeToString(this.checker.getTypeFromTypeNode(propDeclaration.type)),
        });
      }

      dependencyMap.set(node.name, dependencies);
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
