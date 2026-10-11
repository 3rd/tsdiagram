import type { JSX, ReactNode } from "react";
import classNames from "classnames";
import {
  isArraySchemaField,
  isFunctionSchemaField,
  isGenericSchemaField,
  isUnionSchemaField,
  type FunctionSchemaField,
  type Model,
  type ModelTypeParameter,
  type TypeTextSegment,
} from "@tsdiagram/core/model";
import { fieldHasSourceEdge, getTypeAliasHeaderDependencies } from "../graph/layout";
import { ModelBadge } from "./ModelBadge";
import { ModelCardHandle } from "./ModelCardHandle";
import { MODEL_CARD_CLASSES } from "./ModelCard.styles";

type ModelCardDecoration = "dimmed" | "highlighted" | "none" | "selected";

export type ModelCardPort = {
  id: string;
  type: "source" | "target";
};

type RenderModelBadge = (model: Model) => ReactNode;

type RenderModelPort = (port: ModelCardPort) => ReactNode;

const isModelReference = (value: Model | string | undefined) => typeof value === "object";

const renderModelBadge: RenderModelBadge = (model) => <ModelBadge name={model.name} />;

const renderModelPort = (port: ModelCardPort) => <ModelCardHandle {...port} />;

type TypeNameSpanProps = {
  badgeHubIds: ReadonlySet<string>;
  refModel: Model;
  renderBadge: RenderModelBadge;
};

const TypeNameSpan = ({ badgeHubIds, refModel, renderBadge }: TypeNameSpanProps) => {
  if (badgeHubIds.has(refModel.id)) return renderBadge(refModel);
  return <span className={MODEL_CARD_CLASSES.field.modelTypeColor}>{refModel.name}</span>;
};

const TYPE_TEXT_COLORS = {
  primitive: MODEL_CARD_CLASSES.field.primitiveTypeColor,
  literal: MODEL_CARD_CLASSES.field.literalTypeColor,
  reference: MODEL_CARD_CLASSES.field.modelTypeColor,
};

const formatTypeParameters = (parameters: ModelTypeParameter[]) => {
  const parameterTexts = parameters.map((parameter) => {
    let text = parameter.name;

    if (parameter.extends) {
      text += ` extends ${parameter.extends}`;
    }

    if (parameter.default) {
      text += ` = ${parameter.default}`;
    }

    return text;
  });

  return `<${parameterTexts.join(", ")}>`;
};

type TypeTextProps = {
  segments: TypeTextSegment[];
};

const TypeText = ({ segments }: TypeTextProps) => (
  <span className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
    {segments.map((segment, index) => {
      if (segment.kind === "default") return segment.text;
      return (
        <span key={index} className={TYPE_TEXT_COLORS[segment.kind]}>
          {segment.text}
        </span>
      );
    })}
  </span>
);

const hasModelHeaderSource = (model: Model, badgeHubIds: ReadonlySet<string>) => {
  if (model.type === "interface") {
    return model.extends.some(isModelReference) || (model.headerRefs?.length ?? 0) > 0;
  }

  if (model.type === "class") {
    return (
      isModelReference(model.extends) ||
      model.implements.some(isModelReference) ||
      (model.headerRefs?.length ?? 0) > 0
    );
  }

  if (model.type === "typeAlias") {
    return getTypeAliasHeaderDependencies(model).some((dependency) => !badgeHubIds.has(dependency.id));
  }

  return false;
};

export const getModelCardPorts = (model: Model, badgeHubIds: ReadonlySet<string>) => {
  const sourceFieldNames = new Set(
    model.schema.filter((field) => fieldHasSourceEdge(field, badgeHubIds)).map((field) => field.name)
  );
  const fieldSourceHandleRows = new Map<string, number>();

  model.schema.forEach((field, index) => {
    const isFirstSourceRow = sourceFieldNames.has(field.name) && !fieldSourceHandleRows.has(field.name);
    if (isFirstSourceRow) {
      fieldSourceHandleRows.set(field.name, index);
    }
  });

  return {
    hasSourceHandle: hasModelHeaderSource(model, badgeHubIds),
    hasTargetHandle: model.dependants.length > 0,
    fieldSourceHandleRows,
  };
};

const formatModelName = (model: Model) => {
  const nameParts = [model.name];

  if (model.type === "class" && model.isAbstract) {
    nameParts.unshift("abstract ");
  }

  if (model.type === "function") {
    nameParts.unshift("\u0192 ");
  }

  if (model.arguments.length > 0) {
    nameParts.push(formatTypeParameters(model.arguments));
  }

  if (model.type === "interface" && model.extends.length > 0) {
    const extendParts = [];

    for (const extendedItem of model.extends) {
      extendParts.push(isModelReference(extendedItem) ? extendedItem.name : extendedItem);
    }

    nameParts.push(` extends ${extendParts.join(", ")}`);
  }

  if (model.type === "class" && model.extends) {
    nameParts.push(` extends ${isModelReference(model.extends) ? model.extends.name : model.extends}`);
  }

  if (model.type === "class" && model.implements.length > 0) {
    const implementParts = [];

    for (const implementedItem of model.implements) {
      implementParts.push(isModelReference(implementedItem) ? implementedItem.name : implementedItem);
    }

    nameParts.push(` implements ${implementParts.join(", ")}`);
  }

  return nameParts.join("");
};

