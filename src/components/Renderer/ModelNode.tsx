import { useMemo } from "react";
import { Position } from "reactflow";
import classNames from "classnames";
import {
  Model,
  isArraySchemaField,
  isFunctionSchemaField,
  isGenericSchemaField,
  isUnionSchemaField,
} from "../../lib/parser/ModelParser";
import { useUserOptions } from "../../stores/user-options";
import { CustomHandle } from "./CustomHandle";

export type ModelNodeProps = {
  id: string;
  data: {
    model: Model;
    highlighted: boolean;
  };
};

export const ModelNode = ({ id, data }: ModelNodeProps) => {
  const { model, highlighted } = data;
  const options = useUserOptions();

  const hasSourceHandle = useMemo(() => {
    if (model.type === "interface") {
      return model.extends.some((item) => item instanceof Object);
    }
    if (model.type === "class") {
      return model.extends instanceof Object || model.implements.some((item) => item instanceof Object);
    }
    return false;
  }, [model]);

  const hasTargetHandle = useMemo(() => model.dependants.length > 0, [model.dependants]);

  const classes = useMemo(() => {
    const isDarkTheme = options.renderer.theme === "dark";
    const isLightTheme = options.renderer.theme === "light";
    return {
      root: classNames("shadow-md"),
      header: classNames(
        "relative px-1.5 py-0.5 text-white rounded-t",
        isLightTheme && (highlighted ? "bg-blue-500" : "bg-blue-700"),
        isDarkTheme && (highlighted ? "bg-blue-500" : "bg-blue-600"),
        {
          "rounded-b": model.schema.length === 0,
        }
      ),
      fieldsWrapper: classNames(
        "bg-gray-50 flex flex-col",
        isLightTheme && highlighted
          ? "border-x border-b border-blue-500"
          : "border-x border-b border-blue-800"
      ),
      field: {
        root: classNames("odd:bg-gray-50 even:bg-gray-100 leading-tight text-sm"),
        keyCell: classNames("pr-4 pl-2 text-gray-950"),
        typeCell: classNames("relative pr-2"),
        defaultTypeColor: classNames("text-gray-800"),
        modelTypeColor: classNames("text-blue-700"),
      },
      handles: {
        source: classNames("w-2 h-2 bg-stone-400 border-none z-[-10]"),
        target: classNames("w-2 h-2 bg-blue-500"),
      },
    };
  }, [highlighted, model.schema.length, options.renderer.theme]);

  // eslint-disable-next-line sonarjs/cognitive-complexity
  const fieldRows = useMemo(() => {
    return model.schema.map((field) => {
      const keyFragments: JSX.Element[] = [<span key={`${model.id}-${field.name}`}>{field.name}</span>];
      const typeFragments: JSX.Element[] = [];

      let hasFieldSourceHandle = false;

      if (field.optional) {
        keyFragments.push(
          <span key={`${model.id}-${field.name}-optional`} className={classes.field.defaultTypeColor}>
            ?
          </span>
        );
      }

      // reference
      if (field.type instanceof Object) {
        hasFieldSourceHandle = true;
        typeFragments.push(
          <span key="reference" className={classes.field.modelTypeColor}>
            {field.type.name}
          </span>
        );
      }
      // array
      else if (isArraySchemaField(field)) {
        // of model references
        if (field.elementType instanceof Object) {
          hasFieldSourceHandle = true;
          typeFragments.push(
            <span key="array-reference" className={classes.field.modelTypeColor}>
              {field.elementType.name}[]
            </span>
          );
        } else {
          // of primitives
          typeFragments.push(
            <span
              key="array-primitive"
              className={classes.field.defaultTypeColor}
            >{`${field.elementType}[]`}</span>
          );
        }
      } else if (isGenericSchemaField(field)) {
        // generics
        const argumentFragments: JSX.Element[] = [];

        for (let i = 0; i < field.arguments.length; i++) {
          const argument = field.arguments[i];
          const argumentKey = `${model.id}-${field.name}-${
            argument instanceof Object ? argument.name : argument
          }-${i}`;

          // of model references
          if (argument instanceof Object) {
            hasFieldSourceHandle = true;
            argumentFragments.push(
              <span key={argumentKey} className={classes.field.modelTypeColor}>
                {argument.name}
              </span>
            );
          } else {
            // of primitives
            argumentFragments.push(
              <span key={argumentKey} className={classes.field.defaultTypeColor}>
                {argument}
              </span>
            );
          }
        }

        // add separated by ", "
        typeFragments.push(
          <span key="prefix" className={classes.field.defaultTypeColor}>{`${field.genericName}<`}</span>,
          <span key="generic" className={classes.field.modelTypeColor}>
            {argumentFragments.map((fragment, index) => (
              <span key={fragment.key}>
                {fragment}
                {index < argumentFragments.length - 1 && ", "}
              </span>
            ))}
          </span>,
          <span key="suffix" className={classes.field.defaultTypeColor}>
            {">"}
          </span>
        );
      } else if (isFunctionSchemaField(field)) {
        // change key fragments
        keyFragments.push(
          <span key={`${model.id}-${field.name}-arguments-start`} className={classes.field.defaultTypeColor}>
            (
          </span>
        );

        for (const argument of field.arguments) {
          const argumentKey = `${model.id}-${field.name}-${argument.name}`;
          if (argument.type instanceof Object) {
            hasFieldSourceHandle = true;

            keyFragments.push(
              <span key={argumentKey}>
                {argument.name}:<span className={classes.field.modelTypeColor}> {argument.type.name}</span>
              </span>
            );
          } else {
            keyFragments.push(
              <span key={argumentKey}>
                {argument.name}:<span className={classes.field.defaultTypeColor}> {argument.type}</span>
              </span>
            );
          }
        }
        keyFragments.push(
          <span key={`${model.id}-${field.name}-arguments-end`} className={classes.field.defaultTypeColor}>
            )
          </span>
        );

        const returnTypeKey = `${model.id}-${field.name}-return`;

        if (Array.isArray(field.returnType)) {
          const [returnType] = field.returnType;

          if (returnType instanceof Object) {
            hasFieldSourceHandle = true;
            typeFragments.push(
              <span key={returnTypeKey} className={classes.field.modelTypeColor}>
                {returnType.name}[]
              </span>
            );
          } else {
            typeFragments.push(
              <span key={returnTypeKey} className={classes.field.defaultTypeColor}>
                {returnType}[]
              </span>
            );
          }
        } else if (field.returnType instanceof Object) {
          hasFieldSourceHandle = true;

          typeFragments.push(
            <span key={returnTypeKey} className={classes.field.modelTypeColor}>
              {field.returnType.name}
            </span>
          );
        } else {
          typeFragments.push(
            <span key={returnTypeKey} className={classes.field.defaultTypeColor}>
              {field.returnType}
            </span>
          );
        }
      } else if (isUnionSchemaField(field)) {
        const unionFragments: JSX.Element[] = [];

        for (let i = 0; i < field.types.length; i++) {
          const type = field.types[i];
          const typeKey = `${model.id}-${field.name}-${type instanceof Object ? type.name : type}-${i}`;

          // of model references
          if (type instanceof Object) {
            hasFieldSourceHandle = true;
            unionFragments.push(
              <span key={typeKey} className={classes.field.modelTypeColor}>
                {type.name}
              </span>
            );
          } else {
            // of primitives
            unionFragments.push(
              <span key={typeKey} className={classes.field.defaultTypeColor}>
                {type}
              </span>
            );
          }
        }

        // add separated by " | "
        typeFragments.push(
          <span key="union" className={classes.field.defaultTypeColor}>
            {unionFragments.map((fragment, index) => (
              <span key={fragment.key}>
                {fragment}
                {index < unionFragments.length - 1 && " | "}
              </span>
            ))}
          </span>
        );
      } else {
        // default
        typeFragments.push(
          <span key={`${model.id}-${field.name}-type`} className={classes.field.defaultTypeColor}>
            {field.type}
          </span>
        );
      }

      return (
        <tr key={`${model.id}-${field.name}`} className={classes.field.root}>
          <td className={classes.field.keyCell}>{keyFragments}</td>
          <td align="right" className={classes.field.typeCell}>
            {typeFragments}
            <CustomHandle
              className={classNames(classes.handles.source, {
                hidden: !hasFieldSourceHandle,
              })}
              id={`${model.id}-source-${field.name}`}
              position={Position.Right}
              type="source"
            />
          </td>
        </tr>
      );
    });
  }, [classes, model.id, model.schema]);

  const modelName = useMemo(() => {
    const nameParts = [model.name];

    if (model.arguments.length > 0) {
      const argumentsParts = [];
      for (const argument of model.arguments) {
        let argumentStr = argument.name;
        if (argument.extends) {
          argumentStr += ` extends ${argument.extends}`;
        }
        argumentsParts.push(argumentStr);
      }
      nameParts.push(`<${argumentsParts.join(", ")}>`);
    }

    if (model.type === "interface" && model.extends.length > 0) {
      const extendParts = [];
      for (const extendedItem of model.extends) {
        extendParts.push(extendedItem instanceof Object ? extendedItem.name : extendedItem);
      }
      nameParts.push(` extends ${extendParts.join(", ")}`);
    }

    if (model.type === "class" && model.extends) {
      nameParts.push(` extends ${model.extends instanceof Object ? model.extends.name : model.extends}`);
    }

    if (model.type === "class" && model.implements.length > 0) {
      const implementParts = [];
      for (const implementedItem of model.implements) {
        implementParts.push(implementedItem instanceof Object ? implementedItem.name : implementedItem);
      }
      nameParts.push(` implements ${implementParts.join(", ")}`);
    }

    return nameParts.join("");
  }, [model]);

  return (
    <div key={id} className={classes.root}>
      {/* header */}
      <div className={classes.header}>
        {/* target handle */}
        <CustomHandle
          className={classNames(classes.handles.target, {
            hidden: !hasTargetHandle,
          })}
          id={`${model.id}-target`}
          position={Position.Left}
          type="target"
        />
        {/* title */}
        {modelName}
        {/* source handle */}
        <CustomHandle
          className={classNames(classes.handles.source, {
            hidden: !hasSourceHandle,
          })}
          id={`${model.id}-source`}
          position={Position.Right}
          type="source"
        />
      </div>
      {/* fields */}
      {model.schema.length > 0 && (
        <div className={classes.fieldsWrapper}>
          <table cellPadding="3">
            <tbody>{fieldRows}</tbody>
          </table>
        </div>
      )}
    </div>
  );
};
