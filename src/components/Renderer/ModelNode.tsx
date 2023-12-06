import { useMemo } from "react";
import { Position } from "reactflow";
import classNames from "classnames";
import { Model, isArraySchemaField, isGenericSchemaField } from "../../lib/parser/ModelParser";
import { useUserOptions } from "../../stores/user-options";
import { CustomHandle } from "./CustomHandle";

export type ModelNodeProps = {
  id: string;
  data: { model: Model };
};

export const ModelNode = ({ id, data }: ModelNodeProps) => {
  const { model } = data;
  const options = useUserOptions();

  const hasTargetHandle = useMemo(() => model.dependants.length > 0, [model.dependants]);

  const classes = useMemo(() => {
    const isDarkTheme = options.renderer.theme === "dark";
    const isLightTheme = options.renderer.theme === "light";
    return {
      root: classNames("shadow-md"),
      header: classNames("relative px-1 pl-1.5 py-0.5 text-white rounded-t", {
        "bg-blue-700": isLightTheme,
        "bg-blue-600": isDarkTheme,
      }),
      fieldsWrapper: classNames("bg-gray-50 flex flex-col text-sm", {
        "border-x border-b border-blue-800": isLightTheme,
      }),
      field: {
        root: classNames("even:bg-gray-100 leading-tight"),
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
  }, [options.renderer.theme]);

  const fieldRows = useMemo(() => {
    return model.schema.map((field) => {
      const typeFragments: JSX.Element[] = [];

      let hasFieldSourceHandle = false;

      // model reference
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
      } else {
        // default
        typeFragments.push(
          <span key="default" className={classes.field.defaultTypeColor}>
            {field.type}
          </span>
        );
      }

      return (
        <tr key={`${model.id}-${field.name}`} className={classes.field.root}>
          <td className={classes.field.keyCell}>{field.name}</td>
          <td align="right" className={classes.field.typeCell}>
            {typeFragments}
            <CustomHandle
              className={classNames(classes.handles.source, {
                hidden: !hasFieldSourceHandle,
              })}
              id={`${model.id}-${field.name}`}
              position={Position.Right}
              type="source"
            />
          </td>
        </tr>
      );
    });
  }, [classes, model.id, model.schema]);

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
        {model.name}
      </div>
      {/* fields */}
      <div className={classes.fieldsWrapper}>
        <table cellPadding="3">
          <tbody>{fieldRows}</tbody>
        </table>
      </div>
    </div>
  );
};
