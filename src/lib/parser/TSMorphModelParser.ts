import ts from "typescript";
import { ParsedInterface, ParsedTypeAlias, Parser } from "./TSMorphParser";

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

type ModelBase = {
  id: string;
  name: string;
  schema: (ArraySchemaField | DefaultSchemaField | ReferenceSchemaField)[];
  dependencies: Model[];
  dependants: Model[];
};

type InterfaceModel = ModelBase & { type: "interface" };
type TypeAliasModel = ModelBase & { type: "typeAlias" };
export type Model = InterfaceModel | TypeAliasModel;

export class ModelParser extends Parser {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  getModels() {
    const models: Model[] = [];
    const modelNameToModelMap = new Map<string, Model>();
    const dependencyMap = new Map<string, Set<Model>>();

    // first pass: build nodes and models
    const items: ({ id: string; name: string; type: ts.Type } & (
      | { model: InterfaceModel; node: ParsedInterface }
      | { model: TypeAliasModel; node: ParsedTypeAlias }
    ))[] = [];
    for (const _interface of this.interfaces) {
      const name = _interface.name;
      const type = _interface.declaration.getType().compilerType;

      const model: InterfaceModel = {
        id: name,
        name,
        schema: [],
        dependencies: [],
        dependants: [],
        type: "interface",
      };
      models.push(model);

      modelNameToModelMap.set(model.id, model);
      items.push({ id: name, name, node: _interface, type, model });
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
      };
      models.push(model);

      modelNameToModelMap.set(model.id, model);
      items.push({ id: name, name, node: typeAlias, type, model });
    }

    // second pass: parse schema
    for (const item of items) {
      const model = modelNameToModelMap.get(item.name);
      if (!model) continue;

      // bail if it doesn't have a symbol
      if (!item.type.symbol) continue;

      const dependencies = dependencyMap.get(item.name) ?? new Set<Model>();

      for (const prop of item.type.getProperties()) {
        const propDeclaration = prop.valueDeclaration as ts.PropertyDeclaration | ts.PropertySignature;
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
              typeModel ?? this.tsChecker.typeToString(this.tsChecker.getTypeFromTypeNode(elementType)),
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
                this.tsChecker.typeToString(this.tsChecker.getTypeFromTypeNode(propDeclaration.type)),
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
            const typeArgumentNode = this.tsChecker.getTypeFromTypeNode(typeArgument);

            if (ts.isTypeReferenceNode(typeArgument)) {
              const typeArgumentName = typeArgument.typeName.getText();
              const typeArgumentModel = modelNameToModelMap.get(typeArgumentName);

              schemaField.arguments.push(typeArgumentModel ?? typeArgumentName);
              if (typeArgumentModel) dependencies.add(typeArgumentModel);
              continue;
            }

            schemaField.arguments.push(this.tsChecker.typeToString(typeArgumentNode));
          }

          model.schema.push(schemaField);
          continue;
        }

        // default
        model.schema.push({
          name: prop.name,
          type: this.tsChecker.typeToString(this.tsChecker.getTypeFromTypeNode(propDeclaration.type)),
        });
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
