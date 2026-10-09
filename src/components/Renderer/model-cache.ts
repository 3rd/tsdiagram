import {
  isArraySchemaField,
  isFunctionSchemaField,
  isGenericSchemaField,
  isUnionSchemaField,
  Model,
} from "../../lib/parser/model-types";

type SchemaField = Model["schema"][number];

const refToken = (value: Model | string): string => {
  return typeof value === "string" ? value : `@${value.id}`;
};

const schemaFieldToken = (field: SchemaField) => {
  const shared = {
    name: field.name,
    optional: field.optional,
    inherited: field.inherited,
    modifiers: field.modifiers ?? null,
    typeRefs: field.typeRefs?.map((typeRef) => typeRef.id) ?? null,
  };
  if (isArraySchemaField(field)) {
    return { ...shared, kind: "array", elementType: refToken(field.elementType), readonly: field.readonly };
  }
  if (isGenericSchemaField(field)) {
    return {
      ...shared,
      kind: "generic",
      genericName: field.genericName,
      arguments: field.arguments.map(refToken),
    };
  }
  if (isFunctionSchemaField(field)) {
    return {
      ...shared,
      kind: "function",
      accessor: field.accessor,
      arguments: field.arguments.map((argument) => ({ ...argument, type: refToken(argument.type) })),
      typeParameters: field.typeParameters,
      returnType: Array.isArray(field.returnType)
        ? [refToken(field.returnType[0])]
        : refToken(field.returnType),
      returnTypeReadonly: field.returnTypeReadonly,
    };
  }
  if (isUnionSchemaField(field)) {
    return { ...shared, kind: "union", types: field.types.map(refToken) };
  }
  return { ...shared, kind: "default", type: refToken(field.type) };
};

const computeModelSignature = (model: Model): string => {
  const base = {
    id: model.id,
    name: model.name,
    type: model.type,
    arguments: model.arguments,
    schema: model.schema.map(schemaFieldToken),
    typeTextSegments: model.typeTextSegments,
    dependencies: model.dependencies.map((dependency) => dependency.id),
    dependants: model.dependants.map((dependant) => dependant.id),
  };
  if (model.type === "interface") {
    return JSON.stringify({
      ...base,
      extends: model.extends.map(refToken),
      headerRefs: model.headerRefs?.map((headerRef) => headerRef.id) ?? null,
    });
  }
  if (model.type === "class") {
    return JSON.stringify({
      ...base,
      extends: model.extends ? refToken(model.extends) : null,
      implements: model.implements.map(refToken),
      headerRefs: model.headerRefs?.map((headerRef) => headerRef.id) ?? null,
      isAbstract: model.isAbstract ?? false,
    });
  }
  return JSON.stringify(base);
};

const signatureCache = new WeakMap<Model, string>();

export const getModelSignature = (model: Model): string => {
  const cached = signatureCache.get(model);
  if (cached) return cached;
  const signature = computeModelSignature(model);
  signatureCache.set(model, signature);
  return signature;
};

export const reuseUnchangedModels = (previousModels: Model[], nextModels: Model[]): Model[] => {
  if (previousModels === nextModels) return previousModels;

  const previousById = new Map(previousModels.map((model) => [model.id, model]));
  const result = nextModels.map((model) => {
    const previous = previousById.get(model.id);
    if (previous && getModelSignature(previous) === getModelSignature(model)) {
      return previous;
    }
    return model;
  });

  const isIdenticalGeneration =
    previousModels.length === nextModels.length &&
    previousModels.every((model, index) => result[index] === model);

  return isIdenticalGeneration ? previousModels : result;
};
