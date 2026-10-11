export type SchemaFieldModifier = "abstract" | "private" | "protected" | "readonly" | "static";

export type SharedSchemaField<Reference = Model> = {
  name: string;
  optional: boolean;
  inherited?: boolean;
  modifiers?: SchemaFieldModifier[];
  typeRefs?: Reference[];
};

export type DefaultSchemaField<Reference = Model> = SharedSchemaField<Reference> & {
  type: Reference | string;
};

export type ArraySchemaField<Reference = Model> = SharedSchemaField<Reference> & {
  type: "array";
  elementType: Reference | string;
  readonly?: boolean;
};

export type GenericSchemaField<Reference = Model> = SharedSchemaField<Reference> & {
  type: "generic";
  genericName: string;
  arguments: (Reference | string)[];
};

export type ModelTypeParameter = { name: string; extends?: string; default?: string };

export type FunctionArgument<Reference = Model> = {
  name: string;
  type: Reference | string;
  isOptional?: boolean;
  isRest?: boolean;
  initializer?: string;
};

export type FunctionSchemaField<Reference = Model> = SharedSchemaField<Reference> & {
  type: "function";
  accessor?: "get" | "set";
  arguments: FunctionArgument<Reference>[];
  typeParameters?: ModelTypeParameter[];
  returnType: Reference | [Reference | string] | string;
  returnTypeReadonly?: boolean;
};

export type UnionSchemaField<Reference = Model> = SharedSchemaField<Reference> & {
  type: "union";
  types: (Reference | string)[];
};

export type SchemaField<Reference = Model> =
  | ArraySchemaField<Reference>
  | DefaultSchemaField<Reference>
  | FunctionSchemaField<Reference>
  | GenericSchemaField<Reference>
  | UnionSchemaField<Reference>;

export const isArraySchemaField = <Reference>(
  field: SchemaField<Reference>
): field is ArraySchemaField<Reference> => field.type === "array";

export const isGenericSchemaField = <Reference>(
  field: SchemaField<Reference>
): field is GenericSchemaField<Reference> => field.type === "generic";

export const isFunctionSchemaField = <Reference>(
  field: SchemaField<Reference>
): field is FunctionSchemaField<Reference> => field.type === "function";

export const isUnionSchemaField = <Reference>(
  field: SchemaField<Reference>
): field is UnionSchemaField<Reference> => field.type === "union";

export const isDefaultSchemaField = <Reference>(
  field: SchemaField<Reference>
): field is DefaultSchemaField<Reference> =>
  !isArraySchemaField(field) &&
  !isGenericSchemaField(field) &&
  !isFunctionSchemaField(field) &&
  !isUnionSchemaField(field);

export type TypeTextSegment = {
  text: string;
  kind: "default" | "primitive" | "literal" | "reference";
};

export type ModelBase = {
  id: string;
  name: string;
  schema: SchemaField[];
  typeTextSegments: Record<string, TypeTextSegment[]>;
  dependencies: Model[];
  dependants: Model[];
  arguments: ModelTypeParameter[];
};

export type InterfaceModel = ModelBase & {
  type: "interface";
  extends: (Model | string)[];
  headerRefs?: Model[];
};

export type TypeAliasModel = ModelBase & { type: "typeAlias" };

export type ClassModel = ModelBase & {
  type: "class";
  extends?: Model | string;
  implements: (Model | string)[];
  isAbstract?: boolean;
  headerRefs?: Model[];
};

export type EnumModel = ModelBase & { type: "enum" };
export type FunctionModel = ModelBase & { type: "function" };
export type Model = ClassModel | EnumModel | FunctionModel | InterfaceModel | TypeAliasModel;
