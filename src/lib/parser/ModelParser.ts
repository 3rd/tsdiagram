import ts from "typescript";
import { Parser } from "./Parser";

export type Model = {
  id: string;
  name: string;
  schema: (
    | { name: string; type: "array"; elementType: Model | (string & {}) }
    | { name: string; type: "map"; keyType: Model | (string & {}); valueType: Model | (string & {}) }
    | { name: string; type: Model | (string & {}) }
  )[];
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

export class ModelParser extends Parser {
  getModels() {
    const typeIdToModelMap = new Map<string, Model>();

    const nodes = this.getTopLevelNodes().filter((node) => {
      if (ts.isInterfaceDeclaration(node)) return true;
      // if it's not a type literal, it's not a model
      // FIXME: proper access
      if (
        ts.isTypeAliasDeclaration(node) &&
        (node as { type?: ts.Node }).type?.kind === ts.SyntaxKind.TypeLiteral
      ) {
        return true;
      }
      return false;
    }) as (ts.InterfaceDeclaration | ts.TypeAliasDeclaration)[];

    // first pass
    for (const node of nodes) {
      const type = this.checker.getTypeAtLocation(node);
      const id = (type as unknown as { id: number }).id.toString();
      const model: Model = {
        id,
        name: node.name.getText(),
        schema: [],
      };
      typeIdToModelMap.set(id, model);
    }

    // second pass
    for (const node of nodes) {
      const type = this.checker.getTypeAtLocation(node);
      const typeId = (type as unknown as { id: number }).id.toString();
      const model = typeIdToModelMap.get(typeId);
      if (!model) continue;

      for (const prop of type.getProperties()) {
        const propDeclaration = prop.getDeclarations()?.[0] as ts.PropertyDeclaration | undefined;
        if (!propDeclaration) continue;

        // arrays
        if (propDeclaration.type && ts.isArrayTypeNode(propDeclaration.type)) {
          const elementType = propDeclaration.type.elementType;
          const elementTypeNode = this.checker.getTypeFromTypeNode(elementType);

          const elementTypeId = (elementTypeNode as unknown as { id: number }).id.toString();
          const elementModel = typeIdToModelMap.get(elementTypeId);

          model.schema.push({
            name: prop.name,
            type: "array",
            elementType: elementModel ?? this.checker.typeToString(elementTypeNode),
          });

          continue;
        }

        // maps (Record, Map, WeakMap)
        if (propDeclaration.type && ts.isTypeReferenceNode(propDeclaration.type)) {
          const typeArguments = propDeclaration.type.typeArguments;
          if (typeArguments?.length === 2) {
            const [keyType, valueType] = typeArguments;
            const keyTypeNode = this.checker.getTypeFromTypeNode(keyType);
            const keyTypeId = (keyTypeNode as unknown as { id: number }).id.toString();
            const valueTypeNode = this.checker.getTypeFromTypeNode(valueType);
            const valueTypeId = (valueTypeNode as unknown as { id: number }).id.toString();

            const keyModel = typeIdToModelMap.get(keyTypeId);
            const valueModel = typeIdToModelMap.get(valueTypeId);

            const typeName = this.checker.typeToString(
              this.checker.getTypeFromTypeNode(propDeclaration.type)
            );
            if (["Record", "Map", "WeakMap"].some((name) => typeName.startsWith(`${name}<`))) {
              model.schema.push({
                name: prop.name,
                type: "map",
                keyType: keyModel ?? this.checker.typeToString(keyTypeNode),
                valueType: valueModel ?? this.checker.typeToString(valueTypeNode),
              });
              continue;
            }
          }
        }

        // default
        const propTypeName = typeNodeToString(this.checker, propDeclaration);
        const propType = this.checker.getTypeOfSymbolAtLocation(prop, propDeclaration);
        const propTypeId = (propType as unknown as { id: number }).id.toString();
        model.schema.push({
          name: prop.name,
          type: typeIdToModelMap.get(propTypeId) ?? propTypeName,
        });
      }
    }

    return Array.from(typeIdToModelMap.values());
  }
}
