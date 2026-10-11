import {
  isArraySchemaField,
  isFunctionSchemaField,
  isGenericSchemaField,
  isUnionSchemaField,
  type Model,
  type ModelBase,
  type SchemaField,
} from "./model";
import type { DisplayValue, ModelProjection, ModelReference, ProjectedField } from "./projection";
import { collectTypeTextSegments } from "./type-text";

const createModel = (projection: ModelProjection) => {
  const base: ModelBase = {
    id: projection.id,
    name: projection.name,
    schema: [],
    arguments: projection.arguments,
    dependencies: [],
    dependants: [],
    typeTextSegments: {},
  };
  let model: Model;

  switch (projection.type) {
    case "interface": {
      model = { ...base, type: "interface", extends: [] };
      break;
    }
    case "class": {
      model = {
        ...base,
        type: "class",
        implements: [],
        ...(projection.isAbstract ? { isAbstract: true } : {}),
      };
      break;
    }
    case "typeAlias": {
      model = { ...base, type: "typeAlias" };
      break;
    }
    case "function": {
      model = { ...base, type: "function" };
      break;
    }
    case "enum": {
      model = { ...base, type: "enum" };
      break;
    }
  }

  return model;
};

export const materializeModelGraph = (projections: ModelProjection[]) => {
  const models = projections.map(createModel);
  const modelsById = new Map(models.map((model) => [model.id, model]));

  const resolveModel = (reference: ModelReference) => {
    const model = modelsById.get(reference.id);
    if (!model) {
      throw new Error(`Missing model ${reference.id}.`);
    }

    return model;
  };

  const resolveValue = (value: DisplayValue) => (typeof value === "string" ? value : resolveModel(value));

  const resolveField = (field: ProjectedField) => {
    const shared = {
      name: field.name,
      optional: field.optional,
      ...(field.inherited ? { inherited: true } : {}),
      ...(field.modifiers ? { modifiers: field.modifiers } : {}),
      ...(field.typeRefs ? { typeRefs: field.typeRefs.map(resolveModel) } : {}),
    };
    let result: SchemaField;

    if (isArraySchemaField(field)) {
      result = {
        ...shared,
        type: "array",
        elementType: resolveValue(field.elementType),
        ...(field.readonly ? { readonly: true } : {}),
      };
    } else if (isGenericSchemaField(field)) {
      result = {
        ...shared,
        type: "generic",
        genericName: field.genericName,
        arguments: field.arguments.map(resolveValue),
      };
    } else if (isFunctionSchemaField(field)) {
      result = {
        ...shared,
        type: "function",
        arguments: field.arguments.map((argument) => ({ ...argument, type: resolveValue(argument.type) })),
        returnType: Array.isArray(field.returnType)
          ? [resolveValue(field.returnType[0])]
          : resolveValue(field.returnType),
        ...(field.accessor ? { accessor: field.accessor } : {}),
        ...(field.typeParameters ? { typeParameters: field.typeParameters } : {}),
        ...(field.returnTypeReadonly ? { returnTypeReadonly: true } : {}),
      };
    } else if (isUnionSchemaField(field)) {
      result = { ...shared, type: "union", types: field.types.map(resolveValue) };
    } else {
      result = { ...shared, type: resolveValue(field.type) };
    }

    return result;
  };

  for (const projection of projections) {
    const model = resolveModel(projection);
    model.schema = projection.schema.map(resolveField);
    model.typeTextSegments = collectTypeTextSegments(model.schema);

    for (const id of projection.dependencyIds) {
      const dependency = resolveModel({ id });
      model.dependencies.push(dependency);
      dependency.dependants.push(model);
    }

    if (model.type === "interface") {
      model.extends = projection.extends.map(resolveValue);
    } else if (model.type === "class") {
      const base = projection.extends[0];
      if (base !== undefined) {
        model.extends = resolveValue(base);
      }

      model.implements = projection.implements.map(resolveValue);
    }

    const hasHeaderReferences =
      (model.type === "class" || model.type === "interface") && projection.headerRefs.length > 0;
    if (!hasHeaderReferences) continue;

    model.headerRefs = projection.headerRefs.map(resolveModel);
  }

  return models;
};
