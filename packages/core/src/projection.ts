import type { Model, ModelTypeParameter, SchemaField } from "./model";

export type ModelReference = { id: string };
export type DisplayValue = ModelReference | string;
export type ProjectedField = SchemaField<ModelReference>;

export type ModelProjection = {
  id: string;
  name: string;
  type: Model["type"];
  arguments: ModelTypeParameter[];
  schema: ProjectedField[];
  dependencyIds: string[];
  extends: DisplayValue[];
  implements: DisplayValue[];
  headerRefs: ModelReference[];
  isAbstract: boolean;
};
