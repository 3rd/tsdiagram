import { JSX, memo, useEffect, useId, useMemo, useRef } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import classNames from "classnames";
import {
  isArraySchemaField,
  isFunctionSchemaField,
  isGenericSchemaField,
  isUnionSchemaField,
  Model,
} from "../../lib/parser/model-types";
import { graphStore, useIsBadgeHubHovered, useNodeDecoration } from "../../stores/graph";
import { useUserOptions } from "../../stores/user-options";
import { fieldHasSourceEdge, getTypeAliasHeaderDependencies } from "./layout";
import { usePortColor } from "./port-colors";

export type ModelNodeProps = {
  id: string;
  data: { model: Model; badgeHubIds: ReadonlySet<string> };
};

const isModelReference = (value: unknown): value is Model => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Model>;
  return typeof candidate.name === "string" && typeof candidate.type === "string";
};

const MODEL_NODE_CLASSES = {
  root: "max-w-md rounded-t-lg shadow-md",
  field: {
    root: "odd:bg-white even:bg-gray-50 text-sm leading-5",
    keyCell: "py-1 pr-4 pl-2 text-gray-950 align-top",
    typeCell: "relative py-1 pr-2 break-words",
    defaultTypeColor: "text-gray-800",
    modelTypeColor: "text-blue-700",
  },
} as const;

const SourcePort = ({ portId }: { portId: string }) => {
  const color = usePortColor(portId) ?? "var(--color-blue-700)";
  return (
    <svg className="model-node-port" aria-hidden>
      <circle cx="4" cy="4" fill="#fff" r="3.6" />
      <circle cx="4" cy="4" fill="#fff" r="2.4" stroke={color} strokeWidth="1.2" />
    </svg>
  );
};
const TargetPort = ({ portId }: { portId: string }) => {
  const color = usePortColor(portId) ?? "var(--color-blue-700)";
  return (
    <svg className="model-node-port" aria-hidden>
      <circle cx="4" cy="4" fill="#fff" r="3.6" />
      <circle cx="4" cy="4" fill={color} r="3" />
    </svg>
  );
};

