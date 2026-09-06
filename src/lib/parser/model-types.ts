export type SchemaFieldModifier = "abstract" | "private" | "protected" | "readonly" | "static";
export type SharedSchemaField = {
  name: string;
  optional: boolean;
  modifiers?: SchemaFieldModifier[];
  typeRefs?: Model[];
};
export type DefaultSchemaField = SharedSchemaField & { type: Model | string };
export type ArraySchemaField = SharedSchemaField & { type: "array"; elementType: Model | string };
export type GenericSchemaField = SharedSchemaField & {
  type: "generic";
  genericName: string;
  arguments: (Model | string)[];
};
export type FunctionSchemaField = SharedSchemaField & {
  type: "function";
  arguments: { name: string; type: Model | string }[];
  returnType: Model | [Model | string] | string;
};
export type UnionSchemaField = SharedSchemaField & { type: "union"; types: (Model | string)[] };
export type SchemaField =
  | ArraySchemaField
  | DefaultSchemaField
  | FunctionSchemaField
  | GenericSchemaField
  | UnionSchemaField;

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
  return (
    !isArraySchemaField(field) &&
    !isGenericSchemaField(field) &&
    !isFunctionSchemaField(field) &&
    !isUnionSchemaField(field)
  );
};

export type ModelBase = {
  id: string;
  name: string;
  schema: SchemaField[];
  dependencies: Model[];
  dependants: Model[];
  arguments: { name: string; extends?: string; default?: string }[];
};

export type InterfaceModel = ModelBase & {
  type: "interface";
  extends: (Model | ({} & string))[];
  headerRefs?: Model[];
};
export type TypeAliasModel = ModelBase & {
  type: "typeAlias";
};
export type ClassModel = ModelBase & {
  type: "class";
  extends?: Model | string;
  implements: (Model | ({} & string))[];
  isAbstract?: boolean;
  headerRefs?: Model[];
};
export type EnumModel = ModelBase & {
  type: "enum";
};

export type Model = ClassModel | EnumModel | InterfaceModel | TypeAliasModel;
