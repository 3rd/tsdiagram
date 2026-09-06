import {
  isArraySchemaField,
  isDefaultSchemaField,
  isFunctionSchemaField,
  isGenericSchemaField,
  isUnionSchemaField,
  Model,
} from "../../lib/parser/model-types";

const BADGE_HUB_ENTER_MIN = 6;
const BADGE_HUB_ENTER_RATIO = 0.12;
const BADGE_HUB_EXIT_FACTOR = 2 / 3;
const BADGE_HUB_EXIT_MIN = 3;

export const EMPTY_BADGE_HUB_IDS: ReadonlySet<string> = new Set();

const fieldValueReferencesModel = (value: Model | string, modelId: string): boolean =>
  typeof value === "object" && value.id === modelId;

const schemaFieldHasBadgePill = (model: Model, modelId: string): boolean => {
  return model.schema.some((field) => {
    if (isArraySchemaField(field)) return fieldValueReferencesModel(field.elementType, modelId);
    if (isGenericSchemaField(field)) {
      return field.arguments.some((argument) => fieldValueReferencesModel(argument, modelId));
    }
    if (isFunctionSchemaField(field)) {
      if (field.arguments.some((argument) => fieldValueReferencesModel(argument.type, modelId))) return true;
      if (Array.isArray(field.returnType)) {
        return fieldValueReferencesModel(field.returnType[0], modelId);
      }
      return fieldValueReferencesModel(field.returnType, modelId);
    }
    if (isUnionSchemaField(field)) {
      return field.types.some((type) => fieldValueReferencesModel(type, modelId));
    }
    return fieldValueReferencesModel(field.type, modelId);
  });
};

const modelHasTextOrHeaderReference = (model: Model, modelId: string): boolean => {
  if (model.schema.some((field) => field.typeRefs?.some((typeRef) => typeRef.id === modelId))) return true;
  if (model.type === "interface") {
    if (model.extends.some((extended) => typeof extended === "object" && extended.id === modelId)) {
      return true;
    }
    return model.headerRefs?.some((headerRef) => headerRef.id === modelId) ?? false;
  }
  if (model.type === "class") {
    if (typeof model.extends === "object" && model.extends.id === modelId) return true;
    if (
      model.implements.some((implemented) => typeof implemented === "object" && implemented.id === modelId)
    ) {
      return true;
    }
    return model.headerRefs?.some((headerRef) => headerRef.id === modelId) ?? false;
  }
  return false;
};

const isSimpleLeafAlias = (model: Model): boolean => {
  if (model.type !== "typeAlias" || model.schema.length !== 1 || model.dependencies.length > 0) return false;
  const field = model.schema[0];
  return (
    isDefaultSchemaField(field) &&
    field.name === "==>" &&
    typeof field.type === "string" &&
    !field.typeRefs?.length
  );
};

const everyRelationshipHasBadgePill = (model: Model): boolean => {
  return model.dependants.every(
    (dependant) =>
      !modelHasTextOrHeaderReference(dependant, model.id) && schemaFieldHasBadgePill(dependant, model.id),
  );
};

export const computeBadgeHubIds = (
  models: Model[],
  previousBadgeHubIds: ReadonlySet<string>,
): ReadonlySet<string> => {
  const enterThreshold = Math.max(BADGE_HUB_ENTER_MIN, Math.ceil(models.length * BADGE_HUB_ENTER_RATIO));
  const exitThreshold = Math.max(BADGE_HUB_EXIT_MIN, Math.floor(enterThreshold * BADGE_HUB_EXIT_FACTOR));

  const next = new Set<string>();
  for (const model of models) {
    if (!isSimpleLeafAlias(model)) continue;
    if (!everyRelationshipHasBadgePill(model)) continue;
    const inDegree = model.dependants.length;
    const threshold = previousBadgeHubIds.has(model.id) ? exitThreshold : enterThreshold;
    if (inDegree >= threshold) next.add(model.id);
  }

  const isUnchanged =
    next.size === previousBadgeHubIds.size && [...next].every((id) => previousBadgeHubIds.has(id));
  return isUnchanged ? previousBadgeHubIds : next;
};