const renderFunctionSignature = (
  field: FunctionSchemaField,
  modelId: string,
  renderType: (type: Model | string, key?: string) => JSX.Element
) => {
  const fragments: JSX.Element[] = [];

  if (field.typeParameters) {
    fragments.push(
      <span key={`${modelId}-${field.name}-type-parameters`}>
        {formatTypeParameters(field.typeParameters)}
      </span>
    );
  }

  fragments.push(
    <span
      key={`${modelId}-${field.name}-arguments-start`}
      className={MODEL_CARD_CLASSES.field.defaultTypeColor}
    >
      (
    </span>
  );

  const argumentFragments: JSX.Element[] = [];

  for (const argument of field.arguments) {
    const argumentKey = `${modelId}-${field.name}-${argument.name}`;
    const argumentName = `${argument.isRest ? "..." : ""}${argument.name}${argument.isOptional ? "?" : ""}`;
    argumentFragments.push(
      <span key={argumentKey}>
        {argumentName}
        <span className={MODEL_CARD_CLASSES.field.defaultTypeColor}>: </span>
        {renderType(argument.type)}
        {argument.initializer && ` = ${argument.initializer}`}
      </span>
    );
  }

  fragments.push(
    <span key={`${modelId}-${field.name}-arguments`}>
      {argumentFragments.map((fragment, index) => (
        <span key={fragment.key}>
          {fragment}
          {index < argumentFragments.length - 1 && (
            <span className={MODEL_CARD_CLASSES.field.defaultTypeColor}>, </span>
          )}
        </span>
      ))}
    </span>
  );

  fragments.push(
    <span
      key={`${modelId}-${field.name}-arguments-end`}
      className={MODEL_CARD_CLASSES.field.defaultTypeColor}
    >
      )
    </span>
  );

  return fragments;
};

type ModelFieldRowProps = {
  model: Model;
  field: Model["schema"][number];
  badgeHubIds: ReadonlySet<string>;
  hasSourceHandle: boolean;
  renderBadge: RenderModelBadge;
  renderPort: RenderModelPort;
};