const HubBadgePill = ({ refModel }: { refModel: Model }) => {
  const pillId = useId();
  const isHovered = useIsBadgeHubHovered(refModel.id);
  // a reparse can unmount the hovered pill without a mouseleave; clear the hub hover so
  // the remaining pills of the hub do not stay highlighted
  useEffect(() => {
    return () => {
      graphStore.state.clearHoveredBadgeHub(pillId);
    };
  }, [pillId]);
  const handleMouseEnter = () => {
    graphStore.state.setHoveredBadgeHub(refModel.id, pillId);
  };
  const handleMouseLeave = () => {
    graphStore.state.clearHoveredBadgeHub(pillId);
  };
  return (
    <span
      className={classNames(
        "cursor-default rounded-md px-1.5 py-0.5 text-xs font-medium",
        isHovered ? "bg-blue-200 text-blue-900" : "bg-gray-200 text-gray-700",
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {refModel.name}
    </span>
  );
};

const TypeNameSpan = ({ badgeHubIds, refModel }: { badgeHubIds: ReadonlySet<string>; refModel: Model }) => {
  if (badgeHubIds.has(refModel.id)) return <HubBadgePill key={refModel.id} refModel={refModel} />;
  return <span className={MODEL_NODE_CLASSES.field.modelTypeColor}>{refModel.name}</span>;
};

const ModelNodeContent = ({ id, data }: ModelNodeProps) => {
  const { model, badgeHubIds } = data;
  const options = useUserOptions();
  const decoration = useNodeDecoration(model);

  const hasSourceHandle = useMemo(() => {
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
  }, [badgeHubIds, model]);

  const hasTargetHandle = useMemo(() => model.dependants.length > 0, [model.dependants]);

  const renderedHandleKey = useMemo(() => {
    const keys = [hasTargetHandle ? "target" : "", hasSourceHandle ? "source" : ""];
    for (const field of model.schema) if (fieldHasSourceEdge(field, badgeHubIds)) keys.push(field.name);
    return keys.join("|");
  }, [badgeHubIds, hasSourceHandle, hasTargetHandle, model.schema]);
  const updateNodeInternals = useUpdateNodeInternals();
  const mountedHandleKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (mountedHandleKeyRef.current !== null && mountedHandleKeyRef.current !== renderedHandleKey) {
      updateNodeInternals(id);
    }
    mountedHandleKeyRef.current = renderedHandleKey;
  }, [id, renderedHandleKey, updateNodeInternals]);

  const headerClasses = useMemo(() => {
    const isDarkTheme = options.renderer.theme === "dark";
    const isLightTheme = options.renderer.theme === "light";
    const selected = decoration === "selected";
    const highlighted = decoration === "highlighted";
    return {
      root: classNames(
        MODEL_NODE_CLASSES.root,
        model.schema.length === 0 && "rounded-b-lg",
        decoration === "dimmed" && "opacity-50",
      ),
      header: classNames(
        "relative rounded-t-lg px-2 py-1 font-medium text-white",
        selected && "bg-indigo-600",
        isLightTheme && !selected && (highlighted ? "bg-blue-500" : "bg-blue-700"),
        isDarkTheme && !selected && (highlighted ? "bg-blue-500" : "bg-blue-600"),
        model.schema.length === 0 ? "rounded-b-lg" : "svg-export-header",
      ),
      fieldsWrapper: classNames(
        "model-node-fields flex flex-col border-x border-b bg-white",
        selected && "border-indigo-600",
        highlighted && "border-blue-500",
        !selected && !highlighted && "border-gray-300",
      ),
    };
  }, [decoration, model.schema.length, options.renderer.theme]);

  const fieldRows = useMemo(() => {
    const fieldNamesWithSourceEdge = new Set<string>();
    for (const field of model.schema) {
      if (fieldHasSourceEdge(field, badgeHubIds)) fieldNamesWithSourceEdge.add(field.name);
    }
    const seenFieldNames = new Set<string>();
    return model.schema.map((field, fieldIndex) => {
      const isDuplicateFieldName = seenFieldNames.has(field.name);
      seenFieldNames.add(field.name);
      const keyFragments: JSX.Element[] = [];
      if (field.modifiers && field.modifiers.length > 0) {
        keyFragments.push(
          <span
            key={`${model.id}-${field.name}-modifiers`}
            className={MODEL_NODE_CLASSES.field.defaultTypeColor}
          >
            {`${field.modifiers.join(" ")} `}
          </span>,
        );
      }
      keyFragments.push(<span key={`${model.id}-${field.name}`}>{field.name}</span>);
      const typeFragments: JSX.Element[] = [];

      const hasFieldSourceHandle = fieldNamesWithSourceEdge.has(field.name);

      if (field.optional) {
        keyFragments.push(
          <span
            key={`${model.id}-${field.name}-optional`}
            className={MODEL_NODE_CLASSES.field.defaultTypeColor}
          >
            ?
          </span>,
        );
      }

      if (isModelReference(field.type)) {
        typeFragments.push(<TypeNameSpan key="reference" badgeHubIds={badgeHubIds} refModel={field.type} />);
      } else if (isArraySchemaField(field)) {
        if (isModelReference(field.elementType)) {
          typeFragments.push(
            <span key="array-reference" className={MODEL_NODE_CLASSES.field.modelTypeColor}>
              <TypeNameSpan badgeHubIds={badgeHubIds} refModel={field.elementType} />
              []
            </span>,
          );
        } else {
          const elementText = String(field.elementType);
          const needsParens = elementText.includes("|") || elementText.includes("&");
          typeFragments.push(
            <span key="array-primitive" className={MODEL_NODE_CLASSES.field.defaultTypeColor}>
              {needsParens ? `(${elementText})[]` : `${elementText}[]`}
            </span>,
          );
        }
      } else if (isGenericSchemaField(field)) {
        const argumentFragments: JSX.Element[] = [];

        for (let i = 0; i < field.arguments.length; i++) {
          const argument = field.arguments[i];
          const argumentKey = `${model.id}-${field.name}-${
            isModelReference(argument) ? argument.name : argument
          }-${i}`;

          if (isModelReference(argument)) {
            argumentFragments.push(
              <TypeNameSpan key={argumentKey} badgeHubIds={badgeHubIds} refModel={argument} />,
            );
          } else {
            argumentFragments.push(
              <span key={argumentKey} className={MODEL_NODE_CLASSES.field.defaultTypeColor}>
                {argument}
              </span>,
            );
          }
        }

        typeFragments.push(
          <span
            key="prefix"
            className={MODEL_NODE_CLASSES.field.defaultTypeColor}
          >{`${field.genericName}<`}</span>,
          <span key="generic" className={MODEL_NODE_CLASSES.field.modelTypeColor}>
            {argumentFragments.map((fragment, index) => (
              <span key={fragment.key}>
                {fragment}
                {index < argumentFragments.length - 1 && ", "}
              </span>
            ))}
          </span>,
          <span key="suffix" className={MODEL_NODE_CLASSES.field.defaultTypeColor}>
            {">"}
          </span>,
        );
      } else if (isFunctionSchemaField(field)) {
        keyFragments.push(
          <span
            key={`${model.id}-${field.name}-arguments-start`}
            className={MODEL_NODE_CLASSES.field.defaultTypeColor}
          >
            (
          </span>,
        );

        const argumentFragments: JSX.Element[] = [];
        for (const argument of field.arguments) {
          const argumentKey = `${model.id}-${field.name}-${argument.name}`;
          if (isModelReference(argument.type)) {
            argumentFragments.push(
              <span key={argumentKey}>
                {argument.name}: <TypeNameSpan badgeHubIds={badgeHubIds} refModel={argument.type} />
              </span>,
            );
          } else {
            argumentFragments.push(
              <span key={argumentKey}>
                {argument.name}:
                <span className={MODEL_NODE_CLASSES.field.defaultTypeColor}> {argument.type}</span>
              </span>,
            );
          }
        }

        keyFragments.push(
          <span key={`${model.id}-${field.name}-arguments`}>
            {argumentFragments.map((fragment, index) => (
              <span key={fragment.key}>
                {fragment}
                {index < argumentFragments.length - 1 && ", "}
              </span>
            ))}
          </span>,
        );

        keyFragments.push(
          <span
            key={`${model.id}-${field.name}-arguments-end`}
            className={MODEL_NODE_CLASSES.field.defaultTypeColor}
          >
            )
          </span>,
        );

        const returnTypeKey = `${model.id}-${field.name}-return`;

        if (Array.isArray(field.returnType)) {
          const [returnType] = field.returnType;

          if (isModelReference(returnType)) {
            typeFragments.push(
              <span key={returnTypeKey} className={MODEL_NODE_CLASSES.field.modelTypeColor}>
                <TypeNameSpan badgeHubIds={badgeHubIds} refModel={returnType} />
                []
              </span>,
            );
          } else {
            typeFragments.push(
              <span key={returnTypeKey} className={MODEL_NODE_CLASSES.field.defaultTypeColor}>
                {returnType}[]
              </span>,
            );
          }
        } else if (isModelReference(field.returnType)) {
          typeFragments.push(
            <TypeNameSpan key={returnTypeKey} badgeHubIds={badgeHubIds} refModel={field.returnType} />,
          );
        } else {
          typeFragments.push(
            <span key={returnTypeKey} className={MODEL_NODE_CLASSES.field.defaultTypeColor}>
              {field.returnType}
            </span>,
          );
        }
      } else if (isUnionSchemaField(field)) {
        const unionFragments: JSX.Element[] = [];

        for (let i = 0; i < field.types.length; i++) {
          const type = field.types[i];
          const typeKey = `${model.id}-${field.name}-${isModelReference(type) ? type.name : type}-${i}`;

          if (isModelReference(type)) {
            unionFragments.push(<TypeNameSpan key={typeKey} badgeHubIds={badgeHubIds} refModel={type} />);
          } else {
            unionFragments.push(
              <span key={typeKey} className={MODEL_NODE_CLASSES.field.defaultTypeColor}>
                {type}
              </span>,
            );
          }
        }

        typeFragments.push(
          <span key="union" className={MODEL_NODE_CLASSES.field.defaultTypeColor}>
            {unionFragments.map((fragment, index) => (
              <span key={fragment.key}>
                {fragment}
                {index < unionFragments.length - 1 && " | "}
              </span>
            ))}
          </span>,
        );
      } else {
        typeFragments.push(
          <span key={`${model.id}-${field.name}-type`} className={MODEL_NODE_CLASSES.field.defaultTypeColor}>
            {field.type}
          </span>,
        );
      }

      return (
        <tr key={`${model.id}-${field.name}-${fieldIndex}`} className={MODEL_NODE_CLASSES.field.root}>
          <td className={MODEL_NODE_CLASSES.field.keyCell}>{keyFragments}</td>
          <td align="right" className={MODEL_NODE_CLASSES.field.typeCell}>
            {typeFragments}
            {!isDuplicateFieldName && hasFieldSourceHandle && (
              <Handle id={`${model.id}-source-${field.name}`} position={Position.Right} type="source">
                <SourcePort portId={`${model.id}-source-${field.name}`} />
              </Handle>
            )}
          </td>
        </tr>
      );
    });
  }, [badgeHubIds, model.id, model.schema]);

  const modelName = useMemo(() => {
    const nameParts = [model.name];

    if (model.type === "class" && model.isAbstract) {
      nameParts.unshift("abstract ");
    }

    if (model.arguments.length > 0) {
      const argumentsParts = [];
      for (const argument of model.arguments) {
        let argumentStr = argument.name;
        if (argument.extends) {
          argumentStr += ` extends ${argument.extends}`;
        }
        if (argument.default) {
          argumentStr += ` = ${argument.default}`;
        }
        argumentsParts.push(argumentStr);
      }
      nameParts.push(`<${argumentsParts.join(", ")}>`);
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
  }, [model]);

  return (
    <div key={id} className={headerClasses.root}>
      <div className={headerClasses.header}>
        {hasTargetHandle && (
          <Handle id={`${model.id}-target`} position={Position.Left} type="target">
            <TargetPort portId={`${model.id}-target`} />
          </Handle>
        )}
        {modelName}
        {hasSourceHandle && (
          <Handle id={`${model.id}-source`} position={Position.Right} type="source">
            <SourcePort portId={`${model.id}-source`} />
          </Handle>
        )}
      </div>
      {model.schema.length > 0 && (
        <div className={headerClasses.fieldsWrapper}>
          <table>
            <tbody>{fieldRows}</tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const ModelNode = memo(
  ModelNodeContent,
  (previous, next) => previous.id === next.id && previous.data === next.data,
);
ModelNode.displayName = "ModelNode";