const ModelFieldRow = ({
  model,
  field,
  badgeHubIds,
  hasSourceHandle,
  renderBadge,
  renderPort,
}: ModelFieldRowProps) => {
  const keyFragments: JSX.Element[] = [];

  const renderType = (type: Model | string, key?: string) => {
    if (isModelReference(type)) {
      return <TypeNameSpan key={key} badgeHubIds={badgeHubIds} renderBadge={renderBadge} refModel={type} />;
    }

    return <TypeText key={key} segments={model.typeTextSegments[type]} />;
  };

  if (field.modifiers && field.modifiers.length > 0) {
    keyFragments.push(
      <span key={`${model.id}-${field.name}-modifiers`} className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
        {`${field.modifiers.join(" ")} `}
      </span>
    );
  }

  if (isFunctionSchemaField(field) && field.accessor) {
    keyFragments.push(
      <span key={`${model.id}-${field.name}-accessor`} className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
        {field.accessor}{" "}
      </span>
    );
  }

  keyFragments.push(
    <span
      key={`${model.id}-${field.name}`}
      className={field.inherited ? MODEL_CARD_CLASSES.field.inheritedName : undefined}
    >
      {field.name}
    </span>
  );

  if (field.optional) {
    keyFragments.push(
      <span key={`${model.id}-${field.name}-optional`} className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
        ?
      </span>
    );
  }

  const typeFragments: JSX.Element[] = [];

  const isReadonlyArray =
    (isArraySchemaField(field) && field.readonly) ||
    (isFunctionSchemaField(field) && field.returnTypeReadonly);
  if (isReadonlyArray) {
    typeFragments.push(
      <span key="readonly" className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
        readonly{" "}
      </span>
    );
  }

  if (isModelReference(field.type)) {
    typeFragments.push(
      <TypeNameSpan
        key="reference"
        badgeHubIds={badgeHubIds}
        renderBadge={renderBadge}
        refModel={field.type}
      />
    );
  } else if (isArraySchemaField(field)) {
    if (isModelReference(field.elementType)) {
      typeFragments.push(
        <span key="array-reference" className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
          <TypeNameSpan badgeHubIds={badgeHubIds} renderBadge={renderBadge} refModel={field.elementType} />
          []
        </span>
      );
    } else {
      const elementText = String(field.elementType);
      const needsParens = elementText.includes("|") || elementText.includes("&");
      typeFragments.push(
        <span key="array-primitive" className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
          {needsParens && "("}
          <TypeText segments={model.typeTextSegments[elementText]} />
          {needsParens && ")"}
          []
        </span>
      );
    }
  } else if (isGenericSchemaField(field)) {
    const argumentFragments: JSX.Element[] = [];

    for (let i = 0; i < field.arguments.length; i++) {
      const argument = field.arguments[i];
      const argumentKey = `${model.id}-${field.name}-${
        isModelReference(argument) ? argument.name : argument
      }-${i}`;
      argumentFragments.push(renderType(argument, argumentKey));
    }

    typeFragments.push(
      <span key="prefix" className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
        <TypeText segments={model.typeTextSegments[field.genericName]} />
        {"<"}
      </span>,
      <span key="generic" className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
        {argumentFragments.map((fragment, index) => (
          <span key={fragment.key}>
            {fragment}
            {index < argumentFragments.length - 1 && ", "}
          </span>
        ))}
      </span>,
      <span key="suffix" className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
        {">"}
      </span>
    );
  } else if (isFunctionSchemaField(field)) {
    keyFragments.push(...renderFunctionSignature(field, model.id, renderType));

    const returnTypeKey = `${model.id}-${field.name}-return`;

    if (Array.isArray(field.returnType)) {
      const [returnType] = field.returnType;
      typeFragments.push(
        <span key={returnTypeKey} className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
          {renderType(returnType)}
          []
        </span>
      );
    } else {
      typeFragments.push(renderType(field.returnType, returnTypeKey));
    }
  } else if (isUnionSchemaField(field)) {
    const unionFragments: JSX.Element[] = [];

    for (let i = 0; i < field.types.length; i++) {
      const type = field.types[i];
      const typeKey = `${model.id}-${field.name}-${isModelReference(type) ? type.name : type}-${i}`;
      unionFragments.push(renderType(type, typeKey));
    }

    typeFragments.push(
      <span key="union" className={MODEL_CARD_CLASSES.field.defaultTypeColor}>
        {unionFragments.map((fragment, index) => (
          <span key={fragment.key}>
            {fragment}
            {index < unionFragments.length - 1 && " | "}
          </span>
        ))}
      </span>
    );
  } else {
    typeFragments.push(
      <TypeText key={`${model.id}-${field.name}-type`} segments={model.typeTextSegments[field.type]} />
    );
  }

  return (
    <tr className={MODEL_CARD_CLASSES.field.root} data-inherited={field.inherited}>
      <td className={MODEL_CARD_CLASSES.field.keyCell}>{keyFragments}</td>
      <td align="right" className={MODEL_CARD_CLASSES.field.typeCell}>
        {typeFragments}
        {hasSourceHandle && renderPort({ id: `${model.id}-source-${field.name}`, type: "source" })}
      </td>
    </tr>
  );
};

type ModelCardProps = {
  model: Model;
  badgeHubIds: ReadonlySet<string>;
  decoration?: ModelCardDecoration;
  renderBadge?: RenderModelBadge;
  renderPort?: RenderModelPort;
};

export const ModelCard = ({
  model,
  badgeHubIds,
  decoration = "none",
  renderBadge = renderModelBadge,
  renderPort = renderModelPort,
}: ModelCardProps) => {
  const { hasSourceHandle, hasTargetHandle, fieldSourceHandleRows } = getModelCardPorts(model, badgeHubIds);

  const isSelected = decoration === "selected";
  const isHighlighted = decoration === "highlighted";
  const isHot = isSelected || isHighlighted;
  const cardClasses = {
    root: classNames(
      MODEL_CARD_CLASSES.root,
      isSelected ? "bg-node-selected" : "bg-pane",
      isHot ? "border-accent" : "border-border",
      decoration === "dimmed" && "opacity-50"
    ),
    header: classNames(
      "relative -mx-px -mt-px rounded-t-lg px-2 py-1 text-title font-strong text-brand-fg",
      isSelected ? "bg-brand-strong" : "bg-brand",
      model.schema.length === 0 ? "-mb-px rounded-b-lg" : "svg-export-header"
    ),
    fieldsWrapper: "model-node-fields flex flex-col",
  };

  return (
    <div className={cardClasses.root}>
      <div className={cardClasses.header}>
        {hasTargetHandle && renderPort({ id: `${model.id}-target`, type: "target" })}
        {formatModelName(model)}
        {hasSourceHandle && renderPort({ id: `${model.id}-source`, type: "source" })}
      </div>
      {model.schema.length > 0 && (
        <div className={cardClasses.fieldsWrapper}>
          <table>
            <tbody>
              {model.schema.map((field, fieldIndex) => (
                <ModelFieldRow
                  key={`${model.id}-${field.name}-${fieldIndex}`}
                  model={model}
                  field={field}
                  badgeHubIds={badgeHubIds}
                  hasSourceHandle={fieldSourceHandleRows.get(field.name) === fieldIndex}
                  renderBadge={renderBadge}
                  renderPort={renderPort}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
